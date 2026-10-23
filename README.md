# nerdnam-docs

nerdnam(AI 맞춤형 지원서 코치) 프로젝트의 공용 문서 레포지토리입니다.
서버 코드는 `nerdnam-web`, `nerdnam-api`, `nerdnam-ai` 세 레포에서 각각 개발하고, 이 레포에는 세 팀이 함께 보는 기준 자료를 둡니다.

## 들어 있는 것

| 경로 | 내용 | 주로 보는 사람 |
| --- | --- | --- |
| `기획서.md` | 서비스 정의, 기능 명세, 데이터 설계, 아키텍처, 로드맵 | 전원 |
| `작업목록.md` | 프론트엔드·백엔드·AI 담당별 작업 목록, 진행 순서, 먼저 정할 것 | 전원 |
| `design/` | 화면 디자인 (HTML·CSS·JS, 빌드 없이 바로 열림) | 웹, API |
| `contracts/` | 서버 간 API 계약 (OpenAPI) · 추가 예정 | 경계를 맞대는 두 담당 |
| `fixtures/` | 세 레포가 함께 쓰는 예시 데이터 (`fixtures/README.md`) | 전원 |
| `adr/` | 설계 결정 기록 (`0001-gpu-model-serving.md`, `0002-project-registration-rules.md`, `0003-report-diagnosis-gap-guide.md`, `0004-remove-project-image.md`) | 전원 |

## 화면 디자인 보는 법

`design/screens.html`을 브라우저로 열면 전체 화면 목록이 나옵니다. 각 화면은 버튼과 링크로 이어져 있어 S01(`design/index.html`)부터 순서대로 눌러 볼 수 있습니다.

```text
design/
├── screens.html            # 화면 목록 (여기서 시작)
├── index.html              # S01 시작하기
├── skills.html             # S02 기술스택 입력
├── career.html             # S03 경력 입력
├── project.html            # S04 프로젝트 입력
├── review.html             # S05 재구성 검토
├── library.html            # S06 내 경험 라이브러리
├── jd.html                 # S07 JD 입력
├── report.html             # S08 적합도 리포트
├── guide.html              # S09 작성 방향 (#motive #intro #portfolio #career #image)
└── assets/
    ├── css/style.css       # 디자인 토큰(:root) + 공용 컴포넌트
    └── js/
        ├── common.js       # 아이콘 스프라이트, 공용 헬퍼
        ├── guide-data.js   # S09 예시 데이터 (/guide 응답 형태 참고용)
        └── *.js            # 화면별 동작
```

- 파일을 더블클릭해서 열어도 동작합니다. 글꼴(IBM Plex Sans KR)은 Google Fonts에서 불러오므로 인터넷 연결이 필요하고, 없으면 시스템 글꼴로 보입니다.
- 색·간격·모서리 값은 `assets/css/style.css`의 `:root` 토큰에 모여 있습니다. 프론트엔드 구현 시 이 값을 디자인 토큰으로 옮겨 쓰면 됩니다.
- 화면의 데이터는 모두 기획서 7장의 예시(OO커머스 경력, 결제 승인 API 프로젝트, OO페이 공고)입니다. `[이전 회사명]`처럼 대괄호로 표시한 곳은 실제 값이 들어갈 자리입니다.

## 협업 규칙

- **결정은 문서에 남긴다.** 바뀐 결정은 `기획서.md`에 반영하고, 중요한 결정은 `adr/`에 짧게 기록합니다.
- **계약 변경은 이 레포의 PR로만 한다.** `contracts/` 변경은 세 담당 모두 리뷰합니다. 합의된 계약에는 `contracts-vX.Y.Z` 태그를 달고, 각 서버 레포는 따르는 태그를 README에 적습니다.
- **기획서 버전 번호는 겹치지 않게 한다.** PR을 올리기 전에 열린 PR이 쓰는 기획서 버전을 확인하고 그다음 번호를 씁니다. 그래도 겹치면 나중에 머지되는 PR이 번호를 올리고, 변경 이력은 두 줄을 모두 남깁니다.
- **예시 데이터는 하나로 맞춘다.** 웹 목업, API 통합 테스트, AI 평가 세트가 `fixtures/`의 같은 데이터를 씁니다.
