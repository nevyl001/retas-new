import {
  pairWithStatsToWinnerStats,
  resolveBestPairByGamesFor,
} from "./teamWinnerCelebrate";
import type { PairWithStats } from "./standingsUtils";

function mockPair(
  id: string,
  points: number,
  matchesPlayed = 1
): PairWithStats {
  return {
    id,
    player1_id: `${id}-p1`,
    player2_id: `${id}-p2`,
    gamesWon: 0,
    gamesLost: 0,
    setsWon: 0,
    setsLost: 0,
    points,
    pointsReceived: 0,
    matchesPlayed,
    pg: 1,
    pp: 0,
    puntosTorneo: points,
  } as PairWithStats;
}

describe("resolveBestPairByGamesFor", () => {
  it("returns null when there are no pairs", () => {
    expect(resolveBestPairByGamesFor([])).toBeNull();
  });

  it("returns null when no pair has played or scored", () => {
    expect(resolveBestPairByGamesFor([mockPair("a", 0, 0)])).toBeNull();
  });

  it("returns the first sorted pair with games a favor", () => {
    const sorted = [mockPair("best", 18), mockPair("other", 12)];
    expect(resolveBestPairByGamesFor(sorted)?.id).toBe("best");
  });
});

describe("pairWithStatsToWinnerStats", () => {
  it("maps pair stats to winner celebrate shape", () => {
    const pair = mockPair("x", 15, 3);
    pair.pointsReceived = 9;
    pair.pg = 2;
    pair.pp = 1;
    pair.puntosTorneo = 12;

    expect(pairWithStatsToWinnerStats(pair)).toEqual({
      points: 15,
      pointsReceived: 9,
      matchesPlayed: 3,
      pg: 2,
      pp: 1,
      puntosTorneo: 12,
    });
  });
});
