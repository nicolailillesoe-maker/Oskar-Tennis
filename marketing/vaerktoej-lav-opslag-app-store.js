// Opslag 4 · «StreakTennis er landet i App Store» · 3/11-2026 · fire billeder 1080×1350 (Instagram-feedets 4:5) til Metricool.
// KØRES fra repoets rod: node vaerktoej-lav-opslag-app-store.js  →  marketing/opslag-4-app-store-1.jpg … -4.jpg
// Kilder i repoet (målt 3/11 i main 6200719): StreakTennis/ikon-512.png · butik/skud/65/1-kamp.png · 2-analyse.png · 6-hjem.png
// (App Store-billederne med den opdigtede Emil — de samme, Apple har godkendt). Ingen ægte navne. Ingen netværk.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROD = process.argv[2] || ".";
const b64 = (f) => "data:image/png;base64," + fs.readFileSync(path.join(ROD, f)).toString("base64");
const BUND = "background:radial-gradient(1200px 700px at 30% 0%, #16264a 0%, #0b1530 45%, #070d1f 100%);";
const kort1 = () => `<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box} body{width:1080px;height:1350px;${BUND}font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#fff;position:relative;overflow:hidden}
  .eb{position:absolute;left:72px;top:78px;color:#e9c46a;font-weight:800;letter-spacing:7px;font-size:30px}
  h1{position:absolute;left:72px;top:128px;font-size:96px;line-height:1.04;font-weight:800;letter-spacing:-1px}
  .sub{position:absolute;left:72px;top:368px;width:936px;font-size:33px;line-height:1.38;color:#b9c3d8}
  .ikon{position:absolute;left:50%;top:560px;transform:translateX(-50%);width:430px;height:430px;border-radius:96px;
        box-shadow:0 0 0 2px rgba(233,196,106,.35),0 30px 90px rgba(233,196,106,.22),0 20px 60px rgba(0,0,0,.6)}
  .fod{position:absolute;left:72px;right:72px;bottom:64px;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:700}
  .fod .l{color:#e9c46a} .fod .r{color:#fff} .fod .r b{color:#e9c46a}
</style></head><body>
  <div class="eb">NU I APP STORE</div>
  <h1>StreakTennis<br>er landet.</h1>
  <div class="sub">Registrér kampen bold for bold · få AI-analysen bagefter · hold din streak i live</div>
  <img class="ikon" src="${b64("StreakTennis/ikon-512.png")}">
  <div class="fod"><span class="l">Søg StreakTennis i App Store</span><span class="r">Sports<b>AI</b>nalytics</span></div>
</body></html>`;
const kortSkud = (f) => `<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0} body{width:1080px;height:1350px;background:#070d1f;overflow:hidden}
  img{width:1080px;height:auto;display:block}
</style></head><body><img src="${b64(f)}"></body></html>`;   /* fuld bredde, toppen af App Store-billedet (overskrift + telefonens øverste del) — ingen søm */
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1, locale: "da-DK" })).newPage();
  const sider = [kort1(), kortSkud("butik/skud/65/1-kamp.png"), kortSkud("butik/skud/65/2-analyse.png"), kortSkud("butik/skud/65/6-hjem.png")];
  fs.mkdirSync(path.join(ROD, "marketing"), { recursive: true });
  for (let i = 0; i < sider.length; i++) {
    await p.setContent(sider[i], { waitUntil: "load" }); await p.waitForTimeout(300);
    const ud = path.join(ROD, "marketing", "opslag-4-app-store-" + (i + 1) + ".jpg");
    await p.screenshot({ path: ud, type: "jpeg", quality: 90 });
    console.log(ud, fs.statSync(ud).size, "B");
  }
  await b.close();
})();
