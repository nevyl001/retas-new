import {
  buildAmericanoWinnerCelebration,
  isAmericanoWinnerPlacement,
} from "./americanoPerformanceCopy";

describe("americanoPerformanceCopy", () => {
  it("buildAmericanoWinnerCelebration usa nombre de reta", () => {
    const copy = buildAmericanoWinnerCelebration("Test America");
    expect(copy.headline).toMatch(/Felicidades/i);
    expect(copy.message).toContain("Test America");
    expect(copy.message).toMatch(/Riviera Open/i);
    expect(copy.shareLines.length).toBeGreaterThan(2);
  });

  it("buildAmericanoWinnerCelebration fallback sin nombre", () => {
    const copy = buildAmericanoWinnerCelebration(null);
    expect(copy.message).toContain("la reta");
  });

  it("isAmericanoWinnerPlacement solo #1 terminado", () => {
    expect(isAmericanoWinnerPlacement({ position: 1, isFinished: true })).toBe(
      true
    );
    expect(isAmericanoWinnerPlacement({ position: 1, isFinished: false })).toBe(
      false
    );
    expect(isAmericanoWinnerPlacement({ position: 2, isFinished: true })).toBe(
      false
    );
  });
});
