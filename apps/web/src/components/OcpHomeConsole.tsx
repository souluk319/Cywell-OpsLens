import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  Clock3,
  FileSearch,
  FolderKanban,
  ListFilter,
  RefreshCw,
  Search,
  ServerCog,
  TableProperties
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import { nativeConsoleHref } from "../lib/nativeConsole";
import { NativeObjectLink } from "./NativeObjectLink";
import { OcpNativeObjectDrilldown } from "./OcpNativeObjectDrilldown";

export type OcpHomeView = "search" | "projects" | "api-explorer" | "events";

interface OcpHomeConsoleProps {
  language: UiLanguage;
  view: OcpHomeView;
}

interface ResourceState {
  projects?: OcpResourceListResponse;
  namespaces?: OcpResourceListResponse;
  pods?: OcpResourceListResponse;
  deployments?: OcpResourceListResponse;
  services?: OcpResourceListResponse;
  routes?: OcpResourceListResponse;
  roleBindings?: OcpResourceListResponse;
  crds?: OcpResourceListResponse;
  apiServices?: OcpResourceListResponse;
  events?: OcpResourceListResponse;
}

const homeCopy = {
  en: {
    eyebrow: "Home",
    title: "OpenShift Home",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    search: "Search",
    projects: "Projects",
    "api-explorer": "API Explorer",
    events: "Events",
    filter: "Filter by name, namespace, kind, or message...",
    kind: "Kind",
    allKinds: "All kinds",
    namespace: "Namespace",
    allNamespaces: "All namespaces",
    source: "Source",
    allSources: "All sources",
    results: "Results",
    nativeOpen: "Open in native console",
    name: "Name",
    status: "Status",
    detail: "Detail",
    age: "Age",
    noRows: "No matching resources were returned.",
    searchBoundary:
      "Search keeps the native console behavior: discover listable resources, inspect safe details, and keep create/edit/delete in the native console.",
    projectsBoundary:
      "Projects show Project and Namespace evidence with workload and RBAC signals so tenant context is not reduced to a generic object dump.",
    apiBoundary:
      "API Explorer shows API surface evidence, CRDs, and APIService availability while keeping failed reads explicit.",
    eventsBoundary:
      "Events show event stream evidence with involved-object context and keep it available for assistant triage."
  },
  ko: {
    eyebrow: "홈",
    title: "OpenShift 홈",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    search: "검색",
    projects: "프로젝트",
    "api-explorer": "API 탐색기",
    events: "이벤트",
    filter: "이름, 네임스페이스, 종류, 메시지 필터...",
    kind: "종류",
    allKinds: "모든 종류",
    namespace: "네임스페이스",
    allNamespaces: "모든 네임스페이스",
    source: "출처",
    allSources: "모든 출처",
    results: "결과",
    nativeOpen: "원본 콘솔에서 열기",
    name: "이름",
    status: "상태",
    detail: "상세",
    age: "나이",
    noRows: "일치하는 리소스가 반환되지 않았습니다.",
    searchBoundary:
      "검색은 원본 콘솔 동작을 유지합니다. 조회 가능한 리소스를 찾고 안전한 상세를 확인하며 생성/수정/삭제는 원본 콘솔로 넘깁니다.",
    projectsBoundary:
      "프로젝트는 Project와 Namespace 근거에 워크로드/RBAC 신호를 붙여 테넌트 맥락이 단순 객체 덤프로 줄어들지 않게 합니다.",
    apiBoundary:
      "API 탐색기는 API 표면, CRD, APIService 가용성 근거를 보여주고 실패한 조회를 명시합니다.",
    eventsBoundary:
      "이벤트는 관련 객체 맥락이 있는 이벤트 스트림 근거를 보여주며 어시스턴트 triage 근거로 유지합니다."
  }
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function numberField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function listItems(...responses: Array<OcpResourceListResponse | undefined>) {
  return responses.flatMap((response) => response?.items ?? []);
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function ageText(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function itemKey(item: OcpResourceSummary) {
  return `${item.kind}/${item.metadata.namespace ?? "cluster"}/${item.metadata.name}`;
}

function resourceForHomeItem(item: OcpResourceSummary) {
  switch (item.kind) {
    case "Project":
      return { apiVersion: "project.openshift.io/v1", resource: "projects", kind: item.kind };
    case "Namespace":
      return { apiVersion: "v1", resource: "namespaces", kind: item.kind };
    case "Pod":
      return { apiVersion: "v1", resource: "pods", kind: item.kind };
    case "Deployment":
      return { apiVersion: "apps/v1", resource: "deployments", kind: item.kind };
    case "Service":
      return { apiVersion: "v1", resource: "services", kind: item.kind };
    case "Route":
      return { apiVersion: "route.openshift.io/v1", resource: "routes", kind: item.kind };
    case "RoleBinding":
      return { apiVersion: "rbac.authorization.k8s.io/v1", resource: "rolebindings", kind: item.kind };
    case "CustomResourceDefinition":
      return { apiVersion: "apiextensions.k8s.io/v1", resource: "customresourcedefinitions", kind: item.kind };
    case "APIService":
      return { apiVersion: "apiregistration.k8s.io/v1", resource: "apiservices", kind: item.kind };
    case "Event":
      return { apiVersion: item.apiVersion || "events.k8s.io/v1", resource: "events", kind: item.kind };
    default:
      return { apiVersion: item.apiVersion || "v1", resource: item.kind.toLowerCase(), kind: item.kind };
  }
}

function itemStatus(item: OcpResourceSummary) {
  if (item.kind === "Project" || item.kind === "Namespace") {
    return stringField(item.status, "phase") ?? "-";
  }
  if (item.kind === "Pod") {
    return stringField(item.status, "phase") ?? "-";
  }
  if (item.kind === "Deployment") {
    const desired = numberField(item.spec, "replicas") ?? 0;
    const available = numberField(item.status, "availableReplicas") ?? 0;
    return `${available}/${desired}`;
  }
  if (item.kind === "APIService") {
    const statusConditions = asRecord(item.status).conditions;
    const conditions = Array.isArray(statusConditions) ? statusConditions : [];
    const available = conditions.map(asRecord).find((condition) => condition.type === "Available");
    return stringField(available, "status") === "True" ? "Available" : "Check";
  }
  if (item.kind === "Event") {
    return stringField(item, "type") ?? stringField(item.spec, "type") ?? stringField(item.status, "type") ?? "-";
  }
  return "-";
}

function itemDetail(item: OcpResourceSummary) {
  if (item.kind === "Project" || item.kind === "Namespace") {
    const labels = Object.keys(item.metadata.labels ?? {}).length;
    return `${labels} labels`;
  }
  if (item.kind === "Pod") {
    return stringField(item.spec, "nodeName") ?? "-";
  }
  if (item.kind === "Deployment") {
    return `replicas ${numberField(item.spec, "replicas") ?? 0}`;
  }
  if (item.kind === "Service") {
    return stringField(item.spec, "type") ?? "-";
  }
  if (item.kind === "Route") {
    return stringField(item.spec, "host") ?? "-";
  }
  if (item.kind === "RoleBinding") {
    return stringField(asRecord(asRecord(item).roleRef), "name") ?? "-";
  }
  if (item.kind === "CustomResourceDefinition") {
    return stringField(item.spec, "scope") ?? "-";
  }
  if (item.kind === "APIService") {
    const service = asRecord(asRecord(item.spec).service);
    return stringField(service, "name") ?? stringField(item.spec, "group") ?? "-";
  }
  if (item.kind === "Event") {
    return stringField(item, "reason") ?? stringField(item, "message") ?? "-";
  }
  return "-";
}

function searchTerms(item: OcpResourceSummary) {
  return [
    item.kind,
    item.metadata.name,
    item.metadata.namespace,
    itemStatus(item),
    itemDetail(item),
    stringField(item, "message"),
    stringField(item, "reason")
  ]
    .filter((term): term is string => Boolean(term))
    .join(" ")
    .toLowerCase();
}

function viewBoundary(copy: (typeof homeCopy)[UiLanguage], view: OcpHomeView) {
  if (view === "projects") return copy.projectsBoundary;
  if (view === "api-explorer") return copy.apiBoundary;
  if (view === "events") return copy.eventsBoundary;
  return copy.searchBoundary;
}

function statusReachable(...responses: Array<OcpResourceListResponse | undefined>) {
  return responses.some((response) => response && !response.failure);
}

export function OcpHomeConsole({ language, view }: OcpHomeConsoleProps) {
  const copy = homeCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [namespaceFilter, setNamespaceFilter] = useState("all");
  const [selectedName, setSelectedName] = useState("");

  async function load() {
    setLoading(true);
    const [
      projects,
      namespaces,
      pods,
      deployments,
      services,
      routes,
      roleBindings,
      crds,
      apiServices,
      events
    ] = await Promise.all([
      fetchOcpResourceList({ apiVersion: "project.openshift.io/v1", resource: "projects", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "v1", resource: "namespaces", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "v1", resource: "pods", limit: 50, full: false }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "apps/v1", resource: "deployments", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "v1", resource: "services", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "route.openshift.io/v1", resource: "routes", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "rbac.authorization.k8s.io/v1", resource: "rolebindings", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "apiextensions.k8s.io/v1", resource: "customresourcedefinitions", limit: 50, full: false }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "apiregistration.k8s.io/v1", resource: "apiservices", limit: 50, full: true }).catch((error) => error as Error),
      fetchOcpResourceList({ apiVersion: "events.k8s.io/v1", resource: "events", limit: 50, full: true }).catch((error) => error as Error)
    ]);

    setState({
      projects: projects instanceof Error ? undefined : projects,
      namespaces: namespaces instanceof Error ? undefined : namespaces,
      pods: pods instanceof Error ? undefined : pods,
      deployments: deployments instanceof Error ? undefined : deployments,
      services: services instanceof Error ? undefined : services,
      routes: routes instanceof Error ? undefined : routes,
      roleBindings: roleBindings instanceof Error ? undefined : roleBindings,
      crds: crds instanceof Error ? undefined : crds,
      apiServices: apiServices instanceof Error ? undefined : apiServices,
      events: events instanceof Error ? undefined : events
    });
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    if (view === "projects") {
      return listItems(state.projects, state.namespaces, state.deployments, state.pods, state.roleBindings);
    }
    if (view === "api-explorer") {
      return listItems(state.crds, state.apiServices);
    }
    if (view === "events") {
      return listItems(state.events);
    }
    return listItems(
      state.projects,
      state.namespaces,
      state.pods,
      state.deployments,
      state.services,
      state.routes,
      state.crds,
      state.apiServices,
      state.events
    );
  }, [state, view]);

  const kindOptions = useMemo(() => uniqueSorted(rows.map((item) => item.kind)), [rows]);
  const namespaceOptions = useMemo(() => uniqueSorted(rows.map((item) => item.metadata.namespace)), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (namespaceFilter !== "all" && item.metadata.namespace !== namespaceFilter) return false;
      if (!query) return true;
      return searchTerms(item).includes(query);
    });
  }, [kindFilter, namespaceFilter, rows, search]);

  const selectedItem =
    filteredRows.find((item) => itemKey(item) === selectedName) ??
    filteredRows[0];

  useEffect(() => {
    if (!selectedItem) {
      setSelectedName("");
      return;
    }
    const keys = new Set(filteredRows.map(itemKey));
    const key = itemKey(selectedItem);
    setSelectedName((current) => (current && keys.has(current) ? current : key));
  }, [filteredRows, selectedItem]);

  const nativeHref =
    view === "projects"
      ? nativeConsoleHref("/projects")
      : view === "api-explorer"
        ? nativeConsoleHref("/api-explorer")
        : view === "events"
          ? nativeConsoleHref("/events")
          : nativeConsoleHref("/search");

  return (
    <section className="native-console-panel ocp-home-console" data-testid={`ocp-home-${view}`} id={`ocp-home-${view}`}>
      <div className="native-console-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h3>{copy[view]}</h3>
          <p>{viewBoundary(copy, view)}</p>
        </div>
        <div className="native-console-actions">
          <span className={`status-pill ${statusReachable(...Object.values(state)) ? "ready" : "warning"}`}>
            {loading ? copy.loading : statusReachable(...Object.values(state)) ? copy.live : copy.unavailable}
          </span>
          <button type="button" className="ghost-button" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            {copy.refresh}
          </button>
        </div>
      </div>

      <div className="home-console-summary" data-testid="ocp-home-summary">
        <span><FolderKanban size={15} aria-hidden="true" /> {copy.projects}: {listItems(state.projects, state.namespaces).length}</span>
        <span><FileSearch size={15} aria-hidden="true" /> {copy.search}: {listItems(state.pods, state.deployments, state.services, state.routes).length}</span>
        <span><ServerCog size={15} aria-hidden="true" /> {copy["api-explorer"]}: {listItems(state.crds, state.apiServices).length}</span>
        <span><Clock3 size={15} aria-hidden="true" /> {copy.events}: {state.events?.items.length ?? 0}</span>
      </div>

      <div className="native-console-toolbar home-filter-toolbar" data-testid="ocp-home-native-toolbar">
        <label className="resource-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder={copy.filter}
            aria-label={copy.filter}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>{copy.kind}</span>
          <select value={kindFilter} aria-label={copy.kind} onChange={(event) => setKindFilter(event.currentTarget.value)}>
            <option value="all">{copy.allKinds}</option>
            {kindOptions.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.namespace}</span>
          <select value={namespaceFilter} aria-label={copy.namespace} onChange={(event) => setNamespaceFilter(event.currentTarget.value)}>
            <option value="all">{copy.allNamespaces}</option>
            {namespaceOptions.map((namespace) => (
              <option key={namespace} value={namespace}>{namespace}</option>
            ))}
          </select>
        </label>
        <a className="text-icon-button native-open-link" href={nativeHref} target="_blank" rel="noreferrer">
          <TableProperties size={16} aria-hidden="true" />
          {copy.nativeOpen}
        </a>
        <span className="native-toolbar-count" data-testid="ocp-home-filter-count">
          <ListFilter size={15} aria-hidden="true" />
          {copy.results}: {filteredRows.length}/{rows.length}
        </span>
      </div>

      <div className="native-console-table-wrap">
        <table className="native-console-table">
          <thead>
            <tr>
              <th>{copy.name}</th>
              <th>{copy.kind}</th>
              <th>{copy.namespace}</th>
              <th>{copy.status}</th>
              <th>{copy.detail}</th>
              <th>{copy.age}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((item) => {
              const key = itemKey(item);
              return (
                <tr key={key} className={selectedName === key ? "selected" : undefined} onClick={() => setSelectedName(key)}>
                  <td>
                    <NativeObjectLink item={item} resource={resourceForHomeItem(item)} testId={`ocp-home-${view}-object-link`} />
                  </td>
                  <td>{item.kind}</td>
                  <td>{item.metadata.namespace ?? "-"}</td>
                  <td>{itemStatus(item)}</td>
                  <td>{itemDetail(item)}</td>
                  <td>{ageText(item.metadata.creationTimestamp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 ? <p className="empty-state">{copy.noRows}</p> : null}
      </div>

      <OcpNativeObjectDrilldown
        language={language}
        resource={{ apiVersion: "v1", resource: "resources", kind: "Resource" }}
        items={filteredRows}
        resourceForItem={resourceForHomeItem}
        title={copy[view]}
        testId="ocp-home-object-drilldown"
      />
    </section>
  );
}
