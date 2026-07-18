import {
  dedupeParejaDraftsByPlayerId,
  dedupePlayersById,
  dedupePlayersForSelect,
  resolvePlayerInPool,
  unorderedPairIdKey,
} from "./playerNameKey";
import type { Player } from "../db/types";

function player(id: string, name: string, created_at = "2026-01-01"): Player {
  return { id, name, email: "", created_at };
}

describe("pools — dedupe y resolve solo por ID", () => {
  it("dedupePlayersForSelect conserva homónimos", () => {
    const out = dedupePlayersForSelect([
      player("a", "David R"),
      player("b", "David R"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("dedupePlayersById deduplica mismo id y conserva homónimos", () => {
    const out = dedupePlayersById([
      player("a", "Juan"),
      player("a", "Juan", "2026-01-02"),
      player("b", "Juan"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("resolvePlayerInPool no escoge por nombre", () => {
    const carlosCo = player("id-co", "Carlos Co");
    const pool = [carlosCo];
    const unresolved = player("otro-uuid", "Carlos Co");
    expect(resolvePlayerInPool(unresolved, pool)).toBe(unresolved);
    expect(resolvePlayerInPool(carlosCo, pool)).toBe(carlosCo);
  });

  it("parejas draft no se deduplican por nombre", () => {
    const kept = dedupeParejaDraftsByPlayerId([
      {
        id: "p1",
        jugador1: player("a", "Juan"),
        jugador2: player("b", "Pedro"),
      },
      {
        id: "p2",
        jugador1: player("c", "Juan"),
        jugador2: player("d", "Pedro"),
      },
    ]);
    expect(kept).toHaveLength(2);
  });

  it("unorderedPairIdKey ignora orden", () => {
    expect(unorderedPairIdKey("b", "a")).toBe(unorderedPairIdKey("a", "b"));
  });
});
