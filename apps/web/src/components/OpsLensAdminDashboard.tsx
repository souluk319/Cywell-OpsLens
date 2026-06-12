import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  OpsLensAdminOverviewResponse,
  OpsLensRagEvidenceExportResponse,
  OpsLensRagValidationResponse
} from "@kugnus/contracts";
import {
  Activity,
  Cpu,
  DatabaseZap,
  Download,
  FileDiff,
  Gauge,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import {
  exportOpsLensRagEvidence,
  fetchOpsLensAdminOverview,
  validateOpsLensRagDocument
} from "../lib/api";

const sampleDraftRunbook = `---
id: customer-runbook:payments-timeout-triage
label: Payments Timeout Triage
sourceType: customer-runbook
trustLevel: draft
---

# Payments Timeout Triage

결제 승인 지연이 감지되면 최근 10분의 API latency, gateway error rate, egress policy change, readiness probe 상태를 함께 확인한다.

1. Secret 원문은 조회하지 않고 key reference와 mount 상태만 확인한다.
2. payment authorization success rate가 하락했는지 확인한다.
3. 자동 rollback은 하지 않고 GitOps pull request로만 변경한다.`;

function numberText(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "--";
}

function percentText(value: number | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "--";
}

function statusClass(status: string) {
  if (status === "indexed" || status === "ready") return "fresh";
  if (
    status === "stale" ||
    status === "missing" ||
    status === "needs-live-check" ||
    status === "needs-configuration" ||
    status === "needs-evidence" ||
    status === "partial" ||
    status === "approval-required"
  ) {
    return "stale";
  }
  return "missing";
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function OpsLensAdminDashboard() {
  const [overview, setOverview] = useState<OpsLensAdminOverviewResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState("cywell-payments");
  const [fileName, setFileName] = useState("payments-timeout-triage.md");
  const [markdown, setMarkdown] = useState(sampleDraftRunbook);
  const [validation, setValidation] =
    useState<OpsLensRagValidationResponse | null>(null);
  const [evidenceExport, setEvidenceExport] =
    useState<OpsLensRagEvidenceExportResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      try {
        const response = await fetchOpsLensAdminOverview();
        if (!active) return;
        setOverview(response);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "admin overview failed");
      }
    }

    void loadOverview();

    return () => {
      active = false;
    };
  }, []);

  const tokenUsedPercent = useMemo(() => {
    if (!overview?.tokenUsage.budgetTokens) return 0;
    return Math.min(
      100,
      Math.round(
        (overview.tokenUsage.usedTokens / overview.tokenUsage.budgetTokens) * 100
      )
    );
  }, [overview]);

  const latestGpu = overview?.runtime.gpu.samples.at(-1);
  const metricQueries = overview?.incidents.flatMap(
    (incident) => incident.metricQueries
  );
  const remediationProposals =
    overview?.incidents.flatMap((incident) =>
      incident.remediationProposal
        ? [
            {
              incident,
              proposal: incident.remediationProposal
            }
          ]
        : []
    ) ?? [];
  const approvalPlan = overview?.installReadiness.approvalPlan;
  const externalRuntimePlan = overview?.installReadiness.externalRuntimePlan;
  const releasePlan = overview?.installReadiness.releasePlan;
  const checkpoint = overview?.installReadiness.checkpoint;
  const lightspeedMcp = overview?.lightspeed.mcp;
  const validationFailed = validation?.issues.some(
    (issue) => issue.severity === "fail"
  );

  async function runValidation() {
    setValidating(true);
    try {
      const response = await validateOpsLensRagDocument({
        tenantId,
        fileName,
        markdown
      });
      setValidation(response);
      setEvidenceExport(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RAG validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function exportEvidence() {
    setExporting(true);
    try {
      const response = await exportOpsLensRagEvidence({
        tenantId,
        fileName,
        markdown,
        requestedBy: "admin-dashboard",
        reason: "validate RAG draft before approval queue"
      });
      setEvidenceExport(response);
      setValidation(response.validation);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG evidence export failed"
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      className="opslens-admin-dashboard"
      aria-labelledby="opslens-admin-title"
      data-testid="opslens-admin-dashboard"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Cywell OpsLens</p>
          <h2 id="opslens-admin-title">Admin Dashboard</h2>
        </div>
        <div className="summary-strip" data-testid="opslens-admin-summary">
          <span>
            <DatabaseZap size={15} aria-hidden="true" />
            {numberText(overview?.rag.documents.length)} docs
          </span>
          <span>
            <Gauge size={15} aria-hidden="true" />
            {tokenUsedPercent}% tokens
          </span>
          <span>
            <Cpu size={15} aria-hidden="true" />
            {latestGpu ? `${latestGpu.utilizationPercent}% GPU` : "-- GPU"}
          </span>
        </div>
      </div>

      {error ? (
        <div className="ocp-error" data-testid="opslens-admin-error">
          {error}
        </div>
      ) : null}

      <div className="admin-grid">
        <article className="ops-card rag-admin-card" data-testid="opslens-rag-health">
          <div className="card-title-row">
            <h3>RAG Documents</h3>
            <button
              className="icon-button"
              type="button"
              title="Validate upload intake"
              aria-label="Validate upload intake"
              onClick={() => void runValidation()}
              disabled={validating}
            >
              <UploadCloud size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="resource-table compact">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Chunks</th>
                  <th>Citation</th>
                </tr>
              </thead>
              <tbody>
                {overview?.rag.documents.map((document) => (
                  <tr key={document.id}>
                    <td data-label="Document">
                      <strong>{document.label}</strong>
                      <small>{document.tenantId}</small>
                    </td>
                    <td data-label="Status">
                      <span className={`freshness ${statusClass(document.status)}`}>
                        {document.status}
                      </span>
                    </td>
                    <td data-label="Chunks">{document.chunkCount}</td>
                    <td data-label="Citation">{percentText(document.citationRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-evidence-line" data-testid="opslens-upload-intake">
            <span>{overview?.rag.uploadIntake.mode ?? "validate-only"}</span>
            <span>{numberText(overview?.rag.uploadIntake.pending)} pending</span>
            <span>{numberText(overview?.rag.uploadIntake.rejected)} rejected</span>
          </div>
          <div className="rag-validation-form" data-testid="opslens-rag-validation">
            <div className="rag-validation-fields">
              <label>
                Tenant
                <input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                />
              </label>
              <label>
                File
                <input
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                />
              </label>
            </div>
            <textarea
              aria-label="RAG document markdown"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            <div className="rag-validation-actions">
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void runValidation()}
                disabled={validating}
              >
                <UploadCloud size={16} aria-hidden="true" />
                {validating ? "Validating" : "Validate"}
              </button>
              {validation ? (
                <span
                  className={`status-pill ${validation.accepted ? "ready" : "danger"}`}
                >
                  {validation.accepted ? "accepted" : "rejected"}
                </span>
              ) : null}
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void exportEvidence()}
                disabled={exporting}
              >
                <Download size={16} aria-hidden="true" />
                {exporting ? "Exporting" : "Export Evidence"}
              </button>
            </div>
            {validation ? (
              <div className="rag-validation-result">
                <div className="admin-evidence-line">
                  <span>{validation.actionMode}</span>
                  <span>redactions {validation.redactionCount}</span>
                  <span>chunks {validation.chunks.length}</span>
                  <span>rawDocumentReturned=false</span>
                </div>
                <ul>
                  {validation.issues
                    .filter((issue) => issue.severity !== "pass" || validationFailed)
                    .slice(0, 4)
                    .map((issue) => (
                      <li key={`${issue.code}-${issue.message}`}>
                        <strong>{issue.severity}</strong>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                </ul>
                {evidenceExport ? (
                  <div
                    className="rag-export-summary"
                    data-testid="opslens-rag-evidence-export"
                  >
                    <div className="admin-evidence-line">
                      <span>{evidenceExport.exportId}</span>
                      <span>{evidenceExport.approvalQueue.mode}</span>
                      <span>enqueueAllowed=false</span>
                      <span>{evidenceExport.audit.validationHash.slice(0, 12)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>

        <article className="ops-card token-admin-card" data-testid="opslens-token-usage">
          <div className="card-title-row">
            <h3>Token Usage</h3>
            <Activity size={18} aria-hidden="true" />
          </div>
          <div className="token-budget">
            <div
              className="token-budget-fill"
              style={{ "--budget": `${tokenUsedPercent}%` } as CSSProperties}
            />
            <strong>{numberText(overview?.tokenUsage.usedTokens)}</strong>
            <span>/ {numberText(overview?.tokenUsage.budgetTokens)}</span>
          </div>
          <div className="route-usage-list">
            {overview?.tokenUsage.routes.map((route) => {
              const routeTotal = route.inputTokens + route.outputTokens;
              const width = overview.tokenUsage.usedTokens
                ? Math.max(4, Math.round((routeTotal / overview.tokenUsage.usedTokens) * 100))
                : 0;
              return (
                <div className="route-usage-row" key={route.route}>
                  <span>{route.route}</span>
                  <div>
                    <i style={{ "--route": `${width}%` } as CSSProperties} />
                  </div>
                  <strong>{numberText(routeTotal)}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article
          className="ops-card mcp-admin-card"
          data-testid="opslens-mcp-tool-surface"
        >
          <div className="card-title-row">
            <h3>Lightspeed MCP Tools</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="admin-evidence-line">
            <span>{numberText(lightspeedMcp?.toolCount)} tools</span>
            <span>{lightspeedMcp?.endpoint ?? "/mcp"}</span>
            <span>readOnly={numberText(lightspeedMcp?.readOnlyCount)}</span>
            <span>apply_remediation excluded</span>
          </div>
          <div className="mcp-tool-list">
            {lightspeedMcp?.tools.map((tool) => (
              <div
                className="mcp-tool-row"
                data-testid={`opslens-mcp-tool-${tool.name}`}
                key={tool.name}
              >
                <span
                  className={`freshness ${
                    tool.actionMode === "planOnly" ? "stale" : "fresh"
                  }`}
                >
                  {tool.actionMode}
                </span>
                <strong>{tool.name}</strong>
                <small>{tool.category}</small>
                <small>{tool.dashboardSurface}</small>
              </div>
            ))}
          </div>
          {lightspeedMcp?.evidence.slice(0, 2).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
        </article>

        <article className="ops-card gpu-admin-card" data-testid="opslens-gpu-runtime">
          <div className="card-title-row">
            <h3>Runtime</h3>
            <Cpu size={18} aria-hidden="true" />
          </div>
          <dl className="metric-list">
            <div>
              <dt>Model</dt>
              <dd>{overview?.runtime.model ?? "--"}</dd>
            </div>
            <div>
              <dt>Ready</dt>
              <dd>
                {overview
                  ? `${overview.runtime.readyReplicas}/${overview.runtime.replicas}`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>Memory</dt>
              <dd>
                {latestGpu
                  ? `${latestGpu.memoryUsedGiB}/${latestGpu.memoryTotalGiB} GiB`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{overview?.runtime.readiness.status ?? "--"}</dd>
            </div>
          </dl>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-readiness"
          >
            <span>{overview?.runtime.readiness.actionMode ?? "readOnly"}</span>
            <span>
              qdrant={overview?.runtime.readiness.vectorStore.status ?? "--"}
            </span>
            <span>
              vllm={overview?.runtime.readiness.modelRuntime.status ?? "--"}
            </span>
            <span>
              liveProbe=
              {String(
                overview?.runtime.readiness.vectorStore.liveProbeEnabled ?? false
              )}
            </span>
          </div>
          {overview?.runtime.readiness.missingEvidence.slice(0, 2).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
          <div className="gpu-sparkline" aria-label="GPU utilization samples">
            {overview?.runtime.gpu.samples.map((sample) => (
              <span
                key={sample.timestamp}
                title={`${shortTime(sample.timestamp)} ${sample.utilizationPercent}%`}
                style={{ "--gpu": `${sample.utilizationPercent}%` } as CSSProperties}
              />
            ))}
          </div>
        </article>

        <article
          className="ops-card metric-admin-card"
          data-testid="opslens-incident-metrics"
        >
          <div className="card-title-row">
            <h3>Incident Metrics</h3>
            <Gauge size={18} aria-hidden="true" />
          </div>
          <div className="metric-query-list">
            {metricQueries?.map((query) => (
              <div className="metric-query-row" key={`${query.name}-${query.query}`}>
                <span className={`freshness ${statusClass(query.status)}`}>
                  {query.status}
                </span>
                <strong>{query.name}</strong>
                <small>{query.sampleCount} samples</small>
              </div>
            ))}
          </div>
          <div
            className="remediation-review-list"
            data-testid="opslens-remediation-proposals"
          >
            {remediationProposals.map(({ incident, proposal }) => (
              <div
                className="remediation-review"
                data-testid="opslens-remediation-proposal"
                key={`${incident.incidentId}-${proposal.target.name}`}
              >
                <div className="card-title-row compact">
                  <div>
                    <h4>{incident.alertName}</h4>
                    <small>
                      {proposal.target.kind}/{proposal.target.name}
                    </small>
                  </div>
                  <FileDiff size={18} aria-hidden="true" />
                </div>
                <div className="remediation-target-grid">
                  <div>
                    <span>Mode</span>
                    <strong>{proposal.actionMode}</strong>
                  </div>
                  <div>
                    <span>Patch</span>
                    <strong>{proposal.patchType}</strong>
                  </div>
                  <div>
                    <span>Current</span>
                    <strong>{proposal.currentValue.value}</strong>
                  </div>
                  <div>
                    <span>Proposed</span>
                    <strong>{proposal.proposedValue.value}</strong>
                  </div>
                </div>
                <pre className="remediation-yaml">{proposal.yamlPatch}</pre>
                <div className="admin-evidence-line">
                  <span>mutationAllowed=false</span>
                  <span>reviewGate={String(proposal.reviewGate.required)}</span>
                  <span>targetConfidence={proposal.target.confidence}</span>
                  <span>{proposal.target.fieldPath}</span>
                </div>
                <div className="remediation-notes">
                  <p>{proposal.risks[0]}</p>
                  <p>{proposal.rollbackPath[0]}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article
          className="ops-card readiness-admin-card"
          data-testid="opslens-install-readiness"
        >
          <div className="card-title-row">
            <h3>Install Readiness</h3>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="readiness-grid">
            {overview
              ? Object.entries({
                  "Lightspeed MCP": overview.installReadiness.lightspeedMcp,
                  "Console Dashboard": overview.installReadiness.consoleDashboard,
                  Operator: overview.installReadiness.operatorPackaging,
                  "Operator Dry-run": overview.installReadiness.operatorDryRun,
                  "Install Plan": overview.installReadiness.installPlan,
                  "Image Builds": overview.installReadiness.imageBuilds,
                  "External Runtime":
                    overview.installReadiness.externalRuntimeImages,
                  "Release Publish": overview.installReadiness.releasePublish,
                  "Evidence Checkpoint":
                    overview.installReadiness.evidenceCheckpoint,
                  Certification: overview.installReadiness.certification
                }).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong className={`freshness ${statusClass(value)}`}>
                      {value}
                    </strong>
                  </div>
                ))
              : null}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-install-readiness-evidence"
          >
            <span>dashboard-only</span>
            <span>mutationAllowed=false</span>
            <span>rawDocumentReturned=false</span>
          </div>
          {overview?.installReadiness.evidence.slice(0, 3).map((item) => (
            <p className="readiness-note" key={item}>
              {item}
            </p>
          ))}
          {checkpoint ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-evidence-checkpoint"
            >
              <div className="admin-evidence-line">
                <span>{checkpoint.artifactStatus}</span>
                <span>head={checkpoint.headSha}</span>
                <span>dirty={String(checkpoint.worktreeDirty)}</span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Checkpoint Lanes</span>
                  <strong>
                    {checkpoint.lanes.length
                      ? checkpoint.lanes
                          .map((lane) => `${lane.label}:${lane.status}`)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {checkpoint.blockers.length
                      ? `${checkpoint.blockers.length} blockers`
                      : `${checkpoint.missingEvidence.length} missing evidence`}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {checkpoint.risk[0] ??
                    "Checkpoint reads local evidence only and does not approve mutation."}
                </p>
                <p>
                  {checkpoint.rollbackPath[0] ??
                    "Refresh stale evidence before install or publish approval."}
                </p>
              </div>
            </div>
          ) : null}
          {approvalPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-install-approval-plan"
            >
              <div className="admin-evidence-line">
                <span>{approvalPlan.actionMode}</span>
                <span>
                  clusterMutationAttempted=
                  {String(approvalPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(approvalPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Approvals</span>
                  <strong>{approvalPlan.requiredApprovals.join(", ")}</strong>
                </div>
                <div>
                  <span>Mutating Commands</span>
                  <strong>
                    {approvalPlan.mutatingCommands.length
                      ? approvalPlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {approvalPlan.risk[0] ??
                    "Mutating install commands remain blocked until approval."}
                </p>
                <p>
                  {approvalPlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before install."}
                </p>
              </div>
            </div>
          ) : null}
          {externalRuntimePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-external-runtime-plan"
            >
              <div className="admin-evidence-line">
                <span>{externalRuntimePlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(externalRuntimePlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(externalRuntimePlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(externalRuntimePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Runtime Images</span>
                  <strong>
                    {externalRuntimePlan.externalImages.length
                      ? externalRuntimePlan.externalImages
                          .map((image) => `${image.name}:${image.status}`)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Mirror Commands</span>
                  <strong>
                    {externalRuntimePlan.mutatingCommands.length
                      ? externalRuntimePlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {externalRuntimePlan.risk[0] ??
                    "External runtime mirror commands remain blocked until approval."}
                </p>
                <p>
                  {externalRuntimePlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before mirroring runtime images."}
                </p>
              </div>
            </div>
          ) : null}
          {releasePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-publish-plan"
            >
              <div className="admin-evidence-line">
                <span>{releasePlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(releasePlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releasePlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releasePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Approvals</span>
                  <strong>{releasePlan.requiredApprovals.join(", ")}</strong>
                </div>
                <div>
                  <span>Publish Commands</span>
                  <strong>
                    {releasePlan.mutatingCommands.length
                      ? releasePlan.mutatingCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {releasePlan.risk[0] ??
                    "Release publish commands remain blocked until approval."}
                </p>
                <p>
                  {releasePlan.rollbackPath[0] ??
                    "Rollback path must be reviewed before publishing images."}
                </p>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
