import { mockContext } from "@kugnus/contracts";
import type { RiskItem } from "@kugnus/contracts";
import { Bot, FileCode2, ListFilter, ScrollText } from "lucide-react";
import type { UiLanguage } from "../i18n";

interface ConsoleEvidencePaneProps {
  contextPayload: string;
  activeRisks: RiskItem[];
  evidenceView: "alerts" | "logs" | "yaml";
  language: UiLanguage;
  onEvidenceViewChange: (view: "alerts" | "logs" | "yaml") => void;
  onAsk: () => void;
}

const evidenceCopy = {
  en: {
    eyebrow: "Console evidence",
    title: "Alerts, Logs, Events, YAML",
    evidenceView: "Evidence view",
    alerts: "Alerts",
    logs: "Logs",
    yaml: "YAML",
    firingAlerts: "Firing Alerts",
    askOpsLens: "Ask OpsLens",
    alert: "Alert",
    severity: "Severity",
    affected: "Affected",
    count: "Count",
    status: "Status",
    duration: "Duration",
    contextPayload: "Context Publisher Payload",
    podLogs: "Pod Logs",
    yamlLabel: "ClusterVersion YAML"
  },
  ko: {
    eyebrow: "콘솔 근거",
    title: "경고, 로그, 이벤트, YAML",
    evidenceView: "근거 보기",
    alerts: "경고",
    logs: "로그",
    yaml: "YAML",
    firingAlerts: "발생 중인 경고",
    askOpsLens: "OpsLens에 질문",
    alert: "경고",
    severity: "심각도",
    affected: "영향 대상",
    count: "건수",
    status: "상태",
    duration: "지속 시간",
    contextPayload: "컨텍스트 발행 payload",
    podLogs: "Pod 로그",
    yamlLabel: "ClusterVersion YAML"
  }
} as const;

const logLines = [
  "2026-06-12T03:11:42Z previous container exited with code 1",
  "2026-06-12T03:11:43Z failed to load config key PAYMENT_API_URL",
  "2026-06-12T03:11:44Z retry budget exhausted after 5 attempts",
  "2026-06-12T03:11:45Z readiness probe failed: /healthz returned 503",
  "2026-06-12T03:11:47Z controller scheduled restart backoff=40s"
];

const yamlText = `apiVersion: config.openshift.io/v1
kind: ClusterVersion
metadata:
  name: version
status:
  conditions:
    - type: Upgradeable
      status: "False"
      reason: AdminAckRequired
      message: Upgrade cannot proceed until the blocking condition is reviewed.
`;

export function ConsoleEvidencePane({
  contextPayload,
  activeRisks,
  evidenceView,
  language,
  onEvidenceViewChange,
  onAsk
}: ConsoleEvidencePaneProps) {
  const copy = evidenceCopy[language];

  return (
    <section className="evidence-section" aria-labelledby="evidence-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="evidence-title">{copy.title}</h2>
        </div>
        <div className="segmented-control" aria-label={copy.evidenceView}>
          <button
            type="button"
            data-testid="evidence-view-alerts"
            aria-pressed={evidenceView === "alerts"}
            onClick={() => onEvidenceViewChange("alerts")}
          >
            <ListFilter size={15} aria-hidden="true" />
            {copy.alerts}
          </button>
          <button
            type="button"
            data-testid="evidence-view-logs"
            aria-pressed={evidenceView === "logs"}
            onClick={() => onEvidenceViewChange("logs")}
          >
            <ScrollText size={15} aria-hidden="true" />
            {copy.logs}
          </button>
          <button
            type="button"
            data-testid="evidence-view-yaml"
            aria-pressed={evidenceView === "yaml"}
            onClick={() => onEvidenceViewChange("yaml")}
          >
            <FileCode2 size={15} aria-hidden="true" />
            {copy.yaml}
          </button>
        </div>
      </div>

      {evidenceView === "alerts" ? (
        <div className="evidence-grid">
          <article className="console-panel">
            <div className="panel-title-row">
              <h3>{copy.firingAlerts}</h3>
              <button
                className="text-icon-button"
                type="button"
                data-testid="evidence-ask-alerts"
                onClick={onAsk}
              >
                <Bot size={16} aria-hidden="true" />
                {copy.askOpsLens}
              </button>
            </div>
            <div className="table-wrap" data-testid="alert-table-wrap">
              <table
                className="alert-table"
                data-testid="alert-evidence-table"
              >
                <thead>
                  <tr>
                    <th>{copy.alert}</th>
                    <th data-testid="severity-header">{copy.severity}</th>
                    <th>{copy.affected}</th>
                    <th data-testid="count-header">{copy.count}</th>
                    <th data-testid="status-header">{copy.status}</th>
                    <th>{copy.duration}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRisks.map((risk) => (
                    <tr key={risk.id}>
                      <td>
                        <strong>{risk.title}</strong>
                      </td>
                      <td>
                        <span className={`severity-chip ${risk.severity}`}>
                          {risk.severity}
                        </span>
                      </td>
                      <td>{risk.affected}</td>
                      <td>{risk.count}</td>
                      <td>{risk.status}</td>
                      <td>{risk.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="console-panel context-panel">
            <h3>{copy.contextPayload}</h3>
            <pre data-testid="context-payload">{contextPayload}</pre>
          </article>
        </div>
      ) : null}

      {evidenceView === "logs" ? (
        <article className="console-panel log-panel">
          <div className="panel-title-row">
            <h3>{copy.podLogs}</h3>
            <button
              className="text-icon-button"
              type="button"
              data-testid="evidence-ask-logs"
              onClick={onAsk}
            >
              <Bot size={16} aria-hidden="true" />
              {copy.askOpsLens}
            </button>
          </div>
          <pre className="log-viewport" data-testid="log-viewport">
            {logLines.join("\n")}
          </pre>
        </article>
      ) : null}

      {evidenceView === "yaml" ? (
        <article className="console-panel yaml-panel">
          <div className="panel-title-row">
            <h3>{mockContext.resource?.kind} YAML</h3>
            <button
              className="text-icon-button"
              type="button"
              data-testid="evidence-ask-yaml"
              onClick={onAsk}
            >
              <Bot size={16} aria-hidden="true" />
              {copy.askOpsLens}
            </button>
          </div>
          <textarea
            aria-label={copy.yamlLabel}
            className="yaml-textarea"
            data-testid="yaml-textarea"
            readOnly
            value={yamlText}
          />
        </article>
      ) : null}
    </section>
  );
}
