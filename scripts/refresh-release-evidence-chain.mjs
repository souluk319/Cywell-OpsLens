#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import {
  sanitizeArtifact,
  sanitizeConfiguredEndpoints,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-evidence-refresh.json",
  commandTimeoutMs: 600000,
  liveTimeoutMs: 30000
};

const evidencePaths = {
  mvpGate: "test-results/cywell-opslens-mvp-0.1-gate.json",
  opsBrain: "test-results/cywell-opslens-opsbrain-contract.json",
  envContract: "test-results/cywell-opslens-env-contract.json",
  ocpTargetProfile: "test-results/cywell-opslens-ocp-target-profile.json",
  runtimeReadiness: "test-results/cywell-opslens-runtime-readiness.json",
  runtimeRag: "test-results/cywell-opslens-runtime-rag-contract.json",
  runtimeRagFixture: "test-results/cywell-opslens-runtime-rag-fixture.json",
  aiopsIncidentPipeline: "test-results/cywell-opslens-aiops-incident-pipeline.json",
  ragApprovalQueue: "test-results/cywell-opslens-rag-approval-queue.json",
  ragProductionReadiness: "test-results/cywell-opslens-rag-production-readiness.json",
  consolePluginAssets: "test-results/cywell-opslens-console-plugin-assets.json",
  lightspeedExtensionPoint: "test-results/cywell-opslens-lightspeed-extension-point.json",
  lightspeedRouting: "test-results/cywell-opslens-lightspeed-tool-routing.json",
  lightspeedTrojanHorse: "test-results/cywell-opslens-lightspeed-trojan-horse.json",
  lightspeedIntegrationHandoff:
    "test-results/cywell-opslens-lightspeed-integration-handoff.json",
  certificationReadiness: "test-results/cywell-opslens-certification-readiness.json",
  certificationCiWorkflow:
    "test-results/cywell-opslens-certification-ci-workflow.json",
  certificationCiRunnerDraft:
    "docs/release/evidence/certification/approved-ci-runner.draft.json",
  communityOperatorSubmission: "test-results/cywell-opslens-community-operator-submission.json",
  catalogToolchain: "test-results/cywell-opslens-catalog-toolchain-plan.json",
  imageBuild: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  ocpConnectivity: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  ocpAuthRbacPlan: "test-results/cywell-opslens-ocp-auth-rbac-plan.json",
  operatorPackage: "test-results/cywell-opslens-operator-package.json",
  operatorReconcile: "test-results/cywell-opslens-operator-reconcile.json",
  operatorRuntimeParity: "test-results/cywell-opslens-operator-runtime-parity.json",
  operatorDryRun: "test-results/cywell-opslens-operator-dry-run.json",
  lightspeedReadiness: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreview: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  externalRuntimeCandidateMatrix: "test-results/cywell-opslens-external-runtime-candidate-matrix.json",
  externalRuntimeReviewPacket: "test-results/cywell-opslens-external-runtime-review-packet.json",
  securityScan: "test-results/cywell-opslens-security-scan-plan.json",
  securityScanRunner: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  releasePublish: "test-results/cywell-opslens-release-publish-plan.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  liveHandoff: "test-results/cywell-opslens-live-evidence-handoff.json",
  ocpNetworkHandoff: "test-results/cywell-opslens-ocp-network-handoff.json",
  ocpNetworkHandoffApiFallback:
    "test-results/cywell-opslens-ocp-network-handoff-api-fallback.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
  labBootstrap: "test-results/cywell-opslens-lab-bootstrap-plan.json",
  labImageMap: "test-results/cywell-opslens-lab-image-map-preview.json",
  labHandoff: "test-results/cywell-opslens-lab-server-handoff.json",
  roadmapPlan: "test-results/cywell-opslens-roadmap-plan-alignment.json",
  releaseEvidenceBundle: "test-results/cywell-opslens-release-evidence-bundle.json",
  releaseActionQueue: "test-results/cywell-opslens-release-action-queue.json",
  completionGate: "test-results/cywell-opslens-completion-gate.json",
  preClusterInstallGate: "test-results/cywell-opslens-pre-cluster-install-gate.json"
};

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
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
  return { values, flags };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  commandTimeoutMs: Number(parsed.values.get("command-timeout-ms") ?? defaults.commandTimeoutMs),
  liveTimeoutMs: Number(parsed.values.get("live-timeout-ms") ?? defaults.liveTimeoutMs),
  withE2e: parsed.flags.has("with-e2e"),
  skipImageBuild: parsed.flags.has("skip-image-build"),
  skipLive: parsed.flags.has("skip-live"),
  securityScanDocker: parsed.flags.has("security-scan-docker"),
  failFast: parsed.flags.has("fail-fast")
};

const startedAt = new Date().toISOString();
const checks = [];
const commandResults = [];

function sanitize(value) {
  return sanitizeConfiguredEndpoints(String(value ?? ""))
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function tail(value, maxLength = 3000) {
  const sanitized = sanitize(value);
  return sanitized.length > maxLength ? sanitized.slice(-maxLength) : sanitized;
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

function npmCommand() {
  return "npm";
}

function safeCmdArg(arg) {
  if (!/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(arg)) {
    throw new Error(`unsafe npm argument for Windows command wrapper: ${arg}`);
  }
  return arg;
}

function stepInvocation(step) {
  if (process.platform !== "win32") {
    return { command: npmCommand(), args: step.args };
  }
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", ["npm", ...step.args].map(safeCmdArg).join(" ")]
  };
}

async function runCapture(command, args, timeoutMs = 10000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
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
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function npmScript(id, phase, script, args = [], extra = {}) {
  return {
    id,
    phase,
    command: `npm run ${script}${args.length > 0 ? ` -- ${args.join(" ")}` : ""}`,
    args: ["run", script, ...(args.length > 0 ? ["--", ...args] : [])],
    expectedNonZero: extra.expectedNonZero === true,
    timeoutMs: extra.timeoutMs ?? options.commandTimeoutMs,
    skipped: extra.skipped === true,
    skipReason: extra.skipReason
  };
}

function buildChain() {
  const mvpGateArgs = [
    ...(options.withE2e ? [] : ["--skip-e2e"]),
    "--skip-images"
  ];
  const commands = [
    npmScript("mvp-gate", "core", "verify:mvp", mvpGateArgs),
    npmScript("opsbrain-contract", "core", "verify:opsbrain"),
    npmScript("env-contract", "core", "verify:env"),
    npmScript("ocp-target-profile", "core", "verify:ocp:target-profile"),
    npmScript("runtime-readiness", "core", "verify:runtime"),
    npmScript("runtime-rag", "core", "verify:runtime-rag"),
    npmScript("runtime-rag-fixture", "core", "verify:runtime-rag:fixture"),
    npmScript("aiops-incident-pipeline", "core", "verify:aiops"),
    npmScript("rag-approval-queue", "core", "verify:rag:approval-queue"),
    npmScript("rag-production-readiness", "core", "verify:rag:production-readiness"),
    npmScript("console-plugin-assets", "core", "verify:console-plugin"),
    npmScript("operator-package", "core", "verify:operator"),
    npmScript("operator-reconcile", "core", "verify:operator:reconcile"),
    npmScript("operator-runtime-parity", "core", "verify:operator:runtime"),
    npmScript("lightspeed-extension-point", "core", "verify:lightspeed-extension"),
    npmScript("lightspeed-routing", "core", "verify:lightspeed:routing"),
    npmScript("lightspeed-trojan-horse", "core", "verify:lightspeed:trojan-horse"),
    npmScript("community-operator-submission", "release", "verify:community-submission"),
    npmScript("certification-readiness", "release", "verify:certification"),
    npmScript("catalog-toolchain", "release", "verify:catalog-toolchain"),
    npmScript(
      "certification-ci-runner-draft",
      "release",
      "evidence:certification:ci-runner-draft",
      ["--force"]
    ),
    npmScript("certification-ci-workflow", "release", "verify:certification-ci-workflow"),
    options.skipImageBuild
      ? npmScript("image-readiness-static", "release", "verify:images")
      : npmScript("image-readiness-build", "release", "verify:images:build", [], { timeoutMs: Math.max(options.commandTimeoutMs, 900000) }),
    npmScript("owned-image-provenance", "release", "verify:owned-image-provenance"),
    npmScript("external-runtime-draft-digests", "release", "evidence:external-runtime:draft:digests"),
    npmScript("external-runtime-plan", "release", "verify:external-runtime-plan"),
    options.securityScanDocker
      ? npmScript("security-scan-runner-docker", "release", "evidence:security-scan:docker", [], {
          timeoutMs: Math.max(options.commandTimeoutMs, 900000)
        })
      : npmScript("security-scan-runner-plan", "release", "evidence:security-scan"),
    npmScript(
      "security-review-drafts-all",
      "release",
      "evidence:security-review:draft",
      ["--all", "--force"]
    ),
    npmScript("security-scan-plan", "release", "verify:security-scan-plan")
  ];

  if (options.skipLive) {
    commands.push(
      npmScript("ocp-connectivity", "live", "verify:ocp:connectivity", [], {
        skipped: true,
        skipReason: "--skip-live"
      }),
      npmScript("operator-dry-run", "live", "verify:operator:dry-run", [], {
        skipped: true,
        skipReason: "--skip-live"
      }),
      npmScript("lightspeed-readiness", "live", "verify:lightspeed", [], {
        skipped: true,
        skipReason: "--skip-live"
      }),
      npmScript("ocp-live-reader-smoke", "live", "verify:ocp:live-reader-smoke", [], {
        skipped: true,
        skipReason: "--skip-live"
      })
    );
  } else {
    commands.push(
      npmScript("ocp-connectivity", "live", "verify:ocp:connectivity", ["--timeout-ms", String(options.liveTimeoutMs)], {
        expectedNonZero: true,
        timeoutMs: Math.max(options.liveTimeoutMs + 15000, 45000)
      }),
      npmScript("operator-dry-run", "live", "verify:operator:dry-run", [], {
        expectedNonZero: true,
        timeoutMs: Math.max(options.liveTimeoutMs + 30000, 60000)
      }),
      npmScript("lightspeed-readiness", "live", "verify:lightspeed", ["--timeout-ms", String(options.liveTimeoutMs)], {
        expectedNonZero: true,
        timeoutMs: Math.max(options.liveTimeoutMs + 30000, 60000)
      }),
      npmScript("ocp-live-reader-smoke", "live", "verify:ocp:live-reader-smoke", ["--timeout-ms", String(options.liveTimeoutMs)], {
        timeoutMs: Math.max(options.liveTimeoutMs * 2 + 60000, 120000)
      })
    );
  }

  commands.push(
    npmScript("ocp-auth-rbac-plan", "approval", "evidence:ocp-auth-rbac-plan"),
    npmScript("lightspeed-patch-preview-fixture", "live", "verify:lightspeed:patch-preview:fixture"),
    npmScript("release-plan", "approval", "verify:release-plan"),
    npmScript("external-runtime-candidate-matrix", "approval", "evidence:external-runtime:candidates"),
    npmScript("external-runtime-review-packet", "approval", "evidence:external-runtime:review-packet"),
    npmScript("install-plan", "approval", "verify:install-plan"),
    npmScript("live-handoff", "approval", "verify:live-handoff"),
    npmScript("ocp-network-handoff", "approval", "evidence:ocp-network-handoff"),
    npmScript("ocp-network-handoff-api-fallback", "approval", "verify:ocp:handoff-api-fallback"),
    npmScript("lightspeed-integration-handoff", "approval", "verify:lightspeed:integration-handoff"),
    npmScript("evidence-checkpoint", "approval", "verify:evidence-checkpoint"),
    npmScript("ocp-network-handoff-post-checkpoint", "approval", "evidence:ocp-network-handoff"),
    npmScript("lab-image-map", "lab", "verify:lab-image-map"),
    npmScript("lab-handoff", "lab", "verify:lab-handoff"),
    npmScript("lab-bootstrap", "lab", "verify:lab-bootstrap"),
    npmScript("roadmap-plan", "approval", "verify:roadmap-plan", [], { expectedNonZero: true }),
    npmScript("release-evidence-bundle", "approval", "verify:release-evidence-bundle"),
    npmScript(
      "release-action-queue",
      "approval",
      "evidence:release-action-queue",
      ["--defer-release-refresh-source"]
    ),
    npmScript("roadmap-plan-final", "approval", "verify:roadmap-plan", [], { expectedNonZero: true }),
    npmScript("release-evidence-bundle-final", "approval", "verify:release-evidence-bundle"),
    npmScript(
      "release-action-queue-final",
      "approval",
      "evidence:release-action-queue",
      ["--defer-release-refresh-source"]
    ),
    npmScript("completion-gate-final", "approval", "verify:completion"),
    npmScript(
      "pre-cluster-install-gate-final",
      "approval",
      "verify:pre-cluster-install"
    )
  );

  return commands;
}

async function runStep(step) {
  const started = Date.now();
  if (step.skipped) {
    warn(step.id, `skipped ${step.command}: ${step.skipReason}`);
    const result = {
      id: step.id,
      phase: step.phase,
      command: step.command,
      status: "SKIPPED",
      expectedNonZero: step.expectedNonZero,
      exitCode: null,
      durationMs: 0,
      stdoutTail: "",
      stderrTail: step.skipReason ?? "skipped"
    };
    commandResults.push(result);
    console.log(`[SKIP] ${step.id}: ${step.skipReason}`);
    return result;
  }

  console.log(`[RUN] ${step.id}: ${step.command}`);
  try {
    const invocation = stepInvocation(step);
    const { stdout, stderr } = await execFileAsync(invocation.command, invocation.args, {
      encoding: "utf8",
      timeout: step.timeoutMs,
      maxBuffer: 30 * 1024 * 1024
    });
    const result = {
      id: step.id,
      phase: step.phase,
      command: step.command,
      status: "PASS",
      expectedNonZero: step.expectedNonZero,
      exitCode: 0,
      durationMs: Date.now() - started,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr)
    };
    commandResults.push(result);
    pass(step.id, `exit=0 durationMs=${result.durationMs}`);
    console.log(`[PASS] ${step.id}: ${result.durationMs}ms`);
    return result;
  } catch (error) {
    const exitCode = typeof error.code === "number" ? error.code : 1;
    const status = step.expectedNonZero ? "WARN" : "FAIL";
    const result = {
      id: step.id,
      phase: step.phase,
      command: step.command,
      status,
      expectedNonZero: step.expectedNonZero,
      exitCode,
      signal: error.signal ?? null,
      durationMs: Date.now() - started,
      stdoutTail: tail(error.stdout ?? ""),
      stderrTail: tail(error.stderr ?? error.message)
    };
    commandResults.push(result);
    if (status === "WARN") {
      warn(step.id, `exit=${exitCode} durationMs=${result.durationMs}; evidence gap preserved`);
      console.log(`[WARN] ${step.id}: exit=${exitCode} (${result.durationMs}ms)`);
    } else {
      fail(step.id, `exit=${exitCode} durationMs=${result.durationMs}; ${tail(error.stderr ?? error.message, 500)}`);
      console.log(`[FAIL] ${step.id}: exit=${exitCode} (${result.durationMs}ms)`);
      if (options.failFast) throw error;
    }
    return result;
  }
}

function loadArtifact(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    return { exists: false, path: absolutePath };
  }
  try {
    return {
      exists: true,
      path: absolutePath,
      artifact: JSON.parse(readFileSync(absolutePath, "utf8"))
    };
  } catch (error) {
    return {
      exists: true,
      path: absolutePath,
      parseError: error instanceof Error ? error.message : String(error)
    };
  }
}

function artifactHead(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function summarizeArtifacts(headSha) {
  return Object.entries(evidencePaths).map(([id, path]) => {
    const loaded = loadArtifact(path);
    const artifact = loaded.artifact;
    const fresh = artifactHead(artifact) === headSha && artifactDirty(artifact) === false;
    return {
      id,
      path: loaded.path,
      exists: loaded.exists,
      parseError: loaded.parseError,
      artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
      status: artifact?.status ?? "missing",
      headSha: artifactHead(artifact) ?? "missing",
      worktreeDirty: artifactDirty(artifact) ?? "unknown",
      fresh,
      missingEvidence: (artifact?.missingEvidence ?? []).map(sanitize)
    };
  });
}

function actionQueueSummary(headSha) {
  const loaded = loadArtifact(evidencePaths.releaseActionQueue);
  const artifact = loaded.artifact;
  if (!artifact) {
    warn("release action queue owner packets", "release action queue artifact is missing or unreadable");
    return {
      status: "missing",
      ownerPacketCount: 0,
      ownerPacketsReady: false,
      criticalPathCount: 0,
      criticalPathReady: false,
      missingOwnerPackets: ["release action queue artifact is missing or unreadable"],
      missingCriticalPathDiagnostics: ["release action queue artifact is missing or unreadable"],
      missingCriticalPathTickets: ["release action queue artifact is missing or unreadable"],
      unsafeCriticalPathTickets: ["release action queue artifact is missing or unreadable"],
      ownerPacketCleanup: {
        dir: "missing",
        expectedFiles: [],
        staleRemoved: [],
        deletionAllowed: false
      },
      ownerPackets: []
    };
  }

  const fresh = artifactHead(artifact) === headSha && artifactDirty(artifact) === false;
  const ticketPackets = (entry) =>
    [
      entry.ticketPacket,
      entry.externalRuntimeTicketPacket,
      entry.externalRuntimeFinalEvidenceTicketPacket,
      entry.externalRuntimeProductTicketPacket,
      entry.securityReviewTicketPacket,
      entry.releasePublishTicketPacket,
      entry.installApprovalTicketPacket,
      entry.catalogToolchainTicketPacket,
      entry.certificationToolingTicketPacket,
      entry.ragProductionTicketPacket,
      entry.aiopsMonitoringTicketPacket,
      entry.runtimeEvidenceTicketPacket
    ].filter(Boolean);
  const unsafeTicketBoundaries = (entry) =>
    ticketPackets(entry).flatMap((ticket) => {
      const reasons = [];
      const firstReadOnly = ticket.firstReadOnlyAction;
      const approvalGated = ticket.approvalGatedAction;
      const boundary = ticket.mutationBoundary ?? {};
      if (firstReadOnly?.mutation === true) reasons.push("first-read-only-mutates");
      if (firstReadOnly?.requiresExplicitApproval === true) {
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
        approvalGated?.mutation === true &&
        approvalGated.requiresExplicitApproval !== true
      ) {
        reasons.push("approval-mutation-without-explicit-approval");
      }
      return reasons.length > 0
        ? [`${entry.lane ?? "unknown"}:${ticket.id ?? "unknown"}:${reasons.join("+")}`]
        : [];
    });
  const criticalPath = artifact.criticalPath ?? [];
  const ownerPackets = (artifact.ownerPackets ?? []).map((packet) => {
    const markdownPath = packet.markdownPath ?? "missing";
    return {
      owner: sanitize(packet.owner ?? "unknown"),
      status: sanitize(packet.status ?? "unknown"),
      markdownPath: sanitize(markdownPath),
      exists: markdownPath !== "missing" && existsSync(markdownPath),
      open: packet.open ?? 0,
      blocker: packet.blocker ?? 0,
      high: packet.high ?? 0,
      firstActionId: sanitize(packet.firstActionId ?? "none"),
      firstActionPriority: sanitize(packet.firstActionPriority ?? "normal"),
      firstNextCommand: sanitize(packet.firstNextCommand ?? "none"),
      nextCommandCount: (packet.nextCommands ?? []).length,
      readOnlyCommandIds: (packet.readOnlyCommandIds ?? []).map(sanitize),
      approvalGatedCommandCount: (packet.approvalGatedCommandIds ?? []).length,
      mutationAllowedByThisVerifier: packet.mutationAllowedByThisVerifier === true
    };
  });
  const ownerPacketCleanup = {
    dir: sanitize(artifact.ownerPacketCleanup?.dir ?? "missing"),
    expectedFiles: (artifact.ownerPacketCleanup?.expectedFiles ?? []).map(sanitize),
    staleRemoved: (artifact.ownerPacketCleanup?.staleRemoved ?? []).map(sanitize),
    deletionAllowed: artifact.ownerPacketCleanup?.deletionAllowed === true
  };
  const ownerPacketFileNames = new Set(
    ownerPackets.map((packet) => packet.markdownPath.split(/[\\/]/).pop() ?? packet.markdownPath)
  );
  const cleanupExpectedMissing = ownerPacketCleanup.expectedFiles
    .filter((expectedFile) => !ownerPacketFileNames.has(expectedFile))
    .map((expectedFile) => `owner packet cleanup expected file is not exported: ${expectedFile}`);
  const missingOwnerPackets = ownerPackets
    .filter((packet) => !packet.exists)
    .map((packet) => `${packet.owner} owner packet missing at ${packet.markdownPath}`);
  const mutatingOwnerPackets = ownerPackets
    .filter((packet) => packet.mutationAllowedByThisVerifier)
    .map((packet) => `${packet.owner} owner packet reports mutationAllowedByThisVerifier=true`);
  const ownerPacketsWithoutReadOnlyCommands = ownerPackets
    .filter((packet) => packet.open > 0 && packet.readOnlyCommandIds.length === 0)
    .map((packet) => `${packet.owner} owner packet lacks read-only command ids`);
  const ownerPacketsWithoutNextCommands = ownerPackets
    .filter((packet) => packet.open > 0 && packet.nextCommandCount === 0)
    .map((packet) => `${packet.owner} owner packet lacks next commands`);
  const missingCriticalPathDiagnostics = criticalPath
    .filter((entry) => (entry.diagnostics ?? []).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks diagnostics`);
  const missingCriticalPathTickets = criticalPath
    .filter((entry) => ticketPackets(entry).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks ticket packet`);
  const unsafeCriticalPathTickets = criticalPath.flatMap(unsafeTicketBoundaries).map(sanitize);
  const freshnessBlockers = fresh
    ? []
    : [`release action queue is stale head=${artifactHead(artifact) ?? "missing"}`];
  const ownerPacketBlockers = [
    ...freshnessBlockers,
    ...(ownerPackets.length > 0 ? [] : ["release action queue has no ownerPackets"]),
    ...(ownerPacketCleanup.deletionAllowed
      ? []
      : ["release action queue owner packet cleanup did not allow deletion inside generated evidence directory"]),
    ...(ownerPacketCleanup.expectedFiles.length === ownerPackets.length
      ? []
      : [`release action queue owner packet cleanup expected=${ownerPacketCleanup.expectedFiles.length} exported=${ownerPackets.length}`]),
    ...cleanupExpectedMissing,
    ...missingOwnerPackets,
    ...mutatingOwnerPackets,
    ...ownerPacketsWithoutReadOnlyCommands,
    ...ownerPacketsWithoutNextCommands
  ];
  const criticalPathBlockers = [
    ...freshnessBlockers,
    ...(criticalPath.length > 0 ? [] : ["release action queue has no criticalPath lanes"]),
    ...missingCriticalPathDiagnostics,
    ...missingCriticalPathTickets,
    ...unsafeCriticalPathTickets
  ];
  const blockers = [...new Set([...ownerPacketBlockers, ...criticalPathBlockers])];
  if (blockers.length > 0) {
    fail("release action queue owner packets", blockers.join("; "));
  } else {
    pass(
      "release action queue owner packets",
      `${ownerPackets.length} owner packet(s) and ${criticalPath.length} critical path lane(s) are ready for head=${headSha}`
    );
  }
  return {
    status: blockers.length > 0 ? "blocked" : "ready",
    ownerPacketCount: ownerPackets.length,
    ownerPacketsReady: ownerPacketBlockers.length === 0,
    criticalPathCount: criticalPath.length,
    criticalPathReady: criticalPathBlockers.length === 0,
    missingOwnerPackets,
    missingOwnerPacketReadOnlyCommands: ownerPacketsWithoutReadOnlyCommands,
    missingOwnerPacketNextCommands: ownerPacketsWithoutNextCommands,
    missingCriticalPathDiagnostics,
    missingCriticalPathTickets,
    unsafeCriticalPathTickets,
    ownerPacketCleanup,
    ownerPackets
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(sanitize)));
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

  const chain = buildChain();
  for (const step of chain) {
    await runStep(step);
  }

  const artifacts = summarizeArtifacts(headSha);
  const actionQueue = actionQueueSummary(headSha);
  const staleArtifacts = artifacts.filter((artifact) => artifact.exists && !artifact.parseError && !artifact.fresh);
  const missingArtifacts = artifacts.filter((artifact) => !artifact.exists || artifact.parseError);
  for (const artifact of missingArtifacts) {
    warn(`${artifact.id} artifact`, artifact.parseError ? `parse error: ${artifact.parseError}` : "missing");
  }
  for (const artifact of staleArtifacts) {
    warn(
      `${artifact.id} artifact`,
      `stale head=${artifact.headSha} dirty=${String(artifact.worktreeDirty)} currentHead=${headSha}`
    );
  }

  const unexpectedFailures = commandResults.filter((result) => result.status === "FAIL");
  const expectedGaps = commandResults.filter((result) => result.status === "WARN" || result.status === "SKIPPED");
  const missingEvidence = unique([
    ...expectedGaps.map((result) => `${result.id} ${result.status.toLowerCase()} exit=${String(result.exitCode ?? "n/a")}`),
    ...missingArtifacts.map((artifact) => `${artifact.id} artifact missing or unreadable`),
    ...staleArtifacts.map((artifact) => `${artifact.id} artifact not fresh for current head`),
    ...artifacts.flatMap((artifact) =>
      artifact.id === "releaseActionQueue"
        ? []
        : artifact.missingEvidence.map((item) => `${artifact.id}: ${item}`)
    ),
    ...actionQueue.missingOwnerPackets,
    options.skipImageBuild ? "image build refresh was skipped; release approval still requires same-HEAD actual build evidence" : "",
    options.skipLive ? "live OCP/Lightspeed refresh was skipped; live readiness still requires same-HEAD evidence" : ""
  ]);
  const status = unexpectedFailures.length > 0
    ? "BLOCKED"
    : worktreeDirty || missingEvidence.length > 0
      ? "NEEDS_EVIDENCE"
      : "PASS";

  const artifact = {
    schema: "cywell.opslens.release-evidence-refresh.v0.1",
    artifactType: "opslens.release-evidence-refresh.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "localEvidenceRefresh",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    localDockerBuildAllowed: !options.skipImageBuild,
    options: {
      withE2e: options.withE2e,
      mvpGateSkipsImages: true,
      skipImageBuild: options.skipImageBuild,
      skipLive: options.skipLive,
      securityScanDocker: options.securityScanDocker,
      failFast: options.failFast,
      commandTimeoutMs: options.commandTimeoutMs,
      liveTimeoutMs: options.liveTimeoutMs
    },
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    commands: commandResults,
    artifacts,
    actionQueue,
    missingEvidence,
    risk: [
      "This refresh chain only runs local verifiers and live read-only diagnostics; it does not approve install, patch, push, mirror, sign, apply, delete, or scale actions.",
      "Local Docker image builds may update local image cache when --skip-image-build is not used, but registry mutation remains false.",
      options.securityScanDocker
        ? "The security scan Docker fallback may pull scanner images and write local vulnerability/SBOM evidence, but registry and cluster mutation remain false."
        : "Security scan execution is not run by default; existing runner evidence is preserved and the security scan plan reports missing or stale runner evidence.",
      "Expected live OCP/Lightspeed failures are preserved as evidence gaps so release review does not confuse stale evidence with readiness."
    ],
    rollbackPath: [
      "No cluster or registry rollback is required because this verifier does not mutate those systems.",
      "Delete regenerated files under test-results/ if local evidence needs to be discarded.",
      "Rerun this refresh chain from a clean Git HEAD after code or contract changes."
    ],
    checks
  };

  const sanitizedArtifact = sanitizeArtifact(artifact, sanitize);
  const serialized = `${JSON.stringify(sanitizedArtifact, null, 2)}\n`;
  if (/--token\s+(?!<redacted>)\S+/i.test(serialized) || /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized)) {
    throw new Error("release evidence refresh would include unredacted secret material");
  }
  if (sensitiveEndpointLeakLike(serialized)) {
    throw new Error("release evidence refresh would include an unredacted configured endpoint or private IP");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("release evidence refresh export", `${resolve(options.evidenceOut)} written without secret material`);

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
  console.log(`Cywell OpsLens release evidence refresh: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("release evidence refresh runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] release evidence refresh runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
