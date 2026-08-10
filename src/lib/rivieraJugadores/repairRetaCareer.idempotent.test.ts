/**
 * Reta cerrada + career sync fallido → repair idempotente sin re-marcar
 * is_finished ni cablear finalize_reta_atomic.
 */
import { getMatches, getPairs } from "../database";
import { finalizeCareerEvent } from "./careerEventPipeline";
import { repairRetaCareerSync } from "./repairCareerClose";

jest.mock("../database", () => ({
  getPairs: jest.fn(),
  getMatches: jest.fn(),
}));

jest.mock("./careerEventPipeline", () => ({
  finalizeCareerEvent: jest.fn(),
}));

const finalizeMock = finalizeCareerEvent as jest.Mock;
const getPairsMock = getPairs as jest.Mock;
const getMatchesMock = getMatches as jest.Mock;

const TOURNAMENT = {
  id: "reta-closed-1",
  name: "Reta cerrada",
  description: null,
  courts: 2,
  is_started: true,
  is_finished: true,
  user_id: "org-1",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T12:00:00.000Z",
  format: "teams",
};

describe("repairRetaCareerSync — closed + incomplete career", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPairsMock.mockResolvedValue([{ id: "pair-1" }]);
    getMatchesMock.mockResolvedValue([{ id: "m-1" }]);
  });

  it("failure → retry → ok; segunda ejecución no cambia contrato (idempotente)", async () => {
    finalizeMock
      .mockResolvedValueOnce({
        ok: false,
        resultSaved: true,
        careerSynced: false,
        warnings: [],
        criticalFailures: [{ code: "sync_failed", message: "ledger timeout" }],
        failures: [{ code: "sync_failed", message: "ledger timeout" }],
      })
      .mockResolvedValue({
        ok: true,
        resultSaved: true,
        careerSynced: true,
        warnings: [],
        criticalFailures: [],
        failures: [],
      });

    const fail = await repairRetaCareerSync({
      organizadorId: "org-1",
      tournament: TOURNAMENT as never,
    });
    expect(fail.careerSyncOk).toBe(false);
    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reta",
        organizadorId: "org-1",
        tournament: expect.objectContaining({
          id: "reta-closed-1",
          is_finished: true,
        }),
      })
    );

    const ok = await repairRetaCareerSync({
      organizadorId: "org-1",
      tournament: TOURNAMENT as never,
    });
    expect(ok.careerSyncOk).toBe(true);

    const again = await repairRetaCareerSync({
      organizadorId: "org-1",
      tournament: TOURNAMENT as never,
    });
    expect(again.careerSyncOk).toBe(true);
    expect(finalizeMock).toHaveBeenCalledTimes(3);
    // Repair never calls updateTournament — only finalizeCareerEvent.
  });

  it("no reabre ni exige torneo en curso: is_finished permanece true en input", async () => {
    finalizeMock.mockResolvedValue({
      ok: true,
      resultSaved: true,
      careerSynced: true,
      warnings: [],
      criticalFailures: [],
      failures: [],
    });
    await repairRetaCareerSync({
      organizadorId: "org-1",
      tournament: { ...TOURNAMENT, is_finished: false } as never,
    });
    expect(finalizeMock.mock.calls[0][0].tournament.is_finished).toBe(true);
  });
});
