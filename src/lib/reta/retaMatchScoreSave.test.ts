import { matchAfterResultCleared, planRetaScoreSave } from "./retaMatchScoreSave";
import type { Match } from "../database";

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

  test("eliminar resultado deja el partido en su ronda sin marcador", () => {
    const match = {
      id: "m1",
      tournament_id: "t1",
      pair1_id: "a",
      pair2_id: "b",
      pair1_name: "Aimee / Ricardo S",
      pair2_name: "Patricia Hdz / Dany Mont",
      court: 2,
      round: 5,
      status: "finished",
      pair1_score: 0,
      pair2_score: 0,
      created_at: "",
    } as Match;
    const cleared = matchAfterResultCleared(match);
    expect(cleared.status).toBe("pending");
    expect(cleared.round).toBe(5);
    expect(cleared.court).toBe(2);
    expect(cleared.pair1_id).toBe("a");
    expect(cleared.pair2_id).toBe("b");
    expect(cleared.pair1_score).toBeUndefined();
    expect(cleared.pair2_score).toBeUndefined();
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
