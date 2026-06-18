import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import { RefreshCw, Route, ServerCog, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";

interface OpsLensLiveInstallStatusProps {
  language: UiLanguage;
}

interface WorkloadSignal {
  name: string;
  ready: number;
  desired: number;
  status: "ready" | "blocked" | "missing";
}

interface PodSignal {
  name: string;
  component: string;
  phase: string;
  ready: boolean;
  reason: string;
}

interface LiveInstallState {
  loading: boolean;
  error: string | null;
  installationCount: number;
  installedVersion: string;
  installedPhase: string;
  workloads: WorkloadSignal[];
  pods: PodSignal[];
  routeCount: number;
  reachable: boolean;
  lastCheckedAt: string | null;
}

const copy = {
  en: {
    eyebrow: "Live CRC install signal",
    title: "OpsLensInstallation Status",
    refresh: "Refresh",
    loading: "checking",
    connected: "OCP API live",
    disconnected: "OCP check needed",
    readOnly: "read-only",
    installation: "installation",
    version: "version",
    phase: "phase",
    workloads: "workloads",
    route: "dashboard route",
    pods: "pods",
    ready: "ready",
    blocked: "blocked",
    missing: "missing",
    none: "none",
    lastChecked: "checked",
    noInstall: "No OpsLensInstallation found in cywell-opslens.",
    routeMissing: "Route missing",
    routeReady: "Route present",
    source: "source: live OCP resource API"
  },
  ko: {
    eyebrow: "CRC 실시간 설치 신호",
    title: "OpsLensInstallation 상태",
    refresh: "새로고침",
    loading: "확인 중",
    connected: "OCP API 실시간",
    disconnected: "OCP 확인 필요",
    readOnly: "읽기 전용",
    installation: "설치 객체",
    version: "버전",
    phase: "단계",
    workloads: "워크로드",
    route: "대시보드 Route",
    pods: "파드",
    ready: "준비",
    blocked: "막힘",
    missing: "없음",
    none: "없음",
    lastChecked: "확인",
    noInstall: "cywell-opslens 네임스페이스에 OpsLensInstallation이 없습니다.",
    routeMissing: "Route 없음",
    routeReady: "Route 있음",
    source: "출처: 실시간 OCP 리소스 API"
  }
} as const;

function objectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function stringValue(value: unknown, fallback = "-") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isPodReady(item: OcpResourceSummary) {
  const status = item.status;
  const conditions = objectValue(status, "conditions");
  if (!Array.isArray(conditions)) {
    return false;
  }
  return conditions.some((condition) => {
    if (!condition || typeof condition !== "object") {
      return false;
    }
    return (
      objectValue(condition, "type") === "Ready" &&
      objectValue(condition, "status") === "True"
    );
  });
}

function podReason(item: OcpResourceSummary) {
  const containerStatuses = objectValue(item.status, "containerStatuses");
  if (!Array.isArray(containerStatuses)) {
    return stringValue(objectValue(item.status, "phase"), "unknown");
  }

  for (const container of containerStatuses) {
    const state = objectValue(container, "state");
    const waiting = objectValue(state, "waiting");
    if (waiting && typeof waiting === "object") {
      return stringValue(objectValue(waiting, "reason"), "waiting");
    }
  }

  return isPodReady(item) ? "Ready" : stringValue(objectValue(item.status, "phase"), "unknown");
}

function deploymentSignal(item: OcpResourceSummary): WorkloadSignal {
  const status = item.status;
  const spec = item.spec;
  const desired = Math.max(
    numberValue(objectValue(spec, "replicas")),
    numberValue(objectValue(status, "replicas"))
  );
  const ready = numberValue(objectValue(status, "readyReplicas"));
  return {
    name: item.metadata.name,
    ready,
    desired,
    status: desired > 0 && ready >= desired ? "ready" : "blocked"
  };
}

function podSignal(item: OcpResourceSummary): PodSignal {
  return {
    name: item.metadata.name,
    component: stringValue(item.metadata.labels?.["app.kubernetes.io/component"], "component"),
    phase: stringValue(objectValue(item.status, "phase"), "unknown"),
    ready: isPodReady(item),
    reason: podReason(item)
  };
}

function summarizeInstallation(items: OcpResourceSummary[]) {
  const install = items[0];
  const status = install?.status;
  const spec = install?.spec;
  return {
    count: items.length,
    version: stringValue(objectValue(spec, "version"), stringValue(objectValue(status, "version"), "-")),
    phase: stringValue(objectValue(status, "phase"), items.length ? "Observed" : "Missing")
  };
}

async function loadLiveInstallState(): Promise<LiveInstallState> {
  const [installations, deployments, pods, routes] = await Promise.all([
    fetchOcpResourceList({
      apiVersion: "opslens.cywell.io/v1alpha1",
      resource: "opslensinstallations",
      namespace: "cywell-opslens",
      limit: 10,
      full: true
    }),
    fetchOcpResourceList({
      apiVersion: "apps/v1",
      resource: "deployments",
      namespace: "cywell-opslens",
      limit: 20,
      full: true
    }),
    fetchOcpResourceList({
      apiVersion: "v1",
      resource: "pods",
      namespace: "cywell-opslens",
      limit: 30,
      full: true
    }),
    fetchOcpResourceList({
      apiVersion: "route.openshift.io/v1",
      resource: "routes",
      namespace: "cywell-opslens",
      limit: 20,
      full: true
    })
  ]);

  const installation = summarizeInstallation(installations.items);
  return {
    loading: false,
    error: null,
    installationCount: installation.count,
    installedVersion: installation.version,
    installedPhase: installation.phase,
    workloads: deployments.items.map(deploymentSignal),
    pods: pods.items.map(podSignal),
    routeCount: routes.items.length,
    reachable:
      installations.status.reachable &&
      deployments.status.reachable &&
      pods.status.reachable &&
      routes.status.reachable,
    lastCheckedAt: new Date().toLocaleTimeString()
  };
}

function emptyState(): LiveInstallState {
  return {
    loading: true,
    error: null,
    installationCount: 0,
    installedVersion: "-",
    installedPhase: "-",
    workloads: [],
    pods: [],
    routeCount: 0,
    reachable: false,
    lastCheckedAt: null
  };
}

function statusText(language: UiLanguage, status: WorkloadSignal["status"]) {
  return copy[language][status];
}

export function OpsLensLiveInstallStatus({
  language
}: OpsLensLiveInstallStatusProps) {
  const [state, setState] = useState<LiveInstallState>(emptyState);
  const labels = copy[language];

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      setState(await loadLiveInstallState());
    } catch (error) {
      setState({
        ...emptyState(),
        loading: false,
        error: error instanceof Error ? error.message : "live install status failed",
        lastCheckedAt: new Date().toLocaleTimeString()
      });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const readyWorkloads = useMemo(
    () => state.workloads.filter((workload) => workload.status === "ready").length,
    [state.workloads]
  );
  const readyPods = useMemo(
    () => state.pods.filter((pod) => pod.ready).length,
    [state.pods]
  );
  const blockedPods = state.pods.filter((pod) => !pod.ready).slice(0, 3);

  return (
    <section
      className="live-install-status"
      data-testid="opslens-live-install-status"
      aria-labelledby="opslens-live-install-status-title"
    >
      <div className="live-install-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h2 id="opslens-live-install-status-title">{labels.title}</h2>
        </div>
        <div className="live-install-actions">
          <span
            className={`status-pill ${state.reachable ? "ready" : "warning"}`}
            data-testid="opslens-live-install-ocp"
          >
            <ServerCog size={15} aria-hidden="true" />
            {state.reachable ? labels.connected : labels.disconnected}
          </span>
          <span className="status-pill read-only" data-testid="opslens-live-install-boundary">
            <ShieldCheck size={15} aria-hidden="true" />
            {labels.readOnly}
          </span>
          <button
            className="text-icon-button"
            type="button"
            data-testid="opslens-live-install-refresh"
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {labels.refresh}
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="live-install-error" data-testid="opslens-live-install-error">
          {state.error}
        </div>
      ) : null}

      <div className="live-install-grid">
        <div className="live-install-metric" data-testid="opslens-live-install-cr">
          <span>{labels.installation}</span>
          <strong>
            {state.loading ? labels.loading : state.installationCount || labels.none}
          </strong>
        </div>
        <div className="live-install-metric" data-testid="opslens-live-install-version">
          <span>{labels.version}</span>
          <strong>{state.loading ? labels.loading : state.installedVersion}</strong>
        </div>
        <div className="live-install-metric" data-testid="opslens-live-install-phase">
          <span>{labels.phase}</span>
          <strong>{state.loading ? labels.loading : state.installedPhase}</strong>
        </div>
        <div className="live-install-metric" data-testid="opslens-live-install-workloads">
          <span>{labels.workloads}</span>
          <strong>
            {state.loading
              ? labels.loading
              : `${readyWorkloads}/${state.workloads.length} ${labels.ready}`}
          </strong>
        </div>
        <div className="live-install-metric" data-testid="opslens-live-install-pods">
          <span>{labels.pods}</span>
          <strong>
            {state.loading ? labels.loading : `${readyPods}/${state.pods.length} ${labels.ready}`}
          </strong>
        </div>
        <div className="live-install-metric" data-testid="opslens-live-install-route">
          <span>{labels.route}</span>
          <strong>
            <Route size={15} aria-hidden="true" />
            {state.loading
              ? labels.loading
              : state.routeCount > 0
                ? labels.routeReady
                : labels.routeMissing}
          </strong>
        </div>
      </div>

      <div className="live-install-workloads" data-testid="opslens-live-install-workload-list">
        {state.workloads.map((workload) => (
          <span className={`status-pill ${workload.status === "ready" ? "ready" : "warning"}`} key={workload.name}>
            {workload.name}: {workload.ready}/{workload.desired} {statusText(language, workload.status)}
          </span>
        ))}
      </div>

      {blockedPods.length ? (
        <div className="live-install-blockers" data-testid="opslens-live-install-blockers">
          {blockedPods.map((pod) => (
            <span className="status-pill warning" key={pod.name}>
              {pod.component}: {pod.reason}
            </span>
          ))}
        </div>
      ) : null}

      <div className="live-install-source" data-testid="opslens-live-install-source">
        <span>{labels.source}</span>
        {state.lastCheckedAt ? (
          <span>
            {labels.lastChecked}: {state.lastCheckedAt}
          </span>
        ) : null}
      </div>

      {!state.loading && state.installationCount === 0 ? (
        <p className="muted-warning">{labels.noInstall}</p>
      ) : null}
    </section>
  );
}
