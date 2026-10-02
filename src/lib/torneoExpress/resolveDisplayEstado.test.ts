import {
  earliestProgramadoEnFromPartidos,
  eventFechaInicioStartMs,
  hasCompetitionStarted,
  resolveEventoDisplayEstado,
  resolveTorneoExpressDisplayEstado,
} from "./resolveDisplayEstado";

describe("resolveTorneoExpressDisplayEstado", () => {
  const before = new Date("2026-10-02T18:00:00.000Z"); // 2 oct ~12:00 MX
  const during = new Date("2026-10-03T16:00:00.000Z"); // 3 oct ~10:00 MX

  it("no muestra en_curso antes de fecha_inicio del evento", () => {
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "en_curso",
        eventFechaInicio: "2026-10-03",
        now: before,
      })
    ).toBe("pendiente");
  });

  it("muestra en_curso cuando ya empezó el día del evento", () => {
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "en_curso",
        eventFechaInicio: "2026-10-03",
        now: during,
      })
    ).toBe("en_curso");
  });

  it("usa el primer partido programado si es más preciso", () => {
    const start = "2026-10-03T15:00:00.000Z"; // 9:00 MX
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "en_curso",
        eventFechaInicio: "2026-10-03",
        earliestProgramadoEn: start,
        now: new Date("2026-10-03T14:59:00.000Z"),
      })
    ).toBe("pendiente");
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "en_curso",
        earliestProgramadoEn: start,
        now: new Date("2026-10-03T15:00:00.000Z"),
      })
    ).toBe("en_curso");
  });

  it("conserva finalizado y pendiente", () => {
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "finalizado",
        eventFechaInicio: "2026-10-03",
        now: before,
      })
    ).toBe("finalizado");
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "pendiente",
        eventFechaInicio: "2026-10-01",
        now: during,
      })
    ).toBe("pendiente");
  });

  it("sin calendario respeta el estado guardado", () => {
    expect(
      resolveTorneoExpressDisplayEstado({
        estado: "en_curso",
        now: before,
      })
    ).toBe("en_curso");
  });
});

describe("resolveEventoDisplayEstado", () => {
  it("published/in_progress → published antes de fecha_inicio", () => {
    expect(
      resolveEventoDisplayEstado({
        estado: "in_progress",
        fecha_inicio: "2026-10-03",
        now: new Date("2026-10-02T18:00:00.000Z"),
      })
    ).toBe("published");
  });

  it("conserva draft/completed", () => {
    expect(
      resolveEventoDisplayEstado({
        estado: "draft",
        fecha_inicio: "2026-10-03",
        now: new Date("2026-10-04T12:00:00.000Z"),
      })
    ).toBe("draft");
  });
});

describe("helpers", () => {
  it("eventFechaInicioStartMs es medianoche México", () => {
    const ms = eventFechaInicioStartMs("2026-10-03");
    expect(ms).toBeTruthy();
    expect(hasCompetitionStarted({
      eventFechaInicio: "2026-10-03",
      now: new Date(ms! - 1),
    })).toBe(false);
    expect(hasCompetitionStarted({
      eventFechaInicio: "2026-10-03",
      now: new Date(ms!),
    })).toBe(true);
  });

  it("earliestProgramadoEnFromPartidos", () => {
    expect(
      earliestProgramadoEnFromPartidos([
        { programado_en: "2026-10-03T16:00:00.000Z" },
        { programado_en: "2026-10-03T15:00:00.000Z" },
        { programado_en: null },
      ])
    ).toBe("2026-10-03T15:00:00.000Z");
  });
});
