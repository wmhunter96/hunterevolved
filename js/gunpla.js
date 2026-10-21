// Gunpla — every kit I've built, rendered from data/gunpla.json.
//
// Each entry in kits[]:
//   name    (required)  e.g. "RX-78-2 Gundam (Revive)"
//   grade   (required)  PG, MG, RG, HG, EG, SD, or anything else ("Other")
//   scale               e.g. "1/144"
//   series              e.g. "Mobile Suit Gundam"
//   year                year built, e.g. 2024
//   finish              e.g. "Straight build", "Panel lined", "Painted", "Custom"
//   photo               path under images/gunpla/ or a full URL
//   link                optional (Gunpla wiki, build log, etc.)
//   notes               one-line blurb
(function () {
  var DATA_URL = 'data/gunpla.json';
  // Display order, biggest/most detailed grades first.
  var GRADES = [
    { id: 'PG', label: 'Perfect Grade' },
    { id: 'MG', label: 'Master Grade' },
    { id: 'RG', label: 'Real Grade' },
    { id: 'HG', label: 'High Grade' },
    { id: 'EG', label: 'Entry Grade' },
    { id: 'SD', label: 'Super Deformed' },
    { id: 'Other', label: 'Other' }
  ];

  var statsEl = document.getElementById('gunplaStats');
  var listEl = document.getElementById('gunplaList');
  if (!listEl) return;

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

  function stat(label, value) {
    return '<div class="stat"><span class="stat-label">' + esc(label) +
      '</span><span class="stat-value">' + esc(value) + '</span></div>';
  }

  function card(kit) {
    var tag = kit.link ? 'a' : 'div';
    var attrs = kit.link ? ' href="' + esc(kit.link) + '" target="_blank" rel="noopener"' : '';
    var art = kit.photo ? ' style="--card-art: url(\'' + esc(kit.photo) + '\')"' : '';
    var meta = [kit.grade && kit.scale ? kit.grade + ' ' + kit.scale : (kit.grade || kit.scale), kit.series, kit.year]
      .filter(Boolean).map(esc).join(' &middot; ');
    return '<' + tag + ' class="card"' + art + attrs + '>' +
      '<h3>' + esc(kit.name) + '</h3>' +
      (meta ? '<p class="meta">' + meta + '</p>' : '') +
      (kit.notes ? '<p>' + esc(kit.notes) + '</p>' : '') +
      (kit.finish ? '<span class="badge">' + esc(kit.finish) + '</span>' : '') +
      '</' + tag + '>';
  }

  function render(kits) {
    if (!kits.length) {
      statsEl.innerHTML = '';
      listEl.innerHTML = '<div class="coming-soon">Build list coming soon.</div>';
      return;
    }

    var byGrade = {};
    kits.forEach(function (k) { (byGrade[gradeOf(k)] = byGrade[gradeOf(k)] || []).push(k); });

    var stats = stat('Kits built', kits.length);
    GRADES.forEach(function (g) { if (byGrade[g.id]) stats += stat(g.id, byGrade[g.id].length); });
    statsEl.innerHTML = stats;

    listEl.innerHTML = GRADES.filter(function (g) { return byGrade[g.id]; }).map(function (g) {
      var group = byGrade[g.id].slice().sort(function (a, b) {
        return (b.year || 0) - (a.year || 0) || String(a.name).localeCompare(String(b.name));
      });
      return '<section><h2>' + esc(g.label) + (g.id !== 'Other' ? ' (' + g.id + ')' : '') + '</h2>' +
        '<div class="card-grid">' + group.map(card).join('') + '</div></section>';
    }).join('');
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { render(Array.isArray(data.kits) ? data.kits : []); })
    .catch(function () {
      listEl.innerHTML = '<div class="coming-soon">Couldn\'t load the build list.</div>';
    });
})();
