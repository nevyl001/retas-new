import { isBrandingDirty, isReglasDirty } from "./eventoDetalleDirty";

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

  it("detecta cambio de inicio u orden de eliminatoria", () => {
    expect(
      isReglasDirty(saved, {
        clasificacionModo: "dif_puntos",
        partidoFormato: "flexible",
        eliminatoriaInicio: "2026-10-10T20:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isReglasDirty(
        saved,
        {
          clasificacionModo: "dif_puntos",
          partidoFormato: "flexible",
          eliminatoriaCategoriaOrden: ["b", "a"],
        },
        ["a", "b"]
      )
    ).toBe(true);
    expect(
      isReglasDirty(
        saved,
        {
          clasificacionModo: "dif_puntos",
          partidoFormato: "flexible",
          eliminatoriaCategoriaOrden: ["a", "b"],
        },
        ["a", "b"]
      )
    ).toBe(false);
  });

  it("volver al valor original deja de ser cambio", () => {
    expect(isReglasDirty(saved, { clasificacionModo: "dif_puntos", partidoFormato: "flexible" })).toBe(false);
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
