#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const defaults = {
  evidenceOut: "test-results/cywell-opslens-dev012-handoff-readiness.json"
};

const paths = {
  packageJson: "package.json",
  checkpointRunner: "scripts/run-dev012-overnight-checkpoint.mjs",
  webVerifier: "scripts/verify-web-shell-contract.mjs",
  e2e: "tests/e2e/mvp-0.1.spec.ts",
  autonomyPlan: "docs/runbooks/cywell-opslens-dev012-10h-autonomy-plan.md",
  morningHandoff: "docs/runbooks/cywell-opslens-dev012-morning-handoff.md",
  overnightPlan: "docs/runbooks/cywell-opslens-overnight-dev012-plan.md",
  acceptance: "docs/acceptance/mvp-0.1.md"
};

const checks = [];

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
    } else {
      values.set(key, "true");
    }
  }
  return {
    evidenceOut: values.get("evidence-out") ?? defaults.evidenceOut
  };
}

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail, ...extra });
  console.log(`[${status}] ${name}: ${detail}`);
}

function pass(name, detail, extra) {
  record("PASS", name, detail, extra);
}

function fail(name, detail, extra) {
  record("FAIL", name, detail, extra);
}

function expectCheck(name, condition, passDetail, failDetail = passDetail, extra = {}) {
  if (condition) {
    pass(name, passDetail, extra);
  } else {
    fail(name, failDetail, extra);
  }
}

async function readText(path) {
  try {
    const text = await readFile(resolve(path), "utf8");
    pass("source readable", `${path} loaded`);
    return text;
  } catch (error) {
    fail("source readable", `${path}: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

function containsAll(text, values) {
  return values.every((value) => text.includes(value));
}

function absentAll(text, values) {
  return values.every((value) => !text.includes(value));
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function gitDirty() {
  try {
    return execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return true;
  }
}

function secretLikeHits(text) {
  const patterns = [
    /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*=/g,
    /OPENSHIFT_LIGHTSPEED_API_TOKEN\s*=/g,
    /OCP_API_TOKEN\s*=/g,
    /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g,
    /https:\/\/api\.[^\s`"')]+/g
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0]));
}

const options = parseArgs(process.argv.slice(2));

const [
  packageJson,
  checkpointRunner,
  webVerifier,
  e2e,
  autonomyPlan,
  morningHandoff,
  overnightPlan,
  acceptance
] = await Promise.all([
  readText(paths.packageJson),
  readText(paths.checkpointRunner),
  readText(paths.webVerifier),
  readText(paths.e2e),
  readText(paths.autonomyPlan),
  readText(paths.morningHandoff),
  readText(paths.overnightPlan),
  readText(paths.acceptance)
]);

expectCheck(
  "package script",
  packageJson.includes('"verify:dev012-handoff"') &&
    packageJson.includes("verify-dev012-handoff-readiness.mjs"),
  "package.json exposes verify:dev012-handoff"
);

expectCheck(
  "overnight loop includes handoff gate",
  checkpointRunner.includes('npmStep("dev012-handoff", ["verify:dev012-handoff"])') ||
    checkpointRunner.includes("npmStep('dev012-handoff', ['verify:dev012-handoff'])"),
  "overnight checkpoint runs verify:dev012-handoff"
);

expectCheck(
  "ConsolePlugin proxy contract remains protected",
  containsAll(webVerifier, [
    "installed console plugin proxy e2e",
    "console-plugin-user-token-proxy",
    "/api/proxy/plugin/cywell-opslens/opslens-api/api/actions/plan"
  ]) &&
    containsAll(e2e, [
      "AC-UI-007 shows installed ConsolePlugin proxy mode distinctly",
      "surface=console-plugin",
      "OpenShift UserToken proxy",
      "OpenShift 사용자 토큰 프록시"
    ]),
  "web verifier and Playwright protect installed ConsolePlugin proxy mode"
);

expectCheck(
  "autonomy plan freshness",
  containsAll(autonomyPlan, [
    "verify:dev012-handoff",
    "AC-UI-007",
    "local and non-mutating",
    "OperatorHub installs the Operator",
    "`OpsLensInstallation` applies the product",
    "ConsolePlugin route opens the OpsLens UI"
  ]),
  "10-hour plan names the handoff gate and installed-mode contract"
);

expectCheck(
  "morning handoff freshness",
  containsAll(morningHandoff, [
    "verify:dev012-handoff",
    "0 fail, 56 checks",
    "AC-UI-007",
    "live CRC install status lane",
    "oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens",
    "oc get route cywell-opslens-dashboard -n cywell-opslens"
  ]),
  "morning handoff reflects the latest web-shell count, proxy e2e, and route-backed smoke commands"
);

expectCheck(
  "overnight plan lane log",
  containsAll(overnightPlan, [
    "Lane 86",
    "verify:dev012-handoff",
    "handoff freshness",
    "11/11 local gates"
  ]),
  "overnight plan records the handoff freshness lane and expanded checkpoint"
);

expectCheck(
  "acceptance evidence",
  containsAll(acceptance, [
    "verify:dev012-handoff",
    "AC-UI-007",
    "10-hour autonomy"
  ]),
  "acceptance criteria mention the handoff freshness gate"
);

const combinedDocs = [autonomyPlan, morningHandoff, overnightPlan, acceptance].join("\n");
const hits = secretLikeHits(combinedDocs);
expectCheck(
  "handoff secret hygiene",
  hits.length === 0 && absentAll(combinedDocs, [".env contents", "password="]),
  "handoff docs avoid token/secret assignments and exact API host strings",
  `secret-like handoff content detected: ${hits.slice(0, 5).join(", ")}`
);

const status = checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";
const evidence = {
  schema: "cywell.opslens.dev012-handoff-readiness.v0.1",
  generatedAt: new Date().toISOString(),
  status,
  git: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    dirty: gitDirty()
  },
  boundaries: {
    localEvidenceOnly: true,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    envReadAttempted: false
  },
  paths,
  checks
};

await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
await writeFile(resolve(options.evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`\nCywell OpsLens Dev 0.1.2 handoff readiness: status=${status}, checks=${checks.length}`);
console.log(`Evidence: ${resolve(options.evidenceOut)}`);

process.exitCode = status === "PASS" ? 0 : 1;
