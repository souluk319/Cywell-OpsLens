import type { CSSProperties } from "react";
import type { DashboardRisksResponse } from "@kugnus/contracts";
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  GitBranch,
  Gauge,
  ServerCog
} from "lucide-react";

interface OperationsDashboardProps {
  dashboard: DashboardRisksResponse;
}

export function OperationsDashboard({ dashboard }: OperationsDashboardProps) {
  const criticalCount = dashboard.activeRisks.filter(
    (risk) => risk.severity === "critical"
  ).length;
  const firingCount = dashboard.activeRisks.filter(
    (risk) => risk.status === "firing"
  ).length;
  const staleSources = dashboard.knowledgeSources.filter(
    (source) => source.freshness === "stale"
  ).length;

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administrator / Observe / Cywell OpsLens</p>
          <h2 id="dashboard-title">Operations Dashboard</h2>
        </div>
        <div className="summary-strip" aria-label="Cluster summary">
          <span>
            <AlertTriangle size={15} aria-hidden="true" />
            {criticalCount} critical
          </span>
          <span>
            <Activity size={15} aria-hidden="true" />
            {firingCount} firing
          </span>
          <span>
            <DatabaseZap size={15} aria-hidden="true" />
            {staleSources} stale source
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <article className="ops-card active-risk-card">
          <div className="card-title-row">
            <h3>Active Incident Queue</h3>
            <span className="status-pill danger">severity sorted</span>
          </div>
          <div className="risk-list" data-testid="active-risk-list">
            {dashboard.activeRisks.map((risk) => (
              <div className="risk-row" key={risk.id}>
                <span className={`severity-dot ${risk.severity}`} />
                <div>
                  <strong>{risk.title}</strong>
                  <p>
                    {risk.affected} · {risk.duration}
                  </p>
                </div>
                <span className="blast-score">{risk.blastRadius}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>Cluster Health</h3>
            <ServerCog size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Operators</dt>
              <dd>2 degraded</dd>
            </div>
            <div>
              <dt>Nodes</dt>
              <dd>12 ready</dd>
            </div>
            <div>
              <dt>Workloads</dt>
              <dd>4 crashloop</dd>
            </div>
          </dl>
        </article>

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>Risk Radar</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <div className="radar-bars" aria-label="Risk radar">
            <span style={{ "--bar": "78%" } as CSSProperties}>
              upgrade
            </span>
            <span style={{ "--bar": "61%" } as CSSProperties}>
              crashloop
            </span>
            <span style={{ "--bar": "44%" } as CSSProperties}>
              storage
            </span>
          </div>
        </article>

        <article className="ops-card recent-card">
          <div className="card-title-row">
            <h3>Recent Changes</h3>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <div className="change-list">
            {dashboard.recentChanges.map((change) => (
              <div className="change-row" key={change.id}>
                <span>{change.kind}</span>
                <strong>{change.summary}</strong>
                <small>
                  {change.namespace} · {change.age}
                </small>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-card knowledge-card">
          <div className="card-title-row">
            <h3>Knowledge Health</h3>
            <DatabaseZap size={18} aria-hidden="true" />
          </div>
          <div className="source-list">
            {dashboard.knowledgeSources.map((source) => (
              <div className="source-row" key={source.id}>
                <span className={`freshness ${source.freshness}`}>
                  {source.freshness}
                </span>
                <strong>{source.name}</strong>
                <small>
                  {source.owner} · citation {Math.round(source.citationRate * 100)}%
                </small>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-card model-card">
          <div className="card-title-row">
            <h3>Model Health</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Route</dt>
              <dd>{dashboard.modelHealth.route}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{dashboard.modelHealth.provider}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{dashboard.modelHealth.latencyMs} ms</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}
