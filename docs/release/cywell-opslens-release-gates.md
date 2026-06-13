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
- `npm run verify:catalog-toolchain` writes `test-results/cywell-opslens-catalog-toolchain-plan.json`, validates CSV/FBC/CatalogSource/Subscription/scorecard parity, records required CLI and registry.redhat.io auth gaps, and keeps catalog validation/publish commands non-mutating or approval-gated.
- `npm run verify:images` passes and writes `test-results/cywell-opslens-image-build-readiness.json`.
- `npm run verify:images:build` passes on the same Git HEAD before publishing release images; it builds Operator, API, dashboard, and bundle images locally without pushing, and records catalog build as an explicit warning until `registry.redhat.io` credentials are available.
- `npm run verify:owned-image-provenance` passes on the same Git HEAD after `verify:images:build`; it records local Docker image IDs, user, ports, labels, rootfs layer count, and any missing repo digest evidence for Operator, API, dashboard, bundle, and optional catalog without pushing or signing images.
- `npm run verify:external-runtime-plan` passes before release publication and writes `test-results/cywell-opslens-external-runtime-images-plan.json`, keeping vLLM/Qdrant certification, vulnerability scan, SBOM, provenance, mirror digest, approval, risk, and rollback evidence separate from any registry mutation.
- `npm run verify:security-scan-plan` writes `test-results/cywell-opslens-security-scan-plan.json`, records `trivy`/`syft`/`grype`/`cosign`/`docker` readiness, lists required vulnerability scan, SBOM, and security review files for owned and external images, and keeps signing commands approval-gated.
- `npm run evidence:security-scan -- --all` may be used as a plan-only scan/SBOM command packet; `--execute` is allowed only for local evidence file generation with installed `trivy` and `syft`, and still does not sign, push, mirror, or mutate a cluster.
- External runtime evidence templates live under `docs/release/evidence/external-runtime/*.example.json`; they define the required shape for real `vllm.json` and `qdrant.json` evidence but do not satisfy the release gate by themselves.
- `npm run evidence:external-runtime:draft -- --all` may create ignored reviewer intake drafts for vLLM and Qdrant in one pass, and `npm run evidence:external-runtime:draft:digests` may read registry manifests to prefill available source digests, but draft status never satisfies release publication; final reviewed `vllm.json` and `qdrant.json` remain required.
- `npm run evidence:external-runtime:review-packet` writes a JSON plus Markdown packet for release/security reviewers with vLLM/Qdrant source digest state, final evidence gaps, reviewer requests, read-only refresh commands, and approval-gated mirror/sign commands that were not run.
- `npm run evidence:external-runtime:promote -- --name vllm|qdrant --promote-reviewed --reviewer <reviewer> --review-ticket <ticket>` is the only scripted path from draft intake to final external runtime evidence; it is a local review gate and performs no mirroring, signing, pushing, or cluster mutation.
- `npm run verify:release-plan` passes against a clean current worktree, same-HEAD image evidence, same-HEAD owned-image provenance evidence, and same-HEAD external runtime evidence, then writes `test-results/cywell-opslens-release-publish-plan.json` before any image push, sign, mirror, or catalog publication attempt.
- `npm run verify:install-plan` passes against a clean current worktree after same-HEAD MVP, Operator dry-run, Lightspeed readiness, Lightspeed patch preview, and `npm run verify:images:build` evidence, then writes `test-results/cywell-opslens-install-approval-plan.json` with all mutating commands marked `requiresExplicitApproval=true`.
- `npm run verify:release-refresh` may be used before release-manager review to regenerate MVP, runtime/RAG, Lightspeed, catalog toolchain, image/provenance, security scan runner, OCP connectivity, Operator dry-run, release/external-runtime-review/install, checkpoint, roadmap, release bundle, and release action queue evidence in dependency order for the current Git HEAD.
- `npm run verify:release-evidence-bundle` runs after the release, install, live handoff, OCP network handoff, external runtime review packet, checkpoint, roadmap, and catalog toolchain artifacts are refreshed; it writes `test-results/cywell-opslens-release-evidence-bundle.json` as a read-only release-manager packet with source artifacts, missing evidence, approvers, commands, risk, rollback, and mutation boundaries.
- `npm run evidence:release-action-queue` runs after the release evidence bundle and writes JSON plus Markdown owner actions for Network/SRE, Cluster SRE/Admin, Registry, Security, Product, and Release Manager follow-up. It is action-queue-only evidence and does not push, mirror, sign, install, patch, apply, delete, or scale.
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
- Owned and external runtime images have vulnerability scan, SBOM, signature-readiness, and security-review evidence linked through the security scan plan before release-manager review.
- DCO, package ownership, release notes, and public documentation are ready.
- Repository/product URLs point to the release repo, and the `opslens-support@cywell.com` support alias is confirmed as monitored before external publication.

## Certified Operator Gate

- Every image in `relatedImages` has container certification evidence.
- External runtime images record immutable source digests, internal mirror digests, vulnerability scan evidence, SBOM evidence, provenance, license/support review, and explicit security/release approval.
- Security scan plan evidence is refreshed from a clean Git HEAD and all unresolved Critical findings have explicit remediation, acceptance, or image replacement decisions.
- Hosted or local certification pipeline passes.
- Vulnerability scan results have no unresolved Critical findings.
- Support matrix, security controls, known limitations, and rollback procedure are published.
- Partner Connect product listing is approved.
