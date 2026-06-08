import {
  buildStandings,
  calcularPuntos,
  calculateFinalStandings,
  getHeadToHead,
  ordenarTabla,
} from "./standings";

const row = (
  id: string,
  fav: number,
  con: number,
  pg: number
) => ({
  pairId: id,
  pairName: id,
  seed: 0,
  PJ: pg,
  PG: pg,
  PE: 0,
  PP: 0,
  juegosFavor: fav,
  juegosContra: con,
  diferencia: fav - con,
  puntos: pg * 2,
});

describe("standings — orden FAV → DIF → PG → H2H", () => {
  it("PTS = PG×2 (solo visual)", () => {
    expect(calcularPuntos(0)).toBe(0);
    expect(calcularPuntos(3)).toBe(6);
  });

  it("ordena primero por mayor FAV aunque DIF sea menor", () => {
    const sorted = ordenarTabla(
      [row("aurelio", 18, 17, 2), row("carlos", 19, 20, 1)],
      []
    );
    expect(sorted[0].pairId).toBe("carlos");
    expect(sorted[0].juegosFavor).toBe(19);
    expect(sorted[0].diferencia).toBe(-1);
    expect(sorted[1].juegosFavor).toBe(18);
    expect(sorted[1].diferencia).toBe(1);
  });

  it("con mismo FAV, gana mayor DIF", () => {
    const sorted = ordenarTabla(
      [row("a", 20, 18, 2), row("b", 20, 22, 2)],
      []
    );
    expect(sorted[0].pairId).toBe("a");
    expect(sorted[0].diferencia).toBe(2);
    expect(sorted[1].diferencia).toBe(-2);
  });

  it("con mismo FAV y DIF, gana más PG antes que H2H", () => {
    const sorted = ordenarTabla(
      [row("a", 20, 20, 1), row("b", 20, 20, 2)],
      []
    );
    expect(sorted[0].pairId).toBe("b");
  });

  it("con mismo FAV, DIF y PG, desempata enfrentamiento directo", () => {
    const matches = [
      { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4, winnerId: "a" },
    ];
    const sorted = ordenarTabla(
      [row("a", 20, 20, 1), row("b", 20, 20, 1)],
      matches
    );
    expect(sorted[0].pairId).toBe("a");
    expect(getHeadToHead("a", "b", matches)).toBe(-1);
  });

  it("sin enfrentamiento directo mantiene empate (0)", () => {
    expect(getHeadToHead("a", "b", [])).toBe(0);
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

  it("integración: más games anotados lidera la tabla", () => {
    const pairs = [
      { id: "lider", name: "Líder", seed: 0 },
      { id: "otro", name: "Otro", seed: 1 },
    ];
    const matches = [
      { pairAId: "lider", pairBId: "otro", gamesA: 26, gamesB: 19, winnerId: "lider" },
    ];
    const sorted = calculateFinalStandings(pairs, matches);
    expect(sorted[0].pairId).toBe("lider");
    expect(sorted[0].juegosFavor).toBe(26);
  });
});
