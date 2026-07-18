/**
 * Pre-close tipado + bloqueo: sync no corre si pre-close falla.
 */
jest.mock("../../supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));

jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn().mockResolvedValue({
    linked: true,
    confidence: "OK",
    reason: "ok",
    officialPlayerKey: "opk-1",
    rivieraId: "RIV-00000001",
  }),
}));

jest.mock("../jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
  resolveJugadorIdForParticipacion: jest.fn(),
}));

jest.mock("../syncParticipaciones", () => ({
  syncRetaParticipaciones: jest.fn(),
  syncDuelo2v2Participaciones: jest.fn(),
  syncAmericanoParticipaciones: jest.fn(),
  syncTorneoExpressParticipaciones: jest.fn(),
  syncLigaJornada: jest.fn(),
  syncLigaFinalPodio: jest.fn(),
  syncLigaInscripcionRanking: jest.fn(),
}));

jest.mock("../rivieraJugadoresService", () => ({
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./assertions", () => {
  const actual = jest.requireActual("./assertions") as typeof import("./assertions");
  return {
    ...actual,
    assertCareerEventIntegrity: jest.fn().mockResolvedValue([]),
  };
});

jest.mock("../../organizer/organizerDisplayName", () => ({
  clearOrganizerDisplayNameCache: jest.fn(),
}));

import { supabase } from "../../supabaseClient";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import { syncRetaParticipaciones } from "../syncParticipaciones";
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { processCareerEvent } from "./pipeline";
import { validateCareerEventPreClose } from "./preCloseGuards";
import type { Pair } from "../../database";

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const PLAYERS_A = "9a3798d5-bc2f-4b15-b17c-e35b8eedae1f";
const PLAYERS_B = "8b3798d5-bc2f-4b15-b17c-e35b8eedae2f";
const RIVIERA_A = "4ac495d2-9fa4-48fd-887c-0259d6276f53";
const RIVIERA_B = "27bc3397-c049-4617-9fda-f536e604055a";

function mockTournamentExists(id: string) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue(
      table === "tournaments"
        ? { data: { id }, error: null }
        : { data: null, error: null }
    );
    return chain;
  });
}

function mockLigaExists(id: string) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue(
      table === "ligas"
        ? { data: { id }, error: null }
        : { data: null, error: null }
    );
    return chain;
  });
}

describe("pre-close tipado + bloqueo de sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      linked: true,
      confidence: "OK",
      reason: "ok",
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000001",
    });
  });

  it("Reta: resolve recibe legacyPlayerId=players.id y jugadorId undefined", async () => {
    mockTournamentExists("reta-1");
    const resolveCalls: unknown[] = [];
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async (params) => {
        resolveCalls.push(params);
        if (params.legacyPlayerId === PLAYERS_A) return RIVIERA_A;
        if (params.legacyPlayerId === PLAYERS_B) return RIVIERA_B;
        return null;
      }
    );

    const pairs = [
      {
        id: "p1",
        tournament_id: "reta-1",
        player1_id: PLAYERS_A,
        player2_id: PLAYERS_B,
        player1_name: "Juan",
        player2_name: "Pedro",
      },
    ] as Pair[];

    const pre = await validateCareerEventPreClose(
      {
        kind: "reta",
        organizadorId: ORG,
        tournament: { id: "reta-1", name: "Reta", is_finished: false } as never,
        pairs,
        matches: [],
      },
      async (ref, org) =>
        resolveJugadorIdForParticipacion({
          organizadorId: org,
          jugadorId: ref.jugadorId,
          nombre: ref.nombre,
          legacyPlayerId: ref.legacyPlayerId,
          legacyLigaJugadorId: ref.legacyLigaJugadorId,
          tipoEvento: "reta",
        })
    );

    expect(pre.ok).toBe(true);
    expect(pre.eventBlocked).toBe(false);
    expect(resolveCalls).toHaveLength(2);
    expect(resolveCalls[0]).toMatchObject({
      legacyPlayerId: PLAYERS_A,
      nombre: "Juan",
    });
    expect((resolveCalls[0] as { jugadorId?: string }).jugadorId).toBeUndefined();
    expect(resolveCalls[1]).toMatchObject({
      legacyPlayerId: PLAYERS_B,
      nombre: "Pedro",
    });
  });

  it("Liga inscripción: resolve recibe legacyLigaJugadorId", async () => {
    mockLigaExists("liga-1");
    const resolveCalls: unknown[] = [];
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async (params) => {
        resolveCalls.push(params);
        return RIVIERA_A;
      }
    );

    const pre = await validateCareerEventPreClose(
      {
        kind: "liga_inscripcion",
        organizadorId: ORG,
        ligaId: "liga-1",
        jugadorId: "liga-jugador-1",
      },
      async (ref, org) =>
        resolveJugadorIdForParticipacion({
          organizadorId: org,
          jugadorId: ref.jugadorId,
          nombre: ref.nombre,
          legacyPlayerId: ref.legacyPlayerId,
          legacyLigaJugadorId: ref.legacyLigaJugadorId,
          tipoEvento: "liga",
        })
    );

    expect(pre.ok).toBe(true);
    expect(resolveCalls[0]).toMatchObject({
      legacyLigaJugadorId: "liga-jugador-1",
    });
    expect((resolveCalls[0] as { jugadorId?: string }).jugadorId).toBeUndefined();
  });

  it("si resolve falla: pre-close ok=false, pipeline no llama sync", async () => {
    mockTournamentExists("reta-fail");
    (resolveJugadorIdForParticipacion as jest.Mock).mockResolvedValue(null);

    const result = await processCareerEvent({
      kind: "reta",
      organizadorId: ORG,
      tournament: { id: "reta-fail", name: "Reta Fail", is_finished: false } as never,
      pairs: [
        {
          id: "p1",
          tournament_id: "reta-fail",
          player1_id: PLAYERS_A,
          player2_id: PLAYERS_B,
          player1_name: "Juan Pérez",
          player2_name: "Pedro",
        } as Pair,
      ],
      matches: [],
    });

    expect(result.ok).toBe(false);
    expect(result.processed).toBe(false);
    expect(result.touchedJugadorIds).toEqual([]);
    expect(syncRetaParticipaciones).not.toHaveBeenCalled();
    expect(result.failures[0]?.message).toMatch(/Juan Pérez|identidad Riviera/i);
    expect(result.failures[0]?.message).not.toMatch(/CareerIntegrityException/);
  });

  it("si pre-close ok: sync se ejecuta una vez", async () => {
    mockTournamentExists("reta-ok");
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async ({ legacyPlayerId }) => {
        if (legacyPlayerId === PLAYERS_A) return RIVIERA_A;
        if (legacyPlayerId === PLAYERS_B) return RIVIERA_B;
        return null;
      }
    );
    (syncRetaParticipaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: [RIVIERA_A, RIVIERA_B],
      participacionEventoId: "reta-ok",
    });

    const result = await processCareerEvent({
      kind: "reta",
      organizadorId: ORG,
      tournament: { id: "reta-ok", name: "Reta OK", is_finished: false } as never,
      pairs: [
        {
          id: "p1",
          tournament_id: "reta-ok",
          player1_id: PLAYERS_A,
          player2_id: PLAYERS_B,
          player1_name: "Juan",
          player2_name: "Pedro",
        } as Pair,
      ],
      matches: [],
      options: { requireRating: false },
    });

    expect(result.ok).toBe(true);
    expect(syncRetaParticipaciones).toHaveBeenCalledTimes(1);
    expect(result.touchedJugadorIds).toEqual([RIVIERA_A, RIVIERA_B]);
  });
});
