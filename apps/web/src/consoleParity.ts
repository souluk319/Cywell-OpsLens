export type ConsoleParitySection =
  | "Home"
  | "Favorites"
  | "Ecosystem"
  | "Workloads"
  | "Networking"
  | "Storage"
  | "Builds"
  | "Monitoring"
  | "Compute"
  | "User Management"
  | "Administration"
  | "Cywell";

export type ConsoleParityActionSurface =
  | "overview"
  | "evidence"
  | "resource-explorer"
  | "topology-graph"
  | "monitoring-console"
  | "builds-console"
  | "networking-console"
  | "storage-console"
  | "administration-console"
  | "compute-console"
  | "user-management-console"
  | "ops-dashboard"
  | "ops-admin"
  | "opsbrain"
  | "assistant";

export type ConsoleParityCoverageClass =
  | "live-view"
  | "native-deep-link"
  | "plan-only"
  | "gap";

export interface ConsoleParityResourcePreset {
  query: string;
  preferredResources: string[];
  namespace?: string;
  detailView?: "json" | "yaml";
}

export interface ConsoleParityItem {
  id: string;
  section: ConsoleParitySection;
  label: string;
  labelKo: string;
  originalPath: string;
  originalPathKo: string;
  targetSelector: string;
  actionSurface: ConsoleParityActionSurface;
  command: string;
  commandKo: string;
  opsLensEnhancement: string;
  opsLensEnhancementKo: string;
  acceptance: string;
  acceptanceKo: string;
  coverageClass: ConsoleParityCoverageClass;
  status: "covered" | "native-deep-link" | "ops-enhanced" | "read-only-plan";
  resourcePreset?: ConsoleParityResourcePreset;
  evidenceView?: "alerts" | "logs" | "yaml";
  nativeCreatePath?: string;
}

type ConsoleParityItemDraft = Omit<ConsoleParityItem, "coverageClass">;

export type ConsoleParityFunctionMode =
  | "resource-preset"
  | "topology-graph"
  | "monitoring-console"
  | "builds-console"
  | "networking-console"
  | "storage-console"
  | "administration-console"
  | "compute-console"
  | "user-management-console"
  | "evidence-view"
  | "overview"
  | "ops-dashboard"
  | "ops-admin"
  | "opsbrain"
  | "assistant";

export interface ConsoleParityFunctionProof {
  mode: ConsoleParityFunctionMode;
  input: string;
  inputKo: string;
  proof: string;
  proofKo: string;
}

export interface ConsoleParityFunctionSignal {
  selector: string;
  description: string;
  descriptionKo: string;
}

export interface ConsoleParityCompatibilityProfile {
  minimumRuntime: typeof ocpConsoleBaseline.minimumRuntime;
  baseline: string;
  baselineKo: string;
  apiVersions: string[];
  nativeCreateApiVersion?: string;
  forwardEnhancement: string;
  forwardEnhancementKo: string;
  proof: string;
  proofKo: string;
}

export const ocpConsoleBaseline = {
  product: "OpenShift Local / OpenShift Container Platform web console",
  minimumRuntime: "OpenShift Container Platform 4.20",
  forwardUxTarget: "OpenShift Container Platform 4.21+",
  crcVersion: "OpenShift Local 4.21.14",
  ocpDocVersion: "4.21",
  compatibilityProof: "Windows CRC 4.20 validation pending",
  perspectiveModel:
    "OCP 4.21 uses the unified web console model introduced in OCP 4.19; Developer can still be enabled, but the administrator shell must not hide cluster console features.",
  sources: [
    {
      label: "Red Hat OCP 4.20 Web console overview",
      url: "https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index"
    },
    {
      label: "Red Hat OCP 4.21 Web console overview",
      url: "https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html-single/web_console/index"
    },
    {
      label: "Red Hat OCP 4.21 Customizing web console",
      url: "https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/web_console/customizing-web-console"
    },
    {
      label: "Red Hat OCP 4.21 Dynamic plugins",
      url: "https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/web_console/dynamic-plugins"
    }
  ]
} as const;

export const consoleParitySections: ConsoleParitySection[] = [
  "Home",
  "Favorites",
  "Ecosystem",
  "Workloads",
  "Networking",
  "Storage",
  "Builds",
  "Monitoring",
  "Compute",
  "User Management",
  "Administration",
  "Cywell"
];

export const sectionLabelsKo: Record<ConsoleParitySection, string> = {
  Home: "홈",
  Favorites: "즐겨찾기",
  Ecosystem: "에코시스템",
  Workloads: "워크로드",
  Networking: "네트워킹",
  Storage: "스토리지",
  Builds: "빌드",
  Monitoring: "모니터링",
  Compute: "컴퓨트",
  "User Management": "사용자 관리",
  Administration: "관리",
  Cywell: "Cywell"
};

const ocpConsoleParityItemDrafts: ConsoleParityItemDraft[] = [
  {
    id: "overview",
    section: "Home",
    label: "Overview",
    labelKo: "개요",
    originalPath: "Home / Overview",
    originalPathKo: "홈 / 개요",
    targetSelector: "#ocp-console-overview-title",
    actionSurface: "overview",
    command: "Open the live cluster overview with version, operator, node, workload, networking, and monitoring signals.",
    commandKo: "버전, Operator, 노드, 워크로드, 네트워킹, 모니터링 신호가 있는 실시간 클러스터 개요를 엽니다.",
    opsLensEnhancement: "Adds evidence freshness, API route state, and assistant-ready incident context.",
    opsLensEnhancementKo: "근거 최신성, API 경로 상태, 어시스턴트용 장애 컨텍스트를 추가합니다.",
    acceptance: "Overview cards render from live/read-only API evidence or show an explicit unavailable state.",
    acceptanceKo: "개요 카드는 실시간/읽기 전용 API 근거로 렌더링되거나 명시적 사용 불가 상태를 보여야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "search",
    section: "Home",
    label: "Search",
    labelKo: "검색",
    originalPath: "Home / Search",
    originalPathKo: "홈 / 검색",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Search listable API resources, then inspect sanitized JSON/YAML, events, logs, owners, and children.",
    commandKo: "목록 조회 가능한 API 리소스를 검색하고 마스킹된 JSON/YAML, 이벤트, 로그, 소유자, 하위 리소스를 확인합니다.",
    opsLensEnhancement: "Search results are tied to RBAC, redaction, related resources, and KOMSCO assistant prompts.",
    opsLensEnhancementKo: "검색 결과를 RBAC, 마스킹, 관련 리소스, KOMSCO 어시스턴트 질문과 연결합니다.",
    acceptance: "Search opens the resource explorer and never exposes raw Secret values.",
    acceptanceKo: "검색은 리소스 탐색기를 열고 원본 Secret 값을 노출하지 않아야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "pods deployments routes services namespaces",
      preferredResources: [
        "v1/pods",
        "apps/v1/deployments",
        "route.openshift.io/v1/routes",
        "v1/services",
        "v1/namespaces"
      ]
    }
  },
  {
    id: "events",
    section: "Home",
    label: "Events",
    labelKo: "이벤트",
    originalPath: "Home / Events",
    originalPathKo: "홈 / 이벤트",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Open core Events in read-only mode and keep involved object links available.",
    commandKo: "core Events를 읽기 전용으로 열고 관련 객체 연결을 유지합니다.",
    opsLensEnhancement: "Events become assistant evidence, not a separate dead-end page.",
    opsLensEnhancementKo: "이벤트를 별도 막다른 페이지가 아니라 어시스턴트 근거로 사용합니다.",
    acceptance: "Event rows include namespace, reason, message, and involved object when available.",
    acceptanceKo: "이벤트 행은 가능한 경우 네임스페이스, 이유, 메시지, 관련 객체를 포함해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "events",
      preferredResources: ["events.k8s.io/v1/events", "v1/events"]
    }
  },
  {
    id: "favorites",
    section: "Favorites",
    label: "Pinned navigation",
    labelKo: "고정 메뉴",
    originalPath: "Favorites / Pinned navigation",
    originalPathKo: "즐겨찾기 / 고정 메뉴",
    targetSelector: "[data-testid='console-parity-matrix']",
    actionSurface: "ops-dashboard",
    command: "Show which native OpenShift console pages are covered, pinned, or still native-owned.",
    commandKo: "원본 OpenShift 콘솔 페이지가 대응됨, 고정됨, 기본 콘솔 소유인지 보여줍니다.",
    opsLensEnhancement: "Pinned items are generated from the same parity contract as the sidebar.",
    opsLensEnhancementKo: "고정 항목은 좌측 메뉴와 같은 parity 계약에서 생성됩니다.",
    acceptance: "Parity matrix is visible and includes all version-pinned console groups.",
    acceptanceKo: "Parity 매트릭스가 보이고 버전 고정된 모든 콘솔 그룹을 포함해야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "software-catalog",
    section: "Ecosystem",
    label: "Software Catalog",
    labelKo: "소프트웨어 카탈로그",
    originalPath: "Ecosystem / Software Catalog",
    originalPathKo: "에코시스템 / 소프트웨어 카탈로그",
    targetSelector: "[data-testid='opslens-catalog-toolchain']",
    actionSurface: "ops-admin",
    command: "Open software catalog readiness and installed catalog evidence before installation.",
    commandKo: "설치 전에 소프트웨어 카탈로그 준비도와 설치된 카탈로그 근거를 엽니다.",
    opsLensEnhancement: "Shows CatalogSource, package manifest, image tag, architecture, and stale-catalog evidence.",
    opsLensEnhancementKo: "CatalogSource, 패키지 매니페스트, 이미지 태그, 아키텍처, stale catalog 근거를 보여줍니다.",
    acceptance: "Catalog readiness distinguishes visible package, catalog pod, and install approval state.",
    acceptanceKo: "카탈로그 준비도는 패키지 표시, 카탈로그 Pod, 설치 승인 상태를 구분해야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "operatorhub",
    section: "Ecosystem",
    label: "Operator catalog",
    labelKo: "Operator 카탈로그",
    originalPath: "Ecosystem / Software Catalog / Operator catalog",
    originalPathKo: "에코시스템 / 소프트웨어 카탈로그 / Operator 카탈로그",
    targetSelector: "[data-testid='opslens-operator-package']",
    actionSurface: "ops-admin",
    command: "Review Operator catalog visibility, current CSV, install modes, architecture labels, and icon metadata.",
    commandKo: "Operator 카탈로그 표시, current CSV, 설치 모드, 아키텍처 라벨, 아이콘 메타데이터를 검토합니다.",
    opsLensEnhancement: "Adds the exact failure classes seen in CRC: stale catalog, arch mismatch, installMode, and pull scope.",
    opsLensEnhancementKo: "CRC에서 겪은 stale catalog, 아키텍처 불일치, installMode, pull 권한 문제를 분류합니다.",
    acceptance: "Operator catalog entry must be mapped to package manifest and catalog pod evidence.",
    acceptanceKo: "Operator 카탈로그 항목은 패키지 매니페스트와 카탈로그 Pod 근거에 매핑되어야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "packagemanifests catalogsources",
      preferredResources: [
        "packages.operators.coreos.com/v1/packagemanifests",
        "operators.coreos.com/v1alpha1/catalogsources"
      ]
    }
  },
  {
    id: "installed-operators",
    section: "Ecosystem",
    label: "Installed Operators",
    labelKo: "설치된 Operator",
    originalPath: "Ecosystem / Installed Operators",
    originalPathKo: "에코시스템 / 설치된 Operator",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Inspect CSVs, Subscriptions, InstallPlans, and operator Deployments without mutating them.",
    commandKo: "CSV, Subscription, InstallPlan, Operator Deployment를 변경 없이 조회합니다.",
    opsLensEnhancement: "Adds install progress diagnosis and image-source mismatch detection.",
    opsLensEnhancementKo: "설치 진행 진단과 이미지 소스 불일치 감지를 추가합니다.",
    acceptance: "Installed Operator view can prove which namespace owns the CSV and which image the operator pod runs.",
    acceptanceKo: "설치된 Operator 화면은 CSV 소유 네임스페이스와 Operator Pod 이미지가 무엇인지 증명해야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "clusterserviceversions subscriptions installplans deployments",
      preferredResources: [
        "operators.coreos.com/v1alpha1/clusterserviceversions",
        "operators.coreos.com/v1alpha1/subscriptions",
        "operators.coreos.com/v1alpha1/installplans",
        "apps/v1/deployments"
      ]
    }
  },
  {
    id: "helm",
    section: "Ecosystem",
    label: "Helm",
    labelKo: "Helm",
    originalPath: "Ecosystem / Helm",
    originalPathKo: "에코시스템 / Helm",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Inspect Helm-related Secrets and ConfigMaps as read-only release evidence.",
    commandKo: "Helm 관련 Secret/ConfigMap을 읽기 전용 릴리스 근거로 확인합니다.",
    opsLensEnhancement: "Keeps Helm metadata redacted and asks the assistant for rollback planning only.",
    opsLensEnhancementKo: "Helm 메타데이터는 마스킹하고 어시스턴트는 롤백 계획만 제안합니다.",
    acceptance: "Helm surface must not decode or expose secret payloads.",
    acceptanceKo: "Helm 화면은 Secret 페이로드를 디코딩하거나 노출하지 않아야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "helm secrets configmaps",
      preferredResources: ["v1/secrets", "v1/configmaps"]
    }
  },
  {
    id: "topology",
    section: "Workloads",
    label: "Topology",
    labelKo: "토폴로지",
    originalPath: "Workloads / Topology",
    originalPathKo: "워크로드 / 토폴로지",
    targetSelector: "#ocp-topology-title",
    actionSurface: "topology-graph",
    command:
      "Open workload topology evidence with pods, services, routes, workload controllers, autoscalers, disruption budgets, jobs, and cronjobs.",
    commandKo:
      "Pod, Service, Route, 워크로드 컨트롤러, 오토스케일러, 중단 예산, Job, CronJob 기반 토폴로지 근거를 엽니다.",
    opsLensEnhancement:
      "Renders a live selector, ownerReference, scaleTargetRef, PDB, job, and route graph instead of a flat resource table.",
    opsLensEnhancementKo:
      "평면 리소스 표 대신 실시간 selector, ownerReference, scaleTargetRef, PDB, Job, Route 그래프를 렌더링합니다.",
    acceptance:
      "Topology entry renders graph nodes and edges from read-only pods, services, routes, deploymentconfigs, deployments, statefulsets, daemonsets, replicasets, replicationcontrollers, HPAs, PDBs, jobs, and cronjobs.",
    acceptanceKo:
      "토폴로지 항목은 읽기 전용 Pod, Service, Route, DeploymentConfig, Deployment, StatefulSet, DaemonSet, ReplicaSet, ReplicationController, HPA, PDB, Job, CronJob에서 그래프 노드와 연결을 렌더링해야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "workloads",
    section: "Workloads",
    label: "Pods",
    labelKo: "파드",
    originalPath: "Workloads / Pods",
    originalPathKo: "워크로드 / 파드",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List pods, inspect status, events, logs, owner references, and sanitized YAML.",
    commandKo: "파드 목록, 상태, 이벤트, 로그, 소유자 참조, 마스킹된 YAML을 확인합니다.",
    opsLensEnhancement: "Adds evidence-aware triage and KOMSCO assistant questions from the selected pod.",
    opsLensEnhancementKo: "선택한 파드에서 근거 기반 장애 분석과 KOMSCO 어시스턴트 질문을 연결합니다.",
    acceptance: "Pod view includes list, detail, events, logs, and related resources when RBAC allows.",
    acceptanceKo: "Pod 화면은 RBAC 허용 시 목록, 상세, 이벤트, 로그, 관련 리소스를 포함해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "pods",
      preferredResources: ["v1/pods"]
    }
  },
  {
    id: "deployments",
    section: "Workloads",
    label: "Deployments",
    labelKo: "배포",
    originalPath: "Workloads / Deployments",
    originalPathKo: "워크로드 / 배포",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List Deployments, unavailable replicas, events, owner pods, and sanitized YAML.",
    commandKo: "Deployment, 비가용 replica, 이벤트, 소유 파드, 마스킹된 YAML을 조회합니다.",
    opsLensEnhancement: "Adds rollout health and change-correlation context.",
    opsLensEnhancementKo: "롤아웃 상태와 변경 상관관계 컨텍스트를 추가합니다.",
    acceptance: "Deployment entry must map directly to apps/v1 Deployments.",
    acceptanceKo: "배포 항목은 apps/v1 Deployment에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "deployments",
      preferredResources: ["apps/v1/deployments"]
    }
  },
  {
    id: "deployment-configs",
    section: "Workloads",
    label: "Deployment Configs",
    labelKo: "배포 설정",
    originalPath: "Workloads / Deployment Configs",
    originalPathKo: "워크로드 / 배포 설정",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List OpenShift DeploymentConfigs and rollout-related evidence.",
    commandKo: "OpenShift DeploymentConfig와 롤아웃 관련 근거를 조회합니다.",
    opsLensEnhancement: "Keeps legacy OpenShift rollout objects visible next to Kubernetes Deployments.",
    opsLensEnhancementKo: "기존 OpenShift 롤아웃 객체를 Kubernetes Deployment 옆에서 볼 수 있게 유지합니다.",
    acceptance: "DeploymentConfig entry must map directly to apps.openshift.io/v1.",
    acceptanceKo: "배포 설정 항목은 apps.openshift.io/v1에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "deploymentconfigs",
      preferredResources: ["apps.openshift.io/v1/deploymentconfigs"]
    }
  },
  {
    id: "statefulsets",
    section: "Workloads",
    label: "StatefulSets",
    labelKo: "상태 저장 세트",
    originalPath: "Workloads / StatefulSets",
    originalPathKo: "워크로드 / 상태 저장 세트",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List StatefulSets, pods, volumes, events, and sanitized YAML.",
    commandKo: "StatefulSet, 파드, 볼륨, 이벤트, 마스킹된 YAML을 조회합니다.",
    opsLensEnhancement: "Adds storage-aware diagnosis and owner-chain evidence.",
    opsLensEnhancementKo: "스토리지 인지 진단과 소유 체인 근거를 추가합니다.",
    acceptance: "StatefulSet entry must map directly to apps/v1 StatefulSets.",
    acceptanceKo: "상태 저장 세트 항목은 apps/v1 StatefulSet에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "statefulsets",
      preferredResources: ["apps/v1/statefulsets"]
    }
  },
  {
    id: "secrets",
    section: "Workloads",
    label: "Secrets",
    labelKo: "시크릿",
    originalPath: "Workloads / Secrets",
    originalPathKo: "워크로드 / 시크릿",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List Secret metadata only and keep data payloads redacted.",
    commandKo: "Secret 메타데이터만 조회하고 데이터 페이로드는 마스킹합니다.",
    opsLensEnhancement: "Adds secret-reference diagnosis without exposing values.",
    opsLensEnhancementKo: "값 노출 없이 Secret 참조 진단을 추가합니다.",
    acceptance: "Secret entry must not render raw Secret data.",
    acceptanceKo: "시크릿 항목은 원본 Secret 데이터를 렌더링하지 않아야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "secrets",
      preferredResources: ["v1/secrets"]
    }
  },
  {
    id: "configmaps",
    section: "Workloads",
    label: "ConfigMaps",
    labelKo: "구성 맵",
    originalPath: "Workloads / ConfigMaps",
    originalPathKo: "워크로드 / 구성 맵",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List ConfigMaps and inspect sanitized configuration evidence.",
    commandKo: "ConfigMap을 조회하고 마스킹된 설정 근거를 확인합니다.",
    opsLensEnhancement: "Connects configuration drift to affected workloads.",
    opsLensEnhancementKo: "설정 드리프트를 영향받는 워크로드와 연결합니다.",
    acceptance: "ConfigMap entry must map directly to v1 ConfigMaps.",
    acceptanceKo: "구성 맵 항목은 v1 ConfigMap에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "configmaps",
      preferredResources: ["v1/configmaps"]
    }
  },
  {
    id: "cronjobs",
    section: "Workloads",
    label: "CronJobs",
    labelKo: "CronJobs",
    originalPath: "Workloads / CronJobs",
    originalPathKo: "워크로드 / CronJobs",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List CronJobs, recent Jobs, schedules, events, and open the native create flow when creation is required.",
    commandKo: "CronJob, 최근 Job, 스케줄, 이벤트를 조회하고 생성이 필요하면 원본 생성 화면으로 이동합니다.",
    opsLensEnhancement: "Adds schedule risk, failed-run evidence, and approval-aware create handoff.",
    opsLensEnhancementKo: "스케줄 리스크, 실패 실행 근거, 승인 기반 생성 인계를 추가합니다.",
    acceptance: "CronJob entry must map to batch/v1 CronJobs and expose a safe native create entry.",
    acceptanceKo: "CronJob 항목은 batch/v1 CronJob에 매핑되고 안전한 원본 생성 진입을 제공해야 합니다.",
    status: "native-deep-link",
    nativeCreatePath: "/k8s/ns/default/batch~v1~CronJob/~new",
    resourcePreset: {
      query: "cronjobs jobs schedules",
      preferredResources: ["batch/v1/cronjobs", "batch/v1/jobs"]
    }
  },
  {
    id: "jobs",
    section: "Workloads",
    label: "Jobs",
    labelKo: "작업",
    originalPath: "Workloads / Jobs",
    originalPathKo: "워크로드 / 작업",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List Jobs, completions, failed pods, and events.",
    commandKo: "Job, 완료 상태, 실패 파드, 이벤트를 조회합니다.",
    opsLensEnhancement: "Connects failed Jobs to owner CronJobs and assistant triage.",
    opsLensEnhancementKo: "실패한 Job을 소유 CronJob과 어시스턴트 진단에 연결합니다.",
    acceptance: "Job entry must map directly to batch/v1 Jobs.",
    acceptanceKo: "작업 항목은 batch/v1 Job에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "jobs",
      preferredResources: ["batch/v1/jobs"]
    }
  },
  {
    id: "daemonsets",
    section: "Workloads",
    label: "DaemonSets",
    labelKo: "데몬 세트",
    originalPath: "Workloads / DaemonSets",
    originalPathKo: "워크로드 / 데몬 세트",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List DaemonSets, desired/current pods, unavailable pods, and node spread.",
    commandKo: "DaemonSet, desired/current 파드, 비가용 파드, 노드 배치를 조회합니다.",
    opsLensEnhancement: "Adds node-scope rollout and evidence correlation.",
    opsLensEnhancementKo: "노드 범위 롤아웃과 근거 상관관계를 추가합니다.",
    acceptance: "DaemonSet entry must map directly to apps/v1 DaemonSets.",
    acceptanceKo: "데몬 세트 항목은 apps/v1 DaemonSet에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "daemonsets",
      preferredResources: ["apps/v1/daemonsets"]
    }
  },
  {
    id: "replicasets",
    section: "Workloads",
    label: "ReplicaSets",
    labelKo: "복제 세트",
    originalPath: "Workloads / ReplicaSets",
    originalPathKo: "워크로드 / 복제 세트",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List ReplicaSets and connect them to owning Deployments and Pods.",
    commandKo: "ReplicaSet을 조회하고 소유 Deployment 및 Pod와 연결합니다.",
    opsLensEnhancement: "Adds owner-chain collapse so rollout history is easier to inspect.",
    opsLensEnhancementKo: "롤아웃 이력을 쉽게 보도록 소유 체인 축약을 추가합니다.",
    acceptance: "ReplicaSet entry must map directly to apps/v1 ReplicaSets.",
    acceptanceKo: "복제 세트 항목은 apps/v1 ReplicaSet에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "replicasets",
      preferredResources: ["apps/v1/replicasets"]
    }
  },
  {
    id: "replicationcontrollers",
    section: "Workloads",
    label: "ReplicationControllers",
    labelKo: "복제 컨트롤러",
    originalPath: "Workloads / ReplicationControllers",
    originalPathKo: "워크로드 / 복제 컨트롤러",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List ReplicationControllers and related Pods for legacy workload support.",
    commandKo: "기존 워크로드 지원을 위해 ReplicationController와 관련 Pod를 조회합니다.",
    opsLensEnhancement: "Keeps legacy controller evidence available instead of hiding it behind Pods.",
    opsLensEnhancementKo: "기존 컨트롤러 근거를 Pod 뒤에 숨기지 않고 유지합니다.",
    acceptance: "ReplicationController entry must map directly to v1 ReplicationControllers.",
    acceptanceKo: "복제 컨트롤러 항목은 v1 ReplicationController에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "replicationcontrollers",
      preferredResources: ["v1/replicationcontrollers"]
    }
  },
  {
    id: "horizontalpodautoscalers",
    section: "Workloads",
    label: "HorizontalPodAutoscalers",
    labelKo: "HorizontalPodAutoscalers",
    originalPath: "Workloads / HorizontalPodAutoscalers",
    originalPathKo: "워크로드 / HorizontalPodAutoscalers",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List HPAs, current metrics, targets, and scale recommendations.",
    commandKo: "HPA, 현재 메트릭, 대상, 스케일 권고 근거를 조회합니다.",
    opsLensEnhancement: "Adds scale diagnosis without applying replica changes.",
    opsLensEnhancementKo: "replica 변경 없이 스케일 진단을 추가합니다.",
    acceptance: "HPA entry must map to autoscaling/v2 and fall back to autoscaling/v1.",
    acceptanceKo: "HPA 항목은 autoscaling/v2에 매핑되고 autoscaling/v1로 대체 가능해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "horizontalpodautoscalers hpa",
      preferredResources: [
        "autoscaling/v2/horizontalpodautoscalers",
        "autoscaling/v1/horizontalpodautoscalers"
      ]
    }
  },
  {
    id: "poddisruptionbudgets",
    section: "Workloads",
    label: "PodDisruptionBudgets",
    labelKo: "PodDisruptionBudgets",
    originalPath: "Workloads / PodDisruptionBudgets",
    originalPathKo: "워크로드 / PodDisruptionBudgets",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "List PDBs, allowed disruptions, and protected workloads.",
    commandKo: "PDB, 허용 중단 수, 보호 대상 워크로드를 조회합니다.",
    opsLensEnhancement: "Adds availability-risk context for node and rollout operations.",
    opsLensEnhancementKo: "노드 및 롤아웃 작업에 대한 가용성 리스크 컨텍스트를 추가합니다.",
    acceptance: "PDB entry must map directly to policy/v1 PodDisruptionBudgets.",
    acceptanceKo: "PDB 항목은 policy/v1 PodDisruptionBudget에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "poddisruptionbudgets pdb",
      preferredResources: ["policy/v1/poddisruptionbudgets"]
    }
  },
  {
    id: "routes",
    section: "Networking",
    label: "Routes",
    labelKo: "라우트",
    originalPath: "Networking / Routes",
    originalPathKo: "네트워킹 / 라우트",
    targetSelector: "[data-testid='ocp-networking-routes']",
    actionSurface: "networking-console",
    command: "Show OpenShift Routes with host, TLS termination, target Services, ports, and route-to-endpoint evidence.",
    commandKo: "OpenShift Route의 host, TLS termination, 대상 Service, port, route-endpoint 근거를 표시합니다.",
    opsLensEnhancement: "Adds route-to-service-to-endpoint diagnosis and port-forward handoff context.",
    opsLensEnhancementKo: "Route-Service-Endpoint 진단과 포트포워드 인계 컨텍스트를 추가합니다.",
    acceptance: "Routes entry must render a native-style Routes screen backed by route.openshift.io/v1 Routes.",
    acceptanceKo: "라우트 항목은 route.openshift.io/v1 Route 기반의 원본 콘솔형 Routes 화면을 렌더링해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "routes",
      preferredResources: ["route.openshift.io/v1/routes"]
    }
  },
  {
    id: "services",
    section: "Networking",
    label: "Services",
    labelKo: "서비스",
    originalPath: "Networking / Services",
    originalPathKo: "네트워킹 / 서비스",
    targetSelector: "[data-testid='ocp-networking-services']",
    actionSurface: "networking-console",
    command: "Show Services with selector, type, ClusterIP, ports, Endpoints, and EndpointSlices.",
    commandKo: "Service의 selector, 유형, ClusterIP, port, Endpoint, EndpointSlice를 표시합니다.",
    opsLensEnhancement: "Adds selector mismatch and endpoint readiness diagnosis.",
    opsLensEnhancementKo: "selector 불일치와 endpoint 준비 상태 진단을 추가합니다.",
    acceptance: "Services entry must render a native-style Services screen backed by v1 Services and related endpoints.",
    acceptanceKo: "서비스 항목은 v1 Service와 관련 Endpoint 기반의 원본 콘솔형 Services 화면을 렌더링해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "services endpoints endpointslices",
      preferredResources: [
        "v1/services",
        "v1/endpoints",
        "discovery.k8s.io/v1/endpointslices"
      ]
    }
  },
  {
    id: "ingresses",
    section: "Networking",
    label: "Ingresses",
    labelKo: "인그레스",
    originalPath: "Networking / Ingresses",
    originalPathKo: "네트워킹 / 인그레스",
    targetSelector: "[data-testid='ocp-networking-ingresses']",
    actionSurface: "networking-console",
    command: "Show Kubernetes Ingresses with hosts, backends, rules, TLS, and related route/service path.",
    commandKo: "Kubernetes Ingress의 host, backend, rule, TLS, 관련 route/service 경로를 표시합니다.",
    opsLensEnhancement: "Adds ingress-to-service path diagnosis without changing traffic.",
    opsLensEnhancementKo: "트래픽 변경 없이 Ingress-Service 경로 진단을 추가합니다.",
    acceptance: "Ingresses entry must render a native-style Ingresses screen backed by networking.k8s.io/v1 Ingresses.",
    acceptanceKo: "인그레스 항목은 networking.k8s.io/v1 Ingress 기반의 원본 콘솔형 Ingresses 화면을 렌더링해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "ingresses",
      preferredResources: ["networking.k8s.io/v1/ingresses"]
    }
  },
  {
    id: "network-policies",
    section: "Networking",
    label: "NetworkPolicies",
    labelKo: "네트워크 정책",
    originalPath: "Networking / NetworkPolicies",
    originalPathKo: "네트워킹 / 네트워크 정책",
    targetSelector: "[data-testid='ocp-networking-network-policies']",
    actionSurface: "networking-console",
    command: "Show NetworkPolicies with selected pods, policy types, ingress rules, egress rules, DNS and route context.",
    commandKo: "NetworkPolicy의 선택 Pod, 정책 유형, ingress 규칙, egress 규칙, DNS 및 route 컨텍스트를 표시합니다.",
    opsLensEnhancement: "Classifies blocked API, route, and plugin traffic before proposing read-only checks.",
    opsLensEnhancementKo: "읽기 전용 점검을 제안하기 전에 API, route, plugin 트래픽 차단을 분류합니다.",
    acceptance: "Network policy surface must render a native-style read-only NetworkPolicies screen and must not patch policy objects.",
    acceptanceKo: "네트워크 정책 화면은 원본 콘솔형 읽기 전용 NetworkPolicies 화면을 렌더링하고 정책 객체를 패치하지 않아야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "networkpolicies dnses ingresses routes",
      preferredResources: [
        "networking.k8s.io/v1/networkpolicies",
        "operator.openshift.io/v1/dnses",
        "config.openshift.io/v1/dnses",
        "networking.k8s.io/v1/ingresses",
        "route.openshift.io/v1/routes"
      ]
    }
  },
  {
    id: "persistentvolumeclaims",
    section: "Storage",
    label: "PersistentVolumeClaims",
    labelKo: "PersistentVolumeClaims",
    originalPath: "Storage / PersistentVolumeClaims",
    originalPathKo: "스토리지 / PersistentVolumeClaims",
    targetSelector: "[data-testid='ocp-storage-persistentvolumeclaims']",
    actionSurface: "storage-console",
    command: "List PVCs, phase, requested capacity, storage class, bound PV, and events.",
    commandKo: "PVC, 상태, 요청 용량, StorageClass, 바인딩된 PV, 이벤트를 조회합니다.",
    opsLensEnhancement: "Adds pending-bound-volume diagnosis and workload impact evidence.",
    opsLensEnhancementKo: "볼륨 Pending/Bound 진단과 워크로드 영향 근거를 추가합니다.",
    acceptance: "PVC entry must map directly to v1 PersistentVolumeClaims.",
    acceptanceKo: "PVC 항목은 v1 PersistentVolumeClaim에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "persistentvolumeclaims pvc",
      preferredResources: ["v1/persistentvolumeclaims"]
    }
  },
  {
    id: "persistentvolumes",
    section: "Storage",
    label: "PersistentVolumes",
    labelKo: "PersistentVolumes",
    originalPath: "Storage / PersistentVolumes",
    originalPathKo: "스토리지 / PersistentVolumes",
    targetSelector: "[data-testid='ocp-storage-persistentvolumes']",
    actionSurface: "storage-console",
    command: "List PVs, reclaim policy, capacity, claim refs, and node affinity.",
    commandKo: "PV, 회수 정책, 용량, claimRef, 노드 affinity를 조회합니다.",
    opsLensEnhancement: "Adds orphaned-volume and reclaim-risk context.",
    opsLensEnhancementKo: "고아 볼륨과 회수 정책 리스크 컨텍스트를 추가합니다.",
    acceptance: "PV entry must map directly to v1 PersistentVolumes.",
    acceptanceKo: "PV 항목은 v1 PersistentVolume에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "persistentvolumes pv",
      preferredResources: ["v1/persistentvolumes"]
    }
  },
  {
    id: "storageclasses",
    section: "Storage",
    label: "StorageClasses",
    labelKo: "StorageClasses",
    originalPath: "Storage / StorageClasses",
    originalPathKo: "스토리지 / StorageClasses",
    targetSelector: "[data-testid='ocp-storage-storageclasses']",
    actionSurface: "storage-console",
    command: "List StorageClasses, provisioners, reclaim policy, and volume binding mode.",
    commandKo: "StorageClass, provisioner, 회수 정책, volume binding mode를 조회합니다.",
    opsLensEnhancement: "Adds install-fit and dynamic provisioning diagnosis.",
    opsLensEnhancementKo: "설치 적합성과 동적 provisioning 진단을 추가합니다.",
    acceptance: "StorageClass entry must map directly to storage.k8s.io/v1 StorageClasses.",
    acceptanceKo: "StorageClass 항목은 storage.k8s.io/v1 StorageClass에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "storageclasses",
      preferredResources: ["storage.k8s.io/v1/storageclasses"]
    }
  },
  {
    id: "volumesnapshots",
    section: "Storage",
    label: "VolumeSnapshots",
    labelKo: "VolumeSnapshots",
    originalPath: "Storage / VolumeSnapshots",
    originalPathKo: "스토리지 / VolumeSnapshots",
    targetSelector: "[data-testid='ocp-storage-volumesnapshots']",
    actionSurface: "storage-console",
    command: "List VolumeSnapshots when the snapshot API is installed.",
    commandKo: "Snapshot API가 설치된 경우 VolumeSnapshot을 조회합니다.",
    opsLensEnhancement: "Adds backup/restore evidence without running storage mutations.",
    opsLensEnhancementKo: "스토리지 변경 없이 백업/복구 근거를 추가합니다.",
    acceptance: "VolumeSnapshot entry must show an explicit API-not-installed state when the CRD is absent.",
    acceptanceKo: "VolumeSnapshot 항목은 CRD가 없을 때 API 미설치 상태를 명확히 보여야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "volumesnapshots",
      preferredResources: ["snapshot.storage.k8s.io/v1/volumesnapshots"]
    }
  },
  {
    id: "volumesnapshotclasses",
    section: "Storage",
    label: "VolumeSnapshotClasses",
    labelKo: "VolumeSnapshotClasses",
    originalPath: "Storage / VolumeSnapshotClasses",
    originalPathKo: "스토리지 / VolumeSnapshotClasses",
    targetSelector: "[data-testid='ocp-storage-volumesnapshotclasses']",
    actionSurface: "storage-console",
    command: "List VolumeSnapshotClasses when snapshot storage APIs are installed.",
    commandKo: "Snapshot storage API가 설치된 경우 VolumeSnapshotClass를 조회합니다.",
    opsLensEnhancement: "Adds snapshot capability readiness evidence.",
    opsLensEnhancementKo: "스냅샷 기능 준비도 근거를 추가합니다.",
    acceptance: "VolumeSnapshotClass entry must show an explicit API-not-installed state when the CRD is absent.",
    acceptanceKo: "VolumeSnapshotClass 항목은 CRD가 없을 때 API 미설치 상태를 명확히 보여야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "volumesnapshotclasses",
      preferredResources: ["snapshot.storage.k8s.io/v1/volumesnapshotclasses"]
    }
  },
  {
    id: "builds",
    section: "Builds",
    label: "Builds",
    labelKo: "Builds",
    originalPath: "Builds / Builds",
    originalPathKo: "빌드 / Builds",
    targetSelector: "[data-testid='ocp-builds-builds']",
    actionSurface: "builds-console",
    command: "Show Builds with phase, strategy, output image, timestamps, and native start/cancel/log handoff.",
    commandKo: "Build 상태, 전략, 출력 이미지, 시간, 원본 시작/취소/로그 연결을 표시합니다.",
    opsLensEnhancement: "Adds failed-build clustering, image provenance, and release readiness evidence.",
    opsLensEnhancementKo: "실패 빌드 묶음, 이미지 출처, 릴리스 준비도 근거를 추가합니다.",
    acceptance: "Builds entry must render a native-style Builds screen backed by build.openshift.io/v1 Builds.",
    acceptanceKo: "Build 항목은 build.openshift.io/v1 Build 기반의 원본 콘솔형 Builds 화면을 렌더링해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "builds",
      preferredResources: ["build.openshift.io/v1/builds"]
    }
  },
  {
    id: "buildconfigs",
    section: "Builds",
    label: "BuildConfigs",
    labelKo: "BuildConfigs",
    originalPath: "Builds / BuildConfigs",
    originalPathKo: "빌드 / BuildConfigs",
    targetSelector: "[data-testid='ocp-builds-buildconfigs']",
    actionSurface: "builds-console",
    command: "Show BuildConfigs with triggers, strategy, source, output image, and run policy.",
    commandKo: "BuildConfig의 트리거, 전략, 소스, 출력 이미지, 실행 정책을 표시합니다.",
    opsLensEnhancement: "Adds build trigger and registry mismatch diagnosis.",
    opsLensEnhancementKo: "빌드 트리거와 레지스트리 불일치 진단을 추가합니다.",
    acceptance: "BuildConfig entry must render a native-style BuildConfigs screen backed by build.openshift.io/v1 BuildConfigs.",
    acceptanceKo: "BuildConfig 항목은 build.openshift.io/v1 BuildConfig 기반의 원본 콘솔형 BuildConfigs 화면을 렌더링해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "buildconfigs",
      preferredResources: ["build.openshift.io/v1/buildconfigs"]
    }
  },
  {
    id: "imagestreams",
    section: "Builds",
    label: "ImageStreams",
    labelKo: "ImageStreams",
    originalPath: "Builds / ImageStreams",
    originalPathKo: "빌드 / ImageStreams",
    targetSelector: "[data-testid='ocp-builds-imagestreams']",
    actionSurface: "builds-console",
    command: "Show ImageStreams and ImageStreamTags with tags, latest tag, repository, digest, and import state.",
    commandKo: "ImageStream과 ImageStreamTag의 태그, 최신 태그, 저장소, digest, import 상태를 표시합니다.",
    opsLensEnhancement: "Adds image tag, digest, architecture, and stale-tag evidence.",
    opsLensEnhancementKo: "이미지 태그, digest, 아키텍처, stale tag 근거를 추가합니다.",
    acceptance: "ImageStream entry must render a native-style ImageStreams screen backed by image.openshift.io/v1 resources.",
    acceptanceKo: "ImageStream 항목은 image.openshift.io/v1 리소스 기반의 원본 콘솔형 ImageStreams 화면을 렌더링해야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "imagestreams imagestreamtags",
      preferredResources: [
        "image.openshift.io/v1/imagestreams",
        "image.openshift.io/v1/imagestreamtags"
      ]
    }
  },
  {
    id: "alerting",
    section: "Monitoring",
    label: "Alerting",
    labelKo: "경고",
    originalPath: "Monitoring / Alerting",
    originalPathKo: "모니터링 / 경고",
    targetSelector: "[data-testid='ocp-monitoring-alerting']",
    actionSurface: "monitoring-console",
    command: "Inspect firing alerts in an OpenShift Observe-style alert table with source, severity, namespace, and state.",
    commandKo: "OpenShift Observe 스타일 경고 표에서 발생 중인 경고의 출처, 심각도, 네임스페이스, 상태를 확인합니다.",
    opsLensEnhancement: "Adds evidence-scored incident triage and KOMSCO answer citations after the native alert baseline is visible.",
    opsLensEnhancementKo: "원본 경고 기준 화면을 먼저 보여준 뒤 근거 점수 기반 장애 분석과 KOMSCO 답변 출처를 추가합니다.",
    acceptance: "Alerting renders a native monitoring alert table from live Prometheus/consoleDashboard evidence or an explicit unavailable state.",
    acceptanceKo: "경고 화면은 실시간 Prometheus/consoleDashboard 근거 또는 명시적 사용 불가 상태로 원본형 경고 표를 렌더링해야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "dashboards",
    section: "Monitoring",
    label: "Dashboards",
    labelKo: "대시보드",
    originalPath: "Monitoring / Dashboards",
    originalPathKo: "모니터링 / 대시보드",
    targetSelector: "[data-testid='ocp-monitoring-dashboards']",
    actionSurface: "monitoring-console",
    command: "Open an Observe dashboard-style utilization panel with time range, source status, and metric charts.",
    commandKo: "시간 범위, 출처 상태, 메트릭 차트가 있는 Observe 대시보드형 사용량 패널을 엽니다.",
    opsLensEnhancement: "Pairs native dashboard state with runbook citations and missing-evidence markers.",
    opsLensEnhancementKo: "원본 대시보드 상태를 런북 출처와 누락 근거 표시와 묶습니다.",
    acceptance: "Dashboard surfaces render live utilization source state and never fake live Prometheus success.",
    acceptanceKo: "대시보드 화면은 실시간 사용량 출처 상태를 표시하고 Prometheus 성공을 위장하지 않아야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "metrics",
    section: "Monitoring",
    label: "Metrics",
    labelKo: "메트릭",
    originalPath: "Monitoring / Metrics",
    originalPathKo: "모니터링 / 메트릭",
    targetSelector: "[data-testid='ocp-monitoring-metrics']",
    actionSurface: "monitoring-console",
    command: "Open a Prometheus query-browser-style metric surface with query, sample count, latest value, and error state.",
    commandKo: "쿼리, 샘플 수, 최신 값, 오류 상태가 있는 Prometheus 쿼리 브라우저형 메트릭 화면을 엽니다.",
    opsLensEnhancement: "Pairs metric state with runbook citations and missing-evidence markers after the query browser baseline.",
    opsLensEnhancementKo: "쿼리 브라우저 기준 화면 뒤에 메트릭 상태를 런북 출처와 누락 근거 표시와 묶습니다.",
    acceptance: "Metrics surface renders query status, selected expression, and result metadata without fake live Prometheus success.",
    acceptanceKo: "메트릭 화면은 가짜 Prometheus 성공 없이 쿼리 상태, 선택된 표현식, 결과 메타데이터를 렌더링해야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "logs",
    section: "Monitoring",
    label: "Logs",
    labelKo: "로그",
    originalPath: "Monitoring / Logs",
    originalPathKo: "모니터링 / 로그",
    targetSelector: "[data-testid='ocp-monitoring-logs']",
    actionSurface: "monitoring-console",
    command: "Open a log-style Observe surface with explicit logging availability and read-only event stream fallback.",
    commandKo: "로깅 사용 가능 여부와 읽기 전용 이벤트 스트림 대체 경로를 명시하는 Observe 로그형 화면을 엽니다.",
    opsLensEnhancement: "Logs and events become citeable assistant evidence rather than disposable text.",
    opsLensEnhancementKo: "로그와 이벤트를 일회성 텍스트가 아니라 어시스턴트가 인용 가능한 근거로 만듭니다.",
    acceptance: "Logs surface must show the logging boundary and event-backed activity instead of pretending Loki is installed.",
    acceptanceKo: "로그 화면은 Loki가 설치된 것처럼 위장하지 않고 로깅 경계와 이벤트 기반 활동을 보여야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "nodes",
    section: "Compute",
    label: "Nodes",
    labelKo: "노드",
    originalPath: "Compute / Nodes",
    originalPathKo: "컴퓨트 / 노드",
    targetSelector: "[data-testid='ocp-compute-nodes']",
    actionSurface: "compute-console",
    command: "List Nodes, readiness, capacity, architecture, taints, and pressure conditions.",
    commandKo: "Node, 준비 상태, 용량, 아키텍처, taint, pressure condition을 조회합니다.",
    opsLensEnhancement: "Adds CRC capacity pressure and install/runtime fit evidence.",
    opsLensEnhancementKo: "CRC 용량 압박과 설치/런타임 적합성 근거를 추가합니다.",
    acceptance: "Nodes entry must map directly to v1 Nodes.",
    acceptanceKo: "노드 항목은 v1 Node에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "nodes",
      preferredResources: ["v1/nodes"]
    }
  },
  {
    id: "machines",
    section: "Compute",
    label: "Machines",
    labelKo: "Machines",
    originalPath: "Compute / Machines",
    originalPathKo: "컴퓨트 / Machines",
    targetSelector: "[data-testid='ocp-compute-machines']",
    actionSurface: "compute-console",
    command: "List Machines and provider state when Machine API is installed.",
    commandKo: "Machine API가 설치된 경우 Machine과 provider 상태를 조회합니다.",
    opsLensEnhancement: "Adds machine-to-node diagnosis without changing machine resources.",
    opsLensEnhancementKo: "Machine 리소스를 변경하지 않고 Machine-Node 진단을 추가합니다.",
    acceptance: "Machines entry must show an explicit API-not-installed state when Machine API is absent.",
    acceptanceKo: "Machines 항목은 Machine API가 없을 때 API 미설치 상태를 명확히 보여야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "machines",
      preferredResources: ["machine.openshift.io/v1beta1/machines"]
    }
  },
  {
    id: "machinesets",
    section: "Compute",
    label: "MachineSets",
    labelKo: "MachineSets",
    originalPath: "Compute / MachineSets",
    originalPathKo: "컴퓨트 / MachineSets",
    targetSelector: "[data-testid='ocp-compute-machinesets']",
    actionSurface: "compute-console",
    command: "List MachineSets, desired replicas, and owned Machines.",
    commandKo: "MachineSet, desired replica, 소유 Machine을 조회합니다.",
    opsLensEnhancement: "Adds scale-risk context and read-only owner-chain evidence.",
    opsLensEnhancementKo: "스케일 리스크와 읽기 전용 소유 체인 근거를 추가합니다.",
    acceptance: "MachineSets entry must map directly to machine.openshift.io/v1beta1 MachineSets when available.",
    acceptanceKo: "MachineSets 항목은 사용 가능할 때 machine.openshift.io/v1beta1 MachineSet에 직접 매핑되어야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "machinesets",
      preferredResources: ["machine.openshift.io/v1beta1/machinesets"]
    }
  },
  {
    id: "machineconfigpools",
    section: "Compute",
    label: "MachineConfigPools",
    labelKo: "MachineConfigPools",
    originalPath: "Compute / MachineConfigPools",
    originalPathKo: "컴퓨트 / MachineConfigPools",
    targetSelector: "[data-testid='ocp-compute-machineconfigpools']",
    actionSurface: "compute-console",
    command: "List MachineConfigPools, updated/degraded state, and paused rollout flags.",
    commandKo: "MachineConfigPool, updated/degraded 상태, paused rollout 플래그를 조회합니다.",
    opsLensEnhancement: "Adds upgrade-block and node rollout diagnosis.",
    opsLensEnhancementKo: "업그레이드 차단과 노드 롤아웃 진단을 추가합니다.",
    acceptance: "MachineConfigPools entry must map directly to machineconfiguration.openshift.io/v1 MachineConfigPools.",
    acceptanceKo: "MachineConfigPools 항목은 machineconfiguration.openshift.io/v1 MachineConfigPool에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "machineconfigpools",
      preferredResources: ["machineconfiguration.openshift.io/v1/machineconfigpools"]
    }
  },
  {
    id: "users",
    section: "User Management",
    label: "Users",
    labelKo: "사용자",
    originalPath: "User Management / Users",
    originalPathKo: "사용자 관리 / 사용자",
    targetSelector: "[data-testid='ocp-user-users']",
    actionSurface: "user-management-console",
    command: "List OpenShift Users and identities without exposing credentials.",
    commandKo: "자격증명을 노출하지 않고 OpenShift User와 identity를 조회합니다.",
    opsLensEnhancement: "Adds RBAC impact context and blocks credential exposure.",
    opsLensEnhancementKo: "RBAC 영향 컨텍스트를 추가하고 자격증명 노출을 차단합니다.",
    acceptance: "Users entry must map directly to user.openshift.io/v1 Users when available.",
    acceptanceKo: "사용자 항목은 사용 가능할 때 user.openshift.io/v1 User에 직접 매핑되어야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "users",
      preferredResources: ["user.openshift.io/v1/users"]
    }
  },
  {
    id: "groups",
    section: "User Management",
    label: "Groups",
    labelKo: "그룹",
    originalPath: "User Management / Groups",
    originalPathKo: "사용자 관리 / 그룹",
    targetSelector: "[data-testid='ocp-user-groups']",
    actionSurface: "user-management-console",
    command: "List OpenShift Groups and membership references.",
    commandKo: "OpenShift Group과 멤버십 참조를 조회합니다.",
    opsLensEnhancement: "Adds group-to-rolebinding impact context.",
    opsLensEnhancementKo: "Group-RoleBinding 영향 컨텍스트를 추가합니다.",
    acceptance: "Groups entry must map directly to user.openshift.io/v1 Groups when available.",
    acceptanceKo: "그룹 항목은 사용 가능할 때 user.openshift.io/v1 Group에 직접 매핑되어야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "groups",
      preferredResources: ["user.openshift.io/v1/groups"]
    }
  },
  {
    id: "serviceaccounts",
    section: "User Management",
    label: "ServiceAccounts",
    labelKo: "서비스 계정",
    originalPath: "User Management / ServiceAccounts",
    originalPathKo: "사용자 관리 / 서비스 계정",
    targetSelector: "[data-testid='ocp-user-serviceaccounts']",
    actionSurface: "user-management-console",
    command: "List ServiceAccounts and image pull secret references without displaying token data.",
    commandKo: "토큰 데이터를 표시하지 않고 ServiceAccount와 imagePullSecret 참조를 조회합니다.",
    opsLensEnhancement: "Adds workload identity and pull-secret diagnosis.",
    opsLensEnhancementKo: "워크로드 identity와 pull-secret 진단을 추가합니다.",
    acceptance: "ServiceAccounts entry must not display raw token or Secret data.",
    acceptanceKo: "서비스 계정 항목은 원본 토큰이나 Secret 데이터를 표시하지 않아야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "serviceaccounts",
      preferredResources: ["v1/serviceaccounts"]
    }
  },
  {
    id: "roles",
    section: "User Management",
    label: "Roles",
    labelKo: "역할",
    originalPath: "User Management / Roles",
    originalPathKo: "사용자 관리 / 역할",
    targetSelector: "[data-testid='ocp-user-roles']",
    actionSurface: "user-management-console",
    command: "List namespaced Roles and ClusterRoles for RBAC review.",
    commandKo: "RBAC 검토를 위해 Role과 ClusterRole을 조회합니다.",
    opsLensEnhancement: "Adds permission summarization and approval-boundary labels.",
    opsLensEnhancementKo: "권한 요약과 승인 경계 라벨을 추가합니다.",
    acceptance: "Roles entry must map to rbac.authorization.k8s.io/v1 Roles and ClusterRoles.",
    acceptanceKo: "역할 항목은 rbac.authorization.k8s.io/v1 Role 및 ClusterRole에 매핑되어야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "roles clusterroles",
      preferredResources: [
        "rbac.authorization.k8s.io/v1/roles",
        "rbac.authorization.k8s.io/v1/clusterroles"
      ]
    }
  },
  {
    id: "rolebindings",
    section: "User Management",
    label: "RoleBindings",
    labelKo: "역할 바인딩",
    originalPath: "User Management / RoleBindings",
    originalPathKo: "사용자 관리 / 역할 바인딩",
    targetSelector: "[data-testid='ocp-user-rolebindings']",
    actionSurface: "user-management-console",
    command: "List RoleBindings and ClusterRoleBindings for RBAC relationship review.",
    commandKo: "RBAC 관계 검토를 위해 RoleBinding과 ClusterRoleBinding을 조회합니다.",
    opsLensEnhancement: "Adds subject-to-permission impact context.",
    opsLensEnhancementKo: "주체-권한 영향 컨텍스트를 추가합니다.",
    acceptance: "RoleBindings entry must map to namespaced and cluster RBAC bindings.",
    acceptanceKo: "역할 바인딩 항목은 네임스페이스/클러스터 RBAC 바인딩에 매핑되어야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "rolebindings clusterrolebindings",
      preferredResources: [
        "rbac.authorization.k8s.io/v1/rolebindings",
        "rbac.authorization.k8s.io/v1/clusterrolebindings"
      ]
    }
  },
  {
    id: "cluster-settings",
    section: "Administration",
    label: "Cluster Settings",
    labelKo: "클러스터 설정",
    originalPath: "Administration / Cluster Settings",
    originalPathKo: "관리 / 클러스터 설정",
    targetSelector: "[data-testid='ocp-admin-cluster-settings']",
    actionSurface: "administration-console",
    command: "Review cluster version, console configuration, OperatorHub sources, and approval-gated changes.",
    commandKo: "클러스터 버전, 콘솔 설정, OperatorHub 소스, 승인 필요 변경을 검토합니다.",
    opsLensEnhancement: "Separates read-only diagnostics from mutation plans and labels approval boundaries.",
    opsLensEnhancementKo: "읽기 전용 진단과 변경 계획을 분리하고 승인 경계를 표시합니다.",
    acceptance: "Cluster setting actions must surface patch previews before any apply path.",
    acceptanceKo: "클러스터 설정 작업은 apply 경로 전에 patch preview를 보여야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "clusterversions consoles operatorhubs consoleplugins",
      preferredResources: [
        "config.openshift.io/v1/clusterversions",
        "operator.openshift.io/v1/consoles",
        "config.openshift.io/v1/operatorhubs",
        "console.openshift.io/v1/consoleplugins"
      ]
    }
  },
  {
    id: "clusteroperators",
    section: "Administration",
    label: "ClusterOperators",
    labelKo: "ClusterOperators",
    originalPath: "Administration / Cluster Settings / ClusterOperators",
    originalPathKo: "관리 / 클러스터 설정 / ClusterOperators",
    targetSelector: "[data-testid='ocp-admin-clusteroperators']",
    actionSurface: "administration-console",
    command: "List ClusterOperators, availability, degradation, progressing state, and condition messages.",
    commandKo: "ClusterOperator, Available/Degraded/Progressing 상태와 condition 메시지를 조회합니다.",
    opsLensEnhancement: "Adds upgrade-block and platform health diagnosis.",
    opsLensEnhancementKo: "업그레이드 차단과 플랫폼 상태 진단을 추가합니다.",
    acceptance: "ClusterOperators entry must map directly to config.openshift.io/v1 ClusterOperators.",
    acceptanceKo: "ClusterOperators 항목은 config.openshift.io/v1 ClusterOperator에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "clusteroperators",
      preferredResources: ["config.openshift.io/v1/clusteroperators"]
    }
  },
  {
    id: "namespaces",
    section: "Administration",
    label: "Namespaces",
    labelKo: "네임스페이스",
    originalPath: "Administration / Namespaces",
    originalPathKo: "관리 / 네임스페이스",
    targetSelector: "[data-testid='ocp-admin-namespaces']",
    actionSurface: "administration-console",
    command: "List Namespaces, phase, labels, annotations, quotas, and recent events.",
    commandKo: "Namespace, 상태, label, annotation, quota, 최근 이벤트를 조회합니다.",
    opsLensEnhancement: "Adds namespace scope and tenant impact context.",
    opsLensEnhancementKo: "네임스페이스 범위와 tenant 영향 컨텍스트를 추가합니다.",
    acceptance: "Namespaces entry must map directly to v1 Namespaces.",
    acceptanceKo: "네임스페이스 항목은 v1 Namespace에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "namespaces",
      preferredResources: ["v1/namespaces"]
    }
  },
  {
    id: "custom-resource-definitions",
    section: "Administration",
    label: "CustomResourceDefinitions",
    labelKo: "CustomResourceDefinitions",
    originalPath: "Administration / CustomResourceDefinitions",
    originalPathKo: "관리 / CustomResourceDefinitions",
    targetSelector: "[data-testid='ocp-admin-custom-resource-definitions']",
    actionSurface: "administration-console",
    command: "List CRDs, served versions, conversion strategy, and established conditions.",
    commandKo: "CRD, served version, conversion 전략, Established condition을 조회합니다.",
    opsLensEnhancement: "Adds API coverage diagnostics and conversion webhook failure classification.",
    opsLensEnhancementKo: "API 커버리지 진단과 conversion webhook 실패 분류를 추가합니다.",
    acceptance: "CRD entry must map directly to apiextensions.k8s.io/v1 CustomResourceDefinitions.",
    acceptanceKo: "CRD 항목은 apiextensions.k8s.io/v1 CustomResourceDefinition에 직접 매핑되어야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "customresourcedefinitions crds apiservices",
      preferredResources: [
        "apiextensions.k8s.io/v1/customresourcedefinitions",
        "apiregistration.k8s.io/v1/apiservices"
      ]
    }
  },
  {
    id: "resourcequotas",
    section: "Administration",
    label: "ResourceQuotas",
    labelKo: "ResourceQuotas",
    originalPath: "Administration / ResourceQuotas",
    originalPathKo: "관리 / ResourceQuotas",
    targetSelector: "[data-testid='ocp-admin-resourcequotas']",
    actionSurface: "administration-console",
    command: "List ResourceQuotas and hard/used quota pressure.",
    commandKo: "ResourceQuota와 hard/used quota 압박을 조회합니다.",
    opsLensEnhancement: "Adds capacity-risk and tenant-impact diagnosis.",
    opsLensEnhancementKo: "용량 리스크와 tenant 영향 진단을 추가합니다.",
    acceptance: "ResourceQuotas entry must map directly to v1 ResourceQuotas.",
    acceptanceKo: "ResourceQuotas 항목은 v1 ResourceQuota에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "resourcequotas",
      preferredResources: ["v1/resourcequotas"]
    }
  },
  {
    id: "limitranges",
    section: "Administration",
    label: "LimitRanges",
    labelKo: "LimitRanges",
    originalPath: "Administration / LimitRanges",
    originalPathKo: "관리 / LimitRanges",
    targetSelector: "[data-testid='ocp-admin-limitranges']",
    actionSurface: "administration-console",
    command: "List LimitRanges and namespace default request/limit policy.",
    commandKo: "LimitRange와 네임스페이스 기본 request/limit 정책을 조회합니다.",
    opsLensEnhancement: "Adds pod admission and capacity planning context.",
    opsLensEnhancementKo: "Pod admission과 용량 계획 컨텍스트를 추가합니다.",
    acceptance: "LimitRanges entry must map directly to v1 LimitRanges.",
    acceptanceKo: "LimitRanges 항목은 v1 LimitRange에 직접 매핑되어야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "limitranges",
      preferredResources: ["v1/limitranges"]
    }
  },
  {
    id: "opslens-admin",
    section: "Cywell",
    label: "OpsLens Admin",
    labelKo: "OpsLens 관리",
    originalPath: "Cywell / OpsLens Admin",
    originalPathKo: "Cywell / OpsLens 관리",
    targetSelector: "[data-testid='opslens-install-readiness']",
    actionSurface: "ops-admin",
    command: "Operate the OpsLens RAG, evaluation, runtime, install, and completion dashboard.",
    commandKo: "OpsLens RAG, 평가, 실행 환경, 설치, 완료 조건 대시보드를 운영합니다.",
    opsLensEnhancement: "This is the added OpsLens control room, not a replacement for native OpenShift pages.",
    opsLensEnhancementKo: "이 화면은 원본 OpenShift 페이지를 대체하는 것이 아니라 OpsLens가 추가한 관제실입니다.",
    acceptance: "OpsLens Admin must keep install, RAG, runtime, and release actions approval-gated.",
    acceptanceKo: "OpsLens 관리는 설치, RAG, 런타임, 릴리스 행동을 승인 게이트 뒤에 둬야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "opsbrain",
    section: "Cywell",
    label: "OpsBrain",
    labelKo: "OpsBrain",
    originalPath: "Cywell / OpsBrain",
    originalPathKo: "Cywell / OpsBrain",
    targetSelector: "[data-testid='opslens-opsbrain-system']",
    actionSurface: "opsbrain",
    command: "Open the no-fine-tuning growth loop: memory, evaluator, risk gate, and required keys.",
    commandKo: "파인튜닝 없는 성장 루프, 메모리, 평가기, 위험 게이트, 필수 키를 엽니다.",
    opsLensEnhancement: "Converts repeated operator decisions into governed memory and evaluation loops.",
    opsLensEnhancementKo: "반복되는 운영 판단을 통제된 메모리와 평가 루프로 전환합니다.",
    acceptance: "OpsBrain must show learning boundaries and avoid autonomous cluster mutation.",
    acceptanceKo: "OpsBrain은 학습 경계를 보여야 하며 자율 클러스터 변경을 하지 않아야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "komsco-assistant",
    section: "Cywell",
    label: "KOMSCO AI Assistant",
    labelKo: "KOMSCO AI 어시스턴트",
    originalPath: "Cywell / Assistant",
    originalPathKo: "Cywell / 어시스턴트",
    targetSelector: "[data-testid='assistant-launcher']",
    actionSurface: "assistant",
    command: "Open the KOMSCO assistant with the current console context and read-only action plan boundary.",
    commandKo: "현재 콘솔 컨텍스트와 읽기 전용 계획 경계를 가진 KOMSCO 어시스턴트를 엽니다.",
    opsLensEnhancement: "Adds prompt-aware answers, local RAG citations, and OpenShift context capture.",
    opsLensEnhancementKo: "질문 반영 답변, 로컬 RAG 출처, OpenShift 컨텍스트 캡처를 추가합니다.",
    acceptance: "Assistant answers include the submitted question, citations, and no cluster mutation command.",
    acceptanceKo: "어시스턴트 답변은 제출한 질문, 출처를 포함하고 클러스터 변경 명령을 포함하지 않아야 합니다.",
    status: "ops-enhanced"
  }
];

function inferCoverageClass(
  item: ConsoleParityItemDraft
): ConsoleParityCoverageClass {
  if (item.status === "native-deep-link") {
    return "native-deep-link";
  }

  if (item.status === "read-only-plan" || item.actionSurface === "assistant") {
    return "plan-only";
  }

  if (item.targetSelector.trim().length === 0) {
    return "gap";
  }

  return "live-view";
}

export const ocpConsoleParityItems: ConsoleParityItem[] =
  ocpConsoleParityItemDrafts.map((item) => ({
    ...item,
    coverageClass: inferCoverageClass(item)
  }));

export function parityCoverageSummary() {
  const nativeCount = ocpConsoleParityItems.filter(
    (item) => item.section !== "Cywell"
  ).length;
  const cywellCount = ocpConsoleParityItems.length - nativeCount;
  const coveredCount = ocpConsoleParityItems.filter(
    (item) => item.status !== "native-deep-link"
  ).length;
  const resourcePresetCount = ocpConsoleParityItems.filter(
    (item) => item.resourcePreset
  ).length;
  const evidenceViewCount = ocpConsoleParityItems.filter(
    (item) => item.evidenceView
  ).length;
  const directSurfaceCount =
    ocpConsoleParityItems.length - resourcePresetCount - evidenceViewCount;
  const liveViewCount = ocpConsoleParityItems.filter(
    (item) => item.coverageClass === "live-view"
  ).length;
  const nativeDeepLinkCount = ocpConsoleParityItems.filter(
    (item) => item.coverageClass === "native-deep-link"
  ).length;
  const planOnlyCount = ocpConsoleParityItems.filter(
    (item) => item.coverageClass === "plan-only"
  ).length;
  const gapCount = ocpConsoleParityItems.filter(
    (item) => item.coverageClass === "gap"
  ).length;

  return {
    nativeCount,
    cywellCount,
    totalCount: ocpConsoleParityItems.length,
    coveredCount,
    resourcePresetCount,
    evidenceViewCount,
    directSurfaceCount,
    liveViewCount,
    nativeDeepLinkCount,
    planOnlyCount,
    gapCount,
    sourceVersion: ocpConsoleBaseline.crcVersion
  };
}

function apiVersionFromPreferredResource(resource: string) {
  const parts = resource.split("/");
  if (parts.length < 2) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

function nativeCreateApiVersion(path: string | undefined) {
  if (!path) {
    return "";
  }
  const match = path.match(/\/([^/]+~[^/]+~[^/]+)\/~new$/);
  if (!match) {
    return "";
  }

  const [groupOrVersion, version] = match[1].split("~");
  return groupOrVersion === "v1" ? "v1" : `${groupOrVersion}/${version}`;
}

export function consoleParityCompatibilityProfile(
  item: ConsoleParityItem
): ConsoleParityCompatibilityProfile {
  const apiVersions = new Set<string>();
  for (const resource of item.resourcePreset?.preferredResources ?? []) {
    const apiVersion = apiVersionFromPreferredResource(resource);
    if (apiVersion) {
      apiVersions.add(apiVersion);
    }
  }

  const createApiVersion = nativeCreateApiVersion(item.nativeCreatePath);
  if (createApiVersion) {
    apiVersions.add(createApiVersion);
  }

  const apiVersionList = [...apiVersions].sort();
  const baseline =
    item.coverageClass === "native-deep-link"
      ? "OCP 4.20 native console deep link"
      : item.coverageClass === "plan-only"
        ? "OCP 4.20 read-only/plan boundary"
        : apiVersionList.length > 0
          ? "OCP 4.20 API allowlist"
          : "OCP 4.20 console plugin surface";
  const baselineKo =
    item.coverageClass === "native-deep-link"
      ? "OCP 4.20 원본 콘솔 딥링크"
      : item.coverageClass === "plan-only"
        ? "OCP 4.20 읽기 전용/계획 경계"
        : apiVersionList.length > 0
          ? "OCP 4.20 API 허용 목록"
          : "OCP 4.20 콘솔 플러그인 화면";

  return {
    minimumRuntime: ocpConsoleBaseline.minimumRuntime,
    baseline,
    baselineKo,
    apiVersions: apiVersionList,
    nativeCreateApiVersion: createApiVersion || undefined,
    forwardEnhancement:
      "4.21+ convenience is treated as UX guidance, not a required API dependency.",
    forwardEnhancementKo:
      "4.21+ 편의성은 필수 API 의존성이 아니라 UX 참고 기준으로만 사용합니다.",
    proof:
      "verify:ocp:420-compatibility now emits per-item API/runtime evidence; strict Windows CRC 4.20 proof remains pending.",
    proofKo:
      "verify:ocp:420-compatibility가 항목별 API/런타임 근거를 남기며, 엄격한 Windows CRC 4.20 증명은 아직 대기 중입니다."
  };
}

export function consoleParityFunctionProof(
  item: ConsoleParityItem
): ConsoleParityFunctionProof {
  if (item.resourcePreset && item.actionSurface === "resource-explorer") {
    return {
      mode: "resource-preset",
      input: `Resource preset: ${item.resourcePreset.query}`,
      inputKo: `리소스 프리셋: ${item.resourcePreset.query}`,
      proof:
        "Target selector must mount, Resource Explorer must auto-load the preset, and list/detail/events/logs/related smoke must stay read-only.",
      proofKo:
        "대상 selector가 장착되고, 리소스 탐색기가 프리셋을 자동 조회하며, 목록/상세/이벤트/로그/관련 스모크가 읽기 전용으로 유지되어야 합니다."
    };
  }

  if (item.actionSurface === "topology-graph") {
    return {
      mode: "topology-graph",
      input: "Pods, deployments, services, routes, jobs, and cronjobs",
      inputKo: "Pod, Deployment, Service, Route, Job, CronJob",
      proof:
        "The topology screen must render selector, ownerReference, and route target edges from read-only OpenShift API data.",
      proofKo:
        "토폴로지 화면은 읽기 전용 OpenShift API 데이터에서 selector, ownerReference, route target 연결을 렌더링해야 합니다."
    };
  }

  if (item.actionSurface === "monitoring-console") {
    return {
      mode: "monitoring-console",
      input: `Monitoring surface: ${item.id}`,
      inputKo: `모니터링 화면: ${item.labelKo}`,
      proof:
        "Monitoring target must mount a native Observe-style surface with alerting, dashboard, metric query, or log/event evidence and explicit unavailable state.",
      proofKo:
        "모니터링 대상은 경고, 대시보드, 메트릭 쿼리, 로그/이벤트 근거와 명시적 사용 불가 상태가 있는 원본 Observe 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "builds-console") {
    return {
      mode: "builds-console",
      input: `Build surface: ${item.id}`,
      inputKo: `빌드 화면: ${item.labelKo}`,
      proof:
        "Build target must mount a native Builds-style surface with Build, BuildConfig, ImageStream, input, strategy, output, trigger, and run-policy evidence.",
      proofKo:
        "빌드 대상은 Build, BuildConfig, ImageStream, 입력, 전략, 출력, 트리거, 실행 정책 근거를 갖춘 원본 Builds 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "networking-console") {
    return {
      mode: "networking-console",
      input: `Networking surface: ${item.id}`,
      inputKo: `네트워킹 화면: ${item.labelKo}`,
      proof:
        "Networking target must mount a native Networking-style surface with Route, Service, Endpoint, EndpointSlice, Ingress, NetworkPolicy, DNS, and read-only reachability evidence.",
      proofKo:
        "네트워킹 대상은 Route, Service, Endpoint, EndpointSlice, Ingress, NetworkPolicy, DNS, 읽기 전용 도달성 근거를 갖춘 원본 Networking 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "storage-console") {
    return {
      mode: "storage-console",
      input: `Storage surface: ${item.id}`,
      inputKo: `스토리지 화면: ${item.labelKo}`,
      proof:
        "Storage target must mount a native Storage-style surface with PVC, PV, StorageClass, VolumeSnapshot, VolumeSnapshotClass, binding, provisioner, reclaim, and snapshot readiness evidence.",
      proofKo:
        "스토리지 대상은 PVC, PV, StorageClass, VolumeSnapshot, VolumeSnapshotClass, 바인딩, provisioner, 회수 정책, 스냅샷 준비도 근거를 갖춘 원본 Storage 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "administration-console") {
    return {
      mode: "administration-console",
      input: `Administration surface: ${item.id}`,
      inputKo: `관리 화면: ${item.labelKo}`,
      proof:
        "Administration target must mount a native Administration-style surface with ClusterVersion, ClusterOperator, Namespace, CRD, APIService, ResourceQuota, LimitRange, and approval-boundary evidence.",
      proofKo:
        "관리 대상은 ClusterVersion, ClusterOperator, Namespace, CRD, APIService, ResourceQuota, LimitRange, 승인 경계 근거를 갖춘 원본 Administration 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "compute-console") {
    return {
      mode: "compute-console",
      input: `Compute surface: ${item.id}`,
      inputKo: `컴퓨트 화면: ${item.labelKo}`,
      proof:
        "Compute target must mount a native Compute-style surface with Node readiness, capacity, pressure, Machine API, MachineSet, and MachineConfigPool rollout evidence.",
      proofKo:
        "컴퓨트 대상은 Node readiness, 용량, pressure, Machine API, MachineSet, MachineConfigPool 롤아웃 근거를 갖춘 원본 Compute 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.actionSurface === "user-management-console") {
    return {
      mode: "user-management-console",
      input: `User Management surface: ${item.id}`,
      inputKo: `사용자 관리 화면: ${item.labelKo}`,
      proof:
        "User Management target must mount a native RBAC-style surface with User, Group, ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding, subject, rule, and credential-redaction evidence.",
      proofKo:
        "사용자 관리 대상은 User, Group, ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding, 주체, 규칙, 자격증명 비노출 근거를 갖춘 원본 RBAC 스타일 화면을 장착해야 합니다."
    };
  }

  if (item.evidenceView) {
    return {
      mode: "evidence-view",
      input: `Evidence view: ${item.evidenceView}`,
      inputKo: `근거 보기: ${item.evidenceView}`,
      proof:
        "Target selector must mount, the evidence tab must switch to the requested view, and assistant actions must remain plan-only.",
      proofKo:
        "대상 selector가 장착되고, 근거 탭이 요청된 보기로 전환되며, 어시스턴트 동작은 계획 전용으로 유지되어야 합니다."
    };
  }

  if (item.actionSurface === "assistant") {
    return {
      mode: "assistant",
      input: "KOMSCO prompt context",
      inputKo: "KOMSCO 질문 컨텍스트",
      proof:
        "The assistant launcher must open with the selected console context and no cluster mutation command.",
      proofKo:
        "어시스턴트 런처가 선택한 콘솔 컨텍스트로 열리고 클러스터 변경 명령을 포함하지 않아야 합니다."
    };
  }

  if (item.actionSurface === "overview") {
    return {
      mode: "overview",
      input: "Live cluster overview",
      inputKo: "실시간 클러스터 개요",
      proof:
        "Overview target must mount and surface live or explicitly unavailable cluster evidence.",
      proofKo:
        "개요 대상이 장착되고 실시간 또는 명시적 사용 불가 클러스터 근거를 보여야 합니다."
    };
  }

  if (item.actionSurface === "ops-admin") {
    return {
      mode: "ops-admin",
      input: "OpsLens admin evidence",
      inputKo: "OpsLens 관리 근거",
      proof:
        "Admin target must mount and expose approval-gated install, catalog, runtime, or connectivity evidence.",
      proofKo:
        "관리 대상이 장착되고 승인 게이트가 있는 설치, 카탈로그, 런타임, 연결 근거를 보여야 합니다."
    };
  }

  if (item.actionSurface === "opsbrain") {
    return {
      mode: "opsbrain",
      input: "OpsBrain governance state",
      inputKo: "OpsBrain 거버넌스 상태",
      proof:
        "OpsBrain target must mount and keep memory, evaluation, and self-improvement behind non-mutating gates.",
      proofKo:
        "OpsBrain 대상이 장착되고 메모리, 평가, 자기개선이 비변경 게이트 뒤에 유지되어야 합니다."
    };
  }

  return {
    mode: "ops-dashboard",
    input: "OpsLens dashboard signals",
    inputKo: "OpsLens 대시보드 신호",
    proof:
      "Dashboard target must mount and keep operations evidence tied to source status instead of fake live success.",
    proofKo:
      "대시보드 대상이 장착되고 운영 근거가 가짜 실시간 성공 대신 출처 상태와 연결되어야 합니다."
  };
}

export function consoleParityFunctionSignal(
  item: ConsoleParityItem
): ConsoleParityFunctionSignal {
  if (item.resourcePreset && item.actionSurface === "resource-explorer") {
    return {
      selector: "[data-testid='console-active-action-outcome']",
      description:
        "Resource Explorer function outcome must move from preset activation to a concrete read-only list/detail state.",
      descriptionKo:
        "리소스 탐색기 기능 결과가 프리셋 활성화에서 실제 읽기 전용 목록/상세 상태로 이동해야 합니다."
    };
  }

  if (item.actionSurface === "topology-graph") {
    return {
      selector: "#ocp-topology-title",
      description:
        "Topology graph must render live resource nodes and evidence-backed edges.",
      descriptionKo:
        "토폴로지 그래프는 실시간 리소스 노드와 근거 기반 연결을 렌더링해야 합니다."
    };
  }

  if (item.actionSurface === "monitoring-console") {
    return {
      selector: item.targetSelector,
      description:
        "Monitoring console surface must expose the selected native Observe view with live source state.",
      descriptionKo:
        "모니터링 콘솔 화면은 선택한 원본 Observe 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "builds-console") {
    return {
      selector: item.targetSelector,
      description:
        "Builds console surface must expose the selected native Builds, BuildConfigs, or ImageStreams view with live source state.",
      descriptionKo:
        "빌드 콘솔 화면은 선택한 원본 Builds, BuildConfigs, ImageStreams 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "networking-console") {
    return {
      selector: item.targetSelector,
      description:
        "Networking console surface must expose the selected native Routes, Services, Ingresses, or NetworkPolicies view with live source state.",
      descriptionKo:
        "네트워킹 콘솔 화면은 선택한 원본 Routes, Services, Ingresses, NetworkPolicies 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "storage-console") {
    return {
      selector: item.targetSelector,
      description:
        "Storage console surface must expose the selected native PVC, PV, StorageClass, VolumeSnapshot, or VolumeSnapshotClass view with live source state.",
      descriptionKo:
        "스토리지 콘솔 화면은 선택한 원본 PVC, PV, StorageClass, VolumeSnapshot, VolumeSnapshotClass 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "administration-console") {
    return {
      selector: item.targetSelector,
      description:
        "Administration console surface must expose the selected native Cluster Settings, ClusterOperators, Namespaces, CRDs, ResourceQuotas, or LimitRanges view with live source state.",
      descriptionKo:
        "관리 콘솔 화면은 선택한 원본 Cluster Settings, ClusterOperators, Namespaces, CRD, ResourceQuota, LimitRange 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "compute-console") {
    return {
      selector: item.targetSelector,
      description:
        "Compute console surface must expose the selected native Nodes, Machines, MachineSets, or MachineConfigPools view with live source state.",
      descriptionKo:
        "컴퓨트 콘솔 화면은 선택한 원본 Nodes, Machines, MachineSets, MachineConfigPools 보기를 실시간 출처 상태와 함께 보여야 합니다."
    };
  }

  if (item.actionSurface === "user-management-console") {
    return {
      selector: item.targetSelector,
      description:
        "User Management console surface must expose the selected native Users, Groups, ServiceAccounts, Roles, or RoleBindings view with live source state and credential-safe RBAC context.",
      descriptionKo:
        "사용자 관리 콘솔 화면은 선택한 원본 User, Group, ServiceAccount, Role, RoleBinding 보기를 실시간 출처 상태와 자격증명 안전 RBAC 컨텍스트로 보여야 합니다."
    };
  }

  if (item.evidenceView) {
    return {
      selector: `[data-testid='evidence-view-${item.evidenceView}']`,
      description:
        "Evidence pane tab must become the active tab for this console function.",
      descriptionKo:
        "근거 패널 탭이 이 콘솔 기능의 활성 탭으로 전환되어야 합니다."
    };
  }

  if (item.actionSurface === "assistant") {
    return {
      selector: "[data-testid='assistant-popover']",
      description:
        "KOMSCO assistant popover must open with the selected console context.",
      descriptionKo:
        "KOMSCO 어시스턴트 팝오버가 선택한 콘솔 컨텍스트로 열려야 합니다."
    };
  }

  if (item.actionSurface === "overview") {
    return {
      selector: "[data-testid='ocp-overview-status']",
      description:
        "Overview status strip must show live or explicitly unavailable cluster evidence.",
      descriptionKo:
        "개요 상태 바가 실시간 또는 명시적 사용 불가 클러스터 근거를 보여야 합니다."
    };
  }

  if (item.id === "favorites") {
    return {
      selector: "[data-testid='console-parity-summary']",
      description:
        "Parity summary must prove the version-pinned native console inventory is visible.",
      descriptionKo:
        "Parity 요약이 버전 고정 원본 콘솔 인벤토리가 보인다는 것을 증명해야 합니다."
    };
  }

  if (item.id === "dashboards") {
    return {
      selector: "[data-testid='active-risk-list']",
      description:
        "Operations dashboard must expose the active incident queue, not only the page title.",
      descriptionKo:
        "운영 대시보드는 제목만이 아니라 활성 장애 대기열을 보여야 합니다."
    };
  }

  if (item.id === "metrics") {
    return {
      selector: "[data-testid='opslens-incident-metrics']",
      description:
        "Metrics surface must expose incident metric evidence with source state.",
      descriptionKo:
        "메트릭 화면은 출처 상태가 있는 장애 메트릭 근거를 보여야 합니다."
    };
  }

  return {
    selector: item.targetSelector,
    description:
      "Mapped OpsLens surface must expose the concrete target section for this console function.",
    descriptionKo:
      "매핑된 OpsLens 화면이 이 콘솔 기능의 구체 대상 섹션을 보여야 합니다."
  };
}
