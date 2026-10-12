// asc-koeb.mjs · App Store-værktøjet (ordre-121026-01 · 12/10-2026)
// Engangskøbene (in-app purchases v2) og abonnementsgruppens navn gennem App Store Connect API'et —
// med den nøgle, ios.yml og testflight-grupper.mjs allerede bruger, og efter samme mønster.
// Handlinger (HANDLING): status · opret
// Reglerne: ingen DELETE · intet sendes til review (ingen inAppPurchaseSubmissions) ·
//           Family Sharing og Billing Grace Period røres ikke · intet, der findes, ændres (kun POST af det, der mangler) ·
//           nøglen og token'et skrives ALDRIG i loggen · hvert udfald sin egen linje ·
//           en pris sættes kun, når et prispunkt i DNK rammer beløbet præcist — ellers skrives de to nærmeste, og intet vælges.
// Node 20, ingen pakker.
import crypto from "node:crypto";

const E = process.env;
const BASE = "https://api.appstoreconnect.apple.com";
const BUNDLE = "com.sportsainalytics.streaktennis";
const PRAEFIKS = BUNDLE + ".";            // appens APPLE_ID
const GRUPPE_ID = "22440104";             // abonnementsgruppen StreakTennis
const GRUPPE_NAVN = "StreakTennis";
const TERRITORIUM = "DNK";
const HANDLING = (E.HANDLING || "").trim();
const HAENDELSE = (E.GITHUB_EVENT_NAME || "").trim();
const IDAG = new Date().toISOString().slice(0, 10);

// ordre-121026-01 · A — priserne er Nicolais (i øre, så de sammenlignes præcist)
const ENGANGSKOEB = [
  { id: "kamp.1", ref: "Kampen", navn: "Kampen", tekst: "Live-deling + AI-analyse af én kamp", oere: 2000 },
  { id: "kamp.3", ref: "3 kampe", navn: "3 kampe", tekst: "Live-deling + AI-analyse af 3 kampe", oere: 5400 },
  { id: "kamp.5", ref: "5 kampe", navn: "5 kampe", tekst: "Live-deling + AI-analyse af 5 kampe", oere: 8500 },
  { id: "live.1", ref: "Ekstra livekamp", navn: "Ekstra livekamp", tekst: "Live-deling af én ekstra kamp", oere: 1500 },
  { id: "live.3", ref: "3 ekstra livekampe", navn: "3 ekstra livekampe", tekst: "Live-deling af 3 ekstra kampe", oere: 4000 },
  { id: "live.5", ref: "5 ekstra livekampe", navn: "5 ekstra livekampe", tekst: "Live-deling af 5 ekstra kampe", oere: 6500 },
];
const ABONNEMENTER = ["fuld.maaned", "fri.maaned", "klubfri.maaned"];

const stop = (hvor, detalje) => {
  console.log("⛔ " + hvor + (detalje ? " — " + detalje : ""));
  process.exit(3);
};
for (const k of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8_BASE64"]) if (!E[k]) stop("miljøet mangler " + k);

// ── token (ES256, højst 20 minutter — Apples grænse); maskeres, så det aldrig kan stå i loggen
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const nu = Math.floor(Date.now() / 1000);
const hoved = b64u(JSON.stringify({ alg: "ES256", kid: E.ASC_KEY_ID, typ: "JWT" }));
const krop = b64u(JSON.stringify({ iss: E.ASC_ISSUER_ID, iat: nu, exp: nu + 1200, aud: "appstoreconnect-v1" }));
let noegle;
try { noegle = crypto.createPrivateKey(Buffer.from(E.ASC_KEY_P8_BASE64, "base64").toString("utf8")); }
catch (e) { stop("API-nøglen (.p8) kunne ikke læses"); }
const sig = crypto.sign("sha256", Buffer.from(hoved + "." + krop), { key: noegle, dsaEncoding: "ieee-p1363" });
const TOKEN = hoved + "." + krop + "." + b64u(sig);
console.log("::add-mask::" + TOKEN);

// ── ét kald; en fejl siger status + Apples errors[].code + errors[].detail (aldrig token'et, aldrig headere)
// Vagten: DELETE og alt, der sender til review, kan ikke kaldes herfra.
const SPAERRET = /(inAppPurchaseSubmissions|subscriptionSubmissions|subscriptionGroupSubmissions|reviewSubmissions|appStoreVersionSubmissions|betaAppReviewSubmissions)/i;
async function kald(metode, sti, body) {
  if (metode === "DELETE") stop("DELETE er spærret i dette værktøj");
  if (SPAERRET.test(sti)) stop("review er spærret i dette værktøj");
  if (metode === "PATCH") stop("PATCH er spærret i dette værktøj — det, der findes, ændres ikke");
  let r;
  try {
    r = await fetch(sti.startsWith("http") ? sti : BASE + sti, {
      method: metode,
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { stop(metode + " " + sti.replace(BASE, "").split("?")[0] + " nåede ikke frem", String(e.message || e)); }
  const tekst = await r.text();
  let j = {}; try { j = tekst ? JSON.parse(tekst) : {}; } catch (e) {}
  return { status: r.status, j, fejl: (j.errors || []).map((x) => x.code + ": " + (x.detail || x.title || "")).join(" · ") };
}
const kraev = (svar, ok, hvad) => {
  if (!ok.includes(svar.status)) {
    const hint = svar.status === 401 ? " (nøgle-id, issuer-id eller .p8 passer ikke sammen)"
      : svar.status === 403 ? " (nøglens rolle må ikke dette)" : "";
    stop(hvad + " svarede " + svar.status + hint, svar.fejl);
  }
  return svar.j;
};
// alle sider af en liste (Apples links.next)
async function alle(sti, hvad) {
  const data = [], included = [];
  let naeste = sti;
  for (let side = 0; naeste && side < 40; side++) {
    const j = kraev(await kald("GET", naeste), [200], hvad);
    data.push(...(j.data || []));
    included.push(...(j.included || []));
    naeste = (j.links && j.links.next) || null;
  }
  return { data, included };
}
const kr = (oere) => (oere / 100).toFixed(2).replace(".", ",");
const tilOere = (pris) => { const n = Number(pris); return Number.isFinite(n) ? Math.round(n * 100) : null; };

// den pris, der gælder i dag i DNK, af en liste med priser (startDate/endDate) og deres prispunkter
function prisIDag(liste, punktRel) {
  const dnk = liste.data.filter((p) => ((p.relationships || {}).territory || {}).data && p.relationships.territory.data.id === TERRITORIUM);
  const gaelder = dnk.filter((p) => (!p.attributes.startDate || p.attributes.startDate <= IDAG) && (!p.attributes.endDate || p.attributes.endDate > IDAG))
    .sort((a, b) => String(b.attributes.startDate || "").localeCompare(String(a.attributes.startDate || "")));
  const senere = dnk.filter((p) => p.attributes.startDate && p.attributes.startDate > IDAG)
    .sort((a, b) => a.attributes.startDate.localeCompare(b.attributes.startDate));
  const punkt = (p) => {
    const rel = (p.relationships || {})[punktRel];
    const pp = rel && rel.data && liste.included.find((x) => x.id === rel.data.id && x.attributes && "customerPrice" in x.attributes);
    return pp ? tilOere(pp.attributes.customerPrice) : null;
  };
  if (gaelder.length) return { oere: punkt(gaelder[0]) };
  if (senere.length) return { oere: punkt(senere[0]), fra: senere[0].attributes.startDate };
  return { oere: null };
}

// ── appen og det, den har
async function appen() {
  const j = kraev(await kald("GET", "/v1/apps?filter[bundleId]=" + encodeURIComponent(BUNDLE) + "&limit=10"), [200], "GET /v1/apps");
  const a = (j.data || []).find((d) => d.attributes && d.attributes.bundleId === BUNDLE);
  if (!a) stop("appen " + BUNDLE + " findes ikke i App Store Connect");
  return a;
}
const koebene = async (appId) =>
  (await alle("/v1/apps/" + appId + "/inAppPurchasesV2?limit=200", "GET /v1/apps/{id}/inAppPurchasesV2")).data;
const grupperne = async (appId) =>
  (await alle("/v1/apps/" + appId + "/subscriptionGroups?limit=50", "GET /v1/apps/{id}/subscriptionGroups")).data;
const gruppensNavne = async (gruppeId) =>
  (await alle("/v1/subscriptionGroups/" + gruppeId + "/subscriptionGroupLocalizations?limit=50", "GET /v1/subscriptionGroups/{id}/subscriptionGroupLocalizations")).data;

// pris på et engangskøb i DNK — { oere, fra?, ukendt? , tekst }
async function iapPris(iapId) {
  const s = await kald("GET", "/v2/inAppPurchases/" + iapId + "/iapPriceSchedule");
  if (s.status === 404 || (s.status === 200 && !s.j.data)) return { oere: null, tekst: "ingen pris" };
  if (s.status !== 200) return { oere: null, ukendt: true, tekst: "pris ? (GET /v2/inAppPurchases/{id}/iapPriceSchedule svarede " + s.status + (s.fejl ? " — " + s.fejl : "") + ")" };
  const planId = s.j.data.id;
  // manuelle og automatiske priser læses begge og vurderes samlet — en pris, der gælder i dag, slår en senere
  const samlet = { data: [], included: [] };
  for (const art of ["manualPrices", "automaticPrices"]) {
    const r = await kald("GET", "/v1/inAppPurchasePriceSchedules/" + planId + "/" + art + "?include=inAppPurchasePricePoint,territory&limit=200");
    if (r.status !== 200) return { oere: null, ukendt: true, tekst: "pris ? (GET /v1/inAppPurchasePriceSchedules/{id}/" + art + " svarede " + r.status + (r.fejl ? " — " + r.fejl : "") + ")" };
    samlet.data.push(...(r.j.data || []));
    samlet.included.push(...(r.j.included || []));
    if (r.j.links && r.j.links.next) {
      const resten = await alle(r.j.links.next, "GET /v1/inAppPurchasePriceSchedules/{id}/" + art);
      samlet.data.push(...resten.data);
      samlet.included.push(...resten.included);
    }
  }
  const p = prisIDag(samlet, "inAppPurchasePricePoint");
  if (p.oere != null) return { ...p, tekst: kr(p.oere) + " DKK" + (p.fra ? " (fra " + p.fra + ")" : "") };
  // en prisplan med priser, hvor DNK ikke kan læses, røres ikke — en ny plan ville erstatte den
  if (samlet.data.length) return { oere: null, ukendt: true, tekst: "pris ? (prisplanen har " + samlet.data.length + " priser, men ingen DNK-pris kunne læses)" };
  return { oere: null, tekst: "ingen pris i DNK" };
}
// pris på et abonnement i DNK (kun læst)
async function aboPris(aboId) {
  const r = await kald("GET", "/v1/subscriptions/" + aboId + "/prices?include=subscriptionPricePoint,territory&limit=200");
  if (r.status !== 200) return "pris ? (GET /v1/subscriptions/{id}/prices svarede " + r.status + (r.fejl ? " — " + r.fejl : "") + ")";
  let liste = { data: r.j.data || [], included: r.j.included || [] };
  if (r.j.links && r.j.links.next) {
    const resten = await alle(r.j.links.next, "GET /v1/subscriptions/{id}/prices");
    liste = { data: liste.data.concat(resten.data), included: liste.included.concat(resten.included) };
  }
  const p = prisIDag(liste, "subscriptionPricePoint");
  return p.oere != null ? kr(p.oere) + " DKK" + (p.fra ? " (fra " + p.fra + ")" : "") : "ingen pris i DNK";
}
// det, der kun kan gøres i App Store Connect på pc'en (læst, ikke rettet): skærmbillede til review og tilgængelighed
async function hvadMangler(iapId) {
  const ud = [];
  const sk = await kald("GET", "/v2/inAppPurchases/" + iapId + "/appStoreReviewScreenshot");
  if (sk.status === 404 || (sk.status === 200 && !sk.j.data)) ud.push("skærmbillede til review mangler");
  else if (sk.status !== 200) ud.push("skærmbillede ? (" + sk.status + ")");
  const ti = await kald("GET", "/v2/inAppPurchases/" + iapId + "/inAppPurchaseAvailability");
  if (ti.status === 404 || (ti.status === 200 && !ti.j.data)) ud.push("tilgængelighed ikke sat");
  else if (ti.status !== 200) ud.push("tilgængelighed ? (" + ti.status + ")");
  return ud;
}

// ── handlingerne
async function status(app) {
  console.log("App: " + app.attributes.name + " · " + BUNDLE + " · id " + app.id);
  const fundne = [];
  const gs = await grupperne(app.id);
  console.log("Abonnementsgrupper: " + gs.length);
  for (const g of gs) {
    console.log("  · " + g.attributes.referenceName + " · id " + g.id);
    const navne = await gruppensNavne(g.id);
    if (!navne.length) console.log("      gruppens navn: ingen lokalisering");
    for (const l of navne) {
      console.log("      gruppens navn · " + l.attributes.locale + " · «" + l.attributes.name + "»"
        + (l.attributes.customAppName ? " · app-navn «" + l.attributes.customAppName + "»" : "")
        + " · " + (l.attributes.state || "?") + " · id " + l.id);
    }
    const abo = await alle("/v1/subscriptionGroups/" + g.id + "/subscriptions?limit=200", "GET /v1/subscriptionGroups/{id}/subscriptions");
    for (const s of abo.data) {
      const a = s.attributes;
      fundne.push(a.productId);
      console.log("      " + a.productId + " · abonnement (" + (a.subscriptionPeriod || "?") + ") · " + a.state
        + " · " + (await aboPris(s.id)) + " · «" + a.name + "» · id " + s.id);
    }
  }
  const iaps = await koebene(app.id);
  console.log("Engangskøb (in-app purchases v2): " + iaps.length);
  const pc = [];
  for (const k of iaps) {
    const a = k.attributes;
    fundne.push(a.productId);
    const p = await iapPris(k.id);
    const m = await hvadMangler(k.id);
    if (m.length) pc.push(a.productId + ": " + m.join(" · "));
    console.log("  · " + a.productId + " · " + a.inAppPurchaseType + " · " + a.state + " · " + p.tekst + " · «" + a.name + "» · id " + k.id);
  }
  const forventet = [...ABONNEMENTER, ...ENGANGSKOEB.map((k) => k.id)].map((x) => PRAEFIKS + x);
  const savnes = forventet.filter((id) => !fundne.includes(id));
  console.log("Produkter i alt: " + fundne.length + " · forventet " + forventet.length
    + (savnes.length ? " · mangler: " + savnes.join(" · ") : " · alle " + forventet.length + " findes"));
  if (pc.length) {
    console.log("Kræver App Store Connect på pc'en:");
    for (const l of pc) console.log("  · " + l);
  }
}

async function opret(app) {
  if (HAENDELSE !== "workflow_dispatch") stop("«opret» kører kun fra Actions → Run workflow (her: " + (HAENDELSE || "?") + ")");
  const iaps = await koebene(app.id);
  const ikkePrissat = [];

  // A · de seks engangskøb
  for (const k of ENGANGSKOEB) {
    const pid = PRAEFIKS + k.id;
    let iap = iaps.find((x) => x.attributes.productId === pid);
    if (iap && iap.attributes.inAppPurchaseType !== "CONSUMABLE") {
      console.log("⚠️ " + pid + " findes som " + iap.attributes.inAppPurchaseType + " (ikke CONSUMABLE) · id " + iap.id + " — røres ikke");
      continue;
    }
    if (iap) {
      console.log(pid + " findes allerede · id " + iap.id + " · " + iap.attributes.state);
    } else {
      const j = kraev(await kald("POST", "/v2/inAppPurchases", {
        data: {
          type: "inAppPurchases",
          attributes: { name: k.ref, productId: pid, inAppPurchaseType: "CONSUMABLE" },
          relationships: { app: { data: { type: "apps", id: app.id } } },
        },
      }), [201], "POST /v2/inAppPurchases (" + pid + ")");
      iap = j.data;
      console.log(pid + " er oprettet · id " + iap.id + " · " + iap.attributes.state);
    }

    // lokalisering da
    const lok = (await alle("/v2/inAppPurchases/" + iap.id + "/inAppPurchaseLocalizations?limit=50", "GET /v2/inAppPurchases/{id}/inAppPurchaseLocalizations")).data;
    const da = lok.find((l) => /^da/i.test(l.attributes.locale));
    if (da) {
      console.log("  · lokalisering " + da.attributes.locale + " findes allerede · «" + da.attributes.name + "» · «" + (da.attributes.description || "") + "»");
    } else {
      kraev(await kald("POST", "/v1/inAppPurchaseLocalizations", {
        data: {
          type: "inAppPurchaseLocalizations",
          attributes: { locale: "da", name: k.navn, description: k.tekst },
          relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: iap.id } } },
        },
      }), [201], "POST /v1/inAppPurchaseLocalizations (" + pid + ")");
      console.log("  · lokalisering da er oprettet · «" + k.navn + "» · «" + k.tekst + "»");
    }

    // pris — kun præcist; ellers de to nærmeste, og intet vælges
    const nu = await iapPris(iap.id);
    if (nu.ukendt) { console.log("  · ⚠️ prisen kunne ikke læses — sættes ikke · " + nu.tekst); ikkePrissat.push(pid + ": prisen kunne ikke læses"); continue; }
    if (nu.oere != null) {
      console.log("  · pris står der allerede: " + nu.tekst + (nu.oere === k.oere ? "" : " · ⚠️ ordren siger " + kr(k.oere) + " DKK — røres ikke"));
      continue;
    }
    const pp = await alle("/v2/inAppPurchases/" + iap.id + "/pricePoints?filter[territory]=" + TERRITORIUM + "&limit=200", "GET /v2/inAppPurchases/{id}/pricePoints");
    const punkter = pp.data.map((p) => ({ id: p.id, oere: tilOere(p.attributes.customerPrice) })).filter((p) => p.oere != null);
    const ram = punkter.find((p) => p.oere === k.oere);
    if (!ram) {
      const under = punkter.filter((p) => p.oere < k.oere).sort((a, b) => b.oere - a.oere)[0];
      const over = punkter.filter((p) => p.oere > k.oere).sort((a, b) => a.oere - b.oere)[0];
      const naermeste = (under ? kr(under.oere) : "—") + " og " + (over ? kr(over.oere) : "—") + " DKK";
      console.log("  · ⚠️ intet prispunkt i " + TERRITORIUM + " rammer " + kr(k.oere) + " DKK præcist (" + punkter.length + " prispunkter læst) — nærmeste: " + naermeste + " · prisen er IKKE sat");
      ikkePrissat.push(pid + ": " + kr(k.oere) + " DKK findes ikke — nærmeste " + naermeste);
      continue;
    }
    kraev(await kald("POST", "/v1/inAppPurchasePriceSchedules", {
      data: {
        type: "inAppPurchasePriceSchedules",
        relationships: {
          inAppPurchase: { data: { type: "inAppPurchases", id: iap.id } },
          baseTerritory: { data: { type: "territories", id: TERRITORIUM } },
          manualPrices: { data: [{ type: "inAppPurchasePrices", id: "${pris1}" }] },
        },
      },
      included: [{
        type: "inAppPurchasePrices",
        id: "${pris1}",
        attributes: { startDate: null },
        relationships: { inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: ram.id } } },
      }],
    }), [201], "POST /v1/inAppPurchasePriceSchedules (" + pid + ")");
    console.log("  · pris er sat: " + kr(k.oere) + " DKK · basisterritorium " + TERRITORIUM);
  }

  // B · abonnementsgruppens navn (da)
  const g = (await grupperne(app.id)).find((x) => x.id === GRUPPE_ID);
  if (!g) stop("abonnementsgruppen " + GRUPPE_ID + " findes ikke på appen");
  const navne = await gruppensNavne(g.id);
  const daNavn = navne.find((l) => /^da/i.test(l.attributes.locale));
  if (daNavn) {
    console.log("gruppen " + g.attributes.referenceName + " (id " + g.id + ") har allerede navnet «" + daNavn.attributes.name + "» på " + daNavn.attributes.locale);
  } else {
    const j = kraev(await kald("POST", "/v1/subscriptionGroupLocalizations", {
      data: {
        type: "subscriptionGroupLocalizations",
        attributes: { locale: "da", name: GRUPPE_NAVN },
        relationships: { subscriptionGroup: { data: { type: "subscriptionGroups", id: g.id } } },
      },
    }), [201], "POST /v1/subscriptionGroupLocalizations");
    console.log("gruppen " + g.attributes.referenceName + " (id " + g.id + ") har fået navnet «" + GRUPPE_NAVN + "» på da · id " + j.data.id);
  }

  if (ikkePrissat.length) {
    console.log("Ikke prissat (Nicolai vælger):");
    for (const l of ikkePrissat) console.log("  · " + l);
  }
  console.log("── status efter opret");
  await status(app);
}

const HANDLINGER = { "status": status, "opret": opret };
if (!HANDLINGER[HANDLING]) stop("ukendt handling «" + HANDLING + "» — brug " + Object.keys(HANDLINGER).join(" · "));
console.log("Handling: " + HANDLING + " · hændelse " + (HAENDELSE || "?"));
await HANDLINGER[HANDLING](await appen());
console.log("✅ " + HANDLING + " færdig");
