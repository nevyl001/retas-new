import { compareRotativoParejaJornadaRanking } from "./jornadaStats";

describe("compareRotativoParejaJornadaRanking", () => {
  const base = {
    nombre: "A / B",
    puntos: 10,
    games_favor: 10,
    games_contra: 8,
    victorias: 1,
  };

  it("prioriza puntos", () => {
    expect(
      compareRotativoParejaJornadaRanking(base, {
        ...base,
        nombre: "C / D",
        puntos: 12,
        games_favor: 12,
      })
    ).toBeGreaterThan(0);
  });

  it("con mismos puntos usa DIF (obtenidos − recibidos)", () => {
    expect(
      compareRotativoParejaJornadaRanking(
        { ...base, puntos: 10, games_favor: 10, games_contra: 9 },
        { ...base, nombre: "C / D", puntos: 10, games_favor: 10, games_contra: 6 }
      )
    ).toBeGreaterThan(0);
  });

  it("con mismos puntos y DIF usa ganados", () => {
    expect(
      compareRotativoParejaJornadaRanking(
        {
          ...base,
          puntos: 10,
          games_favor: 10,
          games_contra: 8,
          victorias: 1,
        },
        {
          ...base,
          nombre: "C / D",
          puntos: 10,
          games_favor: 10,
          games_contra: 8,
          victorias: 2,
        }
      )
    ).toBeGreaterThan(0);
  });
});
