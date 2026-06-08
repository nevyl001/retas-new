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

  test("detects stale court assignment from old algorithm", () => {
    const pairs = [
      makePair("1", "Devyl", "Duran"),
      makePair("2", "Nevyl", "Marlon"),
      makePair("3", "Ferro", "Panchito"),
      makePair("4", "pepito", "Ricar"),
    ];

    const ideal = generateCircleRoundRobinSchedule(pairs, 2);
    const staleMatches: Match[] = [];
    const byRound = new Map<number, typeof ideal>();
    ideal.forEach((m) => {
      if (!byRound.has(m.round)) {
        byRound.set(m.round, []);
      }
      byRound.get(m.round)!.push(m);
    });

    let idx = 0;
    byRound.forEach((roundMatches) => {
      roundMatches.forEach((m, k) => {
        staleMatches.push(
          makeMatch(`m${idx++}`, m.round, k + 1, m.pair1, m.pair2)
        );
      });
    });

    const repairs = findCourtRotationRepairs(pairs, 2, staleMatches);
    expect(repairs.length).toBeGreaterThan(0);
    expect(repairs.some((r) => r.court === 2)).toBe(true);
  });
});
