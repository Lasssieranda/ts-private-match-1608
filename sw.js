const CACHE = 'tiefstapel-heart-v12';
const SHELL = ['./','index.html','styles.css?v=040','online.css?v=040','src/app.js?v=040','src/engine.js?v=040','src/online.bundle.js?v=040','manifest.webmanifest?v=040','icons/icon-192.png?v=040','icons/icon-512.png?v=040'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response; }).catch(() => caches.match('index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return response; })));
});
