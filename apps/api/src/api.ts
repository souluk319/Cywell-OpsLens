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
  OpsLensAiopsMonitoringProxyTicketPacket,
  OpsLensCatalogToolchainReadiness,
  OpsLensCatalogToolchainSummary,
  OpsLensCatalogToolchainTicketPacket,
  OpsLensCertificationReadiness,
  OpsLensCertificationReadinessSummary,
  OpsLensCertificationToolingTicketPacket,
  OpsLensCitation,
  OpsLensCommunityOperatorSubmissionReadiness,
  OpsLensCommunityOperatorSubmissionSummary,
  OpsLensEnvContractReadiness,
  OpsLensEnvContractSummary,
  OpsLensEvidenceCheckpointReadiness,
  OpsLensEvidenceCheckpointSummary,
  OpsLensExternalRuntimeImagesPlanSummary,
  OpsLensExternalRuntimeFinalEvidenceTicketPacket,
  OpsLensExternalRuntimeProductTicketPacket,
  OpsLensExternalRuntimeReadiness,
  OpsLensExternalRuntimeRegistryTicketPacket,
  OpsLensExternalRuntimeReviewPacketReadiness,
  OpsLensExternalRuntimeReviewPacketSummary,
  OpsLensImageBuildReadiness,
  OpsLensInstallApprovalPlanSummary,
  OpsLensInstallApprovalTicketPacket,
  OpsLensInstallPlanReadiness,
  OpsLensLightspeedExtensionPointReadiness,
  OpsLensLightspeedExtensionPointSummary,
  OpsLensLightspeedRegistrationApprovalPlanSummary,
  OpsLensLightspeedIntegrationHandoffSummary,
  OpsLensLiveEvidenceHandoffReadiness,
  OpsLensLiveEvidenceHandoffSummary,
  OpsLensLightspeedMcpReadiness,
  OpsLensMcpToolCategory,
  OpsLensMcpToolSurfaceItem,
  OpsLensOcpConnectivityDiagnosticSummary,
  OpsLensOcpConnectivityReadiness,
  OpsLensOcpCredentialHygieneSummary,
  OpsLensOcpAuthRbacPlanReadiness,
  OpsLensOcpAuthRbacPlanSummary,
  OpsLensOcpNetworkHandoffApiFallbackReadiness,
  OpsLensOcpNetworkHandoffApiFallbackSummary,
  OpsLensOcpNetworkHandoffReadiness,
  OpsLensOcpNetworkHandoffSummary,
  OpsLensOperatorPackageReadiness,
  OpsLensOperatorPackageSummary,
  OpsLensOperatorDryRunReadiness,
  OpsLensOperatorRuntimeBoundaryReadiness,
  OpsLensOperatorRuntimeBoundarySummary,
  OpsLensOwnedImageProvenanceReadiness,
  OpsLensOwnedImageProvenanceSummary,
  OpsLensReleasePublishPlanSummary,
  OpsLensReleasePublishReadiness,
  OpsLensReleasePublishTicketPacket,
  OpsLensReleaseActionQueueReadiness,
  OpsLensReleaseActionQueueSummary,
  OpsLensReleaseEvidenceRefreshReadiness,
  OpsLensReleaseEvidenceRefreshSummary,
  OpsLensReleaseEvidenceBundleReadiness,
  OpsLensReleaseEvidenceBundleSummary,
  OpsLensRoadmapCompletionSummary,
  OpsLensRemediationProposal,
  OpsLensSecurityScanPlanSummary,
  OpsLensSecurityScanReadiness,
  OpsLensSecurityReviewTicketPacket,
  OpsLensRagIngestionApprovalPlanSummary,
  OpsLensRuntimeDependencyReadiness,
  OpsLensRuntimeEvidenceTicketPacket,
  OpsLensRuntimeLiveHandoffAction,
  OpsLensRuntimeLiveHandoffSummary,
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
  OpsLensRagProductionReadiness,
  OpsLensRagProductionReadinessSummary,
  OpsLensRagProductionTicketPacket,
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

function redactedOcpTarget(target: {
  protocol?: unknown;
  redactedBaseUrl?: unknown;
  port?: unknown;
}): string {
  const protocol = String(target.protocol ?? target.redactedBaseUrl ?? "").startsWith("http://")
    ? "http:"
    : "https:";
  const port =
    target.port ??
    String(target.redactedBaseUrl ?? "").match(/:(\d+)(?:\/)?$/)?.[1] ??
    "unknown";
  return `${protocol}//<redacted-ocp-api>${port === "unknown" ? "" : `:${String(port)}`}`;
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

type LightspeedExtensionPointEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: "readOnlyEvidenceOnly";
  generatedAt?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  vectorWriteAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  extensionPoint?: {
    productContract?: string;
    lightspeedFacingEndpoint?: string;
    localSmokeEndpoint?: string;
    restApiRole?: string;
    undocumentedWebhookSupported?: boolean;
    legacyConfigMapRegistrationSupported?: boolean;
    technologyPreview?: boolean;
  };
  olsconfig?: OpsLensLightspeedExtensionPointSummary["olsconfig"];
  routes?: OpsLensLightspeedExtensionPointSummary["routes"];
  requirements?: OpsLensLightspeedExtensionPointSummary["requirements"];
  mutationBoundary?: OpsLensLightspeedExtensionPointSummary["mutationBoundary"];
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
  evidence?: string[];
};

type LightspeedIntegrationHandoffEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: "handoffOnly";
  generatedAt?: string;
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
  localProof?: OpsLensLightspeedIntegrationHandoffSummary["localProof"];
  liveReadiness?: OpsLensLightspeedIntegrationHandoffSummary["liveReadiness"];
  olsconfig?: OpsLensLightspeedIntegrationHandoffSummary["olsconfig"];
  readOnlyCommands?: OpsLensLightspeedIntegrationHandoffSummary["readOnlyCommands"];
  approvalGatedCommands?: OpsLensLightspeedIntegrationHandoffSummary["approvalGatedCommands"];
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
  evidence?: string[];
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

function lightspeedExtensionPointEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_EXTENSION_POINT_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-lightspeed-extension-point.json")
  );
}

function lightspeedIntegrationHandoffEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_LIGHTSPEED_INTEGRATION_HANDOFF_EVIDENCE ??
    join(
      repoRoot,
      "test-results",
      "cywell-opslens-lightspeed-integration-handoff.json"
    )
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

function mapLightspeedExtensionPointStatus(
  artifactStatus?: string,
  dirty = false
): OpsLensLightspeedExtensionPointReadiness {
  if (artifactStatus === "PASS" && !dirty) return "ready";
  if (artifactStatus === "FAIL" || artifactStatus === "FAILED" || artifactStatus === "invalid") {
    return "failed";
  }
  return "needs-evidence";
}

function missingLightspeedExtensionPointSummary(
  reason: string,
  artifactStatus = "missing"
): OpsLensLightspeedExtensionPointSummary {
  return {
    status: mapLightspeedExtensionPointStatus(artifactStatus),
    artifactStatus,
    actionMode: "readOnlyEvidenceOnly",
    productContract: "OLSConfig.spec.mcpServers custom MCP server",
    lightspeedFacingEndpoint: "/mcp",
    localSmokeEndpoint: "/api/opslens/mcp",
    restApiRole: "local-smoke-demo-and-product-api-only",
    undocumentedWebhookSupported: false,
    legacyConfigMapRegistrationSupported: false,
    technologyPreview: true,
    headSha: "missing",
    worktreeDirty: false,
    olsconfig: {
      path: "deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
      apiVersion: "missing",
      kind: "missing",
      namespace: "missing",
      name: "missing",
      featureGates: [],
      server: {
        name: "missing",
        url: "missing",
        timeout: "missing",
        userBearerForwarding: false,
        secretHeader: false
      }
    },
    routes: [
      {
        path: "/mcp",
        method: "POST",
        role: "lightspeed-facing",
        handler: "handleOpsLensMcpRequest"
      },
      {
        path: "/api/opslens/mcp",
        method: "POST",
        role: "local-smoke-demo",
        handler: "handleOpsLensMcpRequest"
      }
    ],
    requirements: [],
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      mutationAllowedByThisVerifier: false
    },
    missingEvidence: [reason],
    risk: [
      "Without extension point evidence, Stage 1 could drift back to undocumented webhook or legacy ConfigMap assumptions."
    ],
    rollbackPath: [
      "Regenerate extension point evidence with npm run verify:lightspeed-extension."
    ],
    evidence: [
      "Lightspeed extension point evidence is not available yet.",
      "Dashboard keeps Stage 1 extension decision as needs-evidence until verifier output exists."
    ]
  };
}

function getLightspeedExtensionPointReadiness(): {
  status: OpsLensLightspeedExtensionPointReadiness;
  extensionPoint: OpsLensLightspeedExtensionPointSummary;
  evidence: string[];
} {
  const evidencePath = lightspeedExtensionPointEvidencePath();
  if (!existsSync(evidencePath)) {
    const extensionPoint = missingLightspeedExtensionPointSummary(
      `Lightspeed extension point evidence is missing at ${evidencePath}`
    );
    return {
      status: extensionPoint.status,
      extensionPoint,
      evidence: [
        `Lightspeed extension point evidence missing at ${evidencePath}`,
        "run npm run verify:lightspeed-extension"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LightspeedExtensionPointEvidenceArtifact;
    const status = mapLightspeedExtensionPointStatus(
      artifact.status,
      artifact.ref?.worktreeDirty === true
    );
    const extensionPoint: OpsLensLightspeedExtensionPointSummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "readOnlyEvidenceOnly",
      productContract:
        artifact.extensionPoint?.productContract ??
        "OLSConfig.spec.mcpServers custom MCP server",
      lightspeedFacingEndpoint:
        artifact.extensionPoint?.lightspeedFacingEndpoint ?? "/mcp",
      localSmokeEndpoint:
        artifact.extensionPoint?.localSmokeEndpoint ?? "/api/opslens/mcp",
      restApiRole:
        artifact.extensionPoint?.restApiRole ??
        "local-smoke-demo-and-product-api-only",
      undocumentedWebhookSupported:
        artifact.extensionPoint?.undocumentedWebhookSupported === true,
      legacyConfigMapRegistrationSupported:
        artifact.extensionPoint?.legacyConfigMapRegistrationSupported === true,
      technologyPreview: artifact.extensionPoint?.technologyPreview !== false,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      olsconfig: artifact.olsconfig ?? missingLightspeedExtensionPointSummary(
        "OLSConfig summary is missing"
      ).olsconfig,
      routes: artifact.routes ?? missingLightspeedExtensionPointSummary(
        "route summary is missing"
      ).routes,
      requirements: artifact.requirements ?? [],
      mutationBoundary: {
        clusterMutationAttempted:
          artifact.mutationBoundary?.clusterMutationAttempted === true ||
          artifact.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifact.mutationBoundary?.registryMutationAttempted === true ||
          artifact.registryMutationAttempted === true,
        vectorWriteAttempted:
          artifact.mutationBoundary?.vectorWriteAttempted === true ||
          artifact.vectorWriteAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationBoundary?.mutationAllowedByThisVerifier === true ||
          artifact.mutationAllowedByThisVerifier === true
      },
      missingEvidence: artifact.missingEvidence ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? [],
      evidence: artifact.evidence ?? []
    };

    return {
      status,
      extensionPoint,
      evidence: [
        `Lightspeed extension point evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `extension productContract=${extensionPoint.productContract}`,
        `lightspeed endpoint=${extensionPoint.lightspeedFacingEndpoint} smoke=${extensionPoint.localSmokeEndpoint}`,
        `unsupported webhook=${String(extensionPoint.undocumentedWebhookSupported)} legacyConfigMap=${String(extensionPoint.legacyConfigMapRegistrationSupported)}`,
        `extension verifier generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"}`,
        "admin overview reads extension point evidence only; it does not patch OLSConfig, call Lightspeed, or mutate clusters"
      ]
    };
  } catch (error) {
    const extensionPoint = missingLightspeedExtensionPointSummary(
      error instanceof Error ? error.message : "unknown evidence parse error",
      "invalid"
    );
    return {
      status: extensionPoint.status,
      extensionPoint,
      evidence: [
        `Lightspeed extension point evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid extension point evidence blocks Stage 1 extension claims"
      ]
    };
  }
}

function mapLightspeedIntegrationHandoffStatus(
  status?: string
): OpsLensLightspeedIntegrationHandoffSummary["status"] {
  switch (status) {
    case "READY_FOR_LIVE_REGISTRATION_REVIEW":
      return "ready-for-live-registration-review";
    case "LIVE_READY":
      return "live-ready";
    case "BLOCKED":
      return "blocked";
    case "FAIL":
    case "FAILED":
      return "failed";
    case "NEEDS_EVIDENCE":
    case "NEEDS_LIVE_EVIDENCE":
    default:
      return "needs-evidence";
  }
}

function missingLightspeedIntegrationHandoffSummary(
  reason: string,
  artifactStatus = "missing"
): OpsLensLightspeedIntegrationHandoffSummary {
  return {
    status: artifactStatus === "invalid" ? "failed" : "needs-evidence",
    artifactStatus,
    actionMode: "handoffOnly",
    headSha: "missing",
    worktreeDirty: false,
    localProof: {
      trojanHorse: {
        selectedTool: "missing",
        citationCount: 0,
        customerRunbookCitationFound: false,
        redactionPassed: false
      },
      routing: {
        selectedPasses: 0,
        responsePasses: 0,
        total: 10,
        threshold: 8
      }
    },
    liveReadiness: {
      status: "missing",
      classification: "missing",
      networkClassification: "missing",
      nextCommand: "npm run verify:lightspeed:integration-handoff"
    },
    olsconfig: {
      templateReady: false,
      templatePath: "missing",
      target: {
        namespace: "openshift-lightspeed",
        name: "cluster",
        kind: "OLSConfig"
      },
      desiredServer: {
        name: "cywell-opslens",
        url: "missing",
        authHeaderMode: "missing",
        apiKeyHeaderMode: "missing"
      }
    },
    readOnlyCommands: [
      {
        id: "refresh-lightspeed-integration-handoff",
        command: "npm run verify:lightspeed:integration-handoff",
        purpose: "Regenerate the dashboard-facing Lightspeed integration handoff evidence.",
        phase: "handoff-refresh",
        mutation: false,
        writesLocalEvidence: true
      }
    ],
    approvalGatedCommands: [],
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    missingEvidence: [reason],
    risk: [
      "Lightspeed registration must not be claimed until the integration handoff artifact is current and reviewable."
    ],
    rollbackPath: [
      "Keep OLSConfig unchanged and regenerate the handoff evidence before approval."
    ],
    evidence: [
      reason,
      "regenerate with npm run verify:lightspeed:integration-handoff",
      "dashboard reports missing handoff evidence instead of assuming live Lightspeed registration readiness"
    ]
  };
}

function getLightspeedIntegrationHandoff(): OpsLensLightspeedIntegrationHandoffSummary {
  const evidencePath = lightspeedIntegrationHandoffEvidencePath();

  if (!existsSync(evidencePath)) {
    return missingLightspeedIntegrationHandoffSummary(
      `Lightspeed integration handoff evidence is missing at ${evidencePath}`
    );
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as LightspeedIntegrationHandoffEvidenceArtifact;
    const trojanHorse = artifact.localProof?.trojanHorse;
    const routing = artifact.localProof?.routing;
    const olsconfig = artifact.olsconfig;
    const desiredServer = olsconfig?.desiredServer;
    const readOnlyCommands = artifact.readOnlyCommands ?? [];
    const approvalGatedCommands = artifact.approvalGatedCommands ?? [];
    const clusterMutationAttempted = artifact.clusterMutationAttempted === true;
    const registryMutationAttempted = artifact.registryMutationAttempted === true;
    const vectorWriteAttempted = artifact.vectorWriteAttempted === true;
    const ingestionJobCreated = artifact.ingestionJobCreated === true;
    const mutationAllowedByThisVerifier =
      artifact.mutationAllowedByThisVerifier === true;
    const threshold = Number(routing?.threshold ?? 8);
    const selectedPasses = Number(routing?.selectedPasses ?? 0);
    const responsePasses = Number(routing?.responsePasses ?? 0);
    const unsafe =
      artifact.actionMode !== "handoffOnly" ||
      clusterMutationAttempted ||
      registryMutationAttempted ||
      vectorWriteAttempted ||
      ingestionJobCreated ||
      mutationAllowedByThisVerifier ||
      !trojanHorse ||
      trojanHorse.selectedTool !== "generate_playbook" ||
      Number(trojanHorse.citationCount ?? 0) <= 0 ||
      trojanHorse.customerRunbookCitationFound !== true ||
      trojanHorse.redactionPassed !== true ||
      !routing ||
      selectedPasses < threshold ||
      responsePasses < threshold ||
      !olsconfig ||
      olsconfig.templateReady !== true ||
      !desiredServer?.url?.endsWith("/mcp") ||
      readOnlyCommands.length === 0 ||
      readOnlyCommands.some((command) => command.mutation !== false) ||
      approvalGatedCommands.some(
        (command) =>
          command.mutation !== true || command.requiresExplicitApproval !== true
      );
    const mappedStatus = mapLightspeedIntegrationHandoffStatus(artifact.status);
    const status = unsafe
      ? "failed"
      : artifact.ref?.worktreeDirty === true
        ? "needs-evidence"
        : mappedStatus;

    return {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "handoffOnly",
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      localProof: {
        trojanHorse: {
          selectedTool: trojanHorse?.selectedTool ?? "missing",
          citationCount: Number(trojanHorse?.citationCount ?? 0),
          customerRunbookCitationFound:
            trojanHorse?.customerRunbookCitationFound === true,
          redactionPassed: trojanHorse?.redactionPassed === true
        },
        routing: {
          selectedPasses,
          responsePasses,
          total: Number(routing?.total ?? 0),
          threshold
        }
      },
      liveReadiness: {
        status: artifact.liveReadiness?.status ?? "missing",
        classification: artifact.liveReadiness?.classification ?? "missing",
        networkClassification:
          artifact.liveReadiness?.networkClassification ?? "missing",
        nextCommand:
          artifact.liveReadiness?.nextCommand ??
          "npm run verify:lightspeed -- --timeout-ms 30000"
      },
      olsconfig: {
        templateReady: olsconfig?.templateReady === true,
        templatePath: olsconfig?.templatePath ?? "missing",
        target: {
          namespace: olsconfig?.target?.namespace ?? "openshift-lightspeed",
          name: olsconfig?.target?.name ?? "cluster",
          kind: olsconfig?.target?.kind ?? "OLSConfig"
        },
        desiredServer: {
          name: desiredServer?.name ?? "cywell-opslens",
          url: desiredServer?.url ?? "missing",
          authHeaderMode: desiredServer?.authHeaderMode ?? "missing",
          apiKeyHeaderMode: desiredServer?.apiKeyHeaderMode ?? "missing"
        }
      },
      readOnlyCommands,
      approvalGatedCommands,
      clusterMutationAttempted,
      registryMutationAttempted,
      vectorWriteAttempted,
      ingestionJobCreated,
      mutationAllowedByThisVerifier,
      missingEvidence: [
        ...(artifact.missingEvidence ?? []),
        ...(unsafe
          ? [
              "Lightspeed integration handoff artifact has an unsafe or incomplete local proof/template/command boundary"
            ]
          : [])
      ],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? [],
      evidence: [
        `Lightspeed integration handoff evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        "regenerate with npm run verify:lightspeed:integration-handoff",
        `live classification=${artifact.liveReadiness?.classification ?? "missing"} network=${artifact.liveReadiness?.networkClassification ?? "missing"}`,
        `read-only commands=${readOnlyCommands.length} approval-gated commands=${approvalGatedCommands.length}`,
        ...(artifact.evidence ?? [])
      ]
    };
  } catch (error) {
    return missingLightspeedIntegrationHandoffSummary(
      `Lightspeed integration handoff evidence could not be parsed from ${evidencePath}: ${
        error instanceof Error ? error.message : "unknown evidence parse error"
      }`,
      "invalid"
    );
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
      integrationHandoff: getLightspeedIntegrationHandoff(),
      tools,
      evidence: [
        "OpenShift Lightspeed custom MCP server is the supported extension point for tool calls",
        "AC-LS-001 verifies tools/list and tools/call for the MVP read-only tool surface",
        "exact Trojan Horse question proof comes from npm run verify:lightspeed:trojan-horse",
        "routing score comes from npm run verify:lightspeed:routing and the 10-question / 8-pass fixture",
        "integration handoff comes from npm run verify:lightspeed:integration-handoff",
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
  firstPlanActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
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
        criticalFindingPackages?: string[];
        criticalFindingIds?: string[];
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
  candidateHandoff?: Array<{
    imageName?: string;
    status?: string;
    owner?: string;
    candidateStatus?: string;
    candidateLabel?: string;
    candidateImage?: string;
    releaseEligible?: boolean;
    criticalFindings?: number | string;
    highFindings?: number | string;
    reviewDecision?: string;
    approvalRequired?: boolean;
    mutationAllowed?: boolean;
    evidenceNeeded?: string;
    nextCommand?: string;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  finalEvidenceHandoff?: Array<{
    imageName?: string;
    status?: string;
    owner?: string;
    draftFile?: string;
    finalEvidenceFile?: string;
    finalEvidenceExists?: boolean;
    evidenceState?: string;
    draftStatus?: string;
    reviewerRequestCount?: number;
    missingEvidenceCount?: number;
    requiredReviewerRoles?: string[];
    evidenceChecklist?: string[];
    promotionCommand?: string;
    verificationCommand?: string;
    approvalRequired?: boolean;
    requiresExplicitApproval?: boolean;
    mutationAllowed?: boolean;
    writesLocalEvidence?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
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
    command?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
  }>;
  firstRegistryActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPackets?: OpsLensExternalRuntimeRegistryTicketPacket[];
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

type OperatorPackageEvidenceArtifact = {
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
  acceptance?: string[];
  packageBoundary?: {
    appManifest?: {
      objectCount?: number;
      containsOlsResources?: boolean;
      staticStackAppliesLightspeedRegistration?: boolean;
    };
    olsconfigTemplate?: {
      kind?: string;
      name?: string;
      namespace?: string;
      approvalGatedOnly?: boolean;
      reconcileMode?: string;
      rollbackPath?: string;
      featureGates?: string[];
      mcpServerName?: string;
      mcpUrl?: string;
      headerTypes?: string[];
    };
    lightspeedRegistration?: {
      staticStackContainsOlsConfig?: boolean;
      approvalGatedTemplateExists?: boolean;
      forbiddenRegistrationPaths?: string[];
    };
  };
  evidence?: string[];
  missingEvidence?: string[];
  warnings?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type OperatorRuntimeParityEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  fixtures?: {
    controller?: string;
    clusterRole?: string;
    csv?: string;
    acceptance?: string;
  };
  parity?: {
    lightspeedMode?: string;
    lightspeedPhase?: string;
    willPatchLightspeed?: boolean;
    assistantMutationAllowed?: boolean;
    ragApprovalQueueMutationAllowed?: boolean;
    ragRawDocumentReturnAllowed?: boolean;
  };
  goLightspeedMutationBoundary?: {
    functionFound?: boolean;
    validateOnlyGuardBeforeRead?: boolean;
    endpointGuardBeforeRead?: boolean;
    patchCallCount?: number;
    patchAfterRead?: boolean;
    configMapReferenceCount?: number;
    reconcileBeforeStatus?: boolean;
  };
  evidence?: string[];
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
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
  firstApprovalActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPacket?: OpsLensInstallApprovalTicketPacket;
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
  firstPublishActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPacket?: OpsLensReleasePublishTicketPacket;
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

type CommunityOperatorSubmissionEvidenceArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  externalSubmissionAttempted?: boolean;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  submissionLayout?: Partial<OpsLensCommunityOperatorSubmissionSummary["submissionLayout"]>;
  sourceBundleParity?: Array<Partial<OpsLensCommunityOperatorSubmissionSummary["sourceBundleParity"][number]>>;
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
    requiresNetwork?: boolean;
  }>;
  firstSubmissionActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
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
    toolingSatisfiedBy?: string;
    runnerEvidence?: {
      path?: string;
      requiredSchema?: string;
      status?: string;
      approved?: boolean;
      sameHead?: boolean;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
      runner?: {
        id?: string;
        image?: string;
        imageDigest?: string;
        approvedBy?: string;
        ticket?: string;
        approvedAt?: string;
      };
      toolVersions?: {
        oc?: string;
        docker?: string;
        opm?: string;
        operatorSdk?: string;
      };
      evidenceArtifacts?: {
        certificationReadiness?: string;
        catalogToolchain?: string;
        opmValidateLog?: string;
        operatorSdkBundleValidateLog?: string;
        operatorSdkScorecardLog?: string;
      };
      missingEvidence?: string[];
      nextCommands?: string[];
      risk?: string[];
      rollbackPath?: string[];
    };
    ticketPacket?: OpsLensCertificationToolingTicketPacket;
    freshnessPolicy?: {
      requiredHead?: string;
      worktreeRequirement?: string;
      rerunAfter?: string[];
    };
    executionLanes?: Array<{
      id?: string;
      owner?: string;
      status?: string;
      purpose?: string;
      requiredTools?: string[];
      requiredEvidence?: string[];
      blockedBy?: string[];
      nextCommands?: string[];
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    }>;
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
  firstSubmissionActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
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
    baseImageReadable?: boolean;
    baseImageProbe?: {
      image?: string;
      readable?: boolean;
      method?: string;
      detail?: string;
    };
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
        decision?: string;
        explicitDecisionProvided?: boolean;
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
  securityScanRunner?: {
    evidenceWritten?: boolean;
    fresh?: boolean;
    scannerDigestsPinned?: boolean;
    missingTargets?: string[];
    status?: string;
    actionMode?: string;
    executeDockerFallback?: boolean;
  };
  firstSecurityReviewActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  securityReviewFinalHandoff?: Array<{
    imageName?: string;
    status?: string;
    owner?: string;
    draftPath?: string;
    finalEvidenceFile?: string;
    finalEvidenceExists?: boolean;
    reviewApproved?: boolean;
    evidenceState?: string;
    draftStatus?: string;
    vulnerabilityReportExists?: boolean;
    sbomExists?: boolean;
    reviewerProvided?: boolean;
    ticketProvided?: boolean;
    decision?: string;
    explicitDecisionProvided?: boolean;
    readyForFinalReview?: boolean;
    missingEvidenceCount?: number;
    evidenceChecklist?: string[];
    promotionCommand?: string;
    verificationCommand?: string;
    approvalRequired?: boolean;
    requiresExplicitApproval?: boolean;
    mutationAllowed?: boolean;
    writesLocalEvidence?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPackets?: OpsLensSecurityReviewTicketPacket[];
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
    criticalPathCount?: number;
    criticalPathReady?: boolean;
    missingOwnerPackets?: string[];
    missingCriticalPathDiagnostics?: string[];
    missingCriticalPathTickets?: string[];
    unsafeCriticalPathTickets?: string[];
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
      firstActionId?: string;
      firstActionPriority?: string;
      firstNextCommand?: string;
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
  actionQueueSafety?: {
    status?: string;
    fresh?: boolean;
    ready?: boolean;
    ownerPacketCount?: number;
    criticalPathCount?: number;
    missingDiagnostics?: string[];
    missingTickets?: string[];
    unsafeTickets?: string[];
  };
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

type RoadmapPlanAlignmentArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  stages?: Array<{
    id?: string;
    requirements?: Array<{
      id?: string;
      status?: string;
    }>;
  }>;
  missingEvidence?: string[];
  blockers?: string[];
  evidence?: string[];
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
    firstActionId?: string;
    firstActionPriority?: string;
    firstActionSource?: string;
    firstActionRequest?: string;
    firstNextCommand?: string;
    firstEvidenceNeeded?: string;
    firstBlockedBy?: string[];
    firstTicketPacket?: OpsLensOcpNetworkHandoffSummary["ticketPacket"];
    firstExternalRuntimeTicketPacket?: OpsLensExternalRuntimeRegistryTicketPacket;
    firstExternalRuntimeFinalEvidenceTicketPacket?: OpsLensExternalRuntimeFinalEvidenceTicketPacket;
    firstExternalRuntimeProductTicketPacket?: OpsLensExternalRuntimeProductTicketPacket;
    firstSecurityReviewTicketPacket?: OpsLensSecurityReviewTicketPacket;
    firstReleasePublishTicketPacket?: OpsLensReleasePublishTicketPacket;
    firstInstallApprovalTicketPacket?: OpsLensInstallApprovalTicketPacket;
    firstCatalogToolchainTicketPacket?: OpsLensCatalogToolchainTicketPacket;
    firstCertificationToolingTicketPacket?: OpsLensCertificationToolingTicketPacket;
    firstRagProductionTicketPacket?: OpsLensRagProductionTicketPacket;
    firstAiopsMonitoringTicketPacket?: OpsLensAiopsMonitoringProxyTicketPacket;
    firstRuntimeEvidenceTicketPacket?: OpsLensRuntimeEvidenceTicketPacket;
    nextCommands?: string[];
    setupCommandIds?: string[];
    readOnlyCommandIds?: string[];
    approvalGatedCommandIds?: string[];
    missingRequiredTools?: string[];
    blockedBy?: string[];
    acceptance?: string[];
    mutationAllowedByThisVerifier?: boolean;
  }>;
  criticalPath?: Array<{
    lane?: string;
    label?: string;
    owner?: string;
    priority?: string;
    actionId?: string;
    source?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    blockedBy?: string[];
    diagnostics?: string[];
    missingRequiredTools?: string[];
    setupCommandIds?: string[];
    readOnlyCommandIds?: string[];
    approvalGatedCommandIds?: string[];
    acceptance?: string[];
    ticketPacket?: OpsLensOcpNetworkHandoffSummary["ticketPacket"];
    externalRuntimeTicketPacket?: OpsLensExternalRuntimeRegistryTicketPacket;
    externalRuntimeFinalEvidenceTicketPacket?: OpsLensExternalRuntimeFinalEvidenceTicketPacket;
    externalRuntimeProductTicketPacket?: OpsLensExternalRuntimeProductTicketPacket;
    securityReviewTicketPacket?: OpsLensSecurityReviewTicketPacket;
    releasePublishTicketPacket?: OpsLensReleasePublishTicketPacket;
    installApprovalTicketPacket?: OpsLensInstallApprovalTicketPacket;
    catalogToolchainTicketPacket?: OpsLensCatalogToolchainTicketPacket;
    certificationToolingTicketPacket?: OpsLensCertificationToolingTicketPacket;
    ragProductionTicketPacket?: OpsLensRagProductionTicketPacket;
    aiopsMonitoringTicketPacket?: OpsLensAiopsMonitoringProxyTicketPacket;
    runtimeEvidenceTicketPacket?: OpsLensRuntimeEvidenceTicketPacket;
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
      requiresExplicitApproval?: boolean;
      requiresHumanApproval?: boolean;
      requiresHumanSecretInput?: boolean;
      credentialSetup?: boolean;
      credentialStoredByVerifier?: boolean;
      registryLoginExecutedByVerifier?: boolean;
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
    blockedBy?: string[];
    diagnostics?: Array<{
      id?: string;
      label?: string;
      value?: string;
    }>;
    ticketPacket?: OpsLensOcpNetworkHandoffSummary["ticketPacket"];
    externalRuntimeTicketPacket?: OpsLensExternalRuntimeRegistryTicketPacket;
    externalRuntimeFinalEvidenceTicketPacket?: OpsLensExternalRuntimeFinalEvidenceTicketPacket;
    externalRuntimeProductTicketPacket?: OpsLensExternalRuntimeProductTicketPacket;
    securityReviewTicketPacket?: OpsLensSecurityReviewTicketPacket;
    releasePublishTicketPacket?: OpsLensReleasePublishTicketPacket;
    installApprovalTicketPacket?: OpsLensInstallApprovalTicketPacket;
    catalogToolchainTicketPacket?: OpsLensCatalogToolchainTicketPacket;
    certificationToolingTicketPacket?: OpsLensCertificationToolingTicketPacket;
    ragProductionTicketPacket?: OpsLensRagProductionTicketPacket;
    aiopsMonitoringTicketPacket?: OpsLensAiopsMonitoringProxyTicketPacket;
    runtimeEvidenceTicketPacket?: OpsLensRuntimeEvidenceTicketPacket;
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

type RagProductionReadinessArtifact = {
  artifactType?: string;
  status?: string;
  generatedAt?: string;
  actionMode?: string;
  registryMutationAttempted?: boolean;
  clusterMutationAttempted?: boolean;
  vectorWriteAttempted?: boolean;
  ingestionJobCreated?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  readiness?: {
    contractReady?: boolean;
    approvalRequired?: boolean;
    productionQueueLive?: boolean;
    ingestionWorkerLive?: boolean;
    vectorWriteAuditSinkLive?: boolean;
    missingLiveComponents?: string[];
  };
  components?: {
    queue?: {
      backendClass?: string;
      contractReady?: boolean;
      liveReady?: boolean;
      storesRawMarkdown?: boolean;
    };
    ingestionWorker?: {
      mode?: string;
      contractReady?: boolean;
      liveReady?: boolean;
      createsKubernetesJobByThisVerifier?: boolean;
    };
    vectorWriteAuditSink?: {
      contractReady?: boolean;
      liveReady?: boolean;
      appendOnly?: boolean;
      recordsRollbackChunkIds?: boolean;
    };
  };
  requiredApprovals?: string[];
  readOnlyCommands?: Array<{
    id?: string;
    command?: string;
    phase?: string;
    mutation?: boolean;
    writesLocalEvidence?: boolean;
  }>;
  approvalGatedCommands?: Array<{
    id?: string;
    command?: string;
    phase?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    rollback?: string;
  }>;
  firstProductionActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPacket?: OpsLensRagProductionTicketPacket;
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
    alertmanagerWebhookPath?: string;
    alertmanagerArtifactType?: string;
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
    alertmanagerIntake?: {
      artifactType?: string;
      actionMode?: string;
      alertCount?: number;
      acceptedCount?: number;
      rawAlertReturned?: boolean;
      mutationAllowed?: boolean;
      clusterMutationAttempted?: boolean;
      incidentRequestIds?: string[];
      missingEvidence?: string[];
    };
    missingEvidence?: string[];
  };
  monitoringProxyTicketPacket?: OpsLensAiopsMonitoringProxyTicketPacket;
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
  postApprovalSmoke?: {
    artifactStatus?: string;
    requiredAfterAuthRbacApproval?: boolean;
    command?: string;
    ocpClassification?: string;
    requiredRbacAllowed?: boolean;
    requiredRbacReviewCount?: number;
    requiredRbacAllowedCount?: number;
    requiredRbacDeniedCount?: number;
    requiredRbacUnknownCount?: number;
    lightspeedClassification?: string;
    lightspeedAuthReady?: boolean;
    sourceArtifacts?: Array<{
      id?: string;
      label?: string;
      status?: string;
      fresh?: boolean;
      required?: boolean;
      headSha?: string;
      worktreeDirty?: boolean | string;
    }>;
    verifierRuns?: Array<{
      id?: string;
      ok?: boolean;
      skipped?: boolean;
    }>;
    missingEvidence?: string[];
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

type OcpCredentialHygieneArtifact = {
  tokenConfigured?: boolean;
  tokenSource?: string;
  tokenCandidateCount?: number;
  tokenLengthClass?: string;
  tokenLooksPlaceholder?: boolean;
  tokenHasWhitespace?: boolean;
  tokenStartsWithBearer?: boolean;
  tokenLooksOpenShiftSha?: boolean;
  localFormatIssue?: boolean;
  credentialStoredByVerifier?: boolean;
  tokenValueRedacted?: boolean;
  credentialDiagnosis?: string;
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
  credentialHygiene?: OcpCredentialHygieneArtifact;
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
  firstNetworkActions?: Array<{
    id?: string;
    owner?: string;
    phase?: string;
    status?: string;
    request?: string;
    evidenceNeeded?: string;
    nextCommand?: string;
    mutation?: boolean;
    requiresExplicitApproval?: boolean;
    blockedBy?: string[];
    rollbackPath?: string;
  }>;
  ticketPacket?: {
    id?: string;
    owner?: string;
    title?: string;
    severity?: string;
    classification?: string;
    redactedTarget?: string;
    summary?: string;
    evidenceChecklist?: string[];
    firstReadOnlyAction?: {
      id?: string;
      status?: string;
      nextCommand?: string;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    };
    approvalGatedAction?: {
      id?: string;
      status?: string;
      nextCommand?: string;
      mutation?: boolean;
      requiresExplicitApproval?: boolean;
    };
    nextCommands?: string[];
    blockedBy?: string[];
    mutationBoundary?: {
      clusterMutationAttempted?: boolean;
      registryMutationAttempted?: boolean;
      mutationAllowedByThisVerifier?: boolean;
      networkChangeRequiresExplicitApproval?: boolean;
    };
    risk?: string;
    rollbackPath?: string;
  };
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

type OcpNetworkHandoffApiFallbackArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: string;
  headSha?: string;
  worktreeDirty?: boolean;
  ref?: {
    headSha?: string;
    worktreeDirty?: boolean;
  };
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  cases?: Array<{
    classification?: string;
    actual?: {
      classification?: string;
      owner?: string;
      ticketId?: string;
      firstActionId?: string;
      approvalId?: string;
      networkChangeRequiresExplicitApproval?: boolean;
    };
  }>;
  checks?: Array<{
    status?: string;
    name?: string;
    detail?: string;
  }>;
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
  credentialHygiene?: OcpCredentialHygieneArtifact;
  ocContext?: {
    currentContextSet?: boolean;
    whoamiAvailable?: boolean;
    showServerAvailable?: boolean;
    kubeconfigEnvConfigured?: boolean;
    defaultKubeconfigPresent?: boolean;
    contextStatus?: string;
    authStatus?: string;
    serverStatus?: string;
  };
  diagnostics?: {
    classification?: string;
    credentialDiagnosis?: string;
    credentialLocalFormatIssue?: boolean;
    ocContext?: {
      currentContextSet?: boolean;
      whoamiAvailable?: boolean;
      showServerAvailable?: boolean;
      kubeconfigEnvConfigured?: boolean;
      defaultKubeconfigPresent?: boolean;
      contextStatus?: string;
      authStatus?: string;
      serverStatus?: string;
    };
  };
  requiredApprovals?: string[];
  rbac?: {
    namespace?: {
      name?: string;
    };
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
  ticketPacket?: OcpNetworkHandoffArtifact["ticketPacket"];
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
  credentialHygiene?: OcpCredentialHygieneArtifact;
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
    ocContext?: {
      currentContextSet?: boolean;
      whoamiAvailable?: boolean;
      showServerAvailable?: boolean;
      kubeconfigEnvConfigured?: boolean;
      defaultKubeconfigPresent?: boolean;
      contextStatus?: string;
      authStatus?: string;
      serverStatus?: string;
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
  authRecovery?: {
    status?: string;
    owner?: string;
    classification?: string;
    credentialDiagnosis?: string;
    ocContextStatus?: string;
    ocAuthenticationStatus?: string;
    evidenceNeeded?: string[];
    humanActions?: string[];
    nextCommands?: string[];
    readOnlyChecks?: Array<{
      id?: string;
      command?: string;
      purpose?: string;
      requiresNetwork?: boolean;
      mutation?: boolean;
      writesEvidence?: boolean;
    }>;
    mutationBoundary?: {
      clusterMutationAttempted?: boolean;
      registryMutationAttempted?: boolean;
      mutationAllowedByThisVerifier?: boolean;
      credentialStoredByVerifier?: boolean;
      tokenValueRedacted?: boolean;
      credentialRefreshRequiresHumanApproval?: boolean;
    };
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

type EnvContractArtifact = {
  artifactType?: string;
  status?: string;
  actionMode?: string;
  ref?: {
    branch?: string;
    headSha?: string;
    baseRef?: string;
    worktreeDirty?: boolean;
  };
  envAudit?: {
    exists?: boolean;
    activeKeyCount?: number;
    activeKeys?: string[];
    commentedTrackedCount?: number;
    duplicateActiveKeys?: string[];
    activeMissingValues?: string[];
    activeOcpTarget?: boolean;
    activeLightspeedTarget?: boolean;
  };
  checks?: Array<{
    name?: string;
    status?: string;
    detail?: string;
  }>;
  clusterMutationAttempted?: boolean;
  registryMutationAttempted?: boolean;
  vectorWriteAttempted?: boolean;
  mutationAllowedByThisVerifier?: boolean;
  evidence?: string[];
  missingEvidence?: string[];
  risk?: string[];
  rollbackPath?: string[];
};

function envContractEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_ENV_CONTRACT_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-env-contract.json")
  );
}

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

function operatorPackageEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OPERATOR_PACKAGE_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-operator-package.json")
  );
}

function operatorDryRunEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OPERATOR_DRY_RUN_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-operator-dry-run.json")
  );
}

function operatorRuntimeParityEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_OPERATOR_RUNTIME_PARITY_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-operator-runtime-parity.json")
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

function communityOperatorSubmissionEvidencePath() {
  return (
    process.env.CYWELL_OPSLENS_COMMUNITY_OPERATOR_SUBMISSION_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-community-operator-submission.json")
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

function roadmapPlanAlignmentPath() {
  return (
    process.env.CYWELL_OPSLENS_ROADMAP_PLAN_ALIGNMENT ??
    join(repoRoot, "test-results", "cywell-opslens-roadmap-plan-alignment.json")
  );
}

function ragProductionReadinessPath() {
  return (
    process.env.CYWELL_OPSLENS_RAG_PRODUCTION_READINESS_EVIDENCE ??
    join(repoRoot, "test-results", "cywell-opslens-rag-production-readiness.json")
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

function ocpNetworkHandoffApiFallbackPath() {
  return (
    process.env.CYWELL_OPSLENS_OCP_NETWORK_HANDOFF_API_FALLBACK_EVIDENCE ??
    join(
      repoRoot,
      "test-results",
      "cywell-opslens-ocp-network-handoff-api-fallback.json"
    )
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

function mapOperatorPackageReadinessStatus(
  artifact: OperatorPackageEvidenceArtifact
): OpsLensOperatorPackageReadiness {
  const packageBoundary = artifact.packageBoundary;
  const lightspeedRegistration = packageBoundary?.lightspeedRegistration;
  const olsconfigTemplate = packageBoundary?.olsconfigTemplate;
  const staticBoundaryReady =
    lightspeedRegistration?.staticStackContainsOlsConfig === false &&
    packageBoundary?.appManifest?.staticStackAppliesLightspeedRegistration === false &&
    lightspeedRegistration?.approvalGatedTemplateExists === true &&
    olsconfigTemplate?.approvalGatedOnly === true &&
    olsconfigTemplate?.reconcileMode === "PatchOLSConfig";

  if (
    artifact.status === "FAIL" ||
    artifact.clusterMutationAttempted ||
    artifact.registryMutationAttempted ||
    artifact.mutationAllowedByThisVerifier ||
    artifact.actionMode !== "operatorPackageStaticOnly"
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "PASS" && staticBoundaryReady) {
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

function mapOperatorRuntimeBoundaryReadinessStatus(
  artifact: OperatorRuntimeParityEvidenceArtifact
): OpsLensOperatorRuntimeBoundaryReadiness {
  if (
    artifact.status === "FAIL" ||
    artifact.clusterMutationAttempted ||
    artifact.registryMutationAttempted ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "failed";
  }
  if (artifact.ref?.worktreeDirty || artifact.status !== "PASS") {
    return "needs-evidence";
  }
  const boundary = artifact.goLightspeedMutationBoundary;
  const boundaryReady =
    boundary?.functionFound === true &&
    boundary.validateOnlyGuardBeforeRead === true &&
    boundary.endpointGuardBeforeRead === true &&
    boundary.patchCallCount === 1 &&
    boundary.patchAfterRead === true &&
    boundary.configMapReferenceCount === 0 &&
    boundary.reconcileBeforeStatus === true;
  const parityReady =
    artifact.parity?.lightspeedMode === "PatchOLSConfig" &&
    artifact.parity.willPatchLightspeed === true &&
    artifact.parity.assistantMutationAllowed === false &&
    artifact.parity.ragApprovalQueueMutationAllowed === false &&
    artifact.parity.ragRawDocumentReturnAllowed === false;
  return boundaryReady && parityReady ? "ready" : "failed";
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

function mapOcpCredentialHygiene(
  hygiene?: OcpCredentialHygieneArtifact,
  fallback: Partial<OpsLensOcpCredentialHygieneSummary> = {}
): OpsLensOcpCredentialHygieneSummary {
  return {
    tokenConfigured:
      hygiene?.tokenConfigured === true || fallback.tokenConfigured === true,
    tokenSource: hygiene?.tokenSource ?? fallback.tokenSource ?? "unknown",
    tokenCandidateCount:
      hygiene?.tokenCandidateCount ?? fallback.tokenCandidateCount ?? 0,
    tokenLengthClass:
      hygiene?.tokenLengthClass ?? fallback.tokenLengthClass ?? "unknown",
    tokenLooksPlaceholder:
      hygiene?.tokenLooksPlaceholder === true ||
      fallback.tokenLooksPlaceholder === true,
    tokenHasWhitespace:
      hygiene?.tokenHasWhitespace === true || fallback.tokenHasWhitespace === true,
    tokenStartsWithBearer:
      hygiene?.tokenStartsWithBearer === true ||
      fallback.tokenStartsWithBearer === true,
    tokenLooksOpenShiftSha:
      hygiene?.tokenLooksOpenShiftSha === true ||
      fallback.tokenLooksOpenShiftSha === true,
    localFormatIssue:
      hygiene?.localFormatIssue === true || fallback.localFormatIssue === true,
    credentialStoredByVerifier:
      hygiene?.credentialStoredByVerifier === true ||
      fallback.credentialStoredByVerifier === true,
    tokenValueRedacted:
      hygiene?.tokenValueRedacted ?? fallback.tokenValueRedacted ?? true,
    credentialDiagnosis:
      hygiene?.credentialDiagnosis ?? fallback.credentialDiagnosis ?? "unknown"
  };
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

function mapRagProductionReadinessStatus(
  artifact: RagProductionReadinessArtifact
): OpsLensRagProductionReadiness {
  if (
    artifact.status === "BLOCKED" ||
    artifact.registryMutationAttempted ||
    artifact.clusterMutationAttempted ||
    artifact.vectorWriteAttempted ||
    artifact.ingestionJobCreated ||
    artifact.mutationAllowedByThisVerifier
  ) {
    return "blocked";
  }
  if (artifact.ref?.worktreeDirty) {
    return "needs-evidence";
  }
  if (artifact.status === "APPROVAL_REQUIRED") {
    return "approval-required";
  }
  return "needs-evidence";
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

function defaultOcpAuthRecovery(
  classification: string,
  credentialDiagnosis = "missing-evidence"
): OpsLensOcpConnectivityDiagnosticSummary["authRecovery"] {
  const requiresAuthRecovery = ["auth-failed", "auth-or-rbac", "token-missing"].includes(
    classification
  );
  const readOnlyChecks = [
    {
      id: "verify-ocp-connectivity",
      command: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      purpose:
        "Reclassify OCP DNS, TCP, TLS, /version, oc context, and RBAC access without mutation.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "refresh-ocp-auth-rbac-plan",
      command: "npm run evidence:ocp-auth-rbac-plan",
      purpose:
        "Refresh the cluster-admin review packet after credential or RBAC evidence changes.",
      requiresNetwork: false,
      mutation: false,
      writesEvidence: true
    },
    {
      id: "verify-post-approval-live-reader-smoke",
      command: "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000",
      purpose:
        "Prove OCP and Lightspeed readiness after approved credential/RBAC handling.",
      requiresNetwork: true,
      mutation: false,
      writesEvidence: true
    }
  ];

  return {
    status:
      classification === "api-ready"
        ? "not-required"
        : requiresAuthRecovery
          ? "requires-credential-refresh"
          : "not-applicable",
    owner: requiresAuthRecovery ? "cluster-admin" : "none",
    classification,
    credentialDiagnosis,
    ocContextStatus: "unknown",
    ocAuthenticationStatus: "unknown",
    evidenceNeeded: requiresAuthRecovery
      ? [
          "Kubernetes /version returns 200 through the configured OCP credential.",
          "oc whoami succeeds for the target cluster without printing token values.",
          "Required oc auth can-i checks return yes or an explicit reviewed RBAC decision.",
          "Lightspeed readiness is rerun after OCP auth/RBAC evidence changes."
        ]
      : [],
    humanActions: requiresAuthRecovery
      ? [
          "Refresh the OCP API credential from the target cluster through approved secret handling.",
          "Confirm the refreshed credential belongs to the intended cluster and has read-only discovery access.",
          "Do not paste token values into tickets, logs, markdown, shell history, or committed files."
        ]
      : [],
    nextCommands: readOnlyChecks.map((check) => check.command),
    readOnlyChecks,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      credentialStoredByVerifier: false,
      tokenValueRedacted: true,
      credentialRefreshRequiresHumanApproval: requiresAuthRecovery
    }
  };
}

function mapOcpAuthRecovery(
  artifact: OcpConnectivityDiagnosticArtifact,
  classification: string,
  credentialDiagnosis: string,
  ocContextStatus: string,
  ocAuthenticationStatus: string
): OpsLensOcpConnectivityDiagnosticSummary["authRecovery"] {
  const fallback = defaultOcpAuthRecovery(classification, credentialDiagnosis);
  const recovery = artifact.authRecovery;
  if (!recovery) {
    return {
      ...fallback,
      ocContextStatus,
      ocAuthenticationStatus
    };
  }

  const readOnlyChecks = (recovery.readOnlyChecks ?? fallback.readOnlyChecks).map(
    (check) => ({
      id: check.id ?? "verify-ocp-connectivity",
      command: check.command ?? "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      purpose:
        check.purpose ??
        "Collect read-only OCP auth recovery evidence.",
      requiresNetwork: check.requiresNetwork === true,
      mutation: check.mutation === true,
      writesEvidence: check.writesEvidence === true
    })
  );

  return {
    status: recovery.status ?? fallback.status,
    owner: recovery.owner ?? fallback.owner,
    classification: recovery.classification ?? classification,
    credentialDiagnosis: recovery.credentialDiagnosis ?? credentialDiagnosis,
    ocContextStatus: recovery.ocContextStatus ?? ocContextStatus,
    ocAuthenticationStatus:
      recovery.ocAuthenticationStatus ?? ocAuthenticationStatus,
    evidenceNeeded: recovery.evidenceNeeded ?? fallback.evidenceNeeded,
    humanActions: recovery.humanActions ?? fallback.humanActions,
    nextCommands:
      recovery.nextCommands ?? readOnlyChecks.map((check) => check.command),
    readOnlyChecks,
    mutationBoundary: {
      clusterMutationAttempted:
        recovery.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        recovery.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        recovery.mutationBoundary?.mutationAllowedByThisVerifier === true,
      credentialStoredByVerifier:
        recovery.mutationBoundary?.credentialStoredByVerifier === true,
      tokenValueRedacted:
        recovery.mutationBoundary?.tokenValueRedacted !== false,
      credentialRefreshRequiresHumanApproval:
        recovery.mutationBoundary?.credentialRefreshRequiresHumanApproval ??
        fallback.mutationBoundary.credentialRefreshRequiresHumanApproval
    }
  };
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
        firstPlanActions: [],
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
        firstPlanActions: (artifact.firstPlanActions ?? []).map((action) => ({
          id: action.id ?? "unknown",
          owner: action.owner ?? "release-manager",
          phase: action.phase ?? "external-runtime-evidence-preflight",
          status: action.status ?? "needs-evidence",
          request:
            action.request ??
            "Resolve external runtime final evidence before release work.",
          evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
          nextCommand:
            action.nextCommand ?? "npm run verify:external-runtime-plan",
          mutation: action.mutation === true,
          requiresExplicitApproval: action.requiresExplicitApproval === true,
          blockedBy: action.blockedBy ?? [],
          rollbackPath:
            action.rollbackPath ??
            "Regenerate external runtime evidence before proceeding."
        })),
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
        firstPlanActions: [],
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
    firstReviewerActions: [],
    firstRegistryActions: [],
    ticketPackets: [],
    images: [],
    candidateHandoff: [],
    finalEvidenceHandoff: [],
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
    reviewDecision: candidate.reviewDecision ?? "unknown",
    criticalFindingPackages: candidate.criticalFindingPackages ?? [],
    criticalFindingIds: candidate.criticalFindingIds ?? []
  };
}

function fallbackExternalRuntimeCandidateHandoff(
  images: OpsLensExternalRuntimeReviewPacketSummary["images"]
): OpsLensExternalRuntimeReviewPacketSummary["candidateHandoff"] {
  return images.map((image) => {
    const best = image.candidateMatrix.bestCandidate;
    const status =
      image.candidateMatrix.status === "candidate-ready-for-review" &&
      best?.releaseEligible === true
        ? "ready-for-human-review"
        : best
          ? "blocked-by-remediation"
          : "needs-candidate";
    const vulnerabilityRequest = image.reviewerRequests.find(
      (request) =>
        request.role === "security-reviewer" &&
        /vulnerability scan/i.test(request.request)
    );
    const blockedBy = [
      status === "ready-for-human-review"
        ? ""
        : `${image.name}: candidate status is ${image.candidateMatrix.status}`,
      best?.releaseEligible === true
        ? ""
        : `${image.name}: best candidate is not release eligible`,
      image.finalEvidenceExists
        ? ""
        : `${image.name}: final reviewed runtime evidence is missing`
    ].filter(Boolean);

    return {
      imageName: image.name,
      status,
      owner: "security-reviewer",
      candidateStatus: image.candidateMatrix.status,
      candidateLabel: best?.label ?? "missing",
      candidateImage: best?.image ?? "missing",
      releaseEligible: best?.releaseEligible === true,
      criticalFindings: best?.criticalFindings ?? "unknown",
      highFindings: best?.highFindings ?? "unknown",
      reviewDecision: best?.reviewDecision ?? "unknown",
      approvalRequired: true,
      mutationAllowed: false,
      evidenceNeeded:
        vulnerabilityRequest?.evidenceNeeded ??
        image.candidateMatrix.recommendation,
      nextCommand:
        vulnerabilityRequest?.nextCommand ??
        "npm run evidence:external-runtime:candidate-scan",
      blockedBy,
      rollbackPath:
        "No cluster or registry rollback is required from this handoff because it records review evidence only."
    };
  });
}

function fallbackExternalRuntimeFirstRegistryActions(
  images: OpsLensExternalRuntimeReviewPacketSummary["images"],
  approvalGatedCommands: OpsLensExternalRuntimeReviewPacketSummary["approvalGatedCommands"]
): OpsLensExternalRuntimeReviewPacketSummary["firstRegistryActions"] {
  const registryRequests = images.flatMap((image) =>
    image.reviewerRequests
      .filter((request) => request.role === "registry-admin")
      .slice(0, 3)
      .map((request, index) => ({
        id: `external-runtime-${image.name}-registry-${index + 1}`,
        owner: "registry-admin",
        phase: request.nextCommand.includes("draft:digests")
          ? "source-digest-inspection"
          : "mirror-digest-evidence",
        status:
          image.sourceDigestInspectionStatus === "pass" &&
          !request.nextCommand.includes("draft:digests")
            ? "needs-mirror-evidence"
            : "needs-registry-access",
        request: request.request,
        evidenceNeeded: request.evidenceNeeded,
        nextCommand: request.nextCommand,
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [
          `${image.name}: sourceDigestInspection=${image.sourceDigestInspectionStatus}`,
          `${image.name}: finalEvidenceExists=${String(image.finalEvidenceExists)}`
        ],
        rollbackPath:
          "No rollback is required because registry-admin first actions only refresh ignored draft evidence or record reviewer-supplied digest references."
      }))
  );
  const gatedRegistryActions = approvalGatedCommands
    .filter((command) => command.mutation === true)
    .slice(0, 3)
    .map((command) => ({
      id: `approval-gated-${command.id}`,
      owner: "registry-admin",
      phase: command.phase,
      status: "approval-gated",
      request: `Do not run ${command.id} until external runtime evidence and approvals are explicit.`,
      evidenceNeeded:
        "Reviewed final runtime evidence, immutable source digests, internal mirror digests, and registry/security/product/release approvals.",
      nextCommand: `approval-gated ${command.id}`,
      mutation: true,
      requiresExplicitApproval: true,
      blockedBy: images
        .filter((image) => !image.finalEvidenceExists)
        .map((image) => `${image.name} final reviewed runtime evidence missing`),
      rollbackPath:
        "Supersede the mirrored image, signature, and release evidence with corrected approved digests."
    }));

  return [...registryRequests, ...gatedRegistryActions];
}

function fallbackExternalRuntimeFinalEvidenceHandoff(
  images: OpsLensExternalRuntimeReviewPacketSummary["images"]
): OpsLensExternalRuntimeReviewPacketSummary["finalEvidenceHandoff"] {
  const requiredReviewerRoles = [
    "registry-admin",
    "security-reviewer",
    "release-manager",
    "product-owner"
  ];
  return images.map((image) => {
    const status = image.finalEvidenceExists
      ? "reviewed-final-present"
      : image.evidenceState === "draft-review-ready" ||
          image.evidenceState === "DRAFT_REVIEW_READY" ||
          image.missingEvidenceCount === 0
        ? "ready-for-promotion-review"
        : "needs-reviewed-inputs";
    const finalEvidenceFile = `docs/release/evidence/external-runtime/${image.name}.json`;
    const draftFile = `docs/release/evidence/external-runtime/${image.name}.draft.json`;
    return {
      imageName: image.name,
      status,
      owner: "release-manager",
      draftFile,
      finalEvidenceFile,
      finalEvidenceExists: image.finalEvidenceExists,
      evidenceState: image.evidenceState,
      draftStatus: image.draftStatus,
      reviewerRequestCount: image.reviewerRequests.length,
      missingEvidenceCount: image.missingEvidenceCount,
      requiredReviewerRoles,
      evidenceChecklist: [
        `Review ignored draft evidence at ${draftFile}.`,
        `Confirm ${finalEvidenceFile} is written only through the promote helper.`,
        "Rerun verify:external-runtime-plan after final reviewed evidence is present."
      ],
      promotionCommand: `npm run evidence:external-runtime:promote -- --name ${image.name} --promote-reviewed --reviewer <reviewer> --review-ticket <change-ticket> --force`,
      verificationCommand: "npm run verify:external-runtime-plan",
      approvalRequired: status !== "reviewed-final-present",
      requiresExplicitApproval: true,
      mutationAllowed: false,
      writesLocalEvidence: true,
      blockedBy: image.finalEvidenceExists
        ? []
        : [`${image.name}: final reviewed runtime evidence is missing at ${finalEvidenceFile}`],
      rollbackPath:
        "If reviewer evidence is rejected, keep final evidence absent or supersede it with a corrected reviewed draft; no cluster or registry rollback is required."
    };
  });
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
    const candidateHandoff = (
      artifact.candidateHandoff?.length
        ? artifact.candidateHandoff.map((handoff) => ({
            imageName: handoff.imageName ?? "unknown",
            status: handoff.status ?? "unknown",
            owner: handoff.owner ?? "security-reviewer",
            candidateStatus: handoff.candidateStatus ?? "missing",
            candidateLabel: handoff.candidateLabel ?? "missing",
            candidateImage: handoff.candidateImage ?? "missing",
            releaseEligible: handoff.releaseEligible === true,
            criticalFindings: handoff.criticalFindings ?? "unknown",
            highFindings: handoff.highFindings ?? "unknown",
            reviewDecision: handoff.reviewDecision ?? "unknown",
            approvalRequired: handoff.approvalRequired !== false,
            mutationAllowed: handoff.mutationAllowed === true,
            evidenceNeeded: handoff.evidenceNeeded ?? "candidate review evidence is missing",
            nextCommand:
              handoff.nextCommand ?? "npm run evidence:external-runtime:candidate-scan",
            blockedBy: handoff.blockedBy ?? [],
            rollbackPath:
              handoff.rollbackPath ??
              "No cluster or registry rollback is required from this handoff."
          }))
        : fallbackExternalRuntimeCandidateHandoff(images)
    );
    const finalEvidenceHandoff = (
      artifact.finalEvidenceHandoff?.length
        ? artifact.finalEvidenceHandoff.map((handoff) => ({
            imageName: handoff.imageName ?? "unknown",
            status: handoff.status ?? "needs-reviewed-inputs",
            owner: handoff.owner ?? "release-manager",
            draftFile:
              handoff.draftFile ??
              `docs/release/evidence/external-runtime/${handoff.imageName ?? "unknown"}.draft.json`,
            finalEvidenceFile:
              handoff.finalEvidenceFile ??
              `docs/release/evidence/external-runtime/${handoff.imageName ?? "unknown"}.json`,
            finalEvidenceExists: handoff.finalEvidenceExists === true,
            evidenceState: handoff.evidenceState ?? "missing",
            draftStatus: handoff.draftStatus ?? "missing",
            reviewerRequestCount: Number.isFinite(Number(handoff.reviewerRequestCount))
              ? Number(handoff.reviewerRequestCount)
              : 0,
            missingEvidenceCount: Number.isFinite(Number(handoff.missingEvidenceCount))
              ? Number(handoff.missingEvidenceCount)
              : 0,
            requiredReviewerRoles: handoff.requiredReviewerRoles ?? [],
            evidenceChecklist: handoff.evidenceChecklist ?? [],
            promotionCommand:
              handoff.promotionCommand ??
              `npm run evidence:external-runtime:promote -- --name ${handoff.imageName ?? "<name>"} --promote-reviewed --reviewer <reviewer> --review-ticket <change-ticket> --force`,
            verificationCommand:
              handoff.verificationCommand ?? "npm run verify:external-runtime-plan",
            approvalRequired: handoff.approvalRequired !== false,
            requiresExplicitApproval: handoff.requiresExplicitApproval !== false,
            mutationAllowed: handoff.mutationAllowed === true,
            writesLocalEvidence: handoff.writesLocalEvidence !== false,
            blockedBy: handoff.blockedBy ?? [],
            rollbackPath:
              handoff.rollbackPath ??
              "If reviewer evidence is rejected, keep final evidence absent or supersede it with a corrected reviewed draft."
          }))
        : fallbackExternalRuntimeFinalEvidenceHandoff(images)
    );
    const firstReviewerActions = images.flatMap((image) => {
      const request = image.reviewerRequests[0];
      if (!request) return [];
      return [
        {
          imageName: image.name,
          role: request.role,
          request: request.request,
          evidenceNeeded: request.evidenceNeeded,
          nextCommand: request.nextCommand,
          sourceDigestInspectionStatus: image.sourceDigestInspectionStatus,
          candidateStatus: image.candidateMatrix.status,
          finalEvidenceExists: image.finalEvidenceExists
        }
      ];
    });
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
    const firstRegistryActions = (
      artifact.firstRegistryActions?.length
        ? artifact.firstRegistryActions
        : fallbackExternalRuntimeFirstRegistryActions(
            images,
            approvalGatedCommands
          )
    ).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? "registry-admin",
      phase: action.phase ?? "external-runtime-registry",
      status: action.status ?? "needs-evidence",
      request: action.request ?? "external runtime registry action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand:
        action.nextCommand ?? "npm run evidence:external-runtime:draft:digests",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath:
        action.rollbackPath ??
        "Regenerate the external runtime review packet before proceeding."
    }));
    const ticketPackets = (artifact.ticketPackets ?? []).map((ticket) => ({
      ...ticket,
      owner: "registry-admin" as const,
      severity: ticket.severity === "blocker" ? ("blocker" as const) : ("high" as const),
      evidenceChecklist: ticket.evidenceChecklist ?? [],
      firstReadOnlyAction: {
        id: ticket.firstReadOnlyAction?.id ?? "unknown",
        status: ticket.firstReadOnlyAction?.status ?? "needs-evidence",
        nextCommand:
          ticket.firstReadOnlyAction?.nextCommand ??
          "npm run evidence:external-runtime:draft:digests",
        mutation: ticket.firstReadOnlyAction?.mutation === true,
        requiresExplicitApproval:
          ticket.firstReadOnlyAction?.requiresExplicitApproval === true
      },
      approvalGatedAction: {
        id: ticket.approvalGatedAction?.id ?? "unknown",
        status: ticket.approvalGatedAction?.status ?? "approval-gated",
        nextCommand: ticket.approvalGatedAction?.nextCommand ?? "approval-gated",
        mutation: ticket.approvalGatedAction?.mutation === true,
        requiresExplicitApproval:
          ticket.approvalGatedAction?.requiresExplicitApproval === true
      },
      nextCommands: ticket.nextCommands ?? [],
      blockedBy: ticket.blockedBy ?? [],
      mutationBoundary: {
        clusterMutationAttempted:
          ticket.mutationBoundary?.clusterMutationAttempted === true,
        registryMutationAttempted:
          ticket.mutationBoundary?.registryMutationAttempted === true,
        mutationAllowedByThisVerifier:
          ticket.mutationBoundary?.mutationAllowedByThisVerifier === true,
        registryChangeRequiresExplicitApproval:
          ticket.mutationBoundary?.registryChangeRequiresExplicitApproval !== false
      },
      registryAuthBoundary: {
        authRequired: ticket.registryAuthBoundary?.authRequired === true,
        humanCredentialInputRequired:
          ticket.registryAuthBoundary?.humanCredentialInputRequired === true,
        credentialStoredByVerifier:
          ticket.registryAuthBoundary?.credentialStoredByVerifier === true,
        pullSecretCreatedByVerifier:
          ticket.registryAuthBoundary?.pullSecretCreatedByVerifier === true,
        registryLoginExecutedByVerifier:
          ticket.registryAuthBoundary?.registryLoginExecutedByVerifier === true,
        firstHumanSetupAction:
          ticket.registryAuthBoundary?.firstHumanSetupAction ?? "not-required"
      }
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
        firstReviewerActions,
        firstRegistryActions,
        ticketPackets,
        images,
        candidateHandoff,
        finalEvidenceHandoff,
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
        `external runtime candidate handoff=${candidateHandoff.map((handoff) => `${handoff.imageName}:${handoff.status}:eligible=${String(handoff.releaseEligible)}:mutationAllowed=${String(handoff.mutationAllowed)}`).join(", ") || "missing"}`,
        `external runtime final evidence handoff=${finalEvidenceHandoff.map((handoff) => `${handoff.imageName}:${handoff.status}:promotion=${handoff.promotionCommand}:mutationAllowed=${String(handoff.mutationAllowed)}`).join(", ") || "missing"}`,
        `external runtime first reviewer actions=${firstReviewerActions.map((action) => `${action.imageName}:${action.role}:${action.nextCommand}`).join(", ") || "missing"}`,
        `external runtime first registry actions=${firstRegistryActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
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

function missingOperatorPackageSummary(
  message: string,
  status: OpsLensOperatorPackageReadiness = "needs-evidence",
  artifactStatus = "missing"
): OpsLensOperatorPackageSummary {
  return {
    status,
    artifactStatus,
    actionMode: "readOnlyEvidenceOnly",
    headSha: "missing",
    worktreeDirty: "unknown",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-OP-001", "AC-OP-005", "AC-CERT-001"],
    packageBoundary: {
      staticStackContainsOlsConfig: "unknown",
      staticStackAppliesLightspeedRegistration: "unknown",
      appManifestObjectCount: "unknown",
      approvalGatedTemplateExists: "unknown",
      olsconfigTemplateKind: "missing",
      olsconfigTemplateName: "missing",
      olsconfigTemplateNamespace: "missing",
      reconcileMode: "missing",
      approvalGatedOnly: "unknown",
      featureGates: [],
      mcpServerName: "missing",
      mcpUrl: "missing",
      headerTypes: [],
      forbiddenRegistrationPaths: [],
      rollbackPath: "Regenerate operator package evidence before live install review."
    },
    evidence: [
      "dashboard keeps Operator package readiness as needs-evidence until static package evidence exists",
      "admin overview reads Operator package evidence only; it does not apply manifests, patch OLSConfig, push images, or mutate cluster resources"
    ],
    missingEvidence: [message],
    warnings: [],
    risk: [
      "Without Operator package evidence, the dashboard cannot prove static app stack and Lightspeed registration boundaries."
    ],
    rollbackPath: [
      "Run npm run verify:operator from a clean worktree, then rerun admin overview and MVP acceptance checks."
    ]
  };
}

function getOperatorPackageReadiness(): {
  status: OpsLensOperatorPackageReadiness;
  summary: OpsLensOperatorPackageSummary;
  evidence: string[];
} {
  const evidencePath = operatorPackageEvidencePath();

  if (!existsSync(evidencePath)) {
    const missingEvidence = [
      `Operator package evidence is missing at ${evidencePath}`,
      "run npm run verify:operator to create static package boundary evidence"
    ];
    const summary = missingOperatorPackageSummary(missingEvidence[0]);
    return {
      status: summary.status,
      summary: {
        ...summary,
        missingEvidence
      },
      evidence: [
        "run npm run verify:operator to create Operator package evidence",
        "dashboard reads Operator package evidence only; it does not apply manifests or patch OLSConfig",
        ...missingEvidence
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OperatorPackageEvidenceArtifact;
    const status = mapOperatorPackageReadinessStatus(artifact);
    const packageBoundary = artifact.packageBoundary ?? {};
    const appManifest = packageBoundary.appManifest ?? {};
    const olsconfigTemplate = packageBoundary.olsconfigTemplate ?? {};
    const lightspeedRegistration = packageBoundary.lightspeedRegistration ?? {};
    const actionMode =
      artifact.actionMode === "operatorPackageStaticOnly"
        ? "operatorPackageStaticOnly"
        : "readOnlyEvidenceOnly";
    const missingEvidence = [
      ...(artifact.missingEvidence ?? []),
      ...(status === "ready"
        ? []
        : [
            `Operator package status=${status} artifact=${artifact.status ?? "unknown"} actionMode=${artifact.actionMode ?? "unknown"}`
          ])
    ];
    const summary: OpsLensOperatorPackageSummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty ?? "unknown",
      registryMutationAttempted: artifact.registryMutationAttempted === true,
      clusterMutationAttempted: artifact.clusterMutationAttempted === true,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier === true,
      acceptance: artifact.acceptance ?? ["AC-OP-001", "AC-OP-005", "AC-CERT-001"],
      packageBoundary: {
        staticStackContainsOlsConfig:
          lightspeedRegistration.staticStackContainsOlsConfig ??
          appManifest.containsOlsResources ??
          "unknown",
        staticStackAppliesLightspeedRegistration:
          appManifest.staticStackAppliesLightspeedRegistration ?? "unknown",
        appManifestObjectCount: appManifest.objectCount ?? "unknown",
        approvalGatedTemplateExists:
          lightspeedRegistration.approvalGatedTemplateExists ?? "unknown",
        olsconfigTemplateKind: olsconfigTemplate.kind ?? "missing",
        olsconfigTemplateName: olsconfigTemplate.name ?? "missing",
        olsconfigTemplateNamespace: olsconfigTemplate.namespace ?? "missing",
        reconcileMode: olsconfigTemplate.reconcileMode ?? "missing",
        approvalGatedOnly: olsconfigTemplate.approvalGatedOnly ?? "unknown",
        featureGates: olsconfigTemplate.featureGates ?? [],
        mcpServerName: olsconfigTemplate.mcpServerName ?? "missing",
        mcpUrl: olsconfigTemplate.mcpUrl ?? "missing",
        headerTypes: olsconfigTemplate.headerTypes ?? [],
        forbiddenRegistrationPaths:
          lightspeedRegistration.forbiddenRegistrationPaths ?? [],
        rollbackPath:
          olsconfigTemplate.rollbackPath ??
          "Restore the previous OLSConfig spec.featureGates and spec.mcpServers from GitOps or cluster backup."
      },
      evidence: artifact.evidence ?? [],
      missingEvidence,
      warnings: artifact.warnings ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? []
    };

    return {
      status,
      summary,
      evidence: [
        `Operator package evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `operator package generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `staticStackContainsOlsConfig=${String(summary.packageBoundary.staticStackContainsOlsConfig)} staticStackAppliesLightspeedRegistration=${String(summary.packageBoundary.staticStackAppliesLightspeedRegistration)} approvalGatedTemplateExists=${String(summary.packageBoundary.approvalGatedTemplateExists)} mode=${summary.packageBoundary.reconcileMode}`,
        `forbiddenRegistrationPaths=${summary.packageBoundary.forbiddenRegistrationPaths.join(", ") || "missing"}`,
        "admin overview reads Operator package evidence only; it does not apply manifests, patch OLSConfig, push images, or mutate cluster resources"
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown evidence parse error";
    const summary = missingOperatorPackageSummary(
      message,
      "failed",
      "invalid"
    );
    return {
      status: "failed",
      summary,
      evidence: [
        `Operator package evidence could not be parsed from ${evidencePath}`,
        message,
        "invalid Operator package evidence blocks dashboard readiness"
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

function getOperatorRuntimeBoundaryReadiness(): {
  status: OpsLensOperatorRuntimeBoundaryReadiness;
  evidence: string[];
  boundary: OpsLensOperatorRuntimeBoundarySummary;
} {
  const evidencePath = operatorRuntimeParityEvidencePath();

  if (!existsSync(evidencePath)) {
    const missingEvidence = [
      `Operator runtime parity evidence is missing at ${evidencePath}`,
      "run npm run verify:operator:runtime to prove Go Lightspeed mutation boundaries"
    ];
    return {
      status: "needs-evidence",
      boundary: {
        status: "needs-evidence",
        artifactStatus: "missing",
        actionMode: "readOnlyEvidenceOnly",
        headSha: "missing",
        worktreeDirty: "unknown",
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        parity: {
          lightspeedMode: "unknown",
          lightspeedPhase: "unknown",
          willPatchLightspeed: "unknown",
          assistantMutationAllowed: "unknown",
          ragApprovalQueueMutationAllowed: "unknown",
          ragRawDocumentReturnAllowed: "unknown"
        },
        goLightspeedMutationBoundary: {
          functionFound: false,
          validateOnlyGuardBeforeRead: false,
          endpointGuardBeforeRead: false,
          patchCallCount: 0,
          patchAfterRead: false,
          configMapReferenceCount: -1,
          reconcileBeforeStatus: false
        },
        sourceArtifacts: {
          controller: "missing",
          clusterRole: "missing",
          csv: "missing",
          acceptance: "missing"
        },
        evidence: [
          "dashboard keeps Operator runtime boundary as needs-evidence until source parity evidence exists"
        ],
        missingEvidence,
        risk: [
          "Without runtime parity evidence, OLSConfig mutation safety is not visible from the dashboard."
        ],
        rollbackPath: [
          "Generate operator runtime parity evidence, then rerun admin overview and MVP acceptance checks."
        ]
      },
      evidence: [
        "run npm run verify:operator:runtime to create Operator runtime boundary evidence",
        "dashboard reads Operator runtime boundary evidence only; it does not patch OLSConfig or apply manifests",
        ...missingEvidence
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OperatorRuntimeParityEvidenceArtifact;
    const status = mapOperatorRuntimeBoundaryReadinessStatus(artifact);
    const boundary = artifact.goLightspeedMutationBoundary ?? {};
    const parity = artifact.parity ?? {};
    const actionMode =
      artifact.actionMode === "operatorRuntimeParityOnly"
        ? "operatorRuntimeParityOnly"
        : "readOnlyEvidenceOnly";
    const missingEvidence = [
      ...(artifact.missingEvidence ?? []),
      ...(status === "ready"
        ? []
        : [`Operator runtime boundary status=${status} artifact=${artifact.status ?? "unknown"}`])
    ];
    const summary: OpsLensOperatorRuntimeBoundarySummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty ?? "unknown",
      clusterMutationAttempted: artifact.clusterMutationAttempted ?? false,
      registryMutationAttempted: artifact.registryMutationAttempted ?? false,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier ?? false,
      parity: {
        lightspeedMode: parity.lightspeedMode ?? "unknown",
        lightspeedPhase: parity.lightspeedPhase ?? "unknown",
        willPatchLightspeed: parity.willPatchLightspeed ?? "unknown",
        assistantMutationAllowed: parity.assistantMutationAllowed ?? "unknown",
        ragApprovalQueueMutationAllowed:
          parity.ragApprovalQueueMutationAllowed ?? "unknown",
        ragRawDocumentReturnAllowed:
          parity.ragRawDocumentReturnAllowed ?? "unknown"
      },
      goLightspeedMutationBoundary: {
        functionFound: boundary.functionFound === true,
        validateOnlyGuardBeforeRead:
          boundary.validateOnlyGuardBeforeRead === true,
        endpointGuardBeforeRead: boundary.endpointGuardBeforeRead === true,
        patchCallCount: boundary.patchCallCount ?? 0,
        patchAfterRead: boundary.patchAfterRead === true,
        configMapReferenceCount: boundary.configMapReferenceCount ?? -1,
        reconcileBeforeStatus: boundary.reconcileBeforeStatus === true
      },
      sourceArtifacts: {
        controller: artifact.fixtures?.controller ?? "unknown",
        clusterRole: artifact.fixtures?.clusterRole ?? "unknown",
        csv: artifact.fixtures?.csv ?? "unknown",
        acceptance: artifact.fixtures?.acceptance ?? "unknown"
      },
      evidence: [
        ...(artifact.evidence ?? []).slice(0, 4),
        `operator runtime parity generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `ValidateOnly guard before read=${String(boundary.validateOnlyGuardBeforeRead)} endpoint guard before read=${String(boundary.endpointGuardBeforeRead)}`,
        `OLSConfig patchCallCount=${String(boundary.patchCallCount ?? "unknown")} patchAfterRead=${String(boundary.patchAfterRead)} legacyConfigMapReferenceCount=${String(boundary.configMapReferenceCount ?? "unknown")}`,
        "admin overview reads Operator runtime parity evidence only; it does not patch OLSConfig, apply manifests, or run live Operator actions"
      ],
      missingEvidence,
      risk: artifact.risk ?? [
        "Runtime parity is source-level evidence; live Operator SDK and OLM smoke remain approval-gated."
      ],
      rollbackPath: artifact.rollbackPath ?? [
        "Revert the controller-runtime or TypeScript reconcile mismatch and rerun npm run verify:operator:runtime."
      ]
    };

    return {
      status,
      boundary: summary,
      evidence: [
        `Operator runtime boundary evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `Go Lightspeed boundary validateOnlyBeforeRead=${String(summary.goLightspeedMutationBoundary.validateOnlyGuardBeforeRead)} endpointBeforeRead=${String(summary.goLightspeedMutationBoundary.endpointGuardBeforeRead)} patchCallCount=${summary.goLightspeedMutationBoundary.patchCallCount} legacyConfigMapReferences=${summary.goLightspeedMutationBoundary.configMapReferenceCount}`,
        `operator runtime boundary head=${summary.headSha} dirty=${String(summary.worktreeDirty)}`,
        ...missingEvidence.slice(0, 3),
        "admin overview reads Operator runtime boundary evidence only; it does not mutate OLSConfig or cluster resources"
      ]
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown evidence parse error";
    return {
      status: "failed",
      boundary: {
        status: "failed",
        artifactStatus: "parse-error",
        actionMode: "readOnlyEvidenceOnly",
        headSha: "unknown",
        worktreeDirty: "unknown",
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        parity: {
          lightspeedMode: "unknown",
          lightspeedPhase: "unknown",
          willPatchLightspeed: "unknown",
          assistantMutationAllowed: "unknown",
          ragApprovalQueueMutationAllowed: "unknown",
          ragRawDocumentReturnAllowed: "unknown"
        },
        goLightspeedMutationBoundary: {
          functionFound: false,
          validateOnlyGuardBeforeRead: false,
          endpointGuardBeforeRead: false,
          patchCallCount: 0,
          patchAfterRead: false,
          configMapReferenceCount: -1,
          reconcileBeforeStatus: false
        },
        sourceArtifacts: {
          controller: "unknown",
          clusterRole: "unknown",
          csv: "unknown",
          acceptance: "unknown"
        },
        evidence: [],
        missingEvidence: [message],
        risk: [
          "Invalid Operator runtime boundary evidence blocks overclaiming OLSConfig safety."
        ],
        rollbackPath: [
          "Regenerate operator runtime parity evidence and rerun dashboard acceptance."
        ]
      },
      evidence: [
        `Operator runtime parity evidence could not be parsed from ${evidencePath}`,
        message,
        "invalid Operator runtime boundary evidence blocks overclaiming install readiness"
      ]
    };
  }
}

function getEnvContractReadiness(): {
  status: OpsLensEnvContractReadiness;
  evidence: string[];
  envContract: OpsLensEnvContractSummary;
} {
  const evidencePath = envContractEvidencePath();

  if (!existsSync(evidencePath)) {
    const missingEvidence = [
      `Environment contract evidence is missing at ${evidencePath}`
    ];
    const evidence = [
      "run npm run verify:env to prove OCP and Lightspeed target key isolation",
      "dashboard keeps environment isolation as needs-evidence until the artifact exists",
      "verify:env records key presence and counts only; it does not write secret values"
    ];

    return {
      status: "needs-evidence",
      evidence,
      envContract: {
        status: "needs-evidence",
        artifactStatus: "missing",
        actionMode: "localEnvAuditOnly",
        headSha: "missing",
        worktreeDirty: false,
        activeOcpTarget: false,
        activeLightspeedTarget: false,
        activeKeyCount: 0,
        commentedTrackedCount: 0,
        duplicateActiveKeys: [],
        activeMissingValues: [],
        checks: [],
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        vectorWriteAttempted: false,
        mutationAllowedByThisVerifier: false,
        evidence,
        missingEvidence,
        risk: [
          "Without environment isolation evidence, live readiness checks can be pointed at the wrong OCP or Lightspeed target."
        ],
        rollbackPath: [
          "Run npm run verify:env after updating .env target keys."
        ]
      }
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as EnvContractArtifact;
    const status: OpsLensEnvContractReadiness =
      artifact.status === "PASS" && artifact.ref?.worktreeDirty !== true
        ? "ready"
        : artifact.status === "FAIL"
          ? "failed"
          : "needs-evidence";
    const checks = (artifact.checks ?? []).map((check) => ({
      name: check.name ?? "unknown",
      status: check.status === "PASS" ? "PASS" as const : "FAIL" as const,
      detail: check.detail ?? "missing detail"
    }));
    const evidence = [
      `Environment contract ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
      `verify:env head=${artifact.ref?.headSha ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")} activeKeys=${String(artifact.envAudit?.activeKeyCount ?? 0)} commented=${String(artifact.envAudit?.commentedTrackedCount ?? 0)}`,
      `activeOcpTarget=${String(artifact.envAudit?.activeOcpTarget === true)} activeLightspeedTarget=${String(artifact.envAudit?.activeLightspeedTarget === true)}`,
      "env contract evidence records key state only and redacts actual values"
    ];

    return {
      status,
      evidence,
      envContract: {
        status,
        artifactStatus: artifact.status ?? "unknown",
        actionMode: "localEnvAuditOnly",
        headSha: artifact.ref?.headSha ?? "unknown",
        worktreeDirty: artifact.ref?.worktreeDirty === true,
        activeOcpTarget: artifact.envAudit?.activeOcpTarget === true,
        activeLightspeedTarget:
          artifact.envAudit?.activeLightspeedTarget === true,
        activeKeyCount: artifact.envAudit?.activeKeyCount ?? 0,
        commentedTrackedCount: artifact.envAudit?.commentedTrackedCount ?? 0,
        duplicateActiveKeys: artifact.envAudit?.duplicateActiveKeys ?? [],
        activeMissingValues: artifact.envAudit?.activeMissingValues ?? [],
        checks,
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        registryMutationAttempted: artifact.registryMutationAttempted === true,
        vectorWriteAttempted: artifact.vectorWriteAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        evidence: [...evidence, ...(artifact.evidence ?? []).slice(0, 3)],
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      }
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown env contract parse error";
    const evidence = [
      `Environment contract could not be parsed from ${evidencePath}`,
      message,
      "invalid environment evidence blocks overclaiming live target isolation"
    ];

    return {
      status: "failed",
      evidence,
      envContract: {
        status: "failed",
        artifactStatus: "invalid",
        actionMode: "localEnvAuditOnly",
        headSha: "unknown",
        worktreeDirty: false,
        activeOcpTarget: false,
        activeLightspeedTarget: false,
        activeKeyCount: 0,
        commentedTrackedCount: 0,
        duplicateActiveKeys: [],
        activeMissingValues: [],
        checks: [],
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        vectorWriteAttempted: false,
        mutationAllowedByThisVerifier: false,
        evidence,
        missingEvidence: [message],
        risk: [
          "Invalid env evidence prevents trusting live readiness target selection."
        ],
        rollbackPath: [
          "Regenerate the artifact with npm run verify:env after fixing the evidence file."
        ]
      }
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
        credentialHygiene: {
          tokenConfigured: false,
          tokenSource: "missing",
          tokenCandidateCount: 0,
          tokenLengthClass: "missing",
          tokenLooksPlaceholder: false,
          tokenHasWhitespace: false,
          tokenStartsWithBearer: false,
          tokenLooksOpenShiftSha: false,
          localFormatIssue: true,
          credentialStoredByVerifier: false,
          tokenValueRedacted: true,
          credentialDiagnosis: "missing-evidence"
        },
        diagnostics: {
          dns: "missing",
          tcp: "missing",
          tls: "missing",
          kubernetesVersion: "missing",
          oc: "missing",
          ocContext: {
            currentContextSet: false,
            whoamiAvailable: false,
            showServerAvailable: false,
            kubeconfigEnvConfigured: false,
            defaultKubeconfigPresent: false,
            contextStatus: "missing",
            authStatus: "not-authenticated",
            serverStatus: "missing"
          },
          rbacAccessReviews: []
        },
        authRecovery: defaultOcpAuthRecovery("missing", "missing-evidence"),
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
      ocContext: {
        currentContextSet:
          artifact.diagnostics?.ocContext?.currentContextSet === true,
        whoamiAvailable:
          artifact.diagnostics?.ocContext?.whoamiAvailable === true,
        showServerAvailable:
          artifact.diagnostics?.ocContext?.showServerAvailable === true,
        kubeconfigEnvConfigured:
          artifact.diagnostics?.ocContext?.kubeconfigEnvConfigured === true,
        defaultKubeconfigPresent:
          artifact.diagnostics?.ocContext?.defaultKubeconfigPresent === true,
        contextStatus:
          artifact.diagnostics?.ocContext?.contextStatus ?? "unknown",
        authStatus:
          artifact.diagnostics?.ocContext?.authStatus ?? "unknown",
        serverStatus:
          artifact.diagnostics?.ocContext?.serverStatus ?? "unknown"
      },
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
    const authRecovery = mapOcpAuthRecovery(
      artifact,
      classification,
      artifact.credentialHygiene?.credentialDiagnosis ?? "unknown",
      diagnostics.ocContext.contextStatus,
      diagnostics.ocContext.authStatus
    );

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
          host: "<redacted-host>",
          port: target.port ?? "unknown",
          redactedBaseUrl: redactedOcpTarget(target),
          tokenConfigured: target.tokenConfigured === true,
          tlsVerify: target.tlsVerify !== false
        },
        credentialHygiene: {
          tokenConfigured: artifact.credentialHygiene?.tokenConfigured === true,
          tokenSource: artifact.credentialHygiene?.tokenSource ?? "unknown",
          tokenCandidateCount:
            artifact.credentialHygiene?.tokenCandidateCount ?? 0,
          tokenLengthClass:
            artifact.credentialHygiene?.tokenLengthClass ?? "unknown",
          tokenLooksPlaceholder:
            artifact.credentialHygiene?.tokenLooksPlaceholder === true,
          tokenHasWhitespace:
            artifact.credentialHygiene?.tokenHasWhitespace === true,
          tokenStartsWithBearer:
            artifact.credentialHygiene?.tokenStartsWithBearer === true,
          tokenLooksOpenShiftSha:
            artifact.credentialHygiene?.tokenLooksOpenShiftSha === true,
          localFormatIssue:
            artifact.credentialHygiene?.localFormatIssue === true,
          credentialStoredByVerifier:
            artifact.credentialHygiene?.credentialStoredByVerifier === true,
          tokenValueRedacted:
            artifact.credentialHygiene?.tokenValueRedacted !== false,
          credentialDiagnosis:
            artifact.credentialHygiene?.credentialDiagnosis ?? "unknown"
        },
        diagnostics,
        authRecovery,
        actionHints,
        readOnlyTroubleshootingCommands,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP connectivity diagnostic ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `OCP connectivity classification=${classification} target=${redactedOcpTarget(target)}`,
        `diagnostics dns=${diagnostics.dns} tcp=${diagnostics.tcp} tls=${diagnostics.tls} /version=${diagnostics.kubernetesVersion} oc=${diagnostics.oc}`,
        diagnostics.rbacAccessReviews.length
          ? `rbacAccessReviews=${diagnostics.rbacAccessReviews.map((review) => `${review.id}:${review.status}`).join(",")}`
          : "rbacAccessReviews=missing",
        `authRecovery=${authRecovery.status}:${authRecovery.owner}:${authRecovery.credentialDiagnosis}`,
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
        credentialHygiene: {
          tokenConfigured: false,
          tokenSource: "unknown",
          tokenCandidateCount: 0,
          tokenLengthClass: "unknown",
          tokenLooksPlaceholder: false,
          tokenHasWhitespace: false,
          tokenStartsWithBearer: false,
          tokenLooksOpenShiftSha: false,
          localFormatIssue: true,
          credentialStoredByVerifier: false,
          tokenValueRedacted: true,
          credentialDiagnosis: "invalid-evidence"
        },
        diagnostics: {
          dns: "unknown",
          tcp: "unknown",
          tls: "unknown",
          kubernetesVersion: "unknown",
          oc: "unknown",
          ocContext: {
            currentContextSet: false,
            whoamiAvailable: false,
            showServerAvailable: false,
            kubeconfigEnvConfigured: false,
            defaultKubeconfigPresent: false,
            contextStatus: "invalid",
            authStatus: "not-authenticated",
            serverStatus: "missing"
          },
          rbacAccessReviews: []
        },
        authRecovery: defaultOcpAuthRecovery(
          "invalid-evidence",
          "invalid-evidence"
        ),
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

function fallbackInstallApprovalTicketPacket({
  status,
  classification,
  firstApprovalActions = [],
  requiredApprovals = [
    "cluster-admin",
    "cluster-sre",
    "security-reviewer",
    "product-owner"
  ],
  missingEvidence = []
}: {
  status: string;
  classification: string;
  firstApprovalActions?: Array<{
    id: string;
    status: string;
    nextCommand: string;
    mutation: boolean;
    requiresExplicitApproval: boolean;
  }>;
  requiredApprovals?: string[];
  missingEvidence?: string[];
}): OpsLensInstallApprovalTicketPacket {
  const firstReadOnly =
    firstApprovalActions.find(
      (action) => action.id === "run-operator-server-dry-run"
    ) ??
    firstApprovalActions.find((action) => action.mutation === false) ?? {
      id: "run-operator-server-dry-run",
      status: status === "approval-required" ? "ready" : "needs-evidence",
      nextCommand: "npm run verify:operator:dry-run",
      mutation: false,
      requiresExplicitApproval: false
    };
  const approvalAction =
    firstApprovalActions.find((action) => action.mutation === true) ?? {
      id: "approval-gated-apply-operator-namespace",
      status: "approval-gated",
      nextCommand:
        "oc create namespace cywell-opslens --dry-run=server -o yaml | oc apply -f -",
      mutation: true,
      requiresExplicitApproval: true
    };

  return {
    id: "cluster-admin-install-approval-ticket",
    owner: "cluster-admin",
    title: "Install approval handoff",
    severity: "high",
    classification,
    installStatus: status,
    requiredApprovals,
    evidenceChecklist: [
      "Operator server-side dry-run evidence is current and read-only",
      "Lightspeed PatchOLSConfig preview is current and preview-only",
      "Release image and RAG ingestion evidence are current before install approval",
      "Install and OLSConfig mutation commands remain approval-gated"
    ],
    firstReadOnlyAction: {
      id: firstReadOnly.id,
      status: firstReadOnly.status,
      nextCommand: firstReadOnly.nextCommand,
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: approvalAction.id,
      status: approvalAction.status,
      nextCommand: approvalAction.nextCommand,
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: [
      firstReadOnly.nextCommand,
      approvalAction.nextCommand,
      "npm run verify:install-plan"
    ],
    blockedBy: missingEvidence,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false,
      installRequiresExplicitApproval: true
    },
    risk:
      "Install approval remains blocked until cluster mutations and future ingestion are explicitly approved.",
    rollbackPath:
      "Regenerate install approval evidence and use the approved uninstall order before any correction."
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
        firstApprovalActions: [
          {
            id: "generate-install-approval-plan",
            owner: "cluster-admin",
            phase: "approval-preflight",
            status: "needs-evidence",
            request: "Generate install approval evidence before reviewing mutating install commands.",
            evidenceNeeded: `install approval plan evidence is missing at ${evidencePath}`,
            nextCommand: "npm run verify:install-plan",
            mutation: false,
            requiresExplicitApproval: false,
            blockedBy: [`install approval plan evidence is missing at ${evidencePath}`],
            rollbackPath: "No rollback is required because no install command has run."
          }
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
        ),
        ticketPacket: fallbackInstallApprovalTicketPacket({
          status: "needs-evidence",
          classification: "install-plan-missing",
          firstApprovalActions: [
            {
              id: "generate-install-approval-plan",
              status: "needs-evidence",
              nextCommand: "npm run verify:install-plan",
              mutation: false,
              requiresExplicitApproval: false
            }
          ],
          missingEvidence: [
            `install approval plan evidence is missing at ${evidencePath}`
          ]
        })
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
    const firstApprovalActions = (artifact.firstApprovalActions ?? []).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? "cluster-admin",
      phase: action.phase ?? "unknown",
      status: action.status ?? "unknown",
      request: action.request ?? "install approval action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand: action.nextCommand ?? "npm run verify:install-plan",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath: action.rollbackPath ?? "Regenerate install approval evidence before proceeding."
    }));
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
    const ticketPacket: OpsLensInstallApprovalTicketPacket =
      artifact.ticketPacket ??
      fallbackInstallApprovalTicketPacket({
        status,
        classification:
          (artifact.missingEvidence ?? []).length > 0
            ? "install-evidence-gaps"
            : "install-approval-required",
        firstApprovalActions,
        requiredApprovals: artifact.requiredApprovals,
        missingEvidence: artifact.missingEvidence ?? []
      });

    return {
      status,
      plan: {
        status,
        actionMode: "approvalPlanOnly",
        clusterMutationAttempted: artifact.clusterMutationAttempted === true,
        mutationAllowedByThisVerifier:
          artifact.mutationAllowedByThisVerifier === true,
        requiredApprovals: artifact.requiredApprovals ?? [],
        firstApprovalActions,
        mutatingCommands,
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? [],
        missingEvidence: artifact.missingEvidence ?? [],
        lightspeedRegistration,
        ragIngestion,
        ticketPacket
      },
      evidence: [
        `Install approval plan evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `install approval plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `actionMode=${artifact.actionMode ?? "unknown"} clusterMutationAttempted=${String(artifact.clusterMutationAttempted ?? "unknown")} mutationAllowedByThisVerifier=${String(artifact.mutationAllowedByThisVerifier ?? "unknown")}`,
        `required approvals=${(artifact.requiredApprovals ?? []).join(", ") || "unknown"}`,
        `install first approval actions=${firstApprovalActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        `install approval ticket=${ticketPacket.id}:${ticketPacket.firstReadOnlyAction.id}:approval=${ticketPacket.approvalGatedAction.id}`,
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
        firstApprovalActions: [],
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
        ),
        ticketPacket: fallbackInstallApprovalTicketPacket({
          status: "failed",
          classification: "install-plan-invalid",
          firstApprovalActions: [
            {
              id: "generate-install-approval-plan",
              status: "failed",
              nextCommand: "npm run verify:install-plan",
              mutation: false,
              requiresExplicitApproval: false
            }
          ],
          missingEvidence: [
            error instanceof Error ? error.message : "unknown evidence parse error"
          ]
        })
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
        firstPublishActions: [
          {
            id: "generate-release-publish-plan",
            owner: "release-manager",
            phase: "publish-preflight",
            status: "needs-evidence",
            request: "Generate release publish evidence before image push, signing, mirroring, or catalog publication.",
            evidenceNeeded: `release publish plan evidence is missing at ${evidencePath}`,
            nextCommand: "npm run verify:release-plan",
            mutation: false,
            requiresExplicitApproval: false,
            blockedBy: [`release publish plan evidence is missing at ${evidencePath}`],
            rollbackPath: "No rollback is required because no registry mutation has run."
          }
        ],
        ticketPacket: {
          id: "release-manager-release-publish-ticket",
          owner: "release-manager",
          title: "Release publish approval handoff",
          severity: "high",
          classification: "publish-plan-missing",
          publishStatus: "needs-evidence",
          requiredApprovals: [
            "release-manager",
            "registry-admin",
            "security-reviewer",
            "product-owner"
          ],
          publishImageCount: 0,
          evidenceChecklist: [
            "Generate release publish evidence before registry or catalog mutation"
          ],
          firstReadOnlyAction: {
            id: "generate-release-publish-plan",
            status: "needs-evidence",
            nextCommand: "npm run verify:release-plan",
            mutation: false,
            requiresExplicitApproval: false
          },
          approvalGatedAction: {
            id: "approval-gated-release-publish",
            status: "blocked",
            nextCommand: "approval-gated release publish command",
            mutation: true,
            requiresExplicitApproval: true
          },
          nextCommands: ["npm run verify:release-plan"],
          blockedBy: [`release publish plan evidence is missing at ${evidencePath}`],
          mutationBoundary: {
            clusterMutationAttempted: false,
            registryMutationAttempted: false,
            mutationAllowedByThisVerifier: false,
            publishRequiresExplicitApproval: true
          },
          risk:
            "No release publish plan evidence is available yet; image push, signing, mirroring, and catalog publication remain blocked.",
          rollbackPath:
            "Generate release publish evidence before attempting registry or catalog publication commands."
        },
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
    const firstPublishActions = (artifact.firstPublishActions ?? []).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? "release-manager",
      phase: action.phase ?? "unknown",
      status: action.status ?? "unknown",
      request: action.request ?? "release publish action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand: action.nextCommand ?? "npm run verify:release-plan",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath: action.rollbackPath ?? "Regenerate release publish evidence before proceeding."
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
    const firstReadOnlyPublishAction =
      firstPublishActions.find((action) => action.id === "run-release-preflight") ??
      firstPublishActions.find((action) => action.mutation === false);
    const ticketPacket: OpsLensReleasePublishTicketPacket =
      artifact.ticketPacket ?? {
        id: "release-manager-release-publish-ticket",
        owner: "release-manager",
        title: "Release publish approval handoff",
        severity: "high",
        classification: "publish-evidence-gaps",
        publishStatus: artifact.status ?? "unknown",
        requiredApprovals: artifact.requiredApprovals ?? [],
        publishImageCount: publishImages.length,
        evidenceChecklist: [
          "Release publish evidence is generated before registry or catalog mutation"
        ],
        firstReadOnlyAction: {
          id: firstReadOnlyPublishAction?.id ?? "run-release-preflight",
          status: firstReadOnlyPublishAction?.status ?? "needs-evidence",
          nextCommand:
            firstReadOnlyPublishAction?.nextCommand ??
            "npm run verify:release-plan",
          mutation: false,
          requiresExplicitApproval: false
        },
        approvalGatedAction: {
          id:
            firstPublishActions.find((action) => action.mutation === true)?.id ??
            "approval-gated-release-publish",
          status:
            firstPublishActions.find((action) => action.mutation === true)
              ?.status ?? "approval-gated",
          nextCommand:
            firstPublishActions.find((action) => action.mutation === true)
              ?.nextCommand ?? "approval-gated release publish command",
          mutation: true,
          requiresExplicitApproval: true
        },
        nextCommands: ["npm run verify:release-plan"],
        blockedBy: artifact.missingEvidence ?? [],
        mutationBoundary: {
          clusterMutationAttempted: false,
          registryMutationAttempted: false,
          mutationAllowedByThisVerifier: false,
          publishRequiresExplicitApproval: true
        },
        risk:
          "Release publish remains blocked until registry and catalog mutations are explicitly approved.",
        rollbackPath:
          "Publish corrected tags and update FBC/CatalogSource references after any approved correction."
      };

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
        firstPublishActions,
        ticketPacket,
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
        `release first publish actions=${firstPublishActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        `release publish ticket=${ticketPacket.id}:${ticketPacket.firstReadOnlyAction.id}:approval=${ticketPacket.approvalGatedAction.id}`,
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
        firstPublishActions: [],
        ticketPacket: {
          id: "release-manager-release-publish-ticket",
          owner: "release-manager",
          title: "Release publish approval handoff",
          severity: "high",
          classification: "publish-plan-invalid",
          publishStatus: "failed",
          requiredApprovals: [],
          publishImageCount: 0,
          evidenceChecklist: [
            "Regenerate valid release publish evidence before registry or catalog mutation"
          ],
          firstReadOnlyAction: {
            id: "generate-release-publish-plan",
            status: "failed",
            nextCommand: "npm run verify:release-plan",
            mutation: false,
            requiresExplicitApproval: false
          },
          approvalGatedAction: {
            id: "approval-gated-release-publish",
            status: "blocked",
            nextCommand: "approval-gated release publish command",
            mutation: true,
            requiresExplicitApproval: true
          },
          nextCommands: ["npm run verify:release-plan"],
          blockedBy: [
            error instanceof Error ? error.message : "unknown evidence parse error"
          ],
          mutationBoundary: {
            clusterMutationAttempted: false,
            registryMutationAttempted: false,
            mutationAllowedByThisVerifier: false,
            publishRequiresExplicitApproval: true
          },
          risk:
            "Release publish plan evidence is invalid; registry and catalog publication commands remain blocked.",
          rollbackPath:
            "Regenerate release publish evidence before attempting registry or catalog publication commands."
        },
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

function mapCommunityOperatorSubmissionStatus(
  artifact: CommunityOperatorSubmissionEvidenceArtifact
): OpsLensCommunityOperatorSubmissionReadiness {
  if (artifact.status === "PASS") return "ready";
  if (artifact.status === "FAILED") return "failed";
  return "needs-evidence";
}

function missingCommunityOperatorSubmissionSummary(
  reason: string,
  status: OpsLensCommunityOperatorSubmissionReadiness = "needs-evidence"
): OpsLensCommunityOperatorSubmissionSummary {
  return {
    status,
    artifactStatus: status === "failed" ? "invalid" : "missing",
    actionMode: "submissionDraftOnly",
    externalSubmissionAttempted: false,
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    headSha: "missing",
    worktreeDirty: false,
    submissionLayout: {
      root: "operators/cywell-opslens",
      packageName: "cywell-opslens",
      version: "0.1.0",
      ci: "operators/cywell-opslens/ci.yaml",
      catalogTemplate: "operators/cywell-opslens/catalog-templates/stable.yaml",
      manifests: [],
      metadata: "operators/cywell-opslens/0.1.0/metadata/annotations.yaml",
      scorecard: "operators/cywell-opslens/0.1.0/tests/scorecard/config.yaml"
    },
    parityPassed: false,
    sourceBundleParity: [],
    readOnlyCommands: [
      {
        id: "verify-community-submission",
        command: "npm run verify:community-submission",
        phase: "community-operator-preflight",
        mutation: false,
        requiresNetwork: false,
        writesLocalEvidence: true
      }
    ],
    approvalGatedCommands: [],
    firstSubmissionActions: [
      {
        id: "community-submission-draft-preflight",
        owner: "release-manager",
        phase: "community-operator-preflight",
        status: "needs-evidence",
        request:
          "Generate Community Operator submission draft evidence before external OperatorHub review.",
        evidenceNeeded: reason,
        nextCommand: "npm run verify:community-submission",
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [reason],
        rollbackPath:
          "No rollback is required because no external submission command has run."
      }
    ],
    missingEvidence: [reason],
    risk: [
      "Without Community Operator submission draft evidence, release review cannot prove source bundle parity before external PR approval."
    ],
    rollbackPath: [
      "Run npm run verify:community-submission from a clean Git HEAD before opening any external OperatorHub pull request."
    ]
  };
}

function getCommunityOperatorSubmissionReadiness(): {
  status: OpsLensCommunityOperatorSubmissionReadiness;
  evidence: string[];
  plan: OpsLensCommunityOperatorSubmissionSummary;
} {
  const evidencePath = communityOperatorSubmissionEvidencePath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      plan: missingCommunityOperatorSubmissionSummary(
        `Community Operator submission evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:community-submission to create Community Operator submission draft evidence",
        "dashboard keeps Community Operator submission as needs-evidence until source bundle parity is proven",
        "Community Operator submission evidence must keep externalSubmissionAttempted=false and mutation flags false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as CommunityOperatorSubmissionEvidenceArtifact;
    const status = mapCommunityOperatorSubmissionStatus(artifact);
    const sourceBundleParity = (artifact.sourceBundleParity ?? []).map(
      (entry) => ({
        id: entry.id ?? "unknown",
        source: entry.source ?? "missing",
        target: entry.target ?? "missing",
        sourceSha256: entry.sourceSha256 ?? "missing",
        targetSha256: entry.targetSha256 ?? "missing",
        match: entry.match === true
      })
    );
    const parityPassed =
      sourceBundleParity.length > 0 &&
      sourceBundleParity.every((entry) => entry.match);
    const submissionLayout = artifact.submissionLayout ?? {};
    const plan: OpsLensCommunityOperatorSubmissionSummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "submissionDraftOnly",
      externalSubmissionAttempted:
        artifact.externalSubmissionAttempted === true,
      registryMutationAttempted: artifact.registryMutationAttempted === true,
      clusterMutationAttempted: artifact.clusterMutationAttempted === true,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier === true,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      submissionLayout: {
        root: submissionLayout.root ?? "operators/cywell-opslens",
        packageName: submissionLayout.packageName ?? "cywell-opslens",
        version: submissionLayout.version ?? "0.1.0",
        ci: submissionLayout.ci ?? "operators/cywell-opslens/ci.yaml",
        catalogTemplate:
          submissionLayout.catalogTemplate ??
          "operators/cywell-opslens/catalog-templates/stable.yaml",
        manifests: submissionLayout.manifests ?? [],
        metadata:
          submissionLayout.metadata ??
          "operators/cywell-opslens/0.1.0/metadata/annotations.yaml",
        scorecard:
          submissionLayout.scorecard ??
          "operators/cywell-opslens/0.1.0/tests/scorecard/config.yaml"
      },
      parityPassed,
      sourceBundleParity,
      readOnlyCommands: (artifact.readOnlyCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        command: command.command ?? "unknown",
        phase: command.phase ?? "community-operator-preflight",
        mutation: command.mutation === true,
        requiresNetwork: command.requiresNetwork === true,
        writesLocalEvidence: command.writesLocalEvidence === true
      })),
      approvalGatedCommands: (artifact.approvalGatedCommands ?? []).map(
        (command) => ({
          id: command.id ?? "unknown",
          command: command.command ?? "unknown",
          phase: command.phase ?? "community-operator-external-submission",
          mutation: command.mutation === true,
          requiresExplicitApproval:
            command.requiresExplicitApproval === true,
          requiresNetwork: command.requiresNetwork === true
        })
      ),
      firstSubmissionActions: (artifact.firstSubmissionActions ?? []).map(
        (action) => ({
          id: action.id ?? "unknown",
          owner: action.owner ?? "release-manager",
          phase: action.phase ?? "community-operator-preflight",
          status: action.status ?? "needs-evidence",
          request: action.request ?? "Community Operator submission action",
          evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
          nextCommand:
            action.nextCommand ?? "npm run verify:community-submission",
          mutation: action.mutation === true,
          requiresExplicitApproval:
            action.requiresExplicitApproval === true,
          blockedBy: action.blockedBy ?? [],
          rollbackPath:
            action.rollbackPath ??
            "Regenerate Community Operator submission evidence before proceeding."
        })
      ),
      missingEvidence: artifact.missingEvidence ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? []
    };

    return {
      status,
      plan,
      evidence: [
        `Community Operator submission evidence ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `community submission generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `community submission parity=${String(parityPassed)} entries=${sourceBundleParity.length}`,
        `community submission first actions=${plan.firstSubmissionActions.map((action) => `${action.id}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        ...plan.missingEvidence.slice(0, 3),
        "admin overview reads Community Operator submission draft evidence only; it does not open OperatorHub pull requests, submit to Partner Connect, push images, or mutate clusters"
      ]
    };
  } catch (error) {
    return {
      status: "failed",
      plan: missingCommunityOperatorSubmissionSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "failed"
      ),
      evidence: [
        `Community Operator submission evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid Community Operator submission evidence blocks external submission readiness"
      ]
    };
  }
}

function missingCertificationRunnerEvidence(
  reason: string
): OpsLensCertificationReadinessSummary["toolingHandoff"]["runnerEvidence"] {
  return {
    path: "docs/release/evidence/certification/approved-ci-runner.json",
    requiredSchema: "cywell.opslens.certification-ci-runner.v0.1",
    status: "missing",
    approved: false,
    sameHead: false,
    mutation: false,
    requiresExplicitApproval: false,
    runner: {
      id: "missing",
      image: "missing",
      imageDigest: "missing",
      approvedBy: "missing",
      ticket: "missing",
      approvedAt: "missing"
    },
    toolVersions: {
      oc: "missing",
      docker: "missing",
      opm: "missing",
      operatorSdk: "missing"
    },
    evidenceArtifacts: {
      certificationReadiness: "missing",
      catalogToolchain: "missing",
      opmValidateLog: "missing",
      operatorSdkBundleValidateLog: "missing",
      operatorSdkScorecardLog: "missing"
    },
    missingEvidence: [reason],
    nextCommands: [
      "copy docs/release/evidence/certification/approved-ci-runner.example.json to docs/release/evidence/certification/approved-ci-runner.json",
      "npm run verify:certification -- --ci-runner-evidence docs/release/evidence/certification/approved-ci-runner.json",
      "npm run verify:catalog-toolchain"
    ],
    risk: [
      "Approved CI runner evidence is missing; local opm/operator-sdk gaps remain release-manager owned."
    ],
    rollbackPath: [
      "Regenerate certification readiness evidence after providing an approved CI runner artifact."
    ]
  };
}

function mapCertificationRunnerEvidence(
  artifact:
    | NonNullable<
        CertificationReadinessEvidenceArtifact["toolingHandoff"]
      >["runnerEvidence"]
    | undefined
): OpsLensCertificationReadinessSummary["toolingHandoff"]["runnerEvidence"] {
  if (!artifact) {
    return missingCertificationRunnerEvidence(
      "certification readiness evidence does not include approved CI runner evidence"
    );
  }
  return {
    path:
      artifact.path ??
      "docs/release/evidence/certification/approved-ci-runner.json",
    requiredSchema:
      artifact.requiredSchema ??
      "cywell.opslens.certification-ci-runner.v0.1",
    status: artifact.status ?? "missing",
    approved: artifact.approved === true,
    sameHead: artifact.sameHead === true,
    mutation: artifact.mutation === true,
    requiresExplicitApproval: artifact.requiresExplicitApproval === true,
    runner: {
      id: artifact.runner?.id ?? "missing",
      image: artifact.runner?.image ?? "missing",
      imageDigest: artifact.runner?.imageDigest ?? "missing",
      approvedBy: artifact.runner?.approvedBy ?? "missing",
      ticket: artifact.runner?.ticket ?? "missing",
      approvedAt: artifact.runner?.approvedAt ?? "missing"
    },
    toolVersions: {
      oc: artifact.toolVersions?.oc ?? "missing",
      docker: artifact.toolVersions?.docker ?? "missing",
      opm: artifact.toolVersions?.opm ?? "missing",
      operatorSdk: artifact.toolVersions?.operatorSdk ?? "missing"
    },
    evidenceArtifacts: {
      certificationReadiness:
        artifact.evidenceArtifacts?.certificationReadiness ?? "missing",
      catalogToolchain:
        artifact.evidenceArtifacts?.catalogToolchain ?? "missing",
      opmValidateLog: artifact.evidenceArtifacts?.opmValidateLog ?? "missing",
      operatorSdkBundleValidateLog:
        artifact.evidenceArtifacts?.operatorSdkBundleValidateLog ?? "missing",
      operatorSdkScorecardLog:
        artifact.evidenceArtifacts?.operatorSdkScorecardLog ?? "missing"
    },
    missingEvidence: artifact.missingEvidence ?? [],
    nextCommands: artifact.nextCommands ?? [],
    risk: artifact.risk ?? [],
    rollbackPath: artifact.rollbackPath ?? []
  };
}

function missingCertificationRunnerDraft(
  reason: string
): OpsLensCertificationReadinessSummary["toolingHandoff"]["runnerDraft"] {
  return {
    path: "docs/release/evidence/certification/approved-ci-runner.draft.json",
    finalEvidenceFile: "docs/release/evidence/certification/approved-ci-runner.json",
    status: "missing",
    evidenceState: "missing",
    actionMode: "draftOnly",
    draft: true,
    sameHead: false,
    mutation: false,
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    missingEvidence: [reason],
    reviewerRequests: [],
    sourceEvidence: {
      certificationReadiness: {
        path: "test-results/cywell-opslens-certification-readiness.json",
        status: "missing",
        headSha: "missing",
        worktreeDirty: "unknown"
      },
      catalogToolchain: {
        path: "test-results/cywell-opslens-catalog-toolchain-plan.json",
        status: "missing",
        headSha: "missing",
        worktreeDirty: "unknown"
      }
    },
    nextCommands: ["npm run evidence:certification:ci-runner-draft -- --force"],
    risk: [
      "CI runner draft intake is missing; release-manager cannot review approved CI runner evidence gaps from the dashboard."
    ],
    rollbackPath: [
      "Regenerate the draft intake from a clean current head or discard it before final CI runner approval."
    ]
  };
}

function mapCertificationRunnerDraft(
  headSha: string
): OpsLensCertificationReadinessSummary["toolingHandoff"]["runnerDraft"] {
  const draftPath =
    "docs/release/evidence/certification/approved-ci-runner.draft.json";
  const absoluteDraftPath = join(repoRoot, draftPath);
  if (!existsSync(absoluteDraftPath)) {
    return missingCertificationRunnerDraft(
      `approved CI runner draft evidence is missing at ${draftPath}`
    );
  }

  try {
    const artifact = JSON.parse(readFileSync(absoluteDraftPath, "utf8")) as {
      evidenceState?: string;
      status?: string;
      actionMode?: string;
      draft?: boolean;
      finalEvidenceFile?: string;
      registryMutationAttempted?: boolean;
      clusterMutationAttempted?: boolean;
      mutationAllowedByThisVerifier?: boolean;
      ref?: {
        headSha?: string;
        worktreeDirty?: boolean;
      };
      reviewerRequests?: Array<{
        owner?: string;
        request?: string;
        evidenceNeeded?: string;
        nextCommand?: string;
      }>;
      sourceEvidence?: {
        certificationReadiness?: {
          path?: string;
          status?: string;
          headSha?: string;
          worktreeDirty?: boolean | string;
        };
        catalogToolchain?: {
          path?: string;
          status?: string;
          headSha?: string;
          worktreeDirty?: boolean | string;
        };
      };
      missingEvidence?: string[];
      nextCommands?: string[];
      risk?: string[];
      rollbackPath?: string[];
    };
    const mutation =
      artifact.registryMutationAttempted === true ||
      artifact.clusterMutationAttempted === true ||
      artifact.mutationAllowedByThisVerifier === true;
    const sameHead =
      artifact.ref?.headSha === headSha && artifact.ref?.worktreeDirty === false;
    return {
      path: draftPath,
      finalEvidenceFile:
        artifact.finalEvidenceFile ??
        "docs/release/evidence/certification/approved-ci-runner.json",
      status: artifact.status ?? artifact.evidenceState ?? "unknown",
      evidenceState: artifact.evidenceState ?? artifact.status ?? "unknown",
      actionMode: artifact.actionMode ?? "draftOnly",
      draft: artifact.draft !== false,
      sameHead,
      mutation,
      registryMutationAttempted: artifact.registryMutationAttempted === true,
      clusterMutationAttempted: artifact.clusterMutationAttempted === true,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier === true,
      missingEvidence: artifact.missingEvidence ?? [],
      reviewerRequests: (artifact.reviewerRequests ?? []).map((request) => ({
        owner: request.owner ?? "release-manager",
        request: request.request ?? "review approved CI runner draft evidence",
        evidenceNeeded: request.evidenceNeeded ?? "missing evidence",
        nextCommand:
          request.nextCommand ??
          "npm run evidence:certification:ci-runner-draft -- --force"
      })),
      sourceEvidence: {
        certificationReadiness: {
          path:
            artifact.sourceEvidence?.certificationReadiness?.path ??
            "test-results/cywell-opslens-certification-readiness.json",
          status:
            artifact.sourceEvidence?.certificationReadiness?.status ?? "missing",
          headSha:
            artifact.sourceEvidence?.certificationReadiness?.headSha ?? "missing",
          worktreeDirty:
            artifact.sourceEvidence?.certificationReadiness?.worktreeDirty ??
            "unknown"
        },
        catalogToolchain: {
          path:
            artifact.sourceEvidence?.catalogToolchain?.path ??
            "test-results/cywell-opslens-catalog-toolchain-plan.json",
          status: artifact.sourceEvidence?.catalogToolchain?.status ?? "missing",
          headSha:
            artifact.sourceEvidence?.catalogToolchain?.headSha ?? "missing",
          worktreeDirty:
            artifact.sourceEvidence?.catalogToolchain?.worktreeDirty ??
            "unknown"
        }
      },
      nextCommands: artifact.nextCommands ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? []
    };
  } catch (error) {
    return missingCertificationRunnerDraft(
      error instanceof Error ? error.message : "unknown runner draft parse error"
    );
  }
}

function missingCertificationToolingHandoff(
  reason: string
): OpsLensCertificationReadinessSummary["toolingHandoff"] {
  const missingRunnerEvidence = missingCertificationRunnerEvidence(reason);
  return {
    actionMode: "humanSetupOnly" as const,
    status: "needs-evidence",
    toolingSatisfiedBy: "missing",
    requiredTools: [],
    missingRequiredTools: [],
    runnerEvidence: missingRunnerEvidence,
    ticketPacket: missingCertificationToolingTicketPacket(
      "needs-evidence",
      "missing",
      [],
      missingRunnerEvidence,
      ["refresh-certification-evidence"],
      [reason]
    ),
    runnerDraft: missingCertificationRunnerDraft(reason),
    freshnessPolicy: {
      requiredHead: "missing",
      worktreeRequirement: "missing certification readiness evidence",
      rerunAfter: ["certification readiness evidence is regenerated"]
    },
    executionLanes: [],
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

function certificationTicketAction(
  action:
    | Partial<OpsLensCertificationToolingTicketPacket["firstReadOnlyAction"]>
    | undefined,
  fallbackId: string,
  fallbackCommand: string,
  fallbackStatus: string
): OpsLensCertificationToolingTicketPacket["firstReadOnlyAction"] {
  return {
    id: action?.id ?? fallbackId,
    status: action?.status ?? fallbackStatus,
    nextCommand: action?.nextCommand ?? fallbackCommand,
    mutation: action?.mutation === true,
    requiresExplicitApproval: action?.requiresExplicitApproval === true
  };
}

function missingCertificationToolingTicketPacket(
  toolingStatus: string,
  toolingSatisfiedBy: string,
  missingRequiredTools: string[],
  runnerEvidence: OpsLensCertificationReadinessSummary["toolingHandoff"]["runnerEvidence"],
  nextCommands: string[],
  blockedBy: string[]
): OpsLensCertificationToolingTicketPacket {
  return {
    id: "release-manager-certification-tooling-ticket",
    owner: "release-manager",
    title: "Provide approved opm/operator-sdk tooling or current-head CI runner evidence",
    severity: "high",
    classification: missingRequiredTools.length > 0
      ? "missing-local-tooling"
      : "certification-validation-required",
    toolingStatus,
    toolingSatisfiedBy,
    runnerEvidenceStatus: runnerEvidence.status,
    runnerEvidencePath: runnerEvidence.path,
    finalEvidencePath: "docs/release/evidence/certification/approved-ci-runner.json",
    missingRequiredTools,
    evidenceChecklist: [
      `toolingStatus=${toolingStatus}`,
      `toolingSatisfiedBy=${toolingSatisfiedBy}`,
      `missingRequiredTools=${missingRequiredTools.join(",") || "none"}`,
      `runnerEvidence=${runnerEvidence.status}`,
      `runnerEvidencePath=${runnerEvidence.path}`,
      "approved CI runner evidence must be digest-pinned, current-head, approved, and include validation logs",
      "external submission remains approval-gated and not run by this service"
    ],
    firstReadOnlyAction: {
      id: "refresh-certification-evidence",
      status: toolingStatus,
      nextCommand: "npm run verify:certification",
      mutation: false,
      requiresExplicitApproval: false
    },
    setupAction: {
      id: missingRequiredTools[0] ? `install-${missingRequiredTools[0]}` : "install-certification-tooling",
      status: "human-setup",
      nextCommand: missingRequiredTools.length > 0
        ? `install ${missingRequiredTools.join(" and ")} through an approved release-manager workstation or CI image`
        : "review approved certification tooling lane",
      mutation: false,
      requiresExplicitApproval: false,
      requiresHumanApproval: true
    },
    approvalGatedAction: {
      id: "partner-connect-submit",
      status: "approval-gated",
      nextCommand: "submit reviewed certification bundle through Red Hat Partner Connect",
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands,
    blockedBy,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      toolingInstallRequiresHumanApproval: true,
      externalSubmissionRequiresExplicitApproval: true
    },
    risk:
      "Missing or unapproved opm/operator-sdk tooling can make Community/Certified Operator validation drift from the release evidence bundle.",
    rollbackPath:
      "No rollback is required because this packet writes only local evidence; replace invalid tooling or CI runner evidence and rerun certification/catalog checks."
  };
}

function mapCertificationToolingTicketPacket(
  artifact: CertificationReadinessEvidenceArtifact["toolingHandoff"] | undefined,
  mapped: Pick<
    OpsLensCertificationReadinessSummary["toolingHandoff"],
    | "status"
    | "toolingSatisfiedBy"
    | "missingRequiredTools"
    | "runnerEvidence"
    | "nextCommands"
    | "executionLanes"
  >
): OpsLensCertificationToolingTicketPacket {
  const fallback = missingCertificationToolingTicketPacket(
    mapped.status,
    mapped.toolingSatisfiedBy,
    mapped.missingRequiredTools,
    mapped.runnerEvidence,
    mapped.nextCommands,
    [
      ...mapped.missingRequiredTools.map((tool) => `${tool} CLI unavailable on PATH`),
      ...mapped.runnerEvidence.missingEvidence,
      ...mapped.executionLanes.flatMap((lane) => lane.blockedBy)
    ]
  );
  const packet = artifact?.ticketPacket;
  if (!packet) return fallback;

  return {
    id: packet.id ?? fallback.id,
    owner: "release-manager",
    title: packet.title ?? fallback.title,
    severity: "high",
    classification: packet.classification ?? fallback.classification,
    toolingStatus: packet.toolingStatus ?? fallback.toolingStatus,
    toolingSatisfiedBy: packet.toolingSatisfiedBy ?? fallback.toolingSatisfiedBy,
    runnerEvidenceStatus:
      packet.runnerEvidenceStatus ?? fallback.runnerEvidenceStatus,
    runnerEvidencePath: packet.runnerEvidencePath ?? fallback.runnerEvidencePath,
    finalEvidencePath: packet.finalEvidencePath ?? fallback.finalEvidencePath,
    missingRequiredTools:
      packet.missingRequiredTools ?? fallback.missingRequiredTools,
    evidenceChecklist: packet.evidenceChecklist ?? fallback.evidenceChecklist,
    firstReadOnlyAction: certificationTicketAction(
      packet.firstReadOnlyAction,
      fallback.firstReadOnlyAction.id,
      fallback.firstReadOnlyAction.nextCommand,
      fallback.firstReadOnlyAction.status
    ),
    setupAction: {
      ...certificationTicketAction(
        packet.setupAction,
        fallback.setupAction.id,
        fallback.setupAction.nextCommand,
        fallback.setupAction.status
      ),
      requiresHumanApproval:
        packet.setupAction?.requiresHumanApproval ?? fallback.setupAction.requiresHumanApproval
    },
    approvalGatedAction: certificationTicketAction(
      packet.approvalGatedAction,
      fallback.approvalGatedAction.id,
      fallback.approvalGatedAction.nextCommand,
      fallback.approvalGatedAction.status
    ),
    nextCommands: packet.nextCommands ?? fallback.nextCommands,
    blockedBy: packet.blockedBy ?? fallback.blockedBy,
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      toolingInstallRequiresHumanApproval:
        packet.mutationBoundary?.toolingInstallRequiresHumanApproval ??
        fallback.mutationBoundary.toolingInstallRequiresHumanApproval,
      externalSubmissionRequiresExplicitApproval:
        packet.mutationBoundary?.externalSubmissionRequiresExplicitApproval ??
        fallback.mutationBoundary.externalSubmissionRequiresExplicitApproval
    },
    risk: packet.risk ?? fallback.risk,
    rollbackPath: packet.rollbackPath ?? fallback.rollbackPath
  };
}

function mapCertificationToolingHandoff(
  artifact: CertificationReadinessEvidenceArtifact["toolingHandoff"] | undefined,
  cli: OpsLensCertificationReadinessSummary["cli"],
  headSha: string
): OpsLensCertificationReadinessSummary["toolingHandoff"] {
  if (!artifact) {
    const missingRequiredTools = cli
      .filter((tool) => tool.requiredForExternalSubmission && !tool.available)
      .map((tool) => tool.name);
    const missingRunnerEvidence = missingCertificationRunnerEvidence(
      "certification readiness evidence does not include approved CI runner evidence"
    );
    const mapped = {
      ...missingCertificationToolingHandoff(
        "certification readiness evidence does not include tooling handoff"
      ),
      status: missingRequiredTools.length > 0 ? "needs-tooling" : "needs-evidence",
      toolingSatisfiedBy: "missing",
      requiredTools: cli.filter((tool) => tool.requiredForExternalSubmission),
      missingRequiredTools,
      runnerEvidence: missingRunnerEvidence,
      runnerDraft: mapCertificationRunnerDraft(headSha),
      freshnessPolicy: {
        requiredHead: "current Git HEAD",
        worktreeRequirement:
          "clean worktree before Community or Certified Operator submission",
        rerunAfter: [
          "tooling change",
          "bundle or catalog manifest change",
          "release image digest change",
          "external runtime evidence change"
        ]
      },
      executionLanes: [],
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
    return {
      ...mapped,
      ticketPacket: mapCertificationToolingTicketPacket(undefined, mapped)
    };
  }

  const mapped = {
    actionMode: "humanSetupOnly" as const,
    status: artifact.status ?? "needs-evidence",
    toolingSatisfiedBy: artifact.toolingSatisfiedBy ?? "missing",
    requiredTools: (artifact.requiredTools ?? []).map((tool) => ({
      name: tool.name ?? "unknown",
      available: tool.available === true,
      version: tool.version ?? "missing",
      requiredForExternalSubmission:
        tool.requiredForExternalSubmission === true
    })),
    missingRequiredTools: artifact.missingRequiredTools ?? [],
    runnerEvidence: mapCertificationRunnerEvidence(artifact.runnerEvidence),
    runnerDraft: mapCertificationRunnerDraft(headSha),
    freshnessPolicy: {
      requiredHead:
        artifact.freshnessPolicy?.requiredHead ?? "current Git HEAD",
      worktreeRequirement:
        artifact.freshnessPolicy?.worktreeRequirement ??
        "clean worktree before Community or Certified Operator submission",
      rerunAfter: artifact.freshnessPolicy?.rerunAfter ?? []
    },
    executionLanes: (artifact.executionLanes ?? []).map((lane) => ({
      id: lane.id ?? "unknown",
      owner: lane.owner ?? "release-manager",
      status: lane.status ?? "unknown",
      purpose: lane.purpose ?? "certification tooling execution lane",
      requiredTools: lane.requiredTools ?? [],
      requiredEvidence: lane.requiredEvidence ?? [],
      blockedBy: lane.blockedBy ?? [],
      nextCommands: lane.nextCommands ?? [],
      mutation: lane.mutation === true,
      requiresExplicitApproval: lane.requiresExplicitApproval === true
    })),
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
  return {
    ...mapped,
    ticketPacket: mapCertificationToolingTicketPacket(artifact, mapped)
  };
}

function fallbackCertificationSubmissionActions(
  toolingHandoff: OpsLensCertificationReadinessSummary["toolingHandoff"],
  missingEvidence: string[],
  gateCounts: OpsLensCertificationReadinessSummary["gateCounts"]
): OpsLensCertificationReadinessSummary["firstSubmissionActions"] {
  const blockedBy =
    missingEvidence.length > 0
      ? missingEvidence
      : toolingHandoff.missingRequiredTools.map(
          (tool) => `${tool} CLI readiness must be recorded`
        );
  const preflightStatus =
    toolingHandoff.status === "ready-for-validation" && blockedBy.length === 0
      ? "ready-for-review"
      : toolingHandoff.status;
  const firstGatedCommands = toolingHandoff.approvalGatedCommands.slice(0, 2);

  return [
    {
      id: "community-operator-preflight",
      owner: "release-manager",
      phase: "community-operator-preflight",
      status: preflightStatus,
      request:
        "Verify Community Operator packaging, bundle, FBC, scorecard, repository, and maintainer evidence before an external OperatorHub pull request.",
      evidenceNeeded: `community gates pass=${gateCounts.communityOperator.pass}/${gateCounts.communityOperator.total}; local or approved-CI opm/operator-sdk evidence required.`,
      nextCommand: "npm run verify:certification",
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "Fix local manifests or docs and rerun certification evidence; no external submission rollback is needed before approval."
    },
    {
      id: "certified-operator-preflight",
      owner: "release-manager",
      phase: "certified-operator-preflight",
      status: preflightStatus,
      request:
        "Verify Certified Operator release evidence, image security, provenance, support, and runtime evidence before Partner Connect review.",
      evidenceNeeded: `certified gates pass=${gateCounts.certifiedOperator.pass}/${gateCounts.certifiedOperator.total}; current-head release evidence bundle and human approvals required.`,
      nextCommand: "npm run verify:release-evidence-bundle",
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "Regenerate the release bundle after fixing evidence gaps; do not submit Certified Operator materials until approvals are explicit."
    },
    ...firstGatedCommands.map((command) => ({
      id: `approval-gated-${command.id}`,
      owner: "release-manager",
      phase: command.phase,
      status: "approval-gated",
      request: `Do not run ${command.id} until Community/Certified Operator evidence and release approvals are explicit.`,
      evidenceNeeded:
        "READY_FOR_REVIEW certification readiness, current-head release evidence bundle, security approval, runtime approval, registry approval, and product-owner approval.",
      nextCommand: command.command,
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true,
      blockedBy,
      rollbackPath:
        "Withdraw, supersede, or update the external submission through the approved Red Hat submission workflow if the wrong bundle, digest, or approval set was used."
    }))
  ];
}

function mapCertificationSubmissionActions(
  artifactActions:
    | CertificationReadinessEvidenceArtifact["firstSubmissionActions"]
    | undefined,
  toolingHandoff: OpsLensCertificationReadinessSummary["toolingHandoff"],
  missingEvidence: string[],
  gateCounts: OpsLensCertificationReadinessSummary["gateCounts"]
): OpsLensCertificationReadinessSummary["firstSubmissionActions"] {
  const actions =
    artifactActions && artifactActions.length > 0
      ? artifactActions
      : fallbackCertificationSubmissionActions(
          toolingHandoff,
          missingEvidence,
          gateCounts
        );

  return actions.map((action) => ({
    id: action.id ?? "unknown",
    owner: action.owner ?? "release-manager",
    phase: action.phase ?? "submission-preflight",
    status: action.status ?? "needs-evidence",
    request: action.request ?? "certification submission action",
    evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
    nextCommand: action.nextCommand ?? "npm run verify:certification",
    mutation: action.mutation === true,
    requiresExplicitApproval: action.requiresExplicitApproval === true,
    blockedBy: action.blockedBy ?? [],
    rollbackPath:
      action.rollbackPath ??
      "Regenerate certification readiness evidence before proceeding."
  }));
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
    firstSubmissionActions: [
      {
        id: "generate-certification-readiness",
        owner: "release-manager",
        phase: "submission-preflight",
        status: "needs-evidence",
        request:
          "Generate Community/Certified Operator submission readiness evidence before external submission review.",
        evidenceNeeded: reason,
        nextCommand: "npm run verify:certification",
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [reason],
        rollbackPath:
          "No rollback is required because no external submission command has run."
      }
    ],
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
      cli,
      artifact.ref?.headSha ?? "unknown"
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
    const missingEvidence = artifact.missingEvidence ?? [];
    const firstSubmissionActions = mapCertificationSubmissionActions(
      artifact.firstSubmissionActions,
      toolingHandoff,
      missingEvidence,
      gateCounts
    );

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
        firstSubmissionActions,
        documents,
        gateCounts,
        missingEvidence,
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
        `certification tooling satisfiedBy=${toolingHandoff.toolingSatisfiedBy} ciRunner=${toolingHandoff.runnerEvidence.status} sameHead=${String(toolingHandoff.runnerEvidence.sameHead)} mutation=${String(toolingHandoff.runnerEvidence.mutation)} path=${toolingHandoff.runnerEvidence.path}`,
        `certification CI runner draft ${toolingHandoff.runnerDraft.evidenceState} sameHead=${String(toolingHandoff.runnerDraft.sameHead)} missing=${toolingHandoff.runnerDraft.missingEvidence.length}`,
        toolingHandoff.executionLanes.length
          ? `certification tooling lanes=${toolingHandoff.executionLanes.map((lane) => `${lane.id}:${lane.status}`).join(", ")}`
          : "certification tooling execution lanes are not listed",
        `certification tooling freshness requiredHead=${toolingHandoff.freshnessPolicy.requiredHead} rerunAfter=${toolingHandoff.freshnessPolicy.rerunAfter.join(", ") || "none"}`,
        `certification first submission actions=${firstSubmissionActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        documentSummary
          ? `certification documents=${documentSummary}`
          : "certification documents are not listed",
        ...missingEvidence.slice(0, 3),
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
    registryBaseReadable: false,
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
        registryBaseReadable:
          artifact.registryAuth?.baseImageReadable === true,
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
        `registryAuthConfigured=${String(artifact.registryAuth?.configured ?? false)} registryBaseReadable=${String(artifact.registryAuth?.baseImageReadable ?? false)} readOnlyCommands=${readOnlyCommands.length} setupCommands=${setupCommands.length}`,
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
    runnerEvidence: {
      status: "missing",
      actionMode: "missing",
      evidenceWritten: false,
      fresh: false,
      executeDockerFallback: false,
      scannerDigestsPinned: false,
      missingTargets: [],
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    },
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
    firstSecurityReviewActions: [
      {
        id: "security-review-plan-missing",
        owner: "security-reviewer",
        phase: "security-review-preflight",
        status: "needs-evidence",
        request: "Generate the security scan plan before human security review.",
        evidenceNeeded: reason,
        nextCommand: "npm run verify:security-scan-plan",
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [reason],
        rollbackPath:
          "No rollback is required for read-only security review preflight."
      }
    ],
    securityReviewFinalHandoff: [],
    ticketPackets: [],
    missingEvidence: [reason],
    risk: [
      "Without security scan plan evidence, release review cannot distinguish missing scan/SBOM inputs from approved signing or registry actions."
    ],
    rollbackPath: [
      "Run npm run verify:security-scan-plan from a clean Git HEAD before release-manager review."
    ]
  };
}

function deriveFirstSecurityReviewActions(
  images: OpsLensSecurityScanPlanSummary["images"],
  approvalGatedCommands: OpsLensSecurityScanPlanSummary["approvalGatedCommands"]
): OpsLensSecurityScanPlanSummary["firstSecurityReviewActions"] {
  const requiredImages = images.filter((image) => image.required);
  const reviewActions = requiredImages
    .filter((image) => !image.reviewExists)
    .slice(0, 3)
    .map((image) => ({
      id: `security-review-${image.name}`,
      owner: "security-reviewer",
      phase: "security-review-draft",
      status: image.reviewDraft.readyForFinalReview
        ? "ready-for-final-review"
        : "needs-evidence",
      request: `Review ${image.name} scan/SBOM evidence and create an explicit security review draft before final release evidence.`,
      evidenceNeeded: `${image.name} same-head vulnerability scan, SBOM, reviewer, security ticket, and explicit decision.`,
      nextCommand: `npm run evidence:security-review:draft -- --name ${image.name} --reviewer <security-reviewer> --ticket <security-ticket> --decision approved --force`,
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy: [
        ...(!image.vulnerabilityReportExists
          ? [`${image.name} vulnerability scan evidence is missing`]
          : []),
        ...(!image.sbomExists ? [`${image.name} SBOM evidence is missing`] : []),
        ...image.reviewDraft.missingEvidence
      ].slice(0, 6),
      rollbackPath: `Delete or supersede ${image.name}-security-review.draft.json if it was created from the wrong image digest or Git head.`
    }));
  const firstMutatingCommand = approvalGatedCommands.find(
    (command) => command.mutation
  );
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "registry-admin",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until security and release approvals are explicit.`,
          evidenceNeeded:
            "All required vulnerability, SBOM, provenance, and security review evidence passes, and release-manager, registry-admin, security-reviewer, and product-owner approvals are recorded.",
          nextCommand: firstMutatingCommand.command,
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: requiredImages
            .filter((image) => !image.reviewExists)
            .map((image) => `${image.name}: approved security review evidence missing`),
          rollbackPath:
            "Do not attach signatures until approval; if a signature is attached from the wrong image digest, revoke or supersede it with corrected image and signature evidence."
        }
      ]
    : [];

  return [...reviewActions, ...gatedMutationAction];
}

function deriveSecurityReviewFinalHandoff(
  images: OpsLensSecurityScanPlanSummary["images"]
): OpsLensSecurityScanPlanSummary["securityReviewFinalHandoff"] {
  return images
    .filter((image) => image.required)
    .map((image) => {
      const status = image.reviewExists
        ? "reviewed-final-present"
        : image.reviewDraft.readyForFinalReview
          ? "ready-for-promotion-review"
          : "needs-reviewed-inputs";
      return {
        imageName: image.name,
        status,
        owner: "security-reviewer",
        draftPath: image.reviewDraft.draftPath,
        finalEvidenceFile: image.reviewDraft.finalEvidenceFile,
        finalEvidenceExists: image.reviewExists,
        reviewApproved: image.reviewExists,
        evidenceState: image.reviewDraft.evidenceState,
        draftStatus: image.reviewDraft.readyForFinalReview
          ? "ready-for-final-review"
          : image.reviewDraft.exists
            ? "draft-needs-evidence"
            : "missing",
        vulnerabilityReportExists: image.vulnerabilityReportExists,
        sbomExists: image.sbomExists,
        reviewerProvided: image.reviewDraft.reviewerProvided,
        ticketProvided: image.reviewDraft.ticketProvided,
        decision: image.reviewDraft.decision,
        explicitDecisionProvided: image.reviewDraft.explicitDecisionProvided,
        readyForFinalReview: image.reviewDraft.readyForFinalReview,
        missingEvidenceCount: image.reviewDraft.missingEvidence.length,
        evidenceChecklist: [
          `${image.name} vulnerability scan evidence is same-head and criticalFindings=0`,
          `${image.name} SBOM evidence is parseable and reviewed`,
          `${image.name} security review draft has non-placeholder reviewer and ticket`,
          `${image.name} security reviewer explicitly records decision=approved`
        ],
        promotionCommand: `npm run evidence:security-review:promote -- --name ${image.name} --promote-reviewed --reviewer <security-reviewer> --review-ticket <security-ticket> --force`,
        verificationCommand: "npm run verify:security-scan-plan",
        approvalRequired: status !== "reviewed-final-present",
        requiresExplicitApproval: true,
        mutationAllowed: false,
        writesLocalEvidence: true,
        blockedBy: image.reviewExists
          ? []
          : [
              `${image.name} final security review evidence is not approved`,
              ...image.reviewDraft.missingEvidence
            ].slice(0, 10),
        rollbackPath:
          `Delete or supersede ${image.name}-security-review.draft.json or ${image.name}-security-review.json if reviewer evidence is rejected; no cluster or registry rollback is required.`
      };
    });
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
        decision:
          image.securityEvidence?.reviewDraft?.decision ?? "missing",
        explicitDecisionProvided:
          image.securityEvidence?.reviewDraft?.explicitDecisionProvided === true,
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
    const runnerEvidence = {
      status: artifact.securityScanRunner?.status ?? "missing",
      actionMode: artifact.securityScanRunner?.actionMode ?? "missing",
      evidenceWritten: artifact.securityScanRunner?.evidenceWritten === true,
      fresh: artifact.securityScanRunner?.fresh === true,
      executeDockerFallback:
        artifact.securityScanRunner?.executeDockerFallback === true,
      scannerDigestsPinned:
        artifact.securityScanRunner?.scannerDigestsPinned === true,
      missingTargets: artifact.securityScanRunner?.missingTargets ?? [],
      registryMutationAttempted: false,
      clusterMutationAttempted: false,
      mutationAllowedByThisVerifier: false
    };
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
    const fallbackFirstSecurityReviewActions = deriveFirstSecurityReviewActions(
      images,
      approvalGatedCommands
    );
    const firstSecurityReviewActions = (
      artifact.firstSecurityReviewActions?.length
        ? artifact.firstSecurityReviewActions
        : fallbackFirstSecurityReviewActions
    ).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? "security-reviewer",
      phase: action.phase ?? "security-review-draft",
      status: action.status ?? "needs-evidence",
      request: action.request ?? "security review action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand:
        action.nextCommand ?? "npm run evidence:security-review:draft -- --all --force",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath:
        action.rollbackPath ??
        "Regenerate security scan evidence before proceeding."
    }));
    const securityReviewFinalHandoff = (
      artifact.securityReviewFinalHandoff?.length
        ? artifact.securityReviewFinalHandoff
        : deriveSecurityReviewFinalHandoff(images)
    ).map((handoff) => ({
      imageName: handoff.imageName ?? "unknown",
      status: handoff.status ?? "needs-reviewed-inputs",
      owner: handoff.owner ?? "security-reviewer",
      draftPath:
        handoff.draftPath ??
        `docs/release/evidence/security/${handoff.imageName ?? "unknown"}-security-review.draft.json`,
      finalEvidenceFile:
        handoff.finalEvidenceFile ??
        `docs/release/evidence/security/${handoff.imageName ?? "unknown"}-security-review.json`,
      finalEvidenceExists: handoff.finalEvidenceExists === true,
      reviewApproved: handoff.reviewApproved === true,
      evidenceState: handoff.evidenceState ?? "missing",
      draftStatus: handoff.draftStatus ?? "missing",
      vulnerabilityReportExists: handoff.vulnerabilityReportExists === true,
      sbomExists: handoff.sbomExists === true,
      reviewerProvided: handoff.reviewerProvided === true,
      ticketProvided: handoff.ticketProvided === true,
      decision: handoff.decision ?? "missing",
      explicitDecisionProvided: handoff.explicitDecisionProvided === true,
      readyForFinalReview: handoff.readyForFinalReview === true,
      missingEvidenceCount: Number.isFinite(Number(handoff.missingEvidenceCount))
        ? Number(handoff.missingEvidenceCount)
        : 0,
      evidenceChecklist: handoff.evidenceChecklist ?? [],
      promotionCommand:
        handoff.promotionCommand ??
        `npm run evidence:security-review:promote -- --name ${handoff.imageName ?? "<name>"} --promote-reviewed --reviewer <security-reviewer> --review-ticket <security-ticket> --force`,
      verificationCommand:
        handoff.verificationCommand ?? "npm run verify:security-scan-plan",
      approvalRequired: handoff.approvalRequired !== false,
      requiresExplicitApproval: handoff.requiresExplicitApproval !== false,
      mutationAllowed: handoff.mutationAllowed === true,
      writesLocalEvidence: handoff.writesLocalEvidence !== false,
      blockedBy: handoff.blockedBy ?? [],
      rollbackPath:
        handoff.rollbackPath ??
        "Delete or supersede unapproved security review evidence if reviewer evidence is rejected."
    }));
    const ticketPackets = artifact.ticketPackets ?? [];
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
        runnerEvidence,
        readOnlyCommands,
        setupCommands,
        approvalGatedCommands,
        firstSecurityReviewActions,
        securityReviewFinalHandoff,
        ticketPackets,
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `Security scan plan ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `security scan plan generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `scanReadOnlyCommands=${readOnlyCommands.length} setupCommands=${setupCommands.length} approvalGatedCommands=${approvalGatedCommands.length}`,
        `security scan runner status=${runnerEvidence.status} actionMode=${runnerEvidence.actionMode} evidenceWritten=${String(runnerEvidence.evidenceWritten)} fresh=${String(runnerEvidence.fresh)} dockerFallback=${String(runnerEvidence.executeDockerFallback)} digestPinned=${String(runnerEvidence.scannerDigestsPinned)} missingTargets=${runnerEvidence.missingTargets.join(",") || "none"}`,
        `securityFirstReviewActions=${firstSecurityReviewActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        `securityReviewFinalHandoff=${securityReviewFinalHandoff.map((handoff) => `${handoff.imageName}:${handoff.status}:promotion=${handoff.promotionCommand}:mutationAllowed=${String(handoff.mutationAllowed)}`).join(", ") || "missing"}`,
        `securityReviewTicketPackets=${ticketPackets.map((ticket) => `${ticket.id}:${ticket.imageName}:${ticket.firstReadOnlyAction.id}:approval=${ticket.approvalGatedAction.id}`).join(", ") || "missing"}`,
        missingTools ? `missing local scan/sign CLIs=${missingTools}` : "all reported scan/sign CLIs are available",
        `required images missing scan/SBOM/review evidence=${requiredMissingEvidence}`,
        `security review drafts=${images.map((image) => `${image.name}:${image.reviewDraft.evidenceState}:sameHead=${String(image.reviewDraft.sameHead)}:decision=${image.reviewDraft.decision}:explicit=${String(image.reviewDraft.explicitDecisionProvided)}:ready=${String(image.reviewDraft.readyForFinalReview)}`).join(", ")}`,
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
      criticalPathCount: 0,
      criticalPathReady: false,
      missingOwnerPackets: [reason],
      missingCriticalPathDiagnostics: [reason],
      missingCriticalPathTickets: [reason],
      unsafeCriticalPathTickets: [reason],
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
      criticalPathCount: artifact.actionQueue?.criticalPathCount ?? 0,
      criticalPathReady: artifact.actionQueue?.criticalPathReady === true,
      missingOwnerPackets: artifact.actionQueue?.missingOwnerPackets ?? [],
      missingCriticalPathDiagnostics:
        artifact.actionQueue?.missingCriticalPathDiagnostics ?? [],
      missingCriticalPathTickets:
        artifact.actionQueue?.missingCriticalPathTickets ?? [],
      unsafeCriticalPathTickets:
        artifact.actionQueue?.unsafeCriticalPathTickets ?? [],
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
        firstActionId: packet.firstActionId ?? "none",
        firstActionPriority: packet.firstActionPriority ?? "normal",
        firstNextCommand: packet.firstNextCommand ?? "none",
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
        `release refresh action queue critical path ready=${String(actionQueue.criticalPathReady)} count=${actionQueue.criticalPathCount}`,
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
    actionQueueSafety: {
      status: "missing",
      fresh: false,
      ready: false,
      ownerPacketCount: 0,
      criticalPathCount: 0,
      missingDiagnostics: [reason],
      missingTickets: [reason],
      unsafeTickets: [reason]
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
    const actionQueueSafety = {
      status: artifact.actionQueueSafety?.status ?? "missing",
      fresh: artifact.actionQueueSafety?.fresh === true,
      ready: artifact.actionQueueSafety?.ready === true,
      ownerPacketCount: artifact.actionQueueSafety?.ownerPacketCount ?? 0,
      criticalPathCount: artifact.actionQueueSafety?.criticalPathCount ?? 0,
      missingDiagnostics:
        artifact.actionQueueSafety?.missingDiagnostics ?? [],
      missingTickets: artifact.actionQueueSafety?.missingTickets ?? [],
      unsafeTickets: artifact.actionQueueSafety?.unsafeTickets ?? []
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
        actionQueueSafety,
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
        `bundle action queue ready=${String(actionQueueSafety.ready)} criticalPath=${actionQueueSafety.criticalPathCount} unsafeTickets=${actionQueueSafety.unsafeTickets.length}`,
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

function missingRoadmapCompletionSummary(
  reason: string,
  status: OpsLensRoadmapCompletionSummary["status"] = "needs-evidence"
): OpsLensRoadmapCompletionSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "roadmapEvidenceOnly",
    headSha: "missing",
    worktreeDirty: false,
    totalRequirements: 0,
    passedRequirements: 0,
    remainingRequirements: 0,
    percentComplete: 0,
    remaining: [],
    criticalPathBlockerCount: 0,
    criticalPathBlockers: [],
    remainingHandoffs: [],
    mutationBoundaryPassed: false,
    missingEvidence: [reason],
    risk: [
      "Without roadmap completion evidence, the dashboard cannot prove what remains before a 100 percent MVP claim."
    ],
    rollbackPath: [
      "Run npm run verify:roadmap-plan after refreshing release evidence."
    ],
    evidence: [
      reason,
      "roadmap completion is evidence-only and does not approve install, patch, push, mirror, sign, apply, delete, or scale actions"
    ]
  };
}

function getRoadmapCompletionSummary(
  actionQueue?: OpsLensReleaseActionQueueSummary
): OpsLensRoadmapCompletionSummary {
  const evidencePath = roadmapPlanAlignmentPath();

  if (!existsSync(evidencePath)) {
    return missingRoadmapCompletionSummary(
      `roadmap plan alignment evidence is missing at ${evidencePath}`
    );
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as RoadmapPlanAlignmentArtifact;
    const requirements = (artifact.stages ?? []).flatMap((stage) =>
      (stage.requirements ?? []).map((requirement) => ({
        stage: stage.id ?? "unknown",
        id: requirement.id ?? "unknown",
        status: requirement.status ?? "missing"
      }))
    );
    const passedRequirements = requirements.filter(
      (requirement) => requirement.status === "pass"
    ).length;
    const remaining = requirements.filter(
      (requirement) => requirement.status !== "pass"
    );
    const totalRequirements = requirements.length;
    const percentComplete =
      totalRequirements > 0
        ? Math.round((passedRequirements / totalRequirements) * 1000) / 10
        : 0;
    const blocked =
      artifact.status === "BLOCKED" || (artifact.blockers ?? []).length > 0;
    const status: OpsLensRoadmapCompletionSummary["status"] = blocked
      ? "blocked"
      : remaining.length === 0 && artifact.status === "PASS"
        ? "ready"
        : "needs-evidence";
    const mutationBoundaryPassed = true;
    const criticalPathEntries = actionQueue?.criticalPath ?? [];
    const criticalPathBlockers = criticalPathEntries.map(
      (entry) => ({
        lane: entry.lane,
        label: entry.label,
        owner: entry.owner,
        priority: entry.priority,
        actionId: entry.actionId,
        nextCommand: entry.nextCommand,
        evidenceNeeded: entry.evidenceNeeded,
        acceptance: entry.acceptance,
        blockedBy: entry.blockedBy
      })
    );
    const gateToCriticalPath = new Map([
      ["ocpConnectivity", ["live-ocp-lightspeed", "ocp-live-reader-rbac"]],
      ["lightspeedReadiness", ["lightspeed-auth-rbac", "live-ocp-lightspeed"]],
      ["installPlan", ["install-approval"]],
      ["certificationReadiness", ["certification-toolchain"]],
      [
        "externalRuntime",
        ["external-runtime-review", "external-runtime-final-evidence"]
      ],
      ["releasePublish", ["release-publish"]]
    ]);
    const fallbackBlocker =
      criticalPathEntries.find((entry) => entry.priority === "blocker") ??
      criticalPathEntries[0];
    const remainingHandoffs = remaining.map((gate) => {
      const preferredLanes = gateToCriticalPath.get(gate.id) ?? [];
      const blocker =
        criticalPathEntries.find((entry) =>
          preferredLanes.includes(entry.lane)
        ) ?? fallbackBlocker;
      return {
        stage: gate.stage,
        gateId: gate.id,
        status: gate.status,
        owner: blocker?.owner ?? "release-manager",
        priority: blocker?.priority ?? "high",
        actionId: blocker?.actionId ?? "refresh-roadmap-evidence",
        nextCommand: blocker?.nextCommand ?? "npm run verify:roadmap-plan",
        evidenceNeeded:
          blocker?.evidenceNeeded ??
          `Refresh evidence for roadmap gate ${gate.stage}/${gate.id}.`,
        externalStateRequired:
          blocker
            ? blocker.approvalGatedCommandIds.length > 0 ||
              blocker.setupCommandIds.length > 0 ||
              /<[^>]+>|approval|approved|install|submit|push|mirror|sign|apply|login/i.test(
                `${blocker.nextCommand} ${blocker.evidenceNeeded} ${blocker.blockedBy.join(" ")}`
              )
            : true,
        blockedBy: blocker?.blockedBy ?? []
      };
    });

    return {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "roadmapEvidenceOnly",
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      totalRequirements,
      passedRequirements,
      remainingRequirements: remaining.length,
      percentComplete,
      remaining,
      criticalPathBlockerCount: criticalPathBlockers.length,
      criticalPathBlockers,
      remainingHandoffs,
      mutationBoundaryPassed,
      missingEvidence: artifact.missingEvidence ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? [],
      evidence: [
        `Roadmap completion ${passedRequirements}/${totalRequirements} requirements pass (${percentComplete}%)`,
        `roadmap artifact ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"} head=${artifact.ref?.headSha ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        remaining.length
          ? `remaining roadmap gates=${remaining
              .slice(0, 8)
              .map((item) => `${item.stage}/${item.id}:${item.status}`)
              .join(", ")}`
          : "remaining roadmap gates=none",
        criticalPathBlockers.length
          ? `critical path blockers=${criticalPathBlockers
              .slice(0, 8)
              .map((item) => `${item.owner}/${item.actionId}`)
              .join(", ")}`
          : "critical path blockers=none",
        remainingHandoffs.length
          ? `remaining handoffs=${remainingHandoffs
              .slice(0, 8)
              .map((item) => `${item.gateId}->${item.owner}/${item.actionId}`)
              .join(", ")}`
          : "remaining handoffs=none",
        "roadmap completion reads local evidence only; it does not approve install, patch, push, mirror, sign, apply, delete, or scale actions"
      ]
    };
  } catch (error) {
    return missingRoadmapCompletionSummary(
      error instanceof Error ? error.message : "unknown evidence parse error",
      "blocked"
    );
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
    criticalPath: [],
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
      firstActionId: packet.firstActionId ?? "none",
      firstActionPriority: packet.firstActionPriority ?? "normal",
      firstActionSource: packet.firstActionSource ?? "none",
      firstActionRequest: packet.firstActionRequest ?? "none",
      firstNextCommand: packet.firstNextCommand ?? "none",
      firstEvidenceNeeded: packet.firstEvidenceNeeded ?? "none",
      firstBlockedBy: packet.firstBlockedBy ?? [],
      firstTicketPacket: packet.firstTicketPacket,
      firstExternalRuntimeTicketPacket: packet.firstExternalRuntimeTicketPacket,
      firstExternalRuntimeFinalEvidenceTicketPacket:
        packet.firstExternalRuntimeFinalEvidenceTicketPacket,
      firstExternalRuntimeProductTicketPacket:
        packet.firstExternalRuntimeProductTicketPacket,
      firstSecurityReviewTicketPacket:
        packet.firstSecurityReviewTicketPacket,
      firstReleasePublishTicketPacket:
        packet.firstReleasePublishTicketPacket,
      firstInstallApprovalTicketPacket:
        packet.firstInstallApprovalTicketPacket,
      firstCatalogToolchainTicketPacket:
        packet.firstCatalogToolchainTicketPacket,
      firstCertificationToolingTicketPacket:
        packet.firstCertificationToolingTicketPacket,
      firstRagProductionTicketPacket: packet.firstRagProductionTicketPacket,
      firstAiopsMonitoringTicketPacket:
        packet.firstAiopsMonitoringTicketPacket,
      firstRuntimeEvidenceTicketPacket:
        packet.firstRuntimeEvidenceTicketPacket,
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
    const criticalPath = (artifact.criticalPath ?? []).map((entry) => ({
      lane: entry.lane ?? "unknown",
      label: entry.label ?? "Critical path",
      owner: entry.owner ?? "unknown",
      priority: normalizeActionQueuePriority(entry.priority),
      actionId: entry.actionId ?? "unknown",
      source: entry.source ?? "unknown",
      request: entry.request ?? "missing request",
      evidenceNeeded: entry.evidenceNeeded ?? "missing evidence",
      nextCommand: entry.nextCommand ?? "not listed",
      blockedBy: entry.blockedBy ?? [],
      diagnostics: entry.diagnostics ?? [],
      missingRequiredTools: entry.missingRequiredTools ?? [],
      setupCommandIds: entry.setupCommandIds ?? [],
      readOnlyCommandIds: entry.readOnlyCommandIds ?? [],
      approvalGatedCommandIds: entry.approvalGatedCommandIds ?? [],
      acceptance: entry.acceptance ?? [],
      ticketPacket: entry.ticketPacket,
      externalRuntimeTicketPacket: entry.externalRuntimeTicketPacket,
      externalRuntimeFinalEvidenceTicketPacket:
        entry.externalRuntimeFinalEvidenceTicketPacket,
      externalRuntimeProductTicketPacket:
        entry.externalRuntimeProductTicketPacket,
      securityReviewTicketPacket: entry.securityReviewTicketPacket,
      releasePublishTicketPacket: entry.releasePublishTicketPacket,
      installApprovalTicketPacket: entry.installApprovalTicketPacket,
      catalogToolchainTicketPacket: entry.catalogToolchainTicketPacket,
      certificationToolingTicketPacket: entry.certificationToolingTicketPacket,
      ragProductionTicketPacket: entry.ragProductionTicketPacket,
      aiopsMonitoringTicketPacket: entry.aiopsMonitoringTicketPacket,
      runtimeEvidenceTicketPacket: entry.runtimeEvidenceTicketPacket
    }));
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
        requiresExplicitApproval: command.requiresExplicitApproval === true,
        requiresHumanApproval: command.requiresHumanApproval === true,
        requiresHumanSecretInput: command.requiresHumanSecretInput === true,
        credentialSetup: command.credentialSetup === true,
        credentialStoredByVerifier: command.credentialStoredByVerifier === true,
        registryLoginExecutedByVerifier:
          command.registryLoginExecutedByVerifier === true
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
      missingRequiredTools: entry.missingRequiredTools ?? [],
      blockedBy: entry.blockedBy ?? [],
      diagnostics: (entry.diagnostics ?? []).map((diagnostic) => ({
        id: diagnostic.id ?? "unknown",
        label: diagnostic.label ?? "Diagnostic",
        value: diagnostic.value ?? "unknown"
      })),
      ticketPacket: entry.ticketPacket,
      externalRuntimeTicketPacket: entry.externalRuntimeTicketPacket,
      externalRuntimeFinalEvidenceTicketPacket:
        entry.externalRuntimeFinalEvidenceTicketPacket,
      externalRuntimeProductTicketPacket:
        entry.externalRuntimeProductTicketPacket,
      securityReviewTicketPacket: entry.securityReviewTicketPacket,
      releasePublishTicketPacket: entry.releasePublishTicketPacket,
      installApprovalTicketPacket: entry.installApprovalTicketPacket,
      catalogToolchainTicketPacket: entry.catalogToolchainTicketPacket,
      certificationToolingTicketPacket: entry.certificationToolingTicketPacket,
      ragProductionTicketPacket: entry.ragProductionTicketPacket,
      aiopsMonitoringTicketPacket: entry.aiopsMonitoringTicketPacket,
      runtimeEvidenceTicketPacket: entry.runtimeEvidenceTicketPacket
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
        criticalPath,
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
        `release action queue critical path=${criticalPath.map((entry) => `${entry.lane}:${entry.owner}:${entry.actionId}`).join(", ") || "missing"}`,
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

type ReleaseActionQueueItem = OpsLensReleaseActionQueueSummary["items"][number];

function summarizeRuntimeLiveAction(
  action?: ReleaseActionQueueItem
): OpsLensRuntimeLiveHandoffAction | undefined {
  if (!action) {
    return undefined;
  }

  return {
    id: action.id,
    owner: action.owner,
    priority: action.priority,
    nextCommand: action.nextCommand,
    evidenceNeeded: action.evidenceNeeded,
    readOnlyCommandIds: action.readOnlyCommands.map((command) => command.id),
    blockedBy: action.blockedBy,
    diagnostics: action.diagnostics
  };
}

function buildRuntimeLiveHandoffSummary(
  runtimeReadiness: OpsLensRuntimeReadiness,
  actionQueue: OpsLensReleaseActionQueueSummary
): OpsLensRuntimeLiveHandoffSummary {
  const runtimeReadinessAction = summarizeRuntimeLiveAction(
    actionQueue.items.find(
      (item) => item.id === "runtime-platform-run-live-vllm-qdrant-probes"
    )
  );
  const runtimeRagAction = summarizeRuntimeLiveAction(
    actionQueue.items.find(
      (item) => item.id === "data-ml-engineer-prove-runtime-rag-live-quality"
    )
  );
  const hasBothLiveProbes =
    runtimeReadiness.vectorStore.liveProbeEnabled &&
    runtimeReadiness.modelRuntime.liveProbeEnabled;
  const bothRuntimeDependenciesReady =
    runtimeReadiness.vectorStore.status === "ready" &&
    runtimeReadiness.modelRuntime.status === "ready";
  const status =
    runtimeReadiness.status === "ready" &&
    hasBothLiveProbes &&
    bothRuntimeDependenciesReady
      ? "ready"
      : actionQueue.status === "blocked"
        ? "blocked"
        : "needs-live-evidence";
  const requiredReadOnlyCommands = Array.from(
    new Set([
      ...(runtimeReadinessAction?.readOnlyCommandIds ?? []),
      ...(runtimeRagAction?.readOnlyCommandIds ?? [])
    ])
  );
  const missingEvidence = [
    ...runtimeReadiness.missingEvidence,
    ...(runtimeReadinessAction ? [] : ["runtime live readiness owner action is missing"]),
    ...(runtimeRagAction ? [] : ["runtime RAG live quality owner action is missing"]),
    ...(runtimeReadinessAction?.blockedBy ?? []),
    ...(runtimeRagAction?.blockedBy ?? [])
  ];

  return {
    status,
    actionMode: "handoffOnly",
    runtimePlatformOwner: runtimeReadinessAction?.owner ?? "runtime-platform",
    dataMlOwner: runtimeRagAction?.owner ?? "data-ml-engineer",
    liveProbeEnabled:
      runtimeReadiness.vectorStore.liveProbeEnabled ||
      runtimeReadiness.modelRuntime.liveProbeEnabled,
    qdrantStatus: runtimeReadiness.vectorStore.status,
    vllmStatus: runtimeReadiness.modelRuntime.status,
    runtimeReadinessAction,
    runtimeRagAction,
    requiredReadOnlyCommands,
    approvalGatedCommandCount:
      (actionQueue.items.find(
        (item) => item.id === "runtime-platform-run-live-vllm-qdrant-probes"
      )?.approvalGatedCommands.length ?? 0) +
      (actionQueue.items.find(
        (item) => item.id === "data-ml-engineer-prove-runtime-rag-live-quality"
      )?.approvalGatedCommands.length ?? 0),
    mutationAllowedByThisVerifier: false,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    evidence: [
      "Runtime live handoff is derived from release action queue owner packets.",
      "runtime-platform owns live vLLM/Qdrant probe evidence.",
      "data-ml-engineer owns runtime RAG live quality evidence.",
      "No cluster, registry, or vector mutation is attempted by this handoff summary."
    ],
    missingEvidence,
    risk: [
      "Without live vLLM/Qdrant probes, runtime readiness remains evidence-limited.",
      "Without runtime RAG live quality evidence, dashboard answers cannot claim external model/vector path readiness."
    ],
    rollbackPath: [
      "Keep runtime answers on local fixture/mock evidence until runtime live probes pass.",
      "Re-run npm run verify:runtime and npm run verify:runtime-rag after network/runtime access is restored."
    ]
  };
}

function missingRagProductionReadinessSummary(
  reason: string,
  status: OpsLensRagProductionReadiness = "needs-evidence"
): OpsLensRagProductionReadinessSummary {
  const ticketPacket: OpsLensRagProductionTicketPacket = {
    id: "rag-owner-production-ingestion-ticket",
    owner: "rag-owner",
    title: "RAG production ingestion approval handoff",
    severity: "high",
    classification: "rag-production-readiness-missing",
    readinessStatus: status === "blocked" ? "BLOCKED" : "MISSING",
    requiredApprovals: ["rag-owner", "cluster-sre", "security-reviewer"],
    queueLive: false,
    ingestionWorkerLive: false,
    vectorWriteAuditSinkLive: false,
    evidenceChecklist: [reason],
    firstReadOnlyAction: {
      id: "verify-rag-production-readiness",
      status: "needs-evidence",
      nextCommand: "npm run verify:rag:production-readiness",
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: "approval-gated-apply-approved-rag-production-stack",
      status: "approval-gated",
      nextCommand: "oc apply -f deploy/rag-production/approved-rag-ingestion-stack.yaml",
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: [
      "npm run verify:rag:production-readiness",
      "npm run verify:install-plan"
    ],
    blockedBy: [reason],
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      ingestionJobCreated: false,
      mutationAllowedByThisVerifier: false,
      ingestionRequiresExplicitApproval: true
    },
    risk:
      "Production RAG ingestion must remain blocked until queue, worker, audit sink, source-ref, and rollback evidence are present.",
    rollbackPath:
      "Run npm run verify:rag:production-readiness after refreshing RAG approval queue evidence."
  };
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "productionReadinessOnly",
    contractReady: false,
    approvalRequired: true,
    productionQueueLive: false,
    ingestionWorkerLive: false,
    vectorWriteAuditSinkLive: false,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    headSha: "missing",
    worktreeDirty: false,
    requiredApprovals: ["rag-owner", "cluster-sre", "security-reviewer"],
    components: {
      queue: {
        backendClass: "missing",
        contractReady: false,
        liveReady: false,
        storesRawMarkdown: false
      },
      ingestionWorker: {
        mode: "missing",
        contractReady: false,
        liveReady: false,
        createsKubernetesJobByThisVerifier: false
      },
      vectorWriteAuditSink: {
        contractReady: false,
        liveReady: false,
        appendOnly: false,
        recordsRollbackChunkIds: false
      }
    },
    readOnlyCommands: [
      {
        id: "verify-rag-production-readiness",
        phase: "rag-production-readiness",
        mutation: false,
        writesLocalEvidence: true
      }
    ],
    approvalGatedCommands: [],
    firstProductionActions: [
      {
        id: "rag-production-readiness-missing",
        owner: "rag-owner",
        phase: "production-readiness-preflight",
        status: "needs-evidence",
        request: "Generate the RAG production readiness handoff before enabling production ingestion.",
        evidenceNeeded: reason,
        nextCommand: "npm run verify:rag:production-readiness",
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [reason],
        rollbackPath:
          "No rollback is required for read-only RAG production readiness preflight."
      }
    ],
    ticketPacket,
    missingEvidence: [reason],
    risk: [
      "Production RAG ingestion must remain blocked until queue, worker, audit sink, source-ref, and rollback evidence are present."
    ],
    rollbackPath: [
      "Run npm run verify:rag:production-readiness after refreshing RAG approval queue evidence."
    ],
    evidence: [
      "RAG production readiness evidence is missing; dashboard must not claim live ingestion readiness"
    ]
  };
}

function ragProductionGapOwner(gap: string) {
  if (/worker|job|apply|deployment|schedule/i.test(gap)) return "cluster-sre";
  if (/audit|rollback|vector/i.test(gap)) return "security-reviewer";
  return "rag-owner";
}

function ragProductionGapNextCommand(gap: string) {
  if (/approval queue|source-ref/i.test(gap)) {
    return "npm run verify:rag:approval-queue";
  }
  if (/worker|job|apply|deployment/i.test(gap)) {
    return "npm run verify:install-plan";
  }
  return "npm run verify:rag:production-readiness";
}

function deriveFirstRagProductionActions(
  missingEvidence: string[],
  readOnlyCommands: OpsLensRagProductionReadinessSummary["readOnlyCommands"],
  approvalGatedCommands: OpsLensRagProductionReadinessSummary["approvalGatedCommands"]
): OpsLensRagProductionReadinessSummary["firstProductionActions"] {
  const gapActions = missingEvidence.slice(0, 3).map((gap, index) => ({
    id: `rag-production-gap-${index + 1}`,
    owner: ragProductionGapOwner(gap),
    phase: "production-readiness-preflight",
    status: "needs-evidence",
    request:
      "Resolve production RAG ingestion readiness evidence before enabling queue, worker, vector writes, or ingestion jobs.",
    evidenceNeeded: gap,
    nextCommand: ragProductionGapNextCommand(gap),
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy: [gap],
    rollbackPath:
      "No rollback is required for read-only RAG production readiness preflight."
  }));
  const preflight =
    readOnlyCommands.find((command) => command.id === "verify-rag-production-readiness") ??
    readOnlyCommands[0];
  const preflightAction = preflight
    ? [
        {
          id: preflight.id,
          owner: "rag-owner",
          phase: preflight.phase,
          status: missingEvidence.length > 0 ? "needs-evidence" : "ready",
          request:
            "Refresh the non-mutating RAG production readiness handoff from current approval queue and contract evidence.",
          evidenceNeeded:
            missingEvidence.length > 0
              ? "RAG production readiness gaps remain before approval."
              : "Current-head RAG production readiness evidence is ready for approval review.",
          nextCommand: "npm run verify:rag:production-readiness",
          mutation: false,
          requiresExplicitApproval: false,
          blockedBy: missingEvidence,
          rollbackPath:
            "No rollback is required for read-only RAG production readiness refresh."
        }
      ]
    : [];
  const firstMutatingCommand = approvalGatedCommands.find(
    (command) => command.mutation
  );
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "cluster-sre",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until RAG production approvals are explicit.`,
          evidenceNeeded:
            "All RAG production readiness gaps are resolved and rag-owner, cluster-sre, and security-reviewer approvals are recorded.",
          nextCommand: "oc apply -f deploy/rag-production/approved-rag-ingestion-stack.yaml",
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: missingEvidence,
          rollbackPath:
            "Disable the ingestion worker schedule and revert approved source refs before retrying."
        }
      ]
    : [];

  return [...gapActions, ...preflightAction, ...gatedMutationAction];
}

function getRagProductionReadiness(): {
  status: OpsLensRagProductionReadiness;
  evidence: string[];
  productionReadiness: OpsLensRagProductionReadinessSummary;
} {
  const evidencePath = ragProductionReadinessPath();

  if (!existsSync(evidencePath)) {
    return {
      status: "needs-evidence",
      productionReadiness: missingRagProductionReadinessSummary(
        `RAG production readiness evidence is missing at ${evidencePath}`
      ),
      evidence: [
        "run npm run verify:rag:production-readiness to create the RAG production handoff artifact",
        "dashboard keeps production RAG ingestion as approval-required or needs-evidence until queue, worker, and audit sink evidence exist",
        "RAG production readiness must keep clusterMutationAttempted=false, vectorWriteAttempted=false, and ingestionJobCreated=false"
      ]
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as RagProductionReadinessArtifact;
    const status = mapRagProductionReadinessStatus(artifact);
    const readiness = artifact.readiness ?? {};
    const components = artifact.components ?? {};
    const readOnlyCommands = (artifact.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "rag-production-readiness",
      mutation: command.mutation === true,
      writesLocalEvidence: command.writesLocalEvidence === true
    }));
    const approvalGatedCommands = (artifact.approvalGatedCommands ?? []).map(
      (command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "approval-gated",
        mutation: command.mutation === true,
        requiresExplicitApproval: command.requiresExplicitApproval === true
      })
    );
    const fallbackFirstProductionActions = deriveFirstRagProductionActions(
      artifact.missingEvidence ?? [],
      readOnlyCommands,
      approvalGatedCommands
    );
    const firstProductionActions = (
      artifact.firstProductionActions?.length
        ? artifact.firstProductionActions
        : fallbackFirstProductionActions
    ).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? "rag-owner",
      phase: action.phase ?? "production-readiness-preflight",
      status: action.status ?? "needs-evidence",
      request: action.request ?? "RAG production readiness action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand:
        action.nextCommand ?? "npm run verify:rag:production-readiness",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath:
        action.rollbackPath ??
        "Regenerate RAG production readiness evidence before proceeding."
    }));
    const fallbackReadOnlyAction =
      firstProductionActions.find((action) => action.mutation === false) ??
      firstProductionActions[0];
    const fallbackApprovalAction =
      firstProductionActions.find((action) => action.mutation === true);
    const ticketPacket: OpsLensRagProductionTicketPacket = {
      id: artifact.ticketPacket?.id ?? "rag-owner-production-ingestion-ticket",
      owner: "rag-owner",
      title:
        artifact.ticketPacket?.title ??
        "RAG production ingestion approval handoff",
      severity: "high",
      classification:
        artifact.ticketPacket?.classification ??
        "production-ingestion-evidence-required",
      readinessStatus: artifact.ticketPacket?.readinessStatus ?? artifact.status ?? "unknown",
      requiredApprovals:
        artifact.ticketPacket?.requiredApprovals ??
        artifact.requiredApprovals ??
        ["rag-owner", "cluster-sre", "security-reviewer"],
      queueLive:
        artifact.ticketPacket?.queueLive ??
        (readiness.productionQueueLive === true),
      ingestionWorkerLive:
        artifact.ticketPacket?.ingestionWorkerLive ??
        (readiness.ingestionWorkerLive === true),
      vectorWriteAuditSinkLive:
        artifact.ticketPacket?.vectorWriteAuditSinkLive ??
        (readiness.vectorWriteAuditSinkLive === true),
      evidenceChecklist:
        artifact.ticketPacket?.evidenceChecklist ??
        (artifact.missingEvidence ?? []).slice(0, 6),
      firstReadOnlyAction: {
        id:
          artifact.ticketPacket?.firstReadOnlyAction?.id ??
          fallbackReadOnlyAction?.id ??
          "verify-rag-production-readiness",
        status:
          artifact.ticketPacket?.firstReadOnlyAction?.status ??
          fallbackReadOnlyAction?.status ??
          "needs-evidence",
        nextCommand:
          artifact.ticketPacket?.firstReadOnlyAction?.nextCommand ??
          fallbackReadOnlyAction?.nextCommand ??
          "npm run verify:rag:production-readiness",
        mutation: false,
        requiresExplicitApproval: false
      },
      approvalGatedAction: {
        id:
          artifact.ticketPacket?.approvalGatedAction?.id ??
          fallbackApprovalAction?.id ??
          "approval-gated-apply-approved-rag-production-stack",
        status:
          artifact.ticketPacket?.approvalGatedAction?.status ??
          fallbackApprovalAction?.status ??
          "approval-gated",
        nextCommand:
          artifact.ticketPacket?.approvalGatedAction?.nextCommand ??
          fallbackApprovalAction?.nextCommand ??
          "oc apply -f deploy/rag-production/approved-rag-ingestion-stack.yaml",
        mutation: true,
        requiresExplicitApproval: true
      },
      nextCommands:
        artifact.ticketPacket?.nextCommands ??
        [
          "npm run verify:rag:production-readiness",
          "npm run verify:install-plan"
        ],
      blockedBy: artifact.ticketPacket?.blockedBy ?? artifact.missingEvidence ?? [],
      mutationBoundary: {
        clusterMutationAttempted:
          artifact.ticketPacket?.mutationBoundary?.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifact.ticketPacket?.mutationBoundary?.registryMutationAttempted === true,
        vectorWriteAttempted:
          artifact.ticketPacket?.mutationBoundary?.vectorWriteAttempted === true,
        ingestionJobCreated:
          artifact.ticketPacket?.mutationBoundary?.ingestionJobCreated === true,
        mutationAllowedByThisVerifier:
          artifact.ticketPacket?.mutationBoundary?.mutationAllowedByThisVerifier === true,
        ingestionRequiresExplicitApproval:
          artifact.ticketPacket?.mutationBoundary?.ingestionRequiresExplicitApproval !== false
      },
      risk:
        artifact.ticketPacket?.risk ??
        artifact.risk?.[0] ??
        "Production RAG ingestion remains blocked until approval evidence is explicit.",
      rollbackPath:
        artifact.ticketPacket?.rollbackPath ??
        artifact.rollbackPath?.[0] ??
        "Disable the ingestion worker schedule and stop manual job creation."
    };
    const productionReadiness: OpsLensRagProductionReadinessSummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "productionReadinessOnly",
      contractReady: readiness.contractReady === true,
      approvalRequired: readiness.approvalRequired !== false,
      productionQueueLive: readiness.productionQueueLive === true,
      ingestionWorkerLive: readiness.ingestionWorkerLive === true,
      vectorWriteAuditSinkLive: readiness.vectorWriteAuditSinkLive === true,
      clusterMutationAttempted: artifact.clusterMutationAttempted === true,
      registryMutationAttempted: artifact.registryMutationAttempted === true,
      vectorWriteAttempted: artifact.vectorWriteAttempted === true,
      ingestionJobCreated: artifact.ingestionJobCreated === true,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier === true,
      headSha: artifact.ref?.headSha ?? "unknown",
      worktreeDirty: artifact.ref?.worktreeDirty === true,
      requiredApprovals: artifact.requiredApprovals ?? [],
      components: {
        queue: {
          backendClass: components.queue?.backendClass ?? "missing",
          contractReady: components.queue?.contractReady === true,
          liveReady: components.queue?.liveReady === true,
          storesRawMarkdown: components.queue?.storesRawMarkdown === true
        },
        ingestionWorker: {
          mode: components.ingestionWorker?.mode ?? "missing",
          contractReady: components.ingestionWorker?.contractReady === true,
          liveReady: components.ingestionWorker?.liveReady === true,
          createsKubernetesJobByThisVerifier:
            components.ingestionWorker?.createsKubernetesJobByThisVerifier === true
        },
        vectorWriteAuditSink: {
          contractReady: components.vectorWriteAuditSink?.contractReady === true,
          liveReady: components.vectorWriteAuditSink?.liveReady === true,
          appendOnly: components.vectorWriteAuditSink?.appendOnly === true,
          recordsRollbackChunkIds:
            components.vectorWriteAuditSink?.recordsRollbackChunkIds === true
        }
      },
      readOnlyCommands,
      approvalGatedCommands,
      firstProductionActions,
      ticketPacket,
      missingEvidence: artifact.missingEvidence ?? [],
      risk: artifact.risk ?? [],
      rollbackPath: artifact.rollbackPath ?? [],
      evidence: [
        `RAG production readiness ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `RAG production readiness generated at ${artifact.generatedAt ?? "unknown"} from ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
        `contractReady=${String(readiness.contractReady === true)} approvalRequired=${String(readiness.approvalRequired !== false)}`,
        `queue backend=${components.queue?.backendClass ?? "missing"} liveReady=${String(components.queue?.liveReady === true)} storesRawMarkdown=${String(components.queue?.storesRawMarkdown === true)}`,
        `ingestionWorker liveReady=${String(components.ingestionWorker?.liveReady === true)} createsJobByVerifier=${String(components.ingestionWorker?.createsKubernetesJobByThisVerifier === true)}`,
        `vectorAudit appendOnly=${String(components.vectorWriteAuditSink?.appendOnly === true)} rollbackChunkIds=${String(components.vectorWriteAuditSink?.recordsRollbackChunkIds === true)}`,
        `mutation boundary cluster=${String(artifact.clusterMutationAttempted === true)} vectorWrite=${String(artifact.vectorWriteAttempted === true)} ingestionJob=${String(artifact.ingestionJobCreated === true)}`,
        `ragProductionFirstActions=${firstProductionActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        ...(artifact.missingEvidence ?? []).slice(0, 3),
        "admin overview reads RAG production readiness evidence only; it does not enable DB persistence, create ingestion jobs, or write vectors"
      ]
    };

    return {
      status,
      productionReadiness,
      evidence: productionReadiness.evidence
    };
  } catch (error) {
    return {
      status: "blocked",
      productionReadiness: missingRagProductionReadinessSummary(
        error instanceof Error ? error.message : "unknown evidence parse error",
        "blocked"
      ),
      evidence: [
        `RAG production readiness evidence could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid RAG production readiness evidence blocks overclaiming ingestion readiness"
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

function mapOcpNetworkHandoffApiFallbackStatus(
  artifact: OcpNetworkHandoffApiFallbackArtifact
): OpsLensOcpNetworkHandoffApiFallbackReadiness {
  if (artifact.status === "PASS") return "ready";
  if (artifact.status === "FAIL" || artifact.status === "BLOCKED") return "blocked";
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

function missingOcpNetworkHandoffApiFallbackSummary(
  reason: string,
  status: OpsLensOcpNetworkHandoffApiFallbackReadiness = "needs-evidence"
): OpsLensOcpNetworkHandoffApiFallbackSummary {
  return {
    status,
    artifactStatus: status === "blocked" ? "invalid" : "missing",
    actionMode: "apiFallbackVerificationOnly",
    headSha: "unknown",
    worktreeDirty: "unknown",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    caseCount: 0,
    failedCheckCount: 0,
    cases: [],
    evidence: [
      "run npm run verify:ocp:handoff-api-fallback to prove API fallback handoff routing",
      "dashboard keeps OCP handoff API fallback as needs-evidence until the artifact exists"
    ],
    missingEvidence: [reason],
    risk: [
      "Without fallback proof, partial OCP handoff artifacts could be misrouted in the dashboard."
    ],
    rollbackPath: [
      "Regenerate OCP handoff API fallback evidence after changing handoff API mapping."
    ]
  };
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
    postApprovalSmoke: {
      artifactStatus: "missing",
      requiredAfterAuthRbacApproval: false,
      command: "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000",
      ocpClassification: "missing",
      requiredRbacAllowed: false,
      requiredRbacReviewCount: 0,
      requiredRbacAllowedCount: 0,
      requiredRbacDeniedCount: 0,
      requiredRbacUnknownCount: 0,
      lightspeedClassification: "missing",
      lightspeedAuthReady: false,
      sourceArtifacts: [],
      verifierRuns: [],
      missingEvidence: [reason]
    },
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
    credentialHygiene: mapOcpCredentialHygiene(undefined, {
      tokenConfigured: false,
      tokenSource: "missing",
      tokenLengthClass: "missing",
      localFormatIssue: true,
      credentialDiagnosis: "missing-evidence"
    }),
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
    firstNetworkActions: [
      {
        id: "generate-ocp-network-handoff",
        owner: "network-sre",
        phase: "network-evidence-preflight",
        status: "needs-evidence",
        request:
          "Generate the OCP network handoff packet before opening a Network/SRE ticket.",
        evidenceNeeded: reason,
        nextCommand: "npm run evidence:ocp-network-handoff",
        mutation: false,
        requiresExplicitApproval: false,
        blockedBy: [reason],
        rollbackPath:
          "No rollback is required because this action only writes local handoff evidence."
      }
    ],
    ticketPacket: {
      id: "network-sre-ocp-api-reachability-ticket",
      owner: "network-sre",
      title: "Generate OCP network handoff before live readiness review",
      severity: "needs-evidence",
      classification: "missing",
      redactedTarget: "missing",
      summary:
        "Generate the Network/SRE ticket packet before treating live OCP or Lightspeed readiness as actionable.",
      evidenceChecklist: [reason],
      firstReadOnlyAction: {
        id: "generate-ocp-network-handoff",
        status: "needs-evidence",
        nextCommand: "npm run evidence:ocp-network-handoff",
        mutation: false,
        requiresExplicitApproval: false
      },
      approvalGatedAction: {
        id: "none",
        status: "not-required",
        nextCommand: "none",
        mutation: false,
        requiresExplicitApproval: false
      },
      nextCommands: ["npm run evidence:ocp-network-handoff"],
      blockedBy: [reason],
      mutationBoundary: {
        clusterMutationAttempted: false,
        registryMutationAttempted: false,
        mutationAllowedByThisVerifier: false,
        networkChangeRequiresExplicitApproval: false
      },
      risk:
        "Without a network handoff packet, tcp-timeout and route/firewall evidence can be lost between operators.",
      rollbackPath:
        "No rollback is required because this action only writes local handoff evidence."
    },
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

function isOcpAuthRbacClassification(classification: string): boolean {
  return ["auth-or-rbac", "auth-failed", "token-missing"].includes(classification);
}

function isOcpNetworkChangeClassification(classification: string): boolean {
  return ["tcp-timeout", "tcp-unreachable", "dns-unresolved"].includes(classification);
}

function ocpHandoffOwnerForClassification(classification: string): string {
  if (isOcpAuthRbacClassification(classification)) return "cluster-admin";
  if (classification === "tls-handshake-failed") return "cluster-sre";
  return "network-sre";
}

function ocpHandoffTicketIdForClassification(classification: string): string {
  if (isOcpAuthRbacClassification(classification)) {
    return "cluster-admin-ocp-auth-rbac-ticket";
  }
  if (classification === "tls-handshake-failed") {
    return "cluster-sre-ocp-api-tls-ticket";
  }
  return "network-sre-ocp-api-reachability-ticket";
}

function ocpHandoffTicketTitleForClassification(classification: string): string {
  if (isOcpAuthRbacClassification(classification)) {
    return `Restore OCP API ${classification} credential/RBAC readiness for Cywell OpsLens and Lightspeed evidence`;
  }
  if (classification === "tls-handshake-failed") {
    return "Restore OCP API TLS readiness for Cywell OpsLens and Lightspeed evidence";
  }
  return `Restore OCP API ${classification} network readiness for Cywell OpsLens and Lightspeed evidence`;
}

function ocpHandoffTicketSummaryForClassification(classification: string): string {
  if (isOcpAuthRbacClassification(classification)) {
    return "Use this packet as the Cluster Admin/SRE credential and read-only RBAC ticket summary; DNS, TCP, and TLS reached the API, so collect auth/RBAC evidence before requesting any network change.";
  }
  if (classification === "tls-handshake-failed") {
    return "Use this packet as the Cluster SRE/Security TLS ticket summary; DNS and TCP reached the API, so collect certificate/trust evidence before requesting any network change.";
  }
  return "Use this packet as the Network/SRE ticket summary; collect read-only DNS/TCP/route evidence first, then use an approved network change only if reachability remains blocked.";
}

function fallbackOcpNetworkFirstActions(
  classification: string,
  target: OpsLensOcpNetworkHandoffSummary["target"],
  readOnlyCommands: OpsLensOcpNetworkHandoffSummary["readOnlyCommands"],
  missingEvidence: string[]
): OpsLensOcpNetworkHandoffSummary["firstNetworkActions"] {
  const commandById = (id: string, fallback: string) =>
    readOnlyCommands.find((command) => command.id === id)?.command ?? fallback;
  const blockedBy =
    missingEvidence.length > 0
      ? missingEvidence
      : [`OCP API connectivity classification=${classification}`];
  const owner = ocpHandoffOwnerForClassification(classification);
  const host = "<redacted-host>";
  const port = target.port || "6443";
  const actions: OpsLensOcpNetworkHandoffSummary["firstNetworkActions"] = [
    {
      id: "network-sre-confirm-ocp-api-dns",
      owner,
      phase: "network-dns-preflight",
      status: classification === "dns-unresolved" ? "blocker" : "read-only",
      request:
        "Confirm the OCP API hostname resolves before debugging Lightspeed or Operator readiness.",
      evidenceNeeded:
        "DNS result for the configured OCP API host from this workstation or approved bastion.",
      nextCommand: commandById(
        "windows-resolve-dns",
        `powershell -NoProfile -Command "Resolve-DnsName ${host}"`
      ),
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this command only reads resolver output."
    },
    {
      id: "network-sre-confirm-ocp-api-tcp-6443",
      owner,
      phase: "network-tcp-preflight",
      status: ["tcp-timeout", "tcp-unreachable"].includes(classification)
        ? "blocker"
        : "read-only",
      request:
        "Confirm TCP 6443 reachability before investigating TLS, RBAC, or Lightspeed configuration.",
      evidenceNeeded:
        "TCP reachability result for the configured OCP API host and port.",
      nextCommand: commandById(
        "windows-test-netconnection",
        `powershell -NoProfile -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Detailed"`
      ),
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this command only tests socket reachability."
    },
    {
      id: "network-sre-rerun-ocp-connectivity-diagnostic",
      owner,
      phase: "network-evidence-refresh",
      status: classification === "api-ready" ? "ready-for-live-recheck" : "needs-evidence",
      request:
        "Rerun the bounded OCP connectivity diagnostic after DNS/TCP/TLS/auth changes.",
      evidenceNeeded:
        "Current-head OCP connectivity diagnostic shows classification=api-ready.",
      nextCommand: commandById(
        "ocp-connectivity",
        "npm run verify:ocp:connectivity -- --timeout-ms 30000"
      ),
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "Regenerate the OCP network handoff if the classification changes or the Git head moves."
    }
  ];

  if (isOcpAuthRbacClassification(classification)) {
    actions.unshift({
      id: "cluster-admin-review-ocp-auth-rbac-evidence",
      owner,
      phase: "auth-rbac-preflight",
      status: "blocker",
      request:
        "Confirm the configured OCP credential is current and the least-privilege live evidence reader RBAC plan is ready for approval.",
      evidenceNeeded:
        "OCP auth/RBAC approval packet shows Secrets excluded, read-only verbs only, and mutation flags false.",
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      mutation: false,
      requiresExplicitApproval: false,
      blockedBy,
      rollbackPath:
        "No rollback is required because this action only refreshes a local approval packet."
    });
  }

  if (isOcpNetworkChangeClassification(classification)) {
    actions.push({
      id: "approval-gated-network-route-change",
      owner: "network-sre",
      phase: "network-change",
      status: "approval-gated",
      request:
        "Open an approved Network/SRE change for VPN, firewall, security-group, DNS, or route fixes; the API does not run this change.",
      evidenceNeeded:
        "Approved network change ticket with source, destination, port 6443, expected DNS, rollback owner, and maintenance window.",
      nextCommand: `open approved Network/SRE change for ${host}:${port} reachability`,
      mutation: true,
      requiresExplicitApproval: true,
      blockedBy,
      rollbackPath:
        "Revert the approved network change through the same Network/SRE change ticket if reachability or routing is incorrect."
    });
  }

  return actions;
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
    credentialHygiene: mapOcpCredentialHygiene(undefined, {
      tokenConfigured: false,
      tokenSource: "missing",
      tokenLengthClass: "missing",
      localFormatIssue: true,
      credentialDiagnosis: "missing-evidence"
    }),
    ocContext: {
      currentContextSet: false,
      whoamiAvailable: false,
      showServerAvailable: false,
      kubeconfigEnvConfigured: false,
      defaultKubeconfigPresent: false,
      contextStatus: "missing",
      authStatus: "not-authenticated",
      serverStatus: "missing"
    },
    markdownPath: "missing",
    requiredApprovals: ["cluster-admin", "security-reviewer"],
    rbac: {
      namespace: "cywell-opslens",
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
    ticketPacket: undefined,
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
        postApprovalSmoke: {
          artifactStatus: artifact.postApprovalSmoke?.artifactStatus ?? "missing",
          requiredAfterAuthRbacApproval:
            artifact.postApprovalSmoke?.requiredAfterAuthRbacApproval === true,
          command:
            artifact.postApprovalSmoke?.command ??
            "npm run verify:ocp:live-reader-smoke -- --timeout-ms 30000",
          ocpClassification:
            artifact.postApprovalSmoke?.ocpClassification ?? "missing",
          requiredRbacAllowed:
            artifact.postApprovalSmoke?.requiredRbacAllowed === true,
          requiredRbacReviewCount:
            artifact.postApprovalSmoke?.requiredRbacReviewCount ?? 0,
          requiredRbacAllowedCount:
            artifact.postApprovalSmoke?.requiredRbacAllowedCount ?? 0,
          requiredRbacDeniedCount:
            artifact.postApprovalSmoke?.requiredRbacDeniedCount ?? 0,
          requiredRbacUnknownCount:
            artifact.postApprovalSmoke?.requiredRbacUnknownCount ?? 0,
          lightspeedClassification:
            artifact.postApprovalSmoke?.lightspeedClassification ?? "missing",
          lightspeedAuthReady:
            artifact.postApprovalSmoke?.lightspeedAuthReady === true,
          sourceArtifacts: (artifact.postApprovalSmoke?.sourceArtifacts ?? []).map(
            (source) => ({
              id: source.id ?? "unknown",
              label: source.label ?? "unknown",
              status: source.status ?? "unknown",
              fresh: source.fresh === true,
              required: source.required === true,
              headSha: source.headSha ?? "missing",
              worktreeDirty: source.worktreeDirty ?? "unknown"
            })
          ),
          verifierRuns: (artifact.postApprovalSmoke?.verifierRuns ?? []).map(
            (run) => ({
              id: run.id ?? "unknown",
              ok: run.ok === true,
              skipped: run.skipped === true
            })
          ),
          missingEvidence: artifact.postApprovalSmoke?.missingEvidence ?? []
        },
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
        `post-approval smoke=${artifact.postApprovalSmoke?.artifactStatus ?? "missing"} required=${String(artifact.postApprovalSmoke?.requiredAfterAuthRbacApproval ?? false)}`,
        `post-approval smoke rbac=${artifact.postApprovalSmoke?.requiredRbacAllowedCount ?? 0}/${artifact.postApprovalSmoke?.requiredRbacReviewCount ?? 0} unknown=${artifact.postApprovalSmoke?.requiredRbacUnknownCount ?? 0} lightspeedAuthReady=${String(artifact.postApprovalSmoke?.lightspeedAuthReady ?? false)}`,
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
    const mappedTarget = {
      host: "<redacted-host>",
      port: target.port ?? "unknown",
      redactedBaseUrl: redactedOcpTarget(target),
      tokenConfigured: target.tokenConfigured === true,
      tlsVerify: target.tlsVerify === true
    };
    const credentialHygiene = mapOcpCredentialHygiene(
      artifact.credentialHygiene,
      {
        tokenConfigured: mappedTarget.tokenConfigured,
        credentialDiagnosis: "unknown"
      }
    );
    const classification = artifact.diagnostics?.classification ?? "unknown";
    const missingEvidence = artifact.missingEvidence ?? [];
    const firstNetworkActions = (
      artifact.firstNetworkActions?.length
        ? artifact.firstNetworkActions
        : fallbackOcpNetworkFirstActions(
            classification,
            mappedTarget,
            readOnlyCommands,
            missingEvidence
          )
    ).map((action) => ({
      id: action.id ?? "unknown",
      owner: action.owner ?? ocpHandoffOwnerForClassification(classification),
      phase: action.phase ?? "network-evidence-preflight",
      status: action.status ?? "needs-evidence",
      request: action.request ?? "network handoff first action",
      evidenceNeeded: action.evidenceNeeded ?? "missing evidence",
      nextCommand: action.nextCommand ?? "npm run evidence:ocp-network-handoff",
      mutation: action.mutation === true,
      requiresExplicitApproval: action.requiresExplicitApproval === true,
      blockedBy: action.blockedBy ?? [],
      rollbackPath:
        action.rollbackPath ??
        "Regenerate the OCP network handoff before proceeding."
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
    const firstTicketReadOnly =
      firstNetworkActions.find((action) => action.mutation === false && action.status === "blocker") ??
      firstNetworkActions.find((action) => action.mutation === false) ?? {
        id: "missing-read-only-action",
        status: "missing",
        nextCommand: "missing",
        mutation: false,
        requiresExplicitApproval: false
      };
    const firstTicketApproval =
      firstNetworkActions.find((action) => action.mutation === true) ?? {
        id: "none",
        status: "not-required",
        nextCommand: "none",
        mutation: false,
        requiresExplicitApproval: false
      };
    const rawTicketPacket = artifact.ticketPacket ?? {};
    const ticketClassification =
      rawTicketPacket.classification ?? classification;
    const mapTicketAction = (
      action:
        | NonNullable<OcpNetworkHandoffArtifact["ticketPacket"]>["firstReadOnlyAction"]
        | NonNullable<OcpNetworkHandoffArtifact["ticketPacket"]>["approvalGatedAction"]
        | typeof firstTicketReadOnly,
      fallback: typeof firstTicketReadOnly
    ) => ({
      id: action?.id ?? fallback.id,
      status: action?.status ?? fallback.status,
      nextCommand: action?.nextCommand ?? fallback.nextCommand,
      mutation: action?.mutation === true,
      requiresExplicitApproval: action?.requiresExplicitApproval === true
    });
    const ticketPacket = {
      id:
        rawTicketPacket.id ??
        ocpHandoffTicketIdForClassification(ticketClassification),
      owner:
        rawTicketPacket.owner ??
        firstNetworkActions.find((action) => action.owner)?.owner ??
        ocpHandoffOwnerForClassification(ticketClassification),
      title:
        rawTicketPacket.title ??
        ocpHandoffTicketTitleForClassification(ticketClassification),
      severity:
        rawTicketPacket.severity ??
        (classification === "api-ready"
          ? "ready-for-live-recheck"
          : "needs-evidence"),
      classification: ticketClassification,
      redactedTarget: rawTicketPacket.redactedTarget ?? mappedTarget.redactedBaseUrl,
      summary:
        rawTicketPacket.summary ??
        ocpHandoffTicketSummaryForClassification(ticketClassification),
      evidenceChecklist:
        rawTicketPacket.evidenceChecklist ??
        [
          `classification=${classification}`,
          ...sourceArtifacts.map(
            (source) => `${source.id}:${source.status}:fresh=${String(source.fresh)}`
          )
        ],
      firstReadOnlyAction: mapTicketAction(
        rawTicketPacket.firstReadOnlyAction,
        firstTicketReadOnly
      ),
      approvalGatedAction: mapTicketAction(
        rawTicketPacket.approvalGatedAction,
        firstTicketApproval
      ),
      nextCommands:
        rawTicketPacket.nextCommands ??
        firstNetworkActions
          .map((action) => action.nextCommand)
          .filter(Boolean)
          .slice(0, 4),
      blockedBy: rawTicketPacket.blockedBy ?? missingEvidence,
      mutationBoundary: {
        clusterMutationAttempted:
          rawTicketPacket.mutationBoundary?.clusterMutationAttempted === true,
        registryMutationAttempted:
          rawTicketPacket.mutationBoundary?.registryMutationAttempted === true,
        mutationAllowedByThisVerifier:
          rawTicketPacket.mutationBoundary?.mutationAllowedByThisVerifier === true,
        networkChangeRequiresExplicitApproval:
          rawTicketPacket.mutationBoundary?.networkChangeRequiresExplicitApproval ??
          (firstTicketApproval.mutation === true &&
            firstTicketApproval.requiresExplicitApproval === true)
      },
      risk:
        rawTicketPacket.risk ??
        artifact.risk?.[0] ??
        "Network reachability must be proven before live readiness can be trusted.",
      rollbackPath:
        rawTicketPacket.rollbackPath ??
        artifact.rollbackPath?.[0] ??
        "No rollback is required because this packet writes only local evidence."
    };

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
        target: mappedTarget,
        credentialHygiene,
        markdownPath: artifact.markdownOut ?? "unknown",
        adminRequests: artifact.adminRequests ?? [],
        readOnlyCommands,
        firstNetworkActions,
        ticketPacket,
        sourceArtifacts,
        missingEvidence,
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP network handoff ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `network classification=${artifact.diagnostics?.classification ?? "unknown"} commands=${readOnlyCommands.length}`,
        `network first actions=${firstNetworkActions.map((action) => `${action.id}:${action.owner}:${action.nextCommand}:mutation=${String(action.mutation)}`).join(", ") || "missing"}`,
        `network handoff markdown=${artifact.markdownOut ?? "unknown"}`,
        ...missingEvidence.slice(0, 3),
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

function getOcpNetworkHandoffApiFallbackReadiness(): {
  status: OpsLensOcpNetworkHandoffApiFallbackReadiness;
  evidence: string[];
  networkHandoffApiFallback: OpsLensOcpNetworkHandoffApiFallbackSummary;
} {
  const evidencePath = ocpNetworkHandoffApiFallbackPath();

  if (!existsSync(evidencePath)) {
    const summary = missingOcpNetworkHandoffApiFallbackSummary(
      `OCP handoff API fallback evidence is missing at ${evidencePath}`
    );
    return {
      status: "needs-evidence",
      networkHandoffApiFallback: summary,
      evidence: summary.evidence
    };
  }

  try {
    const artifact = JSON.parse(
      readFileSync(evidencePath, "utf8")
    ) as OcpNetworkHandoffApiFallbackArtifact;
    const status = mapOcpNetworkHandoffApiFallbackStatus(artifact);
    const cases = (artifact.cases ?? []).map((testCase) => ({
      classification: testCase.classification ?? "unknown",
      owner: testCase.actual?.owner ?? "missing",
      ticketId: testCase.actual?.ticketId ?? "missing",
      firstActionId: testCase.actual?.firstActionId ?? "missing",
      approvalId: testCase.actual?.approvalId ?? "missing",
      networkChangeRequiresExplicitApproval:
        testCase.actual?.networkChangeRequiresExplicitApproval === true
    }));
    const failedCheckCount = (artifact.checks ?? []).filter(
      (check) => check.status === "FAIL"
    ).length;
    const headSha = artifact.headSha ?? artifact.ref?.headSha ?? "unknown";
    const worktreeDirty =
      artifact.worktreeDirty ?? artifact.ref?.worktreeDirty ?? "unknown";
    const missingEvidence = [
      ...(artifact.missingEvidence ?? []),
      ...(status === "ready" ? [] : [`fallback status=${artifact.status ?? "missing"}`])
    ];
    const summary: OpsLensOcpNetworkHandoffApiFallbackSummary = {
      status,
      artifactStatus: artifact.status ?? "unknown",
      actionMode: "apiFallbackVerificationOnly",
      headSha,
      worktreeDirty,
      clusterMutationAttempted: artifact.clusterMutationAttempted === true,
      registryMutationAttempted: artifact.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        artifact.mutationAllowedByThisVerifier === true,
      caseCount: cases.length,
      failedCheckCount,
      cases,
      evidence: [
        `OCP handoff API fallback ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `fallback cases=${cases.map((testCase) => `${testCase.classification}:${testCase.owner}:${testCase.ticketId}`).join(", ") || "missing"}`,
        `fallback failedChecks=${failedCheckCount} dirty=${String(worktreeDirty)}`,
        "admin overview reads fallback evidence only; it does not run live checks or mutate cluster/network state"
      ],
      missingEvidence,
      risk: artifact.risk ?? [
        "Fallback proof must stay current so partial network handoff artifacts do not route auth/RBAC blockers to Network/SRE."
      ],
      rollbackPath: artifact.rollbackPath ?? [
        "Regenerate OCP handoff API fallback evidence after changing handoff API mapping."
      ]
    };
    return {
      status,
      networkHandoffApiFallback: summary,
      evidence: summary.evidence
    };
  } catch (error) {
    const summary = missingOcpNetworkHandoffApiFallbackSummary(
      error instanceof Error ? error.message : "unknown evidence parse error",
      "blocked"
    );
    return {
      status: "blocked",
      networkHandoffApiFallback: summary,
      evidence: [
        `OCP handoff API fallback could not be parsed from ${evidencePath}`,
        error instanceof Error ? error.message : "unknown evidence parse error",
        "invalid fallback evidence blocks overclaiming dashboard routing safety"
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
    const namespace = rbac.namespace ?? {};
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
    const credentialHygiene = mapOcpCredentialHygiene(
      artifact.credentialHygiene,
      {
        tokenConfigured: target.tokenConfigured === true,
        localFormatIssue: artifact.diagnostics?.credentialLocalFormatIssue === true,
        credentialDiagnosis:
          artifact.diagnostics?.credentialDiagnosis ?? "unknown"
      }
    );
    const rawOcContext = artifact.ocContext ?? artifact.diagnostics?.ocContext;
    const ocContext = {
      currentContextSet: rawOcContext?.currentContextSet === true,
      whoamiAvailable: rawOcContext?.whoamiAvailable === true,
      showServerAvailable: rawOcContext?.showServerAvailable === true,
      kubeconfigEnvConfigured: rawOcContext?.kubeconfigEnvConfigured === true,
      defaultKubeconfigPresent: rawOcContext?.defaultKubeconfigPresent === true,
      contextStatus: rawOcContext?.contextStatus ?? "unknown",
      authStatus: rawOcContext?.authStatus ?? "unknown",
      serverStatus: rawOcContext?.serverStatus ?? "unknown"
    };
    const rawTicketPacket = artifact.ticketPacket;
    const ticketPacket = rawTicketPacket
      ? {
          ...rawTicketPacket,
          id: rawTicketPacket.id ?? "cluster-admin-ocp-live-reader-rbac-ticket",
          owner: rawTicketPacket.owner ?? "cluster-admin",
          title: rawTicketPacket.title ?? "OCP live evidence reader RBAC approval",
          severity: rawTicketPacket.severity ?? "high",
          classification:
            rawTicketPacket.classification ??
            artifact.diagnostics?.classification ??
            "unknown",
          redactedTarget: redactedOcpTarget(target),
          summary:
            rawTicketPacket.summary ??
            "Review the fallback read-only live evidence reader RBAC plan.",
          evidenceChecklist: rawTicketPacket.evidenceChecklist ?? [],
          firstReadOnlyAction: {
            id:
              rawTicketPacket.firstReadOnlyAction?.id ??
              "cluster-admin-review-ocp-auth-rbac-evidence",
            status: rawTicketPacket.firstReadOnlyAction?.status ?? "open",
            nextCommand:
              rawTicketPacket.firstReadOnlyAction?.nextCommand ??
              "npm run evidence:ocp-auth-rbac-plan",
            mutation: rawTicketPacket.firstReadOnlyAction?.mutation === true,
            requiresExplicitApproval:
              rawTicketPacket.firstReadOnlyAction?.requiresExplicitApproval === true
          },
          approvalGatedAction: {
            id:
              rawTicketPacket.approvalGatedAction?.id ??
              "apply-live-evidence-reader-rbac",
            status:
              rawTicketPacket.approvalGatedAction?.status ?? "approval-gated",
            nextCommand:
              rawTicketPacket.approvalGatedAction?.nextCommand ??
              "oc apply -f deploy/ocp-live-readonly/opslens-live-evidence-reader.yaml",
            mutation: rawTicketPacket.approvalGatedAction?.mutation === true,
            requiresExplicitApproval:
              rawTicketPacket.approvalGatedAction?.requiresExplicitApproval !== false
          },
          nextCommands: rawTicketPacket.nextCommands ?? [],
          blockedBy: rawTicketPacket.blockedBy ?? artifact.missingEvidence ?? [],
          mutationBoundary: {
            clusterMutationAttempted:
              rawTicketPacket.mutationBoundary?.clusterMutationAttempted === true,
            registryMutationAttempted:
              rawTicketPacket.mutationBoundary?.registryMutationAttempted === true,
            mutationAllowedByThisVerifier:
              rawTicketPacket.mutationBoundary?.mutationAllowedByThisVerifier === true,
            networkChangeRequiresExplicitApproval:
              rawTicketPacket.mutationBoundary?.networkChangeRequiresExplicitApproval === true
          },
          risk:
            rawTicketPacket.risk ??
            artifact.risk?.[0] ??
            "Fallback reader RBAC requires explicit approval.",
          rollbackPath:
            rawTicketPacket.rollbackPath ??
            artifact.rollbackPath?.[0] ??
            "Regenerate the auth/RBAC plan after OCP connectivity evidence changes."
        }
      : undefined;

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
          host: "<redacted-host>",
          port: target.port ?? "unknown",
          redactedBaseUrl: redactedOcpTarget(target),
          tokenConfigured: target.tokenConfigured === true,
          tlsVerify: target.tlsVerify === true
        },
        credentialHygiene,
        ocContext,
        markdownPath: artifact.markdownOut ?? "unknown",
        requiredApprovals: artifact.requiredApprovals ?? [
          "cluster-admin",
          "security-reviewer"
        ],
        rbac: {
          namespace: namespace.name ?? serviceAccount.namespace ?? "unknown",
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
        ticketPacket,
        adminRequests: artifact.adminRequests ?? [],
        missingEvidence: artifact.missingEvidence ?? [],
        risk: artifact.risk ?? [],
        rollbackPath: artifact.rollbackPath ?? []
      },
      evidence: [
        `OCP auth/RBAC plan ${artifact.artifactType ?? "unknown"} status=${artifact.status ?? "unknown"}`,
        `auth/RBAC classification=${artifact.diagnostics?.classification ?? "unknown"} serviceAccount=${serviceAccount.namespace ?? "unknown"}/${serviceAccount.name ?? "unknown"} readOnlyCommands=${readOnlyCommands.length} approvalGated=${approvalGatedCommands.length}`,
        `auth/RBAC credentialDiagnosis=${credentialHygiene.credentialDiagnosis} tokenRedacted=${String(credentialHygiene.tokenValueRedacted)}`,
        `auth/RBAC ocContext=${ocContext.contextStatus} ocAuthenticationStatus=${ocContext.authStatus} ocServer=${ocContext.serverStatus}`,
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

function buildAiopsMonitoringProxyHandoff(
  artifact: AiopsIncidentPipelineArtifact | undefined,
  metricQueries: OpsLensAiopsIncidentPipelineSummary["metricQueries"],
  reason?: string
): OpsLensAiopsIncidentPipelineSummary["monitoringProxyHandoff"] {
  const requiredQueries =
    artifact?.pipeline?.requiredMetricQueries ?? aiopsRequiredMetricQueries;
  const liveQueries = artifact?.liveSmoke?.incident?.metricQueries ?? [];
  const liveQueryByName = new Map(
    liveQueries.map((query) => [query.name, query])
  );
  const readyQueries = metricQueries
    .filter((query) => query.status === "ready")
    .map((query) => query.name);
  const missingQueries = requiredQueries.filter(
    (name) => !readyQueries.includes(name)
  );
  const sampleCount = metricQueries.reduce(
    (total, query) => total + query.sampleCount,
    0
  );
  const metricMissingEvidence = [
    ...(artifact?.missingEvidence ?? []),
    ...(artifact?.liveSmoke?.missingEvidence ?? []),
    ...(artifact?.liveSmoke?.incident?.missingEvidence ?? []),
    ...metricQueries.flatMap((query) => query.missingEvidence)
  ];
  const monitoringGaps = Array.from(
    new Set(
      metricMissingEvidence.filter((item) =>
        /metrics\/|Prometheus|Monitoring service proxy|OCP_ENABLE_MONITORING_PROXY|monitoring proxy/i.test(
          item
        )
      )
    )
  );
  const enabled = requiredQueries.some(
    (name) => liveQueryByName.get(name)?.enabled === true
  );
  const reachable = requiredQueries.some(
    (name) => liveQueryByName.get(name)?.reachable === true
  );
  const hasMonitoringProxyGap =
    monitoringGaps.length > 0 ||
    requiredQueries.some((name) => {
      const query = liveQueryByName.get(name);
      return query?.enabled === false || query?.reachable === false;
    });
  const status: OpsLensAiopsIncidentPipelineSummary["monitoringProxyHandoff"]["status"] =
    !artifact
      ? "needs-evidence"
      : missingQueries.length === 0
        ? "ready"
        : hasMonitoringProxyGap
          ? "needs-approval"
          : "needs-evidence";
  const missingEvidence =
    reason !== undefined
      ? [reason]
      : monitoringGaps.length > 0
        ? monitoringGaps
        : missingQueries.map(
            (name) =>
              `metrics/${name}: monitoring proxy sample evidence is missing`
          );
  const ticketPacket: OpsLensAiopsMonitoringProxyTicketPacket = {
    id:
      artifact?.monitoringProxyTicketPacket?.id ??
      "cluster-sre-monitoring-proxy-ticket",
    owner: "cluster-sre",
    title:
      artifact?.monitoringProxyTicketPacket?.title ??
      "AI Ops monitoring proxy evidence handoff",
    severity: "high",
    classification:
      artifact?.monitoringProxyTicketPacket?.classification ??
      (missingQueries.length === 0
        ? "monitoring-proxy-ready"
        : monitoringGaps.some((item) =>
            /Monitoring service proxy is disabled|OCP_ENABLE_MONITORING_PROXY=true/i.test(
              item
            )
          )
          ? "monitoring-proxy-disabled"
          : "monitoring-query-evidence-missing"),
    handoffStatus:
      artifact?.monitoringProxyTicketPacket?.handoffStatus ?? status,
    requiredQueries:
      artifact?.monitoringProxyTicketPacket?.requiredQueries ?? requiredQueries,
    readyQueries:
      artifact?.monitoringProxyTicketPacket?.readyQueries ?? readyQueries,
    missingQueries:
      artifact?.monitoringProxyTicketPacket?.missingQueries ?? missingQueries,
    sampleCount:
      artifact?.monitoringProxyTicketPacket?.sampleCount ?? sampleCount,
    evidenceChecklist:
      artifact?.monitoringProxyTicketPacket?.evidenceChecklist ??
      [
        ...missingEvidence.slice(0, 6),
        "Cluster SRE approval is required before enabling the monitoring proxy path."
      ],
    firstReadOnlyAction: {
      id:
        artifact?.monitoringProxyTicketPacket?.firstReadOnlyAction?.id ??
        "aiops-monitoring-proxy-smoke",
      status:
        artifact?.monitoringProxyTicketPacket?.firstReadOnlyAction?.status ??
        (missingQueries.length > 0 ? "needs-evidence" : "ready"),
      nextCommand:
        artifact?.monitoringProxyTicketPacket?.firstReadOnlyAction?.nextCommand ??
        "npm run verify:aiops",
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id:
        artifact?.monitoringProxyTicketPacket?.approvalGatedAction?.id ??
        "approval-gated-enable-monitoring-proxy-path",
      status:
        artifact?.monitoringProxyTicketPacket?.approvalGatedAction?.status ??
        (status === "ready" ? "not-required" : "approval-gated"),
      nextCommand:
        artifact?.monitoringProxyTicketPacket?.approvalGatedAction?.nextCommand ??
        "Set OCP_ENABLE_MONITORING_PROXY=true only for an approved read-only service proxy path, then run npm run verify:aiops",
      mutation: false,
      requiresExplicitApproval: true
    },
    nextCommands:
      artifact?.monitoringProxyTicketPacket?.nextCommands ??
      [
        "npm run verify:aiops",
        "Set OCP_ENABLE_MONITORING_PROXY=true only after Cluster SRE approves the read-only monitoring proxy path"
      ],
    blockedBy:
      artifact?.monitoringProxyTicketPacket?.blockedBy ?? missingEvidence,
    mutationBoundary: {
      clusterMutationAttempted:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.registryMutationAttempted === true,
      vectorWriteAttempted:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.vectorWriteAttempted === true,
      ingestionJobCreated:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.ingestionJobCreated === true,
      mutationAllowedByThisVerifier:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.mutationAllowedByThisVerifier === true,
      monitoringProxyEnableRequiresApproval:
        artifact?.monitoringProxyTicketPacket?.mutationBoundary?.monitoringProxyEnableRequiresApproval !== false
    },
    risk:
      artifact?.monitoringProxyTicketPacket?.risk ??
      "Metric correlation remains incomplete until Cluster SRE approves and refreshes read-only monitoring proxy evidence.",
    rollbackPath:
      artifact?.monitoringProxyTicketPacket?.rollbackPath ??
      "Unset OCP_ENABLE_MONITORING_PROXY or keep it false to return to log/event/runbook-only incident analysis."
  };

  return {
    status,
    actionMode: "handoffOnly",
    owner: "cluster-sre",
    enabled,
    reachable,
    approvalRequired: status !== "ready",
    requiredQueries,
    readyQueries,
    missingQueries,
    sampleCount,
    nextCommand: "npm run verify:aiops",
    readOnlyCommands: [
      {
        id: "aiops-monitoring-proxy-smoke",
        command:
          "Set OCP_ENABLE_MONITORING_PROXY=true only after approval, then run npm run verify:aiops",
        phase: "aiops-monitoring-proxy-evidence",
        mutation: false,
        requiresNetwork: true,
        writesLocalEvidence: true
      }
    ],
    mutationAllowedByThisVerifier: false,
    clusterMutationAttempted: artifact?.clusterMutationAttempted === true,
    evidence: [
      "Monitoring proxy handoff is derived from opslens.aiops-incident-pipeline.v0.1.",
      `requiredMetricQueries=${requiredQueries.join(",")}`,
      `readyMetricQueries=${readyQueries.join(",") || "none"}`,
      `monitoringProxy enabled=${String(enabled)} reachable=${String(reachable)} sampleCount=${String(sampleCount)}`,
      "The dashboard only routes evidence collection; it does not enable the proxy or mutate the cluster."
    ],
    missingEvidence,
    risk: [
      "Metric correlation remains incomplete until Cluster SRE approves and refreshes read-only monitoring proxy evidence.",
      "Keeping the proxy disabled preserves the read-only MVP boundary but limits Prometheus-backed incident confidence."
    ],
    rollbackPath: [
      "Unset OCP_ENABLE_MONITORING_PROXY or keep it false to return to log/event/runbook-only incident analysis.",
      "No cluster rollback is required because this handoff runs no apply, delete, scale, or proxy mutation."
    ],
    ticketPacket
  };
}

function mapAiopsAlertmanagerIntake(
  artifact?: AiopsIncidentPipelineArtifact
): OpsLensAiopsIncidentPipelineSummary["alertmanagerIntake"] {
  const intake = artifact?.liveSmoke?.alertmanagerIntake;
  if (!intake) {
    return {
      artifactType:
        artifact?.pipeline?.alertmanagerArtifactType ??
        "opslens.alertmanager-incident-intake.v0.1",
      actionMode: artifact ? "unknown" : "missing",
      alertCount: 0,
      acceptedCount: 0,
      rawAlertReturned: false,
      mutationAllowed: false,
      clusterMutationAttempted: false,
      incidentRequestIds: [],
      evidence: [
        "Alertmanager webhook path=/api/opslens/incidents/alertmanager",
        "Alertmanager webhook intake is verified by npm run verify:aiops",
        "dashboard keeps raw alert payload return blocked by contract"
      ],
      missingEvidence: [
        artifact
          ? "AI Ops evidence artifact does not include liveSmoke.alertmanagerIntake"
          : "AI Ops evidence artifact is missing"
      ]
    };
  }

  return {
    artifactType:
      intake.artifactType ??
      artifact?.pipeline?.alertmanagerArtifactType ??
      "opslens.alertmanager-incident-intake.v0.1",
    actionMode: intake.actionMode === "planOnly" ? "planOnly" : "unknown",
    alertCount:
      typeof intake.alertCount === "number" ? intake.alertCount : 0,
    acceptedCount:
      typeof intake.acceptedCount === "number" ? intake.acceptedCount : 0,
    rawAlertReturned: intake.rawAlertReturned === true,
    mutationAllowed: intake.mutationAllowed === true,
    clusterMutationAttempted: intake.clusterMutationAttempted === true,
    incidentRequestIds: intake.incidentRequestIds ?? [],
    evidence: [
      `Alertmanager webhook path=${artifact?.pipeline?.alertmanagerWebhookPath ?? "/api/opslens/incidents/alertmanager"}`,
      `Alertmanager intake artifact=${intake.artifactType ?? "unknown"}`,
      `Alertmanager accepted=${String(intake.acceptedCount ?? 0)}/${String(intake.alertCount ?? 0)}`,
      "rawAlertReturned=false is required for dashboard evidence"
    ],
    missingEvidence: intake.missingEvidence ?? []
  };
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
    const metricQueries = aiopsRequiredMetricQueries.map((name) => ({
      name,
      query: name,
      status: "missing" as const,
      sampleCount: 0,
      evidence: [],
      missingEvidence: [`metrics/${name}: evidence artifact is missing`]
    }));

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
        metricQueries,
        monitoringProxyHandoff: buildAiopsMonitoringProxyHandoff(
          undefined,
          metricQueries,
          missingEvidence[0]
        ),
        triggerEvidenceRequired: aiopsTriggerEvidenceRequired,
        alertmanagerIntake: mapAiopsAlertmanagerIntake(),
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
      ...(artifact.liveSmoke?.incident?.missingEvidence ?? []),
      ...(artifact.liveSmoke?.alertmanagerIntake?.missingEvidence ?? [])
    ];
    const metricQueries = mapAiopsMetricQueries(artifact);
    const alertmanagerIntake = mapAiopsAlertmanagerIntake(artifact);
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
        monitoringProxyHandoff: buildAiopsMonitoringProxyHandoff(
          artifact,
          metricQueries
        ),
        triggerEvidenceRequired,
        alertmanagerIntake,
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
        monitoringProxyHandoff: buildAiopsMonitoringProxyHandoff(
          undefined,
          [],
          message
        ),
        triggerEvidenceRequired: aiopsTriggerEvidenceRequired,
        alertmanagerIntake: {
          ...mapAiopsAlertmanagerIntake(),
          actionMode: "unknown",
          missingEvidence: [message]
        },
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
  const lightspeedExtensionPointReadiness =
    getLightspeedExtensionPointReadiness();
  const lightspeedReadiness = getLightspeedMcpReadiness();
  const envContractReadiness = getEnvContractReadiness();
  const imageBuildReadiness = getImageBuildReadiness();
  const ownedImageProvenanceReadiness = getOwnedImageProvenanceReadiness();
  const externalRuntimeImagesReadiness = getExternalRuntimeImagesPlanReadiness();
  const externalRuntimeReviewPacketReadiness =
    getExternalRuntimeReviewPacketReadiness();
  const ocpConnectivityReadiness = getOcpConnectivityDiagnosticReadiness();
  const operatorPackageReadiness = getOperatorPackageReadiness();
  const operatorDryRunReadiness = getOperatorDryRunReadiness();
  const operatorRuntimeBoundaryReadiness =
    getOperatorRuntimeBoundaryReadiness();
  const installPlanReadiness = getInstallApprovalPlanReadiness();
  const certificationReadiness = getCertificationReadiness();
  const communityOperatorSubmissionReadiness =
    getCommunityOperatorSubmissionReadiness();
  const catalogToolchainReadiness = getCatalogToolchainReadiness();
  const securityScanReadiness = getSecurityScanPlanReadiness();
  const releasePublishReadiness = getReleasePublishPlanReadiness();
  const releaseEvidenceRefreshReadiness = getReleaseEvidenceRefreshReadiness();
  const releaseEvidenceBundleReadiness = getReleaseEvidenceBundleReadiness();
  const releaseActionQueueReadiness = getReleaseActionQueueReadiness();
  const roadmapCompletion = getRoadmapCompletionSummary(
    releaseActionQueueReadiness.actionQueue
  );
  const runtimeLiveHandoff = buildRuntimeLiveHandoffSummary(
    runtimeReadiness,
    releaseActionQueueReadiness.actionQueue
  );
  const ragProductionReadiness = getRagProductionReadiness();
  const evidenceCheckpointReadiness = getEvidenceCheckpointReadiness();
  const aiopsIncidentPipelineReadiness = getAiopsIncidentPipelineReadiness();
  const liveHandoffReadiness = getLiveEvidenceHandoffReadiness();
  const ocpNetworkHandoffReadiness = getOcpNetworkHandoffReadiness();
  const ocpNetworkHandoffApiFallbackReadiness =
    getOcpNetworkHandoffApiFallbackReadiness();
  const ocpAuthRbacPlanReadiness = getOcpAuthRbacPlanReadiness();
  const installReadinessEvidence = [
    releaseEvidenceRefreshReadiness.evidence[0],
    envContractReadiness.evidence[0],
    lightspeedExtensionPointReadiness.evidence[0],
    evidenceCheckpointReadiness.evidence[0],
    aiopsIncidentPipelineReadiness.evidence[0],
    liveHandoffReadiness.evidence[0],
    ocpNetworkHandoffReadiness.evidence[0],
    ocpNetworkHandoffApiFallbackReadiness.evidence[0],
    ocpAuthRbacPlanReadiness.evidence[0],
    ocpConnectivityReadiness.evidence[0],
    operatorPackageReadiness.evidence[0],
    lightspeedReadiness.evidence[0],
    operatorDryRunReadiness.evidence[0],
    operatorRuntimeBoundaryReadiness.evidence[0],
    installPlanReadiness.evidence[0],
    certificationReadiness.evidence[0],
    communityOperatorSubmissionReadiness.evidence[0],
    catalogToolchainReadiness.evidence[0],
    imageBuildReadiness.evidence[0],
    ownedImageProvenanceReadiness.evidence[0],
    externalRuntimeImagesReadiness.evidence[0],
    externalRuntimeReviewPacketReadiness.evidence[0],
    securityScanReadiness.evidence[0],
    releasePublishReadiness.evidence[0],
    releaseEvidenceBundleReadiness.evidence[0],
    releaseActionQueueReadiness.evidence[0],
    roadmapCompletion.evidence[0],
    runtimeLiveHandoff.evidence[0],
    ragProductionReadiness.evidence[0],
    ...ocpConnectivityReadiness.evidence.slice(1),
    ...operatorPackageReadiness.evidence.slice(1),
    ...lightspeedExtensionPointReadiness.evidence.slice(1),
    ...lightspeedReadiness.evidence.slice(1),
    ...operatorDryRunReadiness.evidence.slice(1),
    ...operatorRuntimeBoundaryReadiness.evidence.slice(1),
    ...installPlanReadiness.evidence.slice(1),
    ...certificationReadiness.evidence.slice(1),
    ...communityOperatorSubmissionReadiness.evidence.slice(1),
    ...catalogToolchainReadiness.evidence.slice(1),
    ...imageBuildReadiness.evidence.slice(1),
    ...ownedImageProvenanceReadiness.evidence.slice(1),
    ...externalRuntimeImagesReadiness.evidence.slice(1),
    ...externalRuntimeReviewPacketReadiness.evidence.slice(1),
    ...securityScanReadiness.evidence.slice(1),
    ...releasePublishReadiness.evidence.slice(1),
    ...releaseEvidenceRefreshReadiness.evidence.slice(1),
    ...envContractReadiness.evidence.slice(1),
    ...releaseEvidenceBundleReadiness.evidence.slice(1),
    ...releaseActionQueueReadiness.evidence.slice(1),
    ...roadmapCompletion.evidence.slice(1),
    ...runtimeLiveHandoff.evidence.slice(1),
    ...ragProductionReadiness.evidence.slice(1),
    ...aiopsIncidentPipelineReadiness.evidence.slice(1),
    ...liveHandoffReadiness.evidence.slice(1),
    ...ocpNetworkHandoffReadiness.evidence.slice(1),
    ...ocpNetworkHandoffApiFallbackReadiness.evidence.slice(1),
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
      },
      productionReadiness: ragProductionReadiness.productionReadiness
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
      liveHandoff: runtimeLiveHandoff,
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
      environmentIsolation: envContractReadiness.status,
      envContract: envContractReadiness.envContract,
      lightspeedExtensionPoint: lightspeedExtensionPointReadiness.status,
      extensionPoint: lightspeedExtensionPointReadiness.extensionPoint,
      consoleDashboard: "prototype",
      operatorPackaging: "draft",
      ocpConnectivity: ocpConnectivityReadiness.status,
      connectivity: ocpConnectivityReadiness.connectivity,
      operatorPackage: operatorPackageReadiness.status,
      operatorPackageSummary: operatorPackageReadiness.summary,
      operatorDryRun: operatorDryRunReadiness.status,
      operatorRuntimeBoundary: operatorRuntimeBoundaryReadiness.status,
      operatorRuntimeBoundarySummary:
        operatorRuntimeBoundaryReadiness.boundary,
      installPlan: installPlanReadiness.status,
      approvalPlan: installPlanReadiness.plan,
      certificationReadiness: certificationReadiness.status,
      certificationPlan: certificationReadiness.plan,
      communityOperatorSubmission: communityOperatorSubmissionReadiness.status,
      communitySubmissionPlan: communityOperatorSubmissionReadiness.plan,
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
      roadmapCompletion,
      evidenceCheckpoint: evidenceCheckpointReadiness.status,
      checkpoint: evidenceCheckpointReadiness.checkpoint,
      liveHandoff: liveHandoffReadiness.status,
      handoff: liveHandoffReadiness.handoff,
      ocpNetworkHandoff: ocpNetworkHandoffReadiness.status,
      networkHandoff: ocpNetworkHandoffReadiness.networkHandoff,
      ocpNetworkHandoffApiFallback:
        ocpNetworkHandoffApiFallbackReadiness.status,
      networkHandoffApiFallback:
        ocpNetworkHandoffApiFallbackReadiness.networkHandoffApiFallback,
      ocpAuthRbacPlan: ocpAuthRbacPlanReadiness.status,
      authRbacPlan: ocpAuthRbacPlanReadiness.authRbacPlan,
      certification:
        certificationReadiness.status === "ready-for-review" ? "ready" : "draft",
      evidence: [
        ...installReadinessEvidence,
        "Stage 1 MCP contract has verifier coverage",
        "OCP/Lightspeed environment isolation is validated by npm run verify:env",
        "Stage 1 Lightspeed extension point decision is validated by npm run verify:lightspeed-extension",
        "Stage 2 incident packet has logs/events/metrics coverage",
        "Stage 2 AI Ops incident pipeline is validated by npm run verify:aiops",
        "Stage 3 dashboard is now served by /api/opslens/admin/overview",
        "Stage 4 Operator package skeleton is validated by npm run verify:operator",
        "Stage 4 live API preflight is validated by npm run verify:operator:dry-run",
        "Stage 4 Operator runtime boundary is validated by npm run verify:operator:runtime",
        "Live OCP connectivity is classified by npm run verify:ocp:connectivity",
        "Stage 4 OCP network/SRE handoff is generated by npm run evidence:ocp-network-handoff",
        "Stage 4 OCP handoff API fallback proof is generated by npm run verify:ocp:handoff-api-fallback",
        "Stage 4 OCP auth/RBAC approval packet is generated by npm run evidence:ocp-auth-rbac-plan",
        "Stage 4 mutating install approval plan is generated by npm run verify:install-plan",
        "Stage 4 live evidence handoff is generated by npm run verify:live-handoff",
        "Stage 4 reconcile core validates ValidateOnly and explicit PatchOLSConfig through npm run verify:operator:reconcile",
        "Stage 5 catalog and certification readiness draft is validated by npm run verify:certification",
        "Stage 5 Community Operator submission draft is validated by npm run verify:community-submission",
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
        "RAG production ingestion handoff is generated by npm run verify:rag:production-readiness",
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
