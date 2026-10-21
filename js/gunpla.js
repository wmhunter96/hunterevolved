// Gunpla — every kit I've built, rendered from data/gunpla.json.
//
// Each entry in kits[]:
//   name    (required)  e.g. "RX-78-2 Gundam (Revive)"
//   grade   (required)  PG, MGEX, MG, FM, RG, HG, EG, SD, or anything else ("Other")
//   scale               e.g. "1/144"
//   brand               e.g. "Bandai", "Kotobukiya Maruttoys" (defaults to Bandai)
//   series              e.g. "Mobile Suit Gundam"
//   year                year built, e.g. 2024
//   finish              e.g. "Straight build", "Panel lined", "Painted", "Custom paint"
//   photo               path under images/gunpla/ or a full URL
//   link                optional (Gunpla wiki, build log, etc.)
//   notes               one-line blurb
//   room                where it's displayed, e.g. "Living room"
//   shelf               the case/shelf unit, e.g. "Detolf 1"
//   level               the level within that shelf, e.g. "Top", "Shelf 2"
//
// Filters: search, room -> shelf -> level, grade, brand, series. Every tag on
// a card (grade, brand, series, room, shelf, level, finish) is clickable and
// filters to matching kits. Active filters are kept in the URL query string,
// so a filtered view can be linked (e.g. gunpla.html?brand=Kotobukiya+Maruttoys).
(function () {
  var DATA_URL = 'data/gunpla.json';
  // Display order, biggest/most detailed grades first.
  var GRADES = [
    { id: 'PG', label: 'Perfect Grade' },
    { id: 'MGEX', label: 'Master Grade Extreme' },
    { id: 'MG', label: 'Master Grade' },
    { id: 'FM', label: 'Full Mechanics' },
    { id: 'RG', label: 'Real Grade' },
    { id: 'HG', label: 'High Grade' },
    { id: 'EG', label: 'Entry Grade' },
    { id: 'SD', label: 'Super Deformed' },
    { id: 'Other', label: 'Other' }
  ];
  var NONE = '__none__'; // filter value for "not set"
  var FIELDS = [
    { key: 'room', label: 'Room', none: 'Room not set' },
    { key: 'shelf', label: 'Shelf', none: 'Shelf not set' },
    { key: 'level', label: 'Level', none: 'Level not set' },
    { key: 'grade', label: 'Grade' },
    { key: 'brand', label: 'Brand' },
    { key: 'series', label: 'Series', none: 'Series not set' },
    { key: 'finish', label: 'Finish', hidden: true }
  ];

  var statsEl = document.getElementById('gunplaStats');
  var listEl = document.getElementById('gunplaList');
  var filtersEl = document.getElementById('gunplaFilters');
  if (!listEl) return;

  var kits = [];
  var state = { q: '' };

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
    for (var i = 0; i < FIELDS.length; i++) {
      var key = FIELDS[i].key;
      if (key === skipKey || state[key] == null) continue;
      var v = val(kit, key);
      if (state[key] === NONE ? v !== '' : v !== state[key]) return false;
    }
    if (state.q) {
      var hay = [kit.name, kit.grade, kit.scale, val(kit, 'brand'), kit.series, kit.notes, kit.finish,
        kit.room, kit.shelf, kit.level].join(' ').toLowerCase();
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
    state = { q: params.get('q') || '' };
    FIELDS.forEach(function (f) { if (params.has(f.key)) state[f.key] = params.get(f.key); });
  }
  function writeUrl() {
    var params = new URLSearchParams();
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
    state = { q: '' };
    var search = document.getElementById('gunplaSearch');
    if (search) search.value = '';
    update();
  }

  // ---- Rendering ----
  function stat(label, value) {
    return '<div class="stat"><span class="stat-label">' + esc(label) +
      '</span><span class="stat-value">' + esc(value) + '</span></div>';
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
    if (kit.series) tags.push(tag('series', kit.series, kit.series));
    var where = [];
    if (kit.room) where.push(tag('room', kit.room, kit.room, 'gp-tag-loc'));
    if (kit.shelf) where.push(tag('shelf', kit.shelf, kit.shelf, 'gp-tag-loc'));
    if (kit.level) where.push(tag('level', kit.level, kit.level, 'gp-tag-loc'));
    var title = kit.link
      ? '<a href="' + esc(kit.link) + '" target="_blank" rel="noopener">' + esc(kit.name) + '</a>'
      : esc(kit.name);
    return '<div class="card gp-card"' + art + '>' +
      '<h3>' + title + '</h3>' +
      '<div class="gp-tags">' + tags.join('') + '</div>' +
      (kit.notes ? '<p>' + esc(kit.notes) + '</p>' : '') +
      (where.length ? '<div class="gp-tags gp-where">' + where.join('<span class="gp-sep">›</span>') + '</div>' : '') +
      (kit.finish ? '<div class="gp-tags">' + tag('finish', kit.finish, kit.finish, 'gp-tag-finish') + '</div>' : '') +
      (kit.year ? '<p class="gp-year">Built ' + esc(kit.year) + '</p>' : '') +
      '</div>';
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
    var filtered = shown.length !== kits.length;

    var byGrade = {};
    shown.forEach(function (k) { (byGrade[gradeOf(k)] = byGrade[gradeOf(k)] || []).push(k); });
    var stats = stat(filtered ? 'Showing' : 'Kits built', filtered ? shown.length + ' of ' + kits.length : kits.length);
    GRADES.forEach(function (g) { if (byGrade[g.id]) stats += stat(g.id, byGrade[g.id].length); });
    statsEl.innerHTML = stats;

    if (!shown.length) {
      listEl.innerHTML = '<div class="coming-soon">No kits match these filters. ' +
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
    renderFilters();
    render();
  }

  // ---- Events ----
  function onClick(e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-clear-all')) return clearAll();
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
    update();
  }

  readUrl();
  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
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
