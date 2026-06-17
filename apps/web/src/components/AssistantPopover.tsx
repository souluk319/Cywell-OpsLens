import type {
  AssistantAnswer,
  AuditEnvelope,
  ContextChip
} from "@kugnus/contracts";
import type { KeyboardEvent } from "react";
import {
  CheckCircle2,
  FileSearch,
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
  onDraftChange: (draft: string) => void;
  onAsk: () => void;
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
    pending: "pending",
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
    ariaLabel: "Cywell OpsLens assistant",
    eyebrow: "KOMSCO AI Assistant",
    readyStatus: "로컬 계획 전용",
    close: "assistant 닫기",
    request: "요청",
    model: "모델",
    context: "컨텍스트",
    pending: "대기 중",
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
  onDraftChange,
  onAsk,
  onClose
}: AssistantPopoverProps) {
  const copy = assistantCopy[language];

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
            {apiStatus === "ready" ? copy.readyStatus : apiStatus}
          </span>
          <button
            className="icon-button"
            type="button"
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
            <strong>{chip.label}</strong>
            {chip.value}
          </span>
        ))}
      </div>

      <div className="api-trace" data-testid="api-trace">
        <span>{copy.request}</span>
        <strong>{requestId}</strong>
        <span>{copy.model}</span>
        <strong>{model}</strong>
        <span>{copy.context}</span>
        <strong>{audit?.contextHash ?? copy.pending}</strong>
      </div>

      <div className="prompt-box">
        <label htmlFor="kugnus-draft">{copy.prompt}</label>
        <textarea
          id="kugnus-draft"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleDraftKeyDown}
        />
        <button
          className="text-icon-button"
          type="button"
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
          <p>{answer.judgment}</p>
          <span className="status-pill read-only">
            actionMode={answer.actionMode}
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
                <span>{source.type}</span>
                <strong>{source.label}</strong>
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
                {candidate.confidence}
              </span>
              <div>
                <strong>{candidate.label}</strong>
                <p>{candidate.reason}</p>
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
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{copy.missingEvidence}</h4>
              <ul>
                {answer.missingEvidence.map((gap) => (
                  <li key={gap}>{gap}</li>
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
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="rollback-strip">
            {answer.rollbackPath.map((step) => (
              <span key={step}>{step}</span>
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
                <strong>{source.label}</strong>
                <span>{source.trustLevel}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
