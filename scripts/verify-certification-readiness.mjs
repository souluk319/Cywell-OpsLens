#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

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
  releaseGates: "docs/release/cywell-opslens-release-gates.md",
  ragApprovalQueueDoc: "docs/rag/cywell-opslens-rag-approval-queue.md"
};

const checks = [];
const yamlCache = new Map();

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
      required: false
    },
    {
      name: "docker",
      args: ["--version"],
      required: false
    },
    {
      name: "opm",
      args: ["version"],
      required: false
    },
    {
      name: "operator-sdk",
      args: ["version"],
      required: false
    },
    {
      name: "podman",
      args: ["--version"],
      required: false
    }
  ];

  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(command.name, command.args, {
        encoding: "utf8",
        timeout: 5000
      });
      pass(`CLI ${command.name}`, stdout.trim().split("\n")[0] || "available");
    } catch (error) {
      const detail = `${command.name} unavailable locally; static readiness checks still run`;
      if (command.required) {
        fail(`CLI ${command.name}`, detail);
      } else {
        warn(`CLI ${command.name}`, detail);
      }
    }
  }
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
} catch (error) {
  fail("certification readiness verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
