import {
  dedupePartidosExpress,
  expectedMatchCount,
  generateBalancedRoundRobin,
  sortPartidosByOrden,
} from "./roundRobin";

describe("generateBalancedRoundRobin", () => {
  it("genera 6 partidos en 3 rondas para 4 parejas", () => {
    const ids = ["A", "B", "C", "D"];
    const matches = generateBalancedRoundRobin(ids);
    expect(matches).toHaveLength(6);
    expect(expectedMatchCount(4)).toBe(6);

    const rondas = new Map<number, typeof matches>();
    matches.forEach((m) => {
      const list = rondas.get(m.ronda) ?? [];
      list.push(m);
      rondas.set(m.ronda, list);
    });
    expect(rondas.size).toBe(3);
    expect(rondas.get(1)?.length).toBe(2);
    expect(rondas.get(2)?.length).toBe(2);
    expect(rondas.get(3)?.length).toBe(2);
  });

  it("ronda 1 enfrenta extremos del círculo (A-D y B-C)", () => {
    const ids = ["A", "B", "C", "D"];
    const r1 = generateBalancedRoundRobin(ids).filter((m) => m.ronda === 1);
    const pairs = r1.map((m) =>
      [m.localId, m.visitanteId].sort().join("|")
    );
    expect(pairs).toContain("A|D");
    expect(pairs).toContain("B|C");
  });

  it("ninguna pareja aparece dos veces en la misma ronda", () => {
    const ids = ["A", "B", "C", "D", "E", "F"];
    const matches = generateBalancedRoundRobin(ids);
    const byRonda = new Map<number, string[]>();
    matches.forEach((m) => {
      const used = byRonda.get(m.ronda) ?? [];
      expect(used).not.toContain(m.localId);
      expect(used).not.toContain(m.visitanteId);
      byRonda.set(m.ronda, [...used, m.localId, m.visitanteId]);
    });
  });

  it("cada pareja se enfrenta exactamente una vez", () => {
    const ids = ["A", "B", "C", "D"];
    const seen = new Set<string>();
    generateBalancedRoundRobin(ids).forEach((m) => {
      const key = [m.localId, m.visitanteId].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
    expect(seen.size).toBe(6);
  });
});

describe("dedupePartidosExpress", () => {
  const base = {
    grupo_id: "g1",
    ganador_id: null,
    estado: "pendiente" as const,
    puntos_local: null,
    puntos_visitante: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("deja un solo partido por enfrentamiento", () => {
    const list = [
      {
        ...base,
        id: "p1",
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        orden: 1,
        ronda: 1,
      },
      {
        ...base,
        id: "p2",
        pareja_local_id: "b",
        pareja_visitante_id: "a",
        orden: 2,
        ronda: 2,
      },
    ];
    expect(dedupePartidosExpress(list)).toHaveLength(1);
  });
});

describe("sortPartidosByOrden", () => {
  it("ordena por horario programado (no solo por orden)", () => {
    const list = [
      {
        id: "late",
        grupo_id: "g",
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        puntos_local: null,
        puntos_visitante: null,
        ganador_id: null,
        estado: "pendiente" as const,
        orden: 1,
        ronda: 1,
        cancha: "1",
        programado_en: "2026-08-24T16:30:00.000Z",
        created_at: "2026-08-24T12:00:00.000Z",
      },
      {
        id: "early",
        grupo_id: "g",
        pareja_local_id: "c",
        pareja_visitante_id: "d",
        puntos_local: null,
        puntos_visitante: null,
        ganador_id: null,
        estado: "pendiente" as const,
        orden: 2,
        ronda: 2,
        cancha: "Estadio",
        programado_en: "2026-08-24T14:30:00.000Z",
        created_at: "2026-08-24T12:00:00.000Z",
      },
      {
        id: "mid",
        grupo_id: "g",
        pareja_local_id: "e",
        pareja_visitante_id: "f",
        puntos_local: null,
        puntos_visitante: null,
        ganador_id: null,
        estado: "pendiente" as const,
        orden: 3,
        ronda: 1,
        cancha: "Estadio",
        programado_en: "2026-08-24T14:30:00.000Z",
        created_at: "2026-08-24T12:00:00.000Z",
      },
    ];
    const sorted = sortPartidosByOrden(list);
    expect(sorted.map((p) => p.id)).toEqual(["early", "mid", "late"]);
  });
});
