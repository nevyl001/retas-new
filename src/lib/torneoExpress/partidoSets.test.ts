import {
  buildPersistPayload,
  canAddAnotherSet,
  countSetWins,
  detectMatchWinner,
  formatSetWinsForWinner,
  getPartidoSets,
  looksLikeSetWinTally,
  matchWinnerSideFromPartido,
  parseSetsResultado,
} from "./partidoSets";

describe("partidoSets", () => {
  it("derives single set from puntos when no JSON", () => {
    expect(
      getPartidoSets({
        puntos_local: 6,
        puntos_visitante: 2,
        estado: "jugado",
      })
    ).toEqual([{ local: 6, visitante: 2 }]);
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

  it("detects winner at 2 sets", () => {
    const sets = [
      { local: 6, visitante: 2 },
      { local: 6, visitante: 3 },
    ];
    expect(detectMatchWinner(sets)).toBe("local");
    expect(countSetWins(sets)).toEqual({ local: 2, visitante: 0 });
  });

  it("allows third set at 1-1", () => {
    const sets = [
      { local: 6, visitante: 2 },
      { local: 2, visitante: 6 },
    ];
    expect(detectMatchWinner(sets)).toBeNull();
    expect(canAddAnotherSet(sets)).toBe(true);
    expect(detectMatchWinner([...sets, { local: 7, visitante: 5 }])).toBe(
      "local"
    );
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

  it("buildPersistPayload single set stores sets JSON", () => {
    const payload = buildPersistPayload([{ local: 6, visitante: 2 }]);
    expect(payload).toEqual({
      puntos_local: 6,
      puntos_visitante: 2,
      sets_resultado: [{ local: 6, visitante: 2 }],
      ganadorSide: "local",
    });
  });

  it("buildPersistPayload multi set stores JSON and set wins", () => {
    const sets = [
      { local: 6, visitante: 4 },
      { local: 3, visitante: 6 },
      { local: 7, visitante: 5 },
    ];
    const payload = buildPersistPayload(sets);
    expect(payload?.sets_resultado).toEqual(sets);
    expect(payload?.puntos_local).toBe(2);
    expect(payload?.puntos_visitante).toBe(1);
    expect(payload?.ganadorSide).toBe("local");
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
