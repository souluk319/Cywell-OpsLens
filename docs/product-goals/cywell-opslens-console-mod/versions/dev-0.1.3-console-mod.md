# Dev 0.1.3 Console Mod Ledger

| Field | Value |
| --- | --- |
| Lane | Official OpenShift ConsolePlugin full-page product experience |
| Branch | `feat/OpsLens-Dev0.1.3` |
| Head at lane start | `61cf02258f49cfeaece1b0fe3c3fa01086dc74bb` |
| Target | MacBook CRC OpenShift 4.21.14 |
| Status | Active, local contract pass |

## Goal

Turn Cywell OpsLens into a console-native full-page OpenShift experience using official ConsolePlugin extension points.

The product must feel like:

```text
OpenShift Console
-> Cywell OpsLens navigation or perspective entry
-> /opslens full-page app
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

- Official direction was locked: use supported ConsolePlugin route/navigation/perspective capabilities.
- The fake OpenShift/OpsLens header toggle was removed from the product shell.
- Language control was changed to a compact globe icon.
- Header was reduced toward customer-relevant state instead of long internal planning chips.
- Tests and verifiers started moving from "show implementation details" to "block implementation details from customer UI".
- OpenShift 4.21.14 console parity document was updated as the mapping contract.
- KOMSCO AI Assistant copy was changed from route/debug terminology to question-first guidance.
- Web shell verifier now blocks stale "standalone preview/local API path" customer-facing copy.
- ConsolePlugin asset verification confirms the `/opslens` route, navigation href, and UserToken proxy dashboard path.
- Targeted Playwright coverage passed for language switching, Korean console navigation, ConsolePlugin proxy mode, and answer contract.

## Current Gaps

- Confirm installed ConsolePlugin is enabled in CRC and OpenShift Console shows the Cywell OpsLens entry.
- Validate that clicking the console-native entry opens `/opslens` inside the OpenShift Console, not only the debug tunnel.
- Keep vLLM/external runtime and PostgreSQL SCC workaround as explicit CRC/demo gaps until productized.

## Today Acceptance Criteria

| ID | Acceptance | Evidence |
| --- | --- | --- |
| AC-CMOD-001 | No fake OpenShift/OpsLens switch exists in the app header | `verify:web-shell` plus grep for `console-mode` and `activateNativeConsoleMode` |
| AC-CMOD-002 | No visible "standalone preview/local API path" product copy remains in customer shell | `verify:web-shell` plus Playwright UI check |
| AC-CMOD-003 | Globe language control toggles Korean/English consistently | Playwright shell test |
| AC-CMOD-004 | Left nav opens only the selected screen | Playwright navigation test |
| AC-CMOD-005 | ConsolePlugin contract documents official `/opslens` full-page entry | `npm run verify:console-plugin` |
| AC-CMOD-006 | CRC OpenShift Console shows Cywell OpsLens entry after approved install/refresh | Live CRC evidence after user approval |
| AC-CMOD-007 | Clicking the console entry opens OpsLens as in-console full-page app | Live CRC evidence after user approval |

## Verification On 2026-06-18

| Check | Result |
| --- | --- |
| `npm run verify:web-shell` | PASS, 65 checks |
| `npm run -w @kugnus/web build` | PASS |
| `npm run verify:console-plugin` | PASS, 9 checks |
| `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-004|AC-UI-006|AC-UI-007|AC-ANS-001" --reporter=line` | PASS, 4 tests |

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
4. Inspect and correct `console-extensions.json` for `/opslens` full-page console entry.
5. Prepare exact CRC apply/push/install commands for user approval.
6. After approval, validate the real OpenShift Console entry and capture evidence.
