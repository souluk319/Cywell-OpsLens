import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  AlertTriangle,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
  ServerCog
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import { OcpNativeObjectDrilldown } from "./OcpNativeObjectDrilldown";

export type OcpComputeView = "nodes" | "machines" | "machinesets" | "machineconfigpools";

interface OcpComputeConsoleProps {
  language: UiLanguage;
  view: OcpComputeView;
}

interface ResourceState {
  nodes?: OcpResourceListResponse;
  machines?: OcpResourceListResponse;
  machineSets?: OcpResourceListResponse;
  machineConfigPools?: OcpResourceListResponse;
}

const computeCopy = {
  en: {
    eyebrow: "Compute",
    title: "OpenShift Compute",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    nodes: "Nodes",
    machines: "Machines",
    machinesets: "MachineSets",
    machineconfigpools: "MachineConfigPools",
    readyNodes: "Ready nodes",
    nodePressure: "Node pressure",
    machineApi: "Machine API",
    rollout: "Config rollout",
    ready: "Ready",
    roles: "Roles",
    version: "Version",
    osImage: "OS image",
    kernel: "Kernel",
    kubelet: "Kubelet",
    capacity: "Capacity",
    allocatable: "Allocatable",
    cpu: "CPU",
    memory: "Memory",
    pods: "Pods",
    provider: "Provider",
    phase: "Phase",
    node: "Node",
    desired: "Desired",
    current: "Current",
    available: "Available",
    updated: "Updated",
    degraded: "Degraded",
    updating: "Updating",
    paused: "Paused",
    message: "Message",
    clusterComputeBody: "Nodes expose readiness, capacity, architecture, pressure conditions, and kubelet state.",
    machineApiBody: "Machine API objects connect cluster nodes to provider lifecycle state when the API is installed.",
    rolloutBody: "MachineConfigPools show OS/config rollout health, degradation, and update blockers.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Drain, cordon, delete, scale, and MachineConfig changes remain native OpenShift actions. OpsLens mirrors compute state and prepares approval-gated plans.",
    noNodes: "No Nodes were returned by the cluster.",
    noMachines: "No Machines were returned. The Machine API may be absent in this cluster.",
    noMachineSets: "No MachineSets were returned. The Machine API may be absent in this cluster.",
    noMachineConfigPools: "No MachineConfigPools were returned by the cluster.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "컴퓨트",
    title: "OpenShift 컴퓨트",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    nodes: "노드",
    machines: "Machines",
    machinesets: "MachineSets",
    machineconfigpools: "MachineConfigPools",
    readyNodes: "준비된 노드",
    nodePressure: "노드 압박",
    machineApi: "Machine API",
    rollout: "설정 롤아웃",
    ready: "Ready",
    roles: "역할",
    version: "버전",
    osImage: "OS 이미지",
    kernel: "커널",
    kubelet: "Kubelet",
    capacity: "용량",
    allocatable: "할당 가능",
    cpu: "CPU",
    memory: "메모리",
    pods: "Pod",
    provider: "Provider",
    phase: "상태",
    node: "노드",
    desired: "희망",
    current: "현재",
    available: "사용 가능",
    updated: "업데이트됨",
    degraded: "저하",
    updating: "업데이트 중",
    paused: "일시 중지",
    message: "메시지",
    clusterComputeBody: "Node는 readiness, 용량, 아키텍처, pressure condition, kubelet 상태를 제공합니다.",
    machineApiBody: "Machine API 객체는 API가 설치된 경우 클러스터 노드와 provider lifecycle 상태를 연결합니다.",
    rolloutBody: "MachineConfigPool은 OS/config 롤아웃 상태, 저하, 업데이트 차단 근거를 보여줍니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "Drain, cordon, 삭제, scale, MachineConfig 변경은 OpenShift 원본 기능으로 남깁니다. OpsLens는 컴퓨트 상태를 복제하고 승인 기반 계획을 준비합니다.",
    noNodes: "클러스터에서 반환된 Node가 없습니다.",
    noMachines: "반환된 Machine이 없습니다. 이 클러스터에 Machine API가 없을 수 있습니다.",
    noMachineSets: "반환된 MachineSet이 없습니다. 이 클러스터에 Machine API가 없을 수 있습니다.",
    noMachineConfigPools: "클러스터에서 반환된 MachineConfigPool이 없습니다.",
    apiFailure: "API 조회 실패"
  }
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function boolField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "boolean" ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function condition(item: OcpResourceSummary, type: string) {
  return arrayField(item.status, "conditions").find((entry) => stringField(entry, "type") === type);
}

function conditionStatus(item: OcpResourceSummary, type: string) {
  return stringField(condition(item, type), "status") ?? "-";
}

function conditionMessage(item: OcpResourceSummary, type: string) {
  return stringField(condition(item, type), "message") ?? stringField(condition(item, type), "reason") ?? "-";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.nodes?.status.reachable ||
      state.machines?.status.reachable ||
      state.machineSets?.status.reachable ||
      state.machineConfigPools?.status.reachable
  );
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function viewTestId(view: OcpComputeView) {
  return `ocp-compute-${view}`;
}

function nodeRoles(item: OcpResourceSummary) {
  return Object.keys(item.metadata.labels ?? {})
    .filter((label) => label.startsWith("node-role.kubernetes.io/"))
    .map((label) => label.replace("node-role.kubernetes.io/", "") || "worker")
    .join(", ") || "-";
}

function nodeInfo(item: OcpResourceSummary, key: string) {
  return stringField(asRecord(item.status).nodeInfo, key) ?? "-";
}

function capacity(item: OcpResourceSummary, key: string) {
  return String(asRecord(asRecord(item.status).capacity)[key] ?? "-");
}

function allocatable(item: OcpResourceSummary, key: string) {
  return String(asRecord(asRecord(item.status).allocatable)[key] ?? "-");
}

function pressureCount(nodes: OcpResourceSummary[]) {
  return nodes.filter((node) =>
    ["MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"].some(
      (type) => conditionStatus(node, type) === "True"
    )
  ).length;
}

function machinePhase(item: OcpResourceSummary) {
  return stringField(item.status, "phase") ?? stringField(item.status, "state") ?? "-";
}

function providerId(item: OcpResourceSummary) {
  return stringField(item.spec, "providerID") ?? stringField(item.status, "providerID") ?? "-";
}

function machineNode(item: OcpResourceSummary) {
  return stringField(item.status, "nodeRef") ?? stringField(asRecord(item.status).nodeRef, "name") ?? "-";
}

function replicaField(item: OcpResourceSummary, key: string) {
  return String(asRecord(item.status)[key] ?? asRecord(item.spec)[key] ?? "-");
}

function mcpBoolean(item: OcpResourceSummary, key: string) {
  const value = boolField(item.spec, key);
  return typeof value === "boolean" ? String(value) : "-";
}

function mcpCondition(item: OcpResourceSummary, type: string) {
  return conditionStatus(item, type);
}

function boolTone(value: string) {
  if (value === "True" || value === "Ready") return "ready";
  if (value === "False") return "neutral";
  return "danger";
}

export function OcpComputeConsole({ language, view }: OcpComputeConsoleProps) {
  const copy = computeCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({ apiVersion: "v1", resource: "nodes", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "machine.openshift.io/v1beta1", resource: "machines", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "machine.openshift.io/v1beta1", resource: "machinesets", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "machineconfiguration.openshift.io/v1", resource: "machineconfigpools", limit: 80, full: true })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      if (index === 0) next.nodes = result.value;
      if (index === 1) next.machines = result.value;
      if (index === 2) next.machineSets = result.value;
      if (index === 3) next.machineConfigPools = result.value;
    });

    setState(next);
    setErrors(nextErrors);
    if (!options.silent) setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const refreshId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 15000);
    return () => window.clearInterval(refreshId);
  }, []);

  const nodes = state.nodes?.items ?? [];
  const machines = state.machines?.items ?? [];
  const machineSets = state.machineSets?.items ?? [];
  const machineConfigPools = state.machineConfigPools?.items ?? [];
  const readyNodes = nodes.filter((node) => conditionStatus(node, "Ready") === "True").length;
  const pressureNodes = pressureCount(nodes);
  const degradedPools = machineConfigPools.filter((pool) => mcpCondition(pool, "Degraded") === "True");
  const updatingPools = machineConfigPools.filter((pool) => mcpCondition(pool, "Updating") === "True");
  const failureMessages = [
    failureText(state.nodes),
    failureText(state.machines),
    failureText(state.machineSets),
    failureText(state.machineConfigPools),
    ...errors
  ].filter(Boolean);

  const activeItems = useMemo(() => {
    if (view === "nodes") return nodes;
    if (view === "machines") return machines;
    if (view === "machinesets") return machineSets;
    return machineConfigPools;
  }, [machineConfigPools, machineSets, machines, nodes, view]);
  const drilldown =
    view === "nodes"
      ? {
          resource: { apiVersion: "v1", resource: "nodes" },
          items: nodes,
          title: copy.nodes
        }
      : view === "machines"
        ? {
            resource: { apiVersion: "machine.openshift.io/v1beta1", resource: "machines" },
            items: machines,
            title: copy.machines
          }
        : view === "machinesets"
          ? {
              resource: { apiVersion: "machine.openshift.io/v1beta1", resource: "machinesets" },
              items: machineSets,
              title: copy.machinesets
            }
          : {
              resource: { apiVersion: "machineconfiguration.openshift.io/v1", resource: "machineconfigpools" },
              items: machineConfigPools,
              title: copy.machineconfigpools
            };

  return (
    <section className="ocp-compute-console" data-testid={viewTestId(view)} aria-labelledby="ocp-compute-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-compute-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-compute-toolbar" data-testid="ocp-compute-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.nodes}: {nodes.length}</span>
        <span>{copy.machines}: {machines.length}</span>
        <span>{copy.machinesets}: {machineSets.length}</span>
        <span>{copy.machineconfigpools}: {machineConfigPools.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-compute-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-compute-tabs" aria-label={copy.title}>
        {(["nodes", "machines", "machinesets", "machineconfigpools"] as const).map((tab) => (
          <a key={tab} href={`#${viewTestId(tab)}`} aria-current={view === tab ? "page" : undefined}>
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="compute-native-grid">
        <article className="compute-native-card" data-testid="ocp-compute-readiness-board">
          <div className="card-title-row">
            <h3>{copy.readyNodes}</h3>
            <Server size={18} aria-hidden="true" />
          </div>
          <p>{copy.clusterComputeBody}</p>
          <strong className="compute-card-number">{readyNodes}/{nodes.length}</strong>
        </article>
        <article className="compute-native-card">
          <div className="card-title-row">
            <h3>{copy.nodePressure}</h3>
            <HardDrive size={18} aria-hidden="true" />
          </div>
          <p>{copy.clusterComputeBody}</p>
          <strong className="compute-card-number">{pressureNodes}</strong>
        </article>
        <article className="compute-native-card">
          <div className="card-title-row">
            <h3>{copy.machineApi}</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          <p>{copy.machineApiBody}</p>
          <strong className="compute-card-number">{machines.length}/{machineSets.length}</strong>
        </article>
        <article className="compute-native-card">
          <div className="card-title-row">
            <h3>{copy.rollout}</h3>
            <ServerCog size={18} aria-hidden="true" />
          </div>
          <p>{copy.rolloutBody}</p>
          <strong className="compute-card-number">{updatingPools.length}/{degradedPools.length}</strong>
        </article>
      </div>

      {view === "nodes" ? (
        <article className="compute-native-panel">
          <div className="card-title-row">
            <h3>{copy.nodes}</h3>
            <Server size={18} aria-hidden="true" />
          </div>
          {nodes.length > 0 ? (
            <div className="native-compute-table-wrap">
              <table className="native-compute-table" data-testid="ocp-compute-nodes-table">
                <thead>
                  <tr>
                    <th>{copy.nodes}</th>
                    <th>{copy.ready}</th>
                    <th>{copy.roles}</th>
                    <th>{copy.version}</th>
                    <th>{copy.cpu}</th>
                    <th>{copy.memory}</th>
                    <th>{copy.pods}</th>
                    <th>{copy.osImage}</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td><span className={`phase-chip ${boolTone(conditionStatus(item, "Ready"))}`}>{conditionStatus(item, "Ready")}</span></td>
                      <td>{nodeRoles(item)}</td>
                      <td>{nodeInfo(item, "kubeletVersion")}</td>
                      <td>{allocatable(item, "cpu")} / {capacity(item, "cpu")}</td>
                      <td>{allocatable(item, "memory")} / {capacity(item, "memory")}</td>
                      <td>{allocatable(item, "pods")} / {capacity(item, "pods")}</td>
                      <td>{nodeInfo(item, "osImage")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noNodes}</p>
          )}
        </article>
      ) : null}

      {view === "machines" ? (
        <article className="compute-native-panel">
          <div className="card-title-row">
            <h3>{copy.machines}</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          {machines.length > 0 ? (
            <div className="native-compute-table-wrap">
              <table className="native-compute-table" data-testid="ocp-compute-machines-table">
                <thead>
                  <tr>
                    <th>{copy.machines}</th>
                    <th>{copy.phase}</th>
                    <th>{copy.node}</th>
                    <th>{copy.provider}</th>
                    <th>{copy.message}</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.namespace ? `${item.metadata.namespace}/` : ""}{item.metadata.name}</strong></td>
                      <td>{machinePhase(item)}</td>
                      <td>{machineNode(item)}</td>
                      <td>{providerId(item)}</td>
                      <td>{conditionMessage(item, "Ready")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noMachines}</p>
          )}
        </article>
      ) : null}

      {view === "machinesets" ? (
        <article className="compute-native-panel">
          <div className="card-title-row">
            <h3>{copy.machinesets}</h3>
            <Cpu size={18} aria-hidden="true" />
          </div>
          {machineSets.length > 0 ? (
            <div className="native-compute-table-wrap">
              <table className="native-compute-table" data-testid="ocp-compute-machinesets-table">
                <thead>
                  <tr>
                    <th>{copy.machinesets}</th>
                    <th>{copy.desired}</th>
                    <th>{copy.current}</th>
                    <th>{copy.available}</th>
                    <th>{copy.ready}</th>
                  </tr>
                </thead>
                <tbody>
                  {machineSets.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.namespace ? `${item.metadata.namespace}/` : ""}{item.metadata.name}</strong></td>
                      <td>{replicaField(item, "replicas")}</td>
                      <td>{replicaField(item, "replicas")}</td>
                      <td>{replicaField(item, "availableReplicas")}</td>
                      <td>{replicaField(item, "readyReplicas")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noMachineSets}</p>
          )}
        </article>
      ) : null}

      {view === "machineconfigpools" ? (
        <article className="compute-native-panel">
          <div className="card-title-row">
            <h3>{copy.machineconfigpools}</h3>
            <MemoryStick size={18} aria-hidden="true" />
          </div>
          {machineConfigPools.length > 0 ? (
            <div className="native-compute-table-wrap">
              <table className="native-compute-table" data-testid="ocp-compute-machineconfigpools-table">
                <thead>
                  <tr>
                    <th>{copy.machineconfigpools}</th>
                    <th>{copy.updated}</th>
                    <th>{copy.updating}</th>
                    <th>{copy.degraded}</th>
                    <th>{copy.paused}</th>
                    <th>{copy.message}</th>
                  </tr>
                </thead>
                <tbody>
                  {machineConfigPools.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{mcpCondition(item, "Updated")}</td>
                      <td>{mcpCondition(item, "Updating")}</td>
                      <td>{mcpCondition(item, "Degraded")}</td>
                      <td>{mcpBoolean(item, "paused")}</td>
                      <td>{conditionMessage(item, "Degraded")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noMachineConfigPools}</p>
          )}
        </article>
      ) : null}

      <OcpNativeObjectDrilldown
        language={language}
        resource={drilldown.resource}
        items={drilldown.items}
        title={drilldown.title}
        testId="ocp-compute-object"
      />

      <aside className="compute-native-boundary" data-testid="ocp-compute-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
        <p>{copy[view]}: {activeItems.length}</p>
      </aside>
    </section>
  );
}
