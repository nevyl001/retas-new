import type {
  EnCancha,
  JugadorResultado,
  JugadorTipoEvento,
  ManoDominante,
  RivieraJugadorCategoria,
  RivieraJugadorNivel,
} from "./types";

export const JUGADOR_CATEGORIAS_ORDER: RivieraJugadorCategoria[] = [
  "open",
  "1ra_fuerza",
  "2da_fuerza",
  "3ra_fuerza",
  "4ta_fuerza",
  "5ta_fuerza",
  "6ta_fuerza",
];

export const JUGADOR_CATEGORIA_LABELS: Record<RivieraJugadorCategoria, string> = {
  open: "Open",
  "1ra_fuerza": "1ra fuerza",
  "2da_fuerza": "2da fuerza",
  "3ra_fuerza": "3ra fuerza",
  "4ta_fuerza": "4ta fuerza",
  "5ta_fuerza": "5ta fuerza",
  "6ta_fuerza": "6ta fuerza",
};

/** Etiquetas cortas para selector móvil (sin scroll horizontal). */
export const JUGADOR_CATEGORIA_SHORT_LABELS: Record<RivieraJugadorCategoria, string> = {
  open: "Open",
  "1ra_fuerza": "1ra",
  "2da_fuerza": "2da",
  "3ra_fuerza": "3ra",
  "4ta_fuerza": "4ta",
  "5ta_fuerza": "5ta",
  "6ta_fuerza": "6ta",
};

export const JUGADOR_CATEGORIA_CLASS: Record<RivieraJugadorCategoria, string> = {
  open: "rj-cat--open",
  "1ra_fuerza": "rj-cat--1",
  "2da_fuerza": "rj-cat--2",
  "3ra_fuerza": "rj-cat--3",
  "4ta_fuerza": "rj-cat--4",
  "5ta_fuerza": "rj-cat--5",
  "6ta_fuerza": "rj-cat--6",
};

/** Abreviatura en el dot badge del avatar (ficha pública). */
export const JUGADOR_CATEGORIA_AVATAR_BADGE: Record<RivieraJugadorCategoria, string> = {
  open: "OP",
  "1ra_fuerza": "1",
  "2da_fuerza": "2",
  "3ra_fuerza": "3",
  "4ta_fuerza": "4",
  "5ta_fuerza": "5",
  "6ta_fuerza": "6",
};

export const MANO_DOMINANTE_LABELS: Record<ManoDominante, string> = {
  derecha: "Derecha",
  izquierda: "Izquierda",
  ambidiestro: "Ambidiestro",
};

export const EN_CANCHA_ORDER: EnCancha[] = ["reves", "drive"];

export const EN_CANCHA_LABELS: Record<EnCancha, string> = {
  reves: "Revés",
  drive: "Drive",
};

export const JUGADOR_NIVEL_LABELS: Record<RivieraJugadorNivel, string> = {
  iniciación: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  competición: "Competición",
  élite: "Élite",
};

export const JUGADOR_NIVEL_CLASS: Record<RivieraJugadorNivel, string> = {
  iniciación: "rj-nivel--iniciacion",
  intermedio: "rj-nivel--intermedio",
  avanzado: "rj-nivel--avanzado",
  competición: "rj-nivel--competicion",
  élite: "rj-nivel--elite",
};

export const TIPO_EVENTO_LABELS: Record<JugadorTipoEvento, string> = {
  reta: "Reta",
  torneo_express: "Torneo Express",
  liga: "Liga",
  americano: "Americano",
  duelo_2v2: "Duelo 2 vs 2",
};

export const RESULTADO_LABELS: Record<JugadorResultado, string> = {
  victoria: "Victoria",
  derrota: "Derrota",
  empate: "Empate",
  participación: "Participación",
};

export const RESULTADO_CLASS: Record<JugadorResultado, string> = {
  victoria: "rj-resultado--win",
  derrota: "rj-resultado--loss",
  empate: "rj-resultado--draw",
  participación: "rj-resultado--neutral",
};

export const AVATAR_BUCKET = "jugadores-avatars";
