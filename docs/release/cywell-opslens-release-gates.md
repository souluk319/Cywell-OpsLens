# Cywell OpsLens Release Gates

Status: draft release checklist for internal catalog, Community Operator, and Certified Operator progression.

## Internal Catalog Gate

- `npm run build` passes.
- `npm run test:e2e` passes.
- `npm run verify:operator` passes with no failures.
- `npm run verify:operator:reconcile` passes with no failures.
- `npm run verify:rag` passes with no failures.
- `npm run verify:certification` passes with no failures.
- `npm run verify:lightspeed:fixture` passes with no failures.
- Go/controller-runtime manager skeleton is present and statically checked by `npm run verify:operator`.
- CatalogSource and Subscription manifests use Manual install approval.

## Community Operator Gate

- Bundle metadata, CSV annotations, CRD, examples, and scorecard config are present.
- Go/controller-runtime manager source builds locally with `go test ./...` and `go build` once the Go toolchain is available.
- FBC package/channel/bundle entries point to the intended bundle image.
- DCO, package ownership, release notes, and public documentation are ready.
- All placeholder product URLs and support contacts are replaced.

## Certified Operator Gate

- Every image in `relatedImages` has container certification evidence.
- Hosted or local certification pipeline passes.
- Vulnerability scan results have no unresolved Critical findings.
- Support matrix, security controls, known limitations, and rollback procedure are published.
- Partner Connect product listing is approved.
