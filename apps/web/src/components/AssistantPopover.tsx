import type {
  AssistantAnswer,
  AuditEnvelope,
  ContextChip
} from "@kugnus/contracts";
import {
  Bot,
  CheckCircle2,
  FileSearch,
  Route,
  ShieldAlert,
  SendHorizontal,
  Undo2,
  X
} from "lucide-react";

interface AssistantPopoverProps {
  draft: string;
  contextChips: ContextChip[];
  answer: AssistantAnswer;
  requestId: string;
  audit: AuditEnvelope | null;
  onDraftChange: (draft: string) => void;
  onClose: () => void;
}

export function AssistantPopover({
  draft,
  contextChips,
  answer,
  requestId,
  audit,
  onDraftChange,
  onClose
}: AssistantPopoverProps) {
  return (
    <aside
      aria-label="Cywell OpsLens assistant"
      className="assistant-popover"
      data-testid="assistant-popover"
      id="kugnus-assistant-popover"
      role="dialog"
      aria-modal="false"
    >
      <div className="assistant-header">
        <div className="assistant-title">
          <span className="assistant-icon">
            <Bot size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Context-aware assistant</p>
            <h2>OpsLens</h2>
          </div>
        </div>
        <div className="assistant-controls">
          <button
            className="icon-button"
            type="button"
            title="Close assistant"
            aria-label="Close assistant"
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
        <span>request</span>
        <strong>{requestId}</strong>
        <span>context</span>
        <strong>{audit?.contextHash ?? "pending"}</strong>
      </div>

      <div className="prompt-box">
        <label htmlFor="kugnus-draft">Ask from current context</label>
        <textarea
          id="kugnus-draft"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button className="text-icon-button" type="button">
          <SendHorizontal size={16} aria-hidden="true" />
          Ask
        </button>
      </div>

      <div className="answer-stack">
        <section className="answer-block judgment" data-testid="answer-judgment">
          <div className="answer-heading">
            <CheckCircle2 size={17} aria-hidden="true" />
            <h3>Current Judgment</h3>
          </div>
          <p>{answer.judgment}</p>
          <span className="status-pill read-only">
            actionMode={answer.actionMode}
          </span>
        </section>

        <section className="answer-block" data-testid="answer-evidence">
          <div className="answer-heading">
            <FileSearch size={17} aria-hidden="true" />
            <h3>Inspected Evidence</h3>
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
            <h3>Cause Candidates</h3>
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
            <h3>Next Checks</h3>
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
            <h3>Risks And Missing Evidence</h3>
          </div>
          <div className="two-column-list">
            <div>
              <h4>Risk</h4>
              <ul>
                {answer.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Missing Evidence</h4>
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
            <h3>Plan And Rollback Path</h3>
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
            <h3>Citations</h3>
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
