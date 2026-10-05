import { canonicalMatchupKey, expectedMatchCount, generateBalancedRoundRobin } from "./roundRobin";

describe("expectedMatchCount", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 3],
    [4, 6],
    [5, 10],
    [6, 15],
    [7, 21],
    [8, 28],
  ])("%i parejas → %i partidos", (pairs, matches) => {
    expect(expectedMatchCount(pairs)).toBe(matches);
  });

  it("no lanza con valores que no son un grupo", () => {
    expect(expectedMatchCount(-1)).toBe(0);
    expect(expectedMatchCount(Number.NaN)).toBe(0);
    expect(expectedMatchCount(2.5)).toBe(0);
  });
});

describe("canonicalMatchupKey", () => {
  it("trata A-B y B-A como el mismo cruce y no colisiona al pegar ids", () => {
    expect(canonicalMatchupKey("a", "b")).toBe(canonicalMatchupKey("b", "a"));
    expect(canonicalMatchupKey("1", "23")).not.toBe(canonicalMatchupKey("12", "3"));
    expect(canonicalMatchupKey("1", "23")).toBe(canonicalMatchupKey("23", "1"));
  });
});

describe("round robin sin BYE persistido", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])("N=%i genera cada cruce una sola vez", (n) => {
    const ids = Array.from({ length: n }, (_, index) => `p${index + 1}`);
    const matches = generateBalancedRoundRobin(ids);
    expect(matches).toHaveLength(expectedMatchCount(n));

    const seen = new Set<string>();
    matches.forEach((match) => {
      expect(match.localId).not.toBe(match.visitanteId);
      expect(match.localId).toBeTruthy();
      expect(match.visitanteId).toBeTruthy();
      expect(match.localId.toLowerCase()).not.toContain("bye");
      expect(match.visitanteId.toLowerCase()).not.toContain("bye");
      const key = canonicalMatchupKey(match.localId, match.visitanteId);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
    expect(seen.size).toBe(expectedMatchCount(n));

    const playersPerRound = n % 2 === 0 ? n : n - 1;
    const byRound = new Map<number, string[]>();
    matches.forEach((match) => {
      const used = byRound.get(match.ronda) ?? [];
      used.push(match.localId, match.visitanteId);
      byRound.set(match.ronda, used);
    });
    byRound.forEach((used) => {
      expect(new Set(used).size).toBe(playersPerRound);
    });
  });
});
