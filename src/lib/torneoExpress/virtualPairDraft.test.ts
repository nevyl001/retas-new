import type { Player } from "../database";
import { assignRoundRobinSchedule } from "./assignRoundRobinSchedule";
import { buildDraftScheduleMatches } from "./draftScheduleMatch";
import { expectedMatchCount, generateBalancedRoundRobin } from "./roundRobin";
import { validateScheduleInvariants } from "./scheduleInvariants";
import type { DraftTournamentPair, RealDraftPair, VirtualDraftPair } from "./virtualPairDraft";
import {
  draftPairDisplay,
  nextVirtualPairLabel,
  normalizeVirtualPairLabel,
} from "./virtualPairDraft";

function player(id: string, name: string): Player {
  return { id, name, email: "", created_at: "" };
}

function real(id: string, a: string, b: string): RealDraftPair {
  return {
    kind: "real",
    id,
    jugador1: player(`${id}-1`, a),
    jugador2: player(`${id}-2`, b),
  };
}

function virtual(id: string, virtualLabel: string): VirtualDraftPair {
  return { kind: "virtual", id, virtualLabel };
}

describe("borrador de pareja virtual", () => {
  it("dos virtuales nuevas reciben labels default distintos", () => {
    const first = nextVirtualPairLabel([]);
    const second = nextVirtualPairLabel([first]);
    expect(first).toBe("Pareja por definir 1");
    expect(second).toBe("Pareja por definir 2");
    expect(first).not.toBe(second);
  });

  it("un label vacío no es válido", () => {
    expect(normalizeVirtualPairLabel("   ")).toBeNull();
    expect(normalizeVirtualPairLabel("Clasificado Qualy")).toBe("Clasificado Qualy");
  });

  it("editar el label no cambia la plaza", () => {
    const before = virtual("pair-v", "Pareja por definir 2");
    const nextLabel = normalizeVirtualPairLabel("Clasificado Qualy");
    const after: VirtualDraftPair = { ...before, virtualLabel: nextLabel! };
    expect(after.kind).toBe("virtual");
    expect(after.id).toBe(before.id);
    expect(after.virtualLabel).toBe("Clasificado Qualy");
  });

  it("eliminar una virtual del draft la saca y conserva la real", () => {
    const pairs: DraftTournamentPair[] = [
      real("pair-r", "Juan", "Pedro"),
      virtual("pair-v", "Pareja por definir 1"),
    ];
    const next = pairs.filter((pair) => pair.id !== "pair-v");
    expect(next).toEqual([real("pair-r", "Juan", "Pedro")]);
  });

  it("real y virtual se listan juntas y el contador incluye la virtual", () => {
    const pairs: DraftTournamentPair[] = [
      real("pair-r", "Juan", "Pedro"),
      virtual("pair-v", "Pareja por definir 1"),
    ];
    expect(pairs.map(draftPairDisplay)).toEqual([
      "Juan / Pedro",
      "Pareja por definir 1",
    ]);
    expect(pairs.length).toBe(2);
    expect(draftPairDisplay(pairs[0])).toBe("Juan / Pedro");
  });

  it("dos reales y dos virtuales generan el round robin de cuatro plazas y se pueden programar", () => {
    const ids = ["p1", "p2", "v1", "v2"];
    const realOnly = ["a", "b", "c", "d"];
    const mixed = generateBalancedRoundRobin(ids);
    const onlyReal = generateBalancedRoundRobin(realOnly);
    expect(mixed).toHaveLength(expectedMatchCount(4));
    expect(onlyReal).toHaveLength(mixed.length);

    const grupos = [
      {
        nombre: "Grupo A",
        orden: 0,
        parejaIds: ids,
      },
    ];
    const matches = buildDraftScheduleMatches(grupos);
    expect(matches).toHaveLength(expectedMatchCount(4));
    expect(matches.every((match) => match.ronda > 0 && match.orden > 0)).toBe(true);

    const scheduled = assignRoundRobinSchedule({
      matches,
      courts: ["Cancha 1"],
      date: "2026-08-25",
      startTime: "19:00",
      durationMinutes: 20,
    });
    expect(scheduled).toHaveLength(matches.length);
    expect(
      scheduled.every((match) => Boolean(match.cancha) && Boolean(match.programado_en))
    ).toBe(true);
    validateScheduleInvariants(matches, scheduled);
  });
});
