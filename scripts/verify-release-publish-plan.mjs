#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-publish-plan.json",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
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
  imageEvidence: parsed.get("image-evidence") ?? defaults.imageEvidence,
  catalogSource: parsed.get("catalog-source") ?? defaults.catalogSource,
  subscription: parsed.get("subscription") ?? defaults.subscription,
  csv: parsed.get("csv") ?? defaults.csv,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

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
  return result.stdout.split(/\r?\n/);
}

async function loadSingleYaml(path) {
  const absolutePath = resolve(path);
  const text = await readFile(absolutePath, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${path}: ${errors.map((error) => error.message).join("; ")}`);
  }
  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  if (parsed.length !== 1) {
    throw new Error(`${path}: expected 1 YAML document, got ${parsed.length}`);
  }
  pass("YAML source", `${path} loaded`);
  return parsed[0];
}

function loadJsonArtifact(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} evidence is missing at ${absolutePath}`);
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

function relatedImages(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
}

function requiredPublishImages(imageEvidence, catalogSource) {
  const internal = imageEvidence?.internalBuilds ?? [];
  const packaging = imageEvidence?.packagingBuilds ?? [];
  const external = imageEvidence?.externalImages ?? [];
  const images = [...internal, ...packaging, ...external].map((image) => ({
    name: image.name ?? "unknown",
    image: image.image ?? "unknown",
    source: external.includes(image) ? "external-runtime" : "cywell-build",
    certificationEvidenceRequired: image.certificationEvidenceRequired === true
  }));
  const catalogImage = catalogSource?.spec?.image;
  if (catalogImage && !images.some((image) => image.image === catalogImage)) {
    images.push({
      name: "catalog",
      image: catalogImage,
      source: "catalogsource",
      certificationEvidenceRequired: false
    });
  }
  return images;
}

function buildEvidenceGaps(imageEvidence, publishImages) {
  const actualBuilds = imageEvidence?.actualBuilds ?? [];
  const actualBuildStatus = new Map(actualBuilds.map((build) => [build.name, build.status]));
  const buildRequiredNames = ["operator", "api", "dashboard", "bundle", "catalog"];
  const gaps = [];

  if (imageEvidence?.status !== "PASS") {
    gaps.push(`image readiness status is ${imageEvidence?.status ?? "missing"}`);
  }
  if (imageEvidence?.worktreeDirty !== false) {
    gaps.push(`image readiness worktreeDirty=${String(imageEvidence?.worktreeDirty ?? "unknown")}`);
  }
  if (imageEvidence?.actualBuildRequested !== true) {
    gaps.push("run npm run verify:images:build before publishing release images");
  }

  for (const name of buildRequiredNames) {
    const status = actualBuildStatus.get(name);
    if (status !== "PASS") {
      gaps.push(`${name} actual image build status=${status ?? "missing"}`);
    }
  }

  for (const image of publishImages) {
    if (image.certificationEvidenceRequired) {
      gaps.push(`${image.name} external image requires certification and mirroring evidence before Certified Operator submission`);
    }
  }

  return gaps;
}

function command(id, phase, text, rationale, rollback, mutation = true) {
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

function buildCommands(publishImages, catalogSource, subscription) {
  const pushCommands = publishImages
    .filter((image) => image.source !== "external-runtime")
    .map((image) =>
      command(
        `push-${image.name}`,
        "publish-images",
        `docker push ${image.image}`,
        `Publish ${image.name} image for internal CatalogSource consumption.`,
        `remove or supersede ${image.image} in the release registry; update catalog references before customer install`
      )
    );

  const signCommands = publishImages
    .filter((image) => image.source !== "external-runtime")
    .map((image) =>
      command(
        `sign-${image.name}`,
        "sign-images",
        `cosign sign ${image.image}`,
        `Attach signature evidence for ${image.name}.`,
        `revoke or replace the signature for ${image.image} according to registry policy`
      )
    );

  const mirrorCommands = publishImages
    .filter((image) => image.source === "external-runtime")
    .map((image) =>
      command(
        `mirror-${image.name}`,
        "mirror-external-runtime",
        `oc image mirror ${image.image} <internal-registry>/cywell/${image.name}:0.1.0 --keep-manifest-list=true`,
        `Mirror external runtime image ${image.name} into the controlled release registry.`,
        `remove mirrored ${image.name} image tag only after confirming no installed bundle references it`
      )
    );

  return [
    command(
      "run-release-preflight",
      "preflight",
      "npm run verify:images:build && npm run verify:certification && npm run verify:release-plan",
      "Regenerate local image build, certification, and release publish evidence before external mutations.",
      "No rollback is required for local preflight.",
      false
    ),
    command(
      "login-release-registry",
      "publish-images",
      "docker login quay.io",
      "Authenticate to the release registry without writing credentials to the repo.",
      "docker logout quay.io",
      false
    ),
    ...pushCommands,
    ...signCommands,
    ...mirrorCommands,
    command(
      "verify-catalogsource-image",
      "post-publish-verify",
      `oc image info ${catalogSource?.spec?.image ?? "quay.io/cywell/opslens-catalog:0.1.0"}`,
      "Confirm the CatalogSource image is resolvable before creating a CatalogSource in a cluster.",
      "No rollback is required for read-only image inspection.",
      false
    ),
    command(
      "verify-subscription-contract",
      "post-publish-verify",
      `oc apply -f ${options.subscription} --dry-run=server --validate=true`,
      `Confirm Manual Subscription ${subscription?.metadata?.name ?? "cywell-opslens"} remains server-valid before install.`,
      "No rollback is required for server-side dry-run.",
      false
    )
  ];
}

function planStatus(missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (missingEvidence.length > 0) return "NEEDS_EVIDENCE";
  return "PUBLISH_APPROVAL_REQUIRED";
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
  const [catalogSource, subscription, csv] = await Promise.all([
    loadSingleYaml(options.catalogSource),
    loadSingleYaml(options.subscription),
    loadSingleYaml(options.csv)
  ]);
  const imageEvidence = loadJsonArtifact(options.imageEvidence, "Image readiness evidence");
  const csvImages = relatedImages(csv);
  const publishImages = requiredPublishImages(imageEvidence, catalogSource);

  expectCheck(
    "CatalogSource release image",
    catalogSource?.kind === "CatalogSource" &&
      catalogSource?.metadata?.namespace === "openshift-marketplace" &&
      catalogSource?.spec?.image === "quay.io/cywell/opslens-catalog:0.1.0",
    catalogSource?.spec?.image ?? "missing",
    "CatalogSource must point at quay.io/cywell/opslens-catalog:0.1.0"
  );
  expectCheck(
    "Subscription release safety",
    subscription?.spec?.installPlanApproval === "Manual" &&
      subscription?.spec?.startingCSV === "cywell-opslens-operator.v0.1.0",
    "Subscription is Manual with pinned startingCSV",
    "Subscription must stay Manual and pinned for release publish"
  );
  expectCheck(
    "CSV operator image parity",
    csv?.metadata?.annotations?.containerImage === csvImages.get("operator"),
    csv?.metadata?.annotations?.containerImage ?? "missing",
    "CSV containerImage must match relatedImages.operator"
  );
  expectCheck(
    "release publish image inventory",
    publishImages.some((image) => image.name === "operator") &&
      publishImages.some((image) => image.name === "api") &&
      publishImages.some((image) => image.name === "dashboard") &&
      publishImages.some((image) => image.name === "bundle") &&
      publishImages.some((image) => image.name === "catalog"),
    publishImages.map((image) => `${image.name}=${image.image}`).join(", "),
    "release publish plan must include operator, api, dashboard, bundle, and catalog images"
  );

  const missingEvidence = buildEvidenceGaps(imageEvidence, publishImages);
  for (const gap of missingEvidence) {
    warn("release publish evidence gap", gap);
  }

  const worktreeStatus = await gitStatusShort();
  const commands = buildCommands(publishImages, catalogSource, subscription);

  return {
    schema: "cywell.opslens.release-publish-plan.v0.1",
    artifactType: "opslens.release-publish-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: planStatus(missingEvidence),
    actionMode: "approvalPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-CERT-001", "AC-OP-005"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: await gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
      baseRef: await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    requiredApprovals: [
      "release-manager",
      "registry-admin",
      "security-reviewer",
      "product-owner"
    ],
    publishImages,
    catalog: {
      catalogSourceImage: catalogSource?.spec?.image ?? "unknown",
      subscriptionNamespace: subscription?.metadata?.namespace ?? "unknown",
      startingCSV: subscription?.spec?.startingCSV ?? "unknown",
      installPlanApproval: subscription?.spec?.installPlanApproval ?? "unknown"
    },
    commands,
    missingEvidence,
    risk: [
      "Publishing mutable or unsigned images can make later OLM install evidence unreproducible.",
      "Catalog image publishing is blocked until registry.redhat.io base-image authentication is available locally or in CI.",
      "External vLLM/Qdrant runtime images require certification and mirroring evidence before Certified Operator submission.",
      "Pushing images does not install OpsLens; cluster install remains gated by the separate install approval plan."
    ],
    rollbackPath: [
      "Do not delete already-consumed image tags; publish a corrected patch tag and update FBC/CatalogSource instead.",
      "If a bad catalog image is pushed, publish a corrected catalog tag and wait for CatalogSource registryPoll refresh.",
      "If mirrored external runtime images are wrong, remove only unused mirror tags and regenerate CSV/FBC references.",
      "Rerun npm run verify:release-plan and npm run verify:install-plan after any image reference change."
    ],
    evidenceSources: {
      imageReadiness: resolve(options.imageEvidence),
      catalogSource: resolve(options.catalogSource),
      subscription: resolve(options.subscription),
      csv: resolve(options.csv)
    },
    checks
  };
}

async function writePlan(plan) {
  const reportPath = resolve(options.evidenceOut);
  const initialSerialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => initialSerialized.includes(secret))) {
    throw new Error("release publish plan would include a configured secret value");
  }
  pass("release publish plan evidence export", `${reportPath} written without secret material`);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("release publish plan would include a configured secret value");
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
  console.log(`Cywell OpsLens release publish plan: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) process.exitCode = 1;
}

try {
  const plan = await buildPlan();
  await writePlan(plan);
} catch (error) {
  fail("release publish plan verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
