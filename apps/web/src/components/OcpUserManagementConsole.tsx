import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import { AlertTriangle, KeyRound, RefreshCw, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";

export type OcpUserManagementView =
  | "users"
  | "groups"
  | "serviceaccounts"
  | "roles"
  | "rolebindings";

interface OcpUserManagementConsoleProps {
  language: UiLanguage;
  view: OcpUserManagementView;
}

interface ResourceState {
  users?: OcpResourceListResponse;
  groups?: OcpResourceListResponse;
  serviceAccounts?: OcpResourceListResponse;
  roles?: OcpResourceListResponse;
  clusterRoles?: OcpResourceListResponse;
  roleBindings?: OcpResourceListResponse;
  clusterRoleBindings?: OcpResourceListResponse;
}

const userCopy = {
  en: {
    eyebrow: "User Management",
    title: "OpenShift User Management",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    users: "Users",
    groups: "Groups",
    serviceaccounts: "ServiceAccounts",
    roles: "Roles",
    rolebindings: "RoleBindings",
    identities: "Identities",
    members: "Members",
    namespace: "Namespace",
    secrets: "Secrets",
    imagePullSecrets: "ImagePullSecrets",
    rules: "Rules",
    apiGroups: "API groups",
    resources: "Resources",
    verbs: "Verbs",
    subjects: "Subjects",
    roleRef: "Role reference",
    rbacSubjects: "RBAC subjects",
    rbacRules: "RBAC rules",
    workloadIdentity: "Workload identity",
    bindingMap: "Binding map",
    rbacSubjectsBody: "Users and Groups define human identities and membership without exposing credentials.",
    rbacRulesBody: "Roles and ClusterRoles define allowed API groups, resources, and verbs.",
    workloadIdentityBody: "ServiceAccounts connect workloads to pull secrets and RBAC subjects without showing token values.",
    bindingMapBody: "RoleBindings and ClusterRoleBindings connect subjects to permissions.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Create, edit, delete, and permission changes remain native OpenShift actions. OpsLens mirrors RBAC relationships and prepares approval-gated plans.",
    noUsers: "No Users were returned. OAuth identity resources may be absent in this cluster.",
    noGroups: "No Groups were returned.",
    noServiceAccounts: "No ServiceAccounts were returned.",
    noRoles: "No Roles or ClusterRoles were returned.",
    noRoleBindings: "No RoleBindings or ClusterRoleBindings were returned.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "사용자 관리",
    title: "OpenShift 사용자 관리",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    users: "사용자",
    groups: "그룹",
    serviceaccounts: "서비스 계정",
    roles: "역할",
    rolebindings: "역할 바인딩",
    identities: "Identity",
    members: "멤버",
    namespace: "네임스페이스",
    secrets: "Secret",
    imagePullSecrets: "ImagePullSecret",
    rules: "규칙",
    apiGroups: "API 그룹",
    resources: "리소스",
    verbs: "동작",
    subjects: "주체",
    roleRef: "역할 참조",
    rbacSubjects: "RBAC 주체",
    rbacRules: "RBAC 규칙",
    workloadIdentity: "워크로드 Identity",
    bindingMap: "바인딩 관계",
    rbacSubjectsBody: "User와 Group은 자격증명을 노출하지 않고 사용자 identity와 멤버십을 정의합니다.",
    rbacRulesBody: "Role과 ClusterRole은 허용 API 그룹, 리소스, 동작을 정의합니다.",
    workloadIdentityBody: "ServiceAccount는 토큰 값을 보여주지 않고 워크로드와 pull secret/RBAC 주체를 연결합니다.",
    bindingMapBody: "RoleBinding과 ClusterRoleBinding은 주체와 권한을 연결합니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "생성, 수정, 삭제, 권한 변경은 OpenShift 원본 기능으로 남깁니다. OpsLens는 RBAC 관계를 복제하고 승인 기반 계획을 준비합니다.",
    noUsers: "반환된 User가 없습니다. 이 클러스터에 OAuth identity 리소스가 없을 수 있습니다.",
    noGroups: "반환된 Group이 없습니다.",
    noServiceAccounts: "반환된 ServiceAccount가 없습니다.",
    noRoles: "반환된 Role 또는 ClusterRole이 없습니다.",
    noRoleBindings: "반환된 RoleBinding 또는 ClusterRoleBinding이 없습니다.",
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

function viewTestId(view: OcpUserManagementView) {
  return `ocp-user-${view}`;
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.users?.status.reachable ||
      state.groups?.status.reachable ||
      state.serviceAccounts?.status.reachable ||
      state.roles?.status.reachable ||
      state.clusterRoles?.status.reachable ||
      state.roleBindings?.status.reachable ||
      state.clusterRoleBindings?.status.reachable
  );
}

function countArray(value: unknown, key: string) {
  return arrayField(value, key).length;
}

function firstRule(item: OcpResourceSummary) {
  const rule = asRecord(arrayField(item, "rules")[0] ?? arrayField(item.spec, "rules")[0]);
  return {
    apiGroups: arrayField(rule, "apiGroups").join(", ") || "-",
    resources: arrayField(rule, "resources").join(", ") || "-",
    verbs: arrayField(rule, "verbs").join(", ") || "-"
  };
}

function bindingRoleRef(item: OcpResourceSummary) {
  const roleRef = asRecord(asRecord(item).roleRef ?? asRecord(item.spec).roleRef);
  return [stringField(roleRef, "kind"), stringField(roleRef, "name")].filter(Boolean).join("/") || "-";
}

function bindingSubjects(item: OcpResourceSummary) {
  const subjects = arrayField(item, "subjects").length ? arrayField(item, "subjects") : arrayField(item.spec, "subjects");
  return subjects
    .slice(0, 3)
    .map((subject) => [stringField(subject, "kind"), stringField(subject, "name")].filter(Boolean).join("/"))
    .filter(Boolean)
    .join(", ") || "-";
}

export function OcpUserManagementConsole({ language, view }: OcpUserManagementConsoleProps) {
  const copy = userCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({ apiVersion: "user.openshift.io/v1", resource: "users", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "user.openshift.io/v1", resource: "groups", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "serviceaccounts", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "rbac.authorization.k8s.io/v1", resource: "roles", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "rbac.authorization.k8s.io/v1", resource: "clusterroles", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "rbac.authorization.k8s.io/v1", resource: "rolebindings", limit: 120, full: true }),
      fetchOcpResourceList({ apiVersion: "rbac.authorization.k8s.io/v1", resource: "clusterrolebindings", limit: 120, full: true })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      if (index === 0) next.users = result.value;
      if (index === 1) next.groups = result.value;
      if (index === 2) next.serviceAccounts = result.value;
      if (index === 3) next.roles = result.value;
      if (index === 4) next.clusterRoles = result.value;
      if (index === 5) next.roleBindings = result.value;
      if (index === 6) next.clusterRoleBindings = result.value;
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

  const users = state.users?.items ?? [];
  const groups = state.groups?.items ?? [];
  const serviceAccounts = state.serviceAccounts?.items ?? [];
  const roles = [...(state.roles?.items ?? []), ...(state.clusterRoles?.items ?? [])];
  const roleBindings = [...(state.roleBindings?.items ?? []), ...(state.clusterRoleBindings?.items ?? [])];
  const failureMessages = [
    failureText(state.users),
    failureText(state.groups),
    failureText(state.serviceAccounts),
    failureText(state.roles),
    failureText(state.clusterRoles),
    failureText(state.roleBindings),
    failureText(state.clusterRoleBindings),
    ...errors
  ].filter(Boolean);

  return (
    <section className="ocp-user-console" data-testid={viewTestId(view)} aria-labelledby="ocp-user-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-user-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-user-toolbar" data-testid="ocp-user-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.users}: {users.length}</span>
        <span>{copy.groups}: {groups.length}</span>
        <span>{copy.serviceaccounts}: {serviceAccounts.length}</span>
        <span>{copy.roles}: {roles.length}</span>
        <span>{copy.rolebindings}: {roleBindings.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-user-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-user-tabs" aria-label={copy.title}>
        {(["users", "groups", "serviceaccounts", "roles", "rolebindings"] as const).map((tab) => (
          <a key={tab} href={`#${viewTestId(tab)}`} aria-current={view === tab ? "page" : undefined}>
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="user-native-grid">
        <article className="user-native-card" data-testid="ocp-user-subjects-board">
          <div className="card-title-row"><h3>{copy.rbacSubjects}</h3><UsersRound size={18} aria-hidden="true" /></div>
          <p>{copy.rbacSubjectsBody}</p>
          <strong className="user-card-number">{users.length}/{groups.length}</strong>
        </article>
        <article className="user-native-card">
          <div className="card-title-row"><h3>{copy.workloadIdentity}</h3><UserRound size={18} aria-hidden="true" /></div>
          <p>{copy.workloadIdentityBody}</p>
          <strong className="user-card-number">{serviceAccounts.length}</strong>
        </article>
        <article className="user-native-card">
          <div className="card-title-row"><h3>{copy.rbacRules}</h3><ShieldCheck size={18} aria-hidden="true" /></div>
          <p>{copy.rbacRulesBody}</p>
          <strong className="user-card-number">{roles.length}</strong>
        </article>
        <article className="user-native-card">
          <div className="card-title-row"><h3>{copy.bindingMap}</h3><KeyRound size={18} aria-hidden="true" /></div>
          <p>{copy.bindingMapBody}</p>
          <strong className="user-card-number">{roleBindings.length}</strong>
        </article>
      </div>

      {view === "users" ? (
        <article className="user-native-panel">
          <h3>{copy.users}</h3>
          {users.length ? (
            <div className="native-user-table-wrap">
              <table className="native-user-table" data-testid="ocp-user-users-table">
                <thead><tr><th>{copy.users}</th><th>{copy.identities}</th><th>{copy.groups}</th></tr></thead>
                <tbody>{users.map((item) => <tr key={item.metadata.name}><td><strong>{item.metadata.name}</strong></td><td>{countArray(item, "identities")}</td><td>{countArray(item, "groups")}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="empty-state">{copy.noUsers}</p>}
        </article>
      ) : null}

      {view === "groups" ? (
        <article className="user-native-panel">
          <h3>{copy.groups}</h3>
          {groups.length ? (
            <div className="native-user-table-wrap">
              <table className="native-user-table" data-testid="ocp-user-groups-table">
                <thead><tr><th>{copy.groups}</th><th>{copy.members}</th></tr></thead>
                <tbody>{groups.map((item) => <tr key={item.metadata.name}><td><strong>{item.metadata.name}</strong></td><td>{arrayField(item, "users").join(", ") || "-"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="empty-state">{copy.noGroups}</p>}
        </article>
      ) : null}

      {view === "serviceaccounts" ? (
        <article className="user-native-panel">
          <h3>{copy.serviceaccounts}</h3>
          {serviceAccounts.length ? (
            <div className="native-user-table-wrap">
              <table className="native-user-table" data-testid="ocp-user-serviceaccounts-table">
                <thead><tr><th>{copy.serviceaccounts}</th><th>{copy.namespace}</th><th>{copy.secrets}</th><th>{copy.imagePullSecrets}</th></tr></thead>
                <tbody>{serviceAccounts.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><strong>{item.metadata.name}</strong></td><td>{item.metadata.namespace ?? "-"}</td><td>{countArray(item, "secrets")}</td><td>{countArray(item, "imagePullSecrets")}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="empty-state">{copy.noServiceAccounts}</p>}
        </article>
      ) : null}

      {view === "roles" ? (
        <article className="user-native-panel">
          <h3>{copy.roles}</h3>
          {roles.length ? (
            <div className="native-user-table-wrap">
              <table className="native-user-table" data-testid="ocp-user-roles-table">
                <thead><tr><th>{copy.roles}</th><th>{copy.namespace}</th><th>{copy.rules}</th><th>{copy.apiGroups}</th><th>{copy.resources}</th><th>{copy.verbs}</th></tr></thead>
                <tbody>{roles.map((item) => { const rule = firstRule(item); return <tr key={`${item.kind}-${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}><td><strong>{item.kind}/{item.metadata.name}</strong></td><td>{item.metadata.namespace ?? "-"}</td><td>{countArray(item, "rules")}</td><td>{rule.apiGroups}</td><td>{rule.resources}</td><td>{rule.verbs}</td></tr>; })}</tbody>
              </table>
            </div>
          ) : <p className="empty-state">{copy.noRoles}</p>}
        </article>
      ) : null}

      {view === "rolebindings" ? (
        <article className="user-native-panel">
          <h3>{copy.rolebindings}</h3>
          {roleBindings.length ? (
            <div className="native-user-table-wrap">
              <table className="native-user-table" data-testid="ocp-user-rolebindings-table">
                <thead><tr><th>{copy.rolebindings}</th><th>{copy.namespace}</th><th>{copy.roleRef}</th><th>{copy.subjects}</th></tr></thead>
                <tbody>{roleBindings.map((item) => <tr key={`${item.kind}-${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}><td><strong>{item.kind}/{item.metadata.name}</strong></td><td>{item.metadata.namespace ?? "-"}</td><td>{bindingRoleRef(item)}</td><td>{bindingSubjects(item)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="empty-state">{copy.noRoleBindings}</p>}
        </article>
      ) : null}

      <aside className="user-native-boundary" data-testid="ocp-user-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
