import {
  clampNumGrupos,
  parseNumGruposInput,
  resolveNumGrupos,
} from "./numGruposInput";

describe("parseNumGruposInput", () => {
  it("permite vaciar el campo (móvil: borrar el 2 por defecto)", () => {
    expect(parseNumGruposInput("")).toBe("");
    expect(parseNumGruposInput("   ")).toBe("");
  });

  it("acepta el dígito que el usuario escribe sin forzar 2", () => {
    expect(parseNumGruposInput("3")).toBe(3);
    expect(parseNumGruposInput("8")).toBe(8);
    expect(parseNumGruposInput("1")).toBe(1);
  });

  it("no convierte vacío en 2 (regresión del || 2)", () => {
    expect(parseNumGruposInput("")).not.toBe(2);
    expect(Number("") || 2).toBe(2); // el bug antiguo
  });
});

describe("clampNumGrupos / resolveNumGrupos", () => {
  it("acota a 2–8 al confirmar", () => {
    expect(clampNumGrupos(1)).toBe(2);
    expect(clampNumGrupos(9)).toBe(8);
    expect(clampNumGrupos(4)).toBe(4);
  });

  it("mientras el input está vacío mantiene 2 grupos en el draft", () => {
    expect(resolveNumGrupos("")).toBe(2);
    expect(resolveNumGrupos(3)).toBe(3);
  });
});
