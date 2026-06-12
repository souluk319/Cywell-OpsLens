#!/usr/bin/env node
import { resolve } from "node:path";
import {
  buildLocalRagIndex,
  createRagValidationEvidenceExport,
  searchLocalRagIndex,
  validateRagDocumentIntake
} from "../packages/rag/dist/index.js";

const runbookRoot = resolve("data/runbooks");
const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    PASS: 1
  };

  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  console.log("");
  console.log(`Cywell OpsLens local RAG index verification: ${failures.length} fail, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const index = buildLocalRagIndex(runbookRoot);
  expectCheck(
    "index version",
    index.version === "local-vector-v0.1",
    index.version,
    "unexpected local RAG index version"
  );
  expectCheck(
    "tenant isolation policy",
    index.policy.tenantScoped === true &&
      index.policy.rawDocumentReturned === false &&
      index.policy.serverSideRedaction === true &&
      index.policy.embeddingProvider === "local-hash-vector",
    "tenantScoped=true rawDocumentReturned=false serverSideRedaction=true local-hash-vector"
  );
  expectCheck(
    "tenant corpus",
    index.tenants.includes("cywell-payments") &&
      index.documents.length >= 3 &&
      index.chunks.length >= 3,
    `${index.tenants.join(", ")} documents=${index.documents.length} chunks=${index.chunks.length}`
  );
  expectCheck(
    "metadata only documents",
    index.documents.every((document) => document.redacted === true && document.relativePath.endsWith(".md")) &&
      !JSON.stringify(index.documents).includes("CrashLoopBackOff 또는 readiness"),
    "document inventory excludes raw markdown body"
  );

  const draftValidation = validateRagDocumentIntake(index, {
    tenantId: "cywell-payments",
    fileName: "payments-timeout-triage.md",
    markdown: `---
id: customer-runbook:payments-timeout-triage
label: Payments timeout triage draft
sourceType: customer-runbook
trustLevel: draft
---

# Payments timeout triage draft

Payments timeout alerts require a read-only review of route latency, recent pod restarts, database connection pool saturation, and service endpoint changes before any GitOps rollback proposal is written. token=secret-demo must be redacted from every returned snippet.

Operators should cite the alert, events, logs, and customer runbook evidence separately, then record missing evidence when Prometheus metrics are unavailable.`
  });
  const draftPayload = JSON.stringify(draftValidation);
  expectCheck(
    "document validation is validate-only",
    draftValidation.actionMode === "validateOnly" &&
      draftValidation.policy.validateOnly === true &&
      draftValidation.policy.uploadApplyAllowed === false,
    "actionMode=validateOnly uploadApplyAllowed=false",
    "RAG document validation allowed mutation or returned a non-validate action mode"
  );
  expectCheck(
    "document validation accepts safe draft",
    draftValidation.accepted === true &&
      draftValidation.document?.id === "customer-runbook:payments-timeout-triage" &&
      draftValidation.chunks.length > 0,
    `accepted=${draftValidation.accepted} chunks=${draftValidation.chunks.length}`,
    "safe draft document was not accepted for validation"
  );
  expectCheck(
    "document validation redacts snippets",
    draftValidation.redactionCount > 0 &&
      draftValidation.chunks.every((chunk) => chunk.redacted === true) &&
      !draftPayload.includes("token=secret-demo") &&
      draftPayload.includes("<REDACTED>"),
    `redactions=${draftValidation.redactionCount}`,
    "validated draft leaked sensitive text"
  );
  expectCheck(
    "document validation returns metadata only",
    draftValidation.policy.rawDocumentReturned === false &&
      draftValidation.document?.redacted === true &&
      draftValidation.evidence.join(" ").includes("raw document body was not returned"),
    "rawDocumentReturned=false document.redacted=true"
  );
  expectCheck(
    "document validation warns on sensitive text",
    draftValidation.issues.some(
      (issue) => issue.code === "sensitive-text" && issue.severity === "warn"
    ),
    draftValidation.issues.map((issue) => `${issue.code}:${issue.severity}`).join(", "),
    "sensitive-looking text did not produce a warning"
  );

  const evidenceExport = createRagValidationEvidenceExport(index, {
    tenantId: "cywell-payments",
    fileName: "payments-timeout-triage.md",
    markdown: `---
id: customer-runbook:payments-timeout-triage
label: Payments timeout triage draft
sourceType: customer-runbook
trustLevel: draft
---

# Payments timeout triage draft

Payments timeout alerts require a read-only review of route latency, recent pod restarts, database connection pool saturation, and service endpoint changes before any GitOps rollback proposal is written. token=secret-demo must be redacted from every returned snippet.

Operators should cite the alert, events, logs, and customer runbook evidence separately, then record missing evidence when Prometheus metrics are unavailable.`,
    requestedBy: "verify-rag",
    reason: "export token=secret-demo before approval"
  });
  const evidencePayload = JSON.stringify(evidenceExport);
  expectCheck(
    "validation evidence export shape",
    evidenceExport.artifactType === "opslens.rag.validation-evidence.v0.1" &&
      evidenceExport.exportId.startsWith("rag-validation-") &&
      evidenceExport.actionMode === "validateOnly" &&
      evidenceExport.validation.accepted === true,
    `${evidenceExport.exportId} ${evidenceExport.artifactType}`,
    "RAG validation evidence export has an unexpected artifact shape"
  );
  expectCheck(
    "validation evidence export excludes raw content",
    evidenceExport.content.markdownReturned === false &&
      evidenceExport.content.documentBodyReturned === false &&
      evidenceExport.content.chunksRedacted === true &&
      evidenceExport.policy.rawDocumentReturned === false &&
      !evidencePayload.includes("token=secret-demo"),
    "markdownReturned=false documentBodyReturned=false chunksRedacted=true",
    "RAG validation evidence export leaked raw markdown or sensitive text"
  );
  expectCheck(
    "validation evidence export keeps approval queue design-only",
    evidenceExport.approvalQueue.mode === "designOnly" &&
      evidenceExport.approvalQueue.enqueueAllowed === false &&
      evidenceExport.policy.approvalQueueMutationAllowed === false &&
      evidenceExport.audit.validationHash.length === 64,
    `mode=${evidenceExport.approvalQueue.mode} enqueueAllowed=${evidenceExport.approvalQueue.enqueueAllowed}`,
    "RAG validation evidence export attempted queue mutation or missed hash evidence"
  );

  const duplicateValidation = validateRagDocumentIntake(index, {
    tenantId: "cywell-payments",
    fileName: "payments-api-crashloop.md",
    markdown: `---
id: customer-runbook:payments-api-crashloop
label: Duplicate payments crashloop runbook
sourceType: customer-runbook
trustLevel: approved
---

This duplicate draft has enough operational context to pass content checks, but it must be rejected because the document id already exists for the cywell-payments tenant.`
  });
  expectCheck(
    "duplicate document validation fails closed",
    duplicateValidation.accepted === false &&
      duplicateValidation.document === undefined &&
      duplicateValidation.issues.some(
        (issue) => issue.code === "duplicate-document-id" && issue.severity === "fail"
      ),
    duplicateValidation.issues.map((issue) => `${issue.code}:${issue.severity}`).join(", "),
    "duplicate document id was accepted"
  );

  const search = searchLocalRagIndex(
    index,
    "cywell-payments",
    "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘 token=secret-demo",
    3
  );
  expectCheck(
    "payments query returns runbook",
    search.results.some(
      (result) =>
        result.documentId === "customer-runbook:payments-api-crashloop" &&
        result.label.includes("Payments API")
    ),
    search.results.map((result) => `${result.documentId}:${result.score}`).join(", "),
    "payments-api crashloop runbook was not retrieved"
  );
  expectCheck(
    "search policy stays private",
    search.policy.tenantScoped === true &&
      search.policy.rawDocumentReturned === false &&
      search.policy.serverSideRedaction === true,
    "private tenant-scoped search policy returned"
  );
  expectCheck(
    "search snippets are redacted",
    search.results.every((result) => result.redacted === true) &&
      !JSON.stringify(search).includes("secret-demo") &&
      !JSON.stringify(search).includes("token=secret-demo"),
    "query secret does not appear in result payload"
  );
  expectCheck(
    "search evidence names vector index",
    search.evidence.join(" ").includes("tenant-scoped chunks") &&
      search.results.every((result) => result.evidence.join(" ").includes("local vector index")),
    "result evidence includes local vector index and chunk ids"
  );

  const secretSearch = searchLocalRagIndex(
    index,
    "cywell-payments",
    "Secret 원문 조회하지 말고 key 존재 여부만 확인",
    3
  );
  expectCheck(
    "secret checklist retrieval",
    secretSearch.results.some(
      (result) => result.documentId === "customer-runbook:payments-secret-checklist"
    ),
    secretSearch.results.map((result) => result.documentId).join(", "),
    "secret checklist runbook was not retrieved"
  );

  const crossTenant = searchLocalRagIndex(index, "another-tenant", "payments api", 3);
  expectCheck(
    "cross tenant isolation",
    crossTenant.results.length === 0 &&
      crossTenant.missingEvidence.join(" ").includes("another-tenant"),
    crossTenant.missingEvidence.join("; "),
    "unknown tenant returned results or missed explicit missing evidence"
  );
} catch (error) {
  fail("local RAG verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
