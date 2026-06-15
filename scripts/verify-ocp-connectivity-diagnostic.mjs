#!/usr/bin/env node
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tcpConnect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  authRecoveryMarkdownOut: "test-results/cywell-opslens-ocp-auth-recovery.md",
  timeoutMs: 15000
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
  authRecoveryMarkdownOut:
    parsed.get("auth-recovery-markdown-out") ?? defaults.authRecoveryMarkdownOut,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();
let loadedEnv = false;

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail: sanitize(detail), ...extra });
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
    if (existsSync(candidate)) return candidate;
    if (current === root) return undefined;
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
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  loadedEnv = true;
}

function firstEnv(...keys) {
  loadEnvFile();
  for (const key of keys) {
    if (process.env[key] !== undefined) {
      return { key, value: process.env[key] };
    }
  }
  return undefined;
}

function boolFromEnv(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function secondsFromEnv(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : defaultValue;
}

function readKubeconfigServers() {
  const kubeconfig = process.env.KUBECONFIG ?? join(homedir(), ".kube", "config");
  const paths = kubeconfig.split(process.platform === "win32" ? ";" : ":");
  const servers = [];
  for (const path of paths) {
    if (!path || !existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/server:\s*(https?:\/\/\S+)/g)) {
      servers.push(match[1].trim());
    }
  }
  return servers;
}

function readKubeconfigTokens() {
  const kubeconfig = process.env.KUBECONFIG ?? join(homedir(), ".kube", "config");
  const paths = kubeconfig.split(process.platform === "win32" ? ";" : ":");
  const tokens = [];
  for (const path of paths) {
    if (!path || !existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const match of content.matchAll(/token:\s*("?)([^"\r\n]+)\1/g)) {
      tokens.push(match[2].trim());
    }
  }
  return tokens;
}

function ocpConfig() {
  loadEnvFile();
  const explicitBase = firstEnv(
    "OCP_API_BASE_URL",
    "OPENSHIFT_API_BASE_URL",
    "KUBE_API_BASE_URL"
  );
  const explicitToken = firstEnv(
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN"
  );
  const explicitTlsVerify = firstEnv(
    "OCP_TLS_VERIFY",
    "OPENSHIFT_API_TLS_VERIFY",
    "KUBE_TLS_VERIFY"
  );
  const insecureSkip = firstEnv(
    "OCP_INSECURE_SKIP_TLS_VERIFY",
    "OPENSHIFT_API_INSECURE_SKIP_TLS_VERIFY",
    "KUBE_INSECURE_SKIP_TLS_VERIFY"
  );
  const timeout = firstEnv(
    "OCP_API_TIMEOUT_SECONDS",
    "OPENSHIFT_API_TIMEOUT_SECONDS",
    "KUBE_API_TIMEOUT_SECONDS"
  );
  const kubeconfigServers = readKubeconfigServers();
  const kubeconfigTokens = readKubeconfigTokens();
  const tlsVerify = explicitTlsVerify
    ? boolFromEnv(explicitTlsVerify.value, true)
    : insecureSkip
      ? !boolFromEnv(insecureSkip.value, false)
      : true;
  const timeoutMs = secondsFromEnv(timeout?.value, options.timeoutMs / 1000) * 1000;

  return {
    baseUrl: explicitBase?.value ?? kubeconfigServers[0],
    baseUrlSource: explicitBase?.key ?? (kubeconfigServers[0] ? "kubeconfig" : "missing"),
    baseUrlCandidateCount: (explicitBase ? 1 : 0) + kubeconfigServers.length,
    token: explicitToken?.value ?? kubeconfigTokens[0],
    tokenSource: explicitToken?.key ?? (kubeconfigTokens[0] ? "kubeconfig" : "missing"),
    tokenCandidateCount: (explicitToken ? 1 : 0) + kubeconfigTokens.length,
    tlsVerify,
    tlsVerifySource: explicitTlsVerify?.key ?? insecureSkip?.key ?? "default",
    timeoutMs
  };
}

function credentialHygiene(config) {
  const token = config.token ?? "";
  const tokenConfigured = token.length > 0;
  const tokenLooksPlaceholder =
    /<|>|changeme|example/i.test(token) || token.toLowerCase() === "token";
  const tokenHasWhitespace = /\s/.test(token);
  const tokenStartsWithBearer = /^Bearer\s+/i.test(token);
  const tokenLooksOpenShiftSha = token.startsWith("sha256~");
  const tokenLengthClass = !tokenConfigured
    ? "missing"
    : token.length < 16
      ? "short"
      : token.length <= 256
        ? "expected"
        : "long";
  const localFormatIssue =
    !tokenConfigured ||
    tokenLooksPlaceholder ||
    tokenHasWhitespace ||
    tokenStartsWithBearer ||
    tokenLengthClass === "short";

  return {
    tokenConfigured,
    tokenSource: config.tokenSource,
    tokenCandidateCount: config.tokenCandidateCount,
    tokenLengthClass,
    tokenLooksPlaceholder,
    tokenHasWhitespace,
    tokenStartsWithBearer,
    tokenLooksOpenShiftSha,
    localFormatIssue,
    credentialStoredByVerifier: false,
    tokenValueRedacted: true
  };
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "CYWELL_OPSLENS_API_KEY",
    "CYWELL_OPSLENS_BEARER_TOKEN"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

function sensitiveEndpointValues() {
  const values = [
    "OCP_API_BASE_URL",
    "OPENSHIFT_API_BASE_URL",
    "KUBE_API_BASE_URL"
  ]
    .map((key) => process.env[key])
    .filter(Boolean);
  return [
    ...values,
    ...values.flatMap((value) => {
      try {
        const url = new URL(value);
        return [url.hostname, url.host];
      } catch {
        return [];
      }
    })
  ].filter((value) => value && value.length >= 4);
}

function sanitize(value) {
  let result = String(value ?? "");
  for (const secret of secretValuesForLeakCheck()) {
    result = result.split(secret).join("<redacted>");
  }
  for (const endpoint of sensitiveEndpointValues()) {
    result = result.split(endpoint).join("<redacted-ocp-api>");
  }
  return result
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/\b10(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>")
    .replace(/\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>")
    .replace(/\b192\.168(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>");
}

function endpointLeakLike(value) {
  return /\b10(?:\.\d{1,3}){3}\b/.test(value) ||
    /\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b192\.168(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/i.test(value);
}

function endpointFromBaseUrl(baseUrl) {
  if (!baseUrl) return undefined;
  try {
    const url = new URL(baseUrl);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const redactedPort = url.port || (url.protocol === "https:" ? "443" : "80");
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port,
      redactedBaseUrl: `${url.protocol}//<redacted-ocp-api>:${redactedPort}`
    };
  } catch {
    return undefined;
  }
}

function redactedEndpointLabel(endpoint) {
  if (!endpoint) return "<missing-ocp-api>";
  return `${endpoint.protocol}//<redacted-ocp-api>:${endpoint.port}`;
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCapture(command, args, timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs
    });
    return { ok: true, stdout: sanitize(stdout.trim()), stderr: sanitize(stderr.trim()) };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args, options.timeoutMs);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"], options.timeoutMs);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function diagnoseDns(endpoint, timeoutMs) {
  if (!endpoint) return { status: "skipped", addresses: [] };
  try {
    const results = await withTimeout(
      lookup(endpoint.hostname, { all: true }),
      timeoutMs,
      `DNS lookup timed out after ${timeoutMs}ms`
    );
    const addresses = results.map((item) => item.address);
    pass("DNS lookup", `${redactedEndpointLabel(endpoint)} resolved to ${addresses.length} address(es)`);
    return {
      status: "pass",
      addresses: addresses.map(() => "<redacted-private-ip>"),
      addressCount: addresses.length
    };
  } catch (error) {
    warn("DNS lookup", `${redactedEndpointLabel(endpoint)} unresolved: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "needs-evidence",
      addresses: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function diagnoseTcp(endpoint, timeoutMs) {
  if (!endpoint) return { status: "skipped" };
  return await new Promise((resolvePromise) => {
    const started = Date.now();
    const socket = tcpConnect({
      host: endpoint.hostname,
      port: endpoint.port
    });
    let settled = false;
    function settle(result) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise({ durationMs: Date.now() - started, ...result });
    }
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      pass("TCP connect", `${redactedEndpointLabel(endpoint)} connected in ${Date.now() - started}ms`);
      settle({ status: "pass" });
    });
    socket.once("timeout", () => {
      warn("TCP connect", `${redactedEndpointLabel(endpoint)} timed out after ${timeoutMs}ms`);
      settle({ status: "needs-evidence", error: "tcp-timeout" });
    });
    socket.once("error", (error) => {
      warn("TCP connect", `${redactedEndpointLabel(endpoint)} failed: ${error.message}`);
      settle({
        status: "needs-evidence",
        error: tcpErrorClassification(error)
      });
    });
  });
}

function tcpErrorClassification(error) {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    message.includes("etimedout") ||
    message.includes("timed out") ||
    message.includes("timeout")
  ) {
    return "tcp-timeout";
  }
  return String(error?.message ?? error ?? "tcp-unreachable");
}

async function diagnoseTls(endpoint, config, tcpResult, timeoutMs) {
  if (!endpoint || endpoint.protocol !== "https:") {
    return { status: "skipped", reason: "not-https" };
  }
  if (tcpResult.status !== "pass") {
    warn("TLS handshake", "skipped because TCP connect did not pass");
    return { status: "skipped", reason: "tcp-not-ready" };
  }
  return await new Promise((resolvePromise) => {
    const started = Date.now();
    const socket = tlsConnect({
      host: endpoint.hostname,
      port: endpoint.port,
      servername: endpoint.hostname,
      rejectUnauthorized: config.tlsVerify,
      timeout: timeoutMs
    });
    let settled = false;
    function settle(result) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise({ durationMs: Date.now() - started, ...result });
    }
    socket.once("secureConnect", () => {
      const detail = `authorized=${socket.authorized} protocol=${socket.getProtocol() ?? "unknown"} tlsVerify=${config.tlsVerify}`;
      pass("TLS handshake", detail);
      settle({
        status: "pass",
        authorized: socket.authorized,
        authorizationError: socket.authorizationError,
        protocol: socket.getProtocol()
      });
    });
    socket.once("timeout", () => {
      warn("TLS handshake", `timed out after ${timeoutMs}ms`);
      settle({ status: "needs-evidence", error: "tls-timeout" });
    });
    socket.once("error", (error) => {
      warn("TLS handshake", `failed: ${error.message}`);
      settle({ status: "needs-evidence", error: error.message });
    });
  });
}

async function diagnoseHttpVersion(endpoint, config, tcpResult, tlsResult, timeoutMs) {
  if (!endpoint) return { status: "skipped" };
  if (tcpResult.status !== "pass") {
    warn("Kubernetes /version GET", "skipped because TCP connect did not pass");
    return { status: "skipped", reason: "tcp-not-ready" };
  }
  if (endpoint.protocol === "https:" && tlsResult.status !== "pass") {
    warn("Kubernetes /version GET", "skipped because TLS handshake did not pass");
    return { status: "skipped", reason: "tls-not-ready" };
  }

  const requestFn = endpoint.protocol === "http:" ? httpRequest : httpsRequest;
  return await new Promise((resolvePromise) => {
    const started = Date.now();
    const request = requestFn(
      {
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: "/version",
        method: "GET",
        timeout: timeoutMs,
        rejectUnauthorized: config.tlsVerify,
        headers: config.token ? { Authorization: `Bearer ${config.token}` } : undefined
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 8192) body = body.slice(0, 8192);
        });
        response.on("end", () => {
          const durationMs = Date.now() - started;
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 200 && statusCode < 300) {
            let parsed;
            try {
              parsed = JSON.parse(body);
            } catch {
              parsed = {};
            }
            pass(
              "Kubernetes /version GET",
              `status=${statusCode} gitVersion=${parsed.gitVersion ?? "unknown"} duration=${durationMs}ms`
            );
            resolvePromise({
              status: "pass",
              statusCode,
              durationMs,
              gitVersion: parsed.gitVersion
            });
            return;
          }
          const classification = statusCode === 401
            ? "auth-failed"
            : statusCode === 403
              ? "auth-or-rbac"
              : "api-unhealthy";
          warn("Kubernetes /version GET", `status=${statusCode} classification=${classification}`);
          resolvePromise({ status: "needs-evidence", statusCode, durationMs, classification });
        });
      }
    );
    request.once("timeout", () => {
      request.destroy(new Error(`HTTP /version timed out after ${timeoutMs}ms`));
    });
    request.once("error", (error) => {
      warn("Kubernetes /version GET", `failed: ${error.message}`);
      resolvePromise({
        status: "needs-evidence",
        error: error.message,
        classification: "api-unreachable"
      });
    });
    request.end();
  });
}

function ocBaseArgs(config) {
  const args = [];
  if (config.baseUrl && config.token) {
    args.push("--server", config.baseUrl, "--token", config.token);
    if (!config.tlsVerify) {
      args.push("--insecure-skip-tls-verify=true");
    }
  }
  args.push(`--request-timeout=${Math.ceil(config.timeoutMs / 1000)}s`);
  return args;
}

async function diagnoseOc(config) {
  const client = await runCapture("oc", ["version", "--client=true"], config.timeoutMs);
  if (client.ok) {
    pass("oc client", client.stdout.split(/\r?\n/)[0] || "oc client available");
  } else {
    warn("oc client", client.stderr || "oc client unavailable");
  }

  const rawVersion = await runCapture("oc", [...ocBaseArgs(config), "get", "--raw=/version"], config.timeoutMs);
  if (rawVersion.ok) {
    pass("oc /version", rawVersion.stdout.slice(0, 160));
    return {
      clientAvailable: client.ok,
      versionGet: "pass"
    };
  }
  warn("oc /version", rawVersion.stderr || "oc get --raw=/version failed");
  return {
    clientAvailable: client.ok,
    versionGet: "needs-evidence",
    error: rawVersion.stderr || rawVersion.stdout
  };
}

async function diagnoseOcContext(config) {
  const kubeconfigEnvConfigured = Boolean(process.env.KUBECONFIG);
  const defaultKubeconfigPresent = existsSync(join(homedir(), ".kube", "config"));
  const context = await runCapture("oc", ["config", "current-context"], config.timeoutMs);
  const whoami = await runCapture("oc", ["whoami"], config.timeoutMs);
  const server = await runCapture("oc", ["whoami", "--show-server"], config.timeoutMs);
  const currentContextSet = context.ok && context.stdout.trim().length > 0;
  const whoamiAvailable = whoami.ok && whoami.stdout.trim().length > 0;
  const showServerAvailable = server.ok && server.stdout.trim().length > 0;

  if (currentContextSet) {
    pass("oc context", "current-context is set; value redacted");
  } else {
    warn("oc context", "current-context is missing or incomplete");
  }
  if (whoamiAvailable) {
    pass("oc whoami", "current oc context authenticated; user value redacted");
  } else {
    warn("oc whoami", "current oc context is not authenticated");
  }

  return {
    currentContextSet,
    whoamiAvailable,
    showServerAvailable,
    kubeconfigEnvConfigured,
    defaultKubeconfigPresent,
    contextStatus: currentContextSet ? "present" : "missing",
    authStatus: whoamiAvailable ? "authenticated" : "not-authenticated",
    serverStatus: showServerAvailable ? "available" : "missing"
  };
}

function skippedOc(reason) {
  warn("oc /version", `skipped because ${reason}`);
  return {
    clientAvailable: false,
    versionGet: "skipped",
    skipped: true,
    reason
  };
}

function rbacAccessReviewSpecs() {
  return [
    {
      id: "can-i-list-pods",
      verb: "list",
      resource: "pods",
      scope: "all-namespaces",
      args: ["auth", "can-i", "list", "pods", "-A"],
      required: true
    },
    {
      id: "can-i-get-pod-logs",
      verb: "get",
      resource: "pods/log",
      scope: "all-namespaces",
      args: ["auth", "can-i", "get", "pods/log", "-A"],
      required: true
    },
    {
      id: "can-i-list-events",
      verb: "list",
      resource: "events",
      scope: "all-namespaces",
      args: ["auth", "can-i", "list", "events", "-A"],
      required: true
    },
    {
      id: "can-i-get-olsconfigs",
      verb: "get",
      resource: "olsconfigs.ols.openshift.io",
      scope: "cluster",
      args: ["auth", "can-i", "get", "olsconfigs.ols.openshift.io", "-A"],
      required: true
    },
    {
      id: "can-i-get-crds",
      verb: "get",
      resource: "customresourcedefinitions.apiextensions.k8s.io",
      scope: "cluster",
      args: [
        "auth",
        "can-i",
        "get",
        "customresourcedefinitions.apiextensions.k8s.io",
        "-A"
      ],
      required: true
    },
    {
      id: "can-i-get-consoleplugins",
      verb: "get",
      resource: "consoleplugins.console.openshift.io",
      scope: "cluster",
      args: ["auth", "can-i", "get", "consoleplugins.console.openshift.io", "-A"],
      required: false
    }
  ];
}

function statusFromCanI(result) {
  const stdout = result.stdout.trim().toLowerCase();
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (result.ok && /^yes\b/.test(stdout)) return "allowed";
  if (/^no\b/.test(stdout) || combined.includes("forbidden")) return "denied";
  return "unknown";
}

function evidenceFromCanI(status, result) {
  if (status === "allowed") return "oc auth can-i returned yes";
  if (status === "denied") return "oc auth can-i returned no or forbidden";

  const combined = sanitize(`${result.stdout}\n${result.stderr}`);
  const lower = combined.toLowerCase();
  if (
    lower.includes("unauthorized") ||
    lower.includes("provide credentials") ||
    lower.includes("you must be logged in")
  ) {
    return "oc auth can-i could not authenticate with the configured credential";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "oc auth can-i timed out before returning yes/no";
  }
  if (lower.includes("certificate") || lower.includes("tls")) {
    return "oc auth can-i could not complete because TLS validation failed";
  }
  return combined.split(/\r?\n/).filter(Boolean).slice(0, 2).join("; ") ||
    "oc auth can-i did not return yes/no";
}

async function diagnoseRbacAccess(config) {
  const reviews = [];
  for (const spec of rbacAccessReviewSpecs()) {
    const result = await runCapture("oc", [...ocBaseArgs(config), ...spec.args], config.timeoutMs);
    const status = statusFromCanI(result);
    const evidence = evidenceFromCanI(status, result);
    const review = {
      id: spec.id,
      verb: spec.verb,
      resource: spec.resource,
      scope: spec.scope,
      status,
      required: spec.required,
      evidence,
      command: `oc ${spec.args.join(" ")}`
    };
    reviews.push(review);

    if (status === "allowed") {
      pass(`RBAC access ${spec.id}`, `${spec.verb} ${spec.resource} ${spec.scope}=allowed`);
    } else {
      warn(
        `RBAC access ${spec.id}`,
        `${spec.verb} ${spec.resource} ${spec.scope}=${status}; ${evidence}`
      );
    }
  }
  return {
    status: reviews.every((review) => !review.required || review.status === "allowed")
      ? "pass"
      : "needs-evidence",
    reviews
  };
}

function skippedRbacAccess(reason) {
  warn("RBAC access reviews", `skipped because ${reason}`);
  return {
    status: "needs-evidence",
    skipped: true,
    reason,
    reviews: rbacAccessReviewSpecs().map((spec) => ({
      id: spec.id,
      verb: spec.verb,
      resource: spec.resource,
      scope: spec.scope,
      status: "unknown",
      required: spec.required,
      evidence: `skipped because ${reason}`,
      command: `oc ${spec.args.join(" ")}`
    }))
  };
}

function classify({ config, endpoint, dnsResult, tcpResult, tlsResult, httpResult, ocResult }) {
  if (!config.baseUrl) return "not-configured";
  if (!endpoint) return "invalid-api-url";
  if (!config.token) return "token-missing";
  if (dnsResult.status !== "pass") return "dns-unresolved";
  if (tcpResult.status !== "pass") return tcpResult.error === "tcp-timeout" ? "tcp-timeout" : "tcp-unreachable";
  if (endpoint.protocol === "https:" && tlsResult.status !== "pass") return "tls-handshake-failed";
  if (httpResult.status === "pass" || ocResult.versionGet === "pass") return "api-ready";
  if (httpResult.classification) return httpResult.classification;
  return "api-unreachable";
}

function readOnlyTroubleshootingCommands(endpoint, dnsResult) {
  if (!endpoint) return [];
  const firstAddress = dnsResult.addresses?.[0];
  const target = firstAddress ? "<redacted-private-ip>" : "<redacted-ocp-api>";
  const host = "<redacted-ocp-api>";
  const port = endpoint.port;

  return [
    {
      id: "windows-test-netconnection",
      command: `powershell -NoProfile -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Detailed"`,
      purpose: "Confirm whether Windows can open a TCP session to the OpenShift API port.",
      phase: "local-network-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "windows-resolve-dns",
      command: `powershell -NoProfile -Command "Resolve-DnsName ${host}"`,
      purpose: "Confirm the resolver returns the expected company OCP API address.",
      phase: "local-network-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "windows-route-print",
      command: `route print ${target}`,
      purpose: "Inspect the local route selected for the resolved OpenShift API address.",
      phase: "local-network-read-only",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "windows-tracert",
      command: `tracert -d ${target}`,
      purpose: "Trace the network path without DNS expansion to identify VPN, gateway, or firewall drops.",
      phase: "local-network-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    },
    {
      id: "oc-server-version-read",
      command: "oc get --raw=/version",
      purpose: "Confirm the Kubernetes /version read once TCP reachability is restored.",
      phase: "oc-read-only",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: false
    }
  ];
}

function actionHintsForClassification(classification, troubleshootingCommands = [], hygiene) {
  const boundedConnectivityCheck = "npm run verify:ocp:connectivity -- --timeout-ms 30000";
  const tcpNextCheck =
    troubleshootingCommands.find((command) => command.id === "windows-test-netconnection")?.command ??
    `Test TCP reachability to the API host and port, then rerun ${boundedConnectivityCheck}.`;
  const common = [
    {
      id: "rerun-read-only-diagnostic",
      severity: "info",
      summary: `Rerun ${boundedConnectivityCheck} after the environment or network change.`,
      evidence: "The verifier performs DNS, TCP, TLS, /version, and oc raw reads only.",
      nextCheck: boundedConnectivityCheck
    }
  ];

  const classified = {
    "not-configured": [
      {
        id: "set-ocp-api-target",
        severity: "blocked",
        summary: "Set OCP_API_BASE_URL and OCP_API_TOKEN, or point KUBECONFIG at a usable cluster context.",
        evidence: "No OpenShift API endpoint was available to classify.",
        nextCheck: `npm run verify:env && ${boundedConnectivityCheck}`
      }
    ],
    "invalid-api-url": [
      {
        id: "fix-ocp-api-url",
        severity: "blocked",
        summary: "Use a full OpenShift API URL such as https://api.example:6443.",
        evidence: "The configured OCP API base URL could not be parsed.",
        nextCheck: boundedConnectivityCheck
      }
    ],
    "token-missing": [
      {
        id: "set-ocp-token",
        severity: "blocked",
        summary: "Set OCP_API_TOKEN or refresh kubeconfig credentials before live checks.",
        evidence: "Network checks are not trusted until authentication evidence is present.",
        nextCheck: "oc whoami --show-token"
      }
    ],
    "dns-unresolved": [
      {
        id: "check-dns-resolution",
        severity: "blocked",
        summary: "Check DNS, hosts file, VPN DNS suffixes, and split-horizon resolver settings.",
        evidence: "The API hostname did not resolve.",
        nextCheck: `Resolve the API host, then rerun ${boundedConnectivityCheck}.`
      }
    ],
    "tcp-timeout": [
      {
        id: "check-vpn-firewall-route",
        severity: "blocked",
        summary: "Check VPN, firewall, route table, bastion, and security group access to the API port.",
        evidence: "DNS resolved, but TCP connect to the OpenShift API port timed out.",
        nextCheck: tcpNextCheck
      },
      {
        id: "confirm-company-network-path",
        severity: "warning",
        summary: "Confirm the MacBook/local network is allowed to reach the company OCP API endpoint.",
        evidence: "A timeout usually means packets are dropped before TLS or Kubernetes auth starts.",
        nextCheck: "After Test-NetConnection succeeds, rerun npm run verify:lightspeed and npm run verify:operator:dry-run."
      }
    ],
    "tcp-unreachable": [
      {
        id: "check-api-port-reachability",
        severity: "blocked",
        summary: "Check that the OpenShift API host and port are reachable from this machine.",
        evidence: "TCP connect failed before TLS or Kubernetes auth could be tested.",
        nextCheck: `Rerun ${boundedConnectivityCheck} after network reachability is restored.`
      }
    ],
    "tls-handshake-failed": [
      {
        id: "check-ocp-ca-and-tls",
        severity: "blocked",
        summary: "Check enterprise CA trust or set explicit OCP_TLS_VERIFY/OCP_INSECURE_SKIP_TLS_VERIFY values.",
        evidence: "TCP passed, but TLS handshake did not.",
        nextCheck: `Rerun ${boundedConnectivityCheck}; do not reuse Lightspeed TLS variables for OCP.`
      }
    ],
    "auth-failed": [
      {
        id: "refresh-ocp-token",
        severity: "blocked",
        summary: "Refresh OCP_API_TOKEN or kubeconfig credentials and confirm user access.",
        evidence: "The API was reachable but authentication or authorization failed.",
        nextCheck: `oc whoami && ${boundedConnectivityCheck}`
      },
      ...(hygiene?.localFormatIssue === false
        ? [
            {
              id: "credential-rejected-or-expired",
              severity: "blocked",
              summary: "The configured token shape looks usable locally, so treat the 401 as a rejected, expired, or wrong-cluster credential until proven otherwise.",
              evidence: "Credential hygiene found no placeholder, whitespace, Bearer prefix, or short-token issue; token value remains redacted.",
              nextCheck: "Refresh the OCP token from the target cluster, then rerun npm run verify:ocp:connectivity -- --timeout-ms 30000"
            }
          ]
        : [
            {
              id: "fix-local-token-format",
              severity: "blocked",
              summary: "Fix local token formatting before assuming the cluster rejected a valid credential.",
              evidence: "Credential hygiene detected a local token format issue without exposing the token value.",
              nextCheck: "Remove placeholders, whitespace, or a leading Bearer prefix, then rerun npm run verify:ocp:connectivity -- --timeout-ms 30000"
            }
          ])
    ],
    "auth-or-rbac": [
      {
        id: "refresh-ocp-token-or-rbac",
        severity: "blocked",
        summary: "Refresh the OCP API credential or grant the read-only RBAC needed for discovery.",
        evidence: "DNS, TCP, and TLS reached the API, but Kubernetes returned 403 or RBAC evidence stayed incomplete.",
        nextCheck: `oc whoami && oc auth can-i get crd olsconfigs.ols.openshift.io && ${boundedConnectivityCheck}`
      }
    ],
    "api-unreachable": [
      {
        id: "check-api-health",
        severity: "blocked",
        summary: "Check API server health, proxy settings, and network path after TCP/TLS diagnostics.",
        evidence: "The API did not return usable /version evidence.",
        nextCheck: boundedConnectivityCheck
      }
    ],
    "api-ready": [
      {
        id: "continue-live-readiness",
        severity: "info",
        summary: "OCP API connectivity is ready for read-only live checks.",
        evidence: "DNS, network, TLS, and Kubernetes API evidence are available.",
        nextCheck: "npm run verify:lightspeed && npm run verify:operator:dry-run"
      }
    ]
  };

  return [...(classified[classification] ?? classified["api-unreachable"]), ...common];
}

function authRecoveryForClassification(classification, hygiene, credentialDiagnosis, ocContext) {
  const requiresAuthRecovery = ["auth-failed", "auth-or-rbac", "token-missing"].includes(classification);
  const status = classification === "api-ready"
    ? "not-required"
    : requiresAuthRecovery
      ? "requires-credential-refresh"
      : "not-applicable";
  const readOnlyChecks = [
    {
      id: "verify-ocp-connectivity",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      purpose: "Reclassify OCP DNS, TCP, TLS, /version, oc context, and RBAC access without mutation.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "refresh-ocp-auth-rbac-plan",
      command: "npm run evidence:ocp-auth-rbac-plan",
      purpose: "Refresh the cluster-admin review packet after the credential or RBAC evidence changes.",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "verify-post-approval-live-reader-smoke",
      command: "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000",
      purpose: "Prove OCP and Lightspeed readiness after approved credential/RBAC handling.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    }
  ];

  return {
    status,
    owner: requiresAuthRecovery ? "cluster-admin" : "none",
    classification,
    credentialDiagnosis,
    ocContextStatus: ocContext.contextStatus,
    ocAuthenticationStatus: ocContext.authStatus,
    evidenceNeeded: requiresAuthRecovery
      ? [
          "Kubernetes /version returns 200 through the configured OCP credential.",
          "oc whoami succeeds for the target cluster without printing token values.",
          "Required oc auth can-i checks return yes or an explicit reviewed RBAC decision.",
          "Lightspeed readiness is rerun after OCP auth/RBAC evidence changes."
        ]
      : [],
    humanActions: requiresAuthRecovery
      ? [
          hygiene.localFormatIssue
            ? "Fix local OCP token formatting through approved secret handling before treating the cluster as rejecting a valid credential."
            : "Refresh the OCP API credential from the target cluster through approved secret handling.",
          "Confirm the refreshed credential belongs to the intended cluster and has the read-only discovery access needed by OpsLens.",
          "Do not paste token values into tickets, logs, markdown, shell history, or committed files."
        ]
      : [],
    nextCommands: readOnlyChecks.map((check) => check.command),
    readOnlyChecks,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      credentialStoredByVerifier: hygiene.credentialStoredByVerifier === true,
      tokenValueRedacted: hygiene.tokenValueRedacted !== false,
      credentialRefreshRequiresHumanApproval: requiresAuthRecovery
    }
  };
}

function authRecoveryMarkdown(artifact) {
  const recovery = artifact.authRecovery;
  const target = artifact.target ?? {};
  const lines = [
    "# Cywell OpsLens OCP Auth Recovery Packet",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Git: ${artifact.ref.branch} ${artifact.ref.headSha} dirty=${artifact.ref.worktreeDirty}`,
    `Status: ${artifact.status}`,
    `Classification: ${artifact.classification}`,
    "",
    "## Current Finding",
    "",
    `- Owner: ${recovery.owner}`,
    `- Recovery status: ${recovery.status}`,
    `- Credential diagnosis: ${recovery.credentialDiagnosis}`,
    `- Redacted target: ${target.redactedBaseUrl ?? "<redacted-ocp-api>"}`,
    `- Token configured: ${String(target.tokenConfigured === true)}`,
    `- Token source: ${artifact.credentialHygiene.tokenSource}`,
    `- Token length class: ${artifact.credentialHygiene.tokenLengthClass}`,
    `- Local format issue: ${String(artifact.credentialHygiene.localFormatIssue)}`,
    `- Token value redacted: ${String(recovery.mutationBoundary.tokenValueRedacted)}`,
    `- Credential stored by verifier: ${String(recovery.mutationBoundary.credentialStoredByVerifier)}`,
    `- oc context: ${recovery.ocContextStatus}`,
    `- oc auth: ${recovery.ocAuthenticationStatus}`,
    "",
    "## Evidence Needed",
    "",
    ...(recovery.evidenceNeeded.length
      ? recovery.evidenceNeeded.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Human Actions",
    "",
    ...(recovery.humanActions.length
      ? recovery.humanActions.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Read-only Follow-up Checks",
    "",
    ...recovery.readOnlyChecks.map(
      (check) =>
        `- ${check.id}: ${check.command} mutation=${String(check.mutation)} writesEvidence=${String(check.writesEvidence)}`
    ),
    "",
    "## Missing Evidence",
    "",
    ...(artifact.missingEvidence.length
      ? artifact.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Boundary",
    "",
    `- clusterMutationAttempted=${String(recovery.mutationBoundary.clusterMutationAttempted)}`,
    `- registryMutationAttempted=${String(recovery.mutationBoundary.registryMutationAttempted)}`,
    `- mutationAllowedByThisVerifier=${String(recovery.mutationBoundary.mutationAllowedByThisVerifier)}`,
    `- credentialRefreshRequiresHumanApproval=${String(recovery.mutationBoundary.credentialRefreshRequiresHumanApproval)}`,
    "- This packet does not create tokens, store credentials, apply RBAC, patch OLSConfig, install Operators, push images, mirror images, sign artifacts, delete, or scale.",
    "",
    "## Rollback Path",
    "",
    ...artifact.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const config = ocpConfig();
  const hygiene = credentialHygiene(config);
  const endpoint = endpointFromBaseUrl(config.baseUrl);
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  if (!config.baseUrl) {
    warn("OCP API config", "OCP API base URL is missing");
  } else if (!endpoint) {
    warn("OCP API config", "OCP API base URL is not a valid URL");
  } else {
    pass(
      "OCP API config",
      `baseUrl=${endpoint.redactedBaseUrl} source=${config.baseUrlSource} tokenConfigured=${Boolean(config.token)} tlsVerify=${config.tlsVerify}`
    );
  }
  if (!config.token) {
    warn("OCP API token", "token is missing; set OCP_API_TOKEN or kubeconfig user token");
  } else {
    pass("OCP API token", `token configured from ${config.tokenSource}; value is redacted`);
  }
  if (!hygiene.tokenConfigured) {
    warn("OCP API credential hygiene", "token is missing; value remains redacted");
  } else if (hygiene.localFormatIssue) {
    warn(
      "OCP API credential hygiene",
      `source=${hygiene.tokenSource} lengthClass=${hygiene.tokenLengthClass} placeholder=${hygiene.tokenLooksPlaceholder} whitespace=${hygiene.tokenHasWhitespace} bearerPrefix=${hygiene.tokenStartsWithBearer} value=redacted`
    );
  } else {
    pass(
      "OCP API credential hygiene",
      `source=${hygiene.tokenSource} lengthClass=${hygiene.tokenLengthClass} openshiftSha=${hygiene.tokenLooksOpenShiftSha} localFormatIssue=false value=redacted`
    );
  }

  const dnsResult = await diagnoseDns(endpoint, config.timeoutMs);
  const tcpResult = await diagnoseTcp(endpoint, config.timeoutMs);
  const tlsResult = await diagnoseTls(endpoint, config, tcpResult, config.timeoutMs);
  const httpResult = await diagnoseHttpVersion(endpoint, config, tcpResult, tlsResult, config.timeoutMs);
  const ocAndRbacSkipReason =
    tcpResult.status === "pass" ? undefined : "TCP connect did not pass";
  const ocResult = ocAndRbacSkipReason
    ? skippedOc(ocAndRbacSkipReason)
    : await diagnoseOc(config);
  const ocContextResult = await diagnoseOcContext(config);
  const rbacAccessResult = ocAndRbacSkipReason
    ? skippedRbacAccess(ocAndRbacSkipReason)
    : await diagnoseRbacAccess(config);
  const classification = classify({
    config,
    endpoint,
    dnsResult,
    tcpResult,
    tlsResult,
    httpResult,
    ocResult
  });
  const status = classification === "api-ready" && !worktreeDirty ? "PASS" : "NEEDS_EVIDENCE";

  const missingEvidence = [];
  if (classification !== "api-ready") {
    missingEvidence.push(`OCP API connectivity classification=${classification}`);
  }
  if (classification === "auth-failed" && !ocContextResult.whoamiAvailable) {
    missingEvidence.push("current oc context is not authenticated; no kubeconfig fallback credential is available");
  }
  for (const review of rbacAccessResult.reviews) {
    if (review.required && review.status !== "allowed") {
      missingEvidence.push(
        `rbac/${review.id}: ${review.verb} ${review.resource} ${review.scope}=${review.status}`
      );
    }
  }
  if (worktreeDirty) {
    missingEvidence.push(`current git worktree dirty=true currentHead=${headSha}`);
  }
  const troubleshootingCommands = readOnlyTroubleshootingCommands(endpoint, dnsResult);
  const credentialDiagnosis = classification === "auth-failed"
    ? hygiene.localFormatIssue
      ? "local-token-format-issue"
      : "credential-rejected-or-expired"
    : classification === "token-missing"
      ? "token-missing"
      : "not-auth-failure";
  const actionHints = actionHintsForClassification(
    classification,
    troubleshootingCommands,
    hygiene
  );
  const authRecoveryBase = authRecoveryForClassification(
    classification,
    hygiene,
    credentialDiagnosis,
    ocContextResult
  );
  const authRecovery = {
    ...authRecoveryBase,
    markdownPath: resolve(options.authRecoveryMarkdownOut),
    exists: true
  };

  const artifact = {
    schema: "cywell.opslens.ocp-connectivity-diagnostic.v0.1",
    artifactType: "opslens.ocp-connectivity-diagnostic.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    classification,
    actionMode: "readOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-OCP-001", "AC-LS-002", "AC-OP-004"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    target: endpoint
      ? {
          protocol: endpoint.protocol,
          host: "<redacted-ocp-api>",
          port: endpoint.port,
          redactedBaseUrl: endpoint.redactedBaseUrl,
          baseUrlSource: config.baseUrlSource,
          baseUrlCandidateCount: config.baseUrlCandidateCount,
          tokenConfigured: Boolean(config.token),
          tokenSource: config.tokenSource,
          tokenCandidateCount: config.tokenCandidateCount,
          tlsVerify: config.tlsVerify,
          tlsVerifySource: config.tlsVerifySource,
          timeoutMs: config.timeoutMs
        }
      : {
          redactedBaseUrl: config.baseUrl ? "<invalid-url>" : "<missing>",
          baseUrlSource: config.baseUrlSource,
          tokenConfigured: Boolean(config.token),
          tokenSource: config.tokenSource,
          tlsVerify: config.tlsVerify,
          tlsVerifySource: config.tlsVerifySource,
          timeoutMs: config.timeoutMs
        },
    credentialHygiene: {
      ...hygiene,
      credentialDiagnosis
    },
    diagnostics: {
      classification,
      dns: dnsResult,
      tcp: tcpResult,
      tls: tlsResult,
      kubernetesVersion: httpResult,
      oc: ocResult,
      ocContext: ocContextResult,
      rbacAccessReviews: rbacAccessResult.reviews
    },
    authRecovery,
    actionHints,
    readOnlyTroubleshootingCommands: troubleshootingCommands,
    missingEvidence,
    evidence: [
      "diagnostic performs DNS lookup, TCP connect, TLS handshake, Kubernetes /version GET, and oc get --raw=/version only",
      "RBAC access reviews use oc auth can-i and do not apply, patch, delete, or create cluster resources",
      "no apply, patch, delete, scale, image push, signing, mirroring, or cluster mutation is attempted",
      "token values are redacted from console output and evidence artifacts",
      `oc context currentContextSet=${String(ocContextResult.currentContextSet)} whoamiAvailable=${String(ocContextResult.whoamiAvailable)}`,
      `credential hygiene localFormatIssue=${hygiene.localFormatIssue} diagnosis=${credentialDiagnosis}`,
      `auth recovery status=${authRecovery.status} owner=${authRecovery.owner} mutationAllowed=false`
    ],
    risk: [
      "A TCP timeout usually points to VPN, firewall, route, bastion, or API server reachability rather than an OpsLens code defect.",
      "A TLS failure can be caused by self-signed or enterprise CA trust configuration; use explicit OCP TLS variables rather than Lightspeed TLS variables.",
      "A 401 from /version means the configured token or kubeconfig credential was rejected before RBAC could be trusted.",
      "A 403 from /version means network reachability exists but the credential or read-only RBAC evidence is still incomplete."
    ],
    rollbackPath: [
      "No rollback is required because this verifier is read-only.",
      "Fix network/VPN/firewall/DNS or token configuration, then rerun npm run verify:ocp:connectivity -- --timeout-ms 30000.",
      "After OCP connectivity passes, rerun verify:lightspeed, verify:operator:dry-run, verify:install-plan, verify:evidence-checkpoint, and verify:roadmap-plan."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const authRecoveryMarkdownContent = authRecoveryMarkdown(artifact);
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("OCP connectivity diagnostic would include a configured secret value");
  }
  if (secretValuesForLeakCheck().some((secret) => authRecoveryMarkdownContent.includes(secret))) {
    throw new Error("OCP auth recovery packet would include a configured secret value");
  }
  if (endpointLeakLike(serialized) || endpointLeakLike(authRecoveryMarkdownContent)) {
    throw new Error("OCP connectivity diagnostic would include an unredacted OCP host or private IP");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.authRecoveryMarkdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.authRecoveryMarkdownOut), authRecoveryMarkdownContent, "utf8");
  pass(
    "OCP connectivity diagnostic export",
    `${resolve(options.evidenceOut)} and ${resolve(options.authRecoveryMarkdownOut)} written without secret material`
  );

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    warn: checks.filter((check) => check.status === "WARN").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens OCP connectivity diagnostic: status=${status}, classification=${classification}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );
}

main().catch((error) => {
  fail("OCP connectivity diagnostic runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] OCP connectivity diagnostic runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
