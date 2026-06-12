import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createRagValidationEvidenceExport, redactSensitiveText } from "./localIndex.js";
import type {
  RagApprovalQueueIngestionPlan,
  RagApprovalQueueIngestionPlanRequest,
  RagApprovalQueueInventory,
  RagApprovalQueueInventoryItem,
  RagApprovalQueueReview,
  RagApprovalQueueReviewRequest,
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

export interface RagApprovalQueueReviewOptions {
  persistenceMode?: RagApprovalQueuePersistenceMode;
  queueDir?: string;
  generatedAt?: string;
}

export interface RagApprovalQueueIngestionPlanOptions {
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

function queueItemPath(params: {
  queueDir?: string;
  tenantId: string;
  queueItemId: string;
}) {
  const storageRoot = resolve(params.queueDir ?? "test-results/rag-approval-queue");
  const storagePath = resolve(
    storageRoot,
    safeSegment(params.tenantId),
    `${safeSegment(params.queueItemId)}.json`
  );
  assertWithin(storageRoot, storagePath);
  return { storageRoot, storagePath };
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
  const { storagePath } = queueItemPath({
    queueDir: storageRoot,
    tenantId: request.tenantId,
    queueItemId
  });
  const blockers = !accepted
    ? evidenceExport.approvalQueue.blockers
    : persistenceEnabled
      ? []
      : [
          "approval queue persistence is disabled; set CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE=enabled"
        ];

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

function remainingApprovals(submission: RagApprovalQueueSubmission) {
  const approvedRoles = new Set(
    submission.approvalQueue.approvals.map((approval) => approval.role)
  );
  return submission.approvalQueue.requiredApprovals.filter(
    (role) => !approvedRoles.has(role)
  );
}

export async function reviewRagApprovalQueueItem(
  request: RagApprovalQueueReviewRequest,
  options: RagApprovalQueueReviewOptions = {}
): Promise<RagApprovalQueueReview> {
  if (options.persistenceMode !== "enabled") {
    throw new Error("approval queue review requires local persistence to be enabled");
  }
  if (!request.tenantId || !request.queueItemId) {
    throw new Error("tenantId and queueItemId are required for approval queue review");
  }
  if (!request.reviewer || !request.role || !request.reason) {
    throw new Error("reviewer, role, and reason are required for approval queue review");
  }
  if (request.decision !== "approve" && request.decision !== "reject") {
    throw new Error("decision must be approve or reject");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const { storagePath } = queueItemPath({
    queueDir: options.queueDir,
    tenantId: request.tenantId,
    queueItemId: request.queueItemId
  });
  const submission = JSON.parse(
    await readFile(storagePath, "utf8")
  ) as RagApprovalQueueSubmission;

  if (
    submission.artifactType !== "opslens.rag.approval-queue-submission.v0.2" ||
    submission.tenantId !== request.tenantId ||
    submission.queueItemId !== request.queueItemId
  ) {
    throw new Error("approval queue review target does not match a persisted queue item");
  }
  if (submission.state !== "pending-human-approval") {
    throw new Error(`approval queue item is not pending review: ${submission.state}`);
  }

  const previousState = submission.state;
  const sanitizedReason = redactSensitiveText(request.reason);
  const sanitizedTicketRef = request.ticketRef
    ? redactSensitiveText(request.ticketRef)
    : undefined;

  if (request.decision === "approve") {
    if (!submission.approvalQueue.requiredApprovals.includes(request.role)) {
      throw new Error(`review role ${request.role} is not required for this queue item`);
    }
    submission.approvalQueue.approvals = [
      ...submission.approvalQueue.approvals.filter(
        (approval) => approval.role !== request.role
      ),
      {
        approver: redactSensitiveText(request.reviewer),
        role: request.role,
        approvedAt: generatedAt
      }
    ];
    const remaining = remainingApprovals(submission);
    submission.state = remaining.length === 0
      ? "approved-for-ingestion"
      : "pending-human-approval";
    submission.approvalQueue.blockers = remaining.map(
      (role) => `${role} approval`
    );
    submission.missingEvidence = remaining.length
      ? remaining.map((role) => `${role} approval`)
      : [
          "production ingestion worker has not run",
          "vector store write remains blocked until a separate ingestion job is approved"
        ];
    submission.approvalQueue.evidence = [
      ...submission.approvalQueue.evidence,
      `approved by role=${request.role}`,
      `reviewedAt=${generatedAt}`,
      "approval review updated queue metadata only"
    ];
  } else {
    submission.state = "rejected-by-reviewer";
    submission.approvalQueue.blockers = [
      `rejected by ${request.role}`,
      sanitizedReason
    ];
    submission.missingEvidence = [
      "author must submit a corrected draft and regenerate validation evidence"
    ];
    submission.approvalQueue.evidence = [
      ...submission.approvalQueue.evidence,
      `rejected by role=${request.role}`,
      `reviewedAt=${generatedAt}`,
      "rejection review updated queue metadata only"
    ];
  }

  const remaining = remainingApprovals(submission);
  const persistedSubmission: RagApprovalQueueSubmission = {
    ...submission,
    content: {
      ...submission.content,
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false
    },
    policy: {
      ...submission.policy,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false
    }
  };

  await writeFile(storagePath, `${JSON.stringify(persistedSubmission, null, 2)}\n`, "utf8");

  return {
    artifactType: "opslens.rag.approval-queue-review.v0.1",
    artifactVersion: "0.1",
    generatedAt,
    queueItemId: submission.queueItemId,
    tenantId: submission.tenantId,
    fileName: submission.fileName,
    actionMode: "approvalReviewOnly",
    decision: request.decision,
    previousState,
    state: submission.state,
    reviewer: {
      reviewer: redactSensitiveText(request.reviewer),
      role: request.role,
      reviewedAt: generatedAt,
      reason: sanitizedReason,
      ticketRef: sanitizedTicketRef
    },
    approvalQueue: {
      mode: "persistentLocal",
      persisted: true,
      requiredApprovals: submission.approvalQueue.requiredApprovals,
      approvals: submission.approvalQueue.approvals,
      remainingApprovals: remaining,
      blockers: submission.approvalQueue.blockers,
      evidence: [
        `decision=${request.decision}`,
        `state=${submission.state}`,
        "review artifact contains reviewer metadata and redacted reason only",
        "raw markdown, vector writes, ingestion jobs, and cluster mutations remain blocked"
      ]
    },
    content: {
      markdownReturned: false,
      documentBodyReturned: false,
      chunksReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false
    },
    policy: {
      reviewAllowed: true,
      queueMetadataWriteAllowed: true,
      rawDocumentReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false,
      ingestionAllowed: false
    },
    risk: [
      "Approval review changes local queue metadata only and is not a vector ingestion event.",
      "An approved queue item still requires a separate ingestion job and source-control evidence before indexing."
    ],
    rollbackPath: [
      "Reject the queue item with reviewer evidence if approval was recorded by mistake.",
      "Delete the local queue item JSON before any future ingestion job if the draft must be withdrawn.",
      "Regenerate validation evidence after source Markdown changes."
    ],
    missingEvidence: persistedSubmission.missingEvidence
  };
}

export async function planRagApprovalQueueIngestionJob(
  request: RagApprovalQueueIngestionPlanRequest,
  options: RagApprovalQueueIngestionPlanOptions = {}
): Promise<RagApprovalQueueIngestionPlan> {
  if (options.persistenceMode !== "enabled") {
    throw new Error("RAG ingestion planning requires local approval queue persistence");
  }
  if (!request.tenantId || !request.queueItemId) {
    throw new Error("tenantId and queueItemId are required for RAG ingestion planning");
  }
  if (!request.requestedBy || !request.reason) {
    throw new Error("requestedBy and reason are required for RAG ingestion planning");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const { storagePath } = queueItemPath({
    queueDir: options.queueDir,
    tenantId: request.tenantId,
    queueItemId: request.queueItemId
  });
  const submission = JSON.parse(
    await readFile(storagePath, "utf8")
  ) as RagApprovalQueueSubmission;

  if (
    submission.artifactType !== "opslens.rag.approval-queue-submission.v0.2" ||
    submission.tenantId !== request.tenantId ||
    submission.queueItemId !== request.queueItemId
  ) {
    throw new Error("RAG ingestion plan target does not match a persisted queue item");
  }

  const approvedForIngestion = submission.state === "approved-for-ingestion";
  const missingEvidence = approvedForIngestion
    ? [
        "production ingestion worker approval",
        "source commit or change request containing raw Markdown outside OpsLens",
        "vector store write audit sink and rollback export path"
      ]
    : [
        `queue item state must be approved-for-ingestion before planning ingestion; current state=${submission.state}`,
        ...submission.missingEvidence
      ];

  return {
    artifactType: "opslens.rag.ingestion-plan.v0.1",
    artifactVersion: "0.1",
    generatedAt,
    queueItemId: submission.queueItemId,
    tenantId: submission.tenantId,
    fileName: submission.fileName,
    actionMode: "ingestionPlanOnly",
    sourceState: submission.state,
    approvedForIngestion,
    document: submission.validation.document,
    plannedJob: {
      status: approvedForIngestion ? "ready-for-ingestion-job" : "blocked",
      jobName: `rag-ingest-${safeSegment(submission.tenantId)}-${submission.queueItemId.replace(/^rag-queue-/, "")}`,
      targetIndexVersion: submission.audit.sourceIndexVersion,
      chunkCount: submission.validation.chunks.length,
      requiredApprovals: submission.approvalQueue.requiredApprovals,
      approvals: submission.approvalQueue.approvals,
      preflightChecks: [
        {
          id: "refresh-rag-validation",
          command: "npm run verify:rag",
          mutation: false,
          required: true
        },
        {
          id: "refresh-approval-queue-evidence",
          command: "npm run verify:rag:approval-queue",
          mutation: false,
          required: true
        }
      ],
      mutatingSteps: [
        {
          id: "future-vector-ingestion-job",
          description:
            "Create a separate approved ingestion job that writes redacted chunks to the production vector store.",
          requiresExplicitApproval: true,
          mutationAllowedByThisPlanner: false
        }
      ]
    },
    content: {
      markdownReturned: false,
      documentBodyReturned: false,
      chunksReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false
    },
    audit: {
      requestedBy: redactSensitiveText(request.requestedBy),
      reason: redactSensitiveText(request.reason),
      ticketRef: request.ticketRef ? redactSensitiveText(request.ticketRef) : undefined,
      validationHash: submission.audit.validationHash,
      approvalCount: submission.approvalQueue.approvals.length
    },
    policy: {
      planOnly: true,
      queueReadAllowed: true,
      queueMetadataWriteAllowed: false,
      rawDocumentReturned: false,
      rawMarkdownPersisted: false,
      vectorWriteAllowed: false,
      clusterMutationAllowed: false,
      ingestionAllowed: false,
      requiresExplicitApproval: true
    },
    evidence: [
      `queueItemId=${submission.queueItemId}`,
      `sourceState=${submission.state}`,
      `validationHash=${submission.audit.validationHash}`,
      `approvals=${submission.approvalQueue.approvals.map((approval) => approval.role).join(",") || "none"}`,
      "ingestion plan reads queue metadata only and does not persist raw Markdown",
      "planner creates no Kubernetes Job, vector write, or ingestion side effect"
    ],
    missingEvidence,
    risk: [
      "Approved queue metadata is not the raw source of truth; the ingestion job must fetch source Markdown from the approved Git or ticket reference.",
      "Vector ingestion can introduce bad operational guidance if stale drafts are indexed without fresh validation.",
      "This planner does not prove production Qdrant/vLLM reachability."
    ],
    rollbackPath: [
      "Do not run ingestion if any preflight check is stale or failing.",
      "Reject or delete the queue item before ingestion if the approved draft is withdrawn.",
      "A future ingestion job must export previous vector chunk IDs so they can be removed if the document is rolled back."
    ]
  };
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
