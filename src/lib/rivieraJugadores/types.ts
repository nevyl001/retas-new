import type { RivieraJugadorGenero } from "./genero";

export type RivieraJugadorNivel =
  | "iniciación"
  | "intermedio"
  | "avanzado"
  | "competición"
  | "élite";

/** Categoría deportiva Riviera Open (ranking público). */
export type RivieraJugadorCategoria =
  | "open"
  | "1ra_fuerza"
  | "2da_fuerza"
  | "3ra_fuerza"
  | "4ta_fuerza"
  | "5ta_fuerza"
  | "6ta_fuerza";

export type ManoDominante = "derecha" | "izquierda" | "ambidiestro";

/** Lado en cancha (pádel): revés o drive. */
export type EnCancha = "reves" | "drive";

export type RivieraJugadorEstado = "activo" | "invitado" | "archivado";

export type JugadorTipoEvento =
  | "reta"
  | "torneo_express"
  | "liga"
  | "americano"
  | "duelo_2v2";

export type JugadorResultado =
  | "victoria"
  | "derrota"
  | "empate"
  | "participación";

export interface RivieraJugador {
  id: string;
  nombre: string;
  slug: string;
  foto_url: string | null;
  email: string | null;
  telefono: string | null;
  whatsapp: string | null;
  nivel: RivieraJugadorNivel;
  categoria: RivieraJugadorCategoria;
  edad: number | null;
  mano_dominante: ManoDominante | null;
  en_cancha: EnCancha | null;
  /** ISO 3166-1 alpha-2 (MX, ES, US…) para bandera en ficha y ranking. */
  pais_codigo: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  visible_publico: boolean;
  /** Si false, no suma puntos ni aparece en ranking público. */
  suma_ranking: boolean;
  genero: RivieraJugadorGenero | null;
  fecha_nacimiento: string | null;
  club: string | null;
  organizador_id: string;
  estado: RivieraJugadorEstado;
  legacy_player_id: string | null;
  legacy_liga_jugador_id: string | null;
  created_at: string;
  updated_at: string;
  /** Nivel Playtomic-style (1.00–7.00), default 3.00 */
  rating: number;
  rating_partidos: number;
  rating_fiabilidad: number;
  /** Identificador público legible (RIV-00000001). Solo lectura UI. */
  riviera_id?: string | null;
}

export interface JugadorStats {
  jugador_id: string;
  total_partidos: number;
  victorias: number;
  derrotas: number;
  empates: number;
  participaciones_solo: number;
  pct_victorias: number;
  total_retas: number;
  total_torneos_express: number;
  total_ligas: number;
  total_americanos: number;
  sets_favor_total: number;
  sets_contra_total: number;
  racha_actual: string;
  ultima_actividad: string | null;
  puntos_totales: number;
  updated_at: string;
}

export interface JugadorParticipacion {
  id: string;
  jugador_id: string;
  tipo_evento: JugadorTipoEvento;
  evento_id: string;
  evento_nombre: string;
  fecha: string;
  pareja_con: string | null;
  resultado: JugadorResultado;
  sets_favor: number;
  sets_contra: number;
  puntos_obtenidos: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Detalle partido a partido en metadata.partidos_detalle (reta_cierre). */
export type { RetaPartidoDetalle } from "./buildRetaPartidosDetalle";

export interface RivieraJugadorWithStats extends RivieraJugador {
  stats?: JugadorStats | null;
  /** Puntos ROMC globales (todos los clubes); prioridad en ranking oficial. */
  officialPuntosGlobal?: number | null;
  /** Puntos del club dueño del registro (solo lectura en destino concedido). */
  statsOrigenConcedido?: JugadorStats | null;
  /** Jugador con acceso concedido por Admin Principal (visible para este organizador). */
  concedidoPorAdmin?: boolean;
  grantedAccess?: {
    accessId: string;
    sourceJugadorId: string;
    ownerOrganizadorId?: string;
  };
  /** Jugador nativo del club con actividad en clubes cedidos (clones). */
  multiclubGranteePuntos?: Array<{
    organizadorId: string;
    localJugadorId: string;
    puntosTotales: number;
  }>;
}

export interface RatingHistorialEntry {
  id: string;
  fecha: string;
  rating_antes: number;
  rating_despues: number;
  delta: number;
  modo_juego: string;
  descripcion: string;
}

/** Movimiento de nivel de un jugador en un partido concreto. */
export interface RatingMovimientoPartido {
  jugadorId: string;
  ratingAntes: number;
  ratingDespues: number;
  delta: number;
}

export interface RegistrarParticipacionParams {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  parejaCon?: string;
  resultado: JugadorResultado;
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos?: number;
  metadata?: Record<string, unknown>;
  fecha?: string;
}

export interface CreateRivieraJugadorInput {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  nivel?: RivieraJugadorNivel;
  categoria?: RivieraJugadorCategoria;
  edad?: number | null;
  mano_dominante?: ManoDominante | null;
  en_cancha?: EnCancha | null;
  pais_codigo?: string | null;
  genero?: RivieraJugadorGenero | null;
  club?: string | null;
  foto_url?: string | null;
}
