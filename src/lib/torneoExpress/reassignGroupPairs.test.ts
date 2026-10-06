import { buildGroupReassignment } from "./reassignGroupPairs";
import { generateBalancedRoundRobin } from "./roundRobin";
import { mexicoScheduleSlotKey } from "./teScheduleTime";

const slots = [
  ["p1", "p2", "1", "2026-10-08T23:00:00.000Z"],
  ["p1", "p3", "1", "2026-10-09T00:00:00.000Z"],
  ["p2", "p3", "1", "2026-10-09T01:00:00.000Z"],
  ["p4", "p5", "2", "2026-10-08T23:00:00.000Z"],
  ["p4", "p6", "2", "2026-10-09T00:00:00.000Z"],
  ["p5", "p6", "2", "2026-10-09T01:00:00.000Z"],
] as const;

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
