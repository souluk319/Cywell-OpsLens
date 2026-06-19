import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionPlanResponse,
  AssistantAnswer,
  ContextSyncResponse,
  DashboardRisksResponse,
  OcpConnectionStatus,
  OpsLensAdminOverviewResponse
} from "@kugnus/contracts";
import {
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
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  Cpu,
  DatabaseZap,
  FileSearch,
  Gauge,
  GitBranch,
  Globe2,
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
  Undo2,
  UserCog,
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
  OcpMonitoringConsole,
  type OcpMonitoringView
} from "./components/OcpMonitoringConsole";
import {
  OcpBuildsConsole,
  type OcpBuildsView
} from "./components/OcpBuildsConsole";
import {
  OcpNetworkingConsole,
  type OcpNetworkingView
} from "./components/OcpNetworkingConsole";
import {
  OcpStorageConsole,
  type OcpStorageView
} from "./components/OcpStorageConsole";
import { OcpTopologyGraph } from "./components/OcpTopologyGraph";
import {
  OcpResourceExplorer,
  type OcpResourceFunctionOutcome,
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
  consoleParityFunctionProof,
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
type ConsoleNavigationItem = ConsoleParityItem;

const sectionIcons: Record<ConsoleParitySection, LucideIcon> = {
  Home: ServerCog,
  Favorites: Heart,
  Ecosystem: PackageSearch,
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

const consoleNavigation: ConsoleNavigationItem[] = ocpConsoleParityItems;

const navigationSections = consoleParitySections;
const defaultActiveNavId: ConsoleNavId = "overview";
const defaultExpandedSections: ConsoleParitySection[] = [];
const activeNavQueryParam = "nav";
const expandedSectionsStorageKey = "cywell-opslens-expanded-nav-sections-dev015-chat";

const shellCopy = {
  en: {
    activeSurface: "Active surface",
    api: "Assistant",
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
    ocpConsoleReturn: "OCP Console",
    ocpConsoleReturnCommand: "Open native OpenShift Console.",
    openNavigation: "Open navigation",
    collapseNavigation: "Collapse navigation",
    readOnly: "read-only",
    readiness: "100% Readiness",
    closure: "Closure",
    administratorNavigation: "Administrator navigation",
    administrator: "Administrator",
    breadcrumb: "Breadcrumb",
    language: "Language",
    switchLanguageToEnglish: "Switch to English",
    switchLanguageToKorean: "Switch to Korean",
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
    consoleContextPrimary: "OpenShift ConsolePlugin",
    consoleContextSecondary: "UserToken proxy / active console context",
    standaloneContextPrimary: "CRC validation shell",
    standaloneContextSecondary: "console route pending / company OCP untouched",
    opsLensStatus: "Cywell OpsLens status",
    ocpLiveStatus: "OCP live",
    ocpStatusUnknown: "OCP check needed",
    dataSourceLive: "live data",
    dataSourceDemo: "demo data",
    openShiftUtilities: "OpenShift console utilities"
  },
  ko: {
    activeSurface: "현재 화면",
    api: "어시스턴트",
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
    ocpConsoleReturn: "OCP Console",
    ocpConsoleReturnCommand: "기본 OpenShift Console로 이동합니다.",
    openNavigation: "탐색 열기",
    collapseNavigation: "탐색 접기",
    readOnly: "읽기 전용",
    readiness: "100% 준비도",
    closure: "완료 조건",
    administratorNavigation: "관리자 탐색",
    administrator: "관리자",
    breadcrumb: "이동 경로",
    language: "언어",
    switchLanguageToEnglish: "영어로 전환",
    switchLanguageToKorean: "한국어로 전환",
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
    consoleContextPrimary: "OpenShift 콘솔 플러그인",
    consoleContextSecondary: "사용자 토큰 프록시 / 활성 콘솔 컨텍스트",
    standaloneContextPrimary: "CRC 검증 환경",
    standaloneContextSecondary: "콘솔 라우트 준비 중 / 회사 OCP 변경 없음",
    opsLensStatus: "Cywell OpsLens 상태",
    ocpLiveStatus: "OCP 실시간 연결",
    ocpStatusUnknown: "OCP 확인 필요",
    dataSourceLive: "실데이터",
    dataSourceDemo: "데모 데이터",
    openShiftUtilities: "OpenShift 콘솔 유틸리티"
  }
} as const;

const apiStatusLabels: Record<
  UiLanguage,
  Record<"loading" | "ready" | "fallback", string>
> = {
  en: {
    loading: "checking",
    ready: "Lightspeed connected",
    fallback: "Lightspeed required"
  },
  ko: {
    loading: "연결 확인 중",
    ready: "Lightspeed 연결됨",
    fallback: "Lightspeed 연결 필요"
  }
};

type LightspeedAssistantMode = "ask" | "troubleshooting";

type AssistantChatTurn = {
  id: string;
  prompt: string;
  answer: AssistantAnswer;
  pending?: boolean;
  streaming?: boolean;
};

function createPendingAssistantAnswer(language: UiLanguage): AssistantAnswer {
  const isKo = language === "ko";
  return {
    scenario: "OpenShiftLightspeedPending",
    judgment: isKo
      ? "OpenShift Lightspeed에 질문을 전달했습니다. 응답을 기다리는 중입니다."
      : "The question was sent to OpenShift Lightspeed. Waiting for the answer.",
    inspectedEvidence: [],
    candidates: [],
    nextChecks: [],
    plan: [],
    risks: [],
    rollbackPath: [],
    citations: [],
    missingEvidence: [],
    actionMode: "readOnly"
  };
}

function assistantStoppedMessage(language: UiLanguage) {
  return language === "ko"
    ? "응답 생성을 중지했습니다."
    : "Answer generation stopped.";
}

function createLightspeedUnavailablePlan(params: {
  language: UiLanguage;
  prompt: string;
  reason?: string;
}): ActionPlanResponse {
  const isKo = params.language === "ko";
  const answer: AssistantAnswer = {
    scenario: "OpenShiftLightspeedUnavailable",
    judgment: isKo
      ? "OpenShift Lightspeed 연결이 확인되지 않아 AI 답변을 생성하지 않았습니다. Lightspeed 경로와 권한을 복구한 뒤 다시 질문하십시오."
      : "OpenShift Lightspeed is not connected, so OpsLens did not generate an AI answer. Restore the Lightspeed route and authorization before retrying.",
    inspectedEvidence: [
      {
        id: "openshift-lightspeed-v1-query",
        label: "OpenShift Lightspeed streaming API /v1/streaming_query",
        type: "official-doc",
        trustLevel: "official"
      },
      {
        id: "opslens-console-context",
        label: "OpsLens active OpenShift Console context",
        type: "cluster",
        trustLevel: "cluster-snapshot"
      }
    ],
    candidates: [
      {
        label: isKo
          ? "Lightspeed 연결 또는 권한 확인 필요"
          : "Lightspeed connection or authorization needs attention",
        confidence: "high",
        reason:
          params.reason ??
          (isKo
            ? "OpsLens API가 OpenShift Lightspeed /v1/streaming_query 응답을 받지 못했습니다."
            : "OpsLens API did not receive a response from OpenShift Lightspeed /v1/streaming_query."),
        evidenceIds: ["openshift-lightspeed-v1-query"]
      }
    ],
    nextChecks: isKo
      ? [
          "OpenShift Lightspeed app server 경로가 OpsLens API에서 도달 가능한지 확인",
          "현재 사용자 또는 서비스 계정에 ols-user 권한이 있는지 확인",
          "Ask/Troubleshooting 모드를 선택한 뒤 다시 질문"
        ]
      : [
          "Confirm the OpenShift Lightspeed app server is reachable from the OpsLens API.",
          "Confirm the current user or service account has the ols-user role.",
          "Select Ask or Troubleshooting mode and retry."
        ],
    plan: isKo
      ? [
          "OpenShift Lightspeed 연결 전에는 AI 답변을 보류합니다.",
          "Lightspeed가 연결되면 동일 질문을 /v1/streaming_query로 다시 보냅니다."
        ]
      : [
          "Hold the AI answer until OpenShift Lightspeed is connected.",
          "When Lightspeed is restored, resend the same question through /v1/streaming_query."
        ],
    risks: isKo
      ? ["OpsLens API 연결과 Lightspeed AI 연결은 서로 다른 상태입니다."]
      : ["OpsLens API connectivity and Lightspeed AI connectivity are separate states."],
    rollbackPath: isKo
      ? ["Lightspeed 연결 전까지 어시스턴트는 연결 필요 상태로 유지합니다."]
      : ["Keep the assistant in a connection-required state until Lightspeed is available."],
    citations: [
      {
        id: "openshift-lightspeed-v1-query",
        label: "OpenShift Lightspeed streaming API /v1/streaming_query",
        type: "official-doc",
        trustLevel: "official"
      }
    ],
    missingEvidence: isKo
      ? ["OpenShift Lightspeed /v1/streaming_query 성공 응답"]
      : ["Successful OpenShift Lightspeed /v1/streaming_query response"],
    actionMode: "readOnly"
  };

  return {
    requestId: "lightspeed-unavailable",
    answer,
    audit: {
      requestId: "lightspeed-unavailable",
      user: mockContext.user,
      groups: [mockContext.rbac.role],
      clusterId: mockContext.clusterId,
      namespaceScope: mockContext.namespace,
      contextHash: "lightspeed-required",
      sources: answer.inspectedEvidence.map((source) => source.id),
      model: "openshift-lightspeed/unavailable",
      tokenUsage: {
        input: Math.ceil(params.prompt.length / 4),
        output: 0
      },
      latencyMs: 0,
      redactionCount: 0,
      actionMode: answer.actionMode
    }
  };
}

function actionPlanUsesLightspeed(plan: ActionPlanResponse) {
  return plan.audit.model.startsWith("openshift-lightspeed/v1/streaming_query");
}

interface RuntimeProfile {
  surface: "console-plugin" | "standalone-dev";
  apiBaseAttached: boolean;
}

function findNavigationItem(id: ConsoleNavId) {
  return (
    consoleNavigation.find((item) => item.id === id) ??
    consoleNavigation.find((item) => item.id === defaultActiveNavId) ??
    consoleNavigation[0]
  );
}

function isKnownNavigationId(id: string | null): id is ConsoleNavId {
  return Boolean(id && consoleNavigation.some((item) => item.id === id));
}

function isKnownNavigationSection(
  section: string
): section is ConsoleParitySection {
  return navigationSections.includes(section as ConsoleParitySection);
}

function readInitialActiveNavId(): ConsoleNavId {
  if (typeof window === "undefined") {
    return defaultActiveNavId;
  }

  try {
    const params = new URL(window.location.href).searchParams;
    const routed = params.get(activeNavQueryParam) ?? params.get("view");
    if (isKnownNavigationId(routed)) {
      return routed;
    }
  } catch {
    // Ignore URL parsing failures; the default page still gives a stable route.
  }

  return defaultActiveNavId;
}

function writeActiveNavRoute(activeNavId: ConsoleNavId) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = new URL(window.location.href);
    if (activeNavId === defaultActiveNavId) {
      url.searchParams.delete(activeNavQueryParam);
    } else {
      url.searchParams.set(activeNavQueryParam, activeNavId);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Keep in-memory navigation if browser history is unavailable.
  }
}

function readInitialExpandedSections(
  activeNavId = readInitialActiveNavId()
): ConsoleParitySection[] {
  const activeItem = findNavigationItem(activeNavId);
  const defaultSections = Array.from(
    new Set([...defaultExpandedSections, activeItem.section])
  );

  if (typeof window === "undefined") {
    return defaultSections;
  }

  try {
    const stored = window.localStorage.getItem(expandedSectionsStorageKey);
    if (!stored) {
      return defaultSections;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return defaultSections;
    }

    const storedSections = parsed.filter((section): section is ConsoleParitySection =>
      typeof section === "string" && isKnownNavigationSection(section)
    );

    return Array.from(new Set([...storedSections, activeItem.section]));
  } catch {
    return defaultSections;
  }
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
  const initialActiveNavId = useMemo(() => readInitialActiveNavId(), []);
  const initialExpandedSections = useMemo(
    () => readInitialExpandedSections(initialActiveNavId),
    [initialActiveNavId]
  );
  const initialLanguageValue = useMemo(() => initialLanguage(), []);
  const [language, setLanguage] = useState<UiLanguage>(initialLanguageValue);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] =
    useState<LightspeedAssistantMode>("troubleshooting");
  const [draft, setDraft] = useState("");
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("alerts");
  const [activeNavId, setActiveNavId] = useState<ConsoleNavId>(
    initialActiveNavId
  );
  const [navigationFeedback, setNavigationFeedback] = useState(() =>
    navLabel(findNavigationItem(initialActiveNavId), initialLanguageValue)
  );
  const [expandedSections, setExpandedSections] = useState<
    ConsoleParitySection[]
  >(initialExpandedSections);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [resourcePreset, setResourcePreset] =
    useState<OcpResourcePreset | null>(null);
  const [resourceFunctionOutcome, setResourceFunctionOutcome] =
    useState<OcpResourceFunctionOutcome>("not-active");
  const [activeTargetStatus, setActiveTargetStatus] = useState<
    "checking" | "mounted" | "missing"
  >("checking");
  const [dashboard, setDashboard] =
    useState<DashboardRisksResponse>(mockDashboardResponse);
  const [contextSync, setContextSync] = useState<ContextSyncResponse | null>(
    null
  );
  const [planResponse, setPlanResponse] = useState<ActionPlanResponse | null>(
    null
  );
  const [assistantTurns, setAssistantTurns] = useState<AssistantChatTurn[]>([]);
  const [adminOverview, setAdminOverview] =
    useState<OpsLensAdminOverviewResponse | null>(null);
  const [ocpStatus, setOcpStatus] = useState<OcpConnectionStatus | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const assistantAbortRef = useRef<AbortController | null>(null);
  const assistantRevealTimerRef = useRef<number | null>(null);
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
          scenario: "ClusterNotUpgradeable",
          mode: assistantMode
        })
      ]);

      if (!isActive()) {
        return;
      }

      setContextSync(contextResponse);
      setPlanResponse(plan);
      setApiStatus(actionPlanUsesLightspeed(plan) ? "ready" : "fallback");
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
      setPlanResponse(
        createLightspeedUnavailablePlan({
          language,
          prompt: draft,
          reason: error instanceof Error ? error.message : undefined
        })
      );
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
  const nextLanguage: UiLanguage = language === "ko" ? "en" : "ko";
  const languageSwitchLabel =
    nextLanguage === "ko" ? copy.switchLanguageToKorean : copy.switchLanguageToEnglish;
  const runtimeProfile = useMemo(() => readRuntimeProfile(), []);
  const apiRoute = useMemo(() => getApiRouteDiagnostics(), []);
  const isConsolePlugin = runtimeProfile.surface === "console-plugin";

  function toggleNavigationSection(section: ConsoleParitySection) {
    setExpandedSections((current) =>
      current.includes(section)
        ? current.filter((expanded) => expanded !== section)
        : [...current, section]
    );
  }

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem("cywell-opslens-language", language);
    } catch {
      // Ignore storage failures; the current session still reflects the selection.
    }
  }, [language]);

  useEffect(() => {
    writeActiveNavRoute(activeNavId);
  }, [activeNavId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        expandedSectionsStorageKey,
        JSON.stringify(expandedSections)
      );
    } catch {
      // Ignore storage failures; expanded groups still work for this session.
    }
  }, [expandedSections]);

  useEffect(() => {
    setExpandedSections((current) =>
      current.includes(activeNavigation.section)
        ? current
        : [...current, activeNavigation.section]
    );
  }, [activeNavigation.section]);

  function clearAssistantRevealTimer() {
    if (assistantRevealTimerRef.current !== null) {
      window.clearTimeout(assistantRevealTimerRef.current);
      assistantRevealTimerRef.current = null;
    }
  }

  function stopAssistant() {
    assistantAbortRef.current?.abort();
    assistantAbortRef.current = null;
    clearAssistantRevealTimer();
    setAssistantBusy(false);
    setApiStatus(
      planResponse && actionPlanUsesLightspeed(planResponse) ? "ready" : "fallback"
    );
    setAssistantTurns((current) =>
      current.map((turn) => {
        if (!turn.pending && !turn.streaming) {
          return turn;
        }

        const visibleText = turn.answer.judgment.trim();
        const stoppedText = visibleText
          ? `${visibleText}\n\n${assistantStoppedMessage(language)}`
          : assistantStoppedMessage(language);

        return {
          ...turn,
          pending: false,
          streaming: false,
          answer: {
            ...turn.answer,
            judgment: stoppedText
          }
        };
      })
    );
  }

  async function askAssistant(promptOverride?: string) {
    const prompt = (promptOverride ?? draft).trim();
    if (!prompt) {
      return;
    }
    assistantAbortRef.current?.abort();
    assistantAbortRef.current = null;
    clearAssistantRevealTimer();
    const controller = new AbortController();
    assistantAbortRef.current = controller;
    const pendingId = `pending-${Date.now()}`;
    setAssistantBusy(true);
    setLastApiError(null);
    setDraft("");
    setAssistantTurns((current) => [
      ...current,
      {
        id: pendingId,
        prompt,
        answer: createPendingAssistantAnswer(language),
        pending: true
      }
    ]);

    try {
      const plan = await createActionPlan(
        {
          prompt,
          context: contextSync?.context ?? mockContext,
          scenario: "ClusterNotUpgradeable",
          mode: assistantMode
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        return;
      }
      setPlanResponse(plan);
      const answerText = plan.answer.judgment;
      setAssistantTurns((current) =>
        current.map((turn) =>
          turn.id === pendingId
            ? {
                id: plan.requestId,
                prompt,
                answer: {
                  ...plan.answer,
                  judgment: ""
                },
                streaming: true
              }
            : turn
        )
      );
      const answerChars = Array.from(answerText);
      let visibleChars = 0;
      const revealAnswer = () => {
        assistantRevealTimerRef.current = null;
        if (controller.signal.aborted) {
          return;
        }
        visibleChars = Math.min(answerChars.length, visibleChars + 8);
        const visibleText = answerChars.slice(0, visibleChars).join("");
        setAssistantTurns((current) =>
          current.map((turn) =>
            turn.id === plan.requestId
              ? {
                  ...turn,
                  answer: {
                    ...plan.answer,
                    judgment: visibleText
                  },
                  streaming: visibleChars < answerChars.length
                }
              : turn
          )
        );
        if (visibleChars < answerChars.length) {
          assistantRevealTimerRef.current = window.setTimeout(revealAnswer, 22);
        }
      };
      assistantRevealTimerRef.current = window.setTimeout(revealAnswer, 40);
      setApiStatus(actionPlanUsesLightspeed(plan) ? "ready" : "fallback");
      setLastApiError(null);
    } catch (error) {
      if (controller.signal.aborted) {
        setAssistantTurns((current) =>
          current.map((turn) =>
            turn.id === pendingId
              ? {
                  ...turn,
                  pending: false,
                  streaming: false,
                  answer: {
                    ...turn.answer,
                    judgment: assistantStoppedMessage(language)
                  }
                }
              : turn
          )
        );
        return;
      }
      setApiStatus("fallback");
      setLastApiError(
        error instanceof Error
          ? error.message
          : "OpenShift Lightspeed /v1/streaming_query request failed."
      );
      const fallbackPlan = createLightspeedUnavailablePlan({
        language,
        prompt,
        reason:
          error instanceof Error
            ? error.message
            : "OpenShift Lightspeed /v1/streaming_query request failed"
      });
      setPlanResponse(fallbackPlan);
      setAssistantTurns((current) =>
        current.map((turn) =>
          turn.id === pendingId
            ? {
                id: fallbackPlan.requestId,
                prompt,
                answer: fallbackPlan.answer
              }
            : turn
        )
      );
    } finally {
      if (assistantAbortRef.current === controller) {
        assistantAbortRef.current = null;
      }
      setAssistantBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      assistantAbortRef.current?.abort();
      assistantAbortRef.current = null;
      clearAssistantRevealTimer();
    };
  }, []);

  function scrollToNavigationTarget(
    targetSelector: string,
    trackActiveTarget = false,
    attempt = 0
  ) {
    if (trackActiveTarget && attempt === 0) {
      setActiveTargetStatus("checking");
    }
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      const stage = document.querySelector<HTMLElement>(
        "[data-testid='main-stage']"
      );

      if (!target) {
        if (attempt < 3) {
          scrollToNavigationTarget(targetSelector, trackActiveTarget, attempt + 1);
          return;
        }
        if (trackActiveTarget) {
          setActiveTargetStatus("missing");
        }
        return;
      }

      if (trackActiveTarget) {
        setActiveTargetStatus("mounted");
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

  function applyNavigationSideEffects(item: ConsoleNavigationItem) {
    if (item.evidenceView) {
      setEvidenceView(item.evidenceView);
    }
    if (item.actionSurface === "assistant") {
      setAssistantOpen(true);
    }
    if (item.resourcePreset) {
      setResourceFunctionOutcome("waiting");
      setResourcePreset({
        ...item.resourcePreset,
        activationId: `${item.id}-${Date.now()}`
      });
    } else {
      setResourceFunctionOutcome("not-active");
    }
  }

  function activateNavigation(item: ConsoleNavigationItem) {
    setExpandedSections((current) =>
      current.includes(item.section) ? current : [...current, item.section]
    );
    setActiveNavId(item.id);
    setNavigationFeedback(navLabel(item, language));
    if (item.id === activeNavId) {
      applyNavigationSideEffects(item);
    }
  }

  function openNativeOcpConsole() {
    const target = isConsolePlugin
      ? "/dashboards"
      : "https://console-openshift-console.apps-crc.testing/dashboards";
    window.location.assign(target);
  }

  function runUtilityAction(
    targetSelector: string,
    openAssistant = false,
    feedback?: string
  ) {
    if (openAssistant) {
      setAssistantOpen(true);
    }
    if (feedback) {
      setNavigationFeedback(feedback);
    }
    scrollToNavigationTarget(targetSelector);
  }

  function askAssistantForActiveNavigation() {
    const proof = consoleParityFunctionProof(activeNavigation);
    const path =
      language === "ko"
        ? activeNavigation.originalPathKo
        : activeNavigation.originalPath;
    const proofInput = language === "ko" ? proof.inputKo : proof.input;
    const proofText = language === "ko" ? proof.proofKo : proof.proof;
    const prompt =
      language === "ko"
        ? [
            `${navLabel(activeNavigation, language)} 기능을 현재 OpenShift 컨텍스트에서 읽기 전용으로 점검해줘.`,
            `원본 OCP 경로: ${path}`,
            `기능 모드: ${proof.mode}`,
            `기능 입력: ${proofInput}`,
            `동작 증거: ${proofText}`,
            `동작: ${navCommand(activeNavigation, language)}`,
            "경계: 읽기 전용/계획 전용으로만 답변하고 클러스터 변경 명령은 제안하지 마."
          ].join("\n")
        : [
            `Review the ${navLabel(activeNavigation, language)} function against the current OpenShift context in read-only mode.`,
            `Native OCP path: ${path}`,
            `Function mode: ${proof.mode}`,
            `Function input: ${proofInput}`,
            `Action proof: ${proofText}`,
            `Action: ${navCommand(activeNavigation, language)}`,
            "Boundary: answer in read-only/plan-only mode and do not propose cluster mutation commands."
          ].join("\n");
    setDraft(prompt);
    setAssistantOpen(true);
  }

  function openActiveNavigationSurface() {
    applyNavigationSideEffects(activeNavigation);
    scrollToNavigationTarget(activeNavigation.targetSelector, true);
  }

  function openAssistantFromEvidence() {
    setAssistantOpen(true);
    void askAssistant();
  }

  useEffect(() => {
    applyNavigationSideEffects(activeNavigation);
    scrollToNavigationTarget(activeNavigation.targetSelector, true);
  }, [activeNavId]);

  function renderReadinessSurface() {
    return (
      <>
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
              {completionGate ? `${completionGate.percentComplete}%` : "--%"}
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
      </>
    );
  }

  function renderActiveSurface() {
    switch (activeNavigation.actionSurface) {
      case "overview":
        return (
          <>
            <OcpConsoleOverview language={language} />
            <OcpCoverageMatrix language={language} />
          </>
        );
      case "resource-explorer":
        return (
          <OcpResourceExplorer
            language={language}
            navigationPreset={resourcePreset}
            onFunctionOutcomeChange={setResourceFunctionOutcome}
          />
        );
      case "topology-graph":
        return <OcpTopologyGraph language={language} />;
      case "monitoring-console":
        return (
          <OcpMonitoringConsole
            language={language}
            view={activeNavigation.id as OcpMonitoringView}
          />
        );
      case "builds-console":
        return (
          <OcpBuildsConsole
            language={language}
            view={activeNavigation.id as OcpBuildsView}
          />
        );
      case "networking-console":
        return (
          <OcpNetworkingConsole
            language={language}
            view={activeNavigation.id as OcpNetworkingView}
          />
        );
      case "storage-console":
        return (
          <OcpStorageConsole
            language={language}
            view={activeNavigation.id as OcpStorageView}
          />
        );
      case "evidence":
        return (
          <ConsoleEvidencePane
            contextPayload={contextPayload}
            activeRisks={dashboard.activeRisks}
            evidenceView={evidenceView}
            language={language}
            onEvidenceViewChange={setEvidenceView}
            onAsk={openAssistantFromEvidence}
          />
        );
      case "ops-admin":
        return (
          <>
            {renderReadinessSurface()}
            <OpsLensAdminDashboard language={language} />
          </>
        );
      case "opsbrain":
        return <OpsLensAdminDashboard language={language} />;
      case "assistant":
        return (
          <ConsoleEvidencePane
            contextPayload={contextPayload}
            activeRisks={dashboard.activeRisks}
            evidenceView={evidenceView}
            language={language}
            onEvidenceViewChange={setEvidenceView}
            onAsk={openAssistantFromEvidence}
          />
        );
      case "ops-dashboard":
      default:
        if (activeNavigation.id === "favorites") {
          return (
            <OcpConsoleParityMatrix
              activeItemId={activeNavId}
              language={language}
              onSelectItem={(itemId) => activateNavigation(findNavigationItem(itemId))}
            />
          );
        }
        return <OperationsDashboard dashboard={dashboard} language={language} />;
    }
  }

  return (
    <div className="app-shell">
      <div
        className="sr-only"
        data-testid="console-navigation-feedback"
        aria-live="polite"
      >
        {navigationFeedback}
      </div>
      <header className="masthead" data-testid="masthead">
        <div className="masthead-left">
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
            <button
              className="icon-button language-toggle"
              aria-label={languageSwitchLabel}
              data-testid={
                nextLanguage === "ko" ? "language-ko-toggle" : "language-en-toggle"
              }
              title={languageSwitchLabel}
              type="button"
              onClick={() => setLanguage(nextLanguage)}
            >
              <Globe2 size={18} aria-hidden="true" />
              <span className="sr-only">{copy.language}</span>
            </button>
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
                  "[data-testid='opslens-readiness-command-strip']",
                  false,
                  "Application launcher focused"
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
                  "#dashboard-title",
                  false,
                  "Notifications focused"
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
                  "#opslens-admin-title",
                  true,
                  "Create opened a plan-only workflow"
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
                  "#evidence-title",
                  true,
                  "Help opened the KOMSCO AI Assistant"
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

      <div className={`console-frame ${navCollapsed ? "nav-collapsed" : ""}`}>
        <aside
          className="console-nav"
          aria-label={copy.administratorNavigation}
          data-testid="console-nav"
        >
          <div className="nav-perspective">
            <button
              className="icon-button nav-collapse-control"
              type="button"
              data-testid="nav-collapse-toggle"
              aria-label={navCollapsed ? copy.openNavigation : copy.collapseNavigation}
              aria-pressed={!navCollapsed}
              onClick={() => setNavCollapsed((collapsed) => !collapsed)}
            >
              {navCollapsed ? (
                <PanelLeftOpen size={19} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={19} aria-hidden="true" />
              )}
            </button>
            <div className="nav-perspective-label">
              <UserCog size={16} aria-hidden="true" />
              <span>{copy.administrator}</span>
            </div>
          </div>
          <nav className="nav-section" aria-label={copy.administratorNavigation}>
            {navigationSections.map((section) => {
              const SectionIcon = sectionIcons[section];
              const expanded = expandedSections.includes(section);
              const sectionLabel = language === "ko" ? sectionLabelsKo[section] : section;
              return (
                <div className="nav-group" key={section}>
                  <button
                    aria-controls={`console-nav-section-items-${sectionTestId(section)}`}
                    aria-expanded={expanded}
                    aria-label={navCollapsed ? sectionLabel : undefined}
                    className="nav-heading"
                    data-testid={`console-nav-section-${sectionTestId(section)}`}
                    data-section-expanded={expanded}
                    title={sectionLabel}
                    type="button"
                    onClick={() => toggleNavigationSection(section)}
                  >
                    <SectionIcon className="nav-section-icon" size={16} aria-hidden="true" />
                    <span className="nav-heading-label">{sectionLabel}</span>
                    {expanded ? (
                      <ChevronDown
                        className="nav-heading-chevron"
                        size={15}
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="nav-heading-chevron"
                        size={15}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <div
                    className="nav-group-items"
                    hidden={!expanded}
                    id={`console-nav-section-items-${sectionTestId(section)}`}
                  >
                    {consoleNavigation
                      .filter((item) => item.section === section)
                      .map((item) => (
                        <button
                          aria-current={activeNavId === item.id ? "page" : undefined}
                          className={`nav-item ${activeNavId === item.id ? "active" : ""}`}
                          data-testid={`console-nav-${item.id}`}
                          key={item.id}
                          type="button"
                          onClick={() => activateNavigation(item)}
                        >
                          {navLabel(item, language)}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <button
            className="native-console-return"
            type="button"
            data-testid="ocp-console-return"
            title={copy.ocpConsoleReturnCommand}
            aria-label={copy.ocpConsoleReturn}
            onClick={openNativeOcpConsole}
          >
            <Undo2 size={16} aria-hidden="true" />
            <span>{copy.ocpConsoleReturn}</span>
          </button>
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
            <OcpConsoleActionPanel
              activeItem={activeNavigation}
              language={language}
              resourceFunctionOutcome={resourceFunctionOutcome}
              targetStatus={activeTargetStatus}
              onOpenSurface={openActiveNavigationSurface}
              onAskAssistant={askAssistantForActiveNavigation}
            />
            <div
              className="active-surface"
              data-active-nav-id={activeNavigation.id}
              data-testid={`active-surface-${activeNavigation.actionSurface}`}
              key={activeNavigation.id}
            >
              <div
                className="active-page"
                data-testid={`active-page-${activeNavigation.id}`}
              >
                {renderActiveSurface()}
              </div>
            </div>
          </section>
        </main>
      </div>

      {assistantOpen ? (
        <AssistantPopover
          draft={draft}
          turns={assistantTurns}
          contextChips={contextSync?.contextChips ?? contextChips}
          answer={
            planResponse?.answer ??
            createLightspeedUnavailablePlan({ language, prompt: draft }).answer
          }
          requestId={planResponse?.requestId ?? "plan-loading"}
          audit={planResponse?.audit ?? null}
          apiStatus={apiStatus}
          busy={assistantBusy}
          model={planResponse?.audit.model ?? "pending"}
          mode={assistantMode}
          language={language}
          apiRouteMode={apiRoute.mode}
          actionPlanPath={apiRoute.actionPlanPath}
          lastApiError={lastApiError}
          onModeChange={setAssistantMode}
          onDraftChange={setDraft}
          onAsk={(promptOverride) => void askAssistant(promptOverride)}
          onStop={stopAssistant}
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
