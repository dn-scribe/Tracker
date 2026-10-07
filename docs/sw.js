const CACHE_NAME = 'tracker-v1';

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/version.js',
  'js/storage.js',
  'js/app.js',
  'favicon.svg',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: 'reload' bypasses the HTTP cache so we always get fresh files
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell — cache-first
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
      }
      return res;
    }))
  );
});
