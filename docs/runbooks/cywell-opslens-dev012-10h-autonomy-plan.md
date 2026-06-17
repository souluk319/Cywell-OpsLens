# Cywell OpsLens Dev 0.1.2 10-Hour Autonomy Plan

Date: 2026-06-18 KST
Branch: `feat/OpsLens-Dev0.1.2`
Target: local Windows workspace plus MacBook CRC OCP as the live reference target

## Goal

Advance Cywell OpsLens while the user is away without depending on company OCP or hidden manual memory.

The overnight loop must keep the product moving toward a credible OpenShift Console mod:

- OperatorHub installs the Operator.
- `OpsLensInstallation` applies the product.
- ConsolePlugin route opens the OpsLens UI.
- KOMSCO Assistant explains whether it is connected, fallback, or plan-only.
- Lightspeed native drawer remains OpenShift-owned unless an approved integration lane changes that.

## Completion Conditions

| Gate | Pass/Fail Method | Evidence | Current Gap |
| --- | --- | --- | --- |
| Local shell is coherent | `npm run verify:web-shell` | `test-results/cywell-opslens-web-shell-contract.json` | Keep KO/EN shell, full left navigation, breadcrumb, KOMSCO, install-flow, and post-install smoke copy protected. |
| ConsolePlugin contract survives | `npm run verify:console-plugin` plus targeted Playwright | console plugin verifier output and AC-UI-007 | Live browser route still needs Mac CRC to stay awake; local tests must still prove installed mode uses the UserToken proxy path. |
| Operator package does not drift | `npm run verify:operator:package` | operator package verifier output | Local CRC tags must not drift back to stale `quay.io` examples, and the first OperatorHub CR example must be the same `metadata.name` as the checked-in lightweight sample. |
| Operator reconcile behavior is protected | `npm run verify:operator:reconcile` | reconcile verifier output | Live CRC may still require explicit dev overrides for external runtime components. |
| CRC demo path is still first-class | `npm run verify:crc-demo-readiness` | `test-results/cywell-opslens-crc-demo-readiness.md` | Generated CRC catalog context must publish `cywell-opslens-operator.v0.1.2` with `v0.1.2-dev-crc`; Route-backed entrypoint must stay visible in `oc get opslensinstallation` status and live Route evidence remains separate from local evidence. |
| Handoff is readable after sleep/commute | `npm run overnight:checkpoint` | `test-results/cywell-opslens-dev012-overnight-checkpoint.md` | If Mac sleeps, reconnect becomes the first morning action. |
| Handoff freshness is protected | `npm run verify:dev012-handoff` | `test-results/cywell-opslens-dev012-handoff-readiness.json` | The 10-hour autonomy plan, morning handoff, overnight lane log, and AC-UI-007 proxy evidence must stay aligned and local and non-mutating. |

## Execution Lanes

### Lane A - Protect The Demo Surface

Priority: highest

Work:

- keep the left navigation, masthead utilities, Assistant, evidence tabs, and post-install smoke strip clickable and bilingual
- keep the language toggle synchronized across nav sections, nav items, breadcrumb, command feedback, and Assistant copy
- keep installed ConsolePlugin mode visibly separate from standalone preview, including UserToken proxy route and Assistant endpoint evidence
- avoid customer-visible raw enum/key-value labels
- preserve OpenShift-like top-right chrome order

Validation:

- `npm run verify:web-shell`
- `npm run -w @kugnus/web build`
- targeted Playwright test when UI changes

### Lane B - Protect The Install Story

Priority: high

Work:

- keep OperatorHub, `OpsLensInstallation`, and ConsolePlugin clearly separated
- keep the CRC lightweight example first
- keep the first OperatorHub CR example named exactly like the checked-in CRC lightweight apply sample, so the UI does not imply that two different OpsLens installations are required
- keep the approved pgvector/vLLM/PatchOLSConfig example named separately with an explicit approved-runtime profile
- keep stale catalog/image symptoms explicit, especially the difference between the source `0.1.0` release bundle and the generated CRC `0.1.2` dev catalog
- keep `Route/cywell-opslens-dashboard` in the install contract so the installed UI has a route-backed entrypoint, not only a remembered port-forward
- keep `status.dashboardRoute` and the `Route` printer column visible so a Ready CR also tells the operator which installed page to open
- do not claim production or certified OperatorHub readiness

Validation:

- `npm run verify:operator:package`
- `npm run verify:operator:runtime`
- `npm run verify:crc-demo-readiness`

### Lane C - Protect The Runtime Truth

Priority: high

Work:

- keep API/dashboard readiness separate from optional vector/model runtime readiness
- keep pgvector/vLLM evidence gaps visible
- when the CRC lightweight profile is used, keep stale owned pgvector/vLLM cleanup explicit and never include PVC data in automatic cleanup
- do not hide SCC, external image, or registry problems behind a false Ready status

Validation:

- `npm run verify:operator:reconcile`
- `npm run verify:operator:runtime`
- `npm run verify:runtime`

### Lane D - Protect The Assistant Truth

Priority: medium

Work:

- keep KOMSCO Assistant connected/fallback/plan-only state visible
- keep Enter-to-Ask and Shift+Enter newline behavior covered
- keep native OpenShift Lightspeed drawer boundary visible

Validation:

- `npm run verify:web-shell`
- `npx playwright test -g "AC-CTX-001|AC-UI-004|AC-UI-005"`

### Lane E - Keep A Morning-Readable Trail

Priority: always-on

Work:

- every completed lane updates this plan, the morning handoff, a verifier, or local evidence
- overnight loop writes JSON and Markdown evidence
- commit/push only intended files

Validation:

- `npm run overnight:checkpoint`
- `git status --short --branch`
- `npm run verify:dev012-handoff`

## Automated Loop

The unattended loop is intentionally local and non-mutating:

```powershell
npm run overnight:loop
```

It runs these gates every 30 minutes for 20 iterations:

1. `git status --short --branch`
2. `npm run verify:web-shell`
3. `npm run verify:console-plugin`
4. `npm run verify:operator:package`
5. `npm run verify:operator:reconcile`
6. `npm run verify:operator:runtime`
7. `npm run verify:lab-image-map`
8. `npm run verify:lab-bootstrap`
9. `npm run verify:crc-demo-readiness`
10. `npm run verify:lab-handoff`
11. `npm run verify:dev012-handoff`

Output:

- `test-results/cywell-opslens-dev012-overnight-loop.log`
- `test-results/cywell-opslens-dev012-overnight-checkpoint.json`
- `test-results/cywell-opslens-dev012-overnight-checkpoint.md`

## What The Loop Will Not Do

- it will not patch OLSConfig
- it will not create secrets
- it will not push images
- it will not clean up cluster resources
- it will not read or print `.env`
- it will not claim that the local preview is the same as the installed ConsolePlugin

## MacBook Guidance

Leave the MacBook powered, network-connected, and prevented from sleeping if possible.

Reason:

- CRC and the OpenShift console live there
- Docker trust and registry state were repaired there
- port-forward sessions may need to be recreated, but a sleeping Mac guarantees reconnect work

If the Mac sleeps, the local loop can still improve and validate the repo. The first morning action becomes:

```bash
crc status
oc whoami
oc get co
oc get pod -n cywell-opslens
```

No exact host, token, or secret is recorded in this plan.
