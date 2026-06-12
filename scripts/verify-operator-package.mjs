#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseAllDocuments } from "yaml";

const paths = {
  crd: "deploy/operator/config/crd/opslens.cywell.io_opslensinstallations.yaml",
  sample: "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation.yaml",
  serviceAccount: "deploy/operator/config/rbac/service_account.yaml",
  clusterRole: "deploy/operator/config/rbac/cluster_role.yaml",
  clusterRoleBinding: "deploy/operator/config/rbac/cluster_role_binding.yaml",
  manager: "deploy/operator/config/manager/manager.yaml",
  apps: "deploy/operator/config/apps/opslens-stack.yaml",
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  bundleCrd: "deploy/operator/bundle/manifests/opslens.cywell.io_opslensinstallations.yaml",
  annotations: "deploy/operator/bundle/metadata/annotations.yaml",
  dockerfile: "deploy/operator/bundle.Dockerfile",
  reconcileCore: "packages/operator-controller/src/reconcile.ts",
  reconcileVerifier: "scripts/verify-operator-reconcile.mjs",
  goMod: "deploy/operator/controller-runtime/go.mod",
  goMain: "deploy/operator/controller-runtime/main.go",
  goApiTypes: "deploy/operator/controller-runtime/api/v1alpha1/opslensinstallation_types.go",
  goController: "deploy/operator/controller-runtime/controllers/opslensinstallation_controller.go",
  goDockerfile: "deploy/operator/controller-runtime/Dockerfile",
  goReadme: "deploy/operator/controller-runtime/README.md"
};

const checks = [];
const yamlCache = new Map();

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

function label(doc) {
  return `${doc?.kind ?? "unknown"}/${doc?.metadata?.name ?? "unknown"}`;
}

async function readText(relativePath) {
  const absolutePath = resolve(relativePath);
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    fail("file exists", `${relativePath} is not readable: ${error.message}`);
    return undefined;
  }
}

async function loadYaml(relativePath) {
  if (yamlCache.has(relativePath)) {
    return yamlCache.get(relativePath);
  }

  const text = await readText(relativePath);
  if (text === undefined) {
    yamlCache.set(relativePath, []);
    return [];
  }

  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  if (errors.length > 0) {
    fail("valid YAML", `${relativePath}: ${errors.map((error) => error.message).join("; ")}`);
    yamlCache.set(relativePath, []);
    return [];
  }

  const parsed = documents
    .map((document) => document.toJSON())
    .filter((document) => document && typeof document === "object");
  pass("valid YAML", `${relativePath} contains ${parsed.length} document(s)`);
  yamlCache.set(relativePath, parsed);
  return parsed;
}

async function loadSingle(relativePath) {
  const documents = await loadYaml(relativePath);
  if (documents.length === 1) {
    return documents[0];
  }
  fail("single YAML document", `${relativePath} expected 1 document, got ${documents.length}`);
  return documents[0];
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

function findDoc(documents, kind, name) {
  return documents.find(
    (document) => document.kind === kind && document.metadata?.name === name
  );
}

function validateCrd(crd, sourceName) {
  if (crd?.kind === "CustomResourceDefinition") {
    pass(`${sourceName} CRD kind`, label(crd));
  } else {
    fail(`${sourceName} CRD kind`, `expected CustomResourceDefinition, got ${label(crd)}`);
  }

  if (crd?.metadata?.name === "opslensinstallations.opslens.cywell.io") {
    pass(`${sourceName} CRD name`, crd.metadata.name);
  } else {
    fail(`${sourceName} CRD name`, `unexpected name ${crd?.metadata?.name ?? "missing"}`);
  }

  if (crd?.spec?.group === "opslens.cywell.io") {
    pass(`${sourceName} CRD group`, crd.spec.group);
  } else {
    fail(`${sourceName} CRD group`, `unexpected group ${crd?.spec?.group ?? "missing"}`);
  }

  if (crd?.spec?.names?.kind === "OpsLensInstallation") {
    pass(`${sourceName} CRD kind name`, crd.spec.names.kind);
  } else {
    fail(`${sourceName} CRD kind name`, `unexpected kind ${crd?.spec?.names?.kind ?? "missing"}`);
  }

  const version = (crd?.spec?.versions ?? []).find((candidate) => candidate.name === "v1alpha1");
  if (version?.served === true && version?.storage === true) {
    pass(`${sourceName} CRD version`, "v1alpha1 served/storage");
  } else {
    fail(`${sourceName} CRD version`, "v1alpha1 is not served/storage");
  }

  if (version?.subresources?.status) {
    pass(`${sourceName} CRD status`, "status subresource is enabled");
  } else {
    fail(`${sourceName} CRD status`, "status subresource is missing");
  }

  const spec = version?.schema?.openAPIV3Schema?.properties?.spec;
  const required = spec?.required ?? [];
  for (const field of ["version", "components", "lightspeedRegistration"]) {
    if (required.includes(field)) {
      pass(`${sourceName} spec requires ${field}`, "required field is present");
    } else {
      fail(`${sourceName} spec requires ${field}`, "required field is missing");
    }
  }

  const mode = spec?.properties?.lightspeedRegistration?.properties?.mode;
  if (mode?.default === "ValidateOnly" && mode?.enum?.includes("PatchOLSConfig")) {
    pass(`${sourceName} registration modes`, "ValidateOnly default, PatchOLSConfig explicit");
  } else {
    fail(`${sourceName} registration modes`, "expected ValidateOnly default and PatchOLSConfig enum");
  }

  const endpoint = spec?.properties?.lightspeedRegistration?.properties?.endpoint;
  if (endpoint?.default?.endsWith("/mcp")) {
    pass(`${sourceName} MCP endpoint default`, endpoint.default);
  } else {
    fail(`${sourceName} MCP endpoint default`, "endpoint default must end with /mcp");
  }

  const rag = spec?.properties?.rag;
  const documentIntake = rag?.properties?.documentIntake?.properties ?? {};
  const approvalQueue = rag?.properties?.approvalQueue?.properties ?? {};
  if (
    documentIntake.mode?.default === "ValidateOnly" &&
    documentIntake.mode?.enum?.length === 1 &&
    documentIntake.rawDocumentReturnAllowed?.default === false
  ) {
    pass(`${sourceName} RAG intake safety`, "ValidateOnly and rawDocumentReturnAllowed=false");
  } else {
    fail(`${sourceName} RAG intake safety`, "expected ValidateOnly-only intake and rawDocumentReturnAllowed=false");
  }

  if (
    approvalQueue.mode?.default === "DesignOnly" &&
    approvalQueue.enqueueAllowed?.default === false
  ) {
    pass(`${sourceName} RAG approval queue`, "DesignOnly enqueueAllowed=false");
  } else {
    fail(`${sourceName} RAG approval queue`, "expected DesignOnly queue with enqueueAllowed=false");
  }

  const validations = spec?.["x-kubernetes-validations"] ?? [];
  if (
    validations.some((validation) => validation.message?.includes("RAG document intake is validate-only")) &&
    validations.some((validation) => validation.message?.includes("RAG raw document return is disabled")) &&
    validations.some((validation) => validation.message?.includes("RAG approval queue enqueue is disabled"))
  ) {
    pass(`${sourceName} RAG CEL validations`, "validate-only, no raw return, no enqueue");
  } else {
    fail(`${sourceName} RAG CEL validations`, "RAG safety validation rules are missing");
  }
}

function validateSample(sample) {
  if (sample?.apiVersion === "opslens.cywell.io/v1alpha1" && sample?.kind === "OpsLensInstallation") {
    pass("sample CR identity", label(sample));
  } else {
    fail("sample CR identity", `${sample?.apiVersion ?? "missing"} ${label(sample)}`);
  }

  const components = sample?.spec?.components ?? {};
  for (const field of ["api", "dashboard", "vectorStore", "modelRuntime"]) {
    if (components[field]) {
      pass(`sample component ${field}`, "component is configured");
    } else {
      fail(`sample component ${field}`, "component is missing");
    }
  }

  if (sample?.spec?.lightspeedRegistration?.mode === "PatchOLSConfig") {
    pass("sample Lightspeed mode", "PatchOLSConfig is explicit");
  } else {
    fail("sample Lightspeed mode", "sample must explicitly opt in to PatchOLSConfig");
  }

  if (sample?.spec?.lightspeedRegistration?.endpoint?.endsWith("/mcp")) {
    pass("sample Lightspeed endpoint", sample.spec.lightspeedRegistration.endpoint);
  } else {
    fail("sample Lightspeed endpoint", "endpoint must end with /mcp");
  }

  if (sample?.spec?.consolePlugin?.enabled === true) {
    pass("sample ConsolePlugin", "enabled=true");
  } else {
    fail("sample ConsolePlugin", "consolePlugin.enabled must be true");
  }

  if (
    sample?.spec?.rag?.documentIntake?.mode === "ValidateOnly" &&
    sample?.spec?.rag?.documentIntake?.evidenceExport === true &&
    sample?.spec?.rag?.documentIntake?.rawDocumentReturnAllowed === false
  ) {
    pass("sample RAG document intake", "ValidateOnly evidenceExport=true rawDocumentReturnAllowed=false");
  } else {
    fail("sample RAG document intake", "sample must declare validate-only document intake");
  }

  if (
    sample?.spec?.rag?.approvalQueue?.mode === "DesignOnly" &&
    sample?.spec?.rag?.approvalQueue?.enqueueAllowed === false &&
    (sample?.spec?.rag?.approvalQueue?.requiredApprovals ?? []).includes("rag-owner") &&
    (sample?.spec?.rag?.approvalQueue?.requiredApprovals ?? []).includes("cluster-sre")
  ) {
    pass("sample RAG approval queue", "DesignOnly enqueueAllowed=false with required approvals");
  } else {
    fail("sample RAG approval queue", "sample must declare design-only approval queue");
  }
}

function validateRbac(clusterRole, csv) {
  const rbacRules = clusterRole?.rules ?? [];
  if (hasRuleFor(rbacRules, "ols.openshift.io", "olsconfigs", ["get", "patch"])) {
    pass("config RBAC OLSConfig", "operator can read and patch olsconfigs");
  } else {
    fail("config RBAC OLSConfig", "olsconfigs get/patch permissions are missing");
  }

  if (hasRuleFor(rbacRules, "console.openshift.io", "consoleplugins", ["get", "create", "patch"])) {
    pass("config RBAC ConsolePlugin", "operator can manage consoleplugins");
  } else {
    fail("config RBAC ConsolePlugin", "consoleplugins get/create/patch permissions are missing");
  }

  if (hasRuleFor(rbacRules, "", "serviceaccounts", ["get", "create", "patch"])) {
    pass("config RBAC ServiceAccount", "operator can reconcile the API service account");
  } else {
    fail("config RBAC ServiceAccount", "serviceaccounts get/create/patch permissions are missing");
  }

  if (hasRuleFor(rbacRules, "networking.k8s.io", "networkpolicies", ["get", "create", "patch"])) {
    pass("config RBAC NetworkPolicy", "operator can reconcile ingress NetworkPolicies");
  } else {
    fail("config RBAC NetworkPolicy", "networkpolicies get/create/patch permissions are missing");
  }

  if (!hasRuleFor(rbacRules, "", "secrets", ["get"])) {
    pass("config RBAC no Secret read", "operator does not receive raw Secret read permissions in MVP 0.1");
  } else {
    fail("config RBAC no Secret read", "secrets get/list/watch permissions must stay out of MVP 0.1");
  }

  const csvRules = (csv?.spec?.install?.spec?.clusterPermissions ?? []).flatMap(
    (permission) => permission.rules ?? []
  );
  if (hasRuleFor(csvRules, "opslens.cywell.io", "opslensinstallations", ["get", "list", "watch"])) {
    pass("CSV RBAC custom resource", "owns opslensinstallations watch path");
  } else {
    fail("CSV RBAC custom resource", "opslensinstallations watch permissions are missing");
  }

  if (hasRuleFor(csvRules, "ols.openshift.io", "olsconfigs", ["get", "patch"])) {
    pass("CSV RBAC OLSConfig", "can reconcile Lightspeed registration");
  } else {
    fail("CSV RBAC OLSConfig", "olsconfigs get/patch permissions are missing");
  }

  if (hasRuleFor(csvRules, "console.openshift.io", "consoleplugins", ["get", "create", "patch"])) {
    pass("CSV RBAC ConsolePlugin", "can reconcile ConsolePlugin");
  } else {
    fail("CSV RBAC ConsolePlugin", "consoleplugins permissions are missing");
  }

  if (hasRuleFor(csvRules, "", "serviceaccounts", ["get", "create", "patch"])) {
    pass("CSV RBAC ServiceAccount", "can reconcile the API service account");
  } else {
    fail("CSV RBAC ServiceAccount", "serviceaccounts permissions are missing");
  }

  if (hasRuleFor(csvRules, "networking.k8s.io", "networkpolicies", ["get", "create", "patch"])) {
    pass("CSV RBAC NetworkPolicy", "can reconcile API/dashboard ingress NetworkPolicies");
  } else {
    fail("CSV RBAC NetworkPolicy", "networkpolicies permissions are missing");
  }

  if (!hasRuleFor(csvRules, "", "secrets", ["get"])) {
    pass("CSV RBAC no Secret read", "operator bundle does not grant raw Secret read permissions");
  } else {
    fail("CSV RBAC no Secret read", "CSV must not grant secrets get/list/watch in MVP 0.1");
  }
}

function validateCsv(csv) {
  if (csv?.kind === "ClusterServiceVersion") {
    pass("CSV kind", label(csv));
  } else {
    fail("CSV kind", `expected ClusterServiceVersion, got ${label(csv)}`);
  }

  const ownedCrds = csv?.spec?.customresourcedefinitions?.owned ?? [];
  if (ownedCrds.some((crd) => crd.name === "opslensinstallations.opslens.cywell.io")) {
    pass("CSV owned CRD", "OpsLensInstallation is declared as owned");
  } else {
    fail("CSV owned CRD", "OpsLensInstallation CRD is not declared as owned");
  }

  if (csv?.spec?.install?.strategy === "deployment") {
    pass("CSV install strategy", "deployment");
  } else {
    fail("CSV install strategy", `unexpected strategy ${csv?.spec?.install?.strategy ?? "missing"}`);
  }

  const deployment = csv?.spec?.install?.spec?.deployments?.find(
    (candidate) => candidate.name === "cywell-opslens-operator"
  );
  if (deployment?.spec?.template?.spec?.serviceAccountName === "cywell-opslens-operator") {
    pass("CSV manager deployment", "uses cywell-opslens-operator service account");
  } else {
    fail("CSV manager deployment", "operator deployment or service account is missing");
  }

  const relatedImages = (csv?.spec?.relatedImages ?? []).map((image) => image.name);
  for (const imageName of ["operator", "api", "dashboard", "vllm", "qdrant"]) {
    if (relatedImages.includes(imageName)) {
      pass(`CSV related image ${imageName}`, "declared");
    } else {
      fail(`CSV related image ${imageName}`, "missing");
    }
  }
}

function validateApps(apps) {
  const required = [
    ["ServiceAccount", "cywell-opslens-api"],
    ["ConfigMap", "cywell-opslens-rag-policy"],
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
    ["ConsolePlugin", "cywell-opslens"],
    ["OLSConfig", "cluster"]
  ];

  for (const [kind, name] of required) {
    if (findDoc(apps, kind, name)) {
      pass(`app manifest ${kind}/${name}`, "present");
    } else {
      fail(`app manifest ${kind}/${name}`, "missing");
    }
  }

  const api = findDoc(apps, "Deployment", "cywell-opslens-api");
  const env = api?.spec?.template?.spec?.containers?.[0]?.env ?? [];
  const actionMode = env.find((entry) => entry.name === "CYWELL_OPSLENS_ACTION_MODE")?.value;
  if (actionMode === "plan-only") {
    pass("API action mode", "plan-only");
  } else {
    fail("API action mode", "CYWELL_OPSLENS_ACTION_MODE=plan-only is missing");
  }

  const envValue = (name) => env.find((entry) => entry.name === name)?.value;
  if (
    envValue("CYWELL_OPSLENS_RAG_DOCUMENT_INTAKE_MODE") === "validate-only" &&
    envValue("CYWELL_OPSLENS_RAG_RUNTIME_MODE") === "local" &&
    envValue("CYWELL_OPSLENS_RAG_EVIDENCE_EXPORT") === "enabled" &&
    envValue("CYWELL_OPSLENS_RAG_RAW_DOCUMENT_RETURN_ALLOWED") === "false" &&
    envValue("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_MODE") === "design-only" &&
    envValue("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED") === "false"
  ) {
    pass("API RAG safety env", "validate-only runtime-local export-enabled design-only no-raw no-enqueue");
  } else {
    fail("API RAG safety env", "RAG safety environment variables are missing or unsafe");
  }

  const serviceCertAnnotation = "service.beta.openshift.io/serving-cert-secret-name";
  const apiService = findDoc(apps, "Service", "cywell-opslens-api");
  const apiNetworkPolicy = findDoc(apps, "NetworkPolicy", "cywell-opslens-api-ingress");
  const dashboard = findDoc(apps, "Deployment", "cywell-opslens-dashboard");
  const dashboardService = findDoc(apps, "Service", "cywell-opslens-dashboard");
  const dashboardNetworkPolicy = findDoc(apps, "NetworkPolicy", "cywell-opslens-dashboard-ingress");
  const apiContainer = api?.spec?.template?.spec?.containers?.[0] ?? {};
  const dashboardContainer = dashboard?.spec?.template?.spec?.containers?.[0] ?? {};
  const dashboardEnv = dashboardContainer.env ?? [];
  const hasEnv = (entries, name, value) => entries.some((entry) => entry.name === name && entry.value === value);
  const hasVolume = (deployment, secretName) =>
    (deployment?.spec?.template?.spec?.volumes ?? []).some(
      (volume) => volume.name === "service-serving-cert" && volume.secret?.secretName === secretName
    );
  const hasMount = (container) =>
    (container.volumeMounts ?? []).some(
      (mount) =>
        mount.name === "service-serving-cert" &&
        mount.mountPath === "/var/run/secrets/cywell-opslens/tls" &&
        mount.readOnly === true
    );
  const hasHttpsReadiness = (container) =>
    container.readinessProbe?.httpGet?.path === "/healthz" &&
    container.readinessProbe?.httpGet?.port === "https" &&
    container.readinessProbe?.httpGet?.scheme === "HTTPS";
  const hasHttpsPort = (service) =>
    (service?.spec?.ports ?? []).some(
      (port) => port.name === "https" && port.port === 443 && port.targetPort === "https"
    );
  const allowsNamespace = (policy, namespace) =>
    (policy?.spec?.ingress ?? []).some((rule) =>
      (rule.from ?? []).some(
        (peer) => peer.namespaceSelector?.matchLabels?.["kubernetes.io/metadata.name"] === namespace
      )
    );
  const allowsOpsLensPods = (policy) =>
    (policy?.spec?.ingress ?? []).some((rule) =>
      (rule.from ?? []).some(
        (peer) => peer.podSelector?.matchLabels?.["app.kubernetes.io/name"] === "cywell-opslens"
      )
    );
  const allowsHttpsRuntimePort = (policy) =>
    (policy?.spec?.ingress ?? []).some((rule) =>
      (rule.ports ?? []).some((port) => port.protocol === "TCP" && port.port === 9443)
    );

  if (
    apiService?.metadata?.annotations?.[serviceCertAnnotation] === "cywell-opslens-api-tls" &&
    dashboardService?.metadata?.annotations?.[serviceCertAnnotation] === "cywell-opslens-dashboard-tls" &&
    hasHttpsPort(apiService) &&
    hasHttpsPort(dashboardService)
  ) {
    pass("ConsolePlugin HTTPS Services", "API and dashboard services use service-ca serving certs on port 443");
  } else {
    fail("ConsolePlugin HTTPS Services", "API/dashboard services must expose https:443 with service serving cert annotations");
  }

  if (
    hasEnv(env, "KUGNUS_API_HOST", "0.0.0.0") &&
    hasEnv(env, "KUGNUS_API_PORT", "9443") &&
    hasEnv(env, "CYWELL_OPSLENS_TLS_CERT_FILE", "/var/run/secrets/cywell-opslens/tls/tls.crt") &&
    hasEnv(env, "CYWELL_OPSLENS_TLS_KEY_FILE", "/var/run/secrets/cywell-opslens/tls/tls.key") &&
    hasVolume(api, "cywell-opslens-api-tls") &&
    hasMount(apiContainer) &&
    hasHttpsReadiness(apiContainer)
  ) {
    pass("API HTTPS runtime", "service-ca cert is mounted and readiness probes HTTPS /healthz on 9443");
  } else {
    fail("API HTTPS runtime", "API deployment must mount service-ca TLS and probe HTTPS /healthz");
  }

  if (
    hasEnv(dashboardEnv, "HOST", "0.0.0.0") &&
    hasEnv(dashboardEnv, "PORT", "9443") &&
    hasEnv(dashboardEnv, "CYWELL_OPSLENS_TLS_CERT_FILE", "/var/run/secrets/cywell-opslens/tls/tls.crt") &&
    hasEnv(dashboardEnv, "CYWELL_OPSLENS_TLS_KEY_FILE", "/var/run/secrets/cywell-opslens/tls/tls.key") &&
    hasVolume(dashboard, "cywell-opslens-dashboard-tls") &&
    hasMount(dashboardContainer) &&
    hasHttpsReadiness(dashboardContainer)
  ) {
    pass("Dashboard HTTPS runtime", "service-ca cert is mounted and readiness probes HTTPS /healthz on 9443");
  } else {
    fail("Dashboard HTTPS runtime", "Dashboard deployment must mount service-ca TLS and probe HTTPS /healthz");
  }

  if (
    apiNetworkPolicy?.spec?.podSelector?.matchLabels?.["app.kubernetes.io/component"] === "api" &&
    (apiNetworkPolicy?.spec?.policyTypes ?? []).includes("Ingress") &&
    allowsNamespace(apiNetworkPolicy, "openshift-console") &&
    allowsNamespace(apiNetworkPolicy, "openshift-lightspeed") &&
    allowsOpsLensPods(apiNetworkPolicy) &&
    allowsHttpsRuntimePort(apiNetworkPolicy)
  ) {
    pass("API ingress NetworkPolicy", "allows Console proxy, Lightspeed MCP, and same-app pods to API 9443");
  } else {
    fail("API ingress NetworkPolicy", "API NetworkPolicy must allow openshift-console, openshift-lightspeed, same-app pods, and TCP 9443");
  }

  if (
    dashboardNetworkPolicy?.spec?.podSelector?.matchLabels?.["app.kubernetes.io/component"] === "dashboard" &&
    (dashboardNetworkPolicy?.spec?.policyTypes ?? []).includes("Ingress") &&
    allowsNamespace(dashboardNetworkPolicy, "openshift-console") &&
    allowsOpsLensPods(dashboardNetworkPolicy) &&
    allowsHttpsRuntimePort(dashboardNetworkPolicy)
  ) {
    pass("Dashboard ingress NetworkPolicy", "allows Console plugin asset loading and same-app pods to dashboard 9443");
  } else {
    fail("Dashboard ingress NetworkPolicy", "Dashboard NetworkPolicy must allow openshift-console, same-app pods, and TCP 9443");
  }

  const consolePlugin = findDoc(apps, "ConsolePlugin", "cywell-opslens");
  const consoleProxy = consolePlugin?.spec?.proxy?.[0];
  if (
    consolePlugin?.spec?.backend?.type === "Service" &&
    consolePlugin?.spec?.backend?.service?.name === "cywell-opslens-dashboard" &&
    consolePlugin?.spec?.backend?.service?.namespace === "cywell-opslens" &&
    consolePlugin?.spec?.backend?.service?.port === 443 &&
    consolePlugin?.spec?.backend?.service?.basePath === "/" &&
    consolePlugin?.spec?.service === undefined
  ) {
    pass("ConsolePlugin backend schema", "uses spec.backend Service on HTTPS service port 443");
  } else {
    fail("ConsolePlugin backend schema", "ConsolePlugin must use spec.backend Service, not legacy spec.service");
  }

  if (
    consoleProxy?.alias === "opslens-api" &&
    consoleProxy?.authorization === "UserToken" &&
    consoleProxy?.endpoint?.type === "Service" &&
    consoleProxy?.endpoint?.service?.name === "cywell-opslens-api" &&
    consoleProxy?.endpoint?.service?.namespace === "cywell-opslens" &&
    consoleProxy?.endpoint?.service?.port === 443 &&
    consoleProxy?.authorize === undefined &&
    consoleProxy?.service === undefined
  ) {
    pass("ConsolePlugin proxy schema", "uses UserToken proxy endpoint Service for OpsLens API");
  } else {
    fail("ConsolePlugin proxy schema", "ConsolePlugin proxy must use authorization=UserToken and endpoint.service, not legacy authorize/service");
  }

  const ragPolicy = findDoc(apps, "ConfigMap", "cywell-opslens-rag-policy");
  if (
    ragPolicy?.data?.documentIntakeMode === "validate-only" &&
    ragPolicy?.data?.evidenceExport === "enabled" &&
    ragPolicy?.data?.rawDocumentReturnAllowed === "false" &&
    ragPolicy?.data?.approvalQueueMode === "design-only" &&
    ragPolicy?.data?.approvalQueueEnqueueAllowed === "false"
  ) {
    pass("RAG policy ConfigMap", "validate-only evidence export enabled design-only no-enqueue");
  } else {
    fail("RAG policy ConfigMap", "RAG policy ConfigMap is missing or unsafe");
  }

  const ols = findDoc(apps, "OLSConfig", "cluster");
  const gates = ols?.spec?.featureGates ?? [];
  const mcp = (ols?.spec?.mcpServers ?? []).find((server) => server.name === "cywell-opslens");
  if (gates.includes("MCPServer")) {
    pass("managed OLSConfig feature gate", "MCPServer");
  } else {
    fail("managed OLSConfig feature gate", "MCPServer is missing");
  }

  if (mcp?.url?.endsWith("/mcp")) {
    pass("managed OLSConfig MCP URL", mcp.url);
  } else {
    fail("managed OLSConfig MCP URL", "cywell-opslens server URL must end with /mcp");
  }

  const headerTypes = (mcp?.headers ?? []).map((header) => header.valueFrom?.type);
  if (headerTypes.includes("kubernetes") && headerTypes.includes("secret")) {
    pass("managed OLSConfig headers", "kubernetes user token and secret header are configured");
  } else {
    fail("managed OLSConfig headers", "expected kubernetes and secret header types");
  }

  if (ols?.metadata?.annotations?.["opslens.cywell.io/reconcile-mode"] === "PatchOLSConfig") {
    pass("managed OLSConfig reconcile annotation", "PatchOLSConfig");
  } else {
    fail("managed OLSConfig reconcile annotation", "PatchOLSConfig annotation is missing");
  }
}

function validateAnnotations(annotations) {
  const values = annotations?.annotations ?? {};
  const expected = {
    "operators.operatorframework.io.bundle.package.v1": "cywell-opslens",
    "operators.operatorframework.io.bundle.channels.v1": "alpha",
    "operators.operatorframework.io.bundle.channel.default.v1": "alpha"
  };

  for (const [key, value] of Object.entries(expected)) {
    if (values[key] === value) {
      pass(`bundle annotation ${key}`, value);
    } else {
      fail(`bundle annotation ${key}`, `expected ${value}, got ${values[key] ?? "missing"}`);
    }
  }
}

async function validateDockerfile() {
  const text = await readText(paths.dockerfile);
  if (!text) {
    return;
  }

  for (const pattern of [
    "operators.operatorframework.io.bundle.mediatype.v1",
    "COPY bundle/manifests /manifests/",
    "COPY bundle/metadata /metadata/"
  ]) {
    if (text.includes(pattern)) {
      pass(`bundle Dockerfile ${pattern}`, "present");
    } else {
      fail(`bundle Dockerfile ${pattern}`, "missing");
    }
  }
}

async function validateBundleDirectory() {
  const files = await readdir(resolve("deploy/operator/bundle/manifests"));
  if (files.includes("cywell-opslens-operator.clusterserviceversion.yaml") && files.includes("opslens.cywell.io_opslensinstallations.yaml")) {
    pass("bundle manifests", "CSV and CRD are present");
  } else {
    fail("bundle manifests", `unexpected manifest files: ${files.join(", ")}`);
  }
}

async function validateReconcileCore() {
  const coreText = await readText(paths.reconcileCore);
  if (coreText?.includes("buildOpsLensReconcilePlan") && coreText.includes("planLightspeedRegistration")) {
    pass("controller reconcile core", "buildOpsLensReconcilePlan and planLightspeedRegistration are present");
  } else {
    fail("controller reconcile core", "reconcile core exports are missing");
  }

  if (coreText?.includes("ValidateOnly") && coreText.includes("PatchOLSConfig")) {
    pass("controller registration modes", "ValidateOnly and PatchOLSConfig paths are implemented");
  } else {
    fail("controller registration modes", "registration mode handling is incomplete");
  }

  if (
    coreText?.includes("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED") &&
    coreText.includes("ragApprovalQueueMutationAllowed: false") &&
    coreText.includes("cywell-opslens-rag-policy")
  ) {
    pass("controller RAG approval policy", "design-only queue policy is rendered and mutation is blocked");
  } else {
    fail("controller RAG approval policy", "controller does not render RAG approval safety policy");
  }

  const verifierText = await readText(paths.reconcileVerifier);
  if (verifierText?.includes("buildOpsLensReconcilePlan") && verifierText.includes("Missing OLSConfig blocks patching")) {
    pass("controller reconcile verifier", "fixture-based reconcile verifier is present");
  } else {
    fail("controller reconcile verifier", "verify-operator-reconcile.mjs does not cover reconcile core");
  }
}

async function validateControllerRuntimeSkeleton() {
  const goMod = await readText(paths.goMod);
  const main = await readText(paths.goMain);
  const apiTypes = await readText(paths.goApiTypes);
  const controller = await readText(paths.goController);
  const dockerfile = await readText(paths.goDockerfile);
  const readme = await readText(paths.goReadme);

  if (goMod?.includes("module github.com/cywell/opslens-operator") && goMod.includes("sigs.k8s.io/controller-runtime")) {
    pass("Go manager module", "controller-runtime module is declared");
  } else {
    fail("Go manager module", "controller-runtime go.mod is missing or incomplete");
  }

  if (
    main?.includes("ctrl.NewManager") &&
    main.includes("SetupWithManager") &&
    main.includes("AddToScheme") &&
    main.includes("leader-elect") &&
    main.includes("healthz") &&
    main.includes("readyz")
  ) {
    pass("Go manager entrypoint", "manager wires scheme, controller, leader election, health checks");
  } else {
    fail("Go manager entrypoint", "main.go does not wire controller-runtime manager contract");
  }

  if (
    apiTypes?.includes("type OpsLensInstallationSpec struct") &&
    apiTypes.includes("RAG                    *OpsLensRAGPolicy") &&
    apiTypes.includes("LightspeedRegistration LightspeedRegistrationSpec") &&
    apiTypes.includes("DeepCopyObject() runtime.Object") &&
    apiTypes.includes("SchemeBuilder.Register")
  ) {
    pass("Go API types", "OpsLensInstallation API types include RAG policy and runtime object registration");
  } else {
    fail("Go API types", "OpsLensInstallation Go API types are incomplete");
  }

  if (
    controller?.includes("func (r *OpsLensInstallationReconciler) Reconcile") &&
    controller.includes("SetupWithManager") &&
    controller.includes("controllerutil.CreateOrUpdate") &&
    controller.includes("networkingv1.NetworkPolicy") &&
    controller.includes("openshift-console") &&
    controller.includes("openshift-lightspeed") &&
    controller.includes("kubernetes.io/metadata.name") &&
    controller.includes("ValidateOnly") &&
    controller.includes("PatchOLSConfig") &&
    controller.includes("cywell-opslens-rag-policy") &&
    controller.includes("CYWELL_OPSLENS_RAG_APPROVAL_QUEUE_ENQUEUE_ALLOWED") &&
    controller.includes('Value: "false"') &&
    controller.includes("RagApprovalQueue") &&
    controller.includes("Status().Update")
  ) {
    pass("Go reconcile skeleton", "controller-runtime reconcile path preserves Lightspeed, NetworkPolicy, and RAG safety contracts");
  } else {
    fail("Go reconcile skeleton", "controller-runtime reconcile skeleton is missing safety-critical contract text");
  }

  if (
    controller?.includes("desiredLightspeedMCPServer") &&
    controller.includes("r.Get(ctx, types.NamespacedName") &&
    controller.includes("appendUniqueString(featureGates, \"MCPServer\")") &&
    controller.includes("upsertMCPServer") &&
    controller.includes("client.MergeFrom(original)") &&
    controller.includes("r.Patch(ctx, olsConfig") &&
    controller.includes("opslens.cywell.io/rollback-path")
  ) {
    pass("Go OLSConfig patch source", "PatchOLSConfig source reads, preserves, upserts, annotates, and patches OLSConfig");
  } else {
    fail("Go OLSConfig patch source", "controller-runtime OLSConfig patch source path is incomplete");
  }

  if (
    dockerfile?.includes("FROM golang:1.22 AS builder") &&
    dockerfile.includes("go build -o manager ./main.go") &&
    dockerfile.includes("ubi-minimal") &&
    dockerfile.includes('ENTRYPOINT ["/manager"]')
  ) {
    pass("Go manager Dockerfile", "multi-stage manager image build is scaffolded");
  } else {
    fail("Go manager Dockerfile", "controller-runtime Dockerfile is missing expected build/runtime stages");
  }

  if (
    readme?.includes("scaffolded source contract") &&
    readme.includes("go test ./...") &&
    readme.includes("RAG approval queue is `design-only`")
  ) {
    pass("Go manager README", "tooling limitation and next runtime steps are documented");
  } else {
    fail("Go manager README", "controller-runtime README is missing status or next steps");
  }
}

function printSummary() {
  const statusWeight = {
    FAIL: 0,
    WARN: 1,
    PASS: 2
  };

  for (const check of checks.sort((left, right) => statusWeight[left.status] - statusWeight[right.status])) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }

  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  console.log("");
  console.log(`Cywell OpsLens Operator package verification: ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

try {
  const crd = await loadSingle(paths.crd);
  const sample = await loadSingle(paths.sample);
  await loadSingle(paths.serviceAccount);
  const clusterRole = await loadSingle(paths.clusterRole);
  await loadSingle(paths.clusterRoleBinding);
  await loadSingle(paths.manager);
  const apps = await loadYaml(paths.apps);
  const csv = await loadSingle(paths.csv);
  const bundleCrd = await loadSingle(paths.bundleCrd);
  const annotations = await loadSingle(paths.annotations);

  validateCrd(crd, "config");
  validateCrd(bundleCrd, "bundle");
  validateSample(sample);
  validateCsv(csv);
  validateRbac(clusterRole, csv);
  validateApps(apps);
  validateAnnotations(annotations);
  await validateDockerfile();
  await validateBundleDirectory();
  await validateReconcileCore();
  await validateControllerRuntimeSkeleton();

  warn(
    "live Operator SDK runtime",
    "Go/controller-runtime source and OLSConfig patch path are present, but local Go/Operator SDK execution and live OLM install smoke remain next Stage 4 lanes"
  );
} catch (error) {
  fail("operator package verifier", error.message);
} finally {
  printSummary();
}
