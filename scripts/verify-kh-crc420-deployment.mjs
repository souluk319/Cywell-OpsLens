#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import https from "node:https";
import { dirname, resolve } from "node:path";

const expectedVersion =
  process.argv.find((arg) => arg.startsWith("--expected-version="))?.split("=")[1] ??
  process.env.CYWELL_EXPECTED_VERSION ??
  "0.1.8";
const expectedMinor =
  process.argv.find((arg) => arg.startsWith("--expected-minor="))?.split("=")[1] ??
  process.env.CYWELL_EXPECTED_OCP_MINOR ??
  "4.20";
const sshHost =
  process.argv.find((arg) => arg.startsWith("--ssh-host="))?.split("=")[1] ??
  process.env.CYWELL_KH_SSH_HOST ??
  "Kugnus-Home";
const expectedTagPrefix =
  process.argv.find((arg) => arg.startsWith("--expected-tag-prefix="))?.split("=")[1] ??
  process.env.CYWELL_EXPECTED_TAG_PREFIX ??
  `v${expectedVersion}-kh-crc420-`;
const evidenceOut = resolve("test-results/cywell-opslens-kh-crc420-deployment.json");
const namespace = "cywell-opslens";
const catalogNamespace = "openshift-marketplace";
const catalogSourceName = "cywell-opslens-catalog";
const csvName = `cywell-opslens-operator.v${expectedVersion}`;

const checks = [];
const warnings = [];
const failures = [];

function redact(value) {
  return String(value ?? "")
    .replace(/\b(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, "<redacted-ip>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function record(status, id, detail, extra = {}) {
  const item = { status, id, detail: redact(detail), ...extra };
  checks.push(item);
  if (status === "WARN") warnings.push(`${id}: ${item.detail}`);
  if (status === "FAIL") failures.push(`${id}: ${item.detail}`);
  console.log(`[${status}] ${id}: ${item.detail}`);
}

function pass(id, detail, extra) {
  record("PASS", id, detail, extra);
}

function warn(id, detail, extra) {
  record("WARN", id, detail, extra);
}

function fail(id, detail, extra) {
  record("FAIL", id, detail, extra);
}

function run(command, args, timeoutMs = 15000) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: redact(result.stdout?.trim() ?? ""),
    stderr: redact(result.stderr?.trim() ?? result.error?.message ?? "")
  };
}

function runRemoteOc(args, timeoutMs = 20000) {
  return run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshHost, "oc", ...args], timeoutMs);
}

function runRemotePowerShell(script, timeoutMs = 20000) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return run(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshHost, "powershell", "-NoProfile", "-EncodedCommand", encoded],
    timeoutMs
  );
}

function getJson(id, args, timeoutMs = 20000) {
  const result = runRemoteOc([...args, "-o", "json"], timeoutMs);
  if (!result.ok) {
    fail(id, result.stderr || result.stdout || "oc command failed");
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(id, `could not parse JSON: ${error.message}`);
    return undefined;
  }
}

function imageTag(image) {
  const value = String(image ?? "");
  const tag = value.split(":").pop() ?? "";
  return tag.includes("/") ? "" : tag;
}

function imageIncludesExpectedTag(image) {
  return imageTag(image).startsWith(expectedTagPrefix);
}

function condition(resource, type) {
  return resource?.status?.conditions?.find((item) => item.type === type)?.status ?? "Unknown";
}

function deploymentReady(deployment) {
  return (
    Number(deployment?.status?.availableReplicas ?? 0) >=
      Number(deployment?.spec?.replicas ?? 1) &&
    condition(deployment, "Available") === "True"
  );
}

function isPodReady(pod) {
  const statuses = pod?.status?.containerStatuses ?? [];
  return statuses.length > 0 && statuses.every((status) => status.ready === true);
}

function parseMinor(version) {
  const match = String(version ?? "").match(/^(\d+\.\d+)/);
  return match?.[1] ?? "unknown";
}

function httpsRequest(url, { method = "HEAD", timeoutMs = 8000 } = {}) {
  return new Promise((resolveHttps) => {
    const request = https.request(
      url,
      { method, rejectUnauthorized: false, timeout: timeoutMs },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolveHttps({ ok: true, statusCode: response.statusCode ?? 0 });
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      resolveHttps({ ok: false, statusCode: 0, error: redact(error.message) });
    });
    request.end();
  });
}

function firstContainerImage(resource) {
  return resource?.spec?.template?.spec?.containers?.[0]?.image ?? "";
}

function relatedImages(packageManifest) {
  return packageManifest?.status?.channels?.[0]?.currentCSVDesc?.relatedImages ?? [];
}

function runApiPodNodeProbe(probeCode, timeoutMs = 20000) {
  return runRemotePowerShell(
    [
      "$ErrorActionPreference = 'Stop'",
      "$code = @'",
      probeCode,
      "'@",
      `oc exec deploy/cywell-opslens-api -n ${namespace} -- node -e $code`
    ].join("\n"),
    timeoutMs
  );
}

function runApiPodKubernetesProbe() {
  const probeCode = [
    "const https=require('https'),fs=require('fs');",
    "const token=fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token','utf8');",
    "const ca=fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');",
    "const req=https.get('https://kubernetes.default.svc/version',{ca,headers:{authorization:'Bearer '+token},timeout:5000},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);console.log(JSON.stringify({status:r.statusCode,gitVersion:j.gitVersion||'unknown'}));}catch(e){console.log(JSON.stringify({status:r.statusCode,parseError:e.message}));process.exit(2);}})});",
    "req.on('timeout',()=>req.destroy(new Error('timeout')));",
    "req.on('error',e=>{console.error(e.message);process.exit(1);});"
  ].join("");

  return runApiPodNodeProbe(probeCode, 20000);
}

function runApiPodLightspeedReadinessProbe() {
  const probeCode = [
    "const https=require('https');",
    "const req=https.get('https://lightspeed-app-server.openshift-lightspeed.svc.cluster.local:8443/readiness',{rejectUnauthorized:false,timeout:7000},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);console.log(JSON.stringify({status:r.statusCode,ready:j.ready===true,reason:j.reason||''}));}catch(e){console.log(JSON.stringify({status:r.statusCode,body:b.slice(0,160)}));process.exit(2);}})});",
    "req.on('timeout',()=>req.destroy(new Error('timeout')));",
    "req.on('error',e=>{console.error(e.message);process.exit(1);});"
  ].join("");

  return runApiPodNodeProbe(probeCode, 20000);
}

function runApiPodBuildConfigProbe() {
  const probeCode = [
    "const https=require('https');",
    "const path='/api/ocp/resources?apiVersion=build.openshift.io%2Fv1&resource=buildconfigs&limit=50';",
    "const req=https.get('https://127.0.0.1:9443'+path,{rejectUnauthorized:false,timeout:10000},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);console.log(JSON.stringify({status:r.statusCode,kind:j.resource?.kind||j.kind||'',group:j.resource?.group||'',items:Array.isArray(j.items)?j.items.length:null,error:j.error||''}));}catch(e){console.log(JSON.stringify({status:r.statusCode,body:b.slice(0,180),parseError:e.message}));process.exit(2);}})});",
    "req.on('timeout',()=>req.destroy(new Error('timeout')));",
    "req.on('error',e=>{console.error(e.message);process.exit(1);});"
  ].join("");

  return runApiPodNodeProbe(probeCode, 20000);
}

function runApiPodConsoleOverviewProbe() {
  const probeCode = [
    "const https=require('https');",
    "const req=https.get('https://127.0.0.1:9443/api/ocp/console-overview',{rejectUnauthorized:false,timeout:20000},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);const u=j.consoleDashboard?.utilization||{};const series=Array.isArray(u.series)?u.series:[];console.log(JSON.stringify({status:r.statusCode,enabled:u.enabled===true,reachable:u.reachable===true,source:u.source||'',error:u.error||'',series:series.map(s=>({id:s.id,samples:Array.isArray(s.samples)?s.samples.length:0,latest:s.latest??null,error:s.error||''}))}));}catch(e){console.log(JSON.stringify({status:r.statusCode,body:b.slice(0,180),parseError:e.message}));process.exit(2);}})});",
    "req.on('timeout',()=>req.destroy(new Error('timeout')));",
    "req.on('error',e=>{console.error(e.message);process.exit(1);});"
  ].join("");

  return runApiPodNodeProbe(probeCode, 30000);
}

function runApiPodAssistantProbe() {
  const probeCode = [
    "const https=require('https');",
    "const payload=JSON.stringify({mode:'ask',prompt:'ClusterVersion 상태를 한 문장으로 요약해줘.',scenario:'KH CRC 4.20 deployment verifier',context:{clusterId:'kh-crc-420',user:'kubeadmin',route:'/dashboards',perspective:'Administrator',namespace:'default',resource:{apiVersion:'config.openshift.io/v1',kind:'ClusterVersion',name:'version',uid:'verification'},selectedTab:'overview',filters:{source:'verification'},visibleRows:[],attachedEvidence:['verification-smoke','read-only'],rbac:{role:'cluster-admin',deniedNamespaces:[]}}});",
    "const req=https.request('https://127.0.0.1:9443/api/actions/plan',{method:'POST',rejectUnauthorized:false,timeout:20000,headers:{'content-type':'application/json','content-length':Buffer.byteLength(payload)}},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);const model=j.audit?.model||j.model||'';const text=String(j.answer?.judgment||j.answer?.candidates?.[0]?.content||j.answer?.summary||j.message||'');console.log(JSON.stringify({status:r.statusCode,model,hasAnswer:text.length>0,answerPreview:text.slice(0,160)}));}catch(e){console.log(JSON.stringify({status:r.statusCode,body:b.slice(0,180),parseError:e.message}));process.exit(2);}})});",
    "req.on('timeout',()=>req.destroy(new Error('timeout')));",
    "req.on('error',e=>{console.error(e.message);process.exit(1);});",
    "req.write(payload);",
    "req.end();"
  ].join("");

  return runApiPodNodeProbe(probeCode, 30000);
}

const checkedAt = new Date().toISOString();
const branch = run("git", ["branch", "--show-current"], 10000).stdout || "unknown";
const head = run("git", ["rev-parse", "--short", "HEAD"], 10000).stdout || "unknown";

console.log("Cywell OpsLens KH CRC 4.20 deployment gate");
console.log(`branch=${branch} head=${head} expectedVersion=${expectedVersion}`);

const sshCheck = run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshHost, "oc", "whoami", "--show-server"], 12000);
if (sshCheck.ok && sshCheck.stdout.includes("api.crc.testing")) {
  pass("preflight:ssh-oc", `${sshHost} remote oc context is available without a password prompt`);
} else {
  fail("preflight:ssh-oc", sshCheck.stderr || sshCheck.stdout || "remote oc context unavailable");
}

const cv = getJson("ocp:clusterversion", ["get", "clusterversion", "version"]);
const clusterVersion = cv?.status?.desired?.version ?? cv?.status?.history?.[0]?.version ?? "unknown";
if (parseMinor(clusterVersion) === expectedMinor) {
  pass("ocp:minor", `OpenShift ${clusterVersion} matches ${expectedMinor}`);
} else {
  fail("ocp:minor", `OpenShift ${clusterVersion} does not match ${expectedMinor}`);
}

const catalogSource = getJson(
  "catalog:source",
  ["get", "catalogsource", catalogSourceName, "-n", catalogNamespace]
);
const catalogImage = catalogSource?.spec?.image ?? "";
if (imageIncludesExpectedTag(catalogImage)) {
  pass("catalog:source-image", catalogImage);
} else {
  fail("catalog:source-image", `expected tag prefix ${expectedTagPrefix}, got ${catalogImage || "missing"}`);
}

const catalogPods = getJson(
  "catalog:pod",
  ["get", "pods", "-n", catalogNamespace, "-l", `olm.catalogSource=${catalogSourceName}`]
);
const readyCatalogPods = catalogPods?.items?.filter((pod) => isPodReady(pod)) ?? [];
if (readyCatalogPods.length > 0) {
  pass("catalog:pod-ready", `${readyCatalogPods[0].metadata.name} Ready`);
} else {
  fail("catalog:pod-ready", "no ready catalog pod found");
}

const packageManifest = getJson(
  "catalog:packagemanifest",
  ["get", "packagemanifest", "cywell-opslens", "-n", "default"],
  30000
);
const currentCsv = packageManifest?.status?.channels?.[0]?.currentCSV ?? "";
if (currentCsv === csvName) {
  pass("catalog:current-csv", currentCsv);
} else {
  fail("catalog:current-csv", `expected ${csvName}, got ${currentCsv || "missing"}`);
}

const packageRelatedImages = relatedImages(packageManifest);
for (const component of ["operator", "api", "dashboard"]) {
  const match = packageRelatedImages.find((image) =>
    String(image).includes(`cywell-opslens-${component}:`)
  );
  if (match && imageIncludesExpectedTag(match)) {
    pass(`catalog:related-image:${component}`, match);
  } else {
    fail(`catalog:related-image:${component}`, `expected related image with tag prefix ${expectedTagPrefix}`);
  }
}

const subscription = getJson(
  "olm:subscription",
  ["get", "subscription", "cywell-opslens", "-n", namespace]
);
if (subscription?.status?.installedCSV === csvName && subscription?.status?.currentCSV === csvName) {
  pass("olm:subscription-csv", `currentCSV=${subscription.status.currentCSV} installedCSV=${subscription.status.installedCSV}`);
} else {
  fail(
    "olm:subscription-csv",
    `expected ${csvName}, got currentCSV=${subscription?.status?.currentCSV ?? "missing"} installedCSV=${subscription?.status?.installedCSV ?? "missing"}`
  );
}
if (subscription?.status?.state === "AtLatestKnown") {
  pass("olm:subscription-state", "AtLatestKnown");
} else {
  warn("olm:subscription-state", subscription?.status?.state ?? "missing");
}

const installPlans = getJson("olm:installplans", ["get", "installplan", "-n", namespace]);
const matchingInstallPlan = installPlans?.items?.find((plan) =>
  String(plan?.status?.plan?.map((entry) => entry.name).join(" ")).includes(csvName) ||
  String(plan?.spec?.clusterServiceVersionNames?.join(" ")).includes(csvName)
);
if (matchingInstallPlan?.spec?.approved === true && matchingInstallPlan?.status?.phase === "Complete") {
  pass("olm:installplan", `${matchingInstallPlan.metadata.name} approved and Complete`);
} else if (matchingInstallPlan) {
  fail(
    "olm:installplan",
    `${matchingInstallPlan.metadata.name} approved=${matchingInstallPlan.spec?.approved} phase=${matchingInstallPlan.status?.phase}`
  );
} else {
  fail("olm:installplan", `no InstallPlan found for ${csvName}`);
}

const csv = getJson("olm:csv", ["get", "csv", csvName, "-n", namespace]);
if (csv?.status?.phase === "Succeeded") {
  pass("olm:csv-phase", `${csvName} Succeeded`);
} else {
  fail("olm:csv-phase", `${csvName} phase=${csv?.status?.phase ?? "missing"}`);
}

const deployments = getJson("runtime:deployments", ["get", "deploy", "-n", namespace]);
const deploymentByName = new Map((deployments?.items ?? []).map((deployment) => [deployment.metadata.name, deployment]));
for (const [name, component] of [
  ["cywell-opslens-operator", "operator"],
  ["cywell-opslens-api", "api"],
  ["cywell-opslens-dashboard", "dashboard"]
]) {
  const deployment = deploymentByName.get(name);
  const image = firstContainerImage(deployment);
  if (deployment && deploymentReady(deployment)) {
    pass(`runtime:deployment-ready:${component}`, `${name} available`);
  } else {
    fail(`runtime:deployment-ready:${component}`, `${name} is not available`);
  }
  if (imageIncludesExpectedTag(image)) {
    pass(`runtime:deployment-image:${component}`, image);
  } else {
    fail(`runtime:deployment-image:${component}`, `expected ${expectedTagPrefix}, got ${image || "missing"}`);
  }
}

const pods = getJson("runtime:pods", ["get", "pods", "-n", namespace]);
const nonReadyPods = (pods?.items ?? []).filter((pod) =>
  String(pod.metadata.name).startsWith("cywell-opslens-") && !isPodReady(pod)
);
if (nonReadyPods.length === 0) {
  pass("runtime:pods-ready", "all cywell-opslens pods are ready");
} else {
  fail("runtime:pods-ready", `non-ready pods: ${nonReadyPods.map((pod) => pod.metadata.name).join(", ")}`);
}

const cr = getJson(
  "runtime:opslensinstallation",
  ["get", "opslensinstallation", "cywell-opslens", "-n", namespace]
);
if (cr?.spec?.version === expectedVersion) {
  pass("runtime:cr-version", `spec=${cr.spec.version}`);
} else {
  fail(
    "runtime:cr-version",
    `expected ${expectedVersion}, got spec=${cr?.spec?.version ?? "missing"}`
  );
}
if (cr?.status?.phase === "Ready") {
  pass("runtime:cr-phase", "Ready");
} else {
  fail("runtime:cr-phase", cr?.status?.phase ?? "missing");
}
const lightspeedPhase = cr?.status?.lightspeedRegistration?.phase ?? cr?.status?.lightspeed;
if (lightspeedPhase === "Ready") {
  pass("runtime:lightspeed-separated-status", "OpsLensInstallation reports Lightspeed Ready separately");
} else {
  warn("runtime:lightspeed-separated-status", lightspeedPhase ?? "missing");
}

for (const [component, image] of [
  ["api", cr?.spec?.components?.api?.image],
  ["dashboard", cr?.spec?.components?.dashboard?.image]
]) {
  if (imageIncludesExpectedTag(image)) {
    pass(`runtime:cr-image:${component}`, image);
  } else {
    fail(`runtime:cr-image:${component}`, `expected ${expectedTagPrefix}, got ${image || "missing"}`);
  }
}

for (const [component, image] of [
  ["api", cr?.status?.components?.api?.image],
  ["dashboard", cr?.status?.components?.dashboard?.image]
]) {
  if (imageIncludesExpectedTag(image)) {
    pass(`runtime:cr-status-image:${component}`, image);
  } else {
    fail(`runtime:cr-status-image:${component}`, `expected ${expectedTagPrefix}, got ${image || "missing"}`);
  }
}

const route = getJson(
  "runtime:route",
  ["get", "route", "cywell-opslens-dashboard", "-n", namespace]
);
const routeHost = route?.status?.ingress?.[0]?.host ?? "";
if (routeHost) {
  const routeResponse = await httpsRequest(`https://${routeHost}/`);
  if (routeResponse.ok && routeResponse.statusCode >= 200 && routeResponse.statusCode < 400) {
    pass("runtime:dashboard-route", `${routeHost} HTTP ${routeResponse.statusCode}`);
  } else {
    fail("runtime:dashboard-route", routeResponse.error ?? `HTTP ${routeResponse.statusCode}`);
  }
} else {
  fail("runtime:dashboard-route", "route host missing");
}

const consoleOperator = getJson(
  "console:operator",
  ["get", "console.operator.openshift.io", "cluster"]
);
const consolePlugins = consoleOperator?.spec?.plugins ?? [];
if (consolePlugins.includes("cywell-opslens")) {
  pass("console:plugin-enabled", "cywell-opslens enabled in console.operator cluster");
} else {
  fail("console:plugin-enabled", "cywell-opslens missing from console.operator cluster");
}

const consolePlugin = getJson("console:plugin-cr", ["get", "consoleplugin", "cywell-opslens"]);
const opslensApiProxy = consolePlugin?.spec?.proxy?.find((entry) => entry.alias === "opslens-api");
if (
  consolePlugin?.spec?.backend?.service?.name === "cywell-opslens-dashboard" &&
  opslensApiProxy
) {
  pass("console:plugin-contract", "dashboard backend and opslens-api proxy are configured");
} else {
  fail("console:plugin-contract", "ConsolePlugin backend/proxy contract is incomplete");
}
if (opslensApiProxy?.authorization === "UserToken") {
  pass("console:plugin-proxy-usertoken", "opslens-api proxy forwards the logged-in OpenShift user token");
} else {
  fail("console:plugin-proxy-usertoken", `expected UserToken, got ${opslensApiProxy?.authorization ?? "missing"}`);
}

const consoleCo = getJson("console:clusteroperator", ["get", "co", "console"]);
if (
  condition(consoleCo, "Available") === "True" &&
  condition(consoleCo, "Progressing") === "False" &&
  condition(consoleCo, "Degraded") === "False"
) {
  pass("console:clusteroperator", "Available=True Progressing=False Degraded=False");
} else {
  warn(
    "console:clusteroperator",
    `Available=${condition(consoleCo, "Available")} Progressing=${condition(consoleCo, "Progressing")} Degraded=${condition(consoleCo, "Degraded")}`
  );
}

const consoleRoute = await httpsRequest("https://console-openshift-console.apps-crc.testing/opslens");
if (consoleRoute.ok && consoleRoute.statusCode >= 200 && consoleRoute.statusCode < 400) {
  pass("console:opslens-route", `/opslens HTTP ${consoleRoute.statusCode}`);
} else {
  fail("console:opslens-route", consoleRoute.error ?? `HTTP ${consoleRoute.statusCode}`);
}

const anonymousProxy = await httpsRequest(
  "https://console-openshift-console.apps-crc.testing/api/proxy/plugin/cywell-opslens/opslens-api/healthz"
);
if (anonymousProxy.ok && anonymousProxy.statusCode === 401) {
  pass("console:proxy-auth-boundary", "anonymous proxy request is blocked with HTTP 401 as expected for UserToken proxy");
} else if (anonymousProxy.ok && anonymousProxy.statusCode >= 200 && anonymousProxy.statusCode < 400) {
  pass("console:proxy-auth-boundary", `proxy returned HTTP ${anonymousProxy.statusCode}`);
} else {
  warn("console:proxy-auth-boundary", anonymousProxy.error ?? `HTTP ${anonymousProxy.statusCode}`);
}

const apiProbe = runApiPodKubernetesProbe();
if (apiProbe.ok) {
  try {
    const parsed = JSON.parse(apiProbe.stdout);
    if (parsed.status === 200 && String(parsed.gitVersion ?? "").startsWith("v1.")) {
      pass("runtime:api-kubernetes-reachability", `api pod reached Kubernetes API ${parsed.gitVersion}`);
    } else {
      fail("runtime:api-kubernetes-reachability", `unexpected probe response ${apiProbe.stdout}`);
    }
  } catch (error) {
    fail("runtime:api-kubernetes-reachability", `could not parse probe response: ${error.message}`);
  }
} else {
  fail("runtime:api-kubernetes-reachability", apiProbe.stderr || apiProbe.stdout || "api probe failed");
}

const lightspeedDeployments = getJson(
  "lightspeed:deployments",
  ["get", "deploy", "-n", "openshift-lightspeed"],
  15000
);
if (lightspeedDeployments) {
  const appServer = lightspeedDeployments.items?.find((deployment) => deployment.metadata.name === "lightspeed-app-server");
  if (appServer && deploymentReady(appServer)) {
    pass("lightspeed:app-server", "lightspeed-app-server is available");
  } else if (appServer) {
    warn("lightspeed:app-server", "lightspeed-app-server exists but is not available yet");
  } else {
    warn("lightspeed:app-server", "lightspeed-app-server deployment missing");
  }
}

const lightspeedReadiness = runApiPodLightspeedReadinessProbe();
if (lightspeedReadiness.ok) {
  try {
    const parsed = JSON.parse(lightspeedReadiness.stdout);
    if (parsed.status === 200 && parsed.ready === true) {
      pass("lightspeed:api-pod-readiness", parsed.reason || "api pod can reach lightspeed-app-server readiness");
    } else {
      fail("lightspeed:api-pod-readiness", `unexpected readiness response ${lightspeedReadiness.stdout}`);
    }
  } catch (error) {
    fail("lightspeed:api-pod-readiness", `could not parse readiness response: ${error.message}`);
  }
} else {
  fail("lightspeed:api-pod-readiness", lightspeedReadiness.stderr || lightspeedReadiness.stdout || "lightspeed readiness probe failed");
}

const buildConfigProbe = runApiPodBuildConfigProbe();
if (buildConfigProbe.ok) {
  try {
    const parsed = JSON.parse(buildConfigProbe.stdout);
    if (parsed.status === 200 && parsed.kind === "BuildConfig") {
      pass("runtime:api-buildconfigs", `BuildConfig list path returned HTTP 200 (${parsed.items ?? 0} items)`);
    } else {
      fail("runtime:api-buildconfigs", `unexpected BuildConfig response ${buildConfigProbe.stdout}`);
    }
  } catch (error) {
    fail("runtime:api-buildconfigs", `could not parse BuildConfig response: ${error.message}`);
  }
} else {
  fail("runtime:api-buildconfigs", buildConfigProbe.stderr || buildConfigProbe.stdout || "BuildConfig API probe failed");
}

const consoleOverviewProbe = runApiPodConsoleOverviewProbe();
if (consoleOverviewProbe.ok) {
  try {
    const parsed = JSON.parse(consoleOverviewProbe.stdout);
    const sampleCount = (parsed.series ?? []).reduce(
      (sum, series) => sum + Number(series.samples ?? 0),
      0
    );
    if (
      parsed.status === 200 &&
      parsed.enabled === true &&
      parsed.reachable === true &&
      parsed.source === "openshift-monitoring" &&
      sampleCount > 0
    ) {
      pass("monitoring:utilization-samples", `source=${parsed.source} samples=${sampleCount}`, {
        series: parsed.series
      });
    } else {
      fail("monitoring:utilization-samples", `unexpected utilization response ${consoleOverviewProbe.stdout}`);
    }
  } catch (error) {
    fail("monitoring:utilization-samples", `could not parse console overview response: ${error.message}`);
  }
} else {
  fail(
    "monitoring:utilization-samples",
    consoleOverviewProbe.stderr || consoleOverviewProbe.stdout || "console overview probe failed"
  );
}

const assistantProbe = runApiPodAssistantProbe();
if (assistantProbe.ok) {
  try {
    const parsed = JSON.parse(assistantProbe.stdout);
    if (
      parsed.status >= 200 &&
      parsed.status < 300 &&
      String(parsed.model ?? "").startsWith("openshift-lightspeed/") &&
      parsed.hasAnswer === true
    ) {
      pass("lightspeed:assistant-answer", `assistant answered through ${parsed.model}`, {
        answerPreview: redact(parsed.answerPreview)
      });
    } else {
      fail("lightspeed:assistant-answer", `unexpected assistant response ${assistantProbe.stdout}`);
    }
  } catch (error) {
    fail("lightspeed:assistant-answer", `could not parse assistant response: ${error.message}`);
  }
} else {
  fail("lightspeed:assistant-answer", assistantProbe.stderr || assistantProbe.stdout || "assistant probe failed");
}

warn(
  "browser:first-load",
  "login-session browser verification is still required; in-app browser is blocked by the local CRC certificate authority"
);

const finalStatus = failures.length > 0 ? "FAIL" : warnings.length > 0 ? "PASS_WITH_WARNINGS" : "PASS";
const evidence = {
  checkedAt,
  target: "KH Windows CRC OpenShift 4.20 deployment",
  branch,
  head,
  finalStatus,
  expectedVersion,
  expectedMinor,
  expectedTagPrefix,
  sshHost,
  clusterVersion,
  csvName,
  catalogImage,
  routeHost,
  consolePlugins,
  checks,
  warnings,
  failures
};

await mkdir(dirname(evidenceOut), { recursive: true });
await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

console.log(`KH CRC 4.20 deployment final status: ${finalStatus}`);
console.log(`Evidence: ${evidenceOut}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
