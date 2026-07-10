import {
  buildParticipacionFechaFields,
  classifyParticipacionFechaResolution,
  diffCalendarDaysMexico,
  formatMatchDateShort,
  formatMatchDateWeekday,
  resolveParticipacionFechaInstant,
  summarizeLegacyParticipacionFechaResolutions,
  toMexicoCalendarDate,
} from "./matchDate";

describe("matchDate", () => {
  it("convierte instante vespertino México a día calendario local", () => {
    // 9 jul 2026 18:00 CDMX = 10 jul 2026 00:00 UTC
    const iso = "2026-07-10T00:00:00.000Z";
    expect(toMexicoCalendarDate(iso)).toBe("2026-07-09");
    expect(formatMatchDateShort(iso)).toBe("9 jul 2026");
    expect(formatMatchDateWeekday(iso)).toBe("Jueves 9");
  });

  it("legacy vespertino sin señal usa fallback medianoche UTC", () => {
    const resolution = classifyParticipacionFechaResolution({
      fecha: "2026-07-10",
      metadata: {},
    });
    expect(resolution.source).toBe("legacy_utc_midnight_fallback");
    expect(formatMatchDateShort(resolution.instant)).toBe("9 jul 2026");
  });

  it("legacy vespertino con created_at usa hora real", () => {
    const resolution = classifyParticipacionFechaResolution({
      fecha: "2026-07-10",
      created_at: "2026-07-10T00:30:00.000Z",
      metadata: {},
    });
    expect(resolution.source).toBe("created_at");
    expect(formatMatchDateShort(resolution.instant)).toBe("9 jul 2026");
  });

  it("legacy matutino con created_at no retrocede un día", () => {
    const resolution = classifyParticipacionFechaResolution({
      fecha: "2026-07-09",
      created_at: "2026-07-09T16:00:00.000Z",
      metadata: {},
    });
    expect(resolution.source).toBe("created_at");
    expect(formatMatchDateShort(resolution.instant)).toBe("9 jul 2026");
  });

  it("legacy con partidos_detalle prioriza hora del detalle", () => {
    const resolution = classifyParticipacionFechaResolution({
      fecha: "2026-07-10",
      created_at: "2026-07-11T02:00:00.000Z",
      metadata: {
        partidos_detalle: [
          {
            ronda: 1,
            rival: "Rival",
            games_favor: 6,
            games_contra: 4,
            resultado: "win",
            fecha: "2026-07-10T00:00:00.000Z",
          },
        ],
      },
    });
    expect(resolution.source).toBe("partidos_detalle");
    expect(formatMatchDateShort(resolution.instant)).toBe("9 jul 2026");
  });

  it("prefiere metadata.evento_en para participaciones nuevas", () => {
    const instant = resolveParticipacionFechaInstant({
      fecha: "2026-07-09",
      metadata: { evento_en: "2026-07-10T00:00:00.000Z" },
    });
    expect(formatMatchDateShort(instant)).toBe("9 jul 2026");
  });

  it("calcula diferencia de días calendario en México", () => {
    const today = new Date("2026-07-10T06:00:00.000Z"); // 9 jul 00:00 CDMX
    const yesterday = new Date("2026-07-09T06:00:00.000Z");
    expect(diffCalendarDaysMexico(yesterday, today)).toBe(1);
  });

  it("buildParticipacionFechaFields guarda fecha local y evento_en", () => {
    const fields = buildParticipacionFechaFields("2026-07-10T00:00:00.000Z");
    expect(fields.fecha).toBe("2026-07-09");
    expect(fields.evento_en).toBe("2026-07-10T00:00:00.000Z");
  });

  it("resume auditoría legacy por fuente de resolución", () => {
    const summary = summarizeLegacyParticipacionFechaResolutions([
      {
        fecha: "2026-07-10",
        created_at: "2026-07-10T00:30:00.000Z",
        metadata: {},
      },
      {
        fecha: "2026-07-09",
        metadata: {
          partidos_detalle: [
            {
              ronda: 1,
              rival: "Rival",
              games_favor: 6,
              games_contra: 4,
              resultado: "win",
              fecha: "2026-07-09T16:00:00.000Z",
            },
          ],
        },
      },
      { fecha: "2026-06-01", metadata: {} },
      {
        fecha: "2026-07-09",
        metadata: { evento_en: "2026-07-09T16:00:00.000Z" },
      },
    ]);

    expect(summary.totalLegacy).toBe(3);
    expect(summary.resolvedWithSignal).toBe(2);
    expect(summary.fallbackUtcMidnight).toBe(1);
    expect(summary.bySource.created_at).toBe(1);
    expect(summary.bySource.partidos_detalle).toBe(1);
    expect(summary.bySource.legacy_utc_midnight_fallback).toBe(1);
  });
});
