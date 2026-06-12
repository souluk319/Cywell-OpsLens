#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-install-approval-plan.json",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  installation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  dryRunEvidence: "test-results/cywell-opslens-operator-dry-run.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreviewEvidence: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  mvpEvidence: "test-results/cywell-opslens-mvp-0.1-gate.json",
  timeoutMs: 10000
};

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
    } else if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }
  return { flags, values };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  catalogSource: parsed.values.get("catalog-source") ?? defaults.catalogSource,
  subscription: parsed.values.get("subscription") ?? defaults.subscription,
  installation: parsed.values.get("installation") ?? defaults.installation,
  dryRunEvidence: parsed.values.get("dry-run-evidence") ?? defaults.dryRunEvidence,
  lightspeedReadinessEvidence:
    parsed.values.get("lightspeed-readiness-evidence") ?? defaults.lightspeedReadinessEvidence,
  lightspeedPatchPreviewEvidence:
    parsed.values.get("lightspeed-patch-preview-evidence") ?? defaults.lightspeedPatchPreviewEvidence,
  imageEvidence: parsed.values.get("image-evidence") ?? defaults.imageEvidence,
  mvpEvidence: parsed.values.get("mvp-evidence") ?? defaults.mvpEvidence,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function warn(name, detail) {
  record("WARN", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failureDetail);
  }
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim?.() ?? "",
      stderr: error.stderr?.trim?.() ?? error.message
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args);
  if (!result.ok || !result.stdout) {
    return fallback;
  }
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"]);
  if (!result.ok || !result.stdout) {
    return [];
  }
  return result.stdout.split(/\r?\n/);
}

async function loadSingleYaml(path) {
  const absolutePath = resolve(path);
  const text = await readFile(absolutePath, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${path}: ${errors.map((error) => error.message).join("; ")}`);
  }
  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  if (parsed.length !== 1) {
    throw new Error(`${path}: expected 1 YAML document, got ${parsed.length}`);
  }
  pass("YAML source", `${path} loaded`);
  return parsed[0];
}

function loadJsonArtifact(path, label, required = false) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    const detail = `${label} evidence is missing at ${absolutePath}`;
    if (required) {
      fail(label, detail);
    } else {
      warn(label, detail);
    }
    return undefined;
  }

  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function evidenceStatus(artifact) {
  return artifact?.status ?? "missing";
}

function command(id, phase, text, rationale, rollback, mutation = true) {
  return {
    id,
    phase,
    command: text,
    mutation,
    requiresExplicitApproval: mutation,
    rationale,
    rollback
  };
}

function buildCommands(subscription, installation) {
  const targetNamespace = subscription?.metadata?.namespace ?? "cywell-opslens";
  const catalogSourceName = "cywell-opslens-catalog";
  const subscriptionName = subscription?.metadata?.name ?? "cywell-opslens";
  const installationNamespace = installation?.metadata?.namespace ?? targetNamespace;
  const installationName = installation?.metadata?.name ?? "cywell-opslens";
  const olsConfigNamespace = installation?.spec?.lightspeedRegistration?.olsConfigNamespace ?? "openshift-lightspeed";
  const olsConfigName = installation?.spec?.lightspeedRegistration?.olsConfigName ?? "cluster";

  return [
    command(
      "run-operator-server-dry-run",
      "preflight",
      "npm run verify:operator:dry-run",
      "Validate install manifests with live server-side dry-run before any cluster mutation.",
      "No rollback is required for dry-run.",
      false
    ),
    command(
      "preview-lightspeed-patch",
      "preflight",
      "npm run verify:lightspeed:patch-preview",
      "Preview the OLSConfig MCPServer patch and rollback path without applying it.",
      "No rollback is required for patch preview.",
      false
    ),
    command(
      "apply-operator-namespace",
      "install-operator",
      `oc create namespace ${targetNamespace} --dry-run=server -o yaml | oc apply -f -`,
      "Create the target namespace only after dry-run and human approval.",
      `oc delete namespace ${targetNamespace} after confirming no retained PVC data is required`
    ),
    command(
      "apply-catalogsource",
      "install-operator",
      "oc apply -f deploy/catalog/openshift/catalogsource.yaml",
      "Register the internal Cywell OpsLens catalog source.",
      `oc delete catalogsource ${catalogSourceName} -n openshift-marketplace`
    ),
    command(
      "apply-subscription",
      "install-operator",
      "oc apply -f deploy/catalog/openshift/subscription.yaml",
      "Create a Manual OLM subscription so InstallPlans stay human-approved.",
      `oc delete subscription ${subscriptionName} -n ${targetNamespace}`
    ),
    command(
      "approve-installplan",
      "install-operator",
      `oc patch installplan <installplan-name> -n ${targetNamespace} --type merge -p '{"spec":{"approved":true}}'`,
      "Approve the generated InstallPlan only after reviewing the CSV and related images.",
      `oc delete csv cywell-opslens-operator.v0.1.0 -n ${targetNamespace}`
    ),
    command(
      "apply-opslensinstallation",
      "install-stack",
      "oc apply -f deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
      "Create the OpsLensInstallation CR that asks the Operator to reconcile API, dashboard, vector store, model runtime, ConsolePlugin, and explicit Lightspeed registration.",
      `oc delete opslensinstallation ${installationName} -n ${installationNamespace}`
    ),
    command(
      "verify-console-plugin",
      "post-install-verify",
      "oc get consoleplugin cywell-opslens -o yaml",
      "Confirm the ConsolePlugin object exists and points to the dashboard service backend.",
      "No rollback is required for read-only verification.",
      false
    ),
    command(
      "verify-lightspeed-registration",
      "post-install-verify",
      `oc get olsconfig ${olsConfigName} -n ${olsConfigNamespace} -o yaml`,
      "Confirm MCPServer feature gate and cywell-opslens MCP server registration are present after explicit PatchOLSConfig reconciliation.",
      "No rollback is required for read-only verification.",
      false
    ),
    command(
      "run-smoke-gates",
      "post-install-verify",
      "npm run verify:operator:dry-run && npm run verify:lightspeed -- --mcp-url <installed-mcp-url> --require-mcp",
      "Re-run non-mutating evidence gates after install.",
      "Use the rollback commands above, then rerun the same smoke gates to prove cleanup.",
      false
    )
  ];
}

function buildApprovalChecklist({ dryRun, lightspeedReadiness, patchPreview, image, mvp, currentHeadSha }) {
  const actualImageBuilds = image?.actualBuilds ?? [];
  const actualImageBuildFailures = actualImageBuilds.filter(
    (build) => build?.status && build.status !== "PASS" && build.status !== "WARN"
  );
  const imageEvidenceHeadMatches = image?.headSha === currentHeadSha;
  const actualImageBuildEvidenceReady =
    image?.status === "PASS" &&
    image?.worktreeDirty === false &&
    imageEvidenceHeadMatches &&
    image?.actualBuildRequested === true &&
    actualImageBuilds.length > 0 &&
    actualImageBuildFailures.length === 0;

  return [
    {
      id: "mvp-gate-clean",
      required: true,
      status: mvp?.status === "PASS" && mvp?.worktreeDirty === false ? "pass" : "needs-evidence",
      evidence: `MVP gate status=${evidenceStatus(mvp)} dirty=${String(mvp?.worktreeDirty ?? "unknown")}`
    },
    {
      id: "operator-server-dry-run",
      required: true,
      status: dryRun?.status === "PASS" || dryRun?.status === "WARN" ? "pass" : "needs-evidence",
      evidence: `Operator dry-run status=${evidenceStatus(dryRun)} clusterMutationAttempted=${String(dryRun?.policy?.clusterMutationAttempted ?? "unknown")}`
    },
    {
      id: "lightspeed-patch-preview",
      required: true,
      status:
        patchPreview?.status === "PATCH_PLANNED" || patchPreview?.status === "Ready"
          ? "pass"
          : "needs-evidence",
      evidence: `Patch preview status=${evidenceStatus(patchPreview)} willPatch=${String(patchPreview?.willPatch ?? "unknown")}`
    },
    {
      id: "lightspeed-readiness-gap-known",
      required: true,
      status:
        lightspeedReadiness?.status === "PASS" ||
        lightspeedReadiness?.status === "NEEDS_CONFIGURATION" ||
        lightspeedReadiness?.status === "WARN"
          ? "pass"
          : "needs-evidence",
      evidence: `Lightspeed readiness status=${evidenceStatus(lightspeedReadiness)}`
    },
    {
      id: "image-build-evidence",
      required: true,
      status: actualImageBuildEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `Image readiness status=${evidenceStatus(image)} dirty=${String(image?.worktreeDirty ?? "unknown")} ` +
        `head=${image?.headSha ?? "unknown"} currentHead=${currentHeadSha} ` +
        `actualBuildRequested=${String(image?.actualBuildRequested ?? "unknown")} actualBuilds=${actualImageBuilds.length} ` +
        `actualBuildFailures=${actualImageBuildFailures.length}`
    },
    {
      id: "human-approval",
      required: true,
      status: "approval-required",
      evidence: "Cluster admin, SRE, security reviewer, and product owner approval are required before running mutating commands."
    }
  ];
}

function planStatus(checklist) {
  if (checks.some((check) => check.status === "FAIL")) {
    return "BLOCKED";
  }
  if (checklist.some((item) => item.status === "needs-evidence")) {
    return "NEEDS_EVIDENCE";
  }
  return "APPROVAL_REQUIRED";
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "CYWELL_OPSLENS_API_KEY",
    "CYWELL_OPSLENS_BEARER_TOKEN",
    "OPENSHIFT_LIGHTSPEED_TOKEN"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

async function buildPlan() {
  const [catalogSource, subscription, installation] = await Promise.all([
    loadSingleYaml(options.catalogSource),
    loadSingleYaml(options.subscription),
    loadSingleYaml(options.installation)
  ]);

  expectCheck(
    "CatalogSource contract",
    catalogSource?.kind === "CatalogSource" &&
      catalogSource?.metadata?.namespace === "openshift-marketplace" &&
      catalogSource?.spec?.sourceType === "grpc",
    "CatalogSource is an OpenShift marketplace grpc source",
    "CatalogSource must be a grpc source in openshift-marketplace"
  );
  expectCheck(
    "Subscription manual approval",
    subscription?.kind === "Subscription" &&
      subscription?.spec?.installPlanApproval === "Manual",
    "Subscription uses Manual installPlanApproval",
    "Subscription must keep installPlanApproval=Manual"
  );
  expectCheck(
    "OpsLensInstallation PatchOLSConfig explicit",
    installation?.kind === "OpsLensInstallation" &&
      installation?.spec?.lightspeedRegistration?.mode === "PatchOLSConfig",
    "sample install explicitly opts in to PatchOLSConfig",
    "sample install must explicitly opt in to PatchOLSConfig"
  );
  expectCheck(
    "OpsLensInstallation MCP endpoint",
    installation?.spec?.lightspeedRegistration?.endpoint?.endsWith("/mcp") === true,
    installation?.spec?.lightspeedRegistration?.endpoint ?? "missing endpoint",
    "sample install endpoint must end with /mcp"
  );

  const dryRun = loadJsonArtifact(options.dryRunEvidence, "Operator dry-run evidence");
  const lightspeedReadiness = loadJsonArtifact(
    options.lightspeedReadinessEvidence,
    "Lightspeed readiness evidence"
  );
  const patchPreview = loadJsonArtifact(
    options.lightspeedPatchPreviewEvidence,
    "Lightspeed patch preview evidence"
  );
  const image = loadJsonArtifact(options.imageEvidence, "Image readiness evidence");
  const mvp = loadJsonArtifact(options.mvpEvidence, "MVP gate evidence");
  const currentHeadSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const checklist = buildApprovalChecklist({
    dryRun,
    lightspeedReadiness,
    patchPreview,
    image,
    mvp,
    currentHeadSha
  });
  for (const item of checklist) {
    if (item.status === "needs-evidence") {
      warn(`approval checklist ${item.id}`, item.evidence);
    }
  }
  const commands = buildCommands(subscription, installation);
  const status = planStatus(checklist);
  const worktreeStatus = await gitStatusShort();

  return {
    schema: "cywell.opslens.install-approval-plan.v0.1",
    artifactType: "opslens.install-approval-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "approvalPlanOnly",
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-OP-004", "AC-OP-005", "AC-CERT-001"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: currentHeadSha,
      baseRef: await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    sourceManifests: {
      catalogSource: resolve(options.catalogSource),
      subscription: resolve(options.subscription),
      installation: resolve(options.installation)
    },
    target: {
      namespace: subscription?.metadata?.namespace ?? "cywell-opslens",
      catalogSourceNamespace: catalogSource?.metadata?.namespace ?? "openshift-marketplace",
      subscriptionName: subscription?.metadata?.name ?? "cywell-opslens",
      installPlanApproval: subscription?.spec?.installPlanApproval ?? "unknown",
      lightspeedConfig:
        `${installation?.spec?.lightspeedRegistration?.olsConfigNamespace ?? "openshift-lightspeed"}/${installation?.spec?.lightspeedRegistration?.olsConfigName ?? "cluster"}`,
      mcpEndpoint: installation?.spec?.lightspeedRegistration?.endpoint ?? "unknown"
    },
    requiredApprovals: [
      "cluster-admin",
      "cluster-sre",
      "security-reviewer",
      "product-owner"
    ],
    checklist,
    commands,
    risk: [
      "Applying the OpsLensInstallation sample allows the Operator to patch OLSConfig because mode=PatchOLSConfig is explicit.",
      "Image pull failures remain possible until release images are pushed and mirrored to the target registry.",
      "Namespaced server dry-run is partial until the target namespace exists in the cluster.",
      "Lightspeed MCP is a Technology Preview integration path; support must not rely on it as the only product surface."
    ],
    rollbackPath: [
      "Restore previous OLSConfig spec.featureGates and spec.mcpServers from GitOps or backup.",
      "Delete OpsLensInstallation before deleting Operator subscription resources.",
      "Delete the ConsolePlugin only after confirming OpenShift Console no longer loads OpsLens routes.",
      "Preserve or snapshot vector-store PVCs before deleting the target namespace.",
      "Delete Subscription, CSV, CatalogSource, and namespace in that order when uninstalling the lab deployment."
    ],
    evidenceSources: {
      dryRun: resolve(options.dryRunEvidence),
      lightspeedReadiness: resolve(options.lightspeedReadinessEvidence),
      lightspeedPatchPreview: resolve(options.lightspeedPatchPreviewEvidence),
      image: resolve(options.imageEvidence),
      mvp: resolve(options.mvpEvidence)
    },
    missingEvidence: checklist
      .filter((item) => item.status === "needs-evidence")
      .map((item) => `${item.id}: ${item.evidence}`),
    checks
  };
}

async function writePlan(plan) {
  const reportPath = resolve(options.evidenceOut);
  const initialSerialized = `${JSON.stringify(plan, null, 2)}\n`;
  const leakedSecret = secretValuesForLeakCheck().some((secret) => initialSerialized.includes(secret));
  if (leakedSecret) {
    throw new Error("install approval plan would include a configured secret value");
  }
  pass("install approval plan evidence export", `${reportPath} written without secret material`);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("install approval plan would include a configured secret value");
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized);
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    WARN: 1,
    PASS: 2
  };
  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens install approval plan: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const plan = await buildPlan();
  await writePlan(plan);
} catch (error) {
  fail("install approval plan verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
