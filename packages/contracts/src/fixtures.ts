import type {
  AcceptanceCriterion,
  AssistantAnswer,
  ConsoleContextPayload,
  DashboardRisksResponse,
  KnowledgeSourceHealth,
  ModelHealth,
  OpsLensCitation,
  OpsLensToolDefinition,
  RecentChange,
  RiskItem
} from "./types";

export const mockContext: ConsoleContextPayload = {
  clusterId: "prod-ocp",
  user: "sre.kim@example.com",
  route: "/monitoring/alerts?state=firing&source=platform",
  perspective: "Administrator",
  namespace: "openshift-cluster-version",
  resource: {
    apiVersion: "config.openshift.io/v1",
    kind: "ClusterVersion",
    name: "version",
    uid: "mock-cv-9f71"
  },
  selectedTab: "Alerts",
  filters: {
    source: "platform",
    state: "firing",
    severity: "critical,warning"
  },
  visibleRows: [
    {
      alert: "ClusterNotUpgradeable",
      severity: "critical",
      count: 1,
      status: "firing"
    },
    {
      alert: "KubePodCrashLooping",
      severity: "warning",
      count: 4,
      status: "firing"
    },
    {
      alert: "NodeFilesystemSpaceFillingUp",
      severity: "warning",
      count: 2,
      status: "watching"
    }
  ],
  attachedEvidence: [
    "alert-list-snapshot",
    "selected-alert-details",
    "cluster-version-summary"
  ],
  rbac: {
    role: "cluster-admin",
    deniedNamespaces: []
  }
};

export const contextChips = [
  { label: "Cluster", value: "prod-ocp" },
  { label: "Namespace", value: "openshift-cluster-version" },
  { label: "Page", value: "Alerts" },
  { label: "Filters", value: "source=platform, state=firing" },
  { label: "Attached", value: "3 evidence items" },
  { label: "RBAC", value: "cluster-admin" }
];

export const activeRisks: RiskItem[] = [
  {
    id: "cluster-not-upgradeable",
    title: "ClusterNotUpgradeable",
    severity: "critical",
    status: "firing",
    count: 1,
    affected: "ClusterVersion/version",
    duration: "47m",
    blastRadius: 96,
    evidenceRefs: ["alert-list-snapshot", "cluster-version-summary"]
  },
  {
    id: "pod-crashloop",
    title: "KubePodCrashLooping",
    severity: "warning",
    status: "firing",
    count: 4,
    affected: "payments/api",
    duration: "18m",
    blastRadius: 61,
    evidenceRefs: ["pod-log-tail", "pod-events"]
  },
  {
    id: "node-disk-pressure",
    title: "NodeFilesystemSpaceFillingUp",
    severity: "warning",
    status: "watching",
    count: 2,
    affected: "worker-a, worker-c",
    duration: "2h",
    blastRadius: 44,
    evidenceRefs: ["node-metrics-summary"]
  }
];

export const recentChanges: RecentChange[] = [
  {
    id: "sync-214",
    kind: "gitops-sync",
    summary: "Argo CD synced cluster-version overlays",
    namespace: "openshift-gitops",
    age: "22m",
    riskLink: "cluster-not-upgradeable"
  },
  {
    id: "rollout-904",
    kind: "rollout",
    summary: "payments/api rolled out image sha256:91be",
    namespace: "payments",
    age: "31m",
    riskLink: "pod-crashloop"
  },
  {
    id: "config-771",
    kind: "config",
    summary: "Ingress certificate bundle refreshed",
    namespace: "openshift-ingress",
    age: "1h"
  }
];

export const knowledgeSources: KnowledgeSourceHealth[] = [
  {
    id: "ocp-update-docs",
    name: "OpenShift update troubleshooting docs",
    type: "official-doc",
    freshness: "fresh",
    owner: "red-hat",
    lastIndexedAt: "2026-06-12T03:40:00Z",
    citationRate: 0.94
  },
  {
    id: "platform-upgrade-runbook",
    name: "Platform upgrade runbook",
    type: "internal-runbook",
    freshness: "fresh",
    owner: "platform-sre",
    lastIndexedAt: "2026-06-12T02:15:00Z",
    citationRate: 0.88
  },
  {
    id: "legacy-image-pull-runbook",
    name: "Legacy image pull checklist",
    type: "internal-runbook",
    freshness: "stale",
    owner: "app-platform",
    lastIndexedAt: "2025-11-03T09:00:00Z",
    citationRate: 0.51
  }
];

export const modelHealth: ModelHealth = {
  provider: "local-search-mode",
  route: "triage",
  latencyMs: 420,
  tokenBudgetRemaining: 200000,
  fallback: "ready"
};

export const assistantAnswer: AssistantAnswer = {
  scenario: "ClusterNotUpgradeable",
  judgment:
    "ClusterVersion is reporting an upgrade block. The current evidence supports a guarded triage path, not a final root-cause claim.",
  inspectedEvidence: [
    {
      id: "alert-list-snapshot",
      label: "Firing alert row: ClusterNotUpgradeable",
      type: "cluster",
      trustLevel: "cluster-snapshot"
    },
    {
      id: "cluster-version-summary",
      label: "ClusterVersion/version condition summary",
      type: "cluster",
      trustLevel: "cluster-snapshot"
    },
    {
      id: "ocp-update-docs",
      label: "OpenShift update troubleshooting docs",
      type: "official-doc",
      trustLevel: "official"
    },
    {
      id: "platform-upgrade-runbook",
      label: "Platform upgrade runbook",
      type: "internal-runbook",
      trustLevel: "approved"
    }
  ],
  candidates: [
    {
      label: "Operator condition is blocking version progression",
      confidence: "medium",
      reason:
        "The selected alert is tied to ClusterVersion and the visible dashboard shows active platform alerts.",
      evidenceIds: ["alert-list-snapshot", "cluster-version-summary"]
    },
    {
      label: "Recent GitOps sync changed upgrade-related configuration",
      confidence: "low",
      reason:
        "A correlated sync exists, but the exact diff has not been attached yet.",
      evidenceIds: ["alert-list-snapshot"]
    }
  ],
  nextChecks: [
    "oc get clusterversion version -o yaml",
    "oc get clusteroperators",
    "oc describe clusterversion version",
    "oc get events -A --sort-by=.lastTimestamp | tail -40"
  ],
  plan: [
    "Collect ClusterVersion conditions and degraded operator list.",
    "Compare alert start time with recent GitOps sync and rollout history.",
    "Draft a rollback plan only after the blocking operator and changed object are confirmed."
  ],
  risks: [
    "Forcing upgrade progression can hide an operator-level failure.",
    "Rollback is environment-specific and must be checked against internal upgrade policy.",
    "The GitOps diff is not attached, so change correlation remains unproven."
  ],
  rollbackPath: [
    "Pause further upgrade actions.",
    "Revert only the confirmed GitOps change through the normal review path.",
    "Re-check ClusterVersion and clusteroperators before resuming."
  ],
  citations: [
    {
      id: "ocp-update-docs",
      label: "OpenShift update troubleshooting docs",
      type: "official-doc",
      trustLevel: "official"
    },
    {
      id: "platform-upgrade-runbook",
      label: "Platform upgrade runbook",
      type: "internal-runbook",
      trustLevel: "approved"
    }
  ],
  missingEvidence: [
    "Exact ClusterVersion condition message",
    "Recent GitOps diff",
    "ClusterOperator degraded condition details"
  ],
  actionMode: "readOnly"
};

export const acceptanceCriteria: AcceptanceCriterion[] = [
  {
    id: "AC-UI-001",
    area: "UI",
    pass:
      "Alerts page shows severity, count, and status while the assistant popover is open.",
    method: "Playwright visibility and bounding-box non-overlap check",
    evidence: "test-results screenshot",
    currentGap: "Mock console only; real ConsolePlugin route is Phase 1."
  },
  {
    id: "AC-UI-002",
    area: "UI",
    pass:
      "Assistant starts as a lower-right launcher, opens as a popover, closes from the popover, and does not resize the console workspace.",
    method: "Playwright launcher/popover state and workspace bounding-box assertions",
    evidence: "assistant-launcher, assistant-popover, aria-expanded",
    currentGap: "Prototype-local until implemented as an OpenShift ConsolePlugin."
  },
  {
    id: "AC-CTX-001",
    area: "Context",
    pass: "Route, namespace, resource, filters, and visible rows are captured.",
    method: "Payload snapshot assertion",
    evidence: "Rendered context payload JSON",
    currentGap: "Payload is fixture-backed until Console context publisher exists."
  },
  {
    id: "AC-ANS-001",
    area: "RAG",
    pass:
      "Answer includes judgment, inspected evidence, citations, missing evidence, risks, and rollback path.",
    method: "Fixture contract and DOM assertions",
    evidence: "Assistant answer blocks",
    currentGap: "Answer is fixture-backed; generation and citation verification are Phase 1."
  },
  {
    id: "AC-SAFE-001",
    area: "Safety",
    pass: "Only L0 explain, L1 read, and L2 plan content appears.",
    method: "Answer action mode and command review",
    evidence: "actionMode=readOnly",
    currentGap: "Policy enforcement API is Phase 1."
  }
];

export const opsLensMcpTools: OpsLensToolDefinition[] = [
  {
    name: "get_cluster_signal",
    title: "Get cluster signal",
    description:
      "Read-only summary of alerts, namespace health, workload status, events, and relevant console links.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        namespace: { type: "string" },
        workload: { type: "string" },
        intent: { type: "string" },
        alertName: { type: "string" }
      }
    }
  },
  {
    name: "retrieve_customer_knowledge",
    title: "Retrieve customer knowledge",
    description:
      "Search Cywell private RAG for approved customer runbooks without returning raw documents.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        namespace: { type: "string" },
        question: { type: "string" },
        intent: { type: "string" },
        constraints: {
          type: "object",
          properties: {
            readOnly: { type: "boolean" },
            includeCustomerRunbooks: { type: "boolean" },
            maxDocuments: { type: "number" }
          }
        }
      }
    }
  },
  {
    name: "generate_playbook",
    title: "Generate playbook",
    description:
      "Generate a read-only incident playbook grounded in cluster evidence and approved customer runbooks.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        namespace: { type: "string" },
        workload: { type: "string" },
        question: { type: "string" },
        intent: { type: "string" },
        alertName: { type: "string" }
      }
    }
  },
  {
    name: "open_console_deep_link",
    title: "Open console deep link",
    description:
      "Build OpenShift console links for the namespace, workload, events, logs, and OpsLens dashboard.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        namespace: { type: "string" },
        workload: { type: "string" },
        intent: { type: "string" }
      }
    }
  },
  {
    name: "run_preflight",
    title: "Run installation preflight",
    description:
      "Read-only preflight checks for OpsLens MCP, private RAG, ConsolePlugin, and Operator packaging.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        intent: { type: "string" }
      }
    }
  },
  {
    name: "propose_remediation",
    title: "Propose remediation",
    description:
      "Generate a plan-only remediation proposal. It does not apply, delete, scale, or mutate resources.",
    readOnly: true,
    approvalRequired: false,
    inputSchema: {
      type: "object",
      required: ["clusterId", "tenantId", "intent"],
      properties: {
        clusterId: { type: "string" },
        tenantId: { type: "string" },
        namespace: { type: "string" },
        workload: { type: "string" },
        intent: { type: "string" }
      }
    }
  }
];

export const opsLensCustomerCitations: OpsLensCitation[] = [
  {
    id: "customer-runbook:payments-api-crashloop",
    label: "Payments API Pod 장애 대응 매뉴얼",
    sourceType: "customer-runbook",
    trustLevel: "approved",
    snippet:
      "CrashLoopBackOff 발생 시 최근 rollout, 필수 환경변수, Secret key 존재 여부, readiness probe 실패 원인을 순서대로 확인한다.",
    redacted: true
  },
  {
    id: "customer-runbook:payments-api-rollback",
    label: "Payments API 안전 롤백 절차",
    sourceType: "customer-runbook",
    trustLevel: "approved",
    snippet:
      "원인 확정 전 자동 롤백 금지. 정상 revision, 영향 범위, DB migration 여부를 확인한 뒤 승인된 GitOps 경로로 되돌린다.",
    redacted: true
  },
  {
    id: "cluster-snapshot:payments-api-events",
    label: "payments namespace pod events/log signal",
    sourceType: "cluster-snapshot",
    trustLevel: "cluster-snapshot",
    snippet:
      "최근 이벤트와 로그 tail은 설정 누락 또는 probe 실패 가능성을 우선 점검해야 함을 가리킨다.",
    redacted: true
  }
];

export const mockDashboardResponse: DashboardRisksResponse = {
  generatedAt: "2026-06-12T04:00:00.000Z",
  source: "mock-backend",
  activeRisks,
  recentChanges,
  knowledgeSources,
  modelHealth
};
