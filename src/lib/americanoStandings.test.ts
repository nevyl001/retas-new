import type { AmericanoPlayer, AmericanoRound } from "./db/types";
import { getAmericanoRanking } from "./americanoStandings";

function makePlayers(n: number): AmericanoPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Player ${i + 1}`,
    stats: {
      pointsFor: 0,
      pointsAgainst: 0,
      gamesPlayed: 0,
      roundsOnBench: 0,
    },
  }));
}

describe("getAmericanoRanking — tabla FAV → DIF → H2H → PG", () => {
  it("empate 1-1 IsraBe/Chaparro: gana quien ganó la ronda 3", () => {
    const ps = makePlayers(8);
    ps[2].name = "Chaparro";
    ps[4].name = "IsraBe";

    const rounds: AmericanoRound[] = [
      {
        roundNumber: 1,
        phase: 1,
        benchPlayers: [],
        matches: [
          {
            id: "m1",
            court: 1,
            teamA: [ps[5], ps[2]],
            teamB: [ps[6], ps[4]],
            scoreA: 4,
            scoreB: 6,
          },
        ],
      },
      {
        roundNumber: 2,
        phase: 1,
        benchPlayers: [],
        matches: [
          {
            id: "m2",
            court: 1,
            teamA: [ps[3], ps[5]],
            teamB: [ps[2], ps[4]],
            scoreA: 6,
            scoreB: 3,
          },
        ],
      },
      {
        roundNumber: 3,
        phase: 2,
        benchPlayers: [],
        matches: [
          {
            id: "m3",
            court: 2,
            teamA: [ps[4], ps[7]],
            teamB: [ps[3], ps[2]],
            scoreA: 4,
            scoreB: 6,
          },
        ],
      },
    ];

    const ranked = getAmericanoRanking(ps, rounds);
    const chapIdx = ranked.findIndex((p) => p.name === "Chaparro");
    const israIdx = ranked.findIndex((p) => p.name === "IsraBe");
    expect(chapIdx).toBeLessThan(israIdx);
  });

  it("desempata IsraBe vs Chaparro por H2H, no alfabeto", () => {
    const ps = makePlayers(8);
    ps[2].name = "Chaparro";
    ps[4].name = "IsraBe";

    const rounds: AmericanoRound[] = [
      {
        roundNumber: 1,
        phase: 1,
        benchPlayers: [],
        matches: [
          {
            id: "m1",
            court: 1,
            teamA: [ps[0], ps[1]],
            teamB: [ps[2], ps[3]],
            scoreA: 10,
            scoreB: 3,
          },
          {
            id: "m2",
            court: 2,
            teamA: [ps[4], ps[7]],
            teamB: [ps[5], ps[6]],
            scoreA: 8,
            scoreB: 6,
          },
        ],
      },
      {
        roundNumber: 2,
        phase: 1,
        benchPlayers: [],
        matches: [
          {
            id: "m3",
            court: 1,
            teamA: [ps[4], ps[3]],
            teamB: [ps[2], ps[5]],
            scoreA: 7,
            scoreB: 4,
          },
        ],
      },
    ];

    const ranked = getAmericanoRanking(ps, rounds);
    const chapIdx = ranked.findIndex((p) => p.name === "Chaparro");
    const israIdx = ranked.findIndex((p) => p.name === "IsraBe");
    expect(chapIdx).toBeGreaterThanOrEqual(0);
    expect(israIdx).toBeGreaterThanOrEqual(0);
    expect(israIdx).toBeLessThan(chapIdx);
    expect("Chaparro".localeCompare("IsraBe")).toBeLessThan(0);
  });

  it("ordena por DIF cuando FAV empata", () => {
    const ps = makePlayers(4);
    const rounds: AmericanoRound[] = [
      {
        roundNumber: 1,
        phase: 1,
        benchPlayers: [],
        matches: [
          {
            id: "m1",
            court: 1,
            teamA: [ps[0], ps[1]],
            teamB: [ps[2], ps[3]],
            scoreA: 12,
            scoreB: 10,
          },
          {
            id: "m2",
            court: 2,
            teamA: [ps[0], ps[2]],
            teamB: [ps[1], ps[3]],
            scoreA: 0,
            scoreB: 4,
          },
        ],
      },
    ];

    const ranked = getAmericanoRanking(ps, rounds);
    const p0 = ranked.findIndex((p) => p.id === ps[0].id);
    const p2 = ranked.findIndex((p) => p.id === ps[2].id);
    expect(p0).toBeLessThan(p2);
  });
});
