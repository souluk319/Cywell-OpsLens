# Cywell OpsLens RAG Approval Queue Design

Status: MVP 0.1 design contract. The product exports validation evidence, but does not enqueue, persist, or index uploaded drafts yet.

## Goal

Create a safe path from operator-authored runbook drafts to future private RAG ingestion without weakening the MVP read-only boundary.

## Current MVP 0.1 Contract

- `POST /api/opslens/admin/rag/validate` validates Markdown front matter, tenant/file safety, duplicate document IDs, chunkability, and sensitive-looking text.
- `POST /api/opslens/admin/rag/evidence-export` returns `opslens.rag.validation-evidence.v0.1`.
- The evidence artifact includes validation result, redacted chunk preview, issue list, missing evidence, validation hash, and approval queue intent.
- The artifact never returns raw Markdown or raw document body.
- `approvalQueue.mode=designOnly`, `enqueueAllowed=false`, and `approvalQueueMutationAllowed=false`.
- `OpsLensInstallation.spec.rag` exposes the same policy to Operator installs: `documentIntake.mode=ValidateOnly`, `rawDocumentReturnAllowed=false`, `approvalQueue.mode=DesignOnly`, and `enqueueAllowed=false`.
- The Operator renders `cywell-opslens-rag-policy` and API environment variables from that policy, while still forcing raw return and queue enqueue off in MVP 0.1.

## Future Queue States

| State | Meaning | Allowed transition |
|---|---|---|
| `draft-validated` | Validation passed and evidence export exists. | Human reviewer may request approval. |
| `rejected-before-approval` | Validation failed before any queue entry is allowed. | Author must fix draft and revalidate. |
| `pending-human-approval` | Future durable queue item awaiting review. | Two approvals or rejection. |
| `approved-for-ingestion` | Future queue item approved for indexing. | Ingestion job may write to vector store. |
| `indexed` | Future ingestion job wrote chunks and citation metadata. | Revalidation required for changes. |

## Required Approval Evidence

- Validation artifact ID and `validationHash`.
- Tenant ID, file name, metadata-only document preview, and redacted chunk previews.
- Full issue list including warnings.
- Reviewer identities for `rag-owner` and `cluster-sre`.
- Source commit, ticket, or change request that contains the raw Markdown outside OpsLens API response payloads.

## Non-Goals

- No raw Markdown persistence in the OpsLens API response.
- No vector DB writes from the dashboard.
- No automatic approval based only on validation success.
- No assistant-triggered ingestion, apply, delete, or scale.

## Verification Mapping

| Requirement | Verification |
|---|---|
| Evidence export does not leak raw draft content | `npm run verify:rag` and Playwright API assertions check `markdownReturned=false`, `documentBodyReturned=false`, `rawDocumentReturned=false`, and sensitive text redaction. |
| Queue remains design-only | `npm run verify:rag` checks `mode=designOnly`, `enqueueAllowed=false`, and `approvalQueueMutationAllowed=false`. |
| Operator install keeps the same policy | `npm run verify:operator` and `npm run verify:operator:reconcile` check `OpsLensInstallation.spec.rag`, `cywell-opslens-rag-policy`, API env, and reconcile status. |
| Dashboard exposes artifact evidence | Playwright checks `opslens-rag-evidence-export` after `Export Evidence`. |
| Real ingestion remains out of scope | Acceptance matrix marks durable ingestion, approval persistence, and vector DB writes as later lanes. |
