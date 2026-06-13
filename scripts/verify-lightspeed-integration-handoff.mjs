#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lightspeed-integration-handoff.json",
  markdownOut: "test-results/cywell-opslens-lightspeed-integration-handoff.md",
  trojanHorseEvidence: "test-results/cywell-opslens-lightspeed-trojan-horse.json",
  routingEvidence: "test-results/cywell-opslens-lightspeed-tool-routing.json",
  lightspeedReadinessEvidence: "test-results/cywell-opslens-lightspeed-readiness.json",
  ocpNetworkHandoffEvidence: "test-results/cywell-opslens-ocp-network-handoff.json",
  olsconfigTemplate: "deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
  timeoutMs: 10000
};

const startedAt = new Date().toISOString();
const checks = [];

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
  trojanHorseEvidence:
    parsed.get("trojan-horse-evidence") ?? defaults.trojanHorseEvidence,
  routingEvidence: parsed.get("routing-evidence") ?? defaults.routingEvidence,
  lightspeedReadinessEvidence:
    parsed.get("lightspeed-readiness-evidence") ??
    defaults.lightspeedReadinessEvidence,
  ocpNetworkHandoffEvidence:
    parsed.get("ocp-network-handoff-evidence") ??
    defaults.ocpNetworkHandoffEvidence,
  olsconfigTemplate:
    parsed.get("olsconfig-template") ?? defaults.olsconfigTemplate,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(
      /(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi,
      "$1$2<redacted>"
    );
}

function secretLike(value) {
  return /--token\s+(?!<redacted>)\S+/i.test(value) ||
    /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]+/i.test(value) ||
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

function unique(values) {
  return [...new Set(values.map(sanitize).filter(Boolean))];
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
  return result.stdout.split(/\r?\n/).filter(Boolean).map(sanitize);
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
    pass(
      label,
      `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`
    );
    return artifact;
  } catch (error) {
    fail(
      label,
      `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

function loadOlsconfigTemplate(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail("OLSConfig template", `${absolutePath} is missing`);
    return undefined;
  }

  try {
    const document = parseYaml(readFileSync(absolutePath, "utf8"));
    pass("OLSConfig template", `${absolutePath} parsed`);
    return document;
  } catch (error) {
    fail(
      "OLSConfig template",
      `${absolutePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}

function artifactHeadSha(artifact) {
  return artifact?.headSha ?? artifact?.ref?.headSha;
}

function artifactDirty(artifact) {
  return artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty;
}

function artifactMutationViolation(artifact) {
  return (
    artifact?.clusterMutationAttempted === true ||
    artifact?.registryMutationAttempted === true ||
    artifact?.vectorWriteAttempted === true ||
    artifact?.ingestionJobCreated === true ||
    artifact?.mutationAllowedByThisVerifier === true ||
    artifact?.policy?.clusterMutationAttempted === true
  );
}

function freshArtifactRequirement(artifact, label, currentHeadSha) {
  const missingEvidence = [];
  const blockers = [];
  if (!artifact) {
    missingEvidence.push(`${label} artifact is missing`);
    return { missingEvidence, blockers };
  }
  if (artifactHeadSha(artifact) !== currentHeadSha) {
    missingEvidence.push(
      `${label} head=${artifactHeadSha(artifact) ?? "missing"} current=${currentHeadSha}`
    );
  }
  if (artifactDirty(artifact) !== false) {
    missingEvidence.push(`${label} dirty=${String(artifactDirty(artifact))}`);
  }
  if (artifactMutationViolation(artifact)) {
    blockers.push(`${label} reports forbidden mutation or vector-write flags`);
  }
  return { missingEvidence, blockers };
}

function evaluateTrojanHorse(artifact, currentHeadSha) {
  const fresh = freshArtifactRequirement(
    artifact,
    "Lightspeed Trojan Horse",
    currentHeadSha
  );
  const blockers = [...fresh.blockers];
  const missingEvidence = [...fresh.missingEvidence];
  const scenario = artifact?.scenario ?? {};
  const primaryCall = artifact?.primaryCall ?? {};
  const redactionProbe = artifact?.redactionProbe ?? {};
  const policy = artifact?.policy ?? {};
  const toolCatalog = artifact?.toolCatalog ?? {};

  if (artifact?.status !== "PASS") blockers.push(`status=${artifact?.status ?? "missing"}`);
  if (scenario.userQuestion !== "우리 회사 결제 시스템 Pod 장애 대응 매뉴얼 알려줘") {
    blockers.push("exact Stage 1 Korean question is not stamped");
  }
  if (scenario.selectedTool !== "generate_playbook") {
    blockers.push(`selectedTool=${scenario.selectedTool ?? "missing"}`);
  }
  if (primaryCall.customerRunbookCitationFound !== true) {
    blockers.push("customer runbook citation is missing");
  }
  if (redactionProbe.passed !== true || redactionProbe.redactedSecret !== true) {
    blockers.push("server-side redaction proof is missing");
  }
  if (toolCatalog.mutatingToolExcluded !== true || toolCatalog.allReadOnly !== true) {
    blockers.push("tool catalog safety proof is incomplete");
  }
  if (
    policy.privateRag !== true ||
    policy.rawDocumentReturned !== false ||
    policy.mcpTechnologyPreview !== true ||
    policy.mutationAllowed !== false
  ) {
    blockers.push("Trojan Horse policy boundary is unsafe");
  }

  if (blockers.length > 0) {
    fail("Trojan Horse local proof", blockers.join("; "));
  } else if (missingEvidence.length > 0) {
    warn("Trojan Horse local proof", missingEvidence.join("; "));
  } else {
    pass(
      "Trojan Horse local proof",
      "exact custom question returns generate_playbook with private RAG citations and redaction"
    );
  }

  return { blockers, missingEvidence };
}

function evaluateRouting(artifact, currentHeadSha) {
  const fresh = freshArtifactRequirement(
    artifact,
    "Lightspeed routing",
    currentHeadSha
  );
  const blockers = [...fresh.blockers];
  const missingEvidence = [...fresh.missingEvidence];
  const selectedPasses = Number(artifact?.score?.selectedPasses ?? 0);
  const responsePasses = Number(artifact?.score?.responsePasses ?? 0);
  const total = Number(artifact?.score?.total ?? 0);
  const threshold = Number(artifact?.score?.threshold ?? 8);

  if (artifact?.status !== "PASS") blockers.push(`status=${artifact?.status ?? "missing"}`);
  if (selectedPasses < threshold || responsePasses < threshold) {
    blockers.push(
      `routing score selected=${selectedPasses}/${total} responses=${responsePasses}/${total} threshold=${threshold}`
    );
  }
  if (artifact?.mutationAllowed !== false || artifact?.rawDocumentReturned !== false) {
    blockers.push("routing response policy is unsafe");
  }

  if (blockers.length > 0) {
    fail("Lightspeed routing proof", blockers.join("; "));
  } else if (missingEvidence.length > 0) {
    warn("Lightspeed routing proof", missingEvidence.join("; "));
  } else {
    pass(
      "Lightspeed routing proof",
      `selected=${selectedPasses}/${total} responses=${responsePasses}/${total} threshold=${threshold}`
    );
  }

  return { blockers, missingEvidence, selectedPasses, responsePasses, total, threshold };
}

function evaluateOlsconfigTemplate(document) {
  const blockers = [];
  const spec = document?.spec ?? {};
  const servers = Array.isArray(spec.mcpServers) ? spec.mcpServers : [];
  const cywellServer = servers.find((server) => server?.name === "cywell-opslens");
  const headers = Array.isArray(cywellServer?.headers) ? cywellServer.headers : [];
  const authHeader = headers.find((header) => header?.name === "Authorization");
  const apiKeyHeader = headers.find((header) => header?.name === "X-Cywell-Api-Key");
  const queryFilters = Array.isArray(spec.ols?.queryFilters)
    ? spec.ols.queryFilters
    : [];
  const userDataCollection = spec.ols?.userDataCollection ?? {};

  if (document?.kind !== "OLSConfig") blockers.push(`kind=${document?.kind ?? "missing"}`);
  if (document?.apiVersion !== "ols.openshift.io/v1alpha1") {
    blockers.push(`apiVersion=${document?.apiVersion ?? "missing"}`);
  }
  if (!Array.isArray(spec.featureGates) || !spec.featureGates.includes("MCPServer")) {
    blockers.push("spec.featureGates must include MCPServer");
  }
  if (!cywellServer) {
    blockers.push("spec.mcpServers cywell-opslens entry is missing");
  }
  if (cywellServer && !String(cywellServer.url ?? "").endsWith("/mcp")) {
    blockers.push("cywell-opslens MCP URL must end with /mcp");
  }
  if (authHeader?.valueFrom?.type !== "kubernetes") {
    blockers.push("Authorization header must forward the Kubernetes user token");
  }
  if (apiKeyHeader?.valueFrom?.type !== "secret") {
    blockers.push("X-Cywell-Api-Key header must come from a Kubernetes Secret");
  }
  if (queryFilters.length < 2) {
    blockers.push("queryFilters must include bearer-token and common-secret redaction");
  }
  if (
    userDataCollection.feedbackDisabled !== true ||
    userDataCollection.transcriptsDisabled !== true
  ) {
    blockers.push("Lightspeed feedback/transcript collection must be disabled by template");
  }

  if (blockers.length > 0) {
    fail("OLSConfig MCP registration template", blockers.join("; "));
  } else {
    pass(
      "OLSConfig MCP registration template",
      `server=${cywellServer.name} url=${cywellServer.url} headers=${headers.length}`
    );
  }

  return {
    blockers,
    server: cywellServer
      ? {
          name: cywellServer.name,
          url: cywellServer.url,
          timeout: cywellServer.timeout,
          authHeaderMode: authHeader?.valueFrom?.type ?? "missing",
          apiKeyHeaderMode: apiKeyHeader?.valueFrom?.type ?? "missing"
        }
      : undefined,
    queryFilterCount: queryFilters.length,
    userDataCollectionDisabled:
      userDataCollection.feedbackDisabled === true &&
      userDataCollection.transcriptsDisabled === true
  };
}

function liveGapSummary(lightspeedReadiness, ocpNetworkHandoff) {
  const readinessStatus = lightspeedReadiness?.status ?? "missing";
  const classification =
    lightspeedReadiness?.currentGap?.classification ??
    lightspeedReadiness?.diagnostics?.classification ??
    ocpNetworkHandoff?.diagnostics?.classification ??
    "missing";
  const networkClassification =
    ocpNetworkHandoff?.diagnostics?.classification ??
    ocpNetworkHandoff?.classification ??
    "missing";
  const missingEvidence = unique([
    ...(lightspeedReadiness?.missingEvidence ?? []).map((item) =>
      `lightspeedReadiness: ${item}`
    ),
    ...(ocpNetworkHandoff?.missingEvidence ?? []).map((item) =>
      `ocpNetworkHandoff: ${item}`
    )
  ]);

  if (readinessStatus === "PASS") {
    pass("Live Lightspeed readiness", "live readiness artifact is PASS");
  } else {
    warn(
      "Live Lightspeed readiness",
      `status=${readinessStatus} classification=${classification} network=${networkClassification}`
    );
  }

  return {
    readinessStatus,
    classification,
    networkClassification,
    missingEvidence
  };
}

function readOnlyCommands() {
  return [
    {
      id: "prove-local-trojan-horse-contract",
      phase: "stage-1-local-contract",
      command: "npm run verify:lightspeed:trojan-horse",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "Prove the exact Korean custom question through local /mcp tools/list and tools/call."
    },
    {
      id: "prove-lightspeed-tool-routing",
      phase: "stage-1-local-contract",
      command: "npm run verify:lightspeed:routing",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "Prove at least 8 of 10 representative Lightspeed questions route to safe read-only tools."
    },
    {
      id: "classify-ocp-network",
      phase: "live-readiness",
      command: "npm run verify:ocp:connectivity",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "Classify DNS/TCP/TLS/API reachability before blaming Lightspeed or OpsLens."
    },
    {
      id: "check-live-lightspeed-readiness",
      phase: "live-readiness",
      command: "npm run verify:lightspeed -- --timeout-ms 30000",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "Read the live OLSConfig CRD and target OLSConfig without patching anything."
    },
    {
      id: "check-live-mcp-roundtrip-after-registration",
      phase: "post-registration-smoke",
      command:
        "npm run verify:lightspeed -- --mcp-url <reachable-cywell-opslens-mcp-url> --require-mcp --timeout-ms 30000",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "After approved registration, prove live tools/list and tools/call through the exposed MCP endpoint."
    },
    {
      id: "refresh-live-handoff",
      phase: "handoff-refresh",
      command: "npm run verify:live-handoff",
      mutation: false,
      writesLocalEvidence: true,
      purpose: "Refresh the SRE-safe live evidence chain after network or registration changes."
    }
  ];
}

function approvalGatedCommands() {
  return [
    {
      id: "apply-reviewed-olsconfig-registration",
      phase: "lightspeed-registration",
      command: "oc apply -f deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
      mutation: true,
      requiresExplicitApproval: true,
      owner: "cluster-admin",
      purpose:
        "Register the Cywell OpsLens MCP server in OpenShift Lightspeed only after local proof, network readiness, and rollback review."
    },
    {
      id: "operator-patch-olsconfig-registration",
      phase: "operator-managed-registration",
      command:
        "approve OpsLensInstallation.spec.lightspeedRegistration.mode=PatchOLSConfig through the install approval plan",
      mutation: true,
      requiresExplicitApproval: true,
      owner: "cluster-admin",
      purpose:
        "Let the Operator manage OLSConfig only after the explicit PatchOLSConfig preview and install approval gates pass."
    }
  ];
}

function commandLooksMutating(command) {
  const text = String(command ?? "");
  if (/\b(oc|kubectl)\s+apply\b/i.test(text) && /--dry-run=(server|client)\b/i.test(text)) {
    return false;
  }
  return /\b(oc|kubectl)\s+(apply|create|delete|patch|replace|scale|rollout|adm)|\b(docker|podman|skopeo)\s+(push|copy)|\b(cosign)\s+sign|\b(operator-sdk|opm)\s+.*\b(push|publish)\b/i.test(text);
}

function markdownFor(artifact) {
  const lines = [
    "# Cywell OpsLens Lightspeed Integration Handoff",
    "",
    `Generated: ${artifact.generatedAt}`,
    `Git: ${artifact.ref.branch} ${artifact.ref.headSha} dirty=${artifact.ref.worktreeDirty}`,
    `Status: ${artifact.status}`,
    "",
    "## Decision",
    "",
    "- Stage 1 uses OpenShift Lightspeed custom MCP registration through OLSConfig.",
    "- Local Trojan Horse and routing evidence are required before any live registration.",
    "- Live registration is approval-gated; this handoff never applies, patches, deletes, scales, pushes, mirrors, or signs.",
    "",
    "## Local Proof",
    "",
    `- Trojan Horse: ${artifact.localProof.trojanHorse.status}`,
    `- Routing: selected=${artifact.localProof.routing.selectedPasses}/${artifact.localProof.routing.total}, responses=${artifact.localProof.routing.responsePasses}/${artifact.localProof.routing.total}, threshold=${artifact.localProof.routing.threshold}`,
    `- OLSConfig template: ${artifact.olsconfig.templateReady ? "ready" : "blocked"}`,
    "",
    "## Live Gap",
    "",
    `- Lightspeed readiness: ${artifact.liveReadiness.status}`,
    `- Classification: ${artifact.liveReadiness.classification}`,
    `- Network classification: ${artifact.liveReadiness.networkClassification}`,
    "",
    "## Read-Only Commands",
    "",
    ...artifact.readOnlyCommands.map(
      (command) => `- ${command.id}: \`${command.command}\``
    ),
    "",
    "## Approval-Gated Commands",
    "",
    ...artifact.approvalGatedCommands.map(
      (command) => `- ${command.id}: \`${command.command}\``
    ),
    "",
    "## Missing Evidence",
    "",
    ...(artifact.missingEvidence.length
      ? artifact.missingEvidence.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Risk",
    "",
    ...artifact.risk.map((item) => `- ${item}`),
    "",
    "## Rollback Path",
    "",
    ...artifact.rollbackPath.map((item) => `- ${item}`),
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const trojanHorse = loadJson(
    options.trojanHorseEvidence,
    "Lightspeed Trojan Horse evidence"
  );
  const routing = loadJson(options.routingEvidence, "Lightspeed routing evidence");
  const lightspeedReadiness = loadJson(
    options.lightspeedReadinessEvidence,
    "Lightspeed readiness evidence",
    false
  );
  const ocpNetworkHandoff = loadJson(
    options.ocpNetworkHandoffEvidence,
    "OCP network handoff evidence",
    false
  );
  const olsconfig = loadOlsconfigTemplate(options.olsconfigTemplate);

  const trojanResult = evaluateTrojanHorse(trojanHorse, headSha);
  const routingResult = evaluateRouting(routing, headSha);
  const olsconfigResult = evaluateOlsconfigTemplate(olsconfig);
  const liveGap = liveGapSummary(lightspeedReadiness, ocpNetworkHandoff);
  const readOnly = readOnlyCommands();
  const approvalGated = approvalGatedCommands();
  const unsafeReadOnly = readOnly
    .filter((command) => command.mutation || commandLooksMutating(command.command))
    .map((command) => command.id);
  const unguardedApproval = approvalGated
    .filter(
      (command) =>
        command.mutation !== true || command.requiresExplicitApproval !== true
    )
    .map((command) => command.id);

  if (unsafeReadOnly.length > 0) {
    fail(
      "handoff read-only command boundary",
      `unsafe read-only commands=${unsafeReadOnly.join(", ")}`
    );
  } else {
    pass("handoff read-only command boundary", `${readOnly.length} read-only command(s)`);
  }
  if (unguardedApproval.length > 0) {
    fail(
      "handoff approval command boundary",
      `unguarded approval commands=${unguardedApproval.join(", ")}`
    );
  } else {
    pass(
      "handoff approval command boundary",
      `${approvalGated.length} approval-gated command(s) remain not-run`
    );
  }

  const blockers = unique([
    ...trojanResult.blockers,
    ...routingResult.blockers,
    ...olsconfigResult.blockers,
    ...unsafeReadOnly.map((id) => `read-only command ${id} is mutating`),
    ...unguardedApproval.map((id) => `approval command ${id} is not guarded`)
  ]);
  const missingEvidence = unique([
    ...trojanResult.missingEvidence,
    ...routingResult.missingEvidence,
    ...liveGap.missingEvidence,
    ...(lightspeedReadiness?.status === "PASS"
      ? []
      : [
          `live Lightspeed readiness is ${liveGap.readinessStatus}; classification=${liveGap.classification}`
        ]),
    worktreeDirty ? "handoff generated from a dirty worktree" : ""
  ]);
  const localReady = blockers.length === 0 && !worktreeDirty;
  const status = blockers.length > 0
    ? "BLOCKED"
    : lightspeedReadiness?.status === "PASS"
      ? "LIVE_READY"
      : localReady
        ? "READY_FOR_LIVE_REGISTRATION_REVIEW"
        : "NEEDS_EVIDENCE";

  const artifact = {
    schema: "cywell.opslens.lightspeed-integration-handoff.v0.1",
    artifactType: "opslens.lightspeed-integration-handoff.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "handoffOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    ingestionJobCreated: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    acceptance: ["AC-LS-001", "AC-LS-002", "AC-LIVE-HANDOFF-001"],
    localProof: {
      trojanHorse: {
        status: trojanHorse?.status ?? "missing",
        question: trojanHorse?.scenario?.userQuestion ?? "missing",
        selectedTool: trojanHorse?.scenario?.selectedTool ?? "missing",
        citationCount: trojanHorse?.primaryCall?.citationCount ?? 0,
        customerRunbookCitationFound:
          trojanHorse?.primaryCall?.customerRunbookCitationFound === true,
        redactionPassed: trojanHorse?.redactionProbe?.passed === true
      },
      routing: {
        status: routing?.status ?? "missing",
        selectedPasses: routingResult.selectedPasses,
        responsePasses: routingResult.responsePasses,
        total: routingResult.total,
        threshold: routingResult.threshold
      }
    },
    olsconfig: {
      templatePath: resolve(options.olsconfigTemplate),
      templateReady: olsconfigResult.blockers.length === 0,
      target: {
        namespace: olsconfig?.metadata?.namespace ?? "missing",
        name: olsconfig?.metadata?.name ?? "missing",
        kind: olsconfig?.kind ?? "missing"
      },
      desiredServer: olsconfigResult.server ?? {
        name: "missing",
        url: "missing",
        authHeaderMode: "missing",
        apiKeyHeaderMode: "missing"
      },
      queryFilterCount: olsconfigResult.queryFilterCount,
      userDataCollectionDisabled: olsconfigResult.userDataCollectionDisabled,
      featureGate: "MCPServer"
    },
    liveReadiness: {
      status: liveGap.readinessStatus,
      classification: liveGap.classification,
      networkClassification: liveGap.networkClassification,
      readinessArtifact:
        lightspeedReadiness?.artifactType ?? lightspeedReadiness?.schema ?? "missing",
      networkHandoffArtifact:
        ocpNetworkHandoff?.artifactType ?? ocpNetworkHandoff?.schema ?? "missing",
      nextCommand:
        lightspeedReadiness?.currentGap?.nextCommand ??
        "npm run verify:lightspeed -- --timeout-ms 30000"
    },
    readOnlyCommands: readOnly,
    approvalGatedCommands: approvalGated,
    forbiddenWithoutApproval: [
      "oc apply",
      "oc patch",
      "oc delete",
      "oc scale",
      "operator-managed PatchOLSConfig",
      "vector write",
      "ingestion job creation"
    ],
    missingEvidence,
    blockers,
    risk: [
      "This handoff proves local MCP behavior and registration intent; it does not prove the live Lightspeed model has selected the tool until OCP reachability and MCP registration are verified.",
      "OpenShift Lightspeed MCP is a Technology Preview path, so product readiness still depends on Operator, Console Plugin, private RAG, RBAC, audit, and release evidence.",
      "Customer runbook content must keep flowing through Cywell private RAG with redacted snippets; raw documents must not be returned through Lightspeed."
    ],
    rollbackPath: [
      "Before approval, keep the OLSConfig unchanged and rerun the read-only commands after network or TLS fixes.",
      "If approved registration causes errors, remove only the cywell-opslens mcpServers entry and rerun npm run verify:lightspeed.",
      "If the live model selects an unsafe tool, disable Cywell MCP registration and rerun verify:lightspeed:routing plus verify:lightspeed:trojan-horse before re-enabling."
    ],
    evidence: [
      "local Trojan Horse evidence proves the exact Stage 1 Korean question through /mcp",
      "routing evidence proves representative question-to-tool selection and response safety",
      "OLSConfig template uses spec.featureGates MCPServer and spec.mcpServers, not legacy ConfigMap mutation",
      "read-only and approval-gated commands are separated before live registration"
    ],
    checks
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const markdown = markdownFor(artifact);
  if (secretLike(serialized) || secretLike(markdown)) {
    throw new Error("Lightspeed integration handoff would include unredacted secret material");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  await writeFile(resolve(options.markdownOut), markdown, "utf8");
  pass(
    "Lightspeed integration handoff export",
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
  console.log(
    `Cywell OpsLens Lightspeed integration handoff: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`
  );

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(
    "Lightspeed integration handoff runtime",
    error instanceof Error ? error.message : String(error)
  );
  console.error(
    `[FAIL] Lightspeed integration handoff runtime: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
