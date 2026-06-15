#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const defaults = {
  evidenceOut: "test-results/cywell-opslens-opsbrain-contract.json"
};

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
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut
};

const files = {
  productDoc: "kugnus-idea/Cywell-OpsBrain/cywell-opsbrain.md",
  acceptance: "docs/acceptance/mvp-0.1.md",
  readme: "README.md",
  packageJson: "package.json",
  api: "apps/api/src/api.ts",
  contracts: "packages/contracts/src/types.ts",
  dashboard: "apps/web/src/components/OpsLensAdminDashboard.tsx",
  styles: "apps/web/src/styles/app.css",
  mvpGate: "scripts/verify-mvp-gate.mjs"
};

const checks = [];

function sanitize(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function record(status, id, detail, evidence = []) {
  checks.push({
    status,
    id,
    detail: sanitize(detail),
    evidence: evidence.map((item) => sanitize(item))
  });
}

function pass(id, detail, evidence) {
  record("PASS", id, detail, evidence);
}

function fail(id, detail, evidence) {
  record("FAIL", id, detail, evidence);
}

function readRequired(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail("file-exists", `${path} is missing`, [path]);
    return "";
  }
  pass("file-exists", `${path} exists`, [path]);
  return readFileSync(absolutePath, "utf8");
}

function requireText(id, text, needle, evidence) {
  if (text.includes(needle)) {
    pass(id, `found ${needle}`, evidence);
  } else {
    fail(id, `missing ${needle}`, evidence);
  }
}

function requireAnyText(id, text, needles, evidence) {
  const found = needles.find((needle) => text.includes(needle));
  if (found) {
    pass(id, `found ${found}`, evidence);
  } else {
    fail(id, `missing one of: ${needles.join(", ")}`, evidence);
  }
}

function gitValue(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function scanForSecrets(path, text) {
  const patterns = [
    { id: "private-key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { id: "bearer-token", regex: /Bearer\s+(?!<|\$\{)[A-Za-z0-9._~+/=-]{16,}/i },
    { id: "openai-like-key", regex: /sk-[A-Za-z0-9]{20,}/ },
    { id: "github-token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
    { id: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/ },
    {
      id: "live-token-assignment",
      regex:
        /(OCP_API_TOKEN|OPENSHIFT_API_TOKEN|KUBE_API_TOKEN|OPENSHIFT_LIGHTSPEED_API_TOKEN|LITELLM_API_KEY)\s*[:=]\s*(?!<|\$\{|"\$\{|'\$\{)[A-Za-z0-9._~+/=-]{12,}/i
    }
  ];

  const findings = patterns.filter((pattern) => pattern.regex.test(text));
  if (findings.length === 0) {
    pass("secret-scan", `${path} contains no obvious live secret material`, [path]);
  } else {
    fail(
      "secret-scan",
      `${path} contains secret-like material: ${findings.map((finding) => finding.id).join(", ")}`,
      [path]
    );
  }
}

const productDoc = readRequired(files.productDoc);
const acceptance = readRequired(files.acceptance);
const readme = readRequired(files.readme);
const packageText = readRequired(files.packageJson);
const api = readRequired(files.api);
const contracts = readRequired(files.contracts);
const dashboard = readRequired(files.dashboard);
const styles = readRequired(files.styles);
const mvpGate = readRequired(files.mvpGate);

scanForSecrets(files.productDoc, productDoc);
scanForSecrets(files.api, api);

for (const [id, needles] of [
  ["product-doc-no-finetuning", ["파인튜닝", "Fine-tuning", "no-fine-tuning"]],
  ["product-doc-tool-layer", ["Tool Layer"]],
  ["product-doc-memory", ["Memory / Failure Journal", "장기기억", "Markdown wiki"]],
  ["product-doc-graphrag", ["GraphRAG"]],
  ["product-doc-evaluator", ["Evaluator"]],
  ["product-doc-self-improver", ["Self-Improver"]],
  ["product-doc-risk-gate", ["Command Risk Gate"]],
  ["product-doc-model-ensemble", ["Model Ensemble"]],
  ["product-doc-read-only", ["읽기 전용", "read-only"]],
  ["product-doc-approval", ["승인형", "approval", "human approval"]]
]) {
  requireAnyText(id, productDoc, needles, [files.productDoc]);
}

for (const needle of [
  "sourceDocuments",
  "acceptanceCriteria",
  "memoryWriteGuard",
  "selfImprover",
  "rawMemoryWriteAllowed: false",
  "vectorWriteAllowed: false",
  "graphWriteAllowed: false",
  "automaticFineTuningAllowed: false",
  "automaticPolicyMutationAllowed: false"
]) {
  requireText("contract-type", contracts, needle, [files.contracts]);
  requireText("api-summary", api, needle, [files.api]);
}

for (const needle of [
  "fineTuningRequired: false",
  "actionMode: \"readOnly\"",
  "mutationAllowed: false",
  "reviewed-writes-only",
  "proposal-only",
  "AC-OPSBRAIN-001",
  "test-results/cywell-opslens-opsbrain-contract.json"
]) {
  requireText("api-opsbrain-boundary", api, needle, [files.api]);
}

for (const needle of [
  "opslens-opsbrain-system",
  "Acceptance",
  "Memory Write Guard",
  "Self-Improver",
  "opsBrain.acceptanceCriteria",
  "opsBrain.memoryWriteGuard",
  "opsBrain.selfImprover"
]) {
  requireText("dashboard-opsbrain-surface", dashboard, needle, [files.dashboard]);
}

for (const needle of [
  ".opsbrain-contract-row",
  ".opsbrain-contract-list",
  ".opsbrain-safety-grid"
]) {
  requireText("dashboard-opsbrain-layout", styles, needle, [files.styles]);
}

requireText("acceptance-row", acceptance, "AC-OPSBRAIN-001", [files.acceptance]);
requireText("acceptance-row", acceptance, "verify:opsbrain", [files.acceptance]);
requireText("readme-wiring", readme, "npm run verify:opsbrain", [files.readme]);
requireText("readme-wiring", readme, "no-fine-tuning", [files.readme]);
requireText("mvp-gate-wiring", mvpGate, "OPSBRAIN", [files.mvpGate]);
requireText("mvp-gate-wiring", mvpGate, "verify:opsbrain", [files.mvpGate]);

try {
  const packageJson = JSON.parse(packageText);
  if (packageJson.scripts?.["verify:opsbrain"] === "node ./scripts/verify-opsbrain-contract.mjs") {
    pass("package-script", "verify:opsbrain is wired", [files.packageJson]);
  } else {
    fail("package-script", "verify:opsbrain script is missing or changed", [files.packageJson]);
  }
} catch (error) {
  fail("package-script", `package.json parse failed: ${error instanceof Error ? error.message : String(error)}`, [
    files.packageJson
  ]);
}

const failures = checks.filter((check) => check.status === "FAIL");
const status = failures.length === 0 ? "PASS" : "FAIL";
const branch = gitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
const headSha = gitValue(["rev-parse", "--short", "HEAD"]);
const baseRef = gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
const gitPorcelain = gitValue(["status", "--porcelain"], "");
const worktreeDirty = gitPorcelain.length > 0;

const missingEvidence = [
  "live OCP service-account RBAC proof for the read-only Tool Layer",
  "20 scored golden OpsBrain cases and evaluator output",
  "production memory store reviewer identity and append-only vector write audit sink",
  "nightly proposal-only self-improver runner with reviewed promotion workflow",
  "GraphRAG poisoning/provenance review before any graph write path is enabled"
];

const artifact = {
  artifactType: "opslens.opsbrain-contract.v0.1",
  generatedAt: new Date().toISOString(),
  status,
  branch,
  headSha,
  baseRef,
  worktreeDirty,
  sourceDocuments: [
    { path: files.productDoc, role: "product-contract", required: true },
    { path: files.acceptance, role: "acceptance-contract", required: true },
    { path: files.api, role: "implementation-contract", required: true },
    { path: files.contracts, role: "implementation-contract", required: true },
    { path: files.dashboard, role: "implementation-contract", required: true }
  ],
  acceptance: {
    id: "AC-OPSBRAIN-001",
    status: status === "PASS" ? "pass" : "failed",
    pass:
      "OpsBrain exposes Tool Layer, reviewed memory, evaluator, proposal-only self-improver, and approval-gated risk control without fine-tuning.",
    measurement:
      "Static local contract verification across product document, API/types, dashboard, README/script wiring, and acceptance matrix."
  },
  mutationBoundary: {
    actionMode: "readOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    graphWriteAttempted: false,
    memoryWriteRequiresReview: true,
    fineTuningAttempted: false,
    mutationAllowedByThisVerifier: false
  },
  checks,
  missingEvidence,
  risk: [
    "A no-fine-tuning growth loop only improves safely when evidence provenance, reviewer identity, and eval gates stay mandatory.",
    "GraphRAG and vector writes can poison long-term memory if unreviewed sources are promoted directly.",
    "Live OCP conclusions remain blocked until RBAC and API evidence are proven against the target cluster."
  ],
  rollbackPath: [
    "Revert API/dashboard contract changes if they drift from the product document.",
    "Keep runtime memory, vector, graph, and policy updates disabled until reviewer-approved evidence exists.",
    "Rerun npm run verify:opsbrain and npm run verify:mvp -- --skip-e2e --skip-images after contract changes."
  ]
};

const jsonPath = resolve(options.evidenceOut);
await mkdir(dirname(jsonPath), { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

const markdownPath = jsonPath.replace(/\.json$/i, ".md");
const markdown = [
  "# Cywell OpsBrain Contract Evidence",
  "",
  `- Status: ${artifact.status}`,
  `- Branch: ${artifact.branch}`,
  `- Head: ${artifact.headSha}`,
  `- Worktree dirty: ${artifact.worktreeDirty}`,
  `- Acceptance: ${artifact.acceptance.id}`,
  "",
  "## Mutation Boundary",
  "",
  `- actionMode: ${artifact.mutationBoundary.actionMode}`,
  `- clusterMutationAttempted: ${artifact.mutationBoundary.clusterMutationAttempted}`,
  `- vectorWriteAttempted: ${artifact.mutationBoundary.vectorWriteAttempted}`,
  `- graphWriteAttempted: ${artifact.mutationBoundary.graphWriteAttempted}`,
  `- fineTuningAttempted: ${artifact.mutationBoundary.fineTuningAttempted}`,
  "",
  "## Checks",
  "",
  "| Status | Check | Detail |",
  "|---|---|---|",
  ...checks.map((check) => `| ${check.status} | ${check.id} | ${check.detail.replace(/\|/g, "\\|")} |`),
  "",
  "## Missing Evidence",
  "",
  ...missingEvidence.map((item) => `- ${item}`),
  ""
].join("\n");

await writeFile(markdownPath, markdown, "utf8");

for (const check of checks) {
  const prefix = check.status === "PASS" ? "PASS" : "FAIL";
  console.log(`${prefix} ${check.id}: ${check.detail}`);
}

console.log(`${status} opsbrain contract evidence written to ${options.evidenceOut}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
