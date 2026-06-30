import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "mobile-login");
const baseUrl = process.env.AUTH_URL || "http://localhost:3000/";

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".auth-form-card", { timeout: 15000 });
  await page.waitForTimeout(800);

  const cardTop = await page.evaluate(() => {
    const card = document.querySelector(".auth-form-card");
    return card ? Math.round(card.getBoundingClientRect().top) : null;
  });

  await page.screenshot({
    path: path.join(outDir, `login-${vp.name}.png`),
    fullPage: false,
  });

  console.log(`${vp.name}: card top = ${cardTop}px (viewport ${vp.height}px)`);
}

await browser.close();
