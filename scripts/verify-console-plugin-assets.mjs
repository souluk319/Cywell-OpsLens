#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";

const checks = [];
const evidenceOut = "test-results/cywell-opslens-console-plugin-assets.json";

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

function consoleApiRangeSupportsOcp421(range) {
  return typeof range === "string" && range.includes(">=4.16.0") && range.includes("<4.22.0");
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file exists", `${path} is not readable: ${error.message}`);
    return "";
  }
}

async function readJson(path) {
  const text = await readText(path);
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("valid JSON", `${path}: ${error.message}`);
    return undefined;
  }
}

async function readYamlDocuments(path) {
  const text = await readText(path);
  if (!text) {
    return [];
  }

  try {
    return YAML.parseAllDocuments(text)
      .map((document) => document.toJSON())
      .filter(Boolean);
  } catch (error) {
    fail("valid YAML", `${path}: ${error.message}`);
    return [];
  }
}

function gitValue(args, fallback) {
  try {
    return (
      execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim() || fallback
    );
  } catch {
    return fallback;
  }
}

function gitDirty() {
  try {
    return execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return true;
  }
}

function printSummary() {
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failCount = checks.filter((check) => check.status === "FAIL").length;
  console.log(`\nCywell OpsLens ConsolePlugin asset verification: ${failCount} fail, ${checks.length} checks`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

const pluginName = "cywell-opslens";
const dashboardHref =
  "/api/plugins/cywell-opslens/index.html?apiBase=%2Fapi%2Fproxy%2Fplugin%2Fcywell-opslens%2Fopslens-api&surface=console-plugin";
const pluginNamespace = "cywell-opslens-system";
const pluginServiceName = "cywell-opslens-console-plugin";
const manifest = await readJson("apps/web/dist/plugin-manifest.json");
const packageJson = await readJson("apps/web/package.json");
const extensions = await readJson("apps/web/console-extensions.json");
const indexHtml = await readText("apps/web/dist/index.html");
const routeSource = await readText("apps/web/src/plugin/OpsLensRoute.tsx");
const apiSource = await readText("apps/web/src/lib/api.ts");
const serveSource = await readText("apps/web/scripts/serve.mjs");
const manualNamespaceDocs = await readYamlDocuments("deploy/console-plugin/00-namespace.yaml");
const manualWorkloadDocs = await readYamlDocuments("deploy/console-plugin/10-console-plugin-workload.yaml");
const manualPluginDocs = await readYamlDocuments("deploy/console-plugin/20-consoleplugin.yaml");
const manualReadme = await readText("deploy/console-plugin/README.md");
const enablePatchSource = await readText("scripts/print-console-plugin-enable-patch.mjs");

expectCheck(
  "plugin manifest identity",
  manifest?.name === pluginName &&
    manifest?.version === "0.1.0" &&
    manifest?.registrationMethod === "callback" &&
    manifest?.baseURL === `/api/plugins/${pluginName}/`,
  "manifest names cywell-opslens and uses the Console Bridge plugin base URL"
);

expectCheck(
  "plugin manifest scripts",
  Array.isArray(manifest?.loadScripts) &&
    manifest.loadScripts.includes("plugin-entry.js") &&
    existsSync(resolve("apps/web/dist/plugin-entry.js")) &&
    existsSync(resolve("apps/web/dist/exposed-OpsLensRoute-chunk.js")),
  "plugin-entry.js and the OpsLens launcher route chunk are emitted"
);

expectCheck(
  "plugin dependency range",
  manifest?.dependencies?.["@console/pluginAPI"] === packageJson?.consolePlugin?.dependencies?.["@console/pluginAPI"] &&
    consoleApiRangeSupportsOcp421(packageJson?.consolePlugin?.dependencies?.["@console/pluginAPI"]),
  "plugin declares one Console API compatibility range in source and built manifest, including CRC OpenShift 4.21"
);

expectCheck(
  "plugin launcher route module",
  packageJson?.consolePlugin?.exposedModules?.OpsLensRoute === "./src/plugin/OpsLensRoute" &&
    manifest?.extensions?.some((extension) => JSON.stringify(extension).includes("$codeRef")),
  "ConsolePlugin exposes only the OpsLensRoute launcher module for /opslens"
);

const sourceExtensions = Array.isArray(extensions) ? extensions : [];
const manifestExtensions = Array.isArray(manifest?.extensions) ? manifest.extensions : [];
expectCheck(
  "plugin extension set",
  sourceExtensions.length === 2 &&
    manifestExtensions.some(
      (extension) =>
        extension.type === "console.navigation/href" &&
        extension.properties?.id === pluginName &&
        extension.properties?.name === "Cywell OpsLens" &&
        extension.properties?.href === "/opslens" &&
        extension.properties?.perspective === "admin" &&
        extension.properties?.section === undefined &&
        Array.isArray(extension.properties?.insertAfter) &&
        JSON.stringify(extension.properties?.startsWith) === JSON.stringify(["/opslens"]) &&
        extension.properties?.dataAttributes?.testid === "cywell-opslens-nav"
    ) &&
    manifestExtensions.some(
      (extension) =>
        extension.type === "console.page/route" &&
        extension.properties?.path === "/opslens" &&
        extension.properties?.exact === true &&
        extension.properties?.component?.$codeRef === "OpsLensRoute"
    ) &&
    !manifestExtensions.some((extension) => extension.type === "console.page/route/standalone") &&
    !manifestExtensions.some((extension) => extension.properties?.path === "/cywell-opslens"),
  "Administrator navigation opens /opslens, whose route is a launcher to the independent OpsLens dashboard asset"
);

expectCheck(
  "plugin launcher route",
  routeSource.includes("export default function OpsLensRoute") &&
    routeSource.includes("window.location.replace") &&
    routeSource.includes(dashboardHref) &&
    routeSource.includes("return null") &&
    !routeSource.includes("<iframe") &&
    !routeSource.includes("createElement") &&
    !routeSource.includes("%plugin__"),
  "OpsLensRoute redirects to the OpsLens app asset, passes the UserToken proxy base, and renders no embedded UI"
);

expectCheck(
  "dashboard asset relative paths",
  indexHtml.includes('src="./assets/') &&
    indexHtml.includes('href="./assets/') &&
    !indexHtml.includes('src="/assets/') &&
    !indexHtml.includes('href="/assets/'),
  "dashboard index uses relative asset URLs so /api/plugins/cywell-opslens/index.html can load its JavaScript and CSS",
  "dashboard index must not use absolute /assets URLs when served from the ConsolePlugin asset path"
);

expectCheck(
  "dashboard API proxy base",
  apiSource.includes('searchParams.get("apiBase")') &&
    apiSource.includes("resolveApiPath") &&
    apiSource.includes("requestPath") &&
    apiSource.includes("fetch(requestPath"),
  "dashboard fetch calls can be routed through /api/proxy/plugin/cywell-opslens/opslens-api"
);

expectCheck(
  "plugin asset MIME",
  serveSource.includes('[".js", "text/javascript; charset=utf-8"]') &&
    serveSource.includes('[".json", "application/json; charset=utf-8"]'),
  "dashboard web server serves JavaScript and JSON with explicit MIME types for Console nosniff"
);

const manualNamespace = manualNamespaceDocs.find((doc) => doc.kind === "Namespace");
const manualDeployment = manualWorkloadDocs.find((doc) => doc.kind === "Deployment");
const manualService = manualWorkloadDocs.find((doc) => doc.kind === "Service");
const manualConsolePlugin = manualPluginDocs.find((doc) => doc.kind === "ConsolePlugin");

expectCheck(
  "manual console plugin namespace",
  manualNamespace?.metadata?.name === pluginNamespace,
  "manual ConsolePlugin deploy creates cywell-opslens-system namespace before plugin resources"
);

expectCheck(
  "manual console plugin workload",
  manualDeployment?.metadata?.name === pluginServiceName &&
    manualDeployment?.metadata?.namespace === pluginNamespace &&
    manualDeployment?.spec?.template?.spec?.containers?.[0]?.name === "console-plugin" &&
    typeof manualDeployment?.spec?.template?.spec?.containers?.[0]?.image === "string" &&
    !manualDeployment.spec.template.spec.containers[0].image.includes("IMAGE_PLACEHOLDER") &&
    manualDeployment.spec.template.spec.containers[0].ports?.some(
      (port) => port.name === "https" && port.containerPort === 9443
    ) &&
    manualDeployment.spec.template.spec.containers[0].readinessProbe?.httpGet?.scheme === "HTTPS" &&
    manualDeployment.spec.template.spec.containers[0].env?.some(
      (env) => env.name === "CYWELL_OPSLENS_TLS_CERT_FILE"
    ) &&
    manualDeployment.spec.template.spec.volumes?.some(
      (volume) => volume.secret?.secretName === "cywell-opslens-console-plugin-tls"
    ),
  "manual ConsolePlugin deploy defines an HTTPS asset Deployment with service-ca TLS and no image placeholder"
);

expectCheck(
  "manual console plugin service",
  manualService?.metadata?.name === pluginServiceName &&
    manualService?.metadata?.namespace === pluginNamespace &&
    manualService?.metadata?.annotations?.["service.beta.openshift.io/serving-cert-secret-name"] ===
      "cywell-opslens-console-plugin-tls" &&
    manualService?.spec?.ports?.some(
      (port) => port.name === "https" && port.port === 9443 && port.targetPort === "https"
    ),
  "manual ConsolePlugin deploy exposes cywell-opslens-console-plugin Service on HTTPS 9443 with OpenShift service-ca"
);

expectCheck(
  "manual console plugin CR",
  manualConsolePlugin?.metadata?.name === pluginName &&
    manualConsolePlugin?.spec?.displayName === "Cywell OpsLens" &&
    manualConsolePlugin?.spec?.backend?.type === "Service" &&
    manualConsolePlugin?.spec?.backend?.service?.name === pluginServiceName &&
    manualConsolePlugin?.spec?.backend?.service?.namespace === pluginNamespace &&
    manualConsolePlugin?.spec?.backend?.service?.port === 9443 &&
    manualConsolePlugin?.spec?.backend?.service?.basePath === "/" &&
    manualConsolePlugin?.spec?.i18n?.loadType === "Preload" &&
    manualConsolePlugin?.spec?.proxy?.some(
      (proxy) =>
        proxy.alias === "opslens-api" &&
        proxy.authorization === "UserToken" &&
        proxy.endpoint?.type === "Service"
    ),
  "manual ConsolePlugin deploy points at the plugin Service backend and keeps the UserToken API proxy contract"
);

expectCheck(
  "console plugin enable patch helper",
  enablePatchSource.includes('path: "/spec/plugins"') &&
    enablePatchSource.includes('path: "/spec/plugins/-"') &&
    enablePatchSource.includes("plugins.includes(pluginName)") &&
    enablePatchSource.includes("patch = []") &&
    !enablePatchSource.includes('"replace"') &&
    manualReadme.includes("print-console-plugin-enable-patch.mjs") &&
    manualReadme.includes("If the generated patch is `[]`") &&
    manualReadme.includes("without removing any existing plugin"),
  "enablement helper creates spec.plugins when absent, appends when missing, no-ops when present, and documents merge-safe use"
);

const failCount = checks.filter((check) => check.status === "FAIL").length;
const evidence = {
  schema: "cywell.opslens.console-plugin-assets.v0.1",
  artifactType: "opslens.console-plugin-assets.v0.1",
  generatedAt: new Date().toISOString(),
  status: failCount > 0 ? "BLOCKED" : "PASS",
  failCount,
  checkCount: checks.length,
  actionMode: "consolePluginAssetsOnly",
  registryMutationAttempted: false,
  clusterMutationAttempted: false,
  mutationAllowedByThisVerifier: false,
  acceptance: ["AC-OP-003", "AC-DASH-001"],
  ref: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    worktreeDirty: gitDirty()
  },
  plugin: {
    name: manifest?.name,
    version: manifest?.version,
    baseURL: manifest?.baseURL,
    loadScripts: manifest?.loadScripts ?? [],
    extensionTypes: manifestExtensions.map((extension) => extension.type),
    dashboardHref,
    navigationHref: manifestExtensions.find((extension) => extension.type === "console.navigation/href")
      ?.properties?.href
  },
  manualConsolePluginDeploy: {
    namespace: pluginNamespace,
    deployment: manualDeployment?.metadata?.name,
    service: manualService?.metadata?.name,
    consolePlugin: manualConsolePlugin?.metadata?.name,
    enablePatchHelper: "scripts/print-console-plugin-enable-patch.mjs",
    liveEvidenceRequired: [
      "ConsolePlugin exists in the cluster",
      "console.operator.openshift.io/cluster spec.plugins contains cywell-opslens",
      "OpenShift Console Administrator left navigation shows Cywell OpsLens",
      "Clicking Cywell OpsLens opens /opslens and redirects to the OpsLens dashboard app asset"
    ]
  },
  checks
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`);
pass("console plugin evidence export", `${resolve(evidenceOut)} written`);

printSummary();
