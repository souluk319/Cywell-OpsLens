# Cywell OpsLens Overnight Execution Plan - Dev 0.1.2

Generated: 2026-06-17 KST
Branch: `feat/OpsLens-Dev0.1.2`
Start head: `cf791e1`
Latest pushed head before Lane 19: `5a6dc1e`
Base ref: `origin/main` at `5ad0b75`

## Goal

Use the connected MacBook CRC OCP window as the live reference target, but advance Cywell OpsLens safely from this Windows workspace while the user is away for roughly 10 hours.

The work should make OpsLens feel less like a static mock and more like a real OpenShift Console mod:

- consistent KOMSCO/Cywell branding
- Korean/English UI that does not embarrass the customer
- clear standalone-dev vs ConsolePlugin behavior
- safer Operator/CRC install readiness
- repeatable evidence, not memory-only progress

## Completion Criteria

| ID | Criterion | Pass/Fail Method | Evidence | Current Gap |
| --- | --- | --- | --- | --- |
| DEV012-UI-01 | Shell clearly distinguishes standalone dev from ConsolePlugin mode. | `npm run verify:web-shell` passes and browser DOM shows `runtime-surface`. | `test-results/cywell-opslens-web-shell-contract.json` | PASS at `005e5e4`; keep protected. |
| DEV012-UI-02 | Primary dashboard, evidence, overview, and resource explorer respond to KO/EN toggle. | Build plus browser DOM check or targeted static verifier. | verifier output and browser observation notes in final report | PASS at `005e5e4`; KO/EN shell and assistant contracts are protected. |
| DEV012-CHAT-01 | Assistant uses KOMSCO AI Assistant branding and OpsLens icon. | `verify:web-shell` checks source contract; browser confirms popover. | `test-results/cywell-opslens-web-shell-contract.json` | PASS at `005e5e4`; KO mode now uses `KOMSCO AI 어시스턴트` and the OpsLens icon. |
| DEV012-CONSOLE-01 | ConsolePlugin route contract remains intact. | `npm run verify:console-plugin` and `npm run -w @kugnus/web build`. | console plugin asset evidence | PASS at `005e5e4`; rerun after further changes. |
| DEV012-OP-01 | Operator install path does not regress on CRC arm64 image/tag/install-mode lessons. | `npm run verify:operator`, `verify:operator:runtime`, and targeted package checks. | test output and changed files | PASS for local arm64 handoff; live evidence still requires reconnect. |
| DEV012-RUNTIME-01 | Known live CRC runtime issues are named, not hidden. | Document status of API/dashboard/vector/vLLM with root cause and code fix candidates. | runbook/evidence update | Live vector needed anyuid workaround; vLLM image unavailable. Code-level remediation still needed. |
| DEV012-EVIDENCE-01 | Every completed lane leaves a verifier, evidence JSON, or runbook update. | `git status`, `test-results`, and commit log. | commits on `feat/OpsLens-Dev0.1.2` | Keep `desktop.ini` uncommitted. |

## Non-Goals

- Do not mutate company OCP.
- Do not expose `.env`, tokens, exact private host/IP, or secret values.
- Do not perform destructive cluster cleanup.
- Do not create registry credentials or upload images without an existing authenticated path.
- Do not claim Lightspeed native drawer replacement unless verified inside OpenShift ConsolePlugin context.
- Do not treat the local `http://127.0.0.1:5173/index.html` Vite shell as the same thing as the installed OpenShift ConsolePlugin.

## Stop Conditions

Stop and report instead of continuing if the next step requires:

- user password or MFA
- external registry login
- OCP mutation beyond the already accepted local CRC dev boundary
- destructive cleanup of cluster resources
- security approval
- product direction that changes the intended "OpenShift console mod" positioning
- keeping the Mac awake cannot be confirmed and the next lane depends on live CRC state

If blocked, report:

- branch
- head SHA
- validation results
- exact blocker
- remaining evidence gaps

## 10-Hour Execution Lanes

### Lane 0 - Control Plane And Baseline, 0:00-0:30

1. Confirm branch/head/status.
2. Re-run fast web shell and console plugin checks.
3. Record current known live target assumptions:
   - Mac CRC OCP is the target, not company OCP.
   - live cluster access may require existing SSH/port-forward sessions.
   - no secrets are read into logs.

Exit criteria:

- clean intended worktree except ignored/untracked junk
- no broken web build
- first checkpoint committed if plan changed

### Lane 1 - Customer-Facing UI Polish, 0:30-2:30

Focus:

- finish visible KO/EN consistency for the shell surfaces most likely to be shown:
  - masthead
  - left navigation
  - operations dashboard
  - evidence panel
  - OpenShift overview
  - resource explorer
  - assistant
- keep OpenShift-like top-right menu order stable
- avoid marketing-page drift; this is an operator console, not a landing page

Validation:

- `npm run -w @kugnus/web build`
- `npm run verify:web-shell`
- in-app browser DOM check for KO and EN

Commit target:

- `Polish Dev 0.1.2 console shell`

### Lane 2 - ConsolePlugin Reality Gap, 2:30-4:00

Focus:

- make the app explain what is real in standalone dev vs ConsolePlugin mode
- audit `OpsLensRoute.tsx`, proxy base, and plugin manifest
- add or extend verifier coverage if any route contract is not protected
- if feasible, add a small in-app "ConsolePlugin mode" diagnostic surface without exposing host/IP

Validation:

- `npm run -w @kugnus/web build`
- `npm run verify:console-plugin`
- `npm run verify:web-shell`

Commit target:

- `Harden ConsolePlugin mode diagnostics`

### Lane 3 - Operator/CRC Install Hardening, 4:00-6:00

Focus:

- inspect Operator reconcile behavior for the live issues seen today:
  - ownerReference `blockOwnerDeletion` finalizer permission issue
  - vector PostgreSQL SCC/permission issue
  - vLLM external image availability and replicas behavior
  - route/dashboard/API service readiness
- prefer code-level or manifest-level fixes that make the next CRC install smoother
- keep unsafe runtime choices behind explicit dev/sample configuration

Validation:

- `npm run verify:operator`
- `npm run verify:operator:reconcile`
- `npm run verify:operator:runtime`
- `npm run verify:operator:dry-run`

Commit target:

- `Harden CRC operator runtime defaults`

### Lane 4 - Live Verification Handoff, 6:00-7:30

Focus:

- prepare commands the user can run tomorrow if SSH/password blocks automation
- improve the reconnect/runbook path:
  - CRC status
  - OCP auth
  - dashboard port-forward
  - Lightspeed port-forward
  - ConsolePlugin route
  - OpsLensInstallation status
- do not require exact private IP or secret values in docs

Validation:

- existing read-only verifiers where possible
- docs sanity check by command copy/paste structure

Commit target:

- `Update CRC live verification handoff`

### Lane 5 - Evidence Gate Refresh, 7:30-9:00

Focus:

- run the broadest non-mutating local gates that fit the machine:
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
  - `npm run verify:install-plan`
  - `npm run verify:operator`
  - `npm run verify:operator:runtime`
  - `npm run verify:pre-cluster-install`
- do not run Docker builds unless Docker is already ready and the command is known to be local-only

Validation:

- terminal results summarized
- evidence files updated only when intentionally tracked or explicitly useful

Commit target:

- `Refresh Dev 0.1.2 evidence gates`

### Lane 6 - Morning Handoff, 9:00-10:00

Focus:

- final status report in a concise morning handoff
- branch/head/base refs
- commits made
- checks passed/failed/warned
- exact blockers
- what to click in the UI first
- what command to run first on Mac if live state must be restored

Validation:

- `git status --short --branch`
- latest verifier summary
- no accidental secret or `.env` staging

Commit target:

- `Document Dev 0.1.2 overnight handoff`

## Automation Loop Rules

Every checkpoint:

1. Inspect `git status --short --branch`.
2. Continue from the highest-priority incomplete lane.
3. Prefer local, non-mutating work.
4. Validate before committing.
5. Commit and push only intentional files.
6. Never commit `.env`, secrets, ignored evidence, or `desktop.ini`.
7. If blocked, write the blocker with exact evidence instead of retrying random commands.

The local non-mutating checkpoint runner is:

```powershell
npm run overnight:checkpoint
```

The 10-hour unattended safety loop is:

```powershell
npm run overnight:loop
```

The loop runs 20 iterations at a 30-minute interval and writes:

- `test-results/cywell-opslens-dev012-overnight-checkpoint.json`
- `test-results/cywell-opslens-dev012-overnight-checkpoint.md`

It intentionally does not patch OCP, create secrets, push images, or read `.env` values.

## Execution Log

### 2026-06-17 - Lane 1

- Implemented KO/EN propagation into the OpsLens Admin dashboard surface.
- Verified the visible Korean shell in-browser: `관리 대시보드`, `RAG 문서`, and `토큰 사용량` render under the KO toggle.
- Passed `npm run -w @kugnus/web build` and `npm run verify:web-shell`.
- Committed and pushed: `23fc447 Localize OpsLens admin shell`.

### 2026-06-17 - Lane 2

- Added a short shell status pill for the current install scope:
  - standalone dev shows local preview scope
  - ConsolePlugin mode shows route + proxy scope
- Product boundary remains explicit: OpsLens can add the Operator-backed route, launcher entry, dashboard/API proxy, and MCP readiness surfaces; native OpenShift chrome and the Lightspeed drawer remain OpenShift-owned unless a separately verified console extension path changes them.
- Protected the scope distinction in `npm run verify:web-shell`.

### 2026-06-17 - Lane 3

- Fixed the Go controller owner reference path so reconciled child resources use `blockOwnerDeletion=false` and no longer require `opslensinstallations/finalizers` permission.
- Removed the now-unneeded finalizer RBAC from both config RBAC and the Operator CSV.
- Added `deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml` for CRC demos:
  - internal CRC API/dashboard images
  - `vectorStore.provider=inmemory`
  - `modelRuntime.provider=mock-local`
  - `lightspeedRegistration.mode=ValidateOnly`
  - ConsolePlugin enabled
- Extended Operator verifiers so the CRC lightweight sample and no-finalizer RBAC contract are checked automatically.
- Passed `npm run verify:operator:reconcile`, `npm run verify:operator:runtime`, and `npm run verify:operator`.
- Note: local `gofmt` is unavailable on this Windows workspace; Go formatting was reviewed in-place and remains covered by the container build/tooling lane.

### 2026-06-17 - Lane 4

- Added `docs/runbooks/cywell-opslens-crc-live-handoff.md` as the next-day live CRC recovery and demo handoff.
- Captured the working mental model explicitly:
  - Windows remains the development workspace.
  - MacBook CRC remains the target OCP.
  - OperatorHub install creates the Operator.
  - `OpsLensInstallation` applies the product resources.
- Documented the `18443` Lightspeed tunnel, `19443` dashboard access, the CRC catalog/image signal, and the CRC lightweight profile.
- Named the known live failure classes so tomorrow's work starts from cause-level checks instead of repeated waiting:
  - stale catalog/subscription image
  - package server cache
  - pgvector SCC/permission issue
  - vLLM image pull gap
  - wrong local tunnel port
  - TLS dashboard URL mismatch

### 2026-06-17 - Lane 5

- Refreshed the non-mutating local evidence gates after the CRC handoff update.
- Passed:
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
  - `npm run verify:operator:reconcile`
  - `npm run verify:operator:runtime`
  - `npm run verify:operator`
  - `npm run verify:install-plan`
  - `npm run verify:pre-cluster-install`
- Current install readiness is intentionally not green:
  - `verify:install-plan` passed with warnings because several source evidence files are stale for current head and Lightspeed readiness still reports a known live gap.
  - `verify:pre-cluster-install` returned `BLOCKED_BY_EVIDENCE_GAPS`, `safeToRunClusterInstall=false`, strict mode blocked by stale/lacking evidence.
- Interpretation: continue local product hardening and live evidence refresh; do not pretend the remaining cluster-install gates are solved.

### 2026-06-17 - Lane 6

- Added assistant API route diagnostics so the chatbot surface no longer hides whether it is using local Vite proxy, a custom API base, or the ConsolePlugin UserToken proxy.
- The Assistant popover now shows:
  - route mode
  - action-plan endpoint
  - last API error when fallback is active
  - retry control for the API/bootstrap path
- Protected this behavior in `npm run verify:web-shell`.
- Passed:
  - `npm run -w @kugnus/web build`
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
- Browser verification on `http://127.0.0.1:5173/index.html` showed:
  - `apiStatus=API ready`
  - Assistant popover visible
  - `routeMode=local-vite-proxy`
  - `endpoint=/api/actions/plan`
  - retry button visible and enabled

### 2026-06-17 - Lane 7

- Removed the misleading fixed `prod-ocp / openshift-cluster-version` header context from the local web shell.
- The header context now distinguishes:
  - standalone CRC lab preview
  - ConsolePlugin hosted mode
  - local fixture/no company OCP mutation boundary
- Protected the behavior in `npm run verify:web-shell` so the old fixed prod OCP string cannot silently return.
- Passed:
  - `npm run -w @kugnus/web build`
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
- Browser verification on `http://127.0.0.1:5173/index.html` showed:
  - `primary=CRC lab 미리보기`
  - `secondary=로컬 fixture 시나리오 / 회사 OCP mutation 없음`
  - `hasOldProdContext=false`

### 2026-06-17 - Lane 8

- Hardened the visible shell controls so the UI has stable, testable action contracts instead of ambiguous clickable chrome.
- Added stable test ids for:
  - nav collapse toggle
  - masthead app launcher, notifications, create, and help actions
  - language toggles
  - evidence view tabs and evidence Ask buttons
  - Assistant draft, Ask, Retry API, Close, and request id
- Extended `npm run verify:web-shell` to assert the action contracts for navigation, utility actions, evidence tabs, and Assistant Enter handling.
- Passed:
  - `npm run -w @kugnus/web build`
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
- Browser verification on `http://127.0.0.1:5173/index.html` showed:
  - nav collapse changed `navCollapsed=false -> true`
  - Logs nav activated `console-nav-logs` and showed the log viewport
  - YAML evidence tab showed the YAML textarea
  - Workloads nav activated `console-nav-workloads` and preset `deployments pods replicasets`
  - Create utility opened the Assistant in plan-only mode
  - Enter in the Assistant draft changed the request id to a new `plan-*` value through `local-vite-proxy`

### 2026-06-17 - Lane 9

- Tightened the CRC lightweight install contract after the live CRC session exposed repeated `vLLM ImagePullBackOff` and pgvector permission friction.
- Confirmed the Go controller and TS dry-run builder already skip external runtime resources when:
  - `vectorStore.provider=inmemory`
  - `modelRuntime.provider=mock-local`
- Fixed the remaining schema/sample mismatch:
  - `modelRuntime.replicas` now accepts `0` in config and bundle CRDs.
  - the CRC lightweight sample declares `modelRuntime.replicas: 0`.
  - `verify:operator:package` now enforces the schema and sample contract.
- Added `verify:operator:package` as an alias for the operator package verifier so the package gate has an obvious command name.
- Passed:
  - `npm run verify:operator:package` - 0 fail, 1 expected live-runtime warning, 134 checks
  - `npm run verify:operator:reconcile` - 0 fail, 23 checks
  - `npm run verify:operator:runtime` - 0 fail, 77 checks
- Remaining boundary: this is repo/local evidence only; live CRC OLM reinstall still requires a newly built/pushed bundle/catalog image.

### 2026-06-17 - Lane 10

- Fixed the CRC catalog/image handoff contract that caused repeated stale-install confusion during the live Mac CRC session.
- The CRC dev catalog generator now defaults to:
  - CSV `cywell-opslens-operator.v0.1.2`
  - image tag `v0.1.2-dev-crc`
  - versioned local tags before tar export and registry push
- The lab image-map verifier now rejects the ambiguous live-cluster `:verify` target tag and emits versioned tag/save/push commands.
- The CRC lightweight sample now uses `v0.1.2-dev-crc` API/dashboard images to match `spec.version: 0.1.2-dev`.
- Updated the CRC live and morning handoffs so the first expected package signal is `currentCSV: cywell-opslens-operator.v0.1.2` plus `v0.1.2-dev-crc`.
- Interpretation after Lane 26: `:verify` is treated only as the legacy local CRC source tag. New local Docker build evidence uses `:build-verify`, and anything copied to or pulled by CRC must use the explicit branch tag.

### 2026-06-17 - Lane 11

- Added Mac CRC architecture protection after Windows Docker rebuilt local images as `amd64`.
- The CRC handoff verifiers now default to `targetArchitecture=arm64` and fail if local owned images are not arm64.
- Rebuilt the five CRC handoff images with `docker buildx --platform linux/arm64 --load`.
- Recreated `test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar`.
- Verified the tar contains five `v0.1.2-dev-crc` tags and that local image inspect reports `ARCH=arm64 OS=linux`.
- Interpretation: version tag alone is not enough; Mac CRC transfer artifacts must also prove architecture.
- Committed and pushed: `3942a6a Enforce CRC arm64 handoff`.

### 2026-06-17 - Lane 12

- Refreshed the plan and morning handoff after the arm64/tag hardening commits.
- Current reusable artifact for Mac CRC is:
  - `test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar`
- Latest local non-mutating gates:
  - `npm run verify:web-shell` - PASS, 0 fail, 9 checks
  - `npm run verify:console-plugin` - PASS, 0 fail, 9 checks
  - `npm run verify:lab-image-map` - 0 fail, expected external runtime warnings
  - `npm run verify:lab-bootstrap` - 0 fail, expected evidence freshness warnings
  - `npm run verify:lab-handoff` - 0 fail, live evidence freshness warnings remain
- Overnight execution should now continue with product hardening, not another unversioned install attempt.

### 2026-06-17 - Lane 13

- Added `scripts/run-dev012-overnight-checkpoint.mjs` as a local non-mutating checkpoint runner.
- Added npm aliases:
  - `npm run overnight:checkpoint`
  - `npm run overnight:loop`
- The runner executes the safe local gates only:
  - web shell
  - ConsolePlugin assets
  - operator package/reconcile/runtime
  - CRC lab image map/bootstrap/handoff
- It writes JSON and Markdown evidence under `test-results/` and stops on the first failed gate.

### 2026-06-17 - Lane 14

- Polished the customer-facing Korean shell copy so the standalone/CRC status area no longer exposes developer-only terms like fixture, mutation, or shell in Korean mode.
- Protected the copy with `npm run verify:web-shell`.
- Browser DOM verification on `http://127.0.0.1:5173/index.html` showed:
  - `contextPrimary=CRC 실습 환경 미리보기`
  - `runtimeSurface=독립 미리보기`
  - old Korean `fixture/shell` strings absent
- Passed:
  - `npm run -w @kugnus/web build`
  - `npm run verify:web-shell`
  - `npm run verify:console-plugin`
  - `npm run overnight:checkpoint`

### 2026-06-17 - Lane 15

- Added a masthead install flow strip to make the demo distinction explicit:
  - `OperatorHub: 오퍼레이터`
  - `OpsLensInstallation: 제품 적용`
  - `ConsolePlugin: 콘솔 라우트`
- Protected it in `npm run verify:web-shell`.
- Browser DOM verification confirmed the strip renders in Korean mode.
- Interpretation: the UI now answers the repeated confusion directly: OperatorHub installs the Operator, `OpsLensInstallation` applies the product, and ConsolePlugin provides the console route/proxy surface.

### 2026-06-17 - Lane 16

- Localized the OCP Coverage Matrix into the shared KO/EN shell language flow.
- `OcpCoverageMatrix` now receives `language` from the app shell and owns bilingual copy for:
  - title and eyebrow
  - refresh/full-scan/export controls
  - probe summary and totals
  - table headers
  - coverage diagnostic panel
- Protected the coverage matrix language contract in `npm run verify:web-shell`.
- Browser DOM verification in KO mode showed:
  - `OCP 읽기 범위 매트릭스`
  - `새로고침`
  - `전체 스캔`
  - `범위 진단`
  - no `OCP Coverage Matrix` or `Refresh` text in the coverage section.

### 2026-06-17 - Lane 17

- Polished the OCP Resource Explorer Korean surface after the Coverage Matrix localization.
- Replaced remaining customer-visible developer English in KO mode, including:
  - `Live OpenShift API` -> `실시간 OpenShift API`
  - `fallback` -> `대체 응답`
  - `Owner References` -> `소유자 참조`
  - `Owned Children` -> `소유 하위 리소스`
  - RBAC status suffixes -> `허용`, `확인 불가`, `거부`, `대기 중`
- Protected the Resource Explorer localization contract in `npm run verify:web-shell`.
- Browser DOM verification in KO mode showed:
  - `실시간 OpenShift API`
  - `변경 동작 없음`
  - `RBAC 대기 중`
  - `소유자와 하위 리소스`
  - no `fallback` or `Owner References` text in the visible explorer section.

### 2026-06-17 - Lane 18

- Polished the customer-facing KO surface for the primary dashboard, evidence pane, console overview, and Assistant status fields.
- Replaced visible mixed-language labels in KO mode, including:
  - `콘솔형 live overview` -> `콘솔형 실시간 개요`
  - `live OCP` -> `실제 OCP 연결`
  - `활성 incident queue` -> `활성 장애 대기열`
  - `컨텍스트 발행 payload` -> `컨텍스트 발행 데이터`
  - `assistant 닫기` -> `어시스턴트 닫기`
  - `fallback/loading/actionMode/high/medium/low/trustLevel` status chips -> localized display labels where they are UI labels rather than raw evidence.
  - Assistant context chip labels and evidence types such as `Cluster`, `Namespace`, `official-doc`, and `internal-runbook` -> localized display labels while preserving the source values.
- Protected the copy in `npm run verify:web-shell`.
- Browser DOM verification in KO mode showed:
  - `콘솔형 실시간 개요`
  - `활성 장애 대기열`
  - `컨텍스트 발행 데이터`
  - no `콘솔형 live overview`, `활성 incident queue`, or `컨텍스트 발행 payload` in the visible primary shell.
- Remaining gap: backend evidence payloads can still contain English diagnostic phrases such as `previous pod logs`. Those are evidence content, not static shell labels; a later lane should add a reviewed evidence-text display dictionary rather than hiding raw evidence.

### 2026-06-17 - Lane 19

- Polished the Assistant answer body in KO mode so the customer no longer sees a Korean shell wrapped around the English demo triage answer.
- Added a reviewed Assistant display dictionary for known static answer text while preserving source evidence values for unknown/live payloads.
- Localized the visible demo context values:
  - `prod-ocp` -> `CRC 미리보기`
  - `Alerts` -> `경고`
  - `3 evidence items` -> `근거 3건`
  - `source=platform, state=firing` -> `source=platform, state=발생 중`
- Localized known demo answer sections, including:
  - current judgment
  - inspected evidence labels
  - candidate cause labels and reasons
  - plan steps
  - rollback path
  - risks
  - missing evidence
  - citations
- Protected the Assistant answer display contract in `npm run verify:web-shell`.
- Remaining gap: live backend evidence can still contain English diagnostic phrases. That remains intentional until a reviewed evidence-text dictionary is added for live payload classes; raw evidence should not be silently rewritten without traceability.

### 2026-06-17 - Lane 20

- Added an Assistant connection decision card so the chat surface explains whether it is using the configured OpsLens API route, still checking, or showing the local plan-only fallback.
- The fallback copy now says plainly that OpsLens is not pretending live AI is connected when the API route does not answer.
- Added customer-facing route mode labels for:
  - local Vite proxy
  - custom API base
  - ConsolePlugin UserToken proxy
  - server render
- Localized the masthead API status chip so KO mode shows `API 연결 확인 중`, `API 연결됨`, or `API 로컬 대체 응답` instead of raw `API loading/ready/fallback`.
- Protected the connection decision card and localized API chip contract in `npm run verify:web-shell`.

### 2026-06-18 - Lane 21

- Polished the OpsLens Admin Lightspeed/MCP card so customer-visible KO mode no longer leads with developer log fragments like `readOnly=`, `routing=`, `responses=`, or `mutationAllowed=`.
- Added shared display helpers for:
  - status values such as `needs-evidence`, `ready`, and `live-ready`
  - boolean values such as redaction and mutation permission
  - action modes such as `readOnly`, `planOnly`, and `ValidateOnly`
- The Lightspeed section now uses explicit labels for routing score, response score, read-only tools, selected tool, redaction, mutation boundary, live readiness, network, template readiness, and next command.
- Raw evidence values such as tool names, endpoint paths, head SHA, and next command remain visible because they are operational evidence, not UI chrome.
- Protected the localized Lightspeed/MCP admin contract in `npm run verify:web-shell`.

### 2026-06-18 - Lane 22

- Added customer-facing Assistant API error interpretation next to the raw `lastApiError`.
- The raw error remains visible as evidence, while KO/EN mode now explains whether the likely class is:
  - disconnected API route, port-forward, or ConsolePlugin proxy
  - route exists but endpoint is missing
  - token/RBAC rejection
  - API service-side failure
- Protected the interpretation label and common port-forward/proxy failure copy in `npm run verify:web-shell`.

### 2026-06-18 - Lane 23

- Closed the OperatorHub example gap that caused CRC users to create the heavyweight runtime path from the console.
- Added a second `alm-examples` entry for the CRC lightweight `OpsLensInstallation` profile:
  - `vectorStore.provider=inmemory`
  - `modelRuntime.provider=mock-local`
  - `modelRuntime.replicas=0`
  - `lightspeedRegistration.mode=ValidateOnly`
  - internal CRC API/dashboard image tags
- Kept the approved-install example explicit with pgvector, vLLM, and `PatchOLSConfig` so production-facing behavior is still visible but not the only path.
- Extended `npm run verify:operator` so the bundle fails if OperatorHub no longer exposes the CRC-safe example.

### 2026-06-18 - Lane 24

- Added an Assistant connection mode matrix so the chat surface now names:
  - answer source: live OpsLens API route versus local plan-only fallback
  - token path: OpenShift UserToken proxy versus local dev proxy/tunnel
  - mutation boundary: cluster changes are not executed from chat
- Localized the mode matrix in KO/EN, including `답변 출처`, `토큰 경로`, and `클러스터 변경`.
- Extended the AC-UI-004 Playwright path so language switching verifies the Assistant mode matrix alongside masthead, install flow, navigation, and Ask button labels.
- Protected the mode matrix contract in `npm run verify:web-shell`.
- Verified:
  - `npm run verify:web-shell`
  - `npm run -w @kugnus/web build`
  - `npx playwright test -g "AC-UI-004"`

### 2026-06-18 - Lane 25

- Fixed the live controller-runtime status path so `OpsLensInstallation` no longer reports `Ready` immediately after resource creation.
- The Go controller now observes required workload status before setting the CR phase:
  - API Deployment readiness and availability
  - dashboard Deployment readiness and availability
  - pgvector StatefulSet readiness when `vectorStore.provider=pgvector`
  - vLLM Deployment readiness and availability when `modelRuntime.provider` is not `mock-local`
- CRC lightweight profiles keep `vectorStore.provider=inmemory` and `modelRuntime.provider=mock-local` as intentionally local-only components, so they do not wait on absent pgvector/vLLM pods.
- Added a `WorkloadsAvailable` condition and component status map. Missing or unready required workloads keep the CR in `Installing`; all required workloads available moves it to `Ready`.
- Protected this no-false-Ready behavior in `npm run verify:operator:runtime`.
- Verified the Go source by building the local operator image through `npm run verify:images:build`.
- `verify:images:build` temporarily overwrote local `:verify` tags with Windows/amd64 images, so the CRC lab `:verify` tags were restored from the pinned `v0.1.2-dev-crc` arm64 images before rerunning `npm run verify:lab-image-map`.

### 2026-06-18 - Lane 26

- Removed the repeat footgun where `npm run verify:images:build` could overwrite CRC lab `:verify` tags with workstation-built amd64 images.
- `verify:images:build` now writes local build evidence to `cywell/opslens-*:build-verify`.
- The image build evidence artifact records `localBuildTagSuffix=build-verify`.
- CRC handoff remains pinned to explicit `v0.1.2-dev-crc` images; build verification no longer mutates those lab tags.
- Expected result: running the Go/API/dashboard/bundle build gate can no longer break `npm run verify:lab-image-map` by changing local CRC image architecture.

### 2026-06-18 - Lane 27

- Polished the OCP Coverage Matrix so KO mode no longer shows raw enum chips such as `policy-blocked`, `not-probed`, `conversion-webhook-error`, or `all-namespaces`.
- Added language-specific display maps for list status, detail status, gap type, and scope.
- Preserved raw API/evidence messages in titles and evidence cells so diagnostic traceability is not hidden.
- Protected the display-map contract in `npm run verify:web-shell`.

### 2026-06-18 - Lane 28

- Removed a remaining mixed-language fallback chip in the OCP Resource Explorer detail panel.
- The detail fallback now uses language-owned transition copy instead of hardcoded `to`.
- `npm run verify:web-shell` now rejects the old `requestedApiVersion} to` pattern.

### 2026-06-18 - Lane 29

- Localized OCP Coverage Diagnostic finding status chips for KO mode.
- The UI now renders `정상`, `주의`, `위험`, `근거 없음`, `건너뜀`, and `오류` instead of raw `ok`, `warning`, `critical`, `missing`, `skipped`, or `error` chips.
- Raw diagnostic labels, messages, and evidence remain intact for traceability.
- `npm run verify:web-shell` protects the diagnostic status display-map contract.

### 2026-06-18 - Lane 30

- Polished OpsLens Admin summary cards so KO mode no longer shows customer-facing raw labels like `Remaining`, `gap=...`, `assistantMutationAllowed=...`, `Local Inspect`, or `Remaining Evidence` in the completion, live handoff, and owned-image provenance summaries.
- Kept raw evidence values available where they are operational evidence, including command IDs, head SHAs, image names, and original live gap classifications.
- Extended shared display helpers for common live classification values such as `api-ready`, `auth-or-rbac`, `token-missing`, `tls-handshake-failed`, `tcp-timeout`, and `dns-unresolved`.
- Added a dedicated `localized admin summary labels` gate to `npm run verify:web-shell`.

### 2026-06-18 - Lane 31

- Polished the OpsLens Admin install-readiness grid so KO mode no longer renders hardcoded English section keys such as `Install Readiness`, `Image Builds`, `Owned Provenance`, or `Auth/RBAC Plan`.
- Replaced the English-keyed `Object.entries` map with stable item IDs plus language-owned labels.
- The grid now runs readiness values through `statusText`, while preserving the raw status value in the element title and in the freshness class decision.
- `npm run verify:web-shell` now includes a `localized install readiness grid` gate to reject the old English-keyed grid.

### 2026-06-18 - Lane 32

- Polished the OpsLens Admin AI Ops and Alertmanager summaries so KO mode no longer exposes raw UI labels like `Monitoring Proxy`, `accepted=`, `rawAlertReturned=`, `missingQueries=`, `Live Smoke`, or `Selected Pod`.
- Added language-owned labels for incident metrics, monitoring proxy state, accepted alerts, raw alert return, vector write attempts, ingestion job creation, trigger evidence, and metric sample counts.
- Kept ticket IDs, command IDs, owner IDs, and artifact type values visible as operational evidence.
- `npm run verify:web-shell` now includes a `localized aiops intake labels` gate for these customer-facing summaries.

### 2026-06-18 - Lane 33

- Polished the remediation proposal cards under incident metrics so KO mode no longer exposes raw labels like `Mode`, `Patch`, `Current`, `Proposed`, `reviewGate=`, `targetConfidence=`, `logs=`, `events=`, `metrics=`, or `runbooks=`.
- Added language-owned labels for patch, current value, proposed value, review gate, target confidence, logs, events, metrics, and runbooks.
- The cards still preserve target kind/name, field path, YAML patch, metric query names, and operational values as evidence.
- `npm run verify:web-shell` now includes a `localized remediation proposal labels` gate.

### 2026-06-18 - Lane 34

- Polished the Cywell OpsBrain panels so KO mode no longer shows raw guard labels such as `fineTuningRequired=`, `actionMode=`, `write=`, `mutationAllowed=`, `golden=`, `next=`, `groundedTarget=`, `routingPlanned=`, `rawMemoryWrite=`, `fineTuning=`, or `nightlyLoop=`.
- Added language-owned labels for fine-tuning requirement, memory write policy, golden set, next implementation, governance targets, routing plan, external provider default, memory write guards, and self-improvement controls.
- Status chips now use the same display helper as the rest of the Admin dashboard while preserving raw implementation IDs and evidence strings where they matter.
- `npm run verify:web-shell` now includes a `localized opsbrain guard labels` gate.

### 2026-06-18 - Lane 35

- Polished the RAG production readiness and approval queue panels so KO mode no longer exposes raw labels such as `contractReady=`, `queueLive=`, `workerLive=`, `vectorAudit=`, `rawMarkdown=`, `auditAppendOnly=`, `queueMetadataWrite=`, or `approved=`.
- Production first-action rows now use language-owned labels for next command, mutation boundary, and approval requirement while keeping action IDs, owner IDs, and command IDs visible as evidence.
- Approval queue inventory and ingestion-plan rows now use language-owned labels for approvals, read-only command boundaries, vector-write policy, metadata writes, and ingestion-job creation.
- `npm run verify:web-shell` now includes a `localized rag production labels` gate.

### 2026-06-18 - Lane 36

- Hardened the overnight checkpoint runner evidence so each run now stamps start and finish Git state, not only the command output.
- JSON and Markdown checkpoint evidence now includes:
  - branch
  - head
  - start worktree dirty flag and dirty entry count
  - finish worktree dirty flag and dirty entry count
  - truncated dirty entry list when present
- The runner prints the same Git start/finish summary to the loop log so an unattended session can be audited without opening the JSON first.
- This closes the ambiguity where a checkpoint could be green while the only dirty-state proof was buried inside the `git-status` step stdout.

### 2026-06-18 - Lane 37

- Polished the Runtime readiness and live handoff cards so KO mode no longer exposes raw labels such as `pgvector=`, `vllm=`, `liveProbe=`, `runtimeOwner=`, `dataOwner=`, `writesLocalEvidence=`, or `mutationAllowedByThisVerifier=`.
- Runtime summary labels such as ready count, memory, and status now use the same language-owned copy as the rest of the Admin dashboard.
- Runtime handoff actions and ticket rows now use language-owned labels for owner, priority, next command, read-only commands, approval requirement, mutation boundary, and live probe approval.
- `statusText` now normalizes underscore status values before lookup, so evidence statuses like `NEEDS_CURRENT_EVIDENCE` can render as customer-facing labels while raw evidence remains available elsewhere.
- `npm run verify:web-shell` now includes a `localized runtime handoff labels` gate.

### 2026-06-18 - Lane 38

- Polished the AI Ops monitoring proxy handoff rows so KO mode no longer exposes raw labels such as `owner=`, `mutationAllowedByThisVerifier=`, plain next-command text, or `command.id:mutation=true/false`.
- Monitoring proxy handoff now uses language-owned labels for owner, mutation boundary, next command, and read-only command mutation status while preserving command IDs and ticket IDs as evidence.
- `npm run verify:web-shell` now includes a `localized monitoring proxy handoff labels` gate.

### 2026-06-18 - Lane 39

- Polished the OCP connectivity and network handoff cards, the same surfaces that explain CRC/OCP auth, Kubeconfig, RBAC, network, and registry handoff state.
- KO mode no longer exposes raw labels such as `context=`, `auth=`, `server=`, `kubeconfigEnv=`, `humanApproval=`, `rbacAccessReviews=missing`, `mutation=false`, `classification=...`, `first=...`, `approval=...`, `fresh=true`, or `required=true` in those panels.
- The UI still preserves diagnostic values, command IDs, ticket IDs, owner IDs, and file names as evidence.
- `npm run verify:web-shell` now includes a `localized ocp network handoff labels` gate so these install/troubleshooting cards do not regress while the user is away.

### 2026-06-18 - Lane 40

- Polished the Auth/RBAC plan and network handoff API fallback cards, which explain whether the Operator reader, ClusterRole, Kubeconfig context, and approval-gated commands are safe to use.
- KO mode no longer exposes raw labels such as `cases=`, `failedChecks=`, `OCP Auth/RBAC Plan`, `classification=`, `Namespace`, `Reader`, `Policy`, `readOnly=true`, `secrets=false`, `context=`, `auth=`, `server=`, `kubeconfigEnv=`, `defaultKubeconfig=`, `requiresApproval=`, or `mutationAllowed=` in those panels.
- The UI still preserves service account names, ClusterRole names, ticket IDs, command IDs, and evidence status values for auditability.
- `npm run verify:web-shell` now includes a `localized auth rbac plan labels` gate.

### 2026-06-18 - Lane 41

- Polished the live handoff post-approval smoke card, the surface that explains whether the CRC/OCP apply path has enough RBAC, Lightspeed, and source-artifact evidence after approval.
- KO mode no longer exposes raw labels such as `classification=`, `rbac=`, `unknown=`, `lightspeedClassification=`, `lightspeedAuthReady=`, `sources=...fresh=`, `Read-only Commands`, `Action Hints`, `Post-approval Smoke`, or `Forbidden` in that card.
- The UI still preserves command IDs, evidence artifact IDs, RBAC count ratios, and smoke command names.
- `npm run verify:web-shell` now includes a `localized live handoff smoke labels` gate.

### 2026-06-18 - Lane 42

- Polished the completion gate card, the surface that explains whether OpsLens can honestly claim 100% completion.
- KO mode no longer exposes raw labels such as `head=`, `dirty=`, `readyToClaim100=`, `mutationBoundaryPassed=`, `next=`, `external=`, `tickets=`, `readOnly=`, `setup=`, `approval=`, `owner=`, `status=`, `exists=`, `sources=`, `failedSources=`, `criticalPath=`, `cleanupDeletionAllowed=`, `bundleStatus=`, `publishReady=`, `installReady=`, `actionQueueReady=`, or `unsafeTickets=` in that card.
- The UI still preserves head SHA, gate IDs, owner IDs, command IDs, packet filenames, RBAC-style count values, and unsafe ticket IDs as evidence.
- `npm run verify:web-shell` now includes a `localized completion gate labels` gate.

### 2026-06-18 - Lane 43

- Polished the roadmap completion card, the surface that answers "what percent is complete and what remains?"
- KO mode no longer exposes raw labels such as `head=`, `dirty=`, `mutationBoundaryPassed=`, `externalState=`, `localOnly=`, `externalGates=`, `localGates=`, `next=`, `external=`, `tickets=`, `readOnly=`, `setup=`, or `approval=` in that card.
- The UI still preserves head SHA, gate IDs, owner IDs, command IDs, ticket IDs, and critical-path action IDs as evidence.
- `npm run verify:web-shell` now includes a `localized roadmap completion labels` gate.

### 2026-06-18 - Lane 44

- Polished the pre-cluster install gate, the surface that explains whether cluster install is safe to run.
- KO mode no longer exposes raw labels such as `safeToRunClusterInstall=`, `strictExitWouldFail=`, `Failed Gates`, `First Blocker`, `external=`, `local=`, `live=`, `prep=`, `failed=`, `firstBlocked=`, `remainingExternalState=`, `staleExternal=`, `directLive=`, `localPrep=`, `planStrict=`, `sources=`, `readOnly=`, `approvalNotRun=`, `status=`, `firstLane=`, or `mutationAllowed=` in that card.
- The UI still preserves head SHA, gate IDs, owner IDs, command IDs, evidence source IDs, and approval-gated command IDs as evidence.
- `npm run verify:web-shell` now includes a `localized pre-cluster install gate labels` gate.

### 2026-06-18 - Lane 45

- Added a reviewed Assistant phrase dictionary for live/backend evidence text so KO mode can explain common diagnostic fragments without rewriting raw answer data.
- The display path now handles repeated phrase classes such as `previous pod logs`, `pod logs`, `no pod candidate was available`, `no label selector`, `logs read for last`, `events listed for`, `Forbidden`, `Unauthorized`, `connection refused`, `timed out`, `missing evidence`, `read-only`, and `plan-only`.
- Exact reviewed answer translations still win first; phrase replacement only applies when the live answer text has no exact display translation.
- `npm run verify:web-shell` now includes a `localized dynamic assistant evidence phrases` gate.

### 2026-06-18 - Lane 46

- Added a visible masthead mod-boundary strip so demo users do not need to discover critical scope information through tooltips.
- The KO/EN shell now states that OpsLens adds route/API/MCP surfaces while native OpenShift chrome and the Lightspeed drawer remain OpenShift-owned.
- This directly guards against the "installing OpsLens rewrites the entire OpenShift console" misunderstanding while keeping the ConsolePlugin route/proxy value clear.
- `npm run verify:web-shell` now includes a `visible OpsLens mod boundary` gate, and `AC-UI-004` checks the KO/EN mod-boundary copy in the browser.

### 2026-06-18 - Lane 47

- Added a visible runtime profile strip so the CRC demo path does not look like a failed production pgvector/vLLM install.
- The KO/EN shell now separates `CRC demo uses in-memory RAG + mock model` from `Approved install requires pgvector/vLLM evidence`.
- This keeps the pgvector/vLLM gap honest while making the demo-safe runtime profile visible without opening docs.
- `npm run verify:web-shell` now includes a `visible runtime profile boundary` gate, and `AC-UI-004` checks the KO/EN runtime profile copy in the browser.

### 2026-06-18 - Lane 48

- Added a visible certification boundary strip so local CRC demo builds are not mistaken for Red Hat Partner or OperatorHub submission readiness.
- The KO/EN shell now separates `Local demo build`, `No Partner/OperatorHub submission`, and `Certified readiness needs security/release evidence`.
- This keeps the final release/certification gap honest on the first viewport while preserving the value of the local OperatorHub and ConsolePlugin demo.
- `npm run verify:web-shell` now includes a `visible certification boundary` gate, and `AC-UI-004` checks the KO/EN certification boundary copy in the browser.

### 2026-06-18 - Lane 49

- Added a visible Assistant integration contract so the chatbot surface does not look broken when viewed as a standalone preview.
- The KO/EN Assistant now separates standalone preview behavior, installed ConsolePlugin UserToken proxy behavior, and the native OpenShift Lightspeed drawer boundary.
- This directly addresses the "why does our chatbot not behave like the OpenShift Lightspeed drawer?" demo risk without claiming native drawer rebranding.
- `npm run verify:web-shell` now includes an `assistant integration contract` gate, and `AC-UI-004` checks the KO/EN integration contract in the browser.

### 2026-06-18 - Lane 50

- Added a visible demo handoff checklist so the return path is on the first viewport instead of buried in the runbook.
- The KO/EN masthead now names the next non-mutating return steps: reconnect Mac CRC, open the ConsolePlugin route, and run read-only smoke.
- This makes the overnight loop useful when the operator returns after a long gap and needs a safe first screen for demo recovery.
- `npm run verify:web-shell` now includes a `visible demo handoff checklist` gate, and `AC-UI-004` checks the KO/EN handoff checklist in the browser.

### 2026-06-18 - Lane 51

- Polished the first-viewport readiness command strip so KO mode no longer shows raw fragments such as `needs-evidence`, `남음=`, `다음=`, or `cmd=`.
- The strip now uses language-owned labels for completion status, passed requirements, remaining items, next gate, and next check while preserving gate IDs and command strings as evidence.
- `npm run verify:web-shell` now includes a `localized readiness command strip` gate, and `AC-UI-004` checks the KO/EN readiness strip in the browser.

### 2026-06-18 - Lane 52

- Added a visible demo access path strip so the first viewport explains which surface owns each route after install.
- The KO/EN masthead now separates installed Console route access, dashboard HTTPS port-forward access on 19443, and Assistant/API proxy mode.
- This directly addresses the repeated `http://127.0.0.1:19443` versus `https://...` and standalone-versus-installed access confusion without touching live CRC.
- `npm run verify:web-shell` now includes a `visible demo access path` gate, and `AC-UI-004` checks the KO/EN access path labels in the browser.

### 2026-06-18 - Lane 53

- Added a visible CRC install signal strip so the first viewport tells the operator what to check after OperatorHub install and `OpsLensInstallation` apply.
- The KO/EN masthead now keeps the exact read-only check command, the expected CRC `API/dashboard 1/1` signal, and the stale-catalog symptom visible.
- This directly addresses the repeated install loop where an old `quay.io` operator image or stale CatalogSource looked like waiting, not a wrong package/image path.
- `npm run verify:web-shell` now includes a `visible CRC install signal` gate, and `AC-UI-004` checks the KO/EN install signal labels in the browser.

### 2026-06-18 - Lane 54

- Added a visible post-install smoke path strip so the first viewport tells the operator what to prove after install is apparently healthy.
- The KO/EN masthead now separates the three smoke signals: open the ConsolePlugin route, ask KOMSCO AI Assistant, and keep OLSConfig in `ValidateOnly`.
- This directly addresses the demo risk that “installed” gets mistaken for “fully integrated and patched Lightspeed,” while still preserving the read-only/approval boundary.
- `npm run verify:web-shell` now includes a `visible post-install smoke path` gate, and `AC-UI-004` checks the KO/EN smoke labels in the browser.

### 2026-06-18 - Lane 55

- Added a visible Assistant ask execution path inside the prompt area.
- The KO/EN Assistant now names what happens when the operator presses Enter, what stays local when the API route falls back, and how Shift+Enter creates a newline.
- This directly addresses the demo risk that the chat surface looks inert or mysterious when the API route is unavailable or running through the ConsolePlugin proxy.
- `npm run verify:web-shell` now includes an `assistant ask execution path` gate, and `AC-UI-004` checks the KO/EN execution path labels in the browser.

### 2026-06-18 - Lane 56

- Moved the CRC lightweight `alm-examples` entry ahead of the approved pgvector/vLLM example in the Operator CSV.
- `npm run verify:operator` now fails if the first OperatorHub CR example is not the `crc-lightweight` profile.
- This turns the repeated CRC install failure class into a package contract: local demos default to in-memory RAG, mock-local model runtime, and `ValidateOnly`; approved installs still keep the explicit pgvector/vLLM/PatchOLSConfig example.

### 2026-06-18 - Lane 57

- Added a `relatedImages` ordering gate to `npm run verify:operator`.
- The CSV must now list owned images first: `operator`, `api`, `dashboard`; external runtime images such as vLLM and pgvector remain declared but cannot become the first package signal.
- This guards the CRC install diagnosis path where a pgvector-first related image looked like stale package evidence.

### 2026-06-18 - Lane 58

- Added a first-viewport CRC install profile signal to the web shell.
- The KO/EN masthead now tells the operator to use the `CRC lightweight` example first, before the `oc get opslensinstallation,deploy,pod,svc` readiness check.
- `npm run verify:web-shell` and `AC-UI-004` now check this copy so the UI stays aligned with the OperatorHub package contract.

### 2026-06-18 - Lane 59

- Added `npm run verify:crc-demo-readiness`.
- The new local-only verifier ties together the first OperatorHub `alm-examples` entry, CRC lightweight sample, owned-image-first relatedImages, UI first-choice copy, handoff commands, and the arm64 CRC transfer tar.
- Added this verifier to `npm run overnight:checkpoint`, so the 10-hour loop now checks the actual return-to-CRC demo path instead of only the broader lab/bootstrap packets.

### 2026-06-18 - Lane 60

- `npm run verify:crc-demo-readiness` now writes a human-readable Markdown summary next to the JSON evidence.
- The Markdown output captures the local-only boundary, package signals, transfer artifact size, and each pass/warn/fail check for morning review without opening raw JSON.

### 2026-06-18 - Lane 61

- Added `npm run verify:crc-demo-readiness` to the official AC-LAB-001 acceptance chain.
- The acceptance document now requires the CRC lightweight OperatorHub default, lightweight sample, owned-image-first relatedImages, KO/EN UI signal, lightweight apply/read-only smoke handoff, arm64 transfer tar, and local-only mutation boundary before a return-to-CRC demo is called ready.

### 2026-06-18 - Lane 62

- Polished the KOMSCO shell identity after the live UI review.
- KO mode now uses `KOMSCO AI 어시스턴트` inside the assistant popover and accessibility label instead of mixing in English.
- The masthead user menu now shows `kubeadmin`, matching the OpenShift console demo identity and preserving top-right menu placement.
- `npm run verify:web-shell`, `npm run -w @kugnus/web build`, `npx playwright test -g "AC-UI-004"`, in-app browser DOM checks, and `npm run overnight:checkpoint` all passed.

### 2026-06-18 - Lane 63

- Added click-through Playwright coverage for masthead utility buttons and evidence actions.
- `AC-UI-005` now clicks nav collapse, app launcher, notifications, create, help, evidence logs/YAML/alerts tabs, and evidence Ask buttons.
- This protects the user-facing claim that shell controls are not dead buttons.
- `npm run verify:web-shell`, `npx playwright test -g "AC-UI-005"`, and `npm run overnight:checkpoint` passed.

### 2026-06-18 - Lane 64

- Clarified the assistant ready state.
- The ready badge now says `API connected / plan-only` and `API 연결됨 / 계획 전용`; local fallback copy remains reserved for disconnected/fallback mode.
- Updated `AC-CTX-001` to expect the current `API connected` chip and customer-facing `CRC preview` cluster chip while preserving raw payload checks.
- `npm run verify:web-shell`, `npx playwright test -g "AC-CTX-001"`, `npm run -w @kugnus/web build`, and `npm run overnight:checkpoint` passed.

### 2026-06-18 - Lane 65

- Added Korean left-navigation click-through coverage.
- `AC-UI-006` switches to KO and clicks overview, alerting, dashboards, metrics, logs, workloads, networking, storage, administration, OpsLens Admin, and OpsBrain.
- This protects the customer-facing claim that translated navigation is functional, not only translated text.
- `npm run verify:web-shell`, `npx playwright test -g "AC-UI-006"`, and `npm run overnight:checkpoint` passed.

### 2026-06-18 - Lane 66

- Clarified the CRC install readiness copy in the first viewport.
- The install signal now says `CRC ready = API/dashboard 1/1` and `CRC 준비 = API/대시보드 1/1`, so the local lightweight demo path is not confused with the approved pgvector/vLLM runtime path.
- `npm run verify:web-shell`, `npx playwright test -g "AC-UI-004"`, and `npm run -w @kugnus/web build` passed.

### 2026-06-18 - Lane 67

- Aligned the TypeScript reconcile dry-run status with the Go live controller readiness contract.
- Dry-run evidence now keeps `OpsLensInstallation` in `Installing` and marks API/dashboard/vector/model workload readiness as pending until the live controller observes the required workloads.
- The CRC lightweight profile still marks intentionally absent `inmemory` and `mock-local` runtime services as locally satisfied, while API/dashboard remain live-observed readiness signals.
- `npm run verify:operator:reconcile`, `npm run verify:operator:runtime`, and `npm run verify:operator` passed.

### 2026-06-18 - Lane 68

- Polished the deep release/action queue panels in OpsLens Admin.
- Release refresh, release bundle, owner packets, critical-path actions, source artifacts, and handoff rows now use KO/EN labels instead of raw `key=value` strings such as `unsafeTickets=`, `staleRemoved=`, `actionQueueActionGaps=`, `readOnly=`, `approval=`, `ticketFirst=`, or `diagnostics=`.
- Added a `verify:web-shell` gate so the release/action queue section cannot drift back to raw developer labels.
- `npm run -w @kugnus/web build` and `npm run verify:web-shell` passed.

### 2026-06-18 - Lane 69

- Polished the external runtime review packet in OpsLens Admin.
- Candidate handoff, final evidence handoff, registry tickets, reviewer actions, review commands, and packet status now use KO/EN labels instead of raw fragments such as `REVIEW_PACKET_READY`, `reviewPacketOnly`, `owner=`, `best=`, `critical=`, `finalEvidence=`, `approvalRequired=`, `registryPacket=`, or `not-run ... approval=`.
- Added a `verify:web-shell` gate so the external runtime review section cannot drift back to raw developer labels.

### 2026-06-18 - Lane 70

- Polished the security scan and review packet in OpsLens Admin.
- Scan CLI, image evidence, final review, first review actions, review tickets, runner evidence, and review drafts now use KO/EN labels instead of raw fragments such as `scan=`, `sbom=`, `review=`, `first=`, `approval=`, `finalEvidence=`, `reviewApproved=`, `digestPinned=`, `missingTargets=`, or `ready=`.
- Added a `verify:web-shell` gate so the security scan/review section cannot drift back to raw developer labels.

### 2026-06-18 - Lane 71

- Polished the certification readiness card in OpsLens Admin.
- Submission CLI, gate counts, tooling handoff, CI runner evidence, release manager packet, freshness policy, first submission actions, and certification gate counts now use KO/EN labels instead of raw fragments such as `head=`, `dirty=`, `registryMutationAttempted=`, `status=`, `required=`, `satisfiedBy=`, `writesLocalEvidence=`, `requiredHead=`, or `pass=`.
- Added a `verify:web-shell` gate so the certification readiness section cannot drift back to raw developer labels, while preserving command/action IDs such as `approval-gated-partner-connect-submit` as evidence identifiers.

### 2026-06-18 - Lane 72

- Polished the community submission card in OpsLens Admin.
- Submission draft mode, parity, external submission boundary, layout, parity entries, read-only checks, approval gates, and first submission actions now use KO/EN labels instead of raw fragments such as `head=`, `dirty=`, `parity=`, `externalSubmissionAttempted=`, `registryMutationAttempted=`, `mutationAllowedByThisVerifier=`, `:next=`, or `:approval=`.
- Added a `verify:web-shell` gate so the community submission section cannot drift back to raw developer labels, while preserving command/action IDs such as `approval-gated-community-operatorhub-pr` as evidence identifiers.

### 2026-06-18 - Lane 73

- Polished the external runtime plan card in OpsLens Admin.
- Runtime images, evidence templates, draft intake, mirror commands, and first plan actions now use KO/EN labels instead of raw fragments such as `registryMutationAttempted=`, `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `draft=`, `templates missing`, `drafts missing`, `:mutation=`, `:approval=`, or `:next=`.
- Added a `verify:web-shell` gate so the external runtime plan section cannot drift back to raw developer labels, while preserving runtime image and mirror command IDs as evidence identifiers.

### 2026-06-18 - Lane 74

- Polished the owned image provenance card in OpsLens Admin.
- The card now has an explicit KO/EN title and shows registry mutation, cluster mutation, verifier mutation allowance, required images, local inspect status, and remaining evidence with labels instead of raw fragments such as `mutationAllowedByThisVerifier=`.
- Added a `verify:web-shell` gate so the owned image provenance section cannot drift back to raw developer labels, while preserving image IDs and local inspect evidence.

### 2026-06-18 - Lane 75

- Polished the release publish plan card in OpsLens Admin.
- Release publish mode, approval roles, publish commands, first publish actions, release ticket, publish decision action, and release manager packet now use KO/EN labels instead of raw fragments such as `registryMutationAttempted=`, `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `:mutation=`, `:approval=`, `:secret=`, `packet=`, `exists=`, or `releasePublishExecuted=`.
- Added a `verify:web-shell` gate so the release publish plan section cannot drift back to raw developer labels, while preserving command/action IDs as evidence identifiers.

### 2026-06-18 - Lane 76

- Polished the catalog toolchain and CRC lab readiness cards in OpsLens Admin.
- Catalog registry auth/readability, next action, handoff, CLI, read-only/setup/local artifact commands, lab bootstrap/handoff status, lab tier, image map, portable tar, handoff sources, and workstation/transfer/lab host role plans now use KO/EN labels instead of raw fragments such as `registryAuthConfigured=`, `registryBaseReadable=`, `registryMutationAttempted=`, `clusterMutationAttempted=`, `head=`, `dirty=`, `blocking=`, `exists=`, `missingTags=`, `bootstrapWorkstation=`, `:ready=`, `:first=`, or `companyOcpUsed=`.
- Added KO/EN status/action-mode mappings for `toolchainPlanOnly`, `localEvidenceOnly`, `NEEDS_LOCAL_ARTIFACTS`, `NEEDS_CURRENT_EVIDENCE`, `NEEDS_CAPACITY_REVIEW`, and `external-runtime-review-required`.
- Added `verify:web-shell` gates so the catalog and lab readiness sections cannot drift back to raw developer labels.

### 2026-06-18 - Lane 77

- Polished the install approval plan card in OpsLens Admin.
- Install plan, mutating commands, Lightspeed registration, approval ticket, cluster-admin packet, install decision, and RAG ingestion approval rows now use KO/EN labels instead of raw fragments such as `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `jobCreated=`, `mode=`, `willPatch=`, `legacyConfigMapMutationAttempted=`, `:mutation=`, `:approval=`, `packet=`, `exists=`, `installExecuted=`, `queueEvidence=`, or `vectorWriteAttempted=`.
- The risk/rollback note renderer now preserves evidence text while translating known raw fragments such as `mode=PatchOLSConfig` into customer-facing labels.
- Added a `verify:web-shell` gate and browser DOM check so the install approval card cannot drift back to raw developer labels.

### 2026-06-18 - Lane 78

- Added an Assistant connection smoke card.
- The KOMSCO Assistant now shows three explicit checks inside the popover:
  - context sync
  - action plan API
  - cluster mutation boundary
- The card makes the current state visible without pretending the native Lightspeed drawer has been replaced: `API connected / plan-only` can now be read together with `context sync ready`, `action plan API ready`, and `cluster mutation blocked`.
- Protected the smoke card with `verify:web-shell`, `AC-UI-004`, `AC-CTX-001`, and an in-app browser observation.

### 2026-06-18 - Lane 79

- Added `docs/runbooks/cywell-opslens-dev012-10h-autonomy-plan.md` as the explicit 10-hour work plan for leaving the MacBook CRC target available while local non-mutating gates continue.
- Hardened the overnight checkpoint Markdown/JSON evidence so every loop writes a morning decision, step totals, safe entrypoints, safe next commands, blocked actions, and a MacBook rationale.
- The new checkpoint summary makes a PASS mean "continue the next local product lane" instead of implying production install, OLSConfig patching, registry mutation, or native Lightspeed drawer replacement.
- The loop remains local and non-mutating: it does not patch OCP, create secrets, push images, or read `.env`.

Checkpoint cadence:

- every 30 minutes while the user is away
- also after each successful commit/push
- stop after the morning handoff or after three consecutive checkpoints with the same hard blocker

### 2026-06-18 - Lane 80

- Hardened the Operator CRC lightweight transition path.
- When an `OpsLensInstallation` switches to `vectorStore.provider: inmemory`, the TypeScript plan and Go controller now mark stale owned pgvector runtime resources for cleanup:
  - `StatefulSet/cywell-opslens-vector`
  - `Service/cywell-opslens-vector`
  - generated `Secret/cywell-opslens-postgres-auth`
- When it switches to `modelRuntime.provider: mock-local`, stale owned vLLM runtime resources are similarly cleaned:
  - `Deployment/cywell-opslens-vllm`
  - `Service/cywell-opslens-vllm`
- PVC data is intentionally not part of automatic cleanup.
- Cleanup is owner-reference gated, so the controller only deletes resources owned by the active `OpsLensInstallation`.
- RBAC grants only the extra delete verbs needed for owned `services` and generated `secrets`; broad Secret list/watch permissions remain absent.
- Protected with:
  - `npm run verify:operator:reconcile`
  - `npm run verify:operator:runtime`
  - `npm run verify:operator:package`

### 2026-06-18 - Lane 81

- Added an OpenShift dashboard Route to the Operator install contract.
- The TypeScript reconcile plan, static app manifest, and Go controller now include `Route/cywell-opslens-dashboard`.
- The Route points at `Service/cywell-opslens-dashboard`, target port `https`, with `reencrypt` TLS and redirect policy.
- This narrows the live demo gap where the Operator installed services but the user still had to remember a port-forward to open the OpsLens page.
- RBAC route permissions are now checked in both config RBAC and CSV RBAC.
- Protected with:
  - `npm run verify:operator:reconcile`
  - `npm run verify:operator:runtime`
  - `npm run verify:operator:package`

### 2026-06-18 - Lane 82

- Reflected the new dashboard Route contract in the customer-facing shell.
- The CRC install signal now tells the operator to check `oc get opslensinstallation,deploy,pod,svc,route`.
- The masthead now shows `Route = cywell-opslens-dashboard` as a visible post-apply signal.
- The dashboard direct access strip now says the `19443` URL is a port-forward fallback, not the primary installed path.
- Protected with:
  - `npm run verify:web-shell`
  - `npm run -w @kugnus/web build`
  - `npx playwright test -g "AC-UI-004"`

### 2026-06-18 - Lane 83

- Removed a CRC install-story ambiguity from the OperatorHub examples.
- The first `alm-examples` CR now uses the same `metadata.name: cywell-opslens` as `deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml`.
- The approved pgvector/vLLM/PatchOLSConfig example now uses a separate `cywell-opslens-approved-runtime` name and `approved-runtime` profile.
- This keeps the OperatorHub example and the `oc apply` sample from looking like two separate OpsLens products that both need installation.
- Protected with:
  - `npm run verify:operator:package`
  - `npm run lab:catalog:crc`
  - `npm run verify:crc-demo-readiness`
  - `npm run verify:operator:runtime`
  - `npm run overnight:checkpoint`

### 2026-06-18 - Lane 84

- Hardened the KO/EN shell contract for the OpenShift-style navigation.
- Added stable test IDs for left navigation section headings and the active breadcrumb.
- Playwright now checks Korean and English labels for every left navigation section, every left navigation item, the active breadcrumb, command feedback, and the KOMSCO Assistant in one language toggle path.
- This directly protects the customer-visible scenario where the language toggle works but only part of the console shell appears translated.
- Protected with:
  - `npm run verify:web-shell`
  - `npm run -w @kugnus/web build`
  - `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-004"`

### 2026-06-18 - Lane 85

- Hardened the installed ConsolePlugin proxy-mode contract.
- Added a targeted Playwright path that loads the dashboard with `surface=console-plugin` and the encoded plugin API base, matching the iframe route emitted by `OpsLensRoute`.
- The test proves the masthead switches from standalone preview to ConsolePlugin mode, shows plugin API proxy routing, and exposes the assistant route as `console-plugin-user-token-proxy`.
- The same path verifies English and Korean copy for UserToken proxy routing and the read-only/plan-only Assistant boundary.
- Protected with:
  - `npm run verify:web-shell`
  - `npm run -w @kugnus/web build`
  - `npm run verify:console-plugin`
  - `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-007"`

## Current Known State

- `main` pushed: `5ad0b75` (`Polish OpsLens localization`)
- feature branch pushed: `feat/OpsLens-Dev0.1.2`
- feature branch head at plan creation: `cf791e1`
- feature branch latest pushed head before Lane 77: `6834383`
- untracked junk intentionally excluded: `apps/web/src/assets/brand/desktop.ini`
- latest web shell verifier after Lane 78: PASS, 51 checks
- latest assistant smoke browser check after Lane 78: PASS, `연결 스모크`, `컨텍스트 동기화: 준비됨`, `액션 플랜 API: 준비됨`, `클러스터 변경: 차단`
- latest overnight checkpoint after Lane 79: writes morning decision, step totals, safe entrypoints, and blocked actions in both JSON and Markdown
- 10-hour autonomy plan: `docs/runbooks/cywell-opslens-dev012-10h-autonomy-plan.md`
- latest operator runtime verifier after Lane 81: PASS, 88 checks, including dashboard Route parity and CRC lightweight stale runtime cleanup parity
- latest web shell verifier after Lane 82: PASS, 51 checks, including route-backed CRC install signal copy
- latest local image build gate after Lane 26: PASS, 0 fail, 3 external-runtime/catalog warnings, `:build-verify` tag isolation
- latest lab image map after Lane 29: PASS, 0 fail, 2 expected external-runtime warnings
- latest CRC handoff tar: `test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar`

## First Command Set

Run from `C:\Users\soulu\cywell\Kugnus-Ops-Lens`:

```powershell
git status --short --branch
npm run verify:web-shell
npm run -w @kugnus/web build
npm run verify:console-plugin
```

Expected:

- no failures
- no secret output
- branch remains `feat/OpsLens-Dev0.1.2`
