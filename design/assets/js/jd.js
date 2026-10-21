/* S07 JD 입력: 고정 양식에 사용자가 직접 입력 (AI 분리 없음)
   - 필수사항·우대사항·주요 업무는 한 줄에 하나씩 입력하는 목록
   - Enter: 아래에 새 줄 추가 / 여러 줄 붙여넣기: 줄마다 나눠 넣고 앞의 기호(-, •, 1.)는 지움
   - 검증은 "적합도 분석하기"를 눌렀을 때 표시 (회사명·포지션 필수, 필수사항 1개 이상, 한 줄 150자 이하, 중복 금지)
   - 주소 해시로 상태 보기: #empty #filled #invalid */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;
  var MAX = 150;
  var uid = 0;
  function L(arr) { return arr.map(function (text) { return { id: ++uid, text: text }; }); }

  var SECTIONS = [
    { key: 'req', title: '필수사항', required: true, where: '적합도 판정의 기준', desc: '공고의 ‘자격 요건’, ‘필수 사항’을 한 줄에 하나씩 적어 주세요.', placeholder: '예: Java/Spring 기반 개발 경력 3년 이상', addLabel: '필수사항 추가' },
    { key: 'pref', title: '우대사항', required: false, where: '있으면 유리한 조건', desc: '공고의 ‘우대 사항’, ‘이런 분이면 더 좋아요’를 한 줄에 하나씩 적어 주세요.', placeholder: '예: Kafka 등 메시지 큐 운영 경험', addLabel: '우대사항 추가' },
    { key: 'duty', title: '주요 업무', required: false, where: '지원동기 작성에 써요', desc: '입사하면 맡게 될 일을 적어 주세요. 적합도 판정에는 쓰지 않아요.', placeholder: '예: 결제 승인·정산 시스템 개발 및 운영', addLabel: '주요 업무 추가' }
  ];

  var PRESET = {
    empty: function () { return { company: '', position: '', url: '', intro: '', req: L(['']), pref: L(['']), duty: L(['']), submitted: false }; },
    filled: function () {
      return {
        company: 'OO페이', position: '백엔드 개발자 (결제 플랫폼)', url: '', intro: '온라인 결제와 정산 서비스를 만드는 핀테크 회사',
        req: L(['Java/Spring 기반 개발 경력 3년 이상', 'RDBMS 설계 및 쿼리 튜닝 경험', '대용량 트래픽 처리 경험']),
        pref: L(['Kafka 등 메시지 큐 운영 경험', '결제·금융 도메인 경험', 'Kubernetes 운영 경험']),
        duty: L(['결제 승인·정산 시스템 개발 및 운영', '대용량 트래픽 대응을 위한 아키텍처 개선']),
        submitted: false
      };
    },
    invalid: function () {
      return {
        company: '', position: '백엔드 개발자 (결제 플랫폼)', url: '', intro: '',
        req: L(['Java/Spring 기반 개발 경력 3년 이상이며 RDBMS 설계 및 쿼리 튜닝 경험이 있고, 대용량 트래픽을 처리해 본 경험과 Kafka 같은 메시지 큐를 운영해 본 경험이 있으신 분, 결제나 금융 도메인을 이해하시고, 원활한 커뮤니케이션과 문서화 능력을 갖추고 주도적으로 문제를 해결하시는 분']),
        pref: L(['Kubernetes 운영 경험', 'Kubernetes 운영 경험']),
        duty: L(['']),
        submitted: true
      };
    }
  };

  var $sections = document.getElementById('sections');
  var $company = document.getElementById('company');
  var $position = document.getElementById('position');
  var $url = document.getElementById('url');
  var $intro = document.getElementById('intro');
  var s, focusId = null;

  function filled(list) { return list.filter(function (i) { return i.text.trim(); }); }
  function clean(line) { return line.replace(/^\s*([-•·*▪◦]|\d+[.)])\s*/, '').trim(); }
  function itemError(list, it) {
    var t = it.text.trim();
    if (!t) return '';
    if (t.length > MAX) return '한 줄이 너무 길어요. 요건이 여러 개라면 줄을 나눠 주세요. (' + MAX + '자 이하)';
    var first = list.filter(function (x) { return x.text.trim() === t; })[0];
    if (first && first.id !== it.id) return '같은 내용이 이미 있어요.';
    return '';
  }
  function anyItemError() {
    return SECTIONS.some(function (sec) { return s[sec.key].some(function (it) { return itemError(s[sec.key], it); }); });
  }
  function isValid() { return !!s.company.trim() && !!s.position.trim() && filled(s.req).length > 0 && !anyItemError(); }

  function load(key) {
    s = (PRESET[key] || PRESET.empty)();
    $company.value = s.company; $position.value = s.position; $url.value = s.url; $intro.value = s.intro;
    renderSections(); renderStatus();
  }

  /* 목록 영역만 다시 그림 (입력 중인 칸의 포커스는 유지하기 위해 텍스트 입력 때는 다시 그리지 않음) */
  function renderSections() {
    $sections.innerHTML = SECTIONS.map(function (sec) {
      var list = s[sec.key];
      var items = list.map(function (it, i) {
        var err = s.submitted ? itemError(list, it) : '';
        var errId = 'err-' + it.id;
        return '<li><div class="row" style="flex-wrap: nowrap; gap: 8px">' +
          '<span aria-hidden="true" style="flex: none; width: 22px; text-align: right; font-size: 13px; color: var(--subtle)">' + (i + 1) + '</span>' +
          '<input class="input' + (err ? ' input--bad' : '') + '" data-sec="' + sec.key + '" data-id="' + it.id + '" value="' + esc(it.text) + '" placeholder="' + esc(sec.placeholder) + '" aria-label="' + sec.title + ' ' + (i + 1) + '"' + (err ? ' aria-invalid="true" aria-describedby="' + errId + '"' : '') + '>' +
          '<button class="icon-btn" data-act="remove" data-sec="' + sec.key + '" data-id="' + it.id + '" aria-label="' + sec.title + ' ' + (i + 1) + ' 삭제">' + icon('x') + '</button></div>' +
          (err ? '<p class="err" id="' + errId + '" style="margin-left: 30px">' + esc(err) + '</p>' : '') + '</li>';
      }).join('');
      var emptyBad = s.submitted && sec.required && filled(list).length === 0;
      return '<section class="card" style="gap: 12px" aria-labelledby="t-' + sec.key + '">' +
        '<div class="row row--between" style="align-items: baseline"><h2 id="t-' + sec.key + '" class="card__title row" style="gap: 8px">' + sec.title +
        (sec.required ? '<span class="req" aria-hidden="true">*</span>' : '<span class="label__hint" style="font-size: 14px">(선택)</span>') +
        '<span class="count" data-count="' + sec.key + '">' + filled(list).length + '</span></h2><span class="page-meta" style="font-size: 13px">' + sec.where + '</span></div>' +
        '<p class="card__desc" style="line-height: 1.6">' + sec.desc + '</p>' +
        '<ol class="plain stack" style="gap: 8px">' + items + '</ol>' +
        (emptyBad ? '<p class="err" role="alert">필수사항을 1개 이상 입력해 주세요.</p>' : '') +
        '<div class="row row--between"><button class="btn btn--text" data-act="add" data-sec="' + sec.key + '">' + icon('plus', 'i--sm') + sec.addLabel + '</button>' +
        '<span style="font-size: 12px; color: var(--subtle)">Enter로 다음 줄 추가 · 여러 줄을 붙여넣으면 줄마다 나눠 넣어요</span></div></section>';
    }).join('');
    if (focusId) {
      var el = $sections.querySelector('input[data-id="' + focusId + '"]');
      if (el) el.focus();
      focusId = null;
    }
  }

  /* 오류 표시·개수·버튼 안내 */
  function renderStatus() {
    var companyBad = s.submitted && !s.company.trim();
    var positionBad = s.submitted && !s.position.trim();
    toggleErr($company, 'company-err', companyBad);
    toggleErr($position, 'position-err', positionBad);
    SECTIONS.forEach(function (sec) {
      var c = $sections.querySelector('[data-count="' + sec.key + '"]');
      if (c) c.textContent = filled(s[sec.key]).length;
    });
    document.getElementById('cnt-req').textContent = filled(s.req).length;
    document.getElementById('cnt-pref').textContent = filled(s.pref).length;
    document.getElementById('cnt-duty').textContent = filled(s.duty).length;

    var errors = 0;
    if (s.submitted) {
      if (companyBad) errors++;
      if (positionBad) errors++;
      if (!filled(s.req).length) errors++;
      SECTIONS.forEach(function (sec) { s[sec.key].forEach(function (it) { if (itemError(s[sec.key], it)) errors++; }); });
    }
    var $sum = document.getElementById('summary-error');
    $sum.hidden = !errors;
    $sum.innerHTML = icon('alert') + '<span><strong>고쳐야 할 항목이 ' + errors + '개 있어요.</strong> 빨간색으로 표시된 곳을 확인해 주세요.</span>';
    $sum.querySelector('.i').style.color = 'var(--bad)';

    document.getElementById('submit-hint').textContent = isValid()
      ? '필수사항 ' + filled(s.req).length + '개, 우대사항 ' + filled(s.pref).length + '개로 분석해요.'
      : '회사명, 포지션, 필수사항 1개 이상이 필요해요.';
  }

  function toggleErr($input, errId, bad) {
    $input.classList.toggle('input--bad', bad);
    if (bad) $input.setAttribute('aria-invalid', 'true'); else $input.removeAttribute('aria-invalid');
    document.getElementById(errId).hidden = !bad;
  }

  function findItem(secKey, id) { return s[secKey].filter(function (x) { return x.id === id; })[0]; }

  /* ---------- 이벤트 ---------- */
  [['company', $company], ['position', $position], ['url', $url], ['intro', $intro]].forEach(function (pair) {
    pair[1].addEventListener('input', function () { s[pair[0]] = pair[1].value; renderStatus(); });
  });

  $sections.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.dataset.sec) return;
    var it = findItem(el.dataset.sec, +el.dataset.id);
    if (it) it.text = el.value;
    if (s.submitted) {
      var pos = el.selectionStart;
      focusId = it.id; renderSections();
      var again = $sections.querySelector('input[data-id="' + it.id + '"]');
      if (again) again.setSelectionRange(pos, pos);
    }
    renderStatus();
  });

  $sections.addEventListener('keydown', function (e) {
    var el = e.target;
    if (e.key !== 'Enter' || !el.dataset.sec || e.isComposing) return;
    e.preventDefault();
    var list = s[el.dataset.sec], id = +el.dataset.id;
    var idx = list.findIndex(function (x) { return x.id === id; });
    var item = { id: ++uid, text: '' };
    list.splice(idx + 1, 0, item);
    focusId = item.id; renderSections(); renderStatus();
  });

  $sections.addEventListener('paste', function (e) {
    var el = e.target;
    if (!el.dataset.sec) return;
    var raw = (e.clipboardData || window.clipboardData).getData('text');
    if (!raw || raw.indexOf('\n') === -1) return;
    e.preventDefault();
    var lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
    var list = s[el.dataset.sec], id = +el.dataset.id;
    var idx = list.findIndex(function (x) { return x.id === id; });
    var keep = list[idx].text.trim() ? 1 : 0;
    var added = lines.map(function (t) { return { id: ++uid, text: t }; });
    Array.prototype.splice.apply(list, [idx + keep, keep ? 0 : 1].concat(added));
    focusId = added[added.length - 1].id; renderSections(); renderStatus();
  });

  $sections.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var key = b.dataset.sec, list = s[key];
    if (b.dataset.act === 'add') {
      var item = { id: ++uid, text: '' };
      list.push(item); focusId = item.id;
    } else if (b.dataset.act === 'remove') {
      var id = +b.dataset.id;
      s[key] = list.length > 1 ? list.filter(function (x) { return x.id !== id; }) : [{ id: ++uid, text: '' }];
    }
    renderSections(); renderStatus();
  });

  document.getElementById('submit').addEventListener('click', function () {
    if (isValid()) { location.href = 'report.html'; return; }
    s.submitted = true;
    renderSections(); renderStatus();
    var firstBad = document.querySelector('[aria-invalid="true"]');
    if (firstBad) firstBad.focus();
  });

  window.addEventListener('hashchange', function () { load(location.hash.slice(1)); });
  load(location.hash.slice(1) || 'empty');
})();
