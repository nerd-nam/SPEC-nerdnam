/* S02 기술스택 입력: 카테고리 탭, 추천 기술 추가, 숙련도 변경, 삭제 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  var CATS = ['언어', '프레임워크', 'DB', '인프라', '협업 도구'];
  var LEVELS = ['학습 중', '실무 사용', '능숙', '전문가'];
  var SUGGEST = {
    '언어': ['Java', 'Kotlin', 'Python', 'TypeScript'],
    '프레임워크': ['Spring Boot', 'Spring Batch', 'Spring Security', 'JPA'],
    'DB': ['MySQL', 'PostgreSQL', 'Redis', 'MongoDB'],
    '인프라': ['AWS', 'Docker', 'Kubernetes', 'Kafka'],
    '협업 도구': ['Git', 'Jira', 'Notion', 'Slack']
  };

  // 예시 데이터 (기획서 4.1)
  var state = {
    cat: '프레임워크',
    skills: [
      { name: 'Java', cat: '언어', level: 3 },
      { name: 'Spring Boot', cat: '프레임워크', level: 3 },
      { name: 'JPA', cat: '프레임워크', level: 3 },
      { name: 'MySQL', cat: 'DB', level: 3 },
      { name: 'Redis', cat: 'DB', level: 2 },
      { name: 'Kafka', cat: '인프라', level: 2 },
      { name: 'AWS', cat: '인프라', level: 2 }
    ]
  };

  var $tabs = document.getElementById('cat-tabs');
  var $catName = document.getElementById('cat-name');
  var $sugg = document.getElementById('suggestions');
  var $rows = document.getElementById('skill-rows');
  var $count = document.getElementById('skill-count');

  function hasSkill(name) {
    return state.skills.some(function (s) { return s.name === name; });
  }

  function render() {
    $tabs.innerHTML = CATS.map(function (c) {
      return '<button class="chip" role="tab" aria-selected="' + (c === state.cat) + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');

    $catName.textContent = state.cat;
    $sugg.innerHTML = SUGGEST[state.cat].map(function (name) {
      if (hasSkill(name)) return '<span class="chip chip--added">' + icon('check', 'i--sm i--bold') + esc(name) + ' 추가됨</span>';
      return '<button class="chip chip--add" data-add="' + esc(name) + '" aria-label="' + esc(name) + ' 추가">' + icon('plus', 'i--sm') + esc(name) + '</button>';
    }).join('');

    $count.textContent = state.skills.length;
    $rows.innerHTML = state.skills.map(function (s, i) {
      var bars = [1, 2, 3, 4].map(function (n) {
        return '<button class="level__btn' + (n <= s.level ? ' is-on' : '') + '" data-row="' + i + '" data-level="' + n + '"' +
          ' aria-pressed="' + (n === s.level) + '" aria-label="' + esc(s.name) + ' 숙련도 ' + n + '단계 ' + LEVELS[n - 1] + '로 설정">' +
          '<span class="level__bar"></span></button>';
      }).join('');
      return '<tr>' +
        '<td class="cell-strong">' + esc(s.name) + '</td>' +
        '<td class="cell-muted">' + esc(s.cat) + '</td>' +
        '<td><div class="level"><div class="level__bars">' + bars + '</div><span class="level__label">' + LEVELS[s.level - 1] + '</span></div></td>' +
        '<td><button class="icon-btn" data-remove="' + i + '" aria-label="' + esc(s.name) + ' 삭제">' + icon('x') + '</button></td>' +
        '</tr>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.cat) { state.cat = t.dataset.cat; render(); }
    else if (t.dataset.add) {
      state.skills.push({ name: t.dataset.add, cat: state.cat, level: 1 });
      render();
    }
    else if (t.dataset.level) { state.skills[+t.dataset.row].level = +t.dataset.level; render(); }
    else if (t.dataset.remove !== undefined) { state.skills.splice(+t.dataset.remove, 1); render(); }
  });

  render();
})();
