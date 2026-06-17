# Cywell OpsLens Dev 0.1.2 Morning Handoff

Date: 2026-06-17 KST
Branch: `feat/OpsLens-Dev0.1.2`
Base ref: `origin/main`

## Current Judgment

Dev 0.1.2 is now in a safer state for the next CRC demo loop:

- the local web shell has KOMSCO/OpsLens assistant branding and KO/EN contracts protected by a verifier
- the Korean shell status copy has been polished so customer-facing CRC/preview surfaces avoid developer-only wording
- the shell now names standalone preview versus ConsolePlugin route/proxy mode
- the masthead now shows the install/apply flow: OperatorHub installs the Operator, OpsLensInstallation applies the product, ConsolePlugin provides the route
- the OCP Coverage Matrix now follows the same KO/EN toggle as the rest of the shell
- the OCP Resource Explorer Korean surface now avoids leftover developer English for fallback/RBAC/owner relationship states
- the primary dashboard, evidence pane, console overview, and Assistant status/context fields now avoid customer-visible mixed Korean/English labels such as `live overview`, `incident queue`, `payload`, raw `fallback/loading` UI status chips, and English context chip labels
- the Assistant answer body now has a reviewed KO display dictionary for the known demo triage answer, including current judgment, evidence labels, cause candidates, risks, missing evidence, plan, rollback path, citations, and context values such as `CRC 미리보기` and `근거 3건`
- the Assistant now shows a connection decision card that separates connected API answers from local plan-only fallback, so the UI does not imply live AI is connected when the API route is down
- the masthead API status chip is localized instead of showing raw `loading/ready/fallback` state values in Korean mode
- the OpsLens Admin Lightspeed/MCP card now uses customer-facing labels for routing score, response score, read-only tools, selected tool, redaction, mutation boundary, live readiness, network readiness, and next command instead of raw developer `key=value` fragments
- the Assistant now keeps the raw API error as evidence but adds a KO/EN interpretation for disconnected routes, missing endpoints, auth/RBAC rejection, and API service failures
- shell action contracts cover the left navigation, masthead utilities, evidence tabs, and Assistant Enter-to-Ask behavior
- the Operator reconcile path no longer needs finalizer permission for owner references
- a CRC lightweight `OpsLensInstallation` sample exists so local demos can avoid pgvector/vLLM failure classes
- CRC catalog/image handoff now uses explicit `v0.1.2-dev-crc` tags instead of ambiguous `:verify`
- the Mac CRC transfer artifact is pinned to `arm64/linux` and verified before handoff
- the next-day live reconnect path is documented without secrets or exact private network values

This is not a claim that production install is ready. The pre-cluster gate still blocks install by evidence gaps.

## Commits On This Branch

```text
3942a6a Enforce CRC arm64 handoff
cc8bf3b Ignore Windows desktop metadata
bab809b Harden CRC dev image handoff
f5a663f Allow CRC lightweight runtime disable
3952914 Harden web shell action contracts
48e2cf6 Clarify CRC lab shell context
eb7de6e Surface assistant API diagnostics
7a65f71 Document Dev 0.1.2 morning handoff
8c04d16 Update CRC live verification handoff
f7a7078 Harden CRC operator runtime defaults
e1f2883 Harden ConsolePlugin mode diagnostics
23fc447 Localize OpsLens admin shell
d45a9b1 Plan Dev 0.1.2 overnight loop
cf791e1 Tighten web shell evidence
```

## Verified Gates

Latest non-mutating checks:

| Command | Result | Note |
| --- | --- | --- |
| `npm run verify:web-shell` | PASS | 0 fail, 11 checks after Lane 19 |
| `npm run verify:console-plugin` | PASS | 0 fail, 9 checks |
| `npm run overnight:checkpoint` | PASS | 9/9 local checkpoint gates passed after Lane 19 |
| `npm run verify:lab-image-map` | PASS/WARN | 0 fail, 2 expected external-runtime warnings; local images arm64 |
| `npm run verify:lab-bootstrap` | PASS/WARN | 0 fail, 5 warnings; versioned arm64 tar exists |
| `npm run verify:lab-handoff` | PASS/WARN | 0 fail, 7 warnings; live evidence still stale |
| `npm run verify:operator:reconcile` | PASS | 0 fail, 23 checks |
| `npm run verify:operator:runtime` | PASS | 0 fail, 77 checks |
| `npm run verify:operator` | PASS/WARN | 0 fail, 1 warn; live OLM smoke remains external |
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
| vLLM not suitable for CRC demo yet | external image/mirror/runtime evidence gap | keep CRC lightweight profile, mirror/runtime review later |
| pgvector restricted SCC issue | default pgvector image wants filesystem permissions restricted SCC blocks | keep in-memory profile for demo or design a secure supported Postgres profile |
| native OpenShift Lightspeed drawer not rebranded | OpenShift-owned console surface | keep OpsLens as route/plugin mod unless a verified console-extension lane is approved |
| dynamic evidence text still partly English | known demo Assistant answer text is now localized, but backend/read-only evidence payloads can still preserve raw diagnostic phrases such as pod-log failure context | add a reviewed display dictionary for live evidence phrase classes without hiding raw evidence |
| final release/certification | external registry/security/certification evidence not complete | do not claim certified readiness |

## Do Not Do

- do not use the company OCP target
- do not paste `.env` values into docs or chat
- do not push images or patch OLSConfig unless explicitly approved
- do not wait on a pod still pulling `quay.io/cywell/opslens-operator:0.1.0`; that is stale catalog/subscription state
- do not reuse CRC cluster image tag `:verify`; publish the branch handoff as `v0.1.2-dev-crc`
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
