#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaults = {
  iterations: 1,
  intervalMinutes: 30,
  evidenceOut: "test-results/cywell-opslens-dev012-overnight-checkpoint.json",
  markdownOut: "test-results/cywell-opslens-dev012-overnight-checkpoint.md",
  autonomyPlan:
    "docs/runbooks/cywell-opslens-dev012-10h-autonomy-plan.md",
  morningHandoff:
    "docs/runbooks/cywell-opslens-dev012-morning-handoff.md",
  commandTimeoutMs: 10 * 60 * 1000
};

const npm = "npm";
const git = process.platform === "win32" ? "git.exe" : "git";

function npmStep(id, args) {
  const npmArgs = ["run", ...args];
  if (process.platform === "win32") {
    return {
      id,
      command: "cmd.exe",
      args: ["/d", "/s", "/c", [npm, ...npmArgs].join(" ")]
    };
  }
  return {
    id,
    command: npm,
    args: npmArgs
  };
}

const steps = [
  {
    id: "git-status",
    command: git,
    args: ["status", "--short", "--branch"],
    timeoutMs: 60 * 1000
  },
  {
    id: "web-shell",
    ...npmStep("web-shell", ["verify:web-shell"])
  },
  npmStep("console-plugin", ["verify:console-plugin"]),
  npmStep("operator-package", ["verify:operator:package"]),
  npmStep("operator-reconcile", ["verify:operator:reconcile"]),
  npmStep("operator-runtime", ["verify:operator:runtime"]),
  npmStep("lab-image-map", ["verify:lab-image-map"]),
  npmStep("lab-bootstrap", ["verify:lab-bootstrap"]),
  npmStep("crc-demo-readiness", ["verify:crc-demo-readiness"]),
  npmStep("lab-handoff", ["verify:lab-handoff"])
];

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") {
      values.set("iterations", "1");
      continue;
    }
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

  const iterations = Number(values.get("iterations") ?? defaults.iterations);
  const intervalMinutes = Number(values.get("interval-minutes") ?? defaults.intervalMinutes);
  const commandTimeoutMs = Number(values.get("command-timeout-ms") ?? defaults.commandTimeoutMs);

  return {
    iterations: Number.isFinite(iterations) && iterations > 0 ? Math.floor(iterations) : defaults.iterations,
    intervalMinutes:
      Number.isFinite(intervalMinutes) && intervalMinutes >= 0
        ? intervalMinutes
        : defaults.intervalMinutes,
    commandTimeoutMs:
      Number.isFinite(commandTimeoutMs) && commandTimeoutMs > 0
        ? commandTimeoutMs
        : defaults.commandTimeoutMs,
    evidenceOut: values.get("evidence-out") ?? defaults.evidenceOut,
    markdownOut: values.get("markdown-out") ?? defaults.markdownOut,
    autonomyPlan: values.get("autonomy-plan") ?? defaults.autonomyPlan,
    morningHandoff: values.get("morning-handoff") ?? defaults.morningHandoff,
    stopOnFail: values.get("stop-on-fail") !== "false"
  };
}

function nowIso() {
  return new Date().toISOString();
}

function truncate(value, max = 12000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function runStep(step, commandTimeoutMs) {
  const startedAt = nowIso();
  const timeoutMs = step.timeoutMs ?? commandTimeoutMs;

  return new Promise((resolveStep) => {
    let child;
    try {
      child = spawn(step.command, step.args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CI: process.env.CI ?? "1"
        },
        windowsHide: true
      });
    } catch (error) {
      const finishedAt = nowIso();
      resolveStep({
        id: step.id,
        status: "FAIL",
        command: [step.command, ...step.args].join(" "),
        startedAt,
        finishedAt,
        exitCode: null,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        stdout: "",
        stderr: truncate(error.message),
        timedOut: false
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolveStep({
        id: step.id,
        status: "FAIL",
        command: [step.command, ...step.args].join(" "),
        startedAt,
        finishedAt: nowIso(),
        exitCode: null,
        durationMs: Date.parse(nowIso()) - Date.parse(startedAt),
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\n${error.message}`.trim()),
        timedOut
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const finishedAt = nowIso();
      resolveStep({
        id: step.id,
        status: code === 0 && !timedOut ? "PASS" : "FAIL",
        command: [step.command, ...step.args].join(" "),
        startedAt,
        finishedAt,
        exitCode: code,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        timedOut
      });
    });
  });
}

async function gitStamp() {
  const headStep = await runStep(
    {
      id: "git-head",
      command: git,
      args: ["rev-parse", "--short", "HEAD"],
      timeoutMs: 60 * 1000
    },
    60 * 1000
  );
  const branchStep = await runStep(
    {
      id: "git-branch",
      command: git,
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      timeoutMs: 60 * 1000
    },
    60 * 1000
  );
  const statusStep = await runStep(
    {
      id: "git-status-short",
      command: git,
      args: ["status", "--short", "--branch"],
      timeoutMs: 60 * 1000
    },
    60 * 1000
  );
  const statusLines = statusStep.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const branchLine = statusLines.find((line) => line.startsWith("##")) ?? "";
  const dirtyEntries = statusLines.filter((line) => !line.startsWith("##"));
  return {
    branch: branchStep.stdout.trim() || "unknown",
    head: headStep.stdout.trim() || "unknown",
    branchLine,
    worktreeDirty: dirtyEntries.length > 0,
    dirtyEntryCount: dirtyEntries.length,
    dirtyEntries: dirtyEntries.slice(0, 50)
  };
}

function stepTotals(report) {
  const flatSteps = report.iterations.flatMap((iteration) => iteration.steps);
  const passed = flatSteps.filter((step) => step.status === "PASS").length;
  const failed = flatSteps.filter((step) => step.status !== "PASS").length;
  return {
    total: flatSteps.length,
    passed,
    failed
  };
}

function handoffDecision(report) {
  if (report.status !== "PASS") {
    return {
      status: "BLOCKED",
      summary:
        "A local gate failed. Do not continue install, image, or live CRC work until the failed step output is reviewed.",
      firstAction:
        "Open the failure section below, then inspect the JSON evidence for stdout/stderr."
    };
  }
  if (report.gitFinish?.worktreeDirty) {
    return {
      status: "REVIEW",
      summary:
        "The gates passed, but the worktree changed during the loop. Review dirty entries before committing or installing.",
      firstAction:
        "Run git status --short --branch and inspect the listed dirty entries."
    };
  }
  return {
    status: "READY_FOR_NEXT_LOCAL_LANE",
    summary:
      "Local non-mutating gates are green on the stamped head. Continue the next product lane before any live CRC action.",
    firstAction:
      "Read the autonomy plan, then run a fresh checkpoint after the next code or runbook change."
  };
}

function morningHandoff(report) {
  const totals = stepTotals(report);
  const decision = handoffDecision(report);
  return {
    decision,
    stepTotals: totals,
    operatorReadFirst: [
      "This evidence is local and non-mutating.",
      "A PASS means the local product gates are still coherent; it does not mean production or certified OperatorHub readiness.",
      "Live CRC work still requires the MacBook CRC cluster, valid login, and explicit approval for any cluster mutation."
    ],
    safeEntrypoints: [
      options.markdownOut,
      options.evidenceOut,
      options.autonomyPlan,
      options.morningHandoff
    ],
    nextSafeCommands: [
      "npm run verify:web-shell",
      "npm run verify:crc-demo-readiness",
      "npm run overnight:checkpoint"
    ],
    blockedActions: [
      "Do not patch OLSConfig from this runner.",
      "Do not create secrets or registry credentials from this runner.",
      "Do not claim native OpenShift Lightspeed drawer rebranding without ConsolePlugin verification."
    ],
    leaveMacPoweredRationale:
      "Leaving the MacBook awake preserves CRC, OpenShift console, Docker registry trust, and port-forward context for the next live demo pass; if it sleeps, continue from local evidence and reconnect live CRC manually."
  };
}

function renderMarkdown(report) {
  const totals = stepTotals(report);
  const morning = report.morningHandoff ?? morningHandoff(report);
  const lines = [
    "# Cywell OpsLens Dev 0.1.2 Overnight Checkpoint",
    "",
    `Generated: ${report.finishedAt}`,
    `Branch: \`${report.git.branch}\``,
    `Head: \`${report.git.head}\``,
    `Start worktree dirty: \`${String(report.git.worktreeDirty)}\` (${report.git.dirtyEntryCount} entries)`,
    `Finish worktree dirty: \`${String(report.gitFinish?.worktreeDirty ?? "unknown")}\` (${report.gitFinish?.dirtyEntryCount ?? "unknown"} entries)`,
    `Status: \`${report.status}\``,
    `Morning decision: \`${morning.decision.status}\``,
    "",
    "## Read This First",
    "",
    morning.decision.summary,
    "",
    `First action: ${morning.decision.firstAction}`,
    "",
    `Step totals: ${totals.passed}/${totals.total} passed, ${totals.failed} failed.`,
    "",
    "Safe entrypoints:",
    "",
    `- \`${options.autonomyPlan}\``,
    `- \`${options.morningHandoff}\``,
    `- \`${options.markdownOut}\``,
    `- \`${options.evidenceOut}\``,
    "",
    "Safe next commands:",
    "",
    ...morning.nextSafeCommands.map((command) => `- \`${command}\``),
    "",
    "Blocked actions:",
    "",
    ...morning.blockedActions.map((action) => `- ${action}`),
    "",
    "## Scope",
    "",
    "This runner is local and non-mutating. It does not patch OCP, create secrets, push images, or read `.env` values.",
    "",
    "MacBook note:",
    "",
    morning.leaveMacPoweredRationale,
    "",
    "## Results",
    "",
    "| Iteration | Step | Status | Duration |",
    "| --- | --- | --- | --- |"
  ];

  for (const iteration of report.iterations) {
    for (const step of iteration.steps) {
      lines.push(
        `| ${iteration.index} | \`${step.id}\` | ${step.status} | ${Math.round(step.durationMs / 1000)}s |`
      );
    }
  }

  const failures = report.iterations.flatMap((iteration) =>
    iteration.steps
      .filter((step) => step.status !== "PASS")
      .map((step) => ({ iteration: iteration.index, step }))
  );

  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of failures) {
      lines.push(
        `- iteration ${failure.iteration} / ${failure.step.id}: exit=${failure.step.exitCode} timedOut=${failure.step.timedOut}`
      );
    }
  }

  if (report.git.worktreeDirty || report.gitFinish?.worktreeDirty) {
    lines.push("", "## Worktree State", "");
    if (report.git.worktreeDirty) {
      lines.push("- Start dirty entries:");
      for (const entry of report.git.dirtyEntries) {
        lines.push(`  - \`${entry}\``);
      }
    }
    if (report.gitFinish?.worktreeDirty) {
      lines.push("- Finish dirty entries:");
      for (const entry of report.gitFinish.dirtyEntries) {
        lines.push(`  - \`${entry}\``);
      }
    }
  }

  lines.push("", "## Next Action", "");
  lines.push(
    report.status === "PASS"
      ? "Continue the next product lane; the non-mutating safety gates are still green."
      : "Inspect the failed step output in the JSON evidence before continuing any install or live CRC work."
  );

  return `${lines.join("\n")}\n`;
}

const options = parseArgs(process.argv.slice(2));
const report = {
  schema: "cywell.opslens.dev012-overnight-checkpoint.v0.2",
  startedAt: nowIso(),
  finishedAt: null,
  status: "PASS",
  options,
  git: await gitStamp(),
  gitFinish: null,
  morningHandoff: null,
  steps: steps.map((step) => ({ id: step.id, command: [step.command, ...step.args].join(" ") })),
  iterations: []
};

console.log(
  `Git start: branch=${report.git.branch} head=${report.git.head} dirty=${String(report.git.worktreeDirty)} entries=${report.git.dirtyEntryCount}`
);

for (let index = 1; index <= options.iterations; index += 1) {
  const iteration = {
    index,
    startedAt: nowIso(),
    finishedAt: null,
    status: "PASS",
    steps: []
  };

  for (const step of steps) {
    const result = await runStep(step, options.commandTimeoutMs);
    iteration.steps.push(result);
    const statusLabel = result.status === "PASS" ? "[PASS]" : "[FAIL]";
    console.log(`${statusLabel} iteration ${index}/${options.iterations} ${step.id} (${Math.round(result.durationMs / 1000)}s)`);

    if (result.status !== "PASS") {
      iteration.status = "FAIL";
      report.status = "FAIL";
      if (options.stopOnFail) break;
    }
  }

  iteration.finishedAt = nowIso();
  report.iterations.push(iteration);

  if (iteration.status !== "PASS" && options.stopOnFail) break;
  if (index < options.iterations) {
    await sleep(options.intervalMinutes * 60 * 1000);
  }
}

report.finishedAt = nowIso();
report.gitFinish = await gitStamp();
report.morningHandoff = morningHandoff(report);

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(options.evidenceOut), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(resolve(options.markdownOut), renderMarkdown(report), "utf8");

console.log(
  `\nCywell OpsLens Dev 0.1.2 overnight checkpoint: status=${report.status}, iterations=${report.iterations.length}`
);
console.log(
  `Git finish: branch=${report.gitFinish.branch} head=${report.gitFinish.head} dirty=${String(report.gitFinish.worktreeDirty)} entries=${report.gitFinish.dirtyEntryCount}`
);
console.log(`Evidence: ${resolve(options.evidenceOut)}`);
console.log(`Summary: ${resolve(options.markdownOut)}`);

process.exitCode = report.status === "PASS" ? 0 : 1;
