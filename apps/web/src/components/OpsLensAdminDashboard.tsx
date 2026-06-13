import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  OpsLensAdminOverviewResponse,
  OpsLensRagApprovalQueueIngestionPlanResponse,
  OpsLensRagApprovalQueueInventoryResponse,
  OpsLensRagApprovalQueueReviewResponse,
  OpsLensRagApprovalQueueSubmissionResponse,
  OpsLensRagEvidenceExportResponse,
  OpsLensRagValidationResponse
} from "@kugnus/contracts";
import {
  Activity,
  CheckCircle2,
  Cpu,
  DatabaseZap,
  Download,
  FileDiff,
  Gauge,
  ListChecks,
  ShieldCheck,
  UploadCloud,
  XCircle
} from "lucide-react";
import {
  exportOpsLensRagEvidence,
  fetchOpsLensAdminOverview,
  fetchOpsLensRagApprovalQueue,
  planOpsLensRagIngestion,
  reviewOpsLensRagApprovalQueue,
  submitOpsLensRagApprovalQueue,
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
  if (
    status === "indexed" ||
    status === "ready" ||
    status === "ready-for-ingestion-job" ||
    status === "ready-for-dry-run" ||
    status === "ready-for-review" ||
    status === "ready-for-scan"
  ) {
    return "fresh";
  }
  if (
    status === "stale" ||
    status === "missing" ||
    status === "needs-live-check" ||
    status === "needs-live-evidence" ||
    status === "needs-configuration" ||
    status === "needs-evidence" ||
    status === "partial" ||
    status === "approval-required" ||
    status === "needs-tooling"
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
  const [queueSubmission, setQueueSubmission] =
    useState<OpsLensRagApprovalQueueSubmissionResponse | null>(null);
  const [queueReview, setQueueReview] =
    useState<OpsLensRagApprovalQueueReviewResponse | null>(null);
  const [queueIngestionPlan, setQueueIngestionPlan] =
    useState<OpsLensRagApprovalQueueIngestionPlanResponse | null>(null);
  const [queueInventory, setQueueInventory] =
    useState<OpsLensRagApprovalQueueInventoryResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);
  const [planningItemId, setPlanningItemId] = useState<string | null>(null);

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

    async function loadQueueInventory() {
      try {
        const response = await fetchOpsLensRagApprovalQueue();
        if (!active) return;
        setQueueInventory(response);
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "RAG approval queue inventory failed"
        );
      }
    }

    void loadOverview();
    void loadQueueInventory();

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
  const aiopsPipeline = overview?.aiops.incidentPipeline;
  const alertmanagerIntake = aiopsPipeline?.alertmanagerIntake;
  const approvalPlan = overview?.installReadiness.approvalPlan;
  const certificationPlan = overview?.installReadiness.certificationPlan;
  const catalogToolchainPlan =
    overview?.installReadiness.catalogToolchainPlan;
  const externalRuntimePlan = overview?.installReadiness.externalRuntimePlan;
  const externalRuntimeReview =
    overview?.installReadiness.externalRuntimeReview;
  const securityScanPlan = overview?.installReadiness.securityScanPlan;
  const ownedImageProvenancePlan =
    overview?.installReadiness.ownedImageProvenancePlan;
  const releasePlan = overview?.installReadiness.releasePlan;
  const releaseRefresh = overview?.installReadiness.refresh;
  const releaseBundle = overview?.installReadiness.bundle;
  const releaseBundlePacketName =
    releaseBundle?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const releaseActionQueue = overview?.installReadiness.actionQueue;
  const releaseCandidateActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("candidate-matrix")
    ) ?? [];
  const releaseSecurityReviewActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.startsWith("security-review-")
    ) ?? [];
  const releaseCatalogRegistryActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("catalog-base-image")
    ) ?? [];
  const releaseRuntimeLiveActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("runtime") ||
        entry.id.includes("runtime-rag") ||
        entry.id.includes("rag-owner-enable-production")
    ) ?? [];
  const releaseMonitoringProxyActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("aiopsIncidentPipeline") ||
        entry.id.includes("monitoring-proxy")
    ) ?? [];
  const releaseLightspeedReadinessActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.id.includes("lightspeed-readiness") ||
        entry.source.includes("lightspeedReadiness")
    ) ?? [];
  const releaseActionQueuePacketName =
    releaseActionQueue?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const checkpoint = overview?.installReadiness.checkpoint;
  const liveHandoff = overview?.installReadiness.handoff;
  const networkHandoff = overview?.installReadiness.networkHandoff;
  const authRbacPlan = overview?.installReadiness.authRbacPlan;
  const ocpConnectivity = overview?.installReadiness.connectivity;
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
      setQueueSubmission(null);
      setQueueReview(null);
      setQueueIngestionPlan(null);
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
      setQueueSubmission(null);
      setQueueReview(null);
      setQueueIngestionPlan(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG evidence export failed"
      );
    } finally {
      setExporting(false);
    }
  }

  async function submitApprovalQueue() {
    setQueueing(true);
    try {
      const response = await submitOpsLensRagApprovalQueue({
        tenantId,
        fileName,
        markdown,
        requestedBy: "admin-dashboard",
        reason: "submit redacted validation evidence for human approval",
        ticketRef: "dashboard-local-draft"
      });
      setQueueSubmission(response);
      setValidation(response.validation);
      setQueueReview(null);
      setQueueIngestionPlan(null);
      setQueueInventory(await fetchOpsLensRagApprovalQueue());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG approval queue submit failed"
      );
    } finally {
      setQueueing(false);
    }
  }

  async function reviewQueueItem(
    item: OpsLensRagApprovalQueueInventoryResponse["items"][number],
    decision: "approve" | "reject"
  ) {
    const approvedRoles = new Set(item.approvals.map((approval) => approval.role));
    const nextRole =
      item.requiredApprovals.find((role) => !approvedRoles.has(role)) ??
      item.requiredApprovals[0] ??
      "rag-owner";
    const reviewKey = `${item.queueItemId}-${decision}`;
    setReviewingItemId(reviewKey);
    try {
      const response = await reviewOpsLensRagApprovalQueue({
        tenantId: item.tenantId,
        queueItemId: item.queueItemId,
        reviewer: "admin-dashboard",
        role: nextRole,
        decision,
        reason: `${decision} redacted RAG queue evidence from dashboard review`,
        ticketRef: item.audit.ticketRef ?? "dashboard-review"
      });
      setQueueReview(response);
      setQueueIngestionPlan(null);
      setQueueInventory(await fetchOpsLensRagApprovalQueue());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG approval queue review failed"
      );
    } finally {
      setReviewingItemId(null);
    }
  }

  async function planQueueIngestion(
    item: OpsLensRagApprovalQueueInventoryResponse["items"][number]
  ) {
    setPlanningItemId(item.queueItemId);
    try {
      const response = await planOpsLensRagIngestion({
        tenantId: item.tenantId,
        queueItemId: item.queueItemId,
        requestedBy: "admin-dashboard",
        reason: "plan approved RAG queue ingestion without vector writes",
        ticketRef: item.audit.ticketRef ?? "dashboard-ingestion-plan"
      });
      setQueueIngestionPlan(response);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "RAG ingestion plan failed"
      );
    } finally {
      setPlanningItemId(null);
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
          <div
            className="rag-export-summary"
            data-testid="opslens-rag-approval-queue-inventory"
          >
            <div className="admin-evidence-line">
              <span>{queueInventory?.mode ?? "designOnly"}</span>
              <span>{numberText(queueInventory?.itemCount)} queued</span>
              <span>readOnly=true</span>
              <span>
                vectorWrite={String(
                  queueInventory?.policy.vectorWriteAllowed ?? false
                )}
              </span>
              <span>
                approvalMutation={String(
                  queueInventory?.policy.approvalMutationAllowed ?? false
                )}
              </span>
            </div>
            {queueInventory?.items.slice(0, 3).map((item) => (
              <div className="admin-evidence-line" key={item.queueItemId}>
                <span>{item.queueItemId}</span>
                <span>{item.state}</span>
                <span>{item.tenantId}</span>
                <span>approvals {item.approvals.length}</span>
                {item.state === "pending-human-approval" ? (
                  <>
                    <button
                      className="icon-button"
                      type="button"
                      title="Approve queued RAG evidence"
                      aria-label={`Approve ${item.queueItemId}`}
                      onClick={() => void reviewQueueItem(item, "approve")}
                      disabled={reviewingItemId === `${item.queueItemId}-approve`}
                    >
                      <CheckCircle2 size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      title="Reject queued RAG evidence"
                      aria-label={`Reject ${item.queueItemId}`}
                      onClick={() => void reviewQueueItem(item, "reject")}
                      disabled={reviewingItemId === `${item.queueItemId}-reject`}
                    >
                      <XCircle size={15} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {item.state === "approved-for-ingestion" ? (
                  <button
                    className="icon-button"
                    type="button"
                    title="Plan RAG ingestion job"
                    aria-label={`Plan ingestion ${item.queueItemId}`}
                    onClick={() => void planQueueIngestion(item)}
                    disabled={planningItemId === item.queueItemId}
                  >
                    <DatabaseZap size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            {queueReview ? (
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-approval-review"
              >
                <span>{queueReview.actionMode}</span>
                <span>{queueReview.decision}</span>
                <span>{queueReview.state}</span>
                <span>
                  queueMetadataWrite=
                  {String(queueReview.policy.queueMetadataWriteAllowed)}
                </span>
                <span>
                  vectorWrite={String(queueReview.policy.vectorWriteAllowed)}
                </span>
                <span>
                  ingestionJobCreated=
                  {String(queueReview.content.ingestionJobCreated)}
                </span>
              </div>
            ) : null}
            {queueIngestionPlan ? (
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-ingestion-plan"
              >
                <span>{queueIngestionPlan.actionMode}</span>
                <span>{queueIngestionPlan.plannedJob.status}</span>
                <span>
                  approved={String(queueIngestionPlan.approvedForIngestion)}
                </span>
                <span>
                  vectorWrite={String(queueIngestionPlan.policy.vectorWriteAllowed)}
                </span>
                <span>
                  ingestionJobCreated=
                  {String(queueIngestionPlan.content.ingestionJobCreated)}
                </span>
              </div>
            ) : null}
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
              <button
                className="text-icon-button"
                type="button"
                onClick={() => void submitApprovalQueue()}
                disabled={queueing}
              >
                <FileDiff size={16} aria-hidden="true" />
                {queueing ? "Queueing" : "Queue Evidence"}
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
                {queueSubmission ? (
                  <div
                    className="rag-export-summary"
                    data-testid="opslens-rag-approval-queue"
                  >
                    <div className="admin-evidence-line">
                      <span>{queueSubmission.queueItemId}</span>
                      <span>{queueSubmission.state}</span>
                      <span>{queueSubmission.approvalQueue.mode}</span>
                      <span>
                        persisted={String(queueSubmission.approvalQueue.persisted)}
                      </span>
                      <span>
                        vectorWrite={String(
                          queueSubmission.policy.vectorWriteAllowed
                        )}
                      </span>
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
            <span data-testid="opslens-lightspeed-routing-score">
              routing={numberText(lightspeedMcp?.routing?.selectedPasses)}/
              {numberText(lightspeedMcp?.routing?.total)}
            </span>
          </div>
          <div className="admin-evidence-line">
            <span>{lightspeedMcp?.routing?.status ?? "needs-evidence"}</span>
            <span>
              responses={numberText(lightspeedMcp?.routing?.responsePasses)}/
              {numberText(lightspeedMcp?.routing?.total)}
            </span>
            <span>threshold={numberText(lightspeedMcp?.routing?.threshold)}</span>
            <span>head={lightspeedMcp?.routing?.headSha ?? "missing"}</span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-lightspeed-trojan-horse"
          >
            <span>{lightspeedMcp?.trojanHorse.status ?? "needs-evidence"}</span>
            <span>tool={lightspeedMcp?.trojanHorse.selectedTool ?? "missing"}</span>
            <span>
              citations={numberText(lightspeedMcp?.trojanHorse.citationCount)}
            </span>
            <span>
              redaction={String(lightspeedMcp?.trojanHorse.redactionPassed)}
            </span>
            <span>
              mutationAllowed=
              {String(lightspeedMcp?.trojanHorse.mutationAllowed)}
            </span>
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
                <div
                  className="admin-evidence-line"
                  data-testid="opslens-remediation-trigger-evidence"
                >
                  <span>
                    logs={String(proposal.triggerEvidence.logs.currentRead)}:
                    {proposal.triggerEvidence.logs.windowMinutes}m
                  </span>
                  <span>
                    events={String(proposal.triggerEvidence.events.read)}:
                    {proposal.triggerEvidence.events.count}
                  </span>
                  <span>
                    metrics=
                    {proposal.triggerEvidence.metrics.queries
                      .map((query) => `${query.name}:${query.status}`)
                      .join(", ")}
                  </span>
                  <span>
                    runbooks={proposal.triggerEvidence.runbookCitations.length}
                  </span>
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
          className="ops-card aiops-pipeline-card"
          data-testid="opslens-aiops-pipeline"
        >
          <div className="card-title-row">
            <h3>AI Ops Pipeline</h3>
            <ListChecks size={18} aria-hidden="true" />
          </div>
          <div className="readiness-grid">
            <div>
              <span>Status</span>
              <strong
                className={`freshness ${statusClass(
                  aiopsPipeline?.status ?? "needs-live-evidence"
                )}`}
              >
                {aiopsPipeline?.status ?? "needs-live-evidence"}
              </strong>
            </div>
            <div>
              <span>Live Smoke</span>
              <strong>{aiopsPipeline?.liveSmokeStatus ?? "missing"}</strong>
            </div>
            <div>
              <span>Head</span>
              <strong>{aiopsPipeline?.headSha ?? "missing"}</strong>
            </div>
            <div>
              <span>Selected Pod</span>
              <strong>
                {aiopsPipeline?.selectedPod
                  ? `${aiopsPipeline.selectedPod.namespace}/${aiopsPipeline.selectedPod.name}`
                  : "missing"}
              </strong>
            </div>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-aiops-pipeline-evidence"
          >
            <span>{aiopsPipeline?.actionMode ?? "readOnlyEvidenceOnly"}</span>
            <span>
              clusterMutationAttempted=
              {String(aiopsPipeline?.clusterMutationAttempted ?? false)}
            </span>
            <span>
              vectorWriteAttempted=
              {String(aiopsPipeline?.vectorWriteAttempted ?? false)}
            </span>
            <span>
              ingestionJobCreated=
              {String(aiopsPipeline?.ingestionJobCreated ?? false)}
            </span>
            <span>verify:aiops</span>
            <span>
              triggerEvidence=
              {(aiopsPipeline?.triggerEvidenceRequired ?? []).join("/")}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-alertmanager-intake"
          >
            <span>Alertmanager</span>
            <span>
              {alertmanagerIntake?.artifactType ??
                "opslens.alertmanager-incident-intake.v0.1"}
            </span>
            <span>
              accepted={alertmanagerIntake?.acceptedCount ?? 0}/
              {alertmanagerIntake?.alertCount ?? 0}
            </span>
            <span>
              rawAlertReturned=
              {String(alertmanagerIntake?.rawAlertReturned ?? false)}
            </span>
            <span>
              clusterMutationAttempted=
              {String(alertmanagerIntake?.clusterMutationAttempted ?? false)}
            </span>
            <span>
              mutationAllowed=
              {String(alertmanagerIntake?.mutationAllowed ?? false)}
            </span>
          </div>
          <div className="metric-query-list">
            {aiopsPipeline?.metricQueries.map((query) => (
              <div className="metric-query-row" key={query.name}>
                <span className={`freshness ${statusClass(query.status)}`}>
                  {query.status}
                </span>
                <strong>{query.name}</strong>
                <small>{query.sampleCount} samples</small>
              </div>
            ))}
          </div>
          <div className="remediation-notes">
            {(aiopsPipeline?.missingEvidence.length
              ? aiopsPipeline.missingEvidence
              : aiopsPipeline?.evidence ?? []
            )
              .slice(0, 2)
              .map((item) => (
                <p key={item}>{item}</p>
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
                  "AI Ops Pipeline": overview.aiops.incidentPipeline.status,
                  "Console Dashboard": overview.installReadiness.consoleDashboard,
                  Operator: overview.installReadiness.operatorPackaging,
                  "OCP Connectivity": overview.installReadiness.ocpConnectivity,
                  "Operator Dry-run": overview.installReadiness.operatorDryRun,
                  "Install Plan": overview.installReadiness.installPlan,
                  "RAG Ingestion":
                    overview.installReadiness.approvalPlan.ragIngestion.status,
                  "Certification Evidence":
                    overview.installReadiness.certificationReadiness,
                  "Catalog Toolchain":
                    overview.installReadiness.catalogToolchain,
                  "Image Builds": overview.installReadiness.imageBuilds,
                  "Owned Provenance":
                    overview.installReadiness.ownedImageProvenance,
                  "External Runtime":
                    overview.installReadiness.externalRuntimeImages,
                  "Runtime Review":
                    overview.installReadiness.externalRuntimeReviewPacket,
                  "Security Scan": overview.installReadiness.securityScan,
                  "Release Publish": overview.installReadiness.releasePublish,
                  "Release Refresh": overview.installReadiness.releaseRefresh,
                  "Release Bundle":
                    overview.installReadiness.releaseEvidenceBundle,
                  "Release Action": overview.installReadiness.releaseActionQueue,
                  "Evidence Checkpoint":
                    overview.installReadiness.evidenceCheckpoint,
                  "Live Handoff": overview.installReadiness.liveHandoff,
                  "Network Handoff":
                    overview.installReadiness.ocpNetworkHandoff,
                  "Auth/RBAC Plan":
                    overview.installReadiness.ocpAuthRbacPlan,
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
          {ocpConnectivity ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-connectivity"
            >
              <div className="admin-evidence-line">
                <span>{ocpConnectivity.artifactStatus}</span>
                <span>classification={ocpConnectivity.classification}</span>
                <span>{ocpConnectivity.actionMode}</span>
                <span>
                  clusterMutationAttempted=
                  {String(ocpConnectivity.clusterMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Target</span>
                  <strong>
                    {ocpConnectivity.target.host}:{ocpConnectivity.target.port}
                  </strong>
                </div>
                <div>
                  <span>Network</span>
                  <strong>
                    dns={ocpConnectivity.diagnostics.dns}, tcp=
                    {ocpConnectivity.diagnostics.tcp}
                  </strong>
                </div>
                <div>
                  <span>API</span>
                  <strong>
                    tls={ocpConnectivity.diagnostics.tls}, version=
                    {ocpConnectivity.diagnostics.kubernetesVersion}
                  </strong>
                </div>
                <div>
                  <span>Auth Boundary</span>
                  <strong>
                    token={String(ocpConnectivity.target.tokenConfigured)},
                    tlsVerify={String(ocpConnectivity.target.tlsVerify)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-connectivity-rbac"
              >
                {ocpConnectivity.diagnostics.rbacAccessReviews.length ? (
                  ocpConnectivity.diagnostics.rbacAccessReviews.map((review) => (
                    <span key={review.id}>
                      {review.id}={review.status} required=
                      {String(review.required)}
                    </span>
                  ))
                ) : (
                  <span>rbacAccessReviews=missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-connectivity-actions"
              >
                {ocpConnectivity.actionHints.slice(0, 2).map((hint) => (
                  <span key={hint.id}>
                    {hint.severity}:{hint.id} next={hint.nextCheck}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-commands"
              >
                {ocpConnectivity.readOnlyTroubleshootingCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      {command.id} mutation={String(command.mutation)}
                    </span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {ocpConnectivity.risk[0] ??
                    "Connectivity diagnostic reads only and does not approve mutation."}
                </p>
                <p>
                  {ocpConnectivity.rollbackPath[0] ??
                    "Refresh OCP connectivity evidence before live install checks."}
                </p>
              </div>
            </div>
          ) : null}
          {networkHandoff ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-network-handoff"
            >
              <div className="admin-evidence-line">
                <span>{networkHandoff.artifactStatus}</span>
                <span>{networkHandoff.actionMode}</span>
                <span>classification={networkHandoff.classification}</span>
                <span>
                  clusterMutationAttempted=
                  {String(networkHandoff.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(networkHandoff.registryMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Target</span>
                  <strong>
                    {networkHandoff.target.host}:{networkHandoff.target.port}
                  </strong>
                </div>
                <div>
                  <span>Packet</span>
                  <strong>
                    {networkHandoff.markdownPath.split(/[\\/]/).pop() ??
                      networkHandoff.markdownPath}
                  </strong>
                </div>
                <div>
                  <span>Admin Ask</span>
                  <strong>
                    {networkHandoff.adminRequests.length
                      ? networkHandoff.adminRequests.slice(0, 2).join(" ")
                      : "generate handoff packet"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-handoff-commands"
              >
                {networkHandoff.readOnlyCommands.slice(0, 4).map((command) => (
                  <span key={command.id}>
                    {command.id} mutation={String(command.mutation)}
                  </span>
                ))}
              </div>
              <div className="admin-evidence-line">
                {networkHandoff.sourceArtifacts.slice(0, 3).map((source) => (
                  <span key={source.id}>
                    {source.id} fresh={String(source.fresh)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {networkHandoff.risk[0] ??
                    "Network handoff is a ticket packet only and does not approve mutation."}
                </p>
                <p>
                  {networkHandoff.rollbackPath[0] ??
                    "Regenerate the handoff after OCP network evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {authRbacPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-auth-rbac-plan"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>OCP Auth/RBAC Plan</h4>
                  <small>{authRbacPlan.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{authRbacPlan.artifactStatus}</span>
                <span>classification={authRbacPlan.classification}</span>
                <span>
                  clusterMutationAttempted=
                  {String(authRbacPlan.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(authRbacPlan.registryMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Namespace</span>
                  <strong>{authRbacPlan.rbac.namespace}</strong>
                </div>
                <div>
                  <span>Reader</span>
                  <strong>{authRbacPlan.rbac.serviceAccount}</strong>
                </div>
                <div>
                  <span>ClusterRole</span>
                  <strong>
                    {authRbacPlan.rbac.clusterRole} rules=
                    {authRbacPlan.rbac.ruleCount}
                  </strong>
                </div>
                <div>
                  <span>Policy</span>
                  <strong>
                    readOnly={String(authRbacPlan.rbac.readOnlyOnly)},
                    secrets={String(authRbacPlan.rbac.secretsIncluded)}
                  </strong>
                </div>
                <div>
                  <span>Commands</span>
                  <strong>
                    readOnly={authRbacPlan.readOnlyCommands.length}, gated=
                    {authRbacPlan.approvalGatedCommands.length}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-commands"
              >
                {authRbacPlan.readOnlyCommands.slice(0, 4).map((command) => (
                  <span key={command.id}>
                    {command.id} mutation={String(command.mutation)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-approval"
              >
                {authRbacPlan.approvalGatedCommands.slice(0, 3).map((command) => (
                  <span key={command.id}>
                    {command.id} approval=
                    {String(command.requiresExplicitApproval)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {authRbacPlan.risk[0] ??
                    "Auth/RBAC plan separates fallback reader approval from Operator controller RBAC."}
                </p>
                <p>
                  {authRbacPlan.rollbackPath[0] ??
                    "Regenerate the auth/RBAC plan after OCP connectivity evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {liveHandoff ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-live-handoff"
            >
              <div className="admin-evidence-line">
                <span>{liveHandoff.artifactStatus}</span>
                <span>{liveHandoff.actionMode}</span>
                <span>gap={liveHandoff.currentGapClassification}</span>
                <span>
                  smoke={liveHandoff.postApprovalSmoke.artifactStatus}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(liveHandoff.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(liveHandoff.registryMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Read-only Commands</span>
                  <strong>
                    {liveHandoff.readOnlyCommands.length
                      ? liveHandoff.readOnlyCommands
                          .slice(0, 4)
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until handoff exists"}
                  </strong>
                </div>
                <div>
                  <span>Action Hints</span>
                  <strong>
                    {liveHandoff.actionHints.length
                      ? liveHandoff.actionHints
                          .slice(0, 2)
                          .map((hint) => hint.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Post-approval Smoke</span>
                  <strong>
                    {liveHandoff.postApprovalSmoke.requiredAfterAuthRbacApproval
                      ? `${liveHandoff.postApprovalSmoke.artifactStatus} rbac=${String(
                          liveHandoff.postApprovalSmoke.requiredRbacAllowed
                        )}`
                      : "verify:ocp:live-reader-smoke"}
                  </strong>
                </div>
                <div>
                  <span>Forbidden</span>
                  <strong>
                    {liveHandoff.forbiddenCommands.slice(0, 3).join(", ")}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {liveHandoff.risk[0] ??
                    "Live handoff collects evidence only and does not approve mutation."}
                </p>
                <p>
                  {liveHandoff.rollbackPath[0] ??
                    "Regenerate the handoff after live evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseRefresh ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-refresh"
            >
              <div className="admin-evidence-line">
                <span>{releaseRefresh.artifactStatus}</span>
                <span>{releaseRefresh.actionMode}</span>
                <span>head={releaseRefresh.headSha}</span>
                <span>dirty={String(releaseRefresh.worktreeDirty)}</span>
                <span>
                  localDockerBuildAllowed=
                  {String(releaseRefresh.localDockerBuildAllowed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseRefresh.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseRefresh.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseRefresh.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Commands</span>
                  <strong>
                    {releaseRefresh.commands.length
                      ? releaseRefresh.commands
                          .slice(0, 5)
                          .map((command) => `${command.id}:${command.status}`)
                          .join(", ")
                      : "blocked until refresh exists"}
                  </strong>
                </div>
                <div>
                  <span>Fresh Artifacts</span>
                  <strong>
                    {
                      releaseRefresh.artifacts.filter((artifact) => artifact.fresh)
                        .length
                    }
                    /{releaseRefresh.artifacts.length}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {releaseRefresh.missingEvidence.length
                      ? `${releaseRefresh.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Owner Packets</span>
                  <strong>
                    ready={String(releaseRefresh.actionQueue.ownerPacketsReady)},
                    count={releaseRefresh.actionQueue.ownerPacketCount}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-owner-packets"
              >
                {releaseRefresh.actionQueue.ownerPackets.slice(0, 6).map((packet) => (
                  <span key={packet.owner}>
                    {packet.owner}:
                    {packet.markdownPath.split(/[\\/]/).pop() ??
                      packet.markdownPath}
                    :exists={String(packet.exists)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-owner-packet-cleanup"
              >
                <span>
                  deletionAllowed=
                  {String(releaseRefresh.actionQueue.ownerPacketCleanup.deletionAllowed)}
                </span>
                <span>
                  expected=
                  {releaseRefresh.actionQueue.ownerPacketCleanup.expectedFiles.join(", ") ||
                    "none"}
                </span>
                <span>
                  staleRemoved=
                  {releaseRefresh.actionQueue.ownerPacketCleanup.staleRemoved.join(", ") ||
                    "none"}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseRefresh.risk[0] ??
                    "Release refresh runs local evidence commands only."}
                </p>
                <p>
                  {releaseRefresh.rollbackPath[0] ??
                    "Rerun the release refresh after code or evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseBundle ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-evidence-bundle"
            >
              <div className="admin-evidence-line">
                <span>{releaseBundle.artifactStatus}</span>
                <span>{releaseBundle.actionMode}</span>
                <span>head={releaseBundle.headSha}</span>
                <span>dirty={String(releaseBundle.worktreeDirty)}</span>
                <span>packet={releaseBundlePacketName}</span>
                <span>
                  mutationBoundaryPassed=
                  {String(releaseBundle.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseBundle.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseBundle.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseBundle.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Decision</span>
                  <strong>
                    publish={String(releaseBundle.decision.publishReady)},
                    install={String(releaseBundle.decision.installReady)}
                  </strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>
                    {
                      releaseBundle.sourceArtifacts.filter(
                        (source) => source.fresh && source.acceptable
                      ).length
                    }
                    /{releaseBundle.sourceArtifacts.length}
                  </strong>
                </div>
                <div>
                  <span>Commands</span>
                  <strong>
                    readOnly={releaseBundle.commandCounts.readOnly},
                    gated=
                    {releaseBundle.commandCounts.mutatingApprovalRequired}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {releaseBundle.missingEvidence.length
                      ? `${releaseBundle.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
              </div>
              <div className="admin-evidence-line">
                {releaseBundle.sourceArtifacts.slice(0, 4).map((source) => (
                  <span key={source.id}>
                    {source.id} fresh={String(source.fresh)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseBundle.risk[0] ??
                    "Release evidence bundle is a read-only review packet."}
                </p>
                <p>
                  {releaseBundle.rollbackPath[0] ??
                    "Regenerate the release bundle after evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {releaseActionQueue ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-release-action-queue"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Release Action Queue</h4>
                  <small>{releaseActionQueue.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{releaseActionQueue.artifactStatus}</span>
                <span>head={releaseActionQueue.headSha}</span>
                <span>dirty={String(releaseActionQueue.worktreeDirty)}</span>
                <span>packet={releaseActionQueuePacketName}</span>
                <span>
                  mutationBoundaryPassed=
                  {String(releaseActionQueue.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  registryMutationAttempted=
                  {String(releaseActionQueue.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(releaseActionQueue.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(releaseActionQueue.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Owners</span>
                  <strong>{releaseActionQueue.owners.length}</strong>
                </div>
                <div>
                  <span>Open Actions</span>
                  <strong>{releaseActionQueue.items.length}</strong>
                </div>
                <div>
                  <span>Commands</span>
                  <strong>
                    readOnly={releaseActionQueue.commandCounts.readOnly},
                    gated={releaseActionQueue.commandCounts.approvalGated}
                  </strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>
                    {
                      releaseActionQueue.sourceArtifacts.filter(
                        (source) => source.fresh && !source.mutationViolation
                      ).length
                    }
                    /{releaseActionQueue.sourceArtifacts.length}
                  </strong>
                </div>
              </div>
              <div className="mcp-tool-list">
                {releaseActionQueue.owners.slice(0, 7).map((owner) => (
                  <div className="mcp-tool-row" key={owner.owner}>
                    <span
                      className={`freshness ${
                        owner.blocker > 0 ? "missing" : "stale"
                      }`}
                    >
                      {owner.blocker > 0 ? "blocker" : "open"}
                    </span>
                    <strong>{owner.owner}</strong>
                    <small>open={owner.open}</small>
                    <small>high={owner.high}</small>
                  </div>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-owner-packets"
              >
                {releaseActionQueue.ownerPackets.slice(0, 7).map((packet) => (
                  <span key={packet.owner}>
                    {packet.owner}:
                    {packet.markdownPath.split(/[\\/]/).pop() ??
                      packet.markdownPath}
                    :open={packet.open}:approval=
                    {packet.approvalGatedCommandIds.length}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-owner-packet-cleanup"
              >
                <span>
                  deletionAllowed=
                  {String(releaseActionQueue.ownerPacketCleanup.deletionAllowed)}
                </span>
                <span>
                  expected=
                  {releaseActionQueue.ownerPacketCleanup.expectedFiles.join(", ") ||
                    "none"}
                </span>
                <span>
                  staleRemoved=
                  {releaseActionQueue.ownerPacketCleanup.staleRemoved.join(", ") ||
                    "none"}
                </span>
              </div>
              <div className="admin-evidence-line">
                {releaseActionQueue.items.slice(0, 4).map((entry) => (
                  <span key={entry.id}>
                    {entry.owner}:{entry.priority}
                  </span>
                ))}
              </div>
              <div
                className="mcp-tool-list"
                data-testid="opslens-release-action-queue-items"
              >
                {releaseActionQueue.items.slice(0, 5).map((entry) => (
                  <div className="mcp-tool-row" key={entry.id}>
                    <span
                      className={`freshness ${
                        entry.priority === "blocker" ? "missing" : "stale"
                      }`}
                    >
                      {entry.priority}
                    </span>
                    <strong>{entry.request}</strong>
                    <small>{entry.owner}</small>
                    <small>{entry.nextCommand}</small>
                    {entry.missingRequiredTools.length ? (
                      <small>
                        missing={entry.missingRequiredTools.join(", ")}
                      </small>
                    ) : null}
                    {entry.handoffNextCommands.length ? (
                      <small>
                        handoff={entry.handoffNextCommands.slice(0, 2).join(" | ")}
                      </small>
                    ) : null}
                    {entry.readOnlyCommands.length ? (
                      <small>
                        readOnly=
                        {entry.readOnlyCommands
                          .slice(0, 2)
                          .map((command) => command.id)
                          .join(", ")}
                      </small>
                    ) : null}
                    {entry.approvalGatedCommands.length ? (
                      <small>
                        approval=
                        {entry.approvalGatedCommands
                          .slice(0, 2)
                          .map((command) => command.id)
                          .join(", ")}
                      </small>
                    ) : null}
                  </div>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-approval-handoff"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.approvalGatedCommands.length > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.owner}:
                      {entry.approvalGatedCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-readonly-handoff"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.readOnlyCommands.length > 0)
                  .slice(0, 4)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.owner}:
                      {entry.readOnlyCommands
                        .slice(0, 4)
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-tooling-handoff"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.missingRequiredTools.length > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.owner}:{entry.missingRequiredTools.join(", ")}:
                      {entry.setupCommands.map((command) => command.id).join(", ")}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-candidate-actions"
              >
                {releaseCandidateActions.length > 0 ? (
                  releaseCandidateActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.owner}:{entry.priority}:{entry.nextCommand}
                    </span>
                  ))
                ) : (
                  <span>candidate actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-security-review-actions"
              >
                {releaseSecurityReviewActions.length > 0 ? (
                  releaseSecurityReviewActions.slice(0, 6).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .slice(0, 3)
                        .map((command) => command.id)
                        .join(", ")}
                      :approval=
                      {entry.approvalGatedCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>security review actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-catalog-registry-actions"
              >
                {releaseCatalogRegistryActions.length > 0 ? (
                  releaseCatalogRegistryActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :setup=
                      {entry.setupCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>catalog registry actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-runtime-live-actions"
              >
                {releaseRuntimeLiveActions.length > 0 ? (
                  releaseRuntimeLiveActions.slice(0, 5).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>runtime live actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-monitoring-proxy-actions"
              >
                {releaseMonitoringProxyActions.length > 0 ? (
                  releaseMonitoringProxyActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>monitoring proxy actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-lightspeed-readiness-actions"
              >
                {releaseLightspeedReadinessActions.length > 0 ? (
                  releaseLightspeedReadinessActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .map((command) => command.id)
                        .join(", ")}
                      :approval=
                      {entry.approvalGatedCommands
                        .map((command) => command.id)
                        .join(", ")}
                    </span>
                  ))
                ) : (
                  <span>lightspeed readiness actions clear</span>
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {releaseActionQueue.risk[0] ??
                    "Release action queue assigns evidence gaps without approving mutation."}
                </p>
                <p>
                  {releaseActionQueue.rollbackPath[0] ??
                    "Regenerate the queue after upstream evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
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
                <div>
                  <span>Lightspeed Registration</span>
                  <strong>
                    {approvalPlan.lightspeedRegistration.mode} /{" "}
                    {approvalPlan.lightspeedRegistration.target.namespace}/
                    {approvalPlan.lightspeedRegistration.target.name}
                  </strong>
                </div>
                <div>
                  <span>RAG Ingestion</span>
                  <strong>
                    {approvalPlan.ragIngestion.status} / jobCreated=
                    {String(approvalPlan.ragIngestion.ingestionJobCreated)}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-registration-plan"
              >
                <span>{approvalPlan.lightspeedRegistration.actionMode}</span>
                <span>
                  {approvalPlan.lightspeedRegistration.configResourceKind}
                </span>
                <span>mode={approvalPlan.lightspeedRegistration.mode}</span>
                <span>
                  willPatch=
                  {String(approvalPlan.lightspeedRegistration.willPatch)}
                </span>
                <span>
                  legacyConfigMapMutationAttempted=
                  {String(
                    approvalPlan.lightspeedRegistration
                      .legacyConfigMapMutationAttempted
                  )}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(
                    approvalPlan.lightspeedRegistration.clusterMutationAttempted
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-registration-commands"
              >
                {approvalPlan.lightspeedRegistration.readOnlyCommands.map(
                  (command) => (
                    <span key={command.id}>{command.command}</span>
                  )
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-ingestion-approval-plan"
              >
                <span>{approvalPlan.ragIngestion.actionMode}</span>
                <span>
                  queueEvidence={approvalPlan.ragIngestion.queueEvidenceStatus}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(approvalPlan.ragIngestion.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(approvalPlan.ragIngestion.mutationAllowedByThisVerifier)}
                </span>
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
          {catalogToolchainPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-catalog-toolchain"
            >
              <div className="admin-evidence-line">
                <span>{catalogToolchainPlan.artifactStatus}</span>
                <span>{catalogToolchainPlan.actionMode}</span>
                <span>
                  registryAuthConfigured=
                  {String(catalogToolchainPlan.registryAuthConfigured)}
                </span>
                <span>
                  registryBaseReadable=
                  {String(catalogToolchainPlan.registryBaseReadable)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(catalogToolchainPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(catalogToolchainPlan.clusterMutationAttempted)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>CLI</span>
                  <strong>
                    {catalogToolchainPlan.cli.length
                      ? catalogToolchainPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Checks</span>
                  <strong>
                    {catalogToolchainPlan.readOnlyCommands.length
                      ? catalogToolchainPlan.readOnlyCommands
                          .slice(0, 4)
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Setup Needed</span>
                  <strong>
                    {catalogToolchainPlan.setupCommands.length
                      ? catalogToolchainPlan.setupCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Local Artifact</span>
                  <strong>
                    {catalogToolchainPlan.localArtifactCommands.length
                      ? catalogToolchainPlan.localArtifactCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {catalogToolchainPlan.risk[0] ??
                    "Catalog toolchain evidence reads local readiness only."}
                </p>
                <p>
                  {catalogToolchainPlan.rollbackPath[0] ??
                    "Regenerate catalog toolchain evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {certificationPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-certification-readiness"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Certification Readiness</h4>
                  <small>{certificationPlan.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{certificationPlan.artifactStatus}</span>
                <span>head={certificationPlan.headSha}</span>
                <span>dirty={String(certificationPlan.worktreeDirty)}</span>
                <span>
                  registryMutationAttempted=
                  {String(certificationPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(certificationPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(certificationPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Submission CLI</span>
                  <strong>
                    {certificationPlan.cli.length
                      ? certificationPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"} external=${String(tool.requiredForExternalSubmission)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Gate Counts</span>
                  <strong>
                    internal={certificationPlan.gateCounts.internalCatalog.pass}/
                    {certificationPlan.gateCounts.internalCatalog.total},
                    community={certificationPlan.gateCounts.communityOperator.pass}/
                    {certificationPlan.gateCounts.communityOperator.total},
                    certified={certificationPlan.gateCounts.certifiedOperator.pass}/
                    {certificationPlan.gateCounts.certifiedOperator.total}
                  </strong>
                </div>
                <div>
                  <span>Documents</span>
                  <strong>
                    {Object.entries(certificationPlan.documents).length
                      ? Object.entries(certificationPlan.documents)
                          .slice(0, 4)
                          .map(
                            ([key, value]) =>
                              `${key}:${value.split(/[\\/]/).pop() ?? value}`
                          )
                          .join(", ")
                      : "documents missing"}
                  </strong>
                </div>
                <div>
                  <span>Open Items</span>
                  <strong>
                    {certificationPlan.missingEvidence.length
                      ? `${certificationPlan.missingEvidence.length} missing evidence`
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Tooling Handoff</span>
                  <strong>
                    {certificationPlan.toolingHandoff.status} / missing=
                    {certificationPlan.toolingHandoff.missingRequiredTools
                      .length
                      ? certificationPlan.toolingHandoff.missingRequiredTools.join(
                          ", "
                        )
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Execution Lanes</span>
                  <strong>
                    {certificationPlan.toolingHandoff.executionLanes.length
                      ? certificationPlan.toolingHandoff.executionLanes
                          .map((lane) => `${lane.id}:${lane.status}`)
                          .join(", ")
                      : "not listed"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-cli"
              >
                {certificationPlan.cli.slice(0, 5).map((tool) => (
                  <span key={tool.name}>
                    {tool.name}:{tool.available ? "ready" : "missing"} required=
                    {String(tool.requiredForExternalSubmission)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-handoff"
              >
                <span>{certificationPlan.toolingHandoff.actionMode}</span>
                <span>
                  status={certificationPlan.toolingHandoff.status}
                </span>
                <span>
                  missing=
                  {certificationPlan.toolingHandoff.missingRequiredTools.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  readOnlyCommands=
                  {certificationPlan.toolingHandoff.readOnlyCommands.length}
                </span>
                <span>
                  setupCommands=
                  {certificationPlan.toolingHandoff.setupCommands.length}
                </span>
                <span>
                  approvalGated=
                  {
                    certificationPlan.toolingHandoff.approvalGatedCommands
                      .length
                  }
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-execution-lanes"
              >
                {certificationPlan.toolingHandoff.executionLanes.map((lane) => (
                  <span key={lane.id}>
                    {lane.id}:{lane.status}:owner={lane.owner}:mutation=
                    {String(lane.mutation)}:approval=
                    {String(lane.requiresExplicitApproval)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-freshness-policy"
              >
                <span>
                  requiredHead=
                  {certificationPlan.toolingHandoff.freshnessPolicy.requiredHead}
                </span>
                <span>
                  worktree=
                  {
                    certificationPlan.toolingHandoff.freshnessPolicy
                      .worktreeRequirement
                  }
                </span>
                <span>
                  rerunAfter=
                  {certificationPlan.toolingHandoff.freshnessPolicy.rerunAfter
                    .slice(0, 4)
                    .join(", ") || "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-next"
              >
                {certificationPlan.toolingHandoff.nextCommands
                  .slice(0, 4)
                  .map((command) => (
                    <span key={command}>{command}</span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-gates"
              >
                {Object.entries(certificationPlan.gateCounts).map(
                  ([gate, counts]) => (
                    <span key={gate}>
                      {gate} pass={counts.pass} warn={counts.warn} fail=
                      {counts.fail}
                    </span>
                  )
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {certificationPlan.risk[0] ??
                    "Certification readiness is local evidence only and does not submit externally."}
                </p>
                <p>
                  {certificationPlan.rollbackPath[0] ??
                    "Regenerate certification evidence from a clean worktree."}
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
                          .map(
                            (image) =>
                              `${image.name}:${image.status} draft=${image.draftStatus}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Evidence Templates</span>
                  <strong>
                    {externalRuntimePlan.evidenceTemplates.length
                      ? externalRuntimePlan.evidenceTemplates
                          .map((template) => `${template.name}:${template.status}`)
                          .join(", ")
                      : "templates missing"}
                  </strong>
                </div>
                <div>
                  <span>Draft Intake</span>
                  <strong>
                    {externalRuntimePlan.evidenceDrafts.length
                      ? externalRuntimePlan.evidenceDrafts
                          .map((draft) => `${draft.name}:${draft.status}`)
                          .join(", ")
                      : "drafts missing"}
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
          {externalRuntimeReview ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-external-runtime-review-packet"
            >
              <div className="admin-evidence-line">
                <span>{externalRuntimeReview.artifactStatus}</span>
                <span>{externalRuntimeReview.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(externalRuntimeReview.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(externalRuntimeReview.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(externalRuntimeReview.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Packet</span>
                  <strong>
                    {externalRuntimeReview.markdownPath.split(/[\\/]/).pop() ??
                      externalRuntimeReview.markdownPath}
                  </strong>
                </div>
                <div>
                  <span>Reviewer Requests</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${image.reviewerRequests.length}`
                      )
                      .join(", ") || "none"}
                  </strong>
                </div>
                <div>
                  <span>Source Digest</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${image.sourceDigestInspectionStatus}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Final Evidence</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map(
                        (image) =>
                          `${image.name}:${String(image.finalEvidenceExists)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Candidate Matrix</span>
                  <strong>
                    {externalRuntimeReview.images
                      .map((image) => {
                        const best = image.candidateMatrix.bestCandidate;
                        return best
                          ? `${image.name}:${image.candidateMatrix.status} best=${best.label} critical=${best.criticalFindings} high=${best.highFindings}`
                          : `${image.name}:${image.candidateMatrix.status} best=missing`;
                      })
                      .join(", ") || "missing"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-candidates"
              >
                {externalRuntimeReview.images.map((image) => (
                  <span key={`${image.name}-candidate`}>
                    {image.name}:candidate={image.candidateMatrix.status}
                    {image.candidateMatrix.bestCandidate
                      ? ` critical=${image.candidateMatrix.bestCandidate.criticalFindings} high=${image.candidateMatrix.bestCandidate.highFindings}`
                      : " best=missing"} zeroCritical=
                    {image.candidateMatrix.zeroCriticalCount}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-reviewer-actions"
              >
                {externalRuntimeReview.images.flatMap((image) =>
                  image.reviewerRequests.slice(0, 3).map((request) => (
                    <span key={`${image.name}-${request.role}-${request.request}`}>
                      {image.name}:{request.role}:{request.nextCommand}
                    </span>
                  ))
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-review-commands"
              >
                {externalRuntimeReview.readOnlyCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      {command.id} mutation={String(command.mutation)}
                    </span>
                  ))}
                {externalRuntimeReview.approvalGatedCommands
                  .slice(0, 3)
                  .map((command) => (
                    <span key={command.id}>
                      not-run {command.id} approval=
                      {String(command.requiresExplicitApproval)}
                    </span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {externalRuntimeReview.risk[0] ??
                    "External runtime review packet is local evidence only."}
                </p>
                <p>
                  {externalRuntimeReview.rollbackPath[0] ??
                    "Regenerate the review packet after draft evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {securityScanPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-security-scan-plan"
            >
              <div className="admin-evidence-line">
                <span>{securityScanPlan.artifactStatus}</span>
                <span>{securityScanPlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(securityScanPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(securityScanPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(securityScanPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Scan CLI</span>
                  <strong>
                    {securityScanPlan.cli.length
                      ? securityScanPlan.cli
                          .map(
                            (tool) =>
                              `${tool.name}:${tool.available ? "ready" : "missing"}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Image Evidence</span>
                  <strong>
                    {securityScanPlan.images.length
                      ? securityScanPlan.images
                          .slice(0, 6)
                          .map(
                            (image) =>
                              `${image.name}:scan=${String(image.vulnerabilityReportExists)} sbom=${String(image.sbomExists)} review=${String(image.reviewExists)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Evidence</span>
                  <strong>
                    {securityScanPlan.readOnlyCommands.length
                      ? securityScanPlan.readOnlyCommands
                          .slice(0, 5)
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Approval-gated Signing</span>
                  <strong>
                    {securityScanPlan.approvalGatedCommands.length
                      ? securityScanPlan.approvalGatedCommands
                          .slice(0, 5)
                          .map((command) => command.id)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-drafts"
              >
                {securityScanPlan.images.slice(0, 7).map((image) => (
                  <span key={image.name}>
                    {image.name}:draft={image.reviewDraft.evidenceState}
                    :sameHead={String(image.reviewDraft.sameHead)}
                    :reviewer={String(image.reviewDraft.reviewerProvided)}
                    :ticket={String(image.reviewDraft.ticketProvided)}
                    :ready={String(image.reviewDraft.readyForFinalReview)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {securityScanPlan.risk[0] ??
                    "Security scan evidence reads local readiness only."}
                </p>
                <p>
                  {securityScanPlan.rollbackPath[0] ??
                    "Regenerate security scan evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {ownedImageProvenancePlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-owned-image-provenance"
            >
              <div className="admin-evidence-line">
                <span>{ownedImageProvenancePlan.actionMode}</span>
                <span>
                  registryMutationAttempted=
                  {String(ownedImageProvenancePlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(ownedImageProvenancePlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(ownedImageProvenancePlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Required Images</span>
                  <strong>
                    {ownedImageProvenancePlan.requiredImages.length
                      ? ownedImageProvenancePlan.requiredImages.join(", ")
                      : "operator, api, dashboard, bundle"}
                  </strong>
                </div>
                <div>
                  <span>Local Inspect</span>
                  <strong>
                    {ownedImageProvenancePlan.images.length
                      ? ownedImageProvenancePlan.images
                          .map((image) => `${image.name}:${image.status}`)
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
                <div>
                  <span>Remaining Evidence</span>
                  <strong>
                    {ownedImageProvenancePlan.missingEvidence.length
                      ? `${ownedImageProvenancePlan.missingEvidence.length} gaps`
                      : "none"}
                  </strong>
                </div>
              </div>
              <div className="remediation-notes">
                <p>
                  {ownedImageProvenancePlan.risk[0] ??
                    "Owned image provenance reads local image metadata only."}
                </p>
                <p>
                  {ownedImageProvenancePlan.rollbackPath[0] ??
                    "Regenerate image build and provenance evidence from a clean worktree."}
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
