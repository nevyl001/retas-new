import {
  buildEliminatoriaFaseTimeline,
  buildEliminatoriaPossibleSchedule,
  categoriaKnockoutMinutes,
  categoriaNivelRank,
  defaultFaseBloques,
  faseBloqueKey,
  faseFromRondasActivas,
  inferFaseEliminacion,
  normalizeEliminatoriaCanchas,
  normalizeEliminatoriaDuraciones,
  orderCategoriasForEliminatoria,
  parseEliminatoriaRondasActivas,
  realignFasesToCategoriaOrden,
  reconcileFaseBloques,
  rondasFromFase,
  toggleEliminatoriaRonda,
  unionEliminatoriaRondas,
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
  it("cuenta oleadas: 4 cuartos en 1 cancha + 2 semis + final", () => {
    expect(categoriaKnockoutMinutes("cuartos")).toBe(420);
    expect(categoriaKnockoutMinutes("semifinal")).toBe(180);
    expect(categoriaKnockoutMinutes("octavos")).toBe(900);
  });

  it("en 3 canchas los cuartos caben en 2 oleadas", () => {
    expect(categoriaKnockoutMinutes("cuartos", undefined, 3)).toBe(240);
  });

  it("usa los minutos que puso el organizador", () => {
    expect(
      categoriaKnockoutMinutes(
        "cuartos",
        {
          octavos: 40,
          cuartos: 50,
          semifinal: 45,
          final: 70,
        },
        1
      )
    ).toBe(50 * 4 + 45 * 2 + 70);
  });
});

describe("buildEliminatoriaPossibleSchedule", () => {
  it("arranca la siguiente categoría cuando terminan los cuartos, no el cuadro entero", () => {
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
    // 1 cancha: 4 cuartos × 40 min. La 4ta espera solo esa ronda.
    expect(slots[1].startsAt?.toISOString()).toBe("2026-10-10T22:40:00.000Z");
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

describe("orden de fases entre categorías", () => {
  const cats = [
    {
      id: "mix",
      nombre: "Mixtos D",
      categoria: "Mixtos D",
      fase_eliminacion: "cuartos" as const,
    },
    {
      id: "6ta",
      nombre: "6ta",
      categoria: "6ta Fuerza",
      fase_eliminacion: "cuartos" as const,
    },
  ];

  it("por defecto juega la misma ronda en todas las categorías antes de avanzar", () => {
    expect(defaultFaseBloques(cats, null).map(faseBloqueKey)).toEqual([
      "mix:cuartos",
      "6ta:cuartos",
      "mix:semifinal",
      "6ta:semifinal",
      "mix:final",
      "6ta:final",
    ]);
  });

  it("respeta un orden guardado y agrega la fase que faltaba", () => {
    const canonical = defaultFaseBloques(cats, null);
    expect(
      reconcileFaseBloques(
        ["6ta:cuartos", "mix:cuartos", "mix:final"],
        canonical
      ).map(faseBloqueKey)
    ).toEqual([
      "6ta:cuartos",
      "mix:cuartos",
      "mix:final",
      "mix:semifinal",
      "6ta:semifinal",
      "6ta:final",
    ]);
  });

  it("al reordenar categorías, cada ronda conserva su lugar", () => {
    const fases = defaultFaseBloques(cats, ["mix", "6ta"]);
    expect(
      realignFasesToCategoriaOrden(fases, ["6ta", "mix"]).map(faseBloqueKey)
    ).toEqual([
      "6ta:cuartos",
      "mix:cuartos",
      "6ta:semifinal",
      "mix:semifinal",
      "6ta:final",
      "mix:final",
    ]);
  });

  it("programa las semis después de los cuartos de todas las categorías", () => {
    const timeline = buildEliminatoriaFaseTimeline({
      categorias: cats,
      startAt: new Date("2026-10-09T14:00:00.000Z"),
      courtCount: 3,
      duraciones: { octavos: 60, cuartos: 60, semifinal: 60, final: 60 },
    });
    const mixSemi = timeline.find(
      (entry) => entry.torneoId === "mix" && entry.ronda === "semifinal"
    );
    const sextaCuartos = timeline.find(
      (entry) => entry.torneoId === "6ta" && entry.ronda === "cuartos"
    );
    expect(sextaCuartos?.startsAtMs).toBe(Date.parse("2026-10-09T16:00:00.000Z"));
    expect(mixSemi?.startsAtMs).toBe(Date.parse("2026-10-09T18:00:00.000Z"));
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

  it("convierte la fase de una categoría a sus rondas", () => {
    expect(rondasFromFase("semifinal")).toEqual(["semifinal", "final"]);
    expect(rondasFromFase(null)).toEqual(["cuartos", "semifinal", "final"]);
  });

  it("une las rondas de varias categorías", () => {
    expect(unionEliminatoriaRondas({})).toEqual([
      "cuartos",
      "semifinal",
      "final",
    ]);
    expect(
      unionEliminatoriaRondas({
        mix: ["cuartos", "semifinal", "final"],
        quinta: ["octavos", "cuartos", "semifinal", "final"],
      })
    ).toEqual(["octavos", "cuartos", "semifinal", "final"]);
  });
});
