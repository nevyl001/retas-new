/**
 * @jest-environment jsdom
 */
import {
  buildResultsProtectionMessage,
  inspectTournamentResults,
  matchHasAggregateScore,
} from "./tournamentResultGuards";

describe("tournamentResultGuards", () => {
  test("detecta finished y scores agregados en matches", () => {
    expect(
      matchHasAggregateScore({
        status: "pending",
        pair1_score: undefined,
        pair2_score: undefined,
      })
    ).toBe(false);
    expect(
      matchHasAggregateScore({
        status: "finished",
        pair1_score: undefined,
        pair2_score: undefined,
      })
    ).toBe(true);
    expect(
      matchHasAggregateScore({
        status: "pending",
        pair1_score: 6,
        pair2_score: 4,
      })
    ).toBe(true);
  });

  test("games parciales bloquean aunque matches.status no sea finished", () => {
    const matches = [
      {
        id: "m1",
        status: "pending",
        pair1_score: undefined,
        pair2_score: undefined,
      },
      {
        id: "m2",
        status: "pending",
        pair1_score: undefined,
        pair2_score: undefined,
      },
    ];
    const games = [
      {
        match_id: "m1",
        pair1_games: 3,
        pair2_games: 2,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      },
    ];
    const snap = inspectTournamentResults(matches, games);
    expect(snap.matchLevelScored).toBe(0);
    expect(snap.gamesLevelScored).toBe(1);
    expect(snap.scoredMatchIds).toEqual(["m1"]);
    expect(buildResultsProtectionMessage(snap)).toContain("games");
  });

  test("fila games 0-0 también protege (set abierto)", () => {
    const snap = inspectTournamentResults(
      [{ id: "m9", status: "pending" }],
      [
        {
          match_id: "m9",
          pair1_games: 0,
          pair2_games: 0,
          is_tie_break: false,
          tie_break_pair1_points: 0,
          tie_break_pair2_points: 0,
        },
      ]
    );
    expect(snap.scoredMatchIds).toEqual(["m9"]);
  });
});
