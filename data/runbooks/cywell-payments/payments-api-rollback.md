---
id: customer-runbook:payments-api-rollback
label: Payments API 안전 롤백 절차
sourceType: customer-runbook
trustLevel: approved
---

# Payments API 안전 롤백 절차

payments-api 장애에서 rollback은 마지막 수단이다. 원인 확정 전에는 자동 rollback을 수행하지 않는다.

1. 정상 revision과 현재 revision의 image, environment, ConfigMap, Secret 참조 차이를 확인한다.
2. DB migration 또는 schema 변경이 포함된 배포라면 app rollback 전에 DBA 승인과 migration rollback 계획을 확인한다.
3. 영향 범위와 고객 트래픽 상태를 기록한다.
4. 승인된 GitOps pull request로 이전 revision을 복구한다.
5. rollback 이후 error rate, readiness, latency, payment authorization success rate를 확인한다.
