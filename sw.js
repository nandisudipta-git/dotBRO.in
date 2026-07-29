/* dotBro service worker — app shell cached, live data never.
   Bump VERSION to invalidate after a deploy. */
const VERSION = 'dotbro-v10';
const SHELL = ['/', '/index.html', '/about.html', '/alge-engine.js', '/manifest.webmanifest',
               '/assets/icon-192.png', '/assets/icon-512.png', '/assets/favicon-red.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;                     // posts go straight through
  if (url.hostname.endsWith('supabase.co')) return;           // live data: never cached
  // network-first for the shell (fresh deploys win), cache as offline fallback
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname === '/' }))
    );
    return;
  }
  // CDN assets (three.js, textures, supabase-js): cache-first — they are versioned URLs
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return r;
    }))
  );
});
