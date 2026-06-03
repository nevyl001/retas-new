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

export type RivieraJugadorEstado = "activo" | "invitado" | "archivado";

export type JugadorTipoEvento =
  | "reta"
  | "torneo_express"
  | "liga"
  | "americano";

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
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  visible_publico: boolean;
  genero: string | null;
  fecha_nacimiento: string | null;
  club: string | null;
  organizador_id: string;
  estado: RivieraJugadorEstado;
  legacy_player_id: string | null;
  legacy_liga_jugador_id: string | null;
  created_at: string;
  updated_at: string;
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

export interface RivieraJugadorWithStats extends RivieraJugador {
  stats?: JugadorStats | null;
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
  genero?: string | null;
  club?: string | null;
  foto_url?: string | null;
}
