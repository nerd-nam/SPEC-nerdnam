/* S04 프로젝트 입력: 본문 글자 수(공백 제외), 사용 기술 선택·추가 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  // 글자 수
  var $body = document.getElementById('body');
  var $count = document.getElementById('body-count');
  function updateCount() { $count.textContent = $body.value.replace(/\s/g, '').length; }
  $body.addEventListener('input', updateCount);
  updateCount();

  // 사용 기술: 기술스택(S02)에 있는 기술 + 여기서 새로 추가한 기술
  var techs = ['Java', 'Spring Boot', 'JPA', 'MySQL', 'Redis', 'Kafka', 'AWS'];
  var picked = ['Spring Boot', 'Redis', 'Kafka'];
  var $chips = document.getElementById('tech-chips');
  var $techCount = document.getElementById('tech-count');
  var $newTech = document.getElementById('new-tech');

  function renderTechs() {
    $chips.innerHTML = techs.map(function (name) {
      var on = picked.indexOf(name) !== -1;
      return '<button class="chip chip--accent" aria-pressed="' + on + '" data-tech="' + esc(name) + '">' +
        (on ? icon('check', 'i--sm i--bold') : '') + esc(name) + '</button>';
    }).join('');
    $techCount.textContent = picked.length;
  }

  $chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tech]');
    if (!b) return;
    var name = b.dataset.tech, idx = picked.indexOf(name);
    if (idx === -1) picked.push(name); else picked.splice(idx, 1);
    renderTechs();
  });

  function addTech() {
    var name = $newTech.value.trim();
    if (!name) return;
    if (techs.indexOf(name) === -1) techs.push(name);
    if (picked.indexOf(name) === -1) picked.push(name);
    $newTech.value = '';
    renderTechs();
  }
  document.getElementById('new-tech-add').addEventListener('click', addTech);
  $newTech.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTech(); } });

  renderTechs();
})();
