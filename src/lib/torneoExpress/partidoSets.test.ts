import {
  areLegalSetScores,
  buildPersistPayload,
  canAddAnotherSet,
  countSetWins,
  detectMatchWinner,
  formatSetWinsForWinner,
  getPartidoSets,
  getSetsValidationMessage,
  isLegalSetScore,
  isLegalSetScoreAtIndex,
  isLegalSuperTieBreakScore,
  looksLikeSetWinTally,
  matchWinnerSideFromPartido,
  parseSetsResultado,
  partidoToMatchResult,
  totalGamesFromSets,
} from "./partidoSets";
import { buildStandingsForGrupo } from "./standings";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

describe("partidoSets", () => {
  it("partido a un set: detecta ganador y persiste games", () => {
    const sets = [{ local: 6, visitante: 4 }];
    expect(detectMatchWinner(sets)).toBe("local");
    expect(buildPersistPayload(sets)).toEqual({
      puntos_local: 6,
      puntos_visitante: 4,
      sets_resultado: sets,
      ganadorSide: "local",
    });
    expect(getSetsValidationMessage(sets)).toBeNull();
  });

  it("partido 2-0: ganador sin tercer set", () => {
    const sets = [
      { local: 6, visitante: 2 },
      { local: 6, visitante: 3 },
    ];
    expect(detectMatchWinner(sets)).toBe("local");
    expect(countSetWins(sets)).toEqual({ local: 2, visitante: 0 });
    expect(canAddAnotherSet(sets)).toBe(false);
    expect(buildPersistPayload(sets)?.puntos_local).toBe(2);
    expect(buildPersistPayload(sets)?.puntos_visitante).toBe(0);
  });

  it("partido 2-1: requiere tercer set", () => {
    const sets = [
      { local: 6, visitante: 4 },
      { local: 3, visitante: 6 },
      { local: 10, visitante: 8 },
    ];
    expect(detectMatchWinner(sets)).toBe("local");
    expect(countSetWins(sets)).toEqual({ local: 2, visitante: 1 });
    expect(totalGamesFromSets(sets)).toEqual({ local: 19, visitante: 18 });
    expect(getSetsValidationMessage(sets)).toBeNull();
  });

  it("empate 1-1: no permite guardar y pide tercer set", () => {
    const sets = [
      { local: 6, visitante: 2 },
      { local: 2, visitante: 6 },
    ];
    expect(detectMatchWinner(sets)).toBeNull();
    expect(canAddAnotherSet(sets)).toBe(true);
    expect(buildPersistPayload(sets)).toBeNull();
    expect(getSetsValidationMessage(sets)).toBe(
      "El partido está empatado a un set. Agrega el tercer set."
    );
  });

  it("cuarto set inválido", () => {
    const sets = [
      { local: 6, visitante: 4 },
      { local: 4, visitante: 6 },
      { local: 6, visitante: 2 },
      { local: 1, visitante: 0 },
    ];
    expect(canAddAnotherSet(sets.slice(0, 3))).toBe(false);
    expect(getSetsValidationMessage(sets)).toBe(
      "No se permiten más de 3 sets."
    );
    expect(buildPersistPayload(sets)).toBeNull();
  });

  it("empate a un set se puede guardar en fase de grupos", () => {
    expect(getSetsValidationMessage([{ local: 6, visitante: 6 }])).toBeNull();
    expect(buildPersistPayload([{ local: 6, visitante: 6 }])).toEqual({
      puntos_local: 6,
      puntos_visitante: 6,
      sets_resultado: [{ local: 6, visitante: 6 }],
      ganadorSide: null,
    });
  });

  it("empate a un set no se permite en eliminatoria", () => {
    expect(
      getSetsValidationMessage([{ local: 4, visitante: 4 }], {
        allowDraw: false,
      })
    ).toBe("En eliminatoria el partido no puede empatar; necesita un ganador.");
    expect(
      buildPersistPayload([{ local: 4, visitante: 4 }], { allowDraw: false })
    ).toBeNull();
  });

  it("acepta 8-6 y marcadores por tiempo (<6)", () => {
    expect(getSetsValidationMessage([{ local: 8, visitante: 6 }])).toBeNull();
    expect(buildPersistPayload([{ local: 8, visitante: 6 }])?.ganadorSide).toBe(
      "local"
    );
    expect(getSetsValidationMessage([{ local: 5, visitante: 3 }])).toBeNull();
    expect(getSetsValidationMessage([{ local: 2, visitante: 1 }])).toBeNull();
  });

  it("compatibilidad histórica: un set desde puntos_* sin JSON", () => {
    expect(
      getPartidoSets({
        puntos_local: 6,
        puntos_visitante: 2,
        estado: "jugado",
      })
    ).toEqual([{ local: 6, visitante: 2 }]);

    const match = partidoToMatchResult({
      pareja_local_id: "a",
      pareja_visitante_id: "b",
      puntos_local: 6,
      puntos_visitante: 2,
      ganador_id: "a",
      estado: "jugado",
    });
    expect(match).toEqual({
      pairAId: "a",
      pairBId: "b",
      gamesA: 6,
      gamesB: 2,
      winnerId: "a",
    });
  });

  it("prefers sets_resultado JSON", () => {
    const sets = [
      { local: 6, visitante: 4 },
      { local: 3, visitante: 6 },
      { local: 7, visitante: 5 },
    ];
    expect(
      getPartidoSets({
        sets_resultado: sets,
        puntos_local: 2,
        puntos_visitante: 1,
        estado: "jugado",
      })
    ).toEqual(sets);
  });

  it("corrección: partidoToMatchResult usa games de todos los sets", () => {
    const match = partidoToMatchResult({
      pareja_local_id: "a",
      pareja_visitante_id: "b",
      puntos_local: 2,
      puntos_visitante: 1,
      sets_resultado: [
        { local: 6, visitante: 4 },
        { local: 3, visitante: 6 },
        { local: 7, visitante: 5 },
      ],
      ganador_id: "a",
      estado: "jugado",
    });
    expect(match?.gamesA).toBe(16);
    expect(match?.gamesB).toBe(15);
    expect(match?.winnerId).toBe("a");
  });

  it("cambio de ganador: detectMatchWinner refleja sets corregidos", () => {
    const before = [{ local: 6, visitante: 2 }];
    const after = [{ local: 2, visitante: 6 }];
    expect(detectMatchWinner(before)).toBe("local");
    expect(detectMatchWinner(after)).toBe("visitante");
    expect(buildPersistPayload(after)?.ganadorSide).toBe("visitante");
  });

  it("looksLikeSetWinTally detects 2-1", () => {
    expect(looksLikeSetWinTally(2, 1)).toBe(true);
    expect(looksLikeSetWinTally(6, 2)).toBe(false);
  });

  it("getPartidoSets ignores set-win tally without JSON", () => {
    expect(
      getPartidoSets({
        puntos_local: 2,
        puntos_visitante: 1,
        estado: "jugado",
      })
    ).toEqual([]);
  });

  it("parseSetsResultado rejects invalid", () => {
    expect(parseSetsResultado(null)).toBeNull();
    expect(parseSetsResultado([{ local: 1 }])).toBeNull();
  });

  it("matchWinnerSideFromPartido prefers sets over wrong ganador_id", () => {
    expect(
      matchWinnerSideFromPartido({
        estado: "jugado",
        sets_resultado: [{ local: 4, visitante: 6 }],
        ganador_id: "local-team",
        pareja_local_id: "local-team",
        pareja_visitante_id: "visit-team",
      })
    ).toBe("visitante");
  });

  it("formatSetWinsForWinner orders winner sets first", () => {
    expect(
      formatSetWinsForWinner("visitante", { local: 0, visitante: 1 })
    ).toEqual({ winnerSets: 1, loserSets: 0 });
  });
});

/**
 * Validación flexible (2026-08-13): TE admite a 6, a 8, por tiempo y empates.
 * Solo se rechazan negativos, no enteros y valores > 99.
 */
describe("validación flexible de marcador de set", () => {
  const validos: Array<[number, number]> = [
    [6, 0],
    [6, 4],
    [7, 5],
    [7, 6],
    [8, 6],
    [5, 3],
    [2, 1],
    [10, 8],
    [12, 10],
    [60, 40],
    [99, 0],
    [0, 0],
    [4, 4],
  ];

  it.each(validos)("acepta %i-%i como marcador legal", (a, b) => {
    expect(isLegalSetScore({ local: a, visitante: b })).toBe(true);
    expect(isLegalSetScoreAtIndex({ local: a, visitante: b }, 0)).toBe(true);
  });

  it.each([
    [8, 6],
    [5, 3],
    [10, 8],
  ] as Array<[number, number]>)(
    "permite guardar partido a un set %i-%i",
    (a, b) => {
      expect(getSetsValidationMessage([{ local: a, visitante: b }])).toBeNull();
      expect(buildPersistPayload([{ local: a, visitante: b }])?.ganadorSide).toBe(
        a === b ? null : a > b ? "local" : "visitante"
      );
    }
  );

  it("acepta BO3 con set a 8 o súper TB libre", () => {
    expect(
      getSetsValidationMessage([
        { local: 8, visitante: 6 },
        { local: 3, visitante: 6 },
        { local: 10, visitante: 8 },
      ])
    ).toBeNull();
    expect(
      buildPersistPayload([
        { local: 6, visitante: 4 },
        { local: 3, visitante: 6 },
        { local: 10, visitante: 8 },
      ])?.ganadorSide
    ).toBe("local");
  });

  it("en mejor de 3 un set empatado sigue bloqueado", () => {
    expect(
      getSetsValidationMessage([
        { local: 6, visitante: 4 },
        { local: 5, visitante: 5 },
      ])
    ).toBe("El Set 2 no puede terminar empatado en mejor de 3.");
  });

  it("rechaza fuera de rango 0–99 y no enteros", () => {
    expect(isLegalSetScore({ local: 100, visitante: 0 })).toBe(false);
    expect(isLegalSetScore({ local: -1, visitante: 3 })).toBe(false);
    expect(isLegalSetScore({ local: 6.5, visitante: 4 })).toBe(false);
    expect(isLegalSetScore({ local: NaN, visitante: 4 })).toBe(false);
    expect(buildPersistPayload([{ local: 100, visitante: 0 }])).toBeNull();
    expect(getSetsValidationMessage([{ local: 6, visitante: -1 }])).toBe(
      "Completa el Set 1."
    );
  });

  it("areLegalSetScores exige al menos un set", () => {
    expect(areLegalSetScores([])).toBe(false);
    expect(areLegalSetScores([{ local: 8, visitante: 6 }])).toBe(true);
  });

  it("isLegalSuperTieBreakScore conserva la regla clásica a 10", () => {
    expect(isLegalSuperTieBreakScore({ local: 10, visitante: 8 })).toBe(true);
    expect(isLegalSuperTieBreakScore({ local: 10, visitante: 9 })).toBe(false);
  });
});

describe("standings con sets_resultado", () => {
  const grupo: TorneoExpressGrupo = {
    id: "g1",
    torneo_id: "t1",
    nombre: "Grupo A",
    orden: 1,
    created_at: "2026-01-01",
  };

  const parejas: TorneoExpressGrupoPareja[] = [
    {
      id: "gp1",
      grupo_id: "g1",
      pareja_id: "p1",
      pareja_display: "A / B",
      created_at: "2026-01-01",
    },
    {
      id: "gp2",
      grupo_id: "g1",
      pareja_id: "p2",
      pareja_display: "C / D",
      created_at: "2026-01-01",
    },
  ];

  it("suma games de BO3 para FAV/CON/DIF", () => {
    const partidos: TorneoExpressPartido[] = [
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
        created_at: "2026-01-01",
      },
    ];

    const rows = buildStandingsForGrupo(grupo, parejas, partidos);
    const p1 = rows.find((r) => r.parejaId === "p1")!;
    const p2 = rows.find((r) => r.parejaId === "p2")!;
    expect(p1.pg).toBe(1);
    expect(p1.ptsFav).toBe(15);
    expect(p1.ptsCon).toBe(12);
    expect(p2.ptsFav).toBe(12);
    expect(p2.ptsCon).toBe(15);
  });

  it("histórico sin sets_resultado usa puntos_* como games", () => {
    const partidos: TorneoExpressPartido[] = [
      {
        id: "m1",
        grupo_id: "g1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p2",
        puntos_local: 6,
        puntos_visitante: 2,
        ganador_id: "p1",
        estado: "jugado",
        created_at: "2026-01-01",
      },
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos);
    expect(rows[0].parejaId).toBe("p1");
    expect(rows[0].ptsFav).toBe(6);
    expect(rows[0].ptsCon).toBe(2);
  });

  it("ordena DIF → FAV → PG (DIF manda sobre FAV)", () => {
    const parejas3: TorneoExpressGrupoPareja[] = [
      ...parejas,
      {
        id: "gp3",
        grupo_id: "g1",
        pareja_id: "p3",
        pareja_display: "E / F",
        created_at: "2026-01-01",
      },
    ];

    // p1 y p2 empatan a 1 PG; p1 tiene menos FAV pero mejor DIF.
    // Con orden DIF → FAV, p1 debe quedar arriba de p2.
    const partidos: TorneoExpressPartido[] = [
      {
        id: "m1",
        grupo_id: "g1",
        pareja_local_id: "p1",
        pareja_visitante_id: "p3",
        puntos_local: 6,
        puntos_visitante: 0,
        ganador_id: "p1",
        estado: "jugado",
        created_at: "2026-01-01",
      },
      {
        id: "m2",
        grupo_id: "g1",
        pareja_local_id: "p2",
        pareja_visitante_id: "p3",
        puntos_local: 7,
        puntos_visitante: 5,
        ganador_id: "p2",
        estado: "jugado",
        created_at: "2026-01-01",
      },
    ];

    const rows = buildStandingsForGrupo(grupo, parejas3, partidos);
    // p1: PG1 FAV6 CON0 DIF+6
    // p2: PG1 FAV7 CON5 DIF+2
    // p3: PG0 FAV5 CON13 DIF-8
    expect(rows.map((r) => r.parejaId)).toEqual(["p1", "p2", "p3"]);
    expect(rows[0].dif).toBe(6);
    expect(rows[1].dif).toBe(2);
  });
});
