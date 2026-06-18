import type {
  AssistantAnswer,
  AuditEnvelope,
  ContextChip
} from "@kugnus/contracts";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent
} from "react";
import {
  CheckCircle2,
  FileSearch,
  Move,
  Pin,
  PinOff,
  RefreshCw,
  Route,
  ShieldAlert,
  SendHorizontal,
  Undo2,
  X
} from "lucide-react";
import type { UiLanguage } from "../i18n";
import opsLensIcon from "../assets/brand/cywell_ops_lens_icon.png";

interface AssistantPopoverProps {
  draft: string;
  contextChips: ContextChip[];
  answer: AssistantAnswer;
  requestId: string;
  audit: AuditEnvelope | null;
  apiStatus: "loading" | "ready" | "fallback";
  busy: boolean;
  model: string;
  language: UiLanguage;
  apiRouteMode: string;
  actionPlanPath: string;
  lastApiError: string | null;
  onDraftChange: (draft: string) => void;
  onAsk: () => void;
  onRetryConnection: () => void;
  onClose: () => void;
}

const assistantCopy = {
  en: {
    ariaLabel: "KOMSCO AI Assistant",
    eyebrow: "KOMSCO AI Assistant",
    readyStatus: "API connected / plan-only",
    close: "Close assistant",
    request: "request",
    model: "model",
    context: "context",
    route: "route",
    endpoint: "endpoint",
    error: "last error",
    errorInterpretation: "interpretation",
    answerSource: "answer source",
    sourceLive: "OpsLens API route",
    sourceFallback: "plan-only fallback",
    tokenPath: "token path",
    tokenConsole: "OpenShift UserToken proxy",
    tokenLocal: "CRC validation tunnel",
    mutationBoundaryShort: "cluster changes",
    mutationBoundaryValue: "not executed",
    retry: "Retry API",
    pin: "Pin assistant",
    unpin: "Unlock and move assistant",
    move: "Move assistant",
    placementPinned: "pinned",
    placementFloating: "movable",
    integrationTitle: "Integration contract",
    integrationStandalone:
      "CRC validation shell uses the same OpsLens question flow before the console route is attached.",
    integrationConsole:
      "Installed ConsolePlugin uses the UserToken proxy for OpsLens API.",
    integrationLightspeed:
      "Native Lightspeed drawer is separate; OpsLens MCP registration is explicit.",
    executionTitle: "Ask execution path",
    executionEnter: "Enter asks KOMSCO AI Assistant",
    executionFallback: "Fallback remains plan-only when the API is unavailable",
    executionNewline: "Shift+Enter adds a line",
    smokeTitle: "Connection smoke",
    smokeContextSync: "context sync",
    smokeActionPlan: "action plan API",
    smokeMutationBoundary: "cluster mutation",
    smokeReady: "ready",
    smokeChecking: "checking",
    smokeFallback: "plan fallback",
    smokeBlocked: "blocked",
    pending: "pending",
    actionMode: "action mode",
    prompt: "Ask KOMSCO AI Assistant",
    asking: "Asking",
    ask: "Ask",
    currentJudgment: "Current Judgment",
    inspectedEvidence: "Inspected Evidence",
    causeCandidates: "Cause Candidates",
    nextChecks: "Next Checks",
    risksAndMissingEvidence: "Risks And Missing Evidence",
    risk: "Risk",
    missingEvidence: "Missing Evidence",
    planAndRollback: "Plan And Rollback Path",
    citations: "Citations",
    diagnostics: "Connection details",
    answerDetails: "Evidence and next checks",
    userBubble: "You",
    assistantBubble: "KOMSCO",
    readOnlyHint: "Read-only guidance, no cluster mutation"
  },
  ko: {
    ariaLabel: "KOMSCO AI 어시스턴트",
    eyebrow: "KOMSCO AI 어시스턴트",
    readyStatus: "API 연결됨 / 계획 전용",
    close: "어시스턴트 닫기",
    request: "요청",
    model: "모델",
    context: "컨텍스트",
    route: "경로",
    endpoint: "엔드포인트",
    error: "마지막 오류",
    errorInterpretation: "오류 해석",
    answerSource: "답변 출처",
    sourceLive: "OpsLens API 경로",
    sourceFallback: "계획 전용 대체 응답",
    tokenPath: "토큰 경로",
    tokenConsole: "OpenShift 사용자 토큰 프록시",
    tokenLocal: "CRC 검증 터널",
    mutationBoundaryShort: "클러스터 변경",
    mutationBoundaryValue: "실행 안 함",
    retry: "API 재시도",
    pin: "어시스턴트 고정",
    unpin: "고정 해제 후 이동",
    move: "어시스턴트 이동",
    placementPinned: "고정",
    placementFloating: "이동 가능",
    integrationTitle: "연동 계약",
    integrationStandalone:
      "CRC 검증 화면도 콘솔 라우트 연결 전 동일한 OpsLens 질문 흐름을 사용",
    integrationConsole:
      "설치된 ConsolePlugin은 사용자 토큰 프록시로 OpsLens API 사용",
    integrationLightspeed:
      "기본 Lightspeed 서랍은 별도이며 OpsLens MCP 등록은 명시 승인",
    executionTitle: "질문 실행 경로",
    executionEnter: "Enter는 KOMSCO AI 어시스턴트에 질문",
    executionFallback: "API가 없을 때만 계획 전용 대체 응답 유지",
    executionNewline: "Shift+Enter는 줄바꿈",
    smokeTitle: "연결 스모크",
    smokeContextSync: "컨텍스트 동기화",
    smokeActionPlan: "액션 플랜 API",
    smokeMutationBoundary: "클러스터 변경",
    smokeReady: "준비됨",
    smokeChecking: "확인 중",
    smokeFallback: "계획 대체",
    smokeBlocked: "차단",
    pending: "대기 중",
    actionMode: "동작 모드",
    prompt: "KOMSCO AI 어시스턴트에 질문",
    asking: "질문 중",
    ask: "질문",
    currentJudgment: "현재 판단",
    inspectedEvidence: "확인한 근거",
    causeCandidates: "원인 후보",
    nextChecks: "다음 확인",
    risksAndMissingEvidence: "리스크와 부족한 근거",
    risk: "리스크",
    missingEvidence: "부족한 근거",
    planAndRollback: "계획과 롤백 경로",
    citations: "인용",
    diagnostics: "연결 상세",
    answerDetails: "근거와 다음 확인",
    userBubble: "질문",
    assistantBubble: "KOMSCO",
    readOnlyHint: "읽기 전용 가이드, 클러스터 변경 없음"
  }
} as const;

const connectionCopy = {
  en: {
    title: "Connection decision",
    loadingDetail:
      "OpsLens is checking the context sync and action plan route before answering.",
    readyDetail:
      "The action plan API answered. The visible response is coming through the configured OpsLens API route.",
    fallbackDetail:
      "The API route did not answer, so OpsLens is showing the local plan-only answer instead of pretending live AI is connected.",
    routePrefix: "Route",
    boundary: "Chat remains read-only/plan-only; it does not mutate the cluster.",
    retryHint:
      "Use Retry API after the dashboard API tunnel or ConsolePlugin proxy is restored.",
    modes: {
      "console-plugin-user-token-proxy": "ConsolePlugin UserToken proxy",
      "custom-api-base": "custom API base",
      "local-vite-proxy": "local Vite proxy",
      "server-render": "server render"
    }
  },
  ko: {
    title: "연결 판정",
    loadingDetail:
      "OpsLens가 답변 전에 컨텍스트 동기화와 계획 API 경로를 확인하고 있습니다.",
    readyDetail:
      "계획 API가 응답했습니다. 현재 답변은 설정된 OpsLens API 경로를 통해 생성된 것입니다.",
    fallbackDetail:
      "API 경로가 응답하지 않아, 실제 AI 연결처럼 보이게 꾸미지 않고 로컬 계획 전용 답변을 표시합니다.",
    routePrefix: "경로",
    boundary: "챗봇은 읽기 전용/계획 전용이며 클러스터를 변경하지 않습니다.",
    retryHint:
      "대시보드 API 터널이나 ConsolePlugin 프록시를 복구한 뒤 API 재시도를 누르십시오.",
    modes: {
      "console-plugin-user-token-proxy": "ConsolePlugin 사용자 토큰 프록시",
      "custom-api-base": "사용자 지정 API 경로",
      "local-vite-proxy": "로컬 Vite 프록시",
      "server-render": "서버 렌더링"
    }
  }
} as const;

const statusLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    loading: "loading",
    fallback: "fallback"
  },
  ko: {
    loading: "연결 확인 중",
    fallback: "로컬 대체 응답"
  }
};

const actionModeLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    readOnly: "read-only",
    planOnly: "plan-only"
  },
  ko: {
    readOnly: "읽기 전용",
    planOnly: "계획 전용"
  }
};

const confidenceLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    high: "high",
    medium: "medium",
    low: "low"
  },
  ko: {
    high: "높음",
    medium: "보통",
    low: "낮음"
  }
};

const trustLevelLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    official: "official",
    approved: "approved",
    "cluster-snapshot": "cluster snapshot",
    draft: "draft"
  },
  ko: {
    official: "공식",
    approved: "승인됨",
    "cluster-snapshot": "클러스터 스냅샷",
    draft: "초안"
  }
};

const evidenceTypeLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    alert: "alert",
    log: "log",
    event: "event",
    yaml: "YAML",
    runbook: "runbook",
    cluster: "cluster",
    "official-doc": "official doc",
    "internal-runbook": "internal runbook"
  },
  ko: {
    alert: "경고",
    log: "로그",
    event: "이벤트",
    yaml: "YAML",
    runbook: "실행 문서",
    cluster: "클러스터",
    "official-doc": "공식 문서",
    "internal-runbook": "내부 실행 문서"
  }
};

const contextChipLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    Cluster: "Cluster",
    Namespace: "Namespace",
    Page: "Page",
    Filters: "Filters",
    Attached: "Attached",
    RBAC: "RBAC"
  },
  ko: {
    Cluster: "클러스터",
    Namespace: "네임스페이스",
    Page: "화면",
    Filters: "필터",
    Attached: "첨부",
    RBAC: "RBAC"
  }
};

const contextChipValueLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    "prod-ocp": "CRC preview",
    Alerts: "Alerts",
    "source=platform, state=firing": "source=platform, state=firing",
    "3 evidence items": "3 evidence items"
  },
  ko: {
    "prod-ocp": "CRC 미리보기",
    Alerts: "경고",
    "source=platform, state=firing": "source=platform, state=발생 중",
    "3 evidence items": "근거 3건"
  }
};

const answerTextLabels: Record<UiLanguage, Record<string, string>> = {
  en: {},
  ko: {
    "ClusterVersion is reporting an upgrade block. The current evidence supports a guarded triage path, not a final root-cause claim.":
      "ClusterVersion이 업그레이드 차단 상태를 보고했습니다. 현재 근거로는 단정적인 원인 확정이 아니라, 보호 장치가 있는 분류 절차를 진행해야 합니다.",
    "Firing alert row: ClusterNotUpgradeable":
      "발생 중인 경고 행: ClusterNotUpgradeable",
    "ClusterVersion/version condition summary":
      "ClusterVersion/version 조건 요약",
    "OpenShift update troubleshooting docs":
      "OpenShift 업데이트 문제 해결 문서",
    "Platform upgrade runbook": "플랫폼 업그레이드 실행 문서",
    "Operator condition is blocking version progression":
      "Operator 조건이 버전 진행을 차단하고 있음",
    "The selected alert is tied to ClusterVersion and the visible dashboard shows active platform alerts.":
      "선택한 경고는 ClusterVersion과 연결되어 있고, 현재 대시보드에도 활성 플랫폼 경고가 표시됩니다.",
    "Recent GitOps sync changed upgrade-related configuration":
      "최근 GitOps 동기화가 업그레이드 관련 설정을 변경했을 가능성",
    "A correlated sync exists, but the exact diff has not been attached yet.":
      "연관된 동기화 기록은 있지만, 정확한 변경 diff는 아직 첨부되지 않았습니다.",
    "Collect ClusterVersion conditions and degraded operator list.":
      "ClusterVersion 조건과 성능 저하 Operator 목록을 수집합니다.",
    "Compare alert start time with recent GitOps sync and rollout history.":
      "경고 시작 시각을 최근 GitOps 동기화 및 rollout 이력과 비교합니다.",
    "Draft a rollback plan only after the blocking operator and changed object are confirmed.":
      "차단 중인 Operator와 변경된 객체가 확인된 뒤에만 롤백 계획을 작성합니다.",
    "Forcing upgrade progression can hide an operator-level failure.":
      "업그레이드를 강제로 진행하면 Operator 수준 장애가 가려질 수 있습니다.",
    "Rollback is environment-specific and must be checked against internal upgrade policy.":
      "롤백은 환경별로 달라지므로 내부 업그레이드 정책과 대조해야 합니다.",
    "The GitOps diff is not attached, so change correlation remains unproven.":
      "GitOps diff가 첨부되지 않아 변경과 장애의 상관관계는 아직 입증되지 않았습니다.",
    "Pause further upgrade actions.": "추가 업그레이드 작업을 일시 중지합니다.",
    "Revert only the confirmed GitOps change through the normal review path.":
      "확인된 GitOps 변경만 정상 리뷰 경로로 되돌립니다.",
    "Re-check ClusterVersion and clusteroperators before resuming.":
      "재개 전에 ClusterVersion과 clusteroperators를 다시 확인합니다.",
    "Exact ClusterVersion condition message":
      "정확한 ClusterVersion 조건 메시지",
    "Recent GitOps diff": "최근 GitOps diff",
    "ClusterOperator degraded condition details":
      "ClusterOperator 성능 저하 조건 상세"
  }
};

const answerPhraseLabels: Record<UiLanguage, Array<[string, string]>> = {
  en: [],
  ko: [
    ["previous pod logs", "이전 Pod 로그"],
    ["previous logs read when available", "사용 가능한 경우 이전 로그 읽음"],
    ["pod logs", "Pod 로그"],
    ["no pod candidate was available", "사용 가능한 Pod 후보가 없음"],
    ["pod candidates listed with", "Pod 후보 조회"],
    ["no label selector", "라벨 셀렉터 없음"],
    ["labelSelector=", "라벨 셀렉터="],
    ["logs read for last", "로그 읽음: 최근"],
    ["events listed for", "이벤트 조회 대상"],
    ["metric queries", "메트릭 쿼리"],
    ["prometheus query", "Prometheus 쿼리"],
    ["readiness probe", "readiness 점검"],
    ["ImagePullBackOff", "ImagePullBackOff"],
    ["CreateContainerConfigError", "CreateContainerConfigError"],
    ["CrashLoopBackOff", "CrashLoopBackOff"],
    ["Forbidden", "권한 거부"],
    ["Unauthorized", "인증 실패"],
    ["not found", "찾을 수 없음"],
    ["connection refused", "연결 거부"],
    ["timed out", "시간 초과"],
    ["missing evidence", "부족한 근거"],
    ["read-only", "읽기 전용"],
    ["plan-only", "계획 전용"],
    ["minutes", "분"]
  ]
};

function localizedLabel(
  labels: Record<UiLanguage, Record<string, string>>,
  language: UiLanguage,
  value: string
) {
  return labels[language][value] ?? value;
}

function localizedText(language: UiLanguage, value: string) {
  const exact = answerTextLabels[language][value];
  if (exact) return exact;

  return answerPhraseLabels[language].reduce(
    (text, [source, replacement]) => text.split(source).join(replacement),
    value
  );
}

function routeModeLabel(language: UiLanguage, mode: string) {
  const modeLabels = connectionCopy[language].modes as Record<string, string>;
  return modeLabels[mode] ?? mode;
}

function apiErrorInterpretation(language: UiLanguage, error: string | null) {
  if (!error) return null;

  const normalized = error.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("could not connect") ||
    normalized.includes("connection refused") ||
    normalized.includes("econnrefused") ||
    normalized.includes("networkerror")
  ) {
    return language === "ko"
      ? "OpsLens API 경로가 열려 있지 않거나 포트 포워딩/ConsolePlugin 프록시가 끊겼습니다."
      : "The OpsLens API route is not reachable, or the port-forward/ConsolePlugin proxy is disconnected.";
  }

  if (normalized.includes("failed with 404")) {
    return language === "ko"
      ? "요청 경로는 열렸지만 OpsLens API가 해당 엔드포인트를 제공하지 않습니다."
      : "The route answered, but the OpsLens API does not expose that endpoint.";
  }

  if (normalized.includes("failed with 401") || normalized.includes("failed with 403")) {
    return language === "ko"
      ? "API는 응답했지만 인증 토큰 또는 RBAC 권한이 부족합니다."
      : "The API answered, but the token or RBAC permissions are insufficient.";
  }

  if (/failed with 5\d\d/.test(normalized)) {
    return language === "ko"
      ? "API 서비스가 응답했지만 내부 오류를 반환했습니다. API Pod 로그와 readiness를 확인해야 합니다."
      : "The API service answered with a server error. Check the API pod logs and readiness.";
  }

  return language === "ko"
    ? "원문 오류를 유지합니다. 연결 경로, API Pod 상태, 프록시 설정을 순서대로 확인해야 합니다."
    : "The raw error is preserved. Check route reachability, API pod status, and proxy configuration in order.";
}

function clampAssistantPosition(x: number, y: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - 500)),
    y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - 640))
  };
}

function assistantPlacementPresets() {
  if (typeof window === "undefined") {
    return [
      { x: 24, y: 84 },
      { x: 760, y: 84 },
      { x: 760, y: 300 },
      { x: 24, y: 300 }
    ];
  }

  return [
    clampAssistantPosition(24, 84),
    clampAssistantPosition(window.innerWidth - 504, 84),
    clampAssistantPosition(window.innerWidth - 504, window.innerHeight - 724),
    clampAssistantPosition(24, window.innerHeight - 724)
  ];
}

function nextAssistantPosition(current: { x: number; y: number }) {
  const presets = assistantPlacementPresets();
  const nearestIndex = presets.reduce(
    (nearest, preset, index) => {
      const distance =
        Math.abs(preset.x - current.x) + Math.abs(preset.y - current.y);
      return distance < nearest.distance ? { index, distance } : nearest;
    },
    { index: 0, distance: Number.POSITIVE_INFINITY }
  ).index;

  return presets[(nearestIndex + 1) % presets.length];
}

export function AssistantPopover({
  draft,
  contextChips,
  answer,
  requestId,
  audit,
  apiStatus,
  busy,
  model,
  language,
  apiRouteMode,
  actionPlanPath,
  lastApiError,
  onDraftChange,
  onAsk,
  onRetryConnection,
  onClose
}: AssistantPopoverProps) {
  const copy = assistantCopy[language];
  const [isPinned, setIsPinned] = useState(true);
  const [floatingPosition, setFloatingPosition] = useState(() =>
    clampAssistantPosition(
      typeof window === "undefined" ? 24 : window.innerWidth - 504,
      typeof window === "undefined" ? 84 : window.innerHeight - 724
    )
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const stopDragListenersRef = useRef<(() => void) | null>(null);
  const connection = connectionCopy[language];
  const statusLabel =
    apiStatus === "ready"
      ? copy.readyStatus
      : localizedLabel(statusLabels, language, apiStatus);
  const connectionDetail =
    apiStatus === "ready"
      ? connection.readyDetail
      : apiStatus === "loading"
        ? connection.loadingDetail
        : connection.fallbackDetail;
  const connectionItems = [
    `${connection.routePrefix}: ${routeModeLabel(language, apiRouteMode)}`,
    connection.boundary,
    ...(apiStatus === "fallback" ? [connection.retryHint] : [])
  ];
  const answerSource =
    apiStatus === "ready" ? copy.sourceLive : copy.sourceFallback;
  const tokenPath =
    apiRouteMode === "console-plugin-user-token-proxy"
      ? copy.tokenConsole
      : copy.tokenLocal;
  const connectionSmoke = [
    {
      id: "context-sync",
      label: copy.smokeContextSync,
      value: audit?.contextHash
        ? copy.smokeReady
        : apiStatus === "loading"
          ? copy.smokeChecking
          : copy.smokeFallback
    },
    {
      id: "action-plan",
      label: copy.smokeActionPlan,
      value:
        apiStatus === "ready"
          ? copy.smokeReady
          : apiStatus === "loading"
            ? copy.smokeChecking
            : copy.smokeFallback
    },
    {
      id: "mutation-boundary",
      label: copy.smokeMutationBoundary,
      value: copy.smokeBlocked
    }
  ];

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!busy && draft.trim().length > 0) {
      onAsk();
    }
  }

  function togglePlacementMode() {
    if (isPinned) {
      setFloatingPosition((current) => clampAssistantPosition(current.x, current.y));
      setIsPinned(false);
      return;
    }

    dragRef.current = null;
    stopDragListenersRef.current?.();
    stopDragListenersRef.current = null;
    setIsPinned(true);
  }

  function moveFloatingAssistant() {
    setFloatingPosition((current) => nextAssistantPosition(current));
  }

  function handleDragStart(event: PointerEvent<HTMLDivElement>) {
    if (isPinned || event.button > 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingPosition.x,
      originY: floatingPosition.y
    };

    stopDragListenersRef.current?.();
    const handleDocumentMove = (moveEvent: globalThis.PointerEvent) => {
      moveAssistant(moveEvent.pointerId, moveEvent.clientX, moveEvent.clientY);
    };
    const handleDocumentEnd = (endEvent: globalThis.PointerEvent) => {
      endAssistantDrag(endEvent.pointerId);
    };
    window.addEventListener("pointermove", handleDocumentMove);
    window.addEventListener("pointerup", handleDocumentEnd, { once: true });
    window.addEventListener("pointercancel", handleDocumentEnd, { once: true });
    stopDragListenersRef.current = () => {
      window.removeEventListener("pointermove", handleDocumentMove);
      window.removeEventListener("pointerup", handleDocumentEnd);
      window.removeEventListener("pointercancel", handleDocumentEnd);
    };
  }

  function handleMouseDragStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (isPinned || event.button > 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    event.preventDefault();
    dragRef.current = {
      pointerId: -1,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingPosition.x,
      originY: floatingPosition.y
    };

    stopDragListenersRef.current?.();
    const handleDocumentMove = (moveEvent: globalThis.MouseEvent) => {
      moveAssistant(-1, moveEvent.clientX, moveEvent.clientY);
    };
    const handleDocumentEnd = () => {
      endAssistantDrag(-1);
    };
    window.addEventListener("mousemove", handleDocumentMove);
    window.addEventListener("mouseup", handleDocumentEnd, { once: true });
    stopDragListenersRef.current = () => {
      window.removeEventListener("mousemove", handleDocumentMove);
      window.removeEventListener("mouseup", handleDocumentEnd);
    };
  }

  function moveAssistant(pointerId: number, clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) {
      return;
    }

    setFloatingPosition(
      clampAssistantPosition(
        drag.originX + clientX - drag.startX,
        drag.originY + clientY - drag.startY
      )
    );
  }

  function handleDragMove(event: PointerEvent<HTMLDivElement>) {
    moveAssistant(event.pointerId, event.clientX, event.clientY);
  }

  function endAssistantDrag(pointerId: number) {
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
      stopDragListenersRef.current?.();
      stopDragListenersRef.current = null;
    }
  }

  function handleDragEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endAssistantDrag(event.pointerId);
    }
  }

  useEffect(() => {
    return () => {
      stopDragListenersRef.current?.();
    };
  }, []);

  const popoverStyle = isPinned
    ? undefined
    : ({
        left: floatingPosition.x,
        top: floatingPosition.y,
        right: "auto",
        bottom: "auto"
      } satisfies CSSProperties);

  return (
    <aside
      aria-label={copy.ariaLabel}
      className={`assistant-popover ${isPinned ? "pinned" : "floating"}`}
      data-testid="assistant-popover"
      id="kugnus-assistant-popover"
      role="dialog"
      aria-modal="false"
      style={popoverStyle}
    >
      <div
        className="assistant-header"
        data-testid="assistant-drag-handle"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onMouseDown={handleMouseDragStart}
      >
        <div className="assistant-title">
          <span className="assistant-icon">
            <img
              className="assistant-app-icon"
              src={opsLensIcon}
              alt=""
              draggable={false}
            />
          </span>
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>OpsLens</h2>
          </div>
        </div>
        <div className="assistant-controls">
          <span
            className={`status-pill ${apiStatus === "ready" ? "ready" : "danger"}`}
            data-testid="assistant-connection-status"
          >
            {statusLabel}
          </span>
          <span
            className={`status-pill ${isPinned ? "read-only" : "ready"}`}
            data-testid="assistant-placement-status"
          >
            {isPinned ? copy.placementPinned : copy.placementFloating}
          </span>
          {!isPinned ? (
            <button
              className="icon-button"
              type="button"
              data-testid="assistant-placement-move"
              title={copy.move}
              aria-label={copy.move}
              onClick={moveFloatingAssistant}
            >
              <Move size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            className="icon-button"
            type="button"
            data-testid="assistant-placement-toggle"
            title={isPinned ? copy.unpin : copy.pin}
            aria-label={isPinned ? copy.unpin : copy.pin}
            aria-pressed={!isPinned}
            onClick={togglePlacementMode}
          >
            {isPinned ? (
              <PinOff size={16} aria-hidden="true" />
            ) : (
              <Pin size={16} aria-hidden="true" />
            )}
          </button>
          <button
            className="icon-button"
            type="button"
            data-testid="assistant-retry-api"
            title={copy.retry}
            aria-label={copy.retry}
            onClick={onRetryConnection}
            disabled={busy || apiStatus === "loading"}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            data-testid="assistant-close"
            title={copy.close}
            aria-label={copy.close}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="context-chip-list" data-testid="context-chips">
        {contextChips.map((chip) => (
          <span className="context-chip" key={`${chip.label}-${chip.value}`}>
            <strong>{localizedLabel(contextChipLabels, language, chip.label)}</strong>
            {localizedLabel(contextChipValueLabels, language, chip.value)}
          </span>
        ))}
      </div>

      <div className="prompt-box">
        <label htmlFor="kugnus-draft">{copy.prompt}</label>
        <div
          className="assistant-chat-hints"
          data-testid="assistant-execution-path"
          aria-label={copy.executionTitle}
        >
          <span data-testid="assistant-execution-enter">
            {copy.executionEnter}
          </span>
          <span data-testid="assistant-execution-fallback">
            {copy.executionFallback}
          </span>
          <span data-testid="assistant-execution-newline">
            {copy.executionNewline}
          </span>
        </div>
        <textarea
          id="kugnus-draft"
          data-testid="assistant-draft"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleDraftKeyDown}
        />
        <button
          className="text-icon-button"
          type="button"
          data-testid="assistant-ask-button"
          onClick={onAsk}
          disabled={busy || draft.trim().length === 0}
        >
          <SendHorizontal size={16} aria-hidden="true" />
          {busy ? copy.asking : copy.ask}
        </button>
      </div>

      <details className="assistant-diagnostics" data-testid="assistant-diagnostics">
        <summary>{copy.diagnostics}</summary>
        <div className="api-trace" data-testid="api-trace">
          <span>{copy.request}</span>
          <strong data-testid="assistant-request-id">{requestId}</strong>
          <span>{copy.model}</span>
          <strong>{model}</strong>
          <span>{copy.context}</span>
          <strong>{audit?.contextHash ?? copy.pending}</strong>
          <span>{copy.route}</span>
          <strong data-testid="assistant-api-route-mode">{apiRouteMode}</strong>
          <span>{copy.endpoint}</span>
          <strong data-testid="assistant-action-plan-path">{actionPlanPath}</strong>
          {lastApiError ? (
            <>
              <span>{copy.error}</span>
              <strong data-testid="assistant-last-api-error">{lastApiError}</strong>
              <span>{copy.errorInterpretation}</span>
              <strong data-testid="assistant-last-api-error-interpretation">
                {apiErrorInterpretation(language, lastApiError)}
              </strong>
            </>
          ) : null}
        </div>

        <div
          className={`assistant-connection-summary ${apiStatus}`}
          data-testid="assistant-connection-summary"
        >
          <strong>{connection.title}</strong>
          <p>{connectionDetail}</p>
          <ul>
            {connectionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div
            className="assistant-integration-contract"
            data-testid="assistant-integration-contract"
            aria-label={copy.integrationTitle}
          >
            <strong>{copy.integrationTitle}</strong>
            <span data-testid="assistant-integration-standalone">
              {copy.integrationStandalone}
            </span>
            <span data-testid="assistant-integration-console">
              {copy.integrationConsole}
            </span>
            <span data-testid="assistant-integration-lightspeed">
              {copy.integrationLightspeed}
            </span>
          </div>
          <dl className="assistant-mode-matrix" data-testid="assistant-mode-matrix">
            <div>
              <dt>{copy.answerSource}</dt>
              <dd data-testid="assistant-answer-source">{answerSource}</dd>
            </div>
            <div>
              <dt>{copy.tokenPath}</dt>
              <dd data-testid="assistant-token-path">{tokenPath}</dd>
            </div>
            <div>
              <dt>{copy.mutationBoundaryShort}</dt>
              <dd data-testid="assistant-mutation-boundary">
                {copy.mutationBoundaryValue}
              </dd>
            </div>
          </dl>
          <div
            className="assistant-connection-smoke"
            data-testid="assistant-connection-smoke"
            aria-label={copy.smokeTitle}
          >
            <strong>{copy.smokeTitle}</strong>
            <div>
              {connectionSmoke.map((item) => (
                <span
                  key={item.id}
                  data-testid={`assistant-smoke-${item.id}`}
                >
                  {item.label}: <b>{item.value}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="answer-stack">
        <section className="assistant-chat-turns" data-testid="assistant-chat-turns">
          <div className="chat-bubble user">
            <span>{copy.userBubble}</span>
            <p>{draft}</p>
          </div>
          <div className="chat-bubble assistant">
            <span>{copy.assistantBubble}</span>
            <p>{localizedText(language, answer.judgment)}</p>
            <strong>{copy.readOnlyHint}</strong>
          </div>
        </section>

        <section className="answer-block judgment" data-testid="answer-judgment">
          <div className="answer-heading">
            <CheckCircle2 size={17} aria-hidden="true" />
            <h3>{copy.currentJudgment}</h3>
          </div>
          <p>{localizedText(language, answer.judgment)}</p>
          <span className="status-pill read-only">
            {copy.actionMode}: {localizedLabel(actionModeLabels, language, answer.actionMode)}
          </span>
        </section>

        <details className="assistant-answer-details" data-testid="assistant-answer-details">
          <summary>{copy.answerDetails}</summary>

          <section className="answer-block" data-testid="answer-evidence">
            <div className="answer-heading">
              <FileSearch size={17} aria-hidden="true" />
              <h3>{copy.inspectedEvidence}</h3>
            </div>
            <ul className="evidence-list">
              {answer.inspectedEvidence.map((source) => (
                <li key={source.id}>
                  <span>{localizedLabel(evidenceTypeLabels, language, source.type)}</span>
                  <strong>{localizedText(language, source.label)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="answer-block" data-testid="answer-candidates">
            <div className="answer-heading">
              <Route size={17} aria-hidden="true" />
              <h3>{copy.causeCandidates}</h3>
            </div>
            {answer.candidates.map((candidate) => (
              <div className="candidate-row" key={candidate.label}>
                <span className={`confidence ${candidate.confidence}`}>
                  {localizedLabel(confidenceLabels, language, candidate.confidence)}
                </span>
                <div>
                  <strong>{localizedText(language, candidate.label)}</strong>
                  <p>{localizedText(language, candidate.reason)}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="answer-block" data-testid="answer-next-checks">
            <div className="answer-heading">
              <FileSearch size={17} aria-hidden="true" />
              <h3>{copy.nextChecks}</h3>
            </div>
            <ul className="command-list">
              {answer.nextChecks.map((command) => (
                <li key={command}>
                  <code>{command}</code>
                </li>
              ))}
            </ul>
          </section>

          <section className="answer-block" data-testid="answer-risks">
            <div className="answer-heading">
              <ShieldAlert size={17} aria-hidden="true" />
              <h3>{copy.risksAndMissingEvidence}</h3>
            </div>
            <div className="two-column-list">
              <div>
                <h4>{copy.risk}</h4>
                <ul>
                  {answer.risks.map((risk) => (
                    <li key={risk}>{localizedText(language, risk)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>{copy.missingEvidence}</h4>
                <ul>
                  {answer.missingEvidence.map((gap) => (
                    <li key={gap}>{localizedText(language, gap)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="answer-block" data-testid="answer-rollback">
            <div className="answer-heading">
              <Undo2 size={17} aria-hidden="true" />
              <h3>{copy.planAndRollback}</h3>
            </div>
            <ol className="plan-list">
              {answer.plan.map((step) => (
                <li key={step}>{localizedText(language, step)}</li>
              ))}
            </ol>
            <div className="rollback-strip">
              {answer.rollbackPath.map((step) => (
                <span key={step}>{localizedText(language, step)}</span>
              ))}
            </div>
          </section>

          <section className="answer-block" data-testid="answer-citations">
            <div className="answer-heading">
              <FileSearch size={17} aria-hidden="true" />
              <h3>{copy.citations}</h3>
            </div>
            <ul className="citation-list">
              {answer.citations.map((source) => (
                <li key={source.id}>
                  <strong>{localizedText(language, source.label)}</strong>
                  <span>{localizedLabel(trustLevelLabels, language, source.trustLevel)}</span>
                </li>
              ))}
            </ul>
          </section>
        </details>
      </div>
    </aside>
  );
}
