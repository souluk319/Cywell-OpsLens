#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const paths = {
  handoff:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-morning-handoff.md",
  plan:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-overnight-execution-plan.md",
  packageJson: "package.json",
  checkpointRunner: "scripts/run-dev012-overnight-checkpoint.mjs",
  pagesEvidence: "test-results/cywell-opslens-demo-brief-pages.json",
  checkpointEvidence: "test-results/cywell-opslens-dev012-overnight-checkpoint.json",
  evidenceOut: "test-results/cywell-opslens-dev015-morning-handoff.json",
  markdownOut: "test-results/cywell-opslens-dev015-morning-handoff.md"
};

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

async function readJson(path) {
  const text = await readText(path);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("valid JSON", `${path}: ${error.message}`);
    return undefined;
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

function containsAll(text, values) {
  return values.every((value) => text.includes(value));
}

function secretLikeHits(text) {
  const patterns = [
    /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*=/g,
    /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g,
    /https:\/\/api\.[^\s`"')]+/g,
    /password\s*[:=]\s*\S+/gi
  ];
  return patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => match[0])
  );
}

const [handoff, plan, packageJson, runner, pagesEvidence, checkpointEvidence] =
  await Promise.all([
    readText(paths.handoff),
    readText(paths.plan),
    readText(paths.packageJson),
    readText(paths.checkpointRunner),
    readJson(paths.pagesEvidence),
    readJson(paths.checkpointEvidence)
  ]);

expectCheck(
  "package script",
  packageJson.includes('"verify:dev015-handoff"') &&
    packageJson.includes("verify-dev015-morning-handoff.mjs"),
  "package.json exposes verify:dev015-handoff"
);

expectCheck(
  "overnight checkpoint includes dev015 handoff",
  runner.includes('npmStep("dev015-handoff", ["verify:dev015-handoff"])'),
  "overnight checkpoint runs verify:dev015-handoff"
);

expectCheck(
  "handoff headline and branch",
  containsAll(handoff, [
    "Cywell OpsLens Dev 0.1.5 Morning Handoff",
    "feat/OpsLens-Dev0.1.5",
    "https://souluk319.github.io/Cywell-OpsLens/"
  ]),
  "handoff names the 0.1.5 demo branch and public demo URL"
);

expectCheck(
  "handoff demo flow",
  containsAll(handoff, [
    "Official evidence",
    "Catalog screenshots",
    "ConsolePlugin route story",
    "movable KOMSCO AI Assistant",
    "approval boundaries"
  ]),
  "handoff gives a short demo flow from official evidence to approval boundaries"
);

expectCheck(
  "handoff evidence assets",
  containsAll(handoff, [
    "catalog-cywell-opslens-card.png",
    "catalog-cywell-opslens-detail.png",
    "dev015-opslens-dashboard-desktop.png",
    "dev015-opslens-assistant-movable.png",
    "dev015-opslens-mobile-nav.png",
    "public GitHub API",
    "live workflow-status fallback"
  ]),
  "handoff references all required presentation screenshots"
);

expectCheck(
  "handoff safe commands",
  containsAll(handoff, [
    "git status --short --branch",
    "npm run overnight:checkpoint",
    "npm run verify:demo-brief-pages",
    "oc get co console",
    "oc get opslensinstallation,deploy,pod,svc,route,consoleplugin -n cywell-opslens"
  ]),
  "handoff includes local and optional read-only CRC morning checks"
);

expectCheck(
  "handoff approval boundaries",
  containsAll(handoff, [
    "Do not push CRC registry images",
    "Do not patch `OLSConfig`",
    "Do not create secrets",
    "Do not delete live cluster resources",
    "Do not claim production vLLM/pgvector readiness"
  ]),
  "handoff keeps approval-gated actions explicit"
);

expectCheck(
  "handoff final report coverage",
  containsAll(handoff, [
    "## Final Report Coverage",
    "Branch and head SHA",
    "Files changed",
    "Verification commands and results",
    "GitHub Pages URL",
    "Demonstrable immediately",
    "Still approval-gated",
    "apps/web/src/App.tsx",
    "apps/web/src/components/OperationsDashboard.tsx",
    "apps/web/src/components/AssistantPopover.tsx",
    "tests/e2e/mvp-0.1.spec.ts",
    "scripts/verify-web-shell-contract.mjs",
    "scripts/verify-demo-brief-pages.mjs",
    "scripts/verify-dev015-acceptance-audit.mjs",
    "docs/product-goals/cywell-opslens-console-mod/presentation/",
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-*",
    "visual operations dashboard",
    "movable KOMSCO AI Assistant",
    "Live CRC registry/catalog/subscription upgrade"
  ]),
  "handoff covers every final report requirement from the 0.1.5 execution plan",
  "handoff is missing one or more final report requirement fields"
);

expectCheck(
  "execution plan records Pages verifier",
  containsAll(plan, [
    "Pages-verifier",
    "verify:demo-brief-pages",
    "read-only public URL smoke gate"
  ]),
  "0.1.5 execution plan records the Pages delivery and live-smoke gate"
);

expectCheck(
  "Pages evidence passed",
  pagesEvidence?.status === "PASS" &&
    pagesEvidence?.expectedUrl === "https://souluk319.github.io/Cywell-OpsLens/" &&
    pagesEvidence?.totals?.fail === 0 &&
    pagesEvidence?.workflowStatus?.checked === true,
  "latest Pages evidence passed with zero failures",
  `Pages evidence status is ${pagesEvidence?.status ?? "missing"}`
);

expectCheck(
  "handoff workflow status fallback",
  containsAll(handoff, [
    "GitHub workflow status fallback",
    "`gh` is optional",
    "public GitHub API",
    "public URL smoke remains the rendered evidence"
  ]),
  "handoff explains the GitHub workflow-status fallback without requiring GitHub CLI installation",
  "handoff still treats missing gh as an unresolved demo blocker"
);

expectCheck(
  "checkpoint evidence includes handoff-adjacent gates",
  checkpointEvidence?.status === "PASS" &&
    checkpointEvidence?.git?.branch === "feat/OpsLens-Dev0.1.5" &&
    (checkpointEvidence?.morningHandoff?.stepTotals?.passed ?? 0) >= 12,
  "latest checkpoint evidence passed on feat/OpsLens-Dev0.1.5",
  "checkpoint evidence is missing or not passing"
);

const hits = secretLikeHits(handoff);
expectCheck(
  "handoff secret hygiene",
  hits.length === 0,
  "handoff avoids token, secret, password, bearer, and exact API host assignments",
  `secret-like content detected: ${hits.slice(0, 5).join(", ")}`
);

if (handoff.includes("0.1.2-dev-crc") || handoff.includes("Dev 0.1.2 Morning")) {
  fail("handoff stale version scan", "handoff contains stale Dev 0.1.2 language");
} else {
  pass("handoff stale version scan", "handoff does not reuse stale Dev 0.1.2 wording");
}

const failed = checks.filter((check) => check.status === "FAIL");
const warned = checks.filter((check) => check.status === "WARN");
const report = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
  head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
  totals: {
    pass: checks.filter((check) => check.status === "PASS").length,
    warn: warned.length,
    fail: failed.length,
    total: checks.length
  },
  paths,
  checks
};

await mkdir(dirname(resolve(paths.evidenceOut)), { recursive: true });
await writeFile(resolve(paths.evidenceOut), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(
  resolve(paths.markdownOut),
  [
    "# Cywell OpsLens Dev 0.1.5 Morning Handoff Verification",
    "",
    `- status: ${report.status}`,
    `- branch: ${report.branch}`,
    `- head: ${report.head}`,
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
  console.log(`[${check.status}] ${check.name}: ${check.detail}`);
}

console.log(
  `\nCywell OpsLens Dev 0.1.5 morning handoff: ${report.totals.fail} fail, ${report.totals.warn} warn, ${report.totals.total} checks`
);

if (failed.length > 0) {
  process.exitCode = 1;
}
