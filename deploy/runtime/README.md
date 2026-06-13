# Cywell OpsLens Runtime Candidates

This directory contains local runtime-image candidates used to reduce external runtime risk before release review.

## Qdrant Runtime-Only Candidate

`qdrant-minimal.Dockerfile` builds a local, non-published Qdrant candidate image:

- source binary: `docker.io/qdrant/qdrant:v1.18.2-unprivileged`
- base: `registry.access.redhat.com/ubi9/ubi-minimal:9.8`
- runtime mode: API-only vector store for OpsLens
- intentionally omitted: Qdrant static Web UI assets
- local tag used by evidence scripts: `cywell/opslens-qdrant:candidate`

The image is a security-review candidate, not final release evidence. It must not replace CSV, FBC, CRD, sample, or fixture image references until product, security, registry, and release owners approve the final external-runtime evidence.

## Local Evidence Commands

```powershell
docker build -f deploy/runtime/qdrant-minimal.Dockerfile -t cywell/opslens-qdrant:candidate .
npm run evidence:external-runtime:candidate-scan -- --name qdrant --candidate-image cywell/opslens-qdrant:candidate --candidate-label cywell-minimal-ubi9 --execute-docker-fallback
npm run evidence:external-runtime:candidates
npm run evidence:external-runtime:review-packet
```

These commands write local evidence only. They do not push, mirror, sign, promote, install, patch, apply, delete, or scale anything.

## Acceptance For Promotion

A Qdrant candidate can move from review candidate to release proposal only when:

- vulnerability evidence has `criticalFindings=0`
- SBOM evidence is generated and reviewed
- source binary provenance and license/support review are recorded
- internal mirror digest is approved by registry-admin
- security-reviewer, release-manager, and product-owner approvals exist
- release evidence chain is regenerated from a clean current Git HEAD

Until then, the current release manifests remain unchanged.
