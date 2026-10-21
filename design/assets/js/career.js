/* S03 경력 입력: 사용 기술 선택 토글, 재직 중 체크 시 종료 월 비활성화 */
(function () {
  'use strict';
  var esc = UI.esc, icon = UI.icon;

  var ALL = ['Java', 'Spring Boot', 'JPA', 'MySQL', 'Redis', 'Kafka', 'AWS'];
  var picked = ['Java', 'Spring Boot', 'JPA', 'MySQL', 'Redis', 'Kafka'];
  var $chips = document.getElementById('tech-chips');

  function render() {
    $chips.innerHTML = ALL.map(function (name) {
      var on = picked.indexOf(name) !== -1;
      return '<button class="chip chip--accent" aria-pressed="' + on + '" data-tech="' + esc(name) + '">' +
        (on ? icon('check', 'i--sm i--bold') : '') + esc(name) + '</button>';
    }).join('');
  }

  $chips.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tech]');
    if (!b) return;
    var name = b.dataset.tech;
    var idx = picked.indexOf(name);
    if (idx === -1) picked.push(name); else picked.splice(idx, 1);
    render();
  });

  var $current = document.getElementById('current');
  var $end = document.getElementById('end');
  $current.addEventListener('change', function () { $end.disabled = $current.checked; });

  render();
})();
