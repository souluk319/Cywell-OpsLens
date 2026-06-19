import type { OcpTopologyNode, OcpTopologyResponse } from "@kugnus/contracts";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Boxes,
  ExternalLink,
  GitBranch,
  Layers3,
  ListTree,
  Maximize2,
  RefreshCw,
  Route,
  Scale3D,
  Search,
  ServerCog,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  Workflow
} from "lucide-react";
import type { UiLanguage } from "../i18n";
import { fetchOcpTopology } from "../lib/api";
import { nativeConsoleHref, nativeObjectPath } from "../lib/nativeConsole";

interface OcpTopologyGraphProps {
  language: UiLanguage;
}

const topologyCopy = {
  en: {
    eyebrow: "Live OpenShift API",
    title: "Workload Topology",
    subtitle:
      "Routes, Services, workloads, Jobs, CronJobs, and Pods are connected from read-only OpenShift API evidence.",
    refresh: "Refresh",
    reachable: "OCP reachable",
    unavailable: "OCP unavailable",
    generated: "Updated",
    nodes: "nodes",
    edges: "edges",
    rendered: "rendered",
    namespace: "Namespace",
    allNamespaces: "All namespaces",
    findByName: "Find by name",
    resourceFilter: "Resource filter",
    allTypes: "All resource types",
    graphView: "Graph",
    listView: "List",
    displayOptions: "Display options",
    fitToScreen: "Fit to screen",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    health: "Health",
    kind: "Kind",
    name: "Name",
    scope: "Scope",
    relationships: "Relationships",
    load: "Load",
    evidence: "Evidence",
    readOnly: "read-only graph",
    route: "Routes",
    service: "Services",
    deploymentconfig: "DeploymentConfigs",
    deployment: "Deployments",
    statefulset: "StatefulSets",
    daemonset: "DaemonSets",
    replicaset: "ReplicaSets",
    replicationcontroller: "ReplicationControllers",
    hpa: "HPAs",
    pdb: "PDBs",
    pod: "Pods",
    cronjob: "CronJobs",
    job: "Jobs",
    noData: "No topology resources were returned for this scope.",
    errors: "Partial read gaps",
    selectedDetails: "Selected resource",
    openNativeObject: "Open in OpenShift",
    relatedResources: "Related resources",
    nodeEvidence: "Object evidence",
    noSelection: "Select a topology node to inspect details.",
    ready: "ready",
    warning: "warning",
    danger: "danger",
    unknown: "unknown"
  },
  ko: {
    eyebrow: "실시간 OpenShift API",
    title: "워크로드 토폴로지",
    subtitle:
      "Route, Service, 워크로드, Job, CronJob, Pod 관계를 읽기 전용 OpenShift API 근거로 연결합니다.",
    refresh: "새로고침",
    reachable: "OCP 연결됨",
    unavailable: "OCP 사용 불가",
    generated: "갱신",
    nodes: "개 노드",
    edges: "개 연결",
    rendered: "표시",
    namespace: "네임스페이스",
    allNamespaces: "모든 네임스페이스",
    findByName: "이름으로 검색",
    resourceFilter: "리소스 필터",
    allTypes: "모든 리소스 유형",
    graphView: "그래프",
    listView: "목록",
    displayOptions: "표시 옵션",
    fitToScreen: "화면에 맞춤",
    zoomIn: "확대",
    zoomOut: "축소",
    health: "상태",
    kind: "종류",
    name: "이름",
    scope: "범위",
    relationships: "관계",
    load: "불러오기",
    evidence: "근거",
    readOnly: "읽기 전용 그래프",
    route: "Route",
    service: "Service",
    deploymentconfig: "DeploymentConfig",
    deployment: "Deployment",
    statefulset: "StatefulSet",
    daemonset: "DaemonSet",
    replicaset: "ReplicaSet",
    replicationcontroller: "ReplicationController",
    hpa: "HPA",
    pdb: "PDB",
    pod: "Pod",
    cronjob: "CronJob",
    job: "Job",
    noData: "이 범위에서 토폴로지 리소스가 반환되지 않았습니다.",
    errors: "부분 읽기 gap",
    selectedDetails: "선택한 리소스",
    openNativeObject: "OpenShift에서 열기",
    relatedResources: "관련 리소스",
    nodeEvidence: "객체 근거",
    noSelection: "토폴로지 노드를 선택하면 세부정보를 확인할 수 있습니다.",
    ready: "정상",
    warning: "주의",
    danger: "위험",
    unknown: "미확인"
  }
} as const;

const nodeOrder: OcpTopologyNode["type"][] = [
  "route",
  "service",
  "deploymentconfig",
  "deployment",
  "statefulset",
  "daemonset",
  "replicaset",
  "replicationcontroller",
  "hpa",
  "pdb",
  "cronjob",
  "job",
  "pod"
];

const nodeIcons = {
  route: Route,
  service: ServerCog,
  deploymentconfig: Boxes,
  deployment: Boxes,
  statefulset: Layers3,
  daemonset: Layers3,
  replicaset: Layers3,
  replicationcontroller: Layers3,
  hpa: Scale3D,
  pdb: ShieldCheck,
  pod: Workflow,
  cronjob: GitBranch,
  job: GitBranch
} as const;

const nodeX: Record<OcpTopologyNode["type"], number> = {
  route: 4,
  service: 12,
  deploymentconfig: 20,
  deployment: 28,
  statefulset: 36,
  daemonset: 44,
  replicaset: 52,
  replicationcontroller: 60,
  hpa: 68,
  pdb: 76,
  cronjob: 84,
  job: 90,
  pod: 96
};

const maxRenderedNodesPerType = 26;

function nodeGroups(nodes: OcpTopologyNode[]) {
  return nodeOrder.map((type) => ({
    type,
    nodes: nodes.filter((node) => node.type === type)
  }));
}

function nodePosition(
  node: OcpTopologyNode,
  grouped: ReturnType<typeof nodeGroups>
) {
  const group = grouped.find((entry) => entry.type === node.type);
  const index = group?.nodes.findIndex((entry) => entry.id === node.id) ?? 0;
  const count = Math.max(group?.nodes.length ?? 1, 1);
  const step = count > 1 ? 52 / (count - 1) : 0;
  const y = count > 1 ? 10 + index * step : node.type === "cronjob" ? 49 : 34;
  return {
    x: nodeX[node.type],
    y
  };
}

function truncateLabel(label: string) {
  return label.length > 17 ? `${label.slice(0, 15)}...` : label;
}

function summaryByType(nodes: OcpTopologyNode[], type: OcpTopologyNode["type"]) {
  return nodes.filter((node) => node.type === type);
}

export function OcpTopologyGraph({ language }: OcpTopologyGraphProps) {
  const copy = topologyCopy[language];
  const [topology, setTopology] = useState<OcpTopologyResponse | null>(null);
  const [namespace, setNamespace] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | OcpTopologyNode["type"]>(
    "all"
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchOcpTopology({
        namespace: namespace.trim() || undefined,
        limit: 300
      });
      setTopology(response);
    } catch (err) {
      setTopology(null);
      setError(err instanceof Error ? err.message : "topology load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filteredNodes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (topology?.nodes ?? []).filter((node) => {
      const matchesType = typeFilter === "all" || node.type === typeFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        node.label.toLowerCase().includes(normalizedSearch) ||
        node.item.metadata.name.toLowerCase().includes(normalizedSearch) ||
        node.item.kind.toLowerCase().includes(normalizedSearch) ||
        (node.namespace ?? "").toLowerCase().includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [searchTerm, topology, typeFilter]);

  const visualNodes = useMemo(
    () =>
      nodeOrder.flatMap((type) =>
        filteredNodes
          .filter((node) => node.type === type)
          .slice(0, maxRenderedNodesPerType)
      ),
    [filteredNodes]
  );
  const visualNodeIds = useMemo(
    () => new Set(visualNodes.map((node) => node.id)),
    [visualNodes]
  );
  const visualEdges = useMemo(
    () =>
      (topology?.edges ?? []).filter(
        (edge) => visualNodeIds.has(edge.from) && visualNodeIds.has(edge.to)
      ),
    [topology, visualNodeIds]
  );
  const grouped = useMemo(() => nodeGroups(visualNodes), [visualNodes]);
  const positions = useMemo(
    () =>
      Object.fromEntries(
        visualNodes.map((node) => [node.id, nodePosition(node, grouped)])
      ),
    [visualNodes, grouped]
  );
  const selectedNode = useMemo(
    () => visualNodes.find((node) => node.id === selectedNodeId) ?? visualNodes[0] ?? null,
    [selectedNodeId, visualNodes]
  );
  const selectedRelatedEdges = useMemo(
    () =>
      selectedNode
        ? (topology?.edges ?? []).filter(
            (edge) => edge.from === selectedNode.id || edge.to === selectedNode.id
          )
        : [],
    [selectedNode, topology]
  );
  const selectedResource = selectedNode
    ? {
        apiVersion: selectedNode.resource.apiVersion,
        resource: selectedNode.resource.name,
        kind: selectedNode.resource.kind
      }
    : null;
  const selectedNativeHref = selectedNode
    ? nativeConsoleHref(nativeObjectPath(selectedResource!, selectedNode.item))
    : "";

  return (
    <section
      className="ocp-topology"
      data-testid="ocp-topology-graph"
      aria-labelledby="ocp-topology-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-topology-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <button
          className="text-icon-button"
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-status-strip" data-testid="ocp-topology-status">
        <span className={`status-pill ${topology?.status.reachable ? "ready" : "danger"}`}>
          {loading
            ? "loading"
            : topology?.status.reachable
              ? copy.reachable
              : copy.unavailable}
        </span>
        <span>{topology?.nodes.length ?? 0} {copy.nodes}</span>
        <span>{topology?.edges.length ?? 0} {copy.edges}</span>
        <span>
          {copy.rendered} {visualNodes.length}/{topology?.nodes.length ?? 0}
        </span>
        <span>{copy.readOnly}</span>
        <span>
          {copy.generated}{" "}
          {topology?.generatedAt
            ? new Date(topology.generatedAt).toLocaleTimeString()
            : "-"}
        </span>
      </div>

      <div className="topology-native-toolbar" data-testid="ocp-topology-native-toolbar">
        <label className="topology-search-control">
          {copy.findByName}
          <span>
            <Search size={15} aria-hidden="true" />
            <input
              data-testid="ocp-topology-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={copy.findByName}
            />
          </span>
        </label>
        <label>
          {copy.namespace}
          <input
            data-testid="ocp-topology-namespace"
            value={namespace}
            onChange={(event) => setNamespace(event.target.value)}
            placeholder={copy.allNamespaces}
          />
        </label>
        <label>
          {copy.resourceFilter}
          <select
            data-testid="ocp-topology-type-filter"
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as "all" | OcpTopologyNode["type"])
            }
          >
            <option value="all">{copy.allTypes}</option>
            {nodeOrder.map((type) => (
              <option key={type} value={type}>
                {copy[type]}
              </option>
            ))}
          </select>
        </label>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          {copy.load}
        </button>
        <div
          className="topology-display-options"
          data-testid="ocp-topology-display-options"
          aria-label={copy.displayOptions}
        >
          <button
            className={viewMode === "graph" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("graph")}
          >
            <Workflow size={15} aria-hidden="true" />
            {copy.graphView}
          </button>
          <button
            className={viewMode === "list" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("list")}
          >
            <ListTree size={15} aria-hidden="true" />
            {copy.listView}
          </button>
        </div>
        <div className="topology-zoom-controls" data-testid="ocp-topology-zoom-controls">
          <button
            type="button"
            aria-label={copy.zoomOut}
            onClick={() => setZoom((current) => Math.max(0.75, current - 0.1))}
          >
            <ZoomOut size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={copy.fitToScreen}
            onClick={() => setZoom(1)}
          >
            <Maximize2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={copy.zoomIn}
            onClick={() => setZoom((current) => Math.min(1.35, current + 0.1))}
          >
            <ZoomIn size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-topology-error">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="topology-workspace" data-testid="ocp-topology-workspace">
        {viewMode === "graph" ? (
          <article className="topology-canvas" data-testid="ocp-topology-canvas">
            {topology && visualNodes.length > 0 ? (
            <svg
              viewBox="0 0 100 72"
              role="img"
              aria-label={copy.title}
              style={{ "--topology-zoom": zoom } as CSSProperties}
            >
              <defs>
                <marker
                  id="topology-arrow"
                  markerHeight="5"
                  markerWidth="5"
                  orient="auto"
                  refX="5"
                  refY="2.5"
                >
                  <path d="M0,0 L5,2.5 L0,5 Z" />
                </marker>
              </defs>
              {visualEdges.map((edge) => {
                const from = positions[edge.from];
                const to = positions[edge.to];
                if (!from || !to) {
                  return null;
                }
                return (
                  <g className={`topology-edge ${edge.type}`} key={edge.id}>
                    <line
                      x1={from.x + 3.6}
                      x2={to.x - 3.6}
                      y1={from.y}
                      y2={to.y}
                    />
                    <title>{`${edge.label}: ${edge.evidence.join(" / ")}`}</title>
                  </g>
                );
              })}
              {visualNodes.map((node) => {
                const position = positions[node.id];
                if (!position) {
                  return null;
                }
                return (
                  <g
                    className={`topology-node ${node.type} ${node.health}${selectedNode?.id === node.id ? " selected" : ""}`}
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    transform={`translate(${position.x} ${position.y})`}
                    onClick={() => setSelectedNodeId(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedNodeId(node.id);
                      }
                    }}
                  >
                    <rect x="-5.8" y="-4.6" width="11.6" height="9.2" rx="2" />
                    <circle cx="-5" cy="-3.8" r="1.25" />
                    <text x="0" y="0.8" textAnchor="middle">
                      {truncateLabel(node.label)}
                    </text>
                    <title>
                      {`${node.item.kind}/${node.namespace ?? "-"} ${node.label} (${node.health})`}
                    </title>
                  </g>
                );
              })}
              </svg>
            ) : (
              <p className="topology-empty">{loading ? "loading" : copy.noData}</p>
            )}
          </article>
        ) : (
          <article className="topology-list-view" data-testid="ocp-topology-list-view">
            <table>
              <thead>
                <tr>
                  <th>{copy.name}</th>
                  <th>{copy.kind}</th>
                  <th>{copy.scope}</th>
                  <th>{copy.health}</th>
                  <th>{copy.relationships}</th>
                </tr>
              </thead>
              <tbody>
                {visualNodes.map((node) => {
                  const related = (topology?.edges ?? []).filter(
                    (edge) => edge.from === node.id || edge.to === node.id
                  );
                  return (
                    <tr
                      className={selectedNode?.id === node.id ? "selected" : ""}
                      key={node.id}
                      tabIndex={0}
                      onClick={() => setSelectedNodeId(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedNodeId(node.id);
                        }
                      }}
                    >
                      <td>
                        <strong>{node.label}</strong>
                      </td>
                      <td>{node.item.kind}</td>
                      <td>{node.namespace ?? "-"}</td>
                      <td>
                        <span className={`status-pill ${node.health}`}>
                          {copy[node.health]}
                        </span>
                      </td>
                      <td>{related.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visualNodes.length === 0 ? (
              <p className="topology-empty">{loading ? "loading" : copy.noData}</p>
            ) : null}
          </article>
        )}

        <aside className="topology-selected-panel" data-testid="ocp-topology-selected-panel">
          <h3>{copy.selectedDetails}</h3>
          {selectedNode ? (
            <>
              <div className="topology-selected-head">
                <strong>{selectedNode.label}</strong>
                <span className={`status-pill ${selectedNode.health}`}>{copy[selectedNode.health]}</span>
              </div>
              <dl>
                <div>
                  <dt>{copy.kind}</dt>
                  <dd>{selectedNode.item.kind}</dd>
                </div>
                <div>
                  <dt>{copy.scope}</dt>
                  <dd>{selectedNode.namespace ?? "-"}</dd>
                </div>
                <div>
                  <dt>{copy.relationships}</dt>
                  <dd>{selectedRelatedEdges.length}</dd>
                </div>
              </dl>
              <a className="text-icon-button native-open-link" href={selectedNativeHref} target="_blank" rel="noreferrer">
                <ExternalLink size={15} aria-hidden="true" />
                {copy.openNativeObject}
              </a>
              <h4>{copy.relatedResources}</h4>
              <ul>
                {selectedRelatedEdges.slice(0, 8).map((edge) => {
                  const relatedId = edge.from === selectedNode.id ? edge.to : edge.from;
                  const relatedNode = (topology?.nodes ?? []).find((node) => node.id === relatedId);
                  return (
                    <li key={edge.id}>
                      <strong>{edge.label}</strong>
                      <span>{relatedNode ? `${relatedNode.item.kind}/${relatedNode.label}` : relatedId}</span>
                    </li>
                  );
                })}
                {!selectedRelatedEdges.length ? <li>-</li> : null}
              </ul>
              <details>
                <summary>{copy.nodeEvidence}</summary>
                <ul>
                  {selectedNode.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p>{copy.noSelection}</p>
          )}
        </aside>
      </div>

      <div className="topology-summary-grid">
        {nodeOrder.map((type) => {
          const items = summaryByType(topology?.nodes ?? [], type);
          const Icon = nodeIcons[type];
          return (
            <article className="topology-summary-card" key={type}>
              <h3>
                <Icon size={15} aria-hidden="true" />
                {copy[type]}
              </h3>
              <strong>{items.length}</strong>
              <div>
                {items.slice(0, 4).map((item) => (
                  <span className={`status-pill ${item.health}`} key={item.id}>
                    {item.label}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <details className="topology-evidence" data-testid="ocp-topology-evidence">
        <summary>{copy.evidence}</summary>
        <ul>
          {(topology?.evidence ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {topology?.errors.length ? (
          <>
            <h3>{copy.errors}</h3>
            <ul>
              {topology.errors.map((item) => (
                <li key={`${item.resource}-${item.message}`}>
                  <strong>{item.resource}</strong>: {item.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
    </section>
  );
}
