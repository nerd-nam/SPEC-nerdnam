/* 공용 스크립트: 아이콘 스프라이트 주입 + 렌더링 헬퍼 */
(function () {
  'use strict';

  // 아이콘 (stroke 기반, 24x24). <svg class="i"><use href="#i-이름"></use></svg> 로 사용
  var ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    dash: '<path d="M6 12h12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    restructure: '<path d="M4 7h10M4 12h16M4 17h7"/><path d="M17 4l3 3-3 3"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'
  };

  var sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' +
    Object.keys(ICONS).map(function (k) { return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>'; }).join('') +
    '</svg>';
  document.body.insertAdjacentHTML('afterbegin', sprite);

  // 문자열 이스케이프
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 아이콘 마크업
  function icon(name, cls) {
    return '<svg class="i ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  // 클립보드 복사 (실패해도 조용히 넘어감)
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () {});
    } catch (e) { /* 무시 */ }
    return Promise.resolve();
  }

  // 만족도 평가: 5점 별점 + 한 줄 의견(선택). S05 사례 생성 평가, S09 방향 제시 평가에서 같이 쓴다 (기획서 9.1)
  // 별은 라디오 버튼이라 키보드(화살표)로도 고를 수 있다. 보낸 뒤에도 언제든 바꿀 수 있고 마지막 값만 남는다.
  var SCORE_LABELS = ['매우 아쉬워요', '아쉬워요', '보통이에요', '도움됐어요', '아주 도움됐어요'];
  function mountRating(el, opts) {
    var name = opts.name;
    el.innerHTML =
      '<fieldset class="rating">' +
      '<legend class="card__title card__title--sm">' + esc(opts.legend) + '</legend>' +
      '<div class="row" style="gap: 12px">' +
      '<div class="rating__stars">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<label class="rating__star"><input type="radio" class="sr-only" name="' + name + '" value="' + n + '">' +
          icon('star', 'i--lg') + '<span class="sr-only">' + n + '점 · ' + SCORE_LABELS[n - 1] + '</span></label>';
      }).join('') + '</div>' +
      '<span class="rating__label" aria-live="polite">별을 눌러 평가해 주세요</span></div>' +
      '<div class="row"><label class="sr-only" for="' + name + '-comment">한 줄 의견 (선택)</label>' +
      '<input id="' + name + '-comment" class="input" placeholder="' + esc(opts.placeholder) + '" style="flex: 1 1 220px; width: auto">' +
      '<button class="btn btn--sm" data-rating-send disabled>보내기</button></div>' +
      '<p class="rating__done" role="status" hidden></p>' +
      '</fieldset>';

    var stars = el.querySelectorAll('.rating__star');
    var $label = el.querySelector('.rating__label');
    var $send = el.querySelector('[data-rating-send]');
    var $done = el.querySelector('.rating__done');
    el.addEventListener('change', function (e) {
      if (e.target.name !== name) return;
      var v = +e.target.value;
      stars.forEach(function (s, i) { s.classList.toggle('is-on', i < v); });
      $label.textContent = v + '점 · ' + SCORE_LABELS[v - 1];
      $send.disabled = false;
      $done.hidden = true;
    });
    $send.addEventListener('click', function () {
      $done.textContent = '평가를 보냈어요. 언제든 바꿀 수 있어요.';
      $done.hidden = false;
      $send.textContent = '다시 보내기';
    });
  }

  // S05 검토 중에 S02·S03으로 온 경우(주소 #reviewing): "다음" 대신 "검토로 돌아가기" (기획서 F2 검토 결과 유지 규칙, D-9)
  // 원문 화면(S04)을 거치지 않고 검토로 돌아가야 검토 결과가 유지된다. S02·S03 사이를 오가는 링크(단계 표시, 이전)에도 #reviewing 을 이어 붙인다
  if (location.hash === '#reviewing') {
    var $next = document.querySelector('[data-next]');
    if ($next) {
      $next.setAttribute('href', 'review.html');
      $next.innerHTML = icon('arrow') + '검토로 돌아가기';
      $next.querySelector('.i').style.transform = 'scaleX(-1)';
    }
    document.querySelectorAll('a[href="skills.html"], a[href="career.html"]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href') + '#reviewing');
    });
    // 여기서 원문 화면(S04)으로 가면 검토 결과가 사라지므로 경고한다. 실제 화면은 S05와 같은 대화상자를 쓴다
    document.querySelectorAll('a[href="project.html"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!window.confirm('지금 나가면 검토한 내용이 사라져요.\n프로젝트를 확정하지 않으면 사례별 결정과 확인 질문 답변이 저장되지 않아요. 나갈까요?')) e.preventDefault();
      });
    });
  }

  window.UI = { esc: esc, icon: icon, copyText: copyText, mountRating: mountRating };
})();
