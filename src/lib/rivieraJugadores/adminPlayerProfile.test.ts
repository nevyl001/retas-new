jest.mock("./careerLinkedProfileDiscovery", () => ({
  discoverCareerLinkedProfiles: jest.fn(async ({ seedJugadorIds, anchorJugadorId }) => ({
    linkedJugadorIds: seedJugadorIds ?? [anchorJugadorId],
    linkedProfiles: (seedJugadorIds ?? [anchorJugadorId]).map((id: string) => ({
      jugadorId: id,
      organizadorId: "",
    })),
  })),
}));

jest.mock("./careerPointsByClub", () => {
  const actual = jest.requireActual("./careerPointsByClub");
  return {
    ...actual,
    attachCareerPuntosToJugador: jest.fn(async (j: unknown) => j),
    buildJugadorHomeOrgMapFromParticipaciones: jest.fn(async () => new Map()),
  };
});

jest.mock("./careerParticipacionesMerge", () => ({
  mergeCareerParticipacionesForIdentity: jest.fn(),
}));

jest.mock("./publicCareerLinkage", () => ({
  fetchPublicCareerJugadorIds: jest.fn(),
  listCareerParticipacionesPublic: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  listGrantedLocalJugadorIdsForSource: jest.fn(async () => []),
  listMulticlubSiblingProfilesForSource: jest.fn(async () => []),
}));

jest.mock("./concedidoClubView", () => ({
  enrichJugadorConcedidoClubView: jest.fn(async (_org: string, jugador: unknown) => jugador),
}));

jest.mock("./grantedPlayerUnifiedView", () => {
  const actual = jest.requireActual("./grantedPlayerUnifiedView");
  return {
    ...actual,
    loadUnifiedRatingViewForJugador: jest.fn(async (jugador: unknown) => ({
      historial: [],
      jugador,
    })),
  };
});

jest.mock("./rivieraJugadoresService", () => ({
  getRivieraJugadorBySlug: jest.fn(),
  getRivieraJugadorInternalClubById: jest.fn(),
  getRivieraJugadorPublicById: jest.fn(),
  getRivieraJugadorPublicBySlug: jest.fn(),
  obtenerHistorialRatingPublic: jest.fn().mockResolvedValue([]),
  resolveRankingPosicionForPublicFicha: jest.fn().mockResolvedValue(null),
}));

jest.mock("./rivieraIdDisplay", () => ({
  fetchRivieraIdMapForJugadorIds: jest.fn().mockResolvedValue(new Map()),
  isValidRivieraId: jest.fn((v: string) => /^RIV-[0-9]{8}$/.test(v)),
}));

jest.mock("./playerPointsBreakdown", () => ({
  resolvePlayerPointsBreakdown: jest.fn(async ({ jugador }: { jugador: unknown }) => ({
    jugador,
  })),
}));

jest.mock("../supabaseClient", () => ({
  supabasePublicRead: {
    rpc: jest.fn(),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  },
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        not: jest.fn().mockReturnThis(),
      })),
    })),
  },
}));

import { readFileSync } from "fs";
import { resolve } from "path";
import { supabasePublicRead } from "../supabaseClient";
import {
  getAdminPlayerProfileData,
  mergeLocalJugadorWithGlobalCareer,
} from "./playerIdentityService";
import { attachCareerPuntosToJugador } from "./careerPointsByClub";
import { loadUnifiedRatingViewForJugador } from "./grantedPlayerUnifiedView";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import { fetchPublicCareerJugadorIds } from "./publicCareerLinkage";
import {
  getRivieraJugadorBySlug,
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
} from "./rivieraJugadoresService";
import {
  listGrantedLocalJugadorIdsForSource,
  listMulticlubSiblingProfilesForSource,
} from "./organizerPlayerAccess";
import { discoverCareerLinkedProfiles } from "./careerLinkedProfileDiscovery";
import { fetchRivieraIdMapForJugadorIds } from "./rivieraIdDisplay";

const RIVIERA = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const ALEJANDRO_RO = "e4943bb6-3178-4e22-8e9b-affd2158578d";
const ALEJANDRO_HP = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const GLOBAL_HISTORIAL = [
  {
    id: "p1",
    evento_nombre: "Reta 5ta Fza",
    jugador_id: ALEJANDRO_HP,
    fecha: "2026-07-07",
    created_at: "2026-07-07T00:00:00Z",
  },
  {
    id: "p2",
    evento_nombre: "Remontada Final",
    jugador_id: ALEJANDRO_HP,
    fecha: "2026-06-09",
    created_at: "2026-06-09T00:00:00Z",
  },
] as never;

describe("admin player profile — motor global unificado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (discoverCareerLinkedProfiles as jest.Mock).mockImplementation(
      async ({ seedJugadorIds, anchorJugadorId }) => ({
        linkedJugadorIds: seedJugadorIds?.length
          ? seedJugadorIds
          : [anchorJugadorId],
        linkedProfiles: (seedJugadorIds?.length ? seedJugadorIds : [anchorJugadorId]).map(
          (id: string) => ({ jugadorId: id, organizadorId: "" })
        ),
      })
    );
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { code: "PGRST202" },
    });
    (fetchPublicCareerJugadorIds as jest.Mock).mockResolvedValue([
      ALEJANDRO_RO,
      ALEJANDRO_HP,
    ]);
    (listMulticlubSiblingProfilesForSource as jest.Mock).mockResolvedValue([]);
    (listGrantedLocalJugadorIdsForSource as jest.Mock).mockResolvedValue([]);
    (fetchRivieraIdMapForJugadorIds as jest.Mock).mockResolvedValue(
      new Map([[ALEJANDRO_RO, "RIV-00000003"], [ALEJANDRO_HP, "RIV-00000003"]])
    );
    (getRivieraJugadorInternalClubById as jest.Mock).mockImplementation(
      async (id: string, org: string) => {
        if (id === ALEJANDRO_RO && org === RIVIERA) {
          return { id: ALEJANDRO_RO, organizador_id: RIVIERA, slug: "alejandro-r" };
        }
        if (id === ALEJANDRO_HP && org === HACKPADEL) {
          return { id: ALEJANDRO_HP, organizador_id: HACKPADEL, slug: "alejandro-r" };
        }
        return null;
      }
    );
    (getRivieraJugadorPublicById as jest.Mock).mockResolvedValue(null);
    (mergeCareerParticipacionesForIdentity as jest.Mock).mockResolvedValue(
      GLOBAL_HISTORIAL
    );
    (attachCareerPuntosToJugador as jest.Mock).mockImplementation(
      async (jugador: unknown) => jugador
    );
    (loadUnifiedRatingViewForJugador as jest.Mock).mockImplementation(
      async (jugador: unknown) => ({ historial: [], jugador })
    );
  });

  it("contrato: historial admin = historialGlobal (sin split otros clubes)", async () => {
    const localJugador = {
      id: ALEJANDRO_RO,
      slug: "alejandro-r",
      nombre: "Alejandro R",
      organizador_id: RIVIERA,
      rating: 2.5,
      rating_partidos: 1,
      rating_fiabilidad: 0.2,
    } as never;

    (getRivieraJugadorBySlug as jest.Mock).mockResolvedValue(localJugador);

    const data = await getAdminPlayerProfileData({
      organizadorId: RIVIERA,
      slug: "alejandro-r",
    });

    expect(data?.historialGlobal.length).toBe(2);
    expect(data?.historialMain).toEqual(data?.historialGlobal);
    expect(data?.historialOtrosClubes).toEqual([]);
    expect(data?.localJugador.id).toBe(ALEJANDRO_RO);
    expect(data?.jugador.id).toBe(ALEJANDRO_RO);
  });

  it("mismo historial global desde Riviera Open y Hackpadel", async () => {
    const localByOrg: Record<string, { id: string; slug: string; organizador_id: string }> = {
      [RIVIERA]: { id: ALEJANDRO_RO, slug: "alejandro-r", organizador_id: RIVIERA },
      [HACKPADEL]: { id: ALEJANDRO_HP, slug: "alejandro-r", organizador_id: HACKPADEL },
    };

    (getRivieraJugadorBySlug as jest.Mock).mockImplementation(
      async (org: string) => localByOrg[org]
    );

    const fromRo = await getAdminPlayerProfileData({
      organizadorId: RIVIERA,
      slug: "alejandro-r",
    });
    const fromHp = await getAdminPlayerProfileData({
      organizadorId: HACKPADEL,
      slug: "alejandro-r",
    });

    expect(fromRo?.historialGlobal.map((p) => p.id)).toEqual(
      fromHp?.historialGlobal.map((p) => p.id)
    );
    expect(fromRo?.historialGlobal.length).toBe(2);
    expect(fromHp?.historialGlobal.length).toBe(2);
  });

  it("mergeLocalJugadorWithGlobalCareer conserva id local y rating global", () => {
    const local = {
      id: ALEJANDRO_RO,
      slug: "alejandro-r",
      nombre: "Alejandro R",
      rating: 2.5,
      rating_partidos: 1,
    } as never;
    const merged = mergeLocalJugadorWithGlobalCareer(local, {
      jugador: {
        rating: 3.06,
        rating_partidos: 4,
        rating_fiabilidad: 0.24,
        riviera_id: "RIV-00000003",
      },
      historialGlobal: GLOBAL_HISTORIAL,
    } as never);

    expect(merged.id).toBe(ALEJANDRO_RO);
    expect(merged.slug).toBe("alejandro-r");
    expect(merged.rating).toBe(3.06);
    expect(merged.rating_partidos).toBe(4);
    expect(merged.riviera_id).toBe("RIV-00000003");
  });

  it("JugadorFicha usa getAdminPlayerProfileData y no loadOrganizerScopedPlayerView", () => {
    const src = readFileSync(
      resolve(__dirname, "../../components/jugadores/JugadorFicha.tsx"),
      "utf8"
    );
    expect(src).not.toContain("loadOrganizerScopedPlayerView");
    expect(src).toContain("getAdminPlayerProfileData");
  });
});
