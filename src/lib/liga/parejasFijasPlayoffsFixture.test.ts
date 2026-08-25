import {
  assertPlayoffsFixtureInvariants,
  buildPlayoffsRegularFixture,
  expectedRegularMatchCount,
  jornadasPerVuelta,
  totalRegularJornadas,
} from "./parejasFijasPlayoffsFixture";
import {
  assertNoTeamDoubleBookedInRound,
  packPlayoffsJornadaBergerBlocks,
  packPlayoffsJornadaMatches,
} from "./parejasFijasPlayoffsSchedule";

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

describe("parejasFijasPlayoffsFixture (N variable)", () => {
  it.each([8, 10, 12, 15])(
    "N=%i: total N(N-1), 2(N-1) por pareja, cada combo ×2, sin BYE",
    (n) => {
      const ids = teams(n);
      const fixture = buildPlayoffsRegularFixture(ids);
      expect(fixture.matchCount).toBe(expectedRegularMatchCount(n));
      expect(fixture.jornadas).toHaveLength(totalRegularJornadas(n));
      expect(() => assertPlayoffsFixtureInvariants(fixture, ids)).not.toThrow();
    }
  );

  it("exige mínimo 4 parejas", () => {
    expect(() => buildPlayoffsRegularFixture(teams(3))).toThrow(/al menos 4/);
  });

  it("N=8: counts 8/8/8/4 por vuelta (2 Berger = 1 jornada)", () => {
    const fixture = buildPlayoffsRegularFixture(teams(8));
    expect(jornadasPerVuelta(8)).toBe(4);
    expect(fixture.jornadas.map((j) => j.matches.length)).toEqual([
      8, 8, 8, 4, 8, 8, 8, 4,
    ]);
  });

  it("N=10: counts 10/10/10/10/5 por vuelta", () => {
    const fixture = buildPlayoffsRegularFixture(teams(10));
    expect(jornadasPerVuelta(10)).toBe(5);
    expect(fixture.jornadas.map((j) => j.matches.length)).toEqual([
      10, 10, 10, 10, 5, 10, 10, 10, 10, 5,
    ]);
  });

  it("N=15: jornadas por vuelta = 8; total regular 16 jornadas", () => {
    const fixture = buildPlayoffsRegularFixture(teams(15));
    expect(jornadasPerVuelta(15)).toBe(8);
    expect(fixture.jornadas).toHaveLength(16);
    expect(fixture.matchCount).toBe(210);
  });

  it("empaqueta jornada con 3 canchas sin recortar partidos (N=10 → 10)", () => {
    const fixture = buildPlayoffsRegularFixture(teams(10));
    const j1 = fixture.jornadas[0]!;
    const packed = packPlayoffsJornadaBergerBlocks(j1.bergerBlocks, 3);
    expect(packed).toHaveLength(10);
    expect(() => assertNoTeamDoubleBookedInRound(packed)).not.toThrow();
    expect(packPlayoffsJornadaMatches(j1.matches, 3)).toHaveLength(10);
  });
});
