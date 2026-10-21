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

  var $list = document.getElementById('episodes');

  function pendingUnverified(ep) {
    return ep.unverified.filter(function (u) { return !state.resolved[u.key]; });
  }
  function nextOpen(fromId) {
    var p = EPISODES.filter(function (e) { return e.id !== fromId && state.status[e.id] === 'review'; })[0];
    return p ? p.id : null;
  }

  function statusBadge(ep) {
    var s = state.status[ep.id];
    if (s === 'confirmed') return '<span class="badge badge--ok">' + icon('check', 'i--sm i--bold') + '확정</span><button class="btn btn--ghost btn--sm" data-act="undo" data-id="' + ep.id + '">되돌리기</button>';
    if (s === 'excluded') return '<span class="badge badge--muted">제외 · 저장 안 함</span><button class="btn btn--ghost btn--sm" data-act="undo" data-id="' + ep.id + '">되돌리기</button>';
    var n = pendingUnverified(ep).length;
    return n ? '<span class="badge badge--warn">' + icon('alert', 'i--sm') + '확인 필요 ' + n + '</span>' : '<span class="badge badge--info">확정 대기</span>';
  }

  function bodyHtml(ep) {
    var v = state.ver[ep.id], data = ep.versions[v];
    var keys = Object.keys(ep.versions).map(Number);
    var unv = pendingUnverified(ep);

    var versionTabs = keys.length > 1
      ? '<div class="seg" role="tablist" aria-label="버전" style="padding: 3px">' + keys.map(function (k) {
          var label = k === keys[keys.length - 1] ? 'v' + k + ' · 최신' : 'v' + k;
          return '<button role="tab" aria-selected="' + (k === v) + '" data-act="ver" data-id="' + ep.id + '" data-ver="' + k + '" style="min-height: 32px; font-size: 13px">' + label + '</button>';
        }).join('') + '</div>'
      : '';

    var metrics = data.metrics.length
      ? '<div class="table-wrap"><table class="table table--boxed"><caption class="sr-only">정량 성과</caption><thead><tr><th scope="col">지표</th><th scope="col">개선 전</th><th scope="col">개선 후</th><th scope="col">출처</th></tr></thead><tbody>' +
        data.metrics.map(function (m) {
          return '<tr><td class="cell-strong">' + esc(m.name) + '</td><td class="cell-muted">' + esc(m.before) + '</td><td class="cell-strong">' + esc(m.after) + '</td><td class="cell-muted">' + esc(m.source) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '';

    var questions = unv.map(function (u) {
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
    $list.innerHTML = EPISODES.map(function (ep, i) {
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
    }
    render();
  });

  render();
})();
