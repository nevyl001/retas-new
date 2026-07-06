/**
 * Valida career totals en ficha pública (localhost).
 * node scripts/validate-career-totals-ui.mjs
 */
import { chromium } from "playwright";

const RIVIERA = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";

const CASES = [
  {
    label: "Sebastian / RIV-00000024",
    jugadorId: "c7440f26-3b4c-4c94-be55-3baef8e98820",
    orgs: [
      { name: "Riviera Open", id: RIVIERA },
      { name: "Hackpadel", id: HACKPADEL },
      { name: "Club Test", id: CLUB_TEST },
    ],
    expectedTotal: 50,
    expectedByClub: { [RIVIERA]: 25, [HACKPADEL]: 25 },
  },
  {
    label: "David R",
    jugadorId: "8b092e4c-8bdb-4df8-bd28-7039b31be01e",
    orgs: [
      { name: "Riviera Open", id: RIVIERA },
      { name: "Club Test", id: CLUB_TEST },
    ],
    expectedTotal: null,
  },
  {
    label: "Terry",
    jugadorId: null,
    rivieraId: "RIV-00000086",
    orgs: [
      { name: "Club Test", id: CLUB_TEST },
      { name: "Hackpadel", id: HACKPADEL },
      { name: "Riviera Open", id: RIVIERA },
    ],
    expectedTotal: null,
  },
];

function parseBreakdown(bodyText) {
  const lines = [...bodyText.matchAll(/([^:\n]+):\s*([\d,]+)\s*pts/g)].map(
    (m) => ({
      label: m[1].trim(),
      puntos: Number(m[2].replace(/,/g, "")),
    })
  );
  const totalLine = [...bodyText.matchAll(/Total:\s*([\d,]+)\s*pts/g)].pop();
  const total = totalLine ? Number(totalLine[1].replace(/,/g, "")) : null;
  const clubLines = lines.filter((l) => l.label !== "Total");
  return { total, clubLines, rawLines: lines };
}

async function resolveTerryId(page) {
  await page.goto(
    `http://localhost:3000/public/ranking?org=${CLUB_TEST}`,
    { waitUntil: "networkidle", timeout: 60000 }
  );
  await page.waitForTimeout(2000);
  const link = page.locator("text=Terry").first();
  if ((await link.count()) === 0) return null;
  const href = await link.evaluate((el) => {
    const a = el.closest("a");
    return a?.getAttribute("href") ?? null;
  });
  const m = href?.match(/jugadores\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

async function evaluateUrl(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const bodyText = await page.locator("body").innerText();
  return parseBreakdown(bodyText);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  let failed = false;

  for (const c of CASES) {
    let jugadorId = c.jugadorId;
    if (!jugadorId && c.rivieraId === "RIV-00000086") {
      jugadorId = await resolveTerryId(page);
    }
    if (!jugadorId) {
      results.push({ label: c.label, error: "No se resolvió jugadorId" });
      failed = true;
      continue;
    }

    const orgResults = [];
    let referenceTotal = c.expectedTotal;

    for (const org of c.orgs) {
      const url = `http://localhost:3000/public/jugadores/${jugadorId}?org=${org.id}`;
      const breakdown = await evaluateUrl(page, url);
      orgResults.push({
        org: org.name,
        url,
        ...breakdown,
      });
      if (referenceTotal == null && breakdown.total != null) {
        referenceTotal = breakdown.total;
      }
    }

    const totals = orgResults.map((r) => r.total).filter((t) => t != null);
    const consistent =
      totals.length > 0 && totals.every((t) => t === totals[0]);
    const expectedOk =
      c.expectedTotal == null
        ? consistent
        : totals.every((t) => t === c.expectedTotal);

    if (!consistent || !expectedOk) failed = true;

    results.push({
      label: c.label,
      jugadorId,
      referenceTotal,
      expectedTotal: c.expectedTotal,
      consistent,
      expectedOk,
      orgResults,
    });
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (failed) {
    console.error("\nVALIDACIÓN FALLIDA");
    process.exit(1);
  }
  console.log("\nVALIDACIÓN OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
