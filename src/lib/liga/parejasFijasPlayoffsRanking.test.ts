import { emptyEquipoRankingStats } from "./equiposRanking";
import { foldPlayoffsMatchIntoRanking } from "./parejasFijasPlayoffsRanking";

const FORMAT = "parejas_fijas_playoffs" as const;

describe("foldPlayoffsMatchIntoRanking", () => {
  it("suma la victoria holgada aunque las columnas guardadas estén en cero", () => {
    const stats = new Map([
      ["a", emptyEquipoRankingStats()],
      ["b", emptyEquipoRankingStats()],
    ]);

    const applied = foldPlayoffsMatchIntoRanking(stats, {
      equipo1Id: "a",
      equipo2Id: "b",
      score1: 12,
      score2: 6,
      setScores: {
        format: FORMAT,
        wo: false,
        stb: null,
        sets: [
          { p1: 6, p2: 2 },
          { p1: 6, p2: 4 },
        ],
      },
    });

    expect(applied).toBe(true);
    expect(stats.get("a")).toMatchObject({
      puntos: 3,
      partidos_jugados: 1,
      partidos_ganados: 1,
      partidos_perdidos: 0,
      games_favor: 12,
      games_contra: 6,
    });
    expect(stats.get("b")).toMatchObject({
      puntos: 0,
      partidos_jugados: 1,
      partidos_ganados: 0,
      partidos_perdidos: 1,
      games_favor: 6,
      games_contra: 12,
    });
  });

  it("ignora un marcador que no se puede clasificar", () => {
    const stats = new Map([["a", emptyEquipoRankingStats()]]);
    const applied = foldPlayoffsMatchIntoRanking(stats, {
      equipo1Id: "a",
      equipo2Id: "b",
      score1: 6,
      score2: 6,
      setScores: { sets: [{ p1: 6, p2: 4, kind: "regular" }] },
    });
    expect(applied).toBe(false);
    expect(stats.get("a")?.puntos).toBe(0);
    expect(stats.get("a")?.partidos_jugados).toBe(0);
  });
});
