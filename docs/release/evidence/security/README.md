# Cywell OpsLens Security Evidence

This directory holds human-reviewed vulnerability scan, SBOM, signature, and provenance evidence for images referenced by the Cywell OpsLens release packet.

## Required Image Set

- `operator`: Cywell-owned Operator manager image
- `api`: Cywell OpsLens API image
- `dashboard`: Cywell OpsLens dashboard image
- `bundle`: Operator bundle image
- `catalog`: internal catalog image when registry.redhat.io access is available
- `vllm`: externally built model runtime image
- `qdrant`: external vector store image

## Evidence Rules

- Vulnerability scans must record scanner name, scanner version, image reference, immutable digest when available, critical findings, high findings, report path, reviewer, and review timestamp.
- SBOM evidence must record generator name, generator version, output format, image reference, immutable digest when available, artifact path, reviewer, and review timestamp.
- Release approval must confirm unresolved Critical findings are zero before any external publication.
- Signature and registry attachment commands remain approval-gated; local evidence generation does not sign, push, mirror, or mutate a cluster.

## Suggested Artifact Names

- `operator-vulnerability.json`
- `operator-sbom.spdx.json`
- `api-vulnerability.json`
- `api-sbom.spdx.json`
- `dashboard-vulnerability.json`
- `dashboard-sbom.spdx.json`
- `bundle-vulnerability.json`
- `bundle-sbom.spdx.json`
- `vllm-vulnerability.json`
- `vllm-sbom.spdx.json`
- `qdrant-vulnerability.json`
- `qdrant-sbom.spdx.json`

Generated reviewer drafts may be kept outside source control until reviewed. Final release evidence should be linked from `test-results/cywell-opslens-security-scan-plan.json` and the release evidence bundle.
