import {
  compactPlayerName,
  formatPairCompactLine,
  pairInitials,
} from "./ligaJornadaMatchNames";

describe("ligaJornadaMatchNames", () => {
  it("compactPlayerName abbreviates last name", () => {
    expect(compactPlayerName("Kevin Pérez")).toBe("Kevin P.");
    expect(compactPlayerName("Brandon")).toBe("Brandon");
  });

  it("formatPairCompactLine joins pair", () => {
    expect(formatPairCompactLine("Kevin Pérez", "Brandon Pérez")).toBe(
      "Kevin P. / Brandon P."
    );
  });

  it("pairInitials uses first letters", () => {
    expect(pairInitials("Kevin Pérez", "Brandon Pérez")).toBe("KB");
  });
});
