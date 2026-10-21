/* S09 작성 방향성 예시 데이터
   - 실제 서비스에서는 API 서버 응답(AI 서버 /guide 결과)으로 대체되는 부분입니다.
   - 필드 구성은 기획서 3장 F5·F6, 5.5 /guide 응답을 기준으로 했습니다. */
window.GUIDE_DATA = (function () {
  'use strict';
  var P1 = '결제 승인 API 성능 개선', P2 = '정산 배치 쿼리 개선', C1 = '경력 · OO커머스';

  return {
    tabs: [
      { id: 'motive', label: '지원동기' },
      { id: 'intro', label: '자기소개' },
      { id: 'portfolio', label: '포트폴리오' },
      { id: 'career', label: '경력기술서' },
      { id: 'image', label: '이미지 프롬프트' }
    ],

    docs: {
      motive: {
        outlineTitle: '문단 구성',
        regenHint: '예: 회사의 기술 블로그 이야기로 시작하고 싶어요',
        message: '결제 성능 문제를 풀어 본 경험을, 더 큰 결제 트래픽에서 이어 가고 싶다.',
        outline: [
          { t: '회사가 지금 풀고 있는 문제', d: '공고의 주요 업무 “대용량 트래픽 대응을 위한 아키텍처 개선”에서 출발하세요. 회사 서비스와 최근 소식은 직접 확인해 채우세요: [회사 관련 사실]', src: [] },
          { t: '내가 겪은 비슷한 문제', d: '프로모션 피크에 결제 승인 응답이 1.2초까지 늘었던 상황', src: [P1] },
          { t: '합류하면 기여할 지점', d: '캐시와 비동기 분리로 병목을 줄인 방식을 결제 승인·정산 시스템 개선에 잇기', src: [P1] }
        ],
        keywords: ['결제 승인', '대용량 트래픽', '아키텍처 개선'],
        avoid: ['회사 칭찬만 나열하기', '확인하지 않은 회사 정보 쓰기']
      },
      intro: {
        outlineTitle: '문단 구성',
        regenHint: '예: 협업 경험을 더 앞에 두고 싶어요',
        message: '병목을 수치로 찾고, 구조로 해결하는 백엔드 개발자',
        outline: [
          { t: '한 문장 소개', d: '핵심 메시지를 첫 문장으로 쓰고, Spring 기반으로 3년 넘게 일했다는 점을 함께 밝히세요.', src: [C1] },
          { t: '대표 근거 1 · 필수 “대용량 트래픽” 대응', d: '평균 응답 1.2초 → 0.3초, 피크 처리량 약 2배를 장애 없이 처리', src: [P1] },
          { t: '대표 근거 2 · 필수 “RDBMS·쿼리 튜닝” 대응', d: '정산 배치의 실행 계획 분석과 인덱스 재설계', src: [P2] },
          { t: '일하는 방식', d: '팀 4명 중 백엔드 리드로 설계부터 구현까지 맡은 경험', src: [P1] }
        ],
        keywords: ['응답시간 75% 단축', '비동기 처리', '쿼리 튜닝'],
        avoid: ['기술 이름만 나열하기', '원문에 없는 수치 덧붙이기'],
        coverage: [
          { text: 'Java/Spring 기반 개발 경력 3년 이상', kind: '필수', covered: true, where: '문단 1 · 한 문장 소개' },
          { text: '대용량 트래픽 처리 경험', kind: '필수', covered: true, where: '문단 2 · 결제 승인 API' },
          { text: 'RDBMS 설계 및 쿼리 튜닝 경험', kind: '필수', covered: true, where: '문단 3 · 정산 배치' },
          { text: 'Kafka 등 메시지 큐 운영 경험', kind: '우대', covered: true, where: '문단 2 · 비동기 분리' },
          { text: '결제·금융 도메인 경험', kind: '우대', covered: false, where: '경력기술서에서 범위를 밝혀 다루기' },
          { text: 'Kubernetes 운영 경험', kind: '우대', covered: false, where: '다루지 않음 · 근거 없음' }
        ]
      },
      portfolio: {
        outlineTitle: '포트폴리오 구성',
        regenHint: '예: 정산 배치 프로젝트를 먼저 보여 주고 싶어요',
        message: '문제 → 설계 선택의 이유 → Before/After 수치 순서로 보여 주기',
        outline: [
          { t: '대표 프로젝트 1 · 결제 승인 API 성능 개선', d: '필수 “대용량 트래픽”과 우대 “메시지 큐”를 함께 증명해요. 아래 6쪽 흐름으로 구성하세요.', src: [P1] },
          { t: '대표 프로젝트 2 · 정산 배치 쿼리 개선', d: '필수 “RDBMS·쿼리 튜닝” 대응. 실행 계획 전후 비교를 표로 정리하세요.', src: [P2] },
          { t: '학습 중 · Kubernetes', d: '개인 학습이 있다면 맨 끝에 “학습 중”으로 따로 표기하세요.', src: [] }
        ],
        keywords: ['설계 선택의 이유', 'Before/After'],
        avoid: ['모든 프로젝트를 시간순으로 나열하기', '생성 이미지에 수치 넣기'],
        pages: [
          { title: '커버', hint: '프로젝트명 · 역할 · 기간', tool: '이미지 생성', kind: 'image' },
          { title: '문제', hint: '평균 응답 1.2초, 결제 이탈 발생', tool: '텍스트', kind: 'text' },
          { title: '원인', hint: '승인마다 DB 조회 + 동기 후처리 구조', tool: '다이어그램', kind: 'diagram' },
          { title: '해결 설계', hint: 'Redis 캐시 · Kafka 비동기 분리, 선택 이유', tool: '다이어그램', kind: 'diagram' },
          { title: '결과', hint: '평균 응답 1.2초 → 0.3초 · 피크 처리량 약 2배', tool: '차트', kind: 'chart' },
          { title: '배운 점', hint: '다음에 다르게 할 것 · [직접 작성]', tool: '텍스트', kind: 'text' }
        ]
      },
      career: {
        outlineTitle: '작성 순서',
        regenHint: '예: 이전 회사 경력도 공고에 맞춰 바꿔 줘',
        message: 'OO커머스 업무를 공고 용어로 다시 쓰고, 업무마다 성과를 한 줄씩',
        outline: [
          { t: 'OO커머스 · 결제플랫폼팀 (2023.03 – 현재)', d: '최근 경력을 맨 위에. 업무 문장은 아래 “공고 용어로 바꿔 쓰기”를 참고하세요.', src: [C1] },
          { t: '업무별 성과 한 줄', d: '평균 응답 1.2초 → 0.3초 · 승인 후처리 Kafka 비동기 분리', src: [P1] },
          { t: '도메인 범위 밝히기', d: '“커머스 결제”로 정확히 쓰고, 금융권 경험으로 넓히지 않기', src: [] }
        ],
        keywords: ['대용량 트래픽', '메시지 큐', '결제 승인·정산'],
        avoid: ['담당 업무만 쓰고 성과 빼기'],
        rewrites: [
          { from: '결제 승인·취소 API 설계와 운영', to: '대용량 결제 트래픽을 처리하는 승인·취소 API 설계·운영', req: '필수 · 대용량 트래픽' },
          { from: '정산 배치 개발과 쿼리 성능 개선', to: '정산 배치 개발, 실행 계획 분석과 인덱스 재설계로 쿼리 튜닝', req: '필수 · 쿼리 튜닝' },
          { from: '(프로젝트) 후처리를 Kafka로 비동기 분리', to: 'Kafka 기반 메시지 큐로 결제 승인 후처리 비동기화', req: '우대 · 메시지 큐' }
        ]
      }
    },

    image: {
      regenHint: '예: 커버를 더 밝은 톤으로 바꿔 줘',
      prompts: [
        {
          id: 'img1', title: '커버 이미지 · 결제 승인 API 성능 개선', purpose: '포트폴리오 1쪽 커버', ratio: '16:9',
          prompt: 'Clean isometric illustration of a payment request flowing through a fast server pipeline, a glowing cache layer and an asynchronous message queue branching off, minimal flat tech style, navy and teal palette, soft lighting, white background, 16:9, no text, no logos',
          negative: 'text, letters, numbers, brand logos, cluttered background, photorealistic people'
        },
        {
          id: 'img2', title: '개념 이미지 · 동기 처리 vs 비동기 처리', purpose: '포트폴리오 4쪽 보조 이미지', ratio: '4:3',
          prompt: 'Two side-by-side minimal abstract compositions: on the left a single long chain of blocks waiting in a queue, on the right a short chain with branches flowing in parallel, flat vector style, navy, teal and light gray, white background, 4:3, no text',
          negative: 'text, labels, numbers, logos, 3D clutter'
        }
      ],
      toolVisuals: [
        { name: '원인 구조 도식', where: '포트폴리오 3쪽', tool: '다이어그램' },
        { name: '해결 설계 Before/After 도식', where: '포트폴리오 4쪽', tool: '다이어그램' },
        { name: '응답시간 비교 차트', where: '포트폴리오 5쪽', tool: '차트' }
      ]
    }
  };
})();
