/**
 * Evidencia navegación ranking → perfil → volver (categoría restaurada).
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(__dirname);
const HACK_ORG = "e724de97-3552-4a01-a269-f621e6f1ed26";
const BASE = "http://localhost:3000";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  const rankingUrl = `${BASE}/ranking/o/${HACK_ORG}/varonil`;
  await page.goto(rankingUrl, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".rjp-ranking", { timeout: 60000 });
  await page.waitForTimeout(800);

  const chips = page.locator(".rjp-cat-chip");
  const count = await chips.count();
  let targetIdx = -1;
  for (let i = 0; i < count; i++) {
    await chips.nth(i).click();
    await page.waitForTimeout(900);
    const rows = await page.locator(".rjp-ranking-card, .rjp-podio__slot").count();
    if (rows > 0) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx < 0) throw new Error("No category with players");

  const catBefore = await page.evaluate(() => {
    const active = document.querySelector(".rjp-cat-chip--active");
    return {
      text: active?.textContent?.trim(),
      stored: Object.keys(sessionStorage)
        .filter((k) => k.includes("rjp_public_ranking_categoria"))
        .map((k) => [k, sessionStorage.getItem(k)]),
      meta: document.querySelector(".rjp-ranking-hero__meta")?.textContent,
    };
  });
  console.log("before", JSON.stringify(catBefore));

  const playerBtn = page.locator(".rjp-podio__slot, .rjp-ranking-card").first();
  await playerBtn.click();
  await page.waitForTimeout(2000);
  const onFicha = page.url().includes("jugadores") || page.url().includes("player");
  console.log("ficha url", page.url(), "ok", onFicha);

  await page.locator(".rjp-ficha-topbar__back").click();
  await page.waitForSelector(".rjp-ranking", { timeout: 60000 });
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const active = document.querySelector(".rjp-cat-chip--active");
    return {
      url: location.pathname,
      text: active?.textContent?.trim(),
      meta: document.querySelector(".rjp-ranking-hero__meta")?.textContent,
      stored: Object.keys(sessionStorage)
        .filter((k) => k.includes("rjp_public_ranking_categoria"))
        .map((k) => [k, sessionStorage.getItem(k)]),
    };
  });
  console.log("after", JSON.stringify(after));

  const sameCat =
    (catBefore.meta || "").includes("fuerza") ||
    (catBefore.meta || "").includes("Open");
  const restored =
    after.meta === catBefore.meta ||
    (after.stored?.[0]?.[1] &&
      catBefore.stored?.[0]?.[1] &&
      after.stored[0][1] === catBefore.stored[0][1]);

  await page.screenshot({
    path: path.join(OUT, "ranking-nav-back-categoria.png"),
    fullPage: true,
  });

  const report = { catBefore, after, restored, sameCat };
  fs.writeFileSync(
    path.join(OUT, "ranking-nav-back.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("restored", restored);
  await browser.close();
  if (!restored) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
