#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-evidence-bundle.json",
  markdownOut: "test-results/cywell-opslens-release-evidence-bundle.md",
  mvpGate: "test-results/cywell-opslens-mvp-0.1-gate.json",
  opsBrain: "test-results/cywell-opslens-opsbrain-contract.json",
  envContract: "test-results/cywell-opslens-env-contract.json",
  ocpTargetProfile: "test-results/cywell-opslens-ocp-target-profile.json",
  consolePluginAssets: "test-results/cywell-opslens-console-plugin-assets.json",
  lightspeedExtensionPoint:
    "test-results/cywell-opslens-lightspeed-extension-point.json",
  imageBuild: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  certificationReadiness: "test-results/cywell-opslens-certification-readiness.json",
  communityOperatorSubmission: "test-results/cywell-opslens-community-operator-submission.json",
  catalogToolchain: "test-results/cywell-opslens-catalog-toolchain-plan.json",
  externalRuntime: "test-results/cywell-opslens-external-runtime-images-plan.json",
  externalRuntimeReviewPacket: "test-results/cywell-opslens-external-runtime-review-packet.json",
  securityScan: "test-results/cywell-opslens-security-scan-plan.json",
  securityScanRunner: "test-results/cywell-opslens-security-scan-evidence-runner.json",
  releasePlan: "test-results/cywell-opslens-release-publish-plan.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  lightspeedIntegrationHandoff:
    "test-results/cywell-opslens-lightspeed-integration-handoff.json",
  liveHandoff: "test-results/cywell-opslens-live-evidence-handoff.json",
  ocpNetworkHandoff: "test-results/cywell-opslens-ocp-network-handoff.json",
  ocpNetworkHandoffApiFallback:
    "test-results/cywell-opslens-ocp-network-handoff-api-fallback.json",
  ocpAuthRbacPlan: "test-results/cywell-opslens-ocp-auth-rbac-plan.json",
  operatorPackage: "test-results/cywell-opslens-operator-package.json",
  operatorReconcile: "test-results/cywell-opslens-operator-reconcile.json",
  operatorRuntimeParity: "test-results/cywell-opslens-operator-runtime-parity.json",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
  roadmapPlan: "test-results/cywell-opslens-roadmap-plan-alignment.json",
  releaseActionQueue: "test-results/cywell-opslens-release-action-queue.json",
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
  mvpGate: parsed.get("mvp-gate-evidence") ?? defaults.mvpGate,
  opsBrain: parsed.get("opsbrain-evidence") ?? defaults.opsBrain,
  envContract: parsed.get("env-contract-evidence") ?? defaults.envContract,
  ocpTargetProfile:
    parsed.get("ocp-target-profile-evidence") ?? defaults.ocpTargetProfile,
  consolePluginAssets:
    parsed.get("console-plugin-assets-evidence") ?? defaults.consolePluginAssets,
  lightspeedExtensionPoint:
    parsed.get("lightspeed-extension-point-evidence") ??
    defaults.lightspeedExtensionPoint,
  imageBuild: parsed.get("image-build-evidence") ?? defaults.imageBuild,
  ownedImageProvenance:
    parsed.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenance,
  certificationReadiness:
    parsed.get("certification-readiness-evidence") ?? defaults.certificationReadiness,
  communityOperatorSubmission:
    parsed.get("community-operator-submission-evidence") ?? defaults.communityOperatorSubmission,
  catalogToolchain:
    parsed.get("catalog-toolchain-evidence") ?? defaults.catalogToolchain,
  externalRuntime: parsed.get("external-runtime-evidence") ?? defaults.externalRuntime,
  externalRuntimeReviewPacket:
    parsed.get("external-runtime-review-packet-evidence") ?? defaults.externalRuntimeReviewPacket,
  securityScan: parsed.get("security-scan-evidence") ?? defaults.securityScan,
  securityScanRunner:
    parsed.get("security-scan-runner-evidence") ?? defaults.securityScanRunner,
  releasePlan: parsed.get("release-plan-evidence") ?? defaults.releasePlan,
  installPlan: parsed.get("install-plan-evidence") ?? defaults.installPlan,
  lightspeedIntegrationHandoff:
    parsed.get("lightspeed-integration-handoff-evidence") ??
    defaults.lightspeedIntegrationHandoff,
  liveHandoff: parsed.get("live-handoff-evidence") ?? defaults.liveHandoff,
  ocpNetworkHandoff:
    parsed.get("ocp-network-handoff-evidence") ?? defaults.ocpNetworkHandoff,
  ocpNetworkHandoffApiFallback:
    parsed.get("ocp-network-handoff-api-fallback-evidence") ??
    defaults.ocpNetworkHandoffApiFallback,
  ocpAuthRbacPlan:
    parsed.get("ocp-auth-rbac-plan-evidence") ?? defaults.ocpAuthRbacPlan,
  operatorPackage:
    parsed.get("operator-package-evidence") ?? defaults.operatorPackage,
  operatorReconcile:
    parsed.get("operator-reconcile-evidence") ?? defaults.operatorReconcile,
  operatorRuntimeParity:
    parsed.get("operator-runtime-parity-evidence") ?? defaults.operatorRuntimeParity,
  evidenceCheckpoint:
    parsed.get("evidence-checkpoint") ?? defaults.evidenceCheckpoint,
  roadmapPlan: parsed.get("roadmap-plan-evidence") ?? defaults.roadmapPlan,
  releaseActionQueue:
    parsed.get("release-action-queue-evidence") ?? defaults.releaseActionQueue,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
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
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return {
      ok: true,
      stdout: sanitize(stdout.trim()),
      stderr: sanitize(stderr.trim())
    };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
    };
  }
}

async function gitValue(args, fallback) {
  const result = await runCapture("git", args);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function gitStatusShort() {
  const result = await runCapture("git", ["status", "--short"]);
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function loadJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} evidence is missing at ${absolutePath}`);
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

function sourceSummary(id, label, path, artifact, currentHeadSha, acceptableStatuses) {
  const ref = artifactRef(artifact);
  const status = artifact?.status ?? "missing";
  const fresh = artifact ? artifactFresh(artifact, currentHeadSha) : false;
  const acceptable = artifact && acceptableStatuses.includes(status);
  const mutationViolation =
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true;

  if (!artifact) {
    warn(`${label} source`, `${label} is missing`);
  } else if (!fresh) {
    warn(`${label} source`, `${label} is stale head=${ref.headSha ?? "missing"} dirty=${String(ref.worktreeDirty ?? "unknown")}`);
  } else if (!acceptable) {
    warn(`${label} source`, `${label} status=${status}`);
  } else if (mutationViolation) {
    fail(`${label} source`, `${label} reports forbidden mutation flags`);
  } else {
    pass(`${label} source`, `${label} is fresh and acceptable`);
  }

  return {
    id,
    label,
    path: resolve(path),
    artifactType: artifact?.artifactType ?? artifact?.schema ?? "missing",
    status,
    fresh,
    acceptable: Boolean(acceptable),
    mutationViolation,
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown"
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean).map(sanitize)));
}

function commandSummary(artifacts) {
  const opsBrainCommands = [
    {
      id: "verify-opsbrain",
      phase: "opsbrain-contract",
      command: "npm run verify:opsbrain",
      mutation: false,
      requiresExplicitApproval: false,
      writesLocalEvidence: true
    }
  ];
  const releaseCommands = (artifacts.releasePlan?.commands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const installCommands = (artifacts.installPlan?.commands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const handoffCommands = (artifacts.liveHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false
  }));
  const lightspeedIntegrationCommands = (artifacts.lightspeedIntegrationHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "lightspeed-integration-handoff",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  const lightspeedExtensionCommands = [
    {
      id: "verify-lightspeed-extension",
      phase: "lightspeed-extension-decision",
      command: "npm run verify:lightspeed-extension",
      mutation: false,
      requiresExplicitApproval: false,
      writesLocalEvidence: true
    }
  ];
  const lightspeedIntegrationApprovalCommands = (artifacts.lightspeedIntegrationHandoff?.approvalGatedCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "lightspeed-integration-handoff",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const networkHandoffCommands = (artifacts.ocpNetworkHandoff?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false
  }));
  const ocpAuthRbacCommands = (artifacts.ocpAuthRbacPlan?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false,
    writesLocalEvidence: command.writesEvidence === true
  }));
  const ocpAuthRbacApprovalCommands = (artifacts.ocpAuthRbacPlan?.approvalGatedCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const externalRuntimeReviewCommands = (artifacts.externalRuntimeReviewPacket?.readOnlyCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false,
    writesLocalEvidence: command.writesLocalEvidence === true
  }));
  const externalRuntimeApprovalCommands = (artifacts.externalRuntimeReviewPacket?.approvalGatedCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const catalogCommands = [
    ...(artifacts.catalogToolchain?.commands?.readOnly ?? []),
    ...(artifacts.catalogToolchain?.commands?.localArtifact ?? [])
  ].map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false
  }));
  const certificationCommands = [
    {
      id: "verify-certification-readiness",
      phase: "release-readiness",
      command: "npm run verify:certification",
      mutation: false,
      requiresExplicitApproval: false,
      writesLocalEvidence: true
    },
    ...(artifacts.certificationReadiness?.toolingHandoff?.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "certification-tooling",
      command: command.command ?? "unknown",
      mutation: command.mutation === true,
      requiresExplicitApproval: false,
      writesLocalEvidence: /verify:certification|verify:catalog-toolchain/i.test(command.command ?? "")
    }))
  ];
  const certificationApprovalCommands = (artifacts.certificationReadiness?.toolingHandoff?.approvalGatedCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "certification-external-submission",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const communitySubmissionCommands = [
    {
      id: "verify-community-submission",
      phase: "community-operator-preflight",
      command: "npm run verify:community-submission",
      mutation: false,
      requiresExplicitApproval: false,
      writesLocalEvidence: true
    },
    ...(artifacts.communityOperatorSubmission?.readOnlyCommands ?? []).map((command) => ({
      id: command.id ?? "unknown",
      phase: command.phase ?? "community-operator-preflight",
      command: command.command ?? "unknown",
      mutation: command.mutation === true,
      requiresExplicitApproval: false,
      writesLocalEvidence: command.writesLocalEvidence === true
    }))
  ];
  const communitySubmissionApprovalCommands = (artifacts.communityOperatorSubmission?.approvalGatedCommands ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "community-operator-external-submission",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: command.requiresExplicitApproval === true
  }));
  const securityCommands = (artifacts.securityScan?.commands?.readOnly ?? []).map((command) => ({
    id: command.id ?? "unknown",
    phase: command.phase ?? "unknown",
    command: command.command ?? "unknown",
    mutation: command.mutation === true,
    requiresExplicitApproval: false
  }));
  const securityRunnerCommands = (artifacts.securityScanRunner?.commandPlans ?? [])
    .flatMap((plan) => [...(plan.cli ?? []), ...(plan.dockerFallback ?? [])])
    .map((command) => ({
      id: command.id ?? "unknown",
      phase: "local-evidence-plan",
      command: command.command ?? "unknown",
      mutation: false,
      requiresExplicitApproval: false,
      writesLocalEvidence: command.writesLocalEvidence === true
    }));
  return {
    readOnly: [...opsBrainCommands, ...releaseCommands, ...installCommands, ...handoffCommands, ...lightspeedExtensionCommands, ...lightspeedIntegrationCommands, ...networkHandoffCommands, ...ocpAuthRbacCommands, ...externalRuntimeReviewCommands, ...catalogCommands, ...certificationCommands, ...communitySubmissionCommands, ...securityCommands, ...securityRunnerCommands]
      .filter((command) => command.mutation === false),
    mutatingApprovalRequired: [...releaseCommands, ...installCommands, ...lightspeedIntegrationApprovalCommands, ...ocpAuthRbacApprovalCommands, ...externalRuntimeApprovalCommands, ...certificationApprovalCommands, ...communitySubmissionApprovalCommands]
      .filter((command) => command.mutation === true),
    forbiddenWithoutApproval: [
      "oc apply",
      "oc delete",
      "oc patch",
      "oc scale",
      "docker push",
      "podman push",
      "skopeo copy",
      "cosign sign"
    ]
  };
}

function stageSummary(roadmapPlan) {
  return (roadmapPlan?.stages ?? []).map((stage) => ({
    id: stage.id ?? "unknown",
    title: stage.title ?? "unknown",
    status: stage.status ?? "unknown",
    missingEvidence: stage.missingEvidence ?? [],
    blockers: stage.blockers ?? []
  }));
}

function roadmapCompletionSummary(roadmapPlan) {
  return {
    totalRequirements: roadmapPlan?.completion?.totalRequirements ?? 0,
    passedRequirements: roadmapPlan?.completion?.passedRequirements ?? 0,
    remainingRequirements: roadmapPlan?.completion?.remainingRequirements ?? 0,
    percentComplete: roadmapPlan?.completion?.percentComplete ?? 0,
    remainingExternalStateCount:
      roadmapPlan?.completion?.remainingExternalStateCount ?? 0,
    remainingLocalOnlyCount:
      roadmapPlan?.completion?.remainingLocalOnlyCount ?? 0,
    remainingExternalStateGateIds:
      roadmapPlan?.completion?.remainingExternalStateGateIds ?? [],
    remainingLocalOnlyGateIds:
      roadmapPlan?.completion?.remainingLocalOnlyGateIds ?? []
  };
}

function approvalSummary(artifacts) {
  return {
    release: artifacts.releasePlan?.requiredApprovals ?? [
      "release-manager",
      "registry-admin",
      "security-reviewer",
      "product-owner"
    ],
    install: artifacts.installPlan?.requiredApprovals ?? [
      "cluster-admin",
      "cluster-sre",
      "security-reviewer",
      "product-owner"
    ],
    externalRuntime: artifacts.externalRuntime?.requiredApprovals ?? [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    externalRuntimeReviewPacket: artifacts.externalRuntimeReviewPacket?.requiredApprovals ?? [
      "registry-admin",
      "security-reviewer",
      "release-manager",
      "product-owner"
    ],
    communityOperatorSubmission: [
      "release-manager",
      "security-reviewer",
      "product-owner"
    ],
    ragIngestion: artifacts.installPlan?.ragIngestion?.requiredApprovals ?? [
      "rag-owner",
      "cluster-sre"
    ]
  };
}

function mutationBoundary(artifacts) {
  const flags = [
    ["envContract.clusterMutationAttempted", artifacts.envContract?.clusterMutationAttempted],
    ["envContract.registryMutationAttempted", artifacts.envContract?.registryMutationAttempted],
    ["envContract.vectorWriteAttempted", artifacts.envContract?.vectorWriteAttempted],
    ["envContract.mutationAllowedByThisVerifier", artifacts.envContract?.mutationAllowedByThisVerifier],
    ["ocpTargetProfile.clusterMutationAttempted", artifacts.ocpTargetProfile?.clusterMutationAttempted],
    ["ocpTargetProfile.registryMutationAttempted", artifacts.ocpTargetProfile?.registryMutationAttempted],
    ["ocpTargetProfile.vectorWriteAttempted", artifacts.ocpTargetProfile?.vectorWriteAttempted],
    ["ocpTargetProfile.mutationAllowedByThisVerifier", artifacts.ocpTargetProfile?.mutationAllowedByThisVerifier],
    ["ocpTargetProfile.companyOcpMutationAllowedByThisVerifier", artifacts.ocpTargetProfile?.boundary?.companyOcpMutationAllowedByThisVerifier],
    ["ocpTargetProfile.crcMutationAllowedByThisVerifier", artifacts.ocpTargetProfile?.boundary?.crcMutationAllowedByThisVerifier],
    ["opsBrain.clusterMutationAttempted", artifacts.opsBrain?.mutationBoundary?.clusterMutationAttempted],
    ["opsBrain.registryMutationAttempted", artifacts.opsBrain?.mutationBoundary?.registryMutationAttempted],
    ["opsBrain.vectorWriteAttempted", artifacts.opsBrain?.mutationBoundary?.vectorWriteAttempted],
    ["opsBrain.graphWriteAttempted", artifacts.opsBrain?.mutationBoundary?.graphWriteAttempted],
    ["opsBrain.fineTuningAttempted", artifacts.opsBrain?.mutationBoundary?.fineTuningAttempted],
    ["opsBrain.mutationAllowedByThisVerifier", artifacts.opsBrain?.mutationBoundary?.mutationAllowedByThisVerifier],
    ["releasePlan.registryMutationAttempted", artifacts.releasePlan?.registryMutationAttempted],
    ["releasePlan.clusterMutationAttempted", artifacts.releasePlan?.clusterMutationAttempted],
    ["releasePlan.mutationAllowedByThisVerifier", artifacts.releasePlan?.mutationAllowedByThisVerifier],
    ["installPlan.clusterMutationAttempted", artifacts.installPlan?.clusterMutationAttempted],
    ["installPlan.mutationAllowedByThisVerifier", artifacts.installPlan?.mutationAllowedByThisVerifier],
    ["externalRuntime.registryMutationAttempted", artifacts.externalRuntime?.registryMutationAttempted],
    ["externalRuntime.clusterMutationAttempted", artifacts.externalRuntime?.clusterMutationAttempted],
    ["externalRuntime.mutationAllowedByThisVerifier", artifacts.externalRuntime?.mutationAllowedByThisVerifier],
    ["externalRuntimeReviewPacket.registryMutationAttempted", artifacts.externalRuntimeReviewPacket?.registryMutationAttempted],
    ["externalRuntimeReviewPacket.clusterMutationAttempted", artifacts.externalRuntimeReviewPacket?.clusterMutationAttempted],
    ["externalRuntimeReviewPacket.mutationAllowedByThisVerifier", artifacts.externalRuntimeReviewPacket?.mutationAllowedByThisVerifier],
    ["ownedImageProvenance.registryMutationAttempted", artifacts.ownedImageProvenance?.registryMutationAttempted],
    ["ownedImageProvenance.clusterMutationAttempted", artifacts.ownedImageProvenance?.clusterMutationAttempted],
    ["certificationReadiness.registryMutationAttempted", artifacts.certificationReadiness?.registryMutationAttempted],
    ["certificationReadiness.clusterMutationAttempted", artifacts.certificationReadiness?.clusterMutationAttempted],
    ["certificationReadiness.mutationAllowedByThisVerifier", artifacts.certificationReadiness?.mutationAllowedByThisVerifier],
    ["communityOperatorSubmission.externalSubmissionAttempted", artifacts.communityOperatorSubmission?.externalSubmissionAttempted],
    ["communityOperatorSubmission.registryMutationAttempted", artifacts.communityOperatorSubmission?.registryMutationAttempted],
    ["communityOperatorSubmission.clusterMutationAttempted", artifacts.communityOperatorSubmission?.clusterMutationAttempted],
    ["communityOperatorSubmission.mutationAllowedByThisVerifier", artifacts.communityOperatorSubmission?.mutationAllowedByThisVerifier],
    ["catalogToolchain.registryMutationAttempted", artifacts.catalogToolchain?.registryMutationAttempted],
    ["catalogToolchain.clusterMutationAttempted", artifacts.catalogToolchain?.clusterMutationAttempted],
    ["catalogToolchain.mutationAllowedByThisVerifier", artifacts.catalogToolchain?.mutationAllowedByThisVerifier],
    ["securityScan.registryMutationAttempted", artifacts.securityScan?.registryMutationAttempted],
    ["securityScan.clusterMutationAttempted", artifacts.securityScan?.clusterMutationAttempted],
    ["securityScan.mutationAllowedByThisVerifier", artifacts.securityScan?.mutationAllowedByThisVerifier],
    ["securityScanRunner.registryMutationAttempted", artifacts.securityScanRunner?.registryMutationAttempted],
    ["securityScanRunner.clusterMutationAttempted", artifacts.securityScanRunner?.clusterMutationAttempted],
    ["securityScanRunner.mutationAllowedByThisVerifier", artifacts.securityScanRunner?.mutationAllowedByThisVerifier],
    ["lightspeedExtensionPoint.clusterMutationAttempted", artifacts.lightspeedExtensionPoint?.clusterMutationAttempted],
    ["lightspeedExtensionPoint.registryMutationAttempted", artifacts.lightspeedExtensionPoint?.registryMutationAttempted],
    ["lightspeedExtensionPoint.vectorWriteAttempted", artifacts.lightspeedExtensionPoint?.vectorWriteAttempted],
    ["lightspeedExtensionPoint.mutationAllowedByThisVerifier", artifacts.lightspeedExtensionPoint?.mutationAllowedByThisVerifier],
    ["lightspeedIntegrationHandoff.clusterMutationAttempted", artifacts.lightspeedIntegrationHandoff?.clusterMutationAttempted],
    ["lightspeedIntegrationHandoff.registryMutationAttempted", artifacts.lightspeedIntegrationHandoff?.registryMutationAttempted],
    ["lightspeedIntegrationHandoff.vectorWriteAttempted", artifacts.lightspeedIntegrationHandoff?.vectorWriteAttempted],
    ["lightspeedIntegrationHandoff.ingestionJobCreated", artifacts.lightspeedIntegrationHandoff?.ingestionJobCreated],
    ["lightspeedIntegrationHandoff.mutationAllowedByThisVerifier", artifacts.lightspeedIntegrationHandoff?.mutationAllowedByThisVerifier],
    ["liveHandoff.clusterMutationAttempted", artifacts.liveHandoff?.clusterMutationAttempted],
    ["liveHandoff.registryMutationAttempted", artifacts.liveHandoff?.registryMutationAttempted],
    ["ocpNetworkHandoff.clusterMutationAttempted", artifacts.ocpNetworkHandoff?.clusterMutationAttempted],
    ["ocpNetworkHandoff.registryMutationAttempted", artifacts.ocpNetworkHandoff?.registryMutationAttempted],
    ["ocpNetworkHandoff.mutationAllowedByThisVerifier", artifacts.ocpNetworkHandoff?.mutationAllowedByThisVerifier],
    ["ocpNetworkHandoffApiFallback.clusterMutationAttempted", artifacts.ocpNetworkHandoffApiFallback?.clusterMutationAttempted],
    ["ocpNetworkHandoffApiFallback.registryMutationAttempted", artifacts.ocpNetworkHandoffApiFallback?.registryMutationAttempted],
    ["ocpNetworkHandoffApiFallback.mutationAllowedByThisVerifier", artifacts.ocpNetworkHandoffApiFallback?.mutationAllowedByThisVerifier],
    ["ocpAuthRbacPlan.clusterMutationAttempted", artifacts.ocpAuthRbacPlan?.clusterMutationAttempted],
    ["ocpAuthRbacPlan.registryMutationAttempted", artifacts.ocpAuthRbacPlan?.registryMutationAttempted],
    ["ocpAuthRbacPlan.mutationAllowedByThisVerifier", artifacts.ocpAuthRbacPlan?.mutationAllowedByThisVerifier],
    ["operatorPackage.clusterMutationAttempted", artifacts.operatorPackage?.clusterMutationAttempted],
    ["operatorPackage.registryMutationAttempted", artifacts.operatorPackage?.registryMutationAttempted],
    ["operatorPackage.mutationAllowedByThisVerifier", artifacts.operatorPackage?.mutationAllowedByThisVerifier],
    ["releaseActionQueue.clusterMutationAttempted", artifacts.releaseActionQueue?.clusterMutationAttempted],
    ["releaseActionQueue.registryMutationAttempted", artifacts.releaseActionQueue?.registryMutationAttempted],
    ["releaseActionQueue.mutationAllowedByThisVerifier", artifacts.releaseActionQueue?.mutationAllowedByThisVerifier]
  ];
  return {
    passed: flags.every(([, value]) => value !== true),
    flags: Object.fromEntries(flags.map(([key, value]) => [key, value === true]))
  };
}

function actionQueueTicketPackets(entry) {
  return [
    entry?.ticketPacket,
    entry?.externalRuntimeTicketPacket,
    entry?.externalRuntimeFinalEvidenceTicketPacket,
    entry?.externalRuntimeProductTicketPacket,
    entry?.securityReviewTicketPacket,
    entry?.releasePublishTicketPacket,
    entry?.installApprovalTicketPacket,
    entry?.catalogToolchainTicketPacket,
    entry?.certificationToolingTicketPacket,
    entry?.ragProductionTicketPacket,
    entry?.aiopsMonitoringTicketPacket,
    entry?.runtimeEvidenceTicketPacket
  ].filter(Boolean);
}

function unsafeActionQueueTickets(entry) {
  return actionQueueTicketPackets(entry).flatMap((ticket) => {
    const reasons = [];
    const firstReadOnly = ticket.firstReadOnlyAction;
    const approvalGated = ticket.approvalGatedAction;
    const boundary = ticket.mutationBoundary ?? {};
    if (firstReadOnly?.mutation === true) reasons.push("first-read-only-mutates");
    if (firstReadOnly?.requiresExplicitApproval === true) {
      reasons.push("first-read-only-requires-approval");
    }
    if (boundary.clusterMutationAttempted === true) reasons.push("cluster-mutation-attempted");
    if (boundary.registryMutationAttempted === true) reasons.push("registry-mutation-attempted");
    if (boundary.mutationAllowedByThisVerifier === true) {
      reasons.push("mutation-allowed-by-verifier");
    }
    if (boundary.vectorWriteAttempted === true) reasons.push("vector-write-attempted");
    if (boundary.ingestionJobCreated === true) reasons.push("ingestion-job-created");
    if (
      approvalGated?.mutation === true &&
      approvalGated.requiresExplicitApproval !== true
    ) {
      reasons.push("approval-mutation-without-explicit-approval");
    }
    return reasons.length > 0
      ? [`${entry?.lane ?? "unknown"}:${ticket.id ?? "unknown"}:${reasons.join("+")}`]
      : [];
  });
}

function actionQueueSafety(actionQueue, currentHeadSha) {
  const ref = artifactRef(actionQueue);
  const criticalPath = actionQueue?.criticalPath ?? [];
  const missingDiagnostics = criticalPath
    .filter((entry) => (entry.diagnostics ?? []).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks diagnostics`);
  const missingTickets = criticalPath
    .filter((entry) => actionQueueTicketPackets(entry).length === 0)
    .map((entry) => `critical path ${sanitize(entry.lane ?? "unknown")} lacks ticket packet`);
  const unsafeTickets = criticalPath.flatMap(unsafeActionQueueTickets).map(sanitize);
  const fresh =
    actionQueue !== undefined &&
    ref.headSha === currentHeadSha &&
    ref.worktreeDirty === false;
  const ready =
    actionQueue?.status === "ACTION_QUEUE_READY" &&
    fresh &&
    criticalPath.length > 0 &&
    missingDiagnostics.length === 0 &&
    missingTickets.length === 0 &&
    unsafeTickets.length === 0 &&
    actionQueue?.mutationAllowedByThisVerifier !== true &&
    actionQueue?.clusterMutationAttempted !== true &&
    actionQueue?.registryMutationAttempted !== true;
  return {
    status: actionQueue?.status ?? "missing",
    headSha: ref.headSha ?? "missing",
    worktreeDirty: ref.worktreeDirty ?? "unknown",
    fresh,
    ready,
    ownerPacketCount: (actionQueue?.ownerPackets ?? []).length,
    criticalPathCount: criticalPath.length,
    missingDiagnostics,
    missingTickets,
    unsafeTickets
  };
}

function commandLooksMutating(command) {
  const text = String(command ?? "");
  if (/\b(oc|kubectl)\s+apply\b/i.test(text) && /--dry-run=(server|client)\b/i.test(text)) {
    return false;
  }
  const mutatingCommandPattern =
    /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i;
  return mutatingCommandPattern.test(text);
}

function releaseDecision(artifacts) {
  const checkpointStatus = artifacts.evidenceCheckpoint?.status ?? "missing";
  const releaseStatus = artifacts.releasePlan?.status ?? "missing";
  const installStatus = artifacts.installPlan?.status ?? "missing";
  const roadmapStatus = artifacts.roadmapPlan?.status ?? "missing";
  return {
    publishReady: releaseStatus === "PUBLISH_APPROVAL_REQUIRED",
    installReady: installStatus === "APPROVAL_REQUIRED",
    roadmapComplete: roadmapStatus === "PASS",
    checkpointStatus,
    releaseStatus,
    installStatus,
    roadmapStatus
  };
}

function evidenceGaps(artifacts, sources) {
  return unique([
    ...sources
      .filter((source) => !source.fresh)
      .map((source) => `${source.label} is not fresh for current head`),
    ...sources
      .filter((source) => !source.acceptable)
      .map((source) => `${source.label} status=${source.status}`),
    ...(artifacts.evidenceCheckpoint?.missingEvidence ?? []),
    ...(artifacts.ocpTargetProfile?.missingEvidence ?? []),
    ...(artifacts.releasePlan?.missingEvidence ?? []),
    ...(artifacts.installPlan?.missingEvidence ?? []),
    ...(artifacts.certificationReadiness?.missingEvidence ?? []),
    ...(artifacts.communityOperatorSubmission?.missingEvidence ?? []),
    ...(artifacts.catalogToolchain?.missingEvidence ?? []),
    ...(artifacts.externalRuntime?.missingEvidence ?? []),
    ...(artifacts.externalRuntimeReviewPacket?.missingEvidence ?? []),
    ...(artifacts.securityScan?.missingEvidence ?? []),
    ...(artifacts.securityScanRunner?.missingEvidence ?? []),
    ...(artifacts.lightspeedExtensionPoint?.missingEvidence ?? []),
    ...(artifacts.lightspeedIntegrationHandoff?.missingEvidence ?? []),
    ...(artifacts.liveHandoff?.missingEvidence ?? []),
    ...(artifacts.ocpNetworkHandoff?.missingEvidence ?? []),
    ...(artifacts.ocpNetworkHandoffApiFallback?.missingEvidence ?? []),
    ...(artifacts.ocpAuthRbacPlan?.missingEvidence ?? [])
  ]);
}

function markdownText(value) {
  return sanitize(value).replace(/\r?\n/g, " ").trim();
}

function markdownCell(value) {
  return markdownText(value).replace(/\|/g, "\\|");
}

function markdownTable(headers, rows, emptyLabel) {
  const header = `| ${headers.map(markdownCell).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body =
    rows.length > 0
      ? rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`)
      : [
          `| ${[emptyLabel, ...headers.slice(1).map(() => "")]
            .map(markdownCell)
            .join(" | ")} |`
        ];
  return [header, separator, ...body].join("\n");
}

function markdownList(values, fallback) {
  const entries = unique(values).map(markdownText).filter(Boolean);
  if (entries.length === 0) return `- ${fallback}`;
  return entries.map((entry) => `- ${entry}`).join("\n");
}

function commandRows(commands, limit) {
  return commands.slice(0, limit).map((command) => [
    command.id ?? "unknown",
    command.phase ?? "unknown",
    String(command.mutation === true),
    String(command.requiresExplicitApproval === true),
    command.command ?? "unknown"
  ]);
}

function buildMarkdownBundle(artifact) {
  const readOnlyCommands = artifact.commands?.readOnly ?? [];
  const approvalCommands = artifact.commands?.mutatingApprovalRequired ?? [];
  const sourceRows = (artifact.sources ?? []).map((source) => [
    source.id ?? "unknown",
    source.status ?? "unknown",
    String(source.fresh === true),
    String(source.acceptable === true),
    String(source.mutationViolation === true)
  ]);
  const approvalRows = Object.entries(artifact.approvals ?? {}).map(
    ([scope, approvers]) => [scope, Array.isArray(approvers) ? approvers.join(", ") : "unknown"]
  );
  const stageRows = (artifact.stages ?? []).map((stage) => [
    stage.id ?? "unknown",
    stage.status ?? "unknown",
    (stage.missingEvidence ?? []).length,
    (stage.blockers ?? []).length
  ]);

  return sanitize(
    [
      "# Cywell OpsLens Release Evidence Bundle",
      "",
      "## Current Decision",
      `- Status: ${artifact.status ?? "unknown"}`,
      `- Action mode: ${artifact.actionMode ?? "unknown"}`,
      `- Generated at: ${artifact.generatedAt ?? "unknown"}`,
      `- Ref: ${artifact.ref?.branch ?? "unknown"}@${artifact.ref?.headSha ?? "unknown"} base=${artifact.ref?.baseRef ?? "unknown"} dirty=${String(artifact.ref?.worktreeDirty ?? "unknown")}`,
      `- Publish ready: ${String(artifact.decision?.publishReady ?? false)}`,
      `- Install ready: ${String(artifact.decision?.installReady ?? false)}`,
      `- Roadmap complete: ${String(artifact.decision?.roadmapComplete ?? false)}`,
      `- Checkpoint status: ${artifact.decision?.checkpointStatus ?? "unknown"}`,
      `- Release status: ${artifact.decision?.releaseStatus ?? "unknown"}`,
      `- Install status: ${artifact.decision?.installStatus ?? "unknown"}`,
      `- Roadmap status: ${artifact.decision?.roadmapStatus ?? "unknown"}`,
      `- Roadmap completion: ${artifact.roadmapCompletion?.passedRequirements ?? 0}/${artifact.roadmapCompletion?.totalRequirements ?? 0} (${artifact.roadmapCompletion?.percentComplete ?? 0}%)`,
      `- Roadmap closure boundary: externalState=${artifact.roadmapCompletion?.remainingExternalStateCount ?? 0} localOnly=${artifact.roadmapCompletion?.remainingLocalOnlyCount ?? 0}`,
      "",
      "## Evidence Outputs",
      `- JSON: ${artifact.evidenceOut ?? "missing"}`,
      `- Markdown: ${artifact.markdownOut ?? "missing"}`,
      "",
      "## Source Artifacts",
      markdownTable(
        ["Source", "Status", "Fresh", "Acceptable", "Mutation Violation"],
        sourceRows,
        "no source artifacts"
      ),
      "",
      "## Action Queue Safety",
      `- Status: ${artifact.actionQueueSafety?.status ?? "missing"}`,
      `- Fresh: ${String(artifact.actionQueueSafety?.fresh ?? false)}`,
      `- Ready: ${String(artifact.actionQueueSafety?.ready ?? false)}`,
      `- Owner packets: ${artifact.actionQueueSafety?.ownerPacketCount ?? 0}`,
      `- Critical path lanes: ${artifact.actionQueueSafety?.criticalPathCount ?? 0}`,
      `- Missing diagnostics: ${(artifact.actionQueueSafety?.missingDiagnostics ?? []).join(", ") || "none"}`,
      `- Missing tickets: ${(artifact.actionQueueSafety?.missingTickets ?? []).join(", ") || "none"}`,
      `- Unsafe tickets: ${(artifact.actionQueueSafety?.unsafeTickets ?? []).join(", ") || "none"}`,
      "",
      "## Approvals",
      markdownTable(["Scope", "Required Approvers"], approvalRows, "no approvals listed"),
      "",
      "## Roadmap Stages",
      markdownTable(
        ["Stage", "Status", "Missing Evidence", "Blockers"],
        stageRows,
        "no stage summary"
      ),
      "",
      "## Command Boundary",
      `- Read-only/local evidence commands: ${readOnlyCommands.length}`,
      `- Approval-gated mutating commands not run: ${approvalCommands.length}`,
      `- Registry mutation attempted: ${String(artifact.registryMutationAttempted ?? false)}`,
      `- Cluster mutation attempted: ${String(artifact.clusterMutationAttempted ?? false)}`,
      `- Mutation allowed by this verifier: ${String(artifact.mutationAllowedByThisVerifier ?? false)}`,
      `- Mutation boundary passed: ${String(artifact.mutationBoundary?.passed ?? false)}`,
      `- Forbidden without approval: ${(artifact.commands?.forbiddenWithoutApproval ?? []).join(", ")}`,
      "",
      "### Read-Only Commands (Sample)",
      markdownTable(
        ["ID", "Phase", "Mutation", "Approval Required", "Command"],
        commandRows(readOnlyCommands, 12),
        "no read-only commands"
      ),
      readOnlyCommands.length > 12
        ? `\nShowing 12 of ${readOnlyCommands.length} read-only commands. See JSON for the full list.`
        : "",
      "",
      "### Approval-Gated Commands (Not Run)",
      markdownTable(
        ["ID", "Phase", "Mutation", "Approval Required", "Command"],
        commandRows(approvalCommands, 12),
        "no approval-gated commands"
      ),
      approvalCommands.length > 12
        ? `\nShowing 12 of ${approvalCommands.length} approval-gated commands. See JSON for the full list.`
        : "",
      "",
      "## Missing Evidence",
      `- Count: ${(artifact.missingEvidence ?? []).length}`,
      markdownList(artifact.missingEvidence ?? [], "none"),
      "",
      "## Blockers",
      markdownList(artifact.blockers ?? [], "none"),
      "",
      "## Risk",
      markdownList(artifact.risk ?? [], "none"),
      "",
      "## Rollback Path",
      markdownList(artifact.rollbackPath ?? [], "none"),
      "",
      "## Next Evidence Refresh",
      "- npm run verify:release-refresh -- --live-timeout-ms 30000",
      "- npm run verify:evidence-checkpoint",
      "- npm run verify:release-evidence-bundle",
      "- npm run evidence:release-action-queue",
      "",
      "## Mutation Boundary",
      "- This packet is read-only release evidence.",
      "- It does not publish images, mirror or sign runtime images, install Operators, patch OLSConfig, apply, delete, or scale cluster resources.",
      "- Approval-gated commands are recorded for human review only and were not run by this verifier.",
      ""
    ]
      .filter((line) => line !== undefined && line !== null)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;
  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const artifacts = {
    mvpGate: loadJson(options.mvpGate, "MVP gate"),
    opsBrain: loadJson(options.opsBrain, "Cywell OpsBrain contract"),
    envContract: loadJson(options.envContract, "environment isolation contract"),
    ocpTargetProfile: loadJson(options.ocpTargetProfile, "OCP target profile guard"),
    consolePluginAssets: loadJson(options.consolePluginAssets, "ConsolePlugin assets"),
    lightspeedExtensionPoint: loadJson(
      options.lightspeedExtensionPoint,
      "Lightspeed extension point decision"
    ),
    imageBuild: loadJson(options.imageBuild, "image build readiness"),
    ownedImageProvenance: loadJson(options.ownedImageProvenance, "owned image provenance"),
    certificationReadiness: loadJson(options.certificationReadiness, "certification readiness"),
    communityOperatorSubmission: loadJson(
      options.communityOperatorSubmission,
      "Community Operator submission draft"
    ),
    catalogToolchain: loadJson(options.catalogToolchain, "catalog toolchain plan"),
    externalRuntime: loadJson(options.externalRuntime, "external runtime plan"),
    externalRuntimeReviewPacket: loadJson(options.externalRuntimeReviewPacket, "external runtime review packet"),
    securityScan: loadJson(options.securityScan, "security scan plan"),
    securityScanRunner: loadJson(options.securityScanRunner, "security scan evidence runner"),
    releasePlan: loadJson(options.releasePlan, "release publish plan"),
    installPlan: loadJson(options.installPlan, "install approval plan"),
    lightspeedIntegrationHandoff: loadJson(
      options.lightspeedIntegrationHandoff,
      "Lightspeed integration handoff"
    ),
    liveHandoff: loadJson(options.liveHandoff, "live evidence handoff"),
    ocpNetworkHandoff: loadJson(options.ocpNetworkHandoff, "OCP network handoff"),
    ocpNetworkHandoffApiFallback: loadJson(
      options.ocpNetworkHandoffApiFallback,
      "OCP network handoff API fallback"
    ),
    ocpAuthRbacPlan: loadJson(options.ocpAuthRbacPlan, "OCP auth/RBAC plan"),
    operatorPackage: loadJson(options.operatorPackage, "Operator package"),
    operatorReconcile: loadJson(options.operatorReconcile, "Operator reconcile"),
    operatorRuntimeParity: loadJson(options.operatorRuntimeParity, "Operator runtime parity"),
    evidenceCheckpoint: loadJson(options.evidenceCheckpoint, "evidence checkpoint"),
    roadmapPlan: loadJson(options.roadmapPlan, "roadmap plan alignment"),
    releaseActionQueue: loadJson(options.releaseActionQueue, "release action queue")
  };

  const sources = [
    sourceSummary("mvpGate", "MVP gate", options.mvpGate, artifacts.mvpGate, headSha, ["PASS"]),
    sourceSummary("opsBrain", "Cywell OpsBrain contract", options.opsBrain, artifacts.opsBrain, headSha, ["PASS"]),
    sourceSummary("envContract", "environment isolation contract", options.envContract, artifacts.envContract, headSha, ["PASS"]),
    sourceSummary("ocpTargetProfile", "OCP target profile guard", options.ocpTargetProfile, artifacts.ocpTargetProfile, headSha, ["CRC_SANDBOX_READY", "COMPANY_SHARED_READ_ONLY"]),
    sourceSummary("consolePluginAssets", "ConsolePlugin assets", options.consolePluginAssets, artifacts.consolePluginAssets, headSha, ["PASS"]),
    sourceSummary("lightspeedExtensionPoint", "Lightspeed extension point decision", options.lightspeedExtensionPoint, artifacts.lightspeedExtensionPoint, headSha, ["PASS"]),
    sourceSummary("imageBuild", "image build readiness", options.imageBuild, artifacts.imageBuild, headSha, ["PASS"]),
    sourceSummary("ownedImageProvenance", "owned image provenance", options.ownedImageProvenance, artifacts.ownedImageProvenance, headSha, ["PASS"]),
    sourceSummary("certificationReadiness", "certification readiness", options.certificationReadiness, artifacts.certificationReadiness, headSha, ["READY_FOR_REVIEW", "NEEDS_TOOLING"]),
    sourceSummary("communityOperatorSubmission", "Community Operator submission draft", options.communityOperatorSubmission, artifacts.communityOperatorSubmission, headSha, ["PASS"]),
    sourceSummary("catalogToolchain", "catalog toolchain plan", options.catalogToolchain, artifacts.catalogToolchain, headSha, ["READY_FOR_DRY_RUN", "NEEDS_TOOLING"]),
    sourceSummary("externalRuntime", "external runtime plan", options.externalRuntime, artifacts.externalRuntime, headSha, ["APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("externalRuntimeReviewPacket", "external runtime review packet", options.externalRuntimeReviewPacket, artifacts.externalRuntimeReviewPacket, headSha, ["REVIEW_PACKET_READY"]),
    sourceSummary("securityScan", "security scan plan", options.securityScan, artifacts.securityScan, headSha, ["READY_FOR_SCAN", "NEEDS_TOOLING"]),
    sourceSummary("securityScanRunner", "security scan evidence runner", options.securityScanRunner, artifacts.securityScanRunner, headSha, ["PLAN_READY", "EVIDENCE_WRITTEN"]),
    sourceSummary("releasePlan", "release publish plan", options.releasePlan, artifacts.releasePlan, headSha, ["PUBLISH_APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("installPlan", "install approval plan", options.installPlan, artifacts.installPlan, headSha, ["APPROVAL_REQUIRED", "NEEDS_EVIDENCE"]),
    sourceSummary("lightspeedIntegrationHandoff", "Lightspeed integration handoff", options.lightspeedIntegrationHandoff, artifacts.lightspeedIntegrationHandoff, headSha, ["READY_FOR_LIVE_REGISTRATION_REVIEW", "LIVE_READY", "NEEDS_EVIDENCE"]),
    sourceSummary("liveHandoff", "live evidence handoff", options.liveHandoff, artifacts.liveHandoff, headSha, ["PASS"]),
    sourceSummary("ocpNetworkHandoff", "OCP network handoff", options.ocpNetworkHandoff, artifacts.ocpNetworkHandoff, headSha, ["READY_FOR_NETWORK_REVIEW", "READY_FOR_LIVE_RECHECK", "PASS"]),
    sourceSummary("ocpNetworkHandoffApiFallback", "OCP network handoff API fallback", options.ocpNetworkHandoffApiFallback, artifacts.ocpNetworkHandoffApiFallback, headSha, ["PASS"]),
    sourceSummary("ocpAuthRbacPlan", "OCP auth/RBAC plan", options.ocpAuthRbacPlan, artifacts.ocpAuthRbacPlan, headSha, ["READY_FOR_LIVE_CHECK", "AUTH_RBAC_APPROVAL_REQUIRED", "WAITING_FOR_CONNECTIVITY"]),
    sourceSummary("operatorPackage", "Operator package", options.operatorPackage, artifacts.operatorPackage, headSha, ["PASS"]),
    sourceSummary("operatorReconcile", "Operator reconcile", options.operatorReconcile, artifacts.operatorReconcile, headSha, ["PASS"]),
    sourceSummary("operatorRuntimeParity", "Operator runtime parity", options.operatorRuntimeParity, artifacts.operatorRuntimeParity, headSha, ["PASS"]),
    sourceSummary("evidenceCheckpoint", "evidence checkpoint", options.evidenceCheckpoint, artifacts.evidenceCheckpoint, headSha, ["PASS", "NEEDS_EVIDENCE"]),
    sourceSummary("roadmapPlan", "roadmap plan alignment", options.roadmapPlan, artifacts.roadmapPlan, headSha, ["PASS", "NEEDS_EVIDENCE"]),
    sourceSummary("releaseActionQueue", "release action queue", options.releaseActionQueue, artifacts.releaseActionQueue, headSha, ["ACTION_QUEUE_READY"])
  ];

  const mutations = mutationBoundary(artifacts);
  if (mutations.passed) {
    pass("bundle mutation boundary", "all release bundle source artifacts keep mutation flags false");
  } else {
    fail("bundle mutation boundary", "one or more source artifacts reports mutation flags");
  }

  const commands = commandSummary(artifacts);
  const unsafeCommands = commands.readOnly.filter(
    (command) => command.mutation || commandLooksMutating(command.command)
  );
  if (unsafeCommands.length > 0) {
    fail("bundle command boundary", `read-only command list contains mutation commands: ${unsafeCommands.map((command) => command.id).join(", ")}`);
  } else {
    pass("bundle command boundary", `${commands.readOnly.length} read-only command(s), ${commands.mutatingApprovalRequired.length} approval-gated mutating command(s)`);
  }

  const actionQueue = actionQueueSafety(artifacts.releaseActionQueue, headSha);
  if (actionQueue.ready) {
    pass(
      "bundle action queue safety",
      `${actionQueue.criticalPathCount} critical path lane(s) ready with ${actionQueue.unsafeTickets.length} unsafe ticket(s)`
    );
  } else {
    warn(
      "bundle action queue safety",
      [
        `status=${actionQueue.status}`,
        `fresh=${String(actionQueue.fresh)}`,
        `criticalPath=${actionQueue.criticalPathCount}`,
        `missingDiagnostics=${actionQueue.missingDiagnostics.length}`,
        `missingTickets=${actionQueue.missingTickets.length}`,
        `unsafeTickets=${actionQueue.unsafeTickets.length}`
      ].join(" ")
    );
  }
  const missingEvidence = unique([
    ...evidenceGaps(artifacts, sources),
    ...(actionQueue.ready
      ? []
      : [
          `release action queue safety ready=${String(actionQueue.ready)} status=${actionQueue.status}`
        ]),
    ...actionQueue.missingDiagnostics,
    ...actionQueue.missingTickets,
    ...actionQueue.unsafeTickets
  ]);
  const decision = releaseDecision(artifacts);
  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : worktreeDirty || missingEvidence.length > 0 || !decision.publishReady || !decision.installReady || !decision.roadmapComplete
      ? "NEEDS_EVIDENCE"
      : "APPROVAL_READY";

  const artifact = {
    schema: "cywell.opslens.release-evidence-bundle.v0.1",
    artifactType: "opslens.release-evidence-bundle.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "bundleOnly",
    evidenceOut: resolve(options.evidenceOut),
    markdownOut: resolve(options.markdownOut),
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus.map(sanitize)
    },
    acceptance: [
      "AC-OPSBRAIN-001",
      "AC-CERT-001",
      "AC-OP-005",
      "AC-LIVE-HANDOFF-001",
      "AC-DASH-001"
    ],
    decision,
    opsBrain: {
      status: artifacts.opsBrain?.status ?? "missing",
      actionMode: artifacts.opsBrain?.mutationBoundary?.actionMode ?? "missing",
      acceptance: artifacts.opsBrain?.acceptance ?? {},
      sourceDocumentCount: artifacts.opsBrain?.sourceDocuments?.length ?? 0,
      mutationBoundary: {
        clusterMutationAttempted:
          artifacts.opsBrain?.mutationBoundary?.clusterMutationAttempted === true,
        registryMutationAttempted:
          artifacts.opsBrain?.mutationBoundary?.registryMutationAttempted === true,
        vectorWriteAttempted:
          artifacts.opsBrain?.mutationBoundary?.vectorWriteAttempted === true,
        graphWriteAttempted:
          artifacts.opsBrain?.mutationBoundary?.graphWriteAttempted === true,
        fineTuningAttempted:
          artifacts.opsBrain?.mutationBoundary?.fineTuningAttempted === true,
        memoryWriteRequiresReview:
          artifacts.opsBrain?.mutationBoundary?.memoryWriteRequiresReview === true,
        mutationAllowedByThisVerifier:
          artifacts.opsBrain?.mutationBoundary?.mutationAllowedByThisVerifier === true
      },
      missingEvidence: artifacts.opsBrain?.missingEvidence ?? []
    },
    roadmapCompletion: roadmapCompletionSummary(artifacts.roadmapPlan),
    approvals: approvalSummary(artifacts),
    stages: stageSummary(artifacts.roadmapPlan),
    sources,
    actionQueueSafety: actionQueue,
    imageProvenance: {
      status: artifacts.ownedImageProvenance?.status ?? "missing",
      requiredImages: artifacts.ownedImageProvenance?.requiredImages ?? [],
      requiredPassed: artifacts.ownedImageProvenance?.summary?.requiredPassed === true,
      images: (artifacts.ownedImageProvenance?.images ?? []).map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        status: image.status ?? "unknown",
        imageId: image.imageId ?? "unknown",
        repoDigests: image.repoDigests ?? [],
        user: image.user ?? "unknown"
      }))
    },
    certificationReadiness: {
      status: artifacts.certificationReadiness?.status ?? "missing",
      actionMode: artifacts.certificationReadiness?.actionMode ?? "missing",
      cli: (artifacts.certificationReadiness?.cli ?? []).map((tool) => ({
        name: tool.name ?? "unknown",
        available: tool.available === true,
        requiredForExternalSubmission:
          tool.requiredForExternalSubmission === true,
        version: tool.version ?? "missing"
      })),
      toolingHandoff: {
        actionMode:
          artifacts.certificationReadiness?.toolingHandoff?.actionMode ??
          "missing",
        status:
          artifacts.certificationReadiness?.toolingHandoff?.status ??
          "missing",
        missingRequiredTools:
          artifacts.certificationReadiness?.toolingHandoff
            ?.missingRequiredTools ?? [],
        freshnessPolicy:
          artifacts.certificationReadiness?.toolingHandoff
            ?.freshnessPolicy ?? {},
        executionLanes:
          artifacts.certificationReadiness?.toolingHandoff
            ?.executionLanes ?? [],
        readOnlyCommands:
          artifacts.certificationReadiness?.toolingHandoff
            ?.readOnlyCommands ?? [],
        setupCommands:
          artifacts.certificationReadiness?.toolingHandoff?.setupCommands ??
          [],
        approvalGatedCommands:
          artifacts.certificationReadiness?.toolingHandoff
            ?.approvalGatedCommands ?? [],
        nextCommands:
          artifacts.certificationReadiness?.toolingHandoff?.nextCommands ??
          []
      },
      documents: artifacts.certificationReadiness?.documents ?? {},
      missingEvidence:
        artifacts.certificationReadiness?.missingEvidence ?? []
    },
    communityOperatorSubmission: {
      status: artifacts.communityOperatorSubmission?.status ?? "missing",
      actionMode: artifacts.communityOperatorSubmission?.actionMode ?? "missing",
      submissionLayout:
        artifacts.communityOperatorSubmission?.submissionLayout ?? {},
      parityPassed:
        Array.isArray(artifacts.communityOperatorSubmission?.sourceBundleParity) &&
        artifacts.communityOperatorSubmission.sourceBundleParity.every(
          (entry) => entry.match === true
        ),
      sourceBundleParity:
        artifacts.communityOperatorSubmission?.sourceBundleParity ?? [],
      firstSubmissionActions:
        artifacts.communityOperatorSubmission?.firstSubmissionActions ?? [],
      readOnlyCommands:
        artifacts.communityOperatorSubmission?.readOnlyCommands ?? [],
      approvalGatedCommands:
        artifacts.communityOperatorSubmission?.approvalGatedCommands ?? [],
      missingEvidence:
        artifacts.communityOperatorSubmission?.missingEvidence ?? []
    },
    catalogToolchain: {
      status: artifacts.catalogToolchain?.status ?? "missing",
      actionMode: artifacts.catalogToolchain?.actionMode ?? "missing",
      registryAuthConfigured:
        artifacts.catalogToolchain?.registryAuth?.configured === true,
      registryBaseReadable:
        artifacts.catalogToolchain?.registryAuth?.baseImageReadable === true,
      cli: (artifacts.catalogToolchain?.cli ?? []).map((tool) => ({
        name: tool.name ?? "unknown",
        available: tool.available === true,
        version: tool.version ?? "missing"
      })),
      readOnlyCommands: artifacts.catalogToolchain?.commands?.readOnly ?? [],
      setupCommands: artifacts.catalogToolchain?.commands?.setup ?? [],
      localArtifactCommands:
        artifacts.catalogToolchain?.commands?.localArtifact ?? []
    },
    externalRuntime: {
      status: artifacts.externalRuntime?.status ?? "missing",
      images: (artifacts.externalRuntime?.externalImages ?? []).map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        status: image.status ?? "unknown",
        draftStatus: image.draft?.status ?? "missing",
        evidenceFile: image.evidenceFile ?? "unknown"
      })),
      evidenceDrafts: (artifacts.externalRuntime?.evidenceDrafts ?? []).map((draft) => ({
        name: draft.name ?? "unknown",
        status: draft.status ?? "missing",
        evidenceState: draft.evidenceState ?? "missing",
        missingEvidence: draft.missingEvidence ?? []
      }))
    },
    externalRuntimeReviewPacket: {
      status: artifacts.externalRuntimeReviewPacket?.status ?? "missing",
      actionMode: artifacts.externalRuntimeReviewPacket?.actionMode ?? "missing",
      markdownOut: artifacts.externalRuntimeReviewPacket?.markdownOut ?? "missing",
      images: (artifacts.externalRuntimeReviewPacket?.images ?? []).map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        sourceDigest: image.sourceDigest ?? "missing",
        sourceDigestInspectionStatus:
          image.sourceDigestInspection?.status ?? "missing",
        draftStatus: image.draftStatus ?? "missing",
        evidenceState: image.evidenceState ?? "missing",
        finalEvidenceExists: image.finalEvidence?.exists === true,
        candidateMatrix: {
          status: image.candidateMatrix?.status ?? "missing",
          matrixStatus: image.candidateMatrix?.matrixStatus ?? "missing",
          bestCandidate: image.candidateMatrix?.bestCandidate ?? null,
          zeroCriticalCandidates: image.candidateMatrix?.zeroCriticalCandidates ?? [],
          recommendation: image.candidateMatrix?.recommendation ?? "missing"
        },
        reviewerRequests: image.reviewerRequests ?? [],
        missingEvidence: image.missingEvidence ?? []
      })),
      readOnlyCommands: (artifacts.externalRuntimeReviewPacket?.readOnlyCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        mutation: command.mutation === true,
        writesLocalEvidence: command.writesLocalEvidence === true
      })),
      approvalGatedCommands: (artifacts.externalRuntimeReviewPacket?.approvalGatedCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        mutation: command.mutation === true,
        requiresExplicitApproval: command.requiresExplicitApproval === true
      })),
      missingEvidence: artifacts.externalRuntimeReviewPacket?.missingEvidence ?? []
    },
    securityScan: {
      status: artifacts.securityScan?.status ?? "missing",
      actionMode: artifacts.securityScan?.actionMode ?? "missing",
      cli: (artifacts.securityScan?.cli ?? []).map((tool) => ({
        name: tool.name ?? "unknown",
        available: tool.available === true,
        version: tool.version ?? "missing"
      })),
      images: (artifacts.securityScan?.images ?? []).map((image) => ({
        name: image.name ?? "unknown",
        image: image.image ?? "unknown",
        required: image.required === true,
        source: image.source ?? "unknown",
        vulnerabilityReportExists: image.securityEvidence?.vulnerabilityReportExists === true,
        sbomExists: image.securityEvidence?.sbomExists === true,
        reviewExists: image.securityEvidence?.reviewExists === true
      })),
      readOnlyCommands: artifacts.securityScan?.commands?.readOnly ?? [],
      setupCommands: artifacts.securityScan?.commands?.setup ?? [],
      approvalGatedCommands: artifacts.securityScan?.commands?.approvalGated ?? []
    },
    securityScanRunner: {
      status: artifacts.securityScanRunner?.status ?? "missing",
      actionMode: artifacts.securityScanRunner?.actionMode ?? "missing",
      cli: artifacts.securityScanRunner?.cli ?? {},
      targets: (artifacts.securityScanRunner?.commandPlans ?? []).map((plan) => ({
        name: plan.target?.name ?? "unknown",
        source: plan.target?.source ?? "unknown",
        scanRef: plan.target?.scanRef ?? "unknown",
        vulnerabilityReport: plan.paths?.vulnerabilityReport ?? "missing",
        sbom: plan.paths?.sbom ?? "missing",
        reviewDraft: plan.paths?.reviewDraft ?? "missing",
        cliCommands: (plan.cli ?? []).map((command) => command.id ?? "unknown"),
        dockerFallbackCommands: (plan.dockerFallback ?? []).map((command) => command.id ?? "unknown")
      })),
      missingEvidence: artifacts.securityScanRunner?.missingEvidence ?? [],
      results: artifacts.securityScanRunner?.results ?? []
    },
    lightspeedIntegrationHandoff: {
      status: artifacts.lightspeedIntegrationHandoff?.status ?? "missing",
      actionMode:
        artifacts.lightspeedIntegrationHandoff?.actionMode ?? "missing",
      acceptance: artifacts.lightspeedIntegrationHandoff?.acceptance ?? [],
      localProof:
        artifacts.lightspeedIntegrationHandoff?.localProof ?? {},
      liveReadiness:
        artifacts.lightspeedIntegrationHandoff?.liveReadiness ?? {},
      olsconfig: {
        templateReady:
          artifacts.lightspeedIntegrationHandoff?.olsconfig?.templateReady === true,
        desiredServer:
          artifacts.lightspeedIntegrationHandoff?.olsconfig?.desiredServer ?? {}
      },
      readOnlyCommands:
        artifacts.lightspeedIntegrationHandoff?.readOnlyCommands ?? [],
      approvalGatedCommands:
        artifacts.lightspeedIntegrationHandoff?.approvalGatedCommands ?? [],
      missingEvidence:
        artifacts.lightspeedIntegrationHandoff?.missingEvidence ?? []
    },
    ocpNetworkHandoff: {
      status: artifacts.ocpNetworkHandoff?.status ?? "missing",
      actionMode: artifacts.ocpNetworkHandoff?.actionMode ?? "missing",
      classification:
        artifacts.ocpNetworkHandoff?.diagnostics?.classification ?? "missing",
      target: {
        host: artifacts.ocpNetworkHandoff?.target?.host ?? "missing",
        port: artifacts.ocpNetworkHandoff?.target?.port ?? "missing",
        redactedBaseUrl:
          artifacts.ocpNetworkHandoff?.target?.redactedBaseUrl ?? "missing"
      },
      markdownOut: artifacts.ocpNetworkHandoff?.markdownOut ?? "missing",
      adminRequests: artifacts.ocpNetworkHandoff?.adminRequests ?? [],
      readOnlyCommands: (artifacts.ocpNetworkHandoff?.readOnlyCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        requiresNetwork: command.requiresNetwork === true,
        mutation: command.mutation === true
      })),
      sourceArtifacts: (artifacts.ocpNetworkHandoff?.sourceArtifacts ?? []).map((source) => ({
        id: source.id ?? "unknown",
        status: source.status ?? "unknown",
        fresh: source.fresh === true,
        required: source.required === true
      })),
      missingEvidence: artifacts.ocpNetworkHandoff?.missingEvidence ?? []
    },
    ocpNetworkHandoffApiFallback: {
      status: artifacts.ocpNetworkHandoffApiFallback?.status ?? "missing",
      actionMode:
        artifacts.ocpNetworkHandoffApiFallback?.actionMode ?? "missing",
      caseCount: artifacts.ocpNetworkHandoffApiFallback?.cases?.length ?? 0,
      cases: (artifacts.ocpNetworkHandoffApiFallback?.cases ?? []).map((testCase) => ({
        classification: testCase.classification ?? "unknown",
        owner: testCase.actual?.owner ?? "missing",
        ticketId: testCase.actual?.ticketId ?? "missing",
        firstActionId: testCase.actual?.firstActionId ?? "missing",
        networkChangeRequiresExplicitApproval:
          testCase.actual?.networkChangeRequiresExplicitApproval === true
      })),
      failedChecks: (artifacts.ocpNetworkHandoffApiFallback?.checks ?? []).filter(
        (check) => check.status === "FAIL"
      ).length
    },
    ocpAuthRbacPlan: {
      status: artifacts.ocpAuthRbacPlan?.status ?? "missing",
      actionMode: artifacts.ocpAuthRbacPlan?.actionMode ?? "missing",
      classification:
        artifacts.ocpAuthRbacPlan?.diagnostics?.classification ?? "missing",
      target: {
        host: artifacts.ocpAuthRbacPlan?.target?.host ?? "missing",
        port: artifacts.ocpAuthRbacPlan?.target?.port ?? "missing",
        redactedBaseUrl:
          artifacts.ocpAuthRbacPlan?.target?.redactedBaseUrl ?? "missing"
      },
      markdownOut: artifacts.ocpAuthRbacPlan?.markdownOut ?? "missing",
      preferredCredentialMode:
        artifacts.ocpAuthRbacPlan?.preferredCredentialMode ?? "missing",
      fallbackCredentialMode:
        artifacts.ocpAuthRbacPlan?.fallbackCredentialMode ?? "missing",
      rbac: {
        serviceAccount:
          `${artifacts.ocpAuthRbacPlan?.rbac?.serviceAccount?.namespace ?? "missing"}/${artifacts.ocpAuthRbacPlan?.rbac?.serviceAccount?.name ?? "missing"}`,
        clusterRole:
          artifacts.ocpAuthRbacPlan?.rbac?.clusterRole?.name ?? "missing",
        ruleCount:
          artifacts.ocpAuthRbacPlan?.rbac?.clusterRole?.ruleCount ?? 0,
        readOnlyOnly:
          artifacts.ocpAuthRbacPlan?.rbac?.clusterRole?.readOnlyOnly === true,
        secretsIncluded:
          artifacts.ocpAuthRbacPlan?.rbac?.clusterRole?.secretsIncluded === true
      },
      readOnlyCommands: (artifacts.ocpAuthRbacPlan?.readOnlyCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        requiresNetwork: command.requiresNetwork === true,
        mutation: command.mutation === true
      })),
      approvalGatedCommands: (artifacts.ocpAuthRbacPlan?.approvalGatedCommands ?? []).map((command) => ({
        id: command.id ?? "unknown",
        phase: command.phase ?? "unknown",
        mutation: command.mutation === true,
        requiresExplicitApproval: command.requiresExplicitApproval === true
      })),
      missingEvidence: artifacts.ocpAuthRbacPlan?.missingEvidence ?? []
    },
    commands,
    mutationBoundary: mutations,
    missingEvidence,
    blockers: unique([
      ...(artifacts.evidenceCheckpoint?.blockers ?? []),
      ...(artifacts.roadmapPlan?.blockers ?? [])
    ]),
    risk: unique([
      ...(artifacts.releasePlan?.risk ?? []),
      ...(artifacts.installPlan?.risk ?? []),
      ...(artifacts.externalRuntime?.risk ?? []),
      ...(artifacts.externalRuntimeReviewPacket?.risk ?? []),
      ...(artifacts.securityScan?.risk ?? []),
      ...(artifacts.securityScanRunner?.risk ?? []),
      ...(artifacts.lightspeedIntegrationHandoff?.risk ?? []),
      ...(artifacts.liveHandoff?.risk ?? []),
      ...(artifacts.ocpNetworkHandoff?.risk ?? []),
      ...(artifacts.ocpAuthRbacPlan?.risk ?? []),
      "This bundle is a read-only release packet. It does not publish images, install Operators, patch OLSConfig, or approve RAG ingestion."
    ]),
    rollbackPath: unique([
      ...(artifacts.releasePlan?.rollbackPath ?? []),
      ...(artifacts.installPlan?.rollbackPath ?? []),
      ...(artifacts.externalRuntimeReviewPacket?.rollbackPath ?? []),
      ...(artifacts.securityScan?.rollbackPath ?? []),
      ...(artifacts.securityScanRunner?.rollbackPath ?? []),
      ...(artifacts.lightspeedIntegrationHandoff?.rollbackPath ?? []),
      ...(artifacts.liveHandoff?.rollbackPath ?? []),
      ...(artifacts.ocpNetworkHandoff?.rollbackPath ?? []),
      ...(artifacts.ocpAuthRbacPlan?.rollbackPath ?? []),
      "Regenerate this bundle after any source evidence artifact changes."
    ]),
    evidence: [
      "release evidence bundle reads current local evidence artifacts only",
      "publish/install readiness remains false until required evidence and human approvals exist",
      "secret-bearing values are redacted before export"
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const markdown = buildMarkdownBundle(artifact);
  const secretPattern =
    /--token\s+(?!<redacted>)\S+|Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i;
  if (secretPattern.test(serialized) || secretPattern.test(markdown)) {
    throw new Error("release evidence bundle would include unredacted secret material");
  }
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass(
    "release evidence bundle export",
    `${resolve(options.evidenceOut)} and ${resolve(options.markdownOut)} written without secret material`
  );

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    warn: checks.filter((check) => check.status === "WARN").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens release evidence bundle: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks, markdown=${resolve(options.markdownOut)}`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("release evidence bundle runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] release evidence bundle runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
