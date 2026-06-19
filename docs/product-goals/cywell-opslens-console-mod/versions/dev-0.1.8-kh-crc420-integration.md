# Dev 0.1.8 KH CRC 4.20 Integration Gate

Status: active connection and readiness lane
Branch: `feat/OpsLens-Dev0.1.8`
Base commit: `21a5825c`
Reference target: KH Windows CRC / OpenShift Local `4.20.x`
Deployment boundary: Dev `0.1.8` starts with connection proof and runtime
classification. Image build/tag/push, catalog replacement, Operator rollout, and
cluster mutation are not part of this first gate.

## Goal

Move the live reference point from the previous Mac CRC cluster to KH Windows CRC
`4.20`, then make that connection measurable before any new product work is
claimed.

The 0.1.8 rule is simple:

```text
If OpsLens is now targeting KH, every live claim must prove which KH endpoint,
OpenShift version, console plugin state, and ClusterOperator state it observed.
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

- It does not deploy a new OpsLens image.
- It does not push to the internal registry.
- It does not replace the CatalogSource.
- It does not patch `console.operator.openshift.io`.
- It does not create Secrets, RBAC, routes, or workloads.
- It does not claim full 1:1 console parity.

## Next Work After Gate Pass

1. Use KH `4.20` API evidence to decide which dashboard panels can be live.
2. Convert native-console blank states into explicit OpsLens source diagnostics.
3. Continue 1:1 menu mapping from Workloads outward, with native deep links for
   mutation flows and OpsLens-owned read/diagnostic views for evidence.
4. Only after the local test page proves the behavior, build/tag/push a new
   runtime image for KH deployment.
