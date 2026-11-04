import {
  formatPuntosLigaDesglose,
  listJornadasElegiblesSustitucion,
  partidoTieneResultadoRegistrado,
  pickDefaultJornadaSustitucionId,
} from "./sustitucion";
import type { LigaJornada } from "./types";

function jornada(
  overrides: Partial<LigaJornada> & Pick<LigaJornada, "id" | "numero">
): LigaJornada {
  return {
    liga_id: "liga-1",
    estado: "upcoming",
    fecha: null,
    created_at: "2026-01-01",
    parejas: [],
    partidos: [],
    ...overrides,
  };
}

describe("sustitucion", () => {
  it("detecta partidos con resultado", () => {
    expect(
      partidoTieneResultadoRegistrado({
        estado: "upcoming",
        score_pareja1: null,
        score_pareja2: null,
        set_scores: null,
      })
    ).toBe(false);
    expect(
      partidoTieneResultadoRegistrado({
        estado: "completed",
        score_pareja1: 6,
        score_pareja2: 4,
        set_scores: null,
      })
    ).toBe(true);
    expect(
      partidoTieneResultadoRegistrado({
        estado: "in_progress",
        score_pareja1: 1,
        score_pareja2: null,
        set_scores: null,
      })
    ).toBe(true);
  });

  it("excluye jornadas completadas o con marcador del saliente", () => {
    const jornadas = [
      jornada({
        id: "j1",
        numero: 1,
        estado: "completed",
        parejas: [
          {
            id: "p1",
            jornada_id: "j1",
            jugador1_id: "out",
            jugador2_id: "a",
          },
        ],
        partidos: [
          {
            id: "m1",
            jornada_id: "j1",
            pareja1_id: "p1",
            pareja2_id: "p2",
            score_pareja1: 6,
            score_pareja2: 4,
            cancha: 1,
            ronda: 1,
            estado: "completed",
            created_at: "2026-01-01",
          },
        ],
      }),
      jornada({
        id: "j5",
        numero: 5,
        estado: "in_progress",
        parejas: [
          {
            id: "p5",
            jornada_id: "j5",
            jugador1_id: "out",
            jugador2_id: "b",
          },
        ],
        partidos: [
          {
            id: "m5",
            jornada_id: "j5",
            pareja1_id: "p5",
            pareja2_id: "px",
            score_pareja1: 2,
            score_pareja2: null,
            cancha: 1,
            ronda: 1,
            estado: "in_progress",
            created_at: "2026-01-01",
          },
        ],
      }),
      jornada({
        id: "j6",
        numero: 6,
        estado: "upcoming",
        parejas: [
          {
            id: "p6",
            jornada_id: "j6",
            jugador1_id: "out",
            jugador2_id: "c",
          },
        ],
        partidos: [
          {
            id: "m6",
            jornada_id: "j6",
            pareja1_id: "p6",
            pareja2_id: "py",
            score_pareja1: null,
            score_pareja2: null,
            cancha: 1,
            ronda: 1,
            estado: "upcoming",
            created_at: "2026-01-01",
          },
        ],
      }),
    ];

    const elegibles = listJornadasElegiblesSustitucion(jornadas, "out");
    expect(elegibles.map((j) => j.numero)).toEqual([6]);
    expect(pickDefaultJornadaSustitucionId(elegibles)).toBe("j6");
  });

  it("desglosa puntos heredados vs propios", () => {
    expect(formatPuntosLigaDesglose(35, 29)).toEqual({
      total: 35,
      heredados: 29,
      propios: 6,
    });
  });
});
