#!/usr/bin/env node
/**
 * Diagnóstico read-only: metadata.organizador_id en carrera por Riviera ID.
 * Uso: node scripts/diagnose-ranking-metadata-organizador.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

const TARGETS = [
  { nombre: "Nevyl", rivieraId: "RIV-00000011", esperado: { [HACKPADEL]: 50, [RIVIERA_OPEN]: 120, total: 170 } },
  { nombre: "Daniel N", rivieraId: "RIV-00000009", esperado: { [HACKPADEL]: 75, [RIVIERA_OPEN]: 75, total: 150 } },
  { nombre: "Alejandro R", rivieraId: "RIV-00000003", esperado: { [HACKPADEL]: 0, [RIVIERA_OPEN]: 75, total: 75 } },
  { nombre: "Edgardo T", rivieraId: "RIV-00000031", esperado: { [HACKPADEL]: 70, [RIVIERA_OPEN]: 50, total: 120 } },
  { nombre: "Irving", rivieraId: "RIV-00000019", esperado: { [HACKPADEL]: 50, [RIVIERA_OPEN]: 50, total: 100 } },
  { nombre: "Sebastian", rivieraId: "RIV-00000024", esperado: { [HACKPADEL]: 25, [RIVIERA_OPEN]: 25, total: 50 } },
  { nombre: "David R", rivieraId: "RIV-00000041", esperado: { [HACKPADEL]: 50, [RIVIERA_OPEN]: 550, total: 600 } },
];

const ORG_NAMES = {
  [HACKPADEL]: "Hackpadel",
  [RIVIERA_OPEN]: "Riviera Open",
};

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

function resolveOrg(row, homeById) {
  const meta = String(row.metadata?.organizador_id ?? "").trim();
  if (meta) return meta;
  const home = homeById.get(row.jugador_id) ?? "";
  return home || null;
}

function clubName(orgId) {
  return ORG_NAMES[orgId] ?? orgId?.slice(0, 8) ?? "—";
}

function repairFlags(meta) {
  const flags = [];
  if (meta?.repair_reason) flags.push(`repair_reason=${meta.repair_reason}`);
  if (meta?.repaired_from_orphan_parent) flags.push("repaired_from_orphan_parent");
  if (meta?.integrity_status) flags.push(`integrity=${meta.integrity_status}`);
  if (meta?.manual_override_id) flags.push(`override=${String(meta.manual_override_id).slice(0, 8)}`);
  return flags.join("; ") || "—";
}

async function resolveOfficialJugadorId(sb, rivieraId) {
  const { data: ident } = await sb
    .from("riviera_official_player_identity")
    .select("canonical_riviera_jugador_id, riviera_id")
    .eq("riviera_id", rivieraId)
    .maybeSingle();
  if (ident?.canonical_riviera_jugador_id) return ident.canonical_riviera_jugador_id;

  const { data: link } = await sb
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id")
    .limit(1);
  void link;

  const { data: viaLink } = await sb.rpc("get_public_riviera_ids_for_jugadores", {
    p_jugador_ids: [],
  });
  void viaLink;

  const { data: jugadores } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, slug, organizador_id")
    .eq("estado", "activo");

  for (const j of jugadores ?? []) {
    const { data: rid } = await sb.rpc("get_public_riviera_ids_for_jugadores", {
      p_jugador_ids: [j.id],
    });
    const match = (rid ?? []).find(
      (r) => String(typeof r === "string" ? r : r?.riviera_id ?? "").toUpperCase() === rivieraId
    );
    if (match) return j.id;
  }

  const { data: profiles } = await sb
    .from("riviera_jugadores")
    .select("id, nombre")
    .eq("estado", "activo")
    .ilike("nombre", "%");

  const target = TARGETS.find((t) => t.rivieraId === rivieraId);
  const byName = (profiles ?? []).find((p) => p.nombre === target?.nombre);
  return byName?.id ?? null;
}

async function main() {
  const sb = loadEnv();
  if (!sb) {
    console.error("Falta .env");
    process.exit(1);
  }

  console.log("=== DIAGNÓSTICO metadata.organizador_id (read-only) ===\n");
  console.log(`Hackpadel:     ${HACKPADEL}`);
  console.log(`Riviera Open:  ${RIVIERA_OPEN}\n`);

  const diagnosisRows = [];
  const allEventRows = [];

  for (const target of TARGETS) {
    const { data: identRow } = await sb
      .from("riviera_official_player_identity")
      .select("canonical_riviera_jugador_id, riviera_id")
      .eq("riviera_id", target.rivieraId)
      .maybeSingle();

    let anchorId = identRow?.canonical_riviera_jugador_id ?? null;

    if (!anchorId) {
      const { data: profiles } = await sb
        .from("riviera_jugadores")
        .select("id, nombre, organizador_id")
        .eq("nombre", target.nombre)
        .eq("estado", "activo");
      anchorId =
        profiles?.find((p) => p.organizador_id === RIVIERA_OPEN)?.id ??
        profiles?.[0]?.id ??
        null;
    }

    if (!anchorId) {
      console.error(`No se encontró jugador para ${target.rivieraId} ${target.nombre}`);
      continue;
    }

    const { data: careerIds, error: idsErr } = await sb.rpc(
      "get_public_career_jugador_ids",
      { p_jugador_id: anchorId }
    );
    if (idsErr) {
      console.error(`career ids ${target.nombre}:`, idsErr.message);
      continue;
    }

    const ids = [...new Set((careerIds ?? []).map(String))];
    const { data: homes } = await sb
      .from("riviera_jugadores")
      .select("id, nombre, organizador_id")
      .in("id", ids.length ? ids : [anchorId]);
    const homeById = new Map((homes ?? []).map((h) => [h.id, h.organizador_id]));

    const { data: careerRows, error: careerErr } = await sb.rpc(
      "riviera_list_career_participaciones_public",
      { p_jugador_id: anchorId, p_limit: 500 }
    );
    if (careerErr) {
      console.error(`career rpc ${target.nombre}:`, careerErr.message);
      continue;
    }

    const byMeta = new Map();
    for (const row of careerRows ?? []) {
      const metaOrg = String(row.metadata?.organizador_id ?? "").trim() || null;
      const resolved = resolveOrg(row, homeById);
      const pts = Number(row.puntos_obtenidos ?? 0);
      const homeOrg = homeById.get(row.jugador_id) ?? null;

      allEventRows.push({
        riviera_id: target.rivieraId,
        jugador_nombre: target.nombre,
        participacion_id: row.id,
        jugador_id: row.jugador_id,
        perfil_home_org: homeOrg,
        evento_nombre: row.evento_nombre,
        fecha: row.fecha,
        puntos: pts,
        metadata_organizador_id: metaOrg,
        organizador_resuelto: resolved,
        club_nombre_resuelto: clubName(resolved),
        repair_flags: repairFlags(row.metadata ?? {}),
        created_at: row.created_at,
        updated_at: row.metadata?.manual_override_approved_at ?? row.created_at,
      });

      if (resolved) {
        byMeta.set(resolved, (byMeta.get(resolved) ?? 0) + pts);
      }
    }

    const hpActual = byMeta.get(HACKPADEL) ?? 0;
    const roActual = byMeta.get(RIVIERA_OPEN) ?? 0;
    const totalActual = hpActual + roActual + [...byMeta.entries()]
      .filter(([k]) => k !== HACKPADEL && k !== RIVIERA_OPEN)
      .reduce((s, [, v]) => s + v, 0);

    const hpEsp = target.esperado[HACKPADEL] ?? 0;
    const roEsp = target.esperado[RIVIERA_OPEN] ?? 0;
    const totalEsp = target.esperado.total;

    let causa = "—";
    const repairedRows = (careerRows ?? []).filter(
      (r) => r.metadata?.repair_reason === "manual_override_parent_deleted"
    );
    const repairedHpOnRivieraProfile = repairedRows.filter((r) => {
      const home = homeById.get(r.jugador_id);
      return (
        home === RIVIERA_OPEN &&
        String(r.metadata?.organizador_id ?? "").trim() === HACKPADEL
      );
    });
    if (hpActual > hpEsp && roActual < roEsp && repairedHpOnRivieraProfile.length > 0) {
      causa = `repair 6-jul: ${repairedHpOnRivieraProfile.length} fila(s) perfil Riviera con meta Hackpadel`;
    } else if (hpActual > hpEsp && roActual < roEsp) {
      causa = "metadata.organizador_id apunta a Hackpadel en eventos que deberían ser Riviera";
    } else if (hpActual === hpEsp && roActual === roEsp) {
      causa = "OK en metadata actual";
    } else {
      causa = "revisar participaciones / perfiles enlazados";
    }

    diagnosisRows.push({
      jugador: target.nombre,
      riviera_id: target.rivieraId,
      ro_actual: roActual,
      hp_actual: hpActual,
      total_actual: totalActual,
      ro_esperado: roEsp,
      hp_esperado: hpEsp,
      total_esperado: totalEsp,
      diff_hp: hpActual - hpEsp,
      diff_ro: roActual - roEsp,
      diff_total: totalActual - totalEsp,
      causa_probable: causa,
      career_profile_ids: ids.map((id) => id.slice(0, 8)).join(", "),
      participaciones: careerRows?.length ?? 0,
    });
  }

  console.log("── TABLA DIAGNÓSTICO (agrupado por metadata resuelta) ──\n");
  console.log(
    "| Jugador | Riviera ID | RO pts actual | HP pts actual | Total | RO esperado | HP esperado | Total esp | Δ RO | Δ HP | Causa probable |"
  );
  console.log(
    "|---------|------------|---------------|---------------|-------|-------------|-------------|-----------|------|------|----------------|"
  );
  for (const r of diagnosisRows) {
    console.log(
      `| ${r.jugador} | ${r.riviera_id} | ${r.ro_actual} | ${r.hp_actual} | ${r.total_actual} | ${r.ro_esperado} | ${r.hp_esperado} | ${r.total_esperado} | ${r.diff_ro >= 0 ? "+" : ""}${r.diff_ro} | ${r.diff_hp >= 0 ? "+" : ""}${r.diff_hp} | ${r.causa_probable} |`
    );
  }

  console.log("\n── DETALLE POR EVENTO ──\n");
  for (const target of TARGETS) {
    const events = allEventRows.filter((e) => e.riviera_id === target.rivieraId);
    if (events.length === 0) continue;
    console.log(`\n### ${target.nombre} (${target.rivieraId})`);
    console.log(
      "riviera_id | jugador | evento | fecha | pts | metadata_org | resuelto | club | repair | created_at"
    );
    for (const e of events) {
      console.log(
        `${e.riviera_id} | ${e.jugador_nombre} | ${e.evento_nombre} | ${e.fecha} | ${e.puntos} | ${e.metadata_organizador_id?.slice(0, 8) ?? "—"} | ${e.organizador_resuelto?.slice(0, 8) ?? "—"} | ${e.club_nombre_resuelto} | ${e.repair_flags} | ${e.created_at}`
      );
    }
    console.log("\nAgrupado por metadata_organizador_id:");
    const agg = new Map();
    for (const e of events) {
      const k = e.metadata_organizador_id ?? "(null)";
      agg.set(k, (agg.get(k) ?? 0) + e.puntos);
    }
    for (const [k, v] of agg) {
      console.log(`  ${clubName(k === "(null)" ? null : k)} (${k}): ${v} pts`);
    }
  }

  console.log("\n── JSON (para auditoría) ──");
  console.log(JSON.stringify({ diagnosisRows, allEventRows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
