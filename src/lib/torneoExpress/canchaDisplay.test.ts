import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "./canchaDisplay";

describe("canchaDisplay", () => {
  it("muestra Cancha 1 por defecto", () => {
    expect(formatCanchaDisplay(null)).toBe("Cancha 1");
    expect(formatCanchaDisplay("")).toBe("Cancha 1");
  });

  it("formatea número guardado", () => {
    expect(formatCanchaDisplay("2")).toBe("Cancha 2");
  });

  it("normaliza vacío a 1", () => {
    expect(normalizeCanchaForSave("")).toBe("1");
    expect(normalizeCanchaForSave("  3 ")).toBe("3");
  });

  it("draft desde valor guardado", () => {
    expect(canchaDraftFromStored("2")).toBe("2");
    expect(canchaDraftFromStored(null)).toBe("1");
  });
});
