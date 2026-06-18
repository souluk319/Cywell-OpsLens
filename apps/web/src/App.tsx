import { useEffect, useMemo, useState } from "react";
import type {
  ActionPlanResponse,
  ContextSyncResponse,
  DashboardRisksResponse,
  OcpConnectionStatus,
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
  BookOpen,
  Bot,
  Boxes,
  CircleHelp,
  CirclePlus,
  Cpu,
  DatabaseZap,
  FileSearch,
  Gauge,
  GitBranch,
  Grid3X3,
  HardDrive,
  Heart,
  Network,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ServerCog,
  ShieldCheck,
  TableProperties,
  Users,
  Waypoints
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AssistantPopover } from "./components/AssistantPopover";
import { ConsoleEvidencePane } from "./components/ConsoleEvidencePane";
import { OcpConsoleActionPanel } from "./components/OcpConsoleActionPanel";
import { OcpConsoleOverview } from "./components/OcpConsoleOverview";
import { OcpConsoleParityMatrix } from "./components/OcpConsoleParityMatrix";
import { OcpCoverageMatrix } from "./components/OcpCoverageMatrix";
import {
  OcpResourceExplorer,
  type OcpResourcePreset
} from "./components/OcpResourceExplorer";
import { OpsLensLiveInstallStatus } from "./components/OpsLensLiveInstallStatus";
import { OpsLensAdminDashboard } from "./components/OpsLensAdminDashboard";
import { OperationsDashboard } from "./components/OperationsDashboard";
import {
  createActionPlan,
  fetchDashboardRisks,
  fetchOcpStatus,
  fetchOpsLensAdminOverview,
  getApiRouteDiagnostics,
  syncConsoleContext
} from "./lib/api";
import type { UiLanguage } from "./i18n";
import opsLensIcon from "./assets/brand/cywell_ops_lens_icon.png";
import {
  consoleParitySections,
  ocpConsoleParityItems,
  sectionLabelsKo,
  type ConsoleParityItem,
  type ConsoleParitySection
} from "./consoleParity";

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

const readinessStatusLabels: Record<UiLanguage, Record<string, string>> = {
  en: {
    pass: "passed",
    ready: "ready",
    "live-ready": "live ready",
    "needs-evidence": "needs evidence",
    "needs-tooling": "needs tooling",
    "approval-required": "approval required",
    missing: "missing"
  },
  ko: {
    pass: "통과",
    ready: "준비됨",
    "live-ready": "라이브 준비",
    "needs-evidence": "근거 필요",
    "needs-tooling": "도구 필요",
    "approval-required": "승인 필요",
    missing: "근거 없음"
  }
};

function readinessStatusText(
  status: string | undefined,
  language: UiLanguage,
  fallback: string
) {
  if (!status) return fallback;
  return readinessStatusLabels[language][status] ?? status;
}

function nextGateLabel(
  overview: OpsLensAdminOverviewResponse | null,
  language: UiLanguage
) {
  const gate = overview?.installReadiness.completionGate.remainingTo100[0];
  if (!gate) return language === "ko" ? "없음" : "none";
  return language === "ko"
    ? `${gate.gateId} / 담당 ${gate.owner}`
    : `${gate.gateId} / owner ${gate.owner}`;
}

function firstNextCommand(
  overview: OpsLensAdminOverviewResponse | null,
  language: UiLanguage
) {
  return (
    overview?.installReadiness.completionGate.remainingTo100[0]?.nextCommand ??
    (language === "ko" ? "없음" : "none")
  );
}

type EvidenceView = "alerts" | "logs" | "yaml";
type ConsoleNavId = string;
type ConsoleNavigationItem = ConsoleParityItem & { icon: LucideIcon };

const sectionIcons: Record<ConsoleParitySection, LucideIcon> = {
  Home: ServerCog,
  Favorites: Heart,
  Ecosystem: PackageSearch,
  Operators: DatabaseZap,
  Helm: BookOpen,
  Workloads: Boxes,
  Networking: Network,
  Storage: HardDrive,
  Builds: GitBranch,
  Monitoring: Activity,
  Compute: Cpu,
  "User Management": Users,
  Administration: ShieldCheck,
  Cywell: Bot
};

const itemIcons: Record<string, LucideIcon> = {
  search: FileSearch,
  alerting: AlertTriangle,
  logs: ScrollText,
  dashboards: TableProperties,
  metrics: Activity,
  "opslens-admin": DatabaseZap,
  opsbrain: Bot,
  "komsco-assistant": Bot
};

const consoleNavigation: ConsoleNavigationItem[] = ocpConsoleParityItems.map(
  (item) => ({
    ...item,
    icon: itemIcons[item.id] ?? sectionIcons[item.section]
  })
);

const navigationSections = consoleParitySections;

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
    remainingRequirements: "remaining items",
    passedRequirements: "passed requirements",
    next: "next",
    nextGate: "next gate",
    command: "cmd",
    nextCommand: "next check",
    closeAssistant: "Close KOMSCO AI Assistant",
    openAssistant: "Open KOMSCO AI Assistant",
    assistantTitle: "KOMSCO AI Assistant",
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
    statusDetailsTitle: "Operational details",
    statusDetailsSummary: "Show install and demo details",
    ocpLiveStatus: "OCP live",
    ocpStatusUnknown: "OCP check needed",
    dataSourceLive: "live data",
    dataSourceDemo: "demo data",
    openShiftUtilities: "OpenShift console utilities",
    installFlow: "Install flow",
    installStepOperatorHub: "OperatorHub: operator",
    installStepCustomResource: "OpsLensInstallation: product",
    installStepConsolePlugin: "ConsolePlugin: route",
    modBoundary: "Mod boundary",
    modAdds: "OpsLens adds route/API/MCP surfaces",
    modKeeps: "OpenShift keeps native chrome and Lightspeed drawer",
    runtimeBoundary: "Runtime profile",
    runtimeCrc: "CRC demo uses in-memory RAG + mock model",
    runtimeApproved: "Approved install requires pgvector/vLLM evidence",
    certificationBoundary: "Certification boundary",
    certificationLocal: "Local demo build",
    certificationSubmit: "No Partner/OperatorHub submission",
    certificationEvidence:
      "Certified readiness needs security/release evidence",
    accessBoundary: "Access path",
    accessConsoleRoute: "Installed view uses Console route",
    accessDashboardHttps: "Port-forward fallback uses HTTPS 19443",
    accessApiProxy: "Assistant/API follows proxy mode",
    applySignalBoundary: "CRC install signal",
    applySignalProfile: "Use CRC lightweight example first",
    applySignalCommand: "Check: oc get opslensinstallation,deploy,pod,svc,route",
    applySignalReady: "CRC ready = API/dashboard 1/1",
    applySignalRoute: "Route = cywell-opslens-dashboard",
    applySignalStale: "Old quay.io image means stale catalog",
    smokeBoundary: "Post-install smoke",
    smokeRoute: "Open ConsolePlugin route",
    smokeAssistant: "Ask KOMSCO AI Assistant",
    smokeOls: "OLSConfig stays ValidateOnly",
    handoffBoundary: "Return checklist",
    handoffReconnect: "Reconnect Mac CRC",
    handoffRoute: "Open ConsolePlugin route",
    handoffSmoke: "Run read-only smoke"
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
    helpCommand: "도움말이 KOMSCO AI 어시스턴트를 읽기 전용으로 열었습니다.",
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
    remainingRequirements: "남은 항목",
    passedRequirements: "통과 요건",
    next: "다음",
    nextGate: "다음 게이트",
    command: "명령",
    nextCommand: "다음 점검",
    closeAssistant: "KOMSCO AI 어시스턴트 닫기",
    openAssistant: "KOMSCO AI 어시스턴트 열기",
    assistantTitle: "KOMSCO AI 어시스턴트",
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
    statusDetailsTitle: "운영 상세",
    statusDetailsSummary: "설치 및 시연 상세 보기",
    ocpLiveStatus: "OCP 실시간 연결",
    ocpStatusUnknown: "OCP 확인 필요",
    dataSourceLive: "실데이터",
    dataSourceDemo: "데모 데이터",
    openShiftUtilities: "OpenShift 콘솔 유틸리티",
    installFlow: "설치 흐름",
    installStepOperatorHub: "OperatorHub: 오퍼레이터",
    installStepCustomResource: "OpsLensInstallation: 제품 적용",
    installStepConsolePlugin: "ConsolePlugin: 콘솔 라우트",
    modBoundary: "적용 범위",
    modAdds: "OpsLens가 라우트/API/MCP 화면을 추가",
    modKeeps: "OpenShift 기본 메뉴와 Lightspeed 서랍은 유지",
    runtimeBoundary: "런타임 프로필",
    runtimeCrc: "CRC 데모는 인메모리 RAG + 목 모델 사용",
    runtimeApproved: "승인 설치는 pgvector/vLLM 근거 필요",
    certificationBoundary: "인증 경계",
    certificationLocal: "로컬 데모 빌드",
    certificationSubmit: "Partner/OperatorHub 제출 안 함",
    certificationEvidence: "인증 준비는 보안/릴리스 근거 필요",
    accessBoundary: "접근 경로",
    accessConsoleRoute: "설치 화면은 콘솔 라우트 사용",
    accessDashboardHttps: "포트포워드 대체 경로는 HTTPS 19443",
    accessApiProxy: "어시스턴트/API는 프록시 모드 연동",
    applySignalBoundary: "CRC 설치 신호",
    applySignalProfile: "CRC lightweight 예제를 먼저 선택",
    applySignalCommand: "확인: oc get opslensinstallation,deploy,pod,svc,route",
    applySignalReady: "CRC 준비 = API/대시보드 1/1",
    applySignalRoute: "Route = cywell-opslens-dashboard",
    applySignalStale: "quay.io 구버전 이미지는 stale catalog",
    smokeBoundary: "설치 후 스모크",
    smokeRoute: "콘솔 플러그인 라우트 열기",
    smokeAssistant: "KOMSCO AI 어시스턴트 질문",
    smokeOls: "OLSConfig는 ValidateOnly 유지",
    handoffBoundary: "복귀 체크",
    handoffReconnect: "Mac CRC 재연결",
    handoffRoute: "콘솔 플러그인 라우트 열기",
    handoffSmoke: "읽기 전용 스모크 실행"
  }
} as const;

const apiStatusLabels: Record<
  UiLanguage,
  Record<"loading" | "ready" | "fallback", string>
> = {
  en: {
    loading: "checking",
    ready: "connected",
    fallback: "local fallback"
  },
  ko: {
    loading: "연결 확인 중",
    ready: "연결됨",
    fallback: "로컬 대체 응답"
  }
};

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
  return (language === "ko" ? item.originalPathKo : item.originalPath)
    .split("/")
    .map((crumb) => crumb.trim())
    .filter(Boolean);
}

function navCommand(item: ConsoleNavigationItem, language: UiLanguage) {
  return language === "ko" ? item.commandKo : item.command;
}

function sectionTestId(section: ConsoleParitySection) {
  return section.toLowerCase().replace(/\s+/g, "-");
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
  const [ocpStatus, setOcpStatus] = useState<OcpConnectionStatus | null>(null);
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

      fetchOcpStatus()
        .then((statusResponse) => {
          if (isActive()) {
            setOcpStatus(statusResponse);
          }
        })
        .catch(() => {
          if (isActive()) {
            setOcpStatus(null);
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
  const completionGate = adminOverview?.installReadiness.completionGate;
  const activeNavigation = findNavigationItem(activeNavId);
  const copy = shellCopy[language];
  const runtimeProfile = useMemo(() => readRuntimeProfile(), []);
  const apiRoute = useMemo(() => getApiRouteDiagnostics(), []);
  const isConsolePlugin = runtimeProfile.surface === "console-plugin";
  const dashboardUsesDemoData = dashboard.source === "mock-backend";

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
    if (item.actionSurface === "assistant") {
      setAssistantOpen(true);
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

  function openActiveNavigationSurface() {
    scrollToNavigationTarget(activeNavigation.targetSelector);
  }

  function askAssistantForActiveNavigation() {
    const prompt =
      language === "ko"
        ? `${navLabel(activeNavigation, language)} 기능을 현재 OpenShift 컨텍스트에서 읽기 전용으로 점검해줘. ${navCommand(activeNavigation, language)}`
        : `Review the ${navLabel(activeNavigation, language)} function against the current OpenShift context in read-only mode. ${navCommand(activeNavigation, language)}`;
    setDraft(prompt);
    setAssistantOpen(true);
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
              {copy.api} {apiStatusLabels[language][apiStatus]}
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
            <span className="user-menu" data-testid="masthead-user-menu">
              kubeadmin
            </span>
          </div>
        </div>
      </header>

      <details
        className="opslens-status-details"
        data-testid="opslens-status-details"
        aria-label={copy.statusDetailsTitle}
      >
        <summary data-testid="opslens-status-details-summary">
          <span>{copy.statusDetailsSummary}</span>
          <span
            className={`status-pill ${ocpStatus?.reachable ? "ready" : "warning"}`}
            data-testid="ocp-live-status"
          >
            {ocpStatus?.reachable ? copy.ocpLiveStatus : copy.ocpStatusUnknown}
          </span>
          <span
            className={`status-pill ${dashboardUsesDemoData ? "warning" : "ready"}`}
            data-testid="dashboard-data-source"
          >
            {dashboardUsesDemoData ? copy.dataSourceDemo : copy.dataSourceLive}
          </span>
        </summary>
        <div className="opslens-status-detail-grid">
          <div
            className="runtime-surface-strip"
            data-testid="runtime-surface-strip"
            aria-label={copy.opsLensStatus}
          >
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
            <span className="status-pill read-only" data-testid="runtime-readonly-boundary">
              <ShieldCheck size={15} aria-hidden="true" />
              {copy.readOnly}
            </span>
          </div>
          <div
            className="install-flow-strip"
            data-testid="install-flow-strip"
            aria-label={copy.installFlow}
          >
            <span className="status-pill read-only" data-testid="install-flow-operatorhub">
              {copy.installStepOperatorHub}
            </span>
            <span className="status-pill read-only" data-testid="install-flow-cr">
              {copy.installStepCustomResource}
            </span>
            <span className="status-pill read-only" data-testid="install-flow-consoleplugin">
              {copy.installStepConsolePlugin}
            </span>
          </div>
          <div
            className="mod-boundary-strip"
            data-testid="mod-boundary-strip"
            aria-label={copy.modBoundary}
          >
            <span className="status-pill ready" data-testid="mod-boundary-adds">
              {copy.modAdds}
            </span>
            <span className="status-pill warning" data-testid="mod-boundary-keeps">
              {copy.modKeeps}
            </span>
          </div>
          <div
            className="runtime-profile-strip"
            data-testid="runtime-profile-strip"
            aria-label={copy.runtimeBoundary}
          >
            <span className="status-pill ready" data-testid="runtime-profile-crc">
              {copy.runtimeCrc}
            </span>
            <span
              className="status-pill warning"
              data-testid="runtime-profile-approved"
            >
              {copy.runtimeApproved}
            </span>
          </div>
          <div
            className="certification-boundary-strip"
            data-testid="certification-boundary-strip"
            aria-label={copy.certificationBoundary}
          >
            <span
              className="status-pill warning"
              data-testid="certification-boundary-local"
            >
              {copy.certificationLocal}
            </span>
            <span
              className="status-pill read-only"
              data-testid="certification-boundary-submit"
            >
              {copy.certificationSubmit}
            </span>
            <span
              className="status-pill warning"
              data-testid="certification-boundary-evidence"
            >
              {copy.certificationEvidence}
            </span>
          </div>
          <div
            className="demo-handoff-strip"
            data-testid="demo-handoff-strip"
            aria-label={copy.handoffBoundary}
          >
            <span className="status-pill read-only" data-testid="handoff-reconnect">
              {copy.handoffReconnect}
            </span>
            <span className="status-pill ready" data-testid="handoff-route">
              {copy.handoffRoute}
            </span>
            <span className="status-pill warning" data-testid="handoff-smoke">
              {copy.handoffSmoke}
            </span>
          </div>
          <div
            className="access-boundary-strip"
            data-testid="access-boundary-strip"
            aria-label={copy.accessBoundary}
          >
            <span className="status-pill ready" data-testid="access-console-route">
              {copy.accessConsoleRoute}
            </span>
            <span className="status-pill warning" data-testid="access-dashboard-https">
              {copy.accessDashboardHttps}
            </span>
            <span className="status-pill read-only" data-testid="access-api-proxy">
              {copy.accessApiProxy}
            </span>
          </div>
          <div
            className="apply-signal-strip"
            data-testid="apply-signal-strip"
            aria-label={copy.applySignalBoundary}
          >
            <span className="status-pill ready" data-testid="apply-signal-profile">
              {copy.applySignalProfile}
            </span>
            <span className="status-pill read-only" data-testid="apply-signal-command">
              {copy.applySignalCommand}
            </span>
            <span className="status-pill ready" data-testid="apply-signal-ready">
              {copy.applySignalReady}
            </span>
            <span className="status-pill ready" data-testid="apply-signal-route">
              {copy.applySignalRoute}
            </span>
            <span className="status-pill warning" data-testid="apply-signal-stale">
              {copy.applySignalStale}
            </span>
          </div>
          <div
            className="post-install-smoke-strip"
            data-testid="post-install-smoke-strip"
            aria-label={copy.smokeBoundary}
          >
            <span className="status-pill ready" data-testid="smoke-route">
              {copy.smokeRoute}
            </span>
            <span className="status-pill ready" data-testid="smoke-assistant">
              {copy.smokeAssistant}
            </span>
            <span className="status-pill read-only" data-testid="smoke-ols">
              {copy.smokeOls}
            </span>
          </div>
        </div>
      </details>

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
                <span
                  className="nav-heading"
                  data-testid={`console-nav-section-${sectionTestId(section)}`}
                >
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
            <div
              className="breadcrumb-row"
              aria-label={copy.breadcrumb}
              data-testid="console-breadcrumb"
            >
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
                  data-testid="readiness-status"
                >
                  {readinessStatusText(
                    completionGate?.status,
                    language,
                    copy.loading
                  )}
                </span>
              </div>
              <div className="readiness-command-metrics">
                <span data-testid="readiness-percent">
                  <Gauge size={15} aria-hidden="true" />
                  {completionGate
                    ? `${completionGate.percentComplete}%`
                    : "--%"}
                </span>
                <span data-testid="readiness-passed">
                  {copy.passedRequirements}:{" "}
                  {completionGate
                    ? `${completionGate.passedRequirements}/${completionGate.totalRequirements}`
                    : "--/--"}
                </span>
                <span data-testid="readiness-remaining">
                  {copy.remainingRequirements}:{" "}
                  {completionGate?.remainingRequirements ?? "--"}
                </span>
                <span data-testid="readiness-next-gate">
                  {copy.nextGate}: {nextGateLabel(adminOverview, language)}
                </span>
                <span data-testid="readiness-next-command">
                  {copy.nextCommand}: {firstNextCommand(adminOverview, language)}
                </span>
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
            <OpsLensLiveInstallStatus language={language} />
            <OcpConsoleActionPanel
              activeItem={activeNavigation}
              language={language}
              onAskAssistant={askAssistantForActiveNavigation}
              onOpenSurface={openActiveNavigationSurface}
            />
            <OcpConsoleParityMatrix
              activeItemId={activeNavId}
              language={language}
              onSelectItem={(itemId) => activateNavigation(findNavigationItem(itemId))}
            />
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
            <OcpCoverageMatrix language={language} />
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
        <img
          className="launcher-icon-image"
          data-testid="assistant-launcher-icon"
          src={opsLensIcon}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      </button>
    </div>
  );
}
