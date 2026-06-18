# Dev 0.1.4 Console Launcher Ledger

| Field | Value |
| --- | --- |
| Lane | Official OpenShift ConsolePlugin left-nav launcher |
| Branch | `feat/OpsLens-Dev0.1.4` |
| Base head | `6edcf2d5642b68a3e75c33be8b80087d3babc867` |
| Target | MacBook CRC OpenShift 4.21.14 |
| Status | Local package ready for user-approved CRC apply |

## Locked Goal

Cywell OpsLens must install from OperatorHub/Software Catalog, then appear as a normal OpenShift Console left navigation entry named `Cywell OpsLens`.

The entry must open the real OpsLens dashboard as an independent full-page app. The OpenShift Console is the launcher and source of trust; the dashboard is not embedded as an iframe and the original console DOM is not patched.

## Correct Flow

```text
Software Catalog / OperatorHub
-> install Cywell OpsLens Operator
-> create OpsLensInstallation
-> Operator creates API, dashboard, Route, ConsolePlugin
-> Operator enables cywell-opslens in consoles.operator.openshift.io/cluster spec.plugins
-> OpenShift Console reloads
-> Administrator left navigation shows Cywell OpsLens
-> clicking Cywell OpsLens opens /opslens
-> /opslens route immediately redirects to the OpsLens dashboard app
```

## Why Previous Attempts Failed

- The left navigation item itself did appear, so the entry point is possible.
- The menu text leaked plugin i18n key text such as `%plugin__...`, which made the menu look broken.
- The target page was wrong: the route component tried to render or embed the app instead of acting as a minimal launcher.
- Console route, standalone route, direct plugin asset URL, dashboard route, and iframe ideas were mixed together.

## Implementation Contract

| Area | Required behavior |
| --- | --- |
| Navigation label | Plain `Cywell OpsLens`; no `%plugin__...` key is allowed to appear |
| Navigation href | `/opslens` |
| Route | `console.page/route` for `/opslens` |
| Route component | Default-exported redirect-only React component |
| Rendering | Returns `null`; does not render dashboard UI inside Console |
| Embedding | No iframe |
| Destination | OpsLens dashboard Route or plugin-served dashboard asset with Console API proxy query |
| API proxy | Dashboard receives `/api/proxy/plugin/cywell-opslens/opslens-api` when launched from Console |

## Acceptance Criteria

| ID | Pass condition | Evidence |
| --- | --- | --- |
| AC-014-001 | `console-extensions.json` has one `console.navigation/href` named `Cywell OpsLens` pointing to `/opslens` | `npm run verify:console-plugin` |
| AC-014-002 | `console-extensions.json` has one `console.page/route` for `/opslens` | `npm run verify:console-plugin` |
| AC-014-003 | `OpsLensRoute` is default-exported, redirect-only, and contains no iframe | `npm run verify:console-plugin` |
| AC-014-004 | Built plugin manifest contains the route chunk and no broken i18n label | `npm run -w @kugnus/web build`, `npm run verify:console-plugin` |
| AC-014-005 | Dashboard asset loads from the ConsolePlugin asset path without broken `/assets/...` URLs | `npm run verify:console-plugin` |
| AC-014-006 | Operator still enables the ConsolePlugin without dropping existing plugins | `npm run verify:operator:reconcile`, `npm run verify:operator:runtime`, `npm run verify:operator:package` |
| AC-014-007 | Live CRC console left navigation shows `Cywell OpsLens` after install/refresh | User-approved CRC evidence |
| AC-014-008 | Clicking `Cywell OpsLens` opens the OpsLens dashboard app | User-approved CRC evidence |

## 2026-06-18 Local Evidence

- `npm run -w @kugnus/web build`: PASS.
- `npm run verify:console-plugin`: PASS, including the `/opslens` route launcher, no iframe, no `%plugin__...` label leak, and relative `./assets/...` dashboard paths.
- `npm run lab:catalog:crc -- --dev-version 0.1.4 --dev-image-tag v0.1.4-crc-d150f9fa --out-dir test-results/crc-dev-catalog-v0.1.4 --evidence-out test-results/cywell-opslens-crc-dev-catalog-context-v0.1.4.json --markdown-out test-results/cywell-opslens-crc-dev-catalog-context-v0.1.4.md`: PASS, 0 fail, 31 pass.
- `npm run verify:operator:package`: PASS, 0 fail, 1 warning for the still-manual live Operator SDK/OLM smoke lane.
- Built five `linux/arm64` images tagged `v0.1.4-crc-d150f9fa`: operator, API, dashboard, operator bundle, and catalog.
- Saved CRC transfer tar: `test-results/cywell-opslens-crc-v0.1.4-crc-d150f9fa-arm64.tar`.
- Confirmed the dashboard image contains `./assets/...` paths in `apps/web/dist/index.html`.

## Explicit Non-Goals

- Do not iframe the dashboard inside the OpenShift Console page.
- Do not patch or inject into the original console DOM.
- Do not expose development work queues, internal chips, or debug wording in customer UI.
- Do not use the debug port-forward URL as the product entry.
- Do not mutate company OCP.

## Next Work

1. Restore a clean `/opslens` ConsolePlugin route.
2. Implement `OpsLensRoute` as a tiny redirect-only launcher.
3. Update verifiers so this exact contract fails fast if broken.
4. Build and verify locally.
5. Commit and push `feat/OpsLens-Dev0.1.4`.
6. Only after approval, load/push the 0.1.4 CRC images and validate from the OpenShift Console UI.
