import {
  pairPlayer1DisplayName,
  pairPlayer2DisplayName,
  pairPlayersDisplayLabel,
} from "./pairPlayerNames";

describe("pairPlayerNames", () => {
  it("prefiere players.name sobre el snapshot en pairs", () => {
    const pair = {
      player1_id: "p1",
      player2_id: "p2",
      player1_name: "David R",
      player2_name: "Itsi M",
      player1: { name: "David Rus" },
      player2: { name: "Itsi M" },
    };

    expect(pairPlayer1DisplayName(pair)).toBe("David Rus");
    expect(pairPlayersDisplayLabel(pair)).toBe("David Rus / Itsi M");
  });

  it("usa snapshot si no hay join a players", () => {
    const pair = {
      player1_id: "p1",
      player2_id: "p2",
      player1_name: "David Rus",
      player2_name: "Itsi M",
    };

    expect(pairPlayer2DisplayName(pair)).toBe("Itsi M");
    expect(pairPlayersDisplayLabel(pair)).toBe("David Rus / Itsi M");
  });
});
