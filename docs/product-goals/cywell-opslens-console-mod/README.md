# Cywell OpsLens Console Mod Goal Ledger

This folder is the product-goal ledger for the KOMSCO/Cywell OpsLens OpenShift Console experience.

It exists to stop the project from drifting between three different meanings:

- standalone debug page
- installed Operator-managed workload
- official OpenShift ConsolePlugin navigation entry that opens the OpsLens app asset

## Locked Product Goal

Cywell OpsLens must be installed through the OpenShift catalog/Operator flow and then opened from the original OpenShift Console through official ConsolePlugin capabilities.

The target user experience is:

```text
Software Catalog / OperatorHub
-> install Cywell OpsLens Operator
-> create OpsLensInstallation
-> Operator creates API, dashboard, route, ConsolePlugin resources
-> Operator enables ConsolePlugin in consoles.operator.openshift.io/cluster spec.plugins without dropping existing plugins
-> OpenShift Console refreshes
-> user opens Cywell OpsLens from a console-native navigation entry
-> the entry opens the independent OpsLens dashboard asset through the official ConsolePlugin URL
```

The debug dashboard tunnel is only a development access path. It is not the product entry point.

## Current Source Of Truth

| Field | Value |
| --- | --- |
| Active branch | `feat/OpsLens-Dev0.1.4` |
| Stamped head | `6edcf2d5642b68a3e75c33be8b80087d3babc867` |
| Live reference target | MacBook CRC OpenShift 4.21.14 |
| Company OCP | Do not mutate |
| Product entry target | OpenShift Console left-nav shortcut to the OpsLens dashboard asset, not iframe, not custom DOM injection |

## Version Ledger

| Version lane | Status | Completed proof | Current gap |
| --- | --- | --- | --- |
| Dev 0.1.1 CRC install | Partial live proof | CRC catalog, package manifest, Operator install, OpsLensInstallation, API/dashboard/vector workloads reached usable states | vLLM external image/runtime remains non-demo; SCC and local secret workaround must become productized |
| Dev 0.1.2 UI recovery | Partial local proof | KOMSCO branding, Korean shell, assistant naming, catalog icon/install-mode fixes, debug dashboard reachable | UI still carried internal development badges and did not clearly prove console-native product entry |
| Dev 0.1.3 console mod | Superseded by Dev 0.1.4 | Official ConsolePlugin direction locked; fake OpenShift/OpsLens toggle removed; globe language control, compact shell, question-first assistant, direct ConsolePlugin asset link, and Operator-driven Console cluster plugin enablement verified locally | Replaced by cleaner `/opslens` launcher route contract |
| Dev 0.1.4 console launcher | Active | Left navigation success is preserved; target route is simplified to `/opslens` redirect-only launcher; iframe and broken i18n labels are explicitly banned | Implement route, verify locally, then validate in CRC after approval |

## Acceptance Rules

Pass/fail must be tracked with evidence, not opinion.

| Acceptance criterion | Pass evidence | Current status |
| --- | --- | --- |
| Installed catalog entry is visible | CRC OperatorHub/Software Catalog shows Cywell OpsLens card with icon | Pass in CRC |
| Operator installs without stale image refs | Running operator pod uses CRC dev tag/internal registry image, not stale public image | Needs re-check after each bundle refresh |
| OpsLensInstallation reconciles workloads | `oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens` shows expected Ready/Running state | Partial; API/dashboard/vector achieved, vLLM remains pending |
| ConsolePlugin entry exists | OpenShift Console shows Cywell OpsLens through official plugin navigation after Catalog install | Local contract pass; live CRC evidence pending |
| Product opens from OpenShift Console | User enters OpsLens through console left-nav `Cywell OpsLens`, not only debug tunnel | Local contract pass; live CRC evidence pending |
| Original console coverage is mapped | OpenShift 4.21.14 menu/features mapped 1:1 to OpsLens menu/screens/actions | In progress |
| No development worklist UI leaks | Header/body do not show internal plans, debug chips, task queues, or "standalone preview" marketing | In progress; verifier must enforce |
| Assistant is question-first | KOMSCO AI Assistant opens as chat/help surface, diagnostics are secondary | In progress |
| Language is coherent | Globe button toggles shell and visible page copy consistently | In progress |

## Non-Goals

- Do not patch the original console DOM outside supported ConsolePlugin APIs.
- Do not treat the debug dashboard tunnel as the real product entry.
- Do not expose internal development plans, queues, or evidence dumps in customer UI.
- Do not mutate company OCP.
- Do not patch OLSConfig, create secrets, push images, or recreate cluster resources without explicit approval for that exact CRC action.

## How To Use This Folder

When starting a new lane:

1. Add or update a file under `versions/`.
2. Stamp branch, head SHA, target, and date.
3. Define completed, partial, blocked, and next evidence.
4. Keep UI/product decisions here; keep verbose run logs in `docs/runbooks/` only when needed.
