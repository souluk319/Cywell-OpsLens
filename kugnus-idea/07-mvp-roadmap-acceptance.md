# 07. MVP Roadmap and Acceptance Criteria

## MVP 목표

첫 MVP는 "OpenShift 운영 화면을 가리지 않는 context-aware assistant"와 "운영 dashboard/RAG/audit의 최소 골격"을 증명한다.

## MVP 범위

| 포함 | 제외 |
|---|---|
| Console Plugin 진입점 | 자동 remediation |
| Dashboard skeleton | full multi-cluster 관리 |
| Alerts/Pods/Events context fetch | Secret fetch |
| Inline/resizable assistant | 완전한 모바일 앱 |
| 기본 RAG source 2종 | 모든 문서 connector |
| Audit log | 복잡한 billing |
| EvaluationSet 20개 | 완전 자동 평가 운영 |

## Phase 0. Prototype

| 항목 | 완료 조건 |
|---|---|
| UI shell | OpenShift console plugin처럼 보이는 dashboard와 assistant mock |
| Non-occluding UX | inline dock, resize, minimize 동작 |
| Mock context | alert table context chip 표시 |
| Mock answer | evidence-first 답변 레이아웃 |

## Phase 1. MVP

| 항목 | 완료 조건 |
|---|---|
| OpenShift API read-only | alerts, pods, events, namespaces 조회 |
| Context publisher | 현재 route/resource/filter를 backend에 전달 |
| RAG v1 | markdown/git source ingest, pgvector/BM25 search |
| Chat API | context + RAG 기반 답변 |
| Audit v1 | request/source/model/token 기록 |
| RBAC v1 | 사용자 권한 밖 namespace context 제외 |
| Evaluation v1 | golden scenario 20개 pass/fail 리포트 |

## Phase 2. Beta

| 항목 | 완료 조건 |
|---|---|
| Knowledge Admin | source 추가/상태/재색인 UI |
| Dashboard v2 | risk priority, recent change correlation |
| Model Gateway | provider routing, fallback, quota |
| Detached window | session context sync |
| Runbook candidate | conversation을 runbook 초안으로 저장 |
| Feedback loop | thumbs down이 evaluation backlog로 들어감 |

## Phase 3. GA

| 항목 | 완료 조건 |
|---|---|
| Operator lifecycle | 설치/업그레이드/백업/복구 문서화 |
| Multi-tenant policy | tenant/project별 source/RBAC 격리 |
| Advanced evaluation | nightly regression dashboard |
| Support bundle | 장애 분석용 bundle export |
| Security review | redaction, audit, egress policy 검증 |
| Marketplace packaging | Software Catalog/OperatorHub 제출 가능 수준 |

## Acceptance Criteria

| 영역 | Pass 기준 | 측정 방법 | Evidence |
|---|---|---|---|
| UI 가림 방지 | Alerts page에서 assistant open 상태여도 severity/count/status 확인 가능 | screenshot diff | Playwright screenshot |
| Resize | assistant 폭/높이 조정과 마지막 크기 저장 | e2e test | localStorage/API state |
| Context sync | route, namespace, resource, filters가 context chip에 표시 | e2e test | payload snapshot |
| RBAC | 권한 없는 namespace data가 context/RAG에 포함되지 않음 | two-user test | audit log |
| RAG citation | 핵심 주장 80% 이상 citation 연결 | answer audit | citation report |
| Secret redaction | token/password/secret pattern이 prompt/model payload에서 제거 | unit/integration test | redaction report |
| Dashboard | active alert queue가 severity/blast radius 기준으로 정렬 | fixture replay | dashboard screenshot |
| Evaluation | golden scenario 20개 이상 pass/fail 기록 | CI job | evaluation dashboard |
| Audit | 모든 chat request가 source/model/token/context hash와 저장 | API/db check | audit export |

## Demo Scenario

### Scenario A. ClusterNotUpgradeable

```text
1. Alerts page에 ClusterNotUpgradeable alert가 firing.
2. Dashboard가 우선순위 상단에 표시.
3. 사용자가 Ask Kugnus 클릭.
4. Assistant가 bottom dock으로 열리고 alert list snapshot attach.
5. 답변:
   - 현재 판단
   - 확인한 evidence
   - operator 상태 확인 명령
   - 관련 OpenShift update docs
   - 사내 upgrade runbook
   - missing evidence
```

### Scenario B. Pod CrashLoopBackOff

```text
1. Pod detail Logs tab에서 Ask Kugnus.
2. Context chips: namespace, pod, container, logs tab.
3. Assistant가 events와 previous logs를 read-only 조회.
4. 원인 후보와 확인 명령 제시.
5. patch diff는 생성하되 apply는 하지 않음.
```

### Scenario C. RAG Stale Source

```text
1. 사용자가 오래된 runbook 기반 질문.
2. 답변에 "이 문서는 stale" 경고 표시.
3. Knowledge Health dashboard에 stale source 표시.
4. owner에게 review task 생성 가능.
```

