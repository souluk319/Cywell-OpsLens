import type {
  OcpEventsResponse,
  OcpPodLogsResponse,
  OcpRelatedResourcesResponse,
  OcpResourceDetailResponse,
  OcpResourceSummary
} from "@kugnus/contracts";
import {
  ExternalLink,
  FileCode2,
  GitBranch,
  ListTree,
  PlusCircle,
  ScrollText,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { stringify as stringifyYaml } from "yaml";
import type { UiLanguage } from "../i18n";
import {
  fetchOcpEvents,
  fetchOcpPodLogs,
  fetchOcpRelatedResources,
  fetchOcpResourceDetail
} from "../lib/api";
import {
  nativeConsoleHref,
  nativeObjectPath,
  nativeResourceCreatePath,
  type NativeConsoleResourceRef
} from "../lib/nativeConsole";

type NativeDetailTab = "details" | "events" | "logs" | "related" | "raw";

interface OcpNativeObjectDrilldownProps {
  language: UiLanguage;
  resource: NativeConsoleResourceRef;
  items: OcpResourceSummary[];
  title: string;
  testId: string;
}

const copy = {
  en: {
    titleSuffix: "object detail",
    empty: "No object is available for detail view.",
    openNative: "Open in OpenShift console",
    details: "Details",
    events: "Events",
    logs: "Logs",
    related: "Related",
    raw: "Raw",
    nativeActions: "Native console actions",
    kind: "Kind",
    namespace: "Namespace",
    cluster: "Cluster",
    apiVersion: "API version",
    resource: "Resource",
    created: "Created",
    uid: "UID",
    owner: "Owner",
    status: "Status",
    labels: "Labels",
    annotations: "Annotations",
    conditions: "Conditions",
    reason: "Reason",
    message: "Message",
    loading: "Loading object evidence...",
    noConditions: "No conditions returned.",
    noEvents: "No events returned for the selected object.",
    noLogs: "Pod logs are available only when the selected object is a Pod.",
    noRelated: "No related owners or child resources returned.",
    relatedOwners: "Owners",
    relatedChildren: "Owned resources",
    rawRedacted: "Sensitive fields remain redacted by the OpsLens API.",
    readOnly: "Read-only parity",
    createNewResource: "Create new in OpenShift",
    mutationBoundary: "Create, edit, delete, scale, rollout, and other mutations stay in the native OpenShift console or an approval-gated OpsLens workflow.",
    podLogsOnly: "Logs are enabled for Pod objects.",
    nativeInspection: "Inspection stays in OpsLens; mutation handoff stays native.",
    error: "Detail read failed"
  },
  ko: {
    titleSuffix: "객체 상세",
    empty: "상세 보기로 표시할 객체가 없습니다.",
    openNative: "OpenShift 원본 콘솔에서 열기",
    details: "상세",
    events: "이벤트",
    logs: "로그",
    related: "관련 리소스",
    raw: "원본",
    nativeActions: "원본 콘솔 작업",
    kind: "Kind",
    namespace: "네임스페이스",
    cluster: "클러스터",
    apiVersion: "API 버전",
    resource: "리소스",
    created: "생성",
    uid: "UID",
    owner: "소유자",
    status: "상태",
    labels: "라벨",
    annotations: "어노테이션",
    conditions: "조건",
    reason: "사유",
    message: "메시지",
    loading: "객체 근거를 불러오는 중...",
    noConditions: "반환된 조건이 없습니다.",
    noEvents: "선택 객체에 대한 이벤트가 없습니다.",
    noLogs: "Pod 로그는 선택 객체가 Pod일 때만 표시됩니다.",
    noRelated: "반환된 소유자 또는 하위 리소스가 없습니다.",
    relatedOwners: "소유자",
    relatedChildren: "소유 리소스",
    rawRedacted: "민감 필드는 OpsLens API에서 계속 마스킹합니다.",
    readOnly: "읽기 전용 매칭",
    createNewResource: "OpenShift에서 새로 만들기",
    mutationBoundary: "생성, 수정, 삭제, 스케일, 롤아웃 같은 변경 작업은 원본 OpenShift 콘솔 또는 승인 기반 OpsLens 워크플로에서 수행합니다.",
    podLogsOnly: "로그는 Pod 객체에서 활성화됩니다.",
    nativeInspection: "조회는 OpsLens에서 유지하고, 변경 작업은 원본 콘솔로 위임합니다.",
    error: "상세 조회 실패"
  }
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function compactRecord(value: unknown) {
  const entries = Object.entries(asRecord(value));
  if (!entries.length) return "-";
  return entries.slice(0, 4).map(([key, val]) => `${key}=${String(val)}`).join(", ");
}

function ownerText(item?: OcpResourceSummary) {
  return item?.metadata.ownerReferences?.map((owner) => `${owner.kind}/${owner.name}`).join(", ") || "-";
}

function statusText(item?: OcpResourceSummary) {
  const status = asRecord(item?.status);
  const phase = status.phase;
  const reason = status.reason;
  if (typeof phase === "string" && phase) return phase;
  if (typeof reason === "string" && reason) return reason;
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const bad = conditions.find((condition) => {
    const record = asRecord(condition);
    return record.status === "False" || record.status === false;
  });
  if (bad) {
    const record = asRecord(bad);
    return `${String(record.type ?? "Condition")}=False`;
  }
  return "-";
}

function conditionRows(item?: OcpResourceSummary) {
  const conditions = asRecord(item?.status).conditions;
  if (!Array.isArray(conditions)) return [];
  return conditions.map((condition) => {
    const record = asRecord(condition);
    return {
      type: String(record.type ?? "-"),
      status: String(record.status ?? "-"),
      reason: String(record.reason ?? "-"),
      message: String(record.message ?? "")
    };
  });
}

function rawText(detail: OcpResourceDetailResponse | null, item?: OcpResourceSummary) {
  const raw = detail?.raw ?? detail?.item ?? item ?? {};
  try {
    return stringifyYaml(raw);
  } catch {
    return JSON.stringify(raw, null, 2);
  }
}

function itemKey(item: OcpResourceSummary) {
  return `${item.apiVersion}/${item.kind}/${item.metadata.namespace ?? "_cluster"}/${item.metadata.name}`;
}

export function OcpNativeObjectDrilldown({
  language,
  resource,
  items,
  title,
  testId
}: OcpNativeObjectDrilldownProps) {
  const text = copy[language];
  const [selectedKey, setSelectedKey] = useState("");
  const [activeTab, setActiveTab] = useState<NativeDetailTab>("details");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<OcpResourceDetailResponse | null>(null);
  const [events, setEvents] = useState<OcpEventsResponse | null>(null);
  const [logs, setLogs] = useState<OcpPodLogsResponse | null>(null);
  const [related, setRelated] = useState<OcpRelatedResourcesResponse | null>(null);

  const selected = useMemo(() => {
    if (!items.length) return undefined;
    return items.find((item) => itemKey(item) === selectedKey) ?? items[0];
  }, [items, selectedKey]);

  useEffect(() => {
    if (!selected) {
      setSelectedKey("");
      return;
    }
    if (!selectedKey || !items.some((item) => itemKey(item) === selectedKey)) {
      setSelectedKey(itemKey(selected));
    }
  }, [items, selected, selectedKey]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setEvents(null);
      setLogs(null);
      setRelated(null);
      return;
    }

    const current = selected;
    let active = true;
    async function loadSelectedEvidence() {
      setLoading(true);
      setError("");
      setLogs(null);

      try {
        const [nextDetail, nextEvents, nextRelated] = await Promise.all([
          fetchOcpResourceDetail({
            apiVersion: resource.apiVersion,
            resource: resource.resource,
            namespace: current.metadata.namespace,
            name: current.metadata.name,
            full: true
          }),
          fetchOcpEvents({
            apiVersion: current.apiVersion,
            kind: current.kind,
            namespace: current.metadata.namespace,
            name: current.metadata.name,
            uid: current.metadata.uid,
            limit: 20
          }),
          fetchOcpRelatedResources({
            apiVersion: resource.apiVersion,
            resource: resource.resource,
            namespace: current.metadata.namespace,
            name: current.metadata.name
          })
        ]);

        if (!active) return;
        setDetail(nextDetail);
        setEvents(nextEvents);
        setRelated(nextRelated);

        if (current.kind === "Pod" && current.metadata.namespace) {
          try {
            const nextLogs = await fetchOcpPodLogs({
              namespace: current.metadata.namespace,
              pod: current.metadata.name,
              tailLines: 120
            });
            if (active) setLogs(nextLogs);
          } catch {
            if (active) setLogs(null);
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setDetail(null);
        setEvents(null);
        setRelated(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSelectedEvidence();
    return () => {
      active = false;
    };
  }, [resource.apiVersion, resource.resource, selected]);

  if (!selected) {
    return (
      <article className="native-drilldown-panel" data-testid={`${testId}-drilldown`}>
        <div className="card-title-row">
          <h3>{title} {text.titleSuffix}</h3>
          <ListTree size={18} aria-hidden="true" />
        </div>
        <p className="empty-state">{text.empty}</p>
      </article>
    );
  }

  const selectedDetailItem = detail?.item ?? selected;
  const nativeHref = nativeConsoleHref(nativeObjectPath(resource, selected));
  const nativeCreateHref = selected.metadata.namespace
    ? nativeConsoleHref(nativeResourceCreatePath(resource, selected.metadata.namespace))
    : "";
  const conditions = conditionRows(selectedDetailItem);

  return (
    <article className="native-drilldown-panel" data-testid={`${testId}-drilldown`}>
      <div className="native-drilldown-header">
        <div>
          <p className="eyebrow">{text.readOnly}</p>
          <h3>{title} {text.titleSuffix}</h3>
        </div>
        <a className="text-icon-button" href={nativeHref} target="_blank" rel="noreferrer" data-testid={`${testId}-native-link`}>
          <ExternalLink size={15} aria-hidden="true" />
          {text.openNative}
        </a>
      </div>

      <div className="native-drilldown-layout">
        <aside className="native-drilldown-list" aria-label={`${title} object list`}>
          {items.slice(0, 30).map((item) => (
            <button
              key={itemKey(item)}
              type="button"
              className={itemKey(item) === itemKey(selected) ? "selected" : ""}
              onClick={() => setSelectedKey(itemKey(item))}
            >
              <strong>{item.metadata.name}</strong>
              <span>{item.metadata.namespace ?? text.cluster} / {statusText(item)}</span>
            </button>
          ))}
        </aside>

        <section className="native-drilldown-detail">
          <div className="native-action-rail" data-testid={`${testId}-action-rail`}>
            <div>
              <strong>{text.nativeActions}</strong>
              <span>{text.nativeInspection}</span>
            </div>
            <div className="native-action-rail-buttons">
              <a
                className="native-action-button primary"
                href={nativeHref}
                target="_blank"
                rel="noreferrer"
                data-testid={`${testId}-native-object-action`}
              >
                <ExternalLink size={15} aria-hidden="true" />
                {text.openNative}
              </a>
              {nativeCreateHref ? (
                <a
                  className="native-action-button"
                  href={nativeCreateHref}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`${testId}-native-create-link`}
                >
                  <PlusCircle size={15} aria-hidden="true" />
                  {text.createNewResource}
                </a>
              ) : null}
              <button
                className="native-action-button"
                type="button"
                onClick={() => setActiveTab("raw")}
                data-testid={`${testId}-yaml-action`}
              >
                <FileCode2 size={15} aria-hidden="true" />
                {text.raw}
              </button>
              <button
                className="native-action-button"
                type="button"
                onClick={() => setActiveTab("events")}
                data-testid={`${testId}-events-action`}
              >
                <ScrollText size={15} aria-hidden="true" />
                {text.events}
              </button>
              <button
                className="native-action-button"
                type="button"
                disabled={selected.kind !== "Pod"}
                title={selected.kind !== "Pod" ? text.podLogsOnly : undefined}
                onClick={() => setActiveTab("logs")}
                data-testid={`${testId}-logs-action`}
              >
                <TerminalSquare size={15} aria-hidden="true" />
                {text.logs}
              </button>
              <button
                className="native-action-button"
                type="button"
                onClick={() => setActiveTab("related")}
                data-testid={`${testId}-related-action`}
              >
                <GitBranch size={15} aria-hidden="true" />
                {text.related}
              </button>
            </div>
            <p>{text.mutationBoundary}</p>
          </div>

          <div className="native-detail-tabs" data-testid={`${testId}-detail-tabs`}>
            {(["details", "events", "logs", "related", "raw"] as const).map((tab) => {
              const icons = {
                details: <ListTree size={15} aria-hidden="true" />,
                events: <ScrollText size={15} aria-hidden="true" />,
                logs: <TerminalSquare size={15} aria-hidden="true" />,
                related: <GitBranch size={15} aria-hidden="true" />,
                raw: <FileCode2 size={15} aria-hidden="true" />
              };
              return (
                <button
                  key={tab}
                  type="button"
                  className={activeTab === tab ? "active" : ""}
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  data-testid={`${testId}-${tab}-tab`}
                >
                  {icons[tab]}
                  {text[tab]}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="ocp-error" data-testid={`${testId}-detail-error`}>
              <span>{text.error}: {error}</span>
            </div>
          ) : null}

          {activeTab === "details" ? (
            <div className="native-object-detail-grid" data-testid={`${testId}-details`}>
              <section className="native-object-summary-card">
                <strong>{selected.kind}/{selected.metadata.name}</strong>
                <dl>
                  <div><dt>{text.kind}</dt><dd>{selected.kind}</dd></div>
                  <div><dt>{text.namespace}</dt><dd>{selected.metadata.namespace ?? text.cluster}</dd></div>
                  <div><dt>{text.apiVersion}</dt><dd>{selected.apiVersion}</dd></div>
                  <div><dt>{text.resource}</dt><dd>{resource.resource}</dd></div>
                  <div><dt>{text.created}</dt><dd>{selected.metadata.creationTimestamp ?? "-"}</dd></div>
                  <div><dt>{text.uid}</dt><dd>{selected.metadata.uid ?? "-"}</dd></div>
                </dl>
              </section>

              <section className="native-object-summary-card">
                <strong>{text.status}</strong>
                <dl>
                  <div><dt>{text.status}</dt><dd>{statusText(selectedDetailItem)}</dd></div>
                  <div><dt>{text.owner}</dt><dd>{ownerText(selectedDetailItem)}</dd></div>
                  <div><dt>{text.labels}</dt><dd>{compactRecord(selectedDetailItem.metadata.labels)}</dd></div>
                  <div><dt>{text.annotations}</dt><dd>{compactRecord(selectedDetailItem.metadata.annotations)}</dd></div>
                </dl>
              </section>

              <section className="native-object-summary-card conditions">
                <strong>{text.conditions}</strong>
                {loading ? <p>{text.loading}</p> : null}
                {!loading && conditions.length ? (
                  <table className="native-condition-table">
                    <thead>
                      <tr>
                        <th>{text.kind}</th>
                        <th>{text.status}</th>
                        <th>{text.reason}</th>
                        <th>{text.message}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conditions.map((condition) => (
                        <tr key={`${condition.type}/${condition.reason}/${condition.status}`}>
                          <td>{condition.type}</td>
                          <td>{condition.status}</td>
                          <td>{condition.reason}</td>
                          <td>{condition.message || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {!loading && !conditions.length ? <p>{text.noConditions}</p> : null}
              </section>
            </div>
          ) : null}

          {activeTab === "events" ? (
            <div className="event-list" data-testid={`${testId}-events`}>
              {loading ? <p>{text.loading}</p> : null}
              {!loading && events?.items.length ? events.items.map((event) => (
                <div className="event-row" key={`${event.namespace}/${event.name}/${event.lastTimestamp ?? ""}`}>
                  <strong>{event.reason ?? event.type ?? "-"}</strong>
                  <span>{event.lastTimestamp ?? event.firstTimestamp ?? "-"}</span>
                  <p>{event.message ?? "-"}</p>
                </div>
              )) : null}
              {!loading && (!events || events.items.length === 0) ? <p>{text.noEvents}</p> : null}
            </div>
          ) : null}

          {activeTab === "logs" ? (
            <pre className="log-viewport compact" data-testid={`${testId}-logs`}>
              {loading ? text.loading : logs?.logs || text.noLogs}
            </pre>
          ) : null}

          {activeTab === "related" ? (
            <div className="related-resources" data-testid={`${testId}-related`}>
              {loading ? <p>{text.loading}</p> : null}
              {!loading && related ? (
                <>
                  <div>
                    <strong>{text.relatedOwners}</strong>
                    {related.owners.length ? related.owners.map((owner) => (
                      <p key={`${owner.uid ?? owner.kind}/${owner.name}`}>{owner.kind}/{owner.name}</p>
                    )) : <p>{text.noRelated}</p>}
                  </div>
                  <div>
                    <strong>{text.relatedChildren}</strong>
                    {related.children.length ? related.children.map((child) => (
                      <p key={`${child.resource.apiVersion}/${child.resource.name}/${child.item.metadata.name}`}>
                        {child.item.kind}/{child.item.metadata.name}
                      </p>
                    )) : <p>{text.noRelated}</p>}
                  </div>
                </>
              ) : null}
              {!loading && !related ? <p>{text.noRelated}</p> : null}
            </div>
          ) : null}

          {activeTab === "raw" ? (
            <>
              <p className="native-drilldown-redaction">{text.rawRedacted}</p>
              <pre className="object-json compact" data-testid={`${testId}-raw`}>
                {loading ? text.loading : rawText(detail, selected)}
              </pre>
            </>
          ) : null}
        </section>
      </div>
    </article>
  );
}
