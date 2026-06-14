#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-operator-dry-run.json",
  timeoutMs: 15000,
  manifests: [
    "deploy/operator/config/crd/opslens.cywell.io_opslensinstallations.yaml",
    "deploy/operator/config/rbac/service_account.yaml",
    "deploy/operator/config/rbac/cluster_role.yaml",
    "deploy/operator/config/rbac/cluster_role_binding.yaml",
    "deploy/operator/config/manager/manager.yaml",
    "deploy/operator/config/apps/opslens-stack.yaml"
  ]
};

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  const manifests = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith("--") ? next : undefined);
    if (value !== undefined && inlineValue === undefined) {
      index += 1;
    }

    if (rawKey === "manifest" && value) {
      manifests.push(value);
    } else if (value !== undefined) {
      values.set(rawKey, value);
    } else {
      flags.add(rawKey);
    }
  }

  return { flags, values, manifests };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  manifests: parsed.manifests.length > 0 ? parsed.manifests : defaults.manifests,
  strict: parsed.flags.has("strict")
};

const checks = [];
const startedAt = new Date().toISOString();
let loadedEnv = false;
let tempDir;

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail, ...extra });
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

function findEnvFile(start = process.cwd()) {
  let current = resolve(start);
  const root = parse(current).root;

  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return undefined;
    }
    current = dirname(current);
  }
}

function loadEnvFile(path = findEnvFile()) {
  if (loadedEnv || !path || !existsSync(path)) {
    loadedEnv = true;
    return;
  }

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");
    if (index < 0) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  loadedEnv = true;
}

function firstEnv(...keys) {
  loadEnvFile();
  for (const key of keys) {
    if (process.env[key] !== undefined) {
      return process.env[key];
    }
  }
  return undefined;
}

function boolFromEnv(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function ocpTlsVerifyFromEnv() {
  const explicitVerify = firstEnv("OCP_TLS_VERIFY", "OPENSHIFT_API_TLS_VERIFY", "KUBE_TLS_VERIFY");
  if (explicitVerify !== undefined) {
    return boolFromEnv(explicitVerify, true);
  }

  const insecureSkip = firstEnv(
    "OCP_INSECURE_SKIP_TLS_VERIFY",
    "OPENSHIFT_API_INSECURE_SKIP_TLS_VERIFY",
    "KUBE_INSECURE_SKIP_TLS_VERIFY"
  );
  if (insecureSkip !== undefined) {
    return !boolFromEnv(insecureSkip, false);
  }

  return true;
}

function ocpConfig() {
  return {
    baseUrl: firstEnv("OCP_API_BASE_URL", "OPENSHIFT_API_BASE_URL", "KUBE_API_BASE_URL"),
    token: firstEnv("OCP_API_TOKEN", "OPENSHIFT_API_TOKEN", "KUBE_API_TOKEN"),
    tlsVerify: ocpTlsVerifyFromEnv()
  };
}

function ocBaseArgs() {
  const config = ocpConfig();
  const args = [];
  if (config.baseUrl && config.token) {
    args.push("--server", config.baseUrl, "--token", config.token);
    if (!config.tlsVerify) {
      args.push("--insecure-skip-tls-verify=true");
    }
  }
  args.push(`--request-timeout=${Math.ceil(options.timeoutMs / 1000)}s`);
  return args;
}

function ocEvidence() {
  const config = ocpConfig();
  let host;
  if (config.baseUrl) {
    try {
      host = new URL(config.baseUrl).host;
    } catch {
      host = "invalid-url";
    }
  }
  return {
    authSource: config.baseUrl && config.token ? "env" : "oc-context",
    configured: Boolean(config.baseUrl && config.token),
    host: sanitize(host),
    tlsVerify: config.tlsVerify
  };
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "CYWELL_OPSLENS_API_KEY",
    "CYWELL_OPSLENS_BEARER_TOKEN",
    "OPENSHIFT_LIGHTSPEED_TOKEN"
  ]
    .map((key) => firstEnv(key))
    .filter((value) => value && value.length >= 8);
}

function sensitiveEndpointValues() {
  const config = ocpConfig();
  const values = [];
  if (config.baseUrl) {
    values.push(config.baseUrl);
    try {
      const url = new URL(config.baseUrl);
      values.push(url.host, url.hostname);
    } catch {
      // Keep the raw configured value above if URL parsing fails.
    }
  }
  return Array.from(new Set(values.filter((value) => value && value.length >= 4)));
}

function redactEndpointText(text) {
  let result = text;
  for (const endpoint of sensitiveEndpointValues()) {
    result = result.split(endpoint).join("<redacted-ocp-api>");
  }
  return result
    .replace(
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
      "<redacted-private-ip>"
    )
    .replace(/\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-api>");
}

function endpointLeakLike(text) {
  return (
    /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/.test(text) ||
    /\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/i.test(text)
  );
}

function sanitize(text) {
  let result = String(text ?? "");
  for (const secret of secretValuesForLeakCheck()) {
    result = result.split(secret).join("<redacted>");
  }
  return redactEndpointText(result);
}

async function runOc(args) {
  try {
    const { stdout, stderr } = await execFileAsync("oc", [...ocBaseArgs(), ...args], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
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
      stderr: sanitize(error.stderr?.trim?.() ?? error.message),
      message: sanitize(error.message),
      code: error.code,
      signal: error.signal
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args);
  if (!result.ok || !result.stdout) {
    return fallback;
  }
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim?.() ?? "",
      stderr: error.stderr?.trim?.() ?? error.message
    };
  }
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"]);
  if (!result.ok || !result.stdout) {
    return [];
  }
  return result.stdout.split(/\r?\n/);
}

function label(object) {
  return `${object?.kind ?? "unknown"}/${object?.metadata?.name ?? "unknown"}`;
}

function objectNamespace(object) {
  if (object?.kind === "Namespace") {
    return undefined;
  }
  return object?.metadata?.namespace;
}

async function loadManifest(relativePath) {
  const absolutePath = resolve(relativePath);
  const text = await readFile(absolutePath, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${relativePath}: ${errors.map((error) => error.message).join("; ")}`);
  }

  const objects = documents
    .map((document) => document.toJSON())
    .filter((object) => object && typeof object === "object");
  return {
    path: relativePath,
    absolutePath,
    objects
  };
}

async function loadManifests() {
  const manifests = [];
  for (const manifestPath of options.manifests) {
    try {
      const manifest = await loadManifest(manifestPath);
      pass("local manifest parse", `${manifest.path} contains ${manifest.objects.length} object(s)`);
      manifests.push(manifest);
    } catch (error) {
      fail("local manifest parse", error instanceof Error ? error.message : String(error));
    }
  }
  return manifests;
}

async function ensureTempDir() {
  if (!tempDir) {
    tempDir = resolve(tmpdir(), `cywell-opslens-dry-run-${process.pid}-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

async function writeObjectTempFile(object, index) {
  const directory = await ensureTempDir();
  const fileName = `${String(index).padStart(3, "0")}-${object.kind}-${object.metadata?.name}.json`
    .replace(/[^a-zA-Z0-9_.-]/g, "-");
  const filePath = join(directory, fileName);
  await writeFile(filePath, `${JSON.stringify(object, null, 2)}\n`);
  return filePath;
}

const namespaceCache = new Map();

async function namespaceExists(namespace) {
  if (namespaceCache.has(namespace)) {
    return namespaceCache.get(namespace);
  }

  const result = await runOc(["get", "namespace", namespace, "-o", "name"]);
  const exists = result.ok;
  namespaceCache.set(namespace, exists);
  if (exists) {
    pass("namespace preflight", `${namespace} exists for namespaced server dry-run`);
  } else {
    warn("namespace preflight", `${namespace} does not exist; namespaced server dry-run will be skipped until install creates it`);
  }
  return exists;
}

async function checkOcConnection() {
  const version = await runOc(["version", "--client"]);
  if (version.ok) {
    pass("oc client", version.stdout.split(/\r?\n/)[0] || "oc client available");
  } else {
    const detail = `oc client unavailable: ${version.stderr || version.message}`;
    if (options.strict) {
      fail("oc client", detail);
    } else {
      warn("oc client", detail);
    }
    return false;
  }

  const server = await runOc(["get", "--raw=/version"]);
  if (server.ok) {
    let detail = ocEvidence().host ?? "configured OCP API";
    try {
      const version = JSON.parse(server.stdout);
      detail = `${detail} kubernetes=${version.gitVersion ?? "unknown"}`;
    } catch {
      // Keep host-only evidence if /version output is not JSON.
    }
    pass("oc server", `connected to ${detail}`);
    return true;
  }

  const detail = `oc server/auth unavailable: ${server.stderr || server.message}`;
  if (options.strict) {
    fail("oc server", detail);
  } else {
    warn("oc server", detail);
  }
  return false;
}

async function dryRunObject(object, sourcePath, index) {
  const namespace = objectNamespace(object);
  if (namespace && !(await namespaceExists(namespace))) {
    return {
      status: "SKIPPED",
      reason: "missing-namespace",
      label: label(object),
      namespace,
      sourcePath
    };
  }

  const filePath = await writeObjectTempFile(object, index);
  const result = await runOc(["apply", "--dry-run=server", "--validate=true", "-f", filePath, "-o", "name"]);
  const output = [
    result.stdout ? `stdout: ${result.stdout}` : "",
    result.stderr ? `stderr: ${result.stderr}` : "",
    result.message ? `message: ${result.message}` : "",
    result.code !== undefined ? `code: ${result.code}` : "",
    result.signal ? `signal: ${result.signal}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  if (result.ok) {
    pass("server dry-run", `${label(object)} accepted by the live API`, {
      resource: label(object),
      namespace,
      sourcePath
    });
    return {
      status: "PASS",
      label: label(object),
      namespace,
      sourcePath,
      output
    };
  }

  fail("server dry-run", `${label(object)} rejected: ${output}`, {
    resource: label(object),
    namespace,
    sourcePath
  });
  return {
    status: "FAIL",
    label: label(object),
    namespace,
    sourcePath,
    output
  };
}

async function dryRunManifests(manifests, connected) {
  if (!connected) {
    warn("server dry-run", "skipped because live oc connection is unavailable");
    return [];
  }

  const results = [];
  let index = 0;
  for (const manifest of manifests) {
    for (const object of manifest.objects) {
      index += 1;
      results.push(await dryRunObject(object, manifest.path, index));
    }
  }

  const skipped = results.filter((result) => result.status === "SKIPPED");
  if (skipped.length > 0) {
    warn(
      "server dry-run coverage",
      `${skipped.length} namespaced object(s) skipped because their namespace does not exist yet`
    );
  } else {
    pass("server dry-run coverage", "all local objects were submitted to server-side dry-run");
  }
  return results;
}

function statusFromChecks() {
  if (checks.some((check) => check.status === "FAIL")) {
    return "FAIL";
  }
  if (checks.some((check) => check.status === "WARN")) {
    return "WARN";
  }
  return "PASS";
}

async function buildEvidence(results) {
  const worktreeStatus = await gitStatusShort();
  return {
    schema: "cywell.opslens.operator-dry-run.v0.1",
    artifactType: "opslens.operator.server-dry-run.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: statusFromChecks(),
    strict: options.strict,
    acceptance: ["AC-OP-001", "AC-OP-002", "AC-OP-004"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: await gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
      baseRef: await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    ocp: ocEvidence(),
    policy: {
      mutationAllowed: false,
      clusterMutationAttempted: false,
      command: "oc apply --dry-run=server --validate=true",
      secretValuesPrinted: false
    },
    manifests: options.manifests.map((manifest) => resolve(manifest)),
    results,
    checks,
    missingEvidence: checks
      .filter((check) => check.status !== "PASS")
      .map((check) => `${check.name}: ${check.detail}`),
    risks: [
      "Server-side dry-run validates API/admission shape but does not prove pods start or images pull.",
      "Namespaced resources cannot be fully dry-run if the target namespace does not exist yet.",
      "Actual OLM install, upgrade, rollback, and uninstall smoke tests remain separate mutating gates."
    ],
    rollbackPath: [
      "No rollback is required because this verifier uses server-side dry-run only.",
      "If a future install mutates the cluster, remove the Operator subscription/CSV resources and restore the previous OLSConfig before retrying."
    ]
  };
}

async function writeEvidence(results) {
  const reportPath = resolve(options.evidenceOut);
  const report = await buildEvidence(results);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const leakedSecret = secretValuesForLeakCheck().some((secret) => serialized.includes(secret));
  if (leakedSecret) {
    throw new Error("dry-run evidence would include a configured secret value");
  }
  if (endpointLeakLike(serialized)) {
    throw new Error("dry-run evidence would include an unredacted OCP endpoint");
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized);
  pass("dry-run evidence export", `${reportPath} written without secret material`);
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    WARN: 1,
    PASS: 2
  };

  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens Operator server dry-run: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

let dryRunResults = [];
try {
  const manifests = await loadManifests();
  const connected = await checkOcConnection();
  dryRunResults = await dryRunManifests(manifests, connected);
} catch (error) {
  fail("operator dry-run verifier", error instanceof Error ? error.message : String(error));
} finally {
  try {
    await writeEvidence(dryRunResults);
  } catch (error) {
    fail("dry-run evidence export", error instanceof Error ? error.message : String(error));
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
  printSummary();
}
