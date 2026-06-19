# CRC OpenShift 4.21.14 Console Parity Map

Status: active acceptance contract for Cywell OpsLens Dev 0.1.7
Target: CRC OpenShift / OpenShift Local `4.21.14`, OCP web console docs `4.21`
Truth source: `apps/web/src/consoleParity.ts`
Verification: `AC-UI-003`, `AC-UI-006`, `AC-UI-008`, `AC-UI-009`, `AC-UI-010`, `npm run verify:web-shell`

## Product Rule

Cywell OpsLens is an OpenShift console mod-style experience. After installation, users should feel that the original OpenShift console has transformed into Cywell OpsLens while the native console functions remain present and recognizable.

The implementation must stay inside supported OpenShift customization paths: ConsolePlugin dynamic plugin extensions, ConsoleLink entry points, Console customization, and approval-gated Lightspeed MCP registration. It must not rely on unsupported DOM injection or direct console image replacement.

## Completion Criteria

| Check | Pass condition | Evidence |
| --- | --- | --- |
| Version pin | The visible parity matrix states `OpenShift Local 4.21.14` and OCP docs `4.21`. | `console-parity-summary`, `ocpConsoleBaseline` |
| Compatibility matrix | Every console item has a derived OCP `4.20` baseline, API-version basis, and `4.21+` enhancement boundary. | `consoleParityCompatibilityProfile`, `verify:ocp:420-compatibility`, `test-results/cywell-opslens-ocp420-compatibility.json` |
| Registry integrity | Version-pinned items have unique ids, every OCP/Cywell section is represented, EN/KO copy is non-empty, and surface/resource/proof/signal contracts are internally valid. | `AC-UI-010`, `verify:web-shell` |
| Menu mapping | Every registry item renders in the left navigation and parity matrix. | `AC-UI-003`, `AC-UI-006` |
| Screen mapping | Every item has a target selector; sidebar navigation, parity-matrix `Open`, and `Open surface` all mount that target, with `Open surface` replaying resource/evidence/assistant side effects after drift. | `AC-UI-003`, `AC-UI-008` |
| Function proof | Every item has function mode, function input, action outcome, action proof, and a concrete function signal selector in EN/KO; resource item outcomes mirror the live Resource Explorer function outcome instead of a static active badge. | `AC-UI-003`, `AC-UI-006`, `AC-UI-008` |
| Function state effect | Evidence items switch the active evidence tab and assistant items open the KOMSCO popover. | `AC-UI-003`, `AC-UI-006` |
| Resource smoke state | Resource preset items expose function outcome, preferred API match, selected API, list, detail, events, logs, related, and mutation-guard states as structured UI evidence. | `AC-UI-003` |
| Assistant action | Every item opens KOMSCO assistant in EN/KO with native OCP path, function mode/input/proof, item action, and no-mutation read-only boundary. | `AC-UI-006`, `AC-UI-009` |
| Read-only boundary | Resource views, evidence views, assistant drafts, and install surfaces remain read-only/plan-only unless explicitly approval-gated. | `verify:web-shell`, E2E tests |

## 1:1 Mapping

| # | OCP 4.21.14 console function | Native path | OpsLens menu/screen | OpsLens action | Target behavior |
| --- | --- | --- | --- | --- | --- |
| 1 | Overview | Home / Overview | Home / Overview | Open live cluster overview with version, operators, nodes, workload, networking, and monitoring signals. | `overview` surface with live or explicit unavailable evidence |
| 2 | Search | Home / Search | Home / Search | Search listable resources and inspect sanitized JSON/YAML, events, logs, owners, and children. | Resource Explorer preset for pods, deployments, routes, services, namespaces |
| 3 | Events | Home / Events | Home / Events | Inspect core Events and keep involved-object context. | Resource Explorer preset for events |
| 4 | Pinned navigation | Favorites / Pinned navigation | Favorites / Pinned navigation | Show covered, pinned, native-owned, and enhanced console functions. | Parity matrix |
| 5 | Software Catalog | Ecosystem / Software Catalog | Ecosystem / Software Catalog | Show software catalog readiness and install evidence. | OpsLens Admin catalog toolchain section |
| 6 | Operator catalog | Ecosystem / Software Catalog / Operator catalog | Ecosystem / Software Catalog / Operator catalog | Review package visibility, CSV, install modes, architecture labels, and icon metadata. | OpsLens Admin operator package section |
| 7 | Installed Operators | Ecosystem / Installed Operators | Ecosystem / Installed Operators | Inspect CSVs, Subscriptions, InstallPlans, and operator Deployments. | Resource Explorer preset for OLM resources |
| 8 | Helm | Ecosystem / Helm | Ecosystem / Helm | Inspect Helm-related Secrets and ConfigMaps as redacted read-only release evidence. | Resource Explorer preset for Helm metadata |
| 9 | Topology | Workloads / Topology | Workloads / Topology | Inspect workload topology through pods, services, routes, workload controllers, autoscalers, disruption budgets, jobs, and cronjobs. | Live graph for selector, ownerReference, scaleTargetRef, PDB, job, and route evidence |
| 10 | Pods | Workloads / Pods | Workloads / Pods | List pods and inspect status, events, logs, owner refs, and sanitized YAML. | Resource Explorer preset for pods |
| 11 | Deployments | Workloads / Deployments | Workloads / Deployments | Inspect deployments, unavailable replicas, events, owner pods, and sanitized YAML. | Resource Explorer preset for apps/v1 deployments |
| 12 | Deployment Configs | Workloads / Deployment Configs | Workloads / Deployment Configs | Inspect OpenShift DeploymentConfigs and rollout evidence. | Resource Explorer preset for apps.openshift.io/v1 deploymentconfigs |
| 13 | StatefulSets | Workloads / StatefulSets | Workloads / StatefulSets | Inspect StatefulSets, pods, volumes, events, and sanitized YAML. | Resource Explorer preset for apps/v1 statefulsets |
| 14 | Secrets | Workloads / Secrets | Workloads / Secrets | Inspect Secret metadata while keeping data payloads redacted. | Resource Explorer preset for v1 secrets |
| 15 | ConfigMaps | Workloads / ConfigMaps | Workloads / ConfigMaps | Inspect ConfigMaps and configuration evidence. | Resource Explorer preset for v1 configmaps |
| 16 | CronJobs | Workloads / CronJobs | Workloads / CronJobs | Inspect schedules, recent Jobs, events, and open the native create flow when creation is required. | Resource Explorer preset plus native create deep link |
| 17 | Jobs | Workloads / Jobs | Workloads / Jobs | Inspect Jobs, completions, failed pods, and events. | Resource Explorer preset for batch/v1 jobs |
| 18 | DaemonSets | Workloads / DaemonSets | Workloads / DaemonSets | Inspect DaemonSets, desired/current pods, unavailable pods, and node spread. | Resource Explorer preset for apps/v1 daemonsets |
| 19 | ReplicaSets | Workloads / ReplicaSets | Workloads / ReplicaSets | Inspect ReplicaSets and owning Deployment/Pod chains. | Resource Explorer preset for apps/v1 replicasets |
| 20 | ReplicationControllers | Workloads / ReplicationControllers | Workloads / ReplicationControllers | Inspect legacy ReplicationControllers and related Pods. | Resource Explorer preset for v1 replicationcontrollers |
| 21 | HorizontalPodAutoscalers | Workloads / HorizontalPodAutoscalers | Workloads / HorizontalPodAutoscalers | Inspect HPA targets, current metrics, and scale recommendations. | Resource Explorer preset for autoscaling APIs |
| 22 | PodDisruptionBudgets | Workloads / PodDisruptionBudgets | Workloads / PodDisruptionBudgets | Inspect PDBs, allowed disruptions, and protected workloads. | Resource Explorer preset for policy/v1 PDBs |
| 23 | Routes, Services, Ingresses | Networking / Routes, Services, Ingresses | Networking / Routes, Services, Ingresses | Inspect routes, services, ingresses, endpoints, and endpoint slices. | Resource Explorer preset for network APIs |
| 24 | NetworkPolicies | Networking / NetworkPolicies | Networking / NetworkPolicies | Inspect policies, DNS, ingress, and route reachability plans. | Resource Explorer preset plus plan-only boundary |
| 25 | PVCs, PVs, StorageClasses | Storage / PersistentVolumeClaims, PersistentVolumes, StorageClasses | Storage / PVCs, PVs, StorageClasses | Inspect capacity, phase, class, and namespace storage evidence. | Resource Explorer preset for storage APIs |
| 26 | Builds and ImageStreams | Builds / Builds, BuildConfigs, ImageStreams | Builds / Builds and ImageStreams | Inspect build/image provenance, CRC registry state, and architecture mismatch evidence. | Resource Explorer preset for OpenShift build/image APIs |
| 27 | Alerting | Monitoring / Alerting | Monitoring / Alerting | Inspect firing alerts and keep assistant grounded in alert/log/event/YAML evidence. | Evidence pane alert view |
| 28 | Dashboards | Monitoring / Dashboards | Monitoring / Dashboards | Open incident dashboard panels and evidence-backed operations cards. | OpsLens dashboard |
| 29 | Metrics | Monitoring / Metrics | Monitoring / Metrics | Open metric-query evidence and incident scoring. | OpsLens metric evidence section |
| 30 | Logs | Monitoring / Logs | Monitoring / Logs | Switch evidence pane to pod logs before plan-only assistant work. | Evidence pane log view |
| 31 | Nodes and Machines | Compute / Nodes, Machines, MachineSets, MachineConfigPools | Compute / Nodes and Machines | Inspect node architecture, readiness, and capacity without modifying machines. | Resource Explorer preset for compute APIs |
| 32 | Users, Groups, Roles | User Management / Users, Groups, ServiceAccounts, Roles, RoleBindings | User Management / Users, Groups, Roles | Inspect users, groups, service accounts, roles, cluster roles, and bindings without exposing credentials. | Resource Explorer preset for RBAC APIs |
| 33 | Cluster Settings | Administration / Cluster Settings | Administration / Cluster Settings | Review cluster version, operators, console customization, and approval-gated changes. | OpsLens Admin OCP connectivity section |
| 34 | Namespaces and CRDs | Administration / Namespaces, CustomResourceDefinitions, ResourceQuotas, LimitRanges | Administration / Namespaces and CRDs | Inspect namespace, CRD, APIService, quota, and limit health. | Resource Explorer preset for administration APIs |
| 35 | OpsLens Admin | Cywell / OpsLens Admin | Cywell / OpsLens Admin | Operate install, RAG, evaluation, runtime, release, and completion dashboard. | OpsLens Admin surface |
| 36 | OpsBrain | Cywell / OpsBrain | Cywell / OpsBrain | Open no-fine-tuning memory, evaluator, risk gate, and growth loop. | OpsBrain governance surface |
| 37 | KOMSCO AI Assistant | Cywell / Assistant | Cywell / KOMSCO AI Assistant | Open KOMSCO assistant with current console context and read-only action boundary. | Assistant popover with item-aware prompt |

## Current Gaps

The parity contract proves UI routing and read-only assistant context locally. The product target is an in-console OpsLens mode through supported ConsolePlugin and console customization surfaces, not a separate portal as the primary experience. Live CRC state can still report non-ready workloads such as optional vLLM or storage runtime issues; those are installation/runtime readiness gaps, not menu mapping gaps.
