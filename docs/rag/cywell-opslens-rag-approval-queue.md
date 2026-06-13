# Cywell OpsLens RAG Approval Queue Design

Status: MVP 0.1 plus Stage 3 bridge. The default product path exports validation evidence and keeps the queue `designOnly`; an explicitly enabled local persistence path can write metadata-only queue items for human approval without raw Markdown, vector writes, or cluster mutation.

## Goal

Create a safe path from operator-authored runbook drafts to future private RAG ingestion without weakening the MVP read-only boundary.

## Current MVP 0.1 Contract

- `POST /api/opslens/admin/rag/validate` validates Markdown front matter, tenant/file safety, duplicate document IDs, chunkability, and sensitive-looking text.
- `POST /api/opslens/admin/rag/evidence-export` returns `opslens.rag.validation-evidence.v0.1`.
- The evidence artifact includes validation result, redacted chunk preview, issue list, missing evidence, validation hash, and approval queue intent.
- The artifact never returns raw Markdown or raw document body.
- `approvalQueue.mode=designOnly`, `enqueueAllowed=false`, and `approvalQueueMutationAllowed=false` for evidence export.
- `POST /api/opslens/admin/rag/approval-queue/submit` returns `opslens.rag.approval-queue-submission.v0.2`.
- `GET /api/opslens/admin/rag/approval-queue` returns `opslens.rag.approval-queue-inventory.v0.2`.
- `POST /api/opslens/admin/rag/approval-queue/review` returns `opslens.rag.approval-queue-review.v0.1` when local persistence is explicitly enabled.
- `POST /api/opslens/admin/rag/approval-queue/ingestion-plan` returns `opslens.rag.ingestion-plan.v0.1` when local persistence is explicitly enabled.
- By default, queue submission returns `state=design-only`, `persisted=false`, `queuePersistenceAllowed=false`, `vectorWriteAllowed=false`, and `clusterMutationAllowed=false`.
- By default, queue inventory returns `mode=designOnly`, `itemCount=0`, `readOnly=true`, `chunksReturned=false`, `vectorWriteAllowed=false`, and `approvalMutationAllowed=false`.
- If `CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE=enabled`, accepted drafts can persist a local JSON queue item containing validation metadata, redacted chunks, validation hash, and required approvers only; inventory lists only metadata summaries.
- Review decisions can approve required roles or reject a pending item, but they update local queue metadata only: `queueMetadataWriteAllowed=true`, `vectorWriteAllowed=false`, `clusterMutationAllowed=false`, and `ingestionAllowed=false`.
- Ingestion planning reads approved queue metadata and produces `ingestionPlanOnly` evidence with `ready-for-ingestion-job` or `blocked`, but keeps `ingestionJobCreated=false`, `vectorWriteAllowed=false`, and `ingestionAllowed=false`.
- `npm run verify:rag:production-readiness` validates `deploy/rag-production/approval-ingestion-contract.yaml` as a non-mutating production handoff contract for database-backed queue persistence, an approval-gated ingestion worker, and an append-only vector write audit sink.
- The install approval plan consumes the RAG approval queue evidence and exposes RAG ingestion as `ingestionPlanOnly` readiness with required approvers, risk, rollback path, `vectorWriteAttempted=false`, and `ingestionJobCreated=false`.
- `OpsLensInstallation.spec.rag` exposes the same policy to Operator installs: `documentIntake.mode=ValidateOnly`, `rawDocumentReturnAllowed=false`, `approvalQueue.mode=DesignOnly`, and `enqueueAllowed=false`.
- The Operator renders `cywell-opslens-rag-policy` and API environment variables from that policy, while still forcing raw return and queue enqueue off in MVP 0.1.

## Future Queue States

| State | Meaning | Allowed transition |
|---|---|---|
| `draft-validated` | Validation passed and evidence export exists. | Human reviewer may request approval. |
| `rejected-before-approval` | Validation failed before any queue entry is allowed. | Author must fix draft and revalidate. |
| `pending-human-approval` | Opt-in durable metadata queue item awaiting review. | Two approvals or rejection. |
| `approved-for-ingestion` | Queue item has required human approvals recorded as metadata. | `ingestionPlanOnly` artifact may be generated, but no vector write occurs in this workflow. |
| `rejected-by-reviewer` | Reviewer rejected the metadata queue item with redacted reason evidence. | Author must fix draft and resubmit. |
| `indexed` | Future ingestion job wrote chunks and citation metadata. | Revalidation required for changes. |

## Required Approval Evidence

- Validation artifact ID and `validationHash`.
- Tenant ID, file name, metadata-only document preview, and redacted chunk previews.
- Full issue list including warnings.
- Reviewer identities for `rag-owner` and `cluster-sre`.
- Source commit, ticket, or change request that contains the raw Markdown outside OpsLens API response payloads.
- Production database-backed queue review, ingestion worker review, append-only vector write audit sink review, and rollback export path with previous vector chunk IDs before live vector writes.

## Non-Goals

- No raw Markdown persistence in the OpsLens API response.
- No vector DB writes from the dashboard.
- No automatic approval based only on validation success.
- No assistant-triggered ingestion, apply, delete, or scale.
- No live production database queue in the local MVP bridge; the current persistence path is local JSON evidence for controlled validation, and the production path is a separate approval-required contract.
- No ingestion job creation from approval review.
- No ingestion job creation from ingestion planning.

## Verification Mapping

| Requirement | Verification |
|---|---|
| Evidence export does not leak raw draft content | `npm run verify:rag` and Playwright API assertions check `markdownReturned=false`, `documentBodyReturned=false`, `rawDocumentReturned=false`, and sensitive text redaction. |
| Queue remains design-only by default | `npm run verify:rag` checks `mode=designOnly`, `enqueueAllowed=false`, and `approvalQueueMutationAllowed=false`; Playwright checks default queue submit returns `state=design-only` and `persisted=false`. |
| Queue inventory is read-only | `npm run verify:rag:approval-queue` and Playwright check `opslens.rag.approval-queue-inventory.v0.2`, `actionMode=approvalQueueReadOnly`, `readOnly=true`, `chunksReturned=false`, `vectorWriteAllowed=false`, and `approvalMutationAllowed=false`. |
| Opt-in queue persistence is metadata-only | `npm run verify:rag:approval-queue` enables the local queue in a temporary directory and checks `state=pending-human-approval`, `persisted=true`, read-only inventory item summary, redacted chunks, no raw Markdown, no secret-like values, `vectorWriteAllowed=false`, and `clusterMutationAllowed=false`. |
| Human review is metadata-only | `npm run verify:rag:approval-queue` records `rag-owner` and `cluster-sre` approvals, reaches `approved-for-ingestion`, records a `rejected-by-reviewer` path, and checks `ingestionJobCreated=false`, `ingestionAllowed=false`, `vectorWriteAllowed=false`, and secret-like review reasons redacted. |
| Ingestion planning is plan-only | `npm run verify:rag:approval-queue` generates blocked and approved `opslens.rag.ingestion-plan.v0.1` artifacts, checks `ingestionPlanOnly`, `ready-for-ingestion-job`, `blocked`, `ingestionJobCreated=false`, `ingestionAllowed=false`, `vectorWriteAllowed=false`, preflight commands marked non-mutating, and future mutating steps marked `requiresExplicitApproval=true`. |
| Production readiness is approval-required | `npm run verify:rag:production-readiness` validates the database-backed queue, ingestion worker, vector write audit sink, source-ref, and rollback export contract while keeping `productionQueueEnabledByVerifier=false`, `ingestionWorkerEnabledByVerifier=false`, `vectorWriteAllowed=false`, `ingestionAllowed=false`, `clusterMutationAttempted=false`, and `ingestionJobCreated=false`. |
| Install approval board carries RAG ingestion evidence | `npm run verify:install-plan` reads `test-results/cywell-opslens-rag-approval-queue.json`, requires the approved `ingestionPlanOnly` evidence for approval-ready status, and writes `ragIngestion` with `vectorWriteAttempted=false`, `clusterMutationAttempted=false`, `ingestionJobCreated=false`, and explicit RAG approvers. |
| Operator install keeps the same policy | `npm run verify:operator` and `npm run verify:operator:reconcile` check `OpsLensInstallation.spec.rag`, `cywell-opslens-rag-policy`, API env, and reconcile status. |
| Dashboard exposes artifact evidence | Playwright checks `opslens-rag-evidence-export` after `Export Evidence`, `opslens-rag-approval-queue` after `Queue Evidence`, `opslens-rag-approval-queue-inventory` for the read-only queue inventory, `opslens-rag-approval-review` when a persisted item is reviewed, and `opslens-rag-ingestion-plan` when an approved item is planned. |
| Real ingestion remains out of scope | Acceptance matrix marks production DB-backed queue, production ingestion worker, and vector DB writes as approval-required live lanes; the current production readiness artifact is a non-mutating handoff only. |
