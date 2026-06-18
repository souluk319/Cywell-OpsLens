# Dev 0.1.1 CRC Install Ledger

| Field | Value |
| --- | --- |
| Lane | CRC catalog and Operator install |
| Reference target | MacBook CRC OpenShift 4.21.14 |
| Status | Partial live proof |

## Goal

Prove that Cywell OpsLens can be delivered through a local CRC catalog and installed by OpenShift Operator Lifecycle Manager.

## Completed

- CRC cluster was confirmed running and healthy enough for local install work.
- OpenShift internal registry route and auth were made usable from the MacBook Docker client.
- Cywell images were loaded into the MacBook Docker engine.
- CRC image push succeeded after trusting the CRC router CA and correcting registry access.
- CatalogSource `cywell-opslens-catalog` became visible and healthy in `openshift-marketplace`.
- Package manifest `cywell-opslens` appeared in the OpenShift catalog.
- Catalog card icon and install-mode metadata were corrected after stale package cache/catalog issues.
- Arm64 image mismatch was identified and corrected for the MacBook CRC node architecture.
- Stale `verify` tag reuse caused repeated old bundle resolution; this was diagnosed as tag/catalog staleness.
- Unique CRC dev tag flow was introduced to prevent old bundle reuse.
- Operator install reached successful user-facing install state after catalog/tag refresh.
- `OpsLensInstallation` CRD was present.
- `OpsLensInstallation` object could be created.
- Operator reconciliation reached `Ready` after ownerReference/finalizer retry and resource creation.
- API and dashboard pods reached Running.
- PostgreSQL vector pod reached Running after local CRC SCC workaround.

## Partial Or Blocked

- vLLM remained `ImagePullBackOff` because the external model runtime image/runtime path was not yet available for this CRC demo lane.
- PostgreSQL anyuid/SCC workaround worked for CRC but must be productized or replaced with an OpenShift-compatible container/securityContext.
- Local secret creation was used for CRC development and must not be treated as a production secret flow.

## Evidence To Preserve

- CatalogSource visible and Running.
- PackageManifest visible with current CSV.
- Operator pod running in the expected namespace.
- `OpsLensInstallation` exists and reports the expected version.
- API/dashboard/vector pods running.

## Lesson Locked

Never reuse a stale mutable tag as proof that a new catalog bundle is active. The package manifest must show the expected CSV and related images before attempting a new install.

