import type { GrupoAssignmentDraft } from "./types";
import type {
  TorneoExpressBundle,
  TorneoExpressGrupo,
  TorneoExpressPartido,
} from "./types";
import { generateBalancedRoundRobin } from "./roundRobin";

/** Partido pre-insert con identidad estable antes de persistir en Supabase. */
export type DraftScheduleMatch = {
  matchKey: string;
  groupKey: number;
  grupoNombre: string;
  parejaLocalId: string;
  parejaVisitanteId: string;
  ronda: number;
  orden: number;
  programado_en?: string;
  cancha?: string;
};

export function buildDraftScheduleMatchKey(input: {
  groupKey: number;
  parejaLocalId: string;
  parejaVisitanteId: string;
  ronda: number;
  orden: number;
}): string {
  return [
    input.groupKey,
    input.parejaLocalId,
    input.parejaVisitanteId,
    input.ronda,
    input.orden,
  ].join(":");
}

/** Genera partidos draft desde assignments usando el RR existente (sin DB). */
export function buildDraftScheduleMatches(
  grupos: GrupoAssignmentDraft[]
): DraftScheduleMatch[] {
  const sorted = [...grupos].sort((a, b) => a.orden - b.orden);
  const matches: DraftScheduleMatch[] = [];

  for (const grupo of sorted) {
    const roundRobin = generateBalancedRoundRobin(grupo.parejaIds);
    for (const m of roundRobin) {
      matches.push({
        matchKey: buildDraftScheduleMatchKey({
          groupKey: grupo.orden,
          parejaLocalId: m.localId,
          parejaVisitanteId: m.visitanteId,
          ronda: m.ronda,
          orden: m.orden,
        }),
        groupKey: grupo.orden,
        grupoNombre: grupo.nombre,
        parejaLocalId: m.localId,
        parejaVisitanteId: m.visitanteId,
        ronda: m.ronda,
        orden: m.orden,
      });
    }
  }

  return matches;
}

/** Assignments desde el bundle cargado (todos los grupos de la categoría). */
export function buildGrupoAssignmentsFromBundle(
  bundle: Pick<TorneoExpressBundle, "grupos" | "parejasPorGrupo">
): GrupoAssignmentDraft[] {
  return [...bundle.grupos]
    .sort((a, b) => a.orden - b.orden)
    .map((grupo) => ({
      nombre: grupo.nombre,
      orden: grupo.orden,
      parejaIds: (bundle.parejasPorGrupo[grupo.id] ?? []).map((p) => p.pareja_id),
    }));
}

function pairIdsKey(localId: string, visitId: string): string {
  return [localId, visitId].sort().join("|");
}

/** Resuelve un partido persistido para un match programado (todos los grupos). */
export function mapScheduledMatchToPartido(
  match: DraftScheduleMatch,
  grupos: TorneoExpressGrupo[],
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>
): TorneoExpressPartido | undefined {
  const grupo = grupos.find((g) => g.orden === match.groupKey);
  if (!grupo) return undefined;

  const partidos = partidosPorGrupo[grupo.id] ?? [];
  const targetPairKey = pairIdsKey(match.parejaLocalId, match.parejaVisitanteId);

  const exact = partidos.find(
    (p) =>
      p.pareja_local_id === match.parejaLocalId &&
      p.pareja_visitante_id === match.parejaVisitanteId &&
      (p.ronda ?? 1) === match.ronda &&
      (p.orden ?? 1) === match.orden
  );
  if (exact) return exact;

  const sameRound = partidos.filter(
    (p) =>
      pairIdsKey(p.pareja_local_id, p.pareja_visitante_id) === targetPairKey &&
      (p.ronda ?? 1) === match.ronda
  );
  if (sameRound.length === 1) return sameRound[0];
  if (sameRound.length > 1) {
    return (
      sameRound.find((p) => (p.orden ?? 1) === match.orden) ?? sameRound[0]
    );
  }

  const sameMatchup = partidos.filter(
    (p) =>
      pairIdsKey(p.pareja_local_id, p.pareja_visitante_id) === targetPairKey
  );
  if (sameMatchup.length === 1) return sameMatchup[0];

  return undefined;
}

export type ScheduledPartidoUpdate = {
  partidoId: string;
  programado_en: string;
  cancha: string;
};

/** Mapea la programación calculada a ids de partido en BD (sin duplicar). */
export function mapScheduledMatchesToPartidoUpdates(
  scheduled: DraftScheduleMatch[],
  bundle: Pick<TorneoExpressBundle, "grupos" | "partidosPorGrupo">
): ScheduledPartidoUpdate[] {
  const updates: ScheduledPartidoUpdate[] = [];
  const usedPartidoIds = new Set<string>();

  for (const match of scheduled) {
    if (!match.programado_en?.trim() || !match.cancha?.trim()) continue;

    const partido = mapScheduledMatchToPartido(
      match,
      bundle.grupos,
      bundle.partidosPorGrupo
    );
    if (!partido || usedPartidoIds.has(partido.id)) continue;

    usedPartidoIds.add(partido.id);
    updates.push({
      partidoId: partido.id,
      programado_en: match.programado_en,
      cancha: match.cancha,
    });
  }

  return updates;
}

export type PersistedScheduleMatch = DraftScheduleMatch & { partidoId: string };

/** Partidos ya persistidos → input del scheduler (sin regenerar enfrentamientos). */
export function buildScheduleMatchesFromBundle(
  grupos: TorneoExpressGrupo[],
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>
): PersistedScheduleMatch[] {
  const sortedGrupos = [...grupos].sort((a, b) => a.orden - b.orden);
  const matches: PersistedScheduleMatch[] = [];

  for (const grupo of sortedGrupos) {
    const partidos = partidosPorGrupo[grupo.id] ?? [];
    for (const partido of partidos) {
      const ronda = partido.ronda ?? 1;
      const orden = partido.orden ?? 1;
      matches.push({
        partidoId: partido.id,
        matchKey: buildDraftScheduleMatchKey({
          groupKey: grupo.orden,
          parejaLocalId: partido.pareja_local_id,
          parejaVisitanteId: partido.pareja_visitante_id,
          ronda,
          orden,
        }),
        groupKey: grupo.orden,
        grupoNombre: grupo.nombre,
        parejaLocalId: partido.pareja_local_id,
        parejaVisitanteId: partido.pareja_visitante_id,
        ronda,
        orden,
      });
    }
  }

  return matches;
}
