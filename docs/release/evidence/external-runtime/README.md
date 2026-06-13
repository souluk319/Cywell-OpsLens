# External Runtime Evidence

This directory holds human-approved evidence for runtime images that Cywell OpsLens references but does not build in this repository.

Actual release evidence files are intentionally absent until the evidence is real:

- `vllm.json`
- `qdrant.json`

Use the `.example.json` files as templates only. Do not rename an example file into a real evidence file until each field is backed by a real artifact, ticket, scan, digest, or approval.

Draft intake files may be generated while evidence is being collected:

- `vllm.draft.json`
- `qdrant.draft.json`

Draft files are ignored by git and are not release evidence. They are review packets only. The verifier may surface their status, but release readiness still requires the final reviewed `vllm.json` and `qdrant.json` files.

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

## Draft Intake

Use the draft helper to collect reviewer inputs without promoting them to final evidence:

```sh
npm run evidence:external-runtime:draft -- --all --force
npm run evidence:external-runtime:draft -- --name vllm --source-digest quay.io/cywell/opslens-vllm@sha256:<digest> --mirrored-image <internal-registry>/cywell/opslens-vllm:0.1.0 --mirrored-digest <internal-registry>/cywell/opslens-vllm@sha256:<digest> --ticket <change-ticket> --force
npm run evidence:external-runtime:draft -- --name qdrant --source-digest docker.io/qdrant/qdrant@sha256:<digest> --mirrored-image <internal-registry>/cywell/qdrant:v1.12.1 --mirrored-digest <internal-registry>/cywell/qdrant@sha256:<digest> --ticket <change-ticket> --force
```

For bulk intake, pass image-specific overrides such as `--vllm-source-digest`, `--vllm-mirrored-digest`, `--qdrant-source-digest`, and `--qdrant-mirrored-digest`. The helper rejects secret-like values, writes only `*.draft.json`, records branch/head/base/dirty state, and keeps `registryMutationAttempted=false` and `clusterMutationAttempted=false`. A human reviewer must still create the final `vllm.json` or `qdrant.json` after validating the referenced digest, scan, SBOM, provenance, license, and approval evidence.
