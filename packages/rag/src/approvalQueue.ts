import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRagValidationEvidenceExport, redactSensitiveText } from "./localIndex.js";
import type {
  RagApprovalQueueInventory,
  RagApprovalQueueInventoryItem,
  RagApprovalQueueSubmission,
  RagApprovalQueueSubmitRequest,
  RagIndex
} from "./types.js";

export type RagApprovalQueuePersistenceMode = "disabled" | "enabled";

export interface RagApprovalQueueSubmitOptions {
  persistenceMode?: RagApprovalQueuePersistenceMode;
  queueDir?: string;
  generatedAt?: string;
}

export interface RagApprovalQueueListOptions {
  persistenceMode?: RagApprovalQueuePersistenceMode;
  queueDir?: string;
  tenantId?: string;
  generatedAt?: string;
  maxItems?: number;
}

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function assertWithin(parent: string, child: string) {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  if (childPath !== parentPath && !childPath.startsWith(`${parentPath}${sep}`)) {
    throw new Error("approval queue storage path escaped configured queue directory");
  }
}

export async function submitRagApprovalQueueItem(
  index: RagIndex,
  request: RagApprovalQueueSubmitRequest,
  options: RagApprovalQueueSubmitOptions = {}
): Promise<RagApprovalQueueSubmission> {
  const evidenceExport = createRagValidationEvidenceExport(index, request);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const persistenceEnabled = options.persistenceMode === "enabled";
  const queueItemId = `rag-queue-${evidenceExport.audit.validationHash.slice(0, 16)}`;
  const accepted = evidenceExport.validation.accepted;
  const mode = persistenceEnabled ? "persistentLocal" : "designOnly";
  const state = !accepted
    ? "rejected-before-approval"
    : persistenceEnabled
      ? "pending-human-approval"
      : "design-only";
  const storageRoot = resolve(options.queueDir ?? "test-results/rag-approval-queue");
  const storagePath = resolve(
    storageRoot,
    safeSegment(request.tenantId),
    `${queueItemId}.json`
  );
  const blockers = !accepted
    ? evidenceExport.approvalQueue.blockers
    : persistenceEnabled
      ? []
      : [
          "approval queue persistence is disabled; set CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE=enabled"
        ];

  assertWithin(storageRoot, storagePath);

  const artifact: RagApprovalQueueSubmission = {
    artifactType: "opslens.rag.approval-queue-submission.v0.2",
    artifactVersion: "0.2",
    generatedAt,
    queueItemId,
    tenantId: request.tenantId,
    fileName: request.fileName,
    actionMode: "approvalQueueOnly",
    state,
    validation: evidenceExport.validation,
    evidenceExport: {
      artifactType: evidenceExport.artifactType,
      exportId: evidenceExport.exportId,
      validationHash: evidenceExport.audit.validationHash
    },
    content: {
      markdownReturned: false,
      documentBodyReturned: false,
      chunksRedacted: true,
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false
    },
    approvalQueue: {
      mode,
      enqueueAllowed: persistenceEnabled && accepted,
      persisted: false,
      storagePath: persistenceEnabled && accepted ? storagePath : undefined,
      requiredApprovals: evidenceExport.approvalQueue.requiredApprovals,
      approvals: [],
      blockers,
      evidence: [
        `approval queue mode=${mode}`,
        `validationHash=${evidenceExport.audit.validationHash}`,
        "queue item contains validation metadata and redacted chunks only",
        "raw markdown, document body, vector writes, and cluster mutations remain blocked"
      ]
    },
    audit: {
      requestedBy: request.requestedBy,
      reason: redactSensitiveText(request.reason),
      ticketRef: request.ticketRef ? redactSensitiveText(request.ticketRef) : undefined,
      validationHash: evidenceExport.audit.validationHash,
      sourceIndexVersion: index.version,
      sourceDocumentCount: index.documents.length,
      sourceChunkCount: index.chunks.length
    },
    policy: {
      ...evidenceExport.validation.policy,
      evidenceExportAllowed: true,
      queuePersistenceAllowed: persistenceEnabled && accepted,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false
    },
    risk: [
      "A persisted queue item is not approval and must not trigger vector ingestion by itself.",
      "Raw Markdown remains outside OpsLens API response and queue artifacts.",
      "Approvals must be supplied by rag-owner and cluster-sre before any future ingestion job."
    ],
    rollbackPath: [
      "Delete the queue item JSON before approval if the draft was submitted by mistake.",
      "Regenerate validation evidence after changing the source Markdown.",
      "Keep vector ingestion disabled until approval evidence is complete."
    ],
    missingEvidence: persistenceEnabled && accepted
      ? [
          "rag-owner approval",
          "cluster-sre approval",
          "source commit, ticket, or change request containing the raw Markdown"
        ]
      : blockers
  };

  if (persistenceEnabled && accepted) {
    const persistedArtifact: RagApprovalQueueSubmission = {
      ...artifact,
      approvalQueue: {
        ...artifact.approvalQueue,
        persisted: true
      }
    };
    await mkdir(resolve(storageRoot, safeSegment(request.tenantId)), { recursive: true });
    await writeFile(storagePath, `${JSON.stringify(persistedArtifact, null, 2)}\n`, "utf8");
    return persistedArtifact;
  }

  return artifact;
}

function inventoryPolicy(): RagApprovalQueueInventory["policy"] {
  return {
    readOnly: true,
    rawMarkdownReturned: false,
    documentBodyReturned: false,
    chunksReturned: false,
    vectorWriteAllowed: false,
    clusterMutationAllowed: false,
    approvalMutationAllowed: false
  };
}

function summarizeQueueSubmission(
  submission: RagApprovalQueueSubmission
): RagApprovalQueueInventoryItem {
  return {
    queueItemId: submission.queueItemId,
    generatedAt: submission.generatedAt,
    tenantId: submission.tenantId,
    fileName: submission.fileName,
    state: submission.state,
    validationAccepted: submission.validation.accepted,
    redactionCount: submission.validation.redactionCount,
    chunkCount: submission.validation.chunks.length,
    requiredApprovals: submission.approvalQueue.requiredApprovals,
    approvals: submission.approvalQueue.approvals,
    blockers: submission.approvalQueue.blockers,
    missingEvidence: submission.missingEvidence,
    audit: {
      requestedBy: submission.audit.requestedBy,
      ticketRef: submission.audit.ticketRef,
      validationHash: submission.audit.validationHash
    },
    content: {
      markdownReturned: false,
      documentBodyReturned: false,
      chunksReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false
    },
    evidence: [
      `validationHash=${submission.audit.validationHash}`,
      `state=${submission.state}`,
      "inventory response contains metadata only"
    ]
  };
}

function inventoryArtifact(params: {
  generatedAt: string;
  persistenceEnabled: boolean;
  items: RagApprovalQueueInventoryItem[];
  missingEvidence: string[];
}): RagApprovalQueueInventory {
  return {
    artifactType: "opslens.rag.approval-queue-inventory.v0.2",
    artifactVersion: "0.2",
    generatedAt: params.generatedAt,
    actionMode: "approvalQueueReadOnly",
    mode: params.persistenceEnabled ? "persistentLocal" : "designOnly",
    queuePersistenceEnabled: params.persistenceEnabled,
    itemCount: params.items.length,
    items: params.items,
    policy: inventoryPolicy(),
    evidence: [
      "approval queue inventory is read-only",
      "inventory returns queue item metadata, validation hash, and approval requirements only",
      "approval, rejection, ingestion, vector writes, and cluster mutation are not exposed"
    ],
    missingEvidence: params.missingEvidence,
    risk: [
      "Local JSON queue inventory is a bridge, not the production approval database.",
      "Inventory visibility must not be treated as approval for ingestion."
    ],
    rollbackPath: [
      "Disable local queue persistence to return inventory to design-only mode.",
      "Remove local queue item JSON before approval if a draft should no longer be reviewed."
    ]
  };
}

export async function listRagApprovalQueueItems(
  options: RagApprovalQueueListOptions = {}
): Promise<RagApprovalQueueInventory> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const persistenceEnabled = options.persistenceMode === "enabled";
  const storageRoot = resolve(options.queueDir ?? "test-results/rag-approval-queue");

  if (!persistenceEnabled) {
    return inventoryArtifact({
      generatedAt,
      persistenceEnabled,
      items: [],
      missingEvidence: [
        "approval queue persistence is disabled; inventory is design-only"
      ]
    });
  }

  const missingEvidence: string[] = [];
  const tenantSegments = options.tenantId
    ? [safeSegment(options.tenantId)]
    : await readdir(storageRoot, { withFileTypes: true })
        .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
        .catch(() => {
          missingEvidence.push("approval queue directory does not exist or cannot be read");
          return [];
        });
  const items: RagApprovalQueueInventoryItem[] = [];

  for (const tenantSegment of tenantSegments) {
    const tenantDir = resolve(storageRoot, tenantSegment);
    assertWithin(storageRoot, tenantDir);
    const files = await readdir(tenantDir, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !/^rag-queue-[a-z0-9]+\.json$/i.test(file.name)) continue;
      const itemPath = resolve(tenantDir, file.name);
      assertWithin(storageRoot, itemPath);
      try {
        const submission = JSON.parse(await readFile(itemPath, "utf8")) as RagApprovalQueueSubmission;
        if (submission.artifactType !== "opslens.rag.approval-queue-submission.v0.2") {
          missingEvidence.push(`${file.name} is not a RAG approval queue submission artifact`);
          continue;
        }
        items.push(summarizeQueueSubmission(submission));
      } catch (error) {
        missingEvidence.push(
          `${file.name} could not be read as metadata-only queue evidence: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  items.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  const maxItems = Math.max(1, Math.min(options.maxItems ?? 20, 100));

  return inventoryArtifact({
    generatedAt,
    persistenceEnabled,
    items: items.slice(0, maxItems),
    missingEvidence
  });
}
