import {
  appendMatchesAfterExistingSchedule,
  buildAppendedPairDraftMatches,
  missingMatchupsForNewPair,
} from "./appendParejaGrupo";
import { generateBalancedRoundRobin, unorderedMatchupKey } from "./roundRobin";
import { programadoIsoFromMexicoCalendar, mexicoScheduleSlotKey } from "./teScheduleTime";

describe("missingMatchupsForNewPair", () => {
  const existing = generateBalancedRoundRobin(["A", "B", "C", "D"]);

  it("crea solo los cruces de la pareja nueva", () => {
    const missing = missingMatchupsForNewPair(
      ["A", "B", "C", "D"],
      existing,
      "E"
    );
    expect(missing.map((m) => unorderedMatchupKey(m.localId, m.visitanteId)).sort()).toEqual(
      ["A|E", "B|E", "C|E", "D|E"].sort()
    );
  });

  it("trata A-B y B-A como el mismo cruce y no lo vuelve a crear", () => {
    const reversed = existing.map((match) => ({
      localId: match.visitanteId,
      visitanteId: match.localId,
    }));
    const missing = missingMatchupsForNewPair(
      ["A", "B", "C", "D"],
      reversed,
      "E"
    );
    const keys = missing.map((m) => unorderedMatchupKey(m.localId, m.visitanteId));
    expect(keys).not.toContain("A|B");
    expect(keys).toHaveLength(4);
  });
});

describe("buildAppendedPairDraftMatches", () => {
  it("continúa ronda y orden después de lo existente", () => {
    const drafts = buildAppendedPairDraftMatches({
      groupKey: 1,
      grupoNombre: "Grupo 1",
      existingPairIds: ["A", "B"],
      existingMatchups: [{ localId: "A", visitanteId: "B", ronda: 2, orden: 6 }],
      newPairId: "E",
    });
    expect(drafts).toHaveLength(2);
    expect(drafts.every((match) => match.ronda === 3)).toBe(true);
    expect(drafts.map((match) => match.orden)).toEqual([7, 8]);
    expect(drafts.every((match) => match.parejaLocalId === "E")).toBe(true);
  });
});

describe("appendMatchesAfterExistingSchedule", () => {
  const courts = ["Cancha 1", "Cancha 2"];
  const early = programadoIsoFromMexicoCalendar("2026-09-30", "09:00");
  const late = programadoIsoFromMexicoCalendar("2026-09-30", "09:45");

  it("deja libres las canchas del último bloque y empieza en el siguiente", () => {
    expect(early).toBeTruthy();
    expect(late).toBeTruthy();
    const drafts = buildAppendedPairDraftMatches({
      groupKey: 1,
      grupoNombre: "Grupo 1",
      existingPairIds: ["A", "B", "C", "D"],
      existingMatchups: [],
      newPairId: "E",
    });
    const result = appendMatchesAfterExistingSchedule({
      existing: [
        { programadoEn: early, cancha: "Cancha 1" },
        { programadoEn: late, cancha: "Cancha 1" },
      ],
      matches: drafts,
      courts,
      durationMinutes: 45,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.scheduled) {
      throw new Error("se esperaba programación");
    }
    expect(result.startTime).toBe("10:30");
    const lastKey = mexicoScheduleSlotKey(late!);
    for (const match of result.matches) {
      expect(
        mexicoScheduleSlotKey(match.programado_en!).localeCompare(lastKey)
      ).toBeGreaterThan(0);
    }
  });

  it("no ocupa el último bloque aunque quede una cancha libre", () => {
    const result = appendMatchesAfterExistingSchedule({
      existing: [{ programadoEn: late, cancha: "Cancha 1" }],
      matches: buildAppendedPairDraftMatches({
        groupKey: 1,
        grupoNombre: "Grupo 1",
        existingPairIds: ["A"],
        existingMatchups: [],
        newPairId: "E",
      }),
      courts,
      durationMinutes: 45,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.scheduled) {
      throw new Error("se esperaba programación");
    }
    expect(result.startTime).toBe("10:30");
    expect(result.matches[0]?.cancha).toBeTruthy();
    expect(mexicoScheduleSlotKey(result.matches[0]!.programado_en!)).not.toBe(
      mexicoScheduleSlotKey(late!)
    );
  });

  it("si falta horario o cancha no inventa calendario", () => {
    const drafts = buildAppendedPairDraftMatches({
      groupKey: 1,
      grupoNombre: "Grupo 1",
      existingPairIds: ["A"],
      existingMatchups: [],
      newPairId: "E",
    });
    const result = appendMatchesAfterExistingSchedule({
      existing: [{ programadoEn: early, cancha: null }],
      matches: drafts,
      courts,
      durationMinutes: 45,
    });
    expect(result).toMatchObject({ ok: true, scheduled: false });
    if (!result.ok || result.scheduled) return;
    expect(result.matches.every((match) => !match.programado_en && !match.cancha)).toBe(
      true
    );
  });
});
