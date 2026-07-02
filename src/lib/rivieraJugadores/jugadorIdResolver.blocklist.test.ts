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
  linkLegacyPlayerId: jest.fn(),
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
  linkLegacyPlayerId,
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
const mockLinkLegacy = linkLegacyPlayerId as jest.MockedFunction<
  typeof linkLegacyPlayerId
>;

function mockWritableLocalJugador(localId: string | null): void {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue(
            localId
              ? { data: { id: localId, estado: "activo" }, error: null }
              : { data: null, error: null }
          ),
        }),
      }),
    }),
  });
}

describe("getOrCreateJugadorId blocklist", () => {
  beforeEach(() => {
    mockBlocked.mockReset();
    mockByLegacy.mockReset();
    mockVisible.mockReset();
    mockResolveOrg.mockReset();
    mockLinkLegacy.mockReset();
    (supabase.from as jest.Mock).mockReset();
    mockVisible.mockResolvedValue(undefined);
    mockLinkLegacy.mockResolvedValue(undefined);
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
    mockByLegacy.mockResolvedValueOnce({
      id: "jugador-existente",
    } as Awaited<ReturnType<typeof getRivieraJugadorByLegacyPlayerId>>);
    mockResolveOrg.mockResolvedValue("jugador-existente");
    mockWritableLocalJugador("jugador-existente");

    const id = await getOrCreateJugadorId({
      nombre: "Aime",
      organizadorId: "org-hack",
      legacyPlayerId: "legacy-aime",
    });

    expect(id).toBe("jugador-existente");
    expect(mockVisible).toHaveBeenCalledWith("jugador-existente");
    expect(mockLinkLegacy).toHaveBeenCalledWith("jugador-existente", "legacy-aime");
  });

  it("cedido: legacy en perfil origen resuelve al clon local del club", async () => {
    mockBlocked.mockResolvedValue(false);
    mockByLegacy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "source-riviera-daniel",
      } as Awaited<ReturnType<typeof getRivieraJugadorByLegacyPlayerId>>);
    mockResolveOrg.mockResolvedValue("local-hack-daniel");
    mockWritableLocalJugador("local-hack-daniel");

    const id = await getOrCreateJugadorId({
      nombre: "Daniel N",
      organizadorId: "org-hack",
      legacyPlayerId: "legacy-daniel",
    });

    expect(id).toBe("local-hack-daniel");
    expect(mockResolveOrg).toHaveBeenCalledWith(
      "org-hack",
      "source-riviera-daniel"
    );
    expect(mockLinkLegacy).toHaveBeenCalledWith(
      "local-hack-daniel",
      "legacy-daniel"
    );
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
