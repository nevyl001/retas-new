import {
  buildAmericanoPublicMatchHistory,
  buildAmericanoPublicMatchHistoryByPlayerId,
} from "./buildAmericanoPublicMatchHistory";
import type {
  AmericanoSnapshotPlayer,
  AmericanoSnapshotRound,
} from "./americanoDinamicoStorage";

function mini(
  id: string,
  name: string
): AmericanoSnapshotPlayer {
  return {
    id,
    name,
    stats: {
      pointsFor: 0,
      pointsAgainst: 0,
      gamesPlayed: 0,
      roundsOnBench: 0,
    },
  };
}

describe("buildAmericanoPublicMatchHistory", () => {
  const eduardo = mini("e", "Eduardo L");
  const carlos = mini("c", "Carlos R");
  const marco = mini("m", "Marco M");
  const zaid = mini("z", "Zaid");

  const rounds: AmericanoSnapshotRound[] = [
    {
      roundNumber: 1,
      phase: 1,
      benchPlayers: [],
      matches: [
        {
          id: "m1",
          court: 1,
          scoreA: 6,
          scoreB: 3,
          teamA: [eduardo, carlos],
          teamB: [marco, zaid],
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
          scoreA: 4,
          scoreB: 6,
          teamA: [eduardo, marco],
          teamB: [carlos, zaid],
        },
      ],
    },
    {
      roundNumber: 3,
      phase: 1,
      benchPlayers: [],
      matches: [
        {
          id: "m3",
          court: 1,
          scoreA: 5,
          scoreB: 5,
          teamA: [eduardo, zaid],
          teamB: [carlos, marco],
        },
        {
          id: "m-unscored",
          court: 2,
          teamA: [eduardo, carlos],
          teamB: [marco, zaid],
        },
      ],
    },
  ];

  it("incluye compañero, rivales, marcador y resultado (W/L/D)", () => {
    const history = buildAmericanoPublicMatchHistory("e", rounds);
    expect(history).toHaveLength(3);

    expect(history[0]).toEqual({
      matchId: "m1",
      roundNumber: 1,
      partnerName: "Carlos R",
      rivalsLabel: "Marco M / Zaid",
      scoreFavor: 6,
      scoreContra: 3,
      result: "win",
    });

    expect(history[1]).toMatchObject({
      roundNumber: 2,
      partnerName: "Marco M",
      rivalsLabel: "Carlos R / Zaid",
      scoreFavor: 4,
      scoreContra: 6,
      result: "loss",
    });

    expect(history[2]).toMatchObject({
      roundNumber: 3,
      partnerName: "Zaid",
      rivalsLabel: "Carlos R / Marco M",
      scoreFavor: 5,
      scoreContra: 5,
      result: "draw",
    });
  });

  it("ignora partidos sin marcador y jugadores ajenos", () => {
    expect(buildAmericanoPublicMatchHistory("missing", rounds)).toEqual([]);
    const carlosHistory = buildAmericanoPublicMatchHistory("c", rounds);
    expect(carlosHistory.every((e) => e.matchId !== "m-unscored")).toBe(true);
    expect(carlosHistory).toHaveLength(3);
  });

  it("buildAmericanoPublicMatchHistoryByPlayerId evita N+1 lógicos", () => {
    const map = buildAmericanoPublicMatchHistoryByPlayerId(
      ["e", "c", "m", "z"],
      rounds
    );
    expect(map.get("e")).toHaveLength(3);
    expect(map.get("c")?.[0].partnerName).toBe("Eduardo L");
    expect(map.get("m")?.[0].result).toBe("loss");
  });
});
