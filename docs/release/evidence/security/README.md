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
- Security review evidence must use `opslens.security-review.v0.1`, match the image name, include reviewer, reviewed timestamp, ticket, scan/SBOM paths, `decision`, and `criticalFindings`.
- Release approval must confirm unresolved Critical findings are zero before any external publication.
- Signature and registry attachment commands remain approval-gated; local evidence generation does not sign, push, mirror, or mutate a cluster.

## Draft Helper

Use the draft helper after local scan and SBOM files exist. It writes ignored `*.draft.json` review packets and never creates final release evidence:

```bash
npm run evidence:security-review:draft -- --name operator --reviewer <security-reviewer> --ticket <change-ticket> --force
```

A human reviewer must still create the final `operator-security-review.json`, `api-security-review.json`, or matching image-specific final file after validating the scan/SBOM inputs.

## Docker Fallback Runner

When local `trivy` and `syft` CLIs are not installed but Docker is available, generate owned-image scan/SBOM evidence with scanner containers:

```bash
npm run evidence:security-scan:docker
```

The runner pulls the configured scanner images, resolves immutable RepoDigests before execution, mounts the local Docker socket for local image scans, writes ignored local/CI vulnerability/SBOM files, and creates ignored `*.draft.json` review packets. It does not sign, push, mirror, apply, delete, scale, or create final human-approved security review evidence.

`npm run verify:security-scan-plan` consumes the same-HEAD runner artifact when it is clean, `EVIDENCE_WRITTEN`, and backed by digest-resolved scanner images. That lets Docker fallback evidence satisfy owned-image scan/SBOM generation while keeping final security review and signing approval as explicit gaps.

To include that Docker fallback lane inside the same release evidence refresh:

```bash
npm run verify:release-refresh -- --security-scan-docker
```

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
- `qdrant-security-review.json`
- `security-review.example.json`

Generated raw scanner outputs and reviewer drafts may be kept outside source control until reviewed because they are large release/CI artifacts. Final human-reviewed `*-security-review.json` evidence should be linked from `test-results/cywell-opslens-security-scan-plan.json` and the release evidence bundle.
