#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const paths = {
  audit:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-final-readiness-audit.md",
  acceptance:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-acceptance-audit.md",
  handoff:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-morning-handoff.md",
  plan:
    "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-overnight-execution-plan.md",
  packageJson: "package.json",
  checkpointRunner: "scripts/run-dev012-overnight-checkpoint.mjs",
  pagesEvidence: "test-results/cywell-opslens-demo-brief-pages.json",
  webShellEvidence: "test-results/cywell-opslens-web-shell-contract.json",
  checkpointEvidence: "test-results/cywell-opslens-dev012-overnight-checkpoint.json",
  evidenceOut: "test-results/cywell-opslens-dev015-final-readiness.json",
  markdownOut: "test-results/cywell-opslens-dev015-final-readiness.md"
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
  acceptance,
  handoff,
  plan,
  packageJson,
  runner,
  pagesEvidence,
  webShellEvidence,
  checkpointEvidence
] = await Promise.all([
  readText(paths.audit),
  readText(paths.acceptance),
  readText(paths.handoff),
  readText(paths.plan),
  readText(paths.packageJson),
  readText(paths.checkpointRunner),
  readJson(paths.pagesEvidence),
  readJson(paths.webShellEvidence),
  readJson(paths.checkpointEvidence)
]);

expectCheck(
  "package script",
  packageJson.includes('"verify:dev015-final-readiness"') &&
    packageJson.includes("verify-dev015-final-readiness.mjs"),
  "package.json exposes verify:dev015-final-readiness"
);

expectCheck(
  "overnight checkpoint includes final readiness",
  runner.includes('npmStep("dev015-final-readiness", ["verify:dev015-final-readiness"])'),
  "overnight checkpoint runs verify:dev015-final-readiness"
);

expectCheck(
  "final readiness verdict",
  containsAll(audit, [
    "Cywell OpsLens Dev 0.1.5 Final Readiness Audit",
    "`READY_FOR_DEMO`",
    "2026-06-19 09:00 KST",
    "feat/OpsLens-Dev0.1.5",
    "https://souluk319.github.io/Cywell-OpsLens/"
  ]),
  "final audit locks the demo verdict, target time, branch, and public URL"
);

expectCheck(
  "schedule matrix coverage",
  containsAll(audit, [
    "State lock",
    "Left navigation UX",
    "Custom dashboard visualization",
    "OpenShift Console mapping",
    "KOMSCO AI Assistant polish",
    "Assistant placement",
    "Data-state honesty",
    "Responsive QA",
    "Verification",
    "Presentation and README refresh",
    "Final validation and push",
    "Morning handoff"
  ]),
  "final audit covers every scheduled lane"
);

expectCheck(
  "demo evidence coverage",
  containsAll(audit, [
    "Public GitHub Pages brief",
    "GitHub Pages workflow status",
    "Catalog card screenshot",
    "Catalog detail screenshot",
    "Visual dashboard screenshot",
    "Movable assistant screenshot",
    "Mobile navigation screenshot",
    "Operator package verifier",
    "ConsolePlugin verifier",
    "Web shell verifier",
    "Dev 0.1.5 handoff verifier",
    "Dev 0.1.5 acceptance verifier"
  ]),
  "final audit lists the complete demo evidence set"
);

expectCheck(
  "approval boundary coverage",
  containsAll(audit, [
    "Fresh live CRC registry push",
    "`OLSConfig` patching",
    "Secret, RBAC, SCC",
    "Production vLLM runtime",
    "Production pgvector/storage",
    "Community/Certified Operator submission"
  ]),
  "final audit separates approval-gated work from demo readiness"
);

expectCheck(
  "safe statement and unsupported claims",
  containsAll(audit, [
    "Cywell OpsLens Dev 0.1.5 is ready to demonstrate",
    "Cywell OpsLens replaces the OpenShift console.",
    "The assistant can automatically mutate or repair the cluster."
  ]),
  "final audit gives safe demo wording and blocked claim wording"
);

expectCheck(
  "handoff references final readiness",
  containsAll(handoff, [
    "Final Report Coverage",
    "verify:dev015-final-readiness",
    "Dev 0.1.5 Final Readiness Audit"
  ]),
  "morning handoff points operators at the final readiness gate",
  "morning handoff does not expose the final readiness gate"
);

expectCheck(
  "acceptance references workflow fallback",
  containsAll(acceptance, [
    "GitHub workflow-status fallback",
    "public GitHub API",
    "Public presentation delivery"
  ]) &&
    !acceptance.includes("`gh` CLI workflow status may be unavailable on PATH"),
  "acceptance audit reflects the Pages workflow-status fallback instead of a stale gh gap",
  "acceptance audit still describes missing gh as a current gap"
);

expectCheck(
  "execution plan records final readiness",
  containsAll(plan, [
    "Final readiness audit",
    "verify:dev015-final-readiness",
    "READY_FOR_DEMO"
  ]),
  "execution plan records the final readiness lane"
);

expectCheck(
  "Pages evidence passed",
  pagesEvidence?.status === "PASS" &&
    pagesEvidence?.totals?.fail === 0 &&
    pagesEvidence?.totals?.warn === 0 &&
    pagesEvidence?.livePages?.status === 200 &&
    pagesEvidence?.workflowStatus?.checked === true,
  "Pages evidence passes with public URL and workflow-status checks",
  "Pages evidence is missing, failing, or lacks workflow-status proof"
);

expectCheck(
  "web shell evidence passed",
  webShellEvidence?.status === "PASS" &&
    (webShellEvidence?.failCount ?? webShellEvidence?.totals?.fail) === 0,
  `web shell evidence passes with ${
    webShellEvidence?.checkCount ?? webShellEvidence?.checks?.length ?? "recorded"
  } checks and zero failures`,
  "web shell evidence is missing or failing"
);

expectCheck(
  "checkpoint evidence passed",
  checkpointEvidence?.status === "PASS" &&
    checkpointEvidence?.git?.branch === "feat/OpsLens-Dev0.1.5" &&
    (checkpointEvidence?.iterations?.[0]?.steps ?? []).every(
      (step) => step.status === "PASS"
    ),
  "checkpoint evidence passes on feat/OpsLens-Dev0.1.5",
  "checkpoint evidence is missing, failing, or from the wrong branch"
);

const secretHits = secretLikeHits([audit, handoff, acceptance].join("\n"));
expectCheck(
  "readiness secret hygiene",
  secretHits.length === 0,
  "readiness docs avoid token, secret, password, bearer, and exact API host assignments",
  `secret-like content detected: ${secretHits.slice(0, 5).join(", ")}`
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
    "# Cywell OpsLens Dev 0.1.5 Final Readiness Verification",
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
  const marker = check.status === "PASS" ? "PASS" : "FAIL";
  console.log(`[${marker}] ${check.name}: ${check.detail}`);
}
console.log(
  `\nCywell OpsLens Dev 0.1.5 final readiness: ${report.totals.fail} fail, ${report.totals.total} checks`
);

if (failed.length > 0) {
  process.exitCode = 1;
}
