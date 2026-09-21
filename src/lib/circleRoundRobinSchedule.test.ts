import {
  assignCourtsInChunk,
  generateCircleRoundRobinSchedule,
  generateTeamsCrossSchedule,
  findCourtRotationRepairs,
  selectPlayingPairsForRound,
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

describe("teams cross schedule rest rotation", () => {
  test("selectPlayingPairsForRound rotates who sits out", () => {
    const team = [
      makePair("a0", "A0", "A0b"),
      makePair("a1", "A1", "A1b"),
      makePair("a2", "A2", "A2b"),
      makePair("a3", "A3", "A3b"),
    ];

    expect(selectPlayingPairsForRound(team, 3, 0).map((p) => p.id)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
    expect(selectPlayingPairsForRound(team, 3, 1).map((p) => p.id)).toEqual([
      "a0",
      "a2",
      "a3",
    ]);
    expect(selectPlayingPairsForRound(team, 3, 2).map((p) => p.id)).toEqual([
      "a0",
      "a1",
      "a3",
    ]);
    expect(selectPlayingPairsForRound(team, 3, 3).map((p) => p.id)).toEqual([
      "a0",
      "a1",
      "a2",
    ]);
  });

  test("with 4 pairs/team and 3 courts, covers all cross matchups and rotates rest", () => {
    const team0 = [
      makePair("a0", "A0", "A0b"),
      makePair("a1", "A1", "A1b"),
      makePair("a2", "A2", "A2b"),
      makePair("a3", "A3", "A3b"),
    ];
    const team1 = [
      makePair("b0", "B0", "B0b"),
      makePair("b1", "B1", "B1b"),
      makePair("b2", "B2", "B2b"),
      makePair("b3", "B3", "B3b"),
    ];
    const team0Ids = new Set(team0.map((p) => p.id));
    const team1Ids = new Set(team1.map((p) => p.id));

    const schedule = generateTeamsCrossSchedule(team0, team1, 3);

    // Todas las parejas de un equipo vs todas las del otro.
    const matchups = new Set(
      schedule.map((m) => `${m.pair1.id}|${m.pair2.id}`)
    );
    expect(matchups.size).toBe(16);
    for (const a of team0) {
      for (const b of team1) {
        expect(matchups.has(`${a.id}|${b.id}`)).toBe(true);
      }
    }

    const byRound = new Map<number, typeof schedule>();
    for (const m of schedule) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }

    const restersByRound0: string[][] = [];
    const restersByRound1: string[][] = [];

    for (const round of Array.from(byRound.keys()).sort((a, b) => a - b)) {
      const roundMatches = byRound.get(round)!;
      expect(roundMatches.length).toBeLessThanOrEqual(3);
      expect(roundMatches.length).toBeGreaterThan(0);

      const playing = new Set<string>();
      for (const m of roundMatches) {
        expect(playing.has(m.pair1.id)).toBe(false);
        expect(playing.has(m.pair2.id)).toBe(false);
        playing.add(m.pair1.id);
        playing.add(m.pair2.id);
        expect(team0Ids.has(m.pair1.id)).toBe(true);
        expect(team1Ids.has(m.pair2.id)).toBe(true);
      }

      restersByRound0.push(
        team0.filter((p) => !playing.has(p.id)).map((p) => p.id)
      );
      restersByRound1.push(
        team1.filter((p) => !playing.has(p.id)).map((p) => p.id)
      );
    }

    // En rondas llenas (3 partidos), exactamente 1 pareja por equipo descansa
    // y no se repite el mismo descanso en la ronda siguiente.
    for (let i = 0; i < restersByRound0.length; i += 1) {
      const roundMatches = byRound.get(i + 1)!;
      if (roundMatches.length < 3) continue;
      expect(restersByRound0[i]).toHaveLength(1);
      expect(restersByRound1[i]).toHaveLength(1);
      if (i > 0 && byRound.get(i)!.length === 3) {
        expect(restersByRound0[i][0]).not.toBe(restersByRound0[i - 1][0]);
        expect(restersByRound1[i][0]).not.toBe(restersByRound1[i - 1][0]);
      }
    }
  });
});
