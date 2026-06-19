# Dev 0.1.10 Official Console Parity Contract

Date: 2026-06-20
Branch: `feat/OpsLens-Dev0.1.10`
Head at lane start: `72209dd5`
Base ref: `origin/main`
Base merge point: `5ad0b75f`
Reference target: KH CRC OpenShift 4.20.x, with the previous Mac CRC 4.21.x run kept only as historical evidence.

## Goal

Cywell OpsLens must first copy the native OpenShift console contract before adding OpsLens analysis.

This means every OpenShift console menu item that OpsLens exposes must provide the native baseline:

- resource list
- search and filter
- namespace/project scope
- status and health signal
- selected object detail
- events, logs, related resources when available
- native create/edit/delete handoff or an explicit read-only boundary

OpsLens enhancements such as risk grouping, assistant handoff, evidence summaries, and better visualization are allowed only after the native baseline is visible.

## Official Source Basis

| Area | Official source | Product meaning |
| --- | --- | --- |
| ConsolePlugin capability | Red Hat OpenShift 4.20 Web Console, Dynamic Plugins | Dynamic plugins can add custom pages, perspectives, navigation items, tabs, and actions. OpsLens can appear through official plugin extension points, not DOM injection. |
| Console plugin UX rule | Red Hat OpenShift 4.20 Web Console, dynamic plugin general guidelines | Plugin pages must maintain a consistent look, feel, and behavior with other console pages. OpsLens must not look like a separate toy dashboard inside the console. |
| Home overview baseline | Red Hat OpenShift 4.20 Validation and Troubleshooting, reviewing cluster status in web console | Home overview includes cluster status, control plane/operators/storage, CPU/memory/filesystem/network/pod availability, API address, cluster ID, version/update info, and inventory. |
| Monitoring baseline | Red Hat OpenShift 4.20 Validation and Troubleshooting, dashboards and alerts | Observe/Dashboards and Alerting expose graph-based resource utilization, alert state, source, and drill-down details. OpsLens must match that before claiming better visualization. |
| Topology baseline | Red Hat web console topology documentation | Topology is a graph/list experience with search, filters, grouping, status, route/source shortcuts, and zoom/fit controls. OpsLens must not reduce this to a plain list. |

Official links:

- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/pdf/web_console/OpenShift_Container_Platform-4.20-Web_console-en-US.pdf
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/web_console/dynamic-plugins
- https://docs.redhat.com/fr/documentation/openshift_container_platform/4.20/html-single/validation_and_troubleshooting/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/observability/web_console/customizing-web-console

## Completed In This Pass

This pass starts with the highest-leverage shared surface: the resource-backed native page shell.

| Item | Status | Evidence |
| --- | --- | --- |
| Native page summary | Implemented | `OcpResourceExplorer` now renders `ocp-native-page-summary` before the raw API explorer. |
| Native status distribution | Implemented | `nativeStatusDistribution` classifies listed objects as healthy, warning, danger, or unknown and renders a visual distribution bar. |
| Selected object preview | Implemented | The selected row now drives `ocp-native-selected-preview` with lifecycle and relationship signals. |
| Baseline native action map | Implemented | `ocp-native-baseline-actions` states list/filter, inspect, event/log/related-resource, and create/edit/delete handoff boundaries. |
| Row health signal | Implemented | Native table rows now carry health classes so the list resembles status-aware console tables instead of a raw dump. |
| Native topology controls | Implemented | `OcpTopologyGraph` now exposes search, resource-type filtering, graph/list display options, and zoom controls matching the native console topology contract. |
| Home overview details panel | Implemented | `OcpConsoleOverview` now renders `ocp-overview-details-card` with API address, cluster ID, infrastructure name, OpenShift version, channel, control-plane shape, and Lightspeed version from the live `consoleDashboard.details` contract. |
| Home overview inventory panel | Implemented | `ocp-overview-inventory-card` exposes nodes, pods, storage classes, PVCs, routes, and services from the live `consoleDashboard.inventory` contract. |
| Home overview status and activity panels | Implemented | `ocp-overview-status-cards` and `ocp-overview-activity-card` render ClusterVersion/operator/alert/event status cards and recent Event activity instead of only the OpsLens visual cards. |
| Home overview utilization panel | Implemented | Existing utilization sparklines are now positioned as one of the official Home overview panels, sourced from Prometheus when reachable and explicitly marked unavailable when not. |
| Internal surface open action | Implemented | `console-active-open-surface` opens the OpsLens internal mapped surface separately from the native OpenShift deep link. |
| Visible preferred API summary | Implemented | Preferred API resources are visible in the active action panel instead of being hidden inside collapsed details. |
| Contract checks | Implemented | `verify-web-shell-contract.mjs` fails if the native page summary, distribution, preview, or baseline actions disappear. |
| E2E coverage | Implemented | `AC-UI-003` iterates the mapped console navigation and verifies mounted surfaces, native topology controls, and workload object actions. `AC-OCP-001` asserts the native page summary and selected preview appear during live resource reads. |

## Acceptance Criteria

| Criterion | Pass/fail method | Evidence target | Current gap |
| --- | --- | --- | --- |
| Native resource pages render first | E2E checks `ocp-native-page-summary`, table, and object detail before raw API explorer | `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-OCP-001"` | Pass: 2026-06-20 local run |
| Home overview matches official panel set | E2E and static verifier check Details, Cluster Inventory, Status, Activity, and Utilization panels | `ocp-overview-details-card`, `ocp-overview-inventory-card`, `ocp-overview-status-cards`, `ocp-overview-activity-card`, `ocp-overview-utilization` | Implemented in this pass; verification pending after edit |
| Contract prevents regression | Static verifier checks data-testid and helper function contracts | `npm run verify:web-shell` | Pass: 2026-06-20 local run, 84 checks / 0 fail |
| Responsive shell does not break | CSS collapses native summary/action grids below 900px | `npm run -w @kugnus/web build` and `git diff --check` | Pass: 2026-06-20 local run |
| Official docs remain the ceiling source | Product ledger keeps official links and required baseline behavior | this document | Pass for this lane |
| Every mapped menu remains actionable | E2E clicks every version-pinned navigation item and checks the active surface, function proof, and internal open action | `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-003"` | Pass: 2026-06-20 local run |

## Next Work

The shared native shell and Home overview are not enough by themselves. The next pass must fill each remaining menu with the native console's expected detail:

1. Workloads -> topology, Pods, Deployments, DeploymentConfigs, StatefulSets, Secrets, ConfigMaps, CronJobs, Jobs, DaemonSets, ReplicaSets, ReplicationControllers, HPAs, PDBs.
2. Networking -> Services, Routes, Ingresses, NetworkPolicies.
3. Storage -> StorageClasses, PVs, PVCs, CSI/volume attachment surfaces when available.
4. Build -> Builds, BuildConfigs, ImageStreams.
5. Monitoring/Observe -> alerts, dashboards, metrics, logs, targets where the cluster exposes them.
6. Administration -> ClusterSettings, Namespaces, Nodes, Operators, CRDs, RBAC, MachineConfigPool, ClusterVersion.

Each item must be one of:

- `live-native-equivalent`: OpsLens reads and renders the native resource behavior.
- `native-deep-link`: OpsLens sends the user to the exact native console page while preserving the product boundary.
- `approval-gated`: mutation is possible only through RBAC and human approval.
- `explicit-gap`: not implemented yet, visible as a gap, not hidden behind a fake card.
