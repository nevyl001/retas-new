import {
  formatPublicEventFechaHorarioLine,
  getPublicEventScheduleStatus,
  resolveEventSchedulePhase,
  resolvePublicEventLugar,
  resolvePublicMatchStatusVariant,
} from "./eventScheduleStatus";

describe("eventScheduleStatus", () => {
  const start = "2026-08-01T15:00:00.000Z";
  const end = "2026-08-01T17:00:00.000Z";

  it("marks upcoming before start", () => {
    const status = getPublicEventScheduleStatus(
      { programado_en: start, programado_hasta: end },
      new Date("2026-08-01T14:00:00.000Z")
    );
    expect(status.label).toBe("Por comenzar");
    expect(status.tone).toBe("pending");
  });

  it("marks live inside window", () => {
    const status = getPublicEventScheduleStatus(
      { programado_en: start, programado_hasta: end },
      new Date("2026-08-01T16:00:00.000Z")
    );
    expect(status.label).toBe("En vivo");
    expect(status.tone).toBe("live");
  });

  it("marks finished after window", () => {
    const status = getPublicEventScheduleStatus(
      { programado_en: start, programado_hasta: end },
      new Date("2026-08-01T18:00:00.000Z")
    );
    expect(status.label).toBe("Finalizada");
    expect(status.tone).toBe("muted");
  });

  it("finished flag overrides clock", () => {
    const status = getPublicEventScheduleStatus(
      {
        programado_en: start,
        programado_hasta: end,
        is_finished: true,
      },
      new Date("2026-08-01T14:00:00.000Z")
    );
    expect(status.label).toBe("Finalizada");
    expect(status.tone).toBe("muted");
  });

  it("hides lugar when mostrar_lugar is false", () => {
    expect(
      resolvePublicEventLugar({ lugar: "Club X", mostrar_lugar: false })
    ).toBeNull();
    expect(
      resolvePublicEventLugar({ lugar: "Club X", mostrar_lugar: true })
    ).toBe("Club X");
  });

  it("builds fecha · horario line", () => {
    const line = formatPublicEventFechaHorarioLine(start, end);
    expect(line).toBeTruthy();
    expect(line).toContain("·");
  });

  it("maps match badge from event phase", () => {
    expect(
      resolvePublicMatchStatusVariant({
        matchFinished: false,
        eventPhase: "upcoming",
      })
    ).toBe("upcoming");
    expect(
      resolvePublicMatchStatusVariant({
        matchFinished: true,
        eventPhase: "in_window",
      })
    ).toBe("finished");
  });

  it("treats missing end as open window after start", () => {
    expect(
      resolveEventSchedulePhase(
        { programado_en: start, programado_hasta: null },
        new Date("2026-08-01T20:00:00.000Z")
      )
    ).toBe("in_window");
  });
});
