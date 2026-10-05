import { readFileSync } from "fs";
import { resolve } from "path";
import { generateBalancedRoundRobin } from "./roundRobin";
import type { RosterSlot } from "./groupRoster";
import {
  buildCourtTimeOpenings,
  scheduleHasCourtConflict,
  scheduleHasLineageConflict,
  schedulePendingGroup,
  type ScheduleMatch,
  type SchedulePlan,
} from "./schedulePendingGroup";

const NOW = "2026-08-01T14:00:00Z";

function openings(courts: string[], end = "12:00", duration = 20) {
  return buildCourtTimeOpenings({
    days: [{ date: "2026-08-01", startTime: "10:00", endTime: end }],
    courts,
    durationMinutes: duration,
    nowIso: NOW,
  });
}

function match(partial: Partial<ScheduleMatch> & Pick<ScheduleMatch, "id" | "localId" | "visitanteId">): ScheduleMatch {
  return {
    played: false,
    cancha: null,
    programadoEn: null,
    ronda: 1,
    orden: 1,
    ...partial,
  };
}

function requireOk(plan: SchedulePlan): Extract<SchedulePlan, { ok: true }> {
  if (!plan.ok) throw new Error(plan.error);
  return plan;
}

function slotsOf(ids: string[], previa: Record<string, string[]> = {}): RosterSlot[] {
  return ids.map((id) => ({
    parejaId: id,
    activa: true,
    parejaPreviaIds: previa[id] ?? [],
  }));
}

describe("schedulePendingGroup", () => {
  it("repite el mismo calendario y no usa azar", () => {
    const source = readFileSync(resolve(__dirname, "schedulePendingGroup.ts"), "utf8");
    expect(source.includes("Math.random")).toBe(false);
    const input = {
      matches: [
        match({ id: "ab", localId: "a", visitanteId: "b" }),
        match({ id: "ac", localId: "a", visitanteId: "c" }),
        match({ id: "bc", localId: "b", visitanteId: "c" }),
      ],
      slots: slotsOf(["a", "b", "c"]),
      openings: openings(["1", "2"]),
      nowIso: NOW,
      mode: "faltantes" as const,
    };
    expect(schedulePendingGroup(input)).toEqual(schedulePendingGroup(input));
  });

  it("separa los partidos de una pareja cuando hay hueco", () => {
    const plan = schedulePendingGroup({
      matches: [
        match({ id: "ab", localId: "a", visitanteId: "b" }),
        match({ id: "ac", localId: "a", visitanteId: "c" }),
        match({ id: "ad", localId: "a", visitanteId: "d" }),
      ],
      slots: slotsOf(["a", "b", "c", "d"]),
      openings: openings(["1"]),
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.metrics.consecutives).toBe(0);
    expect(scheduled.assignments).toHaveLength(3);
    expect(scheduleHasCourtConflict(scheduled.assignments)).toBe(false);
  });

  it("conserva pendientes ya programados y solo coloca los nuevos", () => {
    const fixedIso = openings(["1"])[0]!.programadoEn;
    const plan = schedulePendingGroup({
      matches: [
        match({
          id: "ab",
          localId: "a",
          visitanteId: "b",
          cancha: "1",
          programadoEn: fixedIso,
          orden: 4,
        }),
        match({ id: "ac", localId: "a", visitanteId: "c", orden: 5 }),
      ],
      slots: slotsOf(["a", "b", "c"]),
      openings: openings(["1"]),
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments.map((row) => row.matchId)).toEqual(["ac"]);
    expect(scheduled.assignments[0]?.programadoEn).not.toBe(fixedIso);
  });

  it("reorganizar puede mover un pendiente y no un jugado", () => {
    const grid = openings(["1"]);
    const played = match({
      id: "played",
      localId: "a",
      visitanteId: "b",
      played: true,
      cancha: "1",
      programadoEn: grid[0]!.programadoEn,
      ronda: 2,
      orden: 1,
    });
    const pending = match({
      id: "ac",
      localId: "a",
      visitanteId: "c",
      cancha: "1",
      programadoEn: grid[1]!.programadoEn,
      orden: 2,
    });
    const before = { ...played };
    const plan = schedulePendingGroup({
      matches: [played, pending, match({ id: "ad", localId: "a", visitanteId: "d" })],
      slots: slotsOf(["a", "b", "c", "d"]),
      openings: grid,
      nowIso: NOW,
      mode: "reorganizar",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments.some((row) => row.matchId === "played")).toBe(false);
    expect(played).toEqual(before);
    expect(scheduled.metrics.consecutives).toBe(0);
  });

  it("no programa en el pasado y avisa si no hay slots", () => {
    const plan = schedulePendingGroup({
      matches: [
        match({ id: "ab", localId: "a", visitanteId: "b" }),
        match({ id: "ac", localId: "a", visitanteId: "c" }),
      ],
      slots: slotsOf(["a", "b", "c"]),
      openings: openings(["1"], "10:20"),
      nowIso: NOW,
      mode: "faltantes",
    });
    expect(plan).toMatchObject({ ok: false, error: "INSUFFICIENT_SLOTS" });
    expect(plan.ok ? [] : plan.unscheduled.length).toBeGreaterThan(0);
  });

  it("el mismo linaje no juega a la vez aunque cambie el pair id", () => {
    const grid = openings(["1", "2"], "10:40");
    const plan = schedulePendingGroup({
      matches: [
        match({ id: "old", localId: "a", visitanteId: "b" }),
        match({ id: "new", localId: "a2", visitanteId: "c" }),
      ],
      slots: slotsOf(["a2", "b", "c"], { a2: ["a"] }),
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    const rows = scheduled.assignments.map((row) => ({
      id: row.matchId,
      localId: row.matchId === "old" ? "a" : "a2",
      visitanteId: row.matchId === "old" ? "b" : "c",
      programadoEn: row.programadoEn,
    }));
    expect(scheduleHasLineageConflict(rows, slotsOf(["a2", "b", "c"], { a2: ["a"] }))).toBe(false);
    expect(new Set(scheduled.assignments.map((row) => row.programadoEn)).size).toBe(2);
  });

  it("una retirada no recibe partidos y no hay bye", () => {
    const plan = schedulePendingGroup({
      matches: [match({ id: "ab", localId: "a", visitanteId: "b" })],
      slots: [
        { parejaId: "a", activa: true, parejaPreviaIds: [] },
        { parejaId: "b", activa: true, parejaPreviaIds: [] },
        { parejaId: "e", activa: false, parejaPreviaIds: [] },
      ],
      openings: openings(["1"]),
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments).toHaveLength(1);
    expect(JSON.stringify(scheduled)).not.toContain("bye");
    expect(JSON.stringify(scheduled)).not.toContain("\"e\"");
  });

  it.each([1, 2, 3, 4])("con %i canchas no duplica cancha ni pareja", (courtCount) => {
    const courts = Array.from({ length: courtCount }, (_, index) => String(index + 1));
    const ids = ["a", "b", "c", "d", "e", "f"];
    const generated = generateBalancedRoundRobin(ids);
    const plan = schedulePendingGroup({
      matches: generated.map((row) => match({
        id: `${row.localId}-${row.visitanteId}`,
        localId: row.localId,
        visitanteId: row.visitanteId,
        ronda: row.ronda,
        orden: row.orden,
      })),
      slots: slotsOf(ids),
      openings: openings(courts, "18:00", 30),
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments).toHaveLength(generated.length);
    expect(scheduleHasCourtConflict(scheduled.assignments)).toBe(false);
    expect(scheduleHasLineageConflict(
      scheduled.assignments.map((row) => {
        const source = generated.find((item) => `${item.localId}-${item.visitanteId}` === row.matchId)!;
        return {
          id: row.matchId,
          localId: source.localId,
          visitanteId: source.visitanteId,
          programadoEn: row.programadoEn,
        };
      }),
      slotsOf(ids)
    )).toBe(false);
    const byTime = new Map<string, number>();
    for (const row of scheduled.assignments) {
      byTime.set(row.programadoEn, (byTime.get(row.programadoEn) ?? 0) + 1);
    }
    for (const count of Array.from(byTime.values())) expect(count).toBeLessThanOrEqual(courtCount);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])("programa el round robin de %i parejas sin bye", (pairCount) => {
    const ids = Array.from({ length: pairCount }, (_, index) => `p${index}`);
    const generated = generateBalancedRoundRobin(ids);
    const plan = schedulePendingGroup({
      matches: generated.map((row) => match({
        id: `${row.localId}-${row.visitanteId}`,
        localId: row.localId,
        visitanteId: row.visitanteId,
      })),
      slots: slotsOf(ids),
      openings: openings(["1", "2", "3", "4"], "21:00", 30),
      nowIso: NOW,
      mode: "faltantes",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments).toHaveLength(generated.length);
    expect(scheduled.assignments.some((row) => row.matchId.includes("bye"))).toBe(false);
  });

  it("si ya están separados, reorganizar no les cambia la hora", () => {
    const grid = openings(["1"]);
    const plan = schedulePendingGroup({
      matches: [
        match({ id: "ab", localId: "a", visitanteId: "b", cancha: "1", programadoEn: grid[0]!.programadoEn, orden: 1 }),
        match({ id: "ac", localId: "a", visitanteId: "c", cancha: "1", programadoEn: grid[2]!.programadoEn, orden: 2 }),
      ],
      slots: slotsOf(["a", "b", "c"]),
      openings: grid,
      nowIso: NOW,
      mode: "reorganizar",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.assignments.filter((row) => row.programadoEn !== grid[0]!.programadoEn && row.matchId === "ab")).toEqual([]);
    expect(scheduled.assignments.map((row) => row.matchId)).not.toContain("ab");
    expect(scheduled.assignments.map((row) => row.matchId)).not.toContain("ac");
  });

  it("programar los faltantes otra vez no mueve nada", () => {
    const grid = openings(["1", "2"]);
    const matches = [
      match({ id: "ab", localId: "a", visitanteId: "b" }),
      match({ id: "ac", localId: "a", visitanteId: "c" }),
      match({ id: "bc", localId: "b", visitanteId: "c" }),
    ];
    const first = requireOk(schedulePendingGroup({
      matches,
      slots: slotsOf(["a", "b", "c"]),
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    }));
    const placed = matches.map((row) => {
      const assigned = first.assignments.find((item) => item.matchId === row.id);
      if (!assigned) return row;
      return { ...row, cancha: assigned.cancha, programadoEn: assigned.programadoEn, orden: assigned.orden };
    });
    const second = requireOk(schedulePendingGroup({
      matches: placed,
      slots: slotsOf(["a", "b", "c"]),
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    }));
    expect(second.assignments).toEqual([]);
  });

  it("al agregar una pareja solo coloca sus cruces nuevos", () => {
    const grid = openings(["1", "2"], "18:00", 30);
    const base = generateBalancedRoundRobin(["a", "b", "c", "d"]).map((row) => match({
      id: `${row.localId}-${row.visitanteId}`,
      localId: row.localId,
      visitanteId: row.visitanteId,
      ronda: row.ronda,
      orden: row.orden,
    }));
    const first = requireOk(schedulePendingGroup({
      matches: base,
      slots: slotsOf(["a", "b", "c", "d"]),
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    }));
    const placed = base.map((row) => {
      const assigned = first.assignments.find((item) => item.matchId === row.id);
      return assigned
        ? { ...row, cancha: assigned.cancha, programadoEn: assigned.programadoEn, orden: assigned.orden }
        : row;
    });
    placed[0] = { ...placed[0]!, played: true };
    const added = ["a", "b", "c", "d"].map((rival) => match({
      id: `e-${rival}`,
      localId: "e",
      visitanteId: rival,
      ronda: null,
      orden: null,
    }));
    const second = requireOk(schedulePendingGroup({
      matches: [...placed, ...added],
      slots: slotsOf(["a", "b", "c", "d", "e"]),
      openings: grid,
      nowIso: NOW,
      mode: "faltantes",
    }));
    expect(second.assignments.map((row) => row.matchId).sort()).toEqual(["e-a", "e-b", "e-c", "e-d"]);
    expect(scheduleHasCourtConflict([
      ...placed.filter((row) => row.programadoEn && row.cancha).map((row) => ({
        programadoEn: row.programadoEn as string,
        cancha: row.cancha as string,
      })),
      ...second.assignments,
    ])).toBe(false);
  });

  it("prefiere mover un pendiente antes que dejarlo consecutivo", () => {
    const grid = openings(["1"]);
    const plan = schedulePendingGroup({
      matches: [
        match({ id: "ab", localId: "a", visitanteId: "b", cancha: "1", programadoEn: grid[0]!.programadoEn, orden: 1 }),
        match({ id: "ac", localId: "a", visitanteId: "c", cancha: "1", programadoEn: grid[1]!.programadoEn, orden: 2 }),
      ],
      slots: slotsOf(["a", "b", "c"]),
      openings: grid,
      nowIso: NOW,
      mode: "reorganizar",
    });
    const scheduled = requireOk(plan);
    expect(scheduled.metrics.consecutives).toBe(0);
    const moved = scheduled.assignments.find((row) => row.matchId === "ac");
    expect(moved?.programadoEn).not.toBe(grid[1]!.programadoEn);
  });
});
