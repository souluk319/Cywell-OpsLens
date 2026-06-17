# Cywell OpsLens Overnight Execution Plan - Dev 0.1.2

Generated: 2026-06-17 KST
Branch: `feat/OpsLens-Dev0.1.2`
Start head: `cf791e1`
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
| DEV012-UI-01 | Shell clearly distinguishes standalone dev from ConsolePlugin mode. | `npm run verify:web-shell` passes and browser DOM shows `runtime-surface`. | `test-results/cywell-opslens-web-shell-contract.json` | PASS at `cf791e1`; keep protected. |
| DEV012-UI-02 | Primary dashboard, evidence, overview, and resource explorer respond to KO/EN toggle. | Build plus browser DOM check or targeted static verifier. | verifier output and browser observation notes in final report | Resource Explorer partially localized; remaining deep admin dashboard text is still mixed. |
| DEV012-CHAT-01 | Assistant uses KOMSCO AI Assistant branding and OpsLens icon. | `verify:web-shell` checks source contract; browser confirms popover. | `test-results/cywell-opslens-web-shell-contract.json` | PASS at `cf791e1`; keep protected. |
| DEV012-CONSOLE-01 | ConsolePlugin route contract remains intact. | `npm run verify:console-plugin` and `npm run -w @kugnus/web build`. | console plugin asset evidence | Needs rerun after further changes. |
| DEV012-OP-01 | Operator install path does not regress on CRC arm64 image/tag/install-mode lessons. | `npm run verify:operator`, `verify:operator:runtime`, and targeted package checks. | test output and changed files | Need code review for v0.1.2 CRC/install hardening candidates. |
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
- Interpretation: local `:verify` can remain a build-stage tag, but anything copied to or pulled by CRC must use the explicit branch tag.

### 2026-06-17 - Lane 11

- Added Mac CRC architecture protection after Windows Docker rebuilt local images as `amd64`.
- The CRC handoff verifiers now default to `targetArchitecture=arm64` and fail if local owned images are not arm64.
- Rebuilt the five CRC handoff images with `docker buildx --platform linux/arm64 --load`.
- Recreated `test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar`.
- Verified the tar contains five `v0.1.2-dev-crc` tags and that local image inspect reports `ARCH=arm64 OS=linux`.
- Interpretation: version tag alone is not enough; Mac CRC transfer artifacts must also prove architecture.

Checkpoint cadence:

- every 30 minutes while the user is away
- also after each successful commit/push
- stop after the morning handoff or after three consecutive checkpoints with the same hard blocker

## Current Known State

- `main` pushed: `5ad0b75` (`Polish OpsLens localization`)
- feature branch pushed: `feat/OpsLens-Dev0.1.2`
- feature branch head at plan creation: `cf791e1`
- untracked junk intentionally excluded: `apps/web/src/assets/brand/desktop.ini`
- latest web shell verifier: PASS, 9 checks

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
