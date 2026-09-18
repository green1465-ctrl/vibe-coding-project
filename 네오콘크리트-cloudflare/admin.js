/* ═══════════════════════════════════════════════════════════
   (주)네오콘크리트 — 관리자 화면 동작
   · 저장은 [저장하기] 버튼을 누를 때만 일어난다 (자동저장 없음)
   · 내용 전체를 한 덩어리(JSON)로 읽고 쓴다 — /api/content
   · 사진·파일은 R2에 올리고 주소만 내용에 담는다 — /api/upload
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CATS = [
    ['parking',  '주차장',            'Parking Lots'],
    ['sidewalk', '보도 · 자전거도로', 'Sidewalks & Bike Paths'],
    ['trail',    '산책로 · 교량',     'Trails & Bridges'],
    ['coast',    '해안',              'Coasts'],
    ['village',  '마을길 · 시장',     'Village Roads & Markets'],
    ['sports',   '체육시설 · 학교',   'Sports & Schools']
  ];
  var FILE_TYPES = ['PDF', 'DWG', 'HWP', 'ZIP', 'XLS', 'DOC', 'IMG', '기타'];

  var data = null;
  var dirty = false;
  var $ = function (s) { return document.querySelector(s); };

  /* ── 아주 작은 DOM 도우미 ── */
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  /* ── 알림 ── */
  var toastTimer;
  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, isError ? 4200 : 2200);
  }

  function setDirty(v) {
    dirty = v;
    var s = $('#save-state');
    s.className = 'save-state' + (v ? ' dirty' : '');
    s.textContent = v ? '저장하지 않은 변경사항이 있습니다' : '';
  }
  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── 입력칸 만들기 ── */
  function field(label, value, onInput, opts) {
    opts = opts || {};
    var input = opts.multiline
      ? h('textarea', { value: value || '', rows: opts.rows || 4, placeholder: opts.placeholder || '' })
      : h('input', {
          type: opts.type || 'text', value: value == null ? '' : value,
          placeholder: opts.placeholder || '', maxlength: opts.maxlength || null,
          min: opts.min || null, max: opts.max || null, inputmode: opts.inputmode || null
        });
    input.addEventListener('input', function () { onInput(input.value); setDirty(true); });
    /* 날짜처럼 '다 고르고 나서' 목록을 다시 정렬해야 하는 칸에 쓴다 */
    if (opts.onCommit) input.addEventListener('change', function () { opts.onCommit(input.value); });
    var lab = h('label', {}, [document.createTextNode(label)]);
    if (opts.en) lab.appendChild(h('span', { class: 'en-tag', text: 'EN' }));
    return h('div', { class: 'fld' + (opts.cls ? ' ' + opts.cls : '') }, [lab, input]);
  }
  function selectField(label, value, options, onChange) {
    var sel = h('select', {}, options.map(function (o) {
      return h('option', { value: o[0], text: o[1], selected: o[0] === value });
    }));
    sel.addEventListener('change', function () { onChange(sel.value); setDirty(true); });
    return h('div', { class: 'fld' }, [h('label', { text: label }), sel]);
  }
  function checkField(label, value, onChange) {
    var box = h('input', { type: 'checkbox', checked: value });
    box.addEventListener('change', function () { onChange(box.checked); setDirty(true); });
    return h('label', { class: 'chk' }, [box, document.createTextNode(label)]);
  }

  /* ── 위/아래/삭제 버튼 ──
     noMove 를 주면 삭제만 남긴다 (공지사항 — 순서는 '상단 고정'과 등록 순서로만 정함) */
  function tools(arr, idx, rerender, delMsg, noMove) {
    function move(to) {
      if (to < 0 || to >= arr.length) return;
      var t = arr[idx]; arr[idx] = arr[to]; arr[to] = t;
      setDirty(true); rerender();
    }
    var kids = [];
    if (!noMove) {
      kids.push(h('button', { type: 'button', class: 'tool', title: '위로', disabled: idx === 0, text: '↑',
        onclick: function () { move(idx - 1); } }));
      kids.push(h('button', { type: 'button', class: 'tool', title: '아래로', disabled: idx === arr.length - 1, text: '↓',
        onclick: function () { move(idx + 1); } }));
    }
    kids.push(h('button', { type: 'button', class: 'tool del', title: '삭제', text: '✕',
      onclick: function () {
        if (!confirm(delMsg || '이 항목을 삭제할까요?')) return;
        arr.splice(idx, 1); setDirty(true); rerender();
      } }));
    return h('div', { class: 'tools' }, kids);
  }

  /* ── 날짜순 정렬 (최신이 위) ──
     목록 순서를 손으로 바꾸지 않고 '등록일'로만 정한다.
     날짜를 비워둔 항목은 맨 뒤로 보내고, 같은 날짜끼리는 원래 순서를 지킨다. */
  function sortByDate(list, pinnedFirst) {
    list.sort(function (a, b) {
      if (pinnedFirst && !!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      var da = a.date || '', db = b.date || '';
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? 1 : -1;
    });
  }
  function sortAll() {
    sortByDate(data.notices, true);
    sortByDate(data.resources, false);
    sortByDate(data.gallery, false);
    sortByDate(data.certs, false);
    sortByDate(data.patents, false);
  }

  /* ── 접이식 카드 (공지사항 · 시공사례 · 자료실 공용) ──
     한 줄로 접어두고 누르면 그 자리에서 펼친다. 어떤 항목을 펼쳐뒀는지는
     목록을 다시 그려도 유지된다(openItems). */
  var openItems = (typeof WeakSet === 'function') ? new WeakSet() : null;
  function isOpen(o) { return openItems ? openItems.has(o) : false; }
  function setOpen(o, v) {
    if (!openItems) return;
    if (v) openItems.add(o); else openItems.delete(o);
  }

  function foldCard(cfg) {
    var open = isOpen(cfg.item);
    var card;
    var chev = h('i', { class: 'fold-chev', 'aria-hidden': 'true' });
    var head = h('button', {
      type: 'button', class: 'fold-head', 'aria-expanded': open ? 'true' : 'false',
      onclick: function () {
        var next = !card.classList.contains('is-open');
        card.classList.toggle('is-open', next);
        head.setAttribute('aria-expanded', next ? 'true' : 'false');
        setOpen(cfg.item, next);
      }
    }, cfg.head.concat([chev]));

    var foot = h('div', { class: 'fold-foot' }, [
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: '접기',
        onclick: function () {
          card.classList.remove('is-open');
          head.setAttribute('aria-expanded', 'false');
          setOpen(cfg.item, false);
          head.scrollIntoView({ block: 'nearest' });
        } })
    ]);

    card = h('div', { class: 'card fold' + (open ? ' is-open' : '') }, [
      h('div', { class: 'fold-line' }, [
        head,
        tools(cfg.list, cfg.idx, cfg.rerender, cfg.delMsg, true)
      ]),
      h('div', { class: 'fold-body' }, [
        h('div', {}, [h('div', { class: 'fold-inner' }, cfg.body.concat([foot]))])
      ])
    ]);
    return card;
  }

  /* ─ ─ 목록을 12개씩 쪽으로 나눈다 ─ ─
     항목이 많아지면 스크롤이 끝없이 길어지므로, 한 쪽에 12개만 보여주고 아래에 쪽번호를 단다. */
  var PAGE_SIZE = 12;
  var page = { history: 1, gallery: 1, certs: 1, patents: 1, notices: 1, resources: 1 };

  function pageCount(list) { return Math.max(1, Math.ceil(list.length / PAGE_SIZE)); }

  function pageSlice(list, key) {
    var last = pageCount(list);
    if (page[key] > last) page[key] = last;      /* 지우다가 쪽이 사라진 경우 */
    if (page[key] < 1) page[key] = 1;
    var start = (page[key] - 1) * PAGE_SIZE;
    return { start: start, items: list.slice(start, start + PAGE_SIZE) };
  }

  /* 한 쪽에 다 들어오면 쪽번호를 아예 만들지 않는다 */
  function pager(list, key, rerender) {
    var last = pageCount(list);
    if (last < 2) return null;
    var cur = page[key];

    function go(n) {
      page[key] = Math.min(Math.max(1, n), last);
      rerender();
      var panel = document.querySelector('.panel:not([hidden])');
      if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    var kids = [h('button', {
      type: 'button', class: 'pg-btn', text: '‹ 이전', disabled: cur === 1,
      onclick: function () { go(cur - 1); }
    })];

    /* 쪽이 많으면 지금 쪽 주변만 보여준다 */
    var nums = [];
    if (last <= 9) {
      for (var i = 1; i <= last; i++) nums.push(i);
    } else {
      nums.push(1);
      var from = Math.max(2, cur - 2), to = Math.min(last - 1, cur + 2);
      if (from > 2) nums.push('gap');
      for (var j = from; j <= to; j++) nums.push(j);
      if (to < last - 1) nums.push('gap');
      nums.push(last);
    }
    nums.forEach(function (n) {
      if (n === 'gap') { kids.push(h('span', { class: 'pg-gap', text: '…' })); return; }
      kids.push(h('button', {
        type: 'button', class: 'pg-num' + (n === cur ? ' is-on' : ''), text: String(n),
        'aria-current': n === cur ? 'page' : null,
        onclick: function () { go(n); }
      }));
    });

    kids.push(h('button', {
      type: 'button', class: 'pg-btn', text: '다음 ›', disabled: cur === last,
      onclick: function () { go(cur + 1); }
    }));

    return h('nav', { class: 'pager', 'aria-label': '쪽 이동' }, kids);
  }

  /* '1–12 / 모두 25건' 처럼 지금 보고 있는 범위를 알려준다 */
  function rangeText(list, key, unit) {
    var sl = pageSlice(list, key);
    if (list.length <= PAGE_SIZE) return list.length + unit;
    return (sl.start + 1) + '–' + (sl.start + sl.items.length) + ' / 모두 ' + list.length + unit;
  }

  /* 방금 추가한 항목이 있는 자리로 화면을 옮긴다.
     날짜순으로 정렬되므로 새 항목이 항상 맨 위에 오는 것은 아니다. */
  function revealItem(boxSel, list, item, key, rerender) {
    var idx = list.indexOf(item);
    if (idx < 0) return;
    if (key) {                                   /* 새 항목이 다른 쪽에 있으면 그 쪽으로 넘긴다 */
      var want = Math.floor(idx / PAGE_SIZE) + 1;
      if (page[key] !== want) { page[key] = want; if (rerender) rerender(); }
    }
    var cards = document.querySelectorAll(boxSel + ' .card');
    var el = cards[idx - ((key ? page[key] : 1) - 1) * PAGE_SIZE];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* 목록 맨 위 안내줄 + [모두 접기] */
  function foldBar(list, hint, rerender) {
    return h('div', { class: 'fold-bar' }, [
      h('span', { class: 'hint', text: hint }),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: '모두 접기',
        onclick: function () { list.forEach(function (o) { setOpen(o, false); }); rerender(); } })
    ]);
  }

  /* ═════ 1. 회사연혁 ═════ */
  function renderHistory() {
    var box = $('#history-list');
    box.innerHTML = '';
    var list = data.history;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 연혁이 없습니다. 아래 버튼으로 연도를 추가하세요.' }));
      return;
    }
    if (list.length > PAGE_SIZE) {
      box.appendChild(h('div', { class: 'fold-bar' }, [
        h('span', { class: 'hint', text: '연도 ' + rangeText(list, 'history', '개') })
      ]));
    }
    var pg_ = pageSlice(list, 'history');
    pg_.items.forEach(function (g, k_) {
      var gi = pg_.start + k_;
      var yr = h('input', { type: 'text', class: 'yr-input', value: g.year || '', maxlength: 8, placeholder: '2026' });
      yr.addEventListener('input', function () { g.year = yr.value; setDirty(true); });

      var items = h('div', {});
      function drawItems() {
        items.innerHTML = '';
        (g.items || []).forEach(function (it, ii) {
          var month = h('input', { type: 'text', value: it.month || '', maxlength: 2, placeholder: '월' });
          month.addEventListener('input', function () { it.month = month.value; setDirty(true); });

          items.appendChild(h('div', { class: 'hitem' }, [
            h('div', { class: 'fld' }, [h('label', { text: '월' }), month]),
            h('div', { class: 'hbody' }, [
              h('div', { class: 'grid g2' }, [
                field('내용', it.ko, function (v) { it.ko = v; }, { placeholder: '예) 벤처기업 확인' }),
                field('내용', it.en, function (v) { it.en = v; }, { en: true, placeholder: 'Confirmed as a Venture Company' })
              ]),
              h('div', { class: 'grid g2' }, [
                field('보조 설명 (선택)', it.koSub, function (v) { it.koSub = v; }, { placeholder: '예) 혁신성장유형' }),
                field('보조 설명 (선택)', it.enSub, function (v) { it.enSub = v; }, { en: true, placeholder: 'Innovation growth type' })
              ])
            ]),
            h('button', { type: 'button', class: 'tool del', title: '이 내용 삭제', text: '✕',
              onclick: function () {
                if (!confirm('이 연혁 내용을 삭제할까요?')) return;
                g.items.splice(ii, 1); setDirty(true); drawItems();
              } })
          ]));
        });
        items.appendChild(h('button', {
          type: 'button', class: 'btn btn-outline btn-sm', text: '+ 내용 추가',
          onclick: function () {
            g.items = g.items || [];
            g.items.push({ month: '', ko: '', en: '', koSub: '', enSub: '' });
            setDirty(true); drawItems();
          }
        }));
      }
      drawItems();

      box.appendChild(h('div', { class: 'card year-card' }, [
        h('div', { class: 'card-top' }, [
          yr,
          h('span', { class: 'card-name', text: '년' }),
          h('span', { class: 'spacer' }),
          tools(list, gi, renderHistory, '이 연도와 안에 있는 내용을 모두 삭제할까요?')
        ]),
        items
      ]));
    });

    var pgEl_ = pager(list, 'history', renderHistory);
    if (pgEl_) box.appendChild(pgEl_);
  }

  /* ═════ 2. 시공사례 갤러리 ═════ */
  function renderGallery() {
    var box = $('#gallery-list');
    box.innerHTML = '';
    var list = data.gallery;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 현장이 없습니다. 아래 버튼으로 현장을 추가하세요.' }));
      return;
    }
    box.appendChild(foldBar(list, '현장 ' + rangeText(list, 'gallery', '곳') + ' · 현장 이름을 누르면 펼쳐집니다 · 등록일이 최근인 현장이 위', renderGallery));

    var pg_ = pageSlice(list, 'gallery');
    pg_.items.forEach(function (site, k_) {
      var si = pg_.start + k_;
      site.photos = site.photos || [];

      var catName = (CATS.filter(function (c) { return c[0] === site.cat; })[0] || [0, '분류 없음'])[1];
      var tagEl = h('span', { class: 'fold-tag', text: catName });
      var nameEl = h('span', { class: 'fold-title', text: site.ko || '(이름 없는 현장)' });
      var metaEl = h('span', { class: 'fold-date' });
      function drawMeta() {
        metaEl.textContent = (site.date ? site.date + ' · ' : '') + '사진 ' + site.photos.length + '장';
      }

      var photos = h('div', { class: 'photos' });
      function drawPhotos() {
        photos.innerHTML = '';
        site.photos.forEach(function (p, pi) {
          function swap(to) {
            if (to < 0 || to >= site.photos.length) return;
            var t = site.photos[pi]; site.photos[pi] = site.photos[to]; site.photos[to] = t;
            setDirty(true); drawPhotos();
          }
          photos.appendChild(h('div', { class: 'photo' + (pi === 0 ? ' is-cover' : '') }, [
            h('img', { src: p.thumb || p.src, alt: '' }),
            h('button', { type: 'button', class: 'x', title: '사진 삭제', text: '✕',
              onclick: function () {
                var up = isUploaded(p.src);
                if (!confirm(up ? '이 사진을 삭제할까요? (저장소에서도 지워집니다)' : '이 사진을 목록에서 뺄까요?')) return;
                if (up) removeUploaded(p.src);
                site.photos.splice(pi, 1); setDirty(true); drawPhotos();
              } }),
            h('div', { class: 'pmove' }, [
              h('button', { type: 'button', title: '앞으로', text: '‹', disabled: pi === 0,
                onclick: function () { swap(pi - 1); } }),
              h('button', { type: 'button', title: '뒤로', text: '›', disabled: pi === site.photos.length - 1,
                onclick: function () { swap(pi + 1); } })
            ])
          ]));
        });
        var picker = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
        picker.addEventListener('change', function () {
          uploadMany(picker.files, 'gallery', function (results) {
            results.forEach(function (r) { site.photos.push({ src: r.url, thumb: r.url }); });
            picker.value = '';
            setDirty(true); drawPhotos();
          });
        });
        photos.appendChild(h('button', { type: 'button', class: 'addphoto', text: '+ 사진 추가',
          onclick: function () { picker.click(); } }));
        photos.appendChild(picker);
        drawMeta();
      }
      drawPhotos();

      var dateFld = field('등록일 (목록 순서를 정합니다)', site.date, function (v) { site.date = v; drawMeta(); },
        { type: 'date', onCommit: function () { sortAll(); renderGallery(); } });
      dateFld.style.maxWidth = '260px';

      box.appendChild(foldCard({
        item: site, list: list, idx: si, rerender: renderGallery,
        delMsg: '이 현장과 사진 목록을 삭제할까요? (올린 사진 파일 자체는 남습니다)',
        head: [tagEl, nameEl, metaEl],
        body: [
          h('div', { class: 'grid g2' }, [
            field('현장 이름', site.ko, function (v) { site.ko = v; nameEl.textContent = v || '(이름 없는 현장)'; },
              { placeholder: '예) 양양 강현체육시설' }),
            field('현장 이름', site.en, function (v) { site.en = v; }, { en: true, placeholder: 'Ganghyeon Sports Facility, Yangyang' })
          ]),
          h('div', { class: 'grid g3', style: 'margin-top:12px' }, [
            selectField('분류', site.cat, CATS.map(function (c) { return [c[0], c[1]]; }), function (v) {
              site.cat = v;
              var found = CATS.filter(function (c) { return c[0] === v; })[0];
              if (found) {
                tagEl.textContent = found[1];
                if (!site.useKo) site.useKo = found[1];
                if (!site.useEn) site.useEn = found[2];
              }
            }),
            field('용도 표기', site.useKo, function (v) { site.useKo = v; }, { placeholder: '예) 주차장' }),
            field('용도 표기', site.useEn, function (v) { site.useEn = v; }, { en: true, placeholder: 'Parking Lot' })
          ]),
          h('div', { class: 'row-line', style: 'margin-top:12px' }, [dateFld]),
          h('p', { class: 'hint', style: 'margin:14px 0 0', text: '사진 — 맨 앞 사진이 카드에 보이는 대표 사진입니다. ‹ › 로 순서를 바꿉니다.' }),
          photos
        ]
      }));
    });

    var pgEl_ = pager(list, 'gallery', renderGallery);
    if (pgEl_) box.appendChild(pgEl_);
  }

  /* ── 인증서 · 특허 카드에 공용으로 쓰는 사진 한 장 필드 ── */
  function imageField(item, kind, rerender) {
    var box = h('div', { class: 'photos' });
    function draw() {
      box.innerHTML = '';
      if (item.image) {
        box.appendChild(h('div', { class: 'photo' }, [
          h('img', { src: item.image, alt: '' }),
          h('button', { type: 'button', class: 'x', title: '이미지 삭제', text: '✕',
            onclick: function () {
              var up = isUploaded(item.image);
              if (!confirm(up ? '이 이미지를 삭제할까요? (저장소에서도 지워집니다)' : '이미지를 뺄까요?')) return;
              if (up) removeUploaded(item.image);
              item.image = ''; setDirty(true); draw();
            } })
        ]));
      }
      var picker = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      picker.addEventListener('change', function () {
        uploadMany(picker.files, kind, function (results) {
          if (results[0]) item.image = results[0].url;
          picker.value = '';
          setDirty(true); draw();
        });
      });
      if (!item.image) {
        box.appendChild(h('button', { type: 'button', class: 'addphoto', text: '+ 이미지',
          onclick: function () { picker.click(); } }));
      } else {
        box.appendChild(h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: '이미지 교체',
          onclick: function () { picker.click(); } }));
      }
      box.appendChild(picker);
    }
    draw();
    return box;
  }

  /* ═════ 3-1. 인증서 ═════ */
  function renderCerts() {
    var box = $('#certs-list');
    box.innerHTML = '';
    var list = data.certs;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 인증서가 없습니다. 아래 버튼으로 추가하세요.' }));
      return;
    }
    box.appendChild(foldBar(list, '인증서 ' + rangeText(list, 'certs', '건') + ' \u00b7 인증서명을 누르면 펼쳐집니다 \u00b7 취득일이 최근인 것이 위', renderCerts));

    var pg_ = pageSlice(list, 'certs');
    pg_.items.forEach(function (c, k_) {
      var ci = pg_.start + k_;
      var tagEl = h('span', { class: 'fold-tag', text: c.code || '인증' });
      var nameEl = h('span', { class: 'fold-title', text: c.ko || '(인증서명 없음)' });
      var metaEl = h('span', { class: 'fold-date' });
      function drawMeta() {
        metaEl.textContent = c.date || '';
      }
      drawMeta();

      var dateFld = field('취득일 (목록 순서를 정합니다)', c.date, function (v) { c.date = v; drawMeta(); },
        { type: 'date', onCommit: function () { sortAll(); renderCerts(); } });

      box.appendChild(foldCard({
        item: c, list: list, idx: ci, rerender: renderCerts,
        delMsg: '이 인증서를 삭제할까요?',
        head: [tagEl, nameEl, metaEl],
        body: [
          h('div', { class: 'grid g2' }, [
            field('인증서명', c.ko, function (v) { c.ko = v; nameEl.textContent = v || '(인증서명 없음)'; }),
            field('인증서명', c.en, function (v) { c.en = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
            field('상단 라벨 (예: KS F 4419, Inno-Biz)', c.code, function (v) { c.code = v; tagEl.textContent = v || '인증'; }),
            field('상단 라벨', c.codeEn, function (v) { c.codeEn = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
            field('설명 (선택)', c.descKo, function (v) { c.descKo = v; }),
            field('설명 (선택)', c.descEn, function (v) { c.descEn = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
            field('발급기관 (선택)', c.issuerKo, function (v) { c.issuerKo = v; }),
            field('발급기관 (선택)', c.issuerEn, function (v) { c.issuerEn = v; }, { en: true })
          ]),
          h('div', { class: 'grid g3', style: 'margin-top:12px' }, [
            field('번호 (선택)', c.no, function (v) { c.no = v; }),
            field('번호', c.noEn, function (v) { c.noEn = v; }, { en: true }),
            h('div', {})
          ]),
          h('div', { class: 'row-line', style: 'margin-top:12px' }, [dateFld]),
          h('p', { class: 'hint', style: 'margin:14px 0 6px', text: '인증서 이미지' }),
          imageField(c, 'certs', renderCerts)
        ]
      }));
    });

    var pgEl_ = pager(list, 'certs', renderCerts);
    if (pgEl_) box.appendChild(pgEl_);
  }

  /* ═════ 3-2. 특허 · 디자인등록 ═════ */
  function renderPatents() {
    var box = $('#patents-list');
    box.innerHTML = '';
    var list = data.patents;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 특허 \u00b7 디자인등록이 없습니다. 아래 버튼으로 추가하세요.' }));
      return;
    }
    box.appendChild(foldBar(list, '특허 \u00b7 디자인등록 ' + rangeText(list, 'patents', '건') + ' \u00b7 명칭을 누르면 펼쳐집니다 \u00b7 등록일이 최근인 것이 위', renderPatents));

    var pg_ = pageSlice(list, 'patents');
    pg_.items.forEach(function (pt, k_) {
      var pi = pg_.start + k_;
      var tagEl = h('span', { class: 'fold-tag', text: pt.kind === 'design' ? '디자인' : '특허' });
      var nameEl = h('span', { class: 'fold-title', text: pt.ko || '(명칭 없음)' });
      var metaEl = h('span', { class: 'fold-date' });
      function drawMeta() {
        metaEl.textContent = [pt.no, pt.date].filter(Boolean).join(' \u00b7 ');
      }
      drawMeta();

      var dateFld = field('등록일 (목록 순서를 정합니다)', pt.date, function (v) { pt.date = v; drawMeta(); },
        { type: 'date', onCommit: function () { sortAll(); renderPatents(); } });

      box.appendChild(foldCard({
        item: pt, list: list, idx: pi, rerender: renderPatents,
        delMsg: '이 항목을 삭제할까요?',
        head: [tagEl, nameEl, metaEl],
        body: [
          h('div', { class: 'grid g3', style: 'max-width:520px' }, [
            selectField('구분', pt.kind, [['patent', '특허'], ['design', '디자인등록']], function (v) {
              pt.kind = v;
              tagEl.textContent = v === 'design' ? '디자인' : '특허';
            })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
            field('명칭', pt.ko, function (v) { pt.ko = v; nameEl.textContent = v || '(명칭 없음)'; }),
            field('명칭', pt.en, function (v) { pt.en = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px;max-width:520px' }, [
            field('특허 \u00b7 등록번호', pt.no, function (v) { pt.no = v; drawMeta(); }, { placeholder: '10-2198755' }),
            dateFld
          ]),
          h('p', { class: 'hint', style: 'margin:14px 0 6px', text: '이미지' }),
          imageField(pt, 'certs', renderPatents)
        ]
      }));
    });

    var pgEl_ = pager(list, 'patents', renderPatents);
    if (pgEl_) box.appendChild(pgEl_);
  }

  /* ═════ 3. 공지사항 ═════ */
  function renderNotices() {
    var box = $('#notices-list');
    box.innerHTML = '';
    var list = data.notices;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 공지사항이 없습니다.' }));
      return;
    }

    box.appendChild(foldBar(list, '공지 ' + rangeText(list, 'notices', '건') + ' · 제목을 누르면 펼쳐집니다 · 등록일이 최근인 글이 위, ‘상단 고정’한 글은 항상 맨 앞', renderNotices));

    var pg_ = pageSlice(list, 'notices');
    pg_.items.forEach(function (n, k_) {
      var ni = pg_.start + k_;
      n.images = Array.isArray(n.images) ? n.images : [];
      var open = isOpen(n);
      var bodyId = 'notice-edit-' + ni;
      var card;

      /* ── 접힌 줄 (고정 · 제목 · 날짜) ── */
      var titleEl = h('span', { class: 'fold-title', text: n.titleKo || '(제목 없음)' });
      var dateEl = h('span', { class: 'fold-date', text: n.date || '' });
      var pinEl = h('span', { class: 'fold-pin' + (n.pinned ? '' : ' off'), title: '상단 고정', text: '고정' });
      var chev = h('i', { class: 'fold-chev', 'aria-hidden': 'true' });

      var head = h('button', {
        type: 'button', class: 'fold-head',
        'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId,
        onclick: function () {
          var next = !card.classList.contains('is-open');
          card.classList.toggle('is-open', next);
          head.setAttribute('aria-expanded', next ? 'true' : 'false');
          setOpen(n, next);
        }
      }, [pinEl, titleEl, dateEl, chev]);

      /* ── 펼친 내용 ── */
      var pics = h('div', { class: 'photos' });
      function drawPics() {
        pics.innerHTML = '';
        n.images.forEach(function (im, pi) {
          function swap(to) {
            if (to < 0 || to >= n.images.length) return;
            var t = n.images[pi]; n.images[pi] = n.images[to]; n.images[to] = t;
            setDirty(true); drawPics();
          }
          pics.appendChild(h('div', { class: 'photo' }, [
            h('img', { src: im.url, alt: '' }),
            h('button', { type: 'button', class: 'x', title: '사진 삭제', text: '✕',
              onclick: function () {
                var up = isUploaded(im.url);
                if (!confirm(up ? '이 사진을 삭제할까요? (저장소에서도 지워집니다)' : '이 사진을 뺄까요?')) return;
                if (up) removeUploaded(im.url);
                n.images.splice(pi, 1); setDirty(true); drawPics();
              } }),
            h('div', { class: 'pmove' }, [
              h('button', { type: 'button', title: '앞으로', text: '‹', disabled: pi === 0,
                onclick: function () { swap(pi - 1); } }),
              h('button', { type: 'button', title: '뒤로', text: '›', disabled: pi === n.images.length - 1,
                onclick: function () { swap(pi + 1); } })
            ])
          ]));
        });
        var picker = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
        picker.addEventListener('change', function () {
          uploadMany(picker.files, 'notices', function (results) {
            results.forEach(function (r) { n.images.push({ url: r.url, name: r.name }); });
            picker.value = '';
            setDirty(true); drawPics();
          });
        });
        pics.appendChild(h('button', { type: 'button', class: 'addphoto', text: '+ 사진 추가',
          onclick: function () { picker.click(); } }));
        pics.appendChild(picker);
      }
      drawPics();

      var dateFld = field('등록일 (목록 순서를 정합니다)', n.date, function (v) { n.date = v; dateEl.textContent = v || ''; },
        { type: 'date', onCommit: function () { sortAll(); renderNotices(); } });
      dateFld.style.maxWidth = '260px';

      var inner = h('div', { class: 'fold-inner' }, [
        h('div', { class: 'grid g2' }, [
          field('제목', n.titleKo, function (v) { n.titleKo = v; titleEl.textContent = v || '(제목 없음)'; }),
          field('제목', n.titleEn, function (v) { n.titleEn = v; }, { en: true })
        ]),
        h('div', { class: 'row-line', style: 'margin-top:12px' }, [
          dateFld,
          checkField('상단 고정 (항상 맨 위에 보이기)', n.pinned, function (v) {
            n.pinned = v;
            pinEl.className = 'fold-pin' + (v ? '' : ' off');
            sortAll(); renderNotices();
          })
        ]),
        h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
          field('내용', n.bodyKo, function (v) { n.bodyKo = v; }, { multiline: true, rows: 6 }),
          field('내용', n.bodyEn, function (v) { n.bodyEn = v; }, { multiline: true, rows: 6, en: true })
        ]),
        h('p', { class: 'hint', style: 'margin:8px 0 0', text: '한 줄 띄우면 문단이 나뉩니다.' }),
        h('p', { class: 'hint', style: 'margin:16px 0 0', text: '사진 (본문 아래에 차례로 보입니다 · ‹ › 로 순서를 바꿉니다)' }),
        pics,
        h('div', { class: 'fold-foot' }, [
          h('button', { type: 'button', class: 'btn btn-outline btn-sm', text: '접기',
            onclick: function () {
              card.classList.remove('is-open');
              head.setAttribute('aria-expanded', 'false');
              setOpen(n, false);
              head.scrollIntoView({ block: 'nearest' });
            } })
        ])
      ]);

      card = h('div', { class: 'card fold' + (open ? ' is-open' : '') }, [
        h('div', { class: 'fold-line' }, [
          head,
          tools(list, ni, renderNotices, '이 공지사항을 삭제할까요?', true)
        ]),
        h('div', { class: 'fold-body', id: bodyId }, [h('div', {}, [inner])])
      ]);
      box.appendChild(card);

    });

    var pgEl_ = pager(list, 'notices', renderNotices);
    if (pgEl_) box.appendChild(pgEl_);
  }

  /* ═════ 4. 자료실 ═════ */
  function renderResources() {
    var box = $('#resources-list');
    box.innerHTML = '';
    var list = data.resources;
    if (!list.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 자료가 없습니다.' }));
      return;
    }
    box.appendChild(foldBar(list, '자료 ' + rangeText(list, 'resources', '건') + ' · 자료명을 누르면 펼쳐집니다 · 등록일이 최근인 자료가 위', renderResources));

    var pg_ = pageSlice(list, 'resources');
    pg_.items.forEach(function (f, k_) {
      var fi = pg_.start + k_;
      var tagEl = h('span', { class: 'fold-tag', text: f.type || 'FILE' });
      var nameEl = h('span', { class: 'fold-title', text: f.titleKo || '(자료명 없음)' });
      var dateEl = h('span', { class: 'fold-date', text: f.date || '' });

      var fileBox = h('div', { class: 'filebox' });
      function drawFile() {
        fileBox.innerHTML = '';
        var picker = h('input', { type: 'file', style: 'display:none' });
        picker.addEventListener('change', function () {
          uploadMany(picker.files, 'files', function (res) {
            if (res[0]) {
              f.file = res[0].url;
              f.fileName = res[0].name;
              var ext = (res[0].name.match(/\.([^.]+)$/) || ['', ''])[1].toUpperCase();
              var guess = { JPG: 'IMG', JPEG: 'IMG', PNG: 'IMG', WEBP: 'IMG', GIF: 'IMG',
                XLSX: 'XLS', DOCX: 'DOC', PPTX: '기타' }[ext] || ext;
              if (FILE_TYPES.indexOf(guess) >= 0) { f.type = guess; }
              setDirty(true); renderResources();
            }
            picker.value = '';
          });
        });
        fileBox.appendChild(h('span', { class: 'fname' + (f.file ? '' : ' none'),
          text: f.file ? (f.fileName || decodeURIComponent(String(f.file).split('/').pop())) : '올린 파일이 없습니다 (방문자에게는 ‘준비 중’으로 안내됩니다)' }));
        if (f.file) {
          fileBox.appendChild(h('a', { class: 'btn btn-outline btn-sm', href: f.file, target: '_blank', rel: 'noopener', text: '확인' }));
          fileBox.appendChild(h('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '파일 지우기',
            onclick: function () {
              var up = isUploaded(f.file);
              if (!confirm(up ? '이 파일을 삭제할까요? (저장소에서도 지워집니다)' : '연결된 파일을 뺄까요?')) return;
              if (up) removeUploaded(f.file);
              f.file = ''; f.fileName = ''; setDirty(true); drawFile();
            } }));
        }
        fileBox.appendChild(h('button', { type: 'button', class: 'btn btn-sm', text: f.file ? '파일 교체' : '파일 올리기',
          onclick: function () { picker.click(); } }));
        fileBox.appendChild(picker);
      }
      drawFile();

      var dateFld = field('등록일 (목록 순서를 정합니다)', f.date, function (v) { f.date = v; dateEl.textContent = v || ''; },
        { type: 'date', onCommit: function () { sortAll(); renderResources(); } });

      box.appendChild(foldCard({
        item: f, list: list, idx: fi, rerender: renderResources,
        delMsg: '이 자료를 목록에서 삭제할까요?',
        head: [tagEl, nameEl, dateEl],
        body: [
          h('div', { class: 'grid g2' }, [
            field('자료명', f.titleKo, function (v) { f.titleKo = v; nameEl.textContent = v || '(자료명 없음)'; }),
            field('자료명', f.titleEn, function (v) { f.titleEn = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px' }, [
            field('설명 (선택)', f.descKo, function (v) { f.descKo = v; }),
            field('설명 (선택)', f.descEn, function (v) { f.descEn = v; }, { en: true })
          ]),
          h('div', { class: 'grid g2', style: 'margin-top:12px;max-width:520px' }, [
            selectField('형식', f.type, FILE_TYPES.map(function (t) { return [t, t]; }), function (v) {
              f.type = v; tagEl.textContent = v;
            }),
            dateFld
          ]),
          h('p', { class: 'hint', style: 'margin:14px 0 6px', text: '내려받을 파일' }),
          fileBox
        ]
      }));
    });

    var pgEl_ = pager(list, 'resources', renderResources);
    if (pgEl_) box.appendChild(pgEl_);
  }

  var RENDER = {
    history: renderHistory, gallery: renderGallery,
    certs: renderCerts, patents: renderPatents,
    notices: renderNotices, resources: renderResources
  };

  /* ── 저장소(R2)에 올린 파일인지 판별하고 지우기 ── */
  function isUploaded(url) {
    return /^https?:\/\//.test(String(url || '')) && /\/(gallery|files|notices|certs)\//.test(String(url));
  }
  function removeUploaded(url) {
    if (!isUploaded(url)) return;
    var key = String(url).replace(/^https?:\/\/[^/]+\//, '');
    fetch('/api/files?key=' + encodeURIComponent(key), { method: 'DELETE' }).catch(function () {});
  }

  /* ── 사진 자동 압축 (업로드 전, 브라우저 안에서) ──
     긴 변 기준 1920px(웹 표준 해상도) 넘으면 줄인다. 화질은 92%로 높게 유지 —
     인증서·도면처럼 글자가 들어간 이미지가 뭉개지지 않게 하기 위함.
     PNG는 투명 배경이 있을 수 있어 포맷은 유지하고 크기만 줄인다.
     이미 1920px 이하이거나 GIF · 압축 결과가 원본보다 크면 원본을 그대로 쓴다(안전장치). */
  var COMPRESS_MAX_DIM = 1920;
  var COMPRESS_QUALITY = 0.92;
  function compressImage(file) {
    return new Promise(function (resolve) {
      if (!file || !/^image\//.test(file.type) || file.type === 'image/gif') return resolve(file);
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(w, h));
        if (scale >= 1) return resolve(file);
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        var outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], file.name, { type: outType }));
        }, outType, COMPRESS_QUALITY);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* ── 파일 올리기 ── */
  function uploadMany(fileList, kind, done) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return done([]);
    var results = [];
    toast(files.length > 1 ? '사진 ' + files.length + '장 올리는 중…' : '올리는 중…');

    function next(i) {
      if (i >= files.length) {
        toast(results.length + '개 올렸습니다. 저장하기를 눌러야 홈페이지에 반영됩니다.');
        return done(results);
      }
      compressImage(files[i]).then(function (compressed) {
      var fd = new FormData();
      fd.append('file', compressed);
      fd.append('kind', kind);
      fetch('/api/upload', { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.url) results.push(res.j);
          else toast(res.j.error || '올리기에 실패했습니다', true);
          next(i + 1);
        })
        .catch(function () { toast('올리기에 실패했습니다 (연결 오류)', true); next(i + 1); });
      });
    }
    next(0);
  }

  /* ── 내용 읽기 / 저장 ── */
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    d.history = Array.isArray(d.history) ? d.history : [];
    d.gallery = Array.isArray(d.gallery) ? d.gallery : [];
    d.certs = Array.isArray(d.certs) ? d.certs : [];
    d.patents = Array.isArray(d.patents) ? d.patents : [];
    d.notices = Array.isArray(d.notices) ? d.notices : [];
    d.resources = Array.isArray(d.resources) ? d.resources : [];
    delete d.map;                 /* 오시는길은 관리 대상이 아님 — site-info.js 로 관리 */
    /* 예전에 '2020.12.29' 처럼 적어둔 날짜를 날짜칸이 알아보는 2020-12-29 로 맞춘다 */
    function fixDate(o) {
      var m = /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/.exec(String(o.date || '').trim());
      if (m) o.date = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    }
    d.certs.forEach(fixDate);
    d.patents.forEach(fixDate);
    d.gallery.forEach(fixDate);
    /* 공지사항은 본문 페이지 주소(?id=)에 쓸 고유번호가 필요하다. 없으면 채워 넣는다. */
    var used = {};
    d.notices.forEach(function (n) {
      if (n.id == null || used[n.id]) n.id = Date.now() + Math.floor(Math.random() * 1000);
      used[n.id] = true;
    });
    return d;
  }

  function loadContent() {
    return fetch('/api/content', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (saved) {
        var isEmpty = !saved || !Object.keys(saved).length;
        if (!isEmpty) return normalize(saved);
        /* 아직 한 번도 저장한 적이 없으면 지금 홈페이지에 있는 내용을 그대로 불러온다 */
        return fetch('./content-seed.json')
          .then(function (r) { return r.ok ? r.json() : {}; })
          .catch(function () { return {}; })
          .then(normalize);
      });
  }

  function save() {
    var btn = $('#save-btn');
    btn.disabled = true;
    $('#save-state').className = 'save-state';
    $('#save-state').textContent = '저장 중…';

    fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) {
          setDirty(true);
          toast(res.j.error || '저장에 실패했습니다', true);
          return;
        }
        setDirty(false);
        var s = $('#save-state');
        s.className = 'save-state done';
        s.textContent = '저장되었습니다';
        toast('홈페이지에 반영되었습니다');
        setTimeout(function () { if (!dirty) s.textContent = ''; }, 4000);
      })
      .catch(function () {
        btn.disabled = false; setDirty(true);
        toast('저장에 실패했습니다 (연결 오류)', true);
      });
  }

  /* ── 탭 ── */
  function selectTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.setAttribute('aria-selected', t.getAttribute('data-tab') === name ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
      p.hidden = p.id !== 'panel-' + name;
    });
    try { sessionStorage.setItem('neo-admin-tab', name); } catch (e) {}
  }

  /* ── 시작 ── */
  function startApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;

    loadContent().then(function (d) {
      data = d;
      sortAll();                            /* 불러오자마자 날짜순으로 맞춘다 */
      Object.keys(RENDER).forEach(function (k) { RENDER[k](); });
      setDirty(false);
      $('#save-state').textContent = '';
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { selectTab(t.getAttribute('data-tab')); });
    });
    var last = null;
    try { last = sessionStorage.getItem('neo-admin-tab'); } catch (e) {}
    selectTab(RENDER[last] ? last : 'history');

    $('#save-btn').addEventListener('click', save);
    $('#logout-btn').addEventListener('click', function () {
      if (dirty && !confirm('저장하지 않은 변경사항이 있습니다. 그래도 로그아웃할까요?')) return;
      dirty = false;
      fetch('/admin/logout', { method: 'POST' }).then(function () { location.reload(); });
    });

    $('#add-year').addEventListener('click', function () {
      data.history.unshift({ year: String(new Date().getFullYear()), items: [{ month: '', ko: '', en: '', koSub: '', enSub: '' }] });
      page.history = 1;                    /* 새 연도는 맨 앞 쪽에 생긴다 */
      setDirty(true); renderHistory(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#add-site').addEventListener('click', function () {
      var fresh = { cat: 'parking', ko: '', en: '', useKo: '주차장', useEn: 'Parking Lot', date: today(), photos: [] };
      data.gallery.unshift(fresh);
      setOpen(fresh, true);
      sortAll(); setDirty(true); renderGallery(); revealItem('#gallery-list', data.gallery, fresh, 'gallery', renderGallery);
    });
    $('#add-cert').addEventListener('click', function () {
      var fresh = { code: '', codeEn: '', ko: '', en: '', descKo: '', descEn: '', issuerKo: '', issuerEn: '', no: '', noEn: '', valid: '', date: today(), image: '' };
      data.certs.unshift(fresh);
      setOpen(fresh, true);
      sortAll(); setDirty(true); renderCerts(); revealItem('#certs-list', data.certs, fresh, 'certs', renderCerts);
    });
    $('#add-patent').addEventListener('click', function () {
      var fresh = { kind: 'patent', no: '', ko: '', en: '', date: today(), image: '' };
      data.patents.unshift(fresh);
      setOpen(fresh, true);
      sortAll(); setDirty(true); renderPatents(); revealItem('#patents-list', data.patents, fresh, 'patents', renderPatents);
    });
    $('#add-notice').addEventListener('click', function () {
      var fresh = { id: Date.now(), pinned: false, date: today(), titleKo: '', titleEn: '', bodyKo: '', bodyEn: '', images: [] };
      data.notices.unshift(fresh);
      setOpen(fresh, true);                 /* 새 글은 바로 펼쳐서 입력하게 */
      sortAll(); setDirty(true); renderNotices(); revealItem('#notices-list', data.notices, fresh, 'notices', renderNotices);
    });
    $('#add-resource').addEventListener('click', function () {
      var fresh = { type: 'PDF', date: today(), titleKo: '', titleEn: '', descKo: '', descEn: '', file: '' };
      data.resources.unshift(fresh);
      setOpen(fresh, true);
      sortAll(); setDirty(true); renderResources(); revealItem('#resources-list', data.resources, fresh, 'resources', renderResources);
    });

    /* Ctrl+S 로도 저장 */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
  }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ── 로그인 ── */
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#login-msg');
    msg.hidden = true;
    fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#pw').value })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { startApp(); return; }
        msg.textContent = res.j.error || '로그인에 실패했습니다';
        msg.hidden = false;
        $('#pw').select();
      })
      .catch(function () {
        msg.textContent = '서버에 연결하지 못했습니다';
        msg.hidden = false;
      });
  });

  fetch('/admin/check')
    .then(function (r) { return r.json(); })
    .then(function (j) { if (j && j.ok) startApp(); else $('#pw').focus(); })
    .catch(function () { $('#pw').focus(); });
})();
