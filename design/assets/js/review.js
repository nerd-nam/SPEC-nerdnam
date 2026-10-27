/* S05 재구성 검토: 한 프로젝트에서 나온 사례(에피소드)를 하나씩 확정·제외
   - 사례마다 버전(v1, v2 …)과 확인 필요 항목이 따로 있음
   - 확인 필요가 남은 사례는 확정할 수 없음
   - 모든 사례를 결정하고 확정한 사례가 1개 이상이면 프로젝트 확정 가능 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  // 예시 데이터: AI 서버 /restructure 응답의 episodes[] 형태를 흉내 냄
  var EPISODES = [
    {
      id: 1, title: '결제 승인 응답 지연 개선',
      role: '백엔드 리드 (팀 4명)', skills: ['Spring Boot', 'Redis', 'Kafka'],
      problem: '프로모션 기간 결제 승인 API의 평균 응답이 1.2초까지 늘어나 결제 이탈이 발생했다. 승인마다 가맹점 정보를 DB에서 조회하고, 알림·포인트 적립 같은 후처리를 동기로 처리한 것이 원인이었다.',
      solution: '가맹점 조회를 Redis 캐시로 전환하고, 승인 후처리를 Kafka 기반 비동기 처리로 분리했다. 팀 4명 중 백엔드 리드로 설계와 구현을 맡았다.',
      versions: {
        1: { result: '평균 응답시간을 1.2초에서 0.3초로 줄였다.', metrics: [{ name: '평균 응답시간', before: '1.2초', after: '0.3초', source: '원문' }] },
        2: { result: '평균 응답시간을 1.2초에서 0.3초로 75% 줄였고, 다음 프로모션에서는 피크 처리량 약 2배를 장애 없이 처리했다.', metrics: [{ name: '평균 응답시간', before: '1.2초', after: '0.3초', source: '원문' }, { name: '피크 처리량(TPS)', before: '기준', after: '약 2배', source: '확인 질문 답변' }] }
      },
      unverified: [{ key: '1a', q: '결제 이탈이 얼마나 줄었는지는 원문에 없어서 [결과]에 넣지 않았어요. 수치를 알고 있다면 알려 주세요.', placeholder: '예: 결제 이탈률 [개선 전]% → [개선 후]%' }]
    },
    {
      id: 2, title: '프로모션 전 부하 테스트 절차 도입',
      role: '절차 설계·문서화', skills: [],
      problem: '프로모션 트래픽을 미리 확인할 방법이 없어, 성능 문제를 운영 중에야 발견했다.',
      solution: '프로모션 전에 실제 트래픽 패턴으로 부하 테스트를 돌리는 절차를 만들고, 장애 대응 매뉴얼을 정리해 팀에 공유했다.',
      versions: { 1: { result: '다음 프로모션 피크를 문제없이 넘겼다.', metrics: [] } },
      unverified: [{ key: '2a', q: '“피크를 문제없이 넘겼다”는 사례 1의 결과이기도 해요. 부하 테스트 절차 덕분에 달라진 점이 있다면 알려 주세요. (예: 미리 찾아낸 병목, 줄어든 장애 대응 시간)', placeholder: '예: 프로모션 전 병목 [N]건을 미리 발견' }]
    }
  ];

  var state = {
    open: 1,
    status: { 1: 'review', 2: 'review' },   // review | confirmed | excluded
    ver: { 1: 2, 2: 1 },
    resolved: {}
  };

  // 읽기 모드 (review.html#confirmed): 확정한 프로젝트를 볼 때 (기획서 v1.17 F2)
  // 확정한 사례만, 결정·수정 요청·다시 나누기·확인 질문·버전 바꾸기 없음. "수정"은 재등록 안내 후 S04
  var READ = location.hash === '#confirmed';
  if (READ) state.status = { 1: 'confirmed', 2: 'excluded' };

  var $list = document.getElementById('episodes');

  function pendingUnverified(ep) {
    return ep.unverified.filter(function (u) { return !state.resolved[u.key]; });
  }
  function nextOpen(fromId) {
    var p = EPISODES.filter(function (e) { return e.id !== fromId && state.status[e.id] === 'review'; })[0];
    return p ? p.id : null;
  }

  function statusBadge(ep) {
    if (READ) return '<span class="badge badge--ok">' + icon('check', 'i--sm i--bold') + '확정</span>';
    var s = state.status[ep.id];
    if (s === 'confirmed') return '<span class="badge badge--ok">' + icon('check', 'i--sm i--bold') + '확정</span><button class="btn btn--ghost btn--sm" data-act="undo" data-id="' + ep.id + '">다시 검토하기</button>';
    if (s === 'excluded') return '<span class="badge badge--muted">제외 · 저장 안 함</span><button class="btn btn--ghost btn--sm" data-act="undo" data-id="' + ep.id + '">다시 검토하기</button>';
    var n = pendingUnverified(ep).length;
    return n ? '<span class="badge badge--warn">' + icon('alert', 'i--sm') + '확인 필요 ' + n + '</span>' : '<span class="badge badge--info">확정 대기</span>';
  }

  function bodyHtml(ep) {
    var v = state.ver[ep.id], data = ep.versions[v];
    var keys = Object.keys(ep.versions).map(Number);
    var unv = pendingUnverified(ep);

    var versionTabs = !READ && keys.length > 1
      ? '<div class="seg" role="tablist" aria-label="버전" style="padding: 3px">' + keys.map(function (k) {
          var label = k === keys[keys.length - 1] ? 'v' + k + ' · 최신' : 'v' + k;
          return '<button role="tab" aria-selected="' + (k === v) + '" data-act="ver" data-id="' + ep.id + '" data-ver="' + k + '" style="min-height: 32px; font-size: 13px">' + label + '</button>';
        }).join('') + '</div>'
      : '';
    var latest = keys[keys.length - 1];
    var olderNote = v !== latest
      ? '<div class="callout callout--muted" style="align-items: center; justify-content: space-between; flex-wrap: wrap">' +
        '<span>이전 버전(v' + v + ')을 보고 있어요. 지금 쓰는 내용은 최신 버전(v' + latest + ')이에요.</span>' +
        '<button class="btn btn--sm" data-act="use-ver" data-id="' + ep.id + '" data-ver="' + v + '">이 버전으로 바꾸기</button></div>'
      : '';

    var metrics = data.metrics.length
      ? '<div class="table-wrap"><table class="table table--boxed"><caption class="sr-only">정량 성과</caption><thead><tr><th scope="col">지표</th><th scope="col">개선 전</th><th scope="col">개선 후</th><th scope="col">출처</th></tr></thead><tbody>' +
        data.metrics.map(function (m) {
          return '<tr><td class="cell-strong">' + esc(m.name) + '</td><td class="cell-muted">' + esc(m.before) + '</td><td class="cell-strong">' + esc(m.after) + '</td><td class="cell-muted">' + esc(m.source) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '';

    var questions = READ ? '' : unv.map(function (u) {
      return '<section class="card card--warn card--sm" style="padding: 16px 18px; gap: 10px; border-radius: 12px">' +
        '<h4 class="row" style="margin: 0; font-size: 14px; font-weight: 700; color: var(--warn)">' + icon('alert') + '확인 필요</h4>' +
        '<p style="font-size: 15px; line-height: 1.6">' + esc(u.q) + '</p>' +
        '<div class="row"><input class="input" aria-label="' + esc(u.q) + '" placeholder="' + esc(u.placeholder) + '" style="flex: 1 1 240px; width: auto">' +
        '<button class="btn" data-act="resolve" data-key="' + u.key + '">답변 추가</button>' +
        '<button class="btn btn--ghost" data-act="resolve" data-key="' + u.key + '">빼고 진행</button></div></section>';
    }).join('');

    return '<div class="ep__body">' +
      '<div class="row row--between" style="gap: 12px"><div class="row" style="gap: 6px; font-size: 13px; color: var(--muted)"><span>' + esc(ep.role) + '</span>' +
      ep.skills.map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div>' + versionTabs + '</div>' +
      olderNote +
      '<div class="stack" style="gap: 6px"><h3 class="ep__label">[문제]</h3><p class="ep__text">' + esc(ep.problem) + '</p></div>' +
      '<div class="stack" style="gap: 6px"><h3 class="ep__label">[해결]</h3><p class="ep__text">' + esc(ep.solution) + '</p></div>' +
      '<div class="stack" style="gap: 8px"><h3 class="ep__label row">[결과]' + (ep.id === 1 && v === 2 ? ' <span class="badge badge--info">v1에서 바뀜</span>' : '') + '</h3>' +
      '<p class="ep__text">' + esc(data.result) + '</p>' + metrics + '</div>' +
      questions +
      '<div class="ep__foot"><button class="btn btn--ghost btn--danger" data-act="exclude" data-id="' + ep.id + '">이 사례 제외</button>' +
      '<div class="row"><button class="btn">' + icon('refresh', 'i--sm') + '이 사례 수정 요청</button><button class="btn">직접 편집</button>' +
      '<button class="btn btn--primary" data-act="confirm" data-id="' + ep.id + '"' + (unv.length ? ' disabled' : '') + '>' + icon('check', 'i--sm i--bold') + '이 사례 확정</button></div></div>' +
      (unv.length ? '<p class="page-meta" style="margin-top: -6px; text-align: right; font-size: 13px">확인 필요 항목을 처리하면 확정할 수 있어요.</p>' : '') +
      '</div>';
  }

  function render() {
    $list.innerHTML = EPISODES.filter(function (e) { return !READ || state.status[e.id] === 'confirmed'; }).map(function (ep, i) {
      var isOpen = state.open === ep.id;
      var data = ep.versions[state.ver[ep.id]];
      return '<article class="ep">' +
        '<div class="ep__head">' +
        '<button class="ep__toggle" aria-expanded="' + isOpen + '" data-act="toggle" data-id="' + ep.id + '">' +
        '<span class="ep__num ep__num--' + ep.id + '">' + (i + 1) + '</span>' +
        '<span style="min-width: 0"><span class="ep__title">' + esc(ep.title) + '</span>' +
        (isOpen ? '' : '<span class="ep__summary">' + esc(data.result) + '</span>') + '</span></button>' +
        statusBadge(ep) + '</div>' +
        (isOpen ? bodyHtml(ep) : '') + '</article>';
    }).join('');

    var total = EPISODES.length;
    var done = EPISODES.filter(function (e) { return state.status[e.id] !== 'review'; }).length;
    var confirmed = EPISODES.filter(function (e) { return state.status[e.id] === 'confirmed'; }).length;
    var allDone = done === total && confirmed > 0;

    document.getElementById('ep-total').textContent = total;
    document.getElementById('ep-done').textContent = done + ' / ' + total;
    var $progress = document.getElementById('ep-progress');
    $progress.style.gridTemplateColumns = 'repeat(' + total + ', minmax(0, 1fr))';
    $progress.innerHTML = EPISODES.map(function (e) { return '<span class="' + (state.status[e.id] !== 'review' ? 'is-ok' : '') + '"></span>'; }).join('');

    var $confirm = document.getElementById('project-confirm');
    $confirm.setAttribute('aria-disabled', String(!allDone));
    if (allDone) $confirm.removeAttribute('tabindex'); else $confirm.setAttribute('tabindex', '-1');
    document.getElementById('foot-note').textContent = allDone
      ? '확정한 사례 ' + confirmed + '개만 지원서 근거로 저장돼요. 제외한 사례는 저장하지 않아요.'
      : (done < total ? '사례 ' + (total - done) + '개가 남았어요. 모든 사례를 확정하거나 제외하면 프로젝트를 확정할 수 있어요.' : '확정한 사례가 하나 이상 있어야 프로젝트를 확정할 수 있어요.');
  }

  // 읽기 모드: 사례 카드 아래 버튼 줄과 안내 문구를 지운다
  var baseRender = render;
  render = function () {
    baseRender();
    if (READ) document.querySelectorAll('.ep__foot, .ep__body > .page-meta').forEach(function (n) { n.remove(); });
  };

  $list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var id = +b.dataset.id;
    switch (b.dataset.act) {
      case 'toggle': state.open = state.open === id ? null : id; break;
      case 'ver': state.ver[id] = +b.dataset.ver; break;
      case 'resolve': state.resolved[b.dataset.key] = true; break;
      case 'confirm': state.status[id] = 'confirmed'; state.open = nextOpen(id); break;
      case 'exclude': state.status[id] = 'excluded'; state.open = nextOpen(id); break;
      case 'undo': state.status[id] = 'review'; state.open = id; break;
      case 'use-ver': {
        // 고른 이전 버전의 내용을 새 최신 버전으로 복사 (이전 버전들은 그대로 남음)
        var ep = EPISODES.filter(function (e) { return e.id === id; })[0];
        var next = Math.max.apply(null, Object.keys(ep.versions).map(Number)) + 1;
        ep.versions[next] = ep.versions[+b.dataset.ver];
        state.ver[id] = next;
        break;
      }
    }
    render();
  });

  // 다시 나누기: 피드백이 있어야 누를 수 있다 (기획서 F2)
  var $feedback = document.getElementById('feedback');
  var $resplit = document.getElementById('resplit');
  $feedback.addEventListener('input', function () { $resplit.disabled = !$feedback.value.trim(); });

  // 확정 전에 S04(원문 화면)나 온보딩 밖으로 나가는 링크는 경고 후 이동 (기획서 F2 검토 결과 유지 규칙)
  // S02·S03(#reviewing)으로 가는 링크와 프로젝트 확정 버튼은 경고하지 않는다
  var $modal = document.getElementById('leave-modal');
  var $leaveConfirm = document.getElementById('leave-confirm');
  document.addEventListener('click', function (e) {
    if (READ) return; // 읽기 모드는 잃을 검토 결과가 없다
    var a = e.target.closest('a[href]');
    if (!a || a.id === 'project-confirm' || a.id === 'leave-confirm') return;
    var href = a.getAttribute('href');
    if (href.charAt(0) === '#' || href.indexOf('#reviewing') !== -1) return;
    e.preventDefault();
    $leaveConfirm.setAttribute('href', href);
    $modal.hidden = false;
    document.getElementById('leave-cancel').focus();
  });
  document.getElementById('leave-cancel').addEventListener('click', function () { $modal.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $modal.hidden = true; });

  UI.mountRating(document.getElementById('episode-rating'), {
    name: 'episode-score',
    legend: 'AI가 나눈 사례는 어땠나요?',
    placeholder: '예: 사례를 너무 잘게 나눴어요'
  });

  if (READ) {
    // 머리글: 온보딩용("저장하고 나중에 하기") 대신 S06과 같은 앱 머리글 (기획서 v1.21)
    var $brand = document.querySelector('.header .brand');
    $brand.href = 'library.html'; // 로그인 후 머리글의 로고는 내 경험으로 (기획서 v1.63)
    $brand.insertAdjacentHTML('beforebegin', '<div class="header__left"></div>');
    var $left = document.querySelector('.header__left');
    $left.appendChild($brand);
    $left.insertAdjacentHTML('beforeend', '<nav class="nav" aria-label="주 메뉴"><a href="library.html" aria-current="page">내 경험</a><a href="apply.html">지원 준비</a></nav>');
    document.querySelector('.header .header-link').outerHTML = '<button class="avatar" aria-label="계정 메뉴">김</button>';
    document.querySelector('nav[aria-label="온보딩 단계"]').hidden = true;
    var $badge = document.querySelector('.page-head .badge');
    $badge.className = 'badge badge--ok';
    $badge.textContent = '확정';
    // 검토용 안내·진행률은 숨기고(그리기 함수가 계속 쓰므로 지우지 않는다) 읽기 모드 안내와 "수정"을 넣는다
    var $desc = document.querySelector('.page-head__text > p');
    $desc.hidden = true;
    $desc.insertAdjacentHTML('afterend', '<p style="font-size: 15px; color: var(--muted)">확정한 사례가 공고 매칭의 근거로 쓰이고 있어요. 고치려면 수정을 눌러 다시 등록해 주세요.</p>');
    var $progress = document.getElementById('ep-done').closest('.stack');
    $progress.hidden = true;
    $progress.insertAdjacentHTML('afterend', '<a class="btn" href="project.html" id="reregister">수정</a>');
    document.getElementById('reregister').addEventListener('click', function (e) {
      if (!window.confirm('이 프로젝트를 다시 등록할까요?\n원문 입력부터 사례 나누기, 확정까지 다시 거쳐요. 다시 확정하기 전까지는 지금 확정한 사례가 공고 매칭에 계속 쓰여요.')) e.preventDefault();
    });
    document.querySelector('section[aria-labelledby="fb-title"]').hidden = true;
    document.querySelector('section[aria-label="사례 목록"] > .btn--block').hidden = true;
    // 원문 하이라이트에서 제외한 사례(2) 표시를 지운다
    document.querySelectorAll('mark.mark-ep2').forEach(function (m) {
      if (m.closest('p.row')) m.remove(); else m.outerHTML = m.innerHTML;
    });
    document.querySelectorAll('.ep-label--2').forEach(function (l) { l.remove(); });
  }

  render();
})();
