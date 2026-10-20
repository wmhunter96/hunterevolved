// Warehouse — parts and tooling inventory, plus projects that consume parts.
//
// The published inventory is data/warehouse.json. GitHub Pages has no
// backend, so "Manage" edits a draft copy kept in this browser's
// localStorage; "Download JSON" exports it to commit over
// data/warehouse.json, which is what everyone else sees.
(function () {
  var DATA_URL = 'data/warehouse.json';
  var DRAFT_KEY = 'warehouse-draft';

  var published = [];
  var publishedProjects = [];
  var items = [];
  // Projects record the parts they used. Using a part takes it out of stock;
  // returning a use puts it back.
  var projects = [];
  var hasDraft = false;
  var managing = false;
  var editingId = null;
  var sortKey = 'name';
  var sortDir = 1;
  // Tools live in three stacked DEWALT ToughSystem 2.0 three-drawer units
  // (DWST08330): nine drawers, numbered 1-9 from the top. A tool's location
  // like "Drawer 4" puts it in the map.
  var TOOLBOX_UNITS = ['Top', 'Middle', 'Bottom'];
  var DRAWERS_PER_UNIT = 3;
  var DRAWERS = [];
  for (var d = 1; d <= TOOLBOX_UNITS.length * DRAWERS_PER_UNIT; d++) DRAWERS.push('Drawer ' + d);

  var HASHES = { part: '', tool: '#tooling', project: '#projects' };
  var view = location.hash === '#tooling' ? 'tool' : location.hash === '#projects' ? 'project' : 'part';

  var VIEWS = {
    part: { noun: 'part', plural: 'Parts', lowLabel: 'Low stock only',
      place: 'Location', places: 'locations', placeSub: 'bins, drawers, shelves', placeHint: 'e.g. Bin A3' },
    // Every tool lives in a toolbox drawer, so tooling's "location" reads as Drawer.
    tool: { noun: 'tool', plural: 'Tools', lowLabel: 'Needs attention only',
      place: 'Drawer', places: 'drawers', placeSub: 'in the toolbox', placeHint: 'Drawer 1-9, top to bottom' },
    project: { noun: 'part', plural: 'Projects', lowLabel: '', place: 'Location', places: 'locations', placeSub: '', placeHint: '' }
  };

  function $(id) { return document.getElementById(id); }
  var els = {
    stats: $('whStats'), search: $('whSearch'), category: $('whCategory'),
    location: $('whLocation'), low: $('whLow'), manageToggle: $('whManageToggle'),
    banner: $('whDraftBanner'), exportBtn: $('whExport'), discard: $('whDiscard'),
    form: $('whForm'), formTitle: $('whFormTitle'), submit: $('whSubmit'),
    cancelEdit: $('whCancelEdit'), importBtn: $('whImport'), importFile: $('whImportFile'),
    categoryList: $('whCategoryList'), locationList: $('whLocationList'),
    body: $('whBody'), empty: $('whEmpty'), lowLabel: $('whLowLabel'),
    toolboxWrap: $('whToolboxWrap'), toolbox: $('whToolbox'), toolboxLoose: $('whToolboxLoose'),
    projectsView: $('whProjectsView'), projectForm: $('whProjectForm'), projects: $('whProjects')
  };

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      // Drafts saved before projects existed were a bare items array.
      return Array.isArray(d) ? { items: d, projects: null } : d;
    } catch (e) { return null; }
  }
  function writeDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ items: items, projects: projects })); } catch (e) {}
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

  function normalizeProjects(list) {
    return (Array.isArray(list) ? list : []).filter(function (p) {
      return p && typeof p.name === 'string' && p.name.trim();
    }).map(function (p) {
      return {
        id: String(p.id || newId()),
        name: String(p.name).trim(),
        status: p.status === 'done' ? 'done' : 'active',
        notes: String(p.notes || '').trim(),
        uses: (Array.isArray(p.uses) ? p.uses : []).filter(function (u) {
          return u && Number(u.qty) > 0;
        }).map(function (u) {
          return {
            id: String(u.id || newId()),
            itemId: String(u.itemId || ''),
            name: String(u.name || '').trim(),
            qty: Math.floor(Number(u.qty)),
            date: String(u.date || '')
          };
        })
      };
    });
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isLow(it) { return it.minQty != null && it.qty <= it.minQty; }
  // "Needs attention" filter: low stock for parts, any non-default status for tools.
  function needsAttention(it) { return it.kind === 'tool' ? !!it.status : isLow(it); }

  // "Drawer 4", "drawer 4", "Drawer4" -> 4; anything else (or out of range) -> 0.
  function drawerOf(it) {
    var m = /drawer\s*(\d+)/i.exec(it.location || '');
    var n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= DRAWERS.length ? n : 0;
  }

  // Location choices for the filter and form: every drawer always shows up on
  // the Tooling tab, even empty ones.
  function places() {
    var used = uniq('location');
    if (view !== 'tool') return used;
    return DRAWERS.concat(used.filter(function (p) { return !drawerOf({ location: p }); }));
  }

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
    if (view === 'project') {
      var active = projects.filter(function (p) { return p.status === 'active'; }).length;
      var used = 0, distinct = {};
      projects.forEach(function (p) {
        p.uses.forEach(function (u) { used += u.qty; distinct[u.itemId || u.name] = true; });
      });
      els.stats.innerHTML =
        stat('Projects', projects.length, projects.length - active + ' done') +
        stat('Active', active, 'in progress') +
        stat('Units used', used.toLocaleString(), 'pulled from stock') +
        stat('Parts used', Object.keys(distinct).length, 'distinct parts');
      return;
    }
    var locations = view === 'tool'
      ? stat('Drawers in use', list.reduce(function (seen, it) {
          var n = drawerOf(it); if (n && seen.indexOf(n) === -1) seen.push(n); return seen;
        }, []).length + ' / ' + DRAWERS.length, v.placeSub)
      : stat(v.place + 's', uniq('location').length, v.placeSub);
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
      var drawer = view === 'tool' ? drawerOf(it) : 0;
      return '<tr' + (editingId === it.id ? ' class="wh-editing"' : '') + (drawer ? ' data-drawer="' + drawer + '"' : '') + '>' +
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
    renderToolbox(rows);

    document.querySelectorAll('.wh-sort').forEach(function (b) {
      var active = b.getAttribute('data-key') === sortKey;
      b.classList.toggle('active', active);
      b.setAttribute('data-dir', active ? (sortDir > 0 ? 'asc' : 'desc') : '');
    });
  }

  function renderToolbox(rows) {
    if (view !== 'tool') return;
    var tools = inView();
    var filtering = !!(els.search.value.trim() || els.category.value || els.low.checked);
    var matches = {};
    rows.forEach(function (it) { var n = drawerOf(it); if (n) matches[n] = (matches[n] || 0) + 1; });
    var html = '';
    TOOLBOX_UNITS.forEach(function (unit, u) {
      html += '<div class="wh-tb-unit"><div class="wh-tb-lid"><span>' + unit + '</span></div>';
      for (var i = 1; i <= DRAWERS_PER_UNIT; i++) {
        var n = u * DRAWERS_PER_UNIT + i;
        var inside = tools.filter(function (it) { return drawerOf(it) === n; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });
        var cls = 'wh-tb-drawer';
        if (els.location.value === DRAWERS[n - 1]) cls += ' selected';
        if (filtering) cls += matches[n] ? ' match' : ' dim';
        var shown = inside.slice(0, 4).map(function (it) {
          var hit = filtering && rows.indexOf(it) !== -1;
          return '<li' + (hit ? ' class="hit"' : '') + '>' + text(it.name) + '</li>';
        }).join('');
        if (inside.length > 4) shown += '<li class="more">+' + (inside.length - 4) + ' more</li>';
        html += '<button type="button" class="' + cls + '" data-drawer="' + n + '" aria-pressed="' + (cls.indexOf('selected') !== -1) + '"' +
          ' aria-label="Drawer ' + n + ', ' + inside.length + ' tool' + (inside.length === 1 ? '' : 's') + '">' +
          '<span class="wh-tb-num">' + n + '</span>' +
          '<ul class="wh-tb-list">' + (shown || '<li class="empty">Empty</li>') + '</ul>' +
          '<span class="wh-tb-count">' + inside.length + '</span>' +
          '<span class="wh-tb-handle" aria-hidden="true"></span></button>';
      }
      html += '</div>';
    });
    els.toolbox.innerHTML = html;
    var loose = tools.filter(function (it) { return !drawerOf(it); }).length;
    els.toolboxLoose.hidden = !loose;
    els.toolboxLoose.textContent = loose + ' tool' + (loose === 1 ? " isn't" : "s aren't") +
      ' assigned to a drawer (set the Drawer to "Drawer 1" through "Drawer ' + DRAWERS.length + '").';
  }

  function highlightDrawer(n) {
    els.toolbox.querySelectorAll('.wh-tb-drawer').forEach(function (el) {
      el.classList.toggle('hot', Number(el.getAttribute('data-drawer')) === n);
    });
  }

  function renderView() {
    var v = VIEWS[view];
    document.querySelector('main.page').classList.toggle('wh-view-project', view === 'project');
    els.projectsView.hidden = view !== 'project';
    els.toolboxWrap.hidden = view !== 'tool';
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
    fillSelect(els.location, places(), 'All ' + VIEWS[view].places);
    fillDatalist(els.categoryList, uniq('category'));
    fillDatalist(els.locationList, places());
    renderStats();
    renderTable();
    renderProjects();
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
    els.projectForm.hidden = !on;
    if (!on) resetForm();
    renderTable();
    renderProjects();
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
      history.replaceState(null, '', HASHES[view] || location.pathname + location.search);
      render();
    });
  });

  function findProject(id) {
    for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i];
    return null;
  }

  function partOptions() {
    return items.filter(function (it) { return it.kind === 'part' && it.qty > 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (it) {
        return '<option value="' + it.id + '">' + text(it.name) + ' (' + it.qty + ' on hand' +
          (it.location ? ', ' + text(it.location) : '') + ')</option>';
      }).join('');
  }

  function renderProjects() {
    if (view !== 'project') return;
    var options = partOptions();
    var list = projects.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!list.length) {
      els.projects.innerHTML = '<p class="wh-empty">' +
        (managing ? 'No projects yet. Add one above.' : 'No projects yet.') + '</p>';
      return;
    }
    els.projects.innerHTML = list.map(function (p) {
      var units = p.uses.reduce(function (n, u) { return n + u.qty; }, 0);
      var uses = p.uses.length
        ? '<div class="table-scroll"><table class="data-table wh-table"><thead><tr><th>Part</th><th class="wh-num">Qty</th><th>Used</th>' +
            (managing ? '<th></th>' : '') + '</tr></thead><tbody>' +
            p.uses.map(function (u) {
              var it = find(u.itemId);
              var ret = managing
                ? '<td class="wh-row-actions">' + (it
                    ? '<button type="button" class="wh-link" data-act="return" data-project="' + p.id + '" data-use="' + u.id + '">Return to stock</button>'
                    : '<span class="wh-muted" title="This part was deleted from the inventory">part deleted</span>') + '</td>'
                : '';
              return '<tr><td class="wh-name">' + text(it ? it.name : u.name) + '</td><td class="wh-num">' + u.qty +
                '</td><td>' + text(u.date) + '</td>' + ret + '</tr>';
            }).join('') + '</tbody></table></div>'
        : '<p class="wh-muted">No parts used yet.</p>';
      var use = managing && p.status === 'active'
        ? (options
            ? '<form class="wh-use" data-project="' + p.id + '">' +
                '<select class="wh-input" name="part" aria-label="Part to use" required>' + options + '</select>' +
                '<input class="wh-input" name="qty" type="number" min="1" step="1" value="1" aria-label="Quantity" required>' +
                '<button type="submit" class="btn btn-primary wh-btn">Use part</button></form>'
            : '<p class="wh-muted">No parts in stock to use.</p>')
        : '';
      var actions = managing
        ? '<div class="wh-project-actions">' +
            '<button type="button" class="wh-link" data-act="status" data-project="' + p.id + '">' + (p.status === 'active' ? 'Mark done' : 'Reopen') + '</button>' +
            '<button type="button" class="wh-link" data-act="delproject" data-project="' + p.id + '">Delete project</button></div>'
        : '';
      return '<article class="wh-project' + (p.status === 'done' ? ' done' : '') + '">' +
        '<div class="wh-project-head"><h3>' + text(p.name) + '</h3>' +
        '<span class="badge">' + (p.status === 'done' ? 'Done' : 'Active') + '</span></div>' +
        '<p class="meta">' + p.uses.length + ' part' + (p.uses.length === 1 ? '' : 's') + ' &middot; ' + units + ' unit' + (units === 1 ? '' : 's') + '</p>' +
        (p.notes ? '<p class="wh-project-notes">' + text(p.notes) + '</p>' : '') +
        uses + use + actions + '</article>';
    }).join('');
  }

  els.projectForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = els.projectForm.elements;
    var p = normalizeProjects([{ name: f.name.value, notes: f.notes.value }])[0];
    if (!p) return;
    projects.push(p);
    els.projectForm.reset();
    commit();
  });

  els.projects.addEventListener('submit', function (e) {
    var form = e.target.closest('form.wh-use');
    if (!form) return;
    e.preventDefault();
    var p = findProject(form.getAttribute('data-project'));
    var it = find(form.elements.part.value);
    var n = Math.floor(Number(form.elements.qty.value));
    if (!p || !it || !(n > 0)) return;
    if (n > it.qty) { alert('Only ' + it.qty + ' of "' + it.name + '" on hand.'); return; }
    it.qty -= n;
    p.uses.push({ id: newId(), itemId: it.id, name: it.name, qty: n, date: today() });
    commit();
  });

  els.projects.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var p = findProject(btn.getAttribute('data-project'));
    if (!p) return;
    var act = btn.getAttribute('data-act');
    if (act === 'status') {
      p.status = p.status === 'active' ? 'done' : 'active';
      commit();
    } else if (act === 'delproject' &&
        confirm('Delete "' + p.name + '"? Parts it used stay out of stock; return them first if you want them back.')) {
      projects = projects.filter(function (x) { return x !== p; });
      commit();
    } else if (act === 'return') {
      var useId = btn.getAttribute('data-use');
      var u = p.uses.filter(function (x) { return x.id === useId; })[0];
      var it = u && find(u.itemId);
      if (!u || !it) return;
      it.qty += u.qty;
      p.uses = p.uses.filter(function (x) { return x !== u; });
      commit();
    }
  });

  els.manageToggle.addEventListener('click', function () { setManaging(!managing); });

  els.exportBtn.addEventListener('click', function () {
    var json = JSON.stringify({ updated: today(), items: items, projects: projects }, null, 2) + '\n';
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
    projects = normalizeProjects(publishedProjects);
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
      projects = normalizeProjects(Array.isArray(data) ? [] : data.projects);
      commit();
    }).catch(function () {
      alert("That file isn't valid warehouse JSON.");
    });
    els.importFile.value = '';
  });

  els.toolbox.addEventListener('click', function (e) {
    var btn = e.target.closest('.wh-tb-drawer');
    if (!btn) return;
    var name = DRAWERS[Number(btn.getAttribute('data-drawer')) - 1];
    els.location.value = els.location.value === name ? '' : name;
    renderTable();
    if (els.location.value && window.matchMedia('(max-width: 720px)').matches) {
      document.querySelector('.wh-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  els.body.addEventListener('mouseover', function (e) {
    var tr = e.target.closest('tr');
    highlightDrawer(tr ? Number(tr.getAttribute('data-drawer')) : 0);
  });
  els.body.addEventListener('mouseleave', function () { highlightDrawer(0); });

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
      publishedProjects = normalizeProjects(data.projects);
      var draft = readDraft();
      hasDraft = !!draft;
      items = normalize(draft ? draft.items : published);
      projects = normalizeProjects(draft && draft.projects ? draft.projects : publishedProjects);
      render();
    });
})();
