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
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  CircleHelp,
  DatabaseZap,
  Gauge,
  Grid3X3,
  HardDrive,
  Menu,
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
  syncConsoleContext
} from "./lib/api";

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
  icon: LucideIcon;
  targetSelector: string;
  breadcrumb: string[];
  command: string;
  evidenceView?: EvidenceView;
  resourcePreset?: Omit<OcpResourcePreset, "activationId">;
}

const consoleNavigation: ConsoleNavigationItem[] = [
  {
    id: "overview",
    section: "Home",
    label: "Overview",
    icon: ServerCog,
    targetSelector: "#ocp-console-overview-title",
    breadcrumb: ["Home", "Overview"],
    command: "Open live cluster summary with evidence-backed availability signals."
  },
  {
    id: "alerting",
    section: "Observe",
    label: "Alerting",
    icon: AlertTriangle,
    targetSelector: "#evidence-title",
    breadcrumb: ["Observe", "Alerting"],
    command: "Inspect firing alerts and keep the assistant off the evidence table.",
    evidenceView: "alerts"
  },
  {
    id: "dashboards",
    section: "Observe",
    label: "Dashboards",
    icon: TableProperties,
    targetSelector: "#dashboard-title",
    breadcrumb: ["Observe", "Dashboards"],
    command: "Return to the OpsLens operations dashboard and triage queue."
  },
  {
    id: "metrics",
    section: "Observe",
    label: "Metrics",
    icon: Activity,
    targetSelector: "[data-testid='opslens-incident-metrics']",
    breadcrumb: ["Observe", "Metrics"],
    command: "Jump to metric queries, incident scoring, and read-only pipeline evidence."
  },
  {
    id: "logs",
    section: "Observe",
    label: "Logs",
    icon: ScrollText,
    targetSelector: "#evidence-title",
    breadcrumb: ["Observe", "Logs"],
    command: "Switch the evidence pane to pod logs before asking for a plan.",
    evidenceView: "logs"
  },
  {
    id: "workloads",
    section: "Resources",
    label: "Workloads",
    icon: Boxes,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Workloads"],
    command: "Preset the read-only explorer to pods and deployments.",
    resourcePreset: {
      query: "deployments pods replicasets",
      preferredResources: ["apps/v1/deployments", "v1/pods", "apps/v1/replicasets"]
    }
  },
  {
    id: "networking",
    section: "Resources",
    label: "Networking",
    icon: Network,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Networking"],
    command: "Preset the read-only explorer to routes, services, and ingresses.",
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
    icon: HardDrive,
    targetSelector: "#ocp-explorer-title",
    breadcrumb: ["Resources", "Storage"],
    command: "Preset the read-only explorer to PVC, PV, and StorageClass resources.",
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
    icon: ShieldCheck,
    targetSelector: "#opslens-admin-title",
    breadcrumb: ["Resources", "Administration"],
    command: "Review RBAC, install readiness, release evidence, and approval gates."
  },
  {
    id: "opslens-admin",
    section: "Cywell",
    label: "OpsLens Admin",
    icon: DatabaseZap,
    targetSelector: "#opslens-admin-title",
    breadcrumb: ["Cywell", "OpsLens Admin"],
    command: "Operate the OpsLens RAG, evaluation, runtime, and 100% closure dashboard."
  },
  {
    id: "opsbrain",
    section: "Cywell",
    label: "OpsBrain",
    icon: Bot,
    targetSelector: "[data-testid='opslens-opsbrain-system']",
    breadcrumb: ["Cywell", "OpsBrain"],
    command: "Open the no-fine-tuning growth loop: memory, evaluator, risk gate, and required keys."
  }
];

const navigationSections = ["Home", "Observe", "Resources", "Cywell"] as const;

function findNavigationItem(id: ConsoleNavId) {
  return (
    consoleNavigation.find((item) => item.id === id) ?? consoleNavigation[1]
  );
}

export default function App() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draft, setDraft] = useState(
    "ClusterNotUpgradeable alert를 근거 중심으로 triage 해줘."
  );
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("alerts");
  const [activeNavId, setActiveNavId] = useState<ConsoleNavId>("alerting");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navigationCommand, setNavigationCommand] = useState(
    findNavigationItem("alerting").command
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

  useEffect(() => {
    let active = true;

    async function bootstrapApiState() {
      try {
        const [contextResponse, plan] = await Promise.all([
          syncConsoleContext({ context: mockContext }),
          createActionPlan({
            prompt: draft,
            context: mockContext,
            scenario: "ClusterNotUpgradeable"
          })
        ]);

        if (!active) {
          return;
        }

        setContextSync(contextResponse);
        setPlanResponse(plan);
        setApiStatus("ready");

        fetchDashboardRisks()
          .then((dashboardResponse) => {
            if (active) {
              setDashboard(dashboardResponse);
            }
          })
          .catch(() => {
            if (active) {
              setDashboard(mockDashboardResponse);
            }
          });

        fetchOpsLensAdminOverview()
          .then((overviewResponse) => {
            if (active) {
              setAdminOverview(overviewResponse);
            }
          })
          .catch(() => {
            if (active) {
              setAdminOverview(null);
            }
          });
      } catch {
        if (!active) {
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
      }
    }

    void bootstrapApiState();

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
    } catch {
      setApiStatus("fallback");
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
      document
        .querySelector(targetSelector)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function activateNavigation(item: ConsoleNavigationItem) {
    setActiveNavId(item.id);
    setNavigationCommand(item.command);
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
            aria-label={navCollapsed ? "Open navigation" : "Collapse navigation"}
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
              K
            </span>
            <div>
              <p className="eyebrow">Red Hat OpenShift</p>
              <h1>Cywell OpsLens</h1>
            </div>
          </div>
          <div className="cluster-context" data-testid="console-perspective">
            <strong>Administrator</strong>
            <span>prod-ocp / openshift-cluster-version</span>
          </div>
        </div>
        <div className="masthead-actions" aria-label="Console utilities">
          <span
            className={`status-pill ${apiStatus === "ready" ? "ready" : "danger"}`}
            data-testid="api-status"
          >
            API {apiStatus}
          </span>
          <span className="status-pill read-only">
            <ShieldCheck size={15} aria-hidden="true" />
            read-only
          </span>
          <button
            className="icon-button"
            type="button"
            title="Help"
            aria-label="Help"
            onClick={() =>
              runUtilityAction(
                "Help opened the context-aware assistant in read-only mode.",
                "#evidence-title",
                true
              )
            }
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Notifications"
            aria-label="Notifications"
            onClick={() =>
              runUtilityAction(
                "Notifications focused the active incident queue and firing alerts.",
                "#dashboard-title"
              )
            }
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Application launcher"
            aria-label="Application launcher"
            onClick={() =>
              runUtilityAction(
                "Application launcher focused the OpsLens readiness command strip.",
                "[data-testid='opslens-readiness-command-strip']"
              )
            }
          >
            <Grid3X3 size={18} aria-hidden="true" />
          </button>
          <span className="user-menu">admin</span>
        </div>
      </header>

      <div className={`console-frame ${navCollapsed ? "nav-collapsed" : ""}`}>
        <aside
          className="console-nav"
          aria-label="OpenShift navigation"
          data-testid="console-nav"
        >
          <div className="nav-perspective">
            <span>Administrator</span>
          </div>
          <nav className="nav-section" aria-label="Administrator navigation">
            {navigationSections.map((section) => (
              <div className="nav-group" key={section}>
                <span className="nav-heading">{section}</span>
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
                        {item.label}
                      </button>
                    );
                  })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="workspace" data-testid="workspace">
          <section className="main-stage" data-testid="main-stage">
            <div className="breadcrumb-row" aria-label="Breadcrumb">
              {activeNavigation.breadcrumb.map((crumb) => (
                <span key={crumb}>{crumb}</span>
              ))}
            </div>
            <div
              className="navigation-command-bar"
              data-testid="console-navigation-feedback"
            >
              <span>Active surface</span>
              <strong>{activeNavigation.label}</strong>
              <span>{navigationCommand}</span>
            </div>
            <section
              className="readiness-command-strip"
              data-testid="opslens-readiness-command-strip"
              aria-label="Cywell OpsLens readiness"
            >
              <div className="readiness-command-main">
                <div>
                  <p className="eyebrow">Cywell OpsLens</p>
                  <h2>100% Readiness</h2>
                </div>
                <span
                  className={`freshness ${statusClass(completionGate?.status)}`}
                >
                  {completionGate?.status ?? "loading"}
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
                  remaining=
                  {completionGate?.remainingRequirements ?? "--"}
                </span>
                <span>next={nextGateLabel(adminOverview)}</span>
                <span>cmd={firstNextCommand(adminOverview)}</span>
              </div>
              <a
                className="text-icon-button readiness-jump"
                href="#opslens-admin-title"
                data-testid="opslens-readiness-jump"
              >
                <Waypoints size={15} aria-hidden="true" />
                Closure
              </a>
            </section>
            <OperationsDashboard dashboard={dashboard} />
            <OpsLensAdminDashboard />
            <ConsoleEvidencePane
              contextPayload={contextPayload}
              activeRisks={dashboard.activeRisks}
              evidenceView={evidenceView}
              onEvidenceViewChange={setEvidenceView}
              onAsk={openAssistantFromEvidence}
            />
            <OcpConsoleOverview />
            <OcpCoverageMatrix />
            <OcpResourceExplorer navigationPreset={resourcePreset} />
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
          onDraftChange={setDraft}
          onAsk={() => void askAssistant()}
          onClose={() => setAssistantOpen(false)}
        />
      ) : null}
      <button
        aria-controls="kugnus-assistant-popover"
        aria-expanded={assistantOpen}
        aria-label={assistantOpen ? "Close Cywell OpsLens assistant" : "Open Cywell OpsLens assistant"}
        className="lightspeed-launcher"
        data-testid="assistant-launcher"
        title="Cywell OpsLens assistant"
        type="button"
        onClick={() => setAssistantOpen((open) => !open)}
      >
        <Bot size={22} aria-hidden="true" />
        <strong>{evidenceCount}</strong>
      </button>
    </div>
  );
}
