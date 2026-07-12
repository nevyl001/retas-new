import {
  derivePlayerPoolViews,
  shouldShowPlayerPoolLoading,
} from "../../hooks/organizerPlayerPoolLogic";
import type { Player } from "../../lib/database";

function player(id: string, name: string): Player {
  return {
    id,
    name,
    email: `${id}@padel.local`,
    created_at: "2020-01-01",
  } as Player;
}

describe("Reta player pool presentation", () => {
  it("Gestión de jugadores: empty state cuando loading false y 0 players", () => {
    expect(shouldShowPlayerPoolLoading(false, 0)).toBe(false);
  });

  it("Gestión de parejas reutiliza el mismo pool (disponibles/emparejados)", () => {
    const pool = [
      player("1", "A"),
      player("2", "B"),
      player("3", "C"),
    ];
    const views = derivePlayerPoolViews(pool, ["1", "2"]);
    expect(views.available).toHaveLength(1);
    expect(views.paired).toHaveLength(2);
    expect(views.available[0].id).toBe("3");
  });

  it("refetch con datos no vuelve a skeleton", () => {
    expect(shouldShowPlayerPoolLoading(true, 27)).toBe(false);
  });
});
