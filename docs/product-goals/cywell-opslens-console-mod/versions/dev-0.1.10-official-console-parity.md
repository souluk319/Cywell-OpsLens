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
| Console plugin runtime rule | Red Hat OpenShift 4.20 Web Console, Dynamic Plugins | Dynamic plugins are loaded from remote sources at runtime, registered by `ConsolePlugin`, and enabled through the console Operator. OpsLens must therefore behave as a first-class console surface after enablement, not as a disconnected local preview. |
| Ecosystem catalog baseline | Red Hat OpenShift 4.20 release notes and Operator administrator tasks | Red Hat-provided Operator catalogs moved into the unified Software Catalog under Ecosystem, and Operators can be installed from the Software Catalog by web console or CLI. OpsLens must preserve Software Catalog, Operator catalog, Installed Operators, and Helm-style discovery/install handoff before adding analysis. |
| Home overview baseline | Red Hat OpenShift 4.20 Validation and Troubleshooting, reviewing cluster status in web console | Home overview includes cluster status, control plane/operators/storage, CPU/memory/filesystem/network/pod availability, API address, cluster ID, version/update info, and inventory. |
| Home navigation baseline | Red Hat OpenShift 4.20 Web Console and Projects documentation | Home keeps overview, projects, search, API exploration, and event-oriented cluster entry points. OpsLens must not replace these with a smaller dashboard-only menu. |
| Monitoring baseline | Red Hat OpenShift 4.20 Validation and Troubleshooting, dashboards and alerts | Observe/Dashboards and Alerting expose graph-based resource utilization, alert state, source, and drill-down details. OpsLens must match that before claiming better visualization. |
| Topology baseline | Red Hat web console topology documentation | Topology is a graph/list experience with search, filters, grouping, status, route/source shortcuts, and zoom/fit controls. OpsLens must not reduce this to a plain list. |
| Workloads baseline | Red Hat OpenShift 4.20 Building applications / Nodes / Workloads APIs | Pods, Deployments, DeploymentConfigs, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, Jobs, CronJobs, HPAs, PDBs, Secrets, and ConfigMaps are native workload surfaces. OpsLens must preserve status, owner, schedule, scale, config, and redaction evidence before adding incident correlation. |
| Workloads operation baseline | Red Hat OpenShift 4.20 Workloads APIs and Topology web console behavior | Workloads pages must keep native search/filter/create/detail/log/event/related-resource behavior. Resource-type changes must switch the inspected native workload surface, not hide data behind a dead filter. |
| Build baseline | Red Hat OpenShift 4.20 Builds using BuildConfig | BuildConfigs, Builds, ImageStreams, build inputs, and run history remain native OpenShift objects. OpsLens must preserve list/detail/create handoff before adding build risk or release evidence. |
| Storage baseline | Red Hat OpenShift 4.20 Storage | PVCs, PVs, StorageClasses, and CSI snapshots are first-class console storage resources. OpsLens must preserve binding, capacity, reclaim, provisioner, and snapshot readiness evidence before adding risk analysis. |
| Administration baseline | Red Hat OpenShift 4.20 Web Console / Architecture / Authentication and Authorization | Administration covers cluster updates/settings, ClusterOperators, namespaces, CRDs, role bindings, and resource quotas. OpsLens must preserve these advanced settings before adding approval-gated operations. |
| Compute baseline | Red Hat OpenShift 4.20 Nodes / Machine API | Compute covers Nodes, Machines, MachineSets, and MachineConfigPools. OpsLens must preserve readiness, capacity, pressure, provider lifecycle, and rollout evidence before adding fit/risk analysis. |
| User Management baseline | Red Hat OpenShift 4.20 Authentication and Authorization / RBAC APIs | User, Group, ServiceAccount, Role, ClusterRole, RoleBinding, and ClusterRoleBinding views define identity and authorization relationships. OpsLens must preserve RBAC relationships and avoid credential/token exposure before adding approval-gated access plans. |

Official links:

- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/pdf/web_console/OpenShift_Container_Platform-4.20-Web_console-en-US.pdf
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/web_console/dynamic-plugins
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/release_notes/ocp-4-20-release-notes
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/operators/administrator-tasks
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/building_applications/working-with-helm-charts
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/workloads_apis/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/web_console/using-dashboard-to-get-cluster-info
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/building_applications/projects
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/pdf/validation_and_troubleshooting/OpenShift_Container_Platform-4.20-Validation_and_troubleshooting-en-US.pdf
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/pdf/building_applications/OpenShift_Container_Platform-4.20-Building_applications-en-US.pdf
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/building_applications/deployments
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/workloads_apis/deploymentconfig-apps-openshift-io-v1
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/builds_using_buildconfig/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/storage/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/architecture/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/authentication_and_authorization/using-rbac
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/rbac_apis/rbac-apis
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/observability/web_console/customizing-web-console
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/nodes/index
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/machine_apis/index

## Official Console Copy Strategy

The copied baseline is not a visual skin. It is a behavior contract:

| Native console surface | What OpsLens must copy first | What OpsLens can add after parity |
| --- | --- | --- |
| Home / Overview | Details, inventory, status, activity, utilization, update/channel information, and explicit unavailable states | Cross-signal incident summary, assistant handoff, evidence freshness |
| Workloads / Topology | Graph/list toggle, search, resource filters, display options, zoom/fit controls, workload relationships, route/source shortcuts | Risk overlays, owner-chain drift, incident path highlighting |
| Workloads resource pages | Native list, status, namespace scope, object details, YAML/raw, events, logs, related resources, create/edit/delete handoff boundary | Guided diagnosis, safe action planning, approval-gated remediation |
| Monitoring / Observe | Alerting, dashboards, metric query browser, logs/event stream availability, source status, time range/refresh semantics | Evidence scoring, runbook citations, assisted triage |
| Builds | BuildConfigs, Builds, ImageStreams, inputs, run state, latest history, source/strategy metadata | Release readiness, failed-build clustering, security/review gates |
| Storage | PVCs, PVs, StorageClasses, VolumeSnapshots, VolumeSnapshotClasses, binding/capacity/provisioner/reclaim/snapshot readiness | Pending-volume diagnosis, workload impact, restore readiness, expansion/reclaim approval plans |
| Administration | Cluster settings, namespaces, nodes, operators, CRDs, RBAC, machine config, cluster version/update state | Upgrade blockers, policy impact, human-approved change plans |
| Compute | Nodes, Machines, MachineSets, MachineConfigPools, readiness, capacity, pressure, provider lifecycle, rollout status | Capacity fit, upgrade risk, rollout blocker diagnosis, approval-gated node/machine plans |
| User Management | Users, Groups, ServiceAccounts, Roles, ClusterRoles, RoleBindings, ClusterRoleBindings, subject membership, permission rules | Access impact, credential-safe RBAC summaries, human-approved permission change plans |

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
| Native topology selection panel | Implemented | Topology graph nodes and list rows now select a workload object and render a native side-panel-style detail surface with health, scope, relationship count, related resources, evidence, and an OpenShift object link. |
| Home overview details panel | Implemented | `OcpConsoleOverview` now renders `ocp-overview-details-card` with API address, cluster ID, infrastructure name, OpenShift version, channel, control-plane shape, and Lightspeed version from the live `consoleDashboard.details` contract. |
| Home overview inventory panel | Implemented | `ocp-overview-inventory-card` exposes nodes, pods, storage classes, PVCs, routes, and services from the live `consoleDashboard.inventory` contract. |
| Home overview status and activity panels | Implemented | `ocp-overview-status-cards` and `ocp-overview-activity-card` render ClusterVersion/operator/alert/event status cards and recent Event activity instead of only the OpsLens visual cards. |
| Home overview utilization panel | Implemented | Existing utilization sparklines are now positioned as one of the official Home overview panels, sourced from Prometheus when reachable and explicitly marked unavailable when not. |
| Home Search, Projects, API Explorer, and Events parity | Implemented | `OcpHomeConsole` now gives Search, Projects, API Explorer, and Events their own native-style surfaces backed by Project, Namespace, workload, RBAC, CRD, APIService, and Event evidence instead of routing those native entry points to the generic explorer. |
| Home native toolbar and drilldown | Implemented | Home pages now expose original-console-style search, kind/namespace filters, live result counts, native console handoff, actionable object links, and selected-object drilldown. |
| Ecosystem native surface | Implemented | `OcpEcosystemConsole` now gives Software Catalog, Operator catalog, Installed Operators, and Helm their own native-style surfaces with CatalogSource, PackageManifest, CSV, Subscription, InstallPlan, OperatorGroup, and redacted Helm metadata evidence instead of routing to OpsLens Admin or only the generic resource explorer. |
| Ecosystem native toolbar | Implemented | Ecosystem pages now expose original-console-style keyword search, namespace/type/catalog filters, live result counts, and native install/create handoff for Software Catalog, Operator catalog, Installed Operators, and Helm. |
| Monitoring native surface | Implemented | `OcpMonitoringConsole` now gives Monitoring / Alerting, Dashboards, Metrics, and Logs their own Observe-style surfaces using `consoleDashboard`, Prometheus query evidence, monitoring alert samples, and event activity instead of routing them to a generic evidence pane. |
| Monitoring native toolbar | Implemented | Monitoring pages now expose original-console-style search, severity/source filters, time range selection, and live result counts over alert, metric, and event evidence. |
| Builds native surface | Implemented | `OcpBuildsConsole` now gives Builds, BuildConfigs, and ImageStreams their own native-style surfaces with Build input, strategy, output, trigger, run-policy, ImageStream tag, and native handoff evidence instead of routing only to the generic resource explorer. |
| Builds native toolbar | Implemented | Builds pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for Builds, BuildConfigs, and ImageStreams. |
| Workloads native surface | Implemented | `OcpWorkloadsConsole` now gives Pods, Deployments, DeploymentConfigs, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, Secrets, ConfigMaps, CronJobs, Jobs, HPAs, and PDBs their own native-style surfaces with status, owner, schedule, replica, scale, disruption, config, and credential-redaction evidence instead of routing only to the generic resource explorer. |
| Networking native surface | Implemented | `OcpNetworkingConsole` now gives Routes, Services, Ingresses, and NetworkPolicies their own native-style surfaces with route host, service selector, endpoint/EndpointSlice, TLS, backend, DNS, and read-only policy evidence instead of routing only to the generic resource explorer. |
| Networking native toolbar | Implemented | Networking pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for Routes, Services, Ingresses, and NetworkPolicies. |
| Storage native surface | Implemented | `OcpStorageConsole` now gives PVCs, PVs, StorageClasses, VolumeSnapshots, and VolumeSnapshotClasses their own native-style surfaces with binding, capacity, provisioner, reclaim policy, expansion, snapshot readiness, and native handoff evidence instead of routing only to the generic resource explorer. |
| Storage native toolbar | Implemented | Storage pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for PVC, PV, StorageClass, VolumeSnapshot, and VolumeSnapshotClass resources. |
| Administration native surface | Implemented | `OcpAdministrationConsole` now gives Cluster Settings, ClusterOperators, Namespaces, CRDs, ResourceQuotas, and LimitRanges their own native-style surfaces with ClusterVersion, operator conditions, API surface, tenant guardrails, and native handoff evidence instead of routing only to OpsLens Admin or the generic resource explorer. |
| Administration native toolbar | Implemented | Administration pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for ClusterVersion, ClusterOperator, Namespace, CRD, ResourceQuota, and LimitRange resources. |
| Compute native surface | Implemented | `OcpComputeConsole` now gives Nodes, Machines, MachineSets, and MachineConfigPools their own native-style surfaces with readiness, capacity, pressure, Machine API provider state, replica state, rollout state, and native handoff evidence instead of routing only to the generic resource explorer. |
| Compute native toolbar | Implemented | Compute pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for Nodes, Machines, MachineSets, and MachineConfigPools. |
| User Management native surface | Implemented | `OcpUserManagementConsole` now gives Users, Groups, ServiceAccounts, Roles, and RoleBindings their own native-style surfaces with RBAC subjects, workload identity, rules, binding relationships, credential redaction, and native handoff evidence instead of routing only to the generic resource explorer. |
| User Management native toolbar | Implemented | User Management pages now expose original-console-style name search, namespace/resource filters, live result counts, and native create handoff for Users, Groups, ServiceAccounts, Roles, and RoleBindings while preserving cluster-scoped RBAC objects in filtered lists. |
| Dedicated object detail drilldown | Implemented | `OcpNativeObjectDrilldown` is now shared by Workloads, Networking, Storage, Builds, Compute, Administration, and User Management to expose selected-object Details, Events, Logs, Related resources, YAML/raw, and native OpenShift deep links. |
| Dedicated object action rail | Implemented | The shared drilldown now includes an OpenShift-style native action rail with object open, create-new handoff for namespaced resources, YAML, events, logs, related-resource inspection, and an explicit mutation boundary. |
| Dedicated object find-by-name | Implemented | The shared drilldown now includes a native-console-style object search box and visible object count so every resource-backed surface can narrow the selected object before inspecting details. |
| Native object name links | Implemented | Dedicated Workloads, Networking, Storage, Builds, Compute, Administration, and User Management tables now render object names as OpenShift Console deep links instead of static bold text. |
| RBAC cluster-scoped drilldown | Implemented | User Management role and binding drilldowns now include both namespaced and cluster-scoped RBAC objects, with kind-aware API mapping for Role, ClusterRole, RoleBinding, and ClusterRoleBinding. |
| Workload lifecycle handoff | Implemented | Workloads object drilldowns now expose resource-specific native handoff actions for Pod logs, controller scale/rollout, CronJob job creation/suspend review, ConfigMap/Secret edit boundaries, HPA policy, and PDB policy. |
| Workloads native toolbar | Implemented | Workloads pages now expose original-console-style name search, namespace/application/resource/status filters, live result counts, and native create handoff before the table and object drilldown. Selecting a resource type switches the active workload surface instead of producing a dead empty filter. |
| Endpoint summary preservation | Implemented | `ocpClient` now preserves top-level `Endpoints.subsets` and `EndpointSlice.endpoints` in the resource summary contract so Services can show endpoint evidence. |
| Storage top-level summary preservation | Implemented | `ocpClient` now preserves top-level `StorageClass` and `VolumeSnapshotClass` fields in the resource summary contract so provisioning and snapshot-class evidence can render. |
| Internal surface open action | Implemented | `console-active-open-surface` opens the OpsLens internal mapped surface separately from the native OpenShift deep link. |
| Visible preferred API summary | Implemented | Preferred API resources are visible in the active action panel instead of being hidden inside collapsed details. |
| Contract checks | Implemented | `verify-web-shell-contract.mjs` fails if the native page summary, Monitoring surface, Builds surface, distribution, preview, or baseline actions disappear. |
| E2E coverage | Implemented | `AC-UI-003` iterates the mapped console navigation and verifies mounted surfaces, native topology controls, and workload object actions. `AC-OCP-001` asserts the native page summary and selected preview appear during live resource reads. |

## Acceptance Criteria

| Criterion | Pass/fail method | Evidence target | Current gap |
| --- | --- | --- | --- |
| Native resource pages render first | E2E checks `ocp-native-page-summary`, table, and object detail before raw API explorer | `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-OCP-001"` | Pass: 2026-06-20 local run |
| Topology behaves like an inspectable console surface | E2E and static verifier check graph/list controls plus selected-object side panel | `ocp-topology-native-toolbar`, `ocp-topology-workspace`, `ocp-topology-selected-panel`, `nativeObjectPath` | Pass: 2026-06-20 local run, `verify:web-shell` and `AC-UI-003` |
| Home overview matches official panel set | E2E and static verifier check Details, Cluster Inventory, Status, Activity, and Utilization panels | `ocp-overview-details-card`, `ocp-overview-inventory-card`, `ocp-overview-status-cards`, `ocp-overview-activity-card`, `ocp-overview-utilization` | Pass: 2026-06-20 local run |
| Home native menu coverage includes Search, Projects, API Explorer, and Events | Static verifier and navigation E2E check all four Home entries mount a native Home-style target with search/filter/object drilldown controls | `ocp-home-search`, `ocp-home-projects`, `ocp-home-api-explorer`, `ocp-home-events`, `ocp-home-native-toolbar`, `ocp-home-filter-count`, `ocp-home-object-drilldown` | Pass: 2026-06-20 local run, `verify:web-shell`, `AC-UI-003`, and `AC-OCP-001` |
| Ecosystem menus do not collapse into OpsLens Admin or only the generic explorer | Static verifier and navigation E2E check Software Catalog, Operator catalog, Installed Operators, and Helm mount a native Ecosystem-style target with search/filter/install controls | `ocp-ecosystem-software-catalog`, `ocp-ecosystem-operatorhub`, `ocp-ecosystem-installed-operators`, `ocp-ecosystem-helm`, `ocp-ecosystem-native-toolbar`, `ocp-ecosystem-filter-count` | Pass: 2026-06-20 local run, `verify:web-shell`, `AC-UI-003`, and `AC-OCP-001` |
| Monitoring menus do not collapse into a generic OpsLens page | Static verifier and navigation E2E check each Monitoring menu mounts a native Observe-style target with search/filter/time-range controls | `ocp-monitoring-alerting`, `ocp-monitoring-dashboards`, `ocp-monitoring-metrics`, `ocp-monitoring-logs`, `ocp-monitoring-toolbar`, `ocp-monitoring-filter-count` | Pass: 2026-06-20 local run |
| Builds menus do not collapse into the generic explorer | Static verifier and navigation E2E check Builds, BuildConfigs, and ImageStreams mount a native Builds-style target with search/filter/create controls | `ocp-builds-builds`, `ocp-builds-buildconfigs`, `ocp-builds-imagestreams`, `ocp-builds-native-toolbar`, `ocp-builds-filter-count` | Pass: 2026-06-20 local run |
| Workloads menus do not collapse into the generic explorer | Static verifier and navigation E2E check Pods, controllers, config, batch, autoscale, and disruption-budget entries mount a native Workloads-style target with native search/filter/create controls | `ocp-workloads-pods`, `ocp-workloads-deployments`, `ocp-workloads-deploymentconfigs`, `ocp-workloads-cronjobs`, `ocp-workloads-horizontalpodautoscalers`, `ocp-workloads-poddisruptionbudgets`, `ocp-workloads-native-toolbar`, `ocp-workloads-filter-count` | Pass: 2026-06-20 local run, `verify:web-shell`, `AC-UI-003`, and `AC-OCP-001` |
| Networking menus do not collapse into the generic explorer | Static verifier and navigation E2E check Routes, Services, Ingresses, and NetworkPolicies mount a native Networking-style target with search/filter/create controls | `ocp-networking-routes`, `ocp-networking-services`, `ocp-networking-ingresses`, `ocp-networking-network-policies`, `ocp-networking-native-toolbar`, `ocp-networking-filter-count` | Pass: 2026-06-20 local run |
| Storage menus do not collapse into the generic explorer | Static verifier and navigation E2E check PVCs, PVs, StorageClasses, VolumeSnapshots, and VolumeSnapshotClasses mount a native Storage-style target with search/filter/create controls | `ocp-storage-persistentvolumeclaims`, `ocp-storage-persistentvolumes`, `ocp-storage-storageclasses`, `ocp-storage-volumesnapshots`, `ocp-storage-volumesnapshotclasses`, `ocp-storage-native-toolbar`, `ocp-storage-filter-count` | Pass: 2026-06-20 local run |
| Administration menus do not collapse into OpsLens Admin or the generic explorer | Static verifier and navigation E2E check Cluster Settings, ClusterOperators, Namespaces, CRDs, ResourceQuotas, and LimitRanges mount a native Administration-style target with search/filter/create controls | `ocp-admin-cluster-settings`, `ocp-admin-clusteroperators`, `ocp-admin-namespaces`, `ocp-admin-custom-resource-definitions`, `ocp-admin-resourcequotas`, `ocp-admin-limitranges`, `ocp-admin-native-toolbar`, `ocp-admin-filter-count` | Pass: 2026-06-20 local run, `AC-UI-003` and `AC-OCP-001` |
| Compute menus do not collapse into the generic explorer | Static verifier and navigation E2E check Nodes, Machines, MachineSets, and MachineConfigPools mount a native Compute-style target with search/filter/create controls | `ocp-compute-nodes`, `ocp-compute-machines`, `ocp-compute-machinesets`, `ocp-compute-machineconfigpools`, `ocp-compute-native-toolbar`, `ocp-compute-filter-count` | Pass: 2026-06-20 local run, `AC-UI-003` and `AC-OCP-001` |
| User Management menus do not collapse into the generic explorer | Static verifier and navigation E2E check Users, Groups, ServiceAccounts, Roles, and RoleBindings mount a native RBAC-style target with search/filter/create controls | `ocp-user-users`, `ocp-user-groups`, `ocp-user-serviceaccounts`, `ocp-user-roles`, `ocp-user-rolebindings`, `ocp-user-native-toolbar`, `ocp-user-filter-count` | Pass: 2026-06-20 local run, `AC-UI-003` and `AC-OCP-001` |
| Dedicated native object drilldown exists on resource surfaces | Static verifier checks every dedicated resource console imports the shared drilldown and tab contract; E2E checks Workloads renders the panel even when the current cluster has no Pods | `ocp-workloads-object-drilldown`, `ocp-workloads-object-detail-tabs`, `ocp-networking-object-drilldown`, `ocp-storage-object-drilldown`, `ocp-builds-object-drilldown`, `ocp-compute-object-drilldown`, `ocp-admin-object-drilldown`, `ocp-user-object-drilldown` | Pass: 2026-06-20 local run |
| Native object action rail preserves console behavior | Static verifier checks native object open, create-new handoff, YAML, events, logs, related actions, and visible mutation boundary | `ocp-*-object-action-rail`, `ocp-*-object-native-object-action`, `ocp-*-object-native-create-link`, `ocp-*-object-yaml-action`, `ocp-*-object-events-action`, `ocp-*-object-logs-action`, `ocp-*-object-related-action` | Pass: 2026-06-20 local run, `verify:web-shell` 95 checks / 0 fail |
| Native object search preserves list behavior | Static verifier checks shared object filtering, search input, and count contract | `ocp-*-object-object-search`, `ocp-*-object-object-count` | Pass: 2026-06-20 local run, `verify:web-shell` 95 checks / 0 fail |
| Native table object names remain actionable | Static verifier checks the shared `NativeObjectLink` component and its use across dedicated resource tables | `ocp-workloads-*-object-link`, `ocp-networking-*-object-link`, `ocp-storage-*-object-link`, `ocp-builds-object-link`, `ocp-compute-*-object-link`, `ocp-admin-*-object-link`, `ocp-user-*-object-link` | Pass: 2026-06-20 local run, `verify:web-shell` 95 checks / 0 fail |
| RBAC cluster-scoped objects stay visible | Static verifier checks User Management role and binding drilldowns use combined Role/ClusterRole and RoleBinding/ClusterRoleBinding item sets with kind-aware resources | `resourceForUserManagementItem`, `items: roles`, `items: roleBindings` | Pass: 2026-06-20 local run, `verify:web-shell` 96 checks / 0 fail |
| Workloads lifecycle actions remain native | Static verifier checks Workloads passes resource-specific lifecycle handoff actions into the shared object drilldown | `workloadLifecycleActions`, `ocp-workloads-object-lifecycle-actions` | Pass: 2026-06-20 local run, `verify:web-shell` 96 checks / 0 fail |
| Contract prevents regression | Static verifier checks data-testid and helper function contracts | `npm run verify:web-shell` | Pass: 2026-06-20 local run, 96 checks / 0 fail |
| Responsive shell does not break | CSS collapses native summary/action grids below 900px | `npm run -w @kugnus/web build` and `git diff --check` | Pass: 2026-06-20 local run |
| Official docs remain the ceiling source | Product ledger keeps official links and required baseline behavior | this document | Pass for this lane |
| Every mapped menu remains actionable | E2E clicks every version-pinned navigation item and checks the active surface, function proof, and internal open action | `npx playwright test tests/e2e/mvp-0.1.spec.ts -g "AC-UI-003"` | Pass: 2026-06-20 local run |

## Next Work

The shared native shell and Home overview are not enough by themselves. The next pass must fill each remaining menu with the native console's expected detail:

1. Workloads follow-up -> add direct API-backed action previews for scale, rollout, restart, log-stream, CronJob start, HPA, and PDB flows after native handoff parity.
2. User Management follow-up -> add edit/delete native handoff and approval-gated permission change plans after Role/ClusterRole and RoleBinding/ClusterRoleBinding read/filter parity.
3. Storage follow-up -> add PVC expand, PV reclaim, snapshot restore readiness, and StorageClass default/provisioner parity where the cluster exposes those console routes.
4. Networking follow-up -> add Route/Service/Ingress/NetworkPolicy create/edit/delete native handoff and endpoint topology overlays.
5. Build follow-up -> add BuildConfig start/cancel/log and ImageStream tag-history parity where the cluster exposes those console routes.
6. Monitoring follow-up -> add deeper drill-down from Alerting/Dashboards/Metrics/Logs into exact native console URLs and selected object details where the cluster exposes the API.

Each item must be one of:

- `live-native-equivalent`: OpsLens reads and renders the native resource behavior.
- `native-deep-link`: OpsLens sends the user to the exact native console page while preserving the product boundary.
- `approval-gated`: mutation is possible only through RBAC and human approval.
- `explicit-gap`: not implemented yet, visible as a gap, not hidden behind a fake card.
