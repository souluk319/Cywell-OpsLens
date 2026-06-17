#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { parseAllDocuments, stringify } from "yaml";
import { sanitizeArtifact, sanitizeCommonSensitive } from "./lib/evidence-redaction.mjs";

const execFileAsync = promisify(execFile);

const defaults = {
  namespace: "cywell-opslens",
  registry: "image-registry.openshift-image-registry.svc:5000",
  outDir: "test-results/crc-dev-catalog",
  evidenceOut: "test-results/cywell-opslens-crc-dev-catalog-context.json",
  markdownOut: "test-results/cywell-opslens-crc-dev-catalog-context.md",
  sourceFbc: "deploy/catalog/fbc/catalog.yaml",
  sourceCatalogSource: "deploy/catalog/openshift/catalogsource.yaml",
  sourceSubscription: "deploy/catalog/openshift/subscription.yaml",
  sourceBundleDockerfile: "deploy/operator/bundle.Dockerfile",
  sourceBundleCsv: "deploy/operator/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml",
  sourceBundleCrd: "deploy/operator/bundle/manifests/opslens.cywell.io_opslensinstallations.yaml",
  sourceBundleAnnotations: "deploy/operator/bundle/metadata/annotations.yaml",
  opmImage: "quay.io/operator-framework/opm:v1.47.0",
  sourceVersion: "0.1.0",
  devVersion: "0.1.2",
  devImageTag: "v0.1.2-dev-crc",
  timeoutMs: 10000
};

const ownedImages = [
  ["operator", "quay.io/cywell/opslens-operator:0.1.0", "cywell-opslens-operator"],
  ["api", "quay.io/cywell/opslens-api:0.1.0", "cywell-opslens-api"],
  ["dashboard", "quay.io/cywell/opslens-dashboard:0.1.0", "cywell-opslens-dashboard"],
  ["bundle", "quay.io/cywell/opslens-operator-bundle:0.1.0", "cywell-opslens-operator-bundle"],
  ["catalog", "quay.io/cywell/opslens-catalog:0.1.0", "cywell-opslens-catalog"]
];

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

const args = parseArgs(process.argv.slice(2));
const options = {
  namespace: args.get("namespace") ?? defaults.namespace,
  registry: args.get("registry") ?? defaults.registry,
  outDir: args.get("out-dir") ?? defaults.outDir,
  evidenceOut: args.get("evidence-out") ?? defaults.evidenceOut,
  markdownOut: args.get("markdown-out") ?? defaults.markdownOut,
  sourceFbc: args.get("source-fbc") ?? defaults.sourceFbc,
  sourceCatalogSource: args.get("source-catalogsource") ?? defaults.sourceCatalogSource,
  sourceSubscription: args.get("source-subscription") ?? defaults.sourceSubscription,
  sourceBundleDockerfile: args.get("source-bundle-dockerfile") ?? defaults.sourceBundleDockerfile,
  sourceBundleCsv: args.get("source-bundle-csv") ?? defaults.sourceBundleCsv,
  sourceBundleCrd: args.get("source-bundle-crd") ?? defaults.sourceBundleCrd,
  sourceBundleAnnotations: args.get("source-bundle-annotations") ?? defaults.sourceBundleAnnotations,
  opmImage: args.get("opm-image") ?? defaults.opmImage,
  sourceVersion: args.get("source-version") ?? defaults.sourceVersion,
  devVersion: args.get("dev-version") ?? defaults.devVersion,
  devImageTag: args.get("dev-image-tag") ?? defaults.devImageTag,
  timeoutMs: Number(args.get("timeout-ms") ?? defaults.timeoutMs)
};

const checks = [];

function sanitize(value) {
  return sanitizeCommonSensitive(value)
    .replace(/\b(?:api|console|oauth|default-route)[A-Za-z0-9.-]*(?:crc|ocp|openshift)[A-Za-z0-9.-]*\b/gi, "<redacted-ocp-endpoint>")
    .replace(/\b(?:127|100)(?:\.\d{1,3}){3}\b/g, "<redacted-private-ip>");
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

async function runCapture(command, argv) {
  try {
    const { stdout, stderr } = await execFileAsync(command, argv, {
      encoding: "utf8",
      timeout: options.timeoutMs
    });
    return { ok: true, stdout: sanitize(stdout.trim()), stderr: sanitize(stderr.trim()) };
  } catch (error) {
    return {
      ok: false,
      stdout: sanitize(error.stdout?.trim?.() ?? ""),
      stderr: sanitize(error.stderr?.trim?.() ?? error.message)
    };
  }
}

async function gitValue(argv, fallback) {
  const result = await runCapture("git", argv);
  if (!result.ok || !result.stdout) return fallback;
  return result.stdout.split(/\r?\n/).at(-1)?.trim() || fallback;
}

async function loadYaml(path) {
  const text = await readFile(resolve(path), "utf8");
  const docs = parseAllDocuments(text);
  const errors = docs.flatMap((doc) => doc.errors);
  if (errors.length > 0) {
    throw new Error(`${path}: ${errors.map((error) => error.message).join("; ")}`);
  }
  pass("YAML source", `${path} contains ${docs.length} document(s)`);
  return docs.map((doc) => doc.toJSON()).filter(Boolean);
}

function targetImage(component) {
  const row = ownedImages.find(([name]) => name === component);
  return `${options.registry}/${options.namespace}/${row[2]}:${options.devImageTag}`;
}

function localImageName(component, tag = "verify") {
  const repo =
    component === "bundle"
      ? "opslens-operator-bundle"
      : `opslens-${component}`;
  return `cywell/${repo}:${tag}`;
}

function csvName(version) {
  return `cywell-opslens-operator.v${version}`;
}

function imageMap() {
  return new Map(
    ownedImages.map(([component, source, repo]) => [
      source,
      {
        component,
        source,
        repo,
        target: `${options.registry}/${options.namespace}/${repo}:${options.devImageTag}`
      }
    ])
  );
}

function replaceImages(value, replacements, replacementsMade = []) {
  if (Array.isArray(value)) return value.map((item) => replaceImages(item, replacements, replacementsMade));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if ((key === "image" || key === "containerImage") && typeof nested === "string") {
        const replacement = replacements.get(nested);
        if (replacement) {
          replacementsMade.push(replacement);
          return [key, replacement.target];
        }
      }
      if (key === "alm-examples" && typeof nested === "string") {
        try {
          const parsed = JSON.parse(nested);
          const replaced = replaceImages(parsed, replacements, replacementsMade);
          return [key, JSON.stringify(replaced, null, 2)];
        } catch {
          return [key, nested];
        }
      }
      return [key, replaceImages(nested, replacements, replacementsMade)];
    })
  );
}

function applyDevCatalogVersion(doc) {
  const sourceCsvName = csvName(options.sourceVersion);
  const devCsvName = csvName(options.devVersion);

  if (doc.schema === "olm.channel") {
    return {
      ...doc,
      entries: (doc.entries ?? []).map((entry) => ({
        ...entry,
        name: entry.name === sourceCsvName ? devCsvName : entry.name
      }))
    };
  }

  if (doc.schema === "olm.bundle") {
    return {
      ...doc,
      name: doc.name === sourceCsvName ? devCsvName : doc.name,
      properties: (doc.properties ?? []).map((property) => {
        if (property.type !== "olm.package") return property;
        return {
          ...property,
          value: {
            ...(property.value ?? {}),
            version: options.devVersion
          }
        };
      })
    };
  }

  return doc;
}

function applyDevBundleCsvVersion(doc) {
  if (doc.kind !== "ClusterServiceVersion") return doc;
  const annotations = { ...(doc.metadata?.annotations ?? {}) };
  if (typeof annotations["alm-examples"] === "string") {
    try {
      const examples = JSON.parse(annotations["alm-examples"]);
      annotations["alm-examples"] = JSON.stringify(
        examples.map((example) => ({
          ...example,
          spec: {
            ...(example.spec ?? {}),
            version: options.devVersion
          }
        })),
        null,
        2
      );
    } catch {
      // Keep the source example intact if it is not parseable JSON.
    }
  }

  return {
    ...doc,
    metadata: {
      ...(doc.metadata ?? {}),
      name: csvName(options.devVersion),
      annotations
    },
    spec: {
      ...(doc.spec ?? {}),
      version: options.devVersion
    }
  };
}

function dockerfile() {
  return [
    `FROM ${options.opmImage}`,
    "COPY fbc /configs",
    'ENTRYPOINT ["/bin/opm"]',
    'CMD ["serve", "/configs"]',
    ""
  ].join("\n");
}

function bundleDockerfile(source) {
  return source.replace(/COPY deploy\/operator\/bundle\//g, "COPY bundle/");
}

function buildCatalogSource(source) {
  return {
    ...source,
    metadata: {
      ...(source.metadata ?? {}),
      name: "cywell-opslens-catalog",
      namespace: "openshift-marketplace",
      annotations: {
        ...(source.metadata?.annotations ?? {}),
        "cywell.io/lab-scope": "crc-dev-only"
      }
    },
    spec: {
      ...(source.spec ?? {}),
      sourceType: "grpc",
      image: targetImage("catalog"),
      displayName: "Cywell OpsLens Catalog (CRC Dev)",
      publisher: "Cywell"
    }
  };
}

function buildSubscription(source) {
  return {
    ...source,
    metadata: {
      ...(source.metadata ?? {}),
      namespace: options.namespace,
      annotations: {
        ...(source.metadata?.annotations ?? {}),
        "cywell.io/lab-scope": "crc-dev-only"
      }
    },
    spec: {
      ...(source.spec ?? {}),
      source: "cywell-opslens-catalog",
      sourceNamespace: "openshift-marketplace",
      startingCSV: csvName(options.devVersion),
      installPlanApproval: "Manual"
    }
  };
}

async function writeText(path, text) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, text, "utf8");
  pass("artifact write", absolute);
}

async function localImage(tag) {
  const result = await runCapture("docker", ["image", "inspect", tag, "--format", "{{.Id}}|{{.Architecture}}|{{.Os}}"]);
  if (!result.ok || !result.stdout) return { tag, present: false };
  const [imageId, architecture, os] = result.stdout.split("|");
  return { tag, present: true, imageId, architecture, os };
}

async function writeMarkdown(path, report) {
  const lines = [
    "# Cywell OpsLens CRC Dev Catalog Context",
    "",
    `- Status: ${report.status}`,
    `- Branch: ${report.ref.branch}`,
    `- Head: ${report.ref.headSha}`,
    `- Output directory: ${report.outputs.outDir}`,
    "",
    "## Current Judgment",
    "",
    report.currentJudgment,
    "",
    "## Build Commands",
    "",
    "```powershell",
    report.commands.buildBundle,
    "```",
    "",
    "```powershell",
    report.commands.buildCatalog,
    "```",
    "",
    "## Versioned Local Tags",
    "",
    "```powershell",
    report.commands.tagLocalImages,
    "```",
    "",
    "```powershell",
    report.commands.saveVersionedImages,
    "```",
    "",
    "## CRC Push Commands",
    "",
    ...report.commands.pushImages.map((command) => ["```bash", command, "```", ""].join("\n")),
    "## Generated Files",
    "",
    ...Object.entries(report.outputs).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- [${check.status}] ${check.name}: ${check.detail}`)
  ];
  await writeText(path, `${lines.map(sanitize).join("\n")}\n`);
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const replacements = imageMap();
  const replacementEvents = [];

  const [fbcDocs, catalogSourceDocs, subscriptionDocs] = await Promise.all([
    loadYaml(options.sourceFbc),
    loadYaml(options.sourceCatalogSource),
    loadYaml(options.sourceSubscription)
  ]);
  const [bundleCsvDocs, bundleCrdDocs, bundleAnnotationsDocs, bundleDockerfileSource] = await Promise.all([
    loadYaml(options.sourceBundleCsv),
    loadYaml(options.sourceBundleCrd),
    loadYaml(options.sourceBundleAnnotations),
    readFile(resolve(options.sourceBundleDockerfile), "utf8")
  ]);

  const versionedFbc = fbcDocs.map((doc) => applyDevCatalogVersion(doc));
  const replacedFbc = versionedFbc.map((doc) => replaceImages(doc, replacements, replacementEvents));
  const bundleReplacementEvents = [];
  const versionedBundleCsv = bundleCsvDocs.map((doc) => applyDevBundleCsvVersion(doc));
  const replacedBundleCsv = versionedBundleCsv.map((doc) =>
    replaceImages(doc, replacements, bundleReplacementEvents)
  );
  const catalogSource = buildCatalogSource(catalogSourceDocs[0]);
  const subscription = buildSubscription(subscriptionDocs[0]);
  const uniqueReplacements = [...new Map(replacementEvents.map((event) => [event.component, event])).values()];
  const uniqueBundleReplacements = [
    ...new Map(bundleReplacementEvents.map((event) => [event.component, event])).values()
  ];

  const channel = replacedFbc.find((doc) => doc.schema === "olm.channel");
  const bundle = replacedFbc.find((doc) => doc.schema === "olm.bundle");
  const bundleCsv = replacedBundleCsv.find((doc) => doc.kind === "ClusterServiceVersion");
  const devCsvName = csvName(options.devVersion);
  if (options.devImageTag === "verify" || options.devImageTag.endsWith(":verify")) {
    fail("CRC dev image tag", `devImageTag=${options.devImageTag} would recreate the stale :verify trap`);
  } else if (options.devImageTag.includes(options.devVersion)) {
    pass("CRC dev image tag", `${options.devImageTag} is versioned for ${options.devVersion}`);
  } else {
    fail("CRC dev image tag", `${options.devImageTag} does not include devVersion=${options.devVersion}`);
  }
  if ((channel?.entries ?? []).some((entry) => entry.name === devCsvName)) {
    pass("CRC dev channel CSV", devCsvName);
  } else {
    fail("CRC dev channel CSV", `channel does not point at ${devCsvName}`);
  }
  if (bundle?.name === devCsvName && bundle?.properties?.some((property) => property.type === "olm.package" && property.value?.version === options.devVersion)) {
    pass("CRC dev FBC bundle version", `${bundle.name} version=${options.devVersion}`);
  } else {
    fail("CRC dev FBC bundle version", `bundle=${bundle?.name ?? "missing"} version=${bundle?.properties?.find((property) => property.type === "olm.package")?.value?.version ?? "missing"}`);
  }
  if (bundleCsv?.metadata?.name === devCsvName && bundleCsv?.spec?.version === options.devVersion) {
    pass("CRC dev bundle CSV version", `${bundleCsv.metadata.name} spec.version=${bundleCsv.spec.version}`);
  } else {
    fail("CRC dev bundle CSV version", `csv=${bundleCsv?.metadata?.name ?? "missing"} version=${bundleCsv?.spec?.version ?? "missing"}`);
  }

  for (const component of ["operator", "api", "dashboard", "bundle", "catalog"]) {
    if (component === "catalog") continue;
    if (uniqueReplacements.some((event) => event.component === component)) {
      pass("CRC image replacement", `${component} -> ${targetImage(component)}`);
    } else {
      fail("CRC image replacement", `${component} image reference was not replaced`);
    }
  }
  for (const component of ["operator", "api", "dashboard"]) {
    if (uniqueBundleReplacements.some((event) => event.component === component)) {
      pass("CRC bundle image replacement", `${component} -> ${targetImage(component)}`);
    } else {
      fail("CRC bundle image replacement", `${component} image reference was not replaced inside the bundle CSV`);
    }
  }

  const outDir = resolve(options.outDir);
  const paths = {
    outDir,
    dockerfile: resolve(options.outDir, "catalog.Dockerfile"),
    bundleDockerfile: resolve(options.outDir, "bundle.Dockerfile"),
    fbc: resolve(options.outDir, "fbc", "catalog.yaml"),
    bundleCsv: resolve(options.outDir, "bundle", "manifests", "cywell-opslens-operator.clusterserviceversion.yaml"),
    bundleCrd: resolve(options.outDir, "bundle", "manifests", "opslens.cywell.io_opslensinstallations.yaml"),
    bundleAnnotations: resolve(options.outDir, "bundle", "metadata", "annotations.yaml"),
    catalogSource: resolve(options.outDir, "openshift", "catalogsource-crc.yaml"),
    subscription: resolve(options.outDir, "openshift", "subscription-crc.yaml")
  };

  await writeText(paths.dockerfile, dockerfile());
  await writeText(paths.bundleDockerfile, bundleDockerfile(bundleDockerfileSource));
  await writeText(paths.fbc, `${replacedFbc.map((doc) => stringify(doc).trimEnd()).join("\n---\n")}\n`);
  await writeText(paths.bundleCsv, `${replacedBundleCsv.map((doc) => stringify(doc).trimEnd()).join("\n---\n")}\n`);
  await writeText(paths.bundleCrd, `${bundleCrdDocs.map((doc) => stringify(doc).trimEnd()).join("\n---\n")}\n`);
  await writeText(paths.bundleAnnotations, `${bundleAnnotationsDocs.map((doc) => stringify(doc).trimEnd()).join("\n---\n")}\n`);
  await writeText(paths.catalogSource, `${stringify(catalogSource).trimEnd()}\n`);
  await writeText(paths.subscription, `${stringify(subscription).trimEnd()}\n`);

  const localImages = await Promise.all(
    ownedImages
      .filter(([component]) => component !== "catalog")
      .map(([component]) => localImage(localImageName(component)).then((image) => ({ component, ...image })))
  );
  for (const image of localImages) {
    if (image.present) {
      pass("local image", `${image.tag} present (${image.architecture}/${image.os})`);
    } else {
      fail("local image", `${image.tag} is missing`);
    }
  }

  const commands = {
    buildBundle: `docker build -f ${paths.bundleDockerfile} -t ${localImageName("bundle")} -t ${localImageName("bundle", options.devImageTag)} ${outDir}`,
    buildCatalog: `docker build -f ${paths.dockerfile} -t ${localImageName("catalog")} -t ${localImageName("catalog", options.devImageTag)} ${outDir}`,
    tagLocalImages: ownedImages
      .map(([component]) => `docker tag ${localImageName(component)} ${localImageName(component, options.devImageTag)}`)
      .join(" && "),
    saveVersionedImages: `docker save ${ownedImages
      .map(([component]) => localImageName(component, options.devImageTag))
      .join(" ")} -o .\\test-results\\cywell-opslens-crc-${options.devImageTag}-arm64.tar`,
    pushImages: ownedImages.map(
      ([component, , repo]) =>
        `docker tag ${localImageName(component, options.devImageTag)} ${options.registry}/${options.namespace}/${repo}:${options.devImageTag} && docker push ${options.registry}/${options.namespace}/${repo}:${options.devImageTag}`
    ),
    applyCatalog: `oc apply -f ${paths.catalogSource}`,
    applySubscription: `oc apply -f ${paths.subscription}`
  };

  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : "READY_FOR_CRC_CATALOG_BUILD";
  const report = sanitizeArtifact({
    schema: "cywell.opslens.crc-dev-catalog-context.v0.1",
    status,
    ref: { branch, headSha },
    options: {
      namespace: options.namespace,
      registry: options.registry,
      opmImage: options.opmImage,
      sourceVersion: options.sourceVersion,
      devVersion: options.devVersion,
      devCsvName
    },
    outputs: paths,
    replacements: uniqueReplacements,
    localImages,
    commands,
    checks,
    currentJudgment:
      status === "READY_FOR_CRC_CATALOG_BUILD"
        ? `CRC-only catalog context is ready. It publishes ${devCsvName} so OLM cannot reuse the stale ${csvName(options.sourceVersion)} install payload.`
        : "CRC-only catalog context has gaps. Fix failed checks before building or pushing catalog images."
  }, sanitize);

  await writeText(options.evidenceOut, `${JSON.stringify(report, null, 2)}\n`);
  await writeMarkdown(options.markdownOut, report);

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log(`\nCywell OpsLens CRC dev catalog context: status=${status}, ${totals.fail} fail, ${totals.pass} pass`);
  if (totals.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[FAIL] CRC dev catalog context runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
