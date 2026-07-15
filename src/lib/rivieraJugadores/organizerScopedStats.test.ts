import { enrichJugadoresOrganizerScopedStats } from "./organizerScopedStats";
import { clearCareerIdentityCache } from "./careerIdentityCache";
import * as playerIdentityService from "./playerIdentityService";
import * as careerPointsByClub from "./careerPointsByClub";
import * as playerPointsBreakdown from "./playerPointsBreakdown";
import * as rankingPointsAudit from "./rankingPointsAudit";
import type { RivieraJugadorWithStats } from "./types";

jest.mock("./playerIdentityService");
jest.mock("./careerPointsByClub");
jest.mock("./playerPointsBreakdown");
jest.mock("./rankingPointsAudit");

const mockResolvePlayerIdentity =
  playerIdentityService.resolvePlayerIdentity as jest.Mock;
const mockResolvePlayerCareer =
  playerIdentityService.resolvePlayerCareer as jest.Mock;
const mockAttachCareerPuntosToJugador =
  careerPointsByClub.attachCareerPuntosToJugador as jest.Mock;
const mockResolvePlayerPointsBreakdown =
  playerPointsBreakdown.resolvePlayerPointsBreakdown as jest.Mock;

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
});
