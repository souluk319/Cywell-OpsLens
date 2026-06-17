import type {
  AssistantAnswer,
  AuditEnvelope,
  ContextChip
} from "@kugnus/contracts";
import type { KeyboardEvent } from "react";
import {
  CheckCircle2,
  FileSearch,
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
    ariaLabel: "Cywell OpsLens assistant",
    eyebrow: "KOMSCO AI Assistant",
    readyStatus: "local plan-only",
    close: "Close assistant",
    request: "request",
    model: "model",
    context: "context",
    route: "route",
    endpoint: "endpoint",
    error: "last error",
    retry: "Retry API",
    pending: "pending",
    actionMode: "action mode",
    prompt: "Ask from current context",
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
    citations: "Citations"
  },
  ko: {
    ariaLabel: "Cywell OpsLens 어시스턴트",
    eyebrow: "KOMSCO AI Assistant",
    readyStatus: "로컬 계획 전용",
    close: "어시스턴트 닫기",
    request: "요청",
    model: "모델",
    context: "컨텍스트",
    route: "경로",
    endpoint: "엔드포인트",
    error: "마지막 오류",
    retry: "API 재시도",
    pending: "대기 중",
    actionMode: "동작 모드",
    prompt: "현재 컨텍스트로 질문",
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
    citations: "인용"
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

function localizedLabel(
  labels: Record<UiLanguage, Record<string, string>>,
  language: UiLanguage,
  value: string
) {
  return labels[language][value] ?? value;
}

function localizedText(language: UiLanguage, value: string) {
  return answerTextLabels[language][value] ?? value;
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
  const statusLabel =
    apiStatus === "ready"
      ? copy.readyStatus
      : localizedLabel(statusLabels, language, apiStatus);

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!busy && draft.trim().length > 0) {
      onAsk();
    }
  }

  return (
    <aside
      aria-label={copy.ariaLabel}
      className="assistant-popover"
      data-testid="assistant-popover"
      id="kugnus-assistant-popover"
      role="dialog"
      aria-modal="false"
    >
      <div className="assistant-header">
        <div className="assistant-title">
          <span className="assistant-icon">
            <img className="assistant-app-icon" src={opsLensIcon} alt="" />
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
          </>
        ) : null}
      </div>

      <div className="prompt-box">
        <label htmlFor="kugnus-draft">{copy.prompt}</label>
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

      <div className="answer-stack">
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
      </div>
    </aside>
  );
}
