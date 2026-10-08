import {
  isBrandingDirty,
  isEliminatoriaConfigDirty,
  isReglasDirty,
} from "./eventoDetalleDirty";

const saved = {
  clasificacion_modo: "dif_puntos" as const,
  partido_formato: "flexible" as const,
  logo_source: "club" as const,
  flyer_url: null,
};

describe("isReglasDirty", () => {
  it("limpio si coincide con lo guardado o no hay evento", () => {
    expect(isReglasDirty(saved, { clasificacionModo: "dif_puntos", partidoFormato: "flexible" })).toBe(false);
    expect(isReglasDirty(null, { clasificacionModo: "setto_pg", partidoFormato: "flexible" })).toBe(false);
  });

  it("detecta cambio de clasificación o de formato", () => {
    expect(isReglasDirty(saved, { clasificacionModo: "setto_pg", partidoFormato: "flexible" })).toBe(true);
    expect(isReglasDirty(saved, { clasificacionModo: "dif_puntos", partidoFormato: "bo3_super_muerte" })).toBe(true);
  });

  it("no mezcla horario de eliminatoria con reglas", () => {
    expect(
      isReglasDirty(saved, {
        clasificacionModo: "dif_puntos",
        partidoFormato: "flexible",
      })
    ).toBe(false);
  });

  it("volver al valor original deja de ser cambio", () => {
    expect(isReglasDirty(saved, { clasificacionModo: "dif_puntos", partidoFormato: "flexible" })).toBe(false);
  });
});

describe("isEliminatoriaConfigDirty", () => {
  it("detecta cambio de inicio, orden o canchas", () => {
    expect(
      isEliminatoriaConfigDirty(saved, {
        eliminatoriaInicio: "2026-10-10T20:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isEliminatoriaConfigDirty(
        saved,
        { eliminatoriaCategoriaOrden: ["b", "a"] },
        ["a", "b"]
      )
    ).toBe(true);
    expect(
      isEliminatoriaConfigDirty(
        saved,
        { eliminatoriaCategoriaOrden: ["a", "b"] },
        ["a", "b"]
      )
    ).toBe(false);
    expect(
      isEliminatoriaConfigDirty(saved, { eliminatoriaCanchas: ["1", "2"] })
    ).toBe(true);
    expect(isEliminatoriaConfigDirty(saved, { eliminatoriaCanchas: [] })).toBe(
      false
    );
    expect(
      isEliminatoriaConfigDirty(saved, {
        eliminatoriaDuraciones: { cuartos: 45 },
      })
    ).toBe(true);
    expect(
      isEliminatoriaConfigDirty(saved, { eliminatoriaDuraciones: {} })
    ).toBe(false);
  });

  it("el mismo instante de inicio no es sucio aunque el ISO venga distinto", () => {
    const withInicio = {
      ...saved,
      eliminatoria_inicio: "2026-10-09 14:00:00+00",
    };
    expect(
      isEliminatoriaConfigDirty(withInicio, {
        eliminatoriaInicio: "2026-10-09T14:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isEliminatoriaConfigDirty(
        { ...saved, eliminatoria_inicio: "2026-10-09T14:00:00+00" },
        { eliminatoriaInicio: "2026-10-09T14:00:00.000Z" }
      )
    ).toBe(false);
  });

  it("un horario ya guardado no pide confirmar al salir", () => {
    const cats = [
      { id: "mix", fase_eliminacion: "cuartos" as const },
      { id: "6ta", fase_eliminacion: "cuartos" as const },
    ];
    const withHorario = {
      ...saved,
      eliminatoria_inicio: "2026-10-09T14:00:00+00:00",
      eliminatoria_categoria_orden: ["mix", "6ta"],
      eliminatoria_canchas: ["1", "2"],
      eliminatoria_duraciones: {
        octavos: 60,
        cuartos: 60,
        semifinal: 60,
        final: 60,
      },
    };
    expect(
      isEliminatoriaConfigDirty(
        withHorario,
        {
          eliminatoriaInicio: "2026-10-09T14:00:00.000Z",
          eliminatoriaCategoriaOrden: ["mix", "6ta"],
          eliminatoriaCanchas: ["1", "2"],
          eliminatoriaDuraciones: {
            octavos: 60,
            cuartos: 60,
            semifinal: 60,
            final: 60,
            activas: ["cuartos", "semifinal", "final"],
          },
          categoriaRondas: {
            mix: ["cuartos", "semifinal", "final"],
            "6ta": ["cuartos", "semifinal", "final"],
          },
        },
        ["mix", "6ta"],
        cats
      )
    ).toBe(false);
  });

  it("no marca sucio el orden mientras el formulario aún hidrata", () => {
    const cats = [{ id: "mix", fase_eliminacion: "cuartos" as const }];
    expect(
      isEliminatoriaConfigDirty(
        { ...saved, eliminatoria_categoria_orden: ["mix"] },
        { eliminatoriaCategoriaOrden: [] },
        ["mix"],
        cats
      )
    ).toBe(false);
  });
});

describe("isBrandingDirty", () => {
  it("evento recién cargado no está modificado (flyer null ≡ vacío)", () => {
    expect(isBrandingDirty(saved, { logoSource: "club", flyerUrl: "" })).toBe(false);
  });

  it("detecta cambio de origen del logo", () => {
    expect(isBrandingDirty(saved, { logoSource: "flyer", flyerUrl: "" })).toBe(true);
  });

  it("detecta cambio de URL del flyer e ignora espacios", () => {
    const withFlyer = { ...saved, logo_source: "flyer" as const, flyer_url: "https://x/f.png" };
    expect(isBrandingDirty(withFlyer, { logoSource: "flyer", flyerUrl: " https://x/f.png " })).toBe(false);
    expect(isBrandingDirty(withFlyer, { logoSource: "flyer", flyerUrl: "https://x/g.png" })).toBe(true);
  });

  it("sin evento no hay cambios", () => {
    expect(isBrandingDirty(null, { logoSource: "flyer", flyerUrl: "x" })).toBe(false);
  });
});
