#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-certification-readiness.json",
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

  for (const imageName of ["operator", "api", "dashboard", "vllm", "qdrant"]) {
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

function statusFromChecks() {
  if (checks.some((check) => check.status === "FAIL")) return "FAILED";
  const requiredToolingMissing = cli.some(
    (entry) => entry.requiredForExternalSubmission && !entry.available
  );
  if (requiredToolingMissing || checks.some((check) => check.status === "WARN")) {
    return "NEEDS_TOOLING";
  }
  return "READY_FOR_REVIEW";
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
  const status = statusFromChecks();
  const missingEvidence = [
    ...cli
      .filter((entry) => entry.requiredForExternalSubmission && !entry.available)
      .map((entry) => `${entry.name} CLI is required before Community/Certified Operator submission`),
    ...checks
      .filter((check) => check.status === "WARN")
      .map((check) => `${check.name}: ${check.detail}`)
  ].map(sanitize);
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
  if (/Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+|--token\s+(?!<redacted>)[^\s]+/i.test(serialized)) {
    throw new Error("certification readiness evidence would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("certification readiness export", `${resolve(options.evidenceOut)} written without secret material`);
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
