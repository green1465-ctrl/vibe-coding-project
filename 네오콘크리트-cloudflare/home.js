/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — HOME 전용 스크립트 (index.html 에서만, main.js 다음에 로드)
   1. HERO 슬라이드 · 페이저     2. 등장 모션(라인 마스크 · 사진 리빌)
   3. 회사소개 고정 스크롤        4. 제품 탭
   5. 시공사례 흐르는 슬라이드    6. 맨 위로 · 부드러운 스크롤(Lenis, 있으면)
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return doc.getElementById(id); }
  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function headerH() { return parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--header-h')) || 100; }

  /* 부드러운 스크롤 (CDN 로드 실패해도 나머지는 그대로 동작) */
  var lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
  }

  /* ── 1. HERO ── */
  var hero = $('hm-hero');
  if (hero) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { hero.classList.add('ready'); }); });
    var slides = $all('.hm-slide', hero), cur = $('hm-pg-cur'), bar = $('hm-pg-bar'), si = 0;
    $('hm-pg-tot').textContent = String(slides.length).padStart(2, '0');
    if (slides.length > 1 && !reduce) {
      setInterval(function () {
        slides[si].classList.remove('on'); si = (si + 1) % slides.length; slides[si].classList.add('on');
        cur.textContent = String(si + 1).padStart(2, '0');
        bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run');
      }, 6000);
    }
  }

  /* ── 2. 등장 — 사진은 clip-path 로 완전히 가려져 있으면 감지가 안 돼서 부모를 관찰 ── */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      $all('.hm-clip', e.target).forEach(function (c) { c.classList.add('in'); });
      io.unobserve(e.target);
    });
  }, { threshold: .2, rootMargin: '0px 0px -8% 0px' });
  $all('.hm-rv, .lmset, .cgrid').forEach(function (el) { io.observe(el); });

  /* ── 3. 회사소개 — 섹션이 헤더 아래 고정된 동안의 진행률로 01 → 02 → 03 ── */
  var cst = $('cstage'), ctrack = $('ctrack');
  if (cst && ctrack) {
    var citems = $all('.citem', ctrack), cidx = 0;
    function pinned() { return getComputedStyle(cst.querySelector('.csticky')).position === 'sticky'; }
    function place() { ctrack.style.transform = pinned() ? 'translateY(' + (citems[0].offsetTop - citems[cidx].offsetTop) + 'px)' : ''; }
    function onCompany() {
      if (!pinned()) return;
      var HD = headerH(), r = cst.getBoundingClientRect(), span = cst.offsetHeight - (innerHeight - HD);
      var n = Math.min(citems.length - 1, Math.floor(clamp((HD - r.top) / Math.max(1, span)) * citems.length));
      if (n === cidx) return;
      citems[cidx].classList.remove('on');
      var el = citems[n];
      el.classList.add('rise'); void el.offsetWidth;          /* 글줄을 아래로 내려놓았다가 */
      el.classList.remove('rise'); el.classList.add('on');   /* 다시 올라오게 */
      cidx = n; place();
      var big = $('cbig'); if (big) big.style.transform = 'translateY(' + (-100 * n / citems.length) + '%)';
    }
    addEventListener('scroll', onCompany, { passive: true });
    var cgridEl = cst.querySelector('.cgrid'), cimgEl = cst.querySelector('.cimg img');
    function markImg() { if (cgridEl && cimgEl) cgridEl.style.setProperty('--cimg-w', cimgEl.offsetWidth + 'px'); }   /* 사진 뒤 면의 오른쪽 끝 계산용 */
    if (cimgEl) { cimgEl.complete ? markImg() : cimgEl.addEventListener('load', markImg); }
    addEventListener('resize', function () { markImg(); place(); onCompany(); });
    doc.addEventListener('neo:lang', place);                  /* 언어 바꾸면 글 높이가 달라짐 */
    onCompany();
  }

  /* ── 4. 제품 탭 ── */
  var ptabs = $all('.ptabs button'), ppanels = $all('.ppanel');
  ptabs.forEach(function (b, k) {
    b.addEventListener('click', function () {
      ptabs.forEach(function (x, j) { x.classList.toggle('on', j === k); x.setAttribute('aria-selected', j === k ? 'true' : 'false'); });
      ppanels.forEach(function (x, j) { x.classList.toggle('on', j === k); });
    });
  });

  /* ── 5. 시공사례 — 끊김 없이 계속 흐르는 슬라이드 (원본 앞뒤로 복제본을 붙여 무한 반복)
        · 마우스를 올리면 서서히 멈춤 · 끌어서 좌우 이동(던지면 미끄러짐) · 화살표는 한 장씩 ── */
  var gview = $('gview'), track = $('track');
  if (gview && track) {
    var orig = $all('.pc', track), N = orig.length, SPEED = reduce ? 0 : 45;
    function cloneTo(c, before) {
      var a = c.cloneNode(true); a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1;
      before ? track.insertBefore(a, track.firstChild) : track.appendChild(a);
    }
    orig.forEach(function (c) { cloneTo(c, false); });
    orig.slice().reverse().forEach(function (c) { cloneTo(c, true); });
    $all('a, img', track).forEach(function (el) { el.setAttribute('draggable', 'false'); });
    gview.addEventListener('dragstart', function (e) { e.preventDefault(); });   /* 링크 끌기가 드래그를 취소하지 않게 */

    var pcur = $('pcur'), shown = -1;
    $('ptot').textContent = String(N).padStart(2, '0');
    var x = 0, step = 0, loopW = 0, speed = SPEED, fling = 0, tween = null;
    var hover = false, dragging = false, onScreen = false;
    var sx = 0, sy = 0, bx = 0, moved = 0, lastX = 0, lastT = 0, vel = 0, axis = null, pid = null;

    function measure() {
      var old = step;
      step = track.children[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 20);
      loopW = N * step;
      x = old ? x / old * step : -loopW;
    }
    function wrap() {                                            /* 항상 원본 구간에 머물도록 한 바퀴씩 옮김 (모양이 같아 티 안 남) */
      var sh = 0;
      while (x + sh <= -2 * loopW) sh += loopW;
      while (x + sh > -loopW) sh -= loopW;
      if (sh) { x += sh; bx += sh; if (tween) { tween.from += sh; tween.to += sh; } }
    }
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      var target = (hover || dragging || !onScreen || doc.hidden) ? 0 : SPEED;
      speed += (target - speed) * Math.min(1, dt * 3);
      if (!dragging) {
        if (tween) {
          var t = Math.min(1, (now - tween.t0) / tween.dur);
          x = tween.from + (tween.to - tween.from) * (1 - Math.pow(1 - t, 4));
          if (t >= 1) tween = null;
        } else {
          x += fling * dt; fling *= Math.exp(-dt * 3.5); if (Math.abs(fling) < 5) fling = 0;
          x -= speed * dt;
        }
      }
      wrap();
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      var k = ((Math.round(-x / step) - N) % N + N) % N;
      if (k !== shown) { shown = k; pcur.textContent = String(k + 1).padStart(2, '0'); }
      requestAnimationFrame(frame);
    }
    gview.addEventListener('mouseenter', function () { hover = true; });
    gview.addEventListener('mouseleave', function () { hover = false; });
    new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; }, { threshold: .1 }).observe(gview);

    function nudge(dir) {
      fling = 0;
      var base = tween ? tween.to : x;
      tween = { from: x, to: Math.round(base / step) * step - dir * step, t0: performance.now(), dur: 800 };
    }
    $('prev').addEventListener('click', function () { nudge(-1); });
    $('next').addEventListener('click', function () { nudge(1); });

    gview.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      pid = e.pointerId; sx = lastX = e.clientX; sy = e.clientY; lastT = performance.now(); vel = 0; moved = 0; axis = null;
    });
    addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!axis) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
      if (axis !== 'x') { pid = null; return; }                /* 세로로 끌면 페이지 스크롤에 양보 */
      if (!dragging) { dragging = true; tween = null; fling = 0; bx = x - dx; gview.classList.add('drag'); try { gview.setPointerCapture(e.pointerId); } catch (_) {} }
      var now = performance.now(), v = (e.clientX - lastX) / Math.max(1, now - lastT) * 1000;
      vel = vel * .6 + v * .4; lastX = e.clientX; lastT = now;
      moved = dx; x = bx + dx;
    });
    function release(e) {
      if (e.pointerId !== pid) return; pid = null;
      if (!dragging) return;
      dragging = false; gview.classList.remove('drag');
      if (performance.now() - lastT > 80) vel = 0;               /* 멈춘 채로 놓으면 던지지 않음 */
      fling = Math.max(-3000, Math.min(3000, vel));
    }
    addEventListener('pointerup', release); addEventListener('pointercancel', release);
    gview.addEventListener('click', function (e) { if (Math.abs(moved) > 6) { e.preventDefault(); e.stopPropagation(); } moved = 0; }, true);

    addEventListener('resize', measure);
    measure(); requestAnimationFrame(frame);
  }

  /* ── 5-0. 히어로 뒷장 사진 지연 로드 ──
     5장을 한꺼번에 받으면 첫 화면에만 2.7MB 를 쓴다.
     첫 장이 보이고 나서 나머지를 조용히 받아둔다 (넘어갈 때는 이미 준비돼 있음). */
  (function lazyHeroSlides() {
    var rest = document.querySelectorAll('.hm-slide[data-bg]');
    if (!rest.length) return;
    function load() {
      var small = window.innerWidth <= 768;
      Array.prototype.forEach.call(rest, function (el, i) {
        setTimeout(function () {
          var src = el.getAttribute('data-bg');
          /* 모바일이면 작은 판(-m)을 쓴다 */
          if (small) src = src.replace(/(hero-stock-\d)\.jpg$/, '$1-m.jpg');
          el.style.backgroundImage = "url('" + src + "')";
          el.removeAttribute('data-bg');
        }, i * 250);                       /* 한 장씩 차례로 — 한꺼번에 몰리지 않게 */
      });
    }
    if (window.requestIdleCallback) requestIdleCallback(load, { timeout: 2500 });
    else setTimeout(load, 1200);
  })();

  /* ── 5-1. 히어로 높이 고정 ──
     모바일 브라우저는 스크롤하면 주소창이 접히면서 화면 높이가 커진다.
     100vh/svh 만으로는 기기마다 결과가 달라서, 처음 잰 높이를 픽셀로 박아둔다.
     가로폭이 바뀔 때(회전)만 다시 잰다 — 세로 변화에는 반응하지 않는다. */
  (function lockHeroHeight() {
    var hero = document.querySelector('.hm-hero');
    if (!hero) return;
    var lastW = 0;

    /* 주소창이 펼쳐진 상태의 화면 높이(svh)를 잰다.
       window.innerHeight 를 그냥 쓰면 — 스크롤해서 주소창이 접힌 채로 로고를 눌러
       홈으로 들어올 때 더 큰 값이 잡혀서 히어로 크기가 들쭉날쭉해진다.
       svh 는 주소창 상태와 상관없이 항상 같은 값이라 기준으로 삼기 좋다. */
    function baseHeight() {
      try {
        if (window.CSS && CSS.supports && CSS.supports('height', '100svh')) {
          var probe = document.createElement('div');
          probe.style.cssText = 'position:absolute;top:-9999px;left:0;width:1px;height:100svh;pointer-events:none;visibility:hidden';
          document.body.appendChild(probe);
          var h = probe.getBoundingClientRect().height;
          probe.parentNode.removeChild(probe);
          if (h > 200) return h;
        }
      } catch (e) {}
      return window.innerHeight;
    }

    function apply() {
      var w = window.innerWidth;
      if (w > 1024) { document.documentElement.style.removeProperty('--hero-h'); lastW = w; return; }
      if (w === lastW) return;                       /* 세로만 바뀐 경우(주소창) 무시 */
      lastW = w;

      /* 같은 방문(세션) 안에서는 처음 잰 값을 계속 쓴다.
         주소창이 접힌 채로 로고를 눌러 홈에 들어와도 히어로 크기가 달라지지 않게. */
      var key = 'neo_hero_h_' + w;
      var px = 0;
      try { px = parseInt(sessionStorage.getItem(key), 10) || 0; } catch (e) {}
      if (!(px > 200)) {
        px = Math.round(baseHeight() * 0.88);
        try { sessionStorage.setItem(key, px); } catch (e) {}
      }
      document.documentElement.style.setProperty('--hero-h', px + 'px');
    }
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', function () { lastW = 0; setTimeout(apply, 250); });
  })();

  /* ── 6. 맨 위로 ── */
  var top = $('hm-top');
  if (top) {
    addEventListener('scroll', function () { top.classList.toggle('show', scrollY > innerHeight); }, { passive: true });
    top.addEventListener('click', function () { lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  }
})();
