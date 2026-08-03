import {
  addMinutesToTimeInput,
  durationMinutesBetweenTimes,
  resolveDueloScheduleFromDraft,
} from "./schedule";

describe("duelo schedule duration helpers", () => {
  it("addMinutesToTimeInput suma duración al inicio", () => {
    expect(addMinutesToTimeInput("15:00", 120)).toBe("17:00");
    expect(addMinutesToTimeInput("15:00", 90)).toBe("16:30");
    expect(addMinutesToTimeInput("23:30", 60)).toBe("00:30");
  });

  it("durationMinutesBetweenTimes calcula minutos entre horas", () => {
    expect(durationMinutesBetweenTimes("15:00", "17:00")).toBe(120);
    expect(durationMinutesBetweenTimes("15:00", "16:30")).toBe(90);
    expect(durationMinutesBetweenTimes("23:00", "01:00")).toBe(120);
  });

  it("resolveDueloScheduleFromDraft usa duración y cruza medianoche", () => {
    const overnight = resolveDueloScheduleFromDraft(
      "2026-08-03",
      "23:00",
      "01:00",
      120
    );
    expect("error" in overnight).toBe(false);
    if ("error" in overnight) return;
    const start = new Date(overnight.programado_en).getTime();
    const end = new Date(overnight.programado_hasta).getTime();
    expect(end - start).toBe(120 * 60_000);
    expect(end).toBeGreaterThan(start);
  });

  it("resolveDueloScheduleFromDraft overnight sin duración explícita", () => {
    const overnight = resolveDueloScheduleFromDraft(
      "2026-08-03",
      "23:00",
      "01:00"
    );
    expect("error" in overnight).toBe(false);
    if ("error" in overnight) return;
    const start = new Date(overnight.programado_en).getTime();
    const end = new Date(overnight.programado_hasta).getTime();
    expect(end - start).toBe(120 * 60_000);
  });
});
