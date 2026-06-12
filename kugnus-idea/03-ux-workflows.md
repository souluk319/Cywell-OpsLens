# 03. UX Workflows

## UX 원칙

| 원칙 | 설명 |
|---|---|
| Evidence stays visible | assistant가 해석해야 할 화면을 가리지 않는다. |
| Context is explicit | AI가 어떤 cluster/namespace/resource를 보고 있는지 context chip으로 보여준다. |
| Ask from where you are | 사용자는 현재 console 화면에서 바로 질문할 수 있어야 한다. |
| Answer is inspectable | 답변은 근거, 명령어, 위험, missing evidence를 함께 표시한다. |
| Conversation becomes knowledge | 좋은 대화는 runbook/evaluation/ticket으로 승격된다. |

## 주요 화면

### 1. Operations Dashboard

첫 화면은 질문창이 아니라 운영 상황판이다.

| 영역 | 표시 정보 | 사용 행동 |
|---|---|---|
| Active Incident Queue | firing alerts, severity, affected namespace, duration | Ask, open evidence, create note |
| Cluster Health | operators, nodes, workloads, routes, storage | drill down, compare |
| Risk Radar | crashloop, pending, quota, image pull, certificate | triage checklist |
| Recent Changes | rollout, GitOps sync, image tag, config change | correlate |
| Knowledge Health | stale docs, failed index, missing runbook | re-index, assign owner |
| Model Health | provider, latency, tokens, failures, fallback | route policy |

### 2. Assistant Dock

기본은 inline dock이다. floating overlay는 보조 모드로만 둔다.

| 모드 | 용도 |
|---|---|
| Inline right dock | 일반 상세 화면 |
| Bottom dock | table, log, event, YAML처럼 가로폭이 중요한 화면 |
| Left dock | 오른쪽 컬럼이 핵심인 table 화면 |
| Detached window | 멀티 모니터, 긴 분석 세션 |
| Compact chip | 대화는 유지하고 화면을 최대한 확보 |

### 3. Context Chips

Assistant 상단에는 AI가 보고 있는 context를 명시한다.

예시:

```text
Cluster: prod-ocp
Namespace: openshift-monitoring
Page: Alerts
Filters: source=platform, state=firing
Visible alerts: 6
Attached: Alert list snapshot, selected alert details
RBAC: admin
```

사용자는 chip을 제거하거나 추가 attach를 할 수 있어야 한다.

## 사용자 흐름 1. Alert Triage

```text
1. 사용자가 Alerts dashboard를 연다.
2. Active Incident Queue가 firing alerts를 severity와 blast radius로 정렬한다.
3. 사용자가 ClusterNotUpgradeable를 클릭한다.
4. Assistant가 inline bottom dock으로 열리고 alert context를 자동 첨부한다.
5. 답변은 다음 구조로 표시된다.
   - 현재 판단
   - 확인한 evidence
   - 가장 가능성 높은 원인 후보
   - 다음 확인 명령
   - 관련 공식 문서/사내 runbook
   - 위험/rollback
6. 사용자는 답변을 incident note 또는 runbook candidate로 저장한다.
```

## 사용자 흐름 2. Pod CrashLoopBackOff

```text
1. 사용자가 Pod detail page에서 Logs tab을 보고 있다.
2. Assistant가 현재 namespace/pod/container/log tail을 context로 인식한다.
3. 사용자가 "왜 재시작하지?"라고 묻는다.
4. Assistant는 events, previous logs, deployment, image, config, resource limit을 read-only로 확인한다.
5. 답변은 원인 후보를 순위화하고 확인 명령을 제시한다.
6. 자동 수정은 하지 않고 patch diff 초안만 생성한다.
```

## 사용자 흐름 3. GitOps 변경과 장애 연결

```text
1. Alert 발생 직전 Argo CD sync와 image tag 변경이 있었다.
2. Dashboard가 recent change correlation을 표시한다.
3. Assistant가 alert + rollout history + Git commit summary를 evidence pack으로 만든다.
4. 답변은 "변경 후 발생 가능성"을 confidence와 함께 표시한다.
5. rollback path와 확인 명령을 제시한다.
```

## 사용자 흐름 4. 지식 운영

```text
1. 운영자가 반복되는 질문을 본다.
2. 답변이 사내 runbook에 없는 절차를 포함한다.
3. "Promote to runbook candidate"를 누른다.
4. owner, scope, expiry, source links를 지정한다.
5. 승인 후 RAG index에 반영된다.
6. 같은 유형 질문의 citation 품질이 올라간다.
```

## Assistant 답변 레이아웃

모든 운영 답변은 다음 구조를 따른다.

| 블록 | 내용 |
|---|---|
| 현재 판단 | 한두 문장 요약 |
| 확인한 evidence | alert/event/log/YAML/doc source 목록 |
| 원인 후보 | confidence와 이유 |
| 다음 확인 | 안전한 read-only command 또는 console link |
| 조치안 | plan, patch draft, rollback path |
| 위험 | 권한, downtime, data loss, unknowns |
| 근거 | official docs, runbook, cluster snapshot citations |
| missing evidence | 아직 보지 못한 정보 |

## UI Acceptance Criteria

| 항목 | Pass 기준 |
|---|---|
| Alerts page | assistant open 상태에서도 severity/count/status가 보인다. |
| Logs page | log viewport가 assistant 때문에 50% 이하로 줄지 않는다. |
| YAML page | YAML text selection과 copy가 assistant 때문에 막히지 않는다. |
| Minimize | 대화 draft와 history가 유지된다. |
| Resize | 마지막 크기가 사용자 단위로 저장된다. |
| Detached | 새 창에서도 context chips가 유지된다. |
| Mobile/narrow | 명확한 full-screen assistant mode로 전환하고 evidence attach 상태를 표시한다. |

