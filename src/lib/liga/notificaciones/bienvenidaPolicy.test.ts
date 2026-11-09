import fs from "fs";
import path from "path";
import {
  TIPO_BIENVENIDA,
  claveIdempotenciaBienvenida,
  contarDestinatarios,
  decidirAlDeshabilitar,
  decidirReclamoBienvenida,
  decidirResultadoEnvioBienvenida,
  enmascararCorreo,
  enviosRealesAutorizados,
  estadoVisual,
  origenAutomaticoPermitidoPorModo,
  origenPermiteCrearBienvenida,
  puedeConsultarNotificacionesLiga,
  puedeEncolarBienvenida,
  puedeEnviarBienvenidaEnCola,
  preferenciaEfectiva,
  preferenciaTrasRecarga,
  registrarConsentimiento,
  type DestinatarioBienvenida,
  type PreferenciaNotificacion,
} from "./bienvenidaPolicy";

const LIGA = "11111111-1111-4111-8111-111111111111";
const JUGADOR = "22222222-2222-4222-8222-222222222222";
const INSCRIPCION = "33333333-3333-4333-8333-333333333333";

function destinatario(
  partial: Partial<DestinatarioBienvenida> & {
    preferencia?: DestinatarioBienvenida["preferencia"];
  } = {}
): DestinatarioBienvenida {
  return {
    email: "jugador@example.com",
    perfilesConMismoCorreo: 1,
    preferencia: null,
    sigueInscrito: true,
    esSalienteDeSustitucion: false,
    ...partial,
  };
}

function preferenciaLista(): PreferenciaNotificacion {
  return {
    adminHabilitado: true,
    consentimientoEstado: "autorizado",
    consentimientoOrigen: "manifestacion_presencial",
    consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
    correoVerificado: true,
    correoVerificacionOrigen: "enlace_de_confirmacion",
  };
}

describe("bienvenida de liga — elegibilidad", () => {
  it("1. jugador ficticio deshabilitado no se encola", () => {
    const decision = puedeEncolarBienvenida({
      destinatario: destinatario({
        email: "prueba@padel.local",
        preferencia: { adminHabilitado: false },
      }),
      ligaPausada: false,
      yaEnviado: false,
      origen: "inscripcion_confirmada",
    });
    expect(decision.encolar).toBe(false);
  });

  it("2. jugador real deshabilitado no se encola", () => {
    const decision = puedeEncolarBienvenida({
      destinatario: destinatario(),
      ligaPausada: false,
      yaEnviado: false,
      origen: "inscripcion_confirmada",
    });
    expect(decision).toEqual({
      encolar: false,
      motivo: "sin_autorizacion",
    });
    expect(estadoVisual(destinatario())).not.toBe("habilitado");
  });

  it("3. habilitado por el club sin consentimiento no se encola", () => {
    const decision = puedeEncolarBienvenida({
      destinatario: destinatario({
        preferencia: {
          adminHabilitado: true,
          correoVerificado: true,
          correoVerificacionOrigen: "enlace_de_confirmacion",
          consentimientoEstado: "sin_autorizacion",
        },
      }),
      ligaPausada: false,
      yaEnviado: false,
      origen: "accion_admin",
    });
    expect(decision).toEqual({ encolar: false, motivo: "sin_autorizacion" });
  });

  it("4. habilitado y con consentimiento documentado puede generar sin enlace", () => {
    const preferenciaSinEnlace = {
      adminHabilitado: true,
      consentimientoEstado: "autorizado" as const,
      consentimientoOrigen: "manifestacion_presencial",
      consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
      correoVerificado: false,
      correoVerificacionOrigen: null,
    };
    const decision = puedeEncolarBienvenida({
      destinatario: destinatario({ preferencia: preferenciaSinEnlace }),
      ligaPausada: false,
      yaEnviado: false,
      origen: "accion_admin",
    });
    expect(decision).toEqual({ encolar: true, motivo: null });
    expect(
      estadoVisual(destinatario({ preferencia: preferenciaSinEnlace }))
    ).toBe("habilitado");
  });

  it("5. sin correo no lanza y no encola", () => {
    expect(() =>
      puedeEncolarBienvenida({
        destinatario: destinatario({ email: null }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "inscripcion_confirmada",
      })
    ).not.toThrow();
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({ email: "  " }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "inscripcion_confirmada",
      }).motivo
    ).toBe("sin_correo");
  });

  it("6. correo inválido se omite", () => {
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({
          email: "no-es-correo",
          preferencia: preferenciaLista(),
        }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "accion_admin",
      }).motivo
    ).toBe("correo_invalido");
  });

  it("7. correo ambiguo se omite", () => {
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({
          perfilesConMismoCorreo: 2,
          preferencia: preferenciaLista(),
        }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "accion_admin",
      })
    ).toEqual({ encolar: false, motivo: "correo_ambiguo" });
  });

  it("8. la misma inscripción no produce dos claves ni un segundo envío", () => {
    const clave = claveIdempotenciaBienvenida({
      ligaId: LIGA,
      inscripcionId: INSCRIPCION,
      jugadorId: JUGADOR,
    });
    expect(
      claveIdempotenciaBienvenida({
        ligaId: LIGA,
        inscripcionId: INSCRIPCION,
        jugadorId: JUGADOR,
      })
    ).toBe(clave);
    expect(clave).toBe(
      `${TIPO_BIENVENIDA}:${LIGA}:${INSCRIPCION}:${JUGADOR}`
    );
    expect(clave.includes("@")).toBe(false);
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({ preferencia: preferenciaLista() }),
        ligaPausada: false,
        yaEnviado: true,
        origen: "inscripcion_confirmada",
      }).motivo
    ).toBe("ya_enviado");
  });

  it("9. activar después permite una bienvenida y no la duplica", () => {
    const base = {
      destinatario: destinatario({ preferencia: preferenciaLista() }),
      ligaPausada: false,
      origen: "accion_admin" as const,
    };
    expect(puedeEncolarBienvenida({ ...base, yaEnviado: false }).encolar).toBe(
      true
    );
    expect(puedeEncolarBienvenida({ ...base, yaEnviado: true }).motivo).toBe(
      "ya_enviado"
    );
  });

  it("10. deshabilitar antes de procesar cancela el pendiente", () => {
    expect(decidirAlDeshabilitar("pendiente")).toBe("pausado");
    expect(decidirAlDeshabilitar("procesando")).toBe("pausado");
    expect(decidirAlDeshabilitar("enviado")).toBe("enviado");
    expect(decidirReclamoBienvenida({ estado: "pausado", attempts: 0 })).toEqual(
      { write: false }
    );
  });

  it("11. liga pausada no envía aunque el jugador esté listo", () => {
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({ preferencia: preferenciaLista() }),
        ligaPausada: true,
        yaEnviado: false,
        origen: "accion_admin",
      }).motivo
    ).toBe("liga_pausada");
  });

  it("12. la sustitución no notifica al saliente y el entrante nace deshabilitado", () => {
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({
          preferencia: preferenciaLista(),
          sigueInscrito: false,
          esSalienteDeSustitucion: true,
        }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "inscripcion_confirmada",
      }).motivo
    ).toBe("ya_no_inscrito");

    const entrante = destinatario({ preferencia: null });
    expect(preferenciaEfectiva(entrante.preferencia).adminHabilitado).toBe(
      false
    );
    expect(
      puedeEncolarBienvenida({
        destinatario: entrante,
        ligaPausada: false,
        yaEnviado: false,
        origen: "inscripcion_confirmada",
      }).encolar
    ).toBe(false);
  });

  it("13 y 14. otro club y el anónimo no consultan", () => {
    expect(
      puedeConsultarNotificacionesLiga({
        autenticado: true,
        esOrganizadorDeLaLiga: false,
        esMasterAdmin: false,
      })
    ).toBe(false);
    expect(
      puedeConsultarNotificacionesLiga({
        autenticado: false,
        esOrganizadorDeLaLiga: false,
        esMasterAdmin: false,
      })
    ).toBe(false);
    expect(
      puedeConsultarNotificacionesLiga({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
      })
    ).toBe(true);
  });

  it("15 y 16. una consulta pública o abrir una jornada no escribe", () => {
    for (const origen of [
      "consulta_publica",
      "getLigaById",
      "vista_publica",
      "ranking",
      "historial",
      "resync",
      "render",
      "apertura_jornada",
      "jornada_cerrada",
    ]) {
      expect(origenPermiteCrearBienvenida(origen)).toBe(false);
      expect(
        puedeEncolarBienvenida({
          destinatario: destinatario({ preferencia: preferenciaLista() }),
          ligaPausada: false,
          yaEnviado: false,
          origen,
        })
      ).toEqual({ encolar: false, motivo: "origen_no_permitido" });
    }
  });

  it("17. un tipo de Torneo Express no entra en esta cola", () => {
    expect(
      puedeEncolarBienvenida({
        destinatario: destinatario({ preferencia: preferenciaLista() }),
        ligaPausada: false,
        yaEnviado: false,
        origen: "accion_admin",
        tipo: "bienvenida_torneo",
      }).motivo
    ).toBe("tipo_no_soportado");
  });

  it("18. un error temporal de Resend reintenta hasta el tercer intento", () => {
    expect(decidirResultadoEnvioBienvenida(1, "temporal")).toEqual({
      estado: "pendiente",
      reintentar: true,
      motivo: "error_temporal",
    });
    expect(decidirResultadoEnvioBienvenida(2, "temporal").reintentar).toBe(
      true
    );
    expect(decidirResultadoEnvioBienvenida(3, "temporal")).toEqual({
      estado: "error",
      reintentar: false,
      motivo: "error_temporal",
    });
  });

  it("19. un error permanente queda en error y una omisión queda omitida", () => {
    expect(decidirResultadoEnvioBienvenida(1, "permanente")).toEqual({
      estado: "error",
      reintentar: false,
      motivo: "error_permanente",
    });
    expect(
      decidirResultadoEnvioBienvenida(1, "omitir", "correo_ambiguo").estado
    ).toBe("omitido");
    expect(decidirResultadoEnvioBienvenida(1, "ok")).toEqual({
      estado: "enviado",
      reintentar: false,
      motivo: null,
    });
  });

  it("20. dos reclamos concurrentes no procesan la misma fila dos veces", () => {
    const primero = decidirReclamoBienvenida({
      estado: "pendiente",
      attempts: 0,
    });
    expect(primero).toEqual({ write: true, attempts: 1 });
    expect(
      decidirReclamoBienvenida({ estado: "procesando", attempts: 1 })
    ).toEqual({ write: false });
    expect(
      decidirReclamoBienvenida({ estado: "pendiente", attempts: 3 })
    ).toEqual({ write: false });
  });

  it("24. la preferencia guardada vuelve igual después de recargar", () => {
    const guardada = preferenciaLista();
    expect(preferenciaTrasRecarga(guardada)).toEqual(guardada);
    expect(preferenciaEfectiva(null)).toEqual({
      adminHabilitado: false,
      consentimientoEstado: "sin_autorizacion",
      consentimientoOrigen: null,
      consentimientoRegistradoAt: null,
      correoVerificado: false,
      correoVerificacionOrigen: null,
    });
  });

  it("un interruptor no convierte un correo registrado en verificado por enlace", () => {
    const preferencia = preferenciaEfectiva({
      adminHabilitado: true,
      correoVerificado: true,
      consentimientoEstado: "autorizado",
      consentimientoOrigen: "manifestacion_presencial",
      consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
    });
    expect(preferencia.correoVerificado).toBe(false);
    expect(preferencia.correoVerificacionOrigen).toBeNull();
    // Manual: con autorización + admin + correo válido sí está listo para enviar.
    expect(
      estadoVisual(
        destinatario({
          preferencia: {
            adminHabilitado: true,
            correoVerificado: true,
            consentimientoEstado: "autorizado",
            consentimientoOrigen: "manifestacion_presencial",
            consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
          },
        })
      )
    ).toBe("habilitado");
  });

  it("no acepta la inscripción ni el correo como consentimiento", () => {
    expect(
      registrarConsentimiento({
        origen: "inscripcion",
        registradoAt: "2026-11-06T12:00:00.000Z",
        actorId: "admin",
      })
    ).toEqual({ error: "origen_no_valido" });
    expect(
      registrarConsentimiento({
        origen: "tiene_correo",
        registradoAt: "2026-11-06T12:00:00.000Z",
        actorId: "admin",
      })
    ).toEqual({ error: "origen_no_valido" });
    expect(
      preferenciaEfectiva({
        adminHabilitado: true,
        correoVerificado: true,
        consentimientoEstado: "autorizado",
        consentimientoOrigen: "confirmacion_inscripcion",
        consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
      }).consentimientoEstado
    ).toBe("sin_autorizacion");
  });

  it("enmascara el correo y no escribe la dirección completa", () => {
    expect(enmascararCorreo("Ana.Lopez@Example.com")).toBe("a***@example.com");
    expect(enmascararCorreo("Ana.Lopez@Example.com")).not.toContain("lopez");
  });

  it("los envíos reales solo se aceptan con la bandera exacta", () => {
    expect(enviosRealesAutorizados(undefined)).toBe(false);
    expect(enviosRealesAutorizados("TRUE")).toBe(false);
    expect(enviosRealesAutorizados("1")).toBe(false);
    expect(enviosRealesAutorizados("true")).toBe(true);
    expect(
      puedeEnviarBienvenidaEnCola({
        destinatario: destinatario({ preferencia: preferenciaLista() }),
        ligaPausada: false,
        enviosReales: false,
      })
    ).toEqual({ enviar: false, motivo: "envios_reales_apagados" });
  });

  it("cuenta seleccionados y excluidos sin habilitar a nadie por defecto", () => {
    expect(contarDestinatarios([false, false, true])).toEqual({
      seleccionados: 1,
      excluidos: 2,
    });
  });

  it("el origen automático exige modo automatico en backend, no solo React", () => {
    expect(origenAutomaticoPermitidoPorModo("accion_admin", "manual")).toBe(
      true
    );
    expect(
      origenAutomaticoPermitidoPorModo("inscripcion_confirmada", "manual")
    ).toBe(false);
    expect(
      origenAutomaticoPermitidoPorModo("inscripcion_confirmada", "automatico")
    ).toBe(true);
  });

  it("reintento con la misma clave no crea otra identidad de envío", () => {
    const a = claveIdempotenciaBienvenida({
      ligaId: LIGA,
      inscripcionId: INSCRIPCION,
      jugadorId: JUGADOR,
    });
    const b = claveIdempotenciaBienvenida({
      ligaId: LIGA,
      inscripcionId: INSCRIPCION,
      jugadorId: JUGADOR,
    });
    expect(a).toBe(b);
    expect(decidirReclamoBienvenida({ estado: "enviado", attempts: 1 })).toEqual(
      { write: false }
    );
  });
});

describe("bienvenida de liga — artefactos de seguridad", () => {
  const root = path.join(__dirname, "../../../..");
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/0100_liga_notificaciones_bienvenida.sql"),
    "utf8"
  );
  const worker = fs.readFileSync(
    path.join(
      root,
      "supabase/functions/procesar-liga-notificaciones/index.ts"
    ),
    "utf8"
  );

  it("la migración cierra anon, exige RLS y no dispara la cola desde la inscripción", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.liga_notificaciones_queue FROM PUBLIC, anon, authenticated"
    );
    expect(sql).not.toContain(
      "GRANT SELECT ON TABLE public.liga_notificaciones_queue TO anon"
    );
    expect(sql).not.toMatch(/CREATE TRIGGER[\s\S]{0,200}liga_inscripciones/i);
    expect(sql).not.toMatch(/INTO\s+public\.notificaciones_eventos_queue/i);
    expect(sql).toContain("consentimiento_sin_evidencia");
    expect(sql).toContain("correo_sin_verificacion");
  });

  it("el worker tiene Resend detrás del flag y no toca Torneo Express", () => {
    const resend = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/resendEmail.ts"),
      "utf8"
    );
    expect(worker).toContain("sendByResend");
    expect(worker).toContain("resendEmail");
    expect(worker).toContain('LIGA_NOTIFICACIONES_ENVIOS_REALES") === "true"');
    expect(worker).toContain("enviosReales: false");
    expect(worker).toContain("escritos: 0");
    expect(worker).toContain("idempotency_key");
    expect(worker).toContain("LIGA_NOTIFICACIONES_ALLOWLIST");
    expect(worker).toContain("fuera_de_allowlist");
    expect(worker).not.toContain("correo_verificacion_origen");
    expect(worker).not.toContain("liga_notificaciones_verificacion_envio");
    expect(resend).toContain("Idempotency-Key");
    expect(resend).toContain("reply_to");
    expect(worker).not.toMatch(/from\(["']notificaciones_eventos_queue/);
  });

  it("0104 exige modo automatico en el backend para origen de inscripción", () => {
    const sql0104 = fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/0104_liga_notificaciones_worker_resend.sql"
      ),
      "utf8"
    );
    expect(sql0104).toContain("modo_manual");
    expect(sql0104).toContain("inscripcion_confirmada");
    expect(sql0104).toContain("liga_notificaciones_verificacion_envio");
    expect(sql0104).toContain("idempotency_key");
  });
});
