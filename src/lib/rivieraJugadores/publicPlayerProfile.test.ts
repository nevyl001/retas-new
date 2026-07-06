import { getPublicPlayerProfileData } from "./getPublicPlayerProfileData";
import * as identityModule from "./playerIdentityService";

const RIVIERA = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const CLUB_TEST = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";
const SEBASTIAN = "c7440f26-3b4c-4c94-be55-3baef8e98820";

describe("public player profile entry", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getPublicPlayerProfileData delega al motor de identidad", () => {
    expect(getPublicPlayerProfileData).toBe(identityModule.getPublicPlayerProfileData);
  });

  it("contrato: historialMain = historialGlobal (sin filtro org)", async () => {
    const spy = jest
      .spyOn(identityModule, "getPublicPlayerProfileData")
      .mockResolvedValue({
        jugador: { id: SEBASTIAN, careerPuntosTotal: 50 } as never,
        identity: {} as never,
        viewingOrgId: RIVIERA,
        hasOrgContext: true,
        localRankingPos: null,
        historialGlobal: [{ id: "a" }, { id: "b" }] as never,
        historialMain: [{ id: "a" }, { id: "b" }] as never,
        historialOtrosClubes: [],
        historialRating: [],
        career: { total: 50, byClub: [], puntosByOrg: new Map() },
      });

    const data = await getPublicPlayerProfileData({
      playerId: SEBASTIAN,
      viewingOrgId: HACKPADEL,
    });

    expect(spy).toHaveBeenCalled();
    expect(data?.historialMain.length).toBe(data?.historialGlobal.length);
    expect(data?.historialOtrosClubes).toEqual([]);
  });

  it("contrato Sebastian: total 50 estable entre orgs", async () => {
    jest.spyOn(identityModule, "getPublicPlayerProfileData").mockImplementation(
      async ({ viewingOrgId }) => ({
        jugador: {
          id: SEBASTIAN,
          careerPuntosTotal: 50,
          careerPuntosByClub: [
            { organizadorId: RIVIERA, puntos: 25 },
            { organizadorId: HACKPADEL, puntos: 25 },
          ],
        } as never,
        identity: { linkedJugadorIds: [SEBASTIAN] } as never,
        viewingOrgId,
        hasOrgContext: Boolean(viewingOrgId),
        localRankingPos: 1,
        historialGlobal: [{ id: "1" }, { id: "2" }] as never,
        historialMain: [{ id: "1" }, { id: "2" }] as never,
        historialOtrosClubes: [],
        historialRating: [{ id: "r1" }] as never,
        career: {
          total: 50,
          byClub: [
            { organizadorId: RIVIERA, puntos: 25 },
            { organizadorId: HACKPADEL, puntos: 25 },
          ],
          puntosByOrg: new Map(),
        },
      })
    );

    for (const org of [RIVIERA, HACKPADEL, CLUB_TEST]) {
      const data = await getPublicPlayerProfileData({
        playerId: SEBASTIAN,
        viewingOrgId: org,
      });
      expect(data?.career.total).toBe(50);
      expect(data?.historialGlobal.length).toBe(2);
    }
  });
});
