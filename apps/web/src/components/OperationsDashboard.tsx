import { useEffect, useState, type CSSProperties } from "react";
import type {
  DashboardRisksResponse,
  OcpConsoleOverviewResponse
} from "@kugnus/contracts";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  DatabaseZap,
  GitBranch,
  Gauge,
  ServerCog,
  ShieldCheck,
  TrendingUp
} from "lucide-react";
import type { UiLanguage } from "../i18n";
import { fetchOcpConsoleOverview } from "../lib/api";

interface OperationsDashboardProps {
  dashboard: DashboardRisksResponse;
  language: UiLanguage;
}

const dashboardCopy = {
  en: {
    breadcrumb: "Administrator / Observe / Cywell OpsLens",
    title: "Operations Dashboard",
    summary: "Cluster summary",
    critical: "critical",
    firing: "firing",
    staleSource: "stale source",
    snapshot: "Snapshot",
    mockSource: "mock backend",
    readonlySource: "cluster read-only",
    activeIncidentQueue: "Active Incident Queue",
    severitySorted: "severity sorted",
    clusterHealth: "Cluster Health",
    derivedHealthScore: "Derived health score",
    averageBlastRadius: "Avg blast radius",
    evidenceRefs: "Evidence refs",
    linkedChanges: "linked changes",
    operators: "Operators",
    degradedOperators: "2 degraded",
    nodes: "Nodes",
    readyNodes: "12 ready",
    workloads: "Workloads",
    crashloopWorkloads: "4 crashloop",
    severityDistribution: "Severity Distribution",
    severityDistributionLabel: "Active risk severity distribution",
    visualSummary: "Operational Signal Map",
    healthRing: "health",
    riskMix: "risk mix",
    evidenceFlow: "evidence flow",
    decisionReady: "decision ready",
    needsTriage: "needs triage",
    exposureTrend: "Exposure Trend",
    exposureTrendLabel: "Risk exposure derived from alert durations",
    actionInsights: "Action Insights",
    primaryRisk: "Primary risk",
    correlatedChange: "Correlated change",
    evidenceCoverage: "Evidence coverage",
    noLinkedChange: "No linked change",
    allSourcesFresh: "All sources fresh",
    recentChanges: "Recent Changes",
    knowledgeHealth: "Knowledge Health",
    citation: "citation",
    modelHealth: "Model Health",
    route: "Route",
    provider: "Provider",
    latency: "Latency",
    fallback: "Fallback",
    riskCount: "risks",
    liveConsoleSync: "OpenShift Console Sync",
    liveConsoleSyncSubtitle: "Live signals matched from the native console dashboard",
    liveConnected: "live API",
    liveUnavailable: "API unavailable",
    opsLensSource: "OpsLens risk source",
    consoleSource: "Native console source",
    prometheusSource: "Prometheus source",
    sourceLiveReadonly: "live read-only API",
    sourceFixture: "fixture / demo data",
    sourceUnavailable: "unavailable",
    apiEvidence: "API evidence",
    clusterVersion: "OpenShift version",
    channel: "Channel",
    highAvailability: "HA mode",
    inventory: "Inventory",
    statusCards: "Status cards",
    activity: "Activity",
    utilization: "Utilization",
    notMeasured: "not measured",
    storage: "Storage",
    routesAndServices: "Routes / Services",
    decisionFlowMap: "OpsLens Decision Flow",
    decisionFlowSubtitle:
      "How native console signals become operator-ready guidance",
    nativeSignals: "Native console signals",
    opsLensCorrelation: "OpsLens correlation",
    operatorDecision: "Operator decision",
    assistantHandoff: "Assistant handoff",
    liveSignals: "live signals",
    riskSignals: "risk signals",
    topDecision: "top decision",
    suggestedQuestion: "suggested question"
  },
  ko: {
    breadcrumb: "관리자 / 관측 / Cywell OpsLens",
    title: "운영 대시보드",
    summary: "클러스터 요약",
    critical: "긴급",
    firing: "발생 중",
    staleSource: "오래된 근거",
    snapshot: "스냅샷",
    mockSource: "목 백엔드",
    readonlySource: "클러스터 읽기 전용",
    activeIncidentQueue: "활성 장애 대기열",
    severitySorted: "심각도순",
    clusterHealth: "클러스터 상태",
    derivedHealthScore: "파생 상태 점수",
    averageBlastRadius: "평균 영향도",
    evidenceRefs: "근거 참조",
    linkedChanges: "연결된 변경",
    operators: "Operator",
    degradedOperators: "2개 성능 저하",
    nodes: "노드",
    readyNodes: "12개 정상",
    workloads: "워크로드",
    crashloopWorkloads: "4개 CrashLoop",
    severityDistribution: "심각도 분포",
    severityDistributionLabel: "활성 리스크 심각도 분포",
    visualSummary: "운영 신호 맵",
    healthRing: "상태",
    riskMix: "리스크 구성",
    evidenceFlow: "근거 흐름",
    decisionReady: "판단 가능",
    needsTriage: "분류 필요",
    exposureTrend: "노출 추세",
    exposureTrendLabel: "알림 지속 시간에서 파생한 리스크 노출",
    actionInsights: "조치 인사이트",
    primaryRisk: "우선 리스크",
    correlatedChange: "연관 변경",
    evidenceCoverage: "근거 커버리지",
    noLinkedChange: "연결된 변경 없음",
    allSourcesFresh: "모든 근거 최신",
    recentChanges: "최근 변경",
    knowledgeHealth: "지식 상태",
    citation: "인용",
    modelHealth: "모델 상태",
    route: "경로",
    provider: "제공자",
    latency: "지연 시간",
    fallback: "대체 경로",
    riskCount: "리스크",
    liveConsoleSync: "OpenShift 콘솔 동기화",
    liveConsoleSyncSubtitle: "원본 콘솔 대시보드에서 대응되는 실시간 신호",
    liveConnected: "실제 API",
    liveUnavailable: "API 사용 불가",
    opsLensSource: "OpsLens 리스크 출처",
    consoleSource: "원본 콘솔 출처",
    prometheusSource: "Prometheus 출처",
    sourceLiveReadonly: "실시간 읽기 전용 API",
    sourceFixture: "fixture / 데모 데이터",
    sourceUnavailable: "사용 불가",
    apiEvidence: "API 근거",
    clusterVersion: "OpenShift 버전",
    channel: "채널",
    highAvailability: "HA 모드",
    inventory: "인벤토리",
    statusCards: "상태 카드",
    activity: "활동",
    utilization: "사용량",
    notMeasured: "측정 안 됨",
    storage: "스토리지",
    routesAndServices: "라우트 / 서비스",
    decisionFlowMap: "OpsLens 판단 흐름",
    decisionFlowSubtitle:
      "원본 콘솔 신호를 운영자가 바로 판단할 수 있는 형태로 재구성",
    nativeSignals: "원본 콘솔 신호",
    opsLensCorrelation: "OpsLens 상관 분석",
    operatorDecision: "운영 판단",
    assistantHandoff: "AI 질문 연결",
    liveSignals: "실시간 신호",
    riskSignals: "리스크 신호",
    topDecision: "우선 판단",
    suggestedQuestion: "추천 질문"
  }
} as const;

const severityOrder = ["critical", "warning", "info", "success"] as const;

const severityWeights = {
  critical: 24,
  warning: 12,
  info: 4,
  success: 0
} as const;

const statusWeights = {
  firing: 8,
  investigating: 4,
  watching: 2
} as const;

const freshnessLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    fresh: "fresh",
    stale: "stale",
    missing: "missing"
  },
  ko: {
    fresh: "최신",
    stale: "오래됨",
    missing: "없음"
  }
};

function localizedLabel(
  labels: Record<UiLanguage, Record<string, string>>,
  language: UiLanguage,
  value: string
) {
  return labels[language][value] ?? value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function barStyle(value: number) {
  return { "--bar": `${clamp(value, 3, 100)}%` } as CSSProperties;
}

function parseDurationMinutes(duration: string) {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)([mhd])$/i);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "h") {
    return value * 60;
  }

  if (unit === "d") {
    return value * 24 * 60;
  }

  return value;
}

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function metricText(value: number | undefined, unit: string) {
  if (typeof value !== "number") {
    return "";
  }
  if (unit === "bytes") {
    if (value > 1024 * 1024 * 1024) {
      return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`;
    }
    if (value > 1024 * 1024) {
      return `${(value / 1024 / 1024).toFixed(1)} MiB`;
    }
  }
  if (unit === "bytes/s") {
    if (value > 1024 * 1024) {
      return `${(value / 1024 / 1024).toFixed(1)} MiB/s`;
    }
    if (value > 1024) {
      return `${(value / 1024).toFixed(1)} KiB/s`;
    }
  }
  if (unit === "cores") {
    return value.toFixed(2);
  }
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}

function utilizationWidth(value: number | undefined) {
  if (typeof value !== "number") {
    return "0%";
  }
  return `${clamp(Math.round(Math.log10(Math.max(value, 1)) * 12), 4, 100)}%`;
}

type UtilizationSeries =
  OcpConsoleOverviewResponse["consoleDashboard"]["utilization"]["series"][number];

function utilizationValues(series: UtilizationSeries) {
  return series.samples
    .flatMap((sample) =>
      sample.values?.length
        ? sample.values.map((value) => Number(value[1]))
        : sample.value
          ? [Number(sample.value[1])]
          : []
    )
    .filter((value) => Number.isFinite(value));
}

function sparklinePoints(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const width = 120;
  const height = 30;
  const xStep = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = values.length > 1 ? index * xStep : width;
      const y = height - ((value - min) / range) * 24 - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function statusSeverityClass(
  severity: OcpConsoleOverviewResponse["consoleDashboard"]["statusCards"][number]["severity"]
) {
  if (severity === "critical") {
    return "danger";
  }
  if (severity === "warning") {
    return "warning";
  }
  return "ready";
}

export function OperationsDashboard({ dashboard, language }: OperationsDashboardProps) {
  const copy = dashboardCopy[language];
  const [consoleOverview, setConsoleOverview] =
    useState<OcpConsoleOverviewResponse | null>(null);
  const [consoleOverviewError, setConsoleOverviewError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function refreshConsoleOverview() {
      try {
        const overview = await fetchOcpConsoleOverview();
        if (mounted) {
          setConsoleOverview(overview);
          setConsoleOverviewError(null);
        }
      } catch (error) {
        if (mounted) {
          setConsoleOverviewError(
            error instanceof Error ? error.message : "console overview unavailable"
          );
        }
      }
    }

    void refreshConsoleOverview();
    const refreshId = window.setInterval(() => {
      void refreshConsoleOverview();
    }, 10000);

    return () => {
      mounted = false;
      window.clearInterval(refreshId);
    };
  }, []);

  const consoleDashboard = consoleOverview?.consoleDashboard;
  const totalRisks = dashboard.activeRisks.length;
  const criticalCount = dashboard.activeRisks.filter(
    (risk) => risk.severity === "critical"
  ).length;
  const firingCount = dashboard.activeRisks.filter(
    (risk) => risk.status === "firing"
  ).length;
  const staleSources = dashboard.knowledgeSources.filter(
    (source) => source.freshness === "stale"
  ).length;
  const missingSources = dashboard.knowledgeSources.filter(
    (source) => source.freshness === "missing"
  ).length;
  const totalEvidenceRefs = dashboard.activeRisks.reduce(
    (sum, risk) => sum + risk.evidenceRefs.length,
    0
  );
  const averageBlastRadius =
    totalRisks === 0
      ? 0
      : Math.round(
          dashboard.activeRisks.reduce((sum, risk) => sum + risk.blastRadius, 0) /
            totalRisks
        );
  const riskPenalty = dashboard.activeRisks.reduce(
    (sum, risk) =>
      sum +
      severityWeights[risk.severity] +
      statusWeights[risk.status] +
      Math.round(risk.blastRadius / 12),
    0
  );
  const sourcePenalty = staleSources * 6 + missingSources * 10;
  const latencyPenalty = dashboard.modelHealth.latencyMs > 800 ? 6 : 0;
  const healthScore = clamp(
    Math.round(100 - Math.min(84, riskPenalty + sourcePenalty + latencyPenalty)),
    0,
    100
  );
  const sortedRisks = [...dashboard.activeRisks].sort(
    (a, b) =>
      severityWeights[b.severity] +
      statusWeights[b.status] +
      b.blastRadius -
      (severityWeights[a.severity] + statusWeights[a.status] + a.blastRadius)
  );
  const topRisk = sortedRisks[0];
  const linkedChanges = dashboard.recentChanges.filter((change) => change.riskLink);
  const correlatedChange = topRisk
    ? dashboard.recentChanges.find((change) => change.riskLink === topRisk.id)
    : undefined;
  const evidenceCoverage =
    totalRisks === 0 ? 100 : Math.round((totalEvidenceRefs / (totalRisks * 2)) * 100);
  const sourceLabel =
    dashboard.source === "cluster-readonly" ? copy.readonlySource : copy.mockSource;
  const opsLensSourceLabel =
    dashboard.source === "cluster-readonly"
      ? copy.sourceLiveReadonly
      : copy.sourceFixture;
  const consoleSourceLabel = consoleOverview?.status.reachable
    ? copy.sourceLiveReadonly
    : copy.sourceUnavailable;
  const prometheusSourceLabel =
    consoleDashboard?.utilization.source === "openshift-monitoring"
      ? "openshift-monitoring"
      : consoleDashboard?.utilization.source === "disabled"
        ? "disabled"
        : copy.sourceUnavailable;
  const generatedAt = new Date(dashboard.generatedAt);
  const generatedAtLabel = Number.isNaN(generatedAt.getTime())
    ? dashboard.generatedAt
    : generatedAt.toLocaleString(language === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      });
  const severityDistribution = severityOrder.map((severity) => {
    const count = dashboard.activeRisks.filter((risk) => risk.severity === severity).length;
    return {
      severity,
      count,
      percentage: totalRisks === 0 ? 0 : Math.round((count / totalRisks) * 100)
    };
  });
  const healthRingStyle = { "--score": `${healthScore}%` } as CSSProperties;
  const evidenceCoverageClamped = clamp(evidenceCoverage, 0, 100);
  const exposureBuckets = [
    {
      label: "<30m",
      count: dashboard.activeRisks.filter(
        (risk) => parseDurationMinutes(risk.duration) < 30
      ).length
    },
    {
      label: "30-60m",
      count: dashboard.activeRisks.filter((risk) => {
        const minutes = parseDurationMinutes(risk.duration);
        return minutes >= 30 && minutes <= 60;
      }).length
    },
    {
      label: ">60m",
      count: dashboard.activeRisks.filter(
        (risk) => parseDurationMinutes(risk.duration) > 60
      ).length
    }
  ];
  const consoleSignalCount =
    (consoleDashboard?.statusCards.length ?? 0) +
    (consoleDashboard?.activity.length ?? 0) +
    (consoleDashboard?.utilization.reachable
      ? consoleDashboard.utilization.series.length
      : 0);
  const riskSignalCount = totalRisks + linkedChanges.length + totalEvidenceRefs;
  const suggestedQuestion = topRisk
    ? language === "ko"
      ? `${topRisk.title}의 영향 범위와 다음 확인 순서를 정리해줘`
      : `Summarize the impact and next checks for ${topRisk.title}`
    : language === "ko"
      ? "현재 클러스터 상태를 운영 관점으로 요약해줘"
      : "Summarize the current cluster state from an operator perspective";

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{copy.breadcrumb}</p>
          <h2 id="dashboard-title">{copy.title}</h2>
        </div>
        <div className="summary-strip" aria-label={copy.summary}>
          <span>
            <AlertTriangle size={15} aria-hidden="true" />
            {criticalCount} {copy.critical}
          </span>
          <span>
            <Activity size={15} aria-hidden="true" />
            {firingCount} {copy.firing}
          </span>
          <span>
            <DatabaseZap size={15} aria-hidden="true" />
            {staleSources} {copy.staleSource}
          </span>
          <span title={generatedAtLabel}>
            <ShieldCheck size={15} aria-hidden="true" />
            {copy.snapshot}: {sourceLabel}
          </span>
          <span data-testid="opslens-dashboard-source-label">
            {copy.opsLensSource}: {opsLensSourceLabel}
          </span>
        </div>
      </div>

      <div
        className="ops-console-sync"
        data-testid="opslens-console-sync"
        aria-label={copy.liveConsoleSync}
      >
        <div className="card-title-row">
          <div>
            <h3>{copy.liveConsoleSync}</h3>
            <p>{copy.liveConsoleSyncSubtitle}</p>
          </div>
          <span
            className={`status-pill ${
              consoleOverview?.status.reachable ? "ready" : "warning"
            }`}
          >
            {consoleOverview?.status.reachable ? copy.liveConnected : copy.liveUnavailable}
          </span>
        </div>
        <div className="source-badge-row" data-testid="opslens-console-source-label">
          <span>{copy.consoleSource}: {consoleSourceLabel}</span>
          <span>{copy.prometheusSource}: {prometheusSourceLabel}</span>
          {consoleOverview?.generatedAt ? (
            <span>
              {copy.snapshot}:{" "}
              {new Date(consoleOverview.generatedAt).toLocaleTimeString(
                language === "ko" ? "ko-KR" : "en-US"
              )}
            </span>
          ) : null}
        </div>
        <div className="ops-console-sync-grid">
          <article className="ops-console-sync-facts">
            <h4>{copy.apiEvidence}</h4>
            <dl>
              <div>
                <dt>{copy.clusterVersion}</dt>
                <dd>{consoleDashboard?.details.openshiftVersion ?? "-"}</dd>
              </div>
              <div>
                <dt>{copy.channel}</dt>
                <dd>{consoleDashboard?.details.channel ?? "-"}</dd>
              </div>
              <div>
                <dt>{copy.highAvailability}</dt>
                <dd>{consoleDashboard?.details.highAvailability ?? "-"}</dd>
              </div>
              <div>
                <dt>{copy.inventory}</dt>
                <dd>
                  {numberText(consoleDashboard?.inventory.nodes)} node ·{" "}
                  {numberText(consoleDashboard?.inventory.pods)} pod
                </dd>
              </div>
              <div>
                <dt>{copy.storage}</dt>
                <dd>
                  {numberText(consoleDashboard?.inventory.storageClasses)} SC ·{" "}
                  {numberText(consoleDashboard?.inventory.persistentVolumeClaims)} PVC
                </dd>
              </div>
              <div>
                <dt>{copy.routesAndServices}</dt>
                <dd>
                  {numberText(consoleDashboard?.inventory.routes)} /{" "}
                  {numberText(consoleDashboard?.inventory.services)}
                </dd>
              </div>
            </dl>
          </article>

          <article className="ops-console-sync-status">
            <h4>{copy.statusCards}</h4>
            <div className="console-status-list">
              {(consoleDashboard?.statusCards ?? []).slice(0, 4).map((card) => (
                <div className="console-status-card" key={card.id}>
                  <span className={`status-dot ${statusSeverityClass(card.severity)}`} />
                  <div>
                    <strong>{card.title}</strong>
                    <p>{card.message}</p>
                  </div>
                </div>
              ))}
              {consoleDashboard?.statusCards.length === 0 ? (
                <p className="muted-text">{copy.decisionReady}</p>
              ) : null}
              {consoleOverviewError ? (
                <p className="muted-text">{consoleOverviewError}</p>
              ) : null}
            </div>
          </article>

          <article className="ops-console-sync-meters">
            <h4>{copy.utilization}</h4>
            {(consoleDashboard?.utilization.series ?? []).slice(0, 5).map((series) => {
              const values = utilizationValues(series);
              const points = sparklinePoints(values);

              return (
                <div
                  className={`mini-series ${
                    typeof series.latest === "number" && values.length > 0
                      ? ""
                      : "unavailable"
                  }`}
                  key={series.id}
                >
                  <span>{series.label}</span>
                  <strong>
                    {typeof series.latest === "number"
                      ? metricText(series.latest, series.unit)
                      : copy.notMeasured}
                  </strong>
                  {points ? (
                    <svg
                      aria-label={`${series.label} ${copy.utilization}`}
                      className="mini-sparkline"
                      focusable="false"
                      viewBox="0 0 120 32"
                    >
                      <polyline points={points} />
                    </svg>
                  ) : (
                    <i />
                  )}
                </div>
              );
            })}
            {!consoleDashboard?.utilization.reachable ? (
              <p className="muted-text">
                {consoleDashboard?.utilization.error ?? copy.notMeasured}
              </p>
            ) : null}
          </article>

          <article className="ops-console-sync-activity">
            <h4>{copy.activity}</h4>
            <ol>
              {(consoleDashboard?.activity ?? []).slice(0, 5).map((event) => (
                <li key={`${event.namespace ?? "cluster"}-${event.name}`}>
                  <strong>{event.reason ?? event.type ?? event.name}</strong>
                  <span>{event.message ?? event.regarding?.name ?? event.name}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>

      <section
        className="ops-decision-flow"
        data-testid="opslens-dashboard-decision-flow"
        aria-label={copy.decisionFlowMap}
      >
        <div className="card-title-row">
          <div>
            <h3>{copy.decisionFlowMap}</h3>
            <p>{copy.decisionFlowSubtitle}</p>
          </div>
          <span
            className={`status-pill ${
              consoleOverview?.status.reachable ? "ready" : "warning"
            }`}
            data-testid="opslens-dashboard-flow-source"
            data-source={consoleOverview?.status.reachable ? "live" : "unavailable"}
          >
            {consoleOverview?.status.reachable ? copy.liveConnected : copy.liveUnavailable}
          </span>
        </div>
        <div className="ops-decision-flow-grid">
          <article className="ops-flow-step">
            <Activity size={18} aria-hidden="true" />
            <span>{copy.nativeSignals}</span>
            <strong>
              {numberText(consoleSignalCount)} {copy.liveSignals}
            </strong>
            <p>
              {numberText(consoleDashboard?.inventory.nodes)} node ·{" "}
              {numberText(consoleDashboard?.inventory.pods)} pod ·{" "}
              {prometheusSourceLabel}
            </p>
          </article>
          <article className="ops-flow-step">
            <GitBranch size={18} aria-hidden="true" />
            <span>{copy.opsLensCorrelation}</span>
            <strong>
              {numberText(riskSignalCount)} {copy.riskSignals}
            </strong>
            <p>
              {totalRisks} {copy.riskCount} · {linkedChanges.length}{" "}
              {copy.linkedChanges} · {totalEvidenceRefs} {copy.evidenceRefs}
            </p>
          </article>
          <article className="ops-flow-step emphasis">
            <Gauge size={18} aria-hidden="true" />
            <span>{copy.operatorDecision}</span>
            <strong>{topRisk ? copy.needsTriage : copy.decisionReady}</strong>
            <p>{topRisk?.title ?? copy.allSourcesFresh}</p>
          </article>
          <article className="ops-flow-step">
            <TrendingUp size={18} aria-hidden="true" />
            <span>{copy.assistantHandoff}</span>
            <strong>{copy.suggestedQuestion}</strong>
            <p>{suggestedQuestion}</p>
          </article>
        </div>
      </section>

      <div
        className="ops-visual-summary"
        data-testid="opslens-visual-summary"
        aria-label={copy.visualSummary}
      >
        <article className="ops-signal-card health">
          <div className="health-ring" style={healthRingStyle}>
            <strong>{healthScore}</strong>
            <span>{copy.healthRing}</span>
          </div>
          <div>
            <h3>{copy.clusterHealth}</h3>
            <p>
              {criticalCount} {copy.critical} · {firingCount} {copy.firing} ·{" "}
              {averageBlastRadius} {copy.averageBlastRadius}
            </p>
          </div>
        </article>

        <article className="ops-signal-card mix">
          <div className="card-title-row">
            <h3>{copy.riskMix}</h3>
            <span>{totalRisks} {copy.riskCount}</span>
          </div>
          <div className="severity-stack" aria-label={copy.severityDistributionLabel}>
            {severityDistribution.map(({ severity, percentage }) => (
              <span
                className={`severity-segment ${severity}`}
                key={severity}
                style={barStyle(percentage)}
              />
            ))}
          </div>
          <div className="severity-legend">
            {severityDistribution.map(({ severity, count }) => (
              <span key={severity}>
                <i className={`severity-dot ${severity}`} />
                {severity}: {count}
              </span>
            ))}
          </div>
        </article>

        <article className="ops-signal-card flow">
          <h3>{copy.evidenceFlow}</h3>
          <ol>
            <li>
              <strong>{evidenceCoverageClamped}%</strong>
              <span>{copy.evidenceCoverage}</span>
            </li>
            <li>
              <strong>{linkedChanges.length}</strong>
              <span>{copy.linkedChanges}</span>
            </li>
            <li>
              <strong>{topRisk ? copy.needsTriage : copy.decisionReady}</strong>
              <span>{topRisk?.title ?? copy.allSourcesFresh}</span>
            </li>
          </ol>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="ops-card active-risk-card">
          <div className="card-title-row">
            <h3>{copy.activeIncidentQueue}</h3>
            <span className="status-pill danger">{copy.severitySorted}</span>
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

        <article
          className="ops-card compact-card"
          data-testid="opslens-incident-metrics"
        >
          <div className="card-title-row">
            <h3>{copy.clusterHealth}</h3>
            <span className="status-pill ready">
              <ServerCog size={14} aria-hidden="true" />
              {healthScore}/100
            </span>
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.derivedHealthScore}</dt>
              <dd>{healthScore}/100</dd>
            </div>
            <div>
              <dt>{copy.averageBlastRadius}</dt>
              <dd>{averageBlastRadius}</dd>
            </div>
            <div>
              <dt>{copy.evidenceRefs}</dt>
              <dd>{totalEvidenceRefs}</dd>
            </div>
            <div>
              <dt>{copy.operators}</dt>
              <dd>{copy.degradedOperators}</dd>
            </div>
            <div>
              <dt>{copy.nodes}</dt>
              <dd>{copy.readyNodes}</dd>
            </div>
            <div>
              <dt>{copy.workloads}</dt>
              <dd>{copy.crashloopWorkloads}</dd>
            </div>
          </dl>
        </article>

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>{copy.severityDistribution}</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <div
            className="radar-bars"
            aria-label={copy.severityDistributionLabel}
            data-testid="opslens-severity-distribution"
          >
            {severityDistribution.map(({ severity, count, percentage }) => (
              <span key={severity} style={barStyle(percentage)}>
                {severity}: {count} / {totalRisks} {copy.riskCount}
              </span>
            ))}
          </div>
        </article>

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>{copy.exposureTrend}</h3>
            <TrendingUp size={18} aria-hidden="true" />
          </div>
          <div
            className="radar-bars"
            aria-label={copy.exposureTrendLabel}
            data-testid="opslens-exposure-trend"
          >
            {exposureBuckets.map(({ label, count }) => (
              <span
                key={label}
                style={barStyle(totalRisks === 0 ? 0 : Math.round((count / totalRisks) * 100))}
              >
                {label}: {count} / {totalRisks} {copy.riskCount}
              </span>
            ))}
          </div>
        </article>

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>{copy.actionInsights}</h3>
            <ArrowUpRight size={18} aria-hidden="true" />
          </div>
          <div className="change-list">
            <div className="change-row">
              <span>{copy.primaryRisk}</span>
              <strong>{topRisk?.title ?? copy.allSourcesFresh}</strong>
              <small>{topRisk ? `${topRisk.affected} · ${topRisk.duration}` : sourceLabel}</small>
            </div>
            <div className="change-row">
              <span>{copy.correlatedChange}</span>
              <strong>{correlatedChange?.summary ?? copy.noLinkedChange}</strong>
              <small>{correlatedChange?.namespace ?? `${linkedChanges.length} ${copy.linkedChanges}`}</small>
            </div>
            <div className="change-row">
              <span>{copy.evidenceCoverage}</span>
              <strong>{clamp(evidenceCoverage, 0, 100)}%</strong>
              <small>
                {totalEvidenceRefs} {copy.evidenceRefs} · {staleSources + missingSources}{" "}
                {copy.staleSource}
              </small>
            </div>
          </div>
        </article>

        <article className="ops-card recent-card">
          <div className="card-title-row">
            <h3>{copy.recentChanges}</h3>
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
            <h3>{copy.knowledgeHealth}</h3>
            <DatabaseZap size={18} aria-hidden="true" />
          </div>
          <div className="source-list">
            {dashboard.knowledgeSources.map((source) => (
              <div className="source-row" key={source.id}>
                <span className={`freshness ${source.freshness}`}>
                  {localizedLabel(freshnessLabels, language, source.freshness)}
                </span>
                <strong>{source.name}</strong>
                <small>
                  {source.owner} · {copy.citation} {Math.round(source.citationRate * 100)}%
                </small>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-card model-card">
          <div className="card-title-row">
            <h3>{copy.modelHealth}</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>{copy.route}</dt>
              <dd>{dashboard.modelHealth.route}</dd>
            </div>
            <div>
              <dt>{copy.provider}</dt>
              <dd>{dashboard.modelHealth.provider}</dd>
            </div>
            <div>
              <dt>{copy.latency}</dt>
              <dd>{dashboard.modelHealth.latencyMs} ms</dd>
            </div>
            <div>
              <dt>{copy.fallback}</dt>
              <dd>{dashboard.modelHealth.fallback}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}
