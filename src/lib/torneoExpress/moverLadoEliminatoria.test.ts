import { cruceDelOtroLado } from "./moverLadoEliminatoria";

describe("cruceDelOtroLado", () => {
  const cruces = [0, 1, 2, 3];

  it("cambia el lado de la semifinal sin mezclar local y visita", () => {
    expect(cruceDelOtroLado(0, cruces)).toBe(2);
    expect(cruceDelOtroLado(2, cruces)).toBe(0);
    expect(cruceDelOtroLado(1, cruces)).toBe(3);
    expect(cruceDelOtroLado(3, cruces)).toBe(1);
  });

  it("no tiene otro lado si el cuadro solo tiene una mitad", () => {
    expect(cruceDelOtroLado(0, [0, 1])).toBeNull();
  });
});
