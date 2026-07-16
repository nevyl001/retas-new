import {
  deriveRetaEditPhase,
  fieldEditability,
  matchesEligibleForCourtUnassign,
  planCourtsChange,
  preferDbChampionshipOverLocal,
  matchHasResult,
  matchIsInProgress,
} from "./retaConfigEditRules";
import {
  clampRetaCourts,
  validateRetaConfigForm,
  hasRetaConfigValidationErrors,
} from "./retaConfigValidation";

describe("reta config phase-2 — courts / remontada / validation", () => {
  it("1-2. name/desc edits do not imply fixture touch (phase allows editorial)", () => {
    const phase = deriveRetaEditPhase({
      is_started: true,
      is_finished: false,
      pairsCount: 4,
      matchesCount: 6,
    });
    expect(fieldEditability("name", phase).editable).toBe(true);
    expect(fieldEditability("description", phase).editable).toBe(true);
    expect(fieldEditability("championship", phase).editable).toBe(false);
  });

  it("3. aumentar canchas es increase (sin afectados)", () => {
    const plan = planCourtsChange({
      currentCourts: 2,
      nextCourts: 4,
      matches: [{ court: 1, status: "pending" }],
    });
    expect(plan.kind).toBe("increase");
  });

  it("4. reducir deja solo futuros elegibles sin cancha (unassign, no reassign)", () => {
    const matches = [
      { court: 3, status: "pending" },
      { court: 4, status: "pending" },
      { court: 1, status: "pending" },
    ];
    const plan = planCourtsChange({
      currentCourts: 4,
      nextCourts: 2,
      matches,
    });
    expect(plan.kind).toBe("decrease");
    if (plan.kind === "decrease") {
      expect(plan.affectedPendingCount).toBe(2);
      expect(plan.confirmationMessage).toMatch(/sin cancha asignada/);
      expect(plan.confirmationMessage).not.toMatch(/reasign/i);
      expect(plan.confirmationMessage).toMatch(
        /iniciados, terminados y sus resultados no se modificarán/
      );
    }
    expect(matchesEligibleForCourtUnassign(matches, 2)).toHaveLength(2);
  });

  it("5-6. reducir conserva terminados e iniciados y con resultado", () => {
    const matches = [
      { court: 4, status: "completed", pair1_score: 6, pair2_score: 3 },
      { court: 3, status: "in_progress" },
      { court: 3, status: "pending", pair1_score: 6, pair2_score: 4 },
      { court: 4, status: "pending" },
    ];
    expect(matchHasResult(matches[0])).toBe(true);
    expect(matchIsInProgress(matches[1])).toBe(true);
    expect(matchesEligibleForCourtUnassign(matches, 2)).toHaveLength(1);
    expect(matchesEligibleForCourtUnassign(matches, 2)[0].status).toBe(
      "pending"
    );
  });

  it("9. reta finalizada bloquea campos estructurales", () => {
    const phase = deriveRetaEditPhase({
      is_started: true,
      is_finished: true,
      pairsCount: 4,
      matchesCount: 10,
    });
    expect(fieldEditability("courts", phase).editable).toBe(false);
    expect(fieldEditability("championship", phase).editable).toBe(false);
    expect(fieldEditability("name", phase).editable).toBe(true);
  });

  it("13. DB false / LS true → BD", () => {
    const r = preferDbChampionshipOverLocal({
      db: { championshipEnabled: false, championshipRounds: 2 },
      local: { championshipEnabled: true, championshipRounds: 5 },
    });
    expect(r.championshipEnabled).toBe(false);
    expect(r.championshipRounds).toBe(2);
  });

  it("13b. DB true / LS false → BD", () => {
    const r = preferDbChampionshipOverLocal({
      db: { championshipEnabled: true, championshipRounds: 3 },
      local: { championshipEnabled: false, championshipRounds: 2 },
    });
    expect(r.championshipEnabled).toBe(true);
    expect(r.championshipRounds).toBe(3);
  });

  it("13c. sin DB no activa por LS", () => {
    const r = preferDbChampionshipOverLocal({
      db: null,
      local: { championshipEnabled: true, championshipRounds: 4 },
    });
    expect(r.championshipEnabled).toBe(false);
  });

  it("15. in_play no permite Remontada", () => {
    const phase = deriveRetaEditPhase({
      is_started: true,
      is_finished: false,
      pairsCount: 4,
      matchesCount: 1,
    });
    expect(fieldEditability("championship", phase).editable).toBe(false);
  });

  it("16. create y edit usan validación compartida", () => {
    const create = validateRetaConfigForm({
      name: "",
      courts: 2,
      duration_minutes: 90,
      championshipEnabled: false,
      championshipRounds: 2,
      mode: "create",
    });
    const edit = validateRetaConfigForm({
      name: "",
      courts: 2,
      duration_minutes: 90,
      championshipEnabled: false,
      championshipRounds: 2,
      mode: "edit",
    });
    expect(hasRetaConfigValidationErrors(create)).toBe(false);
    expect(edit.name).toBeTruthy();
    expect(clampRetaCourts(99)).toBe(20);
    expect(clampRetaCourts(0)).toBe(1);
  });
});
