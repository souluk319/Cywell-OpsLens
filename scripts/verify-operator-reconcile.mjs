#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAllDocuments } from "yaml";
import { buildOpsLensReconcilePlan } from "../packages/operator-controller/dist/index.js";

const paths = {
  patchInstallation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  validateOnlyInstallation: "deploy/operator/fixtures/opslensinstallation-validateonly.yaml",
  baseOlsConfig: "deploy/operator/fixtures/olsconfig-base.yaml",
  registeredOlsConfig: "deploy/operator/fixtures/olsconfig-registered.yaml"
};

const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail });
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

function headerTypes(server) {
  return (server?.headers ?? []).map((header) => header.valueFrom?.type);
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
  const validateOnlyInstallation = await loadSingleYaml(paths.validateOnlyInstallation);
  const baseOlsConfig = await loadSingleYaml(paths.baseOlsConfig);
  const registeredOlsConfig = await loadSingleYaml(paths.registeredOlsConfig);

  const validateOnlyPlan = buildOpsLensReconcilePlan(validateOnlyInstallation, baseOlsConfig);
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
    "ValidateOnly status remains non-mutating",
    validateOnlyPlan.statusPatch.phase === "Ready" &&
      validateOnlyPlan.statusPatch.conditions.some(
        (condition) => condition.type === "AssistantSafety" && condition.status === "True"
      ),
    "status keeps assistant safety separate from operator install patching"
  );

  const patchPlan = buildOpsLensReconcilePlan(patchInstallation, baseOlsConfig);
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
      Boolean(findResource(patchPlan, "ConsolePlugin", "cywell-opslens")),
    "API, vector store, model runtime, and ConsolePlugin resources are rendered"
  );

  const readyPlan = buildOpsLensReconcilePlan(patchInstallation, registeredOlsConfig);
  expectCheck(
    "Registered OLSConfig is ready",
    readyPlan.lightspeedRegistration.phase === "Ready" &&
      readyPlan.lightspeedRegistration.willPatch === false &&
      readyPlan.lightspeedRegistration.missingEvidence.length === 0,
    "matching OLSConfig does not produce a redundant patch"
  );

  const missingPlan = buildOpsLensReconcilePlan(patchInstallation);
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
  printSummary();
}
