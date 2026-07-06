#!/usr/bin/env node
/**
 * Diagnóstico read-only: metadata.organizador_id vs evento padre.
 * Uso: node scripts/diagnose-career-event-host-organizer.mjs
 *
 * Requiere .env con REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY
 * (o SUPABASE_SERVICE_ROLE_KEY para lectura completa).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const TARGET_NAMES = [
  "Daniel N",
  "Nevyl",
  "Sebastian",
  "TestplayerCT1",
  "TestplaCT2",
];
const TARGET_RIVIERA = ["RIV-00000102", "RIV-00000103"];
const CRITICAL_EVENTS = [
  "Reta Nocturna",
  "Lunes Mixta",
  "Hack Padel 5ta Fuerza",
  "Hackpadel 5ta Fuerza",
];

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const url = process.env.REACT_APP_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Falta .env con REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY"
  );
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function expectedHostOrg(tipoEvento, eventoId) {
  const { data, error } = await sb.rpc("riviera_participacion_expected_host_org", {
    p_tipo_evento: tipoEvento,
    p_evento_id: eventoId,
  });
  if (error) {
    return { org: null, error: error.message };
  }
  return { org: data ?? null, error: null };
}

async function resolveLinkedJugadorIds() {
  const ids = new Set();

  const { data: byName } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id, riviera_id")
    .in("nombre", TARGET_NAMES);

  for (const row of byName ?? []) {
    ids.add(String(row.id));
  }

  const { data: byRiviera } = await sb
    .from("riviera_official_player_identity")
    .select("riviera_id, official_player_key")
    .in("riviera_id", TARGET_RIVIERA);

  for (const ri of byRiviera ?? []) {
    const { data: links } = await sb
      .from("riviera_official_player_profile_link")
      .select("riviera_jugador_id")
      .eq("official_player_key", ri.official_player_key);
    for (const l of links ?? []) {
      ids.add(String(l.riviera_jugador_id));
    }
  }

  return [...ids];
}

function estado(metaOrg, expectedOrg) {
  if (!expectedOrg) return "SIN_PADRE";
  if (!metaOrg || metaOrg !== expectedOrg) return "MAL";
  return "OK";
}

async function main() {
  console.log("=== DIAGNÓSTICO career event host organizer ===\n");

  const jugadorIds = await resolveLinkedJugadorIds();
  if (jugadorIds.length === 0) {
    console.log("No se encontraron perfiles objetivo.");
    process.exit(0);
  }

  const { data: jugadores } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id, riviera_id")
    .in("id", jugadorIds);

  const nameById = new Map(
    (jugadores ?? []).map((j) => [j.id, j.nombre])
  );

  const { data: participaciones, error } = await sb
    .from("jugador_participaciones")
    .select(
      "id, jugador_id, evento_id, evento_nombre, tipo_evento, puntos_obtenidos, metadata"
    )
    .in("jugador_id", jugadorIds)
    .order("evento_nombre");

  if (error) {
    console.error("Error cargando participaciones:", error.message);
    process.exit(1);
  }

  const rows = [];
  let mal = 0;
  let ok = 0;

  for (const jp of participaciones ?? []) {
    const meta = jp.metadata ?? {};
    const metaOrg = String(meta.organizador_id ?? "").trim();
    const metaClub = String(meta.club_name ?? "").trim();
    const { org: expectedOrg, error: rpcErr } = await expectedHostOrg(
      jp.tipo_evento,
      jp.evento_id
    );

    if (rpcErr?.includes("riviera_participacion_expected_host_org")) {
      console.warn(
        "RPC riviera_participacion_expected_host_org no desplegado. Ejecuta diagnose-career-event-host-organizer.sql primero."
      );
      process.exit(2);
    }

    const st = estado(metaOrg, expectedOrg);
    if (st === "MAL") mal += 1;
    if (st === "OK") ok += 1;

    rows.push({
      jugador: nameById.get(jp.jugador_id) ?? jp.jugador_id,
      evento: jp.evento_nombre,
      tipo: jp.tipo_evento,
      puntos: jp.puntos_obtenidos ?? 0,
      metadata_organizador_id: metaOrg || "(vacío)",
      metadata_club_name: metaClub || "(vacío)",
      expected_organizador_id: expectedOrg ?? "(sin padre)",
      estado: st,
    });
  }

  console.table(rows);

  console.log(`\nResumen: OK=${ok} MAL=${mal} total=${rows.length}\n`);

  console.log("── Eventos críticos HackPadel ──");
  for (const ev of CRITICAL_EVENTS) {
    const hits = rows.filter((r) =>
      r.evento.toLowerCase().includes(ev.toLowerCase())
    );
    if (hits.length === 0) continue;
    for (const h of hits) {
      const hackOk =
        h.expected_organizador_id === HACKPADEL && h.estado === "OK";
      console.log(
        `  ${h.jugador} | ${h.evento} | meta=${h.metadata_organizador_id} | expected=${h.expected_organizador_id} | ${hackOk ? "OK" : "MAL"}`
      );
    }
  }

  const byPlayer = new Map();
  for (const r of rows) {
    const key = r.jugador;
    if (!byPlayer.has(key)) {
      byPlayer.set(key, { ok: 0, mal: 0, ptsHackOk: 0, ptsHackMal: 0 });
    }
    const agg = byPlayer.get(key);
    if (r.estado === "OK") agg.ok += 1;
    if (r.estado === "MAL") agg.mal += 1;
    if (r.expected_organizador_id === HACKPADEL) {
      if (r.estado === "OK") agg.ptsHackOk += r.puntos;
      if (r.estado === "MAL") agg.ptsHackMal += r.puntos;
    }
  }

  console.log("\n── Puntos HackPadel por jugador (esperado post-repair) ──");
  for (const [nombre, agg] of byPlayer) {
    console.log(
      `  ${nombre}: OK=${agg.ok} MAL=${agg.mal} | pts HackPadel OK=${agg.ptsHackOk} MAL=${agg.ptsHackMal}`
    );
  }

  if (mal > 0) {
    console.log(
      "\n⚠ Hay participaciones MAL. Ejecuta supabase/repair-career-event-host-organizer.sql"
    );
    process.exit(1);
  }

  console.log("\n✓ Todas las participaciones objetivo: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
