// Service worker — network-first med offline-fallback
//
// v3 (25/8-2026): ⚠️⚠️ FALLBACK-NØGLEN KUNNE FORGIFTES.
//
// Nicolai 25/8 kl. 14.02: han åbnede tennis.sportsainalytics.com i Chrome
// og fik APPEN — ikke døren. Repoet var målt rent samme minut: roden er
// døren på 3.235 bytes. Det var telefonen, der svarede.
//
// FEJLEN, ORDRET FRA v2:
//     if (sti === "/" || sti.endsWith("/index.html")) c.put("./index.html", …)
//
// "/StreakTennis/index.html".endsWith("/index.html") er SAND. Hver gang
// nogen åbnede APPEN, mens denne service worker havde kontrollen, blev
// rodens fallback-nøgle overskrevet MED APPEN. Derefter kunne ét fejlet
// netværkskald på roden servere appen i stedet for døren — lydløst.
//
// Det er nøjagtig samme fejlklasse som v2 selv skulle rette: en
// offline-kopi, der lyver om, hvad der ligger på serveren.
//
// v3 RETTER DET: fallback-nøglen opdateres KUN af siden i denne service
// workers EGEN rod. Appen kan ikke længere skrive i rodens kopi, og
// roden kan ikke skrive i appens.
const CACHE = "sai-v3";
const FALLBACK = "./index.html";

self.addEventListener("install", (e) => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      // ⚠️ Rydder OGSÅ de gamle "teamoskar-*"-caches. De indeholder den
      // forgiftede kopi, og de ligger på hver eneste telefon, der har
      // åbnet appen siden juli.
      .then((navne) => Promise.all(navne.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (e) => {
  // Kun sider. API-kald (fetch mod edge-funktionerne) røres ALDRIG —
  // en cache må aldrig kunne svare på et spørgsmål om, hvem du er.
  if (e.request.mode !== "navigate" && e.request.destination !== "document") return;

  e.respondWith(
    fetch(e.request)
      .then((svar) => {
        const kopiSide = svar.clone();
        const kopiFallback = svar.clone();
        caches.open(CACHE).then((c) => {
          c.put(e.request, kopiSide);
          // ⭐ KUN MIN EGEN ROD. Sammenlignes med denne service workers
          // scope — ikke med en endelse, der passer på hvad som helst.
          try {
            const sti = new URL(e.request.url).pathname;
            const rod = new URL(self.registration.scope).pathname;
            if (sti === rod || sti === rod + "index.html") c.put(FALLBACK, kopiFallback);
          } catch (_e) {}
        });
        return svar;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match(FALLBACK)))
  );
});
