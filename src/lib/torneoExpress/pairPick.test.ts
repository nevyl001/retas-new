import { nextPairPick } from "./pairPick";

describe("nextPairPick", () => {
  it("primer toque selecciona al jugador", () => {
    expect(nextPairPick(null, "a")).toEqual({ type: "select", id: "a" });
  });

  it("tocar de nuevo al mismo cancela la selección", () => {
    expect(nextPairPick("a", "a")).toEqual({ type: "clear" });
  });

  it("segundo toque forma la pareja al instante", () => {
    expect(nextPairPick("a", "b")).toEqual({
      type: "form",
      id1: "a",
      id2: "b",
    });
  });
});
