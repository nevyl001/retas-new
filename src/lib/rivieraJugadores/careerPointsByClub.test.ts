jest.mock("./publicCareerLinkage", () => ({
  listCareerParticipacionesPublic: jest.fn(),
}));

jest.mock("./rivieraOfficialActivity", () => ({
  resolveOfficialGlobalPuntos: jest.fn(),
}));

jest.mock("../supabaseClient", () => ({
  supabasePublicRead: { from: jest.fn() },
  supabase: {},
}));

import { supabasePublicRead } from "../supabaseClient";
import {
  attachCareerPuntosToJugador,
  computeCareerPointsByClubFromParticipaciones,
  shouldShowCareerPointsBreakdown,
  sortCareerClubsForDisplay,
} from "./careerPointsByClub";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import { resolveOfficialGlobalPuntos } from "./rivieraOfficialActivity";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

const RIVIERA_OPEN = "2770b522-0000-4000-8000-000000000001";
const HACKPADEL = "e724de97-0000-4000-8000-000000000002";
const CLUB_TEST = "cd45cea7-0000-4000-8000-000000000003";
const SEBASTIAN_RIVIERA = "sebastian-riviera-profile";
const SEBASTIAN_HACK = "sebastian-hack-profile";

const SEBASTIAN_CANONICAL = "c7440f26-3b4c-4c94-be55-3baef8e98820";
const SEBASTIAN_HACKPADEL = "7af79bb9-8da2-4bbb-be6b-f5261aa35c7c";
const SEBASTIAN_CLUB_TEST = "0b35e3c9-3491-447c-96d7-aa35302e86e6";
const RIVIERA_OPEN_REAL = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const HACKPADEL_REAL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const CLUB_TEST_REAL = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";

function partido(
  id: string,
  jugadorId: string,
  org: string,
  puntos: number
): JugadorParticipacion {
  return {
    id,
    jugador_id: jugadorId,
    tipo_evento: "duelo_2v2",
    evento_id: `event-${id}`,
    evento_nombre: "Reta",
    resultado: "victoria",
    pareja_con: null,
    sets_favor: 0,
    sets_contra: 0,
    puntos_obtenidos: puntos,
    fecha: "2026-07-01",
    created_at: "2026-07-01T00:00:00Z",
    metadata: { organizador_id: org },
  };
}

describe("careerPointsByClub", () => {
  const homeMap = new Map([
    [SEBASTIAN_RIVIERA, RIVIERA_OPEN],
    [SEBASTIAN_HACK, HACKPADEL],
  ]);

  const historial = [
    partido("p1", SEBASTIAN_RIVIERA, RIVIERA_OPEN, 25),
    partido("p2", SEBASTIAN_HACK, HACKPADEL, 25),
  ];

  it("suma puntos de todos los clubes de la carrera", () => {
    const career = computeCareerPointsByClubFromParticipaciones(historial, {
      jugadorHomeOrgById: homeMap,
    });

    expect(career.total).toBe(50);
    expect(career.puntosByOrg.get(RIVIERA_OPEN)).toBe(25);
    expect(career.puntosByOrg.get(HACKPADEL)).toBe(25);
  });

  it("incluye club de contexto con 0 pts cuando se pide", () => {
    const career = computeCareerPointsByClubFromParticipaciones(historial, {
      jugadorHomeOrgById: homeMap,
      viewingOrganizadorId: CLUB_TEST,
      includeViewingOrgWithZero: true,
    });

    expect(career.puntosByOrg.get(CLUB_TEST)).toBe(0);
    expect(career.total).toBe(50);
    expect(shouldShowCareerPointsBreakdown(career, CLUB_TEST)).toBe(true);
  });

  it("ordena el club de la vista primero", () => {
    const career = computeCareerPointsByClubFromParticipaciones(historial, {
      jugadorHomeOrgById: homeMap,
      viewingOrganizadorId: HACKPADEL,
      includeViewingOrgWithZero: true,
    });

    const sorted = sortCareerClubsForDisplay(career.byClub, HACKPADEL);
    expect(sorted[0]?.organizadorId).toBe(HACKPADEL);
  });
});

describe("attachCareerPuntosToJugador", () => {
  const sharedParticipaciones: JugadorParticipacion[] = [
    partido(
      "810a9f92-11b4-45d4-8267-6a58b3d71920",
      SEBASTIAN_HACKPADEL,
      HACKPADEL_REAL,
      25
    ),
    partido(
      "ee2a6797-61b3-4dd2-b5e5-7e537b10f16c",
      SEBASTIAN_CANONICAL,
      RIVIERA_OPEN_REAL,
      25
    ),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (resolveOfficialGlobalPuntos as jest.Mock).mockResolvedValue(null);
    (listCareerParticipacionesPublic as jest.Mock).mockResolvedValue(
      sharedParticipaciones
    );
    (supabasePublicRead.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [
            { id: SEBASTIAN_CANONICAL, organizador_id: RIVIERA_OPEN_REAL },
            { id: SEBASTIAN_HACKPADEL, organizador_id: HACKPADEL_REAL },
            { id: SEBASTIAN_CLUB_TEST, organizador_id: CLUB_TEST_REAL },
          ],
          error: null,
        }),
      }),
    });
  });

  it("deduplica carrera aunque el RPC devuelva las mismas filas por cada linkedId", async () => {
    const jugador = {
      id: SEBASTIAN_CANONICAL,
      organizador_id: RIVIERA_OPEN_REAL,
    } as RivieraJugadorWithStats;

    const result = await attachCareerPuntosToJugador(jugador, {
      linkedJugadorIds: [
        SEBASTIAN_CANONICAL,
        SEBASTIAN_HACKPADEL,
        SEBASTIAN_CLUB_TEST,
      ],
    });

    expect(listCareerParticipacionesPublic).toHaveBeenCalledTimes(3);
    expect(result.careerPuntosTotal).toBe(50);
    expect(result.careerPuntosTotal).not.toBe(150);
    expect(result.careerPuntosByClub).toEqual(
      expect.arrayContaining([
        { organizadorId: RIVIERA_OPEN_REAL, puntos: 25 },
        { organizadorId: HACKPADEL_REAL, puntos: 25 },
      ])
    );
    expect(result.officialPuntosGlobal).toBeUndefined();
  });

  it("officialPuntosGlobal viene del ledger ROMC, no de career.total", async () => {
    (resolveOfficialGlobalPuntos as jest.Mock).mockResolvedValue(99);

    const jugador = {
      id: SEBASTIAN_CANONICAL,
      organizador_id: RIVIERA_OPEN_REAL,
    } as RivieraJugadorWithStats;

    const result = await attachCareerPuntosToJugador(jugador, {
      linkedJugadorIds: [SEBASTIAN_CANONICAL, SEBASTIAN_HACKPADEL],
    });

    expect(result.careerPuntosTotal).toBe(50);
    expect(result.officialPuntosGlobal).toBe(99);
    expect(resolveOfficialGlobalPuntos).toHaveBeenCalledWith(SEBASTIAN_CANONICAL);
  });

  it("getPlayerPointsByOrganizer y getPlayerGlobalPoints (Caso A/B)", async () => {
    const { getPlayerGlobalPoints, getPlayerPointsByOrganizer } = await import(
      "./careerPointsByClub"
    );
    const rows = [
      partido("a", SEBASTIAN_CANONICAL, CLUB_TEST_REAL, 50),
      partido("b", SEBASTIAN_HACKPADEL, HACKPADEL_REAL, 50),
    ];
    const career = computeCareerPointsByClubFromParticipaciones(rows, {
      jugadorHomeOrgById: new Map([
        [SEBASTIAN_CANONICAL, CLUB_TEST_REAL],
        [SEBASTIAN_HACKPADEL, HACKPADEL_REAL],
      ]),
    });

    expect(getPlayerGlobalPoints(career)).toBe(100);
    expect(getPlayerPointsByOrganizer(career, HACKPADEL_REAL)).toBe(50);
    expect(getPlayerPointsByOrganizer(career, CLUB_TEST_REAL)).toBe(50);
    expect(getPlayerPointsByOrganizer(career, RIVIERA_OPEN_REAL)).toBe(0);
  });
});
