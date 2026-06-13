# Cywell OpsLens Certification Readiness

Status: draft evidence pack for Red Hat OpenShift certification and internal security review.

## Scope

Cywell OpsLens packages the API, private RAG/vector store, dashboard, model runtime, ConsolePlugin, and explicit OpenShift Lightspeed MCP registration as an Operator-managed product.

## Current Certification Position

- The bundle is not certified yet and keeps `certified: "false"` until Red Hat certification is passed.
- The package name is `cywell-opslens`.
- The supported OpenShift range declared for readiness is `v4.16-v4.19`.
- Manual install plan approval is required for catalog installs.
- The CSV maintainer contact is `opslens-support@cywell.com`; alias ownership must be confirmed before Certified Operator submission.
- OpenShift Lightspeed MCP remains a Technology Preview integration path, so the product support center stays on Operator, Console Plugin, and Cywell-controlled RAG.

## Security Controls

| Area | Control | Evidence |
|---|---|---|
| RBAC | Operator RBAC is scoped to OpsLens resources, install resources, ConsolePlugin, and OLSConfig patching, and does not grant raw Secret read access in MVP 0.1. | `deploy/operator/config/rbac/cluster_role.yaml`, `npm run verify:operator` |
| Mutation boundary | Assistant responses stay read-only or plan-only; only the Operator can patch installation resources when the CR explicitly requests it. | `packages/operator-controller/src/reconcile.ts` |
| Lightspeed registration | `ValidateOnly` never mutates; `PatchOLSConfig` preserves existing MCP servers, emits rollback evidence, and the Go source patches OLSConfig only through explicit mode. | `npm run verify:operator:reconcile`, `npm run verify:operator:runtime` |
| RAG install policy | `OpsLensInstallation.spec.rag` exposes validate-only document intake and design-only approval queue; rendered API env and ConfigMap keep raw return and enqueue disabled. | `npm run verify:operator`, `npm run verify:operator:reconcile` |
| Operator manager source | Go/controller-runtime source wires `OpsLensInstallation`, health checks, status update, install resources, RAG policy rendering, and the explicit OLSConfig patch path for `PatchOLSConfig`. | `deploy/operator/controller-runtime/**`, `npm run verify:operator`, `npm run verify:operator:runtime` |
| Network boundaries | API/dashboard pods ship ingress NetworkPolicies that allow the Console plugin backend/proxy and Lightspeed MCP namespaces on the HTTPS runtime port without broad inbound exposure. | `deploy/operator/config/apps/opslens-stack.yaml`, `npm run verify:operator`, `npm run verify:operator:runtime` |
| Live preflight | Operator manifests can be submitted to the live OpenShift API through server-side dry-run only, with sanitized evidence and `clusterMutationAttempted=false`. | `npm run verify:operator:dry-run`, `test-results/cywell-opslens-operator-dry-run.json` |
| Install approval | Live OLM install and OLSConfig mutation are blocked behind an explicit approval plan that separates preflight, mutating commands, post-install verification, risk, rollback, missing evidence, and required approvers. | `npm run verify:install-plan`, `test-results/cywell-opslens-install-approval-plan.json` |
| Customer data | RAG inventory returns metadata only, snippets are redacted, raw documents are not returned. | `GET /api/opslens/admin/overview` |
| RAG isolation | Local vector index is tenant-scoped and blocks unknown tenant retrieval. | `npm run verify:rag` |
| RAG evidence export | Validation evidence artifacts return redacted previews and design-only approval intent without raw Markdown, queue mutation, or vector writes. | `POST /api/opslens/admin/rag/evidence-export`, `npm run verify:rag` |
| Secrets | Raw Kubernetes Secret fetch remains blocked in API discovery, and Operator RBAC does not grant `secrets get/list/watch`. | `AC-OCP-001`, `npm run verify:operator` |
| Disconnected | CSV and FBC include `relatedImages` for all runtime images. | `deploy/operator/bundle/manifests/*.yaml`, `deploy/catalog/fbc/catalog.yaml` |
| Catalog toolchain | Catalog readiness records local CLI availability, registry.redhat.io auth presence, CSV/FBC/CatalogSource/Subscription/scorecard parity, and separates read-only validation from setup and approval-gated publish commands. | `npm run verify:catalog-toolchain`, `test-results/cywell-opslens-catalog-toolchain-plan.json` |
| Image build contracts | Operator, API, dashboard, bundle, and catalog images have explicit Dockerfile/build-context readiness checks and optional local Docker build evidence; catalog build records a registry-auth warning until Red Hat registry credentials are available; external runtime images remain marked for certification evidence. | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `deploy/operator/controller-runtime/Dockerfile`, `deploy/operator/controller-runtime/go.sum`, `npm run verify:images`, `npm run verify:images:build` |
| Owned image provenance | Cywell-owned Operator, API, dashboard, and bundle images have local Docker inspect evidence chained to same-HEAD actual build evidence before any push/sign/mirror approval. Catalog provenance is warning-only until authenticated Red Hat registry access is available. | `npm run verify:owned-image-provenance`, `test-results/cywell-opslens-owned-image-provenance.json` |
| External runtime evidence | vLLM and Qdrant runtime images have a no-mutation approval plan that separates certification, vulnerability scan, SBOM, provenance, license/support review, mirror digest, required approvals, risk, rollback, and approved registry mutations. | `npm run verify:external-runtime-plan`, `test-results/cywell-opslens-external-runtime-images-plan.json` |
| Security scan/SBOM plan | Owned and external images have a no-mutation plan for vulnerability scan evidence, SPDX SBOM evidence, security review decisions, local scan tooling, approval-gated signing, risk, and rollback. | `npm run verify:security-scan-plan`, `test-results/cywell-opslens-security-scan-plan.json`, `docs/release/evidence/security/**` |
| Release publish approval | Image push, signing, external runtime mirroring, and catalog publication are represented as an approval plan only; the verifier requires same-HEAD image build evidence and does not mutate registries or clusters. | `npm run verify:release-plan`, `test-results/cywell-opslens-release-publish-plan.json` |
| Release evidence bundle | Release, install, live handoff, roadmap, checkpoint, image, provenance, and external runtime evidence are collected into a single read-only packet for release-manager review without approving publication. | `npm run verify:release-evidence-bundle`, `test-results/cywell-opslens-release-evidence-bundle.json` |
| Proxy/TLS | ConsolePlugin backend/proxy uses the live OpenShift schema, service-ca serving certificates, HTTPS service ports, TLS secret mounts, dynamic plugin assets, ingress NetworkPolicies, and UserToken proxy authorization. | `deploy/operator/config/apps/opslens-stack.yaml`, `apps/web/dist/plugin-manifest.json`, `npm run verify:operator`, `npm run verify:operator:runtime`, `npm run verify:console-plugin` |
| FIPS | FIPS is currently declared unsupported until image/runtime validation proves compliance. | `features.operators.openshift.io/fips-compliant: "false"` |

## Required Before Certified Submission

- Certify the operator image and each runtime image referenced by `relatedImages`.
- Confirm `opslens-support@cywell.com` is monitored by Cywell support and accepted for external Operator publication.
- Run `npm run verify:catalog-toolchain` on a clean Git HEAD and clear required `opm`, `operator-sdk`, and registry.redhat.io auth gaps before catalog image build/release review.
- Run `npm run verify:security-scan-plan` on a clean Git HEAD, clear required `trivy`, `syft`, and `cosign` gaps, and attach reviewed vulnerability scan, SBOM, and security review evidence for every required image before release-manager review.
- Run `operator-sdk bundle validate` and `operator-sdk scorecard` with the target OpenShift versions.
- Run vulnerability scans for all referenced images and attach remediation evidence.
- Generate same-HEAD owned image provenance, then collect external runtime source digest, mirror digest, SBOM, provenance, license/support review, security approval, and release approval evidence before any image mirror/sign step. Use `npm run evidence:external-runtime:draft -- --name vllm|qdrant` only for ignored reviewer draft intake; final readiness still requires reviewed `docs/release/evidence/external-runtime/vllm.json` and `qdrant.json`.
- Build and push signed Operator, API, dashboard, bundle, catalog, and model runtime images to the release registry.
- Generate the release publish plan and collect release-manager, registry-admin, security, and product-owner approval before pushing, signing, or mirroring images.
- Run server-side dry-run preflight against the target lab cluster before any mutating install attempt.
- Generate the install approval plan and collect cluster-admin, SRE, security, and product-owner approval before running any mutating command.
- Run live install, upgrade, uninstall, and rollback smoke tests through OLM.
- Confirm service TLS, UserToken proxy behavior, disconnected mirroring, and SCC/Pod Security behavior in a lab cluster.

## Known Gaps

- Go/controller-runtime manager source is scaffolded with an explicit OLSConfig patch path and statically verified; local `go test`, Operator SDK generation, and live manager execution are not run here because Go and Operator SDK are unavailable locally. Container image build evidence verifies the manager compiles.
- `opm` and `operator-sdk` are unavailable locally, so FBC rendering, bundle validation, and scorecard execution are statically planned but not executed here.
- Red Hat Partner Connect submission is external to this workspace.
