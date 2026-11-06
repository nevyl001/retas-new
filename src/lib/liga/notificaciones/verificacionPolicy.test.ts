import fs from "fs";
import path from "path";
import {
  VERIFICACION_COOLDOWN_MINUTOS,
  VERIFICACION_MAX_POR_VENTANA,
  construirEnlaceVerificacion,
  correoEstaVerificado,
  decidirConfirmacion,
  decidirEstadoInspeccion,
  estadoVisualVerificacion,
  getNoConfirmaToken,
  puedeSolicitarVerificacion,
  tokenDesdeQuery,
} from "./verificacionPolicy";

const PREF_LISTA = {
  adminHabilitado: true,
  consentimientoEstado: "autorizado" as const,
  consentimientoOrigen: "manifestacion_presencial",
  consentimientoRegistradoAt: "2026-11-06T12:00:00.000Z",
  correoVerificado: true,
  correoVerificacionOrigen: "enlace_de_confirmacion" as const,
};

describe("verificación de correo de liga", () => {
  it("un token válido pendiente se puede confirmar con POST", () => {
    const inspeccion = decidirEstadoInspeccion({
      encontrado: true,
      estado: "pendiente",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(inspeccion).toBe("pendiente");
    expect(
      decidirConfirmacion({
        inspeccion,
        emailActualCoincide: true,
      })
    ).toEqual({ confirmar: true, motivo: "ok" });
  });

  it("un token vencido no se confirma", () => {
    expect(
      decidirEstadoInspeccion({
        encontrado: true,
        estado: "pendiente",
        expiresAt: "2020-01-01T00:00:00.000Z",
        ahoraIso: "2026-11-06T12:00:00.000Z",
      })
    ).toBe("vencido");
  });

  it("un token reutilizado queda como utilizado", () => {
    expect(
      decidirEstadoInspeccion({
        encontrado: true,
        estado: "confirmado",
        expiresAt: "2099-01-01T00:00:00.000Z",
      })
    ).toBe("utilizado");
  });

  it("un token invalidado o inexistente se rechaza", () => {
    expect(
      decidirEstadoInspeccion({
        encontrado: true,
        estado: "invalidado",
        expiresAt: null,
      })
    ).toBe("invalidado");
    expect(
      decidirEstadoInspeccion({
        encontrado: false,
        estado: null,
        expiresAt: null,
      })
    ).toBe("invalido");
  });

  it("si el correo cambió, la confirmación falla y la verificación previa no cuenta", () => {
    expect(
      decidirConfirmacion({
        inspeccion: "pendiente",
        emailActualCoincide: false,
      })
    ).toEqual({ confirmar: false, motivo: "correo_cambio" });
    expect(
      correoEstaVerificado({
        emailActual: "nuevo@example.com",
        preferencia: PREF_LISTA,
        emailVerificado: "viejo@example.com",
      })
    ).toBe(false);
  });

  it("un correo compartido no se puede solicitar", () => {
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "compartido@example.com",
        perfilesConMismoCorreo: 2,
        preferencia: { adminHabilitado: true },
        emailVerificado: null,
        solicitudesRecientes: 0,
        minutosDesdeUltima: null,
      }).motivo
    ).toBe("correo_ambiguo");
  });

  it("sin autorización administrativa no se solicita", () => {
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: null,
        emailVerificado: null,
        solicitudesRecientes: 0,
        minutosDesdeUltima: null,
      }).motivo
    ).toBe("deshabilitado");
  });

  it("otro club y el anónimo no solicitan", () => {
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: false,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: { adminHabilitado: true },
        emailVerificado: null,
        solicitudesRecientes: 0,
        minutosDesdeUltima: null,
      }).motivo
    ).toBe("sin_permiso");
    expect(
      puedeSolicitarVerificacion({
        autenticado: false,
        esOrganizadorDeLaLiga: false,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: { adminHabilitado: true },
        emailVerificado: null,
        solicitudesRecientes: 0,
        minutosDesdeUltima: null,
      }).motivo
    ).toBe("anon");
  });

  it("los reenvíos excesivos se bloquean", () => {
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: { adminHabilitado: true },
        emailVerificado: null,
        solicitudesRecientes: 0,
        minutosDesdeUltima: VERIFICACION_COOLDOWN_MINUTOS - 1,
      }).motivo
    ).toBe("demasiado_pronto");
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: { adminHabilitado: true },
        emailVerificado: null,
        solicitudesRecientes: VERIFICACION_MAX_POR_VENTANA,
        minutosDesdeUltima: 60,
      }).motivo
    ).toBe("limite_alcanzado");
  });

  it("el GET no confirma y el enlace no lleva el correo", () => {
    expect(getNoConfirmaToken()).toBe(true);
    const token = "a".repeat(64);
    const enlace = construirEnlaceVerificacion({
      appBase: "https://appriviera.rivieraopen.com",
      token,
    });
    expect(enlace).toBe(
      `https://appriviera.rivieraopen.com/public/verificar-correo?t=${token}`
    );
    expect(enlace).not.toContain("@");
    expect(tokenDesdeQuery(token)).toBe(token);
    expect(tokenDesdeQuery("corto")).toBeNull();
  });

  it("la verificación acreditada no habilita notificaciones por sí sola", () => {
    expect(
      estadoVisualVerificacion({
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: {
          adminHabilitado: true,
          correoVerificado: true,
          correoVerificacionOrigen: "enlace_de_confirmacion",
          consentimientoEstado: "sin_autorizacion",
        },
        emailVerificado: "ok@example.com",
        solicitud: null,
      })
    ).toBe("verificado");
  });

  it("ya verificado no pide otro enlace", () => {
    expect(
      puedeSolicitarVerificacion({
        autenticado: true,
        esOrganizadorDeLaLiga: true,
        esMasterAdmin: false,
        sigueInscrito: true,
        email: "ok@example.com",
        perfilesConMismoCorreo: 1,
        preferencia: PREF_LISTA,
        emailVerificado: "ok@example.com",
        solicitudesRecientes: 0,
        minutosDesdeUltima: null,
      }).motivo
    ).toBe("ya_verificado");
  });
});

describe("migración 0101 — artefactos", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../../../../supabase/migrations/0101_liga_notificaciones_verificacion_correo.sql"
    ),
    "utf8"
  );

  it("guarda hash, no llama a Resend y no toca Torneo Express", () => {
    expect(sql).toContain("token_hash");
    expect(sql).toContain("extensions.digest");
    expect(sql).not.toContain("sendByResend");
    expect(sql).not.toMatch(/INTO\s+public\.notificaciones_eventos_queue/i);
    expect(sql).toContain("liga.confirmando_correo");
    expect(sql).toContain("enlace_de_confirmacion");
  });
});
