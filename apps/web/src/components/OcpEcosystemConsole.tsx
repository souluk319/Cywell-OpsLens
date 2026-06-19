import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  Boxes,
  ExternalLink,
  PackageSearch,
  RefreshCw,
  ScrollText,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import { NativeObjectLink } from "./NativeObjectLink";
import { OcpNativeObjectDrilldown } from "./OcpNativeObjectDrilldown";

export type OcpEcosystemView =
  | "software-catalog"
  | "operatorhub"
  | "installed-operators"
  | "helm";

interface OcpEcosystemConsoleProps {
  language: UiLanguage;
  view: OcpEcosystemView;
}

interface ResourceState {
  catalogSources?: OcpResourceListResponse;
  packageManifests?: OcpResourceListResponse;
  csvs?: OcpResourceListResponse;
  subscriptions?: OcpResourceListResponse;
  installPlans?: OcpResourceListResponse;
  operatorGroups?: OcpResourceListResponse;
  helmSecrets?: OcpResourceListResponse;
  helmConfigMaps?: OcpResourceListResponse;
}

const ecosystemCopy = {
  en: {
    eyebrow: "Ecosystem",
    title: "OpenShift Ecosystem",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    "software-catalog": "Software Catalog",
    operatorhub: "Operator catalog",
    "installed-operators": "Installed Operators",
    helm: "Helm",
    source: "Source",
    package: "Package",
    catalog: "Catalog",
    channel: "Channel",
    currentCsv: "Current CSV",
    provider: "Provider",
    namespace: "Namespace",
    phase: "Phase",
    installPlan: "InstallPlan",
    approval: "Approval",
    approved: "Approved",
    chart: "Chart",
    revision: "Revision",
    age: "Age",
    noCatalog: "No catalog entries were returned by the cluster.",
    noInstalled: "No installed operators were returned by the cluster.",
    noHelm: "No Helm release metadata was returned by the cluster.",
    nativeHandoff: "Native handoff",
    catalogBoundary:
      "Install, upgrade, channel change, and Helm release changes remain native OpenShift actions. OpsLens keeps catalog evidence read-only and prepares assisted diagnosis.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "에코시스템",
    title: "OpenShift 에코시스템",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    "software-catalog": "소프트웨어 카탈로그",
    operatorhub: "Operator 카탈로그",
    "installed-operators": "설치된 Operator",
    helm: "Helm",
    source: "소스",
    package: "패키지",
    catalog: "카탈로그",
    channel: "채널",
    currentCsv: "현재 CSV",
    provider: "공급자",
    namespace: "네임스페이스",
    phase: "상태",
    installPlan: "InstallPlan",
    approval: "승인 방식",
    approved: "승인됨",
    chart: "차트",
    revision: "리비전",
    age: "나이",
    noCatalog: "클러스터에서 반환된 카탈로그 항목이 없습니다.",
    noInstalled: "클러스터에서 반환된 설치 Operator가 없습니다.",
    noHelm: "클러스터에서 반환된 Helm release 메타데이터가 없습니다.",
    nativeHandoff: "원본 기능 연결",
    catalogBoundary:
      "설치, 업그레이드, 채널 변경, Helm release 변경은 OpenShift 원본 기능으로 남깁니다. OpsLens는 카탈로그 근거를 읽기 전용으로 유지하고 보조 진단을 준비합니다.",
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

function boolField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "boolean" ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function statusText(
  response: OcpResourceListResponse | undefined,
  labels: { loading: string; unavailable: string; live: string }
) {
  if (!response) return labels.loading;
  if (response.failure) return labels.unavailable;
  return labels.live;
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function ageText(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function packageProvider(item: OcpResourceSummary) {
  const status = asRecord(item.status);
  const provider = asRecord(status.provider);
  return stringField(provider, "name") ?? stringField(status, "provider") ?? "-";
}

function packageChannel(item: OcpResourceSummary) {
  const status = asRecord(item.status);
  return stringField(status, "defaultChannel") ?? "-";
}

function packageCurrentCsv(item: OcpResourceSummary) {
  const status = asRecord(item.status);
  const channels = arrayField(status, "channels").map((channel) => asRecord(channel));
  const defaultChannel = packageChannel(item);
  const selected = channels.find((channel) => channel.name === defaultChannel) ?? channels[0];
  return stringField(selected, "currentCSV") ?? "-";
}

function csvPhase(item: OcpResourceSummary) {
  return stringField(item.status, "phase") ?? "-";
}

function subscriptionChannel(item: OcpResourceSummary) {
  return stringField(item.spec, "channel") ?? "-";
}

function installPlanApproval(item: OcpResourceSummary) {
  return stringField(item.spec, "approval") ?? "-";
}

function helmChart(item: OcpResourceSummary) {
  const labels = item.metadata.labels ?? {};
  return (
    labels.name ??
    labels["helm.sh/chart"] ??
    labels["app.kubernetes.io/name"] ??
    item.metadata.name
  );
}

function helmRevision(item: OcpResourceSummary) {
  return item.metadata.labels?.version ?? item.metadata.labels?.["helm.sh/revision"] ?? "-";
}

function mergeItems(...responses: Array<OcpResourceListResponse | undefined>) {
  return responses.flatMap((response) => response?.items ?? []);
}

function resourceForEcosystemItem(item: OcpResourceSummary) {
  switch (item.kind) {
    case "CatalogSource":
      return "catalogsources";
    case "PackageManifest":
      return "packagemanifests";
    case "ClusterServiceVersion":
      return "clusterserviceversions";
    case "Subscription":
      return "subscriptions";
    case "InstallPlan":
      return "installplans";
    case "OperatorGroup":
      return "operatorgroups";
    case "Secret":
      return "secrets";
    case "ConfigMap":
      return "configmaps";
    default:
      return item.kind.toLowerCase();
  }
}

function ecosystemResourceRef(item: OcpResourceSummary) {
  return {
    apiVersion: item.apiVersion || "v1",
    resource: resourceForEcosystemItem(item),
    kind: item.kind
  };
}

export function OcpEcosystemConsole({ language, view }: OcpEcosystemConsoleProps) {
  const copy = ecosystemCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState<string>("");

  async function load() {
    setLoading(true);
    const [
      catalogSources,
      packageManifests,
      csvs,
      subscriptions,
      installPlans,
      operatorGroups,
      helmSecrets,
      helmConfigMaps
    ] = await Promise.all([
      fetchOcpResourceList({
        apiVersion: "operators.coreos.com/v1alpha1",
        resource: "catalogsources",
        namespace: "openshift-marketplace",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "packages.operators.coreos.com/v1",
        resource: "packagemanifests",
        namespace: "default",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "operators.coreos.com/v1alpha1",
        resource: "clusterserviceversions",
        namespace: "openshift-operators",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "operators.coreos.com/v1alpha1",
        resource: "subscriptions",
        namespace: "openshift-operators",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "operators.coreos.com/v1alpha1",
        resource: "installplans",
        namespace: "openshift-operators",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "operators.coreos.com/v1",
        resource: "operatorgroups",
        namespace: "openshift-operators",
        limit: 30,
        full: true
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "v1",
        resource: "secrets",
        labelSelector: "owner=helm",
        limit: 30,
        full: false
      }).catch((error) => error as Error),
      fetchOcpResourceList({
        apiVersion: "v1",
        resource: "configmaps",
        labelSelector: "OWNER=TILLER",
        limit: 30,
        full: false
      }).catch((error) => error as Error)
    ]);

    setState({
      catalogSources: catalogSources instanceof Error ? undefined : catalogSources,
      packageManifests: packageManifests instanceof Error ? undefined : packageManifests,
      csvs: csvs instanceof Error ? undefined : csvs,
      subscriptions: subscriptions instanceof Error ? undefined : subscriptions,
      installPlans: installPlans instanceof Error ? undefined : installPlans,
      operatorGroups: operatorGroups instanceof Error ? undefined : operatorGroups,
      helmSecrets: helmSecrets instanceof Error ? undefined : helmSecrets,
      helmConfigMaps: helmConfigMaps instanceof Error ? undefined : helmConfigMaps
    });
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const tableItems = useMemo(() => {
    if (view === "software-catalog" || view === "operatorhub") {
      return mergeItems(state.packageManifests, state.catalogSources);
    }
    if (view === "installed-operators") {
      return mergeItems(state.csvs, state.subscriptions, state.installPlans, state.operatorGroups);
    }
    return mergeItems(state.helmSecrets, state.helmConfigMaps);
  }, [state, view]);

  const selectedItem =
    tableItems.find((item) => `${item.kind}/${item.metadata.namespace ?? "cluster"}/${item.metadata.name}` === selectedName) ??
    tableItems[0];

  useEffect(() => {
    if (!selectedItem) return;
    const key = `${selectedItem.kind}/${selectedItem.metadata.namespace ?? "cluster"}/${selectedItem.metadata.name}`;
    setSelectedName((current) => current || key);
  }, [selectedItem]);

  const drilldownItems = tableItems;

  return (
    <section
      className="native-console-panel ocp-ecosystem-console"
      data-testid={`ocp-ecosystem-${view}`}
      id={`ocp-ecosystem-${view}`}
    >
      <div className="native-console-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h3>{copy[view]}</h3>
          <p>{copy.catalogBoundary}</p>
        </div>
        <div className="native-console-actions">
          <span className={`status-pill ${loading ? "warning" : "ready"}`}>
            {loading ? copy.loading : statusText(state.packageManifests ?? state.csvs ?? state.helmSecrets, copy)}
          </span>
          <button type="button" className="ghost-button" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            {copy.refresh}
          </button>
        </div>
      </div>

      <div className="native-console-summary" data-testid="ocp-ecosystem-summary">
        <span>
          <PackageSearch size={15} aria-hidden="true" />
          {copy.package}: {state.packageManifests?.items.length ?? 0}
        </span>
        <span>
          <Boxes size={15} aria-hidden="true" />
          {copy.catalog}: {state.catalogSources?.items.length ?? 0}
        </span>
        <span>
          <ShieldCheck size={15} aria-hidden="true" />
          CSV: {state.csvs?.items.length ?? 0}
        </span>
        <span>
          <ScrollText size={15} aria-hidden="true" />
          Helm: {mergeItems(state.helmSecrets, state.helmConfigMaps).length}
        </span>
      </div>

      {[state.catalogSources, state.packageManifests, state.csvs, state.subscriptions, state.installPlans, state.helmSecrets, state.helmConfigMaps]
        .map(failureText)
        .filter(Boolean)
        .slice(0, 3)
        .map((failure) => (
          <p className="muted-warning" key={failure}>
            {copy.apiFailure}: {failure}
          </p>
        ))}

      <div className="native-console-table-wrap">
        <table className="native-console-table">
          <thead>
            <tr>
              <th>{copy.source}</th>
              <th>{copy.namespace}</th>
              <th>{view === "helm" ? copy.chart : copy.channel}</th>
              <th>{view === "installed-operators" ? copy.phase : copy.provider}</th>
              <th>{view === "helm" ? copy.revision : copy.currentCsv}</th>
              <th>{copy.age}</th>
            </tr>
          </thead>
          <tbody>
            {tableItems.map((item) => {
              const key = `${item.kind}/${item.metadata.namespace ?? "cluster"}/${item.metadata.name}`;
              const isPackage = item.kind === "PackageManifest";
              const isCsv = item.kind === "ClusterServiceVersion";
              const isSubscription = item.kind === "Subscription";
              const isInstallPlan = item.kind === "InstallPlan";
              return (
                <tr
                  key={key}
                  className={key === selectedName ? "selected" : undefined}
                  onClick={() => setSelectedName(key)}
                >
                  <td>
                    <NativeObjectLink
                      item={item}
                      resource={ecosystemResourceRef(item)}
                      testId={`ocp-ecosystem-${view}-object-link`}
                    />
                  </td>
                  <td>{item.metadata.namespace ?? "-"}</td>
                  <td>
                    {view === "helm"
                      ? helmChart(item)
                      : isSubscription
                        ? subscriptionChannel(item)
                        : isPackage
                          ? packageChannel(item)
                          : isInstallPlan
                            ? installPlanApproval(item)
                            : "-"}
                  </td>
                  <td>
                    {isCsv
                      ? csvPhase(item)
                      : isPackage
                        ? packageProvider(item)
                        : isInstallPlan
                          ? String(boolField(item.spec, "approved") ?? "-")
                          : item.kind}
                  </td>
                  <td>
                    {view === "helm"
                      ? helmRevision(item)
                      : isPackage
                        ? packageCurrentCsv(item)
                        : stringField(item.status, "currentCSV") ?? stringField(item.spec, "startingCSV") ?? "-"}
                  </td>
                  <td>{ageText(item.metadata.creationTimestamp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {tableItems.length === 0 ? (
          <p className="empty-state">
            {view === "installed-operators"
              ? copy.noInstalled
              : view === "helm"
                ? copy.noHelm
                : copy.noCatalog}
          </p>
        ) : null}
      </div>

      <div className="native-console-actions" data-testid="ocp-ecosystem-native-handoff">
        <a
          className="native-object-action"
          href={
            view === "installed-operators"
              ? "/k8s/ns/default/operators.coreos.com~v1alpha1~ClusterServiceVersion"
              : view === "helm"
                ? "/helm-releases/ns/default"
                : "/catalog/ns/default?catalogType=operator"
          }
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {copy.nativeHandoff}
        </a>
      </div>

      <OcpNativeObjectDrilldown
        language={language}
        resource={{
          apiVersion: "packages.operators.coreos.com/v1",
          resource: "packagemanifests",
          kind: "PackageManifest"
        }}
        items={drilldownItems}
        resourceForItem={ecosystemResourceRef}
        title={copy[view]}
        testId="ocp-ecosystem-object-drilldown"
      />
    </section>
  );
}
