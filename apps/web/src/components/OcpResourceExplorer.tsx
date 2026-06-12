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

const readVerbs = ["get", "list", "watch"] as const;

function formatAccess(
  access:
    | OcpResourceListResponse["access"]["list"]
    | OcpResourceDetailResponse["access"]["get"]
    | OcpEventsResponse["access"]
    | OcpPodLogsResponse["access"]
    | undefined
) {
  if (!access) {
    return "RBAC pending";
  }
  if (access.allowed) {
    return `RBAC ${access.verb} allowed`;
  }
  if (access.evaluationError) {
    return `RBAC ${access.verb} unknown`;
  }
  return `RBAC ${access.verb} denied`;
}

function formatMatrixAccess(
  verb: (typeof readVerbs)[number],
  resource: OcpApiResource | undefined,
  matrix: OcpResourceAccessMatrixResponse | null
) {
  if (!resource?.verbs.includes(verb)) {
    return `${verb} unsupported`;
  }

  const access = matrix?.access[verb];
  if (!access) {
    return `${verb} pending`;
  }
  if (access.allowed) {
    return `${verb} allowed`;
  }
  if (access.evaluationError) {
    return `${verb} unknown`;
  }
  return `${verb} denied`;
}

export function OcpResourceExplorer() {
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

  async function loadSelectedResource(
    resource = selectedResource,
    options: {
      continueToken?: string;
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
        ? namespace.trim() || undefined
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
    : "Select an item to inspect the sanitized object.";

  return (
    <section className="ocp-explorer" aria-labelledby="ocp-explorer-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Live OpenShift API</p>
          <h2 id="ocp-explorer-title">OCP Resource Explorer</h2>
        </div>
        <button
          className="text-icon-button"
          type="button"
          onClick={() => void refreshDiscovery()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="ocp-status-strip" data-testid="ocp-status">
        <span className={`status-pill ${status?.reachable ? "ready" : "danger"}`}>
          {loading
            ? "discovering"
            : status?.reachable
              ? "OCP reachable"
              : "OCP unavailable"}
        </span>
        <span>{status?.gitVersion ?? "version unknown"}</span>
        <span>{status?.userName ?? "user unknown"}</span>
        <span>{status?.discoveredResourceCount ?? 0} resources</span>
        <span>TLS verify {status?.tlsVerify === false ? "off" : "on"}</span>
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
            <h3>API Resources</h3>
            <label className="resource-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="Search API resources"
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
                  <th>Kind</th>
                  <th>Resource</th>
                  <th>API Version</th>
                  <th>Scope</th>
                  <th>Read</th>
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
                    <td>{resource.namespaced ? "namespaced" : "cluster"}</td>
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
                        {resource.safeToList ? "list" : "blocked"}
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
            <h3>Read-only Resource List</h3>
            <span className="status-pill read-only">no mutate verbs</span>
          </div>

          <div className="resource-query-controls">
            <label>
              Namespace
              <select
                aria-label="Namespace"
                data-testid="ocp-namespace-select"
                disabled={!selectedResource?.namespaced}
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
              >
                <option value="">All namespaces</option>
                {namespaces.map((item) => (
                  <option key={item.metadata.name} value={item.metadata.name}>
                    {item.metadata.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Label selector
              <input
                aria-label="Label selector"
                data-testid="ocp-label-selector"
                value={labelSelector}
                onChange={(event) => setLabelSelector(event.target.value)}
                placeholder="app=my-app"
              />
            </label>
            <label>
              Field selector
              <input
                aria-label="Field selector"
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
              full read
            </label>
            <button
              className="text-icon-button"
              data-testid="ocp-resource-load"
              disabled={!selectedResource?.safeToList || listLoading}
              type="button"
              onClick={() => void loadSelectedResource()}
            >
              <Database size={16} aria-hidden="true" />
              Load
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
                  read verbs:{" "}
                  {selectedResource.verbs
                    .filter((verb) => ["get", "list", "watch"].includes(verb))
                    .join(", ")}
                </small>
                <small data-testid="ocp-resource-access">
                  {formatAccess(list?.access.list)}
                </small>
                {list?.fallback ? (
                  <div
                    className="resource-fallback"
                    data-testid="ocp-resource-fallback"
                  >
                    <span className="status-pill warning">fallback</span>
                    <small>
                      requested {list.fallback.requestedApiVersion}, served{" "}
                      {list.fallback.servedApiVersion}
                    </small>
                    <small>{list.fallback.evidence.join(" | ")}</small>
                  </div>
                ) : null}
                <div className="access-matrix" data-testid="ocp-access-matrix">
                  {readVerbs.map((verb) => (
                    <span key={verb}>
                      {formatMatrixAccess(verb, selectedResource, accessMatrix)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <span>No listable resource selected</span>
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
              Previous
            </button>
            <span>Page {pageIndex + 1}</span>
            <button
              className="text-icon-button"
              data-testid="ocp-next-page"
              disabled={!list?.continueToken || listLoading}
              type="button"
              onClick={() => void loadNextPage()}
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="resource-items" data-testid="ocp-resource-items">
            {listLoading ? <p>Loading resource items...</p> : null}
            {!listLoading && list ? (
              <table className="resource-table compact">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Namespace</th>
                    <th>Created</th>
                    <th>Status</th>
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
                          ? "redacted"
                          : item.status
                            ? "status attached"
                            : "metadata"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {!listLoading && list && list.items.length === 0 ? (
              <p>No items returned for this scope.</p>
            ) : null}
          </div>
        </article>
      </div>

      <div className="resource-inspector-grid">
        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <FileCode2 size={16} aria-hidden="true" />
              Object {detailView === "yaml" ? "YAML" : "JSON"}
            </h3>
            <div className="segmented-control" aria-label="Object view">
              <button
                aria-label="Object JSON"
                aria-pressed={detailView === "json"}
                data-testid="ocp-detail-json-tab"
                type="button"
                onClick={() => setDetailView("json")}
              >
                JSON
              </button>
              <button
                aria-label="Object YAML"
                aria-pressed={detailView === "yaml"}
                data-testid="ocp-detail-yaml-tab"
                type="button"
                onClick={() => setDetailView("yaml")}
              >
                YAML
              </button>
            </div>
            <span className="status-pill read-only">
              {formatAccess(detail?.access.get)}
            </span>
            {detail?.fallback ? (
              <span
                className="status-pill warning"
                data-testid="ocp-detail-fallback"
              >
                fallback {detail.fallback.requestedApiVersion} to{" "}
                {detail.fallback.servedApiVersion}
              </span>
            ) : null}
            <span className="status-pill read-only">
              redacted {detail?.redaction.sensitiveFieldRedactionCount ?? 0}
            </span>
          </div>
          <pre className="object-json" data-testid="ocp-resource-detail">
            {detailLoading
              ? "Loading object detail..."
              : detailText}
          </pre>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <Database size={16} aria-hidden="true" />
              Involved Events
            </h3>
            <span className="status-pill read-only">
              {formatAccess(events?.access)}
            </span>
            <span className="status-pill read-only">
              {events?.items.length ?? 0} events
            </span>
          </div>
          <div className="event-list" data-testid="ocp-resource-events">
            {detailLoading ? <p>Loading events...</p> : null}
            {!detailLoading && events?.items.length ? (
              events.items.map((event) => (
                <div className="event-row" key={`${event.namespace}/${event.name}`}>
                  <strong>{event.reason ?? event.type ?? "Event"}</strong>
                  <span>{event.lastTimestamp ?? event.firstTimestamp ?? "-"}</span>
                  <p>{event.message ?? "No message"}</p>
                </div>
              ))
            ) : null}
            {!detailLoading && events && events.items.length === 0 ? (
              <p>No events returned for this object.</p>
            ) : null}
            {!detailLoading && !events ? <p>Select an item to inspect events.</p> : null}
          </div>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <ScrollText size={16} aria-hidden="true" />
              Pod Logs
            </h3>
            <span className="status-pill read-only">
              {formatAccess(logs?.access)}
            </span>
            <span className="status-pill read-only">
              {logs?.container ?? "pod only"}
            </span>
          </div>
          <pre className="log-viewport compact" data-testid="ocp-pod-logs">
            {detailLoading
              ? "Loading pod logs..."
              : logs
                ? logs.logs || "No log lines returned."
                : "Select a Pod to inspect logs."}
          </pre>
        </article>

        <article className="console-panel">
          <div className="panel-title-row">
            <h3>
              <GitBranch size={16} aria-hidden="true" />
              Related Resources
            </h3>
            <span className="status-pill read-only">
              {related?.owners.length ?? 0} owners
            </span>
            <span className="status-pill read-only">
              {related?.children.length ?? 0} children
            </span>
          </div>
          <div className="related-resources" data-testid="ocp-related-resources">
            {detailLoading ? <p>Loading related resources...</p> : null}
            {!detailLoading && related ? (
              <>
                <div>
                  <strong>Owner References</strong>
                  {related.owners.length ? (
                    related.owners.map((owner) => (
                      <p key={`${owner.uid ?? owner.kind}/${owner.name}`}>
                        {owner.kind}/{owner.name}
                        {owner.controller ? " controller" : ""}
                      </p>
                    ))
                  ) : (
                    <p>No owner references returned.</p>
                  )}
                </div>
                <div>
                  <strong>Owned Children</strong>
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
                    <p>No owned children found in scanned resources.</p>
                  )}
                </div>
              </>
            ) : null}
            {!detailLoading && !related ? (
              <p>Select an item to inspect owner and child resources.</p>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
