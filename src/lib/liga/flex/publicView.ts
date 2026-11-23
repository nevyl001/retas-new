import { rankFlexSeason, type FlexAward } from "./season";

export type FlexPublicJornadaKey =
  | "por_programar"
  | "programada"
  | "en_curso"
  | "finalizada";

/** Estado visible. Una jornada solo está finalizada si el backend la cerró. */
export function flexPublicJornadaEstado(input: {
  estado: string;
  fecha: string | null;
  confirmada: boolean;
  enJuego?: boolean;
}): { key: FlexPublicJornadaKey; label: string } {
  if (input.estado === "completed") {
    return { key: "finalizada", label: "Finalizada" };
  }
  if (input.estado === "in_progress" || input.enJuego) {
    return { key: "en_curso", label: "En curso" };
  }
  if (input.fecha || input.confirmada) {
    return { key: "programada", label: "Programada" };
  }
  return { key: "por_programar", label: "Por programar" };
}

/**
 * Variación contra la jornada cerrada anterior.
 * Positivo = subió lugares. Null = no hay comparación oficial.
 */
export function flexPublicMovement(
  awards: readonly FlexAward[],
  completedNumeros: readonly number[]
): Map<string, number | null> {
  const done = uniqueSorted(completedNumeros);
  const map = new Map<string, number | null>();
  if (done.length === 0) return map;
  const latest = done[done.length - 1]!;
  const current = rankFlexSeason({
    awards: awards.filter((award) => award.jornadaNumero <= latest),
  });
  if (!current.ok) {
    for (const id of playerIds(awards)) map.set(id, null);
    return map;
  }
  const previousNumero = done.length > 1 ? done[done.length - 2]! : null;
  const before = previousNumero
    ? rankFlexSeason({
        awards: awards.filter((award) => award.jornadaNumero <= previousNumero),
      })
    : null;
  for (const row of current.rows) {
    if (!before?.ok) {
      map.set(row.jugadorId, null);
      continue;
    }
    const prev = before.rows.find((item) => item.jugadorId === row.jugadorId);
    map.set(row.jugadorId, prev ? prev.posicion - row.posicion : null);
  }
  return map;
}

export type FlexPointsPoint = {
  jornadaNumero: number;
  acumulado: number;
  posicion: number | null;
};

/** Puntos acumulados solo con jornadas cerradas. Una ausencia no suma un punto inventado. */
export function flexPointsSeries(
  awards: readonly FlexAward[],
  jugadorId: string,
  completedNumeros: readonly number[]
): FlexPointsPoint[] {
  const series: FlexPointsPoint[] = [];
  let acumulado = 0;
  for (const numero of uniqueSorted(completedNumeros)) {
    const award = awards.find(
      (row) => row.jugadorId === jugadorId && row.jornadaNumero === numero
    );
    if (!award) continue;
    acumulado += award.puntos;
    const season = rankFlexSeason({
      awards: awards.filter((row) => row.jornadaNumero <= numero),
    });
    series.push({
      jornadaNumero: numero,
      acumulado,
      posicion: season.ok
        ? season.rows.find((row) => row.jugadorId === jugadorId)?.posicion ?? null
        : null,
    });
  }
  return series;
}

/** Primera ronda que todavía no tiene todos los marcadores. Si ya están, la última. */
export function flexFocusRound(
  partidos: readonly { ronda: number; scoreA: number | null; scoreB: number | null }[]
): number | null {
  if (partidos.length === 0) return null;
  const rounds = uniqueSorted(partidos.map((partido) => partido.ronda));
  const open = rounds.find((ronda) =>
    partidos
      .filter((partido) => partido.ronda === ronda)
      .some((partido) => partido.scoreA == null || partido.scoreB == null)
  );
  return open ?? rounds[rounds.length - 1] ?? null;
}

function uniqueSorted(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort(
    (a, b) => a - b
  );
}

function playerIds(awards: readonly FlexAward[]): string[] {
  return Array.from(new Set(awards.map((award) => award.jugadorId)));
}
