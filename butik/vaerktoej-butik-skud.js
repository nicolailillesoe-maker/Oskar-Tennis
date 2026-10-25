// App Store-skærmbilleder · StreakTennis i APP-tilstand (Capacitor efterlignet) · 6,9" = 1320×2868 (440×956 @3x)
// Nicolai 13/10: «Nu: App Store. Jeg laver skærmbillederne og gør alt klart …»
// Opdigtet spiller Emil og opdigtede modstandere (demodata-da.json). Intet rigtigt navn. Intet netværk.
// Brug: node vaerktoej-butik-skud.js <StreakTennis/index.html> <demodata-da.json> <ud-mappe> [61|65|67|ipad13]
// v2 · ordre-241026-04: «65» = 6,5" 1242×2688 (414×896 @3x) · «ipad13» = iPad 13" 2048×2732 (1024×1366 @2x, iPad-renderingen af appen,
//      ikke telefonskuddet skaleret op). 65 og ipad13 skyder kun butikkens seks billeder (købsbillederne ligger i 61).
const { chromium } = require("playwright"); const http = require("http"); const fs = require("fs"); const path = require("path");
const [APP, DEMO, UD0, STR] = process.argv.slice(2);
const MAAL = { "61": { w: 402, h: 874, s: 3, navn: "61" }, "65": { w: 414, h: 896, s: 3, navn: "65" }, "67": { w: 440, h: 956, s: 3, navn: "67" }, ipad13: { w: 1024, h: 1366, s: 2, navn: "ipad13", ipad: true } };
const M = MAAL[STR] || MAAL["67"]; const KOEB = M.navn === "61" || M.navn === "67";
const UA = M.ipad ? "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const UD = UD0 + "/" + M.navn; fs.mkdirSync(UD + "/raa", { recursive: true });
const D = JSON.parse(fs.readFileSync(DEMO, "utf8"));
const pad = (x) => (x < 10 ? "0" : "") + x; const dato = (dage) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - dage); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const ANALYSE = "Du vandt matchtiebreaken, fordi du holdt bolden i spil: kun én uforceret fejl og 7 af de første 10 point. I andet sæt forærede du 15 point med uforcerede fejl — det var dér, kampen gled. Næste træning: sikkerhed før fart i de lange dueller.";
const kampe = D.kampe.map((k, i) => { const o = Object.assign({}, k); delete o.dage; o.dato = dato(k.dage); if (i === 0) { o.analyse = ANALYSE; o.aSprog = "da"; } return o; });
const tt = [], fy = []; D.traening.forEach((e, i) => { const q = { id: "demo-" + i, d: dato(e.dage), m: e.m, k: e.k, t: e.t, n: "", x: true }; (e.fys ? fy : tt).push(q); });
const SEED = { "sai-spiller": "Emil", "sai-laas": "op", "sai-spillernoegle": "DEMO-SPILLER-0000", "sai-inviteret": "1", "sai-konto": "emil", "sai-brugernavn": "emil", "sai-venne-aktiv": "1", "sai-sprog": "da", "sai-skala10": "1",
  "sai-kampe": JSON.stringify(kampe), "sai-tennis-log": JSON.stringify(tt), "sai-fysisk-log": JSON.stringify(fy) };
const TEKST = {
  kamp: ["Registrér kampen", "bold for bold — fra banen"],
  analyse: ["AI-analysen efter kampen", "hvad virkede, og hvad skal trænes"],
  stats: ["Bliver du bedre?", "alle dine kampe ét sted"],
  udvikling: ["Se udviklingen", "kamp for kamp, hele sæsonen"],
  traen: ["Træning og sæson", "din log, din uge og dine turneringer"],
  hjem: ["Hver træning tæller", "hold din streak i live"] };
const fejl = []; const ud = [];
(async () => {
  const s = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(fs.readFileSync(APP)); });
  await new Promise((ok) => s.listen(0, "127.0.0.1", ok)); const URL = "http://127.0.0.1:" + s.address().port + "/StreakTennis/";
  const b = await chromium.launch();
  const cx = await b.newContext({ viewport: { width: M.w, height: M.h }, deviceScaleFactor: M.s, locale: "da-DK", timezoneId: "Europe/Copenhagen", serviceWorkers: "block",
    userAgent: UA, hasTouch: true, isMobile: true });
  const p = await cx.newPage(); p.on("pageerror", (e) => fejl.push(String(e.message).slice(0, 160))); p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.addInitScript(() => { const P = { addListener: () => Promise.resolve({ remove() {} }), init: () => Promise.resolve(), load: (o) => Promise.resolve({ validProducts: (o.productIds || []).map((id) => ({ id, price: "49,00 kr." })) }) };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { PurchasePlugin: P } }; });
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith(URL.slice(0, 22))) return r.continue(); ud.push(u.slice(0, 80));
    let k = {}; try { k = JSON.parse(r.request().postData() || "{}"); } catch (_e) {} const j = (o) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (k.handling === "min-status") return j({ kendt: true, fornavn: "Emil", ejer: false, status: "godkendt", plan: "fuld" });
    return j({ ok: true, tom: true, kampe: [], bud: [], venner: [], rum: [], noegler: [], beskeder: [], ind: [], ud: [], hold: [], raekker: [] }); });
  await p.goto(URL); await p.evaluate((sd) => { localStorage.clear(); for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, v); }, SEED); await p.reload(); await p.waitForTimeout(2200);
  const k = async (sel, v) => { const l = p.locator(sel); if (!(await l.count())) throw new Error("findes ikke: " + sel); await l.first().click(); await p.waitForTimeout(v || 700); };
  const gaa = (v) => k('[data-a=devgaa][data-v="udv:' + v + '"]', 1000);
  const tx = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const skud = async (navn, krav) => { const x = await tx(); if (!krav.test(x)) throw new Error(navn + ": skærmen viser ikke " + krav + " · " + x.slice(0, 160)); await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: UD + "/raa/" + navn + ".png" }); console.log("  ✓ " + navn); };

  // STATS · SENESTE KAMP med analysen · UDVIKLING
  await gaa("historik"); await skud("stats", /SENESTE KAMP/);
  await k("[data-stat-helt=seneste]", 1200); await p.locator("#rum-skaerm").getByText("Du vandt matchtiebreaken").first().scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.evaluate(() => { const e = [...document.querySelectorAll("#rum-skaerm *")].find((x) => x.children.length === 0 && /^Du vandt matchtiebreaken/.test(x.textContent || "")); if (e) e.scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(400); await p.screenshot({ path: UD + "/raa/analyse.png" }); if (!/Du vandt matchtiebreaken/.test(await p.locator("#rum-skaerm").innerText())) throw new Error("analysen mangler"); console.log("  ✓ analyse");
  await k("#rum-skaerm [data-rum-tilbage]", 600); await k(".dev-flise[data-a=statPanel][data-v=udvikling]", 1200);
  await p.screenshot({ path: UD + "/raa/udvikling.png" }); console.log("  ✓ udvikling");
  await k("#rum-skaerm [data-rum-tilbage]", 600);
  await gaa("fysisk"); await skud("traen", /SÆSONEN/); await gaa("hjem"); await skud("hjem", /Hej Emil/);
  // KAMP · en kamp i gang: 1 sæt til Emil, 4-3 i andet, så to point
  await gaa("kamp"); await k("[data-a=wizMod][data-v='Oliver K.']", 300); await p.locator("#app input").nth(1).fill("Askholm Open · U14 kat. 1");
  await k("[data-a=wiz][data-v='3']", 800); await k("[data-a=mtb][data-v='1']", 300); await k("[data-a=start]", 1200); await k("[data-a=serverFoerst][data-v='1']", 600);
  await k("[data-a=justToggle]", 600); await k("[data-a=jstep][data-v=sOp]", 200);
  for (let i = 0; i < 4; i++) await k("[data-a=jstep][data-v=gOp]", 150); for (let i = 0; i < 3; i++) await k("[data-a=jstep][data-v=gMp]", 150);
  await k("[data-a=jServer][data-v='1']", 200); await k("[data-a=jAnvend]", 900);
  const vis = async (n) => console.log("--", n, (await p.locator("#app [data-a]").evaluateAll((a) => a.filter((e) => e.offsetParent).map((e) => e.getAttribute("data-a") + "|" + (e.getAttribute("data-v") || "")))).join(" "));
  await vis("efter anvend");
  for (const [u, a] of [["vundet", "vinder"], ["vundet", "es"], ["tabt", "uf"]]) { await k("[data-a=udfald][data-v=" + u + "]", 500);
    if (await p.locator("[data-a=serv][data-v='1']").count() && u === "vundet") await k("[data-a=serv][data-v='1']", 300);
    await k("[data-a=aarsag][data-v=" + a + "]", 600); if (await p.locator("[data-a=haand][data-v='1']").count()) await k("[data-a=haand][data-v='1']", 600); await vis("efter " + a); }
  await skud("kamp", /Oliver K\./);
  if (KOEB) {
  // KØBENE · App Review-billederne for de ni produkter (Apple-priserne fra skallen · intet købes)
  const PRIS = { "fuld.maaned": "49,00 kr.", "fri.maaned": "99,00 kr.", "klubfri.maaned": "49,00 kr.", "kamp.1": "20,00 kr.", "kamp.3": "54,00 kr.", "kamp.5": "85,00 kr.", "live.1": "15,00 kr.", "live.3": "40,00 kr.", "live.5": "65,00 kr." };
  const koebSide = async (T) => { const c2 = await b.newContext({ viewport: { width: M.w, height: M.h }, deviceScaleFactor: 3, locale: "da-DK", timezoneId: "Europe/Copenhagen", serviceWorkers: "block",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", hasTouch: true, isMobile: true });
    const p2 = await c2.newPage(); p2.on("pageerror", (e) => fejl.push(String(e.message).slice(0, 160))); p2.on("dialog", (d) => d.dismiss().catch(() => {}));
    await p2.addInitScript((PR) => { const P = { addListener: () => Promise.resolve({ remove() {} }), init: () => Promise.resolve(), load: (o) => Promise.resolve({ validProducts: (o.productIds || []).map((id) => ({ id, price: PR[id.replace("com.sportsainalytics.streaktennis.", "")] || "" })) }),
      purchase: () => new Promise(() => {}), finish: () => Promise.resolve(), restore: () => Promise.resolve(), manageSubscriptions: () => Promise.resolve() };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { PurchasePlugin: P } }; }, PRIS);
    await p2.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith(URL.slice(0, 22))) return r.continue(); ud.push(u.slice(0, 80));
      let k2 = {}; try { k2 = JSON.parse(r.request().postData() || "{}"); } catch (_e) {} const j = (o) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
      if (k2.handling === "min-status") return j({ kendt: true, fornavn: "Emil", ejer: false, status: "godkendt", plan: T.plan, oensket: null, gave: false, betalt_til: null });
      if (k2.handling === "status" && /betaling-start/.test(u)) return j({ abonnement: null, koeb: { kamp: 0, live: 0 }, live: { brugt: T.brugt, af: 3, gratis: T.plan === "gaest" } });
      return j({ ok: true, tom: true, kampe: [], bud: [], venner: [], rum: [], noegler: [], beskeder: [], ind: [], ud: [], hold: [], raekker: [] }); });
    await p2.goto(URL); await p2.evaluate((sd) => { localStorage.clear(); for (const [k3, v] of Object.entries(sd)) localStorage.setItem(k3, v); }, SEED); await p2.reload(); await p2.waitForTimeout(2200); return { c2, p2 }; };
  const tryk = async (pp, sel, v) => { const l = pp.locator(sel); if (!(await l.count())) throw new Error("findes ikke: " + sel); await l.first().scrollIntoViewIfNeeded(); await l.first().click(); await pp.waitForTimeout(v || 900); };
  const kontoen = async (pp) => { await tryk(pp, '[data-a=tab][data-v=opsaet]', 700); if (!(await pp.locator('[data-kontofliser="1"],[data-kontorum-tilbage="1"]').count())) await tryk(pp, "text=DIN KONTO", 1400); };
  const koebSkud = async (pp, navn, krav) => { const x = (await pp.locator("body").innerText()).replace(/\s+/g, " "); if (!krav.test(x)) throw new Error(navn + ": skærmen viser ikke " + krav + " · " + x.slice(0, 200));
    await pp.screenshot({ path: UD + "/koeb-" + navn + ".png" }); console.log("  ✓ køb · " + navn); };
  { const { c2, p2 } = await koebSide({ plan: "klub", brugt: 0 }); await kontoen(p2); await tryk(p2, '[data-kontorum="plan"]', 700); await tryk(p2, '[data-klubfri="1"]', 700);
    await koebSkud(p2, "klubfri", /49,00 kr/); await c2.close(); }
  for (const [plan, navn, krav] of [["fuld", "fuld", /49,00 kr/], ["fri", "fri", /99,00 kr/]]) {
    const { c2, p2 } = await koebSide({ plan: "gaest", brugt: 0 }); await kontoen(p2); await tryk(p2, '[data-kontorum="plan"]', 700);
    await tryk(p2, '[data-a="planSkiftAabn"]'); if (!(await p2.locator('[data-a="planVaelg"][data-v="' + plan + '"]').count())) { console.log("  · køb · " + navn + ": intet planVaelg — springes over"); await c2.close(); continue; }
    await tryk(p2, '[data-a="planVaelg"][data-v="' + plan + '"]'); await koebSkud(p2, navn, krav); await c2.close(); }
  { const { c2, p2 } = await koebSide({ plan: "fuld", brugt: 3 }); await kontoen(p2); await tryk(p2, '[data-kontorum="live"]', 800); await koebSkud(p2, "live", /15,00 kr\.[\s\S]*40,00 kr\.[\s\S]*65,00 kr\./); await c2.close(); }
  { const { c2, p2 } = await koebSide({ plan: "gaest", brugt: 3 }); await kontoen(p2); await tryk(p2, '[data-kontorum="live"]', 800); await koebSkud(p2, "kamp", /20,00 kr\.[\s\S]*54,00 kr\.[\s\S]*85,00 kr\./); await c2.close(); }
  }
  // de pæne: overskrift + skærmen (iPad: samme overskrift og ramme, men rammen har iPad-skærmens form og rummer iPad-renderingen)
  const pc = await b.newContext({ viewport: { width: M.w, height: M.h }, deviceScaleFactor: M.s }); const q = await pc.newPage();
  const raekke = ["kamp", "analyse", "stats", "udvikling", "traen", "hjem"];
  for (const [i, n] of raekke.entries()) { const img = "data:image/png;base64," + fs.readFileSync(UD + "/raa/" + n + ".png").toString("base64");
    const f = M.ipad ? 1.55 : M.w / 440;
    const L = M.ipad ? { top: 56, titel: 48, under: 29, luft: 40, rH: 1366 - 56 - 55 - 8 - 34 - 40 - 64, radius: 34 }
      : { top: Math.round(44 * f), titel: Math.round(31 * f), under: Math.round(19 * f), luft: Math.round(30 * f), rH: null, radius: Math.round(38 * f) };
    const rH = L.rH || Math.round(356 * f * M.h / M.w); const rW = L.rH ? Math.round(rH * M.w / M.h) : Math.round(356 * f);
    await q.setContent('<html><body style="margin:0;width:' + M.w + 'px;height:' + M.h + 'px;overflow:hidden;background:radial-gradient(120% 70% at 50% 0%,#1d3a7a 0%,#0b1424 55%,#070d18 100%);font-family:\'Liberation Sans\',sans-serif;color:#eef3fa;text-align:center">' +
      '<div style="padding:' + L.top + 'px 22px 0"><div style="font-size:' + L.titel + 'px;font-weight:700;letter-spacing:-.3px;line-height:1.15">' + TEKST[n][0] + '</div><div style="font-size:' + L.under + 'px;color:#e8b23c;margin-top:8px;font-weight:700">' + TEKST[n][1] + '</div></div>' +
      '<div style="margin:' + L.luft + 'px auto 0;width:' + rW + 'px;height:' + rH + 'px;border-radius:' + L.radius + 'px;overflow:hidden;box-shadow:0 0 0 7px #1a2438,0 0 0 8px #33425e,0 24px 60px rgba(0,0,0,.6)"><img src="' + img + '" style="width:100%;height:100%;display:block"></div></body></html>');
    await q.waitForTimeout(200); await q.screenshot({ path: UD + "/" + (i + 1) + "-" + n + ".png" }); }
  console.log("JS-fejl: " + fejl.length + (fejl.length ? " · " + fejl.join(" | ") : "") + " · kald ud: " + ud.length);
  await b.close(); s.close();
})().catch((e) => { console.log("⛔ " + String(e).split("\n")[0]); process.exit(1); });
