import {
  isJugadorInGeneroBracket,
  normalizeRivieraGenero,
  parseRivieraGeneroFromPath,
} from "./genero";

describe("riviera genero", () => {
  it("normaliza valores conocidos", () => {
    expect(normalizeRivieraGenero("F")).toBe("F");
    expect(normalizeRivieraGenero("femenil")).toBe("F");
    expect(normalizeRivieraGenero("M")).toBe("M");
    expect(normalizeRivieraGenero(null)).toBeNull();
  });

  it("parsea segmentos de ruta", () => {
    expect(parseRivieraGeneroFromPath("femenil")).toBe("F");
    expect(parseRivieraGeneroFromPath("varonil")).toBe("M");
  });

  it("legacy sin género cuenta como varonil", () => {
    expect(isJugadorInGeneroBracket(null, "M")).toBe(true);
    expect(isJugadorInGeneroBracket(null, "F")).toBe(false);
    expect(isJugadorInGeneroBracket("F", "F")).toBe(true);
  });
});
