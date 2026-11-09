import { supabase } from "../lib/supabaseClient";
import {
  cargarNotificacionesLiga,
  guardarConfigLiga,
  encolarBienvenidaTrasInscripcion,
  esEsquemaAusente,
  establecerCorreoVerificado,
  solicitarBienvenidaJugador,
  registrarConsentimientoJugador,
  solicitarComunicacionManual,
  descartarCorreosNoEnviados,
  solicitarProcesamientoLote,
  solicitarVerificacionCorreo,
  simulacionNotificacionesClienteActiva,
} from "./ligaNotificacionesService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

function chainResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.order = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.maybeSingle = jest.fn(async () => result);
  // thenable for await supabase.from(...).select().eq()
  (chain as { then?: unknown }).then = (
    resolve: (value: unknown) => unknown
  ) => Promise.resolve(resolve(result));
  return chain;
}

describe("ligaNotificacionesService", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    invoke.mockReset();
  });

  it("el lote manual viaja en p_lote_id y no se envía solo", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, encolado: true, motivo: null },
      error: null,
    });
    await solicitarComunicacionManual({
      ligaId: "liga-1",
      jugadorId: "jug-1",
      tipo: "aviso_general",
      asunto: "Aviso",
      cuerpo: "Hola",
      loteId: "11111111-1111-4111-8111-111111111111",
    });
    expect(rpc).toHaveBeenCalledWith("encolar_comunicacion_manual_liga", {
      p_liga_id: "liga-1",
      p_liga_jugador_id: "jug-1",
      p_tipo: "aviso_general",
      p_asunto: "Aviso",
      p_cuerpo: "Hola",
      p_lote_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("pide procesar solo el lote y no trata un apagado como entrega", async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        enviosReales: false,
        enviados: 0,
        omitidos: 0,
        errores: 0,
        procesados: 0,
        motivo: "envios_apagados",
      },
      error: null,
    });
    await expect(
      solicitarProcesamientoLote({
        ligaId: "liga-1",
        loteId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({
      ok: true,
      enviosReales: false,
      enviados: 0,
      omitidos: 0,
      errores: 0,
      procesados: 0,
      fueraAllowlist: 0,
      pendientes: 0,
      motivo: "envios_apagados",
    });
    expect(invoke).toHaveBeenCalledWith("procesar-lote-liga-notificaciones", {
      body: {
        liga_id: "liga-1",
        lote_id: "11111111-1111-4111-8111-111111111111",
        reintentar: false,
        tipo: undefined,
        jugadores: [],
      },
      timeout: 55000,
    });
  });

  it("401, 500 y timeout del lote no se reportan como entrega", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "unauthorized", context: { status: 401 } },
    });
    await expect(
      solicitarProcesamientoLote({
        ligaId: "liga-1",
        loteId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toMatchObject({ ok: false, enviados: 0, motivo: "sesion_invalida" });

    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "fallo", context: { status: 500 } },
    });
    await expect(
      solicitarProcesamientoLote({
        ligaId: "liga-1",
        loteId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toMatchObject({
      ok: false,
      enviados: 0,
      motivo: "procesador_no_disponible",
    });

    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: "AbortError" },
    });
    await expect(
      solicitarProcesamientoLote({
        ligaId: "liga-1",
        loteId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toMatchObject({
      ok: false,
      enviados: 0,
      motivo: "procesador_no_disponible",
    });
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("pide quitar solo los no enviados y no llama al worker", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, descartados: 3 },
      error: null,
    });
    await expect(
      descartarCorreosNoEnviados({ ligaId: "liga-1" })
    ).resolves.toEqual({ ok: true, descartados: 3, motivo: null });
    expect(invoke).toHaveBeenCalledWith(
      "descartar-liga-notificaciones-no-enviadas",
      {
        body: {
          liga_id: "liga-1",
          queue_id: undefined,
          log_id: undefined,
        },
      }
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "procesar-liga-notificaciones",
      expect.anything()
    );
  });

  it("Fase 1: la inscripción no auto-encola (manual / auto real apagado)", async () => {
    await expect(
      encolarBienvenidaTrasInscripcion("liga", "jugador")
    ).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(esEsquemaAusente("Could not find the function")).toBe(true);
  });

  it("un jugador no elegible no queda marcado como encolado", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, encolado: false, motivo: "deshabilitado" },
      error: null,
    });
    await expect(solicitarBienvenidaJugador("liga", "jugador")).resolves.toEqual({
      ok: false,
      encolado: false,
      motivo: "deshabilitado",
    });
  });

  it("no escribe una verificación de correo que el administrador no puede acreditar", async () => {
    await expect(
      establecerCorreoVerificado({
        ligaId: "liga",
        jugadorId: "jugador",
        rivieraJugadorId: null,
        verificado: true,
      })
    ).resolves.toEqual({ ok: false, motivo: "correo_sin_verificacion" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no conserva un motivo que no sea un código", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, encolado: false, motivo: "ana@example.com" },
      error: null,
    });
    const resultado = await solicitarBienvenidaJugador("liga", "jugador");
    expect(resultado.motivo).toBe("no_disponible");
  });

  it("ignora enlace_simulado si el build de cliente no autoriza simulación", async () => {
    expect(simulacionNotificacionesClienteActiva()).toBe(false);
    rpc.mockResolvedValue({
      data: {
        ok: true,
        simulado: true,
        solicitud_id: "sol-1",
        enlace_simulado:
          "https://appriviera.rivieraopen.com/public/verificar-correo?t=" +
          "a".repeat(64),
      },
      error: null,
    });
    await expect(
      solicitarVerificacionCorreo({ ligaId: "liga", jugadorId: "jugador" })
    ).resolves.toEqual({
      ok: true,
      motivo: null,
      simulado: false,
      enlaceSimulado: null,
      solicitudId: "sol-1",
    });
  });

  it("0100 sin columnas 0101 mantiene escriturasActivas para los toggles", async () => {
    const prefs0101 = chainResult({
      data: null,
      error: {
        message:
          "column liga_notificaciones_preferencias.correo_verificacion_origen does not exist",
      },
    });
    const prefs0100 = chainResult({
      data: [
        {
          liga_jugador_id: "jug-1",
          riviera_jugador_id: null,
          admin_habilitado: false,
          consentimiento_estado: "sin_autorizacion",
          consentimiento_origen: null,
          consentimiento_registrado_at: null,
          correo_verificado: false,
        },
      ],
      error: null,
    });
    const config = chainResult({
      data: { bienvenida_pausada: true, modo_prueba: true },
      error: {
        message: "column liga_notificaciones_config.modo_operacion does not exist",
      },
    });
    const configRetry = chainResult({
      data: { bienvenida_pausada: true, modo_prueba: true },
      error: null,
    });
    const vacio = chainResult({ data: [], error: null });
    const sinTabla = chainResult({
      data: null,
      error: {
        message:
          "Could not find the table liga_notificaciones_verificaciones in the schema cache",
      },
    });

    let prefsCalls = 0;
    let configCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === "liga_notificaciones_preferencias") {
        prefsCalls += 1;
        return prefsCalls === 1 ? prefs0101 : prefs0100;
      }
      if (table === "liga_notificaciones_config") {
        configCalls += 1;
        return configCalls === 1 ? config : configRetry;
      }
      if (table === "liga_notificaciones_verificaciones") return sinTabla;
      return vacio;
    });

    const snap = await cargarNotificacionesLiga("liga-1");
    expect(snap.disponible).toBe(true);
    expect(snap.escriturasActivas).toBe(true);
    expect(snap.verificacionDisponible).toBe(false);
    expect(snap.preferencias).toHaveLength(1);
    expect(snap.preferencias[0].admin_habilitado).toBe(false);
    expect(snap.preferencias[0].correo_verificacion_origen).toBeNull();
    expect(snap.preferencias[0].correo_verificado_email).toBeNull();
    expect(snap.config.modo_operacion).toBe("manual");
  });

  it("conserva modo y automatizaciones si falta la supervisión", async () => {
    const fallo = chainResult({
      data: null,
      error: {
        message:
          "column liga_notificaciones_config.supervision_email does not exist",
      },
    });
    const config = chainResult({
      data: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "automatico",
        resultados_auto: true,
        resultados_espera_minutos: 15,
        recordatorio_auto: true,
        recordatorio_horas: 12,
        bienvenida_auto: false,
      },
      error: null,
    });
    const vacio = chainResult({ data: [], error: null });
    let configCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === "liga_notificaciones_config") {
        configCalls += 1;
        return configCalls === 1 ? fallo : config;
      }
      return vacio;
    });

    const snap = await cargarNotificacionesLiga("liga-1");
    expect(snap.config.modo_operacion).toBe("automatico");
    expect(snap.config.resultados_auto).toBe(true);
    expect(snap.config.resultados_espera_minutos).toBe(15);
    expect(snap.config.recordatorio_auto).toBe(true);
    expect(snap.config.recordatorio_horas).toBe(12);
    expect(snap.config.bienvenida_auto).toBe(false);
  });

  it("no descarta las automatizaciones cuando falta la columna de modo", async () => {
    const payloads: Record<string, unknown>[] = [];
    from.mockImplementation(() => ({
      upsert: jest.fn(async (payload: Record<string, unknown>) => {
        payloads.push(payload);
        if ("modo_operacion" in payload) {
          return {
            error: {
              message:
                "column liga_notificaciones_config.modo_operacion does not exist",
            },
          };
        }
        return { error: null };
      }),
    }));

    const resultado = await guardarConfigLiga("liga-1", {
      bienvenida_pausada: true,
      modo_prueba: true,
      modo_operacion: "manual",
      resultados_auto: true,
      resultados_espera_minutos: 15,
      recordatorio_auto: false,
      recordatorio_horas: 24,
      bienvenida_auto: false,
    });

    expect(resultado).toEqual({ ok: true, motivo: null });
    expect(payloads[1]).toMatchObject({
      resultados_auto: true,
      resultados_espera_minutos: 15,
    });
    expect(payloads[1]).not.toHaveProperty("modo_operacion");
  });

  it("0101 con columnas de verificación normaliza y mantiene escriturasActivas", async () => {
    const prefs0101 = chainResult({
      data: [
        {
          liga_jugador_id: "jug-2",
          riviera_jugador_id: "riv-2",
          admin_habilitado: true,
          consentimiento_estado: "autorizado",
          consentimiento_origen: "manifestacion_presencial",
          consentimiento_registrado_at: "2026-01-01T00:00:00.000Z",
          correo_verificado: true,
          correo_verificacion_origen: "enlace_de_confirmacion",
          correo_verificado_email: "saul@example.com",
        },
      ],
      error: null,
    });
    const config = chainResult({
      data: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      error: null,
    });
    const vacio = chainResult({ data: [], error: null });

    from.mockImplementation((table: string) => {
      if (table === "liga_notificaciones_preferencias") return prefs0101;
      if (table === "liga_notificaciones_config") return config;
      return vacio;
    });

    const snap = await cargarNotificacionesLiga("liga-2");
    expect(snap.escriturasActivas).toBe(true);
    expect(snap.verificacionDisponible).toBe(true);
    expect(snap.preferencias[0]).toMatchObject({
      admin_habilitado: true,
      correo_verificado: true,
      correo_verificacion_origen: "enlace_de_confirmacion",
      correo_verificado_email: "saul@example.com",
    });
  });

  it("no sobrescribe una revocación al documentar autorización", async () => {
    from.mockImplementation(() =>
      chainResult({
        data: { consentimiento_estado: "revocado" },
        error: null,
      })
    );
    await expect(
      registrarConsentimientoJugador({
        ligaId: "liga-1",
        jugadorId: "jug-1",
        rivieraJugadorId: null,
        origen: "mensaje_del_jugador",
        registradoAt: "2026-11-01T12:00:00.000Z",
      })
    ).resolves.toEqual({ ok: false, motivo: "revocado" });
  });
});
