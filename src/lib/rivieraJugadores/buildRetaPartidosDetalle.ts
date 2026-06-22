import type { Game, Match, Pair } from "../db/types";
import { isChampionshipRoundNumber } from "../roundRobinChampionship";
import { getMatchScoresForStandings } from "../standingsUtils";

export type RetaPartidoDetalleResultado = "win" | "loss" | "draw";

/** Snapshot inmutable por partido (historial público tras borrar la reta). */
export interface RetaPartidoDetalle {
  id?: string;
  ronda: number;
  rival: string;
  games_favor: number;
  games_contra: number;
  resultado: RetaPartidoDetalleResultado;
  fecha: string;
}

function pairDisplayLabel(pair: Pair): string {
  const n1 = pair.player1_name?.trim() || "?";
  const n2 = pair.player2_name?.trim() || "?";
  return `${n1} / ${n2}`;
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

function resultadoFromScores(
  favor: number,
  contra: number
): RetaPartidoDetalleResultado {
  if (favor > contra) return "win";
  if (contra > favor) return "loss";
  return "draw";
}

/** Partidos de una pareja, ordenados por ronda y fecha. */
export function buildPartidosDetalleForPair(
  pairId: string,
  matches: Match[],
  gamesByMatchId: Map<string, Game[]>,
  pairById: Map<string, Pair>
): RetaPartidoDetalle[] {
  const entries: RetaPartidoDetalle[] = [];

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

    entries.push({
      id: match.id,
      ronda: match.round ?? 1,
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
  gamesByMatchId: Map<string, Game[]>
): Map<string, RetaPartidoDetalle[]> {
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const byPlayer = new Map<string, RetaPartidoDetalle[]>();

  for (const pair of pairs) {
    const detalle = buildPartidosDetalleForPair(
      pair.id,
      matches,
      gamesByMatchId,
      pairById
    );
    if (pair.player1_id) byPlayer.set(pair.player1_id, detalle);
    if (pair.player2_id) byPlayer.set(pair.player2_id, detalle);
  }

  return byPlayer;
}

export async function loadGamesByMatchId(
  finishedMatches: Match[],
  getGames: (matchId: string) => Promise<Game[]>
): Promise<{ gamesByMatchId: Map<string, Game[]>; allGames: Game[] }> {
  const gamesByMatchId = new Map<string, Game[]>();
  const allGames: Game[] = [];

  for (const m of finishedMatches) {
    try {
      const g = await getGames(m.id);
      gamesByMatchId.set(m.id, g);
      allGames.push(...g);
    } catch {
      gamesByMatchId.set(m.id, []);
    }
  }

  return { gamesByMatchId, allGames };
}

/** Etiqueta de ronda para historial público (riviera-open-web). */
export function labelRetaRonda(
  ronda: number,
  regularRoundsMax?: number | null
): string {
  if (regularRoundsMax != null && regularRoundsMax > 0 && ronda > regularRoundsMax) {
    const playoffIdx = ronda - regularRoundsMax;
    if (playoffIdx === 1) return "Semifinal";
    return "Final";
  }
  return `Ronda ${ronda}`;
}

/** Indica si el partido pertenece a remontada (solo uso interno / futuro). */
export function isRemontadaMatch(match: Match): boolean {
  return (
    match.match_type === "championship" ||
    isChampionshipRoundNumber(match.round)
  );
}
