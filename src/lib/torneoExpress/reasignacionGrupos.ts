import { partidoTieneHistorial } from "./partidoHistorial";
import {
  buildGroupReassignment,
  type ReassignExistingMatch,
} from "./reassignGroupPairs";
import { unorderedMatchupKey } from "./roundRobin";

export type ReasignacionGrupo = { id: string; nombre: string; orden: number };

export type ReasignacionMatchRef = {
  pareja_local_id: string;
  pareja_visitante_id: string;
  cancha?: string | null;
  programado_en?: string | null;
  estado?: string | null;
  ganador_id?: string | null;
  puntos_local?: number | null;
  puntos_visitante?: number | null;
  sets_resultado?: unknown;
};

export type ReasignacionPlan = {
  grupos: Array<{ grupoId: string; parejaIds: string[] }>;
  partidos: Array<{
    grupoId: string;
    pareja_local_id: string;
    pareja_visitante_id: string;
    ronda: number;
    orden: number;
    cancha: string;
    programado_en: string;
  }>;
};

function toExisting(match: ReasignacionMatchRef): ReassignExistingMatch {
  return {
    localId: match.pareja_local_id,
    visitanteId: match.pareja_visitante_id,
    cancha: match.cancha ?? null,
    programadoEn: match.programado_en ?? null,
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Plan para reacomodar parejas. Un grupo puede ya tener resultados: esos
 * cruces no se regeneran y sus horarios quedan ocupados. Solo se rearman los
 * partidos pendientes de los grupos cuyo conjunto de parejas cambió.
 * Devuelve `null` si no hay cambios.
 */
export function planReasignacion(input: {
  grupos: readonly ReasignacionGrupo[];
  desired: ReadonlyMap<string, string[]>;
  current: ReadonlyMap<string, string[]>;
  partidosPorGrupo: Record<string, readonly ReasignacionMatchRef[]>;
  anchorIso?: string;
}): { ok: true; plan: ReasignacionPlan | null } | { ok: false; error: string } {
  const ordered = [...input.grupos].sort((a, b) => a.orden - b.orden);
  const changed = ordered.filter((grupo) => {
    const want = input.desired.get(grupo.id);
    if (!want) return false;
    return !sameSet(want, input.current.get(grupo.id) ?? []);
  });
  if (changed.length === 0) return { ok: true, plan: null };

  const changedIds = new Set(changed.map((g) => g.id));
  const playedKeys = new Set<string>();
  const existentes: ReassignExistingMatch[] = [];
  const fixed: ReassignExistingMatch[] = [];
  for (const grupo of ordered) {
    for (const match of input.partidosPorGrupo[grupo.id] ?? []) {
      const slot = toExisting(match);
      if (!changedIds.has(grupo.id) || partidoTieneHistorial(match)) {
        fixed.push(slot);
        if (changedIds.has(grupo.id) && partidoTieneHistorial(match)) {
          playedKeys.add(
            unorderedMatchupKey(match.pareja_local_id, match.pareja_visitante_id)
          );
        }
      } else {
        existentes.push(slot);
      }
    }
  }

  const built = buildGroupReassignment({
    grupos: changed.map((g) => ({
      orden: g.orden,
      nombre: g.nombre,
      parejaIds: input.desired.get(g.id) ?? [],
    })),
    existentes,
    fixed,
    omitMatchups: playedKeys,
    anchorIso: input.anchorIso ?? new Date().toISOString(),
  });
  if (!built.ok) return built;

  // buildGroupReassignment numera los grupos 1..n en el orden recibido.
  const grupoPorOrden = new Map(changed.map((g, i) => [i + 1, g.id]));
  return {
    ok: true,
    plan: {
      grupos: changed.map((g) => ({
        grupoId: g.id,
        parejaIds: input.desired.get(g.id) ?? [],
      })),
      partidos: built.payload.partidos.map((p) => ({
        grupoId: grupoPorOrden.get(p.grupo_orden) ?? "",
        pareja_local_id: p.pareja_local_id,
        pareja_visitante_id: p.pareja_visitante_id,
        ronda: p.ronda,
        orden: p.orden,
        cancha: p.cancha,
        programado_en: p.programado_en,
      })),
    },
  };
}
