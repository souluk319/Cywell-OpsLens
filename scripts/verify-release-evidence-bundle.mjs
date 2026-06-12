#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-evidence-bundle.json",
  mvpGate: "test-results/cywell-opslens-mvp-0.1-gate.json",
  imageBuild: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  releasePlan: "test-results/cywell-opslens-release-publish-plan.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  liveHandoff: "test-results/cywell-opslens-live-evidence-handoff.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
  roadmapPlan: "test-results/cywell-opslens-roadmap-plan-alignment.json",
  timeoutMs: 10000
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
  mvpGate: parsed.get("mvp-gate-evidence") ?? defaults.mvpGate,
  imageBuild: parsed.get("image-build-evidence") ?? defaults.imageBuild,
  ownedImageProvenance:
    parsed.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenance,
  externalRuntime: parsed.get("external-runtime-evidence") ?? defaults.externalRuntime,
  releasePlan: parsed.get("release-plan-evidence") ?? defaults.releasePlan,
  installPlan: parsed.get("install-plan-evidence") ?? defaults.installPlan,
  liveHandoff: parsed.get("live-handoff-evidence") ?? defaults.liveHandoff,
  evidenceCheckpoint:
    parsed.get("evidence-checkpoint") ?? defaults.evidenceCheckpoint,
  roadmapPlan: parsed.get("roadmap-plan-evidence") ?? defaults.roadmapPlan,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
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
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function loadJson(path, label) {
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

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function artifactFresh(artifact, currentHeadSha) {
  const ref = artifactRef(artifact);
  return ref.headSha === currentHeadSha && ref.worktreeDirty === false;
}

function sourceSummary(id, label, path, artifact, currentHeadSha, acceptableStatuses) {
  const ref = artifactRef(artifact);
  const status = artifact?.status ?? "missing";
  const fresh = artifact ? artifactFresh(artifact, currentHeadSha) : false;
  const acceptable = artifact && acceptableStatuses.includes(status);
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true;

  if (!artifact) {
    warn(`${label} source`, `${label} is missing`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is stale head=${ref.headSha ?? "missing"} dirty=${String(ref.worktreeDirty ?? "unknown")}`);
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
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    fresh,
    acceptable: Boolean(acceptable),
    mutationViolation,
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(sanitize)));
}

function commandSummary(artifacts) {
  const releaseCommands = (artifacts.releasePlan?.commands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const installCommands = (artifacts.installPlan?.commands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const handoffCommands = (artifacts.liveHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false
  }));
  return {
    readOnly: [...releaseCommands, ...installCommands, ...handoffCommands]
      .filter((command) => command.mutation === false),
    mutatingApprovalRequired: [...releaseCommands, ...installCommands]
      .filter((command) => command.mutation === true),
    forbiddenWithoutApproval: [
      "oc apply",
      "oc delete",
      "oc patch",
      "oc scale",
      "docker push",
      "podman push",
      "skopeo copy",
      "cosign sign"
    ]
  };
}

function stageSummary(roadmapPlan) {
  return (roadmapPlan?.stages ?? []).map((stage) => ({
    id: stage.id ?? "unknown",
    title: stage.title ?? "unknown",
    status: stage.status ?? "unknown",
    missingEvidence: stage.missingEvidence ?? [],
    blockers: stage.blockers ?? []
  }));
}

function approvalSummary(artifacts) {
  return {
    release: artifacts.releasePlan?.requiredApprovals ?? [
      "release-manager",
      "registry-admin",
      "security-reviewer",
      "product-owner"
    ],
    install: artifacts.installPlan?.requiredApprovals ?? [
      "cluster-admin",
      "cluster-sre",
      "security-reviewer",
      "product-owner"
    ],
    externalRuntime: artifacts.externalRuntime?.requiredApprovals ?? [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    ragIngestion: artifacts.installPlan?.ragIngestion?.requiredApprovals ?? [
      "rag-owner",
      "cluster-sre"
    ]
  };
}

function mutationBoundary(artifacts) {
  const flags = [
    ["releasePlan.registryMutationAttempted", artifacts.releasePlan?.registryMutationAttempted],
    ["releasePlan.clusterMutationAttempted", artifacts.releasePlan?.clusterMutationAttempted],
    ["releasePlan.mutationAllowedByThisVerifier", artifacts.releasePlan?.mutationAllowedByThisVerifier],
    ["installPlan.clusterMutationAttempted", artifacts.installPlan?.clusterMutationAttempted],
    ["installPlan.mutationAllowedByThisVerifier", artifacts.installPlan?.mutationAllowedByThisVerifier],
    ["externalRuntime.registryMutationAttempted", artifacts.externalRuntime?.registryMutationAttempted],
    ["externalRuntime.clusterMutationAttempted", artifacts.externalRuntime?.clusterMutationAttempted],
    ["externalRuntime.mutationAllowedByThisVerifier", artifacts.externalRuntime?.mutationAllowedByThisVerifier],
    ["ownedImageProvenance.registryMutationAttempted", artifacts.ownedImageProvenance?.registryMutationAttempted],
    ["ownedImageProvenance.clusterMutationAttempted", artifacts.ownedImageProvenance?.clusterMutationAttempted],
    ["liveHandoff.clusterMutationAttempted", artifacts.liveHandoff?.clusterMutationAttempted],
    ["liveHandoff.registryMutationAttempted", artifacts.liveHandoff?.registryMutationAttempted]
  ];
  return {
    passed: flags.every(([, value]) => value !== true),
    flags: Object.fromEntries(flags.map(([key, value]) => [key, value === true]))
  };
}

function releaseDecision(artifacts) {
  const checkpointStatus = artifacts.evidenceCheckpoint?.status ?? "missing";
  const releaseStatus = artifacts.releasePlan?.status ?? "missing";
  const installStatus = artifacts.installPlan?.status ?? "missing";
  const roadmapStatus = artifacts.roadmapPlan?.status ?? "missing";
  return {
    publishReady: releaseStatus === "PUBLISH_APPROVAL_REQUIRED",
    installReady: installStatus === "APPROVAL_REQUIRED",
    roadmapComplete: roadmapStatus === "PASS",
    checkpointStatus,
    releaseStatus,
    installStatus,
    roadmapStatus
  };
}

function evidenceGaps(artifacts, sources) {
  return unique([
    ...sources
      .filter((source) => !source.fresh)
      .map((source) => `${source.label} is not fresh for current head`),
    ...sources
      .filter((source) => !source.acceptable)
      .map((source) => `${source.label} status=${source.status}`),
    ...(artifacts.evidenceCheckpoint?.missingEvidence ?? []),
    ...(artifacts.releasePlan?.missingEvidence ?? []),
    ...(artifacts.installPlan?.missingEvidence ?? []),
    ...(artifacts.externalRuntime?.missingEvidence ?? []),
    ...(artifacts.liveHandoff?.missingEvidence ?? [])
  ]);
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

  const artifacts = {
    mvpGate: loadJson(options.mvpGate, "MVP gate"),
    imageBuild: loadJson(options.imageBuild, "image build readiness"),
    ownedImageProvenance: loadJson(options.ownedImageProvenance, "owned image provenance"),
    externalRuntime: loadJson(options.externalRuntime, "external runtime plan"),
    releasePlan: loadJson(options.releasePlan, "release publish plan"),
    installPlan: loadJson(options.installPlan, "install approval plan"),
    liveHandoff: loadJson(options.liveHandoff, "live evidence handoff"),
    evidenceCheckpoint: loadJson(options.evidenceCheckpoint, "evidence checkpoint"),
    roadmapPlan: loadJson(options.roadmapPlan, "roadmap plan alignment")
  };

  const sources = [
    sourceSummary("mvpGate", "MVP gate", options.mvpGate, artifacts.mvpGate, headSha, ["PASS"]),
    sourceSummary("imageBuild", "image build readiness", options.imageBuild, artifacts.imageBuild, headSha, ["PASS"]),
    sourceSummary("ownedImageProvenance", "owned image provenance", options.ownedImageProvenance, artifacts.ownedImageProvenance, headSha, ["PASS"]),
    sourceSummary("externalRuntime", "external runtime plan", options.externalRuntime, artifacts.externalRuntime, headSha, ["APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("releasePlan", "release publish plan", options.releasePlan, artifacts.releasePlan, headSha, ["PUBLISH_APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("installPlan", "install approval plan", options.installPlan, artifacts.installPlan, headSha, ["APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("liveHandoff", "live evidence handoff", options.liveHandoff, artifacts.liveHandoff, headSha, ["PASS"]),
    sourceSummary("evidenceCheckpoint", "evidence checkpoint", options.evidenceCheckpoint, artifacts.evidenceCheckpoint, headSha, ["PASS", "NEEDS_EVIDENCE"]),
    sourceSummary("roadmapPlan", "roadmap plan alignment", options.roadmapPlan, artifacts.roadmapPlan, headSha, ["PASS", "NEEDS_EVIDENCE"])
  ];

  const mutations = mutationBoundary(artifacts);
  if (mutations.passed) {
    pass("bundle mutation boundary", "all release bundle source artifacts keep mutation flags false");
  } else {
    fail("bundle mutation boundary", "one or more source artifacts reports mutation flags");
  }

  const commands = commandSummary(artifacts);
  const unsafeCommands = commands.readOnly.filter((command) => command.mutation);
  if (unsafeCommands.length > 0) {
    fail("bundle command boundary", `read-only command list contains mutation commands: ${unsafeCommands.map((command) => command.id).join(", ")}`);
  } else {
    pass("bundle command boundary", `${commands.readOnly.length} read-only command(s), ${commands.mutatingApprovalRequired.length} approval-gated mutating command(s)`);
  }

  const missingEvidence = evidenceGaps(artifacts, sources);
  const decision = releaseDecision(artifacts);
  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : worktreeDirty || missingEvidence.length > 0 || !decision.publishReady || !decision.installReady || !decision.roadmapComplete
      ? "NEEDS_EVIDENCE"
      : "APPROVAL_READY";

  const artifact = {
    schema: "cywell.opslens.release-evidence-bundle.v0.1",
    artifactType: "opslens.release-evidence-bundle.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "bundleOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: [
      "AC-CERT-001",
      "AC-OP-005",
      "AC-LIVE-HANDOFF-001",
      "AC-DASH-001"
    ],
    decision,
    approvals: approvalSummary(artifacts),
    stages: stageSummary(artifacts.roadmapPlan),
    sources,
    imageProvenance: {
      status: artifacts.ownedImageProvenance?.status ?? "missing",
      requiredImages: artifacts.ownedImageProvenance?.requiredImages ?? [],
      requiredPassed: artifacts.ownedImageProvenance?.summary?.requiredPassed === true,
      images: (artifacts.ownedImageProvenance?.images ?? []).map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        status: image.status ?? "unknown",
        imageId: image.imageId ?? "unknown",
        repoDigests: image.repoDigests ?? [],
        user: image.user ?? "unknown"
      }))
    },
    commands,
    mutationBoundary: mutations,
    missingEvidence,
    blockers: unique([
      ...(artifacts.evidenceCheckpoint?.blockers ?? []),
      ...(artifacts.roadmapPlan?.blockers ?? [])
    ]),
    risk: unique([
      ...(artifacts.releasePlan?.risk ?? []),
      ...(artifacts.installPlan?.risk ?? []),
      ...(artifacts.externalRuntime?.risk ?? []),
      ...(artifacts.liveHandoff?.risk ?? []),
      "This bundle is a read-only release packet. It does not publish images, install Operators, patch OLSConfig, or approve RAG ingestion."
    ]),
    rollbackPath: unique([
      ...(artifacts.releasePlan?.rollbackPath ?? []),
      ...(artifacts.installPlan?.rollbackPath ?? []),
      ...(artifacts.liveHandoff?.rollbackPath ?? []),
      "Regenerate this bundle after any source evidence artifact changes."
    ]),
    evidence: [
      "release evidence bundle reads current local evidence artifacts only",
      "publish/install readiness remains false until required evidence and human approvals exist",
      "secret-bearing values are redacted before export"
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (/--token\s+(?!<redacted>)\S+/i.test(serialized) || /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized)) {
    throw new Error("release evidence bundle would include unredacted secret material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("release evidence bundle export", `${resolve(options.evidenceOut)} written without secret material`);

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
  console.log(`Cywell OpsLens release evidence bundle: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("release evidence bundle runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] release evidence bundle runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
