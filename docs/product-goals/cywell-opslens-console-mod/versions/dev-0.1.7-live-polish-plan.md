# Dev 0.1.7 True Console Parity + OpsLens Plus Alpha Goal

Status: active goal for the next implementation lane
Branch: `feat/OpsLens-Dev0.1.7`
Base commit: `b090fa13`
Reference target: CRC OpenShift / OpenShift Local `4.21.14`
Minimum supported target: OpenShift Container Platform `4.20`
Forward UX target: OpenShift Container Platform `4.21+`
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

## Compatibility Strategy

Customer environments are expected to include OpenShift Container Platform `4.20`,
so Cywell OpsLens must treat `4.20` as the minimum supported runtime. The Windows
test server lane will be prepared as the `4.20` compatibility target.

The strategic message is:

```text
Cywell OpsLens provides a 4.21-grade operations UX on OCP 4.20 through supported
OpenShift Console dynamic plugin extension points.
```

This does not mean backporting or modifying Red Hat console internals. It means
using OCP `4.20`-available ConsolePlugin, console dynamic plugin SDK behavior,
Kubernetes APIs, and OpenShift APIs to implement OpsLens-owned operational
features inspired by the `4.21` console direction.

| Compatibility rule | Product decision |
| --- | --- |
| Minimum runtime | OCP `4.20` |
| Development/reference cluster | CRC/OpenShift Local `4.21.14` until Windows `4.20` test server is ready |
| Forward target | OCP `4.21+` UX direction |
| API dependency rule | Do not require `4.21`-only APIs for baseline behavior |
| Feature detection | Detect optional APIs/features and degrade gracefully |
| Unsupported boundary | No original console DOM injection or console image replacement |

Official `4.21` release-note items that inform the OpsLens direction:

| OCP 4.21 direction | OpsLens 4.20-compatible interpretation |
| --- | --- |
| OLM v1 software catalog preview in the web console | Operator Health Lens and Catalog Advisor using OLM Classic/available APIs first |
| Console impersonation improvements for multiple group memberships | RBAC Lens explaining effective access and denial reasons |
| Code Editor theme/font customization | YAML Explain Editor with readability, diff preview, risk highlighting, and explain/fix suggestions |
| ConsoleLink `mailto:` support | Operations contact/report links for mail, Slack, Jira, and ServiceNow-style handoff |
| Console plugin routing stability improvements | Stable OpsLens deep links that survive direct URL entry and refresh |

Sources:

- OCP 4.20 Web Console documentation: https://docs.redhat.com/en/documentation/openshift_container_platform/4.20/html-single/web_console/index
- OCP 4.21 Release Notes: https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html-single/release_notes/index

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
   - Pods, Deployments, DeploymentConfigs, StatefulSets, DaemonSets, ReplicaSets,
     ReplicationControllers, Jobs, CronJobs, HPA, and PDB must expose useful
     list/detail state.
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

6. Keep the baseline OCP 4.20-compatible.
   - Do not depend on `4.21`-only APIs for required flows.
   - Where `4.21+` features exist, expose them as optional enhancements.
   - The Windows `4.20` test server must become the compatibility proof target.

### Must Not Do

- Do not claim 1:1 parity because a menu item exists.
- Do not hide missing functionality behind generic Resource Explorer cards.
- Do not display fixture/mock data as live cluster status.
- Do not mutate cluster resources unless RBAC, allowlist, human approval, and audit contract are present.
- Do not use unsupported console DOM injection.
- Do not deploy a new image until the local test page proves the behavior.
- Do not market OLM v1 Software Catalog support on OCP `4.20`; provide Operator/Catalog analysis instead.

## Acceptance Criteria

| ID | Pass / Fail Rule | Evidence |
| --- | --- | --- |
| AC-017-001 | Every native OCP menu item has one honest class: live view, native deep link, plan-only assistant, or explicit gap. | Parity registry audit and visible UI labels |
| AC-017-002 | Workloads / Topology renders graph nodes and edges from live Pods, Services, Routes, DeploymentConfigs, Deployments, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, HPA, PDB, Jobs, and CronJobs when available. | Browser DOM check and screenshot |
| AC-017-003 | Pods, Deployments, DeploymentConfigs, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, Jobs, CronJobs, HPA, and PDB expose list/detail/evidence state, not only a generic card. | Resource API smoke and browser check |
| AC-017-004 | Native create/edit/delete flows use OpenShift native deep links or approval-gated actions; no fake create UI. | Click-path check |
| AC-017-005 | Core resource API calls return data, empty state, or named failure; no unexplained visible `400`. | API smoke |
| AC-017-006 | Dashboard live graphs render from Prometheus when enabled; disabled mode shows setup state. | Local test page DOM + API response |
| AC-017-007 | Every dashboard risk/inventory panel labels data source as live, fixture, or unavailable. | DOM/text audit |
| AC-017-008 | KOMSCO AI Assistant prompt includes active native path, OpsLens action, resource context, evidence, and safety boundary. | Assistant browser test |
| AC-017-009 | Lightspeed path either returns a real answer or precise diagnostic; no fabricated answer. | Assistant API smoke |
| AC-017-010 | `npm run verify:web-shell`, API build, web build, and relevant operator verifier pass before any deployment. | Command output |
| AC-017-011 | Baseline features run on OCP `4.20` or are explicitly marked optional for `4.21+`. | Compatibility matrix and Windows 4.20 test evidence |

## Current 0.1.7 Implementation Evidence

This section records completed implementation evidence for the current 0.1.7
lane. It is intentionally separate from the target scope so the remaining gap is
visible.

| Area | Current result | Evidence |
| --- | --- | --- |
| Workloads / Topology | Implemented as a real read-only graph surface instead of a generic resource card. | `GET /api/ocp/topology` reads Pods, Services, Routes, DeploymentConfigs, Deployments, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, HPA, PDB, Jobs, and CronJobs and renders selector, ownerReference, scaleTargetRef, disruption-budget, job-owner, and route target edges. Partial resource read failures are preserved as named topology gaps instead of disappearing silently. |
| Topology browser proof | Local test page opens the Workloads / Topology screen and renders live graph nodes and edges. | Browser check on `127.0.0.1:5173` rendered `123` visible graph nodes and `58` visible edges after the graph cap was applied. |
| Resource API failure handling | Generic visible `400` failures were replaced with named failure categories and normal list/detail/page response envelopes. | Backend returns empty/named-failure data for unsupported, RBAC-denied, blocked, upstream-failed, detail-get, and continue-page paths; browser check on Builds showed no visible error and no `failed with 400`. Current local API smoke returned HTTP `200` for `v1/pods`, `v1/namespaces`, and `build.openshift.io/v1/buildconfigs`; `buildconfigs` returned an empty list rather than a `400`. |
| Metadata fallback | List calls can recover from metadata-list failure by retrying JSON list mode before failing. | `listOcpResource` records `JSON list fallback succeeded` when fallback is used. |
| Preferred API order | Resource presets now honor the requested order instead of whatever discovery returns first. | `findPreferredResourceInOrder` selects BuildConfig/Build/ImageStream-style presets deterministically. |
| Menu support classification | Every native console menu item now carries a visible support class. | `coverageClass` maps items to `Live View`, `Native Deep Link`, `Plan-only`, or `Gap`; the parity matrix and active action panel render the class. |
| Workloads resource lens | Workload resource presets now show an OpsLens-owned status lens above the raw resource table. | Pods, DeploymentConfigs, Deployments, StatefulSets, DaemonSets, ReplicaSets, ReplicationControllers, Jobs, CronJobs, HPA, and PDB expose health distribution, selected object signal, owner/child relation, and next-check chips in `ocp-workload-lens`. |
| Dashboard source labels | Dashboard now separates OpsLens risk data source, native console API source, Prometheus source, and per-panel source labels. | `opslens-dashboard-source-label`, `opslens-console-source-label`, and panel-level source labels expose live/fixture/unavailable state instead of leaving risk/inventory cards ambiguous. |
| Dashboard decision flow | Dashboard now visualizes the product value above native parity by turning console signals into OpsLens correlation, operator decision, and assistant handoff. | Browser check rendered `opslens-dashboard-decision-flow` with `4` steps, `data-source=live`, live console signal count, risk signal count, top decision, and suggested assistant question. |
| Compatibility boundary UI | The parity matrix now shows the OCP `4.20` minimum runtime, the `4.21.14` reference inventory, and pending Windows `4.20` validation. | Browser DOM check showed `console-compatibility-boundary` with minimum/runtime/proof text and `37` visible parity class entries. |
| OCP 4.20 preflight | A local compatibility verifier now checks the parity registry before deployment and writes per-item runtime/API evidence. | `npm run verify:ocp:420-compatibility` evaluates `37` console items and `26` API versions against the OCP `4.20` API allowlist, writing `test-results/cywell-opslens-ocp420-compatibility.json` with `itemCompatibility`, branch, head, and base ref stamping. This is a pre-deployment gate; Windows CRC `4.20` runtime proof is still required. |
| OCP 4.20 live-readiness gate | A non-mutating strict verifier now defines the exact Windows CRC `4.20` proof command. | `npm run verify:ocp:420-live-readiness` requires an `oc` context, `clusterversion` minor `4.20`, healthy console operator, ConsolePlugin CRD, and discovery for every parity API version. `npm run verify:ocp:420-live-readiness:preview` can be used on the current reference cluster without claiming completion. |
| Local verification | Current local build and web-shell contract pass. | `@kugnus/contracts`, `@kugnus/api`, and `@kugnus/web` builds pass; latest `npm run verify:web-shell` pass records the active check count. |

## Parallel Review Setup

The 0.1.7 lane uses three independent review lanes before deployment. These are
not product UI features; they are engineering review scopes that keep the work
from drifting back into "menu label exists, therefore complete" thinking.

| Review lane | Scope | Required output |
| --- | --- | --- |
| Compatibility reviewer | OCP `4.20`/`4.21` matrix, official-doc boundary, and menu support classification. | PASS/WEAK/MISSING audit with exact file references. |
| Runtime reviewer | Workloads implementation, topology graph, Resource API named failure behavior, and removal of unexplained `400`. | PASS/WEAK/MISSING audit with exact file references. |
| Product reviewer | Dashboard source labeling, decision-flow visualization, and whether the proof is customer-facing rather than developer-task noise. | PASS/WEAK/MISSING audit with exact file references. |

Current execution note: three parallel explorer agents were spawned against the
current `feat/OpsLens-Dev0.1.7` worktree for those review lanes. Their findings
must be reconciled before 0.1.7 is called complete.

Remaining before calling 0.1.7 complete:

- Continue replacing generic Resource Explorer screens with purpose-built native parity
  views. The first Workloads lens is in place, but create/edit/delete remains
  native deep link or approval-gated and deeper per-kind detail views are still
  required.
- Continue upgrading the main dashboard beyond the first decision-flow panel
  into richer native-console metric visualization.
- Prove the baseline on the Windows OCP `4.20` CRC test server.
- Deploy only after the local test page proves the next behavior slice.
- Keep `npm run verify:ocp:420-compatibility` green before creating any Windows CRC `4.20` deployment artifact.
- Run `npm run verify:ocp:420-live-readiness` against the Windows CRC `4.20` cluster before calling the compatibility item complete.

## Work Order

### 0. OCP 4.20 Compatibility Matrix

Before deep feature work, create a compatibility matrix that separates baseline
features from optional `4.21+` convenience features.

| Feature | 4.20 baseline | 4.21+ enhancement |
| --- | --- | --- |
| ConsolePlugin entry | Required | Same path, improved routing where available |
| Operator/Catalog analysis | OLM Classic, Subscription, InstallPlan, CSV, CatalogSource | OLM v1 software catalog preview as optional context |
| RBAC Lens | SelfSubjectAccessReview / SubjectAccessReview and RBAC resource reads | Multi-group impersonation-inspired troubleshooting UX |
| YAML Explain Editor | Read/analyze/diff/plan only | Editor preference parity where available |
| Deep links | OpsLens internal router must survive refresh/direct URL | Align with improved console plugin routing behavior |

Pre-deployment check:

```text
npm run verify:ocp:420-compatibility
npm run verify:ocp:420-live-readiness:preview
npm run verify:ocp:420-live-readiness
```

The compatibility command does not replace a live Windows CRC `4.20` run. It
catches accidental use of non-baseline API versions in the parity registry before
an image is built or pushed. The `preview` live-readiness command is for the
current reference cluster; the strict live-readiness command is the actual
Windows CRC `4.20` proof gate.

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
| Topology | Graph layout with Pod, Service, Route, DeploymentConfig, Deployment, StatefulSet, DaemonSet, ReplicaSet, ReplicationController, HPA, PDB, Job, and CronJob nodes |
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
- baseline behavior is not tied to OCP `4.21`-only APIs

### 6. 4.20-Inspired Plus Alpha Features

The first OpsLens-owned features that justify the product on an OCP `4.20`
customer cluster are:

| Feature | Why it matters | Initial boundary |
| --- | --- | --- |
| RBAC Lens | Explains why a user can or cannot see/do something. | Read-only access check and explanation first. |
| Operator Health Lens | Summarizes Subscription, InstallPlan, CSV, and CatalogSource failure points. | Read-only diagnosis first. |
| YAML Explain Editor | Finds risky manifest fields before apply. | No apply in PoC; explain/fix/diff only. |
| Troubleshooting Timeline | Connects Deployment, Pod, Service, Route, and Event chronology. | Read-only incident reconstruction. |
| Stable Deep Link Routing | Makes OpsLens feel like a real console app, not a fragile panel. | Refresh/direct URL/share-link safe routing. |

## Current Known State In 0.1.7

What is already done:

- ConsolePlugin route and independent OpsLens launch path exist.
- Local test page can render Prometheus-backed utilization graphs when monitoring proxy is enabled.
- OCP 4.21.14 menu registry exists with 37 mapped items.
- Operator package/runtime parity verifiers pass.
- Official OCP console study and parity audit exists.
- OCP `4.20` minimum support strategy is now locked for the Windows test server lane.
- Workloads / Topology now renders a real read-only graph from live API evidence when available.
- Core resource list failures now return data/empty/named failure envelopes instead of unexplained visible `400`.
- Dashboard source labels separate OpsLens risk, native console API, and Prometheus availability.

What is not done:

- Native console functionality is not fully matched.
- Many non-Workloads native menu items still use generic Resource Explorer or native deep-link behavior.
- Some create/edit actions are only planned as native deep links.
- Assistant answer UX and Lightspeed reliability need hardening.
- OCP `4.20` compatibility has not yet been proven on the Windows test server.

## Definition Of Done

0.1.7 is done only when a user can open OpsLens locally and see:

1. OpenShift-like navigation that honestly maps native OCP functions.
2. Workloads and Monitoring screens that are visually better than the native baseline.
3. Real live data where available, explicit unavailable state where not.
4. KOMSCO AI Assistant that reacts to the current page/resource context.
5. No fake success, no hidden 400, no mock data pretending to be live.
6. Baseline value works on OCP `4.20`, while `4.21+` conveniences are optional enhancements.

## Report Sentence

Use this positioning when explaining the product strategy:

```text
설치 대상 고객사의 OpenShift 버전이 4.20일 가능성이 높으므로, Cywell OpsLens는
OCP 4.20을 최소 지원 버전으로 설계한다. 다만 OCP 4.21에서 강화된 Software
Catalog, RBAC impersonation, 코드 에디터 개선, 플러그인 라우팅 안정화 방향을
분석하여, 해당 UX를 OpsLens 자체 기능으로 선제 구현한다. 이를 통해 고객사는
플랫폼 업그레이드 전에도 4.21 수준의 운영 보조 경험을 일부 활용할 수 있다.
```
