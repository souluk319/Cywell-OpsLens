import type { OcpConsoleOverviewResponse } from "@kugnus/contracts";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  GitBranch,
  Network,
  RefreshCw,
  ServerCog
} from "lucide-react";
import { fetchOcpConsoleOverview } from "../lib/api";

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

export function OcpConsoleOverview() {
  const [overview, setOverview] = useState<OcpConsoleOverviewResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshOverview() {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchOcpConsoleOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCP overview failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  return (
    <section className="ocp-console-overview" aria-labelledby="ocp-console-overview-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Console-like live overview</p>
          <h2 id="ocp-console-overview-title">OpenShift Console Overview</h2>
        </div>
        <button
          className="text-icon-button"
          type="button"
          onClick={() => void refreshOverview()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="overview-status-strip" data-testid="ocp-overview-status">
        <span className={`status-pill ${overview?.status.reachable ? "ready" : "danger"}`}>
          {loading
            ? "loading"
            : overview?.status.reachable
              ? "live OCP"
              : "unavailable"}
        </span>
        <span>k8s {overview?.cluster.version ?? "-"}</span>
        <span>desired {overview?.cluster.desiredVersion ?? "-"}</span>
        <span>channel {overview?.cluster.channel ?? "-"}</span>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-overview-error">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="overview-grid" data-testid="ocp-console-overview">
        <article className="overview-card">
          <div className="card-title-row">
            <h3>Cluster Operators</h3>
            <ServerCog size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Total</dt>
              <dd>{numberText(overview?.operators.total)}</dd>
            </div>
            <div>
              <dt>Degraded</dt>
              <dd>{numberText(overview?.operators.degraded)}</dd>
            </div>
            <div>
              <dt>Unavailable</dt>
              <dd>{numberText(overview?.operators.unavailable)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>Nodes</h3>
            <Boxes size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Total</dt>
              <dd>{numberText(overview?.nodes.total)}</dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd>{numberText(overview?.nodes.ready)}</dd>
            </div>
            <div>
              <dt>Not ready</dt>
              <dd>{numberText(overview?.nodes.notReady)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>Workloads</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Pods</dt>
              <dd>{numberText(overview?.workloads.pods.total)}</dd>
            </div>
            <div>
              <dt>CrashLoop</dt>
              <dd>{numberText(overview?.workloads.pods.crashLooping)}</dd>
            </div>
            <div>
              <dt>Deploy unavailable</dt>
              <dd>{numberText(overview?.workloads.deployments.unavailable)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>Networking</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Routes</dt>
              <dd>{numberText(overview?.networking.routes)}</dd>
            </div>
            <div>
              <dt>Ingresses</dt>
              <dd>{numberText(overview?.networking.ingresses)}</dd>
            </div>
            <div>
              <dt>Services</dt>
              <dd>{numberText(overview?.networking.services)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>Builds And Images</h3>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Builds</dt>
              <dd>{numberText(overview?.supplyChain.builds)}</dd>
            </div>
            <div>
              <dt>Failed builds</dt>
              <dd>{numberText(overview?.supplyChain.failedBuilds)}</dd>
            </div>
            <div>
              <dt>ImageStreams</dt>
              <dd>{numberText(overview?.supplyChain.imageStreams)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card monitoring-card">
          <div className="card-title-row">
            <h3>Monitoring</h3>
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Reachable</dt>
              <dd>{overview?.monitoring.reachable ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt>Firing alerts</dt>
              <dd>{numberText(overview?.monitoring.firingAlerts)}</dd>
            </div>
            <div>
              <dt>Critical</dt>
              <dd>{numberText(overview?.monitoring.criticalAlerts)}</dd>
            </div>
          </dl>
          {overview?.monitoring.error ? (
            <p className="muted-warning">{overview.monitoring.error}</p>
          ) : null}
        </article>
      </div>

      <div className="evidence-strip" data-testid="ocp-overview-evidence">
        {(overview?.evidence ?? []).map((source) => (
          <span key={source}>{source}</span>
        ))}
      </div>
    </section>
  );
}
