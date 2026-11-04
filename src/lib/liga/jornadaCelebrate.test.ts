import {
  buildLigaCampeonatoCelebrateCopy,
  buildLigaCampeonatoCelebrateHeadline,
  resolveGranFinalCelebrateSides,
  shouldCelebrateLigaCampeonato,
  statsParejaLigaEquipo,
} from "./jornadaCelebrate";
import { PLAYOFFS_SCORE_FORMAT } from "./parejasFijasPlayoffsMatchScore";
import type { LigaEquipo, LigaPartido } from "./types";

function partido(
  partial: Partial<LigaPartido> & Pick<LigaPartido, "id">
): LigaPartido {
  return {
    jornada_id: "j",
    pareja1_id: "p1",
    pareja2_id: "p2",
    ronda: 1,
    cancha: 1,
    estado: "upcoming",
    score_pareja1: null,
    score_pareja2: null,
    set_scores: null,
    created_at: "",
    ...partial,
  };
}

describe("jornadaCelebrate — campeonato de liga", () => {
  it("detecta modo campeonato por Gran Final o última jornada de parejas fijas", () => {
    expect(
      shouldCelebrateLigaCampeonato({
        esParejasFijas: true,
        partidos: [partido({ id: "gf", fase: "final", bracket_slot: "FINAL" })],
        jornadaNumero: 10,
        jornadas: [{ numero: 1 }, { numero: 10 }],
      })
    ).toBe(true);

    expect(
      shouldCelebrateLigaCampeonato({
        esParejasFijas: true,
        partidos: [partido({ id: "r", fase: "regular" })],
        jornadaNumero: 10,
        jornadas: [{ numero: 1 }, { numero: 10 }],
      })
    ).toBe(true);

    expect(
      shouldCelebrateLigaCampeonato({
        esParejasFijas: true,
        partidos: [partido({ id: "r", fase: "regular" })],
        jornadaNumero: 5,
        jornadas: [{ numero: 1 }, { numero: 10 }],
      })
    ).toBe(false);

    expect(
      shouldCelebrateLigaCampeonato({
        esParejasFijas: false,
        partidos: [partido({ id: "gf", fase: "final" })],
        jornadaNumero: 10,
        jornadas: [{ numero: 10 }],
      })
    ).toBe(false);
  });

  it("resuelve campeón y subcampeón desde la Gran Final completada", () => {
    expect(
      resolveGranFinalCelebrateSides(
        [
          partido({
            id: "gf",
            fase: "final",
            estado: "completed",
            pareja1_id: "eq-a",
            pareja2_id: "eq-b",
            score_pareja1: 1,
            score_pareja2: 3,
            set_scores: {
              format: PLAYOFFS_SCORE_FORMAT,
              sets: [
                { p1: 4, p2: 6 },
                { p1: 3, p2: 6 },
              ],
              stb: null,
              wo: false,
            },
          }),
        ],
        true
      )
    ).toEqual({ campeonId: "eq-b", subcampeonId: "eq-a" });
  });

  it("arma headline y copy de campeones con temporada", () => {
    expect(
      buildLigaCampeonatoCelebrateHeadline(
        "Liga Padelito Warehouse Temporada 1",
        "campeones"
      )
    ).toBe("Campeones · Liga Padelito Warehouse · Temporada 1");

    const copy = buildLigaCampeonatoCelebrateCopy(
      "Liga Padelito Warehouse Temporada 1",
      "campeones"
    );
    expect(copy.badge).toBe("CAMPEONES");
    expect(copy.title).toBe("¡Felicidades!");
    expect(copy.rank).toContain("Temporada 1");
    expect(copy.rank).toContain("Resumen de toda la liga");

    const sub = buildLigaCampeonatoCelebrateCopy(
      "Liga Padelito Warehouse Temporada 1",
      "subcampeones"
    );
    expect(sub.badge).toBe("SUBCAMPEONES");
  });

  it("mapea stats de equipo a resumen de liga", () => {
    const equipo = {
      partidos_jugados: 10,
      partidos_ganados: 9,
      partidos_perdidos: 1,
      games_favor: 18,
      games_contra: 3,
      diferencia_games: 15,
    } as Pick<
      LigaEquipo,
      | "partidos_jugados"
      | "partidos_ganados"
      | "partidos_perdidos"
      | "games_favor"
      | "games_contra"
      | "diferencia_games"
    >;
    expect(statsParejaLigaEquipo(equipo)).toEqual({
      victorias: 9,
      derrotas: 1,
      partidos: 10,
      juegosFavor: 18,
      juegosContra: 3,
      dif: 15,
    });
  });
});
