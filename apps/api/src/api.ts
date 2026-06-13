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
  listRagApprovalQueueItems,
  planRagApprovalQueueIngestionJob,
  redactSensitiveText,
  reviewRagApprovalQueueItem,
  searchLocalRagIndex,
  submitRagApprovalQueueItem,
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
  OpsLensAiopsIncidentPipelineReadiness,
  OpsLensAiopsIncidentPipelineSummary,
  OpsLensCatalogToolchainReadiness,
  OpsLensCatalogToolchainSummary,
  OpsLensCertificationReadiness,
  OpsLensCertificationReadinessSummary,
  OpsLensCitation,
  OpsLensEvidenceCheckpointReadiness,
  OpsLensEvidenceCheckpointSummary,
  OpsLensExternalRuntimeImagesPlanSummary,
  OpsLensExternalRuntimeReadiness,
  OpsLensExternalRuntimeReviewPacketReadiness,
  OpsLensExternalRuntimeReviewPacketSummary,
  OpsLensImageBuildReadiness,
  OpsLensInstallApprovalPlanSummary,
  OpsLensInstallPlanReadiness,
  OpsLensLightspeedRegistrationApprovalPlanSummary,
  OpsLensLiveEvidenceHandoffReadiness,
  OpsLensLiveEvidenceHandoffSummary,
  OpsLensLightspeedMcpReadiness,
  OpsLensMcpToolCategory,
  OpsLensMcpToolSurfaceItem,
  OpsLensOcpConnectivityDiagnosticSummary,
  OpsLensOcpConnectivityReadiness,
  OpsLensOcpAuthRbacPlanReadiness,
  OpsLensOcpAuthRbacPlanSummary,
  OpsLensOcpNetworkHandoffReadiness,
  OpsLensOcpNetworkHandoffSummary,
  OpsLensOperatorDryRunReadiness,
  OpsLensOwnedImageProvenanceReadiness,
  OpsLensOwnedImageProvenanceSummary,
  OpsLensReleasePublishPlanSummary,
  OpsLensReleasePublishReadiness,
  OpsLensReleaseActionQueueReadiness,
  OpsLensReleaseActionQueueSummary,
  OpsLensReleaseEvidenceRefreshReadiness,
  OpsLensReleaseEvidenceRefreshSummary,
  OpsLensReleaseEvidenceBundleReadiness,
  OpsLensReleaseEvidenceBundleSummary,
  OpsLensRemediationProposal,
  OpsLensSecurityScanPlanSummary,
  OpsLensSecurityScanReadiness,
  OpsLensRagIngestionApprovalPlanSummary,
  OpsLensRuntimeDependencyReadiness,
  OpsLensRuntimeReadiness,
  OpsLensRuntimeReadinessStatus,
  OpsLensRuntimeRagAudit,
  OpsLensRagApprovalQueueIngestionPlanRequest,
  OpsLensRagApprovalQueueIngestionPlanResponse,
  OpsLensRagApprovalQueueInventoryResponse,
  OpsLensRagApprovalQueueReviewRequest,
  OpsLensRagApprovalQueueReviewResponse,
  OpsLensRagApprovalQueueSubmitRequest,
  OpsLensRagApprovalQueueSubmissionResponse,
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
import { retrieveRuntimeRagCitations } from "./runtimeRag";

const sensitivePattern =
  /(token|password|passwd|secret|api[_-]?key|bearer\s+[a-z0-9._-]+)/gi;
const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "../../..");
const runbookRoot = join(repoRoot, "data/runbooks");
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

function opsLensDashboardLinks(namespace?: string, workload?: string) {
  return uniqueStrings([
    ...consoleLinks(namespace, workload),
    "/opslens",
    "/opslens/cluster-health",
    "/opslens/playbooks",
    "/opslens/admin"
  ]);
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

function mcpToolCategory(tool: OpsLensToolName): OpsLensMcpToolCategory {
  switch (tool) {
    case "get_cluster_signal":
      return "cluster-signal";
    case "retrieve_customer_knowledge":
      return "private-rag";
    case "generate_playbook":
      return "playbook";
    case "open_console_deep_link":
      return "console-navigation";
    case "run_preflight":
      return "preflight";
    case "propose_remediation":
      return "plan-only-remediation";
  }
}

function mcpToolDashboardSurface(
  tool: OpsLensToolName
): OpsLensMcpToolSurfaceItem["dashboardSurface"] {
  switch (tool) {
    case "open_console_deep_link":
      return "openshift-console";
    case "run_preflight":
      return "install-readiness";
    case "retrieve_customer_knowledge":
      return "ops-lens-dashboard";
    default:
      return "lightspeed-assistant";
  }
}

function mcpToolActionMode(
  tool: OpsLensToolName
): OpsLensMcpToolSurfaceItem["actionMode"] {
  return tool === "propose_remediation" ? "planOnly" : "readOnly";
}

type LightspeedRoutingEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  mutationAllowed?: boolean;
  rawDocumentReturned?: boolean;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  score?: {
    selectedPasses?: number;
    responsePasses?: number;
    total?: number;
    threshold?: number;
  };
  missingEvidence?: string[];
};

type LightspeedTrojanHorseEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  mutationAllowed?: boolean;
  rawDocumentReturned?: boolean;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  vectorWriteAttempted?: boolean;
  ingestionJobCreated?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  scenario?: {
    userQuestion?: string;
    selectedTool?: string;
  };
  primaryCall?: {
    passed?: boolean;
    citationCount?: number;
    customerRunbookCitationFound?: boolean;
  };
  redactionProbe?: {
    passed?: boolean;
    redactedSecret?: boolean;
  };
  policy?: {
    privateRag?: boolean;
    rawDocumentReturned?: boolean;
    mcpTechnologyPreview?: boolean;
    mutationAllowed?: boolean;
  };
  missingEvidence?: string[];
};

function lightspeedRoutingEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_ROUTING_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-lightspeed-tool-routing.json")
  );
}

function lightspeedTrojanHorseEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_TROJAN_HORSE_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-lightspeed-trojan-horse.json")
  );
}

function getLightspeedRoutingScore(): OpsLensAdminOverviewResponse["lightspeed"]["mcp"]["routing"] {
  const evidencePath = lightspeedRoutingEvidencePath();
  const missingEvidence = [
    `Lightspeed routing evidence is missing at ${evidencePath}`,
    "run npm run verify:lightspeed:routing to create the 10-question routing score"
  ];

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      artifactStatus: "missing",
      selectedPasses: 0,
      responsePasses: 0,
      total: 10,
      threshold: 8,
      headSha: "missing",
      worktreeDirty: false,
      evidence: [
        "Lightspeed routing score is not available yet",
        "dashboard reports missing evidence instead of assuming live model/tool routing quality"
      ],
      missingEvidence
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LightspeedRoutingEvidenceArtifact;
    const selectedPasses = Number(artifact.score?.selectedPasses ?? 0);
    const responsePasses = Number(artifact.score?.responsePasses ?? 0);
    const total = Number(artifact.score?.total ?? 0);
    const threshold = Number(artifact.score?.threshold ?? 8);
    const unsafe =
      artifact.mutationAllowed !== false ||
      artifact.rawDocumentReturned !== false ||
      artifact.clusterMutationAttempted === true ||
      artifact.registryMutationAttempted === true;
    const status =
      artifact.status !== "PASS" || unsafe || selectedPasses < threshold || responsePasses < threshold
        ? "failed"
        : artifact.ref?.worktreeDirty === true
          ? "needs-evidence"
          : "pass";

    return {
      status,
      artifactStatus: artifact.status ?? "unknown",
      selectedPasses,
      responsePasses,
      total,
      threshold,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      evidence: [
        `Lightspeed routing evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `routing score selected=${selectedPasses}/${total} responses=${responsePasses}/${total} threshold=${threshold}`,
        "regenerate with npm run verify:lightspeed:routing",
        `routing generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"}`,
        "routing verifier performs local JSON-RPC tools/list and tools/call only; it does not patch OLSConfig or mutate the cluster"
      ],
      missingEvidence: artifact.missingEvidence ?? []
    };
  } catch (error) {
    return {
      status: "failed",
      artifactStatus: "invalid",
      selectedPasses: 0,
      responsePasses: 0,
      total: 10,
      threshold: 8,
      headSha: "unknown",
      worktreeDirty: false,
      evidence: [
        `Lightspeed routing evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid routing evidence blocks overclaiming Lightspeed tool-routing quality"
      ],
      missingEvidence: [
        "regenerate routing evidence with npm run verify:lightspeed:routing"
      ]
    };
  }
}

function getLightspeedTrojanHorseProof(): OpsLensAdminOverviewResponse["lightspeed"]["mcp"]["trojanHorse"] {
  const evidencePath = lightspeedTrojanHorseEvidencePath();
  const exactQuestion = "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘";
  const missingEvidence = [
    `Lightspeed Trojan Horse evidence is missing at ${evidencePath}`,
    "run npm run verify:lightspeed:trojan-horse to prove the exact Stage 1 custom question"
  ];

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      artifactStatus: "missing",
      question: exactQuestion,
      selectedTool: "missing",
      citationCount: 0,
      redactionPassed: false,
      mutationAllowed: true,
      rawDocumentReturned: true,
      clusterMutationAttempted: false,
      vectorWriteAttempted: false,
      headSha: "missing",
      worktreeDirty: false,
      evidence: [
        "Lightspeed Trojan Horse exact-question proof is not available yet",
        "dashboard reports missing evidence instead of assuming the custom question works"
      ],
      missingEvidence
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LightspeedTrojanHorseEvidenceArtifact;
    const mutationAllowed =
      artifact.policy?.mutationAllowed ?? artifact.mutationAllowed ?? true;
    const rawDocumentReturned =
      artifact.policy?.rawDocumentReturned ?? artifact.rawDocumentReturned ?? true;
    const clusterMutationAttempted = artifact.clusterMutationAttempted === true;
    const vectorWriteAttempted = artifact.vectorWriteAttempted === true;
    const redactionPassed =
      artifact.redactionProbe?.passed === true &&
      artifact.redactionProbe?.redactedSecret === true;
    const citationCount = Number(artifact.primaryCall?.citationCount ?? 0);
    const unsafe =
      artifact.status !== "PASS" ||
      artifact.scenario?.userQuestion !== exactQuestion ||
      artifact.scenario?.selectedTool !== "generate_playbook" ||
      artifact.primaryCall?.passed !== true ||
      artifact.primaryCall?.customerRunbookCitationFound !== true ||
      !redactionPassed ||
      mutationAllowed !== false ||
      rawDocumentReturned !== false ||
      clusterMutationAttempted ||
      vectorWriteAttempted ||
      artifact.registryMutationAttempted === true ||
      artifact.ingestionJobCreated === true ||
      artifact.mutationAllowedByThisVerifier === true;
    const status = unsafe
      ? "failed"
      : artifact.ref?.worktreeDirty === true
        ? "needs-evidence"
        : "pass";

    return {
      status,
      artifactStatus: artifact.status ?? "unknown",
      question: artifact.scenario?.userQuestion ?? exactQuestion,
      selectedTool: artifact.scenario?.selectedTool ?? "unknown",
      citationCount,
      redactionPassed,
      mutationAllowed: mutationAllowed === true,
      rawDocumentReturned: rawDocumentReturned === true,
      clusterMutationAttempted,
      vectorWriteAttempted,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      evidence: [
        `Lightspeed Trojan Horse evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `exact question selected ${artifact.scenario?.selectedTool ?? "unknown"} citations=${citationCount}`,
        "regenerate with npm run verify:lightspeed:trojan-horse",
        `Trojan Horse generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"}`,
        "Trojan Horse verifier performs local JSON-RPC /mcp tools/list and tools/call only; it does not patch OLSConfig, write vectors, or mutate the cluster"
      ],
      missingEvidence: artifact.missingEvidence ?? []
    };
  } catch (error) {
    return {
      status: "failed",
      artifactStatus: "invalid",
      question: exactQuestion,
      selectedTool: "unknown",
      citationCount: 0,
      redactionPassed: false,
      mutationAllowed: true,
      rawDocumentReturned: true,
      clusterMutationAttempted: false,
      vectorWriteAttempted: false,
      headSha: "unknown",
      worktreeDirty: false,
      evidence: [
        `Lightspeed Trojan Horse evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid Trojan Horse evidence blocks overclaiming the exact custom question"
      ],
      missingEvidence: [
        "regenerate Trojan Horse evidence with npm run verify:lightspeed:trojan-horse"
      ]
    };
  }
}

function getLightspeedToolSurface(): OpsLensAdminOverviewResponse["lightspeed"] {
  const tools: OpsLensMcpToolSurfaceItem[] = opsLensMcpTools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    category: mcpToolCategory(tool.name),
    actionMode: mcpToolActionMode(tool.name),
    readOnly: true,
    approvalRequired: false,
    destructive: false,
    dashboardSurface: mcpToolDashboardSurface(tool.name),
    evidence: [
      `tool profile=${tool.name}`,
      "readOnlyHint=true",
      "destructiveHint=false",
      "mutationAllowed=false"
    ]
  }));

  return {
    mcp: {
      mcpTechnologyPreview: true,
      endpoint: "/mcp",
      localEndpoint: "/api/opslens/mcp",
      toolCount: tools.length,
      readOnlyCount: tools.filter((tool) => tool.readOnly).length,
      mutatingToolExcluded: true,
      excludedTools: ["apply_remediation"],
      routing: getLightspeedRoutingScore(),
      trojanHorse: getLightspeedTrojanHorseProof(),
      tools,
      evidence: [
        "OpenShift Lightspeed custom MCP server is the supported extension point for tool calls",
        "AC-LS-001 verifies tools/list and tools/call for the MVP read-only tool surface",
        "exact Trojan Horse question proof comes from npm run verify:lightspeed:trojan-horse",
        "routing score comes from npm run verify:lightspeed:routing and the 10-question / 8-pass fixture",
        "all MVP tools keep approvalRequired=false and destructive=false",
        "apply_remediation is deliberately excluded from the MVP tool catalog",
        "tool responses include citations, missingEvidence, risks, rollbackPath, and audit.runtimeRag"
      ]
    }
  };
}

function toolResponseProfile(params: {
  tool: OpsLensToolName;
  namespace: string;
  workload: string;
  question: string;
  citations: OpsLensCitation[];
  runtimeRagAudit: OpsLensRuntimeRagAudit;
}) {
  const baseMissingEvidence = [
    "실제 Pod 로그 10분 tail",
    "최근 Deployment/ConfigMap/Secret diff",
    "프로메테우스 알람 fingerprint와 Alertmanager route",
    "DB dependency 상태",
    ...params.runtimeRagAudit.missingEvidence
  ];
  const baseRisks = [
    "MCP 기능은 OpenShift Lightspeed에서 Technology Preview이므로 운영 SLA 경로가 아니다.",
    "MCP 응답은 고객 데이터 정책 집행을 Cywell 서버에서 끝낸 뒤 최소 스니펫만 반환해야 한다.",
    "자동 apply/delete/scale 없이 planOnly 또는 readOnly로만 응답한다."
  ];
  const baseRollbackPath = [
    "현재 상태 스냅샷과 정상 revision을 기록한다.",
    "원인이 확인되지 않으면 자동 rollback하지 않는다.",
    "승인된 GitOps PR로만 rollback 또는 YAML 변경을 진행한다.",
    "변경 후 alert, pod readiness, error rate를 재확인한다."
  ];
  const baseEvidence = [
    "tool catalog excludes mutating tools",
    "private RAG citations are loaded from tenant-scoped Markdown corpus as snippet-only redacted evidence",
    `runtime RAG status=${params.runtimeRagAudit.status} mode=${params.runtimeRagAudit.mode} citations=${params.runtimeRagAudit.citationsUsed}`,
    ...params.runtimeRagAudit.evidence,
    "response includes missingEvidence, risks, rollbackPath, and audit envelope",
    "caller source is expected to be OpenShift Lightspeed custom MCP server"
  ];

  switch (params.tool) {
    case "get_cluster_signal":
      return {
        summary:
          `${params.namespace}/${params.workload}에 대해 read-only cluster signal 수집 계획을 생성했습니다. ` +
          `질문: ${params.question}`,
        suspectedCauses: [
          "워크로드 rollout, readiness probe, 이벤트, 최근 로그 중 하나 이상에서 장애 신호가 있을 수 있음",
          "사용자 RBAC로 읽을 수 없는 리소스가 있으면 missingEvidence로 남아야 함",
          "Prometheus/Alertmanager 연결이 없으면 metric signal은 추정하지 않음"
        ],
        recommendedSteps: [
          `${params.namespace} namespace의 Pod 상태, restart count, 이벤트를 같은 시간창에서 확인한다.`,
          `${params.workload} Deployment의 현재 revision과 최근 rollout history를 비교한다.`,
          "SelfSubjectAccessReview 결과로 사용자가 읽을 수 있는 리소스만 진단한다.",
          "metric/log/event가 부족하면 원인 단정 대신 missingEvidence를 남긴다."
        ],
        missingEvidence: uniqueStrings([
          ...baseMissingEvidence,
          "SelfSubjectAccessReview 결과",
          "ClusterOperator/Node 상태 요약"
        ]),
        risks: baseRisks,
        rollbackPath: baseRollbackPath,
        consoleLinks: consoleLinks(params.namespace, params.workload),
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=get_cluster_signal",
          "cluster signal output is read-only and RBAC-aware"
        ])
      };
    case "retrieve_customer_knowledge":
      return {
        summary:
          `${params.namespace}/${params.workload} 질문에 대해 Cywell private RAG에서 승인된 고객 지식 스니펫만 검색했습니다. ` +
          `질문: ${params.question}`,
        suspectedCauses: [
          "고객 runbook에 정의된 Secret/ConfigMap 누락 점검 절차가 필요할 수 있음",
          "승인된 rollback 기준과 현재 rollout 상태가 맞지 않을 수 있음",
          "RAG citation이 부족하면 고객 문서 근거가 아직 검증되지 않은 상태임"
        ],
        recommendedSteps: [
          "반환된 citation id와 snippet만 근거로 사용하고 원문 문서는 반환하지 않는다.",
          "tenantId와 사용자/그룹 정책이 맞는지 감사 로그로 남긴다.",
          "citation이 없거나 runtime RAG가 실패하면 local fallback 및 missingEvidence를 사용자에게 보여준다.",
          "운영 조치는 고객 승인 runbook과 별도 human review를 거친다."
        ],
        missingEvidence: uniqueStrings([
          ...params.runtimeRagAudit.missingEvidence,
          ...(params.citations.length > 0
            ? []
            : ["approved customer runbook citation was not found"])
        ]),
        risks: baseRisks,
        rollbackPath: [
          "RAG 답변이 부정확하면 CYWELL_OPSLENS_RAG_RUNTIME_MODE=local로 되돌린다.",
          "승인되지 않은 문서가 citation에 섞이면 해당 문서를 색인에서 제거하고 evidence를 재생성한다.",
          ...baseRollbackPath
        ],
        consoleLinks: opsLensDashboardLinks(params.namespace, params.workload),
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=retrieve_customer_knowledge",
          "rawDocumentReturned=false for customer knowledge retrieval"
        ])
      };
    case "open_console_deep_link":
      return {
        summary:
          `${params.namespace}/${params.workload} 조사를 위해 OpenShift Console과 OpsLens 대시보드 deep link를 생성했습니다.`,
        suspectedCauses: [
          "장애 원인은 링크 대상 화면의 Pod, 이벤트, Deployment, 로그 evidence를 확인해야 확정 가능",
          "deep link는 조사 동선을 제공할 뿐 원인 판정을 대신하지 않음"
        ],
        recommendedSteps: [
          "Deployment 링크에서 rollout revision과 replica 상태를 확인한다.",
          "Pod 링크에서 restart count, container status, readiness probe 실패를 확인한다.",
          "Events 링크에서 alert 발생 시각 주변의 Warning 이벤트를 비교한다.",
          "OpsLens Admin 링크에서 RAG/runtime/checkpoint evidence 상태를 확인한다."
        ],
        missingEvidence: [
          "실제 Console route hostname",
          "사용자별 ConsolePlugin 활성화 상태",
          "대상 리소스에 대한 사용자 RBAC 확인"
        ],
        risks: baseRisks,
        rollbackPath: [
          "잘못된 deep link는 리소스 변경 없이 링크 생성 규칙만 되돌린다.",
          "ConsolePlugin이 비활성화되면 Lightspeed MCP 응답의 텍스트 링크와 REST API를 유지한다."
        ],
        consoleLinks: opsLensDashboardLinks(params.namespace, params.workload),
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=open_console_deep_link",
          "deep links are generated as navigation aids only and never mutate cluster state"
        ])
      };
    case "run_preflight":
      return {
        summary:
          "Cywell OpsLens 설치/연동 전 read-only preflight checklist를 생성했습니다.",
        suspectedCauses: [
          "Lightspeed MCP CRD/OLSConfig live reachability가 아직 증명되지 않았을 수 있음",
          "external vLLM/Qdrant image certification evidence가 아직 부족할 수 있음",
          "release/install approval evidence가 없으면 실제 배포는 진행하면 안 됨"
        ],
        recommendedSteps: [
          "npm run verify:runtime-rag:fixture로 hybrid runtime RAG 성공 경로를 먼저 검증한다.",
          "npm run verify:operator와 npm run verify:operator:runtime으로 Operator/Go skeleton parity를 확인한다.",
          "npm run verify:lightspeed -- --mcp-url <installed-mcp-url> --require-mcp는 live endpoint가 열릴 때만 실행한다.",
          "npm run verify:evidence-checkpoint에서 PASS 또는 명시적 NEEDS_EVIDENCE만 남는지 확인한다."
        ],
        missingEvidence: [
          "live OCP API /version response",
          "live OLSConfig CRD and cluster OLSConfig read",
          "live MCP /mcp tools/list and tools/call proof",
          "external vLLM/Qdrant certification, SBOM, provenance, mirror digest evidence",
          "human approval for install, OLSConfig patch, image push/sign/mirror"
        ],
        risks: [
          ...baseRisks,
          "preflight가 WARN/NEEDS_EVIDENCE인 상태에서 install/apply/push/sign/mirror를 진행하면 제품 release gate를 우회하게 된다."
        ],
        rollbackPath: [
          "preflight가 실패하면 설치를 멈추고 evidence artifact를 같은 Git HEAD에서 재생성한다.",
          "OLSConfig patch는 PatchOLSConfig preview와 rollback path가 확인된 뒤에만 human approval로 진행한다.",
          "release artifact가 stale이면 해당 lane verifier를 다시 실행한다."
        ],
        consoleLinks: ["/opslens/admin", "/opslens/cluster-health"],
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=run_preflight",
          "preflight tool returns commands and evidence gaps only; it does not execute install or patch commands"
        ])
      };
    case "propose_remediation":
      return {
        summary:
          `${params.namespace}/${params.workload}에 대해 plan-only remediation proposal을 생성했습니다. ` +
          `질문: ${params.question}`,
        suspectedCauses: [
          "최근 rollout 이후 필수 환경변수 또는 Secret key가 누락됐을 가능성",
          "readiness probe 실패가 재시작 루프를 증폭했을 가능성",
          "DB 연결 설정 변경 또는 외부 dependency 장애 가능성"
        ],
        recommendedSteps: [
          `OpenShift 콘솔에서 ${params.namespace} namespace의 ${params.workload} Pod 이벤트와 최근 로그 10분을 확인한다.`,
          "고객 승인 runbook에 따라 필수 환경변수와 Secret key 존재 여부를 비교한다.",
          "YAML patch는 review artifact로만 사용하고 자동 apply/delete/scale은 수행하지 않는다.",
          "원인과 blast radius가 확인되면 승인된 GitOps PR을 생성한다."
        ],
        missingEvidence: uniqueStrings(baseMissingEvidence),
        risks: baseRisks,
        rollbackPath: baseRollbackPath,
        consoleLinks: consoleLinks(params.namespace, params.workload),
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=propose_remediation",
          "remediation output is planOnly and requires human review"
        ])
      };
    case "generate_playbook":
    default:
      return {
        summary:
          `${params.namespace}/${params.workload} 장애 질문에 대해 Cywell private RAG와 read-only cluster signal을 결합했습니다. ` +
          `질문: ${params.question}`,
        suspectedCauses: [
          "최근 rollout 이후 필수 환경변수 또는 Secret key가 누락됐을 가능성",
          "readiness probe 실패가 재시작 루프를 증폭했을 가능성",
          "DB 연결 설정 변경 또는 외부 dependency 장애 가능성"
        ],
        recommendedSteps: [
          `OpenShift 콘솔에서 ${params.namespace} namespace의 ${params.workload} Pod 이벤트와 최근 로그 10분을 확인한다.`,
          "고객 승인 runbook에 따라 필수 환경변수와 Secret key 존재 여부를 비교한다.",
          "최근 GitOps/rollout 변경과 정상 revision을 비교하되 자동 rollback은 수행하지 않는다.",
          "원인과 blast radius가 확인되면 승인된 변경 경로로 YAML patch 또는 rollback PR을 생성한다."
        ],
        missingEvidence: uniqueStrings(baseMissingEvidence),
        risks: baseRisks,
        rollbackPath: baseRollbackPath,
        consoleLinks: consoleLinks(params.namespace, params.workload),
        evidence: uniqueStrings([
          ...baseEvidence,
          "tool profile=generate_playbook"
        ])
      };
  }
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

function envBoolean(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeProbePath(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function joinEndpoint(baseUrl: string, probePath: string) {
  return `${trimTrailingSlash(baseUrl)}${normalizeProbePath(probePath)}`;
}

function runtimeProbeTimeoutMs() {
  const timeout = Number(process.env.CYWELL_OPSLENS_RUNTIME_PROBE_TIMEOUT_MS ?? 3000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 3000;
}

function runtimeModelName() {
  return process.env.CYWELL_OPSLENS_MODEL_NAME ?? "Gemma 4 OpsLens route";
}

function runtimeVectorUrl() {
  return process.env.CYWELL_OPSLENS_VECTOR_URL ?? "http://cywell-opslens-vector:6333";
}

function runtimeModelUrl() {
  return process.env.CYWELL_OPSLENS_MODEL_URL ?? "http://cywell-opslens-vllm:8000";
}

function runtimeVectorProbePath() {
  return normalizeProbePath(process.env.CYWELL_OPSLENS_VECTOR_HEALTH_PATH ?? "/healthz");
}

function runtimeModelProbePath() {
  return normalizeProbePath(process.env.CYWELL_OPSLENS_MODEL_HEALTH_PATH ?? "/v1/models");
}

async function probeRuntimeDependency(params: {
  component: OpsLensRuntimeDependencyReadiness["component"];
  provider: OpsLensRuntimeDependencyReadiness["provider"];
  endpoint: string;
  probePath: string;
  liveProbeEnabled: boolean;
}): Promise<OpsLensRuntimeDependencyReadiness> {
  const baseEvidence = [
    `${params.component} provider=${params.provider}`,
    `${params.component} endpoint=${params.endpoint}`,
    `${params.component} probe path=${params.probePath}`
  ];

  if (!params.liveProbeEnabled) {
    return {
      component: params.component,
      provider: params.provider,
      endpoint: params.endpoint,
      probePath: params.probePath,
      status: "needs-live-check",
      liveProbeEnabled: false,
      evidence: [
        ...baseEvidence,
        "live runtime probe is disabled by default; set CYWELL_OPSLENS_RUNTIME_PROBE_LIVE=true to verify this dependency"
      ],
      missingEvidence: [
        `${params.component} live readiness was not probed`
      ]
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), runtimeProbeTimeoutMs());

  try {
    const response = await fetch(joinEndpoint(params.endpoint, params.probePath), {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*"
      }
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const status: OpsLensRuntimeReadinessStatus = response.ok ? "ready" : "degraded";

    return {
      component: params.component,
      provider: params.provider,
      endpoint: params.endpoint,
      probePath: params.probePath,
      status,
      liveProbeEnabled: true,
      latencyMs,
      evidence: [
        ...baseEvidence,
        `${params.component} live probe httpStatus=${response.status}`,
        `${params.component} live probe latencyMs=${latencyMs}`
      ],
      missingEvidence: response.ok
        ? []
        : [`${params.component} live probe returned HTTP ${response.status}`]
    };
  } catch (error) {
    return {
      component: params.component,
      provider: params.provider,
      endpoint: params.endpoint,
      probePath: params.probePath,
      status: "failed",
      liveProbeEnabled: true,
      latencyMs: Math.max(1, Date.now() - startedAt),
      evidence: baseEvidence,
      missingEvidence: [
        `${params.component} live probe failed: ${error instanceof Error ? error.message : String(error)}`
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}

function combineRuntimeStatus(
  vectorStore: OpsLensRuntimeDependencyReadiness,
  modelRuntime: OpsLensRuntimeDependencyReadiness
): OpsLensRuntimeReadinessStatus {
  const statuses = [vectorStore.status, modelRuntime.status];
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.includes("needs-live-check")) return "needs-live-check";
  return "ready";
}

export async function getOpsLensRuntimeReadiness(): Promise<OpsLensRuntimeReadiness> {
  const liveProbeEnabled = envBoolean("CYWELL_OPSLENS_RUNTIME_PROBE_LIVE", false);
  const vectorStore = await probeRuntimeDependency({
    component: "vector-store",
    provider: "qdrant",
    endpoint: runtimeVectorUrl(),
    probePath: runtimeVectorProbePath(),
    liveProbeEnabled
  });
  const modelRuntime = await probeRuntimeDependency({
    component: "model-runtime",
    provider: "vllm",
    endpoint: runtimeModelUrl(),
    probePath: runtimeModelProbePath(),
    liveProbeEnabled
  });
  const status = combineRuntimeStatus(vectorStore, modelRuntime);
  const missingEvidence = uniqueStrings([
    ...vectorStore.missingEvidence,
    ...modelRuntime.missingEvidence
  ]);

  return {
    status,
    actionMode: "readOnly",
    mutationAllowed: false,
    rawDocumentReturned: false,
    vectorStore,
    modelRuntime,
    evidence: [
      `runtime readiness status=${status}`,
      `liveProbeEnabled=${String(liveProbeEnabled)}`,
      `model=${runtimeModelName()}`,
      ...vectorStore.evidence,
      ...modelRuntime.evidence
    ],
    missingEvidence,
    risk: [
      "A ready runtime probe proves endpoint reachability only; model quality, tenant isolation, and citation accuracy still require separate evaluation.",
      "Qdrant and vLLM runtime images require certification, vulnerability scan, SBOM, provenance, mirror digest, and approval evidence before Certified Operator submission.",
      "Runtime readiness never permits apply/delete/scale or registry mutation."
    ],
    rollbackPath: [
      "Disable live probes by setting CYWELL_OPSLENS_RUNTIME_PROBE_LIVE=false if runtime checks are noisy during installation.",
      "Restore the previous OpsLensInstallation runtime image references if a new runtime image fails readiness.",
      "Regenerate runtime, image, release, and install evidence after changing vLLM or Qdrant endpoints."
    ]
  };
}

type LightspeedReadinessEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  currentGap?: {
    classification?: string;
    owner?: string;
    evidence?: string;
    nextCommand?: string;
  };
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

type ImageBuildReadinessEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  branch?: string;
  headSha?: string;
  baseRef?: string;
  worktreeDirty?: boolean;
  dockerAvailable?: boolean;
  internalBuilds?: Array<{
    name?: string;
    image?: string;
  }>;
  packagingBuilds?: Array<{
    name?: string;
    image?: string;
  }>;
  externalImages?: Array<{
    name?: string;
    image?: string;
    certificationEvidenceRequired?: boolean;
  }>;
  actualBuildRequested?: boolean;
  actualBuilds?: Array<{
    name?: string;
    status?: string;
    durationSeconds?: number;
    blockedBy?: string;
  }>;
};

type OwnedImageProvenanceEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  requiredImages?: string[];
  summary?: {
    requiredPassed?: boolean;
    inspectedCount?: number;
    repoDigestsPresent?: boolean;
  };
  images?: Array<{
    name?: string;
    image?: string;
    localTag?: string;
    status?: string;
    imageId?: string;
    repoDigests?: string[];
    user?: string;
    rootfsLayerCount?: number;
  }>;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type ExternalRuntimeImagesPlanEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  requiredApprovals?: string[];
  externalImages?: Array<{
    name?: string;
    image?: string;
    sourceType?: string;
    desiredMirror?: string;
    status?: string;
    draft?: {
      status?: string;
      evidenceState?: string;
      missingEvidence?: string[];
    };
  }>;
  evidenceTemplates?: Array<{
    name?: string;
    templatePath?: string;
    status?: string;
  }>;
  evidenceDrafts?: Array<{
    name?: string;
    draftFile?: string;
    status?: string;
    evidenceState?: string;
    missingEvidence?: string[];
  }>;
  commands?: Array<{
    id?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  risk?: string[];
  rollbackPath?: string[];
  missingEvidence?: string[];
};

type ExternalRuntimeReviewPacketEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  markdownOut?: string;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  requiredApprovals?: string[];
  images?: Array<{
    name?: string;
    image?: string;
    sourceDigest?: string;
    sourceDigestInspection?: {
      status?: string;
      detail?: string;
    };
    draftStatus?: string;
    evidenceState?: string;
    finalEvidence?: {
      exists?: boolean;
      status?: string;
    };
    candidateMatrix?: {
      status?: string;
      matrixStatus?: string;
      bestCandidate?: {
        label?: string;
        image?: string;
        status?: string;
        releaseEligible?: boolean;
        criticalFindings?: number | string;
        highFindings?: number | string;
        mediumFindings?: number | string;
        lowFindings?: number | string;
        reviewDecision?: string;
      };
      zeroCriticalCandidates?: Array<unknown>;
      recommendation?: string;
      missingEvidence?: string[];
    };
    reviewerRequests?: Array<{
      role?: string;
      request?: string;
      evidenceNeeded?: string;
      nextCommand?: string;
    }>;
    missingEvidence?: string[];
  }>;
  readOnlyCommands?: Array<{
    id?: string;
    phase?: string;
    mutation?: boolean;
    writesLocalEvidence?: boolean;
  }>;
  approvalGatedCommands?: Array<{
    id?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type OperatorDryRunEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  policy?: {
    clusterMutationAttempted?: boolean;
    command?: string;
  };
  results?: Array<{
    status?: string;
    label?: string;
    namespace?: string;
    reason?: string;
  }>;
  missingEvidence?: string[];
};

type InstallApprovalPlanEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  requiredApprovals?: string[];
  lightspeedRegistration?: {
    actionMode?: string;
    status?: string;
    phase?: string;
    mode?: string;
    configResourceKind?: string;
    target?: {
      namespace?: string;
      name?: string;
    };
    desiredServer?: {
      name?: string;
      url?: string;
    };
    willPatch?: boolean;
    operatorMutationAllowedByMode?: boolean;
    clusterMutationAttempted?: boolean;
    mutationAllowedByThisVerifier?: boolean;
    legacyConfigMapMutationAttempted?: boolean;
    readOnlyCommands?: Array<{
      id?: string;
      command?: string;
    }>;
    evidence?: string[];
    risk?: string[];
    rollbackPath?: string[];
    missingEvidence?: string[];
  };
  ragIngestion?: {
    actionMode?: string;
    status?: string;
    queueEvidenceStatus?: string;
    approvedPlanStatus?: string;
    clusterMutationAttempted?: boolean;
    vectorWriteAttempted?: boolean;
    ingestionJobCreated?: boolean;
    mutationAllowedByThisVerifier?: boolean;
    requiredApprovals?: string[];
    mutatingCommands?: Array<{
      id?: string;
      phase?: string;
      requiresExplicitApproval?: boolean;
    }>;
    risk?: string[];
    rollbackPath?: string[];
    missingEvidence?: string[];
  };
  commands?: Array<{
    id?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  risk?: string[];
  rollbackPath?: string[];
  missingEvidence?: string[];
};

type ReleasePublishPlanEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  requiredApprovals?: string[];
  publishImages?: Array<{
    name?: string;
    image?: string;
    source?: string;
  }>;
  commands?: Array<{
    id?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  risk?: string[];
  rollbackPath?: string[];
  missingEvidence?: string[];
};

type CertificationReadinessEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  gates?: {
    internalCatalog?: Array<{
      status?: string;
      name?: string;
      detail?: string;
    }>;
    communityOperator?: Array<{
      status?: string;
      name?: string;
      detail?: string;
    }>;
    certifiedOperator?: Array<{
      status?: string;
      name?: string;
      detail?: string;
    }>;
  };
  cli?: Array<{
    name?: string;
    available?: boolean;
    version?: string;
    requiredForExternalSubmission?: boolean;
  }>;
  toolingHandoff?: {
    actionMode?: string;
    status?: string;
    requiredTools?: Array<{
      name?: string;
      available?: boolean;
      version?: string;
      requiredForExternalSubmission?: boolean;
    }>;
    missingRequiredTools?: string[];
    readOnlyCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresNetwork?: boolean;
    }>;
    setupCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresNetwork?: boolean;
      requiresHumanApproval?: boolean;
    }>;
    approvalGatedCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    }>;
    nextCommands?: string[];
    risk?: string[];
    rollbackPath?: string[];
  };
  documents?: Record<string, string>;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type CatalogToolchainEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  cli?: Array<{
    name?: string;
    available?: boolean;
    version?: string;
  }>;
  registryAuth?: {
    configured?: boolean;
  };
  commands?: {
    readOnly?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
    }>;
    setup?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      requiresHumanSecretInput?: boolean;
      mutation?: boolean;
    }>;
    localArtifact?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
    }>;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type SecurityScanPlanEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  cli?: Array<{
    name?: string;
    available?: boolean;
    version?: string;
  }>;
  images?: Array<{
    name?: string;
    image?: string;
    required?: boolean;
    source?: string;
    securityEvidence?: {
      vulnerabilityReportExists?: boolean;
      sbomExists?: boolean;
      reviewExists?: boolean;
      reviewDraft?: {
        exists?: boolean;
        evidenceState?: string;
        sameHead?: boolean;
        reviewerProvided?: boolean;
        ticketProvided?: boolean;
        readyForFinalReview?: boolean;
        draftPath?: string;
        finalEvidenceFile?: string;
        missingEvidence?: string[];
      };
    };
  }>;
  commands?: {
    readOnly?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
      writesLocalEvidence?: boolean;
    }>;
    setup?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
    }>;
    approvalGated?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    }>;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type ReleaseEvidenceRefreshArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  localDockerBuildAllowed?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  commands?: Array<{
    id?: string;
    phase?: string;
    status?: string;
    exitCode?: number | null;
    expectedNonZero?: boolean;
  }>;
  artifacts?: Array<{
    id?: string;
    status?: string;
    fresh?: boolean;
    headSha?: string;
    worktreeDirty?: boolean | string;
  }>;
  actionQueue?: {
    status?: string;
    ownerPacketCount?: number;
    ownerPacketsReady?: boolean;
    missingOwnerPackets?: string[];
    ownerPacketCleanup?: {
      dir?: string;
      expectedFiles?: string[];
      staleRemoved?: string[];
      deletionAllowed?: boolean;
    };
    ownerPackets?: Array<{
      owner?: string;
      status?: string;
      markdownPath?: string;
      exists?: boolean;
      open?: number;
      blocker?: number;
      high?: number;
      approvalGatedCommandCount?: number;
      mutationAllowedByThisVerifier?: boolean;
    }>;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type ReleaseEvidenceBundleArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  markdownOut?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  decision?: {
    publishReady?: boolean;
    installReady?: boolean;
    roadmapComplete?: boolean;
    checkpointStatus?: string;
    releaseStatus?: string;
    installStatus?: string;
    roadmapStatus?: string;
  };
  approvals?: Record<string, string[]>;
  sources?: Array<{
    id?: string;
    status?: string;
    fresh?: boolean;
    acceptable?: boolean;
    mutationViolation?: boolean;
  }>;
  commands?: {
    readOnly?: unknown[];
    mutatingApprovalRequired?: unknown[];
  };
  mutationBoundary?: {
    passed?: boolean;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type ReleaseActionQueueArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  markdownOut?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  owners?: Array<{
    owner?: string;
    open?: number;
    blocker?: number;
    high?: number;
    normal?: number;
  }>;
  ownerPackets?: Array<{
    owner?: string;
    status?: string;
    markdownPath?: string;
    open?: number;
    blocker?: number;
    high?: number;
    normal?: number;
    itemIds?: string[];
    nextCommands?: string[];
    setupCommandIds?: string[];
    readOnlyCommandIds?: string[];
    approvalGatedCommandIds?: string[];
    missingRequiredTools?: string[];
    blockedBy?: string[];
    acceptance?: string[];
    mutationAllowedByThisVerifier?: boolean;
  }>;
  ownerPacketCleanup?: {
    dir?: string;
    expectedFiles?: string[];
    staleRemoved?: string[];
    deletionAllowed?: boolean;
  };
  items?: Array<{
    id?: string;
    owner?: string;
    priority?: string;
    source?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    handoffNextCommands?: string[];
    setupCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresNetwork?: boolean;
      requiresHumanApproval?: boolean;
    }>;
    readOnlyCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresNetwork?: boolean;
      writesLocalEvidence?: boolean;
    }>;
    approvalGatedCommands?: Array<{
      id?: string;
      command?: string;
      phase?: string;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    }>;
    missingRequiredTools?: string[];
  }>;
  sourceArtifacts?: Array<{
    id?: string;
    status?: string;
    fresh?: boolean;
    required?: boolean;
    mutationViolation?: boolean;
  }>;
  readOnlyCommands?: unknown[];
  approvalGatedCommands?: unknown[];
  mutationBoundary?: {
    passed?: boolean;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type EvidenceCheckpointArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  lanes?: Array<{
    id?: string;
    label?: string;
    status?: string;
    artifactStatus?: string;
  }>;
  missingEvidence?: string[];
  blockers?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type AiopsIncidentPipelineArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  vectorWriteAttempted?: boolean;
  ingestionJobCreated?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  acceptance?: string[];
  pipeline?: {
    requiredMetricQueries?: string[];
    triggerEvidenceRequired?: string[];
  };
  liveSmoke?: {
    status?: string;
    selectedPod?: {
      namespace?: string;
      name?: string;
    };
    incident?: {
      actionMode?: string;
      missingEvidence?: string[];
      metricQueries?: Array<{
        name?: string;
        enabled?: boolean;
        reachable?: boolean;
        sampleCount?: number;
        error?: string;
      }>;
      remediationProposal?: OpsLensRemediationProposal;
    };
    missingEvidence?: string[];
  };
  evidence?: string[];
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type LiveEvidenceHandoffArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  currentGap?: {
    classification?: string;
    actionHints?: Array<{
      id?: string;
      severity?: string;
      summary?: string;
      nextCheck?: string;
    }>;
  };
  readOnlyCommands?: Array<{
    id?: string;
    command?: string;
    purpose?: string;
    phase?: string;
    requiresNetwork?: boolean;
    mutation?: boolean;
    writesEvidence?: boolean;
  }>;
  forbiddenCommands?: string[];
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type OcpNetworkHandoffArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  target?: {
    host?: string;
    port?: number | string;
    redactedBaseUrl?: string;
    tokenConfigured?: boolean;
    tlsVerify?: boolean;
  };
  diagnostics?: {
    classification?: string;
  };
  adminRequests?: string[];
  readOnlyCommands?: Array<{
    id?: string;
    command?: string;
    purpose?: string;
    phase?: string;
    requiresNetwork?: boolean;
    mutation?: boolean;
    writesEvidence?: boolean;
  }>;
  sourceArtifacts?: Array<{
    id?: string;
    label?: string;
    status?: string;
    fresh?: boolean;
    required?: boolean;
    headSha?: string;
    worktreeDirty?: boolean | string;
  }>;
  markdownOut?: string;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type OcpAuthRbacPlanArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: string;
  preferredCredentialMode?: string;
  fallbackCredentialMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  target?: {
    host?: string;
    port?: number | string;
    redactedBaseUrl?: string;
    tokenConfigured?: boolean;
    tlsVerify?: boolean;
  };
  diagnostics?: {
    classification?: string;
  };
  requiredApprovals?: string[];
  rbac?: {
    serviceAccount?: {
      name?: string;
      namespace?: string;
    };
    clusterRole?: {
      name?: string;
      ruleCount?: number;
      resources?: string[];
      verbs?: string[];
      readOnlyOnly?: boolean;
      secretsIncluded?: boolean;
    };
  };
  adminRequests?: string[];
  readOnlyCommands?: Array<{
    id?: string;
    command?: string;
    purpose?: string;
    phase?: string;
    requiresNetwork?: boolean;
    mutation?: boolean;
    writesEvidence?: boolean;
  }>;
  approvalGatedCommands?: Array<{
    id?: string;
    command?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  markdownOut?: string;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type OcpConnectivityDiagnosticArtifact = {
  artifactType?: string;
  status?: string;
  classification?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  target?: {
    host?: string;
    port?: number;
    redactedBaseUrl?: string;
    tokenConfigured?: boolean;
    tlsVerify?: boolean;
  };
  diagnostics?: {
    classification?: string;
    dns?: { status?: string };
    tcp?: { status?: string };
    tls?: { status?: string };
    kubernetesVersion?: { status?: string };
    oc?: {
      clientAvailable?: boolean;
      versionGet?: string;
    };
    rbacAccessReviews?: Array<{
      id?: string;
      verb?: string;
      resource?: string;
      scope?: string;
      status?: string;
      required?: boolean;
      evidence?: string;
      command?: string;
    }>;
  };
  actionHints?: Array<{
    id?: string;
    severity?: string;
    summary?: string;
    evidence?: string;
    nextCheck?: string;
  }>;
  readOnlyTroubleshootingCommands?: Array<{
    id?: string;
    command?: string;
    purpose?: string;
    phase?: string;
    requiresNetwork?: boolean;
    mutation?: boolean;
    writesEvidence?: boolean;
  }>;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

function lightspeedReadinessEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_READINESS_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-lightspeed-readiness.json")
  );
}

function imageBuildReadinessEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_IMAGE_BUILD_READINESS_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-image-build-readiness.json")
  );
}

function ownedImageProvenanceEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OWNED_IMAGE_PROVENANCE_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-owned-image-provenance.json")
  );
}

function externalRuntimeImagesPlanEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_EXTERNAL_RUNTIME_IMAGES_PLAN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-external-runtime-images-plan.json")
  );
}

function externalRuntimeReviewPacketEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_EXTERNAL_RUNTIME_REVIEW_PACKET_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-external-runtime-review-packet.json")
  );
}

function operatorDryRunEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OPERATOR_DRY_RUN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-operator-dry-run.json")
  );
}

function ocpConnectivityDiagnosticEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OCP_CONNECTIVITY_DIAGNOSTIC_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-ocp-connectivity-diagnostic.json")
  );
}

function installApprovalPlanEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_INSTALL_APPROVAL_PLAN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-install-approval-plan.json")
  );
}

function releasePublishPlanEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_RELEASE_PUBLISH_PLAN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-release-publish-plan.json")
  );
}

function certificationReadinessEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_CERTIFICATION_READINESS_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-certification-readiness.json")
  );
}

function catalogToolchainEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_CATALOG_TOOLCHAIN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-catalog-toolchain-plan.json")
  );
}

function securityScanPlanEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_SECURITY_SCAN_PLAN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-security-scan-plan.json")
  );
}

function releaseEvidenceRefreshPath() {
  return (
    process.env.CYWELL_OPSLENS_RELEASE_EVIDENCE_REFRESH ??
    join(repoRoot, "test-results", "cywell-opslens-release-evidence-refresh.json")
  );
}

function releaseEvidenceBundlePath() {
  return (
    process.env.CYWELL_OPSLENS_RELEASE_EVIDENCE_BUNDLE ??
    join(repoRoot, "test-results", "cywell-opslens-release-evidence-bundle.json")
  );
}

function releaseActionQueuePath() {
  return (
    process.env.CYWELL_OPSLENS_RELEASE_ACTION_QUEUE ??
    join(repoRoot, "test-results", "cywell-opslens-release-action-queue.json")
  );
}

function evidenceCheckpointPath() {
  return (
    process.env.CYWELL_OPSLENS_EVIDENCE_CHECKPOINT ??
    join(repoRoot, "test-results", "cywell-opslens-evidence-checkpoint.json")
  );
}

function aiopsIncidentPipelinePath() {
  return (
    process.env.CYWELL_OPSLENS_AIOPS_INCIDENT_PIPELINE_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-aiops-incident-pipeline.json")
  );
}

function liveEvidenceHandoffPath() {
  return (
    process.env.CYWELL_OPSLENS_LIVE_EVIDENCE_HANDOFF ??
    join(repoRoot, "test-results", "cywell-opslens-live-evidence-handoff.json")
  );
}

function ocpNetworkHandoffPath() {
  return (
    process.env.CYWELL_OPSLENS_OCP_NETWORK_HANDOFF ??
    join(repoRoot, "test-results", "cywell-opslens-ocp-network-handoff.json")
  );
}

function ocpAuthRbacPlanPath() {
  return (
    process.env.CYWELL_OPSLENS_OCP_AUTH_RBAC_PLAN ??
    join(repoRoot, "test-results", "cywell-opslens-ocp-auth-rbac-plan.json")
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

function mapImageBuildReadinessStatus(
  artifact: ImageBuildReadinessEvidenceArtifact
): OpsLensImageBuildReadiness {
  if (artifact.status === "FAIL") {
    return "failed";
  }
  if (artifact.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "PASS") {
    return "ready";
  }
  return "needs-evidence";
}

function mapOwnedImageProvenanceReadinessStatus(
  artifact: OwnedImageProvenanceEvidenceArtifact
): OpsLensOwnedImageProvenanceReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty || artifact.status !== "PASS") {
    return "needs-evidence";
  }
  return "ready";
}

function mapExternalRuntimeImagesPlanReadinessStatus(
  artifact: ExternalRuntimeImagesPlanEvidenceArtifact
): OpsLensExternalRuntimeReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty || artifact.status === "NEEDS_EVIDENCE") {
    return "needs-evidence";
  }
  if (artifact.status === "APPROVAL_REQUIRED") {
    return "approval-required";
  }
  return "needs-evidence";
}

function mapExternalRuntimeReviewPacketReadinessStatus(
  artifact: ExternalRuntimeReviewPacketEvidenceArtifact
): OpsLensExternalRuntimeReviewPacketReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "blocked";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "REVIEW_PACKET_READY") {
    return "ready";
  }
  return "needs-evidence";
}

function mapOperatorDryRunReadinessStatus(
  artifact: OperatorDryRunEvidenceArtifact
): OpsLensOperatorDryRunReadiness {
  if (artifact.status === "FAIL") {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "PASS") {
    return "ready";
  }
  if (artifact.status === "WARN") {
    return "partial";
  }
  return "needs-evidence";
}

function mapOcpConnectivityReadinessStatus(
  artifact: OcpConnectivityDiagnosticArtifact
): OpsLensOcpConnectivityReadiness {
  if (
    artifact.status === "FAIL" ||
    artifact.clusterMutationAttempted ||
    artifact.registryMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.status === "PASS" && artifact.diagnostics?.classification === "api-ready") {
    return "ready";
  }
  return "needs-evidence";
}

function mapInstallApprovalPlanReadinessStatus(
  artifact: InstallApprovalPlanEvidenceArtifact
): OpsLensInstallPlanReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty || artifact.status === "NEEDS_EVIDENCE") {
    return "needs-evidence";
  }
  if (artifact.status === "APPROVAL_REQUIRED") {
    return "approval-required";
  }
  return "needs-evidence";
}

function mapReleasePublishPlanReadinessStatus(
  artifact: ReleasePublishPlanEvidenceArtifact
): OpsLensReleasePublishReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty || artifact.status === "NEEDS_EVIDENCE") {
    return "needs-evidence";
  }
  if (artifact.status === "PUBLISH_APPROVAL_REQUIRED") {
    return "approval-required";
  }
  return "needs-evidence";
}

function mapCertificationReadinessStatus(
  artifact: CertificationReadinessEvidenceArtifact
): OpsLensCertificationReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "READY_FOR_REVIEW" || artifact.status === "PASS") {
    return "ready-for-review";
  }
  if (artifact.status === "NEEDS_TOOLING") {
    return "needs-tooling";
  }
  return "needs-evidence";
}

function mapCatalogToolchainReadinessStatus(
  artifact: CatalogToolchainEvidenceArtifact
): OpsLensCatalogToolchainReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "READY_FOR_DRY_RUN") {
    return "ready-for-dry-run";
  }
  if (artifact.status === "NEEDS_TOOLING") {
    return "needs-tooling";
  }
  return "needs-evidence";
}

function mapSecurityScanPlanReadinessStatus(
  artifact: SecurityScanPlanEvidenceArtifact
): OpsLensSecurityScanReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.status === "FAIL" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "READY_FOR_SCAN") {
    return "ready-for-scan";
  }
  if (artifact.status === "NEEDS_TOOLING") {
    return "needs-tooling";
  }
  return "needs-evidence";
}

function mapReleaseEvidenceRefreshStatus(
  artifact: ReleaseEvidenceRefreshArtifact
): OpsLensReleaseEvidenceRefreshReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "blocked";
  }
  if (artifact.ref?.worktreeDirty || artifact.status === "NEEDS_EVIDENCE") {
    return "needs-evidence";
  }
  if (artifact.status === "PASS") {
    return "ready";
  }
  return "needs-evidence";
}

function mapReleaseEvidenceBundleStatus(
  artifact: ReleaseEvidenceBundleArtifact
): OpsLensReleaseEvidenceBundleReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier ||
    artifact.mutationBoundary?.passed === false
  ) {
    return "blocked";
  }
  if (artifact.ref?.worktreeDirty || artifact.status === "NEEDS_EVIDENCE") {
    return "needs-evidence";
  }
  if (artifact.status === "APPROVAL_READY") {
    return "approval-ready";
  }
  return "needs-evidence";
}

function mapReleaseActionQueueStatus(
  artifact: ReleaseActionQueueArtifact
): OpsLensReleaseActionQueueReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.mutationAllowedByThisVerifier ||
    artifact.mutationBoundary?.passed === false
  ) {
    return "blocked";
  }
  if (artifact.ref?.worktreeDirty || artifact.status !== "ACTION_QUEUE_READY") {
    return "needs-evidence";
  }
  return "ready";
}

function mapEvidenceCheckpointStatus(
  artifact: EvidenceCheckpointArtifact
): OpsLensEvidenceCheckpointReadiness {
  if (artifact.status === "BLOCKED") {
    return "blocked";
  }
  if (artifact.status === "PASS") {
    return "ready";
  }
  return "needs-evidence";
}

function mapAiopsIncidentPipelineStatus(
  artifact: AiopsIncidentPipelineArtifact
): OpsLensAiopsIncidentPipelineReadiness {
  if (
    artifact.status === "FAIL" ||
    artifact.clusterMutationAttempted ||
    artifact.registryMutationAttempted ||
    artifact.vectorWriteAttempted ||
    artifact.ingestionJobCreated ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (
    artifact.status === "PASS" &&
    artifact.liveSmoke?.status === "pass" &&
    artifact.ref?.worktreeDirty !== true
  ) {
    return "ready";
  }
  return "needs-live-evidence";
}

function defaultOcpConnectivityActionHints(classification: string) {
  const common = {
    id: "rerun-read-only-diagnostic",
    severity: "info" as const,
    summary: "Rerun npm run verify:ocp:connectivity after changing network or OCP settings.",
    evidence: "The diagnostic is read-only and records DNS, TCP, TLS, /version, and oc evidence.",
    nextCheck: "npm run verify:ocp:connectivity"
  };
  const primary =
    classification === "tcp-timeout"
      ? {
          id: "check-vpn-firewall-route",
          severity: "blocked" as const,
          summary: "Check VPN, firewall, route, bastion, and API port reachability.",
          evidence: "DNS resolved, but TCP connect timed out before TLS or Kubernetes auth.",
          nextCheck: "Confirm TCP reachability, then rerun verify:lightspeed and verify:operator:dry-run."
        }
      : classification === "token-missing" || classification === "auth-failed"
        ? {
            id: "refresh-ocp-token",
            severity: "blocked" as const,
            summary: "Refresh OCP token or kubeconfig credentials before live checks.",
            evidence: "The live OCP checks require authentication evidence.",
            nextCheck: "oc whoami && npm run verify:ocp:connectivity"
          }
        : classification === "dns-unresolved"
          ? {
              id: "check-dns-resolution",
              severity: "blocked" as const,
              summary: "Check DNS, hosts file, VPN DNS suffixes, and resolver settings.",
              evidence: "The API hostname did not resolve.",
              nextCheck: "Resolve the API host, then rerun npm run verify:ocp:connectivity."
            }
          : classification === "api-ready"
            ? {
                id: "continue-live-readiness",
                severity: "info" as const,
                summary: "OCP API connectivity is ready for read-only live checks.",
                evidence: "DNS, network, TLS, and Kubernetes API evidence are available.",
                nextCheck: "npm run verify:lightspeed && npm run verify:operator:dry-run"
              }
            : {
                id: "classify-ocp-connectivity",
                severity: "blocked" as const,
                summary: "Classify and resolve the OCP API reachability gap before live checks.",
                evidence: `Current classification=${classification || "unknown"}.`,
                nextCheck: "npm run verify:ocp:connectivity"
              };
  return [primary, common];
}

function mapOcpConnectivityActionHints(
  artifact: OcpConnectivityDiagnosticArtifact,
  classification: string
): OpsLensOcpConnectivityDiagnosticSummary["actionHints"] {
  const mapped = (artifact.actionHints ?? [])
    .filter((hint) => hint.id && hint.summary)
    .map((hint) => {
      const severity: OpsLensOcpConnectivityDiagnosticSummary["actionHints"][number]["severity"] =
        hint.severity === "info"
          ? "info"
          : hint.severity === "warning"
            ? "warning"
            : "blocked";
      return {
        id: hint.id ?? "unknown",
        severity,
        summary: hint.summary ?? "Review OCP connectivity evidence.",
        evidence: hint.evidence ?? `classification=${classification}`,
        nextCheck: hint.nextCheck ?? "npm run verify:ocp:connectivity"
      };
    });
  return mapped.length > 0
    ? mapped
    : defaultOcpConnectivityActionHints(classification);
}

function mapOcpTroubleshootingCommands(
  artifact?: OcpConnectivityDiagnosticArtifact
): OpsLensOcpConnectivityDiagnosticSummary["readOnlyTroubleshootingCommands"] {
  return (artifact?.readOnlyTroubleshootingCommands ?? []).map((command) => ({
    id: command.id ?? "ocp-network-read-only",
    command: command.command ?? "npm run verify:ocp:connectivity",
    purpose: command.purpose ?? "Collect read-only OCP network troubleshooting evidence.",
    phase: command.phase ?? "local-network-read-only",
    requiresNetwork: command.requiresNetwork === true,
    mutation: command.mutation === true,
    writesEvidence: command.writesEvidence === true
  }));
}

function defaultOcpTroubleshootingCommands(): OpsLensOcpConnectivityDiagnosticSummary["readOnlyTroubleshootingCommands"] {
  return [
    {
      id: "generate-ocp-connectivity",
      command: "npm run verify:ocp:connectivity",
      purpose: "Generate read-only OCP connectivity diagnostic evidence.",
      phase: "local-contract",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    }
  ];
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
    const currentGap = artifact.currentGap;

    return {
      status,
      evidence: [
        `Lightspeed readiness evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `readiness generated at ${artifact.generatedAt ?? "unknown"}`,
        `sources crd=${sources.crd ?? "unknown"} olsConfig=${sources.olsConfig ?? "unknown"} mcp=${sources.mcpEndpoint ?? "unknown"}`,
        `OLSConfig ${olsConfig.label ?? "unknown"} featureGate=${olsConfig.featureGate ?? "unknown"} cywellRegistration=${olsConfig.cywellRegistration ?? "unknown"}`,
        currentGap
          ? `Lightspeed currentGap=${currentGap.classification ?? "unknown"} owner=${currentGap.owner ?? "unknown"} next=${currentGap.nextCommand ?? "unknown"}`
          : "Lightspeed currentGap=none",
        currentGap?.evidence ?? "",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads readiness evidence only; it does not patch OLSConfig"
      ].filter(Boolean)
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

function getImageBuildReadiness(): {
  status: OpsLensImageBuildReadiness;
  evidence: string[];
} {
  const evidencePath = imageBuildReadinessEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      evidence: [
        "run npm run verify:images to create image build readiness evidence",
        "dashboard keeps image builds as needs-evidence until local image readiness evidence is available",
        "image readiness view does not push images or mutate a cluster"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ImageBuildReadinessEvidenceArtifact;
    const status = mapImageBuildReadinessStatus(artifact);
    const internalNames = (artifact.internalBuilds ?? [])
      .map((build) => build.name)
      .filter(Boolean)
      .join(", ");
    const packagingNames = (artifact.packagingBuilds ?? [])
      .map((build) => build.name)
      .filter(Boolean)
      .join(", ");
    const externalNames = (artifact.externalImages ?? [])
      .filter((image) => image.certificationEvidenceRequired)
      .map((image) => image.name)
      .filter(Boolean)
      .join(", ");
    const actualBuildNames = (artifact.actualBuilds ?? [])
      .filter((build) => build.status === "PASS")
      .map((build) => build.name)
      .filter(Boolean)
      .join(", ");
    const actualBuildGaps = (artifact.actualBuilds ?? [])
      .filter((build) => build.status && build.status !== "PASS")
      .map((build) => `${build.name ?? "unknown"}=${build.blockedBy ?? build.status}`)
      .join(", ");

    return {
      status,
      evidence: [
        `Image readiness evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `image readiness generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.branch ?? "unknown"}@${artifact.headSha ?? "unknown"} base=${artifact.baseRef ?? "unknown"} dirty=${String(artifact.worktreeDirty ?? "unknown")}`,
        `internal image contracts=${internalNames || "unknown"} packaging=${packagingNames || "unknown"} dockerAvailable=${String(artifact.dockerAvailable ?? "unknown")}`,
        externalNames
          ? `external runtime image certification evidence required for ${externalNames}`
          : "external runtime image certification evidence not listed",
        artifact.actualBuildRequested
          ? `actual local image builds passed for ${actualBuildNames || "none"}`
          : "actual local image builds not requested in latest evidence",
        actualBuildGaps
          ? `actual local image build gaps ${actualBuildGaps}`
          : "actual local image build gaps none",
        "admin overview reads image readiness evidence only; it does not build, push, or patch cluster resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      evidence: [
        `Image readiness evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid image readiness evidence blocks overclaiming image build readiness"
      ]
    };
  }
}

function missingOwnedImageProvenanceSummary(
  reason: string,
  status: OpsLensOwnedImageProvenanceReadiness = "needs-evidence"
): OpsLensOwnedImageProvenanceSummary {
  return {
    status,
    artifactStatus: status === "failed" ? "invalid" : "missing",
    actionMode: "readOnlyEvidenceOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    requiredImages: ["operator", "api", "dashboard", "bundle"],
    images: [],
    missingEvidence: [reason],
    risk: [
      "Owned image provenance is missing, so release publish approval cannot prove which local images were inspected."
    ],
    rollbackPath: [
      "Run npm run verify:images:build from a clean worktree, then run npm run verify:owned-image-provenance."
    ]
  };
}

function getOwnedImageProvenanceReadiness(): {
  status: OpsLensOwnedImageProvenanceReadiness;
  evidence: string[];
  plan: OpsLensOwnedImageProvenanceSummary;
} {
  const evidencePath = ownedImageProvenanceEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: missingOwnedImageProvenanceSummary(
        `owned image provenance evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:owned-image-provenance to inspect local owned image metadata",
        "dashboard keeps owned image provenance as needs-evidence until Docker image inspect evidence is available",
        "owned image provenance reads local Docker metadata only and performs no registry or cluster mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OwnedImageProvenanceEvidenceArtifact;
    const status = mapOwnedImageProvenanceReadinessStatus(artifact);
    const images = (artifact.images ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      localTag: image.localTag ?? "unknown",
      status: image.status ?? "unknown",
      imageId: image.imageId ?? "unknown",
      repoDigests: image.repoDigests ?? [],
      user: image.user ?? "unknown",
      rootfsLayerCount: image.rootfsLayerCount ?? 0
    }));
    const imageSummary = images
      .map((image) => `${image.name}:${image.status}`)
      .join(", ");
    const repoDigestGap = artifact.summary?.repoDigestsPresent === false
      ? "registry repo digests are not present for local-only images"
      : "registry repo digests are present for required images";

    return {
      status,
      plan: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "readOnlyEvidenceOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredImages: artifact.requiredImages ?? [],
        images,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Owned image provenance ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `owned image provenance generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} registryMutationAttempted=${String(artifact.registryMutationAttempted ?? "unknown")} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")}`,
        imageSummary
          ? `owned image inspect status=${imageSummary}`
          : "owned image inspect status is not listed",
        repoDigestGap,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads owned image provenance only; it does not build, push, sign, mirror, or patch resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: missingOwnedImageProvenanceSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "failed"
      ),
      evidence: [
        `Owned image provenance could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid owned image provenance blocks overclaiming release readiness"
      ]
    };
  }
}

function getExternalRuntimeImagesPlanReadiness(): {
  status: OpsLensExternalRuntimeReadiness;
  evidence: string[];
  plan: OpsLensExternalRuntimeImagesPlanSummary;
} {
  const evidencePath = externalRuntimeImagesPlanEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: {
        status: "needs-evidence",
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: false,
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [
          "registry-admin",
          "security-reviewer",
          "release-manager",
          "product-owner"
        ],
        externalImages: [],
        evidenceTemplates: [],
        evidenceDrafts: [],
        mutatingCommands: [],
        risk: [
          "No external runtime image evidence plan is available yet; vLLM/Qdrant mirror and certification work remain blocked."
        ],
        rollbackPath: [
          "Generate external runtime image evidence before attempting runtime image mirror or sign commands."
        ],
        missingEvidence: [
          `external runtime images plan evidence is missing at ${evidencePath}`
        ]
      },
      evidence: [
        "run npm run verify:external-runtime-plan to create vLLM/Qdrant evidence plan",
        "dashboard keeps external runtime images as needs-evidence until no-mirror approval evidence is available",
        "external runtime plan evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ExternalRuntimeImagesPlanEvidenceArtifact;
    const status = mapExternalRuntimeImagesPlanReadinessStatus(artifact);
    const draftByName = new Map(
      (artifact.evidenceDrafts ?? []).map((draft) => [draft.name, draft])
    );
    const externalImages = (artifact.externalImages ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      sourceType: image.sourceType ?? "unknown",
      desiredMirror: image.desiredMirror ?? "unknown",
      status: image.status ?? "unknown",
      draftStatus:
        image.draft?.status ??
        draftByName.get(image.name)?.status ??
        "missing",
      draftMissingEvidenceCount:
        image.draft?.missingEvidence?.length ??
        draftByName.get(image.name)?.missingEvidence?.length ??
        0
    }));
    const mutatingCommands = (artifact.commands ?? [])
      .filter((command) => command.mutation)
      .map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        requiresExplicitApproval: command.requiresExplicitApproval === true
      }));
    const evidenceTemplates = (artifact.evidenceTemplates ?? []).map(
      (template) => ({
        name: template.name ?? "unknown",
        templatePath: template.templatePath ?? "unknown",
        status: template.status ?? "unknown"
      })
    );
    const imageNames = externalImages
      .map((image) => `${image.name}:${image.status}`)
      .join(", ");
    const templateNames = evidenceTemplates
      .map((template) => `${template.name}:${template.status}`)
      .join(", ");
    const draftNames = (artifact.evidenceDrafts ?? [])
      .map((draft) => `${draft.name}:${draft.status}`)
      .join(", ");
    const mutatingCommandNames = mutatingCommands
      .map((command) => command.id)
      .join(", ");

    return {
      status,
      plan: {
        status,
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredApprovals: artifact.requiredApprovals ?? [],
        externalImages,
        evidenceTemplates,
        evidenceDrafts: (artifact.evidenceDrafts ?? []).map((draft) => ({
          name: draft.name ?? "unknown",
          draftFile: draft.draftFile ?? "unknown",
          status: draft.status ?? "missing",
          evidenceState: draft.evidenceState ?? "missing",
          missingEvidence: draft.missingEvidence ?? []
        })),
        mutatingCommands,
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? [],
        missingEvidence: artifact.missingEvidence ?? []
      },
      evidence: [
        `External runtime images plan evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `external runtime plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} registryMutationAttempted=${String(artifact.registryMutationAttempted ?? "unknown")} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")}`,
        `required approvals=${(artifact.requiredApprovals ?? []).join(", ") || "unknown"}`,
        imageNames
          ? `external runtime image evidence status=${imageNames}`
          : "external runtime image inventory not listed",
        templateNames
          ? `external runtime evidence templates=${templateNames}`
          : "external runtime evidence templates are not listed",
        draftNames
          ? `external runtime evidence drafts=${draftNames}`
          : "external runtime evidence drafts are not listed",
        mutatingCommandNames
          ? `runtime mirror/sign commands require explicit approval: ${mutatingCommandNames}`
          : "runtime mirror/sign commands are not listed in latest external runtime plan",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads external runtime evidence only; it does not mirror, sign, push, or patch cluster resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: {
        status: "failed",
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: false,
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [],
        externalImages: [],
        evidenceTemplates: [],
        evidenceDrafts: [],
        mutatingCommands: [],
        risk: [
          "External runtime images plan evidence is invalid; runtime mirror and certification commands remain blocked."
        ],
        rollbackPath: [
          "Regenerate external runtime image evidence before attempting runtime image mirror or sign commands."
        ],
        missingEvidence: [
          error instanceof Error ? error.message : "unknown evidence parse error"
        ]
      },
      evidence: [
        `External runtime images plan evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid external runtime evidence blocks overclaiming runtime image readiness"
      ]
    };
  }
}

function missingExternalRuntimeReviewPacketSummary(
  detail: string,
  status: OpsLensExternalRuntimeReviewPacketReadiness = "needs-evidence"
): OpsLensExternalRuntimeReviewPacketSummary {
  return {
    status,
    artifactStatus: "missing",
    actionMode: "reviewPacketOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    requiredApprovals: [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    markdownPath: "missing",
    images: [],
    readOnlyCommands: [],
    approvalGatedCommands: [],
    missingEvidence: [detail],
    risk: [
      "External runtime reviewer packet is missing, so vLLM/Qdrant evidence asks are not dashboard-visible yet."
    ],
    rollbackPath: [
      "Generate the external runtime review packet before release-manager review."
    ]
  };
}

function summarizeExternalRuntimeCandidate(
  candidate: NonNullable<
    NonNullable<
      NonNullable<ExternalRuntimeReviewPacketEvidenceArtifact["images"]>[number]["candidateMatrix"]
    >["bestCandidate"]
  > | undefined
) {
  if (!candidate) {
    return undefined;
  }

  return {
    label: candidate.label ?? "unknown",
    image: candidate.image ?? "unknown",
    status: candidate.status ?? "unknown",
    releaseEligible: candidate.releaseEligible === true,
    criticalFindings: candidate.criticalFindings ?? "unknown",
    highFindings: candidate.highFindings ?? "unknown",
    mediumFindings: candidate.mediumFindings ?? "unknown",
    lowFindings: candidate.lowFindings ?? "unknown",
    reviewDecision: candidate.reviewDecision ?? "unknown"
  };
}

function getExternalRuntimeReviewPacketReadiness(): {
  status: OpsLensExternalRuntimeReviewPacketReadiness;
  evidence: string[];
  review: OpsLensExternalRuntimeReviewPacketSummary;
} {
  const evidencePath = externalRuntimeReviewPacketEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      review: missingExternalRuntimeReviewPacketSummary(
        `external runtime review packet evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run evidence:external-runtime:review-packet to create the vLLM/Qdrant reviewer packet",
        "dashboard keeps runtime review as needs-evidence until the packet exists",
        "the packet must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ExternalRuntimeReviewPacketEvidenceArtifact;
    const status = mapExternalRuntimeReviewPacketReadinessStatus(artifact);
    const images = (artifact.images ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      sourceDigest: image.sourceDigest ?? "missing",
      sourceDigestInspectionStatus:
        image.sourceDigestInspection?.status ?? "missing",
      draftStatus: image.draftStatus ?? "missing",
      evidenceState: image.evidenceState ?? "missing",
      finalEvidenceExists: image.finalEvidence?.exists === true,
      candidateMatrix: {
        status: image.candidateMatrix?.status ?? "missing",
        matrixStatus: image.candidateMatrix?.matrixStatus ?? "missing",
        bestCandidate: summarizeExternalRuntimeCandidate(
          image.candidateMatrix?.bestCandidate
        ),
        zeroCriticalCount:
          image.candidateMatrix?.zeroCriticalCandidates?.length ?? 0,
        recommendation:
          image.candidateMatrix?.recommendation ??
          "candidate matrix evidence is missing",
        missingEvidenceCount: image.candidateMatrix?.missingEvidence?.length ?? 0
      },
      reviewerRequests: (image.reviewerRequests ?? []).map((request) => ({
        role: request.role ?? "unknown",
        request: request.request ?? "unknown",
        evidenceNeeded: request.evidenceNeeded ?? "unknown",
        nextCommand:
          request.nextCommand ?? "npm run evidence:external-runtime:review-packet"
      })),
      missingEvidenceCount: image.missingEvidence?.length ?? 0
    }));
    const readOnlyCommands = (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "unknown",
      mutation: command.mutation === true,
      writesLocalEvidence: command.writesLocalEvidence === true
    }));
    const approvalGatedCommands = (artifact.approvalGatedCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "unknown",
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true
    }));
    const imageSummary = images
      .map(
        (image) =>
          `${image.name}:${image.sourceDigestInspectionStatus} requests=${image.reviewerRequests.length} candidate=${image.candidateMatrix.status}`
      )
      .join(", ");

    return {
      status,
      review: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "reviewPacketOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredApprovals: artifact.requiredApprovals ?? [],
        markdownPath: artifact.markdownOut ?? "missing",
        images,
        readOnlyCommands,
        approvalGatedCommands,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `External runtime review packet ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `external runtime review packet generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} registryMutationAttempted=${String(artifact.registryMutationAttempted ?? "unknown")} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")}`,
        imageSummary
          ? `external runtime review images=${imageSummary}`
          : "external runtime review images are not listed",
        `external runtime reviewer missingEvidence=${(artifact.missingEvidence ?? []).length}`,
        "admin overview reads external runtime review packet only; it does not promote drafts, mirror, sign, push, or patch resources"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      review: missingExternalRuntimeReviewPacketSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `External runtime review packet could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid external runtime review packet blocks dashboard readiness"
      ]
    };
  }
}

function getOperatorDryRunReadiness(): {
  status: OpsLensOperatorDryRunReadiness;
  evidence: string[];
} {
  const evidencePath = operatorDryRunEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      evidence: [
        "run npm run verify:operator:dry-run to create live server-side dry-run evidence",
        "dashboard keeps Operator dry-run as needs-evidence until live API preflight evidence is available",
        "Operator dry-run evidence must keep clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OperatorDryRunEvidenceArtifact;
    const status = mapOperatorDryRunReadinessStatus(artifact);
    const accepted = (artifact.results ?? [])
      .filter((result) => result.status === "PASS")
      .map((result) => result.label)
      .filter(Boolean)
      .join(", ");
    const skipped = (artifact.results ?? [])
      .filter((result) => result.status === "SKIPPED")
      .map((result) => `${result.label ?? "unknown"}:${result.reason ?? "skipped"}`)
      .filter(Boolean);

    return {
      status,
      evidence: [
        `Operator dry-run evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `operator dry-run generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `server dry-run command=${artifact.policy?.command ?? "unknown"} clusterMutationAttempted=${String(artifact.policy?.clusterMutationAttempted ?? "unknown")}`,
        accepted
          ? `live API accepted server dry-run for ${accepted}`
          : "live API accepted server dry-run resources not listed",
        skipped.length > 0
          ? `server dry-run skipped ${skipped.length} namespaced resources until target namespace exists`
          : "server dry-run skipped no namespaced resources",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads Operator dry-run evidence only; it does not apply manifests"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      evidence: [
        `Operator dry-run evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid Operator dry-run evidence blocks overclaiming install readiness"
      ]
    };
  }
}

function getOcpConnectivityDiagnosticReadiness(): {
  status: OpsLensOcpConnectivityReadiness;
  evidence: string[];
  connectivity: OpsLensOcpConnectivityDiagnosticSummary;
} {
  const evidencePath = ocpConnectivityDiagnosticEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      connectivity: {
        status: "needs-evidence",
        artifactStatus: "missing",
        actionMode: "readOnly",
        classification: "missing",
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        target: {
          host: "missing",
          port: "missing",
          redactedBaseUrl: "missing",
          tokenConfigured: false,
          tlsVerify: true
        },
        diagnostics: {
          dns: "missing",
          tcp: "missing",
          tls: "missing",
          kubernetesVersion: "missing",
          oc: "missing",
          rbacAccessReviews: []
        },
        actionHints: defaultOcpConnectivityActionHints("missing"),
        readOnlyTroubleshootingCommands: defaultOcpTroubleshootingCommands(),
        missingEvidence: [
          `OCP connectivity diagnostic evidence is missing at ${evidencePath}`
        ],
        risk: [
          "Live OCP, Operator dry-run, and Lightspeed readiness checks cannot be trusted until endpoint connectivity is classified."
        ],
        rollbackPath: [
          "Run npm run verify:ocp:connectivity after checking VPN, routing, firewall, and token configuration."
        ]
      },
      evidence: [
        "run npm run verify:ocp:connectivity to classify OCP API reachability",
        "dashboard keeps OCP connectivity as needs-evidence until DNS/TCP/TLS/API checks are recorded",
        "connectivity diagnostic reads only and performs no cluster mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OcpConnectivityDiagnosticArtifact;
    const status = mapOcpConnectivityReadinessStatus(artifact);
    const classification =
      artifact.classification ?? artifact.diagnostics?.classification ?? "unknown";
    const target = artifact.target ?? {};
    const diagnostics = {
      dns: artifact.diagnostics?.dns?.status ?? "unknown",
      tcp: artifact.diagnostics?.tcp?.status ?? "unknown",
      tls: artifact.diagnostics?.tls?.status ?? "unknown",
      kubernetesVersion:
        artifact.diagnostics?.kubernetesVersion?.status ?? "unknown",
      oc: artifact.diagnostics?.oc?.versionGet ?? "unknown",
      rbacAccessReviews: (artifact.diagnostics?.rbacAccessReviews ?? []).map(
        (review) => ({
          id: review.id ?? "unknown",
          verb: review.verb ?? "unknown",
          resource: review.resource ?? "unknown",
          scope: review.scope ?? "unknown",
          status: ["allowed", "denied", "unknown"].includes(review.status ?? "")
            ? (review.status as "allowed" | "denied" | "unknown")
            : "unknown",
          required: review.required === true,
          evidence: review.evidence ?? "unknown",
          command: review.command ?? "oc auth can-i"
        })
      )
    };
    const actionHints = mapOcpConnectivityActionHints(
      artifact,
      classification
    );
    const readOnlyTroubleshootingCommands =
      mapOcpTroubleshootingCommands(artifact);

    return {
      status,
      connectivity: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "readOnly",
        classification,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        target: {
          host: target.host ?? "unknown",
          port: target.port ?? "unknown",
          redactedBaseUrl: target.redactedBaseUrl ?? "unknown",
          tokenConfigured: target.tokenConfigured === true,
          tlsVerify: target.tlsVerify !== false
        },
        diagnostics,
        actionHints,
        readOnlyTroubleshootingCommands,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP connectivity diagnostic ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `OCP connectivity classification=${classification} target=${target.host ?? "unknown"}:${target.port ?? "unknown"}`,
        `diagnostics dns=${diagnostics.dns} tcp=${diagnostics.tcp} tls=${diagnostics.tls} /version=${diagnostics.kubernetesVersion} oc=${diagnostics.oc}`,
        diagnostics.rbacAccessReviews.length
          ? `rbacAccessReviews=${diagnostics.rbacAccessReviews.map((review) => `${review.id}:${review.status}`).join(",")}`
          : "rbacAccessReviews=missing",
        `actionMode=${artifact.actionMode ?? "unknown"} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads OCP connectivity evidence only; it does not apply, patch, delete, scale, or mutate cluster resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      connectivity: {
        status: "failed",
        artifactStatus: "invalid",
        actionMode: "readOnly",
        classification: "invalid-evidence",
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        target: {
          host: "unknown",
          port: "unknown",
          redactedBaseUrl: "unknown",
          tokenConfigured: false,
          tlsVerify: true
        },
        diagnostics: {
          dns: "unknown",
          tcp: "unknown",
          tls: "unknown",
          kubernetesVersion: "unknown",
          oc: "unknown",
          rbacAccessReviews: []
        },
        actionHints: defaultOcpConnectivityActionHints("invalid-evidence"),
        readOnlyTroubleshootingCommands: defaultOcpTroubleshootingCommands(),
        missingEvidence: [
          error instanceof Error ? error.message : "unknown evidence parse error"
        ],
        risk: [
          "Invalid OCP connectivity evidence blocks overclaiming live cluster readiness."
        ],
        rollbackPath: [
          "Regenerate OCP connectivity evidence before rerunning live Lightspeed or Operator checks."
        ]
      },
      evidence: [
        `OCP connectivity diagnostic could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid OCP connectivity evidence blocks overclaiming live readiness"
      ]
    };
  }
}

function missingRagIngestionPlan(
  reason: string,
  status: OpsLensRagIngestionApprovalPlanSummary["status"] = "needs-evidence"
): OpsLensRagIngestionApprovalPlanSummary {
  return {
    actionMode: "ingestionPlanOnly",
    status,
    queueEvidenceStatus: "missing",
    approvedPlanStatus: "missing",
    clusterMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    requiredApprovals: ["rag-owner", "cluster-sre", "data-steward"],
    mutatingCommands: [],
    risk: [
      "RAG ingestion readiness is unknown; future guidance changes must remain blocked."
    ],
    rollbackPath: [
      "Regenerate RAG approval queue evidence before planning or approving ingestion."
    ],
    missingEvidence: [reason]
  };
}

function missingLightspeedRegistrationPlan(
  reason: string
): OpsLensLightspeedRegistrationApprovalPlanSummary {
  return {
    actionMode: "previewOnly",
    status: "needs-evidence",
    phase: "MissingEvidence",
    mode: "unknown",
    configResourceKind: "OLSConfig",
    target: {
      namespace: "openshift-lightspeed",
      name: "cluster"
    },
    desiredServer: {
      name: "cywell-opslens",
      url: "unknown"
    },
    willPatch: false,
    operatorMutationAllowedByMode: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    legacyConfigMapMutationAttempted: false,
    readOnlyCommands: [
      {
        id: "preview-lightspeed-patch",
        command: "npm run verify:lightspeed:patch-preview"
      }
    ],
    evidence: [],
    risk: [
      "Lightspeed registration readiness is unknown; OLSConfig mutation remains blocked."
    ],
    rollbackPath: [
      "Regenerate Lightspeed patch preview and install approval evidence before approving any OLSConfig change."
    ],
    missingEvidence: [reason]
  };
}

function mapLightspeedRegistrationApprovalPlan(
  artifact:
    | InstallApprovalPlanEvidenceArtifact["lightspeedRegistration"]
    | undefined
): OpsLensLightspeedRegistrationApprovalPlanSummary {
  if (!artifact) {
    return missingLightspeedRegistrationPlan(
      "install approval plan does not include Lightspeed registration evidence"
    );
  }

  return {
    actionMode: "previewOnly",
    status: artifact.status ?? "needs-evidence",
    phase: artifact.phase ?? "unknown",
    mode: artifact.mode ?? "unknown",
    configResourceKind: "OLSConfig",
    target: {
      namespace: artifact.target?.namespace ?? "openshift-lightspeed",
      name: artifact.target?.name ?? "cluster"
    },
    desiredServer: {
      name: artifact.desiredServer?.name ?? "cywell-opslens",
      url: artifact.desiredServer?.url ?? "unknown"
    },
    willPatch: artifact.willPatch === true,
    operatorMutationAllowedByMode:
      artifact.operatorMutationAllowedByMode === true,
    clusterMutationAttempted: artifact.clusterMutationAttempted === true,
    mutationAllowedByThisVerifier:
      artifact.mutationAllowedByThisVerifier === true,
    legacyConfigMapMutationAttempted:
      artifact.legacyConfigMapMutationAttempted === true,
    readOnlyCommands: (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown"
    })),
    evidence: artifact.evidence ?? [],
    risk: artifact.risk ?? [],
    rollbackPath: artifact.rollbackPath ?? [],
    missingEvidence: artifact.missingEvidence ?? []
  };
}

function mapRagIngestionApprovalPlan(
  artifact:
    | InstallApprovalPlanEvidenceArtifact["ragIngestion"]
    | undefined
): OpsLensRagIngestionApprovalPlanSummary {
  if (!artifact) {
    return missingRagIngestionPlan(
      "install approval plan does not include RAG ingestion evidence"
    );
  }

  const rawStatus = artifact.status ?? "needs-evidence";
  const status: OpsLensRagIngestionApprovalPlanSummary["status"] =
    rawStatus === "ready-for-ingestion-job"
      ? "ready-for-ingestion-job"
      : rawStatus === "failed"
        ? "failed"
        : "needs-evidence";

  return {
    actionMode: "ingestionPlanOnly",
    status,
    queueEvidenceStatus: artifact.queueEvidenceStatus ?? "unknown",
    approvedPlanStatus: artifact.approvedPlanStatus ?? "unknown",
    clusterMutationAttempted: artifact.clusterMutationAttempted === true,
    vectorWriteAttempted: artifact.vectorWriteAttempted === true,
    ingestionJobCreated: artifact.ingestionJobCreated === true,
    mutationAllowedByThisVerifier:
      artifact.mutationAllowedByThisVerifier === true,
    requiredApprovals: artifact.requiredApprovals ?? [
      "rag-owner",
      "cluster-sre",
      "data-steward"
    ],
    mutatingCommands: (artifact.mutatingCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresExplicitApproval: command.requiresExplicitApproval === true
    })),
    risk: artifact.risk ?? [],
    rollbackPath: artifact.rollbackPath ?? [],
    missingEvidence: artifact.missingEvidence ?? []
  };
}

function getInstallApprovalPlanReadiness(): {
  status: OpsLensInstallPlanReadiness;
  evidence: string[];
  plan: OpsLensInstallApprovalPlanSummary;
} {
  const evidencePath = installApprovalPlanEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: {
        status: "needs-evidence",
        actionMode: "approvalPlanOnly",
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [
          "cluster-admin",
          "cluster-sre",
          "security-reviewer",
          "product-owner"
        ],
        mutatingCommands: [],
        risk: [
          "No install approval plan evidence is available yet; mutating install commands remain blocked."
        ],
        rollbackPath: [
          "Generate install approval evidence before attempting rollback or install commands."
        ],
        missingEvidence: [
          `install approval plan evidence is missing at ${evidencePath}`
        ],
        lightspeedRegistration: missingLightspeedRegistrationPlan(
          "install approval plan evidence is missing"
        ),
        ragIngestion: missingRagIngestionPlan(
          "install approval plan evidence is missing"
        )
      },
      evidence: [
        "run npm run verify:install-plan to create install approval plan evidence",
        "dashboard keeps install plan as needs-evidence until approval plan evidence is available",
        "install approval plan evidence must keep clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as InstallApprovalPlanEvidenceArtifact;
    const status = mapInstallApprovalPlanReadinessStatus(artifact);
    const mutatingCommands = (artifact.commands ?? [])
      .filter((command) => command.mutation)
      .map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        requiresExplicitApproval: command.requiresExplicitApproval === true
      }));
    const mutatingCommandNames = mutatingCommands
      .map((command) => command.id)
      .join(", ");
    const ragIngestion = mapRagIngestionApprovalPlan(
      artifact.ragIngestion
    );
    const lightspeedRegistration = mapLightspeedRegistrationApprovalPlan(
      artifact.lightspeedRegistration
    );
    const lightspeedRegistrationEvidence =
      `Lightspeed registration ${lightspeedRegistration.actionMode} ` +
      `mode=${lightspeedRegistration.mode} target=${lightspeedRegistration.target.namespace}/${lightspeedRegistration.target.name} ` +
      `willPatch=${String(lightspeedRegistration.willPatch)} ` +
      `legacyConfigMapMutationAttempted=${String(lightspeedRegistration.legacyConfigMapMutationAttempted)} ` +
      `clusterMutationAttempted=${String(lightspeedRegistration.clusterMutationAttempted)}`;
    const ragIngestionEvidence =
      `RAG ingestion plan ${ragIngestion.actionMode} status=${ragIngestion.status} ` +
      `approvedPlan=${ragIngestion.approvedPlanStatus} ingestionJobCreated=${String(ragIngestion.ingestionJobCreated)} ` +
      `vectorWriteAttempted=${String(ragIngestion.vectorWriteAttempted)}`;

    return {
      status,
      plan: {
        status,
        actionMode: "approvalPlanOnly",
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredApprovals: artifact.requiredApprovals ?? [],
        mutatingCommands,
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? [],
        missingEvidence: artifact.missingEvidence ?? [],
        lightspeedRegistration,
        ragIngestion
      },
      evidence: [
        `Install approval plan evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `install approval plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")} mutationAllowedByThisVerifier=${String(artifact.mutationAllowedByThisVerifier ?? "unknown")}`,
        `required approvals=${(artifact.requiredApprovals ?? []).join(", ") || "unknown"}`,
        mutatingCommandNames
          ? `mutating commands require explicit approval: ${mutatingCommandNames}`
          : "mutating commands are not listed in latest approval plan",
        lightspeedRegistrationEvidence,
        ragIngestionEvidence,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads install approval plan evidence only; it does not run install commands"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: {
        status: "failed",
        actionMode: "approvalPlanOnly",
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [],
        mutatingCommands: [],
        risk: [
          "Install approval plan evidence is invalid; mutating install commands remain blocked."
        ],
        rollbackPath: [
          "Regenerate install approval evidence before attempting rollback or install commands."
        ],
        missingEvidence: [
          error instanceof Error ? error.message : "unknown evidence parse error"
        ],
        lightspeedRegistration: missingLightspeedRegistrationPlan(
          error instanceof Error ? error.message : "unknown evidence parse error"
        ),
        ragIngestion: missingRagIngestionPlan(
          error instanceof Error ? error.message : "unknown evidence parse error",
          "failed"
        )
      },
      evidence: [
        `Install approval plan evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid install approval plan evidence blocks overclaiming install readiness"
      ]
    };
  }
}

function getReleasePublishPlanReadiness(): {
  status: OpsLensReleasePublishReadiness;
  evidence: string[];
  plan: OpsLensReleasePublishPlanSummary;
} {
  const evidencePath = releasePublishPlanEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: {
        status: "needs-evidence",
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: false,
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [
          "release-manager",
          "registry-admin",
          "security-reviewer",
          "product-owner"
        ],
        publishImages: [],
        mutatingCommands: [],
        risk: [
          "No release publish plan evidence is available yet; image push, signing, mirroring, and catalog publication remain blocked."
        ],
        rollbackPath: [
          "Generate release publish evidence before attempting registry or catalog publication commands."
        ],
        missingEvidence: [
          `release publish plan evidence is missing at ${evidencePath}`
        ]
      },
      evidence: [
        "run npm run verify:release-plan to create release publish plan evidence",
        "dashboard keeps release publish as needs-evidence until no-push approval evidence is available",
        "release publish plan evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ReleasePublishPlanEvidenceArtifact;
    const status = mapReleasePublishPlanReadinessStatus(artifact);
    const publishImages = (artifact.publishImages ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      source: image.source ?? "unknown"
    }));
    const mutatingCommands = (artifact.commands ?? [])
      .filter((command) => command.mutation)
      .map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        requiresExplicitApproval: command.requiresExplicitApproval === true
      }));
    const mutatingCommandNames = mutatingCommands
      .map((command) => command.id)
      .join(", ");
    const imageNames = publishImages.map((image) => image.name).join(", ");

    return {
      status,
      plan: {
        status,
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredApprovals: artifact.requiredApprovals ?? [],
        publishImages,
        mutatingCommands,
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? [],
        missingEvidence: artifact.missingEvidence ?? []
      },
      evidence: [
        `Release publish plan evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `release publish plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} registryMutationAttempted=${String(artifact.registryMutationAttempted ?? "unknown")} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")}`,
        `required approvals=${(artifact.requiredApprovals ?? []).join(", ") || "unknown"}`,
        imageNames ? `release publish image inventory=${imageNames}` : "release publish image inventory not listed",
        mutatingCommandNames
          ? `publish commands require explicit approval: ${mutatingCommandNames}`
          : "publish commands are not listed in latest release plan",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads release publish evidence only; it does not push, sign, mirror, or publish catalog images"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: {
        status: "failed",
        actionMode: "approvalPlanOnly",
        registryMutationAttempted: false,
        clusterMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        requiredApprovals: [],
        publishImages: [],
        mutatingCommands: [],
        risk: [
          "Release publish plan evidence is invalid; registry and catalog publication commands remain blocked."
        ],
        rollbackPath: [
          "Regenerate release publish evidence before attempting registry or catalog publication commands."
        ],
        missingEvidence: [
          error instanceof Error ? error.message : "unknown evidence parse error"
        ]
      },
      evidence: [
        `Release publish plan evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid release publish evidence blocks overclaiming release readiness"
      ]
    };
  }
}

function countCertificationGateStatuses(
  checks: Array<{ status?: string }> | undefined
): OpsLensCertificationReadinessSummary["gateCounts"]["internalCatalog"] {
  const counts = { pass: 0, warn: 0, fail: 0, total: 0 };
  for (const check of checks ?? []) {
    counts.total += 1;
    if (check.status === "PASS") counts.pass += 1;
    else if (check.status === "WARN") counts.warn += 1;
    else if (check.status === "FAIL") counts.fail += 1;
  }
  return counts;
}

function missingCertificationToolingHandoff(
  reason: string
): OpsLensCertificationReadinessSummary["toolingHandoff"] {
  return {
    actionMode: "humanSetupOnly",
    status: "needs-evidence",
    requiredTools: [],
    missingRequiredTools: [],
    readOnlyCommands: [
      {
        id: "refresh-certification-evidence",
        command: "npm run verify:certification",
        phase: "evidence-refresh",
        mutation: false,
        requiresNetwork: false
      }
    ],
    setupCommands: [],
    approvalGatedCommands: [],
    nextCommands: ["npm run verify:certification"],
    risk: [
      "Certification tooling readiness is unknown; external submission remains blocked."
    ],
    rollbackPath: [
      "Regenerate certification readiness evidence before installing tooling or submitting externally.",
      reason
    ]
  };
}

function mapCertificationToolingHandoff(
  artifact: CertificationReadinessEvidenceArtifact["toolingHandoff"] | undefined,
  cli: OpsLensCertificationReadinessSummary["cli"]
): OpsLensCertificationReadinessSummary["toolingHandoff"] {
  if (!artifact) {
    const missingRequiredTools = cli
      .filter((tool) => tool.requiredForExternalSubmission && !tool.available)
      .map((tool) => tool.name);
    return {
      ...missingCertificationToolingHandoff(
        "certification readiness evidence does not include tooling handoff"
      ),
      status: missingRequiredTools.length > 0 ? "needs-tooling" : "needs-evidence",
      requiredTools: cli.filter((tool) => tool.requiredForExternalSubmission),
      missingRequiredTools,
      setupCommands: missingRequiredTools.map((tool) => ({
        id: `install-${tool}`,
        command: `install ${tool} through an approved release-manager workstation or CI image`,
        phase: "human-setup",
        mutation: false,
        requiresNetwork: true,
        requiresHumanApproval: true
      })),
      nextCommands:
        missingRequiredTools.length > 0
          ? [
              "review docs/release/cywell-opslens-certification-tooling.md",
              "npm run verify:certification",
              "npm run verify:catalog-toolchain"
            ]
          : ["npm run verify:certification"]
    };
  }

  return {
    actionMode: "humanSetupOnly",
    status: artifact.status ?? "needs-evidence",
    requiredTools: (artifact.requiredTools ?? []).map((tool) => ({
      name: tool.name ?? "unknown",
      available: tool.available === true,
      version: tool.version ?? "missing",
      requiredForExternalSubmission:
        tool.requiredForExternalSubmission === true
    })),
    missingRequiredTools: artifact.missingRequiredTools ?? [],
    readOnlyCommands: (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      mutation: command.mutation === true,
      requiresNetwork: command.requiresNetwork === true
    })),
    setupCommands: (artifact.setupCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      mutation: command.mutation === true,
      requiresNetwork: command.requiresNetwork === true,
      requiresHumanApproval: command.requiresHumanApproval === true
    })),
    approvalGatedCommands: (artifact.approvalGatedCommands ?? []).map(
      (command) => ({
        id: command.id ?? "unknown",
        command: command.command ?? "unknown",
        phase: command.phase ?? "unknown",
        mutation: command.mutation === true,
        requiresExplicitApproval: command.requiresExplicitApproval === true
      })
    ),
    nextCommands: artifact.nextCommands ?? [],
    risk: artifact.risk ?? [],
    rollbackPath: artifact.rollbackPath ?? []
  };
}

function missingCertificationReadinessSummary(
  reason: string,
  status: OpsLensCertificationReadiness = "needs-evidence"
): OpsLensCertificationReadinessSummary {
  return {
    status,
    artifactStatus: status === "failed" ? "invalid" : "missing",
    actionMode: "certificationReadinessOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    headSha: "missing",
    worktreeDirty: false,
    cli: [],
    toolingHandoff: missingCertificationToolingHandoff(reason),
    documents: {},
    gateCounts: {
      internalCatalog: { pass: 0, warn: 0, fail: 0, total: 0 },
      communityOperator: { pass: 0, warn: 0, fail: 0, total: 0 },
      certifiedOperator: { pass: 0, warn: 0, fail: 0, total: 0 }
    },
    missingEvidence: [reason],
    risk: [
      "Without certification readiness evidence, release review cannot separate internal catalog readiness from external Red Hat submission gaps."
    ],
    rollbackPath: [
      "Run npm run verify:certification from a clean Git HEAD before Community or Certified Operator review."
    ]
  };
}

function getCertificationReadiness(): {
  status: OpsLensCertificationReadiness;
  evidence: string[];
  plan: OpsLensCertificationReadinessSummary;
} {
  const evidencePath = certificationReadinessEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: missingCertificationReadinessSummary(
        `certification readiness evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:certification to create Community/Certified Operator readiness evidence",
        "dashboard keeps certification readiness as needs-evidence until packaging, docs, and CLI gaps are recorded",
        "certification readiness evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as CertificationReadinessEvidenceArtifact;
    const status = mapCertificationReadinessStatus(artifact);
    const cli = (artifact.cli ?? []).map((tool) => ({
      name: tool.name ?? "unknown",
      available: tool.available === true,
      version: tool.version ?? "missing",
      requiredForExternalSubmission:
        tool.requiredForExternalSubmission === true
    }));
    const toolingHandoff = mapCertificationToolingHandoff(
      artifact.toolingHandoff,
      cli
    );
    const gateCounts = {
      internalCatalog: countCertificationGateStatuses(
        artifact.gates?.internalCatalog
      ),
      communityOperator: countCertificationGateStatuses(
        artifact.gates?.communityOperator
      ),
      certifiedOperator: countCertificationGateStatuses(
        artifact.gates?.certifiedOperator
      )
    };
    const missingExternalTools = cli
      .filter((tool) => tool.requiredForExternalSubmission && !tool.available)
      .map((tool) => tool.name)
      .join(", ");
    const documents = artifact.documents ?? {};
    const documentSummary = Object.entries(documents)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");

    return {
      status,
      plan: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "certificationReadinessOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        cli,
        toolingHandoff,
        documents,
        gateCounts,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Certification readiness evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `certification readiness generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `certification gates internal=${gateCounts.internalCatalog.pass}/${gateCounts.internalCatalog.total} community=${gateCounts.communityOperator.pass}/${gateCounts.communityOperator.total} certified=${gateCounts.certifiedOperator.pass}/${gateCounts.certifiedOperator.total}`,
        missingExternalTools
          ? `missing external submission CLIs=${missingExternalTools}`
          : "all reported external submission CLIs are available",
        `certification tooling handoff ${toolingHandoff.actionMode} status=${toolingHandoff.status} missingRequiredTools=${toolingHandoff.missingRequiredTools.join(", ") || "none"} next=${toolingHandoff.nextCommands[0] ?? "unknown"}`,
        documentSummary
          ? `certification documents=${documentSummary}`
          : "certification documents are not listed",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads certification readiness evidence only; it does not submit to Partner Connect, push images, mirror images, sign images, apply resources, delete resources, or scale workloads"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: missingCertificationReadinessSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "failed"
      ),
      evidence: [
        `Certification readiness evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid certification readiness evidence blocks overclaiming Community or Certified Operator readiness"
      ]
    };
  }
}

function missingCatalogToolchainSummary(
  reason: string,
  status: OpsLensCatalogToolchainReadiness = "needs-evidence"
): OpsLensCatalogToolchainSummary {
  return {
    status,
    artifactStatus: status === "failed" ? "invalid" : "missing",
    actionMode: "toolchainPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    registryAuthConfigured: false,
    cli: [],
    readOnlyCommands: [
      {
        id: "generate-catalog-toolchain",
        command: "npm run verify:catalog-toolchain",
        phase: "local-contract",
        requiresNetwork: false,
        mutation: false
      }
    ],
    setupCommands: [],
    localArtifactCommands: [],
    missingEvidence: [reason],
    risk: [
      "Without catalog toolchain evidence, catalog validation and certification review can drift from the release packet."
    ],
    rollbackPath: [
      "Run npm run verify:catalog-toolchain from a clean Git HEAD before release review."
    ]
  };
}

function getCatalogToolchainReadiness(): {
  status: OpsLensCatalogToolchainReadiness;
  evidence: string[];
  plan: OpsLensCatalogToolchainSummary;
} {
  const evidencePath = catalogToolchainEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: missingCatalogToolchainSummary(
        `catalog toolchain evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:catalog-toolchain to create catalog toolchain evidence",
        "dashboard keeps catalog toolchain as needs-evidence until CLI/auth readiness is recorded",
        "catalog toolchain evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as CatalogToolchainEvidenceArtifact;
    const status = mapCatalogToolchainReadinessStatus(artifact);
    const readOnlyCommands = (artifact.commands?.readOnly ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true
    }));
    const setupCommands = (artifact.commands?.setup ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      requiresHumanSecretInput: command.requiresHumanSecretInput === true,
      mutation: command.mutation === true
    }));
    const localArtifactCommands = (artifact.commands?.localArtifact ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true
    }));
    const cli = (artifact.cli ?? []).map((tool) => ({
      name: tool.name ?? "unknown",
      available: tool.available === true,
      version: tool.version ?? "missing"
    }));
    const missingTools = cli
      .filter((tool) => !tool.available)
      .map((tool) => tool.name)
      .join(", ");

    return {
      status,
      plan: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "toolchainPlanOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        registryAuthConfigured: artifact.registryAuth?.configured === true,
        cli,
        readOnlyCommands,
        setupCommands,
        localArtifactCommands,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Catalog toolchain evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `catalog toolchain generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `registryAuthConfigured=${String(artifact.registryAuth?.configured ?? false)} readOnlyCommands=${readOnlyCommands.length} setupCommands=${setupCommands.length}`,
        missingTools ? `missing local catalog CLIs=${missingTools}` : "all reported catalog CLIs are available",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads catalog toolchain evidence only; it does not publish catalog images or apply cluster resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: missingCatalogToolchainSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "failed"
      ),
      evidence: [
        `Catalog toolchain evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid catalog toolchain evidence blocks overclaiming catalog readiness"
      ]
    };
  }
}

function missingSecurityScanPlanSummary(
  reason: string,
  status: OpsLensSecurityScanReadiness = "needs-evidence"
): OpsLensSecurityScanPlanSummary {
  return {
    status,
    artifactStatus: status === "failed" ? "invalid" : "missing",
    actionMode: "scanPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    cli: [],
    images: [],
    readOnlyCommands: [
      {
        id: "generate-security-scan-plan",
        command: "npm run verify:security-scan-plan",
        phase: "local-contract",
        requiresNetwork: false,
        mutation: false,
        writesLocalEvidence: true
      }
    ],
    setupCommands: [],
    approvalGatedCommands: [],
    missingEvidence: [reason],
    risk: [
      "Without security scan plan evidence, release review cannot distinguish missing scan/SBOM inputs from approved signing or registry actions."
    ],
    rollbackPath: [
      "Run npm run verify:security-scan-plan from a clean Git HEAD before release-manager review."
    ]
  };
}

function getSecurityScanPlanReadiness(): {
  status: OpsLensSecurityScanReadiness;
  evidence: string[];
  plan: OpsLensSecurityScanPlanSummary;
} {
  const evidencePath = securityScanPlanEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: missingSecurityScanPlanSummary(
        `security scan plan evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:security-scan-plan to create vulnerability/SBOM/signature readiness evidence",
        "dashboard keeps security scan readiness as needs-evidence until scan tooling and evidence gaps are recorded",
        "security scan evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as SecurityScanPlanEvidenceArtifact;
    const status = mapSecurityScanPlanReadinessStatus(artifact);
    const cli = (artifact.cli ?? []).map((tool) => ({
      name: tool.name ?? "unknown",
      available: tool.available === true,
      version: tool.version ?? "missing"
    }));
    const images = (artifact.images ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      required: image.required === true,
      source: image.source ?? "unknown",
      vulnerabilityReportExists:
        image.securityEvidence?.vulnerabilityReportExists === true,
      sbomExists: image.securityEvidence?.sbomExists === true,
      reviewExists: image.securityEvidence?.reviewExists === true,
      reviewDraft: {
        exists: image.securityEvidence?.reviewDraft?.exists === true,
        evidenceState:
          image.securityEvidence?.reviewDraft?.evidenceState ?? "missing",
        sameHead: image.securityEvidence?.reviewDraft?.sameHead === true,
        reviewerProvided:
          image.securityEvidence?.reviewDraft?.reviewerProvided === true,
        ticketProvided:
          image.securityEvidence?.reviewDraft?.ticketProvided === true,
        readyForFinalReview:
          image.securityEvidence?.reviewDraft?.readyForFinalReview === true,
        draftPath:
          image.securityEvidence?.reviewDraft?.draftPath ?? "missing",
        finalEvidenceFile:
          image.securityEvidence?.reviewDraft?.finalEvidenceFile ?? "missing",
        missingEvidence:
          image.securityEvidence?.reviewDraft?.missingEvidence ?? []
      }
    }));
    const readOnlyCommands = (artifact.commands?.readOnly ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true,
      writesLocalEvidence: command.writesLocalEvidence === true
    }));
    const setupCommands = (artifact.commands?.setup ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true
    }));
    const approvalGatedCommands = (artifact.commands?.approvalGated ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true
    }));
    const missingTools = cli
      .filter((tool) => !tool.available)
      .map((tool) => tool.name)
      .join(", ");
    const requiredMissingEvidence = images.filter(
      (image) =>
        image.required &&
        (!image.vulnerabilityReportExists || !image.sbomExists || !image.reviewExists)
    ).length;

    return {
      status,
      plan: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "scanPlanOnly",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        cli,
        images,
        readOnlyCommands,
        setupCommands,
        approvalGatedCommands,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Security scan plan ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `security scan plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `scanReadOnlyCommands=${readOnlyCommands.length} setupCommands=${setupCommands.length} approvalGatedCommands=${approvalGatedCommands.length}`,
        missingTools ? `missing local scan/sign CLIs=${missingTools}` : "all reported scan/sign CLIs are available",
        `required images missing scan/SBOM/review evidence=${requiredMissingEvidence}`,
        `security review drafts=${images.map((image) => `${image.name}:${image.reviewDraft.evidenceState}:sameHead=${String(image.reviewDraft.sameHead)}:ready=${String(image.reviewDraft.readyForFinalReview)}`).join(", ")}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads security scan evidence only; it does not sign, push, mirror, or mutate cluster resources"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: missingSecurityScanPlanSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "failed"
      ),
      evidence: [
        `Security scan plan evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid security scan evidence blocks overclaiming certification readiness"
      ]
    };
  }
}

function missingReleaseEvidenceRefreshSummary(
  reason: string,
  status: OpsLensReleaseEvidenceRefreshReadiness = "needs-evidence"
): OpsLensReleaseEvidenceRefreshSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "localEvidenceRefresh",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    localDockerBuildAllowed: false,
    headSha: "missing",
    worktreeDirty: false,
    commands: [
      {
        id: "generate-release-refresh",
        phase: "local-contract",
        status: "missing",
        exitCode: null,
        expectedNonZero: false
      }
    ],
    artifacts: [],
    actionQueue: {
      status: "missing",
      ownerPacketCount: 0,
      ownerPacketsReady: false,
      missingOwnerPackets: [reason],
      ownerPacketCleanup: {
        dir: "missing",
        expectedFiles: [],
        staleRemoved: [],
        deletionAllowed: false
      },
      ownerPackets: []
    },
    missingEvidence: [reason],
    risk: [
      "Without release refresh evidence, reviewers cannot tell whether local gate artifacts were regenerated in dependency order."
    ],
    rollbackPath: [
      "Run npm run verify:release-refresh after code or evidence contract changes."
    ]
  };
}

function getReleaseEvidenceRefreshReadiness(): {
  status: OpsLensReleaseEvidenceRefreshReadiness;
  evidence: string[];
  refresh: OpsLensReleaseEvidenceRefreshSummary;
} {
  const evidencePath = releaseEvidenceRefreshPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      refresh: missingReleaseEvidenceRefreshSummary(
        `release evidence refresh is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:release-refresh to regenerate release evidence in dependency order",
        "dashboard keeps release refresh as needs-evidence until the refresh artifact exists",
        "release refresh evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ReleaseEvidenceRefreshArtifact;
    const status = mapReleaseEvidenceRefreshStatus(artifact);
    const commands = (artifact.commands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "unknown",
      status: command.status ?? "unknown",
      exitCode: command.exitCode ?? null,
      expectedNonZero: command.expectedNonZero === true
    }));
    const artifacts = (artifact.artifacts ?? []).map((source) => ({
      id: source.id ?? "unknown",
      status: source.status ?? "unknown",
      fresh: source.fresh === true,
      headSha: source.headSha ?? "missing",
      worktreeDirty: source.worktreeDirty ?? "unknown"
    }));
    const actionQueue = {
      status: artifact.actionQueue?.status ?? "missing",
      ownerPacketCount: artifact.actionQueue?.ownerPacketCount ?? 0,
      ownerPacketsReady: artifact.actionQueue?.ownerPacketsReady === true,
      missingOwnerPackets: artifact.actionQueue?.missingOwnerPackets ?? [],
      ownerPacketCleanup: {
        dir: artifact.actionQueue?.ownerPacketCleanup?.dir ?? "missing",
        expectedFiles:
          artifact.actionQueue?.ownerPacketCleanup?.expectedFiles ?? [],
        staleRemoved:
          artifact.actionQueue?.ownerPacketCleanup?.staleRemoved ?? [],
        deletionAllowed:
          artifact.actionQueue?.ownerPacketCleanup?.deletionAllowed === true
      },
      ownerPackets: (artifact.actionQueue?.ownerPackets ?? []).map((packet) => ({
        owner: packet.owner ?? "unknown",
        status: packet.status ?? "unknown",
        markdownPath: packet.markdownPath ?? "missing",
        exists: packet.exists === true,
        open: packet.open ?? 0,
        blocker: packet.blocker ?? 0,
        high: packet.high ?? 0,
        approvalGatedCommandCount: packet.approvalGatedCommandCount ?? 0,
        mutationAllowedByThisVerifier:
          packet.mutationAllowedByThisVerifier === true
      }))
    };
    const commandSummary = commands
      .slice(0, 6)
      .map((command) => `${command.id}:${command.status}`)
      .join(", ");

    return {
      status,
      refresh: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "localEvidenceRefresh",
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        localDockerBuildAllowed: artifact.localDockerBuildAllowed === true,
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        commands,
        artifacts,
        actionQueue,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Release evidence refresh ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `release refresh generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `localDockerBuildAllowed=${String(artifact.localDockerBuildAllowed ?? false)} commandCount=${commands.length} artifactCount=${artifacts.length}`,
        `release refresh action queue owner packets ready=${String(actionQueue.ownerPacketsReady)} count=${actionQueue.ownerPacketCount}`,
        commandSummary ? `refresh commands=${commandSummary}` : "refresh command summary is not listed",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads release refresh evidence only; it does not approve install, patch, push, mirror, sign, apply, delete, or scale actions"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      refresh: missingReleaseEvidenceRefreshSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `Release evidence refresh could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid release refresh evidence blocks overclaiming release readiness"
      ]
    };
  }
}

function missingReleaseEvidenceBundleSummary(
  reason: string,
  status: OpsLensReleaseEvidenceBundleReadiness = "needs-evidence"
): OpsLensReleaseEvidenceBundleSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "bundleOnly",
    markdownPath: "missing",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    headSha: "missing",
    worktreeDirty: false,
    decision: {
      publishReady: false,
      installReady: false,
      roadmapComplete: false,
      checkpointStatus: "missing",
      releaseStatus: "missing",
      installStatus: "missing",
      roadmapStatus: "missing"
    },
    approvals: {},
    sourceArtifacts: [],
    commandCounts: {
      readOnly: 0,
      mutatingApprovalRequired: 0
    },
    mutationBoundaryPassed: false,
    missingEvidence: [reason],
    risk: [
      "Without the release evidence bundle, release-manager review cannot see the consolidated source freshness and mutation boundary."
    ],
    rollbackPath: [
      "Run npm run verify:release-evidence-bundle after refreshing release evidence."
    ]
  };
}

function getReleaseEvidenceBundleReadiness(): {
  status: OpsLensReleaseEvidenceBundleReadiness;
  evidence: string[];
  bundle: OpsLensReleaseEvidenceBundleSummary;
} {
  const evidencePath = releaseEvidenceBundlePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      bundle: missingReleaseEvidenceBundleSummary(
        `release evidence bundle is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:release-evidence-bundle to create release-manager bundle evidence",
        "dashboard keeps release evidence bundle as needs-evidence until the bundle exists",
        "release bundle evidence must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ReleaseEvidenceBundleArtifact;
    const status = mapReleaseEvidenceBundleStatus(artifact);
    const sourceArtifacts = (artifact.sources ?? []).map((source) => ({
      id: source.id ?? "unknown",
      status: source.status ?? "unknown",
      fresh: source.fresh === true,
      acceptable: source.acceptable === true,
      mutationViolation: source.mutationViolation === true
    }));
    const decision = {
      publishReady: artifact.decision?.publishReady === true,
      installReady: artifact.decision?.installReady === true,
      roadmapComplete: artifact.decision?.roadmapComplete === true,
      checkpointStatus: artifact.decision?.checkpointStatus ?? "unknown",
      releaseStatus: artifact.decision?.releaseStatus ?? "unknown",
      installStatus: artifact.decision?.installStatus ?? "unknown",
      roadmapStatus: artifact.decision?.roadmapStatus ?? "unknown"
    };
    const commandCounts = {
      readOnly: artifact.commands?.readOnly?.length ?? 0,
      mutatingApprovalRequired:
        artifact.commands?.mutatingApprovalRequired?.length ?? 0
    };
    const sourceSummary = sourceArtifacts
      .slice(0, 6)
      .map((source) => `${source.id}:${source.status}:fresh=${String(source.fresh)}`)
      .join(", ");
    const markdownPath =
      artifact.markdownOut ?? evidencePath.replace(/\.json$/i, ".md");

    return {
      status,
      bundle: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "bundleOnly",
        markdownPath,
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        decision,
        approvals: artifact.approvals ?? {},
        sourceArtifacts,
        commandCounts,
        mutationBoundaryPassed: artifact.mutationBoundary?.passed === true,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Release evidence bundle ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `release bundle generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `bundle decision publishReady=${String(decision.publishReady)} installReady=${String(decision.installReady)} roadmapComplete=${String(decision.roadmapComplete)}`,
        `bundle markdown packet=${markdownPath}`,
        `bundle command counts readOnly=${commandCounts.readOnly} mutatingApprovalRequired=${commandCounts.mutatingApprovalRequired}`,
        sourceSummary ? `bundle sources=${sourceSummary}` : "bundle sources are not listed",
        `bundle mutationBoundaryPassed=${String(artifact.mutationBoundary?.passed ?? false)}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads release bundle evidence only; it does not approve install, patch, push, mirror, sign, apply, delete, or scale actions"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      bundle: missingReleaseEvidenceBundleSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `Release evidence bundle could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid release bundle evidence blocks overclaiming release readiness"
      ]
    };
  }
}

function missingReleaseActionQueueSummary(
  reason: string,
  status: OpsLensReleaseActionQueueReadiness = "needs-evidence"
): OpsLensReleaseActionQueueSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "actionQueueOnly",
    markdownPath: "missing",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    headSha: "missing",
    worktreeDirty: false,
    owners: [],
    ownerPackets: [],
    ownerPacketCleanup: {
      dir: "missing",
      expectedFiles: [],
      staleRemoved: [],
      deletionAllowed: false
    },
    items: [],
    sourceArtifacts: [],
    commandCounts: {
      readOnly: 0,
      approvalGated: 0
    },
    mutationBoundaryPassed: false,
    missingEvidence: [reason],
    risk: [
      "Without the release action queue, release and install evidence gaps are not assigned to operational owners."
    ],
    rollbackPath: [
      "Run npm run evidence:release-action-queue after refreshing the release evidence bundle."
    ]
  };
}

function normalizeActionQueuePriority(
  priority?: string
): "blocker" | "high" | "normal" {
  if (priority === "blocker" || priority === "high") {
    return priority;
  }
  return "normal";
}

function normalizeOwnerPacketStatus(status?: string): "blocker" | "open" | "clear" {
  if (status === "blocker" || status === "open") {
    return status;
  }
  return "clear";
}

function getReleaseActionQueueReadiness(): {
  status: OpsLensReleaseActionQueueReadiness;
  evidence: string[];
  actionQueue: OpsLensReleaseActionQueueSummary;
} {
  const evidencePath = releaseActionQueuePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      actionQueue: missingReleaseActionQueueSummary(
        `release action queue is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run evidence:release-action-queue to create owner-scoped release action evidence",
        "dashboard keeps release action queue as needs-evidence until owner actions exist",
        "release action queue must keep registryMutationAttempted=false and clusterMutationAttempted=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as ReleaseActionQueueArtifact;
    const status = mapReleaseActionQueueStatus(artifact);
    const owners = (artifact.owners ?? []).map((owner) => ({
      owner: owner.owner ?? "unknown",
      open: owner.open ?? 0,
      blocker: owner.blocker ?? 0,
      high: owner.high ?? 0,
      normal: owner.normal ?? 0
    }));
    const ownerPackets = (artifact.ownerPackets ?? []).map((packet) => ({
      owner: packet.owner ?? "unknown",
      status: normalizeOwnerPacketStatus(packet.status),
      markdownPath: packet.markdownPath ?? "missing",
      open: packet.open ?? 0,
      blocker: packet.blocker ?? 0,
      high: packet.high ?? 0,
      normal: packet.normal ?? 0,
      itemIds: packet.itemIds ?? [],
      nextCommands: packet.nextCommands ?? [],
      setupCommandIds: packet.setupCommandIds ?? [],
      readOnlyCommandIds: packet.readOnlyCommandIds ?? [],
      approvalGatedCommandIds: packet.approvalGatedCommandIds ?? [],
      missingRequiredTools: packet.missingRequiredTools ?? [],
      blockedBy: packet.blockedBy ?? [],
      acceptance: packet.acceptance ?? [],
      mutationAllowedByThisVerifier:
        packet.mutationAllowedByThisVerifier === true
    }));
    const ownerPacketCleanup = {
      dir: artifact.ownerPacketCleanup?.dir ?? "missing",
      expectedFiles: artifact.ownerPacketCleanup?.expectedFiles ?? [],
      staleRemoved: artifact.ownerPacketCleanup?.staleRemoved ?? [],
      deletionAllowed: artifact.ownerPacketCleanup?.deletionAllowed === true
    };
    const items = (artifact.items ?? []).map((entry) => ({
      id: entry.id ?? "unknown",
      owner: entry.owner ?? "unknown",
      priority: normalizeActionQueuePriority(entry.priority),
      source: entry.source ?? "unknown",
      request: entry.request ?? "missing request",
      evidenceNeeded: entry.evidenceNeeded ?? "missing evidence",
      nextCommand: entry.nextCommand ?? "not listed",
      handoffNextCommands: entry.handoffNextCommands ?? [],
      setupCommands: (entry.setupCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        command: command.command ?? "unknown",
        phase: command.phase ?? "human-setup",
        mutation: command.mutation === true,
        requiresNetwork: command.requiresNetwork === true,
        requiresHumanApproval: command.requiresHumanApproval === true
      })),
      readOnlyCommands: (entry.readOnlyCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        command: command.command ?? "unknown",
        phase: command.phase ?? "read-only",
        mutation: command.mutation === true,
        requiresNetwork: command.requiresNetwork === true,
        writesLocalEvidence: command.writesLocalEvidence === true
      })),
      approvalGatedCommands: (entry.approvalGatedCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        command: command.command ?? "unknown",
        phase: command.phase ?? "approval-gated",
        mutation: command.mutation === true,
        requiresExplicitApproval: command.requiresExplicitApproval === true
      })),
      missingRequiredTools: entry.missingRequiredTools ?? []
    }));
    const sourceArtifacts = (artifact.sourceArtifacts ?? []).map((source) => ({
      id: source.id ?? "unknown",
      status: source.status ?? "unknown",
      fresh: source.fresh === true,
      required: source.required === true,
      mutationViolation: source.mutationViolation === true
    }));
    const commandCounts = {
      readOnly: artifact.readOnlyCommands?.length ?? 0,
      approvalGated: artifact.approvalGatedCommands?.length ?? 0
    };
    const ownerSummary = owners
      .slice(0, 6)
      .map((owner) => `${owner.owner}:open=${owner.open}:blocker=${owner.blocker}:high=${owner.high}`)
      .join(", ");
    const markdownPath =
      artifact.markdownOut ?? evidencePath.replace(/\.json$/i, ".md");

    return {
      status,
      actionQueue: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "actionQueueOnly",
        markdownPath,
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        owners,
        ownerPackets,
        ownerPacketCleanup,
        items,
        sourceArtifacts,
        commandCounts,
        mutationBoundaryPassed: artifact.mutationBoundary?.passed === true,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Release action queue ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `release action queue generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `release action queue markdown packet=${markdownPath}`,
        `release action queue owner packets=${ownerPackets.length}`,
        `release action queue owner packet cleanup deletionAllowed=${String(ownerPacketCleanup.deletionAllowed)} expected=${ownerPacketCleanup.expectedFiles.length} staleRemoved=${ownerPacketCleanup.staleRemoved.length}`,
        `release action queue owners=${owners.length} items=${items.length}`,
        ownerSummary ? `release action queue owner summary=${ownerSummary}` : "release action queue owners are not listed",
        `release action queue command counts readOnly=${commandCounts.readOnly} approvalGated=${commandCounts.approvalGated}`,
        `release action queue mutationBoundaryPassed=${String(artifact.mutationBoundary?.passed ?? false)}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads release action queue evidence only; it does not approve install, patch, push, mirror, sign, apply, delete, or scale actions"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      actionQueue: missingReleaseActionQueueSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `Release action queue could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid release action queue evidence blocks owner action routing"
      ]
    };
  }
}

function normalizeCheckpointLaneStatus(
  status?: string
): "pass" | "needs-evidence" | "blocked" {
  if (status === "pass" || status === "blocked") {
    return status;
  }
  return "needs-evidence";
}

function mapLiveEvidenceHandoffStatus(
  artifact: LiveEvidenceHandoffArtifact
): OpsLensLiveEvidenceHandoffReadiness {
  if (artifact.status === "PASS") return "ready";
  if (artifact.status === "BLOCKED") return "blocked";
  return "needs-evidence";
}

function mapOcpNetworkHandoffStatus(
  artifact: OcpNetworkHandoffArtifact
): OpsLensOcpNetworkHandoffReadiness {
  if (artifact.status === "READY_FOR_LIVE_RECHECK" || artifact.status === "PASS") {
    return "ready";
  }
  if (artifact.status === "BLOCKED") return "blocked";
  return "needs-evidence";
}

function mapOcpAuthRbacPlanStatus(
  artifact: OcpAuthRbacPlanArtifact
): OpsLensOcpAuthRbacPlanReadiness {
  if (artifact.status === "READY_FOR_LIVE_CHECK" || artifact.status === "PASS") {
    return "ready";
  }
  if (artifact.status === "BLOCKED") return "blocked";
  return "needs-evidence";
}

function missingLiveEvidenceHandoffSummary(
  reason: string,
  status: OpsLensLiveEvidenceHandoffReadiness = "needs-evidence"
): OpsLensLiveEvidenceHandoffSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "handoffOnly",
    currentGapClassification: "missing",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    readOnlyCommands: [
      {
        id: "generate-live-handoff",
        command: "npm run verify:live-handoff",
        purpose: "Generate the read-only live evidence handoff artifact.",
        phase: "local-contract",
        requiresNetwork: false,
        mutation: false,
        writesEvidence: true
      }
    ],
    actionHints: [
      {
        id: "generate-live-handoff",
        severity: "blocked",
        summary: "Generate the live evidence handoff before asking an SRE to run live checks.",
        nextCheck: "npm run verify:live-handoff"
      }
    ],
    forbiddenCommands: ["oc apply", "oc delete", "oc patch", "oc scale"],
    missingEvidence: [reason],
    risk: [
      "Without a handoff artifact, live OCP/Lightspeed evidence collection remains manual and easy to drift."
    ],
    rollbackPath: [
      "Run npm run verify:live-handoff after refreshing OCP and install evidence."
    ]
  };
}

function missingOcpNetworkHandoffSummary(
  reason: string,
  status: OpsLensOcpNetworkHandoffReadiness = "needs-evidence"
): OpsLensOcpNetworkHandoffSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "handoffOnly",
    classification: "missing",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    target: {
      host: "missing",
      port: "missing",
      redactedBaseUrl: "missing",
      tokenConfigured: false,
      tlsVerify: false
    },
    markdownPath: "missing",
    adminRequests: [
      "Generate the OCP network handoff before opening a network or SRE review ticket."
    ],
    readOnlyCommands: [
      {
        id: "generate-ocp-network-handoff",
        command: "npm run evidence:ocp-network-handoff",
        purpose: "Generate the non-mutating OCP network handoff packet.",
        phase: "local-contract",
        requiresNetwork: false,
        mutation: false,
        writesEvidence: true
      }
    ],
    sourceArtifacts: [],
    missingEvidence: [reason],
    risk: [
      "Without a network handoff packet, tcp-timeout and route/firewall evidence can be lost between operators."
    ],
    rollbackPath: [
      "Run npm run evidence:ocp-network-handoff after refreshing OCP connectivity evidence."
    ]
  };
}

function missingOcpAuthRbacPlanSummary(
  reason: string,
  status: OpsLensOcpAuthRbacPlanReadiness = "needs-evidence"
): OpsLensOcpAuthRbacPlanSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "approvalPlanOnly",
    classification: "missing",
    preferredCredentialMode: "user-token-passthrough",
    fallbackCredentialMode: "short-lived-read-only-serviceaccount-token",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    target: {
      host: "missing",
      port: "missing",
      redactedBaseUrl: "missing",
      tokenConfigured: false,
      tlsVerify: false
    },
    markdownPath: "missing",
    requiredApprovals: ["cluster-admin", "security-reviewer"],
    rbac: {
      serviceAccount: "cywell-opslens/cywell-opslens-live-evidence-reader",
      clusterRole: "cywell-opslens-live-evidence-reader",
      ruleCount: 0,
      verbs: [],
      resources: [],
      readOnlyOnly: false,
      secretsIncluded: false
    },
    readOnlyCommands: [
      {
        id: "generate-ocp-auth-rbac-plan",
        command: "npm run evidence:ocp-auth-rbac-plan",
        purpose: "Generate the non-mutating OCP auth/RBAC approval packet.",
        phase: "local-contract",
        requiresNetwork: false,
        mutation: false,
        writesEvidence: true
      }
    ],
    approvalGatedCommands: [],
    adminRequests: [
      "Generate the OCP auth/RBAC approval packet before asking cluster-admin to approve fallback reader access."
    ],
    missingEvidence: [reason],
    risk: [
      "Without an auth/RBAC plan, credential and least-privilege reader approval can drift into manual notes."
    ],
    rollbackPath: [
      "Run npm run evidence:ocp-auth-rbac-plan after refreshing OCP connectivity evidence."
    ]
  };
}

function mapLiveEvidenceHandoffActionHints(
  artifact: LiveEvidenceHandoffArtifact
): OpsLensLiveEvidenceHandoffSummary["actionHints"] {
  return (artifact.currentGap?.actionHints ?? [])
    .filter((hint) => hint.id && hint.summary)
    .map((hint) => ({
      id: hint.id ?? "unknown",
      severity:
        hint.severity === "info"
          ? "info"
          : hint.severity === "warning"
            ? "warning"
            : "blocked",
      summary: hint.summary ?? "Review live evidence handoff.",
      nextCheck: hint.nextCheck ?? "npm run verify:live-handoff"
    }));
}

function getLiveEvidenceHandoffReadiness(): {
  status: OpsLensLiveEvidenceHandoffReadiness;
  evidence: string[];
  handoff: OpsLensLiveEvidenceHandoffSummary;
} {
  const evidencePath = liveEvidenceHandoffPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      handoff: missingLiveEvidenceHandoffSummary(
        `live evidence handoff is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:live-handoff to create the read-only live evidence handoff",
        "dashboard keeps live handoff as needs-evidence until the artifact exists",
        "handoff evidence lists read-only commands only and performs no cluster or registry mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LiveEvidenceHandoffArtifact;
    const status = mapLiveEvidenceHandoffStatus(artifact);
    const readOnlyCommands = (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      purpose: command.purpose ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true,
      writesEvidence: command.writesEvidence === true
    }));
    const actionHints = mapLiveEvidenceHandoffActionHints(artifact);

    return {
      status,
      handoff: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "handoffOnly",
        currentGapClassification:
          artifact.currentGap?.classification ?? "unknown",
        clusterMutationAttempted:
          artifact.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifact.registryMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        readOnlyCommands,
        actionHints,
        forbiddenCommands: artifact.forbiddenCommands ?? [],
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Live evidence handoff ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `handoff currentGap=${artifact.currentGap?.classification ?? "unknown"} commands=${readOnlyCommands.length}`,
        `actionMode=${artifact.actionMode ?? "unknown"} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")} registryMutationAttempted=${String(artifact.registryMutationAttempted ?? "unknown")}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads live handoff evidence only; it does not run live checks or mutating commands"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      handoff: missingLiveEvidenceHandoffSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `Live evidence handoff could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid live handoff evidence blocks overclaiming live readiness"
      ]
    };
  }
}

function getOcpNetworkHandoffReadiness(): {
  status: OpsLensOcpNetworkHandoffReadiness;
  evidence: string[];
  networkHandoff: OpsLensOcpNetworkHandoffSummary;
} {
  const evidencePath = ocpNetworkHandoffPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      networkHandoff: missingOcpNetworkHandoffSummary(
        `OCP network handoff is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run evidence:ocp-network-handoff to create the network/SRE handoff packet",
        "dashboard keeps OCP network handoff as needs-evidence until the artifact exists",
        "network handoff evidence lists read-only commands only and performs no cluster or registry mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OcpNetworkHandoffArtifact;
    const status = mapOcpNetworkHandoffStatus(artifact);
    const target = artifact.target ?? {};
    const readOnlyCommands = (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      purpose: command.purpose ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true,
      writesEvidence: command.writesEvidence === true
    }));
    const sourceArtifacts = (artifact.sourceArtifacts ?? []).map((source) => ({
      id: source.id ?? "unknown",
      label: source.label ?? "unknown",
      status: source.status ?? "unknown",
      fresh: source.fresh === true,
      required: source.required === true,
      headSha: source.headSha ?? "unknown",
      worktreeDirty: source.worktreeDirty ?? "unknown"
    }));

    return {
      status,
      networkHandoff: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "handoffOnly",
        classification: artifact.diagnostics?.classification ?? "unknown",
        clusterMutationAttempted:
          artifact.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifact.registryMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        target: {
          host: target.host ?? "unknown",
          port: target.port ?? "unknown",
          redactedBaseUrl: target.redactedBaseUrl ?? "unknown",
          tokenConfigured: target.tokenConfigured === true,
          tlsVerify: target.tlsVerify === true
        },
        markdownPath: artifact.markdownOut ?? "unknown",
        adminRequests: artifact.adminRequests ?? [],
        readOnlyCommands,
        sourceArtifacts,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP network handoff ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `network classification=${artifact.diagnostics?.classification ?? "unknown"} commands=${readOnlyCommands.length}`,
        `network handoff markdown=${artifact.markdownOut ?? "unknown"}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads OCP network handoff evidence only; it does not run live checks or mutating commands"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      networkHandoff: missingOcpNetworkHandoffSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `OCP network handoff could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid OCP network handoff evidence blocks overclaiming network readiness"
      ]
    };
  }
}

function getOcpAuthRbacPlanReadiness(): {
  status: OpsLensOcpAuthRbacPlanReadiness;
  evidence: string[];
  authRbacPlan: OpsLensOcpAuthRbacPlanSummary;
} {
  const evidencePath = ocpAuthRbacPlanPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      authRbacPlan: missingOcpAuthRbacPlanSummary(
        `OCP auth/RBAC plan is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run evidence:ocp-auth-rbac-plan to create the cluster-admin approval packet",
        "dashboard keeps OCP auth/RBAC plan as needs-evidence until the artifact exists",
        "auth/RBAC plan evidence lists approval-gated commands only and performs no cluster or registry mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OcpAuthRbacPlanArtifact;
    const status = mapOcpAuthRbacPlanStatus(artifact);
    const target = artifact.target ?? {};
    const rbac = artifact.rbac ?? {};
    const serviceAccount = rbac.serviceAccount ?? {};
    const clusterRole = rbac.clusterRole ?? {};
    const readOnlyCommands = (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      purpose: command.purpose ?? "unknown",
      phase: command.phase ?? "unknown",
      requiresNetwork: command.requiresNetwork === true,
      mutation: command.mutation === true,
      writesEvidence: command.writesEvidence === true
    }));
    const approvalGatedCommands = (artifact.approvalGatedCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      command: command.command ?? "unknown",
      phase: command.phase ?? "unknown",
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true
    }));

    return {
      status,
      authRbacPlan: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "approvalPlanOnly",
        classification: artifact.diagnostics?.classification ?? "unknown",
        preferredCredentialMode:
          artifact.preferredCredentialMode ?? "user-token-passthrough",
        fallbackCredentialMode:
          artifact.fallbackCredentialMode ??
          "short-lived-read-only-serviceaccount-token",
        clusterMutationAttempted:
          artifact.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifact.registryMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        target: {
          host: target.host ?? "unknown",
          port: target.port ?? "unknown",
          redactedBaseUrl: target.redactedBaseUrl ?? "unknown",
          tokenConfigured: target.tokenConfigured === true,
          tlsVerify: target.tlsVerify === true
        },
        markdownPath: artifact.markdownOut ?? "unknown",
        requiredApprovals: artifact.requiredApprovals ?? [
          "cluster-admin",
          "security-reviewer"
        ],
        rbac: {
          serviceAccount:
            `${serviceAccount.namespace ?? "unknown"}/${serviceAccount.name ?? "unknown"}`,
          clusterRole: clusterRole.name ?? "unknown",
          ruleCount: clusterRole.ruleCount ?? 0,
          verbs: clusterRole.verbs ?? [],
          resources: clusterRole.resources ?? [],
          readOnlyOnly: clusterRole.readOnlyOnly === true,
          secretsIncluded: clusterRole.secretsIncluded === true
        },
        readOnlyCommands,
        approvalGatedCommands,
        adminRequests: artifact.adminRequests ?? [],
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP auth/RBAC plan ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `auth/RBAC classification=${artifact.diagnostics?.classification ?? "unknown"} serviceAccount=${serviceAccount.namespace ?? "unknown"}/${serviceAccount.name ?? "unknown"} readOnlyCommands=${readOnlyCommands.length} approvalGated=${approvalGatedCommands.length}`,
        `auth/RBAC markdown=${artifact.markdownOut ?? "unknown"} secretsIncluded=${String(clusterRole.secretsIncluded ?? "unknown")} readOnlyOnly=${String(clusterRole.readOnlyOnly ?? "unknown")}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads OCP auth/RBAC plan evidence only; it does not apply RBAC or create tokens"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      authRbacPlan: missingOcpAuthRbacPlanSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `OCP auth/RBAC plan could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid OCP auth/RBAC evidence blocks overclaiming fallback reader readiness"
      ]
    };
  }
}

function getEvidenceCheckpointReadiness(): {
  status: OpsLensEvidenceCheckpointReadiness;
  evidence: string[];
  checkpoint: OpsLensEvidenceCheckpointSummary;
} {
  const evidencePath = evidenceCheckpointPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      checkpoint: {
        status: "needs-evidence",
        artifactStatus: "missing",
        headSha: "missing",
        worktreeDirty: false,
        lanes: [
          {
            id: "evidenceCheckpoint",
            label: "Evidence checkpoint",
            status: "needs-evidence",
            artifactStatus: "missing"
          }
        ],
        missingEvidence: [
          `evidence checkpoint is missing at ${evidencePath}`
        ],
        blockers: [],
        risk: [
          "No consolidated evidence checkpoint is available; operators must inspect individual gate artifacts manually."
        ],
        rollbackPath: [
          "Run npm run verify:evidence-checkpoint after refreshing gate evidence."
        ]
      },
      evidence: [
        "run npm run verify:evidence-checkpoint to create the consolidated evidence board",
        "dashboard keeps the checkpoint as needs-evidence until the artifact exists",
        "checkpoint evidence reads local artifacts only and performs no cluster or registry mutation"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as EvidenceCheckpointArtifact;
    const status = mapEvidenceCheckpointStatus(artifact);
    const lanes = (artifact.lanes ?? []).map((lane) => ({
      id: lane.id ?? "unknown",
      label: lane.label ?? "unknown",
      status: normalizeCheckpointLaneStatus(lane.status),
      artifactStatus: lane.artifactStatus ?? "unknown"
    }));
    const laneSummary = lanes
      .map((lane) => `${lane.label}:${lane.status}`)
      .join(", ");

    return {
      status,
      checkpoint: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        lanes,
        missingEvidence: artifact.missingEvidence ?? [],
        blockers: artifact.blockers ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Evidence checkpoint ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `checkpoint generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        laneSummary
          ? `checkpoint lanes=${laneSummary}`
          : "checkpoint lane summary is not listed",
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        ...(artifact.blockers ?? []).slice(0, 3),
        "admin overview reads checkpoint evidence only; it does not build, push, mirror, patch, or apply resources"
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      checkpoint: {
        status: "blocked",
        artifactStatus: "invalid",
        headSha: "unknown",
        worktreeDirty: false,
        lanes: [],
        missingEvidence: [],
        blockers: [
          error instanceof Error ? error.message : "unknown evidence parse error"
        ],
        risk: [
          "Invalid checkpoint evidence blocks overclaiming release or install readiness."
        ],
        rollbackPath: [
          "Regenerate checkpoint evidence before attempting install or publish approval."
        ]
      },
      evidence: [
        `Evidence checkpoint could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid checkpoint evidence blocks overclaiming readiness"
      ]
    };
  }
}

const aiopsRequiredMetricQueries = [
  "firing-alert",
  "pod-restarts",
  "pod-cpu",
  "pod-memory"
];

const aiopsTriggerEvidenceRequired = [
  "alert",
  "logs",
  "events",
  "metrics",
  "runbookCitations"
];

function mapAiopsMetricQueries(
  artifact: AiopsIncidentPipelineArtifact
): OpsLensAiopsIncidentPipelineSummary["metricQueries"] {
  const requiredQueries =
    artifact.pipeline?.requiredMetricQueries ?? aiopsRequiredMetricQueries;
  const liveQueries = artifact.liveSmoke?.incident?.metricQueries ?? [];
  const queryByName = new Map(liveQueries.map((query) => [query.name, query]));

  return requiredQueries.map((name) => {
    const query = queryByName.get(name);
    const sampleCount =
      typeof query?.sampleCount === "number" ? query.sampleCount : 0;
    const status: OpsLensAiopsIncidentPipelineSummary["metricQueries"][number]["status"] =
      sampleCount > 0 ? "ready" : query?.enabled === false ? "disabled" : "missing";
    const missingEvidence =
      status === "ready"
        ? []
        : [
            query?.error
              ? `metrics/${name}: ${query.error}`
              : `metrics/${name}: no live sample evidence is available`
          ];

    return {
      name,
      query: name,
      status,
      sampleCount,
      evidence:
        status === "ready"
          ? [`${name} returned ${sampleCount} live sample(s)`]
          : [],
      missingEvidence
    };
  });
}

function getAiopsIncidentPipelineReadiness(): {
  status: OpsLensAiopsIncidentPipelineReadiness;
  evidence: string[];
  incidentPipeline: OpsLensAiopsIncidentPipelineSummary;
} {
  const evidencePath = aiopsIncidentPipelinePath();

  if (!existsSync(evidencePath)) {
    const missingEvidence = [
      `AI Ops incident pipeline evidence is missing at ${evidencePath}`
    ];
    const evidence = [
      "run npm run verify:aiops to create live AI Ops incident pipeline evidence",
      "dashboard keeps the AI Ops pipeline as needs-live-evidence until the artifact exists",
      "verify:aiops starts the public API and performs read-only OCP evidence reads only"
    ];

    return {
      status: "needs-live-evidence",
      evidence,
      incidentPipeline: {
        status: "needs-live-evidence",
        artifactStatus: "missing",
        actionMode: "readOnlyEvidenceOnly",
        headSha: "missing",
        worktreeDirty: false,
        liveSmokeStatus: "missing",
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        vectorWriteAttempted: false,
        ingestionJobCreated: false,
        mutationAllowedByThisVerifier: false,
        requiredMetricQueries: aiopsRequiredMetricQueries,
        metricQueries: aiopsRequiredMetricQueries.map((name) => ({
          name,
          query: name,
          status: "missing",
          sampleCount: 0,
          evidence: [],
          missingEvidence: [`metrics/${name}: evidence artifact is missing`]
        })),
        triggerEvidenceRequired: aiopsTriggerEvidenceRequired,
        acceptance: ["AC-AIOPS-001", "AC-AIOPS-002", "AC-DASH-001"],
        evidence,
        missingEvidence,
        risk: [
          "Without the AI Ops pipeline artifact, the dashboard cannot prove live log/event/metric evidence routing."
        ],
        rollbackPath: [
          "Regenerate the artifact with npm run verify:aiops; no cluster rollback is required because the verifier is read-only."
        ]
      }
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as AiopsIncidentPipelineArtifact;
    const status = mapAiopsIncidentPipelineStatus(artifact);
    const requiredMetricQueries =
      artifact.pipeline?.requiredMetricQueries ?? aiopsRequiredMetricQueries;
    const triggerEvidenceRequired =
      artifact.pipeline?.triggerEvidenceRequired ?? aiopsTriggerEvidenceRequired;
    const selectedPodSource = artifact.liveSmoke?.selectedPod;
    const selectedPod =
      selectedPodSource?.namespace && selectedPodSource.name
        ? {
            namespace: selectedPodSource.namespace,
            name: selectedPodSource.name
          }
        : undefined;
    const liveMissingEvidence = [
      ...(artifact.liveSmoke?.missingEvidence ?? []),
      ...(artifact.liveSmoke?.incident?.missingEvidence ?? [])
    ];
    const metricQueries = mapAiopsMetricQueries(artifact);
    const evidence = [
      `AI Ops incident pipeline ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
      `verify:aiops generated ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
      `liveSmoke=${artifact.liveSmoke?.status ?? "missing"} actionMode=${artifact.liveSmoke?.incident?.actionMode ?? artifact.actionMode ?? "unknown"}`,
      `triggerEvidence=${triggerEvidenceRequired.join(",")}`,
      `mutationBoundary cluster=${String(artifact.clusterMutationAttempted ?? false)} registry=${String(artifact.registryMutationAttempted ?? false)} vector=${String(artifact.vectorWriteAttempted ?? false)} ingestion=${String(artifact.ingestionJobCreated ?? false)} allowed=${String(artifact.mutationAllowedByThisVerifier ?? false)}`,
      ...(artifact.evidence ?? []).slice(0, 3)
    ];

    return {
      status,
      evidence,
      incidentPipeline: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "readOnlyEvidenceOnly",
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        liveSmokeStatus: artifact.liveSmoke?.status ?? "missing",
        selectedPod,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        vectorWriteAttempted: artifact.vectorWriteAttempted === true,
        ingestionJobCreated: artifact.ingestionJobCreated === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredMetricQueries,
        metricQueries,
        triggerEvidenceRequired,
        acceptance: artifact.acceptance ?? [
          "AC-AIOPS-001",
          "AC-AIOPS-002",
          "AC-DASH-001"
        ],
        evidence,
        missingEvidence: [
          ...(artifact.missingEvidence ?? []),
          ...liveMissingEvidence,
          ...metricQueries.flatMap((query) => query.missingEvidence)
        ],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      }
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown AI Ops evidence parse error";
    const evidence = [
      `AI Ops incident pipeline could not be parsed from ${evidencePath}`,
      message,
      "invalid AI Ops evidence blocks overclaiming live incident readiness"
    ];

    return {
      status: "failed",
      evidence,
      incidentPipeline: {
        status: "failed",
        artifactStatus: "invalid",
        actionMode: "readOnlyEvidenceOnly",
        headSha: "unknown",
        worktreeDirty: false,
        liveSmokeStatus: "invalid",
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        vectorWriteAttempted: false,
        ingestionJobCreated: false,
        mutationAllowedByThisVerifier: false,
        requiredMetricQueries: aiopsRequiredMetricQueries,
        metricQueries: [],
        triggerEvidenceRequired: aiopsTriggerEvidenceRequired,
        acceptance: ["AC-AIOPS-001", "AC-AIOPS-002", "AC-DASH-001"],
        evidence,
        missingEvidence: [message],
        risk: [
          "Invalid AI Ops pipeline evidence blocks confident remediation planning claims."
        ],
        rollbackPath: [
          "Regenerate the artifact with npm run verify:aiops before publishing dashboard evidence."
        ]
      }
    };
  }
}

export async function getOpsLensAdminOverview(): Promise<OpsLensAdminOverviewResponse> {
  const documents = getOpsLensRagDocuments();
  const usedTokens = 784_200;
  const budgetTokens = 1_500_000;
  const runtimeReadiness = await getOpsLensRuntimeReadiness();
  const lightspeedReadiness = getLightspeedMcpReadiness();
  const imageBuildReadiness = getImageBuildReadiness();
  const ownedImageProvenanceReadiness = getOwnedImageProvenanceReadiness();
  const externalRuntimeImagesReadiness = getExternalRuntimeImagesPlanReadiness();
  const externalRuntimeReviewPacketReadiness =
    getExternalRuntimeReviewPacketReadiness();
  const ocpConnectivityReadiness = getOcpConnectivityDiagnosticReadiness();
  const operatorDryRunReadiness = getOperatorDryRunReadiness();
  const installPlanReadiness = getInstallApprovalPlanReadiness();
  const certificationReadiness = getCertificationReadiness();
  const catalogToolchainReadiness = getCatalogToolchainReadiness();
  const securityScanReadiness = getSecurityScanPlanReadiness();
  const releasePublishReadiness = getReleasePublishPlanReadiness();
  const releaseEvidenceRefreshReadiness = getReleaseEvidenceRefreshReadiness();
  const releaseEvidenceBundleReadiness = getReleaseEvidenceBundleReadiness();
  const releaseActionQueueReadiness = getReleaseActionQueueReadiness();
  const evidenceCheckpointReadiness = getEvidenceCheckpointReadiness();
  const aiopsIncidentPipelineReadiness = getAiopsIncidentPipelineReadiness();
  const liveHandoffReadiness = getLiveEvidenceHandoffReadiness();
  const ocpNetworkHandoffReadiness = getOcpNetworkHandoffReadiness();
  const ocpAuthRbacPlanReadiness = getOcpAuthRbacPlanReadiness();
  const installReadinessEvidence = [
    releaseEvidenceRefreshReadiness.evidence[0],
    evidenceCheckpointReadiness.evidence[0],
    aiopsIncidentPipelineReadiness.evidence[0],
    liveHandoffReadiness.evidence[0],
    ocpNetworkHandoffReadiness.evidence[0],
    ocpAuthRbacPlanReadiness.evidence[0],
    ocpConnectivityReadiness.evidence[0],
    lightspeedReadiness.evidence[0],
    operatorDryRunReadiness.evidence[0],
    installPlanReadiness.evidence[0],
    certificationReadiness.evidence[0],
    catalogToolchainReadiness.evidence[0],
    imageBuildReadiness.evidence[0],
    ownedImageProvenanceReadiness.evidence[0],
    externalRuntimeImagesReadiness.evidence[0],
    externalRuntimeReviewPacketReadiness.evidence[0],
    securityScanReadiness.evidence[0],
    releasePublishReadiness.evidence[0],
    releaseEvidenceBundleReadiness.evidence[0],
    releaseActionQueueReadiness.evidence[0],
    ...ocpConnectivityReadiness.evidence.slice(1),
    ...lightspeedReadiness.evidence.slice(1),
    ...operatorDryRunReadiness.evidence.slice(1),
    ...installPlanReadiness.evidence.slice(1),
    ...certificationReadiness.evidence.slice(1),
    ...catalogToolchainReadiness.evidence.slice(1),
    ...imageBuildReadiness.evidence.slice(1),
    ...ownedImageProvenanceReadiness.evidence.slice(1),
    ...externalRuntimeImagesReadiness.evidence.slice(1),
    ...externalRuntimeReviewPacketReadiness.evidence.slice(1),
    ...securityScanReadiness.evidence.slice(1),
    ...releasePublishReadiness.evidence.slice(1),
    ...releaseEvidenceRefreshReadiness.evidence.slice(1),
    ...releaseEvidenceBundleReadiness.evidence.slice(1),
    ...releaseActionQueueReadiness.evidence.slice(1),
    ...aiopsIncidentPipelineReadiness.evidence.slice(1),
    ...liveHandoffReadiness.evidence.slice(1),
    ...ocpNetworkHandoffReadiness.evidence.slice(1),
    ...ocpAuthRbacPlanReadiness.evidence.slice(1),
    ...evidenceCheckpointReadiness.evidence.slice(1)
  ].filter((item): item is string => Boolean(item));

  return {
    generatedAt: new Date().toISOString(),
    source: "local-contract",
    lightspeed: getLightspeedToolSurface(),
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
      model: runtimeModelName(),
      route: "cywell-private-rag-local-vector/v0.1",
      replicas: 2,
      readyReplicas: runtimeReadiness.status === "ready" ? 2 : 0,
      readiness: runtimeReadiness,
      gpu: {
        available: runtimeReadiness.modelRuntime.status === "ready",
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
          alert: {
            name: "PodCrashLooping",
            severity: "warning",
            namespace: "payments-prod",
            workload: "payments-api"
          },
          targetName: "payments-api",
          targetConfidence: "medium",
          currentValue: "2Gi",
          currentValueSource: "runbook-baseline",
          currentValueObservedInCluster: false,
          triggerEvidence: {
            logs: {
              windowMinutes: 10,
              sinceSeconds: 600,
              currentRead: true,
              previousRead: false,
              redacted: true,
              pod: "payments-api",
              missingEvidence: []
            },
            events: {
              read: true,
              count: 3,
              redacted: true,
              missingEvidence: []
            },
            metrics: {
              windowMinutes: 10,
              enabled: true,
              reachable: true,
              queries: [
                { name: "firing-alert", status: "ready", sampleCount: 1 },
                { name: "pod-restarts", status: "ready", sampleCount: 6 },
                { name: "pod-cpu", status: "missing", sampleCount: 0 },
                { name: "pod-memory", status: "ready", sampleCount: 12 }
              ],
              missingEvidence: ["metrics/pod-cpu: monitoring proxy disabled or no matching CPU series"]
            },
            runbookCitations: [
              "customer-runbook:payments-api-crashloop",
              "customer-runbook:payments-api-rollback"
            ]
          },
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
    aiops: {
      incidentPipeline: aiopsIncidentPipelineReadiness.incidentPipeline
    },
    installReadiness: {
      lightspeedMcp: lightspeedReadiness.status,
      consoleDashboard: "prototype",
      operatorPackaging: "draft",
      ocpConnectivity: ocpConnectivityReadiness.status,
      connectivity: ocpConnectivityReadiness.connectivity,
      operatorDryRun: operatorDryRunReadiness.status,
      installPlan: installPlanReadiness.status,
      approvalPlan: installPlanReadiness.plan,
      certificationReadiness: certificationReadiness.status,
      certificationPlan: certificationReadiness.plan,
      catalogToolchain: catalogToolchainReadiness.status,
      catalogToolchainPlan: catalogToolchainReadiness.plan,
      imageBuilds: imageBuildReadiness.status,
      ownedImageProvenance: ownedImageProvenanceReadiness.status,
      ownedImageProvenancePlan: ownedImageProvenanceReadiness.plan,
      externalRuntimeImages: externalRuntimeImagesReadiness.status,
      externalRuntimePlan: externalRuntimeImagesReadiness.plan,
      externalRuntimeReviewPacket: externalRuntimeReviewPacketReadiness.status,
      externalRuntimeReview: externalRuntimeReviewPacketReadiness.review,
      securityScan: securityScanReadiness.status,
      securityScanPlan: securityScanReadiness.plan,
      releasePublish: releasePublishReadiness.status,
      releasePlan: releasePublishReadiness.plan,
      releaseRefresh: releaseEvidenceRefreshReadiness.status,
      refresh: releaseEvidenceRefreshReadiness.refresh,
      releaseEvidenceBundle: releaseEvidenceBundleReadiness.status,
      bundle: releaseEvidenceBundleReadiness.bundle,
      releaseActionQueue: releaseActionQueueReadiness.status,
      actionQueue: releaseActionQueueReadiness.actionQueue,
      evidenceCheckpoint: evidenceCheckpointReadiness.status,
      checkpoint: evidenceCheckpointReadiness.checkpoint,
      liveHandoff: liveHandoffReadiness.status,
      handoff: liveHandoffReadiness.handoff,
      ocpNetworkHandoff: ocpNetworkHandoffReadiness.status,
      networkHandoff: ocpNetworkHandoffReadiness.networkHandoff,
      ocpAuthRbacPlan: ocpAuthRbacPlanReadiness.status,
      authRbacPlan: ocpAuthRbacPlanReadiness.authRbacPlan,
      certification:
        certificationReadiness.status === "ready-for-review" ? "ready" : "draft",
      evidence: [
        ...installReadinessEvidence,
        "Stage 1 MCP contract has verifier coverage",
        "Stage 2 incident packet has logs/events/metrics coverage",
        "Stage 2 AI Ops incident pipeline is validated by npm run verify:aiops",
        "Stage 3 dashboard is now served by /api/opslens/admin/overview",
        "Stage 4 Operator package skeleton is validated by npm run verify:operator",
        "Stage 4 live API preflight is validated by npm run verify:operator:dry-run",
        "Live OCP connectivity is classified by npm run verify:ocp:connectivity",
        "Stage 4 OCP network/SRE handoff is generated by npm run evidence:ocp-network-handoff",
        "Stage 4 OCP auth/RBAC approval packet is generated by npm run evidence:ocp-auth-rbac-plan",
        "Stage 4 mutating install approval plan is generated by npm run verify:install-plan",
        "Stage 4 live evidence handoff is generated by npm run verify:live-handoff",
        "Stage 4 reconcile core validates ValidateOnly and explicit PatchOLSConfig through npm run verify:operator:reconcile",
        "Stage 5 catalog and certification readiness draft is validated by npm run verify:certification",
        "Stage 5 catalog toolchain readiness is validated by npm run verify:catalog-toolchain",
        "Stage 5 image build readiness is validated by npm run verify:images",
        "Stage 5 owned image provenance is validated by npm run verify:owned-image-provenance",
        "Stage 5 external runtime evidence plan is generated by npm run verify:external-runtime-plan",
        "Stage 5 external runtime review packet is generated by npm run evidence:external-runtime:review-packet",
        "Stage 5 security scan and SBOM plan is generated by npm run verify:security-scan-plan",
        "Stage 5 release publish approval plan is generated by npm run verify:release-plan",
        "Stage 5 release evidence refresh chain is generated by npm run verify:release-refresh",
        "Stage 5 release evidence bundle is generated by npm run verify:release-evidence-bundle",
        "Stage 5 release action queue is generated by npm run evidence:release-action-queue",
        "Current-head release/install evidence is summarized by npm run verify:evidence-checkpoint"
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

function assertRagApprovalQueueSubmitRequest(
  request: OpsLensRagApprovalQueueSubmitRequest
): asserts request is OpsLensRagApprovalQueueSubmitRequest {
  assertRagEvidenceExportRequest(request);
  if (typeof request.requestedBy !== "string" || request.requestedBy.trim() === "") {
    throw new Error("requestedBy is required for RAG approval queue submission");
  }
  if (typeof request.reason !== "string" || request.reason.trim() === "") {
    throw new Error("reason is required for RAG approval queue submission");
  }
  if (request.ticketRef !== undefined && typeof request.ticketRef !== "string") {
    throw new Error("ticketRef must be a string");
  }
}

function ragApprovalQueuePersistenceMode() {
  return envBoolean("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_PERSISTENCE", false)
    ? "enabled"
    : "disabled";
}

function ragApprovalQueueDir() {
  return (
    process.env.CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_DIR ??
    join(repoRoot, "test-results", "rag-approval-queue")
  );
}

export async function submitOpsLensRagApprovalQueue(
  request: OpsLensRagApprovalQueueSubmitRequest
): Promise<OpsLensRagApprovalQueueSubmissionResponse> {
  assertRagApprovalQueueSubmitRequest(request);
  return submitRagApprovalQueueItem(localRagIndex, request, {
    persistenceMode: ragApprovalQueuePersistenceMode(),
    queueDir: ragApprovalQueueDir()
  });
}

export async function listOpsLensRagApprovalQueue(): Promise<OpsLensRagApprovalQueueInventoryResponse> {
  return listRagApprovalQueueItems({
    persistenceMode: ragApprovalQueuePersistenceMode(),
    queueDir: ragApprovalQueueDir(),
    maxItems: 20
  });
}

function assertRagApprovalQueueReviewRequest(
  request: OpsLensRagApprovalQueueReviewRequest
): asserts request is OpsLensRagApprovalQueueReviewRequest {
  if (typeof request.tenantId !== "string" || request.tenantId.trim() === "") {
    throw new Error("tenantId is required for RAG approval queue review");
  }
  if (typeof request.queueItemId !== "string" || request.queueItemId.trim() === "") {
    throw new Error("queueItemId is required for RAG approval queue review");
  }
  if (typeof request.reviewer !== "string" || request.reviewer.trim() === "") {
    throw new Error("reviewer is required for RAG approval queue review");
  }
  if (typeof request.role !== "string" || request.role.trim() === "") {
    throw new Error("role is required for RAG approval queue review");
  }
  if (request.decision !== "approve" && request.decision !== "reject") {
    throw new Error("decision must be approve or reject");
  }
  if (typeof request.reason !== "string" || request.reason.trim() === "") {
    throw new Error("reason is required for RAG approval queue review");
  }
  if (request.ticketRef !== undefined && typeof request.ticketRef !== "string") {
    throw new Error("ticketRef must be a string");
  }
}

export async function reviewOpsLensRagApprovalQueue(
  request: OpsLensRagApprovalQueueReviewRequest
): Promise<OpsLensRagApprovalQueueReviewResponse> {
  assertRagApprovalQueueReviewRequest(request);
  return reviewRagApprovalQueueItem(request, {
    persistenceMode: ragApprovalQueuePersistenceMode(),
    queueDir: ragApprovalQueueDir()
  });
}

function assertRagApprovalQueueIngestionPlanRequest(
  request: OpsLensRagApprovalQueueIngestionPlanRequest
): asserts request is OpsLensRagApprovalQueueIngestionPlanRequest {
  if (typeof request.tenantId !== "string" || request.tenantId.trim() === "") {
    throw new Error("tenantId is required for RAG ingestion planning");
  }
  if (typeof request.queueItemId !== "string" || request.queueItemId.trim() === "") {
    throw new Error("queueItemId is required for RAG ingestion planning");
  }
  if (typeof request.requestedBy !== "string" || request.requestedBy.trim() === "") {
    throw new Error("requestedBy is required for RAG ingestion planning");
  }
  if (typeof request.reason !== "string" || request.reason.trim() === "") {
    throw new Error("reason is required for RAG ingestion planning");
  }
  if (request.ticketRef !== undefined && typeof request.ticketRef !== "string") {
    throw new Error("ticketRef must be a string");
  }
}

export async function planOpsLensRagIngestion(
  request: OpsLensRagApprovalQueueIngestionPlanRequest
): Promise<OpsLensRagApprovalQueueIngestionPlanResponse> {
  assertRagApprovalQueueIngestionPlanRequest(request);
  return planRagApprovalQueueIngestionJob(request, {
    persistenceMode: ragApprovalQueuePersistenceMode(),
    queueDir: ragApprovalQueueDir()
  });
}

export function createPlanOnlyRemediationProposal(params: {
  namespace: string;
  workload: string;
  alert?: OpsLensRemediationProposal["triggerEvidence"]["alert"];
  targetApiVersion?: string;
  targetKind?: string;
  targetName?: string;
  targetConfidence?: "high" | "medium" | "low";
  container?: string;
  currentValue?: string;
  currentValueSource?: OpsLensRemediationProposal["currentValue"]["source"];
  currentValueObservedInCluster?: boolean;
  proposedValue?: string;
  triggerEvidence?: Partial<OpsLensRemediationProposal["triggerEvidence"]>;
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
  const triggerEvidence = {
    alert: params.triggerEvidence?.alert ?? params.alert,
    logs: {
      windowMinutes: params.triggerEvidence?.logs?.windowMinutes ?? 10,
      sinceSeconds: params.triggerEvidence?.logs?.sinceSeconds ?? 600,
      currentRead: params.triggerEvidence?.logs?.currentRead ?? false,
      previousRead: params.triggerEvidence?.logs?.previousRead ?? false,
      redacted: true as const,
      pod: params.triggerEvidence?.logs?.pod,
      missingEvidence: uniqueStrings(
        params.triggerEvidence?.logs?.missingEvidence ?? [
          "live pod log evidence was not attached to this proposal"
        ]
      )
    },
    events: {
      read: params.triggerEvidence?.events?.read ?? false,
      count: params.triggerEvidence?.events?.count ?? 0,
      redacted: true as const,
      missingEvidence: uniqueStrings(
        params.triggerEvidence?.events?.missingEvidence ?? [
          "live event evidence was not attached to this proposal"
        ]
      )
    },
    metrics: {
      windowMinutes: params.triggerEvidence?.metrics?.windowMinutes ?? 10,
      enabled: params.triggerEvidence?.metrics?.enabled ?? false,
      reachable: params.triggerEvidence?.metrics?.reachable ?? false,
      queries: params.triggerEvidence?.metrics?.queries ?? [],
      missingEvidence: uniqueStrings(
        params.triggerEvidence?.metrics?.missingEvidence ?? [
          "Prometheus metric evidence was not attached to this proposal"
        ]
      )
    },
    runbookCitations: uniqueStrings(
      params.triggerEvidence?.runbookCitations ?? []
    )
  };
  const evidence = uniqueStrings([
    "propose_remediation returns a plan-only artifact and never mutates cluster state",
    "customer runbook recommends increasing memory only after log, event, and metric evidence are reviewed",
    "triggerEvidence records alert, log, event, metric, and runbook citation inputs for the YAML proposal",
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
    triggerEvidence,
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

export async function createOpsLensToolResponse(
  request: OpsLensToolRequest
): Promise<OpsLensToolResponse> {
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
  const runtimeRag = await retrieveRuntimeRagCitations({
    tenantId: request.input.tenantId,
    question,
    maxDocuments
  });
  const localCitations = retrieveRunbookCitations(
    request.input.tenantId,
    question,
    maxDocuments
  );
  const citations =
    runtimeRag.citations.length > 0 ? runtimeRag.citations : localCitations;
  const runtimeRagAudit: OpsLensRuntimeRagAudit = {
    ...runtimeRag.audit,
    localFallbackUsed: runtimeRag.citations.length === 0,
    citationsUsed:
      runtimeRag.citations.length > 0 ? "runtime" : "local-fallback"
  };
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
  const profile = toolResponseProfile({
    tool: request.tool,
    namespace,
    workload,
    question,
    citations,
    runtimeRagAudit
  });

  return {
    tool: request.tool,
    requestId,
    generatedAt: new Date().toISOString(),
    actionMode: request.tool === "propose_remediation" ? "planOnly" : "readOnly",
    summary: profile.summary,
    suspectedCauses: profile.suspectedCauses,
    recommendedSteps: profile.recommendedSteps,
    proposedYamlPatch: remediationProposal?.yamlPatch,
    remediationProposal,
    citations,
    missingEvidence: profile.missingEvidence,
    risks: profile.risks,
    rollbackPath: profile.rollbackPath,
    consoleLinks: profile.consoleLinks,
    evidence: profile.evidence,
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
      model:
        runtimeRagAudit.citationsUsed === "runtime"
          ? "cywell-private-rag-qdrant-vllm-hybrid/v0.1"
          : "cywell-private-rag-local-vector/v0.1",
      runtimeRag: runtimeRagAudit,
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

export async function handleOpsLensMcpRequest(
  request: McpJsonRpcRequest
): Promise<McpJsonRpcResponse | undefined> {
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
      const result = await createOpsLensToolResponse({
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
