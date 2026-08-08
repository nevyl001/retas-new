/**
 * Caché de identidad de UN cierre de reta (incidente 2026-08-06: cerrar 8
 * jugadores tardó 78s, 783 requests, dominado por resolver/verificar la
 * misma identidad 3 veces -- pre-close, reparación legacy del sync, y
 * assertions -- sin compartir resultado entre esas fases).
 *
 * Memoiza operaciones YA idempotentes (resolveJugadorIdForParticipacion,
 * ensureRivieraIdentity, ensure_official_profile_link_for_participacion):
 * la segunda llamada con la misma clave en el mismo cierre no cambia ningún
 * dato -- solo evita repetir la llamada de red. Vive exclusivamente durante
 * una llamada a processCareerEvent: se crea al empezar, se descarta al
 * terminar, nunca cruza entre cierres ni queda en memoria después (a
 * diferencia de careerIdentityCache.ts, que es un caché TTL entre
 * requests para pantallas de lectura -- forma equivocada para este caso,
 * ver nota en el plan de este incidente).
 */
import {
  resolveJugadorIdForParticipacion,
  type ResolveJugadorIdForParticipacionParams,
} from "../jugadorIdResolver";
import { ensureRivieraIdentity } from "../careerIdentity";
import type { RivieraIdentityEnsureResult } from "../careerIdentity.types";
import { ensureOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import type { ProfileLinkResolution } from "../careerIntegrity";
import { listRevokedGrantLocalJugadorIds } from "../organizerPlayerAccess";

function memoizeAsync<K, V>(
  loader: (key: K) => Promise<V>,
  keyOf: (key: K) => string
): (key: K) => Promise<V> {
  const cache = new Map<string, Promise<V>>();
  return (key: K) => {
    const k = keyOf(key);
    const existing = cache.get(k);
    if (existing) return existing;
    const promise = loader(key);
    // Una promesa rechazada no queda cacheada: un reintento real dentro del
    // mismo cierre debe poder repetir la llamada de red, no repetir para
    // siempre el mismo error.
    promise.catch(() => cache.delete(k));
    cache.set(k, promise);
    return promise;
  };
}

export type CloseIdentityCache = {
  resolveJugadorId: (
    params: ResolveJugadorIdForParticipacionParams
  ) => Promise<string | null>;
  ensureIdentity: (
    jugadorId: string
  ) => Promise<RivieraIdentityEnsureResult | null>;
  ensureProfileLink: (
    jugadorId: string,
    organizadorId: string
  ) => Promise<ProfileLinkResolution>;
  /** Una sola consulta para todo el cierre, precomputada al crear el caché. */
  revokedLocalIds: Promise<Set<string>>;
};

export function createCloseIdentityCache(
  organizadorId: string
): CloseIdentityCache {
  const ensureIdentity = memoizeAsync(
    (jugadorId: string) => ensureRivieraIdentity(jugadorId),
    (jugadorId) => jugadorId
  );

  const ensureProfileLinkRaw = memoizeAsync(
    (key: { jugadorId: string; organizadorId: string }) =>
      ensureOfficialProfileLinkForParticipacion(
        key.jugadorId,
        key.organizadorId
      ),
    (key) => `${key.jugadorId}::${key.organizadorId}`
  );
  const ensureProfileLink = (jugadorId: string, orgId: string) =>
    ensureProfileLinkRaw({ jugadorId, organizadorId: orgId });

  // Referencia adelantada: el loader de resolveJugadorId necesita pasarse a
  // sí mismo (vía `cache`) para que la resolución de identidad DENTRO de una
  // sola llamada a resolveJugadorIdForParticipacion también use
  // ensureIdentity/ensureProfileLink cacheados -- válido porque el loader es
  // un closure que recién se ejecuta después de que `cache` ya quedó
  // asignado, nunca durante la construcción del objeto.
  const cache: CloseIdentityCache = {
    resolveJugadorId: memoizeAsync(
      (params: ResolveJugadorIdForParticipacionParams) =>
        resolveJugadorIdForParticipacion(params, cache),
      (params) =>
        `${params.organizadorId}::${
          params.jugadorId ?? params.legacyPlayerId ?? params.legacyLigaJugadorId ?? ""
        }`
    ),
    ensureIdentity,
    ensureProfileLink,
    revokedLocalIds: listRevokedGrantLocalJugadorIds(organizadorId),
  };

  return cache;
}
