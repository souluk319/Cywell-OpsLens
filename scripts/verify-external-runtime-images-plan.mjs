#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-external-runtime-images-plan.json",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  releasePlanEvidence: "test-results/cywell-opslens-release-publish-plan.json",
  externalEvidenceDir: "docs/release/evidence/external-runtime",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  fbc: "deploy/catalog/fbc/catalog.yaml",
  crd: "deploy/operator/config/crd/opslens.cywell.io_opslensinstallations.yaml",
  appManifest: "deploy/operator/config/apps/opslens-stack.yaml",
  sample: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  fixture: "deploy/operator/fixtures/opslensinstallation-validateonly.yaml",
  timeoutMs: 10000
};

const externalRuntimeNames = new Set(["vllm", "qdrant"]);

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
  imageEvidence: parsed.get("image-evidence") ?? defaults.imageEvidence,
  releasePlanEvidence: parsed.get("release-plan-evidence") ?? defaults.releasePlanEvidence,
  externalEvidenceDir: parsed.get("external-evidence-dir") ?? defaults.externalEvidenceDir,
  csv: parsed.get("csv") ?? defaults.csv,
  fbc: parsed.get("fbc") ?? defaults.fbc,
  crd: parsed.get("crd") ?? defaults.crd,
  appManifest: parsed.get("app-manifest") ?? defaults.appManifest,
  sample: parsed.get("sample") ?? defaults.sample,
  fixture: parsed.get("fixture") ?? defaults.fixture,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail });
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

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failureDetail);
  }
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim?.() ?? "",
      stderr: error.stderr?.trim?.() ?? error.message
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
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file exists", `${path} is not readable: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

async function loadYamlDocuments(path) {
  const text = await readText(path);
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${path}: ${errors.map((error) => error.message).join("; ")}`);
    return [];
  }
  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  pass("YAML source", `${path} contains ${parsed.length} document(s)`);
  return parsed;
}

async function loadSingleYaml(path) {
  const documents = await loadYamlDocuments(path);
  expectCheck("single YAML document", documents.length === 1, `${path} contains 1 document`, `${path} expected 1 document, got ${documents.length}`);
  return documents[0];
}

function loadJsonArtifact(path, label, { required = false } = {}) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    const detail = `${label} is missing at ${absolutePath}`;
    if (required) {
      fail(label, detail);
    } else {
      warn(label, detail);
    }
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

function relatedImagesFromCsv(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
}

function relatedImagesFromFbc(fbcDocuments) {
  const bundle = fbcDocuments.find((document) => document?.schema === "olm.bundle");
  return new Map((bundle?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
}

function externalRuntimeImages(csvImages) {
  return Array.from(externalRuntimeNames).map((name) => ({
    name,
    image: csvImages.get(name) ?? "missing",
    sourceType: name === "qdrant" ? "third-party-vector-store" : "externally-built-model-runtime",
    desiredMirror: name === "qdrant"
      ? "<internal-registry>/cywell/qdrant:v1.12.1"
      : "<internal-registry>/cywell/opslens-vllm:0.1.0",
    evidenceFile: resolve(options.externalEvidenceDir, `${name}.json`)
  }));
}

function loadJsonFile(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail(label, `${absolutePath} is missing`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function command(id, phase, text, rationale, rollback, mutation = false) {
  return {
    id,
    phase,
    command: text,
    mutation,
    requiresExplicitApproval: mutation,
    rationale,
    rollback
  };
}

function buildCommands(images) {
  const inspectCommands = images.flatMap((image) => [
    command(
      `inspect-${image.name}`,
      "read-only-inspection",
      `oc image info ${image.image}`,
      `Resolve manifest metadata for external runtime image ${image.name}.`,
      "No rollback is required for read-only image inspection."
    ),
    command(
      `scan-${image.name}`,
      "read-only-inspection",
      `trivy image --scanners vuln,secret --severity CRITICAL,HIGH ${image.image}`,
      `Collect vulnerability evidence for ${image.name} before Certified Operator submission.`,
      "No rollback is required for local scan evidence generation."
    ),
    command(
      `sbom-${image.name}`,
      "read-only-inspection",
      `syft ${image.image} -o spdx-json > ${options.externalEvidenceDir}/${image.name}-sbom.spdx.json`,
      `Create SBOM evidence for ${image.name}.`,
      "Delete the generated SBOM artifact if the source image digest is rejected."
    )
  ]);

  const mirrorCommands = images.map((image) =>
    command(
      `mirror-${image.name}`,
      "approved-registry-mutation",
      `oc image mirror ${image.image} ${image.desiredMirror} --keep-manifest-list=true`,
      `Mirror ${image.name} into the controlled release registry for disconnected installs.`,
      `Retain the previous approved mirror digest; publish a corrected tag and update CSV/FBC references instead of deleting an in-use digest.`,
      true
    )
  );

  const signCommands = images.map((image) =>
    command(
      `sign-${image.name}`,
      "approved-registry-mutation",
      `cosign sign ${image.desiredMirror}`,
      `Attach registry signature evidence for mirrored ${image.name}.`,
      `Revoke or supersede the signature for ${image.desiredMirror} according to registry policy.`,
      true
    )
  );

  return [
    command(
      "run-external-runtime-preflight",
      "preflight",
      "npm run verify:images:build && npm run verify:external-runtime-plan && npm run verify:release-plan",
      "Regenerate same-HEAD image build, external runtime, and release publish evidence before any registry mutation.",
      "No rollback is required for local preflight evidence."
    ),
    ...inspectCommands,
    ...mirrorCommands,
    ...signCommands
  ];
}

function evidenceTemplateRequirements(image, template) {
  return [
    {
      id: `${image.name}-template-image`,
      pass: template?.image === image.image && template?.sourceImage === image.image,
      evidence: `template references ${image.image}`
    },
    {
      id: `${image.name}-template-source-digest`,
      pass: typeof template?.sourceDigest === "string" && template.sourceDigest.includes("@sha256:"),
      evidence: "template includes sourceDigest field"
    },
    {
      id: `${image.name}-template-mirror-digest`,
      pass:
        typeof template?.mirroredImage === "string" &&
        typeof template?.mirroredDigest === "string" &&
        template.mirroredDigest.includes("@sha256:"),
      evidence: "template includes mirroredImage and mirroredDigest fields"
    },
    {
      id: `${image.name}-template-certification`,
      pass: typeof template?.certification?.status === "string" && typeof template?.certification?.evidenceUrl === "string",
      evidence: "template includes certification status and evidenceUrl"
    },
    {
      id: `${image.name}-template-vulnerability-scan`,
      pass:
        typeof template?.vulnerabilityScan?.status === "string" &&
        Number(template?.vulnerabilityScan?.criticalFindings ?? 1) === 0 &&
        typeof template?.vulnerabilityScan?.evidencePath === "string",
      evidence: "template includes vulnerability scan status, criticalFindings=0, and evidencePath"
    },
    {
      id: `${image.name}-template-sbom`,
      pass: typeof template?.sbom?.status === "string" && typeof template?.sbom?.evidencePath === "string",
      evidence: "template includes SBOM status and evidencePath"
    },
    {
      id: `${image.name}-template-provenance`,
      pass: typeof template?.provenance?.status === "string" && typeof template?.provenance?.evidenceUrl === "string",
      evidence: "template includes provenance status and evidenceUrl"
    },
    {
      id: `${image.name}-template-license-review`,
      pass: typeof template?.licenseReview?.status === "string" && typeof template?.licenseReview?.evidenceUrl === "string",
      evidence: "template includes license review status and evidenceUrl"
    },
    {
      id: `${image.name}-template-approval`,
      pass:
        typeof template?.approval?.status === "string" &&
        Array.isArray(template?.approval?.approvers) &&
        template.approval.approvers.length >= 4,
      evidence: "template includes release approval status and required approvers"
    }
  ];
}

function loadEvidenceTemplates(images) {
  const readmePath = resolve(options.externalEvidenceDir, "README.md");
  if (!existsSync(readmePath)) {
    fail("external runtime evidence README", `${readmePath} is missing`);
  } else {
    const text = readFileSync(readmePath, "utf8");
    expectCheck(
      "external runtime evidence README",
      text.includes("vllm.json") &&
        text.includes("qdrant.json") &&
        text.includes("sourceDigest") &&
        text.includes("mirroredDigest") &&
        text.includes("criticalFindings=0"),
      "README documents vLLM/Qdrant evidence files, immutable digests, and vulnerability scan gate",
      "README must document vLLM/Qdrant files, source/mirror digests, and criticalFindings=0"
    );
  }

  return images.map((image) => {
    const templatePath = resolve(options.externalEvidenceDir, `${image.name}.example.json`);
    const template = loadJsonFile(templatePath, `${image.name} external runtime evidence template`);
    const requirements = evidenceTemplateRequirements(image, template);
    const unmet = requirements.filter((requirement) => !requirement.pass);
    if (unmet.length > 0) {
      for (const requirement of unmet) {
        fail(`${image.name} external runtime evidence template`, `${requirement.id}: ${requirement.evidence}`);
      }
    } else {
      pass(`${image.name} external runtime evidence template`, `${templatePath} has all required placeholder fields`);
    }
    return {
      name: image.name,
      templatePath,
      status: unmet.length > 0 ? "blocked" : "ready",
      requirements
    };
  });
}

function hasDigest(value) {
  return typeof value === "string" && value.includes("@sha256:");
}

function statusApproved(value) {
  return ["approved", "pass", "passed", "certified", "ready"].includes(String(value ?? "").toLowerCase());
}

function evidenceRequirements(image, evidence) {
  const requirements = [
    {
      id: `${image.name}-source-image`,
      pass: evidence?.image === image.image || evidence?.sourceImage === image.image,
      evidence: `expected ${image.image}`
    },
    {
      id: `${image.name}-source-digest`,
      pass: hasDigest(evidence?.sourceDigest),
      evidence: "sourceDigest must pin the approved source image by sha256 digest"
    },
    {
      id: `${image.name}-mirror-digest`,
      pass: typeof evidence?.mirroredImage === "string" && hasDigest(evidence?.mirroredDigest),
      evidence: "mirroredImage and mirroredDigest must identify the internal registry copy"
    },
    {
      id: `${image.name}-certification`,
      pass: statusApproved(evidence?.certification?.status),
      evidence: "container certification status must be approved/pass/certified"
    },
    {
      id: `${image.name}-vulnerability-scan`,
      pass:
        statusApproved(evidence?.vulnerabilityScan?.status) &&
        Number(evidence?.vulnerabilityScan?.criticalFindings ?? 1) === 0,
      evidence: "vulnerability scan must pass with criticalFindings=0"
    },
    {
      id: `${image.name}-sbom`,
      pass: statusApproved(evidence?.sbom?.status),
      evidence: "SBOM evidence must be generated and approved"
    },
    {
      id: `${image.name}-provenance`,
      pass: statusApproved(evidence?.provenance?.status),
      evidence: "build/source provenance must be recorded for the runtime image"
    },
    {
      id: `${image.name}-license-review`,
      pass: statusApproved(evidence?.licenseReview?.status),
      evidence: "license/support review must be approved"
    },
    {
      id: `${image.name}-approval`,
      pass: statusApproved(evidence?.approval?.status) && Array.isArray(evidence?.approval?.approvers) && evidence.approval.approvers.length > 0,
      evidence: "security/release approval must list approvers"
    }
  ];

  return requirements;
}

function imageEvidenceHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function imageEvidenceDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function planStatus(missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (missingEvidence.length > 0) return "NEEDS_EVIDENCE";
  return "APPROVAL_REQUIRED";
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "QUAY_TOKEN",
    "REGISTRY_TOKEN",
    "COSIGN_PASSWORD"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

async function buildPlan() {
  const [csv, fbc, crdText, appManifestText, sampleText, fixtureText] = await Promise.all([
    loadSingleYaml(options.csv),
    loadYamlDocuments(options.fbc),
    readText(options.crd),
    readText(options.appManifest),
    readText(options.sample),
    readText(options.fixture)
  ]);
  const currentHeadSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const imageEvidence = loadJsonArtifact(options.imageEvidence, "Image build readiness evidence");
  const releasePlan = loadJsonArtifact(options.releasePlanEvidence, "Release publish plan evidence");
  const csvImages = relatedImagesFromCsv(csv);
  const fbcImages = relatedImagesFromFbc(fbc);
  const images = externalRuntimeImages(csvImages);
  const evidenceTemplates = loadEvidenceTemplates(images);
  const missingEvidence = [];

  expectCheck(
    "external runtime inventory",
    images.every((image) => image.image !== "missing"),
    images.map((image) => `${image.name}=${image.image}`).join(", "),
    "CSV must include vllm and qdrant relatedImages"
  );

  for (const image of images) {
    expectCheck(
      `FBC external runtime parity ${image.name}`,
      fbcImages.get(image.name) === image.image,
      image.image,
      `expected FBC relatedImages.${image.name}=${image.image}, got ${fbcImages.get(image.name) ?? "missing"}`
    );

    for (const [label, text] of [
      ["CRD default", crdText],
      ["Operator app manifest", appManifestText],
      ["sample OpsLensInstallation", sampleText],
      ["fixture OpsLensInstallation", fixtureText]
    ]) {
      expectCheck(
        `${label} ${image.name} image reference`,
        text.includes(image.image),
        image.image,
        `${label} must reference ${image.image}`
      );
    }
  }

  const imageEvidenceExternalImages = new Map((imageEvidence?.externalImages ?? []).map((entry) => [entry.name, entry]));
  if (imageEvidence?.status !== "PASS") {
    missingEvidence.push(`image build readiness status=${imageEvidence?.status ?? "missing"}`);
  }
  if (imageEvidenceHeadSha(imageEvidence) !== currentHeadSha) {
    missingEvidence.push(`image build readiness head=${imageEvidenceHeadSha(imageEvidence) ?? "missing"} currentHead=${currentHeadSha}`);
  }
  if (imageEvidenceDirty(imageEvidence) !== false) {
    missingEvidence.push(`image build readiness worktreeDirty=${String(imageEvidenceDirty(imageEvidence) ?? "unknown")}`);
  }
  for (const image of images) {
    const imageEntry = imageEvidenceExternalImages.get(image.name);
    expectCheck(
      `image readiness external contract ${image.name}`,
      imageEntry?.image === image.image && imageEntry?.certificationEvidenceRequired === true,
      `${image.image} certificationEvidenceRequired=true`,
      `image readiness evidence must mark ${image.name} as external with certificationEvidenceRequired=true`
    );
  }

  if (releasePlan?.registryMutationAttempted === true || releasePlan?.clusterMutationAttempted === true) {
    warn(
      "release publish plan observation",
      "release publish plan has mutationAttempted=true; external runtime verifier remains no-mutation and does not depend on release-plan freshness"
    );
  }

  const externalEvidence = images.map((image) => {
    const artifact = loadJsonArtifact(image.evidenceFile, `${image.name} external runtime certification evidence`);
    const requirements = evidenceRequirements(image, artifact);
    const unmet = requirements.filter((requirement) => !requirement.pass);
    if (unmet.length > 0) {
      missingEvidence.push(
        `${image.name} external runtime evidence missing at ${image.evidenceFile}: ${unmet
          .map((requirement) => requirement.id)
          .join(", ")}`
      );
      warn(`${image.name} external runtime evidence gap`, `${unmet.length} requirement(s) need evidence`);
    } else {
      pass(`${image.name} external runtime evidence`, "all certification and mirroring requirements are present");
    }

    return {
      name: image.name,
      image: image.image,
      sourceType: image.sourceType,
      desiredMirror: image.desiredMirror,
      evidenceFile: image.evidenceFile,
      status: unmet.length > 0 ? "needs-evidence" : "ready",
      requirements
    };
  });

  if (worktreeStatus.length > 0) {
    missingEvidence.push(`current git worktree dirty=true currentHead=${currentHeadSha}`);
  }

  for (const gap of missingEvidence) {
    warn("external runtime evidence gap", gap);
  }

  const status = planStatus(missingEvidence);

  return {
    schema: "cywell.opslens.external-runtime-images-plan.v0.1",
    artifactType: "opslens.external-runtime-images-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "approvalPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-CERT-001"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: currentHeadSha,
      baseRef: await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    requiredApprovals: [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    evidenceTemplates,
    externalImages: externalEvidence,
    commands: buildCommands(images),
    missingEvidence,
    risk: [
      "External runtime image tags can drift unless certification evidence records immutable source and mirror digests.",
      "Qdrant is a third-party vector store image and needs license, vulnerability, and support boundary evidence before Certified Operator submission.",
      "vLLM/model runtime provenance must be documented because this repository does not build that image.",
      "Wrong mirror references can break disconnected installs even when the Operator bundle itself is valid."
    ],
    rollbackPath: [
      "Do not delete a mirrored digest already referenced by a shipped bundle; publish a corrected mirror tag and update CSV/FBC in a new release.",
      "If scan or certification evidence fails, keep the release plan in NEEDS_EVIDENCE and do not push or sign runtime mirror images.",
      "If an external runtime is replaced, regenerate image build readiness, external runtime plan, release publish plan, and install approval plan from the same Git HEAD."
    ],
    evidenceSources: {
      imageBuildReadiness: resolve(options.imageEvidence),
      releasePublishPlan: resolve(options.releasePlanEvidence),
      externalEvidenceDir: resolve(options.externalEvidenceDir),
      csv: resolve(options.csv),
      fbc: resolve(options.fbc),
      crd: resolve(options.crd),
      appManifest: resolve(options.appManifest),
      sample: resolve(options.sample),
      fixture: resolve(options.fixture)
    },
    checks
  };
}

async function writePlan(plan) {
  const reportPath = resolve(options.evidenceOut);
  const initialSerialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => initialSerialized.includes(secret))) {
    throw new Error("external runtime images plan would include a configured secret value");
  }
  pass("external runtime images plan evidence export", `${reportPath} written without secret material`);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("external runtime images plan would include a configured secret value");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized);
}

function printSummary() {
  const statusWeight = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens external runtime images plan: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) process.exitCode = 1;
}

try {
  const plan = await buildPlan();
  await writePlan(plan);
} catch (error) {
  fail("external runtime images plan verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
