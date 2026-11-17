/** Riviera Flex League — reglas de producto. Los games ordenan la jornada; estos puntos son la liga. */

export const FLEX_LEAGUE_MODALIDAD = "flex_league" as const;

export const FLEX_DEFAULT_JORNADAS = 12;
export const FLEX_MIN_PLAYERS = 12;
export const FLEX_MAX_PLAYERS = 16;
export const FLEX_DEFAULT_ROUNDS = 5;
export const FLEX_DEFAULT_ROUND_MINUTES = 20;
export const FLEX_DEFAULT_REST_MINUTES = 3;
export const FLEX_DEFAULT_COURTS = 3;
/** Rotación acotada: compañeros distintos dentro de las rondas pedidas, sin todos contra todos. */
export const FLEX_ALGORITHM_VERSION = "flex-rotacion-v2";
export const FLEX_MAX_ROUNDS = 24;
export const FLEX_MAX_SEASON_JORNADAS = 48;

export const FLEX_DEFAULT_CATEGORIA = "6ª alta / 5ª baja";
export const FLEX_DEFAULT_HORARIO = "Martes y jueves, 19:00–21:00";
export const FLEX_DEFAULT_INSCRIPCION_MXN = 200;
export const FLEX_DEFAULT_JORNADA_MXN = 300;
export const FLEX_DEFAULT_PREMIO_CAMPEON = "$3,000 MXN";
export const FLEX_DEFAULT_PREMIO_SUBCAMPEON = "2 clases gratuitas";
export const FLEX_DEFAULT_PREMIO_TERCER = "Kit Riviera Open";

/** Posición 1 → índice 0. Un primer lugar vale 100 aunque la jornada tenga 12 o 16 jugadores. */
export const FLEX_POSITION_POINTS = [
  100, 90, 80, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10,
] as const;

export function flexPointsForPosition(posicion: number): number {
  if (!Number.isInteger(posicion) || posicion < 1 || posicion > FLEX_POSITION_POINTS.length) {
    throw new Error(`Posición de Flex League fuera de tabla: ${posicion}`);
  }
  return FLEX_POSITION_POINTS[posicion - 1]!;
}
