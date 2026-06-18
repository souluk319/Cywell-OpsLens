#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const paths = {
  audit:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-acceptance-audit.md",
  assistantPolish:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-assistant-polish.md",
  packageJson: "package.json",
  checkpointRunner: "scripts/run-dev012-overnight-checkpoint.mjs",
  app: "apps/web/src/App.tsx",
  dashboard: "apps/web/src/components/OperationsDashboard.tsx",
  assistant: "apps/web/src/components/AssistantPopover.tsx",
  e2e: "tests/e2e/mvp-0.1.spec.ts",
  webShellEvidence: "test-results/cywell-opslens-web-shell-contract.json",
  pagesEvidence: "test-results/cywell-opslens-demo-brief-pages.json",
  checkpointEvidence: "test-results/cywell-opslens-dev012-overnight-checkpoint.json",
  evidenceOut: "test-results/cywell-opslens-dev015-acceptance-audit.json",
  markdownOut: "test-results/cywell-opslens-dev015-acceptance-audit.md"
};

const checks = [];

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail, ...extra });
}

function pass(name, detail, extra) {
  record("PASS", name, detail, extra);
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

const [
  audit,
  packageJson,
  runner,
  app,
  dashboard,
  assistant,
  e2e,
  webShellEvidence,
  pagesEvidence,
  checkpointEvidence,
  assistantPolish
] = await Promise.all([
  readText(paths.audit),
  readText(paths.packageJson),
  readText(paths.checkpointRunner),
  readText(paths.app),
  readText(paths.dashboard),
  readText(paths.assistant),
  readText(paths.e2e),
  readJson(paths.webShellEvidence),
  readJson(paths.pagesEvidence),
  readJson(paths.checkpointEvidence),
  readText(paths.assistantPolish)
]);

expectCheck(
  "package script",
  packageJson.includes('"verify:dev015-acceptance"') &&
    packageJson.includes("verify-dev015-acceptance-audit.mjs"),
  "package.json exposes verify:dev015-acceptance"
);

expectCheck(
  "overnight checkpoint includes acceptance audit",
  runner.includes('npmStep("dev015-acceptance", ["verify:dev015-acceptance"])'),
  "overnight checkpoint runs verify:dev015-acceptance"
);

expectCheck(
  "overnight checkpoint visible label",
  runner.includes("Cywell OpsLens Dev 0.1.5 Overnight Checkpoint") &&
    !runner.includes("Cywell OpsLens Dev 0.1.2 Overnight Checkpoint") &&
    !runner.includes("Cywell OpsLens Dev 0.1.2 overnight checkpoint:"),
  "overnight checkpoint prints Dev 0.1.5 in human-facing output",
  "overnight checkpoint still exposes a stale Dev 0.1.2 human-facing label"
);

expectCheck(
  "audit headline and target",
  containsAll(audit, [
    "Cywell OpsLens Dev 0.1.5 Acceptance Audit",
    "2026-06-19 09:00 KST",
    "feat/OpsLens-Dev0.1.5",
    "https://souluk319.github.io/Cywell-OpsLens/"
  ]),
  "audit names the branch, demo target, and public demo URL"
);

expectCheck(
  "audit covers core requirements",
  containsAll(audit, [
    "Official OpenShift extension path",
    "Software Catalog / OperatorHub story",
    "Full-page OpsLens launched from console",
    "Left navigation collapse/reopen",
    "Only selected page is visible",
    "Visual operations dashboard",
    "KOMSCO AI Assistant chat UX",
    "Assistant movable placement",
    "No internal task-list noise in customer UI",
    "Security and mutation boundary"
  ]),
  "audit covers every Dev 0.1.5 product acceptance area"
);

expectCheck(
  "audit Pages workflow fallback",
  containsAll(audit, [
    "GitHub workflow-status fallback",
    "public GitHub API",
    "None for local demo evidence"
  ]) &&
    !audit.includes("`gh` CLI workflow status may be unavailable on PATH"),
  "acceptance audit records the Pages workflow-status fallback and no stale gh gap",
  "acceptance audit still treats missing gh as a current presentation gap"
);

expectCheck(
  "assistant polish doc current",
  containsAll(assistantPolish, [
    "Completed Implementation Lane",
    "Completion Checkpoint 2026-06-18 23:58 KST",
    "Curated screenshot evidence now exists",
    "AC-UI-002b",
    "AC-UI-005",
    "AC-DASH-001",
    "Fresh live CRC Dev 0.1.5 upgrade proof"
  ]) &&
    !assistantPolish.includes("no curated screenshot artifact yet") &&
    !assistantPolish.includes("needs a more chat-native presentation"),
  "assistant polish plan reflects the completed local UI lane and the remaining approval-gated live CRC boundary",
  "assistant polish plan still contains stale implementation gaps"
);

expectCheck(
  "audit keeps unsupported patterns out",
  containsAll(audit.toLowerCase(), [
    "iframe",
    "dom injection",
    "unsupported masthead",
    "approval-gated",
    "read-only",
    "plan-only"
  ]),
  "audit explicitly blocks unsupported console hacks and mutation claims"
);

expectCheck(
  "left nav implementation hooks",
  app.includes("data-testid=\"nav-collapse-toggle\"") &&
    app.includes("aria-current={activeNavId === item.id ? \"page\" : undefined}") &&
    app.includes("active-surface-") &&
    app.includes("active-page-"),
  "App exposes collapse, active nav, active surface, and active page contracts"
);

expectCheck(
  "dashboard visual hooks",
  dashboard.includes('data-testid="opslens-severity-distribution"') &&
    dashboard.includes('data-testid="opslens-exposure-trend"') &&
    dashboard.includes('data-testid="active-risk-list"'),
  "OperationsDashboard exposes severity, exposure, and active-risk visual hooks"
);

expectCheck(
  "assistant movable hooks",
  assistant.includes('data-testid="assistant-drag-handle"') &&
    assistant.includes('data-testid="assistant-placement-toggle"') &&
    assistant.includes('data-testid="assistant-placement-move"') &&
    assistant.includes("onPointerDown={handleDragStart}"),
  "Assistant exposes drag, pin/unpin, and preset movement hooks"
);

expectCheck(
  "e2e acceptance coverage",
  containsAll(e2e, [
    "AC-UI-002b lets operators unpin and move the assistant",
    "assistant-drag-handle",
    "AC-UI-005 makes masthead utilities and evidence actions clickable",
    "console-nav-workloads",
    "opslens-severity-distribution",
    "opslens-exposure-trend",
    "AC-DASH-001 renders the dedicated OpsLens admin dashboard"
  ]),
  "Playwright covers assistant drag, nav retention, and dashboard visuals"
);

expectCheck(
  "web shell evidence passed",
  webShellEvidence?.status === "PASS" &&
    (webShellEvidence?.failCount ?? webShellEvidence?.totals?.fail) === 0,
  "latest web shell evidence passed with zero failures",
  `web shell evidence status is ${webShellEvidence?.status ?? "missing"}`
);

expectCheck(
  "Pages evidence passed",
  pagesEvidence?.status === "PASS" && pagesEvidence?.totals?.fail === 0,
  "latest Pages evidence passed with zero failures",
  `Pages evidence status is ${pagesEvidence?.status ?? "missing"}`
);

expectCheck(
  "checkpoint evidence passed",
  checkpointEvidence?.status === "PASS" &&
    checkpointEvidence?.git?.branch === "feat/OpsLens-Dev0.1.5" &&
    checkpointEvidence?.git?.head,
  "latest checkpoint evidence passed on feat/OpsLens-Dev0.1.5",
  "checkpoint evidence is missing or not passing"
);

const hits = secretLikeHits(audit);
expectCheck(
  "audit secret hygiene",
  hits.length === 0,
  "audit avoids token, secret, password, bearer, and exact API host assignments",
  `secret-like content detected: ${hits.slice(0, 5).join(", ")}`
);

const failed = checks.filter((check) => check.status === "FAIL");
const report = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
  head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
  totals: {
    pass: checks.filter((check) => check.status === "PASS").length,
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
    "# Cywell OpsLens Dev 0.1.5 Acceptance Audit Verification",
    "",
    `- status: ${report.status}`,
    `- branch: ${report.branch}`,
    `- head: ${report.head}`,
    `- pass/fail: ${report.totals.pass}/${report.totals.fail}`,
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
  `\nCywell OpsLens Dev 0.1.5 acceptance audit: ${report.totals.fail} fail, ${report.totals.total} checks`
);

if (failed.length > 0) {
  process.exitCode = 1;
}
