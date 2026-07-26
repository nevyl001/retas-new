import { computeEliminatoriaAdvancePlan } from "./bracketRounds";
import type { TorneoExpressEliminatoriaPartido } from "./types";

/**
 * Prueba que computeEliminatoriaAdvancePlan (función pura nueva, sin I/O)
 * produce EXACTAMENTE las mismas filas que el código real de
 * avanzarEliminatoriaSiCompleta + ensureTercerLugarPartidoSiAplica escribe
 * hoy — verificado en
 * src/services/torneoExpressService.eliminatoria.characterization.test.ts
 * contra el código real con mocks de Supabase. Estos dos archivos juntos son
 * la demostración de equivalencia campo por campo.
 */

const TORNEO_ID = "t1";

function partido(
  overrides: Partial<TorneoExpressEliminatoriaPartido>
): TorneoExpressEliminatoriaPartido {
  return {
    id: "id",
    torneo_id: TORNEO_ID,
    ronda: 1,
    orden: 1,
    cruce_index: 0,
    pareja_local_id: null,
    pareja_visitante_id: null,
    puntos_local: null,
    puntos_visitante: null,
    sets_resultado: null,
    ganador_id: null,
    estado: "pendiente",
    es_bye: false,
    cancha: null,
    programado_en: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeEliminatoriaAdvancePlan — equivalencia con avanzarEliminatoriaSiCompleta", () => {
  it("ronda incompleta: sin inserts, sin notify (igual que test 1 de caracterización)", () => {
    const partidos = [
      partido({
        id: "s1",
        ronda: 1,
        cruce_index: 0,
        estado: "jugado",
        ganador_id: "p1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido({
        id: "s2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal"
    );

    expect(plan.inserts).toEqual([]);
    expect(plan.notifyFinalPhasePairIds).toBeNull();
  });

  it("ronda 1 completa: inserta final + 3.er lugar en un solo plan (igual que test 4 de caracterización)", () => {
    const partidos = [
      partido({
        id: "s1",
        ronda: 1,
        cruce_index: 0,
        estado: "jugado",
        ganador_id: "p1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido({
        id: "s2",
        ronda: 1,
        cruce_index: 1,
        estado: "jugado",
        ganador_id: "p3",
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal"
    );

    expect(plan.inserts).toHaveLength(2);
    expect(plan.inserts[0]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p3",
      estado: "pendiente",
      es_bye: false,
    });
    expect(plan.inserts[1]).toMatchObject({
      torneo_id: TORNEO_ID,
      ronda: 90,
      cruce_index: 0,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
      estado: "pendiente",
      es_bye: false,
    });
    expect(plan.notifyFinalPhasePairIds).toEqual(["p1", "p3"]);
  });

  it("bracket ya avanzado (ronda 2 + 3.er lugar ya existen): sin inserts", () => {
    const partidos = [
      partido({
        id: "s1",
        ronda: 1,
        cruce_index: 0,
        estado: "jugado",
        ganador_id: "p1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido({
        id: "s2",
        ronda: 1,
        cruce_index: 1,
        estado: "jugado",
        ganador_id: "p3",
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
      partido({
        id: "f1",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
      }),
      partido({
        id: "t3",
        ronda: 90,
        cruce_index: 0,
        pareja_local_id: "p2",
        pareja_visitante_id: "p4",
      }),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal"
    );

    expect(plan.inserts).toEqual([]);
    expect(plan.notifyFinalPhasePairIds).toBeNull();
  });

  it("bracket parcialmente avanzado (ronda 2 existe, falta 3.er lugar): solo inserta 3.er lugar", () => {
    const partidos = [
      partido({
        id: "s1",
        ronda: 1,
        cruce_index: 0,
        estado: "jugado",
        ganador_id: "p1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
      }),
      partido({
        id: "s2",
        ronda: 1,
        cruce_index: 1,
        estado: "jugado",
        ganador_id: "p3",
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
      }),
      partido({
        id: "f1",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
      }),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal"
    );

    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      ronda: 90,
      pareja_local_id: "p2",
      pareja_visitante_id: "p4",
    });
    expect(plan.notifyFinalPhasePairIds).toBeNull();
  });
});
