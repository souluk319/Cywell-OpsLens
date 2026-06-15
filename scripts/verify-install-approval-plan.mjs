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
  markdownOut: "test-results/cywell-opslens-install-approval-cluster-admin.md",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  installation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  dryRunEvidence: "test-results/cywell-opslens-operator-dry-run.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreviewEvidence: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  mvpEvidence: "test-results/cywell-opslens-mvp-0.1-gate.json",
  ragApprovalQueueEvidence: "test-results/cywell-opslens-rag-approval-queue.json",
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
  markdownOut: parsed.values.get("markdown-out") ?? defaults.markdownOut,
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
  ragApprovalQueueEvidence:
    parsed.values.get("rag-approval-queue-evidence") ?? defaults.ragApprovalQueueEvidence,
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

function evidenceHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function evidenceDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function evidenceHeadMatches(artifact, currentHeadSha) {
  return evidenceHeadSha(artifact) === currentHeadSha;
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

function buildLightspeedRegistrationPlan(installation, patchPreview) {
  const registration = installation?.spec?.lightspeedRegistration ?? {};
  const target = {
    namespace:
      patchPreview?.target?.namespace ??
      registration.olsConfigNamespace ??
      "openshift-lightspeed",
    name: patchPreview?.target?.name ?? registration.olsConfigName ?? "cluster"
  };
  const desiredServer = {
    name:
      patchPreview?.desiredServer?.name ??
      patchPreview?.target?.mcpServerName ??
      registration.mcpServerName ??
      "cywell-opslens",
    url:
      patchPreview?.desiredServer?.url ??
      patchPreview?.target?.endpoint ??
      registration.endpoint ??
      "unknown"
  };

  return {
    actionMode: "previewOnly",
    status: patchPreview?.status ?? "missing",
    phase: patchPreview?.phase ?? "MissingEvidence",
    mode: patchPreview?.mode ?? registration.mode ?? "unknown",
    configResourceKind: "OLSConfig",
    target,
    desiredServer,
    willPatch: patchPreview?.willPatch === true,
    operatorMutationAllowedByMode:
      patchPreview?.operatorMutationAllowedByMode === true ||
      registration.mode === "PatchOLSConfig",
    clusterMutationAttempted: patchPreview?.clusterMutationAttempted === true,
    mutationAllowedByThisVerifier: false,
    legacyConfigMapMutationAttempted: false,
    readOnlyCommands: [
      {
        id: "preview-lightspeed-patch",
        command: "npm run verify:lightspeed:patch-preview"
      },
      {
        id: "verify-lightspeed-registration",
        command: `oc get olsconfig ${target.name} -n ${target.namespace} -o yaml`
      }
    ],
    evidence: patchPreview?.evidence ?? [
      `target OLSConfig ${target.namespace}/${target.name}`,
      `desired MCP server ${desiredServer.name} -> ${desiredServer.url}`
    ],
    risk: patchPreview?.risks ?? [
      "OpenShift Lightspeed MCP registration must remain explicit through OpsLensInstallation.spec.lightspeedRegistration.mode.",
      "This verifier previews the OLSConfig registration only and does not patch the cluster."
    ],
    rollbackPath: patchPreview?.rollbackPath ?? [
      `Restore previous OLSConfig ${target.namespace}/${target.name} spec.featureGates and spec.mcpServers from GitOps or cluster backup.`,
      `Remove only the ${desiredServer.name} MCP server entry if OpsLens is uninstalled.`
    ],
    missingEvidence: patchPreview?.missingEvidence ?? [
      "Lightspeed patch preview evidence is missing"
    ]
  };
}

function buildApprovalChecklist({
  dryRun,
  lightspeedReadiness,
  patchPreview,
  image,
  mvp,
  ragApprovalQueue,
  currentHeadSha,
  currentWorktreeDirty
}) {
  const actualImageBuilds = image?.actualBuilds ?? [];
  const actualImageBuildFailures = actualImageBuilds.filter(
    (build) => build?.status && build.status !== "PASS" && build.status !== "WARN"
  );
  const mvpEvidenceReady =
    mvp?.status === "PASS" &&
    evidenceDirty(mvp) === false &&
    evidenceHeadMatches(mvp, currentHeadSha);
  const dryRunEvidenceReady =
    (dryRun?.status === "PASS" || dryRun?.status === "WARN") &&
    evidenceDirty(dryRun) === false &&
    evidenceHeadMatches(dryRun, currentHeadSha) &&
    dryRun?.policy?.clusterMutationAttempted === false;
  const patchPreviewEvidenceReady =
    (patchPreview?.status === "PATCH_PLANNED" || patchPreview?.status === "Ready") &&
    evidenceDirty(patchPreview) === false &&
    evidenceHeadMatches(patchPreview, currentHeadSha) &&
    patchPreview?.actionMode === "previewOnly" &&
    patchPreview?.clusterMutationAttempted === false;
  const lightspeedReadinessEvidenceReady =
    (lightspeedReadiness?.status === "PASS" ||
      lightspeedReadiness?.status === "NEEDS_CONFIGURATION" ||
      lightspeedReadiness?.status === "WARN") &&
    evidenceDirty(lightspeedReadiness) === false &&
    evidenceHeadMatches(lightspeedReadiness, currentHeadSha) &&
    lightspeedReadiness?.policy?.clusterMutationAttempted === false;
  const lightspeedCurrentGap = lightspeedReadiness?.currentGap ?? {};
  const actualImageBuildEvidenceReady =
    image?.status === "PASS" &&
    evidenceDirty(image) === false &&
    evidenceHeadMatches(image, currentHeadSha) &&
    image?.actualBuildRequested === true &&
    actualImageBuilds.length > 0 &&
    actualImageBuildFailures.length === 0;
  const approvedIngestionPlan = ragApprovalQueue?.ingestionPlan?.approved ?? {};
  const ragApprovalQueueEvidenceReady =
    ragApprovalQueue?.status === "PASS" &&
    evidenceDirty(ragApprovalQueue) === false &&
    evidenceHeadMatches(ragApprovalQueue, currentHeadSha) &&
    ragApprovalQueue?.policy?.rawDocumentReturned === false &&
    ragApprovalQueue?.policy?.rawMarkdownPersisted === false &&
    ragApprovalQueue?.policy?.vectorWriteAllowed === false &&
    ragApprovalQueue?.policy?.clusterMutationAllowed === false &&
    ragApprovalQueue?.policy?.ingestionAllowed === false &&
    approvedIngestionPlan.actionMode === "ingestionPlanOnly" &&
    approvedIngestionPlan.status === "ready-for-ingestion-job" &&
    approvedIngestionPlan.ingestionJobCreated === false &&
    approvedIngestionPlan.vectorWriteAllowed === false &&
    approvedIngestionPlan.ingestionAllowed === false;

  return [
    {
      id: "current-worktree-clean",
      required: true,
      status: currentWorktreeDirty ? "needs-evidence" : "pass",
      evidence: `current git worktree dirty=${String(currentWorktreeDirty)} head=${currentHeadSha}`
    },
    {
      id: "mvp-gate-clean",
      required: true,
      status: mvpEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `MVP gate status=${evidenceStatus(mvp)} dirty=${String(evidenceDirty(mvp) ?? "unknown")} ` +
        `head=${evidenceHeadSha(mvp) ?? "unknown"} currentHead=${currentHeadSha}`
    },
    {
      id: "operator-server-dry-run",
      required: true,
      status: dryRunEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `Operator dry-run status=${evidenceStatus(dryRun)} dirty=${String(evidenceDirty(dryRun) ?? "unknown")} ` +
        `head=${evidenceHeadSha(dryRun) ?? "unknown"} currentHead=${currentHeadSha} ` +
        `clusterMutationAttempted=${String(dryRun?.policy?.clusterMutationAttempted ?? "unknown")}`
    },
    {
      id: "lightspeed-patch-preview",
      required: true,
      status: patchPreviewEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `Patch preview status=${evidenceStatus(patchPreview)} dirty=${String(evidenceDirty(patchPreview) ?? "unknown")} ` +
        `head=${evidenceHeadSha(patchPreview) ?? "unknown"} currentHead=${currentHeadSha} ` +
        `willPatch=${String(patchPreview?.willPatch ?? "unknown")} ` +
        `clusterMutationAttempted=${String(patchPreview?.clusterMutationAttempted ?? "unknown")}`
    },
    {
      id: "lightspeed-readiness-gap-known",
      required: true,
      status: lightspeedReadinessEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `Lightspeed readiness status=${evidenceStatus(lightspeedReadiness)} ` +
        `dirty=${String(evidenceDirty(lightspeedReadiness) ?? "unknown")} ` +
        `head=${evidenceHeadSha(lightspeedReadiness) ?? "unknown"} currentHead=${currentHeadSha} ` +
        `clusterMutationAttempted=${String(lightspeedReadiness?.policy?.clusterMutationAttempted ?? "unknown")} ` +
        `classification=${lightspeedCurrentGap.classification ?? "unknown"} ` +
        `owner=${lightspeedCurrentGap.owner ?? "unknown"} ` +
        `next=${lightspeedCurrentGap.nextCommand ?? "unknown"}`
    },
    {
      id: "image-build-evidence",
      required: true,
      status: actualImageBuildEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `Image readiness status=${evidenceStatus(image)} dirty=${String(evidenceDirty(image) ?? "unknown")} ` +
        `head=${evidenceHeadSha(image) ?? "unknown"} currentHead=${currentHeadSha} ` +
        `actualBuildRequested=${String(image?.actualBuildRequested ?? "unknown")} actualBuilds=${actualImageBuilds.length} ` +
        `actualBuildFailures=${actualImageBuildFailures.length}`
    },
    {
      id: "rag-ingestion-plan-evidence",
      required: true,
      status: ragApprovalQueueEvidenceReady ? "pass" : "needs-evidence",
      evidence:
        `RAG approval queue status=${evidenceStatus(ragApprovalQueue)} dirty=${String(evidenceDirty(ragApprovalQueue) ?? "unknown")} ` +
        `head=${evidenceHeadSha(ragApprovalQueue) ?? "unknown"} currentHead=${currentHeadSha} ` +
        `approvedPlan=${approvedIngestionPlan.status ?? "unknown"} ` +
        `ingestionJobCreated=${String(approvedIngestionPlan.ingestionJobCreated ?? "unknown")} ` +
        `vectorWriteAllowed=${String(approvedIngestionPlan.vectorWriteAllowed ?? "unknown")}`
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

const checklistActionMap = {
  "current-worktree-clean": {
    owner: "release-manager",
    nextCommand: "git status --short",
    request: "Regenerate install approval evidence from a clean Git worktree."
  },
  "mvp-gate-clean": {
    owner: "release-manager",
    nextCommand: "npm run verify:mvp -- --skip-images",
    request: "Refresh the MVP gate evidence before install approval review."
  },
  "operator-server-dry-run": {
    owner: "cluster-sre",
    nextCommand: "npm run verify:operator:dry-run",
    request: "Refresh the live server-side dry-run evidence without applying manifests."
  },
  "lightspeed-patch-preview": {
    owner: "cluster-admin",
    nextCommand: "npm run verify:lightspeed:patch-preview",
    request: "Refresh the OLSConfig PatchOLSConfig preview without patching the cluster."
  },
  "lightspeed-readiness-gap-known": {
    owner: "network-sre",
    nextCommand: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
    request: "Restore or re-check live OCP reachability before install approval can rely on Lightspeed readiness."
  },
  "image-build-evidence": {
    owner: "release-manager",
    nextCommand: "npm run verify:images:build",
    request: "Refresh same-head owned image build evidence before install approval."
  },
  "rag-ingestion-plan-evidence": {
    owner: "rag-owner",
    nextCommand: "npm run verify:rag:approval-queue",
    request: "Refresh the RAG ingestion approval plan without creating an ingestion job."
  },
  "human-approval": {
    owner: "cluster-admin",
    nextCommand: "review install approval plan and collect required approver decisions",
    request: "Collect explicit human approval before running any mutating install command."
  }
};

function lightspeedReadinessActionFromEvidence(evidence) {
  if (/owner=cluster-admin|classification=(auth-failed|auth-or-rbac|token-missing)/i.test(evidence)) {
    return {
      owner: "cluster-admin",
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      request:
        "Resolve OCP credential or read-only RBAC evidence before install approval can rely on Lightspeed readiness."
    };
  }
  if (/classification=tls|tls-handshake|certificate/i.test(evidence)) {
    return {
      owner: "cluster-sre",
      nextCommand: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      request:
        "Resolve OCP TLS or trust evidence before install approval can rely on Lightspeed readiness."
    };
  }
  return checklistActionMap["lightspeed-readiness-gap-known"];
}

function checklistActionFor(item) {
  if (item.id === "lightspeed-readiness-gap-known") {
    return lightspeedReadinessActionFromEvidence(item.evidence);
  }
  return checklistActionMap[item.id];
}

function firstApprovalActions(checklist, commands) {
  const openChecklistItems = checklist.filter((item) => item.status !== "pass");
  const checklistActions = openChecklistItems.slice(0, 3).map((item) => {
    const mapped = checklistActionFor(item) ?? {
      owner: "cluster-admin",
      nextCommand: "npm run verify:install-plan",
      request: `Refresh install approval evidence for ${item.id}.`
    };
    return {
      id: item.id,
      owner: mapped.owner,
      phase: "approval-preflight",
      status: item.status,
      request: mapped.request,
      evidenceNeeded: item.evidence,
      nextCommand: mapped.nextCommand,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy: item.status === "approval-required" ? [] : [item.evidence],
      rollbackPath: "No rollback is required for read-only approval preflight."
    };
  });
  const firstMutatingCommand = commands.find((entry) => entry.mutation === true);
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "cluster-admin",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until every required approval is collected.`,
          evidenceNeeded: "All install approval checklist items pass and cluster-admin, cluster-sre, security-reviewer, and product-owner approvals are recorded.",
          nextCommand: firstMutatingCommand.command,
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: openChecklistItems.map((item) => `${item.id}: ${item.evidence}`),
          rollbackPath: firstMutatingCommand.rollback
        }
      ]
    : [];
  return [...checklistActions, ...gatedMutationAction];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function buildInstallApprovalTicketPacket({ status, checklist, commands, firstActions }) {
  const dryRunChecklist = checklist.find((item) => item.id === "operator-server-dry-run");
  const openChecklistItems = checklist.filter((item) => item.status !== "pass");
  const firstReadOnlyCommand =
    commands.find((entry) => entry.id === "run-operator-server-dry-run" && entry.mutation === false) ??
    commands.find((entry) => entry.mutation === false);
  const firstReadOnly =
    firstActions.find((action) => action.id === firstReadOnlyCommand?.id) ??
    (firstReadOnlyCommand
      ? {
          id: firstReadOnlyCommand.id,
          status:
            dryRunChecklist?.status ??
            (status === "APPROVAL_REQUIRED" ? "ready" : "needs-evidence"),
          nextCommand: firstReadOnlyCommand.command,
          mutation: false,
          requiresExplicitApproval: false
        }
      : {
          id: "run-operator-server-dry-run",
          status: status === "APPROVAL_REQUIRED" ? "ready" : "needs-evidence",
          nextCommand: "npm run verify:operator:dry-run",
          mutation: false,
          requiresExplicitApproval: false
        });
  const approvalAction =
    firstActions.find((action) => action.mutation === true) ??
    (() => {
      const firstMutatingCommand = commands.find((entry) => entry.mutation === true);
      return {
        id: firstMutatingCommand
          ? `approval-gated-${firstMutatingCommand.id}`
          : "approval-gated-install",
        status: "approval-gated",
        nextCommand:
          firstMutatingCommand?.command ?? "approval-gated install command",
        mutation: true,
        requiresExplicitApproval: true
      };
    })();

  return {
    id: "cluster-admin-install-approval-ticket",
    owner: "cluster-admin",
    title: "Install approval handoff",
    severity: "high",
    classification:
      openChecklistItems.length > 0
        ? "install-evidence-gaps"
        : "install-approval-required",
    installStatus: status,
    requiredApprovals: [
      "cluster-admin",
      "cluster-sre",
      "security-reviewer",
      "product-owner"
    ],
    evidenceChecklist: [
      "Operator server-side dry-run evidence is current and read-only",
      "Lightspeed PatchOLSConfig preview is current and preview-only",
      "Release image build/provenance evidence is current-head",
      "RAG ingestion remains ingestionPlanOnly with no vector writes",
      "Namespace, CatalogSource, Subscription, InstallPlan approval, OpsLensInstallation, and OLSConfig mutation remain approval-gated"
    ],
    firstReadOnlyAction: {
      id: firstReadOnly.id,
      status: firstReadOnly.status,
      nextCommand: firstReadOnly.nextCommand,
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: approvalAction.id,
      status: approvalAction.status,
      nextCommand: approvalAction.nextCommand,
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: uniqueStrings([
      firstReadOnly.nextCommand,
      approvalAction.nextCommand,
      "npm run verify:install-plan",
      "npm run evidence:release-action-queue"
    ]),
    blockedBy: uniqueStrings(
      openChecklistItems.map((item) => `${item.id}: ${item.evidence}`)
    ).slice(0, 8),
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false,
      installRequiresExplicitApproval: true
    },
    risk:
      "Install approval handoff blocks namespace creation, OLM resources, InstallPlan approval, OpsLensInstallation apply, OLSConfig patching, and future RAG ingestion until human approvals are explicit.",
    rollbackPath:
      "Use the generated uninstall order: restore OLSConfig, delete OpsLensInstallation, remove ConsolePlugin after console cleanup, preserve vector PVCs, then delete Subscription, CSV, CatalogSource, and namespace."
  };
}

function buildInstallDecisionAction({
  status,
  checklist,
  commands,
  ticketPacket,
  lightspeedRegistration,
  ragIngestionStatus
}) {
  const openChecklistItems = checklist.filter((item) => item.status !== "pass");
  const readOnlyPreflight =
    commands.find((entry) => entry.id === "run-operator-server-dry-run") ??
    commands.find((entry) => entry.mutation === false);
  const lightspeedPreview =
    commands.find((entry) => entry.id === "preview-lightspeed-patch") ??
    commands.find((entry) => /lightspeed/i.test(entry.id));
  const approvalGatedCommands = commands.filter(
    (entry) => entry.mutation === true && entry.requiresExplicitApproval === true
  );
  const ragChecklist = checklist.find(
    (item) => item.id === "rag-ingestion-plan-evidence"
  );

  return {
    id: "cluster-admin-install-approval-decision",
    owner: "cluster-admin",
    status: openChecklistItems.length > 0 ? "needs-evidence" : "approval-required",
    requiredApprovals: ticketPacket.requiredApprovals,
    readOnlyPreflightCommandId:
      readOnlyPreflight?.id ?? ticketPacket.firstReadOnlyAction.id,
    readOnlyPreflightCommand:
      readOnlyPreflight?.command ?? ticketPacket.firstReadOnlyAction.nextCommand,
    lightspeedPreviewCommandId: lightspeedPreview?.id ?? "preview-lightspeed-patch",
    ragIngestionReviewCommand:
      checklistActionFor(ragChecklist ?? { id: "rag-ingestion-plan-evidence" })
        ?.nextCommand ?? "npm run verify:rag:approval-queue",
    approvalGatedCommandIds: uniqueStrings(
      approvalGatedCommands.map((entry) => entry.id)
    ),
    nextCommand:
      readOnlyPreflight?.command ??
      ticketPacket.firstReadOnlyAction.nextCommand ??
      "npm run verify:install-plan",
    evidenceNeeded: uniqueStrings(
      openChecklistItems.map((item) => `${item.id}: ${item.evidence}`)
    ).slice(0, 8),
    blockedBy: uniqueStrings(
      openChecklistItems.map((item) => `${item.id}: ${item.evidence}`)
    ).slice(0, 8),
    lightspeedRegistrationMode: lightspeedRegistration.mode,
    ragIngestionStatus,
    mutationAllowed: false,
    writesLocalEvidence: true,
    requiresExplicitApproval: true,
    clusterMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    installRequiresExplicitApproval: true
  };
}

function buildClusterAdminInstallPacket({
  status,
  firstActions,
  ticketPacket,
  installDecisionAction,
  commands,
  missingEvidence
}) {
  const mutatingCommandIds = commands
    .filter((command) => command.mutation === true)
    .map((command) => command.id);

  return {
    owner: "cluster-admin",
    markdownPath: resolve(options.markdownOut),
    exists: true,
    ticketId: ticketPacket.id,
    installDecisionActionId: installDecisionAction.id,
    status,
    requiredApprovals: ticketPacket.requiredApprovals,
    firstReadOnlyActionId: ticketPacket.firstReadOnlyAction.id,
    lightspeedPreviewCommandId: installDecisionAction.lightspeedPreviewCommandId,
    ragIngestionReviewCommand: installDecisionAction.ragIngestionReviewCommand,
    approvalGatedActionId: ticketPacket.approvalGatedAction.id,
    approvalGatedCommandIds: installDecisionAction.approvalGatedCommandIds,
    firstApprovalActionIds: firstActions.map((action) => action.id),
    mutatingCommandIds,
    missingEvidence,
    credentialStoredByVerifier: false,
    installExecutedByVerifier: false,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false,
      installRequiresExplicitApproval: true
    }
  };
}

function installApprovalMarkdownFor(plan) {
  const packet = plan.clusterAdminPacket;
  const ticket = plan.ticketPacket;
  const decision = plan.installDecisionAction;
  const readOnlyCommands = plan.commands.filter(
    (command) => command.mutation === false
  );
  const approvalGatedCommands = plan.commands.filter(
    (command) => command.mutation === true
  );
  const lines = [
    "# Cywell OpsLens Install Approval Cluster Admin Packet",
    "",
    `Generated: ${plan.generatedAt}`,
    `Git: ${plan.ref.branch} ${plan.ref.headSha} dirty=${plan.ref.worktreeDirty}`,
    `Status: ${plan.status}`,
    "",
    "## Approval Summary",
    "",
    `- Owner: ${packet.owner}`,
    `- Ticket: ${packet.ticketId}`,
    `- Decision action: ${packet.installDecisionActionId}`,
    `- Required approvals: ${packet.requiredApprovals.join(", ")}`,
    `- First read-only action: ${packet.firstReadOnlyActionId}`,
    `- Lightspeed preview: ${packet.lightspeedPreviewCommandId}`,
    `- RAG ingestion review: ${packet.ragIngestionReviewCommand}`,
    `- First approval-gated action: ${packet.approvalGatedActionId}`,
    "",
    "## Read-only Preflight",
    "",
    ...readOnlyCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} mutation=${String(command.mutation)}`
    ),
    "",
    "## Approval-gated Install Commands",
    "",
    ...approvalGatedCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} mutation=${String(command.mutation)} requiresExplicitApproval=${String(command.requiresExplicitApproval)}`
    ),
    "",
    "## Decision Boundary",
    "",
    `- decisionStatus=${decision.status}`,
    `- mutationAllowed=${String(decision.mutationAllowed)}`,
    `- writesLocalEvidence=${String(decision.writesLocalEvidence)}`,
    `- clusterMutationAttempted=${String(packet.mutationBoundary.clusterMutationAttempted)}`,
    `- registryMutationAttempted=${String(packet.mutationBoundary.registryMutationAttempted)}`,
    `- vectorWriteAttempted=${String(packet.mutationBoundary.vectorWriteAttempted)}`,
    `- ingestionJobCreated=${String(packet.mutationBoundary.ingestionJobCreated)}`,
    `- mutationAllowedByThisVerifier=${String(packet.mutationBoundary.mutationAllowedByThisVerifier)}`,
    `- installRequiresExplicitApproval=${String(packet.mutationBoundary.installRequiresExplicitApproval)}`,
    `- installExecutedByVerifier=${String(packet.installExecutedByVerifier)}`,
    `- credentialStoredByVerifier=${String(packet.credentialStoredByVerifier)}`,
    "- This packet does not create namespaces, apply CatalogSource or Subscription, approve InstallPlans, apply OpsLensInstallation, patch OLSConfig, create RAG ingestion jobs, write vectors, or store credentials.",
    "",
    "## Ticket Checklist",
    "",
    ...ticket.evidenceChecklist.map((item) => `- ${item}`),
    "",
    "## Blocked By",
    "",
    ...(packet.missingEvidence.length
      ? packet.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Risk",
    "",
    ...plan.risk.map((item) => `- ${item}`),
    "",
    "## Rollback Path",
    "",
    ...plan.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
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
  const ragApprovalQueue = loadJsonArtifact(
    options.ragApprovalQueueEvidence,
    "RAG approval queue evidence"
  );
  const currentHeadSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const checklist = buildApprovalChecklist({
    dryRun,
    lightspeedReadiness,
    patchPreview,
    image,
    mvp,
    ragApprovalQueue,
    currentHeadSha,
    currentWorktreeDirty: worktreeStatus.length > 0
  });
  for (const item of checklist) {
    if (item.status === "needs-evidence") {
      warn(`approval checklist ${item.id}`, item.evidence);
    }
  }
  const commands = buildCommands(subscription, installation);
  const lightspeedRegistration = buildLightspeedRegistrationPlan(
    installation,
    patchPreview
  );
  expectCheck(
    "Lightspeed registration approval boundary",
    lightspeedRegistration.actionMode === "previewOnly" &&
      lightspeedRegistration.configResourceKind === "OLSConfig" &&
      lightspeedRegistration.mode === "PatchOLSConfig" &&
      lightspeedRegistration.clusterMutationAttempted === false &&
      lightspeedRegistration.mutationAllowedByThisVerifier === false &&
      lightspeedRegistration.legacyConfigMapMutationAttempted === false,
    `${lightspeedRegistration.mode} ${lightspeedRegistration.target.namespace}/${lightspeedRegistration.target.name} previewOnly legacyConfigMapMutationAttempted=false`,
    "install approval plan must expose non-mutating OLSConfig PatchOLSConfig registration instead of a ConfigMap mutation"
  );
  const status = planStatus(checklist);
  const firstActions = firstApprovalActions(checklist, commands);
  const approvedIngestionPlan = ragApprovalQueue?.ingestionPlan?.approved ?? {};
  const ragIngestionStatus =
    approvedIngestionPlan.status === "ready-for-ingestion-job"
      ? "ready-for-ingestion-job"
      : "needs-evidence";
  const ticketPacket = buildInstallApprovalTicketPacket({
    status,
    checklist,
    commands,
    firstActions
  });
  const installDecisionAction = buildInstallDecisionAction({
    status,
    checklist,
    commands,
    ticketPacket,
    lightspeedRegistration,
    ragIngestionStatus
  });
  const missingEvidence = checklist
    .filter((item) => item.status === "needs-evidence")
    .map((item) => `${item.id}: ${item.evidence}`);
  const clusterAdminPacket = buildClusterAdminInstallPacket({
    status,
    firstActions,
    ticketPacket,
    installDecisionAction,
    commands,
    missingEvidence
  });
  if (
    ticketPacket.firstReadOnlyAction.mutation === false &&
    ticketPacket.firstReadOnlyAction.requiresExplicitApproval === false &&
    ticketPacket.approvalGatedAction.mutation === true &&
    ticketPacket.approvalGatedAction.requiresExplicitApproval === true &&
    ticketPacket.mutationBoundary.clusterMutationAttempted === false &&
    ticketPacket.mutationBoundary.vectorWriteAttempted === false &&
    ticketPacket.mutationBoundary.ingestionJobCreated === false &&
    ticketPacket.mutationBoundary.mutationAllowedByThisVerifier === false
  ) {
    pass("install approval ticket boundary", "install handoff is read-only first and approval-gated for cluster mutation");
  } else {
    fail("install approval ticket boundary", "install handoff must separate read-only preflight from approval-gated cluster mutation");
  }
  if (
    installDecisionAction.readOnlyPreflightCommandId === "run-operator-server-dry-run" &&
    installDecisionAction.lightspeedPreviewCommandId === "preview-lightspeed-patch" &&
    installDecisionAction.ragIngestionReviewCommand.includes("verify:rag:approval-queue") &&
    installDecisionAction.approvalGatedCommandIds.includes("apply-operator-namespace") &&
    installDecisionAction.mutationAllowed === false &&
    installDecisionAction.writesLocalEvidence === true &&
    installDecisionAction.requiresExplicitApproval === true &&
    installDecisionAction.clusterMutationAttempted === false &&
    installDecisionAction.vectorWriteAttempted === false &&
    installDecisionAction.ingestionJobCreated === false &&
    installDecisionAction.mutationAllowedByThisVerifier === false &&
    installDecisionAction.installRequiresExplicitApproval === true
  ) {
    pass("install approval decision action", "cluster-admin decision handoff separates dry-run, Lightspeed preview, RAG review, and approval-gated install commands");
  } else {
    fail("install approval decision action", "install decision handoff must expose dry-run, Lightspeed preview, RAG review, approval-gated install commands, and no-mutation boundary");
  }

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
    lightspeedRegistration,
    requiredApprovals: [
      "cluster-admin",
      "cluster-sre",
      "security-reviewer",
      "product-owner"
    ],
    ragIngestion: {
      actionMode: "ingestionPlanOnly",
      status: ragIngestionStatus,
      queueEvidenceStatus: evidenceStatus(ragApprovalQueue),
      approvedPlanStatus: approvedIngestionPlan.status ?? "missing",
      clusterMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: approvedIngestionPlan.ingestionJobCreated === true,
      mutationAllowedByThisVerifier: false,
      requiredApprovals: [
        "rag-owner",
        "cluster-sre",
        "data-steward"
      ],
      mutatingCommands: [
        {
          id: "future-rag-vector-ingestion-job",
          phase: "rag-ingestion",
          requiresExplicitApproval: true
        }
      ],
      risk: [
        "RAG ingestion can change future operational recommendations even when no cluster resource is mutated.",
        "Only an approved external source-of-truth document should feed a future ingestion worker.",
        "This install approval plan does not create an ingestion job or write to a vector store."
      ],
      rollbackPath: [
        "Reject or delete the queue item before running any future ingestion worker if the draft is withdrawn.",
        "A production ingestion worker must export previous vector chunk IDs before replacing indexed guidance.",
        "Re-run npm run verify:rag:approval-queue after any RAG approval or source document change."
      ],
      missingEvidence:
        ragIngestionStatus === "ready-for-ingestion-job"
          ? [
              "production ingestion worker approval",
              "source commit or change request containing raw Markdown outside OpsLens",
              "vector store write audit sink and rollback export path"
            ]
          : [
              `RAG approval queue evidence is not ready: ${approvedIngestionPlan.status ?? "missing"}`
            ]
    },
    checklist,
    firstApprovalActions: firstActions,
    ticketPacket,
    installDecisionAction,
    clusterAdminPacket,
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
      mvp: resolve(options.mvpEvidence),
      ragApprovalQueue: resolve(options.ragApprovalQueueEvidence)
    },
    missingEvidence,
    checks
  };
}

async function writePlan(plan) {
  const reportPath = resolve(options.evidenceOut);
  const markdownPath = resolve(options.markdownOut);
  const initialSerialized = `${JSON.stringify(plan, null, 2)}\n`;
  const markdown = installApprovalMarkdownFor(plan);
  const leakedSecret = secretValuesForLeakCheck().some(
    (secret) => initialSerialized.includes(secret) || markdown.includes(secret)
  );
  if (leakedSecret) {
    throw new Error("install approval plan would include a configured secret value");
  }
  pass("install approval plan evidence export", `${reportPath} and ${markdownPath} written without secret material`);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (
    secretValuesForLeakCheck().some(
      (secret) => serialized.includes(secret) || markdown.includes(secret)
    )
  ) {
    throw new Error("install approval plan would include a configured secret value");
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(reportPath, serialized);
  await writeFile(markdownPath, markdown);
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
