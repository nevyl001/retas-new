import {
  clearPublicFichaHandoff,
  savePublicFichaHandoff,
  takePublicFichaHandoff,
} from "./publicFichaHandoff";

describe("publicFichaHandoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("guarda y relee handoff de forma idempotente (StrictMode-safe)", () => {
    savePublicFichaHandoff({
      jugadorId: "j1",
      organizadorId: "org1",
      nombre: "Ana",
      fotoUrl: null,
      categoria: "open",
      genero: "F",
      posicion: 3,
      puntosClub: 120,
      rivieraId: "RIV-1",
    });

    const first = takePublicFichaHandoff("org1", "j1");
    expect(first?.nombre).toBe("Ana");
    expect(first?.posicion).toBe(3);
    // Remount / 2.º load: mismo handoff sigue disponible durante TTL.
    expect(takePublicFichaHandoff("org1", "j1")?.nombre).toBe("Ana");
  });

  it("clear elimina el handoff tras perfil confirmado", () => {
    savePublicFichaHandoff({
      jugadorId: "j1",
      organizadorId: "org1",
      nombre: "Ana",
      fotoUrl: null,
      categoria: "open",
      genero: "F",
      posicion: 1,
      puntosClub: 10,
      rivieraId: null,
    });
    expect(takePublicFichaHandoff("org1", "j1")?.nombre).toBe("Ana");
    clearPublicFichaHandoff("org1", "j1");
    expect(takePublicFichaHandoff("org1", "j1")).toBeNull();
  });

  it("ignora handoff de otro jugador/org", () => {
    savePublicFichaHandoff({
      jugadorId: "j1",
      organizadorId: "org1",
      nombre: "Ana",
      fotoUrl: null,
      categoria: "open",
      genero: "F",
      posicion: 1,
      puntosClub: 10,
      rivieraId: null,
    });
    expect(takePublicFichaHandoff("org1", "j2")).toBeNull();
    expect(takePublicFichaHandoff("org2", "j1")).toBeNull();
  });
});
