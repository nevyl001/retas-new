import { resolvePlayerInPool } from "./playerNameKey";
import type { Player } from "../db/types";

function player(id: string, name: string): Player {
  return { id, name, email: "", created_at: "" };
}

describe("resolvePlayerInPool", () => {
  it("prioriza id exacto cuando hay dos jugadores con el mismo nombre", () => {
    const hackDavid = player("hack-david-id", "David R");
    const rivieraDavid = player("riviera-david-id", "David R");
    const pool = [hackDavid, rivieraDavid];

    expect(resolvePlayerInPool(hackDavid, pool)).toBe(hackDavid);
    expect(resolvePlayerInPool(rivieraDavid, pool)).toBe(rivieraDavid);
  });

  it("resuelve por nombre único cuando el id no está en el pool", () => {
    const carlosCo = player("id-co", "Carlos Co");
    const pool = [carlosCo];

    expect(
      resolvePlayerInPool(
        { id: "otro-uuid", name: "Carlos Co", email: "", created_at: "" },
        pool
      )
    ).toBe(carlosCo);
  });
});
