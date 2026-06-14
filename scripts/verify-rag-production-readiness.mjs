#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-rag-production-readiness.json",
  contractSource: "deploy/rag-production/approval-ingestion-contract.yaml",
  approvalQueueEvidence: "test-results/cywell-opslens-rag-approval-queue.json",
  acceptanceSource: "docs/acceptance/mvp-0.1.md",
  ragApprovalQueueDoc: "docs/rag/cywell-opslens-rag-approval-queue.md",
  timeoutMs: 10000
};

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
  contractSource: parsed.get("contract-source") ?? defaults.contractSource,
  approvalQueueEvidence:
    parsed.get("approval-queue-evidence") ?? defaults.approvalQueueEvidence,
  acceptanceSource: parsed.get("acceptance-source") ?? defaults.acceptanceSource,
  ragApprovalQueueDoc:
    parsed.get("rag-approval-queue-doc") ?? defaults.ragApprovalQueueDoc,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
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
  const text = String(value ?? "");
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(text) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(text) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(text) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(text) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(text);
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

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) pass(name, detail);
  else fail(name, failureDetail);
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
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
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function readText(path, label, required = true) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    if (required) fail(label, `${path} is missing`);
    else warn(label, `${path} is missing`);
    return undefined;
  }
  pass(label, `${path} exists`);
  return readFileSync(absolutePath, "utf8");
}

function readJson(path, label, required = false) {
  const text = readText(path, label, required);
  if (!text) return undefined;
  try {
    const artifact = JSON.parse(text);
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function readYaml(path, label) {
  const text = readText(path, label, true);
  if (!text) return undefined;
  try {
    const artifact = parse(text);
    pass(label, `${artifact?.artifactType ?? artifact?.schema ?? "unknown"} parsed`);
    return artifact;
  } catch (error) {
    fail(label, `${path} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function commandLooksMutating(command) {
  const text = String(command ?? "");
  if (/\b(oc|kubectl)\s+apply\b/i.test(text) && /--dry-run=(server|client)\b/i.test(text)) {
    return false;
  }
  return /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i.test(text);
}

function productionGapOwner(gap) {
  if (/worker|job|apply|deployment|schedule/i.test(gap)) return "cluster-sre";
  if (/audit|rollback|vector/i.test(gap)) return "security-reviewer";
  return "rag-owner";
}

function productionGapNextCommand(gap) {
  if (/approval queue|source-ref/i.test(gap)) return "npm run verify:rag:approval-queue";
  if (/worker|job|apply|deployment/i.test(gap)) return "npm run verify:install-plan";
  return "npm run verify:rag:production-readiness";
}

function firstProductionActions(missingEvidence, readOnlyCommands, approvalGatedCommands) {
  const gapActions = missingEvidence.slice(0, 3).map((gap, index) => ({
    id: `rag-production-gap-${index + 1}`,
    owner: productionGapOwner(gap),
    phase: "production-readiness-preflight",
    status: "needs-evidence",
    request: "Resolve production RAG ingestion readiness evidence before enabling queue, worker, vector writes, or ingestion jobs.",
    evidenceNeeded: gap,
    nextCommand: productionGapNextCommand(gap),
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy: [gap],
    rollbackPath: "No rollback is required for read-only RAG production readiness preflight."
  }));
  const preflight = readOnlyCommands.find((command) => command.id === "verify-rag-production-readiness") ?? readOnlyCommands[0];
  const preflightAction = preflight
    ? [
        {
          id: preflight.id,
          owner: "rag-owner",
          phase: preflight.phase,
          status: missingEvidence.length > 0 ? "needs-evidence" : "ready",
          request: "Refresh the non-mutating RAG production readiness handoff from current approval queue and contract evidence.",
          evidenceNeeded:
            missingEvidence.length > 0
              ? "RAG production readiness gaps remain before approval."
              : "Current-head RAG production readiness evidence is ready for approval review.",
          nextCommand: preflight.command,
          mutation: false,
          requiresExplicitApproval: false,
          blockedBy: missingEvidence,
          rollbackPath: "No rollback is required for read-only RAG production readiness refresh."
        }
      ]
    : [];
  const firstMutatingCommand = approvalGatedCommands.find((command) => command.mutation === true);
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "cluster-sre",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until RAG production approvals are explicit.`,
          evidenceNeeded: "All RAG production readiness gaps are resolved and rag-owner, cluster-sre, and security-reviewer approvals are recorded.",
          nextCommand: firstMutatingCommand.command,
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: missingEvidence,
          rollbackPath: firstMutatingCommand.rollback ?? "Disable the ingestion worker schedule and revert approved source refs before retrying."
        }
      ]
    : [];

  return [...gapActions, ...preflightAction, ...gatedMutationAction];
}

function refOf(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function includesAll(values, required) {
  const set = new Set(values ?? []);
  return required.every((item) => set.has(item));
}

function componentLiveGaps(contract) {
  const components = contract?.components ?? {};
  return [
    ["queue", "production database-backed queue deployment is not approved/applied"],
    ["ingestionWorker", "production ingestion worker is not approved/applied"],
    ["vectorWriteAuditSink", "append-only vector write audit sink is not live"]
  ]
    .filter(([id]) => components[id]?.liveReady !== true)
    .map(([, gap]) => gap);
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const contract = readYaml(options.contractSource, "RAG production contract");
  const approvalQueue = readJson(
    options.approvalQueueEvidence,
    "RAG approval queue evidence",
    false
  );
  const acceptanceText = readText(options.acceptanceSource, "acceptance matrix", true) ?? "";
  const ragDocText = readText(options.ragApprovalQueueDoc, "RAG approval queue doc", true) ?? "";

  const requiredApprovals = ["rag-owner", "cluster-sre", "security-reviewer"];
  const components = contract?.components ?? {};
  const defaultState = contract?.defaultState ?? {};
  const readOnlyCommands = contract?.readOnlyCommands ?? [];
  const approvalGatedCommands = contract?.approvalGatedCommands ?? [];
  const promotionGates = contract?.promotionGates ?? [];
  const forbiddenActions = contract?.forbiddenActions ?? [];

  expectCheck(
    "contract schema",
    contract?.schema === "cywell.opslens.rag-production-readiness-contract.v0.1" &&
      contract?.artifactType === "opslens.rag-production-readiness-contract.v0.1",
    `${contract?.schema ?? "missing"} ${contract?.artifactType ?? "missing"}`
  );
  expectCheck(
    "contract action mode",
    contract?.actionMode === "productionReadinessContractOnly",
    `actionMode=${contract?.actionMode ?? "missing"}`
  );
  expectCheck(
    "production defaults stay disabled",
    defaultState.productionQueueEnabled === false &&
      defaultState.ingestionWorkerEnabled === false &&
      defaultState.vectorWriteAllowed === false &&
      defaultState.ingestionAllowed === false &&
      defaultState.clusterMutationAllowed === false &&
      defaultState.registryMutationAllowed === false,
    "queue=false worker=false vectorWrite=false ingestion=false clusterMutation=false registryMutation=false"
  );
  expectCheck(
    "raw Markdown boundary",
    defaultState.rawMarkdownReturned === false &&
      defaultState.rawMarkdownPersistedByOpsLensApi === false &&
      components.queue?.storesRawMarkdown === false &&
      components.ingestionWorker?.readsRawMarkdownFromOpsLensApi === false,
    "rawMarkdownReturned=false rawMarkdownPersistedByOpsLensApi=false queue.storesRawMarkdown=false worker.readsRawMarkdownFromOpsLensApi=false"
  );
  expectCheck(
    "required approvers",
    includesAll(contract?.requiredApprovals, requiredApprovals),
    `requiredApprovals=${(contract?.requiredApprovals ?? []).join(",") || "missing"}`
  );
  expectCheck(
    "database-backed queue contract",
    components.queue?.required === true &&
      components.queue?.contractReady === true &&
      components.queue?.backendClass === "database-backed" &&
      components.queue?.storesValidationMetadata === true &&
      components.queue?.storesRedactedChunks === true &&
      includesAll(components.queue?.requiredFields, [
        "tenantId",
        "queueItemId",
        "validationHash",
        "sourceRef",
        "requiredApprovals",
        "status"
      ]),
    `backend=${components.queue?.backendClass ?? "missing"} contractReady=${String(components.queue?.contractReady)}`
  );
  expectCheck(
    "ingestion worker contract",
    components.ingestionWorker?.required === true &&
      components.ingestionWorker?.contractReady === true &&
      components.ingestionWorker?.enabledByDefault === false &&
      components.ingestionWorker?.createsKubernetesJobByThisVerifier === false &&
      components.ingestionWorker?.sourceOfTruth === "approved-source-ref",
    `mode=${components.ingestionWorker?.mode ?? "missing"} enabledByDefault=${String(components.ingestionWorker?.enabledByDefault)}`
  );
  expectCheck(
    "vector write audit sink contract",
    components.vectorWriteAuditSink?.required === true &&
      components.vectorWriteAuditSink?.contractReady === true &&
      components.vectorWriteAuditSink?.appendOnly === true &&
      components.vectorWriteAuditSink?.recordsRollbackChunkIds === true &&
      components.vectorWriteAuditSink?.recordsValidationHash === true &&
      components.vectorWriteAuditSink?.recordsApproverRoles === true,
    `appendOnly=${String(components.vectorWriteAuditSink?.appendOnly)} rollbackChunkIds=${String(components.vectorWriteAuditSink?.recordsRollbackChunkIds)}`
  );
  expectCheck(
    "promotion gates",
    includesAll(
      promotionGates.map((gate) => gate.id),
      [
        "approval-queue-same-head",
        "production-db-reviewed",
        "worker-reviewed",
        "audit-sink-reviewed",
        "rollback-export-reviewed"
      ]
    ) &&
      promotionGates.every((gate) => gate.required === true),
    `promotionGates=${promotionGates.map((gate) => gate.id).join(",") || "missing"}`
  );
  expectCheck(
    "read-only commands are non-mutating",
    readOnlyCommands.length >= 3 &&
      readOnlyCommands.every((command) =>
        command.mutation === false && !commandLooksMutating(command.command)
      ),
    `readOnlyCommands=${readOnlyCommands.length}`
  );
  expectCheck(
    "approval-gated commands are explicit mutations",
    approvalGatedCommands.length >= 2 &&
      approvalGatedCommands.every((command) =>
        command.mutation === true &&
        command.requiresExplicitApproval === true &&
        commandLooksMutating(command.command) &&
        includesAll(command.requiredApprovals, command.id === "run-approved-rag-ingestion-job"
          ? ["rag-owner", "cluster-sre"]
          : requiredApprovals)
      ),
    `approvalGatedCommands=${approvalGatedCommands.length}`
  );
  expectCheck(
    "forbidden assistant actions",
    includesAll(forbiddenActions, [
      "assistant-triggered-ingestion",
      "dashboard-vector-write",
      "api-raw-markdown-return",
      "approval-from-validation-only",
      "apply-delete-scale-without-human-approval"
    ]),
    `forbiddenActions=${forbiddenActions.join(",") || "missing"}`
  );
  expectCheck(
    "acceptance maps production readiness command",
    /verify:rag:production-readiness/.test(acceptanceText),
    "acceptance matrix references verify:rag:production-readiness"
  );
  expectCheck(
    "RAG design doc maps production readiness command",
    /verify:rag:production-readiness/.test(ragDocText),
    "RAG approval queue doc references verify:rag:production-readiness"
  );

  const approvalQueueRef = refOf(approvalQueue);
  const approvalQueueMissingEvidence = [];
  if (!approvalQueue) {
    approvalQueueMissingEvidence.push("RAG approval queue evidence is missing; run npm run verify:rag:approval-queue");
  } else {
    if (approvalQueue.status !== "PASS") {
      approvalQueueMissingEvidence.push(`RAG approval queue status=${approvalQueue.status ?? "missing"}`);
    }
    if (approvalQueueRef.headSha !== headSha) {
      approvalQueueMissingEvidence.push(`RAG approval queue head=${approvalQueueRef.headSha ?? "missing"} currentHead=${headSha}`);
    }
    if (approvalQueueRef.worktreeDirty !== false) {
      approvalQueueMissingEvidence.push(`RAG approval queue dirty=${String(approvalQueueRef.worktreeDirty)}`);
    }
    if (approvalQueue.policy?.vectorWriteAllowed !== false ||
      approvalQueue.policy?.ingestionAllowed !== false ||
      approvalQueue.ingestionPlan?.approved?.ingestionJobCreated !== false) {
      approvalQueueMissingEvidence.push("RAG approval queue evidence does not preserve the non-mutating ingestion boundary");
    }
  }
  if (approvalQueueMissingEvidence.length > 0) {
    warn("RAG approval queue same-head bridge", approvalQueueMissingEvidence.join("; "));
  } else {
    pass("RAG approval queue same-head bridge", `head=${headSha} status=PASS ingestionPlanOnly`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const liveGaps = componentLiveGaps(contract);
  const missingEvidence = [
    ...approvalQueueMissingEvidence,
    ...liveGaps,
    "approved source-ref retrieval path is not live",
    "approved rollback export path has not been exercised against a live vector store"
  ].map(sanitize);
  const firstActions = firstProductionActions(
    missingEvidence,
    readOnlyCommands,
    approvalGatedCommands
  );
  const status = failures.length > 0 ? "BLOCKED" : "APPROVAL_REQUIRED";

  const artifact = {
    schema: "cywell.opslens.rag-production-readiness.v0.1",
    artifactType: "opslens.rag-production-readiness.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "productionReadinessOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    acceptance: ["AC-RAG-001", "AC-RAG-002", "AC-DASH-001", "AC-OP-005"],
    contractSource: resolve(options.contractSource),
    approvalQueueEvidence: {
      path: resolve(options.approvalQueueEvidence),
      status: approvalQueue?.status ?? "missing",
      headSha: approvalQueueRef.headSha ?? "missing",
      worktreeDirty: approvalQueueRef.worktreeDirty ?? "unknown"
    },
    readiness: {
      contractReady: failures.length === 0,
      approvalRequired: true,
      productionQueueLive: components.queue?.liveReady === true,
      ingestionWorkerLive: components.ingestionWorker?.liveReady === true,
      vectorWriteAuditSinkLive: components.vectorWriteAuditSink?.liveReady === true,
      missingLiveComponents: liveGaps
    },
    components: {
      queue: {
        backendClass: components.queue?.backendClass ?? "missing",
        allowedBackends: components.queue?.allowedBackends ?? [],
        contractReady: components.queue?.contractReady === true,
        liveReady: components.queue?.liveReady === true,
        storesRawMarkdown: components.queue?.storesRawMarkdown === true,
        storesValidationMetadata: components.queue?.storesValidationMetadata === true,
        storesRedactedChunks: components.queue?.storesRedactedChunks === true
      },
      ingestionWorker: {
        mode: components.ingestionWorker?.mode ?? "missing",
        contractReady: components.ingestionWorker?.contractReady === true,
        liveReady: components.ingestionWorker?.liveReady === true,
        enabledByDefault: components.ingestionWorker?.enabledByDefault === true,
        createsKubernetesJobByThisVerifier:
          components.ingestionWorker?.createsKubernetesJobByThisVerifier === true,
        sourceOfTruth: components.ingestionWorker?.sourceOfTruth ?? "missing"
      },
      vectorWriteAuditSink: {
        contractReady: components.vectorWriteAuditSink?.contractReady === true,
        liveReady: components.vectorWriteAuditSink?.liveReady === true,
        appendOnly: components.vectorWriteAuditSink?.appendOnly === true,
        recordsRollbackChunkIds:
          components.vectorWriteAuditSink?.recordsRollbackChunkIds === true,
        recordsValidationHash:
          components.vectorWriteAuditSink?.recordsValidationHash === true,
        recordsApproverRoles:
          components.vectorWriteAuditSink?.recordsApproverRoles === true
      }
    },
    policy: {
      productionQueueEnabledByVerifier: false,
      ingestionWorkerEnabledByVerifier: false,
      rawMarkdownReturned: false,
      rawMarkdownPersistedByOpsLensApi: false,
      vectorWriteAllowed: false,
      ingestionAllowed: false,
      clusterMutationAllowed: false,
      requiresExplicitApproval: true
    },
    requiredApprovals: contract?.requiredApprovals ?? [],
    promotionGates: promotionGates.map((gate) => ({
      id: sanitize(gate.id),
      required: gate.required === true,
      evidence: sanitize(gate.evidence)
    })),
    readOnlyCommands: readOnlyCommands.map((command) => ({
      id: sanitize(command.id),
      phase: sanitize(command.phase),
      command: sanitize(command.command),
      mutation: command.mutation === true,
      writesLocalEvidence: command.writesLocalEvidence === true
    })),
    approvalGatedCommands: approvalGatedCommands.map((command) => ({
      id: sanitize(command.id),
      phase: sanitize(command.phase),
      command: sanitize(command.command),
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true,
      requiredApprovals: (command.requiredApprovals ?? []).map(sanitize),
      rationale: sanitize(command.rationale),
      rollback: sanitize(command.rollback)
    })),
    firstProductionActions: firstActions,
    evidence: [
      "production readiness verifier validates the queue/worker/audit contract without applying manifests",
      "default state keeps production queue, ingestion worker, vector writes, and cluster mutation disabled",
      "read-only verification commands are separated from approval-gated oc mutation commands",
      "approved local queue metadata remains a bridge; live ingestion still requires source-ref, DB, worker, audit sink, and rollback evidence"
    ],
    missingEvidence,
    risk: (contract?.risk ?? []).map(sanitize),
    rollbackPath: (contract?.rollbackPath ?? []).map(sanitize),
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (secretLike(serialized)) {
    throw new Error("RAG production readiness artifact would include unredacted secret material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("RAG production readiness export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens RAG production readiness: status=${status}, ${failures.length} fail, missingEvidence=${missingEvidence.length}`
  );

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  fail("RAG production readiness runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] RAG production readiness runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
