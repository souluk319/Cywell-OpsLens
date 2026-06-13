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
  releaseBundleEvidence: "test-results/cywell-opslens-release-evidence-bundle.json",
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
  releaseBundleEvidence:
    parsed.get("release-bundle-evidence") ?? defaults.releaseBundleEvidence,
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
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
    /(?:auth|token|password|passwd|secret|api[_-]?key)(=|:)(?!<redacted>)[^\s]+/i.test(value) ||
    /[?&](?:access_)?token=[^&\s]+/i.test(value) ||
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/i.test(value);
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
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true;

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
  return uniqueByKey(
    [
      ...fixedReadOnlyCommands(),
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
    acceptance
  };
}

function ocpClassification(networkHandoff) {
  return networkHandoff?.diagnostics?.classification ?? "unknown";
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
      nextCommand: "npm run verify:ocp:connectivity",
      acceptance: ["AC-OCP-001", "AC-LIVE-HANDOFF-001"]
    };
  }
  return {
    id: "network-sre-unblock-ocp-api",
    owner: "network-sre",
    priority: "blocker",
    request: "Restore TCP reachability from the verifier workstation or approved bastion to the company OCP API.",
    evidenceNeeded: "OCP connectivity diagnostic classification becomes api-ready.",
    nextCommand: "npm run verify:ocp:connectivity",
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

function checkpointItems(checkpoint, networkHandoff, certificationReadiness, authRbacPlan) {
  const lanes = checkpoint?.lanes ?? [];
  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  const items = [];
  const addIfOpen = (laneId, payload) => {
    const lane = byId.get(laneId);
    if (!lane || lane.status === "pass") return;
    items.push(item({
      ...payload,
      source: `checkpoint:${laneId}`,
      blockedBy: [...(lane.missingEvidence ?? []), ...(lane.blockers ?? [])]
    }));
  };

  addIfOpen("ocpConnectivity", ocpConnectivityAction(networkHandoff, authRbacPlan));
  addIfOpen("lightspeedReadiness", {
    id: "cluster-sre-rerun-lightspeed-readiness",
    owner: "cluster-sre",
    priority: "blocker",
    request: "Rerun live Lightspeed MCP readiness after OCP API reachability is restored.",
    evidenceNeeded: "Lightspeed readiness artifact reaches PASS or a non-network NEEDS_CONFIGURATION classification.",
    nextCommand: "npm run verify:lightspeed -- --timeout-ms 30000",
    acceptance: ["AC-LS-001"]
  });
  addIfOpen("externalRuntime", {
    id: "release-manager-complete-external-runtime-final-evidence",
    owner: "release-manager",
    priority: "high",
    request: "Coordinate final reviewed vLLM/Qdrant evidence files after registry/security/product inputs are complete.",
    evidenceNeeded: "docs/release/evidence/external-runtime/vllm.json and qdrant.json pass verify:external-runtime-plan.",
    nextCommand: "npm run verify:external-runtime-plan",
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
    missingRequiredTools:
      certificationReadiness?.toolingHandoff?.missingRequiredTools ?? [],
    acceptance: ["AC-CERT-001"]
  });
  addIfOpen("releasePublish", {
    id: "release-manager-refresh-publish-plan-after-evidence",
    owner: "release-manager",
    priority: "high",
    request: "Refresh release publish approval plan after external runtime and scan evidence are complete.",
    evidenceNeeded: "Release publish plan status becomes PUBLISH_APPROVAL_REQUIRED with clean same-head evidence.",
    nextCommand: "npm run verify:release-plan",
    acceptance: ["AC-CERT-001"]
  });
  addIfOpen("installPlan", {
    id: "cluster-admin-refresh-install-plan-after-live-evidence",
    owner: "cluster-admin",
    priority: "high",
    request: "Refresh install approval plan after live OCP/Lightspeed evidence and release image evidence are current.",
    evidenceNeeded: "Install approval plan status becomes APPROVAL_REQUIRED with all mutating commands approval-gated.",
    nextCommand: "npm run verify:install-plan",
    acceptance: ["AC-OP-005"]
  });

  return items;
}

function externalRuntimeItems(packet) {
  return (packet?.images ?? []).flatMap((image) => {
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
        blockedBy: image.missingEvidence ?? [],
        acceptance: ["AC-CERT-001"]
      })
    );
    const candidate = image.candidateMatrix;
    const candidateStatus = candidate?.status ?? "missing";
    const candidateReady = ["candidate-ready-for-review", "current-evidence-release-eligible"].includes(candidateStatus);
    const candidateScanCommand =
      `npm run evidence:external-runtime:candidate-scan -- --name ${image.name} --candidate-image <candidate-image> --candidate-label <candidate-label> --execute-docker-fallback`;
    const candidateItem = candidateReady
      ? []
      : [
          item({
            id: `external-runtime-${image.name}-candidate-matrix`,
            owner: "security-reviewer",
            priority: "high",
            source: `externalRuntimeReviewPacket:${image.name}:candidateMatrix`,
            request:
              candidateStatus === "candidate-reduces-risk-but-remediation-required"
                ? `Find or approve a zero-critical ${image.name} replacement candidate before external runtime promotion.`
                : `Scan at least one ${image.name} replacement candidate before external runtime promotion review.`,
            evidenceNeeded: [
              `candidateMatrix status=${candidateStatus}`,
              candidate?.bestCandidate
                ? `best=${candidate.bestCandidate.image} criticalFindings=${candidate.bestCandidate.criticalFindings} highFindings=${candidate.bestCandidate.highFindings}`
                : "best=missing",
              candidate?.recommendation ?? "candidate recommendation missing"
            ].join("; "),
            nextCommand: candidateScanCommand,
            blockedBy: candidate?.missingEvidence ?? image.missingEvidence ?? [],
            acceptance: ["AC-CERT-001"]
          })
        ];
    return [...reviewerItems, ...candidateItem];
  });
}

function securityScanItems(plan) {
  const readOnlyCommands = plan?.commands?.readOnly ?? [];
  const approvalGatedCommands = plan?.commands?.approvalGated ?? [];
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
      const nextCommand =
        reviewDraft.exists === true && reviewDraft.sameHead === true
          ? `npm run evidence:security-review:draft -- --name ${imageName} --reviewer <security-reviewer> --ticket <security-ticket> --force`
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
          `readyForFinalReview=${String(reviewDraft.readyForFinalReview === true)}`,
          `scan=${String(securityEvidence.vulnerabilityReportExists === true)}`,
          `sbom=${String(securityEvidence.sbomExists === true)}`,
          `reviewer=${String(reviewDraft.reviewerProvided === true)}`,
          `ticket=${String(reviewDraft.ticketProvided === true)}`
        ].join("; "),
        nextCommand,
        readOnlyCommands: relevantReadOnly,
        approvalGatedCommands: relevantApprovalGated,
        blockedBy: [
          `${imageName} final security review evidence is not approved/current (${finalReviewState})`,
          ...validationMissingEvidence,
          ...draftMissingEvidence
        ],
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
      handoffNextCommands: handoffCommands
        .map((command) => command.command)
        .filter(Boolean),
      readOnlyCommands: handoffCommands,
      blockedBy: networkHandoff.missingEvidence ?? [],
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

function buildItems(artifacts) {
  return uniqueByKey(
    [
      ...checkpointItems(
        artifacts.checkpoint,
        artifacts.ocpNetworkHandoff,
        artifacts.certificationReadiness,
        artifacts.ocpAuthRbacPlan
      ),
      ...externalRuntimeItems(artifacts.externalRuntimeReview),
      ...securityScanItems(artifacts.securityScanPlan),
      ...bundleDecisionItems(artifacts.releaseBundle),
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

function buildOwnerPackets(owners, items) {
  return owners.map((owner) => {
    const entries = items.filter((entry) => entry.owner === owner.owner);
    return {
      owner: owner.owner,
      status: owner.blocker > 0 ? "blocker" : owner.open > 0 ? "open" : "clear",
      markdownPath: resolve(options.ownerPacketsDir, `${ownerSlug(owner.owner)}.md`),
      open: owner.open,
      blocker: owner.blocker,
      high: owner.high,
      normal: owner.normal,
      itemIds: entries.map((entry) => entry.id),
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
    "## Owner Summary",
    "",
    ...queue.owners.map((owner) =>
      `- ${owner.owner}: open=${owner.open}, blocker=${owner.blocker}, high=${owner.high}`
    ),
    "",
    "## Owner Packets",
    "",
    ...queue.ownerPackets.map((packet) =>
      `- ${packet.owner}: ${packet.markdownPath} open=${packet.open}, blocker=${packet.blocker}, approvalGated=${packet.approvalGatedCommandIds.length}`
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
    `- Missing tools: ${packet.missingRequiredTools.join(", ") || "none"}`,
    `- Acceptance: ${packet.acceptance.join(", ") || "none"}`,
    "",
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
      `- Blocked by: ${entry.blockedBy.length ? entry.blockedBy.join("; ") : "none"}`,
      ""
    );
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
    releaseBundle: loadJson(options.releaseBundleEvidence, "release evidence bundle", true),
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
    sourceSummary("releaseBundle", "release evidence bundle", options.releaseBundleEvidence, artifacts.releaseBundle, headSha, true),
    sourceSummary("evidenceCheckpoint", "evidence checkpoint", options.evidenceCheckpoint, artifacts.checkpoint, headSha, true),
    sourceSummary("certificationReadiness", "certification readiness", options.certificationReadiness, artifacts.certificationReadiness, headSha),
    sourceSummary("securityScanPlan", "security scan plan", options.securityScanPlan, artifacts.securityScanPlan, headSha),
    sourceSummary("externalRuntimeReviewPacket", "external runtime review packet", options.externalRuntimeReviewPacket, artifacts.externalRuntimeReview, headSha),
    sourceSummary("ocpNetworkHandoff", "OCP network handoff", options.ocpNetworkHandoff, artifacts.ocpNetworkHandoff, headSha),
    sourceSummary("ocpAuthRbacPlan", "OCP auth/RBAC plan", options.ocpAuthRbacPlan, artifacts.ocpAuthRbacPlan, headSha),
    sourceSummary("releasePlan", "release publish plan", options.releasePlanEvidence, artifacts.releasePlan, headSha),
    sourceSummary("installPlan", "install approval plan", options.installPlanEvidence, artifacts.installPlan, headSha)
  ];

  const items = buildItems(artifacts);
  const owners = ownerSummary(items);
  const ownerPackets = buildOwnerPackets(owners, items);
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
      artifacts.checkpoint?.registryMutationAttempted !== true &&
      artifacts.checkpoint?.clusterMutationAttempted !== true &&
      artifacts.securityScanPlan?.registryMutationAttempted !== true &&
      artifacts.securityScanPlan?.clusterMutationAttempted !== true &&
      artifacts.securityScanPlan?.mutationAllowedByThisVerifier !== true &&
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
      "AC-CERT-001",
      "AC-OP-005",
      "AC-LIVE-HANDOFF-001"
    ],
    sourceArtifacts,
    owners,
    ownerPackets,
    ownerPacketsDir: resolve(options.ownerPacketsDir),
    items,
    readOnlyCommands: readOnly,
    approvalGatedCommands: approvalGated,
    mutationBoundary,
    missingEvidence: [
      ...(artifacts.releaseBundle?.missingEvidence ?? []),
      ...(artifacts.checkpoint?.missingEvidence ?? []),
      ...(artifacts.securityScanPlan?.missingEvidence ?? []),
      ...items.flatMap((entry) => entry.blockedBy ?? [])
    ].map(sanitize),
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
