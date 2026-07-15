/**
 * getOrCreateJugadorId es el camino silencioso de sync/import de eventos
 * (reta, torneo express, liga, americano, duelo, backfills) — NO es un
 * formulario de alta de producto. El correo obligatorio de la tarea "email
 * obligatorio para jugadores nuevos" NO debe aplicar aquí: los participantes
 * legacy/históricos casi nunca tienen correo capturado, y forzarlo rompería
 * el cierre de eventos. Este test confirma que ese camino sigue creando
 * jugadores nuevos sin correo exactamente igual que antes.
 */
import { supabase } from "../supabaseClient";
import { getOrCreateJugadorId } from "./jugadorIdResolver";

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después de los imports es
// equivalente en tiempo de ejecución y respeta la regla import/first.
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
  resolveJugadorIdForOrganizer: jest.fn(),
  isRevokedGrantLocalJugador: jest.fn(),
  listActiveGrantedAccessForOrganizer: jest.fn().mockResolvedValue([]),
  prepareGrantedPlayersForParticipacionSync: jest.fn(),
  ensureGrantedPlayerLocal: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  createRivieraJugador: jest.fn(),
  ensureRivieraJugadorVisibleEnRanking: jest.fn().mockResolvedValue(undefined),
  getRivieraJugadorByLegacyLigaId: jest.fn(),
  getRivieraJugadorByLegacyPlayerId: jest.fn(),
  linkLegacyPlayerId: jest.fn(),
  listRivieraJugadoresByLegacyPlayerId: jest.fn().mockResolvedValue([]),
}));

const ORG = "org-hack";

function mockNoExistingMatchInsertSucceeds() {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.ilike = jest.fn().mockReturnValue(chain);
    chain.or = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    // Ni slugExistsForOrg ni la búsqueda por nombre encuentran nada.
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

describe("getOrCreateJugadorId — histórico/sync sigue sin exigir correo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea un jugador nuevo (sin coincidencia previa) sin correo, sin lanzar", async () => {
    mockNoExistingMatchInsertSucceeds();

    const id = await getOrCreateJugadorId({
      nombre: "Participante Historico",
      organizadorId: ORG,
    });

    expect(id).toBe("jugador-nuevo-sin-correo");
  });

  it("crea un jugador nuevo con email undefined explícito, sin lanzar", async () => {
    mockNoExistingMatchInsertSucceeds();

    const id = await getOrCreateJugadorId({
      nombre: "Otro Historico",
      organizadorId: ORG,
      email: undefined,
    });

    expect(id).toBe("jugador-nuevo-sin-correo");
  });
});
