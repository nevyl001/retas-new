import {
  computeCountdownRemainingMs,
  formatCountdownSegments,
  resolveCountdownDisplay,
} from "./retaEquiposCountdown";

describe("retaEquiposCountdown", () => {
  it("nunca devuelve ms negativos", () => {
    const start = "2026-08-27T19:00:00.000Z";
    expect(computeCountdownRemainingMs(start, Date.parse(start) + 5000)).toBe(0);
    expect(computeCountdownRemainingMs(null, Date.now())).toBeNull();
  });

  it("formatea HH:MM:SS bajo 24h", () => {
    const ms = ((1 * 3600) + (27 * 60) + 42) * 1000;
    expect(formatCountdownSegments(ms)).toEqual({
      segments: ["01", "27", "42"],
      separator: " : ",
    });
  });

  it("formatea días cuando >= 24h", () => {
    const ms = ((1 * 86400) + (4 * 3600) + (27 * 60)) * 1000;
    expect(formatCountdownSegments(ms)).toEqual({
      segments: ["01D", "04H", "27M"],
      separator: " : ",
    });
  });

  it("resuelve fases upcoming / live / finished", () => {
    const start = "2026-08-27T19:00:00.000Z";
    const end = "2026-08-27T21:00:00.000Z";

    expect(
      resolveCountdownDisplay({
        programadoEn: start,
        programadoHasta: end,
        nowMs: Date.parse("2026-08-27T18:00:00.000Z"),
      }).headline
    ).toBe("COMIENZA EN");

    expect(
      resolveCountdownDisplay({
        programadoEn: start,
        programadoHasta: end,
        nowMs: Date.parse("2026-08-27T19:30:00.000Z"),
      }).headline
    ).toBe("EN VIVO");

    expect(
      resolveCountdownDisplay({
        programadoEn: start,
        programadoHasta: end,
        nowMs: Date.parse("2026-08-27T22:00:00.000Z"),
      }).headline
    ).toBe("FINALIZADA");

    expect(
      resolveCountdownDisplay({
        isFinished: true,
        programadoEn: start,
        nowMs: Date.parse("2026-08-27T18:00:00.000Z"),
      }).headline
    ).toBe("FINALIZADA");
  });
});
