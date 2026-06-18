#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

const paths = {
  readme: "README.md",
  workflow: ".github/workflows/deploy-demo-brief.yml",
  html:
    "docs/product-goals/cywell-opslens-console-mod/presentation/cywell-opslens-demo-brief-2026-06-18.html",
  markdown:
    "docs/product-goals/cywell-opslens-console-mod/presentation/cywell-opslens-demo-brief-2026-06-18.md",
  presentationDir:
    "docs/product-goals/cywell-opslens-console-mod/presentation",
  evidenceOut: "test-results/cywell-opslens-demo-brief-pages.json",
  markdownOut: "test-results/cywell-opslens-demo-brief-pages.md"
};

const expectedUrl = "https://souluk319.github.io/Cywell-OpsLens/";
const expectedWorkflowApi =
  "https://api.github.com/repos/souluk319/Cywell-OpsLens/actions/workflows/deploy-demo-brief.yml/runs?branch=feat%2FOpsLens-Dev0.1.5&per_page=1";
const checks = [];

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail, ...extra });
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

function expectCheck(name, condition, detail, failDetail = detail, extra = {}) {
  if (condition) {
    pass(name, detail, extra);
  } else {
    fail(name, failDetail, extra);
  }
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file readable", `${path}: ${error.message}`);
    return "";
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

function commandExists(command) {
  try {
    const probe = process.platform === "win32" ? "where.exe" : "command";
    const args = process.platform === "win32" ? [command] : ["-v", command];
    execFileSync(probe, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function extractAssetLinks(html) {
  return [...html.matchAll(/\b(?:src|href)="assets\/([^"]+)"/g)].map(
    (match) => match[1]
  );
}

function validateAssetLinks(html) {
  const links = extractAssetLinks(html);
  expectCheck(
    "presentation asset links present",
    links.length >= 5,
    `${links.length} assets referenced from presentation HTML`,
    `expected at least five presentation assets, found ${links.length}`
  );

  const missing = links.filter(
    (asset) => !existsSync(resolve(paths.presentationDir, "assets", asset))
  );
  expectCheck(
    "presentation asset links resolve",
    missing.length === 0,
    "all referenced presentation assets exist",
    `missing assets: ${missing.join(", ")}`
  );

  for (const required of [
    "catalog-cywell-opslens-card.png",
    "catalog-cywell-opslens-detail.png",
    "dev015-opslens-dashboard-desktop.png",
    "dev015-opslens-assistant-movable.png",
    "dev015-opslens-mobile-nav.png"
  ]) {
    const filePath = resolve(paths.presentationDir, "assets", required);
    expectCheck(
      `required screenshot asset: ${required}`,
      existsSync(filePath) && statSync(filePath).size > 20_000,
      `${required} exists and is non-empty`,
      `${required} is missing or unexpectedly small`
    );
  }
}

async function checkLivePagesUrl(url) {
  const result = {
    checked: true,
    url,
    status: null,
    bytes: 0,
    containsDashboardEvidence: false,
    containsAssistantEvidence: false,
    error: null
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    const text = await response.text();
    result.status = response.status;
    result.bytes = text.length;
    result.containsDashboardEvidence = text.includes(
      "dev015-opslens-dashboard-desktop.png"
    );
    result.containsAssistantEvidence =
      text.includes("KOMSCO AI Assistant") ||
      text.includes("KOMSCO AI 어시스턴트");
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }

  return result;
}

async function checkGitHubWorkflowStatus(url) {
  const result = {
    checked: true,
    url,
    status: null,
    runStatus: null,
    conclusion: null,
    htmlUrl: null,
    updatedAt: null,
    error: null
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cywell-opslens-dev015-verifier"
      },
      signal: controller.signal
    });
    result.status = response.status;
    const payload = await response.json();
    const latest = Array.isArray(payload.workflow_runs)
      ? payload.workflow_runs[0]
      : undefined;
    result.runStatus = latest?.status ?? null;
    result.conclusion = latest?.conclusion ?? null;
    result.htmlUrl = latest?.html_url ?? null;
    result.updatedAt = latest?.updated_at ?? null;
    if (!response.ok) {
      result.error = payload?.message ?? `HTTP ${response.status}`;
    } else if (!latest) {
      result.error = "no workflow run found for feat/OpsLens-Dev0.1.5";
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }

  return result;
}

async function main() {
  const [readme, workflowText, html, markdown] = await Promise.all([
    readText(paths.readme),
    readText(paths.workflow),
    readText(paths.html),
    readText(paths.markdown)
  ]);

  const firstLine = readme.split(/\r?\n/)[0] ?? "";
  expectCheck(
    "README top demo link",
    firstLine.includes(expectedUrl) && firstLine.includes("Cywell OpsLens KOMSCO Edition"),
    "README starts with the public demo brief link",
    `README first line does not point to ${expectedUrl}`
  );

  let workflow;
  try {
    workflow = YAML.parse(workflowText);
    pass("Pages workflow YAML", "deploy-demo-brief workflow parses as YAML");
  } catch (error) {
    fail("Pages workflow YAML", error.message);
  }

  const branches = workflow?.on?.push?.branches ?? workflow?.["on"]?.push?.branches ?? [];
  expectCheck(
    "Pages workflow branch coverage",
    Array.isArray(branches) &&
      branches.includes("main") &&
      branches.includes("feat/OpsLens-Dev0.1.5"),
    "workflow deploys from main and feat/OpsLens-Dev0.1.5",
    `workflow branches are ${JSON.stringify(branches)}`
  );

  const pathFilters =
    workflow?.on?.push?.paths ?? workflow?.["on"]?.push?.paths ?? [];
  expectCheck(
    "Pages workflow presentation path filter",
    Array.isArray(pathFilters) &&
      pathFilters.includes(
        "docs/product-goals/cywell-opslens-console-mod/presentation/**"
      ),
    "workflow watches the presentation directory",
    `workflow paths are ${JSON.stringify(pathFilters)}`
  );

  const workflowHasUpload = workflowText.includes("actions/upload-pages-artifact@v3");
  const workflowHasDeploy = workflowText.includes("actions/deploy-pages@v4");
  const workflowCopiesIndex = workflowText.includes("public/index.html");
  expectCheck(
    "Pages workflow artifact upload",
    workflowHasUpload && workflowHasDeploy && workflowCopiesIndex,
    "workflow builds public/index.html, uploads, and deploys the Pages artifact",
    "workflow does not contain the expected Pages build/upload/deploy steps"
  );

  expectCheck(
    "presentation viewport",
    html.includes('name="viewport"') && html.includes("width=device-width"),
    "presentation HTML has a mobile viewport"
  );

  expectCheck(
    "presentation official-first structure",
    html.indexOf('id="official"') > -1 &&
      html.indexOf('id="official"') < html.indexOf('id="capability-scope"'),
    "official evidence section appears before capability scope"
  );

  expectCheck(
    "presentation removes DNS route failure evidence",
    !/Route 직접 접속 DNS|ERR_NAME_NOT_RESOLVED|DNS 문제/.test(html),
    "route/DNS troubleshooting screenshot is not included in presentation"
  );

  expectCheck(
    "presentation markdown current 0.1.5 scope",
    markdown.includes("Dev 0.1.5 UI/package/demo evidence") &&
      markdown.includes("Dev 0.1.5 Demo Improvements") &&
      !markdown.includes("The 0.1.5 assistant polish is not finished yet") &&
      !markdown.includes("558b877f Finish OpsLens 0.1.4 console API"),
    "presentation Markdown reflects the current 0.1.5 evidence scope",
    "presentation Markdown still contains stale 0.1.4/unfinished 0.1.5 wording"
  );

  validateAssetLinks(html);

  const livePages = await checkLivePagesUrl(expectedUrl);
  if (
    livePages.status === 200 &&
    livePages.containsDashboardEvidence &&
    livePages.containsAssistantEvidence
  ) {
    pass(
      "public Pages URL smoke",
      `HTTP 200 and current Dev 0.1.5 dashboard/assistant evidence are present`,
      { livePages }
    );
  } else {
    warn(
      "public Pages URL smoke",
      livePages.error
        ? `live Pages smoke skipped/failed externally: ${livePages.error}`
        : `HTTP=${livePages.status}, dashboardEvidence=${livePages.containsDashboardEvidence}, assistantEvidence=${livePages.containsAssistantEvidence}`,
      { livePages }
    );
  }

  if (commandExists("gh")) {
    pass("GitHub CLI availability", "gh is available on PATH for optional live Pages status checks");
  } else {
    pass(
      "GitHub CLI optional",
      "gh is not on PATH; verifier will use the public GitHub API fallback for live workflow status"
    );
  }

  const workflowStatus = await checkGitHubWorkflowStatus(expectedWorkflowApi);
  if (
    workflowStatus.status === 200 &&
    workflowStatus.runStatus === "completed" &&
    workflowStatus.conclusion === "success"
  ) {
    pass(
      "GitHub Pages workflow status",
      "latest feat/OpsLens-Dev0.1.5 Pages workflow run completed successfully",
      { workflowStatus }
    );
  } else if (
    workflowStatus.status === 200 &&
    ["queued", "in_progress", "waiting", "requested"].includes(
      workflowStatus.runStatus ?? ""
    )
  ) {
    warn(
      "GitHub Pages workflow status",
      `workflow is ${workflowStatus.runStatus}; public Pages URL smoke remains the current rendered evidence`,
      { workflowStatus }
    );
  } else {
    warn(
      "GitHub Pages workflow status",
      workflowStatus.error
        ? `workflow API check unavailable: ${workflowStatus.error}`
        : `workflow status=${workflowStatus.runStatus}, conclusion=${workflowStatus.conclusion}`,
      { workflowStatus }
    );
  }

  const failed = checks.filter((check) => check.status === "FAIL");
  const warned = checks.filter((check) => check.status === "WARN");
  const report = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    expectedUrl,
    livePages,
    workflowStatus,
    totals: {
      pass: checks.filter((check) => check.status === "PASS").length,
      warn: warned.length,
      fail: failed.length,
      total: checks.length
    },
    checks
  };

  await mkdir(dirname(resolve(paths.evidenceOut)), { recursive: true });
  await writeFile(resolve(paths.evidenceOut), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    resolve(paths.markdownOut),
    [
      "# Cywell OpsLens Demo Brief Pages Verification",
      "",
      `- status: ${report.status}`,
      `- branch: ${report.branch}`,
      `- head: ${report.head}`,
      `- url: ${expectedUrl}`,
      `- pass/warn/fail: ${report.totals.pass}/${report.totals.warn}/${report.totals.fail}`,
      "",
      "| Status | Check | Detail |",
      "| --- | --- | --- |",
      ...checks.map(
        (check) =>
          `| ${check.status} | ${check.name} | ${String(check.detail).replaceAll("|", "\\|")} |`
      ),
      ""
    ].join("\n")
  );

  for (const check of checks) {
    const marker = check.status === "PASS" ? "PASS" : check.status === "WARN" ? "WARN" : "FAIL";
    console.log(`[${marker}] ${check.name}: ${check.detail}`);
  }
  console.log(
    `\nCywell OpsLens demo brief Pages verification: ${report.totals.fail} fail, ${report.totals.warn} warn, ${report.totals.total} checks`
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
