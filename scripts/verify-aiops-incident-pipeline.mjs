#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-aiops-incident-pipeline.json",
  incidentsSource: "apps/api/src/incidents.ts",
  apiSource: "apps/api/src/api.ts",
  contractSource: "packages/contracts/src/types.ts",
  e2eSource: "tests/e2e/mvp-0.1.spec.ts",
  acceptanceSource: "docs/acceptance/mvp-0.1.md",
  timeoutMs: 10_000,
  liveTimeoutMs: 45_000
};

const startedAt = new Date().toISOString();
const checks = [];

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
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  incidentsSource: parsed.values.get("incidents-source") ?? defaults.incidentsSource,
  apiSource: parsed.values.get("api-source") ?? defaults.apiSource,
  contractSource: parsed.values.get("contract-source") ?? defaults.contractSource,
  e2eSource: parsed.values.get("e2e-source") ?? defaults.e2eSource,
  acceptanceSource: parsed.values.get("acceptance-source") ?? defaults.acceptanceSource,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  liveTimeoutMs: Number(parsed.values.get("live-timeout-ms") ?? defaults.liveTimeoutMs),
  skipLive: parsed.flags.has("skip-live")
};

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/demo-secret/gi, "<redacted>");
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

function expectLive(name, condition, detail, missingEvidence, liveGaps) {
  if (condition) {
    pass(name, detail);
  } else {
    const gap = sanitize(missingEvidence);
    liveGaps.push(`${name}: ${gap}`);
    warn(name, gap);
  }
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
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
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
      // Process may already be gone.
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
      // Keep polling until the API process is ready or the deadline expires.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`API server did not become ready: ${apiProcess.outputTail()}`);
}

async function getJson(apiUrl, path) {
  const response = await fetch(`${apiUrl}${path}`, {
    signal: AbortSignal.timeout(options.liveTimeoutMs)
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { response, body };
}

async function postJson(apiUrl, path, payload) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.liveTimeoutMs)
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { response, body };
}

function hasAll(values, expected) {
  const set = new Set(values.filter(Boolean));
  return expected.every((value) => set.has(value));
}

function remediationProposal(body) {
  return body?.analysis?.remediationProposal;
}

function triggerEvidence(body) {
  return remediationProposal(body)?.triggerEvidence;
}

function jsonText(value) {
  return JSON.stringify(value ?? {});
}

function assertStaticContracts() {
  const incidentsText = readText(options.incidentsSource);
  const apiText = readText(options.apiSource);
  const contractText = readText(options.contractSource);
  const e2eText = readText(options.e2eSource);
  const acceptanceText = readText(options.acceptanceSource);

  expectCheck(
    "incident pipeline reads OCP evidence",
    incidentsText.includes("getOcpPodLogs") &&
      incidentsText.includes("listOcpEvents") &&
      incidentsText.includes("queryOcpPrometheus") &&
      incidentsText.includes("sinceSeconds"),
    "incident analyzer reads logs, events, and Prometheus metrics through OCP client"
  );
  expectCheck(
    "incident pipeline builds remediation proposal",
    incidentsText.includes("createPlanOnlyRemediationProposal") &&
      incidentsText.includes("triggerEvidence") &&
      incidentsText.includes("remediationProposal"),
    "incident analyzer attaches triggerEvidence to the plan-only remediation artifact"
  );
  expectCheck(
    "remediation proposal safety contract",
    apiText.includes("artifactType: \"opslens.remediation.proposal.v0.1\"") &&
      apiText.includes("mutationAllowed: false") &&
      apiText.includes("forbiddenActions: [\"apply\", \"delete\", \"scale\"]") &&
      apiText.includes("reviewGate"),
    "plan-only YAML proposal blocks apply/delete/scale and requires review"
  );
  expectCheck(
    "contract exposes triggerEvidence",
    contractText.includes("triggerEvidence") &&
      contractText.includes("runbookCitations") &&
      contractText.includes("OpsLensRemediationProposal"),
    "typed contracts expose triggerEvidence logs/events/metrics/runbook citations"
  );
  expectCheck(
    "AC-AIOPS e2e coverage",
    e2eText.includes("AC-AIOPS-001") &&
      e2eText.includes("AC-AIOPS-002") &&
      e2eText.includes("triggerEvidence") &&
      e2eText.includes("body.metrics?.windowMinutes") &&
      e2eText.includes("pod-restarts"),
    "Playwright acceptance asserts incident packet and metric correlation"
  );
  expectCheck(
    "acceptance documents triggerEvidence",
    acceptanceText.includes("remediationProposal.triggerEvidence") &&
      acceptanceText.includes("verify:aiops"),
    "acceptance matrix links AC-AIOPS to triggerEvidence and verify:aiops"
  );
}

async function runLiveSmoke() {
  const liveGaps = [];
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

  try {
    await waitForHealth(apiUrl, apiProcess);
    pass("API fixture server", `${apiUrl}/healthz is ready`);

    const pods = await getJson(apiUrl, "/api/ocp/resources?apiVersion=v1&resource=pods&limit=10");
    if (!pods.response.ok) {
      liveGaps.push(`pod discovery: ${sanitize(pods.body?.error ?? pods.response.status)}`);
      warn("live pod discovery", `unable to list pods: ${pods.response.status} ${pods.body?.error ?? ""}`);
      return {
        status: "needs-live-evidence",
        apiUrl,
        missingEvidence: liveGaps,
        selectedPod: undefined,
        incident: undefined
      };
    }

    const selectedPod = pods.body?.items?.find?.((item) =>
      item?.metadata?.name && item?.metadata?.namespace
    );
    if (!selectedPod) {
      liveGaps.push("pod discovery: no namespaced pod was returned");
      warn("live pod discovery", "no namespaced pod was returned from OCP");
      return {
        status: "needs-live-evidence",
        apiUrl,
        missingEvidence: liveGaps,
        selectedPod: undefined,
        incident: undefined
      };
    }

    pass(
      "live pod discovery",
      `selected pod ${selectedPod.metadata.namespace}/${selectedPod.metadata.name}`
    );

    const incident = await postJson(apiUrl, "/api/opslens/incidents/analyze", {
      clusterId: "prod-ocp",
      tenantId: "cywell-payments",
      windowMinutes: 10,
      question:
        "최근 10분 로그, 이벤트, 메트릭 근거로 원인 후보와 plan-only YAML만 제안해줘. password=demo-secret",
      alert: {
        name: "PodCrashLooping",
        severity: "warning",
        namespace: selectedPod.metadata.namespace,
        workload: selectedPod.metadata.name,
        resource: {
          apiVersion: "v1",
          kind: "Pod",
          resource: "pods",
          namespace: selectedPod.metadata.namespace,
          name: selectedPod.metadata.name
        }
      },
      evidenceHints: {
        podName: selectedPod.metadata.name,
        fieldSelector: `metadata.name=${selectedPod.metadata.name}`,
        tailLines: 20
      },
      caller: {
        source: "verifier",
        user: "aiops.pipeline.verifier@example.com"
      }
    });

    if (!incident.response.ok) {
      liveGaps.push(`incident analysis: ${sanitize(incident.body?.error ?? incident.response.status)}`);
      warn("live incident analysis", `unable to analyze incident: ${incident.response.status} ${incident.body?.error ?? ""}`);
      return {
        status: "needs-live-evidence",
        apiUrl,
        missingEvidence: liveGaps,
        selectedPod: {
          namespace: selectedPod.metadata.namespace,
          name: selectedPod.metadata.name
        },
        incident: undefined
      };
    }

    const body = incident.body;
    const proposal = remediationProposal(body);
    const trigger = triggerEvidence(body);
    const metricNames = body?.metrics?.queries?.map?.((query) => query.name) ?? [];
    const payloadText = jsonText(body);

    expectCheck(
      "incident action boundary",
      body.actionMode === "planOnly" &&
        body.policy?.planOnly === true &&
        body.policy?.mutationAllowed === false &&
        body.policy?.rawDocumentReturned === false,
      "incident response is planOnly/readOnly and raw document return is blocked",
      "incident response did not preserve planOnly/readOnly policy"
    );
    expectLive(
      "log evidence",
      body.podLogs?.pod === selectedPod.metadata.name &&
        body.podLogs?.namespace === selectedPod.metadata.namespace &&
        body.podLogs?.sinceSeconds === 600 &&
        body.podLogs?.redacted === true &&
        typeof body.podLogs?.logs === "string" &&
        body.podLogs?.accessEvidence?.join(" ").includes("SelfSubjectAccessReview"),
      "current pod logs were read for the last 10 minutes with SSAR evidence",
      "current pod logs were not available with expected SSAR evidence",
      liveGaps
    );
    expectLive(
      "event evidence",
      body.events?.redacted === true &&
        body.events?.accessEvidence?.join(" ").includes("SelfSubjectAccessReview"),
      "events were listed and redacted with SSAR evidence",
      "events were not available with expected SSAR evidence",
      liveGaps
    );
    expectCheck(
      "metric correlation contract",
      body.metrics?.windowMinutes === 10 &&
        body.metrics?.redacted === true &&
        hasAll(metricNames, ["firing-alert", "pod-restarts", "pod-cpu", "pod-memory"]) &&
        body.policy?.monitoringProxyEnabled === body.metrics?.enabled,
      "metric block includes alert, restart, CPU, and memory Prometheus queries",
      "metric block did not include the expected query names or policy mirror"
    );
    if (body.metrics?.enabled && body.metrics?.reachable) {
      expectLive(
        "live metric evidence",
        body.metrics?.evidence?.join(" ").includes("Prometheus"),
        "Prometheus evidence is reachable through the OCP service proxy",
        "monitoring proxy was enabled but Prometheus evidence was not present",
        liveGaps
      );
    } else {
      expectLive(
        "explicit metric missing evidence",
        body.missingEvidence?.join(" ").includes("metrics/"),
        "monitoring gap is explicit in missingEvidence",
        "monitoring was disabled or unreachable but missingEvidence did not name metrics/",
        liveGaps
      );
    }
    expectCheck(
      "RAG answer policy",
      body.analysis?.policy?.rawDocumentReturned === false &&
        body.analysis?.policy?.mutationAllowed === false &&
        (body.analysis?.citations?.some?.((citation) => citation.sourceType === "customer-runbook") ?? false),
      "incident analysis uses private runbook citations without raw documents or mutation",
      "incident analysis did not carry private runbook citations and safe policy"
    );
    expectCheck(
      "plan-only remediation proposal",
      proposal?.artifactType === "opslens.remediation.proposal.v0.1" &&
        proposal?.actionMode === "planOnly" &&
        proposal?.mutationAllowed === false &&
        proposal?.patchType === "strategicMerge" &&
        proposal?.proposedValue?.value === "4Gi" &&
        proposal?.yamlPatch?.includes("memory: 4Gi") &&
        JSON.stringify(proposal?.forbiddenActions ?? []).includes("apply") &&
        proposal?.reviewGate?.required === true,
      "remediation proposal is a non-mutating YAML review artifact",
      "remediation proposal safety or YAML contract was incomplete"
    );
    expectLive(
      "remediation trigger evidence",
      trigger?.logs?.currentRead === true &&
        trigger?.logs?.sinceSeconds === 600 &&
        trigger?.events?.read === true &&
        trigger?.metrics?.windowMinutes === 10 &&
        hasAll(trigger?.metrics?.queries?.map?.((query) => query.name) ?? [], [
          "firing-alert",
          "pod-restarts",
          "pod-cpu",
          "pod-memory"
        ]) &&
        (trigger?.runbookCitations?.length ?? 0) > 0,
      "YAML proposal records log, event, metric, and runbook trigger evidence",
      "YAML proposal triggerEvidence was incomplete",
      liveGaps
    );
    expectCheck(
      "secret redaction",
      !payloadText.includes("demo-secret") && payloadText.includes("<REDACTED>"),
      "secret-like prompt text was redacted from response payload",
      "secret-like prompt text was not redacted from response payload"
    );

    return {
      status: liveGaps.length > 0 ? "needs-live-evidence" : "pass",
      apiUrl,
      missingEvidence: liveGaps,
      selectedPod: {
        namespace: selectedPod.metadata.namespace,
        name: selectedPod.metadata.name
      },
      incident: {
        requestId: body.requestId,
        actionMode: body.actionMode,
        timeWindowMinutes: body.timeWindow?.minutes,
        ocpReads: body.audit?.ocpReads ?? [],
        missingEvidence: body.missingEvidence ?? [],
        metricQueries: body.metrics?.queries?.map((query) => ({
          name: query.name,
          enabled: query.enabled,
          reachable: query.reachable,
          sampleCount: query.sample?.length ?? 0,
          error: sanitize(query.error ?? "")
        })) ?? [],
        remediationProposal: {
          artifactType: proposal?.artifactType,
          actionMode: proposal?.actionMode,
          mutationAllowed: proposal?.mutationAllowed,
          patchType: proposal?.patchType,
          target: proposal?.target,
          currentValue: proposal?.currentValue,
          proposedValue: proposal?.proposedValue,
          triggerEvidence: proposal?.triggerEvidence,
          forbiddenActions: proposal?.forbiddenActions,
          reviewGate: proposal?.reviewGate
        }
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    liveGaps.push(`live smoke: ${sanitize(message)}`);
    warn("live incident smoke", message);
    return {
      status: "needs-live-evidence",
      apiUrl,
      missingEvidence: liveGaps,
      selectedPod: undefined,
      incident: undefined
    };
  } finally {
    killProcessTree(apiProcess.child);
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
  const worktreeDirty = worktreeStatus.length > 0;

  assertStaticContracts();

  const liveSmoke = options.skipLive
    ? {
        status: "skipped",
        missingEvidence: ["live incident API smoke was skipped with --skip-live"],
        selectedPod: undefined,
        incident: undefined
      }
    : await runLiveSmoke();

  if (options.skipLive) {
    warn("live incident smoke", "skipped with --skip-live");
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const status = failures.length > 0
    ? "FAIL"
    : liveSmoke.status === "pass"
      ? "PASS"
      : "NEEDS_LIVE_EVIDENCE";
  const missingEvidence = [
    ...(liveSmoke.missingEvidence ?? []),
    ...(worktreeDirty ? ["worktree was dirty when evidence was generated"] : [])
  ].map(sanitize);

  const artifact = {
    schema: "cywell.opslens.aiops-incident-pipeline.v0.1",
    artifactType: "opslens.aiops-incident-pipeline.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnlyEvidenceOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    acceptance: ["AC-AIOPS-001", "AC-AIOPS-002", "AC-DASH-001"],
    pipeline: {
      logWindowMinutes: 10,
      sinceSeconds: 600,
      requiredMetricQueries: ["firing-alert", "pod-restarts", "pod-cpu", "pod-memory"],
      remediationArtifactType: "opslens.remediation.proposal.v0.1",
      forbiddenActions: ["apply", "delete", "scale"],
      triggerEvidenceRequired: ["alert", "logs", "events", "metrics", "runbookCitations"]
    },
    liveSmoke,
    evidence: [
      "incident analyzer uses read-only OCP resource, pod log, event, and Prometheus query paths",
      "incident response keeps actionMode=planOnly and policy.mutationAllowed=false",
      "remediationProposal.triggerEvidence ties the YAML proposal to alert/log/event/metric/runbook inputs",
      "missing metric evidence remains explicit when the monitoring proxy is disabled or unreachable",
      "this verifier starts a local API process and uses public HTTP endpoints; it does not apply, delete, scale, patch, push, mirror, sign, or write vectors"
    ],
    missingEvidence,
    risk: [
      "PASS proves the current configured OCP target can produce a plan-only incident packet from read-only evidence; it still does not approve remediation execution.",
      "NEEDS_LIVE_EVIDENCE means static contracts exist, but live OCP reads, events, logs, metrics, or triggerEvidence were not fully proven from this environment.",
      "Metric gaps must stay visible as missingEvidence rather than being converted into confident recommendations."
    ],
    rollbackPath: [
      "No cluster rollback is required because this verifier performs read-only API calls only.",
      "If live incident evidence is noisy, set OCP_ENABLE_MONITORING_PROXY=false to keep Prometheus gaps explicit while preserving log/event analysis.",
      "If the YAML proposal is unsafe or unsupported by evidence, remove the proposal from the response path and rerun verify:aiops plus AC-AIOPS Playwright tests."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (/demo-secret/i.test(serialized) || /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized)) {
    throw new Error("AI Ops incident evidence would include unredacted secret material");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("AI Ops incident evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens AI Ops incident pipeline: status=${status}, ${failures.length} fail, ${checks.filter((check) => check.status === "WARN").length} warn, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("AI Ops incident verifier", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] AI Ops incident verifier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
