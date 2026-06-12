import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  RagChunk,
  RagDocumentMetadata,
  RagIndex,
  RagSearchResponse,
  RagSearchResult,
  RagValidationEvidenceExport,
  RagValidationEvidenceExportRequest,
  RagValidationIssue,
  RagValidationRequest,
  RagValidationResponse,
  RagSourceType,
  RagTrustLevel
} from "./types.js";

const sensitivePattern =
  /\b(?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*\S+|bearer\s+[a-z0-9._~+/=-]+|\b(?:token|password|passwd|secret|api[_-]?key)\b/gi;
const vectorDimensions = 64;

export function redactSensitiveText(text: string) {
  return text.replace(sensitivePattern, "<REDACTED>");
}

export function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9가-힣_-]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 2)
    )
  );
}

export function parseRunbookMarkdown(markdown: string) {
  const frontMatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const metaText = frontMatterMatch?.[1] ?? "";
  const content = frontMatterMatch?.[2] ?? markdown;
  const metadata = Object.fromEntries(
    metaText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(":");
        if (index === -1) {
          return [line, ""];
        }
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  ) as Record<string, string>;

  return {
    metadata,
    content
  };
}

function hashToken(token: string) {
  const hash = createHash("sha256").update(token).digest();
  return hash.readUInt32BE(0) % vectorDimensions;
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function evidenceHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function makeVector(tokens: string[]) {
  const vector: Record<string, number> = {};
  for (const token of tokens) {
    const dimension = String(hashToken(token));
    vector[dimension] = (vector[dimension] ?? 0) + 1;
  }
  return vector;
}

function cosine(left: Record<string, number>, right: Record<string, number>) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const value of Object.values(left)) {
    leftMagnitude += value * value;
  }
  for (const [dimension, value] of Object.entries(right)) {
    rightMagnitude += value * value;
    dot += (left[dimension] ?? 0) * value;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function sourceType(value?: string): RagSourceType {
  if (value === "official-doc" || value === "cluster-snapshot") {
    return value;
  }
  return "customer-runbook";
}

function isSourceType(value?: string): value is RagSourceType {
  return value === "customer-runbook" || value === "official-doc" || value === "cluster-snapshot";
}

function trustLevel(value?: string): RagTrustLevel {
  if (value === "official" || value === "cluster-snapshot" || value === "draft") {
    return value;
  }
  return "approved";
}

function isTrustLevel(value?: string): value is RagTrustLevel {
  return value === "approved" || value === "official" || value === "cluster-snapshot" || value === "draft";
}

function documentId(fileName: string, metadata: Record<string, string>) {
  return metadata.id ?? `customer-runbook:${fileName.replace(/\.md$/, "")}`;
}

function chunkParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith("#"));
}

function redactionCount(text: string) {
  return (text.match(sensitivePattern) ?? []).length;
}

function snippet(text: string) {
  const redacted = redactSensitiveText(text);
  return redacted.length > 220 ? `${redacted.slice(0, 217)}...` : redacted;
}

function buildTenantDocuments(root: string, tenantId: string) {
  const tenantDir = join(root, tenantId);
  if (!existsSync(tenantDir)) {
    return {
      documents: [] as RagDocumentMetadata[],
      chunks: [] as RagChunk[]
    };
  }

  const documents: RagDocumentMetadata[] = [];
  const chunks: RagChunk[] = [];
  for (const fileName of readdirSync(tenantDir).filter((file) => file.endsWith(".md")).sort()) {
    const filePath = join(tenantDir, fileName);
    const markdown = readFileSync(filePath, "utf8");
    const { metadata, content } = parseRunbookMarkdown(markdown);
    const id = documentId(fileName, metadata);
    const label = metadata.label ?? fileName.replace(/\.md$/, "");
    const paragraphs = chunkParagraphs(content);
    const relativePath = relative(root, filePath).replace(/\\/g, "/");
    const doc: RagDocumentMetadata = {
      id,
      tenantId,
      label,
      sourceType: sourceType(metadata.sourceType),
      trustLevel: trustLevel(metadata.trustLevel),
      relativePath,
      lastIndexedAt: statSync(filePath).mtime.toISOString(),
      chunkCount: Math.max(1, paragraphs.length),
      redacted: true
    };
    documents.push(doc);

    const chunkSource = paragraphs.length ? paragraphs : [content];
    for (const [index, paragraph] of chunkSource.entries()) {
      const tokens = tokenize(`${tenantId} ${label} ${paragraph}`);
      chunks.push({
        id: `${id}#chunk-${index + 1}`,
        documentId: id,
        tenantId,
        label,
        sourceType: doc.sourceType,
        trustLevel: doc.trustLevel,
        relativePath,
        ordinal: index + 1,
        tokens,
        vector: makeVector(tokens),
        snippet: snippet(paragraph),
        redacted: true
      });
    }
  }

  return {
    documents,
    chunks
  };
}

export function buildLocalRagIndex(root: string): RagIndex {
  const tenants = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  const documents: RagDocumentMetadata[] = [];
  const chunks: RagChunk[] = [];

  for (const tenantId of tenants) {
    const tenantIndex = buildTenantDocuments(root, tenantId);
    documents.push(...tenantIndex.documents);
    chunks.push(...tenantIndex.chunks);
  }

  return {
    version: "local-vector-v0.1",
    generatedAt: new Date().toISOString(),
    root,
    tenants,
    documents,
    chunks,
    policy: {
      tenantScoped: true,
      rawDocumentReturned: false,
      serverSideRedaction: true,
      embeddingProvider: "local-hash-vector"
    }
  };
}

export function searchLocalRagIndex(
  index: RagIndex,
  tenantId: string,
  query: string,
  maxResults: number
): RagSearchResponse {
  const missingEvidence: string[] = [];
  const queryTokens = tokenize(`${tenantId} ${query}`);
  const queryVector = makeVector(queryTokens);
  const tenantChunks = index.chunks.filter((chunk) => chunk.tenantId === tenantId);

  if (!index.tenants.includes(tenantId)) {
    missingEvidence.push(`tenant ${tenantId} is not present in local vector index`);
  }

  const results = tenantChunks
    .map((chunk): RagSearchResult => {
      const overlap = queryTokens.filter((token) => chunk.tokens.includes(token)).length;
      const semanticScore = cosine(queryVector, chunk.vector);
      const score = Number((semanticScore + overlap * 0.08).toFixed(4));
      return {
        id: chunk.documentId,
        documentId: chunk.documentId,
        tenantId: chunk.tenantId,
        label: chunk.label,
        sourceType: chunk.sourceType,
        trustLevel: chunk.trustLevel,
        relativePath: chunk.relativePath,
        chunkId: chunk.id,
        score,
        snippet: chunk.snippet,
        redacted: true,
        evidence: [
          `local vector index ${index.version}`,
          `chunk ${chunk.id}`,
          `score ${score}`
        ]
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .filter((result, indexInResults, allResults) => {
      return allResults.findIndex((candidate) => candidate.documentId === result.documentId) === indexInResults;
    })
    .slice(0, maxResults);

  if (tenantChunks.length === 0) {
    missingEvidence.push(`no chunks available for tenant ${tenantId}`);
  }

  if (results.length === 0) {
    missingEvidence.push("no local vector result matched the query");
  }

  return {
    tenantId,
    query: redactSensitiveText(query),
    results,
    missingEvidence,
    policy: index.policy,
    evidence: [
      `searched ${tenantChunks.length} tenant-scoped chunks`,
      `index documents ${index.documents.length}`,
      "raw document body was not returned"
    ]
  };
}

function validationIssue(
  severity: RagValidationIssue["severity"],
  code: string,
  message: string,
  evidence: string[] = []
): RagValidationIssue {
  return {
    severity,
    code,
    message,
    evidence
  };
}

function safeTenantId(tenantId: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId);
}

function safeFileName(fileName: string) {
  return /^[a-z0-9][a-z0-9._-]*\.md$/.test(fileName) && !fileName.includes("..");
}

export function validateRagDocumentIntake(
  index: RagIndex,
  request: RagValidationRequest
): RagValidationResponse {
  const issues: RagValidationIssue[] = [];
  const missingEvidence: string[] = [];
  const markdown = request.markdown ?? "";
  const frontMatterPresent = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(markdown);
  const { metadata, content } = parseRunbookMarkdown(markdown);
  const paragraphs = chunkParagraphs(content);
  const id = documentId(request.fileName, metadata);
  const relativePath = `${request.tenantId}/${request.fileName}`;
  const count = redactionCount(markdown);

  if (safeTenantId(request.tenantId)) {
    issues.push(validationIssue("pass", "tenant-id", "tenant id is safe", [request.tenantId]));
  } else {
    issues.push(validationIssue("fail", "tenant-id", "tenant id is invalid", [request.tenantId]));
    missingEvidence.push("tenantId must be lowercase DNS-style text");
  }

  if (safeFileName(request.fileName)) {
    issues.push(validationIssue("pass", "file-name", "file name is safe", [request.fileName]));
  } else {
    issues.push(validationIssue("fail", "file-name", "file name must be a safe markdown filename", [request.fileName]));
    missingEvidence.push("fileName must end with .md and cannot contain path traversal");
  }

  if (frontMatterPresent) {
    issues.push(validationIssue("pass", "front-matter", "front matter is present"));
  } else {
    issues.push(validationIssue("fail", "front-matter", "front matter block is required"));
    missingEvidence.push("front matter block with id, label, sourceType, and trustLevel");
  }

  for (const field of ["id", "label", "sourceType", "trustLevel"] as const) {
    if (metadata[field]) {
      issues.push(validationIssue("pass", `metadata-${field}`, `${field} is present`, [String(metadata[field])]));
    } else {
      issues.push(validationIssue("fail", `metadata-${field}`, `${field} is required`));
      missingEvidence.push(`metadata.${field}`);
    }
  }

  if (metadata.sourceType && !isSourceType(metadata.sourceType)) {
    issues.push(
      validationIssue("fail", "source-type", "sourceType must be customer-runbook, official-doc, or cluster-snapshot", [
        metadata.sourceType
      ])
    );
  }

  if (metadata.trustLevel && !isTrustLevel(metadata.trustLevel)) {
    issues.push(
      validationIssue("fail", "trust-level", "trustLevel must be approved, official, cluster-snapshot, or draft", [
        metadata.trustLevel
      ])
    );
  }

  if (content.trim().length >= 80) {
    issues.push(validationIssue("pass", "content-length", "content has enough operational context"));
  } else {
    issues.push(validationIssue("fail", "content-length", "content is too short for RAG ingestion"));
    missingEvidence.push("document body with operational context");
  }

  if (paragraphs.length > 0) {
    issues.push(validationIssue("pass", "chunking", `${paragraphs.length} chunks can be indexed`));
  } else {
    issues.push(validationIssue("fail", "chunking", "no indexable chunks were found"));
    missingEvidence.push("at least one non-heading paragraph");
  }

  if (index.documents.some((document) => document.id === id && document.tenantId === request.tenantId)) {
    issues.push(
      validationIssue("fail", "duplicate-document-id", "document id already exists for this tenant", [id])
    );
    missingEvidence.push("unique document id for tenant");
  } else {
    issues.push(validationIssue("pass", "duplicate-document-id", "document id is unique for this tenant", [id]));
  }

  if (count > 0) {
    issues.push(
      validationIssue("warn", "sensitive-text", "sensitive-looking text would be redacted before indexing", [
        `${count} match(es)`
      ])
    );
  } else {
    issues.push(validationIssue("pass", "sensitive-text", "no sensitive-looking text matched redaction policy"));
  }

  const label = metadata.label ?? request.fileName.replace(/\.md$/, "");
  const doc = {
    id,
    tenantId: request.tenantId,
    label,
    sourceType: sourceType(metadata.sourceType),
    trustLevel: trustLevel(metadata.trustLevel),
    relativePath,
    chunkCount: Math.max(1, paragraphs.length),
    redacted: true as const
  };
  const chunks = paragraphs.map((paragraph, index) => {
    const tokens = tokenize(`${request.tenantId} ${label} ${paragraph}`);
    return {
      id: `${id}#chunk-${index + 1}`,
      ordinal: index + 1,
      snippet: snippet(paragraph),
      tokenCount: tokens.length,
      redacted: true as const
    };
  });
  const accepted = !issues.some((issue) => issue.severity === "fail");

  return {
    actionMode: "validateOnly",
    accepted,
    redactionCount: count,
    document: accepted ? doc : undefined,
    chunks,
    issues,
    missingEvidence,
    evidence: [
      `validated ${relativePath}`,
      `local vector index ${index.version}`,
      "raw document body was not returned",
      "upload apply is disabled in MVP"
    ],
    policy: {
      validateOnly: true,
      tenantScoped: true,
      rawDocumentReturned: false,
      serverSideRedaction: true,
      uploadApplyAllowed: false
    }
  };
}

export function createRagValidationEvidenceExport(
  index: RagIndex,
  request: RagValidationEvidenceExportRequest
): RagValidationEvidenceExport {
  const validation = validateRagDocumentIntake(index, request);
  const validationHash = evidenceHash({
    tenantId: request.tenantId,
    fileName: request.fileName,
    validation
  });
  const failedIssues = validation.issues.filter((issue) => issue.severity === "fail");
  const blockers = validation.accepted
    ? ["durable ingestion queue is disabled in MVP 0.1"]
    : failedIssues.map((issue) => `${issue.code}: ${issue.message}`);

  return {
    artifactType: "opslens.rag.validation-evidence.v0.1",
    artifactVersion: "0.1",
    exportId: `rag-validation-${validationHash.slice(0, 16)}`,
    generatedAt: new Date().toISOString(),
    tenantId: request.tenantId,
    fileName: request.fileName,
    actionMode: "validateOnly",
    validation,
    content: {
      markdownReturned: false,
      documentBodyReturned: false,
      chunksRedacted: true,
      redactionCount: validation.redactionCount
    },
    approvalQueue: {
      mode: "designOnly",
      enqueueAllowed: false,
      nextStateIfEnabled: validation.accepted
        ? "pending-human-approval"
        : "rejected-before-approval",
      requiredApprovals: ["rag-owner", "cluster-sre"],
      blockers,
      evidence: [
        "approval queue is a design contract only in MVP 0.1",
        "evidence export does not enqueue, index, or persist the draft",
        "future ingestion must preserve validationHash and approval evidence"
      ]
    },
    audit: {
      requestedBy: request.requestedBy,
      reason: request.reason ? redactSensitiveText(request.reason) : undefined,
      validationHash,
      sourceIndexVersion: index.version,
      sourceDocumentCount: index.documents.length,
      sourceChunkCount: index.chunks.length
    },
    policy: {
      ...validation.policy,
      evidenceExportAllowed: true,
      approvalQueueMutationAllowed: false
    }
  };
}
