import type { Pair } from "../db/types";
import { resolveJugadorForEventSync } from "./careerEventPipeline/careerEventPlayerSync";
import type { CareerEventAssertionFailure } from "./careerEventPipeline/types";
import { supabase } from "../supabaseClient";

export type RetaRepairPlayerRef = {
  legacyPlayerId: string;
  nombre: string;
  email?: string;
};

export type RetaPlayerPreResolveEntry = {
  jugadorId: string | null;
  failure: CareerEventAssertionFailure | null;
};

/**
 * Agrupa jugadores de reta por pareja.
 * Jugadores sin legacy id o sin pareja conocida quedan en `unpaired`.
 */
export function groupRetaPlayersByPair<T extends { legacyPlayerId?: string }>(
  pairs: Pair[],
  players: T[]
): { pairGroups: Array<{ pairId: string; players: T[] }>; unpaired: T[] } {
  const byPairId = new Map<string, T[]>();
  const unpaired: T[] = [];

  for (const player of players) {
    const legacyId = player.legacyPlayerId?.trim();
    if (!legacyId) {
      unpaired.push(player);
      continue;
    }

    const pair = pairs.find(
      (p) => p.player1_id === legacyId || p.player2_id === legacyId
    );
    if (!pair) {
      unpaired.push(player);
      continue;
    }

    const list = byPairId.get(pair.id) ?? [];
    list.push(player);
    byPairId.set(pair.id, list);
  }

  return {
    pairGroups: Array.from(byPairId.entries()).map(([pairId, groupPlayers]) => ({
      pairId,
      players: groupPlayers,
    })),
    unpaired,
  };
}

/**
 * Resuelve identidad y repara legacy ids en `pairs` agrupando por pareja:
 * - dentro de la misma pareja: secuencial (evita carrera en la misma fila pairs)
 * - entre parejas distintas: paralelo (Promise.allSettled)
 */
export async function runRetaPairLegacyRepairsGrouped(params: {
  tournamentId: string;
  organizadorId: string;
  pairs: Pair[];
  players: RetaRepairPlayerRef[];
  excluded?: ReadonlySet<string>;
}): Promise<{
  resolvedByLegacyId: Map<string, RetaPlayerPreResolveEntry>;
  failures: CareerEventAssertionFailure[];
}> {
  const { tournamentId, organizadorId, pairs, players, excluded } = params;
  const resolvedByLegacyId = new Map<string, RetaPlayerPreResolveEntry>();
  const failures: CareerEventAssertionFailure[] = [];

  const resolveAndRepair = async (
    player: RetaRepairPlayerRef
  ): Promise<CareerEventAssertionFailure | null> => {
    const { jugadorId, failure } = await resolveJugadorForEventSync(
      {
        nombre: player.nombre,
        organizadorId,
        legacyPlayerId: player.legacyPlayerId,
        email: player.email,
        tipoEvento: "reta",
        eventoId: tournamentId,
      },
      excluded
    );

    resolvedByLegacyId.set(player.legacyPlayerId, {
      jugadorId: jugadorId ?? null,
      failure: failure ?? null,
    });

    if (failure) {
      return failure;
    }

    if (jugadorId) {
      await repairRetaPairLegacyPlayerIds(
        tournamentId,
        player.legacyPlayerId,
        jugadorId
      );
    }

    return null;
  };

  const { pairGroups, unpaired } = groupRetaPlayersByPair(pairs, players);

  const pairOutcomes = await Promise.allSettled(
    pairGroups.map(async ({ players: playersInPair }) => {
      const groupFailures: CareerEventAssertionFailure[] = [];
      for (const player of playersInPair) {
        const playerFailure = await resolveAndRepair(player);
        if (playerFailure) {
          groupFailures.push(playerFailure);
        }
      }
      return groupFailures;
    })
  );

  for (const outcome of pairOutcomes) {
    if (outcome.status === "fulfilled") {
      failures.push(...outcome.value);
    } else {
      failures.push({
        code: "career_integrity_blocked",
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason),
      });
    }
  }

  const unpairedRepairPlayers = unpaired.filter(
    (player): player is RetaRepairPlayerRef =>
      typeof player.legacyPlayerId === "string" && player.legacyPlayerId.trim().length > 0
  );

  const unpairedOutcomes = await Promise.allSettled(
    unpairedRepairPlayers.map((player) => resolveAndRepair(player))
  );

  for (const outcome of unpairedOutcomes) {
    if (outcome.status === "fulfilled") {
      if (outcome.value) {
        failures.push(outcome.value);
      }
    } else {
      failures.push({
        code: "career_integrity_blocked",
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason),
      });
    }
  }

  return { resolvedByLegacyId, failures };
}

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
