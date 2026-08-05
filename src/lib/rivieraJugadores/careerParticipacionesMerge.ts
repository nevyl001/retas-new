import { dedupeParticipacionesById } from "./grantedPlayerUnifiedView";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import {
  listCareerParticipacionesPublic,
  listParticipacionesForJugadorIds,
} from "./publicCareerLinkage";
import type { JugadorParticipacion } from "./types";

export type CareerParticipacionesMergeInput = {
  canonicalJugadorId: string;
  anchorJugadorId: string;
  linkedJugadorIds: string[];
  viewingOrganizadorId: string | null;
};

/** IDs de perfil a consultar para carrera global (canónico + ancla + enlazados). */
export function careerProfileIdsForIdentity(
  identity: CareerParticipacionesMergeInput
): string[] {
  return Array.from(
    new Set(
      [
        identity.canonicalJugadorId,
        identity.anchorJugadorId,
        ...identity.linkedJugadorIds,
      ]
        .map((id) => id?.trim())
        .filter(Boolean) as string[]
    )
  );
}

/**
 * Historial global deduplicado por participacion.id.
 * GUARD: nunca filtrar por viewingOrganizadorId — la carrera es global.
 */
export async function mergeCareerParticipacionesForIdentity(
  identity: CareerParticipacionesMergeInput,
  limit: number
): Promise<JugadorParticipacion[]> {
  const ids = careerProfileIdsForIdentity(identity);
  if (ids.length === 0) return [];

  // Las dos lecturas son independientes (ninguna depende del resultado de
  // la otra) -- se piden en paralelo en vez de una tras otra (incidente de
  // rendimiento de la ficha pública, 2026-08-05). El merge/dedupe de abajo
  // no cambia: mismo resultado, solo se espera menos tiempo por él.
  const [byIds, careerRows] = await Promise.all([
    listParticipacionesForJugadorIds(ids, limit),
    listCareerParticipacionesPublic(identity.anchorJugadorId, limit),
  ]);

  const sources: JugadorParticipacion[][] = [];
  if (byIds?.length) sources.push(byIds);
  if (careerRows?.length) sources.push(careerRows);

  const merged = dedupeParticipacionesById(sources.flat());
  return enrichParticipacionesOrganizadorFromEvents(merged);
}
