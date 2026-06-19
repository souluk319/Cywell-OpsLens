# Cywell OpsLens Dev 0.1.6 Agentic Operations

## Goal

Promote KOMSCO AI Assistant from a guidance chatbot into an OpenShift-native operations agent.

Dev 0.1.6 must prove that OpsLens can present the original OpenShift Console function set as a live, easier-to-operate console mod, then diagnose a real OpenShift problem, prepare a safe remediation plan, check RBAC, request human approval, and execute only approved safe actions through the OpsLens API or Operator.

This is not an API-key chatbot lane. It must follow OpenShift identity, authorization, and audit boundaries.

## Locked Product Intent

Cywell OpsLens is a console mod for OpenShift operations.

The product target is not a narrow Topology replacement. The target is a full OpenShift Console operations experience:

```text
Original OpenShift Console function
-> same function exists in OpsLens
-> same live OpenShift resource state is visible
-> OpsLens adds clearer visualization, evidence, assistant context, and governed action flow
```

If a user creates or changes resources in the original CRC console, OpsLens must refresh from the read-only OpenShift API and reflect the change without pretending that fixture/demo data is live.

The assistant should behave like this:

```text
User asks KOMSCO AI Assistant to solve an issue
-> OpsLens reads current OpenShift console context
-> OpsLens collects read-only evidence: resources, events, logs, conditions
-> OpenShift Lightspeed produces diagnosis and action candidates
-> OpsLens converts the answer into a structured Action Plan
-> OpsLens checks RBAC for each proposed action
-> OpsLens shows impact, risk, rollback, and approval requirement
-> Human approves an allowed action
-> OpsLens API or Operator executes the action
-> OpsLens verifies result and records audit evidence
```

The desired user experience is:

```text
"해결해줘"
-> diagnosis
-> recommended fix
-> permission check
-> approval prompt
-> execute
-> verify
-> audit trail
```

## What Changes From Dev 0.1.5

| Area | Dev 0.1.5 | Dev 0.1.6 target |
| --- | --- | --- |
| Assistant identity | Lightspeed-backed chat UI | Agentic operations assistant |
| Main output | Answer text and guidance | Structured action plan with execution eligibility |
| Cluster access | Read-only status and context | Read-only by default, approved safe writes only |
| Console parity | Mapped menu/function shell | Original console resource pages functionally represented with live read-only data |
| Visual model | Operations dashboard visuals | Resource-specific upgraded visuals: topology graph, workload health, event/alert timelines, storage/network summaries |
| Freshness | Manual refresh surfaces | Live refresh loop plus manual refresh, with visible stale/unavailable state |
| Permission model | Connection status visible | RBAC preflight per action |
| Human control | User asks questions | User approves or rejects specific actions |
| Execution | Not executed | API/Operator executes only approved allowlisted actions |
| Evidence | Answer source and context | Diagnosis, plan, RBAC check, approval, result verification, audit |

## OpenShift Integration Contract

| Contract | Dev 0.1.6 decision |
| --- | --- |
| User identity | Use the logged-in OpenShift user's token through ConsolePlugin/UserToken proxy when running inside the console |
| Lightspeed API | Call OpenShift Lightspeed REST API with OpenShift bearer token and `ols-user` permission |
| Provider key | Do not put provider API keys in the browser; provider keys stay in cluster-managed Secrets |
| RAG | Support BYO Knowledge or OpsLens-managed RAG store; ingestion/write paths remain approval-gated |
| Writes | Allowed only after RBAC pass, human approval, action allowlist pass, and rollback plan present |
| Audit | Every proposed and executed action must have request id, user, namespace, resource, action, approval, and verification result |
| Live reflection | Resource views poll or watch read-only OpenShift state and never label fixture data as live |

## Original Console Parity And Visualization Scope

Dev 0.1.6 treats each OpenShift Console navigation entry as a product surface, not a text-only placeholder.

| Native console area | OpsLens target behavior | Visual upgrade |
| --- | --- | --- |
| Home / Overview | Live cluster version, operators, nodes, inventory, alerts, and activity | Health score, evidence freshness, alert/event correlation, concise operator action cards |
| Workloads / Topology | Workload graph using Deployments, Pods, Services, Routes, Jobs, and CronJobs from the API | Node-link topology, health rings, owner/service/route edges, namespace/application filters |
| Workloads / Pods, Deployments, CronJobs, Jobs, ReplicaSets, HPA, PDB | Same list/detail functions through read-only API presets | Status distribution, rollout/owner chains, failed-pod grouping, assistant-ready triage |
| Networking / Services, Routes, Ingress, NetworkPolicies | Same resource inspection and filtering | Route/service exposure map, endpoint readiness, policy coverage indicators |
| Storage / PVC, PV, StorageClass | Same storage inventory and detail inspection | Capacity/risk tiles, bound/unbound grouping, volume health context |
| Monitoring / Alerts, Metrics, Logs, Events | Same operational signals surfaced from read-only APIs and approved proxies | Alert timeline, severity distribution, log/event correlation, suggested next checks |
| Administration / Operators, Namespaces, CRDs, RBAC, Cluster Settings | Same configuration/resource inspection without mutation | Install health, RBAC boundary, API coverage, approval-gated change previews |

Topology is one required visualization, but it is not the whole scope. The broader rule is: every native console function must either have a live OpsLens equivalent or an explicit native-deep-link gap until implemented.

## Action Model

Dev 0.1.6 introduces an `ActionPlan` contract rather than free-form "run this command" advice.

Minimum fields:

| Field | Purpose |
| --- | --- |
| `problemSummary` | User-readable issue summary |
| `evidence` | Read-only evidence gathered from OpenShift |
| `diagnosis` | Lightspeed/OpsLens reasoning summary |
| `actions[]` | Candidate actions |
| `actions[].type` | Stable allowlisted action id |
| `actions[].target` | Resource group/version/kind/name/namespace |
| `actions[].rbac` | `allowed`, `denied`, or `unknown` with SAR evidence |
| `actions[].risk` | low/medium/high and impact explanation |
| `actions[].rollback` | How to reverse or stop the action |
| `actions[].approvalRequired` | Boolean |
| `actions[].executionState` | proposed/approved/running/succeeded/failed/rolled-back |
| `audit` | Request id, actor, timestamps, source model, mutation boundary |

## Safe Action Allowlist

Dev 0.1.6 should not attempt arbitrary shell execution.

Initial safe action candidates:

| Action | Default mode | Notes |
| --- | --- | --- |
| `collect-pod-logs` | read-only | Fetch logs for selected pod/deployment |
| `collect-events` | read-only | Fetch events for namespace/resource |
| `inspect-rollout` | read-only | Read Deployment/ReplicaSet rollout state |
| `restart-deployment` | approval-gated | `rollout restart` equivalent through Kubernetes patch |
| `scale-deployment` | approval-gated | Scale within bounded min/max policy |
| `annotate-resource` | approval-gated | Safe audit or retry annotations only |
| `patch-route-timeout` | approval-gated | Only if explicitly modeled and rollback is generated |

Explicitly excluded from Dev 0.1.6:

| Excluded action | Reason |
| --- | --- |
| Namespace deletion | Destructive |
| Broad RBAC mutation | Security approval required |
| Secret value display | Sensitive data exposure |
| Arbitrary command execution | Not auditable or safely bounded |
| OLSConfig mutation | Requires separate explicit approval |
| Registry push/catalog replacement | Release operation, not assistant remediation |

## Acceptance Criteria

| ID | Pass/fail condition | Measurement | Evidence | Current gap |
| --- | --- | --- | --- | --- |
| AC-016-001 | Assistant can turn a user issue request into a structured `ActionPlan` | API response schema validation | Contract test | Schema not created |
| AC-016-002 | Each mutating action includes RBAC preflight result | SelfSubjectAccessReview or equivalent server-side check | API test with allowed/denied fixtures | RBAC action check not implemented |
| AC-016-003 | Mutating action cannot execute without human approval | UI/API rejects execution when approval missing | E2E + API test | Approval gate not implemented |
| AC-016-004 | Approved allowlisted action can execute in local/dev mode | Controlled action runs against local fixture or approved CRC path | Dev execution evidence | Execution runner not implemented |
| AC-016-005 | Action result is verified after execution | Deployment/pod/event state re-read after action | API + browser evidence | Post-action verifier not implemented |
| AC-016-006 | Audit trail records actor, action, approval, result, rollback path | JSON artifact or API response | Audit fixture | Audit contract not implemented |
| AC-016-007 | Browser assistant UI shows plan, approval, execute, verify states clearly | Playwright check and screenshot | UI evidence | UI state model not implemented |
| AC-016-008 | Read-only diagnosis remains available when RBAC denies write | Denied fixture still returns useful diagnosis | API/browser test | Denied path not implemented |
| AC-016-009 | No fake execution or hidden fallback copy is shown | Verifier rejects fabricated success text | Contract verifier | Verifier not implemented |
| AC-016-010 | Resource pages reflect live CRC changes within one refresh interval | Create/update a harmless resource in original console, then observe OpsLens list/topology update | Browser evidence + API timestamp | Poll/watch contract not complete |
| AC-016-011 | Topology uses actual workload resources, not static cards | Read Deployments, Pods, Services, Routes, Jobs, CronJobs and render nodes/edges | Component test + screenshot | Dedicated graph view not implemented |
| AC-016-012 | Every original console menu item has a live view, native deep link, or explicit gap | Parity registry audit | `verify:web-shell` and parity map | Behavior depth still uneven |
| AC-016-013 | Demo/fixture data cannot be mistaken for live data | UI labels source and freshness on every mixed-data surface | Browser/verifier evidence | Some dashboard cards remain fixture-backed |

## Verification Plan

Closest safe local verification first:

```text
npm run -w @kugnus/api build
npm run -w @kugnus/web build
npm run verify:web-shell
new: npm run verify:agent-actions
new: Playwright assistant approval/execution smoke
```

The new verifier should check:

- `ActionPlan` schema is stable.
- Mutating actions require RBAC result and approval.
- Denied RBAC cannot execute.
- Missing approval cannot execute.
- Allowed approved fixture action returns execution and verification states.
- UI does not show "fixed" until verification evidence exists.
- Live resource surfaces expose refresh state and re-read OpenShift API data.
- Topology and workload pages use API data rather than static demonstration nodes.
- Console parity registry marks any not-yet-implemented native function as a gap instead of implying completion.

## UI Requirements

The chat experience must remain natural while exposing the action lifecycle.

Required assistant behavior:

| Behavior | Requirement |
| --- | --- |
| Streaming answer | Response appears progressively with stop control |
| Scroll lock | User scroll-up disables auto-follow; small jump-to-bottom button appears |
| Conversation history | Previous questions and answers remain visible |
| Suggested prompts | Rotating suggestions can be sent directly or replaced by user input |
| Mode select | Ask/Troubleshooting remains available |
| Action cards | Remediation plans appear as clear cards, not raw JSON |
| Approval card | Mutating action shows impact, RBAC, rollback, and approve/reject buttons |
| Execution state | Running/succeeded/failed/verified states are visually distinct |
| Audit details | Collapsible details show request id, actor, resource, and evidence |

## Product Boundaries

Dev 0.1.6 is allowed to implement local and fixture-backed execution first.

Live CRC mutation requires explicit approval at action time.

Company OCP mutation remains out of scope.

Do not:

- Present unverified actions as completed.
- Expose `.env`, tokens, provider keys, or Secret values.
- Bypass OpenShift RBAC.
- Let the browser call provider APIs directly.
- Use iframe or unsupported DOM injection as the product path.
- Hide action failures behind polished copy.

## Demo Story

Target demo narrative:

```text
OpenShift console has a real operational problem.
KOMSCO AI Assistant understands the visible OCP context.
It diagnoses the issue using Lightspeed and cluster evidence.
It proposes a safe remediation.
It proves whether the current user can perform the action.
It asks for human approval.
After approval, OpsLens executes and verifies the result.
```

This answers the core business question:

```text
Can a company-built console extension go beyond dashboards and become a governed OpenShift operations assistant?
```

Dev 0.1.6 target answer:

```text
Yes, within official OpenShift extension, RBAC, approval, and audit boundaries.
```

## Ref Stamp

| Field | Value |
| --- | --- |
| Version lane | Dev 0.1.6 |
| Source branch at draft | `feat/OpsLens-Dev0.1.5` |
| Source head at draft | `e622bece` |
| Base ref | `origin/feat/OpsLens-Dev0.1.5` |
| Draft date | 2026-06-19 |
| Live reference target | MacBook CRC OpenShift 4.21.14 |
| Company OCP | Do not mutate |
