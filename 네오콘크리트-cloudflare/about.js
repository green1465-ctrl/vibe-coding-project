/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 회사소개 전용 (about.html, main.js 다음에 로드)
   경영이념 · 핵심가치: ＋ 버튼으로 설명 펼치기 / 접기
   · 자동으로 움직이는 것은 없음. 사용자가 누를 때만 열리고 닫힘
   · 첫 항목은 열린 채로 시작해 "누르면 열린다"는 걸 바로 보여줌
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var heads = Array.prototype.slice.call(document.querySelectorAll('.vx-head'));
  if (!heads.length) return;
  heads.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.vx-item');
      var open = !item.classList.contains('is-open');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
})();
