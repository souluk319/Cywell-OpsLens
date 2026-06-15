#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import {
  sanitizeConfiguredEndpoints,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-aiops-incident-pipeline.json",
  incidentsSource: "apps/api/src/incidents.ts",
  serverSource: "apps/api/src/server.ts",
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
  serverSource: parsed.values.get("server-source") ?? defaults.serverSource,
  apiSource: parsed.values.get("api-source") ?? defaults.apiSource,
  contractSource: parsed.values.get("contract-source") ?? defaults.contractSource,
  e2eSource: parsed.values.get("e2e-source") ?? defaults.e2eSource,
  acceptanceSource: parsed.values.get("acceptance-source") ?? defaults.acceptanceSource,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  liveTimeoutMs: Number(parsed.values.get("live-timeout-ms") ?? defaults.liveTimeoutMs),
  skipLive: parsed.flags.has("skip-live")
};

function sanitize(value) {
  return sanitizeConfiguredEndpoints(String(value ?? ""))
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(
      /(https?:\/\/)(?:api|console|oauth)[^/\s"]*(?:ocp|openshift)[^/\s"]*/gi,
      "$1<redacted-ocp-api>"
    )
    .replace(
      /(https?:\/\/)(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(:\d+)?/g,
      "$1<redacted-private-ip>$2"
    )
    .replace(
      /\b(?:api|console|oauth)[A-Za-z0-9.-]*(?:ocp|openshift)[A-Za-z0-9.-]*\b/gi,
      "<redacted-ocp-api>"
    )
    .replace(
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
      "<redacted-private-ip>"
    )
    .replace(/demo-secret/gi, "<redacted>");
}

function endpointLeakLike(value) {
  return sensitiveEndpointLeakLike(value) ||
    /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/.test(value) ||
    /\b(?:api|console|oauth)[A-Za-z0-9.-]*(?:ocp|openshift)[A-Za-z0-9.-]*\b/i.test(value);
}

function sanitizeArtifact(value) {
  if (typeof value === "string") return sanitize(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeArtifact(nestedValue)])
    );
  }
  return value;
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

function aiopsMonitoringProxyTicketPacket(liveSmoke) {
  const requiredQueries = ["firing-alert", "pod-restarts", "pod-cpu", "pod-memory"];
  const liveQueries = liveSmoke?.incident?.metricQueries ?? [];
  const queryByName = new Map(liveQueries.map((query) => [query.name, query]));
  const readyQueries = requiredQueries.filter((name) => {
    const query = queryByName.get(name);
    return query?.enabled === true &&
      query?.reachable === true &&
      Number(query?.sampleCount ?? 0) > 0;
  });
  const missingQueries = requiredQueries.filter((name) => !readyQueries.includes(name));
  const missingEvidence = [
    ...(liveSmoke?.missingEvidence ?? []),
    ...(liveSmoke?.incident?.missingEvidence ?? []),
    ...(liveSmoke?.alertmanagerIntake?.missingEvidence ?? []),
    ...liveQueries
      .filter((query) => requiredQueries.includes(query.name))
      .filter((query) => query.enabled !== true || query.reachable !== true)
      .map((query) => `metrics/${query.name}: ${query.error ?? "monitoring proxy query evidence is missing"}`)
  ].map(sanitize);
  const monitoringGaps = [...new Set(
    missingEvidence.filter((entry) =>
      /metrics\/|Prometheus|Monitoring service proxy|OCP_ENABLE_MONITORING_PROXY|monitoring proxy/i.test(entry)
    )
  )];
  const sampleCount = liveQueries
    .filter((query) => requiredQueries.includes(query.name))
    .reduce((total, query) => total + Number(query.sampleCount ?? 0), 0);
  const disabled = monitoringGaps.some((entry) =>
    /Monitoring service proxy is disabled|OCP_ENABLE_MONITORING_PROXY=true/i.test(entry)
  );
  const handoffStatus = missingQueries.length === 0
    ? "ready"
    : monitoringGaps.length > 0
      ? "needs-approval"
      : "needs-evidence";
  const classification = disabled
    ? "monitoring-proxy-disabled"
    : missingQueries.length > 0
      ? "monitoring-query-evidence-missing"
      : "monitoring-proxy-ready";
  return {
    id: "cluster-sre-monitoring-proxy-ticket",
    owner: "cluster-sre",
    title: "AI Ops monitoring proxy evidence handoff",
    severity: "high",
    classification,
    handoffStatus,
    requiredQueries,
    readyQueries,
    missingQueries,
    sampleCount,
    evidenceChecklist: [
      ...monitoringGaps.slice(0, 6),
      "Cluster SRE approval is required before enabling the monitoring proxy path.",
      "After approval, rerun verify:aiops and keep alert/log/event/runbook evidence intact."
    ].map(sanitize),
    firstReadOnlyAction: {
      id: "aiops-monitoring-proxy-smoke",
      status: missingQueries.length > 0 ? "needs-evidence" : "ready",
      nextCommand: "npm run verify:aiops",
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: "approval-gated-enable-monitoring-proxy-path",
      status: handoffStatus === "ready" ? "not-required" : "approval-gated",
      nextCommand:
        "Set OCP_ENABLE_MONITORING_PROXY=true only for an approved read-only service proxy path, then run npm run verify:aiops",
      mutation: false,
      requiresExplicitApproval: true
    },
    nextCommands: [
      "npm run verify:aiops",
      "Set OCP_ENABLE_MONITORING_PROXY=true only after Cluster SRE approves the read-only monitoring proxy path"
    ],
    blockedBy: monitoringGaps.length > 0
      ? monitoringGaps
      : missingQueries.map((name) => `metrics/${name}: monitoring proxy sample evidence is missing`),
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false,
      monitoringProxyEnableRequiresApproval: true
    },
    risk:
      "Metric correlation remains incomplete until Cluster SRE approves and refreshes read-only monitoring proxy evidence.",
    rollbackPath:
      "Unset OCP_ENABLE_MONITORING_PROXY or keep it false to return to log/event/runbook-only incident analysis."
  };
}

function assertStaticContracts() {
  const incidentsText = readText(options.incidentsSource);
  const serverText = readText(options.serverSource);
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
    "Alertmanager webhook intake contract",
    incidentsText.includes("intakeOpsLensAlertmanagerIncidents") &&
      incidentsText.includes("Alertmanager webhook payload was normalized") &&
      serverText.includes("/api/opslens/incidents/alertmanager") &&
      contractText.includes("OpsLensAlertmanagerWebhookPayload") &&
      contractText.includes("opslens.alertmanager-incident-intake.v0.1"),
    "Alertmanager webhook route normalizes alerts into the plan-only incident analyzer",
    "Alertmanager webhook intake route, type contract, or analyzer bridge is missing"
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
      e2eText.includes("/api/opslens/incidents/alertmanager") &&
      e2eText.includes("triggerEvidence") &&
      e2eText.includes("body.metrics?.windowMinutes") &&
      e2eText.includes("pod-restarts"),
    "Playwright acceptance asserts incident packet and metric correlation"
  );
  expectCheck(
    "acceptance documents triggerEvidence",
    acceptanceText.includes("remediationProposal.triggerEvidence") &&
      acceptanceText.includes("/api/opslens/incidents/alertmanager") &&
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

    const alertmanager = await postJson(
      apiUrl,
      "/api/opslens/incidents/alertmanager",
      {
        receiver: "cywell-opslens",
        status: "firing",
        groupLabels: {
          alertname: "PodCrashLooping"
        },
        commonLabels: {
          cluster: "prod-ocp",
          tenant: "cywell-payments",
          namespace: selectedPod.metadata.namespace,
          severity: "warning"
        },
        commonAnnotations: {
          summary:
            "Alertmanager webhook smoke should become a plan-only OpsLens packet. password=demo-secret"
        },
        alerts: [
          {
            status: "firing",
            labels: {
              alertname: "PodCrashLooping",
              namespace: selectedPod.metadata.namespace,
              pod: selectedPod.metadata.name,
              workload: selectedPod.metadata.name,
              severity: "warning",
              "app.kubernetes.io/name": "payments-api"
            },
            annotations: {
              description:
                "Pod is restarting; collect logs, events, metrics, and citations without mutation. token=demo-secret"
            },
            startsAt: new Date().toISOString(),
            fingerprint: "verify-aiops-alertmanager"
          }
        ]
      }
    );

    if (!alertmanager.response.ok) {
      fail(
        "Alertmanager webhook endpoint",
        `unable to intake Alertmanager webhook: ${alertmanager.response.status} ${alertmanager.body?.error ?? ""}`
      );
    }

    const intakeBody = alertmanager.body;
    const intakeIncident = intakeBody?.incidents?.[0];
    const intakeText = jsonText(intakeBody);
    expectCheck(
      "Alertmanager webhook action boundary",
      alertmanager.response.ok &&
        intakeBody?.artifactType === "opslens.alertmanager-incident-intake.v0.1" &&
        intakeBody?.actionMode === "planOnly" &&
        intakeBody?.policy?.mutationAllowed === false &&
        intakeBody?.policy?.rawAlertReturned === false &&
        intakeBody?.rawAlertReturned === false &&
        intakeBody?.clusterMutationAttempted === false &&
        intakeBody?.alertCount === 1 &&
        intakeBody?.acceptedCount === 1,
      "Alertmanager webhook endpoint returns a plan-only intake artifact without raw alert payload",
      "Alertmanager webhook endpoint did not preserve the plan-only no-raw-alert contract"
    );
    expectLive(
      "Alertmanager incident evidence",
      intakeIncident?.actionMode === "planOnly" &&
        intakeIncident?.podLogs?.pod === selectedPod.metadata.name &&
        intakeIncident?.podLogs?.sinceSeconds === 600 &&
        intakeIncident?.analysis?.remediationProposal?.mutationAllowed === false,
      "Alertmanager alert was normalized into the read-only incident analyzer",
      "Alertmanager alert did not produce the expected incident evidence",
      liveGaps
    );
    expectCheck(
      "Alertmanager payload redaction",
      !intakeText.includes("demo-secret") &&
        intakeText.includes("<REDACTED>") &&
        intakeBody?.audit?.source === "alertmanager-webhook",
      "Alertmanager secret-like annotations were redacted and source audit was recorded",
      "Alertmanager intake returned unredacted secret material or lost source audit"
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
      },
      alertmanagerIntake: {
        artifactType: intakeBody?.artifactType,
        actionMode: intakeBody?.actionMode,
        alertCount: intakeBody?.alertCount,
        acceptedCount: intakeBody?.acceptedCount,
        rawAlertReturned: intakeBody?.rawAlertReturned,
        mutationAllowed: intakeBody?.mutationAllowed,
        clusterMutationAttempted: intakeBody?.clusterMutationAttempted,
        incidentRequestIds: intakeBody?.audit?.incidentRequestIds ?? [],
        missingEvidence: intakeBody?.missingEvidence ?? []
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
  const monitoringProxyTicketPacket = aiopsMonitoringProxyTicketPacket(liveSmoke);
  expectCheck(
    "AI Ops monitoring proxy ticket boundary",
    monitoringProxyTicketPacket.firstReadOnlyAction.mutation === false &&
      monitoringProxyTicketPacket.firstReadOnlyAction.requiresExplicitApproval === false &&
      monitoringProxyTicketPacket.approvalGatedAction.mutation === false &&
      monitoringProxyTicketPacket.approvalGatedAction.requiresExplicitApproval === true &&
      monitoringProxyTicketPacket.mutationBoundary.clusterMutationAttempted === false &&
      monitoringProxyTicketPacket.mutationBoundary.vectorWriteAttempted === false &&
      monitoringProxyTicketPacket.mutationBoundary.ingestionJobCreated === false &&
      monitoringProxyTicketPacket.mutationBoundary.mutationAllowedByThisVerifier === false,
    `ticket=${monitoringProxyTicketPacket.id} first=${monitoringProxyTicketPacket.firstReadOnlyAction.id} approval=${monitoringProxyTicketPacket.approvalGatedAction.id}`,
    "AI Ops monitoring proxy ticket must separate read-only smoke from approval-gated proxy enablement"
  );
  const finalFailures = checks.filter((check) => check.status === "FAIL");
  const finalStatus = finalFailures.length > 0
    ? "FAIL"
    : status;

  const artifact = {
    schema: "cywell.opslens.aiops-incident-pipeline.v0.1",
    artifactType: "opslens.aiops-incident-pipeline.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: finalStatus,
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
      incidentAnalyzePath: "/api/opslens/incidents/analyze",
      alertmanagerWebhookPath: "/api/opslens/incidents/alertmanager",
      alertmanagerArtifactType: "opslens.alertmanager-incident-intake.v0.1",
      logWindowMinutes: 10,
      sinceSeconds: 600,
      requiredMetricQueries: ["firing-alert", "pod-restarts", "pod-cpu", "pod-memory"],
      remediationArtifactType: "opslens.remediation.proposal.v0.1",
      forbiddenActions: ["apply", "delete", "scale"],
      triggerEvidenceRequired: ["alert", "logs", "events", "metrics", "runbookCitations"]
    },
    liveSmoke,
    monitoringProxyTicketPacket,
    evidence: [
      "incident analyzer uses read-only OCP resource, pod log, event, and Prometheus query paths",
      "Alertmanager webhook intake normalizes alerts into the same plan-only incident analyzer",
      "Alertmanager raw payload is not returned and secret-like annotations are redacted",
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

  const sanitizedArtifact = sanitizeArtifact(artifact);
  const serialized = `${JSON.stringify(sanitizedArtifact, null, 2)}\n`;
  if (/demo-secret/i.test(serialized) || /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized)) {
    throw new Error("AI Ops incident evidence would include unredacted secret material");
  }
  if (endpointLeakLike(serialized)) {
    throw new Error("AI Ops incident evidence would include an unredacted OCP endpoint or private IP");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("AI Ops incident evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens AI Ops incident pipeline: status=${finalStatus}, ${finalFailures.length} fail, ${checks.filter((check) => check.status === "WARN").length} warn, ${checks.length} checks`
  );

  if (finalFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("AI Ops incident verifier", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] AI Ops incident verifier: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
