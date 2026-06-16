import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  OpsLensAdminOverviewResponse,
  OpsLensRagApprovalQueueIngestionPlanResponse,
  OpsLensRagApprovalQueueInventoryResponse,
  OpsLensRagApprovalQueueReviewResponse,
  OpsLensRagApprovalQueueSubmissionResponse,
  OpsLensRagEvidenceExportResponse,
  OpsLensRuntimeLiveHandoffAction,
  OpsLensRagValidationResponse
} from "@kugnus/contracts";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  DatabaseZap,
  Download,
  FileDiff,
  Gauge,
  KeyRound,
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
    status === "ready-for-remote-prep" ||
    status === "ready-for-handoff" ||
    status === "ready-for-review" ||
    status === "ready-for-scan" ||
    status === "ready-for-live-registration-review" ||
    status === "live-ready" ||
    status === "mvp-locked" ||
    status === "mvp" ||
    status === "active"
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
    status === "needs-tooling" ||
    status === "needs-image-ref-mapping" ||
    status === "needs-lab-machine" ||
    status === "needs-ocp-live" ||
    status === "needs-local-artifacts" ||
    status === "needs-current-evidence" ||
    status === "needs-local-package" ||
    status === "needs-crc-target" ||
    status === "needs-install-preview" ||
    status === "planned"
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

function runtimeEvidenceTicketText(action: OpsLensRuntimeLiveHandoffAction) {
  const ticket = action.runtimeEvidenceTicketPacket;
  if (!ticket) return "runtime evidence ticket missing";
  return [
    ticket.id,
    ticket.owner,
    `first=${ticket.firstReadOnlyAction.id}`,
    `approval=${ticket.approvalGatedAction.id}`,
    `requiresApproval=${String(ticket.approvalGatedAction.requiresExplicitApproval)}`,
    `mutationAllowed=${String(ticket.mutationBoundary.mutationAllowedByThisVerifier)}`,
    `liveProbeRequiresApproval=${String(ticket.mutationBoundary.liveProbeRequiresExplicitApproval)}`
  ].join(":");
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
  const ragProductionReadiness = overview?.rag.productionReadiness;
  const opsBrain = overview?.opsBrain;
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
  const monitoringProxyHandoff = aiopsPipeline?.monitoringProxyHandoff;
  const extensionPoint = overview?.installReadiness.extensionPoint;
  const operatorPackage = overview?.installReadiness.operatorPackageSummary;
  const operatorRuntimeBoundary =
    overview?.installReadiness.operatorRuntimeBoundarySummary;
  const approvalPlan = overview?.installReadiness.approvalPlan;
  const certificationPlan = overview?.installReadiness.certificationPlan;
  const communitySubmissionPlan =
    overview?.installReadiness.communitySubmissionPlan;
  const catalogToolchainPlan =
    overview?.installReadiness.catalogToolchainPlan;
  const labBootstrapPlan = overview?.installReadiness.labBootstrapPlan;
  const labHandoffPlan = overview?.installReadiness.labHandoffPlan;
  const externalRuntimePlan = overview?.installReadiness.externalRuntimePlan;
  const externalRuntimeReview =
    overview?.installReadiness.externalRuntimeReview;
  const securityScanPlan = overview?.installReadiness.securityScanPlan;
  const ownedImageProvenancePlan =
    overview?.installReadiness.ownedImageProvenancePlan;
  const releasePlan = overview?.installReadiness.releasePlan;
  const releaseRefresh = overview?.installReadiness.refresh;
  const releaseRefreshSecurityReviewCommand = releaseRefresh?.commands.find(
    (command) => command.id === "security-review-drafts-all"
  );
  const releaseBundle = overview?.installReadiness.bundle;
  const releaseBundlePacketName =
    releaseBundle?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const releaseActionQueue = overview?.installReadiness.actionQueue;
  const roadmapCompletion = overview?.installReadiness.roadmapCompletion;
  const completionGate = overview?.installReadiness.completionGate;
  const preClusterInstallGate =
    overview?.installReadiness.preClusterInstallGate;
  const runtimeLiveHandoff = overview?.runtime.liveHandoff;
  const runtimeLiveEvidenceHandoff =
    overview?.runtime.readiness.liveEvidenceHandoff ?? [];
  const runtimeLiveHandoffActions = [
    runtimeLiveHandoff?.runtimeReadinessAction,
    runtimeLiveHandoff?.runtimeRagAction
  ].filter(
    (action): action is OpsLensRuntimeLiveHandoffAction => action !== undefined
  );
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
  const releaseNetworkActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.source.includes("ocpNetworkHandoff") ||
        entry.source.includes("ocpConnectivity") ||
        entry.id.includes("ocp-api") ||
        entry.id.includes("ocp-tls") ||
        entry.id.includes("ocp-auth-rbac")
    ) ?? [];
  const releaseLightspeedReadinessActions =
    releaseActionQueue?.items.filter(
      (entry) =>
        entry.id.includes("lightspeed-readiness") ||
        entry.source.includes("lightspeedReadiness")
    ) ?? [];
  const releaseDecisionActions =
    releaseActionQueue?.items.filter((entry) =>
      entry.id.includes("decision-not-ready")
    ) ?? [];
  const releaseApprovalHandoffActions = releaseActionQueue
    ? [
        ...releaseActionQueue.items.filter((entry) =>
          entry.approvalGatedCommands.some(
            (command) =>
              command.id.includes("live-evidence-reader") ||
              command.id.includes("short-lived-live-reader")
          )
        ),
        ...releaseActionQueue.items.filter(
          (entry) => entry.approvalGatedCommands.length > 0
        )
      ]
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.id === entry.id) === index
        )
        .slice(0, 6)
    : [];
  const releaseReadOnlyHandoffActions = releaseActionQueue
    ? [
        ...releaseActionQueue.items.filter((entry) =>
          entry.readOnlyCommands.some(
            (command) =>
              command.id === "ocp-connectivity" ||
              command.id.includes("live-reader") ||
              command.id === "lightspeed-readiness-live"
          )
        ),
        ...releaseActionQueue.items.filter(
          (entry) => entry.readOnlyCommands.length > 0
        )
      ]
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.id === entry.id) === index
        )
        .slice(0, 6)
    : [];
  const releaseActionQueuePacketName =
    releaseActionQueue?.markdownPath.split(/[\\/]/).pop() ?? "missing";
  const checkpoint = overview?.installReadiness.checkpoint;
  const liveHandoff = overview?.installReadiness.handoff;
  const networkHandoff = overview?.installReadiness.networkHandoff;
  const networkHandoffApiFallback =
    overview?.installReadiness.networkHandoffApiFallback;
  const authRbacPlan = overview?.installReadiness.authRbacPlan;
  const envContract = overview?.installReadiness.envContract;
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

      {opsBrain ? (
        <section
          className="opsbrain-console"
          data-testid="opslens-opsbrain-system"
          aria-labelledby="opslens-opsbrain-title"
        >
          <div className="opsbrain-headline">
            <div>
              <p className="eyebrow">Cywell OpsBrain</p>
              <h3 id="opslens-opsbrain-title">No fine-tuning growth system</h3>
              <p>{opsBrain.productDefinition}</p>
            </div>
            <div className="opsbrain-badges">
              <span className={`freshness ${statusClass(opsBrain.status)}`}>
                {opsBrain.status}
              </span>
              <span className="status-pill read-only">
                fineTuningRequired={String(opsBrain.fineTuningRequired)}
              </span>
              <span className="status-pill read-only">
                actionMode={opsBrain.actionMode}
              </span>
            </div>
          </div>

          <div className="opsbrain-grid">
            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <BrainCircuit size={16} aria-hidden="true" />
                  Growth Loop
                </h4>
                <span>{opsBrain.growthLoop.length} steps</span>
              </div>
              <ol className="opsbrain-step-list">
                {opsBrain.growthLoop.map((step) => (
                  <li key={step.step}>
                    <strong>
                      {step.step}. {step.label}
                    </strong>
                    <span>{step.currentImplementation}</span>
                    <small>{step.passFail}</small>
                  </li>
                ))}
              </ol>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <DatabaseZap size={16} aria-hidden="true" />
                  Memory Tiers
                </h4>
                <span>{opsBrain.memoryTiers.length} tiers</span>
              </div>
              <div className="opsbrain-memory-list">
                {opsBrain.memoryTiers.map((tier) => (
                  <div key={tier.tier}>
                    <span className={`freshness ${statusClass(tier.status)}`}>
                      {tier.tier}
                    </span>
                    <strong>{tier.label}</strong>
                    <small>{tier.implementation}</small>
                    <small>write={tier.writePolicy}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Risk Gate
                </h4>
                <span>mutationAllowed={String(opsBrain.riskGate.mutationAllowed)}</span>
              </div>
              <div className="opsbrain-risk-list">
                {opsBrain.riskGate.commandClasses.map((commandClass) => (
                  <div key={commandClass.className}>
                    <strong>{commandClass.className}</strong>
                    <span>
                      approval=
                      {commandClass.allowedWithoutApproval ? "not-required" : "required"}
                    </span>
                    <small>{commandClass.examples.join(", ")}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <ListChecks size={16} aria-hidden="true" />
                  Evaluator
                </h4>
                <span>golden={opsBrain.evaluator.goldenSetTarget}</span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.evaluator.metrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
              <p>{opsBrain.evaluator.releaseGate}</p>
            </article>
          </div>

          <div className="opsbrain-module-row">
            <article
              className="opsbrain-panel opsbrain-module-panel"
              data-testid="opslens-opsbrain-architecture"
            >
              <div className="card-title-row">
                <h4>
                  <BrainCircuit size={16} aria-hidden="true" />
                  System Modules
                </h4>
                <span>{opsBrain.architectureModules.length} modules</span>
              </div>
              <div className="opsbrain-module-list">
                {opsBrain.architectureModules.map((module) => (
                  <div key={module.id}>
                    <span className={`freshness ${statusClass(module.status)}`}>
                      {module.status}
                    </span>
                    <strong>{module.label}</strong>
                    <small>{module.currentImplementation}</small>
                    <small>next={module.nextImplementation}</small>
                  </div>
                ))}
              </div>
            </article>

            <article
              className="opsbrain-panel"
              data-testid="opslens-opsbrain-growth-governance"
            >
              <div className="card-title-row">
                <h4>
                  <ShieldCheck size={16} aria-hidden="true" />
                  Growth Governance
                </h4>
                <span>{opsBrain.growthGovernance.memoryPromotionMode}</span>
              </div>
              <div className="opsbrain-governance-grid">
                <span>
                  groundedTarget={opsBrain.growthGovernance.currentStateEvidenceTargetPercent}%
                </span>
                <span>
                  dangerousExecTarget={opsBrain.growthGovernance.unauthorizedDangerousExecutionTarget}
                </span>
                <span>
                  repeatReuse={String(opsBrain.growthGovernance.repeatedCaseReuseRequired)}
                </span>
                <span>
                  evalBeforePromotion={String(opsBrain.growthGovernance.evalBeforePromotionRequired)}
                </span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.growthGovernance.missingEvidence.slice(0, 4).map((gap) => (
                  <span key={gap}>{gap}</span>
                ))}
              </div>
            </article>

            <article
              className="opsbrain-panel"
              data-testid="opslens-opsbrain-model-strategy"
            >
              <div className="card-title-row">
                <h4>
                  <Gauge size={16} aria-hidden="true" />
                  Model Strategy
                </h4>
                <span>{opsBrain.modelStrategy.defaultMode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>
                  routingPlanned={String(opsBrain.modelStrategy.routingPlanned)}
                </span>
                <span>
                  externalProviderDefault=
                  {String(opsBrain.modelStrategy.externalProviderCallAllowedByDefault)}
                </span>
              </div>
              <div className="opsbrain-model-list">
                {opsBrain.modelStrategy.providers.map((provider) => (
                  <div key={provider.id}>
                    <span className={`status-pill ${provider.status === "active" ? "ready" : provider.status === "missing" ? "danger" : "read-only"}`}>
                      {provider.status}
                    </span>
                    <strong>{provider.label}</strong>
                    <small>{provider.role}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="opsbrain-contract-row">
            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Acceptance
                </h4>
                <span>{opsBrain.acceptanceCriteria.length} gates</span>
              </div>
              <div className="opsbrain-contract-list">
                {opsBrain.acceptanceCriteria.map((criterion) => (
                  <div key={criterion.id}>
                    <span className={`status-pill ${criterion.status === "pass" ? "ready" : criterion.status === "needs-evidence" ? "warning" : "read-only"}`}>
                      {criterion.status}
                    </span>
                    <strong>{criterion.id}</strong>
                    <small>{criterion.pass}</small>
                    <small>{criterion.measurement}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <FileDiff size={16} aria-hidden="true" />
                  Memory Write Guard
                </h4>
                <span>{opsBrain.memoryWriteGuard.mode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>rawMemoryWrite={String(opsBrain.memoryWriteGuard.rawMemoryWriteAllowed)}</span>
                <span>vectorWrite={String(opsBrain.memoryWriteGuard.vectorWriteAllowed)}</span>
                <span>graphWrite={String(opsBrain.memoryWriteGuard.graphWriteAllowed)}</span>
                <span>reviewerRequired={String(opsBrain.memoryWriteGuard.reviewerRequired)}</span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.memoryWriteGuard.blockedTargets.slice(0, 5).map((target) => (
                  <span key={target}>{target}</span>
                ))}
              </div>
            </article>

            <article className="opsbrain-panel">
              <div className="card-title-row">
                <h4>
                  <Activity size={16} aria-hidden="true" />
                  Self-Improver
                </h4>
                <span>{opsBrain.selfImprover.mode}</span>
              </div>
              <div className="opsbrain-safety-grid">
                <span>
                  fineTuning={String(opsBrain.selfImprover.automaticFineTuningAllowed)}
                </span>
                <span>
                  policyMutation={String(opsBrain.selfImprover.automaticPolicyMutationAllowed)}
                </span>
                <span>nightlyLoop={String(opsBrain.selfImprover.nightlyLoopPlanned)}</span>
              </div>
              <div className="opsbrain-chip-list">
                {opsBrain.selfImprover.candidateOutputs.slice(0, 5).map((output) => (
                  <span key={output}>{output}</span>
                ))}
              </div>
            </article>
          </div>

          <div className="opsbrain-credential-panel">
            <div className="card-title-row">
              <h4>
                <KeyRound size={16} aria-hidden="true" />
                Required Keys And Tokens
              </h4>
              <span>values redacted</span>
            </div>
            <div
              className="opsbrain-credential-list"
              data-testid="opslens-opsbrain-credentials"
            >
              {opsBrain.credentialRequirements.map((requirement) => (
                <div key={requirement.id}>
                  <span className={`status-pill ${requirement.status === "configured" ? "ready" : requirement.status === "missing" ? "danger" : "read-only"}`}>
                    {requirement.status}
                  </span>
                  <strong>{requirement.label}</strong>
                  <small>{requirement.keyNames.join(" + ")}</small>
                  <small>{requirement.note}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
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
          {ragProductionReadiness ? (
            <div
              className="rag-export-summary"
              data-testid="opslens-rag-production-readiness"
            >
              <div className="admin-evidence-line">
                <span>{ragProductionReadiness.actionMode}</span>
                <span>{ragProductionReadiness.status}</span>
                <span>
                  contractReady={String(ragProductionReadiness.contractReady)}
                </span>
                <span>
                  queueLive={String(ragProductionReadiness.productionQueueLive)}
                </span>
                <span>
                  workerLive={String(ragProductionReadiness.ingestionWorkerLive)}
                </span>
                <span>
                  vectorAudit=
                  {String(ragProductionReadiness.vectorWriteAuditSinkLive)}
                </span>
                <span>
                  vectorWrite={String(ragProductionReadiness.vectorWriteAttempted)}
                </span>
                <span>
                  ingestionJobCreated=
                  {String(ragProductionReadiness.ingestionJobCreated)}
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>{ragProductionReadiness.components.queue.backendClass}</span>
                <span>
                  rawMarkdown=
                  {String(ragProductionReadiness.components.queue.storesRawMarkdown)}
                </span>
                <span>
                  auditAppendOnly=
                  {String(ragProductionReadiness.components.vectorWriteAuditSink.appendOnly)}
                </span>
                <span>
                  approvals={ragProductionReadiness.requiredApprovals.join(",")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-production-first-actions"
              >
                {ragProductionReadiness.firstProductionActions.length ? (
                  ragProductionReadiness.firstProductionActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>RAG production first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-rag-production-ticket"
              >
                <span>
                  ticket={ragProductionReadiness.ticketPacket.id}
                </span>
                <span>
                  first={ragProductionReadiness.ticketPacket.firstReadOnlyAction.id}
                </span>
                <span>
                  approval=
                  {ragProductionReadiness.ticketPacket.approvalGatedAction.id}
                </span>
                <span>
                  requiresApproval=
                  {String(
                    ragProductionReadiness.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                </span>
                <span>
                  ingestionApproval=
                  {String(
                    ragProductionReadiness.ticketPacket.mutationBoundary
                      .ingestionRequiresExplicitApproval
                  )}
                </span>
              </div>
            </div>
          ) : null}
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
          {lightspeedMcp?.integrationHandoff ? (
            <div
              className="rag-export-summary"
              data-testid="opslens-lightspeed-integration-handoff"
            >
              <div className="admin-evidence-line">
                <span>{lightspeedMcp.integrationHandoff.actionMode}</span>
                <span>{lightspeedMcp.integrationHandoff.status}</span>
                <span>
                  artifact={lightspeedMcp.integrationHandoff.artifactStatus}
                </span>
                <span>
                  live={lightspeedMcp.integrationHandoff.liveReadiness.classification}
                </span>
                <span>
                  network=
                  {lightspeedMcp.integrationHandoff.liveReadiness.networkClassification}
                </span>
                <span>
                  templateReady=
                  {String(lightspeedMcp.integrationHandoff.olsconfig.templateReady)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(
                    lightspeedMcp.integrationHandoff.clusterMutationAttempted
                  )}
                </span>
                <span>
                  approvalGated=
                  {numberText(
                    lightspeedMcp.integrationHandoff.approvalGatedCommands.length
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-integration-handoff-commands"
              >
                <span>
                  readOnly=
                  {numberText(
                    lightspeedMcp.integrationHandoff.readOnlyCommands.length
                  )}
                </span>
                <span>
                  gated=
                  {numberText(
                    lightspeedMcp.integrationHandoff.approvalGatedCommands.length
                  )}
                </span>
                <span>
                  next=
                  {lightspeedMcp.integrationHandoff.liveReadiness.nextCommand}
                </span>
              </div>
            </div>
          ) : null}
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
              pgvector={overview?.runtime.readiness.vectorStore.status ?? "--"}
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
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff"
          >
            <span>{runtimeLiveHandoff?.actionMode ?? "handoffOnly"}</span>
            <span>status={runtimeLiveHandoff?.status ?? "--"}</span>
            <span>
              runtimeOwner={runtimeLiveHandoff?.runtimePlatformOwner ?? "--"}
            </span>
            <span>dataOwner={runtimeLiveHandoff?.dataMlOwner ?? "--"}</span>
            <span>
              liveProbe={String(runtimeLiveHandoff?.liveProbeEnabled ?? false)}
            </span>
            <span>pgvector={runtimeLiveHandoff?.pgvectorStatus ?? "--"}</span>
            <span>vllm={runtimeLiveHandoff?.vllmStatus ?? "--"}</span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-actions"
          >
            {runtimeLiveHandoffActions.length > 0 ? (
              runtimeLiveHandoffActions.map((action) => (
                <span key={action.id}>
                  {action.id}:{action.owner}:{action.priority}:
                  {action.nextCommand}:readOnly=
                  {action.readOnlyCommandIds.join(", ")}
                </span>
              ))
            ) : (
              <span>runtime live handoff clear</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-tickets"
          >
            {runtimeLiveHandoffActions.some(
              (action) => action.runtimeEvidenceTicketPacket
            ) ? (
              runtimeLiveHandoffActions.map((action) =>
                action.runtimeEvidenceTicketPacket ? (
                  <span key={`${action.id}-ticket`}>
                    {runtimeEvidenceTicketText(action)}
                  </span>
                ) : null
              )
            ) : (
              <span>runtime evidence tickets clear</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-evidence-handoff"
          >
            {runtimeLiveEvidenceHandoff.length > 0 ? (
              runtimeLiveEvidenceHandoff.map((handoff) => (
                <span key={`${handoff.provider}-${handoff.component}`}>
                  {handoff.provider}:{handoff.status}:{handoff.classification}:
                  owner={handoff.owner}:writesLocalEvidence=
                  {String(handoff.writesLocalEvidence)}:requiresApproval=
                  {String(handoff.requiresExplicitApproval)}:mutationAllowed=
                  {String(handoff.mutationAllowed)}:{handoff.nextCommand}
                </span>
              ))
            ) : (
              <span>runtime live evidence handoff missing</span>
            )}
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-runtime-live-handoff-boundary"
          >
            <span>
              mutationAllowedByThisVerifier=
              {String(
                runtimeLiveHandoff?.mutationAllowedByThisVerifier ?? false
              )}
            </span>
            <span>
              clusterMutationAttempted=
              {String(runtimeLiveHandoff?.clusterMutationAttempted ?? false)}
            </span>
            <span>
              registryMutationAttempted=
              {String(runtimeLiveHandoff?.registryMutationAttempted ?? false)}
            </span>
            <span>
              vectorWriteAttempted=
              {String(runtimeLiveHandoff?.vectorWriteAttempted ?? false)}
            </span>
            <span>
              approvalGated=
              {runtimeLiveHandoff?.approvalGatedCommandCount ?? 0}
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
            data-testid="opslens-aiops-monitoring-proxy-handoff"
          >
            <span>Monitoring Proxy</span>
            <span>{monitoringProxyHandoff?.actionMode ?? "handoffOnly"}</span>
            <span>status={monitoringProxyHandoff?.status ?? "needs-evidence"}</span>
            <span>owner={monitoringProxyHandoff?.owner ?? "cluster-sre"}</span>
            <span>
              enabled={String(monitoringProxyHandoff?.enabled ?? false)}
            </span>
            <span>
              reachable={String(monitoringProxyHandoff?.reachable ?? false)}
            </span>
            <span>
              approvalRequired=
              {String(monitoringProxyHandoff?.approvalRequired ?? true)}
            </span>
            <span>
              missingQueries=
              {(monitoringProxyHandoff?.missingQueries ?? []).length}
            </span>
            <span>
              mutationAllowedByThisVerifier=
              {String(
                monitoringProxyHandoff?.mutationAllowedByThisVerifier ?? false
              )}
            </span>
            <span>
              ticket=
              {monitoringProxyHandoff?.ticketPacket?.id ??
                "cluster-sre-monitoring-proxy-ticket"}
            </span>
          </div>
          <div
            className="admin-evidence-line"
            data-testid="opslens-aiops-monitoring-proxy-commands"
          >
            <span>{monitoringProxyHandoff?.nextCommand ?? "npm run verify:aiops"}</span>
            {(monitoringProxyHandoff?.readOnlyCommands ?? []).map((command) => (
              <span key={command.id}>
                {command.id}:mutation={String(command.mutation)}
              </span>
            ))}
            <span>
              first=
              {monitoringProxyHandoff?.ticketPacket?.firstReadOnlyAction.id ??
                "aiops-monitoring-proxy-smoke"}
            </span>
            <span>
              approval=
              {monitoringProxyHandoff?.ticketPacket?.approvalGatedAction.id ??
                "approval-gated-enable-monitoring-proxy-path"}
            </span>
            <span>
              requiresApproval=
              {String(
                monitoringProxyHandoff?.ticketPacket?.approvalGatedAction
                  .requiresExplicitApproval ?? true
              )}
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
                  Environment:
                    overview.installReadiness.environmentIsolation,
                  "Extension Point":
                    overview.installReadiness.lightspeedExtensionPoint,
                  "AI Ops Pipeline": overview.aiops.incidentPipeline.status,
                  "Console Dashboard": overview.installReadiness.consoleDashboard,
                  Operator: overview.installReadiness.operatorPackaging,
                  "OCP Connectivity": overview.installReadiness.ocpConnectivity,
                  "Operator Package": overview.installReadiness.operatorPackage,
                  "Operator Dry-run": overview.installReadiness.operatorDryRun,
                  "Operator Boundary":
                    overview.installReadiness.operatorRuntimeBoundary,
                  "Install Plan": overview.installReadiness.installPlan,
                  "RAG Ingestion":
                    overview.installReadiness.approvalPlan.ragIngestion.status,
                  "Certification Evidence":
                    overview.installReadiness.certificationReadiness,
                  "Community Submission":
                    overview.installReadiness.communityOperatorSubmission,
                  "Catalog Toolchain":
                    overview.installReadiness.catalogToolchain,
                  "Lab Bootstrap": overview.installReadiness.labBootstrap,
                  "Lab Handoff": overview.installReadiness.labHandoff,
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
                  "Roadmap Completion":
                    overview.installReadiness.roadmapCompletion.status,
                  "Completion Gate":
                    overview.installReadiness.completionGate.status,
                  "Pre-cluster Gate":
                    overview.installReadiness.preClusterInstallGate.status,
                  "Evidence Checkpoint":
                    overview.installReadiness.evidenceCheckpoint,
                  "Live Handoff": overview.installReadiness.liveHandoff,
                  "Network Handoff":
                    overview.installReadiness.ocpNetworkHandoff,
                  "Handoff Fallback":
                    overview.installReadiness.ocpNetworkHandoffApiFallback,
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
          {completionGate ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-completion-gate"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Completion Gate</h4>
                  <small>{completionGate.actionMode}</small>
                </div>
                <Gauge size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{completionGate.artifactStatus}</span>
                <span>head={completionGate.headSha}</span>
                <span>dirty={String(completionGate.worktreeDirty)}</span>
                <span>
                  readyToClaim100={String(completionGate.readyToClaim100)}
                </span>
                <span>
                  mutationBoundaryPassed=
                  {String(completionGate.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Complete</span>
                  <strong>{completionGate.percentComplete}%</strong>
                </div>
                <div>
                  <span>Passed</span>
                  <strong>
                    {completionGate.passedRequirements}/
                    {completionGate.totalRequirements}
                  </strong>
                </div>
                <div>
                  <span>Remaining</span>
                  <strong>{completionGate.remainingRequirements}</strong>
                </div>
                <div>
                  <span>External</span>
                  <strong>{completionGate.remainingExternalStateCount}</strong>
                </div>
                <div>
                  <span>Local</span>
                  <strong>{completionGate.remainingLocalOnlyCount}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong
                    className={`freshness ${statusClass(
                      completionGate.status
                    )}`}
                  >
                    {completionGate.status}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-remaining"
              >
                {completionGate.remainingTo100.slice(0, 8).map((gate) => (
                  <span key={`${gate.stage}-${gate.gateId}`}>
                    {gate.gateId}:{gate.lane}:{gate.owner}:{gate.priority}:
                    {gate.actionId}:next={gate.nextCommand}:external=
                    {String(gate.externalStateRequired)}:tickets=
                    {gate.ticketIds.join(",") || "none"}:readOnly=
                    {gate.readOnlyCommandIds.slice(0, 3).join(",") || "none"}
                    :setup=
                    {gate.setupCommandIds.slice(0, 3).join(",") || "none"}
                    :approval=
                    {gate.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      "none"}
                  </span>
                ))}
                {completionGate.remainingTo100.length === 0 ? (
                  <span>none</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-claim-requirements"
              >
                {completionGate.claimRequirements.map((requirement) => (
                  <span key={requirement.id}>
                    {requirement.id}={String(requirement.passed)}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-claim-packet"
              >
                <span>owner={completionGate.claimPacket.owner}</span>
                <span>status={completionGate.claimPacket.status}</span>
                <span>
                  packet=
                  {completionGate.claimPacket.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                </span>
                <span>exists={String(completionGate.claimPacket.exists)}</span>
                <span>
                  readyToClaim100=
                  {String(completionGate.claimPacket.readyToClaim100)}
                </span>
                <span>
                  remaining={completionGate.claimPacket.remainingRequirements}
                </span>
                <span>
                  gates=
                  {completionGate.claimPacket.remainingGateIds.join(",") ||
                    "none"}
                </span>
                <span>
                  failed=
                  {completionGate.claimPacket.failedClaimRequirementIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  sources=
                  {completionGate.claimPacket.sourceEvidenceChecklist
                    .map(
                      (source) =>
                        `${source.id}:${source.fresh && source.acceptable && !source.mutationViolation ? "pass" : "needs-evidence"}`
                    )
                    .join(",") || "none"}
                </span>
                <span>
                  failedSources=
                  {completionGate.claimPacket.failedSourceEvidenceIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  closure=
                  {completionGate.claimPacket.gateClosureMatrix
                    .map(
                      (gate) =>
                        `${gate.gateId}:${gate.owner}:${gate.closesClaimRequirementIds.length}`
                    )
                    .join(",") || "none"}
                </span>
                <span>
                  criticalPath=
                  {completionGate.claimPacket.actionQueueCriticalPathCount}
                </span>
                <span>
                  mutationBoundaryPassed=
                  {String(completionGate.claimPacket.mutationBoundaryPassed)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-owner-closeout"
              >
                {completionGate.ownerCloseoutPackets.map((packet) => (
                  <span key={packet.owner}>
                    {packet.owner}:gates={packet.gateIds.join(",") || "none"}
                    :tickets={packet.ticketIds.join(",") || "none"}:next=
                    {packet.firstNextCommand}:approvalRequired=
                    {String(packet.approvalRequired)}:readOnly=
                    {packet.readOnlyCommandIds.slice(0, 3).join(",") ||
                      "none"}
                    :setup=
                    {packet.setupCommandIds.slice(0, 3).join(",") || "none"}
                    :approval=
                    {packet.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      "none"}:packet=
                    {packet.markdownPath.split(/[\\/]/).pop()}:exists=
                    {String(packet.exists)}
                  </span>
                ))}
                <span>
                  cleanupDeletionAllowed=
                  {String(completionGate.ownerPacketCleanup.deletionAllowed)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-completion-gate-boundary"
              >
                <span>
                  bundleStatus={completionGate.releaseEvidenceBundle.status}
                </span>
                <span>
                  bundleMatchesRoadmap=
                  {String(
                    completionGate.releaseEvidenceBundle.bundleMatchesRoadmap
                  )}
                </span>
                <span>
                  publishReady=
                  {String(
                    completionGate.releaseEvidenceBundle.decision.publishReady
                  )}
                </span>
                <span>
                  installReady=
                  {String(
                    completionGate.releaseEvidenceBundle.decision.installReady
                  )}
                </span>
                <span>
                  actionQueueReady={String(completionGate.actionQueue.ready)}
                </span>
                <span>
                  criticalPath={completionGate.actionQueue.criticalPathCount}
                </span>
                <span>
                  unsafeTickets=
                  {completionGate.actionQueue.unsafeTickets.join(",") ||
                    "none"}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {completionGate.risk[0] ??
                    "Completion gate is evidence-only and cannot approve mutation."}
                </p>
                <p>
                  {completionGate.rollbackPath[0] ??
                    "Regenerate completion evidence after release evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {preClusterInstallGate ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-pre-cluster-install-gate"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Pre-cluster Install Gate</h4>
                  <small>{preClusterInstallGate.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{preClusterInstallGate.artifactStatus}</span>
                <span>head={preClusterInstallGate.headSha}</span>
                <span>
                  dirty={String(preClusterInstallGate.worktreeDirty)}
                </span>
                <span>
                  safeToRunClusterInstall=
                  {String(preClusterInstallGate.safeToRunClusterInstall)}
                </span>
                <span>
                  strictExitWouldFail=
                  {String(preClusterInstallGate.strictExitWouldFail)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Status</span>
                  <strong
                    className={`freshness ${statusClass(
                      preClusterInstallGate.status
                    )}`}
                  >
                    {preClusterInstallGate.status}
                  </strong>
                </div>
                <div>
                  <span>Failed Gates</span>
                  <strong>{preClusterInstallGate.failedGateIds.length}</strong>
                </div>
                <div>
                  <span>Sources</span>
                  <strong>{preClusterInstallGate.sources.length}</strong>
                </div>
                <div>
                  <span>Read-only</span>
                  <strong>{preClusterInstallGate.readOnlyCommands.length}</strong>
                </div>
                <div>
                  <span>Approval</span>
                  <strong>
                    {preClusterInstallGate.approvalGatedCommandsNotRun.length}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-pre-cluster-install-gate-requirements"
              >
                {preClusterInstallGate.gateRequirements.map((gate) => (
                  <span key={gate.id}>
                    {gate.id}:{gate.owner}:{String(gate.passed)}:next=
                    {gate.nextCommand}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-pre-cluster-install-gate-boundary"
              >
                <span>
                  failed=
                  {preClusterInstallGate.failedGateIds.join(",") || "none"}
                </span>
                <span>
                  sources=
                  {preClusterInstallGate.sources
                    .map(
                      (source) =>
                        `${source.id}:${source.fresh && !source.mutationViolation ? "pass" : "needs-evidence"}`
                    )
                    .join(",") || "none"}
                </span>
                <span>
                  readOnly=
                  {preClusterInstallGate.readOnlyCommands
                    .map((command) => command.id)
                    .join(",") || "none"}
                </span>
                <span>
                  approvalNotRun=
                  {preClusterInstallGate.approvalGatedCommandsNotRun
                    .map((command) => command.id)
                    .join(",") || "none"}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {preClusterInstallGate.risk[0] ??
                    "Pre-cluster gate blocks install until evidence is ready."}
                </p>
                <p>
                  {preClusterInstallGate.rollbackPath[0] ??
                    "No rollback is required for the verifier itself."}
                </p>
              </div>
            </div>
          ) : null}
          {roadmapCompletion ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-roadmap-completion"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Roadmap Completion</h4>
                  <small>{roadmapCompletion.actionMode}</small>
                </div>
                <Gauge size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{roadmapCompletion.artifactStatus}</span>
                <span>head={roadmapCompletion.headSha}</span>
                <span>dirty={String(roadmapCompletion.worktreeDirty)}</span>
                <span>
                  mutationBoundaryPassed=
                  {String(roadmapCompletion.mutationBoundaryPassed)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Complete</span>
                  <strong>{roadmapCompletion.percentComplete}%</strong>
                </div>
                <div>
                  <span>Passed</span>
                  <strong>
                    {roadmapCompletion.passedRequirements}/
                    {roadmapCompletion.totalRequirements}
                  </strong>
                </div>
                <div>
                  <span>Remaining</span>
                  <strong>{roadmapCompletion.remainingRequirements}</strong>
                </div>
                <div>
                  <span>Blockers</span>
                  <strong>{roadmapCompletion.criticalPathBlockerCount}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong
                    className={`freshness ${statusClass(
                      roadmapCompletion.status
                    )}`}
                  >
                    {roadmapCompletion.status}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-remaining-gates"
              >
                {roadmapCompletion.remaining.slice(0, 8).map((entry) => (
                  <span key={`${entry.stage}-${entry.id}`}>
                    {entry.stage}/{entry.id}:{entry.status}
                  </span>
                ))}
                {roadmapCompletion.remaining.length === 0 ? (
                  <span>none</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-closure-boundary"
              >
                <span>
                  externalState={roadmapCompletion.remainingExternalStateCount}
                </span>
                <span>localOnly={roadmapCompletion.remainingLocalOnlyCount}</span>
                <span>
                  externalGates=
                  {roadmapCompletion.remainingExternalStateGateIds.join(",") ||
                    "none"}
                </span>
                <span>
                  localGates=
                  {roadmapCompletion.remainingLocalOnlyGateIds.join(",") ||
                    "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-remaining-handoffs"
              >
                {roadmapCompletion.remainingHandoffs.slice(0, 8).map((entry) => (
                  <span key={`${entry.stage}-${entry.gateId}-${entry.actionId}`}>
                    {entry.gateId}:{entry.owner}:{entry.priority}:
                    {entry.actionId}:next={entry.nextCommand}:external=
                    {String(entry.externalStateRequired)}:tickets=
                    {entry.ticketIds.join(",") || "none"}:readOnly=
                    {entry.readOnlyCommandIds.slice(0, 3).join(",") || "none"}
                    :setup=
                    {entry.setupCommandIds.slice(0, 3).join(",") || "none"}
                    :approval=
                    {entry.approvalGatedCommandIds.slice(0, 3).join(",") ||
                      "none"}
                  </span>
                ))}
                {roadmapCompletion.remainingHandoffs.length === 0 ? (
                  <span>none</span>
                ) : null}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-roadmap-critical-path-blockers"
              >
                {roadmapCompletion.criticalPathBlockers
                  .slice(0, 6)
                  .map((entry) => (
                    <span key={`${entry.lane}-${entry.actionId}`}>
                      {entry.owner}:{entry.actionId}:next={entry.nextCommand}
                    </span>
                  ))}
                {roadmapCompletion.criticalPathBlockers.length === 0 ? (
                  <span>none</span>
                ) : null}
              </div>
              <div className="remediation-notes">
                <p>
                  {roadmapCompletion.risk[0] ??
                    "Roadmap completion is evidence-only and cannot approve mutation."}
                </p>
                <p>
                  {roadmapCompletion.rollbackPath[0] ??
                    "Regenerate roadmap evidence after release evidence changes."}
                </p>
              </div>
            </div>
          ) : null}
          {extensionPoint ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-lightspeed-extension-point"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Lightspeed Extension Point</h4>
                  <small>{extensionPoint.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{extensionPoint.artifactStatus}</span>
                <span>contract={extensionPoint.productContract}</span>
                <span>endpoint={extensionPoint.lightspeedFacingEndpoint}</span>
                <span>smoke={extensionPoint.localSmokeEndpoint}</span>
                <span>
                  webhook=
                  {String(extensionPoint.undocumentedWebhookSupported)}
                </span>
                <span>
                  legacyConfigMap=
                  {String(extensionPoint.legacyConfigMapRegistrationSupported)}
                </span>
                <span>
                  technologyPreview=
                  {String(extensionPoint.technologyPreview)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-olsconfig"
              >
                <span>{extensionPoint.olsconfig.kind}</span>
                <span>
                  server={extensionPoint.olsconfig.server.name}
                </span>
                <span>
                  url={extensionPoint.olsconfig.server.url}
                </span>
                <span>
                  featureGates=
                  {extensionPoint.olsconfig.featureGates.join(", ") ||
                    "missing"}
                </span>
                <span>
                  userBearer=
                  {String(extensionPoint.olsconfig.server.userBearerForwarding)}
                </span>
                <span>
                  secretHeader=
                  {String(extensionPoint.olsconfig.server.secretHeader)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-routes"
              >
                {extensionPoint.routes.map((route) => (
                  <span key={`${route.method}-${route.path}`}>
                    {route.method} {route.path}:{route.role}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-lightspeed-extension-boundary"
              >
                <span>
                  clusterMutationAttempted=
                  {String(
                    extensionPoint.mutationBoundary.clusterMutationAttempted
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    extensionPoint.mutationBoundary.registryMutationAttempted
                  )}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(extensionPoint.mutationBoundary.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(
                    extensionPoint.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {extensionPoint.evidence[0] ??
                    "Extension point evidence is read-only."}
                </p>
                <p>
                  {extensionPoint.risk[0] ??
                    "Live OLSConfig registration still needs approval."}
                </p>
              </div>
            </div>
          ) : null}
          {operatorPackage ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-operator-package"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Operator Package</h4>
                  <small>{operatorPackage.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{operatorPackage.artifactStatus}</span>
                <span>head={operatorPackage.headSha}</span>
                <span>dirty={String(operatorPackage.worktreeDirty)}</span>
                <span>
                  clusterMutationAttempted=
                  {String(operatorPackage.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(operatorPackage.registryMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(operatorPackage.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-boundary"
              >
                <span>
                  staticOlsConfig=
                  {String(
                    operatorPackage.packageBoundary.staticStackContainsOlsConfig
                  )}
                </span>
                <span>
                  staticRegistration=
                  {String(
                    operatorPackage.packageBoundary
                      .staticStackAppliesLightspeedRegistration
                  )}
                </span>
                <span>
                  appObjects=
                  {operatorPackage.packageBoundary.appManifestObjectCount}
                </span>
                <span>
                  approvalGatedTemplate=
                  {String(
                    operatorPackage.packageBoundary.approvalGatedTemplateExists
                  )}
                </span>
                <span>
                  mode={operatorPackage.packageBoundary.reconcileMode}
                </span>
                <span>
                  approvalGatedOnly=
                  {String(operatorPackage.packageBoundary.approvalGatedOnly)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-olsconfig"
              >
                <span>{operatorPackage.packageBoundary.olsconfigTemplateKind}</span>
                <span>
                  name={operatorPackage.packageBoundary.olsconfigTemplateName}
                </span>
                <span>
                  namespace=
                  {operatorPackage.packageBoundary.olsconfigTemplateNamespace}
                </span>
                <span>
                  server={operatorPackage.packageBoundary.mcpServerName}
                </span>
                <span>
                  featureGates=
                  {operatorPackage.packageBoundary.featureGates.join(", ") ||
                    "missing"}
                </span>
                <span>
                  headers=
                  {operatorPackage.packageBoundary.headerTypes.join(", ") ||
                    "missing"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-package-forbidden"
              >
                {operatorPackage.packageBoundary.forbiddenRegistrationPaths
                  .slice(0, 3)
                  .map((path) => (
                    <span key={path}>{path}</span>
                  ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {operatorPackage.evidence[0] ??
                    "Operator package evidence is read-only."}
                </p>
                <p>
                  {operatorPackage.rollbackPath[0] ??
                    operatorPackage.packageBoundary.rollbackPath}
                </p>
              </div>
            </div>
          ) : null}
          {operatorRuntimeBoundary ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-operator-runtime-boundary"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Operator Runtime Boundary</h4>
                  <small>{operatorRuntimeBoundary.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{operatorRuntimeBoundary.artifactStatus}</span>
                <span>head={operatorRuntimeBoundary.headSha}</span>
                <span>
                  dirty={String(operatorRuntimeBoundary.worktreeDirty)}
                </span>
                <span>
                  mode={operatorRuntimeBoundary.parity.lightspeedMode}
                </span>
                <span>
                  phase={operatorRuntimeBoundary.parity.lightspeedPhase}
                </span>
                <span>
                  willPatch=
                  {String(operatorRuntimeBoundary.parity.willPatchLightspeed)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-operator-runtime-boundary-guards"
              >
                <span>
                  ValidateOnlyBeforeRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .validateOnlyGuardBeforeRead
                  )}
                </span>
                <span>
                  endpointBeforeRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .endpointGuardBeforeRead
                  )}
                </span>
                <span>
                  patchCallCount=
                  {
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .patchCallCount
                  }
                </span>
                <span>
                  patchAfterRead=
                  {String(
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .patchAfterRead
                  )}
                </span>
                <span>
                  legacyConfigMapReferences=
                  {
                    operatorRuntimeBoundary.goLightspeedMutationBoundary
                      .configMapReferenceCount
                  }
                </span>
              </div>
              <div className="admin-evidence-line">
                <span>
                  clusterMutationAttempted=
                  {String(operatorRuntimeBoundary.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(operatorRuntimeBoundary.registryMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(
                    operatorRuntimeBoundary.mutationAllowedByThisVerifier
                  )}
                </span>
                <span>
                  assistantMutationAllowed=
                  {String(
                    operatorRuntimeBoundary.parity.assistantMutationAllowed
                  )}
                </span>
              </div>
              <div className="remediation-notes">
                <p>
                  {operatorRuntimeBoundary.evidence[0] ??
                    "Operator runtime boundary evidence is read-only."}
                </p>
                <p>
                  {operatorRuntimeBoundary.risk[0] ??
                    "Live Operator SDK and OLM smoke remain approval-gated."}
                </p>
              </div>
            </div>
          ) : null}
          {envContract ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-env-contract"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Environment Isolation</h4>
                  <small>{envContract.actionMode}</small>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{envContract.artifactStatus}</span>
                <span>head={envContract.headSha}</span>
                <span>dirty={String(envContract.worktreeDirty)}</span>
                <span>
                  activeOcpTarget={String(envContract.activeOcpTarget)}
                </span>
                <span>
                  activeLightspeedTarget=
                  {String(envContract.activeLightspeedTarget)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Active Keys</span>
                  <strong>{envContract.activeKeyCount}</strong>
                </div>
                <div>
                  <span>Commented Legacy</span>
                  <strong>{envContract.commentedTrackedCount}</strong>
                </div>
                <div>
                  <span>Duplicates</span>
                  <strong>{envContract.duplicateActiveKeys.length}</strong>
                </div>
                <div>
                  <span>Missing Values</span>
                  <strong>{envContract.activeMissingValues.length}</strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-env-contract-boundary"
              >
                <span>
                  clusterMutationAttempted=
                  {String(envContract.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(envContract.registryMutationAttempted)}
                </span>
                <span>
                  vectorWriteAttempted=
                  {String(envContract.vectorWriteAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(envContract.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-env-contract-checks"
              >
                {envContract.checks.slice(0, 4).map((check) => (
                  <span key={check.name}>
                    {check.name}={check.status}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {envContract.evidence[0] ??
                    "Environment contract evidence records key state only."}
                </p>
                <p>
                  {envContract.rollbackPath[0] ??
                    "Run npm run verify:env after changing .env target keys."}
                </p>
              </div>
            </div>
          ) : null}
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
                  <strong>{ocpConnectivity.target.redactedBaseUrl}</strong>
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
                data-testid="opslens-ocp-credential-hygiene"
              >
                <span>
                  diagnosis=
                  {ocpConnectivity.credentialHygiene.credentialDiagnosis}
                </span>
                <span>
                  localFormatIssue=
                  {String(ocpConnectivity.credentialHygiene.localFormatIssue)}
                </span>
                <span>
                  source={ocpConnectivity.credentialHygiene.tokenSource}
                </span>
                <span>
                  lengthClass=
                  {ocpConnectivity.credentialHygiene.tokenLengthClass}
                </span>
                <span>
                  storedByVerifier=
                  {String(
                    ocpConnectivity.credentialHygiene
                      .credentialStoredByVerifier
                  )}
                </span>
                <span>
                  tokenRedacted=
                  {String(ocpConnectivity.credentialHygiene.tokenValueRedacted)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-context"
              >
                <span>
                  context={ocpConnectivity.diagnostics.ocContext.contextStatus}
                </span>
                <span>
                  auth={ocpConnectivity.diagnostics.ocContext.authStatus}
                </span>
                <span>
                  server={ocpConnectivity.diagnostics.ocContext.serverStatus}
                </span>
                <span>
                  kubeconfigEnv=
                  {String(
                    ocpConnectivity.diagnostics.ocContext.kubeconfigEnvConfigured
                  )}
                </span>
                <span>
                  defaultKubeconfig=
                  {String(
                    ocpConnectivity.diagnostics.ocContext
                      .defaultKubeconfigPresent
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-recovery"
              >
                <span>status={ocpConnectivity.authRecovery.status}</span>
                <span>owner={ocpConnectivity.authRecovery.owner}</span>
                <span>
                  diagnosis=
                  {ocpConnectivity.authRecovery.credentialDiagnosis}
                </span>
                <span>
                  humanApproval=
                  {String(
                    ocpConnectivity.authRecovery.mutationBoundary
                      .credentialRefreshRequiresHumanApproval
                  )}
                </span>
                <span>
                  tokenRedacted=
                  {String(
                    ocpConnectivity.authRecovery.mutationBoundary
                      .tokenValueRedacted
                  )}
                </span>
                <span>
                  storedByVerifier=
                  {String(
                    ocpConnectivity.authRecovery.mutationBoundary
                      .credentialStoredByVerifier
                  )}
                </span>
                <span>
                  next={ocpConnectivity.authRecovery.nextCommands[0] ?? "none"}
                </span>
                <span>
                  packet=
                  {ocpConnectivity.authRecovery.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                </span>
                <span>
                  exists={String(ocpConnectivity.authRecovery.exists)}
                </span>
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
                  <strong>{networkHandoff.target.redactedBaseUrl}</strong>
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-ticket-packet"
              >
                <span>
                  {networkHandoff.ticketPacket.id}:{networkHandoff.ticketPacket.owner}
                  :{networkHandoff.ticketPacket.severity}
                </span>
                <span>{networkHandoff.ticketPacket.title}</span>
                <span>
                  first={networkHandoff.ticketPacket.firstReadOnlyAction.id}
                  :mutation=
                  {String(networkHandoff.ticketPacket.firstReadOnlyAction.mutation)}
                </span>
                <span>
                  approval=
                  {String(
                    networkHandoff.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                </span>
                <span>
                  next={networkHandoff.ticketPacket.nextCommands.slice(0, 2).join(" | ")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-first-actions"
              >
                {networkHandoff.firstNetworkActions.length ? (
                  networkHandoff.firstNetworkActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>network first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-source-artifacts"
              >
                {networkHandoff.sourceArtifacts.slice(0, 5).map((source) => (
                  <span key={source.id}>
                    {source.id}:{source.status}:fresh={String(source.fresh)}
                    :required={String(source.required)}
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
          {networkHandoffApiFallback ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-ocp-network-handoff-api-fallback"
            >
              <div className="admin-evidence-line">
                <span>{networkHandoffApiFallback.artifactStatus}</span>
                <span>{networkHandoffApiFallback.actionMode}</span>
                <span>cases={networkHandoffApiFallback.caseCount}</span>
                <span>failedChecks={networkHandoffApiFallback.failedCheckCount}</span>
                <span>
                  clusterMutationAttempted=
                  {String(networkHandoffApiFallback.clusterMutationAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(networkHandoffApiFallback.registryMutationAttempted)}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-network-handoff-api-fallback-cases"
              >
                {networkHandoffApiFallback.cases.map((testCase) => (
                  <span key={testCase.classification}>
                    {testCase.classification}:{testCase.owner}:{testCase.ticketId}
                    :first={testCase.firstActionId}:approval=
                    {String(testCase.networkChangeRequiresExplicitApproval)}
                  </span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>
                  {networkHandoffApiFallback.risk[0] ??
                    "Fallback proof keeps partial handoff API routing classification-aware."}
                </p>
                <p>
                  {networkHandoffApiFallback.rollbackPath[0] ??
                    "Regenerate fallback proof after changing handoff API mapping."}
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-ocp-auth-rbac-plan-context"
              >
                <span>context={authRbacPlan.ocContext.contextStatus}</span>
                <span>auth={authRbacPlan.ocContext.authStatus}</span>
                <span>server={authRbacPlan.ocContext.serverStatus}</span>
                <span>
                  kubeconfigEnv=
                  {String(authRbacPlan.ocContext.kubeconfigEnvConfigured)}
                </span>
                <span>
                  defaultKubeconfig=
                  {String(authRbacPlan.ocContext.defaultKubeconfigPresent)}
                </span>
              </div>
              {authRbacPlan.ticketPacket ? (
                <div
                  className="admin-evidence-line"
                  data-testid="opslens-ocp-auth-rbac-plan-ticket"
                >
                  <span>
                    {authRbacPlan.ticketPacket.id}:{authRbacPlan.ticketPacket.owner}
                    :{authRbacPlan.ticketPacket.classification}:first=
                    {authRbacPlan.ticketPacket.firstReadOnlyAction.id}:approval=
                    {authRbacPlan.ticketPacket.approvalGatedAction.id}
                    :requiresApproval=
                    {String(
                      authRbacPlan.ticketPacket.approvalGatedAction
                        .requiresExplicitApproval
                    )}
                    :mutationAllowed=
                    {String(
                      authRbacPlan.ticketPacket.mutationBoundary
                        .mutationAllowedByThisVerifier
                    )}
                  </span>
                </div>
              ) : null}
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-live-handoff-post-approval-smoke"
              >
                <span>
                  classification=
                  {liveHandoff.postApprovalSmoke.ocpClassification}
                </span>
                <span>
                  rbac=
                  {liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}/
                  {liveHandoff.postApprovalSmoke.requiredRbacReviewCount}
                </span>
                <span>
                  unknown=
                  {liveHandoff.postApprovalSmoke.requiredRbacUnknownCount}
                </span>
                <span>
                  lightspeedClassification=
                  {liveHandoff.postApprovalSmoke.lightspeedClassification}
                </span>
                <span>
                  lightspeedAuthReady=
                  {String(liveHandoff.postApprovalSmoke.lightspeedAuthReady)}
                </span>
                <span>
                  sources=
                  {liveHandoff.postApprovalSmoke.sourceArtifacts.length
                    ? liveHandoff.postApprovalSmoke.sourceArtifacts
                        .slice(0, 2)
                        .map(
                          (source) =>
                            `${source.id}:${source.status}:fresh=${String(
                              source.fresh
                            )}`
                        )
                        .join(", ")
                    : "missing"}
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
                      ? `${liveHandoff.postApprovalSmoke.artifactStatus} rbac=${liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}/${liveHandoff.postApprovalSmoke.requiredRbacReviewCount} unknown=${liveHandoff.postApprovalSmoke.requiredRbacUnknownCount}`
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-security-review"
              >
                <span>
                  securityReviewDrafts=
                  {releaseRefreshSecurityReviewCommand?.status ?? "missing"}
                </span>
                <span>
                  expectedNonZero=
                  {String(
                    releaseRefreshSecurityReviewCommand?.expectedNonZero ??
                      false
                  )}
                </span>
                <span>id=security-review-drafts-all</span>
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
                <div>
                  <span>Critical Path</span>
                  <strong>
                    ready={String(releaseRefresh.actionQueue.criticalPathReady)},
                    count={releaseRefresh.actionQueue.criticalPathCount}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-refresh-critical-path"
              >
                <span>
                  missingDiagnostics=
                  {releaseRefresh.actionQueue.missingCriticalPathDiagnostics.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  missingTickets=
                  {releaseRefresh.actionQueue.missingCriticalPathTickets.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  unsafeTickets=
                  {releaseRefresh.actionQueue.unsafeCriticalPathTickets.join(
                    ", "
                  ) || "none"}
                </span>
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
                    :exists={String(packet.exists)}:first={packet.firstActionId}
                    :next={packet.firstNextCommand}
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
                  <span>Action Queue</span>
                  <strong>
                    ready={String(releaseBundle.actionQueueSafety.ready)},
                    criticalPath=
                    {releaseBundle.actionQueueSafety.criticalPathCount}
                  </strong>
                </div>
                <div>
                  <span>Roadmap</span>
                  <strong>
                    {releaseBundle.roadmapCompletion.percentComplete}%,
                    remaining=
                    {releaseBundle.roadmapCompletion.remainingRequirements}
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
              <div className="admin-evidence-line">
                <span>
                  actionQueueStatus={releaseBundle.actionQueueSafety.status}
                </span>
                <span>
                  actionQueueFresh=
                  {String(releaseBundle.actionQueueSafety.fresh)}
                </span>
                <span>
                  unsafeTickets=
                  {releaseBundle.actionQueueSafety.unsafeTickets.join(", ") ||
                    "none"}
                </span>
                <span>
                  roadmapExternalState=
                  {releaseBundle.roadmapCompletion.remainingExternalStateCount}
                </span>
                <span>
                  roadmapLocalOnly=
                  {releaseBundle.roadmapCompletion.remainingLocalOnlyCount}
                </span>
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
                data-testid="opslens-release-action-queue-critical-path"
              >
                {releaseActionQueue.criticalPath.length > 0 ? (
                  releaseActionQueue.criticalPath.map((entry) => (
                    <span key={entry.lane}>
                      {entry.lane}:{entry.owner}:{entry.priority}:
                      {entry.actionId}:next={entry.nextCommand}:ticket=
                      {entry.ticketPacket?.id ?? "none"}:ticketFirst=
                      {entry.ticketPacket?.firstReadOnlyAction.id ?? "none"}
                      :extTicket={entry.externalRuntimeTicketPacket?.id ?? "none"}
                      :extFirst=
                      {entry.externalRuntimeTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :finalTicket=
                      {entry.externalRuntimeFinalEvidenceTicketPacket?.id ??
                        "none"}
                      :finalFirst=
                      {entry.externalRuntimeFinalEvidenceTicketPacket
                        ?.firstReadOnlyAction.id ?? "none"}
                      :productTicket=
                      {entry.externalRuntimeProductTicketPacket?.id ?? "none"}
                      :productFirst=
                      {entry.externalRuntimeProductTicketPacket?.firstReadOnlyAction
                        .id ?? "none"}
                      :certTicket=
                      {entry.certificationToolingTicketPacket?.id ?? "none"}
                      :certFirst=
                      {entry.certificationToolingTicketPacket?.firstReadOnlyAction
                        .id ?? "none"}
                      :securityTicket=
                      {entry.securityReviewTicketPacket?.id ?? "none"}
                      :securityFirst=
                      {entry.securityReviewTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :publishTicket=
                      {entry.releasePublishTicketPacket?.id ?? "none"}
                      :publishFirst=
                      {entry.releasePublishTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :installTicket=
                      {entry.installApprovalTicketPacket?.id ?? "none"}
                      :installFirst=
                      {entry.installApprovalTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :catalogTicket=
                      {entry.catalogToolchainTicketPacket?.id ?? "none"}
                      :catalogFirst=
                      {entry.catalogToolchainTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :ragTicket=
                      {entry.ragProductionTicketPacket?.id ?? "none"}
                      :ragFirst=
                      {entry.ragProductionTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :aiopsTicket=
                      {entry.aiopsMonitoringTicketPacket?.id ?? "none"}
                      :aiopsFirst=
                      {entry.aiopsMonitoringTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :runtimeTicket=
                      {entry.runtimeEvidenceTicketPacket?.id ?? "none"}
                      :runtimeFirst=
                      {entry.runtimeEvidenceTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :tools={entry.missingRequiredTools.join(",") || "none"}
                      :setup={entry.setupCommandIds.join(",") || "none"}:readOnly=
                      {entry.readOnlyCommandIds.join(",") || "none"}:approval=
                      {entry.approvalGatedCommandIds.join(",") || "none"}
                      :diagnostics={entry.diagnostics.join(",") || "none"}
                    </span>
                  ))
                ) : (
                  <span>critical path clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-source-artifacts"
              >
                {releaseActionQueue.sourceArtifacts.slice(0, 8).map((source) => (
                  <span key={source.id}>
                    {source.id}:{source.status}:fresh={String(source.fresh)}
                    :required={String(source.required)}:mutation=
                    {String(source.mutationViolation)}
                  </span>
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
                    {packet.approvalGatedCommandIds.length}:first=
                    {packet.firstActionId}:next={packet.firstNextCommand}
                    :ticket={packet.firstTicketPacket?.id ?? "none"}:ticketFirst=
                    {packet.firstTicketPacket?.firstReadOnlyAction.id ?? "none"}
                    :extTicket=
                    {packet.firstExternalRuntimeTicketPacket?.id ?? "none"}
                    :extFirst=
                    {packet.firstExternalRuntimeTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :finalTicket=
                    {packet.firstExternalRuntimeFinalEvidenceTicketPacket?.id ??
                      "none"}
                    :finalFirst=
                    {packet.firstExternalRuntimeFinalEvidenceTicketPacket
                      ?.firstReadOnlyAction.id ?? "none"}
                    :productTicket=
                    {packet.firstExternalRuntimeProductTicketPacket?.id ?? "none"}
                    :productFirst=
                    {packet.firstExternalRuntimeProductTicketPacket
                      ?.firstReadOnlyAction.id ?? "none"}
                    :certTicket=
                    {packet.firstCertificationToolingTicketPacket?.id ?? "none"}
                    :certFirst=
                    {packet.firstCertificationToolingTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :securityTicket=
                    {packet.firstSecurityReviewTicketPacket?.id ?? "none"}
                    :securityFirst=
                    {packet.firstSecurityReviewTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :publishTicket=
                    {packet.firstReleasePublishTicketPacket?.id ?? "none"}
                    :publishFirst=
                    {packet.firstReleasePublishTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :installTicket=
                    {packet.firstInstallApprovalTicketPacket?.id ?? "none"}
                    :installFirst=
                    {packet.firstInstallApprovalTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :catalogTicket=
                    {packet.firstCatalogToolchainTicketPacket?.id ?? "none"}
                    :catalogFirst=
                    {packet.firstCatalogToolchainTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :ragTicket=
                    {packet.firstRagProductionTicketPacket?.id ?? "none"}
                    :ragFirst=
                    {packet.firstRagProductionTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :aiopsTicket=
                    {packet.firstAiopsMonitoringTicketPacket?.id ?? "none"}
                    :aiopsFirst=
                    {packet.firstAiopsMonitoringTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
                    :runtimeTicket=
                    {packet.firstRuntimeEvidenceTicketPacket?.id ?? "none"}
                    :runtimeFirst=
                    {packet.firstRuntimeEvidenceTicketPacket?.firstReadOnlyAction
                      .id ?? "none"}
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
                data-testid="opslens-release-action-queue-diagnostics"
              >
                {releaseActionQueue.items
                  .filter((entry) => entry.diagnostics.length > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:
                      {entry.diagnostics
                        .slice(0, 2)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-decision-actions"
              >
                {releaseDecisionActions.length > 0 ? (
                  releaseDecisionActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:next={entry.nextCommand}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 8)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ") || "none"}
                    </span>
                  ))
                ) : (
                  <span>decision actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-approval-handoff"
              >
                {releaseApprovalHandoffActions.map((entry) => (
                  <span key={entry.id}>
                    {entry.owner}:
                    {entry.approvalGatedCommands
                      .map((command) => command.id)
                      .join(", ")}
                    :diagnostics=
                    {entry.diagnostics.map((diagnostic) => diagnostic.id).join(",") ||
                      "none"}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-readonly-handoff"
              >
                {releaseReadOnlyHandoffActions.map((entry) => (
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
                      :diagnostics=
                      {entry.diagnostics.map((diagnostic) => diagnostic.id).join(",") ||
                        "none"}
                    </span>
                  ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-network-actions"
              >
                {releaseNetworkActions.length > 0 ? (
                  releaseNetworkActions.slice(0, 5).map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :readOnly=
                      {entry.readOnlyCommands
                        .slice(0, 4)
                        .map((command) => command.id)
                        .join(", ")}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 8)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                    </span>
                  ))
                ) : (
                  <span>network actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-action-queue-candidate-actions"
              >
                {releaseCandidateActions.length > 0 ? (
                  releaseCandidateActions.map((entry) => (
                    <span key={entry.id}>
                      {entry.id}:{entry.owner}:{entry.priority}:{entry.nextCommand}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 7)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
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
                      :catalogTicket=
                      {entry.catalogToolchainTicketPacket?.id ?? "none"}
                      :catalogFirst=
                      {entry.catalogToolchainTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :catalogSetup=
                      {entry.catalogToolchainTicketPacket?.setupAction.id ??
                        "none"}
                      :catalogLocal=
                      {entry.catalogToolchainTicketPacket?.localArtifactAction.id ??
                        "none"}
                      :catalogApproval=
                      {entry.catalogToolchainTicketPacket?.approvalGatedAction.id ??
                        "none"}
                      :secretInput=
                      {String(
                        entry.catalogToolchainTicketPacket?.setupAction
                          .requiresHumanSecretInput ?? false
                      )}
                      :publishApproval=
                      {String(
                        entry.catalogToolchainTicketPacket?.mutationBoundary
                          .catalogPublishRequiresExplicitApproval ?? false
                      )}
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 5)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ") || "none"}
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
                      :diagnostics=
                      {entry.diagnostics
                        .slice(0, 2)
                        .map(
                          (diagnostic) =>
                            `${diagnostic.id}=${diagnostic.value}`
                        )
                        .join(" | ")}
                      :ragTicket={entry.ragProductionTicketPacket?.id ?? "none"}
                      :ragApproval=
                      {entry.ragProductionTicketPacket?.approvalGatedAction.id ??
                        "none"}
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
                      :ticket={entry.aiopsMonitoringTicketPacket?.id ?? "none"}
                      :ticketFirst=
                      {entry.aiopsMonitoringTicketPacket?.firstReadOnlyAction.id ??
                        "none"}
                      :ticketApproval=
                      {entry.aiopsMonitoringTicketPacket?.approvalGatedAction.id ??
                        "none"}
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
                      :ticket={entry.ticketPacket?.id ?? "none"}:ticketFirst=
                      {entry.ticketPacket?.firstReadOnlyAction.id ?? "none"}
                      :ticketApproval=
                      {entry.ticketPacket?.approvalGatedAction.id ?? "none"}
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
                          .map((lane) => `${lane.id}:${lane.status}`)
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
                data-testid="opslens-install-first-approval-actions"
              >
                {approvalPlan.firstApprovalActions.length ? (
                  approvalPlan.firstApprovalActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.nextCommand}:mutation=
                      {String(action.mutation)}:approval=
                      {String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>first approval actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-approval-ticket"
              >
                <span>
                  {approvalPlan.ticketPacket.id}:{approvalPlan.ticketPacket.owner}:
                  {approvalPlan.ticketPacket.classification}:first=
                  {approvalPlan.ticketPacket.firstReadOnlyAction.id}:approval=
                  {approvalPlan.ticketPacket.approvalGatedAction.id}
                  :requiresApproval=
                  {String(
                    approvalPlan.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(
                    approvalPlan.ticketPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-cluster-admin-packet"
              >
                <span>
                  packet=
                  {approvalPlan.clusterAdminPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ?? approvalPlan.clusterAdminPacket.markdownPath}
                </span>
                <span>
                  exists={String(approvalPlan.clusterAdminPacket.exists)}
                </span>
                <span>
                  ticket={approvalPlan.clusterAdminPacket.ticketId}
                </span>
                <span>
                  decision=
                  {approvalPlan.clusterAdminPacket.installDecisionActionId}
                </span>
                <span>
                  first={approvalPlan.clusterAdminPacket.firstReadOnlyActionId}
                </span>
                <span>
                  approval=
                  {approvalPlan.clusterAdminPacket.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                </span>
                <span>
                  installExecuted=
                  {String(
                    approvalPlan.clusterAdminPacket.installExecutedByVerifier
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    approvalPlan.clusterAdminPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-install-decision-action"
              >
                <span>
                  {approvalPlan.installDecisionAction.id}:
                  {approvalPlan.installDecisionAction.owner}:status=
                  {approvalPlan.installDecisionAction.status}:first=
                  {approvalPlan.installDecisionAction.readOnlyPreflightCommandId}
                  :lightspeed=
                  {approvalPlan.installDecisionAction.lightspeedPreviewCommandId}
                  :rag=
                  {approvalPlan.installDecisionAction.ragIngestionReviewCommand}
                  :approval=
                  {approvalPlan.installDecisionAction.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                  :mode=
                  {approvalPlan.installDecisionAction.lightspeedRegistrationMode}
                  :ragStatus=
                  {approvalPlan.installDecisionAction.ragIngestionStatus}
                  :mutationAllowed=
                  {String(approvalPlan.installDecisionAction.mutationAllowed)}
                  :writesLocalEvidence=
                  {String(approvalPlan.installDecisionAction.writesLocalEvidence)}
                  :clusterMutationAttempted=
                  {String(
                    approvalPlan.installDecisionAction.clusterMutationAttempted
                  )}
                  :vectorWriteAttempted=
                  {String(approvalPlan.installDecisionAction.vectorWriteAttempted)}
                  :ingestionJobCreated=
                  {String(approvalPlan.installDecisionAction.ingestionJobCreated)}
                  :installRequiresExplicitApproval=
                  {String(
                    approvalPlan.installDecisionAction
                      .installRequiresExplicitApproval
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
                  <span>Next Action</span>
                  <strong>
                    {catalogToolchainPlan.nextAction.id}:
                    {catalogToolchainPlan.nextAction.owner}
                  </strong>
                </div>
                <div>
                  <span>Handoff</span>
                  <strong>
                    {catalogToolchainPlan.markdownPath !== "missing"
                      ? catalogToolchainPlan.markdownPath
                          .split(/[\\/]/)
                          .pop()
                      : "missing"}
                  </strong>
                </div>
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
                  {catalogToolchainPlan.currentJudgment ??
                    catalogToolchainPlan.risk[0] ??
                    "Catalog toolchain evidence reads local readiness only."}
                </p>
                <p>
                  {catalogToolchainPlan.nextAction.command}
                </p>
                <p>
                  {catalogToolchainPlan.nextAction.reason ??
                    catalogToolchainPlan.rollbackPath[0] ??
                    "Regenerate catalog toolchain evidence from a clean worktree."}
                </p>
              </div>
            </div>
          ) : null}
          {labBootstrapPlan && labHandoffPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-lab-readiness"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Dedicated CRC Lab Readiness</h4>
                  <small>{labBootstrapPlan.actionMode}</small>
                </div>
                <ListChecks size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{labBootstrapPlan.artifactStatus}</span>
                <span>{labHandoffPlan.artifactStatus}</span>
                <span>head={labBootstrapPlan.headSha}</span>
                <span>dirty={String(labBootstrapPlan.worktreeDirty)}</span>
                <span>
                  clusterMutationAttempted=
                  {String(
                    labBootstrapPlan.mutationBoundary.clusterMutationAttempted ||
                      labHandoffPlan.mutationBoundary.clusterMutationAttempted
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    labBootstrapPlan.mutationBoundary.registryMutationAttempted ||
                      labHandoffPlan.mutationBoundary.registryMutationAttempted
                  )}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Lab Tier</span>
                  <strong>{labBootstrapPlan.labTier}</strong>
                </div>
                <div>
                  <span>CPU / RAM</span>
                  <strong>
                    {labBootstrapPlan.machine.cpuCount} cores /{" "}
                    {labBootstrapPlan.machine.ramGb}GiB
                  </strong>
                </div>
                <div>
                  <span>GPU Runtime</span>
                  <strong>
                    {labBootstrapPlan.gpuRuntimeCandidate
                      ? "candidate"
                      : labBootstrapPlan.runtimePlacement}
                  </strong>
                </div>
                <div>
                  <span>Recommended CRC</span>
                  <strong>
                    {labBootstrapPlan.recommendedCrc.memoryGb}GiB /{" "}
                    {labBootstrapPlan.recommendedCrc.cpuCores} CPU /{" "}
                    {labBootstrapPlan.recommendedCrc.diskGb}GiB
                  </strong>
                </div>
                <div>
                  <span>Image Map</span>
                  <strong>
                    blocking={labBootstrapPlan.imageRefPlan.blockingCount},
                    external={labBootstrapPlan.imageRefPlan.externalRuntimeCount}
                  </strong>
                </div>
                <div>
                  <span>Portable Tar</span>
                  <strong>
                    exists={String(labHandoffPlan.imageTar.exists)},
                    missingTags=
                    {labHandoffPlan.imageTar.missingTags.join(",") || "none"}
                  </strong>
                </div>
                <div>
                  <span>Handoff Sources</span>
                  <strong>
                    {labHandoffPlan.sourceArtifacts
                      .slice(0, 4)
                      .map(
                        (source) =>
                          `${source.id}:${source.fresh ? "fresh" : "stale"}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
              </div>
              <div className="admin-evidence-line">
                {labBootstrapPlan.recommendedCrc.commands.map((command) => (
                  <span key={command}>{command}</span>
                ))}
              </div>
              <div className="remediation-notes">
                <p>{labBootstrapPlan.currentJudgment}</p>
                <p>{labBootstrapPlan.nextCommand.command}</p>
                <p>{labHandoffPlan.nextCommand.command}</p>
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
                  satisfiedBy=
                  {certificationPlan.toolingHandoff.toolingSatisfiedBy}
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
                data-testid="opslens-certification-ci-runner"
              >
                <span>
                  status=
                  {certificationPlan.toolingHandoff.runnerEvidence.status}
                </span>
                <span>
                  path={certificationPlan.toolingHandoff.runnerEvidence.path}
                </span>
                <span>
                  sameHead=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidence.sameHead
                  )}
                </span>
                <span>
                  mutation=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidence.mutation
                  )}
                </span>
                <span>
                  tools=
                  {[
                    `oc:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.oc}`,
                    `docker:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.docker}`,
                    `opm:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.opm}`,
                    `operator-sdk:${certificationPlan.toolingHandoff.runnerEvidence.toolVersions.operatorSdk}`
                  ].join(", ")}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-ci-runner-action"
              >
                <span>
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.id}
                </span>
                <span>
                  owner=
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.owner}
                </span>
                <span>
                  status=
                  {certificationPlan.toolingHandoff.runnerEvidenceAction.status}
                </span>
                <span>
                  final=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .finalEvidencePath
                  }
                </span>
                <span>
                  draft=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .draftCommand
                  }
                </span>
                <span>
                  promote=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .promotionCommand
                  }
                </span>
                <span>
                  verify=
                  {
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .verificationCommand
                  }
                </span>
                <span>
                  writesLocalEvidence=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .writesLocalEvidence
                  )}
                </span>
                <span>
                  reviewedInput=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .requiresReviewedInput
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    certificationPlan.toolingHandoff.runnerEvidenceAction
                      .mutationAllowed
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-tooling-release-manager-packet"
              >
                <span>
                  packet=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ??
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .markdownPath}
                </span>
                <span>
                  exists=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket.exists
                  )}
                </span>
                <span>
                  ticket=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.ticketId}
                </span>
                <span>
                  first=
                  {
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .firstReadOnlyActionId
                  }
                </span>
                <span>
                  setup=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.setupActionIds.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  approval=
                  {certificationPlan.toolingHandoff.releaseManagerPacket.approvalGatedActionIds.join(
                    ", "
                  ) || "none"}
                </span>
                <span>
                  submissionExecuted=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .externalSubmissionExecutedByVerifier
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    certificationPlan.toolingHandoff.releaseManagerPacket
                      .mutationBoundary.mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-certification-ci-runner-draft"
              >
                <span>
                  draft={certificationPlan.toolingHandoff.runnerDraft.evidenceState}
                </span>
                <span>
                  path={certificationPlan.toolingHandoff.runnerDraft.path}
                </span>
                <span>
                  sameHead=
                  {String(certificationPlan.toolingHandoff.runnerDraft.sameHead)}
                </span>
                <span>
                  mutation=
                  {String(certificationPlan.toolingHandoff.runnerDraft.mutation)}
                </span>
                <span>
                  final=
                  {
                    certificationPlan.toolingHandoff.runnerDraft
                      .finalEvidenceFile
                  }
                </span>
                <span>
                  missing=
                  {
                    certificationPlan.toolingHandoff.runnerDraft
                      .missingEvidence.length
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
                data-testid="opslens-certification-first-submission-actions"
              >
                {certificationPlan.firstSubmissionActions.length ? (
                  certificationPlan.firstSubmissionActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>certification submission first actions missing</span>
                )}
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
          {communitySubmissionPlan ? (
            <div
              className="install-approval-summary"
              data-testid="opslens-community-submission"
            >
              <div className="card-title-row compact">
                <div>
                  <h4>Community Submission</h4>
                  <small>{communitySubmissionPlan.actionMode}</small>
                </div>
                <FileDiff size={18} aria-hidden="true" />
              </div>
              <div className="admin-evidence-line">
                <span>{communitySubmissionPlan.artifactStatus}</span>
                <span>head={communitySubmissionPlan.headSha}</span>
                <span>dirty={String(communitySubmissionPlan.worktreeDirty)}</span>
                <span>parity={String(communitySubmissionPlan.parityPassed)}</span>
                <span>
                  externalSubmissionAttempted=
                  {String(communitySubmissionPlan.externalSubmissionAttempted)}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(communitySubmissionPlan.registryMutationAttempted)}
                </span>
                <span>
                  clusterMutationAttempted=
                  {String(communitySubmissionPlan.clusterMutationAttempted)}
                </span>
                <span>
                  mutationAllowedByThisVerifier=
                  {String(communitySubmissionPlan.mutationAllowedByThisVerifier)}
                </span>
              </div>
              <div className="approval-summary-grid">
                <div>
                  <span>Layout</span>
                  <strong>
                    {communitySubmissionPlan.submissionLayout.root} /
                    {communitySubmissionPlan.submissionLayout.version}
                  </strong>
                </div>
                <div>
                  <span>Parity Entries</span>
                  <strong>
                    {communitySubmissionPlan.sourceBundleParity.length
                      ? communitySubmissionPlan.sourceBundleParity
                          .map(
                            (entry) =>
                              `${entry.id}:${entry.match ? "match" : "drift"}`
                          )
                          .join(", ")
                      : "missing"}
                  </strong>
                </div>
                <div>
                  <span>Read-only Checks</span>
                  <strong>
                    {communitySubmissionPlan.readOnlyCommands.length
                      ? communitySubmissionPlan.readOnlyCommands
                          .map((command) => command.id)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
                <div>
                  <span>Approval Gate</span>
                  <strong>
                    {communitySubmissionPlan.approvalGatedCommands.length
                      ? communitySubmissionPlan.approvalGatedCommands
                          .map((command) => `${command.id}:approval`)
                          .join(", ")
                      : "none"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-community-submission-first-actions"
              >
                {communitySubmissionPlan.firstSubmissionActions.length ? (
                  communitySubmissionPlan.firstSubmissionActions.map(
                    (action) => (
                      <span key={action.id}>
                        {action.id}:{action.owner}:{action.status}:next=
                        {action.nextCommand}:mutation={String(action.mutation)}
                        :approval={String(action.requiresExplicitApproval)}
                      </span>
                    )
                  )
                ) : (
                  <span>community submission first actions missing</span>
                )}
              </div>
              <div className="remediation-notes">
                <p>
                  {communitySubmissionPlan.risk[0] ??
                    "Community Operator submission is local evidence only."}
                </p>
                <p>
                  {communitySubmissionPlan.rollbackPath[0] ??
                    "Regenerate community submission evidence from a clean worktree."}
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-plan-first-actions"
              >
                {externalRuntimePlan.firstPlanActions.length ? (
                  externalRuntimePlan.firstPlanActions
                    .slice(0, 5)
                    .map((action) => (
                      <span key={action.id}>
                        {action.owner}:{action.id}:{action.status}:mutation=
                        {String(action.mutation)}:approval=
                        {String(action.requiresExplicitApproval)}:next=
                        {action.nextCommand}
                      </span>
                    ))
                ) : (
                  <span>firstPlanActions=missing</span>
                )}
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
                <div>
                  <span>Candidate Handoff</span>
                  <strong>
                    {externalRuntimeReview.candidateHandoff
                      .map(
                        (handoff) =>
                          `${handoff.imageName}:${handoff.status} eligible=${String(handoff.releaseEligible)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
                <div>
                  <span>Final Handoff</span>
                  <strong>
                    {externalRuntimeReview.finalEvidenceHandoff
                      .map(
                        (handoff) =>
                          `${handoff.imageName}:${handoff.status} approval=${String(handoff.approvalRequired)}`
                      )
                      .join(", ") || "missing"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-candidate-handoff"
              >
                {externalRuntimeReview.candidateHandoff.map((handoff) => (
                  <span key={`${handoff.imageName}-candidate-handoff`}>
                    {`${handoff.imageName}:${handoff.status}:owner=${handoff.owner}:candidate=${handoff.candidateImage}:critical=${handoff.criticalFindings}:high=${handoff.highFindings}:releaseEligible=${String(handoff.releaseEligible)}:approvalRequired=${String(handoff.approvalRequired)}:mutationAllowed=${String(handoff.mutationAllowed)}:next=${handoff.nextCommand}`}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-final-evidence-handoff"
              >
                {externalRuntimeReview.finalEvidenceHandoff.map((handoff) => (
                  <span key={`${handoff.imageName}-final-handoff`}>
                    {`${handoff.imageName}:${handoff.status}:owner=${handoff.owner}:finalEvidence=${String(handoff.finalEvidenceExists)}:requests=${handoff.reviewerRequestCount}:missing=${handoff.missingEvidenceCount}:approvalRequired=${String(handoff.approvalRequired)}:requiresExplicitApproval=${String(handoff.requiresExplicitApproval)}:mutationAllowed=${String(handoff.mutationAllowed)}:writesLocalEvidence=${String(handoff.writesLocalEvidence)}:next=${handoff.promotionCommand}:verify=${handoff.verificationCommand}`}
                  </span>
                ))}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-final-evidence-action"
              >
                <span>{externalRuntimeReview.finalEvidenceAction.id}</span>
                <span>
                  owner={externalRuntimeReview.finalEvidenceAction.owner}
                </span>
                <span>
                  status={externalRuntimeReview.finalEvidenceAction.status}
                </span>
                <span>
                  ready=
                  {externalRuntimeReview.finalEvidenceAction.finalEvidenceReadyCount}
                  /{externalRuntimeReview.finalEvidenceAction.imageCount}
                </span>
                <span>
                  requests=
                  {externalRuntimeReview.finalEvidenceAction.reviewerRequestCount}
                </span>
                <span>
                  missing=
                  {externalRuntimeReview.finalEvidenceAction.missingEvidenceCount}
                </span>
                <span>
                  first=
                  {externalRuntimeReview.finalEvidenceAction.firstReadOnlyCommand}
                </span>
                <span>
                  verify=
                  {externalRuntimeReview.finalEvidenceAction.verificationCommand}
                </span>
                <span>
                  promote=
                  {externalRuntimeReview.finalEvidenceAction.promotionCommands
                    .slice(0, 2)
                    .join(", ")}
                </span>
                <span>
                  writesLocalEvidence=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.writesLocalEvidence
                  )}
                </span>
                <span>
                  reviewedInput=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.requiresReviewedInput
                  )}
                </span>
                <span>
                  mutationAllowed=
                  {String(
                    externalRuntimeReview.finalEvidenceAction.mutationAllowed
                  )}
                </span>
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
                data-testid="opslens-external-runtime-first-actions"
              >
                {externalRuntimeReview.firstReviewerActions.length ? (
                  externalRuntimeReview.firstReviewerActions.map((action) => (
                    <span key={`${action.imageName}-${action.role}`}>
                      {action.imageName}:{action.role}:{action.nextCommand}:
                      finalEvidence={String(action.finalEvidenceExists)}
                    </span>
                  ))
                ) : (
                  <span>first reviewer actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-registry-actions"
              >
                {externalRuntimeReview.firstRegistryActions.length ? (
                  externalRuntimeReview.firstRegistryActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>registry first actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-external-runtime-registry-tickets"
              >
                <span>
                  registryPacket=
                  {externalRuntimeReview.registryAdminPacket.markdownPath
                    .split(/[\\/]/)
                    .pop()}
                  :exists=
                  {String(externalRuntimeReview.registryAdminPacket.exists)}
                  :loginExecuted=
                  {String(
                    externalRuntimeReview.registryAdminPacket
                      .registryLoginExecutedByVerifier
                  )}
                </span>
                {externalRuntimeReview.ticketPackets.length ? (
                  externalRuntimeReview.ticketPackets.map((ticket) => (
                    <span key={ticket.id}>
                      {ticket.id}:{ticket.owner}:{ticket.severity}:image=
                      {ticket.imageName}:classification={ticket.classification}
                      :authRequired=
                      {String(ticket.registryAuthBoundary?.authRequired ?? false)}
                      :credentialStored=
                      {String(
                        ticket.registryAuthBoundary?.credentialStoredByVerifier ??
                          false
                      )}
                      :registryLogin=
                      {String(
                        ticket.registryAuthBoundary
                          ?.registryLoginExecutedByVerifier ?? false
                      )}
                      :first={ticket.firstReadOnlyAction.id}:approval=
                      {ticket.approvalGatedAction.id}:requiresApproval=
                      {String(ticket.approvalGatedAction.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>registry tickets clear</span>
                )}
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
                <div>
                  <span>Final Review</span>
                  <strong>
                    {securityScanPlan.securityReviewFinalHandoff.length
                      ? securityScanPlan.securityReviewFinalHandoff
                          .slice(0, 6)
                          .map(
                            (handoff) =>
                              `${handoff.imageName}:${handoff.status} approval=${String(handoff.approvalRequired)}`
                          )
                          .join(", ")
                      : "blocked until evidence exists"}
                  </strong>
                </div>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-first-review-actions"
              >
                {securityScanPlan.firstSecurityReviewActions.length ? (
                  securityScanPlan.firstSecurityReviewActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.status}:next=
                      {action.nextCommand}:mutation={String(action.mutation)}
                      :approval={String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>security review first actions missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-tickets"
              >
                {securityScanPlan.ticketPackets.length ? (
                  securityScanPlan.ticketPackets.map((ticket) => (
                    <span key={ticket.id}>
                      {ticket.id}:{ticket.owner}:{ticket.severity}:image=
                      {ticket.imageName}:classification={ticket.classification}
                      :first={ticket.firstReadOnlyAction.id}:approval=
                      {ticket.approvalGatedAction.id}:requiresApproval=
                      {String(ticket.approvalGatedAction.requiresExplicitApproval)}
                      :mutationAllowed=
                      {String(
                        ticket.mutationBoundary.mutationAllowedByThisVerifier
                      )}
                    </span>
                  ))
                ) : (
                  <span>security review tickets clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-final-handoff"
              >
                {securityScanPlan.securityReviewFinalHandoff.length ? (
                  securityScanPlan.securityReviewFinalHandoff
                    .slice(0, 7)
                    .map((handoff) => (
                      <span key={`${handoff.imageName}-security-final`}>
                        {handoff.imageName}:{handoff.status}:owner=
                        {handoff.owner}:finalEvidence=
                        {String(handoff.finalEvidenceExists)}:reviewApproved=
                        {String(handoff.reviewApproved)}:missing=
                        {handoff.missingEvidenceCount}:approvalRequired=
                        {String(handoff.approvalRequired)}
                        :requiresExplicitApproval=
                        {String(handoff.requiresExplicitApproval)}
                        :mutationAllowed={String(handoff.mutationAllowed)}
                        :writesLocalEvidence=
                        {String(handoff.writesLocalEvidence)}:next=
                        {handoff.promotionCommand}:verify=
                        {handoff.verificationCommand}
                      </span>
                    ))
                ) : (
                  <span>security review final handoff missing</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-scan-runner-evidence"
              >
                <span>
                  status={securityScanPlan.runnerEvidence.status}
                </span>
                <span>
                  evidenceWritten=
                  {String(securityScanPlan.runnerEvidence.evidenceWritten)}
                </span>
                <span>
                  fresh={String(securityScanPlan.runnerEvidence.fresh)}
                </span>
                <span>
                  dockerFallback=
                  {String(
                    securityScanPlan.runnerEvidence.executeDockerFallback
                  )}
                </span>
                <span>
                  digestPinned=
                  {String(securityScanPlan.runnerEvidence.scannerDigestsPinned)}
                </span>
                <span>
                  missingTargets=
                  {securityScanPlan.runnerEvidence.missingTargets.join(", ") ||
                    "none"}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-security-review-drafts"
              >
                {securityScanPlan.images.slice(0, 7).map((image) => (
                  <span key={image.name}>
                    {image.name}:draft={image.reviewDraft.evidenceState}
                    :sameHead={String(image.reviewDraft.sameHead)}
                    :decision={image.reviewDraft.decision}
                    :explicitDecision={String(
                      image.reviewDraft.explicitDecisionProvided
                    )}
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
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-first-publish-actions"
              >
                {releasePlan.firstPublishActions.length ? (
                  releasePlan.firstPublishActions.map((action) => (
                    <span key={action.id}>
                      {action.id}:{action.owner}:{action.nextCommand}:mutation=
                      {String(action.mutation)}:approval=
                      {String(action.requiresExplicitApproval)}
                    </span>
                  ))
                ) : (
                  <span>first publish actions clear</span>
                )}
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-publish-ticket"
              >
                <span>
                  {releasePlan.ticketPacket.id}:{releasePlan.ticketPacket.owner}:
                  {releasePlan.ticketPacket.classification}:first=
                  {releasePlan.ticketPacket.firstReadOnlyAction.id}:approval=
                  {releasePlan.ticketPacket.approvalGatedAction.id}
                  :requiresApproval=
                  {String(
                    releasePlan.ticketPacket.approvalGatedAction
                      .requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(
                    releasePlan.ticketPacket.mutationBoundary
                      .mutationAllowedByThisVerifier
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-publish-decision-action"
              >
                <span>
                  {releasePlan.publishDecisionAction.id}:
                  {releasePlan.publishDecisionAction.owner}:status=
                  {releasePlan.publishDecisionAction.status}:first=
                  {releasePlan.publishDecisionAction.readOnlyPreflightCommandId}
                  :setup=
                  {releasePlan.publishDecisionAction.humanSetupCommandIds.join(
                    ","
                  ) || "none"}
                  :approval=
                  {releasePlan.publishDecisionAction.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                  :secret=
                  {String(
                    releasePlan.publishDecisionAction.requiresHumanSecretInput
                  )}
                  :explicitApproval=
                  {String(
                    releasePlan.publishDecisionAction.requiresExplicitApproval
                  )}
                  :mutationAllowed=
                  {String(releasePlan.publishDecisionAction.mutationAllowed)}
                  :writesLocalEvidence=
                  {String(releasePlan.publishDecisionAction.writesLocalEvidence)}
                  :publishRequiresExplicitApproval=
                  {String(
                    releasePlan.publishDecisionAction
                      .publishRequiresExplicitApproval
                  )}
                </span>
              </div>
              <div
                className="admin-evidence-line"
                data-testid="opslens-release-manager-publish-packet"
              >
                <span>
                  packet=
                  {releasePlan.releaseManagerPacket.markdownPath
                    .split(/[\\/]/)
                    .pop() ?? releasePlan.releaseManagerPacket.markdownPath}
                </span>
                <span>
                  exists={String(releasePlan.releaseManagerPacket.exists)}
                </span>
                <span>
                  ticket={releasePlan.releaseManagerPacket.ticketId}
                </span>
                <span>
                  decision=
                  {releasePlan.releaseManagerPacket.publishDecisionActionId}
                </span>
                <span>
                  first={releasePlan.releaseManagerPacket.firstReadOnlyActionId}
                </span>
                <span>
                  setup=
                  {releasePlan.releaseManagerPacket.humanSetupCommandIds.join(
                    ","
                  ) || "none"}
                </span>
                <span>
                  approval=
                  {releasePlan.releaseManagerPacket.approvalGatedCommandIds
                    .slice(0, 3)
                    .join(",") || "none"}
                </span>
                <span>
                  registryLoginExecuted=
                  {String(
                    releasePlan.releaseManagerPacket
                      .registryLoginExecutedByVerifier
                  )}
                </span>
                <span>
                  releasePublishExecuted=
                  {String(
                    releasePlan.releaseManagerPacket
                      .releasePublishExecutedByVerifier
                  )}
                </span>
                <span>
                  registryMutationAttempted=
                  {String(
                    releasePlan.releaseManagerPacket.mutationBoundary
                      .registryMutationAttempted
                  )}
                </span>
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
