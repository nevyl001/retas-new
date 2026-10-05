import {
  formatCourtOccupiedError,
  formatCourtSwapPrompt,
  occupiedCourtSlotKey,
  withCourtCheckMeta,
} from "./courtCheckScope";
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

describe("courtCheckScope", () => {
  test("formatCourtOccupiedError includes categoría and matchup", () => {
    const conflict = withCourtCheckMeta(partido("a"), {
      categoriaLabel: "4ta",
      parejaLocalLabel: "Ana / Bea",
      parejaVisitanteLabel: "Carla / Dina",
      source: "grupo",
      torneoId: "t1",
    });
    const msg = formatCourtOccupiedError(conflict);
    expect(msg).toContain("Cancha ocupada:");
    expect(msg).toContain("4ta");
    expect(msg).toContain("Ana / Bea vs Carla / Dina");
    expect(msg).toContain("grupos");
  });

  test("formatCourtSwapPrompt explains the exchange", () => {
    const conflict = withCourtCheckMeta(partido("a"), {
      categoriaLabel: "Open",
      parejaLocalLabel: "A / B",
      parejaVisitanteLabel: "C / D",
      source: "eliminatoria",
      torneoId: "t2",
    });
    const msg = formatCourtSwapPrompt({
      occupiedProgramadoEn: "2026-08-24T15:00:00.000Z",
      freedProgramadoEn: "2026-08-24T14:00:00.000Z",
      conflict,
    });
    expect(msg).toContain("¿Intercambiar horarios?");
    expect(msg).toContain("Open");
    expect(msg).toContain("eliminatoria");
  });

  test("occupiedCourtSlotKey normalizes cancha labels", () => {
    const iso = "2026-08-24T14:00:00.000Z";
    expect(occupiedCourtSlotKey(iso, "Cancha 1")).toBe(
      occupiedCourtSlotKey(iso, "1")
    );
    expect(occupiedCourtSlotKey(iso, "")).toBeNull();
    expect(occupiedCourtSlotKey(iso, null)).toBeNull();
  });
});
