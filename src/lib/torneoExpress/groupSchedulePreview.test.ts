import {
  changesFromAssignments,
  formatSlotLabel,
  groupScheduleApplyNotice,
  pendingWithoutSlot,
  type GroupScheduleChange,
} from "./groupSchedulePreview";
import type { ScheduleMatch } from "./schedulePendingGroup";

function match(partial: Partial<ScheduleMatch> & Pick<ScheduleMatch, "id">): ScheduleMatch {
  return {
    localId: "a",
    visitanteId: "b",
    played: false,
    cancha: null,
    programadoEn: null,
    ronda: 1,
    orden: 1,
    ...partial,
  };
}

describe("groupSchedulePreview", () => {
  it("cuenta solo pendientes sin cancha ni hora", () => {
    const rows = pendingWithoutSlot([
      match({ id: "played", played: true, cancha: "1", programadoEn: "2026-08-01T16:00:00.000Z" }),
      match({ id: "fixed", cancha: "1", programadoEn: "2026-08-01T17:00:00.000Z" }),
      match({ id: "open" }),
      match({ id: "half", cancha: "2" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["open", "half"]);
  });

  it("describe el antes y el después sin filas ajenas", () => {
    const changes = changesFromAssignments(
      [
        match({ id: "open", localId: "a", visitanteId: "b" }),
        match({
          id: "fixed",
          localId: "c",
          visitanteId: "d",
          cancha: "1",
          programadoEn: "2026-08-01T16:00:00.000Z",
        }),
      ],
      [
        {
          matchId: "open",
          cancha: "2",
          programadoEn: "2026-08-01T16:00:00.000Z",
          orden: 3,
        },
      ],
      (id) => ({ a: "Ana / Luis", b: "Mara / Paz", c: "Noa / Teo", d: "Ira / Leo" }[id] ?? "Pareja")
    );
    expect(changes).toHaveLength(1);
    const change: GroupScheduleChange = changes[0]!;
    expect(change.localLabel).toBe("Ana / Luis");
    expect(change.visitLabel).toBe("Mara / Paz");
    expect(change.before).toBe("Sin horario");
    expect(change.after).toContain("· 2");
    expect(change.after).toContain("10:00");
    expect(change.afterCourt).toBe("2");
    expect(formatSlotLabel("2026-08-01T16:00:00.000Z", "1")).toContain("10:00");
  });

  it("traduce los errores que obligan a recargar", () => {
    expect(groupScheduleApplyNotice("STALE_GROUP_VERSION")?.reload).toBe(true);
    expect(groupScheduleApplyNotice("PLAYED_MATCH_LOCKED")?.message).toContain("ya fue jugado");
    expect(groupScheduleApplyNotice("PENDING_ALREADY_SCHEDULED")?.message).toContain(
      "Actualizamos el grupo"
    );
    expect(groupScheduleApplyNotice("COURT_SLOT_CONFLICT")).toBeNull();
  });
});
