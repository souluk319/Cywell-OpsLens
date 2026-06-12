# Kugnus OCP Guide Assistant 아이디어 저장소

## 목적

이 폴더는 Red Hat OpenShift 환경에 프로덕트로 들어갈 수 있는 OCP 가이드 챗봇 아이디어를 저장한다.

목표는 단순히 Lightspeed와 비슷한 챗봇을 만드는 것이 아니다. OpenShift 운영자가 현재 콘솔에서 보고 있는 alert, workload, event, log, YAML, GitOps 변경점, 사내 runbook을 한 흐름에서 해석하고 검증 가능한 조치안을 얻는 운영 제품을 설계한다.

## 제품 한 줄 정의

Kugnus OCP Guide Assistant는 OpenShift web console과 Software Catalog에 통합되는 dashboard-first 운영 AI assistant다. 화면을 가리지 않는 UX, live cluster context, 사내 운영 지식 RAG, RBAC 기반 보안, audit/evaluation dashboard를 하나의 제품 경험으로 제공한다.

## 핵심 제품 판단

| 판단 | 내용 |
|---|---|
| 챗봇보다 dashboard가 먼저다 | 운영자는 질문하기 전에 active risk, alert priority, affected resource, recent change를 보고 싶다. |
| RAG는 문서 검색이 아니다 | 공식 문서, 사내 runbook, customer docs, GitOps repo, incident history, live cluster state를 운영 지식 공급망으로 다뤄야 한다. |
| assistant는 증거를 가리면 안 된다 | alert table, logs, events, YAML을 가리면 troubleshooting 도구가 아니라 방해 요소가 된다. |
| BYOK/BYOM은 옵션이어야 한다 | 사용자가 모든 key/model/knowledge를 직접 가져와야만 동작하는 제품은 운영 도입 장벽이 높다. |
| 답변보다 근거와 검증이 중요하다 | citations, inspected evidence, missing evidence, risk, rollback path가 답변 구조에 포함되어야 한다. |
| 자동 조치는 후순위다 | 초기 버전은 read-only 분석과 안전한 plan 생성에 집중한다. |

## 문서 지도

| 문서 | 역할 |
|---|---|
| `01-product-vision.md` | 제품 비전, 사용자, 포지셔닝, 차별점 |
| `02-problem-map.md` | Lightspeed류 assistant의 문제점과 우리가 해결할 gap |
| `03-ux-workflows.md` | 화면 가림 없는 UX, dashboard, assistant panel, 주요 사용자 흐름 |
| `04-rag-knowledge-system.md` | RAG/지식 운영 설계, source, pipeline, 답변 구조 |
| `05-ocp-integration-architecture.md` | OpenShift Console/Operator/Backend/CRD 아키텍처 |
| `06-governance-safety-evaluation.md` | RBAC, redaction, audit, quota, evaluation, action safety |
| `07-mvp-roadmap-acceptance.md` | MVP 범위, roadmap, acceptance criteria, 검증 시나리오 |
| `08-catalog-product-packaging.md` | Software Catalog/OperatorHub 관점 패키징과 설치 경험 |
| `09-one-page-rfe-and-pitch.md` | 외부 설명용 1페이지 pitch와 RFE 문구 |
| `deep-research-OCPLightspeed.md` | OpenShift 웹 콘솔과 Lightspeed 사용성 피드백 분석 보고서 |
| `deep-research-OCP_idea1.md` | Ops Lens 재설계 연구 보고서와 콘솔 플러그인 기반 진단 계층 아이디어 |

## 참고 문서

| 위치 | 내용 |
|---|---|
| `../openshift-lightspeed-panel-ux-rfe.md` | Lightspeed 패널 UX 문제와 개선안 |
| `../openshift-console-lightspeed-community-pain-scan.md` | 공개 커뮤니티/GitHub 근거 수집 |
| `../26.06.12_openshift_catalog_ops_ai_assistant_product_plan.html` | HTML 개발 기획서 |

## 현재 ref stamp

| 항목 | 값 |
|---|---|
| branch | `dev` |
| head sha | `a3c6162fa51eff388e1433e051a7728798e4fd2f` |
| 작성일 | 2026-06-12 KST |
