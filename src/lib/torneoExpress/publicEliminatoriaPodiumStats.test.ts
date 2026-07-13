import {
  buildPublicPodiumStatsForPair,
  formatPublicPodiumDif,
} from "./publicEliminatoriaPodiumStats";
import type { TorneoExpressBundle } from "./types";

describe("publicEliminatoriaPodiumStats", () => {
  const bundle: TorneoExpressBundle = {
    torneo: {
      id: "t1",
      nombre: "Test",
      organizador_id: "o1",
      categoria: "5ta",
      estado: "finalizado",
      source_tournament_id: null,
      fase_torneo: "eliminatoria",
      fase_eliminacion: "semifinal",
      bracket_slots: 8,
      created_at: "2026-01-01",
    },
    grupos: [{ id: "g1", torneo_id: "t1", nombre: "A", orden: 1, created_at: "" }],
    parejasPorGrupo: {
      g1: [
        { id: "gp1", grupo_id: "g1", pareja_id: "p1", created_at: "" },
        { id: "gp2", grupo_id: "g1", pareja_id: "p2", created_at: "" },
      ],
    },
    partidosPorGrupo: {
      g1: [
        {
          id: "m1",
          grupo_id: "g1",
          pareja_local_id: "p1",
          pareja_visitante_id: "p2",
          puntos_local: 6,
          puntos_visitante: 3,
          ganador_id: "p1",
          estado: "jugado",
          orden: 1,
          created_at: "",
        },
      ],
    },
    eliminatoriaPartidos: [
      {
        id: "e1",
        torneo_id: "t1",
        ronda: 2,
        orden: 1,
        cruce_index: 0,
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
        puntos_local: 6,
        puntos_visitante: 4,
        ganador_id: "p1",
        estado: "jugado",
        es_bye: false,
        created_at: "",
      },
    ],
  };

  it("combina fase de grupos y eliminatoria", () => {
    const stats = buildPublicPodiumStatsForPair(bundle, "p1");
    expect(stats).toEqual({
      partidos: 2,
      victorias: 2,
      derrotas: 0,
      juegosFavor: 12,
      juegosContra: 7,
      dif: 5,
    });
  });

  it("suma games de sets_resultado en BO3 (no el tally 2-1)", () => {
    const withBo3: TorneoExpressBundle = {
      ...bundle,
      partidosPorGrupo: {
        g1: [
          {
            id: "m1",
            grupo_id: "g1",
            pareja_local_id: "p1",
            pareja_visitante_id: "p2",
            puntos_local: 2,
            puntos_visitante: 1,
            sets_resultado: [
              { local: 6, visitante: 4 },
              { local: 3, visitante: 6 },
              { local: 6, visitante: 2 },
            ],
            ganador_id: "p1",
            estado: "jugado",
            orden: 1,
            created_at: "",
          },
        ],
      },
      eliminatoriaPartidos: [],
    };
    const stats = buildPublicPodiumStatsForPair(withBo3, "p1");
    expect(stats?.juegosFavor).toBe(15);
    expect(stats?.juegosContra).toBe(12);
  });

  it("formatea diferencia positiva", () => {
    expect(formatPublicPodiumDif(5)).toBe("+5");
    expect(formatPublicPodiumDif(-2)).toBe("-2");
  });

  it("retorna null sin partidos", () => {
    expect(buildPublicPodiumStatsForPair(bundle, "missing")).toBeNull();
    expect(buildPublicPodiumStatsForPair(bundle, null)).toBeNull();
  });
});
