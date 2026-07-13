// Team Oskar service worker — network-first med offline-fallback
const CACHE = "teamoskar-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request)
        .then((svar) => {
          const kopi = svar.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopi));
          return svar;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
    );
  }
});
