#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-ocp-auth-rbac-plan.json",
  markdownOut: "test-results/cywell-opslens-ocp-auth-rbac-plan.md",
  manifest: "deploy/ocp-live-readonly/opslens-live-evidence-reader.yaml",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  timeoutMs: 10000
};

const expected = {
  namespace: "cywell-opslens",
  serviceAccount: "cywell-opslens-live-evidence-reader",
  clusterRole: "cywell-opslens-live-evidence-reader",
  clusterRoleBinding: "cywell-opslens-live-evidence-reader"
};

const allowedVerbs = new Set(["get", "list", "watch"]);
const forbiddenResources = new Set(["secrets"]);
const mutatingVerbs = new Set([
  "create",
  "update",
  "patch",
  "delete",
  "deletecollection",
  "replace",
  "scale"
]);

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
  manifest: parsed.get("manifest") ?? defaults.manifest,
  ocpConnectivityEvidence:
    parsed.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

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

function redactedOcpTarget(target = {}) {
  const protocol = String(target.protocol ?? target.redactedBaseUrl ?? "").startsWith("http://")
    ? "http:"
    : "https:";
  const port = target.port ?? String(target.redactedBaseUrl ?? "").match(/:(\d+)(?:\/)?$/)?.[1] ?? "unknown";
  return `${protocol}//<redacted-ocp-api>${port === "unknown" ? "" : `:${port}`}`;
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

function loadManifest(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail("RBAC manifest", `${absolutePath} is missing`);
    return { absolutePath, documents: [] };
  }
  try {
    const raw = readFileSync(absolutePath, "utf8");
    const docs = YAML.parseAllDocuments(raw)
      .map((document) => document.toJSON())
      .filter(Boolean);
    pass("RBAC manifest", `${absolutePath} parsed as ${docs.length} YAML document(s)`);
    return { absolutePath, documents: docs };
  } catch (error) {
    fail("RBAC manifest", `${absolutePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return { absolutePath, documents: [] };
  }
}

function findResource(documents, kind, name) {
  return documents.find(
    (document) => document?.kind === kind && document?.metadata?.name === name
  );
}

function flattenRuleValues(rules, key) {
  return rules.flatMap((rule) =>
    Array.isArray(rule?.[key]) ? rule[key].map((value) => String(value)) : []
  );
}

function validateManifest(documents, manifestPath) {
  const namespace = findResource(documents, "Namespace", expected.namespace);
  const serviceAccount = findResource(documents, "ServiceAccount", expected.serviceAccount);
  const clusterRole = findResource(documents, "ClusterRole", expected.clusterRole);
  const clusterRoleBinding = findResource(documents, "ClusterRoleBinding", expected.clusterRoleBinding);
  const violations = [];

  if (!namespace) {
    violations.push("namespaceMissing");
  }

  if (!serviceAccount) {
    violations.push("serviceAccountMissing");
  } else if (serviceAccount.metadata?.namespace !== expected.namespace) {
    violations.push(`serviceAccountNamespace=${serviceAccount.metadata?.namespace ?? "missing"}`);
  }

  if (!clusterRole) {
    violations.push("clusterRoleMissing");
  }

  if (!clusterRoleBinding) {
    violations.push("clusterRoleBindingMissing");
  } else {
    if (clusterRoleBinding.roleRef?.kind !== "ClusterRole") {
      violations.push(`roleRefKind=${clusterRoleBinding.roleRef?.kind ?? "missing"}`);
    }
    if (clusterRoleBinding.roleRef?.name !== expected.clusterRole) {
      violations.push(`roleRefName=${clusterRoleBinding.roleRef?.name ?? "missing"}`);
    }
    const subjectMatch = (clusterRoleBinding.subjects ?? []).some(
      (subject) =>
        subject?.kind === "ServiceAccount" &&
        subject?.name === expected.serviceAccount &&
        subject?.namespace === expected.namespace
    );
    if (!subjectMatch) {
      violations.push("subjectServiceAccountMissing");
    }
  }

  const rules = Array.isArray(clusterRole?.rules) ? clusterRole.rules : [];
  const verbs = flattenRuleValues(rules, "verbs").map((verb) => verb.toLowerCase());
  const resources = flattenRuleValues(rules, "resources").map((resource) => resource.toLowerCase());
  const apiGroups = flattenRuleValues(rules, "apiGroups");
  const forbiddenVerbHits = verbs.filter(
    (verb) => !allowedVerbs.has(verb) || mutatingVerbs.has(verb)
  );
  const forbiddenResourceHits = resources.filter((resource) =>
    forbiddenResources.has(resource)
  );
  const emptyRules = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) =>
      !Array.isArray(rule?.resources) ||
      rule.resources.length === 0 ||
      !Array.isArray(rule?.verbs) ||
      rule.verbs.length === 0
    )
    .map(({ index }) => index);

  if (rules.length === 0) violations.push("clusterRoleRulesMissing");
  if (forbiddenVerbHits.length > 0) {
    violations.push(`forbiddenVerbs=${Array.from(new Set(forbiddenVerbHits)).join(",")}`);
  }
  if (forbiddenResourceHits.length > 0) {
    violations.push(`forbiddenResources=${Array.from(new Set(forbiddenResourceHits)).join(",")}`);
  }
  if (emptyRules.length > 0) {
    violations.push(`emptyRules=${emptyRules.join(",")}`);
  }

  if (violations.length > 0) {
    fail("RBAC manifest safety", violations.join("; "));
  } else {
    pass(
      "RBAC manifest safety",
      `${expected.serviceAccount} binds ${rules.length} rule(s), verbs=${Array.from(new Set(verbs)).join(",")}, secrets=false`
    );
  }

  return {
    path: manifestPath,
    namespace: {
      name: namespace?.metadata?.name ?? "missing"
    },
    serviceAccount: {
      name: serviceAccount?.metadata?.name ?? "missing",
      namespace: serviceAccount?.metadata?.namespace ?? "missing"
    },
    clusterRole: {
      name: clusterRole?.metadata?.name ?? "missing",
      ruleCount: rules.length,
      apiGroups: Array.from(new Set(apiGroups)).sort(),
      resources: Array.from(new Set(resources)).sort(),
      verbs: Array.from(new Set(verbs)).sort(),
      allowedVerbs: Array.from(allowedVerbs).sort(),
      forbiddenVerbs: Array.from(new Set(forbiddenVerbHits)).sort(),
      forbiddenResources: Array.from(new Set(forbiddenResourceHits)).sort(),
      secretsIncluded: forbiddenResourceHits.length > 0,
      readOnlyOnly: forbiddenVerbHits.length === 0
    },
    clusterRoleBinding: {
      name: clusterRoleBinding?.metadata?.name ?? "missing",
      roleRef: clusterRoleBinding?.roleRef ?? {},
      subjects: clusterRoleBinding?.subjects ?? []
    },
    violations
  };
}

function authLikeClassification(classification) {
  return ["auth-or-rbac", "auth-failed", "token-missing"].includes(classification);
}

function credentialHygieneFromConnectivity(artifact) {
  const hygiene = artifact?.credentialHygiene ?? {};
  return {
    tokenConfigured: hygiene.tokenConfigured === true,
    tokenSource: sanitize(hygiene.tokenSource ?? artifact?.target?.tokenSource ?? "unknown"),
    tokenCandidateCount: Number.isFinite(Number(hygiene.tokenCandidateCount))
      ? Number(hygiene.tokenCandidateCount)
      : Number(artifact?.target?.tokenCandidateCount ?? 0),
    tokenLengthClass: sanitize(hygiene.tokenLengthClass ?? "unknown"),
    tokenLooksPlaceholder: hygiene.tokenLooksPlaceholder === true,
    tokenHasWhitespace: hygiene.tokenHasWhitespace === true,
    tokenStartsWithBearer: hygiene.tokenStartsWithBearer === true,
    tokenLooksOpenShiftSha: hygiene.tokenLooksOpenShiftSha === true,
    localFormatIssue: hygiene.localFormatIssue === true,
    credentialStoredByVerifier: hygiene.credentialStoredByVerifier === true,
    tokenValueRedacted: hygiene.tokenValueRedacted !== false,
    credentialDiagnosis: sanitize(hygiene.credentialDiagnosis ?? "unknown")
  };
}

function statusFor(classification, hasFailures) {
  if (hasFailures) return "BLOCKED";
  if (classification === "api-ready") return "READY_FOR_LIVE_CHECK";
  if (authLikeClassification(classification)) return "AUTH_RBAC_APPROVAL_REQUIRED";
  return "WAITING_FOR_CONNECTIVITY";
}

function readOnlyCommands(manifestPath) {
  const sa = `system:serviceaccount:${expected.namespace}:${expected.serviceAccount}`;
  return [
    {
      id: "refresh-ocp-connectivity",
      phase: "local-evidence-refresh",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      purpose: "Refresh redacted OCP API DNS/TCP/TLS/auth classification.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "refresh-ocp-auth-rbac-plan",
      phase: "local-evidence-refresh",
      command: "npm run evidence:ocp-auth-rbac-plan",
      purpose: "Regenerate this read-only RBAC approval packet.",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "verify-post-approval-live-reader-smoke",
      phase: "post-approval-live-smoke",
      command: "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000",
      purpose:
        "After cluster-admin applies the RBAC and provides the short-lived token through approved secret handling, prove OCP connectivity, required read-only RBAC, and Lightspeed discovery without printing the token.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "server-dry-run-live-reader-rbac",
      phase: "cluster-admin-review",
      command: `oc apply --dry-run=server --validate=true -f ${manifestPath}`,
      purpose: "Validate the RBAC manifest against the target API without persisting resources.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "can-i-list-pods-as-live-reader",
      phase: "cluster-admin-review",
      command: `oc auth can-i list pods -A --as=${sa}`,
      purpose: "Confirm the live evidence reader can list pods across namespaces after approval.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "can-i-get-pod-logs-as-live-reader",
      phase: "cluster-admin-review",
      command: `oc auth can-i get pods/log -A --as=${sa}`,
      purpose: "Confirm bounded pod log reads are allowed without granting mutation.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "can-i-get-olsconfigs-as-live-reader",
      phase: "cluster-admin-review",
      command: `oc auth can-i get olsconfigs.ols.openshift.io -A --as=${sa}`,
      purpose: "Confirm Lightspeed OLSConfig discovery can be read by the fallback reader.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "verify-api-version-as-live-reader",
      phase: "cluster-admin-review",
      command: `oc get --raw=/version --as=${sa}`,
      purpose: "Confirm the approved reader can reach Kubernetes /version without exposing token values.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    }
  ];
}

function approvalGatedCommands(manifestPath) {
  return [
    {
      id: "apply-live-evidence-reader-rbac",
      phase: "cluster-admin-approval",
      command: `oc apply -f ${manifestPath}`,
      mutation: true,
      requiresExplicitApproval: true,
      rationale:
        "Creates the fallback Namespace, read-only ServiceAccount, ClusterRole, and ClusterRoleBinding for live evidence when user-token RBAC is unavailable.",
      rollback:
        "oc delete clusterrolebinding/cywell-opslens-live-evidence-reader clusterrole/cywell-opslens-live-evidence-reader serviceaccount/cywell-opslens-live-evidence-reader -n cywell-opslens"
    },
    {
      id: "create-short-lived-live-reader-token",
      phase: "cluster-admin-approval",
      command: `oc -n ${expected.namespace} create token ${expected.serviceAccount} --duration=8h`,
      mutation: true,
      requiresExplicitApproval: true,
      rationale:
        "Issues a short-lived credential only after the read-only RBAC is approved; store it through approved secret handling, not in logs.",
      rollback:
        "Let the short-lived token expire, remove the local credential, then delete the RBAC binding if the fallback reader is no longer approved."
    }
  ];
}

function buildTicketPacket({
  status,
  classification,
  target,
  credentialHygiene,
  rbac,
  readOnly,
  approvalGated,
  missingEvidence,
  risk,
  rollbackPath
}) {
  const firstApproval =
    approvalGated.find((command) => command.id === "apply-live-evidence-reader-rbac") ??
    approvalGated[0];
  return {
    id: "cluster-admin-ocp-live-reader-rbac-ticket",
    owner: "cluster-admin",
    title: "OCP live evidence reader RBAC approval",
    severity: status === "AUTH_RBAC_APPROVAL_REQUIRED" ? "blocker" : "high",
    classification,
    redactedTarget: redactedOcpTarget(target),
    summary:
      "Review the fallback read-only live evidence reader RBAC plan before any ServiceAccount token is created or used.",
    evidenceChecklist: [
      `classification=${classification}`,
      `status=${status}`,
      `manifest=${rbac.path}`,
      `rules=${rbac.clusterRole.ruleCount}`,
      `readOnlyOnly=${String(rbac.clusterRole.readOnlyOnly === true)}`,
      `secretsIncluded=${String(rbac.clusterRole.secretsIncluded === true)}`,
      `credentialDiagnosis=${credentialHygiene.credentialDiagnosis}`,
      `credentialLocalFormatIssue=${String(credentialHygiene.localFormatIssue)}`,
      `tokenValueRedacted=${String(credentialHygiene.tokenValueRedacted)}`,
      "approvalCommandsNotRun=true"
    ],
    firstReadOnlyAction: {
      id: "cluster-admin-review-ocp-auth-rbac-evidence",
      status: status === "AUTH_RBAC_APPROVAL_REQUIRED" ? "blocker" : "open",
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: firstApproval?.id ?? "apply-live-evidence-reader-rbac",
      status: "approval-gated",
      nextCommand: firstApproval?.command ?? `oc apply -f ${options.manifest}`,
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: [
      "npm run evidence:ocp-auth-rbac-plan",
      ...readOnly
        .map((command) => command.command)
        .filter(Boolean)
        .filter((command) => !/^oc apply -f /.test(command))
        .slice(0, 5)
    ],
    blockedBy: missingEvidence,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      authRbacApprovalRequiresExplicitApproval: true,
      tokenCreationRequiresApprovedSecretHandling: true
    },
    risk: risk[0] ?? "Fallback reader RBAC exposes broad read-only metadata and must be explicitly approved.",
    rollbackPath:
      rollbackPath[1] ??
      "If the RBAC is approved and later revoked, delete the ClusterRoleBinding, ClusterRole, and ServiceAccount named cywell-opslens-live-evidence-reader."
  };
}

function adminRequests(classification, credentialHygiene) {
  if (authLikeClassification(classification)) {
    const credentialRequest = credentialHygiene.credentialDiagnosis === "credential-rejected-or-expired"
      ? "Refresh the OCP token from the target cluster; local hygiene shows no placeholder, whitespace, Bearer-prefix, or short-token issue, so treat 401 as rejected/expired/wrong-cluster credential until proven otherwise."
      : credentialHygiene.localFormatIssue
        ? "Fix local OCP token formatting before approving fallback RBAC; hygiene indicates a placeholder, whitespace, Bearer-prefix, missing, or short-token issue without exposing the token value."
        : "Confirm the configured OCP credential is current before approving fallback RBAC.";
    return [
      credentialRequest,
      `Review ${options.manifest} as the fallback read-only live evidence reader for the current OCP auth/RBAC gap.`,
      "Prefer user-token passthrough for normal ConsolePlugin/API reads; use this ServiceAccount only when shared diagnostic evidence is explicitly approved.",
      "Apply the manifest only after confirming it excludes Secrets and only grants get/list/watch.",
      "Create a short-lived token through approved secret handling, then run npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000 to refresh OCP connectivity and Lightspeed readiness evidence."
    ];
  }
  if (classification === "api-ready") {
    return [
      "The OCP API is currently reachable; keep this RBAC plan as a fallback approval packet only.",
      "Do not create a shared reader token unless user-token passthrough cannot collect the required evidence."
    ];
  }
  return [
    `Resolve OCP connectivity classification=${classification} before applying fallback RBAC.`,
    "Keep this RBAC packet attached to the cluster-admin review so auth/RBAC approval can proceed after DNS/TCP/TLS is restored."
  ];
}

function markdownFor(packet) {
  const target = packet.target;
  const lines = [
    "# Cywell OpsLens OCP Auth/RBAC Approval Plan",
    "",
    `Generated: ${packet.generatedAt}`,
    `Git: ${packet.ref.branch} ${packet.ref.headSha} dirty=${packet.ref.worktreeDirty}`,
    "",
    "## Current Finding",
    "",
    `- Status: ${packet.status}`,
    `- Action mode: ${packet.actionMode}`,
    `- OCP classification: ${packet.diagnostics.classification}`,
    `- Credential diagnosis: ${packet.credentialHygiene.credentialDiagnosis}`,
    `- Credential local format issue: ${String(packet.credentialHygiene.localFormatIssue)}`,
    `- Token value redacted: ${String(packet.credentialHygiene.tokenValueRedacted)}`,
    `- Target: ${redactedOcpTarget(target)}`,
    `- Manifest: ${packet.rbac.path}`,
    `- Namespace: ${packet.rbac.namespace.name}`,
    `- ServiceAccount: ${packet.rbac.serviceAccount.namespace}/${packet.rbac.serviceAccount.name}`,
    `- ClusterRole: ${packet.rbac.clusterRole.name}`,
    `- Rule count: ${packet.rbac.clusterRole.ruleCount}`,
    `- Verbs: ${packet.rbac.clusterRole.verbs.join(", ") || "missing"}`,
    `- Secrets included: ${String(packet.rbac.clusterRole.secretsIncluded)}`,
    `- Read-only only: ${String(packet.rbac.clusterRole.readOnlyOnly)}`,
    "",
    "## Cluster Admin Requests",
    "",
    ...packet.adminRequests.map((item) => `- ${item}`),
    "",
    "## Read-Only Validation Commands",
    "",
    ...packet.readOnlyCommands.map((command) => [
      `### ${command.id}`,
      "",
      `Purpose: ${command.purpose}`,
      "",
      "```powershell",
      command.command,
      "```",
      ""
    ].join("\n")),
    "## Approval-Gated Commands Not Run",
    "",
    ...packet.approvalGatedCommands.map((command) => [
      `### ${command.id}`,
      "",
      `Rationale: ${command.rationale}`,
      "",
      "```powershell",
      command.command,
      "```",
      ""
    ].join("\n")),
    "## Approval Ticket Packet",
    "",
    `- ID: ${packet.ticketPacket.id}`,
    `- Owner: ${packet.ticketPacket.owner}`,
    `- Severity: ${packet.ticketPacket.severity}`,
    `- Classification: ${packet.ticketPacket.classification}`,
    `- First read-only action: ${packet.ticketPacket.firstReadOnlyAction.id}`,
    `- First read-only command: ${packet.ticketPacket.firstReadOnlyAction.nextCommand}`,
    `- Approval-gated action: ${packet.ticketPacket.approvalGatedAction.id}`,
    `- Approval required: ${String(packet.ticketPacket.approvalGatedAction.requiresExplicitApproval)}`,
    `- Mutation allowed by verifier: ${String(packet.ticketPacket.mutationBoundary.mutationAllowedByThisVerifier)}`,
    "",
    "## Mutation Boundary",
    "",
    "- This verifier did not apply RBAC, create tokens, patch OLSConfig, install Operators, delete, scale, push, mirror, copy, or sign anything.",
    "- The manifest is intentionally separate from Operator controller RBAC.",
    "- Secrets are excluded from the read-only live evidence reader.",
    "",
    "## Rollback Path",
    "",
    ...packet.rollbackPath.map((item) => `- ${item}`),
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

  const ocpConnectivity = loadJson(
    options.ocpConnectivityEvidence,
    "OCP connectivity diagnostic",
    false
  );
  const sourceArtifacts = [
    sourceSummary(
      "ocpConnectivity",
      "OCP connectivity diagnostic",
      options.ocpConnectivityEvidence,
      ocpConnectivity,
      headSha,
      false
    )
  ];
  const manifest = loadManifest(options.manifest);
  const rbac = validateManifest(manifest.documents, manifest.absolutePath);
  const classification = ocpConnectivity?.diagnostics?.classification ?? "missing";
  const credentialHygiene = credentialHygieneFromConnectivity(ocpConnectivity);
  const status = statusFor(
    classification,
    checks.some((check) => check.status === "FAIL") || rbac.violations.length > 0
  );
  const readOnly = readOnlyCommands(options.manifest);
  const approvalGated = approvalGatedCommands(options.manifest);
  const missingEvidence = [
    ...(ocpConnectivity ? [] : ["OCP connectivity diagnostic evidence is missing"]),
    ...(sourceArtifacts.some((source) => source.required && !source.fresh)
      ? ["OCP connectivity diagnostic is not fresh for current head"]
      : []),
    ...(status === "AUTH_RBAC_APPROVAL_REQUIRED"
      ? [`cluster-admin approval is required because OCP connectivity classification=${classification}`]
      : []),
    ...(classification === "auth-failed"
      ? [`OCP credential hygiene diagnosis=${credentialHygiene.credentialDiagnosis}`]
      : []),
    ...(status === "WAITING_FOR_CONNECTIVITY"
      ? [`OCP connectivity classification=${classification}; resolve DNS/TCP/TLS/API reachability before using fallback RBAC`]
      : []),
    ...rbac.violations.map((violation) => `RBAC manifest violation: ${violation}`)
  ];
  const risk = [
    "This fallback reader is cluster-scoped read-only and should be approved only when user-token passthrough cannot collect required shared diagnostic evidence.",
    "The manifest excludes Secrets and mutating verbs, but it can still read broad workload metadata, events, logs, routes, and cluster operator state.",
    "Short-lived reader tokens must be handled through approved secret management and must not be committed, pasted into tickets, or printed in logs.",
    "This plan is separate from Operator controller RBAC, which includes reconciliation permissions and is not suitable as a pre-install diagnostic credential."
  ];
  const rollbackPath = [
    "No rollback is required for this verifier because it writes only local evidence.",
    "If the RBAC is approved and later revoked, delete the ClusterRoleBinding, ClusterRole, and ServiceAccount named cywell-opslens-live-evidence-reader.",
    "Do not delete the cywell-opslens namespace as rollback unless it was created only for this fallback reader and contains no product resources.",
    "Remove the local short-lived credential and rerun npm run verify:ocp:connectivity -- --timeout-ms 30000 to prove the current auth/RBAC state."
  ];

  const packet = {
    schema: "cywell.opslens.ocp-auth-rbac-plan.v0.1",
    artifactType: "opslens.ocp-auth-rbac-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "approvalPlanOnly",
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
    target: {
      host: ocpConnectivity?.target?.host ?? "missing",
      port: ocpConnectivity?.target?.port ?? "missing",
      redactedBaseUrl: ocpConnectivity?.target?.redactedBaseUrl ?? "missing",
      tokenConfigured: ocpConnectivity?.target?.tokenConfigured === true,
      tlsVerify: ocpConnectivity?.target?.tlsVerify === true
    },
    credentialHygiene,
    diagnostics: {
      classification,
      credentialDiagnosis: credentialHygiene.credentialDiagnosis,
      credentialLocalFormatIssue: credentialHygiene.localFormatIssue,
      dns: ocpConnectivity?.diagnostics?.dns?.status ?? "missing",
      tcp: ocpConnectivity?.diagnostics?.tcp?.status ?? "missing",
      tls: ocpConnectivity?.diagnostics?.tls?.status ?? "missing",
      kubernetesVersion:
        ocpConnectivity?.diagnostics?.kubernetesVersion?.status ?? "missing",
      oc: ocpConnectivity?.diagnostics?.oc?.versionGet ?? "missing"
    },
    requiredApprovals: ["cluster-admin", "security-reviewer"],
    preferredCredentialMode: "user-token-passthrough",
    fallbackCredentialMode: "short-lived-read-only-serviceaccount-token",
    rbac,
    readOnlyCommands: readOnly,
    approvalGatedCommands: approvalGated,
    sourceArtifacts,
    adminRequests: adminRequests(classification, credentialHygiene),
    missingEvidence,
    ticketPacket: buildTicketPacket({
      status,
      classification,
      target: {
        port: ocpConnectivity?.target?.port ?? "missing",
        redactedBaseUrl: ocpConnectivity?.target?.redactedBaseUrl ?? "missing"
      },
      credentialHygiene,
      rbac,
      readOnly,
      approvalGated,
      missingEvidence,
      risk,
      rollbackPath
    }),
    risk,
    rollbackPath,
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  const markdown = markdownFor(packet);
  if (secretLike(serialized) || secretLike(markdown)) {
    throw new Error("OCP auth/RBAC plan would include secret-like material");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass("OCP auth/RBAC plan export", `${resolve(options.evidenceOut)} and ${resolve(options.markdownOut)} written without secret material`);

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens OCP auth/RBAC plan: status=${status}, classification=${classification}, manifest=${resolve(options.manifest)}`);

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("OCP auth/RBAC plan runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] OCP auth/RBAC plan runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
