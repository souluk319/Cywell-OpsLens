#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  sanitizeCommonSensitive,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const repoRoot = resolve(".");
const evidenceOut = resolve(
  process.env.CYWELL_OPSLENS_OCP_TARGET_PROFILE_EVIDENCE ??
    "test-results/cywell-opslens-ocp-target-profile.json"
);

const ocpBaseUrlKeys = [
  "OCP_API_BASE_URL",
  "OPENSHIFT_API_BASE_URL",
  "KUBE_API_BASE_URL"
];
const ocpTokenKeys = ["OCP_API_TOKEN", "OPENSHIFT_API_TOKEN", "KUBE_API_TOKEN"];
const tlsKeys = [
  "OCP_TLS_VERIFY",
  "OPENSHIFT_API_TLS_VERIFY",
  "KUBE_TLS_VERIFY",
  "OCP_INSECURE_SKIP_TLS_VERIFY",
  "OPENSHIFT_API_INSECURE_SKIP_TLS_VERIFY",
  "KUBE_INSECURE_SKIP_TLS_VERIFY"
];
const trackedKeys = new Set([
  ...ocpBaseUrlKeys,
  ...ocpTokenKeys,
  ...tlsKeys,
  "OCP_API_TIMEOUT_SECONDS",
  "OPENSHIFT_API_TIMEOUT_SECONDS",
  "KUBE_API_TIMEOUT_SECONDS",
  "OPENSHIFT_LIGHTSPEED_BASE_URL",
  "OPENSHIFT_LIGHTSPEED_API_TOKEN",
  "OPENSHIFT_LIGHTSPEED_TLS_VERIFY",
  "OPENSHIFT_LIGHTSPEED_TIMEOUT_SECONDS",
  "CYWELL_OPSLENS_RAG_RUNTIME_MODE",
  "OCP_ENABLE_MONITORING_PROXY"
]);

const args = new Set(process.argv.slice(2));
const requireCrc = args.has("--require-crc");
const checks = [];

function sanitize(value) {
  return sanitizeCommonSensitive(value);
}

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail: sanitize(detail), ...extra });
  console.log(`[${status}] ${name}: ${sanitize(detail)}`);
}

function pass(name, detail, extra) {
  record("PASS", name, detail, extra);
}

function warn(name, detail, extra) {
  record("WARN", name, detail, extra);
}

function fail(name, detail, extra) {
  record("FAIL", name, detail, extra);
}

function gitValue(args, fallback) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return fallback;
  return result.stdout.trim().split(/\r?\n/).at(-1)?.trim() || fallback;
}

function gitStatusShort() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout.trim()) return [];
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(sanitize);
}

function readEnvEntries(path = resolve(repoRoot, ".env")) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((rawLine, index) => {
      const match = rawLine.match(/^\s*(#?)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return [];
      const [, marker, key, rawValue] = match;
      if (!trackedKeys.has(key)) return [];
      let value = String(rawValue ?? "").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [
        {
          key,
          active: marker !== "#",
          value,
          line: index + 1,
          valuePresent: value.length > 0
        }
      ];
    });
}

function firstActive(entries, keys) {
  return entries.find((entry) => entry.active && keys.includes(entry.key));
}

function boolFromString(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function endpointParts(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return {
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port || (url.protocol === "https:" ? "443" : "80")
    };
  } catch {
    return undefined;
  }
}

function classifyTarget(value) {
  if (!value) {
    return {
      kind: "missing",
      label: "missing",
      targetSafety: "not-configured",
      recommendedUsage: "Configure a CRC or approved read-only OCP target before live checks."
    };
  }
  const parts = endpointParts(value);
  const host = parts?.hostname ?? String(value).toLowerCase();
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(host);
  const isCrc = /\bcrc\b/i.test(host);
  const isPrivate =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isCrc) {
    return {
      kind: "crc-sandbox",
      label: "CRC sandbox",
      targetSafety: "development-sandbox",
      recommendedUsage:
        "Use for iterative Operator, ConsolePlugin, API, RAG, and install-plan experiments."
    };
  }
  if (isLocalhost) {
    return {
      kind: "local-or-forwarded",
      label: "local or forwarded OCP API",
      targetSafety: "sandbox-or-tunnel",
      recommendedUsage:
        "Confirm this forwards to CRC before running install or patch experiments."
    };
  }
  if (isPrivate) {
    return {
      kind: "private-network",
      label: "private network OCP API",
      targetSafety: "shared-or-lab",
      recommendedUsage:
        "Treat as shared until ownership is confirmed; use read-only evidence by default."
    };
  }
  return {
    kind: "company-shared",
    label: "company/shared OCP API",
    targetSafety: "shared-environment",
    recommendedUsage:
      "Use read-only diagnostics and provider traces only; move development mutation experiments to CRC."
  };
}

function tlsSummary(entries) {
  const explicit = firstActive(entries, ["OCP_TLS_VERIFY", "OPENSHIFT_API_TLS_VERIFY", "KUBE_TLS_VERIFY"]);
  const insecure = firstActive(entries, [
    "OCP_INSECURE_SKIP_TLS_VERIFY",
    "OPENSHIFT_API_INSECURE_SKIP_TLS_VERIFY",
    "KUBE_INSECURE_SKIP_TLS_VERIFY"
  ]);
  const tlsVerify = explicit
    ? boolFromString(explicit.value, true)
    : insecure
      ? !boolFromString(insecure.value, false)
      : true;
  return {
    tlsVerify,
    sourceKey: explicit?.key ?? insecure?.key ?? "default",
    configured: Boolean(explicit || insecure)
  };
}

function duplicateActiveKeys(entries) {
  const counts = new Map();
  for (const entry of entries.filter((item) => item.active)) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

function keySummary(entry) {
  if (!entry) return { configured: false, key: "missing", valuePresent: false };
  return {
    configured: entry.active,
    key: entry.key,
    valuePresent: entry.valuePresent,
    line: entry.line
  };
}

function commandPlan(targetKind) {
  const sharedReadOnly = [
    "npm run verify:env",
    "npm run verify:ocp:target-profile",
    "npm run verify:ocp:connectivity -- --timeout-ms 30000",
    "npm run verify:console-assistant-provider"
  ];
  const crcSwitch = [
    "On the MacBook: crc start",
    "On the MacBook: eval $(crc oc-env)",
    "On the MacBook: oc login -u kubeadmin -p <crc-password> <crc-api-url>",
    "On the MacBook: oc whoami -t",
    "Update the ignored .env through approved local secret handling: OCP_API_BASE_URL=<crc-api-url>, OCP_API_TOKEN=<redacted>, OCP_TLS_VERIFY=false",
    "npm run verify:env",
    "npm run verify:ocp:target-profile -- --require-crc",
    "npm run verify:ocp:connectivity -- --timeout-ms 30000",
    "npm run verify:lightspeed:fixture",
    "npm run verify:lightspeed:patch-preview:fixture"
  ];
  return {
    currentSafeCommands:
      targetKind === "crc-sandbox"
        ? crcSwitch.slice(5)
        : sharedReadOnly,
    crcSwitchPlan: crcSwitch,
    forbiddenWithoutApproval: [
      "oc apply",
      "oc patch",
      "oc delete",
      "oc scale",
      "Operator install against company/shared OCP",
      "OLSConfig patch against company/shared OCP"
    ]
  };
}

function hasForbiddenLeak(serialized) {
  return sensitiveEndpointLeakLike(serialized) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(serialized) ||
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized) ||
    /(?:password|passwd|secret|api[_-]?key|token)(=|:)(?!<redacted>)[^\s"']+/i.test(serialized) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(serialized);
}

const entries = readEnvEntries();
const activeOcpUrl = firstActive(entries, ocpBaseUrlKeys);
const activeToken = firstActive(entries, ocpTokenKeys);
const target = classifyTarget(activeOcpUrl?.value);
const tls = tlsSummary(entries);
const duplicates = duplicateActiveKeys(entries);
const worktreeStatus = gitStatusShort();
const failCountBeforeStatus = () => checks.filter((check) => check.status === "FAIL").length;

if (worktreeStatus.length > 0) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
else pass("current worktree", `dirty=false head=${gitValue(["rev-parse", "--short", "HEAD"], "unknown")}`);

if (!entries.length) warn("env file", ".env is missing or has no tracked OCP/Lightspeed entries");
else pass("env file", `tracked entries=${entries.length}; values redacted`);

if (duplicates.length === 0) pass("active key uniqueness", "no duplicate active tracked keys");
else fail("active key uniqueness", `duplicate active key(s): ${duplicates.join(", ")}`);

if (activeOcpUrl?.valuePresent) pass("OCP API target key", `${activeOcpUrl.key} active; value redacted`);
else fail("OCP API target key", "active OCP API URL key is missing or empty");

if (activeToken?.valuePresent) pass("OCP API token key", `${activeToken.key} active; value redacted`);
else warn("OCP API token key", "active OCP API token key is missing or empty");

if (target.kind === "crc-sandbox") {
  pass("target profile", "current active OCP target is classified as CRC sandbox");
} else if (target.kind === "company-shared" || target.kind === "private-network") {
  warn("target profile", `current active OCP target is classified as ${target.label}`);
} else {
  warn("target profile", `current active OCP target is classified as ${target.label}`);
}

if (requireCrc && target.kind !== "crc-sandbox") {
  fail("required CRC target", "runbook requires CRC sandbox target but active target is not CRC");
} else if (requireCrc) {
  pass("required CRC target", "active target satisfies --require-crc");
}

if (target.kind === "crc-sandbox" && tls.tlsVerify === false) {
  pass("CRC TLS profile", `${tls.sourceKey} disables TLS verification for CRC self-signed cert handling`);
} else if (target.kind === "crc-sandbox") {
  warn("CRC TLS profile", "CRC usually needs OCP_TLS_VERIFY=false unless a trusted CA is configured");
} else {
  pass("TLS profile", `${tls.sourceKey} tlsVerify=${String(tls.tlsVerify)}; value redacted`);
}

const missingEvidence = [
  ...(activeOcpUrl?.valuePresent ? [] : ["active OCP API URL key is missing"]),
  ...(activeToken?.valuePresent ? [] : ["active OCP API token key is missing"]),
  ...duplicates.map((key) => `duplicate active target key ${key}`),
  ...(requireCrc && target.kind !== "crc-sandbox"
    ? ["active OCP target is not classified as CRC sandbox"]
    : []),
  ...(target.kind === "crc-sandbox" && tls.tlsVerify !== false
    ? ["CRC target detected but TLS verify is not explicitly disabled or otherwise trusted"]
    : [])
];

const hardFailures = failCountBeforeStatus();
const status = hardFailures > 0
  ? "FAIL"
  : target.kind === "crc-sandbox"
    ? "CRC_SANDBOX_READY"
    : target.kind === "company-shared" || target.kind === "private-network"
      ? "COMPANY_SHARED_READ_ONLY"
      : "NEEDS_TARGET_REVIEW";

const artifact = {
  schema: "cywell.opslens.ocp-target-profile.v0.1",
  artifactType: "opslens.ocp-target-profile.v0.1",
  generatedAt: new Date().toISOString(),
  status,
  actionMode: "localEnvTargetAuditOnly",
  clusterMutationAttempted: false,
  registryMutationAttempted: false,
  vectorWriteAttempted: false,
  mutationAllowedByThisVerifier: false,
  acceptance: ["AC-ENV-001", "AC-OCP-001", "AC-LIVE-HANDOFF-001"],
  ref: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    worktreeDirty: worktreeStatus.length > 0,
    worktreeStatus
  },
  target: {
    kind: target.kind,
    label: target.label,
    targetSafety: target.targetSafety,
    recommendedUsage: target.recommendedUsage,
    redactedBaseUrl: activeOcpUrl?.valuePresent ? "<redacted-ocp-api>" : "<missing>",
    baseUrl: keySummary(activeOcpUrl),
    token: keySummary(activeToken),
    tls
  },
  envAudit: {
    trackedEntryCount: entries.length,
    activeKeys: entries.filter((entry) => entry.active).map((entry) => entry.key).sort(),
    commentedTrackedCount: entries.filter((entry) => !entry.active).length,
    duplicateActiveKeys: duplicates
  },
  boundary: {
    companyOcpAllowedUse: "read-only diagnostics, provider trace, evidence collection",
    crcAllowedUse: "sandbox development, local install rehearsal, fixture-backed Lightspeed patch preview",
    companyOcpMutationAllowedByThisVerifier: false,
    crcMutationAllowedByThisVerifier: false,
    mutationRequiresExplicitHumanApproval: true
  },
  commandPlan: commandPlan(target.kind),
  missingEvidence,
  evidence: [
    "The verifier reads .env key presence and endpoint shape only; values are redacted.",
    "Company/shared OCP targets are explicitly kept read-only to avoid collisions with other operators.",
    "CRC targets are treated as the preferred sandbox for development iteration, but this verifier still performs no mutation.",
    "No network probe, OCP API call, apply, patch, delete, scale, install, push, mirror, sign, vector write, or Secret fetch is attempted."
  ],
  risk: [
    "Running Operator install or OLSConfig patch experiments against a shared company cluster can conflict with another operator's work.",
    "CRC on a MacBook may not be reachable from this Windows workspace unless the API endpoint is exposed or the work is run on the MacBook.",
    "Disabling TLS verification is acceptable for local CRC self-signed certificates but should not be copied blindly to company OCP."
  ],
  rollbackPath: [
    "No rollback is required because this verifier is a local .env audit only.",
    "To return to company observation mode, restore company OCP values in ignored .env and rerun npm run verify:ocp:target-profile.",
    "To move to CRC sandbox mode, update ignored .env with the CRC API URL/token through approved local secret handling, then rerun npm run verify:env and npm run verify:ocp:connectivity."
  ],
  checks
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (hasForbiddenLeak(serialized)) {
  throw new Error("OCP target profile evidence would include a secret or unredacted live endpoint");
}

mkdirSync(dirname(evidenceOut), { recursive: true });
writeFileSync(evidenceOut, serialized);

pass("OCP target profile evidence export", `${evidenceOut} written without secret material`);
console.log("");
console.log(
  `Cywell OpsLens OCP target profile: status=${status}, target=${target.kind}, ${checks.filter((check) => check.status === "FAIL").length} fail, ${checks.filter((check) => check.status === "WARN").length} warn, ${checks.length} checks`
);

if (status === "FAIL") process.exitCode = 1;
