// klub/sw.js · v4 — SELVMORDS-ARBEJDEREN
//
// Nicolai 28/8: «jeg tænker vi går efter at bruge StreakTennis og
// pensionerer klub. Således har vi 1 platform.»
//
// ⭐⭐⭐ HVORFOR EN FIL OG IKKE BARE EN SLETNING.
// En service worker overlever, at siden bag den forsvinder. Den forrige
// udgave af denne fil var network-first MED offline-fallback: fejler ét
// netværkskald, serverer den lydløst den gamle klub-app fra cachen. Slettede
// vi bare `klub/index.html`, ville enhver telefon, der nogensinde har åbnet
// /klub/, blive ved med at få den GAMLE app — for evigt, uden fejlmeddelelse.
// Præcis dét skete 18/8 med v1-cachen.
//
// Denne fil gør derfor tre ting én gang og forsvinder så af sig selv:
//   ① tager over med det samme (skipWaiting + claim)
//   ② rydder KUN /klub/-siderne ud af cachen
//   ③ afmelder sig selv og sender åbne faner videre til døren
//
// ⚠️⚠️ DEN MÅLTE FÆLDE, DER GØR ② PRÆCIS I STEDET FOR NEM:
// ALLE TRE apps på domænet bruger den SAMME cache — `const CACHE = "sai-v3"`
// står ordret i `sw.js`, `klub/sw.js` OG `StreakTennis/sw.js`. Cache Storage
// er pr. ORIGIN, ikke pr. scope. Et `caches.delete("sai-v3")` her ville
// altså rive StreakTennis' offline-kopi ned sammen med klubbens — og det
// ville ske netop den dag, hvor ti familier står i et klubhus med dårligt
// wifi. Derfor slettes der pr. ADRESSE, ikke pr. cache.

const KLUB = "/klub/";

self.addEventListener("install", () => {
  // Ingen ventetid: den gamle arbejder skal ikke nå at svare på noget.
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // ① ryd KUN klubbens egne adresser ud af den delte cache
    try {
      const navne = await caches.keys();
      for (const n of navne) {
        const c = await caches.open(n);
        const noegler = await c.keys();
        for (const k of noegler) {
          try {
            if (new URL(k.url).pathname.indexOf(KLUB) === 0) await c.delete(k);
          } catch (_e) {}
        }
      }
    } catch (_e) {}

    // ② afmeld dig selv — herefter går hver forespørgsel direkte til nettet
    try { await self.registration.unregister(); } catch (_e) {}

    // ③ send åbne faner videre, så ingen bliver siddende på en død side
    try {
      const c = await self.clients.matchAll({ type: "window" });
      for (const k of c) { try { k.navigate(k.url); } catch (_e) {} }
    } catch (_e) {}
  })());
});

// ⚠️ DER ER MED VILJE INGEN `fetch`-LYTTER.
// Uden den går hver eneste forespørgsel uden om arbejderen og direkte på
// nettet. Det er hele pointen: fra det øjeblik denne fil er aktiveret,
// kan /klub/ ikke længere svare med noget gammelt.
