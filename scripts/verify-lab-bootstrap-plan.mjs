#!/usr/bin/env node
import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";
import { sanitizeArtifact, sanitizeCommonSensitive } from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lab-bootstrap-plan.json",
  markdownOut: "test-results/cywell-opslens-lab-bootstrap-plan.md",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  labHandoffEvidence: "test-results/cywell-opslens-lab-server-handoff.json",
  ocpTargetProfileEvidence: "test-results/cywell-opslens-ocp-target-profile.json",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  imageTar: "test-results/cywell-opslens-crc-images.tar",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  fbc: "deploy/catalog/fbc/catalog.yaml",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  sample: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  appStack: "deploy/operator/config/apps/opslens-stack.yaml",
  manager: "deploy/operator/config/manager/manager.yaml",
  minRamGb: 64,
  timeoutMs: 10000
};

const ownedImages = [
  "cywell/opslens-api:verify",
  "cywell/opslens-dashboard:verify",
  "cywell/opslens-operator:verify",
  "cywell/opslens-operator-bundle:verify",
  "cywell/opslens-catalog:verify"
];

const portableImages = [
  "cywell/opslens-api:verify",
  "cywell/opslens-dashboard:verify",
  "cywell/opslens-operator:verify",
  "cywell/opslens-operator-bundle:verify"
];

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
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
    } else {
      flags.add(key);
    }
  }
  return { values, flags };
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  labMachine: parsed.flags.has("lab-machine"),
  requireCrcRunning: parsed.flags.has("require-crc-running"),
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.values.get("markdown-out") ?? defaults.markdownOut,
  imageEvidence: parsed.values.get("image-evidence") ?? defaults.imageEvidence,
  labHandoffEvidence: parsed.values.get("lab-handoff-evidence") ?? defaults.labHandoffEvidence,
  ocpTargetProfileEvidence:
    parsed.values.get("ocp-target-profile-evidence") ?? defaults.ocpTargetProfileEvidence,
  ocpConnectivityEvidence:
    parsed.values.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  imageTar: parsed.values.get("image-tar") ?? defaults.imageTar,
  manifestPaths: [
    parsed.values.get("csv") ?? defaults.csv,
    parsed.values.get("fbc") ?? defaults.fbc,
    parsed.values.get("catalog-source") ?? defaults.catalogSource,
    parsed.values.get("sample") ?? defaults.sample,
    parsed.values.get("app-stack") ?? defaults.appStack,
    parsed.values.get("manager") ?? defaults.manager
  ],
  minRamGb: Number(parsed.values.get("min-ram-gb") ?? defaults.minRamGb),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];

function sanitize(value) {
  return sanitizeCommonSensitive(value)
    .replace(/\b(?:api|console|oauth)[A-Za-z0-9.-]*(?:crc|ocp|openshift)[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-endpoint>")
    .replace(/\b(?:127)(?:\.\d{1,3}){3}\b/g, "<redacted-localhost>")
    .replace(/\b(?:100|169\.254)(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>");
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

async function runCapture(command, args = [], timeoutMs = options.timeoutMs) {
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

async function commandProbe(id, command, args = [], required = false) {
  let result = await runCapture(command, args);
  const detail = result.ok ? result.stdout || `${command} available` : result.stderr || `${command} unavailable`;
  if (result.ok) {
    pass(`${id} tool`, detail.split(/\r?\n/)[0]);
  } else if (required) {
    fail(`${id} tool`, detail);
  } else {
    warn(`${id} tool`, detail);
  }
  return {
    id,
    command,
    args,
    available: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    required
  };
}

async function npmProbe() {
  let result = await runCapture("npm", ["--version"]);
  if (!result.ok && process.env.npm_execpath) {
    result = await runCapture(process.execPath, [process.env.npm_execpath, "--version"]);
  }
  if (!result.ok && platform() === "win32") {
    result = await runCapture("cmd", ["/c", "npm", "--version"]);
  }
  const detail = result.ok ? result.stdout || "npm available" : result.stderr || "npm unavailable";
  if (result.ok) {
    pass("npm tool", detail.split(/\r?\n/)[0]);
  } else {
    fail("npm tool", detail);
  }
  return {
    id: "npm",
    command: "npm --version",
    available: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    required: true
  };
}

function loadJson(path, id, acceptableStatuses = []) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(`${id} evidence`, `${path} is missing`);
    return {
      id,
      path: absolutePath,
      exists: false,
      acceptable: false,
      fresh: false,
      status: "missing"
    };
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    const status = artifact.status ?? "unknown";
    pass(`${id} evidence`, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${status}`);
    return {
      id,
      path: absolutePath,
      exists: true,
      artifact,
      artifactType: artifact.artifactType ?? artifact.schema ?? "unknown",
      status,
      headSha: artifact.headSha ?? artifact.ref?.headSha,
      worktreeDirty: artifact.worktreeDirty ?? artifact.ref?.worktreeDirty,
      acceptable: acceptableStatuses.includes(status)
    };
  } catch (error) {
    fail(`${id} evidence`, `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {
      id,
      path: absolutePath,
      exists: true,
      acceptable: false,
      fresh: false,
      status: "invalid"
    };
  }
}

function markFresh(source, headSha) {
  return {
    ...source,
    fresh: source.headSha === headSha && source.worktreeDirty === false
  };
}

function inspectTar(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn("portable image tar", `${path} is missing`);
    return { path: absolutePath, exists: false, sizeLooksValid: false, repoTags: [] };
  }
  const stat = statSync(absolutePath);
  const sizeMiB = Math.round(stat.size / 1024 / 1024);
  const sizeLooksValid = stat.size > 100 * 1024 * 1024;
  const repoTags = readDockerSaveRepoTags(absolutePath);
  if (sizeLooksValid) {
    pass("portable image tar", `${path} exists size=${sizeMiB}MiB repoTags=${repoTags.length}`);
  } else {
    warn("portable image tar", `${path} exists but size=${stat.size} bytes looks too small`);
  }
  for (const tag of portableImages) {
    if (repoTags.includes(tag)) {
      pass("portable image tar tag", `${tag} included`);
    } else {
      warn("portable image tar tag", `${tag} is not proven in ${path}`);
    }
  }
  return {
    path: absolutePath,
    exists: true,
    sizeBytes: stat.size,
    sizeMiB,
    sizeLooksValid,
    lastWriteTime: stat.mtime.toISOString(),
    repoTags
  };
}

function readDockerSaveRepoTags(path) {
  const tags = new Set();
  let handle;
  try {
    handle = openSync(path, "r");
    let position = 0;
    const header = Buffer.alloc(512);
    while (readSync(handle, header, 0, 512, position) === 512) {
      if (header.every((byte) => byte === 0)) break;
      const name = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
      const sizeText = header.toString("utf8", 124, 136).replace(/\0.*$/, "").trim();
      const size = Number.parseInt(sizeText || "0", 8);
      const contentPosition = position + 512;
      if (name === "manifest.json" && Number.isFinite(size) && size > 0 && size < 10 * 1024 * 1024) {
        const content = Buffer.alloc(size);
        readSync(handle, content, 0, size, contentPosition);
        for (const entry of JSON.parse(content.toString("utf8"))) {
          for (const tag of entry.RepoTags ?? []) tags.add(sanitize(tag));
        }
        break;
      }
      position += 512 + Math.ceil(size / 512) * 512;
    }
  } catch (error) {
    warn("portable image tar manifest", `could not inspect docker save manifest: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
  return [...tags].sort();
}

async function inspectDockerImage(tag) {
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
  pass("local image", `${tag} present (${architecture}/${os})`);
  return {
    tag,
    present: true,
    imageId,
    sizeBytes: Number(size),
    architecture,
    os
  };
}

function imageRole(image) {
  const text = String(image);
  if (/opslens-api/.test(text)) return { category: "owned-core", component: "api", localTag: "cywell/opslens-api:verify", portable: true };
  if (/opslens-dashboard/.test(text)) return { category: "owned-core", component: "dashboard", localTag: "cywell/opslens-dashboard:verify", portable: true };
  if (/opslens-operator-bundle/.test(text)) return { category: "olm-package", component: "bundle", localTag: "cywell/opslens-operator-bundle:verify", portable: true };
  if (/opslens-operator/.test(text)) return { category: "owned-core", component: "operator", localTag: "cywell/opslens-operator:verify", portable: true };
  if (/opslens-catalog/.test(text)) return { category: "olm-catalog", component: "catalog", localTag: "cywell/opslens-catalog:verify", portable: false };
  if (/opslens-vllm/.test(text)) return { category: "external-runtime", component: "vllm", localTag: undefined, portable: false };
  if (/pgvector/.test(text)) return { category: "external-runtime", component: "pgvector", localTag: undefined, portable: false };
  return { category: "unknown", component: "unknown", localTag: undefined, portable: false };
}

function collectImageRefs(value, location, refs = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageRefs(item, `${location}[${index}]`, refs));
    return refs;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "image" && typeof nested === "string" && /[./][^/\s]+[:@][^\s]+/.test(nested)) {
        refs.push({ image: nested, location: `${location}.image` });
      } else {
        collectImageRefs(nested, `${location}.${key}`, refs);
      }
    }
  }
  return refs;
}

function loadManifestImageRefs(paths) {
  const refs = [];
  for (const path of paths) {
    const absolutePath = resolve(path);
    if (!existsSync(absolutePath)) {
      warn("image manifest source", `${path} is missing`);
      continue;
    }
    try {
      const documents = parseAllDocuments(readFileSync(absolutePath, "utf8"));
      const errors = documents.flatMap((document) => document.errors);
      if (errors.length > 0) {
        fail("image manifest source", `${path} has YAML errors: ${errors.map((error) => error.message).join("; ")}`);
        continue;
      }
      documents.forEach((document, index) => {
        const parsed = document.toJSON();
        collectImageRefs(parsed, `${path}#${index}`, refs);
      });
      pass("image manifest source", `${path} parsed`);
    } catch (error) {
      fail("image manifest source", `${path} read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const byImage = new Map();
  for (const ref of refs) {
    if (!byImage.has(ref.image)) byImage.set(ref.image, { image: ref.image, locations: [] });
    byImage.get(ref.image).locations.push(ref.location);
  }
  return [...byImage.values()].sort((left, right) => left.image.localeCompare(right.image));
}

function buildImageRefPlan(refs, images, imageTar) {
  const localByTag = new Map(images.map((image) => [image.tag, image]));
  const rows = refs.map((ref) => {
    const role = imageRole(ref.image);
    const local = role.localTag ? localByTag.get(role.localTag) : undefined;
    const tarIncluded = role.localTag ? imageTar.repoTags.includes(role.localTag) : false;
    const pullability =
      role.category === "external-runtime"
        ? "external-runtime-review-required"
        : role.category === "olm-catalog" && !local?.present
          ? "catalog-image-build-required"
          : role.localTag && local?.present && (!role.portable || tarIncluded)
            ? "local-artifact-ready"
            : role.localTag && local?.present && role.portable && !tarIncluded
              ? "portable-tar-missing-tag"
              : "local-artifact-missing";
    return {
      ...ref,
      ...role,
      localPresent: local?.present === true,
      tarIncluded,
      pullability,
      desiredLabRef:
        role.localTag && role.category !== "external-runtime"
          ? `<crc-registry>/cywell-opslens/${role.localTag.replace("cywell/", "cywell-").replace(":verify", ":verify")}`
          : undefined
    };
  });
  const blocking = rows.filter((row) =>
    ["owned-core", "olm-package"].includes(row.category)
      ? row.pullability !== "local-artifact-ready"
      : row.category === "olm-catalog"
        ? row.pullability !== "local-artifact-ready"
        : false
  );
  const externalRuntime = rows.filter((row) => row.category === "external-runtime");
  if (blocking.length === 0) {
    pass("manifest image pullability plan", `all owned/catalog manifest refs have local artifacts mapped (${rows.length} refs)`);
  } else {
    warn("manifest image pullability plan", `${blocking.length} owned/catalog refs need image mapping before CRC install`);
  }
  if (externalRuntime.length > 0) {
    warn("external runtime image refs", `${externalRuntime.length} refs require external runtime mirror/certification decision`);
  }
  return {
    refs: rows,
    blocking,
    externalRuntime,
    allOwnedCatalogReady: blocking.length === 0
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
    return { available: false, osType: "unknown" };
  }
  const osType = /OSType=([^\s]+)/.exec(result.stdout)?.[1] ?? "unknown";
  const serverVersion = /ServerVersion=([^\s]+)/.exec(result.stdout)?.[1] ?? "unknown";
  const operatingSystem = /OperatingSystem=(.+)$/.exec(result.stdout)?.[1] ?? "unknown";
  if (osType === "linux") {
    pass("docker engine", `OSType=linux ServerVersion=${serverVersion}`);
  } else {
    fail("docker engine", `Docker is available but OSType=${osType}; CRC/OpenShift images need linux containers`);
  }
  return { available: true, osType, serverVersion, operatingSystem };
}

async function crcStatusProbe() {
  const result = await runCapture("crc", ["status"]);
  if (!result.ok) {
    if (options.labMachine) {
      warn("crc status", result.stderr || "crc status unavailable");
    }
    return {
      available: false,
      running: false,
      openshiftRunning: false,
      detail: result.stderr
    };
  }
  const running = /CRC VM:\s+Running/i.test(result.stdout);
  const openshiftRunning = /OpenShift:\s+Running/i.test(result.stdout);
  if (running && openshiftRunning) {
    pass("crc status", "CRC VM and OpenShift are running");
  } else if (options.labMachine || options.requireCrcRunning) {
    warn("crc status", result.stdout || "CRC is available but not running");
  }
  return {
    available: true,
    running,
    openshiftRunning,
    detail: result.stdout
  };
}

async function nvidiaProbe() {
  const result = await runCapture("nvidia-smi", [
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader"
  ]);
  if (!result.ok) {
    warn("nvidia gpu", "nvidia-smi is unavailable; GPU runtime can remain external or be added later");
    return { available: false, required: false };
  }
  pass("nvidia gpu", result.stdout.split(/\r?\n/)[0] || "nvidia-smi available");
  return {
    available: true,
    gpus: result.stdout.split(/\r?\n/).filter(Boolean)
  };
}

function machineSummary() {
  const ramGb = Math.round((totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  const summary = {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuCount: cpus().length,
    ramGb,
    minRamGb: options.minRamGb
  };
  if (options.labMachine && summary.platform !== "win32") {
    warn("lab OS", `expected Windows lab host, detected ${summary.platform}`);
  } else {
    pass("host OS", `${summary.platform}/${summary.arch} release=${summary.release}`);
  }
  if (options.labMachine && ramGb < options.minRamGb) {
    warn("lab RAM", `detected ${ramGb}GiB; recommended minimum is ${options.minRamGb}GiB`);
  } else {
    pass("host RAM", `${ramGb}GiB detected`);
  }
  return summary;
}

function registryTrapMatrix() {
  return [
    {
      symptom: "docker login reports credential helper or user interaction errors",
      classification: "docker-credential-helper-blocked",
      firstCheck: "Use a fresh DOCKER_CONFIG directory with a minimal config.json, then rerun registry login from the lab host.",
      mutation: false
    },
    {
      symptom: "docker push fails with x509 certificate signed by unknown authority",
      classification: "registry-tls-untrusted",
      firstCheck: "Prefer a same-host registry path or reviewed CA trust setup; do not keep retrying blind pushes.",
      mutation: false
    },
    {
      symptom: "localhost:5000 times out through IPv6 or refuses connection",
      classification: "registry-port-forward-not-listening",
      firstCheck: "Keep the oc port-forward terminal open and use 127.0.0.1 from the same machine that owns the port-forward.",
      mutation: false
    },
    {
      symptom: "crc image import is unknown",
      classification: "crc-image-import-unsupported",
      firstCheck: "Use the supported registry/Operator image path for this CRC version instead of relying on removed crc image commands.",
      mutation: false
    }
  ];
}

function buildCommandPlan(state) {
  const windowsTar = ".\\test-results\\cywell-opslens-crc-images.tar";
  const saveImages =
    "docker save cywell/opslens-api:verify cywell/opslens-dashboard:verify cywell/opslens-operator:verify cywell/opslens-operator-bundle:verify -o .\\test-results\\cywell-opslens-crc-images.tar";
  const readOnly = [
    {
      id: "refresh-bootstrap",
      where: "company workstation",
      command: "npm run verify:lab-bootstrap",
      mutation: false,
      purpose: "Refresh this prep packet without touching OCP."
    },
    {
      id: "build-images",
      where: "company workstation",
      command: "npm run verify:images:build",
      mutation: false,
      purpose: "Build API/dashboard/operator images locally without pushing them."
    },
    {
      id: "package-images",
      where: "company workstation",
      command: saveImages,
      mutation: false,
      purpose: "Create the portable image tar for the lab host, including the OLM bundle image."
    },
    {
      id: "catalog-toolchain",
      where: "company workstation",
      command: "npm run verify:catalog-toolchain",
      mutation: false,
      purpose: "Classify the catalog image build/auth gap before any CRC OLM install rehearsal."
    },
    {
      id: "lab-image-map",
      where: "company workstation",
      command: "npm run verify:lab-image-map",
      mutation: false,
      purpose: "Generate the CRC registry image-reference preview without pushing or applying anything."
    },
    {
      id: "lab-machine-check",
      where: "home Windows lab",
      command: "npm run verify:lab-bootstrap -- --lab-machine --require-crc-running",
      mutation: false,
      purpose: "After the repo and image tar are available on the lab PC, verify CRC/Docker/oc/GPU readiness."
    },
    {
      id: "ocp-connectivity",
      where: "company workstation after .env points to lab API",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      mutation: false,
      purpose: "Prove the workstation can reach the lab OpenShift API before install."
    },
    {
      id: "lab-handoff",
      where: "company workstation after live connectivity works",
      command: "npm run verify:lab-handoff",
      mutation: false,
      purpose: "Recompute the one-command handoff packet."
    }
  ];

  const humanSetup = [
    {
      id: "copy-image-tar",
      where: "operator action",
      command: `Copy ${windowsTar} to the home Windows lab host, then run docker load -i <copied-tar-path>`,
      mutation: false,
      purpose: "Move already-built images to the lab Docker engine."
    },
    {
      id: "start-crc",
      where: "home Windows lab",
      command: "crc start && crc status",
      mutation: false,
      purpose: "Start the dedicated lab OpenShift instance."
    },
    {
      id: "refresh-env",
      where: "company workstation",
      command: "Update ignored .env with the lab CRC OCP API token/base URL, then run verify:env.",
      mutation: false,
      purpose: "Switch local readers to the dedicated lab target without committing secrets."
    }
  ];

  const approvalGated = [
    {
      id: "create-lab-project",
      where: "home Windows lab",
      command: "oc new-project cywell-opslens",
      mutation: true,
      requiresExplicitApproval: true,
      purpose: "Create the isolated lab namespace."
    },
    {
      id: "make-images-pullable",
      where: "home Windows lab",
      command: "Use the reviewed CRC registry path from the lab packet to tag and push API/dashboard/operator images.",
      mutation: true,
      requiresExplicitApproval: true,
      purpose: "Publish images only to the dedicated CRC lab registry."
    },
    {
      id: "install-opslens",
      where: "home Windows lab",
      command: "Follow test-results/cywell-opslens-install-approval-cluster-admin.md after review.",
      mutation: true,
      requiresExplicitApproval: true,
      purpose: "Install OpsLens only after preflight evidence is reviewed."
    }
  ];

  const next = (() => {
    if (!state.docker.available || state.docker.osType !== "linux") return readOnly.find((item) => item.id === "build-images");
    if (!state.images.filter((image) => portableImages.includes(image.tag)).every((image) => image.present)) {
      return readOnly.find((item) => item.id === "build-images");
    }
    if (!state.imageTar.exists || !state.imageTar.sizeLooksValid) return readOnly.find((item) => item.id === "package-images");
    if (!state.imageRefPlan.allOwnedCatalogReady) {
      const tarGap = state.imageRefPlan.blocking.some((row) => row.pullability === "portable-tar-missing-tag");
      return readOnly.find((item) => item.id === (tarGap ? "package-images" : "lab-image-map"));
    }
    if (options.labMachine && (!state.crcStatus.running || !state.crcStatus.openshiftRunning)) {
      return humanSetup.find((item) => item.id === "start-crc");
    }
    if (options.labMachine) return readOnly.find((item) => item.id === "ocp-connectivity");
    return humanSetup.find((item) => item.id === "copy-image-tar");
  })();

  return { readOnly, humanSetup, approvalGated, next };
}

function statusFor(state) {
  if (!state.git.clean) return "NEEDS_CLEAN_WORKTREE";
  if (!state.tools.git.available || !state.tools.node.available || !state.tools.npm.available) return "NEEDS_TOOLING";
  if (!state.docker.available || state.docker.osType !== "linux") return "NEEDS_TOOLING";
  if (!state.sources.imageBuild.acceptable || !state.sources.imageBuild.fresh) return "NEEDS_LOCAL_ARTIFACTS";
  if (!state.images.filter((image) => portableImages.includes(image.tag)).every((image) => image.present)) {
    return "NEEDS_LOCAL_ARTIFACTS";
  }
  if (!state.imageTar.exists || !state.imageTar.sizeLooksValid) return "NEEDS_LOCAL_ARTIFACTS";
  if (!state.imageRefPlan.allOwnedCatalogReady) return "NEEDS_IMAGE_REF_MAPPING";
  if (options.labMachine) {
    if (!state.tools.crc.available || !state.tools.oc.available) return "NEEDS_LAB_MACHINE_SETUP";
    if (state.machine.ramGb < options.minRamGb) return "NEEDS_LAB_MACHINE_SETUP";
    if (options.requireCrcRunning && (!state.crcStatus.running || !state.crcStatus.openshiftRunning)) {
      return "NEEDS_LAB_MACHINE_SETUP";
    }
    if (state.ocpClassification !== "api-ready") return "NEEDS_OCP_CONNECTIVITY";
    return "READY_FOR_APPROVAL_GATED_LAB_INSTALL_REVIEW";
  }
  return "READY_FOR_REMOTE_LAB_PREP";
}

async function writeJson(path, report) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(sanitizeArtifact(report, sanitize), null, 2)}\n`);
  pass("lab bootstrap evidence export", `${absolutePath} written`);
}

async function writeMarkdown(path, report) {
  const lines = [
    "# Cywell OpsLens Lab Bootstrap Plan",
    "",
    `- Status: ${report.status}`,
    `- Mode: ${report.mode}`,
    `- Branch: ${report.ref.branch}`,
    `- Head: ${report.ref.headSha}`,
    `- Dirty: ${String(report.ref.worktreeDirty)}`,
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
    "## What Is Ready",
    "",
    `- Docker Linux engine: ${String(report.docker.available && report.docker.osType === "linux")}`,
    `- Portable image tar: ${report.imageTar.exists ? `${report.imageTar.sizeMiB}MiB` : "missing"}`,
    ...report.images.map((image) => `- ${image.tag}: ${image.present ? "present" : "missing"}`),
    "",
    "## Known CRC Registry Traps",
    "",
    ...report.registryTrapMatrix.map(
      (trap) => `- ${trap.classification}: ${trap.firstCheck}`
    ),
    "",
    "## Boundaries",
    "",
    "- This verifier does not create projects, push images, login to registries, apply manifests, patch OLSConfig, fetch Secrets, delete, or scale.",
    "- Home CRC project creation, image push/import, Operator install, pod readiness smoke, and OLSConfig registration stay approval-gated.",
    "- Company OCP is not used for this bootstrap path.",
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
  const order = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => order[left.status] - order[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  console.log("");
  console.log(`Cywell OpsLens lab bootstrap: status=${report.status}, ${failCount} fail, ${warnCount} warn, ${checks.length} checks`);
  console.log(`Next: ${report.commandPlan.next.command}`);
  if (failCount > 0) process.exitCode = 1;
}

const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
const worktreeStatus = await gitStatusShort();
const git = {
  branch,
  headSha,
  baseRef,
  clean: worktreeStatus.length === 0,
  worktreeStatus
};
if (git.clean) pass("current worktree", `dirty=false head=${headSha}`);
else warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);

const machine = machineSummary();
const tools = {
  git: await commandProbe("git", "git", ["--version"], true),
  node: await commandProbe("node", "node", ["--version"], true),
  npm: await npmProbe(),
  ssh: await commandProbe("ssh", "ssh", ["-V"], false),
  scp: await commandProbe("scp", platform() === "win32" ? "where" : "which", ["scp"], false),
  oc: await commandProbe("oc", "oc", ["version", "--client=true"], options.labMachine),
  crc: await commandProbe("crc", "crc", ["version"], options.labMachine)
};

const docker = await dockerInfo();
const images = [];
for (const image of ownedImages) {
  images.push(await inspectDockerImage(image));
}
const imageTar = inspectTar(options.imageTar);
const manifestImageRefs = loadManifestImageRefs(options.manifestPaths);
const imageRefPlan = buildImageRefPlan(manifestImageRefs, images, imageTar);
const crcStatus = await crcStatusProbe();
const nvidia = await nvidiaProbe();

const rawSources = {
  imageBuild: loadJson(options.imageEvidence, "image build", ["PASS"]),
  labHandoff: loadJson(options.labHandoffEvidence, "lab handoff", [
    "READY_FOR_EXPLICIT_CRC_HANDOFF",
    "NEEDS_OCP_LIVE_EVIDENCE",
    "NEEDS_CURRENT_EVIDENCE"
  ]),
  ocpTargetProfile: loadJson(options.ocpTargetProfileEvidence, "OCP target profile", ["CRC_SANDBOX_READY"]),
  ocpConnectivity: loadJson(options.ocpConnectivityEvidence, "OCP connectivity", ["PASS", "NEEDS_EVIDENCE"])
};

const sources = Object.fromEntries(
  Object.entries(rawSources).map(([key, source]) => [key, markFresh(source, headSha)])
);
for (const source of Object.values(sources)) {
  if (!source.exists) continue;
  if (!source.fresh) {
    warn(`${source.id} source freshness`, `stale head=${source.headSha ?? "missing"} dirty=${String(source.worktreeDirty ?? "unknown")}`);
  } else if (!source.acceptable) {
    warn(`${source.id} source status`, `status=${source.status}`);
  } else {
    pass(`${source.id} source`, "fresh and acceptable");
  }
}

const ocpClassification = rawSources.ocpConnectivity.artifact?.classification ?? "missing";
const state = {
  git,
  machine,
  tools,
  docker,
  images,
  imageTar,
  manifestImageRefs,
  imageRefPlan,
  crcStatus,
  nvidia,
  sources,
  ocpClassification
};
const commandPlan = buildCommandPlan(state);
const status = statusFor(state);
const mode = options.labMachine ? "lab-machine" : "remote-prep";
const currentJudgment =
  status === "READY_FOR_REMOTE_LAB_PREP"
    ? "The workstation has the local build artifacts and portable image package ready. The next useful action is moving the tar to the dedicated Windows CRC lab host; cluster and registry mutations remain approval-gated."
    : status === "READY_FOR_APPROVAL_GATED_LAB_INSTALL_REVIEW"
      ? "The lab host tooling and live OCP evidence are ready for a human-reviewed install decision. The verifier still did not mutate the cluster or registry."
      : "The bootstrap path is not ready yet; follow the next command before attempting CRC registry or install actions.";

const report = {
  schema: "cywell.opslens.lab-bootstrap-plan.v0.1",
  artifactType: "opslens.lab-bootstrap-plan.v0.1",
  generatedAt: new Date().toISOString(),
  mode,
  status,
  actionMode: "localEvidenceOnly",
  ref: {
    branch,
    headSha,
    baseRef,
    worktreeDirty: !git.clean,
    worktreeStatus: git.worktreeStatus
  },
  targetLab: {
    recommendedHost: "Dedicated Windows power PC with Docker Desktop/WSL2, CRC, oc, Node/npm, SSH/SCP, and optional NVIDIA GPU runtime",
    minRamGb: options.minRamGb,
    companyOcpUsed: false,
    gpuStrategy: "Use the GPU for external vLLM/runtime experiments first; move GPU workloads into OpenShift only after API/dashboard/Lightspeed are stable."
  },
  mutationBoundary: {
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    registryLoginAttempted: false,
    secretCreated: false,
    olsConfigPatched: false,
    applyDeleteScaleAttempted: false,
    mutationAllowedByThisVerifier: false
  },
  machine,
  tools,
  docker,
  images,
  imageTar,
  manifestImageRefs,
  imageRefPlan,
  crcStatus,
  nvidia,
  ocpClassification,
  sources,
  registryTrapMatrix: registryTrapMatrix(),
  commandPlan,
  currentJudgment,
  checks
};

await writeJson(options.evidenceOut, report);
await writeMarkdown(options.markdownOut, report);
printSummary(report);
