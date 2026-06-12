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
| 1. Lightspeed MCP validation | Route internal/custom questions from Lightspeed to Cywell OpsLens | `/mcp`, `/api/opslens/tools`, `/api/opslens/ask`, `packages/rag`, `deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml` | AC-LS-001 and AC-RAG-001 pass; a live OLSConfig smoke test proves `tools/list` + `tools/call` |
| 2. AI Ops pipeline | Combine alerts with logs, metrics, events, and plan-only remediation proposals | `/api/opslens/incidents/analyze`, OCP read-only APIs, private RAG citations, `propose_remediation` plan-only tool | Alert-driven prompt includes last 10 minutes of logs/events/Prometheus metrics without mutation |
| 3. Dedicated dashboard | Provide monitoring, token usage, validate-only RAG document management, evidence export, and plugin links | `/api/opslens/admin/overview`, `/api/opslens/admin/rag/validate`, `/api/opslens/admin/rag/evidence-export`, OpsLens Admin Dashboard, future ConsolePlugin route | Dashboard surfaces RAG health, validate-only draft checks, audit-safe evidence export, token usage, GPU/runtime samples, incident metric status, and install readiness |
| 4. Operator packaging | Install API, vector DB, dashboard, RAG safety policy, Console/Lightspeed ingress policy, and MCP registration as one product | `deploy/operator/config/**`, `deploy/operator/bundle/**`, `deploy/operator/controller-runtime/**`, `packages/operator-controller`, `OpsLensInstallation.spec.rag`, `cywell-opslens-rag-policy`, ingress NetworkPolicies, CSV, static package verifier, live server-side dry-run preflight, OLSConfig reconciliation core | Static package, Go source parity, reconcile verifiers, and non-mutating live dry-run pass first; local Go/SDK execution plus live install/upgrade/uninstall smoke follow |
| 5. Certification/GTM | Prepare Red Hat catalog and B2B packaging | `deploy/catalog/**`, scorecard config, certification annotations, security/support/release docs, readiness verifier | Static catalog/certification readiness passes first; Red Hat hosted/local certification pipeline and Partner Connect submission follow |

## Stage 1 MVP Lock

### In Scope

- Read-only MCP tool catalog for Lightspeed.
- Private customer RAG answer contract backed by tenant-scoped local vector index over Markdown runbooks with redacted snippets and citations.
- REST smoke endpoint for local validation.
- OLSConfig template for registering Cywell OpsLens as a custom MCP server.
- Audit envelope with tenant, cluster, namespace, model route, redaction count, and sources.

### Out Of Scope

- Production vLLM/vector DB deployment.
- Automatic apply/delete/scale.
- Raw customer document return through MCP.
- Red Hat certified Operator packaging.
- Automatic mutation of an installed customer Lightspeed config by an Operator.

### Pass/Fail

| Requirement | Pass Evidence |
|---|---|
| Lightspeed can discover Cywell tools | `/mcp` JSON-RPC `tools/list` returns `generate_playbook` with read-only annotations |
| Custom question can route to Cywell | `/mcp` JSON-RPC `tools/call` returns structured content with customer-runbook citations |
| Sensitive content is controlled | Response has `rawDocumentReturned=false`, `serverSideRedaction=true`, and redacted prompt text |
| Mutation is blocked | Tool catalog excludes `apply_remediation`, response has `mutationAllowed=false` |
| Install path is visible | OLSConfig template exists under `deploy/lightspeed/` |
| Local private RAG path works | `cywell-payments` query retrieves indexed Markdown runbooks from `data/runbooks/cywell-payments` through `packages/rag`; draft runbook intake validates and exports evidence without applying changes |
| Live cluster readiness can be checked safely | `npm run verify:lightspeed` reads the OLSConfig CRD and, when `CYWELL_OPSLENS_MCP_URL` is set, proves `tools/list` + `tools/call` without applying changes |

## Next Implementation Lane

1. Run `npm run verify:operator:dry-run` and `npm run verify:lightspeed -- --mcp-url <cluster-or-local-mcp-url> --require-mcp` against a real OpenShift Lightspeed environment.
2. Implement durable RAG approval queue persistence after the approval-state contract is reviewed.
3. Replace the local hash-vector index with production Qdrant/pgvector ingestion and live embedding jobs when runtime images are available.
4. Build and test the scaffolded Go/controller-runtime Operator manager once Go and Operator SDK are available, then run live OLSConfig patch, install, upgrade, uninstall, and rollback smoke tests.
5. Run a live OLM install/upgrade/uninstall smoke test once images and a lab OpenShift cluster are available.
6. Replace catalog/certification placeholders, run `opm`, `operator-sdk bundle validate`, `operator-sdk scorecard`, image scanning, and Partner Connect submission once external tooling and images are available.

## Stage 4 Package Lock

### In Scope

- Namespaced `OpsLensInstallation` CRD with API, dashboard, vector store, model runtime, validate-only RAG document intake, design-only RAG approval queue, ConsolePlugin, and Lightspeed registration settings.
- Default `ValidateOnly` registration mode plus explicit `PatchOLSConfig` opt-in for sample installs.
- Static manifests for API, dashboard, RAG policy ConfigMap, Qdrant vector store, vLLM runtime, ConsolePlugin, ingress NetworkPolicies, and managed OLSConfig registration.
- OLM bundle skeleton with CSV, CRD, annotations, bundle Dockerfile, related images, and RBAC for `olsconfigs`, `consoleplugins`, and `networkpolicies`.
- Go/controller-runtime manager source under `deploy/operator/controller-runtime/**` with scheme registration, health checks, `OpsLensInstallation` types, reconcile entrypoint, install resources, RAG policy rendering, and explicit `ValidateOnly`/`PatchOLSConfig` OLSConfig patch split.
- `npm run verify:operator` as the local package contract verifier.
- `npm run verify:operator:dry-run` as the non-mutating live API/schema/admission preflight verifier.
- `packages/operator-controller` reconcile core with `ValidateOnly`, explicit `PatchOLSConfig`, evidence, missing evidence, risk, rollback path, assistant plan-only policy, and RAG approval queue mutation blocked.
- `npm run verify:operator:reconcile` as the fixture-based reconcile verifier.

### Out Of Scope

- Local Go/Operator SDK build and unit test execution.
- Local Go/Operator SDK compile plus live OLSConfig patch/install/upgrade/uninstall smoke beyond the scaffolded source contract.
- Live OLM install, upgrade, and uninstall smoke tests.
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

### Out Of Scope

- Claiming Red Hat certification has passed.
- Partner Connect submission.
- Container certification for all referenced images.
- `opm` catalog image build, `operator-sdk bundle validate`, `operator-sdk scorecard`, and live hosted/local certification pipeline execution.
- Public GTM listing copy and sales collateral.
