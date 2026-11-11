import fs from "fs";
import path from "path";
import {
  CONFIG_AUTOMATICA_INICIAL,
  claveBienvenida,
  claveRecordatorio,
  claveResultados,
  completarConfigAutomatica,
  construirCorreoResultados,
  debeEnviarBienvenida,
  extraerUrlPublicaJornada,
  falloProveedor,
  horaDeRondaUno,
  manualSigueDisponible,
  normalizarEsperaResultados,
  plantillaResuelta,
  programadoResultados,
  programarRecordatorio,
  puedeProgramarResultados,
  reclamarTrabajo,
  reclamarUnaVez,
  recordatorioDebeCancelarse,
  rutaRelativaJornada,
  sustituirVariablesCorreo,
  urlPublicaJornada,
  urlPublicaJornadaValida,
} from "./automatizacion";

const LIGA = "11111111-1111-4111-8111-111111111111";
const JORNADA = "22222222-2222-4222-8222-222222222222";
const JUGADOR = "33333333-3333-4333-8333-333333333333";
const BASE = "https://appriviera.rivieraopen.com";
const URL = `${BASE}/public/liga/${LIGA}/jornada/4`;

describe("automatización de comunicaciones", () => {
  it("1. la configuración nace apagada y se recupera sin activar nada", () => {
    expect(CONFIG_AUTOMATICA_INICIAL).toEqual({
      resultados_auto: false,
      resultados_espera_minutos: 5,
      recordatorio_auto: false,
      recordatorio_horas: 24,
      bienvenida_auto: false,
    });
    expect(completarConfigAutomatica({}).resultados_auto).toBe(false);
    expect(normalizarEsperaResultados(15)).toBe(15);
    expect(normalizarEsperaResultados(9)).toBe(5);
    expect(completarConfigAutomatica({ recordatorio_horas: "6" as unknown as 6 }).recordatorio_horas).toBe(6);
    expect(completarConfigAutomatica({ recordatorio_horas: 6 }).recordatorio_horas).toBe(6);
  });

  it("2. el manual sigue disponible con automatizaciones activas", () => {
    expect(manualSigueDisponible({
      ...CONFIG_AUTOMATICA_INICIAL,
      resultados_auto: true,
      recordatorio_auto: true,
      bienvenida_auto: true,
    })).toBe(true);
  });

  it("3 y 4. solo una jornada cerrada y completa programa resultados", () => {
    const abierta = puedeProgramarResultados({
      estadoJornada: "in_progress",
      partidos: [{ estado: "completed" }],
      automatizacionActiva: true,
      urlPublica: URL,
    });
    expect(abierta).toEqual({ ok: false, motivo: "jornada_no_finalizada" });

    const pendiente = puedeProgramarResultados({
      estadoJornada: "completed",
      partidos: [
        { estado: "completed", fase: "semifinal" },
        { estado: "upcoming", fase: "final", bracket_slot: "FINAL" },
      ],
      automatizacionActiva: true,
      urlPublica: URL,
    });
    expect(pendiente).toEqual({ ok: false, motivo: "partidos_pendientes" });
  });

  it("5 y 6. el envío espera el cierre oficial, con 5 minutos por defecto", () => {
    const cierre = new Date("2026-11-09T22:00:00.000Z");
    expect(programadoResultados(cierre, undefined).toISOString()).toBe("2026-11-09T22:05:00.000Z");
    expect(programadoResultados(cierre, 0).toISOString()).toBe(cierre.toISOString());
    expect(programadoResultados(cierre, 15).toISOString()).toBe("2026-11-09T22:15:00.000Z");
    const antes = reclamarTrabajo({
      estado: "pendiente",
      programadoPara: programadoResultados(cierre, 5),
      ahora: new Date("2026-11-09T22:04:00.000Z"),
      attempts: 0,
    });
    expect(antes).toBe("esperando");
    const aTiempo = reclamarTrabajo({
      estado: "pendiente",
      programadoPara: programadoResultados(cierre, 5),
      ahora: new Date("2026-11-09T22:05:00.000Z"),
      attempts: 0,
    });
    expect(aTiempo).toBe("reclamado");
  });

  it("7 y 8. la misma jornada y destinatario no se reclaman dos veces", () => {
    const clave = claveResultados(LIGA, JORNADA, JUGADOR);
    expect(clave).toBe(claveResultados(LIGA, JORNADA, JUGADOR));
    expect(claveRecordatorio(LIGA, JORNADA, JUGADOR)).not.toBe(clave);
    expect(reclamarTrabajo({
      estado: "enviado",
      programadoPara: null,
      ahora: new Date(),
      attempts: 1,
    })).toBe("cerrado");
    const primero = reclamarUnaVez(["pendiente", "pendiente"]);
    expect(primero.ganador).toBe(0);
    const segundo = reclamarUnaVez(primero.estados);
    expect(segundo.ganador).toBe(1);
    expect(reclamarUnaVez(["procesando"]).ganador).toBeNull();
  });

  it("9 y 10. un fallo ambiguo no se reintenta; uno temporal sí, hasta tres", () => {
    expect(falloProveedor(0, false)).toEqual({
      reintentar: false,
      motivo: "respuesta_ambigua",
    });
    expect(falloProveedor(503, false).reintentar).toBe(true);
    expect(falloProveedor(0, true).reintentar).toBe(true);
    expect(reclamarTrabajo({
      estado: "pendiente",
      programadoPara: null,
      ahora: new Date(),
      attempts: 3,
    })).toBe("agotado");
  });

  it("11 y 12. un recordatorio se cancela al cerrar y se mueve si cambia la hora", () => {
    expect(recordatorioDebeCancelarse("completed", "2026-11-12")).toBe(true);
    expect(recordatorioDebeCancelarse("upcoming", null)).toBe(true);
    const horario = {
      fecha: "2026-11-12",
      horaInicio: "18:00",
      estado: "upcoming",
    };
    const original = programarRecordatorio({
      horario,
      horas: 24,
      ahora: new Date("2026-11-10T12:00:00.000Z"),
      automatizacionActiva: true,
    });
    const movido = programarRecordatorio({
      horario: { ...horario, horaInicio: "20:00" },
      horas: 24,
      ahora: new Date("2026-11-10T12:00:00.000Z"),
      automatizacionActiva: true,
    });
    if (!original.ok || !movido.ok) {
      throw new Error("el recordatorio debio programarse");
    }
    expect(movido.cuando.getTime()).toBeGreaterThan(original.cuando.getTime());
    expect(programarRecordatorio({
      horario: { ...horario, estado: "completed" },
      horas: 2,
      ahora: new Date("2026-11-10T12:00:00.000Z"),
      automatizacionActiva: true,
    })).toEqual({ ok: false, motivo: "jornada_finalizada" });
  });

  it("13. el enlace público abre la jornada y no el panel admin", () => {
    expect(urlPublicaJornada(BASE, LIGA, 4)).toBe(URL);
    expect(urlPublicaJornadaValida(URL)).toBe(true);
    expect(urlPublicaJornadaValida(`${BASE}/liga/${LIGA}/jornada/4`)).toBe(false);
    expect(rutaRelativaJornada(LIGA, 4)).toBe(`/public/liga/${LIGA}/jornada/4`);
    expect(extraerUrlPublicaJornada(`RESULTADOS_URL:/public/liga/${LIGA}/jornada/4`, BASE)).toBe(URL);
    expect(extraerUrlPublicaJornada(`RESULTADOS_URL:/liga/${LIGA}/jornada/4`, BASE)).toBeNull();
  });

  it("14 y 15. sustituye variables, escapa HTML y no deja Markdown", () => {
    const correo = construirCorreoResultados({
      nombre: "Ana <script>",
      liga: "Liga Norte",
      club: "Hack Pádel",
      fecha: "12 nov 2026",
      jornada: "4",
      url: URL,
    });
    expect(correo.ok).toBe(true);
    if (!correo.ok) return;
    expect(correo.asunto).toBe("Resultados oficiales — Liga Norte | Jornada 4");
    expect(correo.html).toContain("VER TABLA GENERAL");
    expect(correo.html).toContain(`${BASE}/public/liga/${LIGA}`);
    expect(correo.html).not.toContain("VER RESULTADOS DE LA JORNADA");
    expect(correo.html).not.toContain("12 nov 2026");
    expect(correo.html).toContain("Ana &lt;script&gt;");
    expect(correo.html).not.toContain("<script>");
    expect(correo.html).not.toContain("{{");
    expect(correo.html).not.toContain("**");
    const titulo =
      "¡Tu jornada ha terminado, pero tu historia continúa!";
    expect(correo.html.split(titulo).length - 1).toBe(1);
    expect(correo.html).toContain("Hola Ana &lt;script&gt;,");
    expect(correo.html.indexOf(titulo)).toBeLessThan(
      correo.html.indexOf("Hola Ana &lt;script&gt;,")
    );
    expect(plantillaResuelta(sustituirVariablesCorreo("Hola {{nombre}}", {
      nombre: "Ana",
      liga: "Liga",
      club: "Club",
      fecha: "hoy",
      jornada: "1",
    }))).toBe(true);
    expect(construirCorreoResultados({
      nombre: "Ana",
      liga: "Liga",
      club: "Club",
      fecha: "hoy",
      jornada: "1",
      url: `${BASE}/liga/${LIGA}/jornada/1`,
    })).toEqual({ ok: false, motivo: "sin_url_publica" });
  });

  it("16 y 17. no hay bienvenida retroactiva ni segunda bienvenida", () => {
    expect(debeEnviarBienvenida({
      automatizacionActiva: true,
      inscritoAt: "2026-11-01T00:00:00.000Z",
      activadaDesde: "2026-11-09T00:00:00.000Z",
      autorizado: true,
      yaEnviada: false,
    })).toEqual({ ok: false, motivo: "sin_alta_nueva" });
    expect(debeEnviarBienvenida({
      automatizacionActiva: true,
      inscritoAt: null,
      activadaDesde: "2026-11-09T00:00:00.000Z",
      autorizado: true,
      yaEnviada: false,
    }).ok).toBe(false);
    const alta = debeEnviarBienvenida({
      automatizacionActiva: true,
      inscritoAt: "2026-11-09T12:00:00.000Z",
      activadaDesde: "2026-11-09T00:00:00.000Z",
      autorizado: true,
      yaEnviada: false,
    });
    expect(alta).toEqual({ ok: true });
    expect(claveBienvenida(LIGA, "ins-1", JUGADOR)).toBe(claveBienvenida(LIGA, "ins-1", JUGADOR));
    expect(debeEnviarBienvenida({
      automatizacionActiva: true,
      inscritoAt: "2026-11-09T12:00:00.000Z",
      activadaDesde: "2026-11-09T00:00:00.000Z",
      autorizado: true,
      yaEnviada: true,
    })).toEqual({ ok: false, motivo: "ya_enviada" });
  });

  it("18. playoff, final y tercer lugar se tratan como partidos de la misma jornada", () => {
    const decision = puedeProgramarResultados({
      estadoJornada: "completed",
      partidos: [
        { estado: "completed", fase: "semifinal", bracket_slot: "SF1" },
        { estado: "completed", fase: "final", bracket_slot: "FINAL" },
        { estado: "completed", fase: "classification", bracket_slot: "THIRD" },
      ],
      automatizacionActiva: true,
      urlPublica: URL,
    });
    expect(decision).toEqual({ ok: true });
    expect(horaDeRondaUno([
      { ronda: 2, hora_inicio: "21:00" },
      { ronda: 1, hora_inicio: "18:30" },
    ])).toBe("18:30");
  });

  it("el worker programado no barre la cola manual y la migración no toca resultados", () => {
    const worker = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/procesar-liga-notificaciones/index.ts"),
      "utf8"
    );
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0111_liga_notificaciones_automaticas.sql"),
      "utf8"
    );
    expect(worker.indexOf("lote_requerido")).toBeLessThan(
      worker.indexOf('from("liga_notificaciones_queue")')
    );
    expect(worker).toContain('.eq("origen", "automatico")');
    expect(worker).toContain("respuesta_ambigua");
    expect(worker).toContain('.eq("lote_id", loteId)');
    expect(sql).toContain("NEW.estado = 'completed'");
    expect(sql).toContain("OLD.estado IS DISTINCT FROM 'completed'");
    expect(sql).not.toContain("net.http_post");
    expect(sql).not.toContain("UPDATE public.liga_partidos");
    expect(sql).not.toContain("UPDATE public.liga_inscripciones");
    expect(sql).toContain("inscrito_at");
  });
});
