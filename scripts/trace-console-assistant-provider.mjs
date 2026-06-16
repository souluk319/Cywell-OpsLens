#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import {
  sanitizeCommonSensitive,
  sensitiveEndpointLeakLike
} from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  displayName: "KOMSCO AI Assistant",
  evidenceOut: "test-results/cywell-opslens-console-assistant-provider.json",
  timeoutMs: 30000,
  maxKeywordMatches: 120
};

const startedAt = new Date().toISOString();
const checks = [];
let loadedEnv = false;

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
  displayName: parsed.get("display-name") ?? defaults.displayName,
  pluginName: parsed.get("plugin-name"),
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs),
  maxKeywordMatches: Number(parsed.get("max-keyword-matches") ?? defaults.maxKeywordMatches)
};

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
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
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
    if (process.env[key] !== undefined && process.env[key] !== "") {
      return { key, value: process.env[key] };
    }
  }
  return undefined;
}

function boolFromEnv(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function sanitize(value) {
  return sanitizeCommonSensitive(value);
}

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

async function runCapture(command, args, timeoutMs = options.timeoutMs, captureOptions = {}) {
  const sanitizeStdout = captureOptions.sanitizeStdout !== false;
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      env: process.env
    });
    return {
      ok: true,
      stdout: sanitizeStdout ? sanitize(stdout.trim()) : stdout.trim(),
      stderr: sanitize(stderr.trim())
    };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args, 10000);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"], 10000);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function ocpConfig() {
  loadEnvFile();
  const baseUrl = firstEnv("OCP_API_BASE_URL", "OPENSHIFT_API_BASE_URL", "KUBE_API_BASE_URL");
  const token = firstEnv("OCP_API_TOKEN", "OPENSHIFT_API_TOKEN", "KUBE_API_TOKEN");
  const tlsVerify = firstEnv("OCP_TLS_VERIFY", "OPENSHIFT_API_TLS_VERIFY", "KUBE_TLS_VERIFY");
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
  const timeoutSeconds = Number(timeout?.value ?? Math.ceil(options.timeoutMs / 1000));
  return {
    baseUrl: baseUrl?.value,
    baseUrlSource: baseUrl?.key ?? "missing",
    token: token?.value,
    tokenSource: token?.key ?? "missing",
    tlsVerify: tlsVerify
      ? boolFromEnv(tlsVerify.value, true)
      : insecureSkip
        ? !boolFromEnv(insecureSkip.value, false)
        : true,
    timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
      ? timeoutSeconds * 1000
      : options.timeoutMs
  };
}

function ocBaseArgs(config) {
  const args = [];
  if (config.baseUrl && config.token) {
    args.push("--server", config.baseUrl, "--token", config.token);
    if (!config.tlsVerify) args.push("--insecure-skip-tls-verify=true");
  }
  args.push(`--request-timeout=${Math.ceil(config.timeoutMs / 1000)}s`);
  return args;
}

async function ocJson(config, args, label, required = true) {
  const result = await runCapture(
    "oc",
    [...ocBaseArgs(config), ...args, "-o", "json"],
    config.timeoutMs,
    { sanitizeStdout: false }
  );
  if (!result.ok) {
    const detail = result.stderr || result.stdout || "oc query failed";
    if (required) fail(label, detail);
    else warn(label, detail);
    return undefined;
  }
  try {
    const parsed = JSON.parse(result.stdout);
    pass(label, "read-only query succeeded");
    return parsed;
  } catch (error) {
    fail(label, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function listItems(json) {
  if (!json) return [];
  return Array.isArray(json.items) ? json.items : [json];
}

function metadataSummary(item) {
  return {
    kind: item.kind,
    namespace: item.metadata?.namespace ?? null,
    name: item.metadata?.name,
    labels: item.metadata?.labels ?? {}
  };
}

function pluginSummary(item) {
  return {
    ...metadataSummary(item),
    displayName: item.spec?.displayName,
    backendType: item.spec?.backend?.type,
    backendService: item.spec?.backend?.service
      ? {
          name: item.spec.backend.service.name,
          namespace: item.spec.backend.service.namespace,
          port: item.spec.backend.service.port,
          basePath: item.spec.backend.service.basePath
        }
      : undefined,
    proxy: (item.spec?.proxy ?? []).map((proxy) => ({
      alias: proxy.alias,
      authorization: proxy.authorization,
      service: proxy.endpoint?.service?.name,
      namespace: proxy.endpoint?.service?.namespace,
      port: proxy.endpoint?.service?.port
    }))
  };
}

function serviceSummary(item) {
  return {
    ...metadataSummary(item),
    type: item.spec?.type,
    selector: item.spec?.selector ?? {},
    ports: (item.spec?.ports ?? []).map((port) => ({
      name: port.name,
      port: port.port,
      targetPort: port.targetPort,
      protocol: port.protocol
    }))
  };
}

function deploymentSummary(item) {
  return {
    ...metadataSummary(item),
    replicas: item.spec?.replicas ?? 0,
    readyReplicas: item.status?.readyReplicas ?? 0,
    selector: item.spec?.selector?.matchLabels ?? {},
    templateLabels: item.spec?.template?.metadata?.labels ?? {},
    containers: (item.spec?.template?.spec?.containers ?? []).map((container) => ({
      name: container.name,
      image: container.image,
      ports: (container.ports ?? []).map((port) => ({
        name: port.name,
        containerPort: port.containerPort,
        protocol: port.protocol
      }))
    }))
  };
}

function podSummary(item) {
  return {
    ...metadataSummary(item),
    phase: item.status?.phase,
    ownerReferences: (item.metadata?.ownerReferences ?? []).map((owner) => ({
      kind: owner.kind,
      name: owner.name
    })),
    containers: (item.spec?.containers ?? []).map((container) => ({
      name: container.name,
      image: container.image
    }))
  };
}

function routeSummary(item) {
  return {
    ...metadataSummary(item),
    host: item.spec?.host ? "<redacted-route-host>" : undefined,
    to: item.spec?.to
      ? {
          kind: item.spec.to.kind,
          name: item.spec.to.name
        }
      : undefined,
    port: item.spec?.port?.targetPort,
    tlsTermination: item.spec?.tls?.termination
  };
}

function selectorMatches(selector = {}, labels = {}) {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([key, value]) => labels[key] === value);
}

function mapServiceToWorkloads(service, deployments, pods, routes) {
  const selector = service?.selector ?? {};
  const matchedDeployments = deployments.filter((deployment) =>
    selectorMatches(selector, deployment.templateLabels)
  );
  const matchedPods = pods.filter((pod) => selectorMatches(selector, pod.labels));
  const matchedRoutes = routes.filter((route) => route.to?.name === service?.name);
  return {
    service,
    deployments: matchedDeployments,
    pods: matchedPods,
    routes: matchedRoutes,
    images: [
      ...new Set(
        matchedDeployments.flatMap((deployment) =>
          deployment.containers.map((container) => container.image)
        )
      )
    ].sort()
  };
}

function consoleConfigSummary(configMap) {
  const raw = configMap?.data?.["console-config.yaml"];
  if (!raw) return undefined;
  try {
    const parsedConfig = YAML.parse(raw);
    const plugins = parsedConfig?.plugins ?? {};
    return {
      source: "openshift-console/configmap/console-config data.console-config.yaml",
      i18nNamespaces: (parsedConfig?.i18nNamespaces ?? []).filter((entry) =>
        /plugin__/i.test(String(entry))
      ),
      plugins: Object.keys(plugins),
      pluginsOrder: parsedConfig?.pluginsOrder ?? [],
      proxyServices: (parsedConfig?.proxy?.services ?? []).map((service) => ({
        authorize: service.authorize === true,
        consoleAPIPath: service.consoleAPIPath,
        endpoint: service.endpoint ? "<redacted-live-endpoint>" : undefined
      }))
    };
  } catch (error) {
    warn(
      "openshift-console console-config parse",
      `console-config.yaml could not be parsed: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

async function namespaceResources(config, namespace) {
  const [servicesJson, deploymentsJson, podsJson, routesJson] = await Promise.all([
    ocJson(config, ["-n", namespace, "get", "svc"], `${namespace} services`, false),
    ocJson(config, ["-n", namespace, "get", "deploy"], `${namespace} deployments`, false),
    ocJson(config, ["-n", namespace, "get", "pod"], `${namespace} pods`, false),
    ocJson(config, ["-n", namespace, "get", "route"], `${namespace} routes`, false)
  ]);
  return {
    namespace,
    services: listItems(servicesJson).map(serviceSummary),
    deployments: listItems(deploymentsJson).map(deploymentSummary),
    pods: listItems(podsJson).map(podSummary),
    routes: listItems(routesJson).map(routeSummary)
  };
}

function selectedSpecForKeyword(item) {
  const selected = {};
  if (item.spec?.displayName) selected.displayName = item.spec.displayName;
  if (item.spec?.plugins) selected.plugins = item.spec.plugins;
  if (item.spec?.backend?.service?.name) {
    selected.backendService = item.spec.backend.service.name;
    selected.backendNamespace = item.spec.backend.service.namespace;
  }
  if (item.spec?.proxy) {
    selected.proxy = item.spec.proxy.map((proxy) => ({
      alias: proxy.alias,
      service: proxy.endpoint?.service?.name,
      namespace: proxy.endpoint?.service?.namespace
    }));
  }
  if (item.spec?.selector) selected.selector = item.spec.selector;
  if (item.spec?.to?.name) selected.routeTo = item.spec.to.name;
  return selected;
}

function keywordMatchesForItems(items, resourceType, keywords, remainingLimit) {
  const matches = [];
  for (const item of items) {
    const selectedSpec = selectedSpecForKeyword(item);
    const labels = item.metadata?.labels ?? {};
    const annotationKeys = Object.keys(item.metadata?.annotations ?? {});
    const haystack = JSON.stringify({
      kind: item.kind,
      namespace: item.metadata?.namespace,
      name: item.metadata?.name,
      labels,
      annotationKeys,
      selectedSpec
    }).toLowerCase();
    const matchedKeywords = keywords.filter((keyword) => haystack.includes(keyword));
    if (matchedKeywords.length === 0) continue;
    matches.push({
      resourceType,
      kind: item.kind,
      namespace: item.metadata?.namespace ?? null,
      name: item.metadata?.name,
      matchedKeywords,
      labels,
      selectedSpec
    });
    if (matches.length >= remainingLimit) break;
  }
  return matches;
}

async function keywordSearch(config) {
  const keywords = ["komsco", "assistant", "chatbot", "lightspeed"];
  const namespacedTypes = [
    "deploy",
    "svc",
    "route",
    "pod",
    "configmap",
    "job",
    "buildconfig",
    "build",
    "imagestream",
    "serviceaccount",
    "role",
    "rolebinding",
    "subscriptions.operators.coreos.com",
    "clusterserviceversions.operators.coreos.com"
  ];
  const clusterTypes = [
    "consoleplugins.console.openshift.io",
    "consoles.operator.openshift.io",
    "olsconfigs.ols.openshift.io"
  ];
  const matches = [];
  const queryErrors = [];
  for (const type of namespacedTypes) {
    const result = await runCapture(
      "oc",
      [...ocBaseArgs(config), "get", type, "-A", "-o", "json"],
      config.timeoutMs,
      { sanitizeStdout: false }
    );
    if (!result.ok) {
      queryErrors.push({ resourceType: type, error: "query failed or resource type unavailable" });
      continue;
    }
    try {
      const parsedJson = JSON.parse(result.stdout);
      const remaining = Math.max(options.maxKeywordMatches - matches.length, 0);
      matches.push(...keywordMatchesForItems(listItems(parsedJson), type, keywords, remaining));
    } catch {
      queryErrors.push({ resourceType: type, error: "invalid JSON" });
    }
    if (matches.length >= options.maxKeywordMatches) break;
  }
  if (matches.length < options.maxKeywordMatches) {
    for (const type of clusterTypes) {
      const result = await runCapture(
        "oc",
        [...ocBaseArgs(config), "get", type, "-o", "json"],
        config.timeoutMs,
        { sanitizeStdout: false }
      );
      if (!result.ok) {
        queryErrors.push({ resourceType: type, error: "query failed or resource type unavailable" });
        continue;
      }
      try {
        const parsedJson = JSON.parse(result.stdout);
        const remaining = Math.max(options.maxKeywordMatches - matches.length, 0);
        matches.push(...keywordMatchesForItems(listItems(parsedJson), type, keywords, remaining));
      } catch {
        queryErrors.push({ resourceType: type, error: "invalid JSON" });
      }
      if (matches.length >= options.maxKeywordMatches) break;
    }
  }
  const countsByKeyword = Object.fromEntries(
    keywords.map((keyword) => [
      keyword,
      matches.filter((match) => match.matchedKeywords.includes(keyword)).length
    ])
  );
  return {
    keywords,
    maxMatches: options.maxKeywordMatches,
    truncated: matches.length >= options.maxKeywordMatches,
    countsByKeyword,
    matches,
    queryErrors
  };
}

function targetPluginFromList(consolePlugins) {
  const summaries = consolePlugins.map(pluginSummary);
  if (options.pluginName) {
    return summaries.find((plugin) => plugin.name === options.pluginName);
  }
  const exact = summaries.find((plugin) => plugin.displayName === options.displayName);
  if (exact) return exact;
  return summaries.find((plugin) =>
    String(plugin.displayName ?? "").toLowerCase().includes(options.displayName.toLowerCase())
  );
}

function pluginServiceNames(plugin) {
  return [
    plugin?.backendService,
    ...(plugin?.proxy ?? []).map((proxy) => ({
      name: proxy.service,
      namespace: proxy.namespace,
      port: proxy.port,
      kind: "proxy",
      alias: proxy.alias
    }))
  ].filter((service) => service?.name && service?.namespace);
}

function sourceOfUi(plugin, resourceSets) {
  if (!plugin?.backendService) return undefined;
  const resourceSet = resourceSets.find(
    (set) => set.namespace === plugin.backendService.namespace
  );
  if (!resourceSet) return undefined;
  const service = resourceSet.services.find(
    (candidate) => candidate.name === plugin.backendService.name
  );
  if (!service) return undefined;
  return mapServiceToWorkloads(
    service,
    resourceSet.deployments,
    resourceSet.pods,
    resourceSet.routes
  );
}

function relatedServiceMappings(plugin, resourceSets) {
  return pluginServiceNames(plugin).map((serviceRef) => {
    const resourceSet = resourceSets.find((set) => set.namespace === serviceRef.namespace);
    const service = resourceSet?.services.find((candidate) => candidate.name === serviceRef.name);
    return {
      role: serviceRef.kind === "proxy" ? "proxy" : "backend-ui",
      alias: serviceRef.alias,
      namespace: serviceRef.namespace,
      name: serviceRef.name,
      port: serviceRef.port,
      mapping: service && resourceSet
        ? mapServiceToWorkloads(service, resourceSet.deployments, resourceSet.pods, resourceSet.routes)
        : undefined
    };
  });
}

function artifactHasForbiddenLeak(serialized) {
  return sensitiveEndpointLeakLike(serialized) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(serialized) ||
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(serialized) ||
    /(?:password|passwd|secret|api[_-]?key|token)(=|:)(?!<redacted>)[^\s"']+/i.test(serialized) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(serialized);
}

async function main() {
  const config = ocpConfig();
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    "origin/main"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  if (!config.baseUrl || !config.token) {
    warn(
      "OCP API target",
      `baseUrlSource=${config.baseUrlSource} tokenSource=${config.tokenSource}; values redacted`
    );
  } else {
    pass(
      "OCP API target",
      `baseUrlSource=${config.baseUrlSource} tokenSource=${config.tokenSource}; values redacted`
    );
  }

  const consolePluginsJson = await ocJson(
    config,
    ["get", "consoleplugins.console.openshift.io"],
    "console plugins list"
  );
  const consoleOperatorJson = await ocJson(
    config,
    ["get", "consoles.operator.openshift.io", "cluster"],
    "console operator cluster"
  );
  const consoleDeployJson = await ocJson(
    config,
    ["-n", "openshift-console", "get", "deploy", "console"],
    "openshift-console deployment",
    false
  );
  const consoleConfigMapJson = await ocJson(
    config,
    ["-n", "openshift-console", "get", "configmap", "console-config"],
    "openshift-console console-config",
    false
  );

  const consolePluginItems = listItems(consolePluginsJson);
  const consolePlugins = consolePluginItems.map(pluginSummary);
  const targetPlugin = targetPluginFromList(consolePluginItems);
  if (targetPlugin) {
    pass(
      "target assistant ConsolePlugin",
      `${targetPlugin.name} displayName=${targetPlugin.displayName}`
    );
  } else {
    fail(
      "target assistant ConsolePlugin",
      options.pluginName
        ? `ConsolePlugin ${options.pluginName} not found`
        : `displayName ${options.displayName} not found`
    );
  }

  const operatorPlugins = consoleOperatorJson?.spec?.plugins ?? [];
  if (targetPlugin && operatorPlugins.includes(targetPlugin.name)) {
    pass("console operator plugin enablement", `${targetPlugin.name} is enabled`);
  } else if (targetPlugin) {
    fail("console operator plugin enablement", `${targetPlugin.name} is not enabled`);
  }

  const namespaces = [
    "openshift-console",
    "openshift-lightspeed",
    ...pluginServiceNames(targetPlugin).map((service) => service.namespace)
  ].filter(Boolean);
  const uniqueNamespaces = [...new Set(namespaces)];
  const resourceSets = [];
  for (const namespace of uniqueNamespaces) {
    resourceSets.push(await namespaceResources(config, namespace));
  }

  const uiProvider = sourceOfUi(targetPlugin, resourceSets);
  if (uiProvider?.deployments?.length) {
    pass(
      "target UI provider workload",
      `${targetPlugin.backendService.namespace}/${targetPlugin.backendService.name} maps to ${uiProvider.deployments.map((deployment) => deployment.name).join(", ")}`
    );
  } else if (targetPlugin?.backendService) {
    fail(
      "target UI provider workload",
      `${targetPlugin.backendService.namespace}/${targetPlugin.backendService.name} did not map to a deployment`
    );
  }

  const relatedMappings = relatedServiceMappings(targetPlugin, resourceSets);
  const keywordSearchResult = await keywordSearch(config);
  if (keywordSearchResult.queryErrors.length === 0) {
    pass("keyword resource search", `${keywordSearchResult.matches.length} matching resource(s) captured`);
  } else {
    warn(
      "keyword resource search",
      `${keywordSearchResult.matches.length} match(es), ${keywordSearchResult.queryErrors.length} query error(s)`
    );
  }

  const missingEvidence = [];
  if (!targetPlugin) missingEvidence.push("target assistant ConsolePlugin was not found");
  if (targetPlugin && !operatorPlugins.includes(targetPlugin.name)) {
    missingEvidence.push(`${targetPlugin.name} is not enabled in consoles.operator.openshift.io/cluster`);
  }
  if (targetPlugin?.backendService && !uiProvider?.deployments?.length) {
    missingEvidence.push("target backend service did not map to a deployment");
  }
  if (!consoleDeployJson) missingEvidence.push("openshift-console deployment was not readable");

  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const status = failCount > 0 ? "FAIL" : missingEvidence.length > 0 ? "NEEDS_EVIDENCE" : "PASS";
  const artifact = {
    schema: "cywell.opslens.console-assistant-provider.v0.1",
    artifactType: "opslens.console-assistant-provider.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnlyTraceOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-OP-003", "AC-LS-002", "AC-DASH-001"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    target: {
      displayName: options.displayName,
      pluginName: options.pluginName ?? targetPlugin?.name ?? null
    },
    consolePlugins,
    consoleOperator: {
      name: consoleOperatorJson?.metadata?.name,
      enabledPlugins: operatorPlugins
    },
    openshiftConsole: {
      deployment: consoleDeployJson ? deploymentSummary(consoleDeployJson) : undefined,
      consoleConfig: consoleConfigSummary(consoleConfigMapJson)
    },
    targetPlugin,
    relatedServices: relatedMappings,
    uiProvider,
    openshiftLightspeed: resourceSets.find((set) => set.namespace === "openshift-lightspeed"),
    keywordSearch: keywordSearchResult,
    missingEvidence,
    evidence: [
      "ConsolePlugin objects are read through the Kubernetes API only.",
      "openshift-console plugin enablement is read from consoles.operator.openshift.io/cluster and console-config ConfigMap.",
      "Service-to-workload mapping is derived from Service selectors against Deployment template labels and Pod labels.",
      "Route hosts, configured live endpoints, tokens, and secret-like values are redacted or omitted.",
      "No apply, patch, delete, scale, install, push, mirror, sign, or Secret fetch is attempted."
    ],
    risk: [
      "This trace proves the current provider graph, not that the assistant behavior is correct.",
      "A matching Service can select completed helper pods as well as the live Deployment; the UI provider should be interpreted from ready Deployment images first.",
      "If the plugin display name changes, rerun with --plugin-name for an exact lookup."
    ],
    rollbackPath: [
      "No rollback is required because this verifier is read-only.",
      "If the wrong plugin is enabled, review ConsolePlugin and console operator settings before any approved change.",
      "Regenerate this evidence after any ConsolePlugin, Service, Deployment, Route, or image change."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (artifactHasForbiddenLeak(serialized)) {
    throw new Error("console assistant provider evidence would include a secret or unredacted live endpoint");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("console assistant provider evidence export", `${resolve(options.evidenceOut)} written`);

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
    `Cywell OpsLens console assistant provider trace: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );
  if (status === "FAIL") process.exitCode = 1;
}

main().catch((error) => {
  fail(
    "console assistant provider trace runtime",
    error instanceof Error ? error.message : String(error)
  );
  console.error(
    `[FAIL] console assistant provider trace runtime: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
