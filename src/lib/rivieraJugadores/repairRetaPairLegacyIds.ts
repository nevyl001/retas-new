import { supabase } from "../supabaseClient";

/**
 * Corrige `pairs.playerN_id` cuando el legacy id del slot no coincide con el
 * `riviera_jugadores` resuelto por participación (id único del jugador).
 */
export async function repairRetaPairLegacyPlayerIds(
  tournamentId: string,
  wrongLegacyId: string,
  resolvedJugadorId: string
): Promise<void> {
  const retaId = tournamentId.trim();
  const wrongId = wrongLegacyId.trim();
  const jugadorId = resolvedJugadorId.trim();
  if (!retaId || !wrongId || !jugadorId) return;

  const { data: rj, error } = await supabase
    .from("riviera_jugadores")
    .select("legacy_player_id, nombre")
    .eq("id", jugadorId)
    .maybeSingle();

  if (error) {
    console.warn("[repairRetaPairLegacyIds] riviera_jugadores:", error.message);
    return;
  }

  const correctLegacy = rj?.legacy_player_id?.trim();
  const nombre = rj?.nombre?.trim();
  if (!correctLegacy || correctLegacy === wrongId) return;

  const updates = nombre
    ? { player1_id: correctLegacy, player1_name: nombre }
    : { player1_id: correctLegacy };

  const { error: p1Err } = await supabase
    .from("pairs")
    .update(updates)
    .eq("tournament_id", retaId)
    .eq("player1_id", wrongId);

  if (p1Err) {
    console.warn("[repairRetaPairLegacyIds] pairs p1:", p1Err.message);
  }

  const updates2 = nombre
    ? { player2_id: correctLegacy, player2_name: nombre }
    : { player2_id: correctLegacy };

  const { error: p2Err } = await supabase
    .from("pairs")
    .update(updates2)
    .eq("tournament_id", retaId)
    .eq("player2_id", wrongId);

  if (p2Err) {
    console.warn("[repairRetaPairLegacyIds] pairs p2:", p2Err.message);
  }
}
