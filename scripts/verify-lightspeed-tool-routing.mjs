#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const startedAt = new Date().toISOString();
const checks = [];

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lightspeed-tool-routing.json",
  fixturesSource: "packages/contracts/src/fixtures.ts",
  apiSource: "apps/api/src/api.ts",
  acceptanceSource: "docs/acceptance/mvp-0.1.md",
  timeoutMs: 10_000
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
  fixturesSource: parsed.get("fixtures-source") ?? defaults.fixturesSource,
  apiSource: parsed.get("api-source") ?? defaults.apiSource,
  acceptanceSource: parsed.get("acceptance-source") ?? defaults.acceptanceSource,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const routeFixtures = [
  {
    id: "ls-route-01",
    expectedTool: "generate_playbook",
    intent: "pod-crashloop-root-cause-and-recovery",
    namespace: "payments",
    workload: "payments-api",
    question:
      "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘. token=fixture-secret",
    responseMustContain: ["tool profile=generate_playbook", "customer-runbook"]
  },
  {
    id: "ls-route-02",
    expectedTool: "get_cluster_signal",
    intent: "cluster-signal-readiness-events",
    namespace: "payments",
    workload: "payments-api",
    question:
      "payments-api Pod 상태, restart count, readiness 이벤트를 읽기 전용으로 요약해줘. token=fixture-secret",
    responseMustContain: ["tool profile=get_cluster_signal", "read-only"]
  },
  {
    id: "ls-route-03",
    expectedTool: "retrieve_customer_knowledge",
    intent: "customer-runbook-citation-only",
    namespace: "payments",
    workload: "payments-api",
    question:
      "결제 장애 Secret checklist 고객 runbook citation만 찾아줘. 원문 없이 snippet만 필요해. token=fixture-secret",
    responseMustContain: [
      "tool profile=retrieve_customer_knowledge",
      "rawDocumentReturned=false"
    ]
  },
  {
    id: "ls-route-04",
    expectedTool: "open_console_deep_link",
    intent: "open-console-navigation",
    namespace: "payments",
    workload: "payments-api",
    question:
      "payments-api Deployment, Pod, Events, OpsLens Admin 콘솔 deep link 열어줘. token=fixture-secret",
    responseMustContain: [
      "tool profile=open_console_deep_link",
      "/opslens/admin",
      "/k8s/ns/payments/deployments/payments-api"
    ]
  },
  {
    id: "ls-route-05",
    expectedTool: "run_preflight",
    intent: "opslens-install-preflight",
    namespace: "payments",
    workload: "payments-api",
    question:
      "OpsLens 설치 전 Lightspeed MCP, OLSConfig, Operator preflight 체크리스트를 만들어줘. token=fixture-secret",
    responseMustContain: [
      "tool profile=run_preflight",
      "verify:evidence-checkpoint",
      "live OCP API"
    ]
  },
  {
    id: "ls-route-06",
    expectedTool: "propose_remediation",
    intent: "memory-limit-plan-only-proposal",
    namespace: "payments",
    workload: "payments-api",
    question:
      "이 Deployment YAML의 memory limit을 2Gi에서 4Gi로 바꾸는 plan-only remediation proposal만 제안해줘. token=fixture-secret",
    responseMustContain: [
      "tool profile=propose_remediation",
      "memory: 4Gi",
      "planOnly"
    ]
  },
  {
    id: "ls-route-07",
    expectedTool: "generate_playbook",
    intent: "alert-log-metric-playbook",
    namespace: "payments",
    workload: "payments-api",
    question:
      "Prometheus alert와 최근 10분 로그를 기준으로 장애 대응 플레이북을 작성해줘. token=fixture-secret",
    responseMustContain: ["tool profile=generate_playbook", "missingEvidence"]
  },
  {
    id: "ls-route-08",
    expectedTool: "get_cluster_signal",
    intent: "rbac-resource-signal",
    namespace: "payments",
    workload: "payments-api",
    question:
      "내 RBAC로 읽을 수 있는 namespace 리소스와 ClusterOperator 상태 신호만 요약해줘. token=fixture-secret",
    responseMustContain: ["tool profile=get_cluster_signal", "SelfSubjectAccessReview"]
  },
  {
    id: "ls-route-09",
    expectedTool: "retrieve_customer_knowledge",
    intent: "private-rag-knowledge-only",
    namespace: "payments",
    workload: "payments-api",
    question:
      "Cywell private RAG에서 승인된 고객 지식 문서만 검색하고 citation 근거를 보여줘. token=fixture-secret",
    responseMustContain: [
      "tool profile=retrieve_customer_knowledge",
      "rawDocumentReturned"
    ]
  },
  {
    id: "ls-route-10",
    expectedTool: "run_preflight",
    intent: "olsconfig-registration-preflight",
    namespace: "openshift-lightspeed",
    workload: "cluster",
    question:
      "OLSConfig MCP 등록 전에 patch preview, rollback path, 설치 승인 evidence를 사전점검해줘. token=fixture-secret",
    responseMustContain: ["tool profile=run_preflight", "OLSConfig", "rollback"]
  }
];

function sanitize(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/fixture-secret/gi, "<redacted>");
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

async function runCapture(command, args, timeoutMs = options.timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs
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

function readText(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail("source file", `${path} is missing`);
    return "";
  }
  pass("source file", `${path} exists`);
  return readFileSync(absolutePath, "utf8");
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
      // Fall back to child.kill below when taskkill is unavailable or the process exited.
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
      // keep polling until deadline
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`API server did not become ready: ${apiProcess.outputTail()}`);
}

async function postMcp(apiUrl, method, params, id) {
  const response = await fetch(`${apiUrl}/api/opslens/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    })
  });
  const body = await response.json();
  return { response, body };
}

function routeQuestionToTool(question) {
  const text = question.toLowerCase();

  if (
    /설치|사전점검|preflight|olsconfig|mcp 등록|operator preflight|operator packaging|operator package|operator 설치|install|approval|patch preview|인증/.test(
      text
    )
  ) {
    return "run_preflight";
  }
  if (/deep link|링크|콘솔|console|열어|navigation|navigate/.test(text)) {
    return "open_console_deep_link";
  }
  if (/yaml|patch|memory|limit|2gi|4gi|remediation|proposal|수정|바꾸/.test(text)) {
    return "propose_remediation";
  }
  if (
    /원문 없이|citation|근거 문서|문서만|runbook만|지식|secret checklist|찾아|private rag/.test(
      text
    )
  ) {
    return "retrieve_customer_knowledge";
  }
  if (/대응 매뉴얼|플레이북|playbook|복구 계획|장애 대응|prometheus|최근 10분 로그/.test(text)) {
    return "generate_playbook";
  }
  if (
    /cluster signal|상태|이벤트|restart|readiness|rbac|리소스|namespace|clusteroperator|pod/.test(
      text
    )
  ) {
    return "get_cluster_signal";
  }
  return "generate_playbook";
}

function mcpToolNames(tools) {
  return tools.map((tool) => tool.name).filter(Boolean);
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();

  const fixturesText = readText(options.fixturesSource);
  const apiText = readText(options.apiSource);
  const acceptanceText = readText(options.acceptanceSource);

  for (const toolName of [
    "get_cluster_signal",
    "retrieve_customer_knowledge",
    "generate_playbook",
    "open_console_deep_link",
    "run_preflight",
    "propose_remediation"
  ]) {
    expectCheck(
      `tool fixture ${toolName}`,
      fixturesText.includes(`name: "${toolName}"`),
      `${toolName} is present in opsLensMcpTools`,
      `${toolName} is missing from ${options.fixturesSource}`
    );
  }
  expectCheck(
    "routing acceptance threshold",
    acceptanceText.includes("10") && acceptanceText.includes("8"),
    "acceptance docs name the 10-question / 8-pass Lightspeed routing threshold",
    "acceptance docs do not name the Lightspeed routing threshold"
  );
  expectCheck(
    "API tool profiles",
    apiText.includes("toolResponseProfile") &&
      apiText.includes("tool profile=run_preflight") &&
      apiText.includes("tool profile=open_console_deep_link"),
    "API has tool-specific response profiles for routed tools"
  );

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

  const caseResults = [];

  try {
    await waitForHealth(apiUrl, apiProcess);
    pass("API fixture server", `${apiUrl}/healthz is ready`);

    const listed = await postMcp(apiUrl, "tools/list", {}, "tools-list");
    const tools = listed.body.result?.tools ?? [];
    const toolNames = mcpToolNames(tools);
    expectCheck(
      "MCP tool catalog count",
      tools.length === 6,
      "MCP tools/list returns the six MVP tools",
      `MCP tools/list returned ${tools.length} tools`
    );
    expectCheck(
      "MCP mutating tool exclusion",
      !toolNames.includes("apply_remediation"),
      "apply_remediation is absent from tools/list"
    );
    expectCheck(
      "MCP tool safety annotations",
      tools.every(
        (tool) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false
      ),
      "all listed tools are read-only and non-destructive"
    );

    for (const fixture of routeFixtures) {
      const selectedTool = routeQuestionToTool(fixture.question);
      const selectionPassed = selectedTool === fixture.expectedTool;
      if (selectionPassed) {
        pass(
          `routing ${fixture.id}`,
          `${fixture.question} -> ${selectedTool}`
        );
      } else {
        fail(
          `routing ${fixture.id}`,
          `expected ${fixture.expectedTool}, selected ${selectedTool}`
        );
      }

      const call = await postMcp(
        apiUrl,
        "tools/call",
        {
          name: selectedTool,
          arguments: {
            clusterId: "prod-ocp",
            tenantId: "cywell-payments",
            namespace: fixture.namespace,
            workload: fixture.workload,
            intent: fixture.intent,
            question: fixture.question,
            constraints: {
              readOnly: true,
              includeCustomerRunbooks: true,
              maxDocuments: 3
            },
            caller: {
              source: "lightspeed",
              user: "routing.fixture@example.com"
            }
          }
        },
        fixture.id
      );
      const structured = call.body.result?.structuredContent;
      const payloadText = JSON.stringify(structured ?? {});
      const responseChecks = [
        call.response.ok && call.body.result?.isError === false,
        structured?.tool === selectedTool,
        structured?.policy?.mutationAllowed === false,
        structured?.policy?.rawDocumentReturned === false,
        !payloadText.includes("fixture-secret"),
        fixture.responseMustContain.every((token) => payloadText.includes(token))
      ];
      const responsePassed = responseChecks.every(Boolean);

      if (responsePassed) {
        pass(
          `response ${fixture.id}`,
          `${selectedTool} returned safe structured content`
        );
      } else {
        fail(
          `response ${fixture.id}`,
          `unsafe or incomplete response for ${selectedTool}: http=${call.response.status} structuredTool=${structured?.tool ?? "missing"}`
        );
      }

      caseResults.push({
        id: fixture.id,
        question: sanitize(fixture.question),
        expectedTool: fixture.expectedTool,
        selectedTool,
        selectionPassed,
        responsePassed,
        actionMode: structured?.actionMode ?? "missing",
        mutationAllowed: structured?.policy?.mutationAllowed ?? "missing",
        rawDocumentReturned:
          structured?.policy?.rawDocumentReturned ?? "missing",
        evidenceMatched: fixture.responseMustContain.filter((token) =>
          payloadText.includes(token)
        )
      });
    }
  } finally {
    killProcessTree(apiProcess.child);
  }

  const selectedPasses = caseResults.filter((result) => result.selectionPassed).length;
  const responsePasses = caseResults.filter((result) => result.responsePassed).length;
  const threshold = 8;
  expectCheck(
    "10-question routing threshold",
    routeFixtures.length === 10 && selectedPasses >= threshold,
    `${selectedPasses}/${routeFixtures.length} selected expected tools; threshold=${threshold}`,
    `${selectedPasses}/${routeFixtures.length} selected expected tools; threshold=${threshold}`
  );
  expectCheck(
    "routed response threshold",
    routeFixtures.length === 10 && responsePasses >= threshold,
    `${responsePasses}/${routeFixtures.length} routed responses kept safety/evidence contract; threshold=${threshold}`,
    `${responsePasses}/${routeFixtures.length} routed responses kept safety/evidence contract; threshold=${threshold}`
  );

  const failures = checks.filter((check) => check.status === "FAIL");
  const status = failures.length > 0 ? "FAIL" : "PASS";
  const artifact = {
    schema: "cywell.opslens.lightspeed-tool-routing.v0.1",
    artifactType: "opslens.lightspeed-tool-routing.v0.1",
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
      worktreeDirty: worktreeStatus.length > 0
    },
    score: {
      selectedPasses,
      responsePasses,
      total: routeFixtures.length,
      threshold
    },
    cases: caseResults,
    checks,
    missingEvidence:
      status === "PASS"
        ? []
        : failures.map((failure) => `${failure.name}: ${failure.detail}`),
    risk: [
      "This fixture validates deterministic representative routing; live OpenShift Lightspeed model-side tool choice still requires a reachable Lightspeed/MCP integration.",
      "MCP Technology Preview behavior must remain evidence-gated before production rollout."
    ],
    rollbackPath: [
      "If routing quality regresses, revert tool descriptions or routing hints and rerun this verifier before changing OLSConfig registration.",
      "If live Lightspeed chooses unsafe tools, disable Cywell MCP registration or remove the affected tool from the catalog until the policy is fixed."
    ]
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(
    resolve(options.evidenceOut),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens Lightspeed tool routing: status=${status}, selected=${selectedPasses}/${routeFixtures.length}, responses=${responsePasses}/${routeFixtures.length}, threshold=${threshold}, ${failures.length} fail, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(
    "tool routing verifier",
    error instanceof Error ? error.message : String(error)
  );
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  process.exitCode = 1;
});
