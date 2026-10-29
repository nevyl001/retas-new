/**
 * @jest-environment jsdom
 */
import { generateCircleRoundRobinSchedule } from "../circleRoundRobinSchedule";
import { validateSchedule } from "../roundRobinValidate";
import { planRepackExistingRoundRobin } from "./repackRoundRobinRounds";
import type { Pair } from "../db/types";

function makePair(id: string, a: string, b: string): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: `p1-${id}`,
    player2_id: `p2-${id}`,
    player1_name: a,
    player2_name: b,
    created_at: "",
  };
}

const PAIRS: Pair[] = [
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "Aime", "Ivan"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "Fernanda", "Diego"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "Itzi", "David"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", "Mario", "Fabiola"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", "Mich", "Lalo"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", "Montse", "Paco"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7", "Osmara", "Isra"),
  makePair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8", "Paty", "Dany"),
];

describe("planRepackExistingRoundRobin", () => {
  test("remapea calendario viejo a 10 rondas conservando IDs de enfrentamiento", () => {
    // Simula el calendario viejo: IDs fijos por arista, rondas mal empaquetadas.
    const ideal = generateCircleRoundRobinSchedule(PAIRS, 4, { seed: 1 });
    // Con 4 canchas el círculo llenaría 7 rondas de 4; usamos esas aristas
    // como "existentes" con rounds artificiales 3-1-...
    expect(ideal).toHaveLength(28);
    const existing = ideal.map((m, idx) => ({
      id: `match-${idx}`,
      pair1_id: m.pair1.id,
      pair2_id: m.pair2.id,
      round: idx % 2 === 0 ? Math.floor(idx / 2) * 2 + 1 : Math.floor(idx / 2) * 2 + 2,
      court: (idx % 3) + 1,
      status: "pending",
    }));

    const plan = planRepackExistingRoundRobin(PAIRS, existing, 3, { seed: 9 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.patches).toHaveLength(28);
    const ids = new Set(plan.patches.map((p) => p.id));
    expect(ids.size).toBe(28);
    for (const e of existing) {
      expect(ids.has(e.id)).toBe(true);
    }

    const byRound = new Map<number, number>();
    for (const p of plan.patches) {
      byRound.set(p.round, (byRound.get(p.round) ?? 0) + 1);
    }
    expect(
      Array.from({ length: 10 }, (_, i) => byRound.get(i + 1) ?? 0).join("-")
    ).toBe("3-3-3-3-3-3-3-3-3-1");

    expect(
      validateSchedule(
        plan.patches.map((p) => ({
          pair1Id: p.pair1_id,
          pair2Id: p.pair2_id,
          round: p.round,
          court: p.court,
        })),
        PAIRS,
        3
      )
    ).toEqual([]);
  });

  test("detiene si hay enfrentamiento duplicado", () => {
    const a = PAIRS[0];
    const b = PAIRS[1];
    const plan = planRepackExistingRoundRobin(
      PAIRS,
      [
        {
          id: "m1",
          pair1_id: a.id,
          pair2_id: b.id,
          round: 1,
          court: 1,
        },
        {
          id: "m2",
          pair1_id: b.id,
          pair2_id: a.id,
          round: 2,
          court: 1,
        },
      ],
      3
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toMatch(/duplicado|esperaban/i);
  });
});
