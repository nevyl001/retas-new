import {
  buildStandings,
  calcularPuntos,
  calculateFinalStandings,
} from "./standings";

describe("standings v2.0", () => {
  it("derrota no suma puntos de clasificación", () => {
    expect(calcularPuntos(0, 0)).toBe(0);
    expect(calcularPuntos(2, 1)).toBe(5);
  });

  it("0 victorias implica 0 puntos", () => {
    const standings = buildStandings(
      [
        { id: "a", name: "A", seed: 0 },
        { id: "b", name: "B", seed: 1 },
        { id: "c", name: "C", seed: 2 },
      ],
      [
        { pairAId: "a", pairBId: "b", gamesA: 4, gamesB: 6 },
        { pairAId: "a", pairBId: "c", gamesA: 3, gamesB: 6 },
      ]
    );
    const a = standings.find((s) => s.pairId === "a")!;
    expect(a.PG).toBe(0);
    expect(a.puntos).toBe(0);
  });

  it("desempata por diferencia cuando puntos empatan", () => {
    const pairs = [
      { id: "fuerte", name: "Fuerte", seed: 0 },
      { id: "debil", name: "Débil", seed: 1 },
    ];
    const matches = [
      { pairAId: "fuerte", pairBId: "debil", gamesA: 6, gamesB: 2 },
      { pairAId: "fuerte", pairBId: "debil", gamesA: 5, gamesB: 6 },
    ];
    const sorted = calculateFinalStandings(pairs, matches);
    expect(sorted[0].puntos).toBe(sorted[1].puntos);
    expect(sorted[0].pairId).toBe("fuerte");
    expect(sorted[0].diferencia).toBeGreaterThan(sorted[1].diferencia);
  });

  it("enfrentamiento directo desempata cuando puntos y dif empatan", () => {
    const pairs = [
      { id: "p1", name: "P1", seed: 0 },
      { id: "p2", name: "P2", seed: 1 },
    ];
    const matches = [{ pairAId: "p1", pairBId: "p2", gamesA: 6, gamesB: 3 }];
    const sorted = calculateFinalStandings(pairs, matches);
    expect(sorted[0].pairId).toBe("p1");
    expect(sorted[0].PG).toBe(1);
    expect(sorted[1].puntos).toBe(0);
  });
});
