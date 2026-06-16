import type {
  OpsLensCitation,
  OpsLensRuntimeRagAudit,
  OpsLensRuntimeRagMode,
  OpsLensRuntimeRagStatus
} from "@kugnus/contracts";
import { redactSensitiveText } from "@kugnus/rag";

type RuntimeRagResult = {
  citations: OpsLensCitation[];
  audit: OpsLensRuntimeRagAudit;
};

type RuntimeRagParams = {
  tenantId: string;
  question: string;
  maxDocuments: number;
};

type FetchJsonParams = {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
};

const runtimeRagModes: OpsLensRuntimeRagMode[] = ["local", "hybrid", "runtime"];

function runtimeRagMode(): OpsLensRuntimeRagMode {
  const configured = process.env.CYWELL_OPSLENS_RAG_RUNTIME_MODE;
  if (!configured) return "local";
  const normalized = configured.toLowerCase();
  return runtimeRagModes.includes(normalized as OpsLensRuntimeRagMode)
    ? (normalized as OpsLensRuntimeRagMode)
    : "local";
}

function runtimeVectorUrl() {
  return (
    process.env.CYWELL_OPSLENS_POSTGRES_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    "postgresql://cywell-opslens-vector:5432/opslens"
  );
}

function runtimeModelUrl() {
  return process.env.CYWELL_OPSLENS_MODEL_URL ?? "http://cywell-opslens-vllm:8000";
}

function runtimeEmbeddingModel() {
  return process.env.CYWELL_OPSLENS_EMBEDDING_MODEL ?? "opslens-embedding";
}

function runtimeProbeTimeoutMs() {
  const timeout = Number(process.env.CYWELL_OPSLENS_RUNTIME_PROBE_TIMEOUT_MS ?? 3000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 3000;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function joinEndpoint(baseUrl: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimTrailingSlash(baseUrl)}${normalizedPath}`;
}

function runtimeCollectionName(tenantId: string) {
  const prefix = process.env.CYWELL_OPSLENS_PGVECTOR_TABLE_PREFIX ?? "opslens_";
  const safeTenant = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${prefix}${(safeTenant || "default").replace(/-/g, "_")}_rag_chunks`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSourceType(
  value: unknown
): OpsLensCitation["sourceType"] {
  if (
    value === "customer-runbook" ||
    value === "cluster-snapshot" ||
    value === "official-doc"
  ) {
    return value;
  }
  return "customer-runbook";
}

function normalizeTrustLevel(
  value: unknown
): OpsLensCitation["trustLevel"] {
  if (value === "cluster-snapshot" || value === "official") {
    return value;
  }
  return "approved";
}

async function fetchJson(params: FetchJsonParams): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: params.method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: params.body === undefined ? undefined : JSON.stringify(params.body)
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error("response was not valid JSON");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function parseEmbeddingVector(payload: unknown): number[] | undefined {
  const data = asRecord(payload).data;
  if (!Array.isArray(data)) return undefined;
  const first = asRecord(data[0]);
  const embedding = first.embedding;
  if (
    !Array.isArray(embedding) ||
    !embedding.every((value) => typeof value === "number")
  ) {
    return undefined;
  }
  return embedding;
}

function pgvectorFixtureRows(): unknown[] | undefined {
  const configured = process.env.CYWELL_OPSLENS_PGVECTOR_FIXTURE_ROWS;
  if (!configured) return undefined;
  try {
    const parsed = JSON.parse(configured);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function quotePgIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quotePgTableName(tableName: string) {
  return tableName
    .split(".")
    .map((part) => quotePgIdentifier(part || "opslens_rag_chunks"))
    .join(".");
}

function vectorLiteral(vector: number[]) {
  return `[${vector.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

async function searchPgvectorRows(params: {
  tableName: string;
  tenantId: string;
  vector: number[];
  limit: number;
  timeoutMs: number;
}): Promise<unknown[]> {
  const fixtureRows = pgvectorFixtureRows();
  if (fixtureRows) {
    return fixtureRows.slice(0, params.limit);
  }

  const pg = await import("pg");
  const client = new pg.Client({
    connectionString: runtimeVectorUrl(),
    statement_timeout: params.timeoutMs,
    query_timeout: params.timeoutMs,
    connectionTimeoutMillis: params.timeoutMs
  });

  await client.connect();
  try {
    const tableName = quotePgTableName(params.tableName);
    const result = await client.query(
      `select
         document_id,
         id,
         label,
         title,
         source_type,
         trust_level,
         redacted_snippet,
         snippet,
         chunk_snippet
       from ${tableName}
       where tenant_id = $1 and redacted = true
       order by embedding <=> $2::vector
       limit $3`,
      [params.tenantId, vectorLiteral(params.vector), params.limit]
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function citationFromPgvectorRow(
  row: unknown,
  index: number
): OpsLensCitation | undefined {
  const payload = asRecord(row);
  const snippet =
    optionalString(payload.redactedSnippet) ??
    optionalString(payload.redacted_snippet) ??
    optionalString(payload.snippet) ??
    optionalString(payload.chunkSnippet) ??
    optionalString(payload.chunk_snippet);

  if (!snippet) {
    return undefined;
  }

  const id =
    optionalString(payload.documentId) ??
    optionalString(payload.document_id) ??
    optionalString(payload.id) ??
    `runtime-rag-${index + 1}`;

  return {
    id,
    label:
      optionalString(payload.label) ??
      optionalString(payload.title) ??
      `Runtime RAG citation ${index + 1}`,
    sourceType: normalizeSourceType(payload.sourceType ?? payload.source_type),
    trustLevel: normalizeTrustLevel(payload.trustLevel ?? payload.trust_level),
    snippet: redactSensitiveText(snippet).slice(0, 360),
    redacted: true
  };
}

function createRuntimeAudit(params: {
  mode: OpsLensRuntimeRagMode;
  status: OpsLensRuntimeRagStatus;
  collection: string;
  embeddingModel: string;
  retrievalAttempted: boolean;
  embeddingAttempted: boolean;
  vectorSearchAttempted: boolean;
  localFallbackUsed: boolean;
  citationsUsed: OpsLensRuntimeRagAudit["citationsUsed"];
  latencyMs: number;
  evidence: string[];
  missingEvidence: string[];
}): OpsLensRuntimeRagAudit {
  return {
    mode: params.mode,
    status: params.status,
    provider: {
      vectorStore: "pgvector",
      modelRuntime: "vllm"
    },
    collection: params.collection,
    embeddingModel: params.embeddingModel,
    retrievalAttempted: params.retrievalAttempted,
    embeddingAttempted: params.embeddingAttempted,
    vectorSearchAttempted: params.vectorSearchAttempted,
    localFallbackUsed: params.localFallbackUsed,
    citationsUsed: params.citationsUsed,
    latencyMs: params.latencyMs,
    evidence: params.evidence,
    missingEvidence: params.missingEvidence
  };
}

export async function retrieveRuntimeRagCitations(
  params: RuntimeRagParams
): Promise<RuntimeRagResult> {
  const startedAt = Date.now();
  const mode = runtimeRagMode();
  const collection = runtimeCollectionName(params.tenantId);
  const embeddingModel = runtimeEmbeddingModel();

  if (mode === "local") {
    return {
      citations: [],
      audit: createRuntimeAudit({
        mode,
        status: "disabled",
        collection,
        embeddingModel,
        retrievalAttempted: false,
        embeddingAttempted: false,
        vectorSearchAttempted: false,
        localFallbackUsed: true,
        citationsUsed: "local-fallback",
        latencyMs: Math.max(1, Date.now() - startedAt),
        evidence: [
          "runtime RAG mode=local; no Postgres/pgvector or vLLM request was made",
          "local tenant-scoped Markdown RAG remains the default MVP 0.1 answer source",
          "runtime RAG can be enabled with CYWELL_OPSLENS_RAG_RUNTIME_MODE=hybrid or runtime"
        ],
        missingEvidence: [
          "live Postgres/pgvector and vLLM retrieval was not requested for this response"
        ]
      })
    };
  }

  const evidence = [
    `runtime RAG mode=${mode}`,
    `runtime RAG pgvector table=${collection}`,
    "query text is redacted before vLLM embedding request",
    "Postgres/pgvector row conversion only accepts redacted snippet fields"
  ];
  let embeddingAttempted = false;
  let vectorSearchAttempted = false;

  try {
    embeddingAttempted = true;
    const embeddingPayload = await fetchJson({
      url: joinEndpoint(runtimeModelUrl(), "/v1/embeddings"),
      method: "POST",
      timeoutMs: runtimeProbeTimeoutMs(),
      body: {
        model: embeddingModel,
        input: redactSensitiveText(params.question).slice(0, 1200)
      }
    });
    const vector = parseEmbeddingVector(embeddingPayload);
    if (!vector) {
      throw new Error("vLLM embedding response did not include a numeric vector");
    }
    evidence.push(`vLLM embedding returned ${vector.length} dimensions`);

    vectorSearchAttempted = true;
    const rows = await searchPgvectorRows({
      tableName: collection,
      tenantId: params.tenantId,
      vector,
      limit: params.maxDocuments,
      timeoutMs: runtimeProbeTimeoutMs()
    });
    const citations = rows
      .map((row, index) => citationFromPgvectorRow(row, index))
      .filter((citation): citation is OpsLensCitation => Boolean(citation))
      .slice(0, params.maxDocuments);

    if (citations.length === 0) {
      return {
        citations: [],
        audit: createRuntimeAudit({
          mode,
          status: "needs-live-check",
          collection,
          embeddingModel,
          retrievalAttempted: true,
          embeddingAttempted,
          vectorSearchAttempted,
          localFallbackUsed: true,
          citationsUsed: "local-fallback",
          latencyMs: Math.max(1, Date.now() - startedAt),
          evidence,
          missingEvidence: [
            "runtime Postgres/pgvector search returned no redacted snippet citations",
            "local RAG fallback was used to avoid an unsupported answer"
          ]
        })
      };
    }

    return {
      citations,
      audit: createRuntimeAudit({
        mode,
        status: "ready",
        collection,
        embeddingModel,
        retrievalAttempted: true,
        embeddingAttempted,
        vectorSearchAttempted,
        localFallbackUsed: false,
        citationsUsed: "runtime",
        latencyMs: Math.max(1, Date.now() - startedAt),
        evidence: [
          ...evidence,
          `Postgres/pgvector returned ${citations.length} redacted citation(s)`
        ],
        missingEvidence: []
      })
    };
  } catch (error) {
    return {
      citations: [],
      audit: createRuntimeAudit({
        mode,
        status: "failed",
        collection,
        embeddingModel,
        retrievalAttempted: true,
        embeddingAttempted,
        vectorSearchAttempted,
        localFallbackUsed: true,
        citationsUsed: "local-fallback",
        latencyMs: Math.max(1, Date.now() - startedAt),
        evidence,
        missingEvidence: [
          `runtime RAG retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
          "local RAG fallback was used to preserve read-only plan generation"
        ]
      })
    };
  }
}
