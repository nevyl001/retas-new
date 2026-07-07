#!/usr/bin/env node
/**
 * Auditoría read-only: contrato puntos Daniel N (RIV-00000009).
 * Simula capas SQL → career → breakdown sin hotfix.
 *
 * Uso: node scripts/audit-ranking-points-daniel.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const DANIEL_SLUG = "daniel-n";

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
  return createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function groupByOrg(rows, homeById) {
  const byOrg = new Map();
  const detail = [];
  for (const row of rows) {
    const meta = String(row.metadata?.organizador_id ?? "").trim();
    const home = homeById.get(row.jugador_id) ?? "";
    const org = meta || home;
    const pts = Number(row.puntos_obtenidos ?? 0);
    detail.push({
      id: row.id,
      evento: row.evento_nombre,
      pts,
      jugador_id: row.jugador_id,
      meta_org: meta || null,
      home_org: home || null,
      resolved_org: org || null,
      repair: row.metadata?.repair_reason ?? null,
    });
    if (!org) continue;
    byOrg.set(org, (byOrg.get(org) ?? 0) + pts);
  }
  const clubPoints = byOrg.get(HACKPADEL) ?? 0;
  const rivieraPoints = byOrg.get(RIVIERA_OPEN) ?? 0;
  const totalPoints = [...byOrg.values()].reduce((s, n) => s + n, 0);
  return { byOrg, clubPoints, rivieraPoints, totalPoints, detail };
}

function printLayer(name, snap, extra = "") {
  console.log(`\n── ${name} ──`);
  console.log(
    `  clubPoints (Hackpadel): ${snap.clubPoints}`,
    `\n  rivieraPoints:          ${snap.rivieraPoints}`,
    `\n  totalPoints:            ${snap.totalPoints}`
  );
  if (extra) console.log(`  ${extra}`);
}

async function main() {
  const sb = loadEnv();
  if (!sb) {
    console.error("Falta .env con REACT_APP_SUPABASE_URL / ANON_KEY");
    process.exit(1);
  }

  console.log("=== AUDITORÍA PUNTOS RANKING — Daniel N ===\n");

  const { data: profiles } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, slug, organizador_id, visible_publico")
    .eq("slug", DANIEL_SLUG)
    .eq("estado", "activo");

  const official = profiles?.find((p) => p.organizador_id === RIVIERA_OPEN);
  const hackRow = profiles?.find((p) => p.organizador_id === HACKPADEL);

  const { data: rankHack } = await sb.rpc("riviera_ranking_interno_por_organizador", {
    p_organizador_id: HACKPADEL,
    p_categoria: "5ta_fuerza",
    p_genero: "M",
  });
  const rpcDaniel = (rankHack ?? []).find((r) => r.slug === DANIEL_SLUG);

  printLayer(
    "1. SQL — riviera_ranking_interno_por_organizador (Hackpadel)",
    {
      clubPoints: Number(rpcDaniel?.puntos_totales ?? 0),
      rivieraPoints: 0,
      totalPoints: Number(rpcDaniel?.puntos_totales ?? 0),
    },
    `jugador_id=${rpcDaniel?.id ?? "—"} stats.puntos_totales scoped al club`
  );

  const anchor = official ?? profiles?.[0];
  if (!anchor) {
    console.error("Daniel N no encontrado");
    process.exit(1);
  }

  const { data: careerRows } = await sb.rpc(
    "riviera_list_career_participaciones_public",
    { p_jugador_id: anchor.id, p_limit: 500 }
  );

  const jugadorIds = [...new Set((careerRows ?? []).map((r) => r.jugador_id))];
  const { data: homes } = await sb
    .from("riviera_jugadores")
    .select("id, organizador_id")
    .in("id", jugadorIds.length ? jugadorIds : [anchor.id]);
  const homeById = new Map((homes ?? []).map((h) => [h.id, h.organizador_id]));

  const career = groupByOrg(careerRows ?? [], homeById);
  printLayer("2. SQL — riviera_list_career_participaciones_public + agrupación", career);

  console.log("\n  Detalle participaciones:");
  for (const d of career.detail) {
    console.log(
      `    • ${d.evento} (${d.pts} pts) meta=${d.meta_org?.slice(0, 8) ?? "—"} home=${d.home_org?.slice(0, 8) ?? "—"} => ${d.resolved_org?.slice(0, 8) ?? "—"}${d.repair ? ` [${d.repair}]` : ""}`
    );
  }

  printLayer(
    "3. Service — attachCareerPuntosToJugador (misma fuente que ranking enrich)",
    career,
    "Sin mergeCareerParticipacionesForIdentity ni supplement listParticipacionesPublic"
  );

  const multiClub =
    (career.clubPoints > 0 ? 1 : 0) + (career.rivieraPoints > 0 ? 1 : 0) >= 2;
  const uiLines = [];
  if (career.clubPoints > 0 || career.rivieraPoints >= 0) {
    if (career.clubPoints > 0)
      uiLines.push({ label: "Hackpadel", pts: career.clubPoints });
    if (career.rivieraPoints > 0)
      uiLines.push({ label: "Riviera Open", pts: career.rivieraPoints });
    if (multiClub && career.totalPoints > 0)
      uiLines.push({ label: "Total", pts: career.totalPoints });
  }

  printLayer("4. UI — buildJugadorPuntosBreakdown (simulado)", career);
  console.log("  Líneas renderizadas:", uiLines.map((l) => `${l.label}: ${l.pts}`).join(" | ") || "(fallback stats)");

  console.log("\n── Contrato esperado (usuario) ──");
  console.log("  clubPoints=75, rivieraPoints=75, totalPoints=150");

  if (career.clubPoints === 150 && career.rivieraPoints === 0) {
    console.log(
      "\n⚠ MUTACIÓN EN CAPA SQL/DATOS (antes del mapper):\n" +
        "  Todas las participaciones resuelven a Hackpadel.\n" +
        "  Revisar metadata.organizador_id en participación Remontada Final\n" +
        "  (repair manual_override_parent_deleted del 2026-07-06)."
    );
  }

  if (official) {
    const { data: st } = await sb
      .from("jugador_stats")
      .select("puntos_totales")
      .eq("jugador_id", official.id)
      .maybeSingle();
    console.log(`\n  jugador_stats oficial (${official.id.slice(0, 8)}): ${st?.puntos_totales ?? "—"}`);
  }
  if (rpcDaniel) {
    console.log(`  jugador_stats ranking Hackpadel (${rpcDaniel.id.slice(0, 8)}): ${rpcDaniel.puntos_totales}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
