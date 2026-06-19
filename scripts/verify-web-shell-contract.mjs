#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const evidenceOut = "test-results/cywell-opslens-web-shell-contract.json";
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

function expectCheck(name, condition, detail, failDetail = detail) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, failDetail);
  }
}

async function readText(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch (error) {
    fail("file readable", `${path} is not readable: ${error.message}`);
    return "";
  }
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || fallback;
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

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const end = source.indexOf(endMarker, start + startMarker.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

async function loadTypescriptModule(source, label) {
  try {
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false
      }
    }).outputText;
    return await import(
      `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
    );
  } catch (error) {
    fail(`${label} module load`, `${label} could not be evaluated: ${error.message}`);
    return {};
  }
}

const appSource = await readText("apps/web/src/App.tsx");
const assistantSource = await readText("apps/web/src/components/AssistantPopover.tsx");
const evidenceSource = await readText("apps/web/src/components/ConsoleEvidencePane.tsx");
const overviewSource = await readText("apps/web/src/components/OcpConsoleOverview.tsx");
const dashboardSource = await readText("apps/web/src/components/OperationsDashboard.tsx");
const explorerSource = await readText("apps/web/src/components/OcpResourceExplorer.tsx");
const topologySource = await readText("apps/web/src/components/OcpTopologyGraph.tsx");
const ecosystemSource = await readText("apps/web/src/components/OcpEcosystemConsole.tsx");
const homeSource = await readText("apps/web/src/components/OcpHomeConsole.tsx");
const workloadsSource = await readText("apps/web/src/components/OcpWorkloadsConsole.tsx");
const nativeObjectLinkSource = await readText("apps/web/src/components/NativeObjectLink.tsx");
const nativeObjectDrilldownSource = await readText(
  "apps/web/src/components/OcpNativeObjectDrilldown.tsx"
);
const monitoringSource = await readText("apps/web/src/components/OcpMonitoringConsole.tsx");
const buildsSource = await readText("apps/web/src/components/OcpBuildsConsole.tsx");
const networkingSource = await readText("apps/web/src/components/OcpNetworkingConsole.tsx");
const storageSource = await readText("apps/web/src/components/OcpStorageConsole.tsx");
const administrationSource = await readText("apps/web/src/components/OcpAdministrationConsole.tsx");
const computeSource = await readText("apps/web/src/components/OcpComputeConsole.tsx");
const userManagementSource = await readText("apps/web/src/components/OcpUserManagementConsole.tsx");
const coverageSource = await readText("apps/web/src/components/OcpCoverageMatrix.tsx");
const paritySource = await readText("apps/web/src/consoleParity.ts");
const parityModule = await loadTypescriptModule(paritySource, "console parity");
const parityItems = Array.isArray(parityModule.ocpConsoleParityItems)
  ? parityModule.ocpConsoleParityItems
  : [];
const paritySummary =
  typeof parityModule.parityCoverageSummary === "function"
    ? parityModule.parityCoverageSummary()
    : {};
const coverageClasses = ["live-view", "native-deep-link", "plan-only", "gap"];
const coverageCounts = Object.fromEntries(
  coverageClasses.map((coverageClass) => [
    coverageClass,
    parityItems.filter((item) => item.coverageClass === coverageClass).length
  ])
);
const parityMapDocSource = await readText(
  "docs/acceptance/ocp-4.21.14-console-parity-map.md"
);
const dev017PlanSource = await readText(
  "docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.7-live-polish-plan.md"
);
const parityComponentSource = await readText(
  "apps/web/src/components/OcpConsoleParityMatrix.tsx"
);
const actionPanelSource = await readText(
  "apps/web/src/components/OcpConsoleActionPanel.tsx"
);
const resourceExplorerSource = await readText(
  "apps/web/src/components/OcpResourceExplorer.tsx"
);
const adminSource = await readText("apps/web/src/components/OpsLensAdminDashboard.tsx");
const consoleExtensionsSource = await readText("apps/web/console-extensions.json");
const routeSource = await readText("apps/web/src/plugin/OpsLensRoute.tsx");
const apiSource = await readText("apps/web/src/lib/api.ts");
const packageSource = await readText("package.json");
const contractsSource = await readText("packages/contracts/src/types.ts");
const backendApiSource = await readText("apps/api/src/api.ts");
const ocpClientSource = await readText("apps/api/src/ocpClient.ts");
const backendServerSource = await readText("apps/api/src/server.ts");
const backendLightspeedSource = await readText("apps/api/src/lightspeedClient.ts");
const ocp420CompatibilitySource = await readText("scripts/verify-ocp-420-compatibility.mjs");
const ocp420LiveReadinessSource = await readText("scripts/verify-ocp-420-live-readiness.mjs");
const stylesSource = await readText("apps/web/src/styles/app.css");
const e2eSource = await readText("tests/e2e/mvp-0.1.spec.ts");
const captureScriptSource = await readText("scripts/capture-dev015-demo-evidence.mjs");
const liveInstallSource = await readText(
  "apps/web/src/components/OpsLensLiveInstallStatus.tsx"
);
const mastheadSource = sourceSection(
  appSource,
  '<header className="masthead"',
  "</header>"
);
const releaseRefreshSource = sourceSection(
  adminSource,
  'data-testid="opslens-release-refresh"',
  'data-testid="opslens-release-evidence-bundle"'
);
const releaseBundleSource = sourceSection(
  adminSource,
  'data-testid="opslens-release-evidence-bundle"',
  'data-testid="opslens-release-action-queue"'
);
const releaseActionQueueSource = sourceSection(
  adminSource,
  'data-testid="opslens-release-action-queue"',
  'data-testid="opslens-evidence-checkpoint"'
);
const installApprovalPlanSource = sourceSection(
  adminSource,
  'data-testid="opslens-install-approval-plan"',
  "{catalogToolchainPlan ? ("
);
const catalogToolchainSource = sourceSection(
  adminSource,
  "{catalogToolchainPlan ? (",
  'data-testid="opslens-lab-readiness"'
);
const labReadinessSource = sourceSection(
  adminSource,
  'data-testid="opslens-lab-readiness"',
  'data-testid="opslens-certification-readiness"'
);
const externalRuntimeReviewSource = sourceSection(
  adminSource,
  'data-testid="opslens-external-runtime-review-packet"',
  'data-testid="opslens-security-scan-plan"'
);
const securityScanSource = sourceSection(
  adminSource,
  'data-testid="opslens-security-scan-plan"',
  'data-testid="opslens-owned-image-provenance"'
);
const ownedImageProvenanceSource = sourceSection(
  adminSource,
  'data-testid="opslens-owned-image-provenance"',
  'data-testid="opslens-release-publish-plan"'
);
const ragProductionSource = sourceSection(
  adminSource,
  'data-testid="opslens-rag-production-readiness"',
  'data-testid="opslens-rag-approval-queue-inventory"'
);
const releasePublishPlanSource = sourceSection(
  adminSource,
  'data-testid="opslens-release-publish-plan"',
  "</article>"
);
const certificationReadinessSource = sourceSection(
  adminSource,
  'data-testid="opslens-certification-readiness"',
  'data-testid="opslens-community-submission"'
);
const communitySubmissionSource = sourceSection(
  adminSource,
  'data-testid="opslens-community-submission"',
  'data-testid="opslens-external-runtime-plan"'
);
const externalRuntimePlanSource = sourceSection(
  adminSource,
  'data-testid="opslens-external-runtime-plan"',
  'data-testid="opslens-external-runtime-review-packet"'
);

expectCheck(
  "runtime surface context",
  !appSource.includes('data-testid="runtime-surface"') &&
    !appSource.includes('data-testid="api-route-mode"') &&
    !appSource.includes('data-testid="console-plugin-scope"') &&
    !appSource.includes('data-testid="runtime-surface-strip"') &&
    appSource.includes('data-testid="console-context-primary"') &&
    appSource.includes('data-testid="console-context-secondary"') &&
    appSource.includes('data-testid="api-status"') &&
    appSource.includes("CRC validation shell") &&
    appSource.includes("OpenShift ConsolePlugin") &&
    !appSource.includes("<span>prod-ocp / openshift-cluster-version</span>") &&
    appSource.includes("console route pending / company OCP untouched") &&
    appSource.includes("UserToken proxy / active console context"),
  "dashboard shell keeps runtime context compact in the masthead"
);

expectCheck(
  "customer masthead stays concise",
  !appSource.includes('data-testid="opslens-status-details"') &&
    !appSource.includes('data-testid="opslens-status-details-summary"') &&
    !appSource.includes("Show install and demo details") &&
    !appSource.includes("설치 및 시연 상세 보기") &&
    !appSource.includes('data-testid="ocp-live-status"') &&
    !appSource.includes('data-testid="dashboard-data-source"') &&
    appSource.includes('data-testid="api-status"') &&
    appSource.includes('"language-ko-toggle"') &&
    appSource.includes('"language-en-toggle"') &&
    appSource.includes("Globe2") &&
    appSource.includes("function renderActiveSurface()") &&
    appSource.includes('data-testid={`active-surface-${activeNavigation.actionSurface}`}') &&
    appSource.includes('data-testid="opslens-readiness-command-strip"') &&
    !mastheadSource.includes('data-testid="runtime-surface"') &&
    !mastheadSource.includes('data-testid="api-route-mode"') &&
    !mastheadSource.includes('data-testid="console-plugin-scope"') &&
    !mastheadSource.includes('data-testid="install-flow-strip"') &&
    !mastheadSource.includes('data-testid="mod-boundary-strip"') &&
    !mastheadSource.includes('data-testid="runtime-profile-strip"') &&
    !mastheadSource.includes('data-testid="certification-boundary-strip"') &&
    !mastheadSource.includes('data-testid="demo-handoff-strip"') &&
    !mastheadSource.includes('data-testid="access-boundary-strip"') &&
    !mastheadSource.includes('data-testid="apply-signal-strip"') &&
    !mastheadSource.includes('data-testid="post-install-smoke-strip"') &&
    e2eSource.includes('getByTestId("opslens-status-details")).toHaveCount(0)') &&
    e2eSource.includes('getByTestId("opslens-readiness-command-strip")).toHaveCount(0)') &&
    e2eSource.includes('getByTestId("active-surface-ops-admin")') &&
    e2eSource.includes("customer masthead stays compact"),
  "internal install/demo evidence is removed from the default shell and is available only from the OpsLens Admin surface"
);

expectCheck(
  "live CRC install status panel",
  appSource.includes("<OpsLensLiveInstallStatus language={language} />") &&
    liveInstallSource.includes('data-testid="opslens-live-install-status"') &&
    liveInstallSource.includes('data-testid="opslens-live-install-ocp"') &&
    liveInstallSource.includes('data-testid="opslens-live-install-workloads"') &&
    liveInstallSource.includes('data-testid="opslens-live-install-pods"') &&
    liveInstallSource.includes('data-testid="opslens-live-install-route"') &&
    liveInstallSource.includes('data-testid="opslens-live-install-blockers"') &&
    liveInstallSource.includes("opslensinstallations") &&
    liveInstallSource.includes("deployments") &&
    liveInstallSource.includes("pods") &&
    liveInstallSource.includes("routes") &&
    liveInstallSource.includes("source: live OCP resource API") &&
    liveInstallSource.includes("출처: 실시간 OCP 리소스 API") &&
    stylesSource.includes(".live-install-status") &&
    stylesSource.includes(".live-install-grid") &&
    e2eSource.includes("AC-LIVE-001 shows live OpsLens install state"),
  "dashboard reads the live CRC OpsLensInstallation, workload, pod, and route state instead of relying only on command text"
);

expectCheck(
  "live console data refresh contract",
  overviewSource.includes("window.setInterval") &&
    overviewSource.includes("fetchOcpConsoleOverview") &&
    overviewSource.includes("autoRefresh") &&
    resourceExplorerSource.includes("window.setInterval") &&
    resourceExplorerSource.includes("fetchOcpResourceList") &&
    resourceExplorerSource.includes("lastListLoadedAt") &&
    resourceExplorerSource.includes("silent: true") &&
    dashboardSource.includes("window.setInterval") &&
    dashboardSource.includes("fetchOcpConsoleOverview"),
  "overview, resource explorer, and operations dashboard re-read live OpenShift state instead of showing stale one-shot data"
);

expectCheck(
  "install and handoff notes stay out of customer masthead",
  !appSource.includes('data-testid="install-flow-strip"') &&
    !appSource.includes('data-testid="mod-boundary-strip"') &&
    !appSource.includes('data-testid="runtime-profile-strip"') &&
    !appSource.includes('data-testid="certification-boundary-strip"') &&
    !appSource.includes('data-testid="demo-handoff-strip"') &&
    !appSource.includes('data-testid="access-boundary-strip"') &&
    !appSource.includes('data-testid="apply-signal-strip"') &&
    !appSource.includes('data-testid="post-install-smoke-strip"') &&
    appSource.includes('data-testid="opslens-readiness-command-strip"') &&
    appSource.includes("<OpsLensLiveInstallStatus language={language} />") &&
    appSource.includes("case \"ops-admin\"") &&
    stylesSource.includes(".readiness-command-strip") &&
    stylesSource.includes(".live-install-status"),
  "install/apply/runbook notes are not rendered as masthead badges; readiness lives in the OpsLens Admin surface"
);

expectCheck(
  "console plugin proxy detection",
  appSource.includes('surface === "console-plugin"') &&
    appSource.includes('/api/proxy/plugin/cywell-opslens/') &&
    routeSource.includes("/api/plugins/cywell-opslens/index.html") &&
    routeSource.includes("/api/proxy/plugin/cywell-opslens/opslens-api") &&
    routeSource.includes("encodeURIComponent(apiProxyBase)") &&
    routeSource.includes("surface=console-plugin") &&
    routeSource.includes("window.location.replace") &&
    consoleExtensionsSource.includes('"href": "/opslens"') &&
    consoleExtensionsSource.includes('"startsWith": ["/opslens"]') &&
    consoleExtensionsSource.includes('"type": "console.page/route"') &&
    consoleExtensionsSource.includes('"path": "/opslens"') &&
    consoleExtensionsSource.includes('"exact": false') &&
    consoleExtensionsSource.includes('"$codeRef": "OpsLensRoute"') &&
    !consoleExtensionsSource.includes('"/api/plugins/cywell-opslens/"'),
  "console navigation opens /opslens and /opslens/* first, then a redirect-only route hard-navigates to the standalone OpsLens asset with the UserToken proxy base"
);

expectCheck(
  "installed console plugin proxy e2e",
  e2eSource.includes("AC-UI-007 shows installed ConsolePlugin proxy mode distinctly") &&
    e2eSource.includes("surface=console-plugin") &&
    e2eSource.includes("encodeURIComponent(pluginApiBase)") &&
    e2eSource.includes("/api/proxy/plugin/cywell-opslens/opslens-api/api/actions/plan") &&
    e2eSource.includes("console-plugin-user-token-proxy") &&
    e2eSource.includes("OpenShift UserToken proxy") &&
    e2eSource.includes("OpenShift ConsolePlugin") &&
    e2eSource.includes("UserToken proxy") &&
    e2eSource.includes("OpenShift 사용자 토큰 프록시") &&
    e2eSource.includes("OpenShift 콘솔 플러그인") &&
    e2eSource.includes("사용자 토큰 프록시") &&
    e2eSource.includes('getByTestId("opslens-status-details")).toHaveCount(0)') &&
    e2eSource.includes("읽기 전용/계획 전용"),
  "Playwright proves installed ConsolePlugin mode uses the UserToken proxy path and keeps the assistant read-only/plan-only"
);

expectCheck(
  "KOMSCO assistant branding",
  assistantSource.includes("KOMSCO AI Assistant") &&
    assistantSource.includes('ariaLabel: "KOMSCO AI Assistant"') &&
    assistantSource.includes('ariaLabel: "KOMSCO AI 어시스턴트"') &&
    assistantSource.includes('eyebrow: "KOMSCO AI 어시스턴트"') &&
    appSource.includes("KOMSCO AI Assistant") &&
    appSource.includes("Open KOMSCO AI Assistant") &&
    appSource.includes("KOMSCO AI 어시스턴트") &&
    appSource.includes("도움말이 KOMSCO AI 어시스턴트를 읽기 전용으로 열었습니다.") &&
    !assistantSource.includes("Context-aware assistant") &&
    !appSource.includes("context-aware assistant") &&
    !appSource.includes("KOMSCO AI Assistant를 읽기 전용"),
  "assistant copy and launcher accessibility labels are branded for KOMSCO instead of generic context-aware wording"
);

expectCheck(
  "OpenShift masthead user parity",
  appSource.includes('data-testid="masthead-user-menu"') &&
    appSource.includes("kubeadmin") &&
    !appSource.includes('data-testid="console-mode-toggle"') &&
    !appSource.includes('data-testid="console-mode-native"') &&
    !appSource.includes('data-testid="console-mode-opslens"') &&
    !appSource.includes("activateNativeConsoleMode") &&
    !appSource.includes('className="user-menu">admin'),
  "masthead keeps the OpenShift console user placement and kubeadmin demo identity without a fake in-app OpenShift/OpsLens toggle"
);

expectCheck(
  "OpsLens assistant icon",
  assistantSource.includes("cywell_ops_lens_icon.png") &&
    assistantSource.includes("assistant-app-icon") &&
    appSource.includes("launcher-icon-image") &&
    appSource.includes('data-testid="assistant-launcher-icon"') &&
    stylesSource.includes(".assistant-app-icon") &&
    stylesSource.includes(".launcher-icon-image") &&
    stylesSource.includes(".lightspeed-launcher") &&
    stylesSource.includes("background: transparent") &&
    stylesSource.includes("box-shadow: none") &&
    stylesSource.includes("border: 0") &&
    stylesSource.includes("object-fit: contain") &&
    !appSource.includes("<strong>{evidenceCount}</strong>"),
  "assistant header and floating launcher use the OpsLens icon asset without wrapping it in a decorative circle or evidence badge"
);

expectCheck(
  "assistant launcher silhouette e2e",
  e2eSource.includes('getByTestId("assistant-launcher-icon")') &&
    e2eSource.includes('backgroundColor).toBe("rgba(0, 0, 0, 0)")') &&
    e2eSource.includes('borderTopWidth).toBe("0px")') &&
    e2eSource.includes('boxShadow).toBe("none")') &&
    e2eSource.includes('objectFit).toBe("contain")'),
  "Playwright fails if the lower-right OpsLens launcher is wrapped back into a decorative circle"
);

expectCheck(
  "assistant API route diagnostics",
  appSource.includes("getApiRouteDiagnostics") &&
    appSource.includes("lastApiError") &&
    appSource.includes("onRetryConnection") &&
    appSource.includes("OpenShift Lightspeed /v1/streaming_query") &&
    assistantSource.includes('data-testid="assistant-api-route-mode"') &&
    assistantSource.includes('data-testid="assistant-action-plan-path"') &&
    assistantSource.includes('data-testid="assistant-last-api-error"') &&
    assistantSource.includes('data-testid="assistant-connection-summary"') &&
    assistantSource.includes('data-testid="assistant-mode-matrix"') &&
    assistantSource.includes('data-testid="assistant-answer-source"') &&
    assistantSource.includes('data-testid="assistant-token-path"') &&
    assistantSource.includes('data-testid="assistant-mutation-boundary"') &&
    assistantSource.includes('data-testid="assistant-connection-smoke"') &&
    assistantSource.includes('data-testid={`assistant-smoke-${item.id}`}') &&
    assistantSource.includes("Connection smoke") &&
    assistantSource.includes("연결 스모크") &&
    assistantSource.includes("context sync") &&
    assistantSource.includes("컨텍스트 동기화") &&
    assistantSource.includes("OpenShift Lightspeed route") &&
    assistantSource.includes("OpenShift Lightspeed 경로") &&
    assistantSource.includes("연결 판정") &&
    assistantSource.includes("답변 출처") &&
    assistantSource.includes("OpenShift 사용자 토큰 프록시") &&
    assistantSource.includes("실행 안 함") &&
    assistantSource.includes("answer source") &&
    assistantSource.includes('readyStatus: "OpenShift Lightspeed connected"') &&
    assistantSource.includes('readyStatus: "OpenShift Lightspeed 연결됨"') &&
    assistantSource.includes("Lightspeed connection required") &&
    assistantSource.includes("Lightspeed 연결 필요") &&
    assistantSource.includes("OpenShift Lightspeed /v1/streaming_query") &&
    assistantSource.includes("OpenShift UserToken proxy") &&
    assistantSource.includes("not executed") &&
    assistantSource.includes("가짜 AI 답변을 표시하지 않습니다") &&
    assistantSource.includes("오류 해석") &&
    assistantSource.includes("OpenShift Lightspeed 또는 OpsLens 프록시 경로") &&
    assistantSource.includes("assistant-last-api-error-interpretation") &&
    assistantSource.includes("Retry Lightspeed") &&
    apiSource.includes("console-plugin-user-token-proxy") &&
    apiSource.includes("local-vite-proxy"),
  "assistant surfaces Lightspeed route, last error, and retry control instead of hiding fallback state"
);

expectCheck(
  "assistant prompt-first flow",
  assistantSource.includes('prompt: "Ask KOMSCO AI Assistant"') &&
    assistantSource.includes('prompt: "KOMSCO AI 어시스턴트에 질문"') &&
    assistantSource.indexOf('className="prompt-box"') <
      assistantSource.indexOf('className="api-trace"'),
  "assistant opens as a KOMSCO question surface first, with route diagnostics below the prompt"
);

expectCheck(
  "assistant integration contract",
  assistantSource.includes('data-testid="assistant-integration-contract"') &&
    assistantSource.includes('data-testid="assistant-integration-standalone"') &&
    assistantSource.includes('data-testid="assistant-integration-console"') &&
    assistantSource.includes('data-testid="assistant-integration-lightspeed"') &&
    assistantSource.includes("Preview uses the same OpsLens question flow") &&
    assistantSource.includes("Installed ConsolePlugin uses the UserToken proxy") &&
    assistantSource.includes("OpsLens Assistant uses OpenShift Lightspeed /v1/streaming_query") &&
    assistantSource.includes("미리보기 화면도 콘솔 라우트 연결 전") &&
    assistantSource.includes("설치된 ConsolePlugin은 사용자 토큰 프록시") &&
    assistantSource.includes("OpsLens 어시스턴트는 OpenShift Lightspeed /v1/streaming_query") &&
    !assistantSource.includes("Standalone preview uses local API route") &&
    !assistantSource.includes("독립 미리보기는 로컬 API 경로") &&
    stylesSource.includes(".assistant-integration-contract") &&
    stylesSource.includes(".assistant-integration-contract span") &&
    stylesSource.includes(".assistant-connection-smoke") &&
    stylesSource.includes(".assistant-connection-smoke span"),
  "assistant visibly separates preview, ConsolePlugin proxy integration, and Lightspeed-backed answer ownership"
);

expectCheck(
  "assistant ask execution path",
    assistantSource.includes('data-testid="assistant-mode-trigger"') &&
    assistantSource.includes('data-testid="assistant-mode-menu"') &&
    assistantSource.includes("modeAsk") &&
    assistantSource.includes("modeTroubleshooting") &&
    assistantSource.includes("Enter asks KOMSCO AI Assistant") &&
    assistantSource.includes("Shift+Enter adds a line") &&
    assistantSource.includes("Enter는 KOMSCO AI 어시스턴트에 질문") &&
    assistantSource.includes("Shift+Enter는 줄바꿈") &&
    !assistantSource.includes("assistant-chat-hints") &&
    !stylesSource.includes(".assistant-chat-hints"),
  "assistant keeps keyboard behavior implemented while exposing the Lightspeed Ask/Troubleshooting selector"
);

expectCheck(
  "assistant movable placement contract",
  assistantSource.includes('data-testid="assistant-placement-toggle"') &&
    assistantSource.includes('data-testid="assistant-placement-status"') &&
    assistantSource.includes('data-testid="assistant-placement-move"') &&
    assistantSource.includes('data-testid="assistant-drag-handle"') &&
    assistantSource.includes("setPointerCapture") &&
    assistantSource.includes("releasePointerCapture") &&
    assistantSource.includes("clampAssistantPosition") &&
    assistantSource.includes("clampAssistantSize") &&
    assistantSource.includes("nextAssistantPosition") &&
    assistantSource.includes("assistantResizeDirections") &&
    assistantSource.includes('data-testid={`assistant-resize-${direction}`}') &&
    assistantSource.includes("placementPinned") &&
    assistantSource.includes("placementFloating") &&
    stylesSource.includes(".assistant-popover.floating") &&
    stylesSource.includes(".assistant-resize-handle") &&
    stylesSource.includes("cursor: ns-resize") &&
    stylesSource.includes("cursor: ew-resize") &&
    stylesSource.includes(".assistant-popover.floating .assistant-header") &&
    stylesSource.includes("cursor: grab") &&
    e2eSource.includes("AC-UI-002b lets operators unpin and move the assistant") &&
    e2eSource.includes('getByTestId("assistant-placement-toggle")') &&
    e2eSource.includes('getByTestId("assistant-placement-move")') &&
    e2eSource.includes("toBeGreaterThan"),
  "assistant can be pinned/unpinned and moved so it does not permanently cover console content"
);

expectCheck(
  "assistant prompt-aware answer path",
  backendApiSource.includes("queryOpenShiftLightspeed") &&
    backendApiSource.includes("createLightspeedAssistantAnswer") &&
    backendApiSource.includes("openshift-lightspeed/v1/streaming_query") &&
    backendApiSource.includes("OpenShiftLightspeedUnavailable") &&
    backendLightspeedSource.includes("/v1/streaming_query") &&
    backendLightspeedSource.includes("mode: LightspeedQueryMode") &&
    backendLightspeedSource.includes("referenced_documents") &&
    e2eSource.includes("keyboardPrompt") &&
    e2eSource.includes('getByTestId("answer-judgment")') &&
    e2eSource.includes('getByTestId("answer-citations")'),
  "assistant API responses are owned by OpenShift Lightspeed /v1/streaming_query and keep unavailable states explicit"
);

expectCheck(
  "interactive shell action contracts",
  appSource.includes('data-testid="nav-collapse-toggle"') &&
    appSource.includes('data-testid="masthead-app-launcher"') &&
    appSource.includes('data-testid="masthead-notifications"') &&
    appSource.includes('data-testid="masthead-create"') &&
    appSource.includes('data-testid="masthead-help"') &&
    appSource.includes('data-testid={`console-nav-${item.id}`}') &&
    appSource.includes("function activateNavigation") &&
    appSource.includes("setActiveNavId(item.id)") &&
    appSource.includes("setEvidenceView(item.evidenceView)") &&
    appSource.includes("setResourcePreset({") &&
    appSource.includes("function runUtilityAction") &&
    appSource.includes("function openNativeOcpConsole") &&
    appSource.includes("function askAssistantForActiveNavigation") &&
    appSource.includes("setAssistantOpen(true)") &&
    appSource.includes("scrollToNavigationTarget(targetSelector)") &&
    actionPanelSource.includes('data-testid="console-active-action"') &&
    actionPanelSource.includes('data-testid="console-active-native-open"') &&
    actionPanelSource.includes('data-testid="console-active-opslens-details"') &&
    actionPanelSource.includes('data-testid="console-active-ask-assistant"') &&
    evidenceSource.includes('data-testid="evidence-view-alerts"') &&
    evidenceSource.includes('data-testid="evidence-view-logs"') &&
    evidenceSource.includes('data-testid="evidence-view-yaml"') &&
    evidenceSource.includes('data-testid="evidence-ask-alerts"') &&
    evidenceSource.includes('data-testid="evidence-ask-logs"') &&
    evidenceSource.includes('data-testid="evidence-ask-yaml"') &&
    assistantSource.includes('data-testid="assistant-draft"') &&
    assistantSource.includes('data-testid="assistant-ask-button"') &&
    assistantSource.includes('data-testid="assistant-request-id"') &&
    assistantSource.includes('data-testid="assistant-retry-api"') &&
    assistantSource.includes('data-testid="assistant-close"') &&
    assistantSource.includes("handleDraftKeyDown") &&
    assistantSource.includes('event.key !== "Enter"') &&
    assistantSource.includes("event.shiftKey") &&
    assistantSource.includes("event.preventDefault()") &&
    assistantSource.includes("onAsk()"),
  "left navigation, masthead utilities, evidence tabs, and assistant controls expose stable test ids and state-changing handlers"
);

expectCheck(
  "language prop contract",
  appSource.includes('useState<UiLanguage>') &&
    appSource.includes("<OperationsDashboard dashboard={dashboard} language={language}") &&
    appSource.includes("<OcpConsoleOverview language={language}") &&
    appSource.includes("<OcpConsoleParityMatrix") &&
    appSource.includes("<OcpResourceExplorer") &&
    appSource.includes("<OpsLensAdminDashboard language={language}") &&
    appSource.includes("<ConsoleEvidencePane") &&
    appSource.includes("document.documentElement.lang = language") &&
    appSource.includes("language={language}") &&
    appSource.includes("apiStatusLabels") &&
    assistantSource.includes("연결 확인 중") &&
    assistantSource.includes("동작 모드") &&
    assistantSource.includes("contextChipLabels") &&
    assistantSource.includes("공식 문서") &&
    assistantSource.includes("내부 실행 문서") &&
    assistantSource.includes("네임스페이스") &&
    assistantSource.includes("필터") &&
    assistantSource.includes("answerTextLabels") &&
    assistantSource.includes("CRC 미리보기") &&
    assistantSource.includes("근거 3건") &&
    assistantSource.includes("ClusterVersion이 업그레이드 차단 상태를 보고했습니다.") &&
    assistantSource.includes("Operator 조건이 버전 진행을 차단하고 있음") &&
    assistantSource.includes("정확한 ClusterVersion 조건 메시지") &&
    evidenceSource.includes("컨텍스트 발행 데이터") &&
    evidenceSource.includes("const evidenceCopy") &&
    overviewSource.includes("const overviewCopy") &&
    overviewSource.includes("콘솔형 실시간 개요") &&
    overviewSource.includes("실제 OCP 연결") &&
    dashboardSource.includes("const dashboardCopy") &&
    dashboardSource.includes("활성 장애 대기열") &&
    dashboardSource.includes("오래된 근거") &&
    explorerSource.includes("const explorerCopy") &&
    explorerSource.includes("실시간 OpenShift API") &&
    explorerSource.includes("대체 응답") &&
    explorerSource.includes("소유자 참조") &&
    explorerSource.includes("소유 하위 리소스") &&
    explorerSource.includes("RBAC 대기 중") &&
    explorerSource.includes("transitionTo") &&
    explorerSource.includes("{copy.transitionTo}") &&
    !explorerSource.includes("requestedApiVersion} to") &&
    coverageSource.includes("const coverageCopy") &&
    coverageSource.includes("OCP 읽기 범위 매트릭스") &&
    coverageSource.includes("const gapTypeLabels") &&
    coverageSource.includes("const listStatusLabels") &&
    coverageSource.includes("const detailStatusLabels") &&
    coverageSource.includes("const scopeLabels") &&
    coverageSource.includes("const diagnosticStatusLabels") &&
    coverageSource.includes("변환 웹훅 오류") &&
    coverageSource.includes("모든 네임스페이스") &&
    coverageSource.includes("권한 거부") &&
    coverageSource.includes("근거 없음") &&
    coverageSource.includes("gapTypeLabels[language][entry.gap.type]") &&
    coverageSource.includes("scopeLabels[language][entry.scope]") &&
    coverageSource.includes("diagnosticStatusLabels[language][item.status]") &&
    coverageSource.includes("범위 행을 선택하면 읽기 전용 진단 근거를 확인합니다.") &&
    adminSource.includes("const adminCopy") &&
    adminSource.includes("파인튜닝 필요") &&
    adminSource.includes("우회 명령 방어 점검") &&
    adminSource.includes("라우팅 점수") &&
    adminSource.includes("읽기 전용 도구") &&
    adminSource.includes("실시간 준비도") &&
    adminSource.includes("클러스터 변경 시도") &&
    adminSource.includes("설치 준비도") &&
    adminSource.includes("모니터링 프록시") &&
    adminSource.includes("수락된 알림") &&
    adminSource.includes("어시스턴트 변경 허용") &&
    adminSource.includes("남은 근거") &&
    adminSource.includes("copy.installReadiness") &&
    adminSource.includes("copy.ownedProvenance") &&
    adminSource.includes("copy.authRbacPlan") &&
    adminSource.includes("copy.monitoringProxy") &&
    adminSource.includes("copy.acceptedAlerts") &&
    adminSource.includes("copy.rawAlertReturned") &&
    adminSource.includes("copy.reviewGate") &&
    adminSource.includes("copy.targetConfidence") &&
    adminSource.includes("copy.runbooks") &&
    adminSource.includes("copy.fineTuningRequired") &&
    adminSource.includes("copy.writePolicy") &&
    adminSource.includes("copy.rawMemoryWrite") &&
    adminSource.includes("copy.nightlyLoop") &&
    adminSource.includes("copy.runtimeOwner") &&
    adminSource.includes("copy.dataOwner") &&
    adminSource.includes("copy.liveProbe") &&
    adminSource.includes("copy.mutationByVerifier") &&
    adminSource.includes("copy.contractReady") &&
    adminSource.includes("copy.auditAppendOnly") &&
    adminSource.includes("copy.queueMetadataWrite") &&
    adminSource.includes("런타임 소유자") &&
    adminSource.includes("실시간 점검") &&
    adminSource.includes("검증기 변경 허용") &&
    adminSource.includes("계약 준비") &&
    adminSource.includes("대기열 메타데이터 쓰기") &&
    adminSource.includes("감사 추가 전용") &&
    adminSource.includes("copy.currentGap") &&
    adminSource.includes("copy.requiredImages") &&
    adminSource.includes("copy.localInspect") &&
    adminSource.includes("statusText(language, String(value))") &&
    adminSource.includes("statusText(language, liveHandoff.currentGapClassification)") &&
    adminSource.includes("statusText(language, image.status)") &&
    adminSource.includes("actionModeText(language, tool.actionMode)") &&
    adminSource.includes("booleanText(language, lightspeedMcp?.trojanHorse.mutationAllowed)"),
  "primary console panels, coverage matrix, admin dashboard, and the resource explorer receive the selected language and own bilingual copy"
);

expectCheck(
  "localized dynamic assistant evidence phrases",
  assistantSource.includes("answerPhraseLabels") &&
    assistantSource.includes('"이전 Pod 로그"') &&
    assistantSource.includes('"사용 가능한 Pod 후보가 없음"') &&
    assistantSource.includes('"라벨 셀렉터 없음"') &&
    assistantSource.includes('"로그 읽음: 최근"') &&
    assistantSource.includes('"이벤트 조회 대상"') &&
    assistantSource.includes('"권한 거부"') &&
    assistantSource.includes("answerPhraseLabels[language].reduce") &&
    assistantSource.includes("text.split(source).join(replacement)") &&
    assistantSource.includes("const exact = answerTextLabels[language][value]"),
  "Assistant display text applies a reviewed phrase dictionary to live evidence phrases without changing raw answer data"
);

expectCheck(
  "localized admin summary labels",
  !adminSource.includes("<span>Remaining</span>") &&
    !adminSource.includes("<span>Required Images</span>") &&
    !adminSource.includes("<span>Local Inspect</span>") &&
    !adminSource.includes("<span>Remaining Evidence</span>") &&
    !adminSource.includes("assistantMutationAllowed=") &&
    !adminSource.includes("<span>gap={liveHandoff.currentGapClassification}</span>"),
  "Admin completion, live handoff, and owned-image summary cards use bilingual labels instead of raw developer labels"
);

expectCheck(
  "localized install readiness grid",
  !adminSource.includes("<h3>Install Readiness</h3>") &&
    !adminSource.includes('"Image Builds": overview.installReadiness.imageBuilds') &&
    !adminSource.includes('"Owned Provenance"') &&
    !adminSource.includes('"Auth/RBAC Plan":') &&
    adminSource.includes("id: \"owned-provenance\"") &&
    adminSource.includes("id: \"auth-rbac-plan\""),
  "Admin install readiness grid uses stable ids plus bilingual labels instead of English object keys"
);

expectCheck(
  "localized aiops intake labels",
  !adminSource.includes("<h3>Incident Metrics</h3>") &&
    !adminSource.includes("<h3>AI Ops Pipeline</h3>") &&
    !adminSource.includes("<span>Monitoring Proxy</span>") &&
    !adminSource.includes("<span>Alertmanager</span>") &&
    !adminSource.includes("accepted={alertmanagerIntake") &&
    !adminSource.includes("rawAlertReturned=") &&
    !adminSource.includes("missingQueries=") &&
    !adminSource.includes("<span>Live Smoke</span>") &&
    !adminSource.includes("<span>Selected Pod</span>") &&
    adminSource.includes("copy.metricSamples"),
  "Admin AI Ops and Alertmanager summary labels use bilingual copy instead of raw key/value UI labels"
);

expectCheck(
  "localized monitoring proxy handoff labels",
  !adminSource.includes('<span>owner={monitoringProxyHandoff?.owner ?? "cluster-sre"}</span>') &&
    !adminSource.includes("mutationAllowedByThisVerifier=\n              {String(\n                monitoringProxyHandoff?.mutationAllowedByThisVerifier") &&
    !adminSource.includes('<span>{monitoringProxyHandoff?.nextCommand ?? "npm run verify:aiops"}</span>') &&
    !adminSource.includes("{command.id}:mutation={String(command.mutation)}"),
  "Monitoring proxy handoff rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized ocp network handoff labels",
  adminSource.includes("copy.kubeconfigEnv") &&
    adminSource.includes("copy.humanApproval") &&
    adminSource.includes("copy.adminAsk") &&
    adminSource.includes('"Kubeconfig 환경"') &&
    !adminSource.includes("classification={ocpConnectivity.classification}") &&
    !adminSource.includes("clusterMutationAttempted=\n                  {String(ocpConnectivity.clusterMutationAttempted)}") &&
    !adminSource.includes("<span>Auth Boundary</span>") &&
    !adminSource.includes("diagnosis=\n                  {ocpConnectivity.credentialHygiene.credentialDiagnosis}") &&
    !adminSource.includes("storedByVerifier=\n                  {String(\n                    ocpConnectivity.credentialHygiene") &&
    !adminSource.includes("context={ocpConnectivity.diagnostics.ocContext.contextStatus}") &&
    !adminSource.includes("auth={ocpConnectivity.diagnostics.ocContext.authStatus}") &&
    !adminSource.includes("server={ocpConnectivity.diagnostics.ocContext.serverStatus}") &&
    !adminSource.includes("ocpConnectivity.diagnostics.ocContext.kubeconfigEnvConfigured\n                  )}") &&
    !adminSource.includes("status={ocpConnectivity.authRecovery.status}") &&
    !adminSource.includes("humanApproval=\n                  {String(\n                    ocpConnectivity.authRecovery") &&
    !adminSource.includes("tokenRedacted=\n                  {String(\n                    ocpConnectivity.authRecovery") &&
    !adminSource.includes('next={ocpConnectivity.authRecovery.nextCommands[0] ?? "none"}') &&
    !adminSource.includes("packet=\n                  {ocpConnectivity.authRecovery.markdownPath") &&
    !adminSource.includes("exists={String(ocpConnectivity.authRecovery.exists)}") &&
    !adminSource.includes("rbacAccessReviews=missing") &&
    !adminSource.includes("{hint.severity}:{hint.id} next={hint.nextCheck}") &&
    !adminSource.includes("classification={networkHandoff.classification}") &&
    !adminSource.includes("registryMutationAttempted=\n                  {String(networkHandoff.registryMutationAttempted)}") &&
    !adminSource.includes("first={networkHandoff.ticketPacket.firstReadOnlyAction.id}") &&
    !adminSource.includes("approval=\n                  {String(\n                    networkHandoff.ticketPacket.approvalGatedAction") &&
    !adminSource.includes("<span>network first actions missing</span>"),
  "OCP connectivity and network handoff panels use bilingual labels while preserving diagnostic values"
);

expectCheck(
  "localized auth rbac plan labels",
  adminSource.includes("copy.namespace") &&
    adminSource.includes("copy.reader") &&
    adminSource.includes("copy.clusterRole") &&
    adminSource.includes("copy.secretsIncluded") &&
    adminSource.includes('"읽기 계정"') &&
    !adminSource.includes("cases={networkHandoffApiFallback.caseCount}") &&
    !adminSource.includes("failedChecks={networkHandoffApiFallback.failedCheckCount}") &&
    !adminSource.includes("clusterMutationAttempted=\n                  {String(networkHandoffApiFallback.clusterMutationAttempted)}") &&
    !adminSource.includes(":first={testCase.firstActionId}:approval=") &&
    !adminSource.includes("<h4>OCP Auth/RBAC Plan</h4>") &&
    !adminSource.includes("classification={authRbacPlan.classification}") &&
    !adminSource.includes("clusterMutationAttempted=\n                  {String(authRbacPlan.clusterMutationAttempted)}") &&
    !adminSource.includes("<span>Namespace</span>") &&
    !adminSource.includes("<span>Reader</span>") &&
    !adminSource.includes("<span>Policy</span>") &&
    !adminSource.includes("readOnly={String(authRbacPlan.rbac.readOnlyOnly)}") &&
    !adminSource.includes("secrets={String(authRbacPlan.rbac.secretsIncluded)}") &&
    !adminSource.includes("readOnly={authRbacPlan.readOnlyCommands.length}, gated=") &&
    !adminSource.includes("{command.id} approval=\n                    {String(command.requiresExplicitApproval)}") &&
    !adminSource.includes("context={authRbacPlan.ocContext.contextStatus}") &&
    !adminSource.includes("auth={authRbacPlan.ocContext.authStatus}") &&
    !adminSource.includes("server={authRbacPlan.ocContext.serverStatus}") &&
    !adminSource.includes("kubeconfigEnv=\n                  {String(authRbacPlan.ocContext.kubeconfigEnvConfigured)}") &&
    !adminSource.includes("defaultKubeconfig=\n                  {String(authRbacPlan.ocContext.defaultKubeconfigPresent)}") &&
    !adminSource.includes(":requiresApproval=\n                    {String(\n                      authRbacPlan.ticketPacket.approvalGatedAction") &&
    !adminSource.includes(":mutationAllowed=\n                    {String(\n                      authRbacPlan.ticketPacket.mutationBoundary"),
  "Auth/RBAC and network fallback cards use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized live handoff smoke labels",
  adminSource.includes("copy.postApprovalSmoke") &&
    adminSource.includes("copy.lightspeedAuthReady") &&
    adminSource.includes("copy.blockedUntilHandoffExists") &&
    adminSource.includes('"승인 후 스모크"') &&
    !adminSource.includes("classification=\n                  {liveHandoff.postApprovalSmoke.ocpClassification}") &&
    !adminSource.includes("rbac=\n                  {liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}") &&
    !adminSource.includes("unknown=\n                  {liveHandoff.postApprovalSmoke.requiredRbacUnknownCount}") &&
    !adminSource.includes("lightspeedClassification=\n                  {liveHandoff.postApprovalSmoke.lightspeedClassification}") &&
    !adminSource.includes("lightspeedAuthReady=\n                  {String(liveHandoff.postApprovalSmoke.lightspeedAuthReady)}") &&
    !adminSource.includes("sources=\n                  {liveHandoff.postApprovalSmoke.sourceArtifacts.length") &&
    !adminSource.includes("<span>Read-only Commands</span>") &&
    !adminSource.includes("<span>Action Hints</span>") &&
    !adminSource.includes("<span>Post-approval Smoke</span>") &&
    !adminSource.includes("<span>Forbidden</span>") &&
    !adminSource.includes(":fresh=${String(\n                              source.fresh") &&
    !adminSource.includes("artifactStatus} rbac=${liveHandoff.postApprovalSmoke.requiredRbacAllowedCount}"),
  "Live handoff post-approval smoke rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized completion gate labels",
  adminSource.includes("copy.readyToClaim100") &&
    adminSource.includes("copy.cleanupDeletionAllowed") &&
    adminSource.includes("copy.bundleMatchesRoadmap") &&
    adminSource.includes('"100% 주장 준비"') &&
    !adminSource.includes("head={completionGate.headSha}") &&
    !adminSource.includes("dirty={String(completionGate.worktreeDirty)}") &&
    !adminSource.includes("readyToClaim100={String(completionGate.readyToClaim100)}") &&
    !adminSource.includes("mutationBoundaryPassed=\n                  {String(completionGate.mutationBoundaryPassed)}") &&
    !adminSource.includes("{gate.actionId}:next={gate.nextCommand}:external=") &&
    !adminSource.includes(":tickets=\n                    {gate.ticketIds.join") &&
    !adminSource.includes(":readOnly=\n                    {gate.readOnlyCommandIds") &&
    !adminSource.includes("{requirement.id}={String(requirement.passed)}") &&
    !adminSource.includes("owner={completionGate.claimPacket.owner}") &&
    !adminSource.includes("status={completionGate.claimPacket.status}") &&
    !adminSource.includes("readyToClaim100=\n                  {String(completionGate.claimPacket.readyToClaim100)}") &&
    !adminSource.includes("sources=\n                  {completionGate.claimPacket.sourceEvidenceChecklist") &&
    !adminSource.includes("failedSources=\n                  {completionGate.claimPacket.failedSourceEvidenceIds") &&
    !adminSource.includes("criticalPath=\n                  {completionGate.claimPacket.actionQueueCriticalPathCount}") &&
    !adminSource.includes("cleanupDeletionAllowed=\n                  {String(completionGate.ownerPacketCleanup.deletionAllowed)}") &&
    !adminSource.includes("{row.owner}:status={row.status}:first=") &&
    !adminSource.includes("bundleStatus={completionGate.releaseEvidenceBundle.status}") &&
    !adminSource.includes("bundleMatchesRoadmap=\n                  {String(") &&
    !adminSource.includes("actionQueueReady={String(completionGate.actionQueue.ready)}") &&
    !adminSource.includes("unsafeTickets=\n                  {completionGate.actionQueue.unsafeTickets.join"),
  "Completion gate cards use bilingual labels for 100% claim and closeout evidence instead of raw key/value UI labels"
);

expectCheck(
  "localized release action queue labels",
  adminSource.includes("function ticketText") &&
    adminSource.includes("function diagnosticsText") &&
    adminSource.includes("copy.ticketFirstAction") &&
    adminSource.includes('"작업 대기열 gap"') &&
    !releaseRefreshSource.includes("missingDiagnostics=") &&
    !releaseRefreshSource.includes("missingTickets=") &&
    !releaseRefreshSource.includes("unsafeTickets=") &&
    !releaseRefreshSource.includes("staleRemoved=") &&
    !releaseBundleSource.includes("actionQueueActionGaps=") &&
    !releaseBundleSource.includes("unsafeTickets=") &&
    !releaseActionQueueSource.includes(":readOnly=") &&
    !releaseActionQueueSource.includes(":approval=") &&
    !releaseActionQueueSource.includes(":ticketFirst=") &&
    !releaseActionQueueSource.includes(":diagnostics=") &&
    !releaseActionQueueSource.includes("catalogTicket=") &&
    !releaseActionQueueSource.includes("mutationAllowedByThisVerifier="),
  "Release refresh, bundle, and action queue rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized external runtime review labels",
    adminSource.includes("function mappedList") &&
    adminSource.includes('"review-packet-ready": "검토 패킷 준비"') &&
    adminSource.includes('reviewPacketOnly: "검토 패킷 전용"') &&
    adminSource.includes("copy.candidateHandoff") &&
    adminSource.includes("copy.registryPacket") &&
    adminSource.includes('"후보 인계"') &&
    externalRuntimeReviewSource.includes("statusText(language, externalRuntimeReview.artifactStatus)") &&
    !externalRuntimeReviewSource.includes("registryMutationAttempted=") &&
    !externalRuntimeReviewSource.includes("{externalRuntimeReview.artifactStatus}") &&
    !externalRuntimeReviewSource.includes("{externalRuntimeReview.actionMode}") &&
    !externalRuntimeReviewSource.includes("clusterMutationAttempted=") &&
    !externalRuntimeReviewSource.includes("mutationAllowedByThisVerifier=") &&
    !externalRuntimeReviewSource.includes(" best=") &&
    !externalRuntimeReviewSource.includes(" critical=") &&
    !externalRuntimeReviewSource.includes(" high=") &&
    !externalRuntimeReviewSource.includes(" eligible=") &&
    !externalRuntimeReviewSource.includes(":owner=") &&
    !externalRuntimeReviewSource.includes(":candidate=") &&
    !externalRuntimeReviewSource.includes(":finalEvidence=") &&
    !externalRuntimeReviewSource.includes(":requests=") &&
    !externalRuntimeReviewSource.includes(":approvalRequired=") &&
    !externalRuntimeReviewSource.includes(":requiresExplicitApproval=") &&
    !externalRuntimeReviewSource.includes(":mutationAllowed=") &&
    !externalRuntimeReviewSource.includes(":writesLocalEvidence=") &&
    !externalRuntimeReviewSource.includes("owner={externalRuntimeReview.finalEvidenceAction.owner}") &&
    !externalRuntimeReviewSource.includes("ready=") &&
    !externalRuntimeReviewSource.includes("reviewedInput=") &&
    !externalRuntimeReviewSource.includes("zeroCritical=") &&
    !externalRuntimeReviewSource.includes("registryPacket=") &&
    !externalRuntimeReviewSource.includes(":loginExecuted=") &&
    !externalRuntimeReviewSource.includes(":authRequired=") &&
    !externalRuntimeReviewSource.includes(":credentialStored=") &&
    !externalRuntimeReviewSource.includes(":registryLogin=") &&
    !externalRuntimeReviewSource.includes("not-run {command.id} approval="),
  "External runtime review packet rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized security scan labels",
  adminSource.includes("copy.scanCli") &&
    adminSource.includes('"needs-tooling": "도구 필요"') &&
    adminSource.includes('scanPlanOnly: "스캔 계획 전용"') &&
    adminSource.includes("copy.securityReviewTicketsClear") &&
    adminSource.includes('"보안 검토 최종 인계 누락"') &&
    securityScanSource.includes("statusText(language, securityScanPlan.artifactStatus)") &&
    securityScanSource.includes('data-testid="opslens-security-first-review-actions-table"') &&
    securityScanSource.includes('data-testid="opslens-security-review-ticket-table"') &&
    securityScanSource.includes('data-testid="opslens-security-review-final-handoff-table"') &&
    securityScanSource.includes('data-testid="opslens-security-review-drafts-table"') &&
    securityScanSource.includes("security-first-review-command-") &&
    securityScanSource.includes("security-review-promotion-command-") &&
    !securityScanSource.includes("{securityScanPlan.artifactStatus}") &&
    !securityScanSource.includes("{securityScanPlan.actionMode}") &&
    !securityScanSource.includes("registryMutationAttempted=") &&
    !securityScanSource.includes("clusterMutationAttempted=") &&
    !securityScanSource.includes("mutationAllowedByThisVerifier=") &&
    !securityScanSource.includes("<span>Scan CLI</span>") &&
    !securityScanSource.includes("<span>Image Evidence</span>") &&
    !securityScanSource.includes("scan=${String") &&
    !securityScanSource.includes(" sbom=${String") &&
    !securityScanSource.includes(" review=${String") &&
    !securityScanSource.includes(" approval=${String") &&
    !securityScanSource.includes(":next=") &&
    !securityScanSource.includes(":mutation={String") &&
    !securityScanSource.includes(":approval={String") &&
    !securityScanSource.includes(":first={ticket.firstReadOnlyAction.id}:approval=") &&
    !securityScanSource.includes(":mutationAllowed=") &&
    !securityScanSource.includes(":finalEvidence=") &&
    !securityScanSource.includes(":reviewApproved=") &&
    !securityScanSource.includes(":approvalRequired=") &&
    !securityScanSource.includes(":requiresExplicitApproval=") &&
    !securityScanSource.includes(":writesLocalEvidence=") &&
    !securityScanSource.includes("status={securityScanPlan.runnerEvidence.status}") &&
    !securityScanSource.includes("evidenceWritten=") &&
    !securityScanSource.includes("fresh={String(securityScanPlan.runnerEvidence.fresh)}") &&
    !securityScanSource.includes("dockerFallback=") &&
    !securityScanSource.includes("digestPinned=") &&
    !securityScanSource.includes("missingTargets=") &&
    !securityScanSource.includes(":draft=") &&
    !securityScanSource.includes(":sameHead=") &&
    !securityScanSource.includes(":decision=") &&
    !securityScanSource.includes(":explicitDecision=") &&
    !securityScanSource.includes(":reviewer=") &&
    !securityScanSource.includes(":ticket=") &&
    !securityScanSource.includes(":ready=") &&
    !securityScanSource.includes('.join(" / ")') &&
    !securityScanSource.includes("`${copy.owner}: ${action.owner}`") &&
    !securityScanSource.includes("`${copy.owner}: ${ticket.owner}`") &&
    !securityScanSource.includes("`${copy.status}: ${statusText(language, handoff.status)}`"),
  "Security scan and review rows use tables and bilingual labels instead of raw key/value UI dumps"
);

expectCheck(
  "localized install approval plan labels",
  installApprovalPlanSource.includes("copy.installPlan") &&
    installApprovalPlanSource.includes("actionModeText(language, approvalPlan.actionMode)") &&
    installApprovalPlanSource.includes("copy.mutatingCommands") &&
    installApprovalPlanSource.includes("copy.lightspeedRegistration") &&
    installApprovalPlanSource.includes("copy.ragIngestion") &&
    installApprovalPlanSource.includes("copy.configResource") &&
    installApprovalPlanSource.includes("copy.willPatch") &&
    installApprovalPlanSource.includes("copy.legacyConfigMapMutationAttempted") &&
    installApprovalPlanSource.includes("copy.clusterAdminPacket") &&
    installApprovalPlanSource.includes("copy.installDecision") &&
    installApprovalPlanSource.includes("copy.installExecuted") &&
    installApprovalPlanSource.includes("copy.installRequiresApproval") &&
    installApprovalPlanSource.includes("copy.queueEvidence") &&
    installApprovalPlanSource.includes("statusText(language, approvalPlan.ragIngestion.status)") &&
    installApprovalPlanSource.includes("approvalPlan.lightspeedRegistration.mode") &&
    installApprovalPlanSource.includes("statusText(language, approvalPlan.installDecisionAction.status)") &&
    !installApprovalPlanSource.includes("{approvalPlan.actionMode}") &&
    !installApprovalPlanSource.includes("clusterMutationAttempted=") &&
    !installApprovalPlanSource.includes("mutationAllowedByThisVerifier=") &&
    !installApprovalPlanSource.includes("<span>Approvals</span>") &&
    !installApprovalPlanSource.includes("<span>Mutating Commands</span>") &&
    !installApprovalPlanSource.includes("<span>Lightspeed Registration</span>") &&
    !installApprovalPlanSource.includes("<span>RAG Ingestion</span>") &&
    !installApprovalPlanSource.includes("jobCreated=") &&
    !installApprovalPlanSource.includes("{approvalPlan.lightspeedRegistration.actionMode}") &&
    !installApprovalPlanSource.includes("mode={approvalPlan.lightspeedRegistration.mode}") &&
    !installApprovalPlanSource.includes("willPatch=") &&
    !installApprovalPlanSource.includes("legacyConfigMapMutationAttempted=") &&
    !installApprovalPlanSource.includes("first approval actions clear") &&
    !installApprovalPlanSource.includes(":mutation=") &&
    !installApprovalPlanSource.includes(":approval=") &&
    !installApprovalPlanSource.includes(":requiresApproval=") &&
    !installApprovalPlanSource.includes(":mutationAllowed=") &&
    !installApprovalPlanSource.includes("packet=") &&
    !installApprovalPlanSource.includes("exists=") &&
    !installApprovalPlanSource.includes("ticket=") &&
    !installApprovalPlanSource.includes("decision=") &&
    !installApprovalPlanSource.includes("first=") &&
    !installApprovalPlanSource.includes("approval=") &&
    !installApprovalPlanSource.includes("installExecuted=") &&
    !installApprovalPlanSource.includes(":status=") &&
    !installApprovalPlanSource.includes(":lightspeed=") &&
    !installApprovalPlanSource.includes(":rag=") &&
    !installApprovalPlanSource.includes(":mode=") &&
    !installApprovalPlanSource.includes(":ragStatus=") &&
    !installApprovalPlanSource.includes(":writesLocalEvidence=") &&
    !installApprovalPlanSource.includes(":clusterMutationAttempted=") &&
    !installApprovalPlanSource.includes(":vectorWriteAttempted=") &&
    !installApprovalPlanSource.includes(":ingestionJobCreated=") &&
    !installApprovalPlanSource.includes(":installRequiresExplicitApproval=") &&
    !installApprovalPlanSource.includes("queueEvidence=") &&
    !installApprovalPlanSource.includes("vectorWriteAttempted="),
  "Install approval plan rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized catalog toolchain labels",
  catalogToolchainSource.includes("copy.catalogToolchain") &&
    catalogToolchainSource.includes("statusText(language, catalogToolchainPlan.artifactStatus)") &&
    catalogToolchainSource.includes("actionModeText(language, catalogToolchainPlan.actionMode)") &&
    adminSource.includes('toolchainPlanOnly: "도구체인 계획 전용"') &&
    catalogToolchainSource.includes("copy.registryAuthConfigured") &&
    catalogToolchainSource.includes("copy.registryBaseReadable") &&
    catalogToolchainSource.includes("copy.nextAction") &&
    catalogToolchainSource.includes("copy.handoff") &&
    catalogToolchainSource.includes("copy.cli") &&
    catalogToolchainSource.includes("copy.localArtifact") &&
    !catalogToolchainSource.includes("{catalogToolchainPlan.artifactStatus}") &&
    !catalogToolchainSource.includes("{catalogToolchainPlan.actionMode}") &&
    !catalogToolchainSource.includes("registryAuthConfigured=") &&
    !catalogToolchainSource.includes("registryBaseReadable=") &&
    !catalogToolchainSource.includes("registryMutationAttempted=") &&
    !catalogToolchainSource.includes("clusterMutationAttempted=") &&
    !catalogToolchainSource.includes("<span>Next Action</span>") &&
    !catalogToolchainSource.includes("<span>Handoff</span>") &&
    !catalogToolchainSource.includes("<span>CLI</span>") &&
    !catalogToolchainSource.includes("<span>Read-only Checks</span>") &&
    !catalogToolchainSource.includes("<span>Setup Needed</span>") &&
    !catalogToolchainSource.includes("<span>Local Artifact</span>") &&
    !catalogToolchainSource.includes("blocked until evidence exists"),
  "Catalog toolchain rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized lab readiness labels",
  labReadinessSource.includes("copy.dedicatedCrcLabReadiness") &&
    labReadinessSource.includes("actionModeText(language, labBootstrapPlan.actionMode)") &&
    adminSource.includes('localEvidenceOnly: "로컬 근거 전용"') &&
    adminSource.includes('"needs-local-artifacts": "로컬 산출물 필요"') &&
    adminSource.includes('"needs-current-evidence": "최신 근거 필요"') &&
    adminSource.includes('"needs-capacity-review": "용량 검토 필요"') &&
    adminSource.includes('"external-runtime-review-required": "외부 런타임 검토 필요"') &&
    labReadinessSource.includes("statusText(language, labBootstrapPlan.artifactStatus)") &&
    labReadinessSource.includes("statusText(language, labHandoffPlan.artifactStatus)") &&
    labReadinessSource.includes("statusText(language, labBootstrapPlan.labTier)") &&
    labReadinessSource.includes("statusText(language, labBootstrapPlan.runtimePlacement)") &&
    labReadinessSource.includes("copy.labTier") &&
    labReadinessSource.includes("copy.cpuRam") &&
    labReadinessSource.includes("copy.gpuRuntime") &&
    labReadinessSource.includes("copy.recommendedCrc") &&
    labReadinessSource.includes("copy.imageMap") &&
    labReadinessSource.includes("copy.portableTar") &&
    labReadinessSource.includes("copy.handoffSources") &&
    labReadinessSource.includes("copy.bootstrapWorkstation") &&
    labReadinessSource.includes("copy.bootstrapTransfer") &&
    labReadinessSource.includes("copy.bootstrapLabHost") &&
    labReadinessSource.includes("copy.labApproval") &&
    labReadinessSource.includes("copy.companyOcpUsed") &&
    !labReadinessSource.includes("<h4>Dedicated CRC Lab Readiness</h4>") &&
    !labReadinessSource.includes("{labBootstrapPlan.actionMode}") &&
    !labReadinessSource.includes("head={labBootstrapPlan.headSha}") &&
    !labReadinessSource.includes("dirty={String(labBootstrapPlan.worktreeDirty)}") &&
    !labReadinessSource.includes("clusterMutationAttempted=") &&
    !labReadinessSource.includes("registryMutationAttempted=") &&
    !labReadinessSource.includes("<span>Lab Tier</span>") &&
    !labReadinessSource.includes("<span>CPU / RAM</span>") &&
    !labReadinessSource.includes("<span>GPU Runtime</span>") &&
    !labReadinessSource.includes("<span>Recommended CRC</span>") &&
    !labReadinessSource.includes("<span>Image Map</span>") &&
    !labReadinessSource.includes("blocking={") &&
    !labReadinessSource.includes("external={") &&
    !labReadinessSource.includes("<span>Portable Tar</span>") &&
    !labReadinessSource.includes("exists={String") &&
    !labReadinessSource.includes("missingTags=") &&
    !labReadinessSource.includes("<span>Handoff Sources</span>") &&
    !labReadinessSource.includes("bootstrapWorkstation=") &&
    !labReadinessSource.includes("bootstrapTransfer=") &&
    !labReadinessSource.includes(":ready=") &&
    !labReadinessSource.includes("bootstrapMissing=") &&
    !labReadinessSource.includes("bootstrapLabHost=") &&
    !labReadinessSource.includes(":first=") &&
    !labReadinessSource.includes("bootstrapApproval=") &&
    !labReadinessSource.includes("workstation=") &&
    !labReadinessSource.includes("transfer=") &&
    !labReadinessSource.includes("transferMissing=") &&
    !labReadinessSource.includes("labHost=") &&
    !labReadinessSource.includes("labApproval=") &&
    !labReadinessSource.includes("companyOcpUsed="),
  "CRC lab readiness rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized certification readiness labels",
  certificationReadinessSource.includes("copy.certificationReadiness") &&
    adminSource.includes('certificationReadinessOnly: "인증 준비도 전용"') &&
    adminSource.includes('"blocked-by-missing-tooling": "도구 누락으로 차단"') &&
    adminSource.includes('"approval-gated": "승인 대기"') &&
    certificationReadinessSource.includes("copy.submissionCli") &&
    certificationReadinessSource.includes("copy.toolingHandoff") &&
    certificationReadinessSource.includes("copy.executionLanes") &&
    certificationReadinessSource.includes("statusText(language, certificationPlan.artifactStatus)") &&
    certificationReadinessSource.includes("actionModeText(language, certificationPlan.actionMode)") &&
    !certificationReadinessSource.includes("<h4>Certification Readiness</h4>") &&
    !certificationReadinessSource.includes("<span>Submission CLI</span>") &&
    !certificationReadinessSource.includes("<span>Gate Counts</span>") &&
    !certificationReadinessSource.includes("<span>Documents</span>") &&
    !certificationReadinessSource.includes("<span>Open Items</span>") &&
    !certificationReadinessSource.includes("<span>Tooling Handoff</span>") &&
    !certificationReadinessSource.includes("<span>Execution Lanes</span>") &&
    !certificationReadinessSource.includes("{certificationPlan.artifactStatus}") &&
    !certificationReadinessSource.includes("{certificationPlan.actionMode}") &&
    !certificationReadinessSource.includes("head={certificationPlan.headSha}") &&
    !certificationReadinessSource.includes("dirty={String(certificationPlan.worktreeDirty)}") &&
    !certificationReadinessSource.includes("registryMutationAttempted=") &&
    !certificationReadinessSource.includes("clusterMutationAttempted=") &&
    !certificationReadinessSource.includes("mutationAllowedByThisVerifier=") &&
    !certificationReadinessSource.includes(" external=${String") &&
    !certificationReadinessSource.includes("internal={certificationPlan.gateCounts") &&
    !certificationReadinessSource.includes("community={certificationPlan.gateCounts") &&
    !certificationReadinessSource.includes("certified={certificationPlan.gateCounts") &&
    !certificationReadinessSource.includes(" missing=") &&
    !certificationReadinessSource.includes("required=") &&
    !certificationReadinessSource.includes("status={certificationPlan.toolingHandoff") &&
    !certificationReadinessSource.includes("satisfiedBy=") &&
    !certificationReadinessSource.includes("readOnlyCommands=") &&
    !certificationReadinessSource.includes("setupCommands=") &&
    !certificationReadinessSource.includes("approvalGated=") &&
    !certificationReadinessSource.includes("path=") &&
    !certificationReadinessSource.includes("sameHead=") &&
    !certificationReadinessSource.includes("mutation=") &&
    !certificationReadinessSource.includes("tools=") &&
    !certificationReadinessSource.includes("owner=") &&
    !certificationReadinessSource.includes("final=") &&
    !certificationReadinessSource.includes("draft=") &&
    !certificationReadinessSource.includes("promote=") &&
    !certificationReadinessSource.includes("verify=") &&
    !certificationReadinessSource.includes("writesLocalEvidence=") &&
    !certificationReadinessSource.includes("reviewedInput=") &&
    !certificationReadinessSource.includes("mutationAllowed=") &&
    !certificationReadinessSource.includes("packet=") &&
    !certificationReadinessSource.includes("exists=") &&
    !certificationReadinessSource.includes("ticket=") &&
    !certificationReadinessSource.includes("first=") &&
    !certificationReadinessSource.includes("setup=") &&
    !certificationReadinessSource.includes("approval=") &&
    !certificationReadinessSource.includes("submissionExecuted=") &&
    !certificationReadinessSource.includes("requiredHead=") &&
    !certificationReadinessSource.includes("worktree=") &&
    !certificationReadinessSource.includes("rerunAfter=") &&
    !certificationReadinessSource.includes(":owner=") &&
    !certificationReadinessSource.includes(":mutation=") &&
    !certificationReadinessSource.includes(":approval=") &&
    !certificationReadinessSource.includes(" pass=") &&
    !certificationReadinessSource.includes(" warn=") &&
    !certificationReadinessSource.includes(" fail=") &&
    !certificationReadinessSource.includes("certification submission first actions missing"),
  "Certification readiness rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized community submission labels",
  communitySubmissionSource.includes("copy.communitySubmission") &&
    communitySubmissionSource.includes("copy.externalSubmissionAttempted") &&
    communitySubmissionSource.includes("copy.parityEntries") &&
    communitySubmissionSource.includes("copy.approvalGate") &&
    communitySubmissionSource.includes("statusText(language, communitySubmissionPlan.artifactStatus)") &&
    communitySubmissionSource.includes("actionModeText(language, communitySubmissionPlan.actionMode)") &&
    adminSource.includes('communitySubmissionOnly: "커뮤니티 제출 전용"') &&
    adminSource.includes('submissionDraftOnly: "제출 초안 전용"') &&
    adminSource.includes('"ready-for-external-review": "외부 검토 준비"') &&
    adminSource.includes('match: "일치"') &&
    adminSource.includes('drift: "차이 있음"') &&
    !communitySubmissionSource.includes("<h4>Community Submission</h4>") &&
    !communitySubmissionSource.includes("<span>Layout</span>") &&
    !communitySubmissionSource.includes("<span>Parity Entries</span>") &&
    !communitySubmissionSource.includes("<span>Read-only Checks</span>") &&
    !communitySubmissionSource.includes("<span>Approval Gate</span>") &&
    !communitySubmissionSource.includes("{communitySubmissionPlan.artifactStatus}") &&
    !communitySubmissionSource.includes("{communitySubmissionPlan.actionMode}") &&
    !communitySubmissionSource.includes("head={communitySubmissionPlan.headSha}") &&
    !communitySubmissionSource.includes("dirty={String(communitySubmissionPlan.worktreeDirty)}") &&
    !communitySubmissionSource.includes("parity={String(communitySubmissionPlan.parityPassed)}") &&
    !communitySubmissionSource.includes("externalSubmissionAttempted=") &&
    !communitySubmissionSource.includes("registryMutationAttempted=") &&
    !communitySubmissionSource.includes("clusterMutationAttempted=") &&
    !communitySubmissionSource.includes("mutationAllowedByThisVerifier=") &&
    !communitySubmissionSource.includes(":approval") &&
    !communitySubmissionSource.includes(":next=") &&
    !communitySubmissionSource.includes(":mutation={String") &&
    !communitySubmissionSource.includes(":approval={String") &&
    !communitySubmissionSource.includes("community submission first actions missing"),
  "Community submission rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized external runtime plan labels",
  externalRuntimePlanSource.includes("copy.externalRuntime") &&
    externalRuntimePlanSource.includes("copy.runtimeImages") &&
    externalRuntimePlanSource.includes("copy.evidenceTemplates") &&
    externalRuntimePlanSource.includes("copy.draftIntake") &&
  externalRuntimePlanSource.includes("copy.mirrorCommands") &&
    externalRuntimePlanSource.includes("actionModeText(language, externalRuntimePlan.actionMode)") &&
    adminSource.includes('approvalPlanOnly: "승인 계획 전용"') &&
    adminSource.includes('"draft-needs-evidence": "초안 근거 필요"') &&
    externalRuntimePlanSource.includes("image.status") &&
    externalRuntimePlanSource.includes("image.draftStatus") &&
    !externalRuntimePlanSource.includes("{externalRuntimePlan.actionMode}") &&
    !externalRuntimePlanSource.includes("registryMutationAttempted=") &&
    !externalRuntimePlanSource.includes("clusterMutationAttempted=") &&
    !externalRuntimePlanSource.includes("mutationAllowedByThisVerifier=") &&
    !externalRuntimePlanSource.includes("<span>Runtime Images</span>") &&
    !externalRuntimePlanSource.includes("<span>Evidence Templates</span>") &&
    !externalRuntimePlanSource.includes("<span>Draft Intake</span>") &&
    !externalRuntimePlanSource.includes("<span>Mirror Commands</span>") &&
    !externalRuntimePlanSource.includes(" draft=") &&
    !externalRuntimePlanSource.includes("templates missing") &&
    !externalRuntimePlanSource.includes("drafts missing") &&
    !externalRuntimePlanSource.includes(":mutation=") &&
    !externalRuntimePlanSource.includes(":approval=") &&
    !externalRuntimePlanSource.includes(":next=") &&
    !externalRuntimePlanSource.includes("firstPlanActions=missing"),
  "External runtime plan rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized owned image provenance labels",
  ownedImageProvenanceSource.includes("copy.ownedProvenance") &&
    ownedImageProvenanceSource.includes("actionModeText(language, ownedImageProvenancePlan.actionMode)") &&
    ownedImageProvenanceSource.includes("copy.requiredImages") &&
    ownedImageProvenanceSource.includes("copy.localInspect") &&
    ownedImageProvenanceSource.includes("copy.remainingEvidence") &&
    ownedImageProvenanceSource.includes("copy.mutationByVerifier") &&
    !ownedImageProvenanceSource.includes("{ownedImageProvenancePlan.actionMode}") &&
    !ownedImageProvenanceSource.includes("registryMutationAttempted=") &&
    !ownedImageProvenanceSource.includes("clusterMutationAttempted=") &&
    !ownedImageProvenanceSource.includes("mutationAllowedByThisVerifier=") &&
    !ownedImageProvenanceSource.includes("<span>Required Images</span>") &&
    !ownedImageProvenanceSource.includes("<span>Local Inspect</span>") &&
    !ownedImageProvenanceSource.includes("<span>Missing Evidence</span>"),
  "Owned image provenance rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized release publish plan labels",
  releasePublishPlanSource.includes("copy.releasePublish") &&
    releasePublishPlanSource.includes("actionModeText(language, releasePlan.actionMode)") &&
    releasePublishPlanSource.includes("copy.publishCommands") &&
    releasePublishPlanSource.includes("copy.releaseTicket") &&
    releasePublishPlanSource.includes("copy.publishDecision") &&
    releasePublishPlanSource.includes("copy.releaseManagerPacket") &&
    releasePublishPlanSource.includes("copy.registryLoginExecuted") &&
    releasePublishPlanSource.includes("copy.releasePublishExecuted") &&
    releasePublishPlanSource.includes("copy.publishRequiresApproval") &&
    releasePublishPlanSource.includes("listOrNone(copy, releasePlan.requiredApprovals)") &&
    releasePublishPlanSource.includes("statusText(language, releasePlan.publishDecisionAction.status)") &&
    !releasePublishPlanSource.includes("{releasePlan.actionMode}") &&
    !releasePublishPlanSource.includes("registryMutationAttempted=") &&
    !releasePublishPlanSource.includes("clusterMutationAttempted=") &&
    !releasePublishPlanSource.includes("mutationAllowedByThisVerifier=") &&
    !releasePublishPlanSource.includes("<span>Approvals</span>") &&
    !releasePublishPlanSource.includes("<span>Publish Commands</span>") &&
    !releasePublishPlanSource.includes("blocked until evidence exists") &&
    !releasePublishPlanSource.includes("first publish actions clear") &&
    !releasePublishPlanSource.includes(":mutation=") &&
    !releasePublishPlanSource.includes(":approval=") &&
    !releasePublishPlanSource.includes(":requiresApproval=") &&
    !releasePublishPlanSource.includes(":mutationAllowed=") &&
    !releasePublishPlanSource.includes(":secret=") &&
    !releasePublishPlanSource.includes(":explicitApproval=") &&
    !releasePublishPlanSource.includes(":writesLocalEvidence=") &&
    !releasePublishPlanSource.includes(":publishRequiresExplicitApproval=") &&
    !releasePublishPlanSource.includes("packet=") &&
    !releasePublishPlanSource.includes("exists=") &&
    !releasePublishPlanSource.includes("ticket=") &&
    !releasePublishPlanSource.includes("decision=") &&
    !releasePublishPlanSource.includes("first=") &&
    !releasePublishPlanSource.includes("setup=") &&
    !releasePublishPlanSource.includes("registryLoginExecuted=") &&
    !releasePublishPlanSource.includes("releasePublishExecuted="),
  "Release publish plan rows use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized roadmap completion labels",
  adminSource.includes('data-testid="opslens-roadmap-completion"') &&
    adminSource.includes("roadmapCompletion.remainingHandoffs") &&
    !adminSource.includes("head={roadmapCompletion.headSha}") &&
    !adminSource.includes("dirty={String(roadmapCompletion.worktreeDirty)}") &&
    !adminSource.includes("mutationBoundaryPassed=\n                  {String(roadmapCompletion.mutationBoundaryPassed)}") &&
    !adminSource.includes("{entry.stage}/{entry.id}:{entry.status}") &&
    !adminSource.includes("externalState={roadmapCompletion.remainingExternalStateCount}") &&
    !adminSource.includes("localOnly={roadmapCompletion.remainingLocalOnlyCount}") &&
    !adminSource.includes("externalGates=\n                  {roadmapCompletion.remainingExternalStateGateIds.join") &&
    !adminSource.includes("localGates=\n                  {roadmapCompletion.remainingLocalOnlyGateIds.join") &&
    !adminSource.includes("{entry.actionId}:next={entry.nextCommand}:external=") &&
    !adminSource.includes(":tickets=\n                    {entry.ticketIds.join") &&
    !adminSource.includes(":readOnly=\n                    {entry.readOnlyCommandIds") &&
    !adminSource.includes(":approval=\n                    {entry.approvalGatedCommandIds") &&
    !adminSource.includes("{entry.owner}:{entry.actionId}:next={entry.nextCommand}"),
  "Roadmap completion cards use bilingual labels for percent, remaining gates, and handoff evidence"
);

expectCheck(
  "localized pre-cluster install gate labels",
  adminSource.includes("copy.safeClusterInstall") &&
    adminSource.includes("copy.strictExitWouldFail") &&
    adminSource.includes("copy.approvalNotRun") &&
    adminSource.includes('"클러스터 설치 안전"') &&
    !adminSource.includes("<h4>Pre-cluster Install Gate</h4>") &&
    !adminSource.includes("head={preClusterInstallGate.headSha}") &&
    !adminSource.includes("dirty={String(preClusterInstallGate.worktreeDirty)}") &&
    !adminSource.includes("safeToRunClusterInstall=\n                  {String(preClusterInstallGate.safeToRunClusterInstall)}") &&
    !adminSource.includes("strictExitWouldFail=\n                  {String(preClusterInstallGate.strictExitWouldFail)}") &&
    !adminSource.includes("<span>Failed Gates</span>") &&
    !adminSource.includes("<span>First Blocker</span>") &&
    !adminSource.includes("external=\n                    {preClusterInstallGate.blockerSummary.remainingExternalStateCount}") &&
    !adminSource.includes("live={preClusterInstallGate.commandPlan.directLive.length}") &&
    !adminSource.includes("{gate.id}:{gate.owner}:{String(gate.passed)}:next=") &&
    !adminSource.includes("failed=\n                  {preClusterInstallGate.failedGateIds.join") &&
    !adminSource.includes("firstBlocked=\n                  {preClusterInstallGate.firstBlockedGate?.id") &&
    !adminSource.includes("remainingExternalState=\n                  {preClusterInstallGate.blockerSummary.remainingExternalStateGateIds") &&
    !adminSource.includes("staleExternal=\n                  {preClusterInstallGate.blockerSummary.staleExternalStateSourceIds") &&
    !adminSource.includes("planStrict={preClusterInstallGate.commandPlan.strictCommandId}") &&
    !adminSource.includes("sources=\n                  {preClusterInstallGate.sources") &&
    !adminSource.includes("readOnly=\n                  {preClusterInstallGate.readOnlyCommands") &&
    !adminSource.includes("approvalNotRun=\n                  {preClusterInstallGate.approvalGatedCommandsNotRun") &&
    !adminSource.includes("{row.owner}:status={row.status}:firstLane=") &&
    !adminSource.includes(":mutationAllowed=\n                    {String(row.mutationAllowedByThisVerifier)}"),
  "Pre-cluster install gate cards use bilingual labels for install safety, blockers, and command plans"
);

expectCheck(
  "localized remediation proposal labels",
  !adminSource.includes("<span>Mode</span>") &&
    !adminSource.includes("<span>Patch</span>") &&
    !adminSource.includes("<span>Current</span>") &&
    !adminSource.includes("<span>Proposed</span>") &&
    !adminSource.includes("reviewGate={String(proposal.reviewGate.required)}") &&
    !adminSource.includes("targetConfidence={proposal.target.confidence}") &&
    !adminSource.includes("logs={String(proposal.triggerEvidence.logs.currentRead)}") &&
    !adminSource.includes("events={String(proposal.triggerEvidence.events.read)}") &&
    !adminSource.includes("metrics=") &&
    !adminSource.includes("runbooks={proposal.triggerEvidence.runbookCitations.length}"),
  "Remediation proposal cards use bilingual labels while retaining operational field values"
);

expectCheck(
  "localized opsbrain guard labels",
  !adminSource.includes("fineTuningRequired={String(opsBrain.fineTuningRequired)}") &&
    !adminSource.includes("actionMode={opsBrain.actionMode}") &&
    !adminSource.includes("write={tier.writePolicy}") &&
    !adminSource.includes("mutationAllowed={String(opsBrain.riskGate.mutationAllowed)}") &&
    !adminSource.includes("golden={opsBrain.evaluator.goldenSetTarget}") &&
    !adminSource.includes("next={module.nextImplementation}") &&
    !adminSource.includes("groundedTarget={opsBrain.growthGovernance.currentStateEvidenceTargetPercent}") &&
    !adminSource.includes("routingPlanned={String(opsBrain.modelStrategy.routingPlanned)}") &&
    !adminSource.includes("rawMemoryWrite={String(opsBrain.memoryWriteGuard.rawMemoryWriteAllowed)}") &&
    !adminSource.includes("fineTuning={String(opsBrain.selfImprover.automaticFineTuningAllowed)}") &&
    !adminSource.includes("nightlyLoop={String(opsBrain.selfImprover.nightlyLoopPlanned)}"),
  "OpsBrain panels use bilingual labels for growth, guard, memory, routing, and self-improvement status"
);

expectCheck(
  "localized rag production labels",
  ragProductionSource.includes('data-testid="opslens-rag-production-first-actions-table"') &&
    ragProductionSource.includes('data-testid="opslens-rag-production-ticket-table"') &&
    ragProductionSource.includes("rag-production-command-") &&
    !ragProductionSource.includes("contractReady={String(ragProductionReadiness.contractReady)}") &&
    !ragProductionSource.includes("queueLive={String(ragProductionReadiness.productionQueueLive)}") &&
    !ragProductionSource.includes("workerLive={String(ragProductionReadiness.ingestionWorkerLive)}") &&
    !ragProductionSource.includes("vectorAudit=") &&
    !ragProductionSource.includes("rawMarkdown=") &&
    !ragProductionSource.includes("auditAppendOnly=") &&
    !ragProductionSource.includes("approvals={ragProductionReadiness.requiredApprovals.join") &&
    !ragProductionSource.includes("ticket={ragProductionReadiness.ticketPacket.id}") &&
    !ragProductionSource.includes("first={ragProductionReadiness.ticketPacket.firstReadOnlyAction.id}") &&
    !adminSource.includes("queueMetadataWrite=") &&
    !adminSource.includes("approved={String(queueIngestionPlan.approvedForIngestion)}") &&
    !ragProductionSource.includes("{action.id} / {action.owner} /") &&
    !ragProductionSource.includes("{statusText(language, action.status)} / {copy.nextCommand}") &&
    !adminSource.includes(":next={action.nextCommand}:mutation={String(action.mutation)}") &&
    !adminSource.includes("<span>approvals {item.approvals.length}</span>"),
  "RAG production and approval queue panels use tables and bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized runtime handoff labels",
  !adminSource.includes("<dt>Ready</dt>") &&
    !adminSource.includes("<dt>Memory</dt>") &&
    !adminSource.includes("<dt>Status</dt>") &&
    !adminSource.includes("pgvector={overview?.runtime.readiness.vectorStore.status") &&
    !adminSource.includes("vllm={overview?.runtime.readiness.modelRuntime.status") &&
    !adminSource.includes("liveProbe=") &&
    !adminSource.includes("status={runtimeLiveHandoff?.status") &&
    !adminSource.includes("runtimeOwner={runtimeLiveHandoff?.runtimePlatformOwner") &&
    !adminSource.includes("dataOwner={runtimeLiveHandoff?.dataMlOwner") &&
    !adminSource.includes("}:readOnly=\n                  {action.readOnlyCommandIds.join") &&
    !adminSource.includes("owner={handoff.owner}:writesLocalEvidence=") &&
    !adminSource.includes("mutationAllowedByThisVerifier=\n              {String(\n                runtimeLiveHandoff?.mutationAllowedByThisVerifier") &&
    !adminSource.includes("<span>runtime live handoff clear</span>") &&
    !adminSource.includes("<span>runtime evidence tickets clear</span>") &&
    !adminSource.includes("<span>runtime live evidence handoff missing</span>"),
  "Runtime readiness and live handoff panels use bilingual labels instead of raw key/value UI labels"
);

expectCheck(
  "localized readiness command strip",
  appSource.includes('data-testid="readiness-status"') &&
    appSource.includes('data-testid="readiness-passed"') &&
    appSource.includes('data-testid="readiness-remaining"') &&
    appSource.includes('data-testid="readiness-next-gate"') &&
    appSource.includes('data-testid="readiness-next-command"') &&
    appSource.includes("readinessStatusText(") &&
    appSource.includes("근거 필요") &&
    appSource.includes("남은 항목") &&
    appSource.includes("다음 게이트") &&
    appSource.includes("다음 점검") &&
    appSource.includes("needs evidence") &&
    appSource.includes("remaining items") &&
    appSource.includes("next gate") &&
    appSource.includes("next check") &&
    appSource.includes("nextGateLabel(adminOverview, language)") &&
    appSource.includes("firstNextCommand(adminOverview, language)") &&
    !appSource.includes("{completionGate?.status ?? copy.loading}") &&
    !appSource.includes("{copy.remaining}=") &&
    !appSource.includes("{copy.next}=") &&
    !appSource.includes("{copy.command}="),
  "readiness command strip uses KO/EN labels for status, remaining items, next gate, and next check instead of raw key/value UI"
);

expectCheck(
  "version-pinned OCP console parity registry",
  paritySource.includes("OpenShift Local 4.21.14") &&
    paritySource.includes("OpenShift Container Platform 4.20") &&
    paritySource.includes("OpenShift Container Platform 4.21+") &&
    paritySource.includes("Windows CRC 4.20 validation pending") &&
    paritySource.includes("Red Hat OCP 4.20 Web console overview") &&
    paritySource.includes("Red Hat OCP 4.20 Dynamic plugins") &&
    paritySource.includes("Red Hat OCP 4.20 Web console dashboard") &&
    paritySource.includes("Red Hat OCP 4.20 Projects") &&
    paritySource.includes("Red Hat OCP 4.20 Deployments") &&
    paritySource.includes("docs.redhat.com/en/documentation/openshift_container_platform/4.21") &&
    paritySource.includes('"Home"') &&
    paritySource.includes('"Favorites"') &&
    paritySource.includes('"Ecosystem"') &&
    !paritySource.includes('| "Operators"') &&
    !paritySource.includes('| "Helm"') &&
    paritySource.includes('"Workloads"') &&
    paritySource.includes('"Networking"') &&
    paritySource.includes('"Storage"') &&
    paritySource.includes('"Builds"') &&
    paritySource.includes('"Monitoring"') &&
    paritySource.includes('"Compute"') &&
    paritySource.includes('"User Management"') &&
    paritySource.includes('"Administration"') &&
    paritySource.includes('"Cywell"') &&
    paritySource.includes("Software Catalog") &&
    paritySource.includes("Installed Operators") &&
    paritySource.includes("Operator catalog") &&
    paritySource.includes("Home / Projects") &&
    paritySource.includes("project.openshift.io/v1/projects") &&
    paritySource.includes("rbac.authorization.k8s.io/v1/rolebindings") &&
    paritySource.includes("Home / API Explorer") &&
    paritySource.includes("apiextensions.k8s.io/v1/customresourcedefinitions") &&
    paritySource.includes("apiregistration.k8s.io/v1/apiservices") &&
    paritySource.includes('| "ecosystem-console"') &&
    paritySource.includes('mode: "ecosystem-console"') &&
    paritySource.includes("[data-testid='ocp-ecosystem-software-catalog']") &&
    paritySource.includes("[data-testid='ocp-ecosystem-installed-operators']") &&
    paritySource.includes("[data-testid='ocp-ecosystem-helm']") &&
    paritySource.includes("Topology") &&
    paritySource.includes('"topology-graph"') &&
    paritySource.includes("#ocp-topology-title") &&
    paritySource.includes("Pods") &&
    paritySource.includes("Deployments") &&
    paritySource.includes("Deployment Configs") &&
    paritySource.includes("StatefulSets") &&
    paritySource.includes("Secrets") &&
    paritySource.includes("ConfigMaps") &&
    paritySource.includes("CronJobs") &&
    paritySource.includes("Jobs") &&
    paritySource.includes("DaemonSets") &&
    paritySource.includes("ReplicaSets") &&
    paritySource.includes("ReplicationControllers") &&
    paritySource.includes("HorizontalPodAutoscalers") &&
    paritySource.includes("PodDisruptionBudgets") &&
    paritySource.includes("nativeCreatePath") &&
    !paritySource.includes("workload-controllers") &&
    paritySource.includes("Routes") &&
    paritySource.includes("Services") &&
    paritySource.includes("Ingresses") &&
    paritySource.includes("NetworkPolicies") &&
    paritySource.includes("PersistentVolumeClaims") &&
    paritySource.includes("PersistentVolumes") &&
    paritySource.includes("StorageClasses") &&
    paritySource.includes("VolumeSnapshots") &&
    paritySource.includes("VolumeSnapshotClasses") &&
    paritySource.includes("BuildConfigs") &&
    paritySource.includes("ImageStreams") &&
    paritySource.includes("Nodes") &&
    paritySource.includes("Machines") &&
    paritySource.includes("MachineSets") &&
    paritySource.includes("MachineConfigPools") &&
    paritySource.includes("ServiceAccounts") &&
    paritySource.includes("RoleBindings") &&
    paritySource.includes("ClusterOperators") &&
    paritySource.includes("ResourceQuotas") &&
    paritySource.includes("LimitRanges") &&
    paritySource.includes("KOMSCO AI Assistant") &&
    paritySource.includes("ConsoleParityFunctionProof") &&
    paritySource.includes("consoleParityFunctionProof") &&
    paritySource.includes("ConsoleParityFunctionSignal") &&
    paritySource.includes("consoleParityFunctionSignal") &&
    paritySource.includes("ConsoleParityCompatibilityProfile") &&
    paritySource.includes("consoleParityCompatibilityProfile") &&
    paritySource.includes("ConsoleParityCoverageClass") &&
    paritySource.includes("inferCoverageClass") &&
    paritySource.includes("coverageClass: inferCoverageClass(item)") &&
    paritySource.includes("liveViewCount") &&
    paritySource.includes("nativeDeepLinkCount") &&
    paritySource.includes("planOnlyCount") &&
    paritySource.includes("gapCount") &&
    paritySource.includes("resourcePresetCount") &&
    paritySource.includes("evidenceViewCount") &&
    paritySource.includes("directSurfaceCount") &&
    appSource.includes("const consoleNavigation: ConsoleNavigationItem[] = ocpConsoleParityItems") &&
    appSource.includes("<OcpTopologyGraph") &&
    appSource.includes("const SectionIcon = sectionIcons[section]") &&
    appSource.includes("consoleParitySections"),
  "OCP 4.21.14 console inventory is version-pinned and drives the OpsLens navigation"
);

expectCheck(
  "data-driven console parity coverage classes",
  parityItems.length > 0 &&
    parityItems.every(
      (item) =>
        typeof item.id === "string" &&
        item.id.length > 0 &&
        coverageClasses.includes(item.coverageClass)
    ) &&
    coverageClasses.reduce(
      (sum, coverageClass) => sum + coverageCounts[coverageClass],
      0
    ) === parityItems.length &&
    paritySummary.liveViewCount === coverageCounts["live-view"] &&
    paritySummary.nativeDeepLinkCount === coverageCounts["native-deep-link"] &&
    paritySummary.planOnlyCount === coverageCounts["plan-only"] &&
    paritySummary.gapCount === coverageCounts.gap,
  "Every registry item has one allowed coverage class and summary counts match the registry",
  `coverageClasses=${JSON.stringify(coverageCounts)} items=${parityItems.length}`
);

expectCheck(
  "OCP 4.20 compatibility preflight contract",
  packageSource.includes('"verify:ocp:420-compatibility"') &&
    ocp420CompatibilitySource.includes("ocp420ApiAllowlist") &&
    ocp420CompatibilitySource.includes("OpenShift Container Platform 4.20") &&
    ocp420CompatibilitySource.includes("OpenShift Container Platform 4.21+") &&
    ocp420CompatibilitySource.includes("Windows CRC 4.20") &&
    ocp420CompatibilitySource.includes("itemCompatibility") &&
    ocp420CompatibilitySource.includes("consoleParityCompatibilityProfile") &&
    ocp420CompatibilitySource.includes("baseRef") &&
    ocp420CompatibilitySource.includes("API versions outside OCP 4.20 allowlist") &&
    ocp420CompatibilitySource.includes("test-results/cywell-opslens-ocp420-compatibility.json"),
  "pre-deployment compatibility gate checks console parity resources against the OCP 4.20 API allowlist and writes per-item runtime/API evidence"
);

expectCheck(
  "OCP 4.20 live readiness contract",
  packageSource.includes('"verify:ocp:420-live-readiness"') &&
    packageSource.includes("--require-cluster --expected-minor=4.20") &&
    packageSource.includes('"verify:ocp:420-live-readiness:preview"') &&
    ocp420LiveReadinessSource.includes("clusterversion") &&
    ocp420LiveReadinessSource.includes("consoleplugins.console.openshift.io") &&
    ocp420LiveReadinessSource.includes("required API discovery") &&
    ocp420LiveReadinessSource.includes("strict") &&
    ocp420LiveReadinessSource.includes("test-results/cywell-opslens-ocp420-live-readiness.json"),
  "Windows CRC 4.20 runtime proof has a non-mutating strict readiness command and a preview command"
);

expectCheck(
  "Dev 0.1.7 workload topology graph contract",
  contractsSource.includes("export interface OcpTopologyResponse") &&
    contractsSource.includes("OcpTopologyEdge") &&
    contractsSource.includes('"deploymentconfig"') &&
    contractsSource.includes('"statefulset"') &&
    contractsSource.includes('"daemonset"') &&
    contractsSource.includes('"replicaset"') &&
    contractsSource.includes('"replicationcontroller"') &&
    contractsSource.includes('"hpa"') &&
    contractsSource.includes('"pdb"') &&
    ocpClientSource.includes("export async function getOcpTopology") &&
    ocpClientSource.includes("Service selector") &&
    ocpClientSource.includes("OwnerReference") &&
    ocpClientSource.includes("apps.openshift.io/v1") &&
    ocpClientSource.includes("deploymentconfigs") &&
    ocpClientSource.includes("statefulsets") &&
    ocpClientSource.includes("daemonsets") &&
    ocpClientSource.includes("replicasets") &&
    ocpClientSource.includes("replicationcontrollers") &&
    ocpClientSource.includes("horizontalpodautoscalers") &&
    ocpClientSource.includes("poddisruptionbudgets") &&
    ocpClientSource.includes("scaleTargetRef") &&
    ocpClientSource.includes("response.failure") &&
    backendServerSource.includes('url.pathname === "/api/ocp/topology"') &&
    apiSource.includes("fetchOcpTopology") &&
    topologySource.includes("DeploymentConfigs") &&
    topologySource.includes("StatefulSets") &&
    topologySource.includes("DaemonSets") &&
    topologySource.includes("HPAs") &&
    topologySource.includes("PDBs") &&
    topologySource.includes('data-testid="ocp-topology-graph"') &&
    topologySource.includes('data-testid="ocp-topology-native-toolbar"') &&
    topologySource.includes('data-testid="ocp-topology-search"') &&
    topologySource.includes('data-testid="ocp-topology-type-filter"') &&
    topologySource.includes('data-testid="ocp-topology-display-options"') &&
    topologySource.includes('data-testid="ocp-topology-zoom-controls"') &&
    topologySource.includes('data-testid="ocp-topology-list-view"') &&
    topologySource.includes('const [viewMode, setViewMode]') &&
    topologySource.includes('const [typeFilter, setTypeFilter]') &&
    topologySource.includes("filteredNodes") &&
    topologySource.includes('data-testid="ocp-topology-canvas"') &&
    topologySource.includes('data-testid="ocp-topology-workspace"') &&
    topologySource.includes('data-testid="ocp-topology-selected-panel"') &&
    topologySource.includes("setSelectedNodeId") &&
    topologySource.includes("selectedRelatedEdges") &&
    topologySource.includes("nativeObjectPath") &&
    topologySource.includes('data-testid="ocp-topology-evidence"') &&
    stylesSource.includes(".topology-native-toolbar") &&
    stylesSource.includes(".topology-display-options button.active") &&
    stylesSource.includes(".topology-workspace") &&
    stylesSource.includes(".topology-selected-panel") &&
    stylesSource.includes(".topology-list-view") &&
    actionPanelSource.includes('"topology-graph": "Topology graph"') &&
    actionPanelSource.includes('"topology-graph": "토폴로지 그래프"'),
  "Workloads / Topology is a real read-only graph/list surface with native console search, filter, display options, zoom controls, and API-backed pods, services, routes, deploymentconfigs, deployments, statefulsets, daemonsets, replicasets, replicationcontrollers, HPAs, PDBs, jobs, and cronjobs"
);

expectCheck(
  "named OCP resource API failure contract",
  apiSource.includes("payload.error") &&
    apiSource.includes("failed with ${response.status}:") &&
    contractsSource.includes("OcpResourceListFailureCode") &&
    contractsSource.includes("failure?: OcpResourceListFailure") &&
    backendServerSource.includes("resource-not-found") &&
    backendServerSource.includes("rbac-denied") &&
    backendServerSource.includes("ocp-upstream-read-failed") &&
    ocpClientSource.includes("failedListResponse") &&
    ocpClientSource.includes("failedDetailResponse") &&
    ocpClientSource.includes("sanitizeOcpFailureMessage") &&
    ocpClientSource.includes("sanitizeOcpFailureEvidence") &&
    ocpClientSource.includes("OCP API read returned a non-success status; upstream body is withheld from the UI") &&
    ocpClientSource.includes("resource list returned a named failure instead of an unexplained HTTP 400") &&
    ocpClientSource.includes("resource detail returned a named failure instead of an unexplained HTTP 400") &&
    ocpClientSource.includes("pagination failure is returned as named data instead of a visible HTTP 400") &&
    ocpClientSource.includes("JSON list fallback succeeded") &&
    e2eSource.includes("expect(secret.ok()).toBe(true)") &&
    e2eSource.includes('expect(secretBody.failure?.code).toBe("resource-read-blocked")') &&
    e2eSource.includes("expect(secretBody.failure?.statusCode).toBe(403)") &&
    explorerSource.includes("findPreferredResourceInOrder") &&
    explorerSource.includes("formatListFailure") &&
    explorerSource.includes("sanitizeVisibleOcpFailure") &&
    explorerSource.includes("formatFailureEvidence") &&
    explorerSource.includes('data-testid="ocp-resource-list-failure"') &&
    explorerSource.includes('data-testid="ocp-resource-detail-failure"') &&
    explorerSource.includes("fetchOcpAccessMatrix({") &&
    explorerSource.includes(".catch(() => null)"),
  "Resource Explorer exposes named list/detail/page failures as data, uses preferred API order, and keeps metadata-to-JSON fallback instead of surfacing unexplained visible 400s"
);

expectCheck(
  "workload resource lens visual contract",
  explorerSource.includes('data-testid="ocp-workload-lens"') &&
    explorerSource.includes('data-testid="ocp-workload-health-summary"') &&
    explorerSource.includes('data-testid="ocp-workload-selected"') &&
    explorerSource.includes('data-testid="ocp-workload-relationship"') &&
    explorerSource.includes('data-testid="ocp-workload-next-checks"') &&
    explorerSource.includes('data-testid="ocp-workload-action-map"') &&
    explorerSource.includes('data-testid="ocp-workload-native-actions"') &&
    explorerSource.includes('data-testid="ocp-workload-native-object-link"') &&
    explorerSource.includes('data-testid="ocp-workload-yaml-action"') &&
    explorerSource.includes('data-testid="ocp-workload-events-action"') &&
    explorerSource.includes('data-testid="ocp-workload-logs-action"') &&
    explorerSource.includes('data-testid="ocp-workload-related-action"') &&
    explorerSource.includes('data-testid={`ocp-workload-action-${item.className}`}') &&
    explorerSource.includes("workloadActionMapping(") &&
    explorerSource.includes("nativeObjectPath(") &&
    explorerSource.includes("nativeConsoleHref(") &&
    explorerSource.includes("copy.liveView") &&
    explorerSource.includes("copy.nativeDeepLink") &&
    explorerSource.includes("copy.planOnlyAssistant") &&
    explorerSource.includes("copy.explicitGap") &&
    explorerSource.includes("workloadHealth(") &&
    explorerSource.includes("fallbackKind") &&
    explorerSource.includes("workloadSignal(") &&
    explorerSource.includes("workloadNextChecks(") &&
    explorerSource.includes("full: full || workloadKinds.has(resource.kind)") &&
    explorerSource.includes('"DeploymentConfig"') &&
    explorerSource.includes('"ReplicationController"') &&
    explorerSource.includes("HorizontalPodAutoscaler") &&
    explorerSource.includes("PodDisruptionBudget") &&
    stylesSource.includes(".workload-lens-panel") &&
    stylesSource.includes(".workload-health-meter") &&
    stylesSource.includes(".workload-action-map") &&
    stylesSource.includes(".workload-native-actions") &&
    stylesSource.includes(".workload-native-action-grid") &&
    stylesSource.includes(".workload-action-card.native-deep-link"),
  "Workload resource presets render a purpose-built visual lens, native object action rail, and action mapping for Pods, DeploymentConfigs, Deployments, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, Jobs, CronJobs, HPA, and PDB instead of only a generic table"
);

expectCheck(
  "human-readable OCP 4.21.14 console parity map",
  parityMapDocSource.includes("# CRC OpenShift 4.21.14 Console Parity Map") &&
    parityMapDocSource.includes("Cywell OpsLens Dev 0.1.7") &&
    parityMapDocSource.includes("Truth source: `apps/web/src/consoleParity.ts`") &&
    parityMapDocSource.includes("AC-UI-003") &&
    parityMapDocSource.includes("AC-UI-006") &&
    parityMapDocSource.includes("AC-UI-008") &&
    parityMapDocSource.includes("AC-UI-009") &&
    parityMapDocSource.includes("Function state effect") &&
    parityMapDocSource.includes("Resource smoke state") &&
    parityMapDocSource.includes("preferred API match") &&
    parityMapDocSource.includes("Every item opens KOMSCO assistant") &&
    parityMapDocSource.includes("workload controllers, autoscalers, disruption budgets") &&
    parityMapDocSource.includes("scaleTargetRef") &&
    parityMapDocSource.includes("| 37 | KOMSCO AI Assistant |") &&
    parityMapDocSource.includes("supported OpenShift customization paths") &&
    parityMapDocSource.includes("in-console OpsLens mode"),
  "Acceptance docs pin the CRC 4.21.14 console list, the 1:1 OpsLens mapping, and the assistant/action verification boundary"
);

expectCheck(
  "visible OCP console parity matrix",
  appSource.includes("<OcpConsoleParityMatrix") &&
    appSource.includes("activeItemId={activeNavId}") &&
    appSource.includes("onSelectItem={(itemId) => activateNavigation(findNavigationItem(itemId))}") &&
    parityComponentSource.includes('data-testid="console-parity-matrix"') &&
    parityComponentSource.includes('data-testid="console-parity-summary"') &&
    parityComponentSource.includes('data-testid="console-parity-sources"') &&
    parityComponentSource.includes('data-testid="console-compatibility-boundary"') &&
    parityComponentSource.includes("ocpConsoleBaseline.minimumRuntime") &&
    parityComponentSource.includes("ocpConsoleBaseline.compatibilityProof") &&
    parityComponentSource.includes("consoleParityCompatibilityProfile(item)") &&
    parityComponentSource.includes("console-parity-row-${item.id}") &&
    parityComponentSource.includes("data-active-parity-item=") &&
    parityComponentSource.includes("console-parity-open-${item.id}") &&
    parityComponentSource.includes("console-parity-function-${item.id}") &&
    parityComponentSource.includes("console-parity-compatibility-${item.id}") &&
    parityComponentSource.includes("console-parity-class-${item.id}") &&
    parityComponentSource.includes("coverageClassLabels") &&
    parityComponentSource.includes("summary.liveViewCount") &&
    parityComponentSource.includes("summary.nativeDeepLinkCount") &&
    parityComponentSource.includes("summary.planOnlyCount") &&
    parityComponentSource.includes("summary.gapCount") &&
    parityComponentSource.includes("data-function-mode={functionProof.mode}") &&
    parityComponentSource.includes("summary.resourcePresetCount") &&
    parityComponentSource.includes("summary.evidenceViewCount") &&
    parityComponentSource.includes("summary.directSurfaceCount") &&
    parityComponentSource.includes("item.originalPath") &&
    parityComponentSource.includes("item.opsLensEnhancement") &&
    parityComponentSource.includes("item.acceptance") &&
    parityComponentSource.includes("consoleParityFunctionProof(item)") &&
    stylesSource.includes(".console-parity-matrix") &&
    stylesSource.includes(".parity-compatibility-row") &&
    stylesSource.includes(".parity-table") &&
    stylesSource.includes(".parity-function-proof") &&
    stylesSource.includes(".parity-compatibility-cell"),
  "dashboard renders a version-pinned table mapping each native OCP console path to an OpsLens action, compatibility boundary, and acceptance contract"
);

expectCheck(
  "active OCP console action panel",
  appSource.includes("<OcpConsoleActionPanel") &&
    appSource.includes("activeItem={activeNavigation}") &&
    appSource.includes("onAskAssistant={askAssistantForActiveNavigation}") &&
    actionPanelSource.includes('data-testid="console-active-action"') &&
    actionPanelSource.includes('data-active-console-item={activeItem.id}') &&
    actionPanelSource.includes('data-testid="console-active-native-open"') &&
    actionPanelSource.includes('data-testid="console-active-opslens-details"') &&
    actionPanelSource.includes('data-testid="console-active-surface"') &&
    actionPanelSource.includes('data-testid="console-active-coverage-class"') &&
    actionPanelSource.includes("data-coverage-class={activeItem.coverageClass}") &&
    actionPanelSource.includes('data-testid="console-active-command"') &&
    actionPanelSource.includes('data-testid="console-active-acceptance"') &&
    actionPanelSource.includes('data-testid="console-active-target-status"') &&
    actionPanelSource.includes('data-testid="console-active-function-mode"') &&
    actionPanelSource.includes("data-function-mode={functionProof.mode}") &&
    actionPanelSource.includes('data-testid="console-active-action-outcome"') &&
    actionPanelSource.includes("data-action-outcome={actionOutcomeState}") &&
    actionPanelSource.includes("data-resource-function-outcome=") &&
    actionPanelSource.includes('data-testid="console-active-function-input"') &&
    actionPanelSource.includes('data-testid="console-active-action-proof"') &&
    actionPanelSource.includes('data-testid="console-active-function-signal"') &&
    actionPanelSource.includes("data-function-signal-selector={functionSignal.selector}") &&
    actionPanelSource.includes("consoleParityFunctionSignal(activeItem)") &&
    actionPanelSource.includes('data-testid="console-active-preferred-resources"') &&
    actionPanelSource.includes("resource-operating") &&
    actionPanelSource.includes("resource-empty") &&
    actionPanelSource.includes("resource-loading") &&
    actionPanelSource.includes("resource-missing") &&
    actionPanelSource.includes("resource-waiting") &&
    actionPanelSource.includes("evidence-view-active") &&
    actionPanelSource.includes("assistant-ready") &&
    actionPanelSource.includes("target-mounted") &&
    actionPanelSource.includes("consoleParityFunctionProof(activeItem)") &&
    appSource.includes("function applyNavigationSideEffects") &&
    appSource.includes("applyNavigationSideEffects(item)") &&
    appSource.includes("applyNavigationSideEffects(activeNavigation)") &&
    appSource.includes("setActiveTargetStatus(\"mounted\")") &&
    appSource.includes("setActiveTargetStatus(\"missing\")") &&
    stylesSource.includes(".console-action-panel"),
  "each selected OCP console item renders its active surface, action, function mode, outcome, and preferred API contract"
);

expectCheck(
  "dashboard live/source label contract",
  dashboardSource.includes('data-testid="opslens-dashboard-source-label"') &&
    dashboardSource.includes('data-testid="opslens-console-source-label"') &&
    dashboardSource.includes('data-testid="opslens-risk-panel-source-label"') &&
    dashboardSource.includes('data-testid="opslens-inventory-panel-source-label"') &&
    dashboardSource.includes('data-testid="opslens-knowledge-panel-source-label"') &&
    dashboardSource.includes('data-testid="opslens-model-panel-source-label"') &&
    stylesSource.includes(".panel-source-row") &&
    dashboardSource.includes("opsLensSourceLabel") &&
    dashboardSource.includes("consoleSourceLabel") &&
    dashboardSource.includes("prometheusSourceLabel") &&
    dashboardSource.includes("sourceLiveReadonly") &&
    dashboardSource.includes("sourceFixture") &&
    dashboardSource.includes("sourceUnavailable") &&
    stylesSource.includes(".source-badge-row"),
  "Operations dashboard separates OpsLens risk source, native console source, Prometheus source, and per-panel source labels instead of hiding fixture/live/unavailable state"
);

expectCheck(
  "dashboard decision flow visual contract",
  dashboardSource.includes('data-testid="opslens-dashboard-decision-flow"') &&
    dashboardSource.includes('data-testid="opslens-dashboard-flow-source"') &&
    dashboardSource.includes("copy.decisionFlowMap") &&
    dashboardSource.includes("copy.nativeSignals") &&
    dashboardSource.includes("copy.opsLensCorrelation") &&
    dashboardSource.includes("copy.operatorDecision") &&
    dashboardSource.includes("copy.assistantHandoff") &&
    dashboardSource.includes("suggestedQuestion") &&
    stylesSource.includes(".ops-decision-flow") &&
    stylesSource.includes(".ops-decision-flow-grid") &&
    stylesSource.includes(".ops-flow-step"),
  "Operations dashboard shows how native console signals are transformed into OpsLens correlation, operator decision, and assistant handoff"
);

expectCheck(
  "dashboard native signal board visual contract",
  dashboardSource.includes('data-testid="opslens-native-signal-board"') &&
    dashboardSource.includes('data-testid="opslens-native-signal-source-label"') &&
    dashboardSource.includes('data-testid={`opslens-native-signal-card-${card.id}`}') &&
    dashboardSource.includes("consoleOverview?.nodes.ready") &&
    dashboardSource.includes("consoleOverview?.operators.degraded") &&
    dashboardSource.includes("consoleOverview?.workloads.pods.running") &&
    dashboardSource.includes("consoleOverview?.networking.routes") &&
    dashboardSource.includes("consoleOverview?.supplyChain.failedBuilds") &&
    dashboardSource.includes("consoleOverview?.monitoring.firingAlerts") &&
    dashboardSource.includes("nativeSignalCards") &&
    stylesSource.includes(".native-signal-board") &&
    stylesSource.includes(".native-signal-grid") &&
    stylesSource.includes(".native-signal-meter"),
  "Operations dashboard renders a live native-console signal board for nodes, operators, workloads, network, builds, and alerts instead of only static text"
);

expectCheck(
  "dashboard plus-alpha cockpit visual contract",
  dashboardSource.includes('data-testid="opslens-plus-alpha-cockpit"') &&
    dashboardSource.includes('data-testid={`opslens-plus-alpha-card-${card.id}`}') &&
    dashboardSource.includes("plusAlphaCockpitCards") &&
    dashboardSource.includes("copy.plusAlphaCockpit") &&
    dashboardSource.includes("copy.utilizationPressure") &&
    dashboardSource.includes("copy.workloadDrift") &&
    dashboardSource.includes("copy.alertCorrelation") &&
    dashboardSource.includes("copy.decisionQueue") &&
    dashboardSource.includes("strongestUtilization") &&
    dashboardSource.includes("workloadExceptionCount") &&
    dashboardSource.includes("alertExceptionCount") &&
    dashboardSource.includes("copy.nativeSignalBasis") &&
    dashboardSource.includes("copy.opsLensOverlay") &&
    stylesSource.includes(".ops-plus-cockpit") &&
    stylesSource.includes(".ops-plus-cockpit-grid") &&
    stylesSource.includes(".ops-plus-cockpit-meter"),
  "Operations dashboard adds a customer-facing OpsLens cockpit that merges native console metrics, workload drift, alert correlation, and decision queue signals"
);

expectCheck(
  "dashboard native console match map contract",
  dashboardSource.includes('data-testid="opslens-native-dashboard-map"') &&
    dashboardSource.includes('data-testid={`opslens-native-dashboard-panel-${panel.id}`}') &&
    dashboardSource.includes("nativeDashboardPanels") &&
    dashboardSource.includes("copy.nativeDashboardMap") &&
    dashboardSource.includes("copy.detailsPanel") &&
    dashboardSource.includes("copy.statusPanel") &&
    dashboardSource.includes("copy.utilizationPanel") &&
    dashboardSource.includes("copy.activityPanel") &&
    dashboardSource.includes("copy.inventoryPanel") &&
    dashboardSource.includes("consoleDashboard?.details.openshiftVersion") &&
    dashboardSource.includes("consoleDashboard?.statusCards.length") &&
    dashboardSource.includes("consoleDashboard?.utilization.reachable") &&
    dashboardSource.includes("consoleDashboard?.activity.length") &&
    dashboardSource.includes("consoleDashboard?.inventory.nodes") &&
    stylesSource.includes(".native-dashboard-map") &&
    stylesSource.includes(".native-dashboard-map-grid") &&
    stylesSource.includes(".native-dashboard-panel-meter"),
  "Operations dashboard maps the native OpenShift dashboard panels into a compact visual signal map before adding OpsLens analysis"
);

expectCheck(
  "Dev 0.1.7 parallel review lane contract",
  dev017PlanSource.includes("## Parallel Review Setup") &&
    dev017PlanSource.includes("## Parallel Review Results") &&
    dev017PlanSource.includes("Compatibility reviewer") &&
    dev017PlanSource.includes("Runtime reviewer") &&
    dev017PlanSource.includes("Product reviewer") &&
    dev017PlanSource.includes("PASS/WEAK/MISSING audit") &&
    dev017PlanSource.includes("PASS for Workloads/Topology") &&
    dev017PlanSource.includes("WEAK for the old e2e 400 contract") &&
    dev017PlanSource.includes("MISSING before this section for persisted review evidence") &&
    dev017PlanSource.includes("resource-read-blocked") &&
    dev017PlanSource.includes("Windows CRC `4.20` live-readiness proof is still external and pending") &&
    dev017PlanSource.includes("feat/OpsLens-Dev0.1.7"),
  "Dev 0.1.7 records separate compatibility, runtime, and product review results before deployment"
);

expectCheck(
  "Dev 0.1.7 requirement audit contract",
  dev017PlanSource.includes("## 0.1.7 Requirement Audit") &&
    dev017PlanSource.includes("later Windows CRC `4.20` deployment proof") &&
    dev017PlanSource.includes("OCP `4.20`/`4.21` compatibility criteria table") &&
    dev017PlanSource.includes("Native console menu classification") &&
    dev017PlanSource.includes("Workloads first implementation") &&
    dev017PlanSource.includes("Real Topology graph") &&
    dev017PlanSource.includes("Core Resource API generic `400` removal") &&
    dev017PlanSource.includes("Dashboard live/source labels") &&
    dev017PlanSource.includes("Parallel review lanes") &&
    dev017PlanSource.includes("Remaining before deployment or 4.20 runtime-complete claim") &&
    !dev017PlanSource.includes("Remaining before calling 0.1.7 complete"),
  "Dev 0.1.7 separates local implementation completion evidence from Windows CRC 4.20 deployment/runtime proof"
);

expectCheck(
  "registry-driven console function proof e2e",
  e2eSource.includes("AC-UI-008 renders function proof for every version-pinned console item") &&
    e2eSource.includes("ocpConsoleParityItems") &&
    e2eSource.includes("consoleParityFunctionProof") &&
    e2eSource.includes("console-parity-function-${item.id}") &&
    e2eSource.includes("await openConsoleNavItem(page, item)") &&
    e2eSource.includes("await openConsoleNavItem(page, \"favorites\")") &&
    e2eSource.includes("expectActiveConsoleAction(") &&
    e2eSource.includes("expectConsoleFunctionEffect(page, item)") &&
    e2eSource.includes('data-function-mode"') &&
    e2eSource.includes('getByTestId("console-active-function-mode")') &&
    e2eSource.includes('getByTestId("console-active-action-outcome")') &&
    e2eSource.includes('"data-action-outcome"') &&
    e2eSource.includes('"data-resource-function-outcome"') &&
    e2eSource.includes(".poll(") &&
    e2eSource.includes("resource-\\1") &&
    e2eSource.includes('getByTestId("console-active-function-input")') &&
    e2eSource.includes('getByTestId("console-active-action-proof")') &&
    e2eSource.includes('getByTestId("console-active-function-signal")'),
  "Playwright iterates over the version-pinned registry and proves every mapped console item exposes target, function input, outcome, proof, and signal"
);

expectCheck(
  "version-pinned console registry integrity e2e",
  e2eSource.includes(
    "AC-UI-010 keeps the version-pinned console registry internally valid"
  ) &&
    e2eSource.includes("function expectConsoleParityRegistryIntegrity") &&
    e2eSource.includes("duplicate console item id") &&
    e2eSource.includes("missing console parity section") &&
    e2eSource.includes("empty function signal selector") &&
    e2eSource.includes("item.resourcePreset.preferredResources.length") &&
    e2eSource.includes('item.actionSurface === "assistant"') &&
    e2eSource.includes("consoleParityFunctionProof(item)") &&
    e2eSource.includes("consoleParityFunctionSignal(item)"),
  "Playwright guards the OCP 4.21.14 parity registry against duplicate ids, empty bilingual copy, missing sections, and broken surface/resource/proof/signal contracts"
);

expectCheck(
  "registry-driven console navigation e2e",
  e2eSource.includes("AC-UI-003 makes every console navigation item actionable") &&
    e2eSource.includes("surfaceLabelsForTest") &&
    e2eSource.includes("for (const item of ocpConsoleParityItems)") &&
    e2eSource.includes("await openConsoleNavItem(page, item)") &&
    e2eSource.includes("async function openConsoleNavItem") &&
    e2eSource.includes("surfaceLabelsForTest[item.actionSurface]") &&
    e2eSource.includes("item.resourcePreset?.query") &&
    e2eSource.includes("page.locator(item.targetSelector)") &&
    e2eSource.includes("expectConsoleFunctionEffect(page, item)") &&
    e2eSource.includes("manual-drift") &&
    e2eSource.includes("alternateView") &&
    e2eSource.includes("closeAssistantIfOpen(page)") &&
    e2eSource.includes('getByTestId("console-active-open-surface").click()') &&
    e2eSource.includes('getByTestId("ocp-workloads-toolbar")') &&
    e2eSource.includes('getByTestId("ocp-workloads-health-board")') &&
    e2eSource.includes('getByTestId("ocp-workloads-pods-table")') &&
    e2eSource.includes('getByTestId("ocp-workloads-native-handoff")') &&
    e2eSource.includes('data-target-status",') &&
    e2eSource.includes('page.locator("[data-testid^=\'active-surface-\']")'),
  "Playwright opens every version-pinned console registry item through the collapsible navigation, uses the active Open surface action, and verifies its mapped surface, preset, and mounted target"
);

expectCheck(
  "registry-driven console state effect e2e",
  e2eSource.includes("async function expectConsoleFunctionEffect") &&
    e2eSource.includes("item.evidenceView") &&
    e2eSource.includes("evidence-view-${item.evidenceView}") &&
    e2eSource.includes('"aria-pressed",') &&
    e2eSource.includes('item.actionSurface === "assistant"') &&
    e2eSource.includes('getByTestId("assistant-launcher")') &&
    e2eSource.includes('getByTestId("assistant-popover")') &&
    e2eSource.includes("closeAssistantIfOpen(page)"),
  "Playwright proves evidence-view navigation changes active tabs and assistant navigation opens the KOMSCO popover, not only static copy"
);

expectCheck(
  "registry-driven assistant action e2e",
  e2eSource.includes("AC-UI-009 opens KOMSCO assistant for every version-pinned console item") &&
    e2eSource.includes("for (const item of ocpConsoleParityItems)") &&
    e2eSource.includes("const proof = consoleParityFunctionProof(item)") &&
    e2eSource.includes("closeAssistantIfOpen(page)") &&
    e2eSource.includes('getByTestId("console-active-ask-assistant").click()') &&
    e2eSource.includes('getByTestId("assistant-draft")') &&
    e2eSource.includes("escapeForRegExp(item.label)") &&
    e2eSource.includes("escapeForRegExp(item.command)") &&
    e2eSource.includes("escapeForRegExp(item.originalPath)") &&
    e2eSource.includes("escapeForRegExp(proof.mode)") &&
    e2eSource.includes("escapeForRegExp(proof.input)") &&
    e2eSource.includes("escapeForRegExp(proof.proof)") &&
    e2eSource.includes("read-only mode") &&
    e2eSource.includes("do not propose cluster mutation commands"),
  "Playwright opens the KOMSCO assistant from every mapped console item and verifies the drafted prompt keeps native path, function proof, and read-only boundary"
);

expectCheck(
  "targeted console section routing",
    paritySource.includes("targetSelector: \"[data-testid='ocp-ecosystem-software-catalog']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-ecosystem-operatorhub']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-ecosystem-installed-operators']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-ecosystem-helm']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='opslens-install-readiness']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-monitoring-alerting']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-monitoring-dashboards']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-monitoring-metrics']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-monitoring-logs']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-cluster-settings']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-clusteroperators']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-namespaces']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-custom-resource-definitions']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-resourcequotas']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-admin-limitranges']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-compute-nodes']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-compute-machines']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-compute-machinesets']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-compute-machineconfigpools']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-pods']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-deployments']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-deploymentconfigs']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-statefulsets']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-cronjobs']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-workloads-poddisruptionbudgets']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-user-users']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-user-groups']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-user-serviceaccounts']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-user-roles']\"") &&
    paritySource.includes("targetSelector: \"[data-testid='ocp-user-rolebindings']\"") &&
    e2eSource.includes("page.locator(item.targetSelector)") &&
    e2eSource.includes("expectConsoleFunctionEffect(page, item)") &&
    appSource.includes("case \"ecosystem-console\"") &&
    appSource.includes("case \"ops-admin\""),
  "non-resource console items route to their concrete native OpsLens sections instead of a generic admin header"
);

expectCheck(
  "admin target fallback anchors",
  adminSource.includes('data-testid="opslens-admin-target-fallbacks"') &&
    adminSource.includes('data-testid="opslens-catalog-toolchain"') &&
    adminSource.includes('data-testid="opslens-operator-package"') &&
    adminSource.includes('data-testid="opslens-ocp-connectivity"') &&
    adminSource.includes("Catalog toolchain evidence is loading") &&
    adminSource.includes("Operator package evidence is loading") &&
    adminSource.includes("OCP connectivity evidence is loading") &&
    stylesSource.includes(".admin-target-fallback-grid"),
  "admin menu targets remain present while live evidence is loading or unavailable"
);

expectCheck(
  "resource preset auto-load contract",
  resourceExplorerSource.includes('data-testid="ocp-active-preset"') &&
    resourceExplorerSource.includes('data-testid="ocp-active-preset-query"') &&
    resourceExplorerSource.includes('data-testid="ocp-active-preset-resources"') &&
    resourceExplorerSource.includes("namespaceOverride") &&
    resourceExplorerSource.includes("void loadSelectedResource(preferredResource") &&
    stylesSource.includes(".ocp-active-preset"),
  "Resource Explorer auto-loads the active navigation preset and exposes preferred API targets"
);

expectCheck(
  "native console detail surface contract",
  resourceExplorerSource.includes('data-testid="ocp-native-console-panel"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-console-title"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-page-summary"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-page-stat-grid"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-status-distribution"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-selected-preview"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-baseline-actions"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-console-toolbar"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-console-summary"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-console-table"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-list-link"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-filter"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-load"') &&
    resourceExplorerSource.includes("nativeConsoleColumns(selectedResource)") &&
    resourceExplorerSource.includes("nativeColumnValue(column, item, selectedResource, copy)") &&
    resourceExplorerSource.includes("nativeStatusDistribution(nativeItems, selectedResource)") &&
    resourceExplorerSource.includes("const nativeSelectedPrimarySignal = nativePrimarySignal(") &&
    resourceExplorerSource.includes("nativeSecondarySignal(nativeSelectedItem)") &&
    resourceExplorerSource.includes("resourceStatusText(item, copy)") &&
    resourceExplorerSource.includes("resourceDetailText(item)") &&
    resourceExplorerSource.includes("resourceTargetText(item)") &&
    resourceExplorerSource.includes("nativeResourceListPath(selectedResource, namespace)") &&
    resourceExplorerSource.includes("copy.nativeCreateEditDelete") &&
    resourceExplorerSource.includes("resourceKey(list.resource) === resourceKey(selectedResource)") &&
    resourceExplorerSource.includes("const nativeItems = (activeList?.items ?? [])") &&
    resourceExplorerSource.includes("setList(null)") &&
    resourceExplorerSource.includes('data-testid="ocp-technical-explorer"') &&
    stylesSource.includes(".native-console-panel") &&
    stylesSource.includes(".native-page-summary") &&
    stylesSource.includes(".native-status-distribution") &&
    stylesSource.includes(".native-selected-preview") &&
    stylesSource.includes(".native-baseline-actions") &&
    stylesSource.includes(".native-row-health.healthy") &&
    stylesSource.includes(".native-console-toolbar") &&
    stylesSource.includes(".native-console-table") &&
    stylesSource.includes(".ocp-technical-explorer"),
  "Resource Explorer renders a native-console-style detail page with summary, status distribution, selected object preview, and baseline native actions before the raw API discovery surface"
);

expectCheck(
  "native object detail surface contract",
  resourceExplorerSource.includes('data-testid="ocp-native-object-detail"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-detail-title"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-detail-tabs"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-details-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-detail-json-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-detail-yaml-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-events-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-logs-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-related-tab"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-details"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-raw"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-events"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-logs"') &&
    resourceExplorerSource.includes('data-testid="ocp-native-object-related"') &&
    resourceExplorerSource.includes("conditionRows(selectedDetailItem)") &&
    resourceExplorerSource.includes("recordEntriesPreview(selectedDetailItem?.metadata.labels)") &&
    resourceExplorerSource.includes("rawResourceVersion(detail.raw)") &&
    resourceExplorerSource.includes("rawGeneration(detail.raw)") &&
    stylesSource.includes(".native-object-detail-panel") &&
    stylesSource.includes(".native-detail-tabs") &&
    stylesSource.includes(".native-object-detail-grid") &&
    stylesSource.includes(".native-condition-table"),
  "Resource Explorer shows a native OpenShift-style object details tab with identity, metadata, conditions, raw, events, logs, and related resources"
);

expectCheck(
  "dedicated console native object drilldown contract",
  nativeObjectDrilldownSource.includes("fetchOcpResourceDetail") &&
    nativeObjectDrilldownSource.includes("fetchOcpEvents") &&
    nativeObjectDrilldownSource.includes("fetchOcpPodLogs") &&
    nativeObjectDrilldownSource.includes("fetchOcpRelatedResources") &&
    nativeObjectDrilldownSource.includes("nativeObjectPath(selectedResource, selected)") &&
    nativeObjectDrilldownSource.includes("resourceForItem?: (item: OcpResourceSummary) => NativeConsoleResourceRef") &&
    nativeObjectDrilldownSource.includes("lifecycleActionsForItem?:") &&
    nativeObjectDrilldownSource.includes("selectedResource.resource") &&
    nativeObjectDrilldownSource.includes("nativeResourceCreatePath(selectedResource, selected.metadata.namespace)") &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-drilldown`}') &&
    nativeObjectDrilldownSource.includes("filteredItems") &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-object-search`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-object-count`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-action-rail`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-native-object-action`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-native-create-link`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-yaml-action`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-events-action`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-logs-action`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-related-action`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-lifecycle-actions`}') &&
    nativeObjectDrilldownSource.includes("mutationBoundary") &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-detail-tabs`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-details`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-events`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-logs`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-related`}') &&
    nativeObjectDrilldownSource.includes('data-testid={`${testId}-raw`}') &&
    workloadsSource.includes("OcpNativeObjectDrilldown") &&
    workloadsSource.includes('testId="ocp-workloads-object"') &&
    networkingSource.includes("OcpNativeObjectDrilldown") &&
    networkingSource.includes('testId="ocp-networking-object"') &&
    storageSource.includes("OcpNativeObjectDrilldown") &&
    storageSource.includes('testId="ocp-storage-object"') &&
    buildsSource.includes("OcpNativeObjectDrilldown") &&
    buildsSource.includes('testId="ocp-builds-object"') &&
    computeSource.includes("OcpNativeObjectDrilldown") &&
    computeSource.includes('testId="ocp-compute-object"') &&
    administrationSource.includes("OcpNativeObjectDrilldown") &&
    administrationSource.includes('testId="ocp-admin-object"') &&
    userManagementSource.includes("OcpNativeObjectDrilldown") &&
    userManagementSource.includes('testId="ocp-user-object"') &&
    stylesSource.includes(".native-drilldown-panel") &&
    stylesSource.includes(".native-drilldown-search") &&
    stylesSource.includes(".native-drilldown-count") &&
    stylesSource.includes(".native-action-rail") &&
    stylesSource.includes(".native-action-button") &&
    stylesSource.includes(".native-drilldown-layout") &&
    stylesSource.includes(".native-drilldown-list") &&
    stylesSource.includes(".native-drilldown-detail"),
  "Dedicated Workloads, Networking, Storage, Builds, Compute, User Management, and Administration surfaces expose OpenShift-style object Details, Events, Logs, Related, YAML, native object, and native create handoff actions"
);

expectCheck(
  "dedicated console native object name link contract",
  nativeObjectLinkSource.includes("nativeObjectPath(resource, item)") &&
    nativeObjectLinkSource.includes('className="native-object-name-link"') &&
    workloadsSource.includes("NativeObjectLink") &&
    workloadsSource.includes('testId={`${config.tableTestId}-object-link`}') &&
    networkingSource.includes("NativeObjectLink") &&
    networkingSource.includes('testId="ocp-networking-routes-object-link"') &&
    storageSource.includes("NativeObjectLink") &&
    storageSource.includes('testId="ocp-storage-pvcs-object-link"') &&
    buildsSource.includes("NativeObjectLink") &&
    buildsSource.includes('testId="ocp-builds-object-link"') &&
    computeSource.includes("NativeObjectLink") &&
    computeSource.includes('testId="ocp-compute-nodes-object-link"') &&
    administrationSource.includes("NativeObjectLink") &&
    administrationSource.includes('testId="ocp-admin-clusteroperators-object-link"') &&
    userManagementSource.includes("NativeObjectLink") &&
    userManagementSource.includes('testId="ocp-user-rolebindings-object-link"') &&
    stylesSource.includes(".native-object-name-link"),
  "Dedicated native tables expose object names as OpenShift console deep links instead of static bold text"
);

expectCheck(
  "RBAC cluster-scoped drilldown contract",
    userManagementSource.includes("resourceForUserManagementItem") &&
    userManagementSource.includes("item.kind === \"ClusterRole\"") &&
    userManagementSource.includes("item.kind === \"ClusterRoleBinding\"") &&
    userManagementSource.includes("items: filteredRoles") &&
    userManagementSource.includes("items: filteredRoleBindings") &&
    userManagementSource.includes("const roles = [...(state.roles?.items ?? []), ...(state.clusterRoles?.items ?? [])]") &&
    userManagementSource.includes("const roleBindings = [...(state.roleBindings?.items ?? []), ...(state.clusterRoleBindings?.items ?? [])]") &&
    userManagementSource.includes("resourceForItem={resourceForUserManagementItem}"),
  "User Management drilldown includes ClusterRoles and ClusterRoleBindings instead of only namespaced RBAC objects"
);

expectCheck(
  "URL-driven navigation contract",
  appSource.includes('const defaultActiveNavId: ConsoleNavId = "overview"') &&
    appSource.includes('const activeNavQueryParam = "nav"') &&
    appSource.includes("params.get(activeNavQueryParam)") &&
    appSource.includes("function writeActiveNavRoute") &&
    appSource.includes("url.searchParams.set(activeNavQueryParam, activeNavId)") &&
    !appSource.includes("cywell-opslens-active-nav-id") &&
    captureScriptSource.includes('url.searchParams.set("nav", activeNavId)') &&
    captureScriptSource.includes('if (activeNavId !== "overview")'),
  "The shell must route by URL, default / to Overview, and avoid stale localStorage menu state"
);

expectCheck(
  "official home overview dashboard contract",
  overviewSource.includes('data-testid="ocp-overview-native-dashboard"') &&
    overviewSource.includes('data-testid="ocp-overview-details-card"') &&
    overviewSource.includes('data-testid="ocp-overview-inventory-card"') &&
    overviewSource.includes('data-testid="ocp-overview-status-cards"') &&
    overviewSource.includes('data-testid="ocp-overview-activity-card"') &&
    overviewSource.includes("consoleDashboard.details") &&
    overviewSource.includes("consoleDashboard.inventory") &&
    overviewSource.includes("consoleDashboard.statusCards") &&
    overviewSource.includes("consoleDashboard.activity") &&
    overviewSource.includes("consoleDashboard.utilization") &&
    overviewSource.includes("copy.apiAddress") &&
    overviewSource.includes("copy.clusterId") &&
    overviewSource.includes("copy.storageClasses") &&
    overviewSource.includes("copy.noStatusCards") &&
    overviewSource.includes("copy.noActivity") &&
    stylesSource.includes(".overview-native-dashboard") &&
    stylesSource.includes(".native-details-list") &&
    stylesSource.includes(".inventory-link-grid") &&
    stylesSource.includes(".native-status-list") &&
    stylesSource.includes(".native-activity-list") &&
    e2eSource.includes("ocp-overview-details-card") &&
    e2eSource.includes("ocp-overview-inventory-card") &&
    e2eSource.includes("ocp-overview-status-cards") &&
    e2eSource.includes("ocp-overview-activity-card"),
  "Home Overview must expose official console panels for details, cluster inventory, status cards, activity, and utilization using the live consoleDashboard API contract"
);

expectCheck(
  "official workloads console surface contract",
  paritySource.includes('| "workloads-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-pods\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-deployments\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-deploymentconfigs\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-statefulsets\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-secrets\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-configmaps\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-cronjobs\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-jobs\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-daemonsets\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-replicasets\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-replicationcontrollers\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-horizontalpodautoscalers\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-workloads-poddisruptionbudgets\']"') &&
    paritySource.includes('mode: "workloads-console"') &&
    appSource.includes("case \"workloads-console\"") &&
    appSource.includes("<OcpWorkloadsConsole") &&
    workloadsSource.includes("export type OcpWorkloadsView") &&
    workloadsSource.includes('data-testid={activeConfig.testId}') &&
    workloadsSource.includes('data-testid="ocp-workloads-toolbar"') &&
    workloadsSource.includes('data-testid="ocp-workloads-native-toolbar"') &&
    workloadsSource.includes('data-testid="ocp-workloads-filter-count"') &&
    workloadsSource.includes("setNamespaceFilter") &&
    workloadsSource.includes("setApplicationFilter") &&
    workloadsSource.includes("setResourceFilter") &&
    workloadsSource.includes("setStatusFilter") &&
    workloadsSource.includes("setSearch") &&
    workloadsSource.includes("const displayedConfig = resourceFilter === \"all\" ? activeConfig : resourceConfig(resourceFilter)") &&
    workloadsSource.includes("renderRows(displayedConfig, rows, language)") &&
    workloadsSource.includes("nativeResourceCreatePath") &&
    workloadsSource.includes('data-testid="ocp-workloads-health-board"') &&
    workloadsSource.includes('tableTestId: "ocp-workloads-pods-table"') &&
    workloadsSource.includes('tableTestId: "ocp-workloads-deployments-table"') &&
    workloadsSource.includes('tableTestId: "ocp-workloads-cronjobs-table"') &&
    workloadsSource.includes('tableTestId: "ocp-workloads-horizontalpodautoscalers-table"') &&
    workloadsSource.includes('tableTestId: "ocp-workloads-poddisruptionbudgets-table"') &&
    workloadsSource.includes('data-testid="ocp-workloads-native-handoff"') &&
    workloadsSource.includes("apps.openshift.io/v1") &&
    workloadsSource.includes("autoscaling/v2") &&
    workloadsSource.includes("policy/v1") &&
    workloadsSource.includes("workloadLifecycleActions") &&
    workloadsSource.includes("lifecycleActionsForItem={(item, resource) => workloadLifecycleActions(item, resource, language)}") &&
    workloadsSource.includes("item.kind === \"CronJob\"") &&
    workloadsSource.includes("item.kind === \"HorizontalPodAutoscaler\"") &&
    workloadsSource.includes("fetchOcpResourceList") &&
    stylesSource.includes(".ocp-workloads-console") &&
    stylesSource.includes(".ocp-workloads-toolbar") &&
    stylesSource.includes(".workloads-filter-toolbar") &&
    stylesSource.includes(".native-toolbar-count") &&
    stylesSource.includes(".workloads-native-grid") &&
    stylesSource.includes(".native-workloads-table") &&
    stylesSource.includes(".workloads-native-boundary") &&
    e2eSource.includes('"workloads-console": "Workloads console"'),
  "Workloads menu items must render native Pods, workload controllers, Secrets, ConfigMaps, CronJobs, Jobs, HPAs, and PDBs with status/owner/config/redaction evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official home console surface contract",
  paritySource.includes('| "home-console"') &&
    paritySource.includes('actionSurface: "home-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-home-search\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-home-projects\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-home-api-explorer\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-home-events\']"') &&
    paritySource.includes('mode: "home-console"') &&
    appSource.includes("case \"home-console\"") &&
    appSource.includes("<OcpHomeConsole") &&
    homeSource.includes("export type OcpHomeView") &&
    homeSource.includes('"search"') &&
    homeSource.includes('"projects"') &&
    homeSource.includes('"api-explorer"') &&
    homeSource.includes('"events"') &&
    homeSource.includes("project.openshift.io/v1") &&
    homeSource.includes("projects") &&
    homeSource.includes("namespaces") &&
    homeSource.includes("customresourcedefinitions") &&
    homeSource.includes("apiservices") &&
    homeSource.includes("events.k8s.io/v1") &&
    homeSource.includes('data-testid={`ocp-home-${view}`}') &&
    homeSource.includes('data-testid="ocp-home-native-toolbar"') &&
    homeSource.includes('data-testid="ocp-home-filter-count"') &&
    homeSource.includes('testId="ocp-home-object-drilldown"') &&
    homeSource.includes("OcpNativeObjectDrilldown") &&
    homeSource.includes("NativeObjectLink") &&
    stylesSource.includes(".home-filter-toolbar") &&
    stylesSource.includes(".home-console-summary") &&
    e2eSource.includes('"home-console": "Home console"'),
  "Home Search, Projects, API Explorer, and Events must render native Home-style resource, filter, and object drilldown surfaces instead of falling back to the generic resource explorer"
);

expectCheck(
  "official ecosystem console surface contract",
  paritySource.includes('| "ecosystem-console"') &&
    paritySource.includes('actionSurface: "ecosystem-console"') &&
    paritySource.includes("Software Catalog") &&
    paritySource.includes("Operator catalog") &&
    paritySource.includes("Installed Operators") &&
    paritySource.includes("Helm") &&
    appSource.includes("case \"ecosystem-console\"") &&
    appSource.includes("<OcpEcosystemConsole") &&
    ecosystemSource.includes("export type OcpEcosystemView") &&
    ecosystemSource.includes('"software-catalog"') &&
    ecosystemSource.includes('"operatorhub"') &&
    ecosystemSource.includes('"installed-operators"') &&
    ecosystemSource.includes('"helm"') &&
    ecosystemSource.includes("operators.coreos.com/v1alpha1") &&
    ecosystemSource.includes("packages.operators.coreos.com/v1") &&
    ecosystemSource.includes("catalogsources") &&
    ecosystemSource.includes("packagemanifests") &&
    ecosystemSource.includes("clusterserviceversions") &&
    ecosystemSource.includes("subscriptions") &&
    ecosystemSource.includes("installplans") &&
    ecosystemSource.includes("owner=helm") &&
    ecosystemSource.includes('data-testid={`ocp-ecosystem-${view}`}') &&
    ecosystemSource.includes('data-testid="ocp-ecosystem-summary"') &&
    ecosystemSource.includes('data-testid="ocp-ecosystem-native-toolbar"') &&
    ecosystemSource.includes('data-testid="ocp-ecosystem-filter-count"') &&
    ecosystemSource.includes('data-testid="ocp-ecosystem-native-handoff"') &&
    ecosystemSource.includes("nativeConsoleHref") &&
    ecosystemSource.includes("setSearch") &&
    ecosystemSource.includes("setNamespaceFilter") &&
    ecosystemSource.includes("setKindFilter") &&
    ecosystemSource.includes("setCatalogFilter") &&
    ecosystemSource.includes("OcpNativeObjectDrilldown") &&
    stylesSource.includes(".ecosystem-filter-toolbar") &&
    e2eSource.includes('"ecosystem-console": "Ecosystem console"'),
  "Ecosystem menu items must render native Software Catalog, Operator catalog, Installed Operators, and Helm-style search/filter/install handoff evidence instead of routing to OpsLens Admin or only the generic explorer"
);

expectCheck(
  "official monitoring console surface contract",
  paritySource.includes('| "monitoring-console"') &&
    paritySource.includes('| "monitoring-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-monitoring-alerting\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-monitoring-dashboards\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-monitoring-metrics\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-monitoring-logs\']"') &&
    appSource.includes("case \"monitoring-console\"") &&
    appSource.includes("<OcpMonitoringConsole") &&
    monitoringSource.includes("export type OcpMonitoringView") &&
    monitoringSource.includes('data-testid={viewTestId(view)}') &&
    monitoringSource.includes('data-testid="ocp-monitoring-toolbar"') &&
    monitoringSource.includes('data-testid="ocp-monitoring-filter-count"') &&
    monitoringSource.includes('data-testid="ocp-monitoring-alert-table"') &&
    monitoringSource.includes('data-testid="ocp-monitoring-dashboard-grid"') &&
    monitoringSource.includes('data-testid="ocp-monitoring-query-browser"') &&
    monitoringSource.includes('data-testid="ocp-monitoring-log-stream"') &&
    monitoringSource.includes("setFilterText") &&
    monitoringSource.includes("setSeverityFilter") &&
    monitoringSource.includes("setSourceFilter") &&
    monitoringSource.includes("setTimeRangeMinutes") &&
    monitoringSource.includes("filteredAlerts") &&
    monitoringSource.includes("filteredSeries") &&
    monitoringSource.includes("filteredActivity") &&
    monitoringSource.includes("fetchOcpConsoleOverview") &&
    monitoringSource.includes("consoleDashboard.utilization") &&
    monitoringSource.includes("consoleDashboard.activity") &&
    monitoringSource.includes("monitoring.sample") &&
    stylesSource.includes(".ocp-monitoring-console") &&
    stylesSource.includes(".ocp-monitoring-toolbar") &&
    stylesSource.includes(".ocp-monitoring-toolbar select") &&
    stylesSource.includes(".monitoring-dashboard-grid") &&
    stylesSource.includes(".monitoring-query-layout") &&
    stylesSource.includes(".monitoring-log-stream"),
  "Monitoring menu items must render native Observe-style Alerting, Dashboards, Metrics, and Logs surfaces from live consoleDashboard/monitoring evidence instead of routing to generic evidence or OpsLens dashboard panels"
);

expectCheck(
  "official builds console surface contract",
  paritySource.includes('| "builds-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-builds-builds\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-builds-buildconfigs\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-builds-imagestreams\']"') &&
    paritySource.includes('mode: "builds-console"') &&
    appSource.includes("case \"builds-console\"") &&
    appSource.includes("<OcpBuildsConsole") &&
    buildsSource.includes("export type OcpBuildsView") &&
    buildsSource.includes('data-testid={viewTestId(view)}') &&
    buildsSource.includes('data-testid="ocp-builds-toolbar"') &&
    buildsSource.includes('data-testid="ocp-builds-native-toolbar"') &&
    buildsSource.includes('data-testid="ocp-builds-filter-count"') &&
    buildsSource.includes("setResourceFilter") &&
    buildsSource.includes("setNamespaceFilter") &&
    buildsSource.includes("setSearch") &&
    buildsSource.includes("nativeResourceCreatePath") &&
    buildsSource.includes('data-testid="ocp-builds-pipeline-board"') &&
    buildsSource.includes('data-testid="ocp-builds-table"') &&
    buildsSource.includes('data-testid="ocp-buildconfigs-table"') &&
    buildsSource.includes('data-testid="ocp-imagestreams-table"') &&
    buildsSource.includes('data-testid="ocp-builds-native-handoff"') &&
    buildsSource.includes("fetchOcpResourceList") &&
    buildsSource.includes("build.openshift.io/v1") &&
    buildsSource.includes("image.openshift.io/v1") &&
    buildsSource.includes("build-pipeline-flow") &&
    stylesSource.includes(".ocp-builds-console") &&
    stylesSource.includes(".ocp-builds-toolbar") &&
    stylesSource.includes(".builds-filter-toolbar") &&
    stylesSource.includes(".build-pipeline-flow") &&
    stylesSource.includes(".native-builds-table") &&
    stylesSource.includes(".builds-native-boundary") &&
    e2eSource.includes('"builds-console": "Builds console"'),
  "Builds menu items must render native Builds, BuildConfigs, and ImageStreams surfaces with source/strategy/output/trigger/run-policy evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official networking console surface contract",
  paritySource.includes('| "networking-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-networking-routes\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-networking-services\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-networking-ingresses\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-networking-network-policies\']"') &&
    paritySource.includes('mode: "networking-console"') &&
    appSource.includes("case \"networking-console\"") &&
    appSource.includes("<OcpNetworkingConsole") &&
    networkingSource.includes("export type OcpNetworkingView") &&
    networkingSource.includes('data-testid={viewTestId(view)}') &&
    networkingSource.includes('data-testid="ocp-networking-toolbar"') &&
    networkingSource.includes('data-testid="ocp-networking-native-toolbar"') &&
    networkingSource.includes('data-testid="ocp-networking-filter-count"') &&
    networkingSource.includes("setResourceFilter") &&
    networkingSource.includes("setNamespaceFilter") &&
    networkingSource.includes("setSearch") &&
    networkingSource.includes("nativeResourceCreatePath") &&
    networkingSource.includes('data-testid="ocp-networking-route-flow"') &&
    networkingSource.includes('data-testid="ocp-networking-routes-table"') &&
    networkingSource.includes('data-testid="ocp-networking-services-table"') &&
    networkingSource.includes('data-testid="ocp-networking-ingresses-table"') &&
    networkingSource.includes('data-testid="ocp-networking-policies-table"') &&
    networkingSource.includes('data-testid="ocp-networking-native-handoff"') &&
    networkingSource.includes("route.openshift.io/v1") &&
    networkingSource.includes("discovery.k8s.io/v1") &&
    networkingSource.includes("networking.k8s.io/v1") &&
    networkingSource.includes("network-route-flow") &&
    ocpClientSource.includes('kind === "Endpoints"') &&
    ocpClientSource.includes('kind === "EndpointSlice"') &&
    stylesSource.includes(".ocp-networking-console") &&
    stylesSource.includes(".ocp-networking-toolbar") &&
    stylesSource.includes(".networking-filter-toolbar") &&
    stylesSource.includes(".network-route-flow") &&
    stylesSource.includes(".native-networking-table") &&
    stylesSource.includes(".networking-native-boundary") &&
    e2eSource.includes('"networking-console": "Networking console"'),
  "Networking menu items must render native Routes, Services, Ingresses, and NetworkPolicies surfaces with route/service/endpoint/policy evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official storage console surface contract",
  paritySource.includes('| "storage-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-storage-persistentvolumeclaims\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-storage-persistentvolumes\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-storage-storageclasses\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-storage-volumesnapshots\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-storage-volumesnapshotclasses\']"') &&
    paritySource.includes('mode: "storage-console"') &&
    appSource.includes("case \"storage-console\"") &&
    appSource.includes("<OcpStorageConsole") &&
    storageSource.includes("export type OcpStorageView") &&
    storageSource.includes('data-testid={viewTestId(view)}') &&
    storageSource.includes('data-testid="ocp-storage-toolbar"') &&
    storageSource.includes('data-testid="ocp-storage-native-toolbar"') &&
    storageSource.includes('data-testid="ocp-storage-filter-count"') &&
    storageSource.includes("setResourceFilter") &&
    storageSource.includes("setNamespaceFilter") &&
    storageSource.includes("setSearch") &&
    storageSource.includes("nativeResourceCreatePath") &&
    storageSource.includes('data-testid="ocp-storage-binding-board"') &&
    storageSource.includes('data-testid="ocp-storage-pvcs-table"') &&
    storageSource.includes('data-testid="ocp-storage-pvs-table"') &&
    storageSource.includes('data-testid="ocp-storage-classes-table"') &&
    storageSource.includes('data-testid="ocp-storage-snapshots-table"') &&
    storageSource.includes('data-testid="ocp-storage-snapshotclasses-table"') &&
    storageSource.includes('data-testid="ocp-storage-native-handoff"') &&
    storageSource.includes("storage.k8s.io/v1") &&
    storageSource.includes("snapshot.storage.k8s.io/v1") &&
    storageSource.includes("fetchOcpResourceList") &&
    ocpClientSource.includes('kind === "StorageClass"') &&
    ocpClientSource.includes('kind === "VolumeSnapshotClass"') &&
    stylesSource.includes(".ocp-storage-console") &&
    stylesSource.includes(".ocp-storage-toolbar") &&
    stylesSource.includes(".storage-filter-toolbar") &&
    stylesSource.includes(".storage-native-grid") &&
    stylesSource.includes(".native-storage-table") &&
    stylesSource.includes(".storage-native-boundary") &&
    e2eSource.includes('"storage-console": "Storage console"'),
  "Storage menu items must render native PVC, PV, StorageClass, VolumeSnapshot, and VolumeSnapshotClass surfaces with binding/provisioning/snapshot evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official administration console surface contract",
  paritySource.includes('| "administration-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-cluster-settings\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-clusteroperators\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-namespaces\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-custom-resource-definitions\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-resourcequotas\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-admin-limitranges\']"') &&
    paritySource.includes('mode: "administration-console"') &&
    appSource.includes("case \"administration-console\"") &&
    appSource.includes("<OcpAdministrationConsole") &&
    administrationSource.includes("export type OcpAdministrationView") &&
    administrationSource.includes('data-testid={viewTestId(view)}') &&
    administrationSource.includes('data-testid="ocp-admin-toolbar"') &&
    administrationSource.includes('data-testid="ocp-admin-native-toolbar"') &&
    administrationSource.includes('data-testid="ocp-admin-filter-count"') &&
    administrationSource.includes("setResourceFilter") &&
    administrationSource.includes("setNamespaceFilter") &&
    administrationSource.includes("setSearch") &&
    administrationSource.includes("nativeResourceCreatePath") &&
    administrationSource.includes('data-testid="ocp-admin-cluster-settings-board"') &&
    administrationSource.includes('data-testid="ocp-admin-clusteroperators-table"') &&
    administrationSource.includes('data-testid="ocp-admin-namespaces-table"') &&
    administrationSource.includes('data-testid="ocp-admin-crds-table"') &&
    administrationSource.includes('data-testid="ocp-admin-resourcequotas-table"') &&
    administrationSource.includes('data-testid="ocp-admin-limitranges-table"') &&
    administrationSource.includes('data-testid="ocp-admin-native-handoff"') &&
    administrationSource.includes("config.openshift.io/v1") &&
    administrationSource.includes("apiextensions.k8s.io/v1") &&
    administrationSource.includes("apiregistration.k8s.io/v1") &&
    administrationSource.includes("console.openshift.io/v1") &&
    administrationSource.includes("fetchOcpResourceList") &&
    stylesSource.includes(".ocp-admin-console") &&
    stylesSource.includes(".ocp-admin-toolbar") &&
    stylesSource.includes(".admin-filter-toolbar") &&
    stylesSource.includes(".admin-native-grid") &&
    stylesSource.includes(".native-admin-table") &&
    stylesSource.includes(".admin-native-boundary") &&
    e2eSource.includes('"administration-console": "Administration console"'),
  "Administration menu items must render native Cluster Settings, ClusterOperators, Namespaces, CRDs, ResourceQuotas, and LimitRanges surfaces with operator/API/RBAC boundary evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official compute console surface contract",
  paritySource.includes('| "compute-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-compute-nodes\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-compute-machines\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-compute-machinesets\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-compute-machineconfigpools\']"') &&
    paritySource.includes('mode: "compute-console"') &&
    appSource.includes("case \"compute-console\"") &&
    appSource.includes("<OcpComputeConsole") &&
    computeSource.includes("export type OcpComputeView") &&
    computeSource.includes('data-testid={viewTestId(view)}') &&
    computeSource.includes('data-testid="ocp-compute-toolbar"') &&
    computeSource.includes('data-testid="ocp-compute-native-toolbar"') &&
    computeSource.includes('data-testid="ocp-compute-filter-count"') &&
    computeSource.includes("setResourceFilter") &&
    computeSource.includes("setNamespaceFilter") &&
    computeSource.includes("setSearch") &&
    computeSource.includes("nativeResourceCreatePath") &&
    computeSource.includes('data-testid="ocp-compute-readiness-board"') &&
    computeSource.includes('data-testid="ocp-compute-nodes-table"') &&
    computeSource.includes('data-testid="ocp-compute-machines-table"') &&
    computeSource.includes('data-testid="ocp-compute-machinesets-table"') &&
    computeSource.includes('data-testid="ocp-compute-machineconfigpools-table"') &&
    computeSource.includes('data-testid="ocp-compute-native-handoff"') &&
    computeSource.includes("v1\", resource: \"nodes\"") &&
    computeSource.includes("machine.openshift.io/v1beta1") &&
    computeSource.includes("machineconfiguration.openshift.io/v1") &&
    computeSource.includes("fetchOcpResourceList") &&
    stylesSource.includes(".ocp-compute-console") &&
    stylesSource.includes(".ocp-compute-toolbar") &&
    stylesSource.includes(".compute-filter-toolbar") &&
    stylesSource.includes(".compute-native-grid") &&
    stylesSource.includes(".native-compute-table") &&
    stylesSource.includes(".compute-native-boundary") &&
    e2eSource.includes('"compute-console": "Compute console"'),
  "Compute menu items must render native Nodes, Machines, MachineSets, and MachineConfigPools surfaces with readiness/capacity/Machine API/rollout evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "official user management console surface contract",
  paritySource.includes('| "user-management-console"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-user-users\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-user-groups\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-user-serviceaccounts\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-user-roles\']"') &&
    paritySource.includes('targetSelector: "[data-testid=\'ocp-user-rolebindings\']"') &&
    paritySource.includes('mode: "user-management-console"') &&
    appSource.includes("case \"user-management-console\"") &&
    appSource.includes("<OcpUserManagementConsole") &&
    userManagementSource.includes("export type OcpUserManagementView") &&
    userManagementSource.includes('data-testid={viewTestId(view)}') &&
    userManagementSource.includes('data-testid="ocp-user-toolbar"') &&
    userManagementSource.includes('data-testid="ocp-user-native-toolbar"') &&
    userManagementSource.includes('data-testid="ocp-user-filter-count"') &&
    userManagementSource.includes("setResourceFilter") &&
    userManagementSource.includes("setNamespaceFilter") &&
    userManagementSource.includes("setSearch") &&
    userManagementSource.includes("nativeResourceCreatePath") &&
    userManagementSource.includes('data-testid="ocp-user-subjects-board"') &&
    userManagementSource.includes('data-testid="ocp-user-users-table"') &&
    userManagementSource.includes('data-testid="ocp-user-groups-table"') &&
    userManagementSource.includes('data-testid="ocp-user-serviceaccounts-table"') &&
    userManagementSource.includes('data-testid="ocp-user-roles-table"') &&
    userManagementSource.includes('data-testid="ocp-user-rolebindings-table"') &&
    userManagementSource.includes('data-testid="ocp-user-native-handoff"') &&
    userManagementSource.includes("user.openshift.io/v1") &&
    userManagementSource.includes("rbac.authorization.k8s.io/v1") &&
    userManagementSource.includes('apiVersion: "v1", resource: "serviceaccounts"') &&
    userManagementSource.includes("fetchOcpResourceList") &&
    stylesSource.includes(".ocp-user-console") &&
    stylesSource.includes(".ocp-user-toolbar") &&
    stylesSource.includes(".user-filter-toolbar") &&
    stylesSource.includes(".user-native-grid") &&
    stylesSource.includes(".native-user-table") &&
    stylesSource.includes(".user-native-boundary") &&
    e2eSource.includes('"user-management-console": "User management console"'),
  "User Management menu items must render native Users, Groups, ServiceAccounts, Roles, and RoleBindings surfaces with RBAC subject/rule/binding evidence instead of routing only to the generic resource explorer"
);

expectCheck(
  "overview coverage matrix render contract",
  appSource.includes("<OcpCoverageMatrix language={language} />") &&
    coverageSource.includes('data-testid="ocp-coverage-status"') &&
    coverageSource.includes('data-testid="ocp-coverage-matrix"') &&
    coverageSource.includes('data-testid="ocp-coverage-diagnostic"') &&
    coverageSource.includes('className="coverage-gap-code"') &&
    stylesSource.includes(".coverage-gap-code") &&
    e2eSource.includes("ocp-coverage-status") &&
    e2eSource.includes("ocp-coverage-diagnostic"),
  "Overview must render coverage readiness, matrix, diagnostic evidence, and raw gap codes"
);

expectCheck(
  "resource function smoke contract",
    resourceExplorerSource.includes('data-testid="ocp-function-smoke"') &&
    resourceExplorerSource.includes("export type OcpResourceFunctionOutcome") &&
    resourceExplorerSource.includes("onFunctionOutcomeChange?.(functionOutcomeState)") &&
    appSource.includes("resourceFunctionOutcome") &&
    appSource.includes("onFunctionOutcomeChange={setResourceFunctionOutcome}") &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-function-outcome"') &&
    resourceExplorerSource.includes("data-function-outcome={functionOutcomeState}") &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-selected-api"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-preset-match"') &&
    resourceExplorerSource.includes("data-preset-match={presetMatchState}") &&
    resourceExplorerSource.includes("resourceMatchesPreferredPreset") &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-list-status"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-detail-status"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-events-status"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-logs-status"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-related-status"') &&
    resourceExplorerSource.includes('data-testid="ocp-smoke-mutation-guard"') &&
    resourceExplorerSource.includes("data-smoke-state={listSmokeState}") &&
    resourceExplorerSource.includes("data-smoke-state={detailSmokeState}") &&
    resourceExplorerSource.includes("data-smoke-state={eventsSmokeState}") &&
    resourceExplorerSource.includes("data-smoke-state={logsSmokeState}") &&
    resourceExplorerSource.includes("data-smoke-state={relatedSmokeState}") &&
    resourceExplorerSource.includes('selectedResource?.kind !== "Pod"') &&
    resourceExplorerSource.includes("readOnlyGuard") &&
    stylesSource.includes(".ocp-function-smoke") &&
    e2eSource.includes('getByTestId("ocp-function-smoke")') &&
    e2eSource.includes('getByTestId("ocp-smoke-function-outcome")') &&
    e2eSource.includes('"data-function-outcome"') &&
    e2eSource.includes("operating|empty|waiting|loading|missing") &&
    e2eSource.includes('getByTestId("ocp-smoke-preset-match")') &&
    e2eSource.includes('"data-preset-match"') &&
    e2eSource.includes('"data-preset-match",\n        "missing"') &&
    e2eSource.includes('data-smoke-state",') &&
    e2eSource.includes("/.+\\s+[^/\\s]+\\/\\S+/") &&
    e2eSource.includes('"ready",') &&
    e2eSource.includes("no create/update/patch/delete") &&
    e2eSource.includes('getByTestId("ocp-smoke-mutation-guard")'),
  "Resource Explorer exposes structured outcome/list/detail/events/logs/related/read-only status for every active console menu preset"
);

expectCheck(
  "localized navigation structure",
  appSource.includes('data-testid={`console-nav-section-${sectionTestId(section)}`}') &&
    appSource.includes("aria-expanded={expanded}") &&
    appSource.includes("data-section-expanded={expanded}") &&
    appSource.includes("nav-section-icon") &&
    appSource.includes("nav-heading-label") &&
    appSource.includes('className="nav-group-items"') &&
    appSource.includes("hidden={!expanded}") &&
    appSource.includes("toggleNavigationSection(section)") &&
    appSource.includes('data-testid="console-breadcrumb"') &&
    appSource.includes("sectionLabelsKo") &&
    appSource.includes("sectionTestId(section)") &&
    appSource.includes("originalPathKo") &&
    appSource.includes("originalPath") &&
    paritySource.includes('Home: "홈"') &&
    paritySource.includes('Monitoring: "모니터링"') &&
    paritySource.includes('"User Management": "사용자 관리"') &&
    appSource.includes("navLabel(item, language)") &&
    appSource.includes("navBreadcrumb(activeNavigation, language)") &&
    stylesSource.includes(".console-frame.nav-collapsed .nav-heading-label") &&
    stylesSource.includes(".console-frame.nav-collapsed .nav-group-items"),
  "console navigation sections, items, and breadcrumb have stable localized render points"
);

expectCheck(
  "localized interactive shell e2e",
  e2eSource.includes("AC-UI-004 keeps KO/EN switching consistent and customer masthead stays compact") &&
    e2eSource.includes('switchLanguage(page, "ko")') &&
    e2eSource.includes('"language-ko-toggle"') &&
    e2eSource.includes('"language-en-toggle"') &&
    e2eSource.includes('getByTestId("opslens-status-details")).toHaveCount(0)') &&
    e2eSource.includes('getByTestId("opslens-readiness-command-strip")).toHaveCount(0)') &&
    e2eSource.includes('await openConsoleNavItem(page, "opslens-admin")') &&
    e2eSource.includes('getByTestId("active-surface-ops-admin")') &&
    e2eSource.includes('const localizedNavigation = [') &&
    e2eSource.includes('const localizedSections = [') &&
    e2eSource.includes('getByTestId(`console-nav-section-${section}`)') &&
    e2eSource.includes('getByTestId(`console-nav-${navId}`)') &&
    e2eSource.includes('getByTestId("console-breadcrumb")') &&
    e2eSource.includes("워크로드") &&
    e2eSource.includes("네트워킹") &&
    e2eSource.includes("스토리지") &&
    e2eSource.includes("모니터링") &&
    e2eSource.includes("컴퓨트") &&
    e2eSource.includes("사용자 관리") &&
    e2eSource.includes("Administration") &&
    e2eSource.includes("User Management") &&
    e2eSource.includes("Monitoring") &&
    e2eSource.includes('getByTestId("readiness-status")') &&
    e2eSource.includes("근거 필요") &&
    e2eSource.includes("남은 항목") &&
    e2eSource.includes("다음 게이트") &&
    e2eSource.includes("다음 점검") &&
    e2eSource.includes("needs evidence") &&
    e2eSource.includes("remaining items") &&
    e2eSource.includes("next gate") &&
    e2eSource.includes("next check") &&
    e2eSource.includes('getByTestId("masthead-user-menu")') &&
    e2eSource.includes("kubeadmin") &&
    e2eSource.includes("KOMSCO AI 어시스턴트") &&
    e2eSource.includes("KOMSCO AI Assistant") &&
    e2eSource.includes('getByTestId("assistant-mode-matrix")') &&
    e2eSource.includes('getByTestId("assistant-answer-source")') &&
    e2eSource.includes('getByTestId("assistant-mutation-boundary")') &&
    e2eSource.includes("답변 출처") &&
    e2eSource.includes("클러스터 변경") &&
    e2eSource.includes("실행 안 함") &&
    e2eSource.includes("OpenShift Lightspeed /v1/streaming_query") &&
    e2eSource.includes("Lightspeed connection required") &&
    e2eSource.includes("not executed") &&
    e2eSource.includes("Ask KOMSCO AI Assistant") &&
    e2eSource.includes("KOMSCO AI 어시스턴트에 질문"),
  "Playwright covers KO/EN switching across masthead, install flow, navigation, and the KOMSCO assistant"
);

expectCheck(
  "assistant keyboard execution e2e",
  e2eSource.includes('const assistantDraft = page.getByTestId("assistant-draft")') &&
    e2eSource.includes('press("Shift+Enter")') &&
    e2eSource.includes('toHaveValue(`${keyboardPrompt}\\n`)') &&
    e2eSource.includes('press("Enter")') &&
    e2eSource.includes('getByTestId("assistant-ask-button")') &&
    e2eSource.includes("줄바꿈 보존 후 Enter 전송.") &&
    e2eSource.includes("/api/actions/plan") &&
    e2eSource.includes("openshift-lightspeed"),
  "Playwright proves Shift+Enter keeps a newline and Enter submits the KOMSCO assistant to the Lightspeed-backed OpsLens API path"
);

expectCheck(
  "clickable utility shell e2e",
  e2eSource.includes("AC-UI-005 makes masthead utilities and evidence actions clickable") &&
    e2eSource.includes('getByTestId("nav-collapse-toggle")') &&
    e2eSource.includes('getByTestId("masthead-app-launcher")') &&
    e2eSource.includes('getByTestId("masthead-notifications")') &&
    e2eSource.includes('getByTestId("masthead-create")') &&
    e2eSource.includes('getByTestId("masthead-help")') &&
    e2eSource.includes('getByTestId("evidence-view-logs")') &&
    e2eSource.includes('getByTestId("evidence-view-yaml")') &&
    e2eSource.includes('getByTestId("evidence-view-alerts")') &&
    e2eSource.includes('getByTestId("evidence-ask-logs")') &&
    e2eSource.includes('getByTestId("evidence-ask-yaml")') &&
    e2eSource.includes('getByTestId("evidence-ask-alerts")') &&
    e2eSource.includes("Application launcher focused") &&
    e2eSource.includes("Create opened a plan-only workflow") &&
    e2eSource.includes("Help opened the KOMSCO AI Assistant"),
  "Playwright clicks masthead utilities, evidence tabs, and evidence ask buttons instead of relying only on static handlers"
);

expectCheck(
  "localized navigation action e2e",
  e2eSource.includes("AC-UI-006 makes Korean console navigation actionable") &&
    e2eSource.includes('switchLanguage(page, "ko")') &&
    e2eSource.includes("for (const item of ocpConsoleParityItems)") &&
    e2eSource.includes("const proof = consoleParityFunctionProof(item)") &&
    e2eSource.includes("await openConsoleNavItem(page, item)") &&
    e2eSource.includes("await openConsoleNavItem(page, \"favorites\")") &&
    e2eSource.includes("item.labelKo") &&
    e2eSource.includes("item.commandKo") &&
    e2eSource.includes("item.originalPathKo") &&
    e2eSource.includes("proof.inputKo") &&
    e2eSource.includes("proof.proofKo") &&
    e2eSource.includes('getByTestId("console-active-ask-assistant").click()') &&
    e2eSource.includes('getByTestId("assistant-draft")') &&
    e2eSource.includes("escapeForRegExp(item.labelKo)") &&
    e2eSource.includes("escapeForRegExp(item.commandKo)") &&
    e2eSource.includes("escapeForRegExp(item.originalPathKo)") &&
    e2eSource.includes("escapeForRegExp(proof.inputKo)") &&
    e2eSource.includes("escapeForRegExp(proof.proofKo)") &&
    e2eSource.includes("읽기 전용") &&
    e2eSource.includes("클러스터 변경 명령") &&
    e2eSource.includes("page.locator(item.targetSelector)") &&
    e2eSource.includes("item.resourcePreset.query") &&
    e2eSource.includes("expectConsoleFunctionEffect(page, item)") &&
    e2eSource.includes("OCP 4.21.14 콘솔 커버리지") &&
    e2eSource.includes("원본 콘솔 항목"),
  "Playwright clicks every version-pinned console registry item after switching to Korean and verifies localized function proof plus KOMSCO prompt context"
);

expectCheck(
  "localized shell persistence",
  appSource.includes('window.localStorage.setItem("cywell-opslens-language", language)') &&
    appSource.includes("document.documentElement.lang = language") &&
    appSource.includes("switchLanguageToKorean") &&
    appSource.includes("switchLanguageToEnglish"),
  "globe language control persists the selected language and updates the document language"
);

expectCheck(
  "customer-facing Korean shell copy",
    appSource.includes("CRC 검증 환경") &&
    appSource.includes("콘솔 라우트 준비 중 / 회사 OCP 변경 없음") &&
    !appSource.includes("미리보기 화면") &&
    !appSource.includes("독립 미리보기") &&
    !appSource.includes("로컬 API 경로") &&
    appSource.includes("계획 수립 흐름만 엽니다") &&
    appSource.includes("진행 중인 장애 대기열") &&
    paritySource.includes("설치 전에 카탈로그 패키지") &&
    paritySource.includes("필수 키") &&
    appSource.includes("{copy.api} {apiStatusLabels[language][apiStatus]}") &&
    paritySource.includes("파드 목록, 상태, 이벤트, 로그") &&
    parityComponentSource.includes("원본 OpenShift 콘솔 기능을 숨기지 않고 유지") &&
    !appSource.includes("{copy.api} {apiStatus}") &&
    !appSource.includes("발생 중인 alert") &&
    !appSource.includes("Assistant가") &&
    !appSource.includes("triage queue로") &&
    !appSource.includes("근거 패널을 pod log") &&
    !appSource.includes("필수 key") &&
    !assistantSource.includes("assistant 닫기") &&
    !evidenceSource.includes("컨텍스트 발행 payload") &&
    !overviewSource.includes("콘솔형 live overview") &&
    !dashboardSource.includes("활성 incident queue") &&
    !appSource.includes("로컬 fixture 시나리오") &&
    !appSource.includes("회사 OCP mutation 없음") &&
    !appSource.includes("미리보기 shell") &&
    !appSource.includes("plan-only workflow만") &&
    !appSource.includes("active incident queue와"),
  "Korean shell copy avoids developer-only terms on the customer-facing navigation and status surfaces"
);

const failCount = checks.filter((check) => check.status === "FAIL").length;
pass("web shell evidence export", `${resolve(evidenceOut)} written`);

const evidence = {
  schema: "cywell.opslens.web-shell-contract.v0.1",
  artifactType: "opslens.web-shell-contract.v0.1",
  generatedAt: new Date().toISOString(),
  status: failCount > 0 ? "BLOCKED" : "PASS",
  failCount,
  checkCount: checks.length,
  actionMode: "staticSourceContractOnly",
  clusterMutationAttempted: false,
  registryMutationAttempted: false,
  acceptance: ["AC-UI-001", "AC-DASH-001", "AC-OP-003"],
  ref: {
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "unknown"),
    headSha: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    baseRef: gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], "origin/main"),
    worktreeDirty: gitDirty()
  },
  checks
};

await mkdir(resolve("test-results"), { recursive: true });
await writeFile(resolve(evidenceOut), `${JSON.stringify(evidence, null, 2)}\n`);

for (const check of checks) {
  console.log(`[${check.status}] ${check.name}: ${check.detail}`);
}

const finalFailCount = checks.filter((check) => check.status === "FAIL").length;
console.log(`\nCywell OpsLens web shell contract: ${finalFailCount} fail, ${checks.length} checks`);
if (finalFailCount > 0) {
  process.exitCode = 1;
}
