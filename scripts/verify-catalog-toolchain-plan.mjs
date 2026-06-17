#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-catalog-toolchain-plan.json",
  markdownOut: "test-results/cywell-opslens-catalog-toolchain-plan.md",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  fbc: "deploy/catalog/fbc/catalog.yaml",
  catalogDockerfile: "deploy/catalog/catalog.Dockerfile",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  scorecard: "deploy/operator/bundle/tests/scorecard/config.yaml",
  timeoutMs: 10000
};

const catalogBaseImage =
  "registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18";

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
  csv: parsed.get("csv") ?? defaults.csv,
  fbc: parsed.get("fbc") ?? defaults.fbc,
  catalogDockerfile: parsed.get("catalog-dockerfile") ?? defaults.catalogDockerfile,
  catalogSource: parsed.get("catalog-source") ?? defaults.catalogSource,
  subscription: parsed.get("subscription") ?? defaults.subscription,
  scorecard: parsed.get("scorecard") ?? defaults.scorecard,
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

async function cliStatus(name, args) {
  const result = await runCapture(name, args);
  if (result.ok) {
    pass(`CLI ${name}`, result.stdout.split(/\r?\n/)[0] || "available");
  } else {
    warn(`CLI ${name}`, `${name} unavailable or not configured locally`);
  }
  return {
    name,
    available: result.ok,
    version: result.ok ? result.stdout.split(/\r?\n/)[0] || "available" : "missing",
    evidence: result.ok ? result.stdout.slice(0, 200) : result.stderr.slice(0, 200)
  };
}

function authCandidatePaths() {
  const paths = [];
  if (process.env.REGISTRY_AUTH_FILE) paths.push(process.env.REGISTRY_AUTH_FILE);
  if (process.env.DOCKER_CONFIG) paths.push(join(process.env.DOCKER_CONFIG, "config.json"));
  paths.push(join(homedir(), ".docker", "config.json"));
  if (process.env.XDG_RUNTIME_DIR) {
    paths.push(join(process.env.XDG_RUNTIME_DIR, "containers", "auth.json"));
  }
  paths.push(join(homedir(), ".config", "containers", "auth.json"));
  return Array.from(new Set(paths.map((path) => resolve(path))));
}

function inspectRegistryAuth() {
  const sources = [];
  const registryKeys = new Set([
    "registry.redhat.io",
    "https://registry.redhat.io",
    "registry.redhat.io/openshift4"
  ]);

  for (const path of authCandidatePaths()) {
    if (!existsSync(path)) continue;
    try {
      const json = JSON.parse(readFileSync(path, "utf8"));
      const authKeys = Object.keys(json.auths ?? {});
      const registryAuthConfigured = authKeys.some((key) => registryKeys.has(key));
      const credHelperConfigured =
        Boolean(json.credHelpers?.["registry.redhat.io"]) ||
        Boolean(json.credsStore);
      sources.push({
        path,
        hasAuths: authKeys.length > 0,
        registryAuthConfigured,
        credHelperConfigured
      });
    } catch (error) {
      sources.push({
        path,
        unreadable: true,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const configured = sources.some(
    (source) => source.registryAuthConfigured || source.credHelperConfigured
  );
  if (configured) {
    pass("registry.redhat.io auth config", "docker/podman auth config references registry.redhat.io or a credential helper");
  } else {
    warn("registry.redhat.io auth config", "no local docker/podman auth config for registry.redhat.io was found");
  }

  return {
    configured,
    sources
  };
}

async function inspectRegistryBaseImage() {
  const result = await runCapture("docker", ["manifest", "inspect", catalogBaseImage]);
  const detail = (result.ok ? result.stdout : result.stderr || result.stdout)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
  if (result.ok) {
    pass("registry.redhat.io base image read", `${catalogBaseImage} manifest is readable`);
  } else {
    warn(
      "registry.redhat.io base image read",
      `${catalogBaseImage} manifest is not readable: ${detail || "no detail"}`
    );
  }
  return {
    image: catalogBaseImage,
    readable: result.ok,
    method: "docker manifest inspect",
    detail: detail || (result.ok ? "manifest readable" : "manifest read failed")
  };
}

function fbcSummary(documents) {
  return {
    package: documents.find((document) => document.schema === "olm.package"),
    channel: documents.find((document) => document.schema === "olm.channel"),
    bundle: documents.find((document) => document.schema === "olm.bundle")
  };
}

function inspectIcon(icon) {
  const base64data = icon?.base64data ?? "";
  const buffer = base64data ? Buffer.from(base64data, "base64") : Buffer.alloc(0);
  const hasPngSignature = buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  const hasEmbeddedMetadata = /xmp|adobe|Canva|Author|Attribution/i.test(
    buffer.toString("latin1")
  );
  return {
    base64data,
    buffer,
    hasPngSignature,
    hasEmbeddedMetadata,
    valid:
      icon?.mediatype === "image/png" &&
      base64data.length > 0 &&
      hasPngSignature &&
      !hasEmbeddedMetadata
  };
}

function installModeMap(modes = []) {
  return new Map(modes.map((mode) => [mode.type, mode.supported === true]));
}

function validateCatalogContracts({ csv, fbc, catalogDockerfile, catalogSource, subscription, scorecard }) {
  const relatedImages = new Map((csv?.spec?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
  const fbcParts = fbcSummary(fbc);
  const fbcImages = new Map((fbcParts.bundle?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
  const csvIcon = inspectIcon(csv?.spec?.icon?.[0]);
  const fbcPackageIcon = inspectIcon(fbcParts.package?.icon);
  const fbcMetadata = (fbcParts.bundle?.properties ?? []).find(
    (entry) => entry.type === "olm.csv.metadata"
  )?.value;
  const fbcIcon = inspectIcon(fbcMetadata?.icon?.[0]);
  const csvInstallModes = installModeMap(csv?.spec?.installModes);
  const fbcInstallModes = installModeMap(fbcMetadata?.installModes);

  expectCheck(
    "CSV package identity",
    csv?.metadata?.name === "cywell-opslens-operator.v0.1.0",
    csv?.metadata?.name ?? "missing"
  );
  expectCheck(
    "FBC package identity",
    fbcParts.package?.name === "cywell-opslens" && fbcParts.package?.defaultChannel === "alpha",
    "cywell-opslens alpha",
    "FBC package/default channel mismatch"
  );
  expectCheck(
    "FBC channel entry",
    (fbcParts.channel?.entries ?? []).some((entry) => entry.name === "cywell-opslens-operator.v0.1.0"),
    "channel includes cywell-opslens-operator.v0.1.0",
    "FBC channel is missing the current bundle"
  );
  for (const [name, image] of relatedImages.entries()) {
    expectCheck(
      `FBC related image parity ${name}`,
      fbcImages.get(name) === image,
      image,
      `expected ${name}=${image}, got ${fbcImages.get(name) ?? "missing"}`
    );
  }
  expectCheck(
    "CSV install icon",
    csvIcon.valid,
    `image/png ${csvIcon.buffer.length} bytes, metadataStripped=${String(!csvIcon.hasEmbeddedMetadata)}`,
    "CSV spec.icon must include a valid metadata-stripped image/png icon"
  );
  expectCheck(
    "FBC install icon",
    fbcIcon.valid,
    `image/png ${fbcIcon.buffer.length} bytes, metadataStripped=${String(!fbcIcon.hasEmbeddedMetadata)}`,
    "FBC olm.csv.metadata icon must include a valid metadata-stripped image/png icon"
  );
  expectCheck(
    "FBC package icon",
    fbcPackageIcon.valid,
    `image/png ${fbcPackageIcon.buffer.length} bytes, metadataStripped=${String(!fbcPackageIcon.hasEmbeddedMetadata)}`,
    "FBC olm.package icon must include a valid metadata-stripped image/png icon for OperatorHub cards"
  );
  expectCheck(
    "FBC install icon parity",
    fbcIcon.base64data === csvIcon.base64data && fbcPackageIcon.base64data === csvIcon.base64data,
    "FBC package and csv metadata icons match CSV icon",
    "FBC olm.package icon and olm.csv.metadata icon must match CSV spec.icon"
  );
  expectCheck(
    "FBC search metadata display",
    fbcMetadata?.displayName === csv?.spec?.displayName &&
      typeof fbcMetadata?.description === "string" &&
      fbcMetadata.description.toLowerCase().includes("openshift"),
    `${fbcMetadata?.displayName ?? "missing"} search description present`,
    "FBC olm.csv.metadata must mirror CSV displayName and include a searchable OpenShift description"
  );
  const fbcKeywords = new Set((fbcMetadata?.keywords ?? []).map((keyword) => String(keyword).toLowerCase()));
  expectCheck(
    "FBC search metadata keywords",
    ["cywell", "opslens", "ops", "openshift", "lightspeed"].every((keyword) => fbcKeywords.has(keyword)),
    "cywell/opslens/ops/openshift/lightspeed keywords present",
    "FBC olm.csv.metadata must include Cywell OpsLens search keywords for console catalog indexing"
  );
  expectCheck(
    "FBC search metadata annotations",
    fbcMetadata?.annotations?.categories === csv?.metadata?.annotations?.categories &&
      fbcMetadata?.annotations?.["com.redhat.openshift.versions"] ===
        csv?.metadata?.annotations?.["com.redhat.openshift.versions"],
    `categories=${fbcMetadata?.annotations?.categories ?? "missing"} openshift=${fbcMetadata?.annotations?.["com.redhat.openshift.versions"] ?? "missing"}`,
    "FBC olm.csv.metadata annotations must mirror CSV categories and supported OpenShift range"
  );
  expectCheck(
    "FBC install modes for console install",
    fbcInstallModes.get("OwnNamespace") === true && fbcInstallModes.get("AllNamespaces") === true,
    `OwnNamespace=${String(fbcInstallModes.get("OwnNamespace"))} AllNamespaces=${String(fbcInstallModes.get("AllNamespaces"))}`,
    "FBC olm.csv.metadata installModes must support OwnNamespace or AllNamespaces so OpenShift Console can render the install flow"
  );
  expectCheck(
    "FBC install mode parity",
    ["OwnNamespace", "SingleNamespace", "MultiNamespace", "AllNamespaces"].every(
      (mode) => fbcInstallModes.get(mode) === csvInstallModes.get(mode)
    ),
    "FBC installModes match CSV spec.installModes",
    "FBC olm.csv.metadata installModes must mirror CSV spec.installModes"
  );
  const requiredPlatformLabels = {
    "operatorframework.io/arch.amd64": "supported",
    "operatorframework.io/arch.arm64": "supported",
    "operatorframework.io/os.linux": "supported"
  };
  const csvPlatformLabels = csv?.metadata?.labels ?? {};
  const fbcPlatformLabels = fbcMetadata?.labels ?? {};
  expectCheck(
    "CSV platform labels",
    Object.entries(requiredPlatformLabels).every(([key, value]) => csvPlatformLabels[key] === value),
    "linux amd64/arm64 labels present for OperatorHub architecture filtering",
    "CSV metadata.labels must include operatorframework.io/os.linux and operatorframework.io/arch.amd64/arm64 so OpenShift Console does not hide the Operator on arm64 CRC"
  );
  expectCheck(
    "FBC search metadata platform labels",
    Object.entries(requiredPlatformLabels).every(
      ([key, value]) => fbcPlatformLabels[key] === value && fbcPlatformLabels[key] === csvPlatformLabels[key]
    ),
    "FBC platform labels mirror CSV labels",
    "FBC olm.csv.metadata.labels must mirror CSV platform labels for PackageManifest/Console indexing"
  );
  const csvOwnedCrds = csv?.spec?.customresourcedefinitions?.owned ?? [];
  const fbcOwnedCrds = fbcMetadata?.customresourcedefinitions?.owned ?? [];
  const csvOpsLensOwnedCrd = csvOwnedCrds.find(
    (crd) => crd.name === "opslensinstallations.opslens.cywell.io"
  );
  const fbcOpsLensOwnedCrd = fbcOwnedCrds.find((crd) => crd.name === csvOpsLensOwnedCrd?.name);
  expectCheck(
    "FBC search metadata owned CRD",
    Boolean(csvOpsLensOwnedCrd) &&
      fbcOpsLensOwnedCrd?.kind === csvOpsLensOwnedCrd.kind &&
      fbcOpsLensOwnedCrd?.version === csvOpsLensOwnedCrd.version &&
      fbcOpsLensOwnedCrd?.displayName === csvOpsLensOwnedCrd.displayName,
    "OpsLensInstallation owned CRD is exposed in FBC csv metadata",
    "FBC olm.csv.metadata must expose the OpsLensInstallation owned CRD for console catalog cards"
  );
  expectCheck(
    "catalog Dockerfile base",
    catalogDockerfile.includes("registry.redhat.io/openshift4/ose-operator-registry-rhel9"),
    "Red Hat operator registry base image",
    "catalog Dockerfile must use the Red Hat operator registry base image"
  );
  expectCheck(
    "catalog Dockerfile serve",
    catalogDockerfile.includes("opm") && catalogDockerfile.includes("serve") && catalogDockerfile.includes("/configs"),
    "opm serve /configs",
    "catalog Dockerfile must serve FBC configs with opm"
  );
  expectCheck(
    "CatalogSource manual channel",
    catalogSource?.kind === "CatalogSource" &&
      catalogSource?.metadata?.namespace === "openshift-marketplace" &&
      catalogSource?.spec?.sourceType === "grpc" &&
      catalogSource?.spec?.updateStrategy?.registryPoll?.interval === "30m",
    "CatalogSource grpc in openshift-marketplace polling every 30m",
    "CatalogSource must be grpc, marketplace-scoped, and poll every 30m"
  );
  expectCheck(
    "Subscription manual approval",
    subscription?.kind === "Subscription" &&
      subscription?.spec?.installPlanApproval === "Manual" &&
      subscription?.spec?.startingCSV === "cywell-opslens-operator.v0.1.0",
    "Manual Subscription with pinned startingCSV",
    "Subscription must use Manual installPlanApproval and pinned startingCSV"
  );
  const scorecardTests = (scorecard?.stages ?? []).flatMap((stage) => stage.tests ?? []);
  expectCheck(
    "scorecard core tests",
    ["basic-check-spec-test", "olm-bundle-validation-test"].every((name) =>
      scorecardTests.some((test) => (test.entrypoint ?? []).includes(name))
    ),
    "basic and olm bundle validation scorecard tests configured",
    "scorecard config must include basic and OLM bundle validation tests"
  );
}

function command(id, phase, text, purpose, { requiresNetwork = false, mutation = false, requiresHumanSecretInput = false } = {}) {
  return {
    id,
    phase,
    command: text,
    purpose,
    requiresNetwork,
    mutation,
    requiresHumanSecretInput
  };
}

function buildCommands() {
  return {
    readOnly: [
      command("certification-static", "static-readiness", "npm run verify:certification", "Run static catalog, CSV, FBC, scorecard, and documentation checks."),
      command("image-readiness-static", "static-readiness", "npm run verify:images", "Check image build contracts without building or pushing images."),
      command("fbc-validate", "toolchain-readiness", "opm validate deploy/catalog/fbc", "Validate the file-based catalog locally when opm is available."),
      command("bundle-validate", "toolchain-readiness", "operator-sdk bundle validate ./deploy/operator/bundle --select-optional suite=operatorframework", "Validate the Operator bundle when operator-sdk is available."),
      command("scorecard", "toolchain-readiness", "operator-sdk scorecard ./deploy/operator/bundle", "Run Operator SDK scorecard when operator-sdk is available."),
      command("registry-base-inspect", "registry-read-only", `docker manifest inspect ${catalogBaseImage}`, "Confirm registry.redhat.io auth can read the catalog base image manifest.", { requiresNetwork: true })
    ],
    setup: [
      command("registry-login", "human-setup", "docker login registry.redhat.io", "Authenticate to registry.redhat.io before local catalog image build.", {
        requiresNetwork: true,
        requiresHumanSecretInput: true
      }),
      command("install-opm", "human-setup", "install opm matching the target OpenShift/OLM toolchain", "Install opm before FBC validation.", {
        requiresNetwork: true
      }),
      command("install-operator-sdk", "human-setup", "install operator-sdk matching the target Operator SDK release", "Install operator-sdk before bundle validation and scorecard.", {
        requiresNetwork: true
      })
    ],
    localArtifact: [
      command("catalog-local-build", "local-artifact", "docker build -f deploy/catalog/catalog.Dockerfile -t cywell/opslens-catalog:verify deploy/catalog", "Build the catalog image locally after registry auth is configured.", {
        requiresNetwork: true,
        mutation: false
      })
    ],
    forbiddenWithoutApproval: [
      "docker push",
      "podman push",
      "skopeo copy",
      "cosign sign",
      "oc apply",
      "oc patch",
      "oc delete",
      "opm publish"
    ]
  };
}

function planStatus(missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (missingEvidence.length > 0) return "NEEDS_TOOLING";
  return "READY_FOR_DRY_RUN";
}

function nextActionFor({ status, missingEvidence, cliByName, registryAuth, registryBaseImageProbe }) {
  if (status === "BLOCKED") {
    return {
      id: "fix-static-catalog-contract",
      owner: "release-manager",
      command: "npm run verify:catalog-toolchain",
      phase: "static-readiness",
      mutation: false,
      requiresHumanSecretInput: false,
      reason: "Static catalog/FBC/CSV contract checks failed; fix manifests before tooling work."
    };
  }
  if (missingEvidence.some((entry) => entry.includes("current git worktree dirty"))) {
    return {
      id: "review-worktree",
      owner: "release-manager",
      command: "git status --short",
      phase: "local-evidence",
      mutation: false,
      requiresHumanSecretInput: false,
      reason: "Catalog evidence must be generated from a clean worktree before release or CRC install review."
    };
  }
  if (!cliByName.get("opm")?.available) {
    return {
      id: "install-opm",
      owner: "release-manager",
      command: "install opm matching the target OpenShift/OLM toolchain, then rerun npm run verify:catalog-toolchain",
      phase: "human-tooling-setup",
      mutation: false,
      requiresHumanSecretInput: false,
      reason: "FBC preview validation needs opm; this verifier does not install tools."
    };
  }
  if (!cliByName.get("operator-sdk")?.available) {
    return {
      id: "install-operator-sdk",
      owner: "release-manager",
      command: "install operator-sdk matching the target Operator SDK release, then rerun npm run verify:catalog-toolchain",
      phase: "human-tooling-setup",
      mutation: false,
      requiresHumanSecretInput: false,
      reason: "Bundle validation and scorecard need operator-sdk; this verifier does not install tools."
    };
  }
  if (!registryAuth.configured || !registryBaseImageProbe.readable) {
    return {
      id: "registry-redhat-login",
      owner: "registry-admin",
      command: "docker login registry.redhat.io, then rerun npm run verify:catalog-toolchain",
      phase: "human-registry-setup",
      mutation: false,
      requiresHumanSecretInput: true,
      reason: "The Red Hat catalog base image cannot be read yet; credentials must be entered by a human and are not stored by the verifier."
    };
  }
  return {
    id: "build-catalog-image",
    owner: "release-manager",
    command: "docker build -f deploy/catalog/catalog.Dockerfile -t cywell/opslens-catalog:verify deploy/catalog",
    phase: "local-artifact",
    mutation: false,
    requiresHumanSecretInput: false,
    reason: "Catalog manifests and toolchain are ready for a local catalog image build; pushing remains approval-gated."
  };
}

function currentJudgmentFor(status, nextAction) {
  if (status === "READY_FOR_DRY_RUN") {
    return "Catalog static contracts and local toolchain evidence are ready for local dry-run review. Publishing or applying remains approval-gated.";
  }
  if (nextAction?.id === "registry-redhat-login") {
    return "Catalog manifests are structurally valid, but the local machine cannot read the Red Hat catalog base image yet. This is a registry/auth setup gap, not an OpsLens code defect.";
  }
  if (nextAction?.id === "install-opm" || nextAction?.id === "install-operator-sdk") {
    return "Catalog manifests are structurally valid, but local certification tooling is incomplete. Install the missing CLI before claiming catalog dry-run readiness.";
  }
  return "Catalog readiness is not proven yet; follow the next action before building or publishing a catalog image.";
}

async function writeMarkdown(path, artifact) {
  const lines = [
    "# Cywell OpsLens Catalog Toolchain Handoff",
    "",
    `- Status: ${artifact.status}`,
    `- Branch: ${artifact.ref.branch}`,
    `- Head: ${artifact.ref.headSha}`,
    `- Dirty: ${String(artifact.ref.worktreeDirty)}`,
    `- Registry auth configured: ${String(artifact.registryAuth.configured)}`,
    `- Registry base readable: ${String(artifact.registryAuth.baseImageReadable)}`,
    "",
    "## Current Judgment",
    "",
    artifact.currentJudgment,
    "",
    "## Next Action",
    "",
    `- ID: ${artifact.nextAction.id}`,
    `- Owner: ${artifact.nextAction.owner}`,
    `- Phase: ${artifact.nextAction.phase}`,
    `- Requires human secret input: ${String(artifact.nextAction.requiresHumanSecretInput)}`,
    `- Mutation: ${String(artifact.nextAction.mutation)}`,
    "",
    "```powershell",
    artifact.nextAction.command,
    "```",
    "",
    artifact.nextAction.reason,
    "",
    "## Missing Evidence",
    "",
    ...(artifact.missingEvidence.length > 0
      ? artifact.missingEvidence.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "## CLI Status",
    "",
    ...artifact.cli.map((entry) => `- ${entry.name}: available=${String(entry.available)} version=${entry.version}`),
    "",
    "## Boundaries",
    "",
    "- This verifier writes local evidence only.",
    "- It does not install opm/operator-sdk, log in to registries, build or push release images, apply manifests, patch OLSConfig, delete, or scale.",
    "- Catalog image push, catalog publication, Operator install, and OLSConfig registration remain approval-gated.",
    "",
    "## Checks",
    "",
    ...artifact.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`)
  ];
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${lines.map(sanitize).join("\n")}\n`, "utf8");
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "QUAY_TOKEN",
    "REGISTRY_TOKEN",
    "REDHAT_REGISTRY_TOKEN",
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
  if (worktreeStatus.length > 0) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }
  const cli = [
    await cliStatus("docker", ["--version"]),
    await cliStatus("opm", ["version"]),
    await cliStatus("operator-sdk", ["version"]),
    await cliStatus("podman", ["--version"]),
    await cliStatus("oc", ["version", "--client=true"])
  ];
  const csv = await loadSingleYaml(options.csv);
  const fbc = await loadYamlDocuments(options.fbc);
  const catalogDockerfile = await readText(options.catalogDockerfile);
  const catalogSource = await loadSingleYaml(options.catalogSource);
  const subscription = await loadSingleYaml(options.subscription);
  const scorecard = await loadSingleYaml(options.scorecard);
  validateCatalogContracts({
    csv,
    fbc,
    catalogDockerfile,
    catalogSource,
    subscription,
    scorecard
  });

  const registryAuthConfig = inspectRegistryAuth();
  const registryBaseImageProbe = await inspectRegistryBaseImage();
  const registryAuth = {
    ...registryAuthConfig,
    baseImageReadable: registryBaseImageProbe.readable,
    baseImageProbe: registryBaseImageProbe
  };
  const cliByName = new Map(cli.map((entry) => [entry.name, entry]));
  const missingEvidence = [];
  for (const name of ["opm", "operator-sdk"]) {
    if (!cliByName.get(name)?.available) {
      missingEvidence.push(`${name} CLI is required for catalog validation and scorecard evidence`);
    }
  }
  if (!cliByName.get("docker")?.available && !cliByName.get("podman")?.available) {
    missingEvidence.push("docker or podman CLI is required for local catalog image build evidence");
  }
  if (!registryAuthConfig.configured) {
    missingEvidence.push("registry.redhat.io auth config is required before catalog image build can read the Red Hat base image");
  }
  if (!registryBaseImageProbe.readable) {
    missingEvidence.push("registry.redhat.io base image manifest read must pass before catalog local build/provenance can be trusted");
  }
  if (worktreeStatus.length > 0) {
    missingEvidence.push(`current git worktree dirty=true currentHead=${headSha}`);
  }

  const commands = buildCommands();
  const status = planStatus(missingEvidence);
  const nextAction = nextActionFor({
    status,
    missingEvidence,
    cliByName,
    registryAuth,
    registryBaseImageProbe
  });
  const currentJudgment = currentJudgmentFor(status, nextAction);
  const artifact = {
    schema: "cywell.opslens.catalog-toolchain-plan.v0.1",
    artifactType: "opslens.catalog-toolchain-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "toolchainPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-CERT-001"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    cli,
    registryAuth,
    commands,
    nextAction,
    currentJudgment,
    markdownPath: resolve(options.markdownOut),
    missingEvidence,
    risk: [
      "Catalog image build can fail even when manifests are valid if registry.redhat.io credentials are missing.",
      "opm/operator-sdk version drift can produce different validation results than the target OpenShift release pipeline.",
      "This verifier does not publish catalog images or install Operators; publication remains behind release and install approval plans."
    ],
    rollbackPath: [
      "No rollback is required because this verifier writes only local evidence.",
      "If toolchain validation fails, fix the local CLI/auth setup and regenerate this plan before release review.",
      "If a catalog image is built locally with wrong inputs, remove or supersede the local tag; do not push it."
    ],
    evidenceSources: {
      csv: resolve(options.csv),
      fbc: resolve(options.fbc),
      catalogDockerfile: resolve(options.catalogDockerfile),
      catalogSource: resolve(options.catalogSource),
      subscription: resolve(options.subscription),
      scorecard: resolve(options.scorecard)
    },
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret))) {
    throw new Error("catalog toolchain plan would include a configured secret value");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeMarkdown(options.markdownOut, artifact);
  pass("catalog toolchain plan export", `${resolve(options.evidenceOut)} written without secret material`);
  pass("catalog toolchain handoff export", `${resolve(options.markdownOut)} written without secret material`);

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
  console.log(`Cywell OpsLens catalog toolchain plan: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);
  console.log(`Next: ${nextAction.command}`);

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("catalog toolchain plan runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] catalog toolchain plan runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
