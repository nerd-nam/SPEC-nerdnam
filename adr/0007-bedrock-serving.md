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
| LLM | **DeepSeek-V3.1** — Bedrock `deepseek.v3-v1:0`, 문맥 128K, 출력 최대 8K |
| 임베딩 | **Amazon Titan Text Embeddings V2** — Bedrock `amazon.titan-embed-text-v2:0`, **1024차원**, 정규화 |
| 리전 | 서울 `ap-northeast-2`, 둘 다 **In-Region** 호출. 교차 리전(Geo·Global)은 쓰지 않는다 |
| 호출 | AI 서버 → Bedrock Runtime HTTPS. LLM은 OpenAI 호환 Chat Completions(`/openai/v1/chat/completions`)와 `response_format: json_schema`, 임베딩은 InvokeModel |
| 인증 | Bedrock API 키(Bearer). 운영은 k8s Secret으로 넣고, 로컬은 `.env`에 둔다. 키는 커밋·로그 금지 |
| AI 서버 | GPU 없는 일반 Pod 1개, 상시 운영. 켜고 끄기(CronJob, replicas 0/1)는 없앤다 |

### BE·FE와의 계약 (C-04)

- **바뀌지 않는 것:** 엔드포인트, 요청·응답 필드, 오류 코드(`GPU_UNAVAILABLE`·`AI_ERROR`·`TIMEOUT`), 재시도 규칙, 읽기 제한, stub 규칙.
- **바뀌는 것은 하나:** `/embed` 응답의 `dim`이 768에서 **1024**로, `embedding_model`이 `amazon.titan-embed-text-v2:0:1024`로 바뀐다.
  - BE는 pgvector 컬럼을 `vector(1024)`로 바꾸고 저장된 청크를 모두 다시 임베딩한다(BE-19).
  - 기존 규칙인 "청크마다 `embedding_model` 저장, 다르면 재임베딩"을 그대로 쓴다.
- `GPU_UNAVAILABLE`은 이름을 그대로 두고, 뜻을 "AI 모델 서비스를 지금 쓸 수 없음"으로 넓힌다. AI 서버가 503을 돌려주는 경우는 다음과 같다.
  - 예열 중이거나 예열 실패
  - Bedrock 호출 한도 초과(429)
  - Bedrock 장애(5xx)
  - Bedrock 연결 실패
- Bedrock이 요청을 거부하면(400·403 등) 502(`AI_ERROR`), 읽기 시간 초과는 504(`TIMEOUT`)다.

### AI 서버 내부

- **JSON 스키마 강제:** Bedrock 규칙에 맞게 스키마를 손본다.
  - object마다 `additionalProperties: false`를 붙인다.
  - `minItems`는 0이나 1만 남기고, 길이·범위 제약은 뺀다.
  - 뺀 제약(예: 포트폴리오 4~8쪽)은 응답 검증과 1회 재시도가 그대로 잡는다.
- **예열:** Bedrock은 새 스키마를 처음 받을 때 준비에 최대 90초가 걸리고 24시간 캐시한다. 그래서 다음과 같이 한다.
  - 시작할 때와 12시간마다 출력 스키마별로 짧은 요청을 보낸다.
  - 예열이 끝나야 `/health`가 `ready`가 된다.
  - 실패하면 1분 뒤 다시 시도한다.
- **임베딩:** Titan은 요청 1번에 문장 1개만 받는다. 항목마다 병렬로(동시 8건) 부르고 순서대로 돌려준다.
  - 질의·문서 접두어는 없다.
  - 문서는 제목을 본문 앞에 붙인다.

## 검토한 다른 안

| 안 | 버린 이유 |
| --- | --- |
| GPU 자체 서빙 유지 (ADR-0001·0005) | 구축·운영 부담, 켜는 시간 5~15분, Pod를 늘릴 수 없음 |
| Claude(Anthropic API 직접 또는 Bedrock) | Anthropic API는 국외에서 처리됨. Bedrock 서울 In-Region은 일부 모델만 있고 JSON 스키마 강제가 없음 |
| 임베딩 Cohere Embed v4 | 서울은 Global 교차 리전만 지원 → 국외에서 처리될 수 있음 |
| 임베딩 embeddinggemma-2를 CPU Pod로 유지 | 품질 측정이 끝나 있고 재임베딩이 필요 없지만, 모델 운영이 남는다. 팀 결정으로 Bedrock으로 통일 |
| Titan 512차원 뒤에 0을 채워 768 유지 | 계약 변경은 피하지만 꼼수다. 어차피 재임베딩은 필요해 1024로 바꾸기로 함 |

## 결과와 위험

- **품질:** 모델이 바뀌므로 다시 재야 한다.
  - LLM: `revise_eval`(p1_v4 기준 8/8), `extract_eval`, `match_eval`, G1 지표.
  - 임베딩: `embed_eval`·`search_eval`. embeddinggemma 기준은 hit@1 0.82, MRR 0.86, 후보 재현율 0.99.
  - 결과는 AI PR에 적는다.
- **Titan 한국어:** AWS는 Titan V2를 영어 최적화, 한국어 포함 100개 이상 언어는 미리보기로 안내한다. 검색 품질이 크게 떨어지면 이 ADR을 다시 연다.
- **모델 종료:** DeepSeek-V3.1은 Bedrock에서 Legacy이고 **2027-03-30 종료**다.
  - 그 전에 서울 In-Region에서 쓸 수 있는 후속 모델로 바꾼다.
  - AI 서버 설정값 `LLM_MODEL`만 바꾸고 평가를 다시 돌린다. 응답의 `model` 값이 바뀌어 결과가 섞이지 않는다.
- **비용:** GPU 노드 시간 요금 대신 토큰 요금을 낸다.
  - Titan V2는 100만 토큰당 약 $0.02 수준이라 임베딩 비용은 무시할 만하다.
  - LLM 비용은 호출량에 비례하므로 AWS 예산 알림과 회원별 호출량 모니터링(기획서 8장)으로 관리한다.
- **호출 한도:** Bedrock 분당 요청 수 한도에 걸리면 503이 되고 BE가 1회 재시도한다. 부족하면 한도 상향을 요청한다.
- **개인정보:** 서울 리전 안에서만 처리되어 국외 이전은 없다. Bedrock은 입력을 모델 학습에 쓰지 않고 모델 제공사와 공유하지 않는다. 개인정보 처리방침의 처리 위탁 대상에 AWS를 적을지는 BE-17·S01에서 검토한다.

## 하지 않는 것

- 교차 리전 추론(Geo·Global)
- 여러 모델 동시 운영이나 자동 전환(fallback)
- 로컬 GPU·vLLM 실행 경로. 로컬도 같은 Bedrock을 부른다.
