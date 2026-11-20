import { planRetaScoreSave } from "./retaMatchScoreSave";

describe("planRetaScoreSave", () => {
  test("0-0 se guarda y no se descarta como marcador vacío", () => {
    const plan = planRetaScoreSave({
      score1: 0,
      score2: 0,
      existingSets: [],
      mode: "finish",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sets).toEqual([
      {
        pair1_games: 0,
        pair2_games: 0,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      },
    ]);
  });

  test("corregir a 0-0 reemplaza el set, no borra el partido", () => {
    const plan = planRetaScoreSave({
      score1: 0,
      score2: 0,
      existingSets: [
        {
          pair1_games: 6,
          pair2_games: 3,
          is_tie_break: false,
          tie_break_pair1_points: 0,
          tie_break_pair2_points: 0,
        },
      ],
      mode: "correct",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sets).toHaveLength(1);
    expect(plan.sets[0].pair1_games).toBe(0);
    expect(plan.sets[0].pair2_games).toBe(0);
  });

  test("un marcador a medias no se envía", () => {
    const plan = planRetaScoreSave({
      score1: Number.NaN,
      score2: 6,
      existingSets: [],
      mode: "finish",
    });
    expect(plan.ok).toBe(false);
  });
});
