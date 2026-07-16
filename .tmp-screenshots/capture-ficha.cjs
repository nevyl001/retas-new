/**
 * Visual capture helper for public ficha polish (dev only).
 * Uses playwright-core + system Chrome already in node_modules.
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const rankingUrl = `${BASE}/ranking/o/${HACK_ORG}/varonil`;
  console.log("open", rankingUrl);
  await page.goto(rankingUrl, { waitUntil: "networkidle", timeout: 60000 });
  await waitBrandingReady(page);
  await page.waitForSelector(".rjp-ranking", { timeout: 60000 });
  await page.waitForTimeout(1000);

  // Try category chips until we find player rows
  const chips = page.locator(".rjp-cat-chip");
  const chipCount = await chips.count();
  console.log("chips", chipCount);
  let foundPlayers = false;
  for (let i = 0; i < chipCount; i++) {
    await chips.nth(i).click();
    await page.waitForTimeout(1200);
    const empty = await page.locator(".rjp-ranking-empty").count();
    const rows = await page.locator(".rjp-ranking-table tbody tr, .rjp-ranking-list__item, .rjp-podio-card, [class*='ranking-row']").count();
    const text = await page.locator(".rjp-ranking").innerText();
    console.log("chip", i, "empty", empty, "rows", rows, "snippet", text.slice(0, 120).replace(/\n/g, " "));
    if (empty === 0 && (rows > 0 || /#\d/.test(text))) {
      foundPlayers = true;
      break;
    }
  }

  await page.screenshot({
    path: path.join(OUT, "01-ranking-1280.png"),
    fullPage: true,
  });

  // Click first interactive player-looking control
  const candidates = [
    ".rjp-podio-card",
    ".rjp-ranking-table tbody tr",
    ".rjp-ranking-list__item",
    "button.rjp-ranking-player",
    "[class*='RankingPodio'] button",
    ".rjp-ranking button:has-text('#')",
  ];
  let navigated = false;
  for (const sel of candidates) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      console.log("click", sel);
      await el.click();
      await page.waitForTimeout(2000);
      if (page.url().includes("jugador") || page.url().includes("player") || page.url().includes("public/jugadores")) {
        navigated = true;
        break;
      }
    }
  }

  if (!navigated) {
    // Dump structure for debugging
    const structure = await page.evaluate(() => {
      const root = document.querySelector(".rjp-ranking-panel__body, .rjp-ranking");
      if (!root) return "no panel";
      return Array.from(root.querySelectorAll("*"))
        .slice(0, 80)
        .map((el) => el.tagName + "." + String(el.className).slice(0, 60));
    });
    console.log("structure", structure);
    fs.writeFileSync(path.join(OUT, "ranking-panel.txt"), String(structure));
  }

  let fichaUrl = page.url();
  if (!fichaUrl.includes("jugador") && !fichaUrl.includes("/players/") && !fichaUrl.includes("public/jugadores")) {
    console.log("Could not open ficha from ranking. foundPlayers=", foundPlayers);
    await browser.close();
    return;
  }

  console.log("ficha", fichaUrl);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(fichaUrl, { waitUntil: "networkidle", timeout: 60000 });
    await waitBrandingReady(page);
    await page.waitForSelector(".rjp-ficha, .rjp-ficha-skel", { timeout: 60000 });
    // Wait content or empty
    await page.waitForTimeout(1500);
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        hasOverflowX: doc.scrollWidth > doc.clientWidth + 1,
        name: document.querySelector(".rjp-ficha-hero__name")?.textContent || null,
        hasPhoto: Boolean(document.querySelector(".rjp-ficha-hero__photo")),
        kariera: Boolean(document.querySelector(".rjp-ficha-historial")),
        activityRows: document.querySelectorAll(".rjp-ficha-activity__row").length,
        rating: Boolean(document.querySelector(".rjp-rating-nivel")),
        dataBrand:
          document.querySelector(".club-experience-scope")?.getAttribute("data-brand") ||
          document.documentElement.getAttribute("data-club"),
        brandingStatus: document
          .querySelector(".club-experience-scope")
          ?.getAttribute("data-branding-status"),
        heroMediaH: document.querySelector(".rjp-ficha-hero__media")?.getBoundingClientRect().height || 0,
        backH: document.querySelector(".rjp-ficha-topbar__back")?.getBoundingClientRect().height || 0,
      };
    });
    console.log(vp.name, JSON.stringify(metrics));
    await page.screenshot({
      path: path.join(OUT, `ficha-${vp.name}.png`),
      fullPage: true,
    });
  }

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
