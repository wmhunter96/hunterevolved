// Gunpla — every kit I've built, rendered from data/gunpla.json.
//
// Each entry in kits[]:
//   name    (required)  e.g. "RX-78-2 Gundam (Revive)"
//   grade   (required)  PG, MGEX, MG, FM, RE, RG, MGSD, HG, EG, SD, or anything else ("Other")
//   status              "backlog" for kits not built yet (default: built)
//   scale               e.g. "1/144"
//   brand               e.g. "Bandai", "Kotobukiya Maruttoys" (defaults to Bandai)
//   series              the show/franchise, e.g. "Gundam 00", "The Witch from Mercury"
//   source              optional specific title within it, e.g. "Gundam 00P", "Endless Waltz"
//   year                year built, e.g. 2024
//   finish              e.g. "Straight build", "Panel lined", "Painted", "Custom paint"
//   photo               path under images/gunpla/ or a full URL
//   link                optional (Gunpla wiki, build log, etc.)
//   notes               one-line blurb
//   room                where it's displayed, e.g. "Living room"
//   shelf               the case/shelf unit, e.g. "Detolf 1"
//   level               the level within that shelf, e.g. "Top", "Shelf 2"
//   wiki                the suit's Gundam Fandom wiki page title, e.g. "XVX-016 Gundam Aerial".
//                       Its specs (data/gunpla-wiki.json, from scripts/sync-gundam-wiki.mjs)
//                       show in a details dialog when the card is clicked.
//
// Filters: search, room -> shelf -> level, grade, brand, series. Every tag on
// a card (grade, brand, series, source, room, shelf, level, finish) is clickable and
// filters to matching kits. Active filters are kept in the URL query string,
// so a filtered view can be linked (e.g. gunpla.html?brand=Kotobukiya+Maruttoys).
(function () {
  var DATA_URL = 'data/gunpla.json';
  var WIKI_URL = 'data/gunpla-wiki.json';
  // Display order, biggest/most detailed grades first.
  var GRADES = [
    { id: 'PG', label: 'Perfect Grade' },
    { id: 'MGEX', label: 'Master Grade Extreme' },
    { id: 'MG', label: 'Master Grade' },
    { id: 'FM', label: 'Full Mechanics' },
    { id: 'RE', label: 'Reborn-One Hundred' },
    { id: 'RG', label: 'Real Grade' },
    { id: 'MGSD', label: 'Master Grade SD' },
    { id: 'HG', label: 'High Grade' },
    { id: 'EG', label: 'Entry Grade' },
    { id: 'SD', label: 'Super Deformed' },
    { id: 'Other', label: 'Other' }
  ];
  var NONE = '__none__'; // filter value for "not set"
  var FIELDS = [
    { key: 'room', label: 'Room', none: 'Room not set' },
    // Shelf/level are picked on the shelf map rather than with dropdowns.
    { key: 'shelf', label: 'Shelf', none: 'Shelf not set', hidden: true },
    { key: 'level', label: 'Level', none: 'Level not set', hidden: true },
    { key: 'grade', label: 'Grade' },
    { key: 'brand', label: 'Brand' },
    { key: 'series', label: 'Series', none: 'No series' },
    { key: 'source', label: 'Source', hidden: true },
    { key: 'finish', label: 'Finish', hidden: true }
  ];

  var statsEl = document.getElementById('gunplaStats');
  var listEl = document.getElementById('gunplaList');
  var filtersEl = document.getElementById('gunplaFilters');
  var mapEl = document.getElementById('gunplaMap');
  if (!listEl) return;

  var kits = [];
  var wiki = {}; // wiki page title -> specs
  var dialogEl;
  function specsOf(kit) { return kit.wiki ? wiki[kit.wiki] : null; }
  var state = { q: '', status: 'built' };
  function statusOf(kit) { return kit.status === 'backlog' ? 'backlog' : 'built'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function gradeOf(kit) {
    var g = String(kit.grade || '').toUpperCase();
    for (var i = 0; i < GRADES.length - 1; i++) if (GRADES[i].id === g) return GRADES[i].id;
    return 'Other';
  }

  // The value a kit has for a filter field ('' when unset).
  function val(kit, key) {
    if (key === 'grade') return gradeOf(kit);
    if (key === 'brand') return kit.brand || 'Bandai';
    return kit[key] || '';
  }

  function fieldDef(key) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) return FIELDS[i];
  }

  // Levels sort Top first, then Shelf 1, 2, ...; everything else alphabetically.
  function levelRank(v) {
    if (/^top/i.test(v)) return -1;
    if (/^upper/i.test(v)) return 0;
    if (/^lower/i.test(v)) return 100;
    var m = /(\d+)/.exec(v);
    return m ? +m[1] : 999;
  }
  function sortValues(key, values) {
    if (key === 'grade') {
      return GRADES.map(function (g) { return g.id; }).filter(function (id) { return values.indexOf(id) !== -1; });
    }
    return values.sort(function (a, b) {
      if (key === 'level') return levelRank(a) - levelRank(b) || a.localeCompare(b);
      return a.localeCompare(b);
    });
  }

  function matches(kit, skipKey) {
    if (statusOf(kit) !== state.status) return false;
    for (var i = 0; i < FIELDS.length; i++) {
      var key = FIELDS[i].key;
      if (key === skipKey || state[key] == null) continue;
      var v = val(kit, key);
      if (state[key] === NONE ? v !== '' : v !== state[key]) return false;
    }
    if (state.q) {
      var hay = [kit.name, kit.grade, kit.scale, val(kit, 'brand'), kit.series, kit.source, kit.notes, kit.finish,
        kit.room, kit.shelf, kit.level, kit.wiki].join(' ').toLowerCase();
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) === -1) return false;
    }
    return true;
  }

  // Options for a dropdown: values present among kits matching every *other*
  // filter, so room -> shelf -> level narrow each other (and so do the rest).
  function optionsFor(key) {
    var counts = {}, none = 0;
    kits.forEach(function (k) {
      if (!matches(k, key)) return;
      var v = val(k, key);
      if (v === '') none++; else counts[v] = (counts[v] || 0) + 1;
    });
    var opts = sortValues(key, Object.keys(counts)).map(function (v) { return { value: v, label: v, n: counts[v] }; });
    var def = fieldDef(key);
    if (none && def.none) opts.push({ value: NONE, label: def.none, n: none });
    return opts;
  }

  // ---- URL state ----
  function readUrl() {
    var params = new URLSearchParams(location.search);
    state = { q: params.get('q') || '', status: params.get('status') === 'backlog' ? 'backlog' : 'built' };
    FIELDS.forEach(function (f) { if (params.has(f.key)) state[f.key] = params.get(f.key); });
  }
  function writeUrl() {
    var params = new URLSearchParams();
    if (state.status === 'backlog') params.set('status', 'backlog');
    if (state.q) params.set('q', state.q);
    FIELDS.forEach(function (f) { if (state[f.key] != null) params.set(f.key, state[f.key]); });
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function setFilter(key, value) {
    if (value == null || value === '') delete state[key]; else state[key] = value;
    // Picking a room/shelf can make a deeper level filter impossible; drop it.
    if (key === 'room' || key === 'shelf') {
      ['shelf', 'level'].forEach(function (k) {
        if (k === key || state[k] == null) return;
        var ok = optionsFor(k).some(function (o) { return o.value === state[k]; });
        if (!ok) delete state[k];
      });
    }
    update();
  }

  function clearAll() {
    state = { q: '', status: state.status };
    var search = document.getElementById('gunplaSearch');
    if (search) search.value = '';
    update();
  }

  // ---- Rendering ----
  // Stat tiles are buttons: a grade tile filters to that grade (click again
  // to clear it); the total tile clears every filter.
  function stat(label, value, attrs, active, title) {
    return '<button type="button" class="stat gp-stat' + (active ? ' active' : '') + '" ' + attrs +
      ' aria-pressed="' + !!active + '" title="' + esc(title) + '"><span class="stat-label">' + esc(label) +
      '</span><span class="stat-value">' + esc(value) + '</span></button>';
  }

  function tag(key, value, text, cls) {
    var active = state[key] === value ? ' active' : '';
    return '<button type="button" class="gp-tag' + (cls ? ' ' + cls : '') + active + '" data-key="' + key +
      '" data-value="' + esc(value) + '" title="Show all with ' + esc(fieldDef(key).label.toLowerCase() + ': ' + text) + '">' +
      esc(text) + '</button>';
  }

  function card(kit) {
    var art = kit.photo ? ' style="--card-art: url(\'' + esc(kit.photo) + '\')"' : '';
    var tags = [tag('grade', gradeOf(kit), kit.grade && kit.scale ? kit.grade + ' ' + kit.scale : (kit.grade || kit.scale))];
    tags.push(tag('brand', val(kit, 'brand'), val(kit, 'brand'), 'gp-tag-brand'));
    if (kit.series) tags.push(tag('series', kit.series, kit.series, 'gp-tag-series'));
    if (kit.source) tags.push(tag('source', kit.source, kit.source, 'gp-tag-source'));
    var where = [];
    if (kit.room) where.push(tag('room', kit.room, kit.room, 'gp-tag-loc'));
    if (kit.shelf) where.push(tag('shelf', kit.shelf, kit.shelf, 'gp-tag-loc'));
    if (kit.level) where.push(tag('level', kit.level, kit.level, 'gp-tag-loc'));
    var title = kit.link
      ? '<a href="' + esc(kit.link) + '" target="_blank" rel="noopener">' + esc(kit.name) + '</a>'
      : esc(kit.name);
    var specs = specsOf(kit), i = kits.indexOf(kit);
    return '<div class="card gp-card' + (specs ? ' gp-has-specs' : '') + '" id="kit-' + i + '"' +
      (specs ? ' data-specs="' + i + '"' : '') + art + '>' +
      (specs && specs.model ? '<span class="label gp-model">' + esc(specs.model) + '</span>' : '') +
      '<h3>' + title + '</h3>' +
      '<div class="gp-tags">' + tags.join('') + '</div>' +
      (kit.notes ? '<p>' + esc(kit.notes) + '</p>' : '') +
      (where.length ? '<div class="gp-tags gp-where">' + where.join('<span class="gp-sep">›</span>') + '</div>' : '') +
      (kit.finish ? '<div class="gp-tags">' + tag('finish', kit.finish, kit.finish, 'gp-tag-finish') + '</div>' : '') +
      (kit.year ? '<p class="gp-year">Built ' + esc(kit.year) + '</p>' : '') +
      (specs ? '<button type="button" class="btn btn-tertiary btn-sm gp-specs-btn" data-specs="' + i + '">Specs</button>' : '') +
      '</div>';
  }

  // ---- Specs dialog ----
  // The suit's Gundam wiki data, grouped like the wiki's infobox.
  var SPEC_GROUPS = [
    { title: 'Profile', rows: [['model', 'Model number'], ['era', 'Era'], ['production', 'Production'],
      ['manufacturer', 'Manufacturer'], ['operator', 'Operator'], ['pilot', 'Pilots'], ['designer', 'Mechanical designer']] },
    { title: 'Specifications', rows: [['height', 'Height'], ['weight', 'Weight'], ['powerplant', 'Power source'], ['armor', 'Armor']] },
    { title: 'Equipment', list: true, rows: [['equipment', 'Standard equipment']] },
    { title: 'Armaments', list: true, rows: [['fixedArmaments', 'Fixed'], ['handheldArmaments', 'Handheld']] }
  ];

  function specsHtml(kit, specs) {
    var groups = SPEC_GROUPS.map(function (g) {
      var rows = g.rows.filter(function (r) { var v = specs[r[0]]; return v && (!Array.isArray(v) || v.length); });
      if (!rows.length) return '';
      return '<section class="gp-spec-group"><h3 class="label">' + esc(g.title) + '</h3><dl>' + rows.map(function (r) {
        var v = specs[r[0]];
        var dd = Array.isArray(v) && g.list
          ? '<ul>' + v.map(function (x) {
            return /^↳ /.test(x) ? '<li class="gp-spec-sub">' + esc(x.slice(2)) + '</li>' : '<li>' + esc(x) + '</li>';
          }).join('') + '</ul>'
          : esc(Array.isArray(v) ? v.join(', ') : v);
        return '<div><dt>' + esc(r[1]) + '</dt><dd>' + dd + '</dd></div>';
      }).join('') + '</dl></section>';
    }).join('');
    return '<div class="gp-spec-head">' +
        (specs.image ? '<img class="gp-spec-img" src="' + esc(specs.image) + '" alt="' + esc(kit.wiki) + '" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
        '<div><p class="label">' + esc([kit.grade, kit.scale].filter(Boolean).join(' ')) + '</p>' +
        '<h2 id="gunplaDialogTitle">' + esc(kit.name) + '</h2>' +
        '<p class="gp-spec-suit">' + esc(kit.wiki) + '</p></div>' +
        '<button type="button" class="btn btn-tertiary btn-sm gp-spec-close" data-close aria-label="Close">&times;</button>' +
      '</div>' + groups +
      '<p class="gp-spec-src"><a href="' + esc(specs.url) + '" target="_blank" rel="noopener">View on the Gundam Wiki</a>' +
      ' · text CC BY-SA, Gundam Fandom contributors</p>';
  }

  function openSpecs(i) {
    var kit = kits[i], specs = kit && specsOf(kit);
    if (!specs) return;
    if (!dialogEl) {
      dialogEl = document.createElement('dialog');
      dialogEl.className = 'gp-dialog';
      dialogEl.setAttribute('aria-labelledby', 'gunplaDialogTitle');
      document.body.appendChild(dialogEl);
      dialogEl.addEventListener('click', function (e) {
        // Clicks on the backdrop land on the dialog element itself.
        if (e.target === dialogEl || e.target.closest('[data-close]')) dialogEl.close();
      });
    }
    dialogEl.innerHTML = '<div class="gp-dialog-body">' + specsHtml(kit, specs) + '</div>';
    if (dialogEl.showModal) dialogEl.showModal(); else dialogEl.setAttribute('open', '');
    dialogEl.scrollTop = 0;
  }

  // ---- Shelf map ----
  // Drawn like the Warehouse toolbox: each display spot is a physical unit and
  // each level a "drawer" row (number, kit chips, count). Detolfs get an
  // aluminium header with Top sitting on the roof and Shelf 1..4 inside; other
  // spots (windowsill, top display, closet) get a wood header.
  //   click a row / unit name / room -> filter to it (again to clear)
  //   click a kit chip               -> jump to its card
  var ROOM_ORDER = ['Office', 'Living room'];
  var GRADE_COLOR = { PG: 'mgex', MGEX: 'mgex', MG: 'mg', FM: 'fm', RE: 'fm', RG: 'rg', HG: 'hg', EG: 'hg', MGSD: 'sd', SD: 'sd', Other: 'other' };
  function rankIn(list, v) { var i = list.indexOf(v); return i === -1 ? list.length : i; }
  function isDetolf(shelf) { return /^detolf/i.test(shelf || ''); }
  // Filters other than location: when any is on, matching kits are highlighted.
  function otherFilters() {
    return !!state.q || FIELDS.some(function (f) { return ['room', 'shelf', 'level'].indexOf(f.key) === -1 && state[f.key] != null; });
  }
  function shortName(n) { return /^Gundam \S/.test(n) && n.split(' ').length > 2 ? n.slice(7) : n; }

  function chip(kit, hits) {
    var g = gradeOf(kit), lit = matches(kit);
    var cls = 'gp-kit' + (hits && lit ? ' hit' : '') + (lit ? '' : ' off');
    return '<button type="button" class="' + cls + '" data-kit="' + kits.indexOf(kit) + '" title="' +
      esc((kit.grade || '') + ' ' + kit.name + (kit.notes ? ' — ' + kit.notes : '')) + '">' +
      '<b class="gp-g gp-c-' + (GRADE_COLOR[g] || 'other') + '">' + esc(g === 'Other' ? (kit.scale || '3P') : g) + '</b>' +
      esc(shortName(kit.name)) + '</button>';
  }

  function row(room, shelf, level, num, list, cls) {
    var hits = otherFilters(), lit = list.filter(function (k) { return matches(k); }).length;
    var sel = state.shelf === shelf && (state.level || '') === level && level !== '' ||
      (level === '' && state.shelf === shelf && state.level == null && cls === 'single');
    var dim = list.length && !lit || (!list.length && (hits || state.shelf != null));
    var attrs = ' data-loc-room="' + esc(room) + '" data-loc-shelf="' + esc(shelf) + '"' +
      (level !== '' ? ' data-loc-level="' + esc(level) + '"' : '');
    var label = level || shelf;
    return '<div class="gp-row' + (cls ? ' gp-row-' + cls : '') + (sel ? ' selected' : '') + (dim ? ' dim' : '') +
      (hits && lit ? ' match' : '') + '" role="button" tabindex="0"' + attrs +
      ' aria-label="' + esc(shelf + (level ? ' ' + level : '') + ': ' + list.length + ' kits') + '">' +
      (num != null ? '<span class="gp-row-num">' + esc(num) + '</span>' : '') +
      '<div class="gp-row-body">' +
        (num != null && cls !== 'roof' ? '' : '<span class="gp-row-name">' + esc(label) + '</span>') +
        '<div class="gp-kits">' + (list.length ? list.map(function (k) { return chip(k, hits); }).join('')
          : '<span class="gp-empty">Empty</span>') + '</div>' +
      '</div>' +
      '<span class="gp-row-count">' + (lit === list.length ? list.length : lit + '/' + list.length) + '</span>' +
      (cls === 'roof' || cls === 'single' ? '' : '<span class="gp-glass"></span>') +
      '</div>';
  }

  function unitHtml(room, shelf, byLevel) {
    var levels = Object.keys(byLevel);
    var n = levels.reduce(function (a, l) { return a + byLevel[l].length; }, 0);
    var sel = state.shelf === shelf && state.level == null;
    var head = function (cls) {
      return '<button type="button" class="gp-lid ' + cls + (sel ? ' selected' : '') + '" data-loc-room="' + esc(room) +
        '" data-loc-shelf="' + esc(shelf) + '"><span>' + esc(shelf || 'Unplaced') + '</span><span>' + n + '</span></button>';
    };
    if (isDetolf(shelf)) {
      var max = 4, inside = '';
      levels.forEach(function (l) { var m = /^shelf\s*(\d+)/i.exec(l); if (m) max = Math.max(max, +m[1]); });
      var top = levels.filter(function (l) { return /^top/i.test(l); })[0] || 'Top';
      for (var i = 1; i <= max; i++) {
        var name = levels.filter(function (l) { return new RegExp('^shelf\\s*' + i + '\\b', 'i').test(l); })[0] || 'Shelf ' + i;
        inside += row(room, shelf, name, String(i), byLevel[name] || []);
      }
      if (byLevel['']) inside += row(room, shelf, '', '?', byLevel['']);
      return '<div class="gp-unit gp-detolf">' +
        '<div class="gp-roof">' + row(room, shelf, top, null, byLevel[top] || [], 'roof') + '</div>' +
        '<div class="gp-case">' + head('gp-lid-alu') + '<div class="gp-case-rows">' + inside + '</div></div></div>';
    }
    var rows = '';
    var sorted = levels.sort(function (a, b) { return levelRank(a) - levelRank(b) || a.localeCompare(b); });
    if (sorted.length === 1 && sorted[0] === '') rows = row(room, shelf, '', null, byLevel[''], 'single');
    else sorted.forEach(function (l) { rows += row(room, shelf, l, l ? l.charAt(0).toUpperCase() : '?', byLevel[l]); });
    return '<div class="gp-unit gp-ledge"><div class="gp-case gp-case-wood">' + head('gp-lid-wood') +
      '<div class="gp-case-rows">' + rows + '</div></div></div>';
  }

  function renderMap() {
    if (!mapEl) return;
    var tree = {};
    kits.forEach(function (k) {
      if (statusOf(k) !== state.status) return;
      var r = k.room || '', sh = k.shelf || '', lv = k.level || '';
      ((tree[r] = tree[r] || {})[sh] = tree[r][sh] || {})[lv] = (tree[r][sh][lv] || []).concat(k);
    });
    var rooms = Object.keys(tree).sort(function (a, b) {
      return (a === '') - (b === '') || rankIn(ROOM_ORDER, a) - rankIn(ROOM_ORDER, b) || a.localeCompare(b);
    });
    mapEl.innerHTML = '<p class="wh-toolbox-caption">' + (state.status === 'backlog'
        ? 'Where the unbuilt boxes are stored. Click a spot to filter to it; click a kit to jump to it.'
        : 'Where every kit is displayed: the two Detolfs (Top is the roof of the case), the windowsill and the living room. Click a shelf to filter to it, click it again to clear; click a kit to jump to it.') + '</p>' +
      rooms.map(function (r) {
        var shelves = Object.keys(tree[r]).sort(function (a, b) {
          return (a === '') - (b === '') || isDetolf(b) - isDetolf(a) || a.localeCompare(b, undefined, { numeric: true });
        });
        var roomSel = state.room === r && state.shelf == null;
        return '<section class="gp-room"><button type="button" class="gp-room-name' + (roomSel ? ' selected' : '') +
          '" data-loc-room="' + esc(r) + '">' + esc(r || 'No room') + '</button>' +
          '<div class="gp-units">' + shelves.map(function (sh) { return unitHtml(r, sh, tree[r][sh]); }).join('') + '</div></section>';
      }).join('');
  }

  function pickLocation(el) {
    var room = el.getAttribute('data-loc-room'), shelf = el.getAttribute('data-loc-shelf'),
      level = el.getAttribute('data-loc-level');
    var next = { room: room || null, shelf: shelf, level: level };
    if (shelf == null) { next.shelf = null; next.level = null; }
    else if (level == null) next.level = null;
    // Clicking the current selection again clears it.
    var same = (state.room || null) === next.room && (state.shelf || null) === (next.shelf || null) &&
      (state.level || null) === (next.level || null);
    ['room', 'shelf', 'level'].forEach(function (k) {
      if (same || next[k] == null || next[k] === '') delete state[k]; else state[k] = next[k];
    });
    if (!same && room === '') state.room = NONE;
    if (!same && shelf === '') state.shelf = NONE;
    update();
  }

  function jumpToKit(i) {
    var cardEl = document.getElementById('kit-' + i);
    if (!cardEl) { // filtered out: clear filters so it shows, then jump
      clearAll();
      cardEl = document.getElementById('kit-' + i);
    }
    if (!cardEl) return;
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cardEl.classList.remove('gp-flash');
    void cardEl.offsetWidth;
    cardEl.classList.add('gp-flash');
  }

  function renderTabs() {
    var tabs = document.getElementById('gunplaTabs');
    if (!tabs) return;
    var n = { built: 0, backlog: 0 };
    kits.forEach(function (k) { n[statusOf(k)]++; });
    tabs.innerHTML = [['built', 'Built'], ['backlog', 'Backlog']].map(function (t) {
      return '<button type="button" class="wh-tab" role="tab" data-status="' + t[0] + '" aria-selected="' +
        (state.status === t[0]) + '">' + t[1] + ' <span class="gp-count">' + n[t[0]] + '</span></button>';
    }).join('');
  }

  function renderFilters() {
    if (!filtersEl) return;
    var selects = FIELDS.filter(function (f) { return !f.hidden; }).map(function (f) {
      var opts = optionsFor(f.key);
      var html = '<option value="">' + esc(f.label) + ': all</option>' + opts.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (state[f.key] === o.value ? ' selected' : '') + '>' +
          esc(o.label) + ' (' + o.n + ')</option>';
      }).join('');
      // Keep a selected value visible even if nothing else matches it.
      if (state[f.key] != null && !opts.some(function (o) { return o.value === state[f.key]; })) {
        var lbl = state[f.key] === NONE ? f.none : state[f.key];
        html += '<option value="' + esc(state[f.key]) + '" selected>' + esc(lbl) + ' (0)</option>';
      }
      return '<label class="gp-field"><span class="sr-only">' + esc(f.label) + '</span>' +
        '<select class="wh-input' + (state[f.key] != null ? ' active' : '') + '" data-key="' + f.key + '">' + html + '</select></label>';
    }).join('');
    var row = filtersEl.querySelector('.gp-selects');
    row.innerHTML = selects;

    var active = FIELDS.filter(function (f) { return state[f.key] != null; }).map(function (f) {
      var v = state[f.key], lbl = v === NONE ? f.none : v;
      return '<button type="button" class="gp-chip" data-clear="' + f.key + '">' + esc(f.label) + ': ' + esc(lbl) +
        ' <span aria-hidden="true">&times;</span><span class="sr-only">Remove filter</span></button>';
    });
    if (state.q) active.unshift('<button type="button" class="gp-chip" data-clear="q">Search: ' + esc(state.q) +
      ' <span aria-hidden="true">&times;</span></button>');
    var chips = filtersEl.querySelector('.gp-active');
    chips.innerHTML = active.length ? active.join('') + '<button type="button" class="gp-clear" data-clear-all>Clear all</button>' : '';
  }

  function render() {
    var shown = kits.filter(function (k) { return matches(k); });
    var total = kits.filter(function (k) { return statusOf(k) === state.status; }).length;
    var filtered = shown.length !== total;
    var backlog = state.status === 'backlog';

    var byGrade = {};
    shown.forEach(function (k) { (byGrade[gradeOf(k)] = byGrade[gradeOf(k)] || []).push(k); });
    var stats = stat(filtered ? 'Showing' : (backlog ? 'In backlog' : 'Kits built'), filtered ? shown.length + ' of ' + total : total,
      'data-clear-all', false, filtered ? 'Clear all filters' : 'Showing everything');
    // Grade tiles count kits matching every filter except grade, so the other
    // grades stay visible (and clickable) while one is selected.
    var gradeCounts = {};
    kits.forEach(function (k) { if (matches(k, 'grade')) gradeCounts[gradeOf(k)] = (gradeCounts[gradeOf(k)] || 0) + 1; });
    GRADES.forEach(function (g) {
      if (!gradeCounts[g.id]) return;
      stats += stat(g.id, gradeCounts[g.id], 'data-stat-grade="' + g.id + '"', state.grade === g.id,
        (state.grade === g.id ? 'Show all grades' : 'Show only ' + g.label));
    });
    statsEl.innerHTML = stats;

    if (!shown.length) {
      listEl.innerHTML = !total ? '<div class="coming-soon">' + (backlog ? 'Backlog is empty.' : 'Build list coming soon.') + '</div>' :
        '<div class="coming-soon">No kits match these filters. ' +
        '<button type="button" class="gp-clear" data-clear-all>Clear all</button></div>';
      return;
    }

    listEl.innerHTML = GRADES.filter(function (g) { return byGrade[g.id]; }).map(function (g) {
      var group = byGrade[g.id].slice().sort(function (a, b) {
        return (b.year || 0) - (a.year || 0) || String(a.name).localeCompare(String(b.name));
      });
      return '<section><h2>' + esc(g.label) + (g.id !== 'Other' ? ' (' + g.id + ')' : '') +
        ' <span class="gp-count">' + group.length + '</span></h2>' +
        '<div class="card-grid">' + group.map(card).join('') + '</div></section>';
    }).join('');
  }

  function update() {
    writeUrl();
    renderTabs();
    renderFilters();
    renderMap();
    render();
  }

  // ---- Events ----
  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) {
      // A click on the card itself (not a tag or link) opens its specs.
      var c = e.target.closest('.gp-card[data-specs]');
      if (c && !e.target.closest('a')) openSpecs(+c.getAttribute('data-specs'));
      return;
    }
    if (t.hasAttribute('data-specs')) return openSpecs(+t.getAttribute('data-specs'));
    if (t.hasAttribute('data-status')) {
      // Switching tabs keeps the search but drops filters that may not apply.
      state = { q: state.q, status: t.getAttribute('data-status') };
      return update();
    }
    if (t.hasAttribute('data-clear-all')) return clearAll();
    if (t.hasAttribute('data-kit')) return jumpToKit(+t.getAttribute('data-kit'));
    if (t.hasAttribute('data-loc-room')) return pickLocation(t);
    if (t.hasAttribute('data-stat-grade')) {
      var gid = t.getAttribute('data-stat-grade');
      return setFilter('grade', state.grade === gid ? null : gid);
    }
    if (t.hasAttribute('data-clear')) {
      var key = t.getAttribute('data-clear');
      if (key === 'q') {
        state.q = '';
        var s = document.getElementById('gunplaSearch');
        if (s) s.value = '';
        return update();
      }
      return setFilter(key, null);
    }
    if (t.classList.contains('gp-tag')) {
      var k = t.getAttribute('data-key'), v = t.getAttribute('data-value');
      setFilter(k, state[k] === v ? null : v); // clicking an active tag toggles it off
      if (filtersEl) filtersEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function init() {
    if (filtersEl) {
      filtersEl.innerHTML =
        '<div class="wh-toolbar gp-toolbar">' +
          '<input type="search" id="gunplaSearch" class="wh-input wh-search" placeholder="Search kits…" aria-label="Search kits">' +
        '</div>' +
        '<div class="gp-selects"></div>' +
        '<div class="gp-active"></div>';
      var search = document.getElementById('gunplaSearch');
      search.value = state.q;
      search.addEventListener('input', function () { state.q = search.value.trim(); update(); });
      filtersEl.addEventListener('change', function (e) {
        var sel = e.target.closest('select[data-key]');
        if (sel) setFilter(sel.getAttribute('data-key'), sel.value || null);
      });
      filtersEl.addEventListener('click', onClick);
    }
    listEl.addEventListener('click', onClick);
    statsEl.addEventListener('click', onClick);
    if (mapEl) {
      mapEl.addEventListener('click', function (e) {
        if (e.target.closest('button')) return onClick(e);
        var r = e.target.closest('.gp-row');
        if (r) pickLocation(r);
      });
      mapEl.addEventListener('keydown', function (e) {
        var r = e.target.closest('.gp-row');
        if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickLocation(r); }
      });
    }
    var tabs = document.getElementById('gunplaTabs');
    if (tabs) tabs.addEventListener('click', onClick);
    update();
  }

  readUrl();
  // Wiki specs are optional: without them the cards just have no Specs button.
  var wikiLoad = fetch(WIKI_URL, { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (data) { wiki = data.pages || {}; })
    .catch(function () {});
  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { return wikiLoad.then(function () { return data; }); })
    .then(function (data) {
      kits = Array.isArray(data.kits) ? data.kits : [];
      if (!kits.length) {
        statsEl.innerHTML = '';
        listEl.innerHTML = '<div class="coming-soon">Build list coming soon.</div>';
        return;
      }
      init();
    })
    .catch(function () {
      listEl.innerHTML = '<div class="coming-soon">Couldn\'t load the build list.</div>';
    });
})();
