#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const paths = {
  plan: "kugnus-idea/CywellOpsLens_plan.md",
  evidenceCheckpoint: "test-results/cywell-opslens-evidence-checkpoint.json",
  mvpGate: "test-results/cywell-opslens-mvp-0.1-gate.json",
  imageBuild: "test-results/cywell-opslens-image-build-readiness.json",
  ownedImageProvenance: "test-results/cywell-opslens-owned-image-provenance.json",
  consolePluginAssets: "test-results/cywell-opslens-console-plugin-assets.json",
  installPlan: "test-results/cywell-opslens-install-approval-plan.json",
  roadmapOut: "test-results/cywell-opslens-roadmap-plan-alignment.json"
};

const checks = [];
const startedAt = new Date().toISOString();

function sanitize(value) {
  return String(value)
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

function warn(name, detail) {
  record("WARN", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function loadJson(path, label) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) {
    warn(label, `${label} evidence is missing at ${absolutePath}`);
    return undefined;
  }
  try {
    const artifact = JSON.parse(readFileSync(absolutePath, "utf8"));
    pass(label, `${artifact.artifactType ?? artifact.schema ?? "unknown"} status=${artifact.status ?? "unknown"}`);
    return artifact;
  } catch (error) {
    fail(label, `${absolutePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function runCapture(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10000
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function gitValue(args, fallback) {
  const value = await runCapture("git", args);
  return value.split(/\r?\n/).at(-1)?.trim() || fallback;
}

function checkpointLane(checkpoint, id) {
  return checkpoint?.lanes?.find?.((lane) => lane.id === id);
}

function resultFromMvp(mvpGate, id) {
  return mvpGate?.results?.find?.((result) => result.id === id);
}

function stageStatus(items) {
  if (items.some((item) => item.status === "blocked")) return "BLOCKED";
  if (items.some((item) => item.status === "needs-evidence")) return "NEEDS_EVIDENCE";
  return "PASS";
}

function laneRequirement(checkpoint, id, label, desiredStatuses = ["pass"]) {
  const lane = checkpointLane(checkpoint, id);
  if (!lane) {
    return {
      id,
      label,
      status: "needs-evidence",
      evidence: [],
      missingEvidence: [`${label} lane is missing from evidence checkpoint`]
    };
  }
  const status = lane.status === "pass"
    ? "pass"
    : lane.status === "blocked" || !desiredStatuses.includes(lane.status)
      ? "blocked"
      : "needs-evidence";
  return {
    id,
    label,
    status,
    artifactStatus: lane.artifactStatus,
    headSha: lane.headSha,
    evidence: [`checkpoint lane ${id} status=${lane.status} artifactStatus=${lane.artifactStatus}`],
    missingEvidence: lane.missingEvidence ?? [],
    blockers: lane.blockers ?? []
  };
}

function mvpRequirement(mvpGate, id, label) {
  const result = resultFromMvp(mvpGate, id);
  if (!result) {
    return {
      id,
      label,
      status: "needs-evidence",
      evidence: [],
      missingEvidence: [`${label} result is missing from MVP gate`]
    };
  }
  return {
    id,
    label,
    status: result.status === "PASS" ? "pass" : "blocked",
    evidence: [`MVP gate ${id} status=${result.status}`],
    missingEvidence: result.status === "PASS" ? [] : [`${label} status=${result.status}`]
  };
}

function planTextRequirement(planText, id, label, patterns) {
  const missing = patterns.filter((pattern) => !pattern.test(planText));
  return {
    id,
    label,
    status: missing.length === 0 ? "pass" : "blocked",
    evidence: missing.length === 0 ? [`plan mentions ${patterns.length} required signal(s)`] : [],
    missingEvidence: missing.map((pattern) => `plan text does not match ${pattern}`)
  };
}

function imageActualBuildRequirement(imageBuild) {
  const required = new Set(["operator", "api", "dashboard", "bundle"]);
  const actualBuilds = imageBuild?.actualBuilds ?? [];
  const statusByName = new Map(actualBuilds.map((build) => [build.name, build.status]));
  const missing = [...required].filter((name) => statusByName.get(name) !== "PASS");
  return {
    id: "image-actual-builds",
    label: "Operator/API/dashboard/bundle actual image builds",
    status: missing.length === 0 ? "pass" : "needs-evidence",
    evidence: missing.length === 0 ? ["operator/api/dashboard/bundle actual local builds passed"] : [],
    missingEvidence: missing.map((name) => `${name} actual build evidence is missing or not PASS`)
  };
}

function installPlanLightspeedRegistrationRequirement(installPlan) {
  if (!installPlan) {
    return {
      id: "install-plan-lightspeed-registration",
      label: "Install approval plan Lightspeed registration contract",
      status: "needs-evidence",
      evidence: [],
      missingEvidence: ["install approval plan artifact is missing"]
    };
  }

  const registration = installPlan.lightspeedRegistration;
  const blockers = [];
  if (!registration) {
    blockers.push("lightspeedRegistration summary is missing");
  }
  if (registration?.actionMode !== "previewOnly") {
    blockers.push(`actionMode=${registration?.actionMode ?? "missing"}`);
  }
  if (registration?.configResourceKind !== "OLSConfig") {
    blockers.push(`configResourceKind=${registration?.configResourceKind ?? "missing"}`);
  }
  if (registration?.mode !== "PatchOLSConfig") {
    blockers.push(`mode=${registration?.mode ?? "missing"}`);
  }
  if (registration?.desiredServer?.url?.endsWith("/mcp") !== true) {
    blockers.push("desired MCP server URL must end with /mcp");
  }
  if (registration?.legacyConfigMapMutationAttempted !== false) {
    blockers.push(
      `legacyConfigMapMutationAttempted=${String(registration?.legacyConfigMapMutationAttempted)}`
    );
  }
  if (registration?.clusterMutationAttempted !== false) {
    blockers.push(`clusterMutationAttempted=${String(registration?.clusterMutationAttempted)}`);
  }
  if (registration?.mutationAllowedByThisVerifier !== false) {
    blockers.push(
      `mutationAllowedByThisVerifier=${String(registration?.mutationAllowedByThisVerifier)}`
    );
  }
  const hasPatchPreviewCommand = (registration?.readOnlyCommands ?? []).some((command) =>
    command.command?.includes("verify:lightspeed:patch-preview")
  );
  if (!hasPatchPreviewCommand) {
    blockers.push("read-only patch-preview command is missing");
  }

  return {
    id: "install-plan-lightspeed-registration",
    label: "Install approval plan Lightspeed registration contract",
    status: blockers.length === 0 ? "pass" : "blocked",
    evidence: blockers.length === 0
      ? [
          `${registration.mode} ${registration.configResourceKind} ${registration.target?.namespace}/${registration.target?.name} desired=${registration.desiredServer?.name}`
        ]
      : [],
    missingEvidence: blockers,
    blockers
  };
}

function artifactRef(artifact) {
  return {
    headSha: artifact?.headSha ?? artifact?.ref?.headSha,
    worktreeDirty: artifact?.worktreeDirty ?? artifact?.ref?.worktreeDirty
  };
}

function artifactFreshnessRequirement(artifact, id, label, currentHeadSha) {
  if (!artifact) {
    return {
      id,
      label,
      status: "needs-evidence",
      evidence: [],
      missingEvidence: [`${label} artifact is missing`]
    };
  }
  const ref = artifactRef(artifact);
  const missingEvidence = [];
  if (!ref.headSha) {
    missingEvidence.push(`${label} artifact does not stamp headSha`);
  } else if (ref.headSha !== currentHeadSha) {
    missingEvidence.push(`${label} artifact headSha=${ref.headSha} does not match current head=${currentHeadSha}`);
  }
  if (ref.worktreeDirty !== false) {
    missingEvidence.push(`${label} artifact was not generated from a clean worktree`);
  }
  return {
    id,
    label,
    status: missingEvidence.length === 0 ? "pass" : "needs-evidence",
    artifactType: artifact.artifactType ?? artifact.schema ?? "unknown",
    artifactStatus: artifact.status ?? "unknown",
    headSha: ref.headSha,
    evidence: missingEvidence.length === 0
      ? [`${label} artifact is fresh for head=${currentHeadSha}`]
      : [],
    missingEvidence
  };
}

function stage(id, title, requirements) {
  const status = stageStatus(requirements);
  return {
    id,
    title,
    status,
    requirements,
    missingEvidence: requirements.flatMap((item) =>
      (item.missingEvidence ?? []).map((entry) => `${item.id}: ${entry}`)
    ),
    blockers: requirements.flatMap((item) =>
      (item.blockers ?? []).map((entry) => `${item.id}: ${entry}`)
    )
  };
}

async function main() {
  const branch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown");
  const headSha = await gitValue(["rev-parse", "--short", "HEAD"], "unknown");
  const baseRef = await gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], "unknown");
  const worktreeStatus = await runCapture("git", ["status", "--short"]);
  const worktreeDirty = worktreeStatus.length > 0;

  if (worktreeDirty) {
    warn("current worktree", `dirty=true entries=${worktreeStatus.split(/\r?\n/).filter(Boolean).length}`);
  } else {
    pass("current worktree", `dirty=false head=${headSha}`);
  }

  const planPath = resolve(paths.plan);
  const planText = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
  if (planText) pass("roadmap plan source", `${planPath} loaded`);
  else fail("roadmap plan source", `${planPath} is missing`);

  const checkpoint = loadJson(paths.evidenceCheckpoint, "evidence checkpoint");
  const mvpGate = loadJson(paths.mvpGate, "MVP gate");
  const imageBuild = loadJson(paths.imageBuild, "image build readiness");
  const ownedImageProvenance = loadJson(paths.ownedImageProvenance, "owned image provenance");
  const consolePluginAssets = loadJson(paths.consolePluginAssets, "ConsolePlugin assets");
  const installPlan = loadJson(paths.installPlan, "install approval plan");
  const globalRequirements = [
    artifactFreshnessRequirement(checkpoint, "checkpoint-fresh", "Evidence checkpoint", headSha),
    artifactFreshnessRequirement(mvpGate, "mvp-gate-fresh", "MVP gate", headSha),
    artifactFreshnessRequirement(imageBuild, "image-build-fresh", "Image build readiness", headSha),
    artifactFreshnessRequirement(ownedImageProvenance, "owned-image-provenance-fresh", "Owned image provenance", headSha),
    artifactFreshnessRequirement(consolePluginAssets, "console-plugin-assets-fresh", "ConsolePlugin assets", headSha),
    artifactFreshnessRequirement(installPlan, "install-plan-fresh", "Install approval plan", headSha)
  ];

  const stages = [
    stage("stage-1-lightspeed-mcp", "OpenShift Lightspeed MCP PoC", [
      planTextRequirement(planText, "plan-lightspeed-mcp", "Plan names Lightspeed MCP, not a hidden webhook dependency", [
        /Lightspeed MCP/i,
        /OLSConfig/i,
        /커스텀 MCP|custom MCP/i
      ]),
      laneRequirement(checkpoint, "lightspeedRouting", "10-question Lightspeed tool routing score"),
      laneRequirement(checkpoint, "lightspeedTrojanHorse", "Exact Korean Trojan Horse custom question"),
      laneRequirement(checkpoint, "ocpConnectivity", "Live OCP connectivity diagnostic", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "lightspeedReadiness", "Live Lightspeed/OCP readiness", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "liveHandoff", "Read-only live evidence handoff"),
      laneRequirement(checkpoint, "ocpNetworkHandoff", "Network/SRE handoff packet"),
      laneRequirement(checkpoint, "ocpAuthRbacPlan", "OCP auth/RBAC approval packet"),
      mvpRequirement(mvpGate, "LIGHTSPEED-ROUTING", "MVP Lightspeed routing verifier"),
      mvpRequirement(mvpGate, "LIGHTSPEED-TROJAN-HORSE", "MVP exact Trojan Horse verifier")
    ]),
    stage("stage-2-aiops-pipeline", "Cywell AI Ops incident pipeline", [
      planTextRequirement(planText, "plan-aiops", "Plan names logs, metrics, and YAML remediation recommendation", [
        /로그|logs?/i,
        /장애|이벤트|상태|alert|incident/i,
        /YAML|Memory Limit|메모리/i
      ]),
      mvpRequirement(mvpGate, "RUNTIME-RAG", "Runtime RAG adapter contract"),
      mvpRequirement(mvpGate, "RUNTIME-RAG-FIXTURE", "Runtime RAG fixture success path"),
      mvpRequirement(mvpGate, "BUILD", "Plan-only incident API build coverage")
    ]),
    stage("stage-3-dashboard", "Dedicated OpsLens dashboard", [
      planTextRequirement(planText, "plan-dashboard", "Plan names independent OpsLens dashboard", [
        /대시보드|dashboard/i,
        /Console Dynamic Plugin|Console Plugin/i,
        /토큰|GPU|RAG 문서/i
      ]),
      laneRequirement(checkpoint, "ragApprovalQueue", "RAG approval queue dashboard evidence"),
      laneRequirement(checkpoint, "consolePluginAssets", "ConsolePlugin dynamic plugin asset evidence"),
      mvpRequirement(mvpGate, "CONSOLE-PLUGIN", "Console dynamic plugin assets"),
      mvpRequirement(mvpGate, "RAG-APPROVAL-QUEUE", "RAG approval queue verifier")
    ]),
    stage("stage-4-operator-packaging", "Operator SDK packaging and internal catalog", [
      planTextRequirement(planText, "plan-operator", "Plan names Operator, bundle/catalog, and Lightspeed registration automation", [
        /Operator/i,
        /CatalogSource|FBC|카탈로그/i,
        /OLSConfig|ConfigMap/i
      ]),
      mvpRequirement(mvpGate, "OPERATOR-PACKAGE", "Operator package verifier"),
      mvpRequirement(mvpGate, "OPERATOR-RECONCILE", "Operator reconcile safety verifier"),
      mvpRequirement(mvpGate, "OPERATOR-RUNTIME", "Operator runtime parity verifier"),
      laneRequirement(checkpoint, "consolePluginAssets", "ConsolePlugin dynamic plugin asset evidence"),
      laneRequirement(checkpoint, "operatorDryRun", "Live Operator server dry-run", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "installPlan", "Human install approval plan", ["pass", "needs-evidence"]),
      installPlanLightspeedRegistrationRequirement(installPlan),
      laneRequirement(checkpoint, "liveHandoff", "SRE-safe live evidence handoff"),
      laneRequirement(checkpoint, "ocpNetworkHandoff", "Network/SRE handoff packet"),
      laneRequirement(checkpoint, "ocpAuthRbacPlan", "OCP auth/RBAC approval packet"),
      imageActualBuildRequirement(imageBuild)
    ]),
    stage("stage-5-redhat-gtm", "Red Hat certification and catalog GTM", [
      planTextRequirement(planText, "plan-certification", "Plan names Community/Certified Operator and Red Hat certification path", [
        /Community Operator/i,
        /Certified Operator|Red Hat Certified/i,
        /Partner Connect|OperatorHub|인증/i
      ]),
      mvpRequirement(mvpGate, "CERTIFICATION", "Certification readiness verifier"),
      laneRequirement(checkpoint, "certificationReadiness", "Certification readiness evidence", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "catalogToolchain", "Catalog toolchain readiness", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "externalRuntime", "External runtime image evidence", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "externalRuntimeReviewPacket", "External runtime reviewer packet", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "securityScan", "Security scan and SBOM evidence plan", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "securityScanRunner", "Security scan evidence runner", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "releasePublish", "Release publish approval plan", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "ownedImageProvenance", "Owned image provenance", ["pass", "needs-evidence"]),
      laneRequirement(checkpoint, "imageBuild", "Image build readiness")
    ])
  ];

  for (const item of globalRequirements) {
    if (item.status === "pass") pass(item.label, item.evidence.join("; "));
    else warn(item.label, item.missingEvidence.join("; "));
  }

  for (const item of stages) {
    if (item.status === "PASS") pass(item.title, "stage evidence is locally complete");
    else if (item.status === "NEEDS_EVIDENCE") warn(item.title, item.missingEvidence.join("; ") || "stage needs external evidence");
    else fail(item.title, item.blockers.join("; ") || item.missingEvidence.join("; "));
  }

  const blockers = [
    ...globalRequirements.flatMap((item) =>
      item.status === "blocked" ? item.blockers ?? item.missingEvidence ?? [] : []
    ),
    ...stages.flatMap((item) =>
      item.status === "BLOCKED" ? item.blockers.length ? item.blockers : item.missingEvidence : []
    )
  ];
  const missingEvidence = [
    ...globalRequirements.flatMap((item) =>
      item.status === "needs-evidence" ? item.missingEvidence : []
    ),
    ...stages.flatMap((item) => item.missingEvidence)
  ];
  const status = blockers.length > 0
    ? "BLOCKED"
    : missingEvidence.length > 0 || checkpoint?.status === "NEEDS_EVIDENCE"
      ? "NEEDS_EVIDENCE"
      : "PASS";

  const artifact = {
    schema: "cywell.opslens.roadmap-plan-alignment.v0.1",
    artifactType: "opslens.roadmap-plan-alignment.v0.1",
    generatedAt: new Date().toISOString(),
    startedAt,
    status,
    ref: {
      branch,
      headSha,
      baseRef,
      worktreeDirty,
      worktreeStatus: worktreeStatus ? worktreeStatus.split(/\r?\n/) : []
    },
    planSource: {
      path: resolve(paths.plan),
      title: "Cywell OpsLens 단계별 실행 기획서"
    },
    globalRequirements,
    stages,
    missingEvidence,
    blockers,
    evidence: [
      "roadmap verifier maps CywellOpsLens_plan.md stages to current local evidence artifacts",
      "NEEDS_EVIDENCE is expected until live OCP/Lightspeed, external runtime certification inputs, release approval, and install approval are supplied",
      "the verifier does not patch, apply, delete, scale, push, sign, mirror, or contact the cluster"
    ],
    risk: [
      "This is a plan-alignment board, not a release approval.",
      "Lightspeed MCP remains a Technology Preview integration path; the supported product path remains Operator plus Console Plugin plus Cywell-controlled RAG.",
      "A stage can be locally implemented while still needing external evidence before customer release."
    ],
    rollbackPath: [
      "No rollback is required because this verifier reads local files only.",
      "Regenerate the underlying evidence with the verifier named by each stage requirement.",
      "Do not run mutating install, OLSConfig patch, image push, signing, or mirroring commands from this artifact."
    ],
    checks
  };

  await mkdir(dirname(resolve(paths.roadmapOut)), { recursive: true });
  await writeFile(resolve(paths.roadmapOut), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  pass("roadmap plan alignment export", `${resolve(paths.roadmapOut)} written without secret material`);

  const totals = {
    fail: checks.filter((check) => check.status === "FAIL").length,
    warn: checks.filter((check) => check.status === "WARN").length,
    pass: checks.filter((check) => check.status === "PASS").length
  };

  console.log("");
  for (const check of checks) {
    console.log(`[${check.status}] ${check.name}: ${check.detail}`);
  }
  console.log("");
  console.log(`Cywell OpsLens roadmap plan alignment: status=${status}, ${totals.fail} fail, ${totals.warn} warn, ${checks.length} checks`);

  if (status === "BLOCKED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail("roadmap plan verifier runtime", error instanceof Error ? error.message : String(error));
  console.error(`[FAIL] roadmap plan verifier runtime: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
