#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-live-evidence-handoff.json",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  operatorDryRunEvidence: "test-results/cywell-opslens-operator-dry-run.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreviewEvidence: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  installPlanEvidence: "test-results/cywell-opslens-install-approval-plan.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json"
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
  ocpConnectivityEvidence:
    parsed.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  operatorDryRunEvidence:
    parsed.get("operator-dry-run-evidence") ?? defaults.operatorDryRunEvidence,
  lightspeedReadinessEvidence:
    parsed.get("lightspeed-readiness-evidence") ?? defaults.lightspeedReadinessEvidence,
  lightspeedPatchPreviewEvidence:
    parsed.get("lightspeed-patch-preview-evidence") ?? defaults.lightspeedPatchPreviewEvidence,
  installPlanEvidence: parsed.get("install-plan-evidence") ?? defaults.installPlanEvidence,
  evidenceCheckpoint: parsed.get("evidence-checkpoint") ?? defaults.evidenceCheckpoint
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

async function runCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10000
    });
    return sanitize(stdout.trim());
  } catch {
    return "";
  }
}

async function gitValue(args, fallback) {
  const value = await runCapture("git", args);
  return value.split(/\r?\n/).at(-1)?.trim() || fallback;
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

function commandPlan(mcpUrlConfigured) {
  return [
    {
      id: "env-contract",
      command: "npm run verify:env",
      purpose: "Confirm OCP and Lightspeed environment variables are isolated before live checks.",
      phase: "local-contract",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "ocp-connectivity",
      command: "npm run verify:ocp:connectivity",
      purpose: "Classify DNS, TCP, TLS, Kubernetes /version, and oc reachability without mutation.",
      phase: "live-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.ocpConnectivityEvidence
    },
    {
      id: "operator-server-dry-run",
      command: "npm run verify:operator:dry-run",
      purpose: "Ask the live OpenShift API to validate manifests with server-side dry-run only.",
      phase: "live-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.operatorDryRunEvidence
    },
    {
      id: "lightspeed-live-readiness",
      command: "npm run verify:lightspeed -- --timeout-ms 30000",
      purpose: "Read live OLSConfig CRD/config and record Lightspeed MCP readiness.",
      phase: "live-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.lightspeedReadinessEvidence
    },
    {
      id: "lightspeed-mcp-live-call",
      command: mcpUrlConfigured
        ? "npm run verify:lightspeed -- --timeout-ms 30000 --require-mcp"
        : "set CYWELL_OPSLENS_MCP_URL=<reachable /mcp URL> && npm run verify:lightspeed -- --timeout-ms 30000 --require-mcp",
      purpose: "Prove tools/list and tools/call against the reachable Cywell OpsLens MCP endpoint.",
      phase: "live-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.lightspeedReadinessEvidence
    },
    {
      id: "runtime-live-probe",
      command: "set CYWELL_OPSLENS_RUNTIME_PROBE_LIVE=true && npm run verify:runtime -- --live",
      purpose: "Probe Qdrant and vLLM runtime endpoints only after services are reachable.",
      phase: "live-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: "test-results/cywell-opslens-runtime-readiness.json"
    },
    {
      id: "install-approval-refresh",
      command: "npm run verify:install-plan",
      purpose: "Refresh the non-mutating install approval plan after live evidence changes.",
      phase: "approval-refresh",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.installPlanEvidence
    },
    {
      id: "evidence-checkpoint-refresh",
      command: "npm run verify:evidence-checkpoint",
      purpose: "Refresh the consolidated evidence board before any human approval review.",
      phase: "approval-refresh",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.evidenceCheckpoint
    },
    {
      id: "roadmap-alignment-refresh",
      command: "npm run verify:roadmap-plan",
      purpose: "Refresh product roadmap alignment after the evidence checkpoint changes.",
      phase: "approval-refresh",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true,
      evidenceOut: "test-results/cywell-opslens-roadmap-plan-alignment.json"
    }
  ];
}

function forbiddenCommandHits(commands) {
  const mutatingPattern =
    /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i;
  return commands
    .filter((item) => mutatingPattern.test(item.command) || item.mutation !== false)
    .map((item) => item.id);
}

function sourceSummary(artifact, label, currentHeadSha) {
  if (!artifact) {
    return {
      label,
      status: "missing",
      fresh: false,
      headSha: "missing",
      worktreeDirty: "unknown"
    };
  }
  const ref = artifactRef(artifact);
  return {
    label,
    artifactType: artifact.artifactType ?? artifact.schema ?? "unknown",
    status: artifact.status ?? "unknown",
    fresh: artifactFresh(artifact, currentHeadSha),
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = (await runCapture("git", ["status", "--short"]))
    .split(/\r?\n/)
    .filter(Boolean);
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const artifacts = {
    ocpConnectivity: loadJson(options.ocpConnectivityEvidence, "OCP connectivity diagnostic"),
    operatorDryRun: loadJson(options.operatorDryRunEvidence, "Operator dry-run"),
    lightspeedReadiness: loadJson(options.lightspeedReadinessEvidence, "Lightspeed readiness"),
    lightspeedPatchPreview: loadJson(options.lightspeedPatchPreviewEvidence, "Lightspeed patch preview"),
    installPlan: loadJson(options.installPlanEvidence, "install approval plan"),
    evidenceCheckpoint: loadJson(options.evidenceCheckpoint, "evidence checkpoint")
  };

  const mcpUrlConfigured = Boolean(process.env.CYWELL_OPSLENS_MCP_URL);
  const commands = commandPlan(mcpUrlConfigured);
  const forbiddenHits = forbiddenCommandHits(commands);
  if (forbiddenHits.length > 0) {
    fail("handoff mutation boundary", `mutating command(s) detected: ${forbiddenHits.join(", ")}`);
  } else {
    pass("handoff mutation boundary", "all handoff commands are read-only verifiers or local evidence refreshes");
  }

  const ocpClassification =
    artifacts.ocpConnectivity?.diagnostics?.classification ?? "missing";
  const actionHints = artifacts.ocpConnectivity?.actionHints ?? [];
  if (ocpClassification !== "api-ready" && actionHints.length === 0) {
    warn("OCP action hints", `classification=${ocpClassification} has no action hints`);
  } else {
    pass("OCP action hints", `classification=${ocpClassification} hints=${actionHints.length}`);
  }

  const sourceArtifacts = [
    sourceSummary(artifacts.ocpConnectivity, "OCP connectivity diagnostic", headSha),
    sourceSummary(artifacts.operatorDryRun, "Operator server dry-run", headSha),
    sourceSummary(artifacts.lightspeedReadiness, "Lightspeed live readiness", headSha),
    sourceSummary(artifacts.lightspeedPatchPreview, "Lightspeed patch preview", headSha),
    sourceSummary(artifacts.installPlan, "Install approval plan", headSha),
    sourceSummary(artifacts.evidenceCheckpoint, "Evidence checkpoint", headSha)
  ];
  const staleSources = sourceArtifacts.filter((source) => !source.fresh);
  if (staleSources.length > 0) {
    warn("source evidence freshness", `staleOrMissing=${staleSources.map((source) => source.label).join(", ")}`);
  } else {
    pass("source evidence freshness", `all source artifacts are current for head=${headSha}`);
  }

  const missingEvidence = [
    ...staleSources.map((source) => `${source.label} is not fresh for head=${headSha}`),
    ...(ocpClassification === "api-ready"
      ? []
      : [`OCP API connectivity classification=${ocpClassification}`]),
    ...(mcpUrlConfigured
      ? []
      : ["CYWELL_OPSLENS_MCP_URL must point at a reachable /mcp endpoint before requiring MCP live call"])
  ];
  const status = forbiddenHits.length > 0
    ? "BLOCKED"
    : worktreeDirty || staleSources.length > 0
      ? "NEEDS_EVIDENCE"
      : "PASS";

  const artifact = {
    schema: "cywell.opslens.live-evidence-handoff.v0.1",
    artifactType: "opslens.live-evidence-handoff.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "handoffOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: [
      "AC-DASH-001",
      "AC-OCP-001",
      "AC-LS-002",
      "AC-OP-004",
      "AC-OP-005"
    ],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    currentGap: {
      classification: ocpClassification,
      target: artifacts.ocpConnectivity?.target ?? {},
      actionHints: actionHints.slice(0, 4)
    },
    sourceArtifacts,
    readOnlyCommands: commands,
    forbiddenCommands: [
      "oc apply",
      "oc delete",
      "oc patch",
      "oc scale",
      "docker push",
      "podman push",
      "skopeo copy"
    ],
    handoffChecklist: [
      "Run from a machine that can reach the company OpenShift API endpoint.",
      "Keep OCP_API_TOKEN and any kubeconfig values out of chat, tickets, and screenshots.",
      "Run the read-only commands in order and keep generated test-results/*.json artifacts.",
      "Do not run mutating install, OLSConfig patch, image push, sign, mirror, or catalog publish commands until the matching approval plan is human-approved."
    ],
    missingEvidence,
    risk: [
      "The handoff is only a live evidence collection plan; it does not approve install, patch, push, sign, mirror, or ingestion.",
      "If OCP connectivity remains tcp-timeout, Lightspeed and Operator live checks will continue to report external reachability gaps.",
      "Runtime live probes can be noisy during installation and should be enabled only when Qdrant/vLLM endpoints are expected to be reachable."
    ],
    rollbackPath: [
      "No rollback is required because this verifier only writes a local handoff artifact.",
      "If a live verifier records bad evidence, fix the environment and regenerate the affected test-results artifact.",
      "If a mutating command is needed, stop and use the install or release approval plan instead of this handoff."
    ],
    evidence: [
      "handoff commands are read-only verifier commands or local evidence refresh commands",
      "source artifacts are referenced by path and ref stamp",
      "secret values are not printed or embedded"
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (/--token\s+(?!<redacted>)\S+/i.test(serialized)) {
    throw new Error("live evidence handoff would include an unredacted token argument");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("live evidence handoff export", `${resolve(options.evidenceOut)} written without secret material`);

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
  console.log(`Cywell OpsLens live evidence handoff: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("live evidence handoff runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] live evidence handoff runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
