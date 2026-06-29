import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import type { LigaPartidoSetScores } from "./parejasFijasMatchScore";

export type LigaEstado = "upcoming" | "in_progress" | "completed";
export type LigaModalidad = "individual_rotativo" | "parejas_fijas";
export type LigaVueltas = 1 | 2 | 3;
export type LigaJornadaEstado = "upcoming" | "in_progress" | "completed";
export type LigaPartidoEstado = "upcoming" | "in_progress" | "completed";
export type LigaJugadorGenero = "M" | "F";
export type LigaJugadorEstado = "activo" | "inactivo";

export interface Liga {
  id: string;
  nombre: string;
  estado: LigaEstado;
  modalidad: LigaModalidad;
  vueltas: LigaVueltas;
  organizador_id: string | null;
  canchas_disponibles: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at: string;
  inscripciones_count?: number;
  equipos_count?: number;
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

export interface LigaEquipo {
  id: string;
  liga_id: string;
  nombre: string | null;
  jugador1_id: string;
  jugador2_id: string;
  puntos: number;
  partidos_jugados: number;
  partidos_ganados: number;
  partidos_perdidos: number;
  games_favor: number;
  games_contra: number;
  diferencia_games: number;
  created_at: string;
  jugador1?: LigaJugador;
  jugador2?: LigaJugador;
}

export interface LigaEquipoRankingItem {
  posicion: number;
  equipo_id: string;
  nombre: string;
  puntos: number;
  partidos_jugados: number;
  partidos_ganados: number;
  partidos_perdidos: number;
  games_favor: number;
  games_contra: number;
  diferencia_games: number;
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
  equipo_id?: string | null;
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
  /** Detalle por sets (parejas fijas: 2 de 3, STB en set 3). */
  set_scores?: LigaPartidoSetScores | null;
  cancha: number | null;
  /** Hora de inicio (HH:mm o HH:mm:ss desde BD). */
  hora_inicio?: string | null;
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
  equipos: LigaEquipo[];
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

export function ligaModalidadLabel(modalidad: LigaModalidad): string {
  return modalidad === "parejas_fijas"
    ? "Liga por parejas fijas"
    : "Liga individual con parejas rotativas";
}

export interface CreateLigaInput {
  nombre: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  canchas_disponibles?: number;
  modalidad?: LigaModalidad;
  vueltas?: LigaVueltas;
}

export interface CreateLigaEquipoInput {
  jugador1_id: string;
  jugador2_id: string;
  nombre?: string | null;
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
