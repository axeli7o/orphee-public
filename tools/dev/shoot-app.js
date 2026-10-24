/* Mode local — capture de la VRAIE app (émulateurs + données fictives).
   Prérequis : `npm run dev` tourne (http://127.0.0.1:5050) et Playwright est
   installé dans tools/visual (`npm --prefix ../visual run setup`).
   Usage : node shoot-app.js [--offline] [dossier-sortie]  (défaut tools/dev/out/)
     --offline  pour un environnement sans réseau sortant : coupe les
                requêtes hors localhost (polices Google) et sert le SDK
                Firebase depuis node_modules/firebase (l'émulateur Hosting
                le relaie sinon depuis gstatic.com).
   Produit, en mobile (390) et desktop (1280) : Moi, chaque onglet, le panneau de
   recherche de la bibliothèque et une fiche album. */
"use strict";

const fs = require("fs");
const path = require("path");
const {createRequire} = require("module");

const {chromium} = createRequire(
    path.join(__dirname, "..", "visual", "package.json"))("playwright");

const APP_URL = "http://127.0.0.1:5050";
const SDK_DIR = path.join(__dirname, "node_modules", "firebase");
const args = process.argv.slice(2);
const OFFLINE = args.includes("--offline");
const outDir = args.find((a) => !a.startsWith("--")) ||
  path.join(__dirname, "out");
const VIEWPORTS = [
  {name: "mobile", width: 390, height: 844},
  {name: "desktop", width: 1280, height: 900},
];

async function shot(page, vp, name, fullPage = true) {
  await page.waitForTimeout(1500); // animations d'entrée, chargement Firestore
  const file = path.join(outDir, `${name}_${vp.name}.png`);
  await page.screenshot({path: file, fullPage});
  console.log("→", path.relative(process.cwd(), file));
}

// Onglets de la barre (Moi, Bibliothèque, Salon) ou vues hors barre
// (Stats, Réglages) : même moteur de navigation (window.OrpheeNav).
async function tab(page, name) {
  await page.evaluate((t) => window.OrpheeNav.activate(t), name);
}

(async () => {
  fs.mkdirSync(outDir, {recursive: true});
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: {width: vp.width, height: vp.height},
    });
    if (OFFLINE) {
      await page.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
      await page.route(/\/__\/firebase\/[\d.]+\/(firebase-[a-z-]+\.js)$/,
          (r) => r.fulfill({
            path: path.join(SDK_DIR, path.basename(new URL(r.request().url()).pathname)),
            contentType: "text/javascript",
          }));
    }
    page.on("pageerror", (e) => console.log(`[${vp.name}] pageerror:`, e.message));
    await page.goto(APP_URL, {waitUntil: "load"});
    await shot(page, vp, "00-login", false);

    await page.click("#login-btn");
    await page.waitForSelector("body.is-authed", {timeout: 15000});

    await tab(page, "moi");
    await page.waitForSelector("#view-moi .moi", {timeout: 15000}).catch(() => {});
    await shot(page, vp, "01-moi");

    await tab(page, "library");
    await shot(page, vp, "01b-bibliotheque");

    await page.click(".mc-fab");
    await shot(page, vp, "02-bibliotheque-recherche", false);
    await page.keyboard.press("Escape");
    await page.click(".mc-fab");

    const cover = page.locator(".mc-scroll img, .mc-scroll [class*='rec'], " +
      ".mc-scroll [class*='tile']").first();
    if (await cover.count()) {
      await cover.click();
      await page.waitForSelector(".dt-overlay", {state: "visible", timeout: 8000})
          .catch(() => {});
      await shot(page, vp, "03-fiche-album", false); // surimpression fixe
      await page.keyboard.press("Escape");
    }

    await tab(page, "stats");
    await shot(page, vp, "04-stats");
    await tab(page, "chat");
    await shot(page, vp, "05-salon", false);
    await tab(page, "settings");
    await shot(page, vp, "06-reglages");
    await page.close();
  }
  await browser.close();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
