import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  OpsLensAdminOverviewResponse,
  OpsLensRagApprovalQueueIngestionPlanResponse,
  OpsLensRagApprovalQueueInventoryResponse,
  OpsLensRagApprovalQueueReviewResponse,
  OpsLensRagApprovalQueueSubmissionResponse,
  OpsLensRagEvidenceExportResponse,
  OpsLensRuntimeLiveHandoffAction,
  OpsLensRagValidationResponse
} from "@kugnus/contracts";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  DatabaseZap,
  Download,
  FileDiff,
  Gauge,
  KeyRound,
  ListChecks,
  ShieldCheck,
  UploadCloud,
  XCircle
} from "lucide-react";
import {
  exportOpsLensRagEvidence,
  fetchOpsLensAdminOverview,
  fetchOpsLensRagApprovalQueue,
  planOpsLensRagIngestion,
  reviewOpsLensRagApprovalQueue,
  submitOpsLensRagApprovalQueue,
  validateOpsLensRagDocument
} from "../lib/api";
import type { UiLanguage } from "../i18n";

const sampleDraftRunbook = `---
id: customer-runbook:payments-timeout-triage
label: Payments Timeout Triage
sourceType: customer-runbook
trustLevel: draft
---

# Payments Timeout Triage

결제 승인 지연이 감지되면 최근 10분의 API latency, gateway error rate, egress policy change, readiness probe 상태를 함께 확인한다.

1. Secret 원문은 조회하지 않고 key reference와 mount 상태만 확인한다.
2. payment authorization success rate가 하락했는지 확인한다.
3. 자동 rollback은 하지 않고 GitOps pull request로만 변경한다.`;

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "--";
}

function percentText(value: number | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "--";
}

function booleanText(language: UiLanguage, value: unknown) {
  if (typeof value !== "boolean") return "--";
  if (language === "ko") return value ? "예" : "아니오";
  return value ? "yes" : "no";
}

function statusText(language: UiLanguage, status: string | undefined) {
  if (!status) return language === "ko" ? "근거 필요" : "needs evidence";
  const normalizedStatus = status.trim();
  const normalizedKey = normalizedStatus.replace(/_/g, "-").toLowerCase();

  const labels: Record<UiLanguage, Record<string, string>> = {
    en: {
      "needs-evidence": "needs evidence",
      "needs-configuration": "needs configuration",
      "needs-live-evidence": "needs live evidence",
      "needs-live-check": "needs live check",
      "approval-required": "approval required",
      "ready-for-live-registration-review": "ready for live registration review",
      "ready-for-handoff": "ready for handoff",
      "live-ready": "live ready",
      "api-ready": "API ready",
      "not-configured": "not configured",
      "auth-failed": "authentication failed",
      "auth-or-rbac": "auth/RBAC review",
      "token-missing": "token missing",
      "tls-handshake-failed": "TLS handshake failed",
      "tcp-timeout": "TCP timeout",
      "tcp-unreachable": "TCP unreachable",
      "dns-unresolved": "DNS unresolved",
      "api-unreachable": "API unreachable",
      ready: "ready",
      missing: "missing",
      unknown: "unknown",
      pass: "pass",
      warn: "warn",
      fail: "fail",
      planned: "planned",
      none: "none"
    },
    ko: {
      "needs-evidence": "근거 필요",
      "needs-configuration": "설정 필요",
      "needs-live-evidence": "실시간 근거 필요",
      "needs-live-check": "실시간 확인 필요",
      "approval-required": "승인 필요",
      "ready-for-live-registration-review": "실시간 등록 검토 준비",
      "ready-for-handoff": "인계 준비",
      "live-ready": "실시간 준비 완료",
      "api-ready": "API 준비 완료",
      "not-configured": "설정 없음",
      "auth-failed": "인증 실패",
      "auth-or-rbac": "인증/RBAC 검토",
      "token-missing": "토큰 없음",
      "tls-handshake-failed": "TLS 핸드셰이크 실패",
      "tcp-timeout": "TCP 시간 초과",
      "tcp-unreachable": "TCP 연결 불가",
      "dns-unresolved": "DNS 해석 실패",
      "api-unreachable": "API 연결 불가",
      ready: "준비됨",
      missing: "누락",
      unknown: "알 수 없음",
      pass: "통과",
      warn: "주의",
      fail: "실패",
      planned: "계획됨",
      none: "없음"
    }
  };

  return (
    labels[language][normalizedStatus] ??
    labels[language][normalizedKey] ??
    status
  );
}

function actionModeText(language: UiLanguage, mode: string | undefined) {
  if (!mode) return "--";
  const labels: Record<UiLanguage, Record<string, string>> = {
    en: {
      readOnly: "read-only",
      readOnlyEvidenceOnly: "read-only evidence",
      planOnly: "plan-only",
      handoffOnly: "handoff only",
      designOnly: "design-only",
      DesignOnly: "design-only",
      ValidateOnly: "validate-only",
      PatchOLSConfig: "patch OLSConfig"
    },
    ko: {
      readOnly: "읽기 전용",
      readOnlyEvidenceOnly: "읽기 전용 근거",
      planOnly: "계획 전용",
      handoffOnly: "인계 전용",
      designOnly: "설계 전용",
      DesignOnly: "설계 전용",
      ValidateOnly: "검증 전용",
      PatchOLSConfig: "OLSConfig 패치"
    }
  };
  return labels[language][mode] ?? mode;
}

function statusClass(status: string) {
  if (
    status === "indexed" ||
    status === "ready" ||
    status === "ready-for-ingestion-job" ||
    status === "ready-for-dry-run" ||
    status === "ready-for-remote-prep" ||
    status === "ready-for-handoff" ||
    status === "ready-for-review" ||
    status === "ready-for-scan" ||
    status === "ready-for-live-registration-review" ||
    status === "live-ready" ||
    status === "mvp-locked" ||
    status === "mvp" ||
    status === "active"
  ) {
    return "fresh";
  }
  if (
    status === "stale" ||
    status === "missing" ||
    status === "needs-live-check" ||
    status === "needs-live-evidence" ||
    status === "needs-configuration" ||
    status === "needs-evidence" ||
    status === "partial" ||
    status === "approval-required" ||
    status === "needs-tooling" ||
    status === "needs-image-ref-mapping" ||
    status === "needs-lab-machine" ||
    status === "needs-ocp-live" ||
    status === "needs-local-artifacts" ||
    status === "needs-current-evidence" ||
    status === "needs-local-package" ||
    status === "needs-crc-target" ||
    status === "needs-install-preview" ||
    status === "planned"
  ) {
    return "stale";
  }
  return "missing";
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function runtimeEvidenceTicketText(
  action: OpsLensRuntimeLiveHandoffAction,
  language: UiLanguage,
  copy: Record<string, string>
) {
  const ticket = action.runtimeEvidenceTicketPacket;
  if (!ticket) return copy.runtimeEvidenceTicketMissing;
  return [
    ticket.id,
    `${copy.owner}: ${ticket.owner}`,
    `${copy.firstAction}: ${ticket.firstReadOnlyAction.id}`,
    `${copy.approvalAction}: ${ticket.approvalGatedAction.id}`,
    `${copy.requiresApproval}: ${booleanText(
      language,
      ticket.approvalGatedAction.requiresExplicitApproval
    )}`,
    `${copy.mutationAllowed}: ${booleanText(
      language,
      ticket.mutationBoundary.mutationAllowedByThisVerifier
    )}`,
    `${copy.liveProbe} ${copy.approvalRequired}: ${booleanText(
      language,
      ticket.mutationBoundary.liveProbeRequiresExplicitApproval
    )}`
  ].join(" / ");
}

const adminCopy = {
  en: {
    adminTitle: "Admin Dashboard",
    docs: "docs",
    tokens: "tokens",
    opsBrainTitle: "No fine-tuning growth system",
    fineTuningRequired: "fine-tuning required",
    writePolicy: "write policy",
    goldenSet: "golden set",
    nextImplementation: "next implementation",
    groundedTarget: "grounded target",
    dangerousExecTarget: "dangerous exec target",
    repeatReuse: "repeat reuse",
    evalBeforePromotion: "eval before promotion",
    routingPlanned: "routing planned",
    externalProviderDefault: "external provider default",
    rawMemoryWrite: "raw memory write",
    vectorWrite: "vector write",
    graphWrite: "graph write",
    reviewerRequired: "reviewer required",
    fineTuning: "fine-tuning",
    policyMutation: "policy mutation",
    nightlyLoop: "nightly loop",
    growthLoop: "Growth Loop",
    steps: "steps",
    memoryTiers: "Memory Tiers",
    tiers: "tiers",
    riskGate: "Risk Gate",
    evaluator: "Evaluator",
    systemModules: "System Modules",
    modules: "modules",
    growthGovernance: "Growth Governance",
    modelStrategy: "Model Strategy",
    acceptance: "Acceptance",
    gates: "gates",
    memoryWriteGuard: "Memory Write Guard",
    selfImprover: "Self-Improver",
    requiredKeys: "Required Keys And Tokens",
    valuesRedacted: "values redacted",
    ragDocuments: "RAG Documents",
    readyReplicas: "ready",
    memory: "memory",
    owner: "owner",
    priority: "priority",
    runtimeOwner: "runtime owner",
    dataOwner: "data/ML owner",
    liveProbe: "live probe",
    pgvector: "pgvector",
    vllm: "vLLM",
    runtimeLiveHandoffClear: "runtime live handoff clear",
    runtimeEvidenceTicketsClear: "runtime evidence tickets clear",
    runtimeEvidenceTicketMissing: "runtime evidence ticket missing",
    runtimeLiveEvidenceMissing: "runtime live evidence handoff missing",
    writesLocalEvidence: "writes local evidence",
    mutationByVerifier: "mutation allowed by verifier",
    contractReady: "contract ready",
    queueLive: "queue live",
    workerLive: "worker live",
    vectorAudit: "vector audit",
    rawMarkdown: "raw markdown",
    auditAppendOnly: "audit append-only",
    approvals: "approvals",
    queueMetadataWrite: "queue metadata write",
    approved: "approved",
    validateUploadIntake: "Validate upload intake",
    document: "Document",
    status: "Status",
    chunks: "Chunks",
    citation: "Citation",
    tenant: "Tenant",
    file: "File",
    ragDocumentMarkdown: "RAG document markdown",
    validating: "Validating",
    validate: "Validate",
    exporting: "Exporting",
    exportEvidence: "Export Evidence",
    queueing: "Queueing",
    queueEvidence: "Queue Evidence",
    pending: "pending",
    rejected: "rejected",
    queued: "queued",
    approveQueuedEvidence: "Approve queued RAG evidence",
    rejectQueuedEvidence: "Reject queued RAG evidence",
    planRagIngestionJob: "Plan RAG ingestion job",
    tokenUsage: "Token Usage",
    lightspeedMcpTools: "Lightspeed MCP Tools",
    tools: "tools",
    endpoint: "endpoint",
    readOnlyTools: "read-only tools",
    blockedTool: "blocked tool",
    routingScore: "routing score",
    routingStatus: "routing status",
    responseScore: "response score",
    threshold: "threshold",
    head: "head",
    trojanHorseCheck: "Trojan horse check",
    selectedTool: "selected tool",
    citations: "citations",
    redaction: "redaction",
    mutationAllowed: "mutation allowed",
    handoffMode: "handoff mode",
    handoffStatus: "handoff status",
    artifact: "artifact",
    liveReadiness: "live readiness",
    network: "network",
    templateReady: "template ready",
    clusterMutationAttempted: "cluster mutation attempted",
    approvalGated: "approval-gated",
    readOnlyCommands: "read-only commands",
    gatedCommands: "gated commands",
    nextCommand: "next command",
    toolMode: "mode",
    category: "category",
    dashboardSurface: "surface",
    incidentMetrics: "Incident Metrics",
    liveSmoke: "live smoke",
    selectedPod: "selected pod",
    monitoringProxy: "Monitoring Proxy",
    enabled: "enabled",
    reachable: "reachable",
    approvalRequired: "approval required",
    missingQueries: "missing queries",
    ticket: "ticket",
    firstAction: "first action",
    approvalAction: "approval action",
    requiresApproval: "requires approval",
    alertmanager: "Alertmanager",
    acceptedAlerts: "accepted alerts",
    rawAlertReturned: "raw alert returned",
    vectorWriteAttempted: "vector write attempted",
    ingestionJobCreated: "ingestion job created",
    triggerEvidence: "trigger evidence",
    metricSamples: "samples",
    patch: "patch",
    current: "current",
    proposed: "proposed",
    reviewGate: "review gate",
    targetConfidence: "target confidence",
    logs: "logs",
    events: "events",
    metrics: "metrics",
    runbooks: "runbooks",
    installReadiness: "Install Readiness",
    lightspeedMcp: "Lightspeed MCP",
    environment: "environment",
    extensionPoint: "extension point",
    aiOpsPipeline: "AI Ops pipeline",
    consoleDashboard: "console dashboard",
    operator: "operator",
    ocpConnectivity: "OCP connectivity",
    operatorPackage: "operator package",
    operatorDryRun: "operator dry-run",
    operatorBoundary: "operator boundary",
    installPlan: "install plan",
    ragIngestion: "RAG ingestion",
    certificationEvidence: "certification evidence",
    communitySubmission: "community submission",
    catalogToolchain: "catalog toolchain",
    labBootstrap: "lab bootstrap",
    labHandoff: "lab handoff",
    imageBuilds: "image builds",
    ownedProvenance: "owned provenance",
    externalRuntime: "external runtime",
    runtimeReview: "runtime review",
    securityScan: "security scan",
    releasePublish: "release publish",
    releaseRefresh: "release refresh",
    releaseBundle: "release bundle",
    releaseAction: "release action",
    roadmapCompletion: "roadmap completion",
    completionGate: "completion gate",
    preClusterGate: "pre-cluster gate",
    evidenceCheckpoint: "evidence checkpoint",
    liveHandoff: "live handoff",
    networkHandoff: "network handoff",
    handoffFallback: "handoff fallback",
    authRbacPlan: "auth/RBAC plan",
    certification: "certification",
    complete: "complete",
    passed: "passed",
    remaining: "remaining",
    external: "external",
    local: "local",
    blockers: "blockers",
    currentGap: "current gap",
    smoke: "smoke",
    assistantMutationAllowed: "assistant mutation allowed",
    registryMutationAttempted: "registry mutation attempted",
    context: "context",
    auth: "auth",
    server: "server",
    kubeconfigEnv: "Kubeconfig env",
    defaultKubeconfig: "default Kubeconfig",
    diagnosis: "diagnosis",
    humanApproval: "human approval",
    tokenRedacted: "token redacted",
    storedByVerifier: "stored by verifier",
    packet: "packet",
    exists: "exists",
    required: "required",
    severity: "severity",
    nextCheck: "next check",
    classification: "classification",
    target: "target",
    api: "API",
    authBoundary: "auth boundary",
    tlsVerify: "TLS verify",
    localFormatIssue: "local format issue",
    source: "source",
    lengthClass: "length class",
    networkFirstActions: "network first actions",
    sourceArtifacts: "source artifacts",
    fresh: "fresh",
    adminAsk: "admin ask",
    rbacReviewsMissing: "RBAC reviews missing",
    networkFirstActionsMissing: "network first actions missing",
    caseCount: "case count",
    failedChecks: "failed checks",
    namespace: "namespace",
    reader: "reader",
    clusterRole: "ClusterRole",
    policy: "policy",
    rules: "rules",
    secretsIncluded: "secrets included",
    rbac: "RBAC",
    unknown: "unknown",
    lightspeedAuthReady: "Lightspeed auth ready",
    actionHints: "action hints",
    postApprovalSmoke: "post-approval smoke",
    forbidden: "forbidden",
    blockedUntilHandoffExists: "blocked until handoff exists",
    dirty: "dirty",
    readyToClaim100: "ready to claim 100%",
    completionGates: "gates",
    failedRequirements: "failed requirements",
    failedSources: "failed sources",
    closure: "closure",
    criticalPath: "critical path",
    cleanupDeletionAllowed: "cleanup deletion allowed",
    bundleStatus: "bundle status",
    bundleMatchesRoadmap: "bundle matches roadmap",
    publishReady: "publish ready",
    installReady: "install ready",
    actionQueueReady: "action queue ready",
    unsafeTickets: "unsafe tickets",
    setupCommands: "setup commands",
    requiredImages: "required images",
    localInspect: "local inspect",
    remainingEvidence: "remaining evidence",
    evidenceGaps: "gaps",
    blockedUntilEvidenceExists: "blocked until evidence exists",
    none: "none"
  },
  ko: {
    adminTitle: "관리 대시보드",
    docs: "문서",
    tokens: "토큰",
    opsBrainTitle: "파인튜닝 없는 성장 시스템",
    fineTuningRequired: "파인튜닝 필요",
    writePolicy: "쓰기 정책",
    goldenSet: "골든셋",
    nextImplementation: "다음 구현",
    groundedTarget: "근거 기반 목표",
    dangerousExecTarget: "위험 실행 목표",
    repeatReuse: "반복 사례 재사용",
    evalBeforePromotion: "승격 전 평가",
    routingPlanned: "라우팅 계획",
    externalProviderDefault: "외부 제공자 기본값",
    rawMemoryWrite: "원본 메모리 쓰기",
    vectorWrite: "벡터 쓰기",
    graphWrite: "그래프 쓰기",
    reviewerRequired: "검토자 필요",
    fineTuning: "파인튜닝",
    policyMutation: "정책 변경",
    nightlyLoop: "야간 루프",
    growthLoop: "성장 루프",
    steps: "단계",
    memoryTiers: "메모리 계층",
    tiers: "계층",
    riskGate: "위험 게이트",
    evaluator: "평가기",
    systemModules: "시스템 모듈",
    modules: "모듈",
    growthGovernance: "성장 거버넌스",
    modelStrategy: "모델 전략",
    acceptance: "완료 기준",
    gates: "게이트",
    memoryWriteGuard: "메모리 쓰기 가드",
    selfImprover: "자가 개선기",
    requiredKeys: "필요 키와 토큰",
    valuesRedacted: "값은 비공개",
    ragDocuments: "RAG 문서",
    readyReplicas: "준비 수",
    memory: "메모리",
    owner: "소유자",
    priority: "우선순위",
    runtimeOwner: "런타임 소유자",
    dataOwner: "데이터/ML 소유자",
    liveProbe: "실시간 점검",
    pgvector: "pgvector",
    vllm: "vLLM",
    runtimeLiveHandoffClear: "런타임 실시간 인계 이상 없음",
    runtimeEvidenceTicketsClear: "런타임 근거 티켓 이상 없음",
    runtimeEvidenceTicketMissing: "런타임 근거 티켓 누락",
    runtimeLiveEvidenceMissing: "런타임 실시간 근거 인계 누락",
    writesLocalEvidence: "로컬 근거 쓰기",
    mutationByVerifier: "검증기 변경 허용",
    contractReady: "계약 준비",
    queueLive: "대기열 가동",
    workerLive: "적재 워커 가동",
    vectorAudit: "벡터 감사",
    rawMarkdown: "원본 마크다운",
    auditAppendOnly: "감사 추가 전용",
    approvals: "승인",
    queueMetadataWrite: "대기열 메타데이터 쓰기",
    approved: "승인됨",
    validateUploadIntake: "업로드 입력 검증",
    document: "문서",
    status: "상태",
    chunks: "청크",
    citation: "인용",
    tenant: "테넌트",
    file: "파일",
    ragDocumentMarkdown: "RAG 문서 마크다운",
    validating: "검증 중",
    validate: "검증",
    exporting: "내보내는 중",
    exportEvidence: "근거 내보내기",
    queueing: "대기열 등록 중",
    queueEvidence: "근거 대기열 등록",
    pending: "대기",
    rejected: "거부",
    queued: "대기열",
    approveQueuedEvidence: "대기 중인 RAG 근거 승인",
    rejectQueuedEvidence: "대기 중인 RAG 근거 반려",
    planRagIngestionJob: "RAG 적재 작업 계획",
    tokenUsage: "토큰 사용량",
    lightspeedMcpTools: "Lightspeed MCP 도구",
    tools: "도구",
    endpoint: "엔드포인트",
    readOnlyTools: "읽기 전용 도구",
    blockedTool: "차단 도구",
    routingScore: "라우팅 점수",
    routingStatus: "라우팅 상태",
    responseScore: "응답 점수",
    threshold: "기준값",
    head: "HEAD",
    trojanHorseCheck: "우회 명령 방어 점검",
    selectedTool: "선택 도구",
    citations: "인용",
    redaction: "비식별 처리",
    mutationAllowed: "변경 허용",
    handoffMode: "인계 모드",
    handoffStatus: "인계 상태",
    artifact: "산출물",
    liveReadiness: "실시간 준비도",
    network: "네트워크",
    templateReady: "템플릿 준비",
    clusterMutationAttempted: "클러스터 변경 시도",
    approvalGated: "승인 필요 항목",
    readOnlyCommands: "읽기 전용 명령",
    gatedCommands: "승인 필요 명령",
    nextCommand: "다음 명령",
    toolMode: "모드",
    category: "분류",
    dashboardSurface: "화면",
    incidentMetrics: "장애 지표",
    liveSmoke: "실시간 스모크",
    selectedPod: "선택된 Pod",
    monitoringProxy: "모니터링 프록시",
    enabled: "활성화",
    reachable: "연결 가능",
    approvalRequired: "승인 필요",
    missingQueries: "누락 쿼리",
    ticket: "티켓",
    firstAction: "첫 작업",
    approvalAction: "승인 작업",
    requiresApproval: "승인 필요",
    alertmanager: "Alertmanager",
    acceptedAlerts: "수락된 알림",
    rawAlertReturned: "원본 알림 반환",
    vectorWriteAttempted: "벡터 쓰기 시도",
    ingestionJobCreated: "적재 작업 생성",
    triggerEvidence: "트리거 근거",
    metricSamples: "샘플",
    patch: "패치",
    current: "현재값",
    proposed: "제안값",
    reviewGate: "검토 게이트",
    targetConfidence: "대상 신뢰도",
    logs: "로그",
    events: "이벤트",
    metrics: "메트릭",
    runbooks: "런북",
    installReadiness: "설치 준비도",
    lightspeedMcp: "Lightspeed MCP",
    environment: "환경 격리",
    extensionPoint: "확장 지점",
    aiOpsPipeline: "AI Ops 파이프라인",
    consoleDashboard: "콘솔 대시보드",
    operator: "오퍼레이터",
    ocpConnectivity: "OCP 연결성",
    operatorPackage: "오퍼레이터 패키지",
    operatorDryRun: "오퍼레이터 dry-run",
    operatorBoundary: "오퍼레이터 경계",
    installPlan: "설치 계획",
    ragIngestion: "RAG 적재",
    certificationEvidence: "인증 근거",
    communitySubmission: "커뮤니티 제출",
    catalogToolchain: "카탈로그 도구체인",
    labBootstrap: "랩 부트스트랩",
    labHandoff: "랩 인계",
    imageBuilds: "이미지 빌드",
    ownedProvenance: "소유 이미지 출처",
    externalRuntime: "외부 런타임",
    runtimeReview: "런타임 검토",
    securityScan: "보안 스캔",
    releasePublish: "릴리스 게시",
    releaseRefresh: "릴리스 갱신",
    releaseBundle: "릴리스 번들",
    releaseAction: "릴리스 작업",
    roadmapCompletion: "로드맵 완료",
    completionGate: "완료 게이트",
    preClusterGate: "사전 클러스터 게이트",
    evidenceCheckpoint: "근거 체크포인트",
    liveHandoff: "실시간 인계",
    networkHandoff: "네트워크 인계",
    handoffFallback: "인계 대체 경로",
    authRbacPlan: "인증/RBAC 계획",
    certification: "인증",
    complete: "완료율",
    passed: "통과",
    remaining: "남은 항목",
    external: "외부 상태",
    local: "로컬",
    blockers: "차단 요소",
    currentGap: "현재 gap",
    smoke: "스모크",
    assistantMutationAllowed: "어시스턴트 변경 허용",
    registryMutationAttempted: "레지스트리 변경 시도",
    context: "컨텍스트",
    auth: "인증",
    server: "서버",
    kubeconfigEnv: "Kubeconfig 환경",
    defaultKubeconfig: "기본 Kubeconfig",
    diagnosis: "진단",
    humanApproval: "사람 승인",
    tokenRedacted: "토큰 비식별",
    storedByVerifier: "검증기 저장",
    packet: "패킷",
    exists: "존재 여부",
    required: "필수",
    severity: "심각도",
    nextCheck: "다음 점검",
    classification: "분류",
    target: "대상",
    api: "API",
    authBoundary: "인증 경계",
    tlsVerify: "TLS 검증",
    localFormatIssue: "로컬 형식 문제",
    source: "출처",
    lengthClass: "길이 등급",
    networkFirstActions: "네트워크 첫 작업",
    sourceArtifacts: "소스 산출물",
    fresh: "최신",
    adminAsk: "관리자 요청",
    rbacReviewsMissing: "RBAC 검토 누락",
    networkFirstActionsMissing: "네트워크 첫 작업 누락",
    caseCount: "사례 수",
    failedChecks: "실패 점검",
    namespace: "네임스페이스",
    reader: "읽기 계정",
    clusterRole: "ClusterRole",
    policy: "정책",
    rules: "규칙",
    secretsIncluded: "Secret 포함",
    rbac: "RBAC",
    unknown: "미확인",
    lightspeedAuthReady: "Lightspeed 인증 준비",
    actionHints: "작업 힌트",
    postApprovalSmoke: "승인 후 스모크",
    forbidden: "금지 항목",
    blockedUntilHandoffExists: "인계 근거 전까지 대기",
    dirty: "변경 있음",
    readyToClaim100: "100% 주장 준비",
    completionGates: "게이트",
    failedRequirements: "실패 기준",
    failedSources: "실패 소스",
    closure: "종결",
    criticalPath: "핵심 경로",
    cleanupDeletionAllowed: "정리 삭제 허용",
    bundleStatus: "번들 상태",
    bundleMatchesRoadmap: "번들/로드맵 일치",
    publishReady: "게시 준비",
    installReady: "설치 준비",
    actionQueueReady: "작업 대기열 준비",
    unsafeTickets: "위험 티켓",
    setupCommands: "설정 명령",
    requiredImages: "필수 이미지",
    localInspect: "로컬 검사",
    remainingEvidence: "남은 근거",
    evidenceGaps: "개 gap",
    blockedUntilEvidenceExists: "근거 생성 전까지 대기",
    none: "없음"
  }
} satisfies Record<UiLanguage, Record<string, string>>;

interface OpsLensAdminDashboardProps {
  language: UiLanguage;
}

export function OpsLensAdminDashboard({ language }: OpsLensAdminDashboardProps) {
  const copy = adminCopy[language];
  const [overview, setOverview] = useState<OpsLensAdminOverviewResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("cywell-payments");
  const [fileName, setFileName] = useState("payments-timeout-triage.md");
  const [markdown, setMarkdown] = useState(sampleDraftRunbook);
  const [validation, setValidation] =
    useState<OpsLensRagValidationResponse | null>(null);
  const [evidenceExport, setEvidenceExport] =
    useState<OpsLensRagEvidenceExportResponse | null>(null);
  const [queueSubmission, setQueueSubmission] =
    useState<OpsLensRagApprovalQueueSubmissionResponse | null>(null);
  const [queueReview, setQueueReview] =
    useState<OpsLensRagApprovalQueueReviewResponse | null>(null);
  const [queueIngestionPlan, setQueueIngestionPlan] =
    useState<OpsLensRagApprovalQueueIngestionPlanResponse | null>(null);
  const [queueInventory, setQueueInventory] =
    useState<OpsLensRagApprovalQueueInventoryResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
  const [planningItemId, setPlanningItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      try {
        const response = await fetchOpsLensAdminOverview();
        if (!active) return;
        setOverview(response);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "admin overview failed");
      }
    }

    async function loadQueueInventory() {
      try {
        const response = await fetchOpsLensRagApprovalQueue();
        if (!active) return;
        setQueueInventory(response);
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "RAG approval queue inventory failed"
        );
      }
    }

    void loadOverview();
    void loadQueueInventory();

    return () => {
      active = false;
    };
  }, []);

  const tokenUsedPercent = useMemo(() => {
    if (!overview?.tokenUsage.budgetTokens) return 0;
    return Math.min(
      100,
      Math.round(
        (overview.tokenUsage.usedTokens / overview.tokenUsage.budgetTokens) * 100
      )
    );
  }, [overview]);

  const latestGpu = overview?.runtime.gpu.samples.at(-1);
  const ragProductionReadiness = overview?.rag.productionReadiness;
  const opsBrain = overview?.opsBrain;
  const metricQueries = overview?.incidents.flatMap(
    (incident) => incident.metricQueries
  );
  const remediationProposals =
    overview?.incidents.flatMap((incident) =>
      incident.remediationProposal
        ? [
            {
              incident,
              proposal: incident.remediationProposal
            }
          ]
        : []
    ) ?? [];
  const aiopsPipeline = overview?.aiops.incidentPipeline;
  const alertmanagerIntake = aiopsPipeline?.alertmanagerIntake;
  const monitoringProxyHandoff = aiopsPipeline?.monitoringProxyHandoff;
  const extensionPoint = overview?.installReadiness.extensionPoint;
  const operatorPackage = overview?.installReadiness.operatorPackageSummary;
  const operatorRuntimeBoundary =
    overview?.installReadiness.operatorRuntimeBoundarySummary;
  const approvalPlan = overview?.installReadiness.approvalPlan;
  const certificationPlan = overview?.installReadiness.certificationPlan;
  const communitySubmissionPlan =
    overview?.installReadiness.communitySubmissionPlan;
  const catalogToolchainPlan =
    overview?.installReadiness.catalogToolchainPlan;
  const labBootstrapPlan = overview?.installReadiness.labBootstrapPlan;
  const labHandoffPlan = overview?.installReadiness.labHandoffPlan;
  const externalRuntimePlan = overview?.installReadiness.externalRuntimePlan;
  const externalRuntimeReview =
    overview?.installReadiness.externalRuntimeReview;
  const securityScanPlan = overview?.installReadiness.securityScanPlan;
  const ownedImageProvenancePlan =
    overview?.installReadiness.ownedImageProvenancePlan;
  const releasePlan = overview?.installReadiness.releasePlan;
  const releaseRefresh = overview?.installReadiness.refresh;
  const releaseRefreshSecurityReviewCommand = releaseRefresh?.commands.find(
    (command) => command.id === "security-review-drafts-all"
  );
  const releaseBundle = overview?.installReadiness.bundle;
  const releaseBundlePacketName =
    releaseBundle?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const releaseActionQueue = overview?.installReadiness.actionQueue;
  const roadmapCompletion = overview?.installReadiness.roadmapCompletion;
  const completionGate = overview?.installReadiness.completionGate;
  const preClusterInstallGate =
    overview?.installReadiness.preClusterInstallGate;
  const runtimeLiveHandoff = overview?.runtime.liveHandoff;
  const runtimeLiveEvidenceHandoff =
    overview?.runtime.readiness.liveEvidenceHandoff ?? [];
  const runtimeLiveHandoffActions = [
    runtimeLiveHandoff?.runtimeReadinessAction,
    runtimeLiveHandoff?.runtimeRagAction
  ].filter(
    (action): action is OpsLensRuntimeLiveHandoffAction => action !== undefined
  );
  const releaseCandidateActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("candidate-matrix")
    ) ?? [];
  const releaseSecurityReviewActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.startsWith("security-review-")
    ) ?? [];
  const releaseCatalogRegistryActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("catalog-base-image")
    ) ?? [];
  const releaseRuntimeLiveActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("runtime") ||
        entry.id.includes("runtime-rag") ||
        entry.id.includes("rag-owner-enable-production")
    ) ?? [];
  const releaseMonitoringProxyActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("aiopsIncidentPipeline") ||
        entry.id.includes("monitoring-proxy")
    ) ?? [];
  const releaseNetworkActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("ocpNetworkHandoff") ||
        entry.source.includes("ocpConnectivity") ||
        entry.id.includes("ocp-api") ||
        entry.id.includes("ocp-tls") ||
        entry.id.includes("ocp-auth-rbac")
    ) ?? [];
  const releaseLightspeedReadinessActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.id.includes("lightspeed-readiness") ||
        entry.source.includes("lightspeedReadiness")
    ) ?? [];
  const releaseDecisionActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("decision-not-ready")
    ) ?? [];
  const releaseApprovalHandoffActions = releaseActionQueue
    ? [
        ...releaseActionQueue.items.filter((entry) =>
          entry.approvalGatedCommands.some(
            (command) =>
              command.id.includes("live-evidence-reader") ||
              command.id.includes("short-lived-live-reader")
          )
        ),
        ...releaseActionQueue.items.filter(
          (entry) => entry.approvalGatedCommands.length > 0
        )
      ]
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.id === entry.id) === index
        )
        .slice(0, 6)
    : [];
  const releaseReadOnlyHandoffActions = releaseActionQueue
    ? [
        ...releaseActionQueue.items.filter((entry) =>
          entry.readOnlyCommands.some(
            (command) =>
              command.id === "ocp-connectivity" ||
              command.id.includes("live-reader") ||
              command.id === "lightspeed-readiness-live"
          )
        ),
        ...releaseActionQueue.items.filter(
          (entry) => entry.readOnlyCommands.length > 0
        )
      ]
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.id === entry.id) === index
        )
        .slice(0, 6)
    : [];
  const releaseActionQueuePacketName =
    releaseActionQueue?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const checkpoint = overview?.installReadiness.checkpoint;
  const liveHandoff = overview?.installReadiness.handoff;
  const networkHandoff = overview?.installReadiness.networkHandoff;
  const networkHandoffApiFallback =
    overview?.installReadiness.networkHandoffApiFallback;
  const authRbacPlan = overview?.installReadiness.authRbacPlan;
  const envContract = overview?.installReadiness.envContract;
  const ocpConnectivity = overview?.installReadiness.connectivity;
  const lightspeedMcp = overview?.lightspeed.mcp;
  const validationFailed = validation?.issues.some(
    (issue) => issue.severity === "fail"
  );

  async function runValidation() {
    setValidating(true);
    try {
      const response = await validateOpsLensRagDocument({
        tenantId,
        fileName,
        markdown
      });
      setValidation(response);
      setEvidenceExport(null);
      setQueueSubmission(null);
      setQueueReview(null);
      setQueueIngestionPlan(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RAG validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function exportEvidence() {
    setExporting(true);
    try {
      const response = await exportOpsLensRagEvidence({
        tenantId,
        fileName,
        markdown,
        requestedBy: "admin-dashboard",
        reason: "validate RAG draft before approval queue"
      });
      setEvidenceExport(response);
      setValidation(response.validation);
      setQueueSubmission(null);
      setQueueReview(null);
      setQueueIngestionPlan(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG evidence export failed"
      );
    } finally {
      setExporting(false);
    }
  }

  async function submitApprovalQueue() {
    setQueueing(true);
    try {
      const response = await submitOpsLensRagApprovalQueue({
        tenantId,
        fileName,
        markdown,
        requestedBy: "admin-dashboard",
        reason: "submit redacted validation evidence for human approval",
        ticketRef: "dashboard-local-draft"
      });
      setQueueSubmission(response);
      setValidation(response.validation);
      setQueueReview(null);
      setQueueIngestionPlan(null);
      setQueueInventory(await fetchOpsLensRagApprovalQueue());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG approval queue submit failed"
      );
    } finally {
      setQueueing(false);
    }
  }

  async function reviewQueueItem(
    item: OpsLensRagApprovalQueueInventoryResponse["items"][number],
    decision: "approve" | "reject"
  ) {
    const approvedRoles = new Set(item.approvals.map((approval) => approval.role));
    const nextRole =
      item.requiredApprovals.find((role) => !approvedRoles.has(role)) ??
      item.requiredApprovals[0] ??
      "rag-owner";
    const reviewKey = `${item.queueItemId}-${decision}`;
    setReviewingItemId(reviewKey);
    try {
      const response = await reviewOpsLensRagApprovalQueue({
        tenantId: item.tenantId,
        queueItemId: item.queueItemId,
        reviewer: "admin-dashboard",
        role: nextRole,
        decision,
        reason: `${decision} redacted RAG queue evidence from dashboard review`,
        ticketRef: item.audit.ticketRef ?? "dashboard-review"
      });
      setQueueReview(response);
      setQueueIngestionPlan(null);
      setQueueInventory(await fetchOpsLensRagApprovalQueue());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG approval queue review failed"
      );
    } finally {
      setReviewingItemId(null);
    }
  }

  async function planQueueIngestion(
    item: OpsLensRagApprovalQueueInventoryResponse["items"][number]
  ) {
    setPlanningItemId(item.queueItemId);
    try {
      const response = await planOpsLensRagIngestion({
        tenantId: item.tenantId,
        queueItemId: item.queueItemId,
        requestedBy: "admin-dashboard",
        reason: "plan approved RAG queue ingestion without vector writes",
        ticketRef: item.audit.ticketRef ?? "dashboard-ingestion-plan"
      });
      setQueueIngestionPlan(response);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG ingestion plan failed"
      );
    } finally {
      setPlanningItemId(null);
    }
  }

  return (
    <section
      className="opslens-admin-dashboard"
      aria-labelledby="opslens-admin-title"
      data-testid="opslens-admin-dashboard"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Cywell OpsLens</p>
          <h2 id="opslens-admin-title">{copy.adminTitle}</h2>
        </div>
        <div className="summary-strip" data-testid="opslens-admin-summary">
          <span>
            <DatabaseZap size={15} aria-hidden="true" />
            {numberText(overview?.rag.documents.length)} {copy.docs}
          </span>
          <span>
            <Gauge size={15} aria-hidden="true" />
            {tokenUsedPercent}% {copy.tokens}
          </span>
          <span>
            <Cpu size={15} aria-hidden="true" />
            {latestGpu ? `${latestGpu.utilizationPercent}% GPU` : "-- GPU"}
          </span>
        </div>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="opslens-admin-error">
          {error}
        </div>
      ) : null}

      {opsBrain ? (
        <section
          className="opsbrain-console"
          data-testid="opslens-opsbrain-system"
          aria-labelledby="opslens-opsbrain-title"
        >
          <div className="opsbrain-headline">
            <div>
              <p className="eyebrow">Cywell OpsBrain</p>
              <h3 id="opslens-opsbrain-title">{copy.opsBrainTitle}</h3>
              <p>{opsBrain.productDefinition}</p>
            </div>
            <div className="opsbrain-badges">
              <span className={`freshness ${statusClass(opsBrain.status)}`}>
                {statusText(language, opsBrain.status)}
              </span>
              <span className="status-pill read-only">
                {copy.fineTuningRequired}:{" "}
                {booleanText(language, opsBrain.fineTuningRequired)}
              </span>
              <span className="status-pill read-only">
                {copy.toolMode}: {actionModeText(language, opsBrain.actionMode)}
              </span>
            </div>
          </div>

          <div className="opsbrain-grid">
            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <BrainCircuit size={16} aria-hidden="true" />
                  {copy.growthLoop}
                </h4>
                <span>{opsBrain.growthLoop.length} {copy.steps}</span>
              </div>
              <ol className="opsbrain-step-list">
                {opsBrain.growthLoop.map((step) => (
                  <li key={step.step}>
                    <strong>
                      {step.step}. {step.label}
                    </strong>
                    <span>{step.currentImplementation}</span>
                    <small>{step.passFail}</small>
                  </li>
                ))}
              </ol>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <DatabaseZap size={16} aria-hidden="true" />
                  {copy.memoryTiers}
                </h4>
                <span>{opsBrain.memoryTiers.length} {copy.tiers}</span>
              </div>
              <div className="opsbrain-memory-list">
                {opsBrain.memoryTiers.map((tier) => (
                  <div key={tier.tier}>
                    <span className={`freshness ${statusClass(tier.status)}`}>
                      {tier.tier}
                    </span>
                    <strong>{tier.label}</strong>
                    <small>{tier.implementation}</small>
                    <small>
                      {copy.writePolicy}: {tier.writePolicy}
                    </small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <ShieldCheck size={16} aria-hidden="true" />
                  {copy.riskGate}
                </h4>
                <span>
                  {copy.mutationAllowed}:{" "}
                  {booleanText(language, opsBrain.riskGate.mutationAllowed)}
                </span>
              </div>
              <div className="opsbrain-risk-list">
                {opsBrain.riskGate.commandClasses.map((commandClass) => (
                  <div key={commandClass.className}>
                    <strong>{commandClass.className}</strong>
                    <span>
                      {copy.approvalRequired}:{" "}
                      {booleanText(
                        language,
                        !commandClass.allowedWithoutApproval
                      )}
                    </span>
                    <small>{commandClass.examples.join(", ")}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <ListChecks size={16} aria-hidden="true" />
                  {copy.evaluator}
                </h4>
                <span>
                  {copy.goldenSet}: {opsBrain.evaluator.goldenSetTarget}
                </span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.evaluator.metrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
              <p>{opsBrain.evaluator.releaseGate}</p>
            </article>
          </div>

          <div className="opsbrain-module-row">
            <article
              className="opsbrain-panel opsbrain-module-panel"
              data-testid="opslens-opsbrain-architecture"
            >
              <div className="card-title-row">
                <h4>
                  <BrainCircuit size={16} aria-hidden="true" />
                  {copy.systemModules}
                </h4>
                <span>{opsBrain.architectureModules.length} {copy.modules}</span>
              </div>
              <div className="opsbrain-module-list">
                {opsBrain.architectureModules.map((module) => (
                  <div key={module.id}>
                    <span className={`freshness ${statusClass(module.status)}`}>
                      {statusText(language, module.status)}
                    </span>
                    <strong>{module.label}</strong>
                    <small>{module.currentImplementation}</small>
                    <small>
                      {copy.nextImplementation}: {module.nextImplementation}
                    </small>
                  </div>
                ))}
              </div>
            </article>

            <article
              className="opsbrain-panel"
              data-testid="opslens-opsbrain-growth-governance"
            >
              <div className="card-title-row">
                <h4>
                  <ShieldCheck size={16} aria-hidden="true" />
                  {copy.growthGovernance}
                </h4>
                <span>{opsBrain.growthGovernance.memoryPromotionMode}</span>
              </div>
              <div className="opsbrain-governance-grid">
                <span>
                  {copy.groundedTarget}:{" "}
                  {opsBrain.growthGovernance.currentStateEvidenceTargetPercent}%
                </span>
                <span>
                  {copy.dangerousExecTarget}:{" "}
                  {
                    opsBrain.growthGovernance
                      .unauthorizedDangerousExecutionTarget
                  }
                </span>
                <span>
                  {copy.repeatReuse}:{" "}
                  {booleanText(
                    language,
                    opsBrain.growthGovernance.repeatedCaseReuseRequired
                  )}
                </span>
                <span>
                  {copy.evalBeforePromotion}:{" "}
                  {booleanText(
                    language,
                    opsBrain.growthGovernance.evalBeforePromotionRequired
                  )}
                </span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.growthGovernance.missingEvidence.slice(0, 4).map((gap) => (
                  <span key={gap}>{gap}</span>
                ))}
              </div>
            </article>

            <article
              className="opsbrain-panel"
              data-testid="opslens-opsbrain-model-strategy"
            >
              <div className="card-title-row">
                <h4>
                  <Gauge size={16} aria-hidden="true" />
                  {copy.modelStrategy}
                </h4>
                <span>{opsBrain.modelStrategy.defaultMode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>
                  {copy.routingPlanned}:{" "}
                  {booleanText(language, opsBrain.modelStrategy.routingPlanned)}
                </span>
                <span>
                  {copy.externalProviderDefault}:{" "}
                  {booleanText(
                    language,
                    opsBrain.modelStrategy.externalProviderCallAllowedByDefault
                  )}
                </span>
              </div>
              <div className="opsbrain-model-list">
                {opsBrain.modelStrategy.providers.map((provider) => (
                  <div key={provider.id}>
                    <span className={`status-pill ${provider.status === "active" ? "ready" : provider.status === "missing" ? "danger" : "read-only"}`}>
                      {statusText(language, provider.status)}
                    </span>
                    <strong>{provider.label}</strong>
                    <small>{provider.role}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="opsbrain-contract-row">
            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {copy.acceptance}
                </h4>
                <span>{opsBrain.acceptanceCriteria.length} {copy.gates}</span>
              </div>
              <div className="opsbrain-contract-list">
                {opsBrain.acceptanceCriteria.map((criterion) => (
                  <div key={criterion.id}>
                    <span className={`status-pill ${criterion.status === "pass" ? "ready" : criterion.status === "needs-evidence" ? "warning" : "read-only"}`}>
                      {statusText(language, criterion.status)}
                    </span>
                    <strong>{criterion.id}</strong>
                    <small>{criterion.pass}</small>
                    <small>{criterion.measurement}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <FileDiff size={16} aria-hidden="true" />
                  {copy.memoryWriteGuard}
                </h4>
                <span>{opsBrain.memoryWriteGuard.mode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>
                  {copy.rawMemoryWrite}:{" "}
                  {booleanText(
                    language,
                    opsBrain.memoryWriteGuard.rawMemoryWriteAllowed
                  )}
                </span>
                <span>
                  {copy.vectorWrite}:{" "}
                  {booleanText(
                    language,
                    opsBrain.memoryWriteGuard.vectorWriteAllowed
                  )}
                </span>
                <span>
                  {copy.graphWrite}:{" "}
                  {booleanText(
                    language,
                    opsBrain.memoryWriteGuard.graphWriteAllowed
                  )}
                </span>
                <span>
                  {copy.reviewerRequired}:{" "}
                  {booleanText(
                    language,
                    opsBrain.memoryWriteGuard.reviewerRequired
                  )}
                </span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.memoryWriteGuard.blockedTargets.slice(0, 5).map((target) => (
                  <span key={target}>{target}</span>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <Activity size={16} aria-hidden="true" />
                  {copy.selfImprover}
                </h4>
                <span>{opsBrain.selfImprover.mode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>
                  {copy.fineTuning}:{" "}
                  {booleanText(
                    language,
                    opsBrain.selfImprover.automaticFineTuningAllowed
                  )}
                </span>
                <span>
                  {copy.policyMutation}:{" "}
                  {booleanText(
                    language,
                    opsBrain.selfImprover.automaticPolicyMutationAllowed
                  )}
                </span>
                <span>
                  {copy.nightlyLoop}:{" "}
                  {booleanText(
                    language,
                    opsBrain.selfImprover.nightlyLoopPlanned
                  )}
                </span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.selfImprover.candidateOutputs.slice(0, 5).map((output) => (
                  <span key={output}>{output}</span>
                ))}
              </div>
            </article>
          </div>

          <div className="opsbrain-credential-panel">
            <div className="card-title-row">
              <h4>
                <KeyRound size={16} aria-hidden="true" />
                {copy.requiredKeys}
              </h4>
              <span>{copy.valuesRedacted}</span>
            </div>
            <div
              className="opsbrain-credential-list"
              data-testid="opslens-opsbrain-credentials"
            >
              {opsBrain.credentialRequirements.map((requirement) => (
                <div key={requirement.id}>
                  <span className={`status-pill ${requirement.status === "configured" ? "ready" : requirement.status === "missing" ? "danger" : "read-only"}`}>
                    {requirement.status}
                  </span>
                  <strong>{requirement.label}</strong>
                  <small>{requirement.keyNames.join(" + ")}</small>
                  <small>{requirement.note}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="admin-grid">
        <article className="ops-card rag-admin-card" data-testid="opslens-rag-health">
          <div className="card-title-row">
            <h3>{copy.ragDocuments}</h3>
            <button
              className="icon-button"
              type="button"
              title={copy.validateUploadIntake}
              aria-label={copy.validateUploadIntake}
              onClick={() => void runValidation()}
              disabled={validating}
            >
              <UploadCloud size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="resource-table compact">
              <thead>
                <tr>
                  <th>{copy.document}</th>
                  <th>{copy.status}</th>
                  <th>{copy.chunks}</th>
                  <th>{copy.citation}</th>
                </tr>
              </thead>
              <tbody>
                {overview?.rag.documents.map((document) => (
                  <tr key={document.id}>
                    <td data-label={copy.document}>
                      <strong>{document.label}</strong>
                      <small>{document.tenantId}</small>
                    </td>
                    <td data-label={copy.status}>
                      <span className={`freshness ${statusClass(document.status)}`}>
                        {document.status}
                      </span>
                    </td>
                    <td data-label={copy.chunks}>{document.chunkCount}</td>
                    <td data-label={copy.citation}>{percentText(document.citationRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-evidence-line" data-testid="opslens-upload-intake">
            <span>{overview?.rag.uploadIntake.mode ?? "validate-only"}</span>
            <span>{numberText(overview?.rag.uploadIntake.pending)} {copy.pending}</span>
            <span>{numberText(overview?.rag.uploadIntake.rejected)} {copy.rejected}</span>
          </div>
          {ragProductionReadiness ? (
            <div
              className="rag-export-summary"
              data-testid="opslens-rag-production-readiness"
            >
              <div className="admin-evidence-line">
                <span>
                  {actionModeText(language, ragProductionReadiness.actionMode)}
                </span>
                <span>{statusText(language, ragProductionReadiness.status)}</span>
                <span>
                  {copy.contractReady}:{" "}
                  {booleanText(language, ragProductionReadiness.contractReady)}
                </span>
                <span>
                  {copy.queueLive}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.productionQueueLive
                  )}
                </span>
                <span>
                  {copy.workerLive}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.ingestionWorkerLive
                  )}
                </span>
                <span>
                  {copy.vectorAudit}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.vectorWriteAuditSinkLive
                  )}
                </span>
                <span>
                  {copy.vectorWrite}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.vectorWriteAttempted
                  )}
                </span>
                <span>
                  {copy.ingestionJobCreated}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.ingestionJobCreated
                  )}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>{ragProductionReadiness.components.queue.backendClass}</span>
                <span>
                  {copy.rawMarkdown}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.components.queue.storesRawMarkdown
                  )}
                </span>
                <span>
                  {copy.auditAppendOnly}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.components.vectorWriteAuditSink
                      .appendOnly
                  )}
                </span>
                <span>
                  {copy.approvals}:{" "}
                  {ragProductionReadiness.requiredApprovals.join(",")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-production-first-actions"
              >
                {ragProductionReadiness.firstProductionActions.length ? (
                  ragProductionReadiness.firstProductionActions.map((action) => (
                    <span key={action.id}>
                      {action.id} / {action.owner} /{" "}
                      {statusText(language, action.status)} / {copy.nextCommand}:{" "}
                      {action.nextCommand} / {copy.mutationAllowed}:{" "}
                      {booleanText(language, action.mutation)} /{" "}
                      {copy.approvalRequired}:{" "}
                      {booleanText(language, action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>RAG production first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-production-ticket"
              >
                <span>
                  {copy.ticket}: {ragProductionReadiness.ticketPacket.id}
                </span>
                <span>
                  {copy.firstAction}:{" "}
                  {ragProductionReadiness.ticketPacket.firstReadOnlyAction.id}
                </span>
                <span>
                  {copy.approvalAction}:{" "}
                  {ragProductionReadiness.ticketPacket.approvalGatedAction.id}
                </span>
                <span>
                  {copy.requiresApproval}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                </span>
                <span>
                  {copy.approvalRequired}:{" "}
                  {booleanText(
                    language,
                    ragProductionReadiness.ticketPacket.mutationBoundary
                      .ingestionRequiresExplicitApproval
                  )}
                </span>
              </div>
            </div>
          ) : null}
          <div
            className="rag-export-summary"
            data-testid="opslens-rag-approval-queue-inventory"
          >
            <div className="admin-evidence-line">
              <span>{actionModeText(language, queueInventory?.mode ?? "designOnly")}</span>
              <span>{numberText(queueInventory?.itemCount)} {copy.queued}</span>
              <span>{copy.readOnlyCommands}: {booleanText(language, true)}</span>
              <span>
                {copy.vectorWrite}:{" "}
                {booleanText(
                  language,
                  queueInventory?.policy.vectorWriteAllowed ?? false
                )}
              </span>
              <span>
                {copy.policyMutation}:{" "}
                {booleanText(
                  language,
                  queueInventory?.policy.approvalMutationAllowed ?? false
                )}
              </span>
            </div>
            {queueInventory?.items.slice(0, 3).map((item) => (
              <div className="admin-evidence-line" key={item.queueItemId}>
                <span>{item.queueItemId}</span>
                <span>{item.state}</span>
                <span>{item.tenantId}</span>
                <span>
                  {copy.approvals}: {item.approvals.length}
                </span>
                {item.state === "pending-human-approval" ? (
                  <>
                    <button
                      className="icon-button"
                      type="button"
                      title={copy.approveQueuedEvidence}
                      aria-label={`Approve ${item.queueItemId}`}
                      onClick={() => void reviewQueueItem(item, "approve")}
                      disabled={reviewingItemId === `${item.queueItemId}-approve`}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title={copy.rejectQueuedEvidence}
                      aria-label={`Reject ${item.queueItemId}`}
                      onClick={() => void reviewQueueItem(item, "reject")}
                      disabled={reviewingItemId === `${item.queueItemId}-reject`}
                    >
                      <XCircle size={15} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {item.state === "approved-for-ingestion" ? (
                  <button
                    className="icon-button"
                    type="button"
                    title={copy.planRagIngestionJob}
                    aria-label={`Plan ingestion ${item.queueItemId}`}
                    onClick={() => void planQueueIngestion(item)}
                    disabled={planningItemId === item.queueItemId}
                  >
                    <DatabaseZap size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            {queueReview ? (
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-approval-review"
              >
                <span>{actionModeText(language, queueReview.actionMode)}</span>
                <span>{queueReview.decision}</span>
                <span>{queueReview.state}</span>
                <span>
                  {copy.queueMetadataWrite}:{" "}
                  {booleanText(
                    language,
                    queueReview.policy.queueMetadataWriteAllowed
                  )}
                </span>
                <span>
                  {copy.vectorWrite}:{" "}
                  {booleanText(language, queueReview.policy.vectorWriteAllowed)}
                </span>
                <span>
                  {copy.ingestionJobCreated}:{" "}
                  {booleanText(
                    language,
                    queueReview.content.ingestionJobCreated
                  )}
                </span>
              </div>
            ) : null}
            {queueIngestionPlan ? (
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-ingestion-plan"
              >
                <span>{actionModeText(language, queueIngestionPlan.actionMode)}</span>
                <span>
                  {statusText(language, queueIngestionPlan.plannedJob.status)}
                </span>
                <span>
                  {copy.approved}:{" "}
                  {booleanText(language, queueIngestionPlan.approvedForIngestion)}
                </span>
                <span>
                  {copy.vectorWrite}:{" "}
                  {booleanText(
                    language,
                    queueIngestionPlan.policy.vectorWriteAllowed
                  )}
                </span>
                <span>
                  {copy.ingestionJobCreated}:{" "}
                  {booleanText(
                    language,
                    queueIngestionPlan.content.ingestionJobCreated
                  )}
                </span>
              </div>
            ) : null}
          </div>
          <div className="rag-validation-form" data-testid="opslens-rag-validation">
            <div className="rag-validation-fields">
              <label>
                {copy.tenant}
                <input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                />
              </label>
              <label>
                {copy.file}
                <input
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                />
              </label>
            </div>
            <textarea
              aria-label={copy.ragDocumentMarkdown}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            <div className="rag-validation-actions">
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void runValidation()}
                disabled={validating}
              >
                <UploadCloud size={16} aria-hidden="true" />
                {validating ? copy.validating : copy.validate}
              </button>
              {validation ? (
                <span
                  className={`status-pill ${validation.accepted ? "ready" : "danger"}`}
                >
                  {validation.accepted ? "accepted" : "rejected"}
                </span>
              ) : null}
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void exportEvidence()}
                disabled={exporting}
              >
                <Download size={16} aria-hidden="true" />
                {exporting ? copy.exporting : copy.exportEvidence}
              </button>
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void submitApprovalQueue()}
                disabled={queueing}
              >
                <FileDiff size={16} aria-hidden="true" />
                {queueing ? copy.queueing : copy.queueEvidence}
              </button>
            </div>
            {validation ? (
              <div className="rag-validation-result">
                <div className="admin-evidence-line">
                  <span>{validation.actionMode}</span>
                  <span>redactions {validation.redactionCount}</span>
                  <span>chunks {validation.chunks.length}</span>
                  <span>rawDocumentReturned=false</span>
                </div>
                <ul>
                  {validation.issues
                    .filter((issue) => issue.severity !== "pass" || validationFailed)
                    .slice(0, 4)
                    .map((issue) => (
                      <li key={`${issue.code}-${issue.message}`}>
                        <strong>{issue.severity}</strong>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                </ul>
                {evidenceExport ? (
                  <div
                    className="rag-export-summary"
                    data-testid="opslens-rag-evidence-export"
                  >
                    <div className="admin-evidence-line">
                      <span>{evidenceExport.exportId}</span>
                      <span>{evidenceExport.approvalQueue.mode}</span>
                      <span>enqueueAllowed=false</span>
                      <span>{evidenceExport.audit.validationHash.slice(0, 12)}</span>
                    </div>
                  </div>
                ) : null}
                {queueSubmission ? (
                  <div
                    className="rag-export-summary"
                    data-testid="opslens-rag-approval-queue"
                  >
                    <div className="admin-evidence-line">
                      <span>{queueSubmission.queueItemId}</span>
                      <span>{queueSubmission.state}</span>
                      <span>{queueSubmission.approvalQueue.mode}</span>
                      <span>
                        persisted={String(queueSubmission.approvalQueue.persisted)}
                      </span>
                      <span>
                        vectorWrite={String(
                          queueSubmission.policy.vectorWriteAllowed
                        )}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>

        <article className="ops-card token-admin-card" data-testid="opslens-token-usage">
          <div className="card-title-row">
            <h3>{copy.tokenUsage}</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <div className="token-budget">
            <div
              className="token-budget-fill"
              style={{ "--budget": `${tokenUsedPercent}%` } as CSSProperties}
            />
            <strong>{numberText(overview?.tokenUsage.usedTokens)}</strong>
            <span>/ {numberText(overview?.tokenUsage.budgetTokens)}</span>
          </div>
          <div className="route-usage-list">
            {overview?.tokenUsage.routes.map((route) => {
              const routeTotal = route.inputTokens + route.outputTokens;
              const width = overview.tokenUsage.usedTokens
                ? Math.max(4, Math.round((routeTotal / overview.tokenUsage.usedTokens) * 100))
                : 0;
              return (
                <div className="route-usage-row" key={route.route}>
                  <span>{route.route}</span>
                  <div>
                    <i style={{ "--route": `${width}%` } as CSSProperties} />
                  </div>
                  <strong>{numberText(routeTotal)}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article
          className="ops-card mcp-admin-card"
          data-testid="opslens-mcp-tool-surface"
        >
          <div className="card-title-row">
            <h3>{copy.lightspeedMcpTools}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="admin-evidence-line">
            <span>
              {copy.tools}: {numberText(lightspeedMcp?.toolCount)}
            </span>
            <span>
              {copy.endpoint}: {lightspeedMcp?.endpoint ?? "/mcp"}
            </span>
            <span>
              {copy.readOnlyTools}: {numberText(lightspeedMcp?.readOnlyCount)}
            </span>
            <span>{copy.blockedTool}: apply_remediation</span>
            <span data-testid="opslens-lightspeed-routing-score">
              {copy.routingScore}: {numberText(lightspeedMcp?.routing?.selectedPasses)}/
              {numberText(lightspeedMcp?.routing?.total)}
            </span>
          </div>
          <div className="admin-evidence-line">
            <span>
              {copy.routingStatus}:{" "}
              {statusText(language, lightspeedMcp?.routing?.status)}
            </span>
            <span>
              {copy.responseScore}: {numberText(lightspeedMcp?.routing?.responsePasses)}/
              {numberText(lightspeedMcp?.routing?.total)}
            </span>
            <span>
              {copy.threshold}: {numberText(lightspeedMcp?.routing?.threshold)}
            </span>
            <span>
              {copy.head}: {lightspeedMcp?.routing?.headSha ?? "missing"}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-lightspeed-trojan-horse"
          >
            <span>
              {copy.trojanHorseCheck}:{" "}
              {statusText(language, lightspeedMcp?.trojanHorse.status)}
            </span>
            <span>
              {copy.selectedTool}:{" "}
              {lightspeedMcp?.trojanHorse.selectedTool ?? "missing"}
            </span>
            <span>
              {copy.citations}:{" "}
              {numberText(lightspeedMcp?.trojanHorse.citationCount)}
            </span>
            <span>
              {copy.redaction}:{" "}
              {booleanText(language, lightspeedMcp?.trojanHorse.redactionPassed)}
            </span>
            <span>
              {copy.mutationAllowed}:{" "}
              {booleanText(language, lightspeedMcp?.trojanHorse.mutationAllowed)}
            </span>
          </div>
          {lightspeedMcp?.integrationHandoff ? (
            <div
              className="rag-export-summary"
              data-testid="opslens-lightspeed-integration-handoff"
            >
              <div className="admin-evidence-line">
                <span>
                  {copy.handoffMode}:{" "}
                  {actionModeText(language, lightspeedMcp.integrationHandoff.actionMode)}
                </span>
                <span>
                  {copy.handoffStatus}:{" "}
                  {statusText(language, lightspeedMcp.integrationHandoff.status)}
                </span>
                <span>
                  {copy.artifact}:{" "}
                  {statusText(language, lightspeedMcp.integrationHandoff.artifactStatus)}
                </span>
                <span>
                  {copy.liveReadiness}:{" "}
                  {statusText(
                    language,
                    lightspeedMcp.integrationHandoff.liveReadiness.classification
                  )}
                </span>
                <span>
                  {copy.network}:{" "}
                  {statusText(
                    language,
                    lightspeedMcp.integrationHandoff.liveReadiness.networkClassification
                  )}
                </span>
                <span>
                  {copy.templateReady}:{" "}
                  {booleanText(
                    language,
                    lightspeedMcp.integrationHandoff.olsconfig.templateReady
                  )}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(
                    language,
                    lightspeedMcp.integrationHandoff.clusterMutationAttempted
                  )}
                </span>
                <span>
                  {copy.approvalGated}:{" "}
                  {numberText(
                    lightspeedMcp.integrationHandoff.approvalGatedCommands.length
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-integration-handoff-commands"
              >
                <span>
                  {copy.readOnlyCommands}:{" "}
                  {numberText(
                    lightspeedMcp.integrationHandoff.readOnlyCommands.length
                  )}
                </span>
                <span>
                  {copy.gatedCommands}:{" "}
                  {numberText(
                    lightspeedMcp.integrationHandoff.approvalGatedCommands.length
                  )}
                </span>
                <span>
                  {copy.nextCommand}:{" "}
                  {lightspeedMcp.integrationHandoff.liveReadiness.nextCommand}
                </span>
              </div>
            </div>
          ) : null}
          <div className="mcp-tool-list">
            {lightspeedMcp?.tools.map((tool) => (
              <div
                className="mcp-tool-row"
                data-testid={`opslens-mcp-tool-${tool.name}`}
                key={tool.name}
              >
                <span
                  className={`freshness ${
                    tool.actionMode === "planOnly" ? "stale" : "fresh"
                  }`}
                >
                  {actionModeText(language, tool.actionMode)}
                </span>
                <strong>{tool.name}</strong>
                <small>
                  {copy.category}: {tool.category}
                </small>
                <small>
                  {copy.dashboardSurface}: {tool.dashboardSurface}
                </small>
              </div>
            ))}
          </div>
          {lightspeedMcp?.evidence.slice(0, 2).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
        </article>

        <article className="ops-card gpu-admin-card" data-testid="opslens-gpu-runtime">
          <div className="card-title-row">
            <h3>Runtime</h3>
            <Cpu size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Model</dt>
              <dd>{overview?.runtime.model ?? "--"}</dd>
            </div>
            <div>
              <dt>{copy.readyReplicas}</dt>
              <dd>
                {overview
                  ? `${overview.runtime.readyReplicas}/${overview.runtime.replicas}`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>{copy.memory}</dt>
              <dd>
                {latestGpu
                  ? `${latestGpu.memoryUsedGiB}/${latestGpu.memoryTotalGiB} GiB`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>{copy.status}</dt>
              <dd>{statusText(language, overview?.runtime.readiness.status)}</dd>
            </div>
          </dl>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-readiness"
          >
            <span>
              {actionModeText(language, overview?.runtime.readiness.actionMode ?? "readOnly")}
            </span>
            <span>
              {copy.pgvector}:{" "}
              {statusText(language, overview?.runtime.readiness.vectorStore.status)}
            </span>
            <span>
              {copy.vllm}:{" "}
              {statusText(language, overview?.runtime.readiness.modelRuntime.status)}
            </span>
            <span>
              {copy.liveProbe}:{" "}
              {booleanText(
                language,
                overview?.runtime.readiness.vectorStore.liveProbeEnabled ?? false
              )}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff"
          >
            <span>
              {actionModeText(language, runtimeLiveHandoff?.actionMode ?? "handoffOnly")}
            </span>
            <span>
              {copy.status}: {statusText(language, runtimeLiveHandoff?.status)}
            </span>
            <span>
              {copy.runtimeOwner}: {runtimeLiveHandoff?.runtimePlatformOwner ?? "--"}
            </span>
            <span>
              {copy.dataOwner}: {runtimeLiveHandoff?.dataMlOwner ?? "--"}
            </span>
            <span>
              {copy.liveProbe}:{" "}
              {booleanText(language, runtimeLiveHandoff?.liveProbeEnabled ?? false)}
            </span>
            <span>
              {copy.pgvector}:{" "}
              {statusText(language, runtimeLiveHandoff?.pgvectorStatus)}
            </span>
            <span>
              {copy.vllm}: {statusText(language, runtimeLiveHandoff?.vllmStatus)}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-actions"
          >
            {runtimeLiveHandoffActions.length > 0 ? (
              runtimeLiveHandoffActions.map((action) => (
                <span key={action.id}>
                  {action.id} / {copy.owner}: {action.owner} /{" "}
                  {copy.priority}: {action.priority} / {copy.nextCommand}:{" "}
                  {action.nextCommand} / {copy.readOnlyCommands}:{" "}
                  {action.readOnlyCommandIds.join(", ") || copy.none}
                </span>
              ))
            ) : (
              <span>{copy.runtimeLiveHandoffClear}</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-tickets"
          >
            {runtimeLiveHandoffActions.some(
              (action) => action.runtimeEvidenceTicketPacket
            ) ? (
              runtimeLiveHandoffActions.map((action) =>
                action.runtimeEvidenceTicketPacket ? (
                  <span key={`${action.id}-ticket`}>
                    {runtimeEvidenceTicketText(action, language, copy)}
                  </span>
                ) : null
              )
            ) : (
              <span>{copy.runtimeEvidenceTicketsClear}</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-evidence-handoff"
          >
            {runtimeLiveEvidenceHandoff.length > 0 ? (
              runtimeLiveEvidenceHandoff.map((handoff) => (
                <span key={`${handoff.provider}-${handoff.component}`}>
                  {handoff.provider} / {handoff.component} /{" "}
                  {statusText(language, handoff.status)} /{" "}
                  {statusText(language, handoff.classification)} / {copy.owner}:{" "}
                  {handoff.owner} / {copy.writesLocalEvidence}:{" "}
                  {booleanText(language, handoff.writesLocalEvidence)} /{" "}
                  {copy.requiresApproval}:{" "}
                  {booleanText(language, handoff.requiresExplicitApproval)} /{" "}
                  {copy.mutationAllowed}:{" "}
                  {booleanText(language, handoff.mutationAllowed)} /{" "}
                  {copy.nextCommand}: {handoff.nextCommand}
                </span>
              ))
            ) : (
              <span>{copy.runtimeLiveEvidenceMissing}</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-boundary"
          >
            <span>
              {copy.mutationByVerifier}:{" "}
              {booleanText(
                language,
                runtimeLiveHandoff?.mutationAllowedByThisVerifier ?? false
              )}
            </span>
            <span>
              {copy.clusterMutationAttempted}:{" "}
              {booleanText(
                language,
                runtimeLiveHandoff?.clusterMutationAttempted ?? false
              )}
            </span>
            <span>
              {copy.registryMutationAttempted}:{" "}
              {booleanText(
                language,
                runtimeLiveHandoff?.registryMutationAttempted ?? false
              )}
            </span>
            <span>
              {copy.vectorWriteAttempted}:{" "}
              {booleanText(
                language,
                runtimeLiveHandoff?.vectorWriteAttempted ?? false
              )}
            </span>
            <span>
              {copy.approvalGated}:{" "}
              {runtimeLiveHandoff?.approvalGatedCommandCount ?? 0}
            </span>
          </div>
          {overview?.runtime.readiness.missingEvidence.slice(0, 2).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
          <div className="gpu-sparkline" aria-label="GPU utilization samples">
            {overview?.runtime.gpu.samples.map((sample) => (
              <span
                key={sample.timestamp}
                title={`${shortTime(sample.timestamp)} ${sample.utilizationPercent}%`}
                style={{ "--gpu": `${sample.utilizationPercent}%` } as CSSProperties}
              />
            ))}
          </div>
        </article>

        <article
          className="ops-card metric-admin-card"
          data-testid="opslens-incident-metrics"
        >
          <div className="card-title-row">
            <h3>{copy.incidentMetrics}</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <div className="metric-query-list">
            {metricQueries?.map((query) => (
              <div className="metric-query-row" key={`${query.name}-${query.query}`}>
                <span className={`freshness ${statusClass(query.status)}`}>
                  {statusText(language, query.status)}
                </span>
                <strong>{query.name}</strong>
                <small>
                  {query.sampleCount} {copy.metricSamples}
                </small>
              </div>
            ))}
          </div>
          <div
            className="remediation-review-list"
            data-testid="opslens-remediation-proposals"
          >
            {remediationProposals.map(({ incident, proposal }) => (
              <div
                className="remediation-review"
                data-testid="opslens-remediation-proposal"
                key={`${incident.incidentId}-${proposal.target.name}`}
              >
                <div className="card-title-row compact">
                  <div>
                    <h4>{incident.alertName}</h4>
                    <small>
                      {proposal.target.kind}/{proposal.target.name}
                    </small>
                  </div>
                  <FileDiff size={18} aria-hidden="true" />
                </div>
                <div className="remediation-target-grid">
                  <div>
                    <span>{copy.toolMode}</span>
                    <strong>{actionModeText(language, proposal.actionMode)}</strong>
                  </div>
                  <div>
                    <span>{copy.patch}</span>
                    <strong>{proposal.patchType}</strong>
                  </div>
                  <div>
                    <span>{copy.current}</span>
                    <strong>{proposal.currentValue.value}</strong>
                  </div>
                  <div>
                    <span>{copy.proposed}</span>
                    <strong>{proposal.proposedValue.value}</strong>
                  </div>
                </div>
                <pre className="remediation-yaml">{proposal.yamlPatch}</pre>
                <div className="admin-evidence-line">
                  <span>{copy.mutationAllowed}: {booleanText(language, false)}</span>
                  <span>
                    {copy.reviewGate}:{" "}
                    {booleanText(language, proposal.reviewGate.required)}
                  </span>
                  <span>
                    {copy.targetConfidence}: {proposal.target.confidence}
                  </span>
                  <span>{proposal.target.fieldPath}</span>
                </div>
                <div
                  className="admin-evidence-line"
                  data-testid="opslens-remediation-trigger-evidence"
                >
                  <span>
                    {copy.logs}:{" "}
                    {booleanText(
                      language,
                      proposal.triggerEvidence.logs.currentRead
                    )}
                    /
                    {proposal.triggerEvidence.logs.windowMinutes}m
                  </span>
                  <span>
                    {copy.events}:{" "}
                    {booleanText(language, proposal.triggerEvidence.events.read)}
                    /
                    {proposal.triggerEvidence.events.count}
                  </span>
                  <span>
                    {copy.metrics}:{" "}
                    {proposal.triggerEvidence.metrics.queries
                      .map(
                        (query) =>
                          `${query.name}:${statusText(language, query.status)}`
                      )
                      .join(", ")}
                  </span>
                  <span>
                    {copy.runbooks}:{" "}
                    {proposal.triggerEvidence.runbookCitations.length}
                  </span>
                </div>
                <div className="remediation-notes">
                  <p>{proposal.risks[0]}</p>
                  <p>{proposal.rollbackPath[0]}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article
          className="ops-card aiops-pipeline-card"
          data-testid="opslens-aiops-pipeline"
        >
          <div className="card-title-row">
            <h3>{copy.aiOpsPipeline}</h3>
            <ListChecks size={18} aria-hidden="true" />
          </div>
          <div className="readiness-grid">
            <div>
              <span>{copy.status}</span>
              <strong
                className={`freshness ${statusClass(
                  aiopsPipeline?.status ?? "needs-live-evidence"
                )}`}
              >
                {statusText(
                  language,
                  aiopsPipeline?.status ?? "needs-live-evidence"
                )}
              </strong>
            </div>
            <div>
              <span>{copy.liveSmoke}</span>
              <strong>
                {statusText(language, aiopsPipeline?.liveSmokeStatus ?? "missing")}
              </strong>
            </div>
            <div>
              <span>{copy.head}</span>
              <strong>{aiopsPipeline?.headSha ?? "missing"}</strong>
            </div>
            <div>
              <span>{copy.selectedPod}</span>
              <strong>
                {aiopsPipeline?.selectedPod
                  ? `${aiopsPipeline.selectedPod.namespace}/${aiopsPipeline.selectedPod.name}`
                  : "missing"}
              </strong>
            </div>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-aiops-pipeline-evidence"
          >
            <span>
              {actionModeText(
                language,
                aiopsPipeline?.actionMode ?? "readOnlyEvidenceOnly"
              )}
            </span>
            <span>
              {copy.clusterMutationAttempted}:{" "}
              {booleanText(language, aiopsPipeline?.clusterMutationAttempted ?? false)}
            </span>
            <span>
              {copy.vectorWriteAttempted}:{" "}
              {booleanText(language, aiopsPipeline?.vectorWriteAttempted ?? false)}
            </span>
            <span>
              {copy.ingestionJobCreated}:{" "}
              {booleanText(language, aiopsPipeline?.ingestionJobCreated ?? false)}
            </span>
            <span>verify:aiops</span>
            <span>
              {copy.triggerEvidence}:{" "}
              {(aiopsPipeline?.triggerEvidenceRequired ?? []).join("/")}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-aiops-monitoring-proxy-handoff"
          >
            <span>{copy.monitoringProxy}</span>
            <span>
              {actionModeText(
                language,
                monitoringProxyHandoff?.actionMode ?? "handoffOnly"
              )}
            </span>
            <span>
              {copy.status}:{" "}
              {statusText(
                language,
                monitoringProxyHandoff?.status ?? "needs-evidence"
              )}
            </span>
            <span>
              {copy.owner}: {monitoringProxyHandoff?.owner ?? "cluster-sre"}
            </span>
            <span>
              {copy.enabled}:{" "}
              {booleanText(language, monitoringProxyHandoff?.enabled ?? false)}
            </span>
            <span>
              {copy.reachable}:{" "}
              {booleanText(language, monitoringProxyHandoff?.reachable ?? false)}
            </span>
            <span>
              {copy.approvalRequired}:{" "}
              {booleanText(language, monitoringProxyHandoff?.approvalRequired ?? true)}
            </span>
            <span>
              {copy.missingQueries}:{" "}
              {(monitoringProxyHandoff?.missingQueries ?? []).length}
            </span>
            <span>
              {copy.mutationByVerifier}:{" "}
              {booleanText(
                language,
                monitoringProxyHandoff?.mutationAllowedByThisVerifier ?? false
              )}
            </span>
            <span>
              {copy.ticket}:{" "}
              {monitoringProxyHandoff?.ticketPacket?.id ??
                "cluster-sre-monitoring-proxy-ticket"}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-aiops-monitoring-proxy-commands"
          >
            <span>
              {copy.nextCommand}:{" "}
              {monitoringProxyHandoff?.nextCommand ?? "npm run verify:aiops"}
            </span>
            {(monitoringProxyHandoff?.readOnlyCommands ?? []).map((command) => (
              <span key={command.id}>
                {command.id} / {copy.mutationAllowed}:{" "}
                {booleanText(language, command.mutation)}
              </span>
            ))}
            <span>
              {copy.firstAction}:{" "}
              {monitoringProxyHandoff?.ticketPacket?.firstReadOnlyAction.id ??
                "aiops-monitoring-proxy-smoke"}
            </span>
            <span>
              {copy.approvalAction}:{" "}
              {monitoringProxyHandoff?.ticketPacket?.approvalGatedAction.id ??
                "approval-gated-enable-monitoring-proxy-path"}
            </span>
            <span>
              {copy.requiresApproval}:{" "}
              {booleanText(
                language,
                monitoringProxyHandoff?.ticketPacket?.approvalGatedAction
                  .requiresExplicitApproval ?? true
              )}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-alertmanager-intake"
          >
            <span>{copy.alertmanager}</span>
            <span>
              {alertmanagerIntake?.artifactType ??
                "opslens.alertmanager-incident-intake.v0.1"}
            </span>
            <span>
              {copy.acceptedAlerts}: {alertmanagerIntake?.acceptedCount ?? 0}/
              {alertmanagerIntake?.alertCount ?? 0}
            </span>
            <span>
              {copy.rawAlertReturned}:{" "}
              {booleanText(language, alertmanagerIntake?.rawAlertReturned ?? false)}
            </span>
            <span>
              {copy.clusterMutationAttempted}:{" "}
              {booleanText(
                language,
                alertmanagerIntake?.clusterMutationAttempted ?? false
              )}
            </span>
            <span>
              {copy.mutationAllowed}:{" "}
              {booleanText(language, alertmanagerIntake?.mutationAllowed ?? false)}
            </span>
          </div>
          <div className="metric-query-list">
            {aiopsPipeline?.metricQueries.map((query) => (
              <div className="metric-query-row" key={query.name}>
                <span className={`freshness ${statusClass(query.status)}`}>
                  {statusText(language, query.status)}
                </span>
                <strong>{query.name}</strong>
                <small>
                  {query.sampleCount} {copy.metricSamples}
                </small>
              </div>
            ))}
          </div>
          <div className="remediation-notes">
            {(aiopsPipeline?.missingEvidence.length
              ? aiopsPipeline.missingEvidence
              : aiopsPipeline?.evidence ?? []
            )
              .slice(0, 2)
              .map((item) => (
                <p key={item}>{item}</p>
              ))}
          </div>
        </article>

        <article
          className="ops-card readiness-admin-card"
          data-testid="opslens-install-readiness"
        >
          <div className="card-title-row">
            <h3>{copy.installReadiness}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="readiness-grid">
            {overview
              ? [
                  {
                    id: "lightspeed-mcp",
                    label: copy.lightspeedMcp,
                    value: overview.installReadiness.lightspeedMcp
                  },
                  {
                    id: "environment",
                    label: copy.environment,
                    value: overview.installReadiness.environmentIsolation
                  },
                  {
                    id: "extension-point",
                    label: copy.extensionPoint,
                    value: overview.installReadiness.lightspeedExtensionPoint
                  },
                  {
                    id: "aiops-pipeline",
                    label: copy.aiOpsPipeline,
                    value: overview.aiops.incidentPipeline.status
                  },
                  {
                    id: "console-dashboard",
                    label: copy.consoleDashboard,
                    value: overview.installReadiness.consoleDashboard
                  },
                  {
                    id: "operator",
                    label: copy.operator,
                    value: overview.installReadiness.operatorPackaging
                  },
                  {
                    id: "ocp-connectivity",
                    label: copy.ocpConnectivity,
                    value: overview.installReadiness.ocpConnectivity
                  },
                  {
                    id: "operator-package",
                    label: copy.operatorPackage,
                    value: overview.installReadiness.operatorPackage
                  },
                  {
                    id: "operator-dry-run",
                    label: copy.operatorDryRun,
                    value: overview.installReadiness.operatorDryRun
                  },
                  {
                    id: "operator-boundary",
                    label: copy.operatorBoundary,
                    value: overview.installReadiness.operatorRuntimeBoundary
                  },
                  {
                    id: "install-plan",
                    label: copy.installPlan,
                    value: overview.installReadiness.installPlan
                  },
                  {
                    id: "rag-ingestion",
                    label: copy.ragIngestion,
                    value: overview.installReadiness.approvalPlan.ragIngestion.status
                  },
                  {
                    id: "certification-evidence",
                    label: copy.certificationEvidence,
                    value: overview.installReadiness.certificationReadiness
                  },
                  {
                    id: "community-submission",
                    label: copy.communitySubmission,
                    value: overview.installReadiness.communityOperatorSubmission
                  },
                  {
                    id: "catalog-toolchain",
                    label: copy.catalogToolchain,
                    value: overview.installReadiness.catalogToolchain
                  },
                  {
                    id: "lab-bootstrap",
                    label: copy.labBootstrap,
                    value: overview.installReadiness.labBootstrap
                  },
                  {
                    id: "lab-handoff",
                    label: copy.labHandoff,
                    value: overview.installReadiness.labHandoff
                  },
                  {
                    id: "image-builds",
                    label: copy.imageBuilds,
                    value: overview.installReadiness.imageBuilds
                  },
                  {
                    id: "owned-provenance",
                    label: copy.ownedProvenance,
                    value: overview.installReadiness.ownedImageProvenance
                  },
                  {
                    id: "external-runtime",
                    label: copy.externalRuntime,
                    value: overview.installReadiness.externalRuntimeImages
                  },
                  {
                    id: "runtime-review",
                    label: copy.runtimeReview,
                    value: overview.installReadiness.externalRuntimeReviewPacket
                  },
                  {
                    id: "security-scan",
                    label: copy.securityScan,
                    value: overview.installReadiness.securityScan
                  },
                  {
                    id: "release-publish",
                    label: copy.releasePublish,
                    value: overview.installReadiness.releasePublish
                  },
                  {
                    id: "release-refresh",
                    label: copy.releaseRefresh,
                    value: overview.installReadiness.releaseRefresh
                  },
                  {
                    id: "release-bundle",
                    label: copy.releaseBundle,
                    value: overview.installReadiness.releaseEvidenceBundle
                  },
                  {
                    id: "release-action",
                    label: copy.releaseAction,
                    value: overview.installReadiness.releaseActionQueue
                  },
                  {
                    id: "roadmap-completion",
                    label: copy.roadmapCompletion,
                    value: overview.installReadiness.roadmapCompletion.status
                  },
                  {
                    id: "completion-gate",
                    label: copy.completionGate,
                    value: overview.installReadiness.completionGate.status
                  },
                  {
                    id: "pre-cluster-gate",
                    label: copy.preClusterGate,
                    value: overview.installReadiness.preClusterInstallGate.status
                  },
                  {
                    id: "evidence-checkpoint",
                    label: copy.evidenceCheckpoint,
                    value: overview.installReadiness.evidenceCheckpoint
                  },
                  {
                    id: "live-handoff",
                    label: copy.liveHandoff,
                    value: overview.installReadiness.liveHandoff
                  },
                  {
                    id: "network-handoff",
                    label: copy.networkHandoff,
                    value: overview.installReadiness.ocpNetworkHandoff
                  },
                  {
                    id: "handoff-fallback",
                    label: copy.handoffFallback,
                    value: overview.installReadiness.ocpNetworkHandoffApiFallback
                  },
                  {
                    id: "auth-rbac-plan",
                    label: copy.authRbacPlan,
                    value: overview.installReadiness.ocpAuthRbacPlan
                  },
                  {
                    id: "certification",
                    label: copy.certification,
                    value: overview.installReadiness.certification
                  }
                ].map(({ id, label, value }) => (
                  <div key={id}>
                    <span>{label}</span>
                    <strong
                      className={`freshness ${statusClass(String(value))}`}
                      title={String(value)}
                    >
                      {statusText(language, String(value))}
                    </strong>
                  </div>
                ))
              : null}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-install-readiness-evidence"
          >
            <span>dashboard-only</span>
            <span>mutationAllowed=false</span>
            <span>rawDocumentReturned=false</span>
          </div>
          {overview?.installReadiness.evidence.slice(0, 3).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
          {completionGate ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-completion-gate"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>{copy.completionGate}</h4>
                  <small>{actionModeText(language, completionGate.actionMode)}</small>
                </div>
                <Gauge size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span title={completionGate.artifactStatus}>
                  {statusText(language, completionGate.artifactStatus)}
                </span>
                <span>
                  {copy.head}: {completionGate.headSha}
                </span>
                <span>
                  {copy.dirty}:{" "}
                  {booleanText(language, completionGate.worktreeDirty)}
                </span>
                <span>
                  {copy.readyToClaim100}:{" "}
                  {booleanText(language, completionGate.readyToClaim100)}
                </span>
                <span>
                  {copy.mutationAllowed}:{" "}
                  {booleanText(language, completionGate.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.complete}</span>
                  <strong>{completionGate.percentComplete}%</strong>
                </div>
                <div>
                  <span>{copy.passed}</span>
                  <strong>
                    {completionGate.passedRequirements}/
                    {completionGate.totalRequirements}
                  </strong>
                </div>
                <div>
                  <span>{copy.remaining}</span>
                  <strong>{completionGate.remainingRequirements}</strong>
                </div>
                <div>
                  <span>{copy.external}</span>
                  <strong>{completionGate.remainingExternalStateCount}</strong>
                </div>
                <div>
                  <span>{copy.local}</span>
                  <strong>{completionGate.remainingLocalOnlyCount}</strong>
                </div>
                <div>
                  <span>{copy.status}</span>
                  <strong
                    className={`freshness ${statusClass(
                      completionGate.status
                    )}`}
                  >
                    {statusText(language, completionGate.status)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-remaining"
              >
                {completionGate.remainingTo100.slice(0, 8).map((gate) => (
                  <span key={`${gate.stage}-${gate.gateId}`}>
                    {gate.gateId}: {gate.lane} / {copy.owner} {gate.owner} /{" "}
                    {copy.priority} {gate.priority} / {copy.nextCommand}{" "}
                    {gate.nextCommand} / {copy.external}{" "}
                    {booleanText(language, gate.externalStateRequired)} /{" "}
                    {copy.ticket} {gate.ticketIds.join(",") || copy.none} /{" "}
                    {copy.readOnlyCommands}{" "}
                    {gate.readOnlyCommandIds.slice(0, 3).join(",") ||
                      copy.none}{" "}
                    / {copy.setupCommands}{" "}
                    {gate.setupCommandIds.slice(0, 3).join(",") || copy.none}{" "}
                    / {copy.gatedCommands}{" "}
                    {gate.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      copy.none}
                  </span>
                ))}
                {completionGate.remainingTo100.length === 0 ? (
                  <span>{copy.none}</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-claim-requirements"
              >
                {completionGate.claimRequirements.map((requirement) => (
                  <span key={requirement.id}>
                    {requirement.id}: {copy.passed}{" "}
                    {booleanText(language, requirement.passed)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-claim-packet"
              >
                <span>
                  {copy.owner}: {completionGate.claimPacket.owner}
                </span>
                <span>
                  {copy.status}:{" "}
                  {statusText(language, completionGate.claimPacket.status)}
                </span>
                <span>
                  {copy.packet}:{" "}
                  {completionGate.claimPacket.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                </span>
                <span>
                  {copy.exists}:{" "}
                  {booleanText(language, completionGate.claimPacket.exists)}
                </span>
                <span>
                  {copy.readyToClaim100}:{" "}
                  {booleanText(language, completionGate.claimPacket.readyToClaim100)}
                </span>
                <span>
                  {copy.remaining}:{" "}
                  {completionGate.claimPacket.remainingRequirements}
                </span>
                <span>
                  {copy.completionGates}:{" "}
                  {completionGate.claimPacket.remainingGateIds.join(",") ||
                    copy.none}
                </span>
                <span>
                  {copy.failedRequirements}:{" "}
                  {completionGate.claimPacket.failedClaimRequirementIds.join(
                    ","
                  ) || copy.none}
                </span>
                <span>
                  {copy.sourceArtifacts}:{" "}
                  {completionGate.claimPacket.sourceEvidenceChecklist
                    .map(
                      (source) =>
                        `${source.id}:${
                          source.fresh &&
                          source.acceptable &&
                          !source.mutationViolation
                            ? statusText(language, "pass")
                            : statusText(language, "needs-evidence")
                        }`
                    )
                    .join(",") || copy.none}
                </span>
                <span>
                  {copy.failedSources}:{" "}
                  {completionGate.claimPacket.failedSourceEvidenceIds.join(
                    ","
                  ) || copy.none}
                </span>
                <span>
                  {copy.closure}:{" "}
                  {completionGate.claimPacket.gateClosureMatrix
                    .map(
                      (gate) =>
                        `${gate.gateId}:${gate.owner}:${gate.closesClaimRequirementIds.length}`
                    )
                    .join(",") || copy.none}
                </span>
                <span>
                  {copy.criticalPath}:{" "}
                  {completionGate.claimPacket.actionQueueCriticalPathCount}
                </span>
                <span>
                  {copy.mutationAllowed}:{" "}
                  {booleanText(
                    language,
                    completionGate.claimPacket.mutationBoundaryPassed
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-owner-closeout"
              >
                {completionGate.ownerCloseoutPackets.map((packet) => (
                  <span key={packet.owner}>
                    {copy.owner}: {packet.owner} / {copy.completionGates}{" "}
                    {packet.gateIds.join(",") || copy.none} / {copy.ticket}{" "}
                    {packet.ticketIds.join(",") || copy.none} /{" "}
                    {copy.nextCommand} {packet.firstNextCommand} /{" "}
                    {copy.requiresApproval}{" "}
                    {booleanText(language, packet.approvalRequired)} /{" "}
                    {copy.readOnlyCommands}{" "}
                    {packet.readOnlyCommandIds.slice(0, 3).join(",") ||
                      copy.none}{" "}
                    / {copy.setupCommands}{" "}
                    {packet.setupCommandIds.slice(0, 3).join(",") || copy.none}{" "}
                    / {copy.gatedCommands}{" "}
                    {packet.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      copy.none}{" "}
                    / {copy.packet} {packet.markdownPath.split(/[\\/]/).pop()}{" "}
                    / {copy.exists} {booleanText(language, packet.exists)}
                  </span>
                ))}
                <span>
                  {copy.cleanupDeletionAllowed}:{" "}
                  {booleanText(
                    language,
                    completionGate.ownerPacketCleanup.deletionAllowed
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-closeout-execution-plan"
              >
                {completionGate.closeoutExecutionPlan.map((row) => (
                  <span key={row.owner}>
                    {copy.owner}: {row.owner} / {copy.status}{" "}
                    {statusText(language, row.status)} / {copy.firstAction}{" "}
                    {row.firstNextCommand} / {copy.readOnlyCommands}{" "}
                    {row.firstReadOnlyCommandId} / {copy.setupCommands}{" "}
                    {row.firstSetupCommandId} / {copy.approvalAction}{" "}
                    {row.firstApprovalGatedCommandId} / {copy.requiresApproval}{" "}
                    {booleanText(language, row.approvalRequired)} /{" "}
                    {copy.mutationAllowed}{" "}
                    {booleanText(language, row.mutationAllowedByThisVerifier)}
                  </span>
                ))}
                {completionGate.closeoutExecutionPlan.length === 0 ? (
                  <span>{copy.none}</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-boundary"
              >
                <span>
                  {copy.bundleStatus}:{" "}
                  {statusText(
                    language,
                    completionGate.releaseEvidenceBundle.status
                  )}
                </span>
                <span>
                  {copy.bundleMatchesRoadmap}:{" "}
                  {booleanText(
                    language,
                    completionGate.releaseEvidenceBundle.bundleMatchesRoadmap
                  )}
                </span>
                <span>
                  {copy.publishReady}:{" "}
                  {booleanText(
                    language,
                    completionGate.releaseEvidenceBundle.decision.publishReady
                  )}
                </span>
                <span>
                  {copy.installReady}:{" "}
                  {booleanText(
                    language,
                    completionGate.releaseEvidenceBundle.decision.installReady
                  )}
                </span>
                <span>
                  {copy.actionQueueReady}:{" "}
                  {booleanText(language, completionGate.actionQueue.ready)}
                </span>
                <span>
                  {copy.criticalPath}:{" "}
                  {completionGate.actionQueue.criticalPathCount}
                </span>
                <span>
                  {copy.unsafeTickets}:{" "}
                  {completionGate.actionQueue.unsafeTickets.join(",") ||
                    copy.none}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {completionGate.risk[0] ??
                    "Completion gate is evidence-only and cannot approve mutation."}
                </p>
                <p>
                  {completionGate.rollbackPath[0] ??
                    "Regenerate completion evidence after release evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {preClusterInstallGate ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-pre-cluster-install-gate"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Pre-cluster Install Gate</h4>
                  <small>{preClusterInstallGate.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{preClusterInstallGate.artifactStatus}</span>
                <span>head={preClusterInstallGate.headSha}</span>
                <span>
                  dirty={String(preClusterInstallGate.worktreeDirty)}
                </span>
                <span>
                  safeToRunClusterInstall=
                  {String(preClusterInstallGate.safeToRunClusterInstall)}
                </span>
                <span>
                  strictExitWouldFail=
                  {String(preClusterInstallGate.strictExitWouldFail)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Status</span>
                  <strong
                    className={`freshness ${statusClass(
                      preClusterInstallGate.status
                    )}`}
                  >
                    {preClusterInstallGate.status}
                  </strong>
                </div>
                <div>
                  <span>Failed Gates</span>
                  <strong>{preClusterInstallGate.failedGateIds.length}</strong>
                </div>
                <div>
                  <span>First Blocker</span>
                  <strong>
                    {preClusterInstallGate.firstBlockedGate?.id ?? "none"}
                  </strong>
                </div>
                <div>
                  <span>External/Local</span>
                  <strong>
                    external=
                    {preClusterInstallGate.blockerSummary.remainingExternalStateCount}
                    , local=
                    {preClusterInstallGate.blockerSummary.remainingLocalOnlyCount}
                  </strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>{preClusterInstallGate.sources.length}</strong>
                </div>
                <div>
                  <span>Read-only</span>
                  <strong>{preClusterInstallGate.readOnlyCommands.length}</strong>
                </div>
                <div>
                  <span>Command Plan</span>
                  <strong>
                    live={preClusterInstallGate.commandPlan.directLive.length},
                    prep=
                    {preClusterInstallGate.commandPlan.localPreparation.length}
                  </strong>
                </div>
                <div>
                  <span>Approval</span>
                  <strong>
                    {preClusterInstallGate.approvalGatedCommandsNotRun.length}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-pre-cluster-install-gate-requirements"
              >
                {preClusterInstallGate.gateRequirements.map((gate) => (
                  <span key={gate.id}>
                    {gate.id}:{gate.owner}:{String(gate.passed)}:next=
                    {gate.nextCommand}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-pre-cluster-install-gate-boundary"
              >
                <span>
                  failed=
                  {preClusterInstallGate.failedGateIds.join(",") || "none"}
                </span>
                <span>
                  firstBlocked=
                  {preClusterInstallGate.firstBlockedGate?.id ?? "none"}:
                  {preClusterInstallGate.firstBlockedGate?.owner ?? "none"}
                </span>
                <span>
                  firstNext=
                  {preClusterInstallGate.firstBlockedGate?.nextCommand ?? "none"}
                </span>
                <span>
                  firstReadOnly=
                  {preClusterInstallGate.firstBlockedGate?.readOnlyCommandId ??
                    "none"}
                </span>
                <span>
                  remainingExternalState=
                  {preClusterInstallGate.blockerSummary.remainingExternalStateGateIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  remainingLocalOnly=
                  {preClusterInstallGate.blockerSummary.remainingLocalOnlyGateIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  staleExternal=
                  {preClusterInstallGate.blockerSummary.staleExternalStateSourceIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  directLive=
                  {preClusterInstallGate.blockerSummary.directExternalReadinessGateIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  localPrep=
                  {preClusterInstallGate.blockerSummary.localPreparationGateIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  aggregate=
                  {preClusterInstallGate.blockerSummary.aggregateBlockedGateIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  planFirst=
                  {preClusterInstallGate.commandPlan.firstReadOnlyCommandId}
                </span>
                <span>
                  planStrict={preClusterInstallGate.commandPlan.strictCommandId}
                </span>
                <span>
                  planDirectLive=
                  {preClusterInstallGate.commandPlan.directLive
                    .map((item) => `${item.gateId}:${item.command}`)
                    .join("|") || "none"}
                </span>
                <span>
                  planLocalPrep=
                  {preClusterInstallGate.commandPlan.localPreparation
                    .map((item) => `${item.gateId}:${item.command}`)
                    .join("|") || "none"}
                </span>
                <span>
                  planAggregate=
                  {preClusterInstallGate.commandPlan.aggregate
                    .map((item) => `${item.gateId}:${item.command}`)
                    .join("|") || "none"}
                </span>
                <span>
                  sources=
                  {preClusterInstallGate.sources
                    .map(
                      (source) =>
                        `${source.id}:${source.fresh && !source.mutationViolation ? "pass" : "needs-evidence"}`
                    )
                    .join(",") || "none"}
                </span>
                <span>
                  readOnly=
                  {preClusterInstallGate.readOnlyCommands
                    .map((command) => command.id)
                    .join(",") || "none"}
                </span>
                <span>
                  approvalNotRun=
                  {preClusterInstallGate.approvalGatedCommandsNotRun
                    .map((command) => command.id)
                    .join(",") || "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-pre-cluster-owner-command-plan"
              >
                {preClusterInstallGate.ownerCommandPlan.map((row) => (
                  <span key={row.owner}>
                    {row.owner}:status={row.status}:firstLane=
                    {row.firstLane}:firstGate={row.firstGateId}:firstReadOnly=
                    {row.firstReadOnlyCommandId}:strict={row.strictCommandId}
                    :directLive=
                    {row.directLiveGateIds.join(",") || "none"}:localPrep=
                    {row.localPreparationGateIds.join(",") || "none"}
                    :aggregate={row.aggregateGateIds.join(",") || "none"}
                    :approvalNotRun=
                    {row.approvalGatedCommandIds.join(",") || "none"}
                    :mutationAllowed=
                    {String(row.mutationAllowedByThisVerifier)}
                  </span>
                ))}
                {preClusterInstallGate.ownerCommandPlan.length === 0 ? (
                  <span>none</span>
                ) : null}
              </div>
              <div className="remediation-notes">
                <p>
                  {preClusterInstallGate.risk[0] ??
                    "Pre-cluster gate blocks install until evidence is ready."}
                </p>
                <p>
                  {preClusterInstallGate.rollbackPath[0] ??
                    "No rollback is required for the verifier itself."}
                </p>
              </div>
            </div>
          ) : null}
          {roadmapCompletion ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-roadmap-completion"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>{copy.roadmapCompletion}</h4>
                  <small>{actionModeText(language, roadmapCompletion.actionMode)}</small>
                </div>
                <Gauge size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span title={roadmapCompletion.artifactStatus}>
                  {statusText(language, roadmapCompletion.artifactStatus)}
                </span>
                <span>
                  {copy.head}: {roadmapCompletion.headSha}
                </span>
                <span>
                  {copy.dirty}:{" "}
                  {booleanText(language, roadmapCompletion.worktreeDirty)}
                </span>
                <span>
                  {copy.mutationAllowed}:{" "}
                  {booleanText(language, roadmapCompletion.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.complete}</span>
                  <strong>{roadmapCompletion.percentComplete}%</strong>
                </div>
                <div>
                  <span>{copy.passed}</span>
                  <strong>
                    {roadmapCompletion.passedRequirements}/
                    {roadmapCompletion.totalRequirements}
                  </strong>
                </div>
                <div>
                  <span>{copy.remaining}</span>
                  <strong>{roadmapCompletion.remainingRequirements}</strong>
                </div>
                <div>
                  <span>{copy.blockers}</span>
                  <strong>{roadmapCompletion.criticalPathBlockerCount}</strong>
                </div>
                <div>
                  <span>{copy.status}</span>
                  <strong
                    className={`freshness ${statusClass(
                      roadmapCompletion.status
                    )}`}
                  >
                    {statusText(language, roadmapCompletion.status)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-remaining-gates"
              >
                {roadmapCompletion.remaining.slice(0, 8).map((entry) => (
                  <span key={`${entry.stage}-${entry.id}`}>
                    {entry.stage}/{entry.id}: {copy.status}{" "}
                    {statusText(language, entry.status)}
                  </span>
                ))}
                {roadmapCompletion.remaining.length === 0 ? (
                  <span>{copy.none}</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-closure-boundary"
              >
                <span>
                  {copy.external}:{" "}
                  {roadmapCompletion.remainingExternalStateCount}
                </span>
                <span>
                  {copy.local}: {roadmapCompletion.remainingLocalOnlyCount}
                </span>
                <span>
                  {copy.external} {copy.completionGates}:{" "}
                  {roadmapCompletion.remainingExternalStateGateIds.join(",") ||
                    copy.none}
                </span>
                <span>
                  {copy.local} {copy.completionGates}:{" "}
                  {roadmapCompletion.remainingLocalOnlyGateIds.join(",") ||
                    copy.none}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-remaining-handoffs"
              >
                {roadmapCompletion.remainingHandoffs.slice(0, 8).map((entry) => (
                  <span key={`${entry.stage}-${entry.gateId}-${entry.actionId}`}>
                    {entry.gateId}: {copy.owner} {entry.owner} /{" "}
                    {copy.priority} {entry.priority} / {copy.nextCommand}{" "}
                    {entry.nextCommand} / {copy.external}{" "}
                    {booleanText(language, entry.externalStateRequired)} /{" "}
                    {copy.ticket} {entry.ticketIds.join(",") || copy.none} /{" "}
                    {copy.readOnlyCommands}{" "}
                    {entry.readOnlyCommandIds.slice(0, 3).join(",") ||
                      copy.none}{" "}
                    / {copy.setupCommands}{" "}
                    {entry.setupCommandIds.slice(0, 3).join(",") || copy.none}{" "}
                    / {copy.gatedCommands}{" "}
                    {entry.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      copy.none}
                  </span>
                ))}
                {roadmapCompletion.remainingHandoffs.length === 0 ? (
                  <span>{copy.none}</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-critical-path-blockers"
              >
                {roadmapCompletion.criticalPathBlockers
                  .slice(0, 6)
                  .map((entry) => (
                    <span key={`${entry.lane}-${entry.actionId}`}>
                      {copy.owner}: {entry.owner} / {entry.actionId} /{" "}
                      {copy.nextCommand}: {entry.nextCommand}
                    </span>
                  ))}
                {roadmapCompletion.criticalPathBlockers.length === 0 ? (
                  <span>{copy.none}</span>
                ) : null}
              </div>
              <div className="remediation-notes">
                <p>
                  {roadmapCompletion.risk[0] ??
                    "Roadmap completion is evidence-only and cannot approve mutation."}
                </p>
                <p>
                  {roadmapCompletion.rollbackPath[0] ??
                    "Regenerate roadmap evidence after release evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {extensionPoint ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-lightspeed-extension-point"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Lightspeed Extension Point</h4>
                  <small>{extensionPoint.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{extensionPoint.artifactStatus}</span>
                <span>contract={extensionPoint.productContract}</span>
                <span>endpoint={extensionPoint.lightspeedFacingEndpoint}</span>
                <span>smoke={extensionPoint.localSmokeEndpoint}</span>
                <span>
                  webhook=
                  {String(extensionPoint.undocumentedWebhookSupported)}
                </span>
                <span>
                  legacyConfigMap=
                  {String(extensionPoint.legacyConfigMapRegistrationSupported)}
                </span>
                <span>
                  technologyPreview=
                  {String(extensionPoint.technologyPreview)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-olsconfig"
              >
                <span>{extensionPoint.olsconfig.kind}</span>
                <span>
                  server={extensionPoint.olsconfig.server.name}
                </span>
                <span>
                  url={extensionPoint.olsconfig.server.url}
                </span>
                <span>
                  featureGates=
                  {extensionPoint.olsconfig.featureGates.join(", ") ||
                    "missing"}
                </span>
                <span>
                  userBearer=
                  {String(extensionPoint.olsconfig.server.userBearerForwarding)}
                </span>
                <span>
                  secretHeader=
                  {String(extensionPoint.olsconfig.server.secretHeader)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-routes"
              >
                {extensionPoint.routes.map((route) => (
                  <span key={`${route.method}-${route.path}`}>
                    {route.method} {route.path}:{route.role}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-boundary"
              >
                <span>
                  clusterMutationAttempted=
                  {String(
                    extensionPoint.mutationBoundary.clusterMutationAttempted
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    extensionPoint.mutationBoundary.registryMutationAttempted
                  )}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(extensionPoint.mutationBoundary.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(
                    extensionPoint.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {extensionPoint.evidence[0] ??
                    "Extension point evidence is read-only."}
                </p>
                <p>
                  {extensionPoint.risk[0] ??
                    "Live OLSConfig registration still needs approval."}
                </p>
              </div>
            </div>
          ) : null}
          {operatorPackage ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-operator-package"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Operator Package</h4>
                  <small>{operatorPackage.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{operatorPackage.artifactStatus}</span>
                <span>head={operatorPackage.headSha}</span>
                <span>dirty={String(operatorPackage.worktreeDirty)}</span>
                <span>
                  clusterMutationAttempted=
                  {String(operatorPackage.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(operatorPackage.registryMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(operatorPackage.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-boundary"
              >
                <span>
                  staticOlsConfig=
                  {String(
                    operatorPackage.packageBoundary.staticStackContainsOlsConfig
                  )}
                </span>
                <span>
                  staticRegistration=
                  {String(
                    operatorPackage.packageBoundary
                      .staticStackAppliesLightspeedRegistration
                  )}
                </span>
                <span>
                  appObjects=
                  {operatorPackage.packageBoundary.appManifestObjectCount}
                </span>
                <span>
                  approvalGatedTemplate=
                  {String(
                    operatorPackage.packageBoundary.approvalGatedTemplateExists
                  )}
                </span>
                <span>
                  mode={operatorPackage.packageBoundary.reconcileMode}
                </span>
                <span>
                  approvalGatedOnly=
                  {String(operatorPackage.packageBoundary.approvalGatedOnly)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-olsconfig"
              >
                <span>{operatorPackage.packageBoundary.olsconfigTemplateKind}</span>
                <span>
                  name={operatorPackage.packageBoundary.olsconfigTemplateName}
                </span>
                <span>
                  namespace=
                  {operatorPackage.packageBoundary.olsconfigTemplateNamespace}
                </span>
                <span>
                  server={operatorPackage.packageBoundary.mcpServerName}
                </span>
                <span>
                  featureGates=
                  {operatorPackage.packageBoundary.featureGates.join(", ") ||
                    "missing"}
                </span>
                <span>
                  headers=
                  {operatorPackage.packageBoundary.headerTypes.join(", ") ||
                    "missing"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-forbidden"
              >
                {operatorPackage.packageBoundary.forbiddenRegistrationPaths
                  .slice(0, 3)
                  .map((path) => (
                    <span key={path}>{path}</span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {operatorPackage.evidence[0] ??
                    "Operator package evidence is read-only."}
                </p>
                <p>
                  {operatorPackage.rollbackPath[0] ??
                    operatorPackage.packageBoundary.rollbackPath}
                </p>
              </div>
            </div>
          ) : null}
          {operatorRuntimeBoundary ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-operator-runtime-boundary"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Operator Runtime Boundary</h4>
                  <small>{operatorRuntimeBoundary.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{operatorRuntimeBoundary.artifactStatus}</span>
                <span>head={operatorRuntimeBoundary.headSha}</span>
                <span>
                  dirty={String(operatorRuntimeBoundary.worktreeDirty)}
                </span>
                <span>
                  mode={operatorRuntimeBoundary.parity.lightspeedMode}
                </span>
                <span>
                  phase={operatorRuntimeBoundary.parity.lightspeedPhase}
                </span>
                <span>
                  willPatch=
                  {String(operatorRuntimeBoundary.parity.willPatchLightspeed)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-runtime-boundary-guards"
              >
                <span>
                  ValidateOnlyBeforeRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .validateOnlyGuardBeforeRead
                  )}
                </span>
                <span>
                  endpointBeforeRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .endpointGuardBeforeRead
                  )}
                </span>
                <span>
                  patchCallCount=
                  {
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .patchCallCount
                  }
                </span>
                <span>
                  patchAfterRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .patchAfterRead
                  )}
                </span>
                <span>
                  legacyConfigMapReferences=
                  {
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .configMapReferenceCount
                  }
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  clusterMutationAttempted=
                  {String(operatorRuntimeBoundary.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(operatorRuntimeBoundary.registryMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(
                    operatorRuntimeBoundary.mutationAllowedByThisVerifier
                  )}
                </span>
                <span>
                  {copy.assistantMutationAllowed}:{" "}
                  {booleanText(
                    language,
                    operatorRuntimeBoundary.parity.assistantMutationAllowed
                  )}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {operatorRuntimeBoundary.evidence[0] ??
                    "Operator runtime boundary evidence is read-only."}
                </p>
                <p>
                  {operatorRuntimeBoundary.risk[0] ??
                    "Live Operator SDK and OLM smoke remain approval-gated."}
                </p>
              </div>
            </div>
          ) : null}
          {envContract ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-env-contract"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Environment Isolation</h4>
                  <small>{envContract.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{envContract.artifactStatus}</span>
                <span>head={envContract.headSha}</span>
                <span>dirty={String(envContract.worktreeDirty)}</span>
                <span>
                  activeOcpTarget={String(envContract.activeOcpTarget)}
                </span>
                <span>
                  activeLightspeedTarget=
                  {String(envContract.activeLightspeedTarget)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Active Keys</span>
                  <strong>{envContract.activeKeyCount}</strong>
                </div>
                <div>
                  <span>Commented Legacy</span>
                  <strong>{envContract.commentedTrackedCount}</strong>
                </div>
                <div>
                  <span>Duplicates</span>
                  <strong>{envContract.duplicateActiveKeys.length}</strong>
                </div>
                <div>
                  <span>Missing Values</span>
                  <strong>{envContract.activeMissingValues.length}</strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-env-contract-boundary"
              >
                <span>
                  clusterMutationAttempted=
                  {String(envContract.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(envContract.registryMutationAttempted)}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(envContract.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(envContract.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-env-contract-checks"
              >
                {envContract.checks.slice(0, 4).map((check) => (
                  <span key={check.name}>
                    {check.name}={check.status}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {envContract.evidence[0] ??
                    "Environment contract evidence records key state only."}
                </p>
                <p>
                  {envContract.rollbackPath[0] ??
                    "Run npm run verify:env after changing .env target keys."}
                </p>
              </div>
            </div>
          ) : null}
          {ocpConnectivity ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-connectivity"
            >
              <div className="admin-evidence-line">
                <span title={ocpConnectivity.artifactStatus}>
                  {statusText(language, ocpConnectivity.artifactStatus)}
                </span>
                <span title={ocpConnectivity.classification}>
                  {copy.classification}:{" "}
                  {statusText(language, ocpConnectivity.classification)}
                </span>
                <span title={ocpConnectivity.actionMode}>
                  {actionModeText(language, ocpConnectivity.actionMode)}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(language, ocpConnectivity.clusterMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.target}</span>
                  <strong>{ocpConnectivity.target.redactedBaseUrl}</strong>
                </div>
                <div>
                  <span>{copy.network}</span>
                  <strong>
                    dns={ocpConnectivity.diagnostics.dns}, tcp=
                    {ocpConnectivity.diagnostics.tcp}
                  </strong>
                </div>
                <div>
                  <span>{copy.api}</span>
                  <strong>
                    tls={ocpConnectivity.diagnostics.tls}, version=
                    {ocpConnectivity.diagnostics.kubernetesVersion}
                  </strong>
                </div>
                <div>
                  <span>{copy.authBoundary}</span>
                  <strong>
                    {copy.tokens}:{" "}
                    {booleanText(language, ocpConnectivity.target.tokenConfigured)},{" "}
                    {copy.tlsVerify}:{" "}
                    {booleanText(language, ocpConnectivity.target.tlsVerify)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-credential-hygiene"
              >
                <span>
                  {copy.diagnosis}:{" "}
                  {ocpConnectivity.credentialHygiene.credentialDiagnosis}
                </span>
                <span>
                  {copy.localFormatIssue}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.credentialHygiene.localFormatIssue
                  )}
                </span>
                <span>
                  {copy.source}: {ocpConnectivity.credentialHygiene.tokenSource}
                </span>
                <span>
                  {copy.lengthClass}:{" "}
                  {ocpConnectivity.credentialHygiene.tokenLengthClass}
                </span>
                <span>
                  {copy.storedByVerifier}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.credentialHygiene
                      .credentialStoredByVerifier
                  )}
                </span>
                <span>
                  {copy.tokenRedacted}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.credentialHygiene.tokenValueRedacted
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-context"
              >
                <span>
                  {copy.context}:{" "}
                  {statusText(
                    language,
                    ocpConnectivity.diagnostics.ocContext.contextStatus
                  )}
                </span>
                <span>
                  {copy.auth}:{" "}
                  {statusText(
                    language,
                    ocpConnectivity.diagnostics.ocContext.authStatus
                  )}
                </span>
                <span>
                  {copy.server}:{" "}
                  {statusText(
                    language,
                    ocpConnectivity.diagnostics.ocContext.serverStatus
                  )}
                </span>
                <span>
                  {copy.kubeconfigEnv}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.diagnostics.ocContext
                      .kubeconfigEnvConfigured
                  )}
                </span>
                <span>
                  {copy.defaultKubeconfig}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.diagnostics.ocContext
                      .defaultKubeconfigPresent
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-recovery"
              >
                <span>
                  {copy.status}:{" "}
                  {statusText(language, ocpConnectivity.authRecovery.status)}
                </span>
                <span>
                  {copy.owner}: {ocpConnectivity.authRecovery.owner}
                </span>
                <span>
                  {copy.diagnosis}:{" "}
                  {ocpConnectivity.authRecovery.credentialDiagnosis}
                </span>
                <span>
                  {copy.humanApproval}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.authRecovery.mutationBoundary
                      .credentialRefreshRequiresHumanApproval
                  )}
                </span>
                <span>
                  {copy.tokenRedacted}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.authRecovery.mutationBoundary
                      .tokenValueRedacted
                  )}
                </span>
                <span>
                  {copy.storedByVerifier}:{" "}
                  {booleanText(
                    language,
                    ocpConnectivity.authRecovery.mutationBoundary
                      .credentialStoredByVerifier
                  )}
                </span>
                <span>
                  {copy.nextCommand}:{" "}
                  {ocpConnectivity.authRecovery.nextCommands[0] ?? copy.none}
                </span>
                <span>
                  {copy.packet}:{" "}
                  {ocpConnectivity.authRecovery.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                </span>
                <span>
                  {copy.exists}:{" "}
                  {booleanText(language, ocpConnectivity.authRecovery.exists)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-connectivity-rbac"
              >
                {ocpConnectivity.diagnostics.rbacAccessReviews.length ? (
                  ocpConnectivity.diagnostics.rbacAccessReviews.map((review) => (
                    <span key={review.id}>
                      {review.id}: {copy.status}{" "}
                      {statusText(language, review.status)} / {copy.required}{" "}
                      {booleanText(language, review.required)}
                    </span>
                  ))
                ) : (
                  <span>{copy.rbacReviewsMissing}</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-connectivity-actions"
              >
                {ocpConnectivity.actionHints.slice(0, 2).map((hint) => (
                  <span key={hint.id}>
                    {copy.severity}: {statusText(language, hint.severity)} /{" "}
                    {hint.id} / {copy.nextCheck}: {hint.nextCheck}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-commands"
              >
                {ocpConnectivity.readOnlyTroubleshootingCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      {command.id}: {copy.mutationAllowed}{" "}
                      {booleanText(language, command.mutation)}
                    </span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {ocpConnectivity.risk[0] ??
                    "Connectivity diagnostic reads only and does not approve mutation."}
                </p>
                <p>
                  {ocpConnectivity.rollbackPath[0] ??
                    "Refresh OCP connectivity evidence before live install checks."}
                </p>
              </div>
            </div>
          ) : null}
          {networkHandoff ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-network-handoff"
            >
              <div className="admin-evidence-line">
                <span title={networkHandoff.artifactStatus}>
                  {statusText(language, networkHandoff.artifactStatus)}
                </span>
                <span title={networkHandoff.actionMode}>
                  {actionModeText(language, networkHandoff.actionMode)}
                </span>
                <span title={networkHandoff.classification}>
                  {copy.classification}:{" "}
                  {statusText(language, networkHandoff.classification)}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(language, networkHandoff.clusterMutationAttempted)}
                </span>
                <span>
                  {copy.registryMutationAttempted}:{" "}
                  {booleanText(language, networkHandoff.registryMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.target}</span>
                  <strong>{networkHandoff.target.redactedBaseUrl}</strong>
                </div>
                <div>
                  <span>{copy.packet}</span>
                  <strong>
                    {networkHandoff.markdownPath.split(/[\\/]/).pop() ??
                      networkHandoff.markdownPath}
                  </strong>
                </div>
                <div>
                  <span>{copy.adminAsk}</span>
                  <strong>
                    {networkHandoff.adminRequests.length
                      ? networkHandoff.adminRequests.slice(0, 2).join(" ")
                      : "generate handoff packet"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-handoff-commands"
              >
                {networkHandoff.readOnlyCommands.slice(0, 4).map((command) => (
                  <span key={command.id}>
                    {command.id}: {copy.mutationAllowed}{" "}
                    {booleanText(language, command.mutation)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-ticket-packet"
              >
                <span>
                  {networkHandoff.ticketPacket.id}:{networkHandoff.ticketPacket.owner}
                  :{networkHandoff.ticketPacket.severity}
                </span>
                <span>{networkHandoff.ticketPacket.title}</span>
                <span>
                  {copy.firstAction}:{" "}
                  {networkHandoff.ticketPacket.firstReadOnlyAction.id} /{" "}
                  {copy.mutationAllowed}:{" "}
                  {booleanText(
                    language,
                    networkHandoff.ticketPacket.firstReadOnlyAction.mutation
                  )}
                </span>
                <span>
                  {copy.requiresApproval}:{" "}
                  {booleanText(
                    language,
                    networkHandoff.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                </span>
                <span>
                  {copy.nextCommand}:{" "}
                  {networkHandoff.ticketPacket.nextCommands
                    .slice(0, 2)
                    .join(" | ")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-first-actions"
              >
                {networkHandoff.firstNetworkActions.length ? (
                  networkHandoff.firstNetworkActions.map((action) => (
                    <span key={action.id}>
                      {action.id}: {copy.owner} {action.owner} / {copy.status}{" "}
                      {statusText(language, action.status)} / {copy.nextCommand}{" "}
                      {action.nextCommand} / {copy.mutationAllowed}{" "}
                      {booleanText(language, action.mutation)} /{" "}
                      {copy.requiresApproval}{" "}
                      {booleanText(language, action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>{copy.networkFirstActionsMissing}</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-source-artifacts"
              >
                {networkHandoff.sourceArtifacts.slice(0, 5).map((source) => (
                  <span key={source.id}>
                    {source.id}: {copy.status}{" "}
                    {statusText(language, source.status)} / {copy.fresh}{" "}
                    {booleanText(language, source.fresh)} / {copy.required}{" "}
                    {booleanText(language, source.required)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {networkHandoff.risk[0] ??
                    "Network handoff is a ticket packet only and does not approve mutation."}
                </p>
                <p>
                  {networkHandoff.rollbackPath[0] ??
                    "Regenerate the handoff after OCP network evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {networkHandoffApiFallback ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-network-handoff-api-fallback"
            >
              <div className="admin-evidence-line">
                <span title={networkHandoffApiFallback.artifactStatus}>
                  {statusText(
                    language,
                    networkHandoffApiFallback.artifactStatus
                  )}
                </span>
                <span title={networkHandoffApiFallback.actionMode}>
                  {actionModeText(
                    language,
                    networkHandoffApiFallback.actionMode
                  )}
                </span>
                <span>
                  {copy.caseCount}: {networkHandoffApiFallback.caseCount}
                </span>
                <span>
                  {copy.failedChecks}:{" "}
                  {networkHandoffApiFallback.failedCheckCount}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(
                    language,
                    networkHandoffApiFallback.clusterMutationAttempted
                  )}
                </span>
                <span>
                  {copy.registryMutationAttempted}:{" "}
                  {booleanText(
                    language,
                    networkHandoffApiFallback.registryMutationAttempted
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-handoff-api-fallback-cases"
              >
                {networkHandoffApiFallback.cases.map((testCase) => (
                  <span key={testCase.classification}>
                    {copy.classification}:{" "}
                    {statusText(language, testCase.classification)} /{" "}
                    {copy.owner}: {testCase.owner} / {copy.ticket}:{" "}
                    {testCase.ticketId} / {copy.firstAction}:{" "}
                    {testCase.firstActionId} / {copy.requiresApproval}:{" "}
                    {booleanText(
                      language,
                      testCase.networkChangeRequiresExplicitApproval
                    )}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {networkHandoffApiFallback.risk[0] ??
                    "Fallback proof keeps partial handoff API routing classification-aware."}
                </p>
                <p>
                  {networkHandoffApiFallback.rollbackPath[0] ??
                    "Regenerate fallback proof after changing handoff API mapping."}
                </p>
              </div>
            </div>
          ) : null}
          {authRbacPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-auth-rbac-plan"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>{copy.authRbacPlan}</h4>
                  <small title={authRbacPlan.actionMode}>
                    {actionModeText(language, authRbacPlan.actionMode)}
                  </small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span title={authRbacPlan.artifactStatus}>
                  {statusText(language, authRbacPlan.artifactStatus)}
                </span>
                <span title={authRbacPlan.classification}>
                  {copy.classification}:{" "}
                  {statusText(language, authRbacPlan.classification)}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(language, authRbacPlan.clusterMutationAttempted)}
                </span>
                <span>
                  {copy.registryMutationAttempted}:{" "}
                  {booleanText(language, authRbacPlan.registryMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.namespace}</span>
                  <strong>{authRbacPlan.rbac.namespace}</strong>
                </div>
                <div>
                  <span>{copy.reader}</span>
                  <strong>{authRbacPlan.rbac.serviceAccount}</strong>
                </div>
                <div>
                  <span>{copy.clusterRole}</span>
                  <strong>
                    {authRbacPlan.rbac.clusterRole} / {copy.rules}:{" "}
                    {authRbacPlan.rbac.ruleCount}
                  </strong>
                </div>
                <div>
                  <span>{copy.policy}</span>
                  <strong>
                    {copy.readOnlyTools}:{" "}
                    {booleanText(language, authRbacPlan.rbac.readOnlyOnly)},{" "}
                    {copy.secretsIncluded}:{" "}
                    {booleanText(language, authRbacPlan.rbac.secretsIncluded)}
                  </strong>
                </div>
                <div>
                  <span>{copy.readOnlyCommands}</span>
                  <strong>
                    {copy.readOnlyCommands}:{" "}
                    {authRbacPlan.readOnlyCommands.length}, {copy.gatedCommands}:{" "}
                    {authRbacPlan.approvalGatedCommands.length}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-commands"
              >
                {authRbacPlan.readOnlyCommands.slice(0, 4).map((command) => (
                  <span key={command.id}>
                    {command.id}: {copy.mutationAllowed}{" "}
                    {booleanText(language, command.mutation)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-approval"
              >
                {authRbacPlan.approvalGatedCommands.slice(0, 3).map((command) => (
                  <span key={command.id}>
                    {command.id}: {copy.requiresApproval}{" "}
                    {booleanText(language, command.requiresExplicitApproval)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-context"
              >
                <span>
                  {copy.context}:{" "}
                  {statusText(language, authRbacPlan.ocContext.contextStatus)}
                </span>
                <span>
                  {copy.auth}:{" "}
                  {statusText(language, authRbacPlan.ocContext.authStatus)}
                </span>
                <span>
                  {copy.server}:{" "}
                  {statusText(language, authRbacPlan.ocContext.serverStatus)}
                </span>
                <span>
                  {copy.kubeconfigEnv}:{" "}
                  {booleanText(
                    language,
                    authRbacPlan.ocContext.kubeconfigEnvConfigured
                  )}
                </span>
                <span>
                  {copy.defaultKubeconfig}:{" "}
                  {booleanText(
                    language,
                    authRbacPlan.ocContext.defaultKubeconfigPresent
                  )}
                </span>
              </div>
              {authRbacPlan.ticketPacket ? (
                <div
                  className="admin-evidence-line"
                  data-testid="opslens-ocp-auth-rbac-plan-ticket"
                >
                  <span>
                    {copy.ticket}: {authRbacPlan.ticketPacket.id} /{" "}
                    {copy.owner}: {authRbacPlan.ticketPacket.owner} /{" "}
                    {copy.classification}:{" "}
                    {statusText(
                      language,
                      authRbacPlan.ticketPacket.classification
                    )}{" "}
                    / {copy.firstAction}:{" "}
                    {authRbacPlan.ticketPacket.firstReadOnlyAction.id} /{" "}
                    {copy.approvalAction}:{" "}
                    {authRbacPlan.ticketPacket.approvalGatedAction.id} /{" "}
                    {copy.requiresApproval}:{" "}
                    {booleanText(
                      language,
                      authRbacPlan.ticketPacket.approvalGatedAction
                        .requiresExplicitApproval
                    )}
                    / {copy.mutationAllowed}:{" "}
                    {booleanText(
                      language,
                      authRbacPlan.ticketPacket.mutationBoundary
                        .mutationAllowedByThisVerifier
                    )}
                  </span>
                </div>
              ) : null}
              <div className="remediation-notes">
                <p>
                  {authRbacPlan.risk[0] ??
                    "Auth/RBAC plan separates fallback reader approval from Operator controller RBAC."}
                </p>
                <p>
                  {authRbacPlan.rollbackPath[0] ??
                    "Regenerate the auth/RBAC plan after OCP connectivity evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {liveHandoff ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-live-handoff"
            >
              <div className="admin-evidence-line">
                <span title={liveHandoff.artifactStatus}>
                  {statusText(language, liveHandoff.artifactStatus)}
                </span>
                <span>{actionModeText(language, liveHandoff.actionMode)}</span>
                <span title={liveHandoff.currentGapClassification}>
                  {copy.currentGap}:{" "}
                  {statusText(language, liveHandoff.currentGapClassification)}
                </span>
                <span>
                  {copy.smoke}:{" "}
                  {statusText(
                    language,
                    liveHandoff.postApprovalSmoke.artifactStatus
                  )}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(language, liveHandoff.clusterMutationAttempted)}
                </span>
                <span>
                  {copy.registryMutationAttempted}:{" "}
                  {booleanText(language, liveHandoff.registryMutationAttempted)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-live-handoff-post-approval-smoke"
              >
                <span>
                  {copy.classification}:{" "}
                  {statusText(
                    language,
                    liveHandoff.postApprovalSmoke.ocpClassification
                  )}
                </span>
                <span>
                  {copy.rbac}:{" "}
                  {liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}/
                  {liveHandoff.postApprovalSmoke.requiredRbacReviewCount}
                </span>
                <span>
                  {copy.unknown}:{" "}
                  {liveHandoff.postApprovalSmoke.requiredRbacUnknownCount}
                </span>
                <span>
                  {copy.lightspeedMcp}:{" "}
                  {statusText(
                    language,
                    liveHandoff.postApprovalSmoke.lightspeedClassification
                  )}
                </span>
                <span>
                  {copy.lightspeedAuthReady}:{" "}
                  {booleanText(
                    language,
                    liveHandoff.postApprovalSmoke.lightspeedAuthReady
                  )}
                </span>
                {liveHandoff.postApprovalSmoke.sourceArtifacts.length ? (
                  liveHandoff.postApprovalSmoke.sourceArtifacts
                    .slice(0, 2)
                    .map((source) => (
                      <span key={source.id}>
                        {copy.sourceArtifacts}: {source.id} / {copy.status}{" "}
                        {statusText(language, source.status)} / {copy.fresh}{" "}
                        {booleanText(language, source.fresh)}
                      </span>
                    ))
                ) : (
                  <span>
                    {copy.sourceArtifacts}: {copy.none}
                  </span>
                )}
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.readOnlyCommands}</span>
                  <strong>
                    {liveHandoff.readOnlyCommands.length
                      ? liveHandoff.readOnlyCommands
                          .slice(0, 4)
                          .map((command) => command.id)
                          .join(", ")
                      : copy.blockedUntilHandoffExists}
                  </strong>
                </div>
                <div>
                  <span>{copy.actionHints}</span>
                  <strong>
                    {liveHandoff.actionHints.length
                      ? liveHandoff.actionHints
                          .slice(0, 2)
                          .map((hint) => hint.id)
                          .join(", ")
                      : copy.none}
                  </strong>
                </div>
                <div>
                  <span>{copy.postApprovalSmoke}</span>
                  <strong>
                    {liveHandoff.postApprovalSmoke.requiredAfterAuthRbacApproval
                      ? `${statusText(
                          language,
                          liveHandoff.postApprovalSmoke.artifactStatus
                        )} ${copy.rbac}: ${liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}/${liveHandoff.postApprovalSmoke.requiredRbacReviewCount} ${copy.unknown}: ${liveHandoff.postApprovalSmoke.requiredRbacUnknownCount}`
                      : "verify:ocp:live-reader-smoke"}
                  </strong>
                </div>
                <div>
                  <span>{copy.forbidden}</span>
                  <strong>
                    {liveHandoff.forbiddenCommands.slice(0, 3).join(", ")}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {liveHandoff.risk[0] ??
                    "Live handoff collects evidence only and does not approve mutation."}
                </p>
                <p>
                  {liveHandoff.rollbackPath[0] ??
                    "Regenerate the handoff after live evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseRefresh ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-refresh"
            >
              <div className="admin-evidence-line">
                <span>{releaseRefresh.artifactStatus}</span>
                <span>{releaseRefresh.actionMode}</span>
                <span>head={releaseRefresh.headSha}</span>
                <span>dirty={String(releaseRefresh.worktreeDirty)}</span>
                <span>
                  localDockerBuildAllowed=
                  {String(releaseRefresh.localDockerBuildAllowed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseRefresh.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseRefresh.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseRefresh.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-security-review"
              >
                <span>
                  securityReviewDrafts=
                  {releaseRefreshSecurityReviewCommand?.status ?? "missing"}
                </span>
                <span>
                  expectedNonZero=
                  {String(
                    releaseRefreshSecurityReviewCommand?.expectedNonZero ??
                      false
                  )}
                </span>
                <span>id=security-review-drafts-all</span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Commands</span>
                  <strong>
                    {releaseRefresh.commands.length
                      ? releaseRefresh.commands
                          .slice(0, 5)
                          .map((command) => `${command.id}:${command.status}`)
                          .join(", ")
                      : "blocked until refresh exists"}
                  </strong>
                </div>
                <div>
                  <span>Fresh Artifacts</span>
                  <strong>
                    {
                      releaseRefresh.artifacts.filter((artifact) => artifact.fresh)
                        .length
                    }
                    /{releaseRefresh.artifacts.length}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {releaseRefresh.missingEvidence.length
                      ? `${releaseRefresh.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Owner Packets</span>
                  <strong>
                    ready={String(releaseRefresh.actionQueue.ownerPacketsReady)},
                    count={releaseRefresh.actionQueue.ownerPacketCount}
                  </strong>
                </div>
                <div>
                  <span>Critical Path</span>
                  <strong>
                    ready={String(releaseRefresh.actionQueue.criticalPathReady)},
                    count={releaseRefresh.actionQueue.criticalPathCount}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-critical-path"
              >
                <span>
                  missingDiagnostics=
                  {releaseRefresh.actionQueue.missingCriticalPathDiagnostics.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  missingTickets=
                  {releaseRefresh.actionQueue.missingCriticalPathTickets.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  unsafeTickets=
                  {releaseRefresh.actionQueue.unsafeCriticalPathTickets.join(
                    ", "
                  ) || "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-owner-packets"
              >
                {releaseRefresh.actionQueue.ownerPackets.slice(0, 6).map((packet) => (
                  <span key={packet.owner}>
                    {packet.owner}:
                    {packet.markdownPath.split(/[\\/]/).pop() ??
                      packet.markdownPath}
                    :exists={String(packet.exists)}:first={packet.firstActionId}
                    :next={packet.firstNextCommand}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-owner-packet-cleanup"
              >
                <span>
                  deletionAllowed=
                  {String(releaseRefresh.actionQueue.ownerPacketCleanup.deletionAllowed)}
                </span>
                <span>
                  expected=
                  {releaseRefresh.actionQueue.ownerPacketCleanup.expectedFiles.join(", ") ||
                    "none"}
                </span>
                <span>
                  staleRemoved=
                  {releaseRefresh.actionQueue.ownerPacketCleanup.staleRemoved.join(", ") ||
                    "none"}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseRefresh.risk[0] ??
                    "Release refresh runs local evidence commands only."}
                </p>
                <p>
                  {releaseRefresh.rollbackPath[0] ??
                    "Rerun the release refresh after code or evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseBundle ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-evidence-bundle"
            >
              <div className="admin-evidence-line">
                <span>{releaseBundle.artifactStatus}</span>
                <span>{releaseBundle.actionMode}</span>
                <span>head={releaseBundle.headSha}</span>
                <span>dirty={String(releaseBundle.worktreeDirty)}</span>
                <span>packet={releaseBundlePacketName}</span>
                <span>
                  mutationBoundaryPassed=
                  {String(releaseBundle.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseBundle.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseBundle.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseBundle.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Decision</span>
                  <strong>
                    publish={String(releaseBundle.decision.publishReady)},
                    install={String(releaseBundle.decision.installReady)}
                  </strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>
                    {
                      releaseBundle.sourceArtifacts.filter(
                        (source) => source.fresh && source.acceptable
                      ).length
                    }
                    /{releaseBundle.sourceArtifacts.length}
                  </strong>
                </div>
                <div>
                  <span>Commands</span>
                  <strong>
                    readOnly={releaseBundle.commandCounts.readOnly},
                    gated=
                    {releaseBundle.commandCounts.mutatingApprovalRequired}
                  </strong>
                </div>
                <div>
                  <span>Action Queue</span>
                  <strong>
                    ready={String(releaseBundle.actionQueueSafety.ready)},
                    items={releaseBundle.actionQueueSafety.actionItemCount},
                    criticalPath=
                    {releaseBundle.actionQueueSafety.criticalPathCount}
                  </strong>
                </div>
                <div>
                  <span>Roadmap</span>
                  <strong>
                    {releaseBundle.roadmapCompletion.percentComplete}%,
                    remaining=
                    {releaseBundle.roadmapCompletion.remainingRequirements}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {releaseBundle.missingEvidence.length
                      ? `${releaseBundle.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
              </div>
              <div className="admin-evidence-line">
                {releaseBundle.sourceArtifacts.slice(0, 4).map((source) => (
                  <span key={source.id}>
                    {source.id} fresh={String(source.fresh)}
                  </span>
                ))}
              </div>
              <div className="admin-evidence-line">
                <span>
                  actionQueueStatus={releaseBundle.actionQueueSafety.status}
                </span>
                <span>
                  actionQueueFresh=
                  {String(releaseBundle.actionQueueSafety.fresh)}
                </span>
                <span>
                  actionQueueCommands=readOnly:
                  {releaseBundle.actionQueueSafety.readOnlyCommandCount}/gated:
                  {releaseBundle.actionQueueSafety.approvalGatedCommandCount}
                </span>
                <span>
                  actionQueueMutationBoundary=
                  {String(releaseBundle.actionQueueSafety.mutationBoundaryPassed)}
                </span>
                <span>
                  actionQueueActionGaps=
                  {[
                    ...releaseBundle.actionQueueSafety
                      .missingActionItemDiagnostics,
                    ...releaseBundle.actionQueueSafety
                      .missingActionItemNextCommands,
                    ...releaseBundle.actionQueueSafety
                      .missingCriticalPathNextCommands
                  ].length || "none"}
                </span>
                <span>
                  unsafeTickets=
                  {releaseBundle.actionQueueSafety.unsafeTickets.join(", ") ||
                    "none"}
                </span>
                <span>
                  roadmapExternalState=
                  {releaseBundle.roadmapCompletion.remainingExternalStateCount}
                </span>
                <span>
                  roadmapLocalOnly=
                  {releaseBundle.roadmapCompletion.remainingLocalOnlyCount}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseBundle.risk[0] ??
                    "Release evidence bundle is a read-only review packet."}
                </p>
                <p>
                  {releaseBundle.rollbackPath[0] ??
                    "Regenerate the release bundle after evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseActionQueue ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-action-queue"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Release Action Queue</h4>
                  <small>{releaseActionQueue.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{releaseActionQueue.artifactStatus}</span>
                <span>head={releaseActionQueue.headSha}</span>
                <span>dirty={String(releaseActionQueue.worktreeDirty)}</span>
                <span>packet={releaseActionQueuePacketName}</span>
                <span>
                  mutationBoundaryPassed=
                  {String(releaseActionQueue.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseActionQueue.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseActionQueue.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseActionQueue.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Owners</span>
                  <strong>{releaseActionQueue.owners.length}</strong>
                </div>
                <div>
                  <span>Open Actions</span>
                  <strong>{releaseActionQueue.items.length}</strong>
                </div>
                <div>
                  <span>Commands</span>
                  <strong>
                    readOnly={releaseActionQueue.commandCounts.readOnly},
                    gated={releaseActionQueue.commandCounts.approvalGated}
                  </strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>
                    {
                      releaseActionQueue.sourceArtifacts.filter(
                        (source) => source.fresh && !source.mutationViolation
                      ).length
                    }
                    /{releaseActionQueue.sourceArtifacts.length}
                  </strong>
                </div>
              </div>
              <div className="mcp-tool-list">
                {releaseActionQueue.owners.slice(0, 7).map((owner) => (
                  <div className="mcp-tool-row" key={owner.owner}>
                    <span
                      className={`freshness ${
                        owner.blocker > 0 ? "missing" : "stale"
                      }`}
                    >
                      {owner.blocker > 0 ? "blocker" : "open"}
                    </span>
                    <strong>{owner.owner}</strong>
                    <small>open={owner.open}</small>
                    <small>high={owner.high}</small>
                  </div>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-critical-path"
              >
                {releaseActionQueue.criticalPath.length > 0 ? (
                  releaseActionQueue.criticalPath.map((entry) => (
                    <span key={entry.lane}>
                      {entry.lane}:{entry.owner}:{entry.priority}:
                      {entry.actionId}:next={entry.nextCommand}:ticket=
                      {entry.ticketPacket?.id ?? "none"}:ticketFirst=
                      {entry.ticketPacket?.firstReadOnlyAction.id ?? "none"}
                      :extTicket={entry.externalRuntimeTicketPacket?.id ?? "none"}
                      :extFirst=
                      {entry.externalRuntimeTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :finalTicket=
                      {entry.externalRuntimeFinalEvidenceTicketPacket?.id ??
                        "none"}
                      :finalFirst=
                      {entry.externalRuntimeFinalEvidenceTicketPacket
                        ?.firstReadOnlyAction.id ?? "none"}
                      :productTicket=
                      {entry.externalRuntimeProductTicketPacket?.id ?? "none"}
                      :productFirst=
                      {entry.externalRuntimeProductTicketPacket?.firstReadOnlyAction
                        .id ?? "none"}
                      :certTicket=
                      {entry.certificationToolingTicketPacket?.id ?? "none"}
                      :certFirst=
                      {entry.certificationToolingTicketPacket?.firstReadOnlyAction
                        .id ?? "none"}
                      :securityTicket=
                      {entry.securityReviewTicketPacket?.id ?? "none"}
                      :securityFirst=
                      {entry.securityReviewTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :publishTicket=
                      {entry.releasePublishTicketPacket?.id ?? "none"}
                      :publishFirst=
                      {entry.releasePublishTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :installTicket=
                      {entry.installApprovalTicketPacket?.id ?? "none"}
                      :installFirst=
                      {entry.installApprovalTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :catalogTicket=
                      {entry.catalogToolchainTicketPacket?.id ?? "none"}
                      :catalogFirst=
                      {entry.catalogToolchainTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :ragTicket=
                      {entry.ragProductionTicketPacket?.id ?? "none"}
                      :ragFirst=
                      {entry.ragProductionTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :aiopsTicket=
                      {entry.aiopsMonitoringTicketPacket?.id ?? "none"}
                      :aiopsFirst=
                      {entry.aiopsMonitoringTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :runtimeTicket=
                      {entry.runtimeEvidenceTicketPacket?.id ?? "none"}
                      :runtimeFirst=
                      {entry.runtimeEvidenceTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :tools={entry.missingRequiredTools.join(",") || "none"}
                      :setup={entry.setupCommandIds.join(",") || "none"}:readOnly=
                      {entry.readOnlyCommandIds.join(",") || "none"}:approval=
                      {entry.approvalGatedCommandIds.join(",") || "none"}
                      :diagnostics={entry.diagnostics.join(",") || "none"}
                    </span>
                  ))
                ) : (
                  <span>critical path clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-source-artifacts"
              >
                {releaseActionQueue.sourceArtifacts.slice(0, 8).map((source) => (
                  <span key={source.id}>
                    {source.id}:{source.status}:fresh={String(source.fresh)}
                    :required={String(source.required)}:mutation=
                    {String(source.mutationViolation)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-owner-packets"
              >
                {releaseActionQueue.ownerPackets.slice(0, 7).map((packet) => (
                  <span key={packet.owner}>
                    {packet.owner}:
                    {packet.markdownPath.split(/[\\/]/).pop() ??
                      packet.markdownPath}
                    :open={packet.open}:approval=
                    {packet.approvalGatedCommandIds.length}:first=
                    {packet.firstActionId}:next={packet.firstNextCommand}
                    :ticket={packet.firstTicketPacket?.id ?? "none"}:ticketFirst=
                    {packet.firstTicketPacket?.firstReadOnlyAction.id ?? "none"}
                    :extTicket=
                    {packet.firstExternalRuntimeTicketPacket?.id ?? "none"}
                    :extFirst=
                    {packet.firstExternalRuntimeTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :finalTicket=
                    {packet.firstExternalRuntimeFinalEvidenceTicketPacket?.id ??
                      "none"}
                    :finalFirst=
                    {packet.firstExternalRuntimeFinalEvidenceTicketPacket
                      ?.firstReadOnlyAction.id ?? "none"}
                    :productTicket=
                    {packet.firstExternalRuntimeProductTicketPacket?.id ?? "none"}
                    :productFirst=
                    {packet.firstExternalRuntimeProductTicketPacket
                      ?.firstReadOnlyAction.id ?? "none"}
                    :certTicket=
                    {packet.firstCertificationToolingTicketPacket?.id ?? "none"}
                    :certFirst=
                    {packet.firstCertificationToolingTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :securityTicket=
                    {packet.firstSecurityReviewTicketPacket?.id ?? "none"}
                    :securityFirst=
                    {packet.firstSecurityReviewTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :publishTicket=
                    {packet.firstReleasePublishTicketPacket?.id ?? "none"}
                    :publishFirst=
                    {packet.firstReleasePublishTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :installTicket=
                    {packet.firstInstallApprovalTicketPacket?.id ?? "none"}
                    :installFirst=
                    {packet.firstInstallApprovalTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :catalogTicket=
                    {packet.firstCatalogToolchainTicketPacket?.id ?? "none"}
                    :catalogFirst=
                    {packet.firstCatalogToolchainTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :ragTicket=
                    {packet.firstRagProductionTicketPacket?.id ?? "none"}
                    :ragFirst=
                    {packet.firstRagProductionTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :aiopsTicket=
                    {packet.firstAiopsMonitoringTicketPacket?.id ?? "none"}
                    :aiopsFirst=
                    {packet.firstAiopsMonitoringTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :runtimeTicket=
                    {packet.firstRuntimeEvidenceTicketPacket?.id ?? "none"}
                    :runtimeFirst=
                    {packet.firstRuntimeEvidenceTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-owner-execution-plan"
              >
                {releaseActionQueue.ownerExecutionPlan.slice(0, 10).map((plan) => (
                  <span key={plan.owner}>
                    {plan.owner}:{plan.status}:first={plan.firstActionId}:next=
                    {plan.firstNextCommand}:readOnly=
                    {plan.firstReadOnlyCommand.id}:setup=
                    {plan.firstSetupCommand.id}:approval=
                    {plan.firstApprovalGatedCommand.id}:tickets=
                    {plan.ticketPacketCount}:clusterMutationAllowed=
                    {String(plan.clusterMutationAllowed)}
                    :registryMutationAllowed=
                    {String(plan.registryMutationAllowed)}:vectorWriteAllowed=
                    {String(plan.vectorWriteAllowed)}:mutationAllowed=
                    {String(plan.mutationAllowedByThisVerifier)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-owner-packet-cleanup"
              >
                <span>
                  deletionAllowed=
                  {String(releaseActionQueue.ownerPacketCleanup.deletionAllowed)}
                </span>
                <span>
                  expected=
                  {releaseActionQueue.ownerPacketCleanup.expectedFiles.join(", ") ||
                    "none"}
                </span>
                <span>
                  staleRemoved=
                  {releaseActionQueue.ownerPacketCleanup.staleRemoved.join(", ") ||
                    "none"}
                </span>
              </div>
              <div className="admin-evidence-line">
                {releaseActionQueue.items.slice(0, 4).map((entry) => (
                  <span key={entry.id}>
                    {entry.owner}:{entry.priority}
                  </span>
                ))}
              </div>
              <div
                className="mcp-tool-list"
                data-testid="opslens-release-action-queue-items"
              >
                {releaseActionQueue.items.slice(0, 5).map((entry) => (
                  <div className="mcp-tool-row" key={entry.id}>
                    <span
                      className={`freshness ${
                        entry.priority === "blocker" ? "missing" : "stale"
                      }`}
                    >
                      {entry.priority}
                    </span>
                    <strong>{entry.request}</strong>
                    <small>{entry.owner}</small>
                    <small>{entry.nextCommand}</small>
                    {entry.missingRequiredTools.length ? (
                      <small>
                        missing={entry.missingRequiredTools.join(", ")}
                      </small>
                    ) : null}
                    {entry.handoffNextCommands.length ? (
                      <small>
                        handoff={entry.handoffNextCommands.slice(0, 2).join(" | ")}
                      </small>
                    ) : null}
                    {entry.readOnlyCommands.length ? (
                      <small>
                        readOnly=
                        {entry.readOnlyCommands
                          .slice(0, 2)
                          .map((command) => command.id)
                          .join(", ")}
                      </small>
                    ) : null}
                    {entry.approvalGatedCommands.length ? (
                      <small>
                        approval=
                        {entry.approvalGatedCommands
                          .slice(0, 2)
                          .map((command) => command.id)
                          .join(", ")}
                      </small>
                    ) : null}
                  </div>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-diagnostics"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.diagnostics.length > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:
                      {entry.diagnostics
                        .slice(0, 2)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-decision-actions"
              >
                {releaseDecisionActions.length > 0 ? (
                  releaseDecisionActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:next={entry.nextCommand}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 8)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ") || "none"}
                    </span>
                  ))
                ) : (
                  <span>decision actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-approval-handoff"
              >
                {releaseApprovalHandoffActions.map((entry) => (
                  <span key={entry.id}>
                    {entry.owner}:
                    {entry.approvalGatedCommands
                      .map((command) => command.id)
                      .join(", ")}
                    :diagnostics=
                    {entry.diagnostics.map((diagnostic) => diagnostic.id).join(",") ||
                      "none"}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-readonly-handoff"
              >
                {releaseReadOnlyHandoffActions.map((entry) => (
                  <span key={entry.id}>
                    {entry.owner}:
                    {entry.readOnlyCommands
                      .slice(0, 4)
                      .map((command) => command.id)
                      .join(", ")}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-tooling-handoff"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.missingRequiredTools.length > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.owner}:{entry.missingRequiredTools.join(", ")}:
                      {entry.setupCommands.map((command) => command.id).join(", ")}
                      :diagnostics=
                      {entry.diagnostics.map((diagnostic) => diagnostic.id).join(",") ||
                        "none"}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-network-actions"
              >
                {releaseNetworkActions.length > 0 ? (
                  releaseNetworkActions.slice(0, 5).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .slice(0, 4)
                        .map((command) => command.id)
                        .join(", ")}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 8)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                    </span>
                  ))
                ) : (
                  <span>network actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-candidate-actions"
              >
                {releaseCandidateActions.length > 0 ? (
                  releaseCandidateActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 7)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                    </span>
                  ))
                ) : (
                  <span>candidate actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-security-review-actions"
              >
                {releaseSecurityReviewActions.length > 0 ? (
                  releaseSecurityReviewActions.slice(0, 6).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .slice(0, 3)
                        .map((command) => command.id)
                        .join(", ")}
                      :approval=
                      {entry.approvalGatedCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>security review actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-catalog-registry-actions"
              >
                {releaseCatalogRegistryActions.length > 0 ? (
                  releaseCatalogRegistryActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :setup=
                      {entry.setupCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :catalogTicket=
                      {entry.catalogToolchainTicketPacket?.id ?? "none"}
                      :catalogFirst=
                      {entry.catalogToolchainTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :catalogSetup=
                      {entry.catalogToolchainTicketPacket?.setupAction.id ??
                        "none"}
                      :catalogLocal=
                      {entry.catalogToolchainTicketPacket?.localArtifactAction.id ??
                        "none"}
                      :catalogApproval=
                      {entry.catalogToolchainTicketPacket?.approvalGatedAction.id ??
                        "none"}
                      :secretInput=
                      {String(
                        entry.catalogToolchainTicketPacket?.setupAction
                          .requiresHumanSecretInput ?? false
                      )}
                      :publishApproval=
                      {String(
                        entry.catalogToolchainTicketPacket?.mutationBoundary
                          .catalogPublishRequiresExplicitApproval ?? false
                      )}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 5)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ") || "none"}
                    </span>
                  ))
                ) : (
                  <span>catalog registry actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-runtime-live-actions"
              >
                {releaseRuntimeLiveActions.length > 0 ? (
                  releaseRuntimeLiveActions.slice(0, 5).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 2)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                      :ragTicket={entry.ragProductionTicketPacket?.id ?? "none"}
                      :ragApproval=
                      {entry.ragProductionTicketPacket?.approvalGatedAction.id ??
                        "none"}
                    </span>
                  ))
                ) : (
                  <span>runtime live actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-monitoring-proxy-actions"
              >
                {releaseMonitoringProxyActions.length > 0 ? (
                  releaseMonitoringProxyActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :ticket={entry.aiopsMonitoringTicketPacket?.id ?? "none"}
                      :ticketFirst=
                      {entry.aiopsMonitoringTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :ticketApproval=
                      {entry.aiopsMonitoringTicketPacket?.approvalGatedAction.id ??
                        "none"}
                    </span>
                  ))
                ) : (
                  <span>monitoring proxy actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-lightspeed-readiness-actions"
              >
                {releaseLightspeedReadinessActions.length > 0 ? (
                  releaseLightspeedReadinessActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :approval=
                      {entry.approvalGatedCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :ticket={entry.ticketPacket?.id ?? "none"}:ticketFirst=
                      {entry.ticketPacket?.firstReadOnlyAction.id ?? "none"}
                      :ticketApproval=
                      {entry.ticketPacket?.approvalGatedAction.id ?? "none"}
                    </span>
                  ))
                ) : (
                  <span>lightspeed readiness actions clear</span>
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseActionQueue.risk[0] ??
                    "Release action queue assigns evidence gaps without approving mutation."}
                </p>
                <p>
                  {releaseActionQueue.rollbackPath[0] ??
                    "Regenerate the queue after upstream evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {checkpoint ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-evidence-checkpoint"
            >
              <div className="admin-evidence-line">
                <span>{checkpoint.artifactStatus}</span>
                <span>head={checkpoint.headSha}</span>
                <span>dirty={String(checkpoint.worktreeDirty)}</span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Checkpoint Lanes</span>
                  <strong>
                    {checkpoint.lanes.length
                      ? checkpoint.lanes
                          .map((lane) => `${lane.id}:${lane.status}`)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {checkpoint.blockers.length
                      ? `${checkpoint.blockers.length} blockers`
                      : `${checkpoint.missingEvidence.length} missing evidence`}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {checkpoint.risk[0] ??
                    "Checkpoint reads local evidence only and does not approve mutation."}
                </p>
                <p>
                  {checkpoint.rollbackPath[0] ??
                    "Refresh stale evidence before install or publish approval."}
                </p>
              </div>
            </div>
          ) : null}
          {approvalPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-install-approval-plan"
            >
              <div className="admin-evidence-line">
                <span>{approvalPlan.actionMode}</span>
                <span>
                  clusterMutationAttempted=
                  {String(approvalPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(approvalPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Approvals</span>
                  <strong>{approvalPlan.requiredApprovals.join(", ")}</strong>
                </div>
                <div>
                  <span>Mutating Commands</span>
                  <strong>
                    {approvalPlan.mutatingCommands.length
                      ? approvalPlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Lightspeed Registration</span>
                  <strong>
                    {approvalPlan.lightspeedRegistration.mode} /{" "}
                    {approvalPlan.lightspeedRegistration.target.namespace}/
                    {approvalPlan.lightspeedRegistration.target.name}
                  </strong>
                </div>
                <div>
                  <span>RAG Ingestion</span>
                  <strong>
                    {approvalPlan.ragIngestion.status} / jobCreated=
                    {String(approvalPlan.ragIngestion.ingestionJobCreated)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-registration-plan"
              >
                <span>{approvalPlan.lightspeedRegistration.actionMode}</span>
                <span>
                  {approvalPlan.lightspeedRegistration.configResourceKind}
                </span>
                <span>mode={approvalPlan.lightspeedRegistration.mode}</span>
                <span>
                  willPatch=
                  {String(approvalPlan.lightspeedRegistration.willPatch)}
                </span>
                <span>
                  legacyConfigMapMutationAttempted=
                  {String(
                    approvalPlan.lightspeedRegistration
                      .legacyConfigMapMutationAttempted
                  )}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(
                    approvalPlan.lightspeedRegistration.clusterMutationAttempted
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-first-approval-actions"
              >
                {approvalPlan.firstApprovalActions.length ? (
                  approvalPlan.firstApprovalActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.nextCommand}:mutation=
                      {String(action.mutation)}:approval=
                      {String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>first approval actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-approval-ticket"
              >
                <span>
                  {approvalPlan.ticketPacket.id}:{approvalPlan.ticketPacket.owner}:
                  {approvalPlan.ticketPacket.classification}:first=
                  {approvalPlan.ticketPacket.firstReadOnlyAction.id}:approval=
                  {approvalPlan.ticketPacket.approvalGatedAction.id}
                  :requiresApproval=
                  {String(
                    approvalPlan.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(
                    approvalPlan.ticketPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-cluster-admin-packet"
              >
                <span>
                  packet=
                  {approvalPlan.clusterAdminPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ?? approvalPlan.clusterAdminPacket.markdownPath}
                </span>
                <span>
                  exists={String(approvalPlan.clusterAdminPacket.exists)}
                </span>
                <span>
                  ticket={approvalPlan.clusterAdminPacket.ticketId}
                </span>
                <span>
                  decision=
                  {approvalPlan.clusterAdminPacket.installDecisionActionId}
                </span>
                <span>
                  first={approvalPlan.clusterAdminPacket.firstReadOnlyActionId}
                </span>
                <span>
                  approval=
                  {approvalPlan.clusterAdminPacket.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                </span>
                <span>
                  installExecuted=
                  {String(
                    approvalPlan.clusterAdminPacket.installExecutedByVerifier
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    approvalPlan.clusterAdminPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-decision-action"
              >
                <span>
                  {approvalPlan.installDecisionAction.id}:
                  {approvalPlan.installDecisionAction.owner}:status=
                  {approvalPlan.installDecisionAction.status}:first=
                  {approvalPlan.installDecisionAction.readOnlyPreflightCommandId}
                  :lightspeed=
                  {approvalPlan.installDecisionAction.lightspeedPreviewCommandId}
                  :rag=
                  {approvalPlan.installDecisionAction.ragIngestionReviewCommand}
                  :approval=
                  {approvalPlan.installDecisionAction.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                  :mode=
                  {approvalPlan.installDecisionAction.lightspeedRegistrationMode}
                  :ragStatus=
                  {approvalPlan.installDecisionAction.ragIngestionStatus}
                  :mutationAllowed=
                  {String(approvalPlan.installDecisionAction.mutationAllowed)}
                  :writesLocalEvidence=
                  {String(approvalPlan.installDecisionAction.writesLocalEvidence)}
                  :clusterMutationAttempted=
                  {String(
                    approvalPlan.installDecisionAction.clusterMutationAttempted
                  )}
                  :vectorWriteAttempted=
                  {String(approvalPlan.installDecisionAction.vectorWriteAttempted)}
                  :ingestionJobCreated=
                  {String(approvalPlan.installDecisionAction.ingestionJobCreated)}
                  :installRequiresExplicitApproval=
                  {String(
                    approvalPlan.installDecisionAction
                      .installRequiresExplicitApproval
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-registration-commands"
              >
                {approvalPlan.lightspeedRegistration.readOnlyCommands.map(
                  (command) => (
                    <span key={command.id}>{command.command}</span>
                  )
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-ingestion-approval-plan"
              >
                <span>{approvalPlan.ragIngestion.actionMode}</span>
                <span>
                  queueEvidence={approvalPlan.ragIngestion.queueEvidenceStatus}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(approvalPlan.ragIngestion.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(approvalPlan.ragIngestion.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {approvalPlan.risk[0] ??
                    "Mutating install commands remain blocked until approval."}
                </p>
                <p>
                  {approvalPlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before install."}
                </p>
              </div>
            </div>
          ) : null}
          {catalogToolchainPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-catalog-toolchain"
            >
              <div className="admin-evidence-line">
                <span>{catalogToolchainPlan.artifactStatus}</span>
                <span>{catalogToolchainPlan.actionMode}</span>
                <span>
                  registryAuthConfigured=
                  {String(catalogToolchainPlan.registryAuthConfigured)}
                </span>
                <span>
                  registryBaseReadable=
                  {String(catalogToolchainPlan.registryBaseReadable)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(catalogToolchainPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(catalogToolchainPlan.clusterMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Next Action</span>
                  <strong>
                    {catalogToolchainPlan.nextAction.id}:
                    {catalogToolchainPlan.nextAction.owner}
                  </strong>
                </div>
                <div>
                  <span>Handoff</span>
                  <strong>
                    {catalogToolchainPlan.markdownPath !== "missing"
                      ? catalogToolchainPlan.markdownPath
                          .split(/[\\/]/)
                          .pop()
                      : "missing"}
                  </strong>
                </div>
                <div>
                  <span>CLI</span>
                  <strong>
                    {catalogToolchainPlan.cli.length
                      ? catalogToolchainPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Checks</span>
                  <strong>
                    {catalogToolchainPlan.readOnlyCommands.length
                      ? catalogToolchainPlan.readOnlyCommands
                          .slice(0, 4)
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Setup Needed</span>
                  <strong>
                    {catalogToolchainPlan.setupCommands.length
                      ? catalogToolchainPlan.setupCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Local Artifact</span>
                  <strong>
                    {catalogToolchainPlan.localArtifactCommands.length
                      ? catalogToolchainPlan.localArtifactCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {catalogToolchainPlan.currentJudgment ??
                    catalogToolchainPlan.risk[0] ??
                    "Catalog toolchain evidence reads local readiness only."}
                </p>
                <p>
                  {catalogToolchainPlan.nextAction.command}
                </p>
                <p>
                  {catalogToolchainPlan.nextAction.reason ??
                    catalogToolchainPlan.rollbackPath[0] ??
                    "Regenerate catalog toolchain evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {labBootstrapPlan && labHandoffPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-lab-readiness"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Dedicated CRC Lab Readiness</h4>
                  <small>{labBootstrapPlan.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{labBootstrapPlan.artifactStatus}</span>
                <span>{labHandoffPlan.artifactStatus}</span>
                <span>head={labBootstrapPlan.headSha}</span>
                <span>dirty={String(labBootstrapPlan.worktreeDirty)}</span>
                <span>
                  clusterMutationAttempted=
                  {String(
                    labBootstrapPlan.mutationBoundary.clusterMutationAttempted ||
                      labHandoffPlan.mutationBoundary.clusterMutationAttempted
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    labBootstrapPlan.mutationBoundary.registryMutationAttempted ||
                      labHandoffPlan.mutationBoundary.registryMutationAttempted
                  )}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Lab Tier</span>
                  <strong>{labBootstrapPlan.labTier}</strong>
                </div>
                <div>
                  <span>CPU / RAM</span>
                  <strong>
                    {labBootstrapPlan.machine.cpuCount} cores /{" "}
                    {labBootstrapPlan.machine.ramGb}GiB
                  </strong>
                </div>
                <div>
                  <span>GPU Runtime</span>
                  <strong>
                    {labBootstrapPlan.gpuRuntimeCandidate
                      ? "candidate"
                      : labBootstrapPlan.runtimePlacement}
                  </strong>
                </div>
                <div>
                  <span>Recommended CRC</span>
                  <strong>
                    {labBootstrapPlan.recommendedCrc.memoryGb}GiB /{" "}
                    {labBootstrapPlan.recommendedCrc.cpuCores} CPU /{" "}
                    {labBootstrapPlan.recommendedCrc.diskGb}GiB
                  </strong>
                </div>
                <div>
                  <span>Image Map</span>
                  <strong>
                    blocking={labBootstrapPlan.imageRefPlan.blockingCount},
                    external={labBootstrapPlan.imageRefPlan.externalRuntimeCount}
                  </strong>
                </div>
                <div>
                  <span>Portable Tar</span>
                  <strong>
                    exists={String(labHandoffPlan.imageTar.exists)},
                    missingTags=
                    {labHandoffPlan.imageTar.missingTags.join(",") || "none"}
                  </strong>
                </div>
                <div>
                  <span>Handoff Sources</span>
                  <strong>
                    {labHandoffPlan.sourceArtifacts
                      .slice(0, 4)
                      .map(
                        (source) =>
                          `${source.id}:${source.fresh ? "fresh" : "stale"}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
              </div>
              <div className="admin-evidence-line">
                {labBootstrapPlan.recommendedCrc.commands.map((command) => (
                  <span key={command}>{command}</span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lab-machine-role-plan"
              >
                <span>
                  bootstrapWorkstation=
                  {labBootstrapPlan.machineRolePlan.workstation.role}:
                  {labBootstrapPlan.machineRolePlan.workstation.firstCommandId}
                </span>
                <span>
                  bootstrapTransfer=
                  {labBootstrapPlan.machineRolePlan.transfer.role}:ready=
                  {String(labBootstrapPlan.machineRolePlan.transfer.ready)}
                </span>
                <span>
                  bootstrapMissing=
                  {labBootstrapPlan.machineRolePlan.transfer.missingTags.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  bootstrapLabHost=
                  {labBootstrapPlan.machineRolePlan.labHost.role}:first=
                  {
                    labBootstrapPlan.machineRolePlan.labHost
                      .firstReadOnlyCommandId
                  }
                </span>
                <span>
                  bootstrapApproval=
                  {labBootstrapPlan.machineRolePlan.labHost.approvalGatedCommandIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  workstation=
                  {labHandoffPlan.machineRolePlan.workstation.role}:
                  {labHandoffPlan.machineRolePlan.workstation.firstCommandId}
                </span>
                <span>
                  transfer=
                  {labHandoffPlan.machineRolePlan.transfer.role}:ready=
                  {String(labHandoffPlan.machineRolePlan.transfer.ready)}
                </span>
                <span>
                  transferMissing=
                  {labHandoffPlan.machineRolePlan.transfer.missingTags.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  labHost={labHandoffPlan.machineRolePlan.labHost.role}:first=
                  {
                    labHandoffPlan.machineRolePlan.labHost
                      .firstReadOnlyCommandId
                  }
                </span>
                <span>
                  labApproval=
                  {labHandoffPlan.machineRolePlan.labHost.approvalGatedCommandIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  companyOcpUsed=
                  {String(labHandoffPlan.machineRolePlan.labHost.companyOcpUsed)}
                </span>
              </div>
              <div className="remediation-notes">
                <p>{labBootstrapPlan.currentJudgment}</p>
                <p>{labBootstrapPlan.nextCommand.command}</p>
                <p>{labHandoffPlan.nextCommand.command}</p>
              </div>
            </div>
          ) : null}
          {certificationPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-certification-readiness"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Certification Readiness</h4>
                  <small>{certificationPlan.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{certificationPlan.artifactStatus}</span>
                <span>head={certificationPlan.headSha}</span>
                <span>dirty={String(certificationPlan.worktreeDirty)}</span>
                <span>
                  registryMutationAttempted=
                  {String(certificationPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(certificationPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(certificationPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Submission CLI</span>
                  <strong>
                    {certificationPlan.cli.length
                      ? certificationPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"} external=${String(tool.requiredForExternalSubmission)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Gate Counts</span>
                  <strong>
                    internal={certificationPlan.gateCounts.internalCatalog.pass}/
                    {certificationPlan.gateCounts.internalCatalog.total},
                    community={certificationPlan.gateCounts.communityOperator.pass}/
                    {certificationPlan.gateCounts.communityOperator.total},
                    certified={certificationPlan.gateCounts.certifiedOperator.pass}/
                    {certificationPlan.gateCounts.certifiedOperator.total}
                  </strong>
                </div>
                <div>
                  <span>Documents</span>
                  <strong>
                    {Object.entries(certificationPlan.documents).length
                      ? Object.entries(certificationPlan.documents)
                          .slice(0, 4)
                          .map(
                            ([key, value]) =>
                              `${key}:${value.split(/[\\/]/).pop() ?? value}`
                          )
                          .join(", ")
                      : "documents missing"}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {certificationPlan.missingEvidence.length
                      ? `${certificationPlan.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Tooling Handoff</span>
                  <strong>
                    {certificationPlan.toolingHandoff.status} / missing=
                    {certificationPlan.toolingHandoff.missingRequiredTools
                      .length
                      ? certificationPlan.toolingHandoff.missingRequiredTools.join(
                          ", "
                        )
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Execution Lanes</span>
                  <strong>
                    {certificationPlan.toolingHandoff.executionLanes.length
                      ? certificationPlan.toolingHandoff.executionLanes
                          .map((lane) => `${lane.id}:${lane.status}`)
                          .join(", ")
                      : "not listed"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-cli"
              >
                {certificationPlan.cli.slice(0, 5).map((tool) => (
                  <span key={tool.name}>
                    {tool.name}:{tool.available ? "ready" : "missing"} required=
                    {String(tool.requiredForExternalSubmission)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-handoff"
              >
                <span>{certificationPlan.toolingHandoff.actionMode}</span>
                <span>
                  status={certificationPlan.toolingHandoff.status}
                </span>
                <span>
                  satisfiedBy=
                  {certificationPlan.toolingHandoff.toolingSatisfiedBy}
                </span>
                <span>
                  missing=
                  {certificationPlan.toolingHandoff.missingRequiredTools.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  readOnlyCommands=
                  {certificationPlan.toolingHandoff.readOnlyCommands.length}
                </span>
                <span>
                  setupCommands=
                  {certificationPlan.toolingHandoff.setupCommands.length}
                </span>
                <span>
                  approvalGated=
                  {
                    certificationPlan.toolingHandoff.approvalGatedCommands
                      .length
                  }
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-ci-runner"
              >
                <span>
                  status=
                  {certificationPlan.toolingHandoff.runnerEvidence.status}
                </span>
                <span>
                  path={certificationPlan.toolingHandoff.runnerEvidence.path}
                </span>
                <span>
                  sameHead=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidence.sameHead
                  )}
                </span>
                <span>
                  mutation=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidence.mutation
                  )}
                </span>
                <span>
                  tools=
                  {[
                    `oc:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.oc}`,
                    `docker:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.docker}`,
                    `opm:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.opm}`,
                    `operator-sdk:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.operatorSdk}`
                  ].join(", ")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-ci-runner-action"
              >
                <span>
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.id}
                </span>
                <span>
                  owner=
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.owner}
                </span>
                <span>
                  status=
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.status}
                </span>
                <span>
                  final=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .finalEvidencePath
                  }
                </span>
                <span>
                  draft=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .draftCommand
                  }
                </span>
                <span>
                  promote=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .promotionCommand
                  }
                </span>
                <span>
                  verify=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .verificationCommand
                  }
                </span>
                <span>
                  writesLocalEvidence=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .writesLocalEvidence
                  )}
                </span>
                <span>
                  reviewedInput=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .requiresReviewedInput
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .mutationAllowed
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-release-manager-packet"
              >
                <span>
                  packet=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ??
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .markdownPath}
                </span>
                <span>
                  exists=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket.exists
                  )}
                </span>
                <span>
                  ticket=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.ticketId}
                </span>
                <span>
                  first=
                  {
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .firstReadOnlyActionId
                  }
                </span>
                <span>
                  setup=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.setupActionIds.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  approval=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.approvalGatedActionIds.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  submissionExecuted=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .externalSubmissionExecutedByVerifier
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .mutationBoundary.mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-ci-runner-draft"
              >
                <span>
                  draft={certificationPlan.toolingHandoff.runnerDraft.evidenceState}
                </span>
                <span>
                  path={certificationPlan.toolingHandoff.runnerDraft.path}
                </span>
                <span>
                  sameHead=
                  {String(certificationPlan.toolingHandoff.runnerDraft.sameHead)}
                </span>
                <span>
                  mutation=
                  {String(certificationPlan.toolingHandoff.runnerDraft.mutation)}
                </span>
                <span>
                  final=
                  {
                    certificationPlan.toolingHandoff.runnerDraft
                      .finalEvidenceFile
                  }
                </span>
                <span>
                  missing=
                  {
                    certificationPlan.toolingHandoff.runnerDraft
                      .missingEvidence.length
                  }
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-execution-lanes"
              >
                {certificationPlan.toolingHandoff.executionLanes.map((lane) => (
                  <span key={lane.id}>
                    {lane.id}:{lane.status}:owner={lane.owner}:mutation=
                    {String(lane.mutation)}:approval=
                    {String(lane.requiresExplicitApproval)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-freshness-policy"
              >
                <span>
                  requiredHead=
                  {certificationPlan.toolingHandoff.freshnessPolicy.requiredHead}
                </span>
                <span>
                  worktree=
                  {
                    certificationPlan.toolingHandoff.freshnessPolicy
                      .worktreeRequirement
                  }
                </span>
                <span>
                  rerunAfter=
                  {certificationPlan.toolingHandoff.freshnessPolicy.rerunAfter
                    .slice(0, 4)
                    .join(", ") || "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-next"
              >
                {certificationPlan.toolingHandoff.nextCommands
                  .slice(0, 4)
                  .map((command) => (
                    <span key={command}>{command}</span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-first-submission-actions"
              >
                {certificationPlan.firstSubmissionActions.length ? (
                  certificationPlan.firstSubmissionActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>certification submission first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-gates"
              >
                {Object.entries(certificationPlan.gateCounts).map(
                  ([gate, counts]) => (
                    <span key={gate}>
                      {gate} pass={counts.pass} warn={counts.warn} fail=
                      {counts.fail}
                    </span>
                  )
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {certificationPlan.risk[0] ??
                    "Certification readiness is local evidence only and does not submit externally."}
                </p>
                <p>
                  {certificationPlan.rollbackPath[0] ??
                    "Regenerate certification evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {communitySubmissionPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-community-submission"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Community Submission</h4>
                  <small>{communitySubmissionPlan.actionMode}</small>
                </div>
                <FileDiff size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{communitySubmissionPlan.artifactStatus}</span>
                <span>head={communitySubmissionPlan.headSha}</span>
                <span>dirty={String(communitySubmissionPlan.worktreeDirty)}</span>
                <span>parity={String(communitySubmissionPlan.parityPassed)}</span>
                <span>
                  externalSubmissionAttempted=
                  {String(communitySubmissionPlan.externalSubmissionAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(communitySubmissionPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(communitySubmissionPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(communitySubmissionPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Layout</span>
                  <strong>
                    {communitySubmissionPlan.submissionLayout.root} /
                    {communitySubmissionPlan.submissionLayout.version}
                  </strong>
                </div>
                <div>
                  <span>Parity Entries</span>
                  <strong>
                    {communitySubmissionPlan.sourceBundleParity.length
                      ? communitySubmissionPlan.sourceBundleParity
                          .map(
                            (entry) =>
                              `${entry.id}:${entry.match ? "match" : "drift"}`
                          )
                          .join(", ")
                      : "missing"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Checks</span>
                  <strong>
                    {communitySubmissionPlan.readOnlyCommands.length
                      ? communitySubmissionPlan.readOnlyCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Approval Gate</span>
                  <strong>
                    {communitySubmissionPlan.approvalGatedCommands.length
                      ? communitySubmissionPlan.approvalGatedCommands
                          .map((command) => `${command.id}:approval`)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-community-submission-first-actions"
              >
                {communitySubmissionPlan.firstSubmissionActions.length ? (
                  communitySubmissionPlan.firstSubmissionActions.map(
                    (action) => (
                      <span key={action.id}>
                        {action.id}:{action.owner}:{action.status}:next=
                        {action.nextCommand}:mutation={String(action.mutation)}
                        :approval={String(action.requiresExplicitApproval)}
                      </span>
                    )
                  )
                ) : (
                  <span>community submission first actions missing</span>
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {communitySubmissionPlan.risk[0] ??
                    "Community Operator submission is local evidence only."}
                </p>
                <p>
                  {communitySubmissionPlan.rollbackPath[0] ??
                    "Regenerate community submission evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {externalRuntimePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-external-runtime-plan"
            >
              <div className="admin-evidence-line">
                <span>{externalRuntimePlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(externalRuntimePlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(externalRuntimePlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(externalRuntimePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Runtime Images</span>
                  <strong>
                    {externalRuntimePlan.externalImages.length
                      ? externalRuntimePlan.externalImages
                          .map(
                            (image) =>
                              `${image.name}:${image.status} draft=${image.draftStatus}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Evidence Templates</span>
                  <strong>
                    {externalRuntimePlan.evidenceTemplates.length
                      ? externalRuntimePlan.evidenceTemplates
                          .map((template) => `${template.name}:${template.status}`)
                          .join(", ")
                      : "templates missing"}
                  </strong>
                </div>
                <div>
                  <span>Draft Intake</span>
                  <strong>
                    {externalRuntimePlan.evidenceDrafts.length
                      ? externalRuntimePlan.evidenceDrafts
                          .map((draft) => `${draft.name}:${draft.status}`)
                          .join(", ")
                      : "drafts missing"}
                  </strong>
                </div>
                <div>
                  <span>Mirror Commands</span>
                  <strong>
                    {externalRuntimePlan.mutatingCommands.length
                      ? externalRuntimePlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-plan-first-actions"
              >
                {externalRuntimePlan.firstPlanActions.length ? (
                  externalRuntimePlan.firstPlanActions
                    .slice(0, 5)
                    .map((action) => (
                      <span key={action.id}>
                        {action.owner}:{action.id}:{action.status}:mutation=
                        {String(action.mutation)}:approval=
                        {String(action.requiresExplicitApproval)}:next=
                        {action.nextCommand}
                      </span>
                    ))
                ) : (
                  <span>firstPlanActions=missing</span>
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {externalRuntimePlan.risk[0] ??
                    "External runtime mirror commands remain blocked until approval."}
                </p>
                <p>
                  {externalRuntimePlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before mirroring runtime images."}
                </p>
              </div>
            </div>
          ) : null}
          {externalRuntimeReview ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-external-runtime-review-packet"
            >
              <div className="admin-evidence-line">
                <span>{externalRuntimeReview.artifactStatus}</span>
                <span>{externalRuntimeReview.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(externalRuntimeReview.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(externalRuntimeReview.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(externalRuntimeReview.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Packet</span>
                  <strong>
                    {externalRuntimeReview.markdownPath.split(/[\\/]/).pop() ??
                      externalRuntimeReview.markdownPath}
                  </strong>
                </div>
                <div>
                  <span>Reviewer Requests</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${image.reviewerRequests.length}`
                      )
                      .join(", ") || "none"}
                  </strong>
                </div>
                <div>
                  <span>Source Digest</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${image.sourceDigestInspectionStatus}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Final Evidence</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${String(image.finalEvidenceExists)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Candidate Matrix</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map((image) => {
                        const best = image.candidateMatrix.bestCandidate;
                        return best
                          ? `${image.name}:${image.candidateMatrix.status} best=${best.label} critical=${best.criticalFindings} high=${best.highFindings}`
                          : `${image.name}:${image.candidateMatrix.status} best=missing`;
                      })
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Candidate Handoff</span>
                  <strong>
                    {externalRuntimeReview.candidateHandoff
                      .map(
                        (handoff) =>
                          `${handoff.imageName}:${handoff.status} eligible=${String(handoff.releaseEligible)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Final Handoff</span>
                  <strong>
                    {externalRuntimeReview.finalEvidenceHandoff
                      .map(
                        (handoff) =>
                          `${handoff.imageName}:${handoff.status} approval=${String(handoff.approvalRequired)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-candidate-handoff"
              >
                {externalRuntimeReview.candidateHandoff.map((handoff) => (
                  <span key={`${handoff.imageName}-candidate-handoff`}>
                    {`${handoff.imageName}:${handoff.status}:owner=${handoff.owner}:candidate=${handoff.candidateImage}:critical=${handoff.criticalFindings}:high=${handoff.highFindings}:releaseEligible=${String(handoff.releaseEligible)}:approvalRequired=${String(handoff.approvalRequired)}:mutationAllowed=${String(handoff.mutationAllowed)}:next=${handoff.nextCommand}`}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-final-evidence-handoff"
              >
                {externalRuntimeReview.finalEvidenceHandoff.map((handoff) => (
                  <span key={`${handoff.imageName}-final-handoff`}>
                    {`${handoff.imageName}:${handoff.status}:owner=${handoff.owner}:finalEvidence=${String(handoff.finalEvidenceExists)}:requests=${handoff.reviewerRequestCount}:missing=${handoff.missingEvidenceCount}:approvalRequired=${String(handoff.approvalRequired)}:requiresExplicitApproval=${String(handoff.requiresExplicitApproval)}:mutationAllowed=${String(handoff.mutationAllowed)}:writesLocalEvidence=${String(handoff.writesLocalEvidence)}:next=${handoff.promotionCommand}:verify=${handoff.verificationCommand}`}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-final-evidence-action"
              >
                <span>{externalRuntimeReview.finalEvidenceAction.id}</span>
                <span>
                  owner={externalRuntimeReview.finalEvidenceAction.owner}
                </span>
                <span>
                  status={externalRuntimeReview.finalEvidenceAction.status}
                </span>
                <span>
                  ready=
                  {externalRuntimeReview.finalEvidenceAction.finalEvidenceReadyCount}
                  /{externalRuntimeReview.finalEvidenceAction.imageCount}
                </span>
                <span>
                  requests=
                  {externalRuntimeReview.finalEvidenceAction.reviewerRequestCount}
                </span>
                <span>
                  missing=
                  {externalRuntimeReview.finalEvidenceAction.missingEvidenceCount}
                </span>
                <span>
                  first=
                  {externalRuntimeReview.finalEvidenceAction.firstReadOnlyCommand}
                </span>
                <span>
                  verify=
                  {externalRuntimeReview.finalEvidenceAction.verificationCommand}
                </span>
                <span>
                  promote=
                  {externalRuntimeReview.finalEvidenceAction.promotionCommands
                    .slice(0, 2)
                    .join(", ")}
                </span>
                <span>
                  writesLocalEvidence=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.writesLocalEvidence
                  )}
                </span>
                <span>
                  reviewedInput=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.requiresReviewedInput
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.mutationAllowed
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-candidates"
              >
                {externalRuntimeReview.images.map((image) => (
                  <span key={`${image.name}-candidate`}>
                    {image.name}:candidate={image.candidateMatrix.status}
                    {image.candidateMatrix.bestCandidate
                      ? ` critical=${image.candidateMatrix.bestCandidate.criticalFindings} high=${image.candidateMatrix.bestCandidate.highFindings}`
                      : " best=missing"} zeroCritical=
                    {image.candidateMatrix.zeroCriticalCount}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-first-actions"
              >
                {externalRuntimeReview.firstReviewerActions.length ? (
                  externalRuntimeReview.firstReviewerActions.map((action) => (
                    <span key={`${action.imageName}-${action.role}`}>
                      {action.imageName}:{action.role}:{action.nextCommand}:
                      finalEvidence={String(action.finalEvidenceExists)}
                    </span>
                  ))
                ) : (
                  <span>first reviewer actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-registry-actions"
              >
                {externalRuntimeReview.firstRegistryActions.length ? (
                  externalRuntimeReview.firstRegistryActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>registry first actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-registry-tickets"
              >
                <span>
                  registryPacket=
                  {externalRuntimeReview.registryAdminPacket.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                  :exists=
                  {String(externalRuntimeReview.registryAdminPacket.exists)}
                  :loginExecuted=
                  {String(
                    externalRuntimeReview.registryAdminPacket
                      .registryLoginExecutedByVerifier
                  )}
                </span>
                {externalRuntimeReview.ticketPackets.length ? (
                  externalRuntimeReview.ticketPackets.map((ticket) => (
                    <span key={ticket.id}>
                      {ticket.id}:{ticket.owner}:{ticket.severity}:image=
                      {ticket.imageName}:classification={ticket.classification}
                      :authRequired=
                      {String(ticket.registryAuthBoundary?.authRequired ?? false)}
                      :credentialStored=
                      {String(
                        ticket.registryAuthBoundary?.credentialStoredByVerifier ??
                          false
                      )}
                      :registryLogin=
                      {String(
                        ticket.registryAuthBoundary
                          ?.registryLoginExecutedByVerifier ?? false
                      )}
                      :first={ticket.firstReadOnlyAction.id}:approval=
                      {ticket.approvalGatedAction.id}:requiresApproval=
                      {String(ticket.approvalGatedAction.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>registry tickets clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-reviewer-actions"
              >
                {externalRuntimeReview.images.flatMap((image) =>
                  image.reviewerRequests.slice(0, 3).map((request) => (
                    <span key={`${image.name}-${request.role}-${request.request}`}>
                      {image.name}:{request.role}:{request.nextCommand}
                    </span>
                  ))
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-review-commands"
              >
                {externalRuntimeReview.readOnlyCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      {command.id} mutation={String(command.mutation)}
                    </span>
                  ))}
                {externalRuntimeReview.approvalGatedCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      not-run {command.id} approval=
                      {String(command.requiresExplicitApproval)}
                    </span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {externalRuntimeReview.risk[0] ??
                    "External runtime review packet is local evidence only."}
                </p>
                <p>
                  {externalRuntimeReview.rollbackPath[0] ??
                    "Regenerate the review packet after draft evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {securityScanPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-security-scan-plan"
            >
              <div className="admin-evidence-line">
                <span>{securityScanPlan.artifactStatus}</span>
                <span>{securityScanPlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(securityScanPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(securityScanPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(securityScanPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Scan CLI</span>
                  <strong>
                    {securityScanPlan.cli.length
                      ? securityScanPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Image Evidence</span>
                  <strong>
                    {securityScanPlan.images.length
                      ? securityScanPlan.images
                          .slice(0, 6)
                          .map(
                            (image) =>
                              `${image.name}:scan=${String(image.vulnerabilityReportExists)} sbom=${String(image.sbomExists)} review=${String(image.reviewExists)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Evidence</span>
                  <strong>
                    {securityScanPlan.readOnlyCommands.length
                      ? securityScanPlan.readOnlyCommands
                          .slice(0, 5)
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Approval-gated Signing</span>
                  <strong>
                    {securityScanPlan.approvalGatedCommands.length
                      ? securityScanPlan.approvalGatedCommands
                          .slice(0, 5)
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Final Review</span>
                  <strong>
                    {securityScanPlan.securityReviewFinalHandoff.length
                      ? securityScanPlan.securityReviewFinalHandoff
                          .slice(0, 6)
                          .map(
                            (handoff) =>
                              `${handoff.imageName}:${handoff.status} approval=${String(handoff.approvalRequired)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-first-review-actions"
              >
                {securityScanPlan.firstSecurityReviewActions.length ? (
                  securityScanPlan.firstSecurityReviewActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>security review first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-tickets"
              >
                {securityScanPlan.ticketPackets.length ? (
                  securityScanPlan.ticketPackets.map((ticket) => (
                    <span key={ticket.id}>
                      {ticket.id}:{ticket.owner}:{ticket.severity}:image=
                      {ticket.imageName}:classification={ticket.classification}
                      :first={ticket.firstReadOnlyAction.id}:approval=
                      {ticket.approvalGatedAction.id}:requiresApproval=
                      {String(ticket.approvalGatedAction.requiresExplicitApproval)}
                      :mutationAllowed=
                      {String(
                        ticket.mutationBoundary.mutationAllowedByThisVerifier
                      )}
                    </span>
                  ))
                ) : (
                  <span>security review tickets clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-final-handoff"
              >
                {securityScanPlan.securityReviewFinalHandoff.length ? (
                  securityScanPlan.securityReviewFinalHandoff
                    .slice(0, 7)
                    .map((handoff) => (
                      <span key={`${handoff.imageName}-security-final`}>
                        {handoff.imageName}:{handoff.status}:owner=
                        {handoff.owner}:finalEvidence=
                        {String(handoff.finalEvidenceExists)}:reviewApproved=
                        {String(handoff.reviewApproved)}:missing=
                        {handoff.missingEvidenceCount}:approvalRequired=
                        {String(handoff.approvalRequired)}
                        :requiresExplicitApproval=
                        {String(handoff.requiresExplicitApproval)}
                        :mutationAllowed={String(handoff.mutationAllowed)}
                        :writesLocalEvidence=
                        {String(handoff.writesLocalEvidence)}:next=
                        {handoff.promotionCommand}:verify=
                        {handoff.verificationCommand}
                      </span>
                    ))
                ) : (
                  <span>security review final handoff missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-scan-runner-evidence"
              >
                <span>
                  status={securityScanPlan.runnerEvidence.status}
                </span>
                <span>
                  evidenceWritten=
                  {String(securityScanPlan.runnerEvidence.evidenceWritten)}
                </span>
                <span>
                  fresh={String(securityScanPlan.runnerEvidence.fresh)}
                </span>
                <span>
                  dockerFallback=
                  {String(
                    securityScanPlan.runnerEvidence.executeDockerFallback
                  )}
                </span>
                <span>
                  digestPinned=
                  {String(securityScanPlan.runnerEvidence.scannerDigestsPinned)}
                </span>
                <span>
                  missingTargets=
                  {securityScanPlan.runnerEvidence.missingTargets.join(", ") ||
                    "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-drafts"
              >
                {securityScanPlan.images.slice(0, 7).map((image) => (
                  <span key={image.name}>
                    {image.name}:draft={image.reviewDraft.evidenceState}
                    :sameHead={String(image.reviewDraft.sameHead)}
                    :decision={image.reviewDraft.decision}
                    :explicitDecision={String(
                      image.reviewDraft.explicitDecisionProvided
                    )}
                    :reviewer={String(image.reviewDraft.reviewerProvided)}
                    :ticket={String(image.reviewDraft.ticketProvided)}
                    :ready={String(image.reviewDraft.readyForFinalReview)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {securityScanPlan.risk[0] ??
                    "Security scan evidence reads local readiness only."}
                </p>
                <p>
                  {securityScanPlan.rollbackPath[0] ??
                    "Regenerate security scan evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {ownedImageProvenancePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-owned-image-provenance"
            >
              <div className="admin-evidence-line">
                <span>
                  {actionModeText(language, ownedImageProvenancePlan.actionMode)}
                </span>
                <span>
                  {copy.registryMutationAttempted}:{" "}
                  {booleanText(
                    language,
                    ownedImageProvenancePlan.registryMutationAttempted
                  )}
                </span>
                <span>
                  {copy.clusterMutationAttempted}:{" "}
                  {booleanText(
                    language,
                    ownedImageProvenancePlan.clusterMutationAttempted
                  )}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(ownedImageProvenancePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>{copy.requiredImages}</span>
                  <strong>
                    {ownedImageProvenancePlan.requiredImages.length
                      ? ownedImageProvenancePlan.requiredImages.join(", ")
                      : "operator, api, dashboard, bundle"}
                  </strong>
                </div>
                <div>
                  <span>{copy.localInspect}</span>
                  <strong>
                    {ownedImageProvenancePlan.images.length
                      ? ownedImageProvenancePlan.images
                          .map(
                            (image) =>
                              `${image.name}:${statusText(language, image.status)}`
                          )
                          .join(", ")
                      : copy.blockedUntilEvidenceExists}
                  </strong>
                </div>
                <div>
                  <span>{copy.remainingEvidence}</span>
                  <strong>
                    {ownedImageProvenancePlan.missingEvidence.length
                      ? `${ownedImageProvenancePlan.missingEvidence.length} ${copy.evidenceGaps}`
                      : copy.none}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {ownedImageProvenancePlan.risk[0] ??
                    "Owned image provenance reads local image metadata only."}
                </p>
                <p>
                  {ownedImageProvenancePlan.rollbackPath[0] ??
                    "Regenerate image build and provenance evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {releasePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-publish-plan"
            >
              <div className="admin-evidence-line">
                <span>{releasePlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(releasePlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releasePlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releasePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Approvals</span>
                  <strong>{releasePlan.requiredApprovals.join(", ")}</strong>
                </div>
                <div>
                  <span>Publish Commands</span>
                  <strong>
                    {releasePlan.mutatingCommands.length
                      ? releasePlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-first-publish-actions"
              >
                {releasePlan.firstPublishActions.length ? (
                  releasePlan.firstPublishActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.nextCommand}:mutation=
                      {String(action.mutation)}:approval=
                      {String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>first publish actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-publish-ticket"
              >
                <span>
                  {releasePlan.ticketPacket.id}:{releasePlan.ticketPacket.owner}:
                  {releasePlan.ticketPacket.classification}:first=
                  {releasePlan.ticketPacket.firstReadOnlyAction.id}:approval=
                  {releasePlan.ticketPacket.approvalGatedAction.id}
                  :requiresApproval=
                  {String(
                    releasePlan.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(
                    releasePlan.ticketPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-publish-decision-action"
              >
                <span>
                  {releasePlan.publishDecisionAction.id}:
                  {releasePlan.publishDecisionAction.owner}:status=
                  {releasePlan.publishDecisionAction.status}:first=
                  {releasePlan.publishDecisionAction.readOnlyPreflightCommandId}
                  :setup=
                  {releasePlan.publishDecisionAction.humanSetupCommandIds.join(
                    ","
                  ) || "none"}
                  :approval=
                  {releasePlan.publishDecisionAction.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                  :secret=
                  {String(
                    releasePlan.publishDecisionAction.requiresHumanSecretInput
                  )}
                  :explicitApproval=
                  {String(
                    releasePlan.publishDecisionAction.requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(releasePlan.publishDecisionAction.mutationAllowed)}
                  :writesLocalEvidence=
                  {String(releasePlan.publishDecisionAction.writesLocalEvidence)}
                  :publishRequiresExplicitApproval=
                  {String(
                    releasePlan.publishDecisionAction
                      .publishRequiresExplicitApproval
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-manager-publish-packet"
              >
                <span>
                  packet=
                  {releasePlan.releaseManagerPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ?? releasePlan.releaseManagerPacket.markdownPath}
                </span>
                <span>
                  exists={String(releasePlan.releaseManagerPacket.exists)}
                </span>
                <span>
                  ticket={releasePlan.releaseManagerPacket.ticketId}
                </span>
                <span>
                  decision=
                  {releasePlan.releaseManagerPacket.publishDecisionActionId}
                </span>
                <span>
                  first={releasePlan.releaseManagerPacket.firstReadOnlyActionId}
                </span>
                <span>
                  setup=
                  {releasePlan.releaseManagerPacket.humanSetupCommandIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  approval=
                  {releasePlan.releaseManagerPacket.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                </span>
                <span>
                  registryLoginExecuted=
                  {String(
                    releasePlan.releaseManagerPacket
                      .registryLoginExecutedByVerifier
                  )}
                </span>
                <span>
                  releasePublishExecuted=
                  {String(
                    releasePlan.releaseManagerPacket
                      .releasePublishExecutedByVerifier
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    releasePlan.releaseManagerPacket.mutationBoundary
                      .registryMutationAttempted
                  )}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {releasePlan.risk[0] ??
                    "Release publish commands remain blocked until approval."}
                </p>
                <p>
                  {releasePlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before publishing images."}
                </p>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
