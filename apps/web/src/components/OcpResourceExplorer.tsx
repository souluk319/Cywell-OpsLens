import type {
  OcpApiResource,
  OcpApiResourcesResponse,
  OcpEventsResponse,
  OcpPodLogsResponse,
  OcpResourceAccessMatrixResponse,
  OcpResourceDetailResponse,
  OcpResourceListResponse,
  OcpRelatedResourcesResponse,
  OcpResourceSummary
} from "@kugnus/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  GitBranch,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert
} from "lucide-react";
import {
  fetchOcpAccessMatrix,
  fetchOcpApiResources,
  fetchOcpEvents,
  fetchOcpPodLogs,
  fetchOcpRelatedResources,
  fetchOcpResourceDetail,
  fetchOcpResourceList
} from "../lib/api";
import { stringify as stringifyYaml } from "yaml";
import type { UiLanguage } from "../i18n";

function scoreDefaultResource(resource: OcpApiResource) {
  if (resource.apiVersion === "v1" && resource.name === "pods") return 0;
  if (resource.apiVersion === "v1" && resource.name === "namespaces") return 1;
  if (resource.apiVersion === "apps/v1" && resource.name === "deployments") {
    return 2;
  }
  return 10;
}

function resourceKey(resource: OcpApiResource) {
  return `${resource.apiVersion}/${resource.name}`;
}

function resourcePresetCandidates(resource: OcpApiResource) {
  return [
    resourceKey(resource),
    resource.name,
    resource.kind,
    ...resource.shortNames,
    ...resource.categories
  ].map((candidate) => candidate.toLowerCase());
}

function resourceMatchesPreferredPreset(
  resource: OcpApiResource,
  preferredResources: string[]
) {
  const preferred = new Set(
    preferredResources.map((resourceName) => resourceName.toLowerCase())
  );
  return resourcePresetCandidates(resource).some((candidate) =>
    preferred.has(candidate)
  );
}

export interface OcpResourcePreset {
  activationId: string;
  query: string;
  preferredResources: string[];
  namespace?: string;
  detailView?: "json" | "yaml";
}

export type OcpResourceFunctionOutcome =
  | "not-active"
  | "operating"
  | "empty"
  | "loading"
  | "missing"
  | "waiting";

interface OcpResourceExplorerProps {
  navigationPreset?: OcpResourcePreset | null;
  language: UiLanguage;
  onFunctionOutcomeChange?: (outcome: OcpResourceFunctionOutcome) => void;
}

const explorerCopy = {
  en: {
    eyebrow: "Live OpenShift API",
    title: "OCP Resource Explorer",
    refresh: "Refresh",
    discovering: "discovering",
    reachable: "OCP reachable",
    unavailable: "OCP unavailable",
    versionUnknown: "version unknown",
    userUnknown: "user unknown",
    resources: "resources",
    tlsVerify: "TLS verify",
    apiResources: "API Resources",
    searchApiResources: "Search API resources",
    kind: "Kind",
    resource: "Resource",
    apiVersion: "API Version",
    scope: "Scope",
    read: "Read",
    namespaced: "namespaced",
    cluster: "cluster",
    list: "list",
    blocked: "blocked",
    readOnlyList: "Read-only Resource List",
    noMutateVerbs: "no mutate verbs",
    namespace: "Namespace",
    allNamespaces: "All namespaces",
    labelSelector: "Label selector",
    fieldSelector: "Field selector",
    fullRead: "full read",
    load: "Load",
    readVerbs: "read verbs",
    noListableResource: "No listable resource selected",
    previous: "Previous",
    next: "Next",
    page: "Page",
    loadingItems: "Loading resource items...",
    name: "Name",
    created: "Created",
    status: "Status",
    redacted: "redacted",
    statusAttached: "status attached",
    metadata: "metadata",
    noItems: "No items returned for this scope.",
    selectObject: "Select an item to inspect the sanitized object.",
    objectView: "Object view",
    objectJson: "Object JSON",
    objectYaml: "Object YAML",
    objectPrefix: "Object",
    fallback: "fallback",
    requested: "requested",
    transitionTo: "to",
    served: "served",
    redactedCount: "redacted",
    loadingObject: "Loading object detail...",
    involvedEvents: "Involved Events",
    events: "events",
    loadingEvents: "Loading events...",
    eventFallback: "Event",
    noMessage: "No message",
    noEvents: "No events returned for this object.",
    selectEvents: "Select an item to inspect events.",
    podLogs: "Pod Logs",
    podOnly: "pod only",
    loadingPodLogs: "Loading pod logs...",
    noLogLines: "No log lines returned.",
    selectPodLogs: "Select a Pod to inspect logs.",
    relatedResources: "Related Resources",
    owners: "owners",
    children: "children",
    loadingRelated: "Loading related resources...",
    ownerReferences: "Owner References",
    controller: "controller",
    noOwners: "No owner references returned.",
    ownedChildren: "Owned Children",
    noChildren: "No owned children found in scanned resources.",
    selectRelated: "Select an item to inspect owner and child resources.",
    rbacPending: "RBAC pending",
    rbacAllowed: "allowed",
    rbacUnknown: "unknown",
    rbacDenied: "denied",
    unsupported: "unsupported",
    pending: "pending",
    activePreset: "Active menu preset",
    preferredApis: "Preferred APIs",
    autoLoaded: "auto-loaded",
    functionSmoke: "Function smoke",
    selectedApi: "Selected API",
    listStatus: "List",
    detailStatus: "Detail",
    eventsStatus: "Events",
    logsStatus: "Logs",
    relatedStatus: "Related",
    mutationGuard: "Mutation guard",
    functionOutcome: "Function outcome",
    presetMatch: "Preset match",
    matched: "matched",
    missing: "missing",
    operating: "operating",
    waiting: "waiting",
    loading: "loading",
    emptyResult: "empty result",
    itemsReturned: "items",
    notApplicable: "not applicable",
    logLines: "log lines",
    readOnlyGuard: "read-only only: get/list/watch, no create/update/patch/delete"
  },
  ko: {
    eyebrow: "실시간 OpenShift API",
    title: "OCP 리소스 탐색기",
    refresh: "새로고침",
    discovering: "탐색 중",
    reachable: "OCP 연결됨",
    unavailable: "OCP 사용 불가",
    versionUnknown: "버전 미확인",
    userUnknown: "사용자 미확인",
    resources: "개 리소스",
    tlsVerify: "TLS 검증",
    apiResources: "API 리소스",
    searchApiResources: "API 리소스 검색",
    kind: "종류",
    resource: "리소스",
    apiVersion: "API 버전",
    scope: "범위",
    read: "읽기",
    namespaced: "네임스페이스",
    cluster: "클러스터",
    list: "목록",
    blocked: "차단",
    readOnlyList: "읽기 전용 리소스 목록",
    noMutateVerbs: "변경 동작 없음",
    namespace: "네임스페이스",
    allNamespaces: "모든 네임스페이스",
    labelSelector: "레이블 선택자",
    fieldSelector: "필드 선택자",
    fullRead: "전체 읽기",
    load: "불러오기",
    readVerbs: "읽기 동작",
    noListableResource: "목록 조회 가능한 리소스가 선택되지 않았습니다",
    previous: "이전",
    next: "다음",
    page: "페이지",
    loadingItems: "리소스 항목을 불러오는 중...",
    name: "이름",
    created: "생성",
    status: "상태",
    redacted: "마스킹됨",
    statusAttached: "상태 있음",
    metadata: "메타데이터",
    noItems: "이 범위에서 반환된 항목이 없습니다.",
    selectObject: "항목을 선택하면 민감정보가 제거된 객체를 확인합니다.",
    objectView: "객체 보기",
    objectJson: "객체 JSON",
    objectYaml: "객체 YAML",
    objectPrefix: "객체",
    fallback: "대체 응답",
    requested: "요청",
    transitionTo: "->",
    served: "제공",
    redactedCount: "마스킹",
    loadingObject: "객체 상세를 불러오는 중...",
    involvedEvents: "관련 이벤트",
    events: "개 이벤트",
    loadingEvents: "이벤트를 불러오는 중...",
    eventFallback: "이벤트",
    noMessage: "메시지 없음",
    noEvents: "이 객체의 이벤트가 반환되지 않았습니다.",
    selectEvents: "항목을 선택하면 이벤트를 확인합니다.",
    podLogs: "Pod 로그",
    podOnly: "Pod 전용",
    loadingPodLogs: "Pod 로그를 불러오는 중...",
    noLogLines: "반환된 로그 라인이 없습니다.",
    selectPodLogs: "Pod를 선택하면 로그를 확인합니다.",
    relatedResources: "관련 리소스",
    owners: "개 소유자",
    children: "개 하위",
    loadingRelated: "관련 리소스를 불러오는 중...",
    ownerReferences: "소유자 참조",
    controller: "컨트롤러",
    noOwners: "반환된 소유자 참조가 없습니다.",
    ownedChildren: "소유 하위 리소스",
    noChildren: "스캔한 리소스에서 소유 하위 리소스를 찾지 못했습니다.",
    selectRelated: "항목을 선택하면 소유자와 하위 리소스를 확인합니다.",
    rbacPending: "RBAC 대기 중",
    rbacAllowed: "허용",
    rbacUnknown: "확인 불가",
    rbacDenied: "거부",
    unsupported: "미지원",
    pending: "대기 중",
    activePreset: "활성 메뉴 프리셋",
    preferredApis: "우선 API",
    autoLoaded: "자동 조회",
    functionSmoke: "기능 스모크",
    selectedApi: "선택 API",
    listStatus: "목록",
    detailStatus: "상세",
    eventsStatus: "이벤트",
    logsStatus: "로그",
    relatedStatus: "관련",
    mutationGuard: "변경 차단",
    functionOutcome: "기능 결과",
    presetMatch: "프리셋 매칭",
    matched: "매칭됨",
    missing: "누락",
    operating: "운영 가능",
    waiting: "대기 중",
    loading: "로딩 중",
    emptyResult: "빈 결과",
    itemsReturned: "개 항목",
    notApplicable: "해당 없음",
    logLines: "개 로그 라인",
    readOnlyGuard: "읽기 전용: get/list/watch만 사용, create/update/patch/delete 없음"
  }
} as const;

const readVerbs = ["get", "list", "watch"] as const;

function formatAccess(
  access:
    | OcpResourceListResponse["access"]["list"]
    | OcpResourceDetailResponse["access"]["get"]
    | OcpEventsResponse["access"]
    | OcpPodLogsResponse["access"]
    | undefined,
  copy: (typeof explorerCopy)[UiLanguage]
) {
  if (!access) {
    return copy.rbacPending;
  }
  if (access.allowed) {
    return `RBAC ${access.verb} ${copy.rbacAllowed}`;
  }
  if (access.evaluationError) {
    return `RBAC ${access.verb} ${copy.rbacUnknown}`;
  }
  return `RBAC ${access.verb} ${copy.rbacDenied}`;
}

function formatMatrixAccess(
  verb: (typeof readVerbs)[number],
  resource: OcpApiResource | undefined,
  matrix: OcpResourceAccessMatrixResponse | null,
  copy: (typeof explorerCopy)[UiLanguage]
) {
  if (!resource?.verbs.includes(verb)) {
    return `${verb} ${copy.unsupported}`;
  }

  const access = matrix?.access[verb];
  if (!access) {
    return `${verb} ${copy.pending}`;
  }
  if (access.allowed) {
    return `${verb} ${copy.rbacAllowed}`;
  }
  if (access.evaluationError) {
    return `${verb} ${copy.rbacUnknown}`;
  }
  return `${verb} ${copy.rbacDenied}`;
}

function countLogLines(logs: OcpPodLogsResponse | null) {
  return logs?.logs.split(/\r?\n/).filter((line) => line.trim()).length ?? 0;
}

export function OcpResourceExplorer({
  navigationPreset = null,
  language,
  onFunctionOutcomeChange
}: OcpResourceExplorerProps) {
  const copy = explorerCopy[language];
  const [discovery, setDiscovery] = useState<OcpApiResourcesResponse | null>(
    null
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [namespace, setNamespace] = useState("");
  const [labelSelector, setLabelSelector] = useState("");
  const [fieldSelector, setFieldSelector] = useState("");
  const [query, setQuery] = useState("");
  const [full, setFull] = useState(false);
  const [detailView, setDetailView] = useState<"json" | "yaml">("json");
  const [list, setList] = useState<OcpResourceListResponse | null>(null);
  const [accessMatrix, setAccessMatrix] =
    useState<OcpResourceAccessMatrixResponse | null>(null);
  const [detail, setDetail] = useState<OcpResourceDetailResponse | null>(null);
  const [related, setRelated] = useState<OcpRelatedResourcesResponse | null>(
    null
  );
  const [events, setEvents] = useState<OcpEventsResponse | null>(null);
  const [logs, setLogs] = useState<OcpPodLogsResponse | null>(null);
  const [namespaces, setNamespaces] = useState<OcpResourceSummary[]>([]);
  const [pageTokens, setPageTokens] = useState<Array<string | undefined>>([
    undefined
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshDiscovery() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchOcpApiResources();
      setDiscovery(response);
      const defaultResource = response.resources
        .filter((resource) => resource.safeToList)
        .sort((a, b) => scoreDefaultResource(a) - scoreDefaultResource(b))[0];
      setSelectedKey((current) => {
        if (current) {
          return current;
        }
        return defaultResource ? resourceKey(defaultResource) : "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCP discovery failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshNamespaces() {
    try {
      const response = await fetchOcpResourceList({
        apiVersion: "v1",
        resource: "namespaces",
        limit: 500
      });
      setNamespaces(
        response.items
          .filter((item) => item.metadata.name)
          .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
      );
    } catch {
      setNamespaces([]);
    }
  }

  useEffect(() => {
    void refreshDiscovery();
    void refreshNamespaces();
  }, []);

  const selectedResource = useMemo(
    () =>
      discovery?.resources.find(
        (resource) => resourceKey(resource) === selectedKey
      ),
    [discovery, selectedKey]
  );

  const filteredResources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const resources = discovery?.resources ?? [];
    if (!normalized) {
      return resources.slice(0, 200);
    }

    return resources
      .filter((resource) =>
        [
          resource.apiVersion,
          resource.kind,
          resource.name,
          resource.categories.join(" "),
          resource.shortNames.join(" ")
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      )
      .slice(0, 200);
  }, [discovery, query]);

  useEffect(() => {
    if (!navigationPreset) {
      return;
    }

    setQuery(navigationPreset.query);
    setNamespace(navigationPreset.namespace ?? "");
    setLabelSelector("");
    setFieldSelector("");
    if (navigationPreset.detailView) {
      setDetailView(navigationPreset.detailView);
    }

    const preferred = new Set(
      navigationPreset.preferredResources.map((resource) =>
        resource.toLowerCase()
      )
    );
    const preferredResource = discovery?.resources
      .filter((resource) => resource.safeToList)
      .find((resource) =>
        resourcePresetCandidates(resource).some((candidate) =>
          preferred.has(candidate)
        )
      );

    if (preferredResource) {
      setSelectedKey(resourceKey(preferredResource));
      void loadSelectedResource(preferredResource, {
        namespaceOverride: navigationPreset.namespace ?? "",
        resetPage: true
      });
    }
  }, [navigationPreset?.activationId, discovery]);

  async function loadSelectedResource(
    resource = selectedResource,
    options: {
      continueToken?: string;
      namespaceOverride?: string;
      pageIndex?: number;
      resetPage?: boolean;
    } = {}
  ) {
    if (!resource) {
      return;
    }

    setListLoading(true);
    setError(null);
    try {
      const scopedNamespace = resource.namespaced
        ? (options.namespaceOverride ?? namespace).trim() || undefined
        : undefined;
      const scopedLabelSelector = labelSelector.trim() || undefined;
      const scopedFieldSelector = fieldSelector.trim() || undefined;
      const [response, matrixResponse] = await Promise.all([
        fetchOcpResourceList({
          apiVersion: resource.apiVersion,
          resource: resource.name,
          namespace: scopedNamespace,
          labelSelector: scopedLabelSelector,
          fieldSelector: scopedFieldSelector,
          limit: 50,
          continueToken: options.continueToken,
          full
        }),
        fetchOcpAccessMatrix({
          apiVersion: resource.apiVersion,
          resource: resource.name,
          namespace: scopedNamespace
        })
      ]);
      if (options.resetPage !== false) {
        setPageTokens([undefined]);
        setPageIndex(0);
      } else {
        setPageIndex(options.pageIndex ?? 0);
      }
      setAccessMatrix(matrixResponse);
      setList(response);
      setDetail(null);
      setRelated(null);
      setEvents(null);
      setLogs(null);
      if (response.items[0]) {
        await loadItemDetails(response.items[0], response.resource);
      }
    } catch (err) {
      setList(null);
      setAccessMatrix(null);
      setDetail(null);
      setRelated(null);
      setEvents(null);
      setLogs(null);
      setError(err instanceof Error ? err.message : "OCP list failed");
    } finally {
      setListLoading(false);
    }
  }

  async function loadNextPage() {
    if (!selectedResource || !list?.continueToken) {
      return;
    }
    const nextIndex = pageIndex + 1;
    const token = list.continueToken;
    setPageTokens((current) => {
      const next = current.slice(0, nextIndex);
      next[nextIndex] = token;
      return next;
    });
    await loadSelectedResource(selectedResource, {
      continueToken: token,
      pageIndex: nextIndex,
      resetPage: false
    });
  }

  async function loadPreviousPage() {
    if (!selectedResource || pageIndex === 0) {
      return;
    }
    const previousIndex = pageIndex - 1;
    await loadSelectedResource(selectedResource, {
      continueToken: pageTokens[previousIndex],
      pageIndex: previousIndex,
      resetPage: false
    });
  }

  async function loadItemDetails(
    item: OcpResourceSummary,
    resource = selectedResource
  ) {
    if (!resource || !item.metadata.name) {
      return;
    }

    setDetailLoading(true);
    setError(null);
    try {
      const [detailResponse, eventsResponse, relatedResponse] = await Promise.all([
        fetchOcpResourceDetail({
          apiVersion: resource.apiVersion,
          resource: resource.name,
          namespace: item.metadata.namespace,
          name: item.metadata.name,
          full: true
        }),
        fetchOcpEvents({
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: item.metadata.namespace,
          name: item.metadata.name,
          uid: item.metadata.uid,
          limit: 100
        }),
        fetchOcpRelatedResources({
          apiVersion: resource.apiVersion,
          resource: resource.name,
          namespace: item.metadata.namespace,
          name: item.metadata.name
        }).catch(() => null)
      ]);

      setDetail(detailResponse);
      setEvents(eventsResponse);
      setRelated(relatedResponse);

      if (resource.kind === "Pod" && item.metadata.namespace) {
        try {
          const logResponse = await fetchOcpPodLogs({
            namespace: item.metadata.namespace,
            pod: item.metadata.name,
            tailLines: 200
          });
          setLogs(logResponse);
        } catch {
          setLogs(null);
        }
      } else {
        setLogs(null);
      }
    } catch (err) {
      setDetail(null);
      setRelated(null);
      setEvents(null);
      setLogs(null);
      setError(err instanceof Error ? err.message : "OCP detail failed");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (selectedResource?.safeToList) {
      void loadSelectedResource(selectedResource, { resetPage: true });
    }
  }, [selectedKey]);

  const status = discovery?.status;
  const detailText = detail
    ? detailView === "yaml"
      ? stringifyYaml(detail.raw, {
          lineWidth: 0,
          sortMapEntries: false
        })
      : JSON.stringify(detail.raw, null, 2)
    : copy.selectObject;

  const selectedApiStatus = selectedResource
    ? `${selectedResource.kind} ${selectedResource.apiVersion}/${selectedResource.name}`
    : copy.noListableResource;
  const presetMatchState = !navigationPreset
    ? "not-active"
    : selectedResource &&
        resourceMatchesPreferredPreset(
          selectedResource,
          navigationPreset.preferredResources
        )
      ? "matched"
      : "missing";
  const presetMatchStatus =
    presetMatchState === "matched" && selectedResource
      ? `${copy.matched}: ${resourceKey(selectedResource)}`
      : presetMatchState === "missing"
        ? copy.missing
        : copy.notApplicable;
  const listSmokeState = listLoading ? "loading" : list ? "ready" : "pending";
  const listSmokeStatus = listLoading
    ? copy.loadingItems
    : list
      ? `${list.items.length} ${copy.itemsReturned} (${formatAccess(list.access.list, copy)})`
      : copy.pending;
  const detailSmokeState = detailLoading
    ? "loading"
    : detail
      ? "ready"
      : list?.items.length
        ? "pending"
        : "empty";
  const detailSmokeStatus = detailLoading
    ? copy.loadingObject
    : detail
      ? `${detail.item.kind}/${detail.item.metadata.name} (${formatAccess(detail.access.get, copy)})`
      : list?.items.length
        ? copy.pending
        : copy.noItems;
  const eventsSmokeState = detailLoading
    ? "loading"
    : events
      ? "ready"
      : list?.items.length
        ? "pending"
        : "empty";
  const eventsSmokeStatus = detailLoading
    ? copy.loadingEvents
    : events
      ? `${events.items.length} ${copy.events} (${formatAccess(events.access, copy)})`
      : copy.pending;
  const logsSmokeState =
    selectedResource?.kind !== "Pod"
      ? "not-applicable"
      : detailLoading
        ? "loading"
        : logs
          ? "ready"
          : list?.items.length
            ? "pending"
            : "empty";
  const logsSmokeStatus =
    selectedResource?.kind !== "Pod"
      ? copy.notApplicable
      : detailLoading
        ? copy.loadingPodLogs
        : logs
          ? `${countLogLines(logs)} ${copy.logLines} (${formatAccess(logs.access, copy)})`
          : copy.pending;
  const relatedSmokeState = detailLoading
    ? "loading"
    : related
      ? "ready"
      : list?.items.length
        ? "pending"
        : "empty";
  const relatedSmokeStatus = detailLoading
    ? copy.loadingRelated
    : related
      ? `${related.owners.length} ${copy.owners} / ${related.children.length} ${copy.children}`
      : copy.pending;
  const functionOutcomeState: OcpResourceFunctionOutcome = !navigationPreset
    ? "not-active"
    : presetMatchState === "missing"
      ? "missing"
      : listSmokeState === "loading" || detailSmokeState === "loading"
        ? "loading"
        : !list
          ? "waiting"
          : list.items.length === 0
            ? "empty"
            : detailSmokeState === "ready"
              ? "operating"
              : "waiting";
  const functionOutcomeStatus =
    functionOutcomeState === "operating"
      ? `${copy.operating}: ${list?.items.length ?? 0} ${copy.itemsReturned}`
      : functionOutcomeState === "empty"
        ? `${copy.emptyResult}: ${list?.items.length ?? 0} ${copy.itemsReturned}`
        : functionOutcomeState === "loading"
          ? copy.loading
          : functionOutcomeState === "missing"
            ? copy.missing
            : functionOutcomeState === "waiting"
              ? copy.waiting
              : copy.notApplicable;

  useEffect(() => {
    onFunctionOutcomeChange?.(functionOutcomeState);
  }, [functionOutcomeState, onFunctionOutcomeChange]);

  return (
    <section
      className="ocp-explorer"
      data-testid="ocp-resource-explorer"
      aria-labelledby="ocp-explorer-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-explorer-title">{copy.title}</h2>
        </div>
        <button
          className="text-icon-button"
          type="button"
          onClick={() => void refreshDiscovery()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-status-strip" data-testid="ocp-status">
        <span className={`status-pill ${status?.reachable ? "ready" : "danger"}`}>
          {loading
            ? copy.discovering
            : status?.reachable
              ? copy.reachable
              : copy.unavailable}
        </span>
        <span>{status?.gitVersion ?? copy.versionUnknown}</span>
        <span>{status?.userName ?? copy.userUnknown}</span>
        <span>{status?.discoveredResourceCount ?? 0} {copy.resources}</span>
        <span>{copy.tlsVerify} {status?.tlsVerify === false ? "off" : "on"}</span>
      </div>

      {navigationPreset ? (
        <div className="ocp-active-preset" data-testid="ocp-active-preset">
          <span className="status-pill ready">{copy.autoLoaded}</span>
          <strong>{copy.activePreset}</strong>
          <span data-testid="ocp-active-preset-query">
            {navigationPreset.query}
          </span>
          <span>{copy.preferredApis}</span>
          <code data-testid="ocp-active-preset-resources">
            {navigationPreset.preferredResources.join(" ")}
          </code>
        </div>
      ) : null}

      <div
        className="ocp-function-smoke"
        data-testid="ocp-function-smoke"
        aria-label={copy.functionSmoke}
      >
        <strong>{copy.functionSmoke}</strong>
        <dl>
          <div>
            <dt>{copy.functionOutcome}</dt>
            <dd
              data-function-outcome={functionOutcomeState}
              data-testid="ocp-smoke-function-outcome"
            >
              {functionOutcomeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.presetMatch}</dt>
            <dd
              data-preset-match={presetMatchState}
              data-testid="ocp-smoke-preset-match"
            >
              {presetMatchStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.selectedApi}</dt>
            <dd data-testid="ocp-smoke-selected-api">{selectedApiStatus}</dd>
          </div>
          <div>
            <dt>{copy.listStatus}</dt>
            <dd
              data-smoke-state={listSmokeState}
              data-testid="ocp-smoke-list-status"
            >
              {listSmokeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.detailStatus}</dt>
            <dd
              data-smoke-state={detailSmokeState}
              data-testid="ocp-smoke-detail-status"
            >
              {detailSmokeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.eventsStatus}</dt>
            <dd
              data-smoke-state={eventsSmokeState}
              data-testid="ocp-smoke-events-status"
            >
              {eventsSmokeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.logsStatus}</dt>
            <dd
              data-smoke-state={logsSmokeState}
              data-testid="ocp-smoke-logs-status"
            >
              {logsSmokeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.relatedStatus}</dt>
            <dd
              data-smoke-state={relatedSmokeState}
              data-testid="ocp-smoke-related-status"
            >
              {relatedSmokeStatus}
            </dd>
          </div>
          <div>
            <dt>{copy.mutationGuard}</dt>
            <dd data-testid="ocp-smoke-mutation-guard">
              {copy.readOnlyGuard}
            </dd>
          </div>
        </dl>
      </div>

      {error || status?.error ? (
        <div className="ocp-error" data-testid="ocp-error">
          <ShieldAlert size={17} aria-hidden="true" />
          <span>{error ?? status?.error}</span>
        </div>
      ) : null}

      <div className="ocp-explorer-grid">
        <article className="console-panel resource-catalog-panel">
          <div className="panel-title-row">
            <h3>{copy.apiResources}</h3>
            <label className="resource-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label={copy.searchApiResources}
                data-testid="ocp-resource-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="pods, routes, deployments..."
              />
            </label>
          </div>

          <div className="resource-table-wrap">
            <table className="resource-table" data-testid="ocp-resource-table">
              <thead>
                <tr>
                  <th>{copy.kind}</th>
                  <th>{copy.resource}</th>
                  <th>{copy.apiVersion}</th>
                  <th>{copy.scope}</th>
                  <th>{copy.read}</th>
                </tr>
              </thead>
              <tbody>
                {filteredResources.map((resource) => (
                  <tr
                    className={
                      resourceKey(resource) === selectedKey ? "selected" : ""
                    }
                    key={resourceKey(resource)}
                  >
                    <td>{resource.kind}</td>
                    <td>{resource.name}</td>
                    <td>{resource.apiVersion}</td>
                    <td>{resource.namespaced ? copy.namespaced : copy.cluster}</td>
                    <td>
                      <button
                        className="mini-button"
                        type="button"
                        disabled={!resource.safeToList}
                        onClick={() => {
                          setSelectedKey(resourceKey(resource));
                          if (!resource.safeToList) {
                            setError(
                              `${resource.kind} is blocked or not listable in safe mode.`
                            );
                          }
                        }}
                      >
                        {resource.safeToList ? copy.list : copy.blocked}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="console-panel resource-list-panel">
          <div className="panel-title-row">
            <h3>{copy.readOnlyList}</h3>
            <span className="status-pill read-only">{copy.noMutateVerbs}</span>
          </div>

          <div className="resource-query-controls">
            <label>
              {copy.namespace}
              <select
                aria-label={copy.namespace}
                data-testid="ocp-namespace-select"
                disabled={!selectedResource?.namespaced}
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
              >
                <option value="">{copy.allNamespaces}</option>
                {namespaces.map((item) => (
                  <option key={item.metadata.name} value={item.metadata.name}>
                    {item.metadata.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy.labelSelector}
              <input
                aria-label={copy.labelSelector}
                data-testid="ocp-label-selector"
                value={labelSelector}
                onChange={(event) => setLabelSelector(event.target.value)}
                placeholder="app=my-app"
              />
            </label>
            <label>
              {copy.fieldSelector}
              <input
                aria-label={copy.fieldSelector}
                data-testid="ocp-field-selector"
                value={fieldSelector}
                onChange={(event) => setFieldSelector(event.target.value)}
                placeholder="metadata.name=..."
              />
            </label>
            <label className="checkbox-control">
              <input
                checked={full}
                type="checkbox"
                onChange={(event) => setFull(event.target.checked)}
              />
              {copy.fullRead}
            </label>
            <button
              className="text-icon-button"
              data-testid="ocp-resource-load"
              disabled={!selectedResource?.safeToList || listLoading}
              type="button"
              onClick={() => void loadSelectedResource()}
            >
              <Database size={16} aria-hidden="true" />
              {copy.load}
            </button>
          </div>

          <div className="selected-resource" data-testid="ocp-selected-resource">
            {selectedResource ? (
              <>
                <strong>{selectedResource.kind}</strong>
                <span>
                  {selectedResource.apiVersion}/{selectedResource.name}
                </span>
                <small>
                  {copy.readVerbs}:{" "}
                  {selectedResource.verbs
                    .filter((verb) => ["get", "list", "watch"].includes(verb))
                    .join(", ")}
                </small>
                <small data-testid="ocp-resource-access">
                  {formatAccess(list?.access.list, copy)}
                </small>
                {list?.fallback ? (
                  <div
                    className="resource-fallback"
                    data-testid="ocp-resource-fallback"
                  >
                    <span className="status-pill warning">{copy.fallback}</span>
                    <small>
                      {copy.requested} {list.fallback.requestedApiVersion}, {copy.served}{" "}
                      {list.fallback.servedApiVersion}
                    </small>
                    <small>{list.fallback.evidence.join(" | ")}</small>
                  </div>
                ) : null}
                <div className="access-matrix" data-testid="ocp-access-matrix">
                  {readVerbs.map((verb) => (
                    <span key={verb}>
                      {formatMatrixAccess(verb, selectedResource, accessMatrix, copy)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <span>{copy.noListableResource}</span>
            )}
          </div>

          <div className="page-controls" data-testid="ocp-page-controls">
            <button
              className="text-icon-button"
              data-testid="ocp-prev-page"
              disabled={pageIndex === 0 || listLoading}
              type="button"
              onClick={() => void loadPreviousPage()}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {copy.previous}
            </button>
            <span>{copy.page} {pageIndex + 1}</span>
            <button
              className="text-icon-button"
              data-testid="ocp-next-page"
              disabled={!list?.continueToken || listLoading}
              type="button"
              onClick={() => void loadNextPage()}
            >
              {copy.next}
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="resource-items" data-testid="ocp-resource-items">
            {listLoading ? <p>{copy.loadingItems}</p> : null}
            {!listLoading && list ? (
              <table className="resource-table compact">
                <thead>
                  <tr>
                    <th>{copy.name}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.created}</th>
                    <th>{copy.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "_cluster"}/${item.metadata.name}`}>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => void loadItemDetails(item, list.resource)}
                        >
                          {item.metadata.name}
                        </button>
                      </td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{item.metadata.creationTimestamp ?? "-"}</td>
                      <td>
                        {item.dataRedacted
                          ? copy.redacted
                          : item.status
                            ? copy.statusAttached
                            : copy.metadata}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!listLoading && list && list.items.length === 0 ? (
              <p>{copy.noItems}</p>
            ) : null}
          </div>
        </article>
      </div>

      <div className="resource-inspector-grid">
        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <FileCode2 size={16} aria-hidden="true" />
              {copy.objectPrefix} {detailView === "yaml" ? "YAML" : "JSON"}
            </h3>
            <div className="segmented-control" aria-label={copy.objectView}>
              <button
                aria-label={copy.objectJson}
                aria-pressed={detailView === "json"}
                data-testid="ocp-detail-json-tab"
                type="button"
                onClick={() => setDetailView("json")}
              >
                JSON
              </button>
              <button
                aria-label={copy.objectYaml}
                aria-pressed={detailView === "yaml"}
                data-testid="ocp-detail-yaml-tab"
                type="button"
                onClick={() => setDetailView("yaml")}
              >
                YAML
              </button>
            </div>
            <span className="status-pill read-only">
              {formatAccess(detail?.access.get, copy)}
            </span>
            {detail?.fallback ? (
              <span
                className="status-pill warning"
                data-testid="ocp-detail-fallback"
              >
                {copy.fallback} {detail.fallback.requestedApiVersion} {copy.transitionTo}{" "}
                {detail.fallback.servedApiVersion}
              </span>
            ) : null}
            <span className="status-pill read-only">
              {copy.redactedCount} {detail?.redaction.sensitiveFieldRedactionCount ?? 0}
            </span>
          </div>
          <pre className="object-json" data-testid="ocp-resource-detail">
            {detailLoading
              ? copy.loadingObject
              : detailText}
          </pre>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <Database size={16} aria-hidden="true" />
              {copy.involvedEvents}
            </h3>
            <span className="status-pill read-only">
              {formatAccess(events?.access, copy)}
            </span>
            <span className="status-pill read-only">
              {events?.items.length ?? 0} {copy.events}
            </span>
          </div>
          <div className="event-list" data-testid="ocp-resource-events">
            {detailLoading ? <p>{copy.loadingEvents}</p> : null}
            {!detailLoading && events?.items.length ? (
              events.items.map((event) => (
                <div className="event-row" key={`${event.namespace}/${event.name}`}>
                  <strong>{event.reason ?? event.type ?? copy.eventFallback}</strong>
                  <span>{event.lastTimestamp ?? event.firstTimestamp ?? "-"}</span>
                  <p>{event.message ?? copy.noMessage}</p>
                </div>
              ))
            ) : null}
            {!detailLoading && events && events.items.length === 0 ? (
              <p>{copy.noEvents}</p>
            ) : null}
            {!detailLoading && !events ? <p>{copy.selectEvents}</p> : null}
          </div>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <ScrollText size={16} aria-hidden="true" />
              {copy.podLogs}
            </h3>
            <span className="status-pill read-only">
              {formatAccess(logs?.access, copy)}
            </span>
            <span className="status-pill read-only">
              {logs?.container ?? copy.podOnly}
            </span>
          </div>
          <pre className="log-viewport compact" data-testid="ocp-pod-logs">
            {detailLoading
              ? copy.loadingPodLogs
              : logs
                ? logs.logs || copy.noLogLines
                : copy.selectPodLogs}
          </pre>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <GitBranch size={16} aria-hidden="true" />
              {copy.relatedResources}
            </h3>
            <span className="status-pill read-only">
              {related?.owners.length ?? 0} {copy.owners}
            </span>
            <span className="status-pill read-only">
              {related?.children.length ?? 0} {copy.children}
            </span>
          </div>
          <div className="related-resources" data-testid="ocp-related-resources">
            {detailLoading ? <p>{copy.loadingRelated}</p> : null}
            {!detailLoading && related ? (
              <>
                <div>
                  <strong>{copy.ownerReferences}</strong>
                  {related.owners.length ? (
                    related.owners.map((owner) => (
                      <p key={`${owner.uid ?? owner.kind}/${owner.name}`}>
                        {owner.kind}/{owner.name}
                        {owner.controller ? ` ${copy.controller}` : ""}
                      </p>
                    ))
                  ) : (
                    <p>{copy.noOwners}</p>
                  )}
                </div>
                <div>
                  <strong>{copy.ownedChildren}</strong>
                  {related.children.length ? (
                    related.children.map((child) => (
                      <button
                        className="link-button related-link"
                        key={`${child.resource.apiVersion}/${child.resource.name}/${child.item.metadata.namespace ?? "_cluster"}/${child.item.metadata.name}`}
                        type="button"
                        onClick={() =>
                          void loadItemDetails(child.item, child.resource)
                        }
                      >
                        {child.item.kind}/{child.item.metadata.name}
                      </button>
                    ))
                  ) : (
                    <p>{copy.noChildren}</p>
                  )}
                </div>
              </>
            ) : null}
            {!detailLoading && !related ? (
              <p>{copy.selectRelated}</p>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
