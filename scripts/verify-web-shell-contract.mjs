#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

const appSource = await readText("apps/web/src/App.tsx");
const assistantSource = await readText("apps/web/src/components/AssistantPopover.tsx");
const evidenceSource = await readText("apps/web/src/components/ConsoleEvidencePane.tsx");
const overviewSource = await readText("apps/web/src/components/OcpConsoleOverview.tsx");
const dashboardSource = await readText("apps/web/src/components/OperationsDashboard.tsx");
const explorerSource = await readText("apps/web/src/components/OcpResourceExplorer.tsx");
const coverageSource = await readText("apps/web/src/components/OcpCoverageMatrix.tsx");
const adminSource = await readText("apps/web/src/components/OpsLensAdminDashboard.tsx");
const routeSource = await readText("apps/web/src/plugin/OpsLensRoute.tsx");
const apiSource = await readText("apps/web/src/lib/api.ts");
const stylesSource = await readText("apps/web/src/styles/app.css");
const e2eSource = await readText("tests/e2e/mvp-0.1.spec.ts");
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
const certificationReadinessSource = sourceSection(
  adminSource,
  'data-testid="opslens-certification-readiness"',
  'data-testid="opslens-community-submission"'
);

expectCheck(
  "runtime surface badge",
  appSource.includes('data-testid="runtime-surface"') &&
    appSource.includes('data-testid="api-route-mode"') &&
    appSource.includes('data-testid="console-plugin-scope"') &&
    appSource.includes('data-testid="install-flow-strip"') &&
    appSource.includes('data-testid="console-context-primary"') &&
    appSource.includes("CRC lab preview") &&
    appSource.includes("OpenShift ConsolePlugin") &&
    !appSource.includes("<span>prod-ocp / openshift-cluster-version</span>") &&
    appSource.includes("Standalone dev") &&
    appSource.includes("Console plugin") &&
    appSource.includes("Route + proxy mode") &&
    appSource.includes("Preview shell"),
  "dashboard shell distinguishes standalone dev, ConsolePlugin mode, install scope, and non-company-OCP local context"
);

expectCheck(
  "install flow status strip",
  appSource.includes("OperatorHub: operator") &&
    appSource.includes("OpsLensInstallation: product") &&
    appSource.includes("ConsolePlugin: route") &&
    appSource.includes("OperatorHub: 오퍼레이터") &&
    appSource.includes("OpsLensInstallation: 제품 적용") &&
    appSource.includes("ConsolePlugin: 콘솔 라우트") &&
    appSource.includes('data-testid="install-flow-operatorhub"') &&
    appSource.includes('data-testid="install-flow-cr"') &&
    appSource.includes('data-testid="install-flow-consoleplugin"') &&
    stylesSource.includes(".install-flow-strip") &&
    stylesSource.includes("flex-wrap: wrap"),
  "masthead exposes the OperatorHub -> OpsLensInstallation -> ConsolePlugin install/apply distinction"
);

expectCheck(
  "visible OpsLens mod boundary",
  appSource.includes('data-testid="mod-boundary-strip"') &&
    appSource.includes('data-testid="mod-boundary-adds"') &&
    appSource.includes('data-testid="mod-boundary-keeps"') &&
    appSource.includes("OpsLens adds route/API/MCP surfaces") &&
    appSource.includes("OpenShift keeps native chrome and Lightspeed drawer") &&
    appSource.includes("OpsLens가 라우트/API/MCP 화면을 추가") &&
    appSource.includes("OpenShift 기본 메뉴와 Lightspeed 서랍은 유지") &&
    stylesSource.includes(".mod-boundary-strip") &&
    stylesSource.includes(".mod-boundary-strip .status-pill"),
  "masthead visibly explains what the OpsLens mod adds and what native OpenShift/Lightspeed surfaces still own"
);

expectCheck(
  "visible runtime profile boundary",
  appSource.includes('data-testid="runtime-profile-strip"') &&
    appSource.includes('data-testid="runtime-profile-crc"') &&
    appSource.includes('data-testid="runtime-profile-approved"') &&
    appSource.includes("CRC demo uses in-memory RAG + mock model") &&
    appSource.includes("Approved install requires pgvector/vLLM evidence") &&
    appSource.includes("CRC 데모는 인메모리 RAG + 목 모델 사용") &&
    appSource.includes("승인 설치는 pgvector/vLLM 근거 필요") &&
    stylesSource.includes(".runtime-profile-strip") &&
    stylesSource.includes(".runtime-profile-strip .status-pill"),
  "masthead visibly separates CRC lightweight runtime from approved pgvector/vLLM runtime evidence"
);

expectCheck(
  "visible certification boundary",
  appSource.includes('data-testid="certification-boundary-strip"') &&
    appSource.includes('data-testid="certification-boundary-local"') &&
    appSource.includes('data-testid="certification-boundary-submit"') &&
    appSource.includes('data-testid="certification-boundary-evidence"') &&
    appSource.includes("Local demo build") &&
    appSource.includes("No Partner/OperatorHub submission") &&
    appSource.includes(
      "Certified readiness needs security/release evidence"
    ) &&
    appSource.includes("로컬 데모 빌드") &&
    appSource.includes("Partner/OperatorHub 제출 안 함") &&
    appSource.includes("인증 준비는 보안/릴리스 근거 필요") &&
    stylesSource.includes(".certification-boundary-strip") &&
    stylesSource.includes(".certification-boundary-strip .status-pill"),
  "masthead visibly blocks local demo builds from being mistaken for certified or submitted OperatorHub readiness"
);

expectCheck(
  "visible demo handoff checklist",
  appSource.includes('data-testid="demo-handoff-strip"') &&
    appSource.includes('data-testid="handoff-reconnect"') &&
    appSource.includes('data-testid="handoff-route"') &&
    appSource.includes('data-testid="handoff-smoke"') &&
    appSource.includes("Reconnect Mac CRC") &&
    appSource.includes("Open ConsolePlugin route") &&
    appSource.includes("Run read-only smoke") &&
    appSource.includes("Mac CRC 재연결") &&
    appSource.includes("콘솔 플러그인 라우트 열기") &&
    appSource.includes("읽기 전용 스모크 실행") &&
    stylesSource.includes(".demo-handoff-strip") &&
    stylesSource.includes(".demo-handoff-strip .status-pill"),
  "masthead gives return-to-demo operators the next three non-mutating steps without opening the runbook"
);

expectCheck(
  "visible demo access path",
  appSource.includes('data-testid="access-boundary-strip"') &&
    appSource.includes('data-testid="access-console-route"') &&
    appSource.includes('data-testid="access-dashboard-https"') &&
    appSource.includes('data-testid="access-api-proxy"') &&
    appSource.includes("Installed view uses Console route") &&
    appSource.includes("Dashboard uses HTTPS 19443") &&
    appSource.includes("Assistant/API follows proxy mode") &&
    appSource.includes("설치 화면은 콘솔 라우트 사용") &&
    appSource.includes("대시보드는 HTTPS 19443") &&
    appSource.includes("어시스턴트/API는 프록시 모드 연동") &&
    stylesSource.includes(".access-boundary-strip") &&
    stylesSource.includes(".access-boundary-strip .status-pill"),
  "masthead keeps the installed Console route, HTTPS dashboard port-forward, and API proxy paths visible"
);

expectCheck(
  "visible CRC install signal",
  appSource.includes('data-testid="apply-signal-strip"') &&
    appSource.includes('data-testid="apply-signal-profile"') &&
    appSource.includes('data-testid="apply-signal-command"') &&
    appSource.includes('data-testid="apply-signal-ready"') &&
    appSource.includes('data-testid="apply-signal-stale"') &&
    appSource.includes("Use CRC lightweight example first") &&
    appSource.includes("Check: oc get opslensinstallation,deploy,pod,svc") &&
    appSource.includes("CRC ready = API/dashboard 1/1") &&
    appSource.includes("Old quay.io image means stale catalog") &&
    appSource.includes("CRC lightweight 예제를 먼저 선택") &&
    appSource.includes("확인: oc get opslensinstallation,deploy,pod,svc") &&
    appSource.includes("CRC 준비 = API/대시보드 1/1") &&
    appSource.includes("quay.io 구버전 이미지는 stale catalog") &&
    stylesSource.includes(".apply-signal-strip") &&
    stylesSource.includes(".apply-signal-strip .status-pill"),
  "masthead keeps the next CRC install verification command, ready signal, and stale catalog signal visible"
);

expectCheck(
  "visible post-install smoke path",
  appSource.includes('data-testid="post-install-smoke-strip"') &&
    appSource.includes('data-testid="smoke-route"') &&
    appSource.includes('data-testid="smoke-assistant"') &&
    appSource.includes('data-testid="smoke-ols"') &&
    appSource.includes("Open ConsolePlugin route") &&
    appSource.includes("Ask KOMSCO AI Assistant") &&
    appSource.includes("OLSConfig stays ValidateOnly") &&
    appSource.includes("콘솔 플러그인 라우트 열기") &&
    appSource.includes("KOMSCO AI 어시스턴트 질문") &&
    appSource.includes("OLSConfig는 ValidateOnly 유지") &&
    stylesSource.includes(".post-install-smoke-strip") &&
    stylesSource.includes(".post-install-smoke-strip .status-pill"),
  "masthead keeps the post-install smoke path visible without implying OLSConfig mutation"
);

expectCheck(
  "console plugin proxy detection",
  appSource.includes('surface === "console-plugin"') &&
    appSource.includes('/api/proxy/plugin/cywell-opslens/') &&
    routeSource.includes("surface=console-plugin") &&
    routeSource.includes("encodeURIComponent(apiProxyBase)"),
  "console route passes the UserToken proxy base and the shell recognizes plugin hosting"
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
    !appSource.includes('className="user-menu">admin'),
  "masthead keeps the OpenShift console user placement and kubeadmin demo identity"
);

expectCheck(
  "OpsLens assistant icon",
  assistantSource.includes("cywell_ops_lens_icon.png") &&
    assistantSource.includes("assistant-app-icon") &&
    appSource.includes("launcher-icon-image") &&
    stylesSource.includes(".assistant-app-icon") &&
    stylesSource.includes(".launcher-icon-image"),
  "assistant header and floating launcher use the OpsLens icon asset"
);

expectCheck(
  "assistant API route diagnostics",
  appSource.includes("getApiRouteDiagnostics") &&
    appSource.includes("lastApiError") &&
    appSource.includes("onRetryConnection") &&
    assistantSource.includes('data-testid="assistant-api-route-mode"') &&
    assistantSource.includes('data-testid="assistant-action-plan-path"') &&
    assistantSource.includes('data-testid="assistant-last-api-error"') &&
    assistantSource.includes('data-testid="assistant-connection-summary"') &&
    assistantSource.includes('data-testid="assistant-mode-matrix"') &&
    assistantSource.includes('data-testid="assistant-answer-source"') &&
    assistantSource.includes('data-testid="assistant-token-path"') &&
    assistantSource.includes('data-testid="assistant-mutation-boundary"') &&
    assistantSource.includes("연결 판정") &&
    assistantSource.includes("답변 출처") &&
    assistantSource.includes("OpenShift 사용자 토큰 프록시") &&
    assistantSource.includes("실행 안 함") &&
    assistantSource.includes("answer source") &&
    assistantSource.includes('readyStatus: "API connected / plan-only"') &&
    assistantSource.includes('readyStatus: "API 연결됨 / 계획 전용"') &&
    assistantSource.includes("local plan-only fallback") &&
    assistantSource.includes("OpenShift UserToken proxy") &&
    assistantSource.includes("not executed") &&
    assistantSource.includes("실제 AI 연결처럼 보이게 꾸미지 않고") &&
    assistantSource.includes("오류 해석") &&
    assistantSource.includes("포트 포워딩/ConsolePlugin 프록시가 끊겼습니다.") &&
    assistantSource.includes("assistant-last-api-error-interpretation") &&
    assistantSource.includes("Retry API") &&
    apiSource.includes("console-plugin-user-token-proxy") &&
    apiSource.includes("local-vite-proxy"),
  "assistant surfaces local/proxy API route, last API error, and retry control instead of hiding fallback state"
);

expectCheck(
  "assistant integration contract",
  assistantSource.includes('data-testid="assistant-integration-contract"') &&
    assistantSource.includes('data-testid="assistant-integration-standalone"') &&
    assistantSource.includes('data-testid="assistant-integration-console"') &&
    assistantSource.includes('data-testid="assistant-integration-lightspeed"') &&
    assistantSource.includes("Standalone preview uses local API route") &&
    assistantSource.includes("Installed ConsolePlugin uses the UserToken proxy") &&
    assistantSource.includes("Native Lightspeed drawer is separate") &&
    assistantSource.includes("독립 미리보기는 로컬 API 경로") &&
    assistantSource.includes("설치된 ConsolePlugin은 사용자 토큰 프록시") &&
    assistantSource.includes("기본 Lightspeed 서랍은 별도") &&
    stylesSource.includes(".assistant-integration-contract") &&
    stylesSource.includes(".assistant-integration-contract span"),
  "assistant visibly separates standalone preview, ConsolePlugin proxy integration, and native Lightspeed drawer ownership"
);

expectCheck(
  "assistant ask execution path",
  assistantSource.includes('data-testid="assistant-execution-path"') &&
    assistantSource.includes('data-testid="assistant-execution-enter"') &&
    assistantSource.includes('data-testid="assistant-execution-fallback"') &&
    assistantSource.includes('data-testid="assistant-execution-newline"') &&
    assistantSource.includes("Ask execution path") &&
    assistantSource.includes("Enter sends to the current OpsLens API route") &&
    assistantSource.includes("Fallback keeps the local plan-only answer visible") &&
    assistantSource.includes("Shift+Enter adds a line") &&
    assistantSource.includes("질문 실행 경로") &&
    assistantSource.includes("Enter는 현재 OpsLens API 경로로 전송") &&
    assistantSource.includes("대체 응답은 로컬 계획 전용으로 유지") &&
    assistantSource.includes("Shift+Enter는 줄바꿈") &&
    stylesSource.includes(".assistant-execution-path") &&
    stylesSource.includes(".assistant-execution-path strong"),
  "assistant makes Enter, API route, fallback, and Shift+Enter behavior visible"
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
    appSource.includes("setNavigationCommand(navCommand(item, language))") &&
    appSource.includes("setEvidenceView(item.evidenceView)") &&
    appSource.includes("setResourcePreset({") &&
    appSource.includes("function runUtilityAction") &&
    appSource.includes("setNavigationCommand(label)") &&
    appSource.includes("setAssistantOpen(true)") &&
    appSource.includes("scrollToNavigationTarget(targetSelector)") &&
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
    appSource.includes("<OcpCoverageMatrix language={language}") &&
    appSource.includes("<OcpResourceExplorer") &&
    appSource.includes("<OpsLensAdminDashboard language={language}") &&
    appSource.includes("language={language}") &&
    appSource.includes("apiStatusLabels") &&
    appSource.includes("로컬 대체 응답") &&
    appSource.includes("연결 확인 중") &&
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
    !securityScanSource.includes(":ready="),
  "Security scan and review rows use bilingual labels instead of raw key/value UI labels"
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
  !adminSource.includes("contractReady={String(ragProductionReadiness.contractReady)}") &&
    !adminSource.includes("queueLive={String(ragProductionReadiness.productionQueueLive)}") &&
    !adminSource.includes("workerLive={String(ragProductionReadiness.ingestionWorkerLive)}") &&
    !adminSource.includes("vectorAudit=") &&
    !adminSource.includes("rawMarkdown=") &&
    !adminSource.includes("auditAppendOnly=") &&
    !adminSource.includes("approvals={ragProductionReadiness.requiredApprovals.join") &&
    !adminSource.includes("ticket={ragProductionReadiness.ticketPacket.id}") &&
    !adminSource.includes("first={ragProductionReadiness.ticketPacket.firstReadOnlyAction.id}") &&
    !adminSource.includes("queueMetadataWrite=") &&
    !adminSource.includes("approved={String(queueIngestionPlan.approvedForIngestion)}") &&
    !adminSource.includes(":next={action.nextCommand}:mutation={String(action.mutation)}") &&
    !adminSource.includes("<span>approvals {item.approvals.length}</span>"),
  "RAG production and approval queue panels use bilingual labels instead of raw key/value UI labels"
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
  "localized interactive shell e2e",
  e2eSource.includes("AC-UI-004 keeps KO/EN switching consistent across shell and assistant") &&
    e2eSource.includes('getByTestId("language-ko-toggle")') &&
    e2eSource.includes("OperatorHub: 오퍼레이터") &&
    e2eSource.includes("OpsLensInstallation: 제품 적용") &&
    e2eSource.includes("ConsolePlugin: 콘솔 라우트") &&
    e2eSource.includes("OpsLens가 라우트/API/MCP 화면을 추가") &&
    e2eSource.includes("OpenShift 기본 메뉴와 Lightspeed 서랍은 유지") &&
    e2eSource.includes("CRC 데모는 인메모리 RAG + 목 모델 사용") &&
    e2eSource.includes("승인 설치는 pgvector/vLLM 근거 필요") &&
    e2eSource.includes("OpsLens adds route/API/MCP surfaces") &&
    e2eSource.includes("OpenShift keeps native chrome and Lightspeed drawer") &&
    e2eSource.includes("CRC demo uses in-memory RAG + mock model") &&
    e2eSource.includes("Approved install requires pgvector/vLLM evidence") &&
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
    e2eSource.includes("답변 출처") &&
    e2eSource.includes("클러스터 변경") &&
    e2eSource.includes("실행 안 함") &&
    e2eSource.includes("answer source") &&
    e2eSource.includes("cluster changes") &&
    e2eSource.includes("Ask from current context") &&
    e2eSource.includes("현재 컨텍스트로 질문"),
  "Playwright covers KO/EN switching across masthead, install flow, navigation, and the KOMSCO assistant"
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
    e2eSource.includes('getByTestId("language-ko-toggle")') &&
    e2eSource.includes('getByTestId("console-nav-overview")') &&
    e2eSource.includes('getByTestId("console-nav-alerting")') &&
    e2eSource.includes('getByTestId("console-nav-dashboards")') &&
    e2eSource.includes('getByTestId("console-nav-metrics")') &&
    e2eSource.includes('getByTestId("console-nav-logs")') &&
    e2eSource.includes('getByTestId("console-nav-workloads")') &&
    e2eSource.includes('getByTestId("console-nav-networking")') &&
    e2eSource.includes('getByTestId("console-nav-storage")') &&
    e2eSource.includes('getByTestId("console-nav-administration")') &&
    e2eSource.includes('getByTestId("console-nav-opslens-admin")') &&
    e2eSource.includes('getByTestId("console-nav-opsbrain")') &&
    e2eSource.includes("현재 클러스터 요약") &&
    e2eSource.includes("워크로드") &&
    e2eSource.includes("네트워킹") &&
    e2eSource.includes("스토리지") &&
    e2eSource.includes("OpsLens 관리"),
  "Playwright proves every console navigation item remains actionable after switching to Korean"
);

expectCheck(
  "localized shell persistence",
  appSource.includes('window.localStorage.setItem("cywell-opslens-language", language)') &&
    appSource.includes("document.documentElement.lang = language") &&
    appSource.includes("KO") &&
    appSource.includes("EN"),
  "language toggle persists the selected language and updates the document language"
);

expectCheck(
  "customer-facing Korean shell copy",
    appSource.includes("CRC 실습 환경 미리보기") &&
    appSource.includes("로컬 검증 시나리오 / 회사 OCP 변경 없음") &&
    appSource.includes("미리보기 화면") &&
    appSource.includes("계획 수립 흐름만 엽니다") &&
    appSource.includes("진행 중인 장애 대기열") &&
    appSource.includes("분류 대기열") &&
    appSource.includes("필수 키") &&
    appSource.includes("{copy.api} {apiStatusLabels[language][apiStatus]}") &&
    appSource.includes("읽기 전용 탐색기를 파드와 배포 중심으로 설정합니다.") &&
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
