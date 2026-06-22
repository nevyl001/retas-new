import {
  getMatchScoresForStandings,
  computePairsWithStats,
  sortPairsForStandings,
} from "./standingsUtils";
import type { Game, Match, Pair } from "./database";

const pair = (
  id: string,
  n1: string,
  n2: string
): Pair => ({
  id,
  tournament_id: "t1",
  player1_id: `${id}-a`,
  player2_id: `${id}-b`,
  player1_name: n1,
  player2_name: n2,
  created_at: "",
});

const match = (
  id: string,
  pair1: string,
  pair2: string,
  round: number,
  status: Match["status"] = "finished",
  scores?: { p1: number; p2: number }
): Match =>
  ({
    id,
    tournament_id: "t1",
    pair1_id: pair1,
    pair2_id: pair2,
    round,
    court: 1,
    status,
    pair1_score: scores?.p1,
    pair2_score: scores?.p2,
    created_at: "",
  }) as Match;

describe("standingsUtils", () => {
  it("suma todos los juegos del partido para marcador", () => {
    const m = match("m1", "p1", "p2", 1);
    const games = [
      {
        id: "g1",
        match_id: "m1",
        pair1_games: 4,
        pair2_games: 6,
        is_tie_break: false,
        created_at: "",
      },
      {
        id: "g2",
        match_id: "m1",
        pair1_games: 6,
        pair2_games: 3,
        is_tie_break: false,
        created_at: "",
      },
    ] as Game[];
    expect(getMatchScoresForStandings(m, games)).toEqual({
      score1: 10,
      score2: 9,
    });
  });

  it("usa pair1_score/pair2_score si no hay juegos", () => {
    const m = match("m1", "p1", "p2", 1, "finished", { p1: 6, p2: 4 });
    expect(getMatchScoresForStandings(m, [])).toEqual({
      score1: 6,
      score2: 4,
    });
  });

  it("ordena por puntos a favor (FAV) en tabla", () => {
    const pairs = [pair("p1", "A", "B"), pair("p2", "C", "D")];
    const matches = [
      match("m1", "p1", "p2", 1, "finished", { p1: 6, p2: 4 }),
      match("m2", "p2", "p1", 2, "finished", { p1: 5, p2: 6 }),
    ];
    const withStats = computePairsWithStats(pairs, matches, []);
    const sorted = sortPairsForStandings(withStats, matches, []);
    expect(sorted[0]?.id).toBe("p1");
    expect(sorted[0]?.points).toBeGreaterThan(sorted[1]?.points ?? 0);
  });
});
