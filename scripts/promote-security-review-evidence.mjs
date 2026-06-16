#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceDir: "docs/release/evidence/security",
  reportDir: "test-results",
  timeoutMs: 10000
};

const images = {
  operator: "quay.io/cywell/opslens-operator:0.1.0",
  api: "quay.io/cywell/opslens-api:0.1.0",
  dashboard: "quay.io/cywell/opslens-dashboard:0.1.0",
  bundle: "quay.io/cywell/opslens-operator-bundle:0.1.0",
  catalog: "quay.io/cywell/opslens-catalog:0.1.0",
  vllm: "quay.io/cywell/opslens-vllm:0.1.0",
  pgvector: "docker.io/pgvector/pgvector:pg16"
};

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
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
  return { values, flags };
}

function usage() {
  return [
    "Usage:",
    "  npm run evidence:security-review:promote -- --name operator --promote-reviewed --reviewer alice --review-ticket SEC-123 --force",
    "",
    `Supported names: ${Object.keys(images).join(", ")}`,
    "This writes final security-review evidence only when the reviewed draft is current-head, complete, approved, and non-mutating."
  ].join("\n");
}

const parsed = parseArgs(process.argv.slice(2));
const name = parsed.values.get("name");
if (!name || !Object.hasOwn(images, name)) {
  console.error(usage());
  process.exit(1);
}

const options = {
  name,
  evidenceDir: parsed.values.get("evidence-dir") ?? defaults.evidenceDir,
  draft: parsed.values.get("draft"),
  evidenceOut: parsed.values.get("evidence-out"),
  reportOut: parsed.values.get("report-out"),
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
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
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

function placeholderValue(value) {
  return value === undefined ||
    value === null ||
    value === "" ||
    /<[^>]+>/.test(String(value)) ||
    /\b(TBD|TODO|PLACEHOLDER|FILL_ME|UNKNOWN|MISSING)\b/i.test(String(value));
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

function artifactHeadSha(artifact) {
  return artifact?.ref?.headSha ?? artifact?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.ref?.worktreeDirty ?? artifact?.worktreeDirty;
}

function validateDraft(draft, outputPath, headSha) {
  requirement("explicit-promotion-flag", options.promoteReviewed, "--promote-reviewed must be supplied");
  requirement("reviewer", !placeholderValue(options.reviewer), "reviewer is named");
  requirement("review-ticket", !placeholderValue(options.reviewTicket), "review ticket is present");
  requirement("reviewed-at", isoTimestamp(options.reviewedAt), "reviewedAt is ISO-parseable");
  if (!draft) return;

  const requirements = Array.isArray(draft.requirements) ? draft.requirements : [];
  requirement(
    "draft-type",
    draft.artifactType === "opslens.security-review-draft.v0.1" &&
      draft.draft === true &&
      draft.actionMode === "draftOnly",
    "source artifact is an explicit draftOnly security review packet"
  );
  requirement("draft-state", draft.evidenceState === "DRAFT_REVIEW_READY", "draft is review-ready");
  requirement("name", draft.imageName === options.name, `draft imageName equals ${options.name}`);
  requirement("image", draft.image === images[options.name], images[options.name]);
  requirement("draft-head", artifactHeadSha(draft) === headSha, `draft head matches current head ${headSha}`);
  requirement("draft-clean", artifactDirty(draft) === false, "draft was generated from a clean worktree");
  requirement(
    "final-target",
    options.allowOutputOverride || resolve(draft.finalEvidenceFile ?? "") === outputPath,
    "draft finalEvidenceFile matches output path"
  );
  requirement(
    "requirements-pass",
    requirements.length > 0 && requirements.every((entry) => entry.pass === true),
    "all draft requirements pass"
  );
  requirement("decision", String(draft.decision ?? "").toLowerCase() === "approved", "decision is approved");
  requirement(
    "explicit-decision",
    draft.approvalBoundary?.explicitDecisionProvided === true || draft.explicitDecisionProvided === true,
    "decision=approved was explicitly provided"
  );
  requirement("reviewer-in-draft", !placeholderValue(draft.reviewer), "draft reviewer is non-placeholder");
  requirement("ticket-in-draft", !placeholderValue(draft.ticket), "draft ticket is non-placeholder");
  requirement("vulnerability-valid", draft.vulnerabilityReport?.valid === true, "vulnerability report is valid");
  requirement("sbom-valid", draft.sbom?.valid === true, "SBOM is valid");
  requirement("critical-findings", Number(draft.criticalFindings ?? 1) === 0, "criticalFindings=0");
  requirement(
    "no-mutation",
    draft.registryMutationAttempted === false &&
      draft.clusterMutationAttempted === false &&
      draft.mutationAllowedByThisVerifier === false,
    "draft reports no registry, cluster, or verifier mutation"
  );
}

function finalEvidenceFromDraft(draft, draftPath) {
  return {
    schema: "cywell.opslens.security-review.v0.1",
    artifactType: "opslens.security-review.v0.1",
    promotedAt: new Date().toISOString(),
    promotionSourceDraft: resolve(draftPath),
    actionMode: "reviewedSecurityPromotion",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: draft.ref,
    imageName: draft.imageName,
    image: draft.image,
    decision: "approved",
    criticalFindings: Number(draft.criticalFindings ?? 0),
    highFindings: Number(draft.highFindings ?? 0),
    vulnerabilityReport: draft.vulnerabilityReport?.path ?? `${options.evidenceDir}/${options.name}-vulnerability.json`,
    sbom: draft.sbom?.path ?? `${options.evidenceDir}/${options.name}-sbom.spdx.json`,
    reviewer: sanitize(options.reviewer),
    reviewedAt: options.reviewedAt,
    ticket: sanitize(options.reviewTicket),
    draftReviewer: sanitize(draft.reviewer),
    draftTicket: sanitize(draft.ticket),
    notes: [
      "Final security review evidence was promoted from a reviewed same-head security-review.draft.json packet.",
      "This local promotion does not sign, push, mirror, install, patch, apply, delete, scale, or approve release publication by itself."
    ]
  };
}

async function main() {
  const draftPath = resolve(options.draft ?? resolve(options.evidenceDir, `${options.name}-security-review.draft.json`));
  const outputPath = resolve(options.evidenceOut ?? resolve(options.evidenceDir, `${options.name}-security-review.json`));
  const reportPath = resolve(options.reportOut ?? resolve(defaults.reportDir, `cywell-opslens-security-review-promotion-${options.name}.json`));

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
  const draft = loadJson(draftPath, "security review draft");
  validateDraft(draft, outputPath, headSha);

  const status = checks.some((check) => check.status === "FAIL") ? "BLOCKED" : "PROMOTED";
  if (status === "PROMOTED") {
    const finalEvidence = finalEvidenceFromDraft(draft, draftPath);
    const serializedFinal = `${JSON.stringify(finalEvidence, null, 2)}\n`;
    if (secretLike(serializedFinal)) {
      throw new Error("final security review evidence would include secret-like material");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serializedFinal, "utf8");
    pass("final evidence export", `${outputPath} written`);
  }

  const report = {
    schema: "cywell.opslens.security-review-promotion-review.v0.1",
    artifactType: "opslens.security-review-promotion-review.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "reviewGateOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    name: options.name,
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
      "Promotion is a local file write only; it does not sign, push, mirror, install, patch, apply, delete, or scale anything.",
      "Final security review evidence is only trustworthy if the referenced vulnerability report, SBOM, reviewer, decision, and ticket were reviewed outside this script."
    ],
    rollbackPath: [
      "Delete or supersede the generated final security review file if any referenced scan/SBOM evidence is rejected.",
      "Regenerate security scan plan, checkpoint, roadmap, release bundle, and action queue evidence from a clean Git HEAD after promotion."
    ],
    checks
  };

  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (secretLike(serializedReport)) {
    throw new Error("security review promotion report would include secret-like material");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serializedReport, "utf8");

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.id}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens security review promotion: status=${status}, name=${options.name}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
