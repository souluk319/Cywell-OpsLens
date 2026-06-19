import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  AlertTriangle,
  Boxes,
  FileCode2,
  Gauge,
  RefreshCw,
  Settings2,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";

export type OcpAdministrationView =
  | "cluster-settings"
  | "clusteroperators"
  | "namespaces"
  | "custom-resource-definitions"
  | "resourcequotas"
  | "limitranges";

interface OcpAdministrationConsoleProps {
  language: UiLanguage;
  view: OcpAdministrationView;
}

interface ResourceState {
  clusterVersions?: OcpResourceListResponse;
  clusterOperators?: OcpResourceListResponse;
  namespaces?: OcpResourceListResponse;
  crds?: OcpResourceListResponse;
  apiServices?: OcpResourceListResponse;
  resourceQuotas?: OcpResourceListResponse;
  limitRanges?: OcpResourceListResponse;
  consolePlugins?: OcpResourceListResponse;
}

const administrationCopy = {
  en: {
    eyebrow: "Administration",
    title: "OpenShift Administration",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    "cluster-settings": "Cluster Settings",
    clusteroperators: "ClusterOperators",
    namespaces: "Namespaces",
    "custom-resource-definitions": "CustomResourceDefinitions",
    resourcequotas: "ResourceQuotas",
    limitranges: "LimitRanges",
    version: "Version",
    channel: "Channel",
    available: "Available",
    progressing: "Progressing",
    degraded: "Degraded",
    message: "Message",
    namespace: "Namespace",
    phase: "Phase",
    labels: "Labels",
    age: "Age",
    scope: "Scope",
    group: "Group",
    versions: "Versions",
    established: "Established",
    used: "Used",
    hard: "Hard",
    type: "Type",
    limits: "Limits",
    clusterUpdate: "Cluster update state",
    operatorHealth: "Operator health",
    apiSurface: "API surface",
    tenantGuard: "Tenant guardrails",
    clusterUpdateBody: "ClusterVersion and channel evidence define whether the cluster can update.",
    operatorHealthBody: "ClusterOperators expose Available, Progressing, and Degraded conditions.",
    apiSurfaceBody: "CRDs and APIServices define the API objects that appear in the console.",
    tenantGuardBody: "Namespaces, quotas, and limit ranges constrain tenant resource usage.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Patch, delete, update, and RBAC changes remain native OpenShift actions. OpsLens mirrors the administrative baseline and prepares approval-gated plans.",
    noClusterOperators: "No ClusterOperators were returned by the cluster.",
    noNamespaces: "No Namespaces were returned by the cluster.",
    noCrds: "No CustomResourceDefinitions were returned by the cluster.",
    noQuotas: "No ResourceQuotas were returned by the cluster.",
    noLimits: "No LimitRanges were returned by the cluster.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "관리",
    title: "OpenShift 관리",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    "cluster-settings": "클러스터 설정",
    clusteroperators: "ClusterOperators",
    namespaces: "네임스페이스",
    "custom-resource-definitions": "CustomResourceDefinitions",
    resourcequotas: "ResourceQuotas",
    limitranges: "LimitRanges",
    version: "버전",
    channel: "채널",
    available: "Available",
    progressing: "Progressing",
    degraded: "Degraded",
    message: "메시지",
    namespace: "네임스페이스",
    phase: "상태",
    labels: "라벨",
    age: "나이",
    scope: "범위",
    group: "그룹",
    versions: "버전",
    established: "Established",
    used: "사용량",
    hard: "제한",
    type: "유형",
    limits: "제한",
    clusterUpdate: "클러스터 업데이트 상태",
    operatorHealth: "Operator 상태",
    apiSurface: "API 표면",
    tenantGuard: "Tenant 제한",
    clusterUpdateBody: "ClusterVersion과 채널 근거는 클러스터 업데이트 가능 여부를 정의합니다.",
    operatorHealthBody: "ClusterOperator는 Available, Progressing, Degraded condition을 제공합니다.",
    apiSurfaceBody: "CRD와 APIService는 콘솔에 표시되는 API 객체를 정의합니다.",
    tenantGuardBody: "Namespace, quota, limit range는 tenant 리소스 사용을 제한합니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "패치, 삭제, 업데이트, RBAC 변경은 OpenShift 원본 기능으로 남깁니다. OpsLens는 관리 기준 화면을 복제하고 승인 기반 계획을 준비합니다.",
    noClusterOperators: "클러스터에서 반환된 ClusterOperator가 없습니다.",
    noNamespaces: "클러스터에서 반환된 Namespace가 없습니다.",
    noCrds: "클러스터에서 반환된 CustomResourceDefinition이 없습니다.",
    noQuotas: "클러스터에서 반환된 ResourceQuota가 없습니다.",
    noLimits: "클러스터에서 반환된 LimitRange가 없습니다.",
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

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
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

function condition(item: OcpResourceSummary, type: string) {
  return arrayField(item.status, "conditions").find((entry) => stringField(entry, "type") === type);
}

function conditionStatus(item: OcpResourceSummary, type: string) {
  return stringField(condition(item, type), "status") ?? "-";
}

function conditionMessage(item: OcpResourceSummary, type: string) {
  return stringField(condition(item, type), "message") ?? stringField(condition(item, type), "reason") ?? "-";
}

function clusterVersion(item: OcpResourceSummary | undefined) {
  const history = arrayField(item?.status, "history").map(asRecord);
  return stringField(history[0], "version") ?? "-";
}

function clusterChannel(item: OcpResourceSummary | undefined) {
  return stringField(item?.spec, "channel") ?? "-";
}

function clusterUpgradeable(item: OcpResourceSummary | undefined) {
  return item ? conditionStatus(item, "Upgradeable") : "-";
}

function crdGroup(item: OcpResourceSummary) {
  return stringField(item.spec, "group") ?? "-";
}

function crdVersions(item: OcpResourceSummary) {
  return arrayField(item.spec, "versions")
    .map((version) => stringField(version, "name"))
    .filter(Boolean)
    .join(", ") || "-";
}

function crdEstablished(item: OcpResourceSummary) {
  return conditionStatus(item, "Established");
}

function quotaPairs(value: unknown) {
  const record = asRecord(value);
  const entries = Object.entries(record).slice(0, 4);
  return entries.length > 0 ? entries.map(([key, entryValue]) => `${key}: ${String(entryValue)}`).join(", ") : "-";
}

function limitSummary(item: OcpResourceSummary) {
  const limits = arrayField(item.spec, "limits");
  return limits.length > 0
    ? limits.map((limit) => stringField(limit, "type") ?? "-").join(", ")
    : "-";
}

function labelCount(item: OcpResourceSummary) {
  return Object.keys(item.metadata.labels ?? {}).length;
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.clusterVersions?.status.reachable ||
      state.clusterOperators?.status.reachable ||
      state.namespaces?.status.reachable ||
      state.crds?.status.reachable ||
      state.resourceQuotas?.status.reachable ||
      state.limitRanges?.status.reachable
  );
}

function viewTestId(view: OcpAdministrationView) {
  return `ocp-admin-${view}`;
}

function boolTone(value: string) {
  if (value === "True") return "ready";
  if (value === "False") return "danger";
  return "neutral";
}

export function OcpAdministrationConsole({ language, view }: OcpAdministrationConsoleProps) {
  const copy = administrationCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({ apiVersion: "config.openshift.io/v1", resource: "clusterversions", limit: 20, full: true }),
      fetchOcpResourceList({ apiVersion: "config.openshift.io/v1", resource: "clusteroperators", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "namespaces", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "apiextensions.k8s.io/v1", resource: "customresourcedefinitions", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "apiregistration.k8s.io/v1", resource: "apiservices", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "resourcequotas", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "limitranges", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "console.openshift.io/v1", resource: "consoleplugins", limit: 80, full: true })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      if (index === 0) next.clusterVersions = result.value;
      if (index === 1) next.clusterOperators = result.value;
      if (index === 2) next.namespaces = result.value;
      if (index === 3) next.crds = result.value;
      if (index === 4) next.apiServices = result.value;
      if (index === 5) next.resourceQuotas = result.value;
      if (index === 6) next.limitRanges = result.value;
      if (index === 7) next.consolePlugins = result.value;
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

  const clusterVersions = state.clusterVersions?.items ?? [];
  const clusterVersionItem = clusterVersions[0];
  const clusterOperators = state.clusterOperators?.items ?? [];
  const namespaces = state.namespaces?.items ?? [];
  const crds = state.crds?.items ?? [];
  const apiServices = state.apiServices?.items ?? [];
  const resourceQuotas = state.resourceQuotas?.items ?? [];
  const limitRanges = state.limitRanges?.items ?? [];
  const consolePlugins = state.consolePlugins?.items ?? [];
  const degradedOperators = clusterOperators.filter((item) => conditionStatus(item, "Degraded") === "True");
  const unavailableOperators = clusterOperators.filter((item) => conditionStatus(item, "Available") !== "True");
  const activeNamespaces = namespaces.filter((item) => stringField(item.status, "phase") === "Active");
  const establishedCrds = crds.filter((item) => crdEstablished(item) === "True");
  const failureMessages = [
    failureText(state.clusterVersions),
    failureText(state.clusterOperators),
    failureText(state.namespaces),
    failureText(state.crds),
    failureText(state.apiServices),
    failureText(state.resourceQuotas),
    failureText(state.limitRanges),
    failureText(state.consolePlugins),
    ...errors
  ].filter(Boolean);

  return (
    <section className="ocp-admin-console" data-testid={viewTestId(view)} aria-labelledby="ocp-admin-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-admin-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-admin-toolbar" data-testid="ocp-admin-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.version}: {clusterVersion(clusterVersionItem)}</span>
        <span>{copy.clusteroperators}: {clusterOperators.length}</span>
        <span>{copy.namespaces}: {namespaces.length}</span>
        <span>{copy["custom-resource-definitions"]}: {crds.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-admin-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-admin-tabs" aria-label={copy.title}>
        {(["cluster-settings", "clusteroperators", "namespaces", "custom-resource-definitions", "resourcequotas", "limitranges"] as const).map((tab) => (
          <a key={tab} href={`#${viewTestId(tab)}`} aria-current={view === tab ? "page" : undefined}>
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="admin-native-grid">
        <article className="admin-native-card" data-testid="ocp-admin-cluster-settings-board">
          <div className="card-title-row">
            <h3>{copy.clusterUpdate}</h3>
            <Settings2 size={18} aria-hidden="true" />
          </div>
          <p>{copy.clusterUpdateBody}</p>
          <div className="admin-summary-line">
            <span>{copy.version}: <strong>{clusterVersion(clusterVersionItem)}</strong></span>
            <span>{copy.channel}: <strong>{clusterChannel(clusterVersionItem)}</strong></span>
            <span>Upgradeable: <strong>{clusterUpgradeable(clusterVersionItem)}</strong></span>
          </div>
        </article>
        <article className="admin-native-card">
          <div className="card-title-row">
            <h3>{copy.operatorHealth}</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <p>{copy.operatorHealthBody}</p>
          <strong className="admin-card-number">{degradedOperators.length}/{unavailableOperators.length}</strong>
        </article>
        <article className="admin-native-card">
          <div className="card-title-row">
            <h3>{copy.apiSurface}</h3>
            <FileCode2 size={18} aria-hidden="true" />
          </div>
          <p>{copy.apiSurfaceBody}</p>
          <strong className="admin-card-number">{establishedCrds.length}/{crds.length}</strong>
        </article>
        <article className="admin-native-card">
          <div className="card-title-row">
            <h3>{copy.tenantGuard}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>{copy.tenantGuardBody}</p>
          <strong className="admin-card-number">{activeNamespaces.length}/{namespaces.length}</strong>
        </article>
      </div>

      {view === "cluster-settings" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy["cluster-settings"]}</h3>
            <Settings2 size={18} aria-hidden="true" />
          </div>
          <div className="admin-settings-grid">
            <dl>
              <dt>{copy.version}</dt>
              <dd>{clusterVersion(clusterVersionItem)}</dd>
              <dt>{copy.channel}</dt>
              <dd>{clusterChannel(clusterVersionItem)}</dd>
              <dt>Upgradeable</dt>
              <dd>{clusterUpgradeable(clusterVersionItem)}</dd>
              <dt>{copy.message}</dt>
              <dd>{conditionMessage(clusterVersionItem ?? ({} as OcpResourceSummary), "Upgradeable")}</dd>
            </dl>
            <dl>
              <dt>ConsolePlugins</dt>
              <dd>{consolePlugins.length}</dd>
              <dt>APIServices</dt>
              <dd>{apiServices.length}</dd>
              <dt>{copy["custom-resource-definitions"]}</dt>
              <dd>{crds.length}</dd>
            </dl>
          </div>
        </article>
      ) : null}

      {view === "clusteroperators" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy.clusteroperators}</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          {clusterOperators.length > 0 ? (
            <div className="native-admin-table-wrap">
              <table className="native-admin-table" data-testid="ocp-admin-clusteroperators-table">
                <thead>
                  <tr>
                    <th>{copy.clusteroperators}</th>
                    <th>{copy.version}</th>
                    <th>{copy.available}</th>
                    <th>{copy.progressing}</th>
                    <th>{copy.degraded}</th>
                    <th>{copy.message}</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterOperators.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{stringField(item.status, "version") ?? "-"}</td>
                      <td><span className={`phase-chip ${boolTone(conditionStatus(item, "Available"))}`}>{conditionStatus(item, "Available")}</span></td>
                      <td>{conditionStatus(item, "Progressing")}</td>
                      <td>{conditionStatus(item, "Degraded")}</td>
                      <td>{conditionMessage(item, "Degraded")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noClusterOperators}</p>
          )}
        </article>
      ) : null}

      {view === "namespaces" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy.namespaces}</h3>
            <Boxes size={18} aria-hidden="true" />
          </div>
          {namespaces.length > 0 ? (
            <div className="native-admin-table-wrap">
              <table className="native-admin-table" data-testid="ocp-admin-namespaces-table">
                <thead>
                  <tr>
                    <th>{copy.namespaces}</th>
                    <th>{copy.phase}</th>
                    <th>{copy.labels}</th>
                    <th>{copy.age}</th>
                  </tr>
                </thead>
                <tbody>
                  {namespaces.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{stringField(item.status, "phase") ?? "-"}</td>
                      <td>{labelCount(item)}</td>
                      <td>{ageText(item.metadata.creationTimestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noNamespaces}</p>
          )}
        </article>
      ) : null}

      {view === "custom-resource-definitions" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy["custom-resource-definitions"]}</h3>
            <FileCode2 size={18} aria-hidden="true" />
          </div>
          {crds.length > 0 ? (
            <div className="native-admin-table-wrap">
              <table className="native-admin-table" data-testid="ocp-admin-crds-table">
                <thead>
                  <tr>
                    <th>{copy["custom-resource-definitions"]}</th>
                    <th>{copy.group}</th>
                    <th>{copy.scope}</th>
                    <th>{copy.versions}</th>
                    <th>{copy.established}</th>
                  </tr>
                </thead>
                <tbody>
                  {crds.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{crdGroup(item)}</td>
                      <td>{stringField(item.spec, "scope") ?? "-"}</td>
                      <td>{crdVersions(item)}</td>
                      <td><span className={`phase-chip ${boolTone(crdEstablished(item))}`}>{crdEstablished(item)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noCrds}</p>
          )}
        </article>
      ) : null}

      {view === "resourcequotas" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy.resourcequotas}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          {resourceQuotas.length > 0 ? (
            <div className="native-admin-table-wrap">
              <table className="native-admin-table" data-testid="ocp-admin-resourcequotas-table">
                <thead>
                  <tr>
                    <th>{copy.resourcequotas}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.used}</th>
                    <th>{copy.hard}</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceQuotas.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{quotaPairs(asRecord(item.status).used)}</td>
                      <td>{quotaPairs(asRecord(item.status).hard)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noQuotas}</p>
          )}
        </article>
      ) : null}

      {view === "limitranges" ? (
        <article className="admin-native-panel">
          <div className="card-title-row">
            <h3>{copy.limitranges}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          {limitRanges.length > 0 ? (
            <div className="native-admin-table-wrap">
              <table className="native-admin-table" data-testid="ocp-admin-limitranges-table">
                <thead>
                  <tr>
                    <th>{copy.limitranges}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.type}</th>
                    <th>{copy.limits}</th>
                  </tr>
                </thead>
                <tbody>
                  {limitRanges.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{limitSummary(item)}</td>
                      <td>{arrayField(item.spec, "limits").length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noLimits}</p>
          )}
        </article>
      ) : null}

      <aside className="admin-native-boundary" data-testid="ocp-admin-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
