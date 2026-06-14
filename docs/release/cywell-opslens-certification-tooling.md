# Cywell OpsLens Certification Tooling

Status: local tooling handoff for Community/Certified Operator readiness.

## Required Local Tools

Run certification readiness from a workstation or approved build runner with these tools available on `PATH`:

- `oc`: OpenShift client matching the target cluster support window.
- `docker`: local image build and inspect engine for owned image evidence.
- `opm`: file-based catalog validation tool matching the target OLM/OpenShift toolchain.
- `operator-sdk`: bundle validation and scorecard tool matching the target Operator SDK release.
- `podman`: optional alternative runtime for registry authentication and image inspection where company policy prefers it.

Tool versions must be recorded in `test-results/cywell-opslens-certification-readiness.json` and `test-results/cywell-opslens-catalog-toolchain-plan.json`.

## Read-Only Validation Commands

These commands collect local evidence only:

```powershell
oc version --client
docker --version
opm version
operator-sdk version
opm validate deploy/catalog/fbc
operator-sdk bundle validate ./deploy/operator/bundle --select-optional suite=operatorframework
operator-sdk scorecard ./deploy/operator/bundle
npm run verify:certification
npm run verify:catalog-toolchain
```

The commands above must not publish catalog images, push images, mirror external runtime images, sign images, or mutate a cluster.

## Execution Lanes

Certification tooling readiness can be completed through one of these lanes:

- `local-workstation`: release-manager runs the read-only validation commands from an approved workstation with `oc`, `docker`, `opm`, and `operator-sdk` on `PATH`.
- `approved-ci-image`: release-manager provides an approved CI image or runner digest that contains the required tooling, then exports the same current-head evidence artifacts.
- `hosted-certification-pipeline`: release-manager submits externally only after local or CI readiness reaches `READY_FOR_REVIEW` and security, SBOM, provenance, external runtime, and release evidence are approved.

The hosted lane is approval-gated and may mutate an external portal or listing workflow. It is listed as a handoff only; local verifiers must never run it.

## Approved CI Runner Evidence

When `opm` or `operator-sdk` cannot be installed on the local workstation, the release-manager may satisfy the tooling lane with a reviewed CI runner artifact instead of local binaries.

Use the draft helper first. It writes only an ignored draft packet and never creates final readiness evidence:

```powershell
npm run evidence:certification:ci-runner-draft -- --force
```

The draft is written to `docs/release/evidence/certification/approved-ci-runner.draft.json`. It collects current Git head, available local tool versions, current certification/catalog evidence paths, missing fields, reviewer requests, risk, and rollback guidance. Draft files do not satisfy certification readiness.

Use `docs/release/evidence/certification/approved-ci-runner.example.json` as the final reviewed shape, then create `docs/release/evidence/certification/approved-ci-runner.json` only after the values are real:

- current Git `headSha`
- approved runner or CI image digest pinned by `sha256`
- approver, approval ticket, and approval timestamp
- `oc`, `docker`, `opm`, and `operator-sdk` versions captured from the runner
- artifact or log references for `opm validate`, `operator-sdk bundle validate`, and `operator-sdk scorecard`
- `mutation: false`

Validate it with:

```powershell
npm run verify:certification -- --ci-runner-evidence docs/release/evidence/certification/approved-ci-runner.json
npm run verify:catalog-toolchain
```

Missing, placeholder, stale-head, or mutating CI runner evidence remains `needs-evidence` and does not approve Community/Certified Operator readiness.

The draft helper must not install tooling, pull runner images, log in to registries, create Partner Connect submissions, create `approved-ci-runner.json`, or mutate a cluster.

## Freshness and Owner Handoff

Certification evidence is fresh only when it is generated on the current Git HEAD from a clean worktree before Community or Certified Operator submission.

Rerun the certification and catalog toolchain verifiers after any tooling change, bundle or catalog manifest change, release image digest change, or external runtime evidence change.

The `release-manager` owns tooling setup and lane selection. The `security-reviewer` must approve any credentialed download, registry login, Partner Connect workflow, or externally downloaded binary before it is used for submission evidence.

## Human Setup Boundary

Installing or updating `opm`, `operator-sdk`, Docker/Podman, registry credentials, or Red Hat Partner Connect tooling is a human setup task owned by `release-manager` with `security-reviewer` approval when credentials or externally downloaded binaries are involved.

The verifier may report missing tooling and setup commands, but it must not install binaries, write credentials, log in to registries, or submit artifacts to external portals.

## Approval-Gated Commands Not Run

The following operations require a separate release change ticket and are never run by `npm run verify:certification` or `npm run verify:catalog-toolchain`:

- `docker push`, `podman push`, or `skopeo copy` to a release registry
- `opm render`, `opm generate`, or `opm serve` against a publish target
- `operator-sdk run bundle`, `operator-sdk run bundle-upgrade`, or any live cluster install
- Partner Connect or OperatorHub submission
- any `oc apply`, `oc patch`, `oc delete`, `oc scale`, or InstallPlan approval command

## Evidence Refresh

After tooling is installed through an approved path, rerun:

```powershell
npm run verify:certification
npm run verify:catalog-toolchain
npm run verify:release-refresh -- --live-timeout-ms 30000
```

The expected first improvement is that certification readiness moves from `NEEDS_TOOLING` toward `READY_FOR_REVIEW`; release publication and install approval still remain blocked until external runtime evidence, security evidence, registry digest/signature/SBOM evidence, and live OCP/Lightspeed evidence are complete.
