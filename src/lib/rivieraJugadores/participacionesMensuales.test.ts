import {
  dayOfMonthFromFecha,
  formatDetalleFechaShort,
  formatYearMonthLong,
  isFutureYearMonth,
  isSameYearMonth,
  participacionTipoEventoLabel,
  shiftYearMonth,
} from "./participacionesMensuales";

describe("shiftYearMonth", () => {
  it("avanza un mes dentro del mismo año", () => {
    expect(shiftYearMonth({ year: 2026, month: 8 }, 1)).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("retrocede un mes dentro del mismo año", () => {
    expect(shiftYearMonth({ year: 2026, month: 8 }, -1)).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("diciembre -> enero cruza el año hacia adelante", () => {
    expect(shiftYearMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
  });

  it("enero -> diciembre cruza el año hacia atrás", () => {
    expect(shiftYearMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });
});

describe("isFutureYearMonth", () => {
  const now = { year: 2026, month: 8 };

  it("el mes actual NO es futuro", () => {
    expect(isFutureYearMonth({ year: 2026, month: 8 }, now)).toBe(false);
  });

  it("un mes pasado NO es futuro", () => {
    expect(isFutureYearMonth({ year: 2026, month: 7 }, now)).toBe(false);
    expect(isFutureYearMonth({ year: 2025, month: 12 }, now)).toBe(false);
  });

  it("el mes siguiente SÍ es futuro", () => {
    expect(isFutureYearMonth({ year: 2026, month: 9 }, now)).toBe(true);
  });

  it("el mismo mes del año siguiente SÍ es futuro", () => {
    expect(isFutureYearMonth({ year: 2027, month: 1 }, now)).toBe(true);
  });
});

describe("isSameYearMonth", () => {
  it("compara año y mes", () => {
    expect(isSameYearMonth({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(
      true
    );
    expect(isSameYearMonth({ year: 2026, month: 8 }, { year: 2026, month: 7 })).toBe(
      false
    );
  });
});

describe("formatYearMonthLong", () => {
  it('formatea "Agosto 2026"', () => {
    expect(formatYearMonthLong({ year: 2026, month: 8 })).toBe("Agosto 2026");
  });

  it('formatea "Enero 2027"', () => {
    expect(formatYearMonthLong({ year: 2027, month: 1 })).toBe("Enero 2027");
  });
});

describe("formatDetalleFechaShort", () => {
  it('formatea "08 AGO" desde YYYY-MM-DD', () => {
    expect(formatDetalleFechaShort("2026-08-08")).toBe("08 AGO");
  });

  it("es tolerante a timestamps ISO completos", () => {
    expect(formatDetalleFechaShort("2026-08-08T00:00:00.000Z")).toBe("08 AGO");
  });
});

describe("dayOfMonthFromFecha", () => {
  it("extrae el día sin conversión de zona horaria", () => {
    expect(dayOfMonthFromFecha("2026-08-31")).toBe(31);
  });

  it("retorna null si el formato es inválido", () => {
    expect(dayOfMonthFromFecha("no-es-fecha")).toBeNull();
  });
});

describe("participacionTipoEventoLabel", () => {
  it("traduce las 5 modalidades oficiales", () => {
    expect(participacionTipoEventoLabel("reta")).toBe("Reta");
    expect(participacionTipoEventoLabel("duelo_2v2")).toBe("Duelo 2v2");
    expect(participacionTipoEventoLabel("americano")).toBe("Americano");
    expect(participacionTipoEventoLabel("torneo_express")).toBe("Torneo Express");
    expect(participacionTipoEventoLabel("liga")).toBe("Liga");
  });

  it("modalidad futura desconocida cae en fallback (muestra el valor crudo, no rompe UI)", () => {
    expect(participacionTipoEventoLabel("padel_relampago_2027")).toBe(
      "padel_relampago_2027"
    );
  });
});
