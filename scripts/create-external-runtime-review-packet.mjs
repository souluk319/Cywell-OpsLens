#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-external-runtime-review-packet.json",
  markdownOut: "test-results/cywell-opslens-external-runtime-review-packet.md",
  registryAdminMarkdownOut:
    "test-results/cywell-opslens-external-runtime-registry-admin.md",
  externalRuntimeEvidence: "test-results/cywell-opslens-external-runtime-images-plan.json",
  releasePlanEvidence: "test-results/cywell-opslens-release-publish-plan.json",
  securityScanEvidence: "test-results/cywell-opslens-security-scan-plan.json",
  securityScanRunnerEvidence: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  ownedImageProvenanceEvidence: "test-results/cywell-opslens-owned-image-provenance.json",
  externalRuntimeCandidateMatrix: "test-results/cywell-opslens-external-runtime-candidate-matrix.json",
  externalEvidenceDir: "docs/release/evidence/external-runtime",
  timeoutMs: 10000
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
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  registryAdminMarkdownOut:
    parsed.get("registry-admin-markdown-out") ?? defaults.registryAdminMarkdownOut,
  externalRuntimeEvidence:
    parsed.get("external-runtime-evidence") ?? defaults.externalRuntimeEvidence,
  releasePlanEvidence: parsed.get("release-plan-evidence") ?? defaults.releasePlanEvidence,
  securityScanEvidence: parsed.get("security-scan-evidence") ?? defaults.securityScanEvidence,
  securityScanRunnerEvidence:
    parsed.get("security-scan-runner-evidence") ?? defaults.securityScanRunnerEvidence,
  ownedImageProvenanceEvidence:
    parsed.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenanceEvidence,
  externalRuntimeCandidateMatrix:
    parsed.get("external-runtime-candidate-matrix-evidence") ?? defaults.externalRuntimeCandidateMatrix,
  externalEvidenceDir: parsed.get("external-evidence-dir") ?? defaults.externalEvidenceDir,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

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

async function runCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return sanitize(stdout.trim());
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

function loadJson(path, label, { required = true } = {}) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    if (required) fail(label, `${absolutePath} is missing`);
    else warn(label, `${absolutePath} is missing`);
    return undefined;
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? artifact.evidenceState ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function artifactFresh(artifact, currentHeadSha) {
  const ref = artifactRef(artifact);
  return ref.headSha === currentHeadSha && ref.worktreeDirty === false;
}

function sourceSummary(id, label, path, artifact, currentHeadSha, acceptableStatuses, required = false) {
  const ref = artifactRef(artifact);
  const status = artifact?.status ?? artifact?.evidenceState ?? "missing";
  const fresh = artifact ? artifactFresh(artifact, currentHeadSha) : false;
  const acceptable = artifact && acceptableStatuses.includes(status);
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true;

  if (!artifact && required) {
    fail(`${label} source`, `${label} is missing`);
  } else if (!artifact) {
    warn(`${label} source`, `${label} is missing`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is stale head=${ref.headSha ?? "missing"} dirty=${String(ref.worktreeDirty ?? "unknown")}`);
  } else if (!acceptable) {
    warn(`${label} source`, `${label} status=${status}`);
  } else if (mutationViolation) {
    fail(`${label} source`, `${label} reports forbidden mutation flags`);
  } else {
    pass(`${label} source`, `${label} is fresh and acceptable`);
  }

  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    fresh,
    acceptable: Boolean(acceptable),
    required,
    mutationViolation,
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(sanitize)));
}

function hasDigest(value) {
  return typeof value === "string" && value.includes("@sha256:") && !value.includes("<");
}

function registryAccessClassification(detail) {
  const text = String(detail ?? "").toLowerCase();
  if (/\b401\b|unauthorized|authentication required|access denied/.test(text)) {
    return "registry-auth-required";
  }
  if (/\b403\b|forbidden|permission denied/.test(text)) return "registry-permission-denied";
  if (/\b404\b|not found|manifest unknown/.test(text)) return "registry-manifest-missing";
  if (/timeout|timed out/.test(text)) return "registry-timeout";
  if (/tls|certificate/.test(text)) return "registry-tls-failed";
  if (/sha256:[a-f0-9]{32,}/.test(text)) return "registry-digest-observed";
  return "registry-review-required";
}

function finalEvidenceStatus(path) {
  if (!path || !existsSync(resolve(path))) {
    return { exists: false, status: "missing", evidenceState: "missing" };
  }
  try {
    const artifact = JSON.parse(readFileSync(resolve(path), "utf8"));
    return {
      exists: true,
      status: artifact.status ?? "unknown",
      evidenceState: artifact.evidenceState ?? "unknown",
      artifactType: artifact.artifactType ?? artifact.schema ?? "unknown"
    };
  } catch (error) {
    return {
      exists: true,
      status: "invalid-json",
      evidenceState: "invalid-json",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function summarizeCandidate(candidate) {
  if (!candidate) return undefined;
  const counts = candidate.vulnerability?.severityCounts ?? {};
  const criticalFindings = candidate.vulnerability?.criticalFindings ?? [];
  return {
    label: candidate.label ?? "unknown",
    image: candidate.image ?? "unknown",
    status: candidate.status ?? "unknown",
    releaseEligible: candidate.releaseEligible === true,
    criticalFindings: counts.CRITICAL ?? "unknown",
    highFindings: counts.HIGH ?? "unknown",
    mediumFindings: counts.MEDIUM ?? "unknown",
    lowFindings: counts.LOW ?? "unknown",
    deltaFromCurrent: candidate.deltaFromCurrent ?? {},
    vulnerabilityPath: candidate.vulnerability?.path ?? "missing",
    sbomPath: candidate.sbom?.path ?? "missing",
    reviewDraftPath: candidate.reviewDraft?.path ?? "missing",
    sbomPackageCount: candidate.sbom?.packageCount ?? "unknown",
    reviewDecision: candidate.reviewDraft?.decision ?? "unknown",
    criticalFindingPackages: unique(
      criticalFindings.map((finding) => finding.packageName ?? "unknown")
    ).slice(0, 6),
    criticalFindingIds: unique(
      criticalFindings.map((finding) => finding.vulnerabilityId ?? "unknown")
    ).slice(0, 10)
  };
}

function candidateMatrixSummary(name, candidateMatrix) {
  const image = (candidateMatrix?.images ?? []).find((entry) => entry.name === name);
  if (!image) {
    return {
      status: "missing",
      matrixStatus: candidateMatrix?.status ?? "missing",
      bestCandidate: undefined,
      zeroCriticalCandidates: [],
      recommendation: "candidate matrix is missing",
      missingEvidence: ["candidate matrix evidence is missing or has no image entry"]
    };
  }
  return {
    status: image.status ?? "unknown",
    matrixStatus: candidateMatrix?.status ?? "unknown",
    bestCandidate: summarizeCandidate(image.bestCandidate),
    zeroCriticalCandidates: (image.zeroCriticalCandidates ?? []).map(summarizeCandidate),
    recommendation: image.recommendation ?? "missing",
    missingEvidence: image.missingEvidence ?? []
  };
}

function candidateEvidenceLine(candidateMatrix) {
  const best = candidateMatrix?.bestCandidate;
  if (!best) return "";
  const criticalDetails = [
    Array.isArray(best.criticalFindingPackages) && best.criticalFindingPackages.length > 0
      ? `criticalPackages=${best.criticalFindingPackages.join(",")}`
      : "",
    Array.isArray(best.criticalFindingIds) && best.criticalFindingIds.length > 0
      ? `criticalIds=${best.criticalFindingIds.join(",")}`
      : ""
  ].filter(Boolean).join(" ");
  return best.releaseEligible === true
    ? `Best scanned candidate ${best.image} reports criticalFindings=0 highFindings=${best.highFindings}; scan=${best.vulnerabilityPath} sbom=${best.sbomPath}; approval is still required before promotion`
    : `Best scanned candidate ${best.image} reports criticalFindings=${best.criticalFindings} highFindings=${best.highFindings}; ${criticalDetails || "critical details unavailable"}; it reduces risk but still needs remediation or security exception before promotion`;
}

function candidateScanCommand(name) {
  const timeout = name === "vllm" ? " --timeout-ms 7200000" : "";
  const scannerOptions = name === "vllm"
    ? " --trivy-timeout 30m --trivy-scanners vuln"
    : "";
  return `npm run evidence:external-runtime:candidate-scan -- --name ${name} --candidate-image <candidate-image> --candidate-label <candidate-label> --execute-docker-fallback${timeout}${scannerOptions}`;
}

function digestReferenceBase(imageRef, fallbackName) {
  const value = String(imageRef ?? `<internal-registry>/cywell/${fallbackName}:<tag>`);
  const lastSlash = value.lastIndexOf("/");
  const lastColon = value.lastIndexOf(":");
  if (lastColon > lastSlash) return value.slice(0, lastColon);
  return value;
}

function reviewerRequests(name, image, draftMissingEvidence, draft, candidateMatrix) {
  const missing = draftMissingEvidence.join("\n");
  const requests = [];
  const draftCommand = (args) =>
    [
      `npm run evidence:external-runtime:draft -- --name ${name}`,
      ...args,
      "--force"
    ].join(" ");
  const add = (role, request, evidenceNeeded, nextCommand) => {
    requests.push({
      role,
      request: sanitize(request),
      evidenceNeeded: sanitize(evidenceNeeded),
      nextCommand: sanitize(nextCommand)
    });
  };

  if (missing.includes(`${name}-source-digest`)) {
    add(
      "registry-admin",
      `Resolve immutable source digest for ${image.image}.`,
      draft?.sourceDigestInspection?.detail ??
        "docker buildx imagetools inspect or registry-admin evidence with sha256 digest",
      "npm run evidence:external-runtime:draft:digests"
    );
  }
  if (missing.includes(`${name}-mirror-digest`)) {
    const desiredMirror = image.desiredMirror ?? `<internal-registry>/cywell/${name}:<tag>`;
    add(
      "registry-admin",
      `Record the approved internal mirror digest for ${name}.`,
      "mirroredImage and mirroredDigest pinned to the controlled internal registry",
      draftCommand([
        `--mirrored-image ${desiredMirror}`,
        `--mirrored-digest ${digestReferenceBase(desiredMirror, name)}@sha256:<digest>`,
        "--ticket <change-ticket>"
      ])
    );
  }
  if (missing.includes(`${name}-certification`)) {
    add(
      "security-reviewer",
      `Attach container certification evidence for ${name}.`,
      "container certification run, ticket, or approval reference",
      draftCommand([
        "--certification-status approved",
        "--certification-evidence <certification-ticket-or-url>",
        "--ticket <change-ticket>"
      ])
    );
  }
  if (missing.includes(`${name}-vulnerability-scan`)) {
    const scan = draft?.vulnerabilityScan;
    const candidateLine = candidateEvidenceLine(candidateMatrix);
    add(
      "security-reviewer",
      `Attach vulnerability scan evidence for ${name}.`,
      scan?.status === "needs-remediation"
        ? unique([
            `current ${scan.evidencePath ?? "scan evidence"} reports criticalFindings=${scan.criticalFindings ?? "unknown"} highFindings=${scan.highFindings ?? "unknown"}; replace or patch the image, then attach a reviewed zero-critical scan`,
            candidateLine
          ]).join("; ")
        : "trivy/grype report with criticalFindings=0 and reviewed high findings",
      candidateMatrix?.status === "candidate-ready-for-review"
        ? draftCommand([
            "--scan-status approved",
            "--scan-evidence <zero-critical-scan-report>",
            "--scan-critical-findings 0",
            "--ticket <change-ticket>"
          ])
        : candidateScanCommand(name)
    );
  }
  if (missing.includes(`${name}-sbom`)) {
    const sbom = draft?.sbom;
    add(
      "security-reviewer",
      `Attach SBOM evidence for ${name}.`,
      sbom?.status === "generated"
        ? `generated SBOM exists at ${sbom.evidencePath ?? "unknown"} with packages=${sbom.packageCount ?? "unknown"}; reviewer approval is still required`
        : "SPDX JSON or approved SBOM artifact path",
      draftCommand([
        "--sbom-status approved",
        "--sbom-evidence <approved-sbom-path-or-url>",
        "--ticket <change-ticket>"
      ])
    );
  }
  if (missing.includes(`${name}-provenance`)) {
    add(
      "release-manager",
      `Record source/build provenance for ${name}.`,
      "vendor release, model runtime build source, or provenance artifact",
      draftCommand([
        "--provenance-status approved",
        "--provenance-evidence <provenance-url-or-ticket>",
        "--ticket <change-ticket>"
      ])
    );
  }
  if (missing.includes(`${name}-license-review`)) {
    add(
      "product-owner",
      `Approve license and support boundary for ${name}.`,
      "license/support review ticket",
      draftCommand([
        "--license-status approved",
        "--license-evidence <license-review-ticket>",
        "--ticket <change-ticket>"
      ])
    );
  }
  if (missing.includes(`${name}-approval`)) {
    add(
      "release-manager",
      `Record final release approval for ${name}.`,
      "approver list, approval timestamp, and change/release ticket",
      draftCommand([
        "--approval-status approved",
        "--approved-at <iso-timestamp>",
        "--ticket <change-ticket>"
      ])
    );
  }

  return requests;
}

function candidateHandoffStatus(candidateMatrix) {
  const best = candidateMatrix?.bestCandidate;
  if (!best) return "needs-candidate";
  if (
    candidateMatrix?.status === "candidate-ready-for-review" &&
    best.releaseEligible === true
  ) {
    return "ready-for-human-review";
  }
  return "blocked-by-remediation";
}

function candidateHandoffItems(images) {
  return images.map((image) => {
    const candidateMatrix = image.candidateMatrix ?? {};
    const best = candidateMatrix.bestCandidate;
    const status = candidateHandoffStatus(candidateMatrix);
    const vulnerabilityRequest = image.reviewerRequests.find(
      (request) =>
        request.role === "security-reviewer" &&
        /vulnerability scan/i.test(request.request)
    );
    const blockedBy = unique([
      status === "ready-for-human-review"
        ? ""
        : `${image.name}: candidate status is ${candidateMatrix.status ?? "missing"}`,
      best?.releaseEligible === true
        ? ""
        : `${image.name}: best candidate is not release eligible`,
      image.finalEvidence.exists
        ? ""
        : `${image.name}: final reviewed runtime evidence is missing at ${image.finalEvidenceFile}`,
      ...image.missingEvidence
        .filter((item) =>
          /mirror-digest|certification|provenance|license-review|approval/.test(item)
        )
        .slice(0, 5)
        .map((item) => `${image.name}: ${item}`)
    ].filter(Boolean));

    return {
      imageName: image.name,
      status,
      owner: "security-reviewer",
      candidateStatus: candidateMatrix.status ?? "missing",
      candidateLabel: best?.label ?? "missing",
      candidateImage: best?.image ?? "missing",
      releaseEligible: best?.releaseEligible === true,
      criticalFindings: best?.criticalFindings ?? "unknown",
      highFindings: best?.highFindings ?? "unknown",
      reviewDecision: best?.reviewDecision ?? "unknown",
      approvalRequired: true,
      mutationAllowed: false,
      evidenceNeeded:
        vulnerabilityRequest?.evidenceNeeded ??
        candidateMatrix.recommendation ??
        "candidate scan and reviewer evidence are missing",
      nextCommand:
        vulnerabilityRequest?.nextCommand ??
        candidateScanCommand(image.name),
      blockedBy,
      rollbackPath:
        "No cluster or registry rollback is required from this handoff because it records review evidence only; supersede the draft packet if reviewer evidence is rejected."
    };
  });
}

function promotionCommand(name) {
  return `npm run evidence:external-runtime:promote -- --name ${name} --promote-reviewed --reviewer <reviewer> --review-ticket <change-ticket> --force`;
}

function finalEvidenceHandoffStatus(image) {
  if (image.finalEvidence?.exists === true) return "reviewed-final-present";
  if (
    image.evidenceState === "draft-review-ready" ||
    image.evidenceState === "DRAFT_REVIEW_READY" ||
    (image.missingEvidence ?? []).length === 0
  ) {
    return "ready-for-promotion-review";
  }
  return "needs-reviewed-inputs";
}

function finalEvidenceHandoffItems(images) {
  const requiredReviewerRoles = [
    "registry-admin",
    "security-reviewer",
    "release-manager",
    "product-owner"
  ];
  return images.map((image) => {
    const status = finalEvidenceHandoffStatus(image);
    const finalEvidenceMissing = image.finalEvidence?.exists !== true;
    const blockedBy = unique([
      finalEvidenceMissing
        ? `${image.name}: final reviewed evidence file is missing at ${image.finalEvidenceFile}`
        : "",
      ...image.missingEvidence.map((item) => `${image.name}: ${item}`)
    ].filter(Boolean));

    return {
      imageName: image.name,
      status,
      owner: "release-manager",
      draftFile: image.draftFile,
      finalEvidenceFile: image.finalEvidenceFile,
      finalEvidenceExists: image.finalEvidence?.exists === true,
      evidenceState: image.evidenceState,
      draftStatus: image.draftStatus,
      reviewerRequestCount: image.reviewerRequests.length,
      missingEvidenceCount: image.missingEvidence.length,
      requiredReviewerRoles,
      evidenceChecklist: unique([
        `Review ignored draft evidence at ${image.draftFile}.`,
        `Confirm ${image.finalEvidenceFile} is written only through the promote helper.`,
        "Confirm registry, security, release-manager, and product-owner evidence is reviewed before promotion.",
        "Rerun verify:external-runtime-plan after final reviewed evidence is present.",
        ...image.promotionRequirements
      ]),
      promotionCommand: promotionCommand(image.name),
      verificationCommand: "npm run verify:external-runtime-plan",
      approvalRequired: status !== "reviewed-final-present",
      requiresExplicitApproval: true,
      mutationAllowed: false,
      writesLocalEvidence: true,
      blockedBy,
      rollbackPath:
        "If reviewer evidence is rejected, keep the final evidence file absent or supersede it with a corrected reviewed draft; no cluster or registry rollback is required from this handoff."
    };
  });
}

function imagePackets(externalRuntime, candidateMatrix) {
  const images = Array.isArray(externalRuntime?.externalImages)
    ? externalRuntime.externalImages
    : [];
  if (images.length === 0) {
    fail("external runtime images", "external runtime plan has no externalImages inventory");
  }

  return images.map((image) => {
    const candidateSummary = candidateMatrixSummary(image.name, candidateMatrix);
    const draftPath = image.draftFile ?? resolve(options.externalEvidenceDir, `${image.name}.draft.json`);
    const draft = loadJson(draftPath, `${image.name} external runtime draft`, { required: false });
    const finalPath = image.evidenceFile ?? draft?.finalEvidenceFile ?? resolve(options.externalEvidenceDir, `${image.name}.json`);
    const finalStatus = finalEvidenceStatus(finalPath);
    const draftMissingEvidence = unique(
      Array.isArray(draft?.missingEvidence) && draft.missingEvidence.length > 0
        ? draft.missingEvidence
        : image.draft?.missingEvidence ?? []
    );
    const sourceDigest = hasDigest(draft?.sourceDigest)
      ? draft.sourceDigest
      : hasDigest(draft?.sourceDigestInspection?.sourceDigest)
        ? draft.sourceDigestInspection.sourceDigest
        : undefined;

    return {
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      sourceType: image.sourceType ?? "unknown",
      desiredMirror: image.desiredMirror ?? draft?.mirroredImage ?? "missing",
      draftFile: resolve(draftPath),
      finalEvidenceFile: resolve(finalPath),
      finalEvidence: finalStatus,
      status: image.status ?? "unknown",
      draftStatus: image.draft?.status ?? (draft ? "draft-present" : "missing"),
      evidenceState: draft?.evidenceState ?? image.draft?.evidenceState ?? "missing",
      sourceDigest: sourceDigest ?? draft?.sourceDigest ?? "missing",
      sourceDigestInspection: draft?.sourceDigestInspection ?? {
        status: "missing",
        detail: "draft source digest inspection is missing"
      },
      vulnerabilityScan: draft?.vulnerabilityScan ?? {
        status: "missing",
        criticalFindings: "unknown",
        highFindings: "unknown",
        evidencePath: "missing"
      },
      sbom: draft?.sbom ?? {
        status: "missing",
        format: "unknown",
        evidencePath: "missing"
      },
      securityEvidenceInspection: draft?.securityEvidenceInspection ?? {
        vulnerabilityScan: {
          state: "missing",
          detail: "draft vulnerability evidence inspection is missing"
        },
        sbom: {
          state: "missing",
          detail: "draft SBOM evidence inspection is missing"
        }
      },
      missingEvidence: draftMissingEvidence,
      candidateMatrix: candidateSummary,
      reviewerRequests: reviewerRequests(image.name, image, draftMissingEvidence, draft, candidateSummary),
      promotionRequirements: draft?.promotionRequirements ?? [
        `Complete and review ${image.name}.draft.json before creating ${image.name}.json.`,
        "Regenerate verify:external-runtime-plan, verify:release-plan, verify:evidence-checkpoint, and verify:release-evidence-bundle from the same clean Git HEAD."
      ]
    };
  });
}

function readOnlyCommands(images, candidateMatrix) {
  const candidateScanCommands = (candidateMatrix?.readOnlyCommands ?? [])
    .filter((command) => String(command?.id ?? "").startsWith("scan-"))
    .map((command) => ({
      id: command.id ?? "scan-external-runtime-candidate",
      phase: command.phase ?? "candidate-scan",
      command: command.command ?? "npm run evidence:external-runtime:candidate-scan",
      purpose:
        command.purpose ??
        "Generate external runtime candidate vulnerability/SBOM evidence without changing release manifests.",
      mutation: command.mutation === true,
      writesLocalEvidence: command.writesLocalEvidence === true
    }));

  return [
    ...candidateScanCommands,
    {
      id: "refresh-external-runtime-drafts",
      phase: "local-evidence-refresh",
      command: "npm run evidence:external-runtime:draft:digests",
      purpose: "Refresh ignored vLLM/Postgres/pgvector draft evidence and collect source digests when registries expose them.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-external-runtime-plan",
      phase: "local-evidence-refresh",
      command: "npm run verify:external-runtime-plan",
      purpose: "Regenerate external runtime image evidence plan.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-security-scan-plan",
      phase: "local-evidence-refresh",
      command: "npm run verify:security-scan-plan",
      purpose: "Regenerate vulnerability/SBOM/signature evidence plan.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "refresh-external-runtime-candidate-matrix",
      phase: "candidate-review",
      command: "npm run evidence:external-runtime:candidates",
      purpose: "Refresh external runtime candidate vulnerability/SBOM comparison evidence without changing release manifests.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "plan-security-scan-evidence",
      phase: "local-evidence-refresh",
      command: "npm run evidence:security-scan -- --all",
      purpose: "Create a local scan/SBOM command packet without executing scans.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-release-plan",
      phase: "local-evidence-refresh",
      command: "npm run verify:release-plan",
      purpose: "Regenerate approval-gated release publish plan.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-evidence-checkpoint",
      phase: "local-evidence-refresh",
      command: "npm run verify:evidence-checkpoint",
      purpose: "Regenerate consolidated evidence checkpoint.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-release-evidence-bundle",
      phase: "local-evidence-refresh",
      command: "npm run verify:release-evidence-bundle",
      purpose: "Regenerate release-manager evidence packet.",
      mutation: false,
      writesLocalEvidence: true
    },
    ...images.map((image) => ({
      id: `inspect-source-${image.name}`,
      phase: "read-only-registry-inspection",
      command: `docker buildx imagetools inspect ${image.image}`,
      purpose: `Inspect ${image.name} source manifest metadata without pulling, pushing, mirroring, or signing.`,
      mutation: false,
      writesLocalEvidence: false
    }))
  ];
}

function approvalGatedCommands(externalRuntime) {
  return (externalRuntime?.commands ?? [])
    .filter((command) => command.mutation === true)
    .map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "approved-registry-mutation",
      command: sanitize(command.command ?? "unknown"),
      mutation: true,
      requiresExplicitApproval: true,
      rationale: sanitize(command.rationale ?? "requires human approval before execution"),
      rollback: sanitize(command.rollback ?? "supersede with a corrected approved digest")
    }));
}

function buildFirstRegistryActions(images, approvalGated) {
  const registryRequests = images.flatMap((image) =>
    image.reviewerRequests
      .filter((request) => request.role === "registry-admin")
      .slice(0, 3)
      .map((request, index) => ({
        id: `external-runtime-${image.name}-registry-${index + 1}`,
        owner: "registry-admin",
        phase: /draft:digests/i.test(request.nextCommand)
          ? "source-digest-inspection"
          : "mirror-digest-evidence",
        status:
          image.sourceDigestInspection?.status === "pass" &&
          !/draft:digests/i.test(request.nextCommand)
            ? "needs-mirror-evidence"
            : "needs-registry-access",
        request: request.request,
        evidenceNeeded: request.evidenceNeeded,
        nextCommand: request.nextCommand,
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: unique(
          [
            ...image.missingEvidence.filter((item) =>
              /source-digest|mirror-digest|registry|digest/i.test(item)
            ),
            `sourceDigestInspection=${image.sourceDigestInspection?.status ?? "missing"}`,
            image.finalEvidence.exists
              ? ""
              : `${image.name} final reviewed runtime evidence is missing`
          ].filter(Boolean)
        ),
        rollbackPath:
          "No rollback is required because registry-admin first actions only refresh ignored draft evidence or record reviewer-supplied digest references."
      }))
  );
  const gatedRegistryActions = approvalGated
    .filter((command) => command.mutation === true)
    .slice(0, 3)
    .map((command) => ({
      id: `approval-gated-${command.id}`,
      owner: "registry-admin",
      phase: command.phase,
      status: "approval-gated",
      request: `Do not run ${command.id} until external runtime evidence and approvals are explicit.`,
      evidenceNeeded:
        "Reviewed final vLLM/Postgres/pgvector evidence, immutable source digests, internal mirror digests, security approval, product approval, release-manager approval, and registry-admin approval.",
      nextCommand: command.command,
      mutation: true,
      requiresExplicitApproval: true,
      blockedBy: images
        .filter((image) => !image.finalEvidence.exists)
        .map((image) => `${image.name} final reviewed runtime evidence missing`),
      rollbackPath:
        command.rollback ??
        "Supersede the mirrored image, signature, and release evidence with corrected approved digests."
    }));

  return [...registryRequests, ...gatedRegistryActions];
}

function buildRegistryTicketPackets(images, firstRegistryActions, approvalGated) {
  return images.map((image) => {
    const firstReadOnly = firstRegistryActions.find(
      (action) =>
        action.owner === "registry-admin" &&
        action.mutation !== true &&
        action.id.startsWith(`external-runtime-${image.name}-registry-`)
    );
    const approval = approvalGated.find((command) => command.id === `mirror-${image.name}`);
    const classification = registryAccessClassification(
      image.sourceDigestInspection?.detail ?? image.sourceDigestInspection?.status
    );
    const authRequired = [
      "registry-auth-required",
      "registry-permission-denied"
    ].includes(classification);
    const registryNextCommands = unique(
      (image.reviewerRequests ?? [])
        .filter((request) => request.role === "registry-admin")
        .map((request) => request.nextCommand)
    );

    return {
      id: `registry-admin-${image.name}-external-runtime-ticket`,
      owner: "registry-admin",
      title: `Resolve ${image.name} external runtime digest and mirror evidence`,
      severity:
        image.name === "vllm" &&
        (classification === "registry-auth-required" ||
          image.sourceDigestInspection?.status !== "pass")
          ? "blocker"
          : "high",
      imageName: image.name,
      sourceImage: sanitize(image.image),
      desiredMirror: sanitize(image.desiredMirror),
      classification,
      draftStatus: sanitize(image.draftStatus ?? "missing"),
      evidenceState: sanitize(image.evidenceState ?? "missing"),
      finalEvidenceExists: image.finalEvidence?.exists === true,
      missingEvidenceCount: image.missingEvidence?.length ?? 0,
      evidenceChecklist: (image.missingEvidence ?? [])
        .filter((item) => /source-digest|mirror-digest|registry|digest|approval/i.test(item))
        .slice(0, 8)
        .map(sanitize),
      firstReadOnlyAction: {
        id: sanitize(firstReadOnly?.id ?? `external-runtime-${image.name}-registry-1`),
        status: sanitize(firstReadOnly?.status ?? "needs-registry-access"),
        nextCommand: sanitize(
          firstReadOnly?.nextCommand ?? "npm run evidence:external-runtime:draft:digests"
        ),
        mutation: false,
        requiresExplicitApproval: false
      },
      approvalGatedAction: {
        id: sanitize(approval?.id ?? `mirror-${image.name}`),
        status: "approval-gated",
        nextCommand: sanitize(
          approval?.command ??
            `oc image mirror ${image.image} ${image.desiredMirror} --keep-manifest-list=true`
        ),
        mutation: true,
        requiresExplicitApproval: true
      },
      nextCommands: unique([
        ...registryNextCommands,
        "npm run verify:external-runtime-plan",
        "npm run evidence:external-runtime:review-packet"
      ]),
      blockedBy: unique([
        ...(firstReadOnly?.blockedBy ?? []),
        ...(image.missingEvidence ?? []).filter((item) =>
          /source-digest|mirror-digest|registry|digest|approval/i.test(item)
        )
      ]).slice(0, 10),
      mutationBoundary: {
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        registryChangeRequiresExplicitApproval: true
      },
      registryAuthBoundary: {
        authRequired,
        humanCredentialInputRequired: authRequired,
        credentialStoredByVerifier: false,
        pullSecretCreatedByVerifier: false,
        registryLoginExecutedByVerifier: false,
        firstHumanSetupAction: authRequired
          ? `registry-admin-authenticate-${image.name}-source-registry`
          : "not-required"
      },
      risk:
        "External runtime digest or mirror evidence can block release approval; this ticket does not mirror, sign, push, or promote images.",
      rollbackPath:
        "Supersede the draft or final external runtime evidence with corrected digests; no cluster or registry rollback is required from this packet."
    };
  });
}

function commandLooksMutating(command) {
  const text = String(command ?? "");
  if (/\b(oc|kubectl)\s+apply\b/i.test(text) && /--dry-run=(server|client)\b/i.test(text)) {
    return false;
  }
  return /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i.test(text);
}

function markdownFor(packet) {
  const lines = [
    "# Cywell OpsLens External Runtime Review Packet",
    "",
    `Generated: ${packet.generatedAt}`,
    `Git: ${packet.ref.branch} ${packet.ref.headSha} dirty=${packet.ref.worktreeDirty}`,
    "",
    "## Current Decision",
    "",
    `- Status: ${packet.status}`,
    `- Action mode: ${packet.actionMode}`,
    `- Required approvers: ${packet.requiredApprovals.join(", ")}`,
    `- Missing evidence count: ${packet.missingEvidence.length}`,
    "",
    "## First Registry Actions",
    "",
    ...packet.firstRegistryActions.map((action) => [
      `### ${action.id}`,
      "",
      `Owner: ${action.owner}`,
      `Status: ${action.status}`,
      `Mutation: ${String(action.mutation)}`,
      `Requires explicit approval: ${String(action.requiresExplicitApproval)}`,
      "",
      `Evidence needed: ${action.evidenceNeeded}`,
      "",
      "```powershell",
      action.nextCommand,
      "```",
      ""
    ].join("\n")),
    "## Registry Ticket Packets",
    "",
    ...packet.ticketPackets.map((ticket) => [
      `### ${ticket.id}`,
      "",
      `Owner: ${ticket.owner}`,
      `Severity: ${ticket.severity}`,
      `Image: ${ticket.sourceImage}`,
      `Mirror: ${ticket.desiredMirror}`,
      `Classification: ${ticket.classification}`,
      `Registry auth required: ${String(ticket.registryAuthBoundary.authRequired)}`,
      `Human credential input required: ${String(ticket.registryAuthBoundary.humanCredentialInputRequired)}`,
      `Credential stored by verifier: ${String(ticket.registryAuthBoundary.credentialStoredByVerifier)}`,
      `Registry login executed by verifier: ${String(ticket.registryAuthBoundary.registryLoginExecutedByVerifier)}`,
      `First human setup action: ${ticket.registryAuthBoundary.firstHumanSetupAction}`,
      `First read-only action: ${ticket.firstReadOnlyAction.id}`,
      `Approval-gated action: ${ticket.approvalGatedAction.id}`,
      `Registry change requires explicit approval: ${String(ticket.mutationBoundary.registryChangeRequiresExplicitApproval)}`,
      ""
    ].join("\n")),
    "## Source Artifacts",
    "",
    ...packet.sourceArtifacts.map((source) =>
      `- ${source.label}: status=${source.status}, fresh=${source.fresh}, acceptable=${source.acceptable}`
    ),
    "",
    "## Candidate Handoff",
    "",
    ...packet.candidateHandoff.map((handoff) => [
      `### ${handoff.imageName}`,
      "",
      `- Status: ${handoff.status}`,
      `- Owner: ${handoff.owner}`,
      `- Candidate: ${handoff.candidateImage} (${handoff.candidateLabel})`,
      `- Release eligible: ${String(handoff.releaseEligible)}`,
      `- Critical/high: ${handoff.criticalFindings}/${handoff.highFindings}`,
      `- Approval required: ${String(handoff.approvalRequired)}`,
      `- Mutation allowed: ${String(handoff.mutationAllowed)}`,
      `- Evidence needed: ${handoff.evidenceNeeded}`,
      `- Blocked by: ${handoff.blockedBy.length ? handoff.blockedBy.join("; ") : "human approval boundary"}`,
      "",
      "```powershell",
      handoff.nextCommand,
      "```",
      ""
    ].join("\n")),
    "",
    "## Final Evidence Promotion Handoff",
    "",
    ...packet.finalEvidenceHandoff.map((handoff) => [
      `### ${handoff.imageName}`,
      "",
      `- Status: ${handoff.status}`,
      `- Owner: ${handoff.owner}`,
      `- Draft: ${handoff.draftFile}`,
      `- Final evidence: ${handoff.finalEvidenceFile}`,
      `- Final evidence exists: ${String(handoff.finalEvidenceExists)}`,
      `- Reviewer requests: ${handoff.reviewerRequestCount}`,
      `- Missing evidence: ${handoff.missingEvidenceCount}`,
      `- Approval required: ${String(handoff.approvalRequired)}`,
      `- Requires explicit approval: ${String(handoff.requiresExplicitApproval)}`,
      `- Mutation allowed: ${String(handoff.mutationAllowed)}`,
      `- Blocked by: ${handoff.blockedBy.length ? handoff.blockedBy.join("; ") : "reviewed final evidence is present"}`,
      "",
      "```powershell",
      handoff.promotionCommand,
      handoff.verificationCommand,
      "```",
      ""
    ].join("\n")),
    "",
    "## Per Image Review Requests",
    ""
  ];

  for (const image of packet.images) {
    lines.push(
      `### ${image.name}`,
      "",
      `- Image: ${image.image}`,
      `- Source digest: ${image.sourceDigest}`,
      `- Draft: ${image.draftStatus} (${image.evidenceState})`,
      `- Final evidence: ${image.finalEvidence.exists ? image.finalEvidence.status : "missing"} -> ${image.finalEvidenceFile}`,
      `- Source inspection: ${image.sourceDigestInspection.status ?? "missing"} ${image.sourceDigestInspection.detail ? `- ${image.sourceDigestInspection.detail}` : ""}`,
      `- Vulnerability scan: status=${image.vulnerabilityScan.status ?? "missing"}, critical=${image.vulnerabilityScan.criticalFindings ?? "unknown"}, high=${image.vulnerabilityScan.highFindings ?? "unknown"}, evidence=${image.vulnerabilityScan.evidencePath ?? "missing"}`,
      `- SBOM: status=${image.sbom.status ?? "missing"}, packages=${image.sbom.packageCount ?? "unknown"}, evidence=${image.sbom.evidencePath ?? "missing"}`,
      `- Candidate matrix: status=${image.candidateMatrix?.status ?? "missing"}, best=${image.candidateMatrix?.bestCandidate?.image ?? "missing"}, critical=${image.candidateMatrix?.bestCandidate?.criticalFindings ?? "unknown"}, high=${image.candidateMatrix?.bestCandidate?.highFindings ?? "unknown"}, zeroCritical=${image.candidateMatrix?.zeroCriticalCandidates?.length ?? 0}`,
      ""
    );
    if (image.reviewerRequests.length === 0) {
      lines.push("- No draft-level reviewer requests remain, but final evidence still requires human promotion.", "");
    } else {
      for (const request of image.reviewerRequests) {
        lines.push(
          `- ${request.role}: ${request.request} Evidence: ${request.evidenceNeeded}. Next: \`${request.nextCommand}\``
        );
      }
      lines.push("");
    }
  }

  lines.push(
    "## Read-Only Refresh Commands",
    "",
    ...packet.readOnlyCommands.flatMap((command) => [
      `### ${command.id}`,
      "",
      `Purpose: ${command.purpose}`,
      "",
      "```powershell",
      command.command,
      "```",
      ""
    ]),
    "## Approval-Gated Commands Not Run",
    ""
  );

  for (const command of packet.approvalGatedCommands) {
    lines.push(`- ${command.id}: ${command.command}`);
  }
  if (packet.approvalGatedCommands.length === 0) {
    lines.push("- No approval-gated external runtime commands were found in the current plan.");
  }

  lines.push(
    "",
    "## Mutation Boundary",
    "",
    "- Do not mirror, push, copy, sign, install, patch, delete, or scale from this packet.",
    "- This packet writes local evidence only and records approval-gated commands as not-run.",
    "- Draft files do not replace final reviewed vLLM/Postgres/pgvector evidence.",
    "",
    "## Next Evidence Refresh",
    "",
    "```powershell",
    "npm run evidence:external-runtime:draft:digests",
    "npm run evidence:external-runtime:candidates",
    "npm run evidence:external-runtime:review-packet",
    "npm run verify:evidence-checkpoint",
    "npm run verify:roadmap-plan",
    "npm run verify:release-evidence-bundle",
    "```",
    ""
  );

  return lines.join("\n");
}

function registryAdminMarkdownFor(packet) {
  const registryTickets = packet.ticketPackets.filter(
    (ticket) => ticket.owner === "registry-admin"
  );
  const registryActions = packet.firstRegistryActions.filter(
    (action) => action.owner === "registry-admin"
  );
  const approvalActions = registryActions.filter((action) => action.mutation === true);
  const readOnlyActions = registryActions.filter((action) => action.mutation !== true);
  const lines = [
    "# Cywell OpsLens External Runtime Registry Admin Packet",
    "",
    `Generated: ${packet.generatedAt}`,
    `Git: ${packet.ref.branch} ${packet.ref.headSha} dirty=${packet.ref.worktreeDirty}`,
    `Status: ${packet.status}`,
    `Action mode: ${packet.actionMode}`,
    "",
    "## Registry Summary",
    "",
    `- Owner: ${packet.registryAdminPacket.owner}`,
    `- Tickets: ${packet.registryAdminPacket.ticketIds.join(", ") || "none"}`,
    `- First read-only action: ${packet.registryAdminPacket.firstReadOnlyActionId}`,
    `- Approval-gated actions: ${packet.registryAdminPacket.approvalGatedActionIds.join(", ") || "none"}`,
    `- Credential stored by verifier: ${String(packet.registryAdminPacket.credentialStoredByVerifier)}`,
    `- Registry login executed by verifier: ${String(packet.registryAdminPacket.registryLoginExecutedByVerifier)}`,
    `- Pull secret created by verifier: ${String(packet.registryAdminPacket.pullSecretCreatedByVerifier)}`,
    "",
    "## Read-only Actions",
    "",
    ...(readOnlyActions.length
      ? readOnlyActions.map(
          (action) =>
            `- ${action.id}: ${action.status}; next=${action.nextCommand}; evidence=${action.evidenceNeeded}`
        )
      : ["- none"]),
    "",
    "## Ticket Boundaries",
    "",
    ...(registryTickets.length
      ? registryTickets.flatMap((ticket) => [
          `- ${ticket.id}: image=${ticket.imageName} classification=${ticket.classification}`,
          `  authRequired=${String(ticket.registryAuthBoundary.authRequired)} humanCredentialInputRequired=${String(ticket.registryAuthBoundary.humanCredentialInputRequired)}`,
          `  firstHumanSetupAction=${ticket.registryAuthBoundary.firstHumanSetupAction}`,
          `  firstReadOnly=${ticket.firstReadOnlyAction.id} approvalGated=${ticket.approvalGatedAction.id}`,
          `  blockedBy=${ticket.blockedBy.join(" | ") || "none"}`
        ])
      : ["- none"]),
    "",
    "## Approval-gated Registry Actions",
    "",
    ...(approvalActions.length
      ? approvalActions.map(
          (action) =>
            `- ${action.id}: mutation=${String(action.mutation)} requiresExplicitApproval=${String(action.requiresExplicitApproval)} next=${action.nextCommand}`
        )
      : ["- none"]),
    "",
    "## Boundary",
    "",
    "- This packet is registry-admin evidence guidance only.",
    "- It does not login to registries, create pull secrets, mirror images, sign images, push images, promote drafts, patch OLSConfig, install Operators, apply, delete, or scale.",
    "- Approval-gated registry commands require explicit human approval outside this verifier.",
    "",
    "## Rollback Path",
    "",
    ...packet.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const artifacts = {
    externalRuntime: loadJson(options.externalRuntimeEvidence, "external runtime plan"),
    releasePlan: loadJson(options.releasePlanEvidence, "release publish plan", { required: false }),
    securityScan: loadJson(options.securityScanEvidence, "security scan plan", { required: false }),
    securityScanRunner: loadJson(options.securityScanRunnerEvidence, "security scan evidence runner", { required: false }),
    ownedImageProvenance: loadJson(options.ownedImageProvenanceEvidence, "owned image provenance", { required: false }),
    candidateMatrix: loadJson(options.externalRuntimeCandidateMatrix, "external runtime candidate matrix", { required: false })
  };

  const sourceArtifacts = [
    sourceSummary("externalRuntime", "external runtime plan", options.externalRuntimeEvidence, artifacts.externalRuntime, headSha, ["APPROVAL_REQUIRED", "NEEDS_EVIDENCE"], true),
    sourceSummary("releasePlan", "release publish plan", options.releasePlanEvidence, artifacts.releasePlan, headSha, ["PUBLISH_APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("securityScan", "security scan plan", options.securityScanEvidence, artifacts.securityScan, headSha, ["READY_FOR_SCAN", "NEEDS_TOOLING"]),
    sourceSummary("securityScanRunner", "security scan evidence runner", options.securityScanRunnerEvidence, artifacts.securityScanRunner, headSha, ["PLAN_READY", "EVIDENCE_WRITTEN"]),
    sourceSummary("ownedImageProvenance", "owned image provenance", options.ownedImageProvenanceEvidence, artifacts.ownedImageProvenance, headSha, ["PASS"]),
    sourceSummary("externalRuntimeCandidateMatrix", "external runtime candidate matrix", options.externalRuntimeCandidateMatrix, artifacts.candidateMatrix, headSha, ["CANDIDATE_REVIEW_READY", "NEEDS_ZERO_CRITICAL", "NEEDS_CANDIDATES"])
  ];

  const images = imagePackets(artifacts.externalRuntime, artifacts.candidateMatrix);
  const candidateHandoff = candidateHandoffItems(images);
  const finalEvidenceHandoff = finalEvidenceHandoffItems(images);
  const readOnly = readOnlyCommands(images, artifacts.candidateMatrix);
  const approvalGated = approvalGatedCommands(artifacts.externalRuntime);
  const firstRegistryActions = buildFirstRegistryActions(images, approvalGated);
  const ticketPackets = buildRegistryTicketPackets(
    images,
    firstRegistryActions,
    approvalGated
  );
  const registryAdminTickets = ticketPackets.filter(
    (ticket) => ticket.owner === "registry-admin"
  );
  const registryAdminActions = firstRegistryActions.filter(
    (action) => action.owner === "registry-admin"
  );
  const registryAdminPacket = {
    owner: "registry-admin",
    markdownPath: resolve(options.registryAdminMarkdownOut),
    exists: true,
    ticketIds: registryAdminTickets.map((ticket) => ticket.id),
    firstReadOnlyActionId:
      registryAdminActions.find((action) => action.mutation !== true)?.id ??
      "external-runtime-registry-evidence",
    approvalGatedActionIds: registryAdminActions
      .filter((action) => action.mutation === true)
      .map((action) => action.id),
    credentialStoredByVerifier: registryAdminTickets.some(
      (ticket) => ticket.registryAuthBoundary.credentialStoredByVerifier === true
    ),
    registryLoginExecutedByVerifier: registryAdminTickets.some(
      (ticket) => ticket.registryAuthBoundary.registryLoginExecutedByVerifier === true
    ),
    pullSecretCreatedByVerifier: registryAdminTickets.some(
      (ticket) => ticket.registryAuthBoundary.pullSecretCreatedByVerifier === true
    )
  };
  const unsafeReadOnly = readOnly
    .filter((command) => command.mutation === true || commandLooksMutating(command.command))
    .map((command) => command.id);
  if (unsafeReadOnly.length > 0) {
    fail("external runtime review command boundary", `read-only commands include mutation: ${unsafeReadOnly.join(", ")}`);
  } else {
    pass("external runtime review command boundary", `${readOnly.length} read-only/local evidence command(s), ${approvalGated.length} approval-gated command(s) not run`);
  }
  if (
    firstRegistryActions.some(
      (action) =>
        action.mutation !== true &&
        /evidence:external-runtime/.test(action.nextCommand)
    )
  ) {
    pass("external runtime first registry read-only action", "registry-admin has read-only digest/draft evidence action");
  } else {
    fail("external runtime first registry read-only action", "registry-admin first actions must include a read-only external-runtime evidence command");
  }
  if (firstRegistryActions.every((action) => action.mutation !== true || action.requiresExplicitApproval === true)) {
    pass("external runtime first registry mutation boundary", "mutating registry actions require explicit approval");
  } else {
    fail("external runtime first registry mutation boundary", "mutating registry actions must require explicit approval");
  }
  if (
    ticketPackets.every(
      (ticket) =>
        ticket.firstReadOnlyAction.mutation === false &&
        ticket.firstReadOnlyAction.requiresExplicitApproval === false &&
        ticket.approvalGatedAction.mutation === true &&
        ticket.approvalGatedAction.requiresExplicitApproval === true &&
        ticket.mutationBoundary.registryChangeRequiresExplicitApproval === true
    )
  ) {
    pass("external runtime registry ticket boundary", `${ticketPackets.length} registry ticket packet(s) are read-only first and approval-gated for registry mutation`);
  } else {
    fail("external runtime registry ticket boundary", "registry ticket packets must keep read-only first action and approval-gated mutation boundary");
  }
  if (
    ticketPackets.every(
      (ticket) =>
        ticket.registryAuthBoundary.credentialStoredByVerifier === false &&
        ticket.registryAuthBoundary.pullSecretCreatedByVerifier === false &&
        ticket.registryAuthBoundary.registryLoginExecutedByVerifier === false &&
        (ticket.registryAuthBoundary.authRequired === false ||
          ticket.registryAuthBoundary.humanCredentialInputRequired === true)
    )
  ) {
    pass("external runtime registry auth boundary", "registry auth gaps require human credential input and verifier stores no credentials");
  } else {
    fail("external runtime registry auth boundary", "registry auth gaps must not store credentials, create pull secrets, or run registry login");
  }
  const readyCandidateHandoffs = candidateHandoff.filter(
    (handoff) => handoff.status === "ready-for-human-review"
  );
  if (
    readyCandidateHandoffs.length > 0 &&
    readyCandidateHandoffs.every(
      (handoff) => handoff.approvalRequired === true && handoff.mutationAllowed === false
    )
  ) {
    pass("external runtime candidate handoff boundary", `${readyCandidateHandoffs.length} ready candidate handoff(s) remain approval-gated and non-mutating`);
  }
  if (
    finalEvidenceHandoff.length === images.length &&
    finalEvidenceHandoff.every(
      (handoff) =>
        handoff.requiresExplicitApproval === true &&
        handoff.mutationAllowed === false &&
        handoff.writesLocalEvidence === true &&
        /promote-reviewed/.test(handoff.promotionCommand) &&
        /verify:external-runtime-plan/.test(handoff.verificationCommand)
    )
  ) {
    pass("external runtime final evidence handoff boundary", `${finalEvidenceHandoff.length} final evidence handoff(s) require reviewed inputs before local promotion`);
  } else {
    fail("external runtime final evidence handoff boundary", "final evidence handoffs must be local-evidence-only, review-gated, and non-mutating");
  }

  const mutationViolations = [
    ["externalRuntime.registryMutationAttempted", artifacts.externalRuntime?.registryMutationAttempted],
    ["externalRuntime.clusterMutationAttempted", artifacts.externalRuntime?.clusterMutationAttempted],
    ["externalRuntime.mutationAllowedByThisVerifier", artifacts.externalRuntime?.mutationAllowedByThisVerifier],
    ["releasePlan.registryMutationAttempted", artifacts.releasePlan?.registryMutationAttempted],
    ["releasePlan.clusterMutationAttempted", artifacts.releasePlan?.clusterMutationAttempted],
    ["securityScan.registryMutationAttempted", artifacts.securityScan?.registryMutationAttempted],
    ["securityScan.clusterMutationAttempted", artifacts.securityScan?.clusterMutationAttempted],
    ["securityScanRunner.registryMutationAttempted", artifacts.securityScanRunner?.registryMutationAttempted],
    ["securityScanRunner.clusterMutationAttempted", artifacts.securityScanRunner?.clusterMutationAttempted],
    ["ownedImageProvenance.registryMutationAttempted", artifacts.ownedImageProvenance?.registryMutationAttempted],
    ["ownedImageProvenance.clusterMutationAttempted", artifacts.ownedImageProvenance?.clusterMutationAttempted],
    ["candidateMatrix.registryMutationAttempted", artifacts.candidateMatrix?.registryMutationAttempted],
    ["candidateMatrix.clusterMutationAttempted", artifacts.candidateMatrix?.clusterMutationAttempted],
    ["candidateMatrix.mutationAllowedByThisVerifier", artifacts.candidateMatrix?.mutationAllowedByThisVerifier]
  ].filter(([, value]) => value === true);
  if (mutationViolations.length > 0) {
    fail("external runtime review mutation boundary", mutationViolations.map(([name]) => name).join(", "));
  } else {
    pass("external runtime review mutation boundary", "all source mutation flags remain false");
  }

  const missingEvidence = unique([
    ...sourceArtifacts
      .filter((source) => source.required && !source.fresh)
      .map((source) => `${source.label} is not fresh for current head`),
    ...images.flatMap((image) =>
      image.missingEvidence.map((item) => `${image.name}: ${item}`)
    ),
    ...images.flatMap((image) =>
      (image.candidateMatrix?.missingEvidence ?? []).map((item) => `${image.name}: ${item}`)
    ),
    ...images
      .filter((image) => !image.finalEvidence.exists)
      .map((image) => `${image.name}: final reviewed evidence file is missing at ${image.finalEvidenceFile}`)
  ]);

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : "REVIEW_PACKET_READY";

  const packet = {
    schema: "cywell.opslens.external-runtime-review-packet.v0.1",
    artifactType: "opslens.external-runtime-review-packet.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "reviewPacketOnly",
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
    requiredApprovals: artifacts.externalRuntime?.requiredApprovals ?? [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    sourceArtifacts,
    images,
    candidateHandoff,
    finalEvidenceHandoff,
    readOnlyCommands: readOnly,
    approvalGatedCommands: approvalGated,
    firstRegistryActions,
    ticketPackets,
    registryAdminPacket,
    missingEvidence,
    evidence: [
      "This packet consolidates external runtime draft intake, source digest inspection state, scan/SBOM plan state, candidate comparison evidence, and approval-gated mirror/sign commands.",
      "It is a reviewer packet only; it does not promote drafts, mirror images, sign images, push images, install Operators, patch OLSConfig, or mutate the cluster.",
      "Final evidence promotion handoff is review-gated local evidence only; it records promote-reviewed commands but does not run them.",
      "Final release readiness still requires reviewed docs/release/evidence/external-runtime/vllm.json and pgvector.json files."
    ],
    risk: unique([
      ...(artifacts.externalRuntime?.risk ?? []),
      ...(artifacts.releasePlan?.risk ?? []),
      "A review packet can be attached to an internal ticket, but it does not approve external runtime images by itself.",
      "Candidate scans reduce reviewer search cost but do not prove runtime compatibility, supportability, or final security approval.",
      "vLLM source digest is still blocked if the registry manifest remains private or unauthenticated."
    ]),
    rollbackPath: unique([
      ...(artifacts.externalRuntime?.rollbackPath ?? []),
      ...(artifacts.releasePlan?.rollbackPath ?? []),
      "No rollback is required for this packet because it writes only local evidence.",
      "If reviewer evidence is rejected, supersede the draft and keep release status as NEEDS_EVIDENCE."
    ]),
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  const markdown = markdownFor(packet);
  const registryAdminMarkdown = registryAdminMarkdownFor(packet);
  if (secretLike(serialized) || secretLike(markdown) || secretLike(registryAdminMarkdown)) {
    throw new Error("external runtime review packet would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await mkdir(dirname(resolve(options.registryAdminMarkdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  await writeFile(resolve(options.registryAdminMarkdownOut), registryAdminMarkdown, "utf8");
  pass(
    "external runtime review packet export",
    `${resolve(options.evidenceOut)}, ${resolve(options.markdownOut)}, and ${resolve(options.registryAdminMarkdownOut)} written without secret material`
  );

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens external runtime review packet: status=${status}, images=${images.length}, missingEvidence=${missingEvidence.length}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("external runtime review packet runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] external runtime review packet runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
