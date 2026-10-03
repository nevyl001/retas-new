import {
  buildEliminatoriaRoundScheduleMatches,
  eliminatoriaRoundPendingCount,
} from "./eliminatoriaRoundSchedule";
import type { TorneoExpressEliminatoriaPartido } from "./types";

function partido(
  patch: Partial<TorneoExpressEliminatoriaPartido> &
    Pick<TorneoExpressEliminatoriaPartido, "id" | "ronda">
): TorneoExpressEliminatoriaPartido {
  return {
    id: patch.id,
    torneo_id: "t1",
    ronda: patch.ronda,
    orden: patch.orden ?? 1,
    cruce_index: patch.cruce_index ?? patch.orden ?? 1,
    pareja_local_id:
      patch.pareja_local_id === undefined ? "a" : patch.pareja_local_id,
    pareja_visitante_id:
      patch.pareja_visitante_id === undefined ? "b" : patch.pareja_visitante_id,
    puntos_local: null,
    puntos_visitante: null,
    sets_resultado: null,
    ganador_id: null,
    estado: patch.estado ?? "pendiente",
    es_bye: patch.es_bye ?? false,
    cancha: patch.cancha ?? null,
    programado_en: patch.programado_en ?? null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("eliminatoriaRoundSchedule", () => {
  it("incluye solo partidos jugables de la ronda", () => {
    const partidos = [
      partido({ id: "1", ronda: 1, orden: 2 }),
      partido({ id: "2", ronda: 1, orden: 1, es_bye: true }),
      partido({ id: "3", ronda: 2, orden: 1 }),
      partido({
        id: "4",
        ronda: 1,
        orden: 3,
        pareja_visitante_id: null,
      }),
    ];

    const matches = buildEliminatoriaRoundScheduleMatches(partidos, 1);
    expect(matches.map((m) => m.partidoId)).toEqual(["1"]);
    expect(matches[0]?.groupKey).toBe(0);
  });

  it("cuenta pendientes para habilitar el botón", () => {
    const partidos = [
      partido({ id: "1", ronda: 1, estado: "pendiente" }),
      partido({ id: "2", ronda: 1, estado: "jugado" }),
      partido({ id: "3", ronda: 1, es_bye: true }),
    ];
    expect(eliminatoriaRoundPendingCount(partidos, 1)).toBe(1);
  });
});
