#!/usr/bin/env node
/**
 * Replay de assertions post-sync para un duelo ya finalizado.
 * No re-sincroniza participaciones; valida integridad con el path corregido.
 *
 * Uso: npm run replay:career-assertions-duelo
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const EVENTO_ID = "41e90d4c-fd2c-41fe-9b19-627aebac3bfa";
const RIVIERA_ID_RE = /^RIV-[0-9]{8}$/;

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) throw new Error("No .env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

async function fetchRivieraIds(sb, jugadorIds) {
  const map = new Map();
  const { data, error } = await sb.rpc("get_public_riviera_ids_for_jugadores", {
    p_jugador_ids: jugadorIds,
  });
  if (error) throw error;
  for (const row of data ?? []) {
    const id = String(row.jugador_id ?? "");
    const rivieraId = String(row.riviera_id ?? "");
    if (id && RIVIERA_ID_RE.test(rivieraId)) map.set(id, rivieraId);
  }
  return map;
}

async function main() {
  loadEnv();
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Faltan credenciales Supabase en .env");

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: duelo, error: dueloError } = await sb
    .from("duelos_2v2")
    .select("id, nombre, organizador_id, estado, ganador")
    .eq("id", EVENTO_ID)
    .maybeSingle();
  if (dueloError || !duelo) throw dueloError ?? new Error("Duelo no encontrado");

  const { data: participaciones, error: partError } = await sb
    .from("jugador_participaciones")
    .select("id, jugador_id, puntos_obtenidos, metadata")
    .eq("tipo_evento", "duelo_2v2")
    .eq("evento_id", EVENTO_ID);
  if (partError) throw partError;

  const jugadorIds = [...new Set((participaciones ?? []).map((p) => p.jugador_id))];
  const rivieraIds = await fetchRivieraIds(sb, jugadorIds);
  const failures = [];

  console.log(`Duelo: ${duelo.nombre} (${EVENTO_ID})`);
  console.log(`Participaciones: ${participaciones?.length ?? 0}`);
  console.log(`Jugadores: ${jugadorIds.length}\n`);

  if ((participaciones ?? []).length === 0) {
    failures.push({ code: "missing_historial", message: "Sin participaciones" });
  }

  for (const jugadorId of jugadorIds) {
    const rows = (participaciones ?? []).filter((p) => p.jugador_id === jugadorId);
    if (rows.length === 0) {
      failures.push({
        code: "missing_historial",
        message: `Jugador ${jugadorId} sin historial`,
        jugadorId,
      });
      continue;
    }

    for (const row of rows) {
      const meta = row.metadata ?? {};
      if (!String(meta.organizador_id ?? "").trim()) {
        failures.push({
          code: "missing_organizador_id",
          message: `metadata.organizador_id ausente (${row.id})`,
          jugadorId,
        });
      }
      if (!String(meta.club_name ?? "").trim()) {
        failures.push({
          code: "missing_club_name",
          message: `metadata.club_name ausente (${row.id})`,
          jugadorId,
        });
      }
    }

    const totalPuntos = rows.reduce(
      (sum, r) => sum + Math.max(0, r.puntos_obtenidos ?? 0),
      0
    );
    if (totalPuntos <= 0) {
      failures.push({
        code: "missing_global_points",
        message: `Sin puntos para ${jugadorId}`,
        jugadorId,
      });
    }

    const { data: rating } = await sb
      .from("rating_historial")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("partido_ref", `duelo2v2:${EVENTO_ID}`)
      .limit(1)
      .maybeSingle();
    if (!rating) {
      failures.push({
        code: "missing_rating",
        message: `Sin rating para ${jugadorId}`,
        jugadorId,
      });
    }

    const rivieraId = rivieraIds.get(jugadorId);
    if (!rivieraId) {
      failures.push({
        code: "missing_riviera_id",
        message: `Riviera ID ausente para ${jugadorId}`,
        jugadorId,
      });
    }

    const { data: stats } = await sb
      .from("jugador_stats")
      .select("jugador_id")
      .eq("jugador_id", jugadorId)
      .maybeSingle();
    if (!stats) {
      failures.push({
        code: "missing_stats",
        message: `jugador_stats ausente para ${jugadorId}`,
        jugadorId,
      });
    }
  }

  const ok = failures.length === 0;
  const processed = jugadorIds.length > 0;

  console.log("── Resultado (assertions post-sync, path corregido) ──");
  console.log(JSON.stringify({ ok, processed, failures, touchedJugadorIds: jugadorIds }, null, 2));

  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
