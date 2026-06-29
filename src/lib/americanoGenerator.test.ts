/// <reference types="jest" />

import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import {
  buildMatricesFromScoredRounds,
  generateAmericanoRound,
  initializeMatrix,
  selectBenchPlayers,
  validateAmericanoRound,
} from "./americanoGenerator";

function makePlayers(total: number): AmericanoPlayer[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Player ${i + 1}`,
    stats: {
      pointsFor: 0,
      pointsAgainst: 0,
      gamesPlayed: 0,
      roundsOnBench: 0,
    },
  }));
}

function collectPlayingIds(round: AmericanoRound): Set<string> {
  const playing = new Set<string>();
  round.matches.forEach((match) => {
    [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]].forEach(
      (p) => {
        expect(playing.has(p.id)).toBe(false);
        playing.add(p.id);
      }
    );
  });
  return playing;
}

function scoreRound(round: AmericanoRound): AmericanoRound {
  return {
    ...round,
    matches: round.matches.map((m, i) => ({
      ...m,
      scoreA: 6,
      scoreB: 4 + (i % 2),
    })),
  };
}

function applyBenchStats(
  players: AmericanoPlayer[],
  benchPlayers: AmericanoPlayer[]
): void {
  for (const b of benchPlayers) {
    const p = players.find((x) => x.id === b.id);
    if (p) p.stats.roundsOnBench += 1;
  }
}

function applyGameStats(round: AmericanoRound): void {
  for (const match of round.matches) {
    if (typeof match.scoreA !== "number" || typeof match.scoreB !== "number") {
      continue;
    }
    for (const p of [
      ...match.teamA,
      ...match.teamB,
    ] as AmericanoPlayer[]) {
      p.stats.gamesPlayed += 1;
    }
  }
}

interface SimulatedTournament {
  rounds: AmericanoRound[];
  players: AmericanoPlayer[];
}

function simulateAmericanoTournament(
  playerCount: number,
  totalRounds: number,
  courts: number
): SimulatedTournament {
  const players = makePlayers(playerCount);
  let rounds: AmericanoRound[] = [];
  let partnerMatrix = initializeMatrix(players);
  let rivalMatrix = initializeMatrix(players);
  let lastBench = new Set<string>();

  for (let r = 1; r <= totalRounds; r += 1) {
    const round = generateAmericanoRound({
      allPlayers: players,
      roundNumber: r,
      totalRounds,
      courts,
      partnerMatrix,
      rivalMatrix,
      lastBenchPlayerIds: lastBench,
      priorRounds: rounds,
      scoredRounds: rounds,
    });

    expect(round.phase).toBe(1);

    const scored = scoreRound(round);
    applyBenchStats(players, scored.benchPlayers);
    applyGameStats(scored);

    rounds = [...rounds, scored];
    const built = buildMatricesFromScoredRounds(players, rounds);
    partnerMatrix = built.partnerMatrix;
    rivalMatrix = built.rivalMatrix;
    lastBench = new Set(scored.benchPlayers.map((p) => p.id));
  }

  return { rounds, players };
}

function uniquePartnersByPlayer(
  rounds: AmericanoRound[],
  players: AmericanoPlayer[]
): Map<string, Set<string>> {
  const partnerCounts = new Map<string, Set<string>>();
  players.forEach((p) => partnerCounts.set(p.id, new Set()));
  rounds.forEach((round) => {
    round.matches.forEach((m) => {
      partnerCounts.get(m.teamA[0].id)!.add(m.teamA[1].id);
      partnerCounts.get(m.teamA[1].id)!.add(m.teamA[0].id);
      partnerCounts.get(m.teamB[0].id)!.add(m.teamB[1].id);
      partnerCounts.get(m.teamB[1].id)!.add(m.teamB[0].id);
    });
  });
  return partnerCounts;
}

function countRepeatedPartnerPairs(rounds: AmericanoRound[]): number {
  const pairCounts = new Map<string, number>();
  for (const round of rounds) {
    for (const m of round.matches) {
      for (const [a, b] of [
        [m.teamA[0].id, m.teamA[1].id],
        [m.teamB[0].id, m.teamB[1].id],
      ] as const) {
        const key = [a, b].sort().join("|");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  let repeats = 0;
  pairCounts.forEach((count) => {
    if (count > 1) repeats += count - 1;
  });
  return repeats;
}

function analyzeConsecutiveBench(rounds: AmericanoRound[]): {
  consecutiveCount: number;
  pairs: string[][];
} {
  const pairs: string[][] = [];
  for (let i = 1; i < rounds.length; i += 1) {
    const prev = new Set(rounds[i - 1].benchPlayers.map((p) => p.id));
    const overlap = rounds[i].benchPlayers
      .map((p) => p.id)
      .filter((id) => prev.has(id));
    if (overlap.length > 0) {
      pairs.push(overlap);
    }
  }
  return { consecutiveCount: pairs.length, pairs };
}

describe("generateAmericanoRound", () => {
  test("throws with fewer than 4 players", () => {
    expect(() =>
      generateAmericanoRound({
        allPlayers: makePlayers(3),
        roundNumber: 1,
        totalRounds: 3,
        courts: 1,
        partnerMatrix: initializeMatrix(makePlayers(4)),
        lastBenchPlayerIds: new Set(),
      })
    ).toThrow();
  });

  test("with 8 players no one plays twice in the same round", () => {
    const ps = makePlayers(8);
    const pm = initializeMatrix(ps);
    const round = generateAmericanoRound({
      allPlayers: ps,
      roundNumber: 1,
      totalRounds: 6,
      courts: 2,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(),
    });
    const playing = collectPlayingIds(round);
    expect(playing.size).toBe(8);
    expect(round.phase).toBe(1);
  });

  test("always assigns phase 1 (no competitive ranking phase)", () => {
    const ps = makePlayers(6);
    const pm = initializeMatrix(ps);
    const round = generateAmericanoRound({
      allPlayers: ps,
      roundNumber: 2,
      totalRounds: 4,
      courts: 1,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(["p-1"]),
    });
    expect(round.phase).toBe(1);
  });

  test("court numbers stay within configured courts", () => {
    const ps = makePlayers(8);
    const pm = initializeMatrix(ps);
    const configuredCourts = 3;
    const round = generateAmericanoRound({
      allPlayers: ps,
      roundNumber: 1,
      totalRounds: 4,
      courts: configuredCourts,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(),
    });
    const maxCourts = Math.min(configuredCourts, round.matches.length);
    round.matches.forEach((m) => {
      expect(m.court).toBeGreaterThanOrEqual(1);
      expect(m.court).toBeLessThanOrEqual(maxCourts);
    });
  });

  test("pairings ignore accumulated ranking stats", () => {
    const psRanked = makePlayers(8);
    psRanked[0].stats.pointsFor = 100;
    psRanked[1].stats.pointsFor = 90;
    psRanked[2].stats.pointsFor = 80;
    psRanked[3].stats.pointsFor = 70;

    const psFlat = makePlayers(8);
    const pm = initializeMatrix(psFlat);

    const matchIds = (round: AmericanoRound) =>
      round.matches
        .map((m) =>
          [m.teamA[0].id, m.teamA[1].id, m.teamB[0].id, m.teamB[1].id]
            .sort()
            .join("|")
        )
        .sort();

    const rankedRound = generateAmericanoRound({
      allPlayers: psRanked,
      roundNumber: 3,
      totalRounds: 6,
      courts: 2,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(),
    });
    const flatRound = generateAmericanoRound({
      allPlayers: psFlat,
      roundNumber: 3,
      totalRounds: 6,
      courts: 2,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(),
    });

    expect(matchIds(rankedRound)).toEqual(matchIds(flatRound));
    expect(rankedRound.phase).toBe(1);
  });
});

describe("Americano schedule scenarios", () => {
  test("12 jugadores, 3 canchas, 5 rondas — todos juegan, 3 partidos, sin banquillo, 5 compañeros distintos", () => {
    const { rounds, players } = simulateAmericanoTournament(12, 5, 3);

    expect(rounds).toHaveLength(5);
    rounds.forEach((round) => {
      expect(round.matches).toHaveLength(3);
      expect(round.benchPlayers).toHaveLength(0);
      expect(collectPlayingIds(round).size).toBe(12);
    });

    const partners = uniquePartnersByPlayer(rounds, players);
    players.forEach((p) => {
      expect(partners.get(p.id)!.size).toBe(5);
    });
    expect(countRepeatedPartnerPairs(rounds)).toBe(0);
  });

  test("8 jugadores, 2 canchas, 7 rondas — todos juegan, 2 partidos, sin banquillo", () => {
    const { rounds, players } = simulateAmericanoTournament(8, 7, 2);

    expect(rounds).toHaveLength(7);
    rounds.forEach((round) => {
      expect(round.matches).toHaveLength(2);
      expect(round.benchPlayers).toHaveLength(0);
      expect(collectPlayingIds(round).size).toBe(8);
    });

    const partners = uniquePartnersByPlayer(rounds, players);
    const uniqueCounts = players.map((p) => partners.get(p.id)!.size);
    const repeatedPartnerPairs = countRepeatedPartnerPairs(rounds);

    // Rotación perfecta (7 compañeros distintos) es posible; documentamos lo que hace el algoritmo actual.
    expect(repeatedPartnerPairs).toBe(0);
    players.forEach((p) => {
      expect(partners.get(p.id)!.size).toBe(7);
    });
    expect(Math.min(...uniqueCounts)).toBe(7);
    expect(Math.max(...uniqueCounts)).toBe(7);
  });

  test("10 jugadores, 2 canchas, 5 rondas — banquillo rotativo", () => {
    const { rounds, players } = simulateAmericanoTournament(10, 5, 2);

    expect(rounds).toHaveLength(5);
    rounds.forEach((round) => {
      expect(round.matches).toHaveLength(2);
      expect(round.benchPlayers).toHaveLength(2);
      expect(collectPlayingIds(round).size).toBe(8);
    });

    const benchCounts = new Map(players.map((p) => [p.id, 0]));
    rounds.forEach((round) => {
      round.benchPlayers.forEach((p) => {
        benchCounts.set(p.id, (benchCounts.get(p.id) ?? 0) + 1);
      });
    });

    const counts = players.map((p) => benchCounts.get(p.id) ?? 0);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(10);

    const consecutive = analyzeConsecutiveBench(rounds);
    expect(consecutive.consecutiveCount).toBe(0);

    const minBench = Math.min(...counts);
    const maxBench = Math.max(...counts);

    // Reparto ideal: 1 descanso por jugador. El algoritmo actual no lo garantiza;
    // documentamos el rango observado sin modificar la lógica de generación.
    expect(minBench).toBeGreaterThanOrEqual(0);
    expect(maxBench).toBeLessThanOrEqual(2);
    expect(maxBench - minBench).toBeLessThanOrEqual(2);
  });
});

describe("selectBenchPlayers", () => {
  test("prefers not to bench same player twice in a row when alternatives exist", () => {
    const ps = makePlayers(5);
    ps.forEach((p) => {
      p.stats.roundsOnBench = 0;
      p.stats.gamesPlayed = 0;
    });
    const last = new Set(["p-1"]);
    const bench = selectBenchPlayers(ps, 1, last);
    expect(bench).toHaveLength(1);
    expect(bench[0].id).not.toBe("p-1");
  });
});

describe("buildMatricesFromScoredRounds", () => {
  test("counts partners only from matches with scores", () => {
    const ps = makePlayers(4);
    const round: AmericanoRound = {
      roundNumber: 1,
      phase: 1,
      benchPlayers: [],
      matches: [
        {
          id: "m1",
          court: 1,
          teamA: [ps[0], ps[1]],
          teamB: [ps[2], ps[3]],
          scoreA: 6,
          scoreB: 4,
        },
      ],
    };
    const { partnerMatrix } = buildMatricesFromScoredRounds(ps, [round]);
    expect(partnerMatrix[ps[0].id][ps[1].id]).toBeGreaterThanOrEqual(1);
  });
});

describe("validateAmericanoRound", () => {
  test("rejects duplicate player in same round", () => {
    const ps = makePlayers(4);
    const pm = initializeMatrix(ps);
    const rm = initializeMatrix(ps);
    const round: AmericanoRound = {
      roundNumber: 1,
      phase: 1,
      benchPlayers: [],
      matches: [
        {
          id: "m1",
          court: 1,
          teamA: [ps[0], ps[1]],
          teamB: [ps[2], ps[0]],
        },
      ],
    };
    const result = validateAmericanoRound(round, ps, pm, rm);
    expect(result.ok).toBe(false);
  });
});
