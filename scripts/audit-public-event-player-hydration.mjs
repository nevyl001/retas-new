/**
 * QA: hidratación de jugadores en vista pública de reta.
 * Uso: node scripts/audit-public-event-player-hydration.mjs <tournamentId>
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
const tournamentId = process.argv[2]?.trim();

if (!url || !key) {
  console.error("Faltan REACT_APP_SUPABASE_URL / ANON_KEY en .env");
  process.exit(1);
}
if (!tournamentId) {
  console.error("Uso: node scripts/audit-public-event-player-hydration.mjs <tournamentId>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_RATING = 3;

function isDefaultRating(rating) {
  return rating == null || Number(rating) === DEFAULT_RATING;
}

async function main() {
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name, user_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tournament?.user_id) {
    console.error("Torneo no encontrado o sin organizador");
    process.exit(1);
  }

  const orgId = String(tournament.user_id).trim();
  console.log(`\n🔍 Audit hidratación pública — ${tournament.name} (${tournamentId})`);
  console.log(`   Organizador: ${orgId}\n`);

  const { data: pairs, error: pErr } = await supabase
    .from("pairs")
    .select("id, player1_id, player2_id, player1_name, player2_name")
    .eq("tournament_id", tournamentId);
  if (pErr) throw new Error(pErr.message);

  const legacyIds = new Set();
  for (const pair of pairs ?? []) {
    if (pair.player1_id) legacyIds.add(pair.player1_id);
    if (pair.player2_id) legacyIds.add(pair.player2_id);
  }

  const ids = Array.from(legacyIds);
  console.log(`Parejas: ${pairs?.length ?? 0} · Jugadores legacy únicos: ${ids.length}`);

  const { data: rjRows, error: rjErr } = await supabase
    .from("riviera_jugadores")
    .select("id, legacy_player_id, nombre, foto_url, rating, organizador_id, estado")
    .eq("organizador_id", orgId)
    .eq("estado", "activo")
    .in("legacy_player_id", ids);
  if (rjErr) throw new Error(rjErr.message);

  const byLegacy = new Map(
    (rjRows ?? []).map((row) => [String(row.legacy_player_id), row])
  );

  const issues = [];
  let withPhotoInDb = 0;
  let withRealRatingInDb = 0;
  let wouldMissPhoto = 0;
  let wouldMissRating = 0;

  for (const legacyId of ids) {
    const row = byLegacy.get(legacyId);
    const pairSlot = (pairs ?? []).find(
      (p) => p.player1_id === legacyId || p.player2_id === legacyId
    );
    const displayName =
      pairSlot?.player1_id === legacyId
        ? pairSlot.player1_name
        : pairSlot?.player2_name;

    const hasPhoto =
      typeof row?.foto_url === "string" && row.foto_url.trim().length > 0;
    const hasRealRating = row?.rating != null && !isDefaultRating(row.rating);

    if (hasPhoto) withPhotoInDb += 1;
    if (hasRealRating) withRealRatingInDb += 1;

    if (!row) {
      issues.push({ legacyId, displayName, issue: "sin riviera_jugadores en club" });
      wouldMissPhoto += 1;
      wouldMissRating += 1;
      continue;
    }

    if (hasPhoto && !row.foto_url) wouldMissPhoto += 1;
    if (hasRealRating && isDefaultRating(row.rating)) wouldMissRating += 1;

    if (hasRealRating && isDefaultRating(row.rating)) {
      issues.push({
        legacyId,
        displayName: row.nombre ?? displayName,
        issue: `rating real en DB (${row.rating}) pero lookup devolvería default`,
      });
    }
  }

  console.log(`\nEn riviera_jugadores (club):`);
  console.log(`  Con foto: ${withPhotoInDb}/${ids.length}`);
  console.log(`  Con rating real (≠3.00): ${withRealRatingInDb}/${ids.length}`);

  const { data: participaciones } = await supabase
    .from("jugador_participaciones")
    .select("jugador_id")
    .eq("evento_id", tournamentId)
    .eq("tipo_evento", "reta");
  console.log(`\nParticipaciones del evento: ${participaciones?.length ?? 0}`);

  if (issues.length === 0) {
    console.log("\n✅ Todos los jugadores del evento tienen match de identidad en riviera_jugadores.");
  } else {
    console.log(`\n⚠️  ${issues.length} posible(s) problema(s):`);
    for (const item of issues.slice(0, 20)) {
      console.log(`  - ${item.displayName ?? item.legacyId}: ${item.issue}`);
    }
  }

  if (wouldMissRating > 0) {
    console.log(
      `\n❌ ${wouldMissRating} jugador(es) podrían renderizar 3.00 sin rating real en vista pública.`
    );
    process.exitCode = 1;
  } else {
    console.log("\n✅ Ningún jugador con rating real debería caer en fallback 3.00.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
