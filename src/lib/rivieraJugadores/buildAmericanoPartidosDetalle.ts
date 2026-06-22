import type { AmericanoPlayer, AmericanoRound } from "../db/types";
import {
  formatRivalPair,
  resultadoFromScores,
  type PartidoDetalle,
} from "../shared/buildPartidosDetalle";

function playerInTeam(
  team: [AmericanoPlayer, AmericanoPlayer],
  playerId: string
): boolean {
  return team[0].id === playerId || team[1].id === playerId;
}

/** Partidos reales de un jugador en la sesión americana. */
export function buildAmericanoPartidosDetalleForPlayer(
  playerId: string,
  rounds: AmericanoRound[],
  fechaFallback = ""
): PartidoDetalle[] {
  const entries: PartidoDetalle[] = [];

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

      const inA = playerInTeam(match.teamA, playerId);
      const inB = playerInTeam(match.teamB, playerId);
      if (!inA && !inB) continue;

      const favor = inA ? match.scoreA : match.scoreB;
      const contra = inA ? match.scoreB : match.scoreA;
      const rivalTeam = inA ? match.teamB : match.teamA;

      entries.push({
        id: match.id,
        ronda: round.roundNumber,
        fase: `Ronda ${round.roundNumber}`,
        rival: formatRivalPair(rivalTeam[0].name, rivalTeam[1].name),
        games_favor: favor,
        games_contra: contra,
        resultado: resultadoFromScores(favor, contra),
        fecha: fechaFallback,
      });
    }
  }

  return entries;
}

export function buildAmericanoPartidosDetalleByPlayerId(
  players: AmericanoPlayer[],
  rounds: AmericanoRound[],
  fechaFallback = ""
): Map<string, PartidoDetalle[]> {
  const map = new Map<string, PartidoDetalle[]>();
  for (const p of players) {
    map.set(
      p.id,
      buildAmericanoPartidosDetalleForPlayer(p.id, rounds, fechaFallback)
    );
  }
  return map;
}
