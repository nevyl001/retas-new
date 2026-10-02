import { clasificacionAchievementStats } from "./clasificacionModo";

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

  it("modo partidos ganados: PG → SETS → DIF", () => {
    expect(clasificacionAchievementStats("setto_pg", row)).toEqual([
      { label: "PG", value: "2" },
      { label: "SETS", value: "+3", highlight: true },
      { label: "DIF", value: "+12", highlight: true },
    ]);
  });
});
