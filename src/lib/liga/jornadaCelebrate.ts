import type { PublicEliminatoriaPodiumStats } from "../torneoExpress/publicEliminatoriaPodiumStats";
import type { ParejaJornadaStat } from "./jornadaStats";
import {
  findLigaGranFinalPartido,
  isLigaThirdPlacePartido,
  jornadaHasLigaGranFinal,
  ligaGranFinalSubtitle,
  ligaTemporadaLabelFromNombre,
} from "./ligaGranFinalPublic";
import {
  computePlayoffsMatchPoints,
  derivePlayoffsGamesTotals,
  parsePlayoffsSetScoresJson,
} from "./parejasFijasPlayoffsMatchScore";
import {
  resolveParejasFijasPartidoTotals,
  type LigaPartidoSetScores,
} from "./parejasFijasMatchScore";
import { formatPartidoCanchaHorarioLabel } from "./programacion";
import { formatPartidoPublicScore, partidoMatchWinnerSide } from "./publicDisplay";
import type { LigaEquipo, LigaJornada, LigaJornadaPareja, LigaPartido } from "./types";

export type LigaCelebratePlacement =
  | "campeones"
  | "subcampeones"
  | "tercer";

export type LigaCelebrateCopy = {
  badge: string;
  title: string;
  message: string;
  rank: string;
};

/** Stats de temporada con PTS de clasificación cuando están disponibles. */
export type LigaSeasonHonoresStats = PublicEliminatoriaPodiumStats & {
  puntos: number | null;
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
    | "puntos"
  > | null | undefined
): LigaSeasonHonoresStats | null {
  if (!equipo) return null;
  const puntos =
    equipo.puntos != null && Number.isFinite(Number(equipo.puntos))
      ? Number(equipo.puntos)
      : null;
  return {
    victorias: equipo.partidos_ganados,
    derrotas: equipo.partidos_perdidos,
    partidos: equipo.partidos_jugados,
    juegosFavor: equipo.games_favor,
    juegosContra: equipo.games_contra,
    dif: equipo.diferencia_games,
    puntos,
  };
}

function samePairPlayers(
  a1: string,
  a2: string,
  b1: string,
  b2: string
): boolean {
  return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
}

/** Resuelve el equipo de liga desde una pareja de jornada (no usar pareja.id === equipo.id). */
export function resolveLigaEquipoForJornadaPareja(
  parejaId: string,
  jornada: LigaJornada | undefined,
  equipos: readonly LigaEquipo[]
): LigaEquipo | null {
  const pareja = jornada?.parejas?.find((p) => p.id === parejaId);
  if (!pareja) return null;
  if (pareja.equipo_id) {
    const byId = equipos.find((e) => e.id === pareja.equipo_id);
    if (byId) return byId;
  }
  return (
    equipos.find((e) =>
      samePairPlayers(
        e.jugador1_id,
        e.jugador2_id,
        pareja.jugador1_id,
        pareja.jugador2_id
      )
    ) ?? null
  );
}

function collectTeamParejaIds(
  seed: LigaJornadaPareja,
  equipo: LigaEquipo | null,
  jornadas: readonly LigaJornada[]
): Set<string> {
  const ids = new Set<string>([seed.id]);
  for (const j of jornadas) {
    for (const p of j.parejas ?? []) {
      if (equipo?.id && p.equipo_id === equipo.id) {
        ids.add(p.id);
        continue;
      }
      if (
        samePairPlayers(
          seed.jugador1_id,
          seed.jugador2_id,
          p.jugador1_id,
          p.jugador2_id
        )
      ) {
        ids.add(p.id);
      }
    }
  }
  return ids;
}

function accumulatePartidoForTeam(
  partido: LigaPartido,
  teamParejaIds: Set<string>
): {
  won: boolean;
  gamesFavor: number;
  gamesContra: number;
} | null {
  const isP1 = teamParejaIds.has(partido.pareja1_id);
  const isP2 = teamParejaIds.has(partido.pareja2_id);
  if (!isP1 && !isP2) return null;

  const playoffsPayload = parsePlayoffsSetScoresJson(partido.set_scores);
  if (
    playoffsPayload &&
    partido.score_pareja1 != null &&
    partido.score_pareja2 != null
  ) {
    const derived = derivePlayoffsGamesTotals(
      playoffsPayload,
      Number(partido.score_pareja1),
      Number(partido.score_pareja2)
    );
    if ("error" in derived) return null;
    const computed = computePlayoffsMatchPoints(
      derived.gamesTotalP1,
      derived.gamesTotalP2,
      playoffsPayload
    );
    if (!computed.ok) return null;
    return isP1
      ? {
          won: computed.result.p1Won,
          gamesFavor: derived.gamesTotalP1,
          gamesContra: derived.gamesTotalP2,
        }
      : {
          won: !computed.result.p1Won,
          gamesFavor: derived.gamesTotalP2,
          gamesContra: derived.gamesTotalP1,
        };
  }

  const totals = resolveParejasFijasPartidoTotals({
    score_pareja1: partido.score_pareja1,
    score_pareja2: partido.score_pareja2,
    set_scores:
      partido.set_scores &&
      typeof partido.set_scores === "object" &&
      "sets" in partido.set_scores
        ? (partido.set_scores as LigaPartidoSetScores)
        : null,
  });
  if (totals) {
    return isP1
      ? {
          won: totals.p1WonMatch,
          gamesFavor: totals.gamesP1,
          gamesContra: totals.gamesP2,
        }
      : {
          won: !totals.p1WonMatch,
          gamesFavor: totals.gamesP2,
          gamesContra: totals.gamesP1,
        };
  }

  const s1 = Number(partido.score_pareja1 ?? 0);
  const s2 = Number(partido.score_pareja2 ?? 0);
  if (s1 === s2) return null;
  return isP1
    ? { won: s1 > s2, gamesFavor: s1, gamesContra: s2 }
    : { won: s2 > s1, gamesFavor: s2, gamesContra: s1 };
}

/**
 * Resumen de toda la temporada para una pareja de jornada:
 * acumula partidos de todas las jornadas (por equipo_id o mismos jugadores).
 * Si no hay partidos agregables, cae al snapshot de liga_equipos.
 */
export function statsParejaLigaSeason(args: {
  parejaId: string;
  jornadaActual: LigaJornada | undefined;
  jornadas: readonly LigaJornada[];
  equipos: readonly LigaEquipo[];
}): LigaSeasonHonoresStats | null {
  const seed = args.jornadaActual?.parejas?.find((p) => p.id === args.parejaId);
  if (!seed) {
    const equipoOnly = args.equipos.find((e) => e.id === args.parejaId);
    return statsParejaLigaEquipo(equipoOnly);
  }

  const equipo = resolveLigaEquipoForJornadaPareja(
    args.parejaId,
    args.jornadaActual,
    args.equipos
  );
  const teamParejaIds = collectTeamParejaIds(seed, equipo, args.jornadas);
  const puntos =
    equipo?.puntos != null && Number.isFinite(Number(equipo.puntos))
      ? Number(equipo.puntos)
      : null;

  let victorias = 0;
  let derrotas = 0;
  let juegosFavor = 0;
  let juegosContra = 0;

  for (const j of args.jornadas) {
    for (const partido of j.partidos ?? []) {
      if (partido.estado !== "completed") continue;
      const row = accumulatePartidoForTeam(partido, teamParejaIds);
      if (!row) continue;
      juegosFavor += row.gamesFavor;
      juegosContra += row.gamesContra;
      if (row.won) victorias += 1;
      else derrotas += 1;
    }
  }

  const partidos = victorias + derrotas;
  if (partidos > 0) {
    return {
      victorias,
      derrotas,
      partidos,
      juegosFavor,
      juegosContra,
      dif: juegosFavor - juegosContra,
      puntos,
    };
  }

  return statsParejaLigaEquipo(equipo);
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

/**
 * Honores de temporada: solo cuando la Gran Final ya tiene resultado oficial.
 * No exige que THIRD ni el resto de la jornada estén cerrados.
 */
export function shouldShowLigaTemporadaHonores(args: {
  esParejasFijas: boolean;
  partidos: readonly LigaPartido[] | null | undefined;
}): boolean {
  if (!args.esParejasFijas) return false;
  const gf = findLigaGranFinalPartido(args.partidos);
  return Boolean(gf && gf.estado === "completed");
}

export type ThirdPlaceCelebrateResolution =
  | { status: "pending" }
  | { status: "resolved"; tercerId: string };

/**
 * Tercer lugar solo desde el partido THIRD completed.
 * Pending si el slot existe y aún no hay ganador; no inventa pareja.
 */
export function resolveThirdPlaceCelebrateSide(
  partidos: readonly LigaPartido[] | null | undefined,
  esParejasFijas: boolean
): ThirdPlaceCelebrateResolution {
  const third =
    partidos?.find(isLigaThirdPlacePartido) ??
    partidos?.find(
      (p) => (p.bracket_slot ?? "").trim().toUpperCase() === "THIRD"
    ) ??
    null;
  if (!third) return { status: "pending" };
  if (third.estado !== "completed") return { status: "pending" };
  const winner = partidoMatchWinnerSide(third, esParejasFijas);
  if (winner !== 1 && winner !== 2) return { status: "pending" };
  const id = winner === 1 ? third.pareja1_id : third.pareja2_id;
  if (!id) return { status: "pending" };
  return { status: "resolved", tercerId: id };
}

export function buildLigaCampeonatoCelebrateHeadline(
  ligaNombre: string,
  placement: LigaCelebratePlacement
): string {
  const titulo = ligaGranFinalSubtitle(ligaNombre.trim()) || ligaNombre.trim() || "Liga";
  if (placement === "campeones") return `Campeones · ${titulo}`;
  if (placement === "subcampeones") return `Subcampeones · ${titulo}`;
  return `Tercer lugar · ${titulo}`;
}

export function buildLigaCampeonatoCelebrateCopy(
  ligaNombre: string,
  placement: LigaCelebratePlacement
): LigaCelebrateCopy {
  const temporada = ligaTemporadaLabelFromNombre(ligaNombre);
  if (placement === "tercer") {
    return {
      badge: "TERCER LUGAR",
      title: "¡Felicidades!",
      message:
        "Un podio ganado con carácter. Gracias por una temporada de gran competencia.",
      rank: temporada
        ? `3.er lugar · ${temporada} · Resumen de toda la liga`
        : "3.er lugar · Resumen de toda la liga",
    };
  }
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
    title:
      placement === "campeones"
        ? "¡Felicidades, campeones!"
        : "¡Felicidades, subcampeones!",
    message:
      placement === "campeones"
        ? "Su entrega, constancia y talento los llevaron a lo más alto. ¡Enhorabuena por una gran temporada!"
        : "Una final de altura. El esfuerzo de toda la temporada los llevó hasta la Gran Final.",
    rank,
  };
}

export function buildLigaTemporadaHonoresIntro(ligaNombre: string): {
  title: string;
  subtitle: string;
  lead: string;
} {
  const sub = ligaGranFinalSubtitle(ligaNombre.trim()) || ligaNombre.trim() || "Liga";
  return {
    title: "Honores de la temporada",
    subtitle: sub,
    lead: "Una temporada de competencia, esfuerzo y grandes momentos. Celebramos a quienes dejaron todo en la cancha.",
  };
}
