import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  AlertTriangle,
  Filter,
  Globe2,
  Network,
  RefreshCw,
  Route,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import { OcpNativeObjectDrilldown } from "./OcpNativeObjectDrilldown";

export type OcpNetworkingView = "routes" | "services" | "ingresses" | "network-policies";

interface OcpNetworkingConsoleProps {
  language: UiLanguage;
  view: OcpNetworkingView;
}

interface ResourceState {
  routes?: OcpResourceListResponse;
  services?: OcpResourceListResponse;
  endpoints?: OcpResourceListResponse;
  endpointSlices?: OcpResourceListResponse;
  ingresses?: OcpResourceListResponse;
  networkPolicies?: OcpResourceListResponse;
  dnses?: OcpResourceListResponse;
}

const networkingCopy = {
  en: {
    eyebrow: "Networking",
    title: "OpenShift Networking",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    routes: "Routes",
    services: "Services",
    ingresses: "Ingresses",
    "network-policies": "NetworkPolicies",
    namespace: "Namespace",
    host: "Host",
    service: "Service",
    targetPort: "Target port",
    tls: "TLS",
    type: "Type",
    clusterIp: "Cluster IP",
    selector: "Selector",
    ports: "Ports",
    endpoints: "Endpoints",
    backend: "Backend",
    rules: "Rules",
    policyTypes: "Policy types",
    ingressRules: "Ingress",
    egressRules: "Egress",
    podSelector: "Pod selector",
    noRoutes: "No Routes were returned by the cluster.",
    noServices: "No Services were returned by the cluster.",
    noIngresses: "No Ingresses were returned by the cluster.",
    noPolicies: "No NetworkPolicies were returned by the cluster.",
    routeFlow: "Route exposure",
    serviceFlow: "Service selection",
    policyFlow: "Network isolation",
    dashboardFlow: "Network dashboard",
    routeFlowBody: "OpenShift Routes expose a Service at a public URL with optional TLS termination.",
    serviceFlowBody: "Services bind selector labels and ports to Endpoints or EndpointSlices.",
    policyFlowBody: "NetworkPolicy objects define allowed ingress and egress connections for selected Pods.",
    dashboardFlowBody: "Networking dashboards cover utilization, saturation, errors, OVN-Kubernetes, and Ingress metrics when available.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Create, edit, and delete remain native OpenShift actions. OpsLens keeps the route/service/policy graph read-only and prepares approval-gated change plans.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "네트워킹",
    title: "OpenShift 네트워킹",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    routes: "라우트",
    services: "서비스",
    ingresses: "인그레스",
    "network-policies": "네트워크 정책",
    namespace: "네임스페이스",
    host: "호스트",
    service: "서비스",
    targetPort: "대상 포트",
    tls: "TLS",
    type: "유형",
    clusterIp: "Cluster IP",
    selector: "Selector",
    ports: "포트",
    endpoints: "Endpoint",
    backend: "Backend",
    rules: "규칙",
    policyTypes: "정책 유형",
    ingressRules: "Ingress",
    egressRules: "Egress",
    podSelector: "Pod selector",
    noRoutes: "클러스터에서 반환된 Route가 없습니다.",
    noServices: "클러스터에서 반환된 Service가 없습니다.",
    noIngresses: "클러스터에서 반환된 Ingress가 없습니다.",
    noPolicies: "클러스터에서 반환된 NetworkPolicy가 없습니다.",
    routeFlow: "Route 노출",
    serviceFlow: "Service 선택",
    policyFlow: "네트워크 격리",
    dashboardFlow: "네트워크 대시보드",
    routeFlowBody: "OpenShift Route는 선택적으로 TLS termination을 적용해 Service를 공개 URL로 노출합니다.",
    serviceFlowBody: "Service는 selector label과 port를 Endpoint 또는 EndpointSlice에 연결합니다.",
    policyFlowBody: "NetworkPolicy는 선택된 Pod에 허용되는 ingress/egress 연결을 정의합니다.",
    dashboardFlowBody: "네트워킹 대시보드는 사용량, 포화도, 오류, OVN-Kubernetes, Ingress 지표를 제공 가능한 경우 표시합니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "생성, 수정, 삭제는 OpenShift 원본 기능으로 남깁니다. OpsLens는 Route/Service/Policy 그래프를 읽기 전용으로 유지하고 승인 기반 변경 계획을 준비합니다.",
    apiFailure: "API 조회 실패"
  }
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function nameRef(value: unknown) {
  const record = asRecord(value);
  return stringField(record, "name") ?? stringField(record, "kind") ?? "-";
}

function selectorText(value: unknown) {
  const selector = asRecord(value);
  const entries = Object.entries(selector).filter(([, entryValue]) => typeof entryValue === "string");
  return entries.length > 0
    ? entries.map(([key, entryValue]) => `${key}=${entryValue as string}`).join(", ")
    : "-";
}

function portsText(value: unknown) {
  const ports = Array.isArray(value) ? value : [];
  return ports
    .map((port) => {
      const record = asRecord(port);
      const protocol = stringField(record, "protocol") ?? "TCP";
      const portValue = record.port;
      const targetPort = record.targetPort;
      const renderedPort = typeof portValue === "number" || typeof portValue === "string" ? portValue : "-";
      const renderedTarget = typeof targetPort === "number" || typeof targetPort === "string" ? targetPort : renderedPort;
      return `${protocol} ${renderedPort}->${renderedTarget}`;
    })
    .join(", ") || "-";
}

function routeHost(item: OcpResourceSummary) {
  return stringField(item.spec, "host") ?? "-";
}

function routeService(item: OcpResourceSummary) {
  return nameRef(asRecord(item.spec).to);
}

function routeTargetPort(item: OcpResourceSummary) {
  const port = asRecord(asRecord(item.spec).port);
  return stringField(port, "targetPort") ?? "-";
}

function routeTls(item: OcpResourceSummary) {
  const tls = asRecord(item.spec).tls;
  return tls ? stringField(tls, "termination") ?? "configured" : "-";
}

function serviceType(item: OcpResourceSummary) {
  return stringField(item.spec, "type") ?? "ClusterIP";
}

function serviceSelector(item: OcpResourceSummary) {
  return selectorText(asRecord(item.spec).selector);
}

function servicePorts(item: OcpResourceSummary) {
  return portsText(asRecord(item.spec).ports);
}

function serviceEndpointCount(service: OcpResourceSummary, endpoints: OcpResourceSummary[], endpointSlices: OcpResourceSummary[]) {
  const matchedEndpoints = endpoints.filter(
    (endpoint) =>
      endpoint.metadata.name === service.metadata.name &&
      endpoint.metadata.namespace === service.metadata.namespace
  );
  const legacyCount = matchedEndpoints.reduce((count, endpoint) => {
    return (
      count +
      arrayField(endpoint.spec, "subsets").reduce<number>((subsetCount, subset) => {
        return subsetCount + arrayField(subset, "addresses").length;
      }, 0)
    );
  }, 0);
  const sliceCount = endpointSlices.reduce((count, slice) => {
    const labels = asRecord(slice.metadata.labels);
    if (
      labels["kubernetes.io/service-name"] !== service.metadata.name ||
      slice.metadata.namespace !== service.metadata.namespace
    ) {
      return count;
    }
    return count + arrayField(slice.spec, "endpoints").length;
  }, 0);
  return legacyCount + sliceCount;
}

function ingressHosts(item: OcpResourceSummary) {
  const hosts = arrayField(item.spec, "rules")
    .map((rule) => stringField(rule, "host"))
    .filter(Boolean);
  return hosts.join(", ") || "-";
}

function ingressBackend(item: OcpResourceSummary) {
  const backend = asRecord(asRecord(item.spec).defaultBackend);
  const service = asRecord(backend.service);
  if (service.name) return String(service.name);
  const firstRule = asRecord(arrayField(item.spec, "rules")[0]);
  const paths = arrayField(asRecord(firstRule.http), "paths");
  const firstService = asRecord(asRecord(asRecord(paths[0]).backend).service);
  return typeof firstService.name === "string" ? firstService.name : "-";
}

function policySelector(item: OcpResourceSummary) {
  return selectorText(asRecord(asRecord(item.spec).podSelector).matchLabels);
}

function policyTypes(item: OcpResourceSummary) {
  return arrayField(item.spec, "policyTypes").join(", ") || "-";
}

function ruleCount(item: OcpResourceSummary, key: "ingress" | "egress") {
  return arrayField(item.spec, key).length;
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.routes?.status.reachable ||
      state.services?.status.reachable ||
      state.ingresses?.status.reachable ||
      state.networkPolicies?.status.reachable
  );
}

function viewTestId(view: OcpNetworkingView) {
  return `ocp-networking-${view}`;
}

export function OcpNetworkingConsole({ language, view }: OcpNetworkingConsoleProps) {
  const copy = networkingCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({ apiVersion: "route.openshift.io/v1", resource: "routes", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "services", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "endpoints", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "discovery.k8s.io/v1", resource: "endpointslices", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "networking.k8s.io/v1", resource: "ingresses", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "networking.k8s.io/v1", resource: "networkpolicies", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "config.openshift.io/v1", resource: "dnses", limit: 20, full: false })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      if (index === 0) next.routes = result.value;
      if (index === 1) next.services = result.value;
      if (index === 2) next.endpoints = result.value;
      if (index === 3) next.endpointSlices = result.value;
      if (index === 4) next.ingresses = result.value;
      if (index === 5) next.networkPolicies = result.value;
      if (index === 6) next.dnses = result.value;
    });

    setState(next);
    setErrors(nextErrors);
    if (!options.silent) setLoading(false);
  }

  useEffect(() => {
    void refresh();
    const refreshId = window.setInterval(() => {
      void refresh({ silent: true });
    }, 15000);
    return () => window.clearInterval(refreshId);
  }, []);

  const routes = state.routes?.items ?? [];
  const services = state.services?.items ?? [];
  const endpoints = state.endpoints?.items ?? [];
  const endpointSlices = state.endpointSlices?.items ?? [];
  const ingresses = state.ingresses?.items ?? [];
  const networkPolicies = state.networkPolicies?.items ?? [];
  const failureMessages = [
    failureText(state.routes),
    failureText(state.services),
    failureText(state.endpoints),
    failureText(state.endpointSlices),
    failureText(state.ingresses),
    failureText(state.networkPolicies),
    failureText(state.dnses),
    ...errors
  ].filter(Boolean);
  const drilldown =
    view === "routes"
      ? {
          resource: { apiVersion: "route.openshift.io/v1", resource: "routes" },
          items: routes,
          title: copy.routes
        }
      : view === "services"
        ? {
            resource: { apiVersion: "v1", resource: "services" },
            items: services,
            title: copy.services
          }
        : view === "ingresses"
          ? {
              resource: { apiVersion: "networking.k8s.io/v1", resource: "ingresses" },
              items: ingresses,
              title: copy.ingresses
            }
          : {
              resource: { apiVersion: "networking.k8s.io/v1", resource: "networkpolicies" },
              items: networkPolicies,
              title: copy["network-policies"]
            };

  const routeBackends = useMemo(() => {
    return new Set(routes.map(routeService).filter((service) => service !== "-"));
  }, [routes]);
  const exposedServices = services.filter((service) => routeBackends.has(service.metadata.name));
  const selectedRoute = routes[0];
  const selectedService = services[0];

  return (
    <section
      className="ocp-networking-console"
      data-testid={viewTestId(view)}
      aria-labelledby="ocp-networking-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-networking-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-networking-toolbar" data-testid="ocp-networking-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.routes}: {routes.length}</span>
        <span>{copy.services}: {services.length}</span>
        <span>{copy.ingresses}: {ingresses.length}</span>
        <span>{copy["network-policies"]}: {networkPolicies.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-networking-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-networking-tabs" aria-label={copy.title}>
        {(["routes", "services", "ingresses", "network-policies"] as const).map((tab) => (
          <a
            key={tab}
            href={`#${viewTestId(tab)}`}
            aria-current={view === tab ? "page" : undefined}
          >
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="networking-native-grid">
        <article className="networking-native-card" data-testid="ocp-networking-route-flow">
          <div className="card-title-row">
            <h3>{copy.routeFlow}</h3>
            <Route size={18} aria-hidden="true" />
          </div>
          <div className="network-route-flow">
            <div>
              <span>{copy.host}</span>
              <strong>{selectedRoute ? routeHost(selectedRoute) : "-"}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>{copy.service}</span>
              <strong>{selectedRoute ? routeService(selectedRoute) : selectedService?.metadata.name ?? "-"}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>{copy.endpoints}</span>
              <strong>{selectedService ? serviceEndpointCount(selectedService, endpoints, endpointSlices) : "-"}</strong>
            </div>
          </div>
          <p>{copy.routeFlowBody}</p>
        </article>

        <article className="networking-native-card">
          <div className="card-title-row">
            <h3>{copy.serviceFlow}</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          <p>{copy.serviceFlowBody}</p>
          <strong className="networking-card-number">{exposedServices.length}</strong>
        </article>

        <article className="networking-native-card">
          <div className="card-title-row">
            <h3>{copy.policyFlow}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>{copy.policyFlowBody}</p>
          <strong className="networking-card-number">{networkPolicies.length}</strong>
        </article>

        <article className="networking-native-card">
          <div className="card-title-row">
            <h3>{copy.dashboardFlow}</h3>
            <Globe2 size={18} aria-hidden="true" />
          </div>
          <p>{copy.dashboardFlowBody}</p>
        </article>
      </div>

      {view === "routes" ? (
        <article className="networking-native-panel">
          <div className="card-title-row">
            <h3>{copy.routes}</h3>
            <Route size={18} aria-hidden="true" />
          </div>
          {routes.length > 0 ? (
            <div className="native-networking-table-wrap">
              <table className="native-networking-table" data-testid="ocp-networking-routes-table">
                <thead>
                  <tr>
                    <th>{copy.routes}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.host}</th>
                    <th>{copy.service}</th>
                    <th>{copy.targetPort}</th>
                    <th>{copy.tls}</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{routeHost(item)}</td>
                      <td>{routeService(item)}</td>
                      <td>{routeTargetPort(item)}</td>
                      <td>{routeTls(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noRoutes}</p>
          )}
        </article>
      ) : null}

      {view === "services" ? (
        <article className="networking-native-panel">
          <div className="card-title-row">
            <h3>{copy.services}</h3>
            <Network size={18} aria-hidden="true" />
          </div>
          {services.length > 0 ? (
            <div className="native-networking-table-wrap">
              <table className="native-networking-table" data-testid="ocp-networking-services-table">
                <thead>
                  <tr>
                    <th>{copy.services}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.type}</th>
                    <th>{copy.clusterIp}</th>
                    <th>{copy.selector}</th>
                    <th>{copy.ports}</th>
                    <th>{copy.endpoints}</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{serviceType(item)}</td>
                      <td>{stringField(item.spec, "clusterIP") ?? "-"}</td>
                      <td>{serviceSelector(item)}</td>
                      <td>{servicePorts(item)}</td>
                      <td>{serviceEndpointCount(item, endpoints, endpointSlices)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noServices}</p>
          )}
        </article>
      ) : null}

      {view === "ingresses" ? (
        <article className="networking-native-panel">
          <div className="card-title-row">
            <h3>{copy.ingresses}</h3>
            <Globe2 size={18} aria-hidden="true" />
          </div>
          {ingresses.length > 0 ? (
            <div className="native-networking-table-wrap">
              <table className="native-networking-table" data-testid="ocp-networking-ingresses-table">
                <thead>
                  <tr>
                    <th>{copy.ingresses}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.host}</th>
                    <th>{copy.backend}</th>
                    <th>{copy.rules}</th>
                    <th>{copy.tls}</th>
                  </tr>
                </thead>
                <tbody>
                  {ingresses.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{ingressHosts(item)}</td>
                      <td>{ingressBackend(item)}</td>
                      <td>{arrayField(item.spec, "rules").length}</td>
                      <td>{arrayField(item.spec, "tls").length || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noIngresses}</p>
          )}
        </article>
      ) : null}

      {view === "network-policies" ? (
        <article className="networking-native-panel">
          <div className="card-title-row">
            <h3>{copy["network-policies"]}</h3>
            <Filter size={18} aria-hidden="true" />
          </div>
          {networkPolicies.length > 0 ? (
            <div className="native-networking-table-wrap">
              <table className="native-networking-table" data-testid="ocp-networking-policies-table">
                <thead>
                  <tr>
                    <th>{copy["network-policies"]}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.policyTypes}</th>
                    <th>{copy.podSelector}</th>
                    <th>{copy.ingressRules}</th>
                    <th>{copy.egressRules}</th>
                  </tr>
                </thead>
                <tbody>
                  {networkPolicies.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{policyTypes(item)}</td>
                      <td>{policySelector(item)}</td>
                      <td>{ruleCount(item, "ingress")}</td>
                      <td>{ruleCount(item, "egress")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noPolicies}</p>
          )}
        </article>
      ) : null}

      <OcpNativeObjectDrilldown
        language={language}
        resource={drilldown.resource}
        items={drilldown.items}
        title={drilldown.title}
        testId="ocp-networking-object"
      />

      <aside className="networking-native-boundary" data-testid="ocp-networking-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
