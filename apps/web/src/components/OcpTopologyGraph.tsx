import type { OcpTopologyNode, OcpTopologyResponse } from "@kugnus/contracts";
import { useEffect, useMemo, useState } from "react";
import { Boxes, GitBranch, RefreshCw, Route, ServerCog, Workflow } from "lucide-react";
import type { UiLanguage } from "../i18n";
import { fetchOcpTopology } from "../lib/api";

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
    load: "Load",
    evidence: "Evidence",
    readOnly: "read-only graph",
    route: "Routes",
    service: "Services",
    deployment: "Deployments",
    pod: "Pods",
    cronjob: "CronJobs",
    job: "Jobs",
    noData: "No topology resources were returned for this scope.",
    errors: "Partial read gaps",
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
    load: "불러오기",
    evidence: "근거",
    readOnly: "읽기 전용 그래프",
    route: "Route",
    service: "Service",
    deployment: "Deployment",
    pod: "Pod",
    cronjob: "CronJob",
    job: "Job",
    noData: "이 범위에서 토폴로지 리소스가 반환되지 않았습니다.",
    errors: "부분 읽기 gap",
    ready: "정상",
    warning: "주의",
    danger: "위험",
    unknown: "미확인"
  }
} as const;

const nodeOrder: OcpTopologyNode["type"][] = [
  "route",
  "service",
  "deployment",
  "cronjob",
  "job",
  "pod"
];

const nodeIcons = {
  route: Route,
  service: ServerCog,
  deployment: Boxes,
  pod: Workflow,
  cronjob: GitBranch,
  job: GitBranch
} as const;

const nodeX: Record<OcpTopologyNode["type"], number> = {
  route: 9,
  service: 27,
  deployment: 48,
  cronjob: 48,
  job: 67,
  pod: 88
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

  const visualNodes = useMemo(
    () =>
      nodeOrder.flatMap((type) =>
        (topology?.nodes ?? [])
          .filter((node) => node.type === type)
          .slice(0, maxRenderedNodesPerType)
      ),
    [topology]
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

      <div className="topology-controls">
        <label>
          {copy.namespace}
          <input
            value={namespace}
            onChange={(event) => setNamespace(event.target.value)}
            placeholder={copy.allNamespaces}
          />
        </label>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          {copy.load}
        </button>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-topology-error">
          <span>{error}</span>
        </div>
      ) : null}

      <article className="topology-canvas" data-testid="ocp-topology-canvas">
        {topology && visualNodes.length > 0 ? (
          <svg viewBox="0 0 100 72" role="img" aria-label={copy.title}>
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
                  className={`topology-node ${node.type} ${node.health}`}
                  key={node.id}
                  transform={`translate(${position.x} ${position.y})`}
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
