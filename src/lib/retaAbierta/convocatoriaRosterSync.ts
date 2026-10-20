/**
 * Sincroniza el roster de armado con inscritos confirmados de convocatoria.
 * Resolución por riviera_id / riviera_jugador_id / legacy_player_id — nunca por nombre ambiguo.
 */

import type { Player } from "../db/types";
import type { LegacyPlayerContact } from "../rivieraJugadores/playerPoolSync";
import { getRivieraJugadorPrivateById } from "../rivieraJugadores/rivieraJugadoresService";
import { normalizePlayerNameKey } from "../rivieraJugadores/playerNameKey";
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

/**
 * Deduplica un roster de Americano garantizando que cada participante real
 * aparezca una sola vez, consolidando IDs locales vs foráneos / fantasmas.
 */
export function dedupeAmericanoRoster<T extends ConvocatoriaRosterPlayer>(
  roster: ReadonlyArray<T>,
  pool?: readonly (Player | LegacyPlayerContact)[]
): T[] {
  if (roster.length <= 1) return [...roster];

  const poolById = new Map<string, Player | LegacyPlayerContact>();
  const poolByRivieraId = new Map<string, Player | LegacyPlayerContact>();
  const poolByRivieraJugadorId = new Map<string, Player | LegacyPlayerContact>();
  const poolByName = new Map<string, Player | LegacyPlayerContact>();
  const nameCollisionCount = new Map<string, number>();

  if (pool && pool.length > 0) {
    for (const player of pool) {
      if (player.id) poolById.set(player.id, player);
      const rid = (player as LegacyPlayerContact).riviera_id?.trim();
      if (rid && !poolByRivieraId.has(rid)) {
        poolByRivieraId.set(rid, player);
      }
      const rjId = (player as LegacyPlayerContact).riviera_jugador_id?.trim();
      if (rjId && !poolByRivieraJugadorId.has(rjId)) {
        poolByRivieraJugadorId.set(rjId, player);
      }
      const normName = normalizePlayerNameKey(player.name);
      nameCollisionCount.set(normName, (nameCollisionCount.get(normName) ?? 0) + 1);
      if (!poolByName.has(normName)) {
        poolByName.set(normName, player);
      }
    }
  }

  const seenCanonicalKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const player of roster) {
    if (!player.id?.trim()) continue;

    // 1. Direct pool lookup by ID
    const poolItem = poolById.get(player.id);
    let canonicalKey: string = player.id;
    let resolvedId: string = player.id;
    let resolvedName: string = player.name;

    if (poolItem) {
      const rid = (poolItem as LegacyPlayerContact).riviera_id?.trim();
      const rjId = (poolItem as LegacyPlayerContact).riviera_jugador_id?.trim();
      canonicalKey = rid ? `riviera:${rid}` : rjId ? `rj:${rjId}` : `player:${poolItem.id}`;
      resolvedId = poolItem.id;
      resolvedName = poolItem.name;
    } else if (pool && pool.length > 0) {
      // 2. Player is not in pool by ID (could be a legacy/foreign ID from another organizer).
      // Check if there is an unambiguous single pool player with the same name.
      const normName = normalizePlayerNameKey(player.name);
      const count = nameCollisionCount.get(normName) ?? 0;
      if (count === 1) {
        const matched = poolByName.get(normName);
        if (matched) {
          const rid = (matched as LegacyPlayerContact).riviera_id?.trim();
          const rjId = (matched as LegacyPlayerContact).riviera_jugador_id?.trim();
          canonicalKey = rid ? `riviera:${rid}` : rjId ? `rj:${rjId}` : `player:${matched.id}`;
          resolvedId = matched.id;
          resolvedName = matched.name;
        }
      }
    }

    if (seenCanonicalKeys.has(canonicalKey) || seenIds.has(resolvedId)) {
      continue;
    }

    seenCanonicalKeys.add(canonicalKey);
    seenIds.add(resolvedId);
    result.push({
      ...player,
      id: resolvedId,
      name: resolvedName,
    });
  }

  return result;
}

/**
 * Aplica los cambios de la convocatoria al roster SIN pisar a los jugadores
 * que el organizador sumó a mano: quita solo a quien dejó de estar confirmado
 * desde la última sincronización y agrega a los confirmados que falten.
 * Deduplica canónicamente para evitar que aparezcan participantes repetidos.
 */
export function mergeConvocatoriaIntoRoster<T extends ConvocatoriaRosterPlayer>(
  current: ReadonlyArray<T>,
  previousConfirmedIds: ReadonlySet<string> | null,
  confirmed: ReadonlyArray<T>,
  pool?: readonly (Player | LegacyPlayerContact)[]
): T[] {
  const nowIds = new Set(confirmed.map((p) => p.id));
  const removed = new Set<string>();
  previousConfirmedIds?.forEach((id) => {
    if (!nowIds.has(id)) removed.add(id);
  });

  // Filter out cancelled players
  let next = current.filter((p) => !removed.has(p.id));

  // If a player in `current` represents the same real person as one in `confirmed`,
  // replace the stale/foreign current record with the canonical confirmed record.
  const confirmedByName = new Map<string, T>();
  confirmed.forEach((c) => {
    confirmedByName.set(normalizePlayerNameKey(c.name), c);
  });

  const confirmedIds = new Set(confirmed.map((p) => p.id));
  next = next.filter((p) => {
    if (confirmedIds.has(p.id)) return true;
    const norm = normalizePlayerNameKey(p.name);
    // If current player has a different ID but same name as a confirmed player, drop the duplicate
    if (confirmedByName.has(norm)) {
      return false;
    }
    return true;
  });

  const present = new Set(next.map((p) => p.id));
  confirmed.forEach((p) => {
    if (!present.has(p.id)) {
      present.add(p.id);
      next.push(p);
    }
  });

  return dedupeAmericanoRoster(next, pool);
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
 * Prioriza riviera_id exacto en el pool local; luego riviera_jugador_id;
 * luego legacy_player_id; último recurso riviera_jugador_id.
 * Previene estrictamente participantes duplicados por homónimos o múltiples registros.
 */
export async function buildRosterFromConvocatoriaEntries(
  confirmedEntries: OpenRegistrationOrganizerEntry[],
  pool: readonly (Player | LegacyPlayerContact)[]
): Promise<ConvocatoriaRosterPlayer[]> {
  if (confirmedEntries.length === 0) return [];

  const poolById = new Map<string, Player | LegacyPlayerContact>();
  const poolByRivieraId = new Map<string, Player | LegacyPlayerContact>();
  const poolByRivieraJugadorId = new Map<string, Player | LegacyPlayerContact>();

  for (const player of pool) {
    if (player.id) poolById.set(player.id, player);
    const rivieraId = (player as LegacyPlayerContact).riviera_id?.trim();
    if (rivieraId && !poolByRivieraId.has(rivieraId)) {
      poolByRivieraId.set(rivieraId, player);
    }
    const rjId = (player as LegacyPlayerContact).riviera_jugador_id?.trim();
    if (rjId && !poolByRivieraJugadorId.has(rjId)) {
      poolByRivieraJugadorId.set(rjId, player);
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

  const seenIds = new Set<string>();
  const seenRivieraIds = new Set<string>();
  const roster: ConvocatoriaRosterPlayer[] = [];

  for (const entry of sortConfirmedEntries(confirmedEntries)) {
    const rivieraId = entry.riviera_id?.trim();
    if (rivieraId && seenRivieraIds.has(rivieraId)) continue;

    const rivieraJugadorId = entry.riviera_jugador_id?.trim();
    const legacyId = rivieraJugadorId
      ? legacyByRivieraJugadorId.get(rivieraJugadorId)
      : undefined;

    // Resolución por prioridad de unicidad fuerte:
    // 1. Riviera ID canónico en el pool local
    // 2. Riviera Jugador ID en el pool local
    // 3. Legacy Player ID presente en el pool local
    let poolPlayer: (Player | LegacyPlayerContact) | undefined;
    if (rivieraId) {
      poolPlayer = poolByRivieraId.get(rivieraId);
    }
    if (!poolPlayer && rivieraJugadorId) {
      poolPlayer = poolByRivieraJugadorId.get(rivieraJugadorId);
    }
    if (!poolPlayer && legacyId) {
      poolPlayer = poolById.get(legacyId);
    }

    // Nunca inyectar un legacyId foráneo que no exista en el pool local si se puede usar el poolPlayer
    const id = poolPlayer?.id ?? (legacyId && poolById.has(legacyId) ? legacyId : undefined) ?? rivieraJugadorId ?? legacyId;
    if (!id || seenIds.has(id)) continue;

    seenIds.add(id);
    if (rivieraId) seenRivieraIds.add(rivieraId);

    roster.push({
      id,
      name: poolPlayer?.name ?? entry.nombre?.trim() ?? id,
    });
  }

  return dedupeAmericanoRoster(roster, pool);
}
