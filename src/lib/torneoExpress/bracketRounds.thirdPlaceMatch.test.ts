import {
  buildSiguienteRondaPartidos,
  buildTercerLugarPartido,
  computeEliminatoriaAdvancePlan,
  computeWinnerChangePropagation,
  eliminatoriaIncluyeTercerLugar,
  eliminatoriaUltimaRondaCompleta,
  isRondaTercerLugar,
  resolveEliminatoriaPlacementParejaIds,
  RONDA_TERCER_LUGAR,
} from "./bracketRounds";
import {
  DEFAULT_THIRD_PLACE_MATCH_ENABLED,
  parseBracketSlotsDocument,
  readThirdPlaceMatchEnabled,
  serializeBracketSlotsDocument,
} from "./bracketPersistence";
import { mejoresTercerosNecesarios } from "./bracket";
import type { BracketSlotEntry } from "./bracketTypes";
import type { TorneoExpressEliminatoriaPartido } from "./types";

const TORNEO_ID = "cat-a";

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

/** Cuartos completos (8 teams → 4 QF) winners A,C,E,G. */
function cuartosCompletos(): TorneoExpressEliminatoriaPartido[] {
  return [
    partido({
      id: "q0",
      ronda: 1,
      orden: 1,
      cruce_index: 0,
      pareja_local_id: "A",
      pareja_visitante_id: "B",
      ganador_id: "A",
      estado: "jugado",
    }),
    partido({
      id: "q1",
      ronda: 1,
      orden: 2,
      cruce_index: 1,
      pareja_local_id: "C",
      pareja_visitante_id: "D",
      ganador_id: "C",
      estado: "jugado",
    }),
    partido({
      id: "q2",
      ronda: 1,
      orden: 3,
      cruce_index: 2,
      pareja_local_id: "E",
      pareja_visitante_id: "F",
      ganador_id: "E",
      estado: "jugado",
    }),
    partido({
      id: "q3",
      ronda: 1,
      orden: 4,
      cruce_index: 3,
      pareja_local_id: "G",
      pareja_visitante_id: "H",
      ganador_id: "G",
      estado: "jugado",
    }),
  ];
}

describe("thirdPlaceMatchEnabled — business tests 1–12", () => {
  it("TEST 1: cuartos + thirdPlace=true → 4 QF, 2 SF, 1 Final, 1 bronze", () => {
    expect(eliminatoriaIncluyeTercerLugar("cuartos", 8, true)).toBe(true);

    let partidos = cuartosCompletos();
    expect(partidos.filter((p) => p.ronda === 1)).toHaveLength(4);

    const semis = buildSiguienteRondaPartidos(TORNEO_ID, 1, partidos);
    expect(semis).toHaveLength(2);
    partidos = [
      ...partidos,
      ...semis.map((row, i) =>
        partido({
          id: `s${i}`,
          ...row,
          ganador_id: i === 0 ? "A" : "E",
          estado: "jugado",
        })
      ),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "cuartos",
      8,
      true
    );
    expect(plan.inserts.filter((r) => r.ronda === 3)).toHaveLength(1);
    expect(plan.inserts.filter((r) => isRondaTercerLugar(r.ronda))).toHaveLength(
      1
    );
  });

  it("TEST 2: cuartos + thirdPlace=false → Final only, 0 bronze", () => {
    expect(eliminatoriaIncluyeTercerLugar("cuartos", 8, false)).toBe(false);

    let partidos = cuartosCompletos();
    const semis = buildSiguienteRondaPartidos(TORNEO_ID, 1, partidos);
    partidos = [
      ...partidos,
      ...semis.map((row, i) =>
        partido({
          id: `s${i}`,
          ...row,
          ganador_id: i === 0 ? "A" : "E",
          estado: "jugado",
        })
      ),
    ];

    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "cuartos",
      8,
      false
    );
    expect(plan.inserts.filter((r) => r.ronda === 3)).toHaveLength(1);
    expect(plan.inserts.filter((r) => isRondaTercerLugar(r.ronda))).toHaveLength(
      0
    );
  });

  it("TEST 3: con bronce — Final = winners SF, bronze = losers SF", () => {
    const semis = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
    ];
    const finalRows = buildSiguienteRondaPartidos(TORNEO_ID, 1, semis);
    expect(finalRows[0]).toMatchObject({
      pareja_local_id: "A",
      pareja_visitante_id: "C",
    });
    const bronze = buildTercerLugarPartido(TORNEO_ID, semis, 1);
    expect(bronze).toMatchObject({
      ronda: RONDA_TERCER_LUGAR,
      pareja_local_id: "B",
      pareja_visitante_id: "D",
    });
  });

  it("TEST 4: sin bronce — Final sí, ningún B vs D", () => {
    const semis = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
    ];
    const plan = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      semis,
      "semifinal",
      4,
      false
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      pareja_local_id: "A",
      pareja_visitante_id: "C",
      ronda: 2,
    });
    expect(plan.inserts.some((r) => isRondaTercerLugar(r.ronda))).toBe(false);
  });

  it("TEST 5: placements con bronce terminado → 1 A, 2 C, 3 B, 4 D", () => {
    const partidos = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "t",
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "B",
        pareja_visitante_id: "D",
        ganador_id: "B",
        estado: "jugado",
      }),
    ];
    const p = resolveEliminatoriaPlacementParejaIds(partidos, "semifinal", 4);
    expect(p).toEqual({
      campeonId: "A",
      subcampeonId: "C",
      tercerId: "B",
      cuartoId: "D",
      sharedTercerIds: [],
    });
  });

  it("TEST 6: sin bronce → 1 A, 2 C, B y D 3.º compartido", () => {
    const partidos = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        ganador_id: "A",
        estado: "jugado",
      }),
    ];
    const p = resolveEliminatoriaPlacementParejaIds(partidos, "semifinal", 4);
    expect(p.campeonId).toBe("A");
    expect(p.subcampeonId).toBe("C");
    expect(p.tercerId).toBeNull();
    expect(p.cuartoId).toBeNull();
    expect(p.sharedTercerIds.sort()).toEqual(["B", "D"]);
  });

  it("TEST 7: corrección SF actualiza Final y bronce", () => {
    const partidos = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        estado: "pendiente",
      }),
      partido({
        id: "t",
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "B",
        pareja_visitante_id: "D",
        estado: "pendiente",
      }),
    ];

    const patches = computeWinnerChangePropagation(
      partidos,
      {
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        ganador_id: "A",
        es_bye: false,
      },
      "B",
      { totalRondas: 2 }
    );

    const finalPatch = patches.find((p) => p.id === "f");
    const tercerPatch = patches.find((p) => p.id === "t");
    expect(finalPatch).toMatchObject({ pareja_local_id: "B" });
    expect(tercerPatch).toMatchObject({
      pareja_local_id: "A",
      pareja_visitante_id: "D",
    });
  });

  it("TEST 8: cierre con thirdPlace=true exige bronce", () => {
    const soloFinal = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        ganador_id: "A",
        estado: "jugado",
      }),
    ];
    expect(
      eliminatoriaUltimaRondaCompleta(soloFinal, "semifinal", 4, true)
    ).toBe(false);

    const completo = [
      ...soloFinal,
      partido({
        id: "t",
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "B",
        pareja_visitante_id: "D",
        ganador_id: "B",
        estado: "jugado",
      }),
    ];
    expect(
      eliminatoriaUltimaRondaCompleta(completo, "semifinal", 4, true)
    ).toBe(true);
  });

  it("TEST 9: cierre con thirdPlace=false solo exige Final", () => {
    const soloFinal = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        ganador_id: "A",
        estado: "jugado",
      }),
    ];
    expect(
      eliminatoriaUltimaRondaCompleta(soloFinal, "semifinal", 4, false)
    ).toBe(true);
  });

  it("TEST 10: idempotencia — advance plan no duplica Final ni bronce", () => {
    const partidos = [
      partido({
        id: "sf1",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "B",
        ganador_id: "A",
        estado: "jugado",
      }),
      partido({
        id: "sf2",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "C",
        pareja_visitante_id: "D",
        ganador_id: "C",
        estado: "jugado",
      }),
      partido({
        id: "f",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "A",
        pareja_visitante_id: "C",
        estado: "pendiente",
      }),
      partido({
        id: "t",
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "B",
        pareja_visitante_id: "D",
        estado: "pendiente",
      }),
    ];

    const plan1 = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal",
      4,
      true
    );
    const plan2 = computeEliminatoriaAdvancePlan(
      TORNEO_ID,
      partidos,
      "semifinal",
      4,
      true
    );
    expect(plan1.inserts).toEqual([]);
    expect(plan2.inserts).toEqual([]);
  });

  it("TEST 11: mejores terceros invariantes al togglear thirdPlace", () => {
    const a = mejoresTercerosNecesarios(4, "cuartos");
    const b = mejoresTercerosNecesarios(4, "cuartos");
    expect(a).toBe(b);
    expect(a).toBe(0);
    // Flag is orthogonal — classification helpers never take the bronze flag.
    expect(eliminatoriaIncluyeTercerLugar("cuartos", 8, true)).not.toBe(
      eliminatoriaIncluyeTercerLugar("cuartos", 8, false)
    );
    expect(mejoresTercerosNecesarios(3, "cuartos")).toBe(2);
  });

  it("TEST 12: categorías independientes via bracket_slots envelope", () => {
    const slots: BracketSlotEntry[] = [
      {
        type: "team",
        qualifier: {
          seed: 1,
          parejaId: "p1",
          parejaLabel: "A",
          grupoId: "g1",
          grupoNombre: "A",
          grupoOrden: 1,
          posEnGrupo: 1,
          isMejorTercero: false,
          pj: 0,
          pg: 0,
          pp: 0,
          ptsFav: 0,
          ptsCon: 0,
          dif: 0,
          puntos: 0,
        },
      },
    ];
    const catA = serializeBracketSlotsDocument(slots, true);
    const catB = serializeBracketSlotsDocument(slots, false);
    expect(readThirdPlaceMatchEnabled(catA)).toBe(true);
    expect(readThirdPlaceMatchEnabled(catB)).toBe(false);
    expect(parseBracketSlotsDocument(catA).thirdPlaceMatchEnabled).toBe(true);
    expect(parseBracketSlotsDocument(catB).thirdPlaceMatchEnabled).toBe(false);

    // Legacy array defaults to enabled
    expect(readThirdPlaceMatchEnabled([{ type: "bye" }])).toBe(
      DEFAULT_THIRD_PLACE_MATCH_ENABLED
    );
  });
});
