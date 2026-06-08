import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";

export type LigaEstado = "upcoming" | "in_progress" | "completed";
export type LigaJornadaEstado = "upcoming" | "in_progress" | "completed";
export type LigaPartidoEstado = "upcoming" | "in_progress" | "completed";
export type LigaJugadorGenero = "M" | "F";
export type LigaJugadorEstado = "activo" | "inactivo";

export interface Liga {
  id: string;
  nombre: string;
  estado: LigaEstado;
  organizador_id: string | null;
  canchas_disponibles: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at: string;
  inscripciones_count?: number;
}

export interface LigaJugador {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  genero: LigaJugadorGenero | null;
  nivel: number | null;
  estado: LigaJugadorEstado;
  organizador_id: string | null;
  created_at: string;
}

/** Jugador del pool de liga con categoría del registro Riviera Open. */
export interface LigaJugadorPoolItem extends LigaJugador {
  categoria: RivieraJugadorCategoria | null;
}

export interface LigaInscripcion {
  id: string;
  liga_id: string;
  jugador_id: string;
  puntos: number;
  jugador?: LigaJugador;
}

export interface LigaJornadaPareja {
  id: string;
  jornada_id: string;
  jugador1_id: string;
  jugador2_id: string;
  jugador1?: LigaJugador;
  jugador2?: LigaJugador;
}

export interface LigaPartido {
  id: string;
  jornada_id: string;
  pareja1_id: string;
  pareja2_id: string;
  score_pareja1: number | null;
  score_pareja2: number | null;
  cancha: number | null;
  ronda: number;
  estado: LigaPartidoEstado;
  created_at: string;
  pareja1?: LigaJornadaPareja;
  pareja2?: LigaJornadaPareja;
}

export interface LigaJornada {
  id: string;
  liga_id: string;
  numero: number;
  estado: LigaJornadaEstado;
  fecha: string | null;
  created_at: string;
  /** true cuando finishJornada / auto-suma ya actualizó liga_inscripciones */
  puntos_aplicados?: boolean;
  parejas?: LigaJornadaPareja[];
  partidos?: LigaPartido[];
}

export interface LigaDetalle extends Liga {
  inscripciones: LigaInscripcion[];
  jugadores: LigaJugador[];
  jornadas: LigaJornada[];
}

export interface RankingItem {
  posicion: number;
  jugador_id: string;
  nombre: string;
  puntos: number;
  jornadas_jugadas: number;
}

export interface CreateLigaInput {
  nombre: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  canchas_disponibles?: number;
}

export interface AddJugadorLigaInput {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  genero?: LigaJugadorGenero | null;
  nivel?: number | null;
}

export interface UpdateJugadorLigaInput {
  nombre?: string;
  email?: string | null;
  telefono?: string | null;
  genero?: LigaJugadorGenero | null;
  nivel?: number | null;
}
