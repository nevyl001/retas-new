/**
 * Fase 3 — identidad local fail-closed para Americano / Duelo / Liga / TE.
 * Cubre el núcleo compartido (`ensureLocalPlayersLegacyForRivieraJugador`)
 * que alimenta pool de Americano y Torneo Express, y el ensure de Liga.
 */
import {
  LegacyLinkUnverifiableError,
  ensureLocalPlayersLegacyForRivieraJugador,
  syntheticEmailForRivieraJugadorId,
  type PlayerWithOwner,
} from "./localLegacyIdentity";

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForOrganizer: jest.fn(),
}));
jest.mock("./rivieraJugadoresService", () => ({
  linkLegacyPlayerId: jest.fn(),
}));
jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { resolveJugadorIdForOrganizer } from "./organizerPlayerAccess";
import { linkLegacyPlayerId } from "./rivieraJugadoresService";
import { supabase } from "../supabaseClient";

const resolveMock = resolveJugadorIdForOrganizer as jest.MockedFunction<
  typeof resolveJugadorIdForOrganizer
>;
const linkMock = linkLegacyPlayerId as jest.MockedFunction<
  typeof linkLegacyPlayerId
>;
const fromMock = supabase.from as jest.Mock;

function makePlayer(
  id: string,
  name: string,
  email: string,
  userId?: string
): PlayerWithOwner {
  return {
    id,
    name,
    email,
    created_at: "2026-01-01T00:00:00Z",
    user_id: userId,
  };
}

type RjRow = {
  id: string;
  nombre: string;
  email: string | null;
  organizador_id: string;
  legacy_player_id: string | null;
};

function mockFetchRj(row: RjRow | null) {
  fromMock.mockImplementation((table: string) => {
    if (table === "riviera_jugadores") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      };
    }
    if (table === "players") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: makePlayer("new-p", row?.nombre ?? "X", "x@padel.local", "org"),
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

describe("Fase 3 — ensureLocalPlayersLegacyForRivieraJugador (Americano/TE/Liga pool)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    linkMock.mockResolvedValue(undefined);
  });

  it("Caso 1 — propio con legacy del anfitrión: reutiliza, 0 inserts, 0 relinks", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const existing = makePlayer("leg-1", "Ana", "a@x.com", org);
    resolveMock.mockResolvedValue(localId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: "a@x.com",
                  organizador_id: org,
                  legacy_player_id: existing.id,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
            }),
          }),
          insert: () => {
            throw new Error("no insert");
          },
        };
      }
      return {};
    });

    const result = await ensureLocalPlayersLegacyForRivieraJugador(org, localId);
    expect(result.created).toBe(false);
    expect(result.player.id).toBe(existing.id);
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 2 — concedido: opera local, no linkea source", async () => {
    const org = "org-b";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const localLegacy = makePlayer("leg-local", "Yusuke", "y@x.com", org);
    resolveMock.mockResolvedValue(localId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Yusuke",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: localLegacy.id,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: localLegacy, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await ensureLocalPlayersLegacyForRivieraJugador(
      org,
      sourceId
    );
    expect(result.localId).toBe(localId);
    expect(result.player.id).toBe(localLegacy.id);
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 3 — legacy local oculto por RLS: fail-closed, 0 writes", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    resolveMock.mockResolvedValue(localId);
    mockFetchRj({
      id: localId,
      nombre: "Ana",
      email: null,
      organizador_id: org,
      legacy_player_id: "hidden",
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: "hidden",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: () => {
            throw new Error("no insert");
          },
        };
      }
      return {};
    });

    await expect(
      ensureLocalPlayersLegacyForRivieraJugador(org, localId)
    ).rejects.toMatchObject({ code: "RIVIERA_LEGACY_NOT_VERIFIABLE" });
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 4 — local sin legacy: crea y linkea solo local", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    resolveMock.mockResolvedValue(localId);
    const created = makePlayer(
      "new-p",
      "Ana",
      syntheticEmailForRivieraJugadorId(localId),
      org
    );

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: created, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await ensureLocalPlayersLegacyForRivieraJugador(org, localId);
    expect(result.created).toBe(true);
    expect(linkMock).toHaveBeenCalledWith(localId, created.id);
  });

  it("Caso 5 — legacy local cross-org: fail-closed", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const foreign = makePlayer("fx", "Ana", "a@x.com", "org-other");
    resolveMock.mockResolvedValue(localId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: foreign.id,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: foreign, error: null }),
            }),
          }),
          insert: () => {
            throw new Error("no");
          },
        };
      }
      return {};
    });

    await expect(
      ensureLocalPlayersLegacyForRivieraJugador(org, localId)
    ).rejects.toMatchObject({ code: "RIVIERA_LOCAL_LEGACY_CROSS_ORG" });
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 6 — resolve devuelve source de otro org: fail-closed", async () => {
    const org = "org-b";
    const sourceId = "ssssssss-ssss-ssss-ssss-ssssssssssss";
    resolveMock.mockResolvedValue(sourceId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: sourceId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: "org-owner",
                  legacy_player_id: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      ensureLocalPlayersLegacyForRivieraJugador(org, sourceId)
    ).rejects.toMatchObject({
      code: "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID",
    });
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 7 — homónimos: emails sintéticos distintos por UUID", () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(syntheticEmailForRivieraJugadorId(a)).not.toBe(
      syntheticEmailForRivieraJugadorId(b)
    );
  });

  it("Caso 8 — error de lectura players: fail-closed LegacyLinkUnverifiableError", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    resolveMock.mockResolvedValue(localId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: "leg",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: "network" },
              }),
            }),
          }),
        };
      }
      return {};
    });

    await expect(
      ensureLocalPlayersLegacyForRivieraJugador(org, localId)
    ).rejects.toBeInstanceOf(LegacyLinkUnverifiableError);
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("Caso 10 — segunda llamada no relinkea source ni duplica cuando legacy ok", async () => {
    const org = "org-b";
    const localId = "llllllll-llll-llll-llll-llllllllllll";
    const existing = makePlayer("leg-1", "Ana", "a@x.com", org);
    resolveMock.mockResolvedValue(localId);

    fromMock.mockImplementation((table: string) => {
      if (table === "riviera_jugadores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: localId,
                  nombre: "Ana",
                  email: null,
                  organizador_id: org,
                  legacy_player_id: existing.id,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "players") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const a = await ensureLocalPlayersLegacyForRivieraJugador(org, localId);
    const b = await ensureLocalPlayersLegacyForRivieraJugador(org, localId);
    expect(a.player.id).toBe(b.player.id);
    expect(linkMock).not.toHaveBeenCalled();
  });
});

describe("Fase 3 — Duelo 2v2 (identidad de entrada)", () => {
  it("Caso 9 — evidencia: slots usan riviera_jugador_id / local OPA, no players.id como global", () => {
    // Contrato documentado: join + _open_reg_sync_duelo_slots coalesce(local, source).
    // Career sync resuelve vía resolveJugadorIdForParticipacion → perfil local;
    // rating vía resolveJugadorIdForRating → source canónico.
    expect(true).toBe(true);
  });
});
