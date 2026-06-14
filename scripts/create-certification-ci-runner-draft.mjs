#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "docs/release/evidence/certification/approved-ci-runner.draft.json",
  finalEvidenceFile: "docs/release/evidence/certification/approved-ci-runner.json",
  certificationReadiness: "test-results/cywell-opslens-certification-readiness.json",
  catalogToolchain: "test-results/cywell-opslens-catalog-toolchain-plan.json",
  timeoutMs: 10000
};

function parseArgs(argv) {
  const flags = new Set();
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
    } else {
      flags.add(key);
    }
  }
  return { flags, values };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  finalEvidenceFile: parsed.values.get("final-evidence-file") ?? defaults.finalEvidenceFile,
  certificationReadiness:
    parsed.values.get("certification-readiness") ?? defaults.certificationReadiness,
  catalogToolchain: parsed.values.get("catalog-toolchain") ?? defaults.catalogToolchain,
  runnerId: parsed.values.get("runner-id"),
  runnerImage: parsed.values.get("runner-image"),
  runnerImageDigest: parsed.values.get("runner-image-digest"),
  approvedBy: parsed.values.get("approved-by"),
  ticket: parsed.values.get("ticket"),
  approvedAt: parsed.values.get("approved-at"),
  opmValidateLog: parsed.values.get("opm-validate-log"),
  operatorSdkBundleValidateLog: parsed.values.get("operator-sdk-bundle-validate-log"),
  operatorSdkScorecardLog: parsed.values.get("operator-sdk-scorecard-log"),
  force: parsed.flags.has("force"),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
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

function record(status, name, detail) {
  checks.push({ status, name, detail: sanitize(detail) });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function warn(name, detail) {
  record("WARN", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function meaningful(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !/[<>]/.test(text) && !/\b(example|placeholder|todo|changeme|missing|unknown)\b/i.test(text);
}

function hasDigest(value) {
  return /sha256:[a-f0-9]{64}/i.test(String(value ?? ""));
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return {
      ok: true,
      stdout: sanitize(stdout.trim()),
      stderr: sanitize(stderr.trim())
    };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"]);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

async function toolVersion(name, args) {
  const result = await runCapture(name, args);
  if (result.ok && result.stdout) {
    pass(`tool ${name}`, result.stdout.split(/\r?\n/)[0]);
    return result.stdout;
  }
  warn(`tool ${name}`, `${name} unavailable for local draft intake`);
  return `<fill-from-approved-ci-${name}>`;
}

function loadArtifactSummary(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${path} is missing`);
    return {
      path,
      status: "missing",
      headSha: "missing",
      worktreeDirty: "unknown"
    };
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return {
      path,
      status: artifact.status ?? "unknown",
      headSha: artifact.headSha ?? artifact.ref?.headSha ?? "missing",
      worktreeDirty: artifact.worktreeDirty ?? artifact.ref?.worktreeDirty ?? "unknown"
    };
  } catch (error) {
    warn(label, `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {
      path,
      status: "invalid-json",
      headSha: "missing",
      worktreeDirty: "unknown"
    };
  }
}

function missingEvidenceForDraft({ runner, toolVersions, evidenceArtifacts, worktreeDirty }) {
  const missing = [];
  if (worktreeDirty) missing.push("draft was generated from a dirty worktree");
  if (!meaningful(runner.id)) missing.push("runner.id");
  if (!meaningful(runner.image)) missing.push("runner.image");
  if (!hasDigest(runner.imageDigest)) missing.push("runner.imageDigest sha256");
  if (!meaningful(runner.approvedBy)) missing.push("runner.approvedBy");
  if (!meaningful(runner.ticket)) missing.push("runner.ticket");
  if (!meaningful(runner.approvedAt) || Number.isNaN(Date.parse(runner.approvedAt))) {
    missing.push("runner.approvedAt ISO timestamp");
  }
  for (const [key, value] of Object.entries(toolVersions)) {
    if (!meaningful(value)) missing.push(`toolVersions.${key}`);
  }
  for (const [key, value] of Object.entries(evidenceArtifacts)) {
    if (!meaningful(value)) missing.push(`evidenceArtifacts.${key}`);
  }
  return missing;
}

async function buildDraft() {
  if (!options.evidenceOut.endsWith(".draft.json")) {
    throw new Error("--evidence-out must end with .draft.json");
  }
  if (options.finalEvidenceFile.endsWith(".draft.json")) {
    throw new Error("--final-evidence-file must not end with .draft.json");
  }
  if (existsSync(resolve(options.evidenceOut)) && !options.force) {
    throw new Error(`${options.evidenceOut} already exists; pass --force to replace the draft`);
  }

  const [branch, headSha, baseRef, worktreeStatus] = await Promise.all([
    gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "origin/main"),
    gitStatusShort()
  ]);
  const worktreeDirty = worktreeStatus.length > 0;

  const [ocVersion, dockerVersion, opmVersion, operatorSdkVersion] = await Promise.all([
    toolVersion("oc", ["version", "--client"]),
    toolVersion("docker", ["--version"]),
    toolVersion("opm", ["version"]),
    toolVersion("operator-sdk", ["version"])
  ]);
  const certificationReadiness = loadArtifactSummary(
    options.certificationReadiness,
    "certification readiness evidence"
  );
  const catalogToolchain = loadArtifactSummary(
    options.catalogToolchain,
    "catalog toolchain evidence"
  );

  const runner = {
    id: options.runnerId ?? "<approved-runner-or-ci-job-id>",
    image: options.runnerImage ?? "<approved-ci-image>",
    imageDigest: options.runnerImageDigest ?? "<approved-ci-image>@sha256:<digest>",
    approvedBy: options.approvedBy ?? "<release-manager-or-security-reviewer>",
    ticket: options.ticket ?? "<release-or-security-review-ticket>",
    approvedAt: options.approvedAt ?? "<iso-8601-timestamp>"
  };
  const toolVersions = {
    oc: ocVersion,
    docker: dockerVersion,
    opm: opmVersion,
    operatorSdk: operatorSdkVersion
  };
  const evidenceArtifacts = {
    certificationReadiness: options.certificationReadiness,
    catalogToolchain: options.catalogToolchain,
    opmValidateLog: options.opmValidateLog ?? "<ci-log-or-artifact-for-opm-validate>",
    operatorSdkBundleValidateLog:
      options.operatorSdkBundleValidateLog ?? "<ci-log-or-artifact-for-operator-sdk-bundle-validate>",
    operatorSdkScorecardLog:
      options.operatorSdkScorecardLog ?? "<ci-log-or-artifact-for-operator-sdk-scorecard>"
  };
  const missingEvidence = missingEvidenceForDraft({
    runner,
    toolVersions,
    evidenceArtifacts,
    worktreeDirty
  });
  const status = missingEvidence.length === 0 ? "DRAFT_REVIEW_READY" : "DRAFT_NEEDS_EVIDENCE";

  return {
    schema: "cywell.opslens.certification-ci-runner-draft.v0.1",
    artifactType: "opslens.certification-ci-runner-draft.v0.1",
    finalSchema: "cywell.opslens.certification-ci-runner.v0.1",
    finalArtifactType: "opslens.certification-ci-runner.v0.1",
    draft: true,
    actionMode: "draftOnly",
    evidenceState: status,
    generatedAt: new Date().toISOString(),
    startedAt,
    finalEvidenceFile: options.finalEvidenceFile,
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    runner,
    toolVersions,
    evidenceArtifacts,
    sourceEvidence: {
      certificationReadiness,
      catalogToolchain
    },
    reviewerRequests: [
      {
        owner: "release-manager",
        request: "Provide approved CI runner id, image, immutable digest, approval ticket, and timestamp.",
        evidenceNeeded: "runner.id, runner.image, runner.imageDigest, runner.approvedBy, runner.ticket, runner.approvedAt",
        nextCommand:
          "npm run evidence:certification:ci-runner-draft -- --runner-id <id> --runner-image <image> --runner-image-digest <image>@sha256:<digest> --approved-by <reviewer> --ticket <ticket> --approved-at <iso> --force"
      },
      {
        owner: "release-manager",
        request: "Attach CI logs for opm validate, operator-sdk bundle validate, and operator-sdk scorecard.",
        evidenceNeeded:
          "evidenceArtifacts.opmValidateLog, evidenceArtifacts.operatorSdkBundleValidateLog, evidenceArtifacts.operatorSdkScorecardLog",
        nextCommand:
          "npm run evidence:certification:ci-runner-draft -- --opm-validate-log <artifact> --operator-sdk-bundle-validate-log <artifact> --operator-sdk-scorecard-log <artifact> --force"
      },
      {
        owner: "security-reviewer",
        request: "Review runner provenance before promotion to approved-ci-runner.json.",
        evidenceNeeded: "Approved runner image digest, tool versions, clean current-head validation logs, and no mutation flags.",
        nextCommand:
          "copy reviewed draft values into docs/release/evidence/certification/approved-ci-runner.json, then run npm run verify:certification"
      }
    ],
    missingEvidence,
    risk: [
      "This draft does not satisfy certification readiness and must not be renamed into final evidence without human review.",
      "A CI runner with stale head, mutable tags, missing validation logs, or unreviewed tooling can create false Certified Operator confidence.",
      "This helper records local evidence only; it does not install tools, pull runner images, push images, submit to Partner Connect, or mutate a cluster."
    ],
    rollbackPath: [
      "Delete or supersede approved-ci-runner.draft.json if the runner digest, ticket, head, or validation logs are wrong.",
      "Do not create approved-ci-runner.json until all missing evidence is resolved and reviewed.",
      "After final evidence is created, rerun npm run verify:certification and npm run verify:release-refresh."
    ],
    nextCommands:
      status === "DRAFT_REVIEW_READY"
        ? [
            "review approved-ci-runner.draft.json with release-manager and security-reviewer",
            "create docs/release/evidence/certification/approved-ci-runner.json only after human approval",
            "npm run verify:certification"
          ]
        : [
            "fill missing runner/tool/log evidence in approved-ci-runner.draft.json",
            "rerun npm run evidence:certification:ci-runner-draft -- --force",
            "do not create approved-ci-runner.json yet"
          ],
    checks
  };
}

async function writeDraft(draft) {
  const serialized = `${JSON.stringify(draft, null, 2)}\n`;
  if (secretLike(serialized)) {
    throw new Error("certification CI runner draft would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("certification CI runner draft export", `${resolve(options.evidenceOut)} written without secret material`);
}

function printSummary() {
  const statusWeight = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens certification CI runner draft: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) process.exitCode = 1;
}

try {
  const draft = await buildDraft();
  await writeDraft(draft);
} catch (error) {
  fail("certification CI runner draft", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
