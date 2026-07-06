/**
 * Evidencia hardening: Terry cross-org + identity RPC.
 * node scripts/validate-hardening-evidence.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const text = readFileSync(resolve(root, ".env"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const sb = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const TERRY = "6eaf0141-f09e-41ce-b06d-7aae7d925d63";
const RIVIERA_ID = "RIV-00000086";
const ORGS = {
  clubTest: "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d",
  riviera: "2770b522-9064-4c7b-a729-4a0ea7e3f6e8",
  hackpadel: "e724de97-3552-4a01-a269-f621e6f1ed26",
};

function parsePage(bodyText) {
  const notFound =
    /no encontrado|jugador no encontrado|404/i.test(bodyText) &&
    !bodyText.includes("Terry");
  const name = bodyText.match(/\bTerry\b/) ? "Terry" : null;
  const total = [...bodyText.matchAll(/Total:\s*([\d,]+)\s*pts/g)].pop();
  const simple = bodyText.match(/PUNTOS\s*\n\s*([\d,]+)/);
  const rank = bodyText.match(/#(\d+)/);
  const historialCount = bodyText.match(/Todos\s+(\d+)/);
  const ratingSection = bodyText.includes("ÚLTIMOS MOVIMIENTOS");
  const ratingMoves = ratingSection
    ? (bodyText.match(/Duelo|Reta|Torneo|▲|▼/gi) || []).length
    : 0;
  const breakdown = [...bodyText.matchAll(/([^:\n]+):\s*([\d,]+)\s*pts/g)].map(
    (m) => ({ label: m[1].trim(), puntos: Number(m[2].replace(/,/g, "")) })
  );
  return {
    notFound,
    name,
    total: total ? Number(total[1].replace(/,/g, "")) : null,
    simple: simple ? Number(simple[1].replace(/,/g, "")) : null,
    rank: rank ? Number(rank[1]) : null,
    historialCount: historialCount ? Number(historialCount[1]) : null,
    ratingMoves,
    breakdown,
  };
}

async function checkRpcDeployed() {
  const { data, error } = await sb.rpc("resolve_public_player_identity", {
    p_jugador_id: TERRY,
    p_riviera_id: null,
  });
  return {
    deployed: !error,
    error: error?.message ?? null,
    rowCount: data?.length ?? 0,
    sample: data?.slice(0, 3) ?? null,
  };
}

async function resolveTerrySlug() {
  const { data } = await sb.rpc("riviera_jugador_interno_por_id", {
    p_organizador_id: ORGS.clubTest,
    p_jugador_id: TERRY,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return row?.slug ? String(row.slug) : null;
}

async function validateTerryUi() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  for (const [label, orgId] of [
    ["Club Test", ORGS.clubTest],
    ["Riviera Open", ORGS.riviera],
    ["Hackpadel", ORGS.hackpadel],
  ]) {
    const url = `http://localhost:3000/public/jugadores/${TERRY}?org=${orgId}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3500);
    const bodyText = await page.locator("body").innerText();
    results.push({
      org: label,
      orgId,
      url,
      ...parsePage(bodyText),
    });
  }

  await browser.close();
  return results;
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    rpc: await checkRpcDeployed(),
    terryUuid: TERRY,
    rivieraId: RIVIERA_ID,
    slug: await resolveTerrySlug(),
    ui: await validateTerryUi(),
  };

  const opens = report.ui.filter((r) => r.name === "Terry" && !r.notFound);
  const totals = opens.map((r) => r.total ?? r.simple).filter((t) => t != null);
  const historiales = opens.map((r) => r.historialCount).filter((h) => h != null);
  const ratings = opens.map((r) => r.ratingMoves);

  report.summary = {
    rpcDeployed: report.rpc.deployed,
    opensCount: opens.length,
    allThreeOpen: opens.length === 3,
    totalsConsistent:
      totals.length > 0 && totals.every((t) => t === totals[0]),
    globalTotal: totals[0] ?? null,
    historialConsistent:
      historiales.length > 0 && historiales.every((h) => h === historiales[0]),
    historialLength: historiales[0] ?? null,
    ratingConsistent:
      ratings.length > 0 && ratings.every((r) => r === ratings[0]),
    rankingByOrg: report.ui.map((r) => ({
      org: r.org,
      rank: r.rank,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.summary.rpcDeployed &&
    report.summary.allThreeOpen &&
    report.summary.totalsConsistent &&
    report.summary.historialConsistent;

  if (!ok) {
    console.error("\nVALIDACIÓN INCOMPLETA — ver summary");
    process.exit(1);
  }
  console.log("\nVALIDACIÓN TERRY OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
