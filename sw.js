// Service worker — network-first med offline-fallback + push
//
// v4 (26/8-2026): PUSH-BESKEDER.
// Nicolai 25/8: "Det må være muligt at lave push beskeder via Safari?"
// Ja — men KUN når appen ligger på hjemmeskærmen. iOS sender aldrig en
// push til en Safari-fane. Derfor manifestet, og derfor denne fil.
//
// ⭐ ÉN BESKED AD GANGEN PR. EMNE. `tag` gør, at en ny besked om det
// samme emne ERSTATTER den forrige i stedet for at lægge sig ovenpå.
// Et barn skal ikke vågne til fjorten notifikationer fra det samme rum.
//
// v3 (25/8-2026): ⚠️ FALLBACK-NØGLEN KUNNE FORGIFTES.
// "/StreakTennis/index.html".endsWith("/index.html") er SAND. Hver gang
// nogen åbnede APPEN, blev rodens fallback-nøgle overskrevet MED APPEN.
// MÅLT 25/8 på en rigtig server: rodens service worker har scope "/" og
// styrer OGSÅ appens sider — den nåede at tage kontrollen først, og
// cachens "/index.html" indeholdt appen. v3 sammenligner med service
// workerens EGEN rod i stedet for en endelse.
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

// ══ PUSH ═══════════════════════════════════════════════════════════════
// Kroppen er ren JSON og indeholder ALDRIG andet end det, der skal stå på
// skærmen: {titel, tekst, emne, sti}. Ingen navne på modstandere, ingen
// fritekst, ingen spillernøgle. En notifikation kan ses af enhver, der
// kigger på telefonen — også en, der ikke må se noget.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_e) { d = {}; }
  const titel = String(d.titel || "StreakTennis").slice(0, 60);
  e.waitUntil(self.registration.showNotification(titel, {
    body: String(d.tekst || "").slice(0, 140),
    icon: "./ikon-192.png",
    badge: "./ikon-192.png",
    // ⭐ Samme emne → samme plads. Ny besked erstatter den gamle.
    tag: String(d.emne || "sai").slice(0, 40),
    renotify: false,
    lang: "da",
    data: { sti: String(d.sti || "./").slice(0, 120) },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rod = self.registration.scope;
  let maal = rod;
  try { maal = new URL((e.notification.data || {}).sti || "./", rod).href; } catch (_e) {}
  // Er appen allerede åben, skal den have fokus — ikke åbnes igen.
  if (maal.indexOf(rod) !== 0) maal = rod;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (let i = 0; i < liste.length; i++) {
        if (liste[i].url.indexOf(rod) === 0 && "focus" in liste[i]) return liste[i].focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(maal) : null;
    })
  );
});
