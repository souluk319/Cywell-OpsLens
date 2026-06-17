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
    appSource.includes("KOMSCO AI Assistant") &&
    appSource.includes("Open KOMSCO AI Assistant") &&
    appSource.includes("KOMSCO AI 어시스턴트") &&
    !assistantSource.includes("Context-aware assistant") &&
    !appSource.includes("context-aware assistant"),
  "assistant copy and launcher accessibility labels are branded for KOMSCO instead of generic context-aware wording"
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
  "localized interactive shell e2e",
  e2eSource.includes("AC-UI-004 keeps KO/EN switching consistent across shell and assistant") &&
    e2eSource.includes('getByTestId("language-ko-toggle")') &&
    e2eSource.includes("OperatorHub: 오퍼레이터") &&
    e2eSource.includes("OpsLensInstallation: 제품 적용") &&
    e2eSource.includes("ConsolePlugin: 콘솔 라우트") &&
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
