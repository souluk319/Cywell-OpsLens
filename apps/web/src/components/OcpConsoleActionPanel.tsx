import { ArrowRight, Bot, FileSearch, ListChecks, ShieldCheck } from "lucide-react";
import type { ConsoleParityItem } from "../consoleParity";
import type { UiLanguage } from "../i18n";

interface OcpConsoleActionPanelProps {
  activeItem: ConsoleParityItem;
  language: UiLanguage;
  onOpenSurface: () => void;
  onAskAssistant: () => void;
}

const actionCopy = {
  en: {
    eyebrow: "Active console function",
    titlePrefix: "OpsLens is operating",
    nativePath: "Native OCP path",
    surface: "Active surface",
    command: "Action",
    enhancement: "OpsLens +@",
    acceptance: "Pass condition",
    resourcePreset: "Resource preset",
    preferredResources: "Preferred APIs",
    noResourcePreset: "No API resource preset required",
    openSurface: "Open surface",
    askAssistant: "Ask KOMSCO",
    readOnly: "read-only/plan-only"
  },
  ko: {
    eyebrow: "활성 콘솔 기능",
    titlePrefix: "OpsLens 작동 중",
    nativePath: "원본 OCP 경로",
    surface: "활성 화면",
    command: "동작",
    enhancement: "OpsLens +@",
    acceptance: "통과 조건",
    resourcePreset: "리소스 프리셋",
    preferredResources: "우선 API",
    noResourcePreset: "API 리소스 프리셋이 필요 없는 항목",
    openSurface: "화면 열기",
    askAssistant: "KOMSCO 질문",
    readOnly: "읽기 전용/계획 전용"
  }
} as const;

const surfaceLabels = {
  en: {
    overview: "Cluster overview",
    evidence: "Evidence pane",
    "resource-explorer": "Resource explorer",
    "ops-dashboard": "OpsLens dashboard",
    "ops-admin": "OpsLens admin",
    opsbrain: "OpsBrain",
    assistant: "KOMSCO assistant"
  },
  ko: {
    overview: "클러스터 개요",
    evidence: "근거 패널",
    "resource-explorer": "리소스 탐색기",
    "ops-dashboard": "OpsLens 대시보드",
    "ops-admin": "OpsLens 관리",
    opsbrain: "OpsBrain",
    assistant: "KOMSCO 어시스턴트"
  }
} as const;

export function OcpConsoleActionPanel({
  activeItem,
  language,
  onOpenSurface,
  onAskAssistant
}: OcpConsoleActionPanelProps) {
  const copy = actionCopy[language];
  const label = language === "ko" ? activeItem.labelKo : activeItem.label;
  const originalPath =
    language === "ko" ? activeItem.originalPathKo : activeItem.originalPath;
  const command =
    language === "ko" ? activeItem.commandKo : activeItem.command;
  const enhancement =
    language === "ko"
      ? activeItem.opsLensEnhancementKo
      : activeItem.opsLensEnhancement;
  const acceptance =
    language === "ko" ? activeItem.acceptanceKo : activeItem.acceptance;
  const preset = activeItem.resourcePreset;

  return (
    <section
      className="console-action-panel"
      data-testid="console-active-action"
      data-active-console-item={activeItem.id}
      aria-labelledby="console-active-action-title"
    >
      <div className="console-action-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="console-active-action-title">
            {copy.titlePrefix}: {label}
          </h2>
        </div>
        <span className="status-pill read-only" data-testid="console-active-boundary">
          <ShieldCheck size={14} aria-hidden="true" />
          {copy.readOnly}
        </span>
      </div>

      <div className="console-action-grid">
        <article>
          <span>{copy.nativePath}</span>
          <strong data-testid="console-active-path">{originalPath}</strong>
        </article>
        <article>
          <span>{copy.surface}</span>
          <strong data-testid="console-active-surface">
            {surfaceLabels[language][activeItem.actionSurface]}
          </strong>
        </article>
        <article>
          <span>{copy.resourcePreset}</span>
          <strong data-testid="console-active-preset-query">
            {preset?.query ?? copy.noResourcePreset}
          </strong>
        </article>
      </div>

      <div className="console-action-detail-grid">
        <div>
          <h3>
            <FileSearch size={15} aria-hidden="true" />
            {copy.command}
          </h3>
          <p data-testid="console-active-command">{command}</p>
        </div>
        <div>
          <h3>
            <ArrowRight size={15} aria-hidden="true" />
            {copy.enhancement}
          </h3>
          <p data-testid="console-active-enhancement">{enhancement}</p>
        </div>
        <div>
          <h3>
            <ListChecks size={15} aria-hidden="true" />
            {copy.acceptance}
          </h3>
          <p data-testid="console-active-acceptance">{acceptance}</p>
        </div>
      </div>

      {preset ? (
        <div
          className="console-action-resources"
          data-testid="console-active-preferred-resources"
        >
          <span>{copy.preferredResources}</span>
          {preset.preferredResources.map((resource) => (
            <code key={resource}>{resource}</code>
          ))}
        </div>
      ) : null}

      <div className="console-action-controls">
        <button
          className="text-icon-button"
          data-testid="console-active-open-surface"
          type="button"
          onClick={onOpenSurface}
        >
          <ArrowRight size={15} aria-hidden="true" />
          {copy.openSurface}
        </button>
        <button
          className="text-icon-button"
          data-testid="console-active-ask-assistant"
          type="button"
          onClick={onAskAssistant}
        >
          <Bot size={15} aria-hidden="true" />
          {copy.askAssistant}
        </button>
      </div>
    </section>
  );
}
