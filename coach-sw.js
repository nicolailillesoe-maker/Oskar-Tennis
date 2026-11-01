// StreakCoach · service worker · v6.24.2 (31/10-2026) — KUN beskeder.
//
// ⭐ Ingen fetch-lytter. En service worker, der kun lytter efter beskeder, kan aldrig servere en gammel udgave af appen
//   (beslutningen fra 29/8: «en SW, der kun lytter på push, kan aldrig servere en forældet app»).
// ⭐ Scope er /trainer-platform.html — ikke domænets rod. Derfor:
//   · et tryk på en besked lander aldrig i et StreakTennis-vindue (Codes fund R3: rodens sw.js valgte det første vindue på domænet)
//   · domænets forside lader registreringen være (fund R4: den afmelder alt, der ikke er /StreakTennis/ — eller denne side)
// ⭐ Ruten er en lukket liste: #goer-nu og #aftale. Alt andet i en besked er data udefra og bliver til siden uden rute.

const RUTER = ["#goer-nu", "#aftale"];

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
