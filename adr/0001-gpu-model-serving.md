# ADR-0001: GPU·모델 서빙 구성

- 상태: **제안** (PR 리뷰 후 합의되면 "결정"으로 변경)
- 날짜: 2026-10-22
- 담당: AI
- 관련: 기획서 5.3·8장, 작업목록 D-4 · AI-02 · AI-03

## 배경

- LLM은 Qwen3.5-9B를 직접 띄워서 쓰기로 했지만(기획서 v1.7), 서빙 방식(D-4)과 임베딩 모델은 정하지 않은 상태였다.
- 사용자가 많아질 때를 대비해 LLM과 임베딩 모두 GPU에서 서빙한다.

## 결정 (제안)

| 항목 | 선택 |
| --- | --- |
| LLM | **Qwen/Qwen3.5-9B**, vLLM으로 서빙, `--language-model-only` |
| LLM을 경량화할 때 | ① 9B 양자화: `RedHatAI/Qwen3.5-9B-FP8-dynamic`(L4), `RedHatAI/Qwen3.5-9B-quantized.w4a16` ② **Qwen/Qwen3.5-4B** |
| 임베딩 | **google/embeddinggemma-2**, 텍스트 768차원, GPU 서빙 |
| 인프라 | AWS 서울 리전 EC2 GPU 1대. **g6.xlarge(L4 24GB) 권장**, 최소 g4dn.xlarge(T4 16GB) |
| 운영 | 사용할 때만 켜고, 매일 정해진 시간에 자동 종료(EventBridge Scheduler 또는 cron). AWS Budgets 알림 설정 |
| 정밀도 | L4: LLM BF16 또는 FP8, 임베딩 BF16 / T4: LLM FP16, 임베딩 FP32 (T4는 BF16·FP8 미지원, 임베딩을 FP16으로 돌리면 NaN 위험) |

### 지켜야 할 규칙

- **임베딩 모델의 revision과 차원은 고정한다.** `embedding_model` 값에 revision과 차원을 함께 기록한다(예: `google/embeddinggemma-2@<rev>:768`). 바꾸면 저장된 벡터를 전부 다시 계산해야 하므로, BE가 벡터 저장을 시작하기 전(묶음 1 끝)에 확정한다.
- **임베딩 접두어는 AI 서버가 붙인다.**
  - 질의: `task: search result | query: …`
  - 문서: `title: … | text: …`
- **경량화는 LLM 쪽에서만 한다.** LLM은 환경변수만 바꾸면 교체할 수 있지만, 임베딩은 모델을 바꾸면 전체를 다시 계산해야 한다.
- **vLLM과 임베딩은 서로 다른 컨테이너(환경)로 분리한다.** 두 쪽이 요구하는 transformers 버전이 충돌하는 것을 Kaggle 테스트에서 확인했다.

## 근거: Kaggle T4 테스트 (2026-10-22)

**환경:** Tesla T4 15GB 1장(GPU 0번만 사용), driver 580, vllm 0.32.0, torch 2.13.0+cu130, transformers 5.20.2, sentence-transformers 6.2.0
**모델:** Qwen3.5-4B(FP16)와 embeddinggemma-2(FP32)를 같은 GPU에 올림
**입력:** 기획서 7장 예시 원문(결제 승인 API 프로젝트)으로 재구성 10회

| 항목 | 결과 | 판정 |
| --- | --- | --- |
| VRAM (두 모델 동시) | 13,881 / 15,360 MiB (vLLM 10.9GB + 임베딩 약 3GB) | PASS, 여유 약 1.5GB |
| JSON 스키마 강제 | 10/10 | PASS |
| thinking 끄기 (`enable_thinking: false`) | `<think>` 0회 | PASS |
| 재구성 응답 시간 | 중앙값 11.1초 (목표 15초). 첫 실행 몇 번과 일부 실행은 약 20~24초 | PASS |
| 원문에 없는 숫자 | 없음 | PASS |
| 사례 나누기 | 2개 사례로 올바르게 나눔, 원문에 없는 정보는 확인 질문으로 남김 | 육안 확인 |
| 임베딩 검색 (한글 요건 4개) | top-1 3/4. "대용량 트래픽 처리"의 정답 사례가 2위 | FAIL. 후보 20개 → `/match` 리랭킹 구조가 필요하다는 근거 |

**테스트 중 발견한 설정 (운영에 반영):**

- vLLM 기본값(`max-num-seqs 256`)이면 T4에서 CUDA 그래프를 준비하다가 OOM이 난다. `--max-num-seqs 16 --max-cudagraph-capture-size 16`으로 해결했다.
- vLLM이 설치한 torch(cu130)와 기존 torchaudio의 CUDA 버전이 달라 vLLM이 시작하지 못했다. torchaudio를 제거했다(음성 기능은 쓰지 않음).
- embeddinggemma-2를 불러오려면 transformers 5.20 이상과 sentence-transformers 6.1 이상이 필요하다.
- embeddinggemma-2는 이미지·음성 인코더까지 함께 올라가 FP32 기준 약 2.8GB를 차지한다. 텍스트 인코더만 올리는 방법은 아직 확인하지 못했다.
- 서버를 켠 직후 첫 요청들은 예열 때문에 느리다. 서버를 켜면 예열 요청을 먼저 보낸다.

**한계:** 이 테스트는 9B가 아니라 **4B**로 했다. 서빙이 되는지(VRAM, JSON, thinking 끄기)는 참고할 수 있지만, 품질과 속도는 9B·L4 환경에서 다시 측정해야 한다(G1).

## 영향

- **BE**
  - AI 서버 연결 실패를 짧은 타임아웃(예: 2초)으로 감지해 F4 실패 메시지로 안내한다.
  - 사례 확정은 성공 처리하고, 청크를 "임베딩 대기" 상태로 저장해 GPU가 켜지면 다시 처리한다.
  - pgvector 컬럼 차원을 768로 맞춘다(계약 C-04에 명시).
- **FE:** AI 서버가 꺼져 있을 때 보여 줄 실패 상태 화면이 필요하다(기존 F4 메시지 재사용).
- **비용:** GPU 요금은 켜 둔 시간만큼 나간다. 인스턴스를 꺼도 EBS 요금은 계속 나간다. NAT Gateway는 만들지 않는다. 클로즈드 베타(4주) 동안 24시간 운영할 예산은 없으므로, G3 전에 운영 방식을 따로 정한다.

## 남은 결정

- [ ] G1: Qwen3.5-9B(L4, FP8 또는 w4a16)를 4B와 같은 평가 세트로 비교하고, 최종 모델과 인스턴스(g6 또는 g4dn)를 확정한다.
- [ ] 임베딩 비교: embeddinggemma-2와 bge-m3를 평가 세트(AI-11)로 비교하고, 텍스트 인코더만 로드하는 방법을 확인한다.
- [ ] 베타 운영 방식: 정해진 시간에만 운영 / 추가 예산 / 토큰 단위 과금 API로 전환 중 선택한다.
