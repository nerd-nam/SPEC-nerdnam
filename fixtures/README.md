# fixtures — 공통 예시 데이터 (C-05)

기획서 7장 예시(OO커머스 경력, 결제 승인 API 프로젝트, OO페이 공고)를 JSON으로 옮긴 것입니다. 웹 목업, API 통합 테스트, AI 평가 세트가 같은 데이터를 씁니다. 각 파일의 `_source`에 근거 문서를 적었습니다.

| 파일 | 내용 | 기준 |
| --- | --- | --- |
| `profile.json` | 기술스택 8개, 경력 1건 (id 1) | 기획서 4.1·4.2, `design/skills.html`·`career.html` |
| `projects.json` | 프로젝트 2건, 원문·확인 질문 답변·사례 | 기획서 4.3, `design/project.html`·`review.js`·`library.html` |
| `chunks.json` | 검색용 청크 13개 (기술 8, 경력 1, 프로젝트 요약 2, 사례 2) | 기획서 4.4, 5.5 `/embed` |
| `jd.json` | OO페이 공고, 요건 6줄과 주요 업무 | 기획서 4.5·7.1, `design/jd.js` |
| `match.json` | 요건별 판정·근거·갭 대응 가이드, 한 줄 진단 | 기획서 4.5·7.1, `design/report.js`·`report.html` |
| `guide.json` | 작성 방향 5개 탭의 `/guide` 응답 (`guides.<tab>`) | api-ai 계약 v0.2 `GuideResponse`, `design/assets/js/guide-data.js` |

## 규칙

- **ID:** 모두 숫자다(API DB ID, api-ai 계약 C-04와 같은 형식). 읽기 쉽게 범위를 나눴다: 사용자·경력·공고 `1`, 프로젝트 `102`·`103`, 사례 `201`~`203`, 요건 `11`~`16`, 청크는 기술 `501`~`508` · 경력 `511` · 프로젝트 요약 `521`·`522` · 사례 `531`·`532`. 모든 `evidence_chunk_ids`·`cited_chunk_ids`는 `chunks.json`에 있다.
- **`source_spans`:** `raw_text`의 문자 위치 `[시작, 끝)`. 끝은 포함하지 않는다.
- **확인 질문 답변:** `projects[].answers`에 따로 둔다. 답변에서 나온 수치는 `metrics[].source`가 `answer`다 (예: 피크 TPS 약 2배).
- **`[대괄호]`:** 아직 정하지 않은 값이다 (프로젝트 103의 역할·결과, 확인 질문 문구). 프로젝트 103은 원문이 없어 `raw_text`가 `null`이다.
- **제외한 사례(202)는 청크를 만들지 않는다.**
- **enum 값:** 기획서 표기(소문자: `framework`, `full_time`, `met`)를 따른다. 대소문자는 C-03 계약에서 정한다 (D-10).
- **청크 `text`:** 4.4 구성을 따른 예시다. 실제 조합 방식은 API 서버가 정한다.
- **청크 `skills`:** 4.4 공통 메타데이터. 하이브리드 검색의 기술명 겹침 점수에 쓴다. 기술 청크는 그 기술, 경력은 사용 기술, 프로젝트 요약·사례는 그 프로젝트의 사용 기술.
- **기술명:** API 서버 기술 사전(`V2__seed_skill_catalog.sql`)의 표준 이름을 쓴다. `Spring Batch`는 사전에 없어 프로젝트에서 추가한 기술(숙련도 1, 학습 중)로 넣었다.
- **`guide.json`:** `design/assets/js/guide-data.js` 예시를 계약 모양으로 옮겼다. 화면 고정 문구(`outlineTitle`, `regenHint`)와 제작 도구 이름(`kind`로 정해짐)은 웹이 가지므로 없다. 요건 문구·필수·우대는 `requirement_id`로 `jd.json`에서 찾는다.
