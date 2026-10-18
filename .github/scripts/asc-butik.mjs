// asc-butik.mjs v3 · butikken i App Store Connect (ordre-171026-03 · 17/10-2026 · v2 samme aften efter Apples 409 på whatsNew · v3 efter 409 på aldersmærket)
// v3: review-opslaget går gennem findes() (et 500 er en fejl, ikke «findes ikke») · aldersmærket bærer nu Nicolais svar på de to felter,
//     Apple krævede (gunsOrOtherWeapons · healthOrWellnessTopics) — typerne måles levende: PATCH → GET → sammenlign; et 409 stopper.
// v2: «nyt i denne version» sendes KUN, når appen har en tidligere version i butikken (Apple: STATE_ERROR på den første) · Apples
//     tegn-lofter måles på butik.json, FØR noget skrives · et opslag, der hverken er 200 eller 404, stopper (det er ikke «findes ikke») ·
//     uden demo-konto sendes noterne uden demo-afsnittet (notesUdenDemo) · «byg» sætter bygget på FØR versionen omdøbes, og et byg uden
//     processingState afvises · kontaktens mail og demo-navnet står aldrig i loggen.
// Butikssiden, aldersmærket, review-oplysningerne, produkternes metadata og bygget på versionen — gennem App Store Connect API'et,
// med den nøgle, ios.yml, testflight-grupper.mjs og asc-koeb.mjs allerede bruger, og efter samme mønster.
// Handlinger (HANDLING): status · tekster · alder · produkter · billeder · review · byg · alt (= tekster alder produkter billeder review)
// Reglerne: ingen DELETE · intet sendes til review (ingen *Submissions) · PATCH kun på de stier, der står i PATCH_TILLADT ·
//           det, der findes, ændres kun, når det er en TEKST (tekster, alder, review) — billeder, der allerede ligger, røres ikke ·
//           nøglen og token'et skrives ALDRIG i loggen · hvert udfald sin egen linje · «status» skriver kun.
// Kilden til alt, der skrives: butik/butik.json. Billederne: butik/skud/61/ (skudt af vaerktoej-butik-skud.js).
// Princip 89: aldersmærket sættes KUN på de felter, Apple viser i den levende erklæring (GET først) — et felt, vi kender, men Apple
//             ikke viser, skrives som sin egen linje, og et felt, Apple viser, men vi ikke har svaret på, ligeså.
// Node 20, ingen pakker.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const E = process.env;
const BASE = E.ASC_BASE || "https://api.appstoreconnect.apple.com";   // ASC_BASE: kun prøvens stub-server
const BUNDLE = "com.sportsainalytics.streaktennis";
const PRAEFIKS = BUNDLE + ".";
const HANDLING = (E.HANDLING || "").trim();
const HAENDELSE = (E.GITHUB_EVENT_NAME || "").trim();
const BUTIK = JSON.parse(fs.readFileSync("butik/butik.json", "utf8"));

const stop = (hvor, detalje) => { console.log("⛔ " + hvor + (detalje ? " — " + detalje : "")); process.exit(3); };
for (const k of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8_BASE64"]) if (!E[k]) stop("miljøet mangler " + k);

// ── token (ES256, højst 20 minutter); maskeres, så det aldrig kan stå i loggen
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
for (const k of ["DEMO_BRUGER", "DEMO_KODE"]) if (E[k]) console.log("::add-mask::" + E[k]);

// ── ét kald; en fejl siger status + Apples errors[].code + errors[].detail (aldrig token'et, aldrig headere)
const SPAERRET = /(inAppPurchaseSubmissions|subscriptionSubmissions|subscriptionGroupSubmissions|reviewSubmissions|appStoreVersionSubmissions|betaAppReviewSubmissions|appStoreVersionReleaseRequests)/i;
const PATCH_TILLADT = /^\/v1\/(appInfoLocalizations|appStoreVersionLocalizations|ageRatingDeclarations|appStoreReviewDetails|appScreenshots|inAppPurchaseAppStoreReviewScreenshots|subscriptionAppStoreReviewScreenshots|appStoreVersions|appInfos)\/[^/]+$/;
async function kald(metode, sti, body) {
  if (metode === "DELETE") stop("DELETE er spærret i dette værktøj");
  if (SPAERRET.test(sti)) stop("review er spærret i dette værktøj");
  if (metode === "PATCH" && !PATCH_TILLADT.test(sti.replace(BASE, "").split("?")[0])) stop("PATCH på " + sti.replace(BASE, "").split("?")[0] + " er ikke tilladt i dette værktøj");
  let r;
  try {
    r = await fetch(sti.startsWith("http") ? sti : BASE + sti, {
      method: metode, headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { stop(metode + " " + sti.replace(BASE, "").split("?")[0] + " nåede ikke frem", String(e.message || e)); }
  const tekst = await r.text();
  let j = {}; try { j = tekst ? JSON.parse(tekst) : {}; } catch (e) {}
  return { status: r.status, j, fejl: (j.errors || []).map((x) => x.code + ": " + (x.detail || x.title || "")).join(" · ") };
}
const kraev = (svar, ok, hvad) => {
  if (!ok.includes(svar.status)) {
    const hint = svar.status === 401 ? " (nøgle-id, issuer-id eller .p8 passer ikke sammen)" : svar.status === 403 ? " (nøglens rolle må ikke dette)" : "";
    stop(hvad + " svarede " + svar.status + hint, svar.fejl);
  }
  return svar.j;
};
async function alle(sti, hvad) {
  const data = [], included = []; let naeste = sti;
  for (let side = 0; naeste && side < 40; side++) {
    const j = kraev(await kald("GET", naeste), [200], hvad);
    data.push(...(j.data || [])); included.push(...(j.included || []));
    naeste = (j.links && j.links.next) || null;
  }
  return { data, included };
}
const kort = (s, n) => { s = String(s == null ? "" : s).replace(/\s+/g, " "); return s.length > (n || 70) ? s.slice(0, n || 70) + "…" : s; };
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");

// ── upload af et billede: reservation → PUT-delene → «uploaded» + md5. Samme tre skridt for alle Apples billedtyper.
async function upload(type, sti, fil, rel) {
  const bytes = fs.readFileSync(fil);
  const res = kraev(await kald("POST", sti, { data: { type, attributes: { fileName: path.basename(fil), fileSize: bytes.length }, relationships: rel } }), [201], "POST " + sti);
  const ops = (res.data.attributes || {}).uploadOperations || [];
  if (!ops.length) stop("POST " + sti + " gav ingen uploadOperations");
  for (const op of ops) {
    const h = {}; for (const x of op.requestHeaders || []) h[x.name] = x.value;
    const del = bytes.subarray(op.offset, op.offset + op.length);
    let r; try { r = await fetch(op.url, { method: op.method || "PUT", headers: h, body: del }); } catch (e) { stop("upload af " + path.basename(fil) + " nåede ikke frem", String(e.message || e)); }
    if (r.status < 200 || r.status > 299) stop("upload af " + path.basename(fil) + " (del ved " + op.offset + ") svarede " + r.status);
  }
  const faerdig = kraev(await kald("PATCH", "/v1/" + type + "/" + res.data.id, { data: { type, id: res.data.id, attributes: { uploaded: true, sourceFileChecksum: md5(bytes) } } }), [200], "PATCH /v1/" + type + "/{id}");
  return { id: res.data.id, state: ((faerdig.data.attributes || {}).assetDeliveryState || {}).state || "?" };
}

// ── appen, dens info og dens version
async function appen() {
  const j = kraev(await kald("GET", "/v1/apps?filter[bundleId]=" + encodeURIComponent(BUNDLE) + "&limit=10"), [200], "GET /v1/apps");
  const a = (j.data || []).find((d) => d.attributes && d.attributes.bundleId === BUNDLE);
  if (!a) stop("appen " + BUNDLE + " findes ikke i App Store Connect");
  return a;
}
async function appInfoen(app) {
  const infos = (await alle("/v1/apps/" + app.id + "/appInfos?limit=10", "GET /v1/apps/{id}/appInfos")).data;
  // den, der kan redigeres: ikke den, der allerede er i butikken
  const redigerbar = infos.filter((i) => !/READY_FOR_DISTRIBUTION|REPLACED_WITH_NEW_INFO/.test(i.attributes.state || ""));
  const i = redigerbar[0] || infos[0];
  if (!i) stop("appen har ingen appInfo");
  return i;
}
async function versionerne(app) { return (await alle("/v1/apps/" + app.id + "/appStoreVersions?filter[platform]=IOS&limit=20", "GET /v1/apps/{id}/appStoreVersions")).data; }
// en tidligere udgave = en version, der ikke er den åbne, og som er eller har været i butikken
const TIDLIGERE = /READY_FOR_SALE|REPLACED_WITH_NEW_VERSION|REMOVED_FROM_SALE|PENDING_DEVELOPER_RELEASE|PENDING_APPLE_RELEASE|PROCESSING_FOR_APP_STORE|IN_REVIEW|WAITING_FOR_REVIEW|READY_FOR_REVIEW/;
async function versionen(app) {
  const vs = await versionerne(app);
  const aaben = vs.filter((v) => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED|INVALID_BINARY|WAITING_FOR_REVIEW|READY_FOR_REVIEW/.test(v.attributes.appStoreState || v.attributes.appVersionState || ""));
  const v = aaben[0];
  if (!v) stop("ingen åben App Store-version (PREPARE_FOR_SUBMISSION) — opret 1.0 i App Store Connect først; værktøjet opretter ikke versioner");
  return v;
}
const vState = (v) => v.attributes.appStoreState || v.attributes.appVersionState || "?";

// ── LOFTERNE — måles på butik.json, før noget skrives (hvert brud sin egen linje; ét brud stopper alt)
const LOFT = { name: 30, subtitle: 30, promotionalText: 170, description: 4000, keywords: 100, whatsNew: 4000 };
function lofterne() {
  const brud = [];
  const tjek = (hvad, tekst, loft) => { const n = String(tekst == null ? "" : tekst).length; if (n > loft) brud.push(hvad + ": " + n + " tegn (loft " + loft + ")"); };
  for (const [locale, t] of Object.entries(BUTIK.tekster || {})) for (const [k, loft] of Object.entries(LOFT)) tjek("tekster." + locale + "." + k, t[k], loft);
  for (const [k, a] of Object.entries((BUTIK.produkter || {}).abonnementer_da || {})) { tjek("abonnement " + k + " name", a.name, 30); tjek("abonnement " + k + " description", a.description, 45); }
  if (BUTIK.review) { tjek("review.notes", BUTIK.review.notes, 4000); tjek("review.notesUdenDemo", BUTIK.review.notesUdenDemo, 4000); }
  for (const b of brud) console.log("⛔ loft: " + b);
  if (brud.length) stop(brud.length + " tekst(er) i butik.json er over Apples loft — intet skrevet");
  console.log("lofterne målt på butik.json: alle tekster under Apples grænser");
}
// et opslag: 200 med data = findes · 404 (eller 200 uden data) = findes ikke · alt andet er en FEJL, ikke et «findes ikke»
const findes = (r, hvad) => { if (r.status === 200 && r.j.data) return true; if (r.status === 404 || (r.status === 200 && !r.j.data)) return false; stop(hvad + " svarede " + r.status, r.fejl); };

// ── STATUS — læser alt, ændrer intet
async function status(app) {
  console.log("App: " + app.attributes.name + " · " + BUNDLE + " · id " + app.id + " · primaryLocale " + (app.attributes.primaryLocale || "?"));
  const info = await appInfoen(app);
  console.log("appInfo: id " + info.id + " · " + (info.attributes.state || "?"));
  const kat = await kald("GET", "/v1/appInfos/" + info.id + "?include=primaryCategory,secondaryCategory");
  if (kat.status === 200) {
    const rel = kat.j.data.relationships || {};
    console.log("  kategorier: " + (((rel.primaryCategory || {}).data || {}).id || "ingen") + " · " + (((rel.secondaryCategory || {}).data || {}).id || "ingen"));
  }
  const il = (await alle("/v1/appInfos/" + info.id + "/appInfoLocalizations?limit=50", "GET /v1/appInfos/{id}/appInfoLocalizations")).data;
  for (const l of il) console.log("  info · " + l.attributes.locale + " · navn «" + l.attributes.name + "» · undertitel «" + (l.attributes.subtitle || "") + "» · privatliv " + (l.attributes.privacyPolicyUrl || "ingen") + " · id " + l.id);
  const ald = await kald("GET", "/v1/appInfos/" + info.id + "/ageRatingDeclaration");
  if (ald.status === 200 && ald.j.data) {
    console.log("  aldersmærket (id " + ald.j.data.id + ") — Apples felter, som de står nu:");
    for (const [k, v] of Object.entries(ald.j.data.attributes || {})) console.log("    " + k + " = " + JSON.stringify(v));
  } else console.log("  aldersmærket: kunne ikke læses (" + ald.status + (ald.fejl ? " — " + ald.fejl : "") + ")");
  const v = await versionen(app);
  console.log("version: " + v.attributes.versionString + " · " + vState(v) + " · copyright «" + (v.attributes.copyright || "") + "» · release " + (v.attributes.releaseType || "?") + " · id " + v.id);
  const byg = await kald("GET", "/v1/appStoreVersions/" + v.id + "/build");
  console.log("  byg på versionen: " + (byg.status === 200 && byg.j.data ? byg.j.data.attributes.version + " (" + byg.j.data.id + ")" : "intet"));
  const vl = (await alle("/v1/appStoreVersions/" + v.id + "/appStoreVersionLocalizations?limit=50", "GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations")).data;
  for (const l of vl) {
    const a = l.attributes;
    console.log("  tekst · " + a.locale + " · beskrivelse " + (a.description || "").length + " tegn · nøgleord «" + (a.keywords || "") + "» · promo " + (a.promotionalText || "").length + " · support " + (a.supportUrl || "ingen") + " · id " + l.id);
    const sets = (await alle("/v1/appStoreVersionLocalizations/" + l.id + "/appScreenshotSets?limit=50", "GET …/appScreenshotSets")).data;
    for (const s of sets) {
      const sk = (await alle("/v1/appScreenshotSets/" + s.id + "/appScreenshots?limit=50", "GET …/appScreenshots")).data;
      console.log("    billeder · " + s.attributes.screenshotDisplayType + " · " + sk.length + " stk" + (sk.length ? " (" + sk.map((x) => x.attributes.fileName + " " + (((x.attributes.assetDeliveryState || {}).state) || "?")).join(", ") + ")" : ""));
    }
  }
  const rd = await kald("GET", "/v1/appStoreVersions/" + v.id + "/appStoreReviewDetail");
  if (rd.status === 200 && rd.j.data) {
    const a = rd.j.data.attributes;
    console.log("  review: kontakt " + (a.contactFirstName && a.contactEmail ? "sat" : "mangler") + " · demo " + (a.demoAccountRequired ? "kræves (" + (a.demoAccountName ? "navn sat" : "intet navn") + ")" : "kræves ikke") + " · noter " + (a.notes || "").length + " tegn · id " + rd.j.data.id);
  } else console.log("  review: ingen oplysninger endnu");
  await produktStatus(app);
}
async function produktStatus(app) {
  const gs = (await alle("/v1/apps/" + app.id + "/subscriptionGroups?limit=50", "GET /v1/apps/{id}/subscriptionGroups")).data;
  for (const g of gs) {
    const abo = (await alle("/v1/subscriptionGroups/" + g.id + "/subscriptions?limit=200", "GET …/subscriptions")).data;
    for (const s of abo) {
      const m = [];
      const sk = await kald("GET", "/v1/subscriptions/" + s.id + "/appStoreReviewScreenshot");
      if (sk.status === 404 || (sk.status === 200 && !sk.j.data)) m.push("review-billede mangler"); else if (sk.status !== 200) m.push("review-billede ? (" + sk.status + ")");
      const ti = await kald("GET", "/v1/subscriptions/" + s.id + "/subscriptionAvailability");
      if (ti.status === 404 || (ti.status === 200 && !ti.j.data)) m.push("tilgængelighed ikke sat"); else if (ti.status !== 200) m.push("tilgængelighed ? (" + ti.status + ")");
      const lok = (await alle("/v1/subscriptions/" + s.id + "/subscriptionLocalizations?limit=50", "GET …/subscriptionLocalizations")).data;
      if (!lok.length) m.push("ingen lokalisering");
      console.log("abonnement · " + s.attributes.productId + " · " + s.attributes.state + " · " + (m.length ? m.join(" · ") : "komplet") + " · id " + s.id);
    }
  }
  const iaps = (await alle("/v1/apps/" + app.id + "/inAppPurchasesV2?limit=200", "GET /v1/apps/{id}/inAppPurchasesV2")).data;
  for (const k of iaps) {
    const m = [];
    const sk = await kald("GET", "/v2/inAppPurchases/" + k.id + "/appStoreReviewScreenshot");
    if (sk.status === 404 || (sk.status === 200 && !sk.j.data)) m.push("review-billede mangler"); else if (sk.status !== 200) m.push("review-billede ? (" + sk.status + ")");
    const ti = await kald("GET", "/v2/inAppPurchases/" + k.id + "/inAppPurchaseAvailability");
    if (ti.status === 404 || (ti.status === 200 && !ti.j.data)) m.push("tilgængelighed ikke sat"); else if (ti.status !== 200) m.push("tilgængelighed ? (" + ti.status + ")");
    console.log("engangskøb · " + k.attributes.productId + " · " + k.attributes.state + " · " + (m.length ? m.join(" · ") : "komplet") + " · id " + k.id);
  }
}

// ── TEKSTER — navn, undertitel, privatliv (appInfo) · beskrivelse, nøgleord, promo, support, marketing, nyt (version) · kategorier · copyright/release
async function tekster(app) {
  lofterne();
  const info = await appInfoen(app);
  const K = BUTIK.kategorier || {};
  if (K.primaer) {
    const rel = { primaryCategory: { data: { type: "appCategories", id: K.primaer } } };
    if (K.sekundaer) rel.secondaryCategory = { data: { type: "appCategories", id: K.sekundaer } };
    kraev(await kald("PATCH", "/v1/appInfos/" + info.id, { data: { type: "appInfos", id: info.id, relationships: rel } }), [200], "PATCH /v1/appInfos/{id} (kategorier)");
    console.log("kategorier sat: " + K.primaer + (K.sekundaer ? " · " + K.sekundaer : ""));
  }
  const il = (await alle("/v1/appInfos/" + info.id + "/appInfoLocalizations?limit=50", "GET …/appInfoLocalizations")).data;
  for (const [locale, t] of Object.entries(BUTIK.tekster)) {
    const attr = { name: t.name, subtitle: t.subtitle, privacyPolicyUrl: t.privacyPolicyUrl };
    const l = il.find((x) => x.attributes.locale === locale);
    if (l) { kraev(await kald("PATCH", "/v1/appInfoLocalizations/" + l.id, { data: { type: "appInfoLocalizations", id: l.id, attributes: attr } }), [200], "PATCH /v1/appInfoLocalizations/{id} (" + locale + ")"); console.log("info · " + locale + " rettet: «" + t.name + "» · «" + t.subtitle + "»"); }
    else { kraev(await kald("POST", "/v1/appInfoLocalizations", { data: { type: "appInfoLocalizations", attributes: { locale, ...attr }, relationships: { appInfo: { data: { type: "appInfos", id: info.id } } } } }), [201], "POST /v1/appInfoLocalizations (" + locale + ")"); console.log("info · " + locale + " oprettet: «" + t.name + "» · «" + t.subtitle + "»"); }
  }
  const v = await versionen(app);
  const V = BUTIK.version || {};
  const vattr = {}; if (V.copyright) vattr.copyright = V.copyright; if (V.releaseType) vattr.releaseType = V.releaseType;
  if (Object.keys(vattr).length) { kraev(await kald("PATCH", "/v1/appStoreVersions/" + v.id, { data: { type: "appStoreVersions", id: v.id, attributes: vattr } }), [200], "PATCH /v1/appStoreVersions/{id} (copyright/release)"); console.log("version " + v.attributes.versionString + ": copyright «" + (V.copyright || "") + "» · release " + (V.releaseType || "")); }
  const tidligere = (await versionerne(app)).filter((x) => x.id !== v.id && TIDLIGERE.test(vState(x)));
  if (!tidligere.length) console.log("nyt i denne version springes over: " + v.attributes.versionString + " er appens første udgave (Apple tillader ikke feltet dér)");
  const vl = (await alle("/v1/appStoreVersions/" + v.id + "/appStoreVersionLocalizations?limit=50", "GET …/appStoreVersionLocalizations")).data;
  for (const [locale, t] of Object.entries(BUTIK.tekster)) {
    const attr = { description: t.description, keywords: t.keywords, promotionalText: t.promotionalText, supportUrl: t.supportUrl, marketingUrl: t.marketingUrl };
    if (tidligere.length && t.whatsNew) attr.whatsNew = t.whatsNew;
    const l = vl.find((x) => x.attributes.locale === locale);
    if (l) { kraev(await kald("PATCH", "/v1/appStoreVersionLocalizations/" + l.id, { data: { type: "appStoreVersionLocalizations", id: l.id, attributes: attr } }), [200], "PATCH /v1/appStoreVersionLocalizations/{id} (" + locale + ")"); console.log("tekst · " + locale + " rettet: beskrivelse " + t.description.length + " tegn · nøgleord " + t.keywords.length + " tegn"); }
    else { kraev(await kald("POST", "/v1/appStoreVersionLocalizations", { data: { type: "appStoreVersionLocalizations", attributes: { locale, ...attr }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } } }), [201], "POST /v1/appStoreVersionLocalizations (" + locale + ")"); console.log("tekst · " + locale + " oprettet: beskrivelse " + t.description.length + " tegn · nøgleord " + t.keywords.length + " tegn"); }
  }
}

// ── ALDER — kun de felter, Apple viser (89)
async function alder(app) {
  const info = await appInfoen(app);
  const ald = kraev(await kald("GET", "/v1/appInfos/" + info.id + "/ageRatingDeclaration"), [200], "GET /v1/appInfos/{id}/ageRatingDeclaration");
  if (!ald.data) stop("appen har ingen aldersmærkning at rette");
  const levende = ald.data.attributes || {};
  const svar = {}; const ukendte = []; const ubesvarede = [];
  for (const [k, v] of Object.entries(BUTIK.alder)) { if (k.startsWith("_")) continue; if (k in levende) svar[k] = v; else ukendte.push(k); }
  for (const k of Object.keys(levende)) if (!(k in BUTIK.alder)) ubesvarede.push(k + " = " + JSON.stringify(levende[k]));
  for (const k of ukendte) console.log("  · feltet " + k + " findes ikke i Apples erklæring — ikke sat");
  for (const l of ubesvarede) console.log("  · Apple viser et felt, vi ikke har svaret på: " + l + " (urørt)");
  if (!Object.keys(svar).length) stop("ingen af vores felter findes i Apples erklæring");
  const r = await kald("PATCH", "/v1/ageRatingDeclarations/" + ald.data.id, { data: { type: "ageRatingDeclarations", id: ald.data.id, attributes: svar } });
  if (r.status !== 200) stop("PATCH /v1/ageRatingDeclarations/{id} svarede " + r.status, r.fejl);
  console.log("aldersmærket sat (" + Object.keys(svar).length + " felter): " + Object.entries(svar).map(([k, v]) => k + "=" + JSON.stringify(v)).join(" · "));
  const efter = kraev(await kald("GET", "/v1/appInfos/" + info.id + "/ageRatingDeclaration"), [200], "GET …/ageRatingDeclaration (efter)");
  const afvig = Object.entries(svar).filter(([k, v]) => JSON.stringify((efter.data.attributes || {})[k]) !== JSON.stringify(v));
  if (afvig.length) stop("aldersmærket står ikke, som det blev sat: " + afvig.map(([k]) => k + "=" + JSON.stringify(efter.data.attributes[k])).join(" · "));
  console.log("aldersmærket målt efter: alle " + Object.keys(svar).length + " felter står, som de blev sat");
}

// ── PRODUKTER — review-billede + tilgængelighed pr. produkt, lokalisering på abonnementerne
async function territorier() {
  if (!(BUTIK.produkter || {}).alle_lande) return [{ type: "territories", id: "DNK" }];
  const t = (await alle("/v1/territories?limit=200", "GET /v1/territories")).data;
  if (!t.length) stop("GET /v1/territories gav ingen lande");
  return t.map((x) => ({ type: "territories", id: x.id }));
}
async function produkter(app) {
  lofterne();
  const P = BUTIK.produkter; const lande = await territorier();
  console.log("tilgængelighed: " + lande.length + " lande" + (P.alle_lande ? " + nye lande automatisk" : ""));
  const fil = (pid) => { const f = P.billede[pid.replace(PRAEFIKS, "")]; if (!f) return null; const sti = path.join(P.mappe, f); if (!fs.existsSync(sti)) stop("billedet " + sti + " findes ikke"); return sti; };
  const gs = (await alle("/v1/apps/" + app.id + "/subscriptionGroups?limit=50", "GET …/subscriptionGroups")).data;
  for (const g of gs) {
    const abo = (await alle("/v1/subscriptionGroups/" + g.id + "/subscriptions?limit=200", "GET …/subscriptions")).data;
    for (const s of abo) {
      const pid = s.attributes.productId; const kortId = pid.replace(PRAEFIKS, "");
      const lok = (await alle("/v1/subscriptions/" + s.id + "/subscriptionLocalizations?limit=50", "GET …/subscriptionLocalizations")).data;
      const da = (P.abonnementer_da || {})[kortId];
      if (da && !lok.find((l) => /^da/i.test(l.attributes.locale))) {
        kraev(await kald("POST", "/v1/subscriptionLocalizations", { data: { type: "subscriptionLocalizations", attributes: { locale: "da", name: da.name, description: da.description }, relationships: { subscription: { data: { type: "subscriptions", id: s.id } } } } }), [201], "POST /v1/subscriptionLocalizations (" + pid + ")");
        console.log(pid + " · lokalisering da oprettet: «" + da.name + "»");
      } else console.log(pid + " · lokalisering: " + (lok.length ? lok.map((l) => l.attributes.locale).join(", ") + " findes" : "ingen, og ingen tekst i butik.json"));
      const sk = await kald("GET", "/v1/subscriptions/" + s.id + "/appStoreReviewScreenshot");
      if (findes(sk, "GET /v1/subscriptions/{id}/appStoreReviewScreenshot (" + pid + ")")) console.log(pid + " · review-billede findes allerede (" + (sk.j.data.attributes.fileName || "") + ") — røres ikke");
      else { const f = fil(pid); if (!f) console.log(pid + " · intet billede i butik.json — ikke sat"); else { const u = await upload("subscriptionAppStoreReviewScreenshots", "/v1/subscriptionAppStoreReviewScreenshots", f, { subscription: { data: { type: "subscriptions", id: s.id } } }); console.log(pid + " · review-billede lagt op: " + path.basename(f) + " · " + u.state); } }
      const ti = await kald("GET", "/v1/subscriptions/" + s.id + "/subscriptionAvailability");
      if (findes(ti, "GET /v1/subscriptions/{id}/subscriptionAvailability (" + pid + ")")) console.log(pid + " · tilgængelighed findes allerede — røres ikke");
      else { kraev(await kald("POST", "/v1/subscriptionAvailabilities", { data: { type: "subscriptionAvailabilities", attributes: { availableInNewTerritories: !!P.alle_lande }, relationships: { subscription: { data: { type: "subscriptions", id: s.id } }, availableTerritories: { data: lande } } } }), [201], "POST /v1/subscriptionAvailabilities (" + pid + ")"); console.log(pid + " · tilgængelighed sat: " + lande.length + " lande"); }
    }
  }
  const iaps = (await alle("/v1/apps/" + app.id + "/inAppPurchasesV2?limit=200", "GET …/inAppPurchasesV2")).data;
  for (const k of iaps) {
    const pid = k.attributes.productId;
    const sk = await kald("GET", "/v2/inAppPurchases/" + k.id + "/appStoreReviewScreenshot");
    if (findes(sk, "GET /v2/inAppPurchases/{id}/appStoreReviewScreenshot (" + pid + ")")) console.log(pid + " · review-billede findes allerede (" + (sk.j.data.attributes.fileName || "") + ") — røres ikke");
    else { const f = fil(pid); if (!f) console.log(pid + " · intet billede i butik.json — ikke sat"); else { const u = await upload("inAppPurchaseAppStoreReviewScreenshots", "/v1/inAppPurchaseAppStoreReviewScreenshots", f, { inAppPurchaseV2: { data: { type: "inAppPurchases", id: k.id } } }); console.log(pid + " · review-billede lagt op: " + path.basename(f) + " · " + u.state); } }
    const ti = await kald("GET", "/v2/inAppPurchases/" + k.id + "/inAppPurchaseAvailability");
    if (findes(ti, "GET /v2/inAppPurchases/{id}/inAppPurchaseAvailability (" + pid + ")")) console.log(pid + " · tilgængelighed findes allerede — røres ikke");
    else { kraev(await kald("POST", "/v1/inAppPurchaseAvailabilities", { data: { type: "inAppPurchaseAvailabilities", attributes: { availableInNewTerritories: !!P.alle_lande }, relationships: { inAppPurchase: { data: { type: "inAppPurchases", id: k.id } }, availableTerritories: { data: lande } } } }), [201], "POST /v1/inAppPurchaseAvailabilities (" + pid + ")"); console.log(pid + " · tilgængelighed sat: " + lande.length + " lande"); }
  }
  console.log("── produkterne efter:"); await produktStatus(app);
}

// ── BILLEDER — butikkens seks billeder pr. sprog (kun hvor sættet er tomt; intet slettes)
async function billeder(app) {
  const B = BUTIK.billeder; const v = await versionen(app);
  for (const f of B.raekkefoelge) if (!fs.existsSync(path.join(B.mappe, f))) stop("billedet " + path.join(B.mappe, f) + " findes ikke — kør vaerktoej-butik-skud.js først");
  const vl = (await alle("/v1/appStoreVersions/" + v.id + "/appStoreVersionLocalizations?limit=50", "GET …/appStoreVersionLocalizations")).data;
  for (const locale of B.locales) {
    const l = vl.find((x) => x.attributes.locale === locale);
    if (!l) { console.log(locale + ": ingen tekst-lokalisering endnu — kør «tekster» først; billeder ikke sat"); continue; }
    const sets = (await alle("/v1/appStoreVersionLocalizations/" + l.id + "/appScreenshotSets?limit=50", "GET …/appScreenshotSets")).data;
    let set = sets.find((s) => s.attributes.screenshotDisplayType === B.displayType);
    if (!set) { set = kraev(await kald("POST", "/v1/appScreenshotSets", { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: B.displayType }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: l.id } } } } }), [201], "POST /v1/appScreenshotSets (" + locale + ")").data; console.log(locale + " · sæt " + B.displayType + " oprettet"); }
    const har = (await alle("/v1/appScreenshotSets/" + set.id + "/appScreenshots?limit=50", "GET …/appScreenshots")).data;
    if (har.length) { console.log(locale + " · " + B.displayType + " har allerede " + har.length + " billeder — røres ikke (værktøjet sletter ikke; byt dem på pc'en, eller slet sættet dér, og kør igen)"); continue; }
    for (const f of B.raekkefoelge) { const u = await upload("appScreenshots", "/v1/appScreenshots", path.join(B.mappe, f), { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } }); console.log(locale + " · " + f + " lagt op · " + u.state); }
    const efter = (await alle("/v1/appScreenshotSets/" + set.id + "/appScreenshots?limit=50", "GET …/appScreenshots (efter)")).data;
    console.log(locale + " · " + B.displayType + " har nu " + efter.length + " billeder");
  }
}

// ── REVIEW — kontakt, demo-konto (fra miljøet), noter
async function review(app) {
  lofterne();
  const R = BUTIK.review; const v = await versionen(app);
  const attr = { contactFirstName: R.contactFirstName, contactLastName: R.contactLastName, contactPhone: R.contactPhone, contactEmail: R.contactEmail, notes: R.notes, demoAccountRequired: !!R.demoAccountRequired };
  if (R.demoAccountRequired) {
    if (!E.DEMO_BRUGER || !E.DEMO_KODE) {
      if (!R.notesUdenDemo) stop("demo-kontoen mangler i miljøet, og butik.json har ingen notesUdenDemo — noterne ville love en konto, der ikke findes");
      console.log("  · demo-kontoen (DEMO_BRUGER/DEMO_KODE) mangler i miljøet — kontakt sættes, noterne UDEN demo-afsnittet (notesUdenDemo); demo-konto IKKE sat");
      attr.demoAccountRequired = false; attr.notes = R.notesUdenDemo;
    }
    else { attr.demoAccountName = E.DEMO_BRUGER; attr.demoAccountPassword = E.DEMO_KODE; }
  }
  const rd = await kald("GET", "/v1/appStoreVersions/" + v.id + "/appStoreReviewDetail");
  if (findes(rd, "GET /v1/appStoreVersions/{id}/appStoreReviewDetail")) { kraev(await kald("PATCH", "/v1/appStoreReviewDetails/" + rd.j.data.id, { data: { type: "appStoreReviewDetails", id: rd.j.data.id, attributes: attr } }), [200], "PATCH /v1/appStoreReviewDetails/{id}"); console.log("review-oplysninger rettet"); }
  else { kraev(await kald("POST", "/v1/appStoreReviewDetails", { data: { type: "appStoreReviewDetails", attributes: attr, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: v.id } } } } }), [201], "POST /v1/appStoreReviewDetails"); console.log("review-oplysninger oprettet"); }
  console.log("  kontakt " + attr.contactFirstName + " " + attr.contactLastName + " (mail og telefon sat) · demo " + (attr.demoAccountRequired ? "sat (navn maskeret)" : "ikke sat") + " · noter " + attr.notes.length + " tegn");
}

// ── BYG — sæt TestFlight-bygget på versionen (BYG = byggenummeret); versionsstrengen følger bygget
async function byg(app) {
  const nr = (E.BYG || "").trim(); if (!/^\d+$/.test(nr)) stop("BYG mangler eller er ikke et tal (byggenummeret, fx 60)");
  const j = kraev(await kald("GET", "/v1/builds?filter[app]=" + app.id + "&filter[version]=" + nr + "&include=preReleaseVersion&limit=10"), [200], "GET /v1/builds");
  const b = (j.data || [])[0];
  if (!b) stop("byg " + nr + " findes ikke på appen");
  const pre = (j.included || []).find((x) => x.type === "preReleaseVersions");
  const kortVersion = pre ? pre.attributes.version : null;
  console.log("byg " + nr + ": id " + b.id + " · " + (b.attributes.processingState || "?") + " · version " + (kortVersion || "?") + (b.attributes.expired ? " · UDLØBET" : ""));
  if (!b.attributes.processingState) stop("byg " + nr + " har ingen processingState i Apples svar — ikke sat på");
  if (b.attributes.processingState !== "VALID") stop("byg " + nr + " er " + b.attributes.processingState + " — ikke VALID");
  const v = await versionen(app);
  kraev(await kald("PATCH", "/v1/appStoreVersions/" + v.id, { data: { type: "appStoreVersions", id: v.id, relationships: { build: { data: { type: "builds", id: b.id } } } } }), [200], "PATCH /v1/appStoreVersions/{id} (build)");
  const efter = await kald("GET", "/v1/appStoreVersions/" + v.id + "/build");
  const staar = efter.status === 200 && efter.j.data && efter.j.data.id === b.id;
  if (!staar) stop("bygget står ikke på versionen efter PATCH");
  console.log("byg " + nr + " sat på versionen " + v.attributes.versionString + " — målt efter");
  if (kortVersion && v.attributes.versionString !== kortVersion) {
    kraev(await kald("PATCH", "/v1/appStoreVersions/" + v.id, { data: { type: "appStoreVersions", id: v.id, attributes: { versionString: kortVersion } } }), [200], "PATCH /v1/appStoreVersions/{id} (versionString)");
    console.log("versionen omdøbt " + v.attributes.versionString + " → " + kortVersion + " (byggets version)");
  }
  console.log("byg " + nr + " står på versionen " + (kortVersion || v.attributes.versionString) + " — målt efter");
}

async function alt(app) { for (const h of [tekster, alder, produkter, billeder, review]) { console.log("── " + h.name); await h(app); } }

const HANDLINGER = { status, tekster, alder, produkter, billeder, review, byg, alt };
if (!HANDLINGER[HANDLING]) stop("ukendt handling «" + HANDLING + "» — brug " + Object.keys(HANDLINGER).join(" · "));
if (HANDLING !== "status" && HAENDELSE !== "workflow_dispatch") stop("«" + HANDLING + "» kører kun fra Actions → Run workflow (her: " + (HAENDELSE || "?") + ")");
console.log("Handling: " + HANDLING + " · hændelse " + (HAENDELSE || "?"));
await HANDLINGER[HANDLING](await appen());
console.log("✅ " + HANDLING + " færdig");
