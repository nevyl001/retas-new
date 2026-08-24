import {
  hasPairSameSlotConflict,
  reassignScheduleSlotsOnReorder,
} from "./reorderPartidosSlots";
import type { TorneoExpressPartido } from "./types";

function partido(
  id: string,
  overrides: Partial<TorneoExpressPartido> = {}
): TorneoExpressPartido {
  return {
    id,
    grupo_id: "g1",
    pareja_local_id: `${id}-l`,
    pareja_visitante_id: `${id}-v`,
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    created_at: "2026-08-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("reassignScheduleSlotsOnReorder", () => {
  it("el partido arrastrado ocupa horario y cancha del destino", () => {
    const list = [
      partido("a", {
        orden: 1,
        programado_en: "2026-08-24T14:30:00.000Z",
        cancha: "1",
      }),
      partido("b", {
        orden: 2,
        programado_en: "2026-08-24T14:30:00.000Z",
        cancha: "Estadio",
      }),
      partido("c", {
        orden: 3,
        programado_en: "2026-08-24T15:30:00.000Z",
        cancha: "1",
      }),
    ];

    const next = reassignScheduleSlotsOnReorder(list, 2, 0);
    expect(next.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(next[0]).toMatchObject({
      id: "c",
      programado_en: "2026-08-24T14:30:00.000Z",
      cancha: "1",
      orden: 1,
    });
    expect(next[1]).toMatchObject({
      id: "a",
      programado_en: "2026-08-24T14:30:00.000Z",
      cancha: "Estadio",
      orden: 2,
    });
    expect(next[2]).toMatchObject({
      id: "b",
      programado_en: "2026-08-24T15:30:00.000Z",
      cancha: "1",
      orden: 3,
    });
  });

  it("detecta pareja duplicada en el mismo horario", () => {
    const list = [
      partido("a", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "pepito",
        programado_en: "2026-08-24T14:30:00.000Z",
        cancha: "1",
      }),
      partido("b", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "devyl",
        programado_en: "2026-08-24T14:30:00.000Z",
        cancha: "Estadio",
      }),
    ];
    expect(hasPairSameSlotConflict(list)).toBe(true);
  });
});
