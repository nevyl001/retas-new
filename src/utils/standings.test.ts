import {
  buildStandings,
  calcularPuntos,
  calculateFinalStandings,
  getHeadToHead,
  ordenarTabla,
} from "./standings";

describe("standings — orden DIF → PG → H2H", () => {
  it("PTS = PG×2 (solo visual)", () => {
    expect(calcularPuntos(0)).toBe(0);
    expect(calcularPuntos(3)).toBe(6);
  });

  it("ordena primero por mayor DIF", () => {
    const pairs = [
      { id: "lider", name: "Líder", seed: 0 },
      { id: "otro", name: "Otro", seed: 1 },
    ];
    const matches = [
      { pairAId: "lider", pairBId: "otro", gamesA: 18, gamesB: 6, winnerId: "lider" },
    ];
    const sorted = calculateFinalStandings(pairs, matches);
    expect(sorted[0].pairId).toBe("lider");
    expect(sorted[0].diferencia).toBe(12);
    expect(sorted[0].puntos).toBe(2);
  });

  it("con misma DIF, gana quien tiene más PG", () => {
    const row = (id: string, dif: number, pg: number) => ({
      pairId: id,
      pairName: id,
      seed: 0,
      PJ: pg,
      PG: pg,
      PE: 0,
      PP: 0,
      juegosFavor: 10 + dif,
      juegosContra: 10,
      diferencia: dif,
      puntos: pg * 2,
    });
    const sorted = ordenarTabla([row("a", 4, 1), row("b", 4, 2)], []);
    expect(sorted[0].pairId).toBe("b");
  });

  it("con misma DIF y PG, desempata enfrentamiento directo", () => {
    const row = (id: string) => ({
      pairId: id,
      pairName: id,
      seed: 0,
      PJ: 1,
      PG: 1,
      PE: 0,
      PP: 0,
      juegosFavor: 10,
      juegosContra: 10,
      diferencia: 0,
      puntos: 2,
    });
    const matches = [
      { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4, winnerId: "a" },
    ];
    const sorted = ordenarTabla([row("a"), row("b")], matches);
    expect(sorted[0].pairId).toBe("a");
    expect(getHeadToHead("a", "b", matches)).toBe(-1);
  });

  it("sin enfrentamiento directo mantiene empate (0)", () => {
    expect(getHeadToHead("a", "b", [])).toBe(0);
    expect(
      getHeadToHead("a", "b", [
        { pairAId: "a", pairBId: "x", gamesA: 6, gamesB: 0, winnerId: "a" },
      ])
    ).toBe(0);
  });

  it("0 victorias → 0 PTS", () => {
    const standings = buildStandings(
      [
        { id: "a", name: "A", seed: 0 },
        { id: "b", name: "B", seed: 1 },
      ],
      [{ pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 0, winnerId: "a" }]
    );
    const b = standings.find((s) => s.pairId === "b")!;
    expect(b.PG).toBe(0);
    expect(b.puntos).toBe(0);
  });
});
