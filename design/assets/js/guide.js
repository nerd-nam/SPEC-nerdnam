/* S09 작성 방향성: 탭 전환(주소 해시와 연동), 탭별 패널 렌더링, 복사 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon, D = window.GUIDE_DATA;

  var $tabs = document.getElementById('tabs');
  var $panel = document.getElementById('panel');
  var $tone = document.getElementById('tone');
  var current = null;
  var copyTimer = null;

  function validTab(id) { return D.tabs.some(function (t) { return t.id === id; }); }

  /* ---------- 공통 블록 ---------- */
  function messageBlock(doc) {
    return '<div class="card card--dark" style="padding: 24px 26px; gap: 10px">' +
      '<span class="card__label">핵심 메시지</span>' +
      '<p style="font-size: 21px; line-height: 1.5; font-weight: 600">“' + esc(doc.message) + '”</p></div>';
  }

  function outlineBlock(doc) {
    var items = doc.outline.map(function (o, i) {
      var src = o.src.map(function (s) { return '<a class="src" href="review.html">' + icon('link', 'i--sm') + '근거 · ' + esc(s) + '</a>'; }).join('');
      return '<li style="display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; padding: 16px 0; border-top: 1px solid #EEF0F3">' +
        '<span class="num">' + (i + 1) + '</span>' +
        '<div class="stack" style="gap: 6px"><strong style="font-size: 16px; font-weight: 600">' + esc(o.t) + '</strong>' +
        '<p style="font-size: 15px; line-height: 1.65; color: var(--muted)">' + esc(o.d) + '</p>' +
        (src ? '<div class="row" style="gap: 6px">' + src + '</div>' : '') + '</div></li>';
    }).join('');
    return '<div class="card" style="gap: 4px">' +
      '<div class="row row--between" style="margin-bottom: 8px"><h2 class="card__title card__title--sm">' + esc(doc.outlineTitle) + '</h2>' +
      '<button class="btn btn--sm" data-copy="doc">' + icon('copy', 'i--sm') + '<span>구성 복사</span></button></div>' +
      '<ol class="plain">' + items + '</ol></div>';
  }

  function keywordAvoidBlock(doc) {
    return '<div class="grid-2">' +
      '<div class="card card--sm"><h2 class="card__title card__title--xs">강조할 키워드</h2><div class="row" style="gap: 6px">' +
      doc.keywords.map(function (k) { return '<span class="tag" style="border: 0; background: var(--surface-muted); padding: 5px 12px; font-size: 14px; font-weight: 500">' + esc(k) + '</span>'; }).join('') +
      '</div></div>' +
      '<div class="card card--bad card--sm"><h2 class="card__title card__title--xs" style="color: var(--bad)">피해야 할 것</h2>' +
      '<ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.8">' + doc.avoid.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>' +
      '</div>';
  }

  /* ---------- 탭 전용 블록 ---------- */
  function coverageBlock(rows) {
    var body = rows.map(function (c) {
      var where = c.covered
        ? '<span class="row" style="gap: 6px; color: var(--ok); font-weight: 600; flex-wrap: nowrap">' + icon('check', 'i--sm i--bold') + esc(c.where) + '</span>'
        : '<span class="row" style="gap: 6px; color: var(--subtle); flex-wrap: nowrap">' + icon('dash', 'i--sm') + esc(c.where) + '</span>';
      return '<tr><td class="cell-strong">' + esc(c.text) + '</td><td class="cell-muted" style="font-size: 13px">' + c.kind + '</td><td>' + where + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="stack stack--xs"><h2 class="card__title card__title--sm">요건 커버리지</h2>' +
      '<p class="card__desc">자기소개의 어느 문단이 공고의 어떤 요건을 다루는지 보여 줘요.</p></div>' +
      '<div class="table-wrap"><table class="table table--boxed"><thead><tr><th scope="col">요건</th><th scope="col">구분</th><th scope="col">다루는 곳</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function thumb(kind) {
    if (kind === 'image') return '<div class="wf-image"></div><div class="wf-line" style="width: 55%; background: var(--line-dashed)"></div>';
    if (kind === 'diagram') return '<div class="wf-title"></div><div class="wf-flow"><div class="wf-box"></div><div class="wf-link"></div><div class="wf-box wf-box--accent"></div><div class="wf-link"></div><div class="wf-box"></div></div>';
    if (kind === 'chart') return '<div class="wf-title"></div><div class="wf-chart"><span style="height: 88%; background: var(--line-dashed)"></span><span style="height: 24%; background: var(--accent)"></span></div>';
    return '<div class="wf-title"></div><div class="wf-line" style="margin-top: 6px"></div><div class="wf-line" style="width: 92%"></div><div class="wf-line" style="width: 70%"></div>';
  }

  function pagesBlock(pages) {
    var items = pages.map(function (p, i) {
      return '<li class="stack" style="gap: 10px"><div class="thumb" aria-hidden="true">' + thumb(p.kind) + '</div>' +
        '<div class="stack stack--xs"><div class="row row--between" style="align-items: baseline; flex-wrap: nowrap"><strong style="font-size: 14px">' + (i + 1) + '쪽 · ' + esc(p.title) + '</strong>' +
        '<span style="font-size: 12px; font-weight: 600; color: var(--subtle); white-space: nowrap">' + esc(p.tool) + '</span></div>' +
        '<span style="font-size: 13px; line-height: 1.5; color: var(--muted)">' + esc(p.hint) + '</span></div></li>';
    }).join('');
    return '<div class="card"><div class="row row--between" style="align-items: baseline">' +
      '<div class="stack stack--xs"><h2 class="card__title card__title--sm">페이지 흐름 · 대표 프로젝트 1</h2>' +
      '<p class="card__desc">결제 승인 API 성능 개선을 ' + pages.length + '쪽으로 구성하는 제안이에요.</p></div>' +
      '<span class="page-meta" style="font-size: 13px">도식·차트는 도구로, 커버만 이미지 생성</span></div>' +
      '<ol class="plain grid-3">' + items + '</ol></div>';
  }

  function rewriteBlock(rows) {
    var body = rows.map(function (r) {
      return '<tr><td class="cell-muted">' + esc(r.from) + '</td><td style="padding: 12px 0; color: var(--subtle)">' + icon('arrow', 'i--sm') + '</td>' +
        '<td class="cell-strong">' + esc(r.to) + '</td><td><span class="tag--accent">' + esc(r.req) + '</span></td></tr>';
    }).join('');
    return '<div class="card"><div class="stack stack--xs"><h2 class="card__title card__title--sm">공고 용어로 바꿔 쓰기</h2>' +
      '<p class="card__desc">입력한 주요 업무를 공고의 요건 표현에 맞춰 다시 쓴 제안이에요.</p></div>' +
      '<div class="table-wrap"><table class="table table--boxed" style="line-height: 1.55"><thead><tr><th scope="col">지금 표현</th><th aria-hidden="true" style="padding: 10px 0"></th><th scope="col">바꾼 표현</th><th scope="col">맞춘 요건</th></tr></thead><tbody>' + body + '</tbody></table></div></div>' +
      '<div class="card"><div class="row row--between" style="align-items: baseline"><h2 class="card__title card__title--sm">미리보기</h2><span class="page-meta" style="font-size: 13px">예시예요. 문장은 직접 다듬으세요.</span></div>' +
      '<div class="paper"><div class="paper__head"><span style="font-size: 17px; font-weight: 700">OO커머스 <span style="font-weight: 500; font-size: 15px; color: var(--muted)">결제플랫폼팀 · 백엔드 개발자</span></span><span class="cell-muted" style="font-size: 14px">2023.03 – 현재</span></div>' +
      '<ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 12px; font-size: 15px; line-height: 1.65">' +
      '<li><strong style="font-weight: 600">대용량 결제 트래픽을 처리하는 승인·취소 API 설계·운영</strong><div class="cell-muted" style="font-size: 14px">– Redis 캐시와 Kafka 비동기 분리로 프로모션 피크 평균 응답 1.2초 → 0.3초</div></li>' +
      '<li><strong style="font-weight: 600">정산 배치 개발, 실행 계획 분석과 인덱스 재설계로 쿼리 튜닝</strong><div class="cell-muted" style="font-size: 14px">– [배치 처리 시간 변화]</div></li>' +
      '</ul></div></div>';
  }

  function imagePanel(img) {
    var prompts = img.prompts.map(function (p) {
      return '<article class="card" style="padding: 22px; gap: 14px">' +
        '<div class="row row--between" style="align-items: flex-start; gap: 12px"><div class="stack stack--xs"><h2 class="card__title card__title--sm">' + esc(p.title) + '</h2>' +
        '<span class="card__desc">' + esc(p.purpose) + ' · 비율 ' + esc(p.ratio) + '</span></div>' +
        '<button class="btn btn--sm" data-copy="' + p.id + '">' + icon('copy', 'i--sm') + '<span>프롬프트 복사</span></button></div>' +
        '<div class="stack" style="gap: 6px"><span class="code-label">PROMPT</span><pre class="code">' + esc(p.prompt) + '</pre></div>' +
        '<div class="stack" style="gap: 6px"><span class="code-label">NEGATIVE</span><pre class="code code--light">' + esc(p.negative) + '</pre></div></article>';
    }).join('');
    var tools = img.toolVisuals.map(function (v) {
      return '<li style="display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center; padding: 12px 0; border-top: 1px solid #EEF0F3; font-size: 14px">' +
        '<span class="cell-strong">' + esc(v.name) + '</span><span class="page-meta">' + esc(v.where) + '</span><span class="tag tag--flat" style="font-weight: 600">' + esc(v.tool) + '</span></li>';
    }).join('');
    return '<p class="callout callout--warn">' + icon('alert') + '<span>이미지 생성은 분위기를 전하는 그림에만 쓰세요. 글자·숫자가 정확해야 하는 도식과 차트는 아래 “도구로 만들 시각자료”를 참고하세요.</span></p>' +
      prompts +
      '<div class="card" style="padding: 22px; gap: 12px"><h2 class="card__title card__title--sm">도구로 만들 시각자료</h2><ul class="plain">' + tools + '</ul></div>';
  }

  /* ---------- 렌더링 ---------- */
  function render(tab) {
    current = tab;
    $tabs.innerHTML = D.tabs.map(function (t) {
      return '<button class="tab" role="tab" id="tab-' + t.id + '" aria-controls="panel" aria-selected="' + (t.id === tab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('');
    $panel.setAttribute('aria-labelledby', 'tab-' + tab);

    if (tab === 'image') {
      $panel.innerHTML = imagePanel(D.image);
      $tone.placeholder = D.image.regenHint;
      return;
    }
    var doc = D.docs[tab];
    var extra = '';
    if (tab === 'intro') extra = coverageBlock(doc.coverage);
    if (tab === 'portfolio') extra = pagesBlock(doc.pages);
    if (tab === 'career') extra = rewriteBlock(doc.rewrites);
    $panel.innerHTML = messageBlock(doc) + outlineBlock(doc) + extra + keywordAvoidBlock(doc);
    $tone.placeholder = doc.regenHint;
  }

  function docText(doc) {
    return '핵심 메시지: ' + doc.message + '\n' + doc.outline.map(function (o, i) { return (i + 1) + '. ' + o.t + ' — ' + o.d; }).join('\n');
  }

  $tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    if (location.hash !== '#' + b.dataset.tab) location.hash = b.dataset.tab;
    else render(b.dataset.tab);
  });

  // 방향키로 탭 이동
  $tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var ids = D.tabs.map(function (t) { return t.id; });
    var next = ids[(ids.indexOf(current) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    location.hash = next;
    setTimeout(function () { var el = document.getElementById('tab-' + next); if (el) el.focus(); }, 0);
  });

  $panel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (!b) return;
    var key = b.dataset.copy;
    var text = key === 'doc' ? docText(D.docs[current]) : (D.image.prompts.filter(function (p) { return p.id === key; })[0] || {}).prompt;
    UI.copyText(text || '');
    var label = b.querySelector('span');
    var original = b.dataset.label || (b.dataset.label = label.textContent);
    label.textContent = '복사됨';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { label.textContent = original; }, 1600);
  });

  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    render(validTab(id) ? id : 'motive');
  });

  var initial = location.hash.slice(1);
  render(validTab(initial) ? initial : 'motive');
})();
