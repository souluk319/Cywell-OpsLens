import type { CSSProperties } from "react";
import type { DashboardRisksResponse } from "@kugnus/contracts";
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
    riskCount: "risks"
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
    riskCount: "리스크"
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

export function OperationsDashboard({ dashboard, language }: OperationsDashboardProps) {
  const copy = dashboardCopy[language];
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
        </div>
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
          <div className="radar-bars" aria-label={copy.severityDistributionLabel}>
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
          <div className="radar-bars" aria-label={copy.exposureTrendLabel}>
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
