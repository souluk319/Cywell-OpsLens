# Cywell OpsLens Dev 0.1.2 Morning Handoff

Date: 2026-06-18 KST
Branch: `feat/OpsLens-Dev0.1.2`
Base ref: `origin/main`

## Current Judgment

Dev 0.1.2 is now in a safer state for the next CRC demo loop:

- the local web shell has KOMSCO/OpsLens assistant branding and KO/EN contracts protected by a verifier
- Korean assistant surfaces now use `KOMSCO AI 어시스턴트` instead of mixed English branding, and the masthead user menu matches the OpenShift demo identity `kubeadmin`
- the Korean shell status copy has been polished so customer-facing CRC/preview surfaces avoid developer-only wording
- the shell now names standalone preview versus ConsolePlugin route/proxy mode
- the masthead now shows the install/apply flow: OperatorHub installs the Operator, OpsLensInstallation applies the product, ConsolePlugin provides the route
- the OCP Coverage Matrix now follows the same KO/EN toggle as the rest of the shell
- the OCP Coverage Matrix now localizes scope/status/gap chips instead of showing raw enum text like `policy-blocked`, `not-probed`, or `all-namespaces` in KO mode
- the OCP Coverage Diagnostic status chips now localize `ok/warning/critical/missing/skipped/error` without rewriting raw evidence
- the OCP Resource Explorer Korean surface now avoids leftover developer English for fallback/RBAC/owner relationship states
- the OCP Resource Explorer detail fallback chip no longer hardcodes English `to` in KO mode
- the OpsLens Admin completion, live handoff, and owned-image provenance summary cards now avoid customer-visible raw labels such as `Remaining`, `gap=...`, `assistantMutationAllowed=...`, `Local Inspect`, and `Remaining Evidence`
- the OpsLens Admin install-readiness grid now uses stable item IDs plus KO/EN labels instead of hardcoded English object keys such as `Image Builds`, `Owned Provenance`, and `Auth/RBAC Plan`
- the OpsLens Admin AI Ops and Alertmanager summaries now avoid raw UI labels such as `Monitoring Proxy`, `accepted=`, `rawAlertReturned=`, `missingQueries=`, `Live Smoke`, and `Selected Pod` while preserving operational IDs as evidence
- the remediation proposal cards now avoid raw labels such as `Mode`, `Patch`, `Current`, `Proposed`, `reviewGate=`, `targetConfidence=`, `logs=`, `events=`, `metrics=`, and `runbooks=` while preserving field paths, YAML patches, and evidence values
- the Cywell OpsBrain panels now avoid raw guard labels such as `fineTuningRequired=`, `actionMode=`, `write=`, `mutationAllowed=`, `golden=`, `next=`, `groundedTarget=`, `routingPlanned=`, `rawMemoryWrite=`, `fineTuning=`, and `nightlyLoop=` while preserving implementation and evidence strings
- the RAG production readiness and approval queue panels now avoid raw labels such as `contractReady=`, `queueLive=`, `workerLive=`, `vectorAudit=`, `rawMarkdown=`, `auditAppendOnly=`, `queueMetadataWrite=`, and `approved=` while preserving action IDs and command IDs as evidence
- the Runtime readiness and live handoff panels now avoid raw labels such as `pgvector=`, `vllm=`, `liveProbe=`, `runtimeOwner=`, `dataOwner=`, `writesLocalEvidence=`, and `mutationAllowedByThisVerifier=` while preserving provider/component/action IDs
- the AI Ops monitoring proxy handoff rows now avoid raw labels such as `owner=`, `mutationAllowedByThisVerifier=`, and `command.id:mutation=true/false` while preserving command IDs and ticket IDs
- the OCP connectivity and network handoff panels now avoid raw labels such as `context=`, `auth=`, `server=`, `kubeconfigEnv=`, `humanApproval=`, `rbacAccessReviews=missing`, `mutation=false`, `classification=...`, `first=...`, `approval=...`, `fresh=true`, and `required=true` while preserving command IDs, ticket IDs, and diagnostic values
- the Auth/RBAC plan and network fallback cards now avoid raw labels such as `cases=`, `failedChecks=`, `OCP Auth/RBAC Plan`, `Namespace`, `Reader`, `Policy`, `readOnly=true`, `context=`, `auth=`, `kubeconfigEnv=`, `requiresApproval=`, and `mutationAllowed=` while preserving service account, ClusterRole, command, and ticket evidence
- the live handoff post-approval smoke card now avoids raw labels such as `classification=`, `rbac=`, `unknown=`, `lightspeedClassification=`, `lightspeedAuthReady=`, `sources=...fresh=`, `Read-only Commands`, `Action Hints`, `Post-approval Smoke`, and `Forbidden` while preserving RBAC count ratios, source artifact IDs, and command evidence
- the completion gate card now avoids raw labels such as `head=`, `dirty=`, `readyToClaim100=`, `mutationBoundaryPassed=`, `tickets=`, `readOnly=`, `setup=`, `approval=`, `owner=`, `status=`, `exists=`, `sources=`, `failedSources=`, `criticalPath=`, `cleanupDeletionAllowed=`, `bundleStatus=`, `publishReady=`, `installReady=`, `actionQueueReady=`, and `unsafeTickets=` while preserving head SHA, gate IDs, command IDs, packet filenames, and unsafe ticket IDs
- the release refresh, release bundle, and release action queue panels now avoid raw labels such as `unsafeTickets=`, `staleRemoved=`, `actionQueueActionGaps=`, `readOnly=`, `approval=`, `ticketFirst=`, and `diagnostics=` while preserving ticket IDs, command IDs, source IDs, and diagnostic values
- the external runtime review packet now avoids raw labels such as `REVIEW_PACKET_READY`, `reviewPacketOnly`, `owner=`, `best=`, `critical=`, `finalEvidence=`, `approvalRequired=`, `registryPacket=`, and `not-run ... approval=` while preserving image names, ticket IDs, command IDs, and candidate/review counts
- the security scan and review packet now avoids raw labels such as `scan=`, `sbom=`, `review=`, `first=`, `approval=`, `finalEvidence=`, `reviewApproved=`, `digestPinned=`, `missingTargets=`, and `ready=` while preserving image names, ticket IDs, command IDs, and scanner/review evidence values
- the certification readiness card now avoids raw labels such as `head=`, `dirty=`, `registryMutationAttempted=`, `status=`, `required=`, `satisfiedBy=`, `writesLocalEvidence=`, `requiredHead=`, and `pass=` while preserving certification command IDs, action IDs, and ticket evidence values
- the community submission card now avoids raw labels such as `head=`, `dirty=`, `parity=`, `externalSubmissionAttempted=`, `registryMutationAttempted=`, `mutationAllowedByThisVerifier=`, `:next=`, and `:approval=` while preserving community submission command IDs, action IDs, and ticket evidence values
- the external runtime plan card now avoids raw labels such as `registryMutationAttempted=`, `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `draft=`, `templates missing`, `drafts missing`, `:mutation=`, `:approval=`, and `:next=` while preserving runtime image IDs and mirror command evidence values
- the owned image provenance card now has an explicit KO/EN title and avoids raw labels such as `mutationAllowedByThisVerifier=` while preserving image IDs and local inspect evidence values
- the release publish plan card now avoids raw labels such as `registryMutationAttempted=`, `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `:mutation=`, `:approval=`, `:secret=`, `packet=`, `exists=`, and `releasePublishExecuted=` while preserving release command IDs, ticket IDs, and publish packet evidence values
- the install approval plan card now avoids raw labels such as `clusterMutationAttempted=`, `mutationAllowedByThisVerifier=`, `jobCreated=`, `mode=`, `willPatch=`, `legacyConfigMapMutationAttempted=`, `:mutation=`, `:approval=`, `packet=`, `exists=`, `installExecuted=`, `queueEvidence=`, and `vectorWriteAttempted=` while preserving command IDs, ticket IDs, registration mode, and approval-gated evidence values
- the catalog toolchain and CRC lab readiness cards now avoid raw labels such as `registryAuthConfigured=`, `registryBaseReadable=`, `registryMutationAttempted=`, `clusterMutationAttempted=`, `toolchainPlanOnly`, `localEvidenceOnly`, `NEEDS_LOCAL_ARTIFACTS`, `NEEDS_CURRENT_EVIDENCE`, `NEEDS_CAPACITY_REVIEW`, `external-runtime-review-required`, `head=`, `dirty=`, `blocking=`, `exists=`, `missingTags=`, `bootstrapWorkstation=`, `:ready=`, `:first=`, and `companyOcpUsed=` while preserving command IDs, source IDs, role IDs, and image transfer evidence values
- the roadmap completion card now avoids raw labels such as `head=`, `dirty=`, `mutationBoundaryPassed=`, `externalState=`, `localOnly=`, `externalGates=`, `localGates=`, `next=`, `external=`, `tickets=`, `readOnly=`, `setup=`, and `approval=` while preserving percent complete, gate IDs, command IDs, ticket IDs, and critical-path action IDs
- the pre-cluster install gate now avoids raw labels such as `safeToRunClusterInstall=`, `strictExitWouldFail=`, `Failed Gates`, `First Blocker`, `external=`, `local=`, `live=`, `prep=`, `failed=`, `firstBlocked=`, `remainingExternalState=`, `staleExternal=`, `directLive=`, `localPrep=`, `planStrict=`, `sources=`, `readOnly=`, `approvalNotRun=`, `status=`, `firstLane=`, and `mutationAllowed=` while preserving gate IDs, owner IDs, command IDs, source IDs, and approval-gated command evidence
- the primary dashboard, evidence pane, console overview, and Assistant status/context fields now avoid customer-visible mixed Korean/English labels such as `live overview`, `incident queue`, `payload`, raw `fallback/loading` UI status chips, and English context chip labels
- the Assistant answer body now has a reviewed KO display dictionary for the known demo triage answer, including current judgment, evidence labels, cause candidates, risks, missing evidence, plan, rollback path, citations, and context values such as `CRC 미리보기` and `근거 3건`
- the Assistant display path now adds a reviewed phrase dictionary for live/backend evidence fragments such as `previous pod logs`, `pod logs`, `no pod candidate was available`, `no label selector`, `logs read for last`, `events listed for`, `Forbidden`, `Unauthorized`, `connection refused`, `timed out`, `missing evidence`, `read-only`, and `plan-only` without changing the raw answer payload
- the masthead now shows a visible mod-boundary strip explaining that OpsLens adds route/API/MCP surfaces while native OpenShift chrome and the Lightspeed drawer remain OpenShift-owned
- the masthead now shows a visible runtime-profile strip explaining that the CRC demo uses in-memory RAG plus a mock model, while approved installs require pgvector/vLLM evidence
- the masthead now shows a visible certification boundary explaining that the current build is a local demo, not a Partner/OperatorHub submission, and certified readiness still needs security/release evidence
- the Assistant now shows a connection decision card that separates connected API answers from local plan-only fallback, so the UI does not imply live AI is connected when the API route is down
- the Assistant connection card now includes a KO/EN mode matrix for answer source, token/proxy path, and the non-mutating chat boundary; this directly addresses the “why does the chatbot look unconnected?” demo risk
- the Assistant now includes a KO/EN connection smoke card for context sync, action plan API, and cluster mutation boundary, so `API connected / plan-only` is backed by visible checks rather than a vague status badge
- the Assistant ready badge now says `API connected / plan-only` and `API 연결됨 / 계획 전용`, while fallback still says local fallback, so a connected plan-only route no longer looks like a disconnected chatbot
- the Assistant connection card now shows a KO/EN integration contract separating standalone preview, installed ConsolePlugin UserToken proxy, and the native OpenShift Lightspeed drawer
- the Assistant prompt now shows the KO/EN ask execution path: Enter sends to the current OpsLens API route, fallback stays local plan-only, and Shift+Enter adds a line
- the masthead utility buttons and evidence Ask/View actions are covered by a click-through Playwright contract instead of only static handler checks
- the Korean left navigation is now covered by a click-through Playwright contract for overview, alerting, dashboards, metrics, logs, workloads, networking, storage, administration, OpsLens Admin, and OpsBrain
- the masthead now shows a KO/EN return checklist for reconnecting Mac CRC, opening the ConsolePlugin route, and running read-only smoke before demo
- the first-viewport readiness command strip now localizes completion status, passed requirements, remaining items, next gate, and next check instead of showing raw `needs-evidence`, `남음=`, `다음=`, or `cmd=` fragments
- the masthead now shows the demo access path: installed view uses the Console route, the forwarded dashboard uses HTTPS on 19443, and Assistant/API traffic follows the active proxy mode
- the masthead now shows the CRC install signal: run `oc get opslensinstallation,deploy,pod,svc`, expect API/dashboard `1/1`, and treat an old `quay.io` operator image as stale catalog evidence
- that CRC install signal now says `CRC ready = API/dashboard 1/1` and `CRC 준비 = API/대시보드 1/1`, so local-demo readiness is not confused with the approved pgvector/vLLM runtime path
- the CRC install signal now includes `route` in the read-only status command and shows `Route = cywell-opslens-dashboard` as the expected installed page entrypoint
- the masthead now says to choose the CRC lightweight example first, matching the OperatorHub `alm-examples` order and avoiding the pgvector/vLLM path during local demo setup
- the masthead now shows the post-install smoke path: open the ConsolePlugin route, ask KOMSCO AI Assistant, and keep OLSConfig in `ValidateOnly` unless an explicit patch is approved
- the masthead API status chip is localized instead of showing raw `loading/ready/fallback` state values in Korean mode
- the OpsLens Admin Lightspeed/MCP card now uses customer-facing labels for routing score, response score, read-only tools, selected tool, redaction, mutation boundary, live readiness, network readiness, and next command instead of raw developer `key=value` fragments
- the Assistant now keeps the raw API error as evidence but adds a KO/EN interpretation for disconnected routes, missing endpoints, auth/RBAC rejection, and API service failures
- shell action contracts cover the left navigation, masthead utilities, evidence tabs, and Assistant Enter-to-Ask behavior
- the overnight checkpoint evidence now stamps start/finish branch, head, worktree dirty flag, dirty entry count, and dirty entries so a green loop can be audited against the actual Git state
- the overnight checkpoint now includes `npm run verify:crc-demo-readiness`, which checks the CRC lightweight OperatorHub path, UI first-choice copy, handoff commands, and arm64 transfer tar as one local evidence packet
- the overnight checkpoint Markdown/JSON now writes a morning decision, step totals, safe entrypoints, safe next commands, blocked actions, and the MacBook keep-awake rationale so the user can resume without rereading the whole chat
- `docs/runbooks/cywell-opslens-dev012-10h-autonomy-plan.md` is the human plan artifact for the unattended window; it states what the loop does, what it will not do, and how to resume if the Mac sleeps
- the Operator now cleans up only owned stale pgvector/vLLM controllers, services, and the generated Postgres secret when the CR switches to the CRC lightweight `inmemory` plus `mock-local` profile; PVC data remains outside automatic cleanup
- the Operator now creates `Route/cywell-opslens-dashboard` with reencrypt TLS, so an installed CRC demo has a route-backed page entrypoint instead of relying only on remembered port-forwards
- AC-LAB-001 now explicitly treats `npm run verify:crc-demo-readiness` as the CRC demo gate, so the acceptance criteria, package contract, UI signal, and morning handoff all point at the same lightweight install path
- the Operator reconcile path no longer needs finalizer permission for owner references
- the Operator status path no longer reports `OpsLensInstallation Ready` before required API/dashboard/vector/model workloads are observed as ready; unready required workloads keep the CR in `Installing`
- the TypeScript dry-run status now follows the same no-false-Ready rule, so plan evidence no longer claims workload readiness before live controller observation
- a CRC lightweight `OpsLensInstallation` sample exists so local demos can avoid pgvector/vLLM failure classes
- OperatorHub `alm-examples` now exposes that CRC lightweight sample, so console-created CRs no longer default users into the pgvector/vLLM/PatchOLSConfig path during CRC demos
- the CRC lightweight `alm-examples` entry is now first in the CSV, and `npm run verify:operator` fails if the first OperatorHub CR example drifts back to pgvector/vLLM
- CSV `relatedImages` now has an owned-image-first verifier so `operator`, `api`, and `dashboard` stay ahead of external runtime images in package diagnostics
- CRC catalog/image handoff now uses explicit `v0.1.2-dev-crc` tags instead of ambiguous `:verify`
- local image build evidence now uses isolated `:build-verify` tags, so `npm run verify:images:build` no longer overwrites CRC arm64 `:verify` tags
- the Mac CRC transfer artifact is pinned to `arm64/linux` and verified before handoff
- the next-day live reconnect path is documented without secrets or exact private network values

This is not a claim that production install is ready. The pre-cluster gate still blocks install by evidence gaps.

## Commits On This Branch

```text
4652648 Clarify CRC ready signal
ab0d142 Refresh Dev012 handoff lanes
a8dba38 Test Korean navigation actions
1b3e726 Clarify assistant ready state
15d2f6a Test shell utility actions
51dd685 Refresh Dev012 handoff status
005e5e4 Polish KOMSCO console shell
3339766 Document CRC demo readiness gate
122e232 Summarize CRC demo readiness
424767e Add CRC demo readiness gate
3fdb50b Surface CRC lightweight install choice
54c5357 Order OperatorHub related images
d2a43cb Prioritize CRC OperatorHub example
2f943b2 Surface assistant ask path
acbe113 Clarify OpsLens shell mode
cf791e1 Tighten web shell evidence
d45a9b1 Plan Dev 0.1.2 overnight loop
23fc447 Localize OpsLens admin shell
e1f2883 Harden ConsolePlugin mode diagnostics
f7a7078 Harden CRC operator runtime defaults
8c04d16 Update CRC live verification handoff
7a65f71 Document Dev 0.1.2 morning handoff
eb7de6e Surface assistant API diagnostics
48e2cf6 Clarify CRC lab shell context
3952914 Harden web shell action contracts
f5a663f Allow CRC lightweight runtime disable
bab809b Harden CRC dev image handoff
cc8bf3b Ignore Windows desktop metadata
3942a6a Enforce CRC arm64 handoff
3d528ea Refresh Dev 0.1.2 handoff plan
1b18f3f Add Dev 0.1.2 overnight checkpoint loop
9122027 Polish Korean shell copy
b81f7ec Clarify OpsLens install flow
1c1df71 Localize OCP coverage matrix
3fb9a3a Polish Resource Explorer Korean copy
5a6dc1e Polish Korean UI status labels
5e48bce Localize assistant answer display
168c86b Clarify assistant connection state
3df56c7 Polish Lightspeed admin labels
35c8d12 Explain assistant API fallback errors
a3ea61d Expose CRC lightweight OperatorHub example
1e8723f Test localized assistant shell
6426291 Expose assistant connection mode
406a34f Gate operator readiness on workloads
fb72b17 Isolate local image build tags
fa38a6d Localize coverage matrix labels
d36e33e Polish resource fallback wording
5b770a8 Localize coverage diagnostic status
9dadb71 Polish admin summary labels
c96c4ce Localize admin readiness grid
1315da3 Localize AI Ops intake labels
42223ff Localize remediation proposal labels
8128733 Localize OpsBrain guard labels
8f6693f Localize RAG production labels
81555b2 Stamp overnight loop git state
f67c5c8 Localize runtime handoff labels
f107952 Localize monitoring proxy handoff
bfe8704 Localize OCP network handoff
3786512 Localize auth RBAC plan
673f5f3 Localize live handoff smoke
def83cc Localize completion gate
de4d0be Localize roadmap completion
6df86dd Localize pre-cluster gate
712398b Localize assistant evidence phrases
c661a06 Clarify OpsLens mod boundary
4bb1321 Clarify runtime profile boundary
8938501 Clarify certification boundary
a5e9327 Clarify assistant integration contract
34c177d Surface demo handoff checklist
31611b4 Localize readiness command strip
1108e0d Clarify demo access path
cfdd258 Surface CRC install signal
a19209f Surface post-install smoke path
```

## Verified Gates

Latest non-mutating checks:

| Command | Result | Note |
| --- | --- | --- |
| `npm run verify:web-shell` | PASS | 0 fail, 51 checks after the Assistant smoke, release/action queue, external runtime review, security scan, certification, community submission, external runtime plan, owned provenance, release publish, install approval, catalog toolchain, and lab readiness label lanes |
| `npm run -w @kugnus/web build` | PASS | TypeScript, Vite, and ConsolePlugin bundle completed after the Assistant smoke lane |
| `npx playwright test -g "AC-UI-004\\|AC-CTX-001"` | PASS | KO/EN shell and Assistant smoke card render; context sync/action plan API are ready and cluster mutation is blocked |
| `npx playwright test -g "AC-UI-004"` | PASS | KO/EN shell now shows the route-backed CRC install signal and 19443 as port-forward fallback |
| in-app browser smoke | PASS | Assistant popover showed `연결 스모크`, `컨텍스트 동기화: 준비됨`, `액션 플랜 API: 준비됨`, and `클러스터 변경: 차단` |
| `npm run verify:console-plugin` | PASS | 0 fail, 9 checks |
| `npm run verify:crc-demo-readiness` | PASS | 0 fail, 0 warn, 14 checks; writes JSON and Markdown evidence for OperatorHub first example, lightweight sample, UI copy, handoff commands, and arm64 tar alignment |
| `npm run overnight:checkpoint` | PASS | latest clean checkpoint after Lane 77 passed 10/10 local gates on a clean worktree; evidence includes start/finish Git state and CRC demo readiness |
| `npx playwright test -g "AC-UI-005"` | PASS | Masthead utilities, evidence tabs, and evidence Ask buttons click through to visible state changes |
| `npx playwright test -g "AC-CTX-001"` | PASS | Assistant context sync now expects `API connected` plus `API connected / plan-only`, and visible cluster context says `CRC preview` |
| `npx playwright test -g "AC-UI-006"` | PASS | Korean left navigation click-through covers all console navigation items |
| `npm run verify:lab-image-map` | PASS/WARN | 0 fail, 2 expected external-runtime warnings; local images arm64 |
| `npm run verify:lab-bootstrap` | PASS/WARN | 0 fail, 5 warnings; versioned arm64 tar exists |
| `npm run verify:lab-handoff` | PASS/WARN | 0 fail, 7 warnings; live evidence still stale |
| `npm run verify:operator:reconcile` | PASS | 0 fail, 26 checks; dry-run status includes dashboard Route and remains `Installing` until live workload observation |
| `npm run verify:operator:runtime` | PASS | 0 fail, 88 checks; includes workload readiness/no-false-Ready, dashboard Route, and CRC lightweight stale runtime cleanup contracts |
| `npm run verify:operator:package` | PASS/WARN | 0 fail, 1 warn, 144 checks; static app manifest now includes the dashboard Route |
| `npm run verify:operator` | PASS/WARN | 0 fail, 1 warn; live OLM smoke remains external |
| `npm run verify:images:build` | PASS/WARN | 0 fail, 3 expected warnings; local build evidence uses `:build-verify` tag isolation |
| `npm run verify:install-plan` | PASS/WARN | 0 fail, 7 warn; evidence freshness and Lightspeed gap remain |
| `npm run verify:pre-cluster-install` | PASS/WARN | 0 fail, 19 warn; `safeToRunClusterInstall=false` |

## What To Open First

1. Local dev shell:

```text
http://127.0.0.1:5173/index.html
```

2. CRC dashboard through the installed Route:

```bash
oc get route cywell-opslens-dashboard -n cywell-opslens
```

Open the returned Route host from a browser that can resolve the CRC apps domain.

3. CRC dashboard through port-forward fallback:

```text
https://127.0.0.1:19443
```

4. OpenShift Console OperatorHub:

Search `cywell`, then confirm the package shows `cywell-opslens-operator.v0.1.2`.

## First Commands Tomorrow

On the MacBook SSH terminal:

```bash
crc status
oc whoami && oc project -q
oc get packagemanifest cywell-opslens -n default -o yaml | grep -E 'currentCSV|v0.1.2-dev-crc|cywell-opslens-operator' -n
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
oc get route cywell-opslens-dashboard -n cywell-opslens
```

If port-forwards died, rebuild them from:

```text
docs/runbooks/cywell-opslens-crc-live-handoff.md
```

If images must be moved again, use the versioned arm64 artifact:

```text
test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar
```

Do not trust a Mac CRC install package unless `docker image inspect` shows `ARCH=arm64` for the five `v0.1.2-dev-crc` images.

## If The MacBook Is Left In The Office

Leave it powered, awake, and on the same reachable network path. The useful background state is:

- CRC remains `Running`
- Docker Desktop remains running
- SSH remains reachable from this Windows workspace
- any active port-forward terminal is left open unless it is intentionally restarted
- FortiClient can stay connected if the Lightspeed/company LLM endpoint path needs it, but do not use company OCP as the target

If the Mac sleeps, the work is still recoverable, but the live verification loop becomes a morning reconnect task instead of an overnight loop.

## Overnight Safety Loop

From the Windows workspace, the safe local checkpoint is:

```powershell
npm run overnight:checkpoint
```

The unattended 10-hour loop is:

```powershell
npm run overnight:loop
```

The loop only runs local non-mutating gates and writes evidence under `test-results/`. It does not patch OCP, create secrets, push images, or read `.env`.

The first file to read after returning is:

```text
test-results/cywell-opslens-dev012-overnight-checkpoint.md
```

That summary links back to the 10-hour plan and gives the current decision:

- `READY_FOR_NEXT_LOCAL_LANE`: keep improving locally before live CRC work
- `REVIEW`: gates passed but dirty entries need inspection
- `BLOCKED`: inspect the failed step before any install/live action

## Product Boundary To Remember

OperatorHub install is only the Operator install.

The real product apply is the `OpsLensInstallation` custom resource. For CRC demos, prefer:

```text
deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
```

That sample intentionally uses:

- internal CRC image refs
- in-memory vector mode
- mock-local model runtime
- `ValidateOnly` Lightspeed registration

## Remaining Gaps

| Gap | Current Cause | Next Best Action |
| --- | --- | --- |
| pre-cluster install not green | source evidence stale and live OCP/Lightspeed evidence incomplete | refresh live evidence after reconnect |
| live handoff not fully current | local artifact is ready but live CRC evidence is intentionally not refreshed without the target session; masthead now shows the return checklist | reconnect Mac CRC and refresh read-only evidence |
| vLLM not suitable for CRC demo yet | external image/mirror/runtime evidence gap; UI now names the CRC mock-model profile separately | keep CRC lightweight profile, mirror/runtime review later |
| pgvector restricted SCC issue | default pgvector image wants filesystem permissions restricted SCC blocks; UI now names the in-memory CRC profile separately, and the operator can prune stale owned pgvector resources when switching to that profile | keep in-memory profile for demo or design a secure supported Postgres profile |
| native OpenShift Lightspeed drawer not rebranded | OpenShift-owned console surface; Assistant now visibly separates native drawer ownership from OpsLens MCP/proxy integration | keep OpsLens as route/plugin mod unless a verified console-extension lane is approved |
| unknown live evidence phrases can still appear raw | common backend/read-only evidence phrase classes now have reviewed KO display replacements; unknown strings remain raw to preserve traceability | extend the phrase dictionary only after seeing repeated live payload classes |
| final release/certification | external registry/security/certification evidence not complete; UI now visibly marks this as a local demo boundary | do not claim certified readiness until release/security evidence is approved |

## Do Not Do

- do not use the company OCP target
- do not paste `.env` values into docs or chat
- do not push images or patch OLSConfig unless explicitly approved
- do not wait on a pod still pulling `quay.io/cywell/opslens-operator:0.1.0`; that is stale catalog/subscription state
- do not reuse CRC cluster image tag `:verify` for new build evidence; publish the branch handoff as `v0.1.2-dev-crc` and keep local build checks on `:build-verify`
- do not treat `http://127.0.0.1:19443` as the dashboard URL; use `https://`

## Smallest Next Engineering Step

After reconnecting the MacBook CRC target, apply the CRC lightweight sample and verify:

```bash
oc apply -f ~/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
```

Expected demo target:

- API `1/1`
- dashboard `1/1`
- OpsLensInstallation `Ready`
- no pgvector/vLLM pods required for the CRC lightweight lane
