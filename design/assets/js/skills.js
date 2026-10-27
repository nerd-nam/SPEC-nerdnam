/* S02 기술스택 입력: 기술 이름 검색으로 추가, 숙련도 변경, 삭제 (카테고리는 보여 주지 않음, 기획서 v1.61) */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  var LEVELS = ['학습 중', '실무 사용', '능숙', '전문가'];
  // 표준 사전 예시 (이름, 별칭). 실제로는 입력이 0.3초 멈추면 서버 자동완성에 묻는다
  var DICT = [
    ['Java'], ['Kotlin'], ['Python'], ['TypeScript'],
    ['Spring Boot', 'spring'], ['Spring Batch', 'spring'], ['Spring Security', 'spring'], ['JPA'],
    ['MySQL'], ['PostgreSQL'], ['Redis'], ['MongoDB'],
    ['AWS'], ['Docker'], ['Kubernetes', 'k8s'], ['Kafka'],
    ['Git'], ['Jira'], ['Notion'], ['Slack']
  ];

  // 예시 데이터 (기획서 4.1)
  var state = {
    query: '',
    skills: [
      { name: 'Java', level: 3 },
      { name: 'Spring Boot', level: 3 },
      { name: 'JPA', level: 3 },
      { name: 'MySQL', level: 3 },
      { name: 'Redis', level: 2 },
      { name: 'Kafka', level: 2 },
      { name: 'AWS', level: 2 }
    ]
  };

  var $search = document.getElementById('skill-search');
  var $label = document.getElementById('result-label');
  var $results = document.getElementById('results');
  var $rows = document.getElementById('skill-rows');
  var $count = document.getElementById('skill-count');

  function hasSkill(name) {
    return state.skills.some(function (s) { return s.name === name; });
  }

  function search(q) {
    var key = q.toLowerCase();
    return DICT.filter(function (d) {
      return d.some(function (n) { return n.toLowerCase().indexOf(key) !== -1; });
    }).map(function (d) { return d[0]; });
  }

  function render() {
    var q = state.query.trim();
    var found = q ? search(q) : [];
    $label.textContent = q ? '"' + q + '" 검색 결과 ' + found.length + '개' : '기술 이름을 입력하면 표준 사전에서 찾아 줘요';
    if (q && !found.length) {
      $results.innerHTML = '<p style="font-size: 14px; color: var(--subtle)">표준 사전에서 찾지 못했어요. 다른 이름으로 검색해 보세요.</p>';
    } else {
      $results.innerHTML = found.map(function (name) {
        if (hasSkill(name)) return '<span class="chip chip--added">' + icon('check', 'i--sm i--bold') + esc(name) + ' 추가됨</span>';
        return '<button class="chip chip--add" data-add="' + esc(name) + '" aria-label="' + esc(name) + ' 추가">' + icon('plus', 'i--sm') + esc(name) + '</button>';
      }).join('');
    }

    $count.textContent = state.skills.length;
    $rows.innerHTML = state.skills.map(function (s, i) {
      var bars = [1, 2, 3, 4].map(function (n) {
        return '<button class="level__btn' + (n <= s.level ? ' is-on' : '') + '" data-row="' + i + '" data-level="' + n + '"' +
          ' aria-pressed="' + (n === s.level) + '" aria-label="' + esc(s.name) + ' 숙련도 ' + n + '단계 ' + LEVELS[n - 1] + '로 설정">' +
          '<span class="level__bar"></span></button>';
      }).join('');
      return '<tr>' +
        '<td class="cell-strong">' + esc(s.name) + '</td>' +
        '<td><div class="level"><div class="level__bars">' + bars + '</div><span class="level__label">' + LEVELS[s.level - 1] + '</span></div></td>' +
        '<td><button class="icon-btn" data-remove="' + i + '" aria-label="' + esc(s.name) + ' 삭제">' + icon('x') + '</button></td>' +
        '</tr>';
    }).join('');
  }

  $search.addEventListener('input', function () { state.query = $search.value; render(); });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add) {
      state.skills.push({ name: t.dataset.add, level: 1 });
      render();
    }
    else if (t.dataset.level) { state.skills[+t.dataset.row].level = +t.dataset.level; render(); }
    else if (t.dataset.remove !== undefined) { state.skills.splice(+t.dataset.remove, 1); render(); }
  });

  render();
})();
