# ADR-0008: Bedrock 호출 한도 몰림 — 재현·원인 분석과 "실패 대신 대기"

- 상태: **제안** (SPEC#91 합의 후 "결정"으로 변경)
- 날짜: 2026-11-02
- 담당: AI. BE(읽기 제한·`stale-after`)·INFRA(알림 기준) 리뷰 필요
- 관련: ADR-0007(Bedrock 서빙, "호출 한도"), SPEC#91(C-04 읽기 제한 불일치), AI #44·PR #45(Prometheus 지표), AI PR #46(이 결정의 구현), INFRA#2(AI 지표 수집 연결), INFRA `docs/운영-검증-작업계획.md` 5절 "Bedrock 한도 지속"

## 배경

- ADR-0007에서 "지금 계정 한도로는 동시 사용자가 조금만 늘어도 503이 난다"고 적었다. 작성 방향은 탭 5개를 병렬로 부르므로, 몇 명만 동시에 눌러도 한도에 닿는다.
- 한도에 걸리면 AI 서버는 503을 돌려주고, API는 1회 재시도한 뒤 작업을 `GPU_UNAVAILABLE`로 실패 처리한다. 사용자는 "잠시 후 다시 시도"를 본다.
- 실패가 어디서 나는지(AWS 한도인지 우리 대기열인지)는 로그를 직접 뒤져야 알 수 있었다. AI #44로 지표를 추가한 뒤 실제로 재현해 원인을 확인했다.

## 재현

| 항목 | 조건 |
| --- | --- |
| 환경 | 로컬 AI 서버(`fix/llm-queue-wait` 코드), 실제 Bedrock(Nova 2 Lite, 공용 개발 계정), 로컬 Grafana(Tempo)로 trace 수집 |
| 부하 | `/match`(요건 2개 → LLM 1회) **40건을 한꺼번에** |
| 설정 | 동시 호출 8(기본값). "전"은 지금 운영 설정(`LLM_QUEUE_WAIT=5`, throttle 재시도 없음) |
| 날짜 | 2026-11-02, 팀에 구두로 알린 뒤 진행 |

결과 (전):

| 응답 | 건수 | 원인 |
| --- | --- | --- |
| 200 | 23 | |
| 503 | 14 | Bedrock `ThrottlingException` (계정 한도) |
| 503 | 3 | 우리 대기열에서 5초 넘게 기다림(`busy`) |

## 원인 분석

### 지표 (`/metrics`, AI #44)

| 지표 | 값 | 읽는 법 |
| --- | --- | --- |
| `nerdnam_ai_bedrock_calls_total{result="ok"}` | 24 (서버 시작 확인 1 포함) | 실제로 Bedrock에 간 호출 중 성공 |
| `nerdnam_ai_bedrock_calls_total{result="throttle"}` | 14 | throttle 비율 14 / 38 = **37%** → 원인은 AWS 쪽 한도 |
| `nerdnam_ai_bedrock_queue_rejected_total{kind="llm"}` | 3 | Bedrock에 가기 전 우리 대기열에서 거절 |
| `nerdnam_ai_bedrock_attempts_total` | 38 | 시도 수 = 호출 수 → 다시 보낸 호출 없음 |

응답 코드 수(503 17건)와 지표 합계(throttle 14 + 거절 3)가 일치한다.

Grafana에서 볼 질의(PromQL):

```promql
# throttle 비율
sum(rate(nerdnam_ai_bedrock_calls_total{result="throttle"}[5m])) / sum(rate(nerdnam_ai_bedrock_calls_total[5m]))
# 다시 보낸 비율 (1보다 크면 한도에 걸리기 시작)
sum(rate(nerdnam_ai_bedrock_attempts_total[5m])) / sum(rate(nerdnam_ai_bedrock_calls_total[5m]))
# 대기열 거절
sum by (kind) (rate(nerdnam_ai_bedrock_queue_rejected_total[5m]))
# 대기열 대기 p95
histogram_quantile(0.95, sum by (le, kind) (rate(nerdnam_ai_bedrock_queue_wait_seconds_bucket[5m])))
```

### 로그

- `bedrock llm … ThrottlingException` 14줄, `bedrock llm busy wait=…` 3줄. 지표와 같은 수다.
- 처음 약 24건은 14초 안에 성공했고, 그 뒤 호출이 한도에 막혔다. → **한꺼번에 받는 양이 약 24건**에서 끊긴다(ADR-0007의 "분당 약 40건"과 같은 계정, 측정 방식이 달라 숫자가 다름).

### trace (Tempo, AI #43)

- TraceQL `{ resource.service.name = "ai-before" && span.bedrock.result = "throttle" }` → 13건, `busy` → 3건.
- throttle 1건이 적은 것은 서버를 끝낼 때 마지막 span이 덜 보내진 것으로 본다.
- trace에서 요청 하나를 열면 `bedrock.queue`(대기) → `bedrock.converse`(호출, `error.type=ThrottlingException`) 순서로 어디서 실패했는지 보인다.

### 원인

1. **AWS 계정 한도:** 짧은 시간에 약 24건을 넘기면 Bedrock이 거절한다. 설정으로는 없앨 수 없다.
2. **AI가 너무 빨리 포기한다:**
   - LLM은 SDK 재시도가 1회라, throttle이 오면 기다리지 않고 바로 503이다.
   - 대기열 대기 상한이 5초다. 계약 C-04의 가장 짧은 읽기 제한(20초)에 맞춘 값인데, BE 실제 읽기 제한은 120~300초다(SPEC#91). BE는 더 기다릴 수 있는데 AI가 먼저 끊는다.

## 결정

| 설정 | 전 | 후 | 이유 |
| --- | --- | --- | --- |
| `LLM_QUEUE_WAIT` | 5초 | **30초** | 가장 짧은 BE 읽기 제한 120초 안. 형식 오류 재생성으로 2번 연달아 불러도 여유 |
| `LLM_THROTTLE_RETRIES` (새 값) | — | **2** | `ThrottlingException`일 때만 2·4초(+0~1초) 쉬고 다시 보냄 |
| `EMBED_BUDGET` | 8초 | **100초** | `/embed` BE 읽기 제한 120초 안, 20초 여유 |
| `LLM_MAX_ATTEMPTS` | 1 | 1 (그대로) | SDK 재시도는 읽기 시간 초과·5xx도 다시 보내 한 호출이 60초 × 시도 수로 늘어나고, "시간 초과는 다시 보내지 않는다"(C-04 504)와 어긋남 |

- 쉬는 동안 동시 호출 자리를 쥐고 있어서, 한도에 걸린 동안은 동시 호출이 저절로 줄어든다.
- 다시 보낸 호출도 `usage.llm_calls`, `attempts_total`, trace `bedrock.attempts`에 센다.
- 다시 보내서 성공한 호출은 결과가 `ok`다. 그래서 한도에 걸리기 시작한 것은 throttle 비율보다 **시도 수 ÷ 호출 수**로 먼저 보인다.
- 값은 AI 코드 기본값이다(INFRA는 이 값들을 따로 넣지 않음). 구현은 AI PR #46.

## 결과 (전·후, 같은 조건)

40건 한꺼번에, 두 실행 사이 90초 간격:

| | 전 | 후 |
| --- | --- | --- |
| 성공 | 23건 (58%) | **34건 (85%)** |
| 실패 | 17건 (한도 14 + 대기 3) | 6건 (재시도 후에도 한도 3 + 대기 3) |
| 다시 보낸 횟수 | 0 | 21번 (1번 만에 성공 13, 2번 8) |
| 시도 수 ÷ 호출 수 | 1.0 | 1.55 |
| 응답 시간 중간값 / 상위 10% / 최대 | 2.2 / 9.0 / 13.6초 | 2.8 / 36.3 / 45.2초 |

대기열만 밀리는 경우(동시 호출 1, `/match` 10건): 전 503 4건 → 후 0건, 가장 늦은 응답 5.5 → 9.1초.

- 실패가 기다림으로 바뀌었다. 대신 몰릴 때 상위 10% 응답이 9초에서 36초로 늘었다.
- 남은 실패 6건 중 대기 초과 3건은, 한도에 걸린 호출이 쉬는 동안 자리를 쥐고 있어 뒤 요청이 30초를 넘긴 경우다. 한도 3건은 계정 한도 자체다.

## 검토한 다른 방법

| 방법 | 판단 |
| --- | --- |
| Redis 큐를 따로 둔다 | 한도는 분당 요청 수라 큐를 둬도 처리량은 그대로다. 대기열은 이미 두 겹이다(API의 AI 작업 테이블, AI 서버의 동시 8·대기 32). 진짜 문제는 너무 빨리 포기하는 것이었다. AI 서버를 2대 이상으로 늘릴 때 **공유 속도 제한기**로 다시 검토 |
| SDK 재시도를 3회로 올린다 | 시간 초과·5xx까지 다시 보내 BE 읽기 제한을 넘는다(위 표) |
| 동시 호출을 줄인다 | 호출 길이가 제각각이라(1초~수십 초) 고정 값으로는 한도를 맞추기 어렵다. throttle 재시도가 쉬는 동안 동시 호출을 저절로 줄인다 |
| AWS 한도 상향 | **근본 해결.** 위 방법과 함께 진행(ADR-0007에서 운영 전 필요로 적음) |

## 남은 위험과 할 일

- **계약 값(SPEC#91):** 이 결정은 BE 실제 읽기 제한(120~300초)을 전제로 한다. 계약 C-04를 그 값으로 올리고 "AI 서버는 각 읽기 제한보다 먼저 503/504로 끝낸다"를 적어야 한다. 반대로 BE가 계약 값(10~30초)으로 줄이면 이 값들도 다시 정한다.
- **성능 목표와의 관계:** 기획서 5.5는 읽기 제한을 "성능 목표의 약 2배"로 잡았다. 120~300초는 목표의 6~15배라, 그 문장을 "한도에 걸릴 때 기다리는 시간을 포함한 상한"으로 바꿀지 함께 정한다. 화면은 폴링이라 막히지 않지만, "보통 20초쯤" 안내와 실제 대기가 달라질 수 있다.
- **BE `stale-after`:** 오래 걸린 작업을 실패로 정리하는 시간이 "읽기 제한 + 재시도 1회"보다 짧으면, AI가 기다렸다 성공해도 BE가 먼저 실패로 정리한다. BE 확인 필요.
- **한도 상향 요청:** 남은 실패는 계정 한도다. Service Quotas에서 Nova 2 Lite 요청 수 상향을 요청한다(AWS 콘솔 권한자).
- **운영 환경 재현:** AI #44가 배포되고 INFRA#2(ServiceMonitor·NetworkPolicy)가 적용되면, EKS에서 같은 부하로 다시 재현해 Grafana 대시보드 화면을 이 문서에 붙인다.
- **알림 기준 (INFRA 제안):**

| 알림 | 조건 (제안) |
| --- | --- |
| Bedrock 한도 접근 | 시도 수 ÷ 호출 수 > 1.2, 5분 지속 |
| Bedrock 한도 초과 | throttle 비율 > 5%, 5분 지속 |
| AI 대기열 거절 | `queue_rejected_total` 증가 > 0, 5분 지속 |
