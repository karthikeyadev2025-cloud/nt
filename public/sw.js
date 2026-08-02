// Service worker kill switch.
//
// This project used to ship a caching service worker. It was removed, but
// simply deleting the file was NOT enough: this app's vercel.json rewrites
// every unmatched path to index.html, so a request for /sw.js from any
// browser that still had the OLD service worker installed no longer got a
// 404 — it got index.html's HTML content instead. A service worker's
// browser-driven update check treats that as "the script changed" and
// tries to install it as the new service worker, but HTML is not valid JS,
// so that install silently fails — and the OLD, broken service worker
// stays permanently in control, since it can never be successfully
// replaced. That produced exactly this symptom: a tab that had the old
// service worker kept serving stale cached content on every refresh,
// forever, while a fresh private tab (with no service worker registered)
// worked perfectly.
//
// This file is a real, valid, minimal service worker whose only job is to
// take over from whatever came before, then immediately remove itself:
// unregister, delete every cache, and force every open tab to reload. Once
// every affected browser has run this once, it can eventually be deleted
// again safely — but until then, this must stay in place as the thing any
// stale installed service worker updates itself into.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
