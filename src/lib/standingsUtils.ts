import type { Match, Game, Pair } from "./database";

export interface TeamConfig {
  teamNames: string[];
  pairToTeam: Record<string, number>;
}

export interface PairWithStats extends Pair {
  gamesWon: number;
  setsWon: number;
  points: number;
  matchesPlayed: number;
}

function calculateMatchStats(match: Match, games: Game[]) {
  let pair1GamesWon = 0;
  let pair2GamesWon = 0;
  let pair1SetsWon = 0;
  let pair2SetsWon = 0;
  let pair1TotalPoints = 0;
  let pair2TotalPoints = 0;

  games.forEach((game) => {
    if (game.is_tie_break) {
      if (game.tie_break_pair1_points > game.tie_break_pair2_points) pair1GamesWon++;
      else if (game.tie_break_pair2_points > game.tie_break_pair1_points) pair2GamesWon++;
      pair1TotalPoints += game.tie_break_pair1_points || 0;
      pair2TotalPoints += game.tie_break_pair2_points || 0;
    } else {
      if (game.pair1_games > game.pair2_games) pair1GamesWon++;
      else if (game.pair2_games > game.pair1_games) pair2GamesWon++;
      pair1TotalPoints += game.pair1_games;
      pair2TotalPoints += game.pair2_games;
      if (game.pair1_games >= 6) pair1SetsWon++;
      if (game.pair2_games >= 6) pair2SetsWon++;
    }
  });

  return {
    pair1GamesWon,
    pair2GamesWon,
    pair1SetsWon,
    pair2SetsWon,
    pair1TotalPoints,
    pair2TotalPoints,
  };
}

/** Calcula estadísticas por pareja a partir de partidos y juegos. */
export function computePairsWithStats(
  pairs: Pair[],
  matches: Match[],
  allGames: Game[]
): PairWithStats[] {
  if (!pairs.length) return [];
  const pairStats = new Map<string, { gamesWon: number; setsWon: number; points: number; matchesPlayed: number }>();
  pairs.forEach((p) => pairStats.set(p.id, { gamesWon: 0, setsWon: 0, points: 0, matchesPlayed: 0 }));

  matches.forEach((match) => {
    if (match.status !== "finished") return;
    const matchGames = allGames.filter((g) => g.match_id === match.id);
    const s1 = pairStats.get(match.pair1_id);
    const s2 = pairStats.get(match.pair2_id);
    if (!s1 || !s2) return;
    s1.matchesPlayed += 1;
    s2.matchesPlayed += 1;
    if (matchGames.length > 0) {
      const st = calculateMatchStats(match, matchGames);
      s1.gamesWon += st.pair1GamesWon;
      s1.setsWon += st.pair1SetsWon;
      s1.points += st.pair1TotalPoints;
      s2.gamesWon += st.pair2GamesWon;
      s2.setsWon += st.pair2SetsWon;
      s2.points += st.pair2TotalPoints;
    } else {
      const p1 = match.pair1_score ?? 0;
      const p2 = match.pair2_score ?? 0;
      s1.points += p1;
      s2.points += p2;
      if (p1 > p2) s1.setsWon += 1;
      else if (p2 > p1) s2.setsWon += 1;
    }
  });

  return pairs.map((pair) => {
    const stats = pairStats.get(pair.id) ?? { gamesWon: 0, setsWon: 0, points: 0, matchesPlayed: 0 };
    return { ...pair, ...stats };
  });
}

export interface TeamStandingRow {
  teamIndex: number;
  name: string;
  points: number;
  setsWon: number;
  matchesPlayed: number;
}

/** Clasificación por equipos (ordenada por puntos, primero = ganador). */
export function computeTeamStandings(
  pairsWithStats: PairWithStats[],
  teamConfig: TeamConfig
): TeamStandingRow[] | null {
  if (!teamConfig?.teamNames?.length || !teamConfig.pairToTeam || Object.keys(teamConfig.pairToTeam).length === 0) return null;
  const n = teamConfig.teamNames.length;
  const totals: Array<{ points: number; setsWon: number; matchesPlayed: number }> = Array.from(
    { length: n },
    () => ({ points: 0, setsWon: 0, matchesPlayed: 0 })
  );
  pairsWithStats.forEach((pair) => {
    const t = teamConfig.pairToTeam[pair.id];
    if (t >= 0 && t < n) {
      totals[t].points += pair.points;
      totals[t].setsWon += pair.setsWon;
      totals[t].matchesPlayed += pair.matchesPlayed;
    }
  });
  return totals
    .map((tot, teamIndex) => ({
      teamIndex,
      name: teamConfig.teamNames[teamIndex] ?? `Equipo ${teamIndex + 1}`,
      points: tot.points,
      setsWon: tot.setsWon,
      matchesPlayed: tot.matchesPlayed,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
      return b.matchesPlayed - a.matchesPlayed;
    });
}

const TEAM_CONFIG_KEY = "retapadel_teams_";

/** Lee la config de equipos desde localStorage (fallback si la BD no la tiene). */
export function getTeamConfigFromStorage(tournamentId: string): TeamConfig | null {
  try {
    const raw = localStorage.getItem(`${TEAM_CONFIG_KEY}${tournamentId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.teamNames?.length && data?.pairToTeam && typeof data.pairToTeam === "object") return data;
    return null;
  } catch {
    return null;
  }
}
