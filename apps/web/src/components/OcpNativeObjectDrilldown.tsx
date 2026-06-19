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
  Search,
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
  resourceForItem?: (item: OcpResourceSummary) => NativeConsoleResourceRef;
  lifecycleActionsForItem?: (
    item: OcpResourceSummary,
    resource: NativeConsoleResourceRef
  ) => NativeObjectLifecycleAction[];
  items: OcpResourceSummary[];
  title: string;
  testId: string;
}

export interface NativeObjectLifecycleAction {
  id: string;
  label: string;
  description: string;
  href: string;
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
    searchObjects: "Find by name...",
    showingObjects: "Showing objects",
    noFilteredObjects: "No objects match the filter.",
    createNewResource: "Create new in OpenShift",
    mutationBoundary: "Create, edit, delete, scale, rollout, and other mutations stay in the native OpenShift console or an approval-gated OpsLens workflow.",
    podLogsOnly: "Logs are enabled for Pod objects.",
    nativeInspection: "Inspection stays in OpsLens; mutation handoff stays native.",
    lifecycleActions: "Resource lifecycle handoff",
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
    searchObjects: "이름으로 검색...",
    showingObjects: "표시 객체",
    noFilteredObjects: "필터와 일치하는 객체가 없습니다.",
    createNewResource: "OpenShift에서 새로 만들기",
    mutationBoundary: "생성, 수정, 삭제, 스케일, 롤아웃 같은 변경 작업은 원본 OpenShift 콘솔 또는 승인 기반 OpsLens 워크플로에서 수행합니다.",
    podLogsOnly: "로그는 Pod 객체에서 활성화됩니다.",
    nativeInspection: "조회는 OpsLens에서 유지하고, 변경 작업은 원본 콘솔로 위임합니다.",
    lifecycleActions: "리소스 생명주기 연결",
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

interface NativeDetailGroup {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

const nativeDetailCopy = {
  en: {
    workloadSpec: "Workload spec",
    workloadStatus: "Workload status",
    networkSpec: "Network spec",
    storageSpec: "Storage spec",
    buildSpec: "Build spec",
    computeSpec: "Compute spec",
    rbacSpec: "RBAC spec",
    operatorSpec: "Operator spec",
    projectSpec: "Project spec",
    desired: "Desired",
    available: "Available",
    ready: "Ready",
    updated: "Updated",
    replicas: "Replicas",
    selector: "Selector",
    containers: "Containers",
    images: "Images",
    node: "Node",
    podIp: "Pod IP",
    qos: "QoS",
    restartPolicy: "Restart policy",
    schedule: "Schedule",
    suspend: "Suspend",
    lastSchedule: "Last schedule",
    completions: "Completions",
    parallelism: "Parallelism",
    host: "Host",
    service: "Service",
    targetPort: "Target port",
    tls: "TLS",
    type: "Type",
    clusterIp: "Cluster IP",
    ports: "Ports",
    endpoints: "Endpoints",
    ingressRules: "Ingress rules",
    egressRules: "Egress rules",
    policyTypes: "Policy types",
    requested: "Requested",
    capacity: "Capacity",
    storageClass: "StorageClass",
    volume: "Volume",
    accessModes: "Access modes",
    reclaimPolicy: "Reclaim policy",
    provisioner: "Provisioner",
    bindingMode: "Binding mode",
    expansion: "Expansion",
    source: "Source",
    driver: "Driver",
    deletionPolicy: "Deletion policy",
    strategy: "Strategy",
    output: "Output",
    triggers: "Triggers",
    runPolicy: "Run policy",
    tags: "Tags",
    latest: "Latest",
    roles: "Roles",
    subjects: "Subjects",
    rules: "Rules",
    groups: "Groups",
    phase: "Phase",
    channel: "Channel",
    installPlan: "InstallPlan",
    csv: "CSV",
    version: "Version",
    provider: "Provider",
    machine: "Machine",
    osImage: "OS image",
    kubelet: "Kubelet",
    cpu: "CPU",
    memory: "Memory",
    owner: "Owner"
  },
  ko: {
    workloadSpec: "워크로드 사양",
    workloadStatus: "워크로드 상태",
    networkSpec: "네트워크 사양",
    storageSpec: "스토리지 사양",
    buildSpec: "빌드 사양",
    computeSpec: "컴퓨트 사양",
    rbacSpec: "RBAC 사양",
    operatorSpec: "오퍼레이터 사양",
    projectSpec: "프로젝트 사양",
    desired: "목표",
    available: "Available",
    ready: "Ready",
    updated: "Updated",
    replicas: "Replica",
    selector: "Selector",
    containers: "컨테이너",
    images: "이미지",
    node: "노드",
    podIp: "Pod IP",
    qos: "QoS",
    restartPolicy: "재시작 정책",
    schedule: "스케줄",
    suspend: "일시 중지",
    lastSchedule: "마지막 실행",
    completions: "완료",
    parallelism: "병렬",
    host: "호스트",
    service: "서비스",
    targetPort: "대상 포트",
    tls: "TLS",
    type: "유형",
    clusterIp: "Cluster IP",
    ports: "포트",
    endpoints: "Endpoint",
    ingressRules: "Ingress 규칙",
    egressRules: "Egress 규칙",
    policyTypes: "정책 유형",
    requested: "요청",
    capacity: "용량",
    storageClass: "StorageClass",
    volume: "Volume",
    accessModes: "접근 모드",
    reclaimPolicy: "회수 정책",
    provisioner: "Provisioner",
    bindingMode: "바인딩 모드",
    expansion: "확장",
    source: "소스",
    driver: "Driver",
    deletionPolicy: "삭제 정책",
    strategy: "전략",
    output: "출력",
    triggers: "트리거",
    runPolicy: "실행 정책",
    tags: "태그",
    latest: "최신",
    roles: "Role",
    subjects: "Subject",
    rules: "Rule",
    groups: "Group",
    phase: "상태",
    channel: "채널",
    installPlan: "InstallPlan",
    csv: "CSV",
    version: "버전",
    provider: "Provider",
    machine: "Machine",
    osImage: "OS 이미지",
    kubelet: "Kubelet",
    cpu: "CPU",
    memory: "메모리",
    owner: "소유자"
  }
} as const;

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function stringField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  if (typeof field === "string" && field.trim()) return field;
  if (typeof field === "number" || typeof field === "boolean") return String(field);
  return undefined;
}

function nestedField(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const segment of path) {
    current = asRecord(current)[segment];
  }
  if (typeof current === "string" && current.trim()) return current;
  if (typeof current === "number" || typeof current === "boolean") return String(current);
  return undefined;
}

function compactArray(values: unknown[], projector: (value: unknown) => string | undefined) {
  const projected = values.map(projector).filter((value): value is string => Boolean(value));
  if (!projected.length) return "-";
  const sample = projected.slice(0, 4).join(", ");
  return projected.length > 4 ? `${sample} +${projected.length - 4}` : sample;
}

function compactMap(value: unknown) {
  return compactRecord(value);
}

function quantityMap(value: unknown) {
  const record = asRecord(value);
  const entries = Object.entries(record);
  if (!entries.length) return "-";
  return entries.map(([key, val]) => `${key}=${String(val)}`).join(", ");
}

function selectorFromSpec(spec: Record<string, unknown>) {
  const selector = asRecord(spec.selector);
  const matchLabels = asRecord(selector.matchLabels);
  if (Object.keys(matchLabels).length) return compactMap(matchLabels);
  if (Object.keys(selector).length) return compactMap(selector);
  return "-";
}

function ownerKind(item: OcpResourceSummary) {
  return item.metadata.ownerReferences?.map((owner) => owner.kind).join(", ") || "-";
}

function addGroup(groups: NativeDetailGroup[], title: string, rows: Array<{ label: string; value: string | undefined }>) {
  const cleanRows = rows
    .map((row) => ({ label: row.label, value: row.value && row.value.trim() ? row.value : "-" }))
    .filter((row) => row.value !== "-");
  if (cleanRows.length) groups.push({ title, rows: cleanRows });
}

function nativeDetailGroups(item: OcpResourceSummary, language: UiLanguage): NativeDetailGroup[] {
  const label = nativeDetailCopy[language];
  const spec = asRecord(item.spec);
  const status = asRecord(item.status);
  const groups: NativeDetailGroup[] = [];

  if (item.kind === "Pod") {
    const containers = arrayField(spec, "containers");
    addGroup(groups, label.workloadSpec, [
      { label: label.node, value: stringField(spec, "nodeName") },
      { label: label.restartPolicy, value: stringField(spec, "restartPolicy") },
      { label: label.containers, value: compactArray(containers, (container) => stringField(container, "name")) },
      { label: label.images, value: compactArray(containers, (container) => stringField(container, "image")) }
    ]);
    addGroup(groups, label.workloadStatus, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.podIp, value: stringField(status, "podIP") },
      { label: label.qos, value: stringField(status, "qosClass") },
      { label: label.ready, value: `${arrayField(status, "containerStatuses").filter((container) => asRecord(container).ready === true).length}/${containers.length}` }
    ]);
  }

  if (["Deployment", "DeploymentConfig", "StatefulSet", "DaemonSet", "ReplicaSet", "ReplicationController"].includes(item.kind)) {
    addGroup(groups, label.workloadSpec, [
      { label: label.replicas, value: stringField(spec, "replicas") },
      { label: label.selector, value: selectorFromSpec(spec) },
      { label: label.strategy, value: nestedField(spec, ["strategy", "type"]) }
    ]);
    addGroup(groups, label.workloadStatus, [
      { label: label.desired, value: stringField(status, "replicas") ?? stringField(status, "desiredNumberScheduled") },
      { label: label.ready, value: stringField(status, "readyReplicas") ?? stringField(status, "numberReady") },
      { label: label.updated, value: stringField(status, "updatedReplicas") ?? stringField(status, "updatedNumberScheduled") },
      { label: label.available, value: stringField(status, "availableReplicas") }
    ]);
  }

  if (item.kind === "CronJob") {
    addGroup(groups, label.workloadSpec, [
      { label: label.schedule, value: stringField(spec, "schedule") },
      { label: label.suspend, value: stringField(spec, "suspend") },
      { label: label.lastSchedule, value: stringField(status, "lastScheduleTime") }
    ]);
  }

  if (item.kind === "Job") {
    addGroup(groups, label.workloadSpec, [
      { label: label.completions, value: stringField(spec, "completions") },
      { label: label.parallelism, value: stringField(spec, "parallelism") },
      { label: label.ready, value: stringField(status, "ready") },
      { label: label.phase, value: stringField(status, "succeeded") ?? stringField(status, "failed") }
    ]);
  }

  if (item.kind === "Service") {
    addGroup(groups, label.networkSpec, [
      { label: label.type, value: stringField(spec, "type") },
      { label: label.clusterIp, value: stringField(spec, "clusterIP") },
      { label: label.selector, value: compactMap(spec.selector) },
      { label: label.ports, value: compactArray(arrayField(spec, "ports"), (port) => `${stringField(port, "port") ?? "-"}:${stringField(port, "targetPort") ?? "-"}`) }
    ]);
  }

  if (item.kind === "Route") {
    addGroup(groups, label.networkSpec, [
      { label: label.host, value: stringField(spec, "host") },
      { label: label.service, value: nestedField(spec, ["to", "name"]) },
      { label: label.targetPort, value: nestedField(spec, ["port", "targetPort"]) },
      { label: label.tls, value: nestedField(spec, ["tls", "termination"]) }
    ]);
  }

  if (item.kind === "Ingress") {
    addGroup(groups, label.networkSpec, [
      { label: label.ingressRules, value: String(arrayField(spec, "rules").length) },
      { label: label.tls, value: String(arrayField(spec, "tls").length) },
      { label: label.host, value: compactArray(arrayField(spec, "rules"), (rule) => stringField(rule, "host")) }
    ]);
  }

  if (item.kind === "NetworkPolicy") {
    addGroup(groups, label.networkSpec, [
      { label: label.policyTypes, value: arrayField(spec, "policyTypes").join(", ") },
      { label: label.selector, value: compactMap(asRecord(spec.podSelector).matchLabels) },
      { label: label.ingressRules, value: String(arrayField(spec, "ingress").length) },
      { label: label.egressRules, value: String(arrayField(spec, "egress").length) }
    ]);
  }

  if (item.kind === "PersistentVolumeClaim") {
    addGroup(groups, label.storageSpec, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.requested, value: nestedField(spec, ["resources", "requests", "storage"]) },
      { label: label.storageClass, value: stringField(spec, "storageClassName") },
      { label: label.volume, value: stringField(spec, "volumeName") },
      { label: label.accessModes, value: arrayField(spec, "accessModes").join(", ") }
    ]);
  }

  if (item.kind === "PersistentVolume") {
    addGroup(groups, label.storageSpec, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.capacity, value: nestedField(spec, ["capacity", "storage"]) },
      { label: label.storageClass, value: stringField(spec, "storageClassName") },
      { label: label.reclaimPolicy, value: stringField(spec, "persistentVolumeReclaimPolicy") },
      { label: label.accessModes, value: arrayField(spec, "accessModes").join(", ") }
    ]);
  }

  if (item.kind === "StorageClass") {
    addGroup(groups, label.storageSpec, [
      { label: label.provisioner, value: stringField(item, "provisioner") ?? stringField(spec, "provisioner") },
      { label: label.reclaimPolicy, value: stringField(item, "reclaimPolicy") ?? stringField(spec, "reclaimPolicy") },
      { label: label.bindingMode, value: stringField(item, "volumeBindingMode") ?? stringField(spec, "volumeBindingMode") },
      { label: label.expansion, value: stringField(item, "allowVolumeExpansion") ?? stringField(spec, "allowVolumeExpansion") }
    ]);
  }

  if (item.kind === "VolumeSnapshot") {
    addGroup(groups, label.storageSpec, [
      { label: label.ready, value: stringField(status, "readyToUse") },
      { label: label.source, value: nestedField(spec, ["source", "persistentVolumeClaimName"]) ?? nestedField(spec, ["source", "volumeSnapshotContentName"]) },
      { label: label.storageClass, value: stringField(spec, "volumeSnapshotClassName") }
    ]);
  }

  if (item.kind === "VolumeSnapshotClass") {
    addGroup(groups, label.storageSpec, [
      { label: label.driver, value: stringField(spec, "driver") ?? stringField(item, "driver") },
      { label: label.deletionPolicy, value: stringField(spec, "deletionPolicy") ?? stringField(item, "deletionPolicy") }
    ]);
  }

  if (item.kind === "Build" || item.kind === "BuildConfig") {
    addGroup(groups, label.buildSpec, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.strategy, value: Object.keys(asRecord(spec.strategy)).join(", ") },
      { label: label.source, value: Object.keys(asRecord(spec.source)).join(", ") },
      { label: label.output, value: nestedField(spec, ["output", "to", "name"]) },
      { label: label.triggers, value: String(arrayField(spec, "triggers").length) },
      { label: label.runPolicy, value: stringField(spec, "runPolicy") }
    ]);
  }

  if (item.kind === "ImageStream") {
    addGroup(groups, label.buildSpec, [
      { label: label.tags, value: String(arrayField(spec, "tags").length || arrayField(status, "tags").length) },
      { label: label.latest, value: compactArray(arrayField(status, "tags"), (tag) => stringField(tag, "tag")) },
      { label: label.output, value: stringField(spec, "dockerImageRepository") }
    ]);
  }

  if (item.kind === "Node") {
    const capacity = asRecord(status.capacity);
    addGroup(groups, label.computeSpec, [
      { label: label.roles, value: compactMap(item.metadata.labels) },
      { label: label.cpu, value: stringField(capacity, "cpu") },
      { label: label.memory, value: stringField(capacity, "memory") },
      { label: label.osImage, value: nestedField(status, ["nodeInfo", "osImage"]) },
      { label: label.kubelet, value: nestedField(status, ["nodeInfo", "kubeletVersion"]) }
    ]);
  }

  if (["Machine", "MachineSet", "MachineConfigPool"].includes(item.kind)) {
    addGroup(groups, label.computeSpec, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.provider, value: compactMap(spec.providerSpec) },
      { label: label.machine, value: stringField(status, "nodeRef") ?? stringField(status, "machineCount") },
      { label: label.desired, value: stringField(spec, "replicas") },
      { label: label.ready, value: stringField(status, "readyReplicas") ?? stringField(status, "readyMachineCount") }
    ]);
  }

  if (["Role", "ClusterRole"].includes(item.kind)) {
    addGroup(groups, label.rbacSpec, [
      { label: label.rules, value: String(arrayField(item, "rules").length || arrayField(spec, "rules").length) }
    ]);
  }

  if (["RoleBinding", "ClusterRoleBinding"].includes(item.kind)) {
    addGroup(groups, label.rbacSpec, [
      { label: label.subjects, value: compactArray(arrayField(item, "subjects").length ? arrayField(item, "subjects") : arrayField(spec, "subjects"), (subject) => `${stringField(subject, "kind") ?? "-"}:${stringField(subject, "name") ?? "-"}`) },
      { label: label.roles, value: nestedField(item, ["roleRef", "name"]) ?? nestedField(spec, ["roleRef", "name"]) }
    ]);
  }

  if (["ClusterServiceVersion", "Subscription", "InstallPlan", "OperatorGroup", "CatalogSource", "PackageManifest"].includes(item.kind)) {
    addGroup(groups, label.operatorSpec, [
      { label: label.phase, value: stringField(status, "phase") ?? stringField(status, "state") },
      { label: label.channel, value: stringField(spec, "channel") },
      { label: label.csv, value: stringField(status, "installedCSV") ?? stringField(status, "currentCSV") },
      { label: label.installPlan, value: nestedField(status, ["installPlanRef", "name"]) },
      { label: label.version, value: stringField(spec, "version") ?? stringField(status, "version") }
    ]);
  }

  if (["Project", "Namespace"].includes(item.kind)) {
    addGroup(groups, label.projectSpec, [
      { label: label.phase, value: stringField(status, "phase") },
      { label: label.selector, value: compactMap(item.metadata.labels) },
      { label: label.owner, value: ownerKind(item) }
    ]);
  }

  return groups;
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
  resourceForItem,
  lifecycleActionsForItem,
  items,
  title,
  testId
}: OcpNativeObjectDrilldownProps) {
  const text = copy[language];
  const [selectedKey, setSelectedKey] = useState("");
  const [activeTab, setActiveTab] = useState<NativeDetailTab>("details");
  const [query, setQuery] = useState("");
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
  const selectedResource = useMemo(
    () => selected && resourceForItem ? resourceForItem(selected) : resource,
    [resource, resourceForItem, selected]
  );
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [
        item.metadata.name,
        item.metadata.namespace,
        item.kind,
        statusText(item),
        ownerText(item)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

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
            apiVersion: selectedResource.apiVersion,
            resource: selectedResource.resource,
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
            apiVersion: selectedResource.apiVersion,
            resource: selectedResource.resource,
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
  }, [selected, selectedResource.apiVersion, selectedResource.resource]);

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
  const nativeHref = nativeConsoleHref(nativeObjectPath(selectedResource, selected));
  const nativeCreateHref = nativeConsoleHref(
    nativeResourceCreatePath(selectedResource, selected.metadata.namespace)
  );
  const lifecycleActions = lifecycleActionsForItem?.(selected, selectedResource) ?? [];
  const conditions = conditionRows(selectedDetailItem);
  const kindDetailGroups = nativeDetailGroups(selectedDetailItem, language);

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
          <label className="native-drilldown-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchObjects}
              aria-label={text.searchObjects}
              data-testid={`${testId}-object-search`}
            />
          </label>
          <span className="native-drilldown-count" data-testid={`${testId}-object-count`}>
            {text.showingObjects}: {filteredItems.length}/{items.length}
          </span>
          {filteredItems.slice(0, 30).map((item) => (
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
          {!filteredItems.length ? <p className="empty-state">{text.noFilteredObjects}</p> : null}
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
            {lifecycleActions.length ? (
              <div className="native-lifecycle-actions" data-testid={`${testId}-lifecycle-actions`}>
                <strong>{text.lifecycleActions}</strong>
                <div>
                  {lifecycleActions.map((action) => (
                    <a
                      key={action.id}
                      className="native-lifecycle-action"
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`${testId}-lifecycle-${action.id}`}
                    >
                      <span>{action.label}</span>
                      <small>{action.description}</small>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
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
                  <div><dt>{text.resource}</dt><dd>{selectedResource.resource}</dd></div>
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

              {kindDetailGroups.map((group, index) => (
                <section
                  className="native-object-summary-card kind-summary"
                  data-kind-summary="true"
                  data-testid={`${testId}-kind-summary-${index}`}
                  key={`${group.title}-${index}`}
                >
                  <strong>{group.title}</strong>
                  <dl>
                    {group.rows.map((row) => (
                      <div key={`${group.title}-${row.label}`}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}

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
