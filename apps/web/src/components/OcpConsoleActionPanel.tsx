import {
  ArrowRight,
  Bot,
  ExternalLink,
  FileSearch,
  ListChecks,
  ShieldCheck
} from "lucide-react";
import {
  consoleParityFunctionSignal,
  consoleParityFunctionProof,
  type ConsoleParityItem
} from "../consoleParity";
import type { UiLanguage } from "../i18n";
import type { OcpResourceFunctionOutcome } from "./OcpResourceExplorer";

interface OcpConsoleActionPanelProps {
  activeItem: ConsoleParityItem;
  language: UiLanguage;
  resourceFunctionOutcome: OcpResourceFunctionOutcome;
  targetStatus: "checking" | "mounted" | "missing";
  onOpenSurface: () => void;
  onAskAssistant: () => void;
}

const actionCopy = {
  en: {
    eyebrow: "Active console function",
    titlePrefix: "OpsLens is operating",
    nativePath: "Native OCP path",
    surface: "Active surface",
    coverageClass: "Coverage class",
    command: "Action",
    enhancement: "OpsLens +@",
    acceptance: "Pass condition",
    resourcePreset: "Resource preset",
    preferredResources: "Preferred APIs",
    noResourcePreset: "No API resource preset required",
    targetCheck: "Target screen",
    mounted: "mounted",
    checking: "checking",
    missing: "missing",
    functionMode: "Function mode",
    actionOutcome: "Action outcome",
    targetMounted: "target mounted",
    targetChecking: "target checking",
    targetMissing: "target missing",
    resourceOperating: "resource operating",
    resourceEmpty: "resource empty",
    resourceLoading: "resource loading",
    resourceMissing: "resource missing",
    resourceWaiting: "resource waiting",
    evidenceViewActive: "evidence view active",
    assistantReady: "assistant context ready",
    functionInput: "Function input",
    actionProof: "Action proof",
    functionSignal: "Function signal",
    openSurface: "Open surface",
    askAssistant: "Ask KOMSCO",
    nativeCreate: "Open native create",
    readOnly: "read-only/plan-only"
  },
  ko: {
    eyebrow: "활성 콘솔 기능",
    titlePrefix: "OpsLens 작동 중",
    nativePath: "원본 OCP 경로",
    surface: "활성 화면",
    coverageClass: "지원 분류",
    command: "동작",
    enhancement: "OpsLens +@",
    acceptance: "통과 조건",
    resourcePreset: "리소스 프리셋",
    preferredResources: "우선 API",
    noResourcePreset: "API 리소스 프리셋이 필요 없는 항목",
    targetCheck: "대상 화면",
    mounted: "장착됨",
    checking: "확인 중",
    missing: "누락",
    functionMode: "기능 모드",
    actionOutcome: "동작 결과",
    targetMounted: "대상 장착됨",
    targetChecking: "대상 확인 중",
    targetMissing: "대상 누락",
    resourceOperating: "리소스 작동 중",
    resourceEmpty: "리소스 비어 있음",
    resourceLoading: "리소스 확인 중",
    resourceMissing: "리소스 누락",
    resourceWaiting: "리소스 대기 중",
    evidenceViewActive: "근거 보기 활성",
    assistantReady: "어시스턴트 컨텍스트 준비",
    functionInput: "기능 입력",
    actionProof: "동작 증거",
    functionSignal: "기능 신호",
    openSurface: "화면 열기",
    askAssistant: "KOMSCO 질문",
    nativeCreate: "원본 생성 열기",
    readOnly: "읽기 전용/계획 전용"
  }
} as const;

const surfaceLabels = {
  en: {
    overview: "Cluster overview",
    evidence: "Evidence pane",
    "resource-explorer": "Resource explorer",
    "topology-graph": "Topology graph",
    "ops-dashboard": "OpsLens dashboard",
    "ops-admin": "OpsLens admin",
    opsbrain: "OpsBrain",
    assistant: "KOMSCO assistant"
  },
  ko: {
    overview: "클러스터 개요",
    evidence: "근거 패널",
    "resource-explorer": "리소스 탐색기",
    "topology-graph": "토폴로지 그래프",
    "ops-dashboard": "OpsLens 대시보드",
    "ops-admin": "OpsLens 관리",
    opsbrain: "OpsBrain",
    assistant: "KOMSCO 어시스턴트"
  }
} as const;

const coverageClassLabels = {
  en: {
    "live-view": "Live View",
    "native-deep-link": "Native Deep Link",
    "plan-only": "Plan-only",
    gap: "Gap"
  },
  ko: {
    "live-view": "Live View",
    "native-deep-link": "Native Deep Link",
    "plan-only": "Plan-only",
    gap: "Gap"
  }
} as const;

function nativeConsoleHref(path: string) {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (window.location.hostname.includes("console-openshift-console")) {
      return `${origin}${path}`;
    }
  }
  return `https://console-openshift-console.apps-crc.testing${path}`;
}

export function OcpConsoleActionPanel({
  activeItem,
  language,
  resourceFunctionOutcome,
  targetStatus,
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
  const targetStatusLabel = copy[targetStatus];
  const functionProof = consoleParityFunctionProof(activeItem);
  const functionSignal = consoleParityFunctionSignal(activeItem);
  const functionInput =
    language === "ko" ? functionProof.inputKo : functionProof.input;
  const functionProofText =
    language === "ko" ? functionProof.proofKo : functionProof.proof;
  const functionSignalDescription =
    language === "ko"
      ? functionSignal.descriptionKo
      : functionSignal.description;
  const actionOutcomeState =
    targetStatus !== "mounted"
      ? targetStatus
      : activeItem.resourcePreset
        ? `resource-${resourceFunctionOutcome}`
        : activeItem.evidenceView
          ? "evidence-view-active"
          : activeItem.actionSurface === "assistant"
            ? "assistant-ready"
            : "target-mounted";
  const actionOutcomeLabel = (() => {
    switch (actionOutcomeState) {
      case "resource-operating":
        return copy.resourceOperating;
      case "resource-empty":
        return copy.resourceEmpty;
      case "resource-loading":
        return copy.resourceLoading;
      case "resource-missing":
        return copy.resourceMissing;
      case "resource-waiting":
      case "resource-not-active":
        return copy.resourceWaiting;
      case "evidence-view-active":
        return copy.evidenceViewActive;
      case "assistant-ready":
        return copy.assistantReady;
      case "target-mounted":
        return copy.targetMounted;
      case "checking":
        return copy.targetChecking;
      default:
        return copy.targetMissing;
    }
  })();

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
          <span>{copy.coverageClass}</span>
          <strong
            data-testid="console-active-coverage-class"
            data-coverage-class={activeItem.coverageClass}
          >
            {coverageClassLabels[language][activeItem.coverageClass]}
          </strong>
        </article>
        <article>
          <span>{copy.resourcePreset}</span>
          <strong data-testid="console-active-preset-query">
            {preset?.query ?? copy.noResourcePreset}
          </strong>
        </article>
        <article>
          <span>{copy.targetCheck}</span>
          <strong
            data-testid="console-active-target-status"
            data-target-status={targetStatus}
          >
            {targetStatusLabel}
          </strong>
        </article>
        <article>
          <span>{copy.functionMode}</span>
          <strong
            data-function-mode={functionProof.mode}
            data-testid="console-active-function-mode"
          >
            {functionProof.mode}
          </strong>
        </article>
        <article>
          <span>{copy.actionOutcome}</span>
          <strong
            data-action-outcome={actionOutcomeState}
            data-resource-function-outcome={
              activeItem.resourcePreset ? resourceFunctionOutcome : "not-active"
            }
            data-testid="console-active-action-outcome"
          >
            {actionOutcomeLabel}
          </strong>
        </article>
        <article>
          <span>{copy.functionInput}</span>
          <strong data-testid="console-active-function-input">
            {functionInput}
          </strong>
        </article>
        <article>
          <span>{copy.actionProof}</span>
          <strong data-testid="console-active-action-proof">
            {functionProofText}
          </strong>
        </article>
        <article>
          <span>{copy.functionSignal}</span>
          <strong
            data-function-signal-selector={functionSignal.selector}
            data-testid="console-active-function-signal"
          >
            {functionSignalDescription}
          </strong>
          <code>{functionSignal.selector}</code>
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
        {activeItem.nativeCreatePath ? (
          <a
            className="text-icon-button"
            data-testid="console-active-native-create"
            href={nativeConsoleHref(activeItem.nativeCreatePath)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />
            {copy.nativeCreate}
          </a>
        ) : null}
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
