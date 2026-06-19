# Dev 0.1.7 True Console Parity + OpsLens Plus Alpha Goal

Status: active goal for the next implementation lane
Branch: `feat/OpsLens-Dev0.1.7`
Base commit: `b090fa13`
Reference target: CRC OpenShift / OpenShift Local `4.21.14`
Primary contract: `docs/product-goals/cywell-opslens-console-mod/versions/dev-0.1.6-ocp-console-study.md`

## Product Goal

Dev 0.1.7 is the lane where Cywell OpsLens stops being a mapped dashboard shell
and starts becoming a credible OpenShift console mode.

The target is:

```text
Original OpenShift Console functions remain recognizable
-> OpsLens maps each native function to a real view, native deep link, or explicit gap
-> OpsLens improves the experience with visual topology, incident grouping, evidence, and KOMSCO AI Assistant
-> Writes stay native, read-only, or approval-gated
```

The product story is "OpenShift Console, but upgraded for KOMSCO operations." It
is not "a separate dashboard with similar menu labels."

## Locked Scope

### Must Do

1. Make the parity contract honest.
   - Every OCP menu item must be classified as one of:
     - `Live OpsLens View`
     - `Native Deep Link`
     - `Plan-Only Assistant`
     - `Explicit Gap`
   - A menu label alone is not completion.

2. Build Workloads parity first.
   - Topology must be a real visual graph, not a generic list.
   - Pods, Deployments, Jobs, CronJobs, HPA, and PDB must expose useful list/detail state.
   - CronJob create/edit/delete remain native deep links unless approval-gated mutation exists.

3. Stabilize live API behavior.
   - Core resources must not show generic `400` on the test page.
   - API errors must identify the actual reason: route, RBAC, API group, namespace, or unsupported resource.

4. Upgrade dashboard visualization from native parity.
   - Live CPU, memory, filesystem, network, and pod trends must use Prometheus data when enabled.
   - Cluster inventory and risk panels must state whether they are live, fixture, or unavailable.
   - Visuals must be clearer than raw OpenShift tables, not just restyled cards.

5. Keep KOMSCO AI Assistant context-aware.
   - Assistant must receive current menu, namespace, selected resource, native path, evidence, and safety boundary.
   - If Lightspeed is unavailable, show a precise diagnostic.
   - If Lightspeed is available, final answer ownership is OpenShift Lightspeed with OpsLens-provided context.

### Must Not Do

- Do not claim 1:1 parity because a menu item exists.
- Do not hide missing functionality behind generic Resource Explorer cards.
- Do not display fixture/mock data as live cluster status.
- Do not mutate cluster resources unless RBAC, allowlist, human approval, and audit contract are present.
- Do not use unsupported console DOM injection.
- Do not deploy a new image until the local test page proves the behavior.

## Acceptance Criteria

| ID | Pass / Fail Rule | Evidence |
| --- | --- | --- |
| AC-017-001 | Every native OCP menu item has one honest class: live view, native deep link, plan-only assistant, or explicit gap. | Parity registry audit and visible UI labels |
| AC-017-002 | Workloads / Topology renders graph nodes and edges from live Deployments, Pods, Services, Routes, Jobs, and CronJobs when available. | Browser DOM check and screenshot |
| AC-017-003 | Pods, Deployments, Jobs, CronJobs, HPA, and PDB expose list/detail/evidence state, not only a generic card. | Resource API smoke and browser check |
| AC-017-004 | Native create/edit/delete flows use OpenShift native deep links or approval-gated actions; no fake create UI. | Click-path check |
| AC-017-005 | Core resource API calls return data, empty state, or named failure; no unexplained visible `400`. | API smoke |
| AC-017-006 | Dashboard live graphs render from Prometheus when enabled; disabled mode shows setup state. | Local test page DOM + API response |
| AC-017-007 | Every dashboard risk/inventory panel labels data source as live, fixture, or unavailable. | DOM/text audit |
| AC-017-008 | KOMSCO AI Assistant prompt includes active native path, OpsLens action, resource context, evidence, and safety boundary. | Assistant browser test |
| AC-017-009 | Lightspeed path either returns a real answer or precise diagnostic; no fabricated answer. | Assistant API smoke |
| AC-017-010 | `npm run verify:web-shell`, API build, web build, and relevant operator verifier pass before any deployment. | Command output |

## Work Order

### 1. Parity Registry Audit

Update `apps/web/src/consoleParity.ts` so each item carries:

- native function class
- native actions covered
- API source
- OpsLens view status
- visual upgrade target
- assistant context contract
- mutation boundary

Output: an audit table that shows where OpsLens is complete and where it is still a gap.

### 2. Workloads Live Views

Start with the highest-value OpenShift area:

| Native area | 0.1.7 target |
| --- | --- |
| Topology | Graph layout with Deployment, Pod, Service, Route, Job, and CronJob nodes |
| Pods | Status, restart count, node, owner, logs/events/YAML links |
| Deployments | Rollout status, desired/available replicas, ReplicaSet/Pod chain |
| CronJobs | Schedule, suspend state, last schedule, owned Jobs, native create deep link |
| Jobs | Completion status, failed/succeeded pods, owning CronJob |
| HPA | Target, min/max/current replicas, current metrics when available |
| PDB | Allowed disruptions, expected/current healthy, protected workload |

### 3. Dashboard Visual Upgrade

Make the dashboard defensible against "why not just use OpenShift console?"

Required visual proof:

- cluster utilization trends from real Prometheus data
- alert/risk grouping with source labels
- workload health distribution
- topology-linked incident cards
- concise "what changed / what matters / what to ask assistant" workflow

### 4. Assistant Product Behavior

KOMSCO AI Assistant must behave like a real operational assistant:

- keeps chat history
- streams or progressively renders answer state
- supports stop behavior when answering
- preserves scroll position and offers jump-to-latest
- uses rotating suggested prompts as clickable draft starters
- sends current console context to the answer path
- exposes source split only when useful, with technical evidence collapsible

### 5. Verification And Evidence

Before marking 0.1.7 complete:

```text
npm run -w @kugnus/api build
npm run -w @kugnus/web build
npm run verify:web-shell
npm run verify:console-plugin
npm run verify:operator:package
npm run verify:operator:runtime
```

Local browser checks must prove:

- Workloads topology is visual, not a list
- core resource views work without generic 400
- dashboard graphs are real or explicitly unavailable
- assistant context changes when menu/resource changes

## Current Known State From 0.1.6

What is already done:

- ConsolePlugin route and independent OpsLens launch path exist.
- Local test page can render Prometheus-backed utilization graphs when monitoring proxy is enabled.
- OCP 4.21.14 menu registry exists with 37 mapped items.
- Operator package/runtime parity verifiers pass.
- Official OCP console study and parity audit exists.

What is not done:

- Native console functionality is not fully matched.
- Workloads Topology is not yet a real live graph.
- Many native menu items still use generic Resource Explorer behavior.
- Some create/edit actions are only planned as native deep links.
- Assistant answer UX and Lightspeed reliability need hardening.

## Definition Of Done

0.1.7 is done only when a user can open OpsLens locally and see:

1. OpenShift-like navigation that honestly maps native OCP functions.
2. Workloads and Monitoring screens that are visually better than the native baseline.
3. Real live data where available, explicit unavailable state where not.
4. KOMSCO AI Assistant that reacts to the current page/resource context.
5. No fake success, no hidden 400, no mock data pretending to be live.
