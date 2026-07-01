jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("./jugadorImportBlocklist", () => ({
  isJugadorImportBlocked: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForOrganizer: jest.fn(),
  isRevokedGrantLocalJugador: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  createRivieraJugador: jest.fn(),
  ensureRivieraJugadorVisibleEnRanking: jest.fn(),
  getRivieraJugadorByLegacyLigaId: jest.fn(),
  getRivieraJugadorByLegacyPlayerId: jest.fn(),
}));

import { supabase } from "../supabaseClient";
import { isJugadorImportBlocked } from "./jugadorImportBlocklist";
import {
  getOrCreateJugadorId,
  resolveJugadorIdForParticipacion,
} from "./jugadorIdResolver";
import {
  isRevokedGrantLocalJugador,
  resolveJugadorIdForOrganizer,
} from "./organizerPlayerAccess";
import {
  getRivieraJugadorByLegacyPlayerId,
  ensureRivieraJugadorVisibleEnRanking,
} from "./rivieraJugadoresService";

const mockBlocked = isJugadorImportBlocked as jest.MockedFunction<
  typeof isJugadorImportBlocked
>;
const mockByLegacy = getRivieraJugadorByLegacyPlayerId as jest.MockedFunction<
  typeof getRivieraJugadorByLegacyPlayerId
>;
const mockVisible = ensureRivieraJugadorVisibleEnRanking as jest.MockedFunction<
  typeof ensureRivieraJugadorVisibleEnRanking
>;
const mockResolveOrg = resolveJugadorIdForOrganizer as jest.MockedFunction<
  typeof resolveJugadorIdForOrganizer
>;
const mockRevoked = isRevokedGrantLocalJugador as jest.MockedFunction<
  typeof isRevokedGrantLocalJugador
>;

describe("getOrCreateJugadorId blocklist", () => {
  beforeEach(() => {
    mockBlocked.mockReset();
    mockByLegacy.mockReset();
    mockVisible.mockReset();
    mockVisible.mockResolvedValue(undefined);
  });

  it("no crea jugador si está en blocklist de import", async () => {
    mockBlocked.mockResolvedValue(true);

    const id = await getOrCreateJugadorId({
      nombre: "Sebastian",
      organizadorId: "org-hack",
      legacyPlayerId: "legacy-seb",
    });

    expect(id).toBeNull();
    expect(mockByLegacy).not.toHaveBeenCalled();
  });

  it("sigue resolviendo jugadores no bloqueados", async () => {
    mockBlocked.mockResolvedValue(false);
    mockByLegacy.mockResolvedValue({
      id: "jugador-existente",
    } as Awaited<ReturnType<typeof getRivieraJugadorByLegacyPlayerId>>);

    const id = await getOrCreateJugadorId({
      nombre: "Aime",
      organizadorId: "org-hack",
      legacyPlayerId: "legacy-aime",
    });

    expect(id).toBe("jugador-existente");
    expect(mockVisible).toHaveBeenCalledWith("jugador-existente");
  });
});

describe("resolveJugadorIdForParticipacion blocklist", () => {
  beforeEach(() => {
    mockBlocked.mockReset();
    mockResolveOrg.mockReset();
    mockRevoked.mockReset();
    mockVisible.mockReset();
    (supabase.from as jest.Mock).mockReset();
    mockVisible.mockResolvedValue(undefined);
    mockRevoked.mockResolvedValue(false);
  });

  it("omite duelo con UUID huérfano si el nombre está bloqueado", async () => {
    mockBlocked.mockResolvedValue(true);

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: "org-hack",
      jugadorId: "uuid-borrado-sebastian",
      nombre: "Sebastian",
      tipoEvento: "duelo_2v2",
      eventoId: "duelo-1",
    });

    expect(id).toBeNull();
    expect(mockResolveOrg).not.toHaveBeenCalled();
  });

  it("retorna null si el UUID no pertenece al club y no hay nombre", async () => {
    mockBlocked.mockResolvedValue(false);
    mockResolveOrg.mockResolvedValue("uuid-ajeno");
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: "org-hack",
      jugadorId: "uuid-ajeno",
      tipoEvento: "duelo_2v2",
      eventoId: "duelo-1",
    });

    expect(id).toBeNull();
  });
});
