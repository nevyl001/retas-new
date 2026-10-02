import {
  findPairSameSlotConflictDetails,
  formatPairSameSlotConflictMessage,
  hasPairSameSlotConflict,
  reassignScheduleSlotsOnReorder,
  reorderCreatesCourtConflict,
} from "./reorderPartidosSlots";
import {
  mexicoScheduleSlotKey,
  partidoTimeInputValue24,
  programadoIsoFromMexicoCalendar,
} from "./teScheduleTime";
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

const iso0900 = programadoIsoFromMexicoCalendar("2026-10-03", "09:00")!;
const iso0930 = programadoIsoFromMexicoCalendar("2026-10-03", "09:30")!;
const iso1000 = programadoIsoFromMexicoCalendar("2026-10-03", "10:00")!;

describe("reassignScheduleSlotsOnReorder", () => {
  it("el partido arrastrado al primero abre la jornada y el resto se recorre", () => {
    const list = [
      partido("a", {
        orden: 1,
        programado_en: iso0900,
        cancha: "Cancha 1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido("b", {
        orden: 2,
        programado_en: iso0900,
        cancha: "Cancha 3",
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
      partido("c", {
        orden: 3,
        programado_en: iso0930,
        cancha: "Cancha 1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
      }),
    ];

    const next = reassignScheduleSlotsOnReorder(list, 2, 0);
    expect(next.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(partidoTimeInputValue24(next[0]!.programado_en!)).toBe("09:00");
    expect(next[0]!.cancha).toBe("Cancha 1");
    expect(partidoTimeInputValue24(next[1]!.programado_en!)).toBe("09:30");
    expect(hasPairSameSlotConflict(next)).toBe(false);
  });

  it("respeta canchas de otros grupos y elige huecos libres", () => {
    // Grupo A usa 1+3 a las 9:00 y 2+4 a las 9:30 (patrón intercalado).
    const groupA = [
      partido("a1", {
        grupo_id: "A",
        orden: 1,
        programado_en: iso0900,
        cancha: "Cancha 1",
        pareja_local_id: "a-p1",
        pareja_visitante_id: "a-p2",
      }),
      partido("a2", {
        grupo_id: "A",
        orden: 2,
        programado_en: iso0900,
        cancha: "Cancha 3",
        pareja_local_id: "a-p3",
        pareja_visitante_id: "a-p4",
      }),
      partido("a3", {
        grupo_id: "A",
        orden: 3,
        programado_en: iso0930,
        cancha: "Cancha 2",
        pareja_local_id: "a-p1",
        pareja_visitante_id: "a-p3",
      }),
      partido("a4", {
        grupo_id: "A",
        orden: 4,
        programado_en: iso0930,
        cancha: "Cancha 4",
        pareja_local_id: "a-p2",
        pareja_visitante_id: "a-p4",
      }),
      partido("a5", {
        grupo_id: "A",
        orden: 5,
        programado_en: iso1000,
        cancha: "Cancha 1",
        pareja_local_id: "a-p1",
        pareja_visitante_id: "a-p4",
      }),
      partido("a6", {
        grupo_id: "A",
        orden: 6,
        programado_en: iso1000,
        cancha: "Cancha 3",
        pareja_local_id: "a-p2",
        pareja_visitante_id: "a-p3",
      }),
    ];

    // Grupo B ocupa 2+4 a las 9:00 y 1+3 a las 9:30.
    const groupB = [
      partido("b1", {
        grupo_id: "B",
        programado_en: iso0900,
        cancha: "Cancha 2",
        pareja_local_id: "b-p1",
        pareja_visitante_id: "b-p2",
      }),
      partido("b2", {
        grupo_id: "B",
        programado_en: iso0900,
        cancha: "Cancha 4",
        pareja_local_id: "b-p3",
        pareja_visitante_id: "b-p4",
      }),
      partido("b3", {
        grupo_id: "B",
        programado_en: iso0930,
        cancha: "Cancha 1",
        pareja_local_id: "b-p1",
        pareja_visitante_id: "b-p3",
      }),
      partido("b4", {
        grupo_id: "B",
        programado_en: iso0930,
        cancha: "Cancha 3",
        pareja_local_id: "b-p2",
        pareja_visitante_id: "b-p4",
      }),
    ];

    // Mover a6 al primero: debe reorganizar sin pisar canchas de B.
    const next = reassignScheduleSlotsOnReorder(groupA, 5, 0, {
      externalPartidos: groupB,
    });

    expect(next[0]!.id).toBe("a6");
    expect(partidoTimeInputValue24(next[0]!.programado_en!)).toBe("09:00");
    expect(hasPairSameSlotConflict(next)).toBe(false);
    expect(reorderCreatesCourtConflict(next, groupB)).toBe(false);

    const at0930 = next.filter(
      (p) =>
        mexicoScheduleSlotKey(p.programado_en!) ===
        mexicoScheduleSlotKey(iso0930)
    );
    expect(at0930.length).toBeGreaterThan(0);
    for (const p of at0930) {
      expect(["Cancha 2", "Cancha 4"]).toContain(p.cancha);
    }
  });

  it("detecta pareja duplicada en el mismo horario", () => {
    const list = [
      partido("a", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "pepito",
        programado_en: iso0900,
        cancha: "1",
      }),
      partido("b", {
        pareja_local_id: "lalo",
        pareja_visitante_id: "devyl",
        programado_en: iso0900,
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

  it("sin horarios solo actualiza el orden de identidades", () => {
    const list = [
      partido("a", {
        orden: 1,
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido("b", {
        orden: 2,
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
    ];
    const next = reassignScheduleSlotsOnReorder(list, 1, 0);
    expect(next.map((p) => p.id)).toEqual(["b", "a"]);
    expect(next.map((p) => p.orden)).toEqual([1, 2]);
  });
});
