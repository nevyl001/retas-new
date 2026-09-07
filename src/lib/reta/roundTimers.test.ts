import {
  buildRoundTimerEntry,
  formatRemainingClock,
  isRoundTimerActive,
  parseRoundTimers,
  remainingMs,
  roundTimerKey,
} from "./roundTimers";

describe("roundTimers", () => {
  it("parsea shape canónico", () => {
    const state = parseRoundTimers({
      version: 1,
      rounds: {
        "1": {
          durationMinutes: 20,
          startedAt: "2026-09-07T20:00:00.000Z",
          endsAt: "2026-09-07T20:20:00.000Z",
        },
      },
    });
    expect(state.rounds["1"]?.durationMinutes).toBe(20);
    expect(roundTimerKey(1)).toBe("1");
  });

  it("formatea reloj restante y caduca a null", () => {
    const entry = buildRoundTimerEntry(5, Date.parse("2026-09-07T12:00:00.000Z"));
    expect(entry.durationMinutes).toBe(5);
    const mid = formatRemainingClock(
      entry,
      Date.parse("2026-09-07T12:02:30.000Z")
    );
    expect(mid).toBe("2:30");
    expect(
      isRoundTimerActive(entry, Date.parse("2026-09-07T12:06:00.000Z"))
    ).toBe(false);
    expect(
      remainingMs(entry.endsAt, Date.parse("2026-09-07T12:06:00.000Z"))
    ).toBe(0);
    expect(
      formatRemainingClock(entry, Date.parse("2026-09-07T12:06:00.000Z"))
    ).toBe("0:00");
  });
});
