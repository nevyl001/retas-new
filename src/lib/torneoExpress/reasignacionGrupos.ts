import {
  buildGroupReassignment,
  type ReassignExistingMatch,
} from "./reassignGroupPairs";

export type ReasignacionGrupo = { id: string; nombre: string; orden: number };

export type ReasignacionMatchRef = {
  pareja_local_id: string;
  pareja_visitante_id: string;
  cancha?: string | null;
  programado_en?: string | null;
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
 * Plan para reacomodar parejas solo en grupos sin resultados.
 * - `desired`: parejas que debe tener cada grupo editable (los bloqueados no van).
 * - `current`: parejas actuales de cada grupo.
 * Solo se regeneran los grupos cuyo conjunto de parejas cambió; los demás
 * (iniciados o sin cambios) quedan intactos y sus horarios cuentan como ocupados.
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
  const existentes = changed.flatMap((g) =>
    (input.partidosPorGrupo[g.id] ?? []).map(toExisting)
  );
  const fixed = ordered
    .filter((g) => !changedIds.has(g.id))
    .flatMap((g) => (input.partidosPorGrupo[g.id] ?? []).map(toExisting));

  const built = buildGroupReassignment({
    grupos: changed.map((g) => ({
      orden: g.orden,
      nombre: g.nombre,
      parejaIds: input.desired.get(g.id) ?? [],
    })),
    existentes,
    fixed,
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
