/**
 * Evidencia de validación — perfil público global.
 * Uso: node scripts/validate-public-profile-evidence.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
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
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Faltan REACT_APP_SUPABASE_URL / ANON_KEY en .env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CLUB_TEST_ORG = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const HACK_PADEL_ORG =
  process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID?.trim() ||
  "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN_ORG =
  process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID?.trim() || null;

async function resolveByRivieraId(rivieraId) {
  const { data, error } = await supabase
    .from("riviera_official_player_identity")
    .select("riviera_id, canonical_riviera_jugador_id, debut_organizer_id")
    .eq("riviera_id", rivieraId)
    .maybeSingle();
  if (error) throw new Error(`${rivieraId} identity: ${error.message}`);
  if (!data?.canonical_riviera_jugador_id) {
    return { found: false };
  }
  const { data: jugador } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, slug, organizador_id")
    .eq("id", data.canonical_riviera_jugador_id)
    .maybeSingle();
  return {
    found: true,
    riviera_id: data.riviera_id,
    display_name: jugador?.nombre,
    canonical_jugador_id: data.canonical_riviera_jugador_id,
    registration_organizer_id: data.debut_organizer_id ?? jugador?.organizador_id,
    jugador,
  };
}

async function fetchJugadorById(id) {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, slug, organizador_id, visible_publico, estado")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchParticipaciones(jugadorIds, limit = 200) {
  const { data, error } = await supabase
    .from("jugador_participaciones")
    .select("id, jugador_id, evento_nombre, tipo_evento, puntos, fecha, metadata")
    .in("jugador_id", jugadorIds)
    .order("fecha", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchStats(jugadorId) {
  const { data } = await supabase
    .from("jugador_stats")
    .select("puntos_totales, total_partidos, victorias")
    .eq("jugador_id", jugadorId)
    .maybeSingle();
  return data;
}

async function fetchRatingHistorial(jugadorIds, limit = 10) {
  const { data, error } = await supabase
    .from("rating_historial")
    .select("id, jugador_id, rating_nuevo, motivo, created_at")
    .in("jugador_id", jugadorIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

async function discoverLinkedIds(canonicalId) {
  const ids = new Set([canonicalId]);
  const { data: links } = await supabase
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id")
    .eq("canonical_riviera_jugador_id", canonicalId);
  for (const row of links ?? []) {
    if (row.riviera_jugador_id) ids.add(row.riviera_jugador_id);
  }
  const { data: grants } = await supabase
    .from("organizer_player_access")
    .select("local_jugador_id, source_jugador_id")
    .or(`source_jugador_id.eq.${canonicalId},local_jugador_id.eq.${canonicalId}`);
  for (const g of grants ?? []) {
    if (g.local_jugador_id) ids.add(g.local_jugador_id);
    if (g.source_jugador_id) ids.add(g.source_jugador_id);
  }
  return [...ids];
}

async function evaluateCase(label, rivieraId, orgIds) {
  const resolved = await resolveByRivieraId(rivieraId);
  if (!resolved?.found) {
    return { label, rivieraId, error: "Jugador no encontrado por riviera_id" };
  }

  const canonicalId = resolved.canonical_jugador_id;
  const jugador = resolved.jugador ?? (canonicalId ? await fetchJugadorById(canonicalId) : null);
  const linkedIds = canonicalId ? await discoverLinkedIds(canonicalId) : [];
  const participaciones = await fetchParticipaciones(linkedIds);
  const ratingMovements = await fetchRatingHistorial(linkedIds);
  const stats = canonicalId ? await fetchStats(canonicalId) : null;

  const byOrg = {};
  for (const org of orgIds) {
    const { data: localRow } = await supabase
      .from("riviera_jugadores")
      .select("id")
      .eq("organizador_id", org)
      .or(
        `id.eq.${canonicalId},legacy_player_id.eq.${canonicalId}`
      )
      .limit(1)
      .maybeSingle();
    let localId = localRow?.id ?? canonicalId;
    const { data: grant } = await supabase
      .from("organizer_player_access")
      .select("local_jugador_id")
      .eq("owner_organizador_id", org)
      .eq("source_jugador_id", canonicalId)
      .maybeSingle();
    if (grant?.local_jugador_id) localId = grant.local_jugador_id;
    const localStats = await fetchStats(localId);
    byOrg[org] = {
      localJugadorId: localId,
      localPts: localStats?.puntos_totales ?? 0,
      url: `http://localhost:3000/public/jugadores/${canonicalId}?org=${encodeURIComponent(org)}`,
    };
  }

  const globalUrl = `http://localhost:3000/public/jugadores/${canonicalId}`;
  const playersUrl = `http://localhost:3000/players/${canonicalId}`;

  return {
    label,
    rivieraId,
    nombre: jugador?.nombre ?? resolved.display_name,
    canonicalJugadorId: canonicalId,
    slug: jugador?.slug,
    fullHistoryLength: participaciones.length,
    historyEventNames: participaciones.map((p) => p.evento_nombre).slice(0, 8),
    ratingMovementsLength: ratingMovements.length,
    globalPts: stats?.puntos_totales ?? 0,
    byOrg,
    urls: {
      global: globalUrl,
      players: playersUrl,
      slug: jugador?.slug
        ? `http://localhost:3000/public/jugadores/${encodeURIComponent(jugador.slug)}`
        : null,
    },
  };
}

async function findPlayerWithoutHistory() {
  const { data: identities } = await supabase
    .from("riviera_official_player_identity")
    .select("riviera_id, canonical_riviera_jugador_id")
    .not("riviera_id", "is", null)
    .limit(100);

  for (const row of identities ?? []) {
    const id = row.canonical_riviera_jugador_id;
    if (!id) continue;
    const { data: jugador } = await supabase
      .from("riviera_jugadores")
      .select("id, nombre, visible_publico, estado")
      .eq("id", id)
      .eq("visible_publico", true)
      .eq("estado", "activo")
      .maybeSingle();
    if (!jugador) continue;
    const ids = await discoverLinkedIds(id);
    const parts = await fetchParticipaciones(ids, 5);
    if (parts.length === 0) {
      return {
        nombre: jugador.nombre,
        rivieraId: row.riviera_id,
        jugadorId: id,
        url: `http://localhost:3000/public/jugadores/${id}?org=${CLUB_TEST_ORG}`,
      };
    }
  }
  return null;
}

async function main() {
  console.log("=== VALIDACIÓN PERFIL PÚBLICO GLOBAL ===\n");
  console.log("Orgs:");
  console.log("  Club Test:", CLUB_TEST_ORG);
  console.log("  Hackpadel:", HACK_PADEL_ORG);
  console.log("  Riviera Open (env):", RIVIERA_OPEN_ORG ?? "(no configurado)");

  const terry = await evaluateCase("Terry", "RIV-00000086", [
    CLUB_TEST_ORG,
    HACK_PADEL_ORG,
    ...(RIVIERA_OPEN_ORG ? [RIVIERA_OPEN_ORG] : []),
  ]);
  console.log("\n--- CASO 1: Terry ---");
  console.log(JSON.stringify(terry, null, 2));

  const david = await evaluateCase("David R", "RIV-00000041", [CLUB_TEST_ORG]);
  console.log("\n--- CASO 2: David R ---");
  console.log(JSON.stringify(david, null, 2));

  const empty = await findPlayerWithoutHistory();
  console.log("\n--- CASO 3: Sin historial ---");
  console.log(JSON.stringify(empty, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
