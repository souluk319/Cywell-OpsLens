#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  externalEvidenceDir: "docs/release/evidence/external-runtime",
  reportDir: "test-results",
  timeoutMs: 10000
};

const images = {
  vllm: {
    image: "quay.io/cywell/opslens-vllm:0.1.0",
    draft: "vllm.draft.json",
    final: "vllm.json"
  },
  qdrant: {
    image: "docker.io/qdrant/qdrant:v1.12.1",
    draft: "qdrant.draft.json",
    final: "qdrant.json"
  }
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
    "  npm run evidence:external-runtime:promote -- --name vllm --promote-reviewed --reviewer alice --review-ticket CHG-123 --force",
    "",
    "Supported names: vllm, qdrant",
    "This script writes final evidence only after every draft requirement is reviewed and complete."
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
  externalEvidenceDir:
    parsed.values.get("external-evidence-dir") ?? defaults.externalEvidenceDir,
  draft: parsed.values.get("draft"),
  evidenceOut: parsed.values.get("evidence-out"),
  reportOut: parsed.values.get("report-out"),
  reviewer: parsed.values.get("reviewer"),
  reviewTicket: parsed.values.get("review-ticket") ?? parsed.values.get("ticket"),
  reviewedAt: parsed.values.get("reviewed-at") ?? new Date().toISOString(),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  force: parsed.flags.has("force"),
  promoteReviewed: parsed.flags.has("promote-reviewed"),
  allowOutputOverride: parsed.flags.has("allow-output-override")
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

function approved(value) {
  return ["approved", "pass", "passed", "certified", "ready"].includes(
    String(value ?? "").toLowerCase()
  );
}

function hasDigest(value) {
  return typeof value === "string" && value.includes("@sha256:") && !value.includes("<");
}

function missingValue(value) {
  return value === undefined ||
    value === null ||
    value === "" ||
    String(value).includes("<missing:") ||
    String(value).includes("<fill-") ||
    String(value).includes("<container-") ||
    String(value).includes("<provenance-") ||
    String(value).includes("<license-") ||
    String(value).includes("<change-") ||
    String(value).includes("<ISO-");
}

function nonPlaceholder(value) {
  return !missingValue(value) && !/^(tbd|todo|placeholder|fill_me)$/i.test(String(value ?? ""));
}

function isoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function requirement(id, condition, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

function validateDraft(draft, outputPath) {
  const expected = images[options.name];
  requirement(
    "explicit-promotion-flag",
    options.promoteReviewed,
    "--promote-reviewed must be supplied by the reviewer"
  );
  requirement("reviewer", nonPlaceholder(options.reviewer), "reviewer is named");
  requirement("review-ticket", nonPlaceholder(options.reviewTicket), "review ticket is present");
  requirement("reviewed-at", isoTimestamp(options.reviewedAt), "reviewedAt is ISO-parseable");
  if (!draft) return;

  requirement(
    "draft-type",
    draft.artifactType === "opslens.external-runtime-image-evidence-draft.v0.1" &&
      draft.draft === true &&
      draft.actionMode === "draftOnly",
    "source artifact is an explicit draftOnly external runtime evidence packet"
  );
  requirement("draft-state", draft.evidenceState === "DRAFT_REVIEW_READY", "draft is review-ready");
  requirement("name", draft.name === options.name, `draft name equals ${options.name}`);
  requirement("image", draft.image === expected.image && draft.sourceImage === expected.image, expected.image);
  requirement("source-digest", hasDigest(draft.sourceDigest), "sourceDigest is immutable sha256");
  requirement(
    "mirror-digest",
    typeof draft.mirroredImage === "string" && hasDigest(draft.mirroredDigest),
    "mirroredImage and mirroredDigest are immutable"
  );
  requirement(
    "certification",
    approved(draft.certification?.status) && nonPlaceholder(draft.certification?.evidenceUrl),
    "certification evidence is approved"
  );
  requirement(
    "vulnerability-scan",
    approved(draft.vulnerabilityScan?.status) &&
      Number(draft.vulnerabilityScan?.criticalFindings ?? 1) === 0 &&
      nonPlaceholder(draft.vulnerabilityScan?.evidencePath),
    "vulnerability scan is approved with criticalFindings=0"
  );
  requirement(
    "sbom",
    approved(draft.sbom?.status) && nonPlaceholder(draft.sbom?.evidencePath),
    "SBOM evidence is approved"
  );
  requirement(
    "provenance",
    approved(draft.provenance?.status) &&
      nonPlaceholder(draft.provenance?.source) &&
      nonPlaceholder(draft.provenance?.evidenceUrl),
    "provenance is approved"
  );
  requirement(
    "license-review",
    approved(draft.licenseReview?.status) && nonPlaceholder(draft.licenseReview?.evidenceUrl),
    "license/support review is approved"
  );
  requirement(
    "release-approval",
    approved(draft.approval?.status) &&
      Array.isArray(draft.approval?.approvers) &&
      draft.approval.approvers.length >= 4 &&
      nonPlaceholder(draft.approval?.ticket),
    "release approval has status, approvers, and ticket"
  );
  requirement(
    "no-mutation",
    draft.registryMutationAttempted === false &&
      draft.clusterMutationAttempted === false &&
      draft.mutationAllowedByThisVerifier === false,
    "draft reports no registry, cluster, or verifier mutation"
  );
  requirement(
    "final-target",
    options.allowOutputOverride ||
      resolve(draft.finalEvidenceFile ?? "") === outputPath,
    "draft finalEvidenceFile matches output path"
  );
}

function finalEvidenceFromDraft(draft, draftPath) {
  const {
    draft: _draftMarker,
    evidenceState: _evidenceState,
    finalEvidenceFile: _finalEvidenceFile,
    requirements: _requirements,
    missingEvidence: _missingEvidence,
    promotionRequirements: _promotionRequirements,
    ...rest
  } = draft;

  return {
    ...rest,
    schema: "cywell.opslens.external-runtime-evidence.v0.1",
    artifactType: "opslens.external-runtime-image-evidence.v0.1",
    promotedAt: new Date().toISOString(),
    reviewedAt: options.reviewedAt,
    reviewedBy: options.reviewer,
    reviewTicket: options.reviewTicket,
    promotionSourceDraft: resolve(draftPath),
    actionMode: "reviewedEvidencePromotion",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false
  };
}

async function main() {
  const draftPath = resolve(
    options.draft ??
      resolve(options.externalEvidenceDir, images[options.name].draft)
  );
  const outputPath = resolve(
    options.evidenceOut ??
      resolve(options.externalEvidenceDir, images[options.name].final)
  );
  const reportPath = resolve(
    options.reportOut ??
      resolve(defaults.reportDir, `cywell-opslens-external-runtime-promotion-${options.name}.json`)
  );

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

  const draft = loadJson(draftPath, "external runtime draft");
  validateDraft(draft, outputPath);

  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    "origin/main"
  );
  const worktreeStatus = await gitStatusShort();
  const status = checks.some((check) => check.status === "FAIL") ? "BLOCKED" : "PROMOTED";

  let finalEvidence;
  if (status === "PROMOTED") {
    finalEvidence = finalEvidenceFromDraft(draft, draftPath);
    const serializedFinal = `${JSON.stringify(finalEvidence, null, 2)}\n`;
    if (secretLike(serializedFinal)) {
      throw new Error("final evidence would include secret-like material");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serializedFinal, "utf8");
    pass("final evidence export", `${outputPath} written`);
  }

  const report = {
    schema: "cywell.opslens.external-runtime-promotion-review.v0.1",
    artifactType: "opslens.external-runtime-promotion-review.v0.1",
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
      "Promotion is a local file write only; it does not mirror, sign, push, install, patch, apply, delete, or scale anything.",
      "Final evidence is only trustworthy if every referenced digest, scan, SBOM, provenance, license, and approval artifact was reviewed outside this script."
    ],
    rollbackPath: [
      "Delete or supersede the generated final evidence file if any referenced evidence is rejected.",
      "Regenerate external runtime, release plan, checkpoint, roadmap, and release bundle evidence from a clean Git HEAD after promotion."
    ],
    checks
  };

  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (secretLike(serializedReport)) {
    throw new Error("promotion report would include secret-like material");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serializedReport, "utf8");

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.id}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens external runtime promotion: status=${status}, name=${options.name}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
