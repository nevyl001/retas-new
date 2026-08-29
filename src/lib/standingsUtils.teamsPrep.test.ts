import {
  mergePairToTeamAssignments,
  resizeTeamLogosArray,
} from "./standingsUtils";

describe("mergePairToTeamAssignments", () => {
  it("conserva asignaciones previas al recargar las mismas parejas", () => {
    const previous = { a: 1, b: 1, c: 0, d: 0, e: 0, f: 1 };
    const next = mergePairToTeamAssignments({
      pairIds: ["a", "b", "c", "d", "e", "f"],
      teamsCount: 2,
      previous,
    });
    expect(next).toEqual(previous);
  });

  it("solo asigna parejas nuevas sin mover las existentes", () => {
    const previous = { a: 0, b: 0, c: 1 };
    const next = mergePairToTeamAssignments({
      pairIds: ["a", "b", "c", "d"],
      teamsCount: 2,
      previous,
    });
    expect(next.a).toBe(0);
    expect(next.b).toBe(0);
    expect(next.c).toBe(1);
    expect(next.d).toBe(1); // equipo con menos miembros
  });

  it("elimina asignaciones de parejas borradas", () => {
    const next = mergePairToTeamAssignments({
      pairIds: ["a", "b"],
      teamsCount: 2,
      previous: { a: 0, b: 1, gone: 0 },
    });
    expect(next).toEqual({ a: 0, b: 1 });
  });
});

describe("resizeTeamLogosArray", () => {
  it("conserva URLs al recortar/ampliar", () => {
    expect(resizeTeamLogosArray(["a", "b"], 2)).toEqual(["a", "b"]);
    expect(resizeTeamLogosArray(["a"], 2)).toEqual(["a", null]);
    expect(resizeTeamLogosArray(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(resizeTeamLogosArray(undefined, 2)).toEqual([null, null]);
  });
});
