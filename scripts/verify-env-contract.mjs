#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(".");
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

const failed = checks.filter((entry) => !entry.condition);
console.log("");
console.log(
  `Cywell OpsLens env contract verification: ${failed.length} fail, ${checks.length} checks`
);

if (failed.length > 0) {
  process.exitCode = 1;
}
