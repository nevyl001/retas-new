import { parejaTieneHistorial, partidoTieneHistorial } from "./partidoHistorial";

const limpio = {
  estado: "pendiente" as const,
  ganador_id: null,
  puntos_local: null,
  puntos_visitante: null,
  sets_resultado: null,
};

describe("partidoTieneHistorial", () => {
  it("un pendiente sin marcador no tiene historial", () => {
    expect(partidoTieneHistorial(limpio)).toBe(false);
  });

  it("estado jugado bloquea", () => {
    expect(partidoTieneHistorial({ ...limpio, estado: "jugado" })).toBe(true);
  });

  it("puntos, ganador o sets bloquean aunque el estado siga pendiente", () => {
    expect(partidoTieneHistorial({ ...limpio, puntos_local: 6 })).toBe(true);
    expect(partidoTieneHistorial({ ...limpio, puntos_visitante: 4 })).toBe(true);
    expect(partidoTieneHistorial({ ...limpio, ganador_id: "a" })).toBe(true);
    expect(
      partidoTieneHistorial({
        ...limpio,
        sets_resultado: [{ local: 6, visitante: 4 }],
      })
    ).toBe(true);
  });

  it("sets vacíos no cuentan como resultado", () => {
    expect(partidoTieneHistorial({ ...limpio, sets_resultado: [] })).toBe(false);
  });
});

describe("parejaTieneHistorial", () => {
  const partidos = [
    {
      ...limpio,
      pareja_local_id: "A",
      pareja_visitante_id: "B",
      estado: "jugado" as const,
    },
    {
      ...limpio,
      pareja_local_id: "C",
      pareja_visitante_id: "D",
    },
  ];

  it("otra pareja jugada no bloquea a quien no ha disputado", () => {
    expect(parejaTieneHistorial(partidos, "C")).toBe(false);
    expect(parejaTieneHistorial(partidos, "D")).toBe(false);
  });

  it("la pareja que ya jugó sí queda bloqueada, en local o visita", () => {
    expect(parejaTieneHistorial(partidos, "A")).toBe(true);
    expect(parejaTieneHistorial(partidos, "B")).toBe(true);
  });
});
