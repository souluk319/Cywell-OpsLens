# Dev 0.1.8 KH CRC 4.20 Integration Gate

Status: KH 0.1.8 deployed; browser session verification pending
Branch: `feat/OpsLens-Dev0.1.8`
Base commit: `21a5825c`
Reference target: KH Windows CRC / OpenShift Local `4.20.x`
Deployment boundary: Dev `0.1.8` starts with connection proof and runtime
classification, then moves to an approved KH no-prompt deployment lane. The
deployment lane must use SSH key access and the remote KH `oc` context; it must
not store or echo passwords, API tokens, pull secrets, or provider keys.

## Goal

Move the live reference point from the previous Mac CRC cluster to KH Windows CRC
`4.20`, then make that connection measurable before any new product work is
claimed.

The 0.1.8 rule is simple:

```text
If OpsLens is now targeting KH, every live claim must prove which KH endpoint,
OpenShift version, console plugin state, and ClusterOperator state it observed.
```

The deployment rule is equally strict:

```text
If OpsLens is deployed to KH, the operator version, catalog version, image tags,
ConsolePlugin state, route/proxy path, and assistant connectivity must all point
to the same 0.1.8 build. No stale Mac CRC state, no stale 0.1.7/0.1.6 images,
and no manual password prompts are acceptable in the normal path.
```

## Completion Criteria

| ID | Pass / Fail rule | Evidence |
| --- | --- | --- |
| AC-018-001 | Local route hosts for API, console, OAuth, and downloads resolve to loopback through the active KH tunnel. | `npm run verify:kh:crc420-connection` |
| AC-018-002 | Local TCP ports `443` and `6443` accept connections. | Same verifier |
| AC-018-003 | Console route and Kubernetes `/version` endpoint return real HTTPS responses. | Same verifier |
| AC-018-004 | `oc` is connected to the local CRC API route and `clusterversion` reports OpenShift `4.20.x`. | Same verifier |
| AC-018-005 | Console, monitoring, insights, and image-registry ClusterOperator states are recorded as `PASS` or `WARN`; warnings become UI fallback requirements, not silent failures. | Same verifier artifact |
| AC-018-006 | ConsolePlugin capability and `cywell-opslens` enablement are reported separately so we do not confuse "cluster connected" with "OpsLens deployed." | Same verifier artifact |
| AC-018-007 | SSH access to KH works in non-interactive mode with `BatchMode=yes`; no password is required for normal automation. | `ssh -o BatchMode=yes Kugnus-Home "oc version --client"` |
| AC-018-008 | KH deployment automation refuses to run if it would need a typed password, sudo prompt, missing kubeconfig, missing Docker/Podman context, or missing registry login. | Deployment preflight output |
| AC-018-009 | The generated image tag, bundle CSV, CatalogSource image, Subscription `currentCSV`, deployment image tags, and `OpsLensInstallation.status.version` agree on the same 0.1.8 build. | Deployment verifier artifact |
| AC-018-010 | OpenShift Console has `cywell-opslens` enabled and the user-facing launch path opens without first-load 404. | ConsolePlugin verifier plus browser check |
| AC-018-011 | OpsLens API can reach the KH OpenShift API and, when Lightspeed is installed, reports Lightspeed status separately from base OpsLens health. | Runtime verifier artifact |

## Current Command

```powershell
npm run verify:kh:crc420-connection
```

The command writes:

```text
test-results/cywell-opslens-kh-crc420-connection.json
```

The artifact is intentionally non-secret and redacts private addresses, tokens,
passwords, and API keys.

The verifier matches the current KH access model:

- Browser traffic uses the Windows localhost SSH tunnel to KH.
- If Windows local `oc` has no kubeconfig, cluster state is read with
  `ssh Kugnus-Home oc ...`.
- The SSH host can be overridden with:

```powershell
npm run verify:kh:crc420-connection -- --ssh-host=Kugnus-Home
```

## KH No-Prompt Deployment Setup

The KH path must not depend on repeatedly typing the machine password. The
accepted automation model is:

- SSH uses the configured `Kugnus-Home` host and key-based authentication.
- Remote cluster reads and writes use `ssh Kugnus-Home oc ...`.
- Browser access uses local loopback routes through the active SSH tunnel.
- Any OpenShift registry login, provider API key, or OLSConfig change is treated
  as a separate explicit setup step and is never written into repository files.

Current KH setup result:

```text
ssh -o BatchMode=yes -o ConnectTimeout=8 Kugnus-Home "oc version --client"
```

passes and reports an OpenShift `4.20.5` client/server target through the remote
KH `oc` context.

If a future command asks for a password, the automation must stop and report the
exact missing setup instead of embedding the password in a script.

## KH 0.1.8 Deployment Result

Current deployment stamp:

```text
branch=feat/OpsLens-Dev0.1.8
head=d8080e9b
tag=v0.1.8-kh-crc420-d8080e9b
target=KH Windows CRC / OpenShift 4.20.5 / amd64
```

Deployment state proven on KH:

```text
CatalogSource: cywell-opslens-catalog -> cywell-opslens-catalog:v0.1.8-kh-crc420-d8080e9b
PackageManifest: cywell-opslens-operator.v0.1.8
Subscription: cywell-opslens / alpha
InstallPlan: approved for cywell-opslens-operator.v0.1.8
CSV: cywell-opslens-operator.v0.1.8 / Succeeded
OpsLensInstallation: cywell-opslens / Ready / version 0.1.8
API deployment: cywell-opslens-api:v0.1.8-kh-crc420-d8080e9b / 1/1 Running
Dashboard deployment: cywell-opslens-dashboard:v0.1.8-kh-crc420-d8080e9b / 1/1 Running
Dashboard route: cywell-opslens-dashboard-cywell-opslens.apps-crc.testing / HTTP 200
ConsolePlugin: cywell-opslens created and enabled in console.operator cluster
Console route: /opslens returns HTTP 200
```

The current verifier result is:

```text
npm run verify:kh:crc420-connection
finalStatus=PASS_WITH_WARNINGS
```

Warnings are intentional and currently accepted for KH:

- Local Windows `oc` has no kubeconfig, so the verifier uses `ssh Kugnus-Home oc ...`.
- KH CRC 4.20 does not expose an `insights` ClusterOperator, so OpsLens must
  render that source as unavailable/degraded instead of faking data.
- in-app browser automation cannot open the KH console route until the local
  CRC certificate is trusted by that browser surface; curl and the user browser
  route both prove HTTP reachability.

## KH Deployment Fixes Applied

These are now known requirements for the KH CRC path:

- `OperatorGroup` must exist in the install namespace before OLM creates the
  InstallPlan.
- `system:image-puller` must be granted to
  `system:serviceaccounts:openshift-marketplace` in `cywell-opslens`, otherwise
  the catalog Pod cannot pull from the internal image registry.
- Direct Docker push to the KH internal registry can fail on Docker Desktop CA
  trust. The working path was local registry staging plus `oc image mirror` with
  explicit registry auth and CA.
- The 0.1.8 operator currently needs KH dev-only RBAC expansion so it can:
  - watch Secrets without cache-sync failure,
  - create API read-only RBAC without privilege-escalation rejection,
  - create the API/Dashboard services, Route, and ConsolePlugin.

The RBAC expansion is labeled `cywell.io/lab-scope=kh-crc-dev-only`. It is a
development unblocker, not a production security posture. The proper product fix
is to narrow the operator watches and ship the exact API read-only RBAC in the
CSV/operator package instead of relying on a live lab override.

## Product Interpretation

KH native OpenShift Console panels may fail to load some monitoring or insights
data while the cluster is still being prepared. OpsLens must not copy that blank
failure as "parity." Instead:

- If the original console source is healthy, OpsLens should map and improve it.
- If the original console source is degraded, OpsLens should show the same
  functional slot with the exact degraded source and a fallback or next check.
- If a resource or API is not available on OCP `4.20`, OpsLens should classify it
  as an optional enhancement or explicit gap, not fake a live result.

This keeps the story honest:

```text
OpenShift Console function match first
-> live/degraded/unavailable source evidence second
-> OpsLens visualization and assistant guidance third
```

## What This Version Does Not Do

- It does not store passwords or secrets in code, docs, git, or generated
  artifacts.
- It does not hide missing setup by falling back to the previous Mac CRC target.
- It does not claim full 1:1 console parity until KH live evidence proves each
  native console function source and OpsLens enhancement.
- It does not patch OLSConfig, create provider Secrets, or grant broader RBAC
  unless that exact KH action has been approved.

## Next Work After Gate Pass

1. Turn the ad hoc KH deployment lane into a checked script that performs
   preflight, catalog apply, InstallPlan approval, CR apply, ConsolePlugin
   enablement, and evidence capture without password prompts.
2. Move the KH dev-only RBAC discoveries back into the operator package as
   narrowed, auditable permissions.
3. Verify first-load browser behavior from the real user Chrome session:
   `/opslens` must not require a manual refresh and must not show a first-load
   404.
4. Verify stale-state removal: no 0.1.7/0.1.6 image tag, CSV, route, or plugin
   launch path is still serving the active demo.
5. Continue 1:1 menu mapping from Workloads outward, with native deep links for
   mutation flows and OpsLens-owned read/diagnostic views for evidence.
