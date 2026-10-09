import {
  buildEliminatoriaPreviewCards,
  matchSlotsFromFaseTimeline,
  previewCardsFromProjectedSlots,
} from "./eliminatoriaPreviewBracket";

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

  it("con 3 canchas programa 2 oleadas de cuartos y asigna cancha", () => {
    const { cards } = buildEliminatoriaPreviewCards({
      fase: "cuartos",
      startAt: new Date("2026-10-09T14:00:00.000Z"),
      courts: ["1", "2", "3"],
      duraciones: { octavos: 60, cuartos: 60, semifinal: 60, final: 60 },
      timeZone: "UTC",
    });
    const cuartos = cards.filter((c) => c.ronda === 1);
    expect(cuartos.map((c) => c.canchaLabel)).toEqual([
      "Cancha 1",
      "Cancha 2",
      "Cancha 3",
      "Cancha 1",
    ]);
    expect(cuartos[0].scheduleMs).toBe(Date.parse("2026-10-09T14:00:00.000Z"));
    expect(cuartos[3].scheduleMs).toBe(Date.parse("2026-10-09T15:00:00.000Z"));
    expect(cuartos[0].horaDisplay).toMatch(/14:00/);
  });

  it("las semis no arrancan encima de los cuartos de otra categoría", () => {
    const slots = matchSlotsFromFaseTimeline({
      categorias: [
        { id: "mix", nombre: "Mixtos", categoria: "Mixtos D" },
        { id: "6ta", nombre: "6ta", categoria: "6ta Fuerza" },
        { id: "5ta", nombre: "5ta", categoria: "5ta Fuerza" },
        { id: "4ta", nombre: "4ta", categoria: "4ta Fuerza" },
      ],
      startAt: new Date("2026-10-10T14:00:00.000Z"),
      courts: ["1", "2", "3"],
      duraciones: { octavos: 60, cuartos: 60, semifinal: 60, final: 60 },
    });
    const occupied: { court: string; start: number; end: number }[] = [];
    for (const torneoId of ["mix", "6ta", "5ta", "4ta"]) {
      const cards = previewCardsFromProjectedSlots({
        slots: slots[torneoId],
        fase: "cuartos",
        totalRondas: 3,
        timeZone: "America/Mexico_City",
      });
      expect(cards.filter((card) => card.ronda === 2)).toHaveLength(2);
      expect(cards.filter((card) => card.ronda === 3)).toHaveLength(1);
      for (const card of cards) {
        const slot = slots[torneoId].find(
          (item) =>
            item.ronda === card.ronda && item.cruceIndex === card.cruceIndex
        );
        expect(card.scheduleMs).toBe(slot?.startMs ?? null);
        if (card.scheduleMs == null || !slot?.cancha) continue;
        occupied.push({
          court: slot.cancha,
          start: card.scheduleMs,
          end: card.scheduleMs + slot.durationMin * 60 * 1000,
        });
      }
    }
    const mixSemi = slots.mix.find((slot) => slot.ronda === 2);
    const mixQuarterEnd = Math.max(
      ...slots.mix
        .filter((slot) => slot.ronda === 1)
        .map((slot) => (slot.startMs ?? 0) + slot.durationMin * 60 * 1000)
    );
    expect(mixSemi?.startMs).toBeGreaterThanOrEqual(mixQuarterEnd);
    const sextaFirst = slots["6ta"].find((slot) => slot.ronda === 1);
    const mixLastQuarter = slots.mix
      .filter((slot) => slot.ronda === 1)
      .reduce((latest, slot) => Math.max(latest, slot.startMs ?? 0), 0);
    expect(sextaFirst?.startMs).toBeLessThan(
      mixLastQuarter + 60 * 60 * 1000
    );
    for (let i = 0; i < occupied.length; i += 1) {
      for (let j = i + 1; j < occupied.length; j += 1) {
        if (occupied[i].court !== occupied[j].court) continue;
        const overlaps =
          occupied[i].start < occupied[j].end &&
          occupied[j].start < occupied[i].end;
        expect(overlaps).toBe(false);
      }
    }
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
