import { useEffect, useMemo, useState } from "react";
import type {
  ActionPlanResponse,
  ContextSyncResponse,
  DashboardRisksResponse,
  OpsLensAdminOverviewResponse
} from "@kugnus/contracts";
import {
  assistantAnswer,
  contextChips,
  mockContext,
  mockDashboardResponse
} from "@kugnus/contracts";
import komscoLogo from "./assets/brand/komsco_logo.png";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  CircleHelp,
  CirclePlus,
  DatabaseZap,
  Gauge,
  Grid3X3,
  HardDrive,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ServerCog,
  ShieldCheck,
  TableProperties,
  Waypoints
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AssistantPopover } from "./components/AssistantPopover";
import { ConsoleEvidencePane } from "./components/ConsoleEvidencePane";
import { OcpConsoleOverview } from "./components/OcpConsoleOverview";
import { OcpCoverageMatrix } from "./components/OcpCoverageMatrix";
import {
  OcpResourceExplorer,
  type OcpResourcePreset
} from "./components/OcpResourceExplorer";
import { OpsLensAdminDashboard } from "./components/OpsLensAdminDashboard";
import { OperationsDashboard } from "./components/OperationsDashboard";
import {
  createActionPlan,
  fetchDashboardRisks,
  fetchOpsLensAdminOverview,
  getApiRouteDiagnostics,
  syncConsoleContext
} from "./lib/api";
import type { UiLanguage } from "./i18n";
import opsLensIcon from "./assets/brand/cywell_ops_lens_icon.png";

function statusClass(status: string | undefined) {
  if (status === "ready" || status === "pass" || status === "live-ready") {
    return "fresh";
  }
  if (
    status === "needs-evidence" ||
    status === "needs-tooling" ||
    status === "approval-required"
  ) {
    return "stale";
  }
  return "missing";
}

function nextGateLabel(overview: OpsLensAdminOverviewResponse | null) {
  const gate = overview?.installReadiness.completionGate.remainingTo100[0];
  if (!gate) return "none";
  return `${gate.gateId}:${gate.owner}`;
}

function firstNextCommand(overview: OpsLensAdminOverviewResponse | null) {
  return (
    overview?.installReadiness.completionGate.remainingTo100[0]?.nextCommand ??
    "none"
  );
}

type EvidenceView = "alerts" | "logs" | "yaml";
type ConsoleNavId =
  | "overview"
  | "alerting"
  | "dashboards"
  | "metrics"
  | "logs"
  | "workloads"
  | "networking"
  | "storage"
  | "administration"
  | "opsbrain"
  | "opslens-admin";

interface ConsoleNavigationItem {
  id: ConsoleNavId;
  section: "Home" | "Observe" | "Resources" | "Cywell";
  label: string;
  labelKo: string;
  icon: LucideIcon;
  targetSelector: string;
  breadcrumb: string[];
  breadcrumbKo: string[];
  command: string;
  commandKo: string;
  evidenceView?: EvidenceView;
  resourcePreset?: Omit<OcpResourcePreset, "activationId">;
}

const consoleNavigation: ConsoleNavigationItem[] = [
  {
    id: "overview",
    section: "Home",
    label: "Overview",
    labelKo: "개요",
    icon: ServerCog,
    targetSelector: "#ocp-console-overview-title",
    breadcrumb: ["Home", "Overview"],
    breadcrumbKo: ["홈", "개요"],
    command: "Open live cluster summary with evidence-backed availability signals.",
    commandKo: "근거 기반 가용성 신호로 현재 클러스터 요약을 엽니다."
  },
  {
    id: "alerting",
    section: "Observe",
    label: "Alerting",
    labelKo: "경고",
    icon: AlertTriangle,
    targetSelector: "#evidence-title",
    breadcrumb: ["Observe", "Alerting"],
    breadcrumbKo: ["관측", "경고"],
    command: "Inspect firing alerts and keep the assistant off the evidence table.",
    commandKo: "발생 중인 alert를 확인하고 Assistant가 근거 표를 가리지 않게 합니다.",
    evidenceView: "alerts"
  },
  {
    id: "dashboards",
    section: "Observe",
    label: "Dashboards",
    labelKo: "대시보드",
    icon: TableProperties,
    targetSelector: "#dashboard-title",
    breadcrumb: ["Observe", "Dashboards"],
    breadcrumbKo: ["관측", "대시보드"],
    command: "Return to the OpsLens operations dashboard and triage queue.",
    commandKo: "OpsLens 운영 대시보드와 triage queue로 이동합니다."
  },
  {
    id: "metrics",
    section: "Observe",
    label: "Metrics",
    labelKo: "메트릭",
    icon: Activity,
    targetSelector: "[data-testid='opslens-incident-metrics']",
    breadcrumb: ["Observe", "Metrics"],
    breadcrumbKo: ["관측", "메트릭"],
    command: "Jump to metric queries, incident scoring, and read-only pipeline evidence.",
    commandKo: "메트릭 질의, 장애 점수, 읽기 전용 처리 근거로 이동합니다."
  },
  {
    id: "logs",
    section: "Observe",
    label: "Logs",
    labelKo: "로그",
    icon: ScrollText,
    targetSelector: "#evidence-title",
    breadcrumb: ["Observe", "Logs"],
    breadcrumbKo: ["관측", "로그"],
    command: "Switch the evidence pane to pod logs before asking for a plan.",
    commandKo: "계획 요청 전에 근거 패널을 pod log로 전환합니다.",
    evidenceView: "logs"
  },
  {
    id: "workloads",
    section: "Resources",
    label: "Workloads",
    labelKo: "워크로드",
    icon: Boxes,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Workloads"],
    breadcrumbKo: ["리소스", "워크로드"],
    command: "Preset the read-only explorer to pods and deployments.",
    commandKo: "읽기 전용 탐색기를 파드와 배포 중심으로 설정합니다.",
    resourcePreset: {
      query: "deployments pods replicasets",
      preferredResources: ["apps/v1/deployments", "v1/pods", "apps/v1/replicasets"]
    }
  },
  {
    id: "networking",
    section: "Resources",
    label: "Networking",
    labelKo: "네트워킹",
    icon: Network,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Networking"],
    breadcrumbKo: ["리소스", "네트워킹"],
    command: "Preset the read-only explorer to routes, services, and ingresses.",
    commandKo: "읽기 전용 탐색기를 라우트, 서비스, 인그레스 중심으로 설정합니다.",
    resourcePreset: {
      query: "routes services ingresses",
      preferredResources: [
        "route.openshift.io/v1/routes",
        "v1/services",
        "networking.k8s.io/v1/ingresses"
      ]
    }
  },
  {
    id: "storage",
    section: "Resources",
    label: "Storage",
    labelKo: "스토리지",
    icon: HardDrive,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Storage"],
    breadcrumbKo: ["리소스", "스토리지"],
    command: "Preset the read-only explorer to PVC, PV, and StorageClass resources.",
    commandKo: "읽기 전용 탐색기를 PVC, PV, 스토리지 클래스 중심으로 설정합니다.",
    resourcePreset: {
      query: "persistentvolumeclaims persistentvolumes storageclasses",
      preferredResources: [
        "v1/persistentvolumeclaims",
        "v1/persistentvolumes",
        "storage.k8s.io/v1/storageclasses"
      ]
    }
  },
  {
    id: "administration",
    section: "Resources",
    label: "Administration",
    labelKo: "관리",
    icon: ShieldCheck,
    targetSelector: "#opslens-admin-title",
    breadcrumb: ["Resources", "Administration"],
    breadcrumbKo: ["리소스", "관리"],
    command: "Review RBAC, install readiness, release evidence, and approval gates.",
    commandKo: "RBAC, 설치 준비도, 배포 근거, 승인 게이트를 검토합니다."
  },
  {
    id: "opslens-admin",
    section: "Cywell",
    label: "OpsLens Admin",
    labelKo: "OpsLens 관리",
    icon: DatabaseZap,
    targetSelector: "#opslens-admin-title",
    breadcrumb: ["Cywell", "OpsLens Admin"],
    breadcrumbKo: ["Cywell", "OpsLens 관리"],
    command: "Operate the OpsLens RAG, evaluation, runtime, and 100% closure dashboard.",
    commandKo: "OpsLens RAG, 평가, 실행 환경, 100% 완료 대시보드를 운영합니다."
  },
  {
    id: "opsbrain",
    section: "Cywell",
    label: "OpsBrain",
    labelKo: "OpsBrain",
    icon: Bot,
    targetSelector: "[data-testid='opslens-opsbrain-system']",
    breadcrumb: ["Cywell", "OpsBrain"],
    breadcrumbKo: ["Cywell", "OpsBrain"],
    command: "Open the no-fine-tuning growth loop: memory, evaluator, risk gate, and required keys.",
    commandKo: "파인튜닝 없는 성장 루프, memory, evaluator, risk gate, 필수 key를 엽니다."
  }
];

const navigationSections = ["Home", "Observe", "Resources", "Cywell"] as const;

const sectionLabelsKo: Record<(typeof navigationSections)[number], string> = {
  Home: "홈",
  Observe: "관측",
  Resources: "리소스",
  Cywell: "Cywell"
};

const shellCopy = {
  en: {
    activeSurface: "Active surface",
    api: "API",
    appLauncher: "Application launcher",
    appLauncherCommand:
      "Application launcher focused the OpsLens readiness command strip.",
    create: "Create",
    createCommand:
      "Create opened a plan-only workflow. OpsLens will not apply cluster mutations.",
    help: "Help",
    helpCommand: "Help opened the KOMSCO AI Assistant in read-only mode.",
    notifications: "Notifications",
    notificationsCommand:
      "Notifications focused the active incident queue and firing alerts.",
    openNavigation: "Open navigation",
    collapseNavigation: "Collapse navigation",
    readOnly: "read-only",
    readiness: "100% Readiness",
    closure: "Closure",
    administratorNavigation: "Administrator navigation",
    administrator: "Administrator",
    breadcrumb: "Breadcrumb",
    language: "Language",
    loading: "loading",
    remaining: "remaining",
    next: "next",
    command: "cmd",
    closeAssistant: "Close Cywell OpsLens assistant",
    openAssistant: "Open Cywell OpsLens assistant",
    assistantTitle: "Cywell OpsLens assistant",
    consolePluginMode: "Console plugin",
    standaloneDevMode: "Standalone dev",
    pluginApi: "plugin API proxy",
    localApi: "local API path",
    consolePluginModeTitle:
      "OpenShift Console is hosting OpsLens through the plugin iframe and plugin API proxy.",
    standaloneDevModeTitle:
      "Local dev shell; OpenShift console chrome and Lightspeed drawer are not injected here.",
    consolePluginScope: "Route + proxy mode",
    standaloneScope: "Preview shell",
    consolePluginScopeTitle:
      "Installed ConsolePlugin scope: OpsLens route, launcher entry, UserToken API proxy, and MCP readiness surfaces. Native OpenShift chrome and Lightspeed drawer remain OpenShift-owned.",
    standaloneScopeTitle:
      "Standalone preview scope: local shell and local API path. Install as ConsolePlugin to verify in-console routing and proxy behavior.",
    consoleContextPrimary: "OpenShift ConsolePlugin",
    consoleContextSecondary: "UserToken proxy / active console context",
    standaloneContextPrimary: "CRC lab preview",
    standaloneContextSecondary: "local fixture scenario / no company OCP mutation",
    opsLensStatus: "Cywell OpsLens status",
    openShiftUtilities: "OpenShift console utilities"
  },
  ko: {
    activeSurface: "현재 화면",
    api: "API",
    appLauncher: "애플리케이션 런처",
    appLauncherCommand:
      "애플리케이션 런처가 OpsLens 준비도 명령 영역으로 이동했습니다.",
    create: "생성",
    createCommand:
      "생성 메뉴는 계획 수립 흐름만 엽니다. OpsLens는 클러스터 변경을 실행하지 않습니다.",
    help: "도움말",
    helpCommand: "도움말이 KOMSCO AI Assistant를 읽기 전용으로 열었습니다.",
    notifications: "알림",
    notificationsCommand:
      "알림이 진행 중인 장애 대기열과 발생 중인 경고 위치로 이동했습니다.",
    openNavigation: "탐색 열기",
    collapseNavigation: "탐색 접기",
    readOnly: "읽기 전용",
    readiness: "100% 준비도",
    closure: "완료 조건",
    administratorNavigation: "관리자 탐색",
    administrator: "관리자",
    breadcrumb: "이동 경로",
    language: "언어",
    loading: "불러오는 중",
    remaining: "남음",
    next: "다음",
    command: "명령",
    closeAssistant: "Cywell OpsLens 어시스턴트 닫기",
    openAssistant: "Cywell OpsLens 어시스턴트 열기",
    assistantTitle: "Cywell OpsLens 어시스턴트",
    consolePluginMode: "콘솔 플러그인",
    standaloneDevMode: "독립 미리보기",
    pluginApi: "플러그인 API 프록시",
    localApi: "로컬 API 경로",
    consolePluginModeTitle:
      "OpenShift 콘솔이 플러그인 iframe과 플러그인 API 프록시로 OpsLens를 호스팅 중입니다.",
    standaloneDevModeTitle:
      "로컬 미리보기 화면입니다. OpenShift 콘솔 상단 메뉴와 Lightspeed 서랍은 이 화면에 주입되지 않습니다.",
    consolePluginScope: "라우트 + 프록시 모드",
    standaloneScope: "미리보기 화면",
    consolePluginScopeTitle:
      "설치된 콘솔 플러그인 적용 범위: OpsLens 라우트, 런처 항목, 사용자 토큰 API 프록시, MCP 준비도 화면입니다. 기본 OpenShift 상단 메뉴와 Lightspeed 서랍은 OpenShift 소유로 유지됩니다.",
    standaloneScopeTitle:
      "독립 미리보기 범위: 로컬 화면과 로컬 API 경로입니다. 콘솔 내부 라우팅과 프록시는 콘솔 플러그인 설치 후 검증합니다.",
    consoleContextPrimary: "OpenShift 콘솔 플러그인",
    consoleContextSecondary: "사용자 토큰 프록시 / 활성 콘솔 컨텍스트",
    standaloneContextPrimary: "CRC 실습 환경 미리보기",
    standaloneContextSecondary: "로컬 검증 시나리오 / 회사 OCP 변경 없음",
    opsLensStatus: "Cywell OpsLens 상태",
    openShiftUtilities: "OpenShift 콘솔 유틸리티"
  }
} as const;

interface RuntimeProfile {
  surface: "console-plugin" | "standalone-dev";
  apiBaseAttached: boolean;
}

function findNavigationItem(id: ConsoleNavId) {
  return (
    consoleNavigation.find((item) => item.id === id) ?? consoleNavigation[1]
  );
}

function initialLanguage(): UiLanguage {
  try {
    const stored = window.localStorage.getItem("cywell-opslens-language");
    if (stored === "ko" || stored === "en") {
      return stored;
    }
  } catch {
    // Ignore storage failures; language can still be toggled for this session.
  }
  return window.navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function navLabel(item: ConsoleNavigationItem, language: UiLanguage) {
  return language === "ko" ? item.labelKo : item.label;
}

function navBreadcrumb(item: ConsoleNavigationItem, language: UiLanguage) {
  return language === "ko" ? item.breadcrumbKo : item.breadcrumb;
}

function navCommand(item: ConsoleNavigationItem, language: UiLanguage) {
  return language === "ko" ? item.commandKo : item.command;
}

function readRuntimeProfile(): RuntimeProfile {
  if (typeof window === "undefined") {
    return {
      surface: "standalone-dev",
      apiBaseAttached: false
    };
  }

  const params = new URL(window.location.href).searchParams;
  const surface = params.get("surface");
  const apiBase = params.get("apiBase") ?? "";
  const pluginProxyAttached =
    surface === "console-plugin" &&
    apiBase.includes("/api/proxy/plugin/cywell-opslens/");

  return {
    surface: pluginProxyAttached ? "console-plugin" : "standalone-dev",
    apiBaseAttached: Boolean(apiBase)
  };
}

export default function App() {
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draft, setDraft] = useState(
    "ClusterNotUpgradeable alert를 근거 중심으로 triage 해줘."
  );
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("alerts");
  const [activeNavId, setActiveNavId] = useState<ConsoleNavId>("alerting");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navigationCommand, setNavigationCommand] = useState(
    navCommand(findNavigationItem("alerting"), initialLanguage())
  );
  const [resourcePreset, setResourcePreset] =
    useState<OcpResourcePreset | null>(null);
  const [dashboard, setDashboard] =
    useState<DashboardRisksResponse>(mockDashboardResponse);
  const [contextSync, setContextSync] = useState<ContextSyncResponse | null>(
    null
  );
  const [planResponse, setPlanResponse] = useState<ActionPlanResponse | null>(
    null
  );
  const [adminOverview, setAdminOverview] =
    useState<OpsLensAdminOverviewResponse | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<"loading" | "ready" | "fallback">(
    "loading"
  );
  const [lastApiError, setLastApiError] = useState<string | null>(null);

  async function bootstrapApiState(isActive = () => true) {
    try {
      setApiStatus("loading");
      const [contextResponse, plan] = await Promise.all([
        syncConsoleContext({ context: mockContext }),
        createActionPlan({
          prompt: draft,
          context: mockContext,
          scenario: "ClusterNotUpgradeable"
        })
      ]);

      if (!isActive()) {
        return;
      }

      setContextSync(contextResponse);
      setPlanResponse(plan);
      setApiStatus("ready");
      setLastApiError(null);

      fetchDashboardRisks()
        .then((dashboardResponse) => {
          if (isActive()) {
            setDashboard(dashboardResponse);
          }
        })
        .catch(() => {
          if (isActive()) {
            setDashboard(mockDashboardResponse);
          }
        });

      fetchOpsLensAdminOverview()
        .then((overviewResponse) => {
          if (isActive()) {
            setAdminOverview(overviewResponse);
          }
        })
        .catch(() => {
          if (isActive()) {
            setAdminOverview(null);
          }
        });
    } catch (error) {
      if (!isActive()) {
        return;
      }
      setDashboard(mockDashboardResponse);
      setContextSync({
        accepted: false,
        requestId: "ctx-fallback",
        receivedAt: new Date().toISOString(),
        contextHash: "local-fixture",
        context: mockContext,
        contextChips,
        redactionCount: 0,
        rbac: {
          role: mockContext.rbac.role,
          namespaceScope: mockContext.namespace,
          deniedNamespaces: mockContext.rbac.deniedNamespaces
        }
      });
      setPlanResponse({
        requestId: "plan-fallback",
        answer: assistantAnswer,
        audit: {
          requestId: "plan-fallback",
          user: mockContext.user,
          groups: [mockContext.rbac.role],
          clusterId: mockContext.clusterId,
          namespaceScope: mockContext.namespace,
          contextHash: "local-fixture",
          sources: assistantAnswer.inspectedEvidence.map(
            (source) => source.id
          ),
          model: "local-fixture",
          tokenUsage: {
            input: 0,
            output: 0
          },
          latencyMs: 0,
          redactionCount: 0,
          actionMode: assistantAnswer.actionMode
        }
      });
      setApiStatus("fallback");
      setLastApiError(
        error instanceof Error ? error.message : "API request failed"
      );
    }
  }

  useEffect(() => {
    let active = true;
    void bootstrapApiState(() => active);

    return () => {
      active = false;
    };
  }, []);

  const contextPayload = useMemo(
    () => JSON.stringify(contextSync?.context ?? mockContext, null, 2),
    [contextSync]
  );
  const evidenceCount = (contextSync?.context ?? mockContext).attachedEvidence.length;
  const completionGate = adminOverview?.installReadiness.completionGate;
  const activeNavigation = findNavigationItem(activeNavId);
  const copy = shellCopy[language];
  const runtimeProfile = useMemo(() => readRuntimeProfile(), []);
  const apiRoute = useMemo(() => getApiRouteDiagnostics(), []);
  const isConsolePlugin = runtimeProfile.surface === "console-plugin";

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem("cywell-opslens-language", language);
    } catch {
      // Ignore storage failures; the current session still reflects the selection.
    }
    setNavigationCommand(navCommand(findNavigationItem(activeNavId), language));
  }, [activeNavId, language]);

  async function askAssistant() {
    const prompt = draft.trim();
    if (!prompt) {
      return;
    }
    setAssistantBusy(true);
    try {
      const plan = await createActionPlan({
        prompt,
        context: contextSync?.context ?? mockContext,
        scenario: "ClusterNotUpgradeable"
      });
      setPlanResponse(plan);
      setApiStatus("ready");
      setLastApiError(null);
    } catch (error) {
      setApiStatus("fallback");
      setLastApiError(
        error instanceof Error
          ? error.message
          : "Action plan API failed; local fixture answer is shown."
      );
      setPlanResponse({
        requestId: "plan-fallback",
        answer: assistantAnswer,
        audit: {
          requestId: "plan-fallback",
          user: mockContext.user,
          groups: [mockContext.rbac.role],
          clusterId: mockContext.clusterId,
          namespaceScope: mockContext.namespace,
          contextHash: "local-fixture",
          sources: assistantAnswer.inspectedEvidence.map(
            (source) => source.id
          ),
          model: "local-fixture",
          tokenUsage: { input: 0, output: 0 },
          latencyMs: 0,
          redactionCount: 0,
          actionMode: assistantAnswer.actionMode
        }
      });
    } finally {
      setAssistantBusy(false);
    }
  }

  function scrollToNavigationTarget(targetSelector: string) {
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      const stage = document.querySelector<HTMLElement>(
        "[data-testid='main-stage']"
      );

      if (!target) {
        return;
      }

      if (stage?.contains(target)) {
        const stageRect = stage.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = stage.scrollTop + targetRect.top - stageRect.top - 12;
        stage.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
        return;
      }

      target.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }

  function activateNavigation(item: ConsoleNavigationItem) {
    setActiveNavId(item.id);
    setNavigationCommand(navCommand(item, language));
    if (item.evidenceView) {
      setEvidenceView(item.evidenceView);
    }
    if (item.resourcePreset) {
      setResourcePreset({
        ...item.resourcePreset,
        activationId: `${item.id}-${Date.now()}`
      });
    }
    scrollToNavigationTarget(item.targetSelector);
  }

  function runUtilityAction(
    label: string,
    targetSelector: string,
    openAssistant = false
  ) {
    setNavigationCommand(label);
    if (openAssistant) {
      setAssistantOpen(true);
    }
    scrollToNavigationTarget(targetSelector);
  }

  function openAssistantFromEvidence() {
    setAssistantOpen(true);
    void askAssistant();
  }

  return (
    <div
      className={`app-shell ${assistantOpen ? "assistant-popover-open" : ""}`}
    >
      <header className="masthead" data-testid="masthead">
        <div className="masthead-left">
          <button
            className="icon-button masthead-menu"
            type="button"
            data-testid="nav-collapse-toggle"
            aria-label={navCollapsed ? copy.openNavigation : copy.collapseNavigation}
            aria-pressed={!navCollapsed}
            onClick={() => setNavCollapsed((collapsed) => !collapsed)}
          >
            {navCollapsed ? (
              <PanelLeftOpen size={20} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={20} aria-hidden="true" />
            )}
          </button>
          <div className="brand-block">
            <span className="brand-mark" aria-hidden="true">
              <img src={komscoLogo} alt="" />
            </span>
            <div>
              <p className="eyebrow">Red Hat OpenShift · KOMSCO Edition</p>
              <h1>Cywell OpsLens</h1>
            </div>
          </div>
          <div className="cluster-context" data-testid="console-perspective">
            <strong data-testid="console-context-primary">
              {isConsolePlugin
                ? copy.consoleContextPrimary
                : copy.standaloneContextPrimary}
            </strong>
            <span data-testid="console-context-secondary">
              {isConsolePlugin
                ? copy.consoleContextSecondary
                : copy.standaloneContextSecondary}
            </span>
          </div>
        </div>
        <div className="masthead-actions" aria-label={copy.openShiftUtilities}>
          <div className="opslens-status-group" aria-label={copy.opsLensStatus}>
            <span
              className={`status-pill ${apiStatus === "ready" ? "ready" : "danger"}`}
              data-testid="api-status"
            >
              {copy.api} {apiStatus}
            </span>
            <span
              className={`status-pill ${isConsolePlugin ? "ready" : "warning"}`}
              data-testid="runtime-surface"
              title={
                isConsolePlugin
                  ? copy.consolePluginModeTitle
                  : copy.standaloneDevModeTitle
              }
            >
              {isConsolePlugin ? copy.consolePluginMode : copy.standaloneDevMode}
            </span>
            <span className="status-pill read-only" data-testid="api-route-mode">
              {runtimeProfile.apiBaseAttached ? copy.pluginApi : copy.localApi}
            </span>
            <span
              className="status-pill read-only"
              data-testid="console-plugin-scope"
              title={
                isConsolePlugin
                  ? copy.consolePluginScopeTitle
                  : copy.standaloneScopeTitle
              }
            >
              {isConsolePlugin ? copy.consolePluginScope : copy.standaloneScope}
            </span>
            <span className="status-pill read-only">
              <ShieldCheck size={15} aria-hidden="true" />
              {copy.readOnly}
            </span>
            <div
              className="segmented-control language-toggle"
              aria-label={copy.language}
            >
              <button
                aria-pressed={language === "ko"}
                data-testid="language-ko-toggle"
                type="button"
                onClick={() => setLanguage("ko")}
              >
                KO
              </button>
              <button
                aria-pressed={language === "en"}
                data-testid="language-en-toggle"
                type="button"
                onClick={() => setLanguage("en")}
              >
                EN
              </button>
            </div>
          </div>
          <div
            className="console-native-actions"
            aria-label={copy.openShiftUtilities}
          >
            <button
              className="icon-button"
              type="button"
              data-testid="masthead-app-launcher"
              title={copy.appLauncher}
              aria-label={copy.appLauncher}
              onClick={() =>
                runUtilityAction(
                  copy.appLauncherCommand,
                  "[data-testid='opslens-readiness-command-strip']"
                )
              }
            >
              <Grid3X3 size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button notification-button"
              type="button"
              data-testid="masthead-notifications"
              title={copy.notifications}
              aria-label={copy.notifications}
              onClick={() =>
                runUtilityAction(
                  copy.notificationsCommand,
                  "#dashboard-title"
                )
              }
            >
              <Bell size={18} aria-hidden="true" />
              <span className="notification-count">5</span>
            </button>
            <button
              className="icon-button"
              type="button"
              data-testid="masthead-create"
              title={copy.create}
              aria-label={copy.create}
              onClick={() =>
                runUtilityAction(
                  copy.createCommand,
                  "#opslens-admin-title",
                  true
                )
              }
            >
              <CirclePlus size={18} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              data-testid="masthead-help"
              title={copy.help}
              aria-label={copy.help}
              onClick={() =>
                runUtilityAction(
                  copy.helpCommand,
                  "#evidence-title",
                  true
                )
              }
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
            <span className="user-menu">admin</span>
          </div>
        </div>
      </header>

      <div className={`console-frame ${navCollapsed ? "nav-collapsed" : ""}`}>
        <aside
          className="console-nav"
          aria-label={copy.administratorNavigation}
          data-testid="console-nav"
        >
          <div className="nav-perspective">
            <span>{copy.administrator}</span>
          </div>
          <nav className="nav-section" aria-label={copy.administratorNavigation}>
            {navigationSections.map((section) => (
              <div className="nav-group" key={section}>
                <span className="nav-heading">
                  {language === "ko" ? sectionLabelsKo[section] : section}
                </span>
                {consoleNavigation
                  .filter((item) => item.section === section)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        aria-current={activeNavId === item.id ? "page" : undefined}
                        className={`nav-item ${activeNavId === item.id ? "active" : ""}`}
                        data-testid={`console-nav-${item.id}`}
                        key={item.id}
                        type="button"
                        onClick={() => activateNavigation(item)}
                      >
                        <Icon size={15} aria-hidden="true" />
                        {navLabel(item, language)}
                      </button>
                    );
                  })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="workspace" data-testid="workspace">
          <section className="main-stage" data-testid="main-stage">
            <div className="breadcrumb-row" aria-label={copy.breadcrumb}>
              {navBreadcrumb(activeNavigation, language).map((crumb) => (
                <span key={crumb}>{crumb}</span>
              ))}
            </div>
            <div
              className="navigation-command-bar"
              data-testid="console-navigation-feedback"
            >
              <span>{copy.activeSurface}</span>
              <strong>{navLabel(activeNavigation, language)}</strong>
              <span>{navigationCommand}</span>
            </div>
            <section
              className="readiness-command-strip"
              data-testid="opslens-readiness-command-strip"
              aria-label={copy.readiness}
            >
              <div className="readiness-command-main">
                <div>
                  <p className="eyebrow">Cywell OpsLens</p>
                  <h2>{copy.readiness}</h2>
                </div>
                <span
                  className={`freshness ${statusClass(completionGate?.status)}`}
                >
                  {completionGate?.status ?? copy.loading}
                </span>
              </div>
              <div className="readiness-command-metrics">
                <span>
                  <Gauge size={15} aria-hidden="true" />
                  {completionGate
                    ? `${completionGate.percentComplete}%`
                    : "--%"}
                </span>
                <span>
                  {completionGate
                    ? `${completionGate.passedRequirements}/${completionGate.totalRequirements}`
                    : "--/--"}
                </span>
                <span>
                  {copy.remaining}=
                  {completionGate?.remainingRequirements ?? "--"}
                </span>
                <span>{copy.next}={nextGateLabel(adminOverview)}</span>
                <span>{copy.command}={firstNextCommand(adminOverview)}</span>
              </div>
              <a
                className="text-icon-button readiness-jump"
                href="#opslens-admin-title"
                data-testid="opslens-readiness-jump"
              >
                <Waypoints size={15} aria-hidden="true" />
                {copy.closure}
              </a>
            </section>
            <OperationsDashboard dashboard={dashboard} language={language} />
            <OpsLensAdminDashboard language={language} />
            <ConsoleEvidencePane
              contextPayload={contextPayload}
              activeRisks={dashboard.activeRisks}
              evidenceView={evidenceView}
              language={language}
              onEvidenceViewChange={setEvidenceView}
              onAsk={openAssistantFromEvidence}
            />
            <OcpConsoleOverview language={language} />
            <OcpCoverageMatrix />
            <OcpResourceExplorer
              language={language}
              navigationPreset={resourcePreset}
            />
          </section>
        </main>
      </div>

      {assistantOpen ? (
        <AssistantPopover
          draft={draft}
          contextChips={contextSync?.contextChips ?? contextChips}
          answer={planResponse?.answer ?? assistantAnswer}
          requestId={planResponse?.requestId ?? "plan-loading"}
          audit={planResponse?.audit ?? null}
          apiStatus={apiStatus}
          busy={assistantBusy}
          model={planResponse?.audit.model ?? "pending"}
          language={language}
          apiRouteMode={apiRoute.mode}
          actionPlanPath={apiRoute.actionPlanPath}
          lastApiError={lastApiError}
          onDraftChange={setDraft}
          onAsk={() => void askAssistant()}
          onRetryConnection={() => void bootstrapApiState()}
          onClose={() => setAssistantOpen(false)}
        />
      ) : null}
      <button
        aria-controls="kugnus-assistant-popover"
        aria-expanded={assistantOpen}
        aria-label={assistantOpen ? copy.closeAssistant : copy.openAssistant}
        className="lightspeed-launcher"
        data-testid="assistant-launcher"
        title={copy.assistantTitle}
        type="button"
        onClick={() => setAssistantOpen((open) => !open)}
      >
        <img className="launcher-icon-image" src={opsLensIcon} alt="" />
        <strong>{evidenceCount}</strong>
      </button>
    </div>
  );
}
