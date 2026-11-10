import fs from "fs";
import path from "path";
import {
  claveSupervision,
  construirCorreoPrueba,
  construirCorreoSupervision,
  copiaYaRegistrada,
  correoSupervisionValido,
  decidirConfirmacionToken,
  esCorreoDeJugador,
  manualSigueDisponible,
  permiteOtroEnvio,
  puedeActivarCopia,
  CONFIG_AUTOMATICA_INICIAL,
} from "./automatizacion";

const LIGA = "11111111-1111-4111-8111-111111111111";
const JORNADA = "22222222-2222-4222-8222-222222222222";
const URL = `https://appriviera.rivieraopen.com/public/liga/${LIGA}/jornada/4`;

describe("supervisión de correos", () => {
  it("valida el correo guardado sin pedir una verificación", () => {
    expect(correoSupervisionValido("admin@club.com")).toBe(true);
    expect(correoSupervisionValido("no-es-correo")).toBe(false);
    expect(correoSupervisionValido("alguien@padel.local")).toBe(false);
  });

  it("activa copias con el correo guardado y respeta el alcance", () => {
    expect(puedeActivarCopia({
      activa: true,
      email: "no-es-correo",
      alcance: "todas",
      tipo: "resultados_jornada",
    })).toBe(false);
    expect(puedeActivarCopia({
      activa: true,
      email: "admin@club.com",
      alcance: "resultados",
      tipo: "bienvenida",
    })).toBe(false);
    expect(puedeActivarCopia({
      activa: true,
      email: "admin@club.com",
      alcance: "resultados",
      tipo: "resultados_jornada",
    })).toBe(true);
    expect(puedeActivarCopia({
      activa: false,
      email: "admin@club.com",
      alcance: "todas",
      tipo: "resultados_jornada",
    })).toBe(false);
  });

  it("una jornada produce una sola clave aunque haya muchos jugadores", () => {
    const clave = claveSupervision(LIGA, "resultados_jornada", JORNADA);
    const jugadores = Array.from({ length: 12 }, () => clave);
    expect(new Set(jugadores).size).toBe(1);
    expect(copiaYaRegistrada([clave], clave)).toBe(true);
    expect(copiaYaRegistrada([], clave)).toBe(false);
  });

  it("la confirmación caduca y agota los intentos", () => {
    const expira = new Date("2026-11-09T12:30:00.000Z");
    expect(decidirConfirmacionToken({
      expira,
      intentos: 0,
      ahora: new Date("2026-11-09T13:00:00.000Z"),
    })).toBe("vencido");
    expect(decidirConfirmacionToken({
      expira,
      intentos: 5,
      ahora: new Date("2026-11-09T12:00:00.000Z"),
    })).toBe("limite");
    expect(decidirConfirmacionToken({
      expira,
      intentos: 1,
      ahora: new Date("2026-11-09T12:00:00.000Z"),
    })).toBe("ok");
  });

  it("la copia no incluye correos y la prueba se identifica como tal", () => {
    const copia = construirCorreoSupervision({
      liga: "Liga Norte",
      club: "Hack Pádel",
      jornada: "4",
      fecha: "12/11/2026",
      horario: "18:00",
      tipo: "resultados_jornada",
      procesados: 12,
      aceptados: 10,
      errores: 1,
      reintentos: 1,
      urlResultados: URL,
    });
    expect(copia.ok).toBe(true);
    if (!copia.ok) return;
    expect(copia.text).not.toContain("@");
    expect(copia.html).toContain("VER RESULTADOS");
    expect(copia.html).toContain("reintentos pendientes");
    expect(construirCorreoSupervision({
      liga: "ana@club.com",
      club: "Club",
      jornada: "1",
      fecha: "hoy",
      horario: "18:00",
      tipo: "resultados_jornada",
      procesados: 1,
      aceptados: 1,
      errores: 0,
      reintentos: 0,
      urlResultados: URL,
    })).toEqual({ ok: false, motivo: "datos_privados" });

    const prueba = construirCorreoPrueba();
    expect(prueba.asunto).toBe("[PRUEBA] AppRiviera — Notificación de jornada");
    expect(prueba.text).toContain("ESTE ES UN CORREO DE PRUEBA");
    expect(prueba.text).not.toContain("/jornada/");
    expect(prueba.html).not.toContain("/liga/");
  });

  it("prueba y supervisión no cuentan como correo de jugador, y el manual sigue disponible", () => {
    expect(esCorreoDeJugador("prueba")).toBe(false);
    expect(esCorreoDeJugador("supervision")).toBe(false);
    expect(esCorreoDeJugador("bienvenida")).toBe(true);
    expect(manualSigueDisponible(CONFIG_AUTOMATICA_INICIAL)).toBe(true);
    expect(permiteOtroEnvio({
      conteo: 3,
      ventana: new Date("2026-11-09T12:00:00.000Z"),
      ahora: new Date("2026-11-09T12:30:00.000Z"),
      maximo: 3,
    })).toBe(false);
  });

  it("el envío de prueba y la migración no abren la puerta de los envíos reales", () => {
    const prueba = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/enviar-prueba-supervision-liga/index.ts"),
      "utf8"
    );
    const worker = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/procesar-liga-notificaciones/index.ts"),
      "utf8"
    );
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0111_liga_notificaciones_automaticas.sql"),
      "utf8"
    );
    expect(prueba).not.toContain("LIGA_NOTIFICACIONES_ENVIOS_REALES");
    expect(prueba.indexOf('LIGA_NOTIFICACIONES_PRUEBA_SUPERVISION") === "true"')).toBeLessThan(
      prueba.indexOf("await sendByResend")
    );
    expect(prueba.indexOf("body.confirmar === true")).toBeLessThan(prueba.indexOf("await sendByResend"));
    expect(prueba).not.toContain("liga_notificaciones_queue");
    expect(worker.indexOf("LIGA_NOTIFICACIONES_WEBHOOK_SECRET")).toBeLessThan(
      worker.indexOf('from("liga_notificaciones_queue")')
    );
    expect(worker).toContain("supervision:");
    expect(sql).toContain("liga_notificacion_hash_token");
    expect(sql).toContain("supervision_email = supervision_email_verificado");
    expect(sql).not.toContain("net.http_post");
    const correctiva = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0116_liga_supervision_sin_verificacion.sql"),
      "utf8"
    );
    expect(correctiva).toContain("supervision_prueba_conteo < 3");
    expect(correctiva).not.toContain("supervision_verificado_at IS NOT NULL");
    expect(worker).not.toContain("supervision_email_verificado");
    expect(worker).toContain("supervision:");
  });
});
