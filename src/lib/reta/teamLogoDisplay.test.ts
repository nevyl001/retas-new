import { getTeamLogoInitials } from "./teamLogoDisplay";

describe("getTeamLogoInitials", () => {
  it("usa iniciales de dos palabras", () => {
    expect(getTeamLogoInitials("Team BreakPoint")).toBe("TB");
  });

  it("usa dos letras de una sola palabra", () => {
    expect(getTeamLogoInitials("Oasis")).toBe("OA");
  });

  it("fallback vacío", () => {
    expect(getTeamLogoInitials("")).toBe("?");
    expect(getTeamLogoInitials(null)).toBe("?");
  });
});
