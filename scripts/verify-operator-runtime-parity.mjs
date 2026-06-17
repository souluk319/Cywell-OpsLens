#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments } from "yaml";
import { buildOpsLensReconcilePlan } from "../packages/operator-controller/dist/index.js";

const execFileAsync = promisify(execFile);

const paths = {
  installation: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  baseOlsConfig: "deploy/operator/fixtures/olsconfig-base.yaml",
  controller: "deploy/operator/controller-runtime/controllers/opslensinstallation_controller.go",
  clusterRole: "deploy/operator/config/rbac/cluster_role.yaml",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  acceptance: "docs/acceptance/mvp-0.1.md"
};

const defaults = {
  evidenceOut: "test-results/cywell-opslens-operator-runtime-parity.json",
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
  expectedResources: [],
  plan: undefined,
  goLightspeedMutationBoundary: undefined
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

function ruleVerbsFor(rules, apiGroup, resource) {
  return (rules ?? []).flatMap((rule) => {
    const groups = rule.apiGroups ?? [];
    const resources = rule.resources ?? [];
    if (!groups.includes(apiGroup) || !resources.includes(resource)) return [];
    return rule.verbs ?? [];
  });
}

function countMatches(text, pattern) {
  return [...String(text ?? "").matchAll(pattern)].length;
}

function extractGoFunction(source, name) {
  const marker = `func (r *OpsLensInstallationReconciler) ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const openBrace = source.indexOf("{", start);
  if (openBrace < 0) return "";
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
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

async function writeEvidence() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    "unknown"
  );
  const worktreeStatus = await gitStatusShort();
  const failures = checks.filter((check) => check.status === "FAIL");
  const plan = evidenceContext.plan;
  const desiredResources = evidenceContext.expectedResources.map(([kind, name]) => ({
    kind,
    name,
    present: Boolean(plan && findResource(plan, kind, name))
  }));
  const artifact = {
    schema: "cywell.opslens.operator-runtime-parity.v0.1",
    artifactType: "opslens.operator-runtime-parity.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status: statusFromChecks(),
    actionMode: "operatorRuntimeParityOnly",
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
    desiredResources,
    parity: {
      desiredResourceCount: plan?.desiredResources?.length ?? 0,
      expectedResourceCount: evidenceContext.expectedResources.length,
      lightspeedMode: plan?.lightspeedRegistration?.mode ?? "missing",
      lightspeedPhase: plan?.lightspeedRegistration?.phase ?? "missing",
      willPatchLightspeed: plan?.lightspeedRegistration?.willPatch === true,
      assistantMutationAllowed: plan?.policy?.assistantMutationAllowed === true,
      ragApprovalQueueMutationAllowed:
        plan?.policy?.ragApprovalQueueMutationAllowed === true,
      ragRawDocumentReturnAllowed:
        plan?.policy?.ragRawDocumentReturnAllowed === true
    },
    goLightspeedMutationBoundary:
      evidenceContext.goLightspeedMutationBoundary ?? {
        functionFound: false
      },
    evidence: [
      "TypeScript desired resources and Go/controller-runtime reconcile lanes are checked for parity.",
      "ConsolePlugin backend/proxy, API/dashboard services, NetworkPolicies, vector/model runtime, and OLSConfig patch paths are covered.",
      "RBAC rules in config and CSV cover the resources reconciled by the Go controller.",
      "Go Lightspeed registration source is checked so ValidateOnly exits before live reads or patches, and PatchOLSConfig is the only OLSConfig mutation path."
    ],
    missingEvidence: failures.map((check) => `${check.name}: ${check.detail}`),
    risk: [
      "Runtime parity is source-level evidence; live OLM install and server-side dry-run still require cluster access.",
      "Go compile is covered by image build gates until the local Go toolchain is installed."
    ],
    rollbackPath: [
      "Revert the mismatched controller-runtime or TypeScript desired plan change and rerun runtime parity.",
      "Regenerate bundle and catalog evidence after any controller/runtime parity fix."
    ],
    checks
  };
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), serialized, "utf8");
  pass("operator runtime parity evidence export", `${resolve(options.evidenceOut)} written without secret material`);
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
  evidenceContext.plan = plan;

  const expectedResources = [
    ["Namespace", "cywell-opslens"],
    ["ServiceAccount", "cywell-opslens-api"],
    ["ConfigMap", "cywell-opslens-rag-policy"],
    ["Secret", "cywell-opslens-postgres-auth"],
    ["Deployment", "cywell-opslens-api"],
    ["Service", "cywell-opslens-api"],
    ["NetworkPolicy", "cywell-opslens-api-ingress"],
    ["Deployment", "cywell-opslens-dashboard"],
    ["Service", "cywell-opslens-dashboard"],
    ["NetworkPolicy", "cywell-opslens-dashboard-ingress"],
    ["StatefulSet", "cywell-opslens-vector"],
    ["Service", "cywell-opslens-vector"],
    ["Deployment", "cywell-opslens-vllm"],
    ["Service", "cywell-opslens-vllm"],
    ["ConsolePlugin", "cywell-opslens"]
  ];
  evidenceContext.expectedResources = expectedResources;

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
    "reconcileAPINetworkPolicy",
    "reconcileDashboardDeployment",
    "reconcileDashboardService",
    "reconcileDashboardNetworkPolicy",
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
      controller.includes("Owns(&appsv1.StatefulSet{})") &&
      controller.includes("Owns(&networkingv1.NetworkPolicy{})"),
    "manager watches owned namespaced resources without requiring broad Secret list/watch"
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

  const apiNetworkPolicy = findResource(plan, "NetworkPolicy", "cywell-opslens-api-ingress");
  const dashboardNetworkPolicy = findResource(plan, "NetworkPolicy", "cywell-opslens-dashboard-ingress");
  const networkPolicySources = (policy) =>
    (policy?.spec?.ingress ?? []).flatMap((rule) =>
      (rule.from ?? []).map((peer) => peer.namespaceSelector?.matchLabels?.["kubernetes.io/metadata.name"]).filter(Boolean)
    );
  const networkPolicyAllowsPort = (policy) =>
    (policy?.spec?.ingress ?? []).some((rule) =>
      (rule.ports ?? []).some((port) => port.protocol === "TCP" && port.port === 9443)
    );

  expectCheck(
    "Go NetworkPolicy parity",
    apiNetworkPolicy?.spec?.podSelector?.matchLabels?.["app.kubernetes.io/component"] === "api" &&
      networkPolicySources(apiNetworkPolicy).includes("openshift-console") &&
      networkPolicySources(apiNetworkPolicy).includes("openshift-lightspeed") &&
      networkPolicyAllowsPort(apiNetworkPolicy) &&
      dashboardNetworkPolicy?.spec?.podSelector?.matchLabels?.["app.kubernetes.io/component"] === "dashboard" &&
      networkPolicySources(dashboardNetworkPolicy).includes("openshift-console") &&
      networkPolicyAllowsPort(dashboardNetworkPolicy) &&
      controller.includes("reconcileIngressNetworkPolicy") &&
      controller.includes("networkingv1.NetworkPolicy") &&
      controller.includes("openshift-console") &&
      controller.includes("openshift-lightspeed") &&
      controller.includes("kubernetes.io/metadata.name") &&
      controller.includes("networkingv1.PolicyTypeIngress") &&
      controller.includes("httpsContainerPort"),
    "API/dashboard ingress NetworkPolicies mirror ConsolePlugin and Lightspeed source namespaces on TCP 9443"
  );

  expectCheck(
    "Go vector persistence parity",
      controller.includes("VolumeClaimTemplates") &&
      controller.includes("vector-data") &&
      controller.includes("/var/lib/opslens/vector") &&
      controller.includes("/var/lib/postgresql/data") &&
      controller.includes("/var/lib/postgresql/data/pgdata") &&
      controller.includes("corev1.ResourceStorage"),
    "vector store keeps the TS volume claim and provider-specific mount contract"
  );

  const postgresSecret = findResource(plan, "Secret", "cywell-opslens-postgres-auth");
  expectCheck(
    "Go Postgres auth Secret parity",
    postgresSecret?.stringData?.url?.includes("cywell-opslens-vector.cywell-opslens.svc.cluster.local") &&
      controller.includes("reconcilePostgresAuthSecret") &&
      controller.includes("randomHex") &&
      controller.includes("cywell-opslens-postgres-auth") &&
      controller.includes("postgres://opslens:%s@cywell-opslens-vector.%s.svc.cluster.local:5432/opslens?sslmode=disable"),
    "Postgres auth Secret is generated before API and vector workloads reference it"
  );

  expectCheck(
    "Go CRC lightweight provider guards",
    controller.includes('!= "inmemory"') &&
      controller.includes('!= "mock-local"') &&
      controller.includes('vectorProvider == "pgvector"') &&
      controller.includes('modelProvider != "mock-local"'),
    "inmemory vector store and mock-local model runtime avoid dangling Postgres/vLLM workloads and env"
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

  const lightspeedFunction = extractGoFunction(controller, "reconcileLightspeedRegistration");
  const reconcileCallIndex = controller.indexOf("r.reconcileLightspeedRegistration(ctx, &installation)");
  const statusUpdateIndex = controller.indexOf("r.Status().Update(ctx, &installation)");
  const validateOnlyGuardIndex = lightspeedFunction.indexOf(
    "mode == opslensv1alpha1.LightspeedValidateOnly"
  );
  const validateOnlyReturnIndex =
    validateOnlyGuardIndex >= 0
      ? lightspeedFunction.indexOf("return nil", validateOnlyGuardIndex)
      : -1;
  const endpointGuardIndex = lightspeedFunction.indexOf(
    '!strings.HasSuffix(desiredEndpoint, "/mcp")'
  );
  const getIndex = lightspeedFunction.indexOf("r.Get(ctx, types.NamespacedName");
  const patchIndex = lightspeedFunction.indexOf("r.Patch(ctx, olsConfig");
  const patchCallCount = countMatches(lightspeedFunction, /r\.Patch\s*\(\s*ctx\s*,\s*olsConfig/g);
  const configMapReferenceCount = countMatches(lightspeedFunction, /ConfigMap/g);
  evidenceContext.goLightspeedMutationBoundary = {
    functionFound: Boolean(lightspeedFunction),
    validateOnlyGuardBeforeRead:
      validateOnlyReturnIndex >= 0 &&
      getIndex >= 0 &&
      validateOnlyReturnIndex < getIndex,
    endpointGuardBeforeRead:
      endpointGuardIndex >= 0 &&
      getIndex >= 0 &&
      endpointGuardIndex < getIndex,
    patchCallCount,
    patchAfterRead:
      getIndex >= 0 &&
      patchIndex >= 0 &&
      getIndex < patchIndex,
    configMapReferenceCount,
    reconcileBeforeStatus:
      reconcileCallIndex >= 0 &&
      statusUpdateIndex >= 0 &&
      reconcileCallIndex < statusUpdateIndex
  };

  expectCheck(
    "Go Lightspeed ValidateOnly mutation guard",
    evidenceContext.goLightspeedMutationBoundary.functionFound &&
      evidenceContext.goLightspeedMutationBoundary.validateOnlyGuardBeforeRead &&
      evidenceContext.goLightspeedMutationBoundary.endpointGuardBeforeRead,
    "ValidateOnly returns before OLSConfig reads/patches, and non-/mcp endpoints fail before reading live OLSConfig"
  );

  expectCheck(
    "Go Lightspeed patch call boundary",
    evidenceContext.goLightspeedMutationBoundary.patchCallCount === 1 &&
      evidenceContext.goLightspeedMutationBoundary.patchAfterRead &&
      lightspeedFunction.includes("client.MergeFrom(original)") &&
      lightspeedFunction.includes("opslens.cywell.io/reconcile-mode") &&
      lightspeedFunction.includes("opslens.cywell.io/rollback-path"),
    "reconcileLightspeedRegistration has one OLSConfig Patch call, after reading existing state, with reconcile-mode and rollback annotations"
  );

  expectCheck(
    "Go Lightspeed legacy ConfigMap boundary",
    evidenceContext.goLightspeedMutationBoundary.configMapReferenceCount === 0 &&
      evidenceContext.goLightspeedMutationBoundary.reconcileBeforeStatus,
    "Lightspeed registration source does not reference legacy ConfigMap mutation and status is updated after registration reconciliation"
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
    "RBAC Postgres Secret parity",
    hasRuleFor(clusterRole?.rules ?? [], "", "secrets", ["get", "create", "update", "patch"]) &&
      !hasRuleFor(clusterRole?.rules ?? [], "", "secrets", ["list", "watch"]) &&
      hasRuleFor(csvRules, "", "secrets", ["get", "create", "update", "patch"]) &&
      !hasRuleFor(csvRules, "", "secrets", ["list", "watch"]),
    "config RBAC and CSV RBAC allow generated Postgres auth Secret reconciliation without broad Secret list/watch"
  );

  expectCheck(
    "RBAC leader election parity",
    hasRuleFor(clusterRole?.rules ?? [], "coordination.k8s.io", "leases", ["get", "create", "update", "patch"]) &&
      hasRuleFor(csvRules, "coordination.k8s.io", "leases", ["get", "create", "update", "patch"]),
    "config RBAC and CSV RBAC cover controller-runtime leader election leases"
  );

  expectCheck(
    "RBAC owner finalizer parity",
    hasRuleFor(clusterRole?.rules ?? [], "opslens.cywell.io", "opslensinstallations/finalizers", ["update", "patch"]) &&
      hasRuleFor(csvRules, "opslens.cywell.io", "opslensinstallations/finalizers", ["update", "patch"]),
    "config RBAC and CSV RBAC cover ownerReferences that need finalizer access"
  );

  expectCheck(
    "RBAC NetworkPolicy parity",
    hasRuleFor(clusterRole?.rules ?? [], "networking.k8s.io", "networkpolicies", ["get", "create", "patch"]) &&
      hasRuleFor(csvRules, "networking.k8s.io", "networkpolicies", ["get", "create", "patch"]),
    "config RBAC and CSV RBAC cover the NetworkPolicies reconciled by Go"
  );

  const olsConfigRoleVerbs = ruleVerbsFor(clusterRole?.rules ?? [], "ols.openshift.io", "olsconfigs");
  const olsConfigCsvVerbs = ruleVerbsFor(csvRules, "ols.openshift.io", "olsconfigs");
  expectCheck(
    "RBAC OLSConfig patch-only boundary",
    ["get", "list", "watch", "update", "patch"].every(
      (verb) => olsConfigRoleVerbs.includes(verb) && olsConfigCsvVerbs.includes(verb)
    ) &&
      !olsConfigRoleVerbs.includes("create") &&
      !olsConfigRoleVerbs.includes("delete") &&
      !olsConfigCsvVerbs.includes("create") &&
      !olsConfigCsvVerbs.includes("delete"),
    "config RBAC and CSV RBAC can read/update/patch existing OLSConfig resources but cannot create or delete them"
  );

  expectCheck(
    "Acceptance command mapping",
    acceptance.includes("npm run verify:operator:runtime"),
    "MVP acceptance matrix maps runtime parity to a verifier command"
  );
} catch (error) {
  fail("operator runtime parity verifier", error instanceof Error ? error.message : String(error));
} finally {
  await writeEvidence();
  printSummary();
}
