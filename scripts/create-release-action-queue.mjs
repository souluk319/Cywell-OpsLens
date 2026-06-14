#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-action-queue.json",
  markdownOut: "test-results/cywell-opslens-release-action-queue.md",
  ownerPacketsDir: "test-results/release-action-queue-owners",
  releaseRefreshEvidence: "test-results/cywell-opslens-release-evidence-refresh.json",
  releaseBundleEvidence: "test-results/cywell-opslens-release-evidence-bundle.json",
  envContract: "test-results/cywell-opslens-env-contract.json",
  aiopsIncidentPipeline:
    "test-results/cywell-opslens-aiops-incident-pipeline.json",
  runtimeReadiness: "test-results/cywell-opslens-runtime-readiness.json",
  runtimeRagContract: "test-results/cywell-opslens-runtime-rag-contract.json",
  runtimeRagFixture: "test-results/cywell-opslens-runtime-rag-fixture.json",
  ragProductionReadiness:
    "test-results/cywell-opslens-rag-production-readiness.json",
  lightspeedReadiness: "test-results/cywell-opslens-lightspeed-readiness.json",
  ocpLiveReaderSmoke: "test-results/cywell-opslens-ocp-live-reader-smoke.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
  certificationReadiness:
    "test-results/cywell-opslens-certification-readiness.json",
  securityScanPlan: "test-results/cywell-opslens-security-scan-plan.json",
  externalRuntimeReviewPacket:
    "test-results/cywell-opslens-external-runtime-review-packet.json",
  ocpNetworkHandoff: "test-results/cywell-opslens-ocp-network-handoff.json",
  ocpAuthRbacPlan: "test-results/cywell-opslens-ocp-auth-rbac-plan.json",
  releasePlanEvidence: "test-results/cywell-opslens-release-publish-plan.json",
  installPlanEvidence: "test-results/cywell-opslens-install-approval-plan.json",
  timeoutMs: 10000
};

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
    } else if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    }
  }
  return values;
}

const parsed = parseArgs(process.argv.slice(2));
const options = {
  evidenceOut: parsed.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: parsed.get("markdown-out") ?? defaults.markdownOut,
  ownerPacketsDir: parsed.get("owner-packets-dir") ?? defaults.ownerPacketsDir,
  releaseRefreshEvidence:
    parsed.get("release-refresh-evidence") ?? defaults.releaseRefreshEvidence,
  releaseBundleEvidence:
    parsed.get("release-bundle-evidence") ?? defaults.releaseBundleEvidence,
  envContract:
    parsed.get("env-contract-evidence") ?? defaults.envContract,
  aiopsIncidentPipeline:
    parsed.get("aiops-incident-pipeline-evidence") ??
    defaults.aiopsIncidentPipeline,
  runtimeReadiness:
    parsed.get("runtime-readiness-evidence") ?? defaults.runtimeReadiness,
  runtimeRagContract:
    parsed.get("runtime-rag-contract-evidence") ?? defaults.runtimeRagContract,
  runtimeRagFixture:
    parsed.get("runtime-rag-fixture-evidence") ?? defaults.runtimeRagFixture,
  ragProductionReadiness:
    parsed.get("rag-production-readiness-evidence") ??
    defaults.ragProductionReadiness,
  lightspeedReadiness:
    parsed.get("lightspeed-readiness-evidence") ??
    defaults.lightspeedReadiness,
  ocpLiveReaderSmoke:
    parsed.get("ocp-live-reader-smoke-evidence") ??
    defaults.ocpLiveReaderSmoke,
  evidenceCheckpoint: parsed.get("evidence-checkpoint") ?? defaults.evidenceCheckpoint,
  certificationReadiness:
    parsed.get("certification-readiness-evidence") ??
    defaults.certificationReadiness,
  securityScanPlan:
    parsed.get("security-scan-plan-evidence") ?? defaults.securityScanPlan,
  externalRuntimeReviewPacket:
    parsed.get("external-runtime-review-packet-evidence") ??
    defaults.externalRuntimeReviewPacket,
  ocpNetworkHandoff:
    parsed.get("ocp-network-handoff-evidence") ?? defaults.ocpNetworkHandoff,
  ocpAuthRbacPlan:
    parsed.get("ocp-auth-rbac-plan-evidence") ?? defaults.ocpAuthRbacPlan,
  releasePlanEvidence:
    parsed.get("release-plan-evidence") ?? defaults.releasePlanEvidence,
  installPlanEvidence:
    parsed.get("install-plan-evidence") ?? defaults.installPlanEvidence,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>")
    .replace(/\b10(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>")
    .replace(/\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>")
    .replace(/\b192\.168(?:\.\d{1,3}){2}\b/g, "<redacted-private-ip>")
    .replace(/(Test-NetConnection\s+-ComputerName\s+)(?:"?)[^\s"]+/gi, "$1<redacted-ocp-api>")
    .replace(/(Resolve-DnsName\s+)(?:"?)[^\s"]+/gi, "$1<redacted-ocp-api>")
    .replace(/\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-api>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
}

function endpointLeakLike(value) {
  return /\b10(?:\.\d{1,3}){3}\b/.test(value) ||
    /\b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b192\.168(?:\.\d{1,3}){2}\b/.test(value) ||
    /\b(?:api|console|oauth)[A-Za-z0-9.-]*ocp[A-Za-z0-9.-]*\b/i.test(value);
}

function record(status, name, detail) {
  checks.push({ status, name, detail: sanitize(detail) });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function warn(name, detail) {
  record("WARN", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function redactedOcpTarget(target = {}) {
  const protocol = String(target.protocol ?? target.redactedBaseUrl ?? "").startsWith("http://")
    ? "http:"
    : "https:";
  const port = target.port ?? String(target.redactedBaseUrl ?? "").match(/:(\d+)(?:\/)?$/)?.[1] ?? "unknown";
  return `${protocol}//<redacted-ocp-api>${port === "unknown" ? "" : `:${port}`}`;
}

async function runCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return sanitize(stdout.trim());
  } catch {
    return "";
  }
}

async function gitValue(args, fallback) {
  const value = await runCapture("git", args);
  return value.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const value = await runCapture("git", ["status", "--short"]);
  return value.split(/\r?\n/).filter(Boolean).map(sanitize);
}

function loadJson(path, label, required = true) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    if (required) fail(label, `${absolutePath} is missing`);
    else warn(label, `${absolutePath} is missing`);
    return undefined;
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function artifactFresh(artifact, currentHeadSha) {
  const ref = artifactRef(artifact);
  return ref.headSha === currentHeadSha && ref.worktreeDirty === false;
}

function sourceSummary(id, label, path, artifact, currentHeadSha, required = false) {
  const fresh = artifact ? artifactFresh(artifact, currentHeadSha) : false;
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.vectorWriteAttempted === true ||
    artifact?.ingestionJobCreated === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true ||
    artifact?.policy?.registryMutationAttempted === true ||
    artifact?.policy?.vectorWriteAttempted === true;

  if (!artifact && required) {
    fail(`${label} source`, `${label} is missing`);
  } else if (!artifact) {
    warn(`${label} source`, `${label} is missing`);
  } else if (mutationViolation) {
    fail(`${label} source`, `${label} reports forbidden mutation flags`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is stale head=${artifactRef(artifact).headSha ?? "missing"}`);
  } else {
    pass(`${label} source`, `${label} is fresh`);
  }

  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status: artifact?.status ?? "missing",
    fresh,
    required,
    mutationViolation,
    headSha: artifactRef(artifact).headSha ?? "missing",
    worktreeDirty: artifactRef(artifact).worktreeDirty ?? "unknown"
  };
}

function commandLooksMutating(command) {
  const text = String(command ?? "");
  if (/\b(oc|kubectl)\s+apply\b/i.test(text) && /--dry-run=(server|client)\b/i.test(text)) {
    return false;
  }
  return /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i.test(text);
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values) {
  return [...new Set(values.map(sanitize).filter(Boolean))];
}

function inlineList(values, fallback = "none", limit = 8) {
  const list = Array.isArray(values) ? values : [];
  const sanitized = uniqueStrings(list).slice(0, limit);
  return sanitized.length > 0 ? sanitized.join(",") : fallback;
}

function candidateCriticalSummary(bestCandidate) {
  if (!bestCandidate) return "missing";
  const criticalCount = Number(bestCandidate.criticalFindings ?? 0);
  if (!Number.isFinite(criticalCount) || criticalCount <= 0) {
    return "criticalPackages=none criticalIds=none";
  }
  return [
    `criticalPackages=${inlineList(bestCandidate.criticalFindingPackages, "unknown", 6)}`,
    `criticalIds=${inlineList(bestCandidate.criticalFindingIds, "unknown", 10)}`
  ].join(" ");
}

function candidateRequirement(imageName, candidateStatus, bestCandidate) {
  if (bestCandidate?.releaseEligible === true) {
    return `Review zero-critical ${imageName} candidate evidence; attach approved scan/SBOM and keep promotionApproved=false until final external runtime approval.`;
  }
  if (bestCandidate) {
    return `Next ${imageName} candidate must be an immutable digest with complete vulnerability/SBOM evidence and criticalFindings=0; current best remains criticalFindings=${bestCandidate.criticalFindings ?? "unknown"} highFindings=${bestCandidate.highFindings ?? "unknown"}.`;
  }
  return `Scan an immutable ${imageName} digest candidate with complete vulnerability/SBOM evidence and criticalFindings=0; current candidateMatrix status=${candidateStatus}.`;
}

function registryAccessClassification(detail) {
  const text = String(detail ?? "").toLowerCase();
  if (/\b401\b|unauthorized|authentication required|access denied/.test(text)) {
    return "registry-auth-required";
  }
  if (/\b403\b|forbidden|permission denied/.test(text)) return "registry-permission-denied";
  if (/\b404\b|not found|manifest unknown/.test(text)) return "registry-manifest-missing";
  if (/timeout|timed out/.test(text)) return "registry-timeout";
  if (/tls|certificate/.test(text)) return "registry-tls-failed";
  if (/sha256:[a-f0-9]{32,}/.test(text)) return "registry-digest-observed";
  return "registry-review-required";
}

function externalRuntimeReviewerDiagnostics(image, request) {
  const sourceInspection = image.sourceDigestInspection ?? {};
  const requestText = `${request?.request ?? ""} ${request?.evidenceNeeded ?? ""}`;
  const diagnostics = [
    {
      id: "external-runtime-review-state",
      label: "Review state",
      value:
        `draft=${image.draftStatus ?? "missing"} ` +
        `state=${image.evidenceState ?? "missing"} ` +
        `finalExists=${String(image.finalEvidence?.exists === true)} ` +
        `missingEvidence=${image.missingEvidence?.length ?? 0}`
    }
  ];

  if (/source digest|source-digest|sourceDigest|HEAD request|imagetools|manifest inspect/i.test(requestText)) {
    const detail = sourceInspection.detail ?? request?.evidenceNeeded ?? "missing";
    diagnostics.push(
      {
        id: "source-digest-inspection",
        label: "Source digest inspection",
        value:
          `status=${sourceInspection.status ?? "missing"} ` +
          `source=${sourceInspection.sourceImage ?? image.image ?? "unknown"} ` +
          `method=${sourceInspection.method ?? "missing"}`
      },
      {
        id: "registry-access",
        label: "Registry access",
        value: `classification=${registryAccessClassification(detail)} detail=${detail}`
      }
    );
  }

  return diagnostics;
}

function externalRuntimeFinalEvidenceReadOnlyCommands(packet) {
  const reviewPacketCommand = {
    id: "refresh-external-runtime-review-packet",
    phase: "external-runtime-review",
    command: "npm run evidence:external-runtime:review-packet",
    purpose:
      "Regenerate the external runtime reviewer packet before release-manager final evidence coordination.",
    mutation: false,
    writesLocalEvidence: true
  };
  const verifyPlanCommand = {
    id: "verify-external-runtime-plan",
    phase: "external-runtime-review",
    command: "npm run verify:external-runtime-plan",
    purpose: "Verify final reviewed vLLM/Qdrant runtime evidence without promoting or mutating images.",
    mutation: false,
    writesLocalEvidence: true
  };
  return uniqueByKey(
    [
      reviewPacketCommand,
      ...(packet?.readOnlyCommands ?? []).filter(
        (command) => command.mutation !== true
      ),
      verifyPlanCommand
    ],
    (command) => `${command.id ?? "unknown"}:${command.command ?? "unknown"}`
  );
}

function externalRuntimeFinalEvidenceHandoffCommands(packet) {
  const reviewerCommands = (packet?.images ?? [])
    .flatMap((image) => image.reviewerRequests ?? [])
    .map((request) => request.nextCommand);
  return uniqueStrings([
    "npm run evidence:external-runtime:review-packet",
    ...reviewerCommands,
    "npm run verify:external-runtime-plan"
  ]);
}

function externalRuntimeRoleRequests(packet, role) {
  return (packet?.images ?? [])
    .flatMap((image) =>
      (image.reviewerRequests ?? []).map((request) => ({
        image,
        request
      }))
    )
    .filter((entry) => entry.request?.role === role);
}

function externalRuntimeFinalEvidenceDiagnostics(packet) {
  const images = packet?.images ?? [];
  const reviewerRequests = images.flatMap((image) => image.reviewerRequests ?? []);
  const roleCounts = new Map();
  for (const request of reviewerRequests) {
    const role = request.role ?? "unknown";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  const roleSummary = [...roleCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, count]) => `${role}=${count}`)
    .join(" ") || "none";
  const imageFinalSummary = images.map((image) => {
    const finalEvidence = image.finalEvidence ?? {};
    return [
      image.name ?? "unknown",
      `final=${String(finalEvidence.exists === true)}`,
      `state=${image.evidenceState ?? "missing"}`,
      `draft=${image.draftStatus ?? "missing"}`,
      `missing=${image.missingEvidence?.length ?? 0}`
    ].join(":");
  });
  const candidateSummary = images.map((image) => {
    const matrix = image.candidateMatrix ?? {};
    const best = matrix.bestCandidate;
    return [
      image.name ?? "unknown",
      `status=${matrix.status ?? "missing"}`,
      `zeroCritical=${matrix.zeroCriticalCandidates?.length ?? 0}`,
      best
        ? `best=${best.image ?? "unknown"} critical=${best.criticalFindings ?? "unknown"} high=${best.highFindings ?? "unknown"}`
        : "best=missing"
    ].join(":");
  });
  const diagnostics = [
    {
      id: "external-runtime-final-evidence",
      label: "Final evidence",
      value: imageFinalSummary.join(" | ") || "missing"
    },
    {
      id: "external-runtime-review-packet",
      label: "Review packet",
      value:
        `status=${packet?.status ?? "missing"} ` +
        `actionMode=${packet?.actionMode ?? "missing"} ` +
        `missingEvidence=${packet?.missingEvidence?.length ?? 0}`
    },
    {
      id: "external-runtime-reviewers",
      label: "Reviewer requests",
      value: `total=${reviewerRequests.length} ${roleSummary}`
    },
    {
      id: "external-runtime-registry-admin-requests",
      label: "Registry admin requests",
      value:
        `count=${externalRuntimeRoleRequests(packet, "registry-admin").length} ` +
        `tickets=${(packet?.ticketPackets ?? []).map((ticket) => ticket.id).join(",") || "none"}`
    },
    {
      id: "external-runtime-security-reviewer-requests",
      label: "Security reviewer requests",
      value: `count=${externalRuntimeRoleRequests(packet, "security-reviewer").length}`
    },
    {
      id: "external-runtime-release-manager-requests",
      label: "Release manager requests",
      value: `count=${externalRuntimeRoleRequests(packet, "release-manager").length}`
    },
    {
      id: "external-runtime-product-owner-requests",
      label: "Product owner requests",
      value: `count=${externalRuntimeRoleRequests(packet, "product-owner").length}`
    },
    {
      id: "external-runtime-candidate-summary",
      label: "Candidate summary",
      value: candidateSummary.join(" | ") || "missing"
    },
    {
      id: "external-runtime-command-boundary",
      label: "Command boundary",
      value:
        `readOnly=${packet?.readOnlyCommands?.length ?? 0} ` +
        `approvalGated=${packet?.approvalGatedCommands?.length ?? 0} ` +
        "mutationAllowed=false"
    }
  ];
  return diagnostics;
}

function certificationToolingDiagnostics(certificationReadiness) {
  const handoff = certificationReadiness?.toolingHandoff ?? {};
  const ticket = handoff.ticketPacket ?? {};
  const runner = handoff.runnerEvidence ?? {};
  const lanes = handoff.executionLanes ?? [];
  const boundary = ticket.mutationBoundary ?? {};
  const missingTools = handoff.missingRequiredTools ?? [];
  return [
    {
      id: "certification-tooling-status",
      label: "Certification tooling",
      value:
        `status=${handoff.status ?? "missing"} ` +
        `satisfiedBy=${handoff.toolingSatisfiedBy ?? "missing"} ` +
        `ticket=${ticket.id ?? "missing"}`
    },
    {
      id: "certification-missing-tools",
      label: "Missing tools",
      value: missingTools.length ? missingTools.join(",") : "none"
    },
    {
      id: "certification-runner-evidence",
      label: "CI runner evidence",
      value:
        `status=${runner.status ?? "missing"} ` +
        `sameHead=${String(runner.sameHead === true)} ` +
        `approved=${String(runner.approved === true)} ` +
        `path=${runner.path ?? "missing"} ` +
        `missing=${runner.missingEvidence?.length ?? 0}`
    },
    {
      id: "certification-lanes",
      label: "Execution lanes",
      value: lanes.length
        ? lanes
            .map((lane) => `${lane.id ?? "unknown"}=${lane.status ?? "unknown"}`)
            .join(" ")
        : "missing"
    },
    {
      id: "certification-boundary",
      label: "Mutation boundary",
      value:
        `setupHumanApproval=${String(boundary.toolingInstallRequiresHumanApproval !== false)} ` +
        `externalSubmissionApproval=${String(boundary.externalSubmissionRequiresExplicitApproval !== false)} ` +
        `clusterMutation=${String(boundary.clusterMutationAttempted === true)} ` +
        `registryMutation=${String(boundary.registryMutationAttempted === true)} ` +
        `mutationAllowed=${String(boundary.mutationAllowedByThisVerifier === true)}`
    }
  ];
}

function stripReleaseActionQueueFeedback(value) {
  return sanitize(value).replace(/^(?:releaseActionQueue:\s*)+/i, "");
}

function normalizedEvidence(values) {
  return uniqueStrings(values.map(stripReleaseActionQueueFeedback));
}

function ownerSlug(owner) {
  return sanitize(owner)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function insideWorkspace(path) {
  const relation = relative(process.cwd(), path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function fixedReadOnlyCommands() {
  return [
    {
      id: "refresh-release-chain",
      phase: "local-evidence-refresh",
      command: "npm run verify:release-refresh -- --live-timeout-ms 30000",
      purpose: "Refresh the current-head release evidence chain without approving mutation.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "env-contract",
      phase: "environment-isolation",
      command: "npm run verify:env",
      purpose: "Refresh OCP/Lightspeed environment isolation evidence without reading or writing secret values.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-release-bundle",
      phase: "local-evidence-refresh",
      command: "npm run verify:release-evidence-bundle",
      purpose: "Regenerate the release-manager evidence bundle.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-evidence-checkpoint",
      phase: "local-evidence-refresh",
      command: "npm run verify:evidence-checkpoint",
      purpose: "Regenerate the lane-level evidence checkpoint.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-certification-readiness",
      phase: "release-readiness",
      command: "npm run verify:certification",
      purpose: "Regenerate Community/Certified Operator packaging readiness evidence.",
      mutation: false,
      writesLocalEvidence: true
    },
    {
      id: "verify-roadmap-plan",
      phase: "local-evidence-refresh",
      command: "npm run verify:roadmap-plan",
      purpose: "Regenerate roadmap-to-evidence alignment.",
      mutation: false,
      writesLocalEvidence: true
    }
  ];
}

function readOnlyCommands(artifacts) {
  const bundleCommands = (artifacts.releaseBundle?.commands?.readOnly ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "bundle-read-only",
    command: sanitize(command.command ?? "unknown"),
    purpose: sanitize(command.purpose ?? "read-only release evidence command"),
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  const externalCommands = (artifacts.externalRuntimeReview?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "external-runtime-review",
    command: sanitize(command.command ?? "unknown"),
    purpose: sanitize(command.purpose ?? "external runtime review evidence command"),
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  const networkCommands = (artifacts.ocpNetworkHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "network-handoff",
    command: sanitize(command.command ?? "unknown"),
    purpose: sanitize(command.purpose ?? "OCP network handoff evidence command"),
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesEvidence === true || command.writesLocalEvidence === true
  }));
  const ocpAuthRbacCommands = (artifacts.ocpAuthRbacPlan?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "ocp-auth-rbac-plan",
    command: sanitize(command.command ?? "unknown"),
    purpose: sanitize(command.purpose ?? "OCP auth/RBAC approval evidence command"),
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesEvidence === true || command.writesLocalEvidence === true
  }));
  const certificationToolingCommands = (artifacts.certificationReadiness?.toolingHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "certification-tooling",
    command: sanitize(command.command ?? "unknown"),
    purpose: "Certification tooling handoff read-only validation command",
    mutation: command.mutation === true,
    writesLocalEvidence: /verify:certification|verify:catalog-toolchain/i.test(command.command ?? "")
  }));
  const securityScanCommands = (artifacts.securityScanPlan?.commands?.readOnly ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "security-scan",
    command: sanitize(command.command ?? "unknown"),
    purpose: sanitize(command.purpose ?? "Security scan or review draft evidence command"),
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  const ragProductionCommands = (artifacts.ragProductionReadiness?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "rag-production-readiness",
    command: sanitize(command.command ?? "unknown"),
    purpose: "RAG production readiness handoff validation command",
    mutation: command.mutation === true,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  return uniqueByKey(
    [
      ...fixedReadOnlyCommands(),
      ...ragProductionCommands,
      ...externalCommands,
      ...securityScanCommands,
      ...networkCommands,
      ...ocpAuthRbacCommands,
      ...certificationToolingCommands,
      ...bundleCommands
    ],
    (command) => `${command.id}:${command.command}`
  );
}

function approvalGatedCommands(artifacts) {
  return uniqueByKey(
    [
      ...(artifacts.releaseBundle?.commands?.mutatingApprovalRequired ?? []),
      ...(artifacts.externalRuntimeReview?.approvalGatedCommands ?? []),
      ...(artifacts.securityScanPlan?.commands?.approvalGated ?? []),
      ...(artifacts.ragProductionReadiness?.approvalGatedCommands ?? []),
      ...(artifacts.ocpAuthRbacPlan?.approvalGatedCommands ?? []),
      ...(artifacts.certificationReadiness?.toolingHandoff?.approvalGatedCommands ?? []),
      ...(artifacts.releasePlan?.commands ?? []).filter((command) => command.mutation === true),
      ...(artifacts.installPlan?.commands ?? []).filter((command) => command.mutation === true)
    ].map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "approval-gated",
      command: sanitize(command.command ?? "unknown"),
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true,
      rationale: sanitize(command.rationale ?? "requires explicit human approval before execution"),
      rollback: sanitize(command.rollback ?? "use the approved rollback path for this command")
    })),
    (command) => `${command.id}:${command.command}`
  );
}

function item({
  id,
  owner,
  priority,
  source,
  request,
  evidenceNeeded,
  nextCommand,
  handoffNextCommands = [],
  setupCommands = [],
  readOnlyCommands = [],
  approvalGatedCommands = [],
  missingRequiredTools = [],
  blockedBy = [],
  diagnostics = [],
  ticketPacket,
  externalRuntimeTicketPacket,
  securityReviewTicketPacket,
  releasePublishTicketPacket,
  installApprovalTicketPacket,
  catalogToolchainTicketPacket,
  certificationToolingTicketPacket,
  ragProductionTicketPacket,
  aiopsMonitoringTicketPacket,
  acceptance = []
}) {
  return {
    id,
    owner,
    priority,
    status: "open",
    source,
    request: sanitize(request),
    evidenceNeeded: sanitize(evidenceNeeded),
    nextCommand,
    handoffNextCommands: handoffNextCommands.map(sanitize),
    setupCommands: setupCommands.map((command) => ({
      id: sanitize(command.id ?? "unknown"),
      command: sanitize(command.command ?? "unknown"),
      phase: sanitize(command.phase ?? "human-setup"),
      mutation: command.mutation === true,
      requiresNetwork: command.requiresNetwork === true,
      requiresHumanApproval: command.requiresHumanApproval === true
    })),
    readOnlyCommands: readOnlyCommands.map((command) => ({
      id: sanitize(command.id ?? "unknown"),
      command: sanitize(command.command ?? "unknown"),
      phase: sanitize(command.phase ?? "read-only"),
      mutation: command.mutation === true,
      requiresNetwork: command.requiresNetwork === true,
      writesLocalEvidence:
        command.writesLocalEvidence === true || command.writesEvidence === true
    })),
    approvalGatedCommands: approvalGatedCommands.map((command) => ({
      id: sanitize(command.id ?? "unknown"),
      command: sanitize(command.command ?? "unknown"),
      phase: sanitize(command.phase ?? "approval-gated"),
      mutation: command.mutation === true,
      requiresExplicitApproval: command.requiresExplicitApproval === true
    })),
    missingRequiredTools: missingRequiredTools.map(sanitize),
    blockedBy: blockedBy.map(sanitize),
    diagnostics: diagnostics.map((diagnostic) => ({
      id: sanitize(diagnostic.id ?? "unknown"),
      label: sanitize(diagnostic.label ?? "Diagnostic"),
      value: sanitize(diagnostic.value ?? "unknown")
    })),
    ticketPacket: ticketPacket ? sanitizeTicketPacket(ticketPacket) : undefined,
    externalRuntimeTicketPacket: externalRuntimeTicketPacket
      ? sanitizeExternalRuntimeTicketPacket(externalRuntimeTicketPacket)
      : undefined,
    securityReviewTicketPacket: securityReviewTicketPacket
      ? sanitizeSecurityReviewTicketPacket(securityReviewTicketPacket)
      : undefined,
    releasePublishTicketPacket: releasePublishTicketPacket
      ? sanitizeReleasePublishTicketPacket(releasePublishTicketPacket)
      : undefined,
    installApprovalTicketPacket: installApprovalTicketPacket
      ? sanitizeInstallApprovalTicketPacket(installApprovalTicketPacket)
      : undefined,
    catalogToolchainTicketPacket: catalogToolchainTicketPacket
      ? sanitizeCatalogToolchainTicketPacket(catalogToolchainTicketPacket)
      : undefined,
    certificationToolingTicketPacket: certificationToolingTicketPacket
      ? sanitizeCertificationToolingTicketPacket(certificationToolingTicketPacket)
      : undefined,
    ragProductionTicketPacket: ragProductionTicketPacket
      ? sanitizeRagProductionTicketPacket(ragProductionTicketPacket)
      : undefined,
    aiopsMonitoringTicketPacket: aiopsMonitoringTicketPacket
      ? sanitizeAiopsMonitoringTicketPacket(aiopsMonitoringTicketPacket)
      : undefined,
    acceptance
  };
}

function sanitizeTicketAction(action = {}, fallbackId = "none") {
  return {
    id: sanitize(action.id ?? fallbackId),
    status: sanitize(action.status ?? "missing"),
    nextCommand: sanitize(action.nextCommand ?? "none"),
    mutation: action.mutation === true,
    requiresExplicitApproval: action.requiresExplicitApproval === true
  };
}

function sanitizeTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "network-sre-ocp-api-reachability-ticket"),
    owner: sanitize(packet.owner ?? "network-sre"),
    title: sanitize(packet.title ?? "Network/SRE reachability ticket"),
    severity: sanitize(packet.severity ?? "needs-evidence"),
    classification: sanitize(packet.classification ?? "unknown"),
    redactedTarget: sanitize(packet.redactedTarget ?? "<redacted-ocp-api>"),
    summary: sanitize(packet.summary ?? "Review network reachability evidence."),
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeTicketAction(
      packet.firstReadOnlyAction,
      "missing-read-only-action"
    ),
    approvalGatedAction: sanitizeTicketAction(packet.approvalGatedAction, "none"),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      networkChangeRequiresExplicitApproval:
        packet.mutationBoundary?.networkChangeRequiresExplicitApproval === true
    },
    risk: sanitize(packet.risk ?? "Network reachability blocks live readiness."),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "No rollback is required because this packet writes only local evidence."
    )
  };
}

function sanitizeExternalRuntimeTicketAction(action = {}, fallbackId = "none") {
  return {
    id: sanitize(action.id ?? fallbackId),
    status: sanitize(action.status ?? "missing"),
    nextCommand: sanitize(action.nextCommand ?? "none"),
    mutation: action.mutation === true,
    requiresExplicitApproval: action.requiresExplicitApproval === true
  };
}

function sanitizeExternalRuntimeTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "registry-admin-external-runtime-ticket"),
    owner: "registry-admin",
    title: sanitize(packet.title ?? "External runtime registry review"),
    severity: packet.severity === "blocker" ? "blocker" : "high",
    imageName: sanitize(packet.imageName ?? "unknown"),
    sourceImage: sanitize(packet.sourceImage ?? "unknown"),
    desiredMirror: sanitize(packet.desiredMirror ?? "<internal-registry>"),
    classification: sanitize(packet.classification ?? "registry-review-required"),
    draftStatus: sanitize(packet.draftStatus ?? "missing"),
    evidenceState: sanitize(packet.evidenceState ?? "missing"),
    finalEvidenceExists: packet.finalEvidenceExists === true,
    missingEvidenceCount: Number.isFinite(packet.missingEvidenceCount)
      ? packet.missingEvidenceCount
      : 0,
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "external-runtime-registry-readonly"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "external-runtime-registry-approval"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      registryChangeRequiresExplicitApproval:
        packet.mutationBoundary?.registryChangeRequiresExplicitApproval !== false
    },
    registryAuthBoundary: {
      authRequired: packet.registryAuthBoundary?.authRequired === true,
      humanCredentialInputRequired:
        packet.registryAuthBoundary?.humanCredentialInputRequired === true,
      credentialStoredByVerifier:
        packet.registryAuthBoundary?.credentialStoredByVerifier === true,
      pullSecretCreatedByVerifier:
        packet.registryAuthBoundary?.pullSecretCreatedByVerifier === true,
      registryLoginExecutedByVerifier:
        packet.registryAuthBoundary?.registryLoginExecutedByVerifier === true,
      firstHumanSetupAction: sanitize(
        packet.registryAuthBoundary?.firstHumanSetupAction ?? "not-required"
      )
    },
    risk: sanitize(
      packet.risk ??
        "External runtime registry evidence blocks release approval until reviewed."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "No rollback is required because this packet writes only local evidence."
    )
  };
}

function sanitizeSecurityReviewTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "security-reviewer-security-review-ticket"),
    owner: "security-reviewer",
    title: sanitize(packet.title ?? "Security review handoff"),
    severity: "high",
    imageName: sanitize(packet.imageName ?? "unknown"),
    image: sanitize(packet.image ?? "unknown"),
    classification: sanitize(packet.classification ?? "security-review-required"),
    draftStatus: sanitize(packet.draftStatus ?? "missing"),
    evidenceState: sanitize(packet.evidenceState ?? "missing"),
    finalEvidenceFile: sanitize(
      packet.finalEvidenceFile ??
        "docs/release/evidence/security/unknown-security-review.json"
    ),
    vulnerabilityReportExists: packet.vulnerabilityReportExists === true,
    sbomExists: packet.sbomExists === true,
    reviewExists: packet.reviewExists === true,
    reviewApproved: packet.reviewApproved === true,
    reviewerProvided: packet.reviewerProvided === true,
    ticketProvided: packet.ticketProvided === true,
    criticalFindings:
      Number.isFinite(Number(packet.criticalFindings))
        ? Number(packet.criticalFindings)
        : sanitize(packet.criticalFindings ?? "unknown"),
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "security-review-readonly"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "security-review-signing-approval"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      signingRequiresExplicitApproval:
        packet.mutationBoundary?.signingRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Security review evidence blocks release approval until same-head scan/SBOM and reviewer decision are recorded."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "No cluster or registry rollback is required because the first action writes only local evidence."
    )
  };
}

function sanitizeReleasePublishTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "release-manager-release-publish-ticket"),
    owner: "release-manager",
    title: sanitize(packet.title ?? "Release publish approval handoff"),
    severity: "high",
    classification: sanitize(packet.classification ?? "publish-evidence-gaps"),
    publishStatus: sanitize(packet.publishStatus ?? "needs-evidence"),
    requiredApprovals: (packet.requiredApprovals ?? []).map(sanitize),
    publishImageCount: Number.isFinite(Number(packet.publishImageCount))
      ? Number(packet.publishImageCount)
      : 0,
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "run-release-preflight"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "approval-gated-release-publish"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      publishRequiresExplicitApproval:
        packet.mutationBoundary?.publishRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Release publish remains blocked until registry and catalog mutations are explicitly approved."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "Publish corrected tags and update FBC/CatalogSource references after any approved correction."
    )
  };
}

function sanitizeInstallApprovalTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "cluster-admin-install-approval-ticket"),
    owner: "cluster-admin",
    title: sanitize(packet.title ?? "Install approval handoff"),
    severity: "high",
    classification: sanitize(packet.classification ?? "install-evidence-gaps"),
    installStatus: sanitize(packet.installStatus ?? "needs-evidence"),
    requiredApprovals: (packet.requiredApprovals ?? []).map(sanitize),
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "run-operator-server-dry-run"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "approval-gated-install"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      vectorWriteAttempted:
        packet.mutationBoundary?.vectorWriteAttempted === true,
      ingestionJobCreated:
        packet.mutationBoundary?.ingestionJobCreated === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      installRequiresExplicitApproval:
        packet.mutationBoundary?.installRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Install approval remains blocked until cluster mutations are explicitly approved."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "Use the approved uninstall order and restore OLSConfig from GitOps or backup after any install correction."
    )
  };
}

function sanitizeCatalogToolchainTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "registry-admin-catalog-toolchain-ticket"),
    owner: "registry-admin",
    title: sanitize(packet.title ?? "Catalog registry auth and toolchain handoff"),
    severity: "high",
    classification: sanitize(packet.classification ?? "registry-auth-required"),
    catalogStatus: sanitize(packet.catalogStatus ?? "needs-tooling"),
    registryAuthConfigured: packet.registryAuthConfigured === true,
    registryBaseReadable: packet.registryBaseReadable === true,
    baseImage: sanitize(
      packet.baseImage ??
        "registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18"
    ),
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "registry-base-inspect"
    ),
    setupAction: {
      ...sanitizeExternalRuntimeTicketAction(packet.setupAction, "registry-login"),
      requiresHumanSecretInput:
        packet.setupAction?.requiresHumanSecretInput !== false
    },
    localArtifactAction: sanitizeExternalRuntimeTicketAction(
      packet.localArtifactAction,
      "catalog-local-build"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "approval-gated-publish-catalog-image"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      registryAuthRequiresHumanSecretInput:
        packet.mutationBoundary?.registryAuthRequiresHumanSecretInput !== false,
      catalogPublishRequiresExplicitApproval:
        packet.mutationBoundary?.catalogPublishRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Catalog image build and publish remain blocked until registry.redhat.io auth and catalog toolchain evidence are explicit."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "No rollback is required for read-only registry inspection; remove any incorrect local catalog tag before rebuilding."
    )
  };
}

function sanitizeCertificationToolingTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "release-manager-certification-tooling-ticket"),
    owner: "release-manager",
    title: sanitize(packet.title ?? "Certification tooling review"),
    severity: "high",
    classification: sanitize(packet.classification ?? "missing-local-tooling"),
    toolingStatus: sanitize(packet.toolingStatus ?? "needs-tooling"),
    toolingSatisfiedBy: sanitize(packet.toolingSatisfiedBy ?? "missing"),
    runnerEvidenceStatus: sanitize(packet.runnerEvidenceStatus ?? "missing"),
    runnerEvidencePath: sanitize(
      packet.runnerEvidencePath ??
        "docs/release/evidence/certification/approved-ci-runner.json"
    ),
    finalEvidencePath: sanitize(
      packet.finalEvidencePath ??
        "docs/release/evidence/certification/approved-ci-runner.json"
    ),
    missingRequiredTools: (packet.missingRequiredTools ?? []).map(sanitize),
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "refresh-certification-evidence"
    ),
    setupAction: {
      ...sanitizeExternalRuntimeTicketAction(
        packet.setupAction,
        "install-certification-tooling"
      ),
      requiresHumanApproval: packet.setupAction?.requiresHumanApproval !== false
    },
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "partner-connect-submit"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      toolingInstallRequiresHumanApproval:
        packet.mutationBoundary?.toolingInstallRequiresHumanApproval !== false,
      externalSubmissionRequiresExplicitApproval:
        packet.mutationBoundary?.externalSubmissionRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Certification tooling evidence blocks external submission until reviewed."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "No rollback is required because this packet writes only local evidence."
    )
  };
}

function sanitizeRagProductionTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "rag-owner-production-ingestion-ticket"),
    owner: "rag-owner",
    title: sanitize(packet.title ?? "RAG production ingestion approval handoff"),
    severity: "high",
    classification: sanitize(
      packet.classification ?? "production-ingestion-evidence-required"
    ),
    readinessStatus: sanitize(packet.readinessStatus ?? "missing"),
    requiredApprovals: (packet.requiredApprovals ?? [
      "rag-owner",
      "cluster-sre",
      "security-reviewer"
    ]).map(sanitize),
    queueLive: packet.queueLive === true,
    ingestionWorkerLive: packet.ingestionWorkerLive === true,
    vectorWriteAuditSinkLive: packet.vectorWriteAuditSinkLive === true,
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "verify-rag-production-readiness"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "approval-gated-apply-approved-rag-production-stack"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      vectorWriteAttempted:
        packet.mutationBoundary?.vectorWriteAttempted === true,
      ingestionJobCreated:
        packet.mutationBoundary?.ingestionJobCreated === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      ingestionRequiresExplicitApproval:
        packet.mutationBoundary?.ingestionRequiresExplicitApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Production RAG ingestion remains blocked until approval evidence is explicit."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "Disable the ingestion worker schedule and stop manual job creation."
    )
  };
}

function sanitizeAiopsMonitoringTicketPacket(packet = {}) {
  return {
    id: sanitize(packet.id ?? "cluster-sre-monitoring-proxy-ticket"),
    owner: "cluster-sre",
    title: sanitize(packet.title ?? "AI Ops monitoring proxy evidence handoff"),
    severity: "high",
    classification: sanitize(packet.classification ?? "monitoring-proxy-disabled"),
    handoffStatus: sanitize(packet.handoffStatus ?? "needs-evidence"),
    requiredQueries: (packet.requiredQueries ?? []).map(sanitize),
    readyQueries: (packet.readyQueries ?? []).map(sanitize),
    missingQueries: (packet.missingQueries ?? []).map(sanitize),
    sampleCount: Number.isFinite(Number(packet.sampleCount))
      ? Number(packet.sampleCount)
      : 0,
    evidenceChecklist: (packet.evidenceChecklist ?? []).map(sanitize),
    firstReadOnlyAction: sanitizeExternalRuntimeTicketAction(
      packet.firstReadOnlyAction,
      "aiops-monitoring-proxy-smoke"
    ),
    approvalGatedAction: sanitizeExternalRuntimeTicketAction(
      packet.approvalGatedAction,
      "approval-gated-enable-monitoring-proxy-path"
    ),
    nextCommands: (packet.nextCommands ?? []).map(sanitize),
    blockedBy: (packet.blockedBy ?? []).map(sanitize),
    mutationBoundary: {
      clusterMutationAttempted:
        packet.mutationBoundary?.clusterMutationAttempted === true,
      registryMutationAttempted:
        packet.mutationBoundary?.registryMutationAttempted === true,
      vectorWriteAttempted:
        packet.mutationBoundary?.vectorWriteAttempted === true,
      ingestionJobCreated:
        packet.mutationBoundary?.ingestionJobCreated === true,
      mutationAllowedByThisVerifier:
        packet.mutationBoundary?.mutationAllowedByThisVerifier === true,
      monitoringProxyEnableRequiresApproval:
        packet.mutationBoundary?.monitoringProxyEnableRequiresApproval !== false
    },
    risk: sanitize(
      packet.risk ??
        "Metric correlation remains incomplete until Cluster SRE approves monitoring proxy evidence."
    ),
    rollbackPath: sanitize(
      packet.rollbackPath ??
        "Unset OCP_ENABLE_MONITORING_PROXY or keep it false to return to log/event/runbook-only incident analysis."
    )
  };
}

function ocpClassification(networkHandoff) {
  return networkHandoff?.diagnostics?.classification ?? "unknown";
}

function ocpNetworkDiagnostics(networkHandoff) {
  const diagnostics = networkHandoff?.diagnostics ?? {};
  const target = networkHandoff?.target ?? {};
  const ticket = networkHandoff?.ticketPacket;
  const dnsAddresses = Array.isArray(diagnostics.dns?.addresses)
    ? diagnostics.dns.addresses.map(sanitize).join(",")
    : "";
  const rbacReviews = diagnostics.rbacAccessReviews ?? [];
  const allowedReviews = rbacReviews.filter((review) => review.status === "allowed");
  const deniedReviews = rbacReviews.filter((review) => review.status === "denied");
  const unknownReviews = rbacReviews.filter((review) => review.status === "unknown");
  const readOnlyCommandIds = (networkHandoff?.readOnlyCommands ?? [])
    .map((command) => command.id)
    .filter(Boolean);

  const entries = [
    {
      id: "ocp-network-handoff-status",
      label: "OCP network handoff",
      value:
        `status=${networkHandoff?.status ?? "missing"} actionMode=${networkHandoff?.actionMode ?? "missing"} classification=${diagnostics.classification ?? "missing"}`
    },
    {
      id: "ocp-network-target",
      label: "OCP target",
      value:
        `target=${redactedOcpTarget(target)} port=${target.port ?? "missing"} tokenConfigured=${String(target.tokenConfigured === true)} tlsVerify=${String(target.tlsVerify === true)}`
    },
    {
      id: "ocp-network-dns",
      label: "DNS",
      value:
        `status=${diagnostics.dns?.status ?? "unknown"} addresses=${dnsAddresses || "none"}`
    },
    {
      id: "ocp-network-probes",
      label: "Probe status",
      value:
        `tcp=${diagnostics.tcp?.status ?? "unknown"} tcpError=${diagnostics.tcp?.error ?? "none"} tls=${diagnostics.tls?.status ?? "unknown"} version=${diagnostics.kubernetesVersion?.status ?? "unknown"} oc=${diagnostics.oc?.versionGet ?? "unknown"}`
    },
    {
      id: "ocp-network-boundary",
      label: "Mutation boundary",
      value:
        `clusterMutationAttempted=${String(networkHandoff?.clusterMutationAttempted === true)} registryMutationAttempted=${String(networkHandoff?.registryMutationAttempted === true)} mutationAllowed=${String(networkHandoff?.mutationAllowedByThisVerifier === true)}`
    },
    {
      id: "ocp-network-rbac",
      label: "RBAC readiness",
      value:
        `allowed=${allowedReviews.length}/${rbacReviews.length} denied=${deniedReviews.length} unknown=${unknownReviews.length}`
    },
    {
      id: "ocp-network-readonly",
      label: "Read-only handoff",
      value: readOnlyCommandIds.slice(0, 6).join(", ") || "missing"
    }
  ];
  if (ticket) {
    entries.push(
      {
        id: "ocp-network-ticket",
        label: "Network ticket",
        value:
          `${ticket.id ?? "missing"} owner=${ticket.owner ?? "missing"} severity=${ticket.severity ?? "missing"} target=${ticket.redactedTarget ?? "missing"}`
      },
      {
        id: "ocp-network-ticket-first-readonly",
        label: "Ticket first read-only",
        value:
          `${ticket.firstReadOnlyAction?.id ?? "missing"} mutation=${String(ticket.firstReadOnlyAction?.mutation === true)} next=${ticket.firstReadOnlyAction?.nextCommand ?? "missing"}`
      },
      {
        id: "ocp-network-ticket-approval",
        label: "Ticket approval gate",
        value:
          `${ticket.approvalGatedAction?.id ?? "none"} mutation=${String(ticket.approvalGatedAction?.mutation === true)} approval=${String(ticket.approvalGatedAction?.requiresExplicitApproval === true)}`
      }
    );
  }
  return entries;
}

function networkTicketPacket(networkHandoff) {
  return networkHandoff?.ticketPacket;
}

function networkTicketApprovalCommands(networkHandoff) {
  const approval = networkHandoff?.ticketPacket?.approvalGatedAction;
  if (!approval || approval.mutation !== true) return [];
  return [
    {
      id: approval.id ?? "approval-gated-network-change",
      phase: "network-change",
      command: approval.nextCommand ?? "open approved Network/SRE change",
      mutation: true,
      requiresExplicitApproval: approval.requiresExplicitApproval === true
    }
  ];
}

function networkTicketNextCommands(networkHandoff) {
  return networkHandoff?.ticketPacket?.nextCommands ?? [];
}

function authLikeOcpClassification(classification) {
  return ["auth-or-rbac", "auth-failed", "token-missing"].includes(classification);
}

function authRbacHandoffCommands(authRbacPlan) {
  const readOnlyCommands = authRbacPlan?.readOnlyCommands ?? [];
  return readOnlyCommands
    .map((command) => command.command)
    .filter(Boolean);
}

function ocpConnectivityAction(networkHandoff, authRbacPlan) {
  const classification = ocpClassification(networkHandoff);
  if (authLikeOcpClassification(classification)) {
    return {
      id: "cluster-admin-fix-ocp-auth-rbac",
      owner: "cluster-admin",
      priority: "blocker",
      request:
        "Refresh the configured OCP API credential or grant the read-only RBAC needed for /version and OLSConfig CRD discovery.",
      evidenceNeeded: `OCP connectivity diagnostic classification=${classification} becomes api-ready; oc whoami and oc auth can-i get crd olsconfigs.ols.openshift.io succeed.`,
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      handoffNextCommands: authRbacHandoffCommands(authRbacPlan),
      readOnlyCommands: authRbacPlan?.readOnlyCommands ?? [],
      approvalGatedCommands: authRbacPlan?.approvalGatedCommands ?? [],
      diagnostics: ocpNetworkDiagnostics(networkHandoff),
      ticketPacket: networkTicketPacket(networkHandoff),
      acceptance: ["AC-OCP-001", "AC-LIVE-HANDOFF-001"]
    };
  }
  if (classification === "tls-handshake-failed") {
    return {
      id: "cluster-sre-fix-ocp-tls",
      owner: "cluster-sre",
      priority: "blocker",
      request:
        "Fix OCP API TLS trust, proxy TLS interception, or OCP_TLS_VERIFY settings after DNS/TCP evidence has passed.",
      evidenceNeeded: "OCP connectivity diagnostic classification becomes api-ready.",
      nextCommand: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      handoffNextCommands: networkTicketNextCommands(networkHandoff),
      approvalGatedCommands: networkTicketApprovalCommands(networkHandoff),
      diagnostics: ocpNetworkDiagnostics(networkHandoff),
      ticketPacket: networkTicketPacket(networkHandoff),
      acceptance: ["AC-OCP-001", "AC-LIVE-HANDOFF-001"]
    };
  }
  return {
    id: "network-sre-unblock-ocp-api",
    owner: "network-sre",
    priority: "blocker",
    request: "Restore TCP reachability from the verifier workstation or approved bastion to the company OCP API.",
    evidenceNeeded: "OCP connectivity diagnostic classification becomes api-ready.",
    nextCommand: "npm run verify:ocp:connectivity -- --timeout-ms 30000",
    handoffNextCommands: networkTicketNextCommands(networkHandoff),
    approvalGatedCommands: networkTicketApprovalCommands(networkHandoff),
    diagnostics: ocpNetworkDiagnostics(networkHandoff),
    ticketPacket: networkTicketPacket(networkHandoff),
    acceptance: ["AC-OCP-001", "AC-LIVE-HANDOFF-001"]
  };
}

function networkHandoffOwner(classification) {
  if (authLikeOcpClassification(classification)) return "cluster-admin";
  if (classification === "tls-handshake-failed") return "cluster-sre";
  return "network-sre";
}

function networkHandoffId(classification) {
  if (authLikeOcpClassification(classification)) return "cluster-admin-review-ocp-auth-rbac-handoff";
  if (classification === "tls-handshake-failed") return "cluster-sre-review-ocp-tls-handoff";
  return "network-sre-review-network-handoff";
}

function liveReaderSmokeDiagnostics(ocpLiveReaderSmoke) {
  const diagnostics = ocpLiveReaderSmoke?.diagnostics ?? {};
  const reviews = diagnostics.requiredRbacReviews ?? [];
  const allowedReviews = reviews.filter((review) => review.status === "allowed");
  const deniedReviews = reviews.filter((review) => review.status === "denied");
  const unknownReviews = reviews.filter((review) => review.status === "unknown");
  const sourceArtifacts = (ocpLiveReaderSmoke?.sourceArtifacts ?? [])
    .slice(0, 3)
    .map((source) =>
      `${source.id ?? "unknown"}:${source.status ?? "unknown"}:fresh=${String(source.fresh === true)}`
    )
    .join(", ");
  const verifierRuns = (ocpLiveReaderSmoke?.verifierRuns ?? [])
    .slice(0, 3)
    .map((run) =>
      `${run.id ?? "unknown"}:ok=${String(run.ok === true)}:skipped=${String(run.skipped === true)}`
    )
    .join(", ");
  return [
    {
      id: "post-approval-smoke-status",
      label: "Post-approval smoke",
      value: ocpLiveReaderSmoke?.status ?? "missing"
    },
    {
      id: "post-approval-rbac",
      label: "Required RBAC",
      value:
        `allowed=${allowedReviews.length}/${reviews.length} denied=${deniedReviews.length} unknown=${unknownReviews.length}`
    },
    {
      id: "post-approval-ocp-classification",
      label: "OCP classification",
      value: diagnostics.ocpClassification ?? "missing"
    },
    {
      id: "post-approval-lightspeed",
      label: "Lightspeed readiness",
      value:
        `classification=${diagnostics.lightspeedClassification ?? "missing"} authReady=${String(diagnostics.lightspeedAuthReady === true)}`
    },
    {
      id: "post-approval-sources",
      label: "Source artifacts",
      value: sourceArtifacts || "missing"
    },
    {
      id: "post-approval-verifiers",
      label: "Verifier runs",
      value: verifierRuns || "missing"
    }
  ];
}

function lightspeedReadinessAction(lightspeedReadiness, authRbacPlan, ocpLiveReaderSmoke, networkHandoff) {
  const gap = lightspeedReadiness?.currentGap ?? {};
  const classification = gap.classification ?? "unknown";
  const readOnlyCommands = [
    ...(authLikeOcpClassification(classification)
      ? authRbacPlan?.readOnlyCommands ?? []
      : []),
    {
      id: "lightspeed-readiness-live",
      phase: "lightspeed-readiness",
      command: "npm run verify:lightspeed -- --timeout-ms 30000",
      mutation: false,
      requiresNetwork: true,
      writesLocalEvidence: true
    }
  ];

  if (authLikeOcpClassification(classification)) {
    return {
      id: "cluster-admin-fix-lightspeed-readiness-auth-rbac",
      owner: "cluster-admin",
      priority: "blocker",
      request:
        "Refresh the OCP credential or approve read-only RBAC so Lightspeed readiness can read the OLSConfig CRD and target OLSConfig before MCP registration.",
      evidenceNeeded:
        `Lightspeed readiness classification=${classification} becomes CRD/OLSConfig readable; oc auth can-i get crd olsconfigs.ols.openshift.io and oc get olsconfig cluster both pass.`,
      nextCommand: gap.nextCommand ?? "npm run evidence:ocp-auth-rbac-plan",
      handoffNextCommands: [
        ...authRbacHandoffCommands(authRbacPlan),
        "npm run verify:lightspeed -- --timeout-ms 30000"
      ],
      readOnlyCommands,
      approvalGatedCommands: authRbacPlan?.approvalGatedCommands ?? [],
      blockedBy: [
        ...(lightspeedReadiness?.missingEvidence ?? []),
        gap.evidence ?? ""
      ],
      diagnostics: liveReaderSmokeDiagnostics(ocpLiveReaderSmoke),
      acceptance: ["AC-LS-002", "AC-OCP-RBAC-001", "AC-LIVE-HANDOFF-001"]
    };
  }

  if (classification === "tls-handshake-failed") {
    return {
      id: "cluster-sre-fix-lightspeed-readiness-tls",
      owner: "cluster-sre",
      priority: "blocker",
      request:
        "Fix TLS trust or proxy TLS behavior so Lightspeed readiness can read OLSConfig resources.",
      evidenceNeeded:
        "Lightspeed readiness can read the OLSConfig CRD and OLSConfig with TLS verification policy documented.",
      nextCommand:
        gap.nextCommand ?? "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      handoffNextCommands: networkTicketNextCommands(networkHandoff),
      readOnlyCommands,
      approvalGatedCommands: networkTicketApprovalCommands(networkHandoff),
      blockedBy: lightspeedReadiness?.missingEvidence ?? [],
      diagnostics: ocpNetworkDiagnostics(networkHandoff),
      ticketPacket: networkTicketPacket(networkHandoff),
      acceptance: ["AC-LS-002", "AC-LIVE-HANDOFF-001"]
    };
  }

  if (["tcp-timeout", "tcp-unreachable", "dns-unresolved"].includes(classification)) {
    return {
      id: "network-sre-unblock-lightspeed-readiness-ocp-api",
      owner: "network-sre",
      priority: "blocker",
      request:
        "Restore network reachability from the verifier workstation or approved bastion so Lightspeed readiness can read OLSConfig resources.",
      evidenceNeeded:
        `Lightspeed readiness classification=${classification} changes to CRD/OLSConfig readable or NEEDS_CONFIGURATION.`,
      nextCommand:
        gap.nextCommand ?? "npm run verify:ocp:connectivity -- --timeout-ms 30000",
      handoffNextCommands: networkTicketNextCommands(networkHandoff),
      readOnlyCommands,
      approvalGatedCommands: networkTicketApprovalCommands(networkHandoff),
      blockedBy: lightspeedReadiness?.missingEvidence ?? [],
      diagnostics: ocpNetworkDiagnostics(networkHandoff),
      ticketPacket: networkTicketPacket(networkHandoff),
      acceptance: ["AC-LS-002", "AC-LIVE-HANDOFF-001"]
    };
  }

  return {
    id: "cluster-sre-rerun-lightspeed-readiness",
    owner: gap.owner ?? "cluster-sre",
    priority: "blocker",
    request: "Rerun live Lightspeed MCP readiness after OCP API reachability and OLSConfig readability are restored.",
    evidenceNeeded: "Lightspeed readiness artifact reaches PASS or a non-network NEEDS_CONFIGURATION classification.",
    nextCommand: gap.nextCommand ?? "npm run verify:lightspeed -- --timeout-ms 30000",
    readOnlyCommands,
    blockedBy: lightspeedReadiness?.missingEvidence ?? [],
    diagnostics: liveReaderSmokeDiagnostics(ocpLiveReaderSmoke),
    acceptance: ["AC-LS-001", "AC-LS-002"]
  };
}

function checkpointItems(
  checkpoint,
  networkHandoff,
  certificationReadiness,
  authRbacPlan,
  lightspeedReadiness,
  ocpLiveReaderSmoke,
  releasePlan,
  installPlan,
  externalRuntimeReviewPacket
) {
  const lanes = checkpoint?.lanes ?? [];
  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  const items = [];
  const addIfOpen = (laneId, payload) => {
    const lane = byId.get(laneId);
    if (!lane || lane.status === "pass") return;
    items.push(item({
      ...payload,
      source: `checkpoint:${laneId}`,
      blockedBy: uniqueStrings([
        ...(payload.blockedBy ?? []),
        ...(lane.missingEvidence ?? []),
        ...(lane.blockers ?? [])
      ])
    }));
  };

  addIfOpen("ocpConnectivity", ocpConnectivityAction(networkHandoff, authRbacPlan));
  addIfOpen(
    "lightspeedReadiness",
    lightspeedReadinessAction(lightspeedReadiness, authRbacPlan, ocpLiveReaderSmoke, networkHandoff)
  );
  addIfOpen("externalRuntime", {
    id: "release-manager-complete-external-runtime-final-evidence",
    owner: "release-manager",
    priority: "high",
    request: "Coordinate final reviewed vLLM/Qdrant evidence files after registry/security/product inputs are complete.",
    evidenceNeeded: "docs/release/evidence/external-runtime/vllm.json and qdrant.json pass verify:external-runtime-plan.",
    nextCommand: "npm run verify:external-runtime-plan",
    handoffNextCommands:
      externalRuntimeFinalEvidenceHandoffCommands(externalRuntimeReviewPacket),
    readOnlyCommands:
      externalRuntimeFinalEvidenceReadOnlyCommands(externalRuntimeReviewPacket),
    blockedBy: externalRuntimeReviewPacket?.missingEvidence ?? [],
    diagnostics:
      externalRuntimeFinalEvidenceDiagnostics(externalRuntimeReviewPacket),
    acceptance: ["AC-CERT-001"]
  });
  addIfOpen("certificationReadiness", {
    id: "release-manager-complete-certification-tooling",
    owner: "release-manager",
    priority: "high",
    request:
      certificationReadiness?.toolingHandoff?.missingRequiredTools?.length
        ? `Install or provide approved certification tooling: ${certificationReadiness.toolingHandoff.missingRequiredTools.join(", ")}.`
        : "Install or provide approved opm/operator-sdk certification tooling and rerun certification readiness.",
    evidenceNeeded: "Certification readiness artifact reaches READY_FOR_REVIEW with current-head packaging/doc checks.",
    nextCommand: "npm run verify:certification",
    handoffNextCommands:
      certificationReadiness?.toolingHandoff?.nextCommands ?? [],
    setupCommands:
      certificationReadiness?.toolingHandoff?.setupCommands ?? [],
    readOnlyCommands:
      certificationReadiness?.toolingHandoff?.readOnlyCommands ?? [],
    approvalGatedCommands:
      certificationReadiness?.toolingHandoff?.approvalGatedCommands ?? [],
    missingRequiredTools:
      certificationReadiness?.toolingHandoff?.missingRequiredTools ?? [],
    blockedBy: uniqueStrings(
      (certificationReadiness?.toolingHandoff?.executionLanes ?? [])
        .flatMap((lane) => lane.blockedBy ?? [])
    ),
    diagnostics: certificationToolingDiagnostics(certificationReadiness),
    certificationToolingTicketPacket:
      certificationReadiness?.toolingHandoff?.ticketPacket,
    acceptance: ["AC-CERT-001"]
  });
  addIfOpen("releasePublish", {
    id: "release-manager-refresh-publish-plan-after-evidence",
    owner: "release-manager",
    priority: "high",
    request: "Refresh release publish approval plan after external runtime and scan evidence are complete.",
    evidenceNeeded: "Release publish plan status becomes PUBLISH_APPROVAL_REQUIRED with clean same-head evidence.",
    nextCommand: "npm run verify:release-plan",
    handoffNextCommands:
      releasePlan?.ticketPacket?.nextCommands ?? [],
    readOnlyCommands: (releasePlan?.commands ?? []).filter(
      (command) => command.mutation !== true
    ),
    approvalGatedCommands: (releasePlan?.commands ?? []).filter(
      (command) => command.mutation === true
    ),
    blockedBy: releasePlan?.missingEvidence ?? [],
    releasePublishTicketPacket: releasePlan?.ticketPacket,
    acceptance: ["AC-CERT-001"]
  });
  addIfOpen("installPlan", {
    id: "cluster-admin-refresh-install-plan-after-live-evidence",
    owner: "cluster-admin",
    priority: "high",
    request: "Refresh install approval plan after live OCP/Lightspeed evidence and release image evidence are current.",
    evidenceNeeded: "Install approval plan status becomes APPROVAL_REQUIRED with all mutating commands approval-gated.",
    nextCommand: "npm run verify:install-plan",
    handoffNextCommands:
      installPlan?.ticketPacket?.nextCommands ?? [],
    readOnlyCommands: (installPlan?.commands ?? []).filter(
      (command) => command.mutation !== true
    ),
    approvalGatedCommands: (installPlan?.commands ?? []).filter(
      (command) => command.mutation === true
    ),
    blockedBy: installPlan?.missingEvidence ?? [],
    installApprovalTicketPacket: installPlan?.ticketPacket,
    acceptance: ["AC-OP-005"]
  });

  return items;
}

function externalRuntimeItems(packet) {
  const readOnlyCommands = packet?.readOnlyCommands ?? [];
  const approvalGatedCommands = packet?.approvalGatedCommands ?? [];
  const externalRuntimeTicketFor = (imageName) =>
    (packet?.ticketPackets ?? []).find((ticket) => ticket.imageName === imageName);
  return (packet?.images ?? []).flatMap((image) => {
    const readOnlyFor = (nextCommand) =>
      externalRuntimeReadOnlyCommandsFor(readOnlyCommands, image.name, nextCommand);
    const approvalFor = (role) =>
      externalRuntimeApprovalCommandsForRole(approvalGatedCommands, image.name, role);
    const reviewerItems = (image.reviewerRequests ?? []).map((request, index) =>
      item({
        id: `external-runtime-${image.name}-${request.role ?? "reviewer"}-${index + 1}`,
        owner: request.role ?? "release-manager",
        priority: image.name === "vllm" && /source digest/i.test(request.request ?? "")
          ? "blocker"
          : "high",
        source: `externalRuntimeReviewPacket:${image.name}`,
        request: request.request ?? `Complete ${image.name} reviewer request.`,
        evidenceNeeded: request.evidenceNeeded ?? `${image.name} reviewer evidence`,
        nextCommand:
          request.nextCommand ?? "npm run evidence:external-runtime:review-packet",
        readOnlyCommands: readOnlyFor(request.nextCommand ?? ""),
        approvalGatedCommands: approvalFor(request.role ?? ""),
        externalRuntimeTicketPacket:
          request.role === "registry-admin"
            ? externalRuntimeTicketFor(image.name)
            : undefined,
        blockedBy: image.missingEvidence ?? [],
        diagnostics: externalRuntimeReviewerDiagnostics(image, request),
        acceptance: ["AC-CERT-001"]
      })
    );
    const candidate = image.candidateMatrix;
    const candidateStatus = candidate?.status ?? "missing";
    const candidateReady = ["candidate-ready-for-review", "current-evidence-release-eligible"].includes(candidateStatus);
    const bestCandidate = candidate?.bestCandidate;
    const candidateDiagnostics = [
      {
        id: "candidate-status",
        label: "Candidate matrix",
        value:
          `status=${candidateStatus} ` +
          `matrix=${candidate?.matrixStatus ?? "missing"} ` +
          `zeroCritical=${candidate?.zeroCriticalCandidates?.length ?? 0}`
      },
      {
        id: "candidate-best",
        label: "Best candidate",
        value: candidate?.bestCandidate
          ? `${candidate.bestCandidate.image} label=${candidate.bestCandidate.label ?? "unknown"} releaseEligible=${String(candidate.bestCandidate.releaseEligible === true)}`
          : "missing"
      },
      {
        id: "candidate-findings",
        label: "Findings",
        value: candidate?.bestCandidate
          ? `critical=${candidate.bestCandidate.criticalFindings} high=${candidate.bestCandidate.highFindings} medium=${candidate.bestCandidate.mediumFindings} low=${candidate.bestCandidate.lowFindings}`
          : "missing"
      },
      {
        id: "candidate-delta",
        label: "Delta from current",
        value: candidate?.bestCandidate?.deltaFromCurrent
          ? `critical=${candidate.bestCandidate.deltaFromCurrent.critical} high=${candidate.bestCandidate.deltaFromCurrent.high} medium=${candidate.bestCandidate.deltaFromCurrent.medium} low=${candidate.bestCandidate.deltaFromCurrent.low}`
          : "missing"
      },
      {
        id: "candidate-review",
        label: "Review boundary",
        value: candidate?.bestCandidate
          ? `reviewDecision=${candidate.bestCandidate.reviewDecision ?? "unknown"} sbomPackages=${candidate.bestCandidate.sbomPackageCount ?? "unknown"} promotionApproved=false`
          : "missing"
      },
      {
        id: "candidate-critical-summary",
        label: "Remaining criticals",
        value: candidateCriticalSummary(bestCandidate)
      },
      {
        id: "candidate-requirement",
        label: "Next candidate requirement",
        value: candidateRequirement(image.name, candidateStatus, bestCandidate)
      }
    ];
    const candidateTimeout = image.name === "vllm" ? " --timeout-ms 7200000" : "";
    const candidateScannerOptions = image.name === "vllm"
      ? " --trivy-timeout 30m --trivy-scanners vuln"
      : "";
    const candidateScanCommand =
      `npm run evidence:external-runtime:candidate-scan -- --name ${image.name} --candidate-image <candidate-image> --candidate-label <candidate-label> --execute-docker-fallback${candidateTimeout}${candidateScannerOptions}`;
    const candidateApprovalCommand = candidateReady && bestCandidate?.releaseEligible === true
      ? `npm run evidence:external-runtime:draft -- --name ${image.name} --scan-status approved --scan-evidence ${bestCandidate.vulnerabilityPath ?? "<zero-critical-scan-report>"} --scan-critical-findings ${bestCandidate.criticalFindings ?? 0} --scan-high-findings ${bestCandidate.highFindings ?? "<high-findings>"} --sbom-status approved --sbom-evidence ${bestCandidate.sbomPath ?? "<approved-sbom-path-or-url>"} --ticket <change-ticket> --force`
      : `npm run evidence:external-runtime:draft -- --name ${image.name} --scan-status approved --scan-evidence <zero-critical-scan-report> --scan-critical-findings 0 --ticket <change-ticket> --force`;
    const candidateNextCommand = candidateReady
      ? candidateApprovalCommand
      : candidateScanCommand;
    const candidateItem = item({
      id: `external-runtime-${image.name}-candidate-matrix`,
      owner: "security-reviewer",
      priority: "high",
      source: `externalRuntimeReviewPacket:${image.name}:candidateMatrix`,
      request: candidateReady
        ? `Review the zero-critical ${image.name} candidate ${bestCandidate?.image ?? "best=missing"} and attach approved scan/SBOM evidence before external runtime promotion.`
        : candidateStatus === "candidate-reduces-risk-but-remediation-required"
          ? `Find or approve a zero-critical ${image.name} replacement candidate before external runtime promotion.`
          : `Scan at least one ${image.name} replacement candidate before external runtime promotion review.`,
      evidenceNeeded: [
        `candidateMatrix status=${candidateStatus}`,
        bestCandidate
          ? `best=${bestCandidate.image} criticalFindings=${bestCandidate.criticalFindings} highFindings=${bestCandidate.highFindings} ${candidateCriticalSummary(bestCandidate)} scan=${bestCandidate.vulnerabilityPath ?? "missing"} sbom=${bestCandidate.sbomPath ?? "missing"}`
          : "best=missing",
        candidateRequirement(image.name, candidateStatus, bestCandidate),
        candidate?.recommendation ?? "candidate recommendation missing"
      ].join("; "),
      nextCommand: candidateNextCommand,
      readOnlyCommands: uniqueByKey(
        [
          ...readOnlyFor(candidateScanCommand),
          ...readOnlyFor(candidateApprovalCommand)
        ],
        (command) => command.id ?? command.command ?? "unknown"
      ),
      blockedBy: candidateReady
        ? image.missingEvidence ?? []
        : candidate?.missingEvidence ?? image.missingEvidence ?? [],
      diagnostics: candidateDiagnostics,
      acceptance: ["AC-CERT-001"]
    });
    return [...reviewerItems, candidateItem];
  });
}

function externalRuntimeReadOnlyCommandsFor(commands, imageName, nextCommand) {
  const ids = new Set(["verify-external-runtime-plan"]);
  const commandText = String(nextCommand ?? "");
  if (/external-runtime:draft:digests/i.test(commandText)) {
    ids.add("refresh-external-runtime-drafts");
    ids.add(`inspect-source-${imageName}`);
  }
  if (/external-runtime:draft\b/i.test(commandText)) {
    ids.add("refresh-external-runtime-drafts");
  }
  if (/external-runtime:candidate-scan/i.test(commandText)) {
    ids.add(`scan-${imageName}-candidate`);
    ids.add("refresh-external-runtime-candidate-matrix");
    ids.add("verify-security-scan-plan");
    ids.add("plan-security-scan-evidence");
  }
  return commands.filter((command) => {
    const id = command.id ?? "";
    return ids.has(id) || sanitize(command.command ?? "") === sanitize(commandText);
  });
}

function externalRuntimeApprovalCommandsForRole(commands, imageName, role) {
  return commands.filter((command) => {
    const id = command.id ?? "";
    if (role === "registry-admin") return id === `mirror-${imageName}`;
    if (role === "security-reviewer") return id === `sign-${imageName}`;
    return false;
  });
}

function securityScanItems(plan) {
  const readOnlyCommands = plan?.commands?.readOnly ?? [];
  const approvalGatedCommands = plan?.commands?.approvalGated ?? [];
  const ticketPackets = plan?.ticketPackets ?? [];
  const securityReviewTicketFor = (imageName) =>
    ticketPackets.find((ticket) => ticket.imageName === imageName);
  const securityReviewDiagnostics = (imageName, securityEvidence, reviewDraft) => [
    {
      id: "security-final-review",
      label: "Final security review",
      value:
        `exists=${String(securityEvidence.reviewExists === true)} ` +
        `valid=${String(securityEvidence.reviewValid === true)} ` +
        `approved=${String(securityEvidence.reviewApproved === true)} ` +
        `decision=${securityEvidence.reviewDecision ?? "missing"}`
    },
    {
      id: "security-review-draft",
      label: "Security review draft",
      value:
        `state=${reviewDraft.evidenceState ?? "missing"} ` +
        `sameHead=${String(reviewDraft.sameHead === true)} ` +
        `decision=${reviewDraft.decision ?? "missing"} ` +
        `explicitDecision=${String(reviewDraft.explicitDecisionProvided === true)} ` +
        `ready=${String(reviewDraft.readyForFinalReview === true)}`
    },
    {
      id: "security-scan-sbom",
      label: "Scan and SBOM",
      value:
        `scan=${String(securityEvidence.vulnerabilityReportExists === true)} ` +
        `scanValid=${String(securityEvidence.vulnerabilityReportValid === true)} ` +
        `critical=${securityEvidence.vulnerabilityCriticalFindings ?? "unknown"} ` +
        `sbom=${String(securityEvidence.sbomExists === true)} ` +
        `sbomValid=${String(securityEvidence.sbomValid === true)} ` +
        `packages=${securityEvidence.sbomPackageCount ?? 0}`
    },
    {
      id: "security-reviewer-ticket",
      label: "Reviewer and ticket",
      value:
        `reviewer=${String(reviewDraft.reviewerProvided === true)} ` +
        `ticket=${String(reviewDraft.ticketProvided === true)}`
    },
    {
      id: "security-final-evidence-file",
      label: "Final evidence file",
      value:
        reviewDraft.finalEvidenceFile ??
        `docs/release/evidence/security/${imageName}-security-review.json`
    }
  ];
  return (plan?.images ?? [])
    .filter((image) => image.required === true)
    .filter((image) => {
      const securityEvidence = image.securityEvidence ?? {};
      return !(
        securityEvidence.reviewExists === true &&
        securityEvidence.reviewValid === true &&
        securityEvidence.reviewApproved === true &&
        String(securityEvidence.reviewDecision ?? "").toLowerCase() === "approved"
      );
    })
    .map((image) => {
      const securityEvidence = image.securityEvidence ?? {};
      const reviewDraft = securityEvidence.reviewDraft ?? {};
      const imageName = sanitize(image.name ?? "unknown");
      const finalEvidenceFile =
        reviewDraft.finalEvidenceFile ??
        `docs/release/evidence/security/${imageName}-security-review.json`;
      const draftMissingEvidence = reviewDraft.missingEvidence ?? [];
      const validationMissingEvidence =
        securityEvidence.validationMissingEvidence ?? [];
      const finalReviewState =
        `exists=${String(securityEvidence.reviewExists === true)}, ` +
        `valid=${String(securityEvidence.reviewValid === true)}, ` +
        `approved=${String(securityEvidence.reviewApproved === true)}, ` +
        `decision=${securityEvidence.reviewDecision ?? "missing"}`;
      const relevantReadOnly = readOnlyCommands.filter((command) => {
        const id = command.id ?? "";
        return (
          id === "security-review-drafts-all" ||
          id === "security-scan-evidence-runner" ||
          id === "security-scan-evidence-runner-docker" ||
          id.includes(imageName)
        );
      });
      const relevantApprovalGated = approvalGatedCommands.filter((command) =>
        String(command.id ?? "").includes(imageName)
      );
      const securityReviewTicketPacket = securityReviewTicketFor(imageName);
      const nextCommand =
        reviewDraft.exists === true && reviewDraft.sameHead === true
          ? `npm run evidence:security-review:draft -- --name ${imageName} --reviewer <security-reviewer> --ticket <security-ticket> --decision approved --force`
          : `npm run evidence:security-review:draft -- --name ${imageName} --force`;
      return item({
        id: `security-review-${imageName}-final-evidence`,
        owner: "security-reviewer",
        priority: "high",
        source: `securityScanPlan:${imageName}`,
        request:
          `Complete or refresh final reviewed security evidence for ${imageName} without signing, pushing, mirroring, or mutating cluster resources.`,
        evidenceNeeded: [
          `${finalEvidenceFile} exists with artifactType=opslens.security-review.v0.1`,
          `reviewExists=${String(securityEvidence.reviewExists === true)}`,
          `reviewValid=${String(securityEvidence.reviewValid === true)}`,
          `reviewApproved=${String(securityEvidence.reviewApproved === true)}`,
          `reviewDecision=${securityEvidence.reviewDecision ?? "missing"}`,
          `reviewDraft=${reviewDraft.evidenceState ?? "missing"}`,
          `sameHead=${String(reviewDraft.sameHead === true)}`,
          `decision=${reviewDraft.decision ?? "missing"}`,
          `explicitDecision=${String(reviewDraft.explicitDecisionProvided === true)}`,
          `readyForFinalReview=${String(reviewDraft.readyForFinalReview === true)}`,
          `scan=${String(securityEvidence.vulnerabilityReportExists === true)}`,
          `sbom=${String(securityEvidence.sbomExists === true)}`,
          `reviewer=${String(reviewDraft.reviewerProvided === true)}`,
          `ticket=${String(reviewDraft.ticketProvided === true)}`
        ].join("; "),
        nextCommand,
        readOnlyCommands: relevantReadOnly,
        approvalGatedCommands: relevantApprovalGated,
        securityReviewTicketPacket,
        blockedBy: [
          `${imageName} final security review evidence is not approved/current (${finalReviewState})`,
          ...validationMissingEvidence,
          ...draftMissingEvidence
        ],
        diagnostics: securityReviewDiagnostics(
          imageName,
          securityEvidence,
          reviewDraft
        ),
        acceptance: ["AC-CERT-001"]
      });
    });
}

function bundleDecisionItems(bundle) {
  const decision = bundle?.decision ?? {};
  const items = [];
  if (decision.publishReady !== true) {
    items.push(item({
      id: "release-manager-publish-decision-not-ready",
      owner: "release-manager",
      priority: "high",
      source: "releaseEvidenceBundle:decision",
      request: "Keep release publication blocked until releaseStatus, checkpointStatus, and roadmapStatus are ready.",
      evidenceNeeded: `publishReady=false releaseStatus=${decision.releaseStatus ?? "unknown"} checkpointStatus=${decision.checkpointStatus ?? "unknown"} roadmapStatus=${decision.roadmapStatus ?? "unknown"}`,
      nextCommand: "npm run verify:release-evidence-bundle",
      blockedBy: bundle?.missingEvidence ?? [],
      acceptance: ["AC-CERT-001"]
    }));
  }
  if (decision.installReady !== true) {
    items.push(item({
      id: "cluster-admin-install-decision-not-ready",
      owner: "cluster-admin",
      priority: "high",
      source: "releaseEvidenceBundle:decision",
      request: "Keep install approval blocked until installStatus and checkpointStatus are ready.",
      evidenceNeeded: `installReady=false installStatus=${decision.installStatus ?? "unknown"} checkpointStatus=${decision.checkpointStatus ?? "unknown"}`,
      nextCommand: "npm run verify:install-plan",
      blockedBy: bundle?.missingEvidence ?? [],
      acceptance: ["AC-OP-005"]
    }));
  }
  return items;
}

function catalogToolchainItems(bundle) {
  const catalog = bundle?.catalogToolchain;
  if (!catalog || catalog.registryBaseReadable === true) return [];

  const catalogReadOnlyCommands = [
    ...(catalog.readOnlyCommands ?? []),
    ...(catalog.localArtifactCommands ?? []),
    ...(bundle?.commands?.readOnly ?? [])
  ];
  const readOnlyCommands = uniqueByKey(
    catalogReadOnlyCommands.filter((command) =>
      [
        "registry-base-inspect",
        "refresh-catalog-toolchain-evidence",
        "catalog-local-build"
      ].includes(command.id)
    ),
    (command) => `${command.id}:${command.command}`
  );
  const setupCommands = (catalog.setupCommands ?? [])
    .filter((command) => command.id === "registry-login")
    .map((command) => ({
      ...command,
      requiresHumanApproval:
        command.requiresHumanApproval === true ||
        command.requiresHumanSecretInput === true
    }));
  const blockedBy = (bundle?.missingEvidence ?? []).filter((entry) =>
    /registry\.redhat\.io|catalog actual image build|catalog local build|base image manifest/i.test(entry)
  );
  const firstReadOnly =
    readOnlyCommands.find((command) => command.id === "registry-base-inspect") ??
    readOnlyCommands[0] ?? {
      id: "registry-base-inspect",
      command:
        "docker manifest inspect registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18"
    };
  const setupAction =
    setupCommands.find((command) => command.id === "registry-login") ?? {
      id: "registry-login",
      command: "docker login registry.redhat.io"
    };
  const localArtifact =
    readOnlyCommands.find((command) => command.id === "catalog-local-build") ?? {
      id: "catalog-local-build",
      command:
        "docker build -f deploy/catalog/catalog.Dockerfile -t cywell/opslens-catalog:verify deploy/catalog"
    };
  const catalogToolchainTicketPacket = {
    id: "registry-admin-catalog-toolchain-ticket",
    owner: "registry-admin",
    title: "Catalog registry auth and toolchain handoff",
    severity: "high",
    classification: catalog.registryAuthConfigured
      ? "registry-base-image-unreadable"
      : "registry-auth-required",
    catalogStatus: catalog.status ?? "needs-tooling",
    registryAuthConfigured: catalog.registryAuthConfigured === true,
    registryBaseReadable: catalog.registryBaseReadable === true,
    baseImage:
      "registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18",
    evidenceChecklist: [
      "registry.redhat.io auth is configured through an approved credential path",
      "registry base image manifest is readable with docker manifest inspect",
      "catalog local build runs only after read-only base image inspection passes",
      "catalog image push or publication remains approval-gated"
    ],
    firstReadOnlyAction: {
      id: firstReadOnly.id,
      status: catalog.registryBaseReadable === true ? "pass" : "needs-evidence",
      nextCommand: firstReadOnly.command,
      mutation: false,
      requiresExplicitApproval: false
    },
    setupAction: {
      id: setupAction.id,
      status: catalog.registryAuthConfigured === true ? "ready" : "human-setup",
      nextCommand: setupAction.command,
      mutation: false,
      requiresExplicitApproval: false,
      requiresHumanSecretInput: true
    },
    localArtifactAction: {
      id: localArtifact.id,
      status: catalog.registryBaseReadable === true ? "ready" : "blocked",
      nextCommand: localArtifact.command,
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: "approval-gated-publish-catalog-image",
      status: "approval-gated",
      nextCommand:
        "approval-gated catalog image push/sign/publish command from release publish plan",
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: uniqueStrings([
      firstReadOnly.command,
      setupAction.command,
      localArtifact.command,
      "npm run verify:catalog-toolchain",
      "npm run evidence:release-action-queue"
    ]),
    blockedBy,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      registryAuthRequiresHumanSecretInput: true,
      catalogPublishRequiresExplicitApproval: true
    },
    risk:
      "Catalog build and publication can drift from release evidence if registry auth or base-image readability is not proven first.",
    rollbackPath:
      "No rollback is required for registry inspection; remove any incorrect local catalog tag and regenerate catalog toolchain evidence before publication."
  };

  return [
    item({
      id: "registry-admin-fix-catalog-base-image-auth",
      owner: "registry-admin",
      priority: "high",
      source: "releaseEvidenceBundle:catalogToolchain",
      request:
        "Refresh registry.redhat.io credentials so the catalog base image manifest is readable before local catalog build/provenance review.",
      evidenceNeeded:
        `registryAuthConfigured=${String(catalog.registryAuthConfigured === true)} registryBaseReadable=${String(catalog.registryBaseReadable === true)}; docker manifest inspect registry.redhat.io/openshift4/ose-operator-registry-rhel9:v4.18 must pass.`,
      nextCommand: "npm run verify:catalog-toolchain",
      setupCommands,
      readOnlyCommands,
      catalogToolchainTicketPacket,
      blockedBy,
      acceptance: ["AC-CERT-001"]
    })
  ];
}

function artifactStatusLine(artifact) {
  return `status=${artifact?.status ?? artifact?.evidenceState ?? "missing"} head=${artifactRef(artifact).headSha ?? "missing"} dirty=${String(artifactRef(artifact).worktreeDirty ?? "unknown")}`;
}

function runtimeReadinessDiagnostics(runtimeReadiness) {
  const vector = runtimeReadiness?.runtime?.vectorStore ?? {};
  const model = runtimeReadiness?.runtime?.modelRuntime ?? {};
  return [
    {
      id: "runtime-readiness-status",
      label: "Runtime readiness",
      value:
        `${artifactStatusLine(runtimeReadiness)} liveProbe=${String(runtimeReadiness?.liveProbeEnabled === true)}`
    },
    {
      id: "runtime-readiness-qdrant",
      label: "Qdrant",
      value:
        `status=${vector.status ?? "missing"} liveProbe=${String(vector.liveProbeEnabled === true)} url=${vector.url ?? "missing"}`
    },
    {
      id: "runtime-readiness-vllm",
      label: "vLLM",
      value:
        `status=${model.status ?? "missing"} liveProbe=${String(model.liveProbeEnabled === true)} url=${model.url ?? "missing"}`
    }
  ];
}

function runtimeRagDiagnostics(runtimeRagContract, runtimeRagFixture) {
  const contractMissing = runtimeRagContract?.missingEvidence ?? [];
  const fixtureMissing = runtimeRagFixture?.missingEvidence ?? [];
  return [
    {
      id: "runtime-rag-contract",
      label: "Runtime RAG contract",
      value:
        `${artifactStatusLine(runtimeRagContract)} defaultMode=${runtimeRagContract?.runtimeRag?.defaultMode ?? "missing"} liveMissing=${contractMissing.length}`
    },
    {
      id: "runtime-rag-fixture",
      label: "Runtime RAG fixture",
      value:
        `${artifactStatusLine(runtimeRagFixture)} evidence=${runtimeRagFixture?.evidence?.length ?? 0} liveStillRequired=${fixtureMissing.length}`
    },
    {
      id: "runtime-rag-live-gap",
      label: "Live RAG gap",
      value: contractMissing.slice(0, 3).join(" | ") || "none"
    },
    {
      id: "runtime-rag-boundary",
      label: "Runtime RAG boundary",
      value:
        `mutationAllowed=${String(runtimeRagFixture?.mutationAllowed === true)} rawDocumentReturned=${String(runtimeRagFixture?.rawDocumentReturned === true)} localFallbackAllowed=true`
    }
  ];
}

function ragProductionReadinessDiagnostics(ragProductionReadiness) {
  const readiness = ragProductionReadiness?.readiness ?? {};
  const components = ragProductionReadiness?.components ?? {};
  return [
    {
      id: "rag-production-readiness-status",
      label: "RAG production readiness",
      value:
        `${artifactStatusLine(ragProductionReadiness)} contractReady=${String(readiness.contractReady === true)} approvalRequired=${String(readiness.approvalRequired === true)}`
    },
    {
      id: "rag-production-queue",
      label: "Production queue",
      value:
        `backend=${components.queue?.backendClass ?? "missing"} contractReady=${String(components.queue?.contractReady === true)} liveReady=${String(components.queue?.liveReady === true)} rawMarkdown=${String(components.queue?.storesRawMarkdown === true)}`
    },
    {
      id: "rag-production-worker",
      label: "Ingestion worker",
      value:
        `mode=${components.ingestionWorker?.mode ?? "missing"} contractReady=${String(components.ingestionWorker?.contractReady === true)} liveReady=${String(components.ingestionWorker?.liveReady === true)} createsJobByVerifier=${String(components.ingestionWorker?.createsKubernetesJobByThisVerifier === true)}`
    },
    {
      id: "rag-production-audit",
      label: "Vector audit sink",
      value:
        `appendOnly=${String(components.vectorWriteAuditSink?.appendOnly === true)} rollbackChunkIds=${String(components.vectorWriteAuditSink?.recordsRollbackChunkIds === true)} liveReady=${String(components.vectorWriteAuditSink?.liveReady === true)}`
    },
    {
      id: "rag-production-boundary",
      label: "Mutation boundary",
      value:
        `clusterMutation=${String(ragProductionReadiness?.clusterMutationAttempted === true)} vectorWrite=${String(ragProductionReadiness?.vectorWriteAttempted === true)} ingestionJob=${String(ragProductionReadiness?.ingestionJobCreated === true)}`
    }
  ];
}

function runtimeLiveItems(
  releaseRefresh,
  runtimeReadiness,
  runtimeRagContract,
  runtimeRagFixture,
  ragProductionReadiness
) {
  const missingEvidence = normalizedEvidence(releaseRefresh?.missingEvidence ?? []);
  const runtimeProbeGaps = missingEvidence.filter((entry) =>
    /runtimeReadiness:.*(?:qdrant|vllm).*live probe/i.test(entry)
  );
  const runtimeRagGaps = missingEvidence.filter((entry) =>
    /runtimeRag|runtimeRagFixture/i.test(entry)
  );
  const ragQueueGaps = missingEvidence.filter((entry) =>
    /ragApprovalQueue:.*(?:production|vector write audit|ingestion worker)|ragProductionReadiness:/i.test(entry)
  );
  const items = [];

  if (runtimeProbeGaps.length > 0) {
    items.push(item({
      id: "runtime-platform-run-live-vllm-qdrant-probes",
      owner: "runtime-platform",
      priority: "high",
      source: "releaseEvidenceRefresh:runtimeReadiness",
      request:
        "Run read-only live probes against the deployed vLLM and Qdrant services before claiming runtime readiness.",
      evidenceNeeded:
        "runtimeReadiness liveProbeEnabled=true with qdrant=ready and vllm=ready against approved runtime endpoints.",
      nextCommand: "npm run verify:runtime -- --live --timeout-ms 30000",
      handoffNextCommands: [
        "set CYWELL_OPSLENS_VECTOR_URL and CYWELL_OPSLENS_MODEL_URL to the approved in-cluster or port-forwarded endpoints",
        "npm run verify:runtime -- --live --timeout-ms 30000"
      ],
      readOnlyCommands: [
        {
          id: "runtime-readiness-live",
          phase: "runtime-live-evidence",
          command: "npm run verify:runtime -- --live --timeout-ms 30000",
          mutation: false,
          requiresNetwork: true,
          writesLocalEvidence: true
        }
      ],
      blockedBy: runtimeProbeGaps,
      diagnostics: runtimeReadinessDiagnostics(runtimeReadiness),
      acceptance: ["AC-LS-001", "AC-RAG-001"]
    }));
  }

  if (runtimeRagGaps.length > 0) {
    items.push(item({
      id: "data-ml-engineer-prove-runtime-rag-live-quality",
      owner: "data-ml-engineer",
      priority: "high",
      source: "releaseEvidenceRefresh:runtimeRag",
      request:
        "Prove that runtime RAG uses live vLLM embeddings and Qdrant tenant-scoped snippets, then record citation quality evidence.",
      evidenceNeeded:
        "runtimeRag live evidence includes vLLM /v1/embeddings, Qdrant /points/search, tenant-scoped redacted snippets, and citation support for the generated plan.",
      nextCommand: "npm run verify:runtime-rag:fixture",
      handoffNextCommands: [
        "npm run verify:runtime-rag",
        "npm run verify:runtime-rag:fixture",
        "run the deployed API with CYWELL_OPSLENS_RAG_RUNTIME_MODE=hybrid or runtime after live vLLM/Qdrant endpoints are approved"
      ],
      readOnlyCommands: [
        {
          id: "runtime-rag-contract",
          phase: "runtime-rag-evidence",
          command: "npm run verify:runtime-rag",
          mutation: false,
          requiresNetwork: false,
          writesLocalEvidence: true
        },
        {
          id: "runtime-rag-fixture",
          phase: "runtime-rag-evidence",
          command: "npm run verify:runtime-rag:fixture",
          mutation: false,
          requiresNetwork: false,
          writesLocalEvidence: true
        }
      ],
      blockedBy: runtimeRagGaps,
      diagnostics: runtimeRagDiagnostics(runtimeRagContract, runtimeRagFixture),
      acceptance: ["AC-LS-001", "AC-RAG-001", "AC-AIOPS-001"]
    }));
  }

  if (ragQueueGaps.length > 0) {
    items.push(item({
      id: "rag-owner-enable-production-approval-queue",
      owner: "rag-owner",
      priority: "high",
      source: "releaseEvidenceRefresh:ragProductionReadiness",
      request:
        "Review the production RAG approval queue contract, then approve database-backed persistence, ingestion worker, and vector-write audit evidence before any live ingestion.",
      evidenceNeeded:
        "same-head local queue bridge, production database-backed queue approval, ingestion worker approval, append-only vector write audit sink, source-ref retrieval path, and rollback export evidence.",
      nextCommand: "npm run verify:rag:production-readiness",
      handoffNextCommands: [
        "npm run verify:rag:approval-queue",
        "npm run verify:rag:production-readiness",
        "configure production RAG queue persistence and audit sink only after named approvals"
      ],
      readOnlyCommands: [
        {
          id: "rag-approval-queue-contract",
          phase: "rag-approval-queue",
          command: "npm run verify:rag:approval-queue",
          mutation: false,
          requiresNetwork: false,
          writesLocalEvidence: true
        },
        {
          id: "rag-production-readiness",
          phase: "rag-production-readiness",
          command: "npm run verify:rag:production-readiness",
          mutation: false,
          requiresNetwork: false,
          writesLocalEvidence: true
        }
      ],
      approvalGatedCommands: ragProductionReadiness?.approvalGatedCommands ?? [],
      ragProductionTicketPacket: ragProductionReadiness?.ticketPacket,
      blockedBy: ragQueueGaps,
      diagnostics: ragProductionReadinessDiagnostics(ragProductionReadiness),
      acceptance: ["AC-RAG-001", "AC-RAG-002", "AC-DASH-001", "AC-OP-005"]
    }));
  }

  return items;
}

function envContractMutationViolation(envContract) {
  return envContract?.clusterMutationAttempted === true ||
    envContract?.registryMutationAttempted === true ||
    envContract?.vectorWriteAttempted === true ||
    envContract?.ingestionJobCreated === true ||
    envContract?.mutationAllowedByThisVerifier === true ||
    envContract?.policy?.clusterMutationAttempted === true ||
    envContract?.policy?.registryMutationAttempted === true ||
    envContract?.policy?.vectorWriteAttempted === true;
}

function envContractDiagnostics(envContract, currentHeadSha) {
  const audit = envContract?.envAudit ?? {};
  const checks = Array.isArray(envContract?.checks) ? envContract.checks : [];
  const failingChecks = checks
    .filter((check) => check.status !== "PASS")
    .map((check) => check.name ?? check.id ?? "unknown");
  const duplicateActiveKeys = Array.isArray(audit.duplicateActiveKeys)
    ? audit.duplicateActiveKeys
    : [];
  const activeMissingValues = Array.isArray(audit.activeMissingValues)
    ? audit.activeMissingValues
    : [];
  const ref = artifactRef(envContract);
  return [
    {
      id: "env-contract-status",
      label: "Environment contract",
      value:
        `status=${envContract?.status ?? "missing"} ` +
        `actionMode=${envContract?.actionMode ?? "missing"} ` +
        `artifactHead=${ref.headSha ?? "missing"} ` +
        `currentHead=${currentHeadSha} ` +
        `fresh=${String(envContract ? artifactFresh(envContract, currentHeadSha) : false)}`
    },
    {
      id: "env-contract-targets",
      label: "Environment targets",
      value:
        `activeOcpTarget=${String(audit.activeOcpTarget === true)} ` +
        `activeLightspeedTarget=${String(audit.activeLightspeedTarget === true)} ` +
        `activeKeyCount=${audit.activeKeyCount ?? 0} ` +
        `commentedTrackedCount=${audit.commentedTrackedCount ?? 0}`
    },
    {
      id: "env-contract-key-gaps",
      label: "Key gaps",
      value:
        `duplicateActiveKeys=${duplicateActiveKeys.length} ` +
        `activeMissingValues=${activeMissingValues.length} ` +
        `failingChecks=${failingChecks.length}`
    },
    {
      id: "env-contract-boundary",
      label: "Mutation boundary",
      value:
        `clusterMutationAttempted=${String(envContract?.clusterMutationAttempted === true)} ` +
        `registryMutationAttempted=${String(envContract?.registryMutationAttempted === true)} ` +
        `vectorWriteAttempted=${String(envContract?.vectorWriteAttempted === true)} ` +
        `mutationAllowedByThisVerifier=${String(envContract?.mutationAllowedByThisVerifier === true)}`
    }
  ];
}

function envContractItems(envContract, currentHeadSha) {
  const audit = envContract?.envAudit ?? {};
  const checks = Array.isArray(envContract?.checks) ? envContract.checks : [];
  const failingChecks = checks
    .filter((check) => check.status !== "PASS")
    .map((check) => `check:${check.name ?? check.id ?? "unknown"}:${check.status ?? "unknown"}`);
  const duplicateActiveKeys = Array.isArray(audit.duplicateActiveKeys)
    ? audit.duplicateActiveKeys
    : [];
  const activeMissingValues = Array.isArray(audit.activeMissingValues)
    ? audit.activeMissingValues
    : [];
  const gaps = uniqueStrings([
    ...(!envContract ? ["env contract artifact missing"] : []),
    ...(envContract && !artifactFresh(envContract, currentHeadSha)
      ? [`env contract stale head=${artifactRef(envContract).headSha ?? "missing"}`]
      : []),
    ...(envContract?.status !== "PASS"
      ? [`env contract status=${envContract?.status ?? "missing"}`]
      : []),
    ...(envContract?.actionMode !== "localEnvAuditOnly"
      ? [`env contract actionMode=${envContract?.actionMode ?? "missing"}`]
      : []),
    ...(audit.activeOcpTarget !== true ? ["active OCP target keys missing"] : []),
    ...(audit.activeLightspeedTarget !== true ? ["active Lightspeed target keys missing"] : []),
    ...duplicateActiveKeys.map((key) => `duplicate active key ${key}`),
    ...activeMissingValues.map((key) => `active key has no value ${key}`),
    ...failingChecks,
    ...(envContractMutationViolation(envContract)
      ? ["env contract mutation boundary violated"]
      : [])
  ]);

  if (gaps.length === 0) return [];

  const blocker =
    !envContract ||
    envContract.status !== "PASS" ||
    audit.activeOcpTarget !== true ||
    audit.activeLightspeedTarget !== true ||
    duplicateActiveKeys.length > 0 ||
    activeMissingValues.length > 0 ||
    envContractMutationViolation(envContract);

  return [
    item({
      id: "cluster-sre-fix-env-target-isolation",
      owner: "cluster-sre",
      priority: blocker ? "blocker" : "high",
      source: "envContract",
      request:
        "Restore OCP/Lightspeed environment target isolation before live readiness or release review.",
      evidenceNeeded:
        "npm run verify:env writes PASS opslens.env-contract.v0.1 with active OCP and Lightspeed target keys, no duplicate active keys, no missing values, and mutation flags false.",
      nextCommand: "npm run verify:env",
      handoffNextCommands: [
        "npm run verify:env",
        "npm run verify:release-refresh -- --live-timeout-ms 8000"
      ],
      readOnlyCommands: [
        {
          id: "env-contract",
          phase: "environment-isolation",
          command: "npm run verify:env",
          mutation: false,
          requiresNetwork: false,
          writesLocalEvidence: true
        }
      ],
      blockedBy: gaps,
      diagnostics: envContractDiagnostics(envContract, currentHeadSha),
      acceptance: ["AC-ENV-001", "AC-DASH-001", "AC-LS-002", "AC-OCP-001"]
    })
  ];
}

function aiopsMonitoringItems(aiopsIncidentPipeline) {
  const missingEvidence = [
    ...(aiopsIncidentPipeline?.missingEvidence ?? []),
    ...(aiopsIncidentPipeline?.liveSmoke?.missingEvidence ?? []),
    ...(aiopsIncidentPipeline?.liveSmoke?.incident?.missingEvidence ?? []),
    ...(aiopsIncidentPipeline?.liveSmoke?.alertmanagerIntake?.missingEvidence ?? [])
  ];
  const monitoringGaps = uniqueStrings(
    missingEvidence.filter((entry) =>
      /metrics\/|Prometheus|Monitoring service proxy|OCP_ENABLE_MONITORING_PROXY/i.test(entry)
    )
  );

  if (monitoringGaps.length === 0) {
    return [];
  }
  const ticketPacket = aiopsIncidentPipeline?.monitoringProxyTicketPacket;
  const diagnostics = [
    {
      id: "aiops-monitoring-proxy-ticket",
      label: "Monitoring proxy ticket",
      value:
        `ticket=${ticketPacket?.id ?? "missing"} ` +
        `status=${ticketPacket?.handoffStatus ?? "missing"} ` +
        `classification=${ticketPacket?.classification ?? "missing"}`
    },
    {
      id: "aiops-monitoring-queries",
      label: "Prometheus queries",
      value:
        `required=${ticketPacket?.requiredQueries?.length ?? 0} ` +
        `ready=${ticketPacket?.readyQueries?.length ?? 0} ` +
        `missing=${ticketPacket?.missingQueries?.join(",") || "none"}`
    },
    {
      id: "aiops-monitoring-boundary",
      label: "Monitoring mutation boundary",
      value:
        `clusterMutation=${String(ticketPacket?.mutationBoundary?.clusterMutationAttempted === true)} ` +
        `vectorWrite=${String(ticketPacket?.mutationBoundary?.vectorWriteAttempted === true)} ` +
        `approvalRequired=${String(ticketPacket?.mutationBoundary?.monitoringProxyEnableRequiresApproval !== false)}`
    }
  ];

  return [
    item({
      id: "cluster-sre-enable-monitoring-proxy-evidence",
      owner: "cluster-sre",
      priority: "high",
      source: "aiopsIncidentPipeline:metrics",
      request:
        "Configure or approve the read-only OCP monitoring proxy path so OpsLens can correlate Alertmanager alerts with Prometheus samples.",
      evidenceNeeded:
        "verify:aiops shows firing-alert, pod-restarts, pod-cpu, and pod-memory query evidence with OCP_ENABLE_MONITORING_PROXY=true, or records an explicit approved monitoring exception.",
      nextCommand: "npm run verify:aiops",
      handoffNextCommands: [
        "set OCP_ENABLE_MONITORING_PROXY=true only for an approved read-only service proxy path",
        "npm run verify:aiops"
      ],
      readOnlyCommands: [
        {
          id: "aiops-monitoring-proxy-smoke",
          phase: "aiops-monitoring-evidence",
          command: "npm run verify:aiops",
          mutation: false,
          requiresNetwork: true,
          writesLocalEvidence: true
        }
      ],
      aiopsMonitoringTicketPacket: ticketPacket,
      blockedBy: monitoringGaps,
      diagnostics,
      acceptance: ["AC-AIOPS-002", "AC-DASH-001"]
    })
  ];
}

function networkItems(networkHandoff) {
  if (!networkHandoff || ["READY_FOR_LIVE_RECHECK", "PASS"].includes(networkHandoff.status)) {
    return [];
  }
  const classification = ocpClassification(networkHandoff);
  const owner = networkHandoffOwner(classification);
  const handoffCommands = networkHandoff.readOnlyCommands ?? [];
  return [
    item({
      id: networkHandoffId(classification),
      owner,
      priority: "blocker",
      source: "ocpNetworkHandoff",
      request: (networkHandoff.adminRequests ?? []).join(" ") ||
        "Review OCP handoff and restore API readiness.",
      evidenceNeeded: `OCP network handoff classification=${classification} changes to api-ready.`,
      nextCommand: "npm run evidence:ocp-network-handoff",
      handoffNextCommands: uniqueStrings([
        ...networkTicketNextCommands(networkHandoff),
        ...handoffCommands
          .map((command) => command.command)
          .filter(Boolean)
      ]),
      readOnlyCommands: handoffCommands,
      approvalGatedCommands: networkTicketApprovalCommands(networkHandoff),
      blockedBy: networkHandoff.missingEvidence ?? [],
      diagnostics: ocpNetworkDiagnostics(networkHandoff),
      ticketPacket: networkTicketPacket(networkHandoff),
      acceptance: ["AC-OCP-001", "AC-LIVE-HANDOFF-001"]
    })
  ];
}

function ocpAuthRbacItems(authRbacPlan) {
  if (!authRbacPlan || ["READY_FOR_LIVE_CHECK", "PASS"].includes(authRbacPlan.status)) {
    return [];
  }
  const classification = authRbacPlan.diagnostics?.classification ?? "unknown";
  if (authRbacPlan.status === "AUTH_RBAC_APPROVAL_REQUIRED") {
    return [
      item({
        id: "cluster-admin-approve-ocp-live-reader-rbac",
        owner: "cluster-admin",
        priority: "blocker",
        source: "ocpAuthRbacPlan",
        request:
          (authRbacPlan.adminRequests ?? []).join(" ") ||
          "Review and approve the Cywell OpsLens live evidence reader RBAC manifest for the current OCP auth/RBAC gap.",
        evidenceNeeded:
          `OCP auth/RBAC plan classification=${classification}; manifest excludes secrets, grants only get/list/watch, dry-run/can-i evidence passes, and connectivity becomes api-ready.`,
        nextCommand: "npm run evidence:ocp-auth-rbac-plan",
        handoffNextCommands: authRbacHandoffCommands(authRbacPlan),
        readOnlyCommands: authRbacPlan.readOnlyCommands ?? [],
        approvalGatedCommands: authRbacPlan.approvalGatedCommands ?? [],
        blockedBy: authRbacPlan.missingEvidence ?? [],
        acceptance: ["AC-OCP-001", "AC-OCP-RBAC-001", "AC-LIVE-HANDOFF-001"]
      })
    ];
  }
  return [
    item({
      id: "cluster-admin-review-ocp-auth-rbac-plan-gap",
      owner: authLikeOcpClassification(classification) ? "cluster-admin" : "cluster-sre",
      priority: authLikeOcpClassification(classification) ? "blocker" : "high",
      source: "ocpAuthRbacPlan",
      request: `Review OCP auth/RBAC plan status=${authRbacPlan.status ?? "unknown"} classification=${classification}.`,
      evidenceNeeded:
        "OCP auth/RBAC plan reaches READY_FOR_LIVE_CHECK or AUTH_RBAC_APPROVAL_REQUIRED with clean read-only RBAC validation.",
      nextCommand: "npm run evidence:ocp-auth-rbac-plan",
      handoffNextCommands: authRbacHandoffCommands(authRbacPlan),
      readOnlyCommands: authRbacPlan.readOnlyCommands ?? [],
      approvalGatedCommands: authRbacPlan.approvalGatedCommands ?? [],
      blockedBy: authRbacPlan.missingEvidence ?? [],
      acceptance: ["AC-OCP-RBAC-001", "AC-LIVE-HANDOFF-001"]
    })
  ];
}

function buildItems(artifacts, currentHeadSha) {
  return uniqueByKey(
    [
      ...envContractItems(artifacts.envContract, currentHeadSha),
      ...checkpointItems(
        artifacts.checkpoint,
        artifacts.ocpNetworkHandoff,
        artifacts.certificationReadiness,
        artifacts.ocpAuthRbacPlan,
        artifacts.lightspeedReadiness,
        artifacts.ocpLiveReaderSmoke,
        artifacts.releasePlan,
        artifacts.installPlan,
        artifacts.externalRuntimeReview
      ),
      ...externalRuntimeItems(artifacts.externalRuntimeReview),
      ...securityScanItems(artifacts.securityScanPlan),
      ...bundleDecisionItems(artifacts.releaseBundle),
      ...catalogToolchainItems(artifacts.releaseBundle),
      ...runtimeLiveItems(
        artifacts.releaseRefresh,
        artifacts.runtimeReadiness,
        artifacts.runtimeRagContract,
        artifacts.runtimeRagFixture,
        artifacts.ragProductionReadiness
      ),
      ...aiopsMonitoringItems(artifacts.aiopsIncidentPipeline),
      ...networkItems(artifacts.ocpNetworkHandoff),
      ...ocpAuthRbacItems(artifacts.ocpAuthRbacPlan)
    ],
    (entry) => `${entry.id}:${entry.owner}`
  );
}

function ownerSummary(items) {
  const owners = new Map();
  for (const entry of items) {
    const current = owners.get(entry.owner) ?? {
      owner: entry.owner,
      open: 0,
      blocker: 0,
      high: 0,
      normal: 0,
      itemIds: []
    };
    current.open += 1;
    current[entry.priority] = (current[entry.priority] ?? 0) + 1;
    current.itemIds.push(entry.id);
    owners.set(entry.owner, current);
  }
  return Array.from(owners.values()).sort((a, b) => {
    if (b.blocker !== a.blocker) return b.blocker - a.blocker;
    if (b.high !== a.high) return b.high - a.high;
    return a.owner.localeCompare(b.owner);
  });
}

const actionPriorityRank = {
  blocker: 0,
  high: 1,
  normal: 2
};

function firstOwnerAction(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const priorityDelta =
        (actionPriorityRank[a.entry.priority] ?? 99) -
        (actionPriorityRank[b.entry.priority] ?? 99);
      return priorityDelta || a.index - b.index;
    })[0]?.entry;
}

const criticalPathLaneOrder = [
  "live-ocp-lightspeed",
  "external-runtime-review",
  "certification-toolchain",
  "release-publish",
  "install-approval",
  "security-review",
  "rag-production",
  "aiops-monitoring"
];

const criticalPathLabels = {
  "live-ocp-lightspeed": "Live OCP and Lightspeed reachability",
  "external-runtime-review": "External runtime evidence and mirroring",
  "certification-toolchain": "Certification and catalog toolchain",
  "release-publish": "Release publish approval",
  "install-approval": "Install approval and OLSConfig registration",
  "security-review": "Security scan and final review",
  "rag-production": "RAG production ingestion approval",
  "aiops-monitoring": "AI Ops monitoring proxy evidence"
};

function criticalPathLane(entry) {
  const text = `${entry.id} ${entry.source} ${entry.owner}`.toLowerCase();
  if (/(ocp|lightspeed|network|live-handoff)/.test(text)) return "live-ocp-lightspeed";
  if (/external-runtime|externalruntime/.test(text)) return "external-runtime-review";
  if (/certification|catalog-toolchain|tooling|opm|operator-sdk/.test(text)) return "certification-toolchain";
  if (/release-publish|publish-decision|refresh-publish/.test(text)) return "release-publish";
  if (/install-plan|install-decision|refresh-install/.test(text)) return "install-approval";
  if (/security-review|security-scan/.test(text)) return "security-review";
  if (/rag-production|rag-owner|ingestion/.test(text)) return "rag-production";
  if (/aiops|monitoring-proxy/.test(text)) return "aiops-monitoring";
  return undefined;
}

function criticalPath(items) {
  const byLane = new Map();
  for (const [index, entry] of items.entries()) {
    const lane = criticalPathLane(entry);
    if (!lane) continue;
    const current = byLane.get(lane);
    const currentRank = current ? actionPriorityRank[current.entry.priority] ?? 99 : 99;
    const nextRank = actionPriorityRank[entry.priority] ?? 99;
    if (!current || nextRank < currentRank || (nextRank === currentRank && index < current.index)) {
      byLane.set(lane, { entry, index });
    }
  }
  return criticalPathLaneOrder
    .map((lane) => {
      const match = byLane.get(lane);
      if (!match) return undefined;
      const entry = match.entry;
      return {
        lane,
        label: criticalPathLabels[lane],
        owner: entry.owner,
        priority: entry.priority,
        actionId: entry.id,
        source: entry.source,
        request: entry.request,
        evidenceNeeded: entry.evidenceNeeded,
        nextCommand: entry.nextCommand,
        blockedBy: uniqueStrings(entry.blockedBy ?? []).slice(0, 6),
        diagnostics: entry.diagnostics.slice(0, 6).map((diagnostic) => diagnostic.id),
        missingRequiredTools: uniqueStrings(entry.missingRequiredTools ?? []),
        setupCommandIds: (entry.setupCommands ?? [])
          .map((command) => command.id)
          .filter(Boolean),
        readOnlyCommandIds: (entry.readOnlyCommands ?? [])
          .map((command) => command.id)
          .filter(Boolean),
        approvalGatedCommandIds: (entry.approvalGatedCommands ?? [])
          .map((command) => command.id)
          .filter(Boolean),
        acceptance: uniqueStrings(entry.acceptance ?? []),
        ticketPacket: entry.ticketPacket
          ? sanitizeTicketPacket(entry.ticketPacket)
          : undefined,
        externalRuntimeTicketPacket: entry.externalRuntimeTicketPacket
          ? sanitizeExternalRuntimeTicketPacket(entry.externalRuntimeTicketPacket)
          : undefined,
        securityReviewTicketPacket: entry.securityReviewTicketPacket
          ? sanitizeSecurityReviewTicketPacket(entry.securityReviewTicketPacket)
          : undefined,
        releasePublishTicketPacket: entry.releasePublishTicketPacket
          ? sanitizeReleasePublishTicketPacket(entry.releasePublishTicketPacket)
          : undefined,
        installApprovalTicketPacket: entry.installApprovalTicketPacket
          ? sanitizeInstallApprovalTicketPacket(entry.installApprovalTicketPacket)
          : undefined,
        catalogToolchainTicketPacket: entry.catalogToolchainTicketPacket
          ? sanitizeCatalogToolchainTicketPacket(entry.catalogToolchainTicketPacket)
          : undefined,
        certificationToolingTicketPacket: entry.certificationToolingTicketPacket
          ? sanitizeCertificationToolingTicketPacket(entry.certificationToolingTicketPacket)
          : undefined,
        ragProductionTicketPacket: entry.ragProductionTicketPacket
          ? sanitizeRagProductionTicketPacket(entry.ragProductionTicketPacket)
          : undefined,
        aiopsMonitoringTicketPacket: entry.aiopsMonitoringTicketPacket
          ? sanitizeAiopsMonitoringTicketPacket(entry.aiopsMonitoringTicketPacket)
          : undefined
      };
    })
    .filter(Boolean);
}

function buildOwnerPackets(owners, items) {
  return owners.map((owner) => {
    const entries = items.filter((entry) => entry.owner === owner.owner);
    const firstAction = firstOwnerAction(entries);
    const firstTicketPacket = entries.find((entry) => entry.ticketPacket)?.ticketPacket;
    const firstExternalRuntimeTicketPacket = entries.find(
      (entry) => entry.externalRuntimeTicketPacket
    )?.externalRuntimeTicketPacket;
    const firstSecurityReviewTicketPacket = entries.find(
      (entry) => entry.securityReviewTicketPacket
    )?.securityReviewTicketPacket;
    const firstReleasePublishTicketPacket = entries.find(
      (entry) => entry.releasePublishTicketPacket
    )?.releasePublishTicketPacket;
    const firstInstallApprovalTicketPacket = entries.find(
      (entry) => entry.installApprovalTicketPacket
    )?.installApprovalTicketPacket;
    const firstCatalogToolchainTicketPacket = entries.find(
      (entry) => entry.catalogToolchainTicketPacket
    )?.catalogToolchainTicketPacket;
    const firstCertificationToolingTicketPacket = entries.find(
      (entry) => entry.certificationToolingTicketPacket
    )?.certificationToolingTicketPacket;
    const firstRagProductionTicketPacket = entries.find(
      (entry) => entry.ragProductionTicketPacket
    )?.ragProductionTicketPacket;
    const firstAiopsMonitoringTicketPacket = entries.find(
      (entry) => entry.aiopsMonitoringTicketPacket
    )?.aiopsMonitoringTicketPacket;
    return {
      owner: owner.owner,
      status: owner.blocker > 0 ? "blocker" : owner.open > 0 ? "open" : "clear",
      markdownPath: resolve(options.ownerPacketsDir, `${ownerSlug(owner.owner)}.md`),
      open: owner.open,
      blocker: owner.blocker,
      high: owner.high,
      normal: owner.normal,
      itemIds: entries.map((entry) => entry.id),
      firstActionId: firstAction?.id ?? "none",
      firstActionPriority: firstAction?.priority ?? "normal",
      firstActionSource: firstAction?.source ?? "none",
      firstActionRequest: firstAction?.request ?? "none",
      firstNextCommand: firstAction?.nextCommand ?? "none",
      firstEvidenceNeeded: firstAction?.evidenceNeeded ?? "none",
      firstBlockedBy: uniqueStrings(firstAction?.blockedBy ?? []).slice(0, 6),
      firstTicketPacket,
      firstExternalRuntimeTicketPacket,
      firstSecurityReviewTicketPacket,
      firstReleasePublishTicketPacket,
      firstInstallApprovalTicketPacket,
      firstCatalogToolchainTicketPacket,
      firstCertificationToolingTicketPacket,
      firstRagProductionTicketPacket,
      firstAiopsMonitoringTicketPacket,
      nextCommands: uniqueStrings(
        entries.flatMap((entry) => [
          entry.nextCommand,
          ...entry.handoffNextCommands
        ])
      ),
      setupCommandIds: uniqueStrings(
        entries.flatMap((entry) => entry.setupCommands.map((command) => command.id))
      ),
      readOnlyCommandIds: uniqueStrings(
        entries.flatMap((entry) => entry.readOnlyCommands.map((command) => command.id))
      ),
      approvalGatedCommandIds: uniqueStrings(
        entries.flatMap((entry) => entry.approvalGatedCommands.map((command) => command.id))
      ),
      missingRequiredTools: uniqueStrings(
        entries.flatMap((entry) => entry.missingRequiredTools)
      ),
      blockedBy: uniqueStrings(entries.flatMap((entry) => entry.blockedBy ?? [])),
      acceptance: uniqueStrings(entries.flatMap((entry) => entry.acceptance ?? [])),
      mutationAllowedByThisVerifier: false
    };
  });
}

async function cleanupOwnerPacketDirectory(expectedPaths) {
  const ownerPacketsDir = resolve(options.ownerPacketsDir);
  const expectedNames = new Set(expectedPaths.map((path) => basename(path)));
  if (!insideWorkspace(ownerPacketsDir)) {
    fail("release action queue owner packet cleanup", `${ownerPacketsDir} is outside workspace`);
    return {
      dir: ownerPacketsDir,
      staleRemoved: [],
      expectedFiles: [...expectedNames],
      deletionAllowed: false
    };
  }

  await mkdir(ownerPacketsDir, { recursive: true });
  const staleRemoved = [];
  const entries = await readdir(ownerPacketsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || expectedNames.has(entry.name)) {
      continue;
    }
    await unlink(resolve(ownerPacketsDir, entry.name));
    staleRemoved.push(entry.name);
  }
  pass(
    "release action queue owner packet cleanup",
    staleRemoved.length > 0
      ? `removed stale owner packet(s): ${staleRemoved.join(", ")}`
      : "no stale owner packets found"
  );
  return {
    dir: ownerPacketsDir,
    staleRemoved,
    expectedFiles: [...expectedNames],
    deletionAllowed: true
  };
}

function markdownFor(queue) {
  const lines = [
    "# Cywell OpsLens Release Action Queue",
    "",
    `Generated: ${queue.generatedAt}`,
    `Git: ${queue.ref.branch} ${queue.ref.headSha} dirty=${queue.ref.worktreeDirty}`,
    "",
    "## Current Decision",
    "",
    `- Status: ${queue.status}`,
    `- Action mode: ${queue.actionMode}`,
    `- Open items: ${queue.items.length}`,
    `- Mutation boundary passed: ${queue.mutationBoundary.passed}`,
    "",
    "## Release Critical Path",
    "",
    ...queue.criticalPath.map((entry) =>
      `- ${entry.lane}: owner=${entry.owner}, priority=${entry.priority}, action=${entry.actionId}, next=${entry.nextCommand}, tools=${entry.missingRequiredTools.join(",") || "none"}, setup=${entry.setupCommandIds.join(",") || "none"}, readOnly=${entry.readOnlyCommandIds.join(",") || "none"}, approval=${entry.approvalGatedCommandIds.join(",") || "none"}, ticket=${entry.ticketPacket?.id ?? "none"}, extTicket=${entry.externalRuntimeTicketPacket?.id ?? "none"}, securityTicket=${entry.securityReviewTicketPacket?.id ?? "none"}, publishTicket=${entry.releasePublishTicketPacket?.id ?? "none"}, installTicket=${entry.installApprovalTicketPacket?.id ?? "none"}, catalogTicket=${entry.catalogToolchainTicketPacket?.id ?? "none"}, certTicket=${entry.certificationToolingTicketPacket?.id ?? "none"}, ragTicket=${entry.ragProductionTicketPacket?.id ?? "none"}, aiopsTicket=${entry.aiopsMonitoringTicketPacket?.id ?? "none"}`
    ),
    "",
    "## Owner Summary",
    "",
    ...queue.owners.map((owner) =>
      `- ${owner.owner}: open=${owner.open}, blocker=${owner.blocker}, high=${owner.high}`
    ),
    "",
    "## Owner Packets",
    "",
    ...queue.ownerPackets.map((packet) =>
      `- ${packet.owner}: ${packet.markdownPath} open=${packet.open}, blocker=${packet.blocker}, approvalGated=${packet.approvalGatedCommandIds.length}, first=${packet.firstActionId}, next=${packet.firstNextCommand}, securityTicket=${packet.firstSecurityReviewTicketPacket?.id ?? "none"}, publishTicket=${packet.firstReleasePublishTicketPacket?.id ?? "none"}, installTicket=${packet.firstInstallApprovalTicketPacket?.id ?? "none"}, catalogTicket=${packet.firstCatalogToolchainTicketPacket?.id ?? "none"}, ragTicket=${packet.firstRagProductionTicketPacket?.id ?? "none"}, aiopsTicket=${packet.firstAiopsMonitoringTicketPacket?.id ?? "none"}`
    ),
    "",
    "## Owner Packet Cleanup",
    "",
    `- Directory: ${queue.ownerPacketCleanup.dir}`,
    `- Expected files: ${queue.ownerPacketCleanup.expectedFiles.join(", ")}`,
    `- Stale removed: ${queue.ownerPacketCleanup.staleRemoved.join(", ") || "none"}`,
    `- Deletion allowed: ${String(queue.ownerPacketCleanup.deletionAllowed)}`,
    "",
    "## Open Actions",
    ""
  ];

  for (const entry of queue.items) {
    lines.push(
      `### ${entry.id}`,
      "",
      `- Owner: ${entry.owner}`,
      `- Priority: ${entry.priority}`,
      `- Source: ${entry.source}`,
      `- Request: ${entry.request}`,
      `- Evidence needed: ${entry.evidenceNeeded}`,
      `- Next command: ${entry.nextCommand}`
    );
    for (const diagnostic of entry.diagnostics.slice(0, 6)) {
      lines.push(`- Diagnostic ${diagnostic.id}: ${diagnostic.value}`);
    }
    if (entry.missingRequiredTools.length > 0) {
      lines.push(`- Missing required tools: ${entry.missingRequiredTools.join(", ")}`);
    }
    for (const command of entry.handoffNextCommands.slice(0, 4)) {
      lines.push(`- Handoff next: ${command}`);
    }
    for (const command of entry.setupCommands.slice(0, 4)) {
      lines.push(`- Setup: ${command.id}: ${command.command}`);
    }
    for (const command of entry.readOnlyCommands.slice(0, 4)) {
      lines.push(`- Read-only handoff: ${command.id}: ${command.command}`);
    }
    for (const command of entry.approvalGatedCommands.slice(0, 4)) {
      lines.push(`- Approval-gated handoff: ${command.id}: ${command.command}`);
    }
    lines.push("");
  }

  lines.push(
    "## Read-Only Commands",
    "",
    ...queue.readOnlyCommands.slice(0, 40).map((command) => `- ${command.id}: ${command.command}`),
    "",
    "## Approval-Gated Commands Not Run",
    "",
    ...queue.approvalGatedCommands.slice(0, 40).map((command) => `- ${command.id}: ${command.command}`),
    "",
    "## Mutation Boundary",
    "",
    "- This queue does not apply, delete, patch, scale, push, mirror, copy, sign, approve, or promote anything.",
    "- Approval-gated commands are listed only so owners know which explicit approvals remain required.",
    "- Regenerate the queue after any source evidence artifact changes.",
    ""
  );
  return lines.join("\n");
}

function ownerPacketMarkdown(queue, packet) {
  const entries = queue.items.filter((entry) => entry.owner === packet.owner);
  const approvalCommands = uniqueByKey(
    entries.flatMap((entry) => entry.approvalGatedCommands),
    (command) => `${command.id}:${command.command}`
  );
  const readOnlyHandoffCommands = uniqueByKey(
    entries.flatMap((entry) => entry.readOnlyCommands),
    (command) => `${command.id}:${command.command}`
  );
  const lines = [
    `# Cywell OpsLens Action Packet: ${packet.owner}`,
    "",
    `Generated: ${queue.generatedAt}`,
    `Git: ${queue.ref.branch} ${queue.ref.headSha} dirty=${queue.ref.worktreeDirty}`,
    `Queue status: ${queue.status}`,
    `Owner status: ${packet.status}`,
    "",
    "## Summary",
    "",
    `- Open: ${packet.open}`,
    `- Blocker: ${packet.blocker}`,
    `- High: ${packet.high}`,
    `- First action: ${packet.firstActionId} (${packet.firstActionPriority})`,
    `- First next command: ${packet.firstNextCommand}`,
    `- First evidence needed: ${packet.firstEvidenceNeeded}`,
    `- First blocked by: ${packet.firstBlockedBy.join("; ") || "none"}`,
    `- First ticket: ${packet.firstTicketPacket?.id ?? "none"}`,
    `- First external runtime ticket: ${packet.firstExternalRuntimeTicketPacket?.id ?? "none"}`,
    `- First security review ticket: ${packet.firstSecurityReviewTicketPacket?.id ?? "none"}`,
    `- First release publish ticket: ${packet.firstReleasePublishTicketPacket?.id ?? "none"}`,
    `- First install approval ticket: ${packet.firstInstallApprovalTicketPacket?.id ?? "none"}`,
    `- First catalog toolchain ticket: ${packet.firstCatalogToolchainTicketPacket?.id ?? "none"}`,
    `- First certification tooling ticket: ${packet.firstCertificationToolingTicketPacket?.id ?? "none"}`,
    `- First RAG production ticket: ${packet.firstRagProductionTicketPacket?.id ?? "none"}`,
    `- First AI Ops monitoring ticket: ${packet.firstAiopsMonitoringTicketPacket?.id ?? "none"}`,
    `- Missing tools: ${packet.missingRequiredTools.join(", ") || "none"}`,
    `- Acceptance: ${packet.acceptance.join(", ") || "none"}`,
    "",
    ...(packet.firstTicketPacket
      ? [
          "## Ticket Packet",
          "",
          `- ID: ${packet.firstTicketPacket.id}`,
          `- Title: ${packet.firstTicketPacket.title}`,
          `- Severity: ${packet.firstTicketPacket.severity}`,
          `- Target: ${packet.firstTicketPacket.redactedTarget}`,
          `- First read-only action: ${packet.firstTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstExternalRuntimeTicketPacket
      ? [
          "## External Runtime Ticket Packet",
          "",
          `- ID: ${packet.firstExternalRuntimeTicketPacket.id}`,
          `- Title: ${packet.firstExternalRuntimeTicketPacket.title}`,
          `- Severity: ${packet.firstExternalRuntimeTicketPacket.severity}`,
          `- Image: ${packet.firstExternalRuntimeTicketPacket.sourceImage}`,
          `- Desired mirror: ${packet.firstExternalRuntimeTicketPacket.desiredMirror}`,
          `- Classification: ${packet.firstExternalRuntimeTicketPacket.classification}`,
          `- Registry auth required: ${String(packet.firstExternalRuntimeTicketPacket.registryAuthBoundary?.authRequired ?? false)}`,
          `- Human credential input required: ${String(packet.firstExternalRuntimeTicketPacket.registryAuthBoundary?.humanCredentialInputRequired ?? false)}`,
          `- Credential stored by verifier: ${String(packet.firstExternalRuntimeTicketPacket.registryAuthBoundary?.credentialStoredByVerifier ?? false)}`,
          `- Registry login executed by verifier: ${String(packet.firstExternalRuntimeTicketPacket.registryAuthBoundary?.registryLoginExecutedByVerifier ?? false)}`,
          `- First human setup action: ${packet.firstExternalRuntimeTicketPacket.registryAuthBoundary?.firstHumanSetupAction ?? "not-required"}`,
          `- First read-only action: ${packet.firstExternalRuntimeTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstExternalRuntimeTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstExternalRuntimeTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstExternalRuntimeTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstSecurityReviewTicketPacket
      ? [
          "## Security Review Ticket Packet",
          "",
          `- ID: ${packet.firstSecurityReviewTicketPacket.id}`,
          `- Title: ${packet.firstSecurityReviewTicketPacket.title}`,
          `- Severity: ${packet.firstSecurityReviewTicketPacket.severity}`,
          `- Image: ${packet.firstSecurityReviewTicketPacket.image}`,
          `- Classification: ${packet.firstSecurityReviewTicketPacket.classification}`,
          `- Draft status: ${packet.firstSecurityReviewTicketPacket.draftStatus}`,
          `- Evidence state: ${packet.firstSecurityReviewTicketPacket.evidenceState}`,
          `- Final evidence file: ${packet.firstSecurityReviewTicketPacket.finalEvidenceFile}`,
          `- First read-only action: ${packet.firstSecurityReviewTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstSecurityReviewTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstSecurityReviewTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstSecurityReviewTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstReleasePublishTicketPacket
      ? [
          "## Release Publish Ticket Packet",
          "",
          `- ID: ${packet.firstReleasePublishTicketPacket.id}`,
          `- Title: ${packet.firstReleasePublishTicketPacket.title}`,
          `- Severity: ${packet.firstReleasePublishTicketPacket.severity}`,
          `- Classification: ${packet.firstReleasePublishTicketPacket.classification}`,
          `- Publish status: ${packet.firstReleasePublishTicketPacket.publishStatus}`,
          `- Required approvals: ${packet.firstReleasePublishTicketPacket.requiredApprovals.join(", ")}`,
          `- First read-only action: ${packet.firstReleasePublishTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstReleasePublishTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstReleasePublishTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstReleasePublishTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstInstallApprovalTicketPacket
      ? [
          "## Install Approval Ticket Packet",
          "",
          `- ID: ${packet.firstInstallApprovalTicketPacket.id}`,
          `- Title: ${packet.firstInstallApprovalTicketPacket.title}`,
          `- Severity: ${packet.firstInstallApprovalTicketPacket.severity}`,
          `- Classification: ${packet.firstInstallApprovalTicketPacket.classification}`,
          `- Install status: ${packet.firstInstallApprovalTicketPacket.installStatus}`,
          `- Required approvals: ${packet.firstInstallApprovalTicketPacket.requiredApprovals.join(", ")}`,
          `- First read-only action: ${packet.firstInstallApprovalTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstInstallApprovalTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstInstallApprovalTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstInstallApprovalTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstCatalogToolchainTicketPacket
      ? [
          "## Catalog Toolchain Ticket Packet",
          "",
          `- ID: ${packet.firstCatalogToolchainTicketPacket.id}`,
          `- Title: ${packet.firstCatalogToolchainTicketPacket.title}`,
          `- Severity: ${packet.firstCatalogToolchainTicketPacket.severity}`,
          `- Classification: ${packet.firstCatalogToolchainTicketPacket.classification}`,
          `- Catalog status: ${packet.firstCatalogToolchainTicketPacket.catalogStatus}`,
          `- Registry auth configured: ${String(packet.firstCatalogToolchainTicketPacket.registryAuthConfigured)}`,
          `- Registry base readable: ${String(packet.firstCatalogToolchainTicketPacket.registryBaseReadable)}`,
          `- First read-only action: ${packet.firstCatalogToolchainTicketPacket.firstReadOnlyAction.id}`,
          `- Setup action: ${packet.firstCatalogToolchainTicketPacket.setupAction.id}`,
          `- Human secret input: ${String(packet.firstCatalogToolchainTicketPacket.setupAction.requiresHumanSecretInput)}`,
          `- Local artifact action: ${packet.firstCatalogToolchainTicketPacket.localArtifactAction.id}`,
          `- Approval-gated action: ${packet.firstCatalogToolchainTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstCatalogToolchainTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstCertificationToolingTicketPacket
      ? [
          "## Certification Tooling Ticket Packet",
          "",
          `- ID: ${packet.firstCertificationToolingTicketPacket.id}`,
          `- Title: ${packet.firstCertificationToolingTicketPacket.title}`,
          `- Severity: ${packet.firstCertificationToolingTicketPacket.severity}`,
          `- Classification: ${packet.firstCertificationToolingTicketPacket.classification}`,
          `- Tooling status: ${packet.firstCertificationToolingTicketPacket.toolingStatus}`,
          `- Runner evidence: ${packet.firstCertificationToolingTicketPacket.runnerEvidenceStatus}`,
          `- First read-only action: ${packet.firstCertificationToolingTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstCertificationToolingTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Setup action: ${packet.firstCertificationToolingTicketPacket.setupAction.id}`,
          `- Human setup approval: ${String(packet.firstCertificationToolingTicketPacket.setupAction.requiresHumanApproval)}`,
          `- Approval-gated action: ${packet.firstCertificationToolingTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstCertificationToolingTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstRagProductionTicketPacket
      ? [
          "## RAG Production Ticket Packet",
          "",
          `- ID: ${packet.firstRagProductionTicketPacket.id}`,
          `- Title: ${packet.firstRagProductionTicketPacket.title}`,
          `- Severity: ${packet.firstRagProductionTicketPacket.severity}`,
          `- Classification: ${packet.firstRagProductionTicketPacket.classification}`,
          `- Readiness status: ${packet.firstRagProductionTicketPacket.readinessStatus}`,
          `- Required approvals: ${packet.firstRagProductionTicketPacket.requiredApprovals.join(", ")}`,
          `- Queue live: ${String(packet.firstRagProductionTicketPacket.queueLive)}`,
          `- Worker live: ${String(packet.firstRagProductionTicketPacket.ingestionWorkerLive)}`,
          `- Audit sink live: ${String(packet.firstRagProductionTicketPacket.vectorWriteAuditSinkLive)}`,
          `- First read-only action: ${packet.firstRagProductionTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstRagProductionTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstRagProductionTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstRagProductionTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    ...(packet.firstAiopsMonitoringTicketPacket
      ? [
          "## AI Ops Monitoring Ticket Packet",
          "",
          `- ID: ${packet.firstAiopsMonitoringTicketPacket.id}`,
          `- Title: ${packet.firstAiopsMonitoringTicketPacket.title}`,
          `- Severity: ${packet.firstAiopsMonitoringTicketPacket.severity}`,
          `- Classification: ${packet.firstAiopsMonitoringTicketPacket.classification}`,
          `- Handoff status: ${packet.firstAiopsMonitoringTicketPacket.handoffStatus}`,
          `- Required queries: ${packet.firstAiopsMonitoringTicketPacket.requiredQueries.join(", ")}`,
          `- Ready queries: ${packet.firstAiopsMonitoringTicketPacket.readyQueries.join(", ") || "none"}`,
          `- Missing queries: ${packet.firstAiopsMonitoringTicketPacket.missingQueries.join(", ") || "none"}`,
          `- First read-only action: ${packet.firstAiopsMonitoringTicketPacket.firstReadOnlyAction.id}`,
          `- First read-only command: ${packet.firstAiopsMonitoringTicketPacket.firstReadOnlyAction.nextCommand}`,
          `- Approval-gated action: ${packet.firstAiopsMonitoringTicketPacket.approvalGatedAction.id}`,
          `- Approval required: ${String(packet.firstAiopsMonitoringTicketPacket.approvalGatedAction.requiresExplicitApproval)}`,
          ""
        ]
      : []),
    "## Next Commands",
    "",
    ...(packet.nextCommands.length
      ? packet.nextCommands.slice(0, 12).map((command) => `- ${command}`)
      : ["- none"]),
    "",
    "## Approval-Gated Commands Not Run",
    "",
    ...(approvalCommands.length
      ? approvalCommands.map((command) =>
          `- ${command.id}: ${command.command} (requiresExplicitApproval=${String(command.requiresExplicitApproval)})`
        )
      : ["- none"]),
    "",
    "## Read-Only Handoff Commands",
    "",
    ...(readOnlyHandoffCommands.length
      ? readOnlyHandoffCommands.slice(0, 20).map((command) =>
          `- ${command.id}: ${command.command}`
        )
      : ["- none"]),
    "",
    "## Actions",
    ""
  ];

  for (const entry of entries) {
    lines.push(
      `### ${entry.id}`,
      "",
      `- Priority: ${entry.priority}`,
      `- Source: ${entry.source}`,
      `- Request: ${entry.request}`,
      `- Evidence needed: ${entry.evidenceNeeded}`,
      `- Next command: ${entry.nextCommand}`,
      `- Ticket: ${entry.ticketPacket?.id ?? "none"}`,
      `- External runtime ticket: ${entry.externalRuntimeTicketPacket?.id ?? "none"}`,
      `- Security review ticket: ${entry.securityReviewTicketPacket?.id ?? "none"}`,
      `- Release publish ticket: ${entry.releasePublishTicketPacket?.id ?? "none"}`,
      `- Install approval ticket: ${entry.installApprovalTicketPacket?.id ?? "none"}`,
      `- Catalog toolchain ticket: ${entry.catalogToolchainTicketPacket?.id ?? "none"}`,
      `- Certification tooling ticket: ${entry.certificationToolingTicketPacket?.id ?? "none"}`,
      `- RAG production ticket: ${entry.ragProductionTicketPacket?.id ?? "none"}`,
      `- AI Ops monitoring ticket: ${entry.aiopsMonitoringTicketPacket?.id ?? "none"}`,
      `- Blocked by: ${entry.blockedBy.length ? entry.blockedBy.join("; ") : "none"}`,
      ""
    );
    if (entry.diagnostics.length > 0) {
      lines.splice(
        lines.length - 1,
        0,
        ...entry.diagnostics
          .slice(0, 6)
          .map((diagnostic) => `- Diagnostic ${diagnostic.id}: ${diagnostic.value}`)
      );
    }
  }

  lines.push(
    "## Mutation Boundary",
    "",
    "- This packet is a handoff artifact only.",
    "- It does not apply, delete, patch, scale, push, mirror, copy, sign, approve, promote, or create tokens.",
    "- Approval-gated commands remain not-run until the named owner approves and executes them outside this verifier.",
    ""
  );

  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  else pass("current worktree", `dirty=false head=${headSha}`);

  const artifacts = {
    releaseRefresh: loadJson(options.releaseRefreshEvidence, "release evidence refresh", false),
    releaseBundle: loadJson(options.releaseBundleEvidence, "release evidence bundle", true),
    envContract: loadJson(options.envContract, "environment isolation contract", false),
    aiopsIncidentPipeline: loadJson(options.aiopsIncidentPipeline, "AI Ops incident pipeline", false),
    runtimeReadiness: loadJson(options.runtimeReadiness, "runtime readiness", false),
    runtimeRagContract: loadJson(options.runtimeRagContract, "runtime RAG contract", false),
    runtimeRagFixture: loadJson(options.runtimeRagFixture, "runtime RAG fixture", false),
    ragProductionReadiness: loadJson(options.ragProductionReadiness, "RAG production readiness", false),
    lightspeedReadiness: loadJson(options.lightspeedReadiness, "Lightspeed readiness", false),
    ocpLiveReaderSmoke: loadJson(options.ocpLiveReaderSmoke, "OCP live reader smoke", false),
    checkpoint: loadJson(options.evidenceCheckpoint, "evidence checkpoint", true),
    certificationReadiness: loadJson(options.certificationReadiness, "certification readiness", false),
    securityScanPlan: loadJson(options.securityScanPlan, "security scan plan", false),
    externalRuntimeReview: loadJson(options.externalRuntimeReviewPacket, "external runtime review packet", false),
    ocpNetworkHandoff: loadJson(options.ocpNetworkHandoff, "OCP network handoff", false),
    ocpAuthRbacPlan: loadJson(options.ocpAuthRbacPlan, "OCP auth/RBAC plan", false),
    releasePlan: loadJson(options.releasePlanEvidence, "release publish plan", false),
    installPlan: loadJson(options.installPlanEvidence, "install approval plan", false)
  };

  const sourceArtifacts = [
    sourceSummary("releaseRefresh", "release evidence refresh", options.releaseRefreshEvidence, artifacts.releaseRefresh, headSha),
    sourceSummary("releaseBundle", "release evidence bundle", options.releaseBundleEvidence, artifacts.releaseBundle, headSha, true),
    sourceSummary("envContract", "environment isolation contract", options.envContract, artifacts.envContract, headSha, true),
    sourceSummary("aiopsIncidentPipeline", "AI Ops incident pipeline", options.aiopsIncidentPipeline, artifacts.aiopsIncidentPipeline, headSha),
    sourceSummary("runtimeReadiness", "runtime readiness", options.runtimeReadiness, artifacts.runtimeReadiness, headSha),
    sourceSummary("runtimeRagContract", "runtime RAG contract", options.runtimeRagContract, artifacts.runtimeRagContract, headSha),
    sourceSummary("runtimeRagFixture", "runtime RAG fixture", options.runtimeRagFixture, artifacts.runtimeRagFixture, headSha),
    sourceSummary("ragProductionReadiness", "RAG production readiness", options.ragProductionReadiness, artifacts.ragProductionReadiness, headSha),
    sourceSummary("lightspeedReadiness", "Lightspeed readiness", options.lightspeedReadiness, artifacts.lightspeedReadiness, headSha),
    sourceSummary("ocpLiveReaderSmoke", "OCP live reader smoke", options.ocpLiveReaderSmoke, artifacts.ocpLiveReaderSmoke, headSha),
    sourceSummary("evidenceCheckpoint", "evidence checkpoint", options.evidenceCheckpoint, artifacts.checkpoint, headSha, true),
    sourceSummary("certificationReadiness", "certification readiness", options.certificationReadiness, artifacts.certificationReadiness, headSha),
    sourceSummary("securityScanPlan", "security scan plan", options.securityScanPlan, artifacts.securityScanPlan, headSha),
    sourceSummary("externalRuntimeReviewPacket", "external runtime review packet", options.externalRuntimeReviewPacket, artifacts.externalRuntimeReview, headSha),
    sourceSummary("ocpNetworkHandoff", "OCP network handoff", options.ocpNetworkHandoff, artifacts.ocpNetworkHandoff, headSha),
    sourceSummary("ocpAuthRbacPlan", "OCP auth/RBAC plan", options.ocpAuthRbacPlan, artifacts.ocpAuthRbacPlan, headSha),
    sourceSummary("releasePlan", "release publish plan", options.releasePlanEvidence, artifacts.releasePlan, headSha),
    sourceSummary("installPlan", "install approval plan", options.installPlanEvidence, artifacts.installPlan, headSha)
  ];

  const items = buildItems(artifacts, headSha);
  const owners = ownerSummary(items);
  const ownerPackets = buildOwnerPackets(owners, items);
  const releaseCriticalPath = criticalPath(items);
  const readOnly = readOnlyCommands(artifacts);
  const approvalGated = approvalGatedCommands(artifacts);
  const unsafeReadOnly = readOnly
    .filter((command) => command.mutation === true || commandLooksMutating(command.command))
    .map((command) => command.id);
  if (unsafeReadOnly.length > 0) {
    fail("release action queue command boundary", `read-only commands include mutation: ${unsafeReadOnly.join(", ")}`);
  } else {
    pass("release action queue command boundary", `${readOnly.length} read-only command(s), ${approvalGated.length} approval-gated command(s) not run`);
  }
  const unguardedApproval = approvalGated
    .filter((command) => command.mutation !== true || command.requiresExplicitApproval !== true)
    .map((command) => command.id);
  if (unguardedApproval.length > 0) {
    fail("release action queue approval boundary", `unguarded approval commands=${unguardedApproval.join(", ")}`);
  } else {
    pass("release action queue approval boundary", `${approvalGated.length} approval-gated command(s) remain not-run`);
  }
  if (items.length > 0) {
    pass("release action queue items", `${items.length} open item(s) grouped across ${owners.length} owner(s)`);
  } else {
    warn("release action queue items", "no open items were generated");
  }

  const mutationBoundary = {
    passed:
      artifacts.releaseBundle?.registryMutationAttempted !== true &&
      artifacts.releaseBundle?.clusterMutationAttempted !== true &&
      artifacts.releaseBundle?.mutationAllowedByThisVerifier !== true &&
      artifacts.releaseBundle?.mutationBoundary?.passed !== false &&
      envContractMutationViolation(artifacts.envContract) !== true &&
      artifacts.checkpoint?.registryMutationAttempted !== true &&
      artifacts.checkpoint?.clusterMutationAttempted !== true &&
      artifacts.securityScanPlan?.registryMutationAttempted !== true &&
      artifacts.securityScanPlan?.clusterMutationAttempted !== true &&
      artifacts.securityScanPlan?.mutationAllowedByThisVerifier !== true &&
      artifacts.ragProductionReadiness?.clusterMutationAttempted !== true &&
      artifacts.ragProductionReadiness?.registryMutationAttempted !== true &&
      artifacts.ragProductionReadiness?.mutationAllowedByThisVerifier !== true &&
      artifacts.ragProductionReadiness?.vectorWriteAttempted !== true &&
      artifacts.ragProductionReadiness?.ingestionJobCreated !== true &&
      artifacts.ocpAuthRbacPlan?.registryMutationAttempted !== true &&
      artifacts.ocpAuthRbacPlan?.clusterMutationAttempted !== true &&
      artifacts.ocpAuthRbacPlan?.mutationAllowedByThisVerifier !== true,
    sourceMutationViolations: sourceArtifacts
      .filter((source) => source.mutationViolation)
      .map((source) => source.id)
  };
  if (!mutationBoundary.passed) {
    fail("release action queue mutation boundary", "one or more source artifacts reports mutation flags");
  } else {
    pass("release action queue mutation boundary", "all source mutation flags remain false");
  }

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : "ACTION_QUEUE_READY";
  const queue = {
    schema: "cywell.opslens.release-action-queue.v0.1",
    artifactType: "opslens.release-action-queue.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "actionQueueOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    acceptance: [
      "AC-DASH-001",
      "AC-ENV-001",
      "AC-CERT-001",
      "AC-OP-005",
      "AC-LIVE-HANDOFF-001"
    ],
    sourceArtifacts,
    owners,
    ownerPackets,
    criticalPath: releaseCriticalPath,
    ownerPacketsDir: resolve(options.ownerPacketsDir),
    items,
    readOnlyCommands: readOnly,
    approvalGatedCommands: approvalGated,
    mutationBoundary,
    missingEvidence: normalizedEvidence([
      ...(artifacts.releaseBundle?.missingEvidence ?? []),
      ...(artifacts.envContract?.missingEvidence ?? []),
      // releaseRefresh summarizes a prior action queue run; feeding it back causes stale circular gaps.
      ...(artifacts.checkpoint?.missingEvidence ?? []),
      ...(artifacts.securityScanPlan?.missingEvidence ?? []),
      ...(artifacts.ragProductionReadiness?.missingEvidence ?? []),
      ...items.flatMap((entry) => entry.blockedBy ?? [])
    ]),
    risk: [
      "This queue is an operational review artifact, not an approval record.",
      "Executing any listed approval-gated command without the named human approvals bypasses the release gates.",
      "Network reachability, external runtime final evidence, release approval, and install approval remain independent gates."
    ],
    rollbackPath: [
      "No rollback is required for this queue because it writes only local evidence.",
      "Regenerate the queue after refreshing checkpoint, release bundle, network handoff, or external runtime review evidence.",
      "If an action item is resolved incorrectly, regenerate the upstream evidence and keep release/install status as NEEDS_EVIDENCE."
    ],
    markdownOut: resolve(options.markdownOut),
    checks
  };

  const ownerPacketMarkdowns = queue.ownerPackets.map((packet) => ({
    path: packet.markdownPath,
    markdown: ownerPacketMarkdown(queue, packet)
  }));

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  const ownerPacketCleanup = await cleanupOwnerPacketDirectory(
    ownerPacketMarkdowns.map((packet) => packet.path)
  );
  queue.ownerPacketCleanup = ownerPacketCleanup;

  const serialized = `${JSON.stringify(queue, null, 2)}\n`;
  const markdown = markdownFor(queue);
  if (
    secretLike(serialized) ||
    secretLike(markdown) ||
    ownerPacketMarkdowns.some((packet) => secretLike(packet.markdown))
  ) {
    throw new Error("release action queue would include secret-like material");
  }
  if (
    endpointLeakLike(serialized) ||
    endpointLeakLike(markdown) ||
    ownerPacketMarkdowns.some((packet) => endpointLeakLike(packet.markdown))
  ) {
    throw new Error("release action queue would include an unredacted OCP host or private IP");
  }

  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  for (const packet of ownerPacketMarkdowns) {
    await writeFile(packet.path, packet.markdown, "utf8");
  }
  pass("release action queue export", `${resolve(options.evidenceOut)}, ${resolve(options.markdownOut)}, and ${ownerPacketMarkdowns.length} owner packet(s) written without secret material`);

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens release action queue: status=${status}, items=${items.length}, owners=${queue.owners.length}`);
  if (status === "BLOCKED") process.exitCode = 1;
}

main().catch((error) => {
  fail("release action queue runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] release action queue runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
