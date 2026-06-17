#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments, stringify } from "yaml";
import { sanitizeArtifact, sanitizeCommonSensitive } from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  registry: "<crc-registry>",
  namespace: "cywell-opslens",
  labImageTag: "v0.1.2-dev-crc",
  targetArchitecture: "arm64",
  evidenceOut: "test-results/cywell-opslens-lab-image-map-preview.json",
  markdownOut: "test-results/cywell-opslens-lab-image-map-preview.md",
  k8sYamlOut: "test-results/cywell-opslens-lab-image-map-k8s-preview.yaml",
  fbcYamlOut: "test-results/cywell-opslens-lab-image-map-fbc-preview.yaml",
  sources: [
    { path: "deploy/catalog/openshift/catalogsource.yaml", previewKind: "k8s" },
    { path: "deploy/catalog/fbc/catalog.yaml", previewKind: "fbc" },
    { path: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml", previewKind: "k8s" },
    { path: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml", previewKind: "k8s" },
    { path: "deploy/operator/config/apps/opslens-stack.yaml", previewKind: "k8s" },
    { path: "deploy/operator/config/manager/manager.yaml", previewKind: "k8s" }
  ],
  timeoutMs: 10000
};

const ownedImageMap = [
  {
    component: "operator",
    source: "quay.io/cywell/opslens-operator:0.1.0",
    localTag: "cywell/opslens-operator:verify",
    repo: "cywell-opslens-operator",
    requiredFor: ["CSV", "manager", "FBC"]
  },
  {
    component: "api",
    source: "quay.io/cywell/opslens-api:0.1.0",
    localTag: "cywell/opslens-api:verify",
    repo: "cywell-opslens-api",
    requiredFor: ["OpsLensInstallation", "app-stack", "FBC"]
  },
  {
    component: "dashboard",
    source: "quay.io/cywell/opslens-dashboard:0.1.0",
    localTag: "cywell/opslens-dashboard:verify",
    repo: "cywell-opslens-dashboard",
    requiredFor: ["OpsLensInstallation", "app-stack", "FBC"]
  },
  {
    component: "bundle",
    source: "quay.io/cywell/opslens-operator-bundle:0.1.0",
    localTag: "cywell/opslens-operator-bundle:verify",
    repo: "cywell-opslens-operator-bundle",
    requiredFor: ["FBC bundle image"]
  },
  {
    component: "catalog",
    source: "quay.io/cywell/opslens-catalog:0.1.0",
    localTag: "cywell/opslens-catalog:verify",
    repo: "cywell-opslens-catalog",
    requiredFor: ["CatalogSource"]
  }
];

const externalRuntimeImages = [
  {
    component: "vllm",
    source: "quay.io/cywell/opslens-vllm:0.1.0",
    reason: "external model runtime image needs product/security/registry review before lab mirroring"
  },
  {
    component: "pgvector",
    source: "docker.io/pgvector/pgvector:pg16",
    reason: "external Postgres pgvector image needs product/security/registry review before lab mirroring"
  }
];

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

const args = parseArgs(process.argv.slice(2));
const options = {
  registry: args.get("registry") ?? defaults.registry,
  namespace: args.get("namespace") ?? defaults.namespace,
  labImageTag: args.get("lab-image-tag") ?? defaults.labImageTag,
  targetArchitecture: args.get("target-architecture") ?? defaults.targetArchitecture,
  evidenceOut: args.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: args.get("markdown-out") ?? defaults.markdownOut,
  k8sYamlOut: args.get("k8s-yaml-out") ?? defaults.k8sYamlOut,
  fbcYamlOut: args.get("fbc-yaml-out") ?? defaults.fbcYamlOut,
  sources: args.get("sources")
    ? args.get("sources").split(",").map((item) => ({ path: item.trim(), previewKind: "k8s" })).filter((item) => item.path)
    : defaults.sources,
  timeoutMs: Number(args.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];

function sanitize(value) {
  return sanitizeCommonSensitive(value)
    .replace(/\b(?:api|console|oauth|default-route)[A-Za-z0-9.-]*(?:crc|ocp|openshift)[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-endpoint>")
    .replace(/\b(?:127|100)(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>");
}

function record(status, name, detail, extra = {}) {
  checks.push(sanitizeArtifact({ status, name, detail: sanitize(detail), ...extra }, sanitize));
}

function pass(name, detail, extra) {
  record("PASS", name, detail, extra);
}

function warn(name, detail, extra) {
  record("WARN", name, detail, extra);
}

function fail(name, detail, extra) {
  record("FAIL", name, detail, extra);
}

async function runCapture(command, args, timeoutMs = options.timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
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

async function localImage(tag) {
  const result = await runCapture("docker", [
    "image",
    "inspect",
    tag,
    "--format",
    "{{.Id}}|{{.Size}}|{{.Architecture}}|{{.Os}}"
  ]);
  if (!result.ok || !result.stdout) {
    warn("local image", `${tag} is missing`);
    return { tag, present: false };
  }
  const [imageId, size, architecture, os] = result.stdout.split("|");
  if (architecture === options.targetArchitecture) {
    pass("local image", `${tag} present (${architecture}/${os})`);
  } else {
    fail("local image architecture", `${tag} is ${architecture}/${os}; expected ${options.targetArchitecture}`);
  }
  return { tag, present: true, imageId, sizeBytes: Number(size), architecture, os };
}

function targetFor(entry) {
  return `${options.registry}/${options.namespace}/${entry.repo}:${options.labImageTag}`;
}

function versionedLocalTag(localTag) {
  return localTag.replace(/:verify$/u, `:${options.labImageTag}`);
}

function replacementBySource() {
  return new Map(ownedImageMap.map((entry) => [entry.source, { ...entry, target: targetFor(entry) }]));
}

function replaceImageString(value, replacements, sourcePath, location, replacementEvents) {
  const replacement = replacements.get(value);
  if (!replacement) return value;
  replacementEvents.push({
    sourcePath,
    location,
    component: replacement.component,
    source: value,
    target: replacement.target,
    localTag: replacement.localTag,
    requiredFor: replacement.requiredFor
  });
  return replacement.target;
}

function replaceImages(value, replacements, sourcePath, location, replacementEvents, externalEvents) {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      replaceImages(item, replacements, sourcePath, `${location}[${index}]`, replacementEvents, externalEvents)
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (key === "image" && typeof nestedValue === "string") {
          const external = externalRuntimeImages.find((image) => image.source === nestedValue);
          if (external) {
            externalEvents.push({ sourcePath, location: `${location}.image`, ...external });
          }
          return [
            key,
            replaceImageString(nestedValue, replacements, sourcePath, `${location}.image`, replacementEvents)
          ];
        }
        if (key === "containerImage" && typeof nestedValue === "string") {
          return [
            key,
            replaceImageString(nestedValue, replacements, sourcePath, `${location}.containerImage`, replacementEvents)
          ];
        }
        if (key === "alm-examples" && typeof nestedValue === "string") {
          try {
            const parsed = JSON.parse(nestedValue);
            const replaced = replaceImages(
              parsed,
              replacements,
              sourcePath,
              `${location}.alm-examples`,
              replacementEvents,
              externalEvents
            );
            return [key, JSON.stringify(replaced, null, 2)];
          } catch {
            warn("alm-examples parse", `${sourcePath} ${location}.alm-examples is not JSON`);
          }
        }
        return [
          key,
          replaceImages(nestedValue, replacements, sourcePath, `${location}.${key}`, replacementEvents, externalEvents)
        ];
      })
    );
  }
  return value;
}

function loadAndPreviewSources(sourceSpecs) {
  const replacements = replacementBySource();
  const previewDocs = [];
  const replacementEvents = [];
  const externalEvents = [];
  for (const source of sourceSpecs) {
    const sourcePath = source.path;
    const absolutePath = resolve(sourcePath);
    if (!existsSync(absolutePath)) {
      fail("source manifest", `${sourcePath} is missing`);
      continue;
    }
    const documents = parseAllDocuments(readFileSync(absolutePath, "utf8"));
    const errors = documents.flatMap((document) => document.errors);
    if (errors.length > 0) {
      fail("source manifest", `${sourcePath} YAML errors: ${errors.map((error) => error.message).join("; ")}`);
      continue;
    }
    documents.forEach((document, index) => {
      const parsed = document.toJSON();
      const replaced = replaceImages(
        parsed,
        replacements,
        sourcePath,
        `${sourcePath}#${index}`,
        replacementEvents,
        externalEvents
      );
      previewDocs.push({ sourcePath, previewKind: source.previewKind, documentIndex: index, object: replaced });
    });
    pass("source manifest", `${sourcePath} parsed`);
  }
  return { previewDocs, replacementEvents, externalEvents };
}

function buildYaml(previewDocs) {
  return previewDocs
    .map((doc) => {
      const header = `# Source: ${doc.sourcePath} document ${doc.documentIndex}`;
      return `${header}\n${stringify(doc.object).trimEnd()}`;
    })
    .join("\n---\n");
}

function uniqueExternalEvents(events) {
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    const key = `${event.component}|${event.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

function buildCommandPlan(imageRows, previewPaths, status) {
  const tagPushCommands = imageRows.map((row) => ({
    id: `push-${row.component}`,
    phase: "approval-gated-registry",
    command: `docker tag ${row.versionedLocalTag} ${row.target} && docker push ${row.target}`,
    mutation: true,
    requiresExplicitApproval: true,
    purpose: `Make ${row.component} image pullable by the dedicated CRC lab.`
  }));
  const tarName = `.\\test-results\\cywell-opslens-crc-${options.labImageTag}-arm64.tar`;
  return {
    readOnlyCommands: [
      {
        id: "refresh-image-map",
        command: "npm run verify:lab-image-map",
        mutation: false,
        purpose: "Refresh the CRC lab image mapping preview."
      },
      {
        id: "k8s-dry-run-preview",
        command: `oc apply --dry-run=server -f ${previewPaths.k8sYamlOut}`,
        mutation: false,
        purpose: "After CRC API connectivity works, server-validate the Kubernetes preview without applying it."
      },
      {
        id: "fbc-validate-preview",
        command: `opm validate ${previewPaths.fbcYamlOut}`,
        mutation: false,
        purpose: "Validate the FBC preview when opm is available."
      }
    ],
    localSetupCommands: [
      {
        id: "tag-versioned-images",
        command: imageRows
          .map((row) => `docker tag ${row.localTag} ${row.versionedLocalTag}`)
          .join(" && "),
        mutation: false,
        purpose: "Create versioned local image aliases so CRC handoff does not reuse the ambiguous :verify tag."
      },
      {
        id: "package-images",
        command: `docker save ${imageRows.map((row) => row.versionedLocalTag).join(" ")} -o ${tarName}`,
        mutation: false,
        purpose: "Package the versioned Operator/API/dashboard/bundle/catalog images before moving them to the lab host."
      }
    ],
    approvalGatedCommands: tagPushCommands,
    next: nextCommandForStatus(status, previewPaths)
  };
}

function nextCommandForStatus(status, previewPaths) {
  if (status === "NEEDS_CLEAN_WORKTREE") {
    return {
      id: "review-worktree",
      command: "git status --short",
      mutation: false,
      purpose: "Review uncommitted changes before treating image-map evidence as current release evidence."
    };
  }
  if (status === "NEEDS_LOCAL_IMAGES") {
    return {
      id: "build-owned-images",
      command: "npm run verify:images:build",
      mutation: false,
      purpose: "Build missing owned images before CRC image mapping review."
    };
  }
  if (status === "NEEDS_CATALOG_IMAGE") {
    return {
      id: "catalog-toolchain",
      command: "npm run verify:catalog-toolchain",
      mutation: false,
      purpose: "Resolve catalog image/tooling/auth gap before OLM CatalogSource rehearsal."
    };
  }
  if (status === "NEEDS_IMAGE_REPLACEMENTS") {
    return {
      id: "inspect-image-refs",
      command: "rg -n \"quay.io/cywell/opslens-|docker.io/pgvector\" deploy",
      mutation: false,
      purpose: "Inspect deploy manifests when owned image references were not found for preview replacement."
    };
  }
  return {
    id: "review-image-map",
    command: `Get-Content ${previewPaths.markdownOut}`,
    mutation: false,
    purpose: "Review the CRC image mapping preview before any approval-gated registry push."
  };
}

function statusFor(state) {
  if (!state.git.clean) return "NEEDS_CLEAN_WORKTREE";
  if (state.imageRows.some((row) => row.component !== "catalog" && !row.localPresent)) return "NEEDS_LOCAL_IMAGES";
  if (state.imageRows.some((row) => row.component === "catalog" && !row.localPresent)) return "NEEDS_CATALOG_IMAGE";
  if (state.replacementEvents.length === 0) return "NEEDS_IMAGE_REPLACEMENTS";
  return "READY_FOR_CRC_REGISTRY_REVIEW";
}

async function writeJson(path, report) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(sanitizeArtifact(report, sanitize), null, 2)}\n`);
  pass("image map evidence export", `${absolutePath} written`);
}

async function writeMarkdown(path, report) {
  const lines = [
    "# Cywell OpsLens CRC Lab Image Map Preview",
    "",
    `- Status: ${report.status}`,
    `- Branch: ${report.ref.branch}`,
    `- Head: ${report.ref.headSha}`,
    `- Dirty: ${String(report.ref.worktreeDirty)}`,
    `- Kubernetes preview YAML: ${report.previewPaths.k8sYamlOut}`,
    `- FBC preview YAML: ${report.previewPaths.fbcYamlOut}`,
    "",
    "## Current Judgment",
    "",
    report.currentJudgment,
    "",
    "## Next One Command",
    "",
    "```powershell",
    report.commandPlan.next.command,
    "```",
    "",
    "## Image Mapping",
    "",
    ...report.imageRows.map(
      (row) => `- ${row.component}: ${row.source} -> ${row.target} local=${String(row.localPresent)}`
    ),
    "",
    "## External Runtime Gaps",
    "",
    ...(report.externalRuntimeGaps.length > 0
      ? report.externalRuntimeGaps.map((gap) => `- ${gap.component}: ${gap.source} (${gap.reason})`)
      : ["- none"]),
    "",
    "## Boundaries",
    "",
    "- This verifier writes preview artifacts only.",
    "- It does not login to registries, push images, create projects, apply manifests, patch OLSConfig, fetch Secrets, delete, or scale.",
    "- Generated registry commands are approval-gated and scoped to the dedicated CRC lab.",
    "- FBC preview is for `opm validate`; Kubernetes preview is for `oc apply --dry-run=server`. Do not feed the FBC preview to `oc apply`.",
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`)
  ];
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${lines.join("\n")}\n`);
}

async function writePreviewYaml(path, yamlText, label) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${sanitize(yamlText)}\n`);
  pass(`${label} preview YAML export`, `${absolutePath} written`);
}

function printSummary(report) {
  const order = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => order[left.status] - order[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  console.log("");
  console.log(`Cywell OpsLens lab image map preview: status=${report.status}, ${failCount} fail, ${warnCount} warn, ${checks.length} checks`);
  console.log(`Next: ${report.commandPlan.next.command}`);
  if (failCount > 0) process.exitCode = 1;
}

const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
const worktreeStatus = await gitStatusShort();
const git = { branch, headSha, baseRef, clean: worktreeStatus.length === 0, worktreeStatus };
if (git.clean) pass("current worktree", `dirty=false head=${headSha}`);
else warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
if (options.labImageTag === "verify" || options.labImageTag.endsWith(":verify")) {
  fail("CRC lab image tag", `labImageTag=${options.labImageTag} would make the live cluster reuse the ambiguous :verify tag`);
} else {
  pass("CRC lab image tag", `${options.labImageTag} is explicit and versioned`);
}

const localImages = [];
for (const entry of ownedImageMap) {
  localImages.push(await localImage(entry.localTag));
}
const localByTag = new Map(localImages.map((image) => [image.tag, image]));
const imageRows = ownedImageMap.map((entry) => ({
  ...entry,
  target: targetFor(entry),
  versionedLocalTag: versionedLocalTag(entry.localTag),
  localPresent: localByTag.get(entry.localTag)?.present === true
}));

for (const gap of externalRuntimeImages) {
  warn("external runtime image", `${gap.source} is not remapped by lab preview: ${gap.reason}`);
}

const preview = loadAndPreviewSources(options.sources);
const externalRuntimeGaps = uniqueExternalEvents(preview.externalEvents);
if (preview.replacementEvents.length > 0) {
  pass("image replacements", `${preview.replacementEvents.length} image references replaced in preview`);
} else {
  fail("image replacements", "no owned image references were replaced");
}

const previewPaths = {
  evidenceOut: options.evidenceOut,
  markdownOut: options.markdownOut,
  k8sYamlOut: options.k8sYamlOut,
  fbcYamlOut: options.fbcYamlOut
};
const k8sYamlText = buildYaml(preview.previewDocs.filter((doc) => doc.previewKind === "k8s"));
const fbcYamlText = buildYaml(preview.previewDocs.filter((doc) => doc.previewKind === "fbc"));
const status = statusFor({
  git,
  imageRows,
  replacementEvents: preview.replacementEvents
});
const commandPlan = buildCommandPlan(imageRows, previewPaths, status);
const currentJudgment =
  status === "READY_FOR_CRC_REGISTRY_REVIEW"
    ? "The CRC lab image mapping preview is ready for human review. The next real registry push or manifest apply remains approval-gated."
    : "The CRC lab image mapping preview found gaps; follow the next command before any registry push or install attempt.";

const report = {
  schema: "cywell.opslens.lab-image-map-preview.v0.1",
  artifactType: "opslens.lab-image-map-preview.v0.1",
  generatedAt: new Date().toISOString(),
  status,
  actionMode: "previewOnly",
  ref: {
    branch,
    headSha,
    baseRef,
    worktreeDirty: !git.clean,
    worktreeStatus
  },
  registry: options.registry,
  namespace: options.namespace,
  labImageTag: options.labImageTag,
  targetArchitecture: options.targetArchitecture,
  imageRows,
  replacements: preview.replacementEvents,
  externalRuntimeGaps,
  excludedSurfaces: [
    {
      path: "deploy/operator/config/crd/opslens.cywell.io_opslensinstallations.yaml",
      reason: "CRD defaults are not retargeted because this preview does not approve external runtime image remapping."
    },
    {
      path: "operators/cywell-opslens/**",
      reason: "Community Operator submission mirrors are not required for a local CRC lab preview."
    }
  ],
  previewPaths,
  commandPlan,
  mutationBoundary: {
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    registryLoginAttempted: false,
    secretCreated: false,
    olsConfigPatched: false,
    applyDeleteScaleAttempted: false,
    mutationAllowedByThisVerifier: false
  },
  currentJudgment,
  checks
};

await writePreviewYaml(options.k8sYamlOut, k8sYamlText, "Kubernetes");
await writePreviewYaml(options.fbcYamlOut, fbcYamlText, "FBC");
await writeJson(options.evidenceOut, report);
await writeMarkdown(options.markdownOut, report);
printSummary(report);
