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
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/\b10(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>")
    .replace(/\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>")
    .replace(/\b192\.168(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>")
    .replace(/(Test-NetConnection\s+-ComputerName\s+)(?:"?)[^\s"]+/gi, "$1<redacted-ocp-api>")
    .replace(/(Resolve-DnsName\s+)(?:"?)[^\s"]+/gi, "$1<redacted-ocp-api>")
    .replace(/\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-api>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
}

function endpointLeakLike(value) {
  return /\b10(?:\.\d{1,3}){3}\b/.test(value) ||
    /\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b192\.168(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/i.test(value);
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

function redactedOcpTarget(target = {}) {
  const protocol = String(target.protocol ?? target.redactedBaseUrl ?? "").startsWith("http://")
    ? "http:"
    : "https:";
  const port = target.port ?? String(target.redactedBaseUrl ?? "").match(/:(\d+)(?:\/)?$/)?.[1] ?? "unknown";
  return `${protocol}//<redacted-ocp-api>${port === "unknown" ? "" : `:${port}`}`;
}

function redactedAddressText(addresses) {
  const count = Array.isArray(addresses) ? addresses.filter(Boolean).length : 0;
  return count > 0 ? `<redacted-private-ip>${count > 1 ? ` x${count}` : ""}` : "unresolved";
}

function redactedDiagnostics(diagnostics = {}) {
  const dns = diagnostics.dns ?? {};
  const addresses = Array.isArray(dns.addresses) ? dns.addresses : [];
  return {
    ...diagnostics,
    dns: {
      ...dns,
      addresses: addresses.map(() => "<redacted-private-ip>"),
      addressCount: dns.addressCount ?? addresses.length
    }
  };
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

function handoffOwner(classification) {
  if (authLikeClassification(classification)) return "cluster-admin";
  if (classification === "tls-handshake-failed") return "cluster-sre";
  return "network-sre";
}

function ticketId(classification) {
  if (authLikeClassification(classification)) return "cluster-admin-ocp-auth-rbac-ticket";
  if (classification === "tls-handshake-failed") return "cluster-sre-ocp-api-tls-ticket";
  return "network-sre-ocp-api-reachability-ticket";
}

function ticketTitle(classification) {
  if (authLikeClassification(classification)) {
    return `Restore OCP API ${classification} credential/RBAC readiness for Cywell OpsLens and Lightspeed evidence`;
  }
  if (classification === "tls-handshake-failed") {
    return "Restore OCP API TLS readiness for Cywell OpsLens and Lightspeed evidence";
  }
  return `Restore OCP API ${classification} network readiness for Cywell OpsLens and Lightspeed evidence`;
}

function ticketSummary(classification) {
  if (authLikeClassification(classification)) {
    return "Use this packet as the Cluster Admin/SRE credential and read-only RBAC ticket summary; DNS, TCP, and TLS reached the API, so collect auth/RBAC evidence before requesting any network change.";
  }
  if (classification === "tls-handshake-failed") {
    return "Use this packet as the Cluster SRE/Security TLS ticket summary; DNS and TCP reached the API, so collect certificate/trust evidence before requesting any network change.";
  }
  return "Use this packet as the Network/SRE ticket summary; collect read-only DNS/TCP/route evidence first, then use an approved network change only if reachability remains blocked.";
}

function commandById(commands, id, fallbackCommand, fallbackPurpose) {
  const command = commands.find((candidate) => candidate.id === id);
  return {
    command: sanitize(command?.command ?? fallbackCommand),
    purpose: sanitize(command?.purpose ?? fallbackPurpose)
  };
}

function buildFirstNetworkActions(target, classification, addresses, commands, missingEvidence) {
  const host = sanitize(target.host ?? "unknown");
  const port = target.port ?? "6443";
  const addressText = redactedAddressText(addresses);
  const owner = handoffOwner(classification);
  const blockedBy = missingEvidence.length
    ? missingEvidence
    : [`OCP API connectivity classification=${classification}`];
  const dns = commandById(
    commands,
    "windows-resolve-dns",
    `powershell -NoProfile -Command "Resolve-DnsName ${host}"`,
    "Confirm the OCP API DNS result from this workstation or approved bastion."
  );
  const tcp = commandById(
    commands,
    "windows-test-netconnection",
    `powershell -NoProfile -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Detailed"`,
    "Confirm a TCP session can open to the OCP API port."
  );
  const route = commandById(
    commands,
    "windows-route-print",
    `route print ${addressText}`,
    "Inspect the selected route toward the resolved OCP API address."
  );
  const rerun = commandById(
    commands,
    "ocp-connectivity",
    "npm run verify:ocp:connectivity -- --timeout-ms 30000",
    "Reclassify DNS, TCP, TLS, Kubernetes /version, and oc reachability without mutation."
  );
  const actions = [
    {
      id: "network-sre-confirm-ocp-api-dns",
      owner,
      phase: "network-dns-preflight",
      status: classification === "dns-unresolved" ? "blocker" : "read-only",
      request:
        "Confirm the OCP API hostname resolves to the expected company network address before debugging Lightspeed or Operator readiness.",
      evidenceNeeded: `DNS result for ${host}; expected address context=${addressText}.`,
      nextCommand: dns.command,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this command only reads local resolver output."
    },
    {
      id: "network-sre-confirm-ocp-api-tcp-6443",
      owner,
      phase: "network-tcp-preflight",
      status: ["tcp-timeout", "tcp-unreachable"].includes(classification)
        ? "blocker"
        : "read-only",
      request:
        "Confirm TCP 6443 reachability from this workstation or approved bastion before investigating TLS, RBAC, or Lightspeed configuration.",
      evidenceNeeded: tcp.purpose,
      nextCommand: tcp.command,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this command only tests socket reachability."
    },
    {
      id: "network-sre-confirm-ocp-api-route",
      owner,
      phase: "network-route-preflight",
      status: ["tcp-timeout", "tcp-unreachable"].includes(classification)
        ? "needs-evidence"
        : "read-only",
      request:
        "Capture the local route to the resolved OCP API address so VPN, gateway, or firewall ownership can be assigned.",
      evidenceNeeded: route.purpose,
      nextCommand: route.command,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this command only reads routing state."
    },
    {
      id: "network-sre-rerun-ocp-connectivity-diagnostic",
      owner,
      phase: "network-evidence-refresh",
      status: classification === "api-ready" ? "ready-for-live-recheck" : "needs-evidence",
      request:
        "Rerun the bounded OCP connectivity diagnostic after DNS/TCP/TLS/auth changes and attach the current-head artifact.",
      evidenceNeeded:
        "cywell-opslens-ocp-connectivity-diagnostic.json shows classification=api-ready with current Git head and clean worktree.",
      nextCommand: rerun.command,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "Regenerate the OCP network handoff if the classification changes or the Git head moves."
    }
  ];

  if (authLikeClassification(classification)) {
    actions.unshift({
      id: "cluster-admin-review-ocp-auth-rbac-evidence",
      owner,
      phase: "auth-rbac-preflight",
      status: "blocker",
      request:
        "Confirm the configured OCP credential is current and the least-privilege live evidence reader RBAC plan is ready for approval.",
      evidenceNeeded:
        "cywell-opslens-ocp-auth-rbac-plan.json shows AUTH_RBAC_APPROVAL_REQUIRED or approved reader evidence, with Secrets excluded and mutation flags false.",
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this action only refreshes a local approval packet."
    });
  }

  if (["tcp-timeout", "tcp-unreachable", "dns-unresolved"].includes(classification)) {
    actions.push({
      id: "approval-gated-network-route-change",
      owner: "network-sre",
      phase: "network-change",
      status: "approval-gated",
      request:
        "Do not make VPN, firewall, security-group, DNS, or route changes from this verifier; open an approved Network/SRE change instead.",
      evidenceNeeded:
        "Approved network change ticket confirming source, destination, port 6443, expected DNS result, rollback owner, and maintenance window.",
      nextCommand: `open approved Network/SRE change for ${host}:${port} reachability from the approved workstation or bastion`,
      mutation: true,
      requiresExplicitApproval: true,
      blockedBy,
      rollbackPath:
        "Revert the approved network change through the same Network/SRE change ticket if reachability or routing is incorrect."
    });
  }

  return actions;
}

function adminRequests(target, classification, addresses) {
  const host = sanitize(target.host ?? "unknown");
  const port = target.port ?? "unknown";
  const addressText = redactedAddressText(addresses);
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

function ticketSeverity(classification) {
  if (classification === "api-ready") return "ready-for-live-recheck";
  if (["tcp-timeout", "tcp-unreachable", "dns-unresolved"].includes(classification)) {
    return "blocker";
  }
  if (["tls-handshake-failed", "auth-or-rbac", "auth-failed", "token-missing"].includes(classification)) {
    return "blocker";
  }
  return "needs-evidence";
}

function compactAction(action, fallbackId) {
  return {
    id: sanitize(action?.id ?? fallbackId),
    status: sanitize(action?.status ?? "missing"),
    nextCommand: sanitize(action?.nextCommand ?? "missing"),
    mutation: action?.mutation === true,
    requiresExplicitApproval: action?.requiresExplicitApproval === true
  };
}

function buildTicketPacket({
  target,
  classification,
  firstNetworkActions,
  sourceArtifacts,
  missingEvidence,
  adminRequests,
  risk,
  rollbackPath
}) {
  const owner = handoffOwner(classification);
  const readOnlyActions = firstNetworkActions.filter((action) => action.mutation === false);
  const firstReadOnly =
    readOnlyActions.find((action) => action.status === "blocker") ??
    readOnlyActions.find((action) => /Test-NetConnection|Resolve-DnsName|route print|verify:ocp:connectivity/i.test(action.nextCommand)) ??
    readOnlyActions[0];
  const approvalGated =
    firstNetworkActions.find((action) => action.mutation === true) ?? {
      id: "none",
      status: "not-required",
      nextCommand: "none",
      mutation: false,
      requiresExplicitApproval: false
    };
  const rerun = firstNetworkActions.find((action) =>
    /verify:ocp:connectivity/i.test(action.nextCommand)
  );
  const sourceSummary = sourceArtifacts.map((source) =>
    `${source.id}:${source.status}:fresh=${String(source.fresh)}`
  );
  const nextCommands = [
    firstReadOnly?.nextCommand,
    rerun?.nextCommand,
    approvalGated.mutation === true ? approvalGated.nextCommand : undefined
  ].filter(Boolean).map(sanitize);

  return {
    id: ticketId(classification),
    owner,
    title: ticketTitle(classification),
    severity: ticketSeverity(classification),
    classification,
    redactedTarget: redactedOcpTarget(target),
    summary: ticketSummary(classification),
    evidenceChecklist: [
      `classification=${classification}`,
      `target=${redactedOcpTarget(target)}`,
      ...sourceSummary,
      ...adminRequests.slice(0, 3)
    ].map(sanitize),
    firstReadOnlyAction: compactAction(firstReadOnly, "missing-read-only-action"),
    approvalGatedAction: compactAction(approvalGated, "none"),
    nextCommands,
    blockedBy: missingEvidence.map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      networkChangeRequiresExplicitApproval: approvalGated.mutation === true
    },
    risk: risk[0] ?? "Network reachability must be proven before live readiness can be trusted.",
    rollbackPath:
      rollbackPath[0] ??
      "No rollback is required for this packet because it writes only local evidence."
  };
}

function markdownFor(packet) {
  const target = packet.target;
  const diagnostics = packet.diagnostics;
  const ticket = packet.ticketPacket;
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
    `- Target: ${redactedOcpTarget(target)}`,
    `- DNS: ${redactedAddressText(diagnostics.dns?.addresses ?? [])}`,
    `- TCP: ${diagnostics.tcp?.status ?? "missing"} ${diagnostics.tcp?.error ? `(${diagnostics.tcp.error})` : ""}`,
    `- TLS: ${diagnostics.tls?.status ?? "missing"}`,
    `- Kubernetes /version: ${diagnostics.kubernetesVersion?.status ?? "missing"}`,
    `- oc read: ${diagnostics.oc?.versionGet ?? "missing"}`,
    "",
    `## Ask For ${packet.ownerHint ?? "Network/SRE"}`,
    "",
    ...packet.adminRequests.map((item) => `- ${item}`),
    "",
    "## Ticket Packet",
    "",
    `- ID: ${ticket.id}`,
    `- Owner: ${ticket.owner}`,
    `- Severity: ${ticket.severity}`,
    `- Title: ${ticket.title}`,
    `- Target: ${ticket.redactedTarget}`,
    `- First read-only action: ${ticket.firstReadOnlyAction.id}`,
    `- First read-only command: ${ticket.firstReadOnlyAction.nextCommand}`,
    `- Approval-gated action: ${ticket.approvalGatedAction.id}`,
    `- Network change approval required: ${String(ticket.mutationBoundary.networkChangeRequiresExplicitApproval)}`,
    "",
    "### Ticket Evidence Checklist",
    "",
    ...ticket.evidenceChecklist.map((item) => `- ${item}`),
    "",
    "## First Network Actions",
    "",
    ...packet.firstNetworkActions.map((action) => [
      `### ${action.id}`,
      "",
      `Owner: ${action.owner}`,
      `Status: ${action.status}`,
      `Mutation: ${String(action.mutation)}`,
      `Requires explicit approval: ${String(action.requiresExplicitApproval)}`,
      "",
      `Evidence needed: ${action.evidenceNeeded}`,
      "",
      "```powershell",
      action.nextCommand,
      "```",
      ""
    ].join("\n")),
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
    "npm run verify:ocp:connectivity -- --timeout-ms 30000",
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
  const diagnostics = redactedDiagnostics(artifacts.ocpConnectivity?.diagnostics ?? {});
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
  const firstNetworkActions = buildFirstNetworkActions(
    target,
    classification,
    diagnostics.dns?.addresses ?? [],
    commands,
    missingEvidence
  );
  const risk = riskForClassification(classification);
  const rollbackPath = [
    "No rollback is required because this packet writes only local evidence.",
    "After network changes, rerun the listed read-only verifiers and regenerate the release evidence chain."
  ];
  const adminRequestList = adminRequests(target, classification, diagnostics.dns?.addresses ?? []);
  const ticketPacket = buildTicketPacket({
    target,
    classification,
    firstNetworkActions,
    sourceArtifacts: sources,
    missingEvidence,
    adminRequests: adminRequestList,
    risk,
    rollbackPath
  });
  if (
    firstNetworkActions.every(
      (action) =>
        action.mutation !== false ||
        action.requiresExplicitApproval !== false ||
        !/verify:ocp:connectivity|Test-NetConnection|Resolve-DnsName|route print/i.test(action.nextCommand)
    )
  ) {
    fail("network first read-only action", "first network actions must include read-only DNS, TCP, route, or connectivity diagnostics");
  } else {
    pass("network first read-only action", `${firstNetworkActions.filter((action) => action.mutation === false).length} read-only action(s)`);
  }
  if (firstNetworkActions.every((action) => action.mutation !== true || action.requiresExplicitApproval === true)) {
    pass("network first action mutation boundary", "mutating network actions require explicit approval");
  } else {
    fail("network first action mutation boundary", "mutating network actions must require explicit approval");
  }

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
    adminRequests: adminRequestList,
    readOnlyCommands: commands,
    firstNetworkActions,
    ticketPacket,
    sourceArtifacts: sources,
    missingEvidence,
    risk,
    rollbackPath,
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  const markdown = markdownFor(packet);
  if (secretLike(serialized) || secretLike(markdown)) {
    throw new Error("OCP network handoff would include secret-like material");
  }
  if (endpointLeakLike(serialized) || endpointLeakLike(markdown)) {
    throw new Error("OCP network handoff would include an unredacted OCP host or private IP");
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
