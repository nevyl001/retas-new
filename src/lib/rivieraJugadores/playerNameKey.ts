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

/**
 * Alinea un jugador al pool canónico.
 * Prioriza el nombre (evita Carlos R con el UUID de Carlos Co).
 */
export function resolvePlayerInPool(player: Player, pool: Player[]): Player {
  const key = normalizePlayerNameKey(player.name);
  if (key) {
    const byName = pool.find((p) => normalizePlayerNameKey(p.name) === key);
    if (byName) return byName;
  }

  const byId = pool.find((p) => p.id === player.id);
  if (byId) return byId;

  return player;
}

/**
 * Si varios jugadores comparten el mismo `players.id` (enlace legacy incorrecto),
 * conserva uno por nombre para no ocultar a nadie (p. ej. GusVa).
 */
export function dedupePlayersById(players: Player[]): Player[] {
  const byId = new Map<string, Player[]>();

  for (const p of players) {
    const group = byId.get(p.id) ?? [];
    group.push(p);
    byId.set(p.id, group);
  }

  const out: Player[] = [];
  const seenNameKeys = new Set<string>();

  const score = (p: Player): number => {
    let s = 0;
    const email = p.email?.trim().toLowerCase() ?? "";
    if (email && !email.endsWith("@padel.local")) s += 10;
    return s;
  };

  for (const group of Array.from(byId.values())) {
    if (group.length === 1) {
      const p = group[0];
      const nk = normalizePlayerNameKey(p.name);
      if (nk && seenNameKeys.has(nk)) continue;
      if (nk) seenNameKeys.add(nk);
      out.push(p);
      continue;
    }

    const sorted = [...group].sort((a, b) => score(b) - score(a));
    for (const p of sorted) {
      const nk = normalizePlayerNameKey(p.name);
      if (!nk || seenNameKeys.has(nk)) continue;
      seenNameKeys.add(nk);
      out.push(p);
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Evita dos parejas compartiendo el mismo jugador (p. ej. Carlos Co vs Carlos R). */
export function dedupeParejaDraftsByPlayerName(
  pairs: { id: string; jugador1: Player; jugador2: Player }[],
  preferPairIds: string[] = []
): typeof pairs {
  return splitParejaDraftsByPlayerName(pairs, preferPairIds).kept;
}

export function splitParejaDraftsByPlayerName(
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
    const k1 = normalizePlayerNameKey(p.jugador1.name);
    const k2 = normalizePlayerNameKey(p.jugador2.name);
    if (!k1 || !k2 || k1 === k2) {
      droppedIds.push(p.id);
      continue;
    }
    if (used.has(k1) || used.has(k2)) {
      droppedIds.push(p.id);
      continue;
    }
    used.add(k1);
    used.add(k2);
    kept.unshift(p);
  }

  return { kept, droppedIds };
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
