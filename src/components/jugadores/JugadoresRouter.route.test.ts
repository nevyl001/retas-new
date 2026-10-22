import { isJugadoresPublicPath, parseJugadoresPath } from "./JugadoresRouter";

describe("ficha por Riviera ID", () => {
  it("reconoce /ranking/jugador/RIV-00000011 como ficha pública", () => {
    expect(parseJugadoresPath("/ranking/jugador/RIV-00000011")).toEqual({
      kind: "publicFicha",
      rivieraId: "RIV-00000011",
    });
    expect(parseJugadoresPath("/ranking/jugador/riv-00000011/")).toEqual({
      kind: "publicFicha",
      rivieraId: "RIV-00000011",
    });
    expect(isJugadoresPublicPath("/ranking/jugador/RIV-00000011")).toBe(true);
  });

  it("no convierte el ranking del club en una ficha", () => {
    expect(parseJugadoresPath("/ranking/o/org-1/varonil").kind).toBe("publicRanking");
    expect(parseJugadoresPath("/ranking").kind).toBe("publicRanking");
  });
});
