import type { Game, Match, Pair } from "../db/types";
import {
  isChampionshipFinalMatch,
  isChampionshipRoundNumber,
  isChampionshipThirdPlaceMatch,
} from "../roundRobinChampionship";
import { getMatchScoresForStandings } from "../standingsUtils";
import {
  formatRivalPair,
  labelRetaRonda,
  resultadoFromScores,
  type PartidoDetalle,
  type PartidoDetalleResultado,
} from "../shared/buildPartidosDetalle";

export type { PartidoDetalle, PartidoDetalleResultado };
/** @deprecated Use PartidoDetalle */
export type RetaPartidoDetalle = PartidoDetalle;

export { labelRetaRonda } from "../shared/buildPartidosDetalle";
export { loadGamesByMatchId } from "./buildRetaPartidosDetalleHelpers";

function pairDisplayLabel(pair: Pair): string {
  return formatRivalPair(pair.player1_name, pair.player2_name);
}

function rivalLabel(
  match: Match,
  opponentId: string,
  pairById: Map<string, Pair>
): string {
  const opponent = pairById.get(opponentId);
  if (opponent) return pairDisplayLabel(opponent);
  const raw = match.pair1_id === opponentId ? match.pair1_name : match.pair2_name;
  if (raw?.includes("/")) {
    return raw.replace(/\s*\/\s*/g, " / ");
  }
  return raw?.trim() || "Rival";
}

function resolveRetaMatchFase(
  match: Match,
  allMatches: Match[],
  allGames: Game[],
  regularRoundsMax?: number | null
): string {
  const ronda = match.round ?? 1;
  if (
    regularRoundsMax != null &&
    regularRoundsMax > 0 &&
    ronda > regularRoundsMax
  ) {
    const semiRound = regularRoundsMax + 1;
    const semiMatches = allMatches.filter(
      (m) => m.status === "finished" && (m.round ?? 0) === semiRound
    );
    if (semiMatches.length >= 2) {
      if (isChampionshipThirdPlaceMatch(match, semiMatches, allGames)) {
        return "3er lugar";
      }
      if (isChampionshipFinalMatch(match, semiMatches, allGames)) {
        return "Final";
      }
    }
    const playoffIdx = ronda - regularRoundsMax;
    if (playoffIdx === 1) return "Semifinal";
    return "Final";
  }
  return labelRetaRonda(ronda, regularRoundsMax);
}

/** Partidos de una pareja, ordenados por ronda y fecha. */
export function buildPartidosDetalleForPair(
  pairId: string,
  matches: Match[],
  gamesByMatchId: Map<string, Game[]>,
  pairById: Map<string, Pair>,
  regularRoundsMax?: number | null,
  allGamesFlat?: Game[]
): PartidoDetalle[] {
  const entries: PartidoDetalle[] = [];
  const allGames = allGamesFlat ?? Array.from(gamesByMatchId.values()).flat();

  const pairMatches = matches
    .filter(
      (m) =>
        m.status === "finished" &&
        (m.pair1_id === pairId || m.pair2_id === pairId)
    )
    .sort((a, b) => {
      const ra = a.round ?? 0;
      const rb = b.round ?? 0;
      if (ra !== rb) return ra - rb;
      return a.created_at.localeCompare(b.created_at);
    });

  for (const match of pairMatches) {
    const isPair1 = match.pair1_id === pairId;
    const opponentId = isPair1 ? match.pair2_id : match.pair1_id;
    const games = gamesByMatchId.get(match.id) ?? [];
    const { score1, score2 } = getMatchScoresForStandings(match, games);
    if (score1 === 0 && score2 === 0) continue;

    const favor = isPair1 ? score1 : score2;
    const contra = isPair1 ? score2 : score1;
    const ronda = match.round ?? 1;

    entries.push({
      id: match.id,
      ronda,
      fase: resolveRetaMatchFase(match, matches, allGames, regularRoundsMax),
      rival: rivalLabel(match, opponentId, pairById),
      games_favor: favor,
      games_contra: contra,
      resultado: resultadoFromScores(favor, contra),
      fecha: match.created_at,
    });
  }

  return entries;
}

/** Mapa legacy player_id → partidos de su pareja en la reta. */
export function buildPartidosDetalleByLegacyPlayerId(
  pairs: Pair[],
  matches: Match[],
  gamesByMatchId: Map<string, Game[]>,
  regularRoundsMax?: number | null
): Map<string, PartidoDetalle[]> {
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const allGames = Array.from(gamesByMatchId.values()).flat();
  const byPlayer = new Map<string, PartidoDetalle[]>();

  for (const pair of pairs) {
    const detalle = buildPartidosDetalleForPair(
      pair.id,
      matches,
      gamesByMatchId,
      pairById,
      regularRoundsMax,
      allGames
    );
    if (pair.player1_id) byPlayer.set(pair.player1_id, detalle);
    if (pair.player2_id) byPlayer.set(pair.player2_id, detalle);
  }

  return byPlayer;
}

/** Indica si el partido pertenece a remontada (solo uso interno / futuro). */
export function isRemontadaMatch(match: Match): boolean {
  return (
    match.match_type === "championship" ||
    isChampionshipRoundNumber(match.round)
  );
}
