import type { AmericanoMatch, AmericanoPlayer, AmericanoRound } from "./db/types";
import type { MatchResult } from "../utils/standings";
import {
  calcularPuntos,
  createEmptyStandingStats,
  sortStandingsEntities,
  type UnifiedStandingStats,
} from "./unifiedStandings";

export function applyAmericanoResult(
  match: AmericanoMatch,
  scoreA: number,
  scoreB: number
): void {
  match.scoreA = scoreA;
  match.scoreB = scoreB;

  match.teamA.forEach((player) => {
    player.stats.pointsFor += scoreA;
    player.stats.pointsAgainst += scoreB;
    player.stats.gamesPlayed += 1;
  });

  match.teamB.forEach((player) => {
    player.stats.pointsFor += scoreB;
    player.stats.pointsAgainst += scoreA;
    player.stats.gamesPlayed += 1;
  });
}

function applyPlayerSideResult(
  stats: UnifiedStandingStats,
  scoreFor: number,
  scoreAgainst: number
): void {
  stats.pj += 1;
  stats.ptsFav += scoreFor;
  stats.ptsCon += scoreAgainst;
  if (scoreFor > scoreAgainst) {
    stats.pg += 1;
  } else if (scoreAgainst > scoreFor) {
    stats.pp += 1;
  } else {
    stats.pe += 1;
  }
  stats.puntos = calcularPuntos(stats.pg, stats.pe);
}

/** Partidos 1v1 implícitos cuando dos jugadores se enfrentan en canchas opuestas. */
export function buildAmericanoHeadToHeadMatches(
  rounds: AmericanoRound[]
): MatchResult[] {
  const out: MatchResult[] = [];
  for (const round of rounds) {
    for (const match of round.matches) {
      if (
        typeof match.scoreA !== "number" ||
        typeof match.scoreB !== "number" ||
        match.scoreA < 0 ||
        match.scoreB < 0
      ) {
        continue;
      }
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          out.push({
            pairAId: a.id,
            pairBId: b.id,
            gamesA: match.scoreA,
            gamesB: match.scoreB,
          });
        }
      }
    }
  }
  return out;
}

/** Estadísticas unificadas por jugador a partir de rondas con marcador. */
export function buildAmericanoPlayerStandingStats(
  players: AmericanoPlayer[],
  rounds: AmericanoRound[]
): Map<string, UnifiedStandingStats> {
  const map = new Map<string, UnifiedStandingStats>();
  players.forEach((p) => map.set(p.id, createEmptyStandingStats()));

  for (const round of rounds) {
    for (const match of round.matches) {
      if (
        typeof match.scoreA !== "number" ||
        typeof match.scoreB !== "number" ||
        match.scoreA < 0 ||
        match.scoreB < 0
      ) {
        continue;
      }
      const sa = match.scoreA;
      const sb = match.scoreB;
      match.teamA.forEach((pl) => {
        const st = map.get(pl.id);
        if (st) applyPlayerSideResult(st, sa, sb);
      });
      match.teamB.forEach((pl) => {
        const st = map.get(pl.id);
        if (st) applyPlayerSideResult(st, sb, sa);
      });
    }
  }

  return map;
}

function statsFromLegacyPlayer(p: AmericanoPlayer): UnifiedStandingStats {
  return {
    pj: p.stats.gamesPlayed,
    pg: 0,
    pe: 0,
    pp: 0,
    ptsFav: p.stats.pointsFor,
    ptsCon: p.stats.pointsAgainst,
    puntos: 0,
  };
}

/** Clasificación con las mismas reglas que Round Robin / Torneo Express. */
export function getAmericanoRanking(
  players: AmericanoPlayer[],
  rounds: AmericanoRound[] = []
): AmericanoPlayer[] {
  const statsMap =
    rounds.length > 0
      ? buildAmericanoPlayerStandingStats(players, rounds)
      : new Map(players.map((p) => [p.id, statsFromLegacyPlayer(p)]));

  const h2h =
    rounds.length > 0 ? buildAmericanoHeadToHeadMatches(rounds) : [];

  const entities = players.map((p, i) => ({
    id: p.id,
    label: p.name,
    seed: i,
    stats: statsMap.get(p.id) ?? createEmptyStandingStats(),
  }));

  const sorted = sortStandingsEntities(entities, h2h);
  const byId = new Map(players.map((p) => [p.id, p]));
  return sorted.map((e) => byId.get(e.id)!);
}
