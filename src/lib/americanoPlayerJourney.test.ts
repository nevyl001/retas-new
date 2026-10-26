import {
  buildAmericanoPlayerJourney,
  deriveAmericanoRoundStatus,
} from "./americanoPlayerJourney";
import { computeAmericanoLiveRanking } from "./americanoLiveStandings";
import type { AmericanoPlayer, AmericanoRound } from "./db/types";

function player(id: string, name = id): AmericanoPlayer {
  return {
    id,
    name,
    stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 },
  };
}

describe("recorrido americano por jugador", () => {
  const ana = player("a1", "Ana");
  const ana2 = player("a2", "Ana");
  const luis = player("l1", "Luis");
  const maria = player("m1", "María");
  const round: AmericanoRound = {
    roundNumber: 1,
    phase: 1,
    benchPlayers: [maria],
    matches: [
      {
        id: "m1",
        court: 2,
        scoreA: 6,
        scoreB: 4,
        teamA: [ana, luis],
        teamB: [ana2, player("p4", "Pablo")],
      },
    ],
  };

  it("distingue ids aunque el nombre se repita, marca descanso y pendiente", () => {
    const first = buildAmericanoPlayerJourney("a1", [round], 2);
    const twin = buildAmericanoPlayerJourney("a2", [round], 2);
    const bench = buildAmericanoPlayerJourney("m1", [round], 2);

    expect(first[0]).toMatchObject({
      kind: "match",
      court: 2,
      partnerId: "l1",
      scoreFavor: 6,
      scoreContra: 4,
      result: "G",
    });
    expect(first[0].rivalIds).toEqual(["a2", "p4"]);
    expect(twin[0].result).toBe("P");
    expect(twin[0].partnerId).not.toBe(first[0].partnerId);
    expect(bench[0].kind).toBe("bench");
    expect(first[1].kind).toBe("pending");
  });

  it("empate y ronda sin emparejamiento no inventan partido", () => {
    const tied: AmericanoRound = {
      ...round,
      matches: [{ ...round.matches[0], scoreA: 5, scoreB: 5 }],
    };
    expect(buildAmericanoPlayerJourney("a1", [tied], 1)[0].result).toBe("E");
    expect(buildAmericanoPlayerJourney("a1", [], 1)[0]).toEqual({
      roundNumber: 1,
      kind: "pending",
    });
  });

  it("deriva el estado real de la ronda", () => {
    expect(
      deriveAmericanoRoundStatus(round, {
        isCurrent: true,
        tournamentFinished: false,
      })
    ).toBe("en_juego");
    expect(
      deriveAmericanoRoundStatus(round, {
        isCurrent: false,
        tournamentFinished: false,
      })
    ).toBe("finalizada");
    expect(
      deriveAmericanoRoundStatus(
        { matches: [{ scoreA: undefined, scoreB: undefined }] },
        { isCurrent: false, tournamentFinished: false }
      )
    ).toBe("pendiente");
  });

  it("reconstruye el ranking desde el marcador vigente, sin sumar dos veces", () => {
    const roster = [ana, luis, ana2, player("p4", "Pablo")];
    const before = computeAmericanoLiveRanking(roster, [round]);
    expect(before.find((p) => p.id === "a1")?.stats.pointsFor).toBe(6);

    const corrected: AmericanoRound = {
      ...round,
      matches: [{ ...round.matches[0], scoreA: 2, scoreB: 6 }],
    };
    const after = computeAmericanoLiveRanking(roster, [corrected]);
    expect(after.find((p) => p.id === "a1")?.stats.pointsFor).toBe(2);
    expect(after.find((p) => p.id === "a1")?.stats.gamesPlayed).toBe(1);
    expect(after.slice(0, 2).map((p) => p.id).sort()).toEqual(["a2", "p4"]);
  });
});
