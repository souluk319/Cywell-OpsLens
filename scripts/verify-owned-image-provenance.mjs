#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-owned-image-provenance.json",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  timeoutMs: 10000
};

const fallbackImages = [
  {
    name: "operator",
    image: "quay.io/cywell/opslens-operator:0.1.0",
    localTag: "cywell/opslens-operator:verify",
    required: true
  },
  {
    name: "api",
    image: "quay.io/cywell/opslens-api:0.1.0",
    localTag: "cywell/opslens-api:verify",
    required: true
  },
  {
    name: "dashboard",
    image: "quay.io/cywell/opslens-dashboard:0.1.0",
    localTag: "cywell/opslens-dashboard:verify",
    required: true
  },
  {
    name: "bundle",
    image: "quay.io/cywell/opslens-operator-bundle:0.1.0",
    localTag: "cywell/opslens-operator-bundle:verify",
    required: true
  },
  {
    name: "catalog",
    image: "quay.io/cywell/opslens-catalog:0.1.0",
    localTag: "cywell/opslens-catalog:verify",
    required: false
  }
];

const requiredImageNames = new Set(["operator", "api", "dashboard", "bundle"]);
const checks = [];
const startedAt = new Date().toISOString();

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
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

function sanitize(value) {
  return String(value)
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
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

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
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

function localBuildTag(image) {
  return image
    .replace(/^quay\.io\/cywell\//, "cywell/")
    .replace(/^docker\.io\/cywell\//, "cywell/")
    .replace(/:[^:]+$/, ":verify");
}

function imageInventory(imageEvidence) {
  if (!imageEvidence) return fallbackImages;
  const internal = imageEvidence.internalBuilds ?? [];
  const packaging = imageEvidence.packagingBuilds ?? [];
  const combined = [...internal, ...packaging]
    .filter((image) => image?.name && image?.image)
    .map((image) => ({
      name: image.name,
      image: image.image,
      localTag: image.localTag ?? localBuildTag(image.image),
      required: requiredImageNames.has(image.name)
    }));

  for (const fallback of fallbackImages) {
    if (!combined.some((image) => image.name === fallback.name)) {
      combined.push(fallback);
    }
  }
  return combined;
}

async function dockerAvailable() {
  const result = await runCapture("docker", ["--version"]);
  if (!result.ok) {
    warn("CLI docker", "docker unavailable locally; owned image provenance needs local image inspect evidence");
    return false;
  }
  pass("CLI docker", result.stdout);
  return true;
}

async function inspectLocalImage(image) {
  const result = await runCapture("docker", ["image", "inspect", image.localTag]);
  if (!result.ok) {
    const detail = result.stderr || result.stdout || "docker image inspect failed";
    if (image.required) {
      warn(`${image.name} local image inspect`, `${image.localTag}: ${detail}`);
    } else {
      warn(`${image.name} optional local image inspect`, `${image.localTag}: ${detail}`);
    }
    return {
      ...image,
      status: image.required ? "NEEDS_EVIDENCE" : "WARN",
      missingEvidence: [`docker image inspect ${image.localTag} did not return local metadata`]
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const inspected = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!inspected || typeof inspected !== "object") {
      throw new Error("docker image inspect returned no image object");
    }

    const config = inspected.Config ?? {};
    const rootFs = inspected.RootFS ?? {};
    const repoDigests = Array.isArray(inspected.RepoDigests) ? inspected.RepoDigests : [];
    const exposedPorts = Object.keys(config.ExposedPorts ?? {});
    const labels = config.Labels ?? {};
    const user = config.User ?? "";
    const rootfsLayerCount = Array.isArray(rootFs.Layers) ? rootFs.Layers.length : 0;

    pass(
      `${image.name} local image inspect`,
      `${image.localTag} id=${inspected.Id ?? "unknown"} user=${user || "unspecified"} ports=${exposedPorts.join(",") || "none"}`
    );

    return {
      ...image,
      status: "PASS",
      imageId: inspected.Id ?? "unknown",
      created: inspected.Created ?? "unknown",
      os: inspected.Os ?? "unknown",
      architecture: inspected.Architecture ?? "unknown",
      repoTags: inspected.RepoTags ?? [],
      repoDigests,
      dockerVersion: inspected.DockerVersion ?? "unknown",
      user: user || "unspecified",
      workingDir: config.WorkingDir ?? "",
      entrypoint: config.Entrypoint ?? [],
      cmd: config.Cmd ?? [],
      exposedPorts,
      labels,
      rootfsLayerCount,
      missingEvidence: repoDigests.length === 0
        ? ["local image has no registry repo digest yet because it has not been pushed"]
        : []
    };
  } catch (error) {
    fail(
      `${image.name} local image inspect parse`,
      error instanceof Error ? error.message : String(error)
    );
    return {
      ...image,
      status: "BLOCKED",
      missingEvidence: ["docker image inspect output could not be parsed"]
    };
  }
}

function checkImageEvidence(imageEvidence, currentHeadSha, currentWorktreeDirty) {
  const missingEvidence = [];
  const requiredActualBuilds = [];

  if (currentWorktreeDirty) {
    missingEvidence.push(`current git worktree dirty=true currentHead=${currentHeadSha}`);
  }
  if (!imageEvidence) {
    missingEvidence.push("run npm run verify:images:build before collecting owned image provenance");
    return { missingEvidence, requiredActualBuilds };
  }

  if (imageEvidence.status !== "PASS") {
    missingEvidence.push(`image readiness status=${imageEvidence.status ?? "missing"}`);
  }
  if (imageEvidence.worktreeDirty !== false) {
    missingEvidence.push(`image readiness worktreeDirty=${String(imageEvidence.worktreeDirty ?? "unknown")}`);
  }
  if (imageEvidence.headSha !== currentHeadSha) {
    missingEvidence.push(`image readiness headSha=${imageEvidence.headSha ?? "missing"} currentHead=${currentHeadSha}`);
  }
  if (imageEvidence.actualBuildRequested !== true) {
    missingEvidence.push("run npm run verify:images:build so provenance is chained to actual local builds");
  }

  const actualBuildStatus = new Map(
    (imageEvidence.actualBuilds ?? []).map((build) => [build.name, build.status])
  );
  for (const name of requiredImageNames) {
    const status = actualBuildStatus.get(name);
    requiredActualBuilds.push({ name, status: status ?? "missing" });
    if (status !== "PASS") {
      missingEvidence.push(`${name} actual image build status=${status ?? "missing"}`);
    }
  }

  return { missingEvidence, requiredActualBuilds };
}

function verifierStatus(images, missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (images.some((image) => image.required && image.status === "BLOCKED")) return "BLOCKED";
  if (
    missingEvidence.length > 0 ||
    images.some((image) => image.required && image.status !== "PASS")
  ) {
    return "NEEDS_EVIDENCE";
  }
  return "PASS";
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const imageEvidence = loadJsonArtifact(options.imageEvidence, "Image readiness evidence");
  const dockerOk = await dockerAvailable();
  const expectedImages = imageInventory(imageEvidence);
  const images = [];

  if (dockerOk) {
    for (const image of expectedImages) {
      images.push(await inspectLocalImage(image));
    }
  } else {
    for (const image of expectedImages) {
      images.push({
        ...image,
        status: image.required ? "NEEDS_EVIDENCE" : "WARN",
        missingEvidence: ["docker CLI is unavailable for local image inspect"]
      });
    }
  }

  const imageEvidenceCheck = checkImageEvidence(imageEvidence, headSha, worktreeDirty);
  for (const gap of imageEvidenceCheck.missingEvidence) {
    warn("owned image provenance evidence gap", gap);
  }

  const requiredImages = images.filter((image) => image.required).map((image) => image.name);
  const requiredPassed = images
    .filter((image) => image.required)
    .every((image) => image.status === "PASS");
  const missingEvidence = [
    ...imageEvidenceCheck.missingEvidence,
    ...images.flatMap((image) =>
      image.required
        ? (image.missingEvidence ?? []).map((item) => `${image.name}: ${item}`)
        : []
    )
  ];
  const optionalWarnings = images
    .filter((image) => !image.required && image.status !== "PASS")
    .map((image) => `${image.name}: ${(image.missingEvidence ?? []).join("; ") || image.status}`);
  const status = verifierStatus(images, missingEvidence);

  const artifact = {
    schema: "cywell.opslens.owned-image-provenance.v0.1",
    artifactType: "opslens.owned-image-provenance.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnlyEvidenceOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    sourceEvidence: {
      imageReadiness: resolve(options.imageEvidence),
      imageReadinessStatus: imageEvidence?.status ?? "missing",
      imageReadinessHeadSha: imageEvidence?.headSha ?? "missing",
      imageReadinessWorktreeDirty: imageEvidence?.worktreeDirty ?? "unknown",
      actualBuildRequested: imageEvidence?.actualBuildRequested === true,
      requiredActualBuilds: imageEvidenceCheck.requiredActualBuilds
    },
    requiredImages,
    summary: {
      requiredPassed,
      optionalWarnings,
      inspectedCount: images.filter((image) => image.status === "PASS").length,
      repoDigestsPresent: images
        .filter((image) => image.required)
        .every((image) => (image.repoDigests ?? []).length > 0)
    },
    images,
    missingEvidence,
    risk: [
      "Local image IDs are useful release evidence but are not a registry publication proof until images are pushed, signed, and scanned.",
      "RepoDigests can be empty for local-only images; release approval must still require immutable registry digests before customer install.",
      "Catalog image provenance can remain warning-only while registry.redhat.io authentication is unavailable locally."
    ],
    rollbackPath: [
      "No rollback is required because this verifier only reads local Docker metadata.",
      "If a local image was built from the wrong commit, rebuild with npm run verify:images:build from a clean worktree and rerun this verifier.",
      "If a published image later fails, publish a corrected patch tag and update catalog references rather than deleting consumed tags."
    ],
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  pass("owned image provenance export", `${resolve(options.evidenceOut)} written without registry or cluster mutation`);

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
  console.log(`Cywell OpsLens owned image provenance: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("owned image provenance verifier runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] owned image provenance verifier runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
