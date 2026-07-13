import type { Player } from "../db/types";
import type { RivieraJugadorGenero } from "./genero";
import type { RivieraJugadorWithStats } from "./types";

/**
 * Caché en memoria del pool de jugadores por organizador.
 * Módulo neutro (sin imports a database / services) para evitar ciclos.
 *
 * Cubre:
 * - pool legacy (`Player[]`) vía getPlayers / buildLegacyPlayersFromRivieraRegistry
 * - lista Riviera (`RivieraJugadorWithStats[]`) vía listRivieraJugadores
 *
 * Solo memoria de proceso: se pierde al recargar la página.
 */

const TTL_MS = 90_000;

type LegacyPoolEntry = {
  players: Player[];
  cachedAt: number;
};

type RivieraListEntry = {
  jugadores: RivieraJugadorWithStats[];
  cachedAt: number;
};

const legacyPoolByOrg = new Map<string, LegacyPoolEntry>();
const rivieraListByKey = new Map<string, RivieraListEntry>();

function isFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < TTL_MS;
}

function copyPlayers(players: Player[]): Player[] {
  return players.slice();
}

function copyJugadores(
  jugadores: RivieraJugadorWithStats[]
): RivieraJugadorWithStats[] {
  return jugadores.slice();
}

/** Clave de lista Riviera cacheable; null = no cachear (filtros search/nivel/etc.). */
export function buildRivieraListCacheKey(
  organizadorId: string,
  opts?: {
    search?: string;
    nivel?: string;
    activosRecientes?: boolean;
    genero?: RivieraJugadorGenero;
    skipCareerEnrich?: boolean;
  }
): string | null {
  const org = organizadorId.trim();
  if (!org) return null;
  if (opts?.search?.trim() || opts?.nivel || opts?.activosRecientes) {
    return null;
  }
  const genero = opts?.genero ?? "";
  const skipCareer = opts?.skipCareerEnrich ? "1" : "0";
  return `${org}|g:${genero}|sc:${skipCareer}`;
}

export function getCachedLegacyPlayersPool(
  organizadorId: string
): Player[] | null {
  const org = organizadorId.trim();
  if (!org) return null;
  const entry = legacyPoolByOrg.get(org);
  if (!entry || !isFresh(entry.cachedAt)) {
    if (entry) legacyPoolByOrg.delete(org);
    return null;
  }
  return copyPlayers(entry.players);
}

export function setCachedLegacyPlayersPool(
  organizadorId: string,
  players: Player[]
): void {
  const org = organizadorId.trim();
  if (!org) return;
  legacyPoolByOrg.set(org, {
    players: copyPlayers(players),
    cachedAt: Date.now(),
  });
}

export function getCachedRivieraJugadoresList(
  cacheKey: string
): RivieraJugadorWithStats[] | null {
  const entry = rivieraListByKey.get(cacheKey);
  if (!entry || !isFresh(entry.cachedAt)) {
    if (entry) rivieraListByKey.delete(cacheKey);
    return null;
  }
  return copyJugadores(entry.jugadores);
}

export function setCachedRivieraJugadoresList(
  cacheKey: string,
  jugadores: RivieraJugadorWithStats[]
): void {
  rivieraListByKey.set(cacheKey, {
    jugadores: copyJugadores(jugadores),
    cachedAt: Date.now(),
  });
}

/**
 * Invalida toda la caché compartida de un organizador
 * (pool legacy + todas las variantes de listRivieraJugadores).
 */
export function invalidatePlayersPool(organizadorId: string): void {
  const org = organizadorId.trim();
  if (!org) return;
  legacyPoolByOrg.delete(org);
  for (const key of Array.from(rivieraListByKey.keys())) {
    if (key === org || key.startsWith(`${org}|`)) {
      rivieraListByKey.delete(key);
    }
  }
}

/** Test / diagnóstico: vacía toda la caché del proceso. */
export function clearPlayersPoolCacheForTests(): void {
  legacyPoolByOrg.clear();
  rivieraListByKey.clear();
}
