/// <reference types="jest" />

import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import {
  buildMatricesFromScoredRounds,
  generateAmericanoRound,
  initializeMatrix,
  isFirstHalfRound,
  selectBenchPlayers,
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

describe("isFirstHalfRound", () => {
  test("first half for round 1..floor when 2r<=T", () => {
    expect(isFirstHalfRound(1, 5)).toBe(true);
    expect(isFirstHalfRound(2, 5)).toBe(true);
    expect(isFirstHalfRound(3, 5)).toBe(false);
  });
});

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
    const playing = new Set<string>();
    round.matches.forEach((match) => {
      [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]].forEach(
        (p) => {
          expect(playing.has(p.id)).toBe(false);
          playing.add(p.id);
        }
      );
    });
    expect(playing.size).toBe(8);
  });

  test("second half pairs 1st+2nd vs 3rd+4th by accumulated games", () => {
    const ps = makePlayers(8);
    ps[0].stats.pointsFor = 100;
    ps[1].stats.pointsFor = 90;
    ps[2].stats.pointsFor = 80;
    ps[3].stats.pointsFor = 70;
    ps[4].stats.pointsFor = 40;
    ps[5].stats.pointsFor = 30;
    ps[6].stats.pointsFor = 20;
    ps[7].stats.pointsFor = 10;
    const pm = initializeMatrix(ps);
    const round = generateAmericanoRound({
      allPlayers: ps,
      roundNumber: 4,
      totalRounds: 6,
      courts: 2,
      partnerMatrix: pm,
      lastBenchPlayerIds: new Set(),
    });
    expect(round.phase).toBe(2);
    const m0 = round.matches[0];
    const idsA = new Set([m0.teamA[0].id, m0.teamA[1].id]);
    expect(idsA.has("p-1")).toBe(true);
    expect(idsA.has("p-2")).toBe(true);
    const idsB = new Set([m0.teamB[0].id, m0.teamB[1].id]);
    expect(idsB.has("p-3")).toBe(true);
    expect(idsB.has("p-4")).toBe(true);
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
