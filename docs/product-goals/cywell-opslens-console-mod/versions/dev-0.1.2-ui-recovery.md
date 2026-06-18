# Dev 0.1.2 UI Recovery Ledger

| Field | Value |
| --- | --- |
| Lane | KOMSCO UI recovery and debug dashboard usability |
| Reference target | Local web shell and CRC dashboard route |
| Status | Partial local proof |

## Goal

Make the Cywell OpsLens UI look like a coherent KOMSCO edition of an OpenShift operations console, not a raw evidence dump or developer notebook.

## Completed

- KOMSCO logo and Cywell OpsLens icon assets were moved into the web brand asset folder.
- Header branding was aligned around `Red Hat OpenShift · KOMSCO Edition` and `Cywell OpsLens`.
- Assistant launcher icon was changed from a generic robot style toward the Cywell OpsLens icon.
- Korean shell support was introduced.
- Enter submits the assistant question; Shift+Enter inserts a newline.
- Assistant was renamed to `KOMSCO AI Assistant`.
- Catalog icon and OperatorHub visual metadata were fixed after researching OpenShift catalog icon behavior.
- The installed dashboard could be reached through a local HTTPS debug tunnel.

## Problems Found

- Development goals, internal readiness chips, and long evidence queues leaked into customer-facing UI.
- Left navigation screens were effectively rendered as a large accumulated page in some flows instead of one selected screen at a time.
- A fake OpenShift/OpsLens mode toggle was added to the product header even though it was not an official OpenShift ConsolePlugin capability.
- The debug dashboard route was too easy to confuse with the real product entry.
- The assistant looked more like diagnostics than a user-facing guide.

## Lesson Locked

Product UI must not display the implementation plan. Internal evidence belongs in docs, tests, or collapsed diagnostics, not the main customer shell.

