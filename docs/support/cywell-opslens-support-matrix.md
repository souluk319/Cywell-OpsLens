# Cywell OpsLens Support Matrix

Status: draft support policy for internal catalog and certification readiness.

## Support Contact

- Product owner: Cywell OpsLens Team
- Support alias: `opslens-support@cywell.com`
- Certified Operator submission requires confirming the alias is monitored by Cywell support before publication.

## Supported Platform Targets

| Item | Target |
|---|---|
| OpenShift | v4.16-v4.21 readiness declaration |
| Install path | OLM bundle, internal FBC catalog, Manual Subscription |
| Namespace | `cywell-opslens` by default |
| Lightspeed integration | Custom MCP server through OLSConfig, Technology Preview |
| Console integration | OpenShift ConsolePlugin |
| Data mode | Cywell private RAG, metadata-only admin inventory |
| Assistant action mode | read-only and plan-only |

## Upgrade Policy

- Upgrades use OLM `Subscription.spec.installPlanApproval: Manual`.
- The release manager must approve the generated InstallPlan after staging smoke tests pass.
- CRD schema changes must be backward compatible for the supported version range.
- Downgrade is not promised as an automatic OLM operation; rollback uses previous bundle/catalog plus CR backup or GitOps state.

## Support Boundaries

- Supported: Operator install contract, API health, dashboard availability, read-only OCP discovery, RAG metadata inventory, Lightspeed MCP tool discovery.
- Conditionally supported: Lightspeed MCP routing, because OpenShift Lightspeed MCP is Technology Preview.
- Unsupported in MVP: automatic apply/delete/scale, raw Secret retrieval, raw customer document return, direct external LLM provider calls.

## Operational Evidence

- Package verifier: `npm run verify:operator`
- Reconcile verifier: `npm run verify:operator:reconcile`
- RAG verifier: `npm run verify:rag`
- Lightspeed fixture verifier: `npm run verify:lightspeed:fixture`
- API/UI acceptance: `npm run test:e2e`
- Build: `npm run build`
