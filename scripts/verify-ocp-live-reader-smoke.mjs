#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-ocp-live-reader-smoke.json",
  ocpConnectivityEvidence: "test-results/cywell-opslens-ocp-connectivity-diagnostic.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  timeoutMs: 30000
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
const options = {
  evidenceOut: parsed.values.get("evidence-out") ?? defaults.evidenceOut,
  ocpConnectivityEvidence:
    parsed.values.get("ocp-connectivity-evidence") ?? defaults.ocpConnectivityEvidence,
  lightspeedReadinessEvidence:
    parsed.values.get("lightspeed-readiness-evidence") ?? defaults.lightspeedReadinessEvidence,
  timeoutMs: Number(parsed.values.get("timeout-ms") ?? defaults.timeoutMs),
  skipRerun: parsed.flags.has("skip-rerun"),
  skipLightspeed: parsed.flags.has("skip-lightspeed")
};

const startedAt = new Date().toISOString();
const checks = [];
let loadedEnv = false;

function findEnvFile(start = process.cwd()) {
  let current = resolve(start);
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) return candidate;
    if (current === root) return undefined;
    current = dirname(current);
  }
}

function loadEnvFile(path = findEnvFile()) {
  if (loadedEnv || !path || !existsSync(path)) {
    loadedEnv = true;
    return;
  }
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  loadedEnv = true;
}

function firstEnv(...keys) {
  loadEnvFile();
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== "") {
      return { key, value: process.env[key] };
    }
  }
  return undefined;
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "CYWELL_OPSLENS_API_KEY",
    "CYWELL_OPSLENS_BEARER_TOKEN"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

function sanitize(value) {
  let result = String(value ?? "");
  for (const secret of secretValuesForLeakCheck()) {
    result = result.split(secret).join("<redacted>");
  }
  return result
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
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
      env: process.env
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
  const result = await runCapture("git", args, 10000);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"], 10000);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function loadJson(path, label, required = true) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    if (required) fail(label, `${absolutePath} is missing`);
    else warn(label, `${absolutePath} is missing`);
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

async function runVerifier(id, args, evidencePath) {
  if (options.skipRerun) {
    warn(id, `skipped rerun; inspecting existing evidence ${resolve(evidencePath)}`);
    return { id, command: `${process.execPath} ${args.join(" ")}`, ok: false, skipped: true };
  }
  const result = await runCapture(process.execPath, args, options.timeoutMs + 5000);
  const detail = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .split(/\r?\n/)
    .slice(-4)
    .join(" ");
  if (result.ok) {
    pass(id, detail || `${resolve(evidencePath)} refreshed`);
  } else {
    warn(id, detail || `${resolve(evidencePath)} refresh returned non-zero`);
  }
  return {
    id,
    command: `${process.execPath} ${args.join(" ")}`,
    ok: result.ok,
    skipped: false
  };
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

function sourceSummary(id, label, path, artifact, currentHeadSha, required = true) {
  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status: artifact?.status ?? "missing",
    fresh: artifact ? artifactFresh(artifact, currentHeadSha) : false,
    required,
    headSha: artifactRef(artifact).headSha ?? "missing",
    worktreeDirty: artifactRef(artifact).worktreeDirty ?? "unknown"
  };
}

function authLikeClassification(classification) {
  return ["auth-or-rbac", "auth-failed", "token-missing"].includes(classification);
}

function requiredRbacReviews(artifact) {
  return (artifact?.diagnostics?.rbacAccessReviews ?? [])
    .filter((review) => review.required === true)
    .map((review) => ({
      id: review.id ?? "unknown",
      verb: review.verb ?? "unknown",
      resource: review.resource ?? "unknown",
      scope: review.scope ?? "unknown",
      status: review.status ?? "unknown",
      evidence: sanitize(review.evidence ?? "")
    }));
}

function commands() {
  return [
    {
      id: "verify-ocp-connectivity-with-approved-reader",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      phase: "post-approval-live-smoke",
      purpose:
        "Using the approved short-lived live reader token already configured in the environment, prove OCP /version and required read-only RBAC.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.ocpConnectivityEvidence
    },
    {
      id: "verify-lightspeed-readiness-with-approved-reader",
      command: "npm run verify:lightspeed -- --timeout-ms 30000",
      phase: "post-approval-live-smoke",
      purpose:
        "Using the same approved read-only credential, prove Lightspeed CRD/OLSConfig discovery no longer fails with auth/RBAC.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true,
      evidenceOut: defaults.lightspeedReadinessEvidence
    }
  ];
}

async function main() {
  loadEnvFile();
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const baseUrl = firstEnv("OCP_API_BASE_URL", "OPENSHIFT_API_BASE_URL", "KUBE_API_BASE_URL");
  const token = firstEnv("OCP_API_TOKEN", "OPENSHIFT_API_TOKEN", "KUBE_API_TOKEN");
  if (baseUrl) pass("OCP API target", `configured from ${baseUrl.key}`);
  else warn("OCP API target", "OCP_API_BASE_URL or kube API equivalent is missing");
  if (token) pass("OCP API token", `configured from ${token.key}; value is redacted`);
  else warn("OCP API token", "approved short-lived token is not configured");

  const verifierRuns = [];
  verifierRuns.push(await runVerifier(
    "verify OCP connectivity with approved reader",
    [
      "./scripts/verify-ocp-connectivity-diagnostic.mjs",
      "--evidence-out",
      options.ocpConnectivityEvidence,
      "--timeout-ms",
      String(options.timeoutMs)
    ],
    options.ocpConnectivityEvidence
  ));
  if (options.skipLightspeed) {
    warn("verify Lightspeed readiness with approved reader", "skipped by --skip-lightspeed");
  } else {
    verifierRuns.push(await runVerifier(
      "verify Lightspeed readiness with approved reader",
      [
        "./scripts/verify-lightspeed-mcp.mjs",
        "--timeout-ms",
        String(options.timeoutMs),
        "--evidence-out",
        options.lightspeedReadinessEvidence
      ],
      options.lightspeedReadinessEvidence
    ));
  }

  const ocpConnectivity = loadJson(
    options.ocpConnectivityEvidence,
    "OCP connectivity diagnostic"
  );
  const lightspeedReadiness = options.skipLightspeed
    ? undefined
    : loadJson(options.lightspeedReadinessEvidence, "Lightspeed readiness", false);
  const ocpClassification =
    ocpConnectivity?.diagnostics?.classification ?? ocpConnectivity?.classification ?? "missing";
  const reviews = requiredRbacReviews(ocpConnectivity);
  const deniedReviews = reviews.filter((review) => review.status !== "allowed");
  const lightspeedClassification =
    lightspeedReadiness?.currentGap?.classification ?? "none";
  const lightspeedAuthReady =
    options.skipLightspeed ||
    (lightspeedReadiness && !authLikeClassification(lightspeedClassification));
  const sourceArtifacts = [
    sourceSummary(
      "ocpConnectivity",
      "OCP connectivity diagnostic",
      options.ocpConnectivityEvidence,
      ocpConnectivity,
      headSha
    ),
    sourceSummary(
      "lightspeedReadiness",
      "Lightspeed readiness",
      options.lightspeedReadinessEvidence,
      lightspeedReadiness,
      headSha,
      !options.skipLightspeed
    )
  ];
  const staleSources = sourceArtifacts.filter((source) => source.required && !source.fresh);
  const mutationViolation =
    ocpConnectivity?.clusterMutationAttempted === true ||
    ocpConnectivity?.registryMutationAttempted === true ||
    ocpConnectivity?.mutationAllowedByThisVerifier === true ||
    lightspeedReadiness?.policy?.clusterMutationAttempted === true ||
    lightspeedReadiness?.policy?.mutationAllowed === true;
  if (mutationViolation) {
    fail("post-approval smoke mutation boundary", "source evidence indicates mutation was attempted or allowed");
  } else {
    pass("post-approval smoke mutation boundary", "source evidence remains read-only/no-mutation");
  }

  const missingEvidence = [
    ...(baseUrl ? [] : ["OCP API base URL is not configured"]),
    ...(token ? [] : ["approved short-lived live reader token is not configured"]),
    ...(ocpClassification === "api-ready"
      ? []
      : [`OCP connectivity classification=${ocpClassification}`]),
    ...deniedReviews.map((review) =>
      `rbac/${review.id}: ${review.verb} ${review.resource} ${review.scope}=${review.status}`
    ),
    ...(lightspeedAuthReady
      ? []
      : [`Lightspeed readiness still reports auth/RBAC classification=${lightspeedClassification}`]),
    ...staleSources.map((source) => `${source.label} is not fresh for head=${headSha}`),
    ...(worktreeDirty ? [`current git worktree dirty=true currentHead=${headSha}`] : [])
  ];
  const status = mutationViolation
    ? "BLOCKED"
    : missingEvidence.length === 0
      ? "PASS"
      : "NEEDS_EVIDENCE";

  const artifact = {
    schema: "cywell.opslens.ocp-live-reader-smoke.v0.1",
    artifactType: "opslens.ocp-live-reader-smoke.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-OCP-001", "AC-OCP-RBAC-001", "AC-LS-002", "AC-LIVE-HANDOFF-001"],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    prerequisites: [
      "cluster-admin approved and applied deploy/ocp-live-readonly/opslens-live-evidence-reader.yaml",
      "cluster-admin issued a short-lived cywell-opslens-live-evidence-reader token",
      "the token is provided through approved local secret handling as OCP_API_TOKEN or kubeconfig, never in chat or committed files"
    ],
    target: {
      baseUrlConfigured: Boolean(baseUrl),
      baseUrlSource: baseUrl?.key ?? "missing",
      tokenConfigured: Boolean(token),
      tokenSource: token?.key ?? "missing",
      redactedBaseUrl: ocpConnectivity?.target?.redactedBaseUrl ?? "missing"
    },
    diagnostics: {
      ocpClassification,
      requiredRbacReviews: reviews,
      requiredRbacAllowed: reviews.length > 0 && deniedReviews.length === 0,
      lightspeedClassification,
      lightspeedAuthReady
    },
    verifierRuns,
    readOnlyCommands: commands(),
    sourceArtifacts,
    missingEvidence,
    evidence: [
      "post-approval smoke reruns OCP connectivity and Lightspeed readiness with already-configured credentials only",
      "the verifier does not create tokens, apply RBAC, patch OLSConfig, or fetch raw Secrets",
      "RBAC success is derived from oc auth can-i access reviews in the OCP connectivity diagnostic artifact",
      "secret values are redacted from console output and evidence artifacts"
    ],
    risk: [
      "A PASS here proves the approved reader can collect shared live evidence; it does not approve installation, OLSConfig mutation, image push, mirroring, or signing.",
      "The fallback reader is cluster-scoped read-only and should remain short-lived when used outside user-token passthrough.",
      "Lightspeed may still require configuration even after auth/RBAC succeeds; that is a product configuration gap, not a credential leak."
    ],
    rollbackPath: [
      "No rollback is required for this verifier because it performs read-only checks only.",
      "Remove the local short-lived token after the evidence run or let it expire.",
      "If fallback reader access is revoked, rerun npm run evidence:ocp-auth-rbac-plan and this smoke verifier to capture the current gap."
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretValuesForLeakCheck().some((secret) => serialized.includes(secret)) || secretLike(serialized)) {
    throw new Error("OCP live reader smoke would include secret-like material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("OCP live reader smoke export", `${resolve(options.evidenceOut)} written without secret material`);

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
  console.log(
    `Cywell OpsLens OCP live reader smoke: status=${status}, classification=${ocpClassification}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );

  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("OCP live reader smoke runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] OCP live reader smoke runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
