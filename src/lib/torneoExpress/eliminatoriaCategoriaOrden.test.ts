import {
  buildEliminatoriaPossibleSchedule,
  categoriaKnockoutMinutes,
  categoriaNivelRank,
  faseFromRondasActivas,
  inferFaseEliminacion,
  normalizeEliminatoriaCanchas,
  normalizeEliminatoriaDuraciones,
  orderCategoriasForEliminatoria,
  parseEliminatoriaRondasActivas,
  toggleEliminatoriaRonda,
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

describe("categoriaKnockoutMinutes", () => {
  it("suma cuartos + semis + final por defecto", () => {
    expect(categoriaKnockoutMinutes("cuartos")).toBe(180);
    expect(categoriaKnockoutMinutes("semifinal")).toBe(120);
    expect(categoriaKnockoutMinutes("octavos")).toBe(240);
  });

  it("usa los minutos que puso el organizador", () => {
    expect(
      categoriaKnockoutMinutes("cuartos", {
        octavos: 40,
        cuartos: 50,
        semifinal: 45,
        final: 70,
      })
    ).toBe(165);
  });
});

describe("buildEliminatoriaPossibleSchedule", () => {
  it("escalona con la duración real de cada categoría", () => {
    const slots = buildEliminatoriaPossibleSchedule(
      [
        {
          id: "mix",
          nombre: "Mixtos D",
          categoria: "Mixtos D",
          fase_eliminacion: "cuartos",
        },
        {
          id: "4ta",
          nombre: "4ta",
          categoria: "4ta Fuerza",
          fase_eliminacion: "cuartos",
        },
      ],
      null,
      "2026-10-10T20:00:00.000Z",
      null,
      { octavos: 60, cuartos: 40, semifinal: 40, final: 40 }
    );
    expect(slots).toHaveLength(2);
    expect(slots[0].label).toBe("Mixtos D");
    expect(slots[0].startsAt?.toISOString()).toBe("2026-10-10T20:00:00.000Z");
    expect(slots[1].startsAt?.toISOString()).toBe("2026-10-10T22:00:00.000Z");
  });

  it("deja la hora vacía si el evento no fijó inicio", () => {
    const slots = buildEliminatoriaPossibleSchedule(
      [{ id: "mix", nombre: "Mixtos D", categoria: "Mixtos D" }],
      null,
      null
    );
    expect(slots[0].startsAt).toBeNull();
  });

  it("adjunta las canchas disponibles a cada categoría", () => {
    const slots = buildEliminatoriaPossibleSchedule(
      [{ id: "mix", nombre: "Mixtos D", categoria: "Mixtos D" }],
      null,
      null,
      ["1", "2"]
    );
    expect(slots[0].courts).toEqual(["1", "2"]);
  });
});

describe("normalizeEliminatoriaCanchas", () => {
  it("quita vacíos y duplicados", () => {
    expect(normalizeEliminatoriaCanchas(["1", " 1 ", "", "2"])).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("normalizeEliminatoriaDuraciones", () => {
  it("rellena y recorta minutos inválidos", () => {
    expect(normalizeEliminatoriaDuraciones({ cuartos: 50, final: 999 })).toEqual(
      {
        octavos: 60,
        cuartos: 50,
        semifinal: 60,
        final: 240,
      }
    );
  });
});

describe("rondas activas de eliminatoria", () => {
  it("por defecto no incluye octavos", () => {
    expect(parseEliminatoriaRondasActivas(null)).toEqual([
      "cuartos",
      "semifinal",
      "final",
    ]);
  });

  it("al marcar octavos también activa cuartos", () => {
    expect(
      toggleEliminatoriaRonda(["cuartos", "semifinal", "final"], "octavos", true)
    ).toEqual(["octavos", "cuartos", "semifinal", "final"]);
  });

  it("al quitar cuartos también quita octavos", () => {
    expect(
      toggleEliminatoriaRonda(
        ["octavos", "cuartos", "semifinal", "final"],
        "cuartos",
        false
      )
    ).toEqual(["semifinal", "final"]);
  });

  it("infiere cuartos si el organizador no marcó octavos", () => {
    expect(faseFromRondasActivas(["cuartos", "semifinal", "final"])).toBe(
      "cuartos"
    );
    expect(inferFaseEliminacion(null, { activas: ["semifinal", "final"] })).toBe(
      "semifinal"
    );
  });
});
