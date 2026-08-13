import type {
  AmericanoSnapshotMatch,
  AmericanoSnapshotPlayer,
  AmericanoSnapshotRound,
} from "./americanoDinamicoStorage";
import {
  formatRivalPair,
  resultadoFromScores,
  type PartidoDetalleResultado,
} from "./shared/buildPartidosDetalle";

export type AmericanoPublicMatchResult = PartidoDetalleResultado;

export interface AmericanoPublicMatchHistoryEntry {
  matchId: string;
  roundNumber: number;
  partnerName: string;
  rivalsLabel: string;
  scoreFavor: number;
  scoreContra: number;
  result: AmericanoPublicMatchResult;
}

type SnapshotTeam = [AmericanoSnapshotPlayer, AmericanoSnapshotPlayer];

function playerInTeam(team: SnapshotTeam, playerId: string): boolean {
  return team[0].id === playerId || team[1].id === playerId;
}

function partnerNameFromTeam(team: SnapshotTeam, playerId: string): string {
  if (team[0].id === playerId) return team[1].name;
  if (team[1].id === playerId) return team[0].name;
  return "?";
}

function isScoredMatch(match: AmericanoSnapshotMatch): boolean {
  return (
    typeof match.scoreA === "number" &&
    typeof match.scoreB === "number" &&
    Number.isFinite(match.scoreA) &&
    Number.isFinite(match.scoreB) &&
    match.scoreA >= 0 &&
    match.scoreB >= 0
  );
}

/**
 * Historial público de un jugador en Americano (presentación).
 * No modifica clasificación ni pipelines de carrera.
 */
export function buildAmericanoPublicMatchHistory(
  playerId: string,
  rounds: AmericanoSnapshotRound[]
): AmericanoPublicMatchHistoryEntry[] {
  if (!playerId || !rounds.length) return [];

  const entries: AmericanoPublicMatchHistoryEntry[] = [];

  for (const round of rounds) {
    for (const match of round.matches) {
      if (!isScoredMatch(match)) continue;

      const inA = playerInTeam(match.teamA, playerId);
      const inB = playerInTeam(match.teamB, playerId);
      if (!inA && !inB) continue;

      const ownTeam = inA ? match.teamA : match.teamB;
      const rivalTeam = inA ? match.teamB : match.teamA;
      const scoreFavor = inA ? match.scoreA! : match.scoreB!;
      const scoreContra = inA ? match.scoreB! : match.scoreA!;

      entries.push({
        matchId: match.id,
        roundNumber: round.roundNumber,
        partnerName: partnerNameFromTeam(ownTeam, playerId),
        rivalsLabel: formatRivalPair(rivalTeam[0].name, rivalTeam[1].name),
        scoreFavor,
        scoreContra,
        result: resultadoFromScores(scoreFavor, scoreContra),
      });
    }
  }

  return entries;
}

/** Deriva historial por jugador en un solo pase sobre las rondas del snapshot. */
export function buildAmericanoPublicMatchHistoryByPlayerId(
  playerIds: string[],
  rounds: AmericanoSnapshotRound[]
): Map<string, AmericanoPublicMatchHistoryEntry[]> {
  const map = new Map<string, AmericanoPublicMatchHistoryEntry[]>();
  for (const id of playerIds) {
    map.set(id, []);
  }
  if (!rounds.length || playerIds.length === 0) return map;

  const idSet = new Set(playerIds);
  for (const round of rounds) {
    for (const match of round.matches) {
      if (!isScoredMatch(match)) continue;
      const participants = [
        match.teamA[0],
        match.teamA[1],
        match.teamB[0],
        match.teamB[1],
      ];
      for (const p of participants) {
        if (!idSet.has(p.id)) continue;
        const list = map.get(p.id);
        if (!list) continue;
        // Evitar duplicar si ya construimos por jugador; aquí armamos entry inline.
        const inA = playerInTeam(match.teamA, p.id);
        const ownTeam = inA ? match.teamA : match.teamB;
        const rivalTeam = inA ? match.teamB : match.teamA;
        const scoreFavor = inA ? match.scoreA! : match.scoreB!;
        const scoreContra = inA ? match.scoreB! : match.scoreA!;
        list.push({
          matchId: match.id,
          roundNumber: round.roundNumber,
          partnerName: partnerNameFromTeam(ownTeam, p.id),
          rivalsLabel: formatRivalPair(rivalTeam[0].name, rivalTeam[1].name),
          scoreFavor,
          scoreContra,
          result: resultadoFromScores(scoreFavor, scoreContra),
        });
      }
    }
  }
  return map;
}
