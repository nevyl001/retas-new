import { fetchTorneoExpressBundle } from "../../../services/torneoExpressService";
import { syncTorneoExpressParticipaciones } from "./torneoExpress";
import { fetchPairsByIds, registrarPuntosRanking } from "./core";
import { resolveJugadorForEventSync } from "../careerEventPipeline/careerEventPlayerSync";

jest.mock("../../../services/torneoExpressService", () => ({
  fetchTorneoExpressBundle: jest.fn(),
}));

jest.mock("../careerEventPipeline/careerEventPlayerSync", () => ({
  ...jest.requireActual("../careerEventPipeline/careerEventPlayerSync"),
  resolveJugadorForEventSync: jest.fn(),
}));

jest.mock("./core", () => ({
  ...jest.requireActual("./core"),
  registrarPuntosRanking: jest.fn(),
  fetchPairsByIds: jest.fn(),
}));

const mockFetchBundle = fetchTorneoExpressBundle as jest.Mock;
const mockRegistrar = registrarPuntosRanking as jest.Mock;
const mockFetchPairs = fetchPairsByIds as jest.Mock;
const mockResolveJugador = resolveJugadorForEventSync as jest.Mock;

function bundleWith(torneo: Record<string, unknown>) {
  return {
    torneo: {
      id: "torneo-1",
      nombre: "Hack Padel Fest",
      estado: "finalizado",
      fase_torneo: "cerrado",
      created_at: "2026-07-01T00:00:00Z",
      ...torneo,
    },
    categorias: [],
    grupos: [],
    parejasPorGrupo: { g1: [{ pareja_id: "pair-1" }] },
    partidosPorGrupo: {},
    eliminatoriaPartidos: [],
  };
}

describe("syncTorneoExpressParticipaciones — metadata de categoría", () => {
  beforeEach(() => {
    // CRA activa resetMocks: las implementaciones se fijan en cada prueba.
    mockFetchBundle.mockReset();
    mockRegistrar.mockReset().mockResolvedValue({
      ok: true,
      jugadorId: "jugador-1",
      participacionId: "part-1",
    });
    mockResolveJugador.mockReset().mockResolvedValue({ jugadorId: "jugador-1" });
    mockFetchPairs.mockReset().mockResolvedValue([
      {
        id: "pair-1",
        player1_id: "legacy-1",
        player1_name: "Josue",
        player2_id: null,
        player2_name: null,
      },
    ]);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("guarda metadata.categoria y metadata.evento_id sin perder otros metadatos", async () => {
    mockFetchBundle.mockResolvedValue(
      bundleWith({ categoria: " Mixtos D ", evento_id: "evento-macro-1" })
    );

    await syncTorneoExpressParticipaciones("torneo-1", "org-1");

    expect(mockRegistrar).toHaveBeenCalledTimes(1);
    const { metadata } = mockRegistrar.mock.calls[0][0];
    expect(metadata).toMatchObject({
      subtipo: "express_cierre",
      modalidad: "torneo_express",
      torneo_express_id: "torneo-1",
      categoria: "Mixtos D",
      evento_id: "evento-macro-1",
    });
    expect(metadata).toHaveProperty("partidos_ganados");
    expect(metadata).toHaveProperty("lugar");
  });

  it("no inventa categoría ni evento_id cuando el torneo no los tiene", async () => {
    mockFetchBundle.mockResolvedValue(
      bundleWith({ categoria: null, evento_id: null })
    );

    await syncTorneoExpressParticipaciones("torneo-1", "org-1");

    const { metadata } = mockRegistrar.mock.calls[0][0];
    expect(metadata).not.toHaveProperty("categoria");
    expect(metadata).not.toHaveProperty("evento_id");
    expect(metadata.torneo_express_id).toBe("torneo-1");
  });
});
