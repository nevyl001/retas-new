import {
  findPartidoCourtSlotConflict,
  findConflictingPartidoIds,
  planCanchaChange,
  planProgramadoChange,
  PARTIDO_CANCHA_OCUPADA_MSG,
  assertPartidoCourtSlotAvailable,
} from "./partidoCourtSlotConflict";
import type { TorneoExpressPartido } from "./types";

function partido(
  id: string,
  overrides: Partial<TorneoExpressPartido> = {}
): TorneoExpressPartido {
  return {
    id,
    grupo_id: "g1",
    pareja_local_id: "p1",
    pareja_visitante_id: "p2",
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    created_at: "2026-08-24T14:00:00.000Z",
    programado_en: "2026-08-24T14:00:00.000Z",
    cancha: "Estadio",
    ...overrides,
  };
}

describe("partidoCourtSlotConflict", () => {
  it("detecta misma cancha y horario en otro partido", () => {
    const list = [
      partido("a"),
      partido("b", { pareja_local_id: "p3", pareja_visitante_id: "p4" }),
    ];
    expect(
      findPartidoCourtSlotConflict(
        "b",
        list[0]!.programado_en!,
        "Estadio",
        list
      )?.id
    ).toBe("a");
  });

  it("no marca conflicto si cambia la cancha", () => {
    const list = [partido("a"), partido("b")];
    expect(
      findPartidoCourtSlotConflict("b", list[0]!.programado_en!, "4", list)
    ).toBeNull();
  });

  it("normaliza cancha con prefijo Cancha", () => {
    const list = [partido("a", { cancha: "Estadio" }), partido("b")];
    expect(
      findPartidoCourtSlotConflict(
        "b",
        list[0]!.programado_en!,
        "Cancha Estadio",
        list
      )?.id
    ).toBe("a");
  });

  it("assertPartidoCourtSlotAvailable lanza mensaje claro", () => {
    const list = [partido("a"), partido("b")];
    expect(() =>
      assertPartidoCourtSlotAvailable(
        "b",
        list[0]!.programado_en!,
        "Estadio",
        list
      )
    ).toThrow(PARTIDO_CANCHA_OCUPADA_MSG);
  });

  it("findConflictingPartidoIds marca ambos partidos del choque", () => {
    const list = [partido("a"), partido("b"), partido("c", { cancha: "2" })];
    const ids = findConflictingPartidoIds(list);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
  });

  it("planCanchaChange intercambia si la cancha destino ya está usada", () => {
    const a = partido("a", { cancha: "1" });
    const b = partido("b", {
      cancha: "Estadio",
      pareja_local_id: "p3",
      pareja_visitante_id: "p4",
    });
    const plan = planCanchaChange(a, "Estadio", [a, b]);
    expect(plan).toEqual({
      kind: "swap",
      cancha: "Estadio",
      swapWithId: "b",
      swapCancha: "1",
    });
  });

  it("planCanchaChange update si la cancha está libre", () => {
    const a = partido("a", { cancha: "1" });
    const b = partido("b", {
      cancha: "Estadio",
      pareja_local_id: "p3",
      pareja_visitante_id: "p4",
    });
    expect(planCanchaChange(a, "2", [a, b])).toEqual({
      kind: "update",
      cancha: "2",
    });
  });

  it("planProgramadoChange propone swap si el horario+cancha está ocupado", () => {
    const a = partido("a", {
      cancha: "1",
      programado_en: "2026-08-24T15:30:00.000Z",
      pareja_local_id: "p1",
      pareja_visitante_id: "p2",
    });
    const b = partido("b", {
      cancha: "1",
      programado_en: "2026-08-24T14:00:00.000Z",
      pareja_local_id: "p3",
      pareja_visitante_id: "p4",
    });
    const plan = planProgramadoChange(a, b.programado_en!, [a, b]);
    expect(plan).toEqual({
      kind: "swap",
      programado_en: b.programado_en,
      swapWithId: "b",
      swapProgramadoEn: a.programado_en,
    });
  });

  it("planProgramadoChange update si el horario está libre en esa cancha", () => {
    const a = partido("a", {
      cancha: "1",
      programado_en: "2026-08-24T15:30:00.000Z",
    });
    const b = partido("b", {
      cancha: "Estadio",
      programado_en: "2026-08-24T14:00:00.000Z",
      pareja_local_id: "p3",
      pareja_visitante_id: "p4",
    });
    expect(
      planProgramadoChange(a, "2026-08-24T14:00:00.000Z", [a, b])
    ).toEqual({
      kind: "update",
      programado_en: "2026-08-24T14:00:00.000Z",
    });
  });
});
