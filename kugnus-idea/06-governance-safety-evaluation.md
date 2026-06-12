# 06. Governance, Safety, Evaluation

## 목표

Kugnus는 운영 제품이다. 따라서 답변 품질만이 아니라 보안, 권한, 비용, 감사, 평가가 제품 핵심 기능이어야 한다.

## Security 원칙

| 원칙 | 설명 |
|---|---|
| RBAC first | 사용자의 OpenShift 권한 범위를 넘는 context를 사용하지 않는다. |
| No silent sensitive data egress | Secret, token, password, customer restricted data는 명시 없이 외부 model provider로 보내지 않는다. |
| Read-only default | 초기 버전은 분석과 plan 생성만 수행한다. |
| Evidence traceability | 답변에 사용한 source와 cluster evidence를 추적 가능하게 남긴다. |
| Fail visible | provider 장애, retrieval 실패, 권한 부족을 숨기지 않는다. |

## Redaction

| 대상 | 처리 |
|---|---|
| Kubernetes Secret | 기본 fetch 금지 |
| env var | token/password/key pattern redaction |
| logs | credential pattern redaction 후 attach |
| YAML | 민감 field masking |
| GitOps values | secret-like key masking |
| user prompt | prompt 내 secret pattern 감지 시 경고 |

## Audit Log

모든 assistant 요청은 다음 audit envelope로 저장한다.

| 필드 | 설명 |
|---|---|
| request_id | 요청 추적 |
| user | OpenShift user |
| groups | user groups |
| cluster_id | cluster 식별자 |
| namespace_scope | 사용된 namespace |
| context_hash | 첨부 context hash |
| sources | 사용된 문서/source ids |
| model | provider/model |
| token_usage | input/output token |
| latency_ms | 응답 시간 |
| redaction_count | 제거된 민감 값 수 |
| action_mode | readOnly, planOnly, approvalRequired |
| feedback | thumbs up/down, reason |

## Model Governance

| 기능 | 설명 |
|---|---|
| ModelRoute | intent별 provider/model routing |
| Fallback | provider 장애 시 local search 또는 다른 model |
| Quota | user/team/project별 token quota |
| Cost Center | 조직/namespace별 사용량 tagging |
| Data Egress Policy | 외부 provider로 나갈 수 있는 source class 제한 |
| Latency SLO | triage/deep diagnosis별 목표 latency |

## Evaluation

### EvaluationSet

golden scenario를 YAML/DB로 관리한다.

| 필드 | 설명 |
|---|---|
| scenario | 예: CrashLoopBackOff, ClusterNotUpgradeable |
| input_context | alert/resource/log fixture |
| expected_sources | 반드시 참조해야 할 문서 |
| forbidden_claims | 하면 안 되는 주장 |
| expected_actions | read-only 확인 명령 |
| pass_criteria | citation, safety, correctness, completeness |

### 평가 지표

| 지표 | 의미 |
|---|---|
| Groundedness | 답변 핵심 주장과 source 연결률 |
| Context Use | 현재 console context 반영 여부 |
| Safety Pass | 위험 명령/Secret 노출 차단 여부 |
| Citation Precision | citation이 실제 주장과 맞는지 |
| Retrieval Recall | 필요한 source가 evidence pack에 포함되는지 |
| Regression | 이전 버전 대비 품질 하락 여부 |
| User Feedback | thumbs down/수정 요청 비율 |

## Action Safety

초기 버전의 조치 수준:

| Level | 허용 여부 | 예 |
|---|---|---|
| L0 Explain | 허용 | 원인 설명, 문서 링크 |
| L1 Read | 허용 | `oc get`, `oc describe`, logs 확인 |
| L2 Plan | 허용 | patch diff 초안, rollout plan |
| L3 Apply with approval | 후속 버전 | 승인 후 scale/patch |
| L4 Autonomous remediation | 제외 | AI 단독 조치 |

## Failure Mode

| 실패 | 사용자 표시 |
|---|---|
| 권한 부족 | "현재 사용자 권한으로 이 namespace를 볼 수 없습니다." |
| RAG source stale | "이 runbook은 180일 이상 갱신되지 않았습니다." |
| Provider down | "모델 provider가 응답하지 않아 runbook search mode로 전환했습니다." |
| Citation 부족 | "근거가 부족하므로 확정 판단 대신 확인 절차를 제공합니다." |
| Secret 감지 | "입력에 민감 정보로 보이는 값이 있어 전송을 차단했습니다." |

