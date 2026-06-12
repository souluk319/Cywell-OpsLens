import type {
  OcpCoverageDiagnosticResponse,
  OcpCoverageGapType,
  OcpCoverageListStatus,
  OcpCoverageMatrixResponse,
  OcpResourceCoverageEntry
} from "@kugnus/contracts";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldCheck, TableProperties } from "lucide-react";
import {
  fetchOcpCoverageDiagnostic,
  fetchOcpCoverageMatrix
} from "../lib/api";

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

export function OcpCoverageMatrix() {
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
          <p className="eyebrow">Read coverage</p>
          <h2 id="ocp-coverage-title">OCP Coverage Matrix</h2>
        </div>
        <button
          className="text-icon-button"
          disabled={loading}
          data-testid="ocp-coverage-refresh"
          type="button"
          onClick={() => void refreshCoverage()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="coverage-controls">
        <label>
          Max probes
          <input
            aria-label="Max coverage probes"
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
          sample get
        </label>
        <button
          className="text-icon-button"
          data-testid="ocp-coverage-full-scan"
          disabled={loading}
          type="button"
          onClick={() => void refreshCoverage({ full: true })}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Full scan
        </button>
        <button
          className="text-icon-button"
          data-testid="ocp-coverage-export"
          disabled={!coverage || loading}
          type="button"
          onClick={exportEvidenceSnapshot}
        >
          <Download size={16} aria-hidden="true" />
          Export
        </button>
      </div>

      <div className="overview-status-strip" data-testid="ocp-coverage-status">
        <span className={`status-pill ${coverage?.status.reachable ? "ready" : "danger"}`}>
          {loading
            ? "scanning"
            : coverage?.status.reachable
              ? "coverage ready"
              : "coverage unavailable"}
        </span>
        <span>{coverage?.totals.discovered ?? 0} discovered</span>
        <span>{coverage?.totals.safeToList ?? 0} safe list</span>
        <span>{coverage?.totals.probed ?? 0} probed</span>
        <span>{coverage?.totals.detailRead ?? 0} sample get</span>
        <span>{lastFullScan ? "full scan" : `bounded ${coverage?.probe.requestedMaxResources ?? maxResources}`}</span>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="ocp-coverage-error">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="coverage-summary" data-testid="ocp-coverage-totals">
        <span className="status-pill ready">listed {coverage?.totals.listed ?? 0}</span>
        <span className="status-pill read-only">empty {coverage?.totals.empty ?? 0}</span>
        <span className="status-pill danger">denied {coverage?.totals.denied ?? 0}</span>
        <span className="status-pill danger">blocked {coverage?.totals.blocked ?? 0}</span>
        <span className="status-pill read-only">skipped {coverage?.totals.skipped ?? 0}</span>
        <span className="status-pill danger">error {coverage?.totals.error ?? 0}</span>
        <span className="status-pill danger">
          policy-blocked {coverage?.totals.gapTypes["policy-blocked"] ?? 0}
        </span>
        <span className="status-pill read-only">
          not-probed {coverage?.totals.gapTypes["not-probed"] ?? 0}
        </span>
        <span className="status-pill danger">
          webhook {coverage?.totals.gapTypes["conversion-webhook-error"] ?? 0}
        </span>
      </div>

      <div className="coverage-table-wrap" data-testid="ocp-coverage-matrix">
        <table className="resource-table compact" data-testid="ocp-coverage-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Scope</th>
              <th>List</th>
              <th>Gap</th>
              <th>Sample</th>
              <th>Get</th>
              <th>Evidence</th>
              <th>Diagnostic</th>
            </tr>
          </thead>
          <tbody>
            {visibleResources.map((entry) => (
              <tr key={formatResource(entry)}>
                <td>
                  <TableProperties size={14} aria-hidden="true" />
                  {formatResource(entry)}
                </td>
                <td>{entry.scope}</td>
                <td>
                  <span className={`status-pill ${statusClass(entry.list.status)}`}>
                    {entry.list.status}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-pill ${gapClass(entry.gap.type)}`}
                    title={entry.gap.message}
                  >
                    {entry.gap.type}
                  </span>
                </td>
                <td>{entry.list.sampleItemCount}</td>
                <td>{entry.detail.status}</td>
                <td>{entry.evidence[1] ?? "read-only evidence"}</td>
                <td>
                  <button
                    className="mini-button"
                    type="button"
                    onClick={() => void loadDiagnostic(entry)}
                  >
                    Diagnose
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && coverage && coverage.resources.length === 0 ? (
          <p>No coverage entries returned.</p>
        ) : null}
      </div>

      <article className="console-panel coverage-diagnostic" data-testid="ocp-coverage-diagnostic">
        <div className="panel-title-row">
          <h3>Coverage Diagnostic</h3>
          <span className="status-pill read-only">
            {diagnosticLoading ? "diagnosing" : "read-only"}
          </span>
        </div>
        {diagnostic ? (
          <>
            <div className="diagnostic-target">
              <strong>
                {diagnostic.resource.apiVersion}/{diagnostic.resource.name}
              </strong>
              <span className={`status-pill ${gapClass(diagnostic.coverage.gap.type)}`}>
                {diagnostic.coverage.gap.type}
              </span>
              <span>{diagnostic.coverage.gap.message}</span>
            </div>
            <div className="diagnostic-findings">
              {diagnostic.findings.map((item) => (
                <div className="diagnostic-finding" key={item.id}>
                  <span className={`status-pill ${item.status === "ok" ? "ready" : item.status === "skipped" || item.status === "missing" ? "read-only" : "danger"}`}>
                    {item.status}
                  </span>
                  <strong>{item.label}</strong>
                  <p>{item.message}</p>
                  <small>{item.evidence[0] ?? "read-only diagnostic evidence"}</small>
                </div>
              ))}
            </div>
            <div className="diagnostic-next">
              <strong>Next checks</strong>
              <ul>
                {diagnostic.nextChecks.slice(0, 4).map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p>Select a coverage row to inspect read-only diagnostic evidence.</p>
        )}
      </article>
    </section>
  );
}
