/**
 * Regresión: assertJugadorCareerIntegrity debe confiar en el RPC SECURITY DEFINER,
 * no en SELECT directo a riviera_official_player_profile_link (bloqueado por RLS).
 */
jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn(),
}));

jest.mock("../jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
  resolveJugadorIdForParticipacion: jest.fn(),
}));

jest.mock("../syncParticipaciones", () => ({
  syncDuelo2v2Participaciones: jest.fn(),
  collectJugadorIdsForCareerEvent: jest.fn(),
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
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import { syncDuelo2v2Participaciones } from "../syncParticipaciones";
import { processCareerEvent } from "./pipeline";
import { validateCareerEventPreClose } from "./preCloseGuards";
import type { Duelo2v2 } from "../../duelo2v2/types";

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const J1 = "4ac495d2-9fa4-48fd-887c-0259d6276f53";
const J2 = "27bc3397-c049-4617-9fda-f536e604055a";
const J3 = "684b6f33-f9d3-454d-b1c7-ca52229f1ac0";
const J4 = "810f9308-fe0a-4c63-b9aa-e44fca6fa243";
const DUEL_ID = "1a19e1a0-38e4-4539-b10c-0afb2cf4873d";

const PLAYERS = [
  { id: J1, opk: "opk-lalo-b", riv: "RIV-00000119" },
  { id: J2, opk: "opk-nevyl", riv: "RIV-00000011" },
  { id: J3, opk: "opk-alex", riv: "RIV-00000063" },
  { id: J4, opk: "opk-iker", riv: "RIV-00000118" },
];

function dueloFixture(): Duelo2v2 {
  return {
    id: DUEL_ID,
    organizador_id: ORG,
    nombre: "Hack 2vs2",
    descripcion: null,
    cancha: null,
    programado_en: null,
    programado_hasta: null,
    estado: "finalizado",
    pareja_a_j1_id: J1,
    pareja_a_j2_id: J2,
    pareja_a_j1_nombre: "Lalo B",
    pareja_a_j2_nombre: "Nevyl",
    pareja_b_j1_id: J3,
    pareja_b_j2_id: J4,
    pareja_b_j1_nombre: "Alex R",
    pareja_b_j2_nombre: "Iker",
    sets_pareja_a: 2,
    sets_pareja_b: 0,
    detalle_sets: [{ a: 6, b: 3 }, { a: 6, b: 2 }],
    ganador: "a",
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    finalizado_at: "2026-07-08T00:00:00Z",
  };
}

function mockSupabaseRlsBlocksProfileTables() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);

    if (table === "duelos_2v2") {
      chain.maybeSingle = jest.fn().mockResolvedValue({
        data: { id: DUEL_ID, organizador_id: ORG },
        error: null,
      });
      return chain;
    }

    if (
      table === "riviera_official_player_profile_link" ||
      table === "riviera_official_player_identity"
    ) {
      chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    }

    if (table === "jugador_participaciones") {
      chain.eq = jest.fn().mockReturnValue({
        ...chain,
        then: undefined,
        data: PLAYERS.map((p, i) => ({
          id: `part-${i}`,
          jugador_id: p.id,
          puntos_obtenidos: p.id === J1 || p.id === J2 ? 50 : 20,
          metadata: {
            organizador_id: ORG,
            club_name: "Riviera Open",
            subtipo: "duelo_2v2_cierre",
            puntos_aplicados: true,
          },
        })),
        error: null,
      });
      return chain;
    }

    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
}

describe("preCloseGuards — RLS profile link regression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseRlsBlocksProfileTables();

    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockImplementation(
      async (jugadorId: string) => {
        const player = PLAYERS.find((p) => p.id === jugadorId);
        return {
          linked: true,
          alreadyLinked: true,
          confidence: "OK",
          reason: "perfil ya enlazado",
          officialPlayerKey: player?.opk,
          rivieraId: player?.riv,
        };
      }
    );

    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async ({ jugadorId }: { jugadorId?: string }) => jugadorId ?? null
    );
  });

  it("no excluye jugadores cuando RLS bloquea SELECT directo pero el RPC devolvió enlace", async () => {
    const result = await validateCareerEventPreClose(
      {
        kind: "duelo_2v2",
        organizadorId: ORG,
        duelo: dueloFixture(),
      },
      async (ref) => ref.jugadorId ?? null
    );

    expect(result.ok).toBe(true);
    expect(result.excludedJugadorIds).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(requireOfficialProfileLinkForParticipacion).toHaveBeenCalledTimes(4);
  });

  it("pipeline duelo 2v2 completo: processed true, 4 jugadores, sin failures", async () => {
    const touched = PLAYERS.map((p) => p.id);

    (syncDuelo2v2Participaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: touched,
      participacionEventoId: DUEL_ID,
    });

    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    const result = await processCareerEvent({
      kind: "duelo_2v2",
      organizadorId: ORG,
      duelo: dueloFixture(),
      options: { skipAssertions: false, requireRating: false },
    });

    expect(result.processed).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.touchedJugadorIds).toEqual(touched);
    expect(result.failures).toEqual([]);
    expect(syncDuelo2v2Participaciones).toHaveBeenCalledWith({
      organizadorId: ORG,
      duelo: expect.objectContaining({ id: DUEL_ID }),
      excludeJugadorIds: [],
    });

    const completeLog = consoleSpy.mock.calls.find(
      (call) => call[0] === "[career-event-pipeline]" && call[1] === "complete"
    );
    expect(completeLog).toBeDefined();
    expect(completeLog?.[2]).toMatchObject({ players: 4 });

    // Evidencia explícita del objeto pipeline (equivalente al log de consola en cierre real)
    const evidence = {
      ok: result.ok,
      processed: result.processed,
      touchedJugadorIds: result.touchedJugadorIds,
      failures: result.failures,
      participacionesEsperadas: 4,
      syncInvocado: (syncDuelo2v2Participaciones as jest.Mock).mock.calls.length,
    };
    console.log("[EVIDENCE] career-event-pipeline duelo 2v2:", JSON.stringify(evidence));

    consoleSpy.mockRestore();
  });
});
