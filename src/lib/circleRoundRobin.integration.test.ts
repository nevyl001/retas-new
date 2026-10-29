/**
 * @jest-environment jsdom
 *
 * Integración real del generador 8×3 (sin escritura a Supabase).
 */
import {
  buildReferenceSchedule8x3,
  generateCircleRoundRobinSchedule,
  generateCircleRoundRobinScheduleDetailed,
  previewCircleRoundRobinSchedule,
  validateSchedule,
} from "./circleRoundRobinSchedule";
import type { Pair } from "./database";

function uuidPair(
  id: string,
  player1_name: string,
  player2_name: string
): Pair {
  return {
    id,
    tournament_id: "11111111-1111-4111-8111-111111111111",
    player1_id: `22222222-2222-4222-8222-${id.slice(0, 12)}`,
    player2_id: `33333333-3333-4333-8333-${id.slice(0, 12)}`,
    player1_name,
    player2_name,
    created_at: "2026-10-29T00:00:00.000Z",
  };
}

const UUID_PAIRS_8: Pair[] = [
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "AronMer", "Socio A"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "AustinT", "Socio B"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "Bortoluci", "Socio C"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", "Chaparro", "Socio D"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", "Duran", "Socio E"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6", "Ferrito", "Socio F"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7", "Ferro", "Socio G"),
  uuidPair("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8", "Devyl", "Socio H"),
];

function slots(
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

function restingIds(
  schedule: ReturnType<typeof generateCircleRoundRobinSchedule>,
  pairs: Pair[],
  round: number
): string[] {
  const playing = new Set<string>();
  for (const m of schedule.filter((x) => x.round === round)) {
    playing.add(m.pair1.id);
    playing.add(m.pair2.id);
  }
  return pairs.filter((p) => !playing.has(p.id)).map((p) => p.id);
}

describe("integración Round Robin 8 parejas × 3 canchas", () => {
  test("28 partidos únicos en 10 rondas 3-3-3-3-3-3-3-3-3-1, 3 descansos, sin consecutivos", () => {
    const schedule = generateCircleRoundRobinSchedule(UUID_PAIRS_8, 3, {
      seed: 20261029,
      maxNodes: 200_000,
      maxMs: 2_000,
    });

    expect(schedule).toHaveLength(28);
    expect(validateSchedule(slots(schedule), UUID_PAIRS_8, 3)).toEqual([]);

    const byRound = new Map<number, number>();
    for (const m of schedule) {
      byRound.set(m.round, (byRound.get(m.round) ?? 0) + 1);
    }
    const pattern = Array.from({ length: 10 }, (_, i) => byRound.get(i + 1) ?? 0);
    expect(pattern.join("-")).toBe("3-3-3-3-3-3-3-3-3-1");
    expect(pattern.join("-")).not.toMatch(/3-1-3-1/);

    const restCount = new Map<string, number>();
    for (const p of UUID_PAIRS_8) restCount.set(p.id, 0);
    for (let r = 1; r <= 10; r += 1) {
      for (const id of restingIds(schedule, UUID_PAIRS_8, r)) {
        restCount.set(id, (restCount.get(id) ?? 0) + 1);
      }
    }
    for (const p of UUID_PAIRS_8) {
      expect(restCount.get(p.id)).toBe(3);
    }

    for (let r = 1; r <= 9; r += 1) {
      const a = new Set(restingIds(schedule, UUID_PAIRS_8, r));
      for (const id of restingIds(schedule, UUID_PAIRS_8, r + 1)) {
        expect(a.has(id)).toBe(false);
      }
    }

    const r9 = new Set(restingIds(schedule, UUID_PAIRS_8, 9));
    const r10 = schedule.filter((m) => m.round === 10);
    expect(r10).toHaveLength(1);
    expect(r9.has(r10[0].pair1.id)).toBe(true);
    expect(r9.has(r10[0].pair2.id)).toBe(true);
    expect(restingIds(schedule, UUID_PAIRS_8, 10)).toHaveLength(6);
  });

  test("fallback de referencia con UUID y nombres reales", () => {
    const schedule = buildReferenceSchedule8x3(UUID_PAIRS_8, 77);
    expect(validateSchedule(slots(schedule), UUID_PAIRS_8, 3)).toEqual([]);

    for (const m of schedule) {
      expect(m.pair1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(m.pair2.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(m.pair1.player1_name.length).toBeGreaterThan(0);
      expect(m.pair2.player1_name.length).toBeGreaterThan(0);
    }

    // Forzar fallback: maxNodes=0 hace fallar el backtracking.
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const forced = generateCircleRoundRobinScheduleDetailed(UUID_PAIRS_8, 3, {
      seed: 55,
      maxNodes: 0,
      maxMs: 1,
      maxAttempts: 1,
    });
    expect(forced.usedFallback).toBe(true);
    expect(validateSchedule(slots(forced.schedule), UUID_PAIRS_8, 3)).toEqual(
      []
    );
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  test("preview válido no implica escritura (solo estructura en memoria)", () => {
    const preview = previewCircleRoundRobinSchedule(UUID_PAIRS_8, 3, {
      seed: 1,
    });
    expect(preview.errors).toEqual([]);
    expect(preview.schedule).toHaveLength(28);
  });
});
