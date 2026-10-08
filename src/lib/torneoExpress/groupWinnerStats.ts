/**
 * Las siete estadísticas oficiales de la pareja ganadora de un grupo.
 *
 * Fuente única para la card pública y para la imagen PNG de compartir: ambas
 * muestran los mismos valores, en el mismo orden y con las mismas siglas.
 * Solo formatea campos que ya existen en la clasificación (`StandingRowExpress`);
 * no calcula ni reordena nada.
 */

export type GroupWinnerOfficialStatId =
  | "pj"
  | "pg"
  | "pp"
  | "pts"
  | "gf"
  | "gc"
  | "dif";

export type GroupWinnerOfficialStat = {
  id: GroupWinnerOfficialStatId;
  /** Sigla visible (PJ, PG, PP, PTS, GF, GC, DIF). */
  label: string;
  /** Nombre completo, para lectores de pantalla. */
  name: string;
  /** Valor ya formateado (la diferencia lleva signo). */
  value: string;
  /** PTS es el número principal de la pieza. */
  primary?: boolean;
  /** Diferencia de games positiva: se resalta con el acento del club. */
  highlight?: boolean;
};

export type GroupWinnerOfficialStatsInput = {
  pj: number;
  pg: number;
  pp: number;
  puntos: number;
  /** Games a favor. */
  ptsFav: number;
  /** Games en contra. */
  ptsCon: number;
  /** Diferencia de games (a favor − en contra). */
  dif: number;
};

/** Cuántos indicadores van en cada fila: cuatro arriba y tres abajo. */
export const GROUP_WINNER_STATS_ROW_SIZES = [4, 3] as const;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function groupWinnerOfficialStats(
  row: GroupWinnerOfficialStatsInput
): GroupWinnerOfficialStat[] {
  return [
    { id: "pj", label: "PJ", name: "Partidos jugados", value: String(row.pj) },
    { id: "pg", label: "PG", name: "Partidos ganados", value: String(row.pg) },
    { id: "pp", label: "PP", name: "Partidos perdidos", value: String(row.pp) },
    {
      id: "pts",
      label: "PTS",
      name: "Puntos",
      value: String(row.puntos),
      primary: true,
    },
    { id: "gf", label: "GF", name: "Games a favor", value: String(row.ptsFav) },
    { id: "gc", label: "GC", name: "Games en contra", value: String(row.ptsCon) },
    {
      id: "dif",
      label: "DIF",
      name: "Diferencia de games",
      value: signed(row.dif),
      highlight: row.dif > 0,
    },
  ];
}

/** Las siete estadísticas repartidas en filas de 4 y 3. */
export function groupWinnerOfficialStatRows(
  row: GroupWinnerOfficialStatsInput
): GroupWinnerOfficialStat[][] {
  const stats = groupWinnerOfficialStats(row);
  const rows: GroupWinnerOfficialStat[][] = [];
  let cursor = 0;
  for (const size of GROUP_WINNER_STATS_ROW_SIZES) {
    rows.push(stats.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}
