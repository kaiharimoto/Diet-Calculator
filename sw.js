/* Lumière service worker — offline-first app shell. */
var CACHE = 'lumiere-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/engine.js',
  './assets/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: serve the app shell (stale-while-revalidate).
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (cached) {
        var net = fetch(e.request).then(function (res) {
          caches.open(CACHE).then(function (c) { c.put('./index.html', res.clone()); });
          return res;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
    return;
  }

  // Static assets: cache-first.
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      return cached || fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});
