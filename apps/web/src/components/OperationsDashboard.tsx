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
    activeIncidentQueue: "Active Incident Queue",
    severitySorted: "severity sorted",
    clusterHealth: "Cluster Health",
    operators: "Operators",
    degradedOperators: "2 degraded",
    nodes: "Nodes",
    readyNodes: "12 ready",
    workloads: "Workloads",
    crashloopWorkloads: "4 crashloop",
    riskRadar: "Risk Radar",
    riskRadarLabel: "Risk radar",
    recentChanges: "Recent Changes",
    knowledgeHealth: "Knowledge Health",
    citation: "citation",
    modelHealth: "Model Health",
    route: "Route",
    provider: "Provider",
    latency: "Latency",
    riskUpgrade: "upgrade",
    riskCrashLoop: "crashloop",
    riskStorage: "storage"
  },
  ko: {
    breadcrumb: "관리자 / 관측 / Cywell OpsLens",
    title: "운영 대시보드",
    summary: "클러스터 요약",
    critical: "긴급",
    firing: "발생 중",
    staleSource: "오래된 근거",
    activeIncidentQueue: "활성 장애 대기열",
    severitySorted: "심각도순",
    clusterHealth: "클러스터 상태",
    operators: "Operator",
    degradedOperators: "2개 성능 저하",
    nodes: "노드",
    readyNodes: "12개 정상",
    workloads: "워크로드",
    crashloopWorkloads: "4개 CrashLoop",
    riskRadar: "리스크 레이더",
    riskRadarLabel: "리스크 레이더",
    recentChanges: "최근 변경",
    knowledgeHealth: "지식 상태",
    citation: "인용",
    modelHealth: "모델 상태",
    route: "경로",
    provider: "제공자",
    latency: "지연 시간",
    riskUpgrade: "업그레이드",
    riskCrashLoop: "CrashLoop",
    riskStorage: "스토리지"
  }
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

export function OperationsDashboard({ dashboard, language }: OperationsDashboardProps) {
  const copy = dashboardCopy[language];
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

        <article className="ops-card compact-card">
          <div className="card-title-row">
            <h3>{copy.clusterHealth}</h3>
            <ServerCog size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
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
            <h3>{copy.riskRadar}</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <div className="radar-bars" aria-label={copy.riskRadarLabel}>
            <span style={{ "--bar": "78%" } as CSSProperties}>
              {copy.riskUpgrade}
            </span>
            <span style={{ "--bar": "61%" } as CSSProperties}>
              {copy.riskCrashLoop}
            </span>
            <span style={{ "--bar": "44%" } as CSSProperties}>
              {copy.riskStorage}
            </span>
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
          </dl>
        </article>
      </div>
    </section>
  );
}
