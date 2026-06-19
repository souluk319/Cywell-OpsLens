#!/usr/bin/env node
import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);
const evidenceOut = "test-results/cywell-opslens-ocp420-live-readiness.json";

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
const expectedMinor = parsed.values.get("expected-minor") ?? "4.20";
const strict = parsed.flags.has("require-cluster") || parsed.flags.has("strict");
const timeoutMs = Number(parsed.values.get("timeout-ms") ?? 15000);

const checks = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "<redacted-url>")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<redacted-ip>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
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

async function runOc(args, commandTimeoutMs = timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync("oc", args, {
      encoding: "utf8",
      timeout: commandTimeoutMs
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

async function loadConsoleParityModule() {
  const source = await readFile(resolve("apps/web/src/consoleParity.ts"), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false
    }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

function apiVersionFromResource(resource) {
  const parts = resource.split("/");
  if (parts.length < 2) return "";
  return parts.slice(0, -1).join("/");
}

function discoveryPath(apiVersion) {
  if (apiVersion === "v1") return "/api/v1";
  const [group, version] = apiVersion.split("/");
  if (!group || !version) return "";
  return `/apis/${group}/${version}`;
}

function versionMinor(version) {
  const match = String(version ?? "").match(/^(\d+\.\d+)/);
  return match?.[1] ?? "unknown";
}

function conditionStatus(resource, type) {
  return resource?.status?.conditions?.find((condition) => condition.type === type)?.status;
}

const parityModule = await loadConsoleParityModule();
const items = Array.isArray(parityModule.ocpConsoleParityItems)
  ? parityModule.ocpConsoleParityItems
  : [];

const requiredApiVersions = new Set();
for (const item of items) {
  for (const resource of item.resourcePreset?.preferredResources ?? []) {
    const apiVersion = apiVersionFromResource(resource);
    if (apiVersion) requiredApiVersions.add(apiVersion);
  }
}

const failures = [];
const warnings = [];
let connected = false;
let clusterVersion = "unknown";
let consoleAvailable = "unknown";
let consoleDegraded = "unknown";
let consolePluginCrdPresent = false;
const missingApiVersions = [];

function recordFailure(message) {
  failures.push(message);
}

function recordWarning(message) {
  warnings.push(message);
}

const whoami = await runOc(["whoami"], 8000);
if (whoami.ok) {
  connected = true;
  pass("oc login", "oc context is available; user value redacted");
} else {
  const detail = whoami.stderr || "oc is unavailable or not logged in";
  if (strict) {
    fail("oc login", detail);
    recordFailure("oc context is required for strict OCP 4.20 live readiness");
  } else {
    warn("oc login", `${detail}; preview mode continues without live cluster proof`);
    recordWarning("oc context unavailable in preview mode");
  }
}

if (connected) {
  const versionResult = await runOc(["get", "clusterversion", "version", "-o", "json"], 10000);
  if (versionResult.ok) {
    try {
      const parsedVersion = JSON.parse(versionResult.stdout);
      clusterVersion =
        parsedVersion?.status?.desired?.version ??
        parsedVersion?.status?.history?.[0]?.version ??
        "unknown";
      const minor = versionMinor(clusterVersion);
      if (minor === expectedMinor) {
        pass("cluster minor", `OpenShift ${clusterVersion} matches expected ${expectedMinor}`);
      } else if (strict) {
        fail("cluster minor", `OpenShift ${clusterVersion} does not match expected ${expectedMinor}`);
        recordFailure(`cluster minor ${minor} does not match expected ${expectedMinor}`);
      } else {
        warn("cluster minor", `OpenShift ${clusterVersion} does not match expected ${expectedMinor}`);
        recordWarning(`cluster minor ${minor} does not match expected ${expectedMinor}`);
      }
    } catch (error) {
      fail("cluster version parse", error instanceof Error ? error.message : String(error));
      recordFailure("clusterversion JSON could not be parsed");
    }
  } else {
    fail("cluster version", versionResult.stderr || "could not read clusterversion");
    recordFailure("clusterversion/version read failed");
  }

  const consoleResult = await runOc(["get", "co", "console", "-o", "json"], 10000);
  if (consoleResult.ok) {
    try {
      const consoleOperator = JSON.parse(consoleResult.stdout);
      consoleAvailable = conditionStatus(consoleOperator, "Available") ?? "unknown";
      consoleDegraded = conditionStatus(consoleOperator, "Degraded") ?? "unknown";
      if (consoleAvailable === "True" && consoleDegraded !== "True") {
        pass("console operator", `Available=${consoleAvailable} Degraded=${consoleDegraded}`);
      } else {
        const detail = `Available=${consoleAvailable} Degraded=${consoleDegraded}`;
        if (strict) {
          fail("console operator", detail);
          recordFailure("console operator is not healthy");
        } else {
          warn("console operator", detail);
          recordWarning("console operator is not healthy");
        }
      }
    } catch (error) {
      fail("console operator parse", error instanceof Error ? error.message : String(error));
      recordFailure("console operator JSON could not be parsed");
    }
  } else {
    fail("console operator", consoleResult.stderr || "could not read console clusteroperator");
    recordFailure("console clusteroperator read failed");
  }

  const consolePluginCrd = await runOc(
    ["get", "crd", "consoleplugins.console.openshift.io", "-o", "name"],
    10000
  );
  consolePluginCrdPresent = consolePluginCrd.ok;
  if (consolePluginCrdPresent) {
    pass("ConsolePlugin CRD", "consoleplugins.console.openshift.io is present");
  } else if (strict) {
    fail("ConsolePlugin CRD", consolePluginCrd.stderr || "ConsolePlugin CRD is missing");
    recordFailure("ConsolePlugin CRD missing");
  } else {
    warn("ConsolePlugin CRD", consolePluginCrd.stderr || "ConsolePlugin CRD is missing");
    recordWarning("ConsolePlugin CRD missing");
  }

  for (const apiVersion of [...requiredApiVersions].sort()) {
    const path = discoveryPath(apiVersion);
    if (!path) {
      missingApiVersions.push(apiVersion);
      continue;
    }
    const result = await runOc(["get", "--raw", path], 10000);
    if (!result.ok) {
      missingApiVersions.push(apiVersion);
    }
  }

  if (missingApiVersions.length === 0) {
    pass(
      "required API discovery",
      `${requiredApiVersions.size} parity API versions are discoverable`
    );
  } else if (strict) {
    fail(
      "required API discovery",
      `${missingApiVersions.length} API versions missing: ${missingApiVersions.join(", ")}`
    );
    recordFailure("one or more parity API versions are not discoverable");
  } else {
    warn(
      "required API discovery",
      `${missingApiVersions.length} API versions missing: ${missingApiVersions.join(", ")}`
    );
    recordWarning("one or more parity API versions are not discoverable");
  }
}

const status = failures.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
const evidence = {
  artifactType: "cywell-opslens-ocp420-live-readiness",
  generatedAt: new Date().toISOString(),
  status,
  strict,
  expectedMinor,
  connected,
  clusterVersion,
  consoleAvailable,
  consoleDegraded,
  consolePluginCrdPresent,
  totalConsoleItems: items.length,
  requiredApiVersions: [...requiredApiVersions].sort(),
  missingApiVersions,
  checks,
  warnings,
  failures
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(
  `Cywell OpsLens OCP 4.20 live readiness: ${status} (strict=${strict}, expected=${expectedMinor})`
);
console.log(`${evidenceOut} written`);

if (failures.length > 0) {
  process.exit(1);
}
