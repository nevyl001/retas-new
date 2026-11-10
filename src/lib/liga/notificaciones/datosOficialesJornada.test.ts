import {
  datosOficialesJornada,
  fechaLegibleOficial,
  jornadaParaAviso,
  jornadaParaResultados,
  presentarInstanteLiga,
  recordatorioOficial,
} from "./datosOficialesJornada";

const jornada2 = {
  id: "j-2",
  numero: 2,
  estado: "in_progress",
  fecha: "2026-11-11",
  partidos: [
    { ronda: 1, hora_inicio: "21:00:00" },
    { ronda: 1, hora_inicio: "21:00:00" },
    { ronda: 2, hora_inicio: null },
  ],
};

describe("datos oficiales de jornada", () => {
  it("lee la fecha de la jornada y la hora única de la ronda 1", () => {
    const datos = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: jornada2,
    });
    expect(datos.fechaIso).toBe("2026-11-11");
    expect(datos.fechaLegible).toBe("miércoles 11 de noviembre de 2026");
    expect(datos.horaInicio).toBe("21:00");
    expect(datos.horarioLegible).toBe("21:00 hrs");
    expect(datos.sede).toBe("Hack Pádel");
    expect(datos.zonaHoraria).toBe("America/Mexico_City");
    expect(datos.urlPublica).toBe("/public/liga/liga-1/jornada/2");
    expect(datos.faltantes).toEqual([]);
  });

  it("convierte el inicio a Ciudad de México, no a la zona del navegador", () => {
    const datos = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: jornada2,
    });
    expect(new Date(datos.inicioMs ?? 0).toISOString()).toBe("2026-11-12T03:00:00.000Z");
    expect(presentarInstanteLiga("2026-11-11T15:00:00.000Z")).toMatch(/11\/11\/2026/);
    expect(presentarInstanteLiga("2026-11-11T15:00:00.000Z")).toMatch(/09:00/);
  });

  it("programa 24, 12 y 2 horas antes del inicio oficial", () => {
    const datos = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: jornada2,
    });
    const ahora = new Date("2026-11-10T15:00:00.000Z");
    expect(recordatorioOficial({ datos, horas: 24, ahora, activa: true }).ok &&
      recordatorioOficial({ datos, horas: 24, ahora, activa: true })).toMatchObject({
      ok: true,
      cuandoIso: "2026-11-11T03:00:00.000Z",
    });
    expect(recordatorioOficial({ datos, horas: 12, ahora, activa: true })).toMatchObject({
      ok: true,
      cuandoIso: "2026-11-11T15:00:00.000Z",
    });
    expect(recordatorioOficial({ datos, horas: 2, ahora, activa: true })).toMatchObject({
      ok: true,
      cuandoIso: "2026-11-12T01:00:00.000Z",
    });
  });

  it("recalcula si cambia la fecha o la hora y no inventa un horario ausente", () => {
    const base = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: jornada2,
    });
    const movida = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: { ...jornada2, fecha: "2026-11-12" },
    });
    const ahora = new Date("2026-11-10T15:00:00.000Z");
    const antes = recordatorioOficial({ datos: base, horas: 12, ahora, activa: true });
    const despues = recordatorioOficial({ datos: movida, horas: 12, ahora, activa: true });
    expect(antes.ok && despues.ok && antes.cuandoIso).not.toBe(
      despues.ok ? despues.cuandoIso : ""
    );
    const sinHora = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: { ...jornada2, partidos: [{ ronda: 1, hora_inicio: null }] },
    });
    expect(sinHora.horaInicio).toBeNull();
    expect(sinHora.faltantes).toContain("La ronda 1 no tiene hora de inicio.");
    expect(recordatorioOficial({ datos: sinHora, horas: 12, ahora, activa: true })).toEqual({
      ok: false,
      motivo: "jornada_sin_horario",
    });
  });

  it("no elige un horario cuando la ronda 1 tiene horas distintas", () => {
    const datos = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: {
        ...jornada2,
        partidos: [
          { ronda: 1, hora_inicio: "18:00:00" },
          { ronda: 1, hora_inicio: "21:00:00" },
        ],
      },
    });
    expect(datos.horaInicio).toBeNull();
    expect(datos.horasDistintasRondaUno).toEqual(["18:00", "21:00"]);
    expect(
      recordatorioOficial({
        datos,
        horas: 12,
        ahora: new Date("2026-11-10T15:00:00.000Z"),
        activa: true,
      }).ok
    ).toBe(false);
  });

  it("ignora horas de rondas posteriores y separa aviso de resultados", () => {
    const jornadas = [
      { numero: 1, estado: "completed", fecha: "2026-11-04", partidos: [{ ronda: 1, hora_inicio: "20:00:00" }] },
      jornada2,
      { numero: 3, estado: "upcoming", fecha: "2026-11-18", partidos: [{ ronda: 1, hora_inicio: "21:00:00" }] },
    ];
    expect(jornadaParaAviso(jornadas)?.numero).toBe(2);
    expect(jornadaParaResultados(jornadas)?.numero).toBe(1);
    const conRondas = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: {
        ...jornada2,
        partidos: [
          { ronda: 1, hora_inicio: "21:00:00" },
          { ronda: 3, hora_inicio: "23:30:00" },
        ],
      },
    });
    expect(conRondas.horaInicio).toBe("21:00");
  });

  it("no programa una jornada finalizada ni una fecha ya vencida", () => {
    const ahora = new Date("2026-11-11T16:00:00.000Z");
    const cerrada = datosOficialesJornada({
      ligaId: "liga-1",
      clubNombre: "Hack Pádel",
      jornada: { ...jornada2, estado: "completed" },
    });
    expect(recordatorioOficial({ datos: cerrada, horas: 12, ahora, activa: true })).toEqual({
      ok: false,
      motivo: "jornada_finalizada",
    });
    expect(
      recordatorioOficial({
        datos: datosOficialesJornada({
          ligaId: "liga-1",
          clubNombre: "Hack Pádel",
          jornada: jornada2,
        }),
        horas: 12,
        ahora,
        activa: true,
      })
    ).toEqual({ ok: false, motivo: "recordatorio_vencido" });
  });

  it("formatea la fecha desde el calendario, sin correrla al día anterior", () => {
    expect(fechaLegibleOficial("2026-11-11")).toBe("miércoles 11 de noviembre de 2026");
    expect(fechaLegibleOficial(null)).toBeNull();
  });
});
