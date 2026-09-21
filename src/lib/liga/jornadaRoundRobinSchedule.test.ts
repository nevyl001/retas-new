import {
  buildPairOneFactorization,
  scheduleJornadaRoundRobin,
} from "./jornadaRoundRobinSchedule";

describe("jornadaRoundRobinSchedule", () => {
  test("6 parejas × 3 canchas: cada ronda llena las 3 canchas", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const schedule = scheduleJornadaRoundRobin(ids, 3);

    expect(schedule).toHaveLength(15); // C(6,2)

    const byRound = new Map<number, typeof schedule>();
    for (const m of schedule) {
      const list = byRound.get(m.ronda) ?? [];
      list.push(m);
      byRound.set(m.ronda, list);
    }

    // 5 rondas × 3 partidos
    expect(byRound.size).toBe(5);
    for (const roundMatches of Array.from(byRound.values())) {
      expect(roundMatches).toHaveLength(3);
      const courts = roundMatches.map((m) => m.cancha).sort();
      expect(courts).toEqual([1, 2, 3]);

      const playing = new Set<string>();
      for (const m of roundMatches) {
        expect(playing.has(m.p1)).toBe(false);
        expect(playing.has(m.p2)).toBe(false);
        playing.add(m.p1);
        playing.add(m.p2);
      }
      expect(playing.size).toBe(6);
    }

    // Todos los cruces únicos
    const keys = new Set(schedule.map((m) => [m.p1, m.p2].sort().join("|")));
    expect(keys.size).toBe(15);
  });

  test("1-factorización de 6 ids produce 5 rondas de 3", () => {
    const factors = buildPairOneFactorization(["a", "b", "c", "d", "e", "f"]);
    expect(factors).toHaveLength(5);
    for (const round of factors) {
      expect(round).toHaveLength(3);
    }
  });

  test("4 parejas × 3 canchas: 2 partidos por ronda (máx. físico)", () => {
    const schedule = scheduleJornadaRoundRobin(["a", "b", "c", "d"], 3);
    expect(schedule).toHaveLength(6);
    const byRound = new Map<number, number>();
    for (const m of schedule) {
      byRound.set(m.ronda, (byRound.get(m.ronda) ?? 0) + 1);
    }
    for (const count of Array.from(byRound.values())) {
      expect(count).toBe(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});
