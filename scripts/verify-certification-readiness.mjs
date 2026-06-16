#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-certification-readiness.json",
  toolingMarkdownOut:
    "test-results/cywell-opslens-certification-tooling-release-manager.md",
  ciRunnerEvidence: "docs/release/evidence/certification/approved-ci-runner.json",
  timeoutMs: 10000
};

const paths = {
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  bundleAnnotations: "deploy/operator/bundle/metadata/annotations.yaml",
  bundleDockerfile: "deploy/operator/bundle.Dockerfile",
  fbc: "deploy/catalog/fbc/catalog.yaml",
  catalogDockerfile: "deploy/catalog/catalog.Dockerfile",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  scorecard: "deploy/operator/bundle/tests/scorecard/config.yaml",
  communitySubmissionEvidence: "test-results/cywell-opslens-community-operator-submission.json",
  securityDoc: "docs/security/cywell-opslens-certification-readiness.md",
  supportDoc: "docs/support/cywell-opslens-support-matrix.md",
  certificationToolingDoc: "docs/release/cywell-opslens-certification-tooling.md",
  releaseGates: "docs/release/cywell-opslens-release-gates.md",
  ragApprovalQueueDoc: "docs/rag/cywell-opslens-rag-approval-queue.md"
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
  toolingMarkdownOut:
    parsed.get("tooling-markdown-out") ?? defaults.toolingMarkdownOut,
  ciRunnerEvidence: parsed.get("ci-runner-evidence") ?? defaults.ciRunnerEvidence,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const cli = [];
const yamlCache = new Map();
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
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

function label(doc) {
  return `${doc?.kind ?? doc?.schema ?? "unknown"}/${doc?.metadata?.name ?? doc?.name ?? "unknown"}`;
}

async function readText(relativePath) {
  const absolutePath = resolve(relativePath);
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    fail("file exists", `${relativePath} is not readable: ${error.message}`);
    return undefined;
  }
}

async function loadYaml(relativePath) {
  if (yamlCache.has(relativePath)) {
    return yamlCache.get(relativePath);
  }

  const text = await readText(relativePath);
  if (text === undefined) {
    yamlCache.set(relativePath, []);
    return [];
  }

  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${relativePath}: ${errors.map((error) => error.message).join("; ")}`);
    yamlCache.set(relativePath, []);
    return [];
  }

  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  pass("valid YAML", `${relativePath} contains ${parsed.length} document(s)`);
  yamlCache.set(relativePath, parsed);
  return parsed;
}

async function loadSingle(relativePath) {
  const documents = await loadYaml(relativePath);
  if (documents.length === 1) {
    return documents[0];
  }
  fail("single YAML document", `${relativePath} expected 1 document, got ${documents.length}`);
  return documents[0];
}

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

function valuesFromRelatedImages(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((image) => [image.name, image.image]));
}

function validateCsv(csv) {
  expectCheck(
    "CSV identity",
    csv?.kind === "ClusterServiceVersion" && csv?.metadata?.name === "cywell-opslens-operator.v0.1.0",
    label(csv)
  );

  const annotations = csv?.metadata?.annotations ?? {};
  const requiredAnnotations = {
    categories: "OpenShift Optional, Monitoring, AI/Machine Learning",
    certified: "false",
    support: "Cywell",
    "com.redhat.openshift.versions": "v4.16-v4.19",
    "operators.openshift.io/valid-subscription": "Contact Cywell",
    "features.operators.openshift.io/disconnected": "true",
    "features.operators.openshift.io/fips-compliant": "false",
    "features.operators.openshift.io/proxy-aware": "true",
    "features.operators.openshift.io/tls-profiles": "true"
  };

  for (const [key, expected] of Object.entries(requiredAnnotations)) {
    expectCheck(
      `CSV annotation ${key}`,
      annotations[key] === expected,
      expected,
      `expected ${expected}, got ${annotations[key] ?? "missing"}`
    );
  }

  for (const imageName of ["operator", "api", "dashboard", "vllm", "pgvector"]) {
    expectCheck(
      `CSV related image ${imageName}`,
      valuesFromRelatedImages(csv).has(imageName),
      valuesFromRelatedImages(csv).get(imageName),
      "related image missing"
    );
  }

  if ((annotations.repository ?? "").includes("example.invalid")) {
    warn("CSV repository placeholder", "replace repository URL before Community or Certified submission");
  } else {
    pass("CSV repository", annotations.repository);
  }

  const maintainerEmails = (csv?.spec?.maintainers ?? []).map((entry) => entry.email ?? "");
  if (maintainerEmails.some((email) => email.includes("example.invalid"))) {
    warn("CSV maintainer placeholder", "replace maintainer email before external submission");
  } else {
    pass("CSV maintainer email", "no placeholder maintainer email found");
  }
}

function validateBundleMetadata(annotations, dockerfileText) {
  const values = annotations?.annotations ?? {};
  for (const [key, expected] of Object.entries({
    "operators.operatorframework.io.bundle.package.v1": "cywell-opslens",
    "operators.operatorframework.io.bundle.channels.v1": "alpha",
    "operators.operatorframework.io.bundle.channel.default.v1": "alpha",
    "com.redhat.openshift.versions": "v4.16-v4.19"
  })) {
    expectCheck(
      `bundle annotation ${key}`,
      values[key] === expected,
      expected,
      `expected ${expected}, got ${values[key] ?? "missing"}`
    );
  }

  for (const text of [
    "operators.operatorframework.io.bundle.package.v1=cywell-opslens",
    "operators.operatorframework.io.bundle.channels.v1=alpha",
    "com.redhat.openshift.versions=v4.16-v4.19"
  ]) {
    expectCheck(
      `bundle Dockerfile label ${text}`,
      dockerfileText?.includes(text),
      "present",
      "missing"
    );
  }
}

function validateFbc(fbc, csv) {
  const pkg = fbc.find((doc) => doc.schema === "olm.package");
  const channel = fbc.find((doc) => doc.schema === "olm.channel");
  const bundle = fbc.find((doc) => doc.schema === "olm.bundle");

  expectCheck(
    "FBC package",
    pkg?.name === "cywell-opslens" && pkg?.defaultChannel === "alpha",
    "package cywell-opslens defaultChannel alpha"
  );
  expectCheck(
    "FBC channel",
    channel?.package === "cywell-opslens" &&
      channel?.name === "alpha" &&
      (channel?.entries ?? []).some((entry) => entry.name === "cywell-opslens-operator.v0.1.0"),
    "alpha channel includes cywell-opslens-operator.v0.1.0"
  );
  expectCheck(
    "FBC bundle",
    bundle?.name === "cywell-opslens-operator.v0.1.0" &&
      bundle?.image === "quay.io/cywell/opslens-operator-bundle:0.1.0",
    "bundle image is pinned"
  );
  expectCheck(
    "FBC GVK property",
    (bundle?.properties ?? []).some(
      (property) =>
        property.type === "olm.gvk" &&
        property.value?.group === "opslens.cywell.io" &&
        property.value?.kind === "OpsLensInstallation"
    ),
    "OpsLensInstallation GVK is declared"
  );

  const csvImages = valuesFromRelatedImages(csv);
  const fbcImages = new Map((bundle?.relatedImages ?? []).map((image) => [image.name, image.image]));
  for (const [name, image] of csvImages.entries()) {
    expectCheck(
      `FBC related image parity ${name}`,
      fbcImages.get(name) === image,
      image,
      `expected ${image}, got ${fbcImages.get(name) ?? "missing"}`
    );
  }
}

function validateCatalogInstall(catalogDockerfile, catalogSource, subscription) {
  expectCheck(
    "catalog Dockerfile base image",
    catalogDockerfile?.includes("registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18"),
    "uses Red Hat operator registry base image",
    "catalog Dockerfile base image is missing"
  );
  expectCheck(
    "catalog Dockerfile serves configs",
    catalogDockerfile?.includes("opm") && catalogDockerfile.includes("serve") && catalogDockerfile.includes("/configs"),
    "opm serve /configs",
    "catalog Dockerfile does not serve FBC configs"
  );
  expectCheck(
    "CatalogSource identity",
    catalogSource?.kind === "CatalogSource" &&
      catalogSource?.metadata?.namespace === "openshift-marketplace" &&
      catalogSource?.spec?.sourceType === "grpc",
    label(catalogSource)
  );
  expectCheck(
    "CatalogSource polling",
    catalogSource?.spec?.updateStrategy?.registryPoll?.interval === "30m",
    "registryPoll interval 30m",
    "CatalogSource registry poll interval must be 30m"
  );
  expectCheck(
    "Subscription manual approval",
    subscription?.kind === "Subscription" &&
      subscription?.spec?.installPlanApproval === "Manual" &&
      subscription?.spec?.source === "cywell-opslens-catalog" &&
      subscription?.spec?.startingCSV === "cywell-opslens-operator.v0.1.0",
    "Manual install plan with pinned startingCSV",
    "Subscription must use Manual installPlanApproval and pinned startingCSV"
  );
}

function validateScorecard(scorecard) {
  expectCheck(
    "scorecard config identity",
    scorecard?.apiVersion === "scorecard.operatorframework.io/v1alpha3" &&
      scorecard?.kind === "Configuration",
    label(scorecard)
  );
  const tests = (scorecard?.stages ?? []).flatMap((stage) => stage.tests ?? []);
  for (const testName of ["basic-check-spec-test", "olm-bundle-validation-test"]) {
    expectCheck(
      `scorecard test ${testName}`,
      tests.some((test) => (test.entrypoint ?? []).includes(testName)),
      "configured",
      "scorecard test missing"
    );
  }
}

async function validateDocs() {
  const docs = [
    {
      path: paths.securityDoc,
      sections: ["## Security Controls", "## Required Before Certified Submission", "## Known Gaps"]
    },
    {
      path: paths.supportDoc,
      sections: ["## Supported Platform Targets", "## Upgrade Policy", "## Support Boundaries"]
    },
    {
      path: paths.certificationToolingDoc,
      sections: [
        "## Required Local Tools",
        "## Read-Only Validation Commands",
        "## Execution Lanes",
        "## Approved CI Runner Evidence",
        "## Freshness and Owner Handoff",
        "## Human Setup Boundary",
        "## Approval-Gated Commands Not Run",
        "## Evidence Refresh"
      ]
    },
    {
      path: paths.releaseGates,
      sections: ["## Internal Catalog Gate", "## Community Operator Gate", "## Certified Operator Gate"]
    },
    {
      path: paths.ragApprovalQueueDoc,
      sections: ["## Current MVP 0.1 Contract", "## Future Queue States", "## Verification Mapping"]
    }
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    if (!text) {
      continue;
    }
    for (const section of doc.sections) {
      expectCheck(
        `${doc.path} ${section}`,
        text.includes(section),
        "present",
        "required section missing"
      );
    }
    if (doc.path === paths.certificationToolingDoc) {
      expectCheck(
        `${doc.path} CI runner draft helper`,
        text.includes("evidence:certification:ci-runner-draft") &&
          text.includes("evidence:certification:ci-runner:promote") &&
          text.includes("approved-ci-runner.draft.json") &&
          text.includes("approved-ci-runner.json"),
        "certification tooling doc links draft intake, promotion, and final reviewed evidence",
        "certification tooling doc must link CI runner draft intake, promotion, and final reviewed evidence"
      );
    }
  }
}

async function validateCliAvailability() {
  const commands = [
    {
      name: "oc",
      args: ["version", "--client"],
      required: false,
      requiredForExternalSubmission: true
    },
    {
      name: "docker",
      args: ["--version"],
      required: false,
      requiredForExternalSubmission: true
    },
    {
      name: "opm",
      args: ["version"],
      required: false,
      requiredForExternalSubmission: true
    },
    {
      name: "operator-sdk",
      args: ["version"],
      required: false,
      requiredForExternalSubmission: true
    },
    {
      name: "podman",
      args: ["--version"],
      required: false,
      requiredForExternalSubmission: false
    }
  ];

  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(command.name, command.args, {
        encoding: "utf8",
        timeout: options.timeoutMs
      });
      const version = sanitize(stdout.trim().split("\n")[0] || "available");
      cli.push({
        name: command.name,
        available: true,
        version,
        requiredForExternalSubmission: command.requiredForExternalSubmission
      });
      pass(`CLI ${command.name}`, version);
    } catch (error) {
      const detail = `${command.name} unavailable locally; static readiness checks still run`;
      cli.push({
        name: command.name,
        available: false,
        version: "unavailable",
        requiredForExternalSubmission: command.requiredForExternalSubmission
      });
      if (command.required) {
        fail(`CLI ${command.name}`, detail);
      } else {
        warn(`CLI ${command.name}`, detail);
      }
    }
  }
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

function hasMeaningfulValue(value) {
  const text = String(value ?? "").trim();
  return Boolean(text) && !/[<>]/.test(text) && !/\b(example|placeholder|todo|changeme|change-ticket|security-ticket|missing|unknown)\b/i.test(text);
}

function hasDigest(value) {
  return /sha256:[a-f0-9]{64}/i.test(String(value ?? ""));
}

function ciRunnerEvidenceTemplateCommands() {
  return [
    "npm run evidence:certification:ci-runner-draft -- --force",
    "review docs/release/evidence/certification/approved-ci-runner.draft.json with release-manager and security-reviewer",
    "npm run evidence:certification:ci-runner:promote -- --promote-reviewed --reviewer <reviewer> --review-ticket <ticket> --force",
    `npm run verify:certification -- --ci-runner-evidence ${options.ciRunnerEvidence}`,
    "npm run verify:catalog-toolchain"
  ];
}

function sanitizeObject(value) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeObject(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeObject(entry)])
    );
  }
  return typeof value === "string" ? sanitize(value) : value;
}

async function loadCiRunnerEvidence(headSha) {
  const evidencePath = options.ciRunnerEvidence;
  const base = {
    path: evidencePath,
    requiredSchema: "cywell.opslens.certification-ci-runner.v0.1",
    status: "missing",
    approved: false,
    sameHead: false,
    mutation: false,
    requiresExplicitApproval: false,
    runner: {
      id: "missing",
      image: "missing",
      imageDigest: "missing",
      approvedBy: "missing",
      ticket: "missing",
      approvedAt: "missing"
    },
    toolVersions: {
      oc: "missing",
      docker: "missing",
      opm: "missing",
      operatorSdk: "missing"
    },
    evidenceArtifacts: {
      certificationReadiness: "missing",
      catalogToolchain: "missing",
      opmValidateLog: "missing",
      operatorSdkBundleValidateLog: "missing",
      operatorSdkScorecardLog: "missing"
    },
    missingEvidence: [],
    nextCommands: ciRunnerEvidenceTemplateCommands(),
    risk: [
      "CI runner evidence can satisfy missing local opm/operator-sdk tooling only when it is approved, digest-pinned, current-head, and includes validation logs.",
      "This verifier never pulls the CI image, logs in to a registry, submits to Partner Connect, or mutates a cluster."
    ],
    rollbackPath: [
      "Remove or replace the approved CI runner evidence if the runner image digest, tooling versions, or approval ticket are invalid.",
      "Rerun certification and catalog toolchain evidence after any CI runner image or toolchain change."
    ]
  };

  let raw;
  try {
    raw = await readFile(resolve(evidencePath), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      warn("approved CI runner evidence", `${evidencePath} is not readable: ${error.message}`);
      return {
        ...base,
        status: "invalid",
        missingEvidence: [`${evidencePath} is not readable: ${sanitize(error.message)}`]
      };
    }
    return {
      ...base,
      missingEvidence: [
        `approved CI runner evidence is missing at ${evidencePath}`
      ]
    };
  }

  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch (error) {
    warn("approved CI runner evidence", `${evidencePath} is not valid JSON: ${error.message}`);
    return {
      ...base,
      status: "invalid",
      missingEvidence: [`${evidencePath} is not valid JSON: ${sanitize(error.message)}`]
    };
  }

  const sanitized = sanitizeObject(artifact);
  const ref = sanitized.ref ?? {};
  const runner = sanitized.runner ?? {};
  const toolVersions = sanitized.toolVersions ?? {};
  const evidenceArtifacts = sanitized.evidenceArtifacts ?? {};
  const sameHead = ref.headSha === headSha || sanitized.headSha === headSha;
  const missingEvidence = [];

  if (sanitized.schema !== base.requiredSchema && sanitized.artifactType !== "opslens.certification-ci-runner.v0.1") {
    missingEvidence.push(`schema must be ${base.requiredSchema}`);
  }
  if (!sameHead) {
    missingEvidence.push(`runner evidence headSha must match current head ${headSha}`);
  }
  if (!hasMeaningfulValue(runner.id)) missingEvidence.push("runner.id is required");
  if (!hasMeaningfulValue(runner.image)) missingEvidence.push("runner.image is required");
  if (!hasDigest(runner.imageDigest)) missingEvidence.push("runner.imageDigest must include sha256 digest");
  if (!hasMeaningfulValue(runner.approvedBy)) missingEvidence.push("runner.approvedBy is required");
  if (!hasMeaningfulValue(runner.ticket)) missingEvidence.push("runner.ticket is required");
  if (!hasMeaningfulValue(runner.approvedAt) || Number.isNaN(Date.parse(runner.approvedAt))) {
    missingEvidence.push("runner.approvedAt must be an ISO timestamp");
  }
  for (const tool of ["oc", "docker", "opm", "operatorSdk"]) {
    if (!hasMeaningfulValue(toolVersions[tool])) {
      missingEvidence.push(`toolVersions.${tool} is required`);
    }
  }
  for (const field of [
    "certificationReadiness",
    "catalogToolchain",
    "opmValidateLog",
    "operatorSdkBundleValidateLog",
    "operatorSdkScorecardLog"
  ]) {
    if (!hasMeaningfulValue(evidenceArtifacts[field])) {
      missingEvidence.push(`evidenceArtifacts.${field} is required`);
    }
  }
  if (sanitized.mutation !== false) {
    missingEvidence.push("mutation must be false for the CI runner evidence lane");
  }

  if (missingEvidence.length > 0) {
    warn("approved CI runner evidence", `${evidencePath} is present but not ready: ${missingEvidence.join("; ")}`);
  } else {
    pass("approved CI runner evidence", `${evidencePath} is approved and current-head`);
  }

  return {
    ...base,
    status: missingEvidence.length === 0 ? "ready" : "needs-evidence",
    approved: missingEvidence.length === 0,
    sameHead,
    mutation: sanitized.mutation === true,
    runner: {
      id: sanitize(runner.id ?? "missing"),
      image: sanitize(runner.image ?? "missing"),
      imageDigest: sanitize(runner.imageDigest ?? "missing"),
      approvedBy: sanitize(runner.approvedBy ?? "missing"),
      ticket: sanitize(runner.ticket ?? "missing"),
      approvedAt: sanitize(runner.approvedAt ?? "missing")
    },
    toolVersions: {
      oc: sanitize(toolVersions.oc ?? "missing"),
      docker: sanitize(toolVersions.docker ?? "missing"),
      opm: sanitize(toolVersions.opm ?? "missing"),
      operatorSdk: sanitize(toolVersions.operatorSdk ?? "missing")
    },
    evidenceArtifacts: {
      certificationReadiness: sanitize(evidenceArtifacts.certificationReadiness ?? "missing"),
      catalogToolchain: sanitize(evidenceArtifacts.catalogToolchain ?? "missing"),
      opmValidateLog: sanitize(evidenceArtifacts.opmValidateLog ?? "missing"),
      operatorSdkBundleValidateLog: sanitize(evidenceArtifacts.operatorSdkBundleValidateLog ?? "missing"),
      operatorSdkScorecardLog: sanitize(evidenceArtifacts.operatorSdkScorecardLog ?? "missing")
    },
    missingEvidence,
    nextCommands:
      missingEvidence.length === 0
        ? [
            `npm run verify:certification -- --ci-runner-evidence ${evidencePath}`,
            "npm run verify:catalog-toolchain",
            "npm run verify:release-refresh -- --live-timeout-ms 30000"
          ]
        : ciRunnerEvidenceTemplateCommands()
  };
}

async function loadCommunitySubmissionEvidence(headSha) {
  const base = {
    path: paths.communitySubmissionEvidence,
    requiredSchema: "cywell.opslens.community-operator-submission.v0.1",
    status: "missing",
    ready: false,
    sameHead: false,
    worktreeClean: false,
    sourceBundleParityPassed: false,
    externalSubmissionAttempted: false,
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    missingEvidence: [],
    nextCommands: [
      "npm run verify:community-submission",
      "npm run verify:certification"
    ]
  };

  let raw;
  try {
    raw = await readFile(resolve(paths.communitySubmissionEvidence), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      warn(
        "Community Operator submission draft",
        `${paths.communitySubmissionEvidence} is not readable: ${error.message}`
      );
      return {
        ...base,
        status: "invalid",
        missingEvidence: [
          `${paths.communitySubmissionEvidence} is not readable: ${sanitize(error.message)}`
        ]
      };
    }
    warn(
      "Community Operator submission draft",
      `${paths.communitySubmissionEvidence} is missing; run npm run verify:community-submission`
    );
    return {
      ...base,
      missingEvidence: [
        `Community Operator submission draft is missing at ${paths.communitySubmissionEvidence}`
      ]
    };
  }

  let artifact;
  try {
    artifact = sanitizeObject(JSON.parse(raw));
  } catch (error) {
    warn(
      "Community Operator submission draft",
      `${paths.communitySubmissionEvidence} is not valid JSON: ${error.message}`
    );
    return {
      ...base,
      status: "invalid",
      missingEvidence: [
        `${paths.communitySubmissionEvidence} is not valid JSON: ${sanitize(error.message)}`
      ]
    };
  }

  const ref = artifact.ref ?? {};
  const sameHead = ref.headSha === headSha || artifact.headSha === headSha;
  const worktreeClean = ref.worktreeDirty === false || artifact.worktreeDirty === false;
  const sourceBundleParityPassed =
    Array.isArray(artifact.sourceBundleParity) &&
    artifact.sourceBundleParity.length > 0 &&
    artifact.sourceBundleParity.every((entry) => entry.match === true);
  const missingEvidence = [];

  if (artifact.schema !== base.requiredSchema && artifact.artifactType !== "opslens.community-operator-submission.v0.1") {
    missingEvidence.push(`schema must be ${base.requiredSchema}`);
  }
  if (artifact.status !== "PASS") {
    missingEvidence.push(`Community Operator submission draft status=${artifact.status ?? "missing"}`);
  }
  if (!sameHead) {
    missingEvidence.push(`Community Operator submission draft headSha must match current head ${headSha}`);
  }
  if (!worktreeClean) {
    missingEvidence.push("Community Operator submission draft must be generated from a clean worktree");
  }
  if (!sourceBundleParityPassed) {
    missingEvidence.push("Community Operator submission draft must prove source bundle parity");
  }
  for (const [field, value] of [
    ["externalSubmissionAttempted", artifact.externalSubmissionAttempted],
    ["registryMutationAttempted", artifact.registryMutationAttempted],
    ["clusterMutationAttempted", artifact.clusterMutationAttempted],
    ["mutationAllowedByThisVerifier", artifact.mutationAllowedByThisVerifier]
  ]) {
    if (value === true) {
      missingEvidence.push(`${field} must remain false`);
    }
  }

  if (missingEvidence.length > 0) {
    warn(
      "Community Operator submission draft",
      `${paths.communitySubmissionEvidence} is present but not ready: ${missingEvidence.join("; ")}`
    );
  } else {
    pass(
      "Community Operator submission draft",
      `${paths.communitySubmissionEvidence} is PASS and current-head`
    );
  }

  return {
    ...base,
    status: artifact.status ?? "missing",
    ready: missingEvidence.length === 0,
    sameHead,
    worktreeClean,
    sourceBundleParityPassed,
    externalSubmissionAttempted: artifact.externalSubmissionAttempted === true,
    registryMutationAttempted: artifact.registryMutationAttempted === true,
    clusterMutationAttempted: artifact.clusterMutationAttempted === true,
    mutationAllowedByThisVerifier: artifact.mutationAllowedByThisVerifier === true,
    submissionLayout: artifact.submissionLayout ?? {},
    firstSubmissionActions: artifact.firstSubmissionActions ?? [],
    readOnlyCommands: artifact.readOnlyCommands ?? [],
    approvalGatedCommands: artifact.approvalGatedCommands ?? [],
    missingEvidence,
    nextCommands:
      missingEvidence.length === 0
        ? [
            "npm run verify:certification",
            "npm run verify:release-refresh -- --live-timeout-ms 30000"
          ]
        : base.nextCommands
  };
}

function statusFromChecks(toolingHandoff) {
  if (checks.some((check) => check.status === "FAIL")) return "FAILED";
  const ciRunnerReady = toolingHandoff.runnerEvidence?.status === "ready";
  const requiredToolingMissing =
    toolingHandoff.missingRequiredTools.length > 0 && !ciRunnerReady;
  const unresolvedWarnings = checks.some(
    (check) =>
      check.status === "WARN" &&
      !(
        ciRunnerReady &&
        /^CLI (oc|docker|opm|operator-sdk)$/.test(check.name)
      )
  );
  if (requiredToolingMissing || unresolvedWarnings) {
    return "NEEDS_TOOLING";
  }
  return "READY_FOR_REVIEW";
}

function firstSubmissionGapCommand(gap) {
  const normalized = gap.toLowerCase();
  if (/community operator|operatorhub|submission draft|submission tree|source bundle parity/.test(normalized)) {
    return "npm run verify:community-submission";
  }
  if (
    /opm|operator-sdk|ci runner|runner evidence|tooling/.test(normalized)
  ) {
    return "npm run verify:certification";
  }
  if (/catalog|fbc|bundle|scorecard/.test(normalized)) {
    return "npm run verify:catalog-toolchain";
  }
  if (/release|security|sbom|provenance|external runtime|image/.test(normalized)) {
    return "npm run verify:release-refresh -- --skip-image-build --live-timeout-ms 30000";
  }
  return "npm run verify:certification";
}

function buildFirstSubmissionActions(toolingHandoff, missingEvidence) {
  const uniqueGaps = [...new Set(missingEvidence.map(sanitize).filter(Boolean))];
  const blockedBy = uniqueGaps.length
    ? uniqueGaps
    : toolingHandoff.missingRequiredTools.map(
        (tool) => `${tool} CLI readiness must be recorded`
      );
  const preflightGaps = uniqueGaps.slice(0, 3).map((gap, index) => ({
    id: `certification-submission-gap-${index + 1}`,
    owner: "release-manager",
    phase: "submission-preflight",
    status: /opm|operator-sdk|tooling|ci runner/i.test(gap)
      ? "needs-tooling"
      : "needs-evidence",
    request:
      "Resolve the current Community/Certified Operator submission gap with read-only evidence before external submission review.",
    evidenceNeeded: gap,
    nextCommand: firstSubmissionGapCommand(gap),
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy: [gap],
    rollbackPath:
      "No rollback is required because this preflight only regenerates local certification evidence."
  }));
  const preflightStatus =
    toolingHandoff.status === "ready-for-validation" && blockedBy.length === 0
      ? "ready-for-review"
      : toolingHandoff.status;
  const communityPreflight = {
    id: "community-operator-preflight",
    owner: "release-manager",
    phase: "community-operator-preflight",
    status: preflightStatus,
    request:
      "Verify Community Operator packaging, bundle, FBC, scorecard, repository, and maintainer evidence before an external OperatorHub pull request.",
    evidenceNeeded:
      "Current-head Community Operator packaging checks plus local or approved-CI opm/operator-sdk validation output.",
    nextCommand: "npm run verify:certification",
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy,
    rollbackPath:
      "Fix local manifests or docs and rerun certification evidence; no external submission rollback is needed before approval."
  };
  const certifiedPreflight = {
    id: "certified-operator-preflight",
    owner: "release-manager",
    phase: "certified-operator-preflight",
    status: preflightStatus,
    request:
      "Verify Certified Operator release evidence, image security, provenance, support, and runtime evidence before Partner Connect review.",
    evidenceNeeded:
      "Current-head release evidence bundle, security/SBOM/provenance evidence, external runtime review, and explicit approvals.",
    nextCommand: "npm run verify:release-evidence-bundle",
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy,
    rollbackPath:
      "Regenerate the release bundle after fixing evidence gaps; do not submit Certified Operator materials until approvals are explicit."
  };
  const gatedSubmissionActions = toolingHandoff.approvalGatedCommands.map(
    (command) => ({
      id: `approval-gated-${command.id}`,
      owner: "release-manager",
      phase: command.phase,
      status: "approval-gated",
      request: `Do not run ${command.id} until Community/Certified Operator evidence and release approvals are explicit.`,
      evidenceNeeded:
        "READY_FOR_REVIEW certification readiness, current-head release evidence bundle, security approval, runtime approval, registry approval, and product-owner approval.",
      nextCommand: command.command,
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true,
      blockedBy,
      rollbackPath:
        "Withdraw, supersede, or update the external submission through the approved Red Hat submission workflow if the wrong bundle, digest, or approval set was used."
    })
  );

  return [
    ...preflightGaps,
    communityPreflight,
    certifiedPreflight,
    ...gatedSubmissionActions
  ];
}

function uniqueSanitized(values) {
  return Array.from(new Set(values.map(sanitize).filter(Boolean)));
}

function ticketActionFromCommand(command, fallbackId, status, extra = {}) {
  return {
    id: sanitize(command?.id ?? fallbackId),
    status,
    nextCommand: sanitize(command?.command ?? "none"),
    mutation: command?.mutation === true,
    requiresExplicitApproval: command?.requiresExplicitApproval === true,
    ...extra
  };
}

function buildCertificationToolingTicketPacket(toolingHandoff) {
  const firstReadOnly =
    toolingHandoff.readOnlyCommands.find(
      (command) => command.id === "refresh-certification-evidence"
    ) ?? toolingHandoff.readOnlyCommands[0];
  const firstSetup =
    toolingHandoff.setupCommands.find((command) => command.id === "install-opm") ??
    toolingHandoff.setupCommands[0];
  const firstApproval =
    toolingHandoff.approvalGatedCommands.find(
      (command) => command.id === "partner-connect-submit"
    ) ?? toolingHandoff.approvalGatedCommands[0];
  const blockedBy = uniqueSanitized([
    ...toolingHandoff.missingRequiredTools.map((tool) => `${tool} CLI unavailable on PATH`),
    ...(toolingHandoff.runnerEvidence?.missingEvidence ?? []),
    ...toolingHandoff.executionLanes.flatMap((lane) => lane.blockedBy ?? [])
  ]);
  const evidenceChecklist = uniqueSanitized([
    `toolingStatus=${toolingHandoff.status}`,
    `toolingSatisfiedBy=${toolingHandoff.toolingSatisfiedBy}`,
    `missingRequiredTools=${toolingHandoff.missingRequiredTools.join(",") || "none"}`,
    `runnerEvidence=${toolingHandoff.runnerEvidence?.status ?? "missing"}`,
    `runnerEvidencePath=${toolingHandoff.runnerEvidence?.path ?? options.ciRunnerEvidence}`,
    "approved CI runner evidence must be digest-pinned, current-head, approved, and include opm/operator-sdk validation logs",
    "local workstation tooling must provide opm validate, operator-sdk bundle validate, and scorecard evidence before external submission",
    "Partner Connect or OperatorHub submission remains approval-gated and not run by this verifier"
  ]);

  return {
    id: "release-manager-certification-tooling-ticket",
    owner: "release-manager",
    title: "Provide approved opm/operator-sdk tooling or current-head CI runner evidence",
    severity: "high",
    classification:
      toolingHandoff.runnerEvidence?.status === "ready"
        ? "approved-ci-runner-ready"
        : toolingHandoff.missingRequiredTools.length > 0
          ? "missing-local-tooling"
          : "certification-validation-required",
    toolingStatus: toolingHandoff.status,
    toolingSatisfiedBy: toolingHandoff.toolingSatisfiedBy,
    runnerEvidenceStatus: toolingHandoff.runnerEvidence?.status ?? "missing",
    runnerEvidencePath: toolingHandoff.runnerEvidence?.path ?? options.ciRunnerEvidence,
    finalEvidencePath: options.ciRunnerEvidence,
    missingRequiredTools: toolingHandoff.missingRequiredTools.map(sanitize),
    evidenceChecklist,
    firstReadOnlyAction: ticketActionFromCommand(
      firstReadOnly,
      "refresh-certification-evidence",
      "needs-tooling"
    ),
    setupAction: ticketActionFromCommand(firstSetup, "install-certification-tooling", "human-setup", {
      requiresHumanApproval: firstSetup?.requiresHumanApproval !== false
    }),
    approvalGatedAction: ticketActionFromCommand(
      firstApproval,
      "partner-connect-submit",
      "approval-gated"
    ),
    nextCommands: uniqueSanitized([
      firstReadOnly?.command,
      firstSetup?.command,
      ...(toolingHandoff.runnerEvidence?.nextCommands ?? []),
      ...(toolingHandoff.nextCommands ?? []),
      firstApproval?.command
    ]),
    blockedBy,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      toolingInstallRequiresHumanApproval: true,
      externalSubmissionRequiresExplicitApproval: true
    },
    risk:
      "Missing or unapproved opm/operator-sdk tooling can make Community/Certified Operator validation drift from the release evidence bundle.",
    rollbackPath:
      "No rollback is required because this packet writes only local evidence; replace invalid tooling or CI runner evidence and rerun certification/catalog checks."
  };
}

function buildReleaseManagerToolingPacket(toolingHandoff) {
  const ticket = toolingHandoff.ticketPacket;
  return {
    owner: "release-manager",
    markdownPath: resolve(options.toolingMarkdownOut),
    exists: true,
    ticketId: ticket?.id ?? "release-manager-certification-tooling-ticket",
    status: toolingHandoff.status,
    toolingSatisfiedBy: toolingHandoff.toolingSatisfiedBy,
    missingRequiredTools: toolingHandoff.missingRequiredTools.map(sanitize),
    runnerEvidenceStatus: toolingHandoff.runnerEvidence?.status ?? "missing",
    runnerEvidencePath:
      toolingHandoff.runnerEvidence?.path ?? options.ciRunnerEvidence,
    firstReadOnlyActionId:
      ticket?.firstReadOnlyAction?.id ?? "refresh-certification-evidence",
    setupActionIds: toolingHandoff.setupCommands.map((command) => command.id),
    approvalGatedActionIds: toolingHandoff.approvalGatedCommands.map(
      (command) => command.id
    ),
    credentialStoredByVerifier: false,
    externalSubmissionExecutedByVerifier: false,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      toolingInstallRequiresHumanApproval: true,
      externalSubmissionRequiresExplicitApproval: true
    }
  };
}

function toolingMarkdownFor(artifact) {
  const handoff = artifact.toolingHandoff;
  const packet = handoff.releaseManagerPacket;
  const ticket = handoff.ticketPacket;
  const draftEvidencePath = options.ciRunnerEvidence.replace(
    /\.json$/i,
    ".draft.json"
  );
  const lines = [
    "# Cywell OpsLens Certification Tooling Release Manager Packet",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Git: ${artifact.ref.branch} ${artifact.ref.headSha} dirty=${artifact.ref.worktreeDirty}`,
    `Status: ${artifact.status}`,
    "",
    "## Tooling Summary",
    "",
    `- Owner: ${packet.owner}`,
    `- Ticket: ${packet.ticketId}`,
    `- Tooling status: ${packet.status}`,
    `- Tooling satisfied by: ${packet.toolingSatisfiedBy}`,
    `- Missing required tools: ${packet.missingRequiredTools.join(", ") || "none"}`,
    `- Runner evidence status: ${packet.runnerEvidenceStatus}`,
    `- Runner evidence path: ${packet.runnerEvidencePath}`,
    `- First read-only action: ${packet.firstReadOnlyActionId}`,
    "",
    "## Runner Evidence",
    "",
    `- Approved: ${String(handoff.runnerEvidence.approved)}`,
    `- Same head: ${String(handoff.runnerEvidence.sameHead)}`,
    `- Mutation: ${String(handoff.runnerEvidence.mutation)}`,
    `- Required schema: ${handoff.runnerEvidence.requiredSchema}`,
    `- Draft path: ${draftEvidencePath}`,
    `- Final path: ${handoff.runnerEvidence.path}`,
    "",
    "## Next Commands",
    "",
    ...ticket.nextCommands.map((command) => `- ${command}`),
    "",
    "## Human Setup",
    "",
    ...handoff.setupCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} requiresHumanApproval=${String(command.requiresHumanApproval)}`
    ),
    "",
    "## Approval-gated Submission",
    "",
    ...handoff.approvalGatedCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} mutation=${String(command.mutation)} requiresExplicitApproval=${String(command.requiresExplicitApproval)}`
    ),
    "",
    "## Boundary",
    "",
    `- clusterMutationAttempted=${String(packet.mutationBoundary.clusterMutationAttempted)}`,
    `- registryMutationAttempted=${String(packet.mutationBoundary.registryMutationAttempted)}`,
    `- mutationAllowedByThisVerifier=${String(packet.mutationBoundary.mutationAllowedByThisVerifier)}`,
    `- toolingInstallRequiresHumanApproval=${String(packet.mutationBoundary.toolingInstallRequiresHumanApproval)}`,
    `- externalSubmissionRequiresExplicitApproval=${String(packet.mutationBoundary.externalSubmissionRequiresExplicitApproval)}`,
    "- This packet does not install opm/operator-sdk, submit to Partner Connect or OperatorHub, login to registries, push images, mirror images, sign artifacts, apply, delete, or scale.",
    "",
    "## Blocked By",
    "",
    ...(ticket.blockedBy.length ? ticket.blockedBy.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Rollback Path",
    "",
    ...artifact.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

function buildToolingHandoff(ciRunnerEvidence) {
  const requiredTools = cli
    .filter((entry) => entry.requiredForExternalSubmission)
    .map((entry) => ({
      name: entry.name,
      available: entry.available,
      version: entry.version,
      requiredForExternalSubmission: entry.requiredForExternalSubmission
    }));
  const missingRequiredTools = requiredTools
    .filter((entry) => !entry.available)
    .map((entry) => entry.name);
  const requiredToolNames = requiredTools.map((entry) => entry.name);
  const toolingReady = missingRequiredTools.length === 0;
  const ciRunnerReady = ciRunnerEvidence.status === "ready";
  const toolingSatisfiedBy = toolingReady
    ? "local-workstation"
    : ciRunnerReady
      ? "approved-ci-image"
      : "missing";

  const handoff = {
    actionMode: "humanSetupOnly",
    status: toolingReady || ciRunnerReady ? "ready-for-validation" : "needs-tooling",
    toolingSatisfiedBy,
    requiredTools,
    missingRequiredTools,
    runnerEvidence: ciRunnerEvidence,
    freshnessPolicy: {
      requiredHead: "current Git HEAD",
      worktreeRequirement: "clean worktree before Community or Certified Operator submission",
      rerunAfter: [
        "tooling change",
        "bundle or catalog manifest change",
        "release image digest change",
        "external runtime evidence change"
      ]
    },
    executionLanes: [
      {
        id: "local-workstation",
        owner: "release-manager",
        status: toolingReady ? "ready-for-validation" : "blocked-by-missing-tooling",
        purpose: "Run local read-only certification and catalog validation from an approved release workstation.",
        requiredTools: requiredToolNames,
        requiredEvidence: [
          "CLI versions recorded in certification readiness evidence",
          "opm validate deploy/catalog/fbc output",
          "operator-sdk bundle validate output",
          "operator-sdk scorecard output",
          "current-head npm run verify:certification and verify:catalog-toolchain artifacts"
        ],
        blockedBy: missingRequiredTools.map((tool) => `${tool} CLI unavailable on PATH`),
        nextCommands: toolingReady
          ? [
              "opm validate deploy/catalog/fbc",
              "operator-sdk bundle validate ./deploy/operator/bundle --select-optional suite=operatorframework",
              "operator-sdk scorecard ./deploy/operator/bundle",
              "npm run verify:certification"
            ]
          : [
              "review docs/release/cywell-opslens-certification-tooling.md",
              "install missing certification tooling through an approved release-manager path",
              "npm run verify:certification"
            ],
        mutation: false,
        requiresExplicitApproval: false
      },
      {
        id: "approved-ci-image",
        owner: "release-manager",
        status: ciRunnerReady ? "ready-for-validation" : "needs-evidence",
        purpose: "Use an approved CI image or runner when a local workstation cannot provide trusted opm/operator-sdk tooling.",
        requiredTools: requiredToolNames,
        requiredEvidence: [
          "approved CI image or runner digest",
          "tool versions captured from the CI lane",
          "current-head certification and catalog toolchain artifacts exported by the CI lane"
        ],
        blockedBy: ciRunnerReady ? [] : ciRunnerEvidence.missingEvidence,
        nextCommands: ciRunnerReady
          ? ciRunnerEvidence.nextCommands
          : ciRunnerEvidence.nextCommands,
        mutation: false,
        requiresExplicitApproval: false
      },
      {
        id: "hosted-certification-pipeline",
        owner: "release-manager",
        status: "approval-gated",
        purpose: "Submit externally only after local or CI readiness reaches READY_FOR_REVIEW and release evidence is complete.",
        requiredTools: ["opm", "operator-sdk"],
        requiredEvidence: [
          "READY_FOR_REVIEW certification readiness artifact",
          "current-head release evidence bundle",
          "security, SBOM, provenance, and external runtime evidence",
          "explicit release-manager and security-reviewer approval"
        ],
        blockedBy: [
          ...(toolingReady || ciRunnerReady ? [] : ["local or CI certification tooling readiness is not complete"]),
          "release publish, security, and external runtime evidence must be approved before external submission"
        ],
        nextCommands: [
          "do not submit to Partner Connect or OperatorHub from this verifier",
          "refresh npm run verify:release-refresh -- --live-timeout-ms 30000 before external review"
        ],
        mutation: true,
        requiresExplicitApproval: true
      }
    ],
    readOnlyCommands: [
      {
        id: "check-oc-version",
        phase: "tool-version",
        command: "oc version --client",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "check-docker-version",
        phase: "tool-version",
        command: "docker --version",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "check-opm-version",
        phase: "tool-version",
        command: "opm version",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "check-operator-sdk-version",
        phase: "tool-version",
        command: "operator-sdk version",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "validate-fbc",
        phase: "certification-validation",
        command: "opm validate deploy/catalog/fbc",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "validate-bundle",
        phase: "certification-validation",
        command: "operator-sdk bundle validate ./deploy/operator/bundle --select-optional suite=operatorframework",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "run-scorecard",
        phase: "certification-validation",
        command: "operator-sdk scorecard ./deploy/operator/bundle",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "refresh-certification-evidence",
        phase: "evidence-refresh",
        command: "npm run verify:certification",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "refresh-community-submission-draft",
        phase: "community-operator-preflight",
        command: "npm run verify:community-submission",
        mutation: false,
        requiresNetwork: false
      },
      {
        id: "refresh-catalog-toolchain-evidence",
        phase: "evidence-refresh",
        command: "npm run verify:catalog-toolchain",
        mutation: false,
        requiresNetwork: false
      }
    ],
    setupCommands: [
      {
        id: "install-opm",
        phase: "human-setup",
        command: "install opm matching the target OpenShift/OLM toolchain through an approved release-manager workstation or CI image",
        mutation: false,
        requiresNetwork: true,
        requiresHumanApproval: true
      },
      {
        id: "install-operator-sdk",
        phase: "human-setup",
        command: "install operator-sdk matching the target Operator SDK release through an approved release-manager workstation or CI image",
        mutation: false,
        requiresNetwork: true,
        requiresHumanApproval: true
      }
    ],
    approvalGatedCommands: [
      {
        id: "partner-connect-submit",
        phase: "external-submission",
        command: "submit reviewed certification bundle through Red Hat Partner Connect",
        mutation: true,
        requiresExplicitApproval: true
      },
      {
        id: "operatorhub-submit",
        phase: "external-submission",
        command: "submit reviewed OperatorHub/community catalog pull request or certified listing package",
        mutation: true,
        requiresExplicitApproval: true
      }
    ],
    nextCommands:
      missingRequiredTools.length > 0
        ? [
            "review docs/release/cywell-opslens-certification-tooling.md",
            ciRunnerReady
              ? `use approved CI runner evidence from ${ciRunnerEvidence.path}`
              : "install opm and operator-sdk through an approved release-manager path or provide approved CI runner evidence",
            "npm run verify:certification",
            "npm run verify:catalog-toolchain"
          ]
        : [
            "opm validate deploy/catalog/fbc",
            "operator-sdk bundle validate ./deploy/operator/bundle --select-optional suite=operatorframework",
            "operator-sdk scorecard ./deploy/operator/bundle",
            "npm run verify:release-refresh -- --live-timeout-ms 30000"
          ],
    risk: [
      "Tool versions must match the target OpenShift/OLM release pipeline or local validation can drift from hosted certification results.",
      "Installing downloaded binaries, registry credentials, or Partner Connect tooling is a human setup task and is not performed by this verifier.",
      "External submission remains blocked until release images, runtime evidence, scan/SBOM/provenance, and approval evidence are complete."
    ],
    rollbackPath: [
      "Remove unapproved tooling from the workstation or CI image if version or provenance review fails.",
      "Regenerate certification and catalog toolchain evidence after any tooling change.",
      "Do not submit to Partner Connect or OperatorHub from this handoff artifact."
    ]
  };

  const ticketPacket = buildCertificationToolingTicketPacket(handoff);
  const toolingHandoff = {
    ...handoff,
    ticketPacket
  };
  return {
    ...toolingHandoff,
    releaseManagerPacket: buildReleaseManagerToolingPacket(toolingHandoff)
  };
}

async function writeEvidence() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  const ciRunnerEvidence = await loadCiRunnerEvidence(headSha);
  const communitySubmission = await loadCommunitySubmissionEvidence(headSha);
  const toolingHandoff = buildToolingHandoff(ciRunnerEvidence);
  expectCheck(
    "certification tooling execution lanes",
    toolingHandoff.executionLanes.some((lane) => lane.id === "local-workstation") &&
      toolingHandoff.executionLanes.some((lane) => lane.id === "approved-ci-image") &&
      toolingHandoff.executionLanes.some((lane) => lane.id === "hosted-certification-pipeline"),
    "local-workstation, approved-ci-image, and hosted-certification-pipeline lanes are declared",
    "certification tooling handoff must declare local, CI, and hosted certification lanes"
  );
  expectCheck(
    "certification tooling lane mutation boundary",
    toolingHandoff.executionLanes.every(
      (lane) => lane.mutation !== true || lane.requiresExplicitApproval === true
    ),
    "mutating execution lanes require explicit approval",
    "mutating execution lanes must require explicit approval"
  );
  expectCheck(
    "certification tooling ticket packet",
    toolingHandoff.ticketPacket?.firstReadOnlyAction?.mutation === false &&
      toolingHandoff.ticketPacket?.setupAction?.requiresHumanApproval === true &&
      toolingHandoff.ticketPacket?.approvalGatedAction?.mutation === true &&
      toolingHandoff.ticketPacket?.approvalGatedAction?.requiresExplicitApproval === true,
    `ticket=${toolingHandoff.ticketPacket?.id ?? "missing"} first=${toolingHandoff.ticketPacket?.firstReadOnlyAction?.id ?? "missing"} setup=${toolingHandoff.ticketPacket?.setupAction?.id ?? "missing"} approval=${toolingHandoff.ticketPacket?.approvalGatedAction?.id ?? "missing"}`,
    "certification tooling ticket packet must separate read-only evidence, human setup, and approval-gated submission"
  );
  const missingEvidence = [
    ...(ciRunnerEvidence.status === "ready"
      ? []
      : cli
          .filter((entry) => entry.requiredForExternalSubmission && !entry.available)
          .map((entry) => `${entry.name} CLI is required before Community/Certified Operator submission`)),
    ...(toolingHandoff.missingRequiredTools.length > 0 && ciRunnerEvidence.status !== "ready"
      ? ciRunnerEvidence.missingEvidence
      : []),
    ...(communitySubmission.ready ? [] : communitySubmission.missingEvidence),
    ...checks
      .filter((check) => check.status === "WARN")
      .map((check) => `${check.name}: ${check.detail}`)
  ].map(sanitize);
  const firstSubmissionActions = buildFirstSubmissionActions(
    toolingHandoff,
    missingEvidence
  );
  expectCheck(
    "certification first submission read-only preflight",
    firstSubmissionActions.some(
      (action) =>
        action.mutation === false &&
        action.requiresExplicitApproval === false &&
        /verify:certification/.test(action.nextCommand)
    ),
    "first submission actions include a read-only certification preflight",
    "first submission actions must include a read-only certification preflight"
  );
  expectCheck(
    "certification first submission approval gate",
    firstSubmissionActions.some(
      (action) =>
        action.id.startsWith("approval-gated-") &&
        action.mutation === true &&
        action.requiresExplicitApproval === true
    ),
    "first submission actions include approval-gated external submission",
    "first submission actions must keep external submission approval-gated"
  );
  expectCheck(
    "certification first submission mutation boundary",
    firstSubmissionActions.every(
      (action) => action.mutation !== true || action.requiresExplicitApproval === true
    ),
    "mutating first submission actions require explicit approval",
    "mutating first submission actions must require explicit approval"
  );
  const status = statusFromChecks(toolingHandoff);
  const artifact = {
    schema: "cywell.opslens.certification-readiness.v0.1",
    artifactType: "opslens.certification-readiness.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "certificationReadinessOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    gates: {
      internalCatalog: checks.filter((check) =>
        /CSV|bundle|FBC|CatalogSource|Subscription|scorecard|catalog Dockerfile/i.test(check.name)
      ),
      communityOperator: checks.filter((check) =>
        /FBC|bundle|scorecard|repository|maintainer|release gate/i.test(check.name)
      ),
      certifiedOperator: checks.filter((check) =>
        /features\.operators|com\.redhat|Security Controls|Certified|CLI opm|CLI operator-sdk|CLI docker|CLI oc/i.test(check.name)
      )
    },
    cli,
    toolingHandoff,
    communitySubmission,
    firstSubmissionActions,
    documents: {
      security: paths.securityDoc,
      support: paths.supportDoc,
      certificationTooling: paths.certificationToolingDoc,
      releaseGates: paths.releaseGates,
      ragApprovalQueue: paths.ragApprovalQueueDoc
    },
    missingEvidence,
    risk: [
      "This verifier proves local catalog/certification packaging shape only; it does not submit to Partner Connect or OperatorHub.",
      "Missing opm/operator-sdk tooling prevents local bundle validation, scorecard, and hosted-pipeline parity before external submission.",
      "All related images still require release evidence, vulnerability/SBOM/provenance evidence, and external runtime certification evidence before Certified Operator approval."
    ],
    rollbackPath: [
      "No rollback is required because this verifier reads local manifests/docs and writes local evidence only.",
      "If a packaging check fails, fix the referenced YAML or documentation and rerun npm run verify:certification.",
      "Keep release publish and install plans in NEEDS_EVIDENCE until certification and release evidence are refreshed on the same Git head."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const toolingMarkdown = toolingMarkdownFor(artifact);
  const secretLikePattern =
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+|--token\s+(?!<redacted>)[^\s]+/i;
  if (secretLikePattern.test(serialized) || secretLikePattern.test(toolingMarkdown)) {
    throw new Error("certification readiness evidence would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.toolingMarkdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.toolingMarkdownOut), toolingMarkdown, "utf8");
  pass(
    "certification readiness export",
    `${resolve(options.evidenceOut)} and ${resolve(options.toolingMarkdownOut)} written without secret material`
  );
  return artifact;
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    WARN: 1,
    PASS: 2
  };

  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens certification/catalog readiness: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const csv = await loadSingle(paths.csv);
  const bundleAnnotations = await loadSingle(paths.bundleAnnotations);
  const bundleDockerfile = await readText(paths.bundleDockerfile);
  const fbc = await loadYaml(paths.fbc);
  const catalogDockerfile = await readText(paths.catalogDockerfile);
  const catalogSource = await loadSingle(paths.catalogSource);
  const subscription = await loadSingle(paths.subscription);
  const scorecard = await loadSingle(paths.scorecard);

  validateCsv(csv);
  validateBundleMetadata(bundleAnnotations, bundleDockerfile);
  validateFbc(fbc, csv);
  validateCatalogInstall(catalogDockerfile, catalogSource, subscription);
  validateScorecard(scorecard);
  await validateDocs();
  await validateCliAvailability();
  await writeEvidence();
} catch (error) {
  fail("certification readiness verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
