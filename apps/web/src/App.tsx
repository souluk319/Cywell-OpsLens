import { useEffect, useMemo, useState } from "react";
import type {
  ActionPlanResponse,
  ContextSyncResponse,
  DashboardRisksResponse
} from "@kugnus/contracts";
import {
  assistantAnswer,
  contextChips,
  mockContext,
  mockDashboardResponse
} from "@kugnus/contracts";
import {
  Bell,
  Bot,
  CircleHelp,
  Grid3X3,
  Menu,
  ShieldCheck
} from "lucide-react";
import { AssistantPopover } from "./components/AssistantPopover";
import { ConsoleEvidencePane } from "./components/ConsoleEvidencePane";
import { OcpConsoleOverview } from "./components/OcpConsoleOverview";
import { OcpCoverageMatrix } from "./components/OcpCoverageMatrix";
import { OcpResourceExplorer } from "./components/OcpResourceExplorer";
import { OpsLensAdminDashboard } from "./components/OpsLensAdminDashboard";
import { OperationsDashboard } from "./components/OperationsDashboard";
import {
  createActionPlan,
  fetchDashboardRisks,
  syncConsoleContext
} from "./lib/api";

export default function App() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draft, setDraft] = useState(
    "ClusterNotUpgradeable alert를 근거 중심으로 triage 해줘."
  );
  const [evidenceView, setEvidenceView] = useState<"alerts" | "logs" | "yaml">(
    "alerts"
  );
  const [dashboard, setDashboard] =
    useState<DashboardRisksResponse>(mockDashboardResponse);
  const [contextSync, setContextSync] = useState<ContextSyncResponse | null>(
    null
  );
  const [planResponse, setPlanResponse] = useState<ActionPlanResponse | null>(
    null
  );
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
  }, [draft]);

  const contextPayload = useMemo(
    () => JSON.stringify(contextSync?.context ?? mockContext, null, 2),
    [contextSync]
  );
  const evidenceCount = (contextSync?.context ?? mockContext).attachedEvidence.length;

  return (
    <div className={`app-shell ${assistantOpen ? "assistant-popover-open" : ""}`}>
      <header className="masthead" data-testid="masthead">
        <div className="masthead-left">
          <button className="icon-button masthead-menu" type="button" aria-label="Open navigation">
            <Menu size={20} aria-hidden="true" />
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
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Application launcher"
            aria-label="Application launcher"
          >
            <Grid3X3 size={18} aria-hidden="true" />
          </button>
          <span className="user-menu">admin</span>
        </div>
      </header>

      <div className="console-frame">
        <aside className="console-nav" aria-label="OpenShift navigation">
          <div className="nav-perspective">
            <span>Administrator</span>
          </div>
          <nav className="nav-section" aria-label="Administrator navigation">
            <span className="nav-heading">Home</span>
            <span className="nav-item">Overview</span>
            <span className="nav-heading">Observe</span>
            <span className="nav-item active">Alerting</span>
            <span className="nav-item">Dashboards</span>
            <span className="nav-item">Metrics</span>
            <span className="nav-item">Logs</span>
            <span className="nav-heading">Resources</span>
            <span className="nav-item">Workloads</span>
            <span className="nav-item">Networking</span>
            <span className="nav-item">Storage</span>
            <span className="nav-item">Administration</span>
            <span className="nav-heading">Cywell</span>
            <span className="nav-item">OpsLens Admin</span>
          </nav>
        </aside>

        <main className="workspace" data-testid="workspace">
          <section className="main-stage" data-testid="main-stage">
            <div className="breadcrumb-row" aria-label="Breadcrumb">
              <span>Observe</span>
              <span>Alerting</span>
            </div>
            <OperationsDashboard dashboard={dashboard} />
            <OpsLensAdminDashboard />
            <ConsoleEvidencePane
              contextPayload={contextPayload}
              activeRisks={dashboard.activeRisks}
              evidenceView={evidenceView}
              onEvidenceViewChange={setEvidenceView}
              onAsk={() => setAssistantOpen(true)}
            />
            <OcpConsoleOverview />
            <OcpCoverageMatrix />
            <OcpResourceExplorer />
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
          onDraftChange={setDraft}
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
