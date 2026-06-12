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
- `npm run verify:lightspeed:fixture` passes with no failures.
- Go/controller-runtime manager source, install resource parity, and explicit OLSConfig patch path are statically checked by `npm run verify:operator` and `npm run verify:operator:runtime`.
- CatalogSource and Subscription manifests use Manual install approval.

## Community Operator Gate

- Bundle metadata, CSV annotations, CRD, examples, and scorecard config are present.
- Go/controller-runtime manager source builds locally with `go test ./...` and `go build` once the Go toolchain is available.
- FBC package/channel/bundle entries point to the intended bundle image.
- DCO, package ownership, release notes, and public documentation are ready.
- Repository/product URLs point to the release repo, and placeholder support contacts are replaced.

## Certified Operator Gate

- Every image in `relatedImages` has container certification evidence.
- Hosted or local certification pipeline passes.
- Vulnerability scan results have no unresolved Critical findings.
- Support matrix, security controls, known limitations, and rollback procedure are published.
- Partner Connect product listing is approved.
