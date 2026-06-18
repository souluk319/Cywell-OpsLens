# Cywell OpsLens Dev 0.1.5 Acceptance Audit

Generated for the 2026-06-19 09:00 KST demo target.

## Ref Stamp

| Field | Value |
| --- | --- |
| Branch | `feat/OpsLens-Dev0.1.5` |
| Current proof source | `npm run overnight:checkpoint` |
| Public demo brief | https://souluk319.github.io/Cywell-OpsLens/ |
| Local evidence folder | `test-results/` |

## Goal Lock

Dev 0.1.5 must show Cywell OpsLens as a credible OpenShift Console extension product:

```text
OpenShift Console / Software Catalog
-> Operator install
-> OpsLensInstallation
-> ConsolePlugin route
-> full-page OpsLens dashboard
-> visual operations cockpit
-> KOMSCO AI Assistant
```

It must not be presented as an iframe, DOM injection, fake console skin, or unsupported masthead replacement.

## Acceptance Matrix

| Requirement | Status | Evidence | Current gap |
| --- | --- | --- | --- |
| Official OpenShift extension path | Pass | `npm run verify:console-plugin`, `npm run verify:operator:package`, presentation official-reference section | Live cluster mutation remains approval-gated |
| Software Catalog / OperatorHub story | Pass | Catalog card/detail screenshots and package verifier | Production/community submission is separate |
| Full-page OpsLens launched from console | Pass for product contract and local/plugin route assets | ConsolePlugin route verifier, Dev 0.1.4 live launch proof, Dev 0.1.5 package defaults | Fresh live CRC Dev 0.1.5 upgrade is approval-gated |
| Left navigation collapse/reopen | Pass | `AC-UI-005` now asserts collapse, reopen, active nav retention, and active page retention | None for local UI |
| Only selected page is visible | Pass | `AC-UI-003`, `AC-DASH-001`, and `verify:web-shell` assert one active surface | None for local UI |
| Visual operations dashboard | Pass | `AC-DASH-001`, `opslens-severity-distribution`, `opslens-exposure-trend`, `active-risk-list`, and dashboard screenshot | Live Prometheus-backed production metrics remain future hardening |
| KOMSCO AI Assistant chat UX | Pass | `AC-UI-002b`, assistant chat turns, prompt field, Enter/Shift+Enter e2e, KOMSCO launcher/icon evidence | Native Lightspeed drawer replacement is not claimed |
| Assistant movable placement | Pass | `AC-UI-002b` now checks both preset move and direct drag movement | None for local UI |
| Public presentation delivery | Pass | `npm run verify:demo-brief-pages` checks README, Pages workflow, assets, viewport, and public URL smoke | `gh` CLI workflow status may be unavailable on PATH |
| Mobile presentation/preview evidence | Pass | `dev015-opslens-mobile-nav.png` and Pages verifier asset checks | Live mobile browser demo optional |
| No internal task-list noise in customer UI | Pass | `verify:web-shell`, `AC-UI-004`, and UI recovery contract | OpsLens Admin intentionally keeps operational evidence |
| Truthful fallback/live state | Pass for demo | `verify:web-shell`, API route diagnostics, live/fallback badges | Production runtime claims remain out of scope |
| Security and mutation boundary | Pass for demo | Read-only / plan-only assistant copy, handoff approval boundaries | OLSConfig patch, secrets, registry push, SCC/RBAC remain approval-gated |

## Verification Commands

```bash
npm run -w @kugnus/web build
npm run verify:web-shell
npm run verify:console-plugin
npm run verify:demo-brief-pages
npm run verify:dev015-handoff
npm run verify:dev015-acceptance
npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-002b|AC-UI-005|AC-DASH-001"
npm run overnight:checkpoint
```

## Demo-Safe Statement

Use this phrasing:

```text
Cywell OpsLens uses the official OperatorHub, OLM, and ConsolePlugin path to add a full-page operations cockpit to the OpenShift console. Dev 0.1.5 proves the console entry story, the visual operations dashboard, and the movable KOMSCO AI Assistant. Cluster mutation, OLSConfig patching, production model runtime, and production vector storage remain approval-gated hardening work.
```

Avoid this phrasing:

```text
We replaced OpenShift Console.
We can freely rewrite the native masthead.
The assistant can automatically fix the cluster.
The CRC lightweight runtime proves production vLLM/pgvector readiness.
```

## Next Approval-Gated Actions

- Push/replace live CRC images and catalog for a fresh Dev 0.1.5 upgrade proof.
- Patch OpenShift Console `spec.plugins` only with explicit approval.
- Patch `OLSConfig` only with explicit approval.
- Create or change secrets, SCC, RBAC, or service accounts only with explicit approval.

