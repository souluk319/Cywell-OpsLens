#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  candidateRoot: "test-results/security-candidates",
  evidenceOutRoot: "test-results",
  names: ["vllm", "pgvector"],
  timeoutMs: 600000
};

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
const rawCandidateImage =
  parsed.values.get("candidate-image") ??
  parsed.values.get("image") ??
  parsed.values.get("scan-ref") ??
  "";

function deriveLabel(image) {
  if (!image) return "missing";
  const digestMatch = image.match(/@sha256:([a-f0-9]+)/i);
  if (digestMatch) return `sha256-${digestMatch[1].slice(0, 16)}`;
  const leaf = image.split("/").at(-1) ?? image;
  if (leaf.includes(":")) return leaf.split(":").at(-1) ?? leaf;
  return leaf;
}

function safeLabel(value) {
  const label = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return label || "candidate";
}

const name = parsed.values.get("name") ?? "";
const candidateLabel = safeLabel(
  parsed.values.get("candidate-label") ??
    parsed.values.get("label") ??
    deriveLabel(rawCandidateImage)
);
const candidateRoot = parsed.values.get("candidate-root") ?? defaults.candidateRoot;
const evidenceOutRoot =
  parsed.values.get("evidence-out-root") ?? defaults.evidenceOutRoot;
const candidateEvidenceDir = resolve(candidateRoot, `${name}-${candidateLabel}`);
const runnerEvidenceOut = resolve(
  evidenceOutRoot,
  `cywell-opslens-security-scan-${name}-${candidateLabel}.json`
);
const wrapperEvidenceOut = resolve(
  parsed.values.get("evidence-out") ??
    `${evidenceOutRoot}/cywell-opslens-external-runtime-candidate-scan-${name}-${candidateLabel}.json`
);

const options = {
  name,
  candidateImage: rawCandidateImage,
  candidateLabel,
  candidateRoot,
  candidateEvidenceDir,
  runnerEvidenceOut,
  evidenceOut: wrapperEvidenceOut,
  execute: parsed.flags.has("execute"),
  executeDockerFallback: parsed.flags.has("execute-docker-fallback"),
  skipMatrix: parsed.flags.has("skip-matrix"),
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  trivyImage: parsed.values.get("trivy-image"),
  syftImage: parsed.values.get("syft-image"),
  trivyTimeout: parsed.values.get("trivy-timeout"),
  trivyScanners: parsed.values.get("trivy-scanners")
};

const startedAt = new Date().toISOString();
const checks = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]{12,}/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
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

function tail(value, maxLength = 3000) {
  const sanitized = sanitize(value);
  return sanitized.length > maxLength ? sanitized.slice(-maxLength) : sanitized;
}

async function runCapture(command, args, timeoutMs = options.timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024
    });
    return {
      ok: true,
      command,
      args,
      exitCode: 0,
      stdout: sanitize(stdout),
      stderr: sanitize(stderr)
    };
  } catch (error) {
    return {
      ok: false,
      command,
      args,
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: sanitize(error.stdout ?? ""),
      stderr: sanitize(error.stderr ?? error.message)
    };
  }
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

function artifactIsFreshForRun(artifact) {
  const artifactTime = Date.parse(artifact?.startedAt ?? artifact?.generatedAt ?? "");
  const runTime = Date.parse(startedAt);
  return Number.isFinite(artifactTime) && Number.isFinite(runTime) && artifactTime >= runTime - 1000;
}

function validateInput() {
  if (!defaults.names.includes(options.name)) {
    fail("candidate name", `--name must be one of ${defaults.names.join(", ")}`);
  } else {
    pass("candidate name", options.name);
  }

  if (!options.candidateImage) {
    fail("candidate image", "--candidate-image is required");
  } else if (secretLike(options.candidateImage)) {
    fail("candidate image secret guard", "--candidate-image contains secret-like material");
  } else {
    pass("candidate image", options.candidateImage);
  }

  if (options.execute && options.executeDockerFallback) {
    fail("execution mode", "choose only one of --execute or --execute-docker-fallback");
  } else if (options.execute) {
    pass("execution mode", "local trivy/syft execution requested");
  } else if (options.executeDockerFallback) {
    pass("execution mode", "Docker fallback execution requested");
  } else {
    pass("execution mode", "plan-only; no scanner execution requested");
  }

  if (secretLike(options.candidateLabel)) {
    fail("candidate label secret guard", "--candidate-label contains secret-like material");
  } else {
    pass("candidate label", options.candidateLabel);
  }
}

function securityScanArgs() {
  const args = [
    "scripts/create-security-scan-evidence.mjs",
    "--name",
    options.name,
    "--include-external",
    "--scan-ref",
    options.candidateImage,
    "--image",
    options.candidateImage,
    "--security-evidence-dir",
    options.candidateEvidenceDir,
    "--evidence-out",
    options.runnerEvidenceOut,
    "--timeout-ms",
    String(options.timeoutMs)
  ];
  if (options.execute) args.push("--execute");
  if (options.executeDockerFallback) args.push("--execute-docker-fallback");
  if (options.trivyImage) args.push("--trivy-image", options.trivyImage);
  if (options.syftImage) args.push("--syft-image", options.syftImage);
  if (options.trivyTimeout) args.push("--trivy-timeout", options.trivyTimeout);
  if (options.trivyScanners) args.push("--trivy-scanners", options.trivyScanners);
  return args;
}

async function maybeRefreshMatrix(scanResult) {
  if (options.skipMatrix) {
    pass("candidate matrix refresh", "skipped by --skip-matrix");
    return undefined;
  }
  if (!options.execute && !options.executeDockerFallback) {
    pass("candidate matrix refresh", "skipped for plan-only candidate scan");
    return undefined;
  }
  if (!scanResult.ok) {
    warn("candidate matrix refresh", "skipped because candidate scan command failed");
    return undefined;
  }

  const result = await runCapture(process.execPath, [
    "scripts/create-external-runtime-candidate-matrix.mjs"
  ]);
  if (result.ok) {
    pass("candidate matrix refresh", "external runtime candidate matrix refreshed");
  } else {
    fail("candidate matrix refresh", result.stderr || result.stdout || "candidate matrix refresh failed");
  }
  return result;
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "origin/main");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  validateInput();

  let scanResult;
  let runnerArtifact;
  let matrixResult;
  if (!checks.some((check) => check.status === "FAIL")) {
    const args = securityScanArgs();
    pass("candidate scan command", `node ${args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)).join(" ")}`);
    scanResult = await runCapture(process.execPath, args, options.timeoutMs + 120000);
    if (scanResult.ok) {
      pass("candidate scan runner", `exit=0 evidence=${options.runnerEvidenceOut}`);
    } else {
      fail("candidate scan runner", scanResult.stderr || scanResult.stdout || "candidate scan command failed");
    }
    runnerArtifact = loadJson(options.runnerEvidenceOut, "candidate scan runner artifact");
    if (runnerArtifact && !artifactIsFreshForRun(runnerArtifact)) {
      fail(
        "candidate scan runner artifact freshness",
        `stale artifact ignored; artifactStartedAt=${runnerArtifact.startedAt ?? "missing"} wrapperStartedAt=${startedAt}`
      );
      runnerArtifact = undefined;
    }
    matrixResult = await maybeRefreshMatrix(scanResult);
  }

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : runnerArtifact?.status === "EVIDENCE_WRITTEN"
      ? "EVIDENCE_WRITTEN"
      : "PLAN_READY";

  const artifact = {
    schema: "cywell.opslens.external-runtime-candidate-scan.v0.1",
    artifactType: "opslens.external-runtime-candidate-scan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: options.execute || options.executeDockerFallback
      ? "candidateScanLocalEvidenceWrite"
      : "candidateScanPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    localEvidenceWriteAttempted: options.execute || options.executeDockerFallback,
    acceptance: ["AC-CERT-001"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    target: {
      name: options.name,
      candidateImage: options.candidateImage,
      candidateLabel: options.candidateLabel,
      candidateEvidenceDir: options.candidateEvidenceDir,
      runnerEvidenceOut: options.runnerEvidenceOut
    },
    scannerRunner: scanResult
      ? {
          command: scanResult.command,
          args: scanResult.args,
          exitCode: scanResult.exitCode,
          stdoutTail: tail(scanResult.stdout),
          stderrTail: tail(scanResult.stderr),
          artifactStatus: runnerArtifact?.status ?? "missing"
        }
      : undefined,
    candidateMatrixRefresh: matrixResult
      ? {
          command: matrixResult.command,
          args: matrixResult.args,
          exitCode: matrixResult.exitCode,
          stdoutTail: tail(matrixResult.stdout),
          stderrTail: tail(matrixResult.stderr)
        }
      : undefined,
    readOnlyCommands: [
      {
        id: "plan-candidate-scan",
        phase: "candidate-scan",
        command: `npm run evidence:external-runtime:candidate-scan -- --name ${options.name} --candidate-image ${options.candidateImage} --candidate-label ${options.candidateLabel}`,
        mutation: false,
        writesLocalEvidence: true,
        purpose: "Create a candidate scan plan without pulling scanner images or writing release evidence."
      },
      {
        id: "execute-candidate-scan-docker-fallback",
        phase: "candidate-scan",
        command: `npm run evidence:external-runtime:candidate-scan -- --name ${options.name} --candidate-image ${options.candidateImage} --candidate-label ${options.candidateLabel} --execute-docker-fallback${options.trivyTimeout ? ` --trivy-timeout ${options.trivyTimeout}` : ""}${options.trivyScanners ? ` --trivy-scanners ${options.trivyScanners}` : ""}`,
        mutation: false,
        writesLocalEvidence: true,
        requiresNetwork: true,
        purpose: "Generate candidate vulnerability/SBOM evidence through digest-resolved Docker scanner containers."
      }
    ],
    missingEvidence: [
      ...(status === "PLAN_READY" ? ["candidate scan was planned but not executed"] : []),
      ...(runnerArtifact?.missingEvidence ?? [])
    ],
    risk: [
      "Candidate scans are reviewer evidence only and do not make an external runtime release eligible by themselves.",
      "Docker fallback mode may pull scanner images and candidate images locally, but it does not push, mirror, sign, or mutate a cluster.",
      "A zero-critical candidate still requires security-reviewer, product-owner, registry-admin, and release-manager approval before any manifest change."
    ],
    rollbackPath: [
      `Delete ${options.candidateEvidenceDir} if the candidate image or label was wrong.`,
      "Regenerate the external runtime candidate matrix, review packet, release bundle, and action queue after any candidate scan change.",
      "Keep CSV/FBC/runtime image references unchanged until final external runtime evidence is promoted by a human reviewer."
    ],
    checks
  };

  let serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretLike(serialized)) {
    fail("candidate scan secret guard", "artifact contains token/password/private-key shaped material");
    artifact.status = "BLOCKED";
    artifact.checks = checks;
    serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  } else {
    pass("candidate scan secret guard", "no token/password/private-key shaped material detected");
    artifact.checks = checks;
    serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  }

  await mkdir(dirname(options.evidenceOut), { recursive: true });
  await writeFile(options.evidenceOut, serialized, "utf8");

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens external runtime candidate scan: status=${artifact.status}, name=${options.name}, label=${options.candidateLabel}`);
  if (artifact.status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("external runtime candidate scan runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] external runtime candidate scan runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
