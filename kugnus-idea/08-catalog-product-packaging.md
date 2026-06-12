# 08. Catalog Product Packaging

## 목표

Kugnus OCP Guide Assistant는 OpenShift 환경에서 "설치 가능한 제품"으로 보이게 해야 한다. 단순 web app이 아니라 Console Plugin, Operator, CRD, 기본 dashboard, 관리 화면을 갖춘 Software Catalog/OperatorHub 친화 제품이어야 한다.

## 설치 경험

이상적인 설치 흐름:

```text
OpenShift Console
  -> Software Catalog / OperatorHub
  -> Kugnus OCP Guide Assistant 선택
  -> Install
  -> 기본 CR 생성
  -> Console Plugin 활성화
  -> Dashboard 진입
  -> KnowledgeSource / ModelRoute 설정
  -> 첫 smoke test
```

## 패키징 단위

| 단위 | 역할 |
|---|---|
| Operator bundle | 설치/업그레이드/CRD 관리 |
| Console Plugin image | OpenShift web console UI 확장 |
| Backend image | API, chat, RAG, audit |
| Worker image | indexing/evaluation |
| Helm chart optional | 내부 설치용 빠른 배포 |
| Example CRs | quickstart demo |

## Software Catalog entry

Catalog card에는 다음이 보여야 한다.

| 항목 | 내용 |
|---|---|
| 이름 | Kugnus OCP Guide Assistant |
| 설명 | OpenShift 운영 dashboard와 context-aware AI assistant |
| 카테고리 | Monitoring, Observability, AI/ML, Developer Tools |
| 태그 | OpenShift, SRE, RAG, Runbook, Assistant, Dashboard |
| 설치 후 위치 | Administrator -> Observe -> Kugnus 또는 별도 navigation |
| 권한 안내 | read-only cluster context, optional docs/git connectors |

## 기본 설치 모드

| 모드 | 설명 |
|---|---|
| Demo mode | mock data와 sample docs로 UI/flow 확인 |
| Read-only cluster mode | live cluster read-only context + no external LLM |
| Enterprise mode | model provider, RAG sources, audit, evaluation 활성 |
| Air-gapped mode | local model/local docs/local vector index 우선 |

## 설치 후 First Run Wizard

1. Cluster read permission 확인
2. Console Plugin 활성화 확인
3. Model provider 선택
4. Data egress policy 선택
5. KnowledgeSource 추가
6. 첫 indexing 실행
7. Evaluation smoke 실행
8. Dashboard open

## 기본 설정 철학

| 설정 | 기본값 |
|---|---|
| action mode | read-only |
| assistant surface | inline dock |
| telemetry | off |
| secret redaction | strict |
| data egress | deny unless configured |
| conversation retention | 90 days |
| audit retention | 365 days |
| source trust | official > approved internal > incident > user upload |

## 운영자 Admin 화면

| 화면 | 기능 |
|---|---|
| Overview | 서비스 상태, provider 상태, index 상태 |
| Knowledge Sources | source 추가/수정/재색인 |
| Model Routes | intent별 provider/model/fallback |
| Policies | RBAC, egress, redaction, action mode |
| Audit | 사용자 요청/답변/source/model 추적 |
| Evaluations | golden scenario 결과 |
| Usage | token, latency, cost center |
| Support Bundle | 설정/로그/진단 bundle 생성 |

## Product Readiness Checklist

| 항목 | 필요 |
|---|---|
| Operator upgrade path | CRD migration과 rollback |
| NetworkPolicy | backend/db/provider egress 제한 |
| RBAC 최소화 | read-only 기본 |
| Resource requests/limits | console/backend/worker별 설정 |
| HPA | chat/api worker scaling |
| Backup/restore | DB와 source metadata |
| Air-gap install | image mirror와 offline docs |
| Support bundle | troubleshooting artifact |
| Docs | install, config, security, admin, user guide |

