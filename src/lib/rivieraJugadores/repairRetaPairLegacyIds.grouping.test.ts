import type { Pair } from "../db/types";
import { groupRetaPlayersByPair } from "./repairRetaPairLegacyIds";

const pairs: Pair[] = [
  {
    id: "pair-a",
    tournament_id: "reta-1",
    player1_id: "legacy-p1a",
    player2_id: "legacy-p1b",
    player1_name: "A1",
    player2_name: "A2",
    created_at: "2026-01-01",
  },
  {
    id: "pair-b",
    tournament_id: "reta-1",
    player1_id: "legacy-p2a",
    player2_id: "legacy-p2b",
    player1_name: "B1",
    player2_name: "B2",
    created_at: "2026-01-01",
  },
];

describe("groupRetaPlayersByPair", () => {
  it("agrupa dos jugadores de la misma pareja y separa parejas distintas", () => {
    const players = [
      { legacyPlayerId: "legacy-p1a", nombre: "A1" },
      { legacyPlayerId: "legacy-p1b", nombre: "A2" },
      { legacyPlayerId: "legacy-p2a", nombre: "B1" },
      { legacyPlayerId: "legacy-p2b", nombre: "B2" },
    ];

    const { pairGroups, unpaired } = groupRetaPlayersByPair(pairs, players);

    expect(unpaired).toEqual([]);
    expect(pairGroups).toHaveLength(2);
    expect(pairGroups.find((g) => g.pairId === "pair-a")?.players).toHaveLength(2);
    expect(pairGroups.find((g) => g.pairId === "pair-b")?.players).toHaveLength(2);
  });

  it("deja en unpaired jugadores sin legacy id o sin pareja conocida", () => {
    const { pairGroups, unpaired } = groupRetaPlayersByPair(pairs, [
      { legacyPlayerId: "legacy-p1a", nombre: "A1" },
      { nombre: "Sin legacy" },
      { legacyPlayerId: "legacy-huerfano", nombre: "Huérfano" },
    ]);

    expect(pairGroups).toHaveLength(1);
    expect(pairGroups[0].players).toHaveLength(1);
    expect(unpaired).toHaveLength(2);
  });
});
