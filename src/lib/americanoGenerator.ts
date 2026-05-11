import type {
  AmericanoMatch,
  AmericanoPlayer,
  AmericanoRound,
  PartnerMatrix,
  RivalMatrix,
} from "./db/types";

function clonePlayers(players: AmericanoPlayer[]): AmericanoPlayer[] {
  return players.map((player) => ({
    ...player,
    stats: { ...player.stats },
  }));
}

function initializeMatrix(players: AmericanoPlayer[]): PartnerMatrix {
  const matrix: PartnerMatrix = {};
  players.forEach((playerA) => {
    matrix[playerA.id] = {};
    players.forEach((playerB) => {
      matrix[playerA.id][playerB.id] = 0;
    });
  });
  return matrix;
}

function scorePair(
  a: AmericanoPlayer,
  b: AmericanoPlayer,
  partnerMatrix: PartnerMatrix
): number {
  return partnerMatrix[a.id]?.[b.id] ?? 0;
}

function scoreRivals(
  a: AmericanoPlayer,
  b: AmericanoPlayer,
  c: AmericanoPlayer,
  d: AmericanoPlayer,
  rivalMatrix: RivalMatrix
): number {
  return (
    (rivalMatrix[a.id]?.[c.id] ?? 0) +
    (rivalMatrix[a.id]?.[d.id] ?? 0) +
    (rivalMatrix[b.id]?.[c.id] ?? 0) +
    (rivalMatrix[b.id]?.[d.id] ?? 0)
  );
}

function evaluateMatchCandidate(
  teamA: [AmericanoPlayer, AmericanoPlayer],
  teamB: [AmericanoPlayer, AmericanoPlayer],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
) {
  return {
    partnerScore:
      scorePair(teamA[0], teamA[1], partnerMatrix) +
      scorePair(teamB[0], teamB[1], partnerMatrix),
    rivalScore: scoreRivals(teamA[0], teamA[1], teamB[0], teamB[1], rivalMatrix),
    randomTieBreak: Math.random(),
  };
}

function getBestMatchFromGroup(
  group: AmericanoPlayer[],
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
): AmericanoMatch {
  const [a, b, c, d] = group;
  const candidates = [
    { teamA: [a, b] as [AmericanoPlayer, AmericanoPlayer], teamB: [c, d] as [AmericanoPlayer, AmericanoPlayer] },
    { teamA: [a, c] as [AmericanoPlayer, AmericanoPlayer], teamB: [b, d] as [AmericanoPlayer, AmericanoPlayer] },
    { teamA: [a, d] as [AmericanoPlayer, AmericanoPlayer], teamB: [b, c] as [AmericanoPlayer, AmericanoPlayer] },
  ];

  candidates.sort((x, y) => {
    const sx = evaluateMatchCandidate(x.teamA, x.teamB, partnerMatrix, rivalMatrix);
    const sy = evaluateMatchCandidate(y.teamA, y.teamB, partnerMatrix, rivalMatrix);
    if (sx.partnerScore !== sy.partnerScore) return sx.partnerScore - sy.partnerScore;
    if (sx.rivalScore !== sy.rivalScore) return sx.rivalScore - sy.rivalScore;
    return sx.randomTieBreak - sy.randomTieBreak;
  });

  return {
    id: "",
    teamA: candidates[0].teamA,
    teamB: candidates[0].teamB,
    court: 0,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPhase1Players(activePlayers: AmericanoPlayer[]): AmericanoPlayer[] {
  return [...activePlayers];
}

function buildPhase2Players(activePlayers: AmericanoPlayer[]): AmericanoPlayer[] {
  const shuffled = shuffle(activePlayers);
  const half = Math.ceil(shuffled.length / 2);
  const left = shuffled.slice(0, half);
  const right = shuffled.slice(half);
  const mixed: AmericanoPlayer[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if (left[i]) mixed.push(left[i]);
    if (right[i]) mixed.push(right[i]);
  }
  return mixed;
}

function buildPhase3Players(activePlayers: AmericanoPlayer[]): AmericanoPlayer[] {
  return [...activePlayers].sort((a, b) => {
    const aDiff = a.stats.pointsFor - a.stats.pointsAgainst;
    const bDiff = b.stats.pointsFor - b.stats.pointsAgainst;
    if (b.stats.pointsFor !== a.stats.pointsFor) {
      return b.stats.pointsFor - a.stats.pointsFor;
    }
    if (bDiff !== aDiff) return bDiff - aDiff;
    return a.name.localeCompare(b.name);
  });
}

function updateMatrices(
  match: AmericanoMatch,
  partnerMatrix: PartnerMatrix,
  rivalMatrix: RivalMatrix
) {
  const [a1, a2] = match.teamA;
  const [b1, b2] = match.teamB;

  partnerMatrix[a1.id][a2.id] += 1;
  partnerMatrix[a2.id][a1.id] += 1;
  partnerMatrix[b1.id][b2.id] += 1;
  partnerMatrix[b2.id][b1.id] += 1;

  const rivalsA = [b1, b2];
  const rivalsB = [a1, a2];
  [a1, a2].forEach((p) => {
    rivalsA.forEach((r) => {
      rivalMatrix[p.id][r.id] += 1;
      rivalMatrix[r.id][p.id] += 1;
    });
  });
  [b1, b2].forEach((p) => {
    rivalsB.forEach((r) => {
      rivalMatrix[p.id][r.id] += 1;
      rivalMatrix[r.id][p.id] += 1;
    });
  });
}

function updateVirtualRankingSignals(match: AmericanoMatch) {
  const scoreA = Math.floor(Math.random() * 8);
  const scoreB = Math.floor(Math.random() * 8);
  match.teamA.forEach((player) => {
    player.stats.pointsFor += scoreA;
    player.stats.pointsAgainst += scoreB;
  });
  match.teamB.forEach((player) => {
    player.stats.pointsFor += scoreB;
    player.stats.pointsAgainst += scoreA;
  });
}

/**
 * Genera rondas de Americano Dinámico.
 * @param courts Número de canchas físicas (≥1). Los partidos de cada ronda se reparten
 *   rotando la asignación por ronda para que ningún slot quede siempre en la misma cancha.
 */
export function generateAmericanoRounds(
  players: AmericanoPlayer[],
  totalRounds: number,
  courts: number = 1
): AmericanoRound[] {
  if (players.length < 4) {
    throw new Error("Americano Dinamico requires at least 4 players.");
  }

  const courtSlots = Math.max(1, Math.floor(Number(courts)) || 1);

  const workingPlayers = clonePlayers(players);
  const rounds: AmericanoRound[] = [];
  const partnerMatrix = initializeMatrix(workingPlayers);
  const rivalMatrix = initializeMatrix(workingPlayers);

  const totalPhase1 = Math.floor(totalRounds * 0.33);
  const totalPhase2 = Math.floor(totalRounds * 0.34);
  let tieRotationOffset = 0;

  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    const phase: 1 | 2 | 3 =
      roundNumber <= totalPhase1 ? 1 : roundNumber <= totalPhase1 + totalPhase2 ? 2 : 3;

    const benchCount = workingPlayers.length % 4;
    let benchPlayers: AmericanoPlayer[] = [];
    let activePlayers = [...workingPlayers];

    if (benchCount > 0) {
      const indexed = workingPlayers.map((player, index) => ({ player, index }));
      const currentTieRotationOffset = tieRotationOffset;
      indexed.sort((a, b) => {
        if (b.player.stats.gamesPlayed !== a.player.stats.gamesPlayed) {
          return b.player.stats.gamesPlayed - a.player.stats.gamesPlayed;
        }
        const ra =
          (a.index - currentTieRotationOffset + indexed.length) % indexed.length;
        const rb =
          (b.index - currentTieRotationOffset + indexed.length) % indexed.length;
        return ra - rb;
      });

      benchPlayers = indexed.slice(0, benchCount).map((row) => row.player);
      const benchIds = new Set(benchPlayers.map((p) => p.id));
      activePlayers = workingPlayers.filter((player) => !benchIds.has(player.id));
      benchPlayers.forEach((player) => {
        player.stats.roundsOnBench += 1;
      });
      tieRotationOffset = (tieRotationOffset + 1) % workingPlayers.length;
    }

    const ordered =
      phase === 1
        ? buildPhase1Players(activePlayers)
        : phase === 2
        ? buildPhase2Players(activePlayers)
        : buildPhase3Players(activePlayers);

    const matches: AmericanoMatch[] = [];
    for (let i = 0; i < ordered.length; i += 4) {
      const group = ordered.slice(i, i + 4);
      if (group.length < 4) continue;

      let match: AmericanoMatch;
      if (phase === 3) {
        match = {
          id: "",
          teamA: [group[0], group[3]],
          teamB: [group[1], group[2]],
          court: 0,
        };
      } else {
        match = getBestMatchFromGroup(group, partnerMatrix, rivalMatrix);
      }

      matches.push(match);
    }

    const matchCount = matches.length;
    const effectiveCourts = Math.min(courtSlots, Math.max(1, matchCount));
    matches.forEach((match, matchIndex) => {
      const court =
        ((matchIndex + (roundNumber - 1)) % effectiveCourts) + 1;
      match.court = court;
      match.id = `americano-r${roundNumber}-m${matchIndex + 1}-c${court}`;
    });

    matches.forEach((match) => {
      const uniquePlayers = [
        match.teamA[0],
        match.teamA[1],
        match.teamB[0],
        match.teamB[1],
      ];
      uniquePlayers.forEach((p) => {
        p.stats.gamesPlayed += 1;
      });
      updateVirtualRankingSignals(match);
      updateMatrices(match, partnerMatrix, rivalMatrix);
    });

    rounds.push({
      roundNumber,
      phase,
      matches,
      benchPlayers,
    });
  }

  return rounds;
}
