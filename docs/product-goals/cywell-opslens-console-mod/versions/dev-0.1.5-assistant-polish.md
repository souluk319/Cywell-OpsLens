# Cywell OpsLens Dev 0.1.5 Assistant Polish

## Goal

Make the OpenShift Console-installed OpsLens shell feel like a usable console mod: the left navigation can collapse and reopen, and the KOMSCO AI Assistant feels like a real movable chatbot while keeping the 0.1.4 ConsolePlugin launch contract intact.

## Starting Point

- Dev 0.1.4 proves OperatorHub install, `ConsolePlugin` enablement, `/opslens` launch, and route-backed `API 연결됨`.
- The left navigation has collapse UI but must be verified and polished so open/close behavior is obvious and reliable.
- The bottom-right `KOMSCO AI Assistant` exists, but it needs a more chat-native presentation and better placement control.

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

## First Implementation Lane

1. Verify and polish the left navigation collapse/reopen behavior.
2. Refactor `AssistantPopover` into a chat-first surface.
3. Add a pinned/unlocked placement state.
4. Implement drag movement only when unlocked.
5. Verify the assistant does not block the underlying console content after moving.
6. Build, verify, and capture browser evidence.
