# Cywell OpsLens Dev 0.1.9 Baseline-First Console Parity

Date: 2026-06-20
Branch: `feat/OpsLens-Dev0.1.9`
Base branch: `feat/OpsLens-Dev0.1.8`

## Goal

Dev 0.1.9 resets the product direction from "OpsLens dashboard first" to "OpenShift Console baseline first".

Cywell OpsLens must not remove, hide, or replace the native OpenShift console functions that users already expect. It must first preserve the native console menu and behavior, then add OpsLens analysis, evidence, and AI assistance as secondary enhancements.

## Official Basis

Red Hat documentation describes the OpenShift web console as the graphical UI for visualizing, browsing, and managing project and cluster data. The Administrator console workflows include workload, storage, networking, cluster settings, Operator installation and management, identity and access management, cluster updates, CRDs, quotas, and monitoring.

Dynamic ConsolePlugins are an extension mechanism. They add custom pages and extensions at runtime through the `ConsolePlugin` resource and console operator configuration. They are not a license to remove the native console contract.

Reference docs:

- OpenShift Container Platform 4.20 Web console overview
  https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index
- OpenShift Container Platform 4.20 Accessing the web console
  https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html/web_console/web-console
- OpenShift Container Platform dynamic plugins
  https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index

## Product Rule

Customization means "native console plus OpsLens", not "native console replaced by OpsLens".

Baseline rule:

1. The left navigation must mirror the native OpenShift console structure before custom OpsLens entries are added.
2. Each menu item must keep its native OpenShift function reachable.
3. If OpsLens cannot fully implement native create/edit/delete safely, it must deep-link to the native OpenShift console flow.
4. OpsLens-specific analysis must be secondary and collapsible.
5. Internal verifier output, smoke-test state, and development notes must not be visible as primary UI.

## Baseline Menu Contract

Dev 0.1.9 treats the native console sidebar as the product contract. OpsLens can improve the view, but it must not collapse several native functions into one vague dashboard card.

Minimum native menu coverage:

- Home: Overview, Search, Events
- Ecosystem: Software Catalog, Operator catalog, Installed Operators, Helm
- Workloads: Topology, Pods, Deployments, DeploymentConfigs, StatefulSets, Secrets, ConfigMaps, CronJobs, Jobs, DaemonSets, ReplicaSets, ReplicationControllers, HorizontalPodAutoscalers, PodDisruptionBudgets
- Networking: Routes, Services, Ingresses, NetworkPolicies
- Storage: PersistentVolumeClaims, PersistentVolumes, StorageClasses, VolumeSnapshots, VolumeSnapshotClasses
- Builds: Builds, BuildConfigs, ImageStreams
- Monitoring: Alerting, Dashboards, Metrics, Logs
- Compute: Nodes, Machines, MachineSets, MachineConfigPools
- User Management: Users, Groups, ServiceAccounts, Roles, RoleBindings
- Administration: Cluster Settings, ClusterOperators, Namespaces, CustomResourceDefinitions, ResourceQuotas, LimitRanges
- Cywell: OpsLens Admin, OpsBrain, KOMSCO AI Assistant

Mutation boundary:

- Native create/edit/delete flows remain linked to the OpenShift console unless OpsLens has an explicit RBAC, approval, audit, and rollback contract.
- OpsLens read-only resource views must show the relevant API object list/detail/events/logs/relationships when available.
- Optional APIs such as Machine API or VolumeSnapshot APIs must show "API not installed or unavailable" honestly, not fake success.

## Acceptance Criteria

| Area | Pass condition | Evidence |
| --- | --- | --- |
| Native menu preservation | Workloads, Networking, Storage, Builds, Monitoring, Compute, User Management, Administration, and Ecosystem entries map to native OCP functions. | Browser screenshot and DOM check |
| Native function reachability | Each mapped screen exposes a native OpenShift action or deep link. | Link href check |
| OpsLens enhancement boundary | OpsLens +@ content is shown as secondary/collapsible support, not as the primary replacement. | Screenshot |
| No development UI leakage | Verification panels, smoke status, and command/debug strips are not visible by default. | Screenshot |
| Read-only honesty | Read-only mirrors do not pretend to support create/edit/delete. Mutation paths go through native console or future approval flow. | UI copy and action audit |

## Current Decision

The existing dashboard-style UI can remain as a separate future dashboard asset, but it is no longer the baseline for the main console-mod experience.

Dev 0.1.9 starts from a strict rule: if a native OpenShift function exists, OpsLens must preserve it first.
