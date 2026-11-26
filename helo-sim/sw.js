// Offline support. App files: network first, cached copy as fallback. Terrain tiles: kept once fetched, so flown areas work offline.
const APP = 'rwfs-app-v1', TILES = 'rwfs-tiles-v1';
const FILES = ['./', './index.html', './three.min.js', './manifest.webmanifest', './icon-192.png', './js/fields.js', './js/core.js', './js/systems.js', './js/physics.js', './js/terrain.js', './js/models.js', './js/world.js', './js/panel.js', './js/input.js', './js/ui.js', './js/main.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = e.request.url; if (e.request.method !== 'GET') return;
  if (u.includes('elevation-tiles-prod')) {
    e.respondWith(caches.open(TILES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
  } else if (u.startsWith(self.location.origin)) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
