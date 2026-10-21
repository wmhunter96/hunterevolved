// Footer year
var yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

// Mobile nav toggle
var navToggle = document.getElementById('navToggle');
var navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', function () {
    var isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// Mark the current section in the nav (aria-current drives the orange indicator).
// Exact page match wins; a section index (e.g. gear/index.html) also covers its
// sub-pages. The Home link (first item) only matches the home page itself.
if (navLinks) {
  var norm = function (p) { return p.replace(/\/$/, '/index.html'); };
  var dirOf = function (p) { return p.replace(/[^/]*$/, ''); };
  var here = norm(location.pathname);
  var links = navLinks.querySelectorAll('a[href]');
  var rootDir = links.length ? dirOf(norm(new URL(links[0].getAttribute('href'), location.href).pathname)) : '/';
  var current = null;
  for (var i = 0; i < links.length; i++) {
    var path = norm(new URL(links[i].getAttribute('href'), location.href).pathname);
    if (path === here) { current = links[i]; break; }
    var dir = dirOf(path);
    if (/\/index\.html$/.test(path) && dir !== rootDir && here.indexOf(dir) === 0) current = links[i];
  }
  if (current) current.setAttribute('aria-current', 'page');
}
