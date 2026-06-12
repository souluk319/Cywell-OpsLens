# Cywell OpsLens Controller Runtime Skeleton

Status: scaffolded source contract. This workspace currently lacks local Go and Operator SDK binaries, so the skeleton is verified statically until those tools are available.

## Purpose

This directory is the Go/controller-runtime landing zone for the Stage 4 Operator manager. It mirrors the verified TypeScript reconcile contract in `packages/operator-controller` and keeps the same MVP safety boundaries:

- Assistant actions remain `plan-only`.
- `ValidateOnly` Lightspeed registration never mutates `OLSConfig`.
- `PatchOLSConfig` is the only path that may patch Lightspeed registration.
- RAG document intake is `validate-only`.
- RAG approval queue is `design-only`; enqueue and durable ingestion are disabled.
- Raw RAG document return is disabled.

## Verification

- `npm run verify:operator` statically checks the skeleton files and the rendered Operator package contract.
- `npm run verify:operator:reconcile` remains the executable reconcile contract until Go toolchain validation is available.

## Next Runtime Step

When Go and Operator SDK are available, run:

```bash
cd deploy/operator/controller-runtime
go mod tidy
go test ./...
go build -o manager ./main.go
```
