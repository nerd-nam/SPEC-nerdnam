# ADR-0007: AI 모델 서빙을 AWS Bedrock API로 전환

- 상태: **제안** (PR 리뷰 후 합의되면 "결정"으로 변경)
- 날짜: 2026-10-27
- 담당: AI, BE 리뷰 필요(임베딩 차원 변경)
- 관련: ADR-0001(GPU·모델 서빙, **이 문서로 대체**), ADR-0005(EKS GPU 서빙, **이 문서로 대체**), 기획서 5.1·5.3·5.5·8장, 작업목록 D-4 · AI-02 · AI-15 · BE-19

## 배경

- ADR-0001·0005는 LLM(Qwen3.5-4B, vLLM)과 임베딩(embeddinggemma-2)을 GPU 노드(g4dn.xlarge T4)에서 직접 띄우는 안이었다.
- 이 안에서 운영자가 맡아야 하는 일이 많았다.
  - GPU 노드를 켜는 데 5~15분이 걸린다. 꺼져 있는 시간대에는 요청이 실패한다(503).
  - Karpenter, time-slicing, vLLM 사이드카, 드라이버 버전을 관리해야 한다.
  - AI Pod 1개가 T4 1장(15.3GB 중 13.9GB)을 차지해 Pod 수를 늘릴 수 없다.
- 팀 판단: 지금 일정과 인원으로는 GPU 서빙 환경을 구축하기 어렵다.

## 결정

| 항목 | 내용 |
| --- | --- |
| LLM | **Amazon Nova 2 Lite** — Bedrock `global.amazon.nova-2-lite-v1:0` (Global 교차 리전 추론 프로필) |
| 임베딩 | **Amazon Titan Text Embeddings V2** — Bedrock `amazon.titan-embed-text-v2:0`, **1024차원**, 정규화 |
| 리전 | 호출은 서울 `ap-northeast-2`. 임베딩은 **In-Region**(서울에서만 처리). LLM은 서울에 In-Region이 없어 **Global 프로필 → 요청이 국외 리전에서 처리될 수 있다** |
| 호출 | AI 서버 → boto3 `bedrock-runtime`. LLM은 Converse API, 임베딩은 InvokeModel |
| 인증 | boto3 기본 순서: Bedrock API 키(`AWS_BEARER_TOKEN_BEDROCK`) 또는 IAM 자격 증명(운영 Pod 역할). 키는 k8s Secret·로컬 `.env`에 두고 커밋·로그 금지 |
| AI 서버 | GPU 없는 일반 Pod 1개, 상시 운영. 켜고 끄기(CronJob, replicas 0/1)는 없앤다 |

### LLM 선택 경과

| 모델 | 결과 |
| --- | --- |
| DeepSeek-V3.1 (첫 안) | 서울 `bedrock-runtime`에 없음. OpenAI 호환 `bedrock-mantle`에만 있고, mantle 호출은 모든 모델에서 토큰 없이 멈춤(3~4분) |
| GPT-5.6-Luna (선호안) | 계정의 이용 계약 상태가 `NOT_AVAILABLE`("contact AWS Sales"). IAM 마켓플레이스 권한을 넣어도 같음. OpenAI·Anthropic·Cohere·TwelveLabs 모델 전부 같은 상태 → **AWS 승인 요청 중** |
| **Nova 2 Lite (지금)** | 계약 없이 바로 사용 가능. 아래 품질 측정에서 형식 오류 없음 |
| Nova Pro / Lite / Micro (APAC 프로필) | 처리가 아시아·태평양 리전 안으로 묶임. Nova Pro는 스키마 준수 2/3, Lite·Micro는 품질 미측정 |

GPT-5.6-Luna 승인이 나면 AI 서버 설정값 `LLM_MODEL`만 바꾸고 평가를 다시 돌려 비교한다. 응답의 `model` 값이 바뀌어 결과가 섞이지 않는다.

### BE·FE와의 계약 (C-04)

- **바뀌지 않는 것:** 엔드포인트, 요청·응답 필드, 오류 코드(`GPU_UNAVAILABLE`·`AI_ERROR`·`TIMEOUT`), 재시도 규칙, 읽기 제한, stub 규칙.
- **바뀌는 것은 하나:** `/embed` 응답의 `dim`이 768에서 **1024**로, `embedding_model`이 `amazon.titan-embed-text-v2:0:1024`로 바뀐다.
  - BE는 pgvector 컬럼을 `vector(1024)`로 바꾸고 저장된 청크를 모두 다시 임베딩한다(BE-19).
  - 기존 규칙인 "청크마다 `embedding_model` 저장, 다르면 재임베딩"을 그대로 쓴다.
- `GPU_UNAVAILABLE`은 이름을 그대로 두고, 뜻을 "AI 모델 서비스를 지금 쓸 수 없음"으로 넓힌다. AI 서버가 503을 돌려주는 경우는 다음과 같다.
  - 시작 직후 연결 확인 중이거나 확인 실패
  - Bedrock 호출 한도 초과(Throttling)
  - Bedrock 일시 장애(ServiceUnavailable·InternalServer·ModelError 등)
  - Bedrock 연결 실패
- Bedrock이 요청을 거부하면(Validation·AccessDenied 등) 502(`AI_ERROR`), 읽기 시간 초과는 504(`TIMEOUT`)다.

### AI 서버 내부

- **JSON 출력 강제:** Nova는 Converse의 구조화 출력(`outputConfig` json_schema)을 지원하지 않는다. 그래서 도구 하나(`out`)의 입력 스키마로 출력 스키마를 주고 그 도구를 반드시 부르게 한다(`toolChoice`). 도구 입력이 곧 출력 JSON이다.
  - 스키마는 Bedrock 규칙에 맞게 손본다: object마다 `additionalProperties: false`, `minItems`는 0이나 1만, 길이·범위 제약은 뺀다.
  - 뺀 제약(예: 포트폴리오 4~8쪽)은 응답 검증과 1회 재시도가 그대로 잡는다.
- **시작:** 임베딩·LLM을 짧게 한 번씩 불러 키·권한·모델을 확인한 뒤 `/health`가 `ready`가 된다(약 1초). 실패하면 1분 뒤 다시 시도한다. 스키마 컴파일 대기가 없어 예열은 하지 않는다.
- **재시도:** AI 서버는 Bedrock 호출을 다시 보내지 않는다(재시도는 BE가 1회). 평가 스크립트처럼 몰아서 부를 때만 `LLM_MAX_ATTEMPTS`·`EMBED_MAX_ATTEMPTS`를 올린다.
- **임베딩:** Titan은 요청 1번에 문장 1개만 받는다. 항목마다 병렬로(동시 8건) 부르고 순서대로 돌려준다.
  - 질의·문서 접두어는 없다.
  - 문서는 제목을 본문 앞에 붙인다.

## 측정 (2026-10-27, 실제 Bedrock)

| 항목 | 결과 | 기존 기준 |
| --- | --- | --- |
| `embed_eval` (Titan) | hit@1 0.82, MRR 0.91 | embeddinggemma 0.82 · 0.86 |
| `search_eval` (Titan) | 후보 재현율 1.00 (per_type) | 0.99 |
| `revise_eval` (Nova 2 Lite) | 8/8 | p1_v4 8/8 |
| `extract_eval` (Nova 2 Lite) | 묶음 26/28, 기술명 9/9 | p2_v2 26/28 · 9/9 |
| `match_eval` (Nova 2 Lite) | 판정 일치율 **80%**, 큰 오류 1 (요건마다 호출, `p3_v2`) → **77%**, 큰 오류 3 (10개 묶음, `p3_v4`, 채택) | 목표 85%, Qwen3.5-4B 91% |
| 응답 시간 | `/restructure` 2~3초, `/match` 2초, `/guide` 탭당 2~6초, `/embed` 0.1~0.6초 | 읽기 제한 안 |

- `match` 묶음 판정(`p3_v4`): 요건 17~19개 기준 LLM 호출 약 70회 → 8회, 입력 토큰 약 115k → 37k. 일치율 3%p 하락을 감수하고 호출 한도 완화를 택했다. 5개 묶음도 76%로 같아 하락 원인은 묶음 크기보다 입력 형식으로 보인다.
- `match` 오답은 대부분 정답이 "부분 충족"인 요건이다(낮게 8건, 높게 5건). 예: 기술 목록에 '학습 중'으로만 있으면 미충족으로 본다. 프롬프트 보완을 따로 잡는다.

## 검토한 다른 안

| 안 | 버린 이유 |
| --- | --- |
| GPU 자체 서빙 유지 (ADR-0001·0005) | 구축·운영 부담, 켜는 시간 5~15분, Pod를 늘릴 수 없음 |
| Anthropic API 직접 호출 | 국외 처리, 별도 계약·결제 |
| Bedrock의 Claude·GPT | 계정 이용 계약이 막혀 있음(위 표). 승인되면 다시 비교 |
| 임베딩 Cohere Embed v4 | 서울은 Global 교차 리전만 지원, 계정 이용 계약도 막혀 있음 |
| 임베딩 embeddinggemma-2를 CPU Pod로 유지 | 품질 측정이 끝나 있고 재임베딩이 필요 없지만, 모델 운영이 남는다. 팀 결정으로 Bedrock으로 통일 |
| Titan 512차원 뒤에 0을 채워 768 유지 | 계약 변경은 피하지만 꼼수다. 어차피 재임베딩은 필요해 1024로 바꾸기로 함 |

## 결과와 위험

- **국외 처리:** LLM(Nova 2 Lite Global)은 요청이 서울 밖 리전에서 처리될 수 있다. 개인정보 처리방침에 국외 이전(처리 위탁) 고지가 필요한지 BE-17·S01에서 검토한다. 아시아 안으로 묶어야 하면 APAC 프로필 Nova 모델로 바꾸고 평가를 다시 돌린다.
  - Bedrock은 입력을 모델 학습에 쓰지 않고 모델 제공사와 공유하지 않는다.
  - 임베딩(Titan)은 서울 안에서만 처리된다.
- **호출 한도:** 지금 계정은 Nova 2 Lite가 분당 약 40건, Titan이 순간 약 67건 뒤 초당 약 1건이다(실측). 이 상태로는 동시 사용자가 조금만 늘어도 503이 난다. **운영 전에 Service Quotas 상향 요청이 필요하다.**
- **품질:** `match` 일치율이 목표 85%에 못 미친다. 프롬프트 보완 또는 GPT-5.6-Luna 승인 후 비교로 정한다.
- **Titan 한국어:** AWS는 Titan V2를 영어 최적화, 한국어 포함 100개 이상 언어는 미리보기로 안내한다. 측정 결과는 기존과 같거나 낫다. 크게 떨어지는 사례가 나오면 이 ADR을 다시 연다.
- **비용:** GPU 노드 시간 요금 대신 토큰 요금을 낸다.
  - Nova 2 Lite는 100만 토큰당 입력 약 $0.30, 출력 약 $2.50이다(집계 사이트 기준, AWS 요금표로 확인 필요). `/restructure` 1회(입력 약 1,500·출력 약 260토큰)는 약 $0.001이다.
  - Titan V2는 100만 토큰당 약 $0.02 수준이라 임베딩 비용은 무시할 만하다.
  - LLM 비용은 호출량에 비례하므로 AWS 예산 알림과 회원별 호출량 모니터링(기획서 8장)으로 관리한다.

## 하지 않는 것

- 여러 모델 동시 운영이나 자동 전환(fallback)
- 로컬 GPU·vLLM 실행 경로. 로컬도 같은 Bedrock을 부른다.
- OpenAI 호환 엔드포인트(`bedrock-mantle`). 호출이 멈추는 문제가 있어 쓰지 않는다.
