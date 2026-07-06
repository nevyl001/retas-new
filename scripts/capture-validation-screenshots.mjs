/**
 * Captura evidencia UI + consola GoTrue para validación.
 * node scripts/capture-validation-screenshots.mjs
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../assets/validation-evidence");
mkdirSync(outDir, { recursive: true });

const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const DAVID_ID = "8b092e4c-8bdb-4df8-bd28-7039b31be01e";
const DAVID_ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

const CASES = [
  {
    name: "david-r-club-context",
    url: `http://localhost:3000/public/jugadores/${DAVID_ID}?org=${DAVID_ORG}`,
    org: DAVID_ORG,
  },
  {
    name: "david-r-global",
    url: `http://localhost:3000/public/jugadores/${DAVID_ID}`,
    org: null,
  },
  {
    name: "david-r-club-test",
    url: `http://localhost:3000/public/jugadores/${DAVID_ID}?org=${CLUB_TEST}`,
    org: CLUB_TEST,
  },
];

async function extractMetrics(page) {
  await page.waitForTimeout(3500);
  const bodyText = await page.locator("body").innerText();
  const hasSinParticipaciones = bodyText.includes("Sin participaciones registradas");
  const hasHistorial = bodyText.includes("Historial completo");
  const rankingMatch = bodyText.match(/#(\d+)/);
  const ptsMatches = [...bodyText.matchAll(/([\d,]+)\s*pts/g)].map((m) => m[1]);
  const historialItems = await page
    .locator(".rj-historial-timeline__item, .rj-historial-timeline--public .rj-historial-timeline__item")
    .count()
    .catch(() => 0);
  const ratingMoves = bodyText.includes("Últimos movimientos")
    ? (bodyText.match(/Duelo|Reta|Torneo|Americano|Liga/gi) || []).length
    : 0;
  return {
    hasSinParticipaciones,
    hasHistorial,
    rankingHash: rankingMatch?.[0] ?? null,
    ptsLines: ptsMatches.slice(0, 6),
    historialDomItems: historialItems,
    bodySnippet: bodyText.slice(0, 500).replace(/\s+/g, " "),
  };
}

async function main() {
  const consoleWarnings = [];
  const results = [];

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const iphone = devices["iPhone 14 Pro Max"];

  for (const c of CASES) {
    const page = await desktop.newPage();
    page.on("console", (msg) => {
      const t = msg.text();
      if (t.includes("GoTrueClient") || t.includes("Multiple GoTrueClient")) {
        consoleWarnings.push({ url: c.url, type: msg.type(), text: t });
      }
    });
    await page.goto(c.url, { waitUntil: "networkidle", timeout: 60000 });
    const metrics = await extractMetrics(page);
    const shot = resolve(outDir, `${c.name}-desktop.png`);
    await page.screenshot({ path: shot, fullPage: true });
    results.push({ ...c, viewport: "desktop", metrics, screenshot: shot });
    await page.close();
  }

  const mobileCase = CASES[0];
  const mpage = await browser.newContext({ ...iphone });
  const mp = await mpage.newPage();
  mp.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("GoTrueClient")) {
      consoleWarnings.push({ url: mobileCase.url, type: msg.type(), text: t });
    }
  });
  await mp.goto(mobileCase.url, { waitUntil: "networkidle", timeout: 60000 });
  const mmetrics = await extractMetrics(mp);
  const mshot = resolve(outDir, `david-r-mobile.png`);
  await mp.screenshot({ path: mshot, fullPage: true });
  results.push({
    ...mobileCase,
    viewport: "iPhone 14 Pro Max",
    metrics: mmetrics,
    screenshot: mshot,
  });
  await mpage.close();

  // Terry: try slug search via ranking club test
  const terryPage = await desktop.newPage();
  await terryPage.goto(
    `http://localhost:3000/ranking/o/${CLUB_TEST}/varonil`,
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await terryPage.waitForTimeout(2000);
  const terryLink = terryPage.locator("text=Terry").first();
  const terryExists = (await terryLink.count()) > 0;
  let terryResults = { terryExists, urls: [] };
  if (terryExists) {
    await terryLink.click();
    await terryPage.waitForTimeout(3000);
    const url1 = terryPage.url();
    const m1 = await extractMetrics(terryPage);
    const s1 = resolve(outDir, "terry-club-test-desktop.png");
    await terryPage.screenshot({ path: s1, fullPage: true });
    terryResults.urls.push({ url: url1, metrics: m1, screenshot: s1 });
    // open same player global
    const playerId = url1.match(/jugadores\/([^?]+)/)?.[1];
    if (playerId) {
      const url2 = `http://localhost:3000/public/jugadores/${playerId}`;
      await terryPage.goto(url2, { waitUntil: "networkidle", timeout: 60000 });
      const m2 = await extractMetrics(terryPage);
      const s2 = resolve(outDir, "terry-global-desktop.png");
      await terryPage.screenshot({ path: s2, fullPage: true });
      terryResults.urls.push({ url: url2, metrics: m2, screenshot: s2 });
    }
  }
  await terryPage.close();

  // Empty history player - RIV-00000096 from user screenshots
  const emptyPage = await desktop.newPage();
  const emptyUrl = `http://localhost:3000/public/jugadores/david-r`; // fallback slug
  // try find testplayer from ranking
  await browser.close();

  const report = {
    consoleWarnings,
    results,
    terry: terryResults,
    generatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
