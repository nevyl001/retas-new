import { buildEliminatoriaPreviewCards } from "./eliminatoriaPreviewBracket";

describe("buildEliminatoriaPreviewCards", () => {
  it("arma el cuadro de cuartos sin nombres de clasificados", () => {
    const { cards, totalRondas } = buildEliminatoriaPreviewCards({
      fase: "cuartos",
    });
    expect(totalRondas).toBe(3);
    expect(cards.filter((c) => c.ronda === 1)).toHaveLength(4);
    expect(cards.filter((c) => c.ronda === 2)).toHaveLength(2);
    expect(cards.filter((c) => c.ronda === 3)).toHaveLength(1);
    expect(cards[0].local.label).toBe("");
    expect(cards[0].visit.label).toBe("");
    expect(cards[0].horaDisplay).toBe("");
  });

  it("reparte partidos en canchas y avanza la hora con la duración de la ronda", () => {
    const { cards } = buildEliminatoriaPreviewCards({
      fase: "cuartos",
      startAt: new Date("2026-10-10T20:00:00.000Z"),
      courts: ["1", "2"],
      duraciones: { octavos: 60, cuartos: 40, semifinal: 40, final: 40 },
      timeZone: "UTC",
    });
    const cuartos = cards.filter((c) => c.ronda === 1);
    expect(cuartos[0].scheduleMs).toBe(Date.parse("2026-10-10T20:00:00.000Z"));
    expect(cuartos[1].scheduleMs).toBe(Date.parse("2026-10-10T20:00:00.000Z"));
    expect(cuartos[2].scheduleMs).toBe(Date.parse("2026-10-10T20:40:00.000Z"));
    expect(cuartos[3].scheduleMs).toBe(Date.parse("2026-10-10T20:40:00.000Z"));
    const semis = cards.filter((c) => c.ronda === 2);
    expect(semis[0].scheduleMs).toBe(Date.parse("2026-10-10T21:20:00.000Z"));
    const final = cards.filter((c) => c.ronda === 3);
    expect(final[0].scheduleMs).toBe(Date.parse("2026-10-10T22:00:00.000Z"));
    expect(cuartos[0].horaDisplay).toMatch(/20:00/);
    expect(cuartos[0].canchaLabel).toBe("Cancha 1");
  });

  it("arma octavos con 8 cruces en la primera ronda", () => {
    const { cards, totalRondas } = buildEliminatoriaPreviewCards({
      fase: "octavos",
    });
    expect(totalRondas).toBe(4);
    expect(cards.filter((c) => c.ronda === 1)).toHaveLength(8);
    expect(cards.filter((c) => c.ronda === 4)).toHaveLength(1);
  });
});
