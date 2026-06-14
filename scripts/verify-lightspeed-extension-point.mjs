#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

const defaults = {
  evidenceOut: "test-results/cywell-opslens-lightspeed-extension-point.json",
  decisionDoc: "docs/architecture/lightspeed-extension-point-decision.md",
  roadmapDoc: "docs/roadmap/cywell-opslens-productization.md",
  acceptanceDoc: "docs/acceptance/mvp-0.1.md",
  readme: "README.md",
  olsconfigTemplate: "deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml",
  apiServer: "apps/api/src/server.ts",
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
  decisionDoc: parsed.get("decision-doc") ?? defaults.decisionDoc,
  roadmapDoc: parsed.get("roadmap-doc") ?? defaults.roadmapDoc,
  acceptanceDoc: parsed.get("acceptance-doc") ?? defaults.acceptanceDoc,
  readme: parsed.get("readme") ?? defaults.readme,
  olsconfigTemplate:
    parsed.get("olsconfig-template") ?? defaults.olsconfigTemplate,
  apiServer: parsed.get("api-server") ?? defaults.apiServer,
  timeoutMs: Number(parsed.get("timeout-ms") ?? defaults.timeoutMs)
};

const startedAt = new Date().toISOString();
const checks = [];

function sanitize(value) {
  return String(value ?? "")
    .replace(/--token\s+\S+/gi, "--token <redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer <redacted>")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(auth|token|password|passwd|secret|api[_-]?key)(=|:)\S+/gi, "$1$2<redacted>");
}

function secretLike(value) {
  return /Bearer\s+(?!<redacted>)[A-Za-z0-9._~+/=-]{12,}/i.test(value) ||
    /--token\s+(?!<redacted>)[^\s]+/i.test(value) ||
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

function expectPass(name, condition, detail, failureDetail = detail) {
  if (condition) pass(name, detail);
  else fail(name, failureDetail);
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

function readText(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    fail(label, `${absolutePath} is missing`);
    return "";
  }
  const text = readFileSync(absolutePath, "utf8");
  pass(label, `${absolutePath} loaded`);
  return text;
}

function parseSingleYaml(path, label) {
  const text = readText(path, label);
  if (!text) return undefined;
  try {
    const docs = YAML.parseAllDocuments(text).filter((doc) => !doc.errors.length);
    if (docs.length !== 1) {
      fail(`${label} single document`, `${path} contains ${docs.length} valid document(s)`);
      return undefined;
    }
    pass(`${label} single document`, `${path} contains one document`);
    return docs[0].toJSON();
  } catch (error) {
    fail(label, `${path} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function arrayIncludes(values, expected) {
  return Array.isArray(values) && values.includes(expected);
}

function mcpServerFrom(doc) {
  return (doc?.spec?.mcpServers ?? []).find((server) => server?.name === "cywell-opslens");
}

function headerType(server, headerName) {
  const header = (server?.headers ?? []).find((item) => item?.name === headerName);
  return header?.valueFrom?.type ?? "";
}

function textHasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function textHasNone(text, patterns) {
  return patterns.every((pattern) => !pattern.test(text));
}

function buildRequirement(id, passValue, evidence, missingEvidence) {
  return {
    id,
    pass: passValue,
    evidence: passValue ? evidence : "",
    missingEvidence: passValue ? "" : missingEvidence
  };
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
    warn("current worktree", `dirty=true head=${headSha} files=${worktreeStatus.join("; ")}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const decisionDoc = readText(options.decisionDoc, "extension decision doc");
  const roadmapDoc = readText(options.roadmapDoc, "roadmap doc");
  const acceptanceDoc = readText(options.acceptanceDoc, "acceptance doc");
  const readme = readText(options.readme, "README");
  const apiServer = readText(options.apiServer, "API server source");
  const olsconfig = parseSingleYaml(options.olsconfigTemplate, "OLSConfig template");
  const server = mcpServerFrom(olsconfig);

  expectPass(
    "extension decision contract",
    textHasAll(decisionDoc, [
      /OLSConfig\.spec\.mcpServers/,
      /production-facing endpoint is `\/mcp`/i,
      /not depend on an undocumented Lightspeed webhook/i,
      /Do not mutate a legacy Lightspeed ConfigMap/i
    ]),
    "decision doc locks OLSConfig MCP, /mcp, no webhook, and no legacy ConfigMap mutation",
    "decision doc must explicitly lock OLSConfig MCP, /mcp, no webhook, and no legacy ConfigMap mutation"
  );

  expectPass(
    "roadmap extension point",
    textHasAll(roadmapDoc, [
      /custom MCP server registered through `OLSConfig\.spec\.mcpServers`/,
      /not an undocumented REST webhook/,
      /REST endpoint remains useful for local smoke tests and partner demos/,
      /\/mcp` is the Lightspeed-facing contract/
    ]),
    "roadmap states MCP/OLSConfig is the Stage 1 extension point and REST is smoke/demo only",
    "roadmap must distinguish MCP/OLSConfig from REST smoke/demo routes"
  );

  expectPass(
    "acceptance extension point",
    textHasAll(acceptanceDoc, [
      /production-facing MCP endpoint is `\/mcp`/,
      /JSON-RPC `tools\/list` \+ `tools\/call`/,
      /apply_remediation` is absent/,
      /clusterMutationAttempted=false/
    ]),
    "acceptance binds Stage 1 to /mcp JSON-RPC, read-only tools, and no mutation",
    "acceptance must bind Stage 1 to /mcp JSON-RPC, read-only tools, and no mutation"
  );

  expectPass(
    "README route contract",
    textHasAll(readme, [
      /POST \/mcp/,
      /POST \/api\/opslens\/mcp/,
      /not an undocumented webhook path/,
      /apply_remediation.*excluded|excludedTools.*apply_remediation/i
    ]),
    "README lists /mcp and local /api/opslens/mcp while rejecting undocumented webhook usage",
    "README must list both MCP routes and reject webhook usage"
  );

  expectPass(
    "OLSConfig identity",
    olsconfig?.kind === "OLSConfig" &&
      olsconfig?.apiVersion === "ols.openshift.io/v1alpha1",
    "template is ols.openshift.io/v1alpha1 OLSConfig",
    `kind=${olsconfig?.kind ?? "missing"} apiVersion=${olsconfig?.apiVersion ?? "missing"}`
  );
  expectPass(
    "OLSConfig MCP feature gate",
    arrayIncludes(olsconfig?.spec?.featureGates, "MCPServer"),
    "template enables MCPServer feature gate",
    "template must include spec.featureGates MCPServer"
  );
  expectPass(
    "OLSConfig Cywell MCP server",
    Boolean(server) && server?.url?.endsWith("/mcp"),
    `cywell-opslens MCP server url=${server?.url ?? "missing"}`,
    "template must include cywell-opslens MCP server with /mcp URL"
  );
  expectPass(
    "OLSConfig user bearer forwarding",
    headerType(server, "Authorization") === "kubernetes",
    "Authorization header uses kubernetes user bearer forwarding",
    `Authorization header type=${headerType(server, "Authorization") || "missing"}`
  );
  expectPass(
    "OLSConfig secret header",
    headerType(server, "X-Cywell-Api-Key") === "secret",
    "X-Cywell-Api-Key header uses secret valueFrom",
    `X-Cywell-Api-Key header type=${headerType(server, "X-Cywell-Api-Key") || "missing"}`
  );

  expectPass(
    "API MCP route contract",
    textHasAll(apiServer, [
      /url\.pathname === "\/mcp"/,
      /url\.pathname === "\/api\/opslens\/mcp"/,
      /handleOpsLensMcpRequest/
    ]),
    "API server routes /mcp and /api/opslens/mcp to handleOpsLensMcpRequest",
    "API server must route both MCP paths through handleOpsLensMcpRequest"
  );

  expectPass(
    "forbidden extension route guard",
    textHasNone(apiServer, [
      /lightspeed[^"'`/\n]*webhook/i,
      /webhook[^"'`/\n]*lightspeed/i,
      /legacy[^"'`/\n]*ConfigMap[^"'`/\n]*mutation/i
    ]),
    "API source does not expose a Lightspeed webhook or legacy ConfigMap mutation route",
    "API source must not expose undocumented Lightspeed webhook or legacy ConfigMap mutation routes"
  );

  const requirements = [
    buildRequirement(
      "extension-point-mcp-olsconfig",
      Boolean(server) && server?.url?.endsWith("/mcp") && arrayIncludes(olsconfig?.spec?.featureGates, "MCPServer"),
      "OLSConfig template registers cywell-opslens in spec.mcpServers with MCPServer feature gate",
      "OLSConfig template must register cywell-opslens through spec.mcpServers and MCPServer"
    ),
    buildRequirement(
      "lightspeed-facing-endpoint",
      /url\.pathname === "\/mcp"/.test(apiServer),
      "API serves production-facing /mcp JSON-RPC endpoint",
      "API must serve /mcp"
    ),
    buildRequirement(
      "local-smoke-alias",
      /url\.pathname === "\/api\/opslens\/mcp"/.test(apiServer),
      "API serves /api/opslens/mcp as local smoke/demo alias",
      "API must serve /api/opslens/mcp as local smoke/demo alias"
    ),
    buildRequirement(
      "no-undocumented-lightspeed-webhook",
      textHasAll(decisionDoc + roadmapDoc + readme, [/not an undocumented (REST )?webhook/i]) &&
        textHasNone(apiServer, [/lightspeed[^"'`/\n]*webhook/i]),
      "Docs reject undocumented Lightspeed webhook and API source has no webhook route",
      "Webhook path must stay out of the Stage 1 product contract"
    ),
    buildRequirement(
      "no-legacy-configmap-registration",
      /Do not mutate a legacy Lightspeed ConfigMap/i.test(decisionDoc) &&
        /Legacy Lightspeed ConfigMap mutation is not used/i.test(roadmapDoc),
      "Docs reject legacy Lightspeed ConfigMap mutation for MVP 0.1 registration",
      "Legacy ConfigMap mutation must remain out of MVP 0.1"
    ),
    buildRequirement(
      "user-token-forwarding",
      headerType(server, "Authorization") === "kubernetes",
      "OLSConfig template forwards the user Kubernetes bearer token",
      "Authorization header must use kubernetes valueFrom"
    ),
    buildRequirement(
      "secret-backed-cywell-header",
      headerType(server, "X-Cywell-Api-Key") === "secret",
      "OLSConfig template supports secret-backed Cywell API key header",
      "X-Cywell-Api-Key header must use secret valueFrom"
    )
  ];

  const failures = checks.filter((check) => check.status === "FAIL");
  const warnings = checks.filter((check) => check.status === "WARN");
  const missingEvidence = [
    ...requirements
      .filter((requirement) => !requirement.pass)
      .map((requirement) => `${requirement.id}: ${requirement.missingEvidence}`),
    ...(worktreeDirty ? ["worktree must be clean before release evidence refresh"] : [])
  ];
  const status = failures.length === 0 && missingEvidence.length === 0
    ? "PASS"
    : failures.length > 0
      ? "FAIL"
      : "NEEDS_EVIDENCE";

  const artifact = {
    schema: "cywell.opslens.lightspeed-extension-point.v0.1",
    artifactType: "opslens.lightspeed-extension-point.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    actionMode: "readOnlyEvidenceOnly",
    extensionPoint: {
      productContract: "OLSConfig.spec.mcpServers custom MCP server",
      lightspeedFacingEndpoint: "/mcp",
      localSmokeEndpoint: "/api/opslens/mcp",
      restApiRole: "local-smoke-demo-and-product-api-only",
      undocumentedWebhookSupported: false,
      legacyConfigMapRegistrationSupported: false,
      technologyPreview: true
    },
    olsconfig: {
      path: resolve(options.olsconfigTemplate),
      apiVersion: olsconfig?.apiVersion ?? "missing",
      kind: olsconfig?.kind ?? "missing",
      namespace: olsconfig?.metadata?.namespace ?? "missing",
      name: olsconfig?.metadata?.name ?? "missing",
      featureGates: olsconfig?.spec?.featureGates ?? [],
      server: {
        name: server?.name ?? "missing",
        url: server?.url ?? "missing",
        timeout: server?.timeout ?? "missing",
        userBearerForwarding: headerType(server, "Authorization") === "kubernetes",
        secretHeader: headerType(server, "X-Cywell-Api-Key") === "secret"
      }
    },
    routes: [
      {
        path: "/mcp",
        method: "POST",
        role: "lightspeed-facing",
        handler: "handleOpsLensMcpRequest"
      },
      {
        path: "/api/opslens/mcp",
        method: "POST",
        role: "local-smoke-demo",
        handler: "handleOpsLensMcpRequest"
      }
    ],
    mutationBoundary: {
      clusterMutationAttempted: false,
      registryMutationAttempted: false,
      vectorWriteAttempted: false,
      mutationAllowedByThisVerifier: false
    },
    clusterMutationAttempted: false,
    registryMutationAttempted: false,
    vectorWriteAttempted: false,
    mutationAllowedByThisVerifier: false,
    requirements,
    evidence: [
      "Stage 1 extension point is custom MCP through OLSConfig.spec.mcpServers.",
      "Production-facing Lightspeed endpoint is /mcp.",
      "REST routes remain local smoke/demo or product API surfaces, not the Lightspeed extension point.",
      "Undocumented Lightspeed webhook and legacy ConfigMap registration are explicit non-goals.",
      "Verifier reads repository files only and performs no cluster, registry, or vector mutations."
    ],
    missingEvidence,
    risk: [
      "OpenShift Lightspeed custom MCP remains a Technology Preview surface, so productization must keep Operator and Console Plugin as the support center.",
      "MCP tool outputs must be redacted server-side because query filters may not protect returned tool content.",
      "Live OLSConfig registration still requires separate readiness evidence and human approval."
    ],
    rollbackPath: [
      "If the extension point changes, update the decision doc, OLSConfig template, API routes, roadmap, and acceptance criteria together.",
      "Keep Stage 1 as not-ready until verify:lightspeed-extension, verify:lightspeed:trojan-horse, and verify:lightspeed:routing pass on the same head.",
      "Do not apply OLSConfig changes from this verifier; use the approval-gated PatchOLSConfig path."
    ],
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus
    },
    checks
  };

  const serialized = JSON.stringify(artifact, null, 2);
  if (secretLike(serialized)) {
    throw new Error("lightspeed extension evidence would include secret-like material");
  }

  await mkdir(dirname(resolve(options.evidenceOut)), { recursive: true });
  await writeFile(resolve(options.evidenceOut), `${serialized}\n`, "utf8");
  pass("lightspeed extension evidence export", `${resolve(options.evidenceOut)} written without secret material`);

  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log(
    `\nCywell OpsLens Lightspeed extension point: status=${status}, ${failures.length} fail, ${warnings.length} warn, ${checks.length} checks`
  );
  if (status === "FAIL") process.exitCode = 1;
}

main().catch((error) => {
  fail("lightspeed extension verifier runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] lightspeed extension verifier runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
