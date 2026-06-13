#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-evidence-checkpoint.json",
  timeoutMs: 10000
};

const evidenceDefaults = {
  mvpGate: "test-results/cywell-opslens-mvp-0.1-gate.json",
  runtimeReadiness: "test-results/cywell-opslens-runtime-readiness.json",
  runtimeRag: "test-results/cywell-opslens-runtime-rag-contract.json",
  runtimeRagFixture: "test-results/cywell-opslens-runtime-rag-fixture.json",
  ragApprovalQueue: "test-results/cywell-opslens-rag-approval-queue.json",
  lightspeedRouting: "test-results/cywell-opslens-lightspeed-tool-routing.json",
  lightspeedTrojanHorse: "test-results/cywell-opslens-lightspeed-trojan-horse.json",
  catalogToolchain: "test-results/cywell-opslens-catalog-toolchain-plan.json",
  imageBuild: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  ocpConnectivity: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  operatorDryRun: "test-results/cywell-opslens-operator-dry-run.json",
  lightspeedReadiness: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreview: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  securityScan: "test-results/cywell-opslens-security-scan-plan.json",
  securityScanRunner: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  releasePublish: "test-results/cywell-opslens-release-publish-plan.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  liveHandoff: "test-results/cywell-opslens-live-evidence-handoff.json",
  ocpNetworkHandoff: "test-results/cywell-opslens-ocp-network-handoff.json"
};

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
    } else if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    }
  }
  return values;
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs),
  evidence: Object.fromEntries(
    Object.entries(evidenceDefaults).map(([key, value]) => [
      key,
      parsed.get(`${key}-evidence`) ?? value
    ])
  )
};

const checks = [];
const lanes = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value)
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function record(status, name, detail) {
  checks.push({ status, name, detail: sanitize(detail) });
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
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"]);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/);
}

function loadArtifact(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} evidence is missing at ${absolutePath}`);
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

function artifactHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function artifactClusterMutationAttempted(artifact) {
  return (
    artifact?.clusterMutationAttempted === true ||
    artifact?.policy?.clusterMutationAttempted === true
  );
}

function artifactRegistryMutationAttempted(artifact) {
  return artifact?.registryMutationAttempted === true;
}

function artifactMutationAllowedByVerifier(artifact) {
  return artifact?.mutationAllowedByThisVerifier === true;
}

function missingEvidenceFrom(artifact) {
  return (artifact?.missingEvidence ?? []).map((item) => sanitize(item));
}

function liveConnectionBlocked(artifact) {
  const evidence = missingEvidenceFrom(artifact).join(" ");
  return (
    artifact?.readiness?.mode === "live" &&
    artifact?.status === "FAIL" &&
    /Unable to connect|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|server\/auth unavailable|oc failed/i.test(
      evidence
    )
  );
}

function laneResult({ id, label, artifact, desiredStatuses, currentHeadSha, required = true }) {
  const missingEvidence = [];
  const blockers = [];
  const status = artifact?.status ?? "missing";
  const headSha = artifactHeadSha(artifact);
  const worktreeDirty = artifactDirty(artifact);

  if (!artifact) {
    const message = `${label} evidence is missing; run the owning verifier`;
    if (required) missingEvidence.push(message);
    else blockers.push(message);
  } else {
    if (headSha !== currentHeadSha) {
      missingEvidence.push(`${label} evidence head=${headSha ?? "missing"} currentHead=${currentHeadSha}`);
    }
    if (worktreeDirty !== false) {
      missingEvidence.push(`${label} evidence dirty=${String(worktreeDirty)}`);
    }
    if (artifactClusterMutationAttempted(artifact)) {
      blockers.push(`${label} reports clusterMutationAttempted=true`);
    }
    if (artifactRegistryMutationAttempted(artifact)) {
      blockers.push(`${label} reports registryMutationAttempted=true`);
    }
    if (artifactMutationAllowedByVerifier(artifact)) {
      blockers.push(`${label} reports mutationAllowedByThisVerifier=true`);
    }
    if (!desiredStatuses.includes(status)) {
      if (status === "NEEDS_EVIDENCE") {
        missingEvidence.push(`${label} status=NEEDS_EVIDENCE`);
      } else if (id === "lightspeedReadiness" && liveConnectionBlocked(artifact)) {
        missingEvidence.push(`${label} live OCP/Lightspeed endpoint is unreachable`);
      } else {
        blockers.push(`${label} status=${status}`);
      }
    }
  }

  let laneStatus = "pass";
  if (blockers.length > 0) laneStatus = "blocked";
  else if (missingEvidence.length > 0) laneStatus = "needs-evidence";

  lanes.push({
    id,
    label,
    status: laneStatus,
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    artifactStatus: status,
    path: resolve(options.evidence[id]),
    headSha: headSha ?? "missing",
    worktreeDirty: worktreeDirty ?? "unknown",
    missingEvidence,
    blockers
  });

  if (laneStatus === "pass") {
    pass(`${label} checkpoint`, `${label} evidence is current and acceptable`);
  } else if (laneStatus === "needs-evidence") {
    warn(`${label} checkpoint`, missingEvidence.join("; "));
  } else {
    fail(`${label} checkpoint`, blockers.join("; "));
  }
}

function checkImageActualBuilds(imageArtifact) {
  if (!imageArtifact) return;
  const required = new Set(["operator", "api", "dashboard", "bundle"]);
  const actualBuilds = imageArtifact.actualBuilds ?? [];
  const statusByName = new Map(actualBuilds.map((build) => [build.name, build.status]));
  const missing = [...required].filter((name) => statusByName.get(name) !== "PASS");
  const failed = actualBuilds
    .filter((build) => build.status && build.status !== "PASS" && build.name !== "catalog")
    .map((build) => `${build.name}=${build.status}`);

  if (imageArtifact.actualBuildRequested !== true) {
    warn("image actual build evidence", "verify:images:build has not been run for the latest image evidence");
    return;
  }
  if (missing.length > 0 || failed.length > 0) {
    fail(
      "image actual build evidence",
      `required actual builds missing=${missing.join(", ") || "none"} failed=${failed.join(", ") || "none"}`
    );
    return;
  }
  pass("image actual build evidence", "operator/api/dashboard/bundle actual local builds passed");
}

function checkOwnedImageProvenance(provenanceArtifact) {
  if (!provenanceArtifact) return;
  const required = new Set(["operator", "api", "dashboard", "bundle"]);
  const images = provenanceArtifact.images ?? [];
  const statusByName = new Map(images.map((image) => [image.name, image.status]));
  const missing = [...required].filter((name) => statusByName.get(name) !== "PASS");
  const mutations = [];

  if (provenanceArtifact.registryMutationAttempted === true) {
    mutations.push("registryMutationAttempted");
  }
  if (provenanceArtifact.clusterMutationAttempted === true) {
    mutations.push("clusterMutationAttempted");
  }
  if (provenanceArtifact.mutationAllowedByThisVerifier === true) {
    mutations.push("mutationAllowedByThisVerifier");
  }

  if (missing.length > 0 || mutations.length > 0) {
    fail(
      "owned image provenance",
      `required missing=${missing.join(", ") || "none"} mutation violations=${mutations.join(", ") || "none"}`
    );
    return;
  }

  pass(
    "owned image provenance",
    "operator/api/dashboard/bundle local image IDs are inspected without registry or cluster mutation"
  );
}

function checkLightspeedRoutingScore(routingArtifact) {
  if (!routingArtifact) return;
  const selectedPasses = Number(routingArtifact.score?.selectedPasses ?? 0);
  const responsePasses = Number(routingArtifact.score?.responsePasses ?? 0);
  const total = Number(routingArtifact.score?.total ?? 0);
  const threshold = Number(routingArtifact.score?.threshold ?? 8);
  const cases = Array.isArray(routingArtifact.cases) ? routingArtifact.cases : [];
  const unsafeCases = cases
    .filter((testCase) =>
      testCase?.mutationAllowed === true ||
      testCase?.rawDocumentReturned === true ||
      !testCase?.selectedTool ||
      testCase?.selectionPassed !== true ||
      testCase?.responsePassed !== true
    )
    .map((testCase) => testCase?.id ?? "unknown");

  if (
    selectedPasses < threshold ||
    responsePasses < threshold ||
    total < threshold ||
    routingArtifact.mutationAllowed !== false ||
    routingArtifact.rawDocumentReturned !== false ||
    routingArtifact.clusterMutationAttempted === true ||
    routingArtifact.registryMutationAttempted === true ||
    unsafeCases.length > 0
  ) {
    fail(
      "Lightspeed routing score",
      `selected=${selectedPasses}/${total} responses=${responsePasses}/${total} threshold=${threshold} unsafeCases=${unsafeCases.join(", ") || "none"}`
    );
    return;
  }

  pass(
    "Lightspeed routing score",
    `selected=${selectedPasses}/${total} responses=${responsePasses}/${total} threshold=${threshold} readOnly=true`
  );
}

function checkLightspeedTrojanHorse(trojanArtifact) {
  if (!trojanArtifact) return;
  const violations = [];
  const scenario = trojanArtifact.scenario ?? {};
  const primaryCall = trojanArtifact.primaryCall ?? {};
  const redactionProbe = trojanArtifact.redactionProbe ?? {};
  const policy = trojanArtifact.policy ?? {};
  const toolCatalog = trojanArtifact.toolCatalog ?? {};

  if (scenario.userQuestion !== "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘") {
    violations.push("exact-question");
  }
  if (scenario.selectedTool !== "generate_playbook") {
    violations.push("selectedTool");
  }
  if (primaryCall.passed !== true) {
    violations.push("primaryCall");
  }
  if (primaryCall.customerRunbookCitationFound !== true) {
    violations.push("customerRunbookCitation");
  }
  if (redactionProbe.passed !== true || redactionProbe.redactedSecret !== true) {
    violations.push("serverSideRedaction");
  }
  if (toolCatalog.mutatingToolExcluded !== true || toolCatalog.allReadOnly !== true) {
    violations.push("toolCatalogSafety");
  }
  if (
    policy.rawDocumentReturned !== false ||
    policy.mutationAllowed !== false ||
    policy.mcpTechnologyPreview !== true ||
    policy.privateRag !== true
  ) {
    violations.push("policy");
  }
  if (
    trojanArtifact.clusterMutationAttempted === true ||
    trojanArtifact.registryMutationAttempted === true ||
    trojanArtifact.vectorWriteAttempted === true ||
    trojanArtifact.ingestionJobCreated === true ||
    trojanArtifact.mutationAllowedByThisVerifier === true
  ) {
    violations.push("mutationBoundary");
  }

  if (violations.length > 0) {
    fail("Lightspeed Trojan Horse exact question", `violations=${violations.join(", ")}`);
    return;
  }

  pass(
    "Lightspeed Trojan Horse exact question",
    "exact Korean custom question returns generate_playbook with customer-runbook citations, redaction, and no mutation"
  );
}

function checkRagApprovalQueuePolicy(queueArtifact) {
  if (!queueArtifact) return;
  const policy = queueArtifact.policy ?? {};
  const submissions = queueArtifact.submissions ?? {};
  const inventory = queueArtifact.inventory ?? {};
  const reviews = queueArtifact.reviews ?? {};
  const ingestionPlan = queueArtifact.ingestionPlan ?? {};
  const violations = [];

  if (policy.rawDocumentReturned !== false) violations.push("rawDocumentReturned");
  if (policy.rawMarkdownPersisted !== false) violations.push("rawMarkdownPersisted");
  if (policy.vectorWriteAllowed !== false) violations.push("vectorWriteAllowed");
  if (policy.clusterMutationAllowed !== false) violations.push("clusterMutationAllowed");
  if (policy.ingestionAllowed !== false) violations.push("ingestionAllowed");
  if (submissions.disabled?.state !== "design-only") violations.push("disabled.state");
  if (submissions.disabled?.persisted !== false) violations.push("disabled.persisted");
  if (submissions.enabled?.state !== "pending-human-approval") violations.push("enabled.state");
  if (submissions.enabled?.persisted !== true) violations.push("enabled.persisted");
  if (submissions.rejected?.state !== "rejected-before-approval") violations.push("rejected.state");
  if (submissions.rejected?.persisted !== false) violations.push("rejected.persisted");
  if (inventory.disabled?.mode !== "designOnly") violations.push("inventory.disabled.mode");
  if (inventory.disabled?.itemCount !== 0) violations.push("inventory.disabled.itemCount");
  if (inventory.enabled?.mode !== "persistentLocal") violations.push("inventory.enabled.mode");
  if (inventory.enabled?.itemCount !== 1) violations.push("inventory.enabled.itemCount");
  if (inventory.enabled?.readOnly !== true) violations.push("inventory.enabled.readOnly");
  if (inventory.enabled?.approvalMutationAllowed !== false) {
    violations.push("inventory.enabled.approvalMutationAllowed");
  }
  if (reviews.firstApproval?.state !== "pending-human-approval") {
    violations.push("reviews.firstApproval.state");
  }
  if (!reviews.firstApproval?.remainingApprovals?.includes("cluster-sre")) {
    violations.push("reviews.firstApproval.remainingApprovals");
  }
  if (reviews.secondApproval?.state !== "approved-for-ingestion") {
    violations.push("reviews.secondApproval.state");
  }
  if (reviews.secondApproval?.ingestionJobCreated !== false) {
    violations.push("reviews.secondApproval.ingestionJobCreated");
  }
  if (reviews.rejection?.state !== "rejected-by-reviewer") {
    violations.push("reviews.rejection.state");
  }
  if (reviews.rejection?.ingestionAllowed !== false) {
    violations.push("reviews.rejection.ingestionAllowed");
  }
  if (ingestionPlan.pending?.actionMode !== "ingestionPlanOnly") {
    violations.push("ingestionPlan.pending.actionMode");
  }
  if (ingestionPlan.pending?.status !== "blocked") {
    violations.push("ingestionPlan.pending.status");
  }
  if (ingestionPlan.pending?.ingestionJobCreated !== false) {
    violations.push("ingestionPlan.pending.ingestionJobCreated");
  }
  if (ingestionPlan.approved?.actionMode !== "ingestionPlanOnly") {
    violations.push("ingestionPlan.approved.actionMode");
  }
  if (ingestionPlan.approved?.status !== "ready-for-ingestion-job") {
    violations.push("ingestionPlan.approved.status");
  }
  if (ingestionPlan.approved?.approvals !== 2) {
    violations.push("ingestionPlan.approved.approvals");
  }
  if (ingestionPlan.approved?.ingestionJobCreated !== false) {
    violations.push("ingestionPlan.approved.ingestionJobCreated");
  }
  if (ingestionPlan.approved?.vectorWriteAllowed !== false) {
    violations.push("ingestionPlan.approved.vectorWriteAllowed");
  }
  if (ingestionPlan.approved?.ingestionAllowed !== false) {
    violations.push("ingestionPlan.approved.ingestionAllowed");
  }
  if (ingestionPlan.rejected?.status !== "blocked") {
    violations.push("ingestionPlan.rejected.status");
  }
  if (ingestionPlan.rejected?.ingestionAllowed !== false) {
    violations.push("ingestionPlan.rejected.ingestionAllowed");
  }

  if (violations.length > 0) {
    fail("RAG approval queue safety", `queue policy violations=${violations.join(", ")}`);
    return;
  }

  pass(
    "RAG approval queue safety",
    "default queue is design-only, opt-in local persistence and human review are metadata-only, ingestion plans create no jobs, inventory is read-only, and rejected drafts do not persist"
  );
}

function checkInstallPlanRagIngestion(installPlanArtifact) {
  if (!installPlanArtifact) return;
  const ragIngestion = installPlanArtifact.ragIngestion ?? {};
  const violations = [];

  if (ragIngestion.actionMode !== "ingestionPlanOnly") {
    violations.push("actionMode");
  }
  if (ragIngestion.status !== "ready-for-ingestion-job") {
    violations.push("status");
  }
  if (ragIngestion.clusterMutationAttempted !== false) {
    violations.push("clusterMutationAttempted");
  }
  if (ragIngestion.vectorWriteAttempted !== false) {
    violations.push("vectorWriteAttempted");
  }
  if (ragIngestion.ingestionJobCreated !== false) {
    violations.push("ingestionJobCreated");
  }
  if (ragIngestion.mutationAllowedByThisVerifier !== false) {
    violations.push("mutationAllowedByThisVerifier");
  }
  if (!ragIngestion.requiredApprovals?.includes("rag-owner")) {
    violations.push("requiredApprovals.rag-owner");
  }
  if (!ragIngestion.requiredApprovals?.includes("cluster-sre")) {
    violations.push("requiredApprovals.cluster-sre");
  }

  if (violations.length > 0) {
    fail("install plan RAG ingestion boundary", `violations=${violations.join(", ")}`);
    return;
  }

  pass(
    "install plan RAG ingestion boundary",
    "install approval plan carries RAG ingestion as plan-only, explicitly approved, and non-mutating"
  );
}

function checkPatchPreview(patchArtifact) {
  if (!patchArtifact) return;
  if (patchArtifact.clusterMutationAttempted === true) {
    fail("Lightspeed patch preview safety", "patch preview attempted a cluster mutation");
    return;
  }
  if (patchArtifact.willPatch !== true || patchArtifact.phase !== "PatchPlanned") {
    warn("Lightspeed patch preview safety", `phase=${patchArtifact.phase ?? "unknown"} willPatch=${String(patchArtifact.willPatch)}`);
    return;
  }
  pass("Lightspeed patch preview safety", "preview is PatchPlanned and non-mutating");
}

function checkSecurityScanRunnerPolicy(runnerArtifact) {
  if (!runnerArtifact) return;
  const violations = [];
  if (!["scanEvidencePlanOnly", "scanEvidenceLocalWrite"].includes(runnerArtifact.actionMode)) {
    violations.push("actionMode");
  }
  if (artifactClusterMutationAttempted(runnerArtifact)) violations.push("clusterMutationAttempted");
  if (artifactRegistryMutationAttempted(runnerArtifact)) violations.push("registryMutationAttempted");
  if (artifactMutationAllowedByVerifier(runnerArtifact)) violations.push("mutationAllowedByThisVerifier");
  if (!["PLAN_READY", "EVIDENCE_WRITTEN"].includes(runnerArtifact.status)) {
    violations.push(`status=${runnerArtifact.status ?? "missing"}`);
  }
  const commandPlans = Array.isArray(runnerArtifact.commandPlans) ? runnerArtifact.commandPlans : [];
  if (commandPlans.length === 0) violations.push("commandPlans");
  const forbidden = commandPlans
    .flatMap((plan) => [...(plan.cli ?? []), ...(plan.dockerFallback ?? [])])
    .filter((command) => /oc\s+(apply|delete|patch|scale)|docker\s+push|podman\s+push|skopeo\s+copy|cosign\s+sign/i.test(command.command ?? ""))
    .map((command) => command.id ?? "unknown");
  if (forbidden.length > 0) {
    violations.push(`forbiddenCommands=${forbidden.join(",")}`);
  }

  if (violations.length > 0) {
    fail("security scan runner boundary", `violations=${violations.join(", ")}`);
    return;
  }

  pass(
    "security scan runner boundary",
    `actionMode=${runnerArtifact.actionMode} targetPlans=${commandPlans.length} clusterMutation=false registryMutation=false`
  );
}

function checkOcpConnectivityDiagnostic(connectivityArtifact) {
  if (!connectivityArtifact) return;
  const classification = connectivityArtifact.diagnostics?.classification ?? "unknown";
  const target = connectivityArtifact.target ?? {};
  if (artifactClusterMutationAttempted(connectivityArtifact)) {
    fail("OCP connectivity diagnostic safety", "diagnostic attempted a cluster mutation");
    return;
  }
  if (classification === "api-ready") {
    pass(
      "OCP connectivity diagnostic",
      `classification=api-ready target=${target.host ?? "unknown"}:${target.port ?? "unknown"}`
    );
    return;
  }
  warn(
    "OCP connectivity diagnostic",
    `classification=${classification} target=${target.host ?? "unknown"}:${target.port ?? "unknown"}`
  );
}

function checkOcpNetworkHandoff(networkHandoffArtifact) {
  if (!networkHandoffArtifact) return;
  const commands = networkHandoffArtifact.readOnlyCommands ?? [];
  const mutatingPattern =
    /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i;
  const violations = [];

  if (networkHandoffArtifact.actionMode !== "handoffOnly") {
    violations.push(`actionMode=${networkHandoffArtifact.actionMode ?? "missing"}`);
  }
  if (artifactClusterMutationAttempted(networkHandoffArtifact)) {
    violations.push("clusterMutationAttempted");
  }
  if (artifactRegistryMutationAttempted(networkHandoffArtifact)) {
    violations.push("registryMutationAttempted");
  }
  if (artifactMutationAllowedByVerifier(networkHandoffArtifact)) {
    violations.push("mutationAllowedByThisVerifier");
  }
  const unsafeCommands = commands
    .filter((command) => command.mutation === true || mutatingPattern.test(command.command ?? ""))
    .map((command) => command.id ?? "unknown");
  if (unsafeCommands.length > 0) {
    violations.push(`unsafeCommands=${unsafeCommands.join(",")}`);
  }

  if (violations.length > 0) {
    fail("OCP network handoff boundary", `violations=${violations.join(", ")}`);
    return;
  }

  pass(
    "OCP network handoff boundary",
    `status=${networkHandoffArtifact.status ?? "missing"} classification=${networkHandoffArtifact.diagnostics?.classification ?? "unknown"} commands=${commands.length}`
  );
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const artifacts = Object.fromEntries(
    Object.entries(options.evidence).map(([key, path]) => [
      key,
      loadArtifact(path, key)
    ])
  );

  laneResult({
    id: "mvpGate",
    label: "MVP 0.1 gate",
    artifact: artifacts.mvpGate,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "runtimeReadiness",
    label: "runtime readiness",
    artifact: artifacts.runtimeReadiness,
    desiredStatuses: ["PASS", "NEEDS_LIVE_EVIDENCE"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "runtimeRag",
    label: "runtime RAG contract",
    artifact: artifacts.runtimeRag,
    desiredStatuses: ["PASS", "NEEDS_LIVE_EVIDENCE"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "runtimeRagFixture",
    label: "runtime RAG fixture",
    artifact: artifacts.runtimeRagFixture,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "ragApprovalQueue",
    label: "RAG approval queue",
    artifact: artifacts.ragApprovalQueue,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "lightspeedRouting",
    label: "Lightspeed tool routing",
    artifact: artifacts.lightspeedRouting,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "lightspeedTrojanHorse",
    label: "Lightspeed Trojan Horse exact question",
    artifact: artifacts.lightspeedTrojanHorse,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "catalogToolchain",
    label: "catalog toolchain readiness",
    artifact: artifacts.catalogToolchain,
    desiredStatuses: ["READY_FOR_DRY_RUN", "NEEDS_TOOLING"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "imageBuild",
    label: "image build readiness",
    artifact: artifacts.imageBuild,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "ownedImageProvenance",
    label: "owned image provenance",
    artifact: artifacts.ownedImageProvenance,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "ocpConnectivity",
    label: "OCP connectivity diagnostic",
    artifact: artifacts.ocpConnectivity,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "operatorDryRun",
    label: "operator server dry-run",
    artifact: artifacts.operatorDryRun,
    desiredStatuses: ["PASS", "WARN"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "lightspeedReadiness",
    label: "Lightspeed live readiness",
    artifact: artifacts.lightspeedReadiness,
    desiredStatuses: ["PASS", "NEEDS_CONFIGURATION"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "lightspeedPatchPreview",
    label: "Lightspeed patch preview",
    artifact: artifacts.lightspeedPatchPreview,
    desiredStatuses: ["PATCH_PLANNED", "PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "externalRuntime",
    label: "external runtime evidence plan",
    artifact: artifacts.externalRuntime,
    desiredStatuses: ["APPROVAL_REQUIRED"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "securityScan",
    label: "security scan and SBOM plan",
    artifact: artifacts.securityScan,
    desiredStatuses: ["READY_FOR_SCAN", "NEEDS_TOOLING"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "securityScanRunner",
    label: "security scan evidence runner",
    artifact: artifacts.securityScanRunner,
    desiredStatuses: ["PLAN_READY", "EVIDENCE_WRITTEN"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "releasePublish",
    label: "release publish plan",
    artifact: artifacts.releasePublish,
    desiredStatuses: ["PUBLISH_APPROVAL_REQUIRED"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "installPlan",
    label: "install approval plan",
    artifact: artifacts.installPlan,
    desiredStatuses: ["APPROVAL_REQUIRED"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "liveHandoff",
    label: "live evidence handoff",
    artifact: artifacts.liveHandoff,
    desiredStatuses: ["PASS"],
    currentHeadSha: headSha
  });
  laneResult({
    id: "ocpNetworkHandoff",
    label: "OCP network handoff",
    artifact: artifacts.ocpNetworkHandoff,
    desiredStatuses: ["READY_FOR_NETWORK_REVIEW", "READY_FOR_LIVE_RECHECK", "PASS"],
    currentHeadSha: headSha
  });

  checkLightspeedRoutingScore(artifacts.lightspeedRouting);
  checkLightspeedTrojanHorse(artifacts.lightspeedTrojanHorse);
  checkRagApprovalQueuePolicy(artifacts.ragApprovalQueue);
  checkInstallPlanRagIngestion(artifacts.installPlan);
  checkImageActualBuilds(artifacts.imageBuild);
  checkOwnedImageProvenance(artifacts.ownedImageProvenance);
  checkOcpConnectivityDiagnostic(artifacts.ocpConnectivity);
  checkOcpNetworkHandoff(artifacts.ocpNetworkHandoff);
  checkPatchPreview(artifacts.lightspeedPatchPreview);
  checkSecurityScanRunnerPolicy(artifacts.securityScanRunner);

  const blockers = lanes.flatMap((lane) => lane.blockers.map((item) => `${lane.id}: ${item}`));
  const missingEvidence = lanes.flatMap((lane) =>
    lane.missingEvidence.map((item) => `${lane.id}: ${item}`)
  );
  const status = blockers.length > 0
    ? "BLOCKED"
    : missingEvidence.length > 0 || worktreeDirty
      ? "NEEDS_EVIDENCE"
      : "PASS";

  const artifact = {
    schema: "cywell.opslens.evidence-checkpoint.v0.1",
    artifactType: "opslens.evidence-checkpoint.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: [
      "AC-DASH-001",
      "AC-RAG-001",
      "AC-RAG-002",
      "AC-LS-001",
      "AC-LS-002",
      "AC-OP-004",
      "AC-OP-005",
      "AC-OCP-001",
      "AC-CERT-001",
      "AC-LIVE-HANDOFF-001"
    ],
    lanes,
    missingEvidence,
    blockers,
    risk: [
      "A PASS checkpoint only means local evidence is fresh; it does not approve cluster mutation or registry publishing.",
      "NEEDS_EVIDENCE keeps external blockers visible, especially live OCP/Lightspeed reachability and vLLM/Qdrant certification inputs.",
      "BLOCKED means an artifact is stale, unsafe, invalid, or reported a forbidden mutation attempt."
    ],
    rollbackPath: [
      "No rollback is required for this checkpoint because it reads local evidence only.",
      "Regenerate stale evidence with the verifier named by the affected lane.",
      "Do not run mutating install, patch, push, sign, or mirror commands until the corresponding approval plan is approval-required and human-approved."
    ],
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  pass("evidence checkpoint export", `${resolve(options.evidenceOut)} written without secret material`);

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    warn: checks.filter((check) => check.status === "WARN").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens evidence checkpoint: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("evidence checkpoint runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] evidence checkpoint runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
