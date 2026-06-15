#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import {
  sanitizeArtifact,
  sanitizeConfiguredEndpoints,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const startedAt = new Date().toISOString();
const checks = [];

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lightspeed-trojan-horse.json",
  timeoutMs: 10_000
};

const scenario = {
  stage: "stage-1-lightspeed-mcp",
  name: "Lightspeed Trojan Horse custom question",
  userQuestion: "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘",
  redactionProbeQuestion:
    "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘. token=trojan-secret",
  expectedTool: "generate_playbook",
  tenantId: "cywell-payments",
  clusterId: "prod-ocp",
  namespace: "payments",
  workload: "payments-api",
  intent: "pod-crashloop-root-cause-and-recovery"
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
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

function sanitize(value) {
  return sanitizeConfiguredEndpoints(String(value))
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(
      /(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi,
      "$1$2<redacted>"
    )
    .replace(/trojan-secret/gi, "<redacted>");
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
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function spawnProcess(command, commandArgs, env) {
  if (process.platform === "win32" && command === "npm") {
    return spawn(
      "cmd.exe",
      ["/d", "/s", "/c", ["npm", ...commandArgs].join(" ")],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env
      }
    );
  }

  return spawn(command, commandArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env
  });
}

function startApiServer(env) {
  const child = spawnProcess("npm", ["run", "-w", "@kugnus/api", "start"], env);
  let output = "";
  const append = (data) => {
    output = `${output}${data.toString()}`.slice(-8000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return {
    child,
    outputTail: () => sanitize(output)
  };
}

function killProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      return;
    } catch {
      // The process can exit between health checks and cleanup.
    }
  }
  child.kill();
}

async function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("ephemeral port allocation failed"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose) => server.close(resolveClose));
}

async function waitForHealth(apiUrl, apiProcess) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Keep polling until the API server is ready or the deadline expires.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`API server did not become ready: ${apiProcess.outputTail()}`);
}

async function getJson(apiUrl, path) {
  const response = await fetch(`${apiUrl}${path}`);
  const body = await response.json();
  return { response, body };
}

async function postJson(apiUrl, path, payload) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

function toolNames(tools) {
  return tools.map((tool) => tool.name).filter(Boolean);
}

function citationIds(citations) {
  return citations.map((citation) => citation.id).filter(Boolean);
}

function summarizeRuntimeRag(audit) {
  return {
    mode: audit?.mode ?? "missing",
    status: audit?.status ?? "missing",
    localFallbackUsed: audit?.localFallbackUsed ?? "missing",
    citationsUsed: audit?.citationsUsed ?? "missing",
    retrievalAttempted: audit?.retrievalAttempted ?? "missing"
  };
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
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const apiProcess = startApiServer({
    ...process.env,
    KUGNUS_API_HOST: "127.0.0.1",
    HOST: "127.0.0.1",
    KUGNUS_API_PORT: String(apiPort),
    PORT: String(apiPort),
    CYWELL_OPSLENS_TLS_CERT_FILE: "__disabled__",
    CYWELL_OPSLENS_TLS_KEY_FILE: "__disabled__",
    CYWELL_OPSLENS_RAG_RUNTIME_MODE: "local"
  });

  let structured;
  let redactionProbe;
  let toolCatalog = [];
  let playbookToolDescription = "";

  try {
    await waitForHealth(apiUrl, apiProcess);
    pass("API fixture server", `${apiUrl}/healthz is ready`);

    const toolsSurface = await getJson(apiUrl, "/api/opslens/tools");
    expectCheck(
      "REST tool surface",
      toolsSurface.response.ok &&
        toolsSurface.body.mcpTechnologyPreview === true &&
        toolsSurface.body.tools?.some?.((tool) => tool.name === scenario.expectedTool),
      "/api/opslens/tools exposes Technology Preview MCP tool surface"
    );

    const listed = await postJson(apiUrl, "/mcp", {
      jsonrpc: "2.0",
      id: "trojan-tools-list",
      method: "tools/list"
    });
    toolCatalog = listed.body.result?.tools ?? [];
    const names = toolNames(toolCatalog);
    expectCheck(
      "MCP production endpoint tools/list",
      listed.response.ok && names.includes(scenario.expectedTool),
      "/mcp tools/list returns generate_playbook"
    );
    const playbookTool = toolCatalog.find(
      (tool) => tool.name === scenario.expectedTool
    );
    playbookToolDescription = playbookTool?.description ?? "";
    expectCheck(
      "MCP Trojan Horse routing hint",
      playbookToolDescription.includes(scenario.userQuestion) &&
        playbookToolDescription.includes("missingEvidence") &&
        playbookToolDescription.includes("rollbackPath"),
      "generate_playbook description contains the exact Korean custom question plus evidence contract",
      "generate_playbook description is missing the exact Trojan Horse routing hint"
    );
    expectCheck(
      "MCP mutating tool exclusion",
      !names.includes("apply_remediation"),
      "apply_remediation is absent from the Lightspeed-facing catalog"
    );
    expectCheck(
      "MCP tool safety annotations",
      toolCatalog.every(
        (tool) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false
      ),
      "all MCP tools are annotated read-only and non-destructive"
    );

    const call = await postJson(apiUrl, "/mcp", {
      jsonrpc: "2.0",
      id: "trojan-primary-call",
      method: "tools/call",
      params: {
        name: scenario.expectedTool,
        arguments: {
          clusterId: scenario.clusterId,
          tenantId: scenario.tenantId,
          namespace: scenario.namespace,
          workload: scenario.workload,
          intent: scenario.intent,
          question: scenario.userQuestion,
          constraints: {
            readOnly: true,
            includeCustomerRunbooks: true,
            maxDocuments: 3
          },
          caller: {
            source: "lightspeed",
            user: "sre.kim@example.com"
          }
        }
      }
    });
    structured = call.body.result?.structuredContent;
    const payloadText = JSON.stringify(structured ?? {});
    const citations = structured?.citations ?? [];
    const citationFound = citations.some(
      (citation) =>
        citation.sourceType === "customer-runbook" &&
        citation.redacted === true &&
        citation.label?.includes("Payments API Pod 장애 대응 매뉴얼")
    );

    expectCheck(
      "Trojan Horse tools/call",
      call.response.ok &&
        call.body.result?.isError === false &&
        structured?.tool === scenario.expectedTool,
      "exact Korean custom question returns generate_playbook structured content",
      `tools/call failed or selected tool was ${structured?.tool ?? "missing"}`
    );
    expectCheck(
      "Trojan Horse read-only policy",
      structured?.actionMode === "readOnly" &&
        structured?.policy?.mutationAllowed === false &&
        structured?.policy?.rawDocumentReturned === false &&
        structured?.policy?.mcpTechnologyPreview === true,
      "response is readOnly, non-mutating, snippet-only, and Technology Preview labeled"
    );
    expectCheck(
      "Trojan Horse customer-runbook citation",
      citationFound,
      "customer-runbook citation for Payments API Pod 장애 대응 매뉴얼 returned"
    );
    expectCheck(
      "Trojan Horse evidence blocks",
      structured?.summary?.includes(scenario.userQuestion) &&
        structured?.evidence?.join(" ").includes("tool profile=generate_playbook") &&
        structured?.missingEvidence?.length > 0 &&
        structured?.risks?.join(" ").includes("Technology Preview") &&
        structured?.rollbackPath?.join(" ").includes("GitOps"),
      "summary, evidence, missingEvidence, risk, and rollback path are present"
    );
    expectCheck(
      "Trojan Horse runtime RAG fallback",
      structured?.audit?.runtimeRag?.mode === "local" &&
        structured?.audit?.runtimeRag?.status === "disabled" &&
        structured?.audit?.runtimeRag?.localFallbackUsed === true &&
        structured?.audit?.runtimeRag?.citationsUsed === "local-fallback",
      "runtime RAG audit records safe local fallback by default"
    );
    expectCheck(
      "Trojan Horse raw secret absence",
      !payloadText.includes("trojan-secret"),
      "primary payload contains no probe secret"
    );

    const ask = await postJson(apiUrl, "/api/opslens/ask", {
      tool: scenario.expectedTool,
      input: {
        clusterId: scenario.clusterId,
        tenantId: scenario.tenantId,
        namespace: scenario.namespace,
        workload: scenario.workload,
        intent: scenario.intent,
        question: scenario.redactionProbeQuestion,
        constraints: {
          readOnly: true,
          includeCustomerRunbooks: true,
          maxDocuments: 3
        }
      },
      caller: {
        source: "lightspeed",
        user: "sre.kim@example.com"
      }
    });
    redactionProbe = ask.body;
    const redactionPayload = JSON.stringify(redactionProbe ?? {});
    expectCheck(
      "Trojan Horse server-side redaction",
      ask.response.ok &&
        !redactionPayload.includes("trojan-secret") &&
        redactionPayload.includes("<REDACTED>") &&
        Number(redactionProbe?.audit?.redactionCount ?? 0) > 0,
      "secret-like prompt values are redacted before returning to Lightspeed"
    );
  } finally {
    killProcessTree(apiProcess.child);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const status = failures.length > 0 ? "FAIL" : "PASS";
  const citations = structured?.citations ?? [];
  const artifact = {
    schema: "cywell.opslens.lightspeed-trojan-horse.v0.1",
    artifactType: "opslens.lightspeed-trojan-horse.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnly",
    mutationAllowed: false,
    rawDocumentReturned: false,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    scenario: {
      ...scenario,
      redactionProbeQuestion: sanitize(scenario.redactionProbeQuestion),
      selectedTool: structured?.tool ?? scenario.expectedTool,
      transport: "mcp-json-rpc",
      endpoint: "/mcp",
      localSmokeEndpoint: "/api/opslens/ask"
    },
    toolCatalog: {
      count: toolCatalog.length,
      names: toolNames(toolCatalog),
      mutatingToolExcluded: !toolNames(toolCatalog).includes("apply_remediation"),
      allReadOnly: toolCatalog.every(
        (tool) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false
      ),
      trojanHorseRoutingHint:
        playbookToolDescription.includes(scenario.userQuestion)
    },
    primaryCall: {
      passed:
        structured?.tool === scenario.expectedTool &&
        structured?.actionMode === "readOnly" &&
        structured?.policy?.mutationAllowed === false &&
        structured?.policy?.rawDocumentReturned === false,
      tool: structured?.tool ?? "missing",
      actionMode: structured?.actionMode ?? "missing",
      summaryContainsExactQuestion:
        structured?.summary?.includes(scenario.userQuestion) === true,
      citationCount: citations.length,
      citationIds: citationIds(citations),
      customerRunbookCitationFound: citations.some(
        (citation) => citation.sourceType === "customer-runbook"
      ),
      runtimeRag: summarizeRuntimeRag(structured?.audit?.runtimeRag),
      evidenceMatched: (structured?.evidence ?? []).filter((item) =>
        /tool profile=generate_playbook|private RAG|runtime RAG/i.test(item)
      )
    },
    redactionProbe: {
      passed:
        redactionProbe?.policy?.serverSideRedaction === true &&
        Number(redactionProbe?.audit?.redactionCount ?? 0) > 0 &&
        !JSON.stringify(redactionProbe ?? {}).includes("trojan-secret"),
      redactedSecret: !JSON.stringify(redactionProbe ?? {}).includes("trojan-secret"),
      redactionCount: redactionProbe?.audit?.redactionCount ?? 0,
      summaryContainsRedaction:
        redactionProbe?.summary?.includes("<REDACTED>") === true
    },
    policy: {
      privateRag: structured?.policy?.privateRag ?? "missing",
      serverSideRedaction: structured?.policy?.serverSideRedaction ?? "missing",
      rawDocumentReturned: structured?.policy?.rawDocumentReturned ?? "missing",
      mcpTechnologyPreview:
        structured?.policy?.mcpTechnologyPreview ?? "missing",
      mutationAllowed: structured?.policy?.mutationAllowed ?? "missing"
    },
    evidence: [
      "local /mcp JSON-RPC tools/list returns the read-only MVP tool catalog",
      "local /mcp JSON-RPC tools/call returns generate_playbook for the exact Stage 1 Korean custom question",
      "customer-runbook citations are returned as redacted snippets, not raw documents",
      "server-side redaction probe proves secret-like prompt values are not returned",
      "the verifier starts a local API server only and does not patch OLSConfig, contact the cluster, write vectors, or mutate registries"
    ],
    externalEvidenceGaps: [
      "live Lightspeed model-side tool choice still requires a reachable OLSConfig MCP registration",
      "live OpenShift API and Lightspeed endpoint checks remain covered by npm run verify:lightspeed and npm run verify:live-handoff",
      "live Qdrant/vLLM retrieval quality remains a separate runtime RAG evidence lane"
    ],
    missingEvidence:
      status === "PASS"
        ? []
        : failures.map((failure) => `${failure.name}: ${failure.detail}`),
    risk: [
      "This verifier proves the local MCP contract for the exact Trojan Horse question; it does not claim that a live Lightspeed model has selected the tool.",
      "OpenShift Lightspeed MCP remains Technology Preview, so production release still needs Operator/Console Plugin packaging and explicit live evidence.",
      "Customer data must keep flowing through Cywell private RAG policy before anything is returned to Lightspeed."
    ],
    rollbackPath: [
      "If this verifier fails, remove or disable Cywell MCP registration before exposing the tool to Lightspeed.",
      "If citations are missing or unsafe, keep CYWELL_OPSLENS_RAG_RUNTIME_MODE=local and fix the tenant corpus or retrieval policy before live rollout.",
      "If live Lightspeed selects an unsafe path, remove the affected tool from the MCP catalog and rerun this verifier plus verify:lightspeed:routing."
    ],
    checks
  };

  const sanitizedArtifact = sanitizeArtifact(artifact, sanitize);
  const serialized = `${JSON.stringify(sanitizedArtifact, null, 2)}\n`;
  if (sensitiveEndpointLeakLike(serialized)) {
    throw new Error("Lightspeed Trojan Horse evidence would include an unredacted configured endpoint or private IP");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens Lightspeed Trojan Horse: status=${status}, ${failures.length} fail, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(
    "Trojan Horse verifier",
    error instanceof Error ? error.message : String(error)
  );
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  process.exitCode = 1;
});
