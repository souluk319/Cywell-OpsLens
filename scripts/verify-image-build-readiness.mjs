#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const buildImages = args.has("--build");
const localBuildTagSuffix = "build-verify";

const paths = {
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  operatorDockerfile: "deploy/operator/controller-runtime/Dockerfile",
  apiDockerfile: "apps/api/Dockerfile",
  dashboardDockerfile: "apps/web/Dockerfile",
  bundleDockerfile: "deploy/operator/bundle.Dockerfile",
  catalogDockerfile: "deploy/catalog/catalog.Dockerfile",
  dockerignore: ".dockerignore",
  evidenceOut: "test-results/cywell-opslens-image-build-readiness.json"
};

const imageBuilds = [
  {
    name: "operator",
    image: "quay.io/cywell/opslens-operator:0.1.0",
    context: "deploy/operator/controller-runtime",
    dockerfile: paths.operatorDockerfile,
    requiredText: ["go build", "ARG TARGETARCH", "GOARCH=${TARGETARCH}", "USER 65532:65532", "ENTRYPOINT"]
  },
  {
    name: "api",
    image: "quay.io/cywell/opslens-api:0.1.0",
    context: ".",
    dockerfile: paths.apiDockerfile,
    requiredText: ["@kugnus/api", "npm ci", "KUGNUS_API_HOST=0.0.0.0", "EXPOSE 8080 9443", "USER 1001", "COPY --chown=1001:0", "data/runbooks"],
    forbiddenText: ["chown -R", "chmod -R"]
  },
  {
    name: "dashboard",
    image: "quay.io/cywell/opslens-dashboard:0.1.0",
    context: ".",
    dockerfile: paths.dashboardDockerfile,
    requiredText: ["@kugnus/web", "npm ci", "serve", "EXPOSE 8080 9443", "USER 1001", "COPY --chown=1001:0"],
    forbiddenText: ["chown -R", "chmod -R"]
  }
];

const externalImages = new Map([
  ["vllm", "quay.io/cywell/opslens-vllm:0.1.0"],
  ["pgvector", "docker.io/pgvector/pgvector:pg16"]
]);

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

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file exists", `${path} is not readable: ${error.message}`);
    return "";
  }
}

async function readExistingImageEvidence() {
  try {
    const text = await readFile(resolve(paths.evidenceOut), "utf8");
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function loadSingleYaml(path) {
  const text = await readText(path);
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${path}: ${errors.map((error) => error.message).join("; ")}`);
    return undefined;
  }

  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  expectCheck("single YAML document", parsed.length === 1, `${path} contains 1 document`, `${path} expected 1 document, got ${parsed.length}`);
  return parsed[0];
}

function relatedImages(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
}

function localBuildTag(image) {
  return image
    .replace(/^quay\.io\/cywell\//, "cywell/")
    .replace(/^docker\.io\/cywell\//, "cywell/")
    .replace(/:[^:]+$/, `:${localBuildTagSuffix}`);
}

function outputTail(output) {
  return output.trim().slice(-4000);
}

async function validateDockerfile(build, csvImages) {
  const text = await readText(build.dockerfile);
  expectCheck(
    `${build.name} Dockerfile`,
    existsSync(resolve(build.dockerfile)),
    `${build.dockerfile} exists`
  );
  expectCheck(
    `${build.name} related image`,
    csvImages.get(build.name) === build.image,
    build.image,
    `expected CSV relatedImages.${build.name}=${build.image}, got ${csvImages.get(build.name) ?? "missing"}`
  );

  for (const required of build.requiredText) {
    expectCheck(
      `${build.name} Dockerfile contract ${required}`,
      text.includes(required),
      "present",
      "missing"
    );
  }
  for (const forbidden of build.forbiddenText ?? []) {
    expectCheck(
      `${build.name} Dockerfile avoids ${forbidden}`,
      !text.includes(forbidden),
      "absent",
      `${build.dockerfile} must not use ${forbidden}; use COPY --chown plus non-root build steps so image evidence refresh does not spend minutes walking node_modules`
    );
  }

  expectCheck(
    `${build.name} build context`,
    existsSync(resolve(build.context)),
    `${build.context} exists`
  );

  return {
    name: build.name,
    image: build.image,
    localTag: localBuildTag(build.image),
    context: build.context,
    dockerfile: build.dockerfile,
    reproducibleLocally: true
  };
}

async function validateBundleAndCatalog() {
  const bundleDockerfile = await readText(paths.bundleDockerfile);
  const catalogDockerfile = await readText(paths.catalogDockerfile);

  expectCheck(
    "bundle image Dockerfile",
    bundleDockerfile.includes("FROM scratch") &&
      bundleDockerfile.includes("COPY bundle/manifests /manifests/") &&
      bundleDockerfile.includes("COPY bundle/metadata /metadata/"),
    "bundle.Dockerfile copies manifests and metadata into a registry+v1 bundle"
  );
  expectCheck(
    "catalog image Dockerfile",
    catalogDockerfile.includes("opm") &&
      catalogDockerfile.includes("serve") &&
      catalogDockerfile.includes("/configs"),
    "catalog.Dockerfile serves file-based catalog configs"
  );

  return [
    {
      name: "bundle",
      image: "quay.io/cywell/opslens-operator-bundle:0.1.0",
      localTag: `cywell/opslens-operator-bundle:${localBuildTagSuffix}`,
      context: "deploy/operator",
      dockerfile: paths.bundleDockerfile,
      reproducibleLocally: true
    },
    {
      name: "catalog",
      image: "quay.io/cywell/opslens-catalog:0.1.0",
      localTag: `cywell/opslens-catalog:${localBuildTagSuffix}`,
      context: "deploy/catalog",
      dockerfile: paths.catalogDockerfile,
      reproducibleLocally: true
    }
  ];
}

async function validateDockerignore() {
  const text = await readText(paths.dockerignore);
  expectCheck(
    "dockerignore secrets",
    text.includes(".env") && text.includes(".env.*"),
    ".env files are excluded from container build context"
  );
  expectCheck(
    "dockerignore generated artifacts",
    text.includes("test-results") &&
      text.includes("node_modules") &&
      text.includes("apps/*/dist") &&
      text.includes("packages/*/dist"),
    "generated artifacts are excluded from container build context"
  );
}

function validateOperatorGoModuleLock() {
  expectCheck(
    "operator Go module lock",
    existsSync(resolve("deploy/operator/controller-runtime/go.sum")),
    "deploy/operator/controller-runtime/go.sum exists for reproducible manager image builds",
    "deploy/operator/controller-runtime/go.sum is missing; run go mod tidy before building the manager image"
  );
}

async function validateCliAvailability() {
  try {
    const { stdout } = await execFileAsync("docker", ["--version"], {
      encoding: "utf8",
      timeout: 5000
    });
    pass("CLI docker", stdout.trim());
    return true;
  } catch {
    warn("CLI docker", "docker unavailable locally; static image readiness still runs");
    return false;
  }
}

async function runDockerBuild(build) {
  const startedAt = Date.now();
  const commandArgs = [
    "build",
    "-f",
    resolve(build.dockerfile),
    "-t",
    build.localTag,
    resolve(build.context)
  ];

  try {
    const { stdout, stderr } = await execFileAsync("docker", commandArgs, {
      encoding: "utf8",
      timeout: 600000,
      maxBuffer: 20 * 1024 * 1024
    });
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    pass(`${build.name} docker build`, `${build.localTag} built in ${durationSeconds}s`);
    return {
      name: build.name,
      image: build.image,
      localTag: build.localTag,
      dockerfile: build.dockerfile,
      context: build.context,
      status: "PASS",
      durationSeconds,
      outputTail: outputTail(`${stdout}\n${stderr}`)
    };
  } catch (error) {
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const detail = outputTail(`${stdout}\n${stderr}`) || (error instanceof Error ? error.message : String(error));
    const registryAuthGap =
      build.name === "catalog" &&
      detail.includes("registry.redhat.io") &&
      (detail.includes("401 Unauthorized") || detail.includes("failed to authorize"));
    if (registryAuthGap) {
      warn(
        `${build.name} docker build`,
        "registry.redhat.io authentication is required to build the catalog image locally"
      );
      return {
        name: build.name,
        image: build.image,
        localTag: build.localTag,
        dockerfile: build.dockerfile,
        context: build.context,
        status: "WARN",
        durationSeconds,
        blockedBy: "registry.redhat.io authentication",
        outputTail: detail
      };
    }
    fail(`${build.name} docker build`, detail);
    return {
      name: build.name,
      image: build.image,
      localTag: build.localTag,
      dockerfile: build.dockerfile,
      context: build.context,
      status: "FAIL",
      durationSeconds,
      outputTail: detail
    };
  }
}

async function gitValue(args, fallback) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      timeout: 5000
    });
    return stdout.trim().split(/\r?\n/).at(-1) || fallback;
  } catch {
    return fallback;
  }
}

async function gitStatusShort() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      encoding: "utf8",
      timeout: 5000
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function writeEvidence(report) {
  const reportPath = resolve(paths.evidenceOut);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  pass("image readiness evidence export", `${reportPath} written`);
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
  console.log(`Cywell OpsLens image build readiness: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const csv = await loadSingleYaml(paths.csv);
  const csvImages = relatedImages(csv);
  const dockerAvailable = await validateCliAvailability();
  const internalBuilds = [];
  const actualBuilds = [];
  const worktreeStatus = await gitStatusShort();
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
  await validateDockerignore();
  validateOperatorGoModuleLock();

  for (const build of imageBuilds) {
    internalBuilds.push(await validateDockerfile(build, csvImages));
  }

  for (const [name, image] of externalImages.entries()) {
    expectCheck(
      `${name} external image`,
      csvImages.get(name) === image,
      image,
      `expected CSV relatedImages.${name}=${image}, got ${csvImages.get(name) ?? "missing"}`
    );
    warn(
      `${name} image build`,
      `${image} is externally supplied for MVP 0.1; certification evidence is required before Certified Operator submission`
    );
  }

  const packagingBuilds = await validateBundleAndCatalog();
  const allPlannedBuilds = [...internalBuilds, ...packagingBuilds];
  expectCheck(
    "local build tag isolation",
    allPlannedBuilds.every((build) => build.localTag.endsWith(`:${localBuildTagSuffix}`)),
    `actual local image builds use :${localBuildTagSuffix} and do not overwrite CRC lab :verify tags`,
    "actual local image builds must not overwrite CRC lab :verify tags"
  );
  if (buildImages) {
    if (!dockerAvailable) {
      fail("docker build execution", "--build was requested but docker is unavailable");
    } else {
      for (const build of allPlannedBuilds) {
        actualBuilds.push(await runDockerBuild(build));
      }
    }
  } else {
    const previousEvidence = await readExistingImageEvidence();
    const canPreserveActualBuilds =
      previousEvidence?.artifactType === "opslens.image-build-readiness.v0.1" &&
      previousEvidence?.headSha === headSha &&
      previousEvidence?.worktreeDirty === false &&
      previousEvidence?.actualBuildRequested === true &&
      Array.isArray(previousEvidence?.actualBuilds) &&
      previousEvidence.actualBuilds.length > 0 &&
      worktreeStatus.length === 0;
    if (canPreserveActualBuilds) {
      actualBuilds.push(...previousEvidence.actualBuilds);
      pass(
        "image actual build evidence preserved",
        `preserved ${actualBuilds.length} actual build result(s) from current clean head ${headSha}`
      );
    }
  }

  await writeEvidence({
    schema: "cywell.opslens.image-build-readiness.v0.1",
    artifactType: "opslens.image-build-readiness.v0.1",
    generatedAt: new Date().toISOString(),
    branch,
    headSha,
    baseRef,
    worktreeDirty: worktreeStatus.length > 0,
    worktreeStatus: worktreeStatus ? worktreeStatus.split(/\r?\n/) : [],
    status: checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
    dockerAvailable,
    localBuildTagSuffix,
    actualBuildRequested: buildImages || actualBuilds.length > 0,
    actualBuildEvidencePreserved: !buildImages && actualBuilds.length > 0,
    mutationAllowed: false,
    clusterMutationAttempted: false,
    internalBuilds,
    packagingBuilds,
    actualBuilds,
    externalImages: Array.from(externalImages.entries()).map(([name, image]) => ({
      name,
      image,
      certificationEvidenceRequired: true
    })),
    checks
  });
} catch (error) {
  fail("image readiness verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
