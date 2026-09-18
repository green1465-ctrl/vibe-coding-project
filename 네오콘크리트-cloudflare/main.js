/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 공통 스크립트 (외부 라이브러리 없음)
   1. 연락처 주입 (site-info.js)     2. 언어 토글 KR/EN (하나스토리 setLang 방식)
   3. GNB · 하위탭 active            4. 헤더 스크롤 전환 · 모바일 메뉴
   5. 스크롤 등장(reveal · stagger)  6. HERO 슬라이드(크로스페이드 + 켄번스)
   7. 연혁 타임라인 선 그리기        8. 시공사례 필터 · 더보기 · 라이트박스
   9. 게시판 펼침 · 자료실 준비중   10. 넓은 표 스크롤 페이드
   ※ <head>의 인라인 스크립트가 html.js / html.en 클래스를 먼저 붙인다(깜빡임 방지).
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, body = doc.body;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LANG_KEY = 'neo_lang';
  var SITE = window.SITE_INFO || {};

  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function isEn() { return html.classList.contains('en'); }

  /* ── 1. 연락처 주입 ── */
  function applySiteInfo() {
    $all('[data-site]').forEach(function (el) {
      var v = SITE[el.getAttribute('data-site')];
      if (v != null && v !== '') el.textContent = v;
    });
    $all('[data-site-href]').forEach(function (el) {
      var key = el.getAttribute('data-site-href'), v = SITE[key];
      if (!v) return;
      if (key === 'email') el.setAttribute('href', 'mailto:' + v);
      else el.setAttribute('href', 'tel:' + String(v).replace(/[^0-9+]/g, ''));
    });
    var CERT = window.CERT_INFO || {};
    $all('[data-cert]').forEach(function (el) {
      var item = CERT[el.getAttribute('data-cert')], v = item && item[el.getAttribute('data-cert-field')];
      if (v != null && v !== '') el.textContent = v;
    });
    $all('[data-map]').forEach(function (el) {
      var q = encodeURIComponent(SITE.address || '');
      if (!q) return;
      el.setAttribute('href', el.getAttribute('data-map') === 'kakao'
        ? 'https://map.kakao.com/?q=' + q
        : 'https://map.naver.com/p/search/' + q);
    });
  }

  /* ── 2. 언어 토글 ── */
  var ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
  var koTitle = doc.title;
  function setLang(lang) {
    var en = lang === 'en';
    html.classList.toggle('en', en);
    body.classList.toggle('en', en);          /* 하나스토리 호환(body.en) */
    html.lang = en ? 'en' : 'ko';
    $all('.lang-btn').forEach(function (b) {
      var on = b.getAttribute('data-lang') === (en ? 'en' : 'ko');
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    ATTRS.forEach(function (a) {
      $all('[data-' + a + '-en]').forEach(function (el) {
        if (!el.hasAttribute('data-' + a + '-ko')) el.setAttribute('data-' + a + '-ko', el.getAttribute(a) || '');
        el.setAttribute(a, el.getAttribute('data-' + a + (en ? '-en' : '-ko')));
      });
    });
    /* 공지 본문처럼 내용에 따라 제목이 정해지는 화면은 body[data-title-ko/en] 을 우선한다 */
    var tEn = body.getAttribute('data-title-en');
    var tKo = body.getAttribute('data-title-ko') || koTitle;
    doc.title = en && tEn ? tEn : tKo;
    try { localStorage.setItem(LANG_KEY, en ? 'en' : 'ko'); } catch (e) {}
    doc.dispatchEvent(new CustomEvent('neo:lang', { detail: { lang: en ? 'en' : 'ko' } }));
  }
  window.setLang = setLang;

  /* ── 3. GNB · 하위탭 active (Cloudflare의 확장자 없는 URL에서도 동작하도록 data-page 기준) ── */
  function pageKey(href) {
    if (!href) return '';
    var p = href.split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/\/$/, '');
    p = p.substring(p.lastIndexOf('/') + 1).replace(/\.html$/, '');
    return p || 'index';
  }
  function markActive() {
    var page = body.getAttribute('data-page') || 'index';
    var menu = body.getAttribute('data-menu') || '';
    $all('.gnb-item').forEach(function (item) {
      var on = item.getAttribute('data-menu') === menu;
      var a = item.querySelector(':scope > a');
      if (a) { a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'true'); }
    });
    $all('.gnb-drop a, .sub-nav-bar a').forEach(function (a) {
      var on = pageKey(a.getAttribute('href')) === page;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
    });
  }

  /* ── 4. 헤더 · 모바일 메뉴 ── */
  function initHeader() {
    var header = doc.getElementById('site-header');
    if (!header) return;
    var ticking = false;
    function onScroll() {
      header.classList.toggle('is-scrolled', window.scrollY > 60);
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    var toggle = header.querySelector('.nav-toggle'), nav = doc.getElementById('gnb');
    if (!toggle || !nav) return;
    function setOpen(open) {
      nav.classList.toggle('open', open);
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      var label = open ? ['메뉴 닫기', 'Close menu'] : ['메뉴 열기', 'Open menu'];
      toggle.setAttribute('data-aria-label-ko', label[0]);
      toggle.setAttribute('data-aria-label-en', label[1]);
      toggle.setAttribute('aria-label', isEn() ? label[1] : label[0]);
    }
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 1024 && nav.classList.contains('open')) setOpen(false); });
  }

  /* ── 5. 스크롤 등장 ── */
  function initReveal() {
    /* [data-stagger] 의 직계 자식은 순차 지연 */
    $all('[data-stagger]').forEach(function (group) {
      var step = parseFloat(group.getAttribute('data-stagger')) || 0.08;
      Array.prototype.forEach.call(group.children, function (child, i) {
        child.classList.add('reveal');
        child.style.setProperty('--rv-delay', Math.min(i * step, 0.6) + 's');
      });
    });
    var items = $all('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.remove('reveal'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        el.classList.add('in-view');
        /* 등장이 끝나면 reveal 클래스를 떼서 카드 자체 hover 전환이 지연 없이 동작하게 함 */
        var delay = parseFloat(getComputedStyle(el).getPropertyValue('--rv-delay')) || 0;
        setTimeout(function () { el.classList.remove('reveal', 'in-view'); el.style.removeProperty('--rv-delay'); }, (delay + 1) * 1000);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ── 6. HERO ── */
  function initHero() {
    var hero = doc.querySelector('.hero');
    if (!hero) return;
    var slides = $all('.hero-slide', hero), dots = $all('.hero-dot', hero);
    if (slides.length < 2) return;
    var INTERVAL = 6000, idx = 0, timer = null;
    hero.style.setProperty('--hero-interval', INTERVAL / 1000 + 's');

    function go(i) {
      if (i === idx) return;
      var prev = slides[idx];
      prev.classList.remove('active');
      prev.classList.add('leaving');
      setTimeout(function () { prev.classList.remove('leaving'); }, 1900);
      if (dots[idx]) { dots[idx].classList.remove('active'); dots[idx].setAttribute('aria-current', 'false'); }
      idx = i;
      slides[idx].classList.add('active');
      if (dots[idx]) {
        dots[idx].classList.remove('active'); void dots[idx].offsetWidth;   /* 진행바 애니메이션 재시작 */
        dots[idx].classList.add('active'); dots[idx].setAttribute('aria-current', 'true');
      }
    }
    function next() { go((idx + 1) % slides.length); }
    function start() { if (reduceMotion) return; stop(); timer = setInterval(next, INTERVAL); }
    function stop() { if (timer) clearInterval(timer); timer = null; }

    dots.forEach(function (dot, i) { dot.addEventListener('click', function () { go(i); start(); }); });
    if (reduceMotion) hero.classList.add('is-paused');
    else {
      /* 첫 장도 켄번스가 시작되도록 한 프레임 뒤 active 재부여 */
      slides[0].classList.remove('active');
      requestAnimationFrame(function () { requestAnimationFrame(function () { slides[0].classList.add('active'); }); });
    }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else start(); });
    start();
  }

  /* ── 7. 연혁 타임라인 ── */
  function initTimeline() {
    var wrap = doc.querySelector('.tl-wrap');
    if (!wrap) return;
    var fill = wrap.querySelector('.tl-rail-fill');
    var groups = $all('.tl-group', wrap);
    if (reduceMotion || !('IntersectionObserver' in window)) {
      groups.forEach(function (g) { g.classList.add('in-view'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -15% 0px' });
    groups.forEach(function (g) { io.observe(g); });

    if (!fill) return;
    var ticking = false;
    function update() {
      var r = wrap.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.7 - r.top) / Math.max(r.height, 1);
      wrap.style.setProperty('--tl-progress', Math.max(0, Math.min(1, p)).toFixed(4));
      ticking = false;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ── 8. 시공사례 갤러리 ── */
  function initGallery() {
    var grid = doc.querySelector('.gallery-grid');
    if (!grid) return;
    var cards = $all('.gal-card', grid);
    var buttons = $all('.filter-btn');
    var moreWrap = doc.querySelector('.gallery-more');
    var moreBtn = moreWrap && moreWrap.querySelector('button');
    var countEl = doc.querySelector('[data-gallery-count]');
    var PAGE = parseInt(grid.getAttribute('data-page-size'), 10) || 12;
    var current = 'all', shown = PAGE;

    function matched() { return cards.filter(function (c) { return current === 'all' || c.getAttribute('data-cat') === current; }); }
    function render(animate, fromIndex) {
      var list = matched();
      cards.forEach(function (c) { c.hidden = true; c.classList.remove('is-in', 'is-out'); });
      list.forEach(function (c, i) {
        if (i < shown) {
          c.hidden = false;
          if (animate && !reduceMotion && i >= (fromIndex || 0)) {
            c.style.setProperty('--gi', Math.min((i - (fromIndex || 0)) * 0.04, 0.48) + 's');
            c.classList.add('is-in');
          }
        }
      });
      if (moreWrap) moreWrap.hidden = list.length <= shown;
      if (countEl) countEl.textContent = list.length;
    }
    function applyFilter(cat) {
      if (cat === current) return;
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-filter') === cat;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var visible = cards.filter(function (c) { return !c.hidden; });
      current = cat; shown = PAGE;
      if (reduceMotion) { render(false); return; }
      visible.forEach(function (c) { c.classList.remove('is-in'); c.classList.add('is-out'); });
      setTimeout(function () { render(true, 0); }, 260);
    }
    buttons.forEach(function (b) { b.addEventListener('click', function () { applyFilter(b.getAttribute('data-filter')); history.replaceState(null, '', b.getAttribute('data-filter') === 'all' ? location.pathname : '#' + b.getAttribute('data-filter')); }); });
    if (moreBtn) moreBtn.addEventListener('click', function () { var from = shown; shown += PAGE; render(true, from); });

    var hashCat = location.hash.replace('#', '');
    if (hashCat && buttons.some(function (b) { return b.getAttribute('data-filter') === hashCat; })) {
      current = hashCat;
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-filter') === hashCat;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    render(false);

    /* 카드(현장) 하나를 누르면 그 현장 사진만 넘겨볼 수 있게 — 누른 카드의 링크 목록을 넘김 */
    initLightbox(function (clicked) {
      var card = clicked && clicked.closest('.gal-card');
      if (card) return $all('.gal-link', card);
      return cards.filter(function (c) { return !c.hidden; }).map(function (c) { return c.querySelector('.gal-link'); });
    });
  }

  /* 라이트박스 — 좌우 넘김 · ESC 닫기 · 방향키 · 포커스 복귀 */
  function initLightbox(getLinks) {
    var box = doc.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '사진 크게 보기');
    box.setAttribute('data-aria-label-ko', '사진 크게 보기');
    box.setAttribute('data-aria-label-en', 'Photo viewer');
    box.innerHTML =
      '<figure class="lb-figure"><img class="lb-img" alt=""><figcaption class="lb-cap"><span class="lb-text"></span><span class="lb-count"></span></figcaption></figure>' +
      '<button type="button" class="lb-btn lb-close" aria-label="닫기" data-aria-label-ko="닫기" data-aria-label-en="Close">&times;</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="이전 사진" data-aria-label-ko="이전 사진" data-aria-label-en="Previous photo">&#8249;</button>' +
      '<button type="button" class="lb-btn lb-next" aria-label="다음 사진" data-aria-label-ko="다음 사진" data-aria-label-en="Next photo">&#8250;</button>';
    body.appendChild(box);
    var img = box.querySelector('.lb-img'), text = box.querySelector('.lb-text'), count = box.querySelector('.lb-count');
    var links = [], pos = 0, lastFocus = null, trigger = null;   /* trigger: 방금 누른 카드의 링크 — 넘길 때도 같은 현장 안에서만 이동 */

    function show(i, clicked) {
      if (clicked) trigger = clicked;
      links = getLinks(trigger);
      if (!links.length) return;
      pos = (i + links.length) % links.length;
      var a = links[pos];
      img.classList.remove('loaded');
      img.onload = function () { img.classList.add('loaded'); };
      img.src = a.getAttribute('href');
      img.alt = (a.querySelector('img') || {}).alt || '';
      var card = a.closest('.cert-card');
      if (card) {   /* 인증 카드: 화면에 보이는 인증명 + 발급기관 · 번호 · 유효기간을 그대로 캡션으로 (site-info.js 갱신값 반영) */
        var parts = [card.querySelector('.cert-name').innerText.trim()];
        $all('.cert-meta dd', card).forEach(function (dd) { var t = dd.innerText.trim(); if (t) parts.push(t); });
        text.textContent = parts.join(' · ');
      } else {
        text.textContent = isEn() ? (a.getAttribute('data-caption-en') || '') : (a.getAttribute('data-caption') || '');
      }
      count.textContent = (pos + 1) + ' / ' + links.length;
      if (img.complete && img.naturalWidth) img.classList.add('loaded');
    }
    function open(i, clicked) {
      lastFocus = doc.activeElement;
      trigger = clicked || null;
      show(i, clicked);
      box.classList.add('open');
      body.classList.add('lb-lock');
      box.querySelector('.lb-close').focus();
    }
    function close() {
      box.classList.remove('open');
      body.classList.remove('lb-lock');
      if (lastFocus) lastFocus.focus();
    }
    doc.addEventListener('click', function (e) {
      var a = e.target.closest('.gal-link');
      if (!a) return;
      e.preventDefault();
      var list = getLinks(a);
      open(Math.max(0, list.indexOf(a)), a);
    });
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', function () { show(pos - 1); });
    box.querySelector('.lb-next').addEventListener('click', function () { show(pos + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    doc.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(pos - 1);
      else if (e.key === 'ArrowRight') show(pos + 1);
      else if (e.key === 'Tab') {   /* 포커스 가두기 */
        var f = $all('button', box), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var sx = null;
    box.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(pos + (dx < 0 ? 1 : -1));
      sx = null;
    });
    doc.addEventListener('neo:lang', function () { if (box.classList.contains('open')) show(pos); });
  }

  /* ── 9. 게시판 · 자료실 ── */
  function initBoards() {
    $all('.cert-grid').forEach(function (grid) {
      var empty = grid.querySelector('.cert-empty');
      if (empty) empty.hidden = grid.querySelectorAll('.cert-card').length > 0;
    });
    $all('.board-list').forEach(function (list) {
      var empty = list.parentNode.querySelector('.board-empty');
      if (empty) empty.hidden = list.children.length > 0;
    });
    $all('[data-file]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (a.getAttribute('data-file')) return;
        e.preventDefault();
        alert(isEn() ? 'This file is being prepared. Please contact us by phone.' : '자료를 준비 중입니다. 필요하시면 대표번호로 문의해 주세요.');
      });
    });
  }

  /* ── 10-1. 가로 스크롤 표 안내바 ──
     표가 화면보다 넓을 때, 표 아래에 항상 보이는 진행바를 그린다.
     (iOS·안드로이드는 스크롤바를 숨겨버려서 옆으로 밀 수 있다는 걸 알기 어렵다)
     · 들어오면 살짝 밀었다 돌아오며 "옆으로 움직인다"를 동작으로 알려준다
     · 손가락으로 바를 잡고 끌 수도 있다 */
  function initScrollBar() {
    $all('.table-wrap').forEach(function (wrap) {
      if (wrap.dataset.sbReady) return;
      wrap.dataset.sbReady = '1';

      var bar = doc.createElement('div');
      bar.className = 'tbl-sb';
      bar.setAttribute('aria-hidden', 'true');
      var thumb = doc.createElement('div');
      thumb.className = 'tbl-sb-thumb';
      bar.appendChild(thumb);
      wrap.insertAdjacentElement('afterend', bar);

      function scrollable() { return wrap.scrollWidth - wrap.clientWidth > 2; }

      function render() {
        if (!scrollable()) { bar.style.display = 'none'; return; }
        bar.style.display = '';
        var barW = bar.clientWidth;
        var thumbW = Math.max(36, (wrap.clientWidth / wrap.scrollWidth) * barW);
        thumb.style.width = thumbW + 'px';
        var maxScroll = wrap.scrollWidth - wrap.clientWidth;
        var maxThumbX = barW - thumbW;
        var x = maxScroll > 0 ? (wrap.scrollLeft / maxScroll) * maxThumbX : 0;
        thumb.style.transform = 'translateX(' + x + 'px)';
      }

      wrap.addEventListener('scroll', render, { passive: true });
      window.addEventListener('resize', render);
      if (window.ResizeObserver) new ResizeObserver(render).observe(wrap);
      render();

      /* 바를 직접 끌어서 이동 */
      var dragging = false;
      function moveTo(clientX) {
        var r = bar.getBoundingClientRect();
        var thumbW = thumb.offsetWidth;
        var ratio = (clientX - r.left - thumbW / 2) / Math.max(1, r.width - thumbW);
        ratio = Math.min(1, Math.max(0, ratio));
        wrap.scrollLeft = ratio * (wrap.scrollWidth - wrap.clientWidth);
      }
      bar.addEventListener('pointerdown', function (e) {
        if (!scrollable()) return;
        dragging = true; bar.setPointerCapture(e.pointerId); moveTo(e.clientX); e.preventDefault();
      });
      bar.addEventListener('pointermove', function (e) { if (dragging) moveTo(e.clientX); });
      bar.addEventListener('pointerup', function () { dragging = false; });
      bar.addEventListener('pointercancel', function () { dragging = false; });

      /* 화면에 처음 들어올 때 한 번 살짝 밀었다 되돌린다 */
      if (window.innerWidth <= 768 && 'IntersectionObserver' in window) {
        var nudged = false;
        var io2 = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (!en.isIntersecting || nudged || !scrollable()) return;
            nudged = true;
            wrap.style.scrollBehavior = 'smooth';
            setTimeout(function () { wrap.scrollLeft = 40; }, 400);
            setTimeout(function () { wrap.scrollLeft = 0; }, 950);
            setTimeout(function () { wrap.style.scrollBehavior = ''; }, 1400);
            io2.unobserve(en.target);
          });
        }, { threshold: 0.35 });
        io2.observe(wrap);
      }
    });
  }

  /* ── 11. 맨 위로 버튼 ── 한 화면 넘게 내려가면 나타난다 */
  function initToTop() {
    var btn = doc.getElementById('to-top');
    if (!btn) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function check() { btn.classList.toggle('show', window.pageYOffset > window.innerHeight * 0.6); }
    window.addEventListener('scroll', check, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    check();
  }

  /* ── 10. 넓은 표 스크롤 페이드 ── */
  function initTableFade() {
    $all('.scroll-fade').forEach(function (wrap) {
      var scroller = wrap.querySelector('.table-wrap');
      if (!scroller) return;
      function check() { wrap.classList.toggle('at-end', scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4); }
      scroller.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      check();
    });
  }

  /* ── 실행 ──
     content-loader.js 가 있으면 관리자가 저장한 내용을 먼저 그린 뒤에 시작한다.
     (로더가 없거나 서버 응답이 없으면 곧바로 시작 — 화면 동작은 그대로) */
  function boot() {
  applySiteInfo();
  var saved = null;
  try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
  setLang(saved === 'en' ? 'en' : 'ko');
  $all('.lang-btn').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });
  markActive();
  initHeader();
  initReveal();
  initHero();
  initTimeline();
  if (doc.querySelector('.gallery-grid')) initGallery();
  else if (doc.querySelector('.gal-link')) initLightbox(function () { return $all('.gal-link'); });
  initBoards();
  initTableFade();
  initScrollBar();
  initToTop();
  }

  if (window.NEO_CONTENT_READY && window.NEO_CONTENT_READY.then) {
    window.NEO_CONTENT_READY.then(boot, boot);
  } else {
    boot();
  }
})();
