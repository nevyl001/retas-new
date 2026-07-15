/**
 * Caché en memoria del bundle de identidad+carrera resuelto por
 * resolvePlayerIdentity + resolvePlayerCareer.
 *
 * Objetivo: evitar repetir la cadena costosa de RPC/queries de identidad y
 * carrera cuando el mismo jugador se re-enriquece varias veces en una sesión
 * corta (JugadoresLista, ranking interno, recargas, filtros).
 *
 * GUARD — qué NO se cachea aquí:
 * - El jugador enriquecido completo (eso lo sigue calculando
 *   attachCareerPuntosToJugador / resolvePlayerPointsBreakdown siempre).
 * - Puntos finales calculados (careerPuntosByClub, pointsBreakdown, etc.).
 * - Resultados null o promesas rechazadas (un fallo nunca queda cacheado).
 *
 * Clave: `${organizadorId}::${anchorJugadorId}`. Se incluye organizadorId a
 * propósito aunque el cálculo de identidad/carrera sea global por jugador:
 * así el peor caso ante un bug de resolución de identidad es cachear el
 * mismo dato dos veces (una entrada por club), nunca mezclar datos entre
 * organizadores/clubes/jugadores/perfiles concedidos.
 */
import type { ResolvedPlayerIdentity } from "./playerIdentityService";
import type { JugadorParticipacion } from "./types";

export type CareerIdentityBundle = {
  identity: ResolvedPlayerIdentity;
  participaciones: JugadorParticipacion[];
};

type CacheEntry = {
  bundle: CareerIdentityBundle;
  cachedAt: number;
};

const TTL_MS = 75_000; // dentro del rango 60-90s pedido
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CareerIdentityBundle | null>>();

function buildKey(organizadorId: string, anchorJugadorId: string): string | null {
  const org = organizadorId.trim();
  const anchor = anchorJugadorId.trim();
  if (!org || !anchor) return null;
  return `${org}::${anchor}`;
}

function isFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < TTL_MS;
}

/** Desaloja la entrada más antigua (por cachedAt) cuando se excede el límite. */
function evictOldestIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const key of Array.from(cache.keys())) {
    const entry = cache.get(key);
    if (entry && entry.cachedAt < oldestAt) {
      oldestAt = entry.cachedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

/**
 * Devuelve el bundle cacheado (si está vigente) o lo carga con `loader`,
 * deduplicando llamadas concurrentes para la misma clave.
 *
 * `loader` debe devolver `null` cuando resolvePlayerIdentity no encuentra
 * identidad (caso legítimo, no es un error) — ese resultado nunca se cachea,
 * igual que cualquier promesa rechazada.
 */
export async function getOrLoadCareerIdentityBundle(
  organizadorId: string,
  anchorJugadorId: string,
  loader: () => Promise<CareerIdentityBundle | null>
): Promise<CareerIdentityBundle | null> {
  const key = buildKey(organizadorId, anchorJugadorId);
  if (!key) return loader();

  const cached = cache.get(key);
  if (cached && isFresh(cached.cachedAt)) {
    return cached.bundle;
  }
  if (cached) {
    cache.delete(key);
  }

  const existingInFlight = inFlight.get(key);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async () => loader())();

  inFlight.set(key, promise);

  try {
    const bundle = await promise;
    if (bundle) {
      cache.set(key, { bundle, cachedAt: Date.now() });
      evictOldestIfNeeded();
    }
    return bundle;
  } finally {
    inFlight.delete(key);
  }
}

/** Invalida todas las entradas cacheadas de un organizador. */
export function invalidateCareerIdentityCache(organizadorId: string): void {
  const org = organizadorId.trim();
  if (!org) return;
  const prefix = `${org}::`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/**
 * Invalida las entradas de un jugador específico en TODOS los organizadores
 * (útil cuando se desconoce el organizadorId en el punto de invalidación,
 * p. ej. registrarParticipacion solo recibe jugadorId).
 */
export function invalidateCareerIdentityCacheForPlayer(jugadorId: string): void {
  const anchor = jugadorId.trim();
  if (!anchor) return;
  const suffix = `::${anchor}`;
  for (const key of Array.from(cache.keys())) {
    if (key.endsWith(suffix)) cache.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.endsWith(suffix)) inFlight.delete(key);
  }
}

/** Vacía toda la caché (tests / diagnóstico). */
export function clearCareerIdentityCache(): void {
  cache.clear();
  inFlight.clear();
}
