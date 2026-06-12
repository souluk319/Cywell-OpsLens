#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const defaults = {
  evidenceOut: "test-results/cywell-opslens-runtime-rag-fixture.json"
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
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut
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

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) pass(name, detail);
  else fail(name, failureDetail);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function readJsonRequest(request) {
  return new Promise((resolveRequest, rejectRequest) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", rejectRequest);
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolveRequest({});
        return;
      }
      try {
        resolveRequest(JSON.parse(text));
      } catch (error) {
        rejectRequest(error);
      }
    });
  });
}

function listen(server, port = 0) {
  return new Promise((resolveListen) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolveListen(address.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

async function createMockRuntimeServers() {
  const state = {
    embeddingRequests: [],
    vectorSearchRequests: []
  };

  const vllm = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/embeddings") {
      sendJson(response, 404, { error: "route missing" });
      return;
    }
    const body = await readJsonRequest(request);
    state.embeddingRequests.push(body);
    sendJson(response, 200, {
      object: "list",
      model: body.model,
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: [0.11, 0.22, 0.33, 0.44]
        }
      ]
    });
  });

  const qdrant = createServer(async (request, response) => {
    if (
      request.method !== "POST" ||
      !request.url?.startsWith("/collections/opslens-cywell-payments/points/search")
    ) {
      sendJson(response, 404, { error: "route missing" });
      return;
    }
    const body = await readJsonRequest(request);
    state.vectorSearchRequests.push(body);
    sendJson(response, 200, {
      result: [
        {
          id: "runtime-point-1",
          score: 0.97,
          payload: {
            id: "runtime-payments-guide",
            documentId: "runtime-payments-guide",
            tenantId: "cywell-payments",
            label: "Runtime Payments Runbook",
            sourceType: "customer-runbook",
            trustLevel: "approved",
            redacted: true,
            redactedSnippet:
              "Runtime snippet says compare rollout config, readiness probe events, and approved rollback evidence."
          }
        }
      ]
    });
  });

  const vllmPort = await listen(vllm);
  const qdrantPort = await listen(qdrant);
  return {
    state,
    vllm,
    qdrant,
    vllmUrl: `http://127.0.0.1:${vllmPort}`,
    qdrantUrl: `http://127.0.0.1:${qdrantPort}`
  };
}

function startApiServer(env) {
  let outputTail = "";
  const child = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env
  });

  const append = (chunk) => {
    outputTail = `${outputTail}${sanitize(chunk.toString())}`.slice(-8000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  return {
    child,
    outputTail: () => outputTail
  };
}

async function waitForHealth(url, apiProcess) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.child.exitCode !== null) {
      throw new Error(`API server exited early: ${apiProcess.outputTail()}`);
    }
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch {
      // Retry until the API listener is ready.
    }
    await new Promise((resolveAttempt) => setTimeout(resolveAttempt, 100));
  }
  throw new Error(`API server did not become ready: ${apiProcess.outputTail()}`);
}

async function gitValue(args, fallback) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim().split(/\r?\n/).at(-1) || fallback;
  } catch {
    return fallback;
  }
}

async function gitStatusShort() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim() ? stdout.trim().split(/\r?\n/) : [];
  } catch {
    return [];
  }
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const apiPortServer = createServer();
  const apiPort = await listen(apiPortServer);
  await closeServer(apiPortServer);

  const runtime = await createMockRuntimeServers();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const apiProcess = startApiServer({
    ...process.env,
    KUGNUS_API_HOST: "127.0.0.1",
    KUGNUS_API_PORT: String(apiPort),
    CYWELL_OPSLENS_TLS_CERT_FILE: "",
    CYWELL_OPSLENS_TLS_KEY_FILE: "",
    CYWELL_OPSLENS_RAG_RUNTIME_MODE: "hybrid",
    CYWELL_OPSLENS_MODEL_URL: runtime.vllmUrl,
    CYWELL_OPSLENS_VECTOR_URL: runtime.qdrantUrl,
    CYWELL_OPSLENS_RUNTIME_PROBE_TIMEOUT_MS: "5000"
  });

  try {
    await waitForHealth(apiUrl, apiProcess);
    pass("API fixture server", `${apiUrl}/healthz is ready`);

    const response = await fetch(`${apiUrl}/api/opslens/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        tool: "generate_playbook",
        input: {
          clusterId: "prod-ocp",
          tenantId: "cywell-payments",
          namespace: "payments",
          workload: "payments-api",
          intent: "pod-crashloop-root-cause-and-recovery",
          question:
            "Runtime fixture question token=fixture-secret should be redacted.",
          constraints: {
            readOnly: true,
            includeCustomerRunbooks: true,
            maxDocuments: 3
          }
        },
        caller: {
          source: "lightspeed",
          user: "fixture.sre@example.com"
        }
      })
    });
    const body = await response.json();

    expectCheck(
      "ask HTTP status",
      response.ok,
      `httpStatus=${response.status}`,
      `expected 2xx, got ${response.status}: ${JSON.stringify(body)}`
    );
    expectCheck(
      "runtime RAG ready",
      body.audit?.runtimeRag?.status === "ready" &&
        body.audit?.runtimeRag?.citationsUsed === "runtime" &&
        body.audit?.runtimeRag?.localFallbackUsed === false,
      "runtime citation path was selected without local fallback",
      `runtime audit=${JSON.stringify(body.audit?.runtimeRag ?? {})}`
    );
    expectCheck(
      "runtime model route",
      body.audit?.model === "cywell-private-rag-qdrant-vllm-hybrid/v0.1",
      "hybrid model route is recorded",
      `model=${body.audit?.model ?? "missing"}`
    );
    expectCheck(
      "runtime citation returned",
      body.citations?.some?.(
        (citation) =>
          citation.id === "runtime-payments-guide" &&
          citation.label === "Runtime Payments Runbook" &&
          citation.redacted === true
      ) === true,
      "redacted Qdrant fixture citation is returned"
    );
    expectCheck(
      "policy remains read-only",
      body.policy?.mutationAllowed === false &&
        body.policy?.rawDocumentReturned === false,
      "runtime answer keeps mutationAllowed=false and rawDocumentReturned=false"
    );
    expectCheck(
      "secret redaction",
      !JSON.stringify(body).includes("fixture-secret"),
      "fixture secret does not appear in API response"
    );

    const embeddingRequest = runtime.state.embeddingRequests[0] ?? {};
    expectCheck(
      "vLLM embedding request",
      runtime.state.embeddingRequests.length === 1 &&
        String(embeddingRequest.input ?? "").includes("<REDACTED>") &&
        !String(embeddingRequest.input ?? "").includes("fixture-secret"),
      "vLLM embedding request received redacted input"
    );
    const vectorSearchRequest = runtime.state.vectorSearchRequests[0] ?? {};
    expectCheck(
      "Qdrant vector search request",
      runtime.state.vectorSearchRequests.length === 1 &&
        Array.isArray(vectorSearchRequest.vector) &&
        vectorSearchRequest.vector.length === 4 &&
        vectorSearchRequest.filter?.must?.some?.(
          (item) =>
            item.key === "tenantId" &&
            item.match?.value === "cywell-payments"
        ) === true,
      "Qdrant search received vector and tenant filter"
    );
  } finally {
    apiProcess.child.kill();
    await Promise.allSettled([
      closeServer(runtime.vllm),
      closeServer(runtime.qdrant)
    ]);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const status = failures.length > 0 ? "FAIL" : "PASS";
  const artifact = {
    schema: "cywell.opslens.runtime-rag-fixture.v0.1",
    artifactType: "opslens.runtime-rag-fixture.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnly",
    mutationAllowed: false,
    rawDocumentReturned: false,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: ["AC-LS-001", "AC-RAG-001"],
    evidence: [
      "fixture vLLM /v1/embeddings returned a numeric embedding",
      "fixture Qdrant /points/search returned a redacted tenant citation",
      "OpsLens /api/opslens/ask selected runtime citation and kept read-only policy"
    ],
    missingEvidence: [
      "real deployed vLLM/Qdrant reachability and quality evaluation remain required"
    ],
    risk: [
      "Fixture PASS proves the code path, not live runtime service health.",
      "Live runtime mode must still be enabled deliberately and monitored through runtime readiness evidence."
    ],
    rollbackPath: [
      "Set CYWELL_OPSLENS_RAG_RUNTIME_MODE=local to return to tenant-scoped local RAG fallback.",
      "Regenerate runtime RAG fixture, runtime readiness, MVP, and checkpoint evidence after adapter changes."
    ],
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(
    resolve(options.evidenceOut),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );
  pass("runtime RAG fixture evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens runtime RAG fixture: status=${status}, ${failures.length} fail, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("runtime RAG fixture verifier", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] runtime RAG fixture verifier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
