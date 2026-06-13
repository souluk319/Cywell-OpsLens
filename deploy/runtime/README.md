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

## vLLM Long-Running Candidate Scan

vLLM runtime images are much larger than the Qdrant runtime image and should be scanned in an approved long-running workstation or CI lane, not in a short interactive shell.

The current review candidate inspected on 2026-06-13 is:

- image: `docker.io/vllm/vllm-openai:v0.23.0-x86_64-ubuntu2404`
- digest: `docker.io/vllm/vllm-openai@sha256:ddcd4ffe817ab0ac1c2e3f9c59330cab3c1b316fc70271d399bdba62cdc1be53`
- observed size class: about 9 GB

Use the immutable digest for evidence collection:

```powershell
npm run evidence:external-runtime:candidate-scan -- --name vllm --candidate-image docker.io/vllm/vllm-openai@sha256:ddcd4ffe817ab0ac1c2e3f9c59330cab3c1b316fc70271d399bdba62cdc1be53 --candidate-label v0.23.0-x86_64-ubuntu2404-sha256-ddcd4ffe --execute-docker-fallback --timeout-ms 7200000
npm run evidence:external-runtime:candidates
npm run evidence:external-runtime:review-packet
npm run evidence:release-action-queue
```

The scan passes the candidate gate only when both vulnerability and SBOM evidence are complete. A timed-out or partial scan must remain `needs-candidate`; it must not be treated as an improving candidate.

## Acceptance For Promotion

A Qdrant candidate can move from review candidate to release proposal only when:

- vulnerability evidence has `criticalFindings=0`
- SBOM evidence is generated and reviewed
- source binary provenance and license/support review are recorded
- internal mirror digest is approved by registry-admin
- security-reviewer, release-manager, and product-owner approvals exist
- release evidence chain is regenerated from a clean current Git HEAD

Until then, the current release manifests remain unchanged.
