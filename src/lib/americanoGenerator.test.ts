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

  test("12 players, 3 courts, 5 rounds — all play each round, 3 matches, distinct partners when possible", () => {
    const ps = makePlayers(12);
    const courts = 3;
    const totalRounds = 5;
    let rounds: AmericanoRound[] = [];
    let partnerMatrix = initializeMatrix(ps);
    let rivalMatrix = initializeMatrix(ps);
    let lastBench = new Set<string>();

    for (let r = 1; r <= totalRounds; r += 1) {
      const round = generateAmericanoRound({
        allPlayers: ps,
        roundNumber: r,
        totalRounds,
        courts,
        partnerMatrix,
        rivalMatrix,
        lastBenchPlayerIds: lastBench,
        priorRounds: rounds,
        scoredRounds: rounds,
      });

      expect(round.matches).toHaveLength(3);
      expect(round.benchPlayers).toHaveLength(0);
      const playing = collectPlayingIds(round);
      expect(playing.size).toBe(12);

      const validation = validateAmericanoRound(
        round,
        ps,
        partnerMatrix,
        rivalMatrix
      );
      expect(validation.ok).toBe(true);

      rounds = [...rounds, scoreRound(round)];
      const built = buildMatricesFromScoredRounds(ps, rounds);
      partnerMatrix = built.partnerMatrix;
      rivalMatrix = built.rivalMatrix;
      lastBench = new Set(round.benchPlayers.map((p) => p.id));
    }

    const partnerCounts = new Map<string, Set<string>>();
    ps.forEach((p) => partnerCounts.set(p.id, new Set()));
    rounds.forEach((round) => {
      round.matches.forEach((m) => {
        partnerCounts.get(m.teamA[0].id)!.add(m.teamA[1].id);
        partnerCounts.get(m.teamA[1].id)!.add(m.teamA[0].id);
        partnerCounts.get(m.teamB[0].id)!.add(m.teamB[1].id);
        partnerCounts.get(m.teamB[1].id)!.add(m.teamB[0].id);
      });
    });

    ps.forEach((p) => {
      expect(partnerCounts.get(p.id)!.size).toBe(5);
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
      round.matches.map((m) =>
        [
          m.teamA[0].id,
          m.teamA[1].id,
          m.teamB[0].id,
          m.teamB[1].id,
        ].sort().join("|")
      );

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

    expect(matchIds(rankedRound).sort()).toEqual(matchIds(flatRound).sort());
    expect(rankedRound.phase).toBe(1);
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
