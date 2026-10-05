import {
  clasificacionAchievementStats,
  clasificacionStandingHighlight,
  clasificacionStandingMeta,
} from "./clasificacionModo";

describe("clasificacionAchievementStats", () => {
  const row = {
    pg: 2,
    ptsFav: 15,
    dif: 12,
    setsDif: 3,
  };

  it("modo games a favor: FAV → DIF → PG", () => {
    expect(clasificacionAchievementStats("dif_puntos", row)).toEqual([
      { label: "FAV", value: "15" },
      { label: "DIF", value: "+12", highlight: true },
      { label: "PG", value: "2" },
    ]);
  });

  it("modo partidos ganados: PTS → FAV → DIF", () => {
    expect(clasificacionAchievementStats("setto_pg", row)).toEqual([
      { label: "PTS", value: "4" },
      { label: "FAV", value: "15" },
      { label: "DIF", value: "+12", highlight: true },
    ]);
  });
});

describe("clasificacionStandingHighlight / meta", () => {
  const row = {
    pg: 2,
    ptsFav: 15,
    dif: 12,
    setsDif: 3,
    pj: 2,
  };

  it("games a favor destaca FAV y meta PJ/PG/DIF", () => {
    expect(clasificacionStandingHighlight("dif_puntos", row)).toEqual({
      label: "FAV",
      value: "15",
    });
    expect(clasificacionStandingMeta("dif_puntos", row)).toEqual([
      { label: "PJ", value: "2" },
      { label: "PG", value: "2" },
      { label: "DIF", value: "+12" },
    ]);
  });

  it("partidos ganados destaca PTS y meta PJ/FAV/DIF", () => {
    expect(clasificacionStandingHighlight("setto_pg", row)).toEqual({
      label: "PTS",
      value: "4",
    });
    expect(clasificacionStandingMeta("setto_pg", row)).toEqual([
      { label: "PJ", value: "2" },
      { label: "FAV", value: "15" },
      { label: "DIF", value: "+12" },
    ]);
  });
});
