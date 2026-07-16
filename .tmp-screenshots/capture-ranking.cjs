/**
 * Visual capture for public ranking redesign.
 * Uses playwright-core + system Chrome.
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(__dirname);
const HACK_ORG = "e724de97-3552-4a01-a269-f621e6f1ed26";
const BASE = "http://localhost:3000";

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
];

async function waitBrandingReady(page) {
  await page.waitForFunction(
    () =>
      !document.documentElement.classList.contains("branding-bootstrapping") &&
      !document.documentElement.classList.contains("branding-transitioning"),
    { timeout: 60000 }
  );
}

async function waitRankingReady(page) {
  await page.waitForSelector(".rjp-ranking", { timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector(".rjp-ranking-skeleton"),
    { timeout: 60000 }
  );
  await page.waitForTimeout(600);
}

async function pickCategoryWithPlayers(page, minPlayers) {
  const chips = page.locator(".rjp-cat-chip");
  const chipCount = await chips.count();
  for (let i = 0; i < chipCount; i++) {
    await chips.nth(i).click();
    await page.waitForTimeout(900);
    const rows = await page.locator(".rjp-ranking-card").count();
    const podio = await page.locator(".rjp-podio__slot").count();
    const total = rows + (podio > 0 ? podio : 0);
    const empty = await page.locator(".rjp-ranking-empty-state").count();
    console.log(
      `chip ${i} rows=${rows} podio=${podio} total≈${total} empty=${empty}`
    );
    if (empty === 0 && total >= minPlayers) return true;
  }
  return false;
}

async function metrics(page, label) {
  return page.evaluate((lbl) => {
    const doc = document.documentElement;
    const ranking = document.querySelector(".rjp-ranking");
    const brand = document.documentElement.getAttribute("data-brand");
    const first = ranking?.children?.[0];
    const firstH = first ? first.getBoundingClientRect().height : 0;
    const overflowX = doc.scrollWidth > doc.clientWidth + 1;
    const tabs = [...document.querySelectorAll(".rj-genero-tabs__btn")].map(
      (el) => ({
        h: Math.round(el.getBoundingClientRect().height),
        text: el.textContent?.trim(),
      })
    );
    const chips = [...document.querySelectorAll(".rjp-cat-chip")].slice(0, 3).map(
      (el) => Math.round(el.getBoundingClientRect().height)
    );
    const order = [
      !!document.querySelector(".rjp-ranking-hero"),
      !!document.querySelector(".rjp-ranking-genero-tabs"),
      !!document.querySelector(".rjp-ranking-cats"),
      !!document.querySelector(".rjp-podio"),
      !!document.querySelector(".rjp-ranking-list"),
      !!document.querySelector(".rjp-ranking-rules"),
    ];
    return {
      label: lbl,
      brand,
      overflowX,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      firstViewportChildApprox: Math.round(firstH),
      tabs,
      chips,
      order,
      podioSlots: document.querySelectorAll(".rjp-podio__slot").length,
      rows: document.querySelectorAll(".rjp-ranking-card").length,
    };
  }, label);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    const url = `${BASE}/ranking/o/${HACK_ORG}/varonil`;
    console.log("viewport", vp.name, url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    await waitBrandingReady(page);
    await waitRankingReady(page);
    await pickCategoryWithPlayers(page, 3);

    const shot = path.join(OUT, `ranking-${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const m = await metrics(page, vp.name);
    report.push(m);
    console.log(JSON.stringify(m));
    await context.close();
  }

  // Extra states on 390
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/ranking/o/${HACK_ORG}/varonil`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await waitBrandingReady(page);
    await waitRankingReady(page);

    // empty-ish: try last categories
    const chips = page.locator(".rjp-cat-chip");
    const n = await chips.count();
    for (let i = n - 1; i >= 0; i--) {
      await chips.nth(i).click();
      await page.waitForTimeout(800);
      if ((await page.locator(".rjp-ranking-empty-state").count()) > 0) {
        await page.screenshot({
          path: path.join(OUT, "ranking-empty-390.png"),
          fullPage: true,
        });
        console.log("captured empty");
        break;
      }
    }

    await page.goto(`${BASE}/ranking/o/${HACK_ORG}/femenil`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await waitBrandingReady(page);
    await waitRankingReady(page);
    await page.screenshot({
      path: path.join(OUT, "ranking-femenil-390.png"),
      fullPage: true,
    });

    // Slow 3G hard reload branding check
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
      latency: 400,
    });
    await page.goto(`${BASE}/ranking/o/${HACK_ORG}/varonil`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    // Early snapshot before branding settles if possible
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT, "ranking-slow3g-early.png"),
    });
    await waitBrandingReady(page);
    await waitRankingReady(page);
    await page.screenshot({
      path: path.join(OUT, "ranking-slow3g-ready.png"),
      fullPage: true,
    });
    const earlyBrand = await page.evaluate(() => ({
      brand: document.documentElement.getAttribute("data-brand"),
      hasRivieraWord: /riviera open/i.test(document.body.innerText),
      heroText: document.querySelector(".rjp-ranking-hero")?.textContent?.slice(0, 200),
    }));
    report.push({ label: "slow3g-ready", ...earlyBrand });
    console.log("slow3g", JSON.stringify(earlyBrand));

    await context.close();
  }

  fs.writeFileSync(
    path.join(OUT, "ranking-metrics.json"),
    JSON.stringify(report, null, 2)
  );
  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
