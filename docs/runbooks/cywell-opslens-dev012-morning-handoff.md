# Cywell OpsLens Dev 0.1.2 Morning Handoff

Date: 2026-06-18 KST
Branch: `feat/OpsLens-Dev0.1.2`
Base ref: `origin/main`

## Current Judgment

Dev 0.1.2 is now in a safer state for the next CRC demo loop:

- the local web shell has KOMSCO/OpsLens assistant branding and KO/EN contracts protected by a verifier
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
- the masthead API status chip is localized instead of showing raw `loading/ready/fallback` state values in Korean mode
- the OpsLens Admin Lightspeed/MCP card now uses customer-facing labels for routing score, response score, read-only tools, selected tool, redaction, mutation boundary, live readiness, network readiness, and next command instead of raw developer `key=value` fragments
- the Assistant now keeps the raw API error as evidence but adds a KO/EN interpretation for disconnected routes, missing endpoints, auth/RBAC rejection, and API service failures
- shell action contracts cover the left navigation, masthead utilities, evidence tabs, and Assistant Enter-to-Ask behavior
- the overnight checkpoint evidence now stamps start/finish branch, head, worktree dirty flag, dirty entry count, and dirty entries so a green loop can be audited against the actual Git state
- the Operator reconcile path no longer needs finalizer permission for owner references
- the Operator status path no longer reports `OpsLensInstallation Ready` before required API/dashboard/vector/model workloads are observed as ready; unready required workloads keep the CR in `Installing`
- a CRC lightweight `OpsLensInstallation` sample exists so local demos can avoid pgvector/vLLM failure classes
- OperatorHub `alm-examples` now exposes that CRC lightweight sample, so console-created CRs no longer default users into the pgvector/vLLM/PatchOLSConfig path during CRC demos
- CRC catalog/image handoff now uses explicit `v0.1.2-dev-crc` tags instead of ambiguous `:verify`
- local image build evidence now uses isolated `:build-verify` tags, so `npm run verify:images:build` no longer overwrites CRC arm64 `:verify` tags
- the Mac CRC transfer artifact is pinned to `arm64/linux` and verified before handoff
- the next-day live reconnect path is documented without secrets or exact private network values

This is not a claim that production install is ready. The pre-cluster gate still blocks install by evidence gaps.

## Commits On This Branch

```text
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
```

## Verified Gates

Latest non-mutating checks:

| Command | Result | Note |
| --- | --- | --- |
| `npm run verify:web-shell` | PASS | 0 fail, 30 checks after the visible certification boundary lane |
| `npm run verify:console-plugin` | PASS | 0 fail, 9 checks |
| `npm run overnight:checkpoint` | PASS | 9/9 local checkpoint gates passed after Lane 48; evidence includes start/finish Git state |
| `npm run -w @kugnus/web build` | PASS | Vite app and ConsolePlugin webpack build succeeded after the visible certification boundary lane |
| `npx playwright test -g "AC-UI-004"` | PASS | KO/EN switching covers masthead, install flow, mod boundary, runtime profile, certification boundary, navigation, Assistant labels, and mode matrix |
| `npm run verify:lab-image-map` | PASS/WARN | 0 fail, 2 expected external-runtime warnings; local images arm64 |
| `npm run verify:lab-bootstrap` | PASS/WARN | 0 fail, 5 warnings; versioned arm64 tar exists |
| `npm run verify:lab-handoff` | PASS/WARN | 0 fail, 7 warnings; live evidence still stale |
| `npm run verify:operator:reconcile` | PASS | 0 fail, 23 checks |
| `npm run verify:operator:runtime` | PASS | 0 fail, 78 checks; includes workload readiness/no-false-Ready contract |
| `npm run verify:operator` | PASS/WARN | 0 fail, 1 warn; live OLM smoke remains external |
| `npm run verify:images:build` | PASS/WARN | 0 fail, 3 expected warnings; local build evidence uses `:build-verify` tag isolation |
| `npm run verify:install-plan` | PASS/WARN | 0 fail, 7 warn; evidence freshness and Lightspeed gap remain |
| `npm run verify:pre-cluster-install` | PASS/WARN | 0 fail, 19 warn; `safeToRunClusterInstall=false` |

## What To Open First

1. Local dev shell:

```text
http://127.0.0.1:5173/index.html
```

2. CRC dashboard through port-forward:

```text
https://127.0.0.1:19443
```

3. OpenShift Console OperatorHub:

Search `cywell`, then confirm the package shows `cywell-opslens-operator.v0.1.2`.

## First Commands Tomorrow

On the MacBook SSH terminal:

```bash
crc status
oc whoami && oc project -q
oc get packagemanifest cywell-opslens -n default -o yaml | grep -E 'currentCSV|v0.1.2-dev-crc|cywell-opslens-operator' -n
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
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
| live handoff not fully current | local artifact is ready but live CRC evidence is intentionally not refreshed without the target session | reconnect Mac CRC and refresh read-only evidence |
| vLLM not suitable for CRC demo yet | external image/mirror/runtime evidence gap; UI now names the CRC mock-model profile separately | keep CRC lightweight profile, mirror/runtime review later |
| pgvector restricted SCC issue | default pgvector image wants filesystem permissions restricted SCC blocks; UI now names the in-memory CRC profile separately | keep in-memory profile for demo or design a secure supported Postgres profile |
| native OpenShift Lightspeed drawer not rebranded | OpenShift-owned console surface | keep OpsLens as route/plugin mod unless a verified console-extension lane is approved |
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
