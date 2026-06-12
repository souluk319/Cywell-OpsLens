# OpenShift Lightspeed Chat Panel UX 개선 요청

## 목표

OpenShift web console에서 Red Hat OpenShift Lightspeed를 사용할 때, 챗봇 패널이 사용자가 분석해야 하는 콘솔 정보를 가리지 않도록 UX 개선 방향을 정리한다.

핵심 원칙:

> The assistant should not obscure the evidence it is supposed to help interpret.

한국어로는 다음과 같다.

> 보조 도구는 사용자가 해석해야 할 증거 화면을 가리면 안 된다.

## 완료 조건

| 항목 | pass/fail 기준 | 측정 방법 | evidence | 현재 gap |
|---|---|---|---|---|
| 문제 화면 가림 방지 | Lightspeed를 열어도 알림 테이블의 핵심 컬럼을 계속 확인할 수 있다 | Alerts 페이지에서 패널 열기 전후 비교 | 사용자 제공 스크린샷 1, 2 | 현재는 오른쪽 패널이 `심각도`, `합계`, `상태` 영역을 가림 |
| 패널 크기 제어 | 사용자가 패널 폭 또는 높이를 조절할 수 있다 | resize handle 또는 preset 크기 선택 | UI 동작 캡처 | 현재 고정 크기 overlay에 가까움 |
| 패널 최소화 | 사용자가 대화 상태를 유지한 채 패널을 접을 수 있다 | minimize 후 다시 expand | UI 동작 캡처 | 현재 문제 확인 중 패널을 닫거나 가려진 상태를 감수해야 함 |
| 패널 위치 제어 | 사용자가 오른쪽, 왼쪽, 하단 등 작업 화면에 덜 방해되는 위치를 선택할 수 있다 | dock position 변경 | UI 동작 캡처 | 현재 오른쪽 하단/오른쪽 overlay 흐름에 고정됨 |
| 현재 콘솔 context 보존 | Lightspeed가 사용자가 보고 있는 리소스/필터/context를 잃지 않는다 | namespace, route, resource, filter 상태 전달 확인 | request payload 또는 UI context chip | 별도 창/패널 분리 시 context sync 설계가 필요 |

## 하지 않을 것

| 범위 | 제외 이유 |
|---|---|
| AI 답변 품질 자체 개선 | 이번 문서는 답변 모델이 아니라 console panel UX 문제를 다룬다 |
| 자동 remediation 실행 | 사용자가 문제를 확인하고 묻는 UX 개선이 목적이며, 자동 변경은 별도 보안/권한 설계가 필요하다 |
| Secret, token, 민감 로그 자동 전송 | 운영 콘솔 context는 민감할 수 있으므로 명시적 첨부와 권한 경계가 필요하다 |
| 완전한 별도 앱 설계 | 이번 문서의 1차 목적은 기존 web console 내 Lightspeed 사용성 개선이다 |

## 현재 사용 흐름

1. 사용자가 OpenShift web console의 `알림` 화면을 연다.
2. 필터는 `소스=플랫폼`, `알림 상태=실행`으로 설정되어 있다.
3. 사용자는 실행 중인 alert 목록을 보며 어떤 문제가 있는지 파악하려 한다.
4. Lightspeed 버튼을 눌러 "현재 문제가 무엇인지" 물어보려 한다.
5. Lightspeed 패널이 오른쪽에 크게 뜨면서 alert table의 오른쪽 정보를 가린다.

## 사용자가 불편해하는 지점

### 1. 문제를 보려고 연 도구가 문제 화면을 가림

Lightspeed는 문제 원인 파악을 도와야 하는 보조 도구다. 그런데 현재 overlay 패널은 사용자가 확인해야 하는 alert table의 오른쪽 영역을 덮는다.

가려지는 주요 정보:

| 컬럼 | 왜 중요한가 |
|---|---|
| `심각도` | info/warning/critical 구분으로 우선순위를 판단한다 |
| `합계` | 동일 alert 발생 수를 확인한다 |
| `상태` | 실제 firing 상태인지 확인한다 |

즉, 사용자는 Lightspeed를 열자마자 문제 판단에 필요한 증거를 잃는다.

### 2. 운영자가 해야 할 시선 흐름과 UI가 충돌함

운영자는 보통 다음 흐름으로 본다.

```text
alert 목록 확인
-> 심각도/상태/개수 확인
-> 특정 alert 선택
-> YAML, event, log, 관련 리소스 확인
-> assistant에게 질문
-> 답변을 보며 다시 console 증거 확인
```

현재 UX는 마지막 두 단계를 방해한다.

```text
assistant에게 질문
-> assistant panel이 console 증거를 가림
-> 사용자가 패널을 닫거나 기억에 의존해야 함
```

### 3. 고정 overlay는 데모에서는 좋아 보여도 실제 운영 화면에는 맞지 않음

작은 데모 질문이나 빈 화면에서는 floating assistant가 자연스러워 보일 수 있다. 그러나 alert, log, event, workload table처럼 오른쪽 컬럼이 중요한 화면에서는 고정 overlay가 작업 흐름을 깨뜨린다.

### 4. 최소화, 이동, 크기 조절 같은 기본 탈출구가 부족함

사용자가 기대하는 최소한의 조작:

| 기능 | 기대 효과 |
|---|---|
| 최소화 | 대화 상태를 유지하면서 가려진 화면을 다시 볼 수 있음 |
| resize | 필요한 만큼만 패널을 줄여 table 컬럼을 확보함 |
| move | alert table을 덜 가리는 위치로 옮김 |
| dock position 변경 | 오른쪽, 왼쪽, 하단 중 화면별로 적합한 위치 선택 |
| inline mode | 패널이 본문을 덮지 않고 레이아웃을 나눠 가짐 |

현재 사용자는 이 탈출구 없이 `닫기`, `기억하기`, `화면을 왔다 갔다 하기`에 의존하게 된다.

## 원인 판단

현재 문제는 "AI 답변이 틀렸다"가 아니라 `assistant surface placement` 문제다.

문제 단위:

| 원인 단위 | 설명 |
|---|---|
| overlay-first layout | 챗봇을 본문 위에 덮는 floating widget으로 우선 배치함 |
| workflow validation gap | Alerts, Logs, Events 같은 실제 운영 화면에서 열었을 때의 가림 여부를 충분히 검증하지 않음 |
| fixed-size interaction | 사용자가 패널 크기와 위치를 업무 상황에 맞게 조정할 수 없음 |
| context visibility loss | assistant를 여는 순간 사용자가 보던 console evidence가 시각적으로 사라짐 |

## 개선안

### 1순위: Inline dock mode

Lightspeed 패널이 본문을 덮지 않고 page layout의 일부로 붙어야 한다.

```text
Before
Console content [covered by overlay panel]

After
Console content | Lightspeed panel
```

장점:

| 항목 | 설명 |
|---|---|
| evidence 보존 | alert table이 완전히 가려지지 않음 |
| 운영 UX 적합 | 콘솔과 assistant를 동시에 보는 흐름에 맞음 |
| 접근성 유리 | 투명도나 겹침보다 명확한 layout |

수용 기준:

| 기준 | pass 조건 |
|---|---|
| alert table visibility | Lightspeed open 상태에서도 `이름`, `심각도`, `합계`, `상태` 중 핵심 정보가 확인 가능 |
| responsive behavior | 좁은 화면에서는 하단 drawer 또는 compact mode로 전환 |
| state preservation | 패널을 닫았다 열어도 conversation이 유지됨 |

### 2순위: Resizable panel

오른쪽 overlay를 유지하더라도 최소한 사용자가 폭을 조절할 수 있어야 한다.

필수 동작:

| 기능 | pass 조건 |
|---|---|
| resize handle | 패널 왼쪽 경계선을 드래그해 폭 조절 |
| min width | 입력창과 답변이 깨지지 않는 최소 폭 유지 |
| max width | 전체 화면을 과도하게 덮지 않도록 제한 |
| persistence | 사용자가 마지막으로 설정한 폭을 기억 |
| keyboard accessibility | 키보드로도 크기 조절 가능하거나 preset 제공 |

### 3순위: Minimize / collapse

패널을 닫지 않고 header 또는 floating chip 수준으로 줄일 수 있어야 한다.

기대 동작:

```text
expanded chat panel
-> minimize
-> small floating header/chip
-> expand
-> previous conversation restored
```

이 기능은 구현 난이도가 낮고 효과가 즉각적이다. 현재 UX의 가장 큰 분노 지점인 "보려고 하는 순간 계속 가림"을 빠르게 줄일 수 있다.

### 4순위: Move / dock position 선택

사용자가 화면 상황에 따라 패널 위치를 선택할 수 있어야 한다.

후보:

| 위치 | 적합한 화면 |
|---|---|
| right | 일반 상세 화면 |
| left | 오른쪽 컬럼이 중요한 table 화면 |
| bottom | wide table, logs, alert list |
| detached window | 멀티 모니터 또는 긴 분석 세션 |

### 5순위: Peek / transparency mode

투명도 조절은 근본 해결은 아니지만 emergency escape hatch로 의미가 있다.

추천 방식:

| 기능 | 설명 |
|---|---|
| peek button | 누르고 있는 동안만 패널이 30~50% 투명해짐 |
| opacity presets | 100%, 80%, 60%, 40% 선택 |
| click-through option | 필요 시 뒤쪽 console을 클릭할 수 있게 함 |
| hover restore | 패널 위에 마우스를 올리면 다시 불투명하게 표시 |

주의:

| 리스크 | 설명 |
|---|---|
| readability | 챗봇 텍스트와 뒤 table 텍스트가 겹쳐 읽기 어려울 수 있음 |
| accessibility | 명암비 기준을 깨뜨릴 수 있음 |
| click blocking | 투명해도 pointer event가 panel에 남으면 뒤 console 조작은 여전히 불가 |

따라서 투명도는 보조 기능이며, 기본 해법은 resize/dock/inline이어야 한다.

## 별도 창 분리 시 필요한 조건

Lightspeed를 완전히 다른 창으로 분리하는 것도 가능하지만, 분리 자체보다 `context sync`가 핵심이다.

필요한 context:

| context | 예 |
|---|---|
| cluster | 현재 접속 cluster |
| namespace | `prod`, `openshift-monitoring` 등 |
| route | 현재 console URL |
| resource | kind/name/uid |
| selected tab | Details, YAML, Events, Logs |
| filters | alert source, alert state |
| visible rows | 현재 화면에 보이는 alert 목록 |

권장 구조:

```text
OpenShift Console
  -> current context publisher
  -> session_id / conversation_id
  -> Lightspeed panel or detached window
  -> answer with context chips and source links
```

브라우저 보안상 별도 창이 아무 연결 없이 기존 console tab의 DOM이나 URL을 마음대로 읽는 것은 어렵다. 따라서 console 쪽에서 현재 상태를 명시적으로 publish해야 한다.

## 권장 제품 요구사항 문구

### 짧은 RFE 문구

```text
OpenShift Lightspeed chat panel currently opens as a fixed overlay and covers the alert table columns needed for troubleshooting, such as severity, count, and status. Please support a resizable and/or inline docked mode so users can keep the console context visible while asking Lightspeed about the current page.
```

### 강한 핵심 문구

```text
The assistant should not obscure the evidence it is supposed to help interpret.
```

### 한국어 요약

```text
현재 Lightspeed 패널은 알림 문제를 분석하려는 순간 알림 분석에 필요한 화면을 가립니다. 이는 보조 기능이 아니라 작업 방해 요소입니다. 최소한 resize, minimize, dock, inline drawer 중 하나는 필요합니다.
```

## 우선순위 제안

| 우선순위 | 개선 | 이유 |
|---|---|---|
| P0 | minimize/collapse | 가장 빠르게 사용자의 막힘을 줄임 |
| P1 | resizable width | overlay를 유지하더라도 핵심 컬럼 확인 가능성을 높임 |
| P1 | inline dock mode | 운영 콘솔에 가장 맞는 근본 UX |
| P2 | bottom/left/right dock 선택 | 화면 종류별 최적 위치 선택 |
| P2 | detached window + context sync | 멀티 모니터와 긴 분석 세션에 적합 |
| P3 | transparency/peek mode | 응급 확인용 보조 기능 |

## 검증 시나리오

| 시나리오 | 기대 결과 |
|---|---|
| Alerts 페이지에서 Lightspeed 열기 | `심각도`, `합계`, `상태`를 계속 확인할 수 있다 |
| 패널 resize 후 새로 열기 | 마지막 크기 또는 합리적 기본 크기가 유지된다 |
| 패널 minimize 후 다시 열기 | 대화 내용과 입력 draft가 유지된다 |
| 하단 dock 전환 | wide table의 오른쪽 컬럼이 가려지지 않는다 |
| 현재 alert context 첨부 | Lightspeed가 현재 filter와 visible alert 목록을 인지한다 |
| 좁은 viewport | panel이 table을 완전히 덮지 않거나 명확한 full-screen mode로 전환한다 |

## 현재 판단

이 문제는 "있으면 좋은 polish"가 아니라 troubleshooting workflow를 막는 제품 결함에 가깝다.

OpenShift Lightspeed의 목적은 사용자가 현재 console에서 보고 있는 문제를 더 빨리 이해하도록 돕는 것이다. 그런데 fixed overlay panel이 문제 판단에 필요한 console evidence를 덮으면 assistant는 생산성 도구가 아니라 방해 요소가 된다.

최소 수정은 `minimize`와 `resizable width`다. 제품적으로 가장 올바른 방향은 `inline dock mode`이며, 별도 창 분리는 `context sync`가 함께 설계될 때 의미가 있다.

## 외부 근거

공개 웹, GitHub issue/PR, Reddit, PatternFly 문서에서 확인한 관련 불편 신호와 구현 전례는 `openshift-console-lightspeed-community-pain-scan.md`에 정리한다.

이 근거 문서는 다음 주장을 보강한다.

| 주장 | 근거 |
|---|---|
| Lightspeed는 현재 floating popover 구조다 | lightspeed-console repo 문서와 source/CSS |
| OpenShift console 사용자는 대형 화면, topology, monitoring, dynamic plugin 문제를 실제로 겪고 있다 | Reddit, GitHub issue, Bugzilla |
| resizable/inline drawer는 이미 Red Hat/PatternFly 계열에서 정당한 패턴이다 | PatternFly Drawer, OpenShift Quick Start/Topology PR |
| Lightspeed도 대화 지속성, history drawer, governance 개선 요구가 존재한다 | 공식 문서, lightspeed-console draft PR, lightspeed-service RFE |
