import {
  buildSiguienteRondaPartidos,
  buildTercerLugarPartido,
  computeWinnerChangePropagation,
  eliminatoriaUltimaRondaCompleta,
  labelRondaEliminatoria,
  nextRoundSlotForCruce,
  RONDA_TERCER_LUGAR,
  rondaCompleta,
  totalRondasEliminatoria,
} from "./bracketRounds";
import type { TorneoExpressEliminatoriaPartido } from "./types";

function mkPartido(
  partial: Partial<TorneoExpressEliminatoriaPartido> &
    Pick<TorneoExpressEliminatoriaPartido, "ronda" | "cruce_index">
): TorneoExpressEliminatoriaPartido {
  return {
    id: `p-${partial.ronda}-${partial.cruce_index}`,
    torneo_id: "t1",
    orden: partial.cruce_index ?? 0,
    pareja_local_id: partial.pareja_local_id ?? "a",
    pareja_visitante_id: partial.pareja_visitante_id ?? "b",
    puntos_local: partial.puntos_local ?? 6,
    puntos_visitante: partial.puntos_visitante ?? 3,
    ganador_id: partial.ganador_id ?? partial.pareja_local_id ?? "a",
    estado: partial.estado ?? "jugado",
    es_bye: partial.es_bye ?? false,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("bracketRounds", () => {
  it("totalRondasEliminatoria", () => {
    expect(totalRondasEliminatoria("semifinal")).toBe(2);
    expect(totalRondasEliminatoria("cuartos")).toBe(3);
    expect(totalRondasEliminatoria("octavos")).toBe(4);
    expect(totalRondasEliminatoria("semifinal", 8)).toBe(3);
    expect(totalRondasEliminatoria("cuartos", 16)).toBe(4);
  });

  it("labelRondaEliminatoria", () => {
    expect(labelRondaEliminatoria("cuartos", 1)).toBe("Cuartos de final");
    expect(labelRondaEliminatoria("cuartos", 2)).toBe("Semifinal");
    expect(labelRondaEliminatoria("cuartos", 3)).toBe("Final");
  });

  it("rondaCompleta exige todos jugados", () => {
    const partidos = [
      mkPartido({ ronda: 1, cruce_index: 0, estado: "jugado" }),
      mkPartido({ ronda: 1, cruce_index: 1, estado: "pendiente" }),
    ];
    expect(rondaCompleta(partidos, 1)).toBe(false);
    partidos[1].estado = "jugado";
    expect(rondaCompleta(partidos, 1)).toBe(true);
  });

  it("buildSiguienteRondaPartidos empareja ganadores adyacentes", () => {
    const r1 = [
      mkPartido({
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
        ganador_id: "p1",
      }),
      mkPartido({
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "p3",
        pareja_visitante_id: "p4",
        ganador_id: "p4",
      }),
      mkPartido({
        ronda: 1,
        cruce_index: 2,
        pareja_local_id: "p5",
        pareja_visitante_id: "p6",
        ganador_id: "p5",
      }),
      mkPartido({
        ronda: 1,
        cruce_index: 3,
        pareja_local_id: "p7",
        pareja_visitante_id: "p8",
        ganador_id: "p7",
      }),
    ];
    const next = buildSiguienteRondaPartidos("t1", 1, r1);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      ronda: 2,
      cruce_index: 0,
      pareja_local_id: "p1",
      pareja_visitante_id: "p4",
    });
    expect(next[1]).toMatchObject({
      ronda: 2,
      cruce_index: 1,
      pareja_local_id: "p5",
      pareja_visitante_id: "p7",
    });
  });

  it("eliminatoriaUltimaRondaCompleta exige tercer lugar", () => {
    const r1 = [
      mkPartido({ ronda: 1, cruce_index: 0, estado: "jugado" }),
      mkPartido({ ronda: 1, cruce_index: 1, estado: "jugado" }),
    ];
    expect(eliminatoriaUltimaRondaCompleta(r1, "semifinal")).toBe(false);

    const soloFinal = [
      ...r1,
      mkPartido({ ronda: 2, cruce_index: 0, estado: "jugado" }),
    ];
    expect(eliminatoriaUltimaRondaCompleta(soloFinal, "semifinal")).toBe(
      false
    );

    const completo = [
      ...soloFinal,
      mkPartido({
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "l1",
        pareja_visitante_id: "l2",
        ganador_id: "l1",
        estado: "jugado",
      }),
    ];
    expect(eliminatoriaUltimaRondaCompleta(completo, "semifinal")).toBe(true);
  });

  it("buildTercerLugarPartido con perdedores de semifinal", () => {
    const semis = [
      mkPartido({
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        ganador_id: "a",
      }),
      mkPartido({
        ronda: 2,
        cruce_index: 1,
        pareja_local_id: "c",
        pareja_visitante_id: "d",
        ganador_id: "d",
      }),
    ];
    const tercer = buildTercerLugarPartido("t1", semis, 2);
    expect(tercer).toMatchObject({
      ronda: RONDA_TERCER_LUGAR,
      pareja_local_id: "b",
      pareja_visitante_id: "c",
      estado: "pendiente",
    });
  });

  it("labelRondaEliminatoria tercer lugar", () => {
    expect(labelRondaEliminatoria("cuartos", RONDA_TERCER_LUGAR)).toBe(
      "Tercer lugar"
    );
  });

  it("computeWinnerChangePropagation actualiza downstream y reinicia resultado", () => {
    const partidos = [
      mkPartido({
        id: "semi-0",
        ronda: 1,
        cruce_index: 0,
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        ganador_id: "a",
        estado: "jugado",
      }),
      mkPartido({
        id: "semi-1",
        ronda: 1,
        cruce_index: 1,
        pareja_local_id: "c",
        pareja_visitante_id: "d",
        ganador_id: "c",
        estado: "jugado",
      }),
      mkPartido({
        id: "final",
        ronda: 2,
        cruce_index: 0,
        pareja_local_id: "a",
        pareja_visitante_id: "c",
        ganador_id: "a",
        estado: "jugado",
        puntos_local: 6,
        puntos_visitante: 2,
      }),
      mkPartido({
        id: "tercer",
        ronda: RONDA_TERCER_LUGAR,
        cruce_index: 0,
        pareja_local_id: "b",
        pareja_visitante_id: "d",
        ganador_id: "b",
        estado: "jugado",
      }),
    ];

    const patches = computeWinnerChangePropagation(
      partidos,
      {
        id: "semi-0",
        ronda: 1,
        cruce_index: 0,
        ganador_id: "a",
        es_bye: false,
      },
      "b",
      { totalRondas: 2 }
    );

    const finalPatch = patches.find((p) => p.id === "final");
    expect(finalPatch).toMatchObject({
      pareja_local_id: "b",
      estado: "pendiente",
      ganador_id: null,
      puntos_local: null,
      puntos_visitante: null,
    });

    const tercerPatch = patches.find((p) => p.id === "tercer");
    expect(tercerPatch).toMatchObject({
      pareja_local_id: "a",
      pareja_visitante_id: "d",
      estado: "pendiente",
      ganador_id: null,
    });
  });

  it("nextRoundSlotForCruce mapea lados correctamente", () => {
    expect(nextRoundSlotForCruce(0)).toEqual({
      nextCruceIndex: 0,
      side: "local",
    });
    expect(nextRoundSlotForCruce(1)).toEqual({
      nextCruceIndex: 0,
      side: "visitante",
    });
    expect(nextRoundSlotForCruce(2)).toEqual({
      nextCruceIndex: 1,
      side: "local",
    });
  });
});
