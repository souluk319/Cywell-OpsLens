# Cywell OpsLens Controller Runtime Skeleton

Status: scaffolded source contract with an implemented `PatchOLSConfig` source path. This workspace currently lacks local Go and Operator SDK binaries, so the manager is verified statically until those tools are available.

## Purpose

This directory is the Go/controller-runtime landing zone for the Stage 4 Operator manager. It mirrors the verified TypeScript reconcile contract in `packages/operator-controller` and keeps the same MVP safety boundaries:

- Assistant actions remain `plan-only`.
- `ValidateOnly` Lightspeed registration never mutates `OLSConfig`.
- `PatchOLSConfig` is the only path that may patch Lightspeed registration; it reads the existing OLSConfig, preserves current feature gates and other MCP servers, upserts the Cywell MCP server, and patches via `client.MergeFrom`.
- RAG document intake is `validate-only`.
- RAG approval queue is `design-only`; enqueue and durable ingestion are disabled.
- Raw RAG document return is disabled.

## Verification

- `npm run verify:operator` statically checks the skeleton files, rendered Operator package contract, and OLSConfig patch source path.
- `npm run verify:operator:reconcile` remains the executable reconcile contract until Go toolchain validation is available.
- `npm run verify:operator:runtime` checks parity between the TypeScript desired resource plan and the Go/controller-runtime source, including the OLSConfig patch path.

## Next Runtime Step

When Go and Operator SDK are available, run:

```bash
cd deploy/operator/controller-runtime
go mod tidy
go test ./...
go build -o manager ./main.go
```
