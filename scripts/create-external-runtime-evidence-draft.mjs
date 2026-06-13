#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  externalEvidenceDir: "docs/release/evidence/external-runtime",
  securityEvidenceDir: "docs/release/evidence/security",
  timeoutMs: 10000
};

const imageDefaults = {
  vllm: {
    example: "vllm.example.json",
    final: "vllm.json",
    draft: "vllm.draft.json"
  },
  qdrant: {
    example: "qdrant.example.json",
    final: "qdrant.json",
    draft: "qdrant.draft.json"
  }
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
const allRequested = parsed.get("all") === "true";

function usage() {
  return [
    "Usage:",
    "  npm run evidence:external-runtime:draft -- --all --force",
    "  npm run evidence:external-runtime:draft -- --all --collect-source-digests --force",
    "  npm run evidence:external-runtime:draft -- --name vllm --source-digest quay.io/cywell/opslens-vllm@sha256:<digest> --mirrored-image <internal>/cywell/opslens-vllm:0.1.0 --mirrored-digest <internal>/cywell/opslens-vllm@sha256:<digest> --ticket CHG-123 --force",
    "",
    "For --all, image-specific overrides may be passed as --vllm-source-digest, --qdrant-source-digest, and so on.",
    "Supported names: vllm, qdrant",
    "This script writes only *.draft.json files. It never creates final vllm.json/qdrant.json evidence.",
    "--collect-source-digests performs read-only docker manifest inspection and never pulls, pushes, mirrors, or signs images.",
    "--security-evidence-dir may point at generated vulnerability/SBOM evidence for draft intake."
  ].join("\n");
}

if ((!allRequested && (!imageName || !Object.hasOwn(imageDefaults, imageName))) ||
  (allRequested && imageName && !Object.hasOwn(imageDefaults, imageName))) {
  console.error(usage());
  process.exit(1);
}

const options = {
  names: allRequested ? Object.keys(imageDefaults) : [imageName],
  externalEvidenceDir:
    parsed.get("external-evidence-dir") ?? defaults.externalEvidenceDir,
  securityEvidenceDir:
    parsed.get("security-evidence-dir") ?? defaults.securityEvidenceDir,
  evidenceOut: parsed.get("evidence-out"),
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs),
  force: parsed.get("force") === "true",
  collectSourceDigests: parsed.get("collect-source-digests") === "true"
};

if (allRequested && options.evidenceOut) {
  console.error("--evidence-out can only be used with --name; --all writes each default *.draft.json file");
  process.exit(1);
}

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

function cliValue(key, name) {
  const value = parsed.get(`${name}-${key}`) ?? parsed.get(key);
  if (value && secretLike(value)) {
    throw new Error(`${key} appears to contain secret material; store the redacted evidence URL or ticket id instead`);
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

function loadExample(name) {
  const examplePath = resolve(
    options.externalEvidenceDir,
    imageDefaults[name].example
  );
  if (!existsSync(examplePath)) {
    throw new Error(`${examplePath} is missing`);
  }
  return JSON.parse(readFileSync(examplePath, "utf8"));
}

function statusApproved(value) {
  return ["approved", "pass", "passed", "certified", "ready"].includes(
    String(value ?? "").toLowerCase()
  );
}

function hasDigest(value) {
  return typeof value === "string" &&
    value.includes("@sha256:") &&
    !value.includes("<");
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

function numberOrPlaceholder(value, placeholder) {
  if (value === undefined) return placeholder;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

function workspaceRelativePath(absolutePath) {
  const rel = relative(resolve("."), absolutePath);
  if (!rel || rel.startsWith("..")) return absolutePath;
  return rel.replace(/\\/g, "/");
}

function commaList(value, fallback) {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function digestReference(image, digest) {
  if (!digest || !/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    return undefined;
  }
  if (image.includes("@sha256:")) return image;
  const slashIndex = image.lastIndexOf("/");
  const colonIndex = image.lastIndexOf(":");
  const withoutTag = colonIndex > slashIndex ? image.slice(0, colonIndex) : image;
  return `${withoutTag}@${digest}`;
}

function parseImagetoolsDigest(output) {
  const match = /^Digest:\s+(sha256:[a-f0-9]{64})\s*$/im.exec(output);
  return match?.[1];
}

function parseManifestIndexDigest(output) {
  try {
    const manifest = JSON.parse(output);
    const manifests = Array.isArray(manifest?.manifests) ? manifest.manifests : [];
    const linuxAmd64 = manifests.find(
      (item) =>
        item?.platform?.os === "linux" &&
        item?.platform?.architecture === "amd64" &&
        typeof item?.digest === "string"
    );
    return linuxAmd64?.digest;
  } catch {
    return undefined;
  }
}

function loadJsonEvidence(path) {
  const absolutePath = resolve(path);
  const evidencePath = workspaceRelativePath(absolutePath);
  if (!existsSync(absolutePath)) {
    return {
      state: "missing",
      evidencePath,
      detail: `${evidencePath} is missing`
    };
  }

  const text = readFileSync(absolutePath, "utf8");
  if (text.trim().length === 0) {
    return {
      state: "invalid",
      evidencePath,
      detail: `${evidencePath} is empty`
    };
  }

  try {
    return {
      state: "loaded",
      evidencePath,
      artifact: JSON.parse(text)
    };
  } catch (error) {
    return {
      state: "invalid",
      evidencePath,
      detail: `${evidencePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
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

function inspectVulnerabilityEvidence(name) {
  const loaded = loadJsonEvidence(
    resolve(options.securityEvidenceDir, `${name}-vulnerability.json`)
  );
  if (loaded.state !== "loaded") return loaded;

  const counts = severityCountsFromTrivy(loaded.artifact);
  const criticalFindings = counts.CRITICAL;
  const highFindings = counts.HIGH;
  return {
    state: "loaded",
    evidencePath: loaded.evidencePath,
    detail:
      criticalFindings === 0
        ? `Trivy evidence loaded with criticalFindings=0 highFindings=${highFindings}`
        : `Trivy evidence loaded with criticalFindings=${criticalFindings} highFindings=${highFindings}; remediation is required before promotion`,
    draftValue: {
      status: criticalFindings === 0 ? "generated" : "needs-remediation",
      scanner: "trivy",
      criticalFindings,
      highFindings,
      evidencePath: loaded.evidencePath,
      severityCounts: counts,
      artifactName: loaded.artifact?.ArtifactName ?? "<missing:artifact-name>",
      artifactType: loaded.artifact?.ArtifactType ?? "<missing:artifact-type>",
      schemaVersion: loaded.artifact?.SchemaVersion ?? "<missing:schema-version>"
    }
  };
}

function inspectSbomEvidence(name) {
  const loaded = loadJsonEvidence(
    resolve(options.securityEvidenceDir, `${name}-sbom.spdx.json`)
  );
  if (loaded.state !== "loaded") return loaded;

  const packageCount = Array.isArray(loaded.artifact?.packages)
    ? loaded.artifact.packages.length
    : 0;
  const fileCount = Array.isArray(loaded.artifact?.files)
    ? loaded.artifact.files.length
    : 0;
  const relationshipCount = Array.isArray(loaded.artifact?.relationships)
    ? loaded.artifact.relationships.length
    : 0;

  return {
    state: "loaded",
    evidencePath: loaded.evidencePath,
    detail: `SPDX SBOM evidence loaded with packages=${packageCount} files=${fileCount}`,
    draftValue: {
      status: "generated",
      format: "spdx-json",
      evidencePath: loaded.evidencePath,
      spdxVersion: loaded.artifact?.spdxVersion ?? "<missing:spdx-version>",
      documentName: loaded.artifact?.name ?? "<missing:document-name>",
      packageCount,
      fileCount,
      relationshipCount
    }
  };
}

function inspectSecurityEvidence(name) {
  return {
    vulnerabilityScan: inspectVulnerabilityEvidence(name),
    sbom: inspectSbomEvidence(name)
  };
}

async function collectSourceDigest(name, example) {
  const sourceImage = example.sourceImage ?? example.image;
  if (!options.collectSourceDigests) {
    return {
      status: "skipped",
      sourceImage,
      detail: "source digest collection was not requested"
    };
  }

  const buildx = await runCapture("docker", ["buildx", "imagetools", "inspect", sourceImage]);
  if (buildx.ok) {
    const digest = parseImagetoolsDigest(buildx.stdout);
    const sourceDigest = digestReference(sourceImage, digest);
    if (sourceDigest) {
      return {
        status: "pass",
        sourceImage,
        sourceDigest,
        method: "docker buildx imagetools inspect",
        detail: `collected ${sourceDigest}`
      };
    }
  }

  const manifest = await runCapture("docker", ["manifest", "inspect", sourceImage]);
  if (manifest.ok) {
    const digest = parseManifestIndexDigest(manifest.stdout);
    const sourceDigest = digestReference(sourceImage, digest);
    if (sourceDigest) {
      return {
        status: "pass",
        sourceImage,
        sourceDigest,
        method: "docker manifest inspect linux/amd64",
        detail: `collected ${sourceDigest}`
      };
    }
  }

  return {
    status: "needs-evidence",
    sourceImage,
    method: "docker buildx imagetools inspect; docker manifest inspect",
    detail:
      buildx.stderr ||
      buildx.stdout ||
      manifest.stderr ||
      manifest.stdout ||
      `${name} source digest could not be collected`
  };
}

function evidenceRequirements(draft) {
  return [
    {
      id: `${draft.name}-source-digest`,
      pass: hasDigest(draft.sourceDigest),
      evidence: "sourceDigest must pin the external source image by immutable sha256 digest"
    },
    {
      id: `${draft.name}-mirror-digest`,
      pass: typeof draft.mirroredImage === "string" && hasDigest(draft.mirroredDigest),
      evidence: "mirroredImage and mirroredDigest must identify the approved internal registry copy"
    },
    {
      id: `${draft.name}-certification`,
      pass:
        statusApproved(draft.certification?.status) &&
        !missingValue(draft.certification?.evidenceUrl),
      evidence: "container certification status and evidence URL/ticket must be approved"
    },
    {
      id: `${draft.name}-vulnerability-scan`,
      pass:
        statusApproved(draft.vulnerabilityScan?.status) &&
        Number(draft.vulnerabilityScan?.criticalFindings ?? 1) === 0 &&
        !missingValue(draft.vulnerabilityScan?.evidencePath),
      evidence: "vulnerability scan must pass with criticalFindings=0 and recorded evidence"
    },
    {
      id: `${draft.name}-sbom`,
      pass:
        statusApproved(draft.sbom?.status) &&
        !missingValue(draft.sbom?.evidencePath),
      evidence: "SBOM evidence must be generated and approved"
    },
    {
      id: `${draft.name}-provenance`,
      pass:
        statusApproved(draft.provenance?.status) &&
        !missingValue(draft.provenance?.source) &&
        !missingValue(draft.provenance?.evidenceUrl),
      evidence: "runtime image provenance/source evidence must be approved"
    },
    {
      id: `${draft.name}-license-review`,
      pass:
        statusApproved(draft.licenseReview?.status) &&
        !missingValue(draft.licenseReview?.evidenceUrl),
      evidence: "license and support review must be approved"
    },
    {
      id: `${draft.name}-approval`,
      pass:
        statusApproved(draft.approval?.status) &&
        Array.isArray(draft.approval?.approvers) &&
        draft.approval.approvers.length >= 4 &&
        !missingValue(draft.approval?.ticket),
      evidence: "release approval must list approvers and change/release ticket"
    }
  ];
}

function applyInputs(example, name, sourceDigestInspection, securityEvidenceInspection) {
  const now = new Date().toISOString();
  const scanEvidence = securityEvidenceInspection.vulnerabilityScan?.draftValue;
  const sbomEvidence = securityEvidenceInspection.sbom?.draftValue;
  const approvers = commaList(
    cliValue("approvers", name),
    example.approval?.approvers ?? [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ]
  );

  return {
    ...example,
    schema: "cywell.opslens.external-runtime-evidence-draft.v0.1",
    artifactType: "opslens.external-runtime-image-evidence-draft.v0.1",
    draft: true,
    evidenceState: "DRAFT_NEEDS_REVIEW",
    generatedAt: now,
    actionMode: "draftOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    finalEvidenceFile: resolve(
      options.externalEvidenceDir,
      imageDefaults[name].final
    ),
    name,
    sourceDigest:
      cliValue("source-digest", name) ??
      sourceDigestInspection.sourceDigest ??
      example.sourceDigest,
    sourceDigestInspection,
    securityEvidenceInspection,
    mirroredImage: cliValue("mirrored-image", name) ?? example.mirroredImage,
    mirroredDigest: cliValue("mirrored-digest", name) ?? example.mirroredDigest,
    certification: {
      ...example.certification,
      status: cliValue("certification-status", name) ?? example.certification?.status ?? "pending",
      evidenceUrl: cliValue("certification-evidence", name) ?? example.certification?.evidenceUrl,
      checkedAt: cliValue("certification-checked-at", name) ?? cliValue("checked-at", name) ?? now
    },
    vulnerabilityScan: {
      ...example.vulnerabilityScan,
      ...(scanEvidence ?? {}),
      status: cliValue("scan-status", name) ?? scanEvidence?.status ?? example.vulnerabilityScan?.status ?? "pending",
      scanner: cliValue("scan-scanner", name) ?? scanEvidence?.scanner ?? example.vulnerabilityScan?.scanner ?? "trivy",
      criticalFindings: numberOrPlaceholder(
        cliValue("scan-critical-findings", name),
        scanEvidence?.criticalFindings ?? example.vulnerabilityScan?.criticalFindings ?? "<missing:critical-findings>"
      ),
      highFindings: numberOrPlaceholder(
        cliValue("scan-high-findings", name),
        scanEvidence?.highFindings ?? example.vulnerabilityScan?.highFindings ?? "<missing:high-findings>"
      ),
      evidencePath: cliValue("scan-evidence", name) ?? scanEvidence?.evidencePath ?? example.vulnerabilityScan?.evidencePath
    },
    sbom: {
      ...example.sbom,
      ...(sbomEvidence ?? {}),
      status: cliValue("sbom-status", name) ?? sbomEvidence?.status ?? example.sbom?.status ?? "pending",
      format: cliValue("sbom-format", name) ?? sbomEvidence?.format ?? example.sbom?.format ?? "spdx-json",
      evidencePath: cliValue("sbom-evidence", name) ?? sbomEvidence?.evidencePath ?? example.sbom?.evidencePath
    },
    provenance: {
      ...example.provenance,
      status: cliValue("provenance-status", name) ?? example.provenance?.status ?? "pending",
      source: cliValue("provenance-source", name) ?? example.provenance?.source,
      evidenceUrl: cliValue("provenance-evidence", name) ?? example.provenance?.evidenceUrl
    },
    licenseReview: {
      ...example.licenseReview,
      status: cliValue("license-status", name) ?? example.licenseReview?.status ?? "pending",
      evidenceUrl: cliValue("license-evidence", name) ?? example.licenseReview?.evidenceUrl
    },
    approval: {
      ...example.approval,
      status: cliValue("approval-status", name) ?? example.approval?.status ?? "pending",
      approvers,
      approvedAt: cliValue("approved-at", name) ?? example.approval?.approvedAt ?? "<missing:approved-at>",
      ticket: cliValue("ticket", name) ?? example.approval?.ticket ?? "<missing:change-ticket>"
    }
  };
}

async function buildDraft(name) {
  const example = loadExample(name);
  const sourceDigestInspection = await collectSourceDigest(name, example);
  const securityEvidenceInspection = inspectSecurityEvidence(name);
  const draft = applyInputs(example, name, sourceDigestInspection, securityEvidenceInspection);
  const requirements = evidenceRequirements(draft);
  const unmet = requirements.filter((requirement) => !requirement.pass);
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    "origin/main"
  );
  const worktreeStatus = await gitStatusShort();

  return {
    ...draft,
    evidenceState: unmet.length === 0 ? "DRAFT_REVIEW_READY" : "DRAFT_NEEDS_EVIDENCE",
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    requirements,
    missingEvidence: unmet.map((requirement) => `${requirement.id}: ${requirement.evidence}`),
    promotionRequirements: [
      "Human reviewer must verify every source artifact, ticket, scan, SBOM, provenance record, and approval.",
      `Only after review, create ${imageDefaults[name].final}; do not rename this draft blindly.`,
      "Regenerate npm run verify:external-runtime-plan, verify:release-plan, verify:evidence-checkpoint, and verify:release-evidence-bundle from the same clean Git HEAD."
    ],
    evidence: [
      "This artifact is draft-only intake evidence.",
      "It is safe to share with release reviewers because secret-like values are rejected before export.",
      sourceDigestInspection.status === "pass"
        ? `Source digest was collected by ${sourceDigestInspection.method}.`
        : `Source digest inspection status=${sourceDigestInspection.status}: ${sourceDigestInspection.detail}`,
      `Vulnerability evidence intake: ${securityEvidenceInspection.vulnerabilityScan.detail}`,
      `SBOM evidence intake: ${securityEvidenceInspection.sbom.detail}`,
      "The external runtime verifier may surface this draft, but final release readiness still requires the reviewed vllm.json/qdrant.json file."
    ],
    risk: [
      "A complete draft is not final approval; it can still contain stale, incorrect, or unreviewed evidence.",
      "External runtime image tags can drift unless sourceDigest and mirroredDigest are immutable and reviewer-approved."
    ],
    rollbackPath: [
      "Delete or supersede this draft if any referenced digest, scan, SBOM, provenance, license, or approval evidence is rejected.",
      "Keep release-plan status as NEEDS_EVIDENCE until final evidence files pass verification."
    ]
  };
}

async function main() {
  const outputs = options.names.map((name) => ({
    name,
    outputPath: resolve(
      options.evidenceOut ??
        resolve(options.externalEvidenceDir, imageDefaults[name].draft)
    )
  }));
  for (const { outputPath } of outputs) {
    if (!outputPath.endsWith(".draft.json")) {
      throw new Error("draft evidence output must end with .draft.json");
    }
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`${outputPath} already exists; pass --force to replace the draft`);
    }
  }

  for (const { name, outputPath } of outputs) {
    const draft = await buildDraft(name);
    const serialized = `${JSON.stringify(draft, null, 2)}\n`;
    if (secretLike(serialized)) {
      throw new Error(`${name} draft evidence would include secret-like material`);
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");

    console.log(`Cywell OpsLens external runtime draft written: ${outputPath}`);
    console.log(`name=${draft.name} state=${draft.evidenceState} missingEvidence=${draft.missingEvidence.length}`);
  }
  console.log("mutationAllowedByThisVerifier=false registryMutationAttempted=false clusterMutationAttempted=false");
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
