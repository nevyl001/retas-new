import { duelo2v2ShareFileName } from "./duelo2v2SharePresentation";
import type { Duelo2v2SharePresentation } from "./duelo2v2SharePresentation";

describe("duelo2v2SharePresentation", () => {
  it("generates a stable png file name", () => {
    const data = {
      place: "winner",
      positionLabel: "1.er LUGAR",
      dueloNombre: "Test Duelo",
    } as Duelo2v2SharePresentation;

    expect(duelo2v2ShareFileName(data)).toBe("duelo-2v2-test-duelo-1-er-lugar.png");
  });
});
