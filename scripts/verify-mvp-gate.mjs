#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const skipE2E = args.has("--skip-e2e");
const failFast = args.has("--fail-fast");

const steps = [
  {
    id: "BUILD",
    command: "npm",
    args: ["run", "build"],
    acceptance: ["AC-API-001", "AC-DASH-001"],
    purpose: "Compile API, web, contracts, RAG, and operator-controller packages."
  },
  {
    id: "ENV-CONTRACT",
    command: "npm",
    args: ["run", "verify:env"],
    acceptance: ["AC-ENV-001", "AC-OCP-001", "AC-LS-002"],
    purpose: "Verify OCP API environment variables are isolated from Lightspeed/MCP settings."
  },
  {
    id: "CONSOLE-PLUGIN",
    command: "npm",
    args: ["run", "verify:console-plugin"],
    acceptance: ["AC-OP-003", "AC-DASH-001"],
    purpose: "Verify generated Console dynamic plugin manifest, entry script, route, and proxy base contract."
  },
  {
    id: "E2E",
    command: "npm",
    args: ["run", "test:e2e"],
    acceptance: [
      "AC-UI-001",
      "AC-UI-002",
      "AC-CTX-001",
      "AC-ANS-001",
      "AC-SAFE-001",
      "AC-API-001",
      "AC-AIOPS-001",
      "AC-AIOPS-002",
      "AC-RAG-002",
      "AC-DASH-001",
      "AC-OCP-001"
    ],
    purpose: "Run dashboard-first UX, read-only API, RAG intake, dashboard, and OCP evidence assertions."
  },
  {
    id: "RAG",
    command: "npm",
    args: ["run", "verify:rag"],
    acceptance: ["AC-RAG-001", "AC-RAG-002"],
    purpose: "Verify tenant-scoped local RAG, redaction, validate-only intake, and evidence export."
  },
  {
    id: "LIGHTSPEED",
    command: "npm",
    args: ["run", "verify:lightspeed:fixture"],
    acceptance: ["AC-LS-001", "AC-LS-002"],
    purpose: "Verify Lightspeed MCP template and fixture schema without mutating a cluster."
  },
  {
    id: "OPERATOR-PACKAGE",
    command: "npm",
    args: ["run", "verify:operator"],
    acceptance: ["AC-OP-001"],
    purpose: "Verify Operator package YAML, CRD, RBAC, bundle, app stack, and Go skeleton contract."
  },
  {
    id: "OPERATOR-RECONCILE",
    command: "npm",
    args: ["run", "verify:operator:reconcile"],
    acceptance: ["AC-OP-002"],
    purpose: "Verify TypeScript reconcile safety core and fixture-backed OLSConfig patch planning."
  },
  {
    id: "OPERATOR-RUNTIME",
    command: "npm",
    args: ["run", "verify:operator:runtime"],
    acceptance: ["AC-OP-002"],
    purpose: "Verify TypeScript desired resource plan and Go/controller-runtime skeleton parity."
  },
  {
    id: "CERTIFICATION",
    command: "npm",
    args: ["run", "verify:certification"],
    acceptance: ["AC-CERT-001"],
    purpose: "Verify catalog, FBC, scorecard, release, support, and security readiness."
  },
  {
    id: "IMAGES",
    command: "npm",
    args: ["run", "verify:images"],
    acceptance: ["AC-CERT-001"],
    purpose: "Verify Operator, API, dashboard, bundle, and catalog image build readiness without pushing images."
  }
].filter((step) => !(skipE2E && step.id === "E2E"));

function formatCommand(step) {
  return [step.command, ...step.args].join(" ");
}

function spawnProcess(command, commandArgs, options) {
  if (process.platform === "win32" && command === "npm") {
    return spawn("cmd.exe", ["/d", "/s", "/c", formatCommand({ command, args: commandArgs })], options);
  }
  return spawn(command, commandArgs, options);
}

function runCapture(command, commandArgs) {
  return new Promise((resolveCommand) => {
    let child;
    try {
      child = spawnProcess(command, commandArgs, {
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolveCommand({ exitCode: 1, output: error instanceof Error ? error.message : String(error) });
      return;
    }
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("error", (error) => {
      resolveCommand({ exitCode: 1, output: error.message });
    });
    child.on("close", (exitCode) => {
      resolveCommand({ exitCode: exitCode ?? 1, output: output.trim() });
    });
  });
}

async function gitValue(commandArgs, fallback) {
  const result = await runCapture("git", commandArgs);
  if (result.exitCode !== 0 || !result.output) {
    return fallback;
  }
  return result.output.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitOutput(commandArgs, fallback = "") {
  const result = await runCapture("git", commandArgs);
  if (result.exitCode !== 0) {
    return fallback;
  }
  return result.output;
}

function runStep(step) {
  return new Promise((resolveStep) => {
    const startedAt = new Date();
    let outputTail = "";

    const append = (data) => {
      const text = data.toString();
      process.stdout.write(text);
      outputTail = `${outputTail}${text}`.slice(-12_000);
    };

    console.log("");
    console.log(`[MVP-GATE] ${step.id}: ${formatCommand(step)}`);
    console.log(`[MVP-GATE] ${step.purpose}`);

    let child;
    try {
      child = spawnProcess(step.command, step.args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolveStep({
        ...step,
        command: formatCommand(step),
        status: "FAIL",
        exitCode: 1,
        durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        outputTail: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      resolveStep({
        ...step,
        command: formatCommand(step),
        status: "FAIL",
        exitCode: 1,
        durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        outputTail: error.message
      });
    });
    child.on("close", (exitCode) => {
      const passed = exitCode === 0;
      resolveStep({
        ...step,
        command: formatCommand(step),
        status: passed ? "PASS" : "FAIL",
        exitCode: exitCode ?? 1,
        durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
        outputTail: outputTail.trim()
      });
    });
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main");
  const worktreeStatus = await gitOutput(["status", "--short"]);
  const worktreeDirty = worktreeStatus.trim().length > 0;
  const results = [];

  console.log(`[MVP-GATE] Cywell OpsLens MVP 0.1 gate`);
  console.log(`[MVP-GATE] branch=${branch} head=${headSha} base=${baseRef} dirty=${worktreeDirty}`);
  if (worktreeDirty) {
    console.log("[MVP-GATE] worktree has uncommitted changes; evidence is useful for verification but not a clean release stamp.");
  }
  if (skipE2E) {
    console.log("[MVP-GATE] --skip-e2e enabled; UI/API acceptance lanes are not fully covered.");
  }

  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);
    console.log(`[MVP-GATE] ${result.id}: ${result.status} in ${result.durationSeconds}s`);
    if (failFast && result.status === "FAIL") {
      break;
    }
  }

  const failed = results.filter((result) => result.status === "FAIL");
  const report = {
    schema: "cywell.opslens.mvp-gate.v0.1",
    gate: "MVP 0.1",
    branch,
    headSha,
    baseRef,
    worktreeDirty,
    worktreeStatus: worktreeStatus.trim() ? worktreeStatus.split(/\r?\n/) : [],
    startedAt,
    finishedAt: new Date().toISOString(),
    skipped: {
      e2e: skipE2E
    },
    status: failed.length === 0 ? "PASS" : "FAIL",
    results: results.map((result) => ({
      id: result.id,
      status: result.status,
      command: result.command,
      acceptance: result.acceptance,
      purpose: result.purpose,
      exitCode: result.exitCode,
      durationSeconds: result.durationSeconds,
      outputTail: result.outputTail
    }))
  };

  const reportPath = resolve("test-results", "cywell-opslens-mvp-0.1-gate.json");
  await mkdir(resolve("test-results"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  console.log(`[MVP-GATE] ${report.status}: ${results.length - failed.length}/${results.length} steps passed`);
  console.log(`[MVP-GATE] evidence: ${reportPath}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
