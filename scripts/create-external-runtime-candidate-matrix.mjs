#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-external-runtime-candidate-matrix.json",
  markdownOut: "test-results/cywell-opslens-external-runtime-candidate-matrix.md",
  securityEvidenceDir: "docs/release/evidence/security",
  candidateRoot: "test-results/security-candidates",
  names: ["vllm", "qdrant"],
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
    } else {
      values.set(key, "true");
    }
  }
  return values;
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  securityEvidenceDir: parsed.get("security-evidence-dir") ?? defaults.securityEvidenceDir,
  candidateRoot: parsed.get("candidate-root") ?? defaults.candidateRoot,
  names: (parsed.get("names") ?? defaults.names.join(","))
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
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
    return {
      exists: false,
      valid: false,
      path: absolutePath,
      missingEvidence: [`${label} is missing at ${absolutePath}`]
    };
  }
  try {
    return {
      exists: true,
      valid: true,
      path: absolutePath,
      artifact: JSON.parse(readFileSync(absolutePath, "utf8")),
      missingEvidence: []
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      path: absolutePath,
      missingEvidence: [`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function severityCountsFromTrivy(report) {
  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    UNKNOWN: 0
  };
  for (const result of report?.Results ?? []) {
    for (const finding of result?.Vulnerabilities ?? []) {
      const severity = String(finding?.Severity ?? "UNKNOWN").toUpperCase();
      counts[Object.hasOwn(counts, severity) ? severity : "UNKNOWN"] += 1;
    }
  }
  return counts;
}

function criticalFindingsFromTrivy(report) {
  const findings = [];
  for (const result of report?.Results ?? []) {
    for (const finding of result?.Vulnerabilities ?? []) {
      if (String(finding?.Severity ?? "").toUpperCase() !== "CRITICAL") continue;
      findings.push({
        target: result?.Target ?? "unknown",
        vulnerabilityId: finding?.VulnerabilityID ?? "unknown",
        packageName: finding?.PkgName ?? "unknown",
        installedVersion: finding?.InstalledVersion ?? "unknown",
        fixedVersion: finding?.FixedVersion ?? "",
        title: finding?.Title ?? ""
      });
    }
  }
  return findings;
}

function sbomSummary(path, name) {
  const loaded = loadJson(path, `${name} SBOM`);
  const artifact = loaded.artifact;
  const packageCount = Array.isArray(artifact?.packages)
    ? artifact.packages.length
    : Array.isArray(artifact?.artifacts)
      ? artifact.artifacts.length
      : 0;
  return {
    path: loaded.path,
    exists: loaded.exists,
    valid: loaded.valid && packageCount > 0,
    format: artifact?.spdxVersion ? "spdx-json" : Array.isArray(artifact?.artifacts) ? "syft-json" : "unknown",
    spdxVersion: artifact?.spdxVersion,
    packageCount,
    missingEvidence: [
      ...loaded.missingEvidence,
      ...(loaded.exists && packageCount <= 0 ? [`${name} SBOM has no packages/artifacts`] : [])
    ]
  };
}

function vulnerabilitySummary(path, name) {
  const loaded = loadJson(path, `${name} vulnerability report`);
  if (!loaded.valid) {
    return {
      path: loaded.path,
      exists: loaded.exists,
      valid: false,
      artifactName: "missing",
      severityCounts: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        UNKNOWN: 0
      },
      criticalFindings: [],
      missingEvidence: loaded.missingEvidence
    };
  }
  const severityCounts = severityCountsFromTrivy(loaded.artifact);
  return {
    path: loaded.path,
    exists: true,
    valid: true,
    artifactName: loaded.artifact?.ArtifactName ?? "unknown",
    artifactType: loaded.artifact?.ArtifactType ?? "unknown",
    schemaVersion: loaded.artifact?.SchemaVersion ?? "unknown",
    severityCounts,
    criticalFindings: criticalFindingsFromTrivy(loaded.artifact),
    missingEvidence: []
  };
}

function candidateDirs(name) {
  const root = resolve(options.candidateRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((entry) => resolve(root, entry))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .filter((path) => path.split(/[\\/]/).at(-1)?.startsWith(`${name}-`));
}

function compareCounts(currentCounts, candidateCounts) {
  return {
    critical: candidateCounts.CRITICAL - currentCounts.CRITICAL,
    high: candidateCounts.HIGH - currentCounts.HIGH,
    medium: candidateCounts.MEDIUM - currentCounts.MEDIUM,
    low: candidateCounts.LOW - currentCounts.LOW,
    unknown: candidateCounts.UNKNOWN - currentCounts.UNKNOWN
  };
}

function candidateSummary(name, dir, currentCounts) {
  const label = dir.split(/[\\/]/).at(-1)?.replace(`${name}-`, "") ?? "unknown";
  const vulnerability = vulnerabilitySummary(resolve(dir, `${name}-vulnerability.json`), `${name} candidate ${label}`);
  const sbom = sbomSummary(resolve(dir, `${name}-sbom.spdx.json`), `${name} candidate ${label}`);
  const reviewDraft = loadJson(resolve(dir, `${name}-security-review.draft.json`), `${name} candidate ${label} review draft`);
  const severityCounts = vulnerability.severityCounts;
  return {
    label,
    directory: dir,
    image: reviewDraft.artifact?.image ?? vulnerability.artifactName ?? "unknown",
    status: vulnerability.valid && sbom.valid
      ? severityCounts.CRITICAL === 0
        ? "zero-critical-candidate"
        : "needs-remediation"
      : "needs-evidence",
    releaseEligible: vulnerability.valid && sbom.valid && severityCounts.CRITICAL === 0,
    vulnerability,
    sbom,
    reviewDraft: {
      path: reviewDraft.path,
      exists: reviewDraft.exists,
      valid: reviewDraft.valid,
      evidenceState: reviewDraft.artifact?.evidenceState ?? "missing",
      decision: reviewDraft.artifact?.decision ?? "missing",
      missingEvidence: reviewDraft.artifact?.missingEvidence ?? reviewDraft.missingEvidence
    },
    deltaFromCurrent: compareCounts(currentCounts, severityCounts),
    missingEvidence: [
      ...vulnerability.missingEvidence,
      ...sbom.missingEvidence,
      ...reviewDraft.missingEvidence
    ]
  };
}

function betterCandidate(left, right) {
  if (!left) return right;
  if (!right) return left;
  const a = left.vulnerability.severityCounts;
  const b = right.vulnerability.severityCounts;
  for (const key of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? left : right;
  }
  return left.label.localeCompare(right.label) <= 0 ? left : right;
}

function imageMatrix(name) {
  const currentVulnerability = vulnerabilitySummary(
    resolve(options.securityEvidenceDir, `${name}-vulnerability.json`),
    `${name} current vulnerability report`
  );
  const currentSbom = sbomSummary(
    resolve(options.securityEvidenceDir, `${name}-sbom.spdx.json`),
    `${name} current SBOM`
  );
  const currentCounts = currentVulnerability.severityCounts;
  const candidates = candidateDirs(name)
    .map((dir) => candidateSummary(name, dir, currentCounts))
    .sort((left, right) => {
      const leftCounts = left.vulnerability.severityCounts;
      const rightCounts = right.vulnerability.severityCounts;
      for (const key of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]) {
        if (leftCounts[key] !== rightCounts[key]) return leftCounts[key] - rightCounts[key];
      }
      return left.label.localeCompare(right.label);
    });
  const bestCandidate = candidates.reduce((best, candidate) => betterCandidate(best, candidate), undefined);
  const zeroCriticalCandidates = candidates.filter((candidate) => candidate.releaseEligible);
  const currentReleaseEligible = currentVulnerability.valid && currentSbom.valid && currentCounts.CRITICAL === 0;
  const improvingCandidates = candidates.filter(
    (candidate) => candidate.vulnerability.severityCounts.CRITICAL < currentCounts.CRITICAL
  );
  const status = currentReleaseEligible
    ? "current-evidence-release-eligible"
    : zeroCriticalCandidates.length > 0
    ? "candidate-ready-for-review"
    : candidates.length === 0
      ? "needs-candidate"
      : improvingCandidates.length > 0
        ? "candidate-reduces-risk-but-remediation-required"
        : "no-improving-candidate";

  return {
    name,
    status,
    current: {
      vulnerability: currentVulnerability,
      sbom: currentSbom,
      releaseEligible: currentReleaseEligible
    },
    candidates,
    bestCandidate,
    zeroCriticalCandidates,
    missingEvidence: [
      ...currentVulnerability.missingEvidence,
      ...currentSbom.missingEvidence,
      ...(!currentReleaseEligible && candidates.length === 0 ? [`${name} has no candidate scan evidence under ${resolve(options.candidateRoot)}`] : []),
      ...(!currentReleaseEligible && zeroCriticalCandidates.length === 0 ? [`${name} has no zero-critical candidate scan evidence`] : [])
    ],
    recommendation: currentReleaseEligible
      ? `Current ${name} security evidence is zero-critical; candidate promotion is optional and still approval-gated.`
      : zeroCriticalCandidates.length > 0
      ? `Promote ${zeroCriticalCandidates[0].image} only after product/security approval and final external runtime evidence.`
      : bestCandidate
        ? `Best scanned candidate ${bestCandidate.image} reduces current critical/high counts to ${bestCandidate.vulnerability.severityCounts.CRITICAL}/${bestCandidate.vulnerability.severityCounts.HIGH}, but still requires remediation or security exception before promotion.`
        : `Scan at least one ${name} candidate image into ${resolve(options.candidateRoot)} before promotion review.`
  };
}

function matrixStatus(images) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (images.length > 0 && images.every((image) => image.current.releaseEligible || image.status === "candidate-ready-for-review")) {
    return "CANDIDATE_REVIEW_READY";
  }
  if (images.some((image) => image.candidates.length > 0)) return "NEEDS_ZERO_CRITICAL";
  return "NEEDS_CANDIDATES";
}

function readOnlyCommands(images) {
  return images.flatMap((image) => [
    {
      id: `scan-${image.name}-candidate`,
      phase: "candidate-scan",
      command: `npm run evidence:external-runtime:candidate-scan -- --name ${image.name} --candidate-image <candidate-image> --candidate-label <candidate-label> --execute-docker-fallback`,
      mutation: false,
      writesLocalEvidence: true,
      purpose: `Generate candidate vulnerability/SBOM evidence for ${image.name} without changing release manifests.`
    },
    {
      id: `refresh-${image.name}-candidate-matrix`,
      phase: "candidate-review",
      command: "npm run evidence:external-runtime:candidates",
      mutation: false,
      writesLocalEvidence: true,
      purpose: `Refresh ${image.name} candidate comparison evidence.`
    }
  ]);
}

function markdownFor(report) {
  const lines = [
    "# Cywell OpsLens External Runtime Candidate Matrix",
    "",
    `Generated: ${report.generatedAt}`,
    `Git: ${report.ref.branch} ${report.ref.headSha} dirty=${report.ref.worktreeDirty}`,
    `Status: ${report.status}`,
    "",
    "## Image Candidates",
    ""
  ];

  for (const image of report.images) {
    lines.push(
      `### ${image.name}`,
      "",
      `- Current: critical=${image.current.vulnerability.severityCounts.CRITICAL}, high=${image.current.vulnerability.severityCounts.HIGH}, evidence=${image.current.vulnerability.path}`,
      `- Status: ${image.status}`,
      `- Recommendation: ${image.recommendation}`,
      ""
    );
    if (image.candidates.length === 0) {
      lines.push("- No candidate scans found.", "");
      continue;
    }
    lines.push("| Candidate | Critical | High | Medium | Low | Delta Critical | Decision |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const candidate of image.candidates) {
      const counts = candidate.vulnerability.severityCounts;
      lines.push(
        `| ${candidate.image} | ${counts.CRITICAL} | ${counts.HIGH} | ${counts.MEDIUM} | ${counts.LOW} | ${candidate.deltaFromCurrent.critical} | ${candidate.reviewDraft.decision} |`
      );
    }
    lines.push("");
    if (image.bestCandidate?.vulnerability?.criticalFindings?.length > 0) {
      lines.push("Remaining Critical findings on best candidate:");
      for (const finding of image.bestCandidate.vulnerability.criticalFindings.slice(0, 10)) {
        lines.push(`- ${finding.vulnerabilityId} ${finding.packageName} ${finding.installedVersion} fixed=${finding.fixedVersion || "none"} ${finding.title}`);
      }
      lines.push("");
    }
  }

  lines.push(
    "## Boundary",
    "",
    "- This matrix reads local scanner evidence only.",
    "- It does not change CSV/FBC/runtime manifests, mirror images, sign images, push images, or mutate a cluster.",
    "- A candidate becomes release evidence only through final external runtime promotion and human approval.",
    ""
  );
  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "origin/main");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const images = options.names.map(imageMatrix);
  for (const image of images) {
    if (image.candidates.length === 0) {
      warn(`${image.name} candidates`, `no candidate scan evidence under ${resolve(options.candidateRoot)}`);
    } else {
      pass(
        `${image.name} candidates`,
        `${image.candidates.length} candidate(s); best=${image.bestCandidate?.image ?? "missing"} critical=${image.bestCandidate?.vulnerability?.severityCounts?.CRITICAL ?? "unknown"}`
      );
    }
  }

  const status = matrixStatus(images);
  const report = {
    schema: "cywell.opslens.external-runtime-candidate-matrix.v0.1",
    artifactType: "opslens.external-runtime-candidate-matrix.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "candidateMatrixOnly",
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
    candidateRoot: resolve(options.candidateRoot),
    securityEvidenceDir: resolve(options.securityEvidenceDir),
    images,
    readOnlyCommands: readOnlyCommands(images),
    missingEvidence: images.flatMap((image) =>
      image.missingEvidence.map((item) => `${image.name}: ${item}`)
    ),
    risk: [
      "Candidate scans are not release approval and can still reference unsupported images, mutable tags, or unreviewed SBOMs.",
      "A lower vulnerability count does not prove compatibility with the OpsLens vector-store runtime contract.",
      "Zero Critical findings still require product-owner, security-reviewer, registry-admin, and release-manager approval before manifest changes."
    ],
    rollbackPath: [
      "Delete or supersede candidate scan artifacts if the candidate image is rejected.",
      "Keep current CSV/FBC/runtime image references unchanged until final external runtime evidence passes.",
      "Regenerate external runtime, security scan, checkpoint, release bundle, and action queue evidence after any approved image change."
    ],
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = markdownFor(report);
  if (secretLike(serialized) || secretLike(markdown)) {
    throw new Error("external runtime candidate matrix would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass("external runtime candidate matrix export", `${resolve(options.evidenceOut)} and ${resolve(options.markdownOut)} written without secret material`);

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens external runtime candidate matrix: status=${status}, images=${images.length}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("external runtime candidate matrix runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] external runtime candidate matrix runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
