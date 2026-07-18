/**
 * Identidad canónica = riviera_jugadores.id.
 * Cero resolución / escritura / idempotencia por nombre.
 */
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
  listActiveGrantedAccessForOrganizer: jest.fn(),
  prepareGrantedPlayersForParticipacionSync: jest.fn(),
  ensureGrantedPlayerLocal: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  createRivieraJugador: jest.fn(),
  ensureRivieraJugadorVisibleEnRanking: jest.fn(),
  getRivieraJugadorByLegacyLigaId: jest.fn(),
  getRivieraJugadorByLegacyPlayerId: jest.fn(),
  linkLegacyPlayerId: jest.fn(),
  listRivieraJugadoresByLegacyPlayerId: jest.fn(),
}));

jest.mock("./careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn(),
}));

import { supabase } from "../supabaseClient";
import { isJugadorImportBlocked } from "./jugadorImportBlocklist";
import {
  getOrCreateJugadorId,
  resolveJugadorIdForParticipacion,
} from "./jugadorIdResolver";
import { isCareerIntegrityException } from "./careerIntegrity";
import {
  isRevokedGrantLocalJugador,
  listActiveGrantedAccessForOrganizer,
  resolveJugadorIdForOrganizer,
} from "./organizerPlayerAccess";
import {
  createRivieraJugador,
  getRivieraJugadorByLegacyLigaId,
  getRivieraJugadorByLegacyPlayerId,
  ensureRivieraJugadorVisibleEnRanking,
  linkLegacyPlayerId,
  listRivieraJugadoresByLegacyPlayerId,
} from "./rivieraJugadoresService";
import { ensureRivieraIdentity } from "./careerIdentity";
import { requireOfficialProfileLinkForParticipacion } from "./orphanProfileLink";

const mockBlocked = isJugadorImportBlocked as jest.MockedFunction<
  typeof isJugadorImportBlocked
>;
const mockByLegacy = getRivieraJugadorByLegacyPlayerId as jest.MockedFunction<
  typeof getRivieraJugadorByLegacyPlayerId
>;
const mockByLiga = getRivieraJugadorByLegacyLigaId as jest.MockedFunction<
  typeof getRivieraJugadorByLegacyLigaId
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
const mockListByLegacy = listRivieraJugadoresByLegacyPlayerId as jest.MockedFunction<
  typeof listRivieraJugadoresByLegacyPlayerId
>;
const mockListGrants = listActiveGrantedAccessForOrganizer as jest.MockedFunction<
  typeof listActiveGrantedAccessForOrganizer
>;
const mockCreate = createRivieraJugador as jest.MockedFunction<
  typeof createRivieraJugador
>;
const mockEnsureIdentity = ensureRivieraIdentity as jest.MockedFunction<
  typeof ensureRivieraIdentity
>;
const mockRequireLink =
  requireOfficialProfileLinkForParticipacion as jest.MockedFunction<
    typeof requireOfficialProfileLinkForParticipacion
  >;

const ORG = "org-hack";

function mockWritableLocal(localId: string | null): void {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.ilike = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    // slugExistsForOrg: no existente → evita bucle infinito en ensureUniqueSlug
    if (table === "riviera_jugadores") {
      chain.maybeSingle = jest.fn().mockImplementation(async () => {
        // Distinguir writable lookup (tiene estado) vs slug (solo id):
        // devolvemos writable solo cuando hay localId; slug check usa select("id")
        // y también maybeSingle — usamos null para slug-only por defecto en create path.
        return localId
          ? { data: { id: localId, estado: "activo" }, error: null }
          : { data: null, error: null };
      });
    } else {
      chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    }
    chain.insert = jest.fn().mockImplementation(() => {
      const insertChain: Record<string, jest.Mock> = {};
      insertChain.select = jest.fn().mockReturnValue(insertChain);
      insertChain.single = jest.fn().mockResolvedValue({
        data: { id: "created-by-legacy" },
        error: null,
      });
      return insertChain;
    });
    return chain;
  });
}

/** Mock que permite create: slug libre + writable tras insert. */
function mockCreatePathWritable(): void {
  let phase: "slug" | "writable" = "slug";
  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockImplementation(async () => {
      if (phase === "slug") {
        return { data: null, error: null };
      }
      return {
        data: { id: "created-by-legacy", estado: "activo" },
        error: null,
      };
    });
    chain.insert = jest.fn().mockImplementation(() => {
      phase = "writable";
      const insertChain: Record<string, jest.Mock> = {};
      insertChain.select = jest.fn().mockReturnValue(insertChain);
      insertChain.single = jest.fn().mockResolvedValue({
        data: { id: "created-by-legacy" },
        error: null,
      });
      return insertChain;
    });
    return chain;
  });
}

function assertNoIdentityIlike(): void {
  const fromMock = supabase.from as jest.Mock;
  for (const call of fromMock.mock.results) {
    const chain = call.value as { ilike?: jest.Mock } | undefined;
    if (chain?.ilike) {
      expect(chain.ilike).not.toHaveBeenCalled();
    }
  }
}

describe("jugadorIdResolver — identidad solo por IDs fuertes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlocked.mockResolvedValue(false);
    mockVisible.mockResolvedValue(undefined);
    mockLinkLegacy.mockResolvedValue(undefined);
    mockListByLegacy.mockResolvedValue([]);
    mockListGrants.mockResolvedValue([]);
    mockRevoked.mockResolvedValue(false);
    mockByLegacy.mockResolvedValue(null);
    mockByLiga.mockResolvedValue(null);
    mockEnsureIdentity.mockResolvedValue(undefined as never);
    mockRequireLink.mockResolvedValue({
      linked: true,
      confidence: "OK",
      reason: "ok",
    } as never);
  });

  it("riviera_jugador_id explícito válido conserva ese ID aunque exista homónimo", async () => {
    mockResolveOrg.mockResolvedValue("explicit-id");
    mockWritableLocal("explicit-id");

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: ORG,
      jugadorId: "explicit-id",
      nombre: "Juan Homónimo",
      legacyPlayerId: "legacy-other",
      tipoEvento: "duelo_2v2",
    });

    expect(id).toBe("explicit-id");
    expect(mockListGrants).not.toHaveBeenCalled();
    expect(mockByLegacy).not.toHaveBeenCalled();
  });

  it("riviera_jugador_id explícito tiene prioridad sobre local_display_name (no consulta grants por nombre)", async () => {
    mockResolveOrg.mockResolvedValue("explicit-id");
    mockWritableLocal("explicit-id");
    mockListGrants.mockResolvedValue([
      {
        id: "g1",
        jugador_id: "other",
        owner_organizador_id: "org-x",
        local_jugador_id: "local-other",
        local_display_name: "Juan Homónimo",
        local_category: null,
      },
    ]);

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: ORG,
      jugadorId: "explicit-id",
      nombre: "Juan Homónimo",
      tipoEvento: "reta",
    });

    expect(id).toBe("explicit-id");
  });

  it("riviera_jugador_id explícito inválido: fail-closed, no cae a nombre", async () => {
    mockResolveOrg.mockResolvedValue("uuid-ajeno");
    mockWritableLocal(null);

    let caught: unknown;
    try {
      await resolveJugadorIdForParticipacion({
        organizadorId: ORG,
        jugadorId: "uuid-ajeno",
        nombre: "Sebastian",
        tipoEvento: "duelo_2v2",
      });
    } catch (e) {
      caught = e;
    }
    expect(isCareerIntegrityException(caught)).toBe(true);
    if (isCareerIntegrityException(caught)) {
      expect(caught.code).toBe("missing_riviera_id");
    }
  });

  it("dos homónimos con legacy_player_id distintos resuelven IDs distintos", async () => {
    mockByLegacy
      .mockResolvedValueOnce({ id: "rj-juan-a" } as never)
      .mockResolvedValueOnce({ id: "rj-juan-b" } as never);
    mockResolveOrg
      .mockResolvedValueOnce("rj-juan-a")
      .mockResolvedValueOnce("rj-juan-b");
    mockWritableLocal("rj-juan-a");

    const a = await getOrCreateJugadorId({
      nombre: "Juan",
      organizadorId: ORG,
      legacyPlayerId: "legacy-a",
    });

    mockWritableLocal("rj-juan-b");
    const b = await getOrCreateJugadorId({
      nombre: "Juan",
      organizadorId: ORG,
      legacyPlayerId: "legacy-b",
    });

    expect(a).toBe("rj-juan-a");
    expect(b).toBe("rj-juan-b");
    expect(a).not.toBe(b);
  });

  it("dos homónimos con legacy_liga_jugador_id distintos resuelven IDs distintos", async () => {
    mockByLiga
      .mockResolvedValueOnce({ id: "rj-liga-a" } as never)
      .mockResolvedValueOnce({ id: "rj-liga-b" } as never);

    const a = await getOrCreateJugadorId({
      nombre: "Luis",
      organizadorId: ORG,
      legacyLigaJugadorId: "liga-a",
    });
    const b = await getOrCreateJugadorId({
      nombre: "Luis",
      organizadorId: ORG,
      legacyLigaJugadorId: "liga-b",
    });

    expect(a).toBe("rj-liga-a");
    expect(b).toBe("rj-liga-b");
  });

  it("legacy_player_id válido: cero query de identidad por nombre (ilike)", async () => {
    mockByLegacy.mockResolvedValue({ id: "rj-1" } as never);
    mockResolveOrg.mockResolvedValue("rj-1");
    mockWritableLocal("rj-1");

    const id = await getOrCreateJugadorId({
      nombre: "Aime",
      organizadorId: ORG,
      legacyPlayerId: "legacy-aime",
    });

    expect(id).toBe("rj-1");
    assertNoIdentityIlike();
  });

  it("legacy_liga_jugador_id válido: cero query por nombre", async () => {
    mockByLiga.mockResolvedValue({ id: "rj-liga" } as never);
    mockWritableLocal("rj-liga");

    const id = await getOrCreateJugadorId({
      nombre: "Pedro",
      organizadorId: ORG,
      legacyLigaJugadorId: "liga-1",
    });

    expect(id).toBe("rj-liga");
    assertNoIdentityIlike();
  });

  it("solo nombre: unresolved, no crea, no ilike", async () => {
    mockWritableLocal(null);

    const created = await getOrCreateJugadorId({
      nombre: "Solo Nombre",
      organizadorId: ORG,
    });
    expect(created).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();

    const resolved = await resolveJugadorIdForParticipacion({
      organizadorId: ORG,
      nombre: "Solo Nombre",
      tipoEvento: "reta",
    });
    expect(resolved).toBeNull();
    assertNoIdentityIlike();
  });

  it("sync con legacy fuerte no resuelto crea identidad; repetir resuelve la misma", async () => {
    mockByLegacy.mockResolvedValue(null);
    mockCreatePathWritable();
    mockResolveOrg.mockResolvedValue("created-by-legacy");

    const first = await getOrCreateJugadorId({
      nombre: "Nuevo",
      organizadorId: ORG,
      legacyPlayerId: "legacy-new",
    });
    expect(first).toBe("created-by-legacy");

    mockByLegacy.mockResolvedValue({ id: "created-by-legacy" } as never);
    mockWritableLocal("created-by-legacy");
    mockResolveOrg.mockResolvedValue("created-by-legacy");
    const second = await getOrCreateJugadorId({
      nombre: "Nuevo",
      organizadorId: ORG,
      legacyPlayerId: "legacy-new",
    });
    expect(second).toBe("created-by-legacy");
  });

  it("grant con mismo local_display_name no cambia identidad (función eliminada)", async () => {
    mockListByLegacy.mockResolvedValue([]);
    mockListGrants.mockResolvedValue([
      {
        id: "g1",
        jugador_id: "source",
        owner_organizador_id: "org-x",
        local_jugador_id: "local-wrong",
        local_display_name: "Daniel N",
        local_category: null,
      },
    ]);
    mockByLegacy.mockResolvedValue(null);
    mockCreatePathWritable();
    mockResolveOrg.mockResolvedValue("created-by-legacy");

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: ORG,
      nombre: "Daniel N",
      legacyPlayerId: "players-id-solo-hack",
      tipoEvento: "reta",
    });

    expect(id).toBe("created-by-legacy");
    expect(id).not.toBe("local-wrong");
  });

  it("cierre sin ID fuerte: unresolved, cero insert", async () => {
    const insertSpy = jest.fn();
    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: insertSpy,
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));

    const id = await resolveJugadorIdForParticipacion({
      organizadorId: ORG,
      nombre: "Sin ID",
      tipoEvento: "americano",
    });

    expect(id).toBeNull();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
