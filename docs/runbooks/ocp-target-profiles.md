# OCP Target Profiles

Cywell OpsLens uses one active OCP target at a time through the ignored local `.env`.
Use this runbook when switching between a shared company OCP cluster and a local CRC
sandbox.

## Profiles

| Profile | Purpose | Default boundary |
|---|---|---|
| Company/shared OCP | Read-only observation, provider trace, live evidence collection | No install, patch, apply, delete, or scale |
| CRC sandbox | Development iteration, local install rehearsal, Operator and ConsolePlugin experiments | Still approval-aware, but isolated from company users |

## Company OCP Safety

When another operator is changing the company cluster, keep Cywell OpsLens in
observation mode:

```bash
npm run verify:env
npm run verify:ocp:target-profile
npm run verify:ocp:connectivity -- --timeout-ms 30000
npm run verify:console-assistant-provider
```

Do not run approval-gated commands such as `oc apply`, `oc patch`, Operator install,
or OLSConfig patching against the company cluster unless there is an explicit human
approval record.

## CRC Switch

On the MacBook that owns CRC:

```bash
crc start
eval $(crc oc-env)
oc login -u kubeadmin -p <crc-password> <crc-api-url>
oc whoami -t
```

Then update the ignored local `.env` through approved local secret handling:

```env
OCP_API_BASE_URL=<crc-api-url>
OCP_API_TOKEN=<redacted>
OCP_TLS_VERIFY=false
OCP_API_TIMEOUT_SECONDS=30
CYWELL_OPSLENS_RAG_RUNTIME_MODE=local
OCP_ENABLE_MONITORING_PROXY=false
```

Verify the switch without mutating either cluster:

```bash
npm run verify:env
npm run verify:ocp:target-profile -- --require-crc
npm run verify:lab-bootstrap
npm run verify:lab-image-map
npm run verify:ocp:connectivity -- --timeout-ms 30000
npm run verify:lightspeed:fixture
npm run verify:lightspeed:patch-preview:fixture
```

If this Windows workspace cannot reach the CRC API endpoint, run the checks on
the MacBook workspace or expose a reviewed local/tunnel endpoint and keep the
`.env` target marked as CRC-owned. Do not reuse the company OCP target for
sandbox install experiments.

## CRC Lab Image Bootstrap

Before trying to install Cywell OpsLens on a new CRC lab host, separate local
artifact readiness from cluster mutation:

```bash
npm run verify:images:build
npm run verify:lab-bootstrap
npm run verify:lab-image-map
```

The bootstrap packet checks local Docker, local OpsLens image tags, the portable
image tar, and the images referenced by the Operator CSV, FBC catalog,
CatalogSource, sample `OpsLensInstallation`, app stack, and manager manifests.
It also records the known CRC registry failure classes: Docker credential
helper prompts, untrusted registry certificates, dead port-forwards, and CRC
versions that no longer support image import commands.
For a dedicated high-spec Windows lab host, it also records the lab tier,
CPU/RAM/GPU VRAM capacity, recommended local CRC memory/CPU/disk settings, and
the runtime placement decision. GPU-backed vLLM/Gemma experiments stay
external-first until API, dashboard, Lightspeed MCP, and read-only evidence
gates are stable.

The image-map packet writes ignored JSON, Markdown, and YAML previews under
`test-results/`. It rewrites owned Operator/API/dashboard/bundle/catalog image
references to a CRC registry placeholder and leaves vLLM/Postgres pgvector as
explicit external-runtime review gaps. The Kubernetes preview is only for
`oc apply --dry-run=server`, and the FBC preview is only for `opm validate`.
Treat generated registry push commands as approval-gated instructions, not as
commands this verifier has run.

On the dedicated Windows CRC lab host, after the repo and image tar are present:

```bash
npm run verify:lab-bootstrap -- --lab-machine --require-crc-running
```

For the planned 128GiB-class lab PC with a 12GiB VRAM GPU, use the stricter
capacity check before any install rehearsal:

```bash
npm run verify:lab-bootstrap -- --lab-machine --require-crc-running --min-ram-gb 96 --min-cpu-cores 12 --min-gpu-vram-gb 12
```

Add `--require-gpu` only when GPU runtime availability is a hard gate for that
specific rehearsal. Otherwise the verifier should keep GPU as an explicit gap
instead of blocking API/dashboard/operator bring-up.

Do not run `oc new-project`, registry login/push, `oc apply`, InstallPlan
approval, or OLSConfig patching until the bootstrap and handoff packets show the
exact remaining approval-gated action.

## Evidence

`npm run verify:ocp:target-profile` writes
`test-results/cywell-opslens-ocp-target-profile.json` with only key names, target
classification, mutation boundary, and next commands. It does not contact the
cluster, print tokens, print exact company endpoints, fetch Secrets, or mutate
anything.
