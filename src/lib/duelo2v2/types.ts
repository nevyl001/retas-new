export type Duelo2v2Estado = "configuracion" | "en_juego" | "finalizado";

export type Duelo2v2Ganador = "a" | "b";

export interface Duelo2v2SetDetalle {
  a: number;
  b: number;
}

export interface Duelo2v2 {
  id: string;
  organizador_id: string;
  nombre: string;
  descripcion: string | null;
  cancha: string | null;
  /** Sede donde se juega (puede diferir del nombre del club/comunidad). */
  lugar?: string | null;
  /** Si false, la convocatoria omite la línea de lugar. */
  mostrar_lugar?: boolean | null;
  programado_en: string | null;
  programado_hasta: string | null;
  estado: Duelo2v2Estado;
  pareja_a_j1_id: string | null;
  pareja_a_j2_id: string | null;
  pareja_a_j1_nombre: string;
  pareja_a_j2_nombre: string;
  pareja_b_j1_id: string | null;
  pareja_b_j2_id: string | null;
  pareja_b_j1_nombre: string;
  pareja_b_j2_nombre: string;
  sets_pareja_a: number;
  sets_pareja_b: number;
  detalle_sets: Duelo2v2SetDetalle[];
  ganador: Duelo2v2Ganador | null;
  created_at: string;
  updated_at: string;
  finalizado_at: string | null;
  /** Soft-archive desde Mis retas; null = visible en admin. */
  archived_at?: string | null;
}

export interface CreateDuelo2v2DraftInput {
  nombre: string;
  descripcion?: string;
  cancha?: string;
  lugar?: string;
  mostrar_lugar?: boolean;
  programado_en?: string | null;
  programado_hasta?: string | null;
}

export interface CreateDuelo2v2Input {
  nombre: string;
  descripcion?: string;
  cancha?: string;
  programado_en?: string | null;
  programado_hasta?: string | null;
  pareja_a_j1_id: string;
  pareja_a_j2_id: string;
  pareja_a_j1_nombre: string;
  pareja_a_j2_nombre: string;
  pareja_b_j1_id: string;
  pareja_b_j2_id: string;
  pareja_b_j1_nombre: string;
  pareja_b_j2_nombre: string;
}

export interface UpdateDuelo2v2ScoreInput {
  detalle_sets: Duelo2v2SetDetalle[];
}

export interface UpdateDuelo2v2DetailsInput {
  nombre: string;
  cancha?: string;
  lugar?: string | null;
  mostrar_lugar?: boolean;
  programado_en?: string | null;
  programado_hasta?: string | null;
}

export interface Duelo2v2JugadorSlot {
  id: string;
  nombre: string;
  foto_url?: string | null;
}
