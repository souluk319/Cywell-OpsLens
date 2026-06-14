#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(".");
const evidenceOut = resolve(
  process.env.CYWELL_OPSLENS_OCP_NETWORK_HANDOFF_API_FALLBACK_EVIDENCE ??
    "test-results/cywell-opslens-ocp-network-handoff-api-fallback.json"
);
const apiModule = pathToFileURL(resolve(repoRoot, "apps/api/src/api.ts")).href;
const tsxCli = resolve(repoRoot, "node_modules/tsx/dist/cli.mjs");

const checks = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(
      /\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g,
      "<redacted-private-ip>"
    );
}

function record(status, name, detail) {
  const entry = { status, name, detail: sanitize(detail) };
  checks.push(entry);
  console.log(`[${status}] ${name}: ${entry.detail}`);
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function gitValue(args, fallback) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0 || !result.stdout.trim()) return fallback;
  return result.stdout.trim().split(/\r?\n/).at(-1)?.trim() || fallback;
}

function gitDirty() {
  const result = spawnSync("git", ["status", "--short"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) return true;
  return result.stdout.trim().length > 0;
}

function partialArtifact(classification) {
  return {
    artifactType: "opslens.ocp-network-handoff.v0.1",
    status: classification === "api-ready" ? "READY_FOR_LIVE_RECHECK" : "READY_FOR_NETWORK_REVIEW",
    actionMode: "handoffOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    target: {
      host: "<redacted-ocp-api>",
      port: "6443",
      redactedBaseUrl: "https://<redacted-ocp-api>:6443",
      tokenConfigured: true,
      tlsVerify: false
    },
    diagnostics: {
      classification
    },
    readOnlyCommands: [
      {
        id: "windows-resolve-dns",
        command: "powershell -NoProfile -Command \"Resolve-DnsName <redacted-ocp-api>\"",
        purpose: "Confirm OCP API DNS from an approved workstation.",
        phase: "network-dns-preflight",
        requiresNetwork: true,
        mutation: false,
        writesEvidence: false
      },
      {
        id: "windows-test-netconnection",
        command:
          "powershell -NoProfile -Command \"Test-NetConnection -ComputerName <redacted-ocp-api> -Port 6443 -InformationLevel Detailed\"",
        purpose: "Confirm OCP API TCP reachability.",
        phase: "network-tcp-preflight",
        requiresNetwork: true,
        mutation: false,
        writesEvidence: false
      },
      {
        id: "ocp-connectivity",
        command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
        purpose: "Refresh bounded OCP connectivity evidence.",
        phase: "network-evidence-refresh",
        requiresNetwork: true,
        mutation: false,
        writesEvidence: true
      }
    ],
    sourceArtifacts: [
      {
        id: "ocpConnectivity",
        label: "OCP connectivity diagnostic",
        status: "NEEDS_EVIDENCE",
        fresh: true,
        required: true,
        headSha: gitValue(["rev-parse", "HEAD"], "unknown"),
        worktreeDirty: String(gitDirty())
      }
    ],
    missingEvidence: [`OCP connectivity diagnostic classification=${classification}`],
    risk: [
      "Partial handoff artifact is used only to verify API fallback routing and does not approve mutation."
    ],
    rollbackPath: [
      "Regenerate the OCP network handoff artifact after live evidence changes."
    ]
  };
}

function expectedFor(classification) {
  if (["auth-or-rbac", "auth-failed", "token-missing"].includes(classification)) {
    return {
      owner: "cluster-admin",
      ticketId: "cluster-admin-ocp-auth-rbac-ticket",
      firstActionId: "cluster-admin-review-ocp-auth-rbac-evidence",
      networkChangeRequiresExplicitApproval: false,
      nextPattern: /evidence:ocp-auth-rbac-plan/
    };
  }
  if (classification === "tls-handshake-failed") {
    return {
      owner: "cluster-sre",
      ticketId: "cluster-sre-ocp-api-tls-ticket",
      firstActionId: "network-sre-confirm-ocp-api-dns",
      networkChangeRequiresExplicitApproval: false,
      nextPattern: /verify:ocp:connectivity|Test-NetConnection|Resolve-DnsName/
    };
  }
  return {
    owner: "network-sre",
    ticketId: "network-sre-ocp-api-reachability-ticket",
    firstActionId: "network-sre-confirm-ocp-api-tcp-6443",
    networkChangeRequiresExplicitApproval: true,
    nextPattern: /verify:ocp:connectivity|Test-NetConnection|Resolve-DnsName/
  };
}

function apiOverviewFor(partialPath) {
  const source = [
    `import { getOpsLensAdminOverview } from ${JSON.stringify(apiModule)};`,
    "(async () => {",
    "const overview = await getOpsLensAdminOverview();",
    "const handoff = overview.installReadiness.networkHandoff;",
    "console.log(JSON.stringify({",
    "classification: handoff.classification,",
    "owner: handoff.ticketPacket.owner,",
    "ticketId: handoff.ticketPacket.id,",
    "firstActionId: handoff.ticketPacket.firstReadOnlyAction.id,",
    "approvalId: handoff.ticketPacket.approvalGatedAction.id,",
    "networkChangeRequiresExplicitApproval: handoff.ticketPacket.mutationBoundary.networkChangeRequiresExplicitApproval,",
    "nextCommands: handoff.ticketPacket.nextCommands,",
    "summary: handoff.ticketPacket.summary,",
    "clusterMutationAttempted: handoff.clusterMutationAttempted,",
    "registryMutationAttempted: handoff.registryMutationAttempted,",
    "mutationAllowedByThisVerifier: handoff.mutationAllowedByThisVerifier",
    "}));",
    "})().catch((error) => {",
    "console.error(error);",
    "process.exit(1);",
    "});"
  ].join("\n");

  const result = spawnSync(process.execPath, [tsxCli, "-e", source], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CYWELL_OPSLENS_OCP_NETWORK_HANDOFF: partialPath
    },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(sanitize(result.stderr || result.stdout || "API fallback probe failed"));
  }
  return JSON.parse(result.stdout.trim());
}

const cases = ["auth-or-rbac", "tls-handshake-failed", "tcp-timeout"];
const caseResults = [];
const tmpRoot = mkdtempSync(resolve(tmpdir(), "opslens-ocp-handoff-api-fallback-"));

try {
  for (const classification of cases) {
    const artifactPath = resolve(tmpRoot, `${classification}.json`);
    writeFileSync(artifactPath, `${JSON.stringify(partialArtifact(classification), null, 2)}\n`);
    const actual = apiOverviewFor(artifactPath);
    const expected = expectedFor(classification);
    const nextCommandText = (actual.nextCommands ?? []).join(" ");

    const assertions = [
      ["classification", actual.classification === classification, actual.classification],
      ["owner", actual.owner === expected.owner, actual.owner],
      ["ticket id", actual.ticketId === expected.ticketId, actual.ticketId],
      ["first read-only action", actual.firstActionId === expected.firstActionId, actual.firstActionId],
      [
        "network change approval boundary",
        actual.networkChangeRequiresExplicitApproval === expected.networkChangeRequiresExplicitApproval,
        String(actual.networkChangeRequiresExplicitApproval)
      ],
      ["next command", expected.nextPattern.test(nextCommandText), nextCommandText],
      ["cluster mutation boundary", actual.clusterMutationAttempted === false, String(actual.clusterMutationAttempted)],
      ["registry mutation boundary", actual.registryMutationAttempted === false, String(actual.registryMutationAttempted)],
      ["verifier mutation boundary", actual.mutationAllowedByThisVerifier === false, String(actual.mutationAllowedByThisVerifier)]
    ];

    for (const [name, ok, detail] of assertions) {
      if (ok) {
        pass(`${classification} ${name}`, detail);
      } else {
        fail(`${classification} ${name}`, detail);
      }
    }

    caseResults.push({
      classification,
      expected,
      actual: {
        classification: actual.classification,
        owner: actual.owner,
        ticketId: actual.ticketId,
        firstActionId: actual.firstActionId,
        approvalId: actual.approvalId,
        networkChangeRequiresExplicitApproval: actual.networkChangeRequiresExplicitApproval
      }
    });
  }
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}

const failures = checks.filter((check) => check.status === "FAIL");
const evidence = {
  artifactType: "opslens.ocp-network-handoff-api-fallback.v0.1",
  status: failures.length > 0 ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  ref: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "HEAD"], "unknown"),
    baseRef: "origin/main",
    baseSha: gitValue(["rev-parse", "origin/main"], "unknown"),
    worktreeDirty: gitDirty()
  },
  actionMode: "apiFallbackVerificationOnly",
  clusterMutationAttempted: false,
  registryMutationAttempted: false,
  mutationAllowedByThisVerifier: false,
  cases: caseResults,
  checks,
  acceptance: ["AC-LIVE-HANDOFF-001", "AC-DASH-001"]
};

await mkdir(dirname(evidenceOut), { recursive: true });
await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  console.error(
    `\nCywell OpsLens OCP handoff API fallback verification: ${failures.length} failure(s)`
  );
  process.exit(1);
}

console.log(
  `\nCywell OpsLens OCP handoff API fallback verification: status=PASS, cases=${cases.length}`
);
console.log(`Evidence written: ${evidenceOut}`);
