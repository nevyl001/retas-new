export type TorneoExpressEstado = "pendiente" | "en_curso" | "finalizado";
export type PartidoExpressEstado = "pendiente" | "jugado";
export type TorneoExpressFaseTorneo = "grupos" | "eliminatoria" | "cerrado";
export type TorneoExpressFaseEliminacion = "semifinal" | "cuartos" | "octavos";

/** Marcador por set en partidos al mejor de 3. */
export interface PartidoSetScore {
  local: number;
  visitante: number;
}

export interface TorneoExpress {
  id: string;
  nombre: string;
  /** Ej. 4ta, 5ta, Open — requiere columna `categoria` en Supabase */
  categoria?: string | null;
  organizador_id: string;
  estado: TorneoExpressEstado;
  source_tournament_id: string | null;
  created_at: string;
  fase_torneo?: TorneoExpressFaseTorneo | null;
  fase_eliminacion?: TorneoExpressFaseEliminacion | null;
  bracket_slots?: unknown;
  fase_grupos_finalizada_at?: string | null;
}

export interface TorneoExpressEliminatoriaPartido {
  id: string;
  torneo_id: string;
  ronda: number;
  orden: number;
  cruce_index: number;
  pareja_local_id: string | null;
  pareja_visitante_id: string | null;
  puntos_local: number | null;
  puntos_visitante: number | null;
  /** JSON [{local, visitante}, ...]; null si un solo set (usa puntos_*). */
  sets_resultado?: PartidoSetScore[] | null;
  ganador_id: string | null;
  estado: PartidoExpressEstado;
  es_bye: boolean;
  cancha?: string | null;
  programado_en?: string | null;
  created_at: string;
}

export interface TorneoExpressGrupo {
  id: string;
  torneo_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

export interface TorneoExpressGrupoPareja {
  id: string;
  grupo_id: string;
  pareja_id: string;
  /** No existe en BD; se rellena desde tabla `pairs` al cargar. */
  pareja_display?: string;
  created_at: string;
}

export interface TorneoExpressPartido {
  id: string;
  grupo_id: string;
  pareja_local_id: string;
  pareja_visitante_id: string;
  puntos_local: number | null;
  puntos_visitante: number | null;
  /** JSON [{local, visitante}, ...] en eliminatoria multi-set. */
  sets_resultado?: PartidoSetScore[] | null;
  ganador_id: string | null;
  estado: PartidoExpressEstado;
  /** Orden de juego en el grupo (1 = primero). */
  orden?: number | null;
  /** Ronda round-robin circular. */
  ronda?: number | null;
  /** Cancha asignada (ej. "1", "Cancha central"). */
  cancha?: string | null;
  /** Día y hora programados (editable); si falta en BD se usa created_at. */
  programado_en?: string | null;
  created_at: string;
}

export interface TorneoExpressBundle {
  torneo: TorneoExpress;
  grupos: TorneoExpressGrupo[];
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>;
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>;
  eliminatoriaPartidos: TorneoExpressEliminatoriaPartido[];
}

export interface StandingRowExpress {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
  pj: number;
  pg: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  dif: number;
  puntos: number;
}

export interface GrupoAssignmentDraft {
  nombre: string;
  orden: number;
  parejaIds: string[];
}
