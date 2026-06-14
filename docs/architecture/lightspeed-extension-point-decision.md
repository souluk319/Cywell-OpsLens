# Cywell OpsLens Lightspeed Extension Point Decision

Status: MVP 0.1 product contract.

## Decision

Cywell OpsLens integrates with OpenShift Lightspeed through a custom MCP server registered in `OLSConfig.spec.mcpServers`.

The production-facing endpoint is `/mcp`. The local `/api/opslens/mcp` route is a smoke-test and partner-demo alias that serves the same JSON-RPC tool contract.

## Why This Path

- `OLSConfig.spec.featureGates: [MCPServer]` and `spec.mcpServers` are the documented Lightspeed extension surface used by the roadmap.
- The MCP response boundary lets OpsLens keep customer RAG, redaction, citations, risk, missing evidence, and audit inside Cywell-controlled code.
- REST routes such as `/api/opslens/ask` and `/api/opslens/incidents/analyze` remain product APIs, but they are not the Lightspeed extension point.

## Explicit Non-Goals

- Do not depend on an undocumented Lightspeed webhook for Stage 1.
- Do not mutate a legacy Lightspeed ConfigMap for MVP 0.1 registration.
- Do not register `apply_remediation` or any apply/delete/scale tool in the MVP MCP catalog.
- Do not return raw customer documents through MCP.

## Required Evidence

- `deploy/lightspeed/olsconfig-cywell-opslens-mcp.yaml` is an `OLSConfig` with `MCPServer`, a `cywell-opslens` `mcpServers` entry, an endpoint ending in `/mcp`, Kubernetes bearer forwarding, and secret-backed Cywell API key header support.
- `apps/api/src/server.ts` serves both `/mcp` and `/api/opslens/mcp` through `handleOpsLensMcpRequest`.
- `docs/roadmap/cywell-opslens-productization.md` says Stage 1 uses custom MCP through `OLSConfig.spec.mcpServers`, not an undocumented webhook.
- `docs/acceptance/mvp-0.1.md` binds AC-LS-001 to JSON-RPC `tools/list` and `tools/call` through `/mcp`.

## Verification

Run:

```powershell
npm run verify:lightspeed-extension
```

The verifier writes `test-results/cywell-opslens-lightspeed-extension-point.json` with branch/head/base/dirty stamp, pass/fail checks, mutation flags, evidence, missing evidence, risk, and rollback path. It reads repository files only and does not call the cluster, patch `OLSConfig`, push images, write vectors, or contact Lightspeed.
