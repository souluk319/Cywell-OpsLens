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

## Reviewer Roles

Use these owners when collecting final evidence:

- `registry-admin`: resolves immutable `sourceDigest`, records approved `mirroredImage` and `mirroredDigest`, and confirms the mirror registry is approved for disconnected install evidence.
- `security-reviewer`: attaches container certification, vulnerability scan, SBOM, and security review evidence; unresolved Critical findings block promotion.
- `release-manager`: records provenance, final release approval, change ticket, and confirms same-HEAD `verify:release-plan`, `verify:evidence-checkpoint`, and `verify:release-evidence-bundle` evidence.
- `product-owner`: approves license/support boundary and confirms the external runtime remains within the supported product position.

## Evidence State Machine

External runtime evidence moves through these states only:

1. `example-only`: `vllm.example.json` and `qdrant.example.json` describe the required shape but do not satisfy release readiness.
2. `draft-needs-evidence`: ignored `*.draft.json` files collect reviewer input, source digest inspection, and missing evidence without promotion.
3. `draft-review-ready`: draft files have all required fields but still need a named reviewer and ticket before final promotion.
4. `reviewed-final`: `vllm.json` or `qdrant.json` exists, contains no placeholders, lists approvers, and has passed `evidence:external-runtime:promote`.

Only `reviewed-final` evidence can satisfy release readiness. Drafts and review packets remain intake artifacts.

## Approval-Gated Commands

The following command classes must never run from `verify:external-runtime-plan`, `evidence:external-runtime:draft:*`, or `evidence:external-runtime:review-packet`:

- `oc image mirror`
- `cosign sign`
- image push/copy to the release registry
- catalog or CSV reference changes for mirrored digests
- cluster install, patch, apply, delete, or scale

When approval exists, run mutating registry work from a separate change ticket, then record the immutable result back into draft/final evidence and rerun the read-only verifier chain.

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
npm run evidence:external-runtime:draft:digests
npm run evidence:external-runtime:draft -- --name vllm --source-digest quay.io/cywell/opslens-vllm@sha256:<digest> --mirrored-image <internal-registry>/cywell/opslens-vllm:0.1.0 --mirrored-digest <internal-registry>/cywell/opslens-vllm@sha256:<digest> --ticket <change-ticket> --force
npm run evidence:external-runtime:draft -- --name qdrant --source-digest docker.io/qdrant/qdrant@sha256:<digest> --mirrored-image <internal-registry>/cywell/qdrant:v1.12.1 --mirrored-digest <internal-registry>/cywell/qdrant@sha256:<digest> --ticket <change-ticket> --force
```

For bulk intake, pass image-specific overrides such as `--vllm-source-digest`, `--vllm-mirrored-digest`, `--qdrant-source-digest`, and `--qdrant-mirrored-digest`. The helper rejects secret-like values, writes only `*.draft.json`, records branch/head/base/dirty state, and keeps `registryMutationAttempted=false` and `clusterMutationAttempted=false`. `--collect-source-digests` and `evidence:external-runtime:draft:digests` only inspect registry manifests; they do not pull, push, mirror, sign, or promote images.

The draft helper also reads generated security evidence from `docs/release/evidence/security` by default. If `<name>-vulnerability.json` exists, Trivy severity counts are copied into the draft. Critical findings set vulnerability status to `needs-remediation`, so the draft remains blocked until the image is replaced, patched, or explicitly reviewed with `criticalFindings=0`. If `<name>-sbom.spdx.json` exists, SPDX package/file counts are copied into the draft with status `generated`; this is intake evidence only, not final approval. Use `--security-evidence-dir <dir>` when CI stores raw scan/SBOM artifacts elsewhere.

A human reviewer must still create the final `vllm.json` or `qdrant.json` after validating the referenced digest, scan, SBOM, provenance, license, and approval evidence.

## Review Packet

Generate a reviewer-ready JSON and Markdown packet after draft intake:

```sh
npm run evidence:external-runtime:review-packet
```

The packet writes `test-results/cywell-opslens-external-runtime-review-packet.json` and `.md`. It consolidates vLLM/Qdrant draft status, source digest inspection, final evidence file presence, security scan/SBOM plan state, reviewer requests, missing evidence, read-only refresh commands, and approval-gated mirror/sign commands that were not run. It remains local evidence only and does not replace final reviewed `vllm.json` or `qdrant.json`.

## Reviewed Promotion

After the referenced artifacts are complete and reviewed, use the promotion helper instead of renaming a draft by hand:

```sh
npm run evidence:external-runtime:promote -- --name vllm --promote-reviewed --reviewer <reviewer> --review-ticket <change-ticket> --force
npm run evidence:external-runtime:promote -- --name qdrant --promote-reviewed --reviewer <reviewer> --review-ticket <change-ticket> --force
```

Promotion refuses incomplete drafts, placeholder digests, unresolved critical findings, missing approvers, missing reviewer identity, output paths ending in `.draft.json`, and any registry or cluster mutation flags. It writes a promotion review report under `test-results/` and, only after all checks pass, writes the final reviewed evidence file.
