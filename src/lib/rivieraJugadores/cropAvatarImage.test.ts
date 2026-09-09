import {
  AVATAR_MIN_SIDE_PX,
  meetsAvatarMinDimensions,
} from "./cropAvatarImage";
import {
  isPhotographicSplitVsFoto,
  isSquareEnoughForSplitVs,
  playerAvatarHashTone,
} from "../../components/liga/jornada-public/ligaJornadaMatchNames";

describe("cropAvatarImage", () => {
  it("meetsAvatarMinDimensions requires 400px short side", () => {
    expect(meetsAvatarMinDimensions(400, 800)).toBe(true);
    expect(meetsAvatarMinDimensions(399, 800)).toBe(false);
    expect(AVATAR_MIN_SIDE_PX).toBe(400);
  });
});

describe("ligaJornadaMatchNames split vs", () => {
  it("playerAvatarHashTone returns jersey-like layered gradient", () => {
    const tone = playerAvatarHashTone("Kevin Pérez");
    expect(tone.background).toContain("radial-gradient");
    expect(tone.background).toContain("linear-gradient");
  });

  it("isSquareEnoughForSplitVs accepts near-square ratios", () => {
    expect(isSquareEnoughForSplitVs(400, 400)).toBe(true);
    expect(isSquareEnoughForSplitVs(1200, 1080)).toBe(true);
    expect(isSquareEnoughForSplitVs(800, 500)).toBe(false);
    expect(isSquareEnoughForSplitVs(150, 150)).toBe(false);
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
});
