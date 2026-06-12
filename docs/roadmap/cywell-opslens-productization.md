# Cywell OpsLens Productization Roadmap

Source plan: `kugnus-idea/CywellOpsLens_plan.md`

## Current Product Decision

Cywell OpsLens uses OpenShift Lightspeed as the first user-facing validation channel, but the productization center of gravity is Operator + Console Dynamic Plugin + private RAG service.

The Stage 1 integration point is a custom MCP server registered through `OLSConfig.spec.mcpServers`, not an undocumented REST webhook. The REST endpoint remains useful for local smoke tests and partner demos, while `/mcp` is the Lightspeed-facing contract.

## Evidence From Official Platform Docs

- OpenShift Lightspeed 1.0 documents custom MCP servers through `spec.featureGates: [MCPServer]` and `spec.mcpServers`.
- The same documentation marks the MCP server feature as Technology Preview and not recommended for production SLA use.
- OLSConfig headers support `secret`, `kubernetes` user bearer token forwarding, and `client`.
- OpenShift MCP guidance recommends HITL controls for write operations and notes that privacy/redaction controls must be designed carefully.

Primary references:

- https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/configure/ols-configuring-openshift-lightspeed
- https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/configure/olsconfig-api
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html-single/ai_applications/

## Stage Gates

| Stage | Goal | Repo Contract | Completion Gate |
|---|---|---|---|
| 1. Lightspeed MCP validation | Route internal/custom questions from Lightspeed to Cywell OpsLens | `/mcp`, `/api/opslens/tools`, `/api/opslens/ask`, `/api/opslens/runtime/readiness`, `apps/api/src/runtimeRag.ts`, `packages/rag`, `deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml` | AC-LS-001 and AC-RAG-001 pass; `npm run verify:lightspeed:routing` proves at least 8 of 10 representative Lightspeed questions select the expected read-only tool and return safe structured responses; runtime readiness contract proves Qdrant/vLLM endpoint wiring; runtime RAG contract proves default local fallback and opt-in Qdrant/vLLM retrieval; a live OLSConfig smoke test proves `tools/list` + `tools/call` |
| 2. AI Ops pipeline | Combine alerts with logs, metrics, events, and plan-only remediation proposals | `/api/opslens/incidents/analyze`, OCP read-only APIs, private RAG citations, `propose_remediation` plan-only tool | Alert-driven prompt includes last 10 minutes of logs/events/Prometheus metrics without mutation |
| 3. Dedicated dashboard | Provide monitoring, token usage, validate-only RAG document management, evidence export, and plugin links | `/api/opslens/admin/overview`, `/api/opslens/admin/rag/validate`, `/api/opslens/admin/rag/evidence-export`, OpsLens Admin Dashboard, future ConsolePlugin route | Dashboard surfaces RAG health, validate-only draft checks, audit-safe evidence export, token usage, GPU/runtime samples, incident metric status, and install readiness |
| 4. Operator packaging | Install API, vector DB, dashboard, RAG safety policy, Console/Lightspeed ingress policy, and MCP registration as one product | `deploy/operator/config/**`, `deploy/operator/bundle/**`, `deploy/operator/controller-runtime/**`, `packages/operator-controller`, `OpsLensInstallation.spec.rag`, `cywell-opslens-rag-policy`, ingress NetworkPolicies, CSV, static package verifier, live server-side dry-run preflight, install approval plan, OLSConfig reconciliation core | Static package, Go source parity, reconcile verifiers, non-mutating live dry-run, and install approval plan pass first; human-approved live install/upgrade/uninstall smoke follows |
| 5. Certification/GTM | Prepare Red Hat catalog and B2B packaging | `deploy/catalog/**`, scorecard config, certification annotations, security/support/release docs, readiness verifier, external runtime certification/mirroring plan, release publish approval plan | Static catalog/certification readiness, no-mirror external runtime plan, and no-push release publish plan pass first; Red Hat hosted/local certification pipeline and Partner Connect submission follow |

## Stage 1 MVP Lock

### In Scope

- Read-only MCP tool catalog for Lightspeed.
- Private customer RAG answer contract backed by tenant-scoped local vector index over Markdown runbooks with redacted snippets and citations.
- Opt-in runtime RAG adapter contract: default `local` mode, explicit `hybrid`/`runtime` modes for vLLM embeddings plus Qdrant redacted snippet search, and local fallback with visible missing evidence.
- REST smoke endpoint for local validation.
- OLSConfig template for registering Cywell OpsLens as a custom MCP server.
- Audit envelope with tenant, cluster, namespace, model route, redaction count, and sources.

### Out Of Scope

- Production vLLM/vector DB live readiness; the read-only endpoint contract is present, but live probes require reachable runtime services.
- Automatic apply/delete/scale.
- Raw customer document return through MCP.
- Red Hat certified Operator packaging.
- Automatic mutation of an installed customer Lightspeed config by an Operator.

### Pass/Fail

| Requirement | Pass Evidence |
|---|---|
| Lightspeed can discover Cywell tools | `/mcp` JSON-RPC `tools/list` returns `generate_playbook` with read-only annotations |
| Custom question can route to Cywell | `/mcp` JSON-RPC `tools/call` returns structured content with customer-runbook citations; `npm run verify:lightspeed:routing` passes the 10-question / 8-pass routing fixture |
| Sensitive content is controlled | Response has `rawDocumentReturned=false`, `serverSideRedaction=true`, and redacted prompt text |
| Mutation is blocked | Tool catalog excludes `apply_remediation`, response has `mutationAllowed=false` |
| Install path is visible | OLSConfig template exists under `deploy/lightspeed/` |
| Local private RAG path works | `cywell-payments` query retrieves indexed Markdown runbooks from `data/runbooks/cywell-payments` through `packages/rag`; draft runbook intake validates and exports evidence without applying changes |
| Runtime endpoint wiring can be checked safely | `npm run verify:runtime` verifies the Qdrant/vLLM service DNS, API route, and read-only readiness contract; `--live` additionally probes configured endpoints without mutation |
| Runtime RAG retrieval is evidence-gated | `npm run verify:runtime-rag` verifies `/ask`, `/mcp`, and incident analysis include `audit.runtimeRag`, default to local fallback, and only attempt vLLM/Qdrant when `CYWELL_OPSLENS_RAG_RUNTIME_MODE` is explicitly enabled; `npm run verify:runtime-rag:fixture` proves the hybrid success path against mock vLLM/Qdrant endpoints |
| Live cluster readiness can be checked safely | `npm run verify:lightspeed` reads the OLSConfig CRD and, when `CYWELL_OPSLENS_MCP_URL` is set, proves `tools/list` + `tools/call` without applying changes |

## Next Implementation Lane

1. Run `npm run verify:evidence-checkpoint` after the latest dry-run, Lightspeed routing score, Lightspeed patch preview, `verify:images:build` actual image build evidence, release/runtime plans, and MVP evidence are fresh; collect explicit approvals before any mutating OLM install, OLSConfig patch, image push, signing, or mirroring.
2. Run `npm run verify:operator:dry-run` and `npm run verify:lightspeed -- --mcp-url <cluster-or-local-mcp-url> --require-mcp` against a real OpenShift Lightspeed environment.
3. Harden the new env-gated RAG approval queue bridge into a production database-backed approval UI: `npm run verify:rag:approval-queue` now proves default design-only behavior, read-only inventory, and opt-in local metadata-only persistence, but human approval workflow, database storage, and ingestion jobs remain later lanes.
4. Run `npm run verify:runtime-rag:fixture` before each runtime adapter change, then run `npm run verify:runtime -- --live` after Qdrant/vLLM services are reachable and enable `CYWELL_OPSLENS_RAG_RUNTIME_MODE=hybrid` for controlled live retrieval checks before replacing the local hash-vector index with production Qdrant/pgvector ingestion and live embedding jobs.
5. Build and test the scaffolded Go/controller-runtime Operator manager once Go and Operator SDK are available, then run live OLSConfig patch, install, upgrade, uninstall, and rollback smoke tests.
6. Run a live OLM install/upgrade/uninstall smoke test once images and a lab OpenShift cluster are available.
7. Run `npm run verify:external-runtime-plan` and `npm run verify:release-plan` after same-HEAD actual image build evidence is fresh; then collect vLLM/Qdrant digest, scan, SBOM, provenance, mirror, and approval evidence, replace catalog/certification placeholders, run `opm`, `operator-sdk bundle validate`, `operator-sdk scorecard`, image scanning, and Partner Connect submission once external tooling and images are available.

## Stage 4 Package Lock

### In Scope

- Namespaced `OpsLensInstallation` CRD with API, dashboard, vector store, model runtime, validate-only RAG document intake, design-only RAG approval queue, ConsolePlugin, and Lightspeed registration settings.
- Default `ValidateOnly` registration mode plus explicit `PatchOLSConfig` opt-in for sample installs.
- Static manifests for API, dashboard, RAG policy ConfigMap, Qdrant vector store, vLLM runtime, ConsolePlugin, ingress NetworkPolicies, and managed OLSConfig registration.
- OLM bundle skeleton with CSV, CRD, annotations, bundle Dockerfile, related images, and RBAC for `olsconfigs`, `consoleplugins`, and `networkpolicies`.
- Go/controller-runtime manager source under `deploy/operator/controller-runtime/**` with scheme registration, health checks, `OpsLensInstallation` types, reconcile entrypoint, install resources, RAG policy rendering, and explicit `ValidateOnly`/`PatchOLSConfig` OLSConfig patch split.
- `npm run verify:operator` as the local package contract verifier.
- `npm run verify:rag:approval-queue` as the local metadata-only approval queue bridge verifier before any future ingestion job.
- `npm run verify:operator:dry-run` as the non-mutating live API/schema/admission preflight verifier.
- `npm run verify:install-plan` as the non-mutating human approval, risk, command, evidence, and rollback contract before mutating install.
- `npm run verify:evidence-checkpoint` as the current-head evidence board for MVP, RAG approval queue, image, Operator dry-run, Lightspeed routing/readiness, external runtime, release, and install readiness.
- `npm run verify:roadmap-plan` as the product-plan alignment board for `kugnus-idea/CywellOpsLens_plan.md` stages 1-5.
- `packages/operator-controller` reconcile core with `ValidateOnly`, explicit `PatchOLSConfig`, evidence, missing evidence, risk, rollback path, assistant plan-only policy, and RAG approval queue mutation blocked.
- `npm run verify:operator:reconcile` as the fixture-based reconcile verifier.

### Out Of Scope

- Local Go/Operator SDK build and unit test execution.
- Local Go/Operator SDK compile plus live OLSConfig patch/install/upgrade/uninstall smoke beyond the scaffolded source contract.
- Live OLM install, upgrade, and uninstall smoke tests.
- Running mutating install commands without an explicit install approval plan and human approval.
- Image build/push and catalog publishing.
- Red Hat certification scorecard and product listing metadata.

## Stage 5 Readiness Lock

### In Scope

- File-based catalog draft under `deploy/catalog/fbc/catalog.yaml`.
- Catalog image Dockerfile, internal `CatalogSource`, and Manual `Subscription` templates.
- Scorecard configuration for basic spec and OLM bundle validation tests.
- CSV and bundle annotations for package, supported OpenShift version range, support, subscription, disconnected, proxy, TLS, and FIPS readiness intent.
- Security, support matrix, and release gate documents.
- `npm run verify:certification` as the catalog/certification readiness verifier.
- `npm run verify:external-runtime-plan` as the no-mirror vLLM/Qdrant certification, scan, SBOM, provenance, mirror digest, approval, risk, and rollback contract.
- `npm run verify:release-plan` as the no-push image publish, signing, mirroring, and catalog publication approval contract.
- `npm run verify:evidence-checkpoint` as the same-head Lightspeed routing, release, and install evidence checkpoint before any external publication or live install approval.

### Out Of Scope

- Claiming Red Hat certification has passed.
- Partner Connect submission.
- Container certification for all referenced images.
- `opm` catalog image build, `operator-sdk bundle validate`, `operator-sdk scorecard`, and live hosted/local certification pipeline execution.
- Image push, signing, mirroring, or catalog publication without the release publish approval plan and human approval.
- Public GTM listing copy and sales collateral.
