#!/usr/bin/env node
/**
 * Preview READ-ONLY del backfill profile_link (equivalente al SQL preview).
 * NO ejecuta UPDATE.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) throw new Error("No .env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

function normalizeName(n) {
  return String(n ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

loadEnv();
const url = process.env.REACT_APP_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.REACT_APP_SUPABASE_ANON_KEY;
const usingService = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`DB: ${new URL(url).hostname}`);
  console.log(`Cliente: ${usingService ? "service_role (lectura completa)" : "anon (puede estar limitado por RLS)"}\n`);

  const { data: activePlayers, error: pErr } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id")
    .eq("estado", "activo");
  if (pErr) throw pErr;

  const { data: allLinks } = await supabase
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id, official_player_key");
  const linkedSet = new Set((allLinks ?? []).map((l) => String(l.riviera_jugador_id)));

  const { data: allGrants } = await supabase
    .from("organizer_player_access")
    .select("jugador_id, local_jugador_id, is_active")
    .eq("is_active", true);

  const { data: identities } = await supabase
    .from("riviera_official_player_identity")
    .select("official_player_key, riviera_id, canonical_riviera_jugador_id");

  const keyToIdentity = new Map(
    (identities ?? []).map((i) => [String(i.official_player_key), i])
  );

  const linkByJugador = new Map(
    (allLinks ?? []).map((l) => [String(l.riviera_jugador_id), l])
  );

  const orphans = [];
  for (const player of activePlayers ?? []) {
    const id = String(player.id);
    if (linkedSet.has(id)) continue;

    const grantAsLocal = (allGrants ?? []).find(
      (g) => String(g.local_jugador_id) === id
    );
    if (grantAsLocal?.jugador_id) continue;

    const { data: parts } = await supabase
      .from("jugador_participaciones")
      .select("id, puntos_obtenidos")
      .eq("jugador_id", id);

    const withPts = (parts ?? []).filter((p) => Number(p.puntos_obtenidos ?? 0) > 0);
    if (withPts.length === 0) continue;

    orphans.push({
      jugador_id: id,
      nombre: player.nombre,
      organizador_id: player.organizador_id,
      participaciones: withPts.length,
      puntos: withPts.reduce((s, p) => s + Number(p.puntos_obtenidos ?? 0), 0),
    });
  }

  const rows = [];
  for (const orphan of orphans) {
    const candidates = [];

    const grantMatch = (allGrants ?? []).find(
      (g) => String(g.local_jugador_id) === orphan.jugador_id && g.jugador_id
    );
    if (grantMatch) {
      const sourceLink = linkByJugador.get(String(grantMatch.jugador_id));
      if (sourceLink) {
        const ident = keyToIdentity.get(String(sourceLink.official_player_key));
        candidates.push({
          match_reason: "grant_to_canonical",
          dest_official_player_key: String(sourceLink.official_player_key),
          dest_riviera_id: ident?.riviera_id ?? null,
          source_jugador_id: String(grantMatch.jugador_id),
        });
      }
    }

    if (candidates.length === 0) {
      const norm = normalizeName(orphan.nombre);
      const sameName = (activePlayers ?? []).filter(
        (p) =>
          p.id !== orphan.jugador_id &&
          normalizeName(p.nombre) === norm &&
          linkByJugador.has(String(p.id))
      );
      for (const match of sameName) {
        const pl = linkByJugador.get(String(match.id));
        const ident = keyToIdentity.get(String(pl.official_player_key));
        candidates.push({
          match_reason: "same_name_single_match",
          dest_official_player_key: String(pl.official_player_key),
          dest_riviera_id: ident?.riviera_id ?? null,
          source_jugador_id: String(match.id),
        });
      }
    }

    const unique = candidates.filter(
      (c, i, arr) =>
        arr.findIndex(
          (x) => x.dest_official_player_key === c.dest_official_player_key
        ) === i
    );

    const action =
      unique.length === 1
        ? "LINK_PROFILE"
        : unique.length > 1
        ? "REVIEW_MANUAL"
        : "NO_MATCH";

    const riesgo =
      action === "LINK_PROFILE"
        ? unique[0].match_reason === "grant_to_canonical"
          ? "BAJO"
          : "MEDIO"
        : action === "REVIEW_MANUAL"
        ? "ALTO"
        : "ALTO";

    rows.push({
      riviera_id: unique.length === 1 ? unique[0].dest_riviera_id : null,
      jugador_afectado: orphan.nombre,
      orphan_jugador_id: orphan.jugador_id,
      club_organizador_id: orphan.organizador_id,
      perfiles_a_vincular: orphan.jugador_id,
      official_player_key_destino:
        unique.length === 1 ? unique[0].dest_official_player_key : null,
      source_jugador_id: unique.length === 1 ? unique[0].source_jugador_id : null,
      participaciones_a_recuperar: orphan.participaciones,
      puntos_a_recuperar: orphan.puntos,
      match_reason: unique.length === 1 ? unique[0].match_reason : null,
      candidatos: unique.length,
      action,
      riesgo,
    });
  }

  rows.sort((a, b) => b.participaciones_a_recuperar - a.participaciones_a_recuperar);

  const linkable = rows.filter((r) => r.action === "LINK_PROFILE");
  const review = rows.filter((r) => r.action === "REVIEW_MANUAL");
  const noMatch = rows.filter((r) => r.action === "NO_MATCH");

  console.log("══ PREVIEW BACKFILL profile_link (READ-ONLY) ══\n");
  console.log(`Huérfanos con participaciones: ${orphans.length}`);
  console.log(`LINK_PROFILE (auto): ${linkable.length}`);
  console.log(`REVIEW_MANUAL: ${review.length}`);
  console.log(`NO_MATCH: ${noMatch.length}\n`);

  if (linkable.length > 0) {
    console.log("── Tabla LINK_PROFILE ──\n");
    console.table(
      linkable.map((r) => ({
        riviera_id: r.riviera_id,
        jugador: r.jugador_afectado,
        orphan_id: r.orphan_jugador_id,
        official_player_key: r.official_player_key_destino,
        participaciones: r.participaciones_a_recuperar,
        puntos: r.puntos_a_recuperar,
        riesgo: r.riesgo,
        motivo: r.match_reason,
      }))
    );
  }

  if (review.length > 0) {
    console.log("\n── REVIEW_MANUAL ──\n");
    console.table(
      review.map((r) => ({
        jugador: r.jugador_afectado,
        candidatos: r.candidatos,
        participaciones: r.participaciones_a_recuperar,
      }))
    );
  }

  const outPath = resolve(root, "reports/preview-backfill-profile-link.json");
  try {
    writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
    console.log(`\nJSON guardado: ${outPath}`);
  } catch {
    console.log("\n(No se pudo escribir reports/ — tabla arriba es la fuente)");
  }

  return rows;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
