#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { dirname, join, parse, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  namespace: "openshift-lightspeed",
  name: "cluster",
  template: "deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
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
  template: parsed.values.get("template") ?? defaults.template,
  crdFixture: parsed.values.get("crd-fixture"),
  mcpUrl: parsed.values.get("mcp-url") ?? process.env.CYWELL_OPSLENS_MCP_URL,
  apiKey: parsed.values.get("api-key") ?? process.env.CYWELL_OPSLENS_API_KEY,
  bearerToken: parsed.values.get("bearer-token") ?? process.env.CYWELL_OPSLENS_BEARER_TOKEN,
  skipMcp: parsed.flags.has("skip-mcp"),
  requireMcp: parsed.flags.has("require-mcp"),
  strictInstance: parsed.flags.has("strict-instance"),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
let loadedEnv = false;

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

async function runOc(args) {
  try {
    const { stdout } = await execFileAsync("oc", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeoutMs
    });
    return stdout;
  } catch (error) {
    const message = [
      error.message,
      error.stdout ? `stdout: ${error.stdout}` : "",
      error.stderr ? `stderr: ${error.stderr}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(message);
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
      throw new Error(
        [
          `oc failed: ${ocError.message}`,
          `OCP API fallback failed: ${apiError.message}`
        ].join("\n")
      );
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
  if (options.crdFixture) {
    warn("live OLSConfig", "skipped current OLSConfig read because --crd-fixture is in use");
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

  try {
    const result = await readLiveJson({
      ocArgs,
      apiPath,
      ocSource: `oc get olsconfig ${options.name}`,
      apiSource: `${configLabel} OLSConfig`
    });
    const config = result.json;
    pass("live OLSConfig", `${configLabel} is readable`);

    const featureGates = config.spec?.featureGates ?? [];
    if (featureGates.includes("MCPServer")) {
      pass("live MCP feature gate", "MCPServer feature gate is already enabled");
    } else {
      warn("live MCP feature gate", "MCPServer feature gate is not enabled yet");
    }

    const mcpServers = config.spec?.mcpServers ?? [];
    const cywellServer = mcpServers.find((server) => server.name === "cywell-opslens");
    if (cywellServer) {
      pass("live Cywell MCP registration", `cywell-opslens points to ${cywellServer.url}`);
    } else {
      warn("live Cywell MCP registration", "cywell-opslens is not registered yet");
    }
  } catch (error) {
    const message = `${configLabel} is not readable: ${error.message}`;
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
    return;
  }

  if (!options.mcpUrl) {
    const detail = "set CYWELL_OPSLENS_MCP_URL or pass --mcp-url to run tools/list and tools/call";
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
    } else {
      fail("MCP tools/list", "generate_playbook is missing");
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
    } else {
      fail("MCP tools/call mutation policy", "mutationAllowed is not false");
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
  }
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
  await validateMcpEndpoint();
} catch (error) {
  fail("smoke verifier", error.message);
} finally {
  printSummary();
}
