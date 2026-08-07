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

  it("set empatado no es válido", () => {
    expect(getSetsValidationMessage([{ local: 6, visitante: 6 }])).toBe(
      "El Set 1 no puede terminar empatado."
    );
    expect(buildPersistPayload([{ local: 6, visitante: 6 }])).toBeNull();
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
 * Brecha de integridad detectada el 2026-08-07: el dominio aceptaba cualquier
 * entero no negativo, así que un 60-40 (dígito tecleado antes del 0 por
 * defecto del input) se guardaba como resultado legal y contaminaba games,
 * DIF, rating y ranking.
 */
describe("validación estricta de marcador de set", () => {
  const validos: Array<[number, number]> = [
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 4],
    [7, 5],
    [7, 6],
  ];

  it.each(validos)("acepta %i-%i y su inverso", (a, b) => {
    expect(isLegalSetScore({ local: a, visitante: b })).toBe(true);
    expect(isLegalSetScore({ local: b, visitante: a })).toBe(true);
    expect(getSetsValidationMessage([{ local: a, visitante: b }])).toBeNull();
    expect(getSetsValidationMessage([{ local: b, visitante: a }])).toBeNull();
  });

  const invalidos: Array<[number, number]> = [
    [6, 5],
    [6, 6],
    [7, 0],
    [7, 4],
    [7, 7],
    [8, 6],
    [10, 8],
    [60, 40],
    [70, 50],
    [60, 30],
    [0, 0],
    [1, 0],
    [5, 3],
    [12, 10],
    [99, 0],
  ];

  it("el tercer set admite súper muerte súbita; los sets 1 y 2 no", () => {
    const superTb = { local: 10, visitante: 8 };
    expect(isLegalSetScoreAtIndex(superTb, 2)).toBe(true);
    expect(isLegalSetScoreAtIndex(superTb, 0)).toBe(false);
    expect(isLegalSetScoreAtIndex(superTb, 1)).toBe(false);

    // Como set 1 se rechaza…
    expect(getSetsValidationMessage([{ local: 10, visitante: 8 }])).toBe(
      "El Set 1 no es un marcador válido de pádel (6-0 a 6-4, 7-5 o 7-6)."
    );
    // …y como tercer set se acepta.
    expect(
      getSetsValidationMessage([
        { local: 6, visitante: 4 },
        { local: 3, visitante: 6 },
        { local: 10, visitante: 8 },
      ])
    ).toBeNull();
  });

  it("el tercer set también acepta un set normal completo", () => {
    expect(
      getSetsValidationMessage([
        { local: 6, visitante: 4 },
        { local: 3, visitante: 6 },
        { local: 7, visitante: 5 },
      ])
    ).toBeNull();
  });

  const superTieBreaksValidos: Array<[number, number]> = [
    [10, 0],
    [10, 5],
    [10, 8],
    [11, 9],
    [12, 10],
    [15, 13],
  ];

  it.each(superTieBreaksValidos)(
    "acepta súper muerte súbita %i-%i y su inverso",
    (a, b) => {
      expect(isLegalSuperTieBreakScore({ local: a, visitante: b })).toBe(true);
      expect(isLegalSuperTieBreakScore({ local: b, visitante: a })).toBe(true);
      expect(isLegalSetScoreAtIndex({ local: a, visitante: b }, 2)).toBe(true);
    }
  );

  const superTieBreaksInvalidos: Array<[number, number]> = [
    [10, 9], // a 10 el rival no puede tener 9
    [11, 8], // debió cerrar en 10-8
    [12, 9], // ventaja de 3: imposible
    [13, 8],
    [9, 7], // no llegó a 10
    [10, 10], // empate
    [60, 40], // el bug original: ventaja de 20
    [70, 50],
    [99, 0],
  ];

  it.each(superTieBreaksInvalidos)(
    "rechaza súper muerte súbita imposible %i-%i, incluso en el tercer set",
    (a, b) => {
      expect(isLegalSuperTieBreakScore({ local: a, visitante: b })).toBe(false);
      expect(isLegalSuperTieBreakScore({ local: b, visitante: a })).toBe(false);
      expect(isLegalSetScoreAtIndex({ local: a, visitante: b }, 2)).toBe(false);
      expect(
        buildPersistPayload([
          { local: 6, visitante: 4 },
          { local: 3, visitante: 6 },
          { local: a, visitante: b },
        ])
      ).toBeNull();
    }
  );

  it("el 60-40 no se cuela ni siquiera como tercer set", () => {
    expect(
      getSetsValidationMessage([
        { local: 6, visitante: 4 },
        { local: 3, visitante: 6 },
        { local: 60, visitante: 40 },
      ])
    ).toBe(
      "El Set 3 no es un marcador válido de pádel (6-0 a 6-4, 7-5, 7-6, o súper muerte súbita a 10 con 2 de diferencia)."
    );
  });

  it.each(invalidos)("rechaza %i-%i y su inverso", (a, b) => {
    expect(isLegalSetScore({ local: a, visitante: b })).toBe(false);
    expect(isLegalSetScore({ local: b, visitante: a })).toBe(false);
    expect(buildPersistPayload([{ local: a, visitante: b }])).toBeNull();
    expect(getSetsValidationMessage([{ local: a, visitante: b }])).not.toBeNull();
  });

  it("rechaza negativos", () => {
    expect(isLegalSetScore({ local: -6, visitante: 4 })).toBe(false);
    expect(isLegalSetScore({ local: 6, visitante: -1 })).toBe(false);
    expect(buildPersistPayload([{ local: -6, visitante: 4 }])).toBeNull();
    expect(buildPersistPayload([{ local: 6, visitante: -1 }])).toBeNull();
    // isSetComplete ya descarta negativos antes de evaluar el rango.
    expect(getSetsValidationMessage([{ local: 6, visitante: -1 }])).toBe(
      "Completa el Set 1."
    );
  });

  it("rechaza no enteros y NaN", () => {
    expect(isLegalSetScore({ local: 6.5, visitante: 4 })).toBe(false);
    expect(isLegalSetScore({ local: NaN, visitante: 4 })).toBe(false);
  });

  it("el mensaje de empate tiene prioridad sobre el de rango", () => {
    expect(getSetsValidationMessage([{ local: 6, visitante: 6 }])).toBe(
      "El Set 1 no puede terminar empatado."
    );
  });

  it("señala el set exacto que está fuera de rango", () => {
    expect(
      getSetsValidationMessage([
        { local: 6, visitante: 4 },
        { local: 8, visitante: 6 },
        { local: 6, visitante: 3 },
      ])
    ).toBe("El Set 2 no es un marcador válido de pádel (6-0 a 6-4, 7-5 o 7-6).");
  });

  it("un set inválido invalida todo el partido, no solo ese set", () => {
    const sets = [
      { local: 60, visitante: 40 },
      { local: 6, visitante: 3 },
    ];
    expect(areLegalSetScores(sets)).toBe(false);
    expect(buildPersistPayload(sets)).toBeNull();
  });

  it("areLegalSetScores exige al menos un set", () => {
    expect(areLegalSetScores([])).toBe(false);
    expect(areLegalSetScores([{ local: 6, visitante: 4 }])).toBe(true);
  });

  it("el 60-40 de la simulación PCS ya no se puede persistir", () => {
    expect(buildPersistPayload([{ local: 60, visitante: 40 }])).toBeNull();
    expect(buildPersistPayload([{ local: 70, visitante: 50 }])).toBeNull();
    expect(getSetsValidationMessage([{ local: 60, visitante: 40 }])).toBe(
      "El Set 1 no es un marcador válido de pádel (6-0 a 6-4, 7-5 o 7-6)."
    );
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

  it("ordena PG → FAV → DIF (no DIF antes que FAV)", () => {
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
    // Con orden correcto (FAV antes que DIF), p2 debe quedar arriba de p1.
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
    expect(rows.map((r) => r.parejaId)).toEqual(["p2", "p1", "p3"]);
    expect(rows[0].ptsFav).toBe(7);
    expect(rows[1].ptsFav).toBe(6);
  });
});
