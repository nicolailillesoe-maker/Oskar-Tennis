// Service worker — network-first med offline-fallback + push
//
// ══════════════════════════════════════════════════════════════════════
// v5 (27/8-2026): ⛔⛔ ET TRYK PÅ EN BESKED LANDEDE INGEN STEDER.
//
// Nicolai 27/8: «Pop-up beskederne går ikke ind på et relevant sted. Så når
// Oskar har sendt en besked, åbner den bare appen. Den skal jo gå til
// beskeder. Og så fremdeles.»
//
// ⭐ ÅRSAGEN ER MÅLT I DENNE FIL, ikke gættet — og den er TO fejl:
//
//   ① `focus()` ER IKKE EN NAVIGATION. Ligger appen på hjemmeskærmen, er
//      der næsten altid et vindue åbent. v4 fandt det, kaldte `focus()` og
//      stoppede. Appen kom frem — på præcis den skærm, den stod på i
//      forvejen. Destinationen blev regnet ud og derefter kasseret.
//   ② DER VAR INGEN DESTINATION AT GÅ TIL. Hver eneste besked fra
//      `push-puls` bar `sti: "./"`. Selv et koldt start ville lande på
//      forsiden. Rettet i `push-puls` v7 — men UDEN denne fil ville det
//      stadig ikke virke, fordi ① kastede stien væk.
//
// ⭐⭐ LØSNINGEN ER EN BESKED, IKKE EN NAVIGATION. `navigate()` ville
// genindlæse appen — midt i en kamp. Kampen ville overleve (den ligger i
// lageret efter hvert tryk), men skærmen ville blinke, og en forælder,
// der taster point, ville miste sin plads i et sekund. Derfor sender vi
// ruten ind i det åbne vindue med `postMessage`, og appen flytter sig selv
// uden at genindlæse noget.
//
// ⚠️ EN GAMMEL APP TABER INTET: den lytter bare ikke, og så lander man på
// forsiden — præcis som i dag. Ingen regression, kun en gevinst.
//
// ⚠️⚠️ KUN DENNE FIL ER RETTET. `klub/sw.js` og rodens `sw.js` var byte-ens
// med denne indtil nu. Pilotlinjen er FROSSET, og roden er en dør — ingen
// af dem modtager push. Registret skal derfor vise tre forskellige md5 her,
// og det er med vilje.
// ══════════════════════════════════════════════════════════════════════
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
//
// ⭐ v5 · `sti` er nu en RUTE ind i appen ("./?gaa=chat:1a2b…"), ikke bare
// "./". Ruten peger på en SAMTALE, aldrig på et indhold — og den er
// krypteret hele vejen frem, fordi web-push er ende-til-ende.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_e) { d = {}; }
  const titel = String(d.titel || "StreakTennis").slice(0, 60);
  // ⭐ v6 (29/8) · IKONETS BADGE SAETTES FRA PUSHEN — det er den eneste
  // maade, tallet kan aendre sig paa en LUKKET app (WebKit: badging fra
  // SW under en push, iOS 16.4+, kun paa hjemmeskaermen). Tallet kommer
  // fra push-puls v8 og er regnet med venne-snaks egen ulaest-regel.
  // Mangler feltet (gammel motor), roeres badgen ikke — aldrig et gaet.
  try {
    if (typeof d.ulaest === "number" && navigator.setAppBadge) {
      if (d.ulaest > 0) e.waitUntil(navigator.setAppBadge(d.ulaest));
      else if (navigator.clearAppBadge) e.waitUntil(navigator.clearAppBadge());
    }
  } catch (_e) {}
  e.waitUntil(self.registration.showNotification(titel, {
    body: String(d.tekst || "").slice(0, 140),
    icon: "./ikon-192.png",
    badge: "./ikon-192.png",
    // ⭐ Samme emne → samme plads. Ny besked erstatter den gamle.
    tag: String(d.emne || "sai").slice(0, 40),
    renotify: false,
    lang: "da",
    data: { sti: String(d.sti || "./").slice(0, 160) },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const rod = self.registration.scope;
  const sti = String((e.notification.data || {}).sti || "./").slice(0, 160);
  let maal = rod;
  try { maal = new URL(sti, rod).href; } catch (_e) {}
  // Uden for vores egen mappe går vi aldrig. En sti i en notifikation er
  // data udefra, selv om den er krypteret undervejs.
  if (maal.indexOf(rod) !== 0) maal = rod;

  e.waitUntil((async () => {
    const liste = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of liste) {
      if (String(c.url || "").indexOf(rod) !== 0) continue;
      // ⭐⭐ HER VAR FEJLEN. v4 kaldte kun focus() og smed ruten væk.
      // Nu får vinduet at vide, HVOR det skal hen — og flytter sig selv
      // uden at genindlæse. Lytteren står i appen (`__saiRute`).
      try { c.postMessage({ sai: "gaa", sti: sti }); } catch (_e) {}
      if ("focus" in c) { try { return await c.focus(); } catch (_e) {} }
      return;
    }
    // Intet vindue åbent: så er en kold start den rigtige — og den bærer
    // ruten i adressen, som appen læser ved opstart.
    if (self.clients.openWindow) return self.clients.openWindow(maal);
    return null;
  })());
});
