import {
  buildEliminatoriaPossibleSchedule,
  categoriaNivelRank,
  orderCategoriasForEliminatoria,
} from "./eliminatoriaCategoriaOrden";

describe("categoriaNivelRank", () => {
  it("pone mixtos D antes que 6ta y 4ta al final", () => {
    expect(categoriaNivelRank("Mixtos D")).toBeLessThan(
      categoriaNivelRank("6ta Fuerza")
    );
    expect(categoriaNivelRank("6ta Fuerza")).toBeLessThan(
      categoriaNivelRank("5ta Fuerza")
    );
    expect(categoriaNivelRank("5ta Fuerza")).toBeLessThan(
      categoriaNivelRank("4ta Fuerza")
    );
  });
});

describe("orderCategoriasForEliminatoria", () => {
  const cats = [
    { id: "4ta", nombre: "4ta", categoria: "4ta Fuerza" },
    { id: "mix", nombre: "Mixtos", categoria: "Mixtos D" },
    { id: "5ta", nombre: "5ta", categoria: "5ta Fuerza" },
    { id: "6ta", nombre: "6ta", categoria: "6ta Fuerza" },
  ];

  it("ordena de la más baja a la más alta si no hay orden guardado", () => {
    expect(orderCategoriasForEliminatoria(cats).map((c) => c.id)).toEqual([
      "mix",
      "6ta",
      "5ta",
      "4ta",
    ]);
  });

  it("respeta el orden guardado y agrega categorías nuevas al final por nivel", () => {
    expect(
      orderCategoriasForEliminatoria(cats, ["5ta", "mix"]).map((c) => c.id)
    ).toEqual(["5ta", "mix", "6ta", "4ta"]);
  });
});

describe("buildEliminatoriaPossibleSchedule", () => {
  it("escalona 60 minutos desde la hora de inicio", () => {
    const slots = buildEliminatoriaPossibleSchedule(
      [
        { id: "mix", nombre: "Mixtos D", categoria: "Mixtos D" },
        { id: "4ta", nombre: "4ta", categoria: "4ta Fuerza" },
      ],
      null,
      "2026-10-10T20:00:00.000Z"
    );
    expect(slots).toHaveLength(2);
    expect(slots[0].label).toBe("Mixtos D");
    expect(slots[0].startsAt?.toISOString()).toBe("2026-10-10T20:00:00.000Z");
    expect(slots[1].startsAt?.toISOString()).toBe("2026-10-10T21:00:00.000Z");
  });

  it("deja la hora vacía si el evento no fijó inicio", () => {
    const slots = buildEliminatoriaPossibleSchedule(
      [{ id: "mix", nombre: "Mixtos D", categoria: "Mixtos D" }],
      null,
      null
    );
    expect(slots[0].startsAt).toBeNull();
  });
});
