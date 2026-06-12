import { mockContext } from "@kugnus/contracts";
import type { RiskItem } from "@kugnus/contracts";
import { Bot, FileCode2, ListFilter, ScrollText } from "lucide-react";

interface ConsoleEvidencePaneProps {
  contextPayload: string;
  activeRisks: RiskItem[];
  evidenceView: "alerts" | "logs" | "yaml";
  onEvidenceViewChange: (view: "alerts" | "logs" | "yaml") => void;
  onAsk: () => void;
}

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
  onEvidenceViewChange,
  onAsk
}: ConsoleEvidencePaneProps) {
  return (
    <section className="evidence-section" aria-labelledby="evidence-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Console evidence</p>
          <h2 id="evidence-title">Alerts, Logs, Events, YAML</h2>
        </div>
        <div className="segmented-control" aria-label="Evidence view">
          <button
            type="button"
            aria-pressed={evidenceView === "alerts"}
            onClick={() => onEvidenceViewChange("alerts")}
          >
            <ListFilter size={15} aria-hidden="true" />
            Alerts
          </button>
          <button
            type="button"
            aria-pressed={evidenceView === "logs"}
            onClick={() => onEvidenceViewChange("logs")}
          >
            <ScrollText size={15} aria-hidden="true" />
            Logs
          </button>
          <button
            type="button"
            aria-pressed={evidenceView === "yaml"}
            onClick={() => onEvidenceViewChange("yaml")}
          >
            <FileCode2 size={15} aria-hidden="true" />
            YAML
          </button>
        </div>
      </div>

      {evidenceView === "alerts" ? (
        <div className="evidence-grid">
          <article className="console-panel">
            <div className="panel-title-row">
              <h3>Firing Alerts</h3>
              <button className="text-icon-button" type="button" onClick={onAsk}>
                <Bot size={16} aria-hidden="true" />
                Ask OpsLens
              </button>
            </div>
            <div className="table-wrap" data-testid="alert-table-wrap">
              <table
                className="alert-table"
                data-testid="alert-evidence-table"
              >
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th data-testid="severity-header">Severity</th>
                    <th>Affected</th>
                    <th data-testid="count-header">Count</th>
                    <th data-testid="status-header">Status</th>
                    <th>Duration</th>
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
            <h3>Context Publisher Payload</h3>
            <pre data-testid="context-payload">{contextPayload}</pre>
          </article>
        </div>
      ) : null}

      {evidenceView === "logs" ? (
        <article className="console-panel log-panel">
          <div className="panel-title-row">
            <h3>Pod Logs</h3>
            <button className="text-icon-button" type="button" onClick={onAsk}>
              <Bot size={16} aria-hidden="true" />
              Ask OpsLens
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
            <button className="text-icon-button" type="button" onClick={onAsk}>
              <Bot size={16} aria-hidden="true" />
              Ask OpsLens
            </button>
          </div>
          <textarea
            aria-label="ClusterVersion YAML"
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
