import { excludeRevokedGrantLocalClones } from "./organizerPlayerAccess";

describe("excludeRevokedGrantLocalClones", () => {
  it("quita clones locales cuyo acceso fue revocado", () => {
    const rows = [
      { id: "own-1", nombre: "Propio" },
      { id: "clone-aaron", nombre: "Aaron" },
      { id: "own-2", nombre: "Otro" },
    ];
    const revoked = new Set(["clone-aaron"]);

    expect(excludeRevokedGrantLocalClones(rows, revoked)).toEqual([
      { id: "own-1", nombre: "Propio" },
      { id: "own-2", nombre: "Otro" },
    ]);
  });
});
