import {
  addMinutesToTimeInput,
  durationMinutesBetweenTimes,
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
});
