# Dev 0.1.8 KH Required Permissions

Updated: 2026-06-20 KST  
Target: KH Windows CRC OpenShift 4.20.5  
Purpose: define the permissions that must exist before claiming that Cywell OpsLens is actually connected to OpenShift Console, OpenShift Lightspeed, and live monitoring data.

## Current Judgment

The KH deployment was not fully connected because two monitoring prerequisites were missing:

1. `OCP_ENABLE_MONITORING_PROXY=true` was not present on `deployment/cywell-opslens-api`.
2. The API service account did not have all permissions required to query OpenShift monitoring.

Current live state after investigation:

| Check | Current Result | Meaning |
| --- | --- | --- |
| `deployment/cywell-opslens-api` ready | PASS, `1/1` | API is running |
| `deployment/cywell-opslens-operator` | PAUSED, `0/0` | paused because the current operator reconciler removes manual API env patches |
| `OCP_ENABLE_MONITORING_PROXY=true` on API deployment | PASS after manual patch | API now attempts monitoring queries |
| `services/proxy` in `openshift-monitoring` | PASS | service proxy access is allowed |
| `prometheuses/api` in `openshift-monitoring` | PASS when checked as subresource | Prometheus API subresource access is allowed |
| `/api/ocp/console-overview` utilization | PASS after KH patch | `enabled=true`, `reachable=true`, source is `openshift-monitoring`, and metric samples are non-empty |

## Runtime Identities

OpsLens uses different identities depending on the path.

| Path | Identity | Required For |
| --- | --- | --- |
| ConsolePlugin UI to OpsLens API | logged-in OpenShift user token through ConsolePlugin `UserToken` proxy | user-scoped API calls from browser |
| OpsLens API in cluster | `system:serviceaccount:cywell-opslens:cywell-opslens-api` | live OCP reads, Lightspeed calls, monitoring queries |
| OpsLens Operator | `system:serviceaccount:cywell-opslens:cywell-opslens-operator` | deploying API/dashboard/plugin resources |

## Required API Service Account Permissions

Subject:

```yaml
kind: ServiceAccount
name: cywell-opslens-api
namespace: cywell-opslens
```

### 1. Core OpenShift Read-Only Inventory

These support OpenShift Console parity views, Resource Explorer, dashboard status, and action context.

| API Group | Resources | Verbs |
| --- | --- | --- |
| `""` | `nodes`, `namespaces`, `pods`, `services`, `configmaps`, `events`, `persistentvolumeclaims` | `get`, `list`, `watch` |
| `apps` | `deployments`, `statefulsets`, `daemonsets`, `replicasets` | `get`, `list`, `watch` |
| `batch` | `jobs`, `cronjobs` | `get`, `list`, `watch` |
| `autoscaling` | `horizontalpodautoscalers` | `get`, `list`, `watch` |
| `policy` | `poddisruptionbudgets` | `get`, `list`, `watch` |
| `networking.k8s.io` | `ingresses`, `networkpolicies` | `get`, `list`, `watch` |
| `storage.k8s.io` | `storageclasses` | `get`, `list`, `watch` |
| `route.openshift.io` | `routes` | `get`, `list`, `watch` |
| `image.openshift.io` | `imagestreams`, `imagestreamtags` | `get`, `list`, `watch` |
| `build.openshift.io` | `buildconfigs`, `builds` | `get`, `list`, `watch` |

### 2. OperatorHub / Installed Operator Read-Only

These support Software Catalog and installed Operator parity.

| API Group | Resources | Verbs |
| --- | --- | --- |
| `operators.coreos.com` | `catalogsources`, `clusterserviceversions`, `installplans`, `subscriptions` | `get`, `list`, `watch` |
| `packages.operators.coreos.com` | `packagemanifests` | `get`, `list`, `watch` |
| `apiextensions.k8s.io` | `customresourcedefinitions` | `get`, `list`, `watch` |
| `apiregistration.k8s.io` | `apiservices` | `get`, `list`, `watch` |

### 3. Console / Cluster State Read-Only

These support ConsolePlugin status, cluster version, operator health, and console integration checks.

| API Group | Resources | Verbs |
| --- | --- | --- |
| `console.openshift.io` | `consoleplugins` | `get`, `list`, `watch` |
| `config.openshift.io` | `clusteroperators`, `clusterversions`, `dnses`, `infrastructures` | `get`, `list`, `watch` |
| `operator.openshift.io` | `consoles`, `dnses` | `get`, `list`, `watch` |
| `rbac.authorization.k8s.io` | `clusterroles`, `clusterrolebindings`, `roles`, `rolebindings` | `get`, `list`, `watch` |

### 4. OpenShift Lightspeed

These support KOMSCO AI Assistant calling the installed OpenShift Lightspeed API.

| API Group | Resources / Binding | Verbs |
| --- | --- | --- |
| `ols.openshift.io` | `olsconfigs` | `get`, `list`, `watch` |
| existing OpenShift Lightspeed role | bind `lightspeed-operator-query-access` to `cywell-opslens-api` | query access |

Required binding pattern:

```yaml
kind: ClusterRoleBinding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: lightspeed-operator-query-access
subjects:
  - kind: ServiceAccount
    name: cywell-opslens-api
    namespace: cywell-opslens
```

### 5. Live Monitoring / Prometheus Metrics

These are required for CPU, memory, file system, network, pod count, and alert-backed dashboard graphs.

The API must also have:

```text
OCP_ENABLE_MONITORING_PROXY=true
```

Required namespace-scoped Role in `openshift-monitoring`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cywell-opslens-api-monitoring-read
  namespace: openshift-monitoring
rules:
  - apiGroups: [""]
    resources:
      - services/proxy
    verbs:
      - get
  - apiGroups:
      - monitoring.coreos.com
    resources:
      - prometheuses/api
    verbs:
      - get
```

Required RoleBinding:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cywell-opslens-api-monitoring-read
  namespace: openshift-monitoring
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cywell-opslens-api-monitoring-read
subjects:
  - kind: ServiceAccount
    name: cywell-opslens-api
    namespace: cywell-opslens
```

Why both are required:

| Permission | Why |
| --- | --- |
| `services/proxy` | allows Kubernetes API service proxy path to Prometheus |
| `prometheuses/api` | allows the Prometheus API endpoint to answer query requests instead of returning `403 Forbidden` or `provide credentials` |

Observed failure when missing:

```text
Forbidden (user=system:serviceaccount:cywell-opslens:cywell-opslens-api,
verb=get, resource=prometheuses, subresource=api)
```

## Required Operator Permissions

The operator must be able to create or maintain the resources it owns.

| API Group | Resources | Verbs |
| --- | --- | --- |
| `""` | `serviceaccounts`, `configmaps`, `persistentvolumeclaims`, `services`, `secrets` as designed | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` as needed |
| `apps` | `deployments`, `statefulsets` | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` |
| `route.openshift.io` | `routes` | `get`, `list`, `watch`, `create`, `update`, `patch` |
| `networking.k8s.io` | `networkpolicies` | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` |
| `console.openshift.io` | `consoleplugins` | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` |
| `ols.openshift.io` | `olsconfigs` | `get`, `list`, `watch`, `update`, `patch` only when registration mode allows it |
| `rbac.authorization.k8s.io` | `roles`, `rolebindings`, `clusterroles`, `clusterrolebindings` | `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` as required by owned RBAC |

## Preflight Commands

Run these before saying the deployment is connected.

```powershell
oc get deploy cywell-opslens-api cywell-opslens-dashboard cywell-opslens-operator -n cywell-opslens

oc set env deployment/cywell-opslens-api -n cywell-opslens --list

oc auth can-i get services/proxy `
  -n openshift-monitoring `
  --as=system:serviceaccount:cywell-opslens:cywell-opslens-api

oc auth can-i get prometheuses.monitoring.coreos.com `
  --subresource=api `
  -n openshift-monitoring `
  --as=system:serviceaccount:cywell-opslens:cywell-opslens-api

oc auth can-i get olsconfigs.ols.openshift.io `
  --as=system:serviceaccount:cywell-opslens:cywell-opslens-api

oc exec deploy/cywell-opslens-api -n cywell-opslens -- `
  curl -sk https://127.0.0.1:9443/api/ocp/console-overview
```

Expected utilization result:

```json
{
  "consoleDashboard": {
    "utilization": {
      "enabled": true,
      "reachable": true,
      "source": "openshift-monitoring",
      "series": [
        { "id": "cpu", "samples": [ "...non-empty..." ] }
      ]
    }
  }
}
```

## Current Gap To Fix Next

The KH live smoke now proves that the required permission and env set is sufficient. The remaining gap is productization: the same state must be produced by the Operator without pausing the Operator or hand-patching the API Deployment.

1. Keep the corrected monitoring Role resource:
   - wrong: `prometheuses/api.monitoring.coreos.com`
   - right: `prometheuses/api` under `apiGroups: ["monitoring.coreos.com"]`
2. Check the permission with OpenShift's subresource syntax:
   - right: `oc auth can-i get prometheuses.monitoring.coreos.com --subresource=api`
3. Add `OCP_ENABLE_MONITORING_PROXY=true` to the operator-managed API deployment template.
4. Add the `openshift-monitoring` Role/RoleBinding to the operator-managed resources.
5. Prefer the in-cluster Kubernetes service proxy path before monitoring routes in the API client.
6. Rebuild and deploy the updated Operator/API package before re-enabling the Operator reconciler.
7. Restart the operator only after the reconciler no longer removes the monitoring env.
8. Re-run the preflight commands and capture `utilization.reachable=true`.

Completion condition: no claim of live CPU/memory/dashboard graph integration is valid until `utilization.enabled=true`, `utilization.reachable=true`, and at least one metric series has non-empty `samples`.

## Missing Items Closed In This Pass

| Missing Item | Resolution | Proof |
| --- | --- | --- |
| Local Go toolchain / `gofmt` | Installed Go with `winget install GoLang.Go` and ran `gofmt` | `go version go1.26.4 windows/amd64`; `gofmt -w deploy/operator/controller-runtime/controllers/opslensinstallation_controller.go` |
| Go compile check | Ran controller-runtime package tests | `go test ./...` passed in `deploy/operator/controller-runtime` |
| API TypeScript compile | Rebuilt API after Prometheus path changes | `npm run -w @kugnus/api build` passed |
| Operator package static verification | Re-ran package verifier after RBAC and env changes | `npm run verify:operator` passed with 0 fail, 161 checks, 1 pre-existing runtime warning |
| KH live deployment gate | Added monitoring sample proof and re-ran KH deployment verifier | `npm run verify:kh:crc420-deployment` returned `PASS_WITH_WARNINGS`; `monitoring:utilization-samples` passed with source `openshift-monitoring` and 6 samples |

Remaining explicit warning:

```text
browser:first-load: login-session browser verification is still required.
```

This warning means the automated verifier did not drive an already-authenticated human browser session through the first click path. It does not block the backend connection proof. The same verifier confirmed `/opslens` HTTP 200, ConsolePlugin `UserToken` proxy contract, dashboard route HTTP 200, Lightspeed readiness, Lightspeed assistant answer path, BuildConfig API path, and live monitoring samples.

## Lessons Locked From This Failure

These are now operating rules, not optional notes.

### 1. A running pod is not a connected product

`1/1 Running` only proves that the container started. It does not prove:

- the API has the required env
- the API service account has the required RBAC
- the ConsolePlugin proxy path is correct
- Lightspeed answers through the intended path
- Prometheus returns real samples
- UI data is live instead of fallback or empty state

Future status reports must separate:

```text
Deployed != Connected != Functionally verified
```

### 2. Operator-managed resources must be fixed in the operator, not by hand

Manual `oc set env deployment/cywell-opslens-api ...` was reverted because the operator reconciler owns the API Deployment template.

Correct rule:

```text
If the operator owns it, patching the live Deployment is only a temporary smoke test.
The permanent fix must be in the reconciler, bundle, and catalog image.
```

Before applying a live patch, check:

```powershell
oc get deploy cywell-opslens-operator -n cywell-opslens
oc get csv -n cywell-opslens | Select-String cywell
```

### 3. RBAC must be checked by exact subresource, not by similar-looking resource names

This failed because a Role was created with the wrong resource string:

```text
wrong: prometheuses/api.monitoring.coreos.com
right: apiGroups=["monitoring.coreos.com"], resources=["prometheuses/api"]
```

Rule:

```text
Never trust "role created" as proof.
Always run oc auth can-i for the exact resource/subresource.
```

Required proof uses OpenShift's resource plus subresource syntax:

```powershell
oc auth can-i get prometheuses.monitoring.coreos.com `
  --subresource=api `
  -n openshift-monitoring `
  --as=system:serviceaccount:cywell-opslens:cywell-opslens-api
```

### 4. Read the live error literally

The live error already named the missing permission:

```text
verb=get, resource=prometheuses, subresource=api
```

The correct action is to translate that exact pair into RBAC:

```yaml
apiGroups:
  - monitoring.coreos.com
resources:
  - prometheuses/api
verbs:
  - get
```

### 5. Env examples are part of the product contract

Missing env caused silent fallback:

```text
OCP_ENABLE_MONITORING_PROXY=true
```

This must be present in:

- `.env.example` or deployment example
- operator-managed API Deployment env
- verification script
- release checklist
- troubleshooting document

No future integration should rely on memory or chat instructions for required env.

### 6. "Connected" must be proven through the product API response

For monitoring, the only acceptable proof is not a screenshot and not a pod status. It is:

```json
"utilization": {
  "enabled": true,
  "reachable": true,
  "source": "openshift-monitoring",
  "series": [
    { "samples": [ ... ] }
  ]
}
```

Rule:

```text
If samples are empty, the graph is not connected.
If reachable=false, do not call it live monitoring.
```

### 7. Windows KH commands need PowerShell-safe syntax

KH remote shell is Windows/PowerShell. Linux-style helpers such as `grep` and unescaped parentheses in URLs caused command noise.

Rule:

```text
Use Select-String or avoid filtering on the remote shell.
URL-encode Prometheus query expressions when calling oc get --raw.
```

Example:

```powershell
oc get --raw /api/v1/namespaces/openshift-monitoring/services/https:prometheus-k8s:9091/proxy/api/v1/query?query=count%28kube_pod_info%29
```

### 8. Preflight comes before deployment packaging

For each new version, the order must be:

1. Define required env/RBAC/routes/proxies.
2. Run preflight `can-i` and API smoke checks.
3. Fix code/operator manifests.
4. Build package.
5. Deploy.
6. Prove product API response.
7. Only then inspect UI.

Skipping steps 1-2 created repeated rebuild/redeploy loops.

### 9. Dashboard UI must expose missing connectivity instead of hiding it

The UI must not show empty CPU/memory cards as if data exists. It must show:

- source
- reachable/unreachable
- sample count
- exact missing permission or missing env

This has been added to the web UI, but the backend connection still needs the RBAC fix above.

### 10. New completion gate for OpsLens live integration

Before any future "done" report, the following must all pass:

```text
API pod Running                      PASS
OCP API reachable                    PASS
ConsolePlugin proxy reachable        PASS
Lightspeed answer path reachable     PASS
services/proxy can-i                 PASS
prometheuses/api can-i               PASS
OCP_ENABLE_MONITORING_PROXY=true     PASS
utilization.enabled=true             PASS
utilization.reachable=true           PASS
metric samples non-empty             PASS
UI renders live sample counts        PASS
```

Anything less is partial, and must be reported as partial.

## 2026-06-20 KH Deployment Closure

Final deployed source:

```text
branch: feat/OpsLens-Dev0.1.8
head: 96d77bff
image tag: v0.1.8-kh-crc420-96d77bff
target: KH Windows CRC OpenShift 4.20.5
```

The deployment was rebuilt and pushed to the KH CRC internal registry with this tag:

- cywell-opslens-operator
- cywell-opslens-api
- cywell-opslens-dashboard
- cywell-opslens-operator-bundle
- cywell-opslens-catalog

The CatalogSource, OLM install, operator Deployment, API Deployment, dashboard Deployment, and OpsLensInstallation image refs all converged on `v0.1.8-kh-crc420-96d77bff`.

Verified final state:

```text
catalog:source-image                 PASS
catalog:related-image:operator       PASS
catalog:related-image:api            PASS
catalog:related-image:dashboard      PASS
olm:csv-phase                        PASS
runtime:deployment-image:operator    PASS
runtime:deployment-image:api         PASS
runtime:deployment-image:dashboard   PASS
runtime:pods-ready                   PASS
runtime:cr-phase                     PASS
console:plugin-enabled               PASS
console:opslens-route                PASS
runtime:api-buildconfigs             PASS
monitoring:utilization-samples       PASS, source=openshift-monitoring, samples=6
lightspeed:assistant-answer          PASS, openshift-lightspeed/v1/streaming_query:ask
```

One non-product warning remains:

```text
browser:first-load: login-session browser verification is still required;
in-app browser is blocked by the local CRC certificate authority.
```

Important correction from this run:

The verifier previously accepted `openshift-lightspeed/unavailable` because it only checked the `openshift-lightspeed/` prefix. That was a false-positive completion gate. The check now only passes when the model starts with:

```text
openshift-lightspeed/v1/streaming_query
```

This prevents fallback text from being reported as a real Lightspeed answer.
