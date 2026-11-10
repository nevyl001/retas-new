import type {
  ColaNotificacionRow,
  HistorialNotificacionRow,
} from "../../../services/ligaNotificacionesService";
import {
  HISTORIAL_PAGE_SIZE,
  agruparHistorialPorDiaCdmx,
  calcularResumenPeriodoHistorial,
  clasificarFiltroEstadoHistorial,
  coincideBusquedaHistorial,
  determinarFechaEfectivaHistorial,
  etiquetaPeriodoMensual,
  filtrarYPaginarHistorialPeriodo,
  mesActualCdmx,
  navegarMesHistorial,
  periodoDeInstanteCdmx,
  rangoMesCdmx,
  resolverDiasExpandidosHistorial,
  unificarRegistrosHistorial,
} from "./historialPeriodo";

describe("historialPeriodo — dominio de historial mensual y diario (CDMX)", () => {
  const nombres = new Map<string, string>([
    ["jug-1", "Saúl Moreno"],
    ["jug-2", "Axel A"],
    ["jug-3", "Mauricio Moreno"],
    ["jug-4", "Zaid"],
  ]);

  it("1. obtiene el mes actual en America/Mexico_City por defecto", () => {
    const instante = new Date("2026-11-10T19:30:00.000Z"); // 13:30 CDMX
    const actual = mesActualCdmx(instante);
    expect(actual).toEqual({ year: 2026, month: 11 });
    expect(etiquetaPeriodoMensual(actual)).toBe("NOVIEMBRE 2026");
  });

  it("2. respeta cambio de mes con horarios cercanos a medianoche CDMX (UTC-6)", () => {
    // 2026-11-01T05:59:59Z es 2026-10-31 23:59:59 en Ciudad de México (octubre)
    const finOctubreCdmx = periodoDeInstanteCdmx("2026-11-01T05:59:59.000Z");
    expect(finOctubreCdmx).toEqual({ year: 2026, month: 10 });

    // 2026-11-01T06:00:00Z es 2026-11-01 00:00:00 en Ciudad de México (noviembre)
    const inicioNoviembreCdmx = periodoDeInstanteCdmx(
      "2026-11-01T06:00:00.000Z"
    );
    expect(inicioNoviembreCdmx).toEqual({ year: 2026, month: 11 });

    const rangoNov = rangoMesCdmx({ year: 2026, month: 11 });
    expect(rangoNov.desdeIso).toBe("2026-11-01T06:00:00.000Z");
    expect(rangoNov.hastaIso).toBe("2026-12-01T06:00:00.000Z");
  });

  it("3. navega correctamente diciembre → enero y enero → diciembre", () => {
    const dic2026 = { year: 2026, month: 12 };
    const ene2027 = navegarMesHistorial(dic2026, 1);
    expect(ene2027).toEqual({ year: 2027, month: 1 });
    expect(etiquetaPeriodoMensual(ene2027)).toBe("ENERO 2027");

    const vueltaDic2026 = navegarMesHistorial(ene2027, -1);
    expect(vueltaDic2026).toEqual({ year: 2026, month: 12 });
    expect(etiquetaPeriodoMensual(vueltaDic2026)).toBe("DICIEMBRE 2026");

    const ene2026 = { year: 2026, month: 1 };
    const dic2025 = navegarMesHistorial(ene2026, -1);
    expect(dic2025).toEqual({ year: 2025, month: 12 });
    expect(etiquetaPeriodoMensual(dic2025)).toBe("DICIEMBRE 2025");
  });

  it("4, 5, 6 y 7. agrupa por día en America/Mexico_City, expande solo el más reciente y permite abrir/cerrar manualmente", () => {
    const logs: HistorialNotificacionRow[] = [
      {
        id: "log-dia-10-a",
        liga_jugador_id: "jug-1",
        tipo: "bienvenida",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T18:00:00.000Z", // Martes 10 nov 12:00 CDMX
      },
      {
        id: "log-dia-10-b",
        liga_jugador_id: "jug-2",
        tipo: "jornada",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-11T04:30:00.000Z", // Sigue siendo Martes 10 nov 22:30 CDMX
        jornada_numero: 2,
      },
      {
        id: "log-dia-09",
        liga_jugador_id: "jug-3",
        tipo: "resultados_jornada",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-09T16:00:00.000Z", // Lunes 9 nov 10:00 CDMX
        jornada_numero: 1,
      },
      {
        id: "log-dia-07",
        liga_jugador_id: "jug-4",
        tipo: "bienvenida",
        estado: "error",
        attempts: 2,
        motivo: "error_proveedor",
        proveedor_estado: null,
        created_at: "2026-11-07T15:00:00.000Z", // Sábado 7 nov 09:00 CDMX
      },
    ];

    const unificados = unificarRegistrosHistorial({
      logs,
      cola: [],
      nombresPorJugadorId: nombres,
    });
    const grupos = agruparHistorialPorDiaCdmx(unificados);

    expect(grupos).toHaveLength(3);
    expect(grupos.map((g) => g.diaClave)).toEqual([
      "2026-11-10",
      "2026-11-09",
      "2026-11-07",
    ]);
    expect(grupos[0].etiquetaDia).toBe("MARTES 10 DE NOVIEMBRE");
    expect(grupos[0].etiquetaConteo).toBe("2 comunicaciones");
    expect(grupos[1].etiquetaDia).toBe("LUNES 9 DE NOVIEMBRE");
    expect(grupos[1].etiquetaConteo).toBe("1 comunicación");

    // Por defecto: día más reciente expandido, anteriores contraídos
    const expandidosPorDefecto = resolverDiasExpandidosHistorial(grupos, {});
    expect(expandidosPorDefecto).toEqual({
      "2026-11-10": true,
      "2026-11-09": false,
      "2026-11-07": false,
    });

    // Abrir manualmente el 9 de noviembre y cerrar el 10 de noviembre
    const expandidosManual = resolverDiasExpandidosHistorial(grupos, {
      "2026-11-10": false,
      "2026-11-09": true,
    });
    expect(expandidosManual).toEqual({
      "2026-11-10": false,
      "2026-11-09": true,
      "2026-11-07": false,
    });
  });

  it("8 y 9. determina fecha efectiva correcta para aceptados, pendientes programados, procesando, errores, pruebas y sin fecha", () => {
    const aceptado = determinarFechaEfectivaHistorial({
      fuente: "log",
      estado: "enviado",
      tipo: "bienvenida",
      proveedor_estado: "aceptado",
      created_at: "2026-11-10T18:30:00.000Z",
    });
    expect(aceptado.tipoFecha).toBe("enviado");
    expect(aceptado.diaClaveCdmx).toBe("2026-11-10");
    expect(aceptado.etiquetaFecha).toContain("Enviado");

    const programado = determinarFechaEfectivaHistorial({
      fuente: "cola",
      estado: "pendiente",
      tipo: "recordatorio_jornada",
      created_at: "2026-11-10T15:00:00.000Z",
      programado_para: "2026-11-12T01:00:00.000Z", // Miércoles 11 nov 19:00 CDMX
    });
    expect(programado.tipoFecha).toBe("programado");
    // Usa programado_para (11 de nov en CDMX), NO created_at (10 de nov)
    expect(programado.diaClaveCdmx).toBe("2026-11-11");
    expect(programado.etiquetaFecha).toContain("Programado");
    expect(programado.etiquetaFecha).toContain("(Ciudad de México)");

    const procesando = determinarFechaEfectivaHistorial({
      fuente: "cola",
      estado: "procesando",
      tipo: "jornada",
      updated_at: "2026-11-10T20:00:00.000Z",
    });
    expect(procesando.tipoFecha).toBe("procesando");
    expect(procesando.etiquetaFecha).toContain("Procesando");

    const error = determinarFechaEfectivaHistorial({
      fuente: "log",
      estado: "error",
      tipo: "bienvenida",
      motivo: "error_proveedor",
      created_at: "2026-11-10T21:00:00.000Z",
    });
    expect(error.tipoFecha).toBe("error");
    expect(error.etiquetaFecha).toContain("Intento");

    const prueba = determinarFechaEfectivaHistorial({
      fuente: "log",
      estado: "enviado",
      tipo: "prueba",
      proveedor_estado: "aceptado",
      created_at: "2026-11-10T22:00:00.000Z",
    });
    expect(prueba.tipoFecha).toBe("prueba");
    expect(prueba.etiquetaFecha).toContain("Prueba enviada");

    const sinFecha = determinarFechaEfectivaHistorial({
      fuente: "cola",
      estado: "pendiente",
      tipo: "bienvenida",
      created_at: null,
      programado_para: null,
    });
    expect(sinFecha.tipoFecha).toBe("sin_fecha");
    expect(sinFecha.timestampMs).toBeNull();
    expect(sinFecha.etiquetaFecha).toBe("Sin fecha registrada");
  });

  it("10, 11 y 12. busca por nombre de jugador (con o sin acentos), tipo de comunicación y número de jornada", () => {
    const logs: HistorialNotificacionRow[] = [
      {
        id: "l-1",
        liga_jugador_id: "jug-1",
        tipo: "bienvenida",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T18:00:00.000Z",
      },
      {
        id: "l-2",
        liga_jugador_id: "jug-2",
        tipo: "recordatorio_jornada",
        origen: "automatico",
        jornada_numero: 2,
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T19:00:00.000Z",
      },
      {
        id: "l-3",
        liga_jugador_id: "jug-3",
        tipo: "resultados_jornada",
        origen: "automatico",
        jornada_numero: 5,
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T20:00:00.000Z",
      },
    ];
    const registros = unificarRegistrosHistorial({
      logs,
      cola: [],
      nombresPorJugadorId: nombres,
    });

    // Búsqueda por jugador ("saul" sin tilde encuentra "Saúl Moreno")
    expect(
      registros.filter((r) => coincideBusquedaHistorial(r, "saul")).map((r) => r.logId)
    ).toEqual(["l-1"]);

    // Búsqueda por tipo ("recordatorio", "resultados")
    expect(
      registros
        .filter((r) => coincideBusquedaHistorial(r, "Recordatorio"))
        .map((r) => r.logId)
    ).toEqual(["l-2"]);
    expect(
      registros
        .filter((r) => coincideBusquedaHistorial(r, "Resultados de jornada"))
        .map((r) => r.logId)
    ).toEqual(["l-3"]);

    // Búsqueda por jornada ("Jornada 2" y "2")
    expect(
      registros
        .filter((r) => coincideBusquedaHistorial(r, "Jornada 2"))
        .map((r) => r.logId)
    ).toEqual(["l-2"]);
    expect(
      registros.filter((r) => coincideBusquedaHistorial(r, "2")).map((r) => r.logId)
    ).toEqual(["l-2"]);
  });

  it("13, 14, 15 y 16. filtra correctamente ACEPTADOS, PENDIENTES, ERRORES y PRUEBAS sin mezclar exclusiones", () => {
    const logs: HistorialNotificacionRow[] = [
      {
        id: "log-ok",
        liga_jugador_id: "jug-1",
        tipo: "bienvenida",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T18:00:00.000Z",
      },
      {
        id: "log-err",
        liga_jugador_id: "jug-2",
        tipo: "jornada",
        estado: "error",
        attempts: 2,
        motivo: "error_proveedor",
        proveedor_estado: null,
        created_at: "2026-11-10T18:10:00.000Z",
      },
      {
        id: "log-test",
        liga_jugador_id: null,
        tipo: "prueba",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        proveedor_estado: "aceptado",
        created_at: "2026-11-10T18:20:00.000Z",
      },
    ];
    const cola: ColaNotificacionRow[] = [
      {
        id: "q-pend",
        liga_jugador_id: "jug-3",
        tipo: "recordatorio_jornada",
        origen: "automatico",
        estado: "pendiente",
        attempts: 0,
        motivo: null,
        programado_para: "2026-11-11T18:00:00.000Z",
      },
      {
        id: "q-proc",
        liga_jugador_id: "jug-4",
        tipo: "bienvenida",
        origen: "manual",
        estado: "procesando",
        attempts: 1,
        motivo: null,
        updated_at: "2026-11-10T18:30:00.000Z",
      },
      {
        id: "q-excl",
        liga_jugador_id: "jug-4",
        tipo: "bienvenida",
        estado: "omitido",
        attempts: 0,
        motivo: "sin_autorizacion",
        created_at: "2026-11-10T18:00:00.000Z",
      },
    ];

    expect(
      clasificarFiltroEstadoHistorial({
        estado: "omitido",
        motivo: "sin_autorizacion",
      })
    ).toBe("exclusion");

    const registros = unificarRegistrosHistorial({
      logs,
      cola,
      nombresPorJugadorId: nombres,
    });
    const periodo = { year: 2026, month: 11 };

    const todos = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "todos",
      busqueda: "",
      page: 0,
    });
    // Incluye aceptado, error, prueba, pendiente y procesando; excluye sin_autorizacion
    expect(todos.totalFiltrados).toBe(5);
    expect(todos.resumenPeriodo).toEqual({
      aceptados: 1,
      pendientes: 1,
      errores: 1,
      pruebas: 1,
    });

    const aceptados = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "aceptados",
      busqueda: "",
      page: 0,
    });
    expect(aceptados.registrosPagina.map((r) => r.claveUnica)).toEqual(["log-ok"]);

    const pendientes = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "pendientes",
      busqueda: "",
      page: 0,
    });
    expect(pendientes.registrosPagina.map((r) => r.claveUnica)).toEqual([
      "cola-q-pend",
    ]);

    const errores = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "errores",
      busqueda: "",
      page: 0,
    });
    expect(errores.registrosPagina.map((r) => r.claveUnica)).toEqual(["log-err"]);

    const pruebas = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "pruebas",
      busqueda: "",
      page: 0,
    });
    expect(pruebas.registrosPagina.map((r) => r.claveUnica)).toEqual(["log-test"]);
  });

  it("17 y 20. pagina 1,000 registros simulados de 20 en 20 sin duplicados y mantiene resumen total del período", () => {
    const logs: HistorialNotificacionRow[] = Array.from(
      { length: 1000 },
      (_, idx) => {
        const dia = (idx % 28) + 1;
        const hora = idx % 24;
        const minuto = idx % 60;
        const iso = `2026-11-${String(dia).padStart(2, "0")}T${String(
          hora
        ).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00.000Z`;
        const esError = idx % 10 === 0;
        return {
          id: `log-masivo-${String(idx).padStart(4, "0")}`,
          liga_jugador_id: "jug-1",
          tipo: idx % 3 === 0 ? "recordatorio_jornada" : "bienvenida",
          jornada_numero: (idx % 8) + 1,
          estado: esError ? "error" : "enviado",
          attempts: 1,
          motivo: esError ? "error_proveedor" : null,
          proveedor_estado: esError ? null : "aceptado",
          created_at: iso,
        };
      }
    );

    const registros = unificarRegistrosHistorial({
      logs,
      cola: [],
      nombresPorJugadorId: nombres,
    });
    const periodo = { year: 2026, month: 11 };

    const pagina0 = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "todos",
      busqueda: "",
      page: 0,
      pageSize: HISTORIAL_PAGE_SIZE,
    });

    expect(pagina0.registrosPagina).toHaveLength(20);
    expect(pagina0.hasMore).toBe(true);
    expect(pagina0.totalPeriodo).toBe(pagina0.totalFiltrados);
    // El resumen refleja todo el mes, no solo las primeras 20 filas
    expect(
      pagina0.resumenPeriodo.aceptados + pagina0.resumenPeriodo.errores
    ).toBe(pagina0.totalPeriodo);
    expect(pagina0.resumenPeriodo.aceptados).toBeGreaterThan(20);

    const pagina1 = filtrarYPaginarHistorialPeriodo({
      registros,
      periodo,
      filtro: "todos",
      busqueda: "",
      page: 1,
      pageSize: HISTORIAL_PAGE_SIZE,
    });
    expect(pagina1.registrosPagina).toHaveLength(40);
    const clavesUnicas = new Set(pagina1.registrosPagina.map((r) => r.claveUnica));
    expect(clavesUnicas.size).toBe(40);
    // Los primeros 20 mantienen exactamente su orden al cargar más
    expect(pagina1.registrosPagina.slice(0, 20).map((r) => r.claveUnica)).toEqual(
      pagina0.registrosPagina.map((r) => r.claveUnica)
    );

    const resumenManual = calcularResumenPeriodoHistorial(
      registros.filter((r) => r.fechaEfectiva.monthCdmx === 11)
    );
    expect(pagina0.resumenPeriodo).toEqual(resumenManual);
  });
});

