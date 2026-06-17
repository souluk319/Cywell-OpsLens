#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidenceOut = "test-results/cywell-opslens-web-shell-contract.json";
const checks = [];

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
    fail("file readable", `${path} is not readable: ${error.message}`);
    return "";
  }
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || fallback;
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

const appSource = await readText("apps/web/src/App.tsx");
const assistantSource = await readText("apps/web/src/components/AssistantPopover.tsx");
const evidenceSource = await readText("apps/web/src/components/ConsoleEvidencePane.tsx");
const overviewSource = await readText("apps/web/src/components/OcpConsoleOverview.tsx");
const dashboardSource = await readText("apps/web/src/components/OperationsDashboard.tsx");
const explorerSource = await readText("apps/web/src/components/OcpResourceExplorer.tsx");
const adminSource = await readText("apps/web/src/components/OpsLensAdminDashboard.tsx");
const routeSource = await readText("apps/web/src/plugin/OpsLensRoute.tsx");
const stylesSource = await readText("apps/web/src/styles/app.css");

expectCheck(
  "runtime surface badge",
  appSource.includes('data-testid="runtime-surface"') &&
    appSource.includes('data-testid="api-route-mode"') &&
    appSource.includes("Standalone dev") &&
    appSource.includes("Console plugin"),
  "dashboard shell distinguishes standalone dev mode from ConsolePlugin mode"
);

expectCheck(
  "console plugin proxy detection",
  appSource.includes('surface === "console-plugin"') &&
    appSource.includes('/api/proxy/plugin/cywell-opslens/') &&
    routeSource.includes("surface=console-plugin") &&
    routeSource.includes("encodeURIComponent(apiProxyBase)"),
  "console route passes the UserToken proxy base and the shell recognizes plugin hosting"
);

expectCheck(
  "KOMSCO assistant branding",
  assistantSource.includes("KOMSCO AI Assistant") &&
    appSource.includes("KOMSCO AI Assistant") &&
    !assistantSource.includes("Context-aware assistant") &&
    !appSource.includes("context-aware assistant"),
  "assistant copy is branded for KOMSCO instead of generic context-aware wording"
);

expectCheck(
  "OpsLens assistant icon",
  assistantSource.includes("cywell_ops_lens_icon.png") &&
    assistantSource.includes("assistant-app-icon") &&
    appSource.includes("launcher-icon-image") &&
    stylesSource.includes(".assistant-app-icon") &&
    stylesSource.includes(".launcher-icon-image"),
  "assistant header and floating launcher use the OpsLens icon asset"
);

expectCheck(
  "language prop contract",
  appSource.includes('useState<UiLanguage>') &&
    appSource.includes("<OperationsDashboard dashboard={dashboard} language={language}") &&
    appSource.includes("<OcpConsoleOverview language={language}") &&
    appSource.includes("<OcpResourceExplorer") &&
    appSource.includes("<OpsLensAdminDashboard language={language}") &&
    appSource.includes("language={language}") &&
    evidenceSource.includes("const evidenceCopy") &&
    overviewSource.includes("const overviewCopy") &&
    dashboardSource.includes("const dashboardCopy") &&
    explorerSource.includes("const explorerCopy") &&
    adminSource.includes("const adminCopy"),
  "primary console panels, admin dashboard, and the resource explorer receive the selected language and own bilingual copy"
);

expectCheck(
  "localized shell persistence",
  appSource.includes('window.localStorage.setItem("cywell-opslens-language", language)') &&
    appSource.includes("document.documentElement.lang = language") &&
    appSource.includes("KO") &&
    appSource.includes("EN"),
  "language toggle persists the selected language and updates the document language"
);

const failCount = checks.filter((check) => check.status === "FAIL").length;
pass("web shell evidence export", `${resolve(evidenceOut)} written`);

const evidence = {
  schema: "cywell.opslens.web-shell-contract.v0.1",
  artifactType: "opslens.web-shell-contract.v0.1",
  generatedAt: new Date().toISOString(),
  status: failCount > 0 ? "BLOCKED" : "PASS",
  failCount,
  checkCount: checks.length,
  actionMode: "staticSourceContractOnly",
  clusterMutationAttempted: false,
  registryMutationAttempted: false,
  acceptance: ["AC-UI-001", "AC-DASH-001", "AC-OP-003"],
  ref: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    worktreeDirty: gitDirty()
  },
  checks
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`);

for (const check of checks) {
  console.log(`[${check.status}] ${check.name}: ${check.detail}`);
}

const finalFailCount = checks.filter((check) => check.status === "FAIL").length;
console.log(`\nCywell OpsLens web shell contract: ${finalFailCount} fail, ${checks.length} checks`);
if (finalFailCount > 0) {
  process.exitCode = 1;
}
