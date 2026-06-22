import {
  matchesForStandingsTable,
  resolveTournamentPodiumOutcome,
} from "./resolveTournamentOutcome";
import type { Game, Match, Pair } from "./database";
import type { RoundRobinChampionshipConfig } from "./roundRobinChampionship";

const mkMatch = (
  id: string,
  round: number,
  p1: string,
  p2: string,
  s1: number,
  s2: number,
  type?: string
): Match =>
  ({
    id,
    tournament_id: "t1",
    pair1_id: p1,
    pair2_id: p2,
    pair1_score: s1,
    pair2_score: s2,
    round,
    court: 1,
    status: "finished",
    match_type: type,
    created_at: "",
  }) as Match;

const pairs: Pair[] = [
  { id: "p1", tournament_id: "t1", player1_id: "a", player2_id: "b", player1_name: "Dany", player2_name: "David", created_at: "" },
  { id: "p2", tournament_id: "t1", player1_id: "c", player2_id: "d", player1_name: "Mark", player2_name: "Oscar", created_at: "" },
  { id: "p3", tournament_id: "t1", player1_id: "e", player2_id: "f", player1_name: "Fer", player2_name: "Beto", created_at: "" },
  { id: "p4", tournament_id: "t1", player1_id: "g", player2_id: "h", player1_name: "Julio", player2_name: "Lalo", created_at: "" },
];

const champCfg: RoundRobinChampionshipConfig = {
  championshipEnabled: true,
  championshipRounds: 2,
  championshipRoundsGenerated: 2,
  regularRoundsMax: 3,
};

describe("resolveTournamentOutcome", () => {
  it("matchesForStandingsTable excluye playoffs cuando hay remontada", () => {
    const matches = [
      mkMatch("r1", 1, "p1", "p2", 6, 2),
      mkMatch("r2", 2, "p1", "p3", 6, 2),
      mkMatch("r3", 3, "p1", "p4", 6, 2),
      mkMatch("s1", 4, "p1", "p4", 6, 2, "championship"),
      mkMatch("f1", 5, "p1", "p2", 6, 2, "championship"),
    ];
    const regular = matchesForStandingsTable(matches, "t1", champCfg);
    expect(regular.map((m) => m.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("matchesForStandingsTable devuelve todos si no hay remontada", () => {
    const matches = [mkMatch("r1", 1, "p1", "p2", 6, 2), mkMatch("r2", 2, "p1", "p3", 6, 2)];
    expect(matchesForStandingsTable(matches, "t1", null)).toHaveLength(2);
  });

  it("podio con remontada: 2.º y 3.º desde final y partido de 3er lugar, no tabla RR", async () => {
    const matches: Match[] = [
      mkMatch("rr1", 1, "p2", "p3", 6, 0),
      mkMatch("rr2", 2, "p2", "p4", 6, 0),
      mkMatch("rr3", 3, "p2", "p1", 6, 0),
      mkMatch("s1", 4, "p2", "p3", 6, 2, "championship"),
      mkMatch("s2", 4, "p1", "p4", 6, 2, "championship"),
      mkMatch("f1", 5, "p1", "p2", 6, 2, "championship"),
      mkMatch("t1", 5, "p4", "p3", 6, 2, "championship"),
    ];
    const games: Game[] = [];

    const outcome = await resolveTournamentPodiumOutcome(
      pairs,
      matches,
      games,
      "t1",
      champCfg
    );

    expect(outcome.winner?.pair.id).toBe("p1");
    expect(outcome.secondPair?.id).toBe("p2");
    expect(outcome.thirdPair?.id).toBe("p4");
  });
});
