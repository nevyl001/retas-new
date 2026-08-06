/* eslint-disable import/first */
jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn() },
  supabasePublicRead: { rpc: jest.fn() },
}));

import { enrichJugadoresOrganizerScopedStats } from "./organizerScopedStats";
import { clearCareerIdentityCache } from "./careerIdentityCache";
import { supabasePublicRead } from "../supabaseClient";
import * as playerIdentityService from "./playerIdentityService";
import * as careerPointsByClub from "./careerPointsByClub";
import * as playerPointsBreakdown from "./playerPointsBreakdown";
import * as rankingPointsAudit from "./rankingPointsAudit";
import * as organizerPlayerAccess from "./organizerPlayerAccess";
import type { RivieraJugadorWithStats } from "./types";
/* eslint-enable import/first */

jest.mock("./playerIdentityService");
jest.mock("./careerPointsByClub");
jest.mock("./playerPointsBreakdown");
jest.mock("./rankingPointsAudit");
jest.mock("./organizerPlayerAccess");

const mockBuildGrantsContextForRoster =
  organizerPlayerAccess.buildGrantsContextForRoster as jest.Mock;
const mockResolvePlayerIdentity =
  playerIdentityService.resolvePlayerIdentity as jest.Mock;
const mockResolvePlayerCareer =
  playerIdentityService.resolvePlayerCareer as jest.Mock;
const mockAttachCareerPuntosToJugador =
  careerPointsByClub.attachCareerPuntosToJugador as jest.Mock;
const mockResolvePlayerPointsBreakdown =
  playerPointsBreakdown.resolvePlayerPointsBreakdown as jest.Mock;
const mockSupabasePublicReadRpc = supabasePublicRead.rpc as jest.Mock;

function jugador(id: string): RivieraJugadorWithStats {
  return {
    id,
    nombre: `Jugador ${id}`,
    organizador_id: "org-1",
  } as RivieraJugadorWithStats;
}

const IDENTITY = {
  canonicalJugadorId: "canon-1",
  linkedJugadorIds: ["j1"],
} as unknown as playerIdentityService.ResolvedPlayerIdentity;

describe("organizerScopedStats + careerIdentityCache", () => {
  beforeEach(() => {
    clearCareerIdentityCache();
    jest.clearAllMocks();
    (rankingPointsAudit.logRankingPointsAudit as jest.Mock).mockImplementation(
      () => undefined
    );
    (rankingPointsAudit.snapshotFromBreakdown as jest.Mock).mockReturnValue({});
    mockBuildGrantsContextForRoster.mockResolvedValue({
      preloadedGrants: [],
      grantsFullyResolved: true,
    });
    // Por defecto, el batch de roster (resolve_public_player_identity_batch /
    // riviera_official_display_puntos_for_jugador_batch) se comporta como si
    // la migración 0018 no estuviera desplegada todavía -- cae al camino
    // individual existente, que es lo que estos tests ya cubren.
    mockSupabasePublicReadRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });

    mockResolvePlayerIdentity.mockResolvedValue(IDENTITY);
    mockResolvePlayerCareer.mockResolvedValue({
      participaciones: [{ id: "p1", jugador_id: "j1", puntos_obtenidos: 10 }],
      duplicateCount: 0,
      source: "career_rpc",
    });
    mockAttachCareerPuntosToJugador.mockImplementation(async (j) => ({
      ...j,
      careerPuntosByClub: [{ organizadorId: "org-1", puntos: 10 }],
      careerPuntosTotal: 10,
    }));
    mockResolvePlayerPointsBreakdown.mockResolvedValue({
      currentClubPoints: 10,
      careerTotalAllClubs: 10,
      officialGlobalPoints: null,
      pointsByClub: [{ organizador_id: "org-1", club_name: "Club", points: 10 }],
    });
  });

  it("primer enriquecimiento ejecuta identidad/career", async () => {
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);
    expect(mockResolvePlayerIdentity).toHaveBeenCalledTimes(1);
    expect(mockResolvePlayerCareer).toHaveBeenCalledTimes(1);
  });

  it("segundo enriquecimiento del mismo jugador reutiliza el bundle (no repite identity/career)", async () => {
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);

    expect(mockResolvePlayerIdentity).toHaveBeenCalledTimes(1);
    expect(mockResolvePlayerCareer).toHaveBeenCalledTimes(1);
  });

  it("attachCareerPuntosToJugador y resolvePlayerPointsBreakdown siguen ejecutándose en cada llamada (no se cachean)", async () => {
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);

    expect(mockAttachCareerPuntosToJugador).toHaveBeenCalledTimes(2);
    expect(mockResolvePlayerPointsBreakdown).toHaveBeenCalledTimes(2);
  });

  it("los puntos visibles son idénticos con cache hit que con cache miss", async () => {
    const [first] = await enrichJugadoresOrganizerScopedStats("org-1", [
      jugador("j1"),
    ]);
    const [second] = await enrichJugadoresOrganizerScopedStats("org-1", [
      jugador("j1"),
    ]);

    expect(second.careerPuntosTotal).toEqual(first.careerPuntosTotal);
    expect(second.pointsBreakdown).toEqual(first.pointsBreakdown);
  });

  it("attachCareerPuntosToJugador recibe los mismos linkedJugadorIds/participaciones en cache hit que en cache miss", async () => {
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);
    await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);

    const [, firstCallArgs] = mockAttachCareerPuntosToJugador.mock.calls[0];
    const [, secondCallArgs] = mockAttachCareerPuntosToJugador.mock.calls[1];
    expect(secondCallArgs).toEqual(firstCallArgs);
  });

  it("precarga los grants del roster UNA sola vez, sin importar N jugadores (incidente 2026-08-05, segunda fuente de N+1)", async () => {
    const roster = Array.from({ length: 25 }, (_, i) => jugador(`j${i}`));

    await enrichJugadoresOrganizerScopedStats("org-1", roster);

    expect(mockBuildGrantsContextForRoster).toHaveBeenCalledTimes(1);
    expect(mockBuildGrantsContextForRoster).toHaveBeenCalledWith(
      "org-1",
      roster.map((j) => j.id)
    );
  });

  it("resolvePlayerIdentity recibe el grantsContext precargado, no undefined", async () => {
    const context = { preloadedGrants: [], grantsFullyResolved: true as const };
    mockBuildGrantsContextForRoster.mockResolvedValue(context);
    const j1 = jugador("j1");

    await enrichJugadoresOrganizerScopedStats("org-1", [j1]);

    expect(mockResolvePlayerIdentity).toHaveBeenCalledWith(
      { kind: "jugadorId", jugadorId: "j1" },
      "org-1",
      context,
      j1
    );
  });

  it("resolvePlayerIdentity recibe la fila del roster como knownRow (incidente 2026-08-05, tercera fuente de N+1)", async () => {
    const roster = [jugador("j1"), jugador("j2")];

    await enrichJugadoresOrganizerScopedStats("org-1", roster);

    expect(mockResolvePlayerIdentity).toHaveBeenCalledTimes(2);
    for (const j of roster) {
      expect(mockResolvePlayerIdentity).toHaveBeenCalledWith(
        { kind: "jugadorId", jugadorId: j.id },
        "org-1",
        expect.anything(),
        j
      );
    }
  });

  describe("resolveRosterCareerIdentityBatch (incidente 2026-08-05, cuarta/quinta fuente de N+1)", () => {
    beforeEach(() => {
      mockSupabasePublicReadRpc.mockImplementation(
        async (name: string, params: Record<string, unknown>) => {
          if (name === "resolve_public_player_identity_batch") {
            const ids = params.p_jugador_ids as string[];
            return {
              data: ids.map((id) => ({
                anchor_jugador_id: id,
                canonical_jugador_id: id,
                riviera_id: `RIV-${id}`,
                official_player_key: null,
                home_organizador_id: null,
                linked_jugador_id: id,
                linked_organizador_id: "org-1",
              })),
              error: null,
            };
          }
          if (name === "riviera_official_display_puntos_for_jugador_batch") {
            const ids = params.p_riviera_jugador_ids as string[];
            return {
              data: ids.map((id) => ({ jugador_id: id, puntos: 99 })),
              error: null,
            };
          }
          if (name === "riviera_list_participaciones_for_jugador_ids") {
            return { data: [], error: null };
          }
          return { data: null, error: { code: "PGRST202", message: "unknown rpc" } };
        }
      );
    });

    it("cuando el batch resuelve, no llama resolvePlayerIdentity/resolvePlayerCareer por jugador", async () => {
      const roster = [jugador("j1"), jugador("j2"), jugador("j3")];

      await enrichJugadoresOrganizerScopedStats("org-1", roster);

      expect(mockResolvePlayerIdentity).not.toHaveBeenCalled();
      expect(mockResolvePlayerCareer).not.toHaveBeenCalled();
    });

    it("attachCareerPuntosToJugador recibe los puntos ROMC precargados del batch", async () => {
      await enrichJugadoresOrganizerScopedStats("org-1", [jugador("j1")]);

      expect(mockAttachCareerPuntosToJugador).toHaveBeenCalledWith(
        expect.objectContaining({ id: "j1" }),
        expect.objectContaining({ preloadedOfficialGlobalPuntos: 99 })
      );
    });

    it("si el batch falla (RPC no desplegada), cae al camino individual sin romper nada", async () => {
      mockSupabasePublicReadRpc.mockResolvedValue({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      });
      const roster = [jugador("j1"), jugador("j2")];

      const enriched = await enrichJugadoresOrganizerScopedStats("org-1", roster);

      expect(mockResolvePlayerIdentity).toHaveBeenCalledTimes(2);
      expect(enriched).toHaveLength(2);
    });

    it("pide el historial UNA sola vez para la unión de linked_jugador_id de todo el roster (sin RPC de carrera separada)", async () => {
      const roster = [jugador("j1"), jugador("j2"), jugador("j3")];

      await enrichJugadoresOrganizerScopedStats("org-1", roster);

      const historialCalls = mockSupabasePublicReadRpc.mock.calls.filter(
        ([name]) => name === "riviera_list_participaciones_for_jugador_ids"
      );
      expect(historialCalls).toHaveLength(1);
      const [, callParams] = historialCalls[0];
      expect(new Set(callParams.p_jugador_ids)).toEqual(new Set(["j1", "j2", "j3"]));

      const rpcNames = mockSupabasePublicReadRpc.mock.calls.map(([name]) => name);
      expect(rpcNames).not.toContain("riviera_list_career_participaciones_public_batch");
    });
  });
});
