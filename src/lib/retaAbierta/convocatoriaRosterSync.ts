/**
 * Sincroniza el roster de armado con inscritos confirmados de convocatoria.
 * Resolución por riviera_jugador_id / legacy_player_id — nunca por nombre.
 */

import type { Player } from "../db/types";
import type { LegacyPlayerContact } from "../rivieraJugadores/playerPoolSync";
import { getRivieraJugadorPrivateById } from "../rivieraJugadores/rivieraJugadoresService";
import { findPoolPlayerByLegacyId } from "./registrySelectForReta";
import type { OpenRegistrationOrganizerEntry } from "./types";

export type ConvocatoriaRosterPlayer = { id: string; name: string };

function rosterSignature(players: ReadonlyArray<{ id: string }>): string {
  return [...players]
    .map((p) => p.id)
    .sort()
    .join("|");
}

export function sameConvocatoriaRoster(
  a: ReadonlyArray<{ id: string }>,
  b: ReadonlyArray<{ id: string }>
): boolean {
  return rosterSignature(a) === rosterSignature(b);
}

function sortConfirmedEntries(
  entries: OpenRegistrationOrganizerEntry[]
): OpenRegistrationOrganizerEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.confirmed_at ?? a.created_at;
    const tb = b.confirmed_at ?? b.created_at;
    return ta.localeCompare(tb);
  });
}

async function fetchLegacyPlayerIdsByRivieraJugadorIds(
  rivieraJugadorIds: readonly string[]
): Promise<Map<string, string>> {
  const legacyByRivieraJugadorId = new Map<string, string>();
  await Promise.all(
    rivieraJugadorIds.map(async (rjId) => {
      try {
        const row = await getRivieraJugadorPrivateById(rjId);
        const legacyId = row?.legacy_player_id?.trim();
        if (legacyId) legacyByRivieraJugadorId.set(rjId, legacyId);
      } catch {
        /* sin vínculo verificable: se intentará riviera_id del pool */
      }
    })
  );
  return legacyByRivieraJugadorId;
}

/**
 * Construye el roster de armado a partir de entradas confirmadas.
 * Prioriza legacy del pool; cae a legacy del registro; último recurso riviera_jugador_id.
 */
export async function buildRosterFromConvocatoriaEntries(
  confirmedEntries: OpenRegistrationOrganizerEntry[],
  pool: readonly (Player | LegacyPlayerContact)[]
): Promise<ConvocatoriaRosterPlayer[]> {
  if (confirmedEntries.length === 0) return [];

  const poolByRivieraId = new Map<string, Player | LegacyPlayerContact>();
  for (const player of pool) {
    const rivieraId = (player as LegacyPlayerContact).riviera_id?.trim();
    if (rivieraId && !poolByRivieraId.has(rivieraId)) {
      poolByRivieraId.set(rivieraId, player);
    }
  }

  const uniqueRivieraJugadorIds = Array.from(
    new Set(
      confirmedEntries
        .map((entry) => entry.riviera_jugador_id?.trim())
        .filter((id): id is string => Boolean(id))
    )
  );

  const legacyByRivieraJugadorId = await fetchLegacyPlayerIdsByRivieraJugadorIds(
    uniqueRivieraJugadorIds
  );

  const seen = new Set<string>();
  const roster: ConvocatoriaRosterPlayer[] = [];

  for (const entry of sortConfirmedEntries(confirmedEntries)) {
    const rivieraJugadorId = entry.riviera_jugador_id?.trim();
    const legacyId = rivieraJugadorId
      ? legacyByRivieraJugadorId.get(rivieraJugadorId)
      : undefined;

    let poolPlayer = findPoolPlayerByLegacyId(pool, legacyId);
    if (!poolPlayer) {
      const rivieraId = entry.riviera_id?.trim();
      if (rivieraId) poolPlayer = poolByRivieraId.get(rivieraId);
    }

    const id = poolPlayer?.id ?? legacyId ?? rivieraJugadorId;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    roster.push({
      id,
      name: poolPlayer?.name ?? entry.nombre?.trim() ?? id,
    });
  }

  return roster;
}
