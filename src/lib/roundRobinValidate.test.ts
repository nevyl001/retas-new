/**
 * @jest-environment jsdom
 */
import {
  REFERENCE_SCHEDULE_8x3,
  buildReferenceSchedule8x3,
  generateCircleRoundRobinSchedule,
  generateCircleRoundRobinScheduleDetailed,
  previewCircleRoundRobinSchedule,
} from "./circleRoundRobinSchedule";
import { validateSchedule } from "./roundRobinValidate";
import type { Pair } from "./database";

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

const REAL_NAMES_8 = [
  makePair("p-aron", "AronMer", "A"),
  makePair("p-austin", "AustinT", "B"),
  makePair("p-borto", "Bortoluci", "C"),
  makePair("p-chapa", "Chaparro", "D"),
  makePair("p-duran", "Duran", "E"),
  makePair("p-ferrito", "Ferrito", "F"),
  makePair("p-ferro", "Ferro", "G"),
  makePair("p-devyl", "Devyl", "H"),
];

function slotsFromSchedule(
  schedule: Array<{
    pair1: Pair;
    pair2: Pair;
    round: number;
    court: number;
  }>
) {
  return schedule.map((m) => ({
    pair1Id: m.pair1.id,
    pair2Id: m.pair2.id,
    round: m.round,
    court: m.court,
  }));
}

function restingByRound(
  schedule: ReturnType<typeof generateCircleRoundRobinSchedule>,
  pairs: Pair[]
): Map<number, string[]> {
  const byRound = new Map<number, typeof schedule>();
  for (const m of schedule) {
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  const out = new Map<number, string[]>();
  for (const [r, matches] of Array.from(byRound.entries())) {
    const playing = new Set<string>();
    for (const m of matches) {
      playing.add(m.pair1.id);
      playing.add(m.pair2.id);
    }
    out.set(
      r,
      pairs.filter((p) => !playing.has(p.id)).map((p) => p.id)
    );
  }
  return out;
}

describe("validateSchedule + reference 8×3", () => {
  test("el calendario de referencia pasa validateSchedule", () => {
    const schedule = buildReferenceSchedule8x3(REAL_NAMES_8, 42);
    expect(validateSchedule(slotsFromSchedule(schedule), REAL_NAMES_8, 3)).toEqual(
      []
    );
    expect(REFERENCE_SCHEDULE_8x3).toHaveLength(10);
    expect(REFERENCE_SCHEDULE_8x3[9]).toHaveLength(1);
  });

  test("28 partidos únicos; 7 partidos y 3 descansos por pareja", () => {
    const schedule = buildReferenceSchedule8x3(REAL_NAMES_8, 7);
    expect(schedule).toHaveLength(28);
    const plays = new Map<string, number>();
    for (const p of REAL_NAMES_8) plays.set(p.id, 0);
    for (const m of schedule) {
      plays.set(m.pair1.id, (plays.get(m.pair1.id) ?? 0) + 1);
      plays.set(m.pair2.id, (plays.get(m.pair2.id) ?? 0) + 1);
    }
    for (const p of REAL_NAMES_8) {
      expect(plays.get(p.id)).toBe(7);
    }
    const rests = restingByRound(schedule, REAL_NAMES_8);
    const restCount = new Map<string, number>();
    for (const p of REAL_NAMES_8) restCount.set(p.id, 0);
    for (const ids of Array.from(rests.values())) {
      for (const id of ids) restCount.set(id, (restCount.get(id) ?? 0) + 1);
    }
    for (const p of REAL_NAMES_8) {
      expect(restCount.get(p.id)).toBe(3);
    }
  });

  test("R1–R9 con 3 partidos; R10 con 1; sin pareja repetida; sin descansos consecutivos", () => {
    const schedule = generateCircleRoundRobinSchedule(REAL_NAMES_8, 3, {
      seed: 11,
    });
    expect(validateSchedule(slotsFromSchedule(schedule), REAL_NAMES_8, 3)).toEqual(
      []
    );
    const byRound = new Map<number, number>();
    for (const m of schedule) {
      byRound.set(m.round, (byRound.get(m.round) ?? 0) + 1);
    }
    for (let r = 1; r <= 9; r += 1) {
      expect(byRound.get(r)).toBe(3);
    }
    expect(byRound.get(10)).toBe(1);
    expect(byRound.size).toBe(10);

    // No debe aparecer el patrón 3-1-3-1
    const pattern = Array.from({ length: 10 }, (_, i) => byRound.get(i + 1) ?? 0);
    expect(pattern.join("-")).toBe("3-3-3-3-3-3-3-3-3-1");
  });

  test("misma semilla = mismo calendario; 20 semillas distintas son válidas", () => {
    const a = generateCircleRoundRobinSchedule(REAL_NAMES_8, 3, { seed: 99 });
    const b = generateCircleRoundRobinSchedule(REAL_NAMES_8, 3, { seed: 99 });
    expect(
      a.map((m) => `${m.round}:${m.pair1.id}:${m.pair2.id}:${m.court}`)
    ).toEqual(
      b.map((m) => `${m.round}:${m.pair1.id}:${m.pair2.id}:${m.court}`)
    );

    for (let seed = 1; seed <= 20; seed += 1) {
      const schedule = generateCircleRoundRobinSchedule(REAL_NAMES_8, 3, {
        seed,
        maxNodes: 200_000,
        maxMs: 2_000,
      });
      expect(
        validateSchedule(slotsFromSchedule(schedule), REAL_NAMES_8, 3)
      ).toEqual([]);
    }
  });

  test("funciona con nombres reales vía IDs (no usa nombres como clave)", () => {
    const schedule = generateCircleRoundRobinSchedule(REAL_NAMES_8, 3, {
      seed: 3,
    });
    const ids = new Set(REAL_NAMES_8.map((p) => p.id));
    for (const m of schedule) {
      expect(ids.has(m.pair1.id)).toBe(true);
      expect(ids.has(m.pair2.id)).toBe(true);
    }
    const rests = restingByRound(schedule, REAL_NAMES_8);
    // R10: 6 descansan (dato real, no hardcode de UI)
    expect(rests.get(10)?.length).toBe(6);
  });

  test("calendario inválido NO se considera persistible (preview con errores)", () => {
    const persistMock = jest.fn();
    const broken = [
      {
        pair1Id: "p-aron",
        pair2Id: "p-austin",
        round: 1,
        court: 1,
      },
    ];
    const errors = validateSchedule(broken, REAL_NAMES_8, 3);
    expect(errors.length).toBeGreaterThan(0);
    if (errors.length === 0) {
      persistMock();
    }
    expect(persistMock).not.toHaveBeenCalled();
  });

  test("config alternativa respeta límite de búsqueda y no bloquea", () => {
    const pairs6 = REAL_NAMES_8.slice(0, 6);
    const started = Date.now();
    const detailed = generateCircleRoundRobinScheduleDetailed(pairs6, 2, {
      seed: 5,
      maxNodes: 50_000,
      maxMs: 1_500,
      maxAttempts: 4,
    });
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(
      validateSchedule(slotsFromSchedule(detailed.schedule), pairs6, 2)
    ).toEqual([]);
    const byRound = new Map<number, number>();
    for (const m of detailed.schedule) {
      byRound.set(m.round, (byRound.get(m.round) ?? 0) + 1);
    }
    const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
    for (const r of rounds.slice(0, -1)) {
      expect(byRound.get(r)).toBe(2);
    }
  });

  test("preview no escribe; errores vacíos en 8×3", () => {
    const preview = previewCircleRoundRobinSchedule(REAL_NAMES_8, 3, {
      seed: 1,
    });
    expect(preview.errors).toEqual([]);
    expect(preview.schedule).toHaveLength(28);
  });
});
