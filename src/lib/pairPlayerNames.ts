import { supabase } from "./supabaseClient";

type PairNameSource = {
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  player1?: { name?: string | null } | null;
  player2?: { name?: string | null } | null;
};

function cleanName(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

/** Nombre vigente del jugador 1: `players.name` antes que el snapshot en `pairs`. */
export function pairPlayer1DisplayName(pair: PairNameSource): string {
  return cleanName(pair.player1?.name, cleanName(pair.player1_name, "Jugador 1"));
}

/** Nombre vigente del jugador 2: `players.name` antes que el snapshot en `pairs`. */
export function pairPlayer2DisplayName(pair: PairNameSource): string {
  return cleanName(pair.player2?.name, cleanName(pair.player2_name, "Jugador 2"));
}

export function pairPlayersDisplayLabel(pair: PairNameSource): string {
  return `${pairPlayer1DisplayName(pair)} / ${pairPlayer2DisplayName(pair)}`;
}

/**
 * Propaga un cambio de nombre a retas, duelos y `players`.
 * Se invoca al editar el perfil Riviera del jugador.
 */
export async function propagatePlayerNameAcrossEvents(opts: {
  nombre: string;
  legacyPlayerId?: string | null;
  rivieraJugadorId?: string | null;
}): Promise<void> {
  const nombre = opts.nombre.trim();
  const legacyId = opts.legacyPlayerId?.trim() || "";
  const rivieraId = opts.rivieraJugadorId?.trim() || "";
  if (!nombre) return;

  if (legacyId) {
    const { error: playerErr } = await supabase
      .from("players")
      .update({ name: nombre })
      .eq("id", legacyId);
    if (playerErr) {
      console.warn("[pairPlayerNames] players rename:", playerErr.message);
    }

    const { error: p1Err } = await supabase
      .from("pairs")
      .update({ player1_name: nombre })
      .eq("player1_id", legacyId);
    if (p1Err) {
      console.warn("[pairPlayerNames] pairs p1 rename:", p1Err.message);
    }

    const { error: p2Err } = await supabase
      .from("pairs")
      .update({ player2_name: nombre })
      .eq("player2_id", legacyId);
    if (p2Err) {
      console.warn("[pairPlayerNames] pairs p2 rename:", p2Err.message);
    }
  }

  if (rivieraId) {
    const dueloSlots = [
      "pareja_a_j1_id",
      "pareja_a_j2_id",
      "pareja_b_j1_id",
      "pareja_b_j2_id",
    ] as const;
    const nombreCols = {
      pareja_a_j1_id: "pareja_a_j1_nombre",
      pareja_a_j2_id: "pareja_a_j2_nombre",
      pareja_b_j1_id: "pareja_b_j1_nombre",
      pareja_b_j2_id: "pareja_b_j2_nombre",
    } as const;

    await Promise.all(
      dueloSlots.map(async (idCol) => {
        const { error } = await supabase
          .from("duelos_2v2")
          .update({ [nombreCols[idCol]]: nombre })
          .eq(idCol, rivieraId);
        if (error) {
          console.warn(`[pairPlayerNames] duelo ${idCol} rename:`, error.message);
        }
      })
    );
  }
}
