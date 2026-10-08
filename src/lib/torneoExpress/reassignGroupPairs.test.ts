import { buildGroupReassignment } from "./reassignGroupPairs";
import { generateBalancedRoundRobin, unorderedMatchupKey } from "./roundRobin";
import { mexicoScheduleSlotKey, programadoIsoFromMexicoCalendar } from "./teScheduleTime";

const slots = [
  ["p1", "p2", "1", "2026-10-08T23:00:00.000Z"],
  ["p1", "p3", "1", "2026-10-09T00:00:00.000Z"],
  ["p2", "p3", "1", "2026-10-09T01:00:00.000Z"],
  ["p4", "p5", "2", "2026-10-08T23:00:00.000Z"],
  ["p4", "p6", "2", "2026-10-09T00:00:00.000Z"],
  ["p5", "p6", "2", "2026-10-09T01:00:00.000Z"],
] as const;

function assertNoSqlCollision(
  partidos: Array<{
    programado_en: string;
    cancha: string;
    pareja_local_id: string;
    pareja_visitante_id: string;
  }>
) {
  const keys = partidos.map((match) => ({
    slot: mexicoScheduleSlotKey(match.programado_en),
    cancha: match.cancha,
    local: match.pareja_local_id,
    visit: match.pareja_visitante_id,
  }));
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i]!;
      const b = keys[j]!;
      if (a.slot !== b.slot) continue;
      const shared =
        a.local === b.local ||
        a.local === b.visit ||
        a.visit === b.local ||
        a.visit === b.visit;
      expect(shared || a.cancha === b.cancha).toBe(false);
    }
  }
}

function existentes() {
  return slots.map(([localId, visitanteId, cancha, programadoEn]) => ({
    localId,
    visitanteId,
    cancha,
    programadoEn,
  }));
}

describe("buildGroupReassignment", () => {
  it("conserva el horario del partido que sigue con las mismas parejas", () => {
    const result = buildGroupReassignment({
      grupos: [
        { orden: 1, nombre: "Grupo A", parejaIds: ["p2", "p3"] },
        { orden: 2, nombre: "Grupo B", parejaIds: ["p4", "p5", "p6", "p1"] },
      ],
      existentes: existentes(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kept = result.payload.partidos.find(
      (match) =>
        match.pareja_local_id === "p2" && match.pareja_visitante_id === "p3"
    );
    const engine = generateBalancedRoundRobin(["p2", "p3"])[0]!;
    expect(kept).toMatchObject({
      grupo_orden: 1,
      ronda: engine.ronda,
      orden: engine.orden,
      cancha: "1",
      programado_en: "2026-10-09T01:00:00.000Z",
    });
    expect(result.payload.partidos).toHaveLength(1 + 6);
    const keys = result.payload.partidos.map((match) => ({
      slot: mexicoScheduleSlotKey(match.programado_en),
      cancha: match.cancha,
      local: match.pareja_local_id,
      visit: match.pareja_visitante_id,
    }));
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = keys[i]!;
        const b = keys[j]!;
        if (a.slot !== b.slot) continue;
        const shared =
          a.local === b.local ||
          a.local === b.visit ||
          a.visit === b.local ||
          a.visit === b.visit;
        expect(shared || a.cancha === b.cancha).toBe(false);
      }
    }
  });

  it("intercambia una pareja entre dos grupos de tres y rearma el round robin", () => {
    const groups = [
      { orden: 1, nombre: "Grupo A", parejaIds: ["a1", "a2", "a3"] },
      { orden: 2, nombre: "Grupo B", parejaIds: ["b1", "b2", "b3"] },
      { orden: 3, nombre: "Grupo C", parejaIds: ["c1", "c2", "c3"] },
      { orden: 4, nombre: "Grupo D", parejaIds: ["d1", "d2", "d3"] },
    ];
    const existentes = groups.flatMap((grupo) =>
      generateBalancedRoundRobin(grupo.parejaIds).map((match, index) => ({
        localId: match.localId,
        visitanteId: match.visitanteId,
        cancha: String(grupo.orden),
        programadoEn: programadoIsoFromMexicoCalendar(
          "2026-10-06",
          `${17 + index}:00`
        ),
      }))
    );
    const swapped = groups.map((grupo) => {
      if (grupo.orden === 1) return { ...grupo, parejaIds: ["a1", "a2", "c3"] };
      if (grupo.orden === 3) return { ...grupo, parejaIds: ["a3", "c1", "c2"] };
      return grupo;
    });
    const result = buildGroupReassignment({ grupos: swapped, existentes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.partidos).toHaveLength(12);
    for (const grupo of swapped) {
      const engine = generateBalancedRoundRobin(grupo.parejaIds);
      const rows = result.payload.partidos.filter(
        (match) => match.grupo_orden === grupo.orden
      );
      expect(rows).toHaveLength(engine.length);
      for (const expected of engine) {
        expect(rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              pareja_local_id: expected.localId,
              pareja_visitante_id: expected.visitanteId,
              ronda: expected.ronda,
              orden: expected.orden,
            }),
          ])
        );
      }
    }
    const kept = result.payload.partidos.find(
      (match) =>
        unorderedMatchupKey(match.pareja_local_id, match.pareja_visitante_id) ===
        unorderedMatchupKey("a1", "a2")
    );
    expect(kept?.programado_en).toBe(
      programadoIsoFromMexicoCalendar("2026-10-06", "19:00")
    );
    assertNoSqlCollision(result.payload.partidos);
  });

  it("guarda el cambio aunque los partidos sigan por programar", () => {
    const result = buildGroupReassignment({
      grupos: [
        { orden: 1, nombre: "Grupo A", parejaIds: ["a1", "a2", "c3"] },
        { orden: 2, nombre: "Grupo B", parejaIds: ["b1", "b2", "b3"] },
        { orden: 3, nombre: "Grupo C", parejaIds: ["a3", "c1", "c2"] },
      ],
      existentes: [
        {
          localId: "a1",
          visitanteId: "a2",
          cancha: null,
          programadoEn: null,
        },
      ],
      anchorIso: "2026-10-08T22:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.partidos).toHaveLength(3 + 3 + 3);
    expect(result.payload.partidos.every((match) => match.cancha && match.programado_en)).toBe(
      true
    );
    assertNoSqlCollision(result.payload.partidos);
  });

  it("manda el orden de grupo desde 1 aunque los grupos empiecen en 0", () => {
    const result = buildGroupReassignment({
      grupos: [
        { orden: 0, nombre: "Grupo A", parejaIds: ["p2", "p3"] },
        { orden: 1, nombre: "Grupo B", parejaIds: ["p4", "p5", "p6", "p1"] },
      ],
      existentes: existentes(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.grupos.map((grupo) => grupo.orden)).toEqual([1, 2]);
    const ordenes = new Set(result.payload.partidos.map((m) => m.grupo_orden));
    expect(Array.from(ordenes).sort()).toEqual([1, 2]);
    const kept = result.payload.partidos.find(
      (match) =>
        match.pareja_local_id === "p2" && match.pareja_visitante_id === "p3"
    );
    expect(kept).toMatchObject({
      grupo_orden: 1,
      cancha: "1",
      programado_en: "2026-10-09T01:00:00.000Z",
    });
  });

  it("rechaza un grupo con una sola pareja", () => {
    const result = buildGroupReassignment({
      grupos: [
        { orden: 1, nombre: "Grupo A", parejaIds: ["p1"] },
        { orden: 2, nombre: "Grupo B", parejaIds: ["p2", "p3"] },
      ],
      existentes: existentes(),
    });
    expect(result).toEqual({
      ok: false,
      error: "Grupo A necesita al menos 2 parejas.",
    });
  });
});

describe("buildGroupReassignment con partidos fijos", () => {
  it("no empalma partidos nuevos con los de grupos que no se tocan", () => {
    const slot = "2026-10-09T18:00:00.000Z";
    const result = buildGroupReassignment({
      grupos: [{ orden: 2, nombre: "B", parejaIds: ["b1", "b2"] }],
      existentes: [
        { localId: "b1", visitanteId: "b2", cancha: "1", programadoEn: slot },
      ],
      fixed: [{ localId: "a1", visitanteId: "a2", cancha: "1", programadoEn: slot }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.partidos).toHaveLength(1);
    const [partido] = result.payload.partidos;
    const same =
      partido.cancha === "1" &&
      new Date(partido.programado_en).getTime() === new Date(slot).getTime();
    expect(same).toBe(false);
  });
});
