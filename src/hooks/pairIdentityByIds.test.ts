import { unorderedPairIdKey } from "../lib/rivieraJugadores/playerNameKey";
import type { Player, Pair } from "../lib/database";

function player(id: string, name: string): Player {
  return { id, name, email: "", created_at: "" };
}

function pair(
  id: string,
  p1: Player,
  p2: Player
): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: p1.id,
    player2_id: p2.id,
    player1: p1,
    player2: p2,
    created_at: "",
  } as Pair;
}

describe("parejas — identidad por IDs", () => {
  it("homónimos con IDs distintos no son el mismo conjunto", () => {
    const a = player("id-1", "Juan");
    const b = player("id-2", "Juan");
    expect(a.id).not.toBe(b.id);
    expect(unorderedPairIdKey(a.id, b.id)).toBe("id-1:id-2");
  });

  it("mismo conjunto invertido es duplicado", () => {
    expect(unorderedPairIdKey("a", "b")).toBe(unorderedPairIdKey("b", "a"));
  });

  it("nombres iguales con IDs distintos no duplican pareja", () => {
    const p1 = pair("pair-1", player("a", "Juan"), player("b", "Pedro"));
    const p2 = pair("pair-2", player("c", "Juan"), player("d", "Pedro"));
    expect(
      unorderedPairIdKey(p1.player1_id, p1.player2_id)
    ).not.toBe(unorderedPairIdKey(p2.player1_id, p2.player2_id));
  });
});
