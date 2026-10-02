import {
  hasCategoriaEliminatoria,
  resolveCategoriaPhaseLabel,
  type EliminatoriaPartidoPhaseHint,
} from "./categoriaPublicPhase";
import { formatTorneoExpressCategoria } from "./formatCategoria";
import { resolveTorneoExpressDisplayEstado } from "./resolveDisplayEstado";
import type {
  TorneoExpress,
  TorneoExpressEventoPublicoCategoriaStats,
  TorneoExpressEventoPublicoGrupo,
} from "./types";

export type CategoriaPublicCardStats = {
  title: string;
  estadoLabel: string;
  phaseLabel: string;
  parejaCount: number;
  gruposCount: number;
  partidoJugados: number;
  partidoTotal: number;
  /** null si aún no hay partidos programados. */
  progress01: number | null;
  hasEliminatoria: boolean;
  hasGrupos: boolean;
};

function estadoLabelFromCategoria(
  estado: TorneoExpress["estado"] | string | null | undefined
): string {
  switch (estado) {
    case "finalizado":
      return "Finalizado";
    case "en_curso":
      return "En curso";
    case "pendiente":
      return "Pendiente";
    default:
      return "En curso";
  }
}

/**
 * Deriva la face del hub público de categoría a partir del payload del Evento.
 * Puro: no fetch, no reglas deportivas nuevas.
 */
export function buildCategoriaPublicCardStats(input: {
  categoria: Pick<
    TorneoExpress,
    | "id"
    | "nombre"
    | "categoria"
    | "estado"
    | "fase_torneo"
    | "fase_eliminacion"
    | "bracket_slots"
  >;
  grupos: TorneoExpressEventoPublicoGrupo[];
  stats: TorneoExpressEventoPublicoCategoriaStats | undefined;
  eliminatoriaPartidos: EliminatoriaPartidoPhaseHint[];
  eventFechaInicio?: string | null;
  eventTimezone?: string | null;
  now?: Date;
}): CategoriaPublicCardStats {
  const { categoria, grupos, stats, eliminatoriaPartidos } = input;
  const parejaCount = stats?.parejaCount ?? 0;
  const partidoTotal = stats?.partidoTotal ?? 0;
  const partidoJugados = stats?.partidoJugados ?? 0;
  const hasElim = hasCategoriaEliminatoria(
    categoria.fase_torneo,
    eliminatoriaPartidos.length
  );
  const displayEstado = resolveTorneoExpressDisplayEstado({
    estado: categoria.estado,
    eventFechaInicio: input.eventFechaInicio,
    eventTimezone: input.eventTimezone,
    now: input.now,
  });

  return {
    title:
      formatTorneoExpressCategoria(categoria.categoria) ||
      categoria.nombre?.trim() ||
      "Categoría",
    estadoLabel: estadoLabelFromCategoria(displayEstado),
    phaseLabel: resolveCategoriaPhaseLabel({
      faseTorneo: categoria.fase_torneo,
      estado: displayEstado,
      faseEliminacion: categoria.fase_eliminacion,
      bracketSlots: categoria.bracket_slots,
      eliminatoriaPartidos,
    }),
    parejaCount,
    gruposCount: grupos.length,
    partidoJugados,
    partidoTotal,
    progress01: partidoTotal > 0 ? partidoJugados / partidoTotal : null,
    hasEliminatoria: hasElim,
    hasGrupos: grupos.length > 0,
  };
}
