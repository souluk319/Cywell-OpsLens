# OCP Auth Recovery

Use this runbook when Cywell OpsLens can reach the OpenShift API endpoint but
the configured credential is rejected or incomplete. The common CRC symptom is:

- `npm run verify:ocp:target-profile` reports `CRC_SANDBOX_READY`.
- `npm run verify:ocp:connectivity -- --timeout-ms 30000` reports
  `classification=auth-failed`.
- `npm run verify:lightspeed -- --timeout-ms 30000` fails before live
  Lightspeed resources can be read.

## Boundary

This runbook is credential recovery guidance only. It does not approve or run
cluster mutation.

Allowed first checks:

```bash
npm run verify:env
npm run verify:ocp:target-profile
npm run verify:ocp:connectivity -- --timeout-ms 30000
```

Forbidden without explicit human approval:

- applying RBAC or Operator manifests
- patching `OLSConfig`
- deleting or scaling workloads
- writing secrets to tickets, logs, Markdown, shell history, or git

## Credential Ownership

Treat OCP API and Lightspeed API credentials as different contracts unless the
specific deployment proves otherwise.

| Key | Authenticates to | Used for | Default assumption |
|---|---|---|---|
| `OCP_API_TOKEN` | OpenShift/Kubernetes API | read-only cluster resources, events, logs, CRDs, ConsolePlugins, OLSConfig discovery, RBAC probes | OpenShift bearer token for the active cluster |
| `OPENSHIFT_LIGHTSPEED_API_TOKEN` | Lightspeed app/API endpoint | direct Lightspeed readiness or MCP/API calls when that endpoint requires auth | Lightspeed-specific token or verified forwarded user bearer |

Do not paste the OCP token into the Lightspeed token field just to satisfy an
env check. First prove which auth scheme the active Lightspeed endpoint expects.
If the endpoint is reached through a Console session or in-cluster service
account path, the direct API token may be different or unnecessary. If it is
reached by a local port-forward, the token must match that Lightspeed server's
configured authentication, not merely the OCP API server.

`auth-failed` against the OCP API must be fixed before treating Lightspeed as
broken, because the Lightspeed verifier may need read-only OCP discovery before
it can inspect live Lightspeed resources.

## Lightspeed Endpoint Location

Choose `OPENSHIFT_LIGHTSPEED_BASE_URL` based on where the client process runs:

| Client location | Base URL shape |
|---|---|
| Same machine as `oc port-forward` | `https://127.0.0.1:<forwarded-port>` |
| Pod inside the OpenShift cluster | `https://lightspeed-app-server.openshift-lightspeed.svc.cluster.local:<service-port>` |
| Different workstation from the port-forward owner | use a reviewed tunnel or run the verifier on the port-forward owner |

`127.0.0.1` is always local to the process that opens the connection. A
port-forward on a MacBook is not automatically reachable from this Windows
workspace through `127.0.0.1`.

## CRC Token Refresh

On the machine that owns CRC, refresh the credential through the normal CRC
login flow and copy only the token into the ignored local `.env` through approved
secret handling.

```bash
crc start
eval $(crc oc-env)
oc login -u kubeadmin -p <crc-password> <crc-api-url>
oc whoami
oc whoami -t
```

Update the ignored local `.env`:

```env
OCP_API_BASE_URL=<crc-api-url>
OCP_API_TOKEN=<redacted>
OCP_TLS_VERIFY=false
OCP_API_TIMEOUT_SECONDS=30
CYWELL_OPSLENS_RAG_RUNTIME_MODE=local
OCP_ENABLE_MONITORING_PROXY=false
```

Then rerun:

```bash
npm run verify:env
npm run verify:ocp:target-profile -- --require-crc
npm run verify:ocp:connectivity -- --timeout-ms 30000
npm run verify:lightspeed -- --timeout-ms 30000
```

## Company Or Shared OCP

If the target is `COMPANY_SHARED_READ_ONLY`, do not refresh credentials by
guessing or reusing CRC tokens. Ask the cluster owner for the approved read-only
credential path, then rerun the same read-only verifiers.

```bash
npm run verify:ocp:target-profile
npm run verify:ocp:connectivity -- --timeout-ms 30000
npm run evidence:ocp-auth-rbac-plan
```

`auth-failed`, `auth-or-rbac`, and `token-missing` are cluster-admin evidence
lanes. Network and TLS lanes remain separate.

## Recovery Evidence

`npm run verify:ocp:connectivity -- --timeout-ms 30000` writes a redacted
auth-recovery packet to:

```text
test-results/cywell-opslens-ocp-auth-recovery.md
```

The packet must keep:

- `credentialStoredByVerifier=false`
- `tokenValueRedacted=true`
- `credentialRefreshRequiresHumanApproval=true`
- `clusterMutationAttempted=false`
- `registryMutationAttempted=false`
- `mutationAllowedByThisVerifier=false`

After the token works, refresh the downstream local evidence:

```bash
npm run verify:lightspeed -- --timeout-ms 30000
npm run evidence:ocp-auth-rbac-plan
npm run verify:evidence-checkpoint
npm run verify:roadmap-plan
```

## Rollback

No rollback is required for this runbook because it is read-only guidance. If
the wrong `.env` target is selected, restore the previous ignored `.env` values
from your local secret manager and rerun the target profile verifier before any
live checks.
