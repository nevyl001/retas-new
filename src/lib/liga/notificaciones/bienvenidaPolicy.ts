/**
 * Reglas de la bienvenida por correo de una liga.
 * El módulo no habla con Supabase ni con Resend: la RPC y el panel usan
 * estas mismas decisiones. Si falta un dato, la respuesta es no enviar.
 */

export const TIPO_BIENVENIDA = "bienvenida" as const;

export const MAX_INTENTOS_BIENVENIDA = 3;

export type EstadoVisualNotificacion =
  | "habilitado"
  | "deshabilitado"
  | "sin_correo"
  | "correo_por_verificar"
  | "sin_autorizacion"
  | "correo_ambiguo";

export type EstadoColaBienvenida =
  | "pendiente"
  | "procesando"
  | "enviado"
  | "error"
  | "omitido"
  | "pausado";

export type ConsentimientoEstado =
  | "sin_autorizacion"
  | "autorizado"
  | "revocado";

export type MotivoBienvenida =
  | "deshabilitado"
  | "sin_autorizacion"
  | "sin_correo"
  | "correo_invalido"
  | "correo_ambiguo"
  | "correo_por_verificar"
  | "ya_enviado"
  | "ya_encolado"
  | "liga_pausada"
  | "ya_no_inscrito"
  | "es_saliente"
  | "origen_no_permitido"
  | "tipo_no_soportado"
  | "envios_reales_apagados";

export interface PreferenciaNotificacion {
  adminHabilitado: boolean;
  consentimientoEstado: ConsentimientoEstado;
  consentimientoOrigen: string | null;
  consentimientoRegistradoAt: string | null;
  correoVerificado: boolean;
}

export const PREFERENCIA_INICIAL: PreferenciaNotificacion = {
  adminHabilitado: false,
  consentimientoEstado: "sin_autorizacion",
  consentimientoOrigen: null,
  consentimientoRegistradoAt: null,
  correoVerificado: false,
};

const ORIGENES_QUE_NO_SON_CONSENTIMIENTO = new Set([
  "inscripcion",
  "confirmacion_inscripcion",
  "tiene_correo",
  "email",
]);

const ORIGENES_DE_ESCRITURA = new Set([
  "inscripcion_confirmada",
  "accion_admin",
]);

export interface PreferenciaGuardada {
  adminHabilitado?: boolean | null;
  consentimientoEstado?: string | null;
  consentimientoOrigen?: string | null;
  consentimientoRegistradoAt?: string | null;
  correoVerificado?: boolean | null;
}

export function normalizarCorreo(
  email: string | null | undefined
): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value || null;
}

export function correoEsValido(email: string | null | undefined): boolean {
  const value = normalizarCorreo(email);
  if (!value || value.endsWith("@padel.local")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function origenDeConsentimientoValido(
  origen: string | null | undefined
): boolean {
  const value = origen?.trim().toLowerCase() ?? "";
  if (!value || value.length > 80) return false;
  return !ORIGENES_QUE_NO_SON_CONSENTIMIENTO.has(value);
}

/** Una fila ausente, o un consentimiento sin evidencia, queda cerrado. */
export function preferenciaEfectiva(
  row: PreferenciaGuardada | null | undefined
): PreferenciaNotificacion {
  if (!row) return { ...PREFERENCIA_INICIAL };

  const origen = row.consentimientoOrigen?.trim() || null;
  const registradoAt = row.consentimientoRegistradoAt?.trim() || null;
  const evidencia =
    row.consentimientoEstado === "autorizado" &&
    origenDeConsentimientoValido(origen) &&
    Boolean(registradoAt);

  let consentimientoEstado: ConsentimientoEstado = "sin_autorizacion";
  if (evidencia) consentimientoEstado = "autorizado";
  else if (row.consentimientoEstado === "revocado") {
    consentimientoEstado = "revocado";
  }

  return {
    adminHabilitado: row.adminHabilitado === true,
    consentimientoEstado,
    consentimientoOrigen:
      consentimientoEstado === "sin_autorizacion" ? null : origen,
    consentimientoRegistradoAt:
      consentimientoEstado === "sin_autorizacion" ? null : registradoAt,
    correoVerificado: row.correoVerificado === true,
  };
}

export function preferenciaTrasRecarga(
  row: PreferenciaGuardada | null | undefined
): PreferenciaNotificacion {
  const efectiva = preferenciaEfectiva(row);
  return preferenciaEfectiva(JSON.parse(JSON.stringify(efectiva)));
}

export interface DestinatarioBienvenida {
  email: string | null;
  perfilesConMismoCorreo: number;
  preferencia: PreferenciaGuardada | null;
  sigueInscrito: boolean;
  esSalienteDeSustitucion: boolean;
}

export function estadoVisual(
  destinatario: DestinatarioBienvenida
): EstadoVisualNotificacion {
  const correo = normalizarCorreo(destinatario.email);
  if (!correo || !correoEsValido(destinatario.email)) return "sin_correo";
  if (destinatario.perfilesConMismoCorreo > 1) return "correo_ambiguo";

  const preferencia = preferenciaEfectiva(destinatario.preferencia);
  if (!preferencia.correoVerificado) return "correo_por_verificar";
  if (preferencia.consentimientoEstado !== "autorizado") {
    return "sin_autorizacion";
  }
  if (!preferencia.adminHabilitado) return "deshabilitado";
  return "habilitado";
}

export function origenPermiteCrearBienvenida(origen: string): boolean {
  return ORIGENES_DE_ESCRITURA.has(origen);
}

export function puedeEncolarBienvenida(input: {
  destinatario: DestinatarioBienvenida;
  ligaPausada: boolean;
  yaEnviado: boolean;
  yaEncolado?: boolean;
  origen: string;
  tipo?: string;
}): { encolar: boolean; motivo: MotivoBienvenida | null } {
  if ((input.tipo ?? TIPO_BIENVENIDA) !== TIPO_BIENVENIDA) {
    return { encolar: false, motivo: "tipo_no_soportado" };
  }
  if (!origenPermiteCrearBienvenida(input.origen)) {
    return { encolar: false, motivo: "origen_no_permitido" };
  }
  if (!input.destinatario.sigueInscrito) {
    return { encolar: false, motivo: "ya_no_inscrito" };
  }
  if (input.destinatario.esSalienteDeSustitucion) {
    return { encolar: false, motivo: "es_saliente" };
  }

  const visual = estadoVisual(input.destinatario);
  if (visual !== "habilitado") {
    const correo = normalizarCorreo(input.destinatario.email);
    if (visual === "sin_correo" && correo && !correoEsValido(correo)) {
      return { encolar: false, motivo: "correo_invalido" };
    }
    return { encolar: false, motivo: motivoDeEstado(visual) };
  }

  if (input.ligaPausada) return { encolar: false, motivo: "liga_pausada" };
  if (input.yaEnviado) return { encolar: false, motivo: "ya_enviado" };
  if (input.yaEncolado) return { encolar: false, motivo: "ya_encolado" };
  return { encolar: true, motivo: null };
}

function motivoDeEstado(
  visual: Exclude<EstadoVisualNotificacion, "habilitado">
): MotivoBienvenida {
  return visual;
}

export function puedeEnviarBienvenidaEnCola(input: {
  destinatario: DestinatarioBienvenida;
  ligaPausada: boolean;
  enviosReales: boolean;
}): { enviar: boolean; motivo: MotivoBienvenida | null } {
  if (!input.enviosReales) {
    return { enviar: false, motivo: "envios_reales_apagados" };
  }
  const decision = puedeEncolarBienvenida({
    destinatario: input.destinatario,
    ligaPausada: input.ligaPausada,
    yaEnviado: false,
    origen: "accion_admin",
    tipo: TIPO_BIENVENIDA,
  });
  return { enviar: decision.encolar, motivo: decision.motivo };
}

export function claveIdempotenciaBienvenida(input: {
  ligaId: string;
  inscripcionId: string | null;
  jugadorId: string;
}): string {
  return [
    TIPO_BIENVENIDA,
    input.ligaId.trim(),
    input.inscripcionId?.trim() || "sin-inscripcion",
    input.jugadorId.trim(),
  ].join(":");
}

export function decidirReclamoBienvenida(
  row: { estado: EstadoColaBienvenida; attempts: number } | null
): { write: false } | { write: true; attempts: number } {
  if (!row || row.estado !== "pendiente") return { write: false };
  if (row.attempts >= MAX_INTENTOS_BIENVENIDA) return { write: false };
  return { write: true, attempts: row.attempts + 1 };
}

export type ResultadoProveedorBienvenida =
  | "ok"
  | "temporal"
  | "permanente"
  | "omitir";

export function decidirResultadoEnvioBienvenida(
  attempts: number,
  resultado: ResultadoProveedorBienvenida,
  motivo?: string
): { estado: EstadoColaBienvenida; reintentar: boolean; motivo: string | null } {
  if (resultado === "ok") {
    return { estado: "enviado", reintentar: false, motivo: null };
  }
  if (resultado === "omitir") {
    return {
      estado: "omitido",
      reintentar: false,
      motivo: motivo ?? "omitido",
    };
  }
  if (resultado === "permanente") {
    return {
      estado: "error",
      reintentar: false,
      motivo: motivo ?? "error_permanente",
    };
  }
  if (attempts >= MAX_INTENTOS_BIENVENIDA) {
    return {
      estado: "error",
      reintentar: false,
      motivo: motivo ?? "error_temporal",
    };
  }
  return {
    estado: "pendiente",
    reintentar: true,
    motivo: motivo ?? "error_temporal",
  };
}

export function decidirAlDeshabilitar(
  estado: EstadoColaBienvenida
): EstadoColaBienvenida {
  if (estado === "pendiente" || estado === "procesando") return "pausado";
  return estado;
}

export function enviosRealesAutorizados(
  flag: string | null | undefined
): boolean {
  return flag === "true";
}

export function puedeConsultarNotificacionesLiga(input: {
  autenticado: boolean;
  esOrganizadorDeLaLiga: boolean;
  esMasterAdmin: boolean;
}): boolean {
  return (
    input.autenticado &&
    (input.esOrganizadorDeLaLiga || input.esMasterAdmin)
  );
}

export function contarDestinatarios(
  adminHabilitados: boolean[]
): { seleccionados: number; excluidos: number } {
  const seleccionados = adminHabilitados.filter(Boolean).length;
  return {
    seleccionados,
    excluidos: adminHabilitados.length - seleccionados,
  };
}

export function registrarConsentimiento(input: {
  origen: string;
  registradoAt: string;
  actorId: string;
}):
  | {
      consentimientoEstado: "autorizado";
      consentimientoOrigen: string;
      consentimientoRegistradoAt: string;
    }
  | { error: "origen_no_valido" | "evidencia_incompleta" } {
  if (!origenDeConsentimientoValido(input.origen)) {
    return { error: "origen_no_valido" };
  }
  if (!input.registradoAt.trim() || !input.actorId.trim()) {
    return { error: "evidencia_incompleta" };
  }
  return {
    consentimientoEstado: "autorizado",
    consentimientoOrigen: input.origen.trim().toLowerCase(),
    consentimientoRegistradoAt: input.registradoAt,
  };
}

/** Primer carácter y dominio. Nunca la dirección completa. */
export function enmascararCorreo(email: string | null | undefined): string | null {
  const value = normalizarCorreo(email);
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

export const ESTADO_VISUAL_LABEL: Record<EstadoVisualNotificacion, string> = {
  habilitado: "Habilitado",
  deshabilitado: "Deshabilitado",
  sin_correo: "Sin correo",
  correo_por_verificar: "Correo por verificar",
  sin_autorizacion: "Sin autorización",
  correo_ambiguo: "Correo ambiguo",
};
