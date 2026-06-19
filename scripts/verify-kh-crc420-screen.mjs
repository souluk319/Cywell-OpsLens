#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const consoleUrl =
  process.argv.find((arg) => arg.startsWith("--console-url="))?.split("=")[1] ??
  process.env.CYWELL_KH_CONSOLE_URL ??
  "https://console-openshift-console.apps-crc.testing/opslens";
const dashboardUrl =
  process.argv.find((arg) => arg.startsWith("--dashboard-url="))?.split("=")[1] ??
  process.env.CYWELL_KH_DASHBOARD_URL ??
  "https://cywell-opslens-dashboard-cywell-opslens.apps-crc.testing";
const evidenceOut = resolve("test-results/cywell-opslens-kh-crc420-screen.json");
const screenshotDir = resolve("test-results/screen-kh-018");

const checks = [];
const warnings = [];
const failures = [];

function run(command, args, timeoutMs = 10000) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? result.error?.message ?? ""
  };
}

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, "<redacted-ip>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function record(status, id, detail, extra = {}) {
  const item = { status, id, detail: redact(detail), ...extra };
  checks.push(item);
  if (status === "WARN") warnings.push(`${id}: ${item.detail}`);
  if (status === "FAIL") failures.push(`${id}: ${item.detail}`);
  console.log(`[${status}] ${id}: ${item.detail}`);
}

function pass(id, detail, extra) {
  record("PASS", id, detail, extra);
}

function warn(id, detail, extra) {
  record("WARN", id, detail, extra);
}

function fail(id, detail, extra) {
  record("FAIL", id, detail, extra);
}

function compactText(text) {
  return redact(String(text ?? "").replace(/\s+/g, " ").trim()).slice(0, 1600);
}

function has404Text(text) {
  return /404|not found|페이지를 찾을 수 없음/i.test(text ?? "");
}

function isOAuthLogin(url, text) {
  return /oauth-openshift.*\/login/i.test(url ?? "") || /Log in to your account|Welcome to Red Hat OpenShift/i.test(text ?? "");
}

async function capturePage(page, name, url) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const screenshot = resolve(screenshotDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  return {
    name,
    url,
    status: response?.status() ?? null,
    finalUrl: redact(page.url()),
    title: redact(await page.title().catch(() => "")),
    has404: has404Text(bodyText),
    hasOpsLens: /OpsLens|Cywell|KOMSCO/i.test(bodyText),
    isOAuthLogin: isOAuthLogin(page.url(), bodyText),
    textPreview: compactText(bodyText),
    screenshot
  };
}

console.log("Cywell OpsLens KH CRC 4.20 screen gate");

const branch = run("git", ["branch", "--show-current"]).stdout || "unknown";
const head = run("git", ["rev-parse", "--short", "HEAD"]).stdout || "unknown";
console.log(`branch=${branch} head=${head}`);

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
const page = await context.newPage();

const captures = [];
try {
  captures.push(await capturePage(page, "dashboard-route", dashboardUrl));
  captures.push(await capturePage(page, "console-opslens", consoleUrl));
} finally {
  await browser.close();
}

const dashboard = captures.find((item) => item.name === "dashboard-route");
if (dashboard?.status === 200 && dashboard.hasOpsLens && !dashboard.has404) {
  pass(
    "screen:dashboard-route-rendered",
    `dashboard route rendered ${dashboard.title || "untitled"} without 404`,
    { screenshot: dashboard.screenshot }
  );
} else {
  fail(
    "screen:dashboard-route-rendered",
    `status=${dashboard?.status ?? "missing"} hasOpsLens=${dashboard?.hasOpsLens} has404=${dashboard?.has404}`,
    { screenshot: dashboard?.screenshot }
  );
}

const consoleCapture = captures.find((item) => item.name === "console-opslens");
if (consoleCapture?.status === 200 && !consoleCapture.has404) {
  if (consoleCapture.hasOpsLens) {
    pass(
      "screen:console-opslens-authenticated-render",
      "console /opslens rendered OpsLens content without first-load 404",
      { screenshot: consoleCapture.screenshot }
    );
} else if (consoleCapture.isOAuthLogin) {
    pass(
      "screen:console-opslens-non404-auth-boundary",
      "console /opslens reached the OpenShift OAuth login boundary without first-load 404",
      { screenshot: consoleCapture.screenshot }
    );
    warn(
      "screen:console-opslens-authenticated-render",
      "authenticated browser-session click test is still required to prove the logged-in console menu opens OpsLens without refresh"
    );
  } else if (!consoleCapture.textPreview && /Red Hat OpenShift/i.test(consoleCapture.title ?? "")) {
    pass(
      "screen:console-opslens-non404-console-shell",
      "console /opslens opened the OpenShift console shell without first-load 404 in headless mode",
      { screenshot: consoleCapture.screenshot }
    );
    warn(
      "screen:console-opslens-authenticated-render",
      "headless browser stopped at the console shell spinner; authenticated user-browser session verification is still required"
    );
  } else {
    warn(
      "screen:console-opslens-unexpected-200",
      `console /opslens returned HTTP 200 without 404 but did not expose OpsLens or OAuth login text: ${consoleCapture.textPreview}`,
      { screenshot: consoleCapture.screenshot }
    );
  }
} else {
  fail(
    "screen:console-opslens-non404",
    `status=${consoleCapture?.status ?? "missing"} has404=${consoleCapture?.has404}`,
    { screenshot: consoleCapture?.screenshot }
  );
}

const finalStatus = failures.length > 0 ? "FAIL" : warnings.length > 0 ? "PASS_WITH_WARNINGS" : "PASS";
const evidence = {
  generatedAt: new Date().toISOString(),
  branch,
  head,
  finalStatus,
  consoleUrl,
  dashboardUrl,
  checks,
  warnings,
  failures,
  captures
};

await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`KH CRC 4.20 screen final status: ${finalStatus}`);
console.log(`Evidence: ${evidenceOut}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
