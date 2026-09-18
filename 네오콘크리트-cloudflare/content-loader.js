/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 관리자가 저장한 내용을 화면에 반영하는 파일
   · /api/content 에서 내용을 받아 해당 영역만 다시 그린다.
   · 받아온 내용이 없거나(아직 저장 전) 서버가 응답하지 않으면
     HTML에 원래 적혀 있던 내용이 그대로 남는다 — 화면이 비는 일이 없다.
   · main.js 보다 반드시 먼저 불러야 한다 (main.js가 이 파일의 준비 신호를 기다린다).
═══════════════════════════════════════════════════════════ */
window.NEO_CONTENT_READY = (function () {
  'use strict';
  var doc = document;
  var TIMEOUT = 4000;              /* 서버가 느리면 기다리지 않고 기존 내용으로 진행 */

  /* 갤러리 분류 — 관리자 화면의 선택지와 같은 목록 */
  var CATS = ['parking', 'sidewalk', 'trail', 'coast', 'village', 'sports'];

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 한글 / 영문 두 벌을 한 쌍으로 만든다. main.js가 언어에 맞춰 보여준다 */
  function pair(ko, en, subKo, subEn) {
    var frag = doc.createDocumentFragment();
    /* 영문이 비어 있으면 한글을 그대로 쓴다 — 영문 화면이 빈칸으로 보이지 않게 */
    en = en || ko; ko = ko || en;
    subEn = subEn || subKo; subKo = subKo || subEn;
    [['ko-only', ko, subKo], ['en-only', en, subEn]].forEach(function (v) {
      var s = el('span', v[0], v[1] || '');
      if (v[0] === 'en-only') s.setAttribute('lang', 'en');
      if (v[2]) s.appendChild(el('small', null, v[2]));
      frag.appendChild(s);
    });
    return frag;
  }

  /* 저장된 적이 있으면(배열이 넘어오면) 0건이어도 그대로 반영한다.
     아예 항목이 없는 응답(아직 저장 전)일 때만 HTML의 기존 내용을 그대로 둔다. */
  function isList(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  /* ── 회사연혁 ── */
  function renderHistory(list) {
    var wrap = doc.querySelector('.tl-wrap');
    if (!wrap) return;
    var rail = wrap.querySelector('.tl-rail');
    wrap.innerHTML = '';
    if (rail) wrap.appendChild(rail);

    list.forEach(function (g) {
      var group = el('div', 'tl-group');
      var hd = el('div', 'tl-year-hd');
      hd.appendChild(el('h3', 'tl-year-num mono', g.year || ''));
      hd.appendChild(el('div', 'tl-year-line'));
      group.appendChild(hd);

      var ul = el('ul', 'tl-list');
      (g.items || []).forEach(function (it) {
        var li = doc.createElement('li');
        li.appendChild(el('span', 'tl-month', it.month || ''));
        var body = doc.createElement('span');
        body.appendChild(pair(it.ko, it.en, it.koSub, it.enSub));
        li.appendChild(body);
        ul.appendChild(li);
      });
      group.appendChild(ul);
      wrap.appendChild(group);
    });

    var empty = doc.querySelector('.tl-empty');
    if (empty) empty.hidden = list.length > 0;
  }

  /* ── 시공사례 갤러리 ── */
  function renderGallery(all) {
    var grid = doc.querySelector('.gallery-grid');
    if (!grid) return;
    /* 사진이 한 장도 없는 현장은 화면에도 개수에도 넣지 않는다 */
    var list = all.filter(function (s) {
      return (s.photos || []).some(function (p) { return p && p.src; });
    });
    grid.innerHTML = '';
    var photoTotal = 0;

    list.forEach(function (site) {
      var photos = (site.photos || []).filter(function (p) { return p && p.src; });
      if (!photos.length) return;
      photoTotal += photos.length;

      var li = el('li', 'gal-card');
      li.setAttribute('data-cat', site.cat || '');
      var capKo = [site.ko, site.useKo].filter(Boolean).join(' · ');
      var capEn = [site.en, site.useEn].filter(Boolean).join(' · ');

      photos.forEach(function (p, i) {
        var a = el('a', i === 0 ? 'gal-link' : 'gal-link gal-extra');
        a.href = p.src;
        a.setAttribute('data-caption', capKo);
        a.setAttribute('data-caption-en', capEn);
        if (i === 0) {
          var img = doc.createElement('img');
          img.src = p.thumb || p.src;
          img.alt = capKo + ' 시공 현장 사진';
          img.setAttribute('data-alt-en', capEn + ' project photo');
          img.width = 600; img.height = 450;
          img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
          a.appendChild(img);
        } else {
          a.setAttribute('aria-hidden', 'true');
          a.tabIndex = -1;
        }
        li.appendChild(a);
      });

      if (photos.length > 1) {
        var badge = el('span', 'gal-count');
        badge.setAttribute('aria-hidden', 'true');
        badge.appendChild(pair('사진 ' + photos.length + '장', photos.length + ' photos'));
        li.appendChild(badge);
      }
      var cap = el('div', 'gal-cap');
      var b = doc.createElement('b');
      b.appendChild(pair(site.ko, site.en));
      cap.appendChild(b);
      var use = doc.createElement('span');
      use.appendChild(pair(site.useKo, site.useEn));
      cap.appendChild(use);
      li.appendChild(cap);
      grid.appendChild(li);
    });

    var galEmpty = doc.querySelector('.gal-empty');
    if (galEmpty) galEmpty.hidden = list.length > 0;

    /* 분류 버튼의 개수 표시를 다시 세고, 해당 현장이 없는 분류는 감춘다 */
    var bar = doc.querySelector('.filter-bar');
    if (!bar) return;
    CATS.concat(['all']).forEach(function (key) {
      var btn = bar.querySelector('[data-filter="' + key + '"]');
      if (!btn) return;
      var n = key === 'all' ? list.length
        : list.filter(function (s) { return s.cat === key; }).length;
      var cnt = btn.querySelector('.cnt');
      if (cnt) cnt.textContent = n;
      btn.hidden = (n === 0 && key !== 'all');
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-gallery-count]'), function (n) {
      n.textContent = photoTotal;
    });
  }

  /* ── 인증서 · 특허 · 디자인등록 ── 카드 한 장 = 이미지 한 장.
     kind: 'cert' | 'patent' | 'design' 에 따라 상단 라벨 · 메타 항목 구성이 달라진다. */
  /* 2020-12-29 → 2020.12.29 (관리자에서는 날짜칸으로 고르고, 화면에는 점으로 보여준다) */
  function dotDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
    return m ? m[1] + '.' + m[2] + '.' + m[3] : String(v || '');
  }

  function certCard(item, kind) {
    var li = el('li', 'cert-card');
    var capKo = item.ko || '';
    var capEn = item.en || item.ko || '';

    /* 클릭해서 크게 보는 기능은 넣지 않는다 — 원본을 내려받아 합성하는 것을 막기 위함 */
    var a = el('div', 'cert-thumb');
    var img = doc.createElement('img');
    img.src = item.image || '';
    img.alt = capKo + ' 이미지';
    img.setAttribute('data-alt-en', capEn + ' image');
    img.loading = 'lazy'; img.decoding = 'async';
    a.appendChild(img);
    li.appendChild(a);

    var info = el('div', 'cert-info');
    var code = el('p', 'cert-code');
    if (kind === 'cert') code.appendChild(pair(item.code, item.codeEn || item.code));
    else code.textContent = kind === 'design' ? 'Design' : 'Patent';
    info.appendChild(code);

    var name = el('h3', 'cert-name');
    name.appendChild(pair(item.ko, item.en));
    info.appendChild(name);

    if (kind === 'cert' && (item.descKo || item.descEn)) {
      var desc = el('p', 'cert-desc');
      desc.appendChild(pair(item.descKo, item.descEn));
      info.appendChild(desc);
    }

    var meta = el('dl', 'cert-meta');
    function row(dtKo, dtEn, node, mono) {
      var dt = el('dt'); dt.appendChild(pair(dtKo, dtEn));
      var dd = el('dd', mono ? 'mono' : null); dd.appendChild(node);
      meta.appendChild(dt); meta.appendChild(dd);
    }
    if (kind === 'cert') {
      if (item.issuerKo || item.issuerEn) row('발급기관', 'Issued by', pair(item.issuerKo, item.issuerEn));
      /* 유효기간은 표시하지 않는다 (대표 지시) */
    } else {
      /* 특허 · 디자인등록은 번호 · 등록일 · 구분을 표시하지 않는다 (대표 지시) */
    }
    if (meta.childNodes.length) info.appendChild(meta);

    li.appendChild(info);
    return li;
  }

  function renderCertGrid(selector, list, kind, emptyKo, emptyEn) {
    var grid = doc.querySelector(selector);
    if (!grid) return;
    grid.innerHTML = '';
    list.forEach(function (item) { grid.appendChild(certCard(item, kind)); });
    if (!list.length) {
      var empty = el('li', 'cert-empty');
      empty.appendChild(pair(emptyKo, emptyEn));
      grid.appendChild(empty);
    }
  }

  function renderCerts(list) {
    renderCertGrid('[data-cert-grid="certs"]', list, 'cert', '등록된 인증서가 없습니다.', 'No certificates yet.');
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cert-count="certs"]'), function (n) { n.textContent = list.length; });
  }

  function renderPatents(list) {
    var patents = list.filter(function (p) { return p.kind !== 'design'; });
    var designs = list.filter(function (p) { return p.kind === 'design'; });
    renderCertGrid('[data-cert-grid="patents"]', patents, 'patent', '등록된 특허가 없습니다.', 'No patents yet.');
    renderCertGrid('[data-cert-grid="designs"]', designs, 'design', '등록된 디자인등록이 없습니다.', 'No registered designs yet.');
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cert-count="patents"]'), function (n) { n.textContent = patents.length; });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cert-count="designs"]'), function (n) { n.textContent = designs.length; });
  }

  /* ── 공지사항 ── 목록은 링크만, 본문은 support-notice.html 에서 ── */
  function noticeOrder(list) {
    /* 화면에 보이는 순서: 상단 고정이 먼저, 그다음 등록 순서 그대로 */
    var pinned = list.filter(function (n) { return n.pinned; });
    var rest = list.filter(function (n) { return !n.pinned; });
    return pinned.concat(rest);
  }
  function noticeId(n, i) { return n && n.id != null ? String(n.id) : 'n' + i; }

  function renderNotices(list) {
    var ul = doc.querySelector('[data-board="notice"] .board-list');
    if (!ul) return;
    ul.innerHTML = '';

    noticeOrder(list).forEach(function (n, idx) {
      var li = el('li', n.pinned ? 'board-row is-pinned' : 'board-row');
      li.setAttribute('data-id', noticeId(n, list.indexOf(n)));
      var line = el('div', 'board-line');
      line.appendChild(el('span', 'board-no mono', String(list.length - idx)));

      var a = el('a', 'board-title-btn');
      a.href = './support-notice.html?id=' + encodeURIComponent(noticeId(n, list.indexOf(n)));
      a.appendChild(pair(n.titleKo, n.titleEn));
      var chev = el('i', 'chev');
      chev.setAttribute('aria-hidden', 'true');
      a.appendChild(chev);
      line.appendChild(a);
      line.appendChild(el('span', 'board-date mono', n.date || ''));
      li.appendChild(line);
      ul.appendChild(li);
    });
  }

  /* ── 공지사항 본문 (support-notice.html) ── */
  function renderNoticeDetail(list) {
    var view = doc.querySelector('[data-notice-view]');
    if (!view) return;
    function slot(name) { return view.querySelector('[data-nv="' + name + '"]'); }

    var ordered = noticeOrder(list);
    var want = (new URLSearchParams(location.search)).get('id');
    var pos = -1;
    ordered.forEach(function (n, i) {
      if (pos < 0 && noticeId(n, list.indexOf(n)) === want) pos = i;
    });
    if (pos < 0 && !want && ordered.length) pos = 0;   /* 번호 없이 들어오면 첫 글 */

    var missing = slot('missing');
    var body = slot('body');
    var dateEl = slot('date');
    if (pos < 0) {
      if (missing) missing.hidden = false;
      if (body) body.hidden = true;
      if (dateEl) dateEl.hidden = true;
      return;
    }
    if (missing) missing.hidden = true;

    var n = ordered[pos];
    var title = slot('title');
    if (title) { title.innerHTML = ''; title.appendChild(pair(n.titleKo, n.titleEn)); }
    if (dateEl) { dateEl.hidden = !n.date; dateEl.textContent = n.date || ''; }
    if (body) {
      body.hidden = false;
      body.innerHTML = '';
      var koParas = String(n.bodyKo || '').split(/\n{2,}/);
      var enParas = String(n.bodyEn || '').split(/\n{2,}/);
      var len = Math.max(koParas.length, enParas.length);
      for (var i = 0; i < len; i++) {
        var para = doc.createElement('p');
        para.appendChild(pair(koParas[i] || '', enParas[i] || ''));
        body.appendChild(para);
      }
    }
    /* 첨부 사진 — 본문 아래에 차례로. 누르면 크게 볼 수 있게 main.js 의 라이트박스를 그대로 쓴다 */
    var figs = view.querySelector('[data-nv="images"]');
    if (figs) {
      figs.innerHTML = '';
      var imgs = (n.images || []).filter(function (im) { return im && im.url; });
      figs.hidden = imgs.length === 0;
      imgs.forEach(function (im, i) {
        var a = el('a', 'gal-link nv-fig');
        a.href = im.url;
        a.setAttribute('data-caption', (n.titleKo || '') + ' · 사진 ' + (i + 1));
        a.setAttribute('data-caption-en', (n.titleEn || n.titleKo || '') + ' · Photo ' + (i + 1));
        var img = doc.createElement('img');
        img.src = im.url;
        img.alt = (n.titleKo || '공지사항') + ' 첨부 사진 ' + (i + 1);
        img.setAttribute('data-alt-en', (n.titleEn || n.titleKo || 'Notice') + ' attached photo ' + (i + 1));
        img.loading = 'lazy'; img.decoding = 'async';
        a.appendChild(img);
        figs.appendChild(a);
      });
    }

    /* 문서 제목도 글 제목으로 (즐겨찾기·공유할 때 알아보기 쉽게) */
    var tail = ' | 공지사항 | (주)네오콘크리트';
    var tailEn = ' | Notices | NEO CONCRETE';
    if (n.titleKo) doc.body.setAttribute('data-title-ko', n.titleKo + tail);
    if (n.titleEn || n.titleKo) doc.body.setAttribute('data-title-en', (n.titleEn || n.titleKo) + tailEn);
    if (n.titleKo) doc.title = n.titleKo + tail;

    [['prev', pos - 1], ['next', pos + 1]].forEach(function (v) {
      var link = slot(v[0]);
      var label = slot(v[0] + '-title');
      var target = ordered[v[1]];
      if (!link) return;
      if (!target) { link.hidden = true; return; }
      link.hidden = false;
      link.href = './support-notice.html?id=' + encodeURIComponent(noticeId(target, list.indexOf(target)));
      if (label) { label.innerHTML = ''; label.appendChild(pair(target.titleKo, target.titleEn)); }
    });
  }

  /* ── 자료실 ── */
  function renderResources(list) {
    var ul = doc.querySelector('[data-board="resources"] .board-list');
    if (!ul) return;
    ul.innerHTML = '';

    list.forEach(function (f) {
      var li = el('li', 'file-row');
      var type = el('span', 'file-type');
      type.appendChild(el('span', 'cert-badge', String(f.type || 'FILE').toUpperCase()));
      li.appendChild(type);

      var title = el('span', 'file-title');
      title.appendChild(pair(f.titleKo, f.titleEn));
      if (f.descKo || f.descEn) {
        var small = doc.createElement('small');
        small.appendChild(pair(f.descKo, f.descEn));
        title.appendChild(small);
      }
      li.appendChild(title);
      li.appendChild(el('span', 'file-date mono', f.date || ''));

      var action = el('span', 'file-action');
      var a = el('a', 'btn btn-sm');
      a.href = f.file || '#';
      a.setAttribute('data-file', f.file || '');
      if (f.file) { a.setAttribute('download', ''); a.rel = 'noopener'; }
      a.appendChild(pair('다운로드', 'Download'));
      action.appendChild(a);
      li.appendChild(action);
      ul.appendChild(li);
    });
  }

  function apply(data) {
    if (!data) return;
    try {
      if (isList(data.history)) renderHistory(data.history);
      if (isList(data.gallery)) renderGallery(data.gallery);
      if (isList(data.certs)) renderCerts(data.certs);
      if (isList(data.patents)) renderPatents(data.patents);
      if (isList(data.notices)) { renderNotices(data.notices); renderNoticeDetail(data.notices); }
      if (isList(data.resources)) renderResources(data.resources);
    } catch (e) {
      /* 그리다 실패해도 페이지 나머지는 정상 동작해야 한다 */
      if (window.console) console.warn('내용 반영 실패', e);
    }
  }

  function fetchContent() {
    if (!window.fetch || location.protocol === 'file:') return Promise.resolve(null);
    return fetch('/api/content', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  var timer = new Promise(function (res) { setTimeout(function () { res(null); }, TIMEOUT); });
  return Promise.race([fetchContent(), timer]).then(function (data) {
    apply(data);
    /* 본문 페이지인데 아직 저장된 공지가 없으면 기본 데이터(content-seed.json)로 채운다 */
    if (doc.querySelector('[data-notice-view]') && !(data && isList(data.notices))) {
      return fetch('./content-seed.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (seed) {
          renderNoticeDetail(seed && isList(seed.notices) ? seed.notices : []);
          return data;
        });
    }
    return data;
  });
})();
