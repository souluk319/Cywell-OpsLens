import type {
  OcpCoverageDiagnosticResponse,
  OcpCoverageDetailStatus,
  OcpCoverageGapType,
  OcpCoverageListStatus,
  OcpCoverageMatrixResponse,
  OcpDiagnosticFindingStatus,
  OcpResourceCoverageEntry
} from "@kugnus/contracts";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldCheck, TableProperties } from "lucide-react";
import {
  fetchOcpCoverageDiagnostic,
  fetchOcpCoverageMatrix
} from "../lib/api";
import type { UiLanguage } from "../i18n";

const coverageCopy = {
  en: {
    eyebrow: "Read coverage",
    title: "OCP Coverage Matrix",
    refresh: "Refresh",
    maxProbes: "Max probes",
    maxCoverageProbes: "Max coverage probes",
    sampleGet: "sample get",
    fullScan: "Full scan",
    export: "Export",
    scanning: "scanning",
    coverageReady: "coverage ready",
    coverageUnavailable: "coverage unavailable",
    discovered: "discovered",
    safeList: "safe list",
    probed: "probed",
    detailRead: "sample get",
    bounded: "bounded",
    listed: "listed",
    empty: "empty",
    denied: "denied",
    blocked: "blocked",
    skipped: "skipped",
    error: "error",
    policyBlocked: "policy-blocked",
    notProbed: "not-probed",
    webhook: "webhook",
    resource: "Resource",
    scope: "Scope",
    list: "List",
    gap: "Gap",
    sample: "Sample",
    get: "Get",
    evidence: "Evidence",
    diagnostic: "Diagnostic",
    diagnose: "Diagnose",
    noEntries: "No coverage entries returned.",
    diagnosticTitle: "Coverage Diagnostic",
    diagnosing: "diagnosing",
    readOnly: "read-only",
    readOnlyEvidence: "read-only evidence",
    readOnlyDiagnosticEvidence: "read-only diagnostic evidence",
    nextChecks: "Next checks",
    selectRow: "Select a coverage row to inspect read-only diagnostic evidence."
  },
  ko: {
    eyebrow: "읽기 범위",
    title: "OCP 읽기 범위 매트릭스",
    refresh: "새로고침",
    maxProbes: "최대 검사",
    maxCoverageProbes: "최대 범위 검사 수",
    sampleGet: "샘플 조회",
    fullScan: "전체 스캔",
    export: "내보내기",
    scanning: "검사 중",
    coverageReady: "범위 준비됨",
    coverageUnavailable: "범위 확인 불가",
    discovered: "발견",
    safeList: "안전 목록",
    probed: "검사됨",
    detailRead: "샘플 조회",
    bounded: "제한",
    listed: "조회됨",
    empty: "비어 있음",
    denied: "거부됨",
    blocked: "차단됨",
    skipped: "건너뜀",
    error: "오류",
    policyBlocked: "정책 차단",
    notProbed: "미검사",
    webhook: "웹훅",
    resource: "리소스",
    scope: "범위",
    list: "목록",
    gap: "차이",
    sample: "샘플",
    get: "조회",
    evidence: "근거",
    diagnostic: "진단",
    diagnose: "진단",
    noEntries: "범위 항목이 반환되지 않았습니다.",
    diagnosticTitle: "범위 진단",
    diagnosing: "진단 중",
    readOnly: "읽기 전용",
    readOnlyEvidence: "읽기 전용 근거",
    readOnlyDiagnosticEvidence: "읽기 전용 진단 근거",
    nextChecks: "다음 확인",
    selectRow: "범위 행을 선택하면 읽기 전용 진단 근거를 확인합니다."
  }
} satisfies Record<UiLanguage, Record<string, string>>;

const listStatusLabels = {
  en: {
    listed: "listed",
    empty: "empty",
    denied: "denied",
    blocked: "blocked",
    unsupported: "unsupported",
    skipped: "skipped",
    error: "error"
  },
  ko: {
    listed: "조회됨",
    empty: "비어 있음",
    denied: "권한 거부",
    blocked: "정책 차단",
    unsupported: "미지원",
    skipped: "건너뜀",
    error: "오류"
  }
} satisfies Record<UiLanguage, Record<OcpCoverageListStatus, string>>;

const detailStatusLabels = {
  en: {
    read: "read",
    empty: "empty",
    denied: "denied",
    unsupported: "unsupported",
    skipped: "skipped",
    error: "error"
  },
  ko: {
    read: "조회됨",
    empty: "비어 있음",
    denied: "권한 거부",
    unsupported: "미지원",
    skipped: "건너뜀",
    error: "오류"
  }
} satisfies Record<UiLanguage, Record<OcpCoverageDetailStatus, string>>;

const gapTypeLabels = {
  en: {
    none: "no gap",
    "not-probed": "not probed",
    "policy-blocked": "policy blocked",
    "list-unsupported": "list unsupported",
    "rbac-denied": "RBAC denied",
    empty: "empty result",
    "cluster-api-error": "cluster API error",
    "conversion-webhook-error": "conversion webhook error",
    timeout: "timeout",
    "unknown-error": "unknown error"
  },
  ko: {
    none: "차이 없음",
    "not-probed": "미검사",
    "policy-blocked": "정책 차단",
    "list-unsupported": "목록 미지원",
    "rbac-denied": "RBAC 거부",
    empty: "빈 결과",
    "cluster-api-error": "클러스터 API 오류",
    "conversion-webhook-error": "변환 웹훅 오류",
    timeout: "시간 초과",
    "unknown-error": "알 수 없는 오류"
  }
} satisfies Record<UiLanguage, Record<OcpCoverageGapType, string>>;

const scopeLabels = {
  en: {
    cluster: "cluster",
    "all-namespaces": "all namespaces",
    namespace: "namespace"
  },
  ko: {
    cluster: "클러스터",
    "all-namespaces": "모든 네임스페이스",
    namespace: "네임스페이스"
  }
} satisfies Record<UiLanguage, Record<OcpResourceCoverageEntry["scope"], string>>;

const diagnosticStatusLabels = {
  en: {
    ok: "ok",
    warning: "warning",
    critical: "critical",
    missing: "missing",
    skipped: "skipped",
    error: "error"
  },
  ko: {
    ok: "정상",
    warning: "주의",
    critical: "위험",
    missing: "근거 없음",
    skipped: "건너뜀",
    error: "오류"
  }
} satisfies Record<UiLanguage, Record<OcpDiagnosticFindingStatus, string>>;

const statusOrder: Record<OcpCoverageListStatus, number> = {
  error: 0,
  denied: 1,
  blocked: 2,
  listed: 3,
  empty: 4,
  skipped: 5,
  unsupported: 6
};

function statusClass(status: OcpCoverageListStatus) {
  if (status === "listed" || status === "empty") {
    return "ready";
  }
  if (status === "skipped" || status === "unsupported") {
    return "read-only";
  }
  return "danger";
}

function gapClass(type: OcpCoverageGapType) {
  if (type === "none" || type === "empty") {
    return "ready";
  }
  if (type === "not-probed" || type === "list-unsupported") {
    return "read-only";
  }
  return "danger";
}

function formatResource(entry: OcpResourceCoverageEntry) {
  return `${entry.resource.apiVersion}/${entry.resource.name}`;
}

interface OcpCoverageMatrixProps {
  language: UiLanguage;
}

export function OcpCoverageMatrix({ language }: OcpCoverageMatrixProps) {
  const copy = coverageCopy[language];
  const [coverage, setCoverage] = useState<OcpCoverageMatrixResponse | null>(
    null
  );
  const [diagnostic, setDiagnostic] =
    useState<OcpCoverageDiagnosticResponse | null>(null);
  const [maxResources, setMaxResources] = useState(25);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [lastFullScan, setLastFullScan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDiagnostic(entry: OcpResourceCoverageEntry) {
    setDiagnosticLoading(true);
    try {
      setDiagnostic(
        await fetchOcpCoverageDiagnostic({
          apiVersion: entry.resource.apiVersion,
          resource: entry.resource.name,
          namespace: entry.namespace
        })
      );
    } catch {
      setDiagnostic(null);
    } finally {
      setDiagnosticLoading(false);
    }
  }

  async function refreshCoverage(options: { full?: boolean } = {}) {
    setLoading(true);
    setError(null);
    try {
      const full = Boolean(options.full);
      const response = await fetchOcpCoverageMatrix({
        maxResources: full ? undefined : maxResources,
        includeDetails
      });
      setCoverage(response);
      setLastFullScan(full);
      const diagnosticTarget =
        response.resources.find(
          (entry) =>
            entry.gap.severity === "critical" || entry.gap.severity === "warning"
        ) ??
        response.resources.find((entry) => entry.gap.type !== "none");
      if (diagnosticTarget) {
        void loadDiagnostic(diagnosticTarget);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCP coverage failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshCoverage();
  }, []);

  function exportEvidenceSnapshot() {
    if (!coverage) {
      return;
    }

    const snapshot = {
      generatedAt: coverage.generatedAt,
      probe: coverage.probe,
      totals: coverage.totals,
      evidence: coverage.evidence,
      gaps: coverage.resources
        .filter((entry) => entry.gap.type !== "none")
        .map((entry) => ({
          resource: formatResource(entry),
          scope: entry.scope,
          listStatus: entry.list.status,
          detailStatus: entry.detail.status,
          gap: entry.gap
        }))
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kugnus-ocp-coverage-${coverage.generatedAt.replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const visibleResources = useMemo(
    () =>
      (coverage?.resources ?? [])
        .slice()
        .sort((a, b) => {
          const statusScore =
            statusOrder[a.list.status] - statusOrder[b.list.status];
          return statusScore || formatResource(a).localeCompare(formatResource(b));
        })
        .slice(0, 120),
    [coverage]
  );

  return (
    <section className="ocp-coverage" aria-labelledby="ocp-coverage-title">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="ocp-coverage-title">{copy.title}</h2>
        </div>
        <button
          className="text-icon-button"
          disabled={loading}
          data-testid="ocp-coverage-refresh"
          type="button"
          onClick={() => void refreshCoverage()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {copy.refresh}
        </button>
      </div>

      <div className="coverage-controls">
        <label>
          {copy.maxProbes}
          <input
            aria-label={copy.maxCoverageProbes}
            data-testid="ocp-coverage-max-probes"
            min={1}
            max={500}
            type="number"
            value={maxResources}
            onChange={(event) => setMaxResources(Number(event.target.value))}
          />
        </label>
        <label className="checkbox-control">
          <input
            checked={includeDetails}
            type="checkbox"
            onChange={(event) => setIncludeDetails(event.target.checked)}
          />
          {copy.sampleGet}
        </label>
        <button
          className="text-icon-button"
          data-testid="ocp-coverage-full-scan"
          disabled={loading}
          type="button"
          onClick={() => void refreshCoverage({ full: true })}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {copy.fullScan}
        </button>
        <button
          className="text-icon-button"
          data-testid="ocp-coverage-export"
          disabled={!coverage || loading}
          type="button"
          onClick={exportEvidenceSnapshot}
        >
          <Download size={16} aria-hidden="true" />
          {copy.export}
        </button>
      </div>

      <div className="overview-status-strip" data-testid="ocp-coverage-status">
        <span className={`status-pill ${coverage?.status.reachable ? "ready" : "danger"}`}>
          {loading
            ? copy.scanning
            : coverage?.status.reachable
              ? copy.coverageReady
              : copy.coverageUnavailable}
        </span>
        <span>{coverage?.totals.discovered ?? 0} {copy.discovered}</span>
        <span>{coverage?.totals.safeToList ?? 0} {copy.safeList}</span>
        <span>{coverage?.totals.probed ?? 0} {copy.probed}</span>
        <span>{coverage?.totals.detailRead ?? 0} {copy.detailRead}</span>
        <span>{lastFullScan ? copy.fullScan : `${copy.bounded} ${coverage?.probe.requestedMaxResources ?? maxResources}`}</span>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-coverage-error">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="coverage-summary" data-testid="ocp-coverage-totals">
        <span className="status-pill ready">{copy.listed} {coverage?.totals.listed ?? 0}</span>
        <span className="status-pill read-only">{copy.empty} {coverage?.totals.empty ?? 0}</span>
        <span className="status-pill danger">{copy.denied} {coverage?.totals.denied ?? 0}</span>
        <span className="status-pill danger">{copy.blocked} {coverage?.totals.blocked ?? 0}</span>
        <span className="status-pill read-only">{copy.skipped} {coverage?.totals.skipped ?? 0}</span>
        <span className="status-pill danger">{copy.error} {coverage?.totals.error ?? 0}</span>
        <span className="status-pill danger">
          {copy.policyBlocked} {coverage?.totals.gapTypes["policy-blocked"] ?? 0}
        </span>
        <span className="status-pill read-only">
          {copy.notProbed} {coverage?.totals.gapTypes["not-probed"] ?? 0}
        </span>
        <span className="status-pill danger">
          {copy.webhook} {coverage?.totals.gapTypes["conversion-webhook-error"] ?? 0}
        </span>
      </div>

      <div className="coverage-table-wrap" data-testid="ocp-coverage-matrix">
        <table className="resource-table compact" data-testid="ocp-coverage-table">
          <thead>
            <tr>
              <th>{copy.resource}</th>
              <th>{copy.scope}</th>
              <th>{copy.list}</th>
              <th>{copy.gap}</th>
              <th>{copy.sample}</th>
              <th>{copy.get}</th>
              <th>{copy.evidence}</th>
              <th>{copy.diagnostic}</th>
            </tr>
          </thead>
          <tbody>
            {visibleResources.map((entry) => (
              <tr key={formatResource(entry)}>
                <td>
                  <TableProperties size={14} aria-hidden="true" />
                  {formatResource(entry)}
                </td>
                <td>{scopeLabels[language][entry.scope]}</td>
                <td>
                  <span className={`status-pill ${statusClass(entry.list.status)}`}>
                    {listStatusLabels[language][entry.list.status]}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-pill ${gapClass(entry.gap.type)}`}
                    title={entry.gap.message}
                  >
                    {gapTypeLabels[language][entry.gap.type]}
                  </span>
                </td>
                <td>{entry.list.sampleItemCount}</td>
                <td>{detailStatusLabels[language][entry.detail.status]}</td>
                <td>{entry.evidence[1] ?? copy.readOnlyEvidence}</td>
                <td>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => void loadDiagnostic(entry)}
                  >
                    {copy.diagnose}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && coverage && coverage.resources.length === 0 ? (
          <p>{copy.noEntries}</p>
        ) : null}
      </div>

      <article className="console-panel coverage-diagnostic" data-testid="ocp-coverage-diagnostic">
        <div className="panel-title-row">
          <h3>{copy.diagnosticTitle}</h3>
          <span className="status-pill read-only">
            {diagnosticLoading ? copy.diagnosing : copy.readOnly}
          </span>
        </div>
        {diagnostic ? (
          <>
            <div className="diagnostic-target">
              <strong>
                {diagnostic.resource.apiVersion}/{diagnostic.resource.name}
              </strong>
              <span className={`status-pill ${gapClass(diagnostic.coverage.gap.type)}`}>
                {gapTypeLabels[language][diagnostic.coverage.gap.type]}
              </span>
              <span>{diagnostic.coverage.gap.message}</span>
            </div>
            <div className="diagnostic-findings">
              {diagnostic.findings.map((item) => (
                <div className="diagnostic-finding" key={item.id}>
                  <span className={`status-pill ${item.status === "ok" ? "ready" : item.status === "skipped" || item.status === "missing" ? "read-only" : "danger"}`}>
                    {diagnosticStatusLabels[language][item.status]}
                  </span>
                  <strong>{item.label}</strong>
                  <p>{item.message}</p>
                  <small>{item.evidence[0] ?? copy.readOnlyDiagnosticEvidence}</small>
                </div>
              ))}
            </div>
            <div className="diagnostic-next">
              <strong>{copy.nextChecks}</strong>
              <ul>
                {diagnostic.nextChecks.slice(0, 4).map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p>{copy.selectRow}</p>
        )}
      </article>
    </section>
  );
}
