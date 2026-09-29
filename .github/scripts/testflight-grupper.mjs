// testflight-grupper.mjs · TestFlight-værktøjet (ordre-290926-03 · 29/9-2026)
// Beta-grupper, beta-review-oplysninger, byg og testere gennem App Store Connect API'et — med den nøgle, ios.yml allerede bruger.
// Handlinger (HANDLING): status · opret-gruppe · oplysninger · tilfoej-byg · send-review · tilfoej-testere
// Reglerne: nøglen og token'et skrives ALDRIG i loggen · hvert kald er idempotent (det, der findes, bruges) ·
//           hvert udfald sin egen linje · værktøjet kan ikke fjerne noget (ingen DELETE).
// Endepunkterne er målt i Apples dokumentation 29/9 (developer.apple.com/documentation/appstoreconnectapi).
// Node 20, ingen pakker.
import crypto from "node:crypto";
import fs from "node:fs";

const E = process.env;
const BASE = "https://api.appstoreconnect.apple.com";
const BUNDLE = "com.sportsainalytics.streaktennis";
const HANDLING = (E.HANDLING || "").trim();
const GRUPPE = (E.GRUPPE || "").trim();
const BYG = (E.BYG || "").trim();
const TEKST = (E.TEKST || "").trim();
// «testere» læses fra hændelsesfilen, ikke fra miljøet — miljøet vises i den offentlige log (ordre-290926-06)
let TESTERE = "";
try { TESTERE = (JSON.parse(fs.readFileSync(E.GITHUB_EVENT_PATH, "utf8")).inputs || {}).testere || ""; } catch (e) {}
// en mail vises kun som første tegn + domæne: «o…@icloud.com»
const skjul = (mail) => mail.slice(0, 1) + "…@" + mail.split("@")[1];

// tekster fra ordre-290926-01
const NOTER = "No login required to start. Tap ‹Opret konto› on the first screen to create a player account. Club features need a club invitation and are not part of this test.";
const PRIVATLIV = "https://tennis.sportsainalytics.com/privatliv.html";
const FEEDBACK = "nicolai@sportsainalytics.com";

const stop = (hvor, detalje) => {
  console.log("⛔ " + hvor + (detalje ? " — " + detalje : ""));
  process.exit(3);
};
for (const k of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8_BASE64"]) if (!E[k]) stop("miljøet mangler " + k);

// ── token (ES256, højst 20 minutter — Apples grænse)
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const nu = Math.floor(Date.now() / 1000);
const hoved = b64u(JSON.stringify({ alg: "ES256", kid: E.ASC_KEY_ID, typ: "JWT" }));
const krop = b64u(JSON.stringify({ iss: E.ASC_ISSUER_ID, iat: nu, exp: nu + 1200, aud: "appstoreconnect-v1" }));
let noegle;
try { noegle = crypto.createPrivateKey(Buffer.from(E.ASC_KEY_P8_BASE64, "base64").toString("utf8")); }
catch (e) { stop("API-nøglen (.p8) kunne ikke læses"); }
const sig = crypto.sign("sha256", Buffer.from(hoved + "." + krop), { key: noegle, dsaEncoding: "ieee-p1363" });
const TOKEN = hoved + "." + krop + "." + b64u(sig);

// ── ét kald; en fejl siger status + Apples errors[].code + errors[].detail (aldrig token'et, aldrig headere)
async function kald(metode, sti, body) {
  let r;
  try {
    r = await fetch(BASE + sti, {
      method: metode,
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { stop(metode + " " + sti.split("?")[0] + " nåede ikke frem", String(e.message || e)); }
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

// ── appen
async function appen() {
  const j = kraev(await kald("GET", "/v1/apps?filter[bundleId]=" + encodeURIComponent(BUNDLE) + "&limit=10"), [200], "GET /v1/apps");
  const a = (j.data || []).find((d) => d.attributes && d.attributes.bundleId === BUNDLE);
  if (!a) stop("appen " + BUNDLE + " findes ikke i App Store Connect");
  return a;
}
async function grupper(appId) {
  const j = kraev(await kald("GET", "/v1/apps/" + appId + "/betaGroups?limit=200"), [200], "GET /v1/apps/{id}/betaGroups");
  return j.data || [];
}
async function findGruppe(appId, navn) {
  if (!navn) stop("input «gruppe» er tomt");
  return (await grupper(appId)).find((g) => g.attributes.name === navn) || null;
}
async function antalTestere(gruppeId) {
  const j = kraev(await kald("GET", "/v1/betaGroups/" + gruppeId + "/relationships/betaTesters?limit=200"), [200], "GET /v1/betaGroups/{id}/relationships/betaTesters");
  return { ids: (j.data || []).map((d) => d.id), total: (j.meta && j.meta.paging && j.meta.paging.total) ?? (j.data || []).length };
}
async function reviewTilstand(bygId) {
  const s = await kald("GET", "/v1/builds/" + bygId + "/betaAppReviewSubmission");
  if (s.status === 404) return { id: null, tilstand: "ikke sendt" };
  kraev(s, [200], "GET /v1/builds/{id}/betaAppReviewSubmission");
  if (!s.j.data) return { id: null, tilstand: "ikke sendt" };
  return { id: s.j.data.id, tilstand: s.j.data.attributes.betaReviewState };
}
async function findByg(appId, nummer) {
  if (!/^\d+$/.test(nummer)) stop("input «byg» skal være et byggenummer (fx 33) — fik «" + nummer + "»");
  const j = kraev(await kald("GET", "/v1/builds?filter[app]=" + appId + "&filter[version]=" + nummer + "&include=preReleaseVersion&limit=5"), [200], "GET /v1/builds");
  const b = (j.data || [])[0];
  if (!b) stop("byg " + nummer + " findes ikke hos Apple");
  const pv = (j.included || []).find((x) => x.type === "preReleaseVersions");
  return { b, version: pv ? pv.attributes.version : "?" };
}

// ── handlingerne
async function status(app) {
  console.log("App: " + app.attributes.name + " · " + BUNDLE + " · id " + app.id);
  const gs = await grupper(app.id);
  console.log("Beta-grupper: " + gs.length);
  for (const g of gs) {
    const a = g.attributes;
    const t = await antalTestere(g.id);
    console.log("  · " + a.name + " · id " + g.id + " · " + (a.isInternalGroup ? "intern" : "ekstern")
      + " · offentligt link " + (a.publicLinkEnabled ? "JA" : "nej") + " · testere " + t.total);
  }
  const j = kraev(await kald("GET", "/v1/builds?filter[app]=" + app.id + "&sort=-uploadedDate&limit=5&include=preReleaseVersion,buildBetaDetail"), [200], "GET /v1/builds");
  const inkl = (type, id) => (j.included || []).find((x) => x.type === type && x.id === id);
  console.log("De 5 nyeste byg:");
  for (const b of j.data || []) {
    const r = b.relationships || {};
    const pv = r.preReleaseVersion && r.preReleaseVersion.data && inkl("preReleaseVersions", r.preReleaseVersion.data.id);
    const bd = r.buildBetaDetail && r.buildBetaDetail.data && inkl("buildBetaDetails", r.buildBetaDetail.data.id);
    const rv = await reviewTilstand(b.id);
    console.log("  · byg " + b.attributes.version + " · version " + (pv ? pv.attributes.version : "?")
      + " · processing " + b.attributes.processingState
      + " · kryptering " + (b.attributes.usesNonExemptEncryption === false ? "no" : String(b.attributes.usesNonExemptEncryption))
      + " · ekstern " + (bd ? bd.attributes.externalBuildState : "?") + " · review " + rv.tilstand);
  }
}

async function opretGruppe(app) {
  const findes = await findGruppe(app.id, GRUPPE);
  if (findes) {
    console.log("gruppen " + GRUPPE + " findes allerede (id " + findes.id + ") · offentligt link " + (findes.attributes.publicLinkEnabled ? "JA" : "nej"));
    return;
  }
  const j = kraev(await kald("POST", "/v1/betaGroups", {
    data: {
      type: "betaGroups",
      attributes: { name: GRUPPE, publicLinkEnabled: false, isInternalGroup: false },
      relationships: { app: { data: { type: "apps", id: app.id } } },
    },
  }), [201], "POST /v1/betaGroups");
  console.log("gruppen " + GRUPPE + " er oprettet (id " + j.data.id + ") · offentligt link " + (j.data.attributes.publicLinkEnabled ? "JA" : "nej"));
}

async function oplysninger(app) {
  const d = kraev(await kald("GET", "/v1/apps/" + app.id + "/betaAppReviewDetail"), [200], "GET /v1/apps/{id}/betaAppReviewDetail").data;
  if (!d) stop("appen har ingen betaAppReviewDetail");
  const a = d.attributes;
  const mangler = ["contactFirstName", "contactLastName", "contactPhone"].filter((k) => !a[k]);
  if (mangler.length) stop("kontakten mangler " + mangler.join(" · ") + " — der opfindes intet; Nicolai udfylder det i App Store Connect → TestFlight → Test Information");
  const nyt = { demoAccountRequired: false, notes: NOTER };
  if (!a.contactEmail) nyt.contactEmail = FEEDBACK;
  kraev(await kald("PATCH", "/v1/betaAppReviewDetails/" + d.id, { data: { type: "betaAppReviewDetails", id: d.id, attributes: nyt } }),
    [200], "PATCH /v1/betaAppReviewDetails/{id}");
  console.log("beta-review-oplysninger sat (id " + d.id + ") · kontakt " + a.contactFirstName + " " + a.contactLastName
    + " · telefon står der · mail " + (a.contactEmail ? "står der" : "sat til " + FEEDBACK) + " · demo-konto nej · noter sat");

  const lj = kraev(await kald("GET", "/v1/apps/" + app.id + "/betaAppLocalizations?limit=50"), [200], "GET /v1/apps/{id}/betaAppLocalizations");
  const lok = (lj.data || []).filter((l) => /^(da|en)/i.test(l.attributes.locale));
  if (!lok.length) stop("appen har ingen beta-lokalisering på da eller en — Nicolai opretter den under TestFlight → Test Information (Beta App Description)");
  for (const l of lok) {
    kraev(await kald("PATCH", "/v1/betaAppLocalizations/" + l.id, {
      data: { type: "betaAppLocalizations", id: l.id, attributes: { privacyPolicyUrl: PRIVATLIV, feedbackEmail: FEEDBACK } },
    }), [200], "PATCH /v1/betaAppLocalizations/{id}");
    console.log("beta-lokalisering " + l.attributes.locale + " (id " + l.id + ") · privatlivs-URL + feedback-mail sat"
      + (l.attributes.description ? "" : " · ⚠️ Beta App Description er tom"));
  }
}

async function tilfoejByg(app) {
  if (!TEKST) stop("input «tekst» (What to Test) er tomt");
  const g = await findGruppe(app.id, GRUPPE);
  if (!g) stop("gruppen " + GRUPPE + " findes ikke — kør opret-gruppe først");
  const { b, version } = await findByg(app.id, BYG);
  const i = kraev(await kald("GET", "/v1/betaGroups/" + g.id + "/relationships/builds?limit=200"), [200], "GET /v1/betaGroups/{id}/relationships/builds");
  if ((i.data || []).some((x) => x.id === b.id)) {
    console.log("byg " + BYG + " (version " + version + ") ligger allerede i " + GRUPPE);
  } else {
    kraev(await kald("POST", "/v1/betaGroups/" + g.id + "/relationships/builds", { data: [{ type: "builds", id: b.id }] }),
      [204], "POST /v1/betaGroups/{id}/relationships/builds");
    console.log("byg " + BYG + " (version " + version + ") er lagt i " + GRUPPE);
  }
  const lj = kraev(await kald("GET", "/v1/builds/" + b.id + "/betaBuildLocalizations?limit=50"), [200], "GET /v1/builds/{id}/betaBuildLocalizations");
  const da = (lj.data || []).find((l) => /^da/i.test(l.attributes.locale));
  if (da) {
    kraev(await kald("PATCH", "/v1/betaBuildLocalizations/" + da.id, { data: { type: "betaBuildLocalizations", id: da.id, attributes: { whatsNew: TEKST } } }),
      [200], "PATCH /v1/betaBuildLocalizations/{id}");
    console.log("What to Test (" + da.attributes.locale + ") er sat på byg " + BYG);
  } else {
    kraev(await kald("POST", "/v1/betaBuildLocalizations", {
      data: { type: "betaBuildLocalizations", attributes: { locale: "da", whatsNew: TEKST }, relationships: { build: { data: { type: "builds", id: b.id } } } },
    }), [201], "POST /v1/betaBuildLocalizations");
    console.log("What to Test (da) er oprettet på byg " + BYG);
  }
}

async function sendReview(app) {
  const { b, version } = await findByg(app.id, BYG);
  if (b.attributes.processingState !== "VALID") stop("byg " + BYG + " er ikke færdigbehandlet (processing " + b.attributes.processingState + ")");
  if (b.attributes.usesNonExemptEncryption !== false) {
    // export compliance: appen bruger kun HTTPS — svaret er «no» på egen kryptering (ordre-290926-01)
    kraev(await kald("PATCH", "/v1/builds/" + b.id, { data: { type: "builds", id: b.id, attributes: { usesNonExemptEncryption: false } } }),
      [200], "PATCH /v1/builds/{id}");
    console.log("export compliance på byg " + BYG + ": svaret «no» (kun HTTPS)");
  } else console.log("export compliance på byg " + BYG + ": «no» står der allerede (fra plisten)");
  const før = await reviewTilstand(b.id);
  if (før.id) {
    console.log("byg " + BYG + " (version " + version + ") er allerede sendt · review: " + før.tilstand);
    return;
  }
  kraev(await kald("POST", "/v1/betaAppReviewSubmissions", {
    data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: b.id } } } },
  }), [201], "POST /v1/betaAppReviewSubmissions");
  const efter = await reviewTilstand(b.id);
  console.log("byg " + BYG + " (version " + version + ") er sendt til TestFlight App Review · review: " + efter.tilstand);
}

async function tilfoejTestere(app) {
  const g = await findGruppe(app.id, GRUPPE);
  if (!g) stop("gruppen " + GRUPPE + " findes ikke — kør opret-gruppe først");
  const linjer = TESTERE.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
  if (!linjer.length) stop("input «testere» er tomt");
  // maskér alt, før noget kan skrives: hele linjen, mailen og hvert navn (GitHub erstatter dem med *** i loggen)
  for (const l of linjer) for (const del of [l, ...l.split(/[\s<>]+/)]) if (del.length > 1) console.log("::add-mask::" + del);
  const folk = linjer.map((l, n) => {
    // «Fornavn Efternavn <mail>» eller kun «<mail>» — et navn, der ikke står der, opfindes ikke
    const m = l.match(/^(?:(.+?)\s+)?<([^<>\s]+@[^<>\s]+\.[^<>\s]+)>$/);
    if (!m) stop("linje " + (n + 1) + " passer ikke til «Fornavn Efternavn <mail>» eller «<mail>»");
    const navn = (m[1] || "").trim().split(/\s+/).filter(Boolean);
    return { fornavn: navn[0] || "", efternavn: navn.slice(1).join(" "), mail: m[2].toLowerCase() };
  });
  const i = await antalTestere(g.id);
  for (const p of folk) {
    const j = kraev(await kald("GET", "/v1/betaTesters?filter[email]=" + encodeURIComponent(p.mail) + "&limit=5"), [200], "GET /v1/betaTesters");
    const t = (j.data || [])[0];
    const hvem = "tester " + skjul(p.mail) + (p.fornavn ? " (med navn)" : " (kun mail)");
    if (t && i.ids.includes(t.id)) { console.log(hvem + " · beta-tester-id " + t.id + " · er allerede i " + GRUPPE); continue; }
    if (t) {
      kraev(await kald("POST", "/v1/betaGroups/" + g.id + "/relationships/betaTesters", { data: [{ type: "betaTesters", id: t.id }] }),
        [204], "POST /v1/betaGroups/{id}/relationships/betaTesters");
      console.log(hvem + " · beta-tester-id " + t.id + " · fandtes og er lagt i " + GRUPPE);
    } else {
      const attr = { email: p.mail };
      if (p.fornavn) attr.firstName = p.fornavn;
      if (p.efternavn) attr.lastName = p.efternavn;
      const nj = kraev(await kald("POST", "/v1/betaTesters", {
        data: {
          type: "betaTesters",
          attributes: attr,
          relationships: { betaGroups: { data: [{ type: "betaGroups", id: g.id }] } },
        },
      }), [201], "POST /v1/betaTesters");
      console.log(hvem + " · beta-tester-id " + nj.data.id + " · er oprettet og lagt i " + GRUPPE + " (Apple sender invitationen)");
    }
  }
  console.log("testere i " + GRUPPE + " nu: " + (await antalTestere(g.id)).total);
}

const HANDLINGER = { "status": status, "opret-gruppe": opretGruppe, "oplysninger": oplysninger,
  "tilfoej-byg": tilfoejByg, "send-review": sendReview, "tilfoej-testere": tilfoejTestere };
if (!HANDLINGER[HANDLING]) stop("ukendt handling «" + HANDLING + "» — brug " + Object.keys(HANDLINGER).join(" · "));
console.log("Handling: " + HANDLING + (GRUPPE ? " · gruppe " + GRUPPE : "") + (BYG ? " · byg " + BYG : ""));
await HANDLINGER[HANDLING](await appen());
console.log("✅ " + HANDLING + " færdig");
