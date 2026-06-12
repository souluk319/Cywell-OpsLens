#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAllDocuments } from "yaml";
import { buildOpsLensReconcilePlan } from "../packages/operator-controller/dist/index.js";

const paths = {
  installation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  baseOlsConfig: "deploy/operator/fixtures/olsconfig-base.yaml",
  controller: "deploy/operator/controller-runtime/controllers/opslensinstallation_controller.go",
  clusterRole: "deploy/operator/config/rbac/cluster_role.yaml",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  acceptance: "docs/acceptance/mvp-0.1.md"
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

async function readText(relativePath) {
  return readFile(resolve(relativePath), "utf8");
}

async function loadSingleYaml(relativePath) {
  const text = await readText(relativePath);
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

function containerFor(resource) {
  return resource?.spec?.template?.spec?.containers?.[0];
}

function envMap(resource) {
  return new Map((containerFor(resource)?.env ?? []).map((entry) => [entry.name, entry.value]));
}

function hasRuleFor(rules, apiGroup, resource, verbs = []) {
  return (rules ?? []).some((rule) => {
    const groups = rule.apiGroups ?? [];
    const resources = rule.resources ?? [];
    const ruleVerbs = rule.verbs ?? [];
    return (
      groups.includes(apiGroup) &&
      resources.includes(resource) &&
      verbs.every((verb) => ruleVerbs.includes(verb))
    );
  });
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
  console.log(`Cywell OpsLens Operator runtime parity verification: ${failures.length} fail, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const installation = await loadSingleYaml(paths.installation);
  const baseOlsConfig = await loadSingleYaml(paths.baseOlsConfig);
  const clusterRole = await loadSingleYaml(paths.clusterRole);
  const csv = await loadSingleYaml(paths.csv);
  const controller = await readText(paths.controller);
  const acceptance = await readText(paths.acceptance);
  const plan = buildOpsLensReconcilePlan(installation, baseOlsConfig);

  const expectedResources = [
    ["Namespace", "cywell-opslens"],
    ["ServiceAccount", "cywell-opslens-api"],
    ["ConfigMap", "cywell-opslens-rag-policy"],
    ["Deployment", "cywell-opslens-api"],
    ["Service", "cywell-opslens-api"],
    ["Deployment", "cywell-opslens-dashboard"],
    ["Service", "cywell-opslens-dashboard"],
    ["StatefulSet", "cywell-opslens-vector"],
    ["Service", "cywell-opslens-vector"],
    ["Deployment", "cywell-opslens-vllm"],
    ["Service", "cywell-opslens-vllm"],
    ["ConsolePlugin", "cywell-opslens"]
  ];

  for (const [kind, name] of expectedResources) {
    expectCheck(
      `TS desired resource ${kind}/${name}`,
      Boolean(findResource(plan, kind, name)),
      "operator-controller reconcile plan includes the install resource"
    );
  }

  for (const method of [
    "reconcileAPIServiceAccount",
    "reconcileRAGPolicy",
    "reconcileAPIDeployment",
    "reconcileAPIService",
    "reconcileDashboardDeployment",
    "reconcileDashboardService",
    "reconcileVectorStore",
    "reconcileVectorService",
    "reconcileModelRuntime",
    "reconcileModelRuntimeService",
    "reconcileConsolePlugin",
    "reconcileLightspeedRegistration"
  ]) {
    expectCheck(`Go reconcile method ${method}`, controller.includes(method), "controller-runtime skeleton includes the reconcile lane");
  }

  expectCheck(
    "Go owned resource watches",
    controller.includes("Owns(&corev1.ConfigMap{})") &&
      controller.includes("Owns(&corev1.ServiceAccount{})") &&
      controller.includes("Owns(&corev1.Service{})") &&
      controller.includes("Owns(&appsv1.Deployment{})") &&
      controller.includes("Owns(&appsv1.StatefulSet{})"),
    "manager watches owned namespaced resources covered by the TS desired plan"
  );

  const apiDeployment = findResource(plan, "Deployment", "cywell-opslens-api");
  const apiEnv = envMap(apiDeployment);
  for (const [name, value] of apiEnv.entries()) {
    expectCheck(
      `Go API env ${name}`,
      controller.includes(name) && (typeof value !== "string" || controller.includes(value)),
      `${name}=${value} is present in TS plan and Go skeleton`
    );
  }

  expectCheck(
    "Go API service account parity",
    apiDeployment?.spec?.template?.spec?.serviceAccountName === "cywell-opslens-api" &&
      controller.includes("apiServiceAccount") &&
      controller.includes("corev1.ServiceAccount"),
    "API deployment uses the managed cywell-opslens-api service account"
  );

  const ragPolicy = findResource(plan, "ConfigMap", "cywell-opslens-rag-policy");
  for (const [key, value] of Object.entries(ragPolicy?.data ?? {})) {
    expectCheck(
      `Go RAG policy data ${key}`,
      controller.includes(key) && controller.includes(String(value)),
      `${key}=${value} is present in TS plan and Go skeleton`
    );
  }

  expectCheck(
    "Go Service parity",
      controller.includes("corev1.Service") &&
      controller.includes('Name: "https"') &&
      controller.includes("httpsServicePort") &&
      controller.includes("service.beta.openshift.io/serving-cert-secret-name") &&
      (controller.includes("Port: 6333") || controller.includes("int32(6333)")) &&
      controller.includes("Port: 8000") &&
      controller.includes('TargetPort: intstr.FromString("https")') &&
      controller.includes('TargetPort: intstr.FromString("http")'),
    "API/dashboard HTTPS Services and vector/model HTTP Services mirror the TS plan ports"
  );

  expectCheck(
    "Go vector persistence parity",
    controller.includes("VolumeClaimTemplates") &&
      controller.includes("vector-data") &&
      controller.includes("/qdrant/storage") &&
      controller.includes("/var/lib/postgresql/data") &&
      controller.includes("corev1.ResourceStorage"),
    "vector store keeps the TS volume claim and provider-specific mount contract"
  );

  const consolePlugin = findResource(plan, "ConsolePlugin", "cywell-opslens");
  expectCheck(
    "Go ConsolePlugin proxy parity",
    consolePlugin?.spec?.backend?.type === "Service" &&
      consolePlugin?.spec?.backend?.service?.port === 443 &&
      consolePlugin?.spec?.proxy?.[0]?.alias === "opslens-api" &&
      consolePlugin?.spec?.proxy?.[0]?.authorization === "UserToken" &&
      consolePlugin?.spec?.proxy?.[0]?.endpoint?.type === "Service" &&
      consolePlugin?.spec?.proxy?.[0]?.endpoint?.service?.port === 443 &&
      consolePlugin?.spec?.service === undefined &&
      consolePlugin?.spec?.proxy?.[0]?.authorize === undefined &&
      controller.includes('"proxy"') &&
      controller.includes('"backend"') &&
      controller.includes('"opslens-api"') &&
      controller.includes('"authorization": "UserToken"') &&
      controller.includes('"endpoint"') &&
      controller.includes("installation.Spec.Components.API.ServiceName"),
    "ConsolePlugin exposes the dashboard backend and UserToken API proxy using the live OpenShift schema"
  );

  expectCheck(
    "Go status safety parity",
    plan.policy.assistantMutationAllowed === false &&
      plan.policy.ragApprovalQueueMutationAllowed === false &&
      plan.policy.ragRawDocumentReturnAllowed === false &&
      controller.includes("Assistant actions remain read-only or plan-only") &&
      controller.includes("ValidateOnly never mutates OLSConfig") &&
      controller.includes("PatchOLSConfig is the only Lightspeed mutation path") &&
      controller.includes("approval queue enqueue and durable ingestion are disabled"),
    "status keeps assistant safety, RAG safety, and Lightspeed mutation boundaries explicit"
  );

  expectCheck(
    "Go OLSConfig patch parity",
    plan.lightspeedRegistration.mode === "PatchOLSConfig" &&
      plan.lightspeedRegistration.strategicMergePatch?.spec?.featureGates?.includes("MCPServer") &&
      plan.lightspeedRegistration.strategicMergePatch?.spec?.mcpServers?.some(
        (server) => server.name === "cywell-opslens" && server.url.endsWith("/mcp")
      ) &&
      controller.includes('olsConfig.SetAPIVersion("ols.openshift.io/v1alpha1")') &&
      controller.includes('olsConfig.SetKind("OLSConfig")') &&
      controller.includes("r.Get(ctx, types.NamespacedName") &&
      controller.includes("unstructured.NestedStringSlice") &&
      controller.includes("appendUniqueString(featureGates, \"MCPServer\")") &&
      controller.includes("unstructured.NestedSlice") &&
      controller.includes("upsertMCPServer") &&
      controller.includes("desiredLightspeedMCPServer") &&
      controller.includes("client.MergeFrom(original)") &&
      controller.includes("r.Patch(ctx, olsConfig") &&
      controller.includes("opslens.cywell.io/rollback-path"),
    "PatchOLSConfig reads the existing OLSConfig, preserves state, upserts Cywell MCP, and patches with rollback annotation"
  );

  const csvRules = (csv?.spec?.install?.spec?.clusterPermissions ?? []).flatMap(
    (permission) => permission.rules ?? []
  );
  expectCheck(
    "RBAC service account parity",
    hasRuleFor(clusterRole?.rules ?? [], "", "serviceaccounts", ["get", "create", "patch"]) &&
      hasRuleFor(csvRules, "", "serviceaccounts", ["get", "create", "patch"]),
    "config RBAC and CSV RBAC cover the service account reconciled by Go"
  );

  expectCheck(
    "Acceptance command mapping",
    acceptance.includes("npm run verify:operator:runtime"),
    "MVP acceptance matrix maps runtime parity to a verifier command"
  );
} catch (error) {
  fail("operator runtime parity verifier", error instanceof Error ? error.message : String(error));
} finally {
  printSummary();
}
