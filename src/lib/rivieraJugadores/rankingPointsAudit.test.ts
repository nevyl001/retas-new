import {
  isRankingPointsAuditEnabled,
  logRankingPointsAudit,
  resetRankingPointsAuditDedupeForTests,
} from "./rankingPointsAudit";

describe("rankingPointsAudit", () => {
  const env = process.env;

  beforeEach(() => {
    resetRankingPointsAuditDedupeForTests();
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it("está desactivado por defecto (sin flag explícito)", () => {
    delete process.env.REACT_APP_RANKING_POINTS_AUDIT;
    expect(isRankingPointsAuditEnabled()).toBe(false);
  });

  it("solo loguea con REACT_APP_RANKING_POINTS_AUDIT=true", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});

    process.env.REACT_APP_RANKING_POINTS_AUDIT = "true";
    logRankingPointsAudit(
      "test.layer",
      { id: "4624bac2-2b9f-4a55-a032-146f482121b4", slug: "daniel-n", nombre: "Daniel N" },
      { clubPoints: 50, rivieraPoints: 0, totalPoints: 50 }
    );
    expect(spy).toHaveBeenCalledTimes(1);

    logRankingPointsAudit(
      "test.layer",
      { id: "4624bac2-2b9f-4a55-a032-146f482121b4", slug: "daniel-n", nombre: "Daniel N" },
      { clubPoints: 50, rivieraPoints: 0, totalPoints: 50 }
    );
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
