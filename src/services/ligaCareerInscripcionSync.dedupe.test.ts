/**
 * Un ensure de inscripciones de liga prepara las cesiones una vez
 * y no deja que cada jugador vuelva a recorrerlas.
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea */
jest.mock("../lib/rivieraJugadores/careerEventPipeline", () => ({
  finalizeCareerEvent: jest.fn().mockResolvedValue({ ok: true, failures: [] }),
}));

jest.mock("../lib/rivieraJugadores/jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
}));

import { finalizeCareerEvent } from "../lib/rivieraJugadores/careerEventPipeline";
import { prepareParticipacionIdentityForOrganizer } from "../lib/rivieraJugadores/jugadorIdResolver";
import { ensureLigaInscripcionRankingForLiga } from "./ligaCareerInscripcionSync";
/* eslint-enable import/first */

describe("ensureLigaInscripcionRankingForLiga", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (finalizeCareerEvent as jest.Mock).mockResolvedValue({
      ok: true,
      failures: [],
    });
    (prepareParticipacionIdentityForOrganizer as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  it("prepara la identidad del club una vez y omite el ensure por jugador", async () => {
    await ensureLigaInscripcionRankingForLiga("liga-1", "org-1", ["a", "b", "a"]);

    expect(prepareParticipacionIdentityForOrganizer).toHaveBeenCalledTimes(1);
    expect(prepareParticipacionIdentityForOrganizer).toHaveBeenCalledWith("org-1");
    expect(finalizeCareerEvent).toHaveBeenCalledTimes(2);
    for (const call of (finalizeCareerEvent as jest.Mock).mock.calls) {
      expect(call[0].options.skipIdentityEnsure).toBe(true);
    }
  });
});
