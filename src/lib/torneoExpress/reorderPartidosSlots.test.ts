import {
  findPairSameSlotConflictDetails,
  formatPairSameSlotConflictMessage,
  hasPairSameSlotConflict,
  reassignScheduleSlotsOnReorder,
} from "./reorderPartidosSlots";
import { programadoIsoFromMexicoCalendar } from "./teScheduleTime";
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

const iso0800 = programadoIsoFromMexicoCalendar("2026-08-24", "08:00")!;
const iso0900 = programadoIsoFromMexicoCalendar("2026-08-24", "09:00")!;

describe("reassignScheduleSlotsOnReorder", () => {
  it("el partido arrastrado ocupa horario y cancha del destino", () => {
    const list = [
      partido("a", {
        orden: 1,
        programado_en: iso0800,
        cancha: "1",
      }),
      partido("b", {
        orden: 2,
        programado_en: iso0800,
        cancha: "Estadio",
      }),
      partido("c", {
        orden: 3,
        programado_en: iso0900,
        cancha: "1",
      }),
    ];

    const next = reassignScheduleSlotsOnReorder(list, 2, 0);
    expect(next.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(next[0]).toMatchObject({
      id: "c",
      programado_en: iso0800,
      cancha: "1",
      orden: 1,
    });
    expect(next[1]).toMatchObject({
      id: "a",
      programado_en: iso0800,
      cancha: "Estadio",
      orden: 2,
    });
    expect(next[2]).toMatchObject({
      id: "b",
      programado_en: iso0900,
      cancha: "1",
      orden: 3,
    });
  });

  it("detecta pareja duplicada en el mismo horario", () => {
    const list = [
      partido("a", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "pepito",
        programado_en: iso0800,
        cancha: "1",
      }),
      partido("b", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "devyl",
        programado_en: iso0800,
        cancha: "Estadio",
      }),
    ];
    expect(hasPairSameSlotConflict(list)).toBe(true);
    expect(findPairSameSlotConflictDetails(list)).toEqual({
      partidoIds: expect.arrayContaining(["a", "b"]),
      pairIds: ["lalo"],
    });
  });

  it("mensaje con nombre de la pareja en conflicto", () => {
    const msg = formatPairSameSlotConflictMessage(
      ["ferrito"],
      new Map([["ferrito", "Ferrito / Duran"]])
    );
    expect(msg).toBe(
      "Ferrito / Duran ya juega a esa hora. Elige otro lugar."
    );
  });
});
