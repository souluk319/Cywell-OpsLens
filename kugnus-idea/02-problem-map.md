# 02. Problem Map

## 문제 정의

OpenShift 운영 AI assistant가 진짜 제품이 되려면 "질문하면 답한다"를 넘어야 한다. 현재 Lightspeed류 assistant에서 부족하다고 보는 문제는 다음 네 축이다.

1. 대시보드 없음
2. BYOK/BYOM 또는 좁은 RAG에 의존
3. 화면을 가리는 UI/UX
4. 운영 제품으로서의 governance/evaluation 부족

## 문제 1. Dashboard 부재

### 현상

사용자는 assistant를 열기 전에 이미 alert page, monitoring, workload, event, log, YAML, GitOps 화면을 돌아다니며 증거를 수집해야 한다.

### 왜 문제인가

| 영향 | 설명 |
|---|---|
| 질문 품질 저하 | 사용자가 어떤 alert를 물어봐야 하는지 먼저 알아야 한다. |
| 반복 작업 증가 | 같은 cluster 상태를 매번 사람이 요약해야 한다. |
| 장애 우선순위 판단 지연 | severity, affected resources, recent change가 한 곳에 없다. |
| AI 제품 가치 축소 | assistant가 proactive 운영 도구가 아니라 passive Q&A가 된다. |

### 해결 방향

| 기능 | 내용 |
|---|---|
| Active Risk Dashboard | firing alerts, degraded operators, pending/crashloop pods, quota pressure를 우선순위화 |
| Blast Radius View | namespace, workload, route, node, storage 영향 범위 표시 |
| Recent Change Correlation | rollout, image tag, GitOps commit, config change와 alert 연결 |
| Knowledge Health | RAG index freshness, stale docs, missing runbook 표시 |
| Model/Cost Health | provider status, latency, token, failure, fallback 표시 |

## 문제 2. BYOK/BYOM과 좁은 RAG 의존

### 현상

사용자가 모델 key, provider, knowledge source를 직접 가져와야만 의미 있는 답변이 나온다면, 제품의 기본 가치가 약해진다.

### 왜 문제인가

| 영향 | 설명 |
|---|---|
| 도입 장벽 | 고객이 LLM provider와 key를 먼저 결정해야 한다. |
| 지식 파편화 | 공식 문서, 사내 문서, cluster state, GitOps 변경점이 따로 논다. |
| 답변 신뢰도 하락 | citation과 source trust가 없으면 일반론 답변이 된다. |
| 운영 책임 모호 | 어느 데이터가 어떤 모델로 나갔는지 추적하기 어렵다. |

### 해결 방향

BYOK/BYOM은 옵션으로 두되, 제품은 다음을 기본 구조로 제공해야 한다.

| 계층 | 기본 제공 |
|---|---|
| Official Knowledge | OpenShift docs, release notes, known troubleshooting guide metadata |
| Customer Knowledge | runbook, SOP, 고객사 정책 문서, Wiki/Docs connector |
| Live Cluster Context | alerts, events, pods, operators, nodes, routes, metrics summary |
| Change Context | GitOps repo, Argo CD app, image tag, rollout history |
| Incident Memory | resolved conversations, postmortems, ticket summaries |

## 문제 3. 화면을 가리는 UI/UX

### 현상

assistant panel이 오른쪽 overlay로 열리면 alert table의 `심각도`, `합계`, `상태`, log, event, YAML 같은 핵심 evidence를 가린다.

### 핵심 원칙

```text
The assistant should not obscure the evidence it is supposed to help interpret.
```

### 왜 문제인가

| 영향 | 설명 |
|---|---|
| 인지 부하 증가 | 사용자는 패널을 열고 닫으며 화면을 기억해야 한다. |
| troubleshooting 흐름 끊김 | 답변과 evidence를 동시에 비교할 수 없다. |
| 운영 도구 신뢰도 하락 | 보조 도구가 업무를 막는 느낌을 준다. |
| 접근성/반응형 위험 | 작은 화면이나 넓은 table에서 문제가 더 커진다. |

### 해결 방향

| 우선순위 | 기능 | 설명 |
|---|---|---|
| P0 | Minimize/Collapse | 대화 상태를 유지하고 패널을 접는다. |
| P0 | Resizable panel | splitter로 폭/높이를 조정하고 마지막 크기를 기억한다. |
| P1 | Inline dock | 본문을 덮지 않고 layout을 나눠 쓴다. |
| P1 | Bottom mode | wide table, log, event 화면에서 하단에 dock한다. |
| P2 | Detached window | 별도 창으로 분리하되 context sync를 유지한다. |
| P2 | Peek mode | 누르고 있는 동안 투명도/click-through로 뒤 화면을 확인한다. |

## 문제 4. Governance / Evaluation 부족

### 현상

AI 답변이 좋아 보여도 다음이 없으면 운영 제품이 아니다.

| 필요한 것 | 이유 |
|---|---|
| audit log | 누가 어떤 context와 source로 답변을 받았는지 추적 |
| RBAC enforcement | 사용자가 볼 수 없는 리소스를 AI도 보면 안 됨 |
| Secret redaction | prompt/data egress 보안 |
| quota/cost dashboard | provider별 비용과 rate limit 관리 |
| evaluation set | 답변 regression과 hallucination 관리 |
| source conflict detection | 공식 문서와 사내 runbook 충돌 감지 |

## 문제 5. Context Sync 부족

### 현상

assistant는 사용자가 현재 어느 namespace, workload, alert, tab, YAML을 보고 있는지 알아야 한다. 이를 모르면 질문은 항상 사용자가 수동으로 설명해야 한다.

### 해결 방향

console plugin은 다음 context를 publish해야 한다.

| context | 예시 |
|---|---|
| route | `/k8s/ns/prod/pods/api-7d9` |
| namespace | `prod` |
| resource | `Pod/api-7d9`, `Deployment/api` |
| selected tab | Details, YAML, Events, Logs |
| filters | alert source, state, severity |
| visible rows | 현재 table에 보이는 alert/workload 목록 |
| user permission | RBAC scoped access summary |

