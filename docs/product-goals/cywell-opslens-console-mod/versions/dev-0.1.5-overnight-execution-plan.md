# Cywell OpsLens Dev 0.1.5 Overnight Execution Plan

## Timebox

- Start target: 2026-06-18 22:15 KST
- Finish target: 2026-06-19 09:00 KST
- Working window: about 10h 45m
- Branch: `feat/OpsLens-Dev0.1.5`

## Goal

Prepare a working Dev 0.1.5 demo that shows Cywell OpsLens as a credible OpenShift Console extension product, not just a separate dashboard. The demo must make it clear that OpsLens understands the original OpenShift Console structure, adds an operator-facing analysis layer, and improves the visual and assistant experience in a way that is worth presenting.

## Completion Criteria

| Area | Pass condition | Evidence |
| --- | --- | --- |
| Left navigation | Navigation groups can collapse and reopen without losing active page state | Browser interaction evidence or UI verifier |
| Page routing | Selecting a left menu item shows only the matching OpsLens page content | Browser evidence and code verifier |
| Custom dashboard | Overview uses cards, charts, risk/health visualization, and action-oriented summaries instead of plain text lists | Screenshot and static/UI verifier |
| OCP feature mapping | OpenShift Console 4.21.14 menu/function scope is mapped to OpsLens screens and actions | Product mapping doc and UI surface |
| KOMSCO AI Assistant | Assistant looks and behaves like a chat UI with context, messages, input, and connected/fallback state | Browser evidence |
| Assistant placement | Assistant can be pinned/unpinned and moved or repositioned so it does not permanently cover console content | Browser interaction evidence |
| Mobile/desktop response | Presentation page and key OpsLens surfaces remain usable on desktop and mobile widths | Static responsive checks and screenshots |
| Truthful status | Live, fallback, and unimplemented states are clearly distinguishable | UI copy and verifier |
| Release hygiene | Relevant checks pass, intended files only are committed and pushed | Command output and git ref stamp |

## Non-Goals

- Do not mutate the company OCP cluster.
- Do not patch `OLSConfig`, create secrets, push registry images, or change RBAC without explicit approval.
- Do not use iframe-based console-in-console embedding.
- Do not inject unsupported DOM changes into the OpenShift Console.
- Do not show internal work instructions, planning notes, or raw task lists in the product UI.
- Do not present fallback/demo data as live cluster data.

## Work Schedule

| Window | Lane | Output |
| --- | --- | --- |
| 22:15-22:35 | State lock | Record branch, head SHA, dirty files, active 0.1.5 documents, and current verifier baseline |
| 22:35-23:35 | Left navigation UX | Collapsible groups, reopen control, active item preservation, single-page content behavior |
| 23:35-01:10 | Custom dashboard visualization | OpsLens overview with status cards, charts, risk distribution, trend/health visuals, and recommended actions |
| 01:10-02:20 | OpenShift Console mapping | Map original console areas to OpsLens screens, actions, and read-only/product boundaries |
| 02:20-03:40 | KOMSCO AI Assistant polish | Chat-first panel, context header, message states, input behavior, connected/fallback state |
| 03:40-04:30 | Assistant placement | Pin/unpin mode, movable or preset placement, no permanent coverage of console content |
| 04:30-05:20 | Data-state honesty | Live API, local fallback, unavailable, and planned states shown clearly and consistently |
| 05:20-06:20 | Responsive QA | Mobile and desktop CSS fixes for OpsLens UI and presentation page |
| 06:20-07:20 | Verification | Add or run focused checks for nav, dashboard, assistant, mapping, and Pages artifacts |
| 07:20-08:10 | Presentation and README refresh | Update GitHub Pages brief and README links/status if the UI/story changed |
| 08:10-08:45 | Final validation and push | Run closest relevant checks, stage intended files only, commit, push |
| 08:45-09:00 | Morning handoff | Summarize working demo URL, branch/head, verification results, demo flow, and remaining approval gates |

## Checkpoint Format

Every checkpoint must use this format:

```text
time:
branch/head:
completed:
validation:
blocked:
next:
```

## Priority Rule

If time becomes tight, prioritize in this order:

1. Working visible demo.
2. Custom dashboard visual impact.
3. Assistant usability and placement.
4. OpenShift function mapping clarity.
5. Documentation and presentation polish.

## Approval Gates

Stop for explicit approval before:

- Any CRC/OCP cluster mutation beyond local read-only verification.
- Registry image push.
- Operator package or catalog replacement.
- Secret, RBAC, SCC, or `OLSConfig` changes.
- Destructive cleanup.
- External service setup or paid resource use.

## Final Report Requirements

The final report must include:

- Branch and head SHA.
- Files changed.
- Verification commands and results.
- GitHub Pages URL if updated.
- What can be demonstrated immediately.
- What still requires user approval or live CRC access.

## Execution Checkpoint 2026-06-18 22:23 KST

time: 2026-06-18 22:23 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `5a3f865a` before checkpoint commit

completed:

- Left navigation lane was delegated and integrated.
- Dashboard visualization lane was delegated and integrated.
- OCP 4.21.14 mapping lane was delegated as a read-only audit and confirmed the current registry scope.
- Assistant UX and placement lane was implemented directly to avoid file ownership conflicts.
- A new assistant movable placement verifier was added to the web shell contract.

validation:

- `npm run -w @kugnus/web build`: pass.
- `npm run verify:web-shell`: pass, `66 checks`, `0 fail`.
- `npm run verify:console-plugin`: pass, `15 checks`, `0 fail`.
- `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-002b"`: pass.
- `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-003|AC-DASH-001"`: pass.
- `git diff --check`: pass.

blocked: none for the local non-mutating lane.

next:

- Capture browser evidence for navigation, dashboard visuals, and movable assistant.
- Continue responsive polish if screenshots show layout issues.
- Commit and push only intended 0.1.5 files.

## Execution Checkpoint 2026-06-18 22:55 KST

time: 2026-06-18 22:55 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `210ba09d` before packaging-fix commit

completed:

- Replaced the stale fixed `v0.1.2-dev-crc` CRC readiness contract with a generated-catalog-driven contract.
- Fixed the CRC catalog context generator so `alm-examples` API/dashboard images are rewritten with the current CRC dev image tag, not only the CSV version.
- Updated the CRC lightweight sample and OperatorHub first example payload to `0.1.5-dev` / `v0.1.5-dev-crc`.
- Built a fresh `linux/arm64` dashboard image from the current 0.1.5 UI, rebuilt bundle/catalog images from the generated 0.1.5 catalog context, and saved `test-results/cywell-opslens-crc-v0.1.5-dev-crc-arm64.tar`.
- Moved lab image-map/bootstrap/handoff defaults to `v0.1.5-dev-crc` so the no-argument local automation path no longer falls back to the old 0.1.2 demo tag.

validation:

- `npm run lab:catalog:crc`: pass, generated `cywell-opslens-operator.v0.1.5` and `v0.1.5-dev-crc` catalog context.
- `npm run verify:crc-demo-readiness`: pass, `25 checks`, `0 fail`, `0 warn`.
- `npm run verify:operator:package`: pass, `153 checks`, `0 fail`, `1 warn`.
- `npm run verify:operator:runtime`: pass, `91 checks`, `0 fail`.
- `npm run verify:lab-image-map`: pass, `0 fail`, warnings only for dirty worktree/external runtime review boundaries.
- `npm run verify:lab-bootstrap`: pass, confirms `test-results/cywell-opslens-crc-v0.1.5-dev-crc-arm64.tar` contains all five required tags.
- `npm run verify:lab-handoff`: pass, confirms the 0.1.5 transfer tar and local image tags are present.

blocked:

- No local packaging blocker remains.
- Live CRC registry push, CatalogSource replacement, Subscription upgrade, and ConsolePlugin enablement remain approval-gated cluster mutations.

next:

- Commit and push the 0.1.5 packaging-readiness fix.
- Re-run `npm run overnight:checkpoint` from the committed head.
- Restart `npm run overnight:loop` only if the checkpoint is pass or clearly report the remaining non-local blocker.

## Execution Checkpoint 2026-06-18 23:30 KST

time: 2026-06-18 23:30 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `b081a5b9` before evidence-capture commit

completed:

- Added a reproducible Dev 0.1.5 browser evidence capture command.
- Captured tracked presentation assets for:
  - visual operations dashboard,
  - movable KOMSCO AI Assistant,
  - mobile responsive OpsLens dashboard.
- Fixed dashboard visualization CSS so severity bars and action insight text do not overlap in the captured presentation screenshots.
- Updated the presentation HTML/Markdown to include the Dev 0.1.5 screenshots and mark the assistant UX demo state as verified.

validation:

- `npm run -w @kugnus/web build`: pass.
- `npm run evidence:dev015:screens`: pass, generated all three screenshot assets above size threshold.
- Manual screenshot inspection: pass for dashboard text overlap fix and movable assistant evidence.

blocked:

- No local evidence-capture blocker remains.
- Live CRC upgrade proof remains approval-gated cluster mutation.

next:

- Run focused web shell / console plugin verification.
- Commit and push the evidence-capture update.
- Re-run `npm run overnight:checkpoint` from the committed head, then restart `npm run overnight:loop`.

## Execution Checkpoint 2026-06-18 23:45 KST

time: 2026-06-18 23:45 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `a94a0c2b` before Pages-verifier commit

completed:

- Added a local GitHub Pages/demo brief verifier for the presentation delivery path.
- Wired the verifier into `npm run overnight:checkpoint` so the overnight loop watches the README link, Pages workflow, presentation HTML, mobile viewport, and screenshot asset references.
- Kept live GitHub Pages status as an explicit optional check because `gh` is not currently on PATH in this PowerShell session.

validation:

- `npm run verify:demo-brief-pages`: pass, `0 fail`, `1 warn`.
- Warning is limited to optional GitHub CLI availability; the local Pages artifact contract passed.

blocked:

- No local Pages artifact blocker remains.
- Live GitHub Pages deployment status query requires `gh` on PATH or browser/GitHub UI confirmation.

next:

- Run the full checkpoint with the new Pages gate included.
- Commit and push the Pages-verifier update if checkpoint passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-18 23:55 KST

time: 2026-06-18 23:55 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `1fe8b223` before Pages-smoke commit

completed:

- Upgraded the Pages/demo brief verifier from a local artifact-only gate to a local artifact plus read-only public URL smoke gate.
- The public URL smoke checks for HTTP 200 plus the current Dev 0.1.5 dashboard and KOMSCO AI Assistant evidence.
- External Pages/network failures remain warnings rather than hard failures, so the local presentation contract stays the authoritative overnight gate.
- Updated the 0.1.5 morning handoff to point at checkpoint evidence instead of a stale hand-entered head SHA.
- Closed review gaps found in the UI/evidence audit:
  - active navigation now has an e2e assertion that it survives collapse and reopen,
  - dashboard visualization has direct e2e assertions for severity distribution, exposure trend, and active risk list,
  - assistant movement has a direct drag assertion in addition to the preset move button,
  - presentation Markdown no longer carries stale 0.1.4 head or unfinished 0.1.5 wording.

validation:

- `npm run -w @kugnus/web build`: pass.
- `npm run verify:demo-brief-pages`: pass, `18 checks`, `0 fail`, `1 warn` for optional `gh` availability.
- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.
- `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-002b|AC-UI-005|AC-DASH-001"`: pass, `3 passed`.
- `npm run overnight:checkpoint`: pass, `13/13` steps.

blocked:

- No local implementation blocker.
- Live CRC cluster upgrade remains approval-gated.

next:

- Run the pending verification commands.
- Commit and push the Pages-smoke verifier if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-18 23:35 KST

time: 2026-06-18 23:35 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `2497569d` before acceptance-audit commit

completed:

- Added `dev-0.1.5-acceptance-audit.md` as the requirement-by-requirement proof table for the morning demo.
- Added `npm run verify:dev015-acceptance`.
- Wired `verify:dev015-acceptance` into `npm run overnight:checkpoint`.
- Updated the morning handoff to point presenters at the acceptance audit and verification command.

validation:

- `npm run verify:dev015-acceptance`: pass, `13 checks`, `0 fail`.
- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.
- `npm run overnight:checkpoint`: pass, `14/14` steps including `dev015-acceptance`.

blocked:

- No local audit blocker.
- Live CRC Dev 0.1.5 upgrade proof remains approval-gated.

next:

- Run the pending verification commands.
- Commit and push the acceptance-audit gate if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-18 23:20 KST

time: 2026-06-18 23:20 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `8aafe32e` before morning-handoff commit

completed:

- Added a Dev 0.1.5 morning handoff for the 2026-06-19 09:00 KST demo target.
- The handoff gives the public demo URL, verified branch, safe morning commands, five-minute demo flow, tracked screenshot evidence, and approval-gated actions.
- Added `npm run verify:dev015-handoff`.
- Wired `verify:dev015-handoff` into `npm run overnight:checkpoint` so the loop now protects the Dev 0.1.5 handoff in addition to the legacy Dev 0.1.2 freshness gate.
- Performed a read-only public Pages check: `https://souluk319.github.io/Cywell-OpsLens/` returned HTTP 200 and contained the Dev 0.1.5 dashboard screenshot reference.

validation:

- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.

blocked:

- No local handoff blocker remains.
- Live CRC Dev 0.1.5 upgrade proof remains approval-gated cluster mutation.

next:

- Run the full checkpoint with the Dev 0.1.5 handoff gate included.
- Commit and push the handoff update if checkpoint passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-18 23:45 KST

time: 2026-06-18 23:45 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `4b241333`

completed:

- Audited the subagent usage from the prior Dev 0.1.5 hardening pass.
- Closed the completed reviewer agents after their findings were integrated.
- Corrected the overnight checkpoint's human-facing label from Dev 0.1.2 to Dev 0.1.5 while keeping the legacy file name for compatibility.
- Added an acceptance-audit guard so the stale Dev 0.1.2 visible label cannot return silently.

validation:

- `npm run verify:dev015-acceptance`: pass, `14 checks`, `0 fail`.
- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.
- `npm run overnight:checkpoint`: pass, `14 steps`, visible label reports `Cywell OpsLens Dev 0.1.5 Overnight Checkpoint`.

blocked:

- No local implementation blocker.
- Live CRC mutation and registry work remain approval-gated.

next:

- Run the pending verification commands.
- Commit and push the label correction if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-18 23:58 KST

time: 2026-06-18 23:58 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `2efb1b6e`

completed:

- Reviewed the active 0.1.5 docs after the loop restarted.
- Found `dev-0.1.5-assistant-polish.md` still described early implementation gaps even though dashboard, assistant, mobile screenshots, and acceptance verifiers now exist.
- Updated that document from "first implementation lane" to completed local UI lane.
- Added a `verify:dev015-acceptance` guard so stale assistant-polish wording cannot return silently.

validation:

- `npm run verify:dev015-acceptance`: pass, `15 checks`, `0 fail`.
- `npm run verify:dev015-handoff`: pass, `12 checks`, `0 fail`, `0 warn`.
- `npm run overnight:checkpoint`: pass, `14 steps`, visible label reports `Cywell OpsLens Dev 0.1.5 Overnight Checkpoint`.

blocked:

- No local documentation or verifier blocker.
- Fresh live CRC Dev 0.1.5 upgrade proof remains approval-gated.

next:

- Run the pending verification commands.
- Commit and push the stale-doc cleanup if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-19 00:10 KST

time: 2026-06-19 00:10 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `1c8cf2ed`

completed:

- Compared the execution plan's final report requirements against the morning handoff.
- Added a `Final Report Coverage` section to the morning handoff so branch/head, changed files, verification commands, Pages URL, immediate demo scope, and approval-gated items are visible in one table.
- Added a `verify:dev015-handoff` guard so those final report fields cannot disappear silently.

validation:

- `npm run verify:dev015-handoff`: pass, `13 checks`, `0 fail`, `0 warn`.
- `npm run verify:dev015-acceptance`: pass, `15 checks`, `0 fail`.
- `npm run overnight:checkpoint`: pass, `14 steps`, visible label reports `Cywell OpsLens Dev 0.1.5 Overnight Checkpoint`.

blocked:

- No local reporting blocker.
- Fresh live CRC Dev 0.1.5 upgrade proof remains approval-gated.

next:

- Run the pending verification commands.
- Commit and push the final-report coverage update if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-19 00:25 KST

time: 2026-06-19 00:25 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `08bd743c`

completed:

- Confirmed `gh` is not on PATH.
- Avoided software installation because the 0.1.5 automation lane should stay local, non-mutating, and approval-light unless installation is explicitly requested for this exact turn.
- Added a public GitHub API fallback to `verify:demo-brief-pages` so live Pages workflow status can be queried without GitHub CLI.
- Updated the morning handoff to treat `gh` as optional and explain the fallback.
- Added a handoff verifier guard for the workflow-status fallback.

validation:

- `npm run verify:demo-brief-pages`: pass, `19 checks`, `0 fail`, `0 warn`; public URL smoke and GitHub workflow-status API fallback both passed.
- `npm run verify:dev015-handoff`: pass, `14 checks`, `0 fail`, `0 warn`.
- `npm run verify:dev015-acceptance`: pass, `15 checks`, `0 fail`.
- `npm run overnight:checkpoint`: pass, `14 steps`, visible label reports `Cywell OpsLens Dev 0.1.5 Overnight Checkpoint`.

blocked:

- No local Pages verification blocker.
- Fresh live CRC Dev 0.1.5 upgrade proof remains approval-gated.

next:

- Run the pending verification commands.
- Commit and push the Pages workflow-status fallback if verification passes.
- Restart `npm run overnight:loop` from the committed head.

## Execution Checkpoint 2026-06-19 00:45 KST

time: 2026-06-19 00:45 KST

branch/head: `feat/OpsLens-Dev0.1.5` / `53ee46b1`

completed:

- Audited the active 0.1.5 schedule against current evidence.
- Added the Final readiness audit, `dev-0.1.5-final-readiness-audit.md`, with a `READY_FOR_DEMO` verdict for the supported local/product demo path.
- Added `npm run verify:dev015-final-readiness`.
- Wired `verify:dev015-final-readiness` into `npm run overnight:checkpoint`.
- Updated morning handoff and acceptance audit references so the final readiness gate, workflow-status fallback, and approval boundaries stay aligned.

validation:

- `npm run verify:demo-brief-pages`: pass, `19 checks`, `0 fail`, `0 warn`.
- `npm run verify:dev015-handoff`: pass, `14 checks`, `0 fail`, `0 warn`.
- `npm run verify:dev015-acceptance`: pass, `16 checks`, `0 fail`.
- `npm run verify:dev015-final-readiness`: pass, `14 checks`, `0 fail`.
- `npm run overnight:checkpoint`: pass, `15 steps`, `0 fail`.

blocked:

- No local final-readiness blocker.
- Fresh live CRC Dev 0.1.5 upgrade proof remains approval-gated.

next:

- Commit and push the final readiness audit.
- Restart `npm run overnight:loop` from the committed head.
