import {
  assignCourtsInChunk,
  generateCircleRoundRobinSchedule,
  findCourtRotationRepairs,
} from "./circleRoundRobinSchedule";
import type { Match, Pair } from "./database";

function makePair(
  id: string,
  player1_name: string,
  player2_name: string
): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: `p1-${id}`,
    player2_id: `p2-${id}`,
    player1_name,
    player2_name,
    created_at: "",
  };
}

function makeMatch(
  id: string,
  round: number,
  court: number,
  pair1: Pair,
  pair2: Pair
): Match {
  return {
    id,
    tournament_id: "t1",
    pair1_id: pair1.id,
    pair2_id: pair2.id,
    pair1_name: `${pair1.player1_name}/${pair1.player2_name}`,
    pair2_name: `${pair2.player1_name}/${pair2.player2_name}`,
    court,
    round,
    status: "pending",
    created_at: "",
  };
}

describe("circleRoundRobinSchedule court rotation", () => {
  test("anchor pair rotates courts explicitly in a chunk", () => {
    const anchor = makePair("1", "Devyl", "Duran");
    const otherA = makePair("2", "Nevyl", "Marlon");
    const otherB = makePair("3", "Ferro", "Panchito");
    const chunk = [
      { pair1: anchor, pair2: otherB },
      { pair1: otherA, pair2: makePair("4", "pepito", "Ricar") },
    ];

    expect(assignCourtsInChunk(chunk, 1, 2, anchor.id)).toEqual([1, 2]);
    expect(assignCourtsInChunk(chunk, 2, 2, anchor.id)).toEqual([2, 1]);
    expect(assignCourtsInChunk(chunk, 3, 2, anchor.id)).toEqual([1, 2]);
  });

  test("fixed pair alternates courts with 4 pairs and 2 courts", () => {
    const pairs = [
      makePair("1", "Devyl", "Duran"),
      makePair("2", "Nevyl", "Marlon"),
      makePair("3", "Ferro", "Panchito"),
      makePair("4", "pepito", "Ricar"),
    ];

    const schedule = generateCircleRoundRobinSchedule(pairs, 2);
    const fixedCourts = schedule
      .filter((m) => m.pair1.id === "1" || m.pair2.id === "1")
      .map((m) => m.court);

    expect(fixedCourts).toEqual([1, 2, 1]);
  });

  test("caps courts to simultaneous matches (3 matches never get Cancha 4)", () => {
    const a = makePair("a", "A1", "A2");
    const b = makePair("b", "B1", "B2");
    const c = makePair("c", "C1", "C2");
    const d = makePair("d", "D1", "D2");
    const e = makePair("e", "E1", "E2");
    const f = makePair("f", "F1", "F2");
    const chunk = [
      { pair1: a, pair2: b },
      { pair1: c, pair2: d },
      { pair1: e, pair2: f },
    ];
    // courts=4 but only 3 partidos → R2 debe ser 2,3,1 (no 2,3,4)
    expect(assignCourtsInChunk(chunk, 2, 4)).toEqual([2, 3, 1]);
    expect(Math.max(...assignCourtsInChunk(chunk, 3, 4))).toBeLessThanOrEqual(3);
  });

  test("does not rewrite in-range courts that differ from ideal (manual save)", () => {
    const pairs = [
      makePair("1", "Devyl", "Duran"),
      makePair("2", "Nevyl", "Marlon"),
      makePair("3", "Ferro", "Panchito"),
      makePair("4", "pepito", "Ricar"),
    ];

    const ideal = generateCircleRoundRobinSchedule(pairs, 2);
    const round1 = ideal.filter((m) => m.round === 1);
    expect(round1.length).toBe(2);
    const [a, b] = round1;
    // Intercambiar canchas a mano dentro del rango 1..2
    const manual: Match[] = [
      makeMatch("m1", a.round, b.court, a.pair1, a.pair2),
      makeMatch("m2", b.round, a.court, b.pair1, b.pair2),
    ];

    expect(findCourtRotationRepairs(pairs, 2, manual)).toEqual([]);
  });

  test("repairs courts outside simultaneous match count (Cancha 4 with 3 partidos)", () => {
    const pairs = [
      makePair("1", "Devyl", "Duran"),
      makePair("2", "Nevyl", "Marlon"),
      makePair("3", "Ferro", "Panchito"),
      makePair("4", "pepito", "Ricar"),
      makePair("5", "G1", "G2"),
      makePair("6", "H1", "H2"),
    ];
    const roundMatches: Match[] = [
      makeMatch("m1", 3, 1, pairs[0], pairs[1]),
      makeMatch("m2", 3, 3, pairs[2], pairs[3]),
      makeMatch("m3", 3, 4, pairs[4], pairs[5]),
    ];
    // Config 4 canchas pero solo 3 partidos → Cancha 4 es inválida en esa ronda.
    const repairs = findCourtRotationRepairs(pairs, 4, roundMatches);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].id).toBe("m3");
    expect(repairs[0].court).toBe(2);
  });

  test("null court (Por asignar) is never repaired / reassigned", () => {
    const pairs = [
      makePair("1", "Devyl", "Duran"),
      makePair("2", "Nevyl", "Marlon"),
      makePair("3", "Ferro", "Panchito"),
      makePair("4", "pepito", "Ricar"),
    ];
    const nullCourt: Match = {
      ...makeMatch("null-court", 1, 1, pairs[0], pairs[1]),
      court: null,
    };
    const repairs = findCourtRotationRepairs(pairs, 2, [nullCourt]);
    expect(repairs).toEqual([]);
  });
});
