#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  draft: "docs/release/evidence/certification/approved-ci-runner.draft.json",
  evidenceOut: "docs/release/evidence/certification/approved-ci-runner.json",
  reportOut: "test-results/cywell-opslens-certification-ci-runner-promotion.json",
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

function usage() {
  return [
    "Usage:",
    "  npm run evidence:certification:ci-runner:promote -- --promote-reviewed --reviewer alice --review-ticket CHG-123 --force",
    "",
    "This writes approved-ci-runner.json only when the reviewed draft is current-head, complete, and non-mutating."
  ].join("\n");
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  draft: parsed.values.get("draft") ?? defaults.draft,
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  reportOut: parsed.values.get("report-out") ?? defaults.reportOut,
  reviewer: parsed.values.get("reviewer"),
  reviewTicket: parsed.values.get("review-ticket") ?? parsed.values.get("ticket"),
  reviewedAt: parsed.values.get("reviewed-at") ?? new Date().toISOString(),
  force: parsed.flags.has("force"),
  promoteReviewed: parsed.flags.has("promote-reviewed"),
  allowOutputOverride: parsed.flags.has("allow-output-override"),
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

function record(status, id, detail) {
  checks.push({ status, id, detail: sanitize(detail) });
}

function pass(id, detail) {
  record("PASS", id, detail);
}

function fail(id, detail) {
  record("FAIL", id, detail);
}

function meaningful(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) &&
    !/[<>]/.test(text) &&
    !/\b(example|placeholder|todo|changeme|missing|unknown)\b/i.test(text);
}

function hasDigest(value) {
  return /@sha256:[a-f0-9]{64}/i.test(String(value ?? ""));
}

function isoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function requirement(id, condition, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return { ok: true, stdout: sanitize(stdout.trim()), stderr: sanitize(stderr.trim()) };
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

function loadJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail(label, `${absolutePath} is missing`);
    return undefined;
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} loaded`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function validateDraft(draft, outputPath, headSha) {
  requirement("explicit-promotion-flag", options.promoteReviewed, "--promote-reviewed must be supplied");
  requirement("reviewer", meaningful(options.reviewer), "reviewer is named");
  requirement("review-ticket", meaningful(options.reviewTicket), "review ticket is present");
  requirement("reviewed-at", isoTimestamp(options.reviewedAt), "reviewedAt is ISO-parseable");
  if (!draft) return;

  requirement(
    "draft-type",
    draft.artifactType === "opslens.certification-ci-runner-draft.v0.1" &&
      draft.draft === true &&
      draft.actionMode === "draftOnly",
    "source artifact is an explicit certification CI runner draft"
  );
  requirement("draft-state", draft.evidenceState === "DRAFT_REVIEW_READY", "draft is review-ready");
  requirement("draft-head", draft.ref?.headSha === headSha, `draft head matches current head ${headSha}`);
  requirement("draft-clean", draft.ref?.worktreeDirty === false, "draft was generated from a clean worktree");
  requirement(
    "final-target",
    options.allowOutputOverride || resolve(draft.finalEvidenceFile ?? "") === outputPath,
    "draft finalEvidenceFile matches output path"
  );

  const runner = draft.runner ?? {};
  requirement("runner-id", meaningful(runner.id), "runner.id is present");
  requirement("runner-image", meaningful(runner.image), "runner.image is present");
  requirement("runner-image-digest", hasDigest(runner.imageDigest), "runner.imageDigest is immutable");
  requirement("runner-approved-by", meaningful(runner.approvedBy), "runner.approvedBy is present");
  requirement("runner-ticket", meaningful(runner.ticket), "runner.ticket is present");
  requirement("runner-approved-at", isoTimestamp(runner.approvedAt), "runner.approvedAt is ISO-parseable");

  for (const tool of ["oc", "docker", "opm", "operatorSdk"]) {
    requirement(`tool-${tool}`, meaningful(draft.toolVersions?.[tool]), `toolVersions.${tool} is present`);
  }
  for (const field of [
    "certificationReadiness",
    "catalogToolchain",
    "opmValidateLog",
    "operatorSdkBundleValidateLog",
    "operatorSdkScorecardLog"
  ]) {
    requirement(
      `evidence-${field}`,
      meaningful(draft.evidenceArtifacts?.[field]),
      `evidenceArtifacts.${field} is present`
    );
  }
  requirement(
    "no-mutation",
    draft.registryMutationAttempted === false &&
      draft.clusterMutationAttempted === false &&
      draft.mutationAllowedByThisVerifier === false,
    "draft reports no registry, cluster, or verifier mutation"
  );
}

function finalEvidenceFromDraft(draft, draftPath) {
  const {
    draft: _draftMarker,
    evidenceState: _evidenceState,
    finalSchema: _finalSchema,
    finalArtifactType: _finalArtifactType,
    finalEvidenceFile: _finalEvidenceFile,
    reviewerRequests: _reviewerRequests,
    missingEvidence: _missingEvidence,
    checks: _checks,
    nextCommands: _nextCommands,
    ...rest
  } = draft;

  return {
    ...rest,
    schema: "cywell.opslens.certification-ci-runner.v0.1",
    artifactType: "opslens.certification-ci-runner.v0.1",
    promotedAt: new Date().toISOString(),
    reviewedAt: options.reviewedAt,
    reviewedBy: sanitize(options.reviewer),
    reviewTicket: sanitize(options.reviewTicket),
    promotionSourceDraft: resolve(draftPath),
    actionMode: "reviewedCiRunnerPromotion",
    mutation: false,
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    notes: [
      "Final evidence was promoted from a reviewed approved-ci-runner.draft.json packet.",
      "This local promotion does not approve Partner Connect, OperatorHub submission, registry push, signing, mirroring, install, patch, apply, delete, or scale actions."
    ]
  };
}

async function main() {
  const draftPath = resolve(options.draft);
  const outputPath = resolve(options.evidenceOut);
  const reportPath = resolve(options.reportOut);

  if (!options.promoteReviewed) {
    console.error(usage());
  }
  if (outputPath.endsWith(".draft.json")) {
    fail("output-path", "final evidence output must not end with .draft.json");
  } else {
    pass("output-path", outputPath);
  }
  if (existsSync(outputPath) && !options.force) {
    fail("output-overwrite", `${outputPath} already exists; pass --force after reviewer approval`);
  } else {
    pass("output-overwrite", "output path is writable under current flags");
  }

  const [branch, headSha, baseRef, worktreeStatus] = await Promise.all([
    gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    gitStatusShort()
  ]);
  const draft = loadJson(draftPath, "certification CI runner draft");
  validateDraft(draft, outputPath, headSha);

  const status = checks.some((check) => check.status === "FAIL") ? "BLOCKED" : "PROMOTED";
  if (status === "PROMOTED") {
    const finalEvidence = finalEvidenceFromDraft(draft, draftPath);
    const serializedFinal = `${JSON.stringify(finalEvidence, null, 2)}\n`;
    if (secretLike(serializedFinal)) {
      throw new Error("final certification CI runner evidence would include secret-like material");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serializedFinal, "utf8");
    pass("final evidence export", `${outputPath} written`);
  }

  const report = {
    schema: "cywell.opslens.certification-ci-runner-promotion-review.v0.1",
    artifactType: "opslens.certification-ci-runner-promotion-review.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "reviewGateOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    draftPath,
    outputPath,
    promoted: status === "PROMOTED",
    reviewer: sanitize(options.reviewer),
    reviewTicket: sanitize(options.reviewTicket),
    reviewedAt: options.reviewedAt,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    missingEvidence: checks
      .filter((check) => check.status === "FAIL")
      .map((check) => `${check.id}: ${check.detail}`),
    risk: [
      "Promotion is a local file write only; it does not install tools, pull runner images, log in to registries, submit to Partner Connect or OperatorHub, or mutate a cluster.",
      "Final evidence is only trustworthy when the runner digest, approval ticket, tool versions, and validation logs were reviewed outside this script."
    ],
    rollbackPath: [
      "Delete or supersede approved-ci-runner.json if any referenced runner evidence is rejected.",
      "Regenerate certification, catalog, checkpoint, roadmap, release bundle, and action queue evidence from a clean Git HEAD after promotion."
    ],
    checks
  };

  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (secretLike(serializedReport)) {
    throw new Error("certification CI runner promotion report would include secret-like material");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serializedReport, "utf8");

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.id}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens certification CI runner promotion: status=${status}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
