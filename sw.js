/* Sit Cover shell — network first, cache as an offline fallback.
   Never cache cross-origin calls (fonts, Firebase, Gemini).
   Bump CACHE whenever a release must invalidate old offline copies. */
var CACHE = 'sit-cover-v2';
var SHELL = [
  './',
  './index.html', './order.html', './product.html', './profile.html',
  './myorders.html', './privacy.html', './about.html', './report.html', './wamd.html',
  './css/style.css',
  './js/core.js', './js/config.js', './js/auth.js', './js/ai.js', './js/home.js',
  './js/order.js', './js/product.js', './js/profile.js', './js/myorders.js',
  './js/report.js', './js/wamd.js',
  './manifest.webmanifest',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
  './assets/shop-logo.webp', './assets/shop-banner.webp', './assets/logo.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Each entry separately: one missing file must not fail the install.
      return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function offlinePage(req) {
  // `product.html?id=x` must still open while offline — match without the query.
  return caches.match(req, { ignoreSearch: true }).then(function (m) {
    return m || caches.match('./index.html');
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      if (req.mode === 'navigate') return offlinePage(req);
      return caches.match(req, { ignoreSearch: true }).then(function (m) {
        if (m) return m;
        return Promise.reject(new Error('offline and not cached'));
      });
    })
  );
});
