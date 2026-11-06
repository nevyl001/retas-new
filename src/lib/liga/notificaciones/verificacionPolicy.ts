/**
 * Reglas de verificación de correo de liga.
 * La posesión del correo no es consentimiento ni habilitación administrativa.
 */

import {
  correoEsValido,
  normalizarCorreo,
  preferenciaEfectiva,
  type PreferenciaGuardada,
} from "./bienvenidaPolicy";

export const VERIFICACION_VIGENCIA_HORAS = 24;
export const VERIFICACION_COOLDOWN_MINUTOS = 15;
export const VERIFICACION_MAX_POR_VENTANA = 5;
export const VERIFICACION_VENTANA_HORAS = 24;
export const VERIFICACION_ORIGEN = "enlace_de_confirmacion" as const;

export type EstadoVerificacionSolicitud =
  | "pendiente"
  | "confirmado"
  | "vencido"
  | "utilizado"
  | "invalidado"
  | "cancelado";

export type EstadoVisualVerificacion =
  | "sin_correo"
  | "correo_ambiguo"
  | "correo_invalido"
  | "pendiente_verificacion"
  | "enlace_pendiente"
  | "enlace_vencido"
  | "verificado"
  | "sin_autorizacion_admin";

export type MotivoSolicitudVerificacion =
  | "sin_permiso"
  | "anon"
  | "ya_no_inscrito"
  | "deshabilitado"
  | "sin_correo"
  | "correo_invalido"
  | "correo_ambiguo"
  | "ya_verificado"
  | "demasiado_pronto"
  | "limite_alcanzado"
  | "esquema_pendiente"
  | "no_disponible";

export const ESTADO_VERIFICACION_LABEL: Record<EstadoVisualVerificacion, string> = {
  sin_correo: "Sin correo",
  correo_ambiguo: "Correo ambiguo",
  correo_invalido: "Correo inválido",
  pendiente_verificacion: "Pendiente de verificación",
  enlace_pendiente: "Enlace enviado",
  enlace_vencido: "Enlace vencido",
  verificado: "Verificado",
  sin_autorizacion_admin: "Sin autorización",
};

export interface SolicitudVerificacionVista {
  estado: EstadoVerificacionSolicitud;
  expiresAt: string | null;
  confirmedAt: string | null;
  createdAt: string | null;
}

export function correoCoincideConVerificado(input: {
  emailActual: string | null | undefined;
  emailVerificado: string | null | undefined;
}): boolean {
  const actual = normalizarCorreo(input.emailActual);
  const verificado = normalizarCorreo(input.emailVerificado);
  return Boolean(actual && verificado && actual === verificado);
}

export function correoEstaVerificado(input: {
  emailActual: string | null | undefined;
  preferencia: PreferenciaGuardada | null | undefined;
  emailVerificado: string | null | undefined;
}): boolean {
  const preferencia = preferenciaEfectiva(input.preferencia);
  if (!preferencia.correoVerificado) return false;
  return correoCoincideConVerificado({
    emailActual: input.emailActual,
    emailVerificado: input.emailVerificado,
  });
}

export function estadoVisualVerificacion(input: {
  email: string | null | undefined;
  perfilesConMismoCorreo: number;
  preferencia: PreferenciaGuardada | null | undefined;
  emailVerificado: string | null | undefined;
  solicitud: SolicitudVerificacionVista | null;
  ahoraIso?: string;
}): EstadoVisualVerificacion {
  const correo = normalizarCorreo(input.email);
  if (!correo) return "sin_correo";
  if (!correoEsValido(input.email)) return "correo_invalido";
  if (input.perfilesConMismoCorreo > 1) return "correo_ambiguo";

  if (
    correoEstaVerificado({
      emailActual: input.email,
      preferencia: input.preferencia,
      emailVerificado: input.emailVerificado,
    })
  ) {
    return "verificado";
  }

  const preferencia = preferenciaEfectiva(input.preferencia);
  if (!preferencia.adminHabilitado) return "sin_autorizacion_admin";

  const solicitud = input.solicitud;
  if (solicitud?.estado === "pendiente") {
    const ahora = Date.parse(input.ahoraIso ?? new Date().toISOString());
    const expira = solicitud.expiresAt ? Date.parse(solicitud.expiresAt) : NaN;
    if (Number.isFinite(expira) && expira <= ahora) return "enlace_vencido";
    return "enlace_pendiente";
  }
  if (solicitud?.estado === "vencido") return "enlace_vencido";
  return "pendiente_verificacion";
}

export function puedeSolicitarVerificacion(input: {
  autenticado: boolean;
  esOrganizadorDeLaLiga: boolean;
  esMasterAdmin: boolean;
  sigueInscrito: boolean;
  email: string | null | undefined;
  perfilesConMismoCorreo: number;
  preferencia: PreferenciaGuardada | null | undefined;
  emailVerificado: string | null | undefined;
  solicitudesRecientes: number;
  minutosDesdeUltima: number | null;
}): { solicitar: boolean; motivo: MotivoSolicitudVerificacion | null } {
  if (!input.autenticado) return { solicitar: false, motivo: "anon" };
  if (!input.esOrganizadorDeLaLiga && !input.esMasterAdmin) {
    return { solicitar: false, motivo: "sin_permiso" };
  }
  if (!input.sigueInscrito) return { solicitar: false, motivo: "ya_no_inscrito" };

  const correo = normalizarCorreo(input.email);
  if (!correo) return { solicitar: false, motivo: "sin_correo" };
  if (!correoEsValido(input.email)) return { solicitar: false, motivo: "correo_invalido" };
  if (input.perfilesConMismoCorreo > 1) {
    return { solicitar: false, motivo: "correo_ambiguo" };
  }

  if (
    correoEstaVerificado({
      emailActual: input.email,
      preferencia: input.preferencia,
      emailVerificado: input.emailVerificado,
    })
  ) {
    return { solicitar: false, motivo: "ya_verificado" };
  }

  const preferencia = preferenciaEfectiva(input.preferencia);
  if (!preferencia.adminHabilitado) {
    return { solicitar: false, motivo: "deshabilitado" };
  }

  if (
    input.minutosDesdeUltima != null &&
    input.minutosDesdeUltima < VERIFICACION_COOLDOWN_MINUTOS
  ) {
    return { solicitar: false, motivo: "demasiado_pronto" };
  }
  if (input.solicitudesRecientes >= VERIFICACION_MAX_POR_VENTANA) {
    return { solicitar: false, motivo: "limite_alcanzado" };
  }

  return { solicitar: true, motivo: null };
}

export function decidirEstadoInspeccion(input: {
  encontrado: boolean;
  estado: EstadoVerificacionSolicitud | null;
  expiresAt: string | null;
  ahoraIso?: string;
}): EstadoVerificacionSolicitud | "invalido" {
  if (!input.encontrado || !input.estado) return "invalido";
  if (input.estado === "pendiente") {
    const ahora = Date.parse(input.ahoraIso ?? new Date().toISOString());
    const expira = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
    if (Number.isFinite(expira) && expira <= ahora) return "vencido";
    return "pendiente";
  }
  if (input.estado === "confirmado") return "utilizado";
  return input.estado;
}

export function decidirConfirmacion(input: {
  inspeccion: ReturnType<typeof decidirEstadoInspeccion>;
  emailActualCoincide: boolean;
}): { confirmar: boolean; motivo: string } {
  if (input.inspeccion === "pendiente" && input.emailActualCoincide) {
    return { confirmar: true, motivo: "ok" };
  }
  if (input.inspeccion === "pendiente" && !input.emailActualCoincide) {
    return { confirmar: false, motivo: "correo_cambio" };
  }
  return { confirmar: false, motivo: input.inspeccion };
}

export function construirEnlaceVerificacion(input: {
  appBase: string;
  token: string;
}): string {
  const base = input.appBase.replace(/\/+$/, "");
  const token = input.token.trim();
  if (!/^[a-f0-9]{48,128}$/i.test(token)) {
    throw new Error("token_invalido");
  }
  return `${base}/public/verificar-correo?t=${encodeURIComponent(token)}`;
}

export function tokenDesdeQuery(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!/^[a-f0-9]{48,128}$/i.test(value)) return null;
  return value.toLowerCase();
}

/** El GET solo inspecciona. Un cliente de correo que previsualiza no confirma. */
export function getNoConfirmaToken(): true {
  return true;
}
