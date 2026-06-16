#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lab-server-handoff.json",
  markdownOut: "test-results/cywell-opslens-lab-server-handoff.md",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  labImageMapEvidence: "test-results/cywell-opslens-lab-image-map-preview.json",
  ocpTargetProfileEvidence: "test-results/cywell-opslens-ocp-target-profile.json",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  lightspeedPatchPreviewEvidence: "test-results/cywell-opslens-lightspeed-patch-preview.json",
  installPlanEvidence: "test-results/cywell-opslens-install-approval-plan.json",
  imageTar: "test-results/cywell-opslens-crc-images.tar",
  timeoutMs: 10000
};

const expectedImages = [
  {
    id: "api",
    localTag: "cywell/opslens-api:verify",
    registryTag: "<crc-registry>/cywell-opslens/cywell-opslens-api:verify",
    requiredFor: ["mcp", "api", "aiops"]
  },
  {
    id: "dashboard",
    localTag: "cywell/opslens-dashboard:verify",
    registryTag: "<crc-registry>/cywell-opslens/cywell-opslens-dashboard:verify",
    requiredFor: ["console-plugin", "dashboard"]
  },
  {
    id: "operator",
    localTag: "cywell/opslens-operator:verify",
    registryTag: "<crc-registry>/cywell-opslens/cywell-opslens-operator:verify",
    requiredFor: ["operator", "install"]
  },
  {
    id: "bundle",
    localTag: "cywell/opslens-operator-bundle:verify",
    registryTag: "<crc-registry>/cywell-opslens/cywell-opslens-operator-bundle:verify",
    requiredFor: ["olm", "bundle", "install"]
  },
  {
    id: "catalog",
    localTag: "cywell/opslens-catalog:verify",
    registryTag: "<crc-registry>/cywell-opslens/cywell-opslens-catalog:verify",
    requiredFor: ["olm", "catalog", "install"]
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

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  imageEvidence: parsed.get("image-evidence") ?? defaults.imageEvidence,
  labImageMapEvidence:
    parsed.get("lab-image-map-evidence") ?? defaults.labImageMapEvidence,
  ocpTargetProfileEvidence:
    parsed.get("ocp-target-profile-evidence") ?? defaults.ocpTargetProfileEvidence,
  ocpConnectivityEvidence:
    parsed.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  lightspeedReadinessEvidence:
    parsed.get("lightspeed-readiness-evidence") ?? defaults.lightspeedReadinessEvidence,
  lightspeedPatchPreviewEvidence:
    parsed.get("lightspeed-patch-preview-evidence") ?? defaults.lightspeedPatchPreviewEvidence,
  installPlanEvidence: parsed.get("install-plan-evidence") ?? defaults.installPlanEvidence,
  imageTar: parsed.get("image-tar") ?? defaults.imageTar,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-api>")
    .replace(/\b(?:10|127)(?:\.\d{1,3}){3}\b/g, "<redacted-ip>")
    .replace(/\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/g, "<redacted-ip>")
    .replace(/\b192\.168(?:\.\d{1,3}){2}\b/g, "<redacted-ip>");
}

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail: sanitize(detail), ...extra });
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

function loadJson(path, label) {
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

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function artifactFresh(artifact, currentHeadSha) {
  const ref = artifactRef(artifact);
  return ref.headSha === currentHeadSha && ref.worktreeDirty === false;
}

function sourceSummary(id, label, path, artifact, currentHeadSha, acceptableStatuses) {
  const status = artifact?.status ?? "missing";
  const ref = artifactRef(artifact);
  const fresh = artifactFresh(artifact, currentHeadSha);
  const acceptable = Boolean(artifact) && acceptableStatuses.includes(status);
  if (!artifact) {
    warn(`${label} source`, `${label} is missing`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is stale head=${ref.headSha ?? "missing"} dirty=${String(ref.worktreeDirty ?? "unknown")}`);
  } else if (!acceptable) {
    warn(`${label} source`, `${label} status=${status}`);
  } else {
    pass(`${label} source`, `${label} is fresh and acceptable`);
  }
  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    headSha: ref.headSha,
    worktreeDirty: ref.worktreeDirty,
    fresh,
    acceptable
  };
}

async function dockerInfo() {
  const result = await runCapture("docker", [
    "info",
    "--format",
    "OSType={{.OSType}} ServerVersion={{.ServerVersion}} OperatingSystem={{.OperatingSystem}}"
  ]);
  if (!result.ok) {
    fail("docker engine", result.stderr || "docker info failed");
    return { available: false };
  }
  const osType = /OSType=([^\s]+)/.exec(result.stdout)?.[1] ?? "unknown";
  const serverVersion = /ServerVersion=([^\s]+)/.exec(result.stdout)?.[1] ?? "unknown";
  const operatingSystem = /OperatingSystem=(.+)$/.exec(result.stdout)?.[1] ?? "unknown";
  if (osType === "linux") {
    pass("docker engine", `OSType=linux ServerVersion=${serverVersion}`);
  } else {
    warn("docker engine", `Docker is available but OSType=${osType}; OpenShift image builds expect linux containers`);
  }
  return {
    available: true,
    osType,
    serverVersion,
    operatingSystem
  };
}

async function dockerImage(image) {
  const result = await runCapture("docker", [
    "image",
    "inspect",
    image.localTag,
    "--format",
    "{{.Id}}|{{.Size}}|{{.Architecture}}|{{.Os}}"
  ]);
  if (!result.ok || !result.stdout) {
    warn(`${image.id} local image`, `${image.localTag} is missing`);
    return {
      ...image,
      present: false
    };
  }
  const [id, size, architecture, os] = result.stdout.split("|");
  pass(`${image.id} local image`, `${image.localTag} present (${architecture}/${os})`);
  return {
    ...image,
    present: true,
    imageId: id,
    sizeBytes: Number(size),
    architecture,
    os
  };
}

function tarManifestRepoTags(path) {
  const fd = openTar(path);
  if (fd === undefined) return { repoTags: [], error: "tar could not be opened" };
  try {
    const block = Buffer.alloc(512);
    while (true) {
      const read = readTarBlock(fd, block);
      if (read === 0 || block.every((value) => value === 0)) break;
      const name = block.toString("utf8", 0, 100).replace(/\0.*$/u, "");
      const sizeOctal = block.toString("utf8", 124, 136).replace(/\0.*$/u, "").trim();
      const size = Number.parseInt(sizeOctal || "0", 8);
      const dataBlocks = Math.ceil(size / 512);
      if (name === "manifest.json") {
        const data = Buffer.alloc(dataBlocks * 512);
        let offset = 0;
        while (offset < data.length) {
          const chunk = readTarBlock(fd, data.subarray(offset, offset + 512));
          if (chunk === 0) break;
          offset += chunk;
        }
        const manifest = JSON.parse(data.subarray(0, size).toString("utf8"));
        return {
          repoTags: Array.from(
            new Set(
              manifest.flatMap((entry) =>
                Array.isArray(entry.RepoTags) ? entry.RepoTags.filter(Boolean) : []
              )
            )
          ).sort()
        };
      }
      const skip = Buffer.alloc(512);
      for (let index = 0; index < dataBlocks; index += 1) {
        readTarBlock(fd, skip);
      }
    }
    return { repoTags: [], error: "manifest.json not found in docker save tar" };
  } catch (error) {
    return {
      repoTags: [],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    closeTar(fd);
  }
}

function openTar(path) {
  try {
    return openSync(resolve(path), "r");
  } catch {
    return undefined;
  }
}

function readTarBlock(fd, buffer) {
  return readSync(fd, buffer, 0, buffer.length, null);
}

function closeTar(fd) {
  try {
    closeSync(fd);
  } catch {
    // Best-effort close for read-only tar inspection.
  }
}

function imageTarSummary(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn("CRC image tar", `${path} is missing; create it with docker save before remote lab transfer`);
    return {
      path: absolutePath,
      exists: false
    };
  }
  const stat = statSync(absolutePath);
  const minExpectedBytes = 100 * 1024 * 1024;
  const manifest = tarManifestRepoTags(path);
  const missingTags = expectedImages
    .map((image) => image.localTag)
    .filter((tag) => !manifest.repoTags.includes(tag));
  if (stat.size >= minExpectedBytes && missingTags.length === 0) {
    pass("CRC image tar", `${path} exists size=${Math.round(stat.size / 1024 / 1024)}MiB with all required tags`);
  } else if (stat.size < minExpectedBytes) {
    warn("CRC image tar", `${path} exists but size=${stat.size} bytes looks too small`);
  } else {
    warn("CRC image tar", `${path} is missing required tag(s): ${missingTags.join(", ")}`);
  }
  return {
    path: absolutePath,
    exists: true,
    sizeBytes: stat.size,
    lastWriteTime: stat.mtime.toISOString(),
    sizeLooksValid: stat.size >= minExpectedBytes,
    repoTags: manifest.repoTags,
    missingTags,
    manifestError: manifest.error
  };
}

function buildCommands(state) {
  const saveCommand = `docker save ${expectedImages
    .map((image) => image.localTag)
    .join(" ")} -o .\\test-results\\cywell-opslens-crc-images.tar`;
  const readOnlyCommands = [
    {
      id: "lab-handoff-refresh",
      phase: "local-self-check",
      command: "npm run verify:lab-handoff",
      mutation: false,
      purpose: "Refresh this lab handoff packet."
    },
    {
      id: "crc-target-profile",
      phase: "local-target-check",
      command: "npm run verify:ocp:target-profile -- --require-crc",
      mutation: false,
      purpose: "Confirm the ignored .env points only at the CRC lab target."
    },
    {
      id: "lab-image-map",
      phase: "local-preview",
      command: "npm run verify:lab-image-map",
      mutation: false,
      purpose: "Refresh the CRC registry image-reference preview for Kubernetes and FBC manifests."
    },
    {
      id: "ocp-connectivity",
      phase: "live-read-only",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      mutation: false,
      purpose: "Prove OCP API auth and read-only RBAC before any install attempt."
    },
    {
      id: "lightspeed-readiness",
      phase: "live-read-only",
      command: "npm run verify:lightspeed -- --timeout-ms 30000",
      mutation: false,
      purpose: "Read OLSConfig/CRD readiness before registration."
    },
    {
      id: "lightspeed-patch-preview",
      phase: "preview-only",
      command: "npm run verify:lightspeed:patch-preview",
      mutation: false,
      purpose: "Preview OLSConfig MCP registration diff without applying it."
    },
    {
      id: "install-plan",
      phase: "approval-plan",
      command: "npm run verify:install-plan",
      mutation: false,
      purpose: "Refresh the approval-gated install packet."
    }
  ];

  const localSetupCommands = [
    {
      id: "docker-linux-engine",
      command: "docker info",
      mutation: false,
      requiredWhen: !state.docker.available || state.docker.osType !== "linux",
      purpose: "Docker must answer with OSType=linux before image builds are useful."
    },
    {
      id: "build-images",
      command: "npm run verify:images:build",
      mutation: false,
      requiredWhen:
        state.images.some((image) => !image.present) ||
        !state.sources.imageBuild.acceptable ||
        !state.sources.imageBuild.fresh,
      purpose: "Build Operator/API/dashboard/bundle/catalog images locally without pushing them."
    },
    {
      id: "package-crc-images",
      command: saveCommand,
      mutation: false,
      requiredWhen:
        !state.imageTar.exists ||
        state.imageTar.sizeLooksValid === false ||
        (state.imageTar.missingTags ?? []).length > 0,
      purpose: "Create the portable tar used to move API/dashboard/operator/bundle/catalog images to the lab server."
    }
  ];

  const approvalGatedCommands = [
    {
      id: "create-crc-project",
      command: "oc new-project cywell-opslens",
      mutation: true,
      requiresExplicitApproval: true,
      scope: "dedicated CRC lab only",
      purpose: "Create the target project in the lab cluster before image push or install."
    },
    {
      id: "push-images-to-crc-registry",
      command:
        "docker tag cywell/opslens-api:verify <registry>/cywell-opslens/cywell-opslens-api:verify && docker push <registry>/cywell-opslens/cywell-opslens-api:verify",
      mutation: true,
      requiresExplicitApproval: true,
      scope: "dedicated CRC lab only",
      purpose: "Make built images pullable by CRC. Repeat for dashboard and operator after registry path is confirmed."
    },
    {
      id: "install-opslens-stack",
      command: "approval-gated apply path from test-results/cywell-opslens-install-approval-cluster-admin.md",
      mutation: true,
      requiresExplicitApproval: true,
      scope: "dedicated CRC lab only",
      purpose: "Install OpsLens after images are pullable and the approval packet is reviewed."
    }
  ];

  return {
    readOnlyCommands,
    localSetupCommands,
    approvalGatedCommands,
    oneAtATimeNextCommand: firstNextCommand(state, localSetupCommands, readOnlyCommands)
  };
}

function firstNextCommand(state, localSetupCommands, readOnlyCommands) {
  const setup = localSetupCommands.find((command) => command.requiredWhen);
  if (setup) return setup;
  if (
    !state.sources.labImageMap.acceptable ||
    !state.sources.labImageMap.fresh
  ) {
    return readOnlyCommands.find((command) => command.id === "lab-image-map");
  }
  if (
    !state.sources.ocpTargetProfile.acceptable ||
    !state.sources.ocpTargetProfile.fresh ||
    state.sources.ocpTargetProfile.status !== "CRC_SANDBOX_READY"
  ) {
    return readOnlyCommands.find((command) => command.id === "crc-target-profile");
  }
  if (!state.sources.ocpConnectivity.acceptable || !state.sources.ocpConnectivity.fresh || state.ocpClassification !== "api-ready") {
    return readOnlyCommands.find((command) => command.id === "ocp-connectivity");
  }
  if (!state.sources.lightspeedReadiness.acceptable || !state.sources.lightspeedReadiness.fresh) {
    return readOnlyCommands.find((command) => command.id === "lightspeed-readiness");
  }
  if (!state.sources.lightspeedPatchPreview.acceptable || !state.sources.lightspeedPatchPreview.fresh) {
    return readOnlyCommands.find((command) => command.id === "lightspeed-patch-preview");
  }
  if (!state.sources.installPlan.acceptable || !state.sources.installPlan.fresh) {
    return readOnlyCommands.find((command) => command.id === "install-plan");
  }
  return {
    id: "ready-for-explicit-crc-image-handoff",
    phase: "local-review",
    command: "Get-Content .\\test-results\\cywell-opslens-lab-server-handoff.md",
    mutation: false,
    purpose: "Read the handoff packet before the next approval-gated action changes the dedicated CRC lab."
  };
}

function statusFor(state) {
  const hardBlockers = [
    !state.docker.available,
    state.docker.available && state.docker.osType !== "linux",
    state.images.some((image) => !image.present),
    !state.imageTar.exists,
    state.imageTar.exists && state.imageTar.sizeLooksValid === false,
    state.imageTar.exists && (state.imageTar.missingTags ?? []).length > 0,
    state.sources.imageBuild.status !== "PASS",
    ["NEEDS_LOCAL_IMAGES", "NEEDS_CATALOG_IMAGE"].includes(
      state.sources.labImageMap.status
    )
  ].filter(Boolean);
  if (hardBlockers.length > 0) return "NEEDS_LOCAL_IMAGE_PACKAGE";
  if (
    state.worktreeDirty ||
    !state.sources.labImageMap.fresh ||
    !state.sources.ocpTargetProfile.fresh ||
    !state.sources.ocpConnectivity.fresh
  ) {
    return "NEEDS_CURRENT_EVIDENCE";
  }
  if (!state.sources.labImageMap.acceptable) return "NEEDS_IMAGE_REF_MAPPING";
  if (state.sources.ocpTargetProfile.status !== "CRC_SANDBOX_READY") return "NEEDS_CRC_TARGET";
  if (state.ocpClassification !== "api-ready") return "NEEDS_OCP_LIVE_EVIDENCE";
  const staleSources = Object.values(state.sources).filter((source) => !source.fresh);
  if (staleSources.length > 0) return "NEEDS_CURRENT_EVIDENCE";
  if (!state.sources.lightspeedPatchPreview.acceptable || !state.sources.installPlan.acceptable) {
    return "NEEDS_INSTALL_PREVIEW_EVIDENCE";
  }
  return "READY_FOR_EXPLICIT_CRC_HANDOFF";
}

async function writeJson(path, report) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
  pass("lab handoff evidence export", `${absolutePath} written`);
}

async function writeMarkdown(path, report) {
  const lines = [
    "# Cywell OpsLens Lab Server Handoff",
    "",
    `- Status: ${report.status}`,
    `- Branch: ${report.ref.branch}`,
    `- Head: ${report.ref.headSha}`,
    `- Dirty: ${String(report.ref.worktreeDirty)}`,
    `- Action mode: ${report.actionMode}`,
    "",
    "## Current Judgment",
    "",
    report.currentJudgment,
    "",
    "## One-at-a-time Next Command",
    "",
    "```powershell",
    report.commandPlan.oneAtATimeNextCommand.command,
    "```",
    "",
    "## Local Image Package",
    "",
    `- Tar exists: ${String(report.imageTar.exists)}`,
    `- Tar size: ${report.imageTar.sizeBytes ? `${Math.round(report.imageTar.sizeBytes / 1024 / 1024)}MiB` : "missing"}`,
    `- Tar missing tags: ${(report.imageTar.missingTags ?? []).join(", ") || "none"}`,
    ...report.images.map((image) => `- ${image.localTag}: ${image.present ? "present" : "missing"}`),
    "",
    "## Evidence Sources",
    "",
    ...Object.values(report.sources).map(
      (source) => `- ${source.id}: status=${source.status}, fresh=${String(source.fresh)}, acceptable=${String(source.acceptable)}`
    ),
    "",
    "## Boundaries",
    "",
    "- This verifier does not create projects, push images, apply manifests, patch OLSConfig, fetch Secrets, delete, or scale.",
    "- CRC lab image push/import and install commands are approval-gated because they change the dedicated lab cluster.",
    "- The company OCP target is intentionally not part of this handoff.",
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`)
  ];

  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${lines.join("\n")}\n`);
}

function printSummary(report) {
  const statusWeight = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  console.log("");
  console.log(
    `Cywell OpsLens lab server handoff: status=${report.status}, ${failCount} fail, ${warnCount} warn, ${checks.length} checks`
  );
  console.log(`Next: ${report.commandPlan.oneAtATimeNextCommand.command}`);
  if (failCount > 0) process.exitCode = 1;
}

const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
const worktreeStatus = await gitStatusShort();
if (worktreeStatus.length === 0) {
  pass("current worktree", `dirty=false head=${headSha}`);
} else {
  warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
}

const artifacts = {
  imageBuild: loadJson(options.imageEvidence, "image build readiness"),
  labImageMap: loadJson(options.labImageMapEvidence, "lab image map preview"),
  ocpTargetProfile: loadJson(options.ocpTargetProfileEvidence, "OCP target profile"),
  ocpConnectivity: loadJson(options.ocpConnectivityEvidence, "OCP connectivity"),
  lightspeedReadiness: loadJson(options.lightspeedReadinessEvidence, "Lightspeed readiness"),
  lightspeedPatchPreview: loadJson(options.lightspeedPatchPreviewEvidence, "Lightspeed patch preview"),
  installPlan: loadJson(options.installPlanEvidence, "install approval plan")
};

const docker = await dockerInfo();
const images = [];
for (const image of expectedImages) {
  images.push(await dockerImage(image));
}
const imageTar = imageTarSummary(options.imageTar);

const sources = {
  imageBuild: sourceSummary("imageBuild", "image build readiness", options.imageEvidence, artifacts.imageBuild, headSha, ["PASS"]),
  labImageMap: sourceSummary(
    "labImageMap",
    "lab image map preview",
    options.labImageMapEvidence,
    artifacts.labImageMap,
    headSha,
    ["READY_FOR_CRC_REGISTRY_REVIEW"]
  ),
  ocpTargetProfile: sourceSummary(
    "ocpTargetProfile",
    "OCP target profile",
    options.ocpTargetProfileEvidence,
    artifacts.ocpTargetProfile,
    headSha,
    ["CRC_SANDBOX_READY"]
  ),
  ocpConnectivity: sourceSummary(
    "ocpConnectivity",
    "OCP connectivity",
    options.ocpConnectivityEvidence,
    artifacts.ocpConnectivity,
    headSha,
    ["PASS"]
  ),
  lightspeedReadiness: sourceSummary(
    "lightspeedReadiness",
    "Lightspeed readiness",
    options.lightspeedReadinessEvidence,
    artifacts.lightspeedReadiness,
    headSha,
    ["PASS", "NEEDS_CONFIGURATION"]
  ),
  lightspeedPatchPreview: sourceSummary(
    "lightspeedPatchPreview",
    "Lightspeed patch preview",
    options.lightspeedPatchPreviewEvidence,
    artifacts.lightspeedPatchPreview,
    headSha,
    ["PATCH_PLANNED"]
  ),
  installPlan: sourceSummary(
    "installPlan",
    "install approval plan",
    options.installPlanEvidence,
    artifacts.installPlan,
    headSha,
    ["NEEDS_EVIDENCE", "APPROVAL_REQUIRED", "READY_FOR_APPROVAL"]
  )
};

const state = {
  docker,
  images,
  imageTar,
  sources,
  ocpClassification: artifacts.ocpConnectivity?.classification ?? "missing",
  worktreeDirty: worktreeStatus.length > 0
};

const commandPlan = buildCommands(state);
const status = statusFor(state);
const currentJudgment =
  status === "READY_FOR_EXPLICIT_CRC_HANDOFF"
    ? "Local build artifacts, tar package, CRC target evidence, OCP live auth, Lightspeed preview, and install approval evidence are ready. The next step changes only the dedicated CRC lab and still needs explicit approval."
    : "The lab handoff is not ready yet; follow the one-at-a-time next command before touching the dedicated CRC lab.";

const report = {
  schema: "cywell.opslens.lab-server-handoff.v0.1",
  artifactType: "opslens.lab-server-handoff.v0.1",
  generatedAt: new Date().toISOString(),
  startedAt,
  status,
  actionMode: "localEvidenceOnly",
  ref: {
    branch,
    headSha,
    baseRef,
    worktreeDirty: worktreeStatus.length > 0,
    worktreeStatus
  },
  targetLab: {
    purpose: "Dedicated CRC/OpenShift lab server for Cywell OpsLens development",
    recommendedHost: "Windows lab PC with Docker Desktop, WSL2, CRC, oc, Node/npm, and optional external GPU runtime",
    companyOcpUsed: false,
    gpuStrategy: "Keep GPU model runtime external to CRC first; integrate in-cluster GPU only after OpsLens API/dashboard/Lightspeed path is stable."
  },
  mutationBoundary: {
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    secretCreated: false,
    olsConfigPatched: false,
    applyDeleteScaleAttempted: false,
    mutationAllowedByThisVerifier: false
  },
  sources,
  docker,
  images,
  imageTar,
  commandPlan,
  currentJudgment,
  checks
};

await writeJson(options.evidenceOut, report);
await writeMarkdown(options.markdownOut, report);
printSummary(report);
