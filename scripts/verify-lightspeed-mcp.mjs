#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { dirname, join, parse, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  namespace: "openshift-lightspeed",
  name: "cluster",
  installation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  template: "deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
  evidenceOut: "test-results/cywell-opslens-lightspeed-readiness.json",
  patchPreviewOut: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  timeoutMs: 10000
};

function parseArgs(argv) {
  const result = {
    flags: new Set(),
    values: new Map()
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result.values.set(rawKey, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result.values.set(rawKey, next);
      index += 1;
    } else {
      result.flags.add(rawKey);
    }
  }

  return result;
}

const parsed = parseArgs(process.argv.slice(2));

const options = {
  namespace: parsed.values.get("namespace") ?? defaults.namespace,
  name: parsed.values.get("name") ?? defaults.name,
  installation: parsed.values.get("installation") ?? defaults.installation,
  template: parsed.values.get("template") ?? defaults.template,
  crdFixture: parsed.values.get("crd-fixture"),
  olsConfigFixture: parsed.values.get("olsconfig-fixture"),
  mcpUrl: parsed.values.get("mcp-url") ?? process.env.CYWELL_OPSLENS_MCP_URL,
  apiKey: parsed.values.get("api-key") ?? process.env.CYWELL_OPSLENS_API_KEY,
  bearerToken: parsed.values.get("bearer-token") ?? process.env.CYWELL_OPSLENS_BEARER_TOKEN,
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  patchPreviewOut: parsed.values.get("patch-preview-out") ?? defaults.patchPreviewOut,
  skipMcp: parsed.flags.has("skip-mcp"),
  patchPreview: parsed.flags.has("patch-preview"),
  requireMcp: parsed.flags.has("require-mcp"),
  strictInstance: parsed.flags.has("strict-instance"),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();
let loadedEnv = false;
let currentOlsConfigForPatchPreview;
let liveOcpFailure;
const readiness = {
  mode: options.crdFixture ? "fixture" : "live",
  sources: {
    crd: options.crdFixture ? "fixture" : "unread",
    olsConfig: options.olsConfigFixture
      ? "fixture"
      : options.crdFixture
        ? "skipped"
        : "unread",
    mcpEndpoint: options.skipMcp ? "skipped" : options.mcpUrl ? "configured" : "missing"
  },
  crd: {
    scope: "unknown",
    servedVersions: [],
    hasMcpServers: false,
    hasFeatureGates: false,
    hasHeaderValueFromType: false
  },
  olsConfig: {
    label: options.crdFixture ? "fixture-skipped" : `${options.namespace}/${options.name}`,
    readable: false,
    featureGate: "unknown",
    cywellRegistration: "unknown",
    cywellServerUrl: undefined
  },
  mcp: {
    configured: Boolean(options.mcpUrl),
    requireMcp: options.requireMcp,
    skipped: options.skipMcp,
    toolsList: "not-run",
    toolsCall: "not-run"
  }
};

function record(status, name, detail) {
  checks.push({ status, name, detail });
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
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failureDetail);
  }
}

function sanitize(text) {
  let result = text ?? "";
  for (const secret of secretValuesForLeakCheck()) {
    result = result.split(secret).join("<redacted>");
  }
  return result;
}

function ocBaseArgs() {
  const config = ocpApiConfig();
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

async function runOc(args) {
  try {
    const { stdout } = await execFileAsync("oc", [...ocBaseArgs(), ...args], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeoutMs
    });
    return sanitize(stdout);
  } catch (error) {
    const message = [
      sanitize(error.message),
      error.stdout ? `stdout: ${sanitize(error.stdout)}` : "",
      error.stderr ? `stderr: ${sanitize(error.stderr)}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(message);
  }
}

async function gitValue(args, fallback) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return stdout.trim().split(/\r?\n/).at(-1)?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function gitStatusShort() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return stdout.trimEnd() ? stdout.trimEnd().split(/\r?\n/) : [];
  } catch {
    return [];
  }
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
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
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
  const explicitVerify = firstEnv(
    "OCP_TLS_VERIFY",
    "OPENSHIFT_API_TLS_VERIFY",
    "KUBE_TLS_VERIFY"
  );
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

function ocpApiConfig() {
  loadEnvFile();
  return {
    baseUrl: firstEnv("OCP_API_BASE_URL", "OPENSHIFT_API_BASE_URL", "KUBE_API_BASE_URL"),
    token: firstEnv("OCP_API_TOKEN", "OPENSHIFT_API_TOKEN", "KUBE_API_TOKEN"),
    tlsVerify: ocpTlsVerifyFromEnv()
  };
}

function safeOcpApiEvidence() {
  const config = ocpApiConfig();
  let host;
  if (config.baseUrl) {
    try {
      host = new URL(config.baseUrl).host;
    } catch {
      host = "invalid-url";
    }
  }

  return {
    configured: Boolean(config.baseUrl && config.token),
    host,
    tlsVerify: config.tlsVerify
  };
}

function classifyLiveReadFailure(ocError, apiError) {
  const config = ocpApiConfig();
  const combined = sanitize(
    [
      ocError instanceof Error ? ocError.message : String(ocError),
      apiError instanceof Error ? apiError.message : String(apiError)
    ].join("\n")
  );
  const lower = combined.toLowerCase();
  let classification = "api-unreachable";
  let evidence =
    "live OCP read failed before Lightspeed OLSConfig or CRD readiness could be confirmed";
  let nextCommand = "npm run verify:ocp:connectivity";
  let owner = "cluster-sre";

  if (!config.baseUrl || !config.token) {
    classification = !config.baseUrl ? "not-configured" : "token-missing";
    evidence = "OCP API URL or token is not configured for live Lightspeed readiness";
    nextCommand = "npm run verify:env";
    owner = "cluster-admin";
  } else if (
    lower.includes("unauthorized") ||
    lower.includes("provide credentials") ||
    lower.includes("you must be logged in") ||
    lower.includes("forbidden")
  ) {
    classification = "auth-or-rbac";
    evidence =
      "OCP API was reachable, but the configured credential was rejected or lacks read access";
    nextCommand = "npm run evidence:ocp-auth-rbac-plan";
    owner = "cluster-admin";
  } else if (
    lower.includes("certificate") ||
    lower.includes("tls") ||
    lower.includes("self-signed")
  ) {
    classification = "tls-handshake-failed";
    evidence = "OCP API TLS validation failed before Lightspeed readiness could read OLSConfig";
  } else if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("etimedout")
  ) {
    classification = "tcp-timeout";
    evidence = "OCP API request timed out before Lightspeed readiness could read OLSConfig";
  } else if (
    lower.includes("enotfound") ||
    lower.includes("getaddrinfo")
  ) {
    classification = "dns-unresolved";
    evidence = "OCP API hostname could not be resolved";
  } else if (
    lower.includes("econnrefused") ||
    lower.includes("no such host")
  ) {
    classification = "tcp-unreachable";
    evidence = "OCP API TCP endpoint could not be reached";
  }

  return {
    classification,
    owner,
    evidence,
    nextCommand,
    redactedDetail: combined.split(/\r?\n/).slice(0, 6).join("\n")
  };
}

function compactLiveFailureDetail(failure) {
  return [
    `classification=${failure.classification}`,
    `owner=${failure.owner}`,
    failure.evidence,
    `next=${failure.nextCommand}`
  ].join("; ");
}

function runOcpApi(path) {
  const config = ocpApiConfig();
  if (!config.baseUrl || !config.token) {
    throw new Error("OCP_API_BASE_URL/OCP_API_TOKEN are not configured");
  }

  const url = new URL(path, config.baseUrl);

  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        rejectUnauthorized: config.tlsVerify,
        timeout: options.timeoutMs,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.token}`
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            rejectRequest(
              new Error(`${response.statusCode} ${response.statusMessage}: ${body}`)
            );
            return;
          }
          try {
            resolveRequest(asJson(body, `OCP API GET ${path}`));
          } catch (error) {
            rejectRequest(error);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`OCP API GET ${path} timed out`));
    });
    request.on("error", rejectRequest);
    request.end();
  });
}

async function readLiveJson({ ocArgs, apiPath, ocSource, apiSource }) {
  try {
    const output = await runOc(ocArgs);
    return {
      source: "oc",
      json: asJson(output, ocSource)
    };
  } catch (ocError) {
    try {
      const json = await runOcpApi(apiPath);
      warn(
        "oc fallback",
        `oc read failed, loaded ${apiSource} through OCP API env without printing secrets`
      );
      return {
        source: "ocp-api",
        json
      };
    } catch (apiError) {
      const failure = classifyLiveReadFailure(ocError, apiError);
      liveOcpFailure = failure;
      throw new Error(compactLiveFailureDetail(failure));
    }
  }
}

function schemaProperty(schema, path) {
  let cursor = schema;
  for (const segment of path) {
    cursor = cursor?.properties?.[segment];
    if (!cursor) {
      return undefined;
    }
  }
  return cursor;
}

function schemaItemsProperty(schema, path) {
  let cursor = schema;
  for (const segment of path) {
    if (segment === "[]") {
      cursor = cursor?.items;
    } else {
      cursor = cursor?.properties?.[segment];
    }

    if (!cursor) {
      return undefined;
    }
  }
  return cursor;
}

function asJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not valid JSON: ${error.message}`);
  }
}

async function loadCrd() {
  if (options.crdFixture) {
    const fixturePath = resolve(options.crdFixture);
    const fixtureText = await readFile(fixturePath, "utf8");
    pass("CRD source", `loaded fixture ${fixturePath}`);
    readiness.sources.crd = "fixture";
    return asJson(fixtureText, fixturePath);
  }

  const result = await readLiveJson({
    ocArgs: ["get", "crd", "olsconfigs.ols.openshift.io", "-o", "json"],
    apiPath:
      "/apis/apiextensions.k8s.io/v1/customresourcedefinitions/olsconfigs.ols.openshift.io",
    ocSource: "oc get crd olsconfigs.ols.openshift.io",
    apiSource: "olsconfigs.ols.openshift.io CRD"
  });
  pass(
    "CRD source",
    result.source === "oc"
      ? "loaded live olsconfigs.ols.openshift.io through oc"
      : "loaded live olsconfigs.ols.openshift.io through OCP API env"
  );
  readiness.sources.crd = result.source;
  return result.json;
}

async function validateTemplate() {
  const templatePath = resolve(options.template);
  let text;
  try {
    text = await readFile(templatePath, "utf8");
  } catch (error) {
    fail("OLSConfig template", `cannot read ${templatePath}: ${error.message}`);
    return;
  }

  const requiredPatterns = [
    ["kind", /kind:\s*OLSConfig/],
    ["MCP feature gate", /featureGates:\s*[\r\n]+(?:\s*-\s*)MCPServer/],
    ["MCP server list", /mcpServers:/],
    ["Lightspeed-facing MCP URL", /url:\s*\S+\/mcp\b/],
    ["user bearer forwarding", /type:\s*kubernetes/],
    ["Cywell API key secret", /type:\s*secret/],
    ["query redaction filters", /queryFilters:/]
  ];

  for (const [name, pattern] of requiredPatterns) {
    if (pattern.test(text)) {
      pass(`template ${name}`, `${templatePath} contains ${name}`);
    } else {
      fail(`template ${name}`, `${templatePath} is missing ${name}`);
    }
  }
}

function validateCrdSchema(crd) {
  readiness.crd.scope = crd.spec?.scope ?? "unknown";

  if (crd.kind === "CustomResourceDefinition") {
    pass("CRD kind", "OLSConfig CRD object is present");
  } else {
    fail("CRD kind", `expected CustomResourceDefinition, got ${crd.kind ?? "unknown"}`);
  }

  if (crd.spec?.group === "ols.openshift.io") {
    pass("CRD group", "group is ols.openshift.io");
  } else {
    fail("CRD group", `expected ols.openshift.io, got ${crd.spec?.group ?? "unknown"}`);
  }

  const versions = crd.spec?.versions ?? [];
  const servedVersions = versions.filter((version) => version.served).map((version) => version.name);
  readiness.crd.servedVersions = servedVersions;
  if (servedVersions.length > 0) {
    pass("CRD versions", `served versions: ${servedVersions.join(", ")}`);
  } else {
    fail("CRD versions", "no served OLSConfig versions found");
  }

  const schemasWithMcp = versions.filter((version) => {
    const schema = version.schema?.openAPIV3Schema;
    return schemaProperty(schema, ["spec", "mcpServers"]);
  });

  if (schemasWithMcp.length > 0) {
    readiness.crd.hasMcpServers = true;
    pass(
      "schema spec.mcpServers",
      `available in ${schemasWithMcp.map((version) => version.name).join(", ")}`
    );
  } else {
    fail("schema spec.mcpServers", "installed OLSConfig CRD does not expose spec.mcpServers");
  }

  const schemasWithFeatureGates = versions.filter((version) => {
    const schema = version.schema?.openAPIV3Schema;
    return schemaProperty(schema, ["spec", "featureGates"]);
  });

  if (schemasWithFeatureGates.length > 0) {
    readiness.crd.hasFeatureGates = true;
    pass(
      "schema spec.featureGates",
      `available in ${schemasWithFeatureGates.map((version) => version.name).join(", ")}`
    );
  } else {
    fail("schema spec.featureGates", "installed OLSConfig CRD does not expose spec.featureGates");
  }

  const headerTypeSchemas = versions.filter((version) => {
    const schema = version.schema?.openAPIV3Schema;
    return schemaItemsProperty(schema, [
      "spec",
      "mcpServers",
      "[]",
      "headers",
      "[]",
      "valueFrom",
      "type"
    ]);
  });

  if (headerTypeSchemas.length > 0) {
    readiness.crd.hasHeaderValueFromType = true;
    pass(
      "schema MCP headers",
      `header valueFrom.type is available in ${headerTypeSchemas.map((version) => version.name).join(", ")}`
    );
  } else {
    warn(
      "schema MCP headers",
      "could not confirm mcpServers[].headers[].valueFrom.type in CRD schema; check OLSConfig API docs before applying"
    );
  }
}

async function validateCurrentOlsConfig(crd) {
  if (options.olsConfigFixture) {
    const fixture = await loadSingleYaml(options.olsConfigFixture);
    const config = fixture.object;
    if (config?.kind !== "OLSConfig") {
      fail("OLSConfig fixture", `${fixture.path} is not an OLSConfig`);
      return;
    }

    currentOlsConfigForPatchPreview = config;
    readiness.sources.olsConfig = "fixture";
    readiness.olsConfig.label =
      `${config.metadata?.namespace ?? "cluster"}/${config.metadata?.name ?? "unknown"}`;
    readiness.olsConfig.readable = true;
    pass("OLSConfig fixture", `${fixture.path} loaded for patch preview`);

    const featureGates = config.spec?.featureGates ?? [];
    if (featureGates.includes("MCPServer")) {
      pass("fixture MCP feature gate", "MCPServer feature gate is already enabled");
      readiness.olsConfig.featureGate = "ready";
    } else {
      warn("fixture MCP feature gate", "MCPServer feature gate is not enabled yet");
      readiness.olsConfig.featureGate = "missing";
    }

    const mcpServers = config.spec?.mcpServers ?? [];
    const cywellServer = mcpServers.find((server) => server.name === "cywell-opslens");
    if (cywellServer) {
      pass("fixture Cywell MCP registration", `cywell-opslens points to ${cywellServer.url}`);
      readiness.olsConfig.cywellRegistration = "ready";
      readiness.olsConfig.cywellServerUrl = cywellServer.url;
    } else {
      warn("fixture Cywell MCP registration", "cywell-opslens is not registered yet");
      readiness.olsConfig.cywellRegistration = "missing";
    }
    return;
  }

  if (options.crdFixture) {
    warn("live OLSConfig", "skipped current OLSConfig read because --crd-fixture is in use");
    readiness.sources.olsConfig = "skipped";
    readiness.olsConfig.featureGate = "not-checked";
    readiness.olsConfig.cywellRegistration = "not-checked";
    return;
  }

  const namespaced = crd.spec?.scope !== "Cluster";
  const ocArgs = namespaced
    ? ["get", "olsconfig", options.name, "-n", options.namespace, "-o", "json"]
    : ["get", "olsconfig", options.name, "-o", "json"];
  const apiPath = namespaced
    ? `/apis/ols.openshift.io/v1alpha1/namespaces/${encodeURIComponent(
        options.namespace
      )}/olsconfigs/${encodeURIComponent(options.name)}`
    : `/apis/ols.openshift.io/v1alpha1/olsconfigs/${encodeURIComponent(options.name)}`;
  const configLabel = namespaced
    ? `${options.namespace}/${options.name}`
    : options.name;
  readiness.olsConfig.label = configLabel;

  try {
    const result = await readLiveJson({
      ocArgs,
      apiPath,
      ocSource: `oc get olsconfig ${options.name}`,
      apiSource: `${configLabel} OLSConfig`
    });
    const config = result.json;
    currentOlsConfigForPatchPreview = config;
    pass("live OLSConfig", `${configLabel} is readable`);
    readiness.sources.olsConfig = result.source;
    readiness.olsConfig.readable = true;

    const featureGates = config.spec?.featureGates ?? [];
    if (featureGates.includes("MCPServer")) {
      pass("live MCP feature gate", "MCPServer feature gate is already enabled");
      readiness.olsConfig.featureGate = "ready";
    } else {
      warn("live MCP feature gate", "MCPServer feature gate is not enabled yet");
      readiness.olsConfig.featureGate = "missing";
    }

    const mcpServers = config.spec?.mcpServers ?? [];
    const cywellServer = mcpServers.find((server) => server.name === "cywell-opslens");
    if (cywellServer) {
      pass("live Cywell MCP registration", `cywell-opslens points to ${cywellServer.url}`);
      readiness.olsConfig.cywellRegistration = "ready";
      readiness.olsConfig.cywellServerUrl = cywellServer.url;
    } else {
      warn("live Cywell MCP registration", "cywell-opslens is not registered yet");
      readiness.olsConfig.cywellRegistration = "missing";
    }
  } catch (error) {
    const message = `${configLabel} is not readable: ${error.message}`;
    readiness.sources.olsConfig = "unreadable";
    readiness.olsConfig.readable = false;
    readiness.olsConfig.featureGate = "unknown";
    readiness.olsConfig.cywellRegistration = "unknown";
    if (options.strictInstance) {
      fail("live OLSConfig", message);
    } else {
      warn("live OLSConfig", `${message}; use --strict-instance to require it`);
    }
  }
}

async function postMcp(method, params) {
  const headers = {
    "content-type": "application/json"
  };

  if (options.apiKey) {
    headers["x-cywell-api-key"] = options.apiKey;
  }

  if (options.bearerToken) {
    headers.authorization = `Bearer ${options.bearerToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(options.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${Date.now()}-${method}`,
        method,
        params
      }),
      signal: controller.signal
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${body}`);
    }

    const json = asJson(body, `${method} MCP response`);
    if (json.error) {
      throw new Error(JSON.stringify(json.error));
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

async function validateMcpEndpoint() {
  if (options.skipMcp) {
    warn("MCP endpoint", "skipped because --skip-mcp was provided");
    readiness.sources.mcpEndpoint = "skipped";
    readiness.mcp.toolsList = "skipped";
    readiness.mcp.toolsCall = "skipped";
    return;
  }

  if (!options.mcpUrl) {
    const detail = "set CYWELL_OPSLENS_MCP_URL or pass --mcp-url to run tools/list and tools/call";
    readiness.sources.mcpEndpoint = "missing";
    readiness.mcp.toolsList = "missing-url";
    readiness.mcp.toolsCall = "missing-url";
    if (options.requireMcp) {
      fail("MCP endpoint", detail);
    } else {
      warn("MCP endpoint", detail);
    }
    return;
  }

  try {
    const listResult = await postMcp("tools/list", {});
    const tools = listResult.tools ?? [];
    const generatePlaybook = tools.find((tool) => tool.name === "generate_playbook");
    if (generatePlaybook) {
      pass("MCP tools/list", "generate_playbook is discoverable");
      readiness.sources.mcpEndpoint = "verified";
      readiness.mcp.toolsList = "ready";
    } else {
      fail("MCP tools/list", "generate_playbook is missing");
      readiness.mcp.toolsList = "missing-tool";
    }

    const annotations = generatePlaybook?.annotations ?? {};
    if (annotations.readOnlyHint === true && annotations.destructiveHint === false) {
      pass("MCP tool safety annotations", "generate_playbook is marked read-only and non-destructive");
    } else {
      fail("MCP tool safety annotations", "generate_playbook safety annotations are missing or unsafe");
    }

    const callResult = await postMcp("tools/call", {
      name: "generate_playbook",
      arguments: {
        question: "payments-api crashloop token=example-secret",
        tenantId: "cywell-payments",
        clusterId: "smoke-cluster",
        namespace: "payments-prod",
        resourceRef: "deployment/payments-api"
      }
    });

    const structured = callResult.structuredContent;
    if (structured?.policy?.mutationAllowed === false) {
      pass("MCP tools/call mutation policy", "mutationAllowed=false");
      readiness.mcp.toolsCall = "ready";
    } else {
      fail("MCP tools/call mutation policy", "mutationAllowed is not false");
      readiness.mcp.toolsCall = "unsafe";
    }

    if (structured?.policy?.rawDocumentReturned === false) {
      pass("MCP tools/call document policy", "rawDocumentReturned=false");
    } else {
      fail("MCP tools/call document policy", "rawDocumentReturned is not false");
    }

    if ((structured?.citations ?? []).some((citation) => citation.sourceType === "customer-runbook")) {
      pass("MCP tools/call citations", "customer-runbook citation returned");
    } else {
      fail("MCP tools/call citations", "customer-runbook citation missing");
    }
  } catch (error) {
    fail("MCP endpoint", error.message);
    readiness.sources.mcpEndpoint = "failed";
    readiness.mcp.toolsList = readiness.mcp.toolsList === "not-run" ? "failed" : readiness.mcp.toolsList;
    readiness.mcp.toolsCall = readiness.mcp.toolsCall === "not-run" ? "failed" : readiness.mcp.toolsCall;
  }
}

async function loadSingleYaml(path) {
  const resolvedPath = resolve(path);
  const text = await readFile(resolvedPath, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${resolvedPath} is invalid YAML: ${errors.map((error) => error.message).join("; ")}`);
  }

  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  if (parsed.length !== 1) {
    throw new Error(`${resolvedPath} expected 1 YAML document, got ${parsed.length}`);
  }

  return {
    path: resolvedPath,
    object: parsed[0]
  };
}

async function loadReconcilePlanner() {
  try {
    return await import(new URL("../packages/operator-controller/dist/index.js", import.meta.url));
  } catch (error) {
    throw new Error(
      `operator-controller dist is not available; run npm run -w @kugnus/operator-controller build first (${error.message})`
    );
  }
}

async function validatePatchPreview() {
  if (!options.patchPreview) {
    return;
  }

  if (options.crdFixture && !options.olsConfigFixture) {
    warn("patch preview", "skipped because --crd-fixture does not read a live OLSConfig");
    return;
  }

  if (!currentOlsConfigForPatchPreview) {
    fail("patch preview", "live OLSConfig was not readable, so no patch preview was produced");
    return;
  }

  try {
    const [{ buildOpsLensReconcilePlan }, installation] = await Promise.all([
      loadReconcilePlanner(),
      loadSingleYaml(options.installation)
    ]);
    const plan = buildOpsLensReconcilePlan(installation.object, currentOlsConfigForPatchPreview);
    const lightspeed = plan.lightspeedRegistration;
    const patch = lightspeed.strategicMergePatch;
    const cywellServer = patch?.spec?.mcpServers?.find(
      (server) => server.name === lightspeed.desiredServer.name
    );

    expectCheck(
      "patch preview source",
      installation.object?.kind === "OpsLensInstallation",
      `loaded ${installation.path}`,
      `${installation.path} is not an OpsLensInstallation`
    );
    expectCheck(
      "patch preview phase",
      ["PatchPlanned", "Ready"].includes(lightspeed.phase),
      `${lightspeed.phase} for ${lightspeed.target.namespace}/${lightspeed.target.name}`,
      `unexpected patch preview phase ${lightspeed.phase}`
    );
    expectCheck(
      "patch preview mutation boundary",
      plan.policy.assistantMutationAllowed === false &&
        plan.policy.operatorMutationRequiresPatchMode === true,
      "assistant remains non-mutating; Operator mutation requires explicit PatchOLSConfig"
    );

    if (lightspeed.phase === "PatchPlanned") {
      expectCheck(
        "patch preview feature gate",
        patch?.spec?.featureGates?.includes("MCPServer") === true,
        "strategic merge patch enables MCPServer while preserving existing feature gates"
      );
      expectCheck(
        "patch preview MCP server",
        cywellServer?.url?.endsWith("/mcp") === true,
        `${lightspeed.desiredServer.name} points to ${cywellServer?.url ?? "missing"}`
      );
      expectCheck(
        "patch preview rollback",
        lightspeed.rollbackPath.join(" ").includes("restore previous OLSConfig") &&
          lightspeed.rollbackPath.join(" ").includes(`remove the ${lightspeed.desiredServer.name}`),
        "rollback path restores previous OLSConfig and removes only the Cywell MCP server"
      );
    } else {
      pass("patch preview already ready", "live OLSConfig already matches the desired Cywell MCP registration");
    }

    const reportPath = resolve(options.patchPreviewOut);
    const worktreeStatus = await gitStatusShort();
    const report = {
      schema: "cywell.opslens.lightspeed-patch-preview.v0.1",
      artifactType: "opslens.lightspeed.patch-preview.v0.1",
      generatedAt: new Date().toISOString(),
      status: lightspeed.phase === "PatchPlanned" ? "PATCH_PLANNED" : lightspeed.phase,
      actionMode: "previewOnly",
      clusterMutationAttempted: false,
      ref: {
        branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
        headSha: await gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
        baseRef: await gitValue(
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
          "origin/main"
        ),
        worktreeDirty: worktreeStatus.length > 0,
        worktreeStatus
      },
      installation: {
        path: installation.path,
        name: installation.object?.metadata?.name,
        namespace: installation.object?.metadata?.namespace
      },
      source: {
        crd: options.crdFixture ? "fixture" : "live",
        olsConfig: options.olsConfigFixture ? "fixture" : "live",
        olsConfigFixture: options.olsConfigFixture ? resolve(options.olsConfigFixture) : undefined
      },
      target: lightspeed.target,
      mode: lightspeed.mode,
      phase: lightspeed.phase,
      willPatch: lightspeed.willPatch,
      operatorMutationAllowedByMode: lightspeed.mutationAllowed,
      desiredServer: lightspeed.desiredServer,
      strategicMergePatch: patch,
      evidence: lightspeed.evidence,
      missingEvidence: lightspeed.missingEvidence,
      risks: lightspeed.risk,
      rollbackPath: lightspeed.rollbackPath,
      policy: plan.policy
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    const leakedSecret = secretValuesForLeakCheck().some((secret) => serialized.includes(secret));
    if (leakedSecret) {
      throw new Error("patch preview evidence would include a configured secret value");
    }

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized);
    pass("patch preview evidence export", `${reportPath} written without secret material`);
  } catch (error) {
    fail("patch preview", error instanceof Error ? error.message : String(error));
  }
}

function secretValuesForLeakCheck() {
  loadEnvFile();
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "CYWELL_OPSLENS_API_KEY",
    "CYWELL_OPSLENS_BEARER_TOKEN",
    "OPENSHIFT_LIGHTSPEED_TOKEN"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

function readinessStatus(failures, warnings) {
  if (failures.length > 0) {
    return "FAIL";
  }
  if (
    readiness.olsConfig.featureGate === "missing" ||
    readiness.olsConfig.cywellRegistration === "missing" ||
    readiness.sources.mcpEndpoint === "missing"
  ) {
    return "NEEDS_CONFIGURATION";
  }
  if (warnings.length > 0) {
    return "WARN";
  }
  return "PASS";
}

async function buildEvidenceArtifact() {
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  const worktreeStatus = await gitStatusShort();

  return {
    schema: "cywell.opslens.lightspeed-readiness.v0.1",
    artifactType: "opslens.lightspeed.readiness-evidence.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: readinessStatus(failures, warnings),
    acceptance: ["AC-LS-001", "AC-LS-002", "AC-ENV-001"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: await gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
      baseRef: await gitValue(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        "origin/main"
      ),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    target: {
      namespace: options.namespace,
      name: options.name,
      template: resolve(options.template),
      fixture: options.crdFixture ? resolve(options.crdFixture) : undefined,
      olsConfigFixture: options.olsConfigFixture ? resolve(options.olsConfigFixture) : undefined,
      mcpEndpointConfigured: Boolean(options.mcpUrl),
      requireMcp: options.requireMcp,
      strictInstance: options.strictInstance
    },
    policy: {
      mutationAllowed: false,
      clusterMutationAttempted: false,
      rawSecretPrinted: false,
      readOnlyMethods: ["oc get", "GET OpenShift API", "MCP tools/list", "MCP tools/call"]
    },
    ocpApi: safeOcpApiEvidence(),
    currentGap: liveOcpFailure
      ? {
          classification: liveOcpFailure.classification,
          owner: liveOcpFailure.owner,
          evidence: liveOcpFailure.evidence,
          nextCommand: liveOcpFailure.nextCommand,
          redactedDetail: liveOcpFailure.redactedDetail
        }
      : undefined,
    readiness,
    checks,
    missingEvidence: checks
      .filter((check) => check.status !== "PASS")
      .map((check) => `${check.name}: ${check.detail}`),
    risks: [
      "Lightspeed cannot route questions to Cywell OpsLens until MCPServer feature gate and cywell-opslens registration are present.",
      "End-to-end MCP routing is not proven until tools/list and tools/call pass against a reachable /mcp endpoint.",
      "This verifier is read-only; it reports the gap but does not patch OLSConfig."
    ],
    rollbackPath: [
      "No rollback is required for this verifier because it performs no cluster mutation.",
      "If a future PatchOLSConfig run is used, restore the previous OLSConfig spec and remove only the cywell-opslens MCP server entry."
    ]
  };
}

async function writeEvidenceArtifact() {
  const reportPath = resolve(options.evidenceOut);
  const report = await buildEvidenceArtifact();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const leakedSecret = secretValuesForLeakCheck().some((secret) => serialized.includes(secret));
  if (leakedSecret) {
    throw new Error("readiness evidence would include a configured secret value");
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized);
  pass("readiness evidence export", `${reportPath} written without secret material`);
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
  console.log(`Cywell OpsLens Lightspeed MCP smoke: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await validateTemplate();
  const crd = await loadCrd();
  validateCrdSchema(crd);
  await validateCurrentOlsConfig(crd);
  await validatePatchPreview();
  await validateMcpEndpoint();
} catch (error) {
  fail("smoke verifier", error.message);
} finally {
  try {
    await writeEvidenceArtifact();
  } catch (error) {
    fail("readiness evidence export", error.message);
  }
  printSummary();
}
