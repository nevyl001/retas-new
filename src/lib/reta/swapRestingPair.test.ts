/**
 * @jest-environment jsdom
 */
import {
  listSwappablePlayingSlots,
  planRestingPairSwap,
} from "./swapRestingPair";
import type { Match, Pair } from "../db/types";

function pair(id: string, a: string, b: string): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: `${id}-1`,
    player2_id: `${id}-2`,
    player1_name: a,
    player2_name: b,
    created_at: "",
  };
}

function match(
  id: string,
  p1: string,
  p2: string,
  extras: Partial<Match> = {}
): Match {
  return {
    id,
    tournament_id: "t1",
    pair1_id: p1,
    pair2_id: p2,
    pair1_name: p1,
    pair2_name: p2,
    court: 1,
    round: 1,
    status: "pending",
    created_at: "",
    ...extras,
  };
}

const pairs = [
  pair("A", "Ana", "Ada"),
  pair("B", "Bea", "Bel"),
  pair("C", "Cata", "Cris"),
  pair("D", "Dani", "Dom"),
];

describe("swapRestingPair", () => {
  test("lista slots jugables y excluye partidos finalizados", () => {
    const roundMatches = [
      match("m1", "A", "B"),
      match("m2", "C", "D", {
        status: "finished",
        pair1_score: 6,
        pair2_score: 4,
      }),
    ];
    const slots = listSwappablePlayingSlots({
      roundMatches,
      restingPairId: "X",
      pairs: [...pairs, pair("X", "Xim", "Xoe")],
    });
    expect(slots.map((s) => s.playingPairId).sort()).toEqual(["A", "B"]);
  });

  test("planifica swap: descanso entra y la jugadora sale", () => {
    const one = [match("m1", "A", "B")];
    const plan = planRestingPairSwap({
      roundMatches: one,
      restingPairId: "C",
      playingPairId: "A",
      pairs,
    });
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.matchId).toBe("m1");
    expect(plan.updates.pair1_id).toBe("C");
    expect(plan.updates.pair1_name).toBe("Cata / Cris");
    expect(plan.updates.pair2_id).toBe("B");
  });

  test("rechaza swap si el partido ya tiene marcador", () => {
    const roundMatches = [
      match("m1", "A", "B", { pair1_score: 1, pair2_score: 0 }),
    ];
    const plan = planRestingPairSwap({
      roundMatches,
      restingPairId: "C",
      playingPairId: "A",
      pairs,
    });
    expect(plan).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/jugado|remontada/i),
      })
    );
  });

  test("en equipos solo permite swap del mismo equipo", () => {
    const teamConfig = {
      teamNames: ["Norte", "Sur"],
      pairToTeam: { A: 0, B: 0, C: 1, D: 1 },
    };
    const roundMatches = [match("m1", "A", "C")];
    const sameTeam = planRestingPairSwap({
      roundMatches,
      restingPairId: "B",
      playingPairId: "A",
      pairs,
      teamConfig,
    });
    expect("error" in sameTeam).toBe(false);

    const crossTeam = planRestingPairSwap({
      roundMatches,
      restingPairId: "B",
      playingPairId: "C",
      pairs,
      teamConfig,
    });
    expect(crossTeam).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/mismo equipo/i),
      })
    );
  });
});
