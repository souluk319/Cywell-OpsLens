export type RagSourceType = "customer-runbook" | "official-doc" | "cluster-snapshot";
export type RagTrustLevel = "approved" | "official" | "cluster-snapshot" | "draft";

export interface RagDocumentMetadata {
  id: string;
  tenantId: string;
  label: string;
  sourceType: RagSourceType;
  trustLevel: RagTrustLevel;
  relativePath: string;
  lastIndexedAt: string;
  chunkCount: number;
  redacted: true;
}

export interface RagChunk {
  id: string;
  documentId: string;
  tenantId: string;
  label: string;
  sourceType: RagSourceType;
  trustLevel: RagTrustLevel;
  relativePath: string;
  ordinal: number;
  tokens: string[];
  vector: Record<string, number>;
  snippet: string;
  redacted: true;
}

export interface RagIndex {
  version: "local-vector-v0.1";
  generatedAt: string;
  root: string;
  tenants: string[];
  documents: RagDocumentMetadata[];
  chunks: RagChunk[];
  policy: {
    tenantScoped: true;
    rawDocumentReturned: false;
    serverSideRedaction: true;
    embeddingProvider: "local-hash-vector";
  };
}

export interface RagSearchResult {
  id: string;
  documentId: string;
  tenantId: string;
  label: string;
  sourceType: RagSourceType;
  trustLevel: RagTrustLevel;
  relativePath: string;
  chunkId: string;
  score: number;
  snippet: string;
  redacted: true;
  evidence: string[];
}

export interface RagSearchResponse {
  tenantId: string;
  query: string;
  results: RagSearchResult[];
  missingEvidence: string[];
  policy: RagIndex["policy"];
  evidence: string[];
}

export interface RagValidationRequest {
  tenantId: string;
  fileName: string;
  markdown: string;
}

export interface RagValidationEvidenceExportRequest extends RagValidationRequest {
  requestedBy?: string;
  reason?: string;
}

export interface RagValidationIssue {
  severity: "pass" | "warn" | "fail";
  code: string;
  message: string;
  evidence: string[];
}

export interface RagValidationResponse {
  actionMode: "validateOnly";
  accepted: boolean;
  redactionCount: number;
  document?: Omit<RagDocumentMetadata, "lastIndexedAt">;
  chunks: Array<{
    id: string;
    ordinal: number;
    snippet: string;
    tokenCount: number;
    redacted: true;
  }>;
  issues: RagValidationIssue[];
  missingEvidence: string[];
  evidence: string[];
  policy: {
    validateOnly: true;
    tenantScoped: true;
    rawDocumentReturned: false;
    serverSideRedaction: true;
    uploadApplyAllowed: false;
  };
}

export interface RagValidationEvidenceExport {
  artifactType: "opslens.rag.validation-evidence.v0.1";
  artifactVersion: "0.1";
  exportId: string;
  generatedAt: string;
  tenantId: string;
  fileName: string;
  actionMode: "validateOnly";
  validation: RagValidationResponse;
  content: {
    markdownReturned: false;
    documentBodyReturned: false;
    chunksRedacted: true;
    redactionCount: number;
  };
  approvalQueue: {
    mode: "designOnly";
    enqueueAllowed: false;
    nextStateIfEnabled: "pending-human-approval" | "rejected-before-approval";
    requiredApprovals: string[];
    blockers: string[];
    evidence: string[];
  };
  audit: {
    requestedBy?: string;
    reason?: string;
    validationHash: string;
    sourceIndexVersion: RagIndex["version"];
    sourceDocumentCount: number;
    sourceChunkCount: number;
  };
  policy: RagValidationResponse["policy"] & {
    evidenceExportAllowed: true;
    approvalQueueMutationAllowed: false;
  };
}
