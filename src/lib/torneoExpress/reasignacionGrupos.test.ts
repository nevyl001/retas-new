import { planReasignacion } from "./reasignacionGrupos";

const grupos = [
  { id: "ga", nombre: "Grupo A", orden: 1 },
  { id: "gb", nombre: "Grupo B", orden: 2 },
  { id: "gc", nombre: "Grupo C", orden: 3 },
];

const partidosPorGrupo = {
  ga: [
    {
      pareja_local_id: "a1",
      pareja_visitante_id: "a2",
      cancha: "1",
      programado_en: "2026-10-09T18:00:00.000Z",
    },
  ],
  gb: [],
  gc: [],
};

describe("planReasignacion", () => {
  it("no regenera nada si no hay cambios", () => {
    const current = new Map([
      ["gb", ["b1", "b2"]],
      ["gc", ["c1", "c2"]],
    ]);
    const result = planReasignacion({
      grupos,
      desired: new Map(current),
      current,
      partidosPorGrupo,
    });
    expect(result).toEqual({ ok: true, plan: null });
  });

  it("solo toca los grupos cuyo conjunto cambió, nunca el bloqueado", () => {
    const result = planReasignacion({
      grupos,
      current: new Map([
        ["gb", ["b1", "b2", "b3"]],
        ["gc", ["c1", "c2"]],
      ]),
      desired: new Map([
        ["gb", ["b1", "b2"]],
        ["gc", ["c1", "c2", "b3"]],
      ]),
      partidosPorGrupo,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.plan) throw new Error("sin plan");
    expect(result.plan.grupos.map((g) => g.grupoId)).toEqual(["gb", "gc"]);
    expect(result.plan.partidos.every((p) => p.grupoId !== "ga")).toBe(true);
    expect(result.plan.partidos.filter((p) => p.grupoId === "gb")).toHaveLength(1);
    expect(result.plan.partidos.filter((p) => p.grupoId === "gc")).toHaveLength(3);
  });

  it("mueve a la pareja sin resultado y conserva el cruce ya jugado", () => {
    const result = planReasignacion({
      grupos,
      current: new Map([
        ["ga", ["a1", "a2", "a3"]],
        ["gb", ["b1", "b2"]],
      ]),
      desired: new Map([
        ["ga", ["a1", "a2"]],
        ["gb", ["b1", "b2", "a3"]],
      ]),
      partidosPorGrupo: {
        ga: [
          {
            pareja_local_id: "a1",
            pareja_visitante_id: "a2",
            estado: "jugado",
            cancha: "1",
            programado_en: "2026-10-09T18:00:00.000Z",
          },
          {
            pareja_local_id: "a1",
            pareja_visitante_id: "a3",
            estado: "pendiente",
            cancha: "1",
            programado_en: "2026-10-09T19:00:00.000Z",
          },
        ],
        gb: [
          {
            pareja_local_id: "b1",
            pareja_visitante_id: "b2",
            estado: "pendiente",
            cancha: "2",
            programado_en: "2026-10-09T18:00:00.000Z",
          },
        ],
        gc: [],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.plan) throw new Error("sin plan");
    const deA = result.plan.partidos.filter((p) => p.grupoId === "ga");
    expect(deA).toHaveLength(0);
    const deB = result.plan.partidos.filter((p) => p.grupoId === "gb");
    expect(deB).toHaveLength(3);
    expect(
      deB.some(
        (p) =>
          p.pareja_local_id === "a1" || p.pareja_visitante_id === "a1"
      )
    ).toBe(false);
  });

  it("rechaza dejar un grupo con menos de 2 parejas", () => {
    const result = planReasignacion({
      grupos,
      current: new Map([
        ["gb", ["b1", "b2"]],
        ["gc", ["c1", "c2"]],
      ]),
      desired: new Map([
        ["gb", ["b1"]],
        ["gc", ["c1", "c2", "b2"]],
      ]),
      partidosPorGrupo,
    });
    expect(result.ok).toBe(false);
  });
});
