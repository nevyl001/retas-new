import { buildAmericanoPodiumCelebration } from "./americanoPodiumCopy";

describe("americanoPodiumCopy", () => {
  it("buildAmericanoPodiumCelebration usa nombre de reta", () => {
    const copy = buildAmericanoPodiumCelebration("Test America");
    expect(copy.tagline).toBe("");
    expect(copy.headline).toMatch(/cuadro de honor/i);
    expect(copy.title).toBe("Test America");
    expect(copy.statusBadge).toMatch(/americano finalizado/i);
    expect(copy.message).toMatch(/felicidades/i);
  });

  it("buildAmericanoPodiumCelebration fallback sin nombre", () => {
    const copy = buildAmericanoPodiumCelebration(null);
    expect(copy.title).toBe("Americano");
    expect(copy.message).toMatch(/felicidades/i);
  });
});
