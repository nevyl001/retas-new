import type { Match, Game, Pair } from "./database";
import type { Tournament, TournamentTeamConfig } from "./db/types";
import { computeStandingDif } from "../utils/standingsDisplay";
import {
  applyMatchToStandingStats,
  createEmptyStandingStats,
  sortStandingsEntities,
  type HeadToHeadMatch,
  type UnifiedStandingStats,
} from "./unifiedStandings";
import { pairPlayersDisplayLabel } from "./pairPlayerNames";

export interface TeamConfig {
  teamNames: string[];
  pairToTeam: Record<string, number>;
}

export interface PairWithStats extends Pair {
  gamesWon: number;
  gamesLost: number;
  setsWon: number;
  setsLost: number;
  /** Puntos a favor (marcador acumulado). */
  points: number;
  /** Puntos en contra (marcador del rival). */
  pointsReceived: number;
  matchesPlayed: number;
  /** Partidos ganados / perdidos / puntos de torneo (reglas unificadas). */
  pg: number;
  pp: number;
  pe?: number;
  puntosTorneo: number;
}

export type { UnifiedStandingStats, HeadToHeadMatch };

export function getPairStandingDiff(pair: PairWithStats): number {
  return computeStandingDif(pair.points, pair.pointsReceived);
}

function pairToUnifiedStats(pair: PairWithStats): UnifiedStandingStats {
  const pe =
    pair.pe ?? Math.max(0, pair.matchesPlayed - pair.pg - pair.pp);
  return {
    pj: pair.matchesPlayed,
    pg: pair.pg,
    pe,
    pp: pair.pp,
    ptsFav: pair.points,
    ptsCon: pair.pointsReceived,
    puntos: pair.puntosTorneo,
  };
}

export function getMatchScoresForStandings(
  match: Match,
  matchGames: Game[]
): { score1: number; score2: number } {
  if (matchGames.length > 0) {
    const st = calculateMatchStats(match, matchGames);
    return { score1: st.pair1TotalPoints, score2: st.pair2TotalPoints };
  }
  return {
    score1: match.pair1_score ?? 0,
    score2: match.pair2_score ?? 0,
  };
}

export function buildHeadToHeadFromMatches(
  matches: Match[],
  allGames: Game[] = []
): HeadToHeadMatch[] {
  return matches
    .filter((m) => m.status === "finished")
    .map((m) => {
      const matchGames = allGames.filter((g) => g.match_id === m.id);
      const { score1, score2 } = getMatchScoresForStandings(m, matchGames);
      let winnerId: string | undefined;
      if (score1 > score2) winnerId = m.pair1_id;
      else if (score2 > score1) winnerId = m.pair2_id;
      return {
        pairAId: m.pair1_id,
        pairBId: m.pair2_id,
        gamesA: score1,
        gamesB: score2,
        winnerId,
      };
    });
}

export function sortPairsForStandings(
  pairs: PairWithStats[],
  matches: Match[],
  allGames: Game[] = []
): PairWithStats[] {
  const entities = pairs.map((p, i) => ({
    id: p.id,
    label: pairPlayersDisplayLabel(p),
    seed: i,
    stats: pairToUnifiedStats(p),
  }));
  const sorted = sortStandingsEntities(
    entities,
    buildHeadToHeadFromMatches(matches, allGames)
  );
  const byId = new Map(pairs.map((p) => [p.id, p]));
  return sorted.map((e) => byId.get(e.id)!);
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
  const pairStats = new Map<
    string,
    {
      gamesWon: number;
      gamesLost: number;
      setsWon: number;
      setsLost: number;
      points: number;
      pointsReceived: number;
      matchesPlayed: number;
      pg: number;
      pp: number;
      pe: number;
      puntosTorneo: number;
    }
  >();
  pairs.forEach((p) =>
    pairStats.set(p.id, {
      gamesWon: 0,
      gamesLost: 0,
      setsWon: 0,
      setsLost: 0,
      points: 0,
      pointsReceived: 0,
      matchesPlayed: 0,
      pg: 0,
      pp: 0,
      pe: 0,
      puntosTorneo: 0,
    })
  );

  const unifiedByPair = new Map<string, UnifiedStandingStats>();
  pairs.forEach((p) => unifiedByPair.set(p.id, createEmptyStandingStats()));

  matches.forEach((match) => {
    if (match.status !== "finished") return;
    const matchGames = allGames.filter((g) => g.match_id === match.id);
    const s1 = pairStats.get(match.pair1_id);
    const s2 = pairStats.get(match.pair2_id);
    const u1 = unifiedByPair.get(match.pair1_id);
    const u2 = unifiedByPair.get(match.pair2_id);
    if (!s1 || !s2 || !u1 || !u2) return;

    const { score1, score2 } = getMatchScoresForStandings(match, matchGames);
    applyMatchToStandingStats(u1, u2, score1, score2);

    s1.matchesPlayed = u1.pj;
    s2.matchesPlayed = u2.pj;
    s1.pg = u1.pg;
    s2.pg = u2.pg;
    s1.pp = u1.pp;
    s2.pp = u2.pp;
    s1.pe = u1.pe;
    s2.pe = u2.pe;
    s1.puntosTorneo = u1.puntos;
    s2.puntosTorneo = u2.puntos;
    s1.points = u1.ptsFav;
    s2.points = u2.ptsFav;
    s1.pointsReceived = u1.ptsCon;
    s2.pointsReceived = u2.ptsCon;

    if (matchGames.length > 0) {
      const st = calculateMatchStats(match, matchGames);
      s1.gamesWon += st.pair1GamesWon;
      s1.gamesLost += st.pair2GamesWon;
      s1.setsWon += st.pair1SetsWon;
      s1.setsLost += st.pair2SetsWon;
      s2.gamesWon += st.pair2GamesWon;
      s2.gamesLost += st.pair1GamesWon;
      s2.setsWon += st.pair2SetsWon;
      s2.setsLost += st.pair1SetsWon;
    } else if (score1 > score2) {
      s1.setsWon += 1;
      s1.gamesWon += 1;
      s2.setsLost += 1;
      s2.gamesLost += 1;
    } else if (score2 > score1) {
      s2.setsWon += 1;
      s2.gamesWon += 1;
      s1.setsLost += 1;
      s1.gamesLost += 1;
    }
  });

  return pairs.map((pair) => {
    const stats = pairStats.get(pair.id) ?? {
      gamesWon: 0,
      gamesLost: 0,
      setsWon: 0,
      setsLost: 0,
      points: 0,
      pointsReceived: 0,
      matchesPlayed: 0,
      pg: 0,
      pp: 0,
      pe: 0,
      puntosTorneo: 0,
    };
    return { ...pair, ...stats };
  });
}

export interface TeamStandingRow {
  teamIndex: number;
  name: string;
  points: number;
  pointsReceived: number;
  gamesWon: number;
  gamesLost: number;
  setsWon: number;
  setsLost: number;
  matchesPlayed: number;
  pg: number;
  pp: number;
  puntosTorneo: number;
}

/** Clasificación por equipos (ordenada por puntos, primero = ganador). */
export function computeTeamStandings(
  pairsWithStats: PairWithStats[],
  teamConfig: TeamConfig
): TeamStandingRow[] | null {
  if (!teamConfig?.teamNames?.length || !teamConfig.pairToTeam || Object.keys(teamConfig.pairToTeam).length === 0) return null;
  const n = teamConfig.teamNames.length;
  const totals: Array<{
    points: number;
    pointsReceived: number;
    gamesWon: number;
    gamesLost: number;
    setsWon: number;
    setsLost: number;
    matchesPlayed: number;
    pg: number;
    pp: number;
    puntosTorneo: number;
  }> = Array.from({ length: n }, () => ({
    points: 0,
    pointsReceived: 0,
    gamesWon: 0,
    gamesLost: 0,
    setsWon: 0,
    setsLost: 0,
    matchesPlayed: 0,
    pg: 0,
    pp: 0,
    puntosTorneo: 0,
  }));
  pairsWithStats.forEach((pair) => {
    const t = teamConfig.pairToTeam[pair.id];
    if (t >= 0 && t < n) {
      totals[t].points += pair.points;
      totals[t].pointsReceived += pair.pointsReceived;
      totals[t].gamesWon += pair.gamesWon;
      totals[t].gamesLost += pair.gamesLost;
      totals[t].setsWon += pair.setsWon;
      totals[t].setsLost += pair.setsLost;
      totals[t].matchesPlayed += pair.matchesPlayed;
      totals[t].pg += pair.pg;
      totals[t].pp += pair.pp;
      totals[t].puntosTorneo += pair.puntosTorneo;
    }
  });
  const rows: TeamStandingRow[] = totals.map((tot, teamIndex) => ({
    teamIndex,
    name: teamConfig.teamNames[teamIndex] ?? `Equipo ${teamIndex + 1}`,
    points: tot.points,
    pointsReceived: tot.pointsReceived,
    gamesWon: tot.gamesWon,
    gamesLost: tot.gamesLost,
    setsWon: tot.setsWon,
    setsLost: tot.setsLost,
    matchesPlayed: tot.matchesPlayed,
    pg: tot.pg,
    pp: tot.pp,
    puntosTorneo: tot.puntosTorneo,
  }));

  const entities = rows.map((r, i) => ({
    id: String(r.teamIndex),
    label: r.name,
    seed: i,
    stats: {
      pj: r.matchesPlayed,
      pg: r.pg,
      pe: Math.max(0, r.matchesPlayed - r.pg - r.pp),
      pp: r.pp,
      ptsFav: r.points,
      ptsCon: r.pointsReceived,
      puntos: r.puntosTorneo,
    },
  }));
  const sorted = sortStandingsEntities(entities, []);
  const byIdx = new Map(rows.map((r) => [String(r.teamIndex), r]));
  return sorted.map((e) => byIdx.get(e.id)!);
}

const TEAM_CONFIG_KEY = "rivieraapp_teams_";

function isCompleteTeamConfig(
  tc: TeamConfig | TournamentTeamConfig | null | undefined
): tc is TeamConfig {
  return !!(
    tc &&
    Array.isArray(tc.teamNames) &&
    tc.teamNames.length > 0 &&
    tc.pairToTeam &&
    typeof tc.pairToTeam === "object" &&
    Object.keys(tc.pairToTeam).length > 0
  );
}

/**
 * Infiere dos equipos por el prefijo del nombre del primer jugador (ej. alva1/hack1 → Equipo "alva" vs "hack").
 * (No se usa en la vista pública estándar; puede servir para herramientas o migraciones.)
 */
export function inferTeamConfigFromPairs(pairs: Pair[]): TeamConfig | null {
  if (!pairs?.length) return null;
  const getPrefix = (name: string) => {
    const s = (name || "").trim();
    const match = s.match(/^[a-zA-Z\u00C0-\u024F]+/);
    return (match ? match[0].toLowerCase() : s.slice(0, 4)) || "equipo";
  };
  const byPrefix = new Map<string, string[]>();
  pairs.forEach((p) => {
    const prefix = getPrefix(p.player1_name || p.player2_name || "");
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(p.id);
  });
  const prefixes = Array.from(byPrefix.keys());
  if (prefixes.length !== 2) return null;
  const [name0, name1] = prefixes;
  const teamNames = [
    name0.charAt(0).toUpperCase() + name0.slice(1),
    name1.charAt(0).toUpperCase() + name1.slice(1),
  ];
  const pairToTeam: Record<string, number> = {};
  byPrefix.get(name0)!.forEach((id) => { pairToTeam[id] = 0; });
  byPrefix.get(name1)!.forEach((id) => { pairToTeam[id] = 1; });
  return { teamNames, pairToTeam };
}

/**
 * Divide las parejas en dos mitades con nombres genéricos (p. ej. demos o utilidades).
 * La vista pública no debe usar esto para decidir la tabla de clasificación.
 */
export function fallbackTwoTeamsFromPairs(pairs: Pair[]): TeamConfig | null {
  if (!pairs?.length || pairs.length < 2) return null;
  const mid = Math.ceil(pairs.length / 2);
  const pairToTeam: Record<string, number> = {};
  pairs.forEach((p, i) => { pairToTeam[p.id] = i < mid ? 0 : 1; });
  return { teamNames: ["Equipo 1", "Equipo 2"], pairToTeam };
}

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

/**
 * Vista pública: team_config solo si el torneo es por equipos o hay config explícita
 * (Supabase `tournament_public_config`, fila del torneo, localStorage o hash #teams=).
 * No usa inferencia ni "Equipo 1 / Equipo 2" para retas round robin.
 */
export function resolvePublicStandingsTeamConfig(
  tournament: Tournament | null | undefined,
  configFromPublic: TournamentTeamConfig | TeamConfig | null | undefined,
  tournamentId: string,
  hashTeamConfig: TeamConfig | null | undefined
): TeamConfig | null {
  if (tournament?.format === "round_robin") {
    return null;
  }
  if (isCompleteTeamConfig(configFromPublic ?? undefined)) {
    return configFromPublic as TeamConfig;
  }
  if (tournament?.format === "teams") {
    if (isCompleteTeamConfig(tournament.team_config)) {
      return tournament.team_config as TeamConfig;
    }
    const stored = getTeamConfigFromStorage(tournamentId);
    if (isCompleteTeamConfig(stored)) return stored;
    if (isCompleteTeamConfig(hashTeamConfig ?? undefined)) return hashTeamConfig!;
    return null;
  }
  if (isCompleteTeamConfig(tournament?.team_config)) {
    return tournament!.team_config as TeamConfig;
  }
  if (isCompleteTeamConfig(hashTeamConfig ?? undefined)) return hashTeamConfig!;
  return null;
}
