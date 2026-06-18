# Cywell OpsLens Dev 0.1.5 Assistant Polish

## Goal

Make the OpenShift Console-installed OpsLens shell feel like a usable console mod: the left navigation can collapse and reopen, and the KOMSCO AI Assistant feels like a real movable chatbot while keeping the 0.1.4 ConsolePlugin launch contract intact.

## Starting Point

- Dev 0.1.4 proves OperatorHub install, `ConsolePlugin` enablement, `/opslens` launch, and route-backed `API 연결됨`.
- Dev 0.1.5 builds on that by proving the local product shell: collapsible navigation, a single active page surface, a visual operations dashboard, and a movable chat-first `KOMSCO AI Assistant`.
- Fresh live CRC upgrade remains approval-gated; the local UI, package defaults, screenshots, and verifiers are the safe demo evidence.

## Acceptance Criteria

| ID | Pass condition | Evidence |
| --- | --- | --- |
| AC-015-001 | The left navigation collapse button closes the menu without breaking the active content surface | Browser interaction evidence |
| AC-015-002 | The left navigation reopen button restores the menu and keeps the active item selected | Browser interaction evidence |
| AC-015-003 | The bottom-right assistant launcher uses the Cywell OpsLens icon and opens a chat-first panel | Browser screenshot and UI test |
| AC-015-004 | The assistant panel can be unlocked and moved so it does not permanently cover console content | Browser interaction evidence |
| AC-015-005 | The assistant keeps Enter-to-send and Shift+Enter-to-newline behavior | UI test |
| AC-015-006 | Assistant answers continue to use the ConsolePlugin API proxy and show connected/fallback state honestly | Browser evidence and API diagnostics |
| AC-015-007 | No iframe, DOM injection, or unsupported OpenShift Console modification is introduced | `npm run verify:console-plugin` |

## Non-Goals

- Do not replace the original OpenShift Console chrome.
- Do not make the assistant mutate the cluster.
- Do not hide connection failure behind fake live AI copy.
- Do not re-run OperatorHub packaging unless image/catalog changes require it.

## Completed Implementation Lane

1. Verified and polished the left navigation collapse/reopen behavior.
2. Refactored `AssistantPopover` into a chat-first surface.
3. Added pinned and unlocked placement states.
4. Implemented bounded drag movement when unlocked.
5. Verified the assistant can be moved away from underlying console content.
6. Built, verified, and captured browser evidence for the dashboard, assistant, and mobile surface.

## Checkpoint 2026-06-18 22:23 KST

Branch: `feat/OpsLens-Dev0.1.5`

Head before this checkpoint: `5a3f865a`

Implemented scope:

- Left navigation state is persisted with validated active item and expanded sections.
- Selecting any mapped OpenShift Console item remounts a single active page surface for that item.
- OpsLens operations dashboard now uses derived health score, severity distribution, exposure trend, evidence coverage, and action insight visuals instead of plain text lists.
- KOMSCO AI Assistant now has pinned and movable modes, a placement status, a drag handle, and clamped floating coordinates.
- ConsolePlugin route launcher now constructs the UserToken proxy base explicitly and passes it through `apiBase`.

Verification:

- `npm run -w @kugnus/web build`: pass.
- `npm run verify:web-shell`: pass, `66 checks`, `0 fail`.
- `npm run verify:console-plugin`: pass, `15 checks`, `0 fail`.
- `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-002b"`: pass.
- `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-003|AC-DASH-001"`: pass.
- `git diff --check`: pass.

Resolved follow-up:

- Curated screenshot evidence now exists for the Dev 0.1.5 dashboard, movable assistant, and mobile navigation surface.
- `verify:demo-brief-pages` checks those assets, mobile viewport readiness, README/Pages wiring, and a public Pages smoke.
- `AC-UI-002b`, `AC-UI-005`, and `AC-DASH-001` now cover assistant movement, nav retention after collapse/reopen, and dashboard visual semantics.
- This lane still does not mutate CRC/OCP, replace catalog images, patch `OLSConfig`, or push registry images.

## Completion Checkpoint 2026-06-18 23:58 KST

Branch/head: `feat/OpsLens-Dev0.1.5` / `2efb1b6e`

Verified evidence:

- `npm run verify:web-shell`: pass, `66 checks`, `0 fail`.
- `npm run verify:demo-brief-pages`: pass, public Pages smoke included.
- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.
- `npm run verify:dev015-acceptance`: pass, `15 checks`, `0 fail`.
- `npm run overnight:checkpoint`: pass, `14 steps`, visible label reports `Cywell OpsLens Dev 0.1.5 Overnight Checkpoint`.

Remaining boundary:

- Fresh live CRC Dev 0.1.5 upgrade proof is not performed by this lane because registry push, CatalogSource replacement, Subscription upgrade, and ConsolePlugin enablement are live cluster mutations that require explicit approval.
