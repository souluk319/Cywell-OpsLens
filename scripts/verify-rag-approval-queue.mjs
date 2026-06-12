#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLocalRagIndex,
  listRagApprovalQueueItems,
  reviewRagApprovalQueueItem,
  submitRagApprovalQueueItem
} from "../packages/rag/dist/index.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const startedAt = new Date().toISOString();
const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "..");
const evidenceOut = resolve("test-results/cywell-opslens-rag-approval-queue.json");
const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail: String(detail) });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) pass(name, detail);
  else fail(name, failDetail);
}

async function gitValue(args, fallback) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim().split(/\r?\n/).at(-1) || fallback;
  } catch {
    return fallback;
  }
}

async function worktreeDirty() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim().length > 0;
  } catch {
    return true;
  }
}

function containsRawSecret(value) {
  return /token=demo-secret|password=demo-secret|bearer demo-secret/i.test(
    JSON.stringify(value)
  );
}

const safeDraft = `---
id: customer-runbook:payments-approval-queue-fixture
label: Payments Approval Queue Fixture
sourceType: customer-runbook
trustLevel: draft
---

# Payments Approval Queue Fixture

When payments-api restarts after a rollout, compare readiness probe events, previous container logs, and deployment resource limits before proposing a memory limit change. token=demo-secret must be redacted from evidence snippets.

The raw Markdown source remains in Git or a ticket system; OpsLens persists only validation metadata, redacted chunks, and reviewer requirements.`;

const duplicateDraft = `---
id: customer-runbook:payments-api-crashloop
label: Duplicate Payments CrashLoop
sourceType: customer-runbook
trustLevel: draft
---

# Duplicate

This draft intentionally duplicates an existing document id and must not be queued.`;

const rejectableDraft = `---
id: customer-runbook:payments-review-reject-fixture
label: Payments Review Reject Fixture
sourceType: customer-runbook
trustLevel: draft
---

# Payments Review Reject Fixture

This draft is valid enough to enter the queue, then rejected by a human reviewer because the change request needs a clearer source commit reference. token=demo-secret must stay redacted.`;

try {
  const index = buildLocalRagIndex(resolve("data/runbooks"));
  const tmpQueue = await mkdtemp(join(tmpdir(), "opslens-rag-queue-"));
  const baseRequest = {
    tenantId: "cywell-payments",
    fileName: "payments-approval-queue-fixture.md",
    markdown: safeDraft,
    requestedBy: "queue-verifier",
    reason: "verify metadata-only approval queue persistence with token=demo-secret",
    ticketRef: "OPS-QUEUE-001 token=demo-secret"
  };

  const disabledSubmission = await submitRagApprovalQueueItem(index, baseRequest, {
    persistenceMode: "disabled",
    queueDir: tmpQueue
  });

  expectCheck(
    "disabled queue remains design-only",
    disabledSubmission.state === "design-only" &&
      disabledSubmission.approvalQueue.mode === "designOnly" &&
      disabledSubmission.approvalQueue.enqueueAllowed === false &&
      disabledSubmission.approvalQueue.persisted === false,
    `state=${disabledSubmission.state} mode=${disabledSubmission.approvalQueue.mode} persisted=${disabledSubmission.approvalQueue.persisted}`
  );
  expectCheck(
    "disabled queue blocks vector writes",
    disabledSubmission.policy.vectorWriteAllowed === false &&
      disabledSubmission.policy.clusterMutationAllowed === false &&
      disabledSubmission.content.rawMarkdownPersisted === false,
    "vectorWriteAllowed=false clusterMutationAllowed=false rawMarkdownPersisted=false"
  );

  const disabledInventory = await listRagApprovalQueueItems({
    persistenceMode: "disabled",
    queueDir: tmpQueue
  });

  expectCheck(
    "disabled inventory is read-only design-only",
    disabledInventory.actionMode === "approvalQueueReadOnly" &&
      disabledInventory.mode === "designOnly" &&
      disabledInventory.itemCount === 0 &&
      disabledInventory.policy.readOnly === true &&
      disabledInventory.policy.approvalMutationAllowed === false &&
      disabledInventory.policy.vectorWriteAllowed === false,
    `mode=${disabledInventory.mode} items=${disabledInventory.itemCount} readOnly=${disabledInventory.policy.readOnly}`
  );

  const enabledSubmission = await submitRagApprovalQueueItem(index, baseRequest, {
    persistenceMode: "enabled",
    queueDir: tmpQueue
  });
  const storagePath = enabledSubmission.approvalQueue.storagePath;
  const persisted = storagePath ? JSON.parse(readFileSync(storagePath, "utf8")) : undefined;

  expectCheck(
    "enabled queue persists item",
    enabledSubmission.state === "pending-human-approval" &&
      enabledSubmission.approvalQueue.mode === "persistentLocal" &&
      enabledSubmission.approvalQueue.enqueueAllowed === true &&
      enabledSubmission.approvalQueue.persisted === true &&
      Boolean(storagePath) &&
      existsSync(storagePath),
    `state=${enabledSubmission.state} mode=${enabledSubmission.approvalQueue.mode} path=${storagePath ?? "missing"}`
  );
  expectCheck(
    "persisted queue is metadata only",
      persisted?.content?.rawMarkdownPersisted === false &&
      persisted?.content?.documentBodyReturned === false &&
      persisted?.content?.chunksRedacted === true &&
      !JSON.stringify(persisted).includes("id: customer-runbook:payments-approval-queue-fixture") &&
      !JSON.stringify(persisted).includes("sourceType: customer-runbook") &&
      !JSON.stringify(persisted).includes("# Payments Approval Queue Fixture") &&
      !containsRawSecret(persisted),
    "persisted artifact excludes front matter, headings, full raw body, and secret-like values"
  );
  expectCheck(
    "queue keeps approval evidence",
    persisted?.approvalQueue?.requiredApprovals?.includes("rag-owner") &&
      persisted?.approvalQueue?.requiredApprovals?.includes("cluster-sre") &&
      persisted?.missingEvidence?.includes("rag-owner approval") &&
      persisted?.missingEvidence?.includes("cluster-sre approval"),
    `required=${persisted?.approvalQueue?.requiredApprovals?.join(",") ?? "missing"}`
  );

  const enabledInventory = await listRagApprovalQueueItems({
    persistenceMode: "enabled",
    queueDir: tmpQueue
  });

  expectCheck(
    "enabled inventory returns metadata-only queue item",
    enabledInventory.mode === "persistentLocal" &&
      enabledInventory.itemCount === 1 &&
      enabledInventory.items[0]?.queueItemId === enabledSubmission.queueItemId &&
      enabledInventory.items[0]?.chunkCount === enabledSubmission.validation.chunks.length &&
      enabledInventory.items[0]?.content.chunksReturned === false &&
      enabledInventory.items[0]?.content.rawMarkdownPersisted === false &&
      enabledInventory.policy.approvalMutationAllowed === false &&
      !containsRawSecret(enabledInventory),
    `mode=${enabledInventory.mode} items=${enabledInventory.itemCount} queueItem=${enabledInventory.items[0]?.queueItemId ?? "missing"}`
  );

  const ragOwnerReview = await reviewRagApprovalQueueItem(
    {
      tenantId: baseRequest.tenantId,
      queueItemId: enabledSubmission.queueItemId,
      reviewer: "rag-owner-reviewer token=demo-secret",
      role: "rag-owner",
      decision: "approve",
      reason: "rag-owner approves redacted chunk evidence with token=demo-secret",
      ticketRef: "OPS-QUEUE-APPROVE token=demo-secret"
    },
    {
      persistenceMode: "enabled",
      queueDir: tmpQueue
    }
  );

  expectCheck(
    "first approval keeps item pending",
    ragOwnerReview.actionMode === "approvalReviewOnly" &&
      ragOwnerReview.state === "pending-human-approval" &&
      ragOwnerReview.approvalQueue.remainingApprovals.includes("cluster-sre") &&
      ragOwnerReview.policy.queueMetadataWriteAllowed === true &&
      ragOwnerReview.policy.vectorWriteAllowed === false &&
      ragOwnerReview.policy.ingestionAllowed === false &&
      ragOwnerReview.content.ingestionJobCreated === false &&
      !containsRawSecret(ragOwnerReview),
    `state=${ragOwnerReview.state} remaining=${ragOwnerReview.approvalQueue.remainingApprovals.join(",")}`
  );

  const sreReview = await reviewRagApprovalQueueItem(
    {
      tenantId: baseRequest.tenantId,
      queueItemId: enabledSubmission.queueItemId,
      reviewer: "cluster-sre-reviewer token=demo-secret",
      role: "cluster-sre",
      decision: "approve",
      reason: "cluster-sre approves metadata-only evidence with token=demo-secret",
      ticketRef: "OPS-QUEUE-APPROVE token=demo-secret"
    },
    {
      persistenceMode: "enabled",
      queueDir: tmpQueue
    }
  );

  expectCheck(
    "second approval reaches approved-for-ingestion without ingesting",
    sreReview.state === "approved-for-ingestion" &&
      sreReview.approvalQueue.approvals.length === 2 &&
      sreReview.approvalQueue.remainingApprovals.length === 0 &&
      sreReview.content.rawMarkdownPersisted === false &&
      sreReview.content.vectorWriteAttempted === false &&
      sreReview.content.ingestionJobCreated === false &&
      sreReview.policy.vectorWriteAllowed === false &&
      sreReview.policy.clusterMutationAllowed === false &&
      sreReview.policy.ingestionAllowed === false &&
      !containsRawSecret(sreReview),
    `state=${sreReview.state} approvals=${sreReview.approvalQueue.approvals.length}`
  );

  const reviewedInventory = await listRagApprovalQueueItems({
    persistenceMode: "enabled",
    queueDir: tmpQueue
  });

  expectCheck(
    "reviewed inventory remains read-only metadata",
    reviewedInventory.mode === "persistentLocal" &&
      reviewedInventory.itemCount === 1 &&
      reviewedInventory.items[0]?.state === "approved-for-ingestion" &&
      reviewedInventory.items[0]?.approvals.length === 2 &&
      reviewedInventory.items[0]?.content.chunksReturned === false &&
      reviewedInventory.policy.approvalMutationAllowed === false &&
      reviewedInventory.policy.vectorWriteAllowed === false &&
      !containsRawSecret(reviewedInventory),
    `state=${reviewedInventory.items[0]?.state ?? "missing"} approvals=${reviewedInventory.items[0]?.approvals.length ?? 0}`
  );

  const rejectableSubmission = await submitRagApprovalQueueItem(
    index,
    {
      ...baseRequest,
      fileName: "payments-review-reject-fixture.md",
      markdown: rejectableDraft,
      ticketRef: "OPS-QUEUE-REJECT token=demo-secret"
    },
    {
      persistenceMode: "enabled",
      queueDir: tmpQueue
    }
  );
  const rejectionReview = await reviewRagApprovalQueueItem(
    {
      tenantId: baseRequest.tenantId,
      queueItemId: rejectableSubmission.queueItemId,
      reviewer: "rag-owner-reviewer token=demo-secret",
      role: "rag-owner",
      decision: "reject",
      reason: "reject until source commit is linked; token=demo-secret",
      ticketRef: "OPS-QUEUE-REJECT token=demo-secret"
    },
    {
      persistenceMode: "enabled",
      queueDir: tmpQueue
    }
  );

  expectCheck(
    "review rejection records metadata-only state",
    rejectionReview.state === "rejected-by-reviewer" &&
      rejectionReview.approvalQueue.blockers.some((blocker) =>
        blocker.includes("rejected by rag-owner")
      ) &&
      rejectionReview.content.rawMarkdownPersisted === false &&
      rejectionReview.policy.vectorWriteAllowed === false &&
      rejectionReview.policy.ingestionAllowed === false &&
      !containsRawSecret(rejectionReview),
    `state=${rejectionReview.state} blockers=${rejectionReview.approvalQueue.blockers.join("|")}`
  );

  const rejectedSubmission = await submitRagApprovalQueueItem(
    index,
    {
      ...baseRequest,
      fileName: "payments-api-crashloop.md",
      markdown: duplicateDraft
    },
    {
      persistenceMode: "enabled",
      queueDir: tmpQueue
    }
  );

  expectCheck(
    "invalid draft does not persist",
    rejectedSubmission.state === "rejected-before-approval" &&
      rejectedSubmission.approvalQueue.enqueueAllowed === false &&
      rejectedSubmission.approvalQueue.persisted === false &&
      rejectedSubmission.validation.accepted === false,
    `state=${rejectedSubmission.state} accepted=${rejectedSubmission.validation.accepted}`
  );

  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const dirty = await worktreeDirty();
  const failures = checks.filter((check) => check.status === "FAIL");
  const artifact = {
    schema: "cywell.opslens.rag-approval-queue.v0.2",
    artifactType: "opslens.rag-approval-queue.v0.2",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: failures.length > 0 ? "FAIL" : "PASS",
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: dirty
    },
    acceptance: ["AC-RAG-002", "AC-DASH-001"],
    queueDir: tmpQueue,
    submissions: {
      disabled: {
        state: disabledSubmission.state,
        persisted: disabledSubmission.approvalQueue.persisted
      },
      enabled: {
        state: enabledSubmission.state,
        persisted: enabledSubmission.approvalQueue.persisted,
        storagePath: enabledSubmission.approvalQueue.storagePath
      },
      rejected: {
        state: rejectedSubmission.state,
        persisted: rejectedSubmission.approvalQueue.persisted
      }
    },
    inventory: {
      disabled: {
        mode: disabledInventory.mode,
        itemCount: disabledInventory.itemCount
      },
      enabled: {
        mode: enabledInventory.mode,
        itemCount: enabledInventory.itemCount,
        readOnly: enabledInventory.policy.readOnly,
        approvalMutationAllowed: enabledInventory.policy.approvalMutationAllowed
      }
    },
    policy: {
      rawDocumentReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false,
      queueMetadataWriteAllowed: true,
      ingestionAllowed: false
    },
    reviews: {
      firstApproval: {
        state: ragOwnerReview.state,
        remainingApprovals: ragOwnerReview.approvalQueue.remainingApprovals
      },
      secondApproval: {
        state: sreReview.state,
        approvals: sreReview.approvalQueue.approvals.length,
        ingestionJobCreated: sreReview.content.ingestionJobCreated
      },
      rejection: {
        state: rejectionReview.state,
        ingestionAllowed: rejectionReview.policy.ingestionAllowed
      }
    },
    evidence: [
      "default API mode remains design-only unless CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE=enabled",
      "enabled fixture persists only metadata, redacted chunks, validation hash, and approval requirements",
      "human approval/rejection reviews update queue metadata only and do not create ingestion jobs",
      "invalid drafts are rejected before durable queue persistence"
    ],
    missingEvidence: [
      "production database-backed queue",
      "approved ingestion job"
    ],
    risk: [
      "Local JSON queue persistence is a Stage 3/4 bridge, not a production database.",
      "Queue persistence does not approve or ingest documents."
    ],
    rollbackPath: [
      "Disable persistence by unsetting CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE.",
      "Delete the local queue item JSON before approval if a draft was submitted by mistake."
    ],
    checks
  };

  await mkdir(dirname(evidenceOut), { recursive: true });
  await writeFile(evidenceOut, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  pass("approval queue evidence export", `${evidenceOut} written without raw Markdown`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(
    `Cywell OpsLens RAG approval queue verification: status=${artifact.status}, ${failures.length} fail, ${checks.length} checks`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  fail("approval queue verifier runtime", error instanceof Error ? error.message : String(error));
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  process.exitCode = 1;
}
