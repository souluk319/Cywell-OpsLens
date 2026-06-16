#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-security-scan-plan.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  securityScanRunner: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  securityEvidenceDir: "docs/release/evidence/security",
  timeoutMs: 10000
};

const fallbackOwnedImages = [
  { name: "operator", image: "quay.io/cywell/opslens-operator:0.1.0", localTag: "cywell/opslens-operator:verify", required: true },
  { name: "api", image: "quay.io/cywell/opslens-api:0.1.0", localTag: "cywell/opslens-api:verify", required: true },
  { name: "dashboard", image: "quay.io/cywell/opslens-dashboard:0.1.0", localTag: "cywell/opslens-dashboard:verify", required: true },
  { name: "bundle", image: "quay.io/cywell/opslens-operator-bundle:0.1.0", localTag: "cywell/opslens-operator-bundle:verify", required: true },
  { name: "catalog", image: "quay.io/cywell/opslens-catalog:0.1.0", localTag: "cywell/opslens-catalog:verify", required: false }
];

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
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  ownedImageProvenance: parsed.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenance,
  externalRuntime: parsed.get("external-runtime-evidence") ?? defaults.externalRuntime,
  securityScanRunner: parsed.get("security-scan-runner-evidence") ?? defaults.securityScanRunner,
  securityEvidenceDir: parsed.get("security-evidence-dir") ?? defaults.securityEvidenceDir,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
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

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024
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
    warn(label, `${label} is missing at ${absolutePath}`);
    return undefined;
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function cliStatus(name, args) {
  const result = await runCapture(name, args);
  if (result.ok) {
    pass(`CLI ${name}`, result.stdout.split(/\r?\n/)[0] || "available");
  } else {
    warn(`CLI ${name}`, `${name} unavailable locally`);
  }
  return {
    name,
    available: result.ok,
    version: result.ok ? result.stdout.split(/\r?\n/)[0] || "available" : "missing",
    evidence: result.ok ? result.stdout.slice(0, 200) : result.stderr.slice(0, 200)
  };
}

function artifactHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function command(id, phase, text, purpose, { requiresNetwork = false, mutation = false, requiresExplicitApproval = false, writesLocalEvidence = false } = {}) {
  return {
    id,
    phase,
    command: text,
    purpose,
    requiresNetwork,
    mutation,
    requiresExplicitApproval,
    writesLocalEvidence
  };
}

function ownedImagesFrom(provenance) {
  const images = Array.isArray(provenance?.images) && provenance.images.length > 0
    ? provenance.images.map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        localTag: image.localTag ?? image.image ?? "unknown",
        imageId: image.imageId ?? "unknown",
        required: (provenance.requiredImages ?? ["operator", "api", "dashboard", "bundle"]).includes(image.name),
        source: "owned-provenance",
        provenanceStatus: image.status ?? "unknown"
      }))
    : fallbackOwnedImages.map((image) => ({ ...image, source: "fallback", provenanceStatus: "missing" }));

  for (const fallback of fallbackOwnedImages) {
    if (!images.some((image) => image.name === fallback.name)) {
      images.push({ ...fallback, source: "fallback", provenanceStatus: "missing" });
    }
  }
  return images;
}

function externalImagesFrom(plan) {
  return (plan?.externalImages ?? []).map((image) => ({
    name: image.name ?? "unknown",
    image: image.image ?? "unknown",
    desiredMirror: image.desiredMirror ?? "unknown",
    source: "external-runtime",
    required: true,
    runtimeStatus: image.status ?? "unknown",
    draftStatus: image.draft?.status ?? "missing"
  }));
}

function evidencePaths(image) {
  return {
    vulnerabilityReport: resolve(options.securityEvidenceDir, `${image.name}-vulnerability.json`),
    sbom: resolve(options.securityEvidenceDir, `${image.name}-sbom.spdx.json`),
    review: resolve(options.securityEvidenceDir, `${image.name}-security-review.json`),
    reviewDraft: resolve(options.securityEvidenceDir, `${image.name}-security-review.draft.json`)
  };
}

function placeholderValue(value) {
  return value === undefined ||
    value === null ||
    value === "" ||
    /<[^>]+>/.test(String(value)) ||
    /\b(TBD|TODO|PLACEHOLDER|FILL_ME)\b/i.test(String(value));
}

function optionalJson(path, label) {
  if (!existsSync(path)) return { exists: false, valid: false, missingEvidence: [] };
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
      artifact: undefined,
      missingEvidence: [`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function criticalFindingsFromTrivy(report) {
  if (!Array.isArray(report?.Results)) {
    return report?.SchemaVersion && report?.Trivy ? 0 : undefined;
  }
  return report.Results.reduce((total, result) => {
    const vulnerabilities = Array.isArray(result?.Vulnerabilities)
      ? result.Vulnerabilities
      : [];
    return total + vulnerabilities.filter((vulnerability) =>
      String(vulnerability?.Severity ?? "").toUpperCase() === "CRITICAL"
    ).length;
  }, 0);
}

function securityScanRunnerCoverage(runner, currentHeadSha) {
  const required = new Set(["operator", "api", "dashboard", "bundle"]);
  const results = Array.isArray(runner?.results) ? runner.results : [];
  const passedTargets = new Set(
    results
      .filter((result) =>
        required.has(result.name) &&
        result.executionMode === "docker-fallback" &&
        result.vulnerabilityReport?.status === "PASS" &&
        result.sbom?.status === "PASS"
      )
      .map((result) => result.name)
  );
  const missingTargets = [...required].filter((name) => !passedTargets.has(name));
  const fresh =
    artifactHeadSha(runner) === currentHeadSha &&
    artifactDirty(runner) === false;
  const scannerDigestsPinned =
    runner?.scannerImages?.trivy?.digestResolved === true &&
    runner?.scannerImages?.syft?.digestResolved === true;
  const evidenceWritten =
    runner?.status === "EVIDENCE_WRITTEN" &&
    runner?.actionMode === "scanEvidenceLocalWrite" &&
    runner?.options?.executeDockerFallback === true &&
    fresh &&
    scannerDigestsPinned &&
    missingTargets.length === 0 &&
    runner?.registryMutationAttempted === false &&
    runner?.clusterMutationAttempted === false &&
    runner?.mutationAllowedByThisVerifier === false;

  return {
    evidenceWritten,
    fresh,
    scannerDigestsPinned,
    missingTargets,
    status: runner?.status ?? "missing",
    actionMode: runner?.actionMode ?? "missing",
    executeDockerFallback: runner?.options?.executeDockerFallback === true
  };
}

function numberField(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function validateVulnerabilityEvidence(path, image) {
  const loaded = optionalJson(path, `${image.name} vulnerability evidence`);
  if (!loaded.exists) {
    return {
      exists: false,
      valid: false,
      criticalFindings: undefined,
      scanner: "missing",
      missingEvidence: []
    };
  }
  const report = loaded.artifact;
  const criticalFindings = numberField(
    report?.criticalFindings,
    report?.summary?.criticalFindings,
    report?.metadata?.criticalFindings,
    criticalFindingsFromTrivy(report)
  );
  const scanner = report?.scanner?.name ?? report?.metadata?.scanner ?? "trivy-json";
  const missingEvidence = [...loaded.missingEvidence];
  if (criticalFindings === undefined) {
    missingEvidence.push(`${image.name} vulnerability evidence must expose criticalFindings or Trivy Results`);
  } else if (criticalFindings > 0) {
    missingEvidence.push(`${image.name} vulnerability evidence reports criticalFindings=${criticalFindings}`);
  }
  if (
    report &&
    !report.SchemaVersion &&
    !report.schema &&
    !report.artifactType &&
    !report.scanner
  ) {
    missingEvidence.push(`${image.name} vulnerability evidence must identify the scanner or schema`);
  }
  return {
    exists: true,
    valid: missingEvidence.length === 0,
    criticalFindings,
    scanner,
    missingEvidence
  };
}

function validateSbomEvidence(path, image) {
  const loaded = optionalJson(path, `${image.name} SBOM evidence`);
  if (!loaded.exists) {
    return {
      exists: false,
      valid: false,
      format: "missing",
      packageCount: 0,
      missingEvidence: []
    };
  }
  const sbom = loaded.artifact;
  const missingEvidence = [...loaded.missingEvidence];
  const packageCount = Array.isArray(sbom?.packages)
    ? sbom.packages.length
    : Array.isArray(sbom?.artifacts)
      ? sbom.artifacts.length
      : 0;
  const format = sbom?.spdxVersion ? "spdx-json" : sbom?.artifacts ? "syft-json" : "unknown";
  if (!sbom?.spdxVersion && !Array.isArray(sbom?.artifacts)) {
    missingEvidence.push(`${image.name} SBOM evidence must be SPDX JSON or Syft JSON`);
  }
  if (packageCount <= 0) {
    missingEvidence.push(`${image.name} SBOM evidence must list at least one package/artifact`);
  }
  return {
    exists: true,
    valid: missingEvidence.length === 0,
    format,
    packageCount,
    missingEvidence
  };
}

function validateSecurityReview(path, image) {
  const loaded = optionalJson(path, `${image.name} security review`);
  if (!loaded.exists) {
    return {
      exists: false,
      valid: false,
      approved: false,
      decision: "missing",
      missingEvidence: []
    };
  }
  const review = loaded.artifact;
  const missingEvidence = [...loaded.missingEvidence];
  const decision = String(review?.decision ?? review?.status ?? "missing").toLowerCase();
  const criticalFindings = numberField(
    review?.criticalFindings,
    review?.vulnerabilityScan?.criticalFindings
  );
  if (
    review?.artifactType !== "opslens.security-review.v0.1" &&
    review?.schema !== "cywell.opslens.security-review.v0.1"
  ) {
    missingEvidence.push(`${image.name} security review must use opslens.security-review.v0.1`);
  }
  if (review?.imageName !== image.name) {
    missingEvidence.push(`${image.name} security review imageName must equal ${image.name}`);
  }
  if (!["approved", "needs-remediation", "accepted-risk", "rejected"].includes(decision)) {
    missingEvidence.push(`${image.name} security review decision must be approved, needs-remediation, accepted-risk, or rejected`);
  }
  if (placeholderValue(review?.reviewer)) {
    missingEvidence.push(`${image.name} security review must identify a non-placeholder reviewer`);
  }
  if (placeholderValue(review?.reviewedAt) || Number.isNaN(Date.parse(String(review?.reviewedAt)))) {
    missingEvidence.push(`${image.name} security review must include reviewedAt as an ISO timestamp`);
  }
  if (placeholderValue(review?.ticket)) {
    missingEvidence.push(`${image.name} security review must include a release/security ticket`);
  }
  if (criticalFindings === undefined) {
    missingEvidence.push(`${image.name} security review must record criticalFindings`);
  } else if (criticalFindings > 0 && decision === "approved") {
    missingEvidence.push(`${image.name} security review cannot approve unresolved criticalFindings=${criticalFindings}`);
  }
  const approved = decision === "approved" && criticalFindings === 0;
  if (!approved) {
    missingEvidence.push(`${image.name} security review must be approved with criticalFindings=0 before release`);
  }
  return {
    exists: true,
    valid: missingEvidence.length === 0,
    approved,
    decision,
    reviewer: review?.reviewer ?? "missing",
    criticalFindings,
    missingEvidence
  };
}

function validateSecurityReviewDraft(path, image, currentHeadSha) {
  const loaded = optionalJson(path, `${image.name} security review draft`);
  if (!loaded.exists) {
    return {
      exists: false,
      valid: false,
      evidenceState: "missing",
      draftPath: path,
      finalEvidenceFile: evidencePaths(image).review,
      sameHead: false,
      worktreeClean: false,
      reviewerProvided: false,
      ticketProvided: false,
      decision: "missing",
      explicitDecisionProvided: false,
      readyForFinalReview: false,
      missingEvidence: [`${image.name} security review draft missing at ${path}`]
    };
  }

  const draft = loaded.artifact;
  const requirements = Array.isArray(draft?.requirements) ? draft.requirements : [];
  const missingEvidence = [...loaded.missingEvidence, ...(draft?.missingEvidence ?? [])].map(sanitize);
  const sameHead = artifactHeadSha(draft) === currentHeadSha;
  const worktreeClean = artifactDirty(draft) === false;
  const reviewerProvided = !placeholderValue(draft?.reviewer);
  const ticketProvided = !placeholderValue(draft?.ticket);
  const decision = String(draft?.decision ?? "missing").toLowerCase();
  const explicitDecisionProvided =
    draft?.approvalBoundary?.explicitDecisionProvided === true ||
    draft?.explicitDecisionProvided === true;
  const requirementsPassed =
    requirements.length > 0 && requirements.every((requirement) => requirement.pass === true);

  if (draft?.artifactType !== "opslens.security-review-draft.v0.1") {
    missingEvidence.push(`${image.name} security review draft must use opslens.security-review-draft.v0.1`);
  }
  if (draft?.imageName !== image.name) {
    missingEvidence.push(`${image.name} security review draft imageName must equal ${image.name}`);
  }
  if (!sameHead) {
    missingEvidence.push(`${image.name} security review draft head=${artifactHeadSha(draft) ?? "missing"} currentHead=${currentHeadSha}`);
  }
  if (!worktreeClean) {
    missingEvidence.push(`${image.name} security review draft worktree must be clean`);
  }
  if (!reviewerProvided) {
    missingEvidence.push(`${image.name} security review draft reviewer is still a placeholder`);
  }
  if (!ticketProvided) {
    missingEvidence.push(`${image.name} security review draft ticket is still a placeholder`);
  }
  if (decision !== "approved") {
    missingEvidence.push(`${image.name} security review draft decision must be explicitly approved before final evidence handoff`);
  } else if (!explicitDecisionProvided) {
    missingEvidence.push(`${image.name} security review draft decision=approved must prove explicit --decision approved input`);
  }

  const valid = missingEvidence.length === 0 && requirementsPassed;
  return {
    exists: true,
    valid,
    evidenceState: draft?.evidenceState ?? "unknown",
    draftPath: path,
    finalEvidenceFile: draft?.finalEvidenceFile ?? evidencePaths(image).review,
    sameHead,
    worktreeClean,
    reviewerProvided,
    ticketProvided,
    decision,
    explicitDecisionProvided,
    requirementsPassed,
    readyForFinalReview:
      valid &&
      draft?.evidenceState === "DRAFT_REVIEW_READY" &&
      decision === "approved" &&
      explicitDecisionProvided,
    missingEvidence
  };
}

function existingEvidenceState(image, currentHeadSha) {
  const paths = evidencePaths(image);
  const vulnerability = validateVulnerabilityEvidence(paths.vulnerabilityReport, image);
  const sbom = validateSbomEvidence(paths.sbom, image);
  const review = validateSecurityReview(paths.review, image);
  const reviewDraft = validateSecurityReviewDraft(paths.reviewDraft, image, currentHeadSha);
  for (const [label, state] of [
    ["vulnerability evidence", vulnerability],
    ["SBOM evidence", sbom],
    ["security review", review],
    ["security review draft", reviewDraft]
  ]) {
    if (state.exists && state.valid) {
      pass(`${image.name} ${label}`, "existing evidence is parseable and release-review compatible");
    } else if (state.exists) {
      warn(`${image.name} ${label}`, state.missingEvidence.join("; "));
    }
  }
  return {
    vulnerabilityReportExists: existsSync(paths.vulnerabilityReport),
    sbomExists: existsSync(paths.sbom),
    reviewExists: existsSync(paths.review),
    vulnerabilityReportValid: vulnerability.valid,
    vulnerabilityCriticalFindings: vulnerability.criticalFindings,
    sbomValid: sbom.valid,
    sbomFormat: sbom.format,
    sbomPackageCount: sbom.packageCount,
    reviewValid: review.valid,
    reviewApproved: review.approved,
    reviewDecision: review.decision,
    reviewCriticalFindings: review.criticalFindings,
    reviewDraft,
    validationMissingEvidence: [
      ...vulnerability.missingEvidence,
      ...sbom.missingEvidence,
      ...review.missingEvidence
    ],
    paths
  };
}

function buildCommands({ ownedImages, externalImages }) {
  const scanTarget = (image) => image.localTag ?? image.image;
  const readOnly = [
    command("certification-static", "static-readiness", "npm run verify:certification", "Run static catalog/certification checks before scan evidence review."),
    command("owned-provenance", "static-readiness", "npm run verify:owned-image-provenance", "Refresh owned image provenance before scan review."),
    command("external-runtime-plan", "static-readiness", "npm run verify:external-runtime-plan", "Refresh external runtime certification/mirroring plan before scan review."),
    command("security-scan-evidence-runner", "local-evidence-plan", "npm run evidence:security-scan -- --all", "Generate the local scan/SBOM evidence command packet before human security review.", { writesLocalEvidence: true }),
    command("security-review-drafts-all", "local-review-draft", "npm run evidence:security-review:draft -- --all --force", "Regenerate security review draft intake packets for every owned and external runtime image without creating final approval evidence.", { writesLocalEvidence: true }),
    command("security-scan-evidence-runner-docker", "local-evidence-generation", "npm run evidence:security-scan:docker", "Generate owned-image vulnerability/SBOM evidence through digest-resolved Docker scanner containers when local trivy/syft CLIs are unavailable.", { writesLocalEvidence: true }),
    ...ownedImages.flatMap((image) => [
      command(`trivy-owned-${image.name}`, "local-scan", `trivy image --format json --output docs/release/evidence/security/${image.name}-vulnerability.json ${scanTarget(image)}`, `Generate vulnerability scan evidence for owned image ${image.name}.`, { writesLocalEvidence: true }),
      command(`syft-owned-${image.name}`, "local-sbom", `syft ${scanTarget(image)} -o spdx-json > docs/release/evidence/security/${image.name}-sbom.spdx.json`, `Generate SBOM evidence for owned image ${image.name}.`, { writesLocalEvidence: true }),
      command(`grype-owned-${image.name}`, "local-scan", `grype ${scanTarget(image)} --fail-on critical`, `Fail local review if owned image ${image.name} has unresolved Critical findings.`)
    ]),
    ...externalImages.flatMap((image) => [
      command(`trivy-external-${image.name}`, "external-scan", `trivy image --format json --output docs/release/evidence/security/${image.name}-vulnerability.json ${image.image}`, `Generate vulnerability scan evidence for external runtime image ${image.name}.`, { requiresNetwork: true, writesLocalEvidence: true }),
      command(`syft-external-${image.name}`, "external-sbom", `syft ${image.image} -o spdx-json > docs/release/evidence/security/${image.name}-sbom.spdx.json`, `Generate SBOM evidence for external runtime image ${image.name}.`, { requiresNetwork: true, writesLocalEvidence: true }),
      command(`grype-external-${image.name}`, "external-scan", `grype ${image.image} --fail-on critical`, `Fail local review if external runtime image ${image.name} has unresolved Critical findings.`, { requiresNetwork: true })
    ])
  ];

  const setup = [
    command("install-trivy", "human-setup", "install trivy CLI on the release workstation", "Required for vulnerability scan evidence.", { requiresNetwork: true }),
    command("install-syft", "human-setup", "install syft CLI on the release workstation", "Required for SBOM evidence.", { requiresNetwork: true }),
    command("install-grype", "human-setup", "install grype CLI on the release workstation", "Optional but recommended for fail-on-critical local policy.", { requiresNetwork: true }),
    command("install-cosign", "human-setup", "install cosign CLI on the release workstation", "Required before approval-gated image signing.", { requiresNetwork: true })
  ];

  const approvalGated = [
    ...ownedImages.map((image) =>
      command(`sign-owned-${image.name}`, "approved-registry-mutation", `cosign sign ${image.image}`, `Sign owned image ${image.name} after release approval.`, {
        requiresNetwork: true,
        mutation: true,
        requiresExplicitApproval: true
      })
    ),
    ...externalImages.map((image) =>
      command(`sign-external-${image.name}`, "approved-registry-mutation", `cosign sign ${image.desiredMirror}`, `Sign mirrored external runtime image ${image.name} after release approval.`, {
        requiresNetwork: true,
        mutation: true,
        requiresExplicitApproval: true
      })
    )
  ];

  return { readOnly, setup, approvalGated };
}

function firstSecurityReviewActions(images, commands) {
  const requiredImages = images.filter((image) => image.required);
  const reviewActions = requiredImages
    .filter((image) => image.securityEvidence.reviewApproved !== true)
    .slice(0, 3)
    .map((image) => {
      const reviewDraft = image.securityEvidence.reviewDraft;
      const blockedBy = [
        ...(!image.securityEvidence.vulnerabilityReportValid
          ? [`${image.name} vulnerability scan evidence is missing or invalid`]
          : []),
        ...(!image.securityEvidence.sbomValid
          ? [`${image.name} SBOM evidence is missing or invalid`]
          : []),
        ...reviewDraft.missingEvidence
      ].slice(0, 6);

      return {
        id: `security-review-${image.name}`,
        owner: "security-reviewer",
        phase: "security-review-draft",
        status: reviewDraft.readyForFinalReview ? "ready-for-final-review" : "needs-evidence",
        request: `Review ${image.name} scan/SBOM evidence and create an explicit security review draft before final release evidence.`,
        evidenceNeeded: `${image.name} same-head vulnerability scan, SBOM, reviewer, security ticket, and explicit decision.`,
        nextCommand: `npm run evidence:security-review:draft -- --name ${image.name} --reviewer <security-reviewer> --ticket <security-ticket> --decision approved --force`,
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy,
        rollbackPath: `Delete or supersede ${image.name}-security-review.draft.json if it was created from the wrong image digest or Git head.`
      };
    });

  const firstMutatingCommand = commands.approvalGated.find((entry) => entry.mutation === true);
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "registry-admin",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until security and release approvals are explicit.`,
          evidenceNeeded: "All required vulnerability, SBOM, provenance, and security review evidence passes, and release-manager, registry-admin, security-reviewer, and product-owner approvals are recorded.",
          nextCommand: firstMutatingCommand.command,
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: requiredImages
            .filter((image) => image.securityEvidence.reviewApproved !== true)
            .map((image) => `${image.name}: approved security review evidence missing`),
          rollbackPath: "Do not attach signatures until approval; if a signature is attached from the wrong image digest, revoke or supersede it with corrected image and signature evidence."
        }
      ]
    : [];

  return [...reviewActions, ...gatedMutationAction];
}

function uniqueSanitized(values) {
  return [...new Set(values.filter(Boolean).map(sanitize))];
}

function securityReviewTicketClassification(image) {
  const evidence = image.securityEvidence ?? {};
  const draft = evidence.reviewDraft ?? {};
  if (evidence.vulnerabilityReportExists !== true || evidence.sbomExists !== true) {
    return "scan-or-sbom-missing";
  }
  if (evidence.vulnerabilityReportValid !== true || evidence.sbomValid !== true) {
    return "scan-or-sbom-invalid";
  }
  if (draft.exists !== true) {
    return "draft-missing";
  }
  if (draft.readyForFinalReview !== true) {
    return "draft-needs-evidence";
  }
  if (evidence.reviewExists !== true) {
    return "final-review-missing";
  }
  if (evidence.reviewApproved !== true) {
    return "final-review-not-approved";
  }
  return "review-approved";
}

function securityReviewTicketPackets(images, commands) {
  return images
    .filter((image) => image.required)
    .filter((image) => image.securityEvidence.reviewApproved !== true)
    .map((image) => {
      const evidence = image.securityEvidence;
      const draft = evidence.reviewDraft;
      const imageName = sanitize(image.name ?? "unknown");
      const signingCommand = commands.approvalGated.find((entry) =>
        String(entry.id ?? "").includes(imageName)
      );
      const nextReviewCommand = `npm run evidence:security-review:draft -- --name ${imageName} --reviewer <security-reviewer> --ticket <security-ticket> --decision approved --force`;
      const approvalCommand = signingCommand?.command ?? `cosign sign ${image.desiredMirror ?? image.image ?? "unknown"}`;
      const blockedBy = uniqueSanitized([
        ...(evidence.vulnerabilityReportValid === true
          ? []
          : [`${imageName} vulnerability scan evidence is missing or invalid`]),
        ...(evidence.sbomValid === true
          ? []
          : [`${imageName} SBOM evidence is missing or invalid`]),
        ...(evidence.reviewApproved === true
          ? []
          : [`${imageName} final security review evidence is not approved`]),
        ...draft.missingEvidence,
        ...evidence.validationMissingEvidence
      ]).slice(0, 8);

      return {
        id: `security-reviewer-${imageName}-security-review-ticket`,
        owner: "security-reviewer",
        title: `Security review handoff for ${imageName}`,
        severity: "high",
        imageName,
        image: sanitize(image.image ?? "unknown"),
        classification: securityReviewTicketClassification(image),
        draftStatus: draft.readyForFinalReview
          ? "ready-for-final-review"
          : draft.exists
            ? "draft-needs-evidence"
            : "missing",
        evidenceState: sanitize(draft.evidenceState ?? "missing"),
        finalEvidenceFile: sanitize(
          draft.finalEvidenceFile ??
            `docs/release/evidence/security/${imageName}-security-review.json`
        ),
        vulnerabilityReportExists: evidence.vulnerabilityReportExists === true,
        sbomExists: evidence.sbomExists === true,
        reviewExists: evidence.reviewExists === true,
        reviewApproved: evidence.reviewApproved === true,
        reviewerProvided: draft.reviewerProvided === true,
        ticketProvided: draft.ticketProvided === true,
        criticalFindings:
          Number.isFinite(Number(evidence.vulnerabilityCriticalFindings))
            ? Number(evidence.vulnerabilityCriticalFindings)
            : "unknown",
        evidenceChecklist: [
          `${imageName} vulnerability scan evidence exists and criticalFindings=0`,
          `${imageName} SBOM evidence exists and is parseable`,
          `${imageName} security review draft is same-head and clean`,
          `${imageName} reviewer and security ticket are non-placeholder values`,
          `${imageName} explicit decision is recorded before final evidence`,
          `${imageName} signing remains approval-gated and is not run by this verifier`
        ].map(sanitize),
        firstReadOnlyAction: {
          id: `security-review-${imageName}`,
          status: draft.readyForFinalReview
            ? "ready-for-final-review"
            : "needs-evidence",
          nextCommand: nextReviewCommand,
          mutation: false,
          requiresExplicitApproval: false
        },
        approvalGatedAction: {
          id: signingCommand?.id ?? `sign-${imageName}`,
          status: "approval-gated",
          nextCommand: approvalCommand,
          mutation: true,
          requiresExplicitApproval: true
        },
        nextCommands: uniqueSanitized([
          nextReviewCommand,
          `npm run evidence:security-review:promote -- --name ${imageName} --promote-reviewed --reviewer <security-reviewer> --review-ticket <security-ticket> --force`,
          approvalCommand
        ]),
        blockedBy,
        mutationBoundary: {
          clusterMutationAttempted: false,
          registryMutationAttempted: false,
          mutationAllowedByThisVerifier: false,
          signingRequiresExplicitApproval: true
        },
        risk:
          "Security review handoff blocks release approval until scan, SBOM, reviewer, ticket, and explicit decision evidence are same-head and reviewed.",
        rollbackPath:
          `Delete or supersede ${imageName}-security-review.draft.json and regenerate security scan evidence if the ticket was created from the wrong image digest or Git head.`
      };
    });
}

function securityReviewPromoteCommand(imageName) {
  return `npm run evidence:security-review:promote -- --name ${imageName} --promote-reviewed --reviewer <security-reviewer> --review-ticket <security-ticket> --force`;
}

function securityReviewFinalHandoff(images) {
  return images
    .filter((image) => image.required)
    .map((image) => {
      const evidence = image.securityEvidence;
      const draft = evidence.reviewDraft;
      const imageName = sanitize(image.name ?? "unknown");
      const status = evidence.reviewApproved
        ? "reviewed-final-present"
        : draft.readyForFinalReview
          ? "ready-for-promotion-review"
          : "needs-reviewed-inputs";
      const blockedBy = uniqueSanitized([
        ...(evidence.vulnerabilityReportValid === true
          ? []
          : [`${imageName} vulnerability scan evidence is missing or invalid`]),
        ...(evidence.sbomValid === true
          ? []
          : [`${imageName} SBOM evidence is missing or invalid`]),
        ...(evidence.reviewApproved === true
          ? []
          : [`${imageName} final security review evidence is not approved`]),
        ...draft.missingEvidence
      ]).slice(0, 10);

      return {
        imageName,
        status,
        owner: "security-reviewer",
        draftPath: sanitize(draft.draftPath),
        finalEvidenceFile: sanitize(
          draft.finalEvidenceFile ??
            `docs/release/evidence/security/${imageName}-security-review.json`
        ),
        finalEvidenceExists: evidence.reviewExists === true,
        reviewApproved: evidence.reviewApproved === true,
        evidenceState: sanitize(draft.evidenceState ?? "missing"),
        draftStatus: draft.readyForFinalReview
          ? "ready-for-final-review"
          : draft.exists
            ? "draft-needs-evidence"
            : "missing",
        vulnerabilityReportExists: evidence.vulnerabilityReportExists === true,
        sbomExists: evidence.sbomExists === true,
        reviewerProvided: draft.reviewerProvided === true,
        ticketProvided: draft.ticketProvided === true,
        decision: sanitize(draft.decision ?? "missing"),
        explicitDecisionProvided: draft.explicitDecisionProvided === true,
        readyForFinalReview: draft.readyForFinalReview === true,
        missingEvidenceCount: blockedBy.length,
        evidenceChecklist: [
          `${imageName} vulnerability scan evidence is same-head and criticalFindings=0`,
          `${imageName} SBOM evidence is parseable and reviewed`,
          `${imageName} security review draft has non-placeholder reviewer and ticket`,
          `${imageName} security reviewer explicitly records decision=approved`,
          `${imageName} final review evidence is written only through the promote helper`,
          `${imageName} signing remains approval-gated and is not run by this verifier`
        ].map(sanitize),
        promotionCommand: securityReviewPromoteCommand(imageName),
        verificationCommand: "npm run verify:security-scan-plan",
        approvalRequired: status !== "reviewed-final-present",
        requiresExplicitApproval: true,
        mutationAllowed: false,
        writesLocalEvidence: true,
        blockedBy,
        rollbackPath:
          `Delete or supersede ${imageName}-security-review.draft.json or ${imageName}-security-review.json if reviewer evidence is rejected; no cluster or registry rollback is required.`
      };
    });
}

function securityEvidenceReadmeCheck() {
  const readmePath = resolve(options.securityEvidenceDir, "README.md");
  if (!existsSync(readmePath)) {
    fail("security evidence README", `${readmePath} is missing`);
    return;
  }
  const text = readFileSync(readmePath, "utf8");
  const required = ["Vulnerability scans", "SBOM", "Critical findings", "Signature", "operator-vulnerability.json", "pgvector-sbom.spdx.json"];
  const missing = required.filter((item) => !text.toLowerCase().includes(item.toLowerCase()));
  if (missing.length > 0) {
    fail("security evidence README", `missing ${missing.join(", ")}`);
  } else {
    pass("security evidence README", "documents vulnerability, SBOM, signature, and critical finding evidence");
  }
}

function planStatus(missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (missingEvidence.length > 0) return "NEEDS_TOOLING";
  return "READY_FOR_SCAN";
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "QUAY_TOKEN",
    "REGISTRY_TOKEN",
    "COSIGN_PASSWORD",
    "REDHAT_REGISTRY_PASSWORD"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  securityEvidenceReadmeCheck();
  const cli = [
    await cliStatus("trivy", ["--version"]),
    await cliStatus("syft", ["version"]),
    await cliStatus("grype", ["version"]),
    await cliStatus("cosign", ["version"]),
    await cliStatus("docker", ["--version"])
  ];
  const cliByName = new Map(cli.map((entry) => [entry.name, entry]));
  const ownedProvenance = loadJson(options.ownedImageProvenance, "owned image provenance");
  const externalRuntime = loadJson(options.externalRuntime, "external runtime plan");
  const securityScanRunner = loadJson(options.securityScanRunner, "security scan evidence runner");
  const runnerCoverage = securityScanRunnerCoverage(securityScanRunner, headSha);
  if (runnerCoverage.evidenceWritten) {
    pass(
      "security scan Docker fallback evidence",
      `same-head owned scan/SBOM evidence exists for operator, api, dashboard, bundle with digest-resolved scanner images`
    );
  } else if (securityScanRunner) {
    warn(
      "security scan Docker fallback evidence",
      `status=${runnerCoverage.status} actionMode=${runnerCoverage.actionMode} fresh=${String(runnerCoverage.fresh)} digestPinned=${String(runnerCoverage.scannerDigestsPinned)} missingTargets=${runnerCoverage.missingTargets.join(",") || "none"}`
    );
  }

  const ownedImages = ownedImagesFrom(ownedProvenance);
  const externalImages = externalImagesFrom(externalRuntime);
  const allImages = [...ownedImages, ...externalImages].map((image) => ({
    ...image,
    securityEvidence: existingEvidenceState(image, headSha)
  }));

  const missingEvidence = [];
  if (worktreeDirty) {
    missingEvidence.push(`current git worktree dirty=true currentHead=${headSha}`);
  }
  if (artifactHeadSha(ownedProvenance) !== headSha || artifactDirty(ownedProvenance) !== false || ownedProvenance?.status !== "PASS") {
    missingEvidence.push(`owned image provenance must be PASS and same-head clean before scan review; status=${ownedProvenance?.status ?? "missing"} head=${artifactHeadSha(ownedProvenance) ?? "missing"}`);
  }
  if (artifactHeadSha(externalRuntime) !== headSha || artifactDirty(externalRuntime) !== false) {
    missingEvidence.push(`external runtime plan must be same-head clean before scan review; status=${externalRuntime?.status ?? "missing"} head=${artifactHeadSha(externalRuntime) ?? "missing"}`);
  }
  for (const name of ["trivy", "syft"]) {
    if (!cliByName.get(name)?.available) {
      if (!runnerCoverage.evidenceWritten) {
        missingEvidence.push(`${name} CLI is required for vulnerability/SBOM evidence generation unless same-head Docker fallback evidence is written`);
      }
    }
  }
  if (!cliByName.get("cosign")?.available) {
    missingEvidence.push("cosign CLI is required before approval-gated signing evidence");
  }
  for (const image of allImages.filter((image) => image.required)) {
    if (!image.securityEvidence.vulnerabilityReportExists) {
      missingEvidence.push(`${image.name} vulnerability scan evidence missing at ${image.securityEvidence.paths.vulnerabilityReport}`);
    } else if (!image.securityEvidence.vulnerabilityReportValid) {
      missingEvidence.push(...image.securityEvidence.validationMissingEvidence.filter((entry) => entry.includes("vulnerability")));
    }
    if (!image.securityEvidence.sbomExists) {
      missingEvidence.push(`${image.name} SBOM evidence missing at ${image.securityEvidence.paths.sbom}`);
    } else if (!image.securityEvidence.sbomValid) {
      missingEvidence.push(...image.securityEvidence.validationMissingEvidence.filter((entry) => entry.includes("SBOM")));
    }
    if (!image.securityEvidence.reviewExists) {
      missingEvidence.push(`${image.name} security review evidence missing at ${image.securityEvidence.paths.review}`);
    } else if (!image.securityEvidence.reviewApproved) {
      missingEvidence.push(...image.securityEvidence.validationMissingEvidence.filter((entry) => entry.includes("security review")));
    }
  }

  const commands = buildCommands({ ownedImages, externalImages });
  const firstReviewActions = firstSecurityReviewActions(allImages, commands);
  const ticketPackets = securityReviewTicketPackets(allImages, commands);
  const finalHandoff = securityReviewFinalHandoff(allImages);
  if (
    ticketPackets.every(
      (ticket) =>
        ticket.firstReadOnlyAction.mutation === false &&
        ticket.firstReadOnlyAction.requiresExplicitApproval === false &&
        ticket.approvalGatedAction.mutation === true &&
        ticket.approvalGatedAction.requiresExplicitApproval === true &&
        ticket.mutationBoundary.clusterMutationAttempted === false &&
        ticket.mutationBoundary.registryMutationAttempted === false &&
        ticket.mutationBoundary.mutationAllowedByThisVerifier === false
    )
  ) {
    pass(
      "security review ticket boundary",
      `${ticketPackets.length} ticket packet(s) are read-only first and approval-gated for signing`
    );
  } else {
    fail(
      "security review ticket boundary",
      "security review tickets must keep first actions read-only and signing approval-gated"
    );
  }
  if (
    finalHandoff.length === allImages.filter((image) => image.required).length &&
    finalHandoff.every(
      (handoff) =>
        handoff.requiresExplicitApproval === true &&
        handoff.mutationAllowed === false &&
        handoff.writesLocalEvidence === true &&
        /promote-reviewed/.test(handoff.promotionCommand) &&
        /verify:security-scan-plan/.test(handoff.verificationCommand)
    )
  ) {
    pass(
      "security review final handoff boundary",
      `${finalHandoff.length} final security review handoff(s) require reviewed inputs before local promotion`
    );
  } else {
    fail(
      "security review final handoff boundary",
      "final security review handoffs must be local-evidence-only, review-gated, and non-mutating"
    );
  }
  const status = planStatus(missingEvidence);
  const artifact = {
    schema: "cywell.opslens.security-scan-plan.v0.1",
    artifactType: "opslens.security-scan-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "scanPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-CERT-001"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    cli,
    imageSources: {
      ownedImageProvenance: resolve(options.ownedImageProvenance),
      externalRuntime: resolve(options.externalRuntime),
      securityScanRunner: resolve(options.securityScanRunner),
      securityEvidenceDir: resolve(options.securityEvidenceDir)
    },
    securityScanRunner: runnerCoverage,
    images: allImages,
    commands,
    firstSecurityReviewActions: firstReviewActions,
    securityReviewFinalHandoff: finalHandoff,
    ticketPackets,
    missingEvidence,
    risk: [
      "A scan plan is not a certification result; release approval still requires reviewed scan, SBOM, signature, provenance, and critical-finding evidence.",
      "Same-head Docker fallback evidence can satisfy owned-image scan/SBOM generation when local trivy/syft CLIs are unavailable, but it does not replace final security review approval.",
      "External runtime image scans may require registry network access and immutable source digests before they are accepted for Certified Operator submission.",
      "Signing and registry attachment commands remain approval-gated and are not run by this verifier."
    ],
    rollbackPath: [
      "No cluster or registry rollback is required because this verifier writes local evidence only.",
      "Delete or supersede unreviewed files under docs/release/evidence/security if they were generated from the wrong image digest.",
      "If a scan finds Critical issues, rebuild or replace the image and regenerate image/provenance/security evidence from a clean Git HEAD."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("security scan plan would include a configured secret value");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("security scan plan export", `${resolve(options.evidenceOut)} written without secret material`);

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    warn: checks.filter((check) => check.status === "WARN").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens security scan plan: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("security scan plan runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] security scan plan runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
