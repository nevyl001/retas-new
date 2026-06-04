import type { Player } from "../db/types";

/** Clave estable para comparar nombres (trim, minúsculas, espacios colapsados). */
export function normalizePlayerNameKey(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Un solo jugador por nombre en listas/desplegables.
 * Prioriza el id ya seleccionado en J1/J2.
 */
export function dedupePlayersForSelect(
  players: Player[],
  preferPlayerIds: string[] = []
): Player[] {
  const prefer = new Set(preferPlayerIds.filter(Boolean));
  const byName = new Map<string, Player>();

  const keepScore = (p: Player): number => {
    let score = 0;
    if (prefer.has(p.id)) score += 100;
    const email = p.email?.trim().toLowerCase() ?? "";
    if (email && !email.endsWith("@padel.local")) score += 10;
    return score;
  };

  for (const p of players) {
    const key = normalizePlayerNameKey(p.name);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, p);
      continue;
    }
    if (keepScore(p) > keepScore(prev)) {
      byName.set(key, p);
    } else if (keepScore(p) === keepScore(prev) && p.created_at < prev.created_at) {
      byName.set(key, p);
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/** Tras deduplicar el pool, alinea un jugador (p. ej. de una pareja guardada) al id canónico actual. */
export function resolvePlayerInPool(player: Player, pool: Player[]): Player {
  const byId = pool.find((p) => p.id === player.id);
  if (byId) return byId;

  const key = normalizePlayerNameKey(player.name);
  if (!key) return player;

  return pool.find((p) => normalizePlayerNameKey(p.name) === key) ?? player;
}

/** Evita dos parejas compartiendo el mismo jugador (p. ej. Carlos Co vs Carlos R). */
export function dedupeParejaDraftsByPlayerName(
  pairs: { id: string; jugador1: Player; jugador2: Player }[]
): typeof pairs {
  const used = new Set<string>();
  const kept: typeof pairs = [];

  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i];
    const k1 = normalizePlayerNameKey(p.jugador1.name);
    const k2 = normalizePlayerNameKey(p.jugador2.name);
    if (!k1 || !k2 || k1 === k2) continue;
    if (used.has(k1) || used.has(k2)) continue;
    used.add(k1);
    used.add(k2);
    kept.unshift(p);
  }

  return kept;
}

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
