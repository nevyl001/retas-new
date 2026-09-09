import {
  compactPlayerName,
  formatPairCompactLine,
  formatSetColumnLabel,
  isPhotographicSplitVsFoto,
  isSquareEnoughForSplitVs,
  pairInitials,
  playerAvatarHashTone,
  splitPlayerDisplayName,
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

  it("splitPlayerDisplayName splits given/family", () => {
    expect(splitPlayerDisplayName("Brandon Pérez")).toEqual({
      primary: "Brandon",
      secondary: "Pérez",
    });
    expect(splitPlayerDisplayName("Juan")).toEqual({
      primary: "Juan",
      secondary: null,
    });
  });

  it("formatSetColumnLabel expands S1", () => {
    expect(formatSetColumnLabel("S1")).toBe("SET 1");
    expect(formatSetColumnLabel("STB")).toBe("STB");
  });

  it("isPhotographicSplitVsFoto rejects synthetic avatars", () => {
    expect(isPhotographicSplitVsFoto(null)).toBe(false);
    expect(
      isPhotographicSplitVsFoto("https://api.dicebear.com/7.x/avataaars/svg?seed=a")
    ).toBe(false);
    expect(
      isPhotographicSplitVsFoto(
        "https://xyz.supabase.co/storage/v1/object/public/jugadores-avatars/a/b.jpg"
      )
    ).toBe(true);
  });

  it("playerAvatarHashTone uses layered jersey gradient", () => {
    const tone = playerAvatarHashTone("Brandon");
    expect(tone.background).toContain("radial-gradient");
    expect(tone.background).toContain("linear-gradient");
  });

  it("isSquareEnoughForSplitVs guards aspect ratio", () => {
    expect(isSquareEnoughForSplitVs(600, 600)).toBe(true);
    expect(isSquareEnoughForSplitVs(900, 600)).toBe(false);
  });
});