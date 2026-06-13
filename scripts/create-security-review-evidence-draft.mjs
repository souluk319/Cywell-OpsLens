#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceDir: "docs/release/evidence/security",
  timeoutMs: 10000
};

const imageDefaults = {
  operator: "quay.io/cywell/opslens-operator:0.1.0",
  api: "quay.io/cywell/opslens-api:0.1.0",
  dashboard: "quay.io/cywell/opslens-dashboard:0.1.0",
  bundle: "quay.io/cywell/opslens-operator-bundle:0.1.0",
  catalog: "quay.io/cywell/opslens-catalog:0.1.0",
  vllm: "quay.io/cywell/opslens-vllm:0.1.0",
  qdrant: "docker.io/qdrant/qdrant:v1.12.1"
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
    } else {
      values.set(key, "true");
    }
  }
  return values;
}

const parsed = parseArgs(process.argv.slice(2));
const imageName = parsed.get("name");

function usage() {
  return [
    "Usage:",
    "  npm run evidence:security-review:draft -- --name operator --reviewer <security-reviewer> --ticket <change-ticket> --force",
    "",
    `Supported names: ${Object.keys(imageDefaults).join(", ")}`,
    "This script writes only *-security-review.draft.json files. It never creates final release evidence."
  ].join("\n");
}

if (!imageName || !Object.hasOwn(imageDefaults, imageName)) {
  console.error(usage());
  process.exit(1);
}

const options = {
  name: imageName,
  evidenceDir: parsed.get("evidence-dir") ?? defaults.evidenceDir,
  image: parsed.get("image") ?? imageDefaults[imageName],
  vulnerabilityReport: parsed.get("vulnerability-report"),
  sbom: parsed.get("sbom"),
  reviewer: parsed.get("reviewer") ?? "<security-reviewer>",
  ticket: parsed.get("ticket") ?? "<release-or-security-ticket>",
  decision: parsed.get("decision"),
  evidenceOut: parsed.get("evidence-out"),
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs),
  force: parsed.get("force") === "true"
};

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /(?:token|password|passwd|secret|api[_-]?key)(=|:)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value);
}

function cliValue(value, label) {
  if (value && secretLike(value)) {
    throw new Error(`${label} appears to contain secret material; use a redacted ticket or evidence path instead`);
  }
  return value;
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

function placeholderValue(value) {
  return value === undefined ||
    value === null ||
    value === "" ||
    /<[^>]+>/.test(String(value)) ||
    /\b(TBD|TODO|PLACEHOLDER|FILL_ME)\b/i.test(String(value));
}

function readOptionalJson(path, label) {
  if (!existsSync(path)) {
    return { exists: false, valid: false, missingEvidence: [`${label} is missing at ${path}`] };
  }
  try {
    return {
      exists: true,
      valid: true,
      artifact: JSON.parse(readFileSync(path, "utf8")),
      missingEvidence: []
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      missingEvidence: [`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function criticalFindingsFromTrivy(report) {
  if (!Array.isArray(report?.Results)) return undefined;
  return report.Results.reduce((total, result) => {
    const vulnerabilities = Array.isArray(result?.Vulnerabilities)
      ? result.Vulnerabilities
      : [];
    return total + vulnerabilities.filter((vulnerability) =>
      String(vulnerability?.Severity ?? "").toUpperCase() === "CRITICAL"
    ).length;
  }, 0);
}

function numberField(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function vulnerabilitySummary(path) {
  const loaded = readOptionalJson(path, `${options.name} vulnerability report`);
  const report = loaded.artifact;
  const criticalFindings = numberField(
    report?.criticalFindings,
    report?.summary?.criticalFindings,
    criticalFindingsFromTrivy(report)
  );
  const highFindings = numberField(report?.highFindings, report?.summary?.highFindings);
  const missingEvidence = [...loaded.missingEvidence];
  if (loaded.exists && criticalFindings === undefined) {
    missingEvidence.push(`${options.name} vulnerability report must expose criticalFindings or Trivy Results`);
  }
  return {
    path,
    exists: loaded.exists,
    valid: loaded.valid && criticalFindings !== undefined,
    scanner: report?.scanner?.name ?? report?.metadata?.scanner ?? "trivy-json",
    criticalFindings,
    highFindings,
    missingEvidence
  };
}

function sbomSummary(path) {
  const loaded = readOptionalJson(path, `${options.name} SBOM`);
  const sbom = loaded.artifact;
  const packageCount = Array.isArray(sbom?.packages)
    ? sbom.packages.length
    : Array.isArray(sbom?.artifacts)
      ? sbom.artifacts.length
      : 0;
  const missingEvidence = [...loaded.missingEvidence];
  if (loaded.exists && packageCount <= 0) {
    missingEvidence.push(`${options.name} SBOM must list at least one package/artifact`);
  }
  return {
    path,
    exists: loaded.exists,
    valid: loaded.valid && packageCount > 0,
    format: sbom?.spdxVersion ? "spdx-json" : sbom?.artifacts ? "syft-json" : "unknown",
    packageCount,
    missingEvidence
  };
}

function requirement(id, pass, evidence) {
  return { id, pass, evidence };
}

async function buildDraft() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  const vulnerabilityReport = resolve(
    options.vulnerabilityReport ?? `${options.evidenceDir}/${options.name}-vulnerability.json`
  );
  const sbom = resolve(options.sbom ?? `${options.evidenceDir}/${options.name}-sbom.spdx.json`);
  const vulnerability = vulnerabilitySummary(vulnerabilityReport);
  const sbomEvidence = sbomSummary(sbom);
  const decision = cliValue(
    options.decision ?? (vulnerability.valid && sbomEvidence.valid && vulnerability.criticalFindings === 0 ? "approved" : "needs-remediation"),
    "decision"
  );
  const reviewer = cliValue(options.reviewer, "reviewer");
  const ticket = cliValue(options.ticket, "ticket");
  const reviewedAt = new Date().toISOString();
  const requirements = [
    requirement("worktree-clean", worktreeDirty === false, "draft should be generated from a clean Git worktree before final review"),
    requirement("reviewer", !placeholderValue(reviewer), "reviewer must be a non-placeholder security reviewer"),
    requirement("ticket", !placeholderValue(ticket), "ticket must reference a release/security review record"),
    requirement("vulnerability-report", vulnerability.valid, "vulnerability report must parse and expose criticalFindings"),
    requirement("sbom", sbomEvidence.valid, "SBOM must parse and list packages/artifacts"),
    requirement("critical-findings", vulnerability.criticalFindings === 0, "Critical findings must be zero before approval"),
    requirement("decision-approved", decision === "approved", "final release review requires decision=approved")
  ];
  const missingEvidence = [
    ...requirements.filter((item) => !item.pass).map((item) => `${item.id}: ${item.evidence}`),
    ...vulnerability.missingEvidence,
    ...sbomEvidence.missingEvidence
  ];
  return {
    schema: "cywell.opslens.security-review-draft.v0.1",
    artifactType: "opslens.security-review-draft.v0.1",
    draft: true,
    evidenceState: missingEvidence.length === 0 ? "DRAFT_REVIEW_READY" : "DRAFT_NEEDS_EVIDENCE",
    generatedAt: reviewedAt,
    actionMode: "draftOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    finalEvidenceFile: resolve(options.evidenceDir, `${options.name}-security-review.json`),
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    imageName: options.name,
    image: cliValue(options.image, "image"),
    decision,
    criticalFindings: vulnerability.criticalFindings,
    highFindings: vulnerability.highFindings,
    vulnerabilityReport: vulnerability,
    sbom: sbomEvidence,
    reviewer,
    reviewedAt,
    ticket,
    requirements,
    missingEvidence,
    nextSteps: [
      "Review the vulnerability report, SBOM, and release/security ticket.",
      `Only after review, create ${options.name}-security-review.json with artifactType=opslens.security-review.v0.1.`,
      "Regenerate npm run verify:security-scan-plan, verify:evidence-checkpoint, and verify:release-evidence-bundle from the same clean Git HEAD."
    ],
    risk: [
      "This artifact is draft-only intake evidence and does not approve signing, pushing, mirroring, or cluster mutation.",
      "A complete draft can still be rejected if the image digest, scan, SBOM, reviewer, or ticket is wrong."
    ],
    rollbackPath: [
      "Delete or supersede this draft if any referenced scan, SBOM, digest, or review decision is rejected.",
      "If Critical findings are present, rebuild or replace the image and regenerate scan/SBOM/review evidence."
    ]
  };
}

async function main() {
  const outputPath = resolve(
    options.evidenceOut ?? `${options.evidenceDir}/${options.name}-security-review.draft.json`
  );
  if (!outputPath.endsWith(".draft.json")) {
    throw new Error("security review draft output must end with .draft.json");
  }
  if (existsSync(outputPath) && !options.force) {
    throw new Error(`${outputPath} already exists; pass --force to replace the draft`);
  }
  const draft = await buildDraft();
  const serialized = `${JSON.stringify(draft, null, 2)}\n`;
  if (secretLike(serialized)) {
    throw new Error("security review draft would include secret-like material");
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`Cywell OpsLens security review draft written: ${outputPath}`);
  console.log(`name=${draft.imageName} state=${draft.evidenceState} missingEvidence=${draft.missingEvidence.length}`);
}

main().catch((error) => {
  console.error(`[FAIL] security review draft: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
