---
id: customer-runbook:payments-api-crashloop
label: Payments API Pod 장애 대응 매뉴얼
sourceType: customer-runbook
trustLevel: approved
---

# Payments API Pod 장애 대응 매뉴얼

CrashLoopBackOff 또는 readiness probe 실패가 발생하면 최근 rollout, 필수 환경변수, Secret key 존재 여부, ConfigMap 변경, DB 연결 설정을 순서대로 확인한다.

1. OpenShift 콘솔에서 `payments` namespace의 Pod 이벤트와 최근 10분 로그를 확인한다.
2. `PAYMENT_API_URL`, `PAYMENT_DB_HOST`, `PAYMENT_DB_USER` 값이 Deployment와 Secret에 모두 존재하는지 확인한다.
3. 최근 GitOps sync 또는 image rollout 이후 누락된 환경변수가 있는지 비교한다.
4. 원인이 확인되기 전 자동 rollback은 수행하지 않는다.
5. 변경은 승인된 GitOps pull request로만 적용한다.
