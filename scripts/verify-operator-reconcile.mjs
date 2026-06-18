#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";
import { buildOpsLensReconcilePlan } from "../packages/operator-controller/dist/index.js";

const execFileAsync = promisify(execFile);

const paths = {
  patchInstallation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  crcLightweightInstallation:
    "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml",
  validateOnlyInstallation: "deploy/operator/fixtures/opslensinstallation-validateonly.yaml",
  baseOlsConfig: "deploy/operator/fixtures/olsconfig-base.yaml",
  registeredOlsConfig: "deploy/operator/fixtures/olsconfig-registered.yaml"
};

const defaults = {
  evidenceOut: "test-results/cywell-opslens-operator-reconcile.json",
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
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];
const startedAt = new Date().toISOString();
let evidenceContext = {
  validateOnlyPlan: undefined,
  patchPlan: undefined,
  crcLightweightPlan: undefined,
  lightweightPlan: undefined,
  readyPlan: undefined,
  missingPlan: undefined
};

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function record(status, name, detail) {
  checks.push({ status, name, detail: sanitize(detail) });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function expectCheck(name, condition, detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
}

async function loadSingleYaml(relativePath) {
  const text = await readFile(resolve(relativePath), "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    throw new Error(`${relativePath} is invalid YAML: ${errors.map((error) => error.message).join("; ")}`);
  }

  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  if (parsed.length !== 1) {
    throw new Error(`${relativePath} expected 1 YAML document, got ${parsed.length}`);
  }
  pass("fixture YAML", `${relativePath} loaded`);
  return parsed[0];
}

function findResource(plan, kind, name) {
  return plan.desiredResources.find(
    (resource) => resource.kind === kind && resource.metadata?.name === name
  );
}

function findCleanupResource(plan, kind, name) {
  return (plan.cleanupResources ?? []).find(
    (resource) => resource.kind === kind && resource.metadata?.name === name
  );
}

function headerTypes(server) {
  return (server?.headers ?? []).map((header) => header.valueFrom?.type);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function envNames(resource) {
  return new Set(resource?.spec?.template?.spec?.containers?.[0]?.env?.map((entry) => entry.name) ?? []);
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

function statusFromChecks() {
  return checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";
}

function summarizePlan(plan) {
  return {
    phase: plan?.lightspeedRegistration?.phase ?? "missing",
    mode: plan?.lightspeedRegistration?.mode ?? "missing",
    willPatch: plan?.lightspeedRegistration?.willPatch === true,
    mutationAllowed: plan?.lightspeedRegistration?.mutationAllowed === true,
    missingEvidence: plan?.lightspeedRegistration?.missingEvidence ?? [],
    desiredResourceCount: plan?.desiredResources?.length ?? 0,
    cleanupResourceCount: plan?.cleanupResources?.length ?? 0,
    consolePluginEnablement: {
      phase: plan?.consolePluginEnablement?.phase ?? "missing",
      willPatch: plan?.consolePluginEnablement?.willPatch === true,
      pluginName: plan?.consolePluginEnablement?.target?.pluginName ?? "missing",
      plugins: plan?.consolePluginEnablement?.mergePatch?.spec?.plugins ?? []
    },
    assistantMutationAllowed: plan?.policy?.assistantMutationAllowed === true,
    ragApprovalQueueMutationAllowed:
      plan?.policy?.ragApprovalQueueMutationAllowed === true,
    ragRawDocumentReturnAllowed:
      plan?.policy?.ragRawDocumentReturnAllowed === true,
    rollbackPath: plan?.lightspeedRegistration?.rollbackPath ?? []
  };
}

async function writeEvidence() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const failures = checks.filter((check) => check.status === "FAIL");
  const artifact = {
    schema: "cywell.opslens.operator-reconcile.v0.1",
    artifactType: "opslens.operator-reconcile.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: statusFromChecks(),
    actionMode: "operatorReconcileFixtureOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    mutationAllowedByThisVerifier: false,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty: worktreeStatus.length > 0,
      worktreeStatus
    },
    fixtures: paths,
    planSummaries: {
      validateOnly: summarizePlan(evidenceContext.validateOnlyPlan),
      patchOLSConfig: summarizePlan(evidenceContext.patchPlan),
      derivedLightweight: summarizePlan(evidenceContext.lightweightPlan),
      checkedInCrcLightweight: summarizePlan(evidenceContext.crcLightweightPlan),
      alreadyRegistered: summarizePlan(evidenceContext.readyPlan),
      missingOLSConfig: summarizePlan(evidenceContext.missingPlan)
    },
    evidence: [
      "ValidateOnly reports Lightspeed registration gaps without patching OLSConfig.",
      "PatchOLSConfig preserves existing featureGates and MCP servers while planning the Cywell /mcp registration.",
      "The checked-in CRC lightweight sample uses inmemory + mock-local + ValidateOnly to avoid pgvector, vLLM, and OLSConfig patch surprises during local demos.",
      "The lightweight reconcile plan prunes only owned stale pgvector/vLLM runtime resources when a CR is switched back from approved runtime to CRC demo mode.",
      "Missing OLSConfig blocks patching instead of inventing or overwriting a cluster resource.",
      "Assistant actions remain plan-only; only explicit Operator install reconciliation can patch OLSConfig."
    ],
    missingEvidence: failures.map((check) => `${check.name}: ${check.detail}`),
    risk: [
      "Fixture reconcile evidence does not prove live cluster RBAC or server-side dry-run success.",
      "PatchOLSConfig is an install-time Operator path and must remain separate from assistant apply/delete/scale behavior."
    ],
    rollbackPath: [
      "Restore previous OLSConfig spec.featureGates and spec.mcpServers from GitOps or cluster backup.",
      "Remove only the cywell-opslens mcpServers entry if OpsLens is uninstalled.",
      "Rerun npm run verify:operator:reconcile and npm run verify:lightspeed:patch-preview:fixture after rollback."
    ],
    checks
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("operator reconcile evidence export", `${resolve(options.evidenceOut)} written without secret material`);
  return artifact;
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    PASS: 1
  };

  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  console.log("");
  console.log(`Cywell OpsLens Operator reconcile verification: ${failures.length} fail, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const patchInstallation = await loadSingleYaml(paths.patchInstallation);
  const crcLightweightInstallation = await loadSingleYaml(paths.crcLightweightInstallation);
  const validateOnlyInstallation = await loadSingleYaml(paths.validateOnlyInstallation);
  const baseOlsConfig = await loadSingleYaml(paths.baseOlsConfig);
  const registeredOlsConfig = await loadSingleYaml(paths.registeredOlsConfig);

  const validateOnlyPlan = buildOpsLensReconcilePlan(validateOnlyInstallation, baseOlsConfig);
  evidenceContext.validateOnlyPlan = validateOnlyPlan;
  expectCheck(
    "ValidateOnly does not patch",
    validateOnlyPlan.lightspeedRegistration.mode === "ValidateOnly" &&
      validateOnlyPlan.lightspeedRegistration.mutationAllowed === false &&
      validateOnlyPlan.lightspeedRegistration.willPatch === false &&
      validateOnlyPlan.policy.willPatchLightspeed === false,
    "ValidateOnly reports gaps without mutating OLSConfig"
  );
  expectCheck(
    "ValidateOnly detects missing registration",
    validateOnlyPlan.lightspeedRegistration.phase === "NeedsPatch" &&
      validateOnlyPlan.lightspeedRegistration.missingEvidence.join(" ").includes("MCPServer") &&
      validateOnlyPlan.lightspeedRegistration.missingEvidence.join(" ").includes("cywell-opslens"),
    "missing MCPServer feature gate and cywell MCP server are explicit"
  );
  expectCheck(
    "ValidateOnly status remains non-mutating and workload-pending",
    validateOnlyPlan.statusPatch.phase === "Installing" &&
      validateOnlyPlan.statusPatch.conditions.some(
        (condition) => condition.type === "AssistantSafety" && condition.status === "True"
      ) &&
      validateOnlyPlan.statusPatch.conditions.some(
        (condition) =>
          condition.type === "WorkloadsAvailable" &&
          condition.status === "False" &&
          condition.reason === "WaitingForWorkloads"
      ) &&
      validateOnlyPlan.statusPatch.components.api.ready === false &&
      validateOnlyPlan.statusPatch.components.dashboard.ready === false &&
      validateOnlyPlan.statusPatch.components.vectorStore.ready === false &&
      validateOnlyPlan.statusPatch.components.modelRuntime.ready === false,
    "dry-run status remains plan-only and does not claim workload readiness before live observation"
  );
  expectCheck(
    "CRC lightweight status skips absent external runtime readiness",
    (() => {
      const plan = buildOpsLensReconcilePlan(crcLightweightInstallation, baseOlsConfig);
      return (
        plan.statusPatch.components.vectorStore.ready === true &&
        plan.statusPatch.components.modelRuntime.ready === true &&
        plan.statusPatch.phase === "Installing"
      );
    })(),
    "crc-lightweight status treats inmemory and mock-local as intentionally local-only while API/dashboard still await live observation"
  );

  const patchPlan = buildOpsLensReconcilePlan(patchInstallation, baseOlsConfig);
  evidenceContext.patchPlan = patchPlan;
  const patch = patchPlan.lightspeedRegistration.strategicMergePatch;
  const cywellServer = patch?.spec.mcpServers.find((server) => server.name === "cywell-opslens");
  expectCheck(
    "PatchOLSConfig plans patch",
    patchPlan.lightspeedRegistration.mode === "PatchOLSConfig" &&
      patchPlan.lightspeedRegistration.mutationAllowed === true &&
      patchPlan.lightspeedRegistration.willPatch === true &&
      patchPlan.lightspeedRegistration.phase === "PatchPlanned",
    "explicit PatchOLSConfig produces a planned OLSConfig patch"
  );
  expectCheck(
    "Patch preserves existing OLSConfig state",
    patch?.spec.featureGates.includes("ExistingGate") === true &&
      patch?.spec.featureGates.includes("MCPServer") === true &&
      patch?.spec.mcpServers.some((server) => server.name === "existing-observability") === true,
    "existing feature gates and MCP servers are preserved"
  );
  expectCheck(
    "Patch registers Cywell MCP server",
    cywellServer?.url.endsWith("/mcp") === true &&
      headerTypes(cywellServer).includes("kubernetes") &&
      headerTypes(cywellServer).includes("secret"),
    "cywell mcp server has /mcp endpoint, user token forwarding, and API key header"
  );
  expectCheck(
    "Patch includes rollback path",
    patchPlan.lightspeedRegistration.rollbackPath.join(" ").includes("restore previous OLSConfig") &&
      patchPlan.lightspeedRegistration.rollbackPath.join(" ").includes("remove the cywell-opslens"),
    "rollback path names previous OLSConfig restore and server removal"
  );
  expectCheck(
    "Assistant remains plan-only",
    patchPlan.policy.assistantMutationAllowed === false &&
      patchPlan.desiredResources.some((resource) =>
        JSON.stringify(resource).includes("CYWELL_OPSLENS_ACTION_MODE")
      ) &&
      patchPlan.desiredResources.some((resource) => JSON.stringify(resource).includes("plan-only")),
    "operator install can patch OLSConfig only through explicit mode; assistant remains plan-only"
  );
  const ragPolicy = findResource(patchPlan, "ConfigMap", "cywell-opslens-rag-policy");
  expectCheck(
    "RAG approval queue remains design-only",
    patchPlan.policy.ragApprovalQueueMutationAllowed === false &&
      patchPlan.policy.ragRawDocumentReturnAllowed === false &&
      patchPlan.statusPatch.conditions.some(
        (condition) => condition.type === "RagApprovalQueue" && condition.status === "True"
      ) &&
      patchPlan.statusPatch.rag.approvalQueue.phase === "DesignOnly" &&
      patchPlan.statusPatch.rag.approvalQueue.enqueueAllowed === false,
    "operator status exposes design-only queue with enqueue disabled"
  );
  expectCheck(
    "RAG policy resource is rendered",
    ragPolicy?.data?.documentIntakeMode === "validate-only" &&
      ragPolicy?.data?.evidenceExport === "enabled" &&
      ragPolicy?.data?.rawDocumentReturnAllowed === "false" &&
      ragPolicy?.data?.approvalQueueMode === "design-only" &&
      ragPolicy?.data?.approvalQueueEnqueueAllowed === "false" &&
      patchPlan.desiredResources.some((resource) =>
        JSON.stringify(resource).includes("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED")
      ),
    "ConfigMap and API env keep RAG intake validate-only and queue non-mutating"
  );
  expectCheck(
    "Desired resources cover product stack",
    Boolean(findResource(patchPlan, "Deployment", "cywell-opslens-api")) &&
      Boolean(findResource(patchPlan, "StatefulSet", "cywell-opslens-vector")) &&
      Boolean(findResource(patchPlan, "Deployment", "cywell-opslens-vllm")) &&
      Boolean(findResource(patchPlan, "Route", "cywell-opslens-dashboard")) &&
      Boolean(findResource(patchPlan, "ConsolePlugin", "cywell-opslens")) &&
      (patchPlan.cleanupResources ?? []).length === 0,
    "API, dashboard Route, vector store, model runtime, and ConsolePlugin resources are rendered"
  );

  expectCheck(
    "ConsolePlugin enablement patch planned",
    patchPlan.consolePluginEnablement?.target?.apiVersion === "operator.openshift.io/v1" &&
      patchPlan.consolePluginEnablement?.target?.kind === "Console" &&
      patchPlan.consolePluginEnablement?.target?.name === "cluster" &&
      patchPlan.consolePluginEnablement?.target?.pluginName === "cywell-opslens" &&
      patchPlan.consolePluginEnablement?.willPatch === true &&
      patchPlan.consolePluginEnablement?.mergePatch?.spec?.plugins?.includes("cywell-opslens"),
    "Operator install plan appends cywell-opslens to consoles.operator.openshift.io/cluster spec.plugins"
  );

  const lightweightInstallation = deepClone(validateOnlyInstallation);
  lightweightInstallation.spec.components.vectorStore.provider = "inmemory";
  lightweightInstallation.spec.components.modelRuntime.provider = "mock-local";
  lightweightInstallation.spec.components.modelRuntime.gpu = { enabled: false };
  const lightweightPlan = buildOpsLensReconcilePlan(lightweightInstallation, baseOlsConfig);
  evidenceContext.lightweightPlan = lightweightPlan;
  const lightweightApi = findResource(lightweightPlan, "Deployment", "cywell-opslens-api");
  const lightweightApiEnvNames = envNames(lightweightApi);
  expectCheck(
    "CRC lightweight profile omits external runtime workloads",
      Boolean(lightweightApi) &&
      Boolean(findResource(lightweightPlan, "Deployment", "cywell-opslens-dashboard")) &&
      Boolean(findResource(lightweightPlan, "Route", "cywell-opslens-dashboard")) &&
      Boolean(findResource(lightweightPlan, "ConsolePlugin", "cywell-opslens")) &&
      !findResource(lightweightPlan, "Secret", "cywell-opslens-postgres-auth") &&
      !findResource(lightweightPlan, "StatefulSet", "cywell-opslens-vector") &&
      !findResource(lightweightPlan, "Service", "cywell-opslens-vector") &&
      !findResource(lightweightPlan, "Deployment", "cywell-opslens-vllm") &&
      !findResource(lightweightPlan, "Service", "cywell-opslens-vllm"),
    "inmemory + mock-local keeps CRC demo install to API, dashboard, dashboard Route, ConsolePlugin, and local RAG"
  );
  expectCheck(
    "CRC lightweight profile prunes stale owned runtime resources",
    Boolean(findCleanupResource(lightweightPlan, "StatefulSet", "cywell-opslens-vector")) &&
      Boolean(findCleanupResource(lightweightPlan, "Service", "cywell-opslens-vector")) &&
      Boolean(findCleanupResource(lightweightPlan, "Secret", "cywell-opslens-postgres-auth")) &&
      Boolean(findCleanupResource(lightweightPlan, "Deployment", "cywell-opslens-vllm")) &&
      Boolean(findCleanupResource(lightweightPlan, "Service", "cywell-opslens-vllm")) &&
      !findCleanupResource(lightweightPlan, "PersistentVolumeClaim", "vector-data-cywell-opslens-vector-0"),
    "lightweight switch cleanup removes only owned runtime controllers/services/secrets and leaves PVC data outside automatic cleanup"
  );
  expectCheck(
    "CRC lightweight profile avoids dangling runtime env",
    lightweightApiEnvNames.has("CYWELL_OPSLENS_VECTOR_PROVIDER") &&
      !lightweightApiEnvNames.has("CYWELL_OPSLENS_POSTGRES_URL") &&
      !lightweightApiEnvNames.has("CYWELL_OPSLENS_MODEL_URL") &&
      lightweightPlan.policy.assistantMutationAllowed === false,
    "API does not reference absent Postgres or vLLM services in the lightweight CRC profile"
  );

  const crcLightweightPlan = buildOpsLensReconcilePlan(crcLightweightInstallation, baseOlsConfig);
  evidenceContext.crcLightweightPlan = crcLightweightPlan;
  const crcLightweightApi = findResource(crcLightweightPlan, "Deployment", "cywell-opslens-api");
  const crcLightweightApiEnvNames = envNames(crcLightweightApi);
  expectCheck(
    "CRC lightweight sample omits external runtime workloads",
    crcLightweightInstallation.metadata?.annotations?.["opslens.cywell.io/profile"] === "crc-lightweight" &&
      crcLightweightInstallation.spec.components.vectorStore.provider === "inmemory" &&
      crcLightweightInstallation.spec.components.modelRuntime.provider === "mock-local" &&
      crcLightweightInstallation.spec.components.modelRuntime.replicas === 0 &&
      crcLightweightInstallation.spec.lightspeedRegistration.mode === "ValidateOnly" &&
      Boolean(crcLightweightApi) &&
      Boolean(findResource(crcLightweightPlan, "Deployment", "cywell-opslens-dashboard")) &&
      Boolean(findResource(crcLightweightPlan, "Route", "cywell-opslens-dashboard")) &&
      Boolean(findResource(crcLightweightPlan, "ConsolePlugin", "cywell-opslens")) &&
      crcLightweightPlan.consolePluginEnablement?.mergePatch?.spec?.plugins?.includes("cywell-opslens") &&
      !findResource(crcLightweightPlan, "Secret", "cywell-opslens-postgres-auth") &&
      !findResource(crcLightweightPlan, "StatefulSet", "cywell-opslens-vector") &&
      !findResource(crcLightweightPlan, "Service", "cywell-opslens-vector") &&
      !findResource(crcLightweightPlan, "Deployment", "cywell-opslens-vllm") &&
      !findResource(crcLightweightPlan, "Service", "cywell-opslens-vllm"),
    "checked-in CRC sample installs API, dashboard, dashboard Route, ConsolePlugin, and local RAG without pgvector/vLLM workloads"
  );
  expectCheck(
    "CRC lightweight sample prunes stale owned runtime resources",
    Boolean(findCleanupResource(crcLightweightPlan, "StatefulSet", "cywell-opslens-vector")) &&
      Boolean(findCleanupResource(crcLightweightPlan, "Service", "cywell-opslens-vector")) &&
      Boolean(findCleanupResource(crcLightweightPlan, "Secret", "cywell-opslens-postgres-auth")) &&
      Boolean(findCleanupResource(crcLightweightPlan, "Deployment", "cywell-opslens-vllm")) &&
      Boolean(findCleanupResource(crcLightweightPlan, "Service", "cywell-opslens-vllm")),
    "checked-in CRC sample carries cleanup intent for stale owned pgvector/vLLM resources"
  );
  expectCheck(
    "CRC lightweight sample avoids dangling runtime env",
    crcLightweightApiEnvNames.has("CYWELL_OPSLENS_VECTOR_PROVIDER") &&
      !crcLightweightApiEnvNames.has("CYWELL_OPSLENS_POSTGRES_URL") &&
      !crcLightweightApiEnvNames.has("CYWELL_OPSLENS_MODEL_URL") &&
      crcLightweightPlan.policy.assistantMutationAllowed === false,
    "checked-in CRC sample does not point API at absent Postgres or vLLM services"
  );

  const readyPlan = buildOpsLensReconcilePlan(patchInstallation, registeredOlsConfig);
  evidenceContext.readyPlan = readyPlan;
  expectCheck(
    "Registered OLSConfig is ready",
    readyPlan.lightspeedRegistration.phase === "Ready" &&
      readyPlan.lightspeedRegistration.willPatch === false &&
      readyPlan.lightspeedRegistration.missingEvidence.length === 0,
    "matching OLSConfig does not produce a redundant patch"
  );

  const missingPlan = buildOpsLensReconcilePlan(patchInstallation);
  evidenceContext.missingPlan = missingPlan;
  expectCheck(
    "Missing OLSConfig blocks patching",
    missingPlan.lightspeedRegistration.phase === "MissingOLSConfig" &&
      missingPlan.lightspeedRegistration.mutationAllowed === false &&
      missingPlan.statusPatch.phase === "Blocked",
    "controller core refuses to invent a Lightspeed config when the target is unreadable"
  );
} catch (error) {
  fail("operator reconcile verifier", error instanceof Error ? error.message : String(error));
} finally {
  await writeEvidence();
  printSummary();
}
