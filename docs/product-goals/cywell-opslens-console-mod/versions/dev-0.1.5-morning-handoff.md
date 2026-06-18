# Cywell OpsLens Dev 0.1.5 Morning Handoff

Generated for the 2026-06-19 09:00 KST demo target.

## Read First

| Item | Current value |
| --- | --- |
| Branch | `feat/OpsLens-Dev0.1.5` |
| Last verified checkpoint evidence | `test-results/cywell-opslens-dev012-overnight-checkpoint.json` |
| Public demo brief | https://souluk319.github.io/Cywell-OpsLens/ |
| Local presentation HTML | `docs/product-goals/cywell-opslens-console-mod/presentation/cywell-opslens-demo-brief-2026-06-18.html` |
| Acceptance audit | `docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-acceptance-audit.md` |
| Primary checkpoint | `npm run overnight:checkpoint` |
| Pages/demo brief gate | `npm run verify:demo-brief-pages` |

The Pages/demo brief gate now performs a read-only public URL smoke check. A reachable public page must include the current Dev 0.1.5 dashboard and KOMSCO AI Assistant evidence; transient external/network failures remain warnings so the local artifact contract stays the authoritative gate.

The only expected dirty entry during the loop is the unrelated untracked idea note:

```text
?? kugnus-idea/Cywell-OpsBrain/Cywell-OpsLens.md
```

Do not stage that file as part of the Dev 0.1.5 handoff.

## Current Demo Story

Cywell OpsLens is shown as an OpenShift Console extension product, not a replacement shell and not a browser hack.

1. OpenShift stays the trusted entry point.
2. Software Catalog / OperatorHub shows `Cywell OpsLens`.
3. OLM installs the Operator through Subscription, InstallPlan, CSV, and CRD resources.
4. `OpsLensInstallation` applies the API, dashboard, and ConsolePlugin resources.
5. The OpenShift console gets a `Cywell OpsLens` entry through the supported ConsolePlugin path.
6. The entry opens the full-page OpsLens dashboard.
7. OpsLens adds a KOMSCO-branded operations dashboard and KOMSCO AI Assistant while staying read-only / plan-first by default.

## What Is Proven

| Capability | Evidence |
| --- | --- |
| Software Catalog presence | `docs/product-goals/cywell-opslens-console-mod/presentation/assets/catalog-cywell-opslens-card.png` |
| Catalog detail install modal | `docs/product-goals/cywell-opslens-console-mod/presentation/assets/catalog-cywell-opslens-detail.png` |
| Operator install path | Dev 0.1.1 through Dev 0.1.4 version ledgers under `docs/product-goals/cywell-opslens-console-mod/versions/` |
| ConsolePlugin route contract | `npm run verify:console-plugin` |
| OCP 4.21.14 menu/function mapping | `npm run verify:web-shell` |
| Visual operations dashboard | `docs/product-goals/cywell-opslens-console-mod/presentation/assets/dev015-opslens-dashboard-desktop.png` |
| Movable KOMSCO AI Assistant | `docs/product-goals/cywell-opslens-console-mod/presentation/assets/dev015-opslens-assistant-movable.png` |
| Mobile presentation surface | `docs/product-goals/cywell-opslens-console-mod/presentation/assets/dev015-opslens-mobile-nav.png` |
| Public demo brief delivery | `npm run verify:demo-brief-pages` checks the local artifact contract and performs a read-only public URL smoke check |
| Requirement-by-requirement acceptance | `npm run verify:dev015-acceptance` checks the 0.1.5 audit against source hooks, e2e coverage, and latest evidence |

## Morning Verification Commands

Run these before the demo if the machine is available:

```bash
git status --short --branch
npm run overnight:checkpoint
npm run verify:demo-brief-pages
npm run verify:dev015-acceptance
```

Optional read-only CRC checks, only if the Mac CRC session is connected:

```bash
oc get co console
oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}{"\n"}'
oc get opslensinstallation,deploy,pod,svc,route,consoleplugin -n cywell-opslens
```

These commands are read-only. They do not patch, apply, delete, scale, push, mirror, create secrets, or change OLSConfig.

## 5-Minute Demo Flow

1. Open the public demo brief and start from the official evidence section.
2. Show that the scope is bounded by Red Hat-supported OpenShift extension points: OperatorHub/OLM/ConsolePlugin/web console customization.
3. Show the Software Catalog card and detail modal screenshots.
4. Explain the install chain: CatalogSource -> PackageManifest -> Subscription -> CSV -> `OpsLensInstallation` -> ConsolePlugin.
5. Show the Dev 0.1.5 visual dashboard screenshot and explain why it is more useful than plain console text during operations.
6. Show the movable KOMSCO AI Assistant screenshot and explain why it avoids permanently covering console content.
7. Close with the boundary: read-only / plan-first by default; production mutation and Lightspeed patching require approval.

## Final Report Coverage

| Required item | Morning answer |
| --- | --- |
| Branch and head SHA | Branch is `feat/OpsLens-Dev0.1.5`; current head is proven by `npm run overnight:checkpoint` evidence. |
| Files changed | Main 0.1.5 artifacts are `apps/web/src/App.tsx`, `apps/web/src/components/OperationsDashboard.tsx`, `apps/web/src/components/AssistantPopover.tsx`, `tests/e2e/mvp-0.1.spec.ts`, `scripts/verify-web-shell-contract.mjs`, `scripts/verify-demo-brief-pages.mjs`, `scripts/verify-dev015-acceptance-audit.mjs`, `docs/product-goals/cywell-opslens-console-mod/presentation/`, and `docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.5-*`. |
| Verification commands and results | `npm run overnight:checkpoint`, `npm run verify:demo-brief-pages`, `npm run verify:dev015-acceptance`, `npm run verify:dev015-handoff`, `npm run verify:web-shell`, and `npm run verify:console-plugin` are the demo gates. |
| GitHub Pages URL | https://souluk319.github.io/Cywell-OpsLens/ |
| Demonstrable immediately | Official extension evidence, Software Catalog screenshots, install-chain explanation, ConsolePlugin route contract, visual operations dashboard, movable KOMSCO AI Assistant, and mobile-ready presentation surface. |
| Still approval-gated | Live CRC registry/catalog/subscription upgrade, `ConsolePlugin` enablement on a live cluster, `OLSConfig` patching, secrets/RBAC/SCC changes, production vLLM runtime, and production pgvector/storage hardening. |

## Do Not Do Without Fresh Approval

- Do not push CRC registry images.
- Do not replace CatalogSource or Subscription on a live cluster.
- Do not patch `OLSConfig`.
- Do not create secrets, registry credentials, SCC/RBAC workarounds, or service accounts.
- Do not delete live cluster resources to clean up a stale install.
- Do not claim production vLLM/pgvector readiness from the CRC lightweight profile.

## Known Gaps

| Gap | Meaning | Next action |
| --- | --- | --- |
| Live CRC Dev 0.1.5 upgrade proof | The local package and UI are ready, but applying/upgrading on CRC is a cluster mutation. | Ask for explicit approval before pushing/replacing/installing. |
| `gh` not on PATH | The local Pages contract passes and the verifier performs a public URL smoke check, but GitHub CLI deployment status may still be unavailable. | Use browser/GitHub UI or install/fix `gh` PATH if live workflow state is needed. |
| Production model runtime | CRC demo uses lightweight `mock-local` runtime. | Keep vLLM/GPU as a separate production runtime lane. |
| Production vector store | CRC demo avoids pgvector StatefulSet/SCC friction. | Keep pgvector/storage security as a separate approval-backed lane. |

## Final Morning Decision

If `npm run overnight:checkpoint` passes and the public demo brief opens, the safe 0.1.5 demo path is:

```text
Official evidence -> Catalog screenshots -> Install chain -> ConsolePlugin route story -> 0.1.5 dashboard visuals -> movable KOMSCO AI Assistant -> approval boundaries
```

If the Mac CRC cluster is unavailable, do not spend the demo trying to repair networking live. Use the public demo brief, tracked screenshots, and local verifier output as the evidence packet.
