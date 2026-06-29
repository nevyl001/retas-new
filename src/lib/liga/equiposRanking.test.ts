import {
  applyPartidoToEquipoRankingStats,
  compareEquiposRanking,
  emptyEquipoRankingStats,
} from "./equiposRanking";

describe("applyPartidoToEquipoRankingStats (parejas_fijas — puntos 3/2/0)", () => {
  it("victoria 2-0 suma 3 puntos y games a favor", () => {
    const winner = emptyEquipoRankingStats();
    const loser = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(winner, 12, 4, true, 3);
    applyPartidoToEquipoRankingStats(loser, 4, 12, false, 0);

    expect(winner.puntos).toBe(3);
    expect(winner.games_favor).toBe(12);
    expect(winner.games_contra).toBe(4);
    expect(winner.partidos_ganados).toBe(1);

    expect(loser.puntos).toBe(0);
    expect(loser.games_favor).toBe(4);
    expect(loser.partidos_perdidos).toBe(1);
  });

  it("victoria 2-1 STB suma 2 puntos aunque tenga más games", () => {
    const winner = emptyEquipoRankingStats();
    const loser = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(winner, 19, 21, true, 2);
    applyPartidoToEquipoRankingStats(loser, 21, 19, false, 0);

    expect(winner.partidos_ganados).toBe(1);
    expect(loser.partidos_perdidos).toBe(1);
    expect(winner.puntos).toBe(2);
    expect(loser.puntos).toBe(0);
    expect(winner.games_favor).toBe(19);
    expect(loser.games_favor).toBe(21);
  });

  it("legacy sin matchWon ni rankingPoints: empate 5-5 no suma PG ni PP", () => {
    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(a, 5, 5);
    applyPartidoToEquipoRankingStats(b, 5, 5);

    expect(a.puntos).toBe(0);
    expect(b.puntos).toBe(0);
    expect(a.partidos_ganados).toBe(0);
    expect(a.partidos_perdidos).toBe(0);
  });
});

describe("compareEquiposRanking", () => {
  it("ordena primero por puntos de ranking", () => {
    const high = {
      puntos: 6,
      diferencia_games: 0,
      games_favor: 20,
      partidos_ganados: 2,
      partidos_jugados: 3,
      nombre: "A",
    };
    const low = {
      puntos: 4,
      diferencia_games: 10,
      games_favor: 25,
      partidos_ganados: 5,
      partidos_jugados: 2,
      nombre: "B",
    };
    expect(compareEquiposRanking(high, low)).toBeLessThan(0);
  });

  it("en empate de puntos, desempata por diferencia de games", () => {
    const betterDif = {
      puntos: 6,
      diferencia_games: 6,
      games_favor: 20,
      partidos_ganados: 2,
      partidos_jugados: 3,
      nombre: "A",
    };
    const worseDif = {
      puntos: 6,
      diferencia_games: 2,
      games_favor: 22,
      partidos_ganados: 3,
      partidos_jugados: 3,
      nombre: "B",
    };
    expect(compareEquiposRanking(betterDif, worseDif)).toBeLessThan(0);
  });
});
