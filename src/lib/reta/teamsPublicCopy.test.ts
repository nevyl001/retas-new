import {
  TEAMS_PUBLIC_BRAND_LINE,
  TEAMS_PUBLIC_CLUB_FALLBACK,
  TEAMS_PUBLIC_EVENT_FALLBACK,
  TEAMS_PUBLIC_FORMAT_LABEL,
  TEAMS_PUBLIC_LIVE_TITLE,
  TEAMS_PUBLIC_MOTIVATIONAL,
  TEAMS_PUBLIC_TAGLINE,
  formatBroadcastBattleTitle,
  formatTeamsPublicFaceoff,
  formatTeamsPublicHeroMeta,
  isRedundantTeamsFaceoffTitle,
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

  it("detecta título de evento que solo repite el faceoff", () => {
    expect(
      isRedundantTeamsFaceoffTitle("TEAM BREAKPOINT VS TEAM OASIS", [
        "Team Oasis",
        "Team Breakpoint",
      ])
    ).toBe(true);
    expect(
      isRedundantTeamsFaceoffTitle("TEAM BREAKPOINT VS TEAM OASIS", [
        "Break Point",
        "Oasis",
      ])
    ).toBe(true);
    expect(
      isRedundantTeamsFaceoffTitle("Copa Verano 2026", ["Oasis", "Break"])
    ).toBe(false);
    expect(isRedundantTeamsFaceoffTitle(null, ["Oasis", "Break"])).toBe(false);
  });

  it("formatea título broadcast: nombre propio, nunca el VS de equipos", () => {
    expect(
      formatBroadcastBattleTitle("TEAM BREAKPOINT VS TEAM OASIS", [
        "Break Point",
        "Oasis",
      ])
    ).toBeNull();
    expect(
      formatBroadcastBattleTitle("Duelo 40+", ["Break Point", "Oasis"])
    ).toBe("Duelo 40+");
    expect(
      formatBroadcastBattleTitle("Copa Verano 2026", ["Norte", "Sur"])
    ).toBe("Copa Verano 2026");
    expect(formatBroadcastBattleTitle(null, ["Alvas", "Hacks"])).toBeNull();
  });

  it("expone título live de duelo", () => {
    expect(TEAMS_PUBLIC_LIVE_TITLE).toBe("Duelo en vivo");
    expect(TEAMS_PUBLIC_TAGLINE).toBe("Que gane el mejor");
  });

  it("expone copy motivacional y de marca", () => {
    expect(TEAMS_PUBLIC_MOTIVATIONAL).toBe("Que gane el mejor");
    expect(TEAMS_PUBLIC_BRAND_LINE).toBe("Vive Riviera Open");
    expect(TEAMS_PUBLIC_EVENT_FALLBACK).toBe("Reta de equipos");
    expect(TEAMS_PUBLIC_CLUB_FALLBACK).toBe("Riviera Open");
  });
});
