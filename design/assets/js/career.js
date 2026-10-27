/* S03 경력 입력: 사용 기술 선택 토글·새 기술 추가(기획서 v1.61), 재직 중 체크 시 종료 월 비활성화 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  // 사용 기술: 기술스택(S02)에 있는 기술 + 여기서 새로 추가한 기술 (S04와 같음)
  var ALL = ['Java', 'Spring Boot', 'JPA', 'MySQL', 'Redis', 'Kafka', 'AWS'];
  var picked = ['Java', 'Spring Boot', 'JPA', 'MySQL', 'Redis', 'Kafka'];
  var $chips = document.getElementById('tech-chips');
  var $techCount = document.getElementById('tech-count');
  var $newTech = document.getElementById('new-tech');

  function render() {
    $chips.innerHTML = ALL.map(function (name) {
      var on = picked.indexOf(name) !== -1;
      return '<button class="chip chip--accent" aria-pressed="' + on + '" data-tech="' + esc(name) + '">' +
        (on ? icon('check', 'i--sm i--bold') : '') + esc(name) + '</button>';
    }).join('');
    $techCount.textContent = picked.length;
  }

  $chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tech]');
    if (!b) return;
    var name = b.dataset.tech;
    var idx = picked.indexOf(name);
    if (idx === -1) picked.push(name); else picked.splice(idx, 1);
    render();
  });

  function addTech() {
    var name = $newTech.value.trim();
    if (!name) return;
    if (ALL.indexOf(name) === -1) ALL.push(name);
    if (picked.indexOf(name) === -1) picked.push(name);
    $newTech.value = '';
    render();
  }
  document.getElementById('new-tech-add').addEventListener('click', addTech);
  $newTech.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTech(); } });

  var $current = document.getElementById('current');
  var $end = document.getElementById('end');
  $current.addEventListener('change', function () { $end.disabled = $current.checked; });

  render();
})();
