# Cywell OpsLens CRC Live Handoff

Date: 2026-06-17 KST
Branch target: `feat/OpsLens-Dev0.1.2`
Scope: MacBook CRC OpenShift only. Do not use the company OCP cluster.

## Goal

Restore the same live development lane after the MacBook moves:

- Windows workstation remains the development workspace.
- MacBook CRC remains the OpenShift target.
- OpenShift Console OperatorHub installs the OpsLens Operator.
- `OpsLensInstallation` is the product apply step that creates the API, dashboard, ConsolePlugin, and local assistant integration resources.

## Leave Running If The MacBook Stays In The Office

Keep these alive when possible:

1. MacBook power and network.
2. CRC OpenShift.
3. Docker Desktop if image work may continue.
4. Mac terminal for Lightspeed port-forward.
5. Windows SSH tunnel terminal for the Lightspeed local tunnel.

If the MacBook is moved or sleeps, assume all port-forwards died and rebuild them from the checklist below.

## First Checks On The MacBook

Run on the MacBook SSH terminal:

```bash
crc status
oc whoami && oc project -q
oc get clusterversion
oc get co
```

Pass signal:

- `CRC VM: Running`
- `OpenShift: Running`
- `oc whoami` returns the expected CRC user
- cluster version is available and not progressing

## Lightspeed Port-Forward Chain

MacBook terminal:

```bash
oc -n openshift-lightspeed port-forward svc/lightspeed-app-server 8443:8443
```

Keep that terminal open. A root request returning `HTTP=404` is still a live server signal, not failure:

```bash
curl -k -sS --connect-timeout 5 -o /dev/null \
  -w 'HTTP=%{http_code} TIME=%{time_total}\n' \
  https://127.0.0.1:8443
```

Windows PowerShell tunnel terminal:

```powershell
ssh -N -L 18443:127.0.0.1:8443 <mac-ssh-alias>
```

Keep that terminal open too. No output after password entry is normal.

Windows repo PowerShell:

```powershell
cd C:\Users\soulu\cywell\Kugnus-Ops-Lens
$env:OPENSHIFT_LIGHTSPEED_BASE_URL="https://127.0.0.1:18443"
```

Do not edit `.env` just to account for the tunnel. The override is safer because it dies with the PowerShell session.

## Dashboard Route And Port-Forward Fallback

After the CRC lightweight `OpsLensInstallation` is applied, prefer the OpenShift Route:

```bash
oc get route cywell-opslens-dashboard -n cywell-opslens
```

If the Route exists, open the shown host from a browser that can resolve the CRC apps domain.

Use the port-forward path only when the browser cannot resolve the CRC Route host or the Route has not reconciled yet.

MacBook terminal:

```bash
oc -n cywell-opslens port-forward svc/cywell-opslens-dashboard 19443:443
```

If Windows cannot reach that port directly, use a Windows SSH tunnel:

```powershell
ssh -N -L 19443:127.0.0.1:19443 <mac-ssh-alias>
```

Open from the machine that owns the reachable local port:

```text
https://127.0.0.1:19443
```

Use `https://`, not `http://`, because the service is exposed on TLS port 443.

## OperatorHub Versus Product Apply

This distinction matters:

| Step | What It Does | What It Does Not Do |
| --- | --- | --- |
| OperatorHub card install | Installs the Cywell OpsLens Operator into OLM. | It does not create the OpsLens API/dashboard by itself. |
| `OpsLensInstallation` CR | Tells the Operator to create API, dashboard, ConsolePlugin, runtime wiring, and Lightspeed registration behavior. | It should not patch OLSConfig unless the mode explicitly allows it. |

Normal install evidence:

```bash
oc get packagemanifest cywell-opslens -n default -o yaml | grep -E 'currentCSV|v0.1.2-dev-crc|cywell-opslens-operator' -n
oc get subscription,csv,deploy,pod -A | grep cywell
oc get crd opslensinstallations.opslens.cywell.io
```

Expected package signal for the CRC build:

```text
currentCSV: cywell-opslens-operator.v0.1.2
image-registry.openshift-image-registry.svc:5000/cywell-opslens/cywell-opslens-operator:v0.1.2-dev-crc
```

If the pod image is still `quay.io/cywell/opslens-operator:0.1.0`, the stale catalog or stale subscription path is still active. Stop and refresh the catalog/subscription intentionally instead of waiting.

Before rebuilding or pushing CRC catalog images, regenerate the versioned CRC handoff packet:

```powershell
npm run lab:catalog:crc
npm run verify:crc-demo-readiness
npm run verify:lab-image-map
```

The checked-in release bundle may still be `cywell-opslens-operator.v0.1.0`; that is the source package contract. The CRC demo must trust the generated context under `test-results/crc-dev-catalog`, and that generated context must publish:

```text
test-results/crc-dev-catalog/bundle/manifests/cywell-opslens-operator.clusterserviceversion.yaml -> cywell-opslens-operator.v0.1.2
test-results/crc-dev-catalog/fbc/catalog.yaml -> cywell-opslens-operator.v0.1.2
test-results/crc-dev-catalog/openshift/subscription-crc.yaml -> startingCSV cywell-opslens-operator.v0.1.2
test-results/crc-dev-catalog/openshift/catalogsource-crc.yaml -> cywell-opslens-catalog:v0.1.2-dev-crc
```

The generated commands must reference `v0.1.2-dev-crc`, not the ambiguous live-cluster `:verify` tag and not the release-source `0.1.0` pull path. `npm run verify:crc-demo-readiness` fails if this CRC-generated context drifts back to stale `0.1.0` install payloads.

The MacBook CRC node is `arm64`. Before copying image tar files, prove the local images are arm64:

```powershell
docker image inspect cywell/opslens-operator:v0.1.2-dev-crc cywell/opslens-api:v0.1.2-dev-crc cywell/opslens-dashboard:v0.1.2-dev-crc cywell/opslens-operator-bundle:v0.1.2-dev-crc cywell/opslens-catalog:v0.1.2-dev-crc --format "{{.RepoTags}} ARCH={{.Architecture}} OS={{.Os}}"
```

Expected transfer artifact:

```text
test-results/cywell-opslens-crc-v0.1.2-dev-crc-arm64.tar
```

## Apply The Lightweight CRC Profile

Preferred CRC demo profile:

```text
deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
```

Why this profile exists:

- uses the internal CRC registry image references
- uses `vectorStore.provider: inmemory`
- uses `modelRuntime.provider: mock-local`
- keeps `lightspeedRegistration.mode: ValidateOnly`
- avoids pgvector permission/SCC surprises and vLLM image pull failure during local demos

If the repo is only on Windows, copy just the sample to the MacBook:

```powershell
scp .\deploy\operator\config\samples\opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml <mac-ssh-alias>:~/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
```

Then apply on the MacBook:

```bash
oc apply -f ~/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
```

Readiness check:

```bash
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
oc get route cywell-opslens-dashboard -n cywell-opslens
oc get opslensinstallation cywell-opslens -n cywell-opslens -o jsonpath='{.status.dashboardRoute.name}{" | ready="}{.status.dashboardRoute.ready}{" | entry="}{.status.dashboardRoute.entryPoint}{"\n"}'
```

Expected lightweight signal:

- `opslensinstallation` reaches `Ready`
- `opslensinstallation` shows `Route` as `cywell-opslens-dashboard`
- API deployment is `1/1`
- dashboard deployment is `1/1`
- dashboard Route exists
- `status.dashboardRoute.ready` is `true`
- no pgvector StatefulSet is required
- no vLLM pod is required

## Known Failure Names

| Symptom | Actual Cause | Correct Next Move |
| --- | --- | --- |
| OperatorHub card appears but install stays stuck | stale CatalogSource or subscription still points to old CSV/image | prove `currentCSV` and pod image first |
| Operator pod pulls `quay.io/cywell/opslens-operator:0.1.0` | old bundle content is still active | do not wait; refresh catalog/subscription to the CRC-tagged bundle |
| `customresourcedefinitions: {}` in package manifest | stale packageserver cache or wrong CSV metadata | check catalog pod content, then restart packageserver only if catalog content is correct |
| vector pod permission error | pgvector image writes to protected PostgreSQL paths under restricted SCC | use lightweight profile for CRC demo or approve a dev-only SCC workaround |
| vLLM `ImagePullBackOff` | external runtime image is unavailable/not mirrored for CRC | use mock-local profile until runtime image evidence exists |
| Windows `https://127.0.0.1:8443` fails | Windows is looking at itself, not the Mac port-forward | use `18443` SSH tunnel |
| `http://127.0.0.1:19443` fails | dashboard service is TLS | use `https://127.0.0.1:19443` |

## Local Verification From Windows

Run after reconnecting tunnels:

```powershell
cd C:\Users\soulu\cywell\Kugnus-Ops-Lens
npm run verify:web-shell
npm run verify:console-plugin
npm run verify:operator:reconcile
```

Optional Lightspeed preview check, only after `18443` tunnel is open:

```powershell
$env:OPENSHIFT_LIGHTSPEED_BASE_URL="https://127.0.0.1:18443"
npm run verify:lightspeed:patch-preview
```

This command must stay preview/validate-first. Do not apply an OLSConfig patch unless the user explicitly approves it.

## Stop Conditions

Stop and report instead of retrying if the next step needs:

- password or MFA that is not currently available
- destructive cleanup of existing OLM resources
- registry credential creation
- company OCP access
- OLSConfig patching
- exact private host/IP or secret values in logs/docs

Report branch, head SHA, current validation result, exact blocker, and the smallest next command.
