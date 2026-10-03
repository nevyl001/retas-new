import type { PersistedScheduleMatch } from "./draftScheduleMatch";
import type { TorneoExpressEliminatoriaPartido } from "./types";

/**
 * Partidos jugables de una ronda eliminatoria → input del scheduler
 * (misma forma que grupos; un solo groupKey para repartir canchas en paralelo).
 */
export function buildEliminatoriaRoundScheduleMatches(
  partidos: TorneoExpressEliminatoriaPartido[],
  ronda: number
): PersistedScheduleMatch[] {
  return partidos
    .filter(
      (p) =>
        p.ronda === ronda &&
        !p.es_bye &&
        Boolean(p.pareja_local_id?.trim()) &&
        Boolean(p.pareja_visitante_id?.trim())
    )
    .slice()
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((p, index) => ({
      partidoId: p.id,
      matchKey: `elim:${p.id}`,
      groupKey: 0,
      grupoNombre: "Eliminatoria",
      parejaLocalId: p.pareja_local_id!,
      parejaVisitanteId: p.pareja_visitante_id!,
      ronda: p.ronda,
      orden: p.orden ?? index + 1,
    }));
}

export function eliminatoriaRoundPendingCount(
  partidos: TorneoExpressEliminatoriaPartido[],
  ronda: number
): number {
  return partidos.filter(
    (p) =>
      p.ronda === ronda &&
      !p.es_bye &&
      p.estado !== "jugado" &&
      Boolean(p.pareja_local_id?.trim()) &&
      Boolean(p.pareja_visitante_id?.trim())
  ).length;
}
