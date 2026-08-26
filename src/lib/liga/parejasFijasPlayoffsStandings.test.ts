import {
  compareParejasFijasPlayoffsStandings,
  findUnresolvedPlayoffsStandingTies,
  headToHeadClassificationPointsDiff,
  sortParejasFijasPlayoffsStandings,
  type PlayoffsH2HMatch,
  type PlayoffsStandingRow,
} from "./parejasFijasPlayoffsStandings";
import { seedsFromRankingOrder } from "./parejasFijasPlayoffsBracket";

function row(
  id: string,
  puntos: number,
  dif: number,
  extras?: Partial<PlayoffsStandingRow>
): PlayoffsStandingRow {
  return {
    equipo_id: id,
    puntos,
    diferencia_games: dif,
    games_favor: extras?.games_favor ?? 50,
    partidos_ganados: extras?.partidos_ganados ?? 0,
    partidos_jugados: extras?.partidos_jugados ?? 0,
    nombre: extras?.nombre ?? id,
  };
}

describe("compareParejasFijasPlayoffsStandings", () => {
  const emptyCtx = { headToHeadMatches: [] as PlayoffsH2HMatch[] };

  it("Caso A — puntos mandan sobre DIF", () => {
    const a = row("A", 15, 5);
    const b = row("B", 14, 20);
    expect(compareParejasFijasPlayoffsStandings(a, b, emptyCtx)).toBeLessThan(0);
  });

  it("Caso B — DIF decide con mismos puntos", () => {
    const a = row("A", 15, 9);
    const b = row("B", 15, 6);
    expect(compareParejasFijasPlayoffsStandings(a, b, emptyCtx)).toBeLessThan(0);
  });

  it("Caso C — H2H decide con mismos PTS y DIF", () => {
    const matches: PlayoffsH2HMatch[] = [
      { equipo1Id: "A", equipo2Id: "B", points1: 3, points2: 0 },
      { equipo1Id: "B", equipo2Id: "A", points1: 1, points2: 2 },
    ];
    // A: 3+2=5 · B: 0+1=1
    expect(headToHeadClassificationPointsDiff("A", "B", matches)).toBe(4);
    const a = row("A", 15, 9);
    const b = row("B", 15, 9);
    expect(
      compareParejasFijasPlayoffsStandings(a, b, { headToHeadMatches: matches })
    ).toBeLessThan(0);
  });

  it("no usa GF aislado antes de H2H", () => {
    const a = row("A", 15, 9, { games_favor: 10 });
    const b = row("B", 15, 9, { games_favor: 99 });
    const matches: PlayoffsH2HMatch[] = [
      { equipo1Id: "A", equipo2Id: "B", points1: 2, points2: 1 },
    ];
    expect(
      compareParejasFijasPlayoffsStandings(a, b, { headToHeadMatches: matches })
    ).toBeLessThan(0);
  });

  it("Caso D — seeds usan el mismo orden del comparator", () => {
    const matches: PlayoffsH2HMatch[] = [
      { equipo1Id: "A", equipo2Id: "B", points1: 3, points2: 0 },
    ];
    const ranked = sortParejasFijasPlayoffsStandings(
      [row("B", 15, 9), row("A", 15, 9), row("C", 10, 0), row("D", 8, 0)],
      { headToHeadMatches: matches }
    );
    expect(ranked.map((r) => r.equipo_id)).toEqual(["A", "B", "C", "D"]);
    const seeds = seedsFromRankingOrder(ranked.map((r) => r.equipo_id));
    expect(seeds["1"]).toBe("A");
    expect(seeds["2"]).toBe("B");
  });

  it("Caso E — seeds congelados no se reordenan al cambiar stats", () => {
    const frozen = seedsFromRankingOrder(["A", "B", "C", "D"]);
    const later = sortParejasFijasPlayoffsStandings(
      [row("B", 99, 99), row("A", 1, -50), row("C", 10, 0), row("D", 8, 0)],
      emptyCtx
    );
    // Ranking vivo cambió, pero seeds congelados siguen A=1…
    expect(frozen["1"]).toBe("A");
    expect(later[0]!.equipo_id).toBe("B");
    expect(frozen["1"]).not.toBe(later[0]!.equipo_id);
  });

  it("empate absoluto tras H2H → comparator 0 y findUnresolved lo reporta", () => {
    const a = row("A", 15, 9);
    const b = row("B", 15, 9);
    const ctx = { headToHeadMatches: [] as PlayoffsH2HMatch[] };
    expect(compareParejasFijasPlayoffsStandings(a, b, ctx)).toBe(0);
    const ties = findUnresolvedPlayoffsStandingTies([a, b], ctx);
    expect(ties).toEqual([{ a: "A", b: "B" }]);
  });
});
