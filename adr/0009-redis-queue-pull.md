# ADR-0009: AI 작업을 Redis 큐(pull 방식)로 — 한도에 걸리면 실패 대신 가져오기를 대기

- 상태: **결정** (PR #100 리뷰·합의 2026-11-03, 기획서 v1.67)
- 날짜: 2026-11-03
- 담당: AI. BE(큐 경로·결과 대기·trace 전달)·INFRA(큐 Redis·네트워크·권한·대시보드) 검토 필요
- 관련: ADR-0008(실패 대신 대기, "Redis 큐 기각"을 이 ADR이 뒤집음), ADR-0005(클러스터 안 Redis), 기획서 5.5 "메시지 큐는 쓰지 않는다"·8장 리스크 표·v1.65 요청 마감, nerd-nam/INFRA-nerdnam#19(운영 재현 결과), #101(INFRA #32 검토 질문)
- 구현: AI nerd-nam/AI-nerdnam#54(작업자)·#55(한도기), BE nerd-nam/BE-nerdnam#68(큐 경로, B안), INFRA nerd-nam/INFRA-nerdnam#32(큐 Redis)

## 배경

- 지금은 BE가 AI를 HTTP로 동기 호출한다. BE는 AI 작업 스레드 4개로 보내고, 응답이 올 때까지 스레드를 쥔다.
- nerd-nam/INFRA-nerdnam#19 운영 재현(11-03, BE `7eb24db`·AI `7f5f828`) 결과:
  - 두 시나리오 모두 **저하형**. 분석 몰림은 실패 0건, 완료 시간 p50 19초 → 몰림 끝 무렵 약 169초.
  - **처리량을 정한 것은 모델 한도**다. 작성 방향 몰림은 Nova 약 30회/분 요청에 한도 20회/분, 분석은 Titan 60회/분에서 막혀 분당 약 3건에서 포화. BE 스레드 4개가 다 찬 것은 스레드들이 한도에 걸려 기다렸기 때문이다.
  - 한도에 걸린 재시도로 Bedrock 시도 수가 호출 수의 약 2배(Nova)·1.5~3.7배(Titan).
- 큐로 바꿔도 **처리량은 한도로 고정**이고, 기다리는 곳이 BE 메모리에서 Redis 큐로 옮겨 갈 뿐이라 사용자 대기 시간은 거의 같다. 큐로 얻는 것은 아래 세 가지다.
  - (a) Bedrock 호출마다 한도기를 두어 **재시도 낭비 제거**
  - (b) HTTP 요청 마감(읽기 제한 − 10초)에서 벗어나 **실패 대신 대기**
  - (c) 문서 임베딩과 분석의 **우선순위 분리**

## 결정

**AI가 작업할 수 있을 때 큐에서 가져가 실행하고, 모델 한도에 걸리면 기다린다(pull).**

1. **BE**: 작업 단계를 Redis 큐에 넣고 **가상 스레드에서 그 결과를 기다린다**(B안). OS 스레드를 쥐지 않으므로 BE 스레드 수가 속도를 정하지 않는다. 분석 단계 순서(추출 → 임베딩 → 검색 → 매칭 → 갭)와 단계 코드는 그대로다. BE 재시작으로 끊기는 작업이 문제가 되면 단계별 상태 기계(결과를 받으면 다음 단계를 넣음)로 옮긴다.
   - 결과는 그 작업을 기다리는 Pod로 가야 하므로 **Pod별 결과 스트림 `ai:res:{Pod}`** 를 쓰고, 요청의 `reply_to`로 알려 준다.
2. **AI 작업자**: 스트림마다 작업자를 둔다. 꺼내는 양은 **작업자 수(동시 처리 상한)** 가 정한다. 시작값은 `llm` 8, `embed` 2, `embed-bg` 1이고 재시험 뒤 조정한다. 꺼낸 단계는 지금 HTTP 라우터를 같은 프로세스 안에서 그대로 부른다(응답·실패 `usage`·trace가 HTTP 경로와 같다).
3. **한도기**: 모델별(Titan·Nova) 분당 요청·토큰 한도기를 **Bedrock 호출마다** 적용한다. 메시지 1건이 Bedrock을 여러 번 부를 수 있기 때문이다(`/embed` 1건 = 문장 수만큼 Titan, 최대 32회 / LLM은 응답 형식 오류 때 1회 더). 한도면 자리가 날 때까지 기다린다. 한도기는 **AI 프로세스 메모리**에 둔다(ai Pod 1개). ai를 2대 이상으로 늘릴 때 Redis로 옮긴다.
4. **문서 임베딩은 따로**: 확정 후 문서 임베딩(`purpose=document`, 32건씩 최대 20번)은 `ai:req:embed-bg`에 넣는다. `embed-bg` 작업자는 사용자가 기다리는 `ai:req:embed`를 먼저 본다. 문서 임베딩이 몰려도 분석의 요건 임베딩이 그 뒤에 줄 서지 않는다.
5. **큐 대기는 실패가 아니다.**
   - AI 쪽에는 기한이 없다. 큐 경로 요청에는 요청 마감을 두지 않는다.
   - 잠시 뒤 다시 하면 되는 실패(503: 대기열·호출 한도·Bedrock 일시 장애·모델 연결 확인 중)는 결과로 보내지 않고, 작업자가 쉬었다 다시 한다(5초부터 두 배, 최대 60초).
   - 다시 해도 같은 실패는 502로 끝낸다. 해당하는 것은 Bedrock 생성 시간 초과(504, C-04에서도 다시 보내지 않음)와 모델 연결 확인 실패(키·권한·설정, 503 `llm error`·`embedding error`)다.
   - 작업자가 죽으면 회수(`XAUTOCLAIM`)로 이어 간다.
   - BE는 결과 대기 상한(`wait-timeout`, 시작 20분)을 둔다. 화면이 "진행 중"에 끝없이 남지 않게 하려는 장치다. 값은 재시험 뒤 정하고, 정상 몰림에서는 닿지 않아야 한다(아래 성공 기준).
6. 진짜 실패(입력 문제, 반복되는 응답 형식 오류, 권한·설정 오류, BE·DB 장애)는 지금처럼 기존 실패 코드로 처리한다.
7. 메시지에 W3C `traceparent`·`enqueued_at`을 넣어 BE → 큐 → AI → Bedrock을 trace 하나로 잇는다.

### 메시지 (C-04에 추가)

| 방향 | 스트림 | 필드 |
| --- | --- | --- |
| 요청 | `ai:req:llm`(Nova: `requirements/extract`·`restructure`·`match`·`gap-guide`·`guide`), `ai:req:embed`(`purpose=query`), `ai:req:embed-bg`(`purpose=document`) | `id`(`{op}:{uuid}`, BE가 다시 넣어도 같은 값), `op`(HTTP 경로에서 `/` 뺀 것), `body`(지금 HTTP 요청 JSON 그대로), `traceparent`, `enqueued_at`(ISO-8601 UTC, 다시 넣어도 처음 값), `reply_to`(`ai:res:{BE Pod}`) |
| 결과 | 요청의 `reply_to` | `id`, `status`, `body`(200: 지금 HTTP 응답 JSON 그대로) 또는 `detail`(실패 이유), `usage`(`{"input_tokens","output_tokens","llm_calls"}` JSON 문자열) |

- `status`(큐 경로): **200** 성공 / **422** 요청 검증 실패(모르는 `op`, `op`·`enqueued_at` 없음 포함) / **502** 모델 오류·응답 형식 오류·설정 오류·Bedrock 생성 시간 초과. BE는 422·502를 `AI_ERROR`로 끝낸다(기존 매핑).
- **503·504는 HTTP 경로 전용**이다(대기열 꽉 참·요청 마감). 큐 경로에서 503은 작업자가 다시 하고, 504는 502로 보낸다.
- 실패 결과에도 `usage`를 넣는다(다시 한 시도까지 합계). 모르면 뺀다.

### 같은 단계 한 번만 실행

소비자 그룹은 최소 1회 전달이라 같은 단계가 두 번 올 수 있다(작업자가 죽은 뒤 회수, 한도기에서 오래 기다리는 사이 회수, BE가 다시 넣음).

- **AI**: Bedrock을 부르기 전에 `SET ai:run:{id} {작업자} NX GET EX 40`으로 선점한다(비어 있으면 선점, 있으면 그 값을 받음).
  - 값이 `done`이면 이미 결과를 보낸 것이라 지운다.
  - 값이 다른 작업자 이름이면(실행 중이거나 죽은 작업자의 선점이 아직 남음) **지우지 않고 pending으로 둔다.** 나중에 다시 회수해서, 끝났으면 지우고 선점이 풀렸으면 실행한다.
  - 처리하는 동안 15초마다 `XCLAIM … JUSTID`와 `SET … XX EX 40`으로 연장한다. 살아 있는 작업은 회수되지 않고, 죽은 작업자의 선점은 40초 안에 풀린다.
  - 60초 동안 손대지 않은 pending은 다른 작업자가 `XAUTOCLAIM`으로 가져간다. 선점 만료(40초)를 회수 기준(60초)보다 짧게 두어, 회수한 쪽이 선점할 수 있게 한다.
  - 끝나면 `SET ai:run:{id} done EX 1800`(30분, BE `wait-timeout`보다 길게)으로 바꾼다. 완료된 `id`가 다시 오면 Bedrock을 부르지 않는다.
  - 결과 본문은 키에 저장하지 않는다(개인정보).
  - 연장은 누가 잡았는지 확인하지 않고 덮어쓴다. ai Pod가 1개인 지금은 문제가 없다. 2대 이상으로 늘리면 "값이 내 작업자 이름일 때만 연장"(Lua 또는 Redis 8.4+ `SET … IFEQ`)으로 바꾸고, Lua를 쓰면 ACL에 `EVALSHA`·`SCRIPT LOAD`를 더한다.
- **AI**: `enqueued_at`이 30분(`AI_QUEUE_MAX_AGE`)보다 오래된 단계는 BE가 이미 포기했으므로 실행하지 않는다.
- **BE**: 5분(`resend-after`) 동안 결과가 없으면 **같은 `id`로 다시 `XADD`** 한다(큐 Redis 재시작 유실 대비). 결과는 "아직 이 단계를 기다리는 중"일 때만 한 번 반영하고, 늦게 온 중복은 버린다.

### 스트림 정리 (#101 1번)

스트림은 `XACK` 해도 메시지를 지우지 않는다. 정리하지 않으면 256MB에 닿아 `noeviction`으로 새 작업을 넣지 못한다.

- **요청 `ai:req:*`**: AI가 **어떻게 끝나든 메시지마다 마지막에 `XACK` + `XDEL`** 한다. 결과를 보낸 경우, 중복, 형식 깨짐, 오래됨이 모두 해당한다. 트랜잭션(`MULTI`/`EXEC`)은 쓰지 않고 결과 → 완료 표시 → `XACK`·`XDEL` 순서로 보낸다. 중간에 죽으면 회수·완료 표시·BE 중복 무시로 결과가 맞다.
  - `MAXLEN ~` 안전망은 두지 않는다. 처리 전 메시지가 잘리면 "큐 대기는 실패가 아니다"와 어긋나고, 본문이 수십 KB라 개수 상한보다 메모리에 먼저 닿는다.
- **결과 `ai:res:{Pod}`**: BE가 읽은 뒤 `XDEL` 한다. 키 만료 1시간을 BE(읽을 때)와 AI(쓸 때) 둘 다 건다. 내려간 Pod의 스트림이 남지 않는다.
- **메모리 보호**: BE가 접수 단계에서 `XLEN(ai:req:llm) + XLEN(ai:req:embed)`(처리 중 포함)이 200 이상이면 바로 거절한다(`AI_UNAVAILABLE`, "잠시 뒤 다시 시도"). 그 밖에는 `noeviction` + 메모리 경고가 막는다.

### 소비자 그룹·권한 (#101 2·3번)

- `ai:req:*` 소비자 그룹 `ai`는 **AI가 시작할 때 만든다**(`XGROUP CREATE … MKSTREAM`, `BUSYGROUP` 무시). 큐 Redis가 재시작되면 다시 만든다. BE는 소비자 그룹을 쓰지 않는다(결과는 `XREAD`). INFRA가 미리 만들 것은 없다.
- 권한(Redis 7 ACL, 키는 `ai:*` 안):

| 사용자 | 키 | 명령 |
| --- | --- | --- |
| api | `%W~ai:req:*` | `XADD`, `XLEN`(접수 거절) |
| api | `~ai:res:*` | `XREAD`, `XDEL`, `EXPIRE` |
| ai | `~ai:req:*` | `XGROUP CREATE`, `XREADGROUP`, `XACK`, `XDEL`, `XAUTOCLAIM`, `XCLAIM`, `XLEN`, `XINFO GROUPS` |
| ai | `%W~ai:res:*` | `XADD`, `EXPIRE` |
| ai | `~ai:run:*` | `SET` |
| 둘 다 | — | `PING`, `HELLO`·`AUTH` |

### 접속 설정

| 환경 변수 | 둘 곳 |
| --- | --- |
| `AI_QUEUE_ENABLED`(기본 `false`) | values. BE·AI 같은 이름 |
| `AI_QUEUE_REDIS_HOST`·`AI_QUEUE_REDIS_PORT`·`AI_QUEUE_REDIS_USERNAME` | values |
| `AI_QUEUE_REDIS_PASSWORD` | Secret(`nerdnam/dev/api`·`nerdnam/dev/ai`) |

- 큐 Redis에 닿지 못해도 **readiness는 실패로 하지 않는다**. AI는 HTTP 경로를 계속 받고, BE는 AI 작업 외 API를 계속 받는다. BE는 `XADD`가 실패하면 그 AI 작업을 `GPU_UNAVAILABLE`("잠시 뒤 다시 시도")로 끝내고, AI 작업자는 5초 뒤 다시 접속한다.

## 측정 (Grafana)

| 지표 | 라벨 | 질문 |
| --- | --- | --- |
| `nerdnam_ai_queue_lag` 게이지 | `stream`, `model` | 이 모델에 아직 안 꺼낸 작업이 몇 건 밀렸나 |
| `nerdnam_ai_queue_pending` 게이지 | `stream`, `model` | 꺼냈지만 끝나지 않은 작업이 몇 건인가 |
| `nerdnam_ai_inflight` 게이지 | `model`, `stage`=`limiter`·`bedrock` | 지금 어디서 기다리나(한도기 / Bedrock 응답). `limiter`는 한도기와 함께 나온다 |
| `nerdnam_ai_stage_seconds` 히스토그램 | `model`, `stage`=`queue`·`limiter`·`bedrock` | 이 모델은 어느 단계에서 기다리나 (p95). `limiter`는 한도기와 함께 나온다 |
| `nerdnam_ai_queue_up` 게이지 | — | 큐 Redis에 붙어 있나. `AI_QUEUE_ENABLED=true`일 때만 나온다(꺼짐과 끊김 구분) |

- `model`: Bedrock 지표와 같은 모델 id. `stream`=`llm` → Nova, `embed`·`embed-bg` → Titan.
- **lag 계산**: 처리한 메시지는 지우므로 `XLEN` = 안 꺼낸 것 + pending이다. lag = `XLEN` − `XINFO GROUPS`의 `pending`. `XINFO GROUPS`의 `lag` 필드는 방금 전달한 항목을 `XDEL`하면 null이 될 수 있어 쓰지 않는다.
- 단위: `queue`는 메시지가 꺼내지기까지, `limiter`·`bedrock`은 **Bedrock 호출 1회** 기준이다. lag·pending은 **메시지(작업 단계 1건)** 수다. `embed` 메시지 1건은 Titan을 최대 32번 부르므로, 같은 lag라도 Titan 부담은 다를 수 있다.
- `stage_seconds` 구간: `0.1, 0.5, 1, 3, 10, 30, 60, 120, 300, 600`. 10분이 넘는 대기는 p95가 600초로 보이고, 이런 경우는 아래 멈춤 알림으로 잡는다.
- 읽기: `limiter` ↑ = 모델 한도 포화 / `queue`만 ↑ = 작업자 부족 / `bedrock` ↑ = Bedrock 자체 지연.
- trace: AI가 BE trace에 `queue.wait` span(시작 = `enqueued_at`)을 이어 붙이고, 그 뒤로 지금 있는 `bedrock.queue`(동시 호출 자리 대기)·`bedrock.converse`/`bedrock.invoke_model`(Bedrock 호출) span이 이어진다. 한도기가 들어오면 `limiter.wait`이 더해진다. Tempo에서 작업 1건의 단계별 시간을 본다. 끝난 단계만 보이므로, 지금 기다리는 곳은 `inflight`로 본다.
- **멈춤 알림(#101 4번, warning)**:
  - `queue_lag`가 30분 동안 줄지 않고 0보다 큼 → 작업자가 멈춤 (`embed-bg`는 60분)
  - `queue_pending`이 같은 조건 → 처리 중에 멈춤(회수 문제)
  - `queue_up == 0`이 5분 → 큐 Redis에 붙지 못함
- BE 지표 `nerdnam_aijob_threads_*`·`nerdnam_aijob_queue_size`와 알림 `NerdnamAiJobQueueBacklog`는 B안에서도 뜻이 거의 같아 남긴다. 스레드 상한 선만 4 → 64(가상 스레드)로 바뀐다.

### 재시험 성공 기준

nerd-nam/INFRA-nerdnam#19와 같은 부하로 다시 측정한다. "완료 시간 단축"이 아니라 아래 셋을 본다.
- Bedrock 시도/호출 비율 ≈ 1
- 같은 부하에서 실패 0 (BE `wait-timeout`에 닿지 않음)
- 몰림이 길어져도 실패로 바뀌지 않음 (밀림·대기로만 보임)

## 검토한 다른 방법

| 방법 | 판단 |
| --- | --- |
| 지금 구조 유지 + BE 스레드만 늘리기 | 한도에 걸린 재시도 낭비는 그대로. 스레드를 늘린 만큼 throttle이 더 난다 |
| AI 한도기만 HTTP 경로에 먼저 | 재시도 낭비는 줄지만, HTTP 요청 마감 때문에 몰리면 여전히 503·504로 실패한다. 큐를 바로 적용하기로 함 |
| 세션 Redis를 큐로 같이 쓰기 | 큐가 밀리면 세션 쓰기 실패(256MB, noeviction) = 로그인 장애. 11-03 같은 Redis 메모리 경고가 있었다 → 큐 전용 Redis |
| Redis Pub/Sub | 받는 쪽이 없으면 메시지가 사라지고(AI 재시작·배포 중 유실), 구독자 모두가 같은 작업을 받고, 처리 확인·회수가 없다. 요청 대기열에는 Streams + 소비자 그룹 |
| SQS | 비용은 차이 없다(우리 규모면 월 $1 미만). 유실 방지·가시성 타임아웃(자동 회수)·DLQ를 기본으로 줘서 오히려 유리한 점이 많다. 그래도 Redis를 고른 이유: 로컬 개발·테스트가 `docker run redis`로 끝나고, AWS 권한·Terraform 변경 없이 팀 안에서 빠르게 반복할 수 있고, 클러스터 안 Redis 운영 경험이 있다. 대신 재전달·회수(`XAUTOCLAIM`)·메모리 상한을 직접 만든다. **재전달·유실 문제가 반복되면 SQS로 옮긴다** — 메시지 형식과 측정은 그대로 쓸 수 있다 |

## 남은 위험과 할 일

- **개인정보:** 요청 본문(이력 원문)이 큐 Redis에 머문다. 큐 Redis는 디스크 저장을 끄고, 처리한 요청은 바로 `XDEL`, 결과는 BE가 읽고 `XDEL` + 키 만료 1시간, `ai:run:{id}`에는 본문을 두지 않는다. 기획서 8장 "AI 서버는 DB 접근 없음"에 큐 Redis 예외(ai → 큐 Redis 한 경로만)를 적는다.
- **큐 Redis 재시작 유실:** 디스크 저장을 끄므로 재시작하면 메시지가 사라진다. BE가 5분 뒤 같은 `id`로 다시 넣는다. AI는 소비자 그룹을 다시 만든다.
- **큐 Redis 메모리:** `noeviction`으로 넘쳐도 작업을 지우지 않는다. 시작 상한 256MB, exporter로 세션 Redis와 같은 메모리 경고를 건다. BE 접수 거절(200건)이 먼저 막는다.
- **한도 값:** RPM은 Titan 60·Nova 20(nerd-nam/INFRA-nerdnam#19). TPM은 Service Quotas에서 확인한다.
- **BE 값:** `wait-timeout` 20분·`resend-after` 5분은 재시험 뒤 바뀔 수 있다. AI의 완료 표시 만료·`AI_QUEUE_MAX_AGE`(30분)는 `wait-timeout`보다 길게 유지한다.
- **전환:** `AI_QUEUE_ENABLED` 플래그로 HTTP 경로와 병행하고, 안정되면 HTTP 경로를 지운다. INFRA는 큐 Redis·네트워크·알림 분리를 이 ADR 확정 전에 미리 만들 수 있다(소비자가 없으면 무해, BE·AI는 플래그가 꺼져 있음). ACL은 위 표대로 둔다.
- **기획서·C-04 갱신:**
  - 5.5 "메시지 큐는 쓰지 않는다" 삭제, C-04에 메시지 형식 추가.
  - 8장 리스크 표 "AI 서버·Bedrock 장애 중 요청"(API가 연결 실패·503을 짧은 타임아웃으로 감지해 `GPU_UNAVAILABLE`)을 큐 경로 기준(대기, 일시적 오류는 작업자가 다시 함, BE `wait-timeout`)으로 고친다.
  - v1.65 요청 마감(읽기 제한 − 10초, 503·504)은 **HTTP 경로 전용**으로 한정한다.

| 할 일 | 담당 | 상태 |
| --- | --- | --- |
| 큐 작업자(`reply_to` 결과, 같은 `id` 한 번만, 503 다시 하기, 정리), 큐 지표·`queue.wait` span | AI | nerd-nam/AI-nerdnam#54 (main) |
| 한도기(호출마다, Nova 20·Titan 60회/분, 한도만큼 바로 → 일정 속도, HTTP·큐 공용), `limiter` 단계 지표·`limiter.wait` span | AI | nerd-nam/AI-nerdnam#55 (main) |
| 큐 넣기·결과 대기(B안)·`traceparent` 전달·같은 `id` 다시 넣기·접수 거절·문서 임베딩 스트림 분리 | BE | nerd-nam/BE-nerdnam#68 |
| 큐 전용 Redis(`noeviction`, 디스크 저장 끔, exporter), NetworkPolicy·ACL(위 표), Secret, 대시보드 패널, 멈춤 알림 | INFRA | nerd-nam/INFRA-nerdnam#32 |
| 운영 재시험(nerd-nam/INFRA-nerdnam#19와 같은 부하, 위 성공 기준) | INFRA·AI | 전환 뒤 |
