# Dev 0.1.6 OCP Console Study And Parity Audit

Status: active working contract
Target console: CRC OpenShift / OpenShift Local `4.21.14`
Documentation baseline: Red Hat OpenShift Container Platform web console `4.21`
Current OpsLens registry: `apps/web/src/consoleParity.ts`
Current branch: `feat/OpsLens-Dev0.1.6`

## Goal

Cywell OpsLens must not be a separate dashboard that vaguely resembles OpenShift.
It must feel like an OpenShift console mode for KOMSCO: the native console functions
remain recognizable, and OpsLens adds clearer visualization, evidence, and AI-guided
operations on top.

## Official Basis

The OpenShift web console is officially described as a graphical interface to
visualize project data and perform administrative, management, and troubleshooting
tasks. In OCP `4.21`, Red Hat documents that the web console model was unified
starting with OCP `4.19`: Developer is no longer enabled by default, and users can
interact with console features according to permission.

Official administrator-role capabilities include:

- managing workloads, storage, networking, and cluster settings
- installing and managing Operators through the software catalog
- managing identity providers, roles, and role bindings
- viewing cluster updates, Cluster Operators, CRDs, resource quotas, and advanced settings
- accessing metrics, alerts, monitoring dashboards, logging, and high-status cluster information
- visually interacting with applications, components, and services

Official developer-role capabilities include:

- creating and deploying applications from code, images, and container files
- visually interacting with application topology
- monitoring deployment/build status, project events, resource utilization, and quota
- troubleshooting with PromQL metrics visualized on plots

Official dashboard/troubleshooting references state that the console overview and
dashboards expose:

- cluster status, control plane status, Cluster Operator status, and storage status
- CPU, memory, file system, network transfer, and pod availability
- API address, cluster ID, provider, version, update status, update channel
- cluster inventory including nodes, pods, storage classes, and PVCs
- firing alerts with severity, state, source, and detail pages
- monitoring dashboards with time range, refresh interval, and graph hover details

Official extension boundary:

- Dynamic plugins are the supported path for adding console UI at runtime.
- `ConsolePlugin` registers plugin assets, and the console Operator enables plugins.
- Console customization can show/hide perspectives and configure cluster-wide console behavior.
- Unsupported DOM injection or replacing the console image is outside the product boundary.

Sources:

- Red Hat OCP 4.21 Web Console Overview: https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/web_console/web-console-overview
- Red Hat OCP 4.21 Customizing Web Console: https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/web_console/customizing-web-console
- Red Hat OCP 4.21 Dynamic Plugins: https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/web_console/dynamic-plugins
- Red Hat OCP 4.21 Validation and Troubleshooting: https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html-single/validation_and_troubleshooting/index

## Current OpsLens Registry State

Current registry contains `37` mapped entries.

| Section | Count | Current depth |
| --- | ---: | --- |
| Home | 3 | Overview, Search, Events are present; Overview now has live status and utilization work. |
| Favorites | 1 | Parity/pinned view exists, but this is OpsLens-specific, not a native console function. |
| Ecosystem | 4 | Software Catalog and Operator evidence exist; Helm is read-only metadata only. |
| Workloads | 14 | Native menu depth is mostly present, but most entries still route to generic Resource Explorer behavior. |
| Networking | 2 | Routes/Services/Ingresses and NetworkPolicies are present but shallow. |
| Storage | 1 | PVC/PV/StorageClass grouped together; native console has richer per-resource UX. |
| Builds | 1 | Builds/ImageStreams grouped; needs live build-specific behavior. |
| Monitoring | 4 | Alerting, Dashboards, Metrics, Logs exist; real utilization graph is now wired locally. |
| Compute | 1 | Nodes/Machines grouped; native node detail depth is not matched yet. |
| User Management | 1 | Users/Groups/Roles grouped; RBAC detail depth is not matched yet. |
| Administration | 2 | Cluster Settings and Namespaces/CRDs exist; advanced settings are too compressed. |
| Cywell | 3 | OpsLens-only additions: Admin, OpsBrain, KOMSCO AI Assistant. |

## Honest Current Judgment

The product currently has a useful parity registry, but it is not yet a complete
1:1 feature match.

What is already reasonable:

- Major OCP 4.21 navigation families are represented.
- Workloads includes important native children such as Topology, Pods, Deployments,
  DeploymentConfigs, StatefulSets, Secrets, ConfigMaps, CronJobs, Jobs, DaemonSets,
  ReplicaSets, ReplicationControllers, HPAs, and PDBs.
- Monitoring has real Prometheus-backed utilization graph work in local test mode.
- KOMSCO Assistant can receive current console context.
- Native console links can remain the fallback for create/edit/mutation flows.

What is still not good enough:

- Many entries only open a generic Resource Explorer instead of a purpose-built screen.
- Workloads/Topology does not yet match the native visual topology experience.
- Create flows such as CronJob creation are not first-class OpsLens flows.
- Native details such as events, logs, YAML, metrics, owner chains, route/service
  linkage, rollout status, and action menus are not consistently presented per resource.
- Storage, Compute, User Management, and Administration are grouped too broadly.
- Monitoring dashboards are improving, but native dashboard breadth and graph controls
  are not fully mirrored.

## Required Parity Method

From now on, each native console item must be classified as exactly one of these:

| Class | Meaning | Pass condition |
| --- | --- | --- |
| Live OpsLens View | OpsLens owns a purpose-built page for the native function. | Live/read-only API data, visual state, empty/error state, assistant context, and evidence all render. |
| Native Deep Link | OpenShift native page is still the correct owner for create/edit/destructive flows. | OpsLens explains the boundary and opens the native page directly. |
| Plan-Only Assistant | OpsLens can explain or prepare a safe plan but must not mutate. | Assistant receives context and returns read-only or approval-gated plan. |
| Explicit Gap | Not implemented yet. | UI and docs say it is a gap; no fake success. |

## Completion Criteria For Real 1:1 Matching

Each menu item needs these fields before it can be called complete:

| Field | Required evidence |
| --- | --- |
| Native path | Exact OCP path and Korean label visible in CRC 4.21.14. |
| Native purpose | What the original page is for, not just its name. |
| Native actions | List/detail/create/edit/delete/logs/events/YAML/metrics/action-menu behavior as applicable. |
| API source | Kubernetes/OpenShift API group, version, resource, namespace scope, and RBAC expectation. |
| OpsLens view | Purpose-built screen or native deep link. Generic text-only cards are not enough. |
| Visual upgrade | What OpsLens makes clearer than native: graph, topology, grouping, triage, evidence, or assistant. |
| Assistant context | The exact context that KOMSCO AI Assistant receives from this page. |
| Safety boundary | Read-only, native link, or approval-gated mutation. |
| Test evidence | Browser test or API test proving the page is not a static placeholder. |

## Immediate Gap Queue

1. Workloads parity must be expanded first.
   - Topology must become a real visual graph from Deployments, Pods, Services,
     Routes, Jobs, and CronJobs.
   - Pods, Deployments, Jobs, CronJobs, HPA, and PDB must have purpose-built list
     and detail evidence instead of generic cards only.
   - CronJob create remains native deep link until approval-gated creation exists.

2. Monitoring parity comes second.
   - Use real Prometheus-backed CPU, memory, filesystem, network, and pod series.
   - Add alert severity grouping, recent events, and dashboard time controls.

3. Administration and User Management come third.
   - Break broad grouped entries into the real native concerns that users expect:
     Cluster Settings, Cluster Operators, CRDs, Namespaces, ResourceQuotas,
     LimitRanges, Users, Groups, ServiceAccounts, Roles, RoleBindings, ClusterRoles,
     and ClusterRoleBindings.

4. Storage and Networking come fourth.
   - PVC/PV/StorageClass and Route/Service/Ingress/Endpoint relationships need
     direct visual relationship views.

## What Not To Do

- Do not claim 1:1 parity because the menu label exists.
- Do not hide gaps behind generic Resource Explorer cards.
- Do not build an OpsLens-only dashboard that ignores native OpenShift workflows.
- Do not replace supported ConsolePlugin behavior with DOM injection.
- Do not mutate cluster resources unless a later approval-gated path is explicitly approved.

## Next Implementation Rule

Before adding any new UI polish, check the active menu item against this document:

1. Does the native OCP function exist in the inventory?
2. Does OpsLens have a purpose-built live view, not only text?
3. Does the view call the real API or show an explicit gap?
4. Does Assistant receive useful page-specific context?
5. Is create/edit/delete either native-deep-link or approval-gated?

If any answer is no, the item is not complete.
