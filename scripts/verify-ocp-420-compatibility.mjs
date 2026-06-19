#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import ts from "typescript";

const evidenceOut = "test-results/cywell-opslens-ocp420-compatibility.json";
const execFileAsync = promisify(execFile);

const ocp420ApiAllowlist = new Set([
  "apiextensions.k8s.io/v1",
  "apiregistration.k8s.io/v1",
  "apps.openshift.io/v1",
  "apps/v1",
  "autoscaling/v1",
  "autoscaling/v2",
  "batch/v1",
  "build.openshift.io/v1",
  "config.openshift.io/v1",
  "console.openshift.io/v1",
  "discovery.k8s.io/v1",
  "events.k8s.io/v1",
  "image.openshift.io/v1",
  "machine.openshift.io/v1beta1",
  "machineconfiguration.openshift.io/v1",
  "networking.k8s.io/v1",
  "operator.openshift.io/v1",
  "operators.coreos.com/v1alpha1",
  "packages.operators.coreos.com/v1",
  "policy/v1",
  "rbac.authorization.k8s.io/v1",
  "route.openshift.io/v1",
  "snapshot.storage.k8s.io/v1",
  "storage.k8s.io/v1",
  "user.openshift.io/v1",
  "v1"
]);

function apiVersionFromResource(resource) {
  const parts = resource.split("/");
  if (parts.length < 2) return "";
  return parts.slice(0, -1).join("/");
}

function nativeCreateApiVersion(path) {
  if (!path) return "";
  const match = path.match(/\/([^/]+~[^/]+~[^/]+)\/~new$/);
  if (!match) return "";
  const [groupOrVersion, version] = match[1].split("~");
  return groupOrVersion === "v1" ? "v1" : `${groupOrVersion}/${version}`;
}

async function loadConsoleParityModule() {
  const source = await readFile(resolve("apps/web/src/consoleParity.ts"), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false
    }
  }).outputText;
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
  return { module, source };
}

async function gitValue(args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: resolve(".") });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

const { module: parityModule, source: paritySource } = await loadConsoleParityModule();
const dev017PlanSource = await readFile(
  resolve("docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.7-live-polish-plan.md"),
  "utf8"
);
const items = Array.isArray(parityModule.ocpConsoleParityItems)
  ? parityModule.ocpConsoleParityItems
  : [];
const baseline = parityModule.ocpConsoleBaseline ?? {};
const compatibilityProfile =
  typeof parityModule.consoleParityCompatibilityProfile === "function"
    ? parityModule.consoleParityCompatibilityProfile
    : undefined;

const resourceApiVersions = new Set();
const blockedResources = [];
const malformedResources = [];
const itemCompatibility = [];

for (const item of items) {
  const profile = compatibilityProfile?.(item);
  const profileApiVersions = new Set(profile?.apiVersions ?? []);

  for (const resource of item.resourcePreset?.preferredResources ?? []) {
    const apiVersion = apiVersionFromResource(resource);
    if (!apiVersion) {
      malformedResources.push({ id: item.id, resource });
      continue;
    }
    resourceApiVersions.add(apiVersion);
    if (!ocp420ApiAllowlist.has(apiVersion)) {
      blockedResources.push({ id: item.id, resource, apiVersion });
    }
  }

  if (item.nativeCreatePath) {
    const apiVersion = nativeCreateApiVersion(item.nativeCreatePath);
    if (apiVersion) {
      resourceApiVersions.add(apiVersion);
      if (!ocp420ApiAllowlist.has(apiVersion)) {
        blockedResources.push({
          id: item.id,
          resource: item.nativeCreatePath,
          apiVersion
        });
      }
    }
  }

  const profileBlockedApiVersions = [...profileApiVersions].filter(
    (apiVersion) => !ocp420ApiAllowlist.has(apiVersion)
  );
  const directApiVersions = [
    ...(item.resourcePreset?.preferredResources ?? [])
      .map(apiVersionFromResource)
      .filter(Boolean),
    nativeCreateApiVersion(item.nativeCreatePath)
  ].filter(Boolean);

  itemCompatibility.push({
    id: item.id,
    section: item.section,
    nativePath: item.originalPath,
    coverageClass: item.coverageClass,
    actionSurface: item.actionSurface,
    status: item.status,
    minimumRuntime: profile?.minimumRuntime ?? baseline.minimumRuntime,
    baseline: profile?.baseline ?? "missing compatibility profile",
    apiVersions: [...profileApiVersions].sort(),
    directApiVersions: [...new Set(directApiVersions)].sort(),
    nativeCreateApiVersion: profile?.nativeCreateApiVersion,
    forwardEnhancement: profile?.forwardEnhancement,
    proof: profile?.proof,
    ocp420Compatible:
      profileBlockedApiVersions.length === 0 &&
      (profile?.minimumRuntime ?? baseline.minimumRuntime) ===
        "OpenShift Container Platform 4.20",
    blockedApiVersions: profileBlockedApiVersions
  });
}

const failures = [];

if (baseline.minimumRuntime !== "OpenShift Container Platform 4.20") {
  failures.push("minimumRuntime must remain OpenShift Container Platform 4.20");
}

if (baseline.forwardUxTarget !== "OpenShift Container Platform 4.21+") {
  failures.push("forwardUxTarget must remain OpenShift Container Platform 4.21+");
}

if (!String(baseline.compatibilityProof ?? "").includes("Windows CRC 4.20")) {
  failures.push("compatibilityProof must keep the Windows CRC 4.20 proof boundary visible");
}

if (!paritySource.includes("Red Hat OCP 4.20 Web console overview")) {
  failures.push("console parity baseline must cite the OCP 4.20 web console docs");
}

if (!compatibilityProfile) {
  failures.push("consoleParityCompatibilityProfile export is required");
}

if (itemCompatibility.length !== items.length) {
  failures.push("item compatibility matrix must cover every console parity item");
}

const incompatibleItems = itemCompatibility.filter((entry) => !entry.ocp420Compatible);
if (incompatibleItems.length > 0) {
  failures.push(`OCP 4.20 incompatible console items: ${JSON.stringify(incompatibleItems)}`);
}

if (!dev017PlanSource.includes("Do not depend on `4.21`-only APIs for required flows.")) {
  failures.push("Dev 0.1.7 plan must preserve the no-4.21-only-API boundary text");
}

if (malformedResources.length > 0) {
  failures.push(`malformed preferredResources: ${JSON.stringify(malformedResources)}`);
}

if (blockedResources.length > 0) {
  failures.push(`API versions outside OCP 4.20 allowlist: ${JSON.stringify(blockedResources)}`);
}

const git = {
  branch: await gitValue(["branch", "--show-current"]),
  head: await gitValue(["rev-parse", "--short", "HEAD"]),
  baseRef: "origin/main",
  baseHead: await gitValue(["rev-parse", "--short", "origin/main"])
};

const evidence = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  git,
  minimumRuntime: baseline.minimumRuntime,
  forwardUxTarget: baseline.forwardUxTarget,
  compatibilityProof: baseline.compatibilityProof,
  totalConsoleItems: items.length,
  checkedApiVersions: [...resourceApiVersions].sort(),
  allowlist: [...ocp420ApiAllowlist].sort(),
  itemCompatibility,
  blockedResources,
  malformedResources,
  sourceBoundaryPresent: dev017PlanSource.includes(
    "Do not depend on `4.21`-only APIs for required flows."
  ),
  failures
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  console.error(`Cywell OpsLens OCP 4.20 compatibility preflight failed: ${failures.join("; ")}`);
  process.exit(1);
}

console.log(
  `Cywell OpsLens OCP 4.20 compatibility preflight: PASS (${items.length} console items, ${resourceApiVersions.size} API versions)`
);
console.log(`${evidenceOut} written`);
