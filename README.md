# Cywell OpsLens

MVP 0.1 starts as a console-shaped, read-only prototype for an OpenShift operations AI product. It keeps the dashboard primary, keeps the assistant out of the evidence area, includes a live OpenShift API lane for local CRC/OCP validation, and now exposes the first Cywell OpsLens Lightspeed MCP integration contract.

The first slice proves:

- dashboard-first operations flow
- OpenShift-console-like shell with a Lightspeed-style lower-right assistant launcher and popover
- explicit console context chips
- evidence-first answer contract
- Lightspeed custom MCP tool surface for private customer runbook/RAG answers, Console deep links, and install preflight planning
- acceptance criteria that can become automated checks
- an MVP gate that maps acceptance criteria to build, UI/API, RAG, Lightspeed, Operator, and certification verifiers

## Scripts

```bash
npm install
npm run dev
npm run build
npm run verify:mvp
npm run verify:evidence-checkpoint
npm run verify:roadmap-plan
npm run verify:catalog-toolchain
npm run verify:release-refresh
npm run verify:ocp:connectivity
npm run verify:runtime-rag
npm run verify:runtime-rag:fixture
npm run verify:lightspeed:routing
npm run verify:rag:approval-queue
npm run test:e2e
npm run verify:lightspeed:fixture
```

`npm run verify:mvp` runs the MVP 0.1 release gate and writes local evidence to `test-results/cywell-opslens-mvp-0.1-gate.json`. Use `npm run verify:mvp -- --skip-e2e` for a faster static/API gate when UI evidence is not required.

`npm run verify:evidence-checkpoint` reads the current local evidence artifacts, including the RAG approval queue bridge and Lightspeed routing score, checks that they are stamped with the current git head, keeps live OCP/Lightspeed and external runtime gaps visible, and writes `test-results/cywell-opslens-evidence-checkpoint.json`. It does not build, push, patch, apply, delete, scale, or contact the cluster.

`npm run verify:roadmap-plan` maps `kugnus-idea/CywellOpsLens_plan.md` to current evidence for the five launch stages: Lightspeed MCP PoC, AI Ops pipeline, dedicated dashboard, Operator/internal catalog packaging, and Red Hat certification/GTM. It writes `test-results/cywell-opslens-roadmap-plan-alignment.json` and treats live OCP/Lightspeed reachability, external runtime certification inputs, release approval, and install approval as explicit `NEEDS_EVIDENCE` gaps rather than hidden completion.

`npm run verify:catalog-toolchain` checks the local catalog/certification toolchain contract without publishing or applying anything. It validates CSV/FBC/CatalogSource/Subscription/scorecard parity, records local `docker`/`opm`/`operator-sdk`/`podman`/`oc` availability, checks whether registry.redhat.io auth is configured without exporting credentials, and writes `test-results/cywell-opslens-catalog-toolchain-plan.json`.

`npm run verify:release-refresh` regenerates the release evidence chain in dependency order for the current Git HEAD, then writes `test-results/cywell-opslens-release-evidence-refresh.json`. By default it runs local image build evidence and live read-only OCP/Lightspeed diagnostics; use `-- --skip-image-build` for a faster static refresh or `-- --skip-live` when the target cluster network is known to be unavailable.

`npm run evidence:external-runtime:draft -- --name vllm|qdrant` creates ignored `*.draft.json` reviewer packets for external runtime digest, scan, SBOM, provenance, license, and approval inputs. Drafts are surfaced by `npm run verify:external-runtime-plan`, but they never replace the final reviewed `docs/release/evidence/external-runtime/vllm.json` and `qdrant.json` release evidence files.

`npm run verify:ocp:connectivity` performs a read-only live connectivity diagnostic for the configured OCP API endpoint. It loads `.env`/kubeconfig candidates, redacts token values, checks DNS, TCP, TLS, Kubernetes `/version`, and `oc get --raw=/version`, then writes `test-results/cywell-opslens-ocp-connectivity-diagnostic.json`. A `tcp-timeout` classification means the API host resolves but port 6443 is not reachable from this machine yet.

`npm run dev` starts both:

- API: `http://127.0.0.1:4174`
- Web: `http://127.0.0.1:5173`

## API Contracts

MVP 0.1 has a mock read-only assistant/backend contract:

- `GET /api/dashboard/risks`
- `POST /api/context/sync`
- `POST /api/actions/plan`
- `GET /api/opslens/tools`
- `GET /api/opslens/admin/overview`
- `GET /api/opslens/runtime/readiness`
- `GET /api/opslens/admin/rag/approval-queue`
- `POST /api/opslens/admin/rag/approval-queue/submit`
- `POST /api/opslens/ask`
- `POST /api/opslens/incidents/analyze`
- `POST /mcp`
- `POST /api/opslens/mcp`

The web app uses these endpoints through the Vite proxy, so the fixture-backed UI is already shaped like the Phase 1 Console Plugin + Backend API flow.

Cywell OpsLens Stage 1 uses the OpenShift Lightspeed custom MCP server path, not an undocumented webhook path. The MVP MCP surface provides six read-only tools: `get_cluster_signal`, `retrieve_customer_knowledge`, `generate_playbook`, `open_console_deep_link`, `run_preflight`, and `propose_remediation`; mutating tools such as `apply_remediation` are deliberately excluded from MVP. Tool responses share the same safety envelope: citations, missing evidence, risks, rollback path, runtime RAG audit, redaction, and `mutationAllowed=false`.

`npm run verify:lightspeed:routing` adds the Stage 1 tool-selection fixture: 10 representative Lightspeed questions must select the expected read-only OpsLens MCP tool and at least 8 routed responses must keep the safety/evidence contract.

Stage 2 begins with `POST /api/opslens/incidents/analyze`: an alert-triggered, plan-only incident endpoint that combines read-only resource detail, pod candidates, events, `sinceSeconds`-bounded pod logs, and opt-in Prometheus metric correlation with private runbook citations. Failed reads are returned as `missingEvidence`, not hidden.

Stage 3 starts with `GET /api/opslens/admin/overview` and the OpsLens Admin Dashboard surface for RAG document health, validate-only evidence export, env-gated RAG approval queue persistence, token usage, GPU/runtime samples, Lightspeed MCP tool matrix plus routing score, incident metric query status, and install readiness.

`npm run verify:rag:approval-queue` proves the post-MVP approval queue bridge: default API mode remains `designOnly`, the queue inventory is read-only, an explicitly enabled local queue persists and lists only metadata/redacted chunks/approval requirements, invalid drafts are rejected before persistence, and no raw Markdown, vector write, cluster mutation, approval mutation, or secret-like value is stored.

The answer path now carries a runtime RAG audit contract. By default `CYWELL_OPSLENS_RAG_RUNTIME_MODE=local`, so `/api/opslens/ask`, `/mcp`, and incident analysis do not call live Qdrant/vLLM endpoints. When explicitly set to `hybrid` or `runtime`, OpsLens tries vLLM embeddings plus Qdrant redacted snippet search and falls back to local tenant RAG with visible `missingEvidence` if runtime evidence is absent. `npm run verify:runtime-rag:fixture` proves that success path against local mock runtime services without touching OpenShift.

Live OpenShift read-only API support:

- `GET /api/ocp/status`
- `GET /api/ocp/console-overview`
- `GET /api/ocp/api-resources`
- `GET /api/ocp/access-review?apiVersion=v1&resource=pods&verb=list`
- `GET /api/ocp/access-matrix?apiVersion=v1&resource=pods`
- `GET /api/ocp/coverage-matrix?maxResources=20&includeDetails=true`
- `GET /api/ocp/coverage-matrix?includeDetails=false`
- `GET /api/ocp/coverage-diagnostic?apiVersion=org.eclipse.che%2Fv1&resource=checlusters`
- `GET /api/ocp/resources?apiVersion=v1&resource=pods&limit=50&continue=<token>&labelSelector=app%3Dmy-app&fieldSelector=metadata.name%3D<pod>`
- `GET /api/ocp/resource?apiVersion=v1&resource=pods&namespace=default&name=<pod>`
- `GET /api/ocp/related?apiVersion=v1&resource=pods&namespace=default&name=<pod>`
- `GET /api/ocp/pod-logs?namespace=default&pod=<pod>&tailLines=200&sinceSeconds=600`
- `GET /api/ocp/events?apiVersion=v1&kind=Pod&namespace=default&name=<pod>`

The API loads `OCP_API_BASE_URL` and `OCP_API_TOKEN` from `.env`, and also falls back to kubeconfig server/token candidates when the env URL points at a console endpoint instead of the Kubernetes API root. CRC/self-signed TLS can be handled with `OCP_TLS_VERIFY=false` or the existing `OPENSHIFT_LIGHTSPEED_TLS_VERIFY=false`.

Safety defaults:

- raw Secret fetch is blocked unless `OCP_ALLOW_SECRET_FETCH=true`
- monitoring service proxy queries are disabled unless `OCP_ENABLE_MONITORING_PROXY=true`
- runtime RAG retrieval is local-only unless `CYWELL_OPSLENS_RAG_RUNTIME_MODE=hybrid` or `runtime`
- Cywell private RAG responses return redacted snippets/citations and audit metadata, not raw customer documents
- incident analysis redacts log/event evidence, uses `planOnly`, keeps `mutationAllowed=false`, and records metric `missingEvidence` when monitoring proxy queries are disabled or unreachable
- list/detail/related/log/event routes are read-only and expose `SelfSubjectAccessReview` evidence, `get/list/watch` read access matrix, bounded/full resource coverage matrix probes, gap classification, CRD/APIService/conversion-webhook diagnostics, alternate served API version probes, exportable evidence snapshots, pagination tokens, label/field selector-scoped queries, owner/child relationships, sanitized JSON/YAML views, redaction, and missing-evidence states instead of mutation commands
- when a discovered served version fails because of a cluster-side API/conversion issue, `/api/ocp/resources` and `/api/ocp/resource` may return a `fallback` block showing the requested API version, the served version actually read, the original failure reason, and read-only evidence

## Current Scope

MVP 0.1 is read-only. It does not apply, delete, scale, fetch raw Secrets by default, or call an external model provider.
