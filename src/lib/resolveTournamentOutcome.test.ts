import { matchesForStandingsTable } from "./resolveTournamentOutcome";
import type { Match } from "./database";
import type { RoundRobinChampionshipConfig } from "./roundRobinChampionship";

const mkMatch = (id: string, round: number, type?: string): Match =>
  ({
    id,
    tournament_id: "t1",
    pair1_id: "p1",
    pair2_id: "p2",
    round,
    court: 1,
    status: "finished",
    match_type: type,
    created_at: "",
  }) as Match;

describe("resolveTournamentOutcome", () => {
  it("matchesForStandingsTable excluye playoffs cuando hay remontada", () => {
    const matches = [
      mkMatch("r1", 1),
      mkMatch("r2", 2),
      mkMatch("r3", 3),
      mkMatch("s1", 4, "championship"),
      mkMatch("f1", 5, "championship"),
    ];
    const cfg: RoundRobinChampionshipConfig = {
      championshipEnabled: true,
      championshipRounds: 2,
      championshipRoundsGenerated: 2,
      regularRoundsMax: 3,
    };
    const regular = matchesForStandingsTable(matches, "t1", cfg);
    expect(regular.map((m) => m.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("matchesForStandingsTable devuelve todos si no hay remontada", () => {
    const matches = [mkMatch("r1", 1), mkMatch("r2", 2)];
    expect(matchesForStandingsTable(matches, "t1", null)).toHaveLength(2);
  });
});
