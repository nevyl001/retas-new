import type { Player } from "../db/types";

/** Clave estable para comparar nombres (trim, minúsculas, espacios colapsados). */
export function normalizePlayerNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Clave no ordenada de pareja por IDs fuertes. */
export function unorderedPairIdKey(id1: string, id2: string): string {
  return [id1, id2].map((x) => x.trim()).filter(Boolean).sort().join(":");
}

/**
 * Un jugador por `player.id` en listas/desplegables.
 * Homónimos con IDs distintos se conservan.
 */
export function dedupePlayersForSelect(
  players: Player[],
  preferPlayerIds: string[] = []
): Player[] {
  const prefer = new Set(preferPlayerIds.filter(Boolean));
  const byId = new Map<string, Player>();

  const keepScore = (p: Player): number => {
    let score = 0;
    if (prefer.has(p.id)) score += 100;
    const email = p.email?.trim().toLowerCase() ?? "";
    if (email && !email.endsWith("@padel.local")) score += 10;
    return score;
  };

  for (const p of players) {
    const id = p.id?.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, p);
      continue;
    }
    if (keepScore(p) > keepScore(prev)) {
      byId.set(id, p);
    } else if (
      keepScore(p) === keepScore(prev) &&
      p.created_at < prev.created_at
    ) {
      byId.set(id, p);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/**
 * Alinea un jugador al pool canónico únicamente por ID fuerte.
 * Sin match fuerte: unresolved → conserva el jugador original (no sustituye por nombre).
 */
export function resolvePlayerInPool(player: Player, pool: Player[]): Player {
  const byId = pool.find((p) => p.id === player.id);
  if (byId) return byId;
  return player;
}

/**
 * Un registro por `players.id`. Homónimos con IDs distintos permanecen.
 */
export function dedupePlayersById(players: Player[]): Player[] {
  const byId = new Map<string, Player>();

  const score = (p: Player): number => {
    let s = 0;
    const email = p.email?.trim().toLowerCase() ?? "";
    if (email && !email.endsWith("@padel.local")) s += 10;
    return s;
  };

  for (const p of players) {
    const id = p.id?.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, p);
      continue;
    }
    if (score(p) > score(prev)) {
      byId.set(id, p);
    } else if (score(p) === score(prev) && p.created_at < prev.created_at) {
      byId.set(id, p);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/**
 * Evita dos parejas compartiendo el mismo player.id.
 * Homónimos (mismo nombre, distinto ID) son personas distintas.
 */
export function dedupeParejaDraftsByPlayerId(
  pairs: { id: string; jugador1: Player; jugador2: Player }[],
  preferPairIds: string[] = []
): typeof pairs {
  return splitParejaDraftsByPlayerId(pairs, preferPairIds).kept;
}

/** @deprecated Use dedupeParejaDraftsByPlayerId — no dedupe por nombre. */
export const dedupeParejaDraftsByPlayerName = dedupeParejaDraftsByPlayerId;

export function splitParejaDraftsByPlayerId(
  pairs: { id: string; jugador1: Player; jugador2: Player }[],
  preferPairIds: string[] = []
): { kept: typeof pairs; droppedIds: string[] } {
  const prefer = new Set(preferPairIds.filter(Boolean));
  const used = new Set<string>();
  const kept: typeof pairs = [];
  const droppedIds: string[] = [];

  const sorted = [...pairs].sort((a, b) => {
    const ap = prefer.has(a.id) ? 1 : 0;
    const bp = prefer.has(b.id) ? 1 : 0;
    return bp - ap;
  });

  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    const id1 = p.jugador1.id?.trim() ?? "";
    const id2 = p.jugador2.id?.trim() ?? "";
    if (!id1 || !id2 || id1 === id2) {
      droppedIds.push(p.id);
      continue;
    }
    if (used.has(id1) || used.has(id2)) {
      droppedIds.push(p.id);
      continue;
    }
    used.add(id1);
    used.add(id2);
    kept.unshift(p);
  }

  return { kept, droppedIds };
}

/** @deprecated Use splitParejaDraftsByPlayerId */
export const splitParejaDraftsByPlayerName = splitParejaDraftsByPlayerId;

export function playerIdsInPairs(
  pairs: { jugador1: Player; jugador2: Player }[]
): Set<string> {
  const keys = new Set<string>();
  for (const p of pairs) {
    if (p.jugador1.id) keys.add(p.jugador1.id);
    if (p.jugador2.id) keys.add(p.jugador2.id);
  }
  return keys;
}

/** @deprecated Prefer playerIdsInPairs — name keys are display-only. */
export function playerNameKeysInPairs(
  pairs: { jugador1: Player; jugador2: Player }[]
): Set<string> {
  const keys = new Set<string>();
  for (const p of pairs) {
    const k1 = normalizePlayerNameKey(p.jugador1.name);
    const k2 = normalizePlayerNameKey(p.jugador2.name);
    if (k1) keys.add(k1);
    if (k2) keys.add(k2);
  }
  return keys;
}
