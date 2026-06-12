# 04. RAG and Knowledge System

## 목표

Kugnus의 RAG는 "문서 검색"이 아니라 OpenShift 운영 지식 공급망이다. 답변은 일반 지식이 아니라 현재 cluster context, 공식 기준, 사내 운영 표준, 과거 장애 이력을 함께 근거로 해야 한다.

## Knowledge Source

| Source | 예시 | 목적 | 주의 |
|---|---|---|---|
| Official Docs | OpenShift docs, release notes, product docs | 공식 기준 | version metadata 필수 |
| Red Hat KB / Known Issues | troubleshooting article, errata | 알려진 문제 | 접근 권한/라이선스 확인 |
| Internal Runbook | 사내 SOP, 장애 대응 문서 | 환경별 표준 절차 | owner, expiry, approval 필요 |
| Customer Docs | 고객사 운영 정책, 네트워크/보안 예외 | 고객 환경 반영 | tenant isolation 필수 |
| GitOps Repo | Argo CD app, Kustomize, Helm values | 실제 desired state | secret/value redaction |
| Live Cluster | alerts, events, pods, nodes, operators, metrics summary | 현재 상태 | RBAC scoped, TTL 필요 |
| Incident Memory | resolved Q&A, tickets, postmortem | 반복 장애 학습 | 검증된 것만 승격 |

## Metadata 설계

모든 chunk/source에는 다음 metadata를 붙인다.

| 필드 | 이유 |
|---|---|
| `source_type` | official, internal, cluster, gitops, incident 구분 |
| `product` | OpenShift, ODF, ACM, GitOps 등 |
| `ocp_version` | 버전별 답변 충돌 방지 |
| `namespace_scope` | 특정 namespace 전용 문서 구분 |
| `tenant` | 고객/조직 격리 |
| `owner` | 문서 책임자 |
| `expires_at` | 오래된 runbook 자동 경고 |
| `trust_level` | 공식/승인/임시 문서 우선순위 |
| `security_class` | public/internal/restricted/secret |
| `last_indexed_at` | freshness 표시 |

## Ingestion Pipeline

```text
source connector
  -> fetch
  -> normalize
  -> classify security
  -> redact secrets
  -> chunk with structure
  -> attach metadata
  -> embedding
  -> BM25 index
  -> vector index
  -> source health report
```

## Retrieval Pipeline

```text
question + console_context
  -> intent classification
  -> RBAC scope calculation
  -> live cluster context fetch
  -> query rewriting
  -> hybrid search: BM25 + vector + metadata filter
  -> rerank by version, source trust, recency, namespace relevance
  -> evidence pack generation
  -> answer generation
  -> citation verification
  -> safety and missing evidence check
  -> audit/evaluation sample capture
```

## Retrieval Mode

| Mode | 사용 상황 | Source |
|---|---|---|
| Fast Triage | alert summary, 간단 원인 후보 | live cluster + top runbook |
| Deep Diagnose | 장애 분석 | live cluster + logs/events + docs + GitOps |
| Official Answer | 공식 기준 확인 | official docs 우선 |
| Local Policy | 사내 표준 확인 | internal runbook 우선 |
| Postmortem Assist | 사고 기록 작성 | conversation + evidence + ticket |

## 답변 생성 규칙

답변은 다음을 반드시 포함해야 한다.

1. 현재 판단
2. 확인한 evidence
3. 원인 후보와 confidence
4. 다음 확인 명령
5. 관련 문서 citation
6. missing evidence
7. 위험과 rollback path

금지:

| 금지 | 이유 |
|---|---|
| 근거 없는 확정 판정 | 운영 사고로 이어질 수 있음 |
| Secret/token 노출 | 보안 위험 |
| 권한 없는 namespace 추정 | RBAC 위반 |
| 삭제/변경 명령 즉시 실행 | 초기 제품 범위 밖 |
| 공식 문서와 사내 문서 충돌 숨김 | 운영 판단 왜곡 |

## RAG Health Dashboard

| 지표 | 설명 |
|---|---|
| Source Coverage | 질문군별 검색 가능한 문서 범위 |
| Freshness | 문서/cluster snapshot 갱신 시간 |
| Citation Rate | 답변 핵심 주장 중 citation 있는 비율 |
| Conflict Count | 공식 문서와 내부 문서 충돌 건수 |
| Stale Runbooks | expiry가 지난 문서 수 |
| Retrieval Miss | 사용자가 다시 질문하거나 thumbs-down한 답변 유형 |
| Evaluation Pass Rate | golden scenario 통과율 |

## Runbook Flywheel

```text
conversation
  -> useful answer
  -> save as incident note
  -> promote to runbook candidate
  -> owner review
  -> approved runbook
  -> re-index
  -> evaluation sample
  -> better future answer
```

