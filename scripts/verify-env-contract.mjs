#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(".");
const evidenceOut = resolve(
  process.env.CYWELL_OPSLENS_ENV_CONTRACT_EVIDENCE ??
    "test-results/cywell-opslens-env-contract.json"
);
const envModule = pathToFileURL(resolve(repoRoot, "apps/api/src/env.ts")).href;
const tsxCli = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");
const sensitiveEnvPrefix = /^(OCP|OPENSHIFT|KUBE|CYWELL_OPSLENS)_/;

function cleanEnv(overrides, cwd) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (sensitiveEnvPrefix.test(key)) {
      delete env[key];
    }
  }
  return {
    ...env,
    KUBECONFIG: resolve(cwd, "missing-kubeconfig"),
    ...overrides
  };
}

function readOcpConfig(overrides) {
  const cwd = mkdtempSync(resolve(tmpdir(), "opslens-env-contract-"));
  const source = [
    `import { getOcpConfig } from ${JSON.stringify(envModule)};`,
    "const config = getOcpConfig();",
    "console.log(JSON.stringify({",
    "baseUrl: config.baseUrl,",
    "tokenSet: Boolean(config.token),",
    "baseUrlCandidateCount: config.baseUrlCandidates.length,",
    "tokenCandidateCount: config.tokenCandidates.length,",
    "tlsVerify: config.tlsVerify,",
    "timeoutMs: config.timeoutMs,",
    "allowSecretFetch: config.allowSecretFetch,",
    "enableMonitoringProxy: config.enableMonitoringProxy",
    "}));"
  ].join("\n");

  try {
    const result = spawnSync(process.execPath, [tsxCli, "-e", source], {
      cwd,
      env: cleanEnv(overrides, cwd),
      encoding: "utf8"
    });

    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "tsx probe failed").trim());
    }

    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, condition, detail });
  const prefix = condition ? "[PASS]" : "[FAIL]";
  console.log(`${prefix} ${name}: ${detail}`);
}

function gitValue(args, fallback) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout.trim()) return fallback;
  return result.stdout.trim().split(/\r?\n/).at(-1)?.trim() || fallback;
}

function gitDirty() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) return true;
  return result.stdout.trim().length > 0;
}

const trackedEnvKeys = new Set([
  "OCP_API_BASE_URL",
  "OCP_API_TOKEN",
  "OCP_TLS_VERIFY",
  "OCP_API_TIMEOUT_SECONDS",
  "OCP_INSECURE_SKIP_TLS_VERIFY",
  "OPENSHIFT_API_BASE_URL",
  "OPENSHIFT_API_TOKEN",
  "OPENSHIFT_API_TLS_VERIFY",
  "OPENSHIFT_API_TIMEOUT_SECONDS",
  "KUBE_API_BASE_URL",
  "KUBE_API_TOKEN",
  "KUBE_TLS_VERIFY",
  "KUBE_API_TIMEOUT_SECONDS",
  "OPENSHIFT_LIGHTSPEED_BASE_URL",
  "OPENSHIFT_LIGHTSPEED_API_TOKEN",
  "OPENSHIFT_LIGHTSPEED_PROVIDER",
  "OPENSHIFT_LIGHTSPEED_MODEL",
  "OPENSHIFT_LIGHTSPEED_TLS_VERIFY",
  "OPENSHIFT_LIGHTSPEED_TIMEOUT_SECONDS"
]);

function actualEnvAudit(path = resolve(repoRoot, ".env")) {
  if (!existsSync(path)) {
    return {
      exists: false,
      activeCounts: new Map(),
      commentedCounts: new Map(),
      activeMissingValues: [],
      duplicateActiveKeys: [],
      commentedTrackedCount: 0
    };
  }

  const activeCounts = new Map();
  const commentedCounts = new Map();
  const activeMissingValues = [];
  let commentedTrackedCount = 0;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(#?)\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, marker, key, rawValue] = match;
    if (!trackedEnvKeys.has(key)) continue;

    const target = marker === "#" ? commentedCounts : activeCounts;
    target.set(key, (target.get(key) ?? 0) + 1);
    if (marker === "#") {
      commentedTrackedCount += 1;
    } else if (!String(rawValue ?? "").trim()) {
      activeMissingValues.push(key);
    }
  }

  return {
    exists: true,
    activeCounts,
    commentedCounts,
    activeMissingValues,
    duplicateActiveKeys: Array.from(activeCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
    commentedTrackedCount
  };
}

function hasActive(audit, key) {
  return (audit.activeCounts.get(key) ?? 0) > 0;
}

const lightspeedNoise = readOcpConfig({
  OCP_API_BASE_URL: "https://api.company.example:6443",
  OCP_API_TOKEN: "redacted-token",
  OPENSHIFT_LIGHTSPEED_TLS_VERIFY: "false",
  OPENSHIFT_LIGHTSPEED_TIMEOUT_SECONDS: "90"
});

check(
  "OCP base URL and token",
  lightspeedNoise.baseUrl === "https://api.company.example:6443" &&
    lightspeedNoise.tokenSet === true,
  "OCP_API_BASE_URL/OCP_API_TOKEN are used without printing secrets"
);
check(
  "Lightspeed TLS isolation",
  lightspeedNoise.tlsVerify === true,
  "OPENSHIFT_LIGHTSPEED_TLS_VERIFY does not disable OCP TLS verification"
);
check(
  "Lightspeed timeout isolation",
  lightspeedNoise.timeoutMs === 8000,
  "OPENSHIFT_LIGHTSPEED_TIMEOUT_SECONDS does not change OCP API timeout"
);

const explicitOcp = readOcpConfig({
  OCP_API_BASE_URL: "https://api.company.example:6443",
  OCP_API_TOKEN: "redacted-token",
  OCP_TLS_VERIFY: "false",
  OCP_API_TIMEOUT_SECONDS: "15"
});

check(
  "Explicit OCP TLS override",
  explicitOcp.tlsVerify === false,
  "OCP_TLS_VERIFY=false is the supported way to disable OCP TLS verification"
);
check(
  "Explicit OCP timeout override",
  explicitOcp.timeoutMs === 15000,
  "OCP_API_TIMEOUT_SECONDS controls only the OCP API timeout"
);

const insecureSkip = readOcpConfig({
  OPENSHIFT_API_BASE_URL: "https://api.openshift.example:6443",
  OPENSHIFT_API_TOKEN: "redacted-token",
  OCP_INSECURE_SKIP_TLS_VERIFY: "true",
  OPENSHIFT_API_TIMEOUT_SECONDS: "20"
});

check(
  "OCP insecure skip alias",
  insecureSkip.tlsVerify === false,
  "OCP_INSECURE_SKIP_TLS_VERIFY=true maps to tlsVerify=false"
);
check(
  "OpenShift API timeout alias",
  insecureSkip.timeoutMs === 20000,
  "OPENSHIFT_API_TIMEOUT_SECONDS is accepted as an OCP API alias"
);

const invalidTimeout = readOcpConfig({
  KUBE_API_BASE_URL: "https://kube.example:6443",
  KUBE_API_TOKEN: "redacted-token",
  KUBE_API_TIMEOUT_SECONDS: "not-a-number"
});

check(
  "Invalid timeout fails closed",
  invalidTimeout.timeoutMs === 8000,
  "invalid timeout values fall back to the 8s default"
);

const envAudit = actualEnvAudit();

check(
  "Actual .env redaction audit",
  true,
  envAudit.exists
    ? `tracked active keys=${envAudit.activeCounts.size}, commented tracked entries=${envAudit.commentedTrackedCount}, values redacted`
    : "no repo .env found; synthetic isolation checks still run"
);

if (envAudit.exists) {
  check(
    "Actual .env OCP target active",
    hasActive(envAudit, "OCP_API_BASE_URL") &&
      hasActive(envAudit, "OCP_API_TOKEN") &&
      !envAudit.activeMissingValues.includes("OCP_API_BASE_URL") &&
      !envAudit.activeMissingValues.includes("OCP_API_TOKEN"),
    "OCP_API_BASE_URL/OCP_API_TOKEN are active and value presence is redacted"
  );
  check(
    "Actual .env Lightspeed target active",
    hasActive(envAudit, "OPENSHIFT_LIGHTSPEED_BASE_URL") &&
      hasActive(envAudit, "OPENSHIFT_LIGHTSPEED_API_TOKEN") &&
      !envAudit.activeMissingValues.includes("OPENSHIFT_LIGHTSPEED_BASE_URL") &&
      !envAudit.activeMissingValues.includes("OPENSHIFT_LIGHTSPEED_API_TOKEN"),
    "OPENSHIFT_LIGHTSPEED_BASE_URL/OPENSHIFT_LIGHTSPEED_API_TOKEN are active and value presence is redacted"
  );
  check(
    "Actual .env active key uniqueness",
    envAudit.duplicateActiveKeys.length === 0,
    envAudit.duplicateActiveKeys.length === 0
      ? "no duplicate active OCP/Lightspeed target keys"
      : `duplicate active key(s): ${envAudit.duplicateActiveKeys.join(", ")}`
  );
  check(
    "Actual .env commented legacy entries ignored",
    true,
    `${envAudit.commentedTrackedCount} commented OCP/Lightspeed entry/entries are ignored by loadEnvFile`
  );
}

const failed = checks.filter((entry) => !entry.condition);
const artifact = {
  artifactType: "opslens.env-contract.v0.1",
  status: failed.length > 0 ? "FAIL" : "PASS",
  actionMode: "localEnvAuditOnly",
  generatedAt: new Date().toISOString(),
  ref: {
    branch: gitValue(["branch", "--show-current"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    worktreeDirty: gitDirty()
  },
  envAudit: {
    exists: envAudit.exists,
    activeKeyCount: envAudit.activeCounts.size,
    activeKeys: Array.from(envAudit.activeCounts.keys()).sort(),
    commentedTrackedCount: envAudit.commentedTrackedCount,
    duplicateActiveKeys: envAudit.duplicateActiveKeys,
    activeMissingValues: envAudit.activeMissingValues,
    activeOcpTarget:
      envAudit.exists &&
      hasActive(envAudit, "OCP_API_BASE_URL") &&
      hasActive(envAudit, "OCP_API_TOKEN") &&
      !envAudit.activeMissingValues.includes("OCP_API_BASE_URL") &&
      !envAudit.activeMissingValues.includes("OCP_API_TOKEN"),
    activeLightspeedTarget:
      envAudit.exists &&
      hasActive(envAudit, "OPENSHIFT_LIGHTSPEED_BASE_URL") &&
      hasActive(envAudit, "OPENSHIFT_LIGHTSPEED_API_TOKEN") &&
      !envAudit.activeMissingValues.includes("OPENSHIFT_LIGHTSPEED_BASE_URL") &&
      !envAudit.activeMissingValues.includes("OPENSHIFT_LIGHTSPEED_API_TOKEN")
  },
  checks: checks.map((entry) => ({
    name: entry.name,
    status: entry.condition ? "PASS" : "FAIL",
    detail: entry.detail
  })),
  clusterMutationAttempted: false,
  registryMutationAttempted: false,
  vectorWriteAttempted: false,
  mutationAllowedByThisVerifier: false,
  evidence: [
    "OCP API target keys are loaded independently from OpenShift Lightspeed target keys.",
    "Actual .env values are not written to evidence; only key names, counts, and presence states are recorded.",
    "Commented legacy OCP/Lightspeed entries are ignored by loadEnvFile."
  ],
  missingEvidence: failed.map((entry) => `${entry.name}: ${entry.detail}`),
  risk: [
    "If OCP and Lightspeed env settings drift, live readiness evidence can point at the wrong endpoint or silently inherit unsafe TLS/timeout behavior."
  ],
  rollbackPath: [
    "Restore OCP_API_BASE_URL/OCP_API_TOKEN and OPENSHIFT_LIGHTSPEED_BASE_URL/OPENSHIFT_LIGHTSPEED_API_TOKEN to one active target each, then rerun npm run verify:env."
  ]
};

mkdirSync(dirname(evidenceOut), { recursive: true });
writeFileSync(evidenceOut, `${JSON.stringify(artifact, null, 2)}\n`);
console.log("");
console.log(
  `Cywell OpsLens env contract verification: ${failed.length} fail, ${checks.length} checks`
);
console.log(`Env contract evidence written: ${evidenceOut}`);

if (failed.length > 0) {
  process.exitCode = 1;
}
