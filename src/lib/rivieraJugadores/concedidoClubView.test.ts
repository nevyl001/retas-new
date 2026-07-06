jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn() },
  supabasePublicRead: { from: jest.fn() },
}));

jest.mock("./organizerPlayerAccess", () => ({
  findGrantedAccessMetaForJugador: jest.fn(),
  listGrantedLocalJugadorIdsForSource: jest.fn().mockResolvedValue([]),
}));

jest.mock("./rivieraOfficialActivity", () => ({
  fetchOfficialDisplayPuntosForJugador: jest.fn().mockResolvedValue(null),
}));

import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  applyConcedidoClubMeta,
  enrichJugadorConcedidoClubView,
} from "./concedidoClubView";
import { findGrantedAccessMetaForJugador } from "./organizerPlayerAccess";
import type { RivieraJugadorWithStats } from "./types";

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
});
