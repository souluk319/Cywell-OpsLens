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
  return process.env.CYWELL_OPSLENS_VECTOR_URL ?? "http://cywell-opslens-vector:6333";
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
  const prefix = process.env.CYWELL_OPSLENS_QDRANT_COLLECTION_PREFIX ?? "opslens-";
  const safeTenant = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${prefix}${safeTenant || "default"}`;
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

function qdrantResultPoints(payload: unknown): unknown[] {
  const result = asRecord(payload).result;
  if (Array.isArray(result)) return result;
  const resultRecord = asRecord(result);
  return Array.isArray(resultRecord.points) ? resultRecord.points : [];
}

function citationFromQdrantPoint(
  point: unknown,
  index: number
): OpsLensCitation | undefined {
  const record = asRecord(point);
  const payload = asRecord(record.payload);
  const snippet =
    optionalString(payload.redactedSnippet) ??
    optionalString(payload.snippet) ??
    optionalString(payload.chunkSnippet);

  if (!snippet) {
    return undefined;
  }

  const id =
    optionalString(payload.documentId) ??
    optionalString(payload.id) ??
    optionalString(record.id) ??
    `runtime-rag-${index + 1}`;

  return {
    id,
    label:
      optionalString(payload.label) ??
      optionalString(payload.title) ??
      `Runtime RAG citation ${index + 1}`,
    sourceType: normalizeSourceType(payload.sourceType),
    trustLevel: normalizeTrustLevel(payload.trustLevel),
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
      vectorStore: "qdrant",
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
          "runtime RAG mode=local; no Qdrant or vLLM request was made",
          "local tenant-scoped Markdown RAG remains the default MVP 0.1 answer source",
          "runtime RAG can be enabled with CYWELL_OPSLENS_RAG_RUNTIME_MODE=hybrid or runtime"
        ],
        missingEvidence: [
          "live Qdrant/vLLM retrieval was not requested for this response"
        ]
      })
    };
  }

  const evidence = [
    `runtime RAG mode=${mode}`,
    `runtime RAG collection=${collection}`,
    "query text is redacted before vLLM embedding request",
    "Qdrant payload conversion only accepts redacted snippet fields"
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
    const searchPayload = await fetchJson({
      url: joinEndpoint(
        runtimeVectorUrl(),
        `/collections/${encodeURIComponent(collection)}/points/search`
      ),
      method: "POST",
      timeoutMs: runtimeProbeTimeoutMs(),
      body: {
        vector,
        limit: params.maxDocuments,
        with_payload: true,
        filter: {
          must: [
            {
              key: "tenantId",
              match: {
                value: params.tenantId
              }
            },
            {
              key: "redacted",
              match: {
                value: true
              }
            }
          ]
        }
      }
    });
    const citations = qdrantResultPoints(searchPayload)
      .map((point, index) => citationFromQdrantPoint(point, index))
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
            "runtime Qdrant search returned no redacted snippet citations",
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
          `Qdrant returned ${citations.length} redacted citation(s)`
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
