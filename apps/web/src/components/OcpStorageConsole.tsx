import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  AlertTriangle,
  Archive,
  Database,
  HardDrive,
  Layers3,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";
import { OcpNativeObjectDrilldown } from "./OcpNativeObjectDrilldown";

export type OcpStorageView =
  | "persistentvolumeclaims"
  | "persistentvolumes"
  | "storageclasses"
  | "volumesnapshots"
  | "volumesnapshotclasses";

interface OcpStorageConsoleProps {
  language: UiLanguage;
  view: OcpStorageView;
}

interface ResourceState {
  pvcs?: OcpResourceListResponse;
  pvs?: OcpResourceListResponse;
  storageClasses?: OcpResourceListResponse;
  snapshots?: OcpResourceListResponse;
  snapshotClasses?: OcpResourceListResponse;
}

const storageCopy = {
  en: {
    eyebrow: "Storage",
    title: "OpenShift Storage",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    persistentvolumeclaims: "PersistentVolumeClaims",
    persistentvolumes: "PersistentVolumes",
    storageclasses: "StorageClasses",
    volumesnapshots: "VolumeSnapshots",
    volumesnapshotclasses: "VolumeSnapshotClasses",
    namespace: "Namespace",
    phase: "Phase",
    capacity: "Capacity",
    requested: "Requested",
    storageClass: "StorageClass",
    boundVolume: "Bound volume",
    accessModes: "Access modes",
    reclaimPolicy: "Reclaim policy",
    volumeBindingMode: "Binding mode",
    provisioner: "Provisioner",
    allowExpansion: "Expansion",
    claim: "Claim",
    source: "Source",
    readyToUse: "Ready",
    driver: "Driver",
    deletionPolicy: "Deletion policy",
    noPvcs: "No PersistentVolumeClaims were returned by the cluster.",
    noPvs: "No PersistentVolumes were returned by the cluster.",
    noStorageClasses: "No StorageClasses were returned by the cluster.",
    noSnapshots: "No VolumeSnapshots were returned. The snapshot API may not be installed.",
    noSnapshotClasses: "No VolumeSnapshotClasses were returned. The snapshot API may not be installed.",
    bindingBoard: "Volume binding",
    provisioningBoard: "Dynamic provisioning",
    snapshotBoard: "Snapshot readiness",
    riskBoard: "Storage risk",
    bindingBody:
      "OpenShift storage connects project-scoped PVCs to cluster PVs and reports Pending, Bound, Lost, and Released states.",
    provisioningBody:
      "StorageClasses define provisioner, reclaim policy, volume binding mode, and expansion capability.",
    snapshotBody:
      "CSI snapshots expose backup and restore readiness when snapshot APIs are installed.",
    riskBody:
      "OpsLens keeps storage actions read-only here and prepares approval-gated plans for expansion, reclaim, or restore.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Create, edit, expand, delete, and restore remain native OpenShift actions. OpsLens mirrors the console inventory and adds impact/risk evidence.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "스토리지",
    title: "OpenShift 스토리지",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    persistentvolumeclaims: "PersistentVolumeClaims",
    persistentvolumes: "PersistentVolumes",
    storageclasses: "StorageClasses",
    volumesnapshots: "VolumeSnapshots",
    volumesnapshotclasses: "VolumeSnapshotClasses",
    namespace: "네임스페이스",
    phase: "상태",
    capacity: "용량",
    requested: "요청 용량",
    storageClass: "StorageClass",
    boundVolume: "바인딩된 볼륨",
    accessModes: "접근 모드",
    reclaimPolicy: "회수 정책",
    volumeBindingMode: "바인딩 모드",
    provisioner: "Provisioner",
    allowExpansion: "확장",
    claim: "Claim",
    source: "소스",
    readyToUse: "준비",
    driver: "Driver",
    deletionPolicy: "삭제 정책",
    noPvcs: "클러스터에서 반환된 PersistentVolumeClaim이 없습니다.",
    noPvs: "클러스터에서 반환된 PersistentVolume이 없습니다.",
    noStorageClasses: "클러스터에서 반환된 StorageClass가 없습니다.",
    noSnapshots: "반환된 VolumeSnapshot이 없습니다. Snapshot API가 설치되지 않았을 수 있습니다.",
    noSnapshotClasses: "반환된 VolumeSnapshotClass가 없습니다. Snapshot API가 설치되지 않았을 수 있습니다.",
    bindingBoard: "볼륨 바인딩",
    provisioningBoard: "동적 프로비저닝",
    snapshotBoard: "스냅샷 준비도",
    riskBoard: "스토리지 리스크",
    bindingBody:
      "OpenShift 스토리지는 프로젝트 PVC와 클러스터 PV를 연결하고 Pending, Bound, Lost, Released 상태를 표시합니다.",
    provisioningBody:
      "StorageClass는 provisioner, reclaim policy, volume binding mode, expansion 가능 여부를 정의합니다.",
    snapshotBody:
      "CSI snapshot은 Snapshot API가 설치된 경우 백업/복구 준비도를 보여줍니다.",
    riskBody:
      "OpsLens는 이 화면에서 스토리지 작업을 읽기 전용으로 유지하고 확장, 회수, 복구에 대한 승인 기반 계획을 준비합니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "생성, 수정, 확장, 삭제, 복구는 OpenShift 원본 기능으로 남깁니다. OpsLens는 콘솔 인벤토리를 복제하고 영향/리스크 근거를 추가합니다.",
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

function booleanField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "boolean" ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function quantity(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "-";
}

function requestedCapacity(item: OcpResourceSummary) {
  const resources = asRecord(asRecord(item.spec).resources);
  const requests = asRecord(resources.requests);
  return quantity(requests.storage);
}

function pvcPhase(item: OcpResourceSummary) {
  return stringField(item.status, "phase") ?? "-";
}

function pvPhase(item: OcpResourceSummary) {
  return stringField(item.status, "phase") ?? "-";
}

function capacity(item: OcpResourceSummary) {
  return quantity(asRecord(asRecord(item.spec).capacity).storage);
}

function accessModes(item: OcpResourceSummary) {
  return arrayField(item.spec, "accessModes").join(", ") || "-";
}

function claimRef(item: OcpResourceSummary) {
  const claim = asRecord(item.spec).claimRef;
  const record = asRecord(claim);
  const namespace = stringField(record, "namespace");
  const name = stringField(record, "name");
  return name ? `${namespace ?? "-"} / ${name}` : "-";
}

function storageClass(item: OcpResourceSummary) {
  return stringField(item.spec, "storageClassName") ?? stringField(item.metadata.annotations, "volume.beta.kubernetes.io/storage-class") ?? "-";
}

function boundVolume(item: OcpResourceSummary) {
  return stringField(item.spec, "volumeName") ?? "-";
}

function classExpansion(item: OcpResourceSummary) {
  const value = booleanField(item.spec, "allowVolumeExpansion");
  return value === undefined ? "-" : value ? "true" : "false";
}

function classProvisioner(item: OcpResourceSummary) {
  return stringField(item.spec, "provisioner") ?? "-";
}

function classReclaimPolicy(item: OcpResourceSummary) {
  return stringField(item.spec, "reclaimPolicy") ?? "-";
}

function classBindingMode(item: OcpResourceSummary) {
  return stringField(item.spec, "volumeBindingMode") ?? "-";
}

function snapshotReady(item: OcpResourceSummary) {
  const ready = booleanField(item.status, "readyToUse");
  return ready === undefined ? "-" : ready ? "true" : "false";
}

function snapshotSource(item: OcpResourceSummary) {
  const source = asRecord(item.spec).source;
  const record = asRecord(source);
  return stringField(record, "persistentVolumeClaimName") ?? stringField(record, "volumeSnapshotContentName") ?? "-";
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.pvcs?.status.reachable ||
      state.pvs?.status.reachable ||
      state.storageClasses?.status.reachable ||
      state.snapshots?.status.reachable ||
      state.snapshotClasses?.status.reachable
  );
}

function viewTestId(view: OcpStorageView) {
  return `ocp-storage-${view}`;
}

function phaseTone(phase: string) {
  const normalized = phase.toLowerCase();
  if (["bound", "available", "released", "true"].includes(normalized)) return "ready";
  if (["pending", "lost", "failed", "false"].includes(normalized)) return "danger";
  return "neutral";
}

export function OcpStorageConsole({ language, view }: OcpStorageConsoleProps) {
  const copy = storageCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({ apiVersion: "v1", resource: "persistentvolumeclaims", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "v1", resource: "persistentvolumes", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "storage.k8s.io/v1", resource: "storageclasses", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "snapshot.storage.k8s.io/v1", resource: "volumesnapshots", limit: 80, full: true }),
      fetchOcpResourceList({ apiVersion: "snapshot.storage.k8s.io/v1", resource: "volumesnapshotclasses", limit: 80, full: true })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        return;
      }
      if (index === 0) next.pvcs = result.value;
      if (index === 1) next.pvs = result.value;
      if (index === 2) next.storageClasses = result.value;
      if (index === 3) next.snapshots = result.value;
      if (index === 4) next.snapshotClasses = result.value;
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

  const pvcs = state.pvcs?.items ?? [];
  const pvs = state.pvs?.items ?? [];
  const storageClasses = state.storageClasses?.items ?? [];
  const snapshots = state.snapshots?.items ?? [];
  const snapshotClasses = state.snapshotClasses?.items ?? [];
  const failureMessages = [
    failureText(state.pvcs),
    failureText(state.pvs),
    failureText(state.storageClasses),
    failureText(state.snapshots),
    failureText(state.snapshotClasses),
    ...errors
  ].filter(Boolean);
  const drilldown =
    view === "persistentvolumeclaims"
      ? {
          resource: { apiVersion: "v1", resource: "persistentvolumeclaims" },
          items: pvcs,
          title: copy.persistentvolumeclaims
        }
      : view === "persistentvolumes"
        ? {
            resource: { apiVersion: "v1", resource: "persistentvolumes" },
            items: pvs,
            title: copy.persistentvolumes
          }
        : view === "storageclasses"
          ? {
              resource: { apiVersion: "storage.k8s.io/v1", resource: "storageclasses" },
              items: storageClasses,
              title: copy.storageclasses
            }
          : view === "volumesnapshots"
            ? {
                resource: { apiVersion: "snapshot.storage.k8s.io/v1", resource: "volumesnapshots" },
                items: snapshots,
                title: copy.volumesnapshots
              }
            : {
                resource: { apiVersion: "snapshot.storage.k8s.io/v1", resource: "volumesnapshotclasses" },
                items: snapshotClasses,
                title: copy.volumesnapshotclasses
              };

  const pvcPhaseCounts = useMemo(() => {
    return pvcs.reduce<Record<string, number>>((acc, item) => {
      const phase = pvcPhase(item);
      acc[phase] = (acc[phase] ?? 0) + 1;
      return acc;
    }, {});
  }, [pvcs]);
  const boundPvcs = pvcs.filter((item) => pvcPhase(item).toLowerCase() === "bound").length;
  const pendingPvcs = pvcs.filter((item) => pvcPhase(item).toLowerCase() === "pending").length;
  const expandableClasses = storageClasses.filter((item) => classExpansion(item) === "true").length;
  const readySnapshots = snapshots.filter((item) => snapshotReady(item) === "true").length;

  return (
    <section className="ocp-storage-console" data-testid={viewTestId(view)} aria-labelledby="ocp-storage-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-storage-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-storage-toolbar" data-testid="ocp-storage-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.persistentvolumeclaims}: {pvcs.length}</span>
        <span>{copy.persistentvolumes}: {pvs.length}</span>
        <span>{copy.storageclasses}: {storageClasses.length}</span>
        <span>{copy.volumesnapshots}: {snapshots.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-storage-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-storage-tabs" aria-label={copy.title}>
        {(["persistentvolumeclaims", "persistentvolumes", "storageclasses", "volumesnapshots", "volumesnapshotclasses"] as const).map((tab) => (
          <a key={tab} href={`#${viewTestId(tab)}`} aria-current={view === tab ? "page" : undefined}>
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="storage-native-grid">
        <article className="storage-native-card" data-testid="ocp-storage-binding-board">
          <div className="card-title-row">
            <h3>{copy.bindingBoard}</h3>
            <Database size={18} aria-hidden="true" />
          </div>
          <p>{copy.bindingBody}</p>
          <div className="storage-phase-strip">
            {Object.entries(pvcPhaseCounts).length > 0 ? (
              Object.entries(pvcPhaseCounts).map(([phase, count]) => (
                <span key={phase} className={`phase-chip ${phaseTone(phase)}`}>{phase} {count}</span>
              ))
            ) : (
              <span className="phase-chip neutral">-</span>
            )}
          </div>
        </article>

        <article className="storage-native-card">
          <div className="card-title-row">
            <h3>{copy.provisioningBoard}</h3>
            <HardDrive size={18} aria-hidden="true" />
          </div>
          <p>{copy.provisioningBody}</p>
          <strong className="storage-card-number">{expandableClasses}/{storageClasses.length}</strong>
        </article>

        <article className="storage-native-card">
          <div className="card-title-row">
            <h3>{copy.snapshotBoard}</h3>
            <Archive size={18} aria-hidden="true" />
          </div>
          <p>{copy.snapshotBody}</p>
          <strong className="storage-card-number">{readySnapshots}/{snapshots.length}</strong>
        </article>

        <article className="storage-native-card">
          <div className="card-title-row">
            <h3>{copy.riskBoard}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>{copy.riskBody}</p>
          <strong className="storage-card-number">{pendingPvcs}/{boundPvcs}</strong>
        </article>
      </div>

      {view === "persistentvolumeclaims" ? (
        <article className="storage-native-panel">
          <div className="card-title-row">
            <h3>{copy.persistentvolumeclaims}</h3>
            <Database size={18} aria-hidden="true" />
          </div>
          {pvcs.length > 0 ? (
            <div className="native-storage-table-wrap">
              <table className="native-storage-table" data-testid="ocp-storage-pvcs-table">
                <thead>
                  <tr>
                    <th>{copy.persistentvolumeclaims}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.phase}</th>
                    <th>{copy.requested}</th>
                    <th>{copy.storageClass}</th>
                    <th>{copy.boundVolume}</th>
                    <th>{copy.accessModes}</th>
                  </tr>
                </thead>
                <tbody>
                  {pvcs.map((item) => {
                    const phase = pvcPhase(item);
                    return (
                      <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                        <td><strong>{item.metadata.name}</strong></td>
                        <td>{item.metadata.namespace ?? "-"}</td>
                        <td><span className={`phase-chip ${phaseTone(phase)}`}>{phase}</span></td>
                        <td>{requestedCapacity(item)}</td>
                        <td>{storageClass(item)}</td>
                        <td>{boundVolume(item)}</td>
                        <td>{accessModes(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noPvcs}</p>
          )}
        </article>
      ) : null}

      {view === "persistentvolumes" ? (
        <article className="storage-native-panel">
          <div className="card-title-row">
            <h3>{copy.persistentvolumes}</h3>
            <Layers3 size={18} aria-hidden="true" />
          </div>
          {pvs.length > 0 ? (
            <div className="native-storage-table-wrap">
              <table className="native-storage-table" data-testid="ocp-storage-pvs-table">
                <thead>
                  <tr>
                    <th>{copy.persistentvolumes}</th>
                    <th>{copy.phase}</th>
                    <th>{copy.capacity}</th>
                    <th>{copy.storageClass}</th>
                    <th>{copy.claim}</th>
                    <th>{copy.reclaimPolicy}</th>
                    <th>{copy.accessModes}</th>
                  </tr>
                </thead>
                <tbody>
                  {pvs.map((item) => {
                    const phase = pvPhase(item);
                    return (
                      <tr key={item.metadata.name}>
                        <td><strong>{item.metadata.name}</strong></td>
                        <td><span className={`phase-chip ${phaseTone(phase)}`}>{phase}</span></td>
                        <td>{capacity(item)}</td>
                        <td>{storageClass(item)}</td>
                        <td>{claimRef(item)}</td>
                        <td>{stringField(item.spec, "persistentVolumeReclaimPolicy") ?? "-"}</td>
                        <td>{accessModes(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noPvs}</p>
          )}
        </article>
      ) : null}

      {view === "storageclasses" ? (
        <article className="storage-native-panel">
          <div className="card-title-row">
            <h3>{copy.storageclasses}</h3>
            <HardDrive size={18} aria-hidden="true" />
          </div>
          {storageClasses.length > 0 ? (
            <div className="native-storage-table-wrap">
              <table className="native-storage-table" data-testid="ocp-storage-classes-table">
                <thead>
                  <tr>
                    <th>{copy.storageclasses}</th>
                    <th>{copy.provisioner}</th>
                    <th>{copy.reclaimPolicy}</th>
                    <th>{copy.volumeBindingMode}</th>
                    <th>{copy.allowExpansion}</th>
                  </tr>
                </thead>
                <tbody>
                  {storageClasses.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{classProvisioner(item)}</td>
                      <td>{classReclaimPolicy(item)}</td>
                      <td>{classBindingMode(item)}</td>
                      <td>{classExpansion(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noStorageClasses}</p>
          )}
        </article>
      ) : null}

      {view === "volumesnapshots" ? (
        <article className="storage-native-panel">
          <div className="card-title-row">
            <h3>{copy.volumesnapshots}</h3>
            <Archive size={18} aria-hidden="true" />
          </div>
          {snapshots.length > 0 ? (
            <div className="native-storage-table-wrap">
              <table className="native-storage-table" data-testid="ocp-storage-snapshots-table">
                <thead>
                  <tr>
                    <th>{copy.volumesnapshots}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.readyToUse}</th>
                    <th>{copy.source}</th>
                    <th>{copy.storageClass}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td><span className={`phase-chip ${phaseTone(snapshotReady(item))}`}>{snapshotReady(item)}</span></td>
                      <td>{snapshotSource(item)}</td>
                      <td>{stringField(item.spec, "volumeSnapshotClassName") ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noSnapshots}</p>
          )}
        </article>
      ) : null}

      {view === "volumesnapshotclasses" ? (
        <article className="storage-native-panel">
          <div className="card-title-row">
            <h3>{copy.volumesnapshotclasses}</h3>
            <Archive size={18} aria-hidden="true" />
          </div>
          {snapshotClasses.length > 0 ? (
            <div className="native-storage-table-wrap">
              <table className="native-storage-table" data-testid="ocp-storage-snapshotclasses-table">
                <thead>
                  <tr>
                    <th>{copy.volumesnapshotclasses}</th>
                    <th>{copy.driver}</th>
                    <th>{copy.deletionPolicy}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotClasses.map((item) => (
                    <tr key={item.metadata.name}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{stringField(item.spec, "driver") ?? "-"}</td>
                      <td>{stringField(item.spec, "deletionPolicy") ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noSnapshotClasses}</p>
          )}
        </article>
      ) : null}

      <OcpNativeObjectDrilldown
        language={language}
        resource={drilldown.resource}
        items={drilldown.items}
        title={drilldown.title}
        testId="ocp-storage-object"
      />

      <aside className="storage-native-boundary" data-testid="ocp-storage-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
