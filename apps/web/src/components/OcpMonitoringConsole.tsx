import type { OcpConsoleOverviewResponse } from "@kugnus/contracts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  FileText,
  ListFilter,
  RefreshCw,
  Search
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchOcpConsoleOverview } from "../lib/api";
import type { UiLanguage } from "../i18n";

export type OcpMonitoringView = "alerting" | "dashboards" | "metrics" | "logs";

interface OcpMonitoringConsoleProps {
  language: UiLanguage;
  view: OcpMonitoringView;
}

const monitoringCopy = {
  en: {
    eyebrow: "Observe",
    title: "OpenShift Monitoring",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    alerting: "Alerting",
    dashboards: "Dashboards",
    metrics: "Metrics",
    logs: "Logs",
    state: "State",
    severity: "Severity",
    source: "Source",
    namespace: "Namespace",
    alertName: "Alert name",
    message: "Message",
    timeRange: "1 hour",
    timeRangeLabel: "Time range",
    searchPlaceholder: "Filter alerts, metrics, or events...",
    allSeverities: "All severities",
    allSources: "All sources",
    results: "Results",
    dashboard: "Dashboard",
    platformDashboard: "Cluster utilization",
    queryBrowser: "Query browser",
    expression: "Expression",
    samples: "samples",
    latest: "latest",
    noAlerts: "No live firing alerts were returned.",
    noActivity: "No recent log-style activity was returned.",
    logsBoundary:
      "Cluster logging is not assumed. This surface shows read-only event activity and links Pod logs through workload details when RBAC allows.",
    monitoringUnavailable:
      "Prometheus is unavailable or the monitoring proxy is disabled. The surface stays explicit instead of drawing fake charts.",
    eventStream: "Event stream",
    reason: "Reason",
    involvedObject: "Involved object",
    count: "Count",
    normal: "Normal",
    warning: "Warning"
  },
  ko: {
    eyebrow: "Observe",
    title: "OpenShift 모니터링",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    alerting: "경고",
    dashboards: "대시보드",
    metrics: "메트릭",
    logs: "로그",
    state: "상태",
    severity: "심각도",
    source: "출처",
    namespace: "네임스페이스",
    alertName: "경고 이름",
    message: "메시지",
    timeRange: "1시간",
    timeRangeLabel: "시간 범위",
    searchPlaceholder: "경고, 메트릭, 이벤트 필터...",
    allSeverities: "모든 심각도",
    allSources: "모든 소스",
    results: "결과",
    dashboard: "대시보드",
    platformDashboard: "클러스터 사용량",
    queryBrowser: "쿼리 브라우저",
    expression: "표현식",
    samples: "샘플",
    latest: "최신",
    noAlerts: "실시간 발생 경고가 반환되지 않았습니다.",
    noActivity: "최근 로그형 활동이 반환되지 않았습니다.",
    logsBoundary:
      "클러스터 로깅이 있다고 가정하지 않습니다. 이 화면은 읽기 전용 이벤트 활동을 보여주고, RBAC가 허용하면 워크로드 상세에서 Pod 로그로 연결합니다.",
    monitoringUnavailable:
      "Prometheus를 사용할 수 없거나 monitoring proxy가 비활성 상태입니다. 가짜 차트를 그리지 않고 상태를 명시합니다.",
    eventStream: "이벤트 스트림",
    reason: "이유",
    involvedObject: "관련 객체",
    count: "횟수",
    normal: "Normal",
    warning: "Warning"
  }
} as const;

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function dateTimeText(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function prometheusSampleNumber(sample: {
  value?: [number, string];
  values?: Array<[number, string]>;
}) {
  const raw = sample.value?.[1] ?? sample.values?.at(-1)?.[1];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function barStyle(value: number) {
  return { "--bar": `${Math.max(4, Math.min(100, value))}%` } as CSSProperties;
}

function viewTestId(view: OcpMonitoringView) {
  return `ocp-monitoring-${view}`;
}

export function OcpMonitoringConsole({ language, view }: OcpMonitoringConsoleProps) {
  const copy = monitoringCopy[language];
  const [overview, setOverview] = useState<OcpConsoleOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryIndex, setQueryIndex] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeRangeMinutes, setTimeRangeMinutes] = useState(60);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    setError(null);
    try {
      setOverview(await fetchOcpConsoleOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "monitoring overview failed");
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const refreshId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 10000);
    return () => window.clearInterval(refreshId);
  }, []);

  const utilization = overview?.consoleDashboard.utilization;
  const series = utilization?.series ?? [];
  const statusCards = overview?.consoleDashboard.statusCards ?? [];
  const alertRows = useMemo(() => {
    const sampleRows = (overview?.monitoring.sample ?? []).map((alert, index) => ({
      id: `sample-${alert.alertname}-${index}`,
      name: alert.alertname,
      severity: alert.severity ?? "warning",
      namespace: alert.namespace ?? "-",
      state: alert.state ?? "firing",
      message: alert.alertname,
      source: "Prometheus"
    }));
    const statusRows = statusCards
      .filter((card) => card.source === "monitoring")
      .map((card) => ({
        id: card.id,
        name: card.title,
        severity: card.severity,
        namespace: "-",
        state: "firing",
        message: card.message,
        source: card.source
      }));
    return [...sampleRows, ...statusRows];
  }, [overview?.monitoring.sample, statusCards]);

  const activity = overview?.consoleDashboard.activity ?? [];
  const query = filterText.trim().toLowerCase();
  const severityOptions = useMemo(
    () => uniqueSorted([...alertRows.map((alert) => alert.severity), ...activity.map((event) => event.type)]),
    [activity, alertRows]
  );
  const sourceOptions = useMemo(
    () => uniqueSorted([...alertRows.map((alert) => alert.source), utilization?.source]),
    [alertRows, utilization?.source]
  );
  const filteredAlerts = useMemo(
    () =>
      alertRows.filter((alert) => {
        if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
        if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
        if (!query) return true;
        return [alert.name, alert.severity, alert.namespace, alert.state, alert.source, alert.message]
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [alertRows, query, severityFilter, sourceFilter]
  );
  const filteredSeries = useMemo(
    () =>
      series.filter((item) => {
        if (sourceFilter !== "all" && utilization?.source !== sourceFilter) return false;
        if (!query) return true;
        return [item.label, item.query, item.unit, item.error]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [query, series, sourceFilter, utilization?.source]
  );
  const filteredActivity = useMemo(() => {
    const now = Date.now();
    const oldest = now - timeRangeMinutes * 60_000;
    return activity.filter((event) => {
      const timestamp = new Date(event.lastTimestamp ?? event.firstTimestamp ?? 0).getTime();
      if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < oldest) return false;
      if (severityFilter !== "all" && event.type !== severityFilter) return false;
      if (!query) return true;
      return [event.type, event.reason, event.message, event.namespace, event.name, event.regarding?.kind, event.regarding?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [activity, query, severityFilter, timeRangeMinutes]);
  const selectedSeries = filteredSeries[Math.min(queryIndex, Math.max(filteredSeries.length - 1, 0))];
  const resultCount =
    view === "alerting"
      ? filteredAlerts.length
      : view === "logs"
        ? filteredActivity.length
        : filteredSeries.length;

  return (
    <section
      className="ocp-monitoring-console"
      data-testid={viewTestId(view)}
      aria-labelledby="ocp-monitoring-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-monitoring-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-monitoring-toolbar" data-testid="ocp-monitoring-toolbar">
        <span className={`status-pill ${overview?.status.reachable ? "ready" : "danger"}`}>
          {loading ? copy.loading : overview?.status.reachable ? copy.live : copy.unavailable}
        </span>
        <span>{copy.source}: {utilization?.source ?? "unknown"}</span>
        <label>
          <Search size={14} aria-hidden="true" />
          <input
            aria-label={copy.searchPlaceholder}
            data-testid="ocp-monitoring-query-input"
            value={filterText}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => {
              setFilterText(event.currentTarget.value);
              setQueryIndex(0);
            }}
          />
        </label>
        <select
          aria-label={copy.timeRangeLabel}
          value={timeRangeMinutes}
          onChange={(event) => setTimeRangeMinutes(Number(event.currentTarget.value))}
        >
          <option value={15}>15m</option>
          <option value={60}>{copy.timeRange}</option>
          <option value={360}>6h</option>
          <option value={1440}>24h</option>
        </select>
        <select
          aria-label={copy.severity}
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.currentTarget.value)}
        >
          <option value="all">{copy.allSeverities}</option>
          {severityOptions.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        <select
          aria-label={copy.source}
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.currentTarget.value)}
        >
          <option value="all">{copy.allSources}</option>
          {sourceOptions.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        <span className="native-toolbar-count" data-testid="ocp-monitoring-filter-count">
          <ListFilter size={14} aria-hidden="true" />
          {copy.results}: {resultCount}
        </span>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-monitoring-error">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <nav className="ocp-monitoring-tabs" aria-label={copy.title}>
        {(["alerting", "dashboards", "metrics", "logs"] as const).map((tab) => (
          <a
            key={tab}
            href={`#${viewTestId(tab)}`}
            aria-current={view === tab ? "page" : undefined}
          >
            {copy[tab]}
          </a>
        ))}
      </nav>

      {view === "alerting" ? (
        <article className="monitoring-native-panel">
          <div className="card-title-row">
            <h3>{copy.alerting}</h3>
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <div className="native-monitoring-table-wrap">
            {filteredAlerts.length > 0 ? (
              <table className="native-monitoring-table" data-testid="ocp-monitoring-alert-table">
                <thead>
                  <tr>
                    <th>{copy.alertName}</th>
                    <th>{copy.severity}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.state}</th>
                    <th>{copy.source}</th>
                    <th>{copy.message}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td><strong>{alert.name}</strong></td>
                      <td><span className={`severity-chip ${alert.severity}`}>{alert.severity}</span></td>
                      <td>{alert.namespace}</td>
                      <td>{alert.state}</td>
                      <td>{alert.source}</td>
                      <td>{alert.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">{copy.noAlerts}</p>
            )}
          </div>
        </article>
      ) : null}

      {view === "dashboards" ? (
        <article className="monitoring-native-panel">
          <div className="card-title-row">
            <div>
              <h3>{copy.dashboards}</h3>
              <p>{copy.dashboard}: {copy.platformDashboard}</p>
            </div>
            <BarChart3 size={18} aria-hidden="true" />
          </div>
          {!utilization?.reachable ? (
            <p className="muted-warning">{utilization?.error ?? copy.monitoringUnavailable}</p>
          ) : null}
          <div className="monitoring-dashboard-grid" data-testid="ocp-monitoring-dashboard-grid">
            {filteredSeries.map((item) => {
              const values = item.samples
                .map((sample) => prometheusSampleNumber(sample))
                .filter((value): value is number => value !== null);
              const max = Math.max(1, ...values);
              return (
                <button
                  type="button"
                  className="monitoring-dashboard-card"
                  key={item.id}
                  onClick={() => setQueryIndex(filteredSeries.indexOf(item))}
                >
                  <strong>{item.label}</strong>
                  <span>{copy.latest}: {typeof item.latest === "number" ? `${item.latest.toLocaleString()} ${item.unit}` : "-"}</span>
                  <div className="monitoring-mini-chart">
                    {values.length > 0 ? (
                      values.slice(-24).map((value, index) => (
                        <i key={`${item.id}-${index}`} style={barStyle(Math.round((value / max) * 100))} />
                      ))
                    ) : (
                      <em>{item.error ?? copy.monitoringUnavailable}</em>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </article>
      ) : null}

      {view === "metrics" ? (
        <article className="monitoring-native-panel">
          <div className="card-title-row">
            <div>
              <h3>{copy.queryBrowser}</h3>
              <p>{copy.samples}: {numberText(selectedSeries?.samples.length)}</p>
            </div>
            <Activity size={18} aria-hidden="true" />
          </div>
          <div className="monitoring-query-layout" data-testid="ocp-monitoring-query-browser">
            <div className="monitoring-query-list">
              {filteredSeries.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={queryIndex === index}
                  onClick={() => setQueryIndex(index)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.query}</span>
                </button>
              ))}
            </div>
            <pre className="monitoring-query-output">
              {selectedSeries
                ? JSON.stringify(
                    {
                      query: selectedSeries.query,
                      latest: selectedSeries.latest,
                      unit: selectedSeries.unit,
                      samples: selectedSeries.samples.length,
                      error: selectedSeries.error
                    },
                    null,
                    2
                  )
                : copy.monitoringUnavailable}
            </pre>
          </div>
        </article>
      ) : null}

      {view === "logs" ? (
        <article className="monitoring-native-panel">
          <div className="card-title-row">
            <div>
              <h3>{copy.logs}</h3>
              <p>{copy.logsBoundary}</p>
            </div>
            <FileText size={18} aria-hidden="true" />
          </div>
          <div className="monitoring-log-stream" data-testid="ocp-monitoring-log-stream">
            {filteredActivity.length > 0 ? (
              filteredActivity.slice(0, 16).map((event) => (
                <div className="monitoring-log-line" key={`${event.namespace ?? "cluster"}-${event.name}`}>
                  <Clock3 size={14} aria-hidden="true" />
                  <span>{dateTimeText(event.lastTimestamp ?? event.firstTimestamp)}</span>
                  <strong className={event.type === "Warning" ? "warning" : "normal"}>
                    {event.type === "Warning" ? copy.warning : copy.normal}
                  </strong>
                  <code>{event.reason ?? event.name}</code>
                  <p>{event.message ?? `${copy.involvedObject}: ${event.regarding?.kind ?? "-"} ${event.regarding?.name ?? "-"}`}</p>
                  <em>{copy.count}: {numberText(event.count)}</em>
                </div>
              ))
            ) : (
              <p className="empty-state">{copy.noActivity}</p>
            )}
          </div>
        </article>
      ) : null}
    </section>
  );
}
