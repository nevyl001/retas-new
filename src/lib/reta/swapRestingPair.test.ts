/**
 * @jest-environment jsdom
 */
import {
  listSwappablePlayingSlots,
  planRestingPairSwap,
} from "./swapRestingPair";
import type { Match, Pair } from "../db/types";
import { generateCircleRoundRobinSchedule } from "../circleRoundRobinSchedule";
import { validateSchedule } from "../roundRobinValidate";

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

  test("rechaza swap si el partido ya tiene marcador", () => {
    const roundMatches = [
      match("m1", "A", "B", { pair1_score: 1, pair2_score: 0 }),
    ];
    const plan = planRestingPairSwap({
      allMatches: roundMatches,
      roundMatches,
      round: 1,
      restingPairId: "C",
      playingPairId: "A",
      pairs,
      courts: 1,
    });
    expect(plan).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/jugado|remontada|reacomodar/i),
      })
    );
  });

  test("en equipos solo permite swap del mismo equipo", () => {
    const teamConfig = {
      teamNames: ["Norte", "Sur"],
      pairToTeam: { A: 0, B: 0, C: 1, D: 1 },
    };
    const roundMatches = [match("m1", "A", "C")];
    const crossTeam = planRestingPairSwap({
      allMatches: roundMatches,
      roundMatches,
      round: 1,
      restingPairId: "B",
      playingPairId: "C",
      pairs,
      courts: 1,
      teamConfig,
    });
    expect(crossTeam).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/mismo equipo/i),
      })
    );
  });

  test("8×3: meter a quien descansa reacomoda rondas sin repetir cruces", () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      pair(`P${i}`, `A${i}`, `B${i}`)
    );
    const scheduled = generateCircleRoundRobinSchedule(eight, 3, { seed: 7 });
    expect(scheduled.length).toBe(28);

    const allMatches: Match[] = scheduled.map((s, i) =>
      match(`m${i}`, s.pair1.id, s.pair2.id, {
        round: s.round,
        court: s.court,
        pair1_name: s.pair1.id,
        pair2_name: s.pair2.id,
      })
    );

    const targetRound = 2;
    const roundMatches = allMatches.filter((m) => m.round === targetRound);
    const playing = new Set<string>();
    roundMatches.forEach((m) => {
      playing.add(m.pair1_id);
      playing.add(m.pair2_id);
    });
    const resting = eight.map((p) => p.id).filter((id) => !playing.has(id));
    expect(resting.length).toBe(2);

    const restingPairId = resting[0];
    const playingPairId = Array.from(playing)[0];

    const plan = planRestingPairSwap({
      allMatches,
      roundMatches,
      round: targetRound,
      restingPairId,
      playingPairId,
      pairs: eight,
      courts: 3,
    });

    expect("error" in plan).toBe(false);
    if ("error" in plan) return;

    expect(plan.patches.length).toBeGreaterThan(0);
    for (const patch of plan.patches) {
      expect(patch.updates).toEqual(
        expect.objectContaining({
          round: expect.any(Number),
          court: expect.any(Number),
        })
      );
    }

    const byId = new Map(plan.patches.map((p) => [p.matchId, p.updates]));
    const next = allMatches.map((m) => {
      const u = byId.get(m.id);
      return u ? { ...m, ...u } : m;
    });

    const errors = validateSchedule(
      next.map((m) => ({
        pair1Id: m.pair1_id,
        pair2Id: m.pair2_id,
        round: m.round ?? 0,
        court: m.court,
      })),
      eight,
      3
    );
    expect(errors).toEqual([]);

    const nextRound = next.filter((m) => m.round === targetRound);
    const nextPlaying = new Set<string>();
    nextRound.forEach((m) => {
      nextPlaying.add(m.pair1_id);
      nextPlaying.add(m.pair2_id);
    });
    expect(nextPlaying.has(restingPairId)).toBe(true);
    expect(nextPlaying.has(playingPairId)).toBe(false);

    // Rivales intactos: mismos 28 edges.
    const edge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const before = new Set(
      allMatches.map((m) => edge(m.pair1_id, m.pair2_id))
    );
    const after = new Set(next.map((m) => edge(m.pair1_id, m.pair2_id)));
    expect(after).toEqual(before);
  });
});
