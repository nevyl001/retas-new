import { jornadaEnLaQueVa } from "./jornadaAvance";

describe("jornadaEnLaQueVa", () => {
  it("prioriza la jornada abierta, luego la próxima y al final la última jugada", () => {
    expect(
      jornadaEnLaQueVa([
        { numero: 1, estado: "completed" },
        { numero: 3, estado: "upcoming" },
        { numero: 2, estado: "in_progress" },
      ])
    ).toBe(2);
    expect(
      jornadaEnLaQueVa([
        { numero: 1, estado: "completed" },
        { numero: 4, estado: "upcoming" },
        { numero: 2, estado: "upcoming" },
      ])
    ).toBe(2);
    expect(
      jornadaEnLaQueVa([
        { numero: 10, estado: "completed" },
        { numero: 11, estado: "completed" },
      ])
    ).toBe(11);
    expect(jornadaEnLaQueVa([])).toBeNull();
  });
});
