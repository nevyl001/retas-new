import { buildAmericanoPodiumCelebration } from "./americanoPodiumCopy";

describe("americanoPodiumCopy", () => {
  it("buildAmericanoPodiumCelebration usa nombre de reta", () => {
    const copy = buildAmericanoPodiumCelebration("Test America");
    expect(copy.tagline).toBe("Demuestra tu nivel.");
    expect(copy.headline).toMatch(/felicidades/i);
    expect(copy.title).toMatch(/3 primeros lugares/i);
    expect(copy.message).toContain("Test America");
    expect(copy.message).toMatch(/Riviera Open/i);
  });

  it("buildAmericanoPodiumCelebration fallback sin nombre", () => {
    const copy = buildAmericanoPodiumCelebration(null);
    expect(copy.message).toContain("la reta");
  });
});
