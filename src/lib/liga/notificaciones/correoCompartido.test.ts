import fs from "fs";
import path from "path";
import { getManifestByKey } from "../../../club-experience/manifestRegistry";
import { resolveLigaMailBranding } from "./ligaMailBranding";
import { renderComunicacionEmail } from "./comunicacionTemplates";
import {
  autorizarPruebaSupervision,
  prepararPruebaSupervision,
  renderCorreoComunicacion,
  renderVerificacionSupervision,
} from "./correoCompartido";

const branding = resolveLigaMailBranding({ clubNombre: "Hack Pádel" });
const cuerpo = [
  "Hola Ana,",
  "",
  "La Jornada 2 de Liga Norte es el 11/11/2026 a las 21:00 hrs.",
  "",
  "Fecha: 11/11/2026",
  "Horario: 21:00 hrs",
  "Sede: Hack Pádel",
  "",
  "RESULTADOS_URL:/public/liga/liga-123/jornada/2",
].join("\n");

describe("prueba aislada de supervisión", () => {
  const base = {
    pruebaHabilitada: true,
    admin: true,
    confirmada: true,
    verificada: true,
    enviosEnLaUltimaHora: 0,
  };

  it("permite la prueba con el flag global de jugadores apagado", () => {
    expect(autorizarPruebaSupervision(base)).toEqual({ ok: true });
  });

  it("niega administrador, correo sin verificar, token de cupo y falta de confirmación", () => {
    expect(autorizarPruebaSupervision({ ...base, admin: false })).toEqual({ ok: false, motivo: "sin_permiso" });
    expect(autorizarPruebaSupervision({ ...base, verificada: false })).toEqual({ ok: false, motivo: "correo_sin_verificacion" });
    expect(autorizarPruebaSupervision({ ...base, enviosEnLaUltimaHora: 3 })).toEqual({ ok: false, motivo: "limite_alcanzado" });
    expect(autorizarPruebaSupervision({ ...base, confirmada: false })).toEqual({ ok: false, motivo: "confirmacion_requerida" });
    expect(autorizarPruebaSupervision({ ...base, pruebaHabilitada: false })).toEqual({ ok: false, motivo: "prueba_apagada" });
  });
});

describe("identidad del manifiesto", () => {
  it("usa el logo oscuro y el acento del manifiesto, con co-branding", () => {
    const manifest = getManifestByKey("hack-padel");
    const branding = resolveLigaMailBranding({
      clubNombre: manifest.displayName,
      manifest,
    });
    expect(branding.brandLogoUrl).toContain("/brands/hack-padel/logo-transparent.png");
    expect(branding.brandAccentColor).toBe("#bfff00");
    expect(branding.brandSupportLabel).toBe("by Riviera Open");
    expect(branding.brandName).toBe("Hack Padel");
  });

  it("un club sin logo queda en iniciales", () => {
    const branding = resolveLigaMailBranding({ clubNombre: "Club Deportivo Padel San Juan" });
    expect(branding.brandLogoUrl).toBeNull();
    expect(branding.initials).toBe("CDP");
    expect(branding.brandSupportLabel).toBe("by Riviera Open");
  });
});

describe("correo compartido", () => {
  it("la vista previa y el generador único producen el mismo HTML", () => {
    const view = renderComunicacionEmail({
      clubNombre: "Hack Pádel",
      ligaNombre: "Liga Norte",
      jugadorNombre: "Ana",
      asunto: "Recordatorio — Liga Norte | Jornada 2",
      cuerpo,
      vistaPrevia: false,
      branding,
      tipo: "recordatorio_jornada",
      ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
    });
    const utils = renderCorreoComunicacion({
      clubNombre: "Hack Pádel",
      ligaNombre: "Liga Norte",
      asunto: view.subject,
      cuerpo,
      branding,
      tipo: "recordatorio_jornada",
      ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
      vistaPrevia: false,
    });
    expect(view.html).toBe(utils.html);
    expect(view.html).toContain("11/11/2026");
    expect(view.html).toContain("21:00 hrs");
    expect(view.html).toContain("Hack Pádel");
    expect(view.html).toContain("VER LA JORNADA");
    expect(view.html).toContain("/public/liga/liga-123/jornada/2");
    expect(view.html).not.toContain("RESULTADOS_URL");
    expect(view.html).not.toContain("{{");
    expect(view.subject).toBe(utils.asunto);
  });

  it("la prueba usa ese HTML, se identifica y no acepta variables abiertas", () => {
    const prueba = prepararPruebaSupervision({
      asunto: "Recordatorio — Liga Norte | Jornada 2",
      cuerpo,
      tipo: "recordatorio_jornada",
      clubNombre: "Hack Pádel",
      ligaNombre: "Liga Norte",
      branding,
      ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
    });
    expect(prueba.ok).toBe(true);
    if (!prueba.ok) return;
    expect(prueba.asunto.startsWith("[PRUEBA]")).toBe(true);
    expect(prueba.html).toContain("ESTE ES UN CORREO DE PRUEBA");
    expect(prueba.html).toContain("21:00 hrs");
    expect(prueba.html).toContain("VER LA JORNADA");
    expect(prepararPruebaSupervision({
      asunto: "Hola {{nombre}}",
      cuerpo: "Texto",
      clubNombre: "Club",
      ligaNombre: "Liga",
      branding,
    })).toEqual({ ok: false, motivo: "plantilla_incompleta" });
  });

  it("la verificación solo arma el enlace de supervisión", () => {
    const token = "a".repeat(64);
    const enlace = `https://appriviera.rivieraopen.com/public/verificar-correo?s=${token}`;
    const view = renderVerificacionSupervision({ branding, enlace });
    expect(view?.html).toContain("CONFIRMAR CORREO DE SUPERVISIÓN");
    expect(view?.asunto).not.toContain(token);
    expect(renderVerificacionSupervision({
      branding,
      enlace: `https://appriviera.rivieraopen.com/public/verificar-correo?t=${token}`,
    })).toBeNull();
  });

  it("el worker delega y las migraciones no abren envíos ni reescriben 0111", () => {
    const worker = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/_shared/ligaNotificacionesMail.ts"),
      "utf8"
    );
    const verificacion = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/enviar-verificacion-supervision-liga/index.ts"),
      "utf8"
    );
    const prueba = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/enviar-prueba-supervision-liga/index.ts"),
      "utf8"
    );
    const sql0113 = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0113_liga_recordatorio_horario_oficial.sql"),
      "utf8"
    );
    const sql0114 = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0114_liga_supervision_verificacion.sql"),
      "utf8"
    );
    const funcion = worker.slice(
      worker.indexOf("export function renderComunicacionWorker"),
      worker.indexOf("export function isFakeOrInvalidEmail")
    );
    expect(funcion).toContain("renderCorreoComunicacion");
    expect(funcion).not.toContain("renderPremiumEmailLayout");
    expect(verificacion.indexOf('LIGA_NOTIFICACIONES_VERIFICACION_SUPERVISION") !== "true"')).toBeLessThan(
      verificacion.indexOf("emitir_verificacion_supervision")
    );
    expect(verificacion).not.toContain("liga_notificaciones_queue");
    expect(verificacion).not.toContain("resultado.token,");
    expect(prueba).not.toContain("liga_notificaciones_queue");
    expect(prueba).toContain("destino_no_permitido");
    expect(prueba).toContain("reserva.email");
    expect(sql0113).not.toContain("COALESCE(v_hora");
    expect(sql0113).toContain("Horario:");
    expect(sql0113).not.toContain("UPDATE public.liga_jornadas");
    expect(sql0113).not.toContain("INSERT INTO supabase_migrations");
    expect(sql0114).not.toContain("FUNCTION public.liga_notificaciones_sync_recordatorio");
    expect(sql0114).toContain("0114 ya esta materializada");
    const sql0115 = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/0115_liga_supervision_columnas_protegidas.sql"),
      "utf8"
    );
    expect(sql0115).toContain("current_user IN ('authenticated', 'anon', 'authenticator')");
    expect(sql0115).not.toContain("liga_notificaciones_sync_recordatorio");
    expect(sql0115).not.toContain("liga_notificaciones_queue");
    const workerBrand = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/_shared/ligaNotificacionesMail.ts"),
      "utf8"
    );
    expect(workerBrand).toContain("getManifestByKey");
    expect(workerBrand).not.toContain("KNOWN_CLUBS");
    expect(sql0114).not.toContain("UPDATE public.liga_jornadas");
    expect(sql0114).not.toContain("INSERT INTO supabase_migrations");
    expect(sql0114).toContain("supervision_email_verificado = supervision_email");
  });
});
