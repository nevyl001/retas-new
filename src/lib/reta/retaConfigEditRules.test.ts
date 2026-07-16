import {
  deriveRetaEditPhase,
  fieldEditability,
  planCourtsChange,
  pendingMatchesOnRemovedCourts,
  matchHasResult,
} from "./retaConfigEditRules";

describe("retaConfigEditRules", () => {
  it("todos pueden editar en draft (phase draft)", () => {
    const phase = deriveRetaEditPhase({
      is_started: false,
      is_finished: false,
      pairsCount: 0,
      matchesCount: 0,
    });
    expect(phase).toBe("draft");
    expect(fieldEditability("name", phase).editable).toBe(true);
    expect(fieldEditability("courts", phase).editable).toBe(true);
    expect(fieldEditability("championship", phase).editable).toBe(true);
  });

  it("reta cerrada bloquea canchas y remontada; permite nombre", () => {
    const phase = deriveRetaEditPhase({
      is_started: true,
      is_finished: true,
      pairsCount: 4,
      matchesCount: 10,
    });
    expect(phase).toBe("finished");
    expect(fieldEditability("name", phase).editable).toBe(true);
    expect(fieldEditability("courts", phase).editable).toBe(false);
    expect(fieldEditability("championship", phase).editable).toBe(false);
  });

  it("aumentar canchas no marca partidos afectados", () => {
    const plan = planCourtsChange({
      currentCourts: 2,
      nextCourts: 4,
      matches: [
        { court: 1, pair1_score: 6, pair2_score: 4 },
        { court: 2, status: "pending" },
      ],
    });
    expect(plan.kind).toBe("increase");
  });

  it("reducir canchas no incluye partidos con resultado", () => {
    const matches = [
      { court: 3, pair1_score: 6, pair2_score: 3 },
      { court: 3, status: "pending" },
      { court: 2, status: "pending" },
    ];
    const affected = pendingMatchesOnRemovedCourts(matches, 2);
    expect(affected).toHaveLength(1);
    expect(matchHasResult(matches[0])).toBe(true);
    const plan = planCourtsChange({
      currentCourts: 3,
      nextCourts: 2,
      matches,
    });
    expect(plan.kind).toBe("decrease");
    if (plan.kind === "decrease") {
      expect(plan.affectedPendingCount).toBe(1);
      expect(plan.confirmationMessage).toMatch(/1 partido/);
      expect(plan.confirmationMessage).not.toMatch(/Actualizar todo/i);
    }
  });

  it("in_play bloquea championship", () => {
    const phase = deriveRetaEditPhase({
      is_started: true,
      is_finished: false,
      pairsCount: 4,
      matchesCount: 6,
    });
    expect(phase).toBe("in_play");
    expect(fieldEditability("championship", phase).editable).toBe(false);
    expect(fieldEditability("courts", phase).editable).toBe(true);
  });
});
