# External Runtime Evidence

This directory holds human-approved evidence for runtime images that Cywell OpsLens references but does not build in this repository.

Actual release evidence files are intentionally absent until the evidence is real:

- `vllm.json`
- `qdrant.json`

Use the `.example.json` files as templates only. Do not rename an example file into a real evidence file until each field is backed by a real artifact, ticket, scan, digest, or approval.

## Required Evidence

Each runtime image evidence file must include:

- source image and immutable `sourceDigest`
- internal mirrored image and immutable `mirroredDigest`
- container certification status and link or run id
- vulnerability scan status with `criticalFindings=0`
- SBOM status and artifact path or URL
- provenance status and source/build reference
- license/support review status
- security/release approval status with named approvers

## Verification

Run these commands from a clean worktree and the same Git head:

```sh
npm run verify:images:build
npm run verify:external-runtime-plan
npm run verify:release-plan
npm run verify:evidence-checkpoint
```

The verifier must remain non-mutating. Mirroring, signing, pushing, or changing catalog references stays behind explicit human approval.
