#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import {
  sanitizeArtifact,
  sanitizeCommonSensitive,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-pre-cluster-install-gate.json",
  markdownOut: "test-results/cywell-opslens-pre-cluster-install-gate.md",
  completionGate: "test-results/cywell-opslens-completion-gate.json",
  releaseEvidenceBundle: "test-results/cywell-opslens-release-evidence-bundle.json",
  releaseActionQueue: "test-results/cywell-opslens-release-action-queue.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  labHandoff: "test-results/cywell-opslens-lab-server-handoff.json",
  ocpConnectivity: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  lightspeedReadiness: "test-results/cywell-opslens-lightspeed-readiness.json",
  operatorDryRun: "test-results/cywell-opslens-operator-dry-run.json",
  timeoutMs: 10000
};

function parseArgs(argv) {
  const flags = new Set();
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
    } else {
      flags.add(key);
    }
  }
  return { flags, values };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  strict: parsed.flags.has("strict"),
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.values.get("markdown-out") ?? defaults.markdownOut,
  completionGate: parsed.values.get("completion-gate") ?? defaults.completionGate,
  releaseEvidenceBundle:
    parsed.values.get("release-evidence-bundle") ?? defaults.releaseEvidenceBundle,
  releaseActionQueue:
    parsed.values.get("release-action-queue") ?? defaults.releaseActionQueue,
  installPlan: parsed.values.get("install-plan") ?? defaults.installPlan,
  labHandoff: parsed.values.get("lab-handoff") ?? defaults.labHandoff,
  ocpConnectivity:
    parsed.values.get("ocp-connectivity") ?? defaults.ocpConnectivity,
  lightspeedReadiness:
    parsed.values.get("lightspeed-readiness") ?? defaults.lightspeedReadiness,
  operatorDryRun:
    parsed.values.get("operator-dry-run") ?? defaults.operatorDryRun,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

function sanitize(value) {
  return sanitizeCommonSensitive(value);
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
      stdout: sanitize(stdout.trim()),
      stderr: sanitize(stderr.trim())
    };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
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
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function loadJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} evidence is missing at ${absolutePath}`);
    return {
      artifact: undefined,
      path: absolutePath,
      parseError: "missing"
    };
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(
      label,
      `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`
    );
    return { artifact, path: absolutePath, parseError: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(label, `${absolutePath} is not valid JSON: ${message}`);
    return { artifact: undefined, path: absolutePath, parseError: message };
  }
}

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

const externalStateSourceIds = new Set([
  "ocpConnectivity",
  "lightspeedReadiness",
  "operatorDryRun"
]);
const directExternalReadinessGateIds = new Set([
  "ocp-api-live-ready",
  "lightspeed-live-ready",
  "operator-server-dry-run-ready"
]);
const aggregateBlockedGateIds = new Set([
  "clean-current-head",
  "completion-ready",
  "release-bundle-install-ready"
]);
const localPreparationGateIds = new Set([
  "action-queue-closed",
  "install-approval-ready",
  "crc-handoff-ready",
  "mutation-boundary-clean"
]);

function sourceSummary(id, label, loaded, headSha) {
  const artifact = loaded.artifact;
  const ref = artifactRef(artifact);
  const status = artifact?.status ?? "missing";
  const externalState = externalStateSourceIds.has(id);
  const fresh =
    artifact !== undefined &&
    ref.headSha === headSha &&
    ref.worktreeDirty === false;
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.vectorWriteAttempted === true ||
    artifact?.ingestionJobCreated === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true ||
    artifact?.policy?.mutationAllowed === true ||
    artifact?.mutationBoundary?.clusterMutationAttempted === true ||
    artifact?.mutationBoundary?.registryMutationAttempted === true ||
    artifact?.mutationBoundary?.applyDeleteScaleAttempted === true ||
    artifact?.mutationBoundary?.mutationAllowedByThisVerifier === true;

  if (loaded.parseError) {
    warn(`${label} source`, `${label} is missing or unreadable`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is not fresh for current clean head`);
  } else if (mutationViolation) {
    fail(`${label} source`, `${label} reports forbidden mutation flags`);
  } else {
    pass(`${label} source`, `${label} is fresh and non-mutating`);
  }

  return {
    id,
    label,
    path: loaded.path,
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    fresh,
    externalState,
    mutationViolation,
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

function gate(id, owner, passed, detail, evidenceNeeded, nextCommand) {
  const item = {
    id,
    owner,
    passed,
    detail: sanitize(detail),
    evidenceNeeded: sanitize(evidenceNeeded),
    nextCommand: sanitize(nextCommand),
    mutation: false
  };
  if (passed) {
    pass(id, item.detail);
  } else {
    warn(id, item.evidenceNeeded);
  }
  return item;
}

function allSourcesFresh(sources) {
  return sources.every((source) => source.fresh === true);
}

function allSourcesNonMutating(sources) {
  return sources.every((source) => source.mutationViolation === false);
}

function freshnessGatePlan({ worktreeDirty, sources }) {
  if (worktreeDirty) {
    return {
      evidenceNeeded:
        "commit intended changes, refresh release evidence, then rerun this gate",
      nextCommand: "npm run verify:release-refresh -- --security-scan-docker"
    };
  }

  const staleLocal = sources.filter(
    (source) => source.externalState !== true && source.fresh !== true
  );
  if (staleLocal.length > 0) {
    return {
      evidenceNeeded: `refresh local evidence for current head: ${staleLocal
        .map((source) => source.id)
        .join(", ")}`,
      nextCommand: "npm run verify:release-refresh -- --security-scan-docker"
    };
  }

  const staleExternal = sources.filter(
    (source) => source.externalState === true && source.fresh !== true
  );
  if (staleExternal.length > 0) {
    return {
      evidenceNeeded: `refresh live read-only evidence for current head: ${staleExternal
        .map((source) => source.id)
        .join(", ")}`,
      nextCommand:
        "npm run verify:release-refresh -- --live-timeout-ms 30000 --security-scan-docker"
    };
  }

  return {
    evidenceNeeded: "all source evidence is current for this clean Git head",
    nextCommand: "npm run verify:pre-cluster-install"
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function commandPlanRows(gates, idSet) {
  return gates
    .filter((item) => idSet.has(item.id))
    .map((item) => ({
      gateId: item.id,
      owner: item.owner,
      command: item.nextCommand,
      evidenceNeeded: item.evidenceNeeded,
      mutation: false
    }));
}

function buildMarkdown(artifact) {
  return [
    "# Cywell OpsLens Pre-Cluster Install Gate",
    "",
    `- Status: ${artifact.status}`,
    `- Strict mode: ${String(artifact.strictMode)}`,
    `- Safe to run cluster install: ${String(artifact.safeToRunClusterInstall)}`,
    `- Head: ${artifact.ref.headSha}`,
    `- Dirty: ${String(artifact.ref.worktreeDirty)}`,
    `- First blocked gate: ${artifact.firstBlockedGate?.id ?? "none"}`,
    `- First blocked owner: ${artifact.firstBlockedGate?.owner ?? "none"}`,
    `- First unblock command: ${artifact.firstBlockedGate?.nextCommand ?? "none"}`,
    `- First read-only command: ${artifact.firstBlockedGate?.readOnlyCommand ?? "none"}`,
    `- Remaining external-state gates: ${artifact.blockerSummary?.remainingExternalStateCount ?? 0}`,
    `- Remaining local-only gates: ${artifact.blockerSummary?.remainingLocalOnlyCount ?? 0}`,
    `- Stale external sources: ${(artifact.blockerSummary?.staleExternalStateSourceIds ?? []).join(", ") || "none"}`,
    `- Direct live readiness gates: ${(artifact.blockerSummary?.directExternalReadinessGateIds ?? []).join(", ") || "none"}`,
    `- Local preparation gates: ${(artifact.blockerSummary?.localPreparationGateIds ?? []).join(", ") || "none"}`,
    `- Aggregate blocked gates: ${(artifact.blockerSummary?.aggregateBlockedGateIds ?? []).join(", ") || "none"}`,
    "",
    "## Blocker Command Plan",
    `- First read-only: ${artifact.commandPlan?.firstReadOnlyCommandId ?? "none"}: \`${artifact.commandPlan?.firstReadOnlyCommand ?? "none"}\``,
    `- Strict stop/go: ${artifact.commandPlan?.strictCommandId ?? "none"}: \`${artifact.commandPlan?.strictCommand ?? "none"}\``,
    "- Direct live readiness:",
    ...(artifact.commandPlan?.directLive?.length
      ? artifact.commandPlan.directLive.map(
          (item) => `  - ${item.gateId} (${item.owner}): \`${item.command}\``
        )
      : ["  - none"]),
    "- Local preparation:",
    ...(artifact.commandPlan?.localPreparation?.length
      ? artifact.commandPlan.localPreparation.map(
          (item) => `  - ${item.gateId} (${item.owner}): \`${item.command}\``
        )
      : ["  - none"]),
    "- Aggregate blockers:",
    ...(artifact.commandPlan?.aggregate?.length
      ? artifact.commandPlan.aggregate.map(
          (item) => `  - ${item.gateId} (${item.owner}): \`${item.command}\``
        )
      : ["  - none"]),
    "",
    "## Gate Requirements",
    ...artifact.gateRequirements.map(
      (item) =>
        `- ${item.passed ? "PASS" : "BLOCKED"} ${item.id} (${item.owner}): ${item.passed ? item.detail : item.evidenceNeeded}`
    ),
    "",
    "## Evidence Sources",
    ...artifact.sources.map(
      (source) =>
        `- ${source.id}: status=${source.status}, fresh=${String(source.fresh)}, mutationViolation=${String(source.mutationViolation)}`
    ),
    "",
    "## Next Read-Only Commands",
    ...artifact.readOnlyCommands.map((command) => `- ${command.id}: \`${command.command}\``),
    "",
    "## Approval-Gated Commands Not Run",
    ...artifact.approvalGatedCommandsNotRun.map(
      (command) => `- ${command.id}: ${command.purpose}`
    ),
    "",
    "## Missing Evidence",
    ...(artifact.missingEvidence.length > 0
      ? artifact.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Boundary",
    "- This verifier does not apply manifests, patch OLSConfig, create projects, push images, fetch Secrets, delete, scale, or approve install actions.",
    "- Use `npm run verify:pre-cluster-install -- --strict` only as the final stop/go gate immediately before an explicitly approved cluster install."
  ].join("\n");
}

async function main() {
  const branch = await gitValue(["branch", "--show-current"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const loaded = {
    completionGate: loadJson(options.completionGate, "completion gate"),
    releaseEvidenceBundle: loadJson(
      options.releaseEvidenceBundle,
      "release evidence bundle"
    ),
    releaseActionQueue: loadJson(options.releaseActionQueue, "release action queue"),
    installPlan: loadJson(options.installPlan, "install approval plan"),
    labHandoff: loadJson(options.labHandoff, "lab server handoff"),
    ocpConnectivity: loadJson(options.ocpConnectivity, "OCP connectivity"),
    lightspeedReadiness: loadJson(
      options.lightspeedReadiness,
      "Lightspeed readiness"
    ),
    operatorDryRun: loadJson(options.operatorDryRun, "operator dry-run")
  };

  const sources = [
    sourceSummary("completionGate", "completion gate", loaded.completionGate, headSha),
    sourceSummary(
      "releaseEvidenceBundle",
      "release evidence bundle",
      loaded.releaseEvidenceBundle,
      headSha
    ),
    sourceSummary(
      "releaseActionQueue",
      "release action queue",
      loaded.releaseActionQueue,
      headSha
    ),
    sourceSummary("installPlan", "install approval plan", loaded.installPlan, headSha),
    sourceSummary("labHandoff", "lab server handoff", loaded.labHandoff, headSha),
    sourceSummary("ocpConnectivity", "OCP connectivity", loaded.ocpConnectivity, headSha),
    sourceSummary(
      "lightspeedReadiness",
      "Lightspeed readiness",
      loaded.lightspeedReadiness,
      headSha
    ),
    sourceSummary("operatorDryRun", "operator dry-run", loaded.operatorDryRun, headSha)
  ];

  const completionGate = loaded.completionGate.artifact;
  const releaseBundle = loaded.releaseEvidenceBundle.artifact;
  const actionQueue = loaded.releaseActionQueue.artifact;
  const installPlan = loaded.installPlan.artifact;
  const labHandoff = loaded.labHandoff.artifact;
  const ocpConnectivity = loaded.ocpConnectivity.artifact;
  const lightspeedReadiness = loaded.lightspeedReadiness.artifact;
  const operatorDryRun = loaded.operatorDryRun.artifact;
  const freshnessPlan = freshnessGatePlan({ worktreeDirty, sources });

  const gateRequirements = [
    gate(
      "clean-current-head",
      "release-manager",
      worktreeDirty === false && allSourcesFresh(sources),
      "current Git head and all source evidence are clean and current",
      freshnessPlan.evidenceNeeded,
      freshnessPlan.nextCommand
    ),
    gate(
      "completion-ready",
      "release-manager",
      completionGate?.status === "PASS" && completionGate?.readyToClaim100 === true,
      "completion gate permits the 100% claim",
      `completion gate status=${completionGate?.status ?? "missing"} readyToClaim100=${String(completionGate?.readyToClaim100 === true)}`,
      "npm run verify:completion"
    ),
    gate(
      "release-bundle-install-ready",
      "release-manager",
      releaseBundle?.status === "APPROVAL_READY" &&
        releaseBundle?.decision?.installReady === true &&
        releaseBundle?.decision?.roadmapComplete === true,
      "release bundle says install and roadmap are ready",
      `release bundle status=${releaseBundle?.status ?? "missing"} installReady=${String(releaseBundle?.decision?.installReady === true)} roadmapComplete=${String(releaseBundle?.decision?.roadmapComplete === true)}`,
      "npm run verify:release-evidence-bundle"
    ),
    gate(
      "action-queue-closed",
      "release-manager",
      actionQueue?.status === "ACTION_QUEUE_READY" &&
        (actionQueue?.criticalPath ?? []).length === 0,
      "release action queue has no critical-path install blockers",
      `release action queue criticalPathCount=${(actionQueue?.criticalPath ?? []).length}`,
      "npm run evidence:release-action-queue"
    ),
    gate(
      "install-approval-ready",
      "cluster-admin",
      installPlan?.status === "APPROVAL_REQUIRED",
      "install approval packet is ready for explicit cluster-admin approval",
      `install approval plan status=${installPlan?.status ?? "missing"}`,
      "npm run verify:install-plan"
    ),
    gate(
      "crc-handoff-ready",
      "cluster-sre",
      labHandoff?.status === "READY_FOR_EXPLICIT_CRC_HANDOFF",
      "dedicated CRC handoff package is ready for explicit lab install review",
      `lab handoff status=${labHandoff?.status ?? "missing"}`,
      "npm run verify:lab-handoff"
    ),
    gate(
      "ocp-api-live-ready",
      "cluster-admin",
      ocpConnectivity?.status === "PASS" &&
        ocpConnectivity?.classification === "api-ready",
      "target OCP API auth/RBAC evidence is live-ready",
      `OCP connectivity status=${ocpConnectivity?.status ?? "missing"} classification=${ocpConnectivity?.classification ?? "missing"}`,
      "npm run verify:ocp:connectivity -- --timeout-ms 30000"
    ),
    gate(
      "lightspeed-live-ready",
      "cluster-admin",
      lightspeedReadiness?.status === "PASS",
      "Lightspeed readiness evidence passes against the target cluster",
      `Lightspeed readiness status=${lightspeedReadiness?.status ?? "missing"}`,
      "npm run verify:lightspeed -- --timeout-ms 30000"
    ),
    gate(
      "operator-server-dry-run-ready",
      "cluster-admin",
      operatorDryRun?.status === "PASS",
      "Operator manifests passed live server-side dry-run",
      `operator dry-run status=${operatorDryRun?.status ?? "missing"}`,
      "npm run verify:operator:dry-run"
    ),
    gate(
      "mutation-boundary-clean",
      "security-reviewer",
      allSourcesNonMutating(sources),
      "all source evidence reports a clean non-mutating boundary",
      "one or more source artifacts reported forbidden mutation flags",
      "npm run verify:release-refresh -- --security-scan-docker"
    )
  ];

  const failedGates = gateRequirements.filter((item) => !item.passed);
  const mutationBlocked = sources.some((source) => source.mutationViolation);
  const safeToRunClusterInstall = failedGates.length === 0 && mutationBlocked === false;
  const refreshReleaseChainCommand = freshnessPlan.nextCommand.startsWith(
    "npm run verify:release-refresh"
  )
    ? freshnessPlan.nextCommand
    : "npm run verify:release-refresh -- --security-scan-docker";
  const status = mutationBlocked
    ? "BLOCKED_BY_MUTATION_BOUNDARY"
    : safeToRunClusterInstall
      ? "READY_FOR_CLUSTER_INSTALL"
      : "BLOCKED_BY_EVIDENCE_GAPS";
  const readOnlyCommands = [
    {
      id: "refresh-release-chain",
      command: refreshReleaseChainCommand,
      mutation: false
    },
    {
      id: "pre-cluster-install-preview",
      command: "npm run verify:pre-cluster-install",
      mutation: false
    },
    {
      id: "pre-cluster-install-strict",
      command: "npm run verify:pre-cluster-install -- --strict",
      mutation: false
    }
  ];
  const approvalGatedCommandsNotRun = [
    {
      id: "cluster-install-apply",
      purpose: "Apply Operator/catalog/install manifests only after this gate is READY_FOR_CLUSTER_INSTALL and cluster-admin approval is explicit."
    },
    {
      id: "lightspeed-olsconfig-patch",
      purpose: "Patch OLSConfig only after the patch preview is approved and target Lightspeed evidence is current."
    },
    {
      id: "registry-push-or-mirror",
      purpose: "Push or mirror images only after registry owner approval and image evidence are complete."
    }
  ];
  const firstFailedGate = failedGates[0];
  const firstReadOnlyCommand = readOnlyCommands[0];
  const strictCommand = readOnlyCommands.find(
    (command) => command.id === "pre-cluster-install-strict"
  );
  const firstBlockedGate = firstFailedGate
    ? {
        id: firstFailedGate.id,
        owner: firstFailedGate.owner,
        evidenceNeeded: firstFailedGate.evidenceNeeded,
        nextCommand: firstFailedGate.nextCommand,
        readOnlyCommandId: firstReadOnlyCommand.id,
        readOnlyCommand: firstReadOnlyCommand.command,
        strictCommandId: strictCommand?.id ?? "pre-cluster-install-strict",
        strictCommand: strictCommand?.command ?? "npm run verify:pre-cluster-install -- --strict",
        mutation: false
      }
    : null;
  const completionBoundary = completionGate?.completion ?? {};
  const staleExternalStateSourceIds = sources
    .filter((source) => source.externalState === true && source.fresh !== true)
    .map((source) => source.id);
  const staleLocalEvidenceSourceIds = sources
    .filter((source) => source.externalState !== true && source.fresh !== true)
    .map((source) => source.id);
  const blockerSummary = {
    failedGateCount: failedGates.length,
    remainingExternalStateCount:
      completionBoundary.remainingExternalStateCount ?? 0,
    remainingLocalOnlyCount: completionBoundary.remainingLocalOnlyCount ?? 0,
    remainingExternalStateGateIds:
      completionBoundary.remainingExternalStateGateIds ?? [],
    remainingLocalOnlyGateIds:
      completionBoundary.remainingLocalOnlyGateIds ?? [],
    staleExternalStateSourceIds,
    staleLocalEvidenceSourceIds,
    directExternalReadinessGateIds: failedGates
      .filter((item) => directExternalReadinessGateIds.has(item.id))
      .map((item) => item.id),
    localPreparationGateIds: failedGates
      .filter((item) => localPreparationGateIds.has(item.id))
      .map((item) => item.id),
    aggregateBlockedGateIds: failedGates
      .filter((item) => aggregateBlockedGateIds.has(item.id))
      .map((item) => item.id)
  };
  const commandPlan = {
    firstReadOnlyCommandId: firstReadOnlyCommand.id,
    firstReadOnlyCommand: firstReadOnlyCommand.command,
    strictCommandId: strictCommand?.id ?? "pre-cluster-install-strict",
    strictCommand: strictCommand?.command ?? "npm run verify:pre-cluster-install -- --strict",
    directLive: commandPlanRows(failedGates, directExternalReadinessGateIds),
    localPreparation: commandPlanRows(failedGates, localPreparationGateIds),
    aggregate: commandPlanRows(failedGates, aggregateBlockedGateIds)
  };

  if (safeToRunClusterInstall) {
    pass("pre-cluster install gate", "all strict install gates are satisfied");
  } else if (options.strict) {
    fail(
      "pre-cluster install gate",
      `strict mode blocks install: ${failedGates.map((item) => item.id).join(", ")}`
    );
  } else {
    warn(
      "pre-cluster install gate",
      `preview mode blocks install if --strict is used: ${failedGates.map((item) => item.id).join(", ")}`
    );
  }

  const artifact = {
    schema: "cywell.opslens.pre-cluster-install-gate.v0.1",
    artifactType: "opslens.pre-cluster-install-gate.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "preClusterInstallGateOnly",
    strictMode: options.strict,
    strictExitWouldFail: !safeToRunClusterInstall,
    safeToRunClusterInstall,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    evidenceOut: resolve(options.evidenceOut),
    markdownOut: resolve(options.markdownOut),
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    sources,
    gateRequirements,
    firstBlockedGate,
    blockerSummary,
    commandPlan,
    failedGateIds: failedGates.map((item) => item.id),
    missingEvidence: unique(failedGates.map((item) => item.evidenceNeeded)),
    blockers: unique([
      ...sources
        .filter((source) => source.mutationViolation)
        .map((source) => `${source.id} reported forbidden mutation flags`),
      ...failedGates.map((item) => `${item.id}: ${item.evidenceNeeded}`)
    ]),
    readOnlyCommands,
    approvalGatedCommandsNotRun,
    evidence: [
      "pre-cluster install gate reads local evidence artifacts only",
      "strict mode intentionally fails when completion, release, install, lab, OCP, Lightspeed, or dry-run evidence is incomplete",
      "this verifier does not apply manifests, patch OLSConfig, push images, fetch Secrets, delete, scale, or approve anything"
    ],
    risk: [
      "Running cluster install while this gate is blocked can create partial Operator, catalog, Lightspeed, or image state that is harder to diagnose.",
      "A passing local build is not enough; target OCP auth/RBAC, Lightspeed readiness, install approval, and CRC handoff evidence must be current.",
      "Approval-gated commands in source artifacts remain human actions, not verifier actions."
    ],
    rollbackPath: [
      "No rollback is required for this verifier because it reads local evidence only.",
      "If strict mode blocks, close the named evidence gates and regenerate the release evidence chain.",
      "If a source artifact reports mutation, stop and inspect that upstream artifact before any install action."
    ],
    checks
  };

  const sanitizedArtifact = sanitizeArtifact(artifact, sanitize);
  const serialized = `${JSON.stringify(sanitizedArtifact, null, 2)}\n`;
  const markdown = `${sanitize(buildMarkdown(sanitizedArtifact))}\n`;
  if (sensitiveEndpointLeakLike(serialized) || sensitiveEndpointLeakLike(markdown)) {
    throw new Error("pre-cluster install gate would include an unredacted configured endpoint or private IP");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass(
    "pre-cluster install gate export",
    `${resolve(options.evidenceOut)} and ${resolve(options.markdownOut)} written without secret material`
  );

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
  console.log(
    `Cywell OpsLens pre-cluster install gate: status=${status}, strict=${String(options.strict)}, safeToRunClusterInstall=${String(safeToRunClusterInstall)}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );

  if (options.strict && !safeToRunClusterInstall) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(
    "pre-cluster install gate runtime",
    error instanceof Error ? error.message : String(error)
  );
  console.error(
    `[FAIL] pre-cluster install gate runtime: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
