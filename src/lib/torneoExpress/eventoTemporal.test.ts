import { resolveEventoDisplayEstado } from "./resolveDisplayEstado";
import {
  classifyEventoTemporal,
  filterEventos,
  formatZonedDateTimeLocal,
  summarizeEventos,
  zonedDateTimeIso,
  zonedDayStartMs,
  type EventoTemporalInput,
} from "./eventoTemporal";

const MX = "America/Mexico_City";

function ev(
  partial: Partial<EventoTemporalInput> & { estado: EventoTemporalInput["estado"] }
): EventoTemporalInput {
  return { fecha_inicio: null, timezone: MX, ...partial };
}

describe("zonedDayStartMs", () => {
  it("México (UTC−6 sin horario de verano desde 2022): 00:00 local = 06:00Z", () => {
    expect(zonedDayStartMs("2026-10-06", MX)).toBe(Date.UTC(2026, 9, 6, 6, 0, 0));
  });

  it("respeta la zona del evento (Madrid en octubre = UTC+2)", () => {
    expect(zonedDayStartMs("2026-10-06", "Europe/Madrid")).toBe(
      Date.UTC(2026, 9, 5, 22, 0, 0)
    );
  });

  it("zona inválida cae a México; fecha inválida da null", () => {
    expect(zonedDayStartMs("2026-10-06", "No/Existe")).toBe(
      zonedDayStartMs("2026-10-06", MX)
    );
    expect(zonedDayStartMs("06/10/2026", MX)).toBeNull();
    expect(zonedDayStartMs(null, MX)).toBeNull();
  });
});

describe("zonedDateTimeIso / formatZonedDateTimeLocal", () => {
  it("interpreta datetime-local en la zona del evento", () => {
    expect(zonedDateTimeIso("2026-10-10T14:00", MX)).toBe(
      "2026-10-10T20:00:00.000Z"
    );
    expect(zonedDateTimeIso("2026-10-10T14:00:00", MX)).toBe(
      "2026-10-10T20:00:00.000Z"
    );
    expect(formatZonedDateTimeLocal("2026-10-10T20:00:00.000Z", MX)).toBe(
      "2026-10-10T14:00"
    );
  });

  it("vacío o inválido da null / cadena vacía", () => {
    expect(zonedDateTimeIso("", MX)).toBeNull();
    expect(zonedDateTimeIso("10/10/2026 14:00", MX)).toBeNull();
    expect(formatZonedDateTimeLocal(null, MX)).toBe("");
  });
});

describe("classifyEventoTemporal", () => {
  const start = "2026-10-06";

  it("borrador y finalizado dependen del estado, no de fechas", () => {
    const now = new Date("2026-10-07T18:00:00Z");
    expect(classifyEventoTemporal(ev({ estado: "draft", fecha_inicio: start }), now)).toBe("borrador");
    expect(classifyEventoTemporal(ev({ estado: "completed" }), now)).toBe("finalizado");
    expect(classifyEventoTemporal(ev({ estado: "archived" }), now)).toBe("finalizado");
  });

  it("publicado antes de su día de inicio es próximo", () => {
    const now = new Date("2026-10-06T05:59:00Z"); // 23:59 del 5 en México
    expect(classifyEventoTemporal(ev({ estado: "published", fecha_inicio: start }), now)).toBe("proximo");
    expect(classifyEventoTemporal(ev({ estado: "in_progress", fecha_inicio: start }), now)).toBe("proximo");
  });

  it("publicado desde las 00:00 locales del inicio ya está en curso", () => {
    const now = new Date("2026-10-06T06:00:00Z");
    expect(classifyEventoTemporal(ev({ estado: "published", fecha_inicio: start }), now)).toBe("en_curso");
    expect(classifyEventoTemporal(ev({ estado: "in_progress", fecha_inicio: start }), now)).toBe("en_curso");
  });

  it("usa la zona del evento, no la del navegador", () => {
    const now = new Date("2026-10-05T23:00:00Z");
    expect(
      classifyEventoTemporal(
        ev({ estado: "published", fecha_inicio: start, timezone: "Europe/Madrid" }),
        now
      )
    ).toBe("en_curso"); // 01:00 del día 6 en Madrid
    expect(
      classifyEventoTemporal(ev({ estado: "published", fecha_inicio: start, timezone: MX }), now)
    ).toBe("proximo");
  });

  it("sin fecha de inicio: in_progress → en curso; published → próximo", () => {
    const now = new Date("2026-10-07T18:00:00Z");
    expect(classifyEventoTemporal(ev({ estado: "in_progress" }), now)).toBe("en_curso");
    expect(classifyEventoTemporal(ev({ estado: "published" }), now)).toBe("proximo");
  });

  it("coincide con resolveEventoDisplayEstado en México (antes/después del inicio)", () => {
    const before = new Date("2026-10-05T12:00:00Z");
    const after = new Date("2026-10-07T12:00:00Z");
    for (const estado of ["published", "in_progress"] as const) {
      const input = { estado, fecha_inicio: start, timezone: MX };
      expect(resolveEventoDisplayEstado({ ...input, now: before })).toBe("published");
      expect(classifyEventoTemporal(input, before)).toBe("proximo");
      const display = resolveEventoDisplayEstado({ ...input, now: after });
      expect(display).toBe(estado);
      expect(classifyEventoTemporal(input, after)).toBe("en_curso");
    }
  });
});

describe("summarizeEventos / filterEventos", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const lista = [
    { nombre: "Copa Álvaro", ...ev({ estado: "published", fecha_inicio: "2026-10-20" }) },
    { nombre: "Hack Padel Fest", ...ev({ estado: "published", fecha_inicio: "2026-10-06" }) },
    { nombre: "Borrador X", ...ev({ estado: "draft" }) },
    { nombre: "Liga vieja", ...ev({ estado: "completed", fecha_inicio: "2026-01-01" }) },
  ];

  it("el resumen cuenta cada evento una sola vez", () => {
    expect(summarizeEventos(lista, now)).toEqual({
      total: 4,
      en_curso: 1,
      proximo: 1,
      borrador: 1,
      finalizado: 1,
    });
  });

  it("Todos ordena por prioridad y conserva el orden original dentro de cada estado", () => {
    const names = filterEventos(lista, { filtro: "todos", query: "", now }).map((e) => e.nombre);
    expect(names).toEqual(["Hack Padel Fest", "Copa Álvaro", "Borrador X", "Liga vieja"]);
  });

  it("filtra por estado y busca sin acentos ni mayúsculas", () => {
    expect(
      filterEventos(lista, { filtro: "proximo", query: "", now }).map((e) => e.nombre)
    ).toEqual(["Copa Álvaro"]);
    expect(
      filterEventos(lista, { filtro: "todos", query: "alvaro", now }).map((e) => e.nombre)
    ).toEqual(["Copa Álvaro"]);
    expect(filterEventos(lista, { filtro: "en_curso", query: "liga", now })).toEqual([]);
  });
});
