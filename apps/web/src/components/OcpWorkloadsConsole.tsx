import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import { AlertTriangle, Boxes, Clock3, FileKey2, GitBranch, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import {
  nativeConsoleHref,
  nativeObjectPath,
  nativeResourceCreatePath,
  type NativeConsoleResourceRef
} from "../lib/nativeConsole";
import { NativeObjectLink } from "./NativeObjectLink";
import { OcpNativeObjectDrilldown, type NativeObjectLifecycleAction } from "./OcpNativeObjectDrilldown";

export type OcpWorkloadsView =
  | "workloads"
  | "deployments"
  | "deployment-configs"
  | "statefulsets"
  | "secrets"
  | "configmaps"
  | "cronjobs"
  | "jobs"
  | "daemonsets"
  | "replicasets"
  | "replicationcontrollers"
  | "horizontalpodautoscalers"
  | "poddisruptionbudgets";

interface OcpWorkloadsConsoleProps {
  language: UiLanguage;
  view: OcpWorkloadsView;
}

interface WorkloadResourceConfig {
  view: OcpWorkloadsView;
  apiVersion: string;
  resource: string;
  label: string;
  labelKo: string;
  testId: string;
  tableTestId: string;
}

type WorkloadState = Partial<Record<OcpWorkloadsView, OcpResourceListResponse>>;

const workloadResources: WorkloadResourceConfig[] = [
  { view: "workloads", apiVersion: "v1", resource: "pods", label: "Pods", labelKo: "파드", testId: "ocp-workloads-pods", tableTestId: "ocp-workloads-pods-table" },
  { view: "deployments", apiVersion: "apps/v1", resource: "deployments", label: "Deployments", labelKo: "배포", testId: "ocp-workloads-deployments", tableTestId: "ocp-workloads-deployments-table" },
  { view: "deployment-configs", apiVersion: "apps.openshift.io/v1", resource: "deploymentconfigs", label: "DeploymentConfigs", labelKo: "배포 설정", testId: "ocp-workloads-deploymentconfigs", tableTestId: "ocp-workloads-deploymentconfigs-table" },
  { view: "statefulsets", apiVersion: "apps/v1", resource: "statefulsets", label: "StatefulSets", labelKo: "상태 저장 세트", testId: "ocp-workloads-statefulsets", tableTestId: "ocp-workloads-statefulsets-table" },
  { view: "secrets", apiVersion: "v1", resource: "secrets", label: "Secrets", labelKo: "시크릿", testId: "ocp-workloads-secrets", tableTestId: "ocp-workloads-secrets-table" },
  { view: "configmaps", apiVersion: "v1", resource: "configmaps", label: "ConfigMaps", labelKo: "구성 맵", testId: "ocp-workloads-configmaps", tableTestId: "ocp-workloads-configmaps-table" },
  { view: "cronjobs", apiVersion: "batch/v1", resource: "cronjobs", label: "CronJobs", labelKo: "CronJobs", testId: "ocp-workloads-cronjobs", tableTestId: "ocp-workloads-cronjobs-table" },
  { view: "jobs", apiVersion: "batch/v1", resource: "jobs", label: "Jobs", labelKo: "작업", testId: "ocp-workloads-jobs", tableTestId: "ocp-workloads-jobs-table" },
  { view: "daemonsets", apiVersion: "apps/v1", resource: "daemonsets", label: "DaemonSets", labelKo: "데몬 세트", testId: "ocp-workloads-daemonsets", tableTestId: "ocp-workloads-daemonsets-table" },
  { view: "replicasets", apiVersion: "apps/v1", resource: "replicasets", label: "ReplicaSets", labelKo: "복제 세트", testId: "ocp-workloads-replicasets", tableTestId: "ocp-workloads-replicasets-table" },
  { view: "replicationcontrollers", apiVersion: "v1", resource: "replicationcontrollers", label: "ReplicationControllers", labelKo: "복제 컨트롤러", testId: "ocp-workloads-replicationcontrollers", tableTestId: "ocp-workloads-replicationcontrollers-table" },
  { view: "horizontalpodautoscalers", apiVersion: "autoscaling/v2", resource: "horizontalpodautoscalers", label: "HorizontalPodAutoscalers", labelKo: "HorizontalPodAutoscalers", testId: "ocp-workloads-horizontalpodautoscalers", tableTestId: "ocp-workloads-horizontalpodautoscalers-table" },
  { view: "poddisruptionbudgets", apiVersion: "policy/v1", resource: "poddisruptionbudgets", label: "PodDisruptionBudgets", labelKo: "PodDisruptionBudgets", testId: "ocp-workloads-poddisruptionbudgets", tableTestId: "ocp-workloads-poddisruptionbudgets-table" }
];

const workloadCopy = {
  en: {
    eyebrow: "Workloads",
    title: "OpenShift Workloads",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    namespace: "Namespace",
    status: "Status",
    ready: "Ready",
    replicas: "Replicas",
    owner: "Owner",
    age: "Age",
    type: "Type",
    keys: "Keys",
    schedule: "Schedule",
    lastSchedule: "Last schedule",
    completions: "Completions",
    target: "Target",
    current: "Current",
    desired: "Desired",
    minAvailable: "Min available",
    maxUnavailable: "Max unavailable",
    apiFailure: "API read failed",
    workloadHealth: "Workload health",
    controllerShape: "Controller shape",
    configBoundary: "Config and secret boundary",
    autoscaleDisruption: "Autoscale and disruption",
    nativeHandoff: "Native handoff",
    empty: "No resources were returned for this view.",
    createBoundary:
      "Create, edit, delete, scale, rollout, secret editing, and YAML apply remain native OpenShift actions. OpsLens renders read-only state and prepares approval-gated plans.",
    configBoundaryBody: "Secrets show metadata and type only. Raw data values stay redacted.",
    controllerShapeBody: "Controllers, pods, jobs, and schedules stay visible as first-class workload pages.",
    autoscaleBody: "HPA and PDB state is kept beside workload controllers for scale and availability decisions.",
    actions: {
      open: "Open object",
      create: "Create another",
      logs: "Logs",
      scale: "Scale",
      rollout: "Rollout",
      startJob: "Start from CronJob",
      suspend: "Suspend or resume",
      editConfig: "Edit configuration",
      redactedSecret: "Inspect metadata only",
      hpaPolicy: "Edit scaling policy",
      pdbPolicy: "Edit disruption policy",
      native: "Opens the native OpenShift object page.",
      nativeCreate: "Opens the native OpenShift create flow.",
      podLogs: "Use the native Pod log and terminal surface.",
      scaleController: "Use the native scale form and rollout controls.",
      rolloutController: "Use native rollout restart, pause, resume, and history actions.",
      jobFromCron: "Use native CronJob actions to create or inspect scheduled Jobs.",
      configEdit: "Use native edit/YAML with RBAC and audit trail.",
      secretSafe: "OpsLens keeps values redacted; use native console with RBAC for edits.",
      hpaEdit: "Use native HPA form/YAML for min, max, and metric targets.",
      pdbEdit: "Use native PDB form/YAML for availability policy changes."
    }
  },
  ko: {
    eyebrow: "워크로드",
    title: "OpenShift 워크로드",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    namespace: "네임스페이스",
    status: "상태",
    ready: "준비",
    replicas: "Replica",
    owner: "소유자",
    age: "나이",
    type: "유형",
    keys: "키",
    schedule: "스케줄",
    lastSchedule: "최근 실행",
    completions: "완료",
    target: "대상",
    current: "현재",
    desired: "희망",
    minAvailable: "최소 가용",
    maxUnavailable: "최대 불가",
    apiFailure: "API 조회 실패",
    workloadHealth: "워크로드 상태",
    controllerShape: "컨트롤러 구조",
    configBoundary: "설정/시크릿 경계",
    autoscaleDisruption: "오토스케일/중단 예산",
    nativeHandoff: "원본 기능 연결",
    empty: "이 보기에서 반환된 리소스가 없습니다.",
    createBoundary:
      "생성, 수정, 삭제, 스케일, 롤아웃, Secret 편집, YAML 적용은 OpenShift 원본 기능으로 남깁니다. OpsLens는 읽기 전용 상태를 렌더링하고 승인 기반 계획을 준비합니다.",
    configBoundaryBody: "Secret은 메타데이터와 유형만 보여줍니다. 원본 데이터 값은 계속 마스킹합니다.",
    controllerShapeBody: "컨트롤러, Pod, Job, 스케줄을 각각 원본 워크로드 페이지처럼 노출합니다.",
    autoscaleBody: "HPA와 PDB 상태를 워크로드 컨트롤러 옆에 배치해 스케일과 가용성 판단에 연결합니다.",
    actions: {
      open: "객체 열기",
      create: "같은 리소스 생성",
      logs: "로그",
      scale: "스케일",
      rollout: "롤아웃",
      startJob: "CronJob에서 Job 실행",
      suspend: "일시 중지/재개",
      editConfig: "설정 편집",
      redactedSecret: "메타데이터만 확인",
      hpaPolicy: "스케일 정책 편집",
      pdbPolicy: "중단 예산 편집",
      native: "OpenShift 원본 객체 화면으로 이동합니다.",
      nativeCreate: "OpenShift 원본 생성 흐름으로 이동합니다.",
      podLogs: "원본 Pod 로그와 터미널 화면을 사용합니다.",
      scaleController: "원본 스케일 폼과 롤아웃 제어를 사용합니다.",
      rolloutController: "원본 롤아웃 재시작, 일시 중지, 재개, 이력 기능을 사용합니다.",
      jobFromCron: "원본 CronJob 작업으로 예약 Job을 생성하거나 확인합니다.",
      configEdit: "RBAC와 감사 추적이 있는 원본 편집/YAML을 사용합니다.",
      secretSafe: "OpsLens는 값을 마스킹하고, 편집은 RBAC가 적용되는 원본 콘솔에서 수행합니다.",
      hpaEdit: "원본 HPA 폼/YAML로 최소/최대 replica와 metric target을 편집합니다.",
      pdbEdit: "원본 PDB 폼/YAML로 가용성 정책을 편집합니다."
    }
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
  return typeof field === "number" ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function resourceConfig(view: OcpWorkloadsView) {
  return workloadResources.find((entry) => entry.view === view) ?? workloadResources[0];
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: WorkloadState) {
  return workloadResources.some((entry) => state[entry.view]?.status.reachable);
}

function objectAge(item: OcpResourceSummary) {
  const created = item.metadata.creationTimestamp;
  if (!created) return "-";
  const delta = Date.now() - new Date(created).getTime();
  if (!Number.isFinite(delta) || delta < 0) return created;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ownerText(item: OcpResourceSummary) {
  return item.metadata.ownerReferences?.map((owner) => `${owner.kind}/${owner.name}`).join(", ") || "-";
}

function podReady(item: OcpResourceSummary) {
  const containerStatuses = arrayField(item.status, "containerStatuses");
  if (!containerStatuses.length) return "-";
  const ready = containerStatuses.filter((status) => asRecord(status).ready === true).length;
  return `${ready}/${containerStatuses.length}`;
}

function replicaText(item: OcpResourceSummary) {
  const spec = asRecord(item.spec);
  const status = asRecord(item.status);
  const desired = numberField(spec, "replicas") ?? numberField(status, "replicas") ?? 0;
  const ready = numberField(status, "readyReplicas") ?? numberField(status, "availableReplicas") ?? 0;
  return `${ready}/${desired}`;
}

function workloadStatus(item: OcpResourceSummary) {
  const status = asRecord(item.status);
  const phase = stringField(status, "phase");
  const reason = stringField(status, "reason");
  if (phase) return phase;
  if (reason) return reason;
  const conditions = arrayField(status, "conditions");
  const bad = conditions.find((condition) => stringField(condition, "status") === "False" && /available|ready/i.test(stringField(condition, "type") ?? ""));
  if (bad) return `${stringField(bad, "type") ?? "Condition"}=False`;
  const active = numberField(status, "active");
  const failed = numberField(status, "failed");
  const succeeded = numberField(status, "succeeded");
  if (active || failed || succeeded) return `active ${active ?? 0} / succeeded ${succeeded ?? 0} / failed ${failed ?? 0}`;
  return "-";
}

function workloadKindLabel(config: WorkloadResourceConfig, language: UiLanguage) {
  return language === "ko" ? config.labelKo : config.label;
}

function mapRows(state: WorkloadState, config: WorkloadResourceConfig) {
  return state[config.view]?.items ?? [];
}

function hpaScaleTarget(item: OcpResourceSummary) {
  const target = asRecord(asRecord(item.spec).scaleTargetRef);
  return [stringField(target, "kind"), stringField(target, "name")].filter(Boolean).join("/") || "-";
}

function hpaMetric(item: OcpResourceSummary) {
  const metrics = arrayField(item.status, "currentMetrics");
  return metrics.length ? `${metrics.length} metrics` : "-";
}

function pdbValue(item: OcpResourceSummary, key: string) {
  const specValue = asRecord(item.spec)[key];
  if (typeof specValue === "number" || typeof specValue === "string") return String(specValue);
  return "-";
}

function secretKeys(item: OcpResourceSummary) {
  return Object.keys(asRecord(asRecord(item).data)).length || Object.keys(asRecord(item.spec)).length;
}

function renderRows(config: WorkloadResourceConfig, rows: OcpResourceSummary[], language: UiLanguage) {
  const copy = workloadCopy[language];
  const resource = { apiVersion: config.apiVersion, resource: config.resource };
  if (config.view === "horizontalpodautoscalers") {
    return (
      <table className="native-workloads-table" data-testid={config.tableTestId}>
        <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.target}</th><th>{copy.current}</th><th>{copy.desired}</th><th>{copy.age}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td><td>{item.metadata.namespace ?? "-"}</td><td>{hpaScaleTarget(item)}</td><td>{hpaMetric(item)}</td><td>{asRecord(item.spec).minReplicas as string ?? "-"}/{asRecord(item.spec).maxReplicas as string ?? "-"}</td><td>{objectAge(item)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (config.view === "poddisruptionbudgets") {
    return (
      <table className="native-workloads-table" data-testid={config.tableTestId}>
        <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.minAvailable}</th><th>{copy.maxUnavailable}</th><th>{copy.status}</th><th>{copy.age}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td><td>{item.metadata.namespace ?? "-"}</td><td>{pdbValue(item, "minAvailable")}</td><td>{pdbValue(item, "maxUnavailable")}</td><td>{workloadStatus(item)}</td><td>{objectAge(item)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (config.view === "cronjobs") {
    return (
      <table className="native-workloads-table" data-testid={config.tableTestId}>
        <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.schedule}</th><th>{copy.lastSchedule}</th><th>{copy.status}</th><th>{copy.age}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td><td>{item.metadata.namespace ?? "-"}</td><td>{stringField(item.spec, "schedule") ?? "-"}</td><td>{stringField(item.status, "lastScheduleTime") ?? "-"}</td><td>{workloadStatus(item)}</td><td>{objectAge(item)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (config.view === "jobs") {
    return (
      <table className="native-workloads-table" data-testid={config.tableTestId}>
        <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.completions}</th><th>{copy.status}</th><th>{copy.owner}</th><th>{copy.age}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td><td>{item.metadata.namespace ?? "-"}</td><td>{numberField(item.status, "succeeded") ?? 0}/{numberField(item.spec, "completions") ?? 1}</td><td>{workloadStatus(item)}</td><td>{ownerText(item)}</td><td>{objectAge(item)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (config.view === "secrets" || config.view === "configmaps") {
    return (
      <table className="native-workloads-table" data-testid={config.tableTestId}>
        <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.type}</th><th>{copy.keys}</th><th>{copy.age}</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={`${item.metadata.namespace}-${item.metadata.name}`}><td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td><td>{item.metadata.namespace ?? "-"}</td><td>{stringField(item, "type") ?? item.kind}</td><td>{secretKeys(item)}</td><td>{objectAge(item)}</td></tr>)}</tbody>
      </table>
    );
  }
  return (
    <table className="native-workloads-table" data-testid={config.tableTestId}>
      <thead><tr><th>{config.label}</th><th>{copy.namespace}</th><th>{copy.ready}</th><th>{copy.replicas}</th><th>{copy.status}</th><th>{copy.owner}</th><th>{copy.age}</th></tr></thead>
      <tbody>
        {rows.map((item) => (
          <tr key={`${item.kind}-${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
            <td><NativeObjectLink resource={resource} item={item} testId={`${config.tableTestId}-object-link`} /></td>
            <td>{item.metadata.namespace ?? "-"}</td>
            <td>{config.view === "workloads" ? podReady(item) : replicaText(item)}</td>
            <td>{replicaText(item)}</td>
            <td>{workloadStatus(item)}</td>
            <td>{ownerText(item)}</td>
            <td>{objectAge(item)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function workloadLifecycleActions(
  item: OcpResourceSummary,
  resource: NativeConsoleResourceRef,
  language: UiLanguage
): NativeObjectLifecycleAction[] {
  const actionCopy = workloadCopy[language].actions;
  const objectHref = nativeConsoleHref(nativeObjectPath(resource, item));
  const createHref = nativeConsoleHref(nativeResourceCreatePath(resource, item.metadata.namespace));
  const baseActions: NativeObjectLifecycleAction[] = [
    { id: "open", label: actionCopy.open, description: actionCopy.native, href: objectHref },
    { id: "create", label: actionCopy.create, description: actionCopy.nativeCreate, href: createHref }
  ];

  if (item.kind === "Pod") {
    return [
      ...baseActions,
      { id: "logs", label: actionCopy.logs, description: actionCopy.podLogs, href: objectHref }
    ];
  }

  if (["Deployment", "DeploymentConfig", "StatefulSet", "DaemonSet", "ReplicaSet", "ReplicationController"].includes(item.kind)) {
    return [
      ...baseActions,
      { id: "scale", label: actionCopy.scale, description: actionCopy.scaleController, href: objectHref },
      { id: "rollout", label: actionCopy.rollout, description: actionCopy.rolloutController, href: objectHref }
    ];
  }

  if (item.kind === "CronJob") {
    return [
      ...baseActions,
      { id: "start-job", label: actionCopy.startJob, description: actionCopy.jobFromCron, href: objectHref },
      { id: "suspend", label: actionCopy.suspend, description: actionCopy.configEdit, href: objectHref }
    ];
  }

  if (item.kind === "Job") {
    return [
      ...baseActions,
      { id: "logs", label: actionCopy.logs, description: actionCopy.podLogs, href: objectHref }
    ];
  }

  if (item.kind === "Secret") {
    return [
      ...baseActions,
      { id: "redacted-secret", label: actionCopy.redactedSecret, description: actionCopy.secretSafe, href: objectHref }
    ];
  }

  if (item.kind === "ConfigMap") {
    return [
      ...baseActions,
      { id: "edit-config", label: actionCopy.editConfig, description: actionCopy.configEdit, href: objectHref }
    ];
  }

  if (item.kind === "HorizontalPodAutoscaler") {
    return [
      ...baseActions,
      { id: "hpa-policy", label: actionCopy.hpaPolicy, description: actionCopy.hpaEdit, href: objectHref }
    ];
  }

  if (item.kind === "PodDisruptionBudget") {
    return [
      ...baseActions,
      { id: "pdb-policy", label: actionCopy.pdbPolicy, description: actionCopy.pdbEdit, href: objectHref }
    ];
  }

  return baseActions;
}

export function OcpWorkloadsConsole({ language, view }: OcpWorkloadsConsoleProps) {
  const copy = workloadCopy[language];
  const activeConfig = resourceConfig(view);
  const [state, setState] = useState<WorkloadState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const results = await Promise.allSettled(
      workloadResources.map((entry) =>
        fetchOcpResourceList({
          apiVersion: entry.apiVersion,
          resource: entry.resource,
          limit: 120,
          full: true
        })
      )
    );
    const next: WorkloadState = {};
    const nextErrors: string[] = [];
    results.forEach((result, index) => {
      const entry = workloadResources[index];
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      next[entry.view] = result.value;
    });
    setState(next);
    setErrors(nextErrors);
    if (!options.silent) setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const refreshId = window.setInterval(() => void refresh({ silent: true }), 15000);
    return () => window.clearInterval(refreshId);
  }, []);

  const rows = mapRows(state, activeConfig);
  const failureMessages = [...workloadResources.map((entry) => failureText(state[entry.view])), ...errors].filter(Boolean);
  const totalControllers = useMemo(
    () =>
      ["deployments", "deployment-configs", "statefulsets", "daemonsets", "replicasets", "replicationcontrollers"]
        .map((entry) => state[entry as OcpWorkloadsView]?.items.length ?? 0)
        .reduce((sum, count) => sum + count, 0),
    [state]
  );
  const totalConfig = (state.secrets?.items.length ?? 0) + (state.configmaps?.items.length ?? 0);
  const totalBatch = (state.jobs?.items.length ?? 0) + (state.cronjobs?.items.length ?? 0);
  const totalAvailability = (state.horizontalpodautoscalers?.items.length ?? 0) + (state.poddisruptionbudgets?.items.length ?? 0);

  return (
    <section className="ocp-workloads-console" data-testid={activeConfig.testId} aria-labelledby="ocp-workloads-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-workloads-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-workloads-toolbar" data-testid="ocp-workloads-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>Pods: {state.workloads?.items.length ?? 0}</span>
        <span>Controllers: {totalControllers}</span>
        <span>Config: {totalConfig}</span>
        <span>Batch: {totalBatch}</span>
        <span>Scale/PDB: {totalAvailability}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-workloads-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-workloads-tabs" aria-label={copy.title}>
        {workloadResources.map((entry) => (
          <a key={entry.view} href={`#${entry.testId}`} aria-current={activeConfig.view === entry.view ? "page" : undefined}>
            {workloadKindLabel(entry, language)}
          </a>
        ))}
      </nav>

      <div className="workloads-native-grid">
        <article className="workloads-native-card" data-testid="ocp-workloads-health-board">
          <div className="card-title-row"><h3>{copy.workloadHealth}</h3><Boxes size={18} aria-hidden="true" /></div>
          <p>{copy.controllerShapeBody}</p>
          <strong className="workloads-card-number">{rows.length}</strong>
        </article>
        <article className="workloads-native-card">
          <div className="card-title-row"><h3>{copy.controllerShape}</h3><GitBranch size={18} aria-hidden="true" /></div>
          <p>{copy.controllerShapeBody}</p>
          <strong className="workloads-card-number">{totalControllers}</strong>
        </article>
        <article className="workloads-native-card">
          <div className="card-title-row"><h3>{copy.configBoundary}</h3><FileKey2 size={18} aria-hidden="true" /></div>
          <p>{copy.configBoundaryBody}</p>
          <strong className="workloads-card-number">{totalConfig}</strong>
        </article>
        <article className="workloads-native-card">
          <div className="card-title-row"><h3>{copy.autoscaleDisruption}</h3><ShieldAlert size={18} aria-hidden="true" /></div>
          <p>{copy.autoscaleBody}</p>
          <strong className="workloads-card-number">{totalAvailability}</strong>
        </article>
      </div>

      <article className="workloads-native-panel">
        <div className="card-title-row">
          <h3>{workloadKindLabel(activeConfig, language)}</h3>
          <Clock3 size={18} aria-hidden="true" />
        </div>
        <div className="native-workloads-table-wrap">
          {renderRows(activeConfig, rows, language)}
        </div>
        {!rows.length ? <p className="empty-state">{copy.empty}</p> : null}
      </article>

      <OcpNativeObjectDrilldown
        language={language}
        resource={{
          apiVersion: activeConfig.apiVersion,
          resource: activeConfig.resource
        }}
        lifecycleActionsForItem={(item, resource) => workloadLifecycleActions(item, resource, language)}
        items={rows}
        title={workloadKindLabel(activeConfig, language)}
        testId="ocp-workloads-object"
      />

      <aside className="workloads-native-boundary" data-testid="ocp-workloads-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
