# Cywell OpsLens Dev 0.1.2 Morning Handoff

Date: 2026-06-17 KST
Branch: `feat/OpsLens-Dev0.1.2`
Base ref: `origin/main`

## Current Judgment

Dev 0.1.2 is now in a safer state for the next CRC demo loop:

- the local web shell has KOMSCO/OpsLens assistant branding and KO/EN contracts protected by a verifier
- the shell now names standalone preview versus ConsolePlugin route/proxy mode
- the Operator reconcile path no longer needs finalizer permission for owner references
- a CRC lightweight `OpsLensInstallation` sample exists so local demos can avoid pgvector/vLLM failure classes
- the next-day live reconnect path is documented without secrets or exact private network values

This is not a claim that production install is ready. The pre-cluster gate still blocks install by evidence gaps.

## Commits On This Branch

```text
8c04d16 Update CRC live verification handoff
f7a7078 Harden CRC operator runtime defaults
e1f2883 Harden ConsolePlugin mode diagnostics
23fc447 Localize OpsLens admin shell
d45a9b1 Plan Dev 0.1.2 overnight loop
cf791e1 Tighten web shell evidence
```

## Verified Gates

Latest non-mutating checks:

| Command | Result | Note |
| --- | --- | --- |
| `npm run verify:web-shell` | PASS | 0 fail, 7 checks |
| `npm run verify:console-plugin` | PASS | 0 fail, 9 checks |
| `npm run verify:operator:reconcile` | PASS | 0 fail, 23 checks |
| `npm run verify:operator:runtime` | PASS | 0 fail, 77 checks |
| `npm run verify:operator` | PASS/WARN | 0 fail, 1 warn; live OLM smoke remains external |
| `npm run verify:install-plan` | PASS/WARN | 0 fail, 7 warn; evidence freshness and Lightspeed gap remain |
| `npm run verify:pre-cluster-install` | PASS/WARN | 0 fail, 19 warn; `safeToRunClusterInstall=false` |

## What To Open First

1. Local dev shell:

```text
http://127.0.0.1:5173/index.html
```

2. CRC dashboard through port-forward:

```text
https://127.0.0.1:19443
```

3. OpenShift Console OperatorHub:

Search `cywell`, then confirm the package shows `cywell-opslens-operator.v0.1.1`.

## First Commands Tomorrow

On the MacBook SSH terminal:

```bash
crc status
oc whoami && oc project -q
oc get packagemanifest cywell-opslens -n default -o yaml | grep -E 'currentCSV|v0.1.1-crc|cywell-opslens-operator' -n
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
```

If port-forwards died, rebuild them from:

```text
docs/runbooks/cywell-opslens-crc-live-handoff.md
```

## Product Boundary To Remember

OperatorHub install is only the Operator install.

The real product apply is the `OpsLensInstallation` custom resource. For CRC demos, prefer:

```text
deploy/operator/config/samples/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
```

That sample intentionally uses:

- internal CRC image refs
- in-memory vector mode
- mock-local model runtime
- `ValidateOnly` Lightspeed registration

## Remaining Gaps

| Gap | Current Cause | Next Best Action |
| --- | --- | --- |
| pre-cluster install not green | source evidence stale and live OCP/Lightspeed evidence incomplete | refresh live evidence after reconnect |
| vLLM not suitable for CRC demo yet | external image/mirror/runtime evidence gap | keep CRC lightweight profile, mirror/runtime review later |
| pgvector restricted SCC issue | default pgvector image wants filesystem permissions restricted SCC blocks | keep in-memory profile for demo or design a secure supported Postgres profile |
| native OpenShift Lightspeed drawer not rebranded | OpenShift-owned console surface | keep OpsLens as route/plugin mod unless a verified console-extension lane is approved |
| final release/certification | external registry/security/certification evidence not complete | do not claim certified readiness |

## Do Not Do

- do not use the company OCP target
- do not paste `.env` values into docs or chat
- do not push images or patch OLSConfig unless explicitly approved
- do not wait on a pod still pulling `quay.io/cywell/opslens-operator:0.1.0`; that is stale catalog/subscription state
- do not treat `http://127.0.0.1:19443` as the dashboard URL; use `https://`

## Smallest Next Engineering Step

After reconnecting the MacBook CRC target, apply the CRC lightweight sample and verify:

```bash
oc apply -f ~/opslens_v1alpha1_opslensinstallation_crc_lightweight.yaml
oc get opslensinstallation,deploy,pod,svc,route -n cywell-opslens
```

Expected demo target:

- API `1/1`
- dashboard `1/1`
- OpsLensInstallation `Ready`
- no pgvector/vLLM pods required for the CRC lightweight lane
