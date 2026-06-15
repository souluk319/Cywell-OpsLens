#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-release-publish-plan.json",
  markdownOut: "test-results/cywell-opslens-release-publish-manager.md",
  imageEvidence: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenanceEvidence: "test-results/cywell-opslens-owned-image-provenance.json",
  externalRuntimeEvidence: "test-results/cywell-opslens-external-runtime-images-plan.json",
  catalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  subscription: "deploy/catalog/openshift/subscription.yaml",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
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
  imageEvidence: parsed.get("image-evidence") ?? defaults.imageEvidence,
  ownedImageProvenanceEvidence: parsed.get("owned-image-provenance-evidence") ?? defaults.ownedImageProvenanceEvidence,
  externalRuntimeEvidence: parsed.get("external-runtime-evidence") ?? defaults.externalRuntimeEvidence,
  catalogSource: parsed.get("catalog-source") ?? defaults.catalogSource,
  subscription: parsed.get("subscription") ?? defaults.subscription,
  csv: parsed.get("csv") ?? defaults.csv,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();

function record(status, name, detail) {
  checks.push({ status, name, detail });
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

function expectCheck(name, condition, detail, failureDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failureDetail);
  }
}

async function runCapture(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim?.() ?? "",
      stderr: error.stderr?.trim?.() ?? error.message
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
  return result.stdout.split(/\r?\n/);
}

async function loadSingleYaml(path) {
  const absolutePath = resolve(path);
  const text = await readFile(absolutePath, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${path}: ${errors.map((error) => error.message).join("; ")}`);
  }
  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  if (parsed.length !== 1) {
    throw new Error(`${path}: expected 1 YAML document, got ${parsed.length}`);
  }
  pass("YAML source", `${path} loaded`);
  return parsed[0];
}

function loadJsonArtifact(path, label) {
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

function artifactHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function relatedImages(csv) {
  return new Map((csv?.spec?.relatedImages ?? []).map((entry) => [entry.name, entry.image]));
}

function requiredPublishImages(imageEvidence, catalogSource) {
  const internal = imageEvidence?.internalBuilds ?? [];
  const packaging = imageEvidence?.packagingBuilds ?? [];
  const external = imageEvidence?.externalImages ?? [];
  const images = [...internal, ...packaging, ...external].map((image) => ({
    name: image.name ?? "unknown",
    image: image.image ?? "unknown",
    source: external.includes(image) ? "external-runtime" : "cywell-build",
    certificationEvidenceRequired: image.certificationEvidenceRequired === true
  }));
  const catalogImage = catalogSource?.spec?.image;
  if (catalogImage && !images.some((image) => image.image === catalogImage)) {
    images.push({
      name: "catalog",
      image: catalogImage,
      source: "catalogsource",
      certificationEvidenceRequired: false
    });
  }
  return images;
}

function buildEvidenceGaps(imageEvidence, ownedImageProvenanceEvidence, externalRuntimeEvidence, publishImages, currentHeadSha, currentWorktreeDirty) {
  const actualBuilds = imageEvidence?.actualBuilds ?? [];
  const actualBuildStatus = new Map(actualBuilds.map((build) => [build.name, build.status]));
  const buildRequiredNames = ["operator", "api", "dashboard", "bundle", "catalog"];
  const provenanceRequiredNames = ["operator", "api", "dashboard", "bundle"];
  const provenanceImageStatus = new Map(
    (ownedImageProvenanceEvidence?.images ?? []).map((image) => [image.name, image.status])
  );
  const externalRuntimeStatus = new Map(
    (externalRuntimeEvidence?.externalImages ?? []).map((image) => [image.name, image.status])
  );
  const gaps = [];

  if (currentWorktreeDirty) {
    gaps.push(`current git worktree dirty=true currentHead=${currentHeadSha}`);
  }
  if (imageEvidence?.status !== "PASS") {
    gaps.push(`image readiness status is ${imageEvidence?.status ?? "missing"}`);
  }
  if (imageEvidence?.worktreeDirty !== false) {
    gaps.push(`image readiness worktreeDirty=${String(imageEvidence?.worktreeDirty ?? "unknown")}`);
  }
  if (imageEvidence?.headSha !== currentHeadSha) {
    gaps.push(`image readiness headSha=${imageEvidence?.headSha ?? "missing"} currentHead=${currentHeadSha}`);
  }
  if (imageEvidence?.actualBuildRequested !== true) {
    gaps.push("run npm run verify:images:build before publishing release images");
  }

  if (!ownedImageProvenanceEvidence) {
    gaps.push("run npm run verify:owned-image-provenance before publishing release images");
  } else {
    if (ownedImageProvenanceEvidence.status !== "PASS") {
      gaps.push(`owned image provenance status=${ownedImageProvenanceEvidence.status ?? "missing"}`);
    }
    if (ownedImageProvenanceEvidence.ref?.worktreeDirty !== false) {
      gaps.push(`owned image provenance worktreeDirty=${String(ownedImageProvenanceEvidence.ref?.worktreeDirty ?? "unknown")}`);
    }
    if (ownedImageProvenanceEvidence.ref?.headSha !== currentHeadSha) {
      gaps.push(`owned image provenance headSha=${ownedImageProvenanceEvidence.ref?.headSha ?? "missing"} currentHead=${currentHeadSha}`);
    }
    if (
      ownedImageProvenanceEvidence.registryMutationAttempted !== false ||
      ownedImageProvenanceEvidence.clusterMutationAttempted !== false ||
      ownedImageProvenanceEvidence.mutationAllowedByThisVerifier !== false
    ) {
      gaps.push("owned image provenance must show no registry or cluster mutation");
    }
    for (const name of provenanceRequiredNames) {
      const status = provenanceImageStatus.get(name);
      if (status !== "PASS") {
        gaps.push(`${name} owned image provenance status=${status ?? "missing"}`);
      }
    }
  }

  if (!externalRuntimeEvidence) {
    gaps.push("run npm run verify:external-runtime-plan before publishing or mirroring external runtime images");
  } else {
    if (externalRuntimeEvidence.status !== "APPROVAL_REQUIRED") {
      gaps.push(`external runtime images plan status=${externalRuntimeEvidence.status ?? "missing"}`);
    }
    if (artifactDirty(externalRuntimeEvidence) !== false) {
      gaps.push(`external runtime images plan worktreeDirty=${String(artifactDirty(externalRuntimeEvidence) ?? "unknown")}`);
    }
    if (artifactHeadSha(externalRuntimeEvidence) !== currentHeadSha) {
      gaps.push(`external runtime images plan headSha=${artifactHeadSha(externalRuntimeEvidence) ?? "missing"} currentHead=${currentHeadSha}`);
    }
    if (
      externalRuntimeEvidence.registryMutationAttempted !== false ||
      externalRuntimeEvidence.clusterMutationAttempted !== false
    ) {
      gaps.push("external runtime images plan must show registryMutationAttempted=false and clusterMutationAttempted=false");
    }
  }

  for (const name of buildRequiredNames) {
    const status = actualBuildStatus.get(name);
    if (status !== "PASS") {
      gaps.push(`${name} actual image build status=${status ?? "missing"}`);
    }
  }

  for (const image of publishImages) {
    if (image.certificationEvidenceRequired) {
      const runtimeStatus = externalRuntimeStatus.get(image.name);
      if (runtimeStatus !== "ready") {
        gaps.push(
          `${image.name} external image requires certification and mirroring evidence before Certified Operator submission; external runtime status=${runtimeStatus ?? "missing"}`
        );
      }
    }
  }

  return gaps;
}

function command(id, phase, text, rationale, rollback, mutation = true, extra = {}) {
  return {
    id,
    phase,
    command: text,
    mutation,
    requiresExplicitApproval: extra.requiresExplicitApproval ?? mutation,
    credentialSetup: extra.credentialSetup === true,
    requiresHumanSecretInput: extra.requiresHumanSecretInput === true,
    requiresHumanApproval: extra.requiresHumanApproval === true,
    credentialStoredByVerifier: extra.credentialStoredByVerifier === true,
    registryLoginExecutedByVerifier: extra.registryLoginExecutedByVerifier === true,
    rationale,
    rollback
  };
}

function buildCommands(publishImages, catalogSource, subscription) {
  const pushCommands = publishImages
    .filter((image) => image.source !== "external-runtime")
    .map((image) =>
      command(
        `push-${image.name}`,
        "publish-images",
        `docker push ${image.image}`,
        `Publish ${image.name} image for internal CatalogSource consumption.`,
        `remove or supersede ${image.image} in the release registry; update catalog references before customer install`
      )
    );

  const signCommands = publishImages
    .filter((image) => image.source !== "external-runtime")
    .map((image) =>
      command(
        `sign-${image.name}`,
        "sign-images",
        `cosign sign ${image.image}`,
        `Attach signature evidence for ${image.name}.`,
        `revoke or replace the signature for ${image.image} according to registry policy`
      )
    );

  const mirrorCommands = publishImages
    .filter((image) => image.source === "external-runtime")
    .map((image) =>
      command(
        `mirror-${image.name}`,
        "mirror-external-runtime",
        `oc image mirror ${image.image} <internal-registry>/cywell/${image.name}:0.1.0 --keep-manifest-list=true`,
        `Mirror external runtime image ${image.name} into the controlled release registry.`,
        `remove mirrored ${image.name} image tag only after confirming no installed bundle references it`
      )
    );

  return [
    command(
      "run-release-preflight",
      "preflight",
      "npm run verify:images:build && npm run verify:owned-image-provenance && npm run verify:certification && npm run verify:external-runtime-plan && npm run verify:release-plan",
      "Regenerate local image build, owned-image provenance, certification, external runtime, and release publish evidence before external mutations.",
      "No rollback is required for local preflight.",
      false
    ),
    command(
      "login-release-registry",
      "publish-images",
      "docker login quay.io",
      "Authenticate to the release registry without writing credentials to the repo.",
      "docker logout quay.io",
      false,
      {
        requiresExplicitApproval: true,
        requiresHumanApproval: true,
        requiresHumanSecretInput: true,
        credentialSetup: true,
        credentialStoredByVerifier: false,
        registryLoginExecutedByVerifier: false
      }
    ),
    ...pushCommands,
    ...signCommands,
    ...mirrorCommands,
    command(
      "verify-catalogsource-image",
      "post-publish-verify",
      `oc image info ${catalogSource?.spec?.image ?? "quay.io/cywell/opslens-catalog:0.1.0"}`,
      "Confirm the CatalogSource image is resolvable before creating a CatalogSource in a cluster.",
      "No rollback is required for read-only image inspection.",
      false
    ),
    command(
      "verify-subscription-contract",
      "post-publish-verify",
      `oc apply -f ${options.subscription} --dry-run=server --validate=true`,
      `Confirm Manual Subscription ${subscription?.metadata?.name ?? "cywell-opslens"} remains server-valid before install.`,
      "No rollback is required for server-side dry-run.",
      false
    )
  ];
}

function ownedImageProvenanceSummary(ownedImageProvenanceEvidence) {
  if (!ownedImageProvenanceEvidence) {
    return {
      status: "missing",
      requiredImages: ["operator", "api", "dashboard", "bundle"],
      images: [],
      missingEvidence: [
        `owned image provenance evidence is missing at ${resolve(options.ownedImageProvenanceEvidence)}`
      ]
    };
  }

  return {
    status: ownedImageProvenanceEvidence.status ?? "unknown",
    requiredImages: ownedImageProvenanceEvidence.requiredImages ?? [],
    requiredPassed: ownedImageProvenanceEvidence.summary?.requiredPassed === true,
    images: (ownedImageProvenanceEvidence.images ?? []).map((image) => ({
      name: image.name ?? "unknown",
      image: image.image ?? "unknown",
      localTag: image.localTag ?? "unknown",
      status: image.status ?? "unknown",
      imageId: image.imageId ?? "unknown",
      repoDigests: image.repoDigests ?? [],
      user: image.user ?? "unknown",
      rootfsLayerCount: image.rootfsLayerCount ?? 0
    })),
    missingEvidence: ownedImageProvenanceEvidence.missingEvidence ?? []
  };
}

function planStatus(missingEvidence) {
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (missingEvidence.length > 0) return "NEEDS_EVIDENCE";
  return "PUBLISH_APPROVAL_REQUIRED";
}

function publishGapOwner(gap) {
  if (/external runtime|mirror|vllm|qdrant/i.test(gap)) return "registry-admin";
  if (/catalog|registry\.redhat\.io/i.test(gap)) return "registry-admin";
  if (/scan|sbom|certification|signature|cosign/i.test(gap)) return "security-reviewer";
  return "release-manager";
}

function publishGapNextCommand(gap) {
  if (/external runtime|vllm|qdrant/i.test(gap)) return "npm run verify:external-runtime-plan";
  if (/owned image provenance/i.test(gap)) return "npm run verify:owned-image-provenance";
  if (/image readiness|actual image build|verify:images:build/i.test(gap)) return "npm run verify:images:build";
  if (/catalog|registry\.redhat\.io/i.test(gap)) return "npm run verify:catalog-toolchain";
  if (/dirty/i.test(gap)) return "git status --short";
  return "npm run verify:release-plan";
}

function firstPublishActions(missingEvidence, commands) {
  const evidenceActions = missingEvidence.slice(0, 3).map((gap, index) => ({
    id: `release-evidence-gap-${index + 1}`,
    owner: publishGapOwner(gap),
    phase: "publish-preflight",
    status: "needs-evidence",
    request: "Resolve release publish evidence before image push, signing, mirroring, or catalog publication.",
    evidenceNeeded: gap,
    nextCommand: publishGapNextCommand(gap),
    mutation: false,
    requiresExplicitApproval: false,
    blockedBy: [gap],
    rollbackPath: "No rollback is required for read-only publish preflight evidence."
  }));
  const preflight = commands.find((command) => command.id === "run-release-preflight");
  const preflightAction = preflight
    ? [
        {
          id: preflight.id,
          owner: "release-manager",
          phase: preflight.phase,
          status: missingEvidence.length > 0 ? "needs-evidence" : "ready",
          request: preflight.rationale,
          evidenceNeeded:
            missingEvidence.length > 0
              ? "Release publish evidence gaps remain before approval."
              : "Current-head release preflight is ready for approval review.",
          nextCommand: preflight.command,
          mutation: false,
          requiresExplicitApproval: false,
          blockedBy: missingEvidence,
          rollbackPath: preflight.rollback
        }
      ]
    : [];
  const firstMutatingCommand = commands.find((command) => command.mutation === true);
  const gatedMutationAction = firstMutatingCommand
    ? [
        {
          id: `approval-gated-${firstMutatingCommand.id}`,
          owner: "registry-admin",
          phase: firstMutatingCommand.phase,
          status: "approval-gated",
          request: `Do not run ${firstMutatingCommand.id} until release publish approval is explicit.`,
          evidenceNeeded: "All release publish evidence passes and release-manager, registry-admin, security-reviewer, and product-owner approvals are recorded.",
          nextCommand: firstMutatingCommand.command,
          mutation: true,
          requiresExplicitApproval: true,
          blockedBy: missingEvidence,
          rollbackPath: firstMutatingCommand.rollback
        }
      ]
    : [];
  return [...evidenceActions, ...preflightAction, ...gatedMutationAction];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function buildReleasePublishTicketPacket({ status, missingEvidence, commands, firstActions, publishImages }) {
  const firstReadOnly =
    firstActions.find((action) => action.id === "run-release-preflight") ??
    firstActions.find((action) => action.mutation === false && action.owner === "release-manager") ??
    firstActions.find((action) => action.mutation === false) ?? {
      id: "run-release-preflight",
      status: missingEvidence.length > 0 ? "needs-evidence" : "ready",
      nextCommand: "npm run verify:release-plan",
      mutation: false,
      requiresExplicitApproval: false
    };
  const approvalAction =
    firstActions.find((action) => action.mutation === true) ??
    (() => {
      const firstMutatingCommand = commands.find((command) => command.mutation === true);
      return {
        id: firstMutatingCommand ? `approval-gated-${firstMutatingCommand.id}` : "approval-gated-release-publish",
        status: "approval-gated",
        nextCommand: firstMutatingCommand?.command ?? "approval-gated release publish command",
        mutation: true,
        requiresExplicitApproval: true
      };
    })();

  return {
    id: "release-manager-release-publish-ticket",
    owner: "release-manager",
    title: "Release publish approval handoff",
    severity: "high",
    classification:
      missingEvidence.length > 0 ? "publish-evidence-gaps" : "publish-approval-required",
    publishStatus: status,
    requiredApprovals: [
      "release-manager",
      "registry-admin",
      "security-reviewer",
      "product-owner"
    ],
    publishImageCount: publishImages.length,
    evidenceChecklist: [
      "Release publish plan is same-head and generated from a clean worktree",
      "Owned image provenance, scan/SBOM, security review, and certification evidence are current",
      "External runtime image certification and mirroring evidence are reviewed",
      "Registry push, signature, mirror, and catalog publication commands remain approval-gated",
      "Rollback path is reviewed before any registry mutation"
    ],
    firstReadOnlyAction: {
      id: firstReadOnly.id,
      status: firstReadOnly.status,
      nextCommand: firstReadOnly.nextCommand,
      mutation: false,
      requiresExplicitApproval: false
    },
    approvalGatedAction: {
      id: approvalAction.id,
      status: approvalAction.status,
      nextCommand: approvalAction.nextCommand,
      mutation: true,
      requiresExplicitApproval: true
    },
    nextCommands: uniqueStrings([
      firstReadOnly.nextCommand,
      approvalAction.nextCommand,
      "npm run verify:release-evidence-bundle",
      "npm run evidence:release-action-queue"
    ]),
    blockedBy: uniqueStrings(missingEvidence).slice(0, 8),
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      publishRequiresExplicitApproval: true
    },
    risk:
      "Release publish approval handoff blocks image push, signing, mirroring, and catalog publication until human approvals and evidence are explicit.",
    rollbackPath:
      "Do not delete consumed tags; publish a corrected patch tag and update FBC/CatalogSource references after any approved release publish correction."
  };
}

function buildPublishDecisionAction({ status, missingEvidence, commands, ticketPacket, publishImages }) {
  const readOnlyPreflight =
    commands.find((entry) => entry.id === "run-release-preflight") ??
    commands.find(
      (entry) =>
        entry.mutation !== true &&
        entry.credentialSetup !== true &&
        entry.requiresHumanSecretInput !== true
    );
  const humanSetupCommands = commands.filter(
    (entry) =>
      entry.credentialSetup === true ||
      entry.requiresHumanSecretInput === true ||
      entry.id === "login-release-registry"
  );
  const approvalGatedCommands = commands.filter(
    (entry) => entry.mutation === true && entry.requiresExplicitApproval === true
  );

  return {
    id: "release-manager-release-publish-decision",
    owner: "release-manager",
    status: missingEvidence.length > 0 ? "needs-evidence" : "approval-required",
    requiredApprovals: ticketPacket.requiredApprovals,
    publishImageCount: publishImages.length,
    readOnlyPreflightCommandId:
      readOnlyPreflight?.id ?? ticketPacket.firstReadOnlyAction.id,
    readOnlyPreflightCommand:
      readOnlyPreflight?.command ?? ticketPacket.firstReadOnlyAction.nextCommand,
    humanSetupCommandIds: uniqueStrings(humanSetupCommands.map((entry) => entry.id)),
    approvalGatedCommandIds: uniqueStrings(
      approvalGatedCommands.map((entry) => entry.id)
    ),
    nextCommand:
      readOnlyPreflight?.command ??
      ticketPacket.firstReadOnlyAction.nextCommand ??
      "npm run verify:release-plan",
    evidenceNeeded: uniqueStrings(missingEvidence).slice(0, 8),
    blockedBy: uniqueStrings(missingEvidence).slice(0, 8),
    mutationAllowed: false,
    writesLocalEvidence: true,
    requiresHumanSecretInput: humanSetupCommands.some(
      (entry) => entry.requiresHumanSecretInput === true
    ),
    requiresExplicitApproval: true,
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    publishRequiresExplicitApproval:
      status !== "PUBLISH_APPROVAL_REQUIRED" ||
      ticketPacket.mutationBoundary.publishRequiresExplicitApproval === true ||
      approvalGatedCommands.length > 0
  };
}

function buildReleaseManagerPublishPacket({
  status,
  ticketPacket,
  publishDecisionAction,
  firstActions,
  commands,
  missingEvidence,
  publishImages
}) {
  const approvalGatedCommands = commands.filter(
    (command) => command.mutation === true
  );
  const humanSetupCommands = commands.filter(
    (command) =>
      command.credentialSetup === true ||
      command.requiresHumanSecretInput === true ||
      command.id === "login-release-registry"
  );

  return {
    owner: "release-manager",
    markdownPath: resolve(options.markdownOut),
    exists: true,
    ticketId: ticketPacket.id,
    publishDecisionActionId: publishDecisionAction.id,
    status,
    requiredApprovals: ticketPacket.requiredApprovals,
    publishImageCount: publishImages.length,
    firstReadOnlyActionId: ticketPacket.firstReadOnlyAction.id,
    humanSetupCommandIds: publishDecisionAction.humanSetupCommandIds,
    approvalGatedActionId: ticketPacket.approvalGatedAction.id,
    approvalGatedCommandIds: publishDecisionAction.approvalGatedCommandIds,
    firstPublishActionIds: firstActions.map((action) => action.id),
    mutatingCommandIds: approvalGatedCommands.map((command) => command.id),
    humanSecretCommandIds: humanSetupCommands.map((command) => command.id),
    missingEvidence,
    credentialStoredByVerifier: false,
    registryLoginExecutedByVerifier: false,
    releasePublishExecutedByVerifier: false,
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      mutationAllowedByThisVerifier: false,
      publishRequiresExplicitApproval: true
    }
  };
}

function releasePublishMarkdownFor(plan) {
  const packet = plan.releaseManagerPacket;
  const ticket = plan.ticketPacket;
  const decision = plan.publishDecisionAction;
  const readOnlyCommands = plan.commands.filter(
    (command) =>
      command.mutation !== true &&
      command.credentialSetup !== true &&
      command.requiresHumanSecretInput !== true
  );
  const humanSetupCommands = plan.commands.filter(
    (command) =>
      command.credentialSetup === true ||
      command.requiresHumanSecretInput === true ||
      command.id === "login-release-registry"
  );
  const approvalGatedCommands = plan.commands.filter(
    (command) => command.mutation === true
  );
  const lines = [
    "# Cywell OpsLens Release Publish Manager Packet",
    "",
    `Generated: ${plan.generatedAt}`,
    `Git: ${plan.ref.branch} ${plan.ref.headSha} dirty=${plan.ref.worktreeDirty}`,
    `Status: ${plan.status}`,
    "",
    "## Publish Summary",
    "",
    `- Owner: ${packet.owner}`,
    `- Ticket: ${packet.ticketId}`,
    `- Decision action: ${packet.publishDecisionActionId}`,
    `- Required approvals: ${packet.requiredApprovals.join(", ")}`,
    `- Publish images: ${packet.publishImageCount}`,
    `- First read-only action: ${packet.firstReadOnlyActionId}`,
    `- Human setup commands: ${packet.humanSetupCommandIds.join(", ") || "none"}`,
    `- First approval-gated action: ${packet.approvalGatedActionId}`,
    "",
    "## Read-only Preflight",
    "",
    ...readOnlyCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} mutation=${String(command.mutation)}`
    ),
    "",
    "## Human Secret Setup",
    "",
    ...humanSetupCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} requiresHumanSecretInput=${String(command.requiresHumanSecretInput)} credentialStoredByVerifier=${String(command.credentialStoredByVerifier)} registryLoginExecutedByVerifier=${String(command.registryLoginExecutedByVerifier)}`
    ),
    "",
    "## Approval-gated Publish Commands",
    "",
    ...approvalGatedCommands.map(
      (command) =>
        `- ${command.id}: ${command.command} mutation=${String(command.mutation)} requiresExplicitApproval=${String(command.requiresExplicitApproval)}`
    ),
    "",
    "## Decision Boundary",
    "",
    `- decisionStatus=${decision.status}`,
    `- mutationAllowed=${String(decision.mutationAllowed)}`,
    `- writesLocalEvidence=${String(decision.writesLocalEvidence)}`,
    `- requiresHumanSecretInput=${String(decision.requiresHumanSecretInput)}`,
    `- clusterMutationAttempted=${String(packet.mutationBoundary.clusterMutationAttempted)}`,
    `- registryMutationAttempted=${String(packet.mutationBoundary.registryMutationAttempted)}`,
    `- mutationAllowedByThisVerifier=${String(packet.mutationBoundary.mutationAllowedByThisVerifier)}`,
    `- publishRequiresExplicitApproval=${String(packet.mutationBoundary.publishRequiresExplicitApproval)}`,
    `- credentialStoredByVerifier=${String(packet.credentialStoredByVerifier)}`,
    `- registryLoginExecutedByVerifier=${String(packet.registryLoginExecutedByVerifier)}`,
    `- releasePublishExecutedByVerifier=${String(packet.releasePublishExecutedByVerifier)}`,
    "- This packet does not login to registries, push images, sign images, mirror runtime images, publish catalog images, apply cluster resources, approve InstallPlans, or store credentials.",
    "",
    "## Ticket Checklist",
    "",
    ...ticket.evidenceChecklist.map((item) => `- ${item}`),
    "",
    "## Blocked By",
    "",
    ...(packet.missingEvidence.length
      ? packet.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Risk",
    "",
    ...plan.risk.map((item) => `- ${item}`),
    "",
    "## Rollback Path",
    "",
    ...plan.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

function secretValuesForLeakCheck() {
  return [
    "OCP_API_TOKEN",
    "OPENSHIFT_API_TOKEN",
    "KUBE_API_TOKEN",
    "QUAY_TOKEN",
    "REGISTRY_TOKEN",
    "COSIGN_PASSWORD"
  ]
    .map((key) => process.env[key])
    .filter((value) => value && value.length >= 8);
}

async function buildPlan() {
  const [catalogSource, subscription, csv] = await Promise.all([
    loadSingleYaml(options.catalogSource),
    loadSingleYaml(options.subscription),
    loadSingleYaml(options.csv)
  ]);
  const imageEvidence = loadJsonArtifact(options.imageEvidence, "Image readiness evidence");
  const ownedImageProvenanceEvidence = loadJsonArtifact(options.ownedImageProvenanceEvidence, "Owned image provenance evidence");
  const externalRuntimeEvidence = loadJsonArtifact(options.externalRuntimeEvidence, "External runtime images plan evidence");
  const csvImages = relatedImages(csv);
  const publishImages = requiredPublishImages(imageEvidence, catalogSource);
  const currentHeadSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const worktreeStatus = await gitStatusShort();

  expectCheck(
    "CatalogSource release image",
    catalogSource?.kind === "CatalogSource" &&
      catalogSource?.metadata?.namespace === "openshift-marketplace" &&
      catalogSource?.spec?.image === "quay.io/cywell/opslens-catalog:0.1.0",
    catalogSource?.spec?.image ?? "missing",
    "CatalogSource must point at quay.io/cywell/opslens-catalog:0.1.0"
  );
  expectCheck(
    "Subscription release safety",
    subscription?.spec?.installPlanApproval === "Manual" &&
      subscription?.spec?.startingCSV === "cywell-opslens-operator.v0.1.0",
    "Subscription is Manual with pinned startingCSV",
    "Subscription must stay Manual and pinned for release publish"
  );
  expectCheck(
    "CSV operator image parity",
    csv?.metadata?.annotations?.containerImage === csvImages.get("operator"),
    csv?.metadata?.annotations?.containerImage ?? "missing",
    "CSV containerImage must match relatedImages.operator"
  );
  expectCheck(
    "release publish image inventory",
    publishImages.some((image) => image.name === "operator") &&
      publishImages.some((image) => image.name === "api") &&
      publishImages.some((image) => image.name === "dashboard") &&
      publishImages.some((image) => image.name === "bundle") &&
      publishImages.some((image) => image.name === "catalog"),
    publishImages.map((image) => `${image.name}=${image.image}`).join(", "),
    "release publish plan must include operator, api, dashboard, bundle, and catalog images"
  );

  const missingEvidence = buildEvidenceGaps(
    imageEvidence,
    ownedImageProvenanceEvidence,
    externalRuntimeEvidence,
    publishImages,
    currentHeadSha,
    worktreeStatus.length > 0
  );
  for (const gap of missingEvidence) {
    warn("release publish evidence gap", gap);
  }

  const commands = buildCommands(publishImages, catalogSource, subscription);
  const firstActions = firstPublishActions(missingEvidence, commands);
  const status = planStatus(missingEvidence);
  const ticketPacket = buildReleasePublishTicketPacket({
    status,
    missingEvidence,
    commands,
    firstActions,
    publishImages
  });
  const publishDecisionAction = buildPublishDecisionAction({
    status,
    missingEvidence,
    commands,
    ticketPacket,
    publishImages
  });
  const releaseManagerPacket = buildReleaseManagerPublishPacket({
    status,
    ticketPacket,
    publishDecisionAction,
    firstActions,
    commands,
    missingEvidence,
    publishImages
  });
  if (
    ticketPacket.firstReadOnlyAction.mutation === false &&
    ticketPacket.firstReadOnlyAction.requiresExplicitApproval === false &&
    ticketPacket.approvalGatedAction.mutation === true &&
    ticketPacket.approvalGatedAction.requiresExplicitApproval === true &&
    ticketPacket.mutationBoundary.clusterMutationAttempted === false &&
    ticketPacket.mutationBoundary.registryMutationAttempted === false &&
    ticketPacket.mutationBoundary.mutationAllowedByThisVerifier === false
  ) {
    pass("release publish ticket boundary", "release publish handoff is read-only first and approval-gated for registry mutation");
  } else {
    fail("release publish ticket boundary", "release publish handoff must separate read-only preflight from approval-gated registry mutation");
  }
  if (
    publishDecisionAction.readOnlyPreflightCommandId === "run-release-preflight" &&
    publishDecisionAction.humanSetupCommandIds.includes("login-release-registry") &&
    publishDecisionAction.approvalGatedCommandIds.some((id) => id.startsWith("push-")) &&
    publishDecisionAction.mutationAllowed === false &&
    publishDecisionAction.writesLocalEvidence === true &&
    publishDecisionAction.requiresHumanSecretInput === true &&
    publishDecisionAction.requiresExplicitApproval === true &&
    publishDecisionAction.clusterMutationAttempted === false &&
    publishDecisionAction.registryMutationAttempted === false &&
    publishDecisionAction.mutationAllowedByThisVerifier === false &&
    publishDecisionAction.publishRequiresExplicitApproval === true
  ) {
    pass("release publish decision action", "release-manager decision handoff separates preflight, human secret setup, and approval-gated publish commands");
  } else {
    fail("release publish decision action", "release publish decision handoff must expose preflight, human secret setup, approval-gated publish commands, and no-mutation boundary");
  }

  return {
    schema: "cywell.opslens.release-publish-plan.v0.1",
    artifactType: "opslens.release-publish-plan.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "approvalPlanOnly",
    registryMutationAttempted: false,
    clusterMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    acceptance: ["AC-CERT-001", "AC-OP-005"],
    ref: {
      branch: await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      headSha: currentHeadSha,
      baseRef: await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    requiredApprovals: [
      "release-manager",
      "registry-admin",
      "security-reviewer",
      "product-owner"
    ],
    publishImages,
    ownedImageProvenance: ownedImageProvenanceSummary(ownedImageProvenanceEvidence),
    catalog: {
      catalogSourceImage: catalogSource?.spec?.image ?? "unknown",
      subscriptionNamespace: subscription?.metadata?.namespace ?? "unknown",
      startingCSV: subscription?.spec?.startingCSV ?? "unknown",
      installPlanApproval: subscription?.spec?.installPlanApproval ?? "unknown"
    },
    firstPublishActions: firstActions,
    ticketPacket,
    publishDecisionAction,
    releaseManagerPacket,
    commands,
    missingEvidence,
    risk: [
      "Publishing mutable or unsigned images can make later OLM install evidence unreproducible.",
      "Local owned-image provenance is not a substitute for registry digest, signature, SBOM, or scan evidence.",
      "Catalog image publishing is blocked until registry.redhat.io base-image authentication is available locally or in CI.",
      "External vLLM/Qdrant runtime images require certification and mirroring evidence before Certified Operator submission.",
      "Pushing images does not install OpsLens; cluster install remains gated by the separate install approval plan."
    ],
    rollbackPath: [
      "Do not delete already-consumed image tags; publish a corrected patch tag and update FBC/CatalogSource instead.",
      "If a bad catalog image is pushed, publish a corrected catalog tag and wait for CatalogSource registryPoll refresh.",
      "If mirrored external runtime images are wrong, remove only unused mirror tags and regenerate CSV/FBC references.",
      "Rerun npm run verify:release-plan and npm run verify:install-plan after any image reference change."
    ],
    evidenceSources: {
      imageReadiness: resolve(options.imageEvidence),
      ownedImageProvenance: resolve(options.ownedImageProvenanceEvidence),
      externalRuntimeImagesPlan: resolve(options.externalRuntimeEvidence),
      catalogSource: resolve(options.catalogSource),
      subscription: resolve(options.subscription),
      csv: resolve(options.csv)
    },
    checks
  };
}

async function writePlan(plan) {
  const reportPath = resolve(options.evidenceOut);
  const markdownPath = resolve(options.markdownOut);
  const initialSerialized = `${JSON.stringify(plan, null, 2)}\n`;
  const markdown = releasePublishMarkdownFor(plan);
  if (
    secretValuesForLeakCheck().some(
      (secret) => initialSerialized.includes(secret) || markdown.includes(secret)
    )
  ) {
    throw new Error("release publish plan would include a configured secret value");
  }
  pass("release publish plan evidence export", `${reportPath} and ${markdownPath} written without secret material`);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (
    secretValuesForLeakCheck().some(
      (secret) => serialized.includes(secret) || markdown.includes(secret)
    )
  ) {
    throw new Error("release publish plan would include a configured secret value");
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(reportPath, serialized);
  await writeFile(markdownPath, markdown);
}

function printSummary() {
  const statusWeight = { FAIL: 0, WARN: 1, PASS: 2 };
  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens release publish plan: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);
  if (failures.length > 0) process.exitCode = 1;
}

try {
  const plan = await buildPlan();
  await writePlan(plan);
} catch (error) {
  fail("release publish plan verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
