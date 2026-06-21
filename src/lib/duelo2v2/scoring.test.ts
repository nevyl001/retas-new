import {
  canAddAnotherDueloSet,
  computeDueloScore,
  draftRowsToDetalle,
  dueloScoreHint,
  getWonSetsForSide,
  setOutcome,
  summarizeDraftRows,
} from "./scoring";

describe("duelo2v2 scoring", () => {
  it("2-0 en sets sin tercer set", () => {
    const s = computeDueloScore([
      { a: 6, b: 4 },
      { a: 6, b: 3 },
    ]);
    expect(s.setsWonA).toBe(2);
    expect(s.setsWonB).toBe(0);
    expect(s.ganador).toBe("a");
    expect(s.canFinalize).toBe(true);
  });

  it("2-1 requiere set 3 con ganador", () => {
    const s = computeDueloScore([
      { a: 6, b: 4 },
      { a: 3, b: 6 },
      { a: 6, b: 2 },
    ]);
    expect(s.setsWonA).toBe(2);
    expect(s.setsWonB).toBe(1);
    expect(s.ganador).toBe("a");
  });

  it("1-1 con set 3 empatado no hay ganador", () => {
    const s = computeDueloScore([
      { a: 6, b: 4 },
      { a: 4, b: 6 },
      { a: 5, b: 5 },
    ]);
    expect(s.setsWonA).toBe(1);
    expect(s.setsWonB).toBe(1);
    expect(s.ganador).toBeNull();
    expect(s.canFinalize).toBe(false);
  });

  it("set empatado no cuenta", () => {
    expect(setOutcome(6, 6)).toBe("empate");
    const s = computeDueloScore([{ a: 6, b: 6 }, { a: 6, b: 4 }]);
    expect(s.setsWonA).toBe(1);
    expect(s.setsWonB).toBe(0);
  });

  it("draft rows ignoran filas vacías", () => {
    expect(
      draftRowsToDetalle([
        { a: "6", b: "4" },
        { a: "", b: "" },
        { a: "3", b: "6" },
      ])
    ).toEqual([
      { a: 6, b: 4 },
      { a: 3, b: 6 },
    ]);
  });

  it("hint cuando falta set decisivo", () => {
    const hint = dueloScoreHint(
      summarizeDraftRows([
        { a: "6", b: "4" },
        { a: "4", b: "6" },
        { a: "", b: "" },
      ])
    );
    expect(hint).toContain("Set 3");
  });

  it("canAddAnotherDueloSet hasta ganador o max", () => {
    expect(canAddAnotherDueloSet([{ a: "6", b: "4" }])).toBe(true);
    expect(
      canAddAnotherDueloSet([
        { a: "6", b: "4" },
        { a: "6", b: "3" },
      ])
    ).toBe(false);
    expect(
      canAddAnotherDueloSet([
        { a: "6", b: "4" },
        { a: "3", b: "6" },
      ])
    ).toBe(true);
  });

  it("getWonSetsForSide devuelve sets ganados por pareja", () => {
    const detalle = [
      { a: 6, b: 2 },
      { a: 2, b: 6 },
      { a: 6, b: 4 },
    ];
    expect(getWonSetsForSide(detalle, "a")).toEqual([
      { setNumber: 1, gamesFor: 6, gamesAgainst: 2, won: true },
      { setNumber: 3, gamesFor: 6, gamesAgainst: 4, won: true },
    ]);
    expect(getWonSetsForSide(detalle, "b")).toEqual([
      { setNumber: 2, gamesFor: 6, gamesAgainst: 2, won: true },
    ]);
  });
});
