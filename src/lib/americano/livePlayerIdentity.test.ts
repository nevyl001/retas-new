import type { AmericanoPlayer, AmericanoRound } from "../db/types";
import {
  applyLiveNamesToAmericano,
  livePlayerLabel,
} from "./livePlayerIdentity";

function player(id: string, name: string): AmericanoPlayer {
  return {
    id,
    name,
    stats: {
      pointsFor: 1,
      pointsAgainst: 0,
      gamesPlayed: 1,
      roundsOnBench: 0,
    },
  };
}

describe("livePlayerIdentity", () => {
  it("usa el nombre de la ficha y conserva el del snapshot si la ficha no trae uno", () => {
    expect(livePlayerLabel({ a: "Yaf Hernández" }, "a", "yaf")).toBe(
      "Yaf Hernández"
    );
    expect(livePlayerLabel({ a: "  " }, "a", "yaf")).toBe("yaf");
    expect(livePlayerLabel(undefined, "a", "yaf")).toBe("yaf");
  });

  it("renombra inscritos, cancha y banca sin tocar el marcador", () => {
    const yaf = player("yaf", "yaf");
    const angelica = player("ang", "angelica parada");
    const daniel = player("dan", "Daniel Ludlow");
    const sixto = player("six", "Sixto Coach");
    const round: AmericanoRound = {
      roundNumber: 2,
      phase: 1,
      benchPlayers: [],
      matches: [
        {
          id: "m1",
          court: 1,
          scoreA: 6,
          scoreB: 4,
          teamA: [daniel, yaf],
          teamB: [sixto, angelica],
        },
      ],
    };

    const applied = applyLiveNamesToAmericano(
      [yaf, angelica, daniel, sixto],
      [round],
      { yaf: "Yaf H" }
    );

    expect(applied.changed).toBe(true);
    expect(applied.players.find((p) => p.id === "yaf")?.name).toBe("Yaf H");
    expect(applied.players.find((p) => p.id === "ang")?.name).toBe(
      "angelica parada"
    );
    expect(applied.rounds[0].matches[0].teamA[1].name).toBe("Yaf H");
    expect(applied.rounds[0].matches[0].teamA[1].stats.pointsFor).toBe(1);
    expect(applied.rounds[0].matches[0].scoreA).toBe(6);
    expect(applied.rounds[0].matches[0].scoreB).toBe(4);
    expect(applied.rounds[0].matches[0].teamB[1]).toBe(angelica);
  });

  it("no cambia el estado si la ficha ya coincide", () => {
    const yaf = player("yaf", "Yaf H");
    const applied = applyLiveNamesToAmericano([yaf], [], { yaf: "Yaf H" });
    expect(applied.changed).toBe(false);
    expect(applied.players[0]).toBe(yaf);
  });
});
