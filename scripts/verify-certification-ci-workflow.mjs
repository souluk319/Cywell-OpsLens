#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  workflow: ".github/workflows/certification-tooling.yml",
  evidenceOut: "test-results/cywell-opslens-certification-ci-workflow.json",
  markdownOut: "test-results/cywell-opslens-certification-ci-workflow.md"
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
  workflow: parsed.get("workflow") ?? defaults.workflow,
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
}

function mutationLike(value) {
  return /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)\b/i.test(value) ||
    /\b(docker|podman|skopeo)\s+(push|copy)\b/i.test(value) ||
    /\bcosign\s+sign\b/i.test(value) ||
    /\b(operator-sdk|opm)\s+.*\b(push|publish|run bundle|run bundle-upgrade)\b/i.test(value) ||
    /\b(partner-connect-submit|operatorhub-submit)\b/i.test(value);
}

function finalEvidenceWriteLike(value) {
  return /approved-ci-runner\.json/i.test(value) &&
    !/approved-ci-runner\.draft\.json/i.test(value) &&
    !/approved-ci-runner\.example\.json/i.test(value);
}

function record(status, name, detail) {
  checks.push({ status, name, detail: sanitize(detail) });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

async function runCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function gitValue(args, fallback) {
  const value = await runCapture("git", args);
  return value.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const value = await runCapture("git", ["status", "--short"]);
  return value.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function workflowDispatch(workflow) {
  return workflow?.on?.workflow_dispatch ?? workflow?.["on"]?.workflow_dispatch;
}

function verify() {
  const absoluteWorkflow = resolve(options.workflow);
  if (!existsSync(absoluteWorkflow)) {
    fail("workflow file", `${options.workflow} is missing`);
    return { workflow: undefined, workflowText: "" };
  }
  const workflowText = readFileSync(absoluteWorkflow, "utf8");
  let workflow;
  try {
    workflow = YAML.parse(workflowText);
    pass("workflow yaml", `${options.workflow} parses as YAML`);
  } catch (error) {
    fail("workflow yaml", `${options.workflow} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return { workflow: undefined, workflowText };
  }

  const dispatch = workflowDispatch(workflow);
  const triggerKeys = Object.keys(workflow?.on ?? workflow?.["on"] ?? {});
  if (dispatch && triggerKeys.length === 1) {
    pass("manual trigger only", "workflow_dispatch is the only trigger");
  } else {
    fail("manual trigger only", `triggers=${triggerKeys.join(",") || "missing"}`);
  }

  const inputs = dispatch?.inputs ?? {};
  const requiredInputs = [
    "runner_label",
    "runner_image",
    "runner_image_digest",
    "approved_by",
    "approval_ticket",
    "approved_at"
  ];
  const missingInputs = requiredInputs.filter((input) => !inputs[input]);
  if (missingInputs.length === 0) {
    pass("workflow inputs", `required inputs=${requiredInputs.join(",")}`);
  } else {
    fail("workflow inputs", `missing inputs=${missingInputs.join(",")}`);
  }

  const permissions = workflow?.permissions ?? {};
  if (permissions.contents === "read" && Object.values(permissions).every((value) => value === "read" || value === "none")) {
    pass("permissions boundary", "contents=read and no write permissions");
  } else {
    fail("permissions boundary", JSON.stringify(permissions));
  }

  const jobs = workflow?.jobs ?? {};
  const job = jobs["certification-tooling-evidence"];
  if (job) {
    pass("workflow job", "certification-tooling-evidence exists");
  } else {
    fail("workflow job", "certification-tooling-evidence is missing");
  }
  if (String(job?.["runs-on"] ?? "").includes("inputs.runner_label")) {
    pass("approved runner lane", "runs-on is selected through workflow_dispatch runner_label");
  } else {
    fail("approved runner lane", `runs-on=${String(job?.["runs-on"] ?? "missing")}`);
  }

  const strings = collectStrings(workflow);
  const joined = strings.join("\n");
  const requiredSignals = [
    ["checkout read-only", /persist-credentials:\s*false|persist-credentials|actions\/checkout@v4/i],
    ["npm install", /\bnpm ci\b/i],
    ["opm validate", /\bopm\s+validate\s+deploy\/catalog\/fbc\b/i],
    ["operator-sdk bundle validate", /\boperator-sdk\s+bundle\s+validate\s+\.\/deploy\/operator\/bundle\b/i],
    ["operator-sdk scorecard", /\boperator-sdk\s+scorecard\s+\.\/deploy\/operator\/bundle\b/i],
    ["certification refresh", /\bnpm\s+run\s+verify:certification\b/i],
    ["catalog refresh", /\bnpm\s+run\s+verify:catalog-toolchain\b/i],
    ["ci runner draft", /\bnpm\s+run\s+evidence:certification:ci-runner-draft\b/i],
    ["draft artifact upload", /approved-ci-runner\.draft\.json/i],
    ["validation log upload", /test-results\/certification-ci-runner\/\*\.log/i],
    ["artifact upload", /actions\/upload-artifact@v4/i]
  ];
  for (const [name, pattern] of requiredSignals) {
    if (pattern.test(joined)) {
      pass(name, "present");
    } else {
      fail(name, "missing");
    }
  }

  const mutating = strings.filter(mutationLike);
  if (mutating.length === 0) {
    pass("mutation boundary", "no cluster, registry, signing, submission, or bundle-run mutation commands");
  } else {
    fail("mutation boundary", mutating.join("; "));
  }

  const finalEvidenceWrites = strings.filter(finalEvidenceWriteLike);
  if (finalEvidenceWrites.length === 0) {
    pass("final evidence boundary", "workflow does not write approved-ci-runner.json");
  } else {
    fail("final evidence boundary", finalEvidenceWrites.join("; "));
  }

  if (!secretLike(workflowText)) {
    pass("secret hygiene", "workflow text contains no secret-like material");
  } else {
    fail("secret hygiene", "workflow text contains secret-like material");
  }

  return { workflow, workflowText };
}

function status() {
  return checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";
}

function markdownFor(artifact) {
  return [
    "# Cywell OpsLens Certification CI Workflow",
    "",
    `- Status: ${artifact.status}`,
    `- Action mode: ${artifact.actionMode}`,
    `- Workflow: ${artifact.workflow.path}`,
    `- Manual only: ${String(artifact.workflow.manualOnly)}`,
    `- Permissions: ${artifact.workflow.permissions}`,
    `- Final evidence written: ${String(artifact.mutationBoundary.finalApprovedEvidenceWritten)}`,
    `- Cluster mutation attempted: ${String(artifact.mutationBoundary.clusterMutationAttempted)}`,
    `- Registry mutation attempted: ${String(artifact.mutationBoundary.registryMutationAttempted)}`,
    `- Mutation allowed by verifier: ${String(artifact.mutationBoundary.mutationAllowedByThisVerifier)}`,
    "",
    "## Checks",
    "",
    ...artifact.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`),
    "",
    "## Next Commands",
    "",
    ...artifact.nextCommands.map((command) => `- ${command}`),
    ""
  ].join("\n");
}

async function main() {
  const { workflow } = verify();
  const [branch, headSha, baseRef, worktreeStatus] = await Promise.all([
    gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "origin/main"),
    gitStatusShort()
  ]);
  const dispatch = workflowDispatch(workflow);
  const artifact = {
    schema: "cywell.opslens.certification-ci-workflow.v0.1",
    artifactType: "opslens.certification-ci-workflow.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: status(),
    actionMode: "workflowContractOnly",
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    workflow: {
      path: options.workflow,
      manualOnly: Boolean(dispatch),
      inputs: Object.keys(dispatch?.inputs ?? {}),
      permissions: JSON.stringify(workflow?.permissions ?? {})
    },
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      externalSubmissionAttempted: false,
      finalApprovedEvidenceWritten: false,
      mutationAllowedByThisVerifier: false
    },
    missingEvidence: checks
      .filter((check) => check.status === "FAIL")
      .map((check) => `${check.name}: ${check.detail}`),
    nextCommands: [
      "run the manual GitHub Actions workflow on an approved runner with oc/docker/opm/operator-sdk available",
      "download cywell-opslens-certification-tooling-evidence artifact",
      "review approved-ci-runner.draft.json with release-manager and security-reviewer",
      "npm run evidence:certification:ci-runner:promote -- --promote-reviewed --reviewer <reviewer> --review-ticket <ticket> --force",
      "npm run verify:certification -- --ci-runner-evidence docs/release/evidence/certification/approved-ci-runner.json"
    ],
    risk: [
      "A workflow that runs automatically or writes final approval evidence can create false certification confidence.",
      "The approved runner must still be reviewed outside this verifier before final evidence is created."
    ],
    rollbackPath: [
      "Disable or revise the workflow if it gains write permissions, mutating commands, or final evidence writes.",
      "Delete stale draft artifacts and rerun the workflow after toolchain, bundle, or release evidence changes."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretLike(serialized)) {
    throw new Error("certification CI workflow evidence would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdownFor(artifact), "utf8");

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens certification CI workflow: status=${artifact.status}, checks=${checks.length}`);
  if (artifact.status === "FAIL") process.exitCode = 1;
}

main().catch((error) => {
  fail("certification CI workflow", error instanceof Error ? error.message : String(error));
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  process.exitCode = 1;
});
