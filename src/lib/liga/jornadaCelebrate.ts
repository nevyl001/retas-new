import type { PublicEliminatoriaPodiumStats } from "../torneoExpress/publicEliminatoriaPodiumStats";
import type { ParejaJornadaStat } from "./jornadaStats";
import {
  findLigaGranFinalPartido,
  jornadaHasLigaGranFinal,
  ligaGranFinalSubtitle,
  ligaTemporadaLabelFromNombre,
} from "./ligaGranFinalPublic";
import { formatPartidoCanchaHorarioLabel } from "./programacion";
import { formatPartidoPublicScore, partidoMatchWinnerSide } from "./publicDisplay";
import type { LigaEquipo, LigaJornada, LigaPartido } from "./types";

export type LigaCelebratePlacement = "campeones" | "subcampeones";

export type LigaCelebrateCopy = {
  badge: string;
  title: string;
  message: string;
  rank: string;
};

export function findPartidoGanadoPareja(
  parejaId: string,
  jornada: LigaJornada | undefined
): LigaPartido | null {
  for (const partido of jornada?.partidos ?? []) {
    if (partido.estado !== "completed") continue;
    const winner = partidoMatchWinnerSide(partido, true);
    if (winner === 1 && partido.pareja1_id === parejaId) return partido;
    if (winner === 2 && partido.pareja2_id === parejaId) return partido;
  }
  return null;
}

export function buildVictoriaRankLabel(
  partido: LigaPartido | null,
  fechaJornada: string | null | undefined
): string | undefined {
  if (!partido) return undefined;
  const cancha = formatPartidoCanchaHorarioLabel(
    partido.cancha,
    partido.hora_inicio,
    fechaJornada
  );
  const score = formatPartidoPublicScore(partido, true);
  if (cancha && score) return `${cancha} · ${score}`;
  return score ?? cancha ?? undefined;
}

export function statsParejaJornadaVictoria(
  parejaId: string,
  jornada: LigaJornada | undefined,
  row: ParejaJornadaStat
): PublicEliminatoriaPodiumStats {
  let juegosFavor = 0;
  let juegosContra = 0;

  for (const partido of jornada?.partidos ?? []) {
    if (partido.estado !== "completed") continue;
    const isP1 = partido.pareja1_id === parejaId;
    const isP2 = partido.pareja2_id === parejaId;
    if (!isP1 && !isP2) continue;

    juegosFavor += isP1
      ? Number(partido.score_pareja1 ?? 0)
      : Number(partido.score_pareja2 ?? 0);
    juegosContra += isP1
      ? Number(partido.score_pareja2 ?? 0)
      : Number(partido.score_pareja1 ?? 0);
  }

  const partidos = row.victorias + row.derrotas + row.empates;

  return {
    victorias: row.victorias,
    derrotas: row.derrotas,
    partidos,
    juegosFavor,
    juegosContra,
    dif: juegosFavor - juegosContra,
  };
}

/** Resumen acumulado de toda la liga (ranking de equipos). */
export function statsParejaLigaEquipo(
  equipo: Pick<
    LigaEquipo,
    | "partidos_jugados"
    | "partidos_ganados"
    | "partidos_perdidos"
    | "games_favor"
    | "games_contra"
    | "diferencia_games"
  > | null | undefined
): PublicEliminatoriaPodiumStats | null {
  if (!equipo) return null;
  return {
    victorias: equipo.partidos_ganados,
    derrotas: equipo.partidos_perdidos,
    partidos: equipo.partidos_jugados,
    juegosFavor: equipo.games_favor,
    juegosContra: equipo.games_contra,
    dif: equipo.diferencia_games,
  };
}

/**
 * Felicidades de campeonato: Gran Final detectada, o última jornada de
 * parejas fijas (playoffs / cierre de temporada).
 */
export function shouldCelebrateLigaCampeonato(args: {
  esParejasFijas: boolean;
  partidos: readonly LigaPartido[] | null | undefined;
  jornadaNumero: number;
  jornadas: ReadonlyArray<{ numero: number }>;
}): boolean {
  if (!args.esParejasFijas) return false;
  if (jornadaHasLigaGranFinal(args.partidos)) return true;
  if (!args.jornadas.length) return false;
  const maxNumero = Math.max(...args.jornadas.map((j) => j.numero));
  return args.jornadaNumero === maxNumero && maxNumero > 0;
}

export function resolveGranFinalCelebrateSides(
  partidos: readonly LigaPartido[] | null | undefined,
  esParejasFijas: boolean
): { campeonId: string; subcampeonId: string } | null {
  const gf = findLigaGranFinalPartido(partidos);
  if (!gf || gf.estado !== "completed") return null;
  const winner = partidoMatchWinnerSide(gf, esParejasFijas);
  if (winner !== 1 && winner !== 2) return null;
  if (!gf.pareja1_id || !gf.pareja2_id) return null;
  return winner === 1
    ? { campeonId: gf.pareja1_id, subcampeonId: gf.pareja2_id }
    : { campeonId: gf.pareja2_id, subcampeonId: gf.pareja1_id };
}

export function buildLigaCampeonatoCelebrateHeadline(
  ligaNombre: string,
  placement: LigaCelebratePlacement
): string {
  const titulo = ligaGranFinalSubtitle(ligaNombre.trim()) || ligaNombre.trim() || "Liga";
  return placement === "campeones"
    ? `Campeones · ${titulo}`
    : `Subcampeones · ${titulo}`;
}

export function buildLigaCampeonatoCelebrateCopy(
  ligaNombre: string,
  placement: LigaCelebratePlacement
): LigaCelebrateCopy {
  const temporada = ligaTemporadaLabelFromNombre(ligaNombre);
  const rank =
    placement === "campeones"
      ? temporada
        ? `1.er lugar · ${temporada} · Resumen de toda la liga`
        : "1.er lugar · Resumen de toda la liga"
      : temporada
        ? `2.º lugar · ${temporada} · Resumen de toda la liga`
        : "2.º lugar · Resumen de toda la liga";
  return {
    badge: placement === "campeones" ? "CAMPEONES" : "SUBCAMPEONES",
    title: "¡Felicidades!",
    message: "",
    rank,
  };
}
