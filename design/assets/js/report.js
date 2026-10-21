/* S08 적합도 리포트: 판정 필터(전체·충족·부분·미충족)와 요건 목록 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  var P1 = { label: '결제 승인 API 성능 개선', href: 'review.html' };
  var P2 = { label: '정산 배치 쿼리 개선', href: 'review.html' };
  var C1 = { label: '경력 · OO커머스', href: 'career.html' };
  var K1 = { label: '기술 · Spring Boot (능숙)', href: 'skills.html' };

  // 예시 데이터 (기획서 7.1)
  var ROWS = [
    { v: 'ok', kind: '필수', text: 'Java/Spring 기반 개발 경력 3년 이상', reason: 'Spring Boot를 능숙하게 다루고, Spring을 쓴 경력의 재직기간을 합산하면 3년 이상이에요.', sources: [K1, C1] },
    { v: 'ok', kind: '필수', text: 'RDBMS 설계 및 쿼리 튜닝 경험', reason: '정산 배치에서 실행 계획 분석과 인덱스 재설계를 했어요.', sources: [P2] },
    { v: 'ok', kind: '필수', text: '대용량 트래픽 처리 경험', reason: '프로모션 피크 처리량 약 2배를 장애 없이 처리했어요.', sources: [P1] },
    { v: 'ok', kind: '우대', text: 'Kafka 등 메시지 큐 운영 경험', reason: '승인 후처리를 Kafka 비동기 처리로 분리했어요.', sources: [P1] },
    { v: 'part', kind: '우대', text: '결제·금융 도메인 경험', reason: '커머스 결제 시스템 경험은 있지만 금융권 규제 관련 경험은 없어요.', sources: [C1, P1] },
    { v: 'miss', kind: '우대', text: 'Kubernetes 운영 경험', reason: '저장된 경험에서 관련 근거를 찾지 못했어요.', sources: [] }
  ];

  var VERDICT = {
    ok: '<span class="verdict verdict--ok">' + icon('check', 'i--sm i--bold') + '충족</span>',
    part: '<span class="verdict verdict--part">' + icon('half', 'i--sm') + '부분 충족</span>',
    miss: '<span class="verdict verdict--miss">' + icon('x', 'i--sm i--bold') + '미충족</span>'
  };

  var filter = 'all';
  var $filters = document.getElementById('filters');
  var $rows = document.getElementById('req-rows');

  function count(v) { return ROWS.filter(function (r) { return r.v === v; }).length; }

  function render() {
    var F = [['all', '전체 ' + ROWS.length], ['ok', '충족 ' + count('ok')], ['part', '부분 ' + count('part')], ['miss', '미충족 ' + count('miss')]];
    $filters.innerHTML = F.map(function (f) {
      return '<button class="chip chip--sm" aria-pressed="' + (f[0] === filter) + '" data-filter="' + f[0] + '">' + f[1] + '</button>';
    }).join('');

    $rows.innerHTML = ROWS.filter(function (r) { return filter === 'all' || r.v === filter; }).map(function (r) {
      var sources = r.sources.map(function (s) {
        return '<a class="src" href="' + s.href + '">' + icon('link', 'i--sm') + esc(s.label) + '</a>';
      }).join('');
      return '<li style="display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 18px 0; border-top: 1px solid var(--line)">' +
        '<div>' + VERDICT[r.v] + '</div>' +
        '<div class="stack stack--sm">' +
        '<div class="row" style="align-items: baseline"><span style="font-size: 12px; font-weight: 700; color: var(--subtle)">' + r.kind + '</span><strong style="font-size: 16px; font-weight: 600">' + esc(r.text) + '</strong></div>' +
        '<p style="font-size: 14px; line-height: 1.6; color: var(--muted)">' + esc(r.reason) + '</p>' +
        (sources ? '<div class="row" style="gap: 6px">' + sources + '</div>' : '') +
        '</div></li>';
    }).join('');
  }

  $filters.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    render();
  });

  render();
})();
