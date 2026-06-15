#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-runtime-readiness.json",
  appManifest: "deploy/operator/config/apps/opslens-stack.yaml",
  apiSource: "apps/api/src/api.ts",
  serverSource: "apps/api/src/server.ts",
  contractSource: "packages/contracts/src/types.ts",
  timeoutMs: 3000
};

function parseArgs(argv) {
  const flags = new Set();
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
    } else {
      flags.add(key);
    }
  }
  return { flags, values };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  appManifest: parsed.values.get("app-manifest") ?? defaults.appManifest,
  apiSource: parsed.values.get("api-source") ?? defaults.apiSource,
  serverSource: parsed.values.get("server-source") ?? defaults.serverSource,
  contractSource: parsed.values.get("contract-source") ?? defaults.contractSource,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? process.env.CYWELL_OPSLENS_RUNTIME_PROBE_TIMEOUT_MS ?? defaults.timeoutMs),
  live: parsed.flags.has("live") || process.env.CYWELL_OPSLENS_RUNTIME_PROBE_LIVE === "true",
  vectorUrl: parsed.values.get("vector-url") ?? process.env.CYWELL_OPSLENS_VECTOR_URL ?? "http://cywell-opslens-vector:6333",
  modelUrl: parsed.values.get("model-url") ?? process.env.CYWELL_OPSLENS_MODEL_URL ?? "http://cywell-opslens-vllm:8000",
  vectorPath: parsed.values.get("vector-path") ?? process.env.CYWELL_OPSLENS_VECTOR_HEALTH_PATH ?? "/healthz",
  modelPath: parsed.values.get("model-path") ?? process.env.CYWELL_OPSLENS_MODEL_HEALTH_PATH ?? "/v1/models"
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value)
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

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) pass(name, detail);
  else fail(name, failureDetail);
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10000
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
  return result.stdout.split(/\r?\n/);
}

function readText(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail("source file", `${path} is missing`);
    return "";
  }
  pass("source file", `${path} exists`);
  return readFileSync(absolutePath, "utf8");
}

function parseYamlObjects(path) {
  const text = readText(path);
  if (!text) return [];
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${path}: ${errors.map((error) => error.message).join("; ")}`);
    return [];
  }
  const objects = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  pass("valid YAML", `${path} contains ${objects.length} object(s)`);
  return objects;
}

function findObject(objects, kind, name) {
  return objects.find(
    (object) => object?.kind === kind && object?.metadata?.name === name
  );
}

function containerEnv(deployment, containerName) {
  const containers = deployment?.spec?.template?.spec?.containers ?? [];
  const container = containers.find((item) => item.name === containerName);
  return new Map((container?.env ?? []).map((item) => [item.name, item.value]));
}

function normalizePath(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

function joinEndpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${normalizePath(path)}`;
}

function redactRuntimeUrl(value) {
  try {
    const url = new URL(value);
    const privateIp = /\b10(?:\.\d{1,3}){3}\b/.test(url.hostname) ||
      /\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/.test(url.hostname) ||
      /\b192\.168(?:\.\d{1,3}){2}\b/.test(url.hostname);
    const host = privateIp ? "<redacted-private-ip>" : url.hostname;
    const port = url.port ? `:${url.port}` : "";
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.protocol}//${host}${port}${path}`;
  } catch {
    return sanitize(value);
  }
}

function classifyProbeError(error) {
  const code = String(error?.cause?.code ?? error?.code ?? "").toUpperCase();
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (name === "AbortError" || code === "ABORT_ERR" || message.includes("abort")) {
    return "timeout";
  }
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code) || message.includes("getaddrinfo")) {
    return "dns-unresolved";
  }
  if (code === "ECONNREFUSED" || message.includes("econnrefused")) {
    return "tcp-refused";
  }
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code) || message.includes("timed out")) {
    return "tcp-timeout";
  }
  if (["EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    return "network-unreachable";
  }
  if (message.includes("certificate") || message.includes("tls") || message.includes("self-signed")) {
    return "tls-failed";
  }
  return "runtime-unreachable";
}

function classifyHttpStatus(statusCode) {
  if (statusCode === 401 || statusCode === 403) return "runtime-auth-required";
  if (statusCode >= 500) return "runtime-service-unhealthy";
  if (statusCode >= 400) return "runtime-endpoint-not-ready";
  return "runtime-http-unexpected";
}

function probeAction(name, classification) {
  const runtimeName = name === "qdrant" ? "Qdrant" : "vLLM";
  const endpointEnv =
    name === "qdrant"
      ? "CYWELL_OPSLENS_VECTOR_URL"
      : "CYWELL_OPSLENS_MODEL_URL";
  const command = "npm run verify:runtime -- --live --timeout-ms 30000";
  const byClassification = {
    "dns-unresolved": {
      owner: "runtime-platform",
      summary: `Set ${endpointEnv} to an approved reachable ${runtimeName} endpoint or run the verifier from a network context that can resolve the in-cluster service.`,
      nextCommand: command
    },
    "tcp-refused": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint resolved, but the TCP port refused the read-only health probe.`,
      nextCommand: command
    },
    "tcp-timeout": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint did not answer before the bounded timeout; check service, route, NetworkPolicy, or port-forward state.`,
      nextCommand: command
    },
    "network-unreachable": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint is not reachable from this execution environment.`,
      nextCommand: command
    },
    "tls-failed": {
      owner: "runtime-platform",
      summary: `${runtimeName} TLS validation failed; confirm the approved runtime endpoint and trust bundle before treating live evidence as valid.`,
      nextCommand: command
    },
    "runtime-auth-required": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint requires authentication or authorization evidence before live readiness can pass.`,
      nextCommand: command
    },
    "runtime-service-unhealthy": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint is reachable but reports a server-side error.`,
      nextCommand: command
    },
    "runtime-endpoint-not-ready": {
      owner: "runtime-platform",
      summary: `${runtimeName} endpoint is reachable but the configured health path is not ready.`,
      nextCommand: command
    },
    "runtime-unreachable": {
      owner: "runtime-platform",
      summary: `${runtimeName} live probe failed before a useful HTTP response was available.`,
      nextCommand: command
    }
  };
  return byClassification[classification] ?? byClassification["runtime-unreachable"];
}

async function probe(name, url, path) {
  const redactedUrl = redactRuntimeUrl(url);
  if (!options.live) {
    warn(`${name} live probe`, "skipped because --live was not provided");
    return {
      name,
      status: "needs-live-check",
      classification: "not-requested",
      liveProbeEnabled: false,
      url: redactedUrl,
      path,
      owner: "runtime-platform",
      nextCommand: "npm run verify:runtime -- --live --timeout-ms 30000",
      missingEvidence: [`${name} live probe was not requested`]
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(joinEndpoint(url, path), {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json,text/plain,*/*" }
    });
    const latencyMs = Math.max(1, Date.now() - started);
    if (response.ok) {
      pass(`${name} live probe`, `httpStatus=${response.status} latencyMs=${latencyMs}`);
      return {
        name,
        status: "ready",
        classification: "ready",
        liveProbeEnabled: true,
        url: redactedUrl,
        path,
        latencyMs,
        httpStatus: response.status,
        owner: "runtime-platform",
        nextCommand: "none",
        missingEvidence: []
      };
    }
    const classification = classifyHttpStatus(response.status);
    const action = probeAction(name, classification);
    warn(`${name} live probe`, `httpStatus=${response.status} classification=${classification} latencyMs=${latencyMs}`);
    return {
      name,
      status: "degraded",
      classification,
      liveProbeEnabled: true,
      url: redactedUrl,
      path,
      latencyMs,
      httpStatus: response.status,
      owner: action.owner,
      nextCommand: action.nextCommand,
      actionSummary: action.summary,
      missingEvidence: [`${name} live probe classification=${classification}; httpStatus=${response.status}; ${action.summary}`]
    };
  } catch (error) {
    const classification = classifyProbeError(error);
    const action = probeAction(name, classification);
    fail(`${name} live probe`, `classification=${classification}; ${error instanceof Error ? error.message : String(error)}`);
    return {
      name,
      status: "failed",
      classification,
      liveProbeEnabled: true,
      url: redactedUrl,
      path,
      latencyMs: Math.max(1, Date.now() - started),
      owner: action.owner,
      nextCommand: action.nextCommand,
      actionSummary: action.summary,
      missingEvidence: [`${name} live probe classification=${classification}; ${action.summary}`]
    };
  } finally {
    clearTimeout(timeout);
  }
}

function runtimeStatus(probes) {
  const statuses = probes.map((item) => item.status);
  if (statuses.includes("failed")) return "FAIL";
  if (statuses.includes("degraded")) return "WARN";
  if (statuses.includes("needs-live-check")) return "NEEDS_LIVE_EVIDENCE";
  return "PASS";
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  const apiSource = readText(options.apiSource);
  const serverSource = readText(options.serverSource);
  const contractSource = readText(options.contractSource);
  const appObjects = parseYamlObjects(options.appManifest);
  const apiDeployment = findObject(appObjects, "Deployment", "cywell-opslens-api");
  const vectorStatefulSet = findObject(appObjects, "StatefulSet", "cywell-opslens-vector");
  const vectorService = findObject(appObjects, "Service", "cywell-opslens-vector");
  const modelDeployment = findObject(appObjects, "Deployment", "cywell-opslens-vllm");
  const modelService = findObject(appObjects, "Service", "cywell-opslens-vllm");
  const env = containerEnv(apiDeployment, "api");

  expectCheck("runtime contract type", contractSource.includes("OpsLensRuntimeReadiness"), "contracts expose OpsLensRuntimeReadiness");
  expectCheck("runtime dependency type", contractSource.includes("OpsLensRuntimeDependencyReadiness"), "contracts expose runtime dependency readiness");
  expectCheck("API readiness function", apiSource.includes("getOpsLensRuntimeReadiness"), "API exports getOpsLensRuntimeReadiness");
  expectCheck("API live probe default", apiSource.includes("CYWELL_OPSLENS_RUNTIME_PROBE_LIVE"), "runtime live probe is explicitly gated by env");
  expectCheck("API mutation boundary", apiSource.includes("mutationAllowed: false") && apiSource.includes("rawDocumentReturned: false"), "runtime readiness remains read-only and returns no raw documents");
  expectCheck("server route", serverSource.includes("/api/opslens/runtime/readiness"), "server exposes /api/opslens/runtime/readiness");
  expectCheck("API vector env", env.get("CYWELL_OPSLENS_VECTOR_URL") === "http://cywell-opslens-vector:6333", "API deployment points to Qdrant service");
  expectCheck("API model env", env.get("CYWELL_OPSLENS_MODEL_URL") === "http://cywell-opslens-vllm:8000", "API deployment points to vLLM service");
  expectCheck("Qdrant workload", Boolean(vectorStatefulSet), "Qdrant StatefulSet is present");
  expectCheck("Qdrant service", Boolean(vectorService), "Qdrant Service is present");
  expectCheck("vLLM workload", Boolean(modelDeployment), "vLLM Deployment is present");
  expectCheck("vLLM service", Boolean(modelService), "vLLM Service is present");

  const probes = [
    await probe("qdrant", options.vectorUrl, options.vectorPath),
    await probe("vllm", options.modelUrl, options.modelPath)
  ];
  const status = runtimeStatus(probes);
  const missingEvidence = probes.flatMap((item) => item.missingEvidence);

  const artifact = {
    schema: "cywell.opslens.runtime-readiness.v0.1",
    artifactType: "opslens.runtime-readiness.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnly",
    mutationAllowed: false,
    rawDocumentReturned: false,
    liveProbeEnabled: options.live,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: ["AC-LS-001", "AC-RAG-001", "AC-DASH-001", "AC-OP-001"],
    runtime: {
      vectorStore: probes[0],
      modelRuntime: probes[1]
    },
    evidence: [
      "API exposes a read-only runtime readiness endpoint",
      "Operator app manifest wires API to Qdrant and vLLM service DNS names",
      "Live runtime probing is opt-in and does not mutate cluster or registry state"
    ],
    missingEvidence,
    risk: [
      "NEEDS_LIVE_EVIDENCE means runtime endpoint shape is wired but Qdrant/vLLM reachability has not been proven.",
      "Ready probes do not replace model quality evaluation or external runtime certification evidence.",
      "Runtime readiness does not allow apply/delete/scale, image push, signing, or mirroring."
    ],
    rollbackPath: [
      "Disable live probes with CYWELL_OPSLENS_RUNTIME_PROBE_LIVE=false.",
      "Restore previous OpsLensInstallation runtime image references if a new Qdrant/vLLM image fails readiness.",
      "Regenerate runtime, image, release, install, and checkpoint evidence from the same Git HEAD after runtime changes."
    ],
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  pass("runtime readiness evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens runtime readiness: status=${status}, ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("runtime readiness verifier", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] runtime readiness verifier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
