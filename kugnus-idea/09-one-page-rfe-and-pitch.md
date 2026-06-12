# 09. One Page RFE and Pitch

## 한 줄 pitch

Kugnus OCP Guide Assistant는 OpenShift 운영자가 문제 화면을 떠나지 않고, live cluster context와 사내 runbook을 근거로 안전한 조치안을 얻을 수 있게 하는 dashboard-first 운영 AI assistant다.

## 문제

현재 OpenShift AI assistant류 경험은 다음 한계가 있다.

1. 대시보드가 약해 운영자가 먼저 문제를 발견하고 정리해야 한다.
2. BYOK/BYOM 또는 제한된 RAG에 의존해 실제 고객 환경과 사내 표준이 답변에 충분히 반영되지 않는다.
3. floating popover UI가 alert table, log, event, YAML 같은 troubleshooting evidence를 가린다.
4. 답변의 근거, 비용, 권한, 감사, 평가가 제품 기능으로 충분히 드러나지 않는다.

## 해결

Kugnus는 다음을 제공한다.

| 해결 | 내용 |
|---|---|
| Dashboard-first | active risk, alert priority, blast radius, recent change, knowledge health |
| Context-aware chat | 현재 route, namespace, resource, filter, tab을 자동 context화 |
| Non-occluding UX | inline dock, resizable, bottom mode, detached window, minimize |
| Operational RAG | official docs, internal runbooks, customer docs, GitOps, live cluster, incident memory |
| Governance | RBAC, redaction, audit, quota, model routing, data egress policy |
| Evaluation | golden scenario, citation audit, regression dashboard |

## 핵심 UX 문장

```text
The assistant should not obscure the evidence it is supposed to help interpret.
```

한국어:

```text
보조 도구는 사용자가 해석해야 할 증거 화면을 가리면 안 된다.
```

## 제품 차별점

| 기존 assistant류 | Kugnus |
|---|---|
| 챗봇 중심 | dashboard + assistant |
| 질문 수동 입력 | 현재 console context 자동 첨부 |
| 일반 답변 | evidence-first 답변 |
| overlay popover | non-occluding dock system |
| 좁은 RAG | 운영 지식 공급망 |
| 품질 확인 어려움 | evaluation/audit dashboard |

## MVP 성공 기준

1. Alerts page에서 assistant를 열어도 severity/count/status가 가려지지 않는다.
2. 현재 namespace/resource/filter가 context chip으로 표시된다.
3. alert/pod/event 기반 질문에 citation이 있는 답변을 제공한다.
4. Secret과 권한 없는 namespace data가 모델 payload에 들어가지 않는다.
5. 모든 답변이 audit log에 source/model/token/context hash와 남는다.
6. golden scenario 20개 이상을 pass/fail로 검증한다.

## RFE 문구

```text
OpenShift operational assistants should provide a non-occluding, context-aware workflow. Users need to inspect alert tables, logs, events, YAML, and workload details while asking for help. A fixed floating chat popover can obscure the evidence required for troubleshooting. The assistant surface should support inline dock, resizing, minimize, bottom mode, detached window with context sync, and explicit context chips.
```

## 내부 개발 문구

```text
우리가 만들 제품은 Lightspeed를 따라가는 챗봇이 아니다.
운영자가 현재 보는 증거 화면을 보존하고, cluster state와 사내 지식을 결합해 검증 가능한 판단을 제공하는 OCP 운영 cockpit이다.
```

