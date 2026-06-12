# Cywell OpsLens Certification Readiness

Status: draft evidence pack for Red Hat OpenShift certification and internal security review.

## Scope

Cywell OpsLens packages the API, private RAG/vector store, dashboard, model runtime, ConsolePlugin, and explicit OpenShift Lightspeed MCP registration as an Operator-managed product.

## Current Certification Position

- The bundle is not certified yet and keeps `certified: "false"` until Red Hat certification is passed.
- The package name is `cywell-opslens`.
- The supported OpenShift range declared for readiness is `v4.16-v4.19`.
- Manual install plan approval is required for catalog installs.
- OpenShift Lightspeed MCP remains a Technology Preview integration path, so the product support center stays on Operator, Console Plugin, and Cywell-controlled RAG.

## Security Controls

| Area | Control | Evidence |
|---|---|---|
| RBAC | Operator RBAC is scoped to OpsLens resources, install resources, ConsolePlugin, and OLSConfig patching, and does not grant raw Secret read access in MVP 0.1. | `deploy/operator/config/rbac/cluster_role.yaml`, `npm run verify:operator` |
| Mutation boundary | Assistant responses stay read-only or plan-only; only the Operator can patch installation resources when the CR explicitly requests it. | `packages/operator-controller/src/reconcile.ts` |
| Lightspeed registration | `ValidateOnly` never mutates; `PatchOLSConfig` preserves existing MCP servers and emits rollback evidence. | `npm run verify:operator:reconcile` |
| RAG install policy | `OpsLensInstallation.spec.rag` exposes validate-only document intake and design-only approval queue; rendered API env and ConfigMap keep raw return and enqueue disabled. | `npm run verify:operator`, `npm run verify:operator:reconcile` |
| Operator manager source | Go/controller-runtime source skeleton wires `OpsLensInstallation`, health checks, status update, RAG policy rendering, and the `ValidateOnly`/`PatchOLSConfig` split for future runtime execution. | `deploy/operator/controller-runtime/**`, `npm run verify:operator` |
| Customer data | RAG inventory returns metadata only, snippets are redacted, raw documents are not returned. | `GET /api/opslens/admin/overview` |
| RAG isolation | Local vector index is tenant-scoped and blocks unknown tenant retrieval. | `npm run verify:rag` |
| RAG evidence export | Validation evidence artifacts return redacted previews and design-only approval intent without raw Markdown, queue mutation, or vector writes. | `POST /api/opslens/admin/rag/evidence-export`, `npm run verify:rag` |
| Secrets | Raw Kubernetes Secret fetch remains blocked in API discovery, and Operator RBAC does not grant `secrets get/list/watch`. | `AC-OCP-001`, `npm run verify:operator` |
| Disconnected | CSV and FBC include `relatedImages` for all runtime images. | `deploy/operator/bundle/manifests/*.yaml`, `deploy/catalog/fbc/catalog.yaml` |
| Proxy/TLS | Certification annotations declare proxy-aware and TLS-profile readiness intent. | CSV annotations |
| FIPS | FIPS is currently declared unsupported until image/runtime validation proves compliance. | `features.operators.openshift.io/fips-compliant: "false"` |

## Required Before Certified Submission

- Certify the operator image and each runtime image referenced by `relatedImages`.
- Replace placeholder support contacts and maintainer email with production values.
- Run `operator-sdk bundle validate` and `operator-sdk scorecard` with the target OpenShift versions.
- Run vulnerability scans for all referenced images and attach remediation evidence.
- Run live install, upgrade, uninstall, and rollback smoke tests through OLM.
- Confirm service TLS, proxy, disconnected mirroring, and SCC/Pod Security behavior in a lab cluster.

## Known Gaps

- Go/controller-runtime manager source is scaffolded and statically verified, but local `go test`, `go build`, Operator SDK generation, and live manager execution are not run here because Go and Operator SDK are unavailable locally.
- `opm` is unavailable locally, so FBC rendering is statically verified but not built as an image here.
- Red Hat Partner Connect submission is external to this workspace.
