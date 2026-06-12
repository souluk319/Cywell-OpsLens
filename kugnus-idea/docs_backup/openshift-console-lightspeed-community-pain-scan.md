# OpenShift Console / Lightspeed 공개 불편 신호 수집

## 목표

OpenShift web console과 Red Hat OpenShift Lightspeed 관련 공개 웹/커뮤니티/GitHub 신호를 모아, Lightspeed 패널 UX 개선 RFE의 외부 근거로 사용한다.

수집일: 2026-06-12 KST

## 현재 판단

직접적으로 "Lightspeed 패널이 Alerts table의 `심각도`, `합계`, `상태` 컬럼을 가린다"라고 적은 공개 글은 아직 확인하지 못했다.

하지만 다음 근거는 확인됐다.

1. Lightspeed console plugin의 main UI는 현재 "floating popover"로 설계되어 있고, 어떤 console page 위에도 뜨는 구조다.
2. OpenShift console 자체에서는 이미 Quick Start drawer, Topology side panel에 resizable drawer를 적용한 전례가 있다.
3. PatternFly는 overlay drawer와 inline drawer를 구분하고, splitter를 통한 resize를 공식 패턴으로 제공한다.
4. OpenShift console 사용자들은 대형 topology, 대형 cluster dashboard, dynamic plugin, form interaction, monitoring data visibility 문제를 공개적으로 호소해 왔다.
5. Lightspeed는 troubleshooting/alert 최적화를 목표로 하지만, 공식 문서상 reload 시 conversation history가 사라지는 제약과 telemetry/governance 부담이 있다.

따라서 이번 UX 개선 요청은 개인 취향이 아니라, 이미 공개적으로 드러난 console pain과 Lightspeed surface 설계의 구조적 충돌로 볼 수 있다.

## Lightspeed / AI 관련 신호

| 출처 | 유형 | 확인된 신호 | RFE에 주는 의미 |
|---|---|---|---|
| [openshift/lightspeed-console AGENTS.md](https://github.com/openshift/lightspeed-console/blob/main/AGENTS.md) | GitHub repo 문서 | OLS chat UI가 OpenShift Console dynamic plugin이며, main UI가 floating popover chat window로 console page 위에 나타난다고 설명한다. | 현재 가림 문제는 우연한 버그가 아니라 surface choice에서 나온 구조적 문제다. |
| [lightspeed-console Popover.tsx](https://github.com/openshift/lightspeed-console/blob/main/src/components/Popover.tsx) | GitHub source | `Popover`가 `isOpen`, `isExpanded` 상태로 `GeneralPage`를 렌더링하고, popover class를 통해 collapsed/expanded UI를 제어한다. | 위치/크기 제어가 별도 layout system이 아니라 popover CSS 상태에 묶여 있다. |
| [lightspeed-console popover.css](https://github.com/openshift/lightspeed-console/blob/main/src/components/popover.css) | GitHub source | CSS에서 collapsed width가 breakpoint별로 50%, 40%, 35%로 정의되고, expanded는 viewport 대부분을 사용한다. | 넓은 table 오른쪽 컬럼을 가릴 가능성이 높은 수치다. |
| [OpenShift Lightspeed 운영 문서](https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/operate/ols-using-openshift-lightspeed) | 공식 문서 | Lightspeed icon은 화면 lower-right에서 열리며, console reload 시 conversation history가 유지되지 않는다고 설명한다. | 사용자가 패널을 닫고 새로고침하며 회피하기 어렵다. 대화 지속성도 UX 요구사항이다. |
| [OpenShift Lightspeed About 문서](https://docs.redhat.com/en/documentation/red_hat_openshift_lightspeed/1.0/html/about/ols-about-openshift-lightspeed) | 공식 문서 | telemetry가 켜져 있으면 chats/feedback이 Red Hat으로 전송되고, LLM provider는 사용자가 별도 구성해야 한다. | 운영 환경에서는 자동 context 첨부, 로그/YAML 첨부, 비용/보안 통제가 민감하다. |
| [lightspeed-service issue #2672](https://github.com/openshift/lightspeed-service/issues/2672) | GitHub issue | 사용자별 LLM 사용량을 구분할 방법이 없어 비용 할당, rate limit, quota 관리가 어렵다는 RFE가 올라왔다. | Lightspeed UX는 화면 배치뿐 아니라 governance와 사용자 추적까지 운영 제품 요구가 걸려 있다. |
| [lightspeed-console PR #1587](https://github.com/openshift/lightspeed-console/pull/1587) | GitHub PR | conversation persistence와 history drawer 구현 draft가 있고, localStorage로 active conversation을 복구하는 방향을 제시한다. | "대화 유지"는 이미 개발 쪽에서도 인식된 개선 축이다. |
| [lightspeed-console PR #2048](https://github.com/openshift/lightspeed-console/pull/2048) | GitHub PR | 2026-06-10에 popover background가 transparent가 되는 bug fix가 merge됐다. | popover surface styling 자체도 최근까지 손보고 있는 영역이다. |
| [OpenShift console PR #13708](https://github.com/openshift/console/pull/13708) | GitHub PR | Lightspeed contents를 popover 대신 resizable drawer에 넣는 prototype이 있었다고 언급되며, design finalization을 위해 보류됐다. | 우리가 요구하는 resizable/inline drawer는 새 발명이 아니라 이미 검토된 방향이다. |
| [Reddit: GenAI feature requests for Openshift Console](https://www.reddit.com/r/openshift/comments/1cvrx8j/genai_feature_requests_for_openshift_console/) | Community | 사용자는 alert remediation guidance, security context review, requests/limits tuning, health check 조언 같은 운영형 GenAI 기능을 기대했다. 동시에 AI 오염을 우려하는 반응도 있었다. | AI는 "붙이면 좋은 장식"이 아니라 실제 운영 흐름을 건드리므로 UX/context 품질이 중요하다. |

## OpenShift Console 성능 / 대규모 화면 불편 신호

| 출처 | 유형 | 확인된 신호 | RFE에 주는 의미 |
|---|---|---|---|
| [Reddit: Web Console hangs displaying large topology](https://www.reddit.com/r/openshift/comments/vejpyq/web_console_hangs_displaying_large_topology/) | Community | 600 pod production app의 Developer Topology 접근 시 브라우저가 hang 되고, 몇 분 뒤 Out of Memory가 발생한다고 보고했다. | Topology/대형 화면은 이미 콘솔의 약한 지점이다. AI 패널은 이런 화면을 더 가볍게 도와야지 시야를 빼앗으면 안 된다. |
| [Bugzilla #2070540](https://bugzilla.redhat.com/show_bug.cgi?id=2070540) | Bugzilla | 3000 pods에서 console dashboard tab이 Chrome Task Browser 기준 3GB 이상 메모리를 사용하고, 대규모 event/pod에서 misbehave한다고 보고됐다. | 대규모 cluster에서는 UI가 정보를 과하게 watch/load하는 문제가 있다. Lightspeed context 설계도 필요한 정보만 전달해야 한다. |
| [openshift/console issue #8499](https://github.com/openshift/console/issues/8499) | GitHub issue | Developer Topology page가 white screen으로 뜨고, 모든 namespace에서 재현된다고 보고됐다. | 운영자가 UI를 신뢰하지 못하는 지점이다. Assistant는 장애 화면을 더 가리면 안 된다. |
| [openshift/console issue #12526](https://github.com/openshift/console/issues/12526) | GitHub issue | extended usage 뒤 console이 blank white screen 또는 Bad Gateway 상태가 되고, health probe는 계속 성공한다고 보고됐다. | console surface가 깨졌을 때 실제 상태와 UI 상태가 어긋나는 문제가 있다. UX는 상태를 숨기지 말아야 한다. |

## Dynamic Plugin / Console Plugin 불편 신호

| 출처 | 유형 | 확인된 신호 | RFE에 주는 의미 |
|---|---|---|---|
| [Reddit: kubevirt console plugin degraded](https://www.reddit.com/r/openshift/comments/1gmb1xf/kubevirt_console_plugin_degraded/) | Community | KubeVirt, monitoring, networking console plugin manifest를 가져오지 못해 degraded 상태가 됐다는 보고가 있다. | Lightspeed도 dynamic plugin이므로 plugin loading/state/error UX가 중요하다. |
| [Reddit: Service not resolved by FQDN in Openshift-Console](https://www.reddit.com/r/openshift/comments/1bdpion/service_not_resolved_by_fqdn_in_openshiftconsole/) | Community | console pod가 monitoring plugin service FQDN을 잘못 resolve해 plugin manifest request가 실패한다고 보고됐다. | console plugin 문제는 운영자가 원인을 파악하기 어렵고, assistant가 정확한 context를 가져야 한다. |
| [openshift/console issue #13569](https://github.com/openshift/console/issues/13569) | GitHub issue | ACM/MCE ConsolePlugin이 `/api/plugins/acm/` manifest를 valid하게 가져오지 못한다고 보고됐다. | plugin 기반 확장은 사용자에게 "기능이 안 보임/깨짐"으로 나타난다. Lightspeed도 graceful fallback이 필요하다. |
| [OKD discussion: Dynamic Plugins degraded since 4.14](https://github.com/orgs/okd-project/discussions/1854) | GitHub discussion | monitoring pages가 dynamic plugin으로 배포되면서 NetworkPolicy 등으로 plugin 접근 문제가 생길 수 있다는 논의가 있다. | Observe/Monitoring 영역에서 assistant를 붙일수록 plugin/network/policy 경계가 중요해진다. |

## Form / Table / Monitoring UI 불편 신호

| 출처 | 유형 | 확인된 신호 | RFE에 주는 의미 |
|---|---|---|---|
| [openshift/console issue #13317](https://github.com/openshift/console/issues/13317) | GitHub issue | OpenShift 3에서는 multiline template parameter 입력 확장이 있었지만, OpenShift 4에서는 one-line input만 보여 workaround가 어렵다는 regression 보고가 있다. | 운영 UI는 작은 입력 제약 하나로도 실제 작업을 막는다. "패널 크기 조절 없음"도 같은 급의 workflow blocker다. |
| [openshift/console issue #2037](https://github.com/openshift/console/issues/2037) | GitHub issue | dashboard visual issue 중 tooltip이 잘리는 문제가 보고됐다. | 보조 정보 surface가 잘리거나 가리는 문제는 console에서 반복적으로 나오는 UX 위험이다. |
| [Reddit: Openshift does not show memory/core consumption](https://www.reddit.com/r/openshift/comments/1fe474l/openshift_does_not_show_me_the_memory_and_core/) | Community | pod memory/core usage가 `-`로 보이고 monitoring detail에도 data가 나오지 않는다고 보고했다. | 사용자는 console에서 관측 evidence를 얻지 못하면 곧바로 troubleshooting이 막힌다. |
| [Reddit: Greyed out buttons on VM template deploy](https://www.reddit.com/r/openshift/comments/1jooi3m/greyed_out_buttons_on_vm_template_deploy/) | Community | VM template deploy panel 하단이 greyed out 되어 다른 브라우저에서도 시도했다는 보고가 있다. | 사용자가 "왜 비활성인지" 알기 어려운 UI는 assistant context/설명 대상이 된다. |
| [Stack Overflow: OpenShift v3 web console memory limit issue](https://stackoverflow.com/questions/46898854/openshift-v3-online-pro-volume-and-memory-limit-issues) | Community | web console에서 image 기반 app 생성 시 memory 설정 방법을 찾기 어렵고 OOM이 났다는 과거 사례가 있다. | legacy 사례지만 console form이 운영 파라미터를 충분히 드러내지 못하면 장애로 이어진다는 신호다. |

## Resizable / Inline Drawer가 이미 정당한 패턴이라는 근거

| 출처 | 유형 | 확인된 신호 | RFE에 주는 의미 |
|---|---|---|---|
| [PatternFly Drawer design guidelines](https://www.patternfly.org/components/drawer/design-guidelines/) | Design system | Drawer는 overlay 또는 inline으로 구성 가능하고, splitter를 붙이면 width/height resize가 가능하다고 설명한다. Overlay는 덮인 내용을 보려면 닫거나 최소화해야 한다고 명시한다. | Lightspeed의 fixed overlay 문제는 PatternFly가 이미 구분한 "overlay의 한계"와 정확히 맞는다. |
| [PatternFly Chatbot About](https://www.patternfly.org/patternfly-ai/chatbot/about-chatbot/) | Design system | Chatbot은 사용자의 목표 달성에 직접 도움이 될 때 사용해야 하며, novelty만으로 쓰지 말라고 말한다. | assistant가 evidence를 가리면 사용자의 목표 달성에 역행한다. |
| [PatternFly Chatbot conversation history](https://www.patternfly.org/patternfly-ai/chatbot/chatbot-conversation-history/) | Design system | conversation history는 interactive drawer로 제공되며, display mode에 따라 inline 또는 overlay처럼 동작한다. | chatbot에도 drawer/display mode 패턴이 이미 존재한다. |
| [openshift/console PR #8089](https://github.com/openshift/console/pull/8089) | GitHub PR | Quick Start drawer를 resizable로 만드는 변경이 2021년에 merge됐다. | OpenShift console 안에서 drawer resize는 이미 구현된 전례가 있다. |
| [openshift/console PR #8417](https://github.com/openshift/console/pull/8417) | GitHub PR | Topology side panel을 resizable drawer component로 바꾸고, 사용자가 고른 마지막 크기를 추적한다고 설명한다. | "마지막 크기 기억"까지 이미 같은 제품군에서 쓰인 UX다. |
| [PatternFly React issue #5291](https://github.com/patternfly/patternfly-react/issues/5291) | GitHub issue | OpenShift 4.8에서 Quick Starts, Web Terminal, Topology side panel에 resizable drawer를 도입하려 했다는 배경이 있다. | OpenShift UX 팀은 오래전부터 resize 가능한 panel 필요성을 알고 있었다. |

## 이번 Lightspeed 패널 RFE에 바로 연결되는 논리

```text
1. OpenShift console 사용자는 이미 대형 topology, monitoring, dynamic plugin, form interaction에서 불편을 겪고 있다.
2. Lightspeed는 이 문제를 설명하고 해결을 도와야 하는 troubleshooting assistant다.
3. 그런데 현재 Lightspeed console plugin은 floating popover로 어떤 console page 위에도 뜨는 구조다.
4. PatternFly는 overlay drawer가 content를 가릴 수 있음을 명시하고, inline/resizable drawer라는 대안을 제공한다.
5. OpenShift console은 다른 영역에서 이미 resizable drawer와 마지막 크기 기억을 구현한 전례가 있다.
6. Lightspeed도 최소한 minimize, resize, inline dock, dock position, conversation persistence를 제공해야 한다.
```

## RFE 보강 문구

```text
This is not an isolated preference issue. Public OpenShift console feedback already shows recurring pain around large views, dynamic plugin reliability, form constraints, and missing observability context. OpenShift Lightspeed is intended to help users interpret and troubleshoot that context, but its current floating popover surface can obscure the very console evidence users need to inspect.
```

```text
OpenShift has already adopted resizable drawers for Quick Starts and Topology side panels, and PatternFly explicitly supports inline and resizable drawer patterns. Lightspeed should follow the same operational UX principle: the assistant must not obscure the evidence it is supposed to help interpret.
```

## 근거 강도 평가

| 주장 | 근거 강도 | 이유 |
|---|---|---|
| OpenShift console 사용자가 성능/대형 화면 문제를 겪는다 | 강함 | Reddit, Bugzilla, GitHub issue가 모두 존재 |
| dynamic plugin 계층은 사용자에게 장애/불편으로 보인다 | 강함 | Reddit, GitHub issue, OKD discussion에 반복 출현 |
| Lightspeed는 현재 floating popover 구조다 | 강함 | lightspeed-console repo 문서와 source/CSS 확인 |
| Lightspeed 대화 지속성은 개선 필요가 있다 | 중간~강함 | 공식 문서의 reload loss + draft PR 존재 |
| Lightspeed panel 가림에 대한 직접 공개 불만이 있다 | 약함 | 동일 wording의 공개 글은 미확인 |
| resize/inline drawer는 합리적 해결책이다 | 강함 | PatternFly 공식 가이드 + OpenShift console 기존 PR 전례 |

## 다음 행동

1. `openshift-lightspeed-panel-ux-rfe.md`에 이 근거 문서를 reference로 연결한다.
2. 사용자 스크린샷 1, 2를 내부 evidence로 유지한다.
3. RFE 제출 시 공개 근거는 이 문서의 표에서 6~8개만 선별해 사용한다.
4. 가능하면 실제 OpenShift console에서 Lightspeed width/position을 pixel 단위로 측정해 "어떤 컬럼을 몇 px 덮는지"를 추가한다.
