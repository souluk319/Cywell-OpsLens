#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-community-operator-submission.json",
  packageName: "cywell-opslens",
  version: "0.1.0",
  csvName: "cywell-opslens-operator.v0.1.0",
  bundleImage: "quay.io/cywell/opslens-operator-bundle:0.1.0",
  timeoutMs: 10000
};

const paths = {
  submissionRoot: "operators/cywell-opslens",
  ci: "operators/cywell-opslens/ci.yaml",
  catalogTemplate: "operators/cywell-opslens/catalog-templates/stable.yaml",
  source: {
    csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
    crd: "deploy/operator/bundle/manifests/opslens.cywell.io_opslensinstallations.yaml",
    annotations: "deploy/operator/bundle/metadata/annotations.yaml",
    scorecard: "deploy/operator/bundle/tests/scorecard/config.yaml"
  },
  target: {
    csv: "operators/cywell-opslens/0.1.0/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
    crd: "operators/cywell-opslens/0.1.0/manifests/opslens.cywell.io_opslensinstallations.yaml",
    annotations: "operators/cywell-opslens/0.1.0/metadata/annotations.yaml",
    scorecard: "operators/cywell-opslens/0.1.0/tests/scorecard/config.yaml"
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

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return {
      ok: true,
      stdout: sanitize(stdout.trim()),
      stderr: sanitize(stderr.trim())
    };
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

async function readText(relativePath) {
  try {
    return await readFile(resolve(relativePath), "utf8");
  } catch (error) {
    fail("file exists", `${relativePath} is not readable: ${error.message}`);
    return undefined;
  }
}

async function readBufferForHash(relativePath) {
  try {
    const buffer = await readFile(resolve(relativePath));
    return {
      exists: true,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      sizeBytes: buffer.length
    };
  } catch (error) {
    fail("file exists", `${relativePath} is not readable: ${error.message}`);
    return {
      exists: false,
      sha256: "missing",
      sizeBytes: 0
    };
  }
}

async function loadYaml(relativePath) {
  const text = await readText(relativePath);
  if (text === undefined) return [];
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${relativePath}: ${errors.map((error) => error.message).join("; ")}`);
    return [];
  }
  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  pass("valid YAML", `${relativePath} contains ${parsed.length} document(s)`);
  return parsed;
}

async function loadSingleYaml(relativePath) {
  const documents = await loadYaml(relativePath);
  if (documents.length === 1) {
    return documents[0];
  }
  fail("single YAML document", `${relativePath} expected 1 document, got ${documents.length}`);
  return documents[0];
}

async function parityEntries() {
  const entries = [
    {
      id: "csv",
      source: paths.source.csv,
      target: paths.target.csv
    },
    {
      id: "crd",
      source: paths.source.crd,
      target: paths.target.crd
    },
    {
      id: "bundle-annotations",
      source: paths.source.annotations,
      target: paths.target.annotations
    },
    {
      id: "scorecard",
      source: paths.source.scorecard,
      target: paths.target.scorecard
    }
  ];

  const results = [];
  for (const entry of entries) {
    const source = await readBufferForHash(entry.source);
    const target = await readBufferForHash(entry.target);
    const match = source.exists && target.exists && source.sha256 === target.sha256;
    if (match) {
      pass(`source bundle parity ${entry.id}`, `${entry.target} matches ${entry.source}`);
    } else {
      fail(
        `source bundle parity ${entry.id}`,
        `source=${source.sha256} target=${target.sha256}`
      );
    }
    results.push({
      id: entry.id,
      source: entry.source,
      target: entry.target,
      sourceSha256: source.sha256,
      targetSha256: target.sha256,
      sourceSizeBytes: source.sizeBytes,
      targetSizeBytes: target.sizeBytes,
      match
    });
  }
  return results;
}

function validateCi(ci) {
  const reviewers = Array.isArray(ci?.reviewers) ? ci.reviewers : [];
  const catalogMapping = Array.isArray(ci?.fbc?.catalog_mapping)
    ? ci.fbc.catalog_mapping
    : [];
  const stableMapping = catalogMapping.find((mapping) => mapping.template_name === "stable.yaml");
  const catalogs = new Set(stableMapping?.catalogs_names ?? []);
  const requiredCatalogs = ["v4.16", "v4.17", "v4.18", "v4.19"];

  expectCheck(
    "Community ci reviewers",
    reviewers.some((reviewer) => !/[<>]|example|placeholder|todo/i.test(String(reviewer))),
    reviewers.join(", ") || "missing",
    "at least one non-placeholder reviewer is required"
  );
  expectCheck(
    "Community ci FBC enabled",
    ci?.fbc?.enabled === true,
    "fbc.enabled=true",
    "fbc.enabled must be true"
  );
  expectCheck(
    "Community ci promotion strategy",
    ci?.fbc?.version_promotion_strategy === "review-needed",
    "review-needed",
    `expected review-needed, got ${ci?.fbc?.version_promotion_strategy ?? "missing"}`
  );
  expectCheck(
    "Community ci catalog mapping",
    stableMapping?.type === "olm.semver" &&
      requiredCatalogs.every((catalog) => catalogs.has(catalog)),
    "stable.yaml maps v4.16-v4.19 with type=olm.semver",
    "stable.yaml catalog mapping must include v4.16-v4.19 and type=olm.semver"
  );
}

function relatedImagesByName(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((image) => [image.name, image.image]));
}

function validateCsv(csv) {
  expectCheck(
    "submission CSV identity",
    csv?.kind === "ClusterServiceVersion" &&
      csv?.metadata?.name === defaults.csvName &&
      csv?.spec?.version === defaults.version,
    `${csv?.kind ?? "missing"}/${csv?.metadata?.name ?? "missing"} version=${csv?.spec?.version ?? "missing"}`,
    "CSV kind/name/version must match Cywell OpsLens v0.1.0"
  );
  const annotations = csv?.metadata?.annotations ?? {};
  expectCheck(
    "submission CSV package annotations",
    annotations.certified === "false" &&
      annotations.support === "Cywell" &&
      annotations["com.redhat.openshift.versions"] === "v4.16-v4.19",
    "certified=false support=Cywell openshift=v4.16-v4.19",
    "CSV must keep Red Hat-oriented draft annotations"
  );
  expectCheck(
    "submission CSV repository",
    /^https:\/\/github\.com\/souluk319\/Cywell-OpsLens$/i.test(annotations.repository ?? ""),
    annotations.repository ?? "missing",
    "CSV repository must point to the Cywell OpsLens GitHub repository"
  );
  const maintainers = csv?.spec?.maintainers ?? [];
  expectCheck(
    "submission CSV maintainer",
    maintainers.some((entry) => /@cywell\.com$/i.test(entry.email ?? "")),
    maintainers.map((entry) => entry.email).join(", ") || "missing",
    "CSV must include a Cywell maintainer email"
  );
  for (const name of ["operator", "api", "dashboard", "vllm", "pgvector"]) {
    expectCheck(
      `submission CSV related image ${name}`,
      relatedImagesByName(csv).has(name),
      relatedImagesByName(csv).get(name) ?? "missing",
      `${name} related image is missing`
    );
  }
}

function validateCatalogTemplate(templateDocs, csv) {
  const pkg = templateDocs.find((doc) => doc.schema === "olm.package");
  const channel = templateDocs.find((doc) => doc.schema === "olm.channel");
  const bundle = templateDocs.find((doc) => doc.schema === "olm.bundle");

  expectCheck(
    "submission catalog package",
    pkg?.name === defaults.packageName && pkg?.defaultChannel === "alpha",
    "package cywell-opslens defaultChannel alpha",
    "catalog template package must be cywell-opslens alpha"
  );
  expectCheck(
    "submission catalog channel",
    channel?.package === defaults.packageName &&
      channel?.name === "alpha" &&
      (channel?.entries ?? []).some((entry) => entry.name === defaults.csvName),
    "alpha channel includes cywell-opslens-operator.v0.1.0",
    "catalog template channel must include the v0.1.0 CSV"
  );
  expectCheck(
    "submission catalog bundle",
    bundle?.package === defaults.packageName &&
      bundle?.name === defaults.csvName &&
      bundle?.image === defaults.bundleImage,
    defaults.bundleImage,
    "catalog template bundle must reference the draft bundle image"
  );

  const templateImages = new Map((bundle?.relatedImages ?? []).map((image) => [image.name, image.image]));
  for (const [name, image] of relatedImagesByName(csv).entries()) {
    expectCheck(
      `submission catalog related image parity ${name}`,
      templateImages.get(name) === image,
      image,
      `expected ${image}, got ${templateImages.get(name) ?? "missing"}`
    );
  }
}

function validateBundleMetadata(annotations) {
  const values = annotations?.annotations ?? {};
  const expected = {
    "operators.operatorframework.io.bundle.package.v1": defaults.packageName,
    "operators.operatorframework.io.bundle.channels.v1": "alpha",
    "operators.operatorframework.io.bundle.channel.default.v1": "alpha",
    "com.redhat.openshift.versions": "v4.16-v4.19"
  };
  for (const [key, value] of Object.entries(expected)) {
    expectCheck(
      `submission bundle annotation ${key}`,
      values[key] === value,
      value,
      `expected ${value}, got ${values[key] ?? "missing"}`
    );
  }
}

function validateScorecard(scorecard) {
  const tests = (scorecard?.stages ?? []).flatMap((stage) => stage.tests ?? []);
  expectCheck(
    "submission scorecard identity",
    scorecard?.apiVersion === "scorecard.operatorframework.io/v1alpha3" &&
      scorecard?.kind === "Configuration",
    `${scorecard?.apiVersion ?? "missing"} ${scorecard?.kind ?? "missing"}`,
    "scorecard config must be a scorecard.operatorframework.io/v1alpha3 Configuration"
  );
  for (const testName of ["basic-check-spec-test", "olm-bundle-validation-test"]) {
    expectCheck(
      `submission scorecard test ${testName}`,
      tests.some((test) => (test.entrypoint ?? []).includes(testName)),
      "configured",
      `${testName} is missing`
    );
  }
}

function buildReadOnlyCommands() {
  return [
    {
      id: "verify-community-submission-draft",
      phase: "community-operator-preflight",
      command: "npm run verify:community-submission",
      mutation: false,
      requiresNetwork: false,
      writesLocalEvidence: true
    },
    {
      id: "compare-submission-tree",
      phase: "community-operator-preflight",
      command: "git diff --no-index deploy/operator/bundle operators/cywell-opslens/0.1.0",
      mutation: false,
      requiresNetwork: false,
      writesLocalEvidence: false
    }
  ];
}

function buildApprovalGatedCommands() {
  return [
    {
      id: "community-operatorhub-pr",
      phase: "external-submission",
      command:
        "open a reviewed pull request against redhat-openshift-ecosystem/community-operators-prod with operators/cywell-opslens",
      mutation: true,
      requiresExplicitApproval: true,
      requiresNetwork: true
    }
  ];
}

function statusFromChecks(worktreeDirty) {
  if (checks.some((check) => check.status === "FAIL")) return "FAILED";
  if (worktreeDirty || checks.some((check) => check.status === "WARN")) return "NEEDS_EVIDENCE";
  return "PASS";
}

function buildFirstSubmissionActions(status, missingEvidence) {
  const blockedBy = missingEvidence.length ? missingEvidence : [];
  return [
    {
      id: "community-submission-draft-preflight",
      owner: "release-manager",
      phase: "community-operator-preflight",
      status: status === "PASS" ? "ready-for-external-review" : "needs-evidence",
      request:
        "Verify the Community Operator submission tree is current-head, byte-for-byte aligned with the internal bundle, and ready for external PR review.",
      evidenceNeeded:
        status === "PASS"
          ? "fresh opslens.community-operator-submission.v0.1 evidence"
          : blockedBy.join("; ") || "fresh community submission evidence",
      nextCommand: "npm run verify:community-submission",
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "Regenerate or delete operators/cywell-opslens staging files; no cluster, registry, or external repository mutation is performed."
    },
    {
      id: "approval-gated-community-operatorhub-pr",
      owner: "release-manager",
      phase: "external-submission",
      status: "approval-gated",
      request:
        "Submit to the Community Operator repository only after release, security, runtime, and product approvals are explicit.",
      evidenceNeeded:
        "PASS community submission draft, READY_FOR_REVIEW certification readiness, current-head release evidence bundle, and human approval.",
      nextCommand:
        "open a reviewed pull request against redhat-openshift-ecosystem/community-operators-prod with operators/cywell-opslens",
      mutation: true,
      requiresExplicitApproval: true,
      blockedBy,
      rollbackPath:
        "Close or supersede the external PR if the wrong bundle, digest, or approval set was submitted."
    }
  ];
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  for (const requiredPath of [
    paths.submissionRoot,
    `${paths.submissionRoot}/0.1.0/manifests`,
    `${paths.submissionRoot}/0.1.0/metadata`,
    `${paths.submissionRoot}/0.1.0/tests/scorecard`,
    `${paths.submissionRoot}/catalog-templates`
  ]) {
    expectCheck(
      `submission path ${requiredPath}`,
      existsSync(resolve(requiredPath)),
      "present",
      `${requiredPath} is missing`
    );
  }

  const ci = await loadSingleYaml(paths.ci);
  const csv = await loadSingleYaml(paths.target.csv);
  const annotations = await loadSingleYaml(paths.target.annotations);
  const scorecard = await loadSingleYaml(paths.target.scorecard);
  const catalogTemplate = await loadYaml(paths.catalogTemplate);
  const sourceBundleParity = await parityEntries();

  validateCi(ci);
  validateCsv(csv);
  validateBundleMetadata(annotations);
  validateScorecard(scorecard);
  validateCatalogTemplate(catalogTemplate, csv);

  const missingEvidence = checks
    .filter((check) => check.status !== "PASS")
    .map((check) => `${check.name}: ${check.detail}`);
  const status = statusFromChecks(worktreeDirty);
  const readOnlyCommands = buildReadOnlyCommands();
  const approvalGatedCommands = buildApprovalGatedCommands();
  const firstSubmissionActions = buildFirstSubmissionActions(status, missingEvidence);
  const artifact = {
    schema: "cywell.opslens.community-operator-submission.v0.1",
    artifactType: "opslens.community-operator-submission.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "submissionDraftOnly",
    externalSubmissionAttempted: false,
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
    submissionLayout: {
      root: paths.submissionRoot,
      packageName: defaults.packageName,
      version: defaults.version,
      ci: paths.ci,
      catalogTemplate: paths.catalogTemplate,
      manifests: [
        paths.target.csv,
        paths.target.crd
      ],
      metadata: paths.target.annotations,
      scorecard: paths.target.scorecard
    },
    sourceBundleParity,
    readOnlyCommands,
    approvalGatedCommands,
    firstSubmissionActions,
    missingEvidence,
    risk: [
      "This artifact proves a local Community Operator submission draft only; it is not Red Hat certification or OperatorHub acceptance.",
      "The external Community Operators repository CI remains the final authority for template schema and hosted validation.",
      "The staging tree must be regenerated after any bundle, CRD, related image, scorecard, or catalog template change."
    ],
    rollbackPath: [
      "Delete or regenerate operators/cywell-opslens before external review if parity or catalog checks fail.",
      "Close or supersede any external pull request if a stale bundle, wrong digest, or incomplete approval set was submitted.",
      "No cluster or registry rollback is required because this verifier writes local evidence only."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (/Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+|--token\s+(?!<redacted>)[^\s]+/i.test(serialized)) {
    throw new Error("community operator submission evidence would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("community operator submission export", `${resolve(options.evidenceOut)} written without secret material`);
  return artifact;
}

function printSummary() {
  const weight = {
    FAIL: 0,
    WARN: 1,
    PASS: 2
  };
  for (const check of checks.sort((left, right) => weight[left.status] - weight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens Community Operator submission draft: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  fail("community operator submission verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
