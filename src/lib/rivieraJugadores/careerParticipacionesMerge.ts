import { dedupeParticipacionesById } from "./grantedPlayerUnifiedView";
import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import { listParticipacionesPublic } from "./rivieraJugadoresService";
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
 * Historial global deduplicado: RPC de carrera + fallback org-scoped por perfil enlazado.
 * El evento pertenece al club donde se jugó (metadata.organizador_id / duelo), no al club origen.
 */
export async function mergeCareerParticipacionesForIdentity(
  identity: CareerParticipacionesMergeInput,
  limit: number
): Promise<JugadorParticipacion[]> {
  const ids = careerProfileIdsForIdentity(identity);
  if (ids.length === 0) return [];

  const careerLists = await Promise.all(
    ids.map((id) => listCareerParticipacionesPublic(id, limit))
  );

  let merged = dedupeParticipacionesById(
    careerLists.flatMap((list) => list ?? [])
  );

  const viewOrg = identity.viewingOrganizadorId?.trim();
  const supplementTasks: Promise<JugadorParticipacion[]>[] = [];
  for (const id of ids) {
    if (viewOrg) {
      supplementTasks.push(listParticipacionesPublic(id, limit, viewOrg));
    }
    supplementTasks.push(listParticipacionesPublic(id, limit, null));
  }
  const supplemented = await Promise.all(supplementTasks);
  merged = dedupeParticipacionesById([...merged, ...supplemented.flat()]);

  return enrichParticipacionesOrganizadorFromEvents(merged);
}
