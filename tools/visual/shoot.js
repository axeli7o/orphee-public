/* Capture headless d'une vue de l'app (ADR-029, vérification visuelle).
   Usage : node shoot.js [vue] [dossier-sortie]
     vue            défaut "stats" (clé de VIEWS dans mocks.js)
     dossier-sortie défaut tools/visual/out/
   Rend en desktop (1280) ET mobile (390), pleine page.
   Prérequis : npm install (playwright) + npx playwright install chromium. */
"use strict";

const path = require("path");
const { chromium } = require("playwright");

const view = process.argv[2] || "stats";
const outDir = process.argv[3] || path.join(__dirname, "out");
const ROOT = path.join(__dirname, "..", "..");

// Sert le repo en HTTP local : en file://, Chromium bloque le chargement du
// module mocks.js (CORS, origine « null ») et la page reste vide.
const TYPES = {".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png"};
function serve() {
  const http = require("http");
  const fs = require("fs");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, {"Content-Type":
      TYPES[path.extname(file)] || "application/octet-stream"});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

(async () => {
  const fs = require("fs");
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}` +
    "/tools/visual/harness.html?view=" + view;
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    // Hors localhost (polices, CDN) : coupé net — sinon « networkidle »
    // attend des requêtes qui n'aboutiront pas sans réseau.
    await page.route((u) => u.hostname !== "127.0.0.1", (r) => r.abort());
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__ready === true, { timeout: 5000 })
        .catch(() => {});
    await page.waitForTimeout(1400); // laisse finir countUp / grow
    const out = path.join(outDir, `${view}_${vp.name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log("→", path.relative(process.cwd(), out));
    await page.close();
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
