/**
 * Capturas ficha — presencia de fotografía.
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
  { name: "320", width: 320, height: 568 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 },
];

async function waitReady(page) {
  await page.waitForFunction(
    () =>
      !document.documentElement.classList.contains("branding-bootstrapping"),
    { timeout: 60000 }
  );
}

async function openAnyFicha(page) {
  await page.goto(`${BASE}/ranking/o/${HACK_ORG}/varonil`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await waitReady(page);
  await page.waitForSelector(".rjp-ranking", { timeout: 60000 });
  await page.waitForTimeout(1000);

  const chips = page.locator(".rjp-cat-chip");
  const n = await chips.count();
  for (let i = n - 1; i >= 0; i--) {
    await chips.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1100);

    const card = page.locator("button.rjp-ranking-card").first();
    if ((await card.count()) > 0) {
      await card.click({ timeout: 8000 });
      await page.waitForURL(/\/public\/jugadores\//, { timeout: 20000 });
      await page.waitForSelector(".rjp-ficha-hero", { timeout: 20000 });
      return true;
    }

    const podio = page.locator("button.rjp-podio__slot:not([disabled])").first();
    if ((await podio.count()) > 0) {
      await podio.click({ timeout: 8000 });
      await page.waitForURL(/\/public\/jugadores\//, { timeout: 20000 });
      await page.waitForSelector(".rjp-ficha-hero", { timeout: 20000 });
      return true;
    }
  }
  return false;
}

async function metrics(page, label) {
  return page.evaluate((lbl) => {
    const media =
      document.querySelector(".rjp-ficha-hero__media") ||
      document.querySelector(".rjp-ficha-hero__avatar-wrap");
    const photo = document.querySelector(".rjp-ficha-hero__photo");
    const hero = document.querySelector(".rjp-ficha-hero");
    const mr = media?.getBoundingClientRect();
    const hr = hero?.getBoundingClientRect();
    const cs = media ? getComputedStyle(media) : null;
    const pcs = photo ? getComputedStyle(photo) : null;
    return {
      label: lbl,
      overflowX:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      mediaW: mr ? Math.round(mr.width) : null,
      mediaH: mr ? Math.round(mr.height) : null,
      mediaPctViewport: mr
        ? Math.round((mr.height / window.innerHeight) * 100)
        : null,
      heroW: hr ? Math.round(hr.width) : null,
      photoFractionOfHero:
        mr && hr && hr.width > 0
          ? Math.round((mr.width / hr.width) * 100)
          : null,
      aspect: cs?.aspectRatio,
      objectPosition: pcs?.objectPosition || null,
      hasPhoto: !!photo,
    };
  }, label);
}

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
  const ok = await openAnyFicha(page);
  if (!ok) throw new Error("Could not open ficha");
  console.log("ficha", page.url());
  await page.waitForTimeout(800);

  const report = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(450);
    await page.screenshot({
      path: path.join(OUT, `ficha-photo-${vp.name}.png`),
      fullPage: false,
    });
    const m = await metrics(page, vp.name);
    report.push(m);
    console.log(JSON.stringify(m));
  }

  fs.writeFileSync(
    path.join(OUT, "ficha-photo-metrics.json"),
    JSON.stringify(report, null, 2)
  );
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
