import { resolvePublicRoundFocus } from "./publicRoundFocus";

const rounds = [
  { key: "1", matchCount: 3, finishedCount: 3 },
  { key: "2", matchCount: 3, finishedCount: 1 },
  { key: "3", matchCount: 3, finishedCount: 0 },
];

describe("resolvePublicRoundFocus", () => {
  it("la ronda con marcadores parciales es la protagonista y la siguiente existe", () => {
    const focus = resolvePublicRoundFocus(rounds, {
      schedulePhase: "in_window",
      tournamentFinished: false,
    });
    expect(focus.liveKey).toBe("2");
    expect(focus.nextKey).toBe("3");
    expect(focus.statusByKey["1"]).toBe("completed");
    expect(focus.statusByKey["2"]).toBe("live");
    expect(focus.statusByKey["3"]).toBe("plain");
  });

  it("sin marcadores no afirma que la ronda está en juego", () => {
    const focus = resolvePublicRoundFocus(
      [
        { key: "1", matchCount: 3, finishedCount: 0 },
        { key: "2", matchCount: 3, finishedCount: 0 },
      ],
      { schedulePhase: "unknown", tournamentFinished: false }
    );
    expect(focus.liveKey).toBe("1");
    expect(focus.statusByKey["1"]).toBe("plain");
    expect(focus.nextKey).toBe("2");
  });

  it("en la última ronda no anuncia una siguiente", () => {
    const focus = resolvePublicRoundFocus(
      [{ key: "5", matchCount: 3, finishedCount: 1 }],
      { schedulePhase: "in_window", tournamentFinished: false }
    );
    expect(focus.liveKey).toBe("5");
    expect(focus.nextKey).toBeNull();
    expect(focus.statusByKey["5"]).toBe("live");
  });

  it("un evento finalizado no se presenta en juego", () => {
    const focus = resolvePublicRoundFocus(rounds, {
      schedulePhase: "after",
      tournamentFinished: true,
    });
    expect(focus.liveKey).toBe("3");
    expect(focus.nextKey).toBeNull();
    expect(focus.statusByKey["2"]).toBe("completed");
    expect(focus.statusByKey["3"]).toBe("completed");
  });
});
