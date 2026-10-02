import {
  findPairSameSlotConflictDetails,
  formatPairSameSlotConflictMessage,
  hasPairSameSlotConflict,
  reassignScheduleSlotsOnReorder,
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

const iso0800 = programadoIsoFromMexicoCalendar("2026-08-24", "08:00")!;
const iso0830 = programadoIsoFromMexicoCalendar("2026-08-24", "08:30")!;

describe("reassignScheduleSlotsOnReorder", () => {
  it("el partido arrastrado al primero abre la jornada y el resto se recorre", () => {
    const list = [
      partido("a", {
        orden: 1,
        programado_en: iso0800,
        cancha: "1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido("b", {
        orden: 2,
        programado_en: iso0800,
        cancha: "3",
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
      partido("c", {
        orden: 3,
        programado_en: iso0830,
        cancha: "1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
      }),
    ];

    // Mover c (comparte p1 con a) al primer lugar: no puede compartir 08:00 con a.
    const next = reassignScheduleSlotsOnReorder(list, 2, 0);
    expect(next.map((p) => p.id)).toEqual(["c", "a", "b"]);
    expect(partidoTimeInputValue24(next[0]!.programado_en!)).toBe("08:00");
    expect(next[0]!.cancha).toBe("1");

    // a y b no comparten parejas: pueden ir en paralelo en el siguiente hueco
    // o a puede ir a 08:00 con c si no comparten — c tiene p1/p3, a tiene p1/p2 → conflicto.
    // a debe correrse.
    expect(partidoTimeInputValue24(next[1]!.programado_en!)).toBe("08:30");
    expect(hasPairSameSlotConflict(next)).toBe(false);
  });

  it("pone el partido en primer horario y reorganiza sin conflicto de pareja", () => {
    const list = [
      partido("m1", {
        orden: 1,
        programado_en: iso0800,
        cancha: "1",
        pareja_local_id: "emiliano",
        pareja_visitante_id: "nancy",
      }),
      partido("m2", {
        orden: 2,
        programado_en: iso0800,
        cancha: "3",
        pareja_local_id: "fernando",
        pareja_visitante_id: "otro",
      }),
      partido("m3", {
        orden: 3,
        programado_en: iso0830,
        cancha: "2",
        pareja_local_id: "a",
        pareja_visitante_id: "b",
      }),
      partido("m4", {
        orden: 4,
        programado_en: iso0830,
        cancha: "4",
        pareja_local_id: "nancy",
        pareja_visitante_id: "fernando",
      }),
    ];

    // Arrastrar m4 (nancy+fernando) al primero: antes chocaba a las 08:00.
    const next = reassignScheduleSlotsOnReorder(list, 3, 0);
    expect(next[0]!.id).toBe("m4");
    expect(partidoTimeInputValue24(next[0]!.programado_en!)).toBe("08:00");
    expect(hasPairSameSlotConflict(next)).toBe(false);

    const nancySlots = next
      .filter(
        (p) =>
          p.pareja_local_id === "nancy" || p.pareja_visitante_id === "nancy"
      )
      .map((p) => mexicoScheduleSlotKey(p.programado_en!));
    expect(new Set(nancySlots).size).toBe(nancySlots.length);
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

  it("sin horarios solo actualiza el orden de identidades", () => {
    const list = [
      partido("a", { orden: 1, pareja_local_id: "p1", pareja_visitante_id: "p2" }),
      partido("b", { orden: 2, pareja_local_id: "p3", pareja_visitante_id: "p4" }),
    ];
    const next = reassignScheduleSlotsOnReorder(list, 1, 0);
    expect(next.map((p) => p.id)).toEqual(["b", "a"]);
    expect(next.map((p) => p.orden)).toEqual([1, 2]);
  });
});
