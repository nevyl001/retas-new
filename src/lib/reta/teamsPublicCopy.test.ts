import {
  TEAMS_PUBLIC_FORMAT_LABEL,
  TEAMS_PUBLIC_LIVE_TITLE,
  TEAMS_PUBLIC_TAGLINE,
  formatTeamsPublicFaceoff,
  formatTeamsPublicHeroMeta,
} from "./teamsPublicCopy";

describe("teamsPublicCopy", () => {
  it("formatea faceoff con nombres reales", () => {
    expect(formatTeamsPublicFaceoff(["Alvas", "Hacks"])).toBe("Alvas vs Hacks");
  });

  it("usa Equipo 1 / Equipo 2 por defecto", () => {
    expect(formatTeamsPublicFaceoff(undefined)).toBe("Equipo 1 vs Equipo 2");
    expect(formatTeamsPublicFaceoff([])).toBe("Equipo 1 vs Equipo 2");
  });

  it("arma meta de hero Duelo + faceoff + tagline", () => {
    expect(formatTeamsPublicHeroMeta(["Norte", "Sur"])).toBe(
      `${TEAMS_PUBLIC_FORMAT_LABEL} · Norte vs Sur · ${TEAMS_PUBLIC_TAGLINE}`
    );
  });

  it("expone título live de duelo", () => {
    expect(TEAMS_PUBLIC_LIVE_TITLE).toBe("Duelo en vivo");
    expect(TEAMS_PUBLIC_TAGLINE).toBe("Que gane el mejor");
  });
});
