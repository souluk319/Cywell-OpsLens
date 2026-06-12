# 05. OCP Integration Architecture

## 목표

Kugnus OCP Guide Assistant는 OpenShift 환경에 자연스럽게 설치되고 운영되어야 한다. UI는 OpenShift Console Plugin으로 들어가고, 설치/업그레이드는 Operator로 관리하며, backend는 cluster 내부에서 RBAC와 network policy를 준수해야 한다.

## 전체 아키텍처

```text
OpenShift Web Console
  ├─ Kugnus Console Plugin
  │   ├─ Operations Dashboard
  │   ├─ Assistant Dock
  │   ├─ Context Publisher
  │   ├─ Knowledge Admin UI
  │   └─ Evaluation/Audit UI
  │
  ├─ Console Plugin Proxy
  │   ├─ user identity forwarding
  │   ├─ CSRF/session handling
  │   └─ backend API routing
  │
  └─ Kugnus Backend
      ├─ Chat API
      ├─ Context Collector
      ├─ RAG Orchestrator
      ├─ Model Gateway
      ├─ Audit Service
      ├─ Evaluation Service
      └─ Connector Workers

Storage / Data
  ├─ PostgreSQL: metadata, conversation, audit, config
  ├─ pgvector or vector DB: embeddings
  ├─ Object storage: source snapshots, reports
  ├─ Prometheus: metrics
  └─ Kubernetes API: live resources
```

## 배포 컴포넌트

| 컴포넌트 | 역할 | OpenShift 리소스 |
|---|---|---|
| Kugnus Operator | 설치/업그레이드/CRD 관리 | Operator, CRD, Deployment |
| Console Plugin | OpenShift web console 통합 UI | ConsolePlugin, Service |
| Backend API | chat, RAG, audit, dashboard API | Deployment, Service, HPA |
| Worker | indexing, sync, evaluation batch | CronJob, Job, Deployment |
| Storage | metadata/vector/audit 저장 | PostgreSQL, PVC, Secret |
| Model Gateway | provider/model 라우팅 | Deployment 또는 backend module |

## Console Plugin 기능

| 기능 | 설명 |
|---|---|
| Software Catalog entry | 사용자가 catalog에서 Kugnus 앱을 발견하고 설치/열기 |
| Navigation item | Observe 또는 Administrator 관점에서 진입점 제공 |
| Resource action | Pod/Deployment/Alert detail에서 "Ask Kugnus" 액션 |
| Context publisher | 현재 route, resource, filters, selected tab publish |
| Assistant surface | dock/resizable/bottom/detached UI |
| Admin screens | KnowledgeSource, ModelRoute, Audit, Evaluation 관리 |

## Context Publisher

Console Plugin은 다음 context를 backend session에 publish한다.

| context | 예 |
|---|---|
| cluster_id | cluster UID 또는 display name |
| user | console user identity |
| route | 현재 console route |
| perspective | Administrator, Developer |
| namespace | selected namespace |
| resource | kind, apiVersion, name, uid |
| selected_tab | Details, YAML, Events, Logs |
| filters | table filter/query |
| visible_rows | table에 보이는 key rows |
| attached_evidence | 사용자가 명시적으로 첨부한 YAML/log/event |

## Backend API 초안

| Endpoint | 목적 |
|---|---|
| `POST /api/chat` | context-aware chat |
| `POST /api/context/sync` | console context publish |
| `GET /api/dashboard/risks` | active risk dashboard |
| `GET /api/knowledge/sources` | source 상태 조회 |
| `POST /api/knowledge/sources` | source 추가 |
| `POST /api/index/run` | re-index 실행 |
| `GET /api/audit/events` | 감사 로그 조회 |
| `GET /api/evaluation/runs` | 평가 결과 조회 |
| `POST /api/actions/plan` | read-only action plan 생성 |

## CRD 초안

### OpsAssistantConfig

```yaml
apiVersion: kugnus.io/v1alpha1
kind: OpsAssistantConfig
metadata:
  name: default
spec:
  defaultDockMode: inline
  storage:
    type: postgres
    secretRef: kugnus-db
  telemetry:
    enabled: false
  retention:
    conversationDays: 90
    auditDays: 365
```

### KnowledgeSource

```yaml
apiVersion: kugnus.io/v1alpha1
kind: KnowledgeSource
metadata:
  name: platform-runbooks
spec:
  type: git
  url: https://git.example.com/platform/runbooks.git
  authRef: runbook-git-token
  owner: platform-sre
  refreshSchedule: "*/30 * * * *"
  visibility:
    namespaces:
      - "*"
  metadata:
    sourceType: internal-runbook
    trustLevel: approved
```

### AssistantPolicy

```yaml
apiVersion: kugnus.io/v1alpha1
kind: AssistantPolicy
metadata:
  name: default
spec:
  actionMode: readOnly
  secretRedaction: strict
  allowDataEgress: false
  deniedKinds:
    - Secret
  approvalRequired:
    - patch
    - apply
    - delete
```

### ModelRoute

```yaml
apiVersion: kugnus.io/v1alpha1
kind: ModelRoute
metadata:
  name: default
spec:
  routes:
    - intent: triage
      providerRef: local-small
      fallbackProviderRef: enterprise-llm
    - intent: deep-diagnosis
      providerRef: enterprise-llm
  quota:
    tokensPerUserPerDay: 200000
```

## 권한 모델

| 원칙 | 구현 |
|---|---|
| 사용자가 못 보는 리소스는 AI도 못 본다 | user token impersonation 또는 SubjectAccessReview |
| backend service account 권한은 최소화 | read-only ClusterRole + namespace scoped Role |
| Secret은 기본 차단 | Secret kind fetch 금지, redaction pipeline |
| admin 화면은 별도 권한 | `kugnus-admin` Role |
| audit는 write-once 성격 | append-only event 저장 |

## 네트워크 경계

| 흐름 | 정책 |
|---|---|
| Console -> Backend | cluster internal service 우선 |
| Backend -> Kubernetes API | read-only, RBAC scoped |
| Backend -> LLM Provider | allowlist egress, provider별 Secret |
| Worker -> external docs/git | connector별 egress allowlist |
| Backend -> DB | namespace 내부 NetworkPolicy |

