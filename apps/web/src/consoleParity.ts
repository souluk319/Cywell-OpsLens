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
    command: "Open workload topology evidence with pods, deployments, services, and routes.",
    commandKo: "파드, Deployment, 서비스, 라우트 기반 워크로드 토폴로지 근거를 엽니다.",
    opsLensEnhancement: "Renders a live selector/owner/route graph instead of a flat resource table.",
    opsLensEnhancementKo: "평면 리소스 표 대신 실시간 selector/owner/route 그래프를 렌더링합니다.",
    acceptance: "Topology entry renders graph nodes and edges from read-only pods, deployments, services, routes, jobs, and cronjobs.",
    acceptanceKo: "토폴로지 항목은 읽기 전용 Pod, Deployment, Service, Route, Job, CronJob에서 그래프 노드와 연결을 렌더링해야 합니다.",
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
    id: "networking",
    section: "Networking",
    label: "Routes, Services, Ingresses",
    labelKo: "라우트, 서비스, 인그레스",
    originalPath: "Networking / Routes, Services, Ingresses",
    originalPathKo: "네트워킹 / 라우트, 서비스, 인그레스",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Preset routes, services, ingresses, endpoints, and endpoint slices.",
    commandKo: "라우트, 서비스, 인그레스, 엔드포인트, EndpointSlice 중심으로 설정합니다.",
    opsLensEnhancement: "Adds service-to-route diagnosis and port-forward handoff context.",
    opsLensEnhancementKo: "서비스-라우트 진단과 포트포워드 인계 컨텍스트를 추가합니다.",
    acceptance: "Networking view can inspect route, service, and endpoint evidence without changing traffic.",
    acceptanceKo: "네트워킹 화면은 트래픽 변경 없이 라우트, 서비스, 엔드포인트 근거를 확인해야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "routes services ingresses endpoints endpointslices",
      preferredResources: [
        "route.openshift.io/v1/routes",
        "v1/services",
        "networking.k8s.io/v1/ingresses",
        "v1/endpoints",
        "discovery.k8s.io/v1/endpointslices"
      ]
    }
  },
  {
    id: "network-policies",
    section: "Networking",
    label: "NetworkPolicies",
    labelKo: "네트워크 정책",
    originalPath: "Networking / NetworkPolicies",
    originalPathKo: "네트워킹 / 네트워크 정책",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Inspect NetworkPolicies, DNS, and ingress objects for reachability planning.",
    commandKo: "도달성 계획을 위해 NetworkPolicy, DNS, ingress 객체를 확인합니다.",
    opsLensEnhancement: "Classifies blocked API, route, and plugin traffic before proposing read-only checks.",
    opsLensEnhancementKo: "읽기 전용 점검을 제안하기 전에 API, route, plugin 트래픽 차단을 분류합니다.",
    acceptance: "Network policy surface remains plan-only and does not patch policy objects.",
    acceptanceKo: "네트워크 정책 화면은 계획 전용이며 정책 객체를 패치하지 않아야 합니다.",
    status: "read-only-plan",
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
    id: "storage",
    section: "Storage",
    label: "PVCs, PVs, StorageClasses",
    labelKo: "PVC, PV, StorageClass",
    originalPath: "Storage / PersistentVolumeClaims, PersistentVolumes, StorageClasses",
    originalPathKo: "스토리지 / PVC, PV, StorageClass",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Preset PVC, PV, StorageClass, and VolumeSnapshot resources.",
    commandKo: "PVC, PV, StorageClass, VolumeSnapshot 리소스 중심으로 설정합니다.",
    opsLensEnhancement: "Adds pending-bound-volume diagnosis and installation storage evidence.",
    opsLensEnhancementKo: "볼륨 Pending/Bound 진단과 설치 스토리지 근거를 추가합니다.",
    acceptance: "Storage view shows capacity, phase, class, and namespace evidence when readable.",
    acceptanceKo: "스토리지 화면은 읽기 가능할 때 용량, 상태, 클래스, 네임스페이스 근거를 보여야 합니다.",
    status: "covered",
    resourcePreset: {
      query: "persistentvolumeclaims persistentvolumes storageclasses volumesnapshots",
      preferredResources: [
        "v1/persistentvolumeclaims",
        "v1/persistentvolumes",
        "storage.k8s.io/v1/storageclasses",
        "snapshot.storage.k8s.io/v1/volumesnapshots"
      ]
    }
  },
  {
    id: "builds",
    section: "Builds",
    label: "Builds and ImageStreams",
    labelKo: "빌드와 이미지 스트림",
    originalPath: "Builds / Builds, BuildConfigs, ImageStreams",
    originalPathKo: "빌드 / Build, BuildConfig, ImageStream",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Preset BuildConfigs, Builds, ImageStreams, and ImageStreamTags.",
    commandKo: "BuildConfig, Build, ImageStream, ImageStreamTag 중심으로 설정합니다.",
    opsLensEnhancement: "Adds image provenance, CRC registry, and architecture mismatch evidence.",
    opsLensEnhancementKo: "이미지 출처, CRC 레지스트리, 아키텍처 불일치 근거를 추가합니다.",
    acceptance: "Builds view can prove image tag and digest state without pushing images.",
    acceptanceKo: "빌드 화면은 이미지 push 없이 태그와 digest 상태를 증명할 수 있어야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "builds buildconfigs imagestreams imagestreamtags",
      preferredResources: [
        "build.openshift.io/v1/builds",
        "build.openshift.io/v1/buildconfigs",
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
    targetSelector: "[data-testid='alert-table-wrap']",
    actionSurface: "evidence",
    command: "Inspect firing alerts and keep the assistant grounded in alert, log, event, and YAML evidence.",
    commandKo: "발생 중인 경고를 보고 어시스턴트 답변을 경고, 로그, 이벤트, YAML 근거에 고정합니다.",
    opsLensEnhancement: "Adds evidence-scored incident triage and KOMSCO answer citations.",
    opsLensEnhancementKo: "근거 점수 기반 장애 분석과 KOMSCO 답변 출처를 추가합니다.",
    acceptance: "Alerting opens the evidence pane and asks only read-only/plan-only questions.",
    acceptanceKo: "경고 화면은 근거 패널을 열고 읽기 전용/계획 전용 질문만 수행해야 합니다.",
    status: "ops-enhanced",
    evidenceView: "alerts"
  },
  {
    id: "dashboards",
    section: "Monitoring",
    label: "Dashboards",
    labelKo: "대시보드",
    originalPath: "Monitoring / Dashboards",
    originalPathKo: "모니터링 / 대시보드",
    targetSelector: "#dashboard-title",
    actionSurface: "ops-dashboard",
    command: "Open incident dashboard panels and evidence-backed operations cards.",
    commandKo: "장애 대시보드 패널과 근거 기반 운영 카드를 엽니다.",
    opsLensEnhancement: "Pairs dashboard state with runbook citations and missing-evidence markers.",
    opsLensEnhancementKo: "대시보드 상태를 런북 출처와 누락 근거 표시와 묶습니다.",
    acceptance: "Dashboard surfaces render source state and never fake live Prometheus success.",
    acceptanceKo: "대시보드 화면은 출처 상태를 표시하고 실시간 Prometheus 성공을 위장하지 않아야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "metrics",
    section: "Monitoring",
    label: "Metrics",
    labelKo: "메트릭",
    originalPath: "Monitoring / Metrics",
    originalPathKo: "모니터링 / 메트릭",
    targetSelector: "[data-testid='opslens-incident-metrics']",
    actionSurface: "ops-dashboard",
    command: "Open metric-query evidence and incident scoring.",
    commandKo: "메트릭 질의 근거와 장애 점수를 엽니다.",
    opsLensEnhancement: "Pairs metric state with runbook citations and missing-evidence markers.",
    opsLensEnhancementKo: "메트릭 상태를 런북 출처와 누락 근거 표시와 묶습니다.",
    acceptance: "Metric surfaces render query status and never fake live Prometheus success.",
    acceptanceKo: "메트릭 화면은 질의 상태를 표시하고 실시간 Prometheus 성공을 위장하지 않아야 합니다.",
    status: "ops-enhanced"
  },
  {
    id: "logs",
    section: "Monitoring",
    label: "Logs",
    labelKo: "로그",
    originalPath: "Monitoring / Logs",
    originalPathKo: "모니터링 / 로그",
    targetSelector: "[data-testid='log-viewport']",
    actionSurface: "evidence",
    command: "Switch the evidence pane to pod logs before asking for a plan.",
    commandKo: "계획 요청 전에 근거 패널을 Pod 로그로 전환합니다.",
    opsLensEnhancement: "Logs become citeable assistant evidence rather than disposable text.",
    opsLensEnhancementKo: "로그를 일회성 텍스트가 아니라 어시스턴트가 인용 가능한 근거로 만듭니다.",
    acceptance: "Log view supports Shift+Enter notes and Enter-to-ask without blocking the workspace.",
    acceptanceKo: "로그 화면은 작업 영역을 막지 않고 Shift+Enter 메모와 Enter 질문을 지원해야 합니다.",
    status: "covered",
    evidenceView: "logs"
  },
  {
    id: "compute",
    section: "Compute",
    label: "Nodes and Machines",
    labelKo: "노드와 머신",
    originalPath: "Compute / Nodes, Machines, MachineSets, MachineConfigPools",
    originalPathKo: "컴퓨트 / 노드, Machine, MachineSet, MachineConfigPool",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Preset nodes, machines, machine sets, and machine config pools.",
    commandKo: "노드, Machine, MachineSet, MachineConfigPool 중심으로 설정합니다.",
    opsLensEnhancement: "Adds CRC capacity pressure and install/runtime fit evidence.",
    opsLensEnhancementKo: "CRC 용량 압박과 설치/런타임 적합성 근거를 추가합니다.",
    acceptance: "Compute view can explain node architecture, readiness, and capacity without modifying machines.",
    acceptanceKo: "컴퓨트 화면은 Machine 변경 없이 노드 아키텍처, 준비 상태, 용량을 설명해야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "nodes machines machinesets machineconfigpools",
      preferredResources: [
        "v1/nodes",
        "machine.openshift.io/v1beta1/machines",
        "machine.openshift.io/v1beta1/machinesets",
        "machineconfiguration.openshift.io/v1/machineconfigpools"
      ]
    }
  },
  {
    id: "user-management",
    section: "User Management",
    label: "Users, Groups, Roles",
    labelKo: "사용자, 그룹, 역할",
    originalPath: "User Management / Users, Groups, ServiceAccounts, Roles, RoleBindings",
    originalPathKo: "사용자 관리 / 사용자, 그룹, 서비스 계정, 역할, 역할 바인딩",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Inspect users, groups, service accounts, roles, cluster roles, and bindings.",
    commandKo: "사용자, 그룹, 서비스 계정, Role, ClusterRole, Binding을 조회합니다.",
    opsLensEnhancement: "Adds SelfSubjectAccessReview/RBAC coverage and blocks credential exposure.",
    opsLensEnhancementKo: "SelfSubjectAccessReview/RBAC 커버리지를 추가하고 자격증명 노출을 차단합니다.",
    acceptance: "RBAC views must never display token or Secret payloads.",
    acceptanceKo: "RBAC 화면은 토큰이나 Secret 페이로드를 표시하지 않아야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "users groups serviceaccounts roles rolebindings clusterroles clusterrolebindings",
      preferredResources: [
        "user.openshift.io/v1/users",
        "user.openshift.io/v1/groups",
        "v1/serviceaccounts",
        "rbac.authorization.k8s.io/v1/roles",
        "rbac.authorization.k8s.io/v1/rolebindings",
        "rbac.authorization.k8s.io/v1/clusterroles",
        "rbac.authorization.k8s.io/v1/clusterrolebindings"
      ]
    }
  },
  {
    id: "administration",
    section: "Administration",
    label: "Cluster Settings",
    labelKo: "클러스터 설정",
    originalPath: "Administration / Cluster Settings",
    originalPathKo: "관리 / 클러스터 설정",
    targetSelector: "[data-testid='opslens-ocp-connectivity']",
    actionSurface: "ops-admin",
    command: "Review cluster settings, OCP version, console customization, and approval-gated changes.",
    commandKo: "클러스터 설정, OCP 버전, 콘솔 사용자화, 승인 필요 변경을 검토합니다.",
    opsLensEnhancement: "Separates read-only diagnostics from mutation plans and labels approval boundaries.",
    opsLensEnhancementKo: "읽기 전용 진단과 변경 계획을 분리하고 승인 경계를 표시합니다.",
    acceptance: "Cluster setting actions must surface patch previews before any apply path.",
    acceptanceKo: "클러스터 설정 작업은 apply 경로 전에 patch preview를 보여야 합니다.",
    status: "read-only-plan",
    resourcePreset: {
      query: "clusterversions clusteroperators consoles consoleplugins",
      preferredResources: [
        "config.openshift.io/v1/clusterversions",
        "config.openshift.io/v1/clusteroperators",
        "operator.openshift.io/v1/consoles",
        "console.openshift.io/v1/consoleplugins"
      ]
    }
  },
  {
    id: "namespaces-crds",
    section: "Administration",
    label: "Namespaces and CRDs",
    labelKo: "네임스페이스와 CRD",
    originalPath: "Administration / Namespaces, CustomResourceDefinitions, ResourceQuotas, LimitRanges",
    originalPathKo: "관리 / 네임스페이스, CRD, ResourceQuota, LimitRange",
    targetSelector: "#ocp-explorer-title",
    actionSurface: "resource-explorer",
    command: "Preset namespaces, CRDs, resource quotas, limit ranges, and API services.",
    commandKo: "네임스페이스, CRD, ResourceQuota, LimitRange, APIService 중심으로 설정합니다.",
    opsLensEnhancement: "Adds API coverage diagnostics and conversion webhook failure classification.",
    opsLensEnhancementKo: "API 커버리지 진단과 conversion webhook 실패 분류를 추가합니다.",
    acceptance: "Administration inventory shows CRD/APIService health and fallback API versions when needed.",
    acceptanceKo: "관리 인벤토리는 필요 시 CRD/APIService 상태와 대체 API 버전을 보여야 합니다.",
    status: "ops-enhanced",
    resourcePreset: {
      query: "namespaces customresourcedefinitions apiservices resourcequotas limitranges",
      preferredResources: [
        "v1/namespaces",
        "apiextensions.k8s.io/v1/customresourcedefinitions",
        "apiregistration.k8s.io/v1/apiservices",
        "v1/resourcequotas",
        "v1/limitranges"
      ]
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
      selector: "[data-testid='ocp-smoke-function-outcome']",
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
