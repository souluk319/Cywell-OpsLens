export type Severity = "critical" | "warning" | "info" | "success";

export type SourceType =
  | "cluster"
  | "official-doc"
  | "internal-runbook"
  | "gitops"
  | "evaluation";

export interface ContextChip {
  label: string;
  value: string;
  removable?: boolean;
}

export interface ConsoleContextPayload {
  clusterId: string;
  user: string;
  route: string;
  perspective: "Administrator" | "Developer";
  namespace: string;
  resource?: {
    apiVersion: string;
    kind: string;
    name: string;
    uid: string;
  };
  selectedTab: string;
  filters: Record<string, string>;
  visibleRows: Array<Record<string, string | number>>;
  attachedEvidence: string[];
  rbac: {
    role: string;
    deniedNamespaces: string[];
  };
}

export interface RiskItem {
  id: string;
  title: string;
  severity: Severity;
  status: "firing" | "investigating" | "watching";
  count: number;
  affected: string;
  duration: string;
  blastRadius: number;
  evidenceRefs: string[];
}

export interface RecentChange {
  id: string;
  kind: "rollout" | "gitops-sync" | "image" | "config";
  summary: string;
  namespace: string;
  age: string;
  riskLink?: string;
}

export interface KnowledgeSourceHealth {
  id: string;
  name: string;
  type: SourceType;
  freshness: "fresh" | "stale" | "missing";
  owner: string;
  lastIndexedAt: string;
  citationRate: number;
}

export interface ModelHealth {
  provider: string;
  route: string;
  latencyMs: number;
  tokenBudgetRemaining: number;
  fallback: "ready" | "active" | "unconfigured";
}

export interface EvidenceSource {
  id: string;
  label: string;
  type: SourceType;
  trustLevel: "official" | "approved" | "cluster-snapshot" | "draft";
  stale?: boolean;
}

export interface CauseCandidate {
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  evidenceIds: string[];
}

export interface AssistantAnswer {
  scenario: string;
  judgment: string;
  inspectedEvidence: EvidenceSource[];
  candidates: CauseCandidate[];
  nextChecks: string[];
  plan: string[];
  risks: string[];
  rollbackPath: string[];
  citations: EvidenceSource[];
  missingEvidence: string[];
  actionMode: "readOnly" | "planOnly";
}

export interface AcceptanceCriterion {
  id: string;
  area: "UI" | "Context" | "Safety" | "RAG" | "Audit" | "Evaluation";
  pass: string;
  method: string;
  evidence: string;
  currentGap: string;
}

export interface DashboardRisksResponse {
  generatedAt: string;
  source: "mock-backend" | "cluster-readonly";
  activeRisks: RiskItem[];
  recentChanges: RecentChange[];
  knowledgeSources: KnowledgeSourceHealth[];
  modelHealth: ModelHealth;
}

export interface ContextSyncRequest {
  context: ConsoleContextPayload;
}

export interface ContextSyncResponse {
  accepted: boolean;
  requestId: string;
  receivedAt: string;
  contextHash: string;
  context: ConsoleContextPayload;
  contextChips: ContextChip[];
  redactionCount: number;
  rbac: {
    role: string;
    namespaceScope: string;
    deniedNamespaces: string[];
  };
}

export interface ActionPlanRequest {
  prompt: string;
  context: ConsoleContextPayload;
  scenario?: string;
}

export interface AuditEnvelope {
  requestId: string;
  user: string;
  groups: string[];
  clusterId: string;
  namespaceScope: string;
  contextHash: string;
  sources: string[];
  model: string;
  tokenUsage: {
    input: number;
    output: number;
  };
  latencyMs: number;
  redactionCount: number;
  actionMode: "readOnly" | "planOnly";
}

export interface ActionPlanResponse {
  requestId: string;
  answer: AssistantAnswer;
  audit: AuditEnvelope;
}

export type OpsLensToolName =
  | "get_cluster_signal"
  | "retrieve_customer_knowledge"
  | "generate_playbook"
  | "open_console_deep_link"
  | "run_preflight"
  | "propose_remediation";

export interface OpsLensToolDefinition {
  name: OpsLensToolName;
  title: string;
  description: string;
  readOnly: true;
  approvalRequired: false;
  inputSchema: {
    type: "object";
    required: string[];
    properties: Record<string, unknown>;
  };
}

export type OpsLensMcpToolCategory =
  | "cluster-signal"
  | "private-rag"
  | "playbook"
  | "console-navigation"
  | "preflight"
  | "plan-only-remediation";

export interface OpsLensMcpToolSurfaceItem {
  name: OpsLensToolName;
  title: string;
  category: OpsLensMcpToolCategory;
  actionMode: "readOnly" | "planOnly";
  readOnly: true;
  approvalRequired: false;
  destructive: false;
  dashboardSurface:
    | "lightspeed-assistant"
    | "ops-lens-dashboard"
    | "openshift-console"
    | "install-readiness";
  evidence: string[];
}

export interface OpsLensLightspeedToolSurface {
  mcpTechnologyPreview: true;
  endpoint: "/mcp";
  localEndpoint: "/api/opslens/mcp";
  toolCount: number;
  readOnlyCount: number;
  mutatingToolExcluded: true;
  excludedTools: string[];
  routing: {
    status: "pass" | "needs-evidence" | "failed";
    artifactStatus: string;
    selectedPasses: number;
    responsePasses: number;
    total: number;
    threshold: number;
    headSha: string;
    worktreeDirty: boolean;
    evidence: string[];
    missingEvidence: string[];
  };
  trojanHorse: {
    status: "pass" | "needs-evidence" | "failed";
    artifactStatus: string;
    question: string;
    selectedTool: string;
    citationCount: number;
    redactionPassed: boolean;
    mutationAllowed: boolean;
    rawDocumentReturned: boolean;
    clusterMutationAttempted: boolean;
    vectorWriteAttempted: boolean;
    headSha: string;
    worktreeDirty: boolean;
    evidence: string[];
    missingEvidence: string[];
  };
  tools: OpsLensMcpToolSurfaceItem[];
  evidence: string[];
}

export interface OpsLensToolRequest {
  tool: OpsLensToolName;
  input: {
    clusterId: string;
    tenantId: string;
    namespace?: string;
    workload?: string;
    question?: string;
    intent: string;
    alertName?: string;
    constraints?: {
      readOnly?: boolean;
      includeCustomerRunbooks?: boolean;
      maxDocuments?: number;
    };
  };
  caller?: {
    user?: string;
    groups?: string[];
    source?: "lightspeed" | "console-plugin" | "api";
  };
}

export interface OpsLensCitation {
  id: string;
  label: string;
  sourceType: "customer-runbook" | "cluster-snapshot" | "official-doc";
  trustLevel: "approved" | "cluster-snapshot" | "official";
  snippet: string;
  redacted: boolean;
}

export type OpsLensRuntimeRagMode = "local" | "hybrid" | "runtime";

export type OpsLensRuntimeRagStatus =
  | "disabled"
  | "ready"
  | "needs-live-check"
  | "failed";

export interface OpsLensRuntimeRagAudit {
  mode: OpsLensRuntimeRagMode;
  status: OpsLensRuntimeRagStatus;
  provider: {
    vectorStore: "qdrant";
    modelRuntime: "vllm";
  };
  collection: string;
  embeddingModel: string;
  retrievalAttempted: boolean;
  embeddingAttempted: boolean;
  vectorSearchAttempted: boolean;
  localFallbackUsed: boolean;
  citationsUsed: "runtime" | "local-fallback";
  latencyMs: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface OpsLensRemediationProposal {
  artifactType: "opslens.remediation.proposal.v0.1";
  actionMode: "planOnly";
  mutationAllowed: false;
  patchType: "strategicMerge";
  target: {
    apiVersion: string;
    kind: string;
    namespace: string;
    name: string;
    container: string;
    fieldPath: string;
    confidence: "high" | "medium" | "low";
  };
  currentValue: {
    value: string;
    source: "cluster-observed" | "runbook-baseline" | "unknown";
    observedInCluster: boolean;
    evidence: string[];
  };
  proposedValue: {
    value: string;
    source: "runbook-recommendation" | "candidate-remediation";
    evidence: string[];
  };
  yamlPatch: string;
  rationale: string[];
  evidence: string[];
  missingEvidence: string[];
  risks: string[];
  rollbackPath: string[];
  forbiddenActions: Array<"apply" | "delete" | "scale">;
  reviewGate: {
    required: true;
    approvers: string[];
    evidence: string[];
  };
}

export interface OpsLensToolResponse {
  tool: OpsLensToolName;
  requestId: string;
  generatedAt: string;
  actionMode: "readOnly" | "planOnly";
  summary: string;
  suspectedCauses: string[];
  recommendedSteps: string[];
  proposedYamlPatch?: string;
  remediationProposal?: OpsLensRemediationProposal;
  citations: OpsLensCitation[];
  missingEvidence: string[];
  risks: string[];
  rollbackPath: string[];
  consoleLinks: string[];
  evidence: string[];
  policy: {
    privateRag: true;
    serverSideRedaction: true;
    rawDocumentReturned: false;
    mcpTechnologyPreview: true;
    mutationAllowed: false;
  };
  audit: {
    tenantId: string;
    clusterId: string;
    namespace?: string;
    user?: string;
    sources: string[];
    model: string;
    runtimeRag: OpsLensRuntimeRagAudit;
    redactionCount: number;
    latencyMs: number;
  };
}

export interface OpsLensIncidentAlertInput {
  name: string;
  severity?: Severity;
  namespace?: string;
  workload?: string;
  startsAt?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  resource?: {
    apiVersion?: string;
    kind?: string;
    resource?: string;
    name: string;
    namespace?: string;
  };
}

export interface OpsLensIncidentAnalysisRequest {
  clusterId: string;
  tenantId: string;
  alert: OpsLensIncidentAlertInput;
  question?: string;
  windowMinutes?: number;
  evidenceHints?: {
    podName?: string;
    container?: string;
    labelSelector?: string;
    fieldSelector?: string;
    tailLines?: number;
  };
  caller?: OpsLensToolRequest["caller"];
}

export interface OpsLensIncidentResourceEvidence {
  resource: OcpApiResource;
  item: OcpResourceSummary;
  fallback?: OcpResourceVersionFallback;
  accessEvidence: string[];
  sensitiveFieldRedactionCount: number;
}

export interface OpsLensIncidentLogEvidence {
  namespace: string;
  pod: string;
  container?: string;
  previous: boolean;
  tailLines: number;
  sinceSeconds: number;
  logs: string;
  truncated: boolean;
  redacted: true;
  redactionCount: number;
  accessEvidence: string[];
}

export interface OpsLensIncidentEventEvidence {
  target: OcpEventsResponse["target"];
  items: OcpEventSummary[];
  redacted: true;
  redactionCount: number;
  accessEvidence: string[];
}

export interface OpsLensIncidentMetricQueryEvidence {
  name: string;
  query: string;
  enabled: boolean;
  reachable: boolean;
  resultType?: string;
  sample: OcpPrometheusSample[];
  error?: string;
  evidence: string[];
}

export interface OpsLensIncidentMetricEvidence {
  enabled: boolean;
  reachable: boolean;
  windowMinutes: number;
  redacted: true;
  queries: OpsLensIncidentMetricQueryEvidence[];
  evidence: string[];
}

export interface OpsLensIncidentAnalysisResponse {
  requestId: string;
  generatedAt: string;
  actionMode: "planOnly";
  clusterId: string;
  tenantId: string;
  alert: OpsLensIncidentAlertInput;
  timeWindow: {
    minutes: number;
    since: string;
    until: string;
  };
  resource?: OpsLensIncidentResourceEvidence;
  podCandidates: OcpResourceSummary[];
  podLogs?: OpsLensIncidentLogEvidence;
  previousPodLogs?: OpsLensIncidentLogEvidence;
  events?: OpsLensIncidentEventEvidence;
  metrics?: OpsLensIncidentMetricEvidence;
  analysis: OpsLensToolResponse;
  missingEvidence: string[];
  evidence: string[];
  errors: Array<{
    source: string;
    message: string;
  }>;
  policy: {
    readOnly: true;
    planOnly: true;
    mutationAllowed: false;
    secretFetchBlocked: true;
    rawDocumentReturned: false;
    serverSideRedaction: true;
    logWindowMinutes: number;
    maxLogTailLines: number;
    monitoringProxyEnabled: boolean;
  };
  audit: {
    tenantId: string;
    clusterId: string;
    namespace?: string;
    user?: string;
    ocpReads: string[];
    redactionCount: number;
    latencyMs: number;
  };
}

export interface OpsLensRagDocumentStatus {
  id: string;
  tenantId: string;
  label: string;
  sourceType: "customer-runbook" | "official-doc" | "cluster-snapshot";
  trustLevel: "approved" | "official" | "cluster-snapshot" | "draft";
  status: "indexed" | "stale" | "validation-required";
  lastIndexedAt: string;
  chunkCount: number;
  citationRate: number;
  redacted: boolean;
  evidence: string[];
}

export interface OpsLensRagValidationRequest {
  tenantId: string;
  fileName: string;
  markdown: string;
}

export interface OpsLensRagEvidenceExportRequest extends OpsLensRagValidationRequest {
  requestedBy?: string;
  reason?: string;
}

export interface OpsLensRagValidationIssue {
  severity: "pass" | "warn" | "fail";
  code: string;
  message: string;
  evidence: string[];
}

export interface OpsLensRagValidationResponse {
  actionMode: "validateOnly";
  accepted: boolean;
  redactionCount: number;
  document?: {
    id: string;
    tenantId: string;
    label: string;
    sourceType: "customer-runbook" | "official-doc" | "cluster-snapshot";
    trustLevel: "approved" | "official" | "cluster-snapshot" | "draft";
    relativePath: string;
    chunkCount: number;
    redacted: true;
  };
  chunks: Array<{
    id: string;
    ordinal: number;
    snippet: string;
    tokenCount: number;
    redacted: true;
  }>;
  issues: OpsLensRagValidationIssue[];
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

export interface OpsLensRagEvidenceExportResponse {
  artifactType: "opslens.rag.validation-evidence.v0.1";
  artifactVersion: "0.1";
  exportId: string;
  generatedAt: string;
  tenantId: string;
  fileName: string;
  actionMode: "validateOnly";
  validation: OpsLensRagValidationResponse;
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
    sourceIndexVersion: "local-vector-v0.1";
    sourceDocumentCount: number;
    sourceChunkCount: number;
  };
  policy: OpsLensRagValidationResponse["policy"] & {
    evidenceExportAllowed: true;
    approvalQueueMutationAllowed: false;
  };
}

export interface OpsLensRagApprovalQueueSubmitRequest extends OpsLensRagEvidenceExportRequest {
  requestedBy: string;
  reason: string;
  ticketRef?: string;
}

export interface OpsLensRagApprovalQueueSubmissionResponse {
  artifactType: "opslens.rag.approval-queue-submission.v0.2";
  artifactVersion: "0.2";
  generatedAt: string;
  queueItemId: string;
  tenantId: string;
  fileName: string;
  actionMode: "approvalQueueOnly";
  state:
    | "design-only"
    | "pending-human-approval"
    | "rejected-before-approval"
    | "approved-for-ingestion"
    | "rejected-by-reviewer";
  validation: OpsLensRagValidationResponse;
  evidenceExport: {
    artifactType: OpsLensRagEvidenceExportResponse["artifactType"];
    exportId: string;
    validationHash: string;
  };
  content: {
    markdownReturned: false;
    documentBodyReturned: false;
    chunksRedacted: true;
    rawMarkdownPersisted: false;
    vectorWriteAttempted: false;
  };
  approvalQueue: {
    mode: "designOnly" | "persistentLocal";
    enqueueAllowed: boolean;
    persisted: boolean;
    storagePath?: string;
    requiredApprovals: string[];
    approvals: Array<{
      approver: string;
      role: string;
      approvedAt: string;
    }>;
    blockers: string[];
    evidence: string[];
  };
  audit: {
    requestedBy: string;
    reason: string;
    ticketRef?: string;
    validationHash: string;
    sourceIndexVersion: "local-vector-v0.1";
    sourceDocumentCount: number;
    sourceChunkCount: number;
  };
  policy: OpsLensRagValidationResponse["policy"] & {
    evidenceExportAllowed: true;
    queuePersistenceAllowed: boolean;
    vectorWriteAllowed: false;
    clusterMutationAllowed: false;
  };
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
}

export type OpsLensRagApprovalQueueReviewDecision = "approve" | "reject";

export interface OpsLensRagApprovalQueueReviewRequest {
  tenantId: string;
  queueItemId: string;
  reviewer: string;
  role: string;
  decision: OpsLensRagApprovalQueueReviewDecision;
  reason: string;
  ticketRef?: string;
}

export interface OpsLensRagApprovalQueueReviewResponse {
  artifactType: "opslens.rag.approval-queue-review.v0.1";
  artifactVersion: "0.1";
  generatedAt: string;
  queueItemId: string;
  tenantId: string;
  fileName: string;
  actionMode: "approvalReviewOnly";
  decision: OpsLensRagApprovalQueueReviewDecision;
  previousState: OpsLensRagApprovalQueueSubmissionResponse["state"];
  state: OpsLensRagApprovalQueueSubmissionResponse["state"];
  reviewer: {
    reviewer: string;
    role: string;
    reviewedAt: string;
    reason: string;
    ticketRef?: string;
  };
  approvalQueue: {
    mode: "persistentLocal";
    persisted: true;
    requiredApprovals: string[];
    approvals: OpsLensRagApprovalQueueSubmissionResponse["approvalQueue"]["approvals"];
    remainingApprovals: string[];
    blockers: string[];
    evidence: string[];
  };
  content: {
    markdownReturned: false;
    documentBodyReturned: false;
    chunksReturned: false;
    rawMarkdownPersisted: false;
    vectorWriteAttempted: false;
    ingestionJobCreated: false;
  };
  policy: {
    reviewAllowed: true;
    queueMetadataWriteAllowed: true;
    rawDocumentReturned: false;
    rawMarkdownPersisted: false;
    vectorWriteAllowed: false;
    clusterMutationAllowed: false;
    ingestionAllowed: false;
  };
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
}

export interface OpsLensRagApprovalQueueIngestionPlanRequest {
  tenantId: string;
  queueItemId: string;
  requestedBy: string;
  reason: string;
  ticketRef?: string;
}

export interface OpsLensRagApprovalQueueIngestionPlanResponse {
  artifactType: "opslens.rag.ingestion-plan.v0.1";
  artifactVersion: "0.1";
  generatedAt: string;
  queueItemId: string;
  tenantId: string;
  fileName: string;
  actionMode: "ingestionPlanOnly";
  sourceState: OpsLensRagApprovalQueueSubmissionResponse["state"];
  approvedForIngestion: boolean;
  document?: {
    id: string;
    tenantId: string;
    label: string;
    sourceType: "customer-runbook" | "official-doc" | "cluster-snapshot";
    trustLevel: "approved" | "official" | "cluster-snapshot" | "draft";
    relativePath: string;
    chunkCount: number;
    redacted: true;
  };
  plannedJob: {
    status: "blocked" | "ready-for-ingestion-job";
    jobName: string;
    targetIndexVersion: "local-vector-v0.1";
    chunkCount: number;
    requiredApprovals: string[];
    approvals: OpsLensRagApprovalQueueSubmissionResponse["approvalQueue"]["approvals"];
    preflightChecks: Array<{
      id: string;
      command: string;
      mutation: false;
      required: true;
    }>;
    mutatingSteps: Array<{
      id: string;
      description: string;
      requiresExplicitApproval: true;
      mutationAllowedByThisPlanner: false;
    }>;
  };
  content: {
    markdownReturned: false;
    documentBodyReturned: false;
    chunksReturned: false;
    rawMarkdownPersisted: false;
    vectorWriteAttempted: false;
    ingestionJobCreated: false;
  };
  audit: {
    requestedBy: string;
    reason: string;
    ticketRef?: string;
    validationHash: string;
    approvalCount: number;
  };
  policy: {
    planOnly: true;
    queueReadAllowed: true;
    queueMetadataWriteAllowed: false;
    rawDocumentReturned: false;
    rawMarkdownPersisted: false;
    vectorWriteAllowed: false;
    clusterMutationAllowed: false;
    ingestionAllowed: false;
    requiresExplicitApproval: true;
  };
  evidence: string[];
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensRagApprovalQueueInventoryItem {
  queueItemId: string;
  generatedAt: string;
  tenantId: string;
  fileName: string;
  state: OpsLensRagApprovalQueueSubmissionResponse["state"];
  validationAccepted: boolean;
  redactionCount: number;
  chunkCount: number;
  requiredApprovals: string[];
  approvals: OpsLensRagApprovalQueueSubmissionResponse["approvalQueue"]["approvals"];
  blockers: string[];
  missingEvidence: string[];
  audit: {
    requestedBy: string;
    ticketRef?: string;
    validationHash: string;
  };
  content: {
    markdownReturned: false;
    documentBodyReturned: false;
    chunksReturned: false;
    rawMarkdownPersisted: false;
    vectorWriteAttempted: false;
  };
  evidence: string[];
}

export interface OpsLensRagApprovalQueueInventoryResponse {
  artifactType: "opslens.rag.approval-queue-inventory.v0.2";
  artifactVersion: "0.2";
  generatedAt: string;
  actionMode: "approvalQueueReadOnly";
  mode: "designOnly" | "persistentLocal";
  queuePersistenceEnabled: boolean;
  itemCount: number;
  items: OpsLensRagApprovalQueueInventoryItem[];
  policy: {
    readOnly: true;
    rawMarkdownReturned: false;
    documentBodyReturned: false;
    chunksReturned: false;
    vectorWriteAllowed: false;
    clusterMutationAllowed: false;
    approvalMutationAllowed: false;
  };
  evidence: string[];
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensTokenRouteUsage {
  route: "lightspeed-mcp" | "incident-analysis" | "admin-dashboard" | "rag-indexing";
  requests: number;
  inputTokens: number;
  outputTokens: number;
  p95LatencyMs: number;
}

export interface OpsLensTokenUsageSummary {
  window: "24h";
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  warningThresholdTokens: number;
  routes: OpsLensTokenRouteUsage[];
}

export interface OpsLensGpuRuntimeSample {
  timestamp: string;
  utilizationPercent: number;
  memoryUsedGiB: number;
  memoryTotalGiB: number;
}

export type OpsLensRuntimeReadinessStatus =
  | "ready"
  | "needs-live-check"
  | "degraded"
  | "failed";

export interface OpsLensRuntimeDependencyReadiness {
  component: "vector-store" | "model-runtime";
  provider: "qdrant" | "vllm";
  endpoint: string;
  probePath: string;
  status: OpsLensRuntimeReadinessStatus;
  liveProbeEnabled: boolean;
  latencyMs?: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface OpsLensRuntimeReadiness {
  status: OpsLensRuntimeReadinessStatus;
  actionMode: "readOnly";
  mutationAllowed: false;
  rawDocumentReturned: false;
  vectorStore: OpsLensRuntimeDependencyReadiness;
  modelRuntime: OpsLensRuntimeDependencyReadiness;
  evidence: string[];
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensRuntimeHealth {
  provider: "vllm" | "mock-local";
  model: string;
  route: string;
  replicas: number;
  readyReplicas: number;
  readiness: OpsLensRuntimeReadiness;
  gpu: {
    available: boolean;
    deviceClass: string;
    samples: OpsLensGpuRuntimeSample[];
  };
}

export interface OpsLensAdminMetricQueryStatus {
  name: string;
  query: string;
  status: "ready" | "missing" | "disabled";
  sampleCount: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface OpsLensAdminIncidentMetricSummary {
  incidentId: string;
  alertName: string;
  namespace: string;
  workload: string;
  actionMode: "planOnly";
  metricQueries: OpsLensAdminMetricQueryStatus[];
  remediationProposal?: OpsLensRemediationProposal;
  lastAnalyzedAt: string;
}

export type OpsLensLightspeedMcpReadiness =
  | "ready"
  | "needs-live-check"
  | "needs-configuration"
  | "failed";

export type OpsLensImageBuildReadiness =
  | "ready"
  | "needs-evidence"
  | "failed";

export type OpsLensOwnedImageProvenanceReadiness =
  | "ready"
  | "needs-evidence"
  | "failed";

export type OpsLensExternalRuntimeReadiness =
  | "approval-required"
  | "needs-evidence"
  | "failed";

export type OpsLensExternalRuntimeReviewPacketReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensOperatorDryRunReadiness =
  | "ready"
  | "partial"
  | "needs-evidence"
  | "failed";

export type OpsLensOcpConnectivityReadiness =
  | "ready"
  | "needs-evidence"
  | "failed";

export type OpsLensInstallPlanReadiness =
  | "approval-required"
  | "needs-evidence"
  | "failed";

export type OpsLensReleasePublishReadiness =
  | "approval-required"
  | "needs-evidence"
  | "failed";

export type OpsLensCatalogToolchainReadiness =
  | "ready-for-dry-run"
  | "needs-tooling"
  | "needs-evidence"
  | "failed";

export type OpsLensSecurityScanReadiness =
  | "ready-for-scan"
  | "needs-tooling"
  | "needs-evidence"
  | "failed";

export type OpsLensCertificationReadiness =
  | "ready-for-review"
  | "needs-tooling"
  | "needs-evidence"
  | "failed";

export type OpsLensReleaseEvidenceRefreshReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensReleaseEvidenceBundleReadiness =
  | "approval-ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensReleaseActionQueueReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensEvidenceCheckpointReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensLiveEvidenceHandoffReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export type OpsLensOcpNetworkHandoffReadiness =
  | "ready"
  | "needs-evidence"
  | "blocked";

export interface OpsLensEvidenceCheckpointSummary {
  status: OpsLensEvidenceCheckpointReadiness;
  artifactStatus: string;
  headSha: string;
  worktreeDirty: boolean;
  lanes: Array<{
    id: string;
    label: string;
    status: "pass" | "needs-evidence" | "blocked";
    artifactStatus: string;
  }>;
  missingEvidence: string[];
  blockers: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensLiveEvidenceHandoffSummary {
  status: OpsLensLiveEvidenceHandoffReadiness;
  artifactStatus: string;
  actionMode: "handoffOnly";
  currentGapClassification: string;
  clusterMutationAttempted: boolean;
  registryMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  readOnlyCommands: Array<{
    id: string;
    command: string;
    purpose: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
    writesEvidence: boolean;
  }>;
  actionHints: Array<{
    id: string;
    severity: "info" | "warning" | "blocked";
    summary: string;
    nextCheck: string;
  }>;
  forbiddenCommands: string[];
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensOcpNetworkHandoffSummary {
  status: OpsLensOcpNetworkHandoffReadiness;
  artifactStatus: string;
  actionMode: "handoffOnly";
  classification: string;
  clusterMutationAttempted: boolean;
  registryMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  target: {
    host: string;
    port: number | string;
    redactedBaseUrl: string;
    tokenConfigured: boolean;
    tlsVerify: boolean;
  };
  markdownPath: string;
  adminRequests: string[];
  readOnlyCommands: Array<{
    id: string;
    command: string;
    purpose: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
    writesEvidence: boolean;
  }>;
  sourceArtifacts: Array<{
    id: string;
    label: string;
    status: string;
    fresh: boolean;
    required: boolean;
    headSha: string;
    worktreeDirty: boolean | string;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensOcpConnectivityDiagnosticSummary {
  status: OpsLensOcpConnectivityReadiness;
  artifactStatus: string;
  actionMode: "readOnly";
  classification: string;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  target: {
    host: string;
    port: number | string;
    redactedBaseUrl: string;
    tokenConfigured: boolean;
    tlsVerify: boolean;
  };
  diagnostics: {
    dns: string;
    tcp: string;
    tls: string;
    kubernetesVersion: string;
    oc: string;
  };
  actionHints: Array<{
    id: string;
    severity: "info" | "warning" | "blocked";
    summary: string;
    evidence: string;
    nextCheck: string;
  }>;
  readOnlyTroubleshootingCommands: Array<{
    id: string;
    command: string;
    purpose: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
    writesEvidence: boolean;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensCatalogToolchainSummary {
  status: OpsLensCatalogToolchainReadiness;
  artifactStatus: string;
  actionMode: "toolchainPlanOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  registryAuthConfigured: boolean;
  cli: Array<{
    name: string;
    available: boolean;
    version: string;
  }>;
  readOnlyCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
  }>;
  setupCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    requiresHumanSecretInput: boolean;
    mutation: boolean;
  }>;
  localArtifactCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensSecurityScanPlanSummary {
  status: OpsLensSecurityScanReadiness;
  artifactStatus: string;
  actionMode: "scanPlanOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  cli: Array<{
    name: string;
    available: boolean;
    version: string;
  }>;
  images: Array<{
    name: string;
    image: string;
    required: boolean;
    source: string;
    vulnerabilityReportExists: boolean;
    sbomExists: boolean;
    reviewExists: boolean;
  }>;
  readOnlyCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
    writesLocalEvidence: boolean;
  }>;
  setupCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
  }>;
  approvalGatedCommands: Array<{
    id: string;
    command: string;
    phase: string;
    requiresNetwork: boolean;
    mutation: boolean;
    requiresExplicitApproval: boolean;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensCertificationReadinessSummary {
  status: OpsLensCertificationReadiness;
  artifactStatus: string;
  actionMode: "certificationReadinessOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  headSha: string;
  worktreeDirty: boolean;
  cli: Array<{
    name: string;
    available: boolean;
    version: string;
    requiredForExternalSubmission: boolean;
  }>;
  documents: Record<string, string>;
  gateCounts: {
    internalCatalog: {
      pass: number;
      warn: number;
      fail: number;
      total: number;
    };
    communityOperator: {
      pass: number;
      warn: number;
      fail: number;
      total: number;
    };
    certifiedOperator: {
      pass: number;
      warn: number;
      fail: number;
      total: number;
    };
  };
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensReleaseEvidenceRefreshSummary {
  status: OpsLensReleaseEvidenceRefreshReadiness;
  artifactStatus: string;
  actionMode: "localEvidenceRefresh";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  localDockerBuildAllowed: boolean;
  headSha: string;
  worktreeDirty: boolean;
  commands: Array<{
    id: string;
    phase: string;
    status: string;
    exitCode: number | null;
    expectedNonZero: boolean;
  }>;
  artifacts: Array<{
    id: string;
    status: string;
    fresh: boolean;
    headSha: string;
    worktreeDirty: boolean | string;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensReleaseEvidenceBundleSummary {
  status: OpsLensReleaseEvidenceBundleReadiness;
  artifactStatus: string;
  actionMode: "bundleOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  headSha: string;
  worktreeDirty: boolean;
  decision: {
    publishReady: boolean;
    installReady: boolean;
    roadmapComplete: boolean;
    checkpointStatus: string;
    releaseStatus: string;
    installStatus: string;
    roadmapStatus: string;
  };
  approvals: Record<string, string[]>;
  sourceArtifacts: Array<{
    id: string;
    status: string;
    fresh: boolean;
    acceptable: boolean;
    mutationViolation: boolean;
  }>;
  commandCounts: {
    readOnly: number;
    mutatingApprovalRequired: number;
  };
  mutationBoundaryPassed: boolean;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensReleaseActionQueueSummary {
  status: OpsLensReleaseActionQueueReadiness;
  artifactStatus: string;
  actionMode: "actionQueueOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  headSha: string;
  worktreeDirty: boolean;
  owners: Array<{
    owner: string;
    open: number;
    blocker: number;
    high: number;
    normal: number;
  }>;
  items: Array<{
    id: string;
    owner: string;
    priority: "blocker" | "high" | "normal";
    source: string;
    request: string;
    evidenceNeeded: string;
    nextCommand: string;
  }>;
  sourceArtifacts: Array<{
    id: string;
    status: string;
    fresh: boolean;
    required: boolean;
    mutationViolation: boolean;
  }>;
  commandCounts: {
    readOnly: number;
    approvalGated: number;
  };
  mutationBoundaryPassed: boolean;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensRagIngestionApprovalPlanSummary {
  actionMode: "ingestionPlanOnly";
  status: "ready-for-ingestion-job" | "needs-evidence" | "failed";
  queueEvidenceStatus: string;
  approvedPlanStatus: string;
  clusterMutationAttempted: boolean;
  vectorWriteAttempted: boolean;
  ingestionJobCreated: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredApprovals: string[];
  mutatingCommands: Array<{
    id: string;
    phase: string;
    requiresExplicitApproval: boolean;
  }>;
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
}

export interface OpsLensInstallApprovalPlanSummary {
  status: OpsLensInstallPlanReadiness;
  actionMode: "approvalPlanOnly";
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredApprovals: string[];
  mutatingCommands: Array<{
    id: string;
    phase: string;
    requiresExplicitApproval: boolean;
  }>;
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
  ragIngestion: OpsLensRagIngestionApprovalPlanSummary;
}

export interface OpsLensReleasePublishPlanSummary {
  status: OpsLensReleasePublishReadiness;
  actionMode: "approvalPlanOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredApprovals: string[];
  publishImages: Array<{
    name: string;
    image: string;
    source: string;
  }>;
  mutatingCommands: Array<{
    id: string;
    phase: string;
    requiresExplicitApproval: boolean;
  }>;
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
}

export interface OpsLensOwnedImageProvenanceSummary {
  status: OpsLensOwnedImageProvenanceReadiness;
  artifactStatus: string;
  actionMode: "readOnlyEvidenceOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredImages: string[];
  images: Array<{
    name: string;
    image: string;
    localTag: string;
    status: string;
    imageId: string;
    repoDigests: string[];
    user: string;
    rootfsLayerCount: number;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensExternalRuntimeImagesPlanSummary {
  status: OpsLensExternalRuntimeReadiness;
  actionMode: "approvalPlanOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredApprovals: string[];
  externalImages: Array<{
    name: string;
    image: string;
    sourceType: string;
    desiredMirror: string;
    status: string;
    draftStatus: string;
    draftMissingEvidenceCount: number;
  }>;
  evidenceTemplates: Array<{
    name: string;
    templatePath: string;
    status: string;
  }>;
  evidenceDrafts: Array<{
    name: string;
    draftFile: string;
    status: string;
    evidenceState: string;
    missingEvidence: string[];
  }>;
  mutatingCommands: Array<{
    id: string;
    phase: string;
    requiresExplicitApproval: boolean;
  }>;
  risk: string[];
  rollbackPath: string[];
  missingEvidence: string[];
}

export interface OpsLensExternalRuntimeReviewPacketSummary {
  status: OpsLensExternalRuntimeReviewPacketReadiness;
  artifactStatus: string;
  actionMode: "reviewPacketOnly";
  registryMutationAttempted: boolean;
  clusterMutationAttempted: boolean;
  mutationAllowedByThisVerifier: boolean;
  requiredApprovals: string[];
  markdownPath: string;
  images: Array<{
    name: string;
    image: string;
    sourceDigest: string;
    sourceDigestInspectionStatus: string;
    draftStatus: string;
    evidenceState: string;
    finalEvidenceExists: boolean;
    reviewerRequests: Array<{
      role: string;
      request: string;
      evidenceNeeded: string;
    }>;
    missingEvidenceCount: number;
  }>;
  readOnlyCommands: Array<{
    id: string;
    phase: string;
    mutation: boolean;
    writesLocalEvidence: boolean;
  }>;
  approvalGatedCommands: Array<{
    id: string;
    phase: string;
    mutation: boolean;
    requiresExplicitApproval: boolean;
  }>;
  missingEvidence: string[];
  risk: string[];
  rollbackPath: string[];
}

export interface OpsLensAdminOverviewResponse {
  generatedAt: string;
  source: "local-contract";
  lightspeed: {
    mcp: OpsLensLightspeedToolSurface;
  };
  rag: {
    tenants: number;
    documents: OpsLensRagDocumentStatus[];
    uploadIntake: {
      mode: "validate-only";
      pending: number;
      rejected: number;
      evidence: string[];
    };
  };
  tokenUsage: OpsLensTokenUsageSummary;
  runtime: OpsLensRuntimeHealth;
  incidents: OpsLensAdminIncidentMetricSummary[];
  installReadiness: {
    lightspeedMcp: OpsLensLightspeedMcpReadiness;
    consoleDashboard: "prototype" | "ready";
    operatorPackaging: "not-started" | "draft" | "ready";
    ocpConnectivity: OpsLensOcpConnectivityReadiness;
    connectivity: OpsLensOcpConnectivityDiagnosticSummary;
    operatorDryRun: OpsLensOperatorDryRunReadiness;
    installPlan: OpsLensInstallPlanReadiness;
    approvalPlan: OpsLensInstallApprovalPlanSummary;
    catalogToolchain: OpsLensCatalogToolchainReadiness;
    catalogToolchainPlan: OpsLensCatalogToolchainSummary;
    imageBuilds: OpsLensImageBuildReadiness;
    ownedImageProvenance: OpsLensOwnedImageProvenanceReadiness;
    ownedImageProvenancePlan: OpsLensOwnedImageProvenanceSummary;
    externalRuntimeImages: OpsLensExternalRuntimeReadiness;
    externalRuntimePlan: OpsLensExternalRuntimeImagesPlanSummary;
    externalRuntimeReviewPacket: OpsLensExternalRuntimeReviewPacketReadiness;
    externalRuntimeReview: OpsLensExternalRuntimeReviewPacketSummary;
    securityScan: OpsLensSecurityScanReadiness;
    securityScanPlan: OpsLensSecurityScanPlanSummary;
    certificationReadiness: OpsLensCertificationReadiness;
    certificationPlan: OpsLensCertificationReadinessSummary;
    releasePublish: OpsLensReleasePublishReadiness;
    releasePlan: OpsLensReleasePublishPlanSummary;
    releaseRefresh: OpsLensReleaseEvidenceRefreshReadiness;
    refresh: OpsLensReleaseEvidenceRefreshSummary;
    releaseEvidenceBundle: OpsLensReleaseEvidenceBundleReadiness;
    bundle: OpsLensReleaseEvidenceBundleSummary;
    releaseActionQueue: OpsLensReleaseActionQueueReadiness;
    actionQueue: OpsLensReleaseActionQueueSummary;
    evidenceCheckpoint: OpsLensEvidenceCheckpointReadiness;
    checkpoint: OpsLensEvidenceCheckpointSummary;
    liveHandoff: OpsLensLiveEvidenceHandoffReadiness;
    handoff: OpsLensLiveEvidenceHandoffSummary;
    ocpNetworkHandoff: OpsLensOcpNetworkHandoffReadiness;
    networkHandoff: OpsLensOcpNetworkHandoffSummary;
    certification: "not-started" | "draft" | "ready";
    evidence: string[];
  };
  policy: {
    dashboardOnly: true;
    mutationAllowed: false;
    rawDocumentReturned: false;
    uploadApplyAllowed: false;
  };
}

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface OcpConnectionStatus {
  configured: boolean;
  reachable: boolean;
  baseUrl?: string;
  tlsVerify: boolean;
  gitVersion?: string;
  platform?: string;
  userName?: string;
  discoveredResourceCount?: number;
  error?: string;
}

export interface OcpApiResource {
  group: string;
  version: string;
  apiVersion: string;
  name: string;
  kind: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
  preferred: boolean;
  safeToList: boolean;
}

export interface OcpApiResourcesResponse {
  status: OcpConnectionStatus;
  resources: OcpApiResource[];
  errors: Array<{
    apiVersion: string;
    message: string;
  }>;
}

export interface OcpResourceAccessReview {
  verb: string;
  allowed: boolean;
  denied?: boolean;
  reason?: string;
  evaluationError?: string;
  namespace?: string;
  name?: string;
  resourceAttributes: {
    group: string;
    version: string;
    resource: string;
    subresource?: string;
  };
  evidence: string[];
}

export interface OcpResourceAccessReviewResponse {
  status: OcpConnectionStatus;
  resource: OcpApiResource;
  access: OcpResourceAccessReview;
}

export interface OcpResourceReadAccess {
  list?: OcpResourceAccessReview;
  get?: OcpResourceAccessReview;
  watch?: OcpResourceAccessReview;
}

export interface OcpResourceAccessMatrixResponse {
  status: OcpConnectionStatus;
  resource: OcpApiResource;
  namespace?: string;
  name?: string;
  access: OcpResourceReadAccess;
}

export interface OcpOwnerReferenceSummary {
  apiVersion: string;
  kind: string;
  name: string;
  uid?: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

export interface OcpResourceSummary {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OcpOwnerReferenceSummary[];
  };
  type?: string;
  status?: unknown;
  spec?: unknown;
  dataRedacted?: boolean;
}

export interface OcpRelatedResourceSummary {
  resource: OcpApiResource;
  item: OcpResourceSummary;
}

export interface OcpRelatedResourcesResponse {
  status: OcpConnectionStatus;
  target: {
    apiVersion?: string;
    kind?: string;
    resource?: string;
    namespace?: string;
    name: string;
    uid?: string;
  };
  owners: OcpOwnerReferenceSummary[];
  children: OcpRelatedResourceSummary[];
  evidence: string[];
  errors: Array<{
    resource: string;
    message: string;
  }>;
}

export interface OcpResourceVersionFallback {
  requestedApiVersion: string;
  servedApiVersion: string;
  reason: string;
  evidence: string[];
}

export interface OcpResourceListResponse {
  status: OcpConnectionStatus;
  resource: OcpApiResource;
  namespace?: string;
  fallback?: OcpResourceVersionFallback;
  selectors?: {
    labelSelector?: string;
    fieldSelector?: string;
  };
  items: OcpResourceSummary[];
  continueToken?: string;
  access: OcpResourceReadAccess;
  redaction: {
    secretDataRedacted: boolean;
    fullSecretFetchBlocked: boolean;
  };
}

export type OcpCoverageListStatus =
  | "listed"
  | "empty"
  | "denied"
  | "blocked"
  | "unsupported"
  | "skipped"
  | "error";

export type OcpCoverageDetailStatus =
  | "read"
  | "empty"
  | "denied"
  | "unsupported"
  | "skipped"
  | "error";

export type OcpCoverageGapType =
  | "none"
  | "not-probed"
  | "policy-blocked"
  | "list-unsupported"
  | "rbac-denied"
  | "empty"
  | "cluster-api-error"
  | "conversion-webhook-error"
  | "timeout"
  | "unknown-error";

export interface OcpCoverageGap {
  type: OcpCoverageGapType;
  severity: "info" | "warning" | "critical";
  retryable: boolean;
  message: string;
  evidence: string[];
}

export interface OcpResourceCoverageEntry {
  resource: OcpApiResource;
  scope: "cluster" | "all-namespaces" | "namespace";
  namespace?: string;
  list: {
    status: OcpCoverageListStatus;
    access?: OcpResourceAccessReview;
    sampleItemCount: number;
    continuesAfterSample: boolean;
    error?: string;
  };
  detail: {
    status: OcpCoverageDetailStatus;
    access?: OcpResourceAccessReview;
    sampleName?: string;
    sampleNamespace?: string;
    redactionCount?: number;
    error?: string;
  };
  gap: OcpCoverageGap;
  evidence: string[];
}

export interface OcpCoverageMatrixResponse {
  status: OcpConnectionStatus;
  generatedAt: string;
  probe: {
    requestedMaxResources?: number;
    includeDetails: boolean;
    namespace?: string;
  };
  totals: {
    discovered: number;
    safeToList: number;
    probed: number;
    listed: number;
    empty: number;
    denied: number;
    blocked: number;
    unsupported: number;
    skipped: number;
    error: number;
    detailRead: number;
    gapTypes: Record<OcpCoverageGapType, number>;
  };
  resources: OcpResourceCoverageEntry[];
  evidence: string[];
}

export type OcpDiagnosticFindingStatus =
  | "ok"
  | "warning"
  | "critical"
  | "missing"
  | "skipped"
  | "error";

export interface OcpDiagnosticFinding {
  id: string;
  label: string;
  status: OcpDiagnosticFindingStatus;
  message: string;
  evidence: string[];
  data?: unknown;
}

export interface OcpCoverageDiagnosticResponse {
  status: OcpConnectionStatus;
  generatedAt: string;
  resource: OcpApiResource;
  namespace?: string;
  coverage: OcpResourceCoverageEntry;
  findings: OcpDiagnosticFinding[];
  nextChecks: string[];
  risks: string[];
  rollbackPath: string[];
  evidence: string[];
}

export interface OcpResourceDetailResponse {
  status: OcpConnectionStatus;
  resource: OcpApiResource;
  namespace?: string;
  name: string;
  fallback?: OcpResourceVersionFallback;
  item: OcpResourceSummary;
  raw: unknown;
  access: OcpResourceReadAccess;
  redaction: {
    secretDataRedacted: boolean;
    fullSecretFetchBlocked: boolean;
    sensitiveFieldRedactionCount: number;
  };
}

export interface OcpPodLogsResponse {
  status: OcpConnectionStatus;
  namespace: string;
  pod: string;
  container?: string;
  previous: boolean;
  tailLines: number;
  sinceSeconds?: number;
  logs: string;
  truncated: boolean;
  access: OcpResourceAccessReview;
}

export interface OcpEventSummary {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  reason?: string;
  type?: string;
  message?: string;
  source?: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  count?: number;
  regarding?: {
    apiVersion?: string;
    kind?: string;
    name?: string;
    namespace?: string;
    uid?: string;
  };
}

export interface OcpEventsResponse {
  status: OcpConnectionStatus;
  target: {
    apiVersion?: string;
    kind?: string;
    name: string;
    namespace?: string;
    uid?: string;
  };
  items: OcpEventSummary[];
  access: OcpResourceAccessReview;
}

export interface OcpPrometheusSample {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
}

export interface OcpPrometheusQueryResponse {
  status: OcpConnectionStatus;
  enabled: boolean;
  reachable: boolean;
  query: string;
  range?: {
    start: string;
    end: string;
    stepSeconds: number;
  };
  resultType?: string;
  results: OcpPrometheusSample[];
  warnings: string[];
  evidence: string[];
  error?: string;
}

export interface OcpConditionSummary {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface OcpConsoleOverviewResponse {
  status: OcpConnectionStatus;
  generatedAt: string;
  cluster: {
    version?: string;
    desiredVersion?: string;
    channel?: string;
    conditions: OcpConditionSummary[];
  };
  operators: {
    total: number;
    degraded: number;
    progressing: number;
    unavailable: number;
    degradedItems: Array<{
      name: string;
      conditions: OcpConditionSummary[];
    }>;
  };
  nodes: {
    total: number;
    ready: number;
    notReady: number;
    items: Array<{
      name: string;
      ready: boolean;
      roles: string[];
      kubeletVersion?: string;
    }>;
  };
  workloads: {
    namespaces: number;
    pods: {
      total: number;
      running: number;
      pending: number;
      failed: number;
      crashLooping: number;
    };
    deployments: {
      total: number;
      unavailable: number;
    };
  };
  networking: {
    routes: number;
    ingresses: number;
    services: number;
  };
  supplyChain: {
    builds: number;
    failedBuilds: number;
    imageStreams: number;
  };
  monitoring: {
    reachable: boolean;
    firingAlerts: number;
    warningAlerts: number;
    criticalAlerts: number;
    sample: Array<{
      alertname: string;
      severity?: string;
      namespace?: string;
      state?: string;
    }>;
    error?: string;
  };
  evidence: string[];
}
