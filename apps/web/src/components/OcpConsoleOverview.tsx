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
import type { UiLanguage } from "../i18n";

interface OcpConsoleOverviewProps {
  language: UiLanguage;
}

const overviewCopy = {
  en: {
    eyebrow: "Console-like live overview",
    title: "OpenShift Console Overview",
    refresh: "Refresh",
    loading: "loading",
    liveOcp: "live OCP",
    unavailable: "unavailable",
    desired: "desired",
    channel: "channel",
    clusterOperators: "Cluster Operators",
    total: "Total",
    degraded: "Degraded",
    nodes: "Nodes",
    ready: "Ready",
    notReady: "Not ready",
    workloads: "Workloads",
    pods: "Pods",
    crashLoop: "CrashLoop",
    deployUnavailable: "Deploy unavailable",
    networking: "Networking",
    routes: "Routes",
    ingresses: "Ingresses",
    services: "Services",
    buildsAndImages: "Builds And Images",
    builds: "Builds",
    failedBuilds: "Failed builds",
    imageStreams: "ImageStreams",
    monitoring: "Monitoring",
    reachable: "Reachable",
    firingAlerts: "Firing alerts",
    critical: "Critical",
    yes: "yes",
    no: "no"
  },
  ko: {
    eyebrow: "콘솔형 실시간 개요",
    title: "OpenShift 콘솔 개요",
    refresh: "새로고침",
    loading: "불러오는 중",
    liveOcp: "실제 OCP 연결",
    unavailable: "사용 불가",
    desired: "목표",
    channel: "채널",
    clusterOperators: "클러스터 Operator",
    total: "전체",
    degraded: "성능 저하",
    nodes: "노드",
    ready: "정상",
    notReady: "비정상",
    workloads: "워크로드",
    pods: "파드",
    crashLoop: "CrashLoop",
    deployUnavailable: "비가용 배포",
    networking: "네트워킹",
    routes: "라우트",
    ingresses: "인그레스",
    services: "서비스",
    buildsAndImages: "빌드와 이미지",
    builds: "빌드",
    failedBuilds: "실패한 빌드",
    imageStreams: "이미지 스트림",
    monitoring: "모니터링",
    reachable: "연결 가능",
    firingAlerts: "발생 중인 경고",
    critical: "긴급",
    yes: "예",
    no: "아니오"
  }
} as const;

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

export function OcpConsoleOverview({ language }: OcpConsoleOverviewProps) {
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

  const copy = overviewCopy[language];

  return (
    <section className="ocp-console-overview" aria-labelledby="ocp-console-overview-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-console-overview-title">{copy.title}</h2>
        </div>
        <button
          className="text-icon-button"
          type="button"
          onClick={() => void refreshOverview()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="overview-status-strip" data-testid="ocp-overview-status">
        <span className={`status-pill ${overview?.status.reachable ? "ready" : "danger"}`}>
          {loading
            ? copy.loading
            : overview?.status.reachable
              ? copy.liveOcp
              : copy.unavailable}
        </span>
        <span>k8s {overview?.cluster.version ?? "-"}</span>
        <span>{copy.desired} {overview?.cluster.desiredVersion ?? "-"}</span>
        <span>{copy.channel} {overview?.cluster.channel ?? "-"}</span>
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
            <h3>{copy.clusterOperators}</h3>
            <ServerCog size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.total}</dt>
              <dd>{numberText(overview?.operators.total)}</dd>
            </div>
            <div>
              <dt>{copy.degraded}</dt>
              <dd>{numberText(overview?.operators.degraded)}</dd>
            </div>
            <div>
              <dt>{copy.unavailable}</dt>
              <dd>{numberText(overview?.operators.unavailable)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>{copy.nodes}</h3>
            <Boxes size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.total}</dt>
              <dd>{numberText(overview?.nodes.total)}</dd>
            </div>
            <div>
              <dt>{copy.ready}</dt>
              <dd>{numberText(overview?.nodes.ready)}</dd>
            </div>
            <div>
              <dt>{copy.notReady}</dt>
              <dd>{numberText(overview?.nodes.notReady)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>{copy.workloads}</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.pods}</dt>
              <dd>{numberText(overview?.workloads.pods.total)}</dd>
            </div>
            <div>
              <dt>{copy.crashLoop}</dt>
              <dd>{numberText(overview?.workloads.pods.crashLooping)}</dd>
            </div>
            <div>
              <dt>{copy.deployUnavailable}</dt>
              <dd>{numberText(overview?.workloads.deployments.unavailable)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>{copy.networking}</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.routes}</dt>
              <dd>{numberText(overview?.networking.routes)}</dd>
            </div>
            <div>
              <dt>{copy.ingresses}</dt>
              <dd>{numberText(overview?.networking.ingresses)}</dd>
            </div>
            <div>
              <dt>{copy.services}</dt>
              <dd>{numberText(overview?.networking.services)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card">
          <div className="card-title-row">
            <h3>{copy.buildsAndImages}</h3>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.builds}</dt>
              <dd>{numberText(overview?.supplyChain.builds)}</dd>
            </div>
            <div>
              <dt>{copy.failedBuilds}</dt>
              <dd>{numberText(overview?.supplyChain.failedBuilds)}</dd>
            </div>
            <div>
              <dt>{copy.imageStreams}</dt>
              <dd>{numberText(overview?.supplyChain.imageStreams)}</dd>
            </div>
          </dl>
        </article>

        <article className="overview-card monitoring-card">
          <div className="card-title-row">
            <h3>{copy.monitoring}</h3>
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.reachable}</dt>
              <dd>{overview?.monitoring.reachable ? copy.yes : copy.no}</dd>
            </div>
            <div>
              <dt>{copy.firingAlerts}</dt>
              <dd>{numberText(overview?.monitoring.firingAlerts)}</dd>
            </div>
            <div>
              <dt>{copy.critical}</dt>
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
