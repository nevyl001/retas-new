/**
 * getOrCreateJugadorId es el camino de sync/import con clave legacy fuerte.
 * El correo no es obligatorio. Sin legacy fuerte no crea (política C).
 */
import { supabase } from "../supabaseClient";
import { getOrCreateJugadorId } from "./jugadorIdResolver";

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("./jugadorImportBlocklist", () => ({
  isJugadorImportBlocked: jest.fn().mockResolvedValue(false),
}));

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForOrganizer: jest.fn().mockResolvedValue("jugador-nuevo-sin-correo"),
  isRevokedGrantLocalJugador: jest.fn(),
  listActiveGrantedAccessForOrganizer: jest.fn().mockResolvedValue([]),
  prepareGrantedPlayersForParticipacionSync: jest.fn(),
  ensureGrantedPlayerLocal: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  createRivieraJugador: jest.fn(),
  ensureRivieraJugadorVisibleEnRanking: jest.fn().mockResolvedValue(undefined),
  getRivieraJugadorByLegacyLigaId: jest.fn().mockResolvedValue(null),
  getRivieraJugadorByLegacyPlayerId: jest.fn().mockResolvedValue(null),
  linkLegacyPlayerId: jest.fn(),
  listRivieraJugadoresByLegacyPlayerId: jest.fn().mockResolvedValue([]),
}));

const ORG = "org-hack";

function mockInsertSucceeds() {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.insert = jest.fn().mockImplementation(() => {
      const insertChain: Record<string, jest.Mock> = {};
      insertChain.select = jest.fn().mockReturnValue(insertChain);
      insertChain.single = jest.fn().mockResolvedValue({
        data: { id: "jugador-nuevo-sin-correo" },
        error: null,
      });
      return insertChain;
    });
    return chain;
  });
}

describe("getOrCreateJugadorId — histórico/sync sin exigir correo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea con legacy fuerte sin correo", async () => {
    mockInsertSucceeds();

    const id = await getOrCreateJugadorId({
      nombre: "Participante Historico",
      organizadorId: ORG,
      legacyPlayerId: "legacy-hist-1",
    });

    expect(id).toBe("jugador-nuevo-sin-correo");
  });

  it("sin legacy fuerte: no crea", async () => {
    mockInsertSucceeds();

    const id = await getOrCreateJugadorId({
      nombre: "Otro Historico",
      organizadorId: ORG,
      email: undefined,
    });

    expect(id).toBeNull();
  });
});
