/* dotBro service worker — app shell cached, live data never.
   Bump VERSION to invalidate after a deploy. */
const VERSION = 'dotbro-v35';
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
  // The engine is requested as /alge-engine.js?v=N — without ignoreSearch a
  // cold offline start missed the cached copy and lost the WebGL globe.
  const looseMatch = url.pathname === '/' || url.pathname === '/alge-engine.js';
  // network-first for the shell (fresh deploys win), cache as offline fallback.
  // ONLY 200s get cached: one transient 500 stored here used to be replayed
  // as the "offline fallback" until the next VERSION bump.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: looseMatch }))
    );
    return;
  }
  // CDN assets (three.js, textures, supabase-js): cache-first — they are
  // versioned URLs. Opaque responses (no-cors) can't be inspected, so they're
  // cached as-is; everything else must be a 200.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }))
  );
});

/* ── push: someone answered, and the tab is closed ─────────────────────────
   Android/Chrome delivers this with no page running. iOS only ever gets here
   if the app was added to the home screen — Apple's rule, not ours.
   A push event MUST show a notification or Chrome shows its own "this site
   was updated in the background", so every path below ends in showNotification. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const title = d.title || 'someone answered you';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'tap to read it on the globe',
    icon: '/assets/icon-192.png',
    badge: '/assets/favicon-red.png',
    tag: d.qid ? 'q-' + d.qid : 'dotbro',   // one question, one notification
    renotify: true,
    data: { url: d.qid ? '/?q=' + d.qid : '/' },
  }));
});

/* Tapping it should land inside the conversation — and reuse a tab that is
   already open on the site rather than stacking another one. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) {
      if (new URL(w.url).origin === location.origin && 'focus' in w) {
        w.navigate(target); return w.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
