# Cywell OpsLens Release Gates

Status: draft release checklist for internal catalog, Community Operator, and Certified Operator progression.

## Internal Catalog Gate

- `npm run verify:mvp` passes and writes `test-results/cywell-opslens-mvp-0.1-gate.json`.
- `npm run build` passes.
- `npm run test:e2e` passes.
- `npm run verify:operator` passes with no failures.
- `npm run verify:operator:reconcile` passes with no failures.
- `npm run verify:operator:runtime` passes with no failures.
- `npm run verify:rag` passes with no failures.
- `npm run verify:certification` passes with no failures.
- `npm run verify:images` passes and writes `test-results/cywell-opslens-image-build-readiness.json`.
- `npm run verify:images:build` passes on the same Git HEAD before publishing release images; it builds Operator, API, dashboard, and bundle images locally without pushing, and records catalog build as an explicit warning until `registry.redhat.io` credentials are available.
- `npm run verify:owned-image-provenance` passes on the same Git HEAD after `verify:images:build`; it records local Docker image IDs, user, ports, labels, rootfs layer count, and any missing repo digest evidence for Operator, API, dashboard, bundle, and optional catalog without pushing or signing images.
- `npm run verify:external-runtime-plan` passes before release publication and writes `test-results/cywell-opslens-external-runtime-images-plan.json`, keeping vLLM/Qdrant certification, vulnerability scan, SBOM, provenance, mirror digest, approval, risk, and rollback evidence separate from any registry mutation.
- External runtime evidence templates live under `docs/release/evidence/external-runtime/*.example.json`; they define the required shape for real `vllm.json` and `qdrant.json` evidence but do not satisfy the release gate by themselves.
- `npm run verify:release-plan` passes against a clean current worktree, same-HEAD image evidence, same-HEAD owned-image provenance evidence, and same-HEAD external runtime evidence, then writes `test-results/cywell-opslens-release-publish-plan.json` before any image push, sign, mirror, or catalog publication attempt.
- `npm run verify:install-plan` passes against a clean current worktree after same-HEAD MVP, Operator dry-run, Lightspeed readiness, Lightspeed patch preview, and `npm run verify:images:build` evidence, then writes `test-results/cywell-opslens-install-approval-plan.json` with all mutating commands marked `requiresExplicitApproval=true`.
- `npm run verify:lightspeed:fixture` passes with no failures.
- Go/controller-runtime manager source, install resource parity, and explicit OLSConfig patch path are statically checked by `npm run verify:operator` and `npm run verify:operator:runtime`.
- CatalogSource and Subscription manifests use Manual install approval.

## Community Operator Gate

- Bundle metadata, CSV annotations, CRD, examples, and scorecard config are present.
- Go/controller-runtime manager source builds locally with `go test ./...` and `go build` once the Go toolchain is available.
- FBC package/channel/bundle entries point to the intended bundle image.
- Operator, API, dashboard, bundle, and catalog Dockerfiles match CSV `relatedImages`, declared build contexts, local Docker build evidence, local owned-image provenance evidence, and any credential-gated catalog gap is recorded before release.
- External vLLM and Qdrant runtime images have a no-mutation certification/mirroring approval plan before release publication.
- vLLM and Qdrant real evidence files are created only after source digest, mirror digest, scan, SBOM, provenance, license/support, and approval artifacts exist.
- DCO, package ownership, release notes, and public documentation are ready.
- Repository/product URLs point to the release repo, and placeholder support contacts are replaced.

## Certified Operator Gate

- Every image in `relatedImages` has container certification evidence.
- External runtime images record immutable source digests, internal mirror digests, vulnerability scan evidence, SBOM evidence, provenance, license/support review, and explicit security/release approval.
- Hosted or local certification pipeline passes.
- Vulnerability scan results have no unresolved Critical findings.
- Support matrix, security controls, known limitations, and rollback procedure are published.
- Partner Connect product listing is approved.
