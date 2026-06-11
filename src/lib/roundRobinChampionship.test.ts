import type { Match, Pair } from "./db/types";
import {
  buildChampionshipFinalMatchups,
  buildChampionshipMatchupsForRound,
  buildChampionshipSemifinalMatchups,
  championshipMatchEncounterLabel,
  isChampionshipFinalMatch,
  isChampionshipThirdPlaceMatch,
  resolveChampionshipPodium,
  sortChampionshipRoundMatches,
} from "./roundRobinChampionship";

describe("Remontada Final matchups", () => {
  const ranked = ["p1", "p2", "p3", "p4"];

  it("semifinal empareja #1 vs #4 y #2 vs #3", () => {
    expect(buildChampionshipSemifinalMatchups(ranked)).toEqual([
      ["p1", "p4"],
      ["p2", "p3"],
    ]);
  });

  it("ronda 1 usa semifinales por tabla", () => {
    expect(
      buildChampionshipMatchupsForRound(1, ranked, [], [])
    ).toEqual([
      ["p1", "p4"],
      ["p2", "p3"],
    ]);
  });

  it("ronda 2 arma la final con ganadores de semifinal", () => {
    const semiMatches: Match[] = [
      {
        id: "m1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p4",
        pair1_name: "A",
        pair2_name: "D",
        pair1_score: 2,
        pair2_score: 0,
        court: 1,
        round: 4,
        status: "finished",
        created_at: "",
      },
      {
        id: "m2",
        tournament_id: "t1",
        pair1_id: "p2",
        pair2_id: "p3",
        pair1_name: "B",
        pair2_name: "C",
        pair1_score: 0,
        pair2_score: 2,
        court: 2,
        round: 4,
        status: "finished",
        created_at: "",
      },
    ];

    expect(
      buildChampionshipMatchupsForRound(2, ranked, semiMatches, [])
    ).toEqual([
      ["p1", "p3"],
      ["p4", "p2"],
    ]);
  });

  it("ronda 2 incluye final y 3er lugar", () => {
    const semiMatches: Match[] = [
      {
        id: "m1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p4",
        pair1_name: "A",
        pair2_name: "D",
        pair1_score: 2,
        pair2_score: 0,
        court: 1,
        round: 4,
        status: "finished",
        created_at: "",
      },
      {
        id: "m2",
        tournament_id: "t1",
        pair1_id: "p2",
        pair2_id: "p3",
        pair1_name: "B",
        pair2_name: "C",
        pair1_score: 0,
        pair2_score: 2,
        court: 2,
        round: 4,
        status: "finished",
        created_at: "",
      },
    ];

    expect(buildChampionshipFinalMatchups(semiMatches, [])).toEqual([
      ["p1", "p3"],
      ["p4", "p2"],
    ]);
  });

  it("final no se genera si falta un ganador", () => {
    const semiMatches: Match[] = [
      {
        id: "m1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p4",
        pair1_name: "A",
        pair2_name: "D",
        pair1_score: 2,
        pair2_score: 0,
        court: 1,
        round: 4,
        status: "finished",
        created_at: "",
      },
      {
        id: "m2",
        tournament_id: "t1",
        pair1_id: "p2",
        pair2_id: "p3",
        pair1_name: "B",
        pair2_name: "C",
        pair1_score: 0,
        pair2_score: 0,
        court: 2,
        round: 4,
        status: "finished",
        created_at: "",
      },
    ];

    expect(buildChampionshipFinalMatchups(semiMatches, [])).toEqual([]);
  });

  it("identifica final y 3er lugar por parejas, no por cancha", () => {
    const semiMatches: Match[] = [
      {
        id: "s1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p4",
        pair1_name: "A",
        pair2_name: "D",
        pair1_score: 6,
        pair2_score: 2,
        court: 1,
        round: 4,
        status: "finished",
        created_at: "",
      },
      {
        id: "s2",
        tournament_id: "t1",
        pair1_id: "p2",
        pair2_id: "p3",
        pair1_name: "B",
        pair2_name: "C",
        pair1_score: 6,
        pair2_score: 2,
        court: 2,
        round: 4,
        status: "finished",
        created_at: "",
      },
    ];
    const finalMatch: Match = {
      id: "f1",
      tournament_id: "t1",
      pair1_id: "p1",
      pair2_id: "p2",
      pair1_name: "A",
      pair2_name: "B",
      court: 2,
      round: 5,
      status: "pending",
      created_at: "",
    };
    const thirdMatch: Match = {
      id: "t1m",
      tournament_id: "t1",
      pair1_id: "p4",
      pair2_id: "p3",
      pair1_name: "D",
      pair2_name: "C",
      court: 1,
      round: 5,
      status: "pending",
      created_at: "",
    };

    expect(isChampionshipFinalMatch(finalMatch, semiMatches)).toBe(true);
    expect(isChampionshipThirdPlaceMatch(thirdMatch, semiMatches)).toBe(true);
    expect(
      championshipMatchEncounterLabel(finalMatch, 2, 2, semiMatches)
    ).toBe("Final");
    expect(
      championshipMatchEncounterLabel(thirdMatch, 2, 2, semiMatches)
    ).toBe("3er lugar");
    expect(
      sortChampionshipRoundMatches([thirdMatch, finalMatch], 2, 2, semiMatches)
    ).toEqual([finalMatch, thirdMatch]);
  });

  it("resuelve podio: campeón, subcampeón y 3er lugar", async () => {
    const pairs: Pair[] = [
      {
        id: "p1",
        tournament_id: "t1",
        player1_id: "a1",
        player2_id: "a2",
        player1_name: "A1",
        player2_name: "A2",
        created_at: "",
      },
      {
        id: "p2",
        tournament_id: "t1",
        player1_id: "b1",
        player2_id: "b2",
        player1_name: "B1",
        player2_name: "B2",
        created_at: "",
      },
      {
        id: "p3",
        tournament_id: "t1",
        player1_id: "c1",
        player2_id: "c2",
        player1_name: "C1",
        player2_name: "C2",
        created_at: "",
      },
      {
        id: "p4",
        tournament_id: "t1",
        player1_id: "d1",
        player2_id: "d2",
        player1_name: "D1",
        player2_name: "D2",
        created_at: "",
      },
    ];
    const matches: Match[] = [
      {
        id: "f1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p2",
        pair1_name: "A",
        pair2_name: "B",
        pair1_score: 6,
        pair2_score: 3,
        court: 1,
        round: 5,
        match_type: "championship",
        status: "finished",
        created_at: "",
      },
      {
        id: "t1m",
        tournament_id: "t1",
        pair1_id: "p4",
        pair2_id: "p3",
        pair1_name: "D",
        pair2_name: "C",
        pair1_score: 6,
        pair2_score: 4,
        court: 2,
        round: 5,
        match_type: "championship",
        status: "finished",
        created_at: "",
      },
      {
        id: "s1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p4",
        pair1_name: "A",
        pair2_name: "D",
        pair1_score: 6,
        pair2_score: 2,
        court: 1,
        round: 4,
        match_type: "championship",
        status: "finished",
        created_at: "",
      },
      {
        id: "s2",
        tournament_id: "t1",
        pair1_id: "p2",
        pair2_id: "p3",
        pair1_name: "B",
        pair2_name: "C",
        pair1_score: 6,
        pair2_score: 2,
        court: 2,
        round: 4,
        match_type: "championship",
        status: "finished",
        created_at: "",
      },
    ];

    const podium = await resolveChampionshipPodium(
      pairs,
      matches,
      {
        championshipEnabled: true,
        championshipRounds: 2,
        championshipRoundsGenerated: 2,
        regularRoundsMax: 3,
      },
      []
    );

    expect(podium?.first?.id).toBe("p1");
    expect(podium?.second?.id).toBe("p2");
    expect(podium?.third?.id).toBe("p4");
  });
});
