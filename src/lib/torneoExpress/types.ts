export type TorneoExpressEstado = "pendiente" | "en_curso" | "finalizado";
export type PartidoExpressEstado = "pendiente" | "jugado";
export type TorneoExpressFaseTorneo = "grupos" | "eliminatoria" | "cerrado";
export type TorneoExpressFaseEliminacion = "semifinal" | "cuartos" | "octavos";

/** Ciclo de vida del Evento contenedor (organizativo; no altera estado deportivo). */
export type TorneoExpressEventoEstado =
  | "draft"
  | "published"
  | "in_progress"
  | "completed"
  | "archived";

export type TorneoExpressEventoLogoSource = "flyer" | "club";

/** Preset de desempate de grupos (pase a siguiente fase), a nivel evento. */
export type TorneoExpressClasificacionModo = "dif_puntos" | "setto_pg";

/** Formato de captura de partidos a nivel evento. */
export type TorneoExpressPartidoFormato = "flexible" | "bo3_super_muerte";

export const DEFAULT_CLASIFICACION_MODO: TorneoExpressClasificacionModo =
  "dif_puntos";
export const DEFAULT_PARTIDO_FORMATO: TorneoExpressPartidoFormato = "flexible";

/** Evento contenedor multi-categoría (`torneo_express_evento`). */
export interface TorneoExpressEvento {
  id: string;
  nombre: string;
  organizador_id: string;
  slug: string | null;
  estado: TorneoExpressEventoEstado;
  flyer_url: string | null;
  logo_source: TorneoExpressEventoLogoSource;
  timezone: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** Desempate de standings de grupos para todas las categorías. */
  clasificacion_modo: TorneoExpressClasificacionModo;
  /** Reglas de marcador (flexible vs Bo3 + super muerte). */
  partido_formato: TorneoExpressPartidoFormato;
  /** Inicio de la fase eliminatoria del evento. NULL = por definir. */
  eliminatoria_inicio?: string | null;
  /** Orden de arranque de categorías (`torneo_express.id`). NULL = por nivel. */
  eliminatoria_categoria_orden?: string[] | null;
  /** Canchas disponibles para la fase eliminatoria. NULL/vacío = por definir. */
  eliminatoria_canchas?: string[] | null;
  /** Minutos por ronda (octavos, cuartos, semis, final). NULL = 60 cada una. */
  eliminatoria_duraciones?: {
    octavos: number;
    cuartos: number;
    semifinal: number;
    final: number;
    activas?: Array<"octavos" | "cuartos" | "semifinal" | "final">;
    /** Orden de juego: `torneoId:ronda`. NULL = misma ronda en todas las categorías. */
    fase_orden?: string[];
  } | null;
  created_at: string;
}

export interface TorneoExpressEventoConCategorias {
  evento: TorneoExpressEvento;
  /** Filas `torneo_express` con este `evento_id` (categorías aisladas). */
  categorias: TorneoExpress[];
}

/** Grupo ligero para el hub público del Evento (sin parejas ni partidos). */
export type TorneoExpressEventoPublicoGrupo = Pick<
  TorneoExpressGrupo,
  "id" | "torneo_id" | "nombre" | "orden"
>;

/** Conteos agregados por categoría para la face de la card pública. */
export type TorneoExpressEventoPublicoCategoriaStats = {
  parejaCount: number;
  partidoTotal: number;
  partidoJugados: number;
};

/** Lectura pública del Evento + evidencia de eliminatoria por categoría. */
export interface TorneoExpressEventoPublico
  extends TorneoExpressEventoConCategorias {
  /**
   * Partidos eliminatorios indexados por `torneo_express.id` (nunca por evento_id).
   * Vacío si esa categoría aún no tiene cuadro generado.
   */
  eliminatoriaPartidosByTorneoId: Record<
    string,
    Array<
      Pick<
        TorneoExpressEliminatoriaPartido,
        "torneo_id" | "ronda" | "orden" | "estado" | "es_bye" | "ganador_id"
      >
    >
  >;
  /** Grupos por `torneo_express.id`, ordenados por `orden`. */
  gruposByTorneoId: Record<string, TorneoExpressEventoPublicoGrupo[]>;
  /** Parejas / partidos de fase de grupos por categoría. */
  statsByTorneoId: Record<string, TorneoExpressEventoPublicoCategoriaStats>;
}

/** Marcador por set en partidos al mejor de 3. */
export interface PartidoSetScore {
  local: number;
  visitante: number;
  /** El usuario lo agregó a mano. No cambia el resto de los sets. */
  super_muerte?: boolean;
}

export interface ExpectedPairSide {
  pair_id: string;
  player1_id: string | null;
  player2_id: string | null;
  is_virtual: boolean;
}

/** Composición congelada al abrir el modal de resultado. No sigue al realtime. */
export interface ExpectedPairs {
  local: ExpectedPairSide;
  visitante: ExpectedPairSide;
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
  /** FK opcional al Evento contenedor (Fase 1). NULL = legacy / standalone. */
  evento_id?: string | null;
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
  /** Sube al resetear, guardar marcador o cambiar el roster. */
  version?: number;
  created_at: string;
}

/** Lado congelado al guardar el primer resultado. Los nombres son los que ya tenía la pareja. */
export interface ParticipanteLadoSnapshot {
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  is_virtual: boolean;
  virtual_label: string | null;
}

export interface ParticipantesSnapshot {
  local: ParticipanteLadoSnapshot;
  visitante: ParticipanteLadoSnapshot;
}

export interface TorneoExpressGrupoPareja {
  id: string;
  grupo_id: string;
  pareja_id: string;
  /** Falta el campo en filas viejas: se trata como activa. */
  activa?: boolean;
  retirada_at?: string | null;
  /** Parejas anteriores del mismo slot. Sus partidos jugados cuentan para `pareja_id`. */
  pareja_previa_ids?: string[];
  /** No existe en BD; se rellena desde tabla `pairs` al cargar. */
  pareja_display?: string;
  /** Identidad interna de la pareja. No se muestra en la UI. */
  player1_id?: string | null;
  player2_id?: string | null;
  /** Plaza sin jugadores. El label público es `virtual_label` o `pareja_display`. */
  is_virtual?: boolean;
  virtual_label?: string | null;
  created_at: string;
}

/** Fila de `pairs` cuando la pareja puede ser virtual. No es el `Pair` de reta. */
export interface TorneoExpressPairRow {
  id: string;
  tournament_id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  is_virtual: boolean;
  virtual_label: string | null;
  created_at: string;
}

/**
 * Identidad de una plaza. `pairId` no cambia al resolver una virtual.
 * `display` es lo único que se muestra.
 */
export interface PairIdentity {
  pairId: string;
  player1Id: string | null;
  player2Id: string | null;
  isVirtual: boolean;
  display: string;
}

export interface TorneoExpressPartido {
  id: string;
  grupo_id: string;
  pareja_local_id: string;
  pareja_visitante_id: string;
  puntos_local: number | null;
  puntos_visitante: number | null;
  /** JSON [{local, visitante}, ...] — fuente de verdad del marcador por sets. */
  sets_resultado?: PartidoSetScore[] | null;
  ganador_id: string | null;
  estado: PartidoExpressEstado;
  /** Quién jugó de verdad. Null mientras el partido no está jugado. */
  participantes?: ParticipantesSnapshot | null;
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
  /** Heredado del evento contenedor; default dif_puntos si no hay evento. */
  clasificacion_modo: TorneoExpressClasificacionModo;
  /** Heredado del evento contenedor; default flexible si no hay evento. */
  partido_formato: TorneoExpressPartidoFormato;
}

/**
 * Empate deportivo de un bloque de la tabla.
 * `pairIds` identifica el subconjunto; el orden de ese arreglo no es una posición.
 */
export type StandingTie =
  | { status: "resolved" }
  | { status: "unresolved"; pairIds: readonly string[] };

export interface StandingRowExpress {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
  /** Ranking competitivo: 1, 2, 2, 4. No es el índice visual del arreglo. */
  posicion: number;
  tie: StandingTie;
  pj: number;
  pg: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  dif: number;
  puntos: number;
  /** Sets a favor / en contra (desempate setto_pg); opcional en fixtures. */
  setsFav?: number;
  setsCon?: number;
}

export interface GrupoAssignmentDraft {
  nombre: string;
  orden: number;
  parejaIds: string[];
}
