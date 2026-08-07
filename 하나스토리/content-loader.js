/* 하나스토리 콘텐츠 로더 — server를 통해 접속 시 content.json 내용을 페이지에 주입 */
(function () {
  if (location.protocol === 'file:') return; // file:// 직접 열기는 스킵

  fetch('/api/content')
    .then(r => r.json())
    .then(data => {
      // 중첩 객체 → 점 표기법 flat 키로 변환
      function flatten(obj, prefix) {
        prefix = prefix || '';
        return Object.keys(obj).reduce(function (acc, k) {
          var full = prefix ? prefix + '.' + k : k;
          if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
            Object.assign(acc, flatten(obj[k], full));
          } else {
            acc[full] = obj[k];
          }
          return acc;
        }, {});
      }

      var flat = flatten(data);

      // 텍스트 주입: <span data-c="company.phone">...</span>
      document.querySelectorAll('[data-c]').forEach(function (el) {
        var val = flat[el.dataset.c];
        if (val !== undefined && val !== null) el.textContent = val;
      });

      // 이미지 주입: <img data-img="home.hero_image1" ...>
      document.querySelectorAll('[data-img]').forEach(function (el) {
        var val = flat[el.dataset.img];
        if (val) el.src = val;
      });

      // 배경이미지 주입: <div data-bg="home.hero_image1" style="background-image:url(...)">
      document.querySelectorAll('[data-bg]').forEach(function (el) {
        var val = flat[el.dataset.bg];
        if (val) el.style.backgroundImage = "url('" + val + "')";
      });

      // 링크 주입: <a data-href="...">
      document.querySelectorAll('[data-href]').forEach(function (el) {
        var val = flat[el.dataset.href];
        if (val) el.href = val;
      });
    })
    .catch(function () {}); // 조용히 실패 (서버 없이 열릴 경우)
})();
