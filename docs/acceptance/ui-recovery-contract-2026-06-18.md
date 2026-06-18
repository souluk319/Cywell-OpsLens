# Cywell OpsLens UI Recovery Contract

Date: 2026-06-18
Branch: feat/OpsLens-Dev0.1.2

## Goal

Cywell OpsLens must behave like an OpenShift Console enhancement, not a developer workbench.
The left navigation must open one product surface at a time, and customer-facing screens must not show Codex work lists, internal approval queues, raw release evidence, or implementation notes by default.

## Locked Scope

Do now:

- Remove the global install/demo checklist from directly under the masthead.
- Render only the active left-menu surface in the main workspace.
- Keep internal evidence in tests, API evidence, documentation, or collapsed admin diagnostics, not in the default product path.
- Verify the local web shell and AC-DASH behavior after the UI restructure.

Do not do in this lane:

- Do not mutate the CRC cluster.
- Do not reinstall the Operator.
- Do not patch OLSConfig.
- Do not add new product promises or new OpenShift features.
- Do not expose `.env`, tokens, exact OCP host/IP, or secret values.

## Acceptance Criteria

| ID | Requirement | Pass/Fail Method | Evidence |
| --- | --- | --- | --- |
| UI-REC-001 | Header contains only product identity, API state, language toggle, and native console utility icons. | Browser/UI test: no global `opslens-status-details` strip under the masthead. | DOM/test output |
| UI-REC-002 | Clicking a left nav item renders that item's surface only. | Browser/UI test: active surface count is 1 and unrelated major surfaces are not mounted. | DOM/test output |
| UI-REC-003 | Development checklists and raw approval queues are not customer-default UI. | Text scan + Playwright: raw keys like `clusterMutationAttempted=false` or long worklist chips are absent from default shell. | Test output |
| UI-REC-004 | OpsLens Admin can still show install/readiness evidence, but only inside the OpsLens Admin surface. | Click OpsLens Admin and verify readiness/admin sections are visible there. | Playwright output |
| UI-REC-005 | The implementation remains read-only/local until the user approves cluster changes. | No `oc apply`, install, OLSConfig patch, or secret mutation in this lane. | Command history/report |

## Current Judgment

The previous UI mixed product surfaces with internal implementation evidence. That made progress hard to trust because a user could not tell whether they were using OpsLens or reading Codex's development checklist.

The recovery path is to separate product UI from internal evidence:

- Product UI: one active OpenShift/OpsLens surface at a time.
- Internal evidence: verifier output, docs, API evidence, or collapsed admin-only diagnostics.

