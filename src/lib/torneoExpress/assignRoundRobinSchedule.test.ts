import {
  assignRoundRobinSchedule,
  buildSchedulePreviewSummary,
  validateCourtNames,
} from "./assignRoundRobinSchedule";
import {
  buildDraftScheduleMatchKey,
  buildDraftScheduleMatches,
  type DraftScheduleMatch,
} from "./draftScheduleMatch";
import { validateScheduleInvariants } from "./scheduleInvariants";
import {
  addMinutesToMexicoCalendar,
  partidoTimeInputValue24,
  programadoIsoFromMexicoCalendar,
} from "./teScheduleTime";
import { partidoDateInputValue, partidoTimeInputValue } from "./partidoSchedule";
import type { GrupoAssignmentDraft } from "./types";

function mkMatch(
  overrides: Partial<DraftScheduleMatch> & Pick<DraftScheduleMatch, "matchKey">
): DraftScheduleMatch {
  return {
    groupKey: 0,
    grupoNombre: "Grupo A",
    parejaLocalId: "p1",
    parejaVisitanteId: "p2",
    ronda: 1,
    orden: 1,
    ...overrides,
  };
}

function scheduleInput(
  matches: DraftScheduleMatch[],
  overrides: Partial<{
    courts: string[];
    date: string;
    startTime: string;
    endTime: string;
    endDate: string;
    durationMinutes: number;
  }> = {}
) {
  return {
    matches,
    courts: overrides.courts ?? ["Central"],
    date: overrides.date ?? "2026-08-25",
    startTime: overrides.startTime ?? "19:00",
    endTime: overrides.endTime,
    endDate: overrides.endDate,
    durationMinutes: overrides.durationMinutes ?? 20,
  };
}

describe("assignRoundRobinSchedule", () => {
  test("one court, 6 matches sequential slots", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      mkMatch({
        matchKey: `m${i}`,
        parejaLocalId: `p${i * 2}`,
        parejaVisitanteId: `p${i * 2 + 1}`,
        orden: i + 1,
        ronda: 1,
      })
    );

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["Central"] })
    );

    expect(scheduled).toHaveLength(6);
    const times = scheduled.map((m) =>
      partidoTimeInputValue24(m.programado_en!)
    );
    expect(times).toEqual([
      "19:00",
      "19:20",
      "19:40",
      "20:00",
      "20:20",
      "20:40",
    ]);
    validateScheduleInvariants(matches, scheduled);
  });

  test("two courts, 6 compatible matches uses 3 slots", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      mkMatch({
        matchKey: `m${i}`,
        parejaLocalId: `p${i * 2}`,
        parejaVisitanteId: `p${i * 2 + 1}`,
        orden: i + 1,
        ronda: 1,
      })
    );

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["C1", "C2"] })
    );
    const summary = buildSchedulePreviewSummary(scheduled, {
      courts: ["C1", "C2"],
      date: "2026-08-25",
      startTime: "19:00",
      durationMinutes: 20,
    });

    expect(summary.blockCount).toBe(3);
    validateScheduleInvariants(matches, scheduled);
  });

  test("three courts max 3 simultaneous", () => {
    const matches = Array.from({ length: 9 }, (_, i) =>
      mkMatch({
        matchKey: `m${i}`,
        parejaLocalId: `p${i * 2}`,
        parejaVisitanteId: `p${i * 2 + 1}`,
        orden: i + 1,
        ronda: 1,
      })
    );

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, {
        courts: ["Central", "Cristal", "Norte"],
      })
    );

    const bySlot = new Map<string, number>();
    for (const m of scheduled) {
      const key = `${m.programado_en}`;
      bySlot.set(key, (bySlot.get(key) ?? 0) + 1);
    }
    for (const count of Array.from(bySlot.values())) {
      expect(count).toBeLessThanOrEqual(3);
    }
    validateScheduleInvariants(matches, scheduled);
  });

  test("time rollover 19:50 plus 20 minutes", () => {
    const matches = [
      mkMatch({ matchKey: "a", parejaLocalId: "p1", parejaVisitanteId: "p2" }),
      mkMatch({
        matchKey: "b",
        parejaLocalId: "p3",
        parejaVisitanteId: "p4",
        orden: 2,
      }),
      mkMatch({
        matchKey: "c",
        parejaLocalId: "p5",
        parejaVisitanteId: "p6",
        orden: 3,
      }),
    ];

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { startTime: "19:50", durationMinutes: 20 })
    );

    const times = scheduled.map((m) =>
      partidoTimeInputValue24(m.programado_en!)
    );
    expect(times).toEqual(["19:50", "20:10", "20:30"]);
  });

  test("midnight crossing advances calendar date", () => {
    const next = addMinutesToMexicoCalendar("2026-08-25", "23:50", 20);
    expect(next).toEqual({ date: "2026-08-26", time: "00:10" });

    const matches = [
      mkMatch({ matchKey: "a", parejaLocalId: "p1", parejaVisitanteId: "p2" }),
      mkMatch({
        matchKey: "b",
        parejaLocalId: "p3",
        parejaVisitanteId: "p4",
        orden: 2,
      }),
    ];

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { startTime: "23:50", durationMinutes: 20 })
    );

    expect(partidoTimeInputValue24(scheduled[0].programado_en!)).toBe("23:50");
    expect(partidoTimeInputValue24(scheduled[1].programado_en!)).toBe("00:10");
    expect(scheduled[1].programado_en!.slice(0, 10)).not.toBe("2026-08-25");
  });

  test("con hora de cierre desborda al día siguiente en la misma ventana", () => {
    // Ventana 09:00–10:00, duración 30 → 2 slots/día con 1 cancha.
    // Cada grupo cabe en un día y no se parte al siguiente.
    const matches = [
      ...Array.from({ length: 2 }, (_, i) =>
        mkMatch({
          matchKey: `a${i}`,
          groupKey: 0,
          parejaLocalId: `a${i}`,
          parejaVisitanteId: `b${i}`,
          orden: i + 1,
        })
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        mkMatch({
          matchKey: `c${i}`,
          groupKey: 1,
          parejaLocalId: `c${i}`,
          parejaVisitanteId: `d${i}`,
          orden: i + 1,
        })
      ),
      mkMatch({
        matchKey: "e0",
        groupKey: 2,
        parejaLocalId: "e0",
        parejaVisitanteId: "f0",
        orden: 1,
      }),
    ];

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, {
        date: "2026-10-03",
        startTime: "09:00",
        endTime: "10:00",
        endDate: "2026-10-10",
        durationMinutes: 30,
        courts: ["C1"],
      })
    );

    const summary = buildSchedulePreviewSummary(scheduled, {
      courts: ["C1"],
      date: "2026-10-03",
      startTime: "09:00",
      durationMinutes: 30,
    });

    expect(summary.dayCount).toBe(3);
    const byGroup = (key: number) =>
      scheduled
        .filter((match) => match.groupKey === key)
        .sort((a, b) =>
          (a.programado_en ?? "").localeCompare(b.programado_en ?? "")
        );
    const g0 = byGroup(0);
    const g1 = byGroup(1);
    const g2 = byGroup(2);
    expect(partidoDateInputValue(g0[0].programado_en!)).toBe("2026-10-03");
    expect(partidoTimeInputValue24(g0[0].programado_en!)).toBe("09:00");
    expect(partidoTimeInputValue24(g0[1].programado_en!)).toBe("09:30");
    expect(partidoDateInputValue(g1[0].programado_en!)).toBe("2026-10-04");
    expect(partidoTimeInputValue24(g1[0].programado_en!)).toBe("09:00");
    expect(partidoDateInputValue(g2[0].programado_en!)).toBe("2026-10-05");
    expect(summary.dayCount).toBe(3);
    validateScheduleInvariants(matches, scheduled);
  });

  test("cada día puede tener horario distinto", () => {
    const matches = [
      ...Array.from({ length: 2 }, (_, i) =>
        mkMatch({
          matchKey: `a${i}`,
          groupKey: 0,
          parejaLocalId: `a${i}`,
          parejaVisitanteId: `b${i}`,
          orden: i + 1,
        })
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        mkMatch({
          matchKey: `c${i}`,
          groupKey: 1,
          parejaLocalId: `c${i}`,
          parejaVisitanteId: `d${i}`,
          orden: i + 1,
        })
      ),
    ];

    const days = [
      { date: "2026-10-03", startTime: "09:00", endTime: "10:00" },
      { date: "2026-10-04", startTime: "16:00", endTime: "17:00" },
    ];

    const scheduled = assignRoundRobinSchedule({
      matches,
      courts: ["C1"],
      days,
      durationMinutes: 30,
    });

    const g0 = scheduled
      .filter((match) => match.groupKey === 0)
      .sort((a, b) =>
        (a.programado_en ?? "").localeCompare(b.programado_en ?? "")
      );
    const g1 = scheduled
      .filter((match) => match.groupKey === 1)
      .sort((a, b) =>
        (a.programado_en ?? "").localeCompare(b.programado_en ?? "")
      );
    expect(partidoDateInputValue(g0[0].programado_en!)).toBe("2026-10-03");
    expect(partidoTimeInputValue24(g0[0].programado_en!)).toBe("09:00");
    expect(partidoTimeInputValue24(g0[1].programado_en!)).toBe("09:30");
    expect(partidoDateInputValue(g1[0].programado_en!)).toBe("2026-10-04");
    expect(partidoTimeInputValue24(g1[0].programado_en!)).toBe("16:00");
    expect(partidoTimeInputValue24(g1[1].programado_en!)).toBe("16:30");
    validateScheduleInvariants(matches, scheduled);
  });

  test("un grupo juega seguido el día en que empieza", () => {
    const matches = [
      ...Array.from({ length: 3 }, (_, i) =>
        mkMatch({
          matchKey: `a${i}`,
          groupKey: 0,
          parejaLocalId: `a${i}`,
          parejaVisitanteId: `a${i + 1}`,
          orden: i + 1,
          ronda: i + 1,
        })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        mkMatch({
          matchKey: `b${i}`,
          groupKey: 1,
          parejaLocalId: `b${i}`,
          parejaVisitanteId: `b${i + 1}`,
          orden: i + 1,
          ronda: i + 1,
        })
      ),
    ];

    const scheduled = assignRoundRobinSchedule({
      matches,
      courts: ["Cancha 3"],
      days: [
        { date: "2026-10-06", startTime: "17:00", endTime: "20:00" },
        { date: "2026-10-07", startTime: "17:00", endTime: "20:00" },
      ],
      durationMinutes: 60,
    });

    const datesOf = (groupKey: number) =>
      Array.from(
        new Set(
          scheduled
            .filter((match) => match.groupKey === groupKey)
            .map((match) => partidoDateInputValue(match.programado_en!))
        )
      );
    const timesOf = (groupKey: number) =>
      scheduled
        .filter((match) => match.groupKey === groupKey)
        .map((match) => partidoTimeInputValue24(match.programado_en!))
        .sort();

    expect(datesOf(0)).toEqual(["2026-10-06"]);
    expect(timesOf(0)).toEqual(["17:00", "18:00", "19:00"]);
    expect(datesOf(1)).toEqual(["2026-10-07"]);
    expect(timesOf(1)).toEqual(["17:00", "18:00", "19:00"]);
    validateScheduleInvariants(matches, scheduled);
  });

  test("rechaza ventana donde no cabe ni un partido", () => {
    const matches = [
      mkMatch({ matchKey: "a", parejaLocalId: "p1", parejaVisitanteId: "p2" }),
    ];
    expect(() =>
      assignRoundRobinSchedule(
        scheduleInput(matches, {
          startTime: "09:00",
          endTime: "09:20",
          durationMinutes: 30,
        })
      )
    ).toThrow(/no cabe entre/i);
  });

  test("si no alcanza el día de fin, error claro", () => {
    const matches = Array.from({ length: 6 }, (_, i) =>
      mkMatch({
        matchKey: `m${i}`,
        parejaLocalId: `a${i}`,
        parejaVisitanteId: `b${i}`,
        orden: i + 1,
      })
    );
    expect(() =>
      assignRoundRobinSchedule(
        scheduleInput(matches, {
          date: "2026-10-03",
          startTime: "09:00",
          endTime: "10:00",
          endDate: "2026-10-03",
          durationMinutes: 30,
          courts: ["C1"],
        })
      )
    ).toThrow(/días configurados/i);
  });

  test("participant collision prevention", () => {
    const matches = [
      mkMatch({
        matchKey: "a",
        parejaLocalId: "shared",
        parejaVisitanteId: "p2",
      }),
      mkMatch({
        matchKey: "b",
        parejaLocalId: "shared",
        parejaVisitanteId: "p4",
        orden: 2,
      }),
      mkMatch({
        matchKey: "c",
        parejaLocalId: "p5",
        parejaVisitanteId: "p6",
        orden: 3,
      }),
    ];

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["C1", "C2"] })
    );

    const slotA = scheduled.find((m) => m.matchKey === "a")!.programado_en!;
    const slotB = scheduled.find((m) => m.matchKey === "b")!.programado_en!;
    expect(slotA).not.toBe(slotB);
    validateScheduleInvariants(matches, scheduled);
  });

  test("no court collision", () => {
    const matches = Array.from({ length: 4 }, (_, i) =>
      mkMatch({
        matchKey: `m${i}`,
        parejaLocalId: `p${i * 2}`,
        parejaVisitanteId: `p${i * 2 + 1}`,
        orden: i + 1,
      })
    );

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["Central", "Cristal"] })
    );

    const keys = new Set(
      scheduled.map((m) => `${m.programado_en}|${m.cancha}`)
    );
    expect(keys.size).toBe(scheduled.length);
  });

  test("multiple groups share slot pool (parallel on courts)", () => {
    const matches = [
      mkMatch({
        matchKey: "ga",
        groupKey: 0,
        grupoNombre: "Grupo A",
        parejaLocalId: "a1",
        parejaVisitanteId: "a2",
      }),
      mkMatch({
        matchKey: "gb",
        groupKey: 1,
        grupoNombre: "Grupo B",
        parejaLocalId: "b1",
        parejaVisitanteId: "b2",
        orden: 1,
      }),
    ];

    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["Central", "Cristal"] })
    );

    expect(
      partidoTimeInputValue24(scheduled[0]!.programado_en!)
    ).toBe(partidoTimeInputValue24(scheduled[1]!.programado_en!));
    validateScheduleInvariants(matches, scheduled);
  });

  test("preserve match count", () => {
    const grupos: GrupoAssignmentDraft[] = [
      { nombre: "Grupo A", orden: 0, parejaIds: ["p1", "p2", "p3", "p4"] },
    ];
    const draft = buildDraftScheduleMatches(grupos);
    const scheduled = assignRoundRobinSchedule(
      scheduleInput(draft, { courts: ["C1", "C2"], durationMinutes: 45 })
    );
    expect(scheduled.length).toBe(draft.length);
    validateScheduleInvariants(draft, scheduled);
  });

  test("preserve opponents", () => {
    const grupos: GrupoAssignmentDraft[] = [
      { nombre: "Grupo A", orden: 0, parejaIds: ["p1", "p2", "p3"] },
    ];
    const draft = buildDraftScheduleMatches(grupos);
    const scheduled = assignRoundRobinSchedule(
      scheduleInput(draft, { courts: ["Central"] })
    );

    for (const m of scheduled) {
      const orig = draft.find((d) => d.matchKey === m.matchKey)!;
      expect(m.parejaLocalId).toBe(orig.parejaLocalId);
      expect(m.parejaVisitanteId).toBe(orig.parejaVisitanteId);
    }
  });

  test("deterministic output", () => {
    const grupos: GrupoAssignmentDraft[] = [
      { nombre: "Grupo A", orden: 0, parejaIds: ["p1", "p2", "p3", "p4"] },
      { nombre: "Grupo B", orden: 1, parejaIds: ["p5", "p6", "p7", "p8"] },
    ];
    const draft = buildDraftScheduleMatches(grupos);
    const input = scheduleInput(draft, {
      courts: ["Central", "Cristal"],
      durationMinutes: 30,
    });
    const a = assignRoundRobinSchedule(input);
    const b = assignRoundRobinSchedule(input);
    expect(a).toEqual(b);
  });

  test("uses configured court names", () => {
    const matches = [
      mkMatch({ matchKey: "a", parejaLocalId: "p1", parejaVisitanteId: "p2" }),
    ];
    const scheduled = assignRoundRobinSchedule(
      scheduleInput(matches, { courts: ["Central", "Cristal"] })
    );
    expect(scheduled[0].cancha).toBe("Central");
  });

  test("duplicate court names rejected", () => {
    expect(validateCourtNames(["Central", " central "])).toMatch(/únicos/i);
  });

  test("multi-group rounds complete R1 before R2, groups in parallel", () => {
    const grupos: GrupoAssignmentDraft[] = [
      { nombre: "Grupo A", orden: 0, parejaIds: ["a1", "a2", "a3", "a4"] },
      { nombre: "Grupo B", orden: 1, parejaIds: ["b1", "b2", "b3", "b4"] },
    ];
    const draft = buildDraftScheduleMatches(grupos);
    const scheduled = assignRoundRobinSchedule(
      scheduleInput(draft, {
        courts: ["Central", "Cristal"],
        durationMinutes: 30,
        startTime: "09:00",
      })
    );

    const round1 = scheduled.filter((m) => m.ronda === 1);
    const round2 = scheduled.filter((m) => m.ronda === 2);

    const maxR1 = round1.reduce((max, m) => {
      const iso = m.programado_en!;
      return max > iso ? max : iso;
    }, "");
    const minR2 = round2.reduce((min, m) => {
      const iso = m.programado_en!;
      return !min || iso < min ? iso : min;
    }, "");

    expect(minR2 >= maxR1).toBe(true);

    const g1 = scheduled.filter((m) => m.groupKey === 0);
    const g2 = scheduled.filter((m) => m.groupKey === 1);
    const g1Times = Array.from(
      new Set(g1.map((m) => partidoTimeInputValue24(m.programado_en!)))
    ).sort();
    const g2Times = Array.from(
      new Set(g2.map((m) => partidoTimeInputValue24(m.programado_en!)))
    ).sort();
    expect(g1Times).toEqual(g2Times);
    validateScheduleInvariants(draft, scheduled);
  });

  test("one court interleaves groups instead of finishing one round first", () => {
    const grupos: GrupoAssignmentDraft[] = [
      { nombre: "Grupo A", orden: 0, parejaIds: ["a1", "a2", "a3", "a4"] },
      { nombre: "Grupo B", orden: 1, parejaIds: ["b1", "b2", "b3", "b4"] },
    ];
    const draft = buildDraftScheduleMatches(grupos);
    const scheduled = assignRoundRobinSchedule(
      scheduleInput(draft, {
        courts: ["3"],
        date: "2026-10-03",
        startTime: "16:20",
        durationMinutes: 30,
      })
    );

    const byTime = [...scheduled].sort((a, b) =>
      (a.programado_en ?? "").localeCompare(b.programado_en ?? "")
    );
    const groups = byTime.map((m) => m.groupKey);
    expect(groups.slice(0, 4)).toEqual([0, 1, 0, 1]);

    const groupB = byTime
      .filter((m) => m.groupKey === 1)
      .map((m) => partidoTimeInputValue24(m.programado_en!));
    expect(groupB[0]).toBe("16:50");
    expect(groupB).toEqual([
      "16:50",
      "17:50",
      "18:50",
      "19:50",
      "20:50",
      "21:50",
    ]);

    const groupA = byTime
      .filter((m) => m.groupKey === 0)
      .map((m) => partidoTimeInputValue24(m.programado_en!));
    expect(groupA[0]).toBe("16:20");
    validateScheduleInvariants(draft, scheduled);
  });
});

describe("teScheduleTime Mexico timezone", () => {
  test("2026-08-25 19:00 → display 19:00 in Mexico", () => {
    const iso = programadoIsoFromMexicoCalendar("2026-08-25", "19:00");
    expect(iso).toBeTruthy();
    expect(partidoTimeInputValue24(iso!)).toBe("19:00");
    expect(partidoTimeInputValue(iso!)).toBe("19:00");
  });

  test("midnight slot date advances", () => {
    const iso = programadoIsoFromMexicoCalendar("2026-08-25", "23:50");
    const next = addMinutesToMexicoCalendar("2026-08-25", "23:50", 20);
    expect(next?.date).toBe("2026-08-26");
    expect(next?.time).toBe("00:10");

    const isoNext = programadoIsoFromMexicoCalendar(next!.date, next!.time);
    expect(partidoTimeInputValue24(isoNext!)).toBe("00:10");
    expect(partidoDateInputValue(iso!)).toBe("2026-08-25");
    expect(partidoDateInputValue(isoNext!)).toBe("2026-08-26");
  });
});

describe("buildDraftScheduleMatchKey", () => {
  test("stable keys from group + pairs + round", () => {
    const key = buildDraftScheduleMatchKey({
      groupKey: 0,
      parejaLocalId: "x",
      parejaVisitanteId: "y",
      ronda: 1,
      orden: 2,
    });
    expect(key).toBe("0:x:y:1:2");
  });
});

describe("occupiedCourtSlots cross-category", () => {
  test("skips a court already taken at the first slot", () => {
    const occupiedIso = programadoIsoFromMexicoCalendar("2026-08-25", "19:00");
    expect(occupiedIso).toBeTruthy();

    const matches = [
      mkMatch({
        matchKey: "m0",
        parejaLocalId: "a",
        parejaVisitanteId: "b",
        orden: 1,
        ronda: 1,
      }),
      mkMatch({
        matchKey: "m1",
        parejaLocalId: "c",
        parejaVisitanteId: "d",
        orden: 2,
        ronda: 1,
      }),
    ];

    const scheduled = assignRoundRobinSchedule({
      matches,
      courts: ["Central", "Estadio"],
      date: "2026-08-25",
      startTime: "19:00",
      durationMinutes: 30,
      occupiedCourtSlots: [
        { programado_en: occupiedIso!, cancha: "Central" },
      ],
    });

    expect(scheduled).toHaveLength(2);
    const at1900 = scheduled.filter(
      (m) => partidoTimeInputValue24(m.programado_en!) === "19:00"
    );
    expect(at1900).toHaveLength(1);
    expect(at1900[0]!.cancha).toBe("Estadio");
  });
});
