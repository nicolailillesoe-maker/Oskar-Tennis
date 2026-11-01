// StreakCoach · service worker · v6.24.3 (1/11-2026) — beskeder + siden selv uden net.
//
// ⭐ v6.24.3 · Codes N2: v6.24.2 havde ingen fetch-lytter og tog dermed offline-åbningen fra de telefoner, der havde den gennem rodens
//   sw.js. Nu tager lytteren KUN navigationen til selve siden, og NETTET FØRST: er der net, er det altid den nyeste udgave, og kopien
//   bruges kun, når nettet fejler. Data, motorer og billeder røres aldrig (beslutningen fra 29/8 står: en forældet app, når der er net,
//   kan den ikke servere).
// ⭐ Scope er /trainer-platform.html — ikke domænets rod. Derfor:
//   · et tryk på en besked lander aldrig i et StreakTennis-vindue (Codes fund R3: rodens sw.js valgte det første vindue på domænet)
//   · domænets forside lader registreringen være (fund R4: den afmelder alt, der ikke er /StreakTennis/ — eller denne side)
// ⭐ Ruten er en lukket liste: #goer-nu og #aftale. Alt andet i en besked er data udefra og bliver til siden uden rute.

const RUTER = ["#goer-nu", "#aftale"];

const KOPI = "coach-side-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function ruteAf(sti) {
  const s = String(sti || "");
  const i = s.indexOf("#");
  const h = i >= 0 ? s.slice(i) : "";
  return RUTER.indexOf(h) >= 0 ? h : "";
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_e) { d = {}; }
  e.waitUntil(self.registration.showNotification(String(d.titel || "StreakCoach").slice(0, 60), {
    body: String(d.tekst || "").slice(0, 140),
    icon: "./coach-ikon-180.png",
    badge: "./coach-ikon-180.png",
    tag: String(d.emne || "coach").slice(0, 40),   // samme emne → samme plads
    renotify: false,
    lang: "da",
    data: { rute: ruteAf(d.sti) },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const side = self.registration.scope;            // …/trainer-platform.html
  const rute = ruteAf((e.notification.data || {}).rute);
  const vej = new URL(side).pathname;
  e.waitUntil((async () => {
    const liste = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of liste) {
      let p = "";
      try { p = new URL(c.url).pathname; } catch (_e) {}
      if (p !== vej) continue;                        // kun StreakCoachs egne vinduer
      try { c.postMessage({ sai: "gaa", sti: rute }); } catch (_e) {}
      if ("focus" in c) { try { return await c.focus(); } catch (_e) {} }
      return;
    }
    if (self.clients.openWindow) return self.clients.openWindow(side + rute);
    return null;
  })());
});

self.addEventListener("fetch", (e) => {
  const q = e.request;
  if (q.method !== "GET" || q.mode !== "navigate") return;            // kun selve siden — aldrig data, motorer eller billeder
  let u; try { u = new URL(q.url); } catch (_e) { return; }
  const vej = new URL(self.registration.scope).pathname;
  if (u.origin !== self.location.origin || u.pathname !== vej) return;
  const noegle = u.origin + u.pathname;                               // uden ?r= og #rute — én kopi af siden
  e.respondWith((async () => {
    try {
      const r = await fetch(q);                                       // nettet først
      if (r && r.ok) { try { const c = await caches.open(KOPI); await c.put(noegle, r.clone()); } catch (_c) {} }
      return r;
    } catch (fejl) {
      const gl = await caches.match(noegle);                          // vores kopi — eller rodens sw.js' fra før v6.24.2
      if (gl) return gl;
      throw fejl;
    }
  })());
});
