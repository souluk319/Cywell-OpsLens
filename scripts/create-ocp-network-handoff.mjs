#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-ocp-network-handoff.json",
  markdownOut: "test-results/cywell-opslens-ocp-network-handoff.md",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  operatorDryRunEvidence: "test-results/cywell-opslens-operator-dry-run.json",
  liveHandoffEvidence: "test-results/cywell-opslens-live-evidence-handoff.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
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
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  ocpConnectivityEvidence:
    parsed.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  lightspeedReadinessEvidence:
    parsed.get("lightspeed-readiness-evidence") ?? defaults.lightspeedReadinessEvidence,
  operatorDryRunEvidence:
    parsed.get("operator-dry-run-evidence") ?? defaults.operatorDryRunEvidence,
  liveHandoffEvidence: parsed.get("live-handoff-evidence") ?? defaults.liveHandoffEvidence,
  evidenceCheckpoint: parsed.get("evidence-checkpoint") ?? defaults.evidenceCheckpoint,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
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
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
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

async function gitStatusShort() {
  const value = await runCapture("git", ["status", "--short"]);
  return value.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function loadJson(path, label, required = true) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    if (required) fail(label, `${absolutePath} is missing`);
    else warn(label, `${absolutePath} is missing`);
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

function sourceSummary(id, label, path, artifact, currentHeadSha, required = true) {
  const fresh = artifact ? artifactFresh(artifact, currentHeadSha) : false;
  if (!artifact && required) {
    fail(`${label} source`, `${label} is missing`);
  } else if (artifact && !fresh && required) {
    warn(`${label} source`, `${label} is stale head=${artifactRef(artifact).headSha ?? "missing"}`);
  } else if (artifact) {
    pass(`${label} source`, `${label} is ${fresh ? "fresh" : "available"}`);
  }
  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status: artifact?.status ?? "missing",
    fresh,
    required,
    headSha: artifactRef(artifact).headSha ?? "missing",
    worktreeDirty: artifactRef(artifact).worktreeDirty ?? "unknown"
  };
}

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const key = `${command.id ?? "unknown"}:${command.command ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readOnlyCommands(ocpConnectivity, liveHandoff) {
  return uniqueCommands([
    ...(ocpConnectivity?.readOnlyTroubleshootingCommands ?? []),
    ...(liveHandoff?.readOnlyCommands ?? [])
  ]).map((command) => ({
    id: command.id ?? "unknown",
    command: sanitize(command.command ?? ""),
    purpose: sanitize(command.purpose ?? ""),
    phase: command.phase ?? "unknown",
    requiresNetwork: command.requiresNetwork === true,
    mutation: command.mutation === true
  }));
}

function commandBoundary(commands) {
  const mutatingPattern =
    /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i;
  return commands.filter((command) => command.mutation === true || mutatingPattern.test(command.command));
}

function authLikeClassification(classification) {
  return ["auth-or-rbac", "auth-failed", "token-missing"].includes(classification);
}

function handoffAudience(classification) {
  if (authLikeClassification(classification)) return "Cluster Admin/SRE";
  if (classification === "tls-handshake-failed") return "Cluster SRE/Security";
  return "Network/SRE";
}

function adminRequests(target, classification, addresses) {
  const host = target.host ?? "unknown";
  const port = target.port ?? "unknown";
  const addressText = addresses.length > 0 ? addresses.join(", ") : "unresolved";
  if (authLikeClassification(classification)) {
    return [
      `Confirm the configured OCP credential is current for ${host}:${port}; DNS/TCP/TLS already passed from this verifier.`,
      "Grant or bind the read-only RBAC needed for /version and OLSConfig CRD discovery, then verify with oc whoami and oc auth can-i get crd olsconfigs.ols.openshift.io.",
      "Do not route this as a firewall issue unless DNS/TCP/TLS evidence regresses.",
      `After classification changes from ${classification} to api-ready, rerun npm run verify:lightspeed and npm run verify:operator:dry-run.`
    ];
  }
  if (classification === "tls-handshake-failed") {
    return [
      `Confirm enterprise CA trust, proxy TLS interception, and OCP_TLS_VERIFY settings for ${host}:${port}.`,
      `DNS and TCP reached ${addressText}; fix TLS trust before Kubernetes authentication is investigated.`,
      "After classification changes from tls-handshake-failed to api-ready, rerun npm run verify:lightspeed and npm run verify:operator:dry-run."
    ];
  }
  return [
    `Confirm VPN/firewall/security-group routing from this workstation or approved bastion to ${host}:${port}.`,
    `Confirm ${host} resolves to the expected API address (${addressText}) for the company network.`,
    `Confirm TCP ${port} on ${addressText} is allowed before TLS or Kubernetes authentication is investigated.`,
    `After classification changes from ${classification} to api-ready, rerun npm run verify:lightspeed and npm run verify:operator:dry-run.`
  ];
}

function riskForClassification(classification) {
  if (authLikeClassification(classification)) {
    return [
      "auth-or-rbac means DNS, TCP, and TLS reached the API, but the configured credential or RBAC was rejected.",
      "Do not keep routing this as a firewall issue unless network evidence regresses.",
      "This handoff is a ticket packet only and does not approve cluster or registry mutation."
    ];
  }
  if (classification === "tls-handshake-failed") {
    return [
      "TLS failed after TCP succeeded, so CA trust or proxy TLS handling must be checked before auth or Lightspeed readiness.",
      "This handoff is a ticket packet only and does not approve cluster or registry mutation."
    ];
  }
  return [
    "A tcp-timeout classification means DNS resolved but the API port did not accept a TCP session from this workstation.",
    "Do not debug this as a token, TLS, Lightspeed, or OpsLens API defect until TCP reachability is restored.",
    "This handoff is a ticket packet only and does not approve cluster or registry mutation."
  ];
}

function markdownFor(packet) {
  const target = packet.target;
  const diagnostics = packet.diagnostics;
  const lines = [
    "# Cywell OpsLens OCP Network Handoff",
    "",
    `Generated: ${packet.generatedAt}`,
    `Git: ${packet.ref.branch} ${packet.ref.headSha} dirty=${packet.ref.worktreeDirty}`,
    "",
    "## Current Finding",
    "",
    `- Status: ${packet.status}`,
    `- Classification: ${diagnostics.classification}`,
    `- Target: ${target.redactedBaseUrl ?? `${target.host}:${target.port}`}`,
    `- DNS: ${(diagnostics.dns?.addresses ?? []).join(", ") || "missing"}`,
    `- TCP: ${diagnostics.tcp?.status ?? "missing"} ${diagnostics.tcp?.error ? `(${diagnostics.tcp.error})` : ""}`,
    `- TLS: ${diagnostics.tls?.status ?? "missing"}`,
    `- Kubernetes /version: ${diagnostics.kubernetesVersion?.status ?? "missing"}`,
    `- oc read: ${diagnostics.oc?.versionGet ?? "missing"}`,
    "",
    `## Ask For ${packet.ownerHint ?? "Network/SRE"}`,
    "",
    ...packet.adminRequests.map((item) => `- ${item}`),
    "",
    "## Read-Only Commands",
    "",
    ...packet.readOnlyCommands.map((command) => [
      `### ${command.id}`,
      "",
      `Purpose: ${command.purpose || "read-only evidence collection"}`,
      "",
      "```powershell",
      command.command,
      "```",
      ""
    ].join("\n")),
    "## Mutation Boundary",
    "",
    "- Do not run oc apply/delete/patch/scale from this handoff.",
    "- Do not push, mirror, copy, or sign images from this handoff.",
    "- This packet contains no token values and should remain safe to attach to an internal ticket.",
    "",
    "## Next Evidence Refresh",
    "",
    "```powershell",
    "npm run verify:ocp:connectivity",
    "npm run verify:operator:dry-run",
    "npm run verify:lightspeed -- --timeout-ms 30000",
    "npm run verify:live-handoff",
    "npm run verify:evidence-checkpoint",
    "npm run verify:roadmap-plan",
    "```",
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const artifacts = {
    ocpConnectivity: loadJson(options.ocpConnectivityEvidence, "OCP connectivity diagnostic"),
    lightspeedReadiness: loadJson(options.lightspeedReadinessEvidence, "Lightspeed readiness", false),
    operatorDryRun: loadJson(options.operatorDryRunEvidence, "Operator dry-run", false),
    liveHandoff: loadJson(options.liveHandoffEvidence, "live evidence handoff", false),
    evidenceCheckpoint: loadJson(options.evidenceCheckpoint, "evidence checkpoint", false)
  };

  const sources = [
    sourceSummary("ocpConnectivity", "OCP connectivity diagnostic", options.ocpConnectivityEvidence, artifacts.ocpConnectivity, headSha),
    sourceSummary("lightspeedReadiness", "Lightspeed readiness", options.lightspeedReadinessEvidence, artifacts.lightspeedReadiness, headSha, false),
    sourceSummary("operatorDryRun", "Operator dry-run", options.operatorDryRunEvidence, artifacts.operatorDryRun, headSha, false),
    sourceSummary("liveHandoff", "live evidence handoff", options.liveHandoffEvidence, artifacts.liveHandoff, headSha, false),
    sourceSummary("evidenceCheckpoint", "evidence checkpoint", options.evidenceCheckpoint, artifacts.evidenceCheckpoint, headSha, false)
  ];

  const target = artifacts.ocpConnectivity?.target ?? {};
  const diagnostics = artifacts.ocpConnectivity?.diagnostics ?? {};
  const classification = diagnostics.classification ?? "missing";
  const commands = readOnlyCommands(artifacts.ocpConnectivity, artifacts.liveHandoff);
  const unsafeCommands = commandBoundary(commands);
  if (unsafeCommands.length > 0) {
    fail("network handoff command boundary", `mutating commands detected: ${unsafeCommands.map((command) => command.id).join(", ")}`);
  } else {
    pass("network handoff command boundary", `${commands.length} read-only command(s)`);
  }

  const missingEvidence = [
    ...(artifacts.ocpConnectivity ? [] : ["OCP connectivity diagnostic evidence is missing"]),
    ...(classification === "api-ready" ? [] : [`OCP API connectivity classification=${classification}`]),
    ...sources
      .filter((source) => source.required && !source.fresh)
      .map((source) => `${source.label} is not fresh for current head`)
  ];

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : missingEvidence.length > 0
      ? "READY_FOR_NETWORK_REVIEW"
      : "READY_FOR_LIVE_RECHECK";

  const packet = {
    schema: "cywell.opslens.ocp-network-handoff.v0.1",
    artifactType: "opslens.ocp-network-handoff.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "handoffOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    target,
    diagnostics,
    ownerHint: handoffAudience(classification),
    adminRequests: adminRequests(target, classification, diagnostics.dns?.addresses ?? []),
    readOnlyCommands: commands,
    sourceArtifacts: sources,
    missingEvidence,
    risk: riskForClassification(classification),
    rollbackPath: [
      "No rollback is required because this packet writes only local evidence.",
      "After network changes, rerun the listed read-only verifiers and regenerate the release evidence chain."
    ],
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  const markdown = markdownFor(packet);
  if (secretLike(serialized) || secretLike(markdown)) {
    throw new Error("OCP network handoff would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass("OCP network handoff export", `${resolve(options.evidenceOut)} and ${resolve(options.markdownOut)} written without secret material`);

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens OCP network handoff: status=${status}, classification=${classification}, commands=${commands.length}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("OCP network handoff runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] OCP network handoff runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
