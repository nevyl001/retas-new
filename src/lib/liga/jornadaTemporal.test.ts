import {
  jornadaPublicTemporalEstado,
  partidoPublicTemporalEstado,
  pickDefaultPublicJornadaId,
  pickDefaultPublicRonda,
  resolveLigaProgramadoStartMs,
  rondaPublicTemporalEstado,
} from "./jornadaTemporal";

describe("jornadaTemporal", () => {
  const beforeKickoff = new Date("2026-11-02T20:00:00-06:00");
  const afterKickoff = new Date("2026-11-03T21:30:00-06:00");

  it("resolveLigaProgramadoStartMs combina fecha + hora en zona MX", () => {
    const ms = resolveLigaProgramadoStartMs("2026-11-03", "21:00:00");
    expect(ms).not.toBeNull();
    expect(beforeKickoff.getTime()).toBeLessThan(ms!);
    expect(afterKickoff.getTime()).toBeGreaterThan(ms!);
  });

  it("partido in_progress antes del horario → upcoming (Pendiente)", () => {
    expect(
      partidoPublicTemporalEstado(
        { estado: "in_progress", hora_inicio: "21:00:00", ronda: 1 },
        { fechaJornada: "2026-11-03", now: beforeKickoff }
      )
    ).toBe("upcoming");
  });

  it("partido in_progress después del horario → in_progress", () => {
    expect(
      partidoPublicTemporalEstado(
        { estado: "in_progress", hora_inicio: "21:00:00", ronda: 1 },
        { fechaJornada: "2026-11-03", now: afterKickoff }
      )
    ).toBe("in_progress");
  });

  it("partido completed siempre completed", () => {
    expect(
      partidoPublicTemporalEstado(
        { estado: "completed", hora_inicio: "21:00:00", ronda: 1 },
        { fechaJornada: "2026-11-03", now: beforeKickoff }
      )
    ).toBe("completed");
  });

  it("sin fecha programada, respeta estado BD", () => {
    expect(
      partidoPublicTemporalEstado(
        { estado: "in_progress", hora_inicio: null, ronda: 1 },
        { fechaJornada: null, now: beforeKickoff }
      )
    ).toBe("in_progress");
  });

  it("jornada in_progress antes del horario → upcoming", () => {
    expect(
      jornadaPublicTemporalEstado(
        {
          estado: "in_progress",
          fecha: "2026-11-03",
          partidos: [
            {
              id: "p1",
              jornada_id: "j1",
              pareja1_id: "a",
              pareja2_id: "b",
              score_pareja1: null,
              score_pareja2: null,
              cancha: 1,
              ronda: 1,
              estado: "in_progress",
              hora_inicio: "21:00:00",
              created_at: "",
            },
          ],
        },
        { now: beforeKickoff }
      )
    ).toBe("upcoming");
  });

  it("ronda: live solo si algún partido ya puede verse en juego", () => {
    const partidos = [
      {
        estado: "in_progress" as const,
        hora_inicio: "21:00:00",
        ronda: 1,
      },
      {
        estado: "in_progress" as const,
        hora_inicio: "21:00:00",
        ronda: 1,
      },
    ];
    expect(
      rondaPublicTemporalEstado(partidos, {
        fechaJornada: "2026-11-03",
        now: beforeKickoff,
      })
    ).toBe("pending");
    expect(
      rondaPublicTemporalEstado(partidos, {
        fechaJornada: "2026-11-03",
        now: afterKickoff,
      })
    ).toBe("live");
  });

  it("pickDefaultPublicRonda: live → pending → última done", () => {
    expect(pickDefaultPublicRonda([])).toBeNull();
    expect(
      pickDefaultPublicRonda([
        { ronda: 1, estado: "done" },
        { ronda: 2, estado: "live" },
        { ronda: 3, estado: "pending" },
      ])
    ).toBe(2);
    expect(
      pickDefaultPublicRonda([
        { ronda: 1, estado: "done" },
        { ronda: 2, estado: "pending" },
        { ronda: 3, estado: "pending" },
      ])
    ).toBe(2);
    expect(
      pickDefaultPublicRonda([
        { ronda: 1, estado: "done" },
        { ronda: 2, estado: "done" },
      ])
    ).toBe(2);
  });

  it("pickDefaultPublicJornadaId: live → próxima → última completada", () => {
    expect(pickDefaultPublicJornadaId([])).toBeNull();
    expect(
      pickDefaultPublicJornadaId([
        { id: "j1", numero: 1, estado: "completed" },
        { id: "j2", numero: 2, estado: "in_progress" },
        { id: "j3", numero: 3, estado: "upcoming" },
      ])
    ).toBe("j2");
    expect(
      pickDefaultPublicJornadaId([
        { id: "j1", numero: 1, estado: "completed" },
        { id: "j2", numero: 2, estado: "upcoming" },
        { id: "j3", numero: 3, estado: "upcoming" },
      ])
    ).toBe("j2");
    expect(
      pickDefaultPublicJornadaId([
        { id: "j1", numero: 1, estado: "completed" },
        { id: "j2", numero: 2, estado: "completed" },
      ])
    ).toBe("j2");
  });
});
