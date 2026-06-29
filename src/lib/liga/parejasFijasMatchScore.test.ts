import {
  buildSetsFromDraft,
  computeParejasFijasMatchTotals,
  emptyParejasFijasSetsDraft,
  parejasFijasVictoryRankingPoints,
  validateRegularSet,
  validateSuperTiebreakSet,
} from "./parejasFijasMatchScore";

describe("parejasFijasMatchScore", () => {
  it("valida sets regulares", () => {
    expect(validateRegularSet(6, 4)).toBeNull();
    expect(validateRegularSet(7, 5)).toBeNull();
    expect(validateRegularSet(6, 5)).not.toBeNull();
    expect(validateRegularSet(5, 5)).not.toBeNull();
  });

  it("valida super tie-break a 10", () => {
    expect(validateSuperTiebreakSet(10, 8)).toBeNull();
    expect(validateSuperTiebreakSet(11, 9)).toBeNull();
    expect(validateSuperTiebreakSet(10, 9)).not.toBeNull();
    expect(validateSuperTiebreakSet(9, 8)).not.toBeNull();
  });

  it("partido 2-0 en sets suma games y define ganador", () => {
    const totals = computeParejasFijasMatchTotals([
      { p1: 6, p2: 4, kind: "regular" },
      { p1: 6, p2: 3, kind: "regular" },
    ]);
    expect(totals.gamesP1).toBe(12);
    expect(totals.gamesP2).toBe(7);
    expect(totals.setsP1).toBe(2);
    expect(totals.p1WonMatch).toBe(true);
  });

  it("partido 2-1 requiere super tie-break en set 3", () => {
    const draft = emptyParejasFijasSetsDraft();
    draft.set1 = { p1: "6", p2: "4" };
    draft.set2 = { p1: "3", p2: "6" };
    draft.set3 = { p1: "10", p2: "7" };

    const sets = buildSetsFromDraft(draft);
    const totals = computeParejasFijasMatchTotals(sets);

    expect(sets).toHaveLength(3);
    expect(totals.gamesP1).toBe(19);
    expect(totals.gamesP2).toBe(17);
    expect(totals.p1WonMatch).toBe(true);
  });

  it("rechaza 1-1 sin set 3", () => {
    const draft = emptyParejasFijasSetsDraft();
    draft.set1 = { p1: "6", p2: "4" };
    draft.set2 = { p1: "2", p2: "6" };
    expect(() => buildSetsFromDraft(draft)).toThrow(/super tie-break/i);
  });

  it("corrige 2-1 a 2-0 ignorando set 3 obsoleto", () => {
    const draft = emptyParejasFijasSetsDraft();
    draft.set1 = { p1: "6", p2: "2" };
    draft.set2 = { p1: "6", p2: "2" };
    draft.set3 = { p1: "4", p2: "10" };

    const sets = buildSetsFromDraft(draft);
    const totals = computeParejasFijasMatchTotals(sets);

    expect(sets).toHaveLength(2);
    expect(totals.gamesP1).toBe(12);
    expect(totals.gamesP2).toBe(4);
    expect(totals.p1WonMatch).toBe(true);
  });

  it("puntos ranking: 2-0 → 3, 2-1 STB → 2, derrota → 0", () => {
    const straight = computeParejasFijasMatchTotals([
      { p1: 6, p2: 2, kind: "regular" },
      { p1: 6, p2: 2, kind: "regular" },
    ]);
    expect(parejasFijasVictoryRankingPoints(straight, true)).toBe(3);
    expect(parejasFijasVictoryRankingPoints(straight, false)).toBe(0);

    const stb = computeParejasFijasMatchTotals([
      { p1: 6, p2: 2, kind: "regular" },
      { p1: 2, p2: 6, kind: "regular" },
      { p1: 10, p2: 8, kind: "super_tiebreak" },
    ]);
    expect(parejasFijasVictoryRankingPoints(stb, true)).toBe(2);
    expect(parejasFijasVictoryRankingPoints(stb, false)).toBe(0);
  });
});
