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
