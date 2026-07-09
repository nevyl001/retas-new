jest.mock("./careerLinkedProfileDiscovery", () => ({
  discoverCareerLinkedProfiles: jest.fn(async ({ seedJugadorIds, anchorJugadorId }) => ({
    linkedJugadorIds: seedJugadorIds?.length
      ? seedJugadorIds
      : [anchorJugadorId],
    linkedProfiles: (seedJugadorIds?.length ? seedJugadorIds : [anchorJugadorId]).map(
      (id: string) => ({ jugadorId: id, organizadorId: "" })
    ),
  })),
}));

jest.mock("./careerPointsByClub", () => {
  const actual = jest.requireActual("./careerPointsByClub");
  return {
    ...actual,
    attachCareerPuntosToJugador: jest.fn(),
  };
});

jest.mock("./publicCareerLinkage", () => ({
  fetchPublicCareerJugadorIds: jest.fn(),
  fetchPublicIdentityRows: jest.fn().mockResolvedValue(null),
  linkedProfilesFromIdentityRows: jest.fn((rows: unknown[], anchor: string) => ({
    linkedJugadorIds: [anchor],
    linkedProfiles: [{ jugadorId: anchor, organizadorId: "" }],
    rivieraId: null,
    officialPlayerKey: null,
    canonicalJugadorId: anchor,
    homeOrganizadorId: null,
  })),
  listCareerParticipacionesPublic: jest.fn(),
}));

jest.mock("./careerParticipacionesMerge", () => ({
  mergeCareerParticipacionesForIdentity: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  listGrantedLocalJugadorIdsForSource: jest.fn(async () => []),
  listMulticlubSiblingProfilesForSource: jest.fn(async () => []),
}));

jest.mock("./rivieraJugadoresService", () => ({
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

import { supabasePublicRead } from "../supabaseClient";
import {
  resolveLinkedJugadorIdsForIdentity,
  resolvePlayerCareer,
} from "./playerIdentityService";
import { discoverCareerLinkedProfiles } from "./careerLinkedProfileDiscovery";
import { mergeCareerParticipacionesForIdentity } from "./careerParticipacionesMerge";
import { fetchPublicCareerJugadorIds, listCareerParticipacionesPublic } from "./publicCareerLinkage";
import {
  listGrantedLocalJugadorIdsForSource,
  listMulticlubSiblingProfilesForSource,
} from "./organizerPlayerAccess";
import { fetchRivieraIdMapForJugadorIds } from "./rivieraIdDisplay";
import { computeCareerPointsByClubFromParticipaciones } from "./careerPointsByClub";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";
import type { ResolvedPlayerIdentity } from "./playerIdentityService";

const CLUB_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CLUB_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const CLUB_C = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const CLUB_D = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const CANONICAL = "11111111-1111-4111-8111-111111111111";

function part(
  id: string,
  org: string,
  pts: number
): JugadorParticipacion {
  return {
    id,
    jugador_id: CANONICAL,
    tipo_evento: "duelo_2v2",
    evento_id: `e-${id}`,
    evento_nombre: "Reta",
    resultado: "victoria",
    pareja_con: null,
    sets_favor: 0,
    sets_contra: 0,
    puntos_obtenidos: pts,
    fecha: "2026-07-01",
    created_at: "2026-07-01T00:00:00Z",
    metadata: { organizador_id: org },
  };
}

function identity(linkedIds: string[]): ResolvedPlayerIdentity {
  return {
    input: { kind: "jugadorId", jugadorId: CANONICAL },
    anchorJugadorId: CANONICAL,
    canonicalJugadorId: CANONICAL,
    rivieraId: "RIV-00009999",
    officialPlayerKey: "key-test",
    linkedJugadorIds: linkedIds,
    linkedProfiles: linkedIds.map((id) => ({ jugadorId: id, organizadorId: "" })),
    homeOrganizadorId: CLUB_A,
    displayJugador: { id: CANONICAL, organizador_id: CLUB_A } as RivieraJugadorWithStats,
    resolutionSource: "career_rpc",
    viewingOrganizadorId: CLUB_B,
  };
}

describe("playerIdentityService", () => {
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
    (listMulticlubSiblingProfilesForSource as jest.Mock).mockResolvedValue([]);
    (listGrantedLocalJugadorIdsForSource as jest.Mock).mockResolvedValue([]);
    (fetchRivieraIdMapForJugadorIds as jest.Mock).mockResolvedValue(new Map());
  });

  it("resolveLinkedJugadorIdsForIdentity une carrera RPC + grants", async () => {
    (fetchPublicCareerJugadorIds as jest.Mock).mockResolvedValue([
      CANONICAL,
      "22222222-2222-4222-8222-222222222222",
    ]);

    const result = await resolveLinkedJugadorIdsForIdentity(CANONICAL);
    expect(result.linkedJugadorIds).toEqual(
      expect.arrayContaining([CANONICAL, "22222222-2222-4222-8222-222222222222"])
    );
    expect(result.source).toBe("career_rpc");
  });

  it("resolvePlayerCareer deduplica aunque linkedIds tenga 3 entradas", async () => {
    const rows = [
      part("p-a", CLUB_A, 20),
      part("p-b", CLUB_B, 50),
      part("p-d", CLUB_D, 100),
    ];
    (mergeCareerParticipacionesForIdentity as jest.Mock).mockResolvedValue([
      ...rows,
      rows[0],
    ]);

    const career = await resolvePlayerCareer(
      identity([CANONICAL, "aaa", "bbb"]),
      500
    );

    expect(career.participaciones).toHaveLength(3);
    expect(career.duplicateCount).toBe(1);
  });

  it("jugador fake: Club A 20 + B 50 + D 100 = Total 170", async () => {
    const rows = [
      part("p-a", CLUB_A, 20),
      part("p-b", CLUB_B, 50),
      part("p-d", CLUB_D, 100),
    ];
    (mergeCareerParticipacionesForIdentity as jest.Mock).mockResolvedValue(rows);

    const id = identity([CANONICAL]);
    const career = await resolvePlayerCareer(id, 500);
    const points = computeCareerPointsByClubFromParticipaciones(career.participaciones, {
      jugadorHomeOrgById: new Map([[CANONICAL, CLUB_A]]),
      viewingOrganizadorId: CLUB_C,
      includeViewingOrgWithZero: true,
    });

    expect(career.participaciones).toHaveLength(3);
    expect(points.total).toBe(170);
    expect(points.total).not.toBe(510);
    expect(points.puntosByOrg.get(CLUB_A)).toBe(20);
    expect(points.puntosByOrg.get(CLUB_B)).toBe(50);
    expect(points.puntosByOrg.get(CLUB_D)).toBe(100);
    expect(points.puntosByOrg.get(CLUB_C) ?? 0).toBe(0);
  });
});
