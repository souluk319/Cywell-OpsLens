# CRC OpenShift 4.21.14 Console Parity Map

Status: active acceptance contract for Cywell OpsLens Dev 0.1.2
Target: CRC OpenShift / OpenShift Local `4.21.14`, OCP web console docs `4.21`
Truth source: `apps/web/src/consoleParity.ts`
Verification: `AC-UI-003`, `AC-UI-006`, `AC-UI-008`, `AC-UI-009`, `npm run verify:web-shell`

## Product Rule

Cywell OpsLens is an OpenShift console mod-style experience. It must keep native OpenShift console functions discoverable, then add better evidence, safer read-only workflows, KOMSCO assistant context, and OpsBrain/OpsLens operational surfaces on top.

It must not claim to replace the native OpenShift masthead, native Lightspeed drawer, or mutation paths unless a separate ConsolePlugin/OpenShift extension contract proves that behavior.

## Completion Criteria

| Check | Pass condition | Evidence |
| --- | --- | --- |
| Version pin | The visible parity matrix states `OpenShift Local 4.21.14` and OCP docs `4.21`. | `console-parity-summary`, `ocpConsoleBaseline` |
| Menu mapping | Every registry item renders in the left navigation and parity matrix. | `AC-UI-003`, `AC-UI-006` |
| Screen mapping | Every item has a target selector and `Open surface` mounts that target. | `AC-UI-003` |
| Function proof | Every item has function input and action proof in EN/KO. | `AC-UI-006`, `AC-UI-008` |
| Function state effect | Evidence items switch the active evidence tab and assistant items open the KOMSCO popover. | `AC-UI-003`, `AC-UI-006` |
| Resource smoke state | Resource preset items expose function outcome, preferred API match, selected API, list, detail, events, logs, related, and mutation-guard states as structured UI evidence. | `AC-UI-003` |
| Assistant action | Every item opens KOMSCO assistant with that item context and read-only boundary. | `AC-UI-009` |
| Read-only boundary | Resource views, evidence views, assistant drafts, and install surfaces remain read-only/plan-only unless explicitly approval-gated. | `verify:web-shell`, E2E tests |

## 1:1 Mapping

| # | OCP 4.21.14 console function | Native path | OpsLens menu/screen | OpsLens action | Target behavior |
| --- | --- | --- | --- | --- | --- |
| 1 | Overview | Home / Overview | Home / Overview | Open live cluster overview with version, operators, nodes, workload, networking, and monitoring signals. | `overview` surface with live or explicit unavailable evidence |
| 2 | Search | Home / Search | Home / Search | Search listable resources and inspect sanitized JSON/YAML, events, logs, owners, and children. | Resource Explorer preset for pods, deployments, routes, services, namespaces |
| 3 | Events | Home / Events | Home / Events | Inspect core Events and keep involved-object context. | Resource Explorer preset for events |
| 4 | Pinned navigation | Favorites / Pinned navigation | Favorites / Pinned navigation | Show covered, pinned, native-owned, and enhanced console functions. | Parity matrix |
| 5 | Software Catalog | Ecosystem / Software Catalog | Ecosystem / Software Catalog | Show OperatorHub/catalog readiness and install evidence. | OpsLens Admin catalog toolchain section |
| 6 | OperatorHub | Operators / OperatorHub | Operators / OperatorHub | Review package visibility, CSV, install modes, architecture labels, and icon metadata. | OpsLens Admin operator package section |
| 7 | Installed Operators | Operators / Installed Operators | Operators / Installed Operators | Inspect CSVs, Subscriptions, InstallPlans, and operator Deployments. | Resource Explorer preset for OLM resources |
| 8 | Helm | Helm | Helm | Inspect Helm-related Secrets and ConfigMaps as redacted read-only release evidence. | Resource Explorer preset for Helm metadata |
| 9 | Pods | Workloads / Pods | Workloads / Pods | List pods and inspect status, events, logs, owner refs, and sanitized YAML. | Resource Explorer preset for pods |
| 10 | Workload controllers | Workloads / Deployments, DeploymentConfigs, StatefulSets, DaemonSets, Jobs, CronJobs, ReplicaSets, HPAs | Workloads / Workload controllers | Preset OpenShift and Kubernetes workload controllers. | Resource Explorer preset for workload APIs |
| 11 | Routes, Services, Ingresses | Networking / Routes, Services, Ingresses | Networking / Routes, Services, Ingresses | Inspect routes, services, ingresses, endpoints, and endpoint slices. | Resource Explorer preset for network APIs |
| 12 | NetworkPolicies | Networking / NetworkPolicies | Networking / NetworkPolicies | Inspect policies, DNS, ingress, and route reachability plans. | Resource Explorer preset plus plan-only boundary |
| 13 | PVCs, PVs, StorageClasses | Storage / PersistentVolumeClaims, PersistentVolumes, StorageClasses | Storage / PVCs, PVs, StorageClasses | Inspect capacity, phase, class, and namespace storage evidence. | Resource Explorer preset for storage APIs |
| 14 | Builds and ImageStreams | Builds / Builds, BuildConfigs, ImageStreams | Builds / Builds and ImageStreams | Inspect build/image provenance, CRC registry state, and architecture mismatch evidence. | Resource Explorer preset for OpenShift build/image APIs |
| 15 | Alerting | Monitoring / Alerting | Monitoring / Alerting | Inspect firing alerts and keep assistant grounded in alert/log/event/YAML evidence. | Evidence pane alert view |
| 16 | Dashboards | Monitoring / Dashboards | Monitoring / Dashboards | Open incident dashboard panels and evidence-backed operations cards. | OpsLens dashboard |
| 17 | Metrics | Monitoring / Metrics | Monitoring / Metrics | Open metric-query evidence and incident scoring. | OpsLens metric evidence section |
| 18 | Logs | Monitoring / Logs | Monitoring / Logs | Switch evidence pane to pod logs before plan-only assistant work. | Evidence pane log view |
| 19 | Nodes and Machines | Compute / Nodes, Machines, MachineSets, MachineConfigPools | Compute / Nodes and Machines | Inspect node architecture, readiness, and capacity without modifying machines. | Resource Explorer preset for compute APIs |
| 20 | Users, Groups, Roles | User Management / Users, Groups, ServiceAccounts, Roles, RoleBindings | User Management / Users, Groups, Roles | Inspect users, groups, service accounts, roles, cluster roles, and bindings without exposing credentials. | Resource Explorer preset for RBAC APIs |
| 21 | Cluster Settings | Administration / Cluster Settings | Administration / Cluster Settings | Review cluster version, operators, console customization, and approval-gated changes. | OpsLens Admin OCP connectivity section |
| 22 | Namespaces and CRDs | Administration / Namespaces, CustomResourceDefinitions, ResourceQuotas, LimitRanges | Administration / Namespaces and CRDs | Inspect namespace, CRD, APIService, quota, and limit health. | Resource Explorer preset for administration APIs |
| 23 | OpsLens Admin | Cywell / OpsLens Admin | Cywell / OpsLens Admin | Operate install, RAG, evaluation, runtime, release, and completion dashboard. | OpsLens Admin surface |
| 24 | OpsBrain | Cywell / OpsBrain | Cywell / OpsBrain | Open no-fine-tuning memory, evaluator, risk gate, and growth loop. | OpsBrain governance surface |
| 25 | KOMSCO AI Assistant | Cywell / Assistant | Cywell / KOMSCO AI Assistant | Open KOMSCO assistant with current console context and read-only action boundary. | Assistant popover with item-aware prompt |

## Current Gaps

The parity contract proves UI routing and read-only assistant context locally. Full native OpenShift console replacement is intentionally out of scope until ConsolePlugin extension points are separately verified. Live CRC state can still report non-ready workloads such as optional vLLM or storage runtime issues; those are installation/runtime readiness gaps, not menu mapping gaps.
