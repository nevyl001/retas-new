import {
  applyPartidoToEquipoRankingStats,
  compareEquiposRanking,
  emptyEquipoRankingStats,
} from "./equiposRanking";

describe("applyPartidoToEquipoRankingStats (parejas_fijas — games acumulados)", () => {
  it("partido 6-4: ganador suma 6 puntos, perdedor suma 4", () => {
    const winner = emptyEquipoRankingStats();
    const loser = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(winner, 6, 4);
    applyPartidoToEquipoRankingStats(loser, 4, 6);

    expect(winner.puntos).toBe(6);
    expect(winner.games_favor).toBe(6);
    expect(winner.games_contra).toBe(4);
    expect(winner.partidos_jugados).toBe(1);
    expect(winner.partidos_ganados).toBe(1);
    expect(winner.partidos_perdidos).toBe(0);

    expect(loser.puntos).toBe(4);
    expect(loser.games_favor).toBe(4);
    expect(loser.games_contra).toBe(6);
    expect(loser.partidos_jugados).toBe(1);
    expect(loser.partidos_ganados).toBe(0);
    expect(loser.partidos_perdidos).toBe(1);
  });

  it("partido 2-1: PG al ganador por sets aunque pierda games totales", () => {
    const winner = emptyEquipoRankingStats();
    const loser = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(winner, 19, 21, true);
    applyPartidoToEquipoRankingStats(loser, 21, 19, false);

    expect(winner.partidos_ganados).toBe(1);
    expect(loser.partidos_perdidos).toBe(1);
    expect(winner.puntos).toBe(19);
    expect(loser.puntos).toBe(21);
  });

  it("legacy sin matchWon: empate 5-5 no suma PG ni PP", () => {
    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();

    applyPartidoToEquipoRankingStats(a, 5, 5);
    applyPartidoToEquipoRankingStats(b, 5, 5);

    expect(a.puntos).toBe(5);
    expect(b.puntos).toBe(5);
    expect(a.partidos_ganados).toBe(0);
    expect(a.partidos_perdidos).toBe(0);
    expect(b.partidos_ganados).toBe(0);
    expect(b.partidos_perdidos).toBe(0);
    expect(a.partidos_jugados).toBe(1);
    expect(b.partidos_jugados).toBe(1);
  });

  it("no usa sistema 3/1/0", () => {
    const stats = emptyEquipoRankingStats();
    applyPartidoToEquipoRankingStats(stats, 6, 4);
    expect(stats.puntos).not.toBe(3);
    expect(stats.puntos).toBe(6);

    const tie = emptyEquipoRankingStats();
    applyPartidoToEquipoRankingStats(tie, 5, 5);
    expect(tie.puntos).not.toBe(1);
    expect(tie.puntos).toBe(5);
  });
});

describe("compareEquiposRanking", () => {
  it("ordena primero por games acumulados (puntos)", () => {
    const high = {
      puntos: 20,
      diferencia_games: 0,
      games_favor: 20,
      partidos_ganados: 2,
      partidos_jugados: 3,
      nombre: "A",
    };
    const low = {
      puntos: 15,
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
      puntos: 20,
      diferencia_games: 6,
      games_favor: 20,
      partidos_ganados: 2,
      partidos_jugados: 3,
      nombre: "A",
    };
    const worseDif = {
      puntos: 20,
      diferencia_games: 2,
      games_favor: 22,
      partidos_ganados: 3,
      partidos_jugados: 3,
      nombre: "B",
    };
    expect(compareEquiposRanking(betterDif, worseDif)).toBeLessThan(0);
  });
});
