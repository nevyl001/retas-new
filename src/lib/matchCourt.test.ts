import {
  compareMatchCourt,
  formatMatchCourtLabel,
  isAssignedCourt,
  maxAssignedCourt,
  UNASSIGNED_COURT_LABEL,
} from "./matchCourt";
import { findCourtRotationRepairs } from "./circleRoundRobinSchedule";
import { planCourtsChange } from "./reta/retaConfigEditRules";
import type { Match, Pair } from "./db/types";

describe("matchCourt nullable / Por asignar", () => {
  it("partido con court NULL se etiqueta Por asignar", () => {
    expect(formatMatchCourtLabel(null)).toBe(UNASSIGNED_COURT_LABEL);
    expect(formatMatchCourtLabel(undefined)).toBe(UNASSIGNED_COURT_LABEL);
    expect(formatMatchCourtLabel(0)).toBe(UNASSIGNED_COURT_LABEL);
    expect(formatMatchCourtLabel(2)).toBe("Cancha 2");
    expect(isAssignedCourt(null)).toBe(false);
    expect(isAssignedCourt(1)).toBe(true);
  });

  it("no rompe ordenamientos: NULL al final, no como 1", () => {
    const courts = [null, 2, 1, null, 3];
    const sorted = [...courts].sort(compareMatchCourt);
    expect(sorted).toEqual([1, 2, 3, null, null]);
  });

  it("maxAssignedCourt ignora NULL", () => {
    expect(maxAssignedCourt([null, 1, 4, null])).toBe(4);
    expect(maxAssignedCourt([null, null])).toBe(0);
  });

  it("scheduler repair no reasigna partidos con court NULL", () => {
    const pairs: Pair[] = [
      {
        id: "1",
        tournament_id: "t",
        player1_id: "a",
        player2_id: "b",
        player1_name: "A",
        player2_name: "B",
        created_at: "",
      },
      {
        id: "2",
        tournament_id: "t",
        player1_id: "c",
        player2_id: "d",
        player1_name: "C",
        player2_name: "D",
        created_at: "",
      },
      {
        id: "3",
        tournament_id: "t",
        player1_id: "e",
        player2_id: "f",
        player1_name: "E",
        player2_name: "F",
        created_at: "",
      },
      {
        id: "4",
        tournament_id: "t",
        player1_id: "g",
        player2_id: "h",
        player1_name: "G",
        player2_name: "H",
        created_at: "",
      },
    ];
    const unassigned: Match = {
      id: "u1",
      tournament_id: "t",
      pair1_id: "1",
      pair2_id: "2",
      pair1_name: "A/B",
      pair2_name: "C/D",
      court: null,
      round: 1,
      status: "pending",
      created_at: "",
    };
    const assignedWrong: Match = {
      id: "a1",
      tournament_id: "t",
      pair1_id: "3",
      pair2_id: "4",
      pair1_name: "E/F",
      pair2_name: "G/H",
      court: 1,
      round: 1,
      status: "pending",
      created_at: "",
    };
    const repairs = findCourtRotationRepairs(pairs, 2, [
      unassigned,
      assignedWrong,
    ]);
    expect(repairs.every((r) => r.id !== "u1")).toBe(true);
  });

  it("puede asignarse posteriormente una cancha válida (tipo Partial)", () => {
    const before: Match = {
      id: "m1",
      tournament_id: "t",
      pair1_id: "1",
      pair2_id: "2",
      pair1_name: "A",
      pair2_name: "B",
      court: null,
      status: "pending",
      created_at: "",
    };
    const after: Match = { ...before, court: 2 };
    expect(formatMatchCourtLabel(before.court)).toBe(UNASSIGNED_COURT_LABEL);
    expect(formatMatchCourtLabel(after.court)).toBe("Cancha 2");
    expect(isAssignedCourt(after.court)).toBe(true);
  });

  it("reducción de canchas planifica unassign (NULL), no reassign", () => {
    const plan = planCourtsChange({
      currentCourts: 4,
      nextCourts: 2,
      matches: [
        { court: 3, status: "pending" },
        { court: 4, status: "pending" },
        { court: 4, status: "completed", pair1_score: 6, pair2_score: 3 },
      ],
    });
    expect(plan.kind).toBe("decrease");
    if (plan.kind === "decrease") {
      expect(plan.affectedPendingCount).toBe(2);
      expect(plan.confirmationMessage).toMatch(/sin cancha/);
    }
  });
});
