// Warehouse — parts and tooling inventory.
//
// The published inventory is data/warehouse.json. GitHub Pages has no
// backend, so "Manage" edits a draft copy kept in this browser's
// localStorage; "Download JSON" exports it to commit over
// data/warehouse.json, which is what everyone else sees.
(function () {
  var DATA_URL = 'data/warehouse.json';
  var DRAFT_KEY = 'warehouse-draft';

  var published = [];
  var items = [];
  var hasDraft = false;
  var managing = false;
  var editingId = null;
  var sortKey = 'name';
  var sortDir = 1;
  var view = location.hash === '#tooling' ? 'tool' : 'part';

  var VIEWS = {
    part: { noun: 'part', plural: 'Parts', lowLabel: 'Low stock only',
      place: 'Location', places: 'locations', placeSub: 'bins, drawers, shelves', placeHint: 'e.g. Bin A3' },
    // Every tool lives in a toolbox drawer, so tooling's "location" reads as Drawer.
    tool: { noun: 'tool', plural: 'Tools', lowLabel: 'Needs attention only',
      place: 'Drawer', places: 'drawers', placeSub: 'in the toolbox', placeHint: 'e.g. Drawer 3' }
  };

  function $(id) { return document.getElementById(id); }
  var els = {
    stats: $('whStats'), search: $('whSearch'), category: $('whCategory'),
    location: $('whLocation'), low: $('whLow'), manageToggle: $('whManageToggle'),
    banner: $('whDraftBanner'), exportBtn: $('whExport'), discard: $('whDiscard'),
    form: $('whForm'), formTitle: $('whFormTitle'), submit: $('whSubmit'),
    cancelEdit: $('whCancelEdit'), importBtn: $('whImport'), importFile: $('whImportFile'),
    categoryList: $('whCategoryList'), locationList: $('whLocationList'),
    body: $('whBody'), empty: $('whEmpty'), lowLabel: $('whLowLabel')
  };

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(items)); } catch (e) {}
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  function normalize(list) {
    return (Array.isArray(list) ? list : []).filter(function (it) {
      return it && typeof it.name === 'string' && it.name.trim();
    }).map(function (it) {
      var minQty = it.minQty === '' || it.minQty == null ? null : Number(it.minQty);
      return {
        id: String(it.id || newId()),
        kind: it.kind === 'tool' ? 'tool' : 'part',
        name: String(it.name).trim(),
        category: String(it.category || '').trim(),
        location: String(it.location || '').trim(),
        qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
        minQty: isNaN(minQty) || it.kind === 'tool' ? null : minQty,
        status: it.kind === 'tool' ? String(it.status || '').trim() : '',
        link: String(it.link || '').trim(),
        notes: String(it.notes || '').trim()
      };
    });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isLow(it) { return it.minQty != null && it.qty <= it.minQty; }
  // "Needs attention" filter: low stock for parts, any non-default status for tools.
  function needsAttention(it) { return it.kind === 'tool' ? !!it.status : isLow(it); }

  function inView() { return items.filter(function (it) { return it.kind === view; }); }

  function uniq(key) {
    var seen = {};
    inView().forEach(function (it) { if (it[key]) seen[it[key]] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function fillSelect(select, values, allLabel) {
    var current = select.value;
    select.innerHTML = '';
    select.appendChild(new Option(allLabel, ''));
    values.forEach(function (v) { select.appendChild(new Option(v, v)); });
    select.value = values.indexOf(current) !== -1 ? current : '';
  }

  function fillDatalist(list, values) {
    list.innerHTML = '';
    values.forEach(function (v) { list.appendChild(new Option(v)); });
  }

  function stat(label, value, sub) {
    return '<div class="stat"><span class="stat-label">' + label + '</span>' +
      '<span class="stat-value">' + value + '</span>' +
      (sub ? '<span class="stat-sub">' + sub + '</span>' : '') + '</div>';
  }

  function renderStats() {
    var list = inView();
    var units = list.reduce(function (n, it) { return n + it.qty; }, 0);
    var v = VIEWS[view];
    var locations = stat(v.place + 's', uniq('location').length, v.placeSub);
    if (view === 'tool') {
      var out = list.filter(function (it) { return it.status === 'Loaned out'; }).length;
      var broken = list.filter(function (it) { return it.status === 'Needs repair' || it.status === 'Missing'; }).length;
      els.stats.innerHTML =
        stat('Tools', list.length, 'catalogued') +
        locations +
        stat('Loaned out', out, out ? 'not in the shop' : 'all home') +
        stat('Needs repair', broken, broken ? 'broken or missing' : 'all good');
      return;
    }
    var low = list.filter(isLow).length;
    els.stats.innerHTML =
      stat('Parts', list.length, 'distinct items') +
      stat('Units', units.toLocaleString(), 'total on hand') +
      locations +
      stat('Low stock', low, low ? 'at or below threshold' : 'all good');
  }

  function text(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function filtered() {
    var q = els.search.value.trim().toLowerCase();
    var cat = els.category.value;
    var loc = els.location.value;
    var lowOnly = els.low.checked;
    return inView().filter(function (it) {
      if (cat && it.category !== cat) return false;
      if (loc && it.location !== loc) return false;
      if (lowOnly && !needsAttention(it)) return false;
      if (!q) return true;
      return [it.name, it.category, it.location, it.status, it.notes].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (sortKey === 'qty') return (x - y) * sortDir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * sortDir;
    });
  }

  function renderTable() {
    var rows = filtered();
    els.body.innerHTML = rows.map(function (it) {
      var name = it.link
        ? '<a href="' + text(it.link) + '" target="_blank" rel="noopener">' + text(it.name) + '</a>'
        : text(it.name);
      var qty = it.qty + (isLow(it) ? ' <span class="wh-low" title="Low at ' + it.minQty + '">low</span>' : '');
      var manage = managing
        ? '<td class="wh-row-actions">' +
            '<button type="button" class="wh-icon" data-act="dec" data-id="' + it.id + '" aria-label="One fewer">&minus;</button>' +
            '<button type="button" class="wh-icon" data-act="inc" data-id="' + it.id + '" aria-label="One more">+</button>' +
            '<button type="button" class="wh-link" data-act="edit" data-id="' + it.id + '">Edit</button>' +
            '<button type="button" class="wh-link" data-act="del" data-id="' + it.id + '">Delete</button>' +
          '</td>'
        : '';
      return '<tr' + (editingId === it.id ? ' class="wh-editing"' : '') + '>' +
        '<td class="wh-name">' + name + '</td>' +
        '<td>' + text(it.category || '—') + '</td>' +
        '<td>' + text(it.location || '—') + '</td>' +
        '<td class="wh-num">' + qty + '</td>' +
        (view === 'tool'
          ? '<td>' + (it.status ? '<span class="wh-low">' + text(it.status) + '</span>' : 'In place') + '</td>'
          : '') +
        '<td>' + text(it.notes) + '</td>' +
        manage + '</tr>';
    }).join('');

    var v = VIEWS[view];
    if (!inView().length) {
      els.empty.textContent = managing
        ? 'Nothing here yet. Add your first ' + v.noun + ' above.'
        : 'No ' + v.plural.toLowerCase() + ' catalogued yet.';
    } else if (!rows.length) {
      els.empty.textContent = 'No ' + v.plural.toLowerCase() + ' match those filters.';
    }
    els.empty.hidden = rows.length > 0;

    document.querySelectorAll('.wh-sort').forEach(function (b) {
      var active = b.getAttribute('data-key') === sortKey;
      b.classList.toggle('active', active);
      b.setAttribute('data-dir', active ? (sortDir > 0 ? 'asc' : 'desc') : '');
    });
  }

  function renderView() {
    var v = VIEWS[view];
    document.querySelectorAll('.wh-tab').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.getAttribute('data-view') === view));
    });
    document.querySelector('.wh-status-col').hidden = view !== 'tool';
    document.querySelectorAll('.wh-form [data-for]').forEach(function (el) {
      el.hidden = el.getAttribute('data-for') !== view;
    });
    els.lowLabel.textContent = v.lowLabel;
    document.getElementById('whLocHead').textContent = v.place;
    document.getElementById('whLocField').textContent = v.place;
    els.form.elements.location.placeholder = v.placeHint;
    els.location.setAttribute('aria-label', 'Filter by ' + v.place.toLowerCase());
    if (sortKey === 'status' && view !== 'tool') sortKey = 'name';
    if (!editingId) {
      els.formTitle.textContent = 'Add a ' + v.noun;
      els.submit.textContent = 'Add ' + v.noun;
    }
  }

  function render() {
    renderView();
    fillSelect(els.category, uniq('category'), 'All categories');
    fillSelect(els.location, uniq('location'), 'All ' + VIEWS[view].places);
    fillDatalist(els.categoryList, uniq('category'));
    fillDatalist(els.locationList, uniq('location'));
    renderStats();
    renderTable();
    els.banner.hidden = !hasDraft;
  }

  function commit() {
    hasDraft = true;
    writeDraft();
    render();
  }

  function setManaging(on) {
    managing = on;
    els.form.hidden = !on;
    els.manageToggle.setAttribute('aria-pressed', String(on));
    els.manageToggle.textContent = on ? 'Done' : 'Manage';
    document.querySelector('.wh-manage-col').hidden = !on;
    if (!on) resetForm();
    renderTable();
  }

  function resetForm() {
    editingId = null;
    els.form.reset();
    els.formTitle.textContent = 'Add a ' + VIEWS[view].noun;
    els.submit.textContent = 'Add ' + VIEWS[view].noun;
    els.cancelEdit.hidden = true;
  }

  function startEdit(it) {
    editingId = it.id;
    var f = els.form.elements;
    f.name.value = it.name;
    f.category.value = it.category;
    f.location.value = it.location;
    f.qty.value = it.qty;
    f.minQty.value = it.minQty == null ? '' : it.minQty;
    f.link.value = it.link;
    f.notes.value = it.notes;
    f.status.value = it.status;
    els.formTitle.textContent = 'Edit ' + VIEWS[view].noun;
    els.submit.textContent = 'Save changes';
    els.cancelEdit.hidden = false;
    els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.name.focus({ preventScroll: true });
    renderTable();
  }

  function find(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = els.form.elements;
    var entry = normalize([{
      id: editingId || newId(), kind: view, status: f.status.value,
      name: f.name.value, category: f.category.value, location: f.location.value,
      qty: f.qty.value, minQty: f.minQty.value, link: f.link.value, notes: f.notes.value
    }])[0];
    if (!entry) return;
    if (editingId) {
      items = items.map(function (it) { return it.id === editingId ? entry : it; });
    } else {
      items.push(entry);
    }
    resetForm();
    commit();
    f.name.focus();
  });

  els.cancelEdit.addEventListener('click', function () { resetForm(); renderTable(); });

  els.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var it = find(btn.getAttribute('data-id'));
    if (!it) return;
    var act = btn.getAttribute('data-act');
    if (act === 'inc') { it.qty += 1; commit(); }
    else if (act === 'dec') { if (it.qty > 0) { it.qty -= 1; commit(); } }
    else if (act === 'edit') { startEdit(it); }
    else if (act === 'del' && confirm('Delete "' + it.name + '"?')) {
      items = items.filter(function (x) { return x !== it; });
      if (editingId === it.id) resetForm();
      commit();
    }
  });

  document.querySelectorAll('.wh-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var next = t.getAttribute('data-view');
      if (next === view) return;
      view = next;
      resetForm();
      els.category.value = '';
      els.location.value = '';
      history.replaceState(null, '', view === 'tool' ? '#tooling' : location.pathname + location.search);
      render();
    });
  });

  els.manageToggle.addEventListener('click', function () { setManaging(!managing); });

  els.exportBtn.addEventListener('click', function () {
    var today = new Date().toISOString().slice(0, 10);
    var json = JSON.stringify({ updated: today, items: items }, null, 2) + '\n';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'warehouse.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  els.discard.addEventListener('click', function () {
    if (!confirm('Throw away local changes and go back to the published inventory?')) return;
    clearDraft();
    hasDraft = false;
    items = normalize(published);
    resetForm();
    render();
  });

  els.importBtn.addEventListener('click', function () { els.importFile.click(); });
  els.importFile.addEventListener('change', function () {
    var file = els.importFile.files[0];
    if (!file) return;
    file.text().then(function (raw) {
      var data = JSON.parse(raw);
      items = normalize(Array.isArray(data) ? data : data.items);
      commit();
    }).catch(function () {
      alert("That file isn't valid warehouse JSON.");
    });
    els.importFile.value = '';
  });

  [els.search, els.category, els.location, els.low].forEach(function (el) {
    el.addEventListener('input', renderTable);
  });

  document.querySelectorAll('.wh-sort').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-key');
      if (key === sortKey) sortDir = -sortDir;
      else { sortKey = key; sortDir = 1; }
      renderTable();
    });
  });

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : { items: [] }; })
    .catch(function () { return { items: [] }; })
    .then(function (data) {
      published = normalize(data.items);
      var draft = readDraft();
      hasDraft = !!draft;
      items = normalize(draft || published);
      render();
    });
})();
