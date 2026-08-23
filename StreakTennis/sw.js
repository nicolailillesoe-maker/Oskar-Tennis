// Team Oskar service worker — network-first med offline-fallback
//
// v2 (18/8-2026): GAMLE CACHES RENSES. Fundet i aften: v1-cachen fra juli
// blev aldrig ryddet, og fallbacken serverede en forældet app-udgave i det
// øjeblik, ét netværkskald fejlede — lydløst og uden banner. Nu ryddes alt,
// der ikke hedder CACHE, ved aktivering, og en vellykket hentning af en side
// opdaterer BÅDE sidens egen nøgle og "./index.html"-nøglen, som fallbacken
// slår op — så offline-kopien altid er den senest sete udgave.
const CACHE = "teamoskar-v2";

self.addEventListener("install", (e) => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((navne) => Promise.all(navne.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request)
        .then((svar) => {
          const kopiTilNoegle = svar.clone();
          const kopiTilFallback = svar.clone();
          caches.open(CACHE).then((c) => {
            c.put(e.request, kopiTilNoegle);
            // Fallback-nøglen holdes frisk: er det forsiden, der hentes,
            // gemmes den også under det navn, fallbacken slår op.
            const sti = new URL(e.request.url).pathname;
            if (sti === "/" || sti.endsWith("/index.html")) c.put("./index.html", kopiTilFallback);
          });
          return svar;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
    );
  }
});
