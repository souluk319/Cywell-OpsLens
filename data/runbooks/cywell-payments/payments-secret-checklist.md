---
id: customer-runbook:payments-secret-checklist
label: Payments Secret/Config 검증 체크리스트
sourceType: customer-runbook
trustLevel: approved
---

# Payments Secret/Config 검증 체크리스트

결제 시스템 장애 중 인증 실패, DB 연결 실패, CrashLoopBackOff가 동시에 보이면 Secret과 ConfigMap 참조를 먼저 확인한다.

1. Secret 원문 값은 조회하지 말고 key 존재 여부와 mounted reference만 확인한다.
2. Deployment의 `envFrom`, `secretKeyRef`, `configMapKeyRef`가 현재 namespace의 리소스를 참조하는지 확인한다.
3. 최근 Secret rotation 후 Pod가 재시작되었는지 확인한다.
4. 외부 결제 게이트웨이 endpoint 변경 시 readiness probe와 egress policy를 함께 확인한다.
5. Secret 값이 필요한 경우 보안 승인 절차를 거친 사람이 별도 채널에서 검증한다.
