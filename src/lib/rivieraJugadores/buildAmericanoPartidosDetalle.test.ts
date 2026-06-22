import type { AmericanoPlayer, AmericanoRound } from "../db/types";
import { buildAmericanoPartidosDetalleForPlayer } from "./buildAmericanoPartidosDetalle";

const p1: AmericanoPlayer = {
  id: "p1",
  name: "Ana",
  stats: { gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0, roundsOnBench: 0 },
};
const p2: AmericanoPlayer = {
  id: "p2",
  name: "Bea",
  stats: { gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0, roundsOnBench: 0 },
};
const p3: AmericanoPlayer = {
  id: "p3",
  name: "Carlos",
  stats: { gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0, roundsOnBench: 0 },
};
const p4: AmericanoPlayer = {
  id: "p4",
  name: "Diego",
  stats: { gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0, roundsOnBench: 0 },
};

const rounds: AmericanoRound[] = [
  {
    roundNumber: 1,
    phase: 1,
    benchPlayers: [],
    matches: [
      {
        id: "am1",
        court: 1,
        teamA: [p1, p2],
        teamB: [p3, p4],
        scoreA: 6,
        scoreB: 3,
      },
    ],
  },
];

describe("buildAmericanoPartidosDetalle", () => {
  it("genera detalle desde perspectiva del jugador", () => {
    const detalle = buildAmericanoPartidosDetalleForPlayer(
      "p1",
      rounds,
      "2026-06-01T12:00:00Z"
    );
    expect(detalle).toHaveLength(1);
    expect(detalle[0]).toMatchObject({
      ronda: 1,
      fase: "Ronda 1",
      rival: "Carlos / Diego",
      games_favor: 6,
      games_contra: 3,
      resultado: "win",
    });
  });
});
