import type { AmericanoPlayer, AmericanoRound } from "../db/types";

/** Mientras la reta está abierta, la ficha se vuelve a leer a este ritmo. */
export const FICHA_LIVE_REFRESH_MS = 4_000;

export function livePlayerLabel(
  namesById: Record<string, string | null | undefined> | undefined,
  id: string,
  fallback: string
): string {
  const live = namesById?.[id]?.trim();
  return live || fallback;
}

/**
 * Sustituye el nombre congelado al armar la reta por el de la ficha.
 * No toca marcadores ni emparejamientos.
 */
export function applyLiveNamesToAmericano(
  players: AmericanoPlayer[],
  rounds: AmericanoRound[],
  namesById: Record<string, string | null | undefined>
): { players: AmericanoPlayer[]; rounds: AmericanoRound[]; changed: boolean } {
  const renamed = new Map<string, AmericanoPlayer>();
  let changed = false;

  const mapPlayer = (player: AmericanoPlayer): AmericanoPlayer => {
    const known = renamed.get(player.id);
    if (known) return known;
    const name = livePlayerLabel(namesById, player.id, player.name);
    if (name === player.name) {
      renamed.set(player.id, player);
      return player;
    }
    changed = true;
    const next = { ...player, name };
    renamed.set(player.id, next);
    return next;
  };

  const nextPlayers = players.map(mapPlayer);
  const nextRounds = rounds.map((round) => {
    let roundChanged = false;
    const benchPlayers = round.benchPlayers.map((player) => {
      const next = mapPlayer(player);
      if (next !== player) roundChanged = true;
      return next;
    });
    const matches = round.matches.map((match) => {
      const teamA: [AmericanoPlayer, AmericanoPlayer] = [
        mapPlayer(match.teamA[0]),
        mapPlayer(match.teamA[1]),
      ];
      const teamB: [AmericanoPlayer, AmericanoPlayer] = [
        mapPlayer(match.teamB[0]),
        mapPlayer(match.teamB[1]),
      ];
      const teamsChanged =
        teamA[0] !== match.teamA[0] ||
        teamA[1] !== match.teamA[1] ||
        teamB[0] !== match.teamB[0] ||
        teamB[1] !== match.teamB[1];
      if (!teamsChanged) return match;
      roundChanged = true;
      return { ...match, teamA, teamB };
    });
    if (!roundChanged) return round;
    return { ...round, benchPlayers, matches };
  });

  if (!changed) {
    return { players, rounds, changed: false };
  }
  return { players: nextPlayers, rounds: nextRounds, changed: true };
}
