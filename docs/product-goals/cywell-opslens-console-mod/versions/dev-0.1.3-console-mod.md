# Dev 0.1.3 Console Mod Ledger

| Field | Value |
| --- | --- |
| Lane | Official OpenShift ConsolePlugin navigation-to-app product experience |
| Branch | `feat/OpsLens-Dev0.1.3` |
| Head at lane start | `61cf02258f49cfeaece1b0fe3c3fa01086dc74bb` |
| Verified base head | `6edcf2d5642b68a3e75c33be8b80087d3babc867` |
| Target | MacBook CRC OpenShift 4.21.14 |
| Status | Active, local contract pass; live CRC install proof pending |

## Goal

Turn Cywell OpsLens into a console-native OpenShift entry point using official ConsolePlugin extension points.

The product must feel like:

```text
OpenShift Console
-> Ecosystem / Software Catalog
-> install Cywell OpsLens Operator
-> Operator creates ConsolePlugin and enables it in consoles.operator.openshift.io/cluster spec.plugins
-> Administrator left navigation shows Cywell OpsLens
-> clicking it opens the independent OpsLens dashboard asset through the official ConsolePlugin URL
-> original console functions remain mapped and usable
-> KOMSCO AI Assistant guides the user inside that experience
```

It must not feel like:

```text
separate random portal
fake OpenShift/OpsLens toggle
debug-only port-forward page
developer checklist dashboard
chatbot-only popover product
```

## Completed In This Lane

- Official direction was locked: use supported ConsolePlugin navigation capabilities.
- The fake OpenShift/OpsLens header toggle was removed from the product shell.
- Language control was changed to a compact globe icon.
- Header was reduced toward customer-relevant state instead of long internal planning chips.
- Tests and verifiers started moving from "show implementation details" to "block implementation details from customer UI".
- OpenShift 4.21.14 console parity document was updated as the mapping contract.
- KOMSCO AI Assistant copy was changed from route/debug terminology to question-first guidance.
- Web shell verifier now blocks stale "standalone preview/local API path" customer-facing copy.
- ConsolePlugin asset verification now confirms one Administrator navigation href and UserToken proxy dashboard path.
- The plugin no longer registers a Console React route; the navigation entry opens the independent OpsLens dashboard asset directly.
- The Operator now reconciles `ConsolePlugin/cywell-opslens` and appends `cywell-opslens` to `consoles.operator.openshift.io/cluster.spec.plugins` without replacing existing plugins.
- Operator config RBAC and CSV RBAC now include `operator.openshift.io/consoles` get/list/watch/update/patch, without create/delete.
- Static verifiers now fail if ConsolePlugin enablement is missing from Operator reconcile, RBAC, or CSV.
- Targeted Playwright coverage passed for language switching, Korean console navigation, ConsolePlugin proxy mode, and answer contract.

## Current Gaps

- Confirm the updated Operator image/bundle is installed in CRC from Software Catalog.
- Confirm installed ConsolePlugin is enabled in CRC and OpenShift Console shows the Cywell OpsLens left-nav entry.
- Validate that clicking the console-native entry opens the OpsLens dashboard asset, not only the debug tunnel.
- Keep vLLM/external runtime and PostgreSQL SCC workaround as explicit CRC/demo gaps until productized.

## Today Acceptance Criteria

| ID | Acceptance | Evidence |
| --- | --- | --- |
| AC-CMOD-001 | No fake OpenShift/OpsLens switch exists in the app header | `verify:web-shell` plus grep for `console-mode` and `activateNativeConsoleMode` |
| AC-CMOD-002 | No visible "standalone preview/local API path" product copy remains in customer shell | `verify:web-shell` plus Playwright UI check |
| AC-CMOD-003 | Globe language control toggles Korean/English consistently | Playwright shell test |
| AC-CMOD-004 | Left nav opens only the selected screen | Playwright navigation test |
| AC-CMOD-005 | ConsolePlugin contract documents official left-nav entry to the OpsLens app asset | `npm run verify:console-plugin` |
| AC-CMOD-006 | CRC OpenShift Console shows Cywell OpsLens entry after approved install/refresh | Live CRC evidence after user approval |
| AC-CMOD-007 | Clicking the console entry opens the OpsLens dashboard asset | Live CRC evidence after user approval |
| AC-CMOD-008 | Software Catalog install causes the Operator to enable `cywell-opslens` in `consoles.operator.openshift.io/cluster.spec.plugins` without dropping existing plugins | `npm run verify:operator:reconcile`, `npm run verify:operator:runtime`, `npm run verify:operator:package`, plus live CRC evidence after approval |

## Verification On 2026-06-18

| Check | Result |
| --- | --- |
| `npm run verify:web-shell` | PASS, 65 checks |
| `npm run -w @kugnus/web build` | PASS |
| `npm run -w @kugnus/operator-controller build` | PASS |
| `npm run verify:console-plugin` | PASS, 14 checks |
| `npm run verify:operator:reconcile` | PASS, 27 checks |
| `npm run verify:operator:runtime` | PASS, 91 checks |
| `npm run verify:operator:package` | PASS, 153 checks, 1 warning for missing local Go/Operator SDK runtime |
| `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-004|AC-UI-006|AC-UI-007|AC-ANS-001" --reporter=line` | PASS, 4 tests |

Local Go tooling note: `gofmt` is not available on this Windows workstation, so Go formatting/compile remains covered by source-shape verifiers and later image/runtime gates until Go tooling is installed.

## Approval Boundaries

Can do without asking:

- Edit local web code, tests, docs, verifiers.
- Build locally.
- Run non-mutating local tests.
- Inspect local files and current dev server.

Must ask first:

- Push new images to CRC registry.
- Recreate CatalogSource, Subscription, CSV, or OpsLensInstallation.
- Enable or patch ConsolePlugin resources.
- Create or modify secrets.
- Patch OLSConfig.
- Delete cluster resources.

## Next Implementation Order

1. Finish removal of development/meta UI from the product shell.
2. Update tests/verifier to make those removals permanent.
3. Verify local web build and targeted Playwright tests.
4. Inspect and correct `console-extensions.json` for one official left-nav shortcut to the OpsLens dashboard asset.
5. Rebuild/push the updated dashboard and operator images only if needed for the approved CRC install path.
6. Install from Software Catalog, then validate `ConsolePlugin/cywell-opslens`, `consoles.operator.openshift.io/cluster.spec.plugins`, and the real OpenShift Console left-nav entry.
7. After approval, click the console entry and capture OpsLens dashboard render evidence.
