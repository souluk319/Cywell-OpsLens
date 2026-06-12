#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
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
const manifest = await readJson("apps/web/dist/plugin-manifest.json");
const packageJson = await readJson("apps/web/package.json");
const extensions = await readJson("apps/web/console-extensions.json");
const routeSource = await readText("apps/web/src/plugin/OpsLensRoute.tsx");
const apiSource = await readText("apps/web/src/lib/api.ts");
const serveSource = await readText("apps/web/scripts/serve.mjs");

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
  "plugin-entry.js and exposed OpsLens route chunk are emitted"
);

expectCheck(
  "plugin dependency range",
  manifest?.dependencies?.["@console/pluginAPI"] === ">=4.16.0 <4.20.0" &&
    packageJson?.consolePlugin?.dependencies?.["@console/pluginAPI"] === ">=4.16.0 <4.20.0",
  "plugin declares the same Console API compatibility range as the source package metadata"
);

expectCheck(
  "plugin exposed module",
  packageJson?.consolePlugin?.exposedModules?.OpsLensRoute === "./src/plugin/OpsLensRoute" &&
    routeSource.includes("export default function OpsLensRoute"),
  "OpsLensRoute is exposed for Console route codeRef loading"
);

const sourceExtensions = Array.isArray(extensions) ? extensions : [];
const manifestExtensions = Array.isArray(manifest?.extensions) ? manifest.extensions : [];
expectCheck(
  "plugin extension set",
  sourceExtensions.length === 3 &&
    manifestExtensions.some((extension) => extension.type === "console.navigation/section") &&
    manifestExtensions.some(
      (extension) =>
        extension.type === "console.navigation/href" &&
        extension.properties?.href === "/opslens" &&
        extension.properties?.section === pluginName
    ) &&
    manifestExtensions.some(
      (extension) =>
        extension.type === "console.page/route" &&
        extension.properties?.path === "/opslens" &&
        extension.properties?.component?.$codeRef === "OpsLensRoute.default"
    ),
  "navigation section, navigation href, and /opslens route are emitted in the manifest"
);

expectCheck(
  "plugin route iframe proxy",
  routeSource.includes('const pluginName = "cywell-opslens"') &&
    routeSource.includes("/api/plugins/") &&
    routeSource.includes("/index.html?apiBase=") &&
    routeSource.includes("/api/proxy/plugin/") &&
    routeSource.includes("/opslens-api") &&
    routeSource.includes("apiBase=") &&
    routeSource.includes("opslens-console-plugin-frame"),
  "route opens the dashboard through the Console plugin asset endpoint and passes the UserToken proxy base"
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

const evidence = {
  artifactType: "opslens.console-plugin-assets.v0.1",
  generatedAt: new Date().toISOString(),
  refs: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    dirty: gitDirty()
  },
  plugin: {
    name: manifest?.name,
    version: manifest?.version,
    baseURL: manifest?.baseURL,
    loadScripts: manifest?.loadScripts ?? [],
    extensionTypes: manifestExtensions.map((extension) => extension.type)
  },
  checks
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`);
pass("console plugin evidence export", `${resolve(evidenceOut)} written`);

printSummary();
