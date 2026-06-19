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
  PointerEvent,
  ReactNode,
  UIEvent
} from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileSearch,
  MessageCircle,
  Move,
  Pin,
  PinOff,
  RefreshCw,
  Route,
  ShieldAlert,
  Send,
  Square,
  Undo2,
  Wrench,
  X
} from "lucide-react";
import type { UiLanguage } from "../i18n";
import opsLensIcon from "../assets/brand/cywell_ops_lens_icon.png";

interface AssistantPopoverProps {
  draft: string;
  turns: Array<{
    id: string;
    prompt: string;
    answer: AssistantAnswer;
    pending?: boolean;
    streaming?: boolean;
  }>;
  contextChips: ContextChip[];
  answer: AssistantAnswer;
  requestId: string;
  audit: AuditEnvelope | null;
  apiStatus: "loading" | "ready" | "fallback";
  busy: boolean;
  model: string;
  mode: "ask" | "troubleshooting";
  language: UiLanguage;
  apiRouteMode: string;
  actionPlanPath: string;
  lastApiError: string | null;
  onModeChange: (mode: "ask" | "troubleshooting") => void;
  onDraftChange: (draft: string) => void;
  onAsk: (promptOverride?: string) => void;
  onStop: () => void;
  onRetryConnection: () => void;
  onClose: () => void;
}

const assistantCopy = {
  en: {
    ariaLabel: "KOMSCO AI Assistant",
    eyebrow: "KOMSCO AI Assistant",
    readyStatus: "OpenShift Lightspeed connected",
    close: "Close assistant",
    request: "request",
    model: "model",
    context: "context",
    route: "route",
    endpoint: "endpoint",
    error: "last error",
    errorInterpretation: "interpretation",
    answerSource: "answer source",
    sourceLive: "OpenShift Lightspeed /v1/streaming_query",
    sourceFallback: "Lightspeed connection required",
    tokenPath: "token path",
    tokenConsole: "OpenShift UserToken proxy",
    tokenLocal: "CRC validation tunnel",
    mutationBoundaryShort: "cluster changes",
    mutationBoundaryValue: "not executed",
    retry: "Retry Lightspeed",
    pin: "Pin assistant",
    unpin: "Unlock and move assistant",
    move: "Move assistant",
    placementPinned: "pinned",
    placementFloating: "movable",
    integrationTitle: "Integration contract",
    integrationStandalone:
      "Preview uses the same OpsLens question flow before the console route is attached.",
    integrationConsole:
      "Installed ConsolePlugin uses the UserToken proxy for OpsLens API.",
    integrationLightspeed:
      "OpsLens Assistant uses OpenShift Lightspeed /v1/streaming_query and adds console context.",
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
    smokeFallback: "Lightspeed required",
    smokeBlocked: "blocked",
    modeAsk: "Ask",
    modeAskDescription: "Expert guidance and clear answers",
    modeTroubleshooting: "Troubleshooting",
    modeTroubleshootingDescription: "Diagnosing issues and finding solutions",
    modeMenuLabel: "Choose Lightspeed mode",
    pending: "pending",
    actionMode: "action mode",
    prompt: "Ask KOMSCO AI Assistant",
    asking: "Asking",
    ask: "Ask",
    stop: "Stop answer",
    jumpToLatest: "Jump to latest answer",
    waitingForLightspeed: "OpenShift Lightspeed is answering...",
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
    rawEvidenceDetails: "References and raw checks",
    copyAnswer: "Copy this answer",
    answerCopied: "Answer copied",
    copyConversation: "Copy conversation",
    conversationCopied: "Conversation copied",
    userBubble: "You",
    assistantBubble: "KOMSCO",
    readOnlyHint: "Read-only guidance, no cluster mutation",
    contextSummary: "Context"
  },
  ko: {
    ariaLabel: "KOMSCO AI 어시스턴트",
    eyebrow: "KOMSCO AI 어시스턴트",
    readyStatus: "OpenShift Lightspeed 연결됨",
    close: "어시스턴트 닫기",
    request: "요청",
    model: "모델",
    context: "컨텍스트",
    route: "경로",
    endpoint: "엔드포인트",
    error: "마지막 오류",
    errorInterpretation: "오류 해석",
    answerSource: "답변 출처",
    sourceLive: "OpenShift Lightspeed /v1/streaming_query",
    sourceFallback: "Lightspeed 연결 필요",
    tokenPath: "토큰 경로",
    tokenConsole: "OpenShift 사용자 토큰 프록시",
    tokenLocal: "CRC 검증 터널",
    mutationBoundaryShort: "클러스터 변경",
    mutationBoundaryValue: "실행 안 함",
    retry: "Lightspeed 재시도",
    pin: "어시스턴트 고정",
    unpin: "고정 해제 후 이동",
    move: "어시스턴트 이동",
    placementPinned: "고정",
    placementFloating: "이동 가능",
    integrationTitle: "연동 계약",
    integrationStandalone:
      "미리보기 화면도 콘솔 라우트 연결 전 동일한 OpsLens 질문 흐름을 사용",
    integrationConsole:
      "설치된 ConsolePlugin은 사용자 토큰 프록시로 OpsLens API 사용",
    integrationLightspeed:
      "OpsLens 어시스턴트는 OpenShift Lightspeed /v1/streaming_query에 콘솔 context를 더해 사용",
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
    smokeFallback: "Lightspeed 필요",
    smokeBlocked: "차단",
    modeAsk: "Ask",
    modeAskDescription: "명확한 설명과 운영 가이드",
    modeTroubleshooting: "Troubleshooting",
    modeTroubleshootingDescription: "장애 진단과 해결 방향 탐색",
    modeMenuLabel: "Lightspeed 모드 선택",
    pending: "대기 중",
    actionMode: "동작 모드",
    prompt: "KOMSCO AI 어시스턴트에 질문",
    asking: "질문 중",
    ask: "질문",
    stop: "답변 중지",
    jumpToLatest: "최신 답변으로 이동",
    waitingForLightspeed: "OpenShift Lightspeed가 답변 중입니다...",
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
    rawEvidenceDetails: "참조와 상태 체크 원문",
    copyAnswer: "이 답변 복사",
    answerCopied: "답변 복사됨",
    copyConversation: "전체 대화 복사",
    conversationCopied: "전체 대화 복사됨",
    userBubble: "질문",
    assistantBubble: "KOMSCO",
    readOnlyHint: "읽기 전용 가이드, 클러스터 변경 없음",
    contextSummary: "컨텍스트"
  }
} as const;

const connectionCopy = {
  en: {
    title: "Connection decision",
    loadingDetail:
      "OpsLens is checking the OpenShift Lightspeed route before answering.",
    readyDetail:
      "OpenShift Lightspeed answered through /v1/streaming_query with OpsLens console context attached.",
    fallbackDetail:
      "OpenShift Lightspeed did not answer. OpsLens is not showing a fabricated AI response.",
    routePrefix: "Route",
    boundary: "Chat remains read-only; it does not mutate the cluster.",
    retryHint:
      "Restore the Lightspeed route, bearer token, or local tunnel, then retry.",
    modes: {
      "console-plugin-user-token-proxy": "ConsolePlugin UserToken proxy",
      "custom-api-base": "custom API base",
      "local-vite-proxy": "OpsLens preview route",
      "server-render": "server render"
    }
  },
  ko: {
    title: "연결 판정",
    loadingDetail:
      "OpsLens가 답변 전에 OpenShift Lightspeed 경로를 확인하고 있습니다.",
    readyDetail:
      "OpenShift Lightspeed가 /v1/streaming_query로 응답했고 OpsLens 콘솔 context가 함께 전달되었습니다.",
    fallbackDetail:
      "OpenShift Lightspeed가 응답하지 않았습니다. OpsLens는 가짜 AI 답변을 표시하지 않습니다.",
    routePrefix: "경로",
    boundary: "챗봇은 읽기 전용이며 클러스터를 변경하지 않습니다.",
    retryHint:
      "Lightspeed 경로, 토큰, 로컬 터널을 복구한 뒤 재시도하십시오.",
    modes: {
      "console-plugin-user-token-proxy": "ConsolePlugin 사용자 토큰 프록시",
      "custom-api-base": "사용자 지정 API 경로",
      "local-vite-proxy": "OpsLens 미리보기 경로",
      "server-render": "서버 렌더링"
    }
  }
} as const;

const promptExamples: Record<
  UiLanguage,
  Record<"ask" | "troubleshooting", string[]>
> = {
  en: {
    ask: [
      "Summarize the current cluster health from the visible console context.",
      "Explain what this Operator condition means and what I should check next.",
      "What evidence should I collect before approving this change?",
      "Compare this namespace state with the normal OpenShift console flow.",
      "Show me the safest read-only next step for this resource."
    ],
    troubleshooting: [
      "Triage the ClusterNotUpgradeable alert from the current evidence.",
      "Find likely causes for this Pod not becoming ready.",
      "Diagnose why this route or service is not reachable.",
      "Explain the latest warning events and next checks.",
      "Build a read-only incident checklist for the selected resource."
    ]
  },
  ko: {
    ask: [
      "현재 콘솔 화면 기준으로 클러스터 상태를 요약해줘.",
      "이 Operator 상태가 무슨 의미인지 다음 확인 항목까지 설명해줘.",
      "이 변경을 승인하기 전에 어떤 근거를 모아야 해?",
      "이 네임스페이스 상태를 기본 OpenShift 콘솔 흐름과 비교해줘.",
      "선택한 리소스에서 가장 안전한 읽기 전용 다음 조치를 알려줘."
    ],
    troubleshooting: [
      "ClusterNotUpgradeable alert를 현재 근거 중심으로 triage 해줘.",
      "이 Pod가 Ready가 되지 않는 원인 후보를 찾아줘.",
      "이 Route나 Service가 연결되지 않는 이유를 진단해줘.",
      "최근 Warning 이벤트를 해석하고 다음 확인 항목을 정리해줘.",
      "선택한 리소스 기준 읽기 전용 장애 대응 체크리스트를 만들어줘."
    ]
  }
};

const statusLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    loading: "loading",
    fallback: "Lightspeed required"
  },
  ko: {
    loading: "연결 확인 중",
    fallback: "Lightspeed 필요"
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

const assistantPanelWidth = 500;
const assistantPanelMaxHeight = 760;
const assistantPanelMinWidth = 360;
const assistantPanelMinHeight = 520;
const assistantPanelEdgeGap = 12;
const assistantPanelBottomGap = 24;
const assistantPanelVerticalChrome = 108;
const assistantResizeDirections = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

type AssistantPanelSize = {
  width: number;
  height: number;
};

type AssistantResizeDirection = (typeof assistantResizeDirections)[number];

function assistantViewportHeight() {
  if (typeof window === "undefined") {
    return assistantPanelMaxHeight;
  }

  return Math.min(
    assistantPanelMaxHeight,
    Math.max(320, window.innerHeight - assistantPanelVerticalChrome)
  );
}

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
      "ClusterOperator 성능 저하 조건 상세",
    "OpenShift Lightspeed is not connected for this request, so OpsLens did not generate an AI answer. Restore the Lightspeed route, bearer token, or tunnel, then retry.":
      "이번 요청에서 OpenShift Lightspeed 응답을 받지 못해 AI 답변을 생성하지 않았습니다. Lightspeed 경로, 권한, 터널 상태를 복구한 뒤 다시 질문하십시오."
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

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+?\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const key = `${keyPrefix}-inline-${index}`;
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
}

function renderMarkdownBlocks(
  language: UiLanguage,
  value: string,
  keyPrefix: string,
  className = "assistant-markdown"
) {
  const lines = localizedText(language, value)
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listKind: "ul" | "ol" = "ul";

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      blocks.push(
        <p key={`${keyPrefix}-p-${blocks.length}`}>
          {renderInlineMarkdown(text, `${keyPrefix}-p-${blocks.length}`)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const ListTag = listKind;
    blocks.push(
      <ListTag key={`${keyPrefix}-list-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={`${keyPrefix}-li-${blocks.length}-${index}`}>
            {renderInlineMarkdown(item, `${keyPrefix}-li-${blocks.length}-${index}`)}
          </li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <h4 key={`${keyPrefix}-h-${blocks.length}`}>
          {renderInlineMarkdown(heading[2], `${keyPrefix}-h-${blocks.length}`)}
        </h4>
      );
      return;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextKind = ordered ? "ol" : "ul";
      if (listItems.length > 0 && listKind !== nextKind) {
        flushList();
      }
      listKind = nextKind;
      listItems.push((unordered?.[1] ?? ordered?.[1] ?? line).trim());
      return;
    }

    flushList();
    paragraph.push(line);
  });

  flushParagraph();
  flushList();

  return <div className={className}>{blocks}</div>;
}

function splitAssistantJudgment(value: string) {
  const normalized = value.trim();
  const parts = normalized.split(/\n\s*---+\s*\n/);

  if (parts.length < 2) {
    return { primary: normalized, rawDetail: null as string | null };
  }

  const primary = parts[0].trim();
  const rawDetail = parts.slice(1).join("\n---\n").trim();

  return {
    primary: primary || normalized,
    rawDetail: rawDetail.length > 0 ? rawDetail : null
  };
}

function plainAssistantAnswer(language: UiLanguage, answer: AssistantAnswer) {
  const judgment = splitAssistantJudgment(answer.judgment).primary;
  const blocks = [
    localizedText(language, judgment),
    answer.candidates.length
      ? [
          language === "ko" ? "원인 후보" : "Cause candidates",
          ...answer.candidates.map(
            (candidate) =>
              `- ${localizedText(language, candidate.label)}: ${localizedText(
                language,
                candidate.reason
              )}`
          )
        ].join("\n")
      : "",
    answer.nextChecks.length
      ? [
          language === "ko" ? "다음 확인" : "Next checks",
          ...answer.nextChecks.map((command) => `- ${command}`)
        ].join("\n")
      : "",
    answer.risks.length
      ? [
          language === "ko" ? "리스크" : "Risks",
          ...answer.risks.map((risk) => `- ${localizedText(language, risk)}`)
        ].join("\n")
      : "",
    answer.missingEvidence.length
      ? [
          language === "ko" ? "부족한 근거" : "Missing evidence",
          ...answer.missingEvidence.map((gap) => `- ${localizedText(language, gap)}`)
        ].join("\n")
      : "",
    `${language === "ko" ? "동작 모드" : "Action mode"}: ${answer.actionMode}`
  ];

  return blocks.filter((block) => block.trim().length > 0).join("\n\n");
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
      ? "OpenShift Lightspeed 또는 OpsLens 프록시 경로가 열려 있지 않습니다."
      : "The OpenShift Lightspeed or OpsLens proxy route is not reachable.";
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

function clampAssistantSize(width: number, height: number): AssistantPanelSize {
  if (typeof window === "undefined") {
    return {
      width: Math.max(assistantPanelMinWidth, width),
      height: Math.max(assistantPanelMinHeight, height)
    };
  }

  const maxWidth = Math.max(
    assistantPanelMinWidth,
    window.innerWidth - assistantPanelEdgeGap * 2
  );
  const maxHeight = Math.max(
    assistantPanelMinHeight,
    window.innerHeight - assistantPanelEdgeGap - assistantPanelBottomGap
  );

  return {
    width: Math.min(Math.max(assistantPanelMinWidth, width), maxWidth),
    height: Math.min(Math.max(assistantPanelMinHeight, height), maxHeight)
  };
}

function clampAssistantPosition(
  x: number,
  y: number,
  width = assistantPanelWidth,
  height = assistantViewportHeight()
) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.min(
      Math.max(assistantPanelEdgeGap, x),
      Math.max(assistantPanelEdgeGap, window.innerWidth - width - assistantPanelEdgeGap)
    ),
    y: Math.min(
      Math.max(assistantPanelEdgeGap, y),
      Math.max(
        assistantPanelEdgeGap,
        window.innerHeight - height - assistantPanelBottomGap
      )
    )
  };
}

function assistantPlacementPresets(size: AssistantPanelSize) {
  if (typeof window === "undefined") {
    return [
      { x: 24, y: 84 },
      { x: 760, y: 84 },
      { x: 760, y: 300 },
      { x: 24, y: 300 }
    ];
  }

  const clampedSize = clampAssistantSize(size.width, size.height);

  return [
    clampAssistantPosition(24, 84, clampedSize.width, clampedSize.height),
    clampAssistantPosition(
      window.innerWidth - clampedSize.width - 24,
      84,
      clampedSize.width,
      clampedSize.height
    ),
    clampAssistantPosition(
      24,
      window.innerHeight - clampedSize.height - assistantPanelBottomGap,
      clampedSize.width,
      clampedSize.height
    ),
    clampAssistantPosition(
      window.innerWidth - clampedSize.width - 24,
      window.innerHeight - clampedSize.height - assistantPanelBottomGap,
      clampedSize.width,
      clampedSize.height
    )
  ];
}

function nextAssistantPosition(current: { x: number; y: number }, size: AssistantPanelSize) {
  const presets = assistantPlacementPresets(size);
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
  turns,
  contextChips,
  answer,
  requestId,
  audit,
  apiStatus,
  busy,
  model,
  mode,
  language,
  apiRouteMode,
  actionPlanPath,
  lastApiError,
  onModeChange,
  onDraftChange,
  onAsk,
  onStop,
  onRetryConnection,
  onClose
}: AssistantPopoverProps) {
  const copy = assistantCopy[language];
  const [isPinned, setIsPinned] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isDraftFocused, setIsDraftFocused] = useState(false);
  const [answerDetailsOpen, setAnswerDetailsOpen] = useState(false);
  const [autoScrollLocked, setAutoScrollLocked] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [promptExampleIndex, setPromptExampleIndex] = useState(0);
  const [copiedAnswerId, setCopiedAnswerId] = useState<string | null>(null);
  const [conversationCopied, setConversationCopied] = useState(false);
  const [floatingSize, setFloatingSize] = useState(() =>
    clampAssistantSize(assistantPanelWidth, assistantViewportHeight())
  );
  const [floatingPosition, setFloatingPosition] = useState(() =>
    clampAssistantPosition(
      typeof window === "undefined" ? 24 : window.innerWidth - 504,
      typeof window === "undefined"
        ? 84
        : window.innerHeight - assistantViewportHeight() - assistantPanelBottomGap,
      assistantPanelWidth,
      assistantViewportHeight()
    )
  );
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const answerStackRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const previousTurnCountRef = useRef(turns.length);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    direction: AssistantResizeDirection;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);
  const stopDragListenersRef = useRef<(() => void) | null>(null);
  const stopResizeListenersRef = useRef<(() => void) | null>(null);
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
    apiStatus === "ready"
      ? copy.sourceLive
      : apiStatus === "loading"
        ? copy.pending
        : copy.sourceFallback;
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
  const activeModeLabel =
    mode === "ask" ? copy.modeAsk : copy.modeTroubleshooting;
  const ActiveModeIcon = mode === "ask" ? MessageCircle : Wrench;
  const activePromptExamples = promptExamples[language][mode];
  const promptPlaceholder =
    activePromptExamples[promptExampleIndex % activePromptExamples.length] ?? copy.prompt;
  const renderedTurns =
    turns.length > 0
      ? turns
      : [
          {
            id: "current",
            prompt: draft,
            answer
          }
        ];
  const isResponding =
    busy || renderedTurns.some((turn) => turn.pending || turn.streaming);
  const showPromptSuggestion =
    draft.trim().length === 0 && !isDraftFocused && !isResponding;

  function selectMode(nextMode: "ask" | "troubleshooting") {
    onModeChange(nextMode);
    setModeMenuOpen(false);
    requestAnimationFrame(() => draftRef.current?.focus());
  }

  function focusDraftFromComposer(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button") || target.closest("textarea")) return;
    draftRef.current?.focus();
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!isResponding && draft.trim().length > 0) {
      onAsk();
    }
  }

  function submitAssistantPrompt() {
    const prompt = draft.trim() || promptPlaceholder;
    if (!isResponding && prompt.trim().length > 0) {
      onAsk(prompt);
    }
  }

  async function copyText(value: string, onCopied: () => void) {
    const text = value.trim();
    if (!text) return;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      onCopied();
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    onCopied();
  }

  function turnCopyText(turn: (typeof renderedTurns)[number]) {
    return [
      `${copy.userBubble}: ${turn.prompt || "-"}`,
      `${copy.assistantBubble}:\n${plainAssistantAnswer(language, turn.answer)}`
    ].join("\n\n");
  }

  function copyTurn(turn: (typeof renderedTurns)[number]) {
    void copyText(turnCopyText(turn), () => {
      setCopiedAnswerId(turn.id);
      window.setTimeout(() => setCopiedAnswerId(null), 1800);
    });
  }

  function copyConversation() {
    const conversation = renderedTurns
      .map((turn, index) => `#${index + 1}\n${turnCopyText(turn)}`)
      .join("\n\n---\n\n");
    void copyText(conversation, () => {
      setConversationCopied(true);
      window.setTimeout(() => setConversationCopied(false), 1800);
    });
  }

  function isAnswerStackAtBottom(element: HTMLDivElement) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 56;
  }

  function scrollAnswerStackToBottom(behavior: ScrollBehavior = "smooth") {
    const viewport = answerStackRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior
    });
  }

  function handleAnswerStackScroll(event: UIEvent<HTMLDivElement>) {
    const atBottom = isAnswerStackAtBottom(event.currentTarget);
    setAutoScrollLocked(!atBottom);
    setShowJumpToBottom(!atBottom);
  }

  function jumpToLatestAnswer() {
    setAutoScrollLocked(false);
    setShowJumpToBottom(false);
    scrollAnswerStackToBottom("smooth");
  }

  function togglePlacementMode() {
    if (isPinned) {
      const nextSize = clampAssistantSize(floatingSize.width, floatingSize.height);
      setFloatingSize(nextSize);
      setFloatingPosition((current) =>
        clampAssistantPosition(current.x, current.y, nextSize.width, nextSize.height)
      );
      setIsPinned(false);
      return;
    }

    dragRef.current = null;
    stopDragListenersRef.current?.();
    stopDragListenersRef.current = null;
    resizeRef.current = null;
    stopResizeListenersRef.current?.();
    stopResizeListenersRef.current = null;
    setIsPinned(true);
  }

  function moveFloatingAssistant() {
    setFloatingPosition((current) => nextAssistantPosition(current, floatingSize));
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
        drag.originY + clientY - drag.startY,
        floatingSize.width,
        floatingSize.height
      )
    );
  }

  function handleResizeStart(
    direction: AssistantResizeDirection,
    event: PointerEvent<HTMLSpanElement>
  ) {
    if (isPinned || event.button > 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingPosition.x,
      originY: floatingPosition.y,
      originWidth: floatingSize.width,
      originHeight: floatingSize.height
    };

    dragRef.current = null;
    stopDragListenersRef.current?.();
    stopDragListenersRef.current = null;
    stopResizeListenersRef.current?.();
    const handleDocumentMove = (moveEvent: globalThis.PointerEvent) => {
      resizeAssistant(moveEvent.pointerId, moveEvent.clientX, moveEvent.clientY);
    };
    const handleDocumentEnd = (endEvent: globalThis.PointerEvent) => {
      endAssistantResize(endEvent.pointerId);
    };
    window.addEventListener("pointermove", handleDocumentMove);
    window.addEventListener("pointerup", handleDocumentEnd, { once: true });
    window.addEventListener("pointercancel", handleDocumentEnd, { once: true });
    stopResizeListenersRef.current = () => {
      window.removeEventListener("pointermove", handleDocumentMove);
      window.removeEventListener("pointerup", handleDocumentEnd);
      window.removeEventListener("pointercancel", handleDocumentEnd);
    };
  }

  function resizeAssistant(pointerId: number, clientX: number, clientY: number) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== pointerId) {
      return;
    }

    const dx = clientX - resize.startX;
    const dy = clientY - resize.startY;
    let width = resize.originWidth;
    let height = resize.originHeight;

    if (resize.direction.includes("e")) {
      width = resize.originWidth + dx;
    }
    if (resize.direction.includes("w")) {
      width = resize.originWidth - dx;
    }
    if (resize.direction.includes("s")) {
      height = resize.originHeight + dy;
    }
    if (resize.direction.includes("n")) {
      height = resize.originHeight - dy;
    }

    const nextSize = clampAssistantSize(width, height);
    const nextX = resize.direction.includes("w")
      ? resize.originX + resize.originWidth - nextSize.width
      : resize.originX;
    const nextY = resize.direction.includes("n")
      ? resize.originY + resize.originHeight - nextSize.height
      : resize.originY;

    setFloatingSize(nextSize);
    setFloatingPosition(
      clampAssistantPosition(nextX, nextY, nextSize.width, nextSize.height)
    );
  }

  function endAssistantResize(pointerId: number) {
    if (resizeRef.current?.pointerId === pointerId) {
      resizeRef.current = null;
      stopResizeListenersRef.current?.();
      stopResizeListenersRef.current = null;
    }
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
      stopResizeListenersRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleViewportResize = () => {
      setFloatingSize((current) => {
        const nextSize = clampAssistantSize(current.width, current.height);
        setFloatingPosition((position) =>
          clampAssistantPosition(position.x, position.y, nextSize.width, nextSize.height)
        );
        return nextSize;
      });
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

  useEffect(() => {
    setPromptExampleIndex(0);
  }, [language, mode]);

  useEffect(() => {
    if (!showPromptSuggestion || typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      setPromptExampleIndex((index) => index + 1);
    }, 4200);
    return () => window.clearInterval(interval);
  }, [language, mode, showPromptSuggestion]);

  useEffect(() => {
    const viewport = answerStackRef.current;
    if (!viewport) return;

    if (previousTurnCountRef.current !== turns.length) {
      previousTurnCountRef.current = turns.length;
      setAutoScrollLocked(false);
      setShowJumpToBottom(false);
      requestAnimationFrame(() => scrollAnswerStackToBottom("auto"));
      return;
    }

    if (autoScrollLocked) {
      setShowJumpToBottom(!isAnswerStackAtBottom(viewport));
      return;
    }

    requestAnimationFrame(() => scrollAnswerStackToBottom("auto"));
  }, [autoScrollLocked, busy, turns]);

  useEffect(() => {
    setAnswerDetailsOpen(false);
  }, [turns.length]);

  const popoverStyle = isPinned
      ? undefined
      : ({
          left: floatingPosition.x,
          top: floatingPosition.y,
          right: "auto",
          bottom: "auto",
          width: floatingSize.width,
          height: floatingSize.height
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
            <p className="eyebrow">Cywell OpsLens</p>
            <h2>{copy.eyebrow}</h2>
          </div>
        </div>
        <div className="assistant-controls">
          <span
            className={`assistant-state-dot ${apiStatus === "ready" ? "ready" : "fallback"}`}
            data-testid="assistant-connection-status"
            title={statusLabel}
            aria-label={statusLabel}
          />
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
          <span
            className="sr-only"
            data-testid="assistant-placement-status"
          >
            {isPinned ? copy.placementPinned : copy.placementFloating}
          </span>
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
            data-testid="assistant-copy-conversation"
            title={conversationCopied ? copy.conversationCopied : copy.copyConversation}
            aria-label={conversationCopied ? copy.conversationCopied : copy.copyConversation}
            onClick={copyConversation}
          >
            {conversationCopied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
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

      <details className="assistant-context-details" data-testid="context-chips">
        <summary>
          {copy.contextSummary}
          <span>{contextChips.length}</span>
        </summary>
        <div className="context-chip-list">
          {contextChips.map((chip) => (
            <span className="context-chip" key={`${chip.label}-${chip.value}`}>
              <strong>{localizedLabel(contextChipLabels, language, chip.label)}</strong>
              {localizedLabel(contextChipValueLabels, language, chip.value)}
            </span>
          ))}
        </div>
      </details>

      <div className="prompt-box">
        <label className="sr-only" htmlFor="kugnus-draft">
          {copy.prompt}
        </label>
        <div className="assistant-composer" onClick={focusDraftFromComposer}>
          {showPromptSuggestion ? (
            <span
              className="assistant-prompt-suggestion"
              data-testid="assistant-prompt-suggestion"
              aria-hidden="true"
            >
              {promptPlaceholder}
            </span>
          ) : null}
          <textarea
            id="kugnus-draft"
            data-testid="assistant-draft"
            ref={draftRef}
            value={draft}
            placeholder=""
            onChange={(event) => onDraftChange(event.target.value)}
            onFocus={() => setIsDraftFocused(true)}
            onBlur={() => setIsDraftFocused(false)}
            onKeyDown={handleDraftKeyDown}
          />
          <div className="assistant-mode-select">
            <button
              className="assistant-mode-trigger"
              type="button"
              data-testid="assistant-mode-trigger"
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
              aria-label={copy.modeMenuLabel}
              onClick={() => setModeMenuOpen((open) => !open)}
            >
              <ActiveModeIcon size={15} aria-hidden="true" />
              <span>{activeModeLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {modeMenuOpen ? (
              <div
                className="assistant-mode-menu"
                data-testid="assistant-mode-menu"
                role="menu"
              >
                <button
                  className={mode === "ask" ? "selected" : ""}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode === "ask"}
                  onClick={() => selectMode("ask")}
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  <span>
                    <strong>{copy.modeAsk}</strong>
                    <small>{copy.modeAskDescription}</small>
                  </span>
                  {mode === "ask" ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
                </button>
                <button
                  className={mode === "troubleshooting" ? "selected" : ""}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mode === "troubleshooting"}
                  onClick={() => selectMode("troubleshooting")}
                >
                  <Wrench size={16} aria-hidden="true" />
                  <span>
                    <strong>{copy.modeTroubleshooting}</strong>
                    <small>{copy.modeTroubleshootingDescription}</small>
                  </span>
                  {mode === "troubleshooting" ? (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
          <button
            className={`assistant-send-button ${isResponding ? "responding" : ""}`}
            type="button"
            data-testid="assistant-ask-button"
            data-responding={isResponding}
            onClick={isResponding ? onStop : submitAssistantPrompt}
            disabled={!isResponding && draft.trim().length === 0 && !showPromptSuggestion}
            aria-label={isResponding ? copy.stop : copy.ask}
            title={isResponding ? copy.stop : copy.ask}
          >
            {isResponding ? (
              <Square size={14} fill="currentColor" aria-hidden="true" />
            ) : (
              <Send size={18} aria-hidden="true" />
            )}
          </button>
        </div>
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

      <div
        className="answer-stack"
        data-scroll-locked={autoScrollLocked}
        onScroll={handleAnswerStackScroll}
        ref={answerStackRef}
      >
        <section className="assistant-chat-turns" data-testid="assistant-chat-turns">
          {renderedTurns.map((turn) => {
            const judgment = splitAssistantJudgment(turn.answer.judgment);

            return (
              <div className="assistant-chat-turn" data-testid="assistant-chat-turn" key={turn.id}>
                {turn.prompt ? (
                  <div className="chat-bubble user">
                    <span>{copy.userBubble}</span>
                    <p>{turn.prompt}</p>
                  </div>
                ) : null}
                <div
                  className={`chat-bubble assistant ${turn.pending ? "pending" : ""} ${
                    turn.streaming ? "streaming" : ""
                  }`}
                >
                  <div className="chat-bubble-heading">
                    <span>{copy.assistantBubble}</span>
                    {!turn.pending ? (
                      <button
                        className="chat-copy-button"
                        type="button"
                        data-testid="assistant-copy-answer"
                        title={copiedAnswerId === turn.id ? copy.answerCopied : copy.copyAnswer}
                        aria-label={
                          copiedAnswerId === turn.id ? copy.answerCopied : copy.copyAnswer
                        }
                        onClick={() => copyTurn(turn)}
                      >
                        {copiedAnswerId === turn.id ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {turn.pending ? (
                    <div className="assistant-typing" data-testid="assistant-typing">
                      <i />
                      <i />
                      <i />
                      <p>{copy.waitingForLightspeed}</p>
                    </div>
                  ) : (
                    <>
                      {renderMarkdownBlocks(
                        language,
                        judgment.primary,
                        `assistant-chat-answer-${turn.id}`,
                        "assistant-markdown compact"
                      )}
                      {judgment.rawDetail ? (
                        <details
                          className="assistant-raw-details"
                          data-testid="assistant-raw-details"
                        >
                          <summary>{copy.rawEvidenceDetails}</summary>
                          {renderMarkdownBlocks(
                            language,
                            judgment.rawDetail,
                            `assistant-chat-raw-${turn.id}`,
                            "assistant-markdown compact raw"
                          )}
                        </details>
                      ) : null}
                      {turn.streaming ? <em className="streaming-caret" /> : null}
                      <strong>{copy.readOnlyHint}</strong>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </section>

        {showJumpToBottom ? (
          <button
            className="assistant-jump-bottom"
            type="button"
            data-testid="assistant-jump-bottom"
            aria-label={copy.jumpToLatest}
            title={copy.jumpToLatest}
            onClick={jumpToLatestAnswer}
          >
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        ) : null}

        <details
          className="assistant-answer-details"
          data-testid="assistant-answer-details"
          open={answerDetailsOpen}
          onToggle={(event) => {
            setAnswerDetailsOpen(event.currentTarget.open);
          }}
        >
          <summary>{copy.answerDetails}</summary>

          <section className="answer-block judgment" data-testid="answer-judgment">
            <div className="answer-heading">
              <CheckCircle2 size={17} aria-hidden="true" />
              <h3>{copy.currentJudgment}</h3>
            </div>
            {renderMarkdownBlocks(
              language,
              splitAssistantJudgment(answer.judgment).primary,
              "assistant-judgment"
            )}
            {splitAssistantJudgment(answer.judgment).rawDetail ? (
              <details className="assistant-raw-details">
                <summary>{copy.rawEvidenceDetails}</summary>
                {renderMarkdownBlocks(
                  language,
                  splitAssistantJudgment(answer.judgment).rawDetail ?? "",
                  "assistant-judgment-raw",
                  "assistant-markdown compact raw"
                )}
              </details>
            ) : null}
            <span className="status-pill read-only">
              {copy.actionMode}: {localizedLabel(actionModeLabels, language, answer.actionMode)}
            </span>
          </section>

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
      {!isPinned ? (
        <div className="assistant-resize-handles" aria-hidden="true">
          {assistantResizeDirections.map((direction) => (
            <span
              className={`assistant-resize-handle ${direction}`}
              data-testid={`assistant-resize-${direction}`}
              key={direction}
              onPointerDown={(event) => handleResizeStart(direction, event)}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}
