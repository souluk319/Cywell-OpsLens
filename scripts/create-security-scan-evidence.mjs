#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  securityEvidenceDir: "docs/release/evidence/security",
  timeoutMs: 600000
};

const fallbackOwnedImages = [
  { name: "operator", image: "quay.io/cywell/opslens-operator:0.1.0", localTag: "cywell/opslens-operator:verify", required: true },
  { name: "api", image: "quay.io/cywell/opslens-api:0.1.0", localTag: "cywell/opslens-api:verify", required: true },
  { name: "dashboard", image: "quay.io/cywell/opslens-dashboard:0.1.0", localTag: "cywell/opslens-dashboard:verify", required: true },
  { name: "bundle", image: "quay.io/cywell/opslens-operator-bundle:0.1.0", localTag: "cywell/opslens-operator-bundle:verify", required: true },
  { name: "catalog", image: "quay.io/cywell/opslens-catalog:0.1.0", localTag: "cywell/opslens-catalog:verify", required: false }
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
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  ownedImageProvenance: parsed.values.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenance,
  externalRuntime: parsed.values.get("external-runtime-evidence") ?? defaults.externalRuntime,
  securityEvidenceDir: parsed.values.get("security-evidence-dir") ?? defaults.securityEvidenceDir,
  name: parsed.values.get("name") ?? (parsed.flags.has("all") ? "all" : "owned-required"),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  execute: parsed.flags.has("execute"),
  executeDockerFallback: parsed.flags.has("execute-docker-fallback"),
  trivyImage: parsed.values.get("trivy-image") ?? "aquasec/trivy:latest",
  syftImage: parsed.values.get("syft-image") ?? "anchore/syft:latest",
  trivyTimeout: parsed.values.get("trivy-timeout") ?? "30m",
  trivyScanners: parsed.values.get("trivy-scanners") ?? "vuln",
  includeExternal: parsed.flags.has("include-external"),
  imageOverride: parsed.values.get("image"),
  scanRefOverride: parsed.values.get("scan-ref")
};

const startedAt = new Date().toISOString();
const checks = [];
const results = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function hasSecretLikeMaterial(value) {
  const text = String(value ?? "");
  return [
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]{12,}/i,
    /--token\s+(?!<redacted>)[^\s]+/i,
    /(auth|token|password|passwd|secret|api[_-]?key)["']?\s*[:=]\s*["']?(?!<redacted>|null|false|true)[A-Za-z0-9._~+/=-]{8,}/i,
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i
  ].some((pattern) => pattern.test(text));
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

async function runCapture(command, args, timeoutMs = options.timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024
    });
    return { ok: true, stdout: sanitize(stdout), stderr: sanitize(stderr), exitCode: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout ?? ""),
      stderr: sanitize(error.stderr ?? error.message),
      exitCode: typeof error.code === "number" ? error.code : 1,
      signal: error.signal ?? undefined,
      timedOut: Boolean(error.killed || error.signal)
    };
  }
}

function dockerSafeName(value) {
  return String(value ?? "scanner")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "scanner";
}

function scannerContainerName(target, scanner) {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return dockerSafeName(`cywell-opslens-${target.name}-${scanner}-${suffix}`);
}

async function cleanupDockerContainer(containerName, label) {
  const cleanup = await runCapture("docker", ["rm", "-f", containerName], 30000);
  if (cleanup.ok) {
    warn(`${label} scanner cleanup`, `removed stale scanner container ${containerName}`);
  }
}

async function runDockerScanner(containerName, args, label) {
  const result = await runCapture("docker", args);
  if (!result.ok) {
    await cleanupDockerContainer(containerName, label);
  }
  return result;
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args, 10000);
  if (!result.ok || !result.stdout.trim()) return fallback;
  return result.stdout.trim().split(/\r?\n/).at(-1) || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"], 10000);
  if (!result.ok || !result.stdout.trim()) return [];
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(sanitize);
}

function loadJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} is missing at ${absolutePath}`);
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

function loadExistingRunnerEvidence(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) return undefined;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return undefined;
  }
}

function canPreserveExecutionEvidence(existing, headSha, worktreeDirty) {
  const requiredTargets = new Set(["operator", "api", "dashboard", "bundle"]);
  const passedTargets = new Set(
    (existing?.results ?? [])
      .filter((result) =>
        requiredTargets.has(result.name) &&
        result.executionMode === "docker-fallback" &&
        result.vulnerabilityReport?.status === "PASS" &&
        result.sbom?.status === "PASS" &&
        result.reviewDraft?.status === "PASS"
      )
      .map((result) => result.name)
  );
  return (
    existing?.artifactType === "opslens.security-scan-evidence-runner.v0.1" &&
    existing?.status === "EVIDENCE_WRITTEN" &&
    existing?.actionMode === "scanEvidenceLocalWrite" &&
    existing?.ref?.headSha === headSha &&
    existing?.ref?.worktreeDirty === false &&
    worktreeDirty === false &&
    existing?.options?.executeDockerFallback === true &&
    existing?.scannerImages?.trivy?.digestResolved === true &&
    existing?.scannerImages?.syft?.digestResolved === true &&
    [...requiredTargets].every((target) => passedTargets.has(target)) &&
    existing?.registryMutationAttempted === false &&
    existing?.clusterMutationAttempted === false &&
    existing?.mutationAllowedByThisVerifier === false
  );
}

function ownedTargets(provenance) {
  const images = Array.isArray(provenance?.images) && provenance.images.length > 0
    ? provenance.images.map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        scanRef: image.localTag ?? image.image ?? "unknown",
        source: "owned-local",
        required: (provenance.requiredImages ?? ["operator", "api", "dashboard", "bundle"]).includes(image.name)
      }))
    : fallbackOwnedImages.map((image) => ({
        name: image.name,
        image: image.image,
        scanRef: image.localTag,
        source: "owned-fallback",
        required: image.required
      }));

  for (const fallback of fallbackOwnedImages) {
    if (!images.some((image) => image.name === fallback.name)) {
      images.push({
        name: fallback.name,
        image: fallback.image,
        scanRef: fallback.localTag,
        source: "owned-fallback",
        required: fallback.required
      });
    }
  }
  return images;
}

function externalTargets(plan) {
  return (plan?.externalImages ?? []).map((image) => ({
    name: image.name ?? "unknown",
    image: image.image ?? "unknown",
    scanRef: image.image ?? "unknown",
    source: "external-runtime",
    required: true
  }));
}

function selectTargets(targets) {
  if (options.name === "all") return targets;
  if (options.name === "owned-required") {
    return targets.filter((target) => target.required && target.source !== "external-runtime");
  }
  return targets.filter((target) => target.name === options.name);
}

function targetSpecificOverride(target, key) {
  return parsed.values.get(`${target.name}-${key}`) ?? parsed.values.get(key);
}

function applyTargetOverrides(target) {
  const scanRef = targetSpecificOverride(target, "scan-ref");
  const image = targetSpecificOverride(target, "image") ?? scanRef;
  if (!scanRef && !image) return target;
  return {
    ...target,
    image: image ?? target.image,
    scanRef: scanRef ?? image ?? target.scanRef,
    originalImage: target.image,
    originalScanRef: target.scanRef,
    candidateOverride: true
  };
}

function pathsFor(target) {
  return {
    vulnerabilityReport: resolve(options.securityEvidenceDir, `${target.name}-vulnerability.json`),
    sbom: resolve(options.securityEvidenceDir, `${target.name}-sbom.spdx.json`),
    reviewDraft: resolve(options.securityEvidenceDir, `${target.name}-security-review.draft.json`)
  };
}

function failedResultEvidence() {
  return results.flatMap((result) => {
    const evidence = [];
    if (result.vulnerabilityReport?.status && result.vulnerabilityReport.status !== "PASS") {
      evidence.push(`${result.name} vulnerability scan failed exit=${result.vulnerabilityReport.exitCode}`);
    }
    if (result.sbom?.status && result.sbom.status !== "PASS") {
      evidence.push(`${result.name} SBOM generation failed exit=${result.sbom.exitCode}`);
    }
    if (result.reviewDraft?.status && result.reviewDraft.status !== "PASS") {
      evidence.push(`${result.name} security review draft failed exit=${result.reviewDraft.exitCode}`);
    }
    return evidence;
  });
}

function workspacePath(absolutePath) {
  const workspaceRoot = resolve(".");
  return `/workspace/${absolutePath
    .replace(workspaceRoot, "")
    .replace(/^[/\\]+/, "")
    .replace(/\\/g, "/")}`;
}

function commandPlan(target) {
  const paths = pathsFor(target);
  return {
    target,
    paths,
    cli: [
      {
        id: `trivy-${target.name}`,
        command: `trivy image --timeout ${options.trivyTimeout} --scanners ${options.trivyScanners} --format json --output ${paths.vulnerabilityReport} ${target.scanRef}`,
        writesLocalEvidence: true
      },
      {
        id: `syft-${target.name}`,
        command: `syft ${target.scanRef} -o spdx-json > ${paths.sbom}`,
        writesLocalEvidence: true
      },
      {
        id: `review-draft-${target.name}`,
        command: `npm run evidence:security-review:draft -- --name ${target.name} --image ${target.image} --evidence-dir ${options.securityEvidenceDir} --vulnerability-report ${paths.vulnerabilityReport} --sbom ${paths.sbom} --force`,
        writesLocalEvidence: true
      }
    ],
    dockerFallback: [
      {
        id: `trivy-docker-${target.name}`,
        command: `docker run --rm -v ${resolve(".")}:/workspace -v /var/run/docker.sock:/var/run/docker.sock ${options.trivyImage} image --timeout ${options.trivyTimeout} --scanners ${options.trivyScanners} --format json --output /workspace/docs/release/evidence/security/${target.name}-vulnerability.json ${target.scanRef}`,
        writesLocalEvidence: true
      },
      {
        id: `syft-docker-${target.name}`,
        command: `docker run --rm -v ${resolve(".")}:/workspace -v /var/run/docker.sock:/var/run/docker.sock ${options.syftImage} ${target.scanRef} -o spdx-json=/workspace/docs/release/evidence/security/${target.name}-sbom.spdx.json`,
        writesLocalEvidence: true
      }
    ]
  };
}

async function cliAvailable(name, args) {
  const result = await runCapture(name, args, 10000);
  if (result.ok) pass(`CLI ${name}`, result.stdout.split(/\r?\n/)[0] || "available");
  else warn(`CLI ${name}`, `${name} unavailable locally`);
  return result.ok;
}

async function resolveScannerImage(name, image) {
  if (!options.executeDockerFallback) {
    return {
      name,
      requested: image,
      immutableRef: image,
      digestResolved: false,
      pullStatus: "not-requested"
    };
  }

  const pull = await runCapture("docker", ["pull", image]);
  if (!pull.ok) {
    fail(`${name} scanner image pull`, pull.stderr || pull.stdout || `docker pull ${image} failed`);
    return {
      name,
      requested: image,
      immutableRef: image,
      digestResolved: false,
      pullStatus: "failed"
    };
  }

  const inspect = await runCapture("docker", [
    "image",
    "inspect",
    image,
    "--format",
    "{{json .RepoDigests}}"
  ]);
  if (!inspect.ok) {
    fail(`${name} scanner image inspect`, inspect.stderr || inspect.stdout || `docker image inspect ${image} failed`);
    return {
      name,
      requested: image,
      immutableRef: image,
      digestResolved: false,
      pullStatus: "pulled"
    };
  }

  try {
    const repoDigests = JSON.parse(inspect.stdout.trim());
    const immutableRef = Array.isArray(repoDigests) && repoDigests.length > 0
      ? repoDigests[0]
      : image;
    if (immutableRef.includes("@sha256:")) {
      pass(`${name} scanner image digest`, `${image} -> ${immutableRef}`);
    } else {
      warn(`${name} scanner image digest`, `${image} did not expose a RepoDigest; evidence remains tag-based`);
    }
    return {
      name,
      requested: image,
      immutableRef,
      digestResolved: immutableRef.includes("@sha256:"),
      pullStatus: "pulled"
    };
  } catch (error) {
    fail(`${name} scanner image digest parse`, error instanceof Error ? error.message : String(error));
    return {
      name,
      requested: image,
      immutableRef: image,
      digestResolved: false,
      pullStatus: "pulled"
    };
  }
}

async function executeForTarget(plan) {
  await mkdir(dirname(plan.paths.vulnerabilityReport), { recursive: true });
  const trivy = await runCapture("trivy", [
    "image",
    "--timeout",
    options.trivyTimeout,
    "--scanners",
    options.trivyScanners,
    "--format",
    "json",
    "--output",
    plan.paths.vulnerabilityReport,
    plan.target.scanRef
  ]);
  const syft = await runCapture("syft", [
    plan.target.scanRef,
    "-o",
    "spdx-json"
  ]);
  if (syft.ok) {
    await writeFile(plan.paths.sbom, syft.stdout, "utf8");
  }
  results.push({
    name: plan.target.name,
    scanRef: plan.target.scanRef,
    vulnerabilityReport: {
      path: plan.paths.vulnerabilityReport,
      status: trivy.ok ? "PASS" : "FAIL",
      exitCode: trivy.exitCode,
      stderrTail: trivy.stderr.slice(-1000)
    },
    sbom: {
      path: plan.paths.sbom,
      status: syft.ok ? "PASS" : "FAIL",
      exitCode: syft.exitCode,
      stderrTail: syft.stderr.slice(-1000)
    }
  });
  if (trivy.ok && syft.ok) {
    pass(`${plan.target.name} scan evidence`, `wrote ${plan.paths.vulnerabilityReport} and ${plan.paths.sbom}`);
  } else {
    fail(`${plan.target.name} scan evidence`, `trivy=${trivy.exitCode} syft=${syft.exitCode}`);
  }
}

async function executeDockerFallbackForTarget(plan, scannerImages) {
  await mkdir(dirname(plan.paths.vulnerabilityReport), { recursive: true });
  const workspaceMount = `${resolve(".")}:/workspace`;
  const dockerSocketMount = "/var/run/docker.sock:/var/run/docker.sock";
  const vulnerabilityWorkspacePath = workspacePath(plan.paths.vulnerabilityReport);
  const sbomWorkspacePath = workspacePath(plan.paths.sbom);
  const trivyImage = scannerImages.trivy.immutableRef;
  const syftImage = scannerImages.syft.immutableRef;
  const trivyContainer = scannerContainerName(plan.target, "trivy");
  const syftContainer = scannerContainerName(plan.target, "syft");

  const trivy = await runDockerScanner(trivyContainer, [
    "run",
    "--rm",
    "--name",
    trivyContainer,
    "--label",
    "cywell.opslens.scanner=true",
    "--label",
    `cywell.opslens.target=${plan.target.name}`,
    "--label",
    "cywell.opslens.scanner.kind=trivy",
    "-v",
    workspaceMount,
    "-v",
    dockerSocketMount,
    trivyImage,
    "image",
    "--timeout",
    options.trivyTimeout,
    "--scanners",
    options.trivyScanners,
    "--format",
    "json",
    "--output",
    vulnerabilityWorkspacePath,
    plan.target.scanRef
  ], `${plan.target.name} trivy`);
  const syft = await runDockerScanner(syftContainer, [
    "run",
    "--rm",
    "--name",
    syftContainer,
    "--label",
    "cywell.opslens.scanner=true",
    "--label",
    `cywell.opslens.target=${plan.target.name}`,
    "--label",
    "cywell.opslens.scanner.kind=syft",
    "-v",
    workspaceMount,
    "-v",
    dockerSocketMount,
    syftImage,
    plan.target.scanRef,
    "-o",
    `spdx-json=${sbomWorkspacePath}`
  ], `${plan.target.name} syft`);
  const reviewDraft = trivy.ok && syft.ok
    ? await runCapture("node", [
        "scripts/create-security-review-evidence-draft.mjs",
        "--name",
        plan.target.name,
        "--image",
        plan.target.image,
        "--evidence-dir",
        options.securityEvidenceDir,
        "--vulnerability-report",
        plan.paths.vulnerabilityReport,
        "--sbom",
        plan.paths.sbom,
        "--force"
      ], 60000)
    : { ok: false, exitCode: 1, stdout: "", stderr: "scan/SBOM evidence was not complete" };

  results.push({
    name: plan.target.name,
    scanRef: plan.target.scanRef,
    executionMode: "docker-fallback",
    scannerImages,
    vulnerabilityReport: {
      path: plan.paths.vulnerabilityReport,
      status: trivy.ok ? "PASS" : "FAIL",
      exitCode: trivy.exitCode,
      stderrTail: trivy.stderr.slice(-1000)
    },
    sbom: {
      path: plan.paths.sbom,
      status: syft.ok ? "PASS" : "FAIL",
      exitCode: syft.exitCode,
      stderrTail: syft.stderr.slice(-1000)
    },
    reviewDraft: {
      path: plan.paths.reviewDraft,
      status: reviewDraft.ok ? "PASS" : "FAIL",
      exitCode: reviewDraft.exitCode,
      stderrTail: reviewDraft.stderr.slice(-1000)
    }
  });

  if (trivy.ok && syft.ok && reviewDraft.ok) {
    pass(
      `${plan.target.name} docker fallback scan evidence`,
      `wrote ${plan.paths.vulnerabilityReport}, ${plan.paths.sbom}, and ${plan.paths.reviewDraft}`
    );
  } else {
    fail(
      `${plan.target.name} docker fallback scan evidence`,
      `trivy=${trivy.exitCode} syft=${syft.exitCode} reviewDraft=${reviewDraft.exitCode}`
    );
  }
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  const existingRunnerEvidence = loadExistingRunnerEvidence(options.evidenceOut);
  const preserveExecutionEvidence =
    !options.execute &&
    !options.executeDockerFallback &&
    canPreserveExecutionEvidence(existingRunnerEvidence, headSha, worktreeDirty);
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const provenance = loadJson(options.ownedImageProvenance, "owned image provenance");
  const externalPlan = loadJson(options.externalRuntime, "external runtime plan");
  const targets = [
    ...ownedTargets(provenance),
    ...(options.includeExternal || options.name === "all" ? externalTargets(externalPlan) : [])
  ];
  const selectedBaseTargets = selectTargets(targets);
  if (selectedBaseTargets.length > 1 && (options.imageOverride || options.scanRefOverride)) {
    fail("scan target override", "--image/--scan-ref can only be used when a single target is selected; use --<name>-image or --<name>-scan-ref for multi-target runs");
  }
  const selectedTargets = selectedBaseTargets.map(applyTargetOverrides);
  if (selectedTargets.length === 0) {
    fail("scan target selection", `no targets matched name=${options.name}`);
  } else {
    pass(
      "scan target selection",
      selectedTargets
        .map((target) =>
          target.candidateOverride
            ? `${target.name}=${target.scanRef} (override from ${target.originalScanRef})`
            : target.name
        )
        .join(", ")
    );
  }

  const trivyAvailable = await cliAvailable("trivy", ["--version"]);
  const syftAvailable = await cliAvailable("syft", ["version"]);
  const dockerAvailable = await cliAvailable("docker", ["--version"]);
  const plans = selectedTargets.map(commandPlan);
  const scannerImages = {
    trivy: await resolveScannerImage("trivy", options.trivyImage),
    syft: await resolveScannerImage("syft", options.syftImage)
  };
  let artifactScannerImages = scannerImages;
  let artifactResults = results;

  if (options.execute) {
    if (!trivyAvailable || !syftAvailable) {
      fail("execute prerequisites", "execute mode requires local trivy and syft CLIs; docker fallback commands are plan-only");
    } else {
      for (const plan of plans) {
        await executeForTarget(plan);
      }
    }
  } else if (options.executeDockerFallback) {
    if (!dockerAvailable) {
      fail("docker fallback prerequisites", "execute-docker-fallback mode requires Docker");
    } else if (!scannerImages.trivy.digestResolved || !scannerImages.syft.digestResolved) {
      fail("docker fallback scanner image digests", "scanner images must resolve to immutable RepoDigests before evidence collection");
    } else {
      for (const plan of plans) {
        await executeDockerFallbackForTarget(plan, scannerImages);
      }
    }
  } else if (preserveExecutionEvidence) {
    artifactScannerImages = existingRunnerEvidence.scannerImages;
    artifactResults = existingRunnerEvidence.results ?? [];
    pass(
      "scan runner execution evidence preserved",
      `preserved ${artifactResults.length} Docker fallback result(s) from current clean head ${headSha}`
    );
  } else {
    pass("scan runner mode", "plan-only; pass --execute or --execute-docker-fallback to write vulnerability/SBOM evidence locally");
  }

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : options.execute || options.executeDockerFallback || preserveExecutionEvidence
      ? "EVIDENCE_WRITTEN"
      : "PLAN_READY";
  const evidenceOutPath = resolve(options.evidenceOut);
  pass("security scan runner export", `${evidenceOutPath} will be written`);

  const artifact = {
    schema: "cywell.opslens.security-scan-evidence-runner.v0.1",
    artifactType: "opslens.security-scan-evidence-runner.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode:
      options.execute || options.executeDockerFallback || preserveExecutionEvidence
        ? "scanEvidenceLocalWrite"
        : "scanEvidencePlanOnly",
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
    options: {
      name: options.name,
      execute: options.execute,
      executeDockerFallback:
        options.executeDockerFallback ||
        Boolean(existingRunnerEvidence?.options?.executeDockerFallback && preserveExecutionEvidence),
      preservedExecutionEvidence: preserveExecutionEvidence,
      includeExternal: options.includeExternal,
      imageOverride: options.imageOverride,
      scanRefOverride: options.scanRefOverride,
      securityEvidenceDir: resolve(options.securityEvidenceDir),
      trivyTimeout: options.trivyTimeout,
      trivyScanners: options.trivyScanners
    },
    scannerImages: artifactScannerImages,
    cli: {
      trivy: trivyAvailable,
      syft: syftAvailable,
      docker: dockerAvailable
    },
    commandPlans: plans,
    results: artifactResults,
    missingEvidence: [
      ...(!trivyAvailable && !options.executeDockerFallback && !preserveExecutionEvidence ? ["trivy CLI unavailable for --execute mode"] : []),
      ...(!syftAvailable && !options.executeDockerFallback && !preserveExecutionEvidence ? ["syft CLI unavailable for --execute mode"] : []),
      ...(options.executeDockerFallback && !scannerImages.trivy.digestResolved ? ["trivy Docker scanner image digest was not resolved"] : []),
      ...(options.executeDockerFallback && !scannerImages.syft.digestResolved ? ["syft Docker scanner image digest was not resolved"] : []),
      ...(plans.length === 0 ? [`no scan targets matched ${options.name}`] : []),
      ...failedResultEvidence()
    ],
    risk: [
      "This runner is local evidence generation only; it does not sign, push, mirror, apply, delete, scale, or patch cluster resources.",
      options.executeDockerFallback
        ? "Docker fallback scanner images are pulled locally and converted to immutable RepoDigests before scans run."
        : preserveExecutionEvidence
          ? "Same-head Docker fallback scan evidence was preserved without re-pulling scanner images or re-running scans."
          : "Docker fallback commands are emitted as a plan because scanner image pulls should be reviewed and pinned before release evidence collection.",
      "Final release readiness still requires reviewed *-security-review.json evidence with criticalFindings=0."
    ],
    rollbackPath: [
      "Delete generated vulnerability/SBOM files if they were created from the wrong image digest.",
      "Regenerate security scan, checkpoint, roadmap, and release bundle evidence after replacing any image or scanner input."
    ],
    checks
  };

  let serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (hasSecretLikeMaterial(serialized)) {
    fail("security scan runner secret guard", "artifact contains token/password/private-key shaped material");
    artifact.status = "BLOCKED";
  } else {
    pass("security scan runner secret guard", "no token/password/private-key shaped material detected");
  }
  artifact.checks = checks;
  artifact.status = checks.some((check) => check.status === "FAIL") ? "BLOCKED" : artifact.status;
  serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(dirname(evidenceOutPath), { recursive: true });
  await writeFile(evidenceOutPath, serialized, "utf8");

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens security scan evidence runner: status=${artifact.status}, targets=${plans.length}, execute=${options.execute}, executeDockerFallback=${options.executeDockerFallback}, preservedExecutionEvidence=${preserveExecutionEvidence}`);
  if (artifact.status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("security scan evidence runner runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] security scan evidence runner runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
