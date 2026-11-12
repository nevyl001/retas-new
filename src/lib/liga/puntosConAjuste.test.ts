import {
  deltaAjusteDesdeTotal,
  puntosOficialesConAjuste,
} from "./puntosConAjuste";

describe("puntos oficiales a partir del ajuste", () => {
  it("la jornada siguiente suma sobre el total ajustado, no sobre los juegos previos", () => {
    const delta = deltaAjusteDesdeTotal({
      totalDeseado: 14,
      puntosPartidos: 29,
      puntosHeredados: 0,
    });
    expect(delta).toBe(-15);

    const siguiente = puntosOficialesConAjuste({
      puntosPartidos: 29 + 24,
      puntosHeredados: 0,
      ajusteDelta: delta,
    });
    expect(siguiente).toBe(38);
  });

  it("sin ajuste, el total es la suma de juegos", () => {
    expect(
      puntosOficialesConAjuste({
        puntosPartidos: 24,
        puntosHeredados: 0,
        ajusteDelta: 0,
      })
    ).toBe(24);
  });

  it("un ajuste nuevo reemplaza el delta y la jornada que sigue parte de ese total", () => {
    const delta = deltaAjusteDesdeTotal({
      totalDeseado: 30,
      puntosPartidos: 53,
      puntosHeredados: 0,
    });
    expect(
      puntosOficialesConAjuste({
        puntosPartidos: 53 + 10,
        puntosHeredados: 0,
        ajusteDelta: delta,
      })
    ).toBe(40);
  });
});
