// StreakTennis · App Store-profilen MED Push, lavet gennem App Store Connect API'et — så ingen skal hente en profilfil i hånden.
// v1 (25/9-2026) · kaldes af ios.yml v6. Bruger den API-nøgle, der allerede ligger i repoets hemmeligheder.
// v1.1 (25/9-2026) · kørsel #13: Apple svarede 400 på «limit» på relationen bundleIdCapabilities (PARAMETER_ERROR.ILLEGAL),
//   selv om Apples egen API-beskrivelse tillader den. Kun lister på topniveau får «limit» nu.
//
//   1. appens id (bundleId) findes hos Apple
//   2. Push Notifications slås til på id'et, hvis det ikke allerede er det
//   3. distributionscertifikatet fra .p12'en findes hos Apple — på sit INDHOLD (sha256), ikke på navnet
//   4. en aktiv App Store-profil for id'et + certifikatet, der bærer Push og lever mindst 14 dage, genbruges — ellers laves en ny
//
// Lykkes det, skrives profilen til UD_PROFIL, og der skrives én linje: «PROFIL_NAVN=…».
// Lykkes det IKKE, afsluttes med kode 3 og en sætning, der siger præcis hvor — så falder workflowet tilbage til profilen i
// hemmeligheden (DIST_PROFILE_BASE64) og bygger uden Push, som v5. Nøglen og token'et skrives aldrig ud.
import crypto from "node:crypto";
import fs from "node:fs";

const E = process.env;
const BASE = E.ASC_BASE || "https://api.appstoreconnect.apple.com";
const BUNDLE = E.BUNDLE || "com.sportsainalytics.streaktennis";
const NAVN = "StreakTennis App Store Push";
const DAGE_MIN = 14;

const stop = (hvor, detalje) => {
  console.log("⛔ " + hvor + (detalje ? " — " + detalje : ""));
  process.exit(3);
};
for (const k of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8_BASE64", "CERT_PEM", "UD_PROFIL"]) if (!E[k]) stop("miljøet mangler " + k);

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

// ── ét kald; en fejl siger status + Apples egen forklaring (aldrig token'et)
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
      : svar.status === 403 ? " (nøglens rolle må ikke dette — se ordren)" : "";
    stop(hvad + " svarede " + svar.status + hint, svar.fejl);
  }
  return svar.j;
};

// ── 3a. certifikatet fra nøgleringen (PEM) → DER → sha256
const pem = fs.readFileSync(E.CERT_PEM, "utf8");
const pemBlok = (pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []);
if (pemBlok.length === 0) stop("CERT_PEM bærer intet certifikat");
const vores = new Set(pemBlok.map((b) => crypto.createHash("sha256").update(Buffer.from(b.replace(/-----[A-Z ]+-----|\s/g, ""), "base64")).digest("hex")));

// ── 1. appens id
const ids = kraev(await kald("GET", "/v1/bundleIds?filter[identifier]=" + encodeURIComponent(BUNDLE) + "&limit=200"), [200], "bundleIds");
const bid = (ids.data || []).find((d) => d.attributes && d.attributes.identifier === BUNDLE);
if (!bid) stop("appens id " + BUNDLE + " findes ikke hos Apple");
console.log("App-id hos Apple: " + BUNDLE + " (" + (bid.attributes.platform || "?") + ")");

// ── 2. Push på id'et
const kap = kraev(await kald("GET", "/v1/bundleIds/" + bid.id + "/bundleIdCapabilities"), [200], "bundleIdCapabilities");
const harPush = (kap.data || []).some((c) => c.attributes && c.attributes.capabilityType === "PUSH_NOTIFICATIONS");
if (harPush) console.log("Push Notifications: var allerede slået til på id'et");
else {
  kraev(await kald("POST", "/v1/bundleIdCapabilities", {
    data: {
      type: "bundleIdCapabilities",
      attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
      relationships: { bundleId: { data: { type: "bundleIds", id: bid.id } } },
    },
  }), [201], "at slå Push til på id'et");
  console.log("⭐ Push Notifications: slået til på id'et NU (ældre profiler for id'et kan blive ugyldige hos Apple)");
}

// ── 3b. certifikatet hos Apple, fundet på indholdet
const cer = kraev(await kald("GET", "/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200"), [200], "certificates");
const cert = (cer.data || []).find((c) => c.attributes && c.attributes.certificateContent &&
  vores.has(crypto.createHash("sha256").update(Buffer.from(c.attributes.certificateContent, "base64")).digest("hex")));
if (!cert) stop("certifikatet i DIST_P12_BASE64 findes ikke blandt teamets distributionscertifikater (" + (cer.data || []).length + " set)");
// navnet på certifikatet skrives IKKE ud — loggen kan være offentlig, og navnet er en persons
console.log("Certifikat hos Apple: fundet på indholdet · udløber " + String(cert.attributes.expirationDate || "?").slice(0, 10));

// ── 4. genbrug eller ny
const pr = kraev(await kald("GET", "/v1/profiles?filter[profileType]=IOS_APP_STORE&include=bundleId,certificates&limit=200"), [200], "profiles");
const graense = Date.now() + DAGE_MIN * 864e5;
const bruger = (p) => {
  const a = p.attributes || {}, rel = p.relationships || {};
  const indhold = a.profileContent ? Buffer.from(a.profileContent, "base64").toString("latin1") : "";
  return a.profileState === "ACTIVE"
    && rel.bundleId && rel.bundleId.data && rel.bundleId.data.id === bid.id
    && rel.certificates && (rel.certificates.data || []).some((c) => c.id === cert.id)
    && indhold.includes("<key>aps-environment</key>")
    && Date.parse(a.expirationDate || 0) > graense;
};
let profil = (pr.data || []).filter(bruger).sort((x, y) => Date.parse(y.attributes.createdDate || 0) - Date.parse(x.attributes.createdDate || 0))[0];
if (profil) console.log("Profil genbrugt: «" + profil.attributes.name + "» · udløber " + String(profil.attributes.expirationDate).slice(0, 10));
else {
  const navne = new Set((pr.data || []).map((p) => (p.attributes || {}).name));
  const navn = navne.has(NAVN) ? NAVN + " " + (E.KOERSEL || String(nu)) : NAVN;
  const ny = kraev(await kald("POST", "/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name: navn, profileType: "IOS_APP_STORE" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bid.id } },
        certificates: { data: [{ type: "certificates", id: cert.id }] },
      },
    },
  }), [201], "at lave profilen");
  profil = ny.data;
  console.log("⭐ Profil lavet NU: «" + profil.attributes.name + "» · udløber " + String(profil.attributes.expirationDate || "?").slice(0, 10));
}
if (!profil.attributes.profileContent) stop("profilen kom uden indhold");
const bytes = Buffer.from(profil.attributes.profileContent, "base64");
if (!bytes.toString("latin1").includes("<key>aps-environment</key>")) stop("profilen «" + profil.attributes.name + "» bærer ikke aps-environment");
fs.writeFileSync(E.UD_PROFIL, bytes);
console.log("PROFIL_NAVN=" + profil.attributes.name);
