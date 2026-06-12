import {
  assistantAnswer,
  contextChips,
  mockDashboardResponse,
  opsLensCustomerCitations,
  opsLensMcpTools
} from "@kugnus/contracts";
import {
  buildLocalRagIndex,
  createRagValidationEvidenceExport,
  redactSensitiveText,
  searchLocalRagIndex,
  validateRagDocumentIntake
} from "@kugnus/rag";
import type {
  ActionPlanRequest,
  ActionPlanResponse,
  ConsoleContextPayload,
  ContextSyncRequest,
  ContextSyncResponse,
  DashboardRisksResponse,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
  OpsLensAdminOverviewResponse,
  OpsLensCitation,
  OpsLensLightspeedMcpReadiness,
  OpsLensRemediationProposal,
  OpsLensRagEvidenceExportRequest,
  OpsLensRagEvidenceExportResponse,
  OpsLensRagValidationRequest,
  OpsLensRagValidationResponse,
  OpsLensToolName,
  OpsLensToolRequest,
  OpsLensToolResponse
} from "@kugnus/contracts";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sensitivePattern =
  /(token|password|passwd|secret|api[_-]?key|bearer\s+[a-z0-9._-]+)/gi;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const runbookRoot = join(moduleDir, "../../../data/runbooks");
const localRagIndex = buildLocalRagIndex(runbookRoot);

function stableStringify(value: unknown): string {
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

function hashContext(context: ConsoleContextPayload): string {
  return createHash("sha256")
    .update(stableStringify(context))
    .digest("hex")
    .slice(0, 16);
}

function countSensitiveValues(value: unknown): number {
  return (stableStringify(value).match(sensitivePattern) ?? []).length;
}

function retrieveRunbookCitations(
  tenantId: string,
  question: string,
  maxDocuments: number
): OpsLensCitation[] {
  const search = searchLocalRagIndex(localRagIndex, tenantId, question, maxDocuments);
  if (!search.results.length) {
    return opsLensCustomerCitations.slice(0, maxDocuments);
  }

  return search.results.map((result) => ({
    id: result.documentId,
    label: result.label,
    sourceType: result.sourceType,
    trustLevel:
      result.trustLevel === "official" || result.trustLevel === "cluster-snapshot"
        ? result.trustLevel
        : "approved",
    snippet: result.snippet,
    redacted: true
  }));
}

function assertContext(value: unknown): asserts value is ConsoleContextPayload {
  const context = value as Partial<ConsoleContextPayload>;
  if (
    !context ||
    typeof context.clusterId !== "string" ||
    typeof context.user !== "string" ||
    typeof context.route !== "string" ||
    typeof context.namespace !== "string" ||
    !context.rbac
  ) {
    throw new Error("invalid console context payload");
  }
}

function makeRequestId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getDashboardRisks(): DashboardRisksResponse {
  return {
    ...mockDashboardResponse,
    generatedAt: new Date().toISOString()
  };
}

export function syncContext(request: ContextSyncRequest): ContextSyncResponse {
  assertContext(request.context);

  const requestId = makeRequestId("ctx");
  const contextHash = hashContext(request.context);

  return {
    accepted: true,
    requestId,
    receivedAt: new Date().toISOString(),
    contextHash,
    context: request.context,
    contextChips,
    redactionCount: countSensitiveValues(request.context),
    rbac: {
      role: request.context.rbac.role,
      namespaceScope: request.context.namespace,
      deniedNamespaces: request.context.rbac.deniedNamespaces
    }
  };
}

export function createActionPlan(
  request: ActionPlanRequest
): ActionPlanResponse {
  assertContext(request.context);

  if (!request.prompt || typeof request.prompt !== "string") {
    throw new Error("prompt is required");
  }

  const startedAt = Date.now();
  const requestId = makeRequestId("plan");
  const contextHash = hashContext(request.context);
  const redactionCount =
    countSensitiveValues(request.context) + countSensitiveValues(request.prompt);

  const answer = {
    ...assistantAnswer,
    scenario: request.scenario ?? assistantAnswer.scenario,
    actionMode: "readOnly" as const
  };

  return {
    requestId,
    answer,
    audit: {
      requestId,
      user: request.context.user,
      groups: [request.context.rbac.role],
      clusterId: request.context.clusterId,
      namespaceScope: request.context.namespace,
      contextHash,
      sources: answer.inspectedEvidence.map((source) => source.id),
      model: "mock-local-search-mode/triage",
      tokenUsage: {
        input: Math.ceil(stableStringify(request).length / 4),
        output: Math.ceil(stableStringify(answer).length / 4)
      },
      latencyMs: Math.max(1, Date.now() - startedAt),
      redactionCount,
      actionMode: answer.actionMode
    }
  };
}

function assertOpsLensToolRequest(
  request: OpsLensToolRequest
): asserts request is OpsLensToolRequest {
  if (
    !request ||
    typeof request.tool !== "string" ||
    !opsLensMcpTools.some((tool) => tool.name === request.tool) ||
    !request.input ||
    typeof request.input.clusterId !== "string" ||
    typeof request.input.tenantId !== "string" ||
    typeof request.input.intent !== "string"
  ) {
    throw new Error("invalid OpsLens tool request");
  }
}

function consoleLinks(namespace?: string, workload?: string) {
  const ns = namespace ? `/k8s/ns/${encodeURIComponent(namespace)}` : "/k8s/all-namespaces";
  const links = [
    `${ns}/pods`,
    `${ns}/events`,
    "/opslens/cluster-health",
    "/opslens/playbooks"
  ];
  if (namespace && workload) {
    links.unshift(
      `/k8s/ns/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(
        workload
      )}`
    );
  }
  return links;
}

export function getOpsLensTools() {
  return {
    service: "cywell-opslens",
    transport: ["rest", "mcp-json-rpc"],
    mcpTechnologyPreview: true,
    tools: opsLensMcpTools,
    evidence: [
      "OpenShift Lightspeed custom MCP server is the supported extension point for tool calls",
      "All MVP tools are read-only and approvalRequired=false",
      "apply_remediation is deliberately excluded from the MVP tool catalog"
    ]
  };
}

function tenantRunbookDirs() {
  return localRagIndex.tenants;
}

function getOpsLensRagDocuments(): OpsLensAdminOverviewResponse["rag"]["documents"] {
  return localRagIndex.documents.map((document, index) => ({
    id: document.id,
    tenantId: document.tenantId,
    label: document.label,
    sourceType: document.sourceType,
    trustLevel: document.trustLevel,
    status: document.trustLevel === "draft" ? "validation-required" : "indexed",
    lastIndexedAt: existsSync(join(runbookRoot, document.relativePath))
      ? statSync(join(runbookRoot, document.relativePath)).mtime.toISOString()
      : document.lastIndexedAt,
    chunkCount: document.chunkCount,
    citationRate: Math.min(0.98, 0.72 + index * 0.06),
    redacted: true,
    evidence: [
      `local vector index ${localRagIndex.version}`,
      `local Markdown corpus ${document.relativePath}`,
      "document inventory returns metadata only",
      "raw customer document body is not returned"
    ]
  }));
}

function gpuSamples(now = Date.now()): OpsLensAdminOverviewResponse["runtime"]["gpu"]["samples"] {
  return Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    return {
      timestamp: new Date(now - offset * 5 * 60 * 1000).toISOString(),
      utilizationPercent: [42, 48, 53, 61, 57, 66, 72, 69, 64, 58, 51, 47][index],
      memoryUsedGiB: [18, 19, 21, 24, 23, 27, 31, 30, 28, 25, 22, 20][index],
      memoryTotalGiB: 48
    };
  });
}

type LightspeedReadinessEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  readiness?: {
    mode?: string;
    sources?: {
      crd?: string;
      olsConfig?: string;
      mcpEndpoint?: string;
    };
    olsConfig?: {
      label?: string;
      featureGate?: string;
      cywellRegistration?: string;
    };
  };
  missingEvidence?: string[];
};

function lightspeedReadinessEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_READINESS_EVIDENCE ??
    join(process.cwd(), "test-results", "cywell-opslens-lightspeed-readiness.json")
  );
}

function mapLightspeedReadinessStatus(
  artifact: LightspeedReadinessEvidenceArtifact
): OpsLensLightspeedMcpReadiness {
  if (artifact.readiness?.mode === "fixture") {
    return "needs-live-check";
  }
  if (artifact.status === "PASS") {
    return "ready";
  }
  if (artifact.status === "NEEDS_CONFIGURATION") {
    return "needs-configuration";
  }
  if (artifact.status === "FAIL") {
    return "failed";
  }
  return "needs-live-check";
}

function getLightspeedMcpReadiness(): {
  status: OpsLensLightspeedMcpReadiness;
  evidence: string[];
} {
  const evidencePath = lightspeedReadinessEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-live-check",
      evidence: [
        "run npm run verify:lightspeed to create live Lightspeed MCP readiness evidence",
        "dashboard keeps Lightspeed MCP as needs-live-check until live OLSConfig evidence is available",
        "no dashboard request mutates OLSConfig or calls apply/delete/scale"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LightspeedReadinessEvidenceArtifact;
    const status = mapLightspeedReadinessStatus(artifact);
    const sources = artifact.readiness?.sources ?? {};
    const olsConfig = artifact.readiness?.olsConfig ?? {};

    return {
      status,
      evidence: [
        `Lightspeed readiness evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `readiness generated at ${artifact.generatedAt ?? "unknown"}`,
        `sources crd=${sources.crd ?? "unknown"} olsConfig=${sources.olsConfig ?? "unknown"} mcp=${sources.mcpEndpoint ?? "unknown"}`,
        `OLSConfig ${olsConfig.label ?? "unknown"} featureGate=${olsConfig.featureGate ?? "unknown"} cywellRegistration=${olsConfig.cywellRegistration ?? "unknown"}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads readiness evidence only; it does not patch OLSConfig"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      evidence: [
        `Lightspeed readiness evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid readiness evidence blocks overclaiming Lightspeed MCP readiness"
      ]
    };
  }
}

export function getOpsLensAdminOverview(): OpsLensAdminOverviewResponse {
  const documents = getOpsLensRagDocuments();
  const usedTokens = 784_200;
  const budgetTokens = 1_500_000;
  const lightspeedReadiness = getLightspeedMcpReadiness();

  return {
    generatedAt: new Date().toISOString(),
    source: "local-contract",
    rag: {
      tenants: tenantRunbookDirs().length,
      documents,
      uploadIntake: {
        mode: "validate-only",
        pending: 2,
        rejected: 1,
        evidence: [
          "document upload intake is validate-only in MVP",
          "raw document write/apply is not enabled",
          "RAG corpus source of truth is data/runbooks/<tenant>",
          `local vector index ${localRagIndex.version} has ${localRagIndex.chunks.length} chunks`
        ]
      }
    },
    tokenUsage: {
      window: "24h",
      budgetTokens,
      usedTokens,
      remainingTokens: budgetTokens - usedTokens,
      warningThresholdTokens: 300_000,
      routes: [
        {
          route: "lightspeed-mcp",
          requests: 126,
          inputTokens: 182_000,
          outputTokens: 91_400,
          p95LatencyMs: 1450
        },
        {
          route: "incident-analysis",
          requests: 38,
          inputTokens: 241_000,
          outputTokens: 134_800,
          p95LatencyMs: 2240
        },
        {
          route: "admin-dashboard",
          requests: 52,
          inputTokens: 43_000,
          outputTokens: 18_900,
          p95LatencyMs: 420
        },
        {
          route: "rag-indexing",
          requests: 9,
          inputTokens: 61_500,
          outputTokens: 11_600,
          p95LatencyMs: 3180
        }
      ]
    },
    runtime: {
      provider: "vllm",
      model: "Gemma 4 OpsLens route",
      route: "cywell-private-rag-local-vector/v0.1",
      replicas: 2,
      readyReplicas: 2,
      gpu: {
        available: true,
        deviceClass: "nvidia.com/gpu",
        samples: gpuSamples()
      }
    },
    incidents: [
      {
        incidentId: "incident-payments-api-crashloop",
        alertName: "PodCrashLooping",
        namespace: "payments-prod",
        workload: "payments-api",
        actionMode: "planOnly",
        metricQueries: [
          {
            name: "firing-alert",
            query: 'ALERTS{alertstate="firing",alertname="PodCrashLooping",namespace="payments-prod"}',
            status: "ready",
            sampleCount: 1,
            evidence: ["Prometheus instant query can identify firing alert"],
            missingEvidence: []
          },
          {
            name: "pod-restarts",
            query:
              'sum by (namespace,pod) (increase(kube_pod_container_status_restarts_total{namespace="payments-prod",pod="payments-api"}[10m]))',
            status: "ready",
            sampleCount: 6,
            evidence: ["restart increase query is part of AC-AIOPS-002"],
            missingEvidence: []
          },
          {
            name: "pod-cpu",
            query:
              'sum by (namespace,pod) (rate(container_cpu_usage_seconds_total{namespace="payments-prod",pod="payments-api"}[10m]))',
            status: "missing",
            sampleCount: 0,
            evidence: [],
            missingEvidence: ["monitoring proxy disabled or no matching CPU series"]
          },
          {
            name: "pod-memory",
            query:
              'sum by (namespace,pod) (container_memory_working_set_bytes{namespace="payments-prod",pod="payments-api"})',
            status: "ready",
            sampleCount: 12,
            evidence: ["memory query_range is available for dashboard charting"],
            missingEvidence: []
          }
        ],
        remediationProposal: createPlanOnlyRemediationProposal({
          namespace: "payments-prod",
          workload: "payments-api",
          targetName: "payments-api",
          targetConfidence: "medium",
          currentValue: "2Gi",
          currentValueSource: "runbook-baseline",
          currentValueObservedInCluster: false,
          evidence: [
            "admin overview uses the same remediation proposal contract as incident analysis",
            "memory query_range is available for dashboard charting"
          ],
          missingEvidence: [
            "live Deployment spec still needs approval-path review"
          ]
        }),
        lastAnalyzedAt: new Date().toISOString()
      }
    ],
    installReadiness: {
      lightspeedMcp: lightspeedReadiness.status,
      consoleDashboard: "prototype",
      operatorPackaging: "draft",
      certification: "draft",
      evidence: [
        ...lightspeedReadiness.evidence,
        "Stage 1 MCP contract has verifier coverage",
        "Stage 2 incident packet has logs/events/metrics coverage",
        "Stage 3 dashboard is now served by /api/opslens/admin/overview",
        "Stage 4 Operator package skeleton is validated by npm run verify:operator",
        "Stage 4 reconcile core validates ValidateOnly and explicit PatchOLSConfig through npm run verify:operator:reconcile",
        "Stage 5 catalog and certification readiness draft is validated by npm run verify:certification"
      ]
    },
    policy: {
      dashboardOnly: true,
      mutationAllowed: false,
      rawDocumentReturned: false,
      uploadApplyAllowed: false
    }
  };
}

function assertRagValidationRequest(
  request: OpsLensRagValidationRequest
): asserts request is OpsLensRagValidationRequest {
  if (
    !request ||
    typeof request.tenantId !== "string" ||
    typeof request.fileName !== "string" ||
    typeof request.markdown !== "string"
  ) {
    throw new Error("invalid RAG validation request");
  }
}

export function validateOpsLensRagDocument(
  request: OpsLensRagValidationRequest
): OpsLensRagValidationResponse {
  assertRagValidationRequest(request);
  return validateRagDocumentIntake(localRagIndex, request);
}

function assertRagEvidenceExportRequest(
  request: OpsLensRagEvidenceExportRequest
): asserts request is OpsLensRagEvidenceExportRequest {
  assertRagValidationRequest(request);
  if (
    request.requestedBy !== undefined &&
    typeof request.requestedBy !== "string"
  ) {
    throw new Error("requestedBy must be a string");
  }
  if (request.reason !== undefined && typeof request.reason !== "string") {
    throw new Error("reason must be a string");
  }
}

export function exportOpsLensRagEvidence(
  request: OpsLensRagEvidenceExportRequest
): OpsLensRagEvidenceExportResponse {
  assertRagEvidenceExportRequest(request);
  return createRagValidationEvidenceExport(localRagIndex, request);
}

export function createPlanOnlyRemediationProposal(params: {
  namespace: string;
  workload: string;
  targetApiVersion?: string;
  targetKind?: string;
  targetName?: string;
  targetConfidence?: "high" | "medium" | "low";
  container?: string;
  currentValue?: string;
  currentValueSource?: OpsLensRemediationProposal["currentValue"]["source"];
  currentValueObservedInCluster?: boolean;
  proposedValue?: string;
  evidence?: string[];
  missingEvidence?: string[];
  risks?: string[];
  rollbackPath?: string[];
}): OpsLensRemediationProposal {
  const targetApiVersion = params.targetApiVersion ?? "apps/v1";
  const targetKind = params.targetKind ?? "Deployment";
  const targetName = params.targetName ?? params.workload;
  const container = params.container ?? "api";
  const currentValue = params.currentValue ?? "2Gi";
  const currentValueSource = params.currentValueSource ?? "runbook-baseline";
  const currentValueObservedInCluster =
    params.currentValueObservedInCluster ?? false;
  const proposedValue = params.proposedValue ?? "4Gi";
  const fieldPath =
    `spec.template.spec.containers[name=${container}].resources.limits.memory`;
  const evidence = uniqueStrings([
    "propose_remediation returns a plan-only artifact and never mutates cluster state",
    "customer runbook recommends increasing memory only after log, event, and metric evidence are reviewed",
    ...(params.evidence ?? [])
  ]);
  const missingEvidence = uniqueStrings([
    ...(currentValueObservedInCluster
      ? []
      : ["cluster-observed current workload memory limit was not confirmed"]),
    ...(params.missingEvidence ?? [])
  ]);
  const risks = uniqueStrings([
    "Memory limit changes can increase node pressure or mask an application leak.",
    "A resource patch must be reviewed through the approved GitOps or change-management path before execution.",
    ...(params.risks ?? [])
  ]);
  const rollbackPath = uniqueStrings([
    "Capture the current workload manifest before opening a change request.",
    "If error rate, readiness, or node memory pressure worsens, revert the GitOps PR to the previous resource limit.",
    "Re-run alert, restart, CPU, and memory checks after the approved change is deployed.",
    ...(params.rollbackPath ?? [])
  ]);

  return {
    artifactType: "opslens.remediation.proposal.v0.1",
    actionMode: "planOnly",
    mutationAllowed: false,
    patchType: "strategicMerge",
    target: {
      apiVersion: targetApiVersion,
      kind: targetKind,
      namespace: params.namespace,
      name: targetName,
      container,
      fieldPath,
      confidence: params.targetConfidence ?? "medium"
    },
    currentValue: {
      value: currentValue,
      source: currentValueSource,
      observedInCluster: currentValueObservedInCluster,
      evidence: currentValueObservedInCluster
        ? [`cluster resource evidence observed ${fieldPath}=${currentValue}`]
        : [`${fieldPath}=${currentValue} is a runbook baseline or unconfirmed input`]
    },
    proposedValue: {
      value: proposedValue,
      source: "candidate-remediation",
      evidence: [
        `candidate patch proposes ${fieldPath}=${proposedValue}`,
        "proposal requires human review and does not include an apply command"
      ]
    },
    yamlPatch: [
      `apiVersion: ${targetApiVersion}`,
      `kind: ${targetKind}`,
      "metadata:",
      `  name: ${targetName}`,
      `  namespace: ${params.namespace}`,
      "spec:",
      "  template:",
      "    spec:",
      "      containers:",
      `        - name: ${container}`,
      "          resources:",
      "            limits:",
      `              memory: ${proposedValue}`
    ].join("\n"),
    rationale: [
      "Use the YAML as a review artifact, not as an execution command.",
      "Tie the proposed resource change to alert, log, event, metric, and approved runbook evidence.",
      "Keep missing evidence visible instead of filling gaps with unsupported certainty."
    ],
    evidence,
    missingEvidence,
    risks,
    rollbackPath,
    forbiddenActions: ["apply", "delete", "scale"],
    reviewGate: {
      required: true,
      approvers: ["service-owner", "sre-oncall"],
      evidence: [
        "human approval is required before any GitOps PR or cluster mutation",
        "automatic apply/delete/scale is outside MVP 0.1"
      ]
    }
  };
}

export function createOpsLensToolResponse(
  request: OpsLensToolRequest
): OpsLensToolResponse {
  assertOpsLensToolRequest(request);

  const startedAt = Date.now();
  const requestId = makeRequestId("opslens");
  const redactionCount = countSensitiveValues(request);
  const namespace = request.input.namespace ?? "payments";
  const workload = request.input.workload ?? "payments-api";
  const question = redactSensitiveText(
    request.input.question ?? "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘"
  );
  const maxDocuments = Math.min(
    Math.max(request.input.constraints?.maxDocuments ?? 3, 1),
    5
  );
  const citations = retrieveRunbookCitations(
    request.input.tenantId,
    question,
    maxDocuments
  );
  const includeYaml =
    request.tool === "propose_remediation" ||
    request.input.intent.toLowerCase().includes("memory");
  const remediationProposal = includeYaml
    ? createPlanOnlyRemediationProposal({
        namespace,
        workload,
        evidence: citations.map((citation) => citation.id)
      })
    : undefined;

  return {
    tool: request.tool,
    requestId,
    generatedAt: new Date().toISOString(),
    actionMode: request.tool === "propose_remediation" ? "planOnly" : "readOnly",
    summary:
      `${namespace}/${workload} 장애 질문에 대해 Cywell private RAG와 read-only cluster signal을 결합했습니다. ` +
      `질문: ${question}`,
    suspectedCauses: [
      "최근 rollout 이후 필수 환경변수 또는 Secret key가 누락됐을 가능성",
      "readiness probe 실패가 재시작 루프를 증폭했을 가능성",
      "DB 연결 설정 변경 또는 외부 dependency 장애 가능성"
    ],
    recommendedSteps: [
      `OpenShift 콘솔에서 ${namespace} namespace의 ${workload} Pod 이벤트와 최근 로그 10분을 확인한다.`,
      "고객 승인 runbook에 따라 필수 환경변수와 Secret key 존재 여부를 비교한다.",
      "최근 GitOps/rollout 변경과 정상 revision을 비교하되 자동 rollback은 수행하지 않는다.",
      "원인과 blast radius가 확인되면 승인된 변경 경로로 YAML patch 또는 rollback PR을 생성한다."
    ],
    proposedYamlPatch: remediationProposal?.yamlPatch,
    remediationProposal,
    citations,
    missingEvidence: [
      "실제 Pod 로그 10분 tail",
      "최근 Deployment/ConfigMap/Secret diff",
      "프로메테우스 알람 fingerprint와 Alertmanager route",
      "DB dependency 상태"
    ],
    risks: [
      "MCP 기능은 OpenShift Lightspeed에서 Technology Preview이므로 운영 SLA 경로가 아니다.",
      "MCP 응답은 고객 데이터 정책 집행을 Cywell 서버에서 끝낸 뒤 최소 스니펫만 반환해야 한다.",
      "자동 apply/delete/scale 없이 planOnly 또는 readOnly로만 응답한다."
    ],
    rollbackPath: [
      "현재 상태 스냅샷과 정상 revision을 기록한다.",
      "원인이 확인되지 않으면 자동 rollback하지 않는다.",
      "승인된 GitOps PR로만 rollback 또는 YAML 변경을 진행한다.",
      "변경 후 alert, pod readiness, error rate를 재확인한다."
    ],
    consoleLinks: consoleLinks(namespace, workload),
    evidence: [
      "tool catalog excludes mutating tools",
      "private RAG citations are loaded from tenant-scoped Markdown corpus as snippet-only redacted evidence",
      "response includes missingEvidence, risks, rollbackPath, and audit envelope",
      "caller source is expected to be OpenShift Lightspeed custom MCP server"
    ],
    policy: {
      privateRag: true,
      serverSideRedaction: true,
      rawDocumentReturned: false,
      mcpTechnologyPreview: true,
      mutationAllowed: false
    },
    audit: {
      tenantId: request.input.tenantId,
      clusterId: request.input.clusterId,
      namespace,
      user: request.caller?.user,
      sources: citations.map((citation) => citation.id),
      model: "cywell-private-rag-local-vector/v0.1",
      redactionCount,
      latencyMs: Math.max(1, Date.now() - startedAt)
    }
  };
}

function mcpError(
  id: McpJsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown
): McpJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data
    }
  };
}

export function handleOpsLensMcpRequest(
  request: McpJsonRpcRequest
): McpJsonRpcResponse | undefined {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return mcpError(null, -32600, "invalid JSON-RPC request");
  }

  if (request.id === undefined && request.method.startsWith("notifications/")) {
    return undefined;
  }

  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "cywell-opslens",
          version: "0.1.0"
        },
        instructions:
          "Use Cywell OpsLens tools for read-only OpenShift operations analysis and private customer runbook retrieval. Do not request apply/delete/scale."
      }
    };
  }

  if (request.method === "ping") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {}
    };
  }

  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: opsLensMcpTools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false
          }
        }))
      }
    };
  }

  if (request.method === "tools/call") {
    const params = request.params as
      | {
          name?: OpsLensToolName;
          arguments?: Partial<OpsLensToolRequest["input"]> & {
            caller?: OpsLensToolRequest["caller"];
          };
        }
      | undefined;
    const tool = params?.name;
    if (!tool || !opsLensMcpTools.some((candidate) => candidate.name === tool)) {
      return mcpError(request.id, -32602, "unknown OpsLens tool", { tool });
    }

    try {
      const result = createOpsLensToolResponse({
        tool,
        input: {
          clusterId: params?.arguments?.clusterId ?? "prod-ocp",
          tenantId: params?.arguments?.tenantId ?? "cywell-internal",
          namespace: params?.arguments?.namespace,
          workload: params?.arguments?.workload,
          question: params?.arguments?.question,
          intent: params?.arguments?.intent ?? "ops-triage",
          alertName: params?.arguments?.alertName,
          constraints: params?.arguments?.constraints
        },
        caller: params?.arguments?.caller ?? {
          source: "lightspeed"
        }
      });

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: result,
          isError: false
        }
      };
    } catch (error) {
      return mcpError(
        request.id,
        -32602,
        error instanceof Error ? error.message : "tool call failed"
      );
    }
  }

  return mcpError(request.id, -32601, "method not found", {
    method: request.method
  });
}
