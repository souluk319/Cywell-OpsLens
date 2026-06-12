# 01. Product Vision

## 제품명

Working title: **Kugnus OCP Guide Assistant**

대체 후보:

| 이름 | 느낌 |
|---|---|
| Kugnus Ops Guide | 운영 가이드 중심 |
| Kugnus OCP Copilot | console assistant 중심 |
| Kugnus Cluster Navigator | cluster 탐색/진단 중심 |
| Kugnus Runbook AI | 사내 runbook/RAG 중심 |

## 목표

OpenShift 운영자가 다음 질문에 더 빨리, 더 안전하게 답하도록 돕는다.

1. 지금 cluster에서 실제로 문제가 되는 것은 무엇인가?
2. 어떤 리소스, namespace, workload가 영향을 받는가?
3. 최근 변경점과 관련이 있는가?
4. 공식 문서와 사내 runbook 기준으로 무엇을 확인해야 하는가?
5. 다음 조치는 무엇이며, 위험과 rollback path는 무엇인가?
6. 이 판단의 근거는 어디에 남는가?

## 제품 포지셔닝

Kugnus OCP Guide Assistant는 "채팅창"이 아니라 OpenShift 운영 cockpit이다.

| 구분 | 일반 챗봇 | Kugnus OCP Guide Assistant |
|---|---|---|
| 시작점 | 사용자가 질문 입력 | dashboard가 active risk와 context를 먼저 보여줌 |
| 지식 | LLM 일반 지식 또는 제한된 문서 | 공식 문서 + 사내 runbook + GitOps + live cluster + incident memory |
| UI | floating overlay | inline dock, resizable, bottom mode, detached window |
| 답변 | 자연어 설명 | 근거, confidence, missing evidence, command, rollback, risk |
| 운영성 | 개별 대화 | audit, evaluation, quota, model routing, runbook 개선 |
| 보안 | provider/token 설정 중심 | RBAC, redaction, tenant isolation, data egress policy |

## 주요 사용자

| 사용자 | Pain | 제품 가치 |
|---|---|---|
| Cluster Admin | alert가 많고 우선순위 판단이 어려움 | active risk dashboard와 AI triage |
| SRE/운영자 | 로그, 이벤트, YAML, runbook을 오가야 함 | 현재 화면 context 기반 답변 |
| Platform Engineer | 반복 장애 대응이 문서화되지 않음 | 대화에서 runbook candidate 생성 |
| 보안/감사 담당 | AI가 어떤 데이터를 봤는지 추적 어려움 | audit log, source trace, redaction |
| 고객사 운영팀 | 사내 표준과 공식 문서가 섞여 혼란 | source trust와 policy 기반 답변 |

## North Star

운영자가 문제 화면을 떠나지 않고, 증거를 잃지 않고, 3분 안에 다음 확인 단계와 근거를 얻는다.

## 차별점

1. **Dashboard-first**: 대화창보다 운영 상황판이 먼저다.
2. **Evidence-first answer**: 답변은 항상 본 evidence를 보여준다.
3. **Non-occluding UX**: assistant가 console evidence를 가리지 않는다.
4. **Operational RAG**: RAG는 문서 검색이 아니라 운영 지식 공급망이다.
5. **Governed AI**: 비용, 권한, 감사, 평가를 제품 기능으로 제공한다.
6. **Runbook flywheel**: 좋은 대화는 runbook과 evaluation set으로 승격된다.

## 하지 않을 것

| 제외 | 이유 |
|---|---|
| 초기부터 자동 apply/delete/scale 실행 | 운영 책임과 보안 경계가 커진다. |
| 모든 cluster 데이터를 AI에 자동 전송 | Secret, token, 고객 데이터 노출 위험이 있다. |
| LLM 답변만으로 장애 원인 확정 | 근거 부족 시 missing evidence를 표시해야 한다. |
| floating overlay만 제공 | 사용자가 보고 있는 evidence를 가릴 수 있다. |
| BYOK/BYOM만 전제로 설계 | 고객 도입 장벽이 커지고 제품성이 약해진다. |

