import { shouldShowMotherAttribution } from "./experienceFormatters";

describe("shouldShowMotherAttribution", () => {
  it("hides attribution on the Riviera Open account", () => {
    expect(shouldShowMotherAttribution("Riviera Open", false)).toBe(false);
    expect(shouldShowMotherAttribution("Riviera Open", true)).toBe(false);
  });

  it("shows attribution only for club-branded accounts", () => {
    expect(shouldShowMotherAttribution("Hack Padel", true)).toBe(true);
    expect(shouldShowMotherAttribution("Hack Padel", false)).toBe(false);
  });
});
