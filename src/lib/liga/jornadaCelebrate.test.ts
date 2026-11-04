import {
  buildLigaCampeonatoCelebrateCopy,
  buildLigaCampeonatoCelebrateHeadline,
  resolveGranFinalCelebrateSides,
  resolveLigaEquipoForJornadaPareja,
  shouldCelebrateLigaCampeonato,
  statsParejaLigaEquipo,
  statsParejaLigaSeason,
} from "./jornadaCelebrate";
import { PLAYOFFS_SCORE_FORMAT } from "./parejasFijasPlayoffsMatchScore";
import type { LigaEquipo, LigaJornada, LigaPartido } from "./types";

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

  it("resuelve equipo por equipo_id de la pareja, no por pareja.id", () => {
    const equipos = [
      {
        id: "eq-1",
        liga_id: "l1",
        nombre: null,
        jugador1_id: "j1",
        jugador2_id: "j2",
        puntos: 20,
        partidos_jugados: 8,
        partidos_ganados: 7,
        partidos_perdidos: 1,
        games_favor: 40,
        games_contra: 10,
        diferencia_games: 30,
        created_at: "",
      } as LigaEquipo,
    ];
    const jornada = {
      id: "jor-10",
      liga_id: "l1",
      numero: 10,
      estado: "completed",
      fecha: null,
      created_at: "",
      parejas: [
        {
          id: "pareja-j10-a",
          jornada_id: "jor-10",
          jugador1_id: "j1",
          jugador2_id: "j2",
          equipo_id: "eq-1",
        },
      ],
      partidos: [],
    } as LigaJornada;

    expect(
      resolveLigaEquipoForJornadaPareja("pareja-j10-a", jornada, equipos)?.id
    ).toBe("eq-1");
    expect(
      resolveLigaEquipoForJornadaPareja("eq-1", jornada, equipos)
    ).toBeNull();
  });

  it("acumula PG/GF de toda la liga a través de jornadas", () => {
    const equipos = [
      {
        id: "eq-1",
        liga_id: "l1",
        nombre: null,
        jugador1_id: "j1",
        jugador2_id: "j2",
        puntos: 0,
        partidos_jugados: 0,
        partidos_ganados: 0,
        partidos_perdidos: 0,
        games_favor: 0,
        games_contra: 0,
        diferencia_games: 0,
        created_at: "",
      } as LigaEquipo,
    ];
    const j1 = {
      id: "jor-1",
      liga_id: "l1",
      numero: 1,
      estado: "completed",
      fecha: null,
      created_at: "",
      parejas: [
        {
          id: "p1a",
          jornada_id: "jor-1",
          jugador1_id: "j1",
          jugador2_id: "j2",
          equipo_id: "eq-1",
        },
        {
          id: "p1b",
          jornada_id: "jor-1",
          jugador1_id: "j3",
          jugador2_id: "j4",
          equipo_id: "eq-2",
        },
      ],
      partidos: [
        partido({
          id: "m1",
          jornada_id: "jor-1",
          pareja1_id: "p1a",
          pareja2_id: "p1b",
          estado: "completed",
          score_pareja1: 3,
          score_pareja2: 0,
          set_scores: {
            format: PLAYOFFS_SCORE_FORMAT,
            sets: [
              { p1: 6, p2: 2 },
              { p1: 6, p2: 3 },
            ],
            stb: null,
            wo: false,
          },
        }),
      ],
    } as LigaJornada;
    const j10 = {
      id: "jor-10",
      liga_id: "l1",
      numero: 10,
      estado: "completed",
      fecha: null,
      created_at: "",
      parejas: [
        {
          id: "p10a",
          jornada_id: "jor-10",
          jugador1_id: "j1",
          jugador2_id: "j2",
          equipo_id: "eq-1",
        },
        {
          id: "p10b",
          jornada_id: "jor-10",
          jugador1_id: "j5",
          jugador2_id: "j6",
          equipo_id: "eq-3",
        },
      ],
      partidos: [
        partido({
          id: "gf",
          fase: "final",
          jornada_id: "jor-10",
          pareja1_id: "p10a",
          pareja2_id: "p10b",
          estado: "completed",
          score_pareja1: 3,
          score_pareja2: 0,
          set_scores: {
            format: PLAYOFFS_SCORE_FORMAT,
            sets: [
              { p1: 6, p2: 4 },
              { p1: 6, p2: 1 },
            ],
            stb: null,
            wo: false,
          },
        }),
      ],
    } as LigaJornada;

    expect(
      statsParejaLigaSeason({
        parejaId: "p10a",
        jornadaActual: j10,
        jornadas: [j1, j10],
        equipos,
      })
    ).toEqual({
      victorias: 2,
      derrotas: 0,
      partidos: 2,
      juegosFavor: 24,
      juegosContra: 10,
      dif: 14,
    });
  });
});
