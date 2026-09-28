const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function capture(page, url, outFile, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: outFile, fullPage: false });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  return overflow;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const root = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(root, "tmp", "visual-qa"), { recursive: true });
  const base = "file://" + root;

  const shots = [
    ["public-desktop", `${base}/scripts/preview-duelo-public-result.html`, "tmp/visual-qa/duelo-public-result-1440x900.png", 1440, 900],
    ["celebrate-desktop", `${base}/scripts/preview-duelo-celebrate.html`, "tmp/visual-qa/duelo-celebrate-1440x900.png", 1440, 900],
    ["public-mobile", `${base}/scripts/preview-duelo-public-result.html`, "tmp/visual-qa/duelo-public-result-390x844.png", 390, 844],
    ["celebrate-mobile", `${base}/scripts/preview-duelo-celebrate.html`, "tmp/visual-qa/duelo-celebrate-390x844.png", 390, 844],
  ];

  const results = {};
  for (const [key, url, out, w, h] of shots) {
    results[key] = await capture(page, url, path.resolve(__dirname, "..", out), w, h);
    console.log(`${key}: scrollWidth=${results[key].scrollWidth} clientWidth=${results[key].clientWidth} overflow=${results[key].scrollWidth > results[key].clientWidth}`);
  }

  await browser.close();
})();
