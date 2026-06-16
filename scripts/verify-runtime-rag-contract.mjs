#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-runtime-rag-contract.json",
  apiSource: "apps/api/src/api.ts",
  runtimeRagSource: "apps/api/src/runtimeRag.ts",
  appManifest: "deploy/operator/config/apps/opslens-stack.yaml",
  serverSource: "apps/api/src/server.ts",
  incidentsSource: "apps/api/src/incidents.ts",
  contractSource: "packages/contracts/src/types.ts",
  e2eSource: "tests/e2e/mvp-0.1.spec.ts",
  acceptanceSource: "docs/acceptance/mvp-0.1.md",
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
  apiSource: parsed.get("api-source") ?? defaults.apiSource,
  runtimeRagSource: parsed.get("runtime-rag-source") ?? defaults.runtimeRagSource,
  appManifest: parsed.get("app-manifest") ?? defaults.appManifest,
  serverSource: parsed.get("server-source") ?? defaults.serverSource,
  incidentsSource: parsed.get("incidents-source") ?? defaults.incidentsSource,
  contractSource: parsed.get("contract-source") ?? defaults.contractSource,
  e2eSource: parsed.get("e2e-source") ?? defaults.e2eSource,
  acceptanceSource: parsed.get("acceptance-source") ?? defaults.acceptanceSource,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
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
      timeout: options.timeoutMs
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

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  const runtimeRagSource = readText(options.runtimeRagSource);
  const appManifest = readText(options.appManifest);
  const apiSource = readText(options.apiSource);
  const serverSource = readText(options.serverSource);
  const incidentsSource = readText(options.incidentsSource);
  const contractSource = readText(options.contractSource);
  const e2eSource = readText(options.e2eSource);
  const acceptanceSource = readText(options.acceptanceSource);

  expectCheck(
    "runtime RAG audit contract",
    contractSource.includes("OpsLensRuntimeRagAudit") &&
      contractSource.includes("runtimeRag: OpsLensRuntimeRagAudit"),
    "OpsLensToolResponse audit includes runtimeRag contract"
  );
  expectCheck(
    "runtime RAG modes",
    contractSource.includes('"local" | "hybrid" | "runtime"'),
    "runtime RAG mode contract includes local, hybrid, and runtime"
  );
  expectCheck(
    "runtime RAG adapter",
    runtimeRagSource.includes("retrieveRuntimeRagCitations"),
    "API has a dedicated runtime RAG adapter"
  );
  expectCheck(
    "safe default mode",
    runtimeRagSource.includes("CYWELL_OPSLENS_RAG_RUNTIME_MODE") &&
      runtimeRagSource.includes('return "local"') &&
      runtimeRagSource.includes('mode === "local"'),
    "runtime RAG defaults to local mode and short-circuits live retrieval"
  );
  expectCheck(
    "operator runtime mode default",
    appManifest.includes("CYWELL_OPSLENS_RAG_RUNTIME_MODE") &&
      appManifest.includes("value: local"),
    "Operator API deployment pins runtime RAG mode to local by default"
  );
  expectCheck(
    "vLLM embedding route",
    runtimeRagSource.includes("/v1/embeddings") &&
      runtimeRagSource.includes("CYWELL_OPSLENS_EMBEDDING_MODEL"),
    "adapter can request vLLM embeddings when runtime mode is enabled"
  );
  expectCheck(
    "Postgres pgvector search route",
    runtimeRagSource.includes("CYWELL_OPSLENS_POSTGRES_URL") &&
      runtimeRagSource.includes("embedding <=>") &&
      runtimeRagSource.includes("redacted = true"),
    "adapter can search Postgres/pgvector with redacted snippet rows when runtime mode is enabled"
  );
  expectCheck(
    "snippet-only payload",
    runtimeRagSource.includes("redactedSnippet") &&
      runtimeRagSource.includes("chunkSnippet") &&
      runtimeRagSource.includes("rawDocumentReturned") === false,
    "adapter maps only redacted snippet fields and does not claim raw document return"
  );
  expectCheck(
    "API answer path awaits runtime adapter",
    apiSource.includes("export async function createOpsLensToolResponse") &&
      apiSource.includes("await retrieveRuntimeRagCitations") &&
      apiSource.includes("runtimeRag: runtimeRagAudit"),
    "/api/opslens/ask response path includes runtime RAG audit"
  );
  expectCheck(
    "MCP path awaits async tool response",
    apiSource.includes("export async function handleOpsLensMcpRequest") &&
      apiSource.includes("await createOpsLensToolResponse"),
    "MCP tools/call path awaits the async runtime-aware tool response"
  );
  expectCheck(
    "server awaits async paths",
    serverSource.includes("await createOpsLensToolResponse") &&
      serverSource.includes("await handleOpsLensMcpRequest"),
    "HTTP server awaits /ask and /mcp runtime-aware handlers"
  );
  expectCheck(
    "incident analysis shares answer path",
    incidentsSource.includes("await createOpsLensToolResponse"),
    "incident analysis uses the same runtime-aware response contract"
  );
  expectCheck(
    "local fallback evidence",
    apiSource.includes("runtime RAG status=") &&
      runtimeRagSource.includes("local RAG fallback was used"),
    "runtime failure or no-hit state is visible in evidence and missingEvidence"
  );
  expectCheck(
    "mutation boundary",
    apiSource.includes("mutationAllowed: false") &&
      runtimeRagSource.includes("apply_remediation") === false,
    "runtime RAG path does not expose mutating tools"
  );
  expectCheck(
    "acceptance coverage",
    acceptanceSource.includes("runtime RAG adapter") &&
      acceptanceSource.includes("local fallback"),
    "acceptance criteria mention runtime RAG adapter and local fallback"
  );
  expectCheck(
    "e2e coverage",
    e2eSource.includes("runtimeRag") &&
      e2eSource.includes("live Postgres/pgvector and vLLM retrieval was not requested"),
    "AC-LS-001 e2e asserts default runtime RAG fallback contract"
  );

  warn(
    "live runtime retrieval evidence",
    "static contract is present; live vLLM embedding plus Postgres/pgvector search still requires reachable runtime endpoints"
  );

  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  const status = failures.length > 0 ? "FAIL" : "NEEDS_LIVE_EVIDENCE";
  const artifact = {
    schema: "cywell.opslens.runtime-rag-contract.v0.1",
    artifactType: "opslens.runtime-rag-contract.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnly",
    mutationAllowed: false,
    rawDocumentReturned: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: ["AC-LS-001", "AC-RAG-001", "AC-AIOPS-001"],
    runtimeRag: {
      defaultMode: "local",
      optInModes: ["hybrid", "runtime"],
      vectorStore: "pgvector",
      modelRuntime: "vllm",
      collectionPrefixEnv: "CYWELL_OPSLENS_PGVECTOR_TABLE_PREFIX",
      embeddingModelEnv: "CYWELL_OPSLENS_EMBEDDING_MODEL"
    },
    evidence: [
      "OpsLens answer path now carries runtimeRag audit data",
      "Default local mode avoids accidental live runtime network calls",
      "Operator API deployment explicitly pins CYWELL_OPSLENS_RAG_RUNTIME_MODE=local",
      "Hybrid/runtime modes attempt vLLM embeddings and Postgres/pgvector snippet retrieval before local fallback"
    ],
    missingEvidence: [
      "live vLLM /v1/embeddings response against approved runtime image",
      "live Postgres/pgvector read-only SELECT response with tenant-scoped redacted snippets",
      "quality evaluation that citation snippets support the generated plan"
    ],
    risk: [
      "NEEDS_LIVE_EVIDENCE means the code path and contract exist, but deployed Postgres/pgvector plus vLLM retrieval has not been proven from this verifier.",
      "Embedding and vector search failures must remain visible as missingEvidence rather than being hidden behind a confident answer.",
      "Runtime RAG must not return raw documents or perform apply/delete/scale."
    ],
    rollbackPath: [
      "Set CYWELL_OPSLENS_RAG_RUNTIME_MODE=local to disable live runtime retrieval.",
      "Keep local tenant-scoped Markdown RAG as the fallback source while runtime images or network policy are repaired.",
      "Regenerate runtime RAG, runtime readiness, MVP, and checkpoint evidence after changing retrieval behavior."
    ],
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(
    resolve(options.evidenceOut),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );
  pass("runtime RAG evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens runtime RAG contract: status=${status}, ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("runtime RAG verifier", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] runtime RAG verifier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
