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
  evidenceOut: "test-results/cywell-opslens-completion-gate.json",
  markdownOut: "test-results/cywell-opslens-completion-gate.md",
  roadmapPlan: "test-results/cywell-opslens-roadmap-plan-alignment.json",
  releaseEvidenceBundle: "test-results/cywell-opslens-release-evidence-bundle.json",
  releaseActionQueue: "test-results/cywell-opslens-release-action-queue.json",
  timeoutMs: 10000
};

const ticketFields = [
  "ticketPacket",
  "externalRuntimeTicketPacket",
  "externalRuntimeFinalEvidenceTicketPacket",
  "externalRuntimeProductTicketPacket",
  "securityReviewTicketPacket",
  "releasePublishTicketPacket",
  "installApprovalTicketPacket",
  "catalogToolchainTicketPacket",
  "certificationToolingTicketPacket",
  "ragProductionTicketPacket",
  "aiopsMonitoringTicketPacket",
  "runtimeEvidenceTicketPacket"
];

const evidenceRequirements = {
  ocpConnectivity: [
    "Same-HEAD OCP connectivity diagnostic is api-ready.",
    "Configured credential is accepted by the target cluster and read-only RBAC can read /version."
  ],
  lightspeedReadiness: [
    "Same-HEAD Lightspeed readiness evidence passes without auth/RBAC failure.",
    "OLSConfig CRD discovery and MCP readiness checks are current and redacted."
  ],
  installPlan: [
    "Install approval packet is refreshed after live evidence is available.",
    "Manual install path stays approval-gated and no apply/delete/scale action is run by this verifier."
  ],
  certificationReadiness: [
    "Certification tooling evidence is present for opm, operator-sdk, scorecard, and approved runner.",
    "External submission remains separate from this local verifier."
  ],
  externalRuntime: [
    "Final reviewed vLLM/Qdrant runtime image evidence exists, including scan, SBOM, provenance, and reviewer approval.",
    "Mirror/sign/push actions remain approval-gated until release approval."
  ],
  releasePublish: [
    "Release publish plan is refreshed after all external evidence is complete.",
    "Registry push, mirror, sign, catalog publish, and partner submission evidence is present or explicitly approved."
  ]
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
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  roadmapPlan: parsed.get("roadmap-plan-evidence") ?? defaults.roadmapPlan,
  releaseEvidenceBundle:
    parsed.get("release-evidence-bundle") ?? defaults.releaseEvidenceBundle,
  releaseActionQueue:
    parsed.get("release-action-queue") ?? defaults.releaseActionQueue,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

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
    return { artifact: undefined, path: absolutePath, parseError: "missing" };
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
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

function sourceSummary(id, label, loaded, currentHeadSha, acceptableStatuses) {
  const artifact = loaded.artifact;
  const ref = artifactRef(artifact);
  const status = artifact?.status ?? "missing";
  const fresh =
    artifact !== undefined &&
    ref.headSha === currentHeadSha &&
    ref.worktreeDirty === false;
  const acceptable = artifact !== undefined && acceptableStatuses.includes(status);
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true;

  if (loaded.parseError) {
    warn(`${label} source`, `${label} is missing or unreadable`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is not fresh for current head`);
  } else if (!acceptable) {
    warn(`${label} source`, `${label} status=${status}`);
  } else if (mutationViolation) {
    fail(`${label} source`, `${label} reports forbidden mutation flags`);
  } else {
    pass(`${label} source`, `${label} is fresh and acceptable`);
  }

  return {
    id,
    label,
    path: loaded.path,
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    fresh,
    acceptable,
    mutationViolation,
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

function ticketPackets(entry) {
  return ticketFields.flatMap((field) => entry?.[field] ? [entry[field]] : []);
}

function unsafeTicketReasons(entry) {
  return ticketPackets(entry).flatMap((ticket) => {
    const firstReadOnly = ticket.firstReadOnlyAction ?? {};
    const approvalGated = ticket.approvalGatedAction ?? {};
    const boundary = ticket.mutationBoundary ?? {};
    const reasons = [];
    if (firstReadOnly.mutation === true) reasons.push("first-read-only-mutates");
    if (firstReadOnly.requiresExplicitApproval === true) {
      reasons.push("first-read-only-requires-approval");
    }
    if (boundary.clusterMutationAttempted === true) reasons.push("cluster-mutation-attempted");
    if (boundary.registryMutationAttempted === true) reasons.push("registry-mutation-attempted");
    if (boundary.mutationAllowedByThisVerifier === true) {
      reasons.push("mutation-allowed-by-verifier");
    }
    if (boundary.vectorWriteAttempted === true) reasons.push("vector-write-attempted");
    if (boundary.ingestionJobCreated === true) reasons.push("ingestion-job-created");
    if (
      approvalGated.mutation === true &&
      approvalGated.requiresExplicitApproval !== true
    ) {
      reasons.push("approval-mutation-without-explicit-approval");
    }
    return reasons.length > 0
      ? [`${entry?.lane ?? "unknown"}:${ticket.id ?? "unknown"}:${reasons.join("+")}`]
      : [];
  });
}

function actionQueueSafety(actionQueue, currentHeadSha) {
  const ref = artifactRef(actionQueue);
  const criticalPath = actionQueue?.criticalPath ?? [];
  const missingDiagnostics = criticalPath
    .filter((entry) => (entry.diagnostics ?? []).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks diagnostics`);
  const missingTickets = criticalPath
    .filter((entry) => ticketPackets(entry).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks ticket packet`);
  const unsafeTickets = criticalPath.flatMap(unsafeTicketReasons).map(sanitize);
  const fresh =
    actionQueue !== undefined &&
    ref.headSha === currentHeadSha &&
    ref.worktreeDirty === false;
  const noMutation =
    actionQueue?.clusterMutationAttempted !== true &&
    actionQueue?.registryMutationAttempted !== true &&
    actionQueue?.mutationAllowedByThisVerifier !== true;
  const ready =
    actionQueue?.status === "ACTION_QUEUE_READY" &&
    fresh &&
    missingDiagnostics.length === 0 &&
    missingTickets.length === 0 &&
    unsafeTickets.length === 0 &&
    noMutation;

  return {
    status: actionQueue?.status ?? "missing",
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown",
    fresh,
    ready,
    noMutation,
    ownerPacketCount: actionQueue?.ownerPackets?.length ?? 0,
    criticalPathCount: criticalPath.length,
    missingDiagnostics,
    missingTickets,
    unsafeTickets
  };
}

function completionFromRoadmap(roadmapPlan) {
  const completion = roadmapPlan?.completion ?? {};
  return {
    totalRequirements: completion.totalRequirements ?? 0,
    passedRequirements: completion.passedRequirements ?? 0,
    remainingRequirements: completion.remainingRequirements ?? 0,
    percentComplete: completion.percentComplete ?? 0,
    remainingExternalStateCount: completion.remainingExternalStateCount ?? 0,
    remainingLocalOnlyCount: completion.remainingLocalOnlyCount ?? 0,
    remainingExternalStateGateIds: completion.remainingExternalStateGateIds ?? [],
    remainingLocalOnlyGateIds: completion.remainingLocalOnlyGateIds ?? [],
    remaining: completion.remaining ?? [],
    closure: completion.closure ?? []
  };
}

function normalizedCompletionForCompare(value) {
  return {
    totalRequirements: value?.totalRequirements ?? 0,
    passedRequirements: value?.passedRequirements ?? 0,
    remainingRequirements: value?.remainingRequirements ?? 0,
    percentComplete: value?.percentComplete ?? 0,
    remainingExternalStateCount: value?.remainingExternalStateCount ?? 0,
    remainingLocalOnlyCount: value?.remainingLocalOnlyCount ?? 0,
    remainingExternalStateGateIds: value?.remainingExternalStateGateIds ?? [],
    remainingLocalOnlyGateIds: value?.remainingLocalOnlyGateIds ?? []
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ticketIdsForCriticalPath(entry) {
  return ticketPackets(entry).map((ticket) => ticket.id).filter(Boolean);
}

function criticalPathHandoffs(actionQueue) {
  return (actionQueue?.criticalPath ?? []).map((entry) => ({
    lane: entry.lane ?? "unknown",
    owner: entry.owner ?? "unknown",
    priority: entry.priority ?? "unknown",
    actionId: entry.actionId ?? "unknown",
    nextCommand: entry.nextCommand ?? "unknown",
    evidenceNeeded: entry.evidenceNeeded ?? "unknown",
    ticketIds: ticketIdsForCriticalPath(entry),
    readOnlyCommandIds: entry.readOnlyCommandIds ?? [],
    setupCommandIds: entry.setupCommandIds ?? [],
    approvalGatedCommandIds: entry.approvalGatedCommandIds ?? []
  }));
}

const gateToCriticalPathLanes = new Map([
  ["ocpConnectivity", ["live-ocp-lightspeed", "ocp-live-reader-rbac"]],
  ["lightspeedReadiness", ["lightspeed-auth-rbac", "live-ocp-lightspeed"]],
  ["installPlan", ["install-approval"]],
  ["certificationReadiness", ["certification-toolchain"]],
  ["externalRuntime", ["external-runtime-review", "external-runtime-final-evidence"]],
  ["releasePublish", ["release-publish"]]
]);

function criticalPathForGate(actionQueue, gateId, closure) {
  const criticalPath = actionQueue?.criticalPath ?? [];
  const preferredLanes = gateToCriticalPathLanes.get(gateId) ?? [];
  return (
    criticalPath.find((entry) => preferredLanes.includes(entry.lane)) ??
    criticalPath.find((entry) => entry.actionId === closure?.actionId) ??
    criticalPath.find((entry) => entry.owner === closure?.owner) ??
    criticalPath.find((entry) => entry.priority === "blocker") ??
    criticalPath[0]
  );
}

function remainingTo100(completion, actionQueue) {
  const closureByGate = new Map(
    completion.closure.map((item) => [item.gateId, item])
  );
  return completion.remaining.map((item) => {
    const closure = closureByGate.get(item.id) ?? {};
    const criticalPath = criticalPathForGate(actionQueue, item.id, closure);
    return {
      stage: item.stage ?? "unknown",
      gateId: item.id ?? "unknown",
      status: item.status ?? "unknown",
      lane: criticalPath?.lane ?? "unknown",
      owner: criticalPath?.owner ?? closure.owner ?? "unknown",
      priority: criticalPath?.priority ?? "high",
      actionId: criticalPath?.actionId ?? closure.actionId ?? "unknown",
      nextCommand: criticalPath?.nextCommand ?? "unknown",
      evidenceNeeded: criticalPath?.evidenceNeeded ?? "unknown",
      ticketIds: ticketIdsForCriticalPath(criticalPath),
      readOnlyCommandIds: criticalPath?.readOnlyCommandIds ?? [],
      setupCommandIds: criticalPath?.setupCommandIds ?? [],
      approvalGatedCommandIds: criticalPath?.approvalGatedCommandIds ?? [],
      blockedBy: criticalPath?.blockedBy ?? [],
      acceptance: criticalPath?.acceptance ?? [],
      externalStateRequired: closure.externalStateRequired !== false,
      evidenceRequired:
        evidenceRequirements[item.id] ?? [
          "Same-HEAD evidence must move this requirement to pass."
        ]
    };
  });
}

function releaseDecisionReady(decision) {
  return (
    decision?.publishReady === true &&
    decision?.installReady === true &&
    decision?.roadmapComplete === true
  );
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(sanitize)));
}

function buildMarkdown(artifact) {
  const lines = [
    "# Cywell OpsLens Completion Gate",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Git: ${artifact.ref.branch} ${artifact.ref.headSha} dirty=${artifact.ref.worktreeDirty}`,
    `Status: ${artifact.status}`,
    `Ready to claim 100: ${String(artifact.readyToClaim100)}`,
    "",
    "## Current Decision",
    "",
    artifact.readyToClaim100
      ? "- Cywell OpsLens can be claimed as 100% complete for the tracked MVP/release gates."
      : "- Cywell OpsLens cannot be claimed as 100% complete yet because external evidence gates remain open.",
    "",
    "## Completion",
    "",
    `- Roadmap: ${artifact.completion.passedRequirements}/${artifact.completion.totalRequirements} (${artifact.completion.percentComplete}%)`,
    `- Remaining: ${artifact.completion.remainingRequirements}`,
    `- External-state remaining: ${artifact.completion.remainingExternalStateCount} (${artifact.completion.remainingExternalStateGateIds.join(", ") || "none"})`,
    `- Local-only remaining: ${artifact.completion.remainingLocalOnlyCount} (${artifact.completion.remainingLocalOnlyGateIds.join(", ") || "none"})`,
    `- Release bundle status: ${artifact.releaseEvidenceBundle.status}`,
    `- Action queue: ${artifact.actionQueue.status} criticalPath=${artifact.actionQueue.criticalPathCount}`,
    "",
    "## Remaining To 100",
    "",
    ...(artifact.remainingTo100.length
      ? artifact.remainingTo100.flatMap((gate) => [
          `- ${gate.gateId}: ${gate.status}, lane=${gate.lane}, owner=${gate.owner}, action=${gate.actionId}, external=${String(gate.externalStateRequired)}`,
          `  next=${gate.nextCommand}`,
          `  tickets=${gate.ticketIds.join(", ") || "none"} readOnly=${gate.readOnlyCommandIds.join(", ") || "none"} setup=${gate.setupCommandIds.join(", ") || "none"} approval=${gate.approvalGatedCommandIds.join(", ") || "none"}`,
          `  evidence=${gate.evidenceRequired.join(" | ")}`
        ])
      : ["- none"]),
    "",
    "## Claim Requirements",
    "",
    ...artifact.claimRequirements.map((item) =>
      `- ${item.id}: ${item.passed ? "PASS" : "NEEDS_EVIDENCE"} - ${item.detail}`
    ),
    "",
    "## Mutation Boundary",
    "",
    `- clusterMutationAttempted=${String(artifact.clusterMutationAttempted)}`,
    `- registryMutationAttempted=${String(artifact.registryMutationAttempted)}`,
    `- mutationAllowedByThisVerifier=${String(artifact.mutationAllowedByThisVerifier)}`,
    "",
    "## Missing Evidence",
    "",
    ...(artifact.missingEvidence.length
      ? artifact.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Risk",
    "",
    ...artifact.risk.map((item) => `- ${item}`),
    "",
    "## Rollback Path",
    "",
    ...artifact.rollbackPath.map((item) => `- ${item}`),
    ""
  ];

  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const roadmapLoaded = loadJson(options.roadmapPlan, "roadmap plan");
  const releaseBundleLoaded = loadJson(
    options.releaseEvidenceBundle,
    "release evidence bundle"
  );
  const actionQueueLoaded = loadJson(
    options.releaseActionQueue,
    "release action queue"
  );

  const roadmapPlan = roadmapLoaded.artifact;
  const releaseBundle = releaseBundleLoaded.artifact;
  const actionQueue = actionQueueLoaded.artifact;

  const sources = [
    sourceSummary("roadmapPlan", "Roadmap plan", roadmapLoaded, headSha, [
      "PASS",
      "NEEDS_EVIDENCE"
    ]),
    sourceSummary(
      "releaseEvidenceBundle",
      "Release evidence bundle",
      releaseBundleLoaded,
      headSha,
      ["APPROVAL_READY", "NEEDS_EVIDENCE"]
    ),
    sourceSummary(
      "releaseActionQueue",
      "Release action queue",
      actionQueueLoaded,
      headSha,
      ["ACTION_QUEUE_READY"]
    )
  ];

  const completion = completionFromRoadmap(roadmapPlan);
  const bundleCompletion = normalizedCompletionForCompare(
    releaseBundle?.roadmapCompletion
  );
  const roadmapCompletion = normalizedCompletionForCompare(completion);
  const bundleMatchesRoadmap = sameJson(roadmapCompletion, bundleCompletion);
  if (bundleMatchesRoadmap) {
    pass("roadmap completion parity", "release bundle roadmapCompletion matches roadmap plan completion");
  } else {
    fail("roadmap completion parity", "release bundle roadmapCompletion does not match roadmap plan completion");
  }

  const queueSafety = actionQueueSafety(actionQueue, headSha);
  if (queueSafety.ready) {
    pass(
      "release action queue safety",
      `${queueSafety.criticalPathCount} critical path lane(s) have diagnostics, tickets, and no unsafe mutation boundary`
    );
  } else {
    warn("release action queue safety", "action queue is not ready or not fresh");
  }

  const mutationBoundaryPassed =
    sources.every((source) => source.mutationViolation === false) &&
    releaseBundle?.clusterMutationAttempted !== true &&
    releaseBundle?.registryMutationAttempted !== true &&
    releaseBundle?.mutationAllowedByThisVerifier !== true &&
    queueSafety.noMutation;

  const decision = releaseBundle?.decision ?? {};
  const remaining = remainingTo100(completion, actionQueue);
  const claimRequirements = [
    {
      id: "clean-current-head",
      passed: worktreeDirty === false && sources.every((source) => source.fresh),
      detail: "All source evidence must be generated from the current clean Git HEAD."
    },
    {
      id: "roadmap-complete",
      passed:
        roadmapPlan?.status === "PASS" &&
        completion.remainingRequirements === 0 &&
        completion.percentComplete === 100,
      detail: "Roadmap completion must be 100% with zero remaining gates."
    },
    {
      id: "external-state-closed",
      passed:
        completion.remainingExternalStateCount === 0 &&
        completion.remainingLocalOnlyCount === 0,
      detail: "No external-state or local-only gates may remain open."
    },
    {
      id: "release-bundle-approval-ready",
      passed:
        releaseBundle?.status === "APPROVAL_READY" && releaseDecisionReady(decision),
      detail: "Release evidence bundle must say publish/install/roadmap are ready."
    },
    {
      id: "action-queue-closed",
      passed:
        queueSafety.ready === true &&
        queueSafety.criticalPathCount === 0 &&
        queueSafety.unsafeTickets.length === 0,
      detail: "Release action queue must have no critical-path blocker lanes."
    },
    {
      id: "mutation-boundary-clean",
      passed: mutationBoundaryPassed,
      detail: "Completion evidence must not mutate cluster, registry, vector store, or runtime state."
    },
    {
      id: "bundle-roadmap-parity",
      passed: bundleMatchesRoadmap,
      detail: "Release bundle and roadmap must report the same completion numbers."
    }
  ];
  const readyToClaim100 = claimRequirements.every((item) => item.passed);

  const internalBlockers = unique([
    ...sources
      .filter((source) => source.mutationViolation)
      .map((source) => `${source.label} reports forbidden mutation flags`),
    bundleMatchesRoadmap
      ? ""
      : "release evidence bundle roadmapCompletion does not match roadmap plan completion",
    mutationBoundaryPassed ? "" : "completion evidence mutation boundary is not clean",
    ...queueSafety.missingDiagnostics,
    ...queueSafety.missingTickets,
    ...queueSafety.unsafeTickets
  ]);

  const missingEvidence = unique([
    worktreeDirty ? "current worktree is dirty; regenerate completion gate after committing intended code changes" : "",
    ...sources
      .filter((source) => !source.fresh)
      .map((source) => `${source.label} is not fresh for current head`),
    ...sources
      .filter((source) => !source.acceptable)
      .map((source) => `${source.label} status=${source.status}`),
    ...remaining.map((gate) => `${gate.gateId}: ${gate.evidenceRequired.join(" ")}`),
    ...(releaseBundle?.missingEvidence ?? []).map((item) => `release bundle: ${item}`),
    queueSafety.ready ? "" : "release action queue safety is not ready"
  ]);

  const status = internalBlockers.length > 0
    ? "BLOCKED"
    : readyToClaim100
      ? "PASS"
      : "NEEDS_EVIDENCE";

  const artifact = {
    schema: "cywell.opslens.completion-gate.v0.1",
    artifactType: "opslens.completion-gate.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "completionEvidenceOnly",
    readyToClaim100,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    mutationBoundaryPassed,
    evidenceOut: resolve(options.evidenceOut),
    markdownOut: resolve(options.markdownOut),
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    completion,
    releaseEvidenceBundle: {
      status: releaseBundle?.status ?? "missing",
      decision,
      roadmapCompletion: bundleCompletion,
      bundleMatchesRoadmap,
      missingEvidenceCount: releaseBundle?.missingEvidence?.length ?? 0
    },
    actionQueue: {
      ...queueSafety,
      handoffs: criticalPathHandoffs(actionQueue)
    },
    sources,
    claimRequirements,
    remainingTo100: remaining,
    missingEvidence,
    blockers: internalBlockers,
    evidence: [
      "completion gate reads roadmap, release bundle, and action queue evidence only",
      "100% can only be claimed when roadmap completion is 100%, release bundle is approval-ready, external-state gates are closed, and action queue blockers are gone",
      "this verifier does not patch, apply, delete, scale, install, push, mirror, sign, or approve anything"
    ],
    risk: [
      "A local code-complete state is not enough for 100%; live OCP/Lightspeed, external runtime, certification, install, and release evidence still decide the final gates.",
      "This artifact must be regenerated from a clean Git HEAD before it is used as a release decision input.",
      "Approval-gated commands listed in source artifacts remain human actions, not verifier actions."
    ],
    rollbackPath: [
      "No cluster, registry, vector store, or runtime rollback is required because this verifier reads local evidence only.",
      "Regenerate roadmap, release bundle, action queue, and completion gate evidence after any source evidence changes.",
      "If a source artifact reports mutation or parity mismatch, fix the upstream verifier and rerun the release refresh chain."
    ],
    checks
  };

  const sanitizedArtifact = sanitizeArtifact(artifact, sanitize);
  const serialized = `${JSON.stringify(sanitizedArtifact, null, 2)}\n`;
  const markdown = sanitize(buildMarkdown(sanitizedArtifact));
  const secretPattern =
    /--token\s+(?!<redacted>)\S+|Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i;
  if (secretPattern.test(serialized) || secretPattern.test(markdown)) {
    throw new Error("completion gate would include unredacted secret material");
  }
  if (sensitiveEndpointLeakLike(serialized) || sensitiveEndpointLeakLike(markdown)) {
    throw new Error("completion gate would include an unredacted configured endpoint or private IP");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass(
    "completion gate export",
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
    `Cywell OpsLens completion gate: status=${status}, readyToClaim100=${String(readyToClaim100)}, remaining=${completion.remainingRequirements}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("completion gate runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] completion gate runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
