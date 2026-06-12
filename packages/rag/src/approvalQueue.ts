import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRagValidationEvidenceExport, redactSensitiveText } from "./localIndex.js";
import type {
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
