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

  it("H2H desempata con mismos puntos, dif, juegos favor y PG", () => {
    const pairs = [
      { id: "a", name: "A", seed: 0 },
      { id: "b", name: "B", seed: 1 },
      { id: "c", name: "C", seed: 2 },
    ];
    const matches = [
      { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4 },
      { pairAId: "a", pairBId: "c", gamesA: 4, gamesB: 6 },
      { pairAId: "b", pairBId: "c", gamesA: 6, gamesB: 4 },
    ];
    const sorted = calculateFinalStandings(pairs, matches);
    expect(sorted[0].pairId).toBe("a");
    expect(sorted[0].puntos).toBe(sorted[1].puntos);
    expect(sorted[0].diferencia).toBe(sorted[1].diferencia);
    expect(sorted[0].juegosFavor).toBe(sorted[1].juegosFavor);
  });

  it("más PTS FAV desempata cuando puntos y DIF empatan (sin H2H)", () => {
    const pairs = [
      { id: "dave", name: "Dave", seed: 0 },
      { id: "gabo", name: "Gabo", seed: 1 },
      { id: "p3", name: "P3", seed: 2 },
      { id: "p4", name: "P4", seed: 3 },
    ];
    const matches = [
      { pairAId: "dave", pairBId: "p3", gamesA: 8, gamesB: 6 },
      { pairAId: "dave", pairBId: "p4", gamesA: 8, gamesB: 4 },
      { pairAId: "gabo", pairBId: "p3", gamesA: 6, gamesB: 4 },
      { pairAId: "gabo", pairBId: "p4", gamesA: 9, gamesB: 5 },
    ];
    const sorted = calculateFinalStandings(pairs, matches);
    const dave = sorted.find((s) => s.pairId === "dave")!;
    const gabo = sorted.find((s) => s.pairId === "gabo")!;
    expect(dave.puntos).toBe(4);
    expect(gabo.puntos).toBe(4);
    expect(dave.diferencia).toBe(6);
    expect(gabo.diferencia).toBe(6);
    expect(sorted.indexOf(dave)).toBeLessThan(sorted.indexOf(gabo));
    expect(dave.juegosFavor).toBeGreaterThan(gabo.juegosFavor);
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
