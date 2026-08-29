import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  applyConcedidoClubMeta,
  enrichJugadorConcedidoClubView,
  enrichJugadoresConcedidoClubViewBatch,
  fetchConcedidosRankingMetaBatch,
} from "./concedidoClubView";
import {
  buildGrantsContextForRoster,
  findGrantedAccessMetaForJugador,
  listActiveGrantedAccessForOrganizerPublic,
  listOrganizerPlayerAccessRowsForJugadorIds,
} from "./organizerPlayerAccess";
import type { RivieraJugadorWithStats } from "./types";

jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn() },
  supabasePublicRead: { from: jest.fn() },
}));

jest.mock("./organizerPlayerAccess", () => ({
  buildGrantsContextForRoster: jest.fn(),
  findGrantedAccessMetaForJugador: jest.fn(),
  listGrantedLocalJugadorIdsForSource: jest.fn().mockResolvedValue([]),
  listActiveGrantedAccessForOrganizerPublic: jest.fn().mockResolvedValue([]),
  listOrganizerPlayerAccessRowsForJugadorIds: jest.fn().mockResolvedValue([]),
}));

jest.mock("./rivieraOfficialActivity", () => ({
  fetchOfficialDisplayPuntosForJugador: jest.fn().mockResolvedValue(null),
  resolveOfficialGlobalPuntos: jest.fn().mockResolvedValue(null),
}));

function jugador(
  partial: Partial<RivieraJugadorWithStats> & { id: string }
): RivieraJugadorWithStats {
  return {
    nombre: "Ossy",
    slug: "ossy",
    categoria: "quinta_fuerza",
    estado: "activo",
    stats: {
      jugador_id: partial.id,
      total_partidos: 4,
      victorias: 0,
      derrotas: 4,
      empates: 0,
      participaciones_solo: 0,
      pct_victorias: 0,
      total_retas: 2,
      total_torneos_express: 1,
      total_ligas: 0,
      total_americanos: 0,
      sets_favor_total: 0,
      sets_contra_total: 0,
      racha_actual: "",
      ultima_actividad: null,
      puntos_totales: 70,
      updated_at: "2026-07-05T00:00:00Z",
    },
    ...partial,
  } as RivieraJugadorWithStats;
}

describe("concedidoClubView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // CRA jest config trae resetMocks:true -- las implementaciones puestas
    // en la factory de jest.mock (arriba) se pierden entre tests, hay que
    // volver a fijarlas acá (mismo motivo por el que supabase.rpc/from se
    // re-configuran en cada beforeEach en este archivo).
    (listActiveGrantedAccessForOrganizerPublic as jest.Mock).mockResolvedValue(
      []
    );
    (
      listOrganizerPlayerAccessRowsForJugadorIds as jest.Mock
    ).mockResolvedValue([]);
    (buildGrantsContextForRoster as jest.Mock).mockResolvedValue({
      preloadedGrants: [],
      grantsFullyResolved: true,
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [{ source_jugador_id: "same", local_jugador_id: "same" }],
      error: null,
    });
    (supabasePublicRead.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { puntos_totales: 70 },
            error: null,
          }),
        }),
      }),
    });
  });

  it("ranking público no llama riviera_concedidos_ranking_enriquecimiento (evita 403)", async () => {
    const batch = await fetchConcedidosRankingMetaBatch("hack-org", {
      publicRpcContext: true,
    });
    expect(batch.size).toBe(0);
    expect(supabase.rpc).not.toHaveBeenCalled();

    await enrichJugadoresConcedidoClubViewBatch(
      "hack-org",
      [jugador({ id: "j1", concedidoPorAdmin: true })],
      { publicRpcContext: true }
    );

    const rpcNames = (supabase.rpc as jest.Mock).mock.calls.map((c) => c[0]);
    expect(rpcNames).not.toContain("riviera_concedidos_ranking_enriquecimiento");
    expect(rpcNames).not.toContain("riviera_rating_canonico_para_jugador");
  });

  it("nativo en club origen con clon en otro club no se marca como cedido", async () => {
    const clubTestId = "club-test-org";
    const ossySourceId = "ossy-club-test-id";

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          source_jugador_id: ossySourceId,
          local_jugador_id: ossySourceId,
        },
      ],
      error: null,
    });
    (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue(null);

    const result = await enrichJugadorConcedidoClubView(
      clubTestId,
      jugador({ id: ossySourceId, organizador_id: clubTestId })
    );

    expect(result.concedidoPorAdmin).toBeUndefined();
    expect(result.stats?.puntos_totales).toBe(70);
    expect(findGrantedAccessMetaForJugador).not.toHaveBeenCalled();
  });

  it("cedido en club anfitrión conserva puntos locales y origen", async () => {
    const hackpadelId = "hackpadel-org";
    const ossyCloneId = "ossy-hackpadel-clone";
    const ossySourceId = "ossy-club-test-id";

    (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue({
      accessId: "grant-1",
      sourceJugadorId: ossySourceId,
      ownerOrganizadorId: "club-test-org",
      localJugadorId: ossyCloneId,
    });

    const enriched = applyConcedidoClubMeta(
      jugador({
        id: ossyCloneId,
        organizador_id: hackpadelId,
        stats: {
          ...jugador({ id: ossyCloneId }).stats!,
          puntos_totales: 50,
        },
      }),
      {
        isConcedido: true,
        sourceJugadorId: ossySourceId,
        localJugadorId: ossyCloneId,
        ownerOrganizadorId: "club-test-org",
        origenPuntosTotales: 70,
        localPuntosTotales: 50,
      }
    );

    expect(enriched.concedidoPorAdmin).toBe(true);
    expect(enriched.stats?.puntos_totales).toBe(50);
    expect(enriched.statsOrigenConcedido?.puntos_totales).toBe(70);
  });

  describe("enrichJugadoresConcedidoClubViewBatch — publicRpcContext (incidente 2026-08-05)", () => {
    it("precarga el grantsContext del roster UNA sola vez, sin importar N (via buildGrantsContextForRoster)", async () => {
      (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue(null);
      const roster = Array.from({ length: 25 }, (_, i) =>
        jugador({ id: `j${i}` })
      );

      await enrichJugadoresConcedidoClubViewBatch("hack-org", roster, {
        publicRpcContext: true,
      });

      // Antes del fix: N llamadas directas a listActiveGrantedAccessForOrganizerPublic
      // (una por jugador). Ahora: una sola precarga compartida para todo el roster.
      expect(buildGrantsContextForRoster).toHaveBeenCalledTimes(1);
      expect(buildGrantsContextForRoster).toHaveBeenCalledWith(
        "hack-org",
        roster.map((j) => j.id)
      );
      expect(listActiveGrantedAccessForOrganizerPublic).not.toHaveBeenCalled();
      expect(listOrganizerPlayerAccessRowsForJugadorIds).not.toHaveBeenCalled();
    });

    it("cada jugador pasa por findGrantedAccessMetaForJugador exactamente una vez", async () => {
      (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue(null);
      const roster = Array.from({ length: 10 }, (_, i) =>
        jugador({ id: `j${i}` })
      );

      await enrichJugadoresConcedidoClubViewBatch("hack-org", roster, {
        publicRpcContext: true,
      });

      expect(findGrantedAccessMetaForJugador).toHaveBeenCalledTimes(10);
    });

    it("cada jugador de findGrantedAccessMetaForJugador recibe el grantsContext ya resuelto (grantsFullyResolved)", async () => {
      (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue(null);
      const roster = [jugador({ id: "j1" }), jugador({ id: "j2" })];

      await enrichJugadoresConcedidoClubViewBatch("hack-org", roster, {
        publicRpcContext: true,
      });

      expect(findGrantedAccessMetaForJugador).toHaveBeenCalledTimes(2);
      for (const call of (findGrantedAccessMetaForJugador as jest.Mock).mock
        .calls) {
        expect(call[2]).toMatchObject({ grantsFullyResolved: true });
      }
    });

    it("todos los jugadores del roster reciben el MISMO objeto grantsContext (una sola precarga compartida)", async () => {
      (findGrantedAccessMetaForJugador as jest.Mock).mockResolvedValue(null);
      const sharedContext = {
        preloadedGrants: [
          {
            id: "grant-1",
            jugador_id: "j1",
            owner_organizador_id: "owner-org",
            local_jugador_id: null,
            local_display_name: null,
            local_category: null,
          },
        ],
        grantsFullyResolved: true as const,
      };
      (buildGrantsContextForRoster as jest.Mock).mockResolvedValue(
        sharedContext
      );
      const roster = [jugador({ id: "j1" }), jugador({ id: "j2" })];

      await enrichJugadoresConcedidoClubViewBatch("hack-org", roster, {
        publicRpcContext: true,
      });

      for (const call of (findGrantedAccessMetaForJugador as jest.Mock).mock
        .calls) {
        expect(call[2]).toBe(sharedContext);
      }
    });
  });
});
