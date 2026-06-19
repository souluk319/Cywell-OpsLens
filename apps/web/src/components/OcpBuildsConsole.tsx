import type { OcpResourceListResponse, OcpResourceSummary } from "@kugnus/contracts";
import {
  AlertTriangle,
  Boxes,
  Clock3,
  GitBranch,
  ImageIcon,
  PlayCircle,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiLanguage } from "../i18n";
import { fetchOcpResourceList } from "../lib/api";

export type OcpBuildsView = "builds" | "buildconfigs" | "imagestreams";

interface OcpBuildsConsoleProps {
  language: UiLanguage;
  view: OcpBuildsView;
}

interface ResourceState {
  builds?: OcpResourceListResponse;
  buildConfigs?: OcpResourceListResponse;
  imageStreams?: OcpResourceListResponse;
  imageStreamTags?: OcpResourceListResponse;
}

const buildsCopy = {
  en: {
    eyebrow: "Builds",
    title: "OpenShift Builds",
    refresh: "Refresh",
    loading: "loading",
    live: "live OCP",
    unavailable: "unavailable",
    builds: "Builds",
    buildconfigs: "BuildConfigs",
    imagestreams: "ImageStreams",
    phase: "Phase",
    strategy: "Strategy",
    source: "Source",
    output: "Output",
    runPolicy: "Run policy",
    latest: "Latest",
    triggers: "Triggers",
    tags: "Tags",
    image: "Image",
    namespace: "Namespace",
    age: "Age",
    started: "Started",
    completed: "Completed",
    duration: "Duration",
    noBuilds: "No Builds were returned by the cluster.",
    noBuildConfigs: "No BuildConfigs were returned by the cluster.",
    noImageStreams: "No ImageStreams were returned by the cluster.",
    nativeHandoff: "Native handoff",
    createBoundary:
      "Create, edit, start, cancel, and prune remain native OpenShift actions. OpsLens shows the read-only baseline and prepares an approval-gated plan.",
    pipeline: "Build pipeline",
    buildInputs: "Inputs",
    advanced: "Advanced build controls",
    buildInputsBody:
      "OpenShift build input order: inline Dockerfile, image content, Git, binary input, input secrets, external artifacts.",
    advancedBody:
      "OpenShift supports resource limits, maximum duration, node assignment, chained builds, pruning, and run policy.",
    apiFailure: "API read failed"
  },
  ko: {
    eyebrow: "Builds",
    title: "OpenShift 빌드",
    refresh: "새로고침",
    loading: "불러오는 중",
    live: "실제 OCP 연결",
    unavailable: "사용 불가",
    builds: "Builds",
    buildconfigs: "BuildConfigs",
    imagestreams: "ImageStreams",
    phase: "상태",
    strategy: "전략",
    source: "소스",
    output: "출력",
    runPolicy: "실행 정책",
    latest: "최신",
    triggers: "트리거",
    tags: "태그",
    image: "이미지",
    namespace: "네임스페이스",
    age: "나이",
    started: "시작",
    completed: "완료",
    duration: "소요 시간",
    noBuilds: "클러스터에서 반환된 Build가 없습니다.",
    noBuildConfigs: "클러스터에서 반환된 BuildConfig가 없습니다.",
    noImageStreams: "클러스터에서 반환된 ImageStream이 없습니다.",
    nativeHandoff: "원본 기능 연결",
    createBoundary:
      "생성, 수정, 시작, 취소, 프루닝은 OpenShift 원본 기능으로 남깁니다. OpsLens는 읽기 전용 기준 화면과 승인 기반 실행 계획을 준비합니다.",
    pipeline: "빌드 파이프라인",
    buildInputs: "입력",
    advanced: "고급 빌드 제어",
    buildInputsBody:
      "OpenShift 빌드 입력 우선순위: inline Dockerfile, 이미지 콘텐츠, Git, 바이너리 입력, 입력 Secret, 외부 artifact.",
    advancedBody:
      "OpenShift는 리소스 제한, 최대 수행 시간, 노드 지정, 체인 빌드, 프루닝, 실행 정책을 지원합니다.",
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

function numberField(value: unknown, key: string) {
  const field = asRecord(value)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key];
  return Array.isArray(field) ? field : [];
}

function dateText(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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

function durationText(start: string | undefined, end: string | undefined) {
  if (!start || !end) return "-";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "-";
  const seconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function buildPhase(item: OcpResourceSummary) {
  return stringField(item.status, "phase") ?? "-";
}

function phaseTone(phase: string) {
  const normalized = phase.toLowerCase();
  if (["complete", "completed", "succeeded"].includes(normalized)) return "ready";
  if (["failed", "error", "cancelled", "canceled"].includes(normalized)) return "danger";
  if (["running", "pending", "new"].includes(normalized)) return "warning";
  return "neutral";
}

function buildStrategy(item: OcpResourceSummary | undefined) {
  if (!item) return "-";
  const spec = asRecord(item.spec);
  return stringField(spec.strategy, "type") ?? stringField(spec, "strategy") ?? "-";
}

function buildSource(item: OcpResourceSummary | undefined) {
  if (!item) return "-";
  const spec = asRecord(item.spec);
  const source = asRecord(spec.source);
  const git = asRecord(source.git);
  const dockerfile = stringField(source, "dockerfile");
  if (dockerfile) return "Inline Dockerfile";
  return stringField(git, "uri") ?? stringField(source, "type") ?? "-";
}

function buildOutput(item: OcpResourceSummary | undefined) {
  if (!item) return "-";
  const spec = asRecord(item.spec);
  const output = asRecord(spec.output);
  const to = asRecord(output.to);
  return stringField(to, "name") ?? stringField(to, "kind") ?? "-";
}

function triggerSummary(item: OcpResourceSummary) {
  const triggers = arrayField(item.spec, "triggers");
  return triggers
    .map((trigger) => stringField(trigger, "type"))
    .filter(Boolean)
    .join(", ") || "-";
}

function tagSummary(item: OcpResourceSummary) {
  return arrayField(item.status, "tags").length || arrayField(item.spec, "tags").length || "-";
}

function latestTag(item: OcpResourceSummary) {
  const tags = arrayField(item.status, "tags")
    .map((tag) => asRecord(tag))
    .filter((tag) => typeof tag.tag === "string");
  const first = tags[0];
  return typeof first?.tag === "string" ? first.tag : "-";
}

function failureText(response: OcpResourceListResponse | undefined) {
  return response?.failure?.message ?? response?.fallback?.reason ?? "";
}

function statusReachable(state: ResourceState) {
  return Boolean(
    state.builds?.status.reachable ||
      state.buildConfigs?.status.reachable ||
      state.imageStreams?.status.reachable
  );
}

function viewTestId(view: OcpBuildsView) {
  return `ocp-builds-${view}`;
}

export function OcpBuildsConsole({ language, view }: OcpBuildsConsoleProps) {
  const copy = buildsCopy[language];
  const [state, setState] = useState<ResourceState>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    const requests = await Promise.allSettled([
      fetchOcpResourceList({
        apiVersion: "build.openshift.io/v1",
        resource: "builds",
        limit: 80,
        full: true
      }),
      fetchOcpResourceList({
        apiVersion: "build.openshift.io/v1",
        resource: "buildconfigs",
        limit: 80,
        full: true
      }),
      fetchOcpResourceList({
        apiVersion: "image.openshift.io/v1",
        resource: "imagestreams",
        limit: 80,
        full: true
      }),
      fetchOcpResourceList({
        apiVersion: "image.openshift.io/v1",
        resource: "imagestreamtags",
        limit: 80,
        full: false
      })
    ]);

    const next: ResourceState = {};
    const nextErrors: string[] = [];
    const keys: Array<keyof ResourceState> = [
      "builds",
      "buildConfigs",
      "imageStreams",
      "imageStreamTags"
    ];

    requests.forEach((result, index) => {
      const key = keys[index];
      if (result.status === "fulfilled") {
        if (key === "builds") next.builds = result.value;
        if (key === "buildConfigs") next.buildConfigs = result.value;
        if (key === "imageStreams") next.imageStreams = result.value;
        if (key === "imageStreamTags") next.imageStreamTags = result.value;
      } else {
        nextErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
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

  const builds = state.builds?.items ?? [];
  const buildConfigs = state.buildConfigs?.items ?? [];
  const imageStreams = state.imageStreams?.items ?? [];
  const imageStreamTags = state.imageStreamTags?.items ?? [];
  const failureMessages = [
    failureText(state.builds),
    failureText(state.buildConfigs),
    failureText(state.imageStreams),
    failureText(state.imageStreamTags),
    ...errors
  ].filter(Boolean);

  const buildPhaseCounts = useMemo(() => {
    return builds.reduce<Record<string, number>>((acc, item) => {
      const phase = buildPhase(item);
      acc[phase] = (acc[phase] ?? 0) + 1;
      return acc;
    }, {});
  }, [builds]);

  const selectedBuildConfig = buildConfigs[0];
  const selectedBuild = builds[0];
  const selectedImageStream = imageStreams[0];

  return (
    <section
      className="ocp-builds-console"
      data-testid={viewTestId(view)}
      aria-labelledby="ocp-builds-title"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-builds-title">{copy.title}</h2>
        </div>
        <button className="text-icon-button" type="button" onClick={() => void refresh()}>
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="ocp-builds-toolbar" data-testid="ocp-builds-toolbar">
        <span className={`status-pill ${statusReachable(state) ? "ready" : "danger"}`}>
          {loading ? copy.loading : statusReachable(state) ? copy.live : copy.unavailable}
        </span>
        <span>{copy.builds}: {builds.length}</span>
        <span>{copy.buildconfigs}: {buildConfigs.length}</span>
        <span>{copy.imagestreams}: {imageStreams.length}</span>
        <span>{copy.tags}: {imageStreamTags.length}</span>
      </div>

      {failureMessages.length > 0 ? (
        <div className="ocp-error" data-testid="ocp-builds-api-failure">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>{copy.apiFailure}: {failureMessages[0]}</span>
        </div>
      ) : null}

      <nav className="ocp-builds-tabs" aria-label={copy.title}>
        {(["builds", "buildconfigs", "imagestreams"] as const).map((tab) => (
          <a
            key={tab}
            href={`#${viewTestId(tab)}`}
            aria-current={view === tab ? "page" : undefined}
          >
            {copy[tab]}
          </a>
        ))}
      </nav>

      <div className="builds-native-grid">
        <article className="builds-native-card" data-testid="ocp-builds-pipeline-board">
          <div className="card-title-row">
            <h3>{copy.pipeline}</h3>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          <div className="build-pipeline-flow">
            <div>
              <span>{copy.source}</span>
              <strong>{selectedBuildConfig ? buildSource(selectedBuildConfig) : buildSource(selectedBuild)}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>{copy.strategy}</span>
              <strong>{selectedBuildConfig ? buildStrategy(selectedBuildConfig) : buildStrategy(selectedBuild)}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>{copy.output}</span>
              <strong>{selectedBuildConfig ? buildOutput(selectedBuildConfig) : buildOutput(selectedBuild)}</strong>
            </div>
          </div>
        </article>

        <article className="builds-native-card">
          <div className="card-title-row">
            <h3>{copy.buildInputs}</h3>
            <Boxes size={18} aria-hidden="true" />
          </div>
          <p>{copy.buildInputsBody}</p>
        </article>

        <article className="builds-native-card">
          <div className="card-title-row">
            <h3>{copy.advanced}</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <p>{copy.advancedBody}</p>
        </article>

        <article className="builds-native-card">
          <div className="card-title-row">
            <h3>{copy.phase}</h3>
            <PlayCircle size={18} aria-hidden="true" />
          </div>
          <div className="build-phase-strip">
            {Object.entries(buildPhaseCounts).length > 0 ? (
              Object.entries(buildPhaseCounts).map(([phase, count]) => (
                <span key={phase} className={`phase-chip ${phaseTone(phase)}`}>
                  {phase} {count}
                </span>
              ))
            ) : (
              <span className="phase-chip neutral">-</span>
            )}
          </div>
        </article>
      </div>

      {view === "builds" ? (
        <article className="builds-native-panel">
          <div className="card-title-row">
            <h3>{copy.builds}</h3>
            <Clock3 size={18} aria-hidden="true" />
          </div>
          {builds.length > 0 ? (
            <div className="native-builds-table-wrap">
              <table className="native-builds-table" data-testid="ocp-builds-table">
                <thead>
                  <tr>
                    <th>{copy.builds}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.phase}</th>
                    <th>{copy.strategy}</th>
                    <th>{copy.output}</th>
                    <th>{copy.started}</th>
                    <th>{copy.duration}</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.map((item) => {
                    const phase = buildPhase(item);
                    const started = stringField(item.status, "startTimestamp");
                    const completed = stringField(item.status, "completionTimestamp");
                    return (
                      <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                        <td><strong>{item.metadata.name}</strong></td>
                        <td>{item.metadata.namespace ?? "-"}</td>
                        <td><span className={`phase-chip ${phaseTone(phase)}`}>{phase}</span></td>
                        <td>{buildStrategy(item)}</td>
                        <td>{buildOutput(item)}</td>
                        <td>{dateText(started)}</td>
                        <td>{durationText(started, completed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noBuilds}</p>
          )}
        </article>
      ) : null}

      {view === "buildconfigs" ? (
        <article className="builds-native-panel">
          <div className="card-title-row">
            <h3>{copy.buildconfigs}</h3>
            <GitBranch size={18} aria-hidden="true" />
          </div>
          {buildConfigs.length > 0 ? (
            <div className="native-builds-table-wrap">
              <table className="native-builds-table" data-testid="ocp-buildconfigs-table">
                <thead>
                  <tr>
                    <th>{copy.buildconfigs}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.strategy}</th>
                    <th>{copy.source}</th>
                    <th>{copy.output}</th>
                    <th>{copy.triggers}</th>
                    <th>{copy.runPolicy}</th>
                  </tr>
                </thead>
                <tbody>
                  {buildConfigs.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{buildStrategy(item)}</td>
                      <td>{buildSource(item)}</td>
                      <td>{buildOutput(item)}</td>
                      <td>{triggerSummary(item)}</td>
                      <td>{stringField(item.spec, "runPolicy") ?? "Serial"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noBuildConfigs}</p>
          )}
        </article>
      ) : null}

      {view === "imagestreams" ? (
        <article className="builds-native-panel">
          <div className="card-title-row">
            <h3>{copy.imagestreams}</h3>
            <ImageIcon size={18} aria-hidden="true" />
          </div>
          {imageStreams.length > 0 ? (
            <div className="native-builds-table-wrap">
              <table className="native-builds-table" data-testid="ocp-imagestreams-table">
                <thead>
                  <tr>
                    <th>{copy.imagestreams}</th>
                    <th>{copy.namespace}</th>
                    <th>{copy.tags}</th>
                    <th>{copy.latest}</th>
                    <th>{copy.image}</th>
                    <th>{copy.age}</th>
                  </tr>
                </thead>
                <tbody>
                  {imageStreams.map((item) => (
                    <tr key={`${item.metadata.namespace ?? "cluster"}-${item.metadata.name}`}>
                      <td><strong>{item.metadata.name}</strong></td>
                      <td>{item.metadata.namespace ?? "-"}</td>
                      <td>{tagSummary(item)}</td>
                      <td>{latestTag(item)}</td>
                      <td>{stringField(item.spec, "dockerImageRepository") ?? "-"}</td>
                      <td>{ageText(item.metadata.creationTimestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">{copy.noImageStreams}</p>
          )}
        </article>
      ) : null}

      <aside className="builds-native-boundary" data-testid="ocp-builds-native-handoff">
        <strong>{copy.nativeHandoff}</strong>
        <p>{copy.createBoundary}</p>
      </aside>
    </section>
  );
}
