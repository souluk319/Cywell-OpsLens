import type { OcpConsoleOverviewResponse } from "@kugnus/contracts";
import { useEffect, useState, type CSSProperties } from "react";
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
    autoRefresh: "Auto refresh 10s",
    lastUpdated: "Updated",
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
    utilization: "Utilization",
    metricSeries: "metric series",
    source: "Source",
    samples: "samples",
    latest: "latest",
    metricsUnavailable: "Live utilization is not connected",
    metricsProxyDisabled:
      "Prometheus is ready, but OpsLens API is not querying it because OCP_ENABLE_MONITORING_PROXY is disabled.",
    reachable: "Reachable",
    firingAlerts: "Firing alerts",
    critical: "Critical",
    liveSnapshot: "Live signal summary",
    operatorHealth: "Operator health",
    nodeReadiness: "Node readiness",
    podPhases: "Pod phases",
    warningPressure: "Warning pressure",
    healthy: "healthy",
    running: "running",
    pending: "pending",
    failed: "failed",
    warning: "warning",
    yes: "yes",
    no: "no"
  },
  ko: {
    eyebrow: "콘솔형 실시간 개요",
    title: "OpenShift 콘솔 개요",
    refresh: "새로고침",
    autoRefresh: "10초 자동 갱신",
    lastUpdated: "갱신",
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
    utilization: "사용량",
    metricSeries: "메트릭 시계열",
    source: "출처",
    samples: "샘플",
    latest: "최신",
    metricsUnavailable: "실시간 사용량이 연결되지 않음",
    metricsProxyDisabled:
      "Prometheus는 준비되어 있지만 OpsLens API가 OCP_ENABLE_MONITORING_PROXY 비활성 상태라 조회하지 않습니다.",
    reachable: "연결 가능",
    firingAlerts: "발생 중인 경고",
    critical: "긴급",
    liveSnapshot: "실시간 신호 요약",
    operatorHealth: "Operator 상태",
    nodeReadiness: "노드 준비도",
    podPhases: "Pod 단계",
    warningPressure: "경고 압력",
    healthy: "정상",
    running: "실행",
    pending: "대기",
    failed: "실패",
    warning: "경고",
    yes: "예",
    no: "아니오"
  }
} as const;

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function percent(value: number | undefined, total: number | undefined) {
  if (!total || typeof value !== "number") {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function percentLabel(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function visualStyle(value: number) {
  return { "--bar": percentLabel(value) } as CSSProperties;
}

function ringStyle(value: number) {
  return { "--score": percentLabel(value) } as CSSProperties;
}

function prometheusSampleNumber(sample: {
  value?: [number, string];
  values?: Array<[number, string]>;
}) {
  const raw = sample.value?.[1] ?? sample.values?.at(-1)?.[1];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function OcpConsoleOverview({ language }: OcpConsoleOverviewProps) {
  const [overview, setOverview] = useState<OcpConsoleOverviewResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  async function refreshOverview(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      setOverview(await fetchOcpConsoleOverview());
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCP overview failed");
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refreshOverview();
    const refreshId = window.setInterval(() => {
      void refreshOverview({ silent: true });
    }, 10000);

    return () => window.clearInterval(refreshId);
  }, []);

  const copy = overviewCopy[language];
  const healthyOperators = overview
    ? Math.max(
        0,
        overview.operators.total -
          overview.operators.degraded -
          overview.operators.unavailable
      )
    : 0;
  const operatorHealth = percent(healthyOperators, overview?.operators.total);
  const nodeReadiness = percent(overview?.nodes.ready, overview?.nodes.total);
  const runningPods = percent(
    overview?.workloads.pods.running,
    overview?.workloads.pods.total
  );
  const pendingPods = percent(
    overview?.workloads.pods.pending,
    overview?.workloads.pods.total
  );
  const failedPods = percent(
    overview?.workloads.pods.failed,
    overview?.workloads.pods.total
  );
  const warningPressure = percent(
    (overview?.monitoring.warningAlerts ?? 0) +
      (overview?.monitoring.criticalAlerts ?? 0),
    Math.max(1, overview?.monitoring.firingAlerts ?? 0)
  );
  const utilization = overview?.consoleDashboard.utilization;
  const utilizationSeries = utilization?.series ?? [];
  const liveUtilizationCount = utilizationSeries.filter(
    (series) => series.samples.length > 0
  ).length;

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
        <span>{copy.autoRefresh}</span>
        <span>
          {copy.lastUpdated}{" "}
          {lastLoadedAt ? new Date(lastLoadedAt).toLocaleTimeString() : "-"}
        </span>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-overview-error">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div
        className="overview-visual-grid"
        data-testid="ocp-overview-visuals"
        aria-label={copy.liveSnapshot}
      >
        <article className="overview-visual-card primary">
          <div className="overview-ring" style={ringStyle(operatorHealth)}>
            <strong>{operatorHealth}</strong>
            <span>{copy.healthy}</span>
          </div>
          <div>
            <h3>{copy.operatorHealth}</h3>
            <p>
              {healthyOperators}/{numberText(overview?.operators.total)}{" "}
              {copy.healthy} · {numberText(overview?.operators.degraded)}{" "}
              {copy.degraded}
            </p>
          </div>
        </article>

        <article className="overview-visual-card">
          <div className="visual-title-row">
            <h3>{copy.nodeReadiness}</h3>
            <strong>{percentLabel(nodeReadiness)}</strong>
          </div>
          <div className="overview-meter">
            <i style={visualStyle(nodeReadiness)} />
          </div>
          <p>
            {numberText(overview?.nodes.ready)} {copy.ready} /{" "}
            {numberText(overview?.nodes.total)} {copy.total}
          </p>
        </article>

        <article className="overview-visual-card wide">
          <div className="visual-title-row">
            <h3>{copy.podPhases}</h3>
            <strong>{numberText(overview?.workloads.pods.total)}</strong>
          </div>
          <div className="pod-phase-stack">
            <span className="running" style={visualStyle(runningPods)} />
            <span className="pending" style={visualStyle(pendingPods)} />
            <span className="failed" style={visualStyle(failedPods)} />
          </div>
          <div className="phase-legend">
            <span>
              <i className="running" />
              {copy.running}: {numberText(overview?.workloads.pods.running)}
            </span>
            <span>
              <i className="pending" />
              {copy.pending}: {numberText(overview?.workloads.pods.pending)}
            </span>
            <span>
              <i className="failed" />
              {copy.failed}: {numberText(overview?.workloads.pods.failed)}
            </span>
          </div>
        </article>

        <article className="overview-visual-card">
          <div className="visual-title-row">
            <h3>{copy.warningPressure}</h3>
            <strong>{numberText(overview?.monitoring.firingAlerts)}</strong>
          </div>
          <div className="overview-meter warning">
            <i style={visualStyle(warningPressure)} />
          </div>
          <p>
            {numberText(overview?.monitoring.criticalAlerts)} {copy.critical} ·{" "}
            {numberText(overview?.monitoring.warningAlerts)} {copy.warning}
          </p>
        </article>
      </div>

      <article
        className={`overview-utilization-panel ${
          utilization?.reachable ? "ready" : "warning"
        }`}
        data-testid="ocp-overview-utilization"
      >
        <div className="card-title-row">
          <div>
            <h3>{copy.utilization}</h3>
            <p>
              {copy.source}: {utilization?.source ?? "unknown"} ·{" "}
              {liveUtilizationCount}/{numberText(utilizationSeries.length)}{" "}
              {copy.metricSeries}
            </p>
          </div>
          <span className={`status-pill ${utilization?.reachable ? "ready" : "warning"}`}>
            {utilization?.reachable ? copy.liveOcp : copy.metricsUnavailable}
          </span>
        </div>
        {!utilization?.reachable ? (
          <p className="muted-warning">
            {utilization?.error ?? copy.metricsProxyDisabled}
          </p>
        ) : null}
        <div className="utilization-series-grid">
          {utilizationSeries.map((series) => {
            const values = series.samples
              .map((sample) => prometheusSampleNumber(sample))
              .filter((value): value is number => value !== null);
            const maxValue = Math.max(1, ...values);
            const latest = series.latest ?? values.at(-1);

            return (
              <div className="utilization-series-card" key={series.id}>
                <div>
                  <strong>{series.label}</strong>
                  <span>
                    {copy.samples}: {series.samples.length}
                  </span>
                </div>
                <div
                  className="utilization-sparkline"
                  aria-label={`${series.label} ${copy.samples}`}
                >
                  {values.length > 0 ? (
                    values.slice(-18).map((value, index) => (
                      <i
                        key={`${series.id}-${index}`}
                        style={visualStyle(Math.round((value / maxValue) * 100))}
                      />
                    ))
                  ) : (
                    <em>{series.error ?? utilization?.error ?? copy.metricsUnavailable}</em>
                  )}
                </div>
                <p>
                  {copy.latest}:{" "}
                  {typeof latest === "number" ? `${latest.toLocaleString()} ${series.unit}` : "-"}
                </p>
              </div>
            );
          })}
        </div>
      </article>

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
