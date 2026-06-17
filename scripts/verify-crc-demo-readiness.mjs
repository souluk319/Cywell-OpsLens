#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseAllDocuments } from "yaml";

const defaults = {
  evidenceOut: "test-results/cywell-opslens-crc-demo-readiness.json",
  markdownOut: "test-results/cywell-opslens-crc-demo-readiness.md"
};

const paths = {
  csv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  crcSample:
    "deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml",
  app: "apps/web/src/App.tsx",
  webVerifier: "scripts/verify-web-shell-contract.mjs",
  e2e: "tests/e2e/mvp-0.1.spec.ts",
  liveHandoff: "docs/runbooks/cywell-opslens-crc-live-handoff.md",
  morningHandoff: "docs/runbooks/cywell-opslens-dev012-morning-handoff.md",
  tar: "test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar"
};

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
    } else {
      values.set(key, "true");
    }
  }
  return {
    evidenceOut: values.get("evidence-out") ?? defaults.evidenceOut,
    markdownOut: values.get("markdown-out") ?? defaults.markdownOut
  };
}

function record(status, name, detail, extra = {}) {
  checks.push({ status, name, detail, ...extra });
}

function pass(name, detail, extra) {
  record("PASS", name, detail, extra);
}

function warn(name, detail, extra) {
  record("WARN", name, detail, extra);
}

function fail(name, detail, extra) {
  record("FAIL", name, detail, extra);
}

function expectCheck(name, condition, detail, failDetail = detail, extra = {}) {
  if (condition) {
    pass(name, detail, extra);
  } else {
    fail(name, failDetail, extra);
  }
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file readable", `${path}: ${error.message}`);
    return "";
  }
}

async function readYaml(path) {
  const text = await readText(path);
  if (!text) return undefined;
  try {
    const docs = parseAllDocuments(text).filter((doc) => !doc.errors.length);
    const value = docs[0]?.toJSON();
    if (value) {
      pass("YAML source", `${path} loaded`);
      return value;
    }
    fail("YAML source", `${path} has no readable document`);
  } catch (error) {
    fail("YAML source", `${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return undefined;
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function gitDirty() {
  try {
    return execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return true;
  }
}

function parseAlmExamples(csv) {
  const raw = csv?.metadata?.annotations?.["alm-examples"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    fail("CSV alm-examples", "metadata.annotations.alm-examples is missing");
    return [];
  }
  try {
    const examples = JSON.parse(raw);
    if (Array.isArray(examples)) {
      pass("CSV alm-examples", `${examples.length} examples parsed`);
      return examples;
    }
    fail("CSV alm-examples", "alm-examples is not a JSON array");
  } catch (error) {
    fail("CSV alm-examples", error instanceof Error ? error.message : String(error));
  }
  return [];
}

function profile(example) {
  return example?.metadata?.annotations?.["opslens.cywell.io/profile"] ?? "";
}

function isCrcLightweight(spec) {
  return (
    spec?.components?.vectorStore?.provider === "inmemory" &&
    spec?.components?.modelRuntime?.provider === "mock-local" &&
    spec?.components?.modelRuntime?.replicas === 0 &&
    spec?.components?.modelRuntime?.gpu?.enabled === false &&
    spec?.lightspeedRegistration?.mode === "ValidateOnly" &&
    spec?.rag?.documentIntake?.mode === "ValidateOnly" &&
    spec?.rag?.approvalQueue?.mode === "DesignOnly" &&
    spec?.consolePlugin?.enabled === true
  );
}

function usesCrcOwnedImages(spec) {
  const apiImage = String(spec?.components?.api?.image ?? "");
  const dashboardImage = String(spec?.components?.dashboard?.image ?? "");
  return (
    apiImage.includes("image-registry.openshift-image-registry.svc:5000") &&
    dashboardImage.includes("image-registry.openshift-image-registry.svc:5000") &&
    apiImage.endsWith(":v0.1.2-dev-crc") &&
    dashboardImage.endsWith(":v0.1.2-dev-crc") &&
    !spec?.components?.vectorStore?.image &&
    !spec?.components?.modelRuntime?.image
  );
}

function containsAll(text, values) {
  return values.every((value) => text.includes(value));
}

function tarSummary(path) {
  if (!existsSync(resolve(path))) {
    return { exists: false, bytes: 0 };
  }
  const stat = statSync(resolve(path));
  return { exists: true, bytes: stat.size, lastModified: stat.mtime.toISOString() };
}

function renderMarkdown(evidence) {
  const lines = [
    "# Cywell OpsLens CRC Demo Readiness",
    "",
    `Generated: ${evidence.generatedAt}`,
    `Status: \`${evidence.status}\``,
    `Branch: \`${evidence.git.branch}\``,
    `Head: \`${evidence.git.head}\``,
    `Dirty: \`${String(evidence.git.dirty)}\``,
    "",
    "## Boundary",
    "",
    "- local evidence only",
    "- no cluster mutation",
    "- no registry mutation",
    "- no `.env` or secret reads",
    "",
    "## Package Signals",
    "",
    `- First OperatorHub CR example: \`${evidence.packageSignals.firstAlmExampleName ?? "missing"}\``,
    `- First example profile: \`${evidence.packageSignals.firstAlmExampleProfile ?? "missing"}\``,
    `- Approved install example retained: \`${String(evidence.packageSignals.releaseExampleRetained)}\``,
    `- First relatedImages: \`${evidence.packageSignals.relatedImagesFirstThree.join(" / ")}\``,
    "",
    "## Transfer Artifact",
    "",
    `- Exists: \`${String(evidence.transferTar.exists)}\``,
    `- Size: \`${Math.round((evidence.transferTar.bytes ?? 0) / 1024 / 1024)} MiB\``,
    "",
    "## Checks",
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |"
  ];

  for (const check of evidence.checks) {
    lines.push(`| ${check.status} | ${check.name} | ${String(check.detail).replace(/\|/g, "\\|")} |`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const csv = await readYaml(paths.csv);
  const crcSample = await readYaml(paths.crcSample);
  const app = await readText(paths.app);
  const webVerifier = await readText(paths.webVerifier);
  const e2e = await readText(paths.e2e);
  const liveHandoff = await readText(paths.liveHandoff);
  const morningHandoff = await readText(paths.morningHandoff);

  const examples = parseAlmExamples(csv);
  const firstExample = examples[0];
  const releaseExample = examples.find(
    (example) =>
      example?.spec?.components?.vectorStore?.provider === "pgvector" &&
      example?.spec?.components?.modelRuntime?.provider === "vllm" &&
      example?.spec?.lightspeedRegistration?.mode === "PatchOLSConfig"
  );

  expectCheck(
    "OperatorHub first CR example",
    firstExample?.kind === "OpsLensInstallation" && profile(firstExample) === "crc-lightweight",
    "CRC lightweight is the first OperatorHub CR example",
    "CRC lightweight must be first so local demos do not default to pgvector/vLLM"
  );
  expectCheck(
    "OperatorHub approved install retained",
    Boolean(releaseExample),
    "approved pgvector/vLLM/PatchOLSConfig example remains available",
    "approved install example is missing"
  );
  expectCheck(
    "OperatorHub lightweight runtime",
    isCrcLightweight(firstExample?.spec),
    "first example uses inmemory, mock-local, replicas=0, GPU disabled, ValidateOnly",
    "first example must be demo-safe and non-mutating"
  );
  expectCheck(
    "OperatorHub lightweight images",
    usesCrcOwnedImages(firstExample?.spec),
    "first example uses internal CRC API/dashboard images and no external runtime images",
    "first example must use internal API/dashboard v0.1.2-dev-crc images and omit pgvector/vLLM images"
  );
  expectCheck(
    "sample lightweight runtime",
    isCrcLightweight(crcSample?.spec),
    "checked-in CRC sample matches lightweight runtime policy",
    "checked-in CRC sample must stay lightweight and ValidateOnly"
  );
  expectCheck(
    "sample lightweight images",
    usesCrcOwnedImages(crcSample?.spec),
    "checked-in CRC sample uses internal v0.1.2-dev-crc API/dashboard images",
    "checked-in CRC sample must use internal v0.1.2-dev-crc images"
  );

  const platformLabels = csv?.metadata?.labels ?? {};
  expectCheck(
    "OperatorHub platform filter",
    platformLabels["operatorframework.io/arch.arm64"] === "supported" &&
      platformLabels["operatorframework.io/arch.amd64"] === "supported" &&
      platformLabels["operatorframework.io/os.linux"] === "supported",
    "linux amd64/arm64 labels are present",
    "CSV must keep linux amd64/arm64 support labels for CRC and workstation demos"
  );

  const relatedImages = (csv?.spec?.relatedImages ?? []).map((image) => image.name);
  expectCheck(
    "relatedImages owned first",
    JSON.stringify(relatedImages.slice(0, 3)) === JSON.stringify(["operator", "api", "dashboard"]),
    "owned operator/api/dashboard images are listed before external runtime images",
    `first relatedImages are ${relatedImages.slice(0, 3).join("/") || "missing"}`
  );

  const uiInstallProfileCopy = [
    "Use CRC lightweight example first",
    "CRC lightweight 예제를 먼저 선택",
    'data-testid="apply-signal-profile"'
  ];
  expectCheck(
    "web shell install profile signal",
    containsAll(app, uiInstallProfileCopy) &&
      containsAll(webVerifier, uiInstallProfileCopy) &&
      containsAll(e2e, ["Use CRC lightweight example first", "CRC lightweight 예제를 먼저 선택"]),
    "UI, verifier, and e2e expose the CRC lightweight first-choice signal",
    "web shell must show and test the CRC lightweight first-choice signal"
  );

  expectCheck(
    "handoff command path",
    containsAll(liveHandoff, [
      "opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml",
      "oc apply -f ~/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml",
      "oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens"
    ]) &&
      containsAll(morningHandoff, [
        "opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml",
        "oc get packagemanifest cywell-opslens -n default",
        "oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens"
      ]),
    "live and morning handoffs point to the lightweight apply and read-only smoke commands",
    "handoff docs must keep lightweight apply and read-only smoke commands visible"
  );

  const tar = tarSummary(paths.tar);
  if (tar.exists && tar.bytes > 100 * 1024 * 1024) {
    pass("CRC arm64 transfer tar", `${paths.tar} exists (${Math.round(tar.bytes / 1024 / 1024)} MiB)`, tar);
  } else if (tar.exists) {
    warn("CRC arm64 transfer tar", `${paths.tar} exists but is unexpectedly small`, tar);
  } else {
    fail("CRC arm64 transfer tar", `${paths.tar} is missing`, tar);
  }

  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  const status = failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS";
  const evidence = {
    artifactType: "opslens.crc-demo-readiness.v0.1",
    generatedAt: new Date().toISOString(),
    status,
    actionMode: "localEvidenceOnly",
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    secretsRead: false,
    git: {
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
      head: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
      dirty: gitDirty()
    },
    packageSignals: {
      firstAlmExampleName: firstExample?.metadata?.name ?? null,
      firstAlmExampleProfile: profile(firstExample) || null,
      releaseExampleRetained: Boolean(releaseExample),
      relatedImagesFirstThree: relatedImages.slice(0, 3)
    },
    transferTar: tar,
    checks
  };

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  const serialized = JSON.stringify(evidence, null, 2);
  if (/token=|secret=|password=|bearer\s+[A-Za-z0-9._-]+/i.test(serialized)) {
    throw new Error("CRC demo readiness evidence would include secret-like material");
  }
  await writeFile(resolve(options.evidenceOut), `${serialized}\n`, "utf8");
  await mkdir(dirname(resolve(options.markdownOut)), { recursive: true });
  await writeFile(resolve(options.markdownOut), renderMarkdown(evidence), "utf8");

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log(
    `\nCywell OpsLens CRC demo readiness: status=${status}, ${failCount} fail, ${warnCount} warn, ${checks.length} checks`
  );
  console.log(`Evidence: ${resolve(options.evidenceOut)}`);
  console.log(`Markdown: ${resolve(options.markdownOut)}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[FAIL] CRC demo readiness runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
