/**
 * Reglas de comunicaciones manuales de una liga.
 * El módulo no habla con Supabase ni con Resend: la RPC y el panel usan
 * estas mismas decisiones. Si falta un dato, la respuesta es no enviar.
 *
 * Producto: NO exige verificación por enlace. Elegibilidad =
 * correo canónico válido + autorización documentada + admin_habilitado.
 */

export const TIPO_BIENVENIDA = "bienvenida" as const;

export const MAX_INTENTOS_BIENVENIDA = 3;

export type EstadoVisualNotificacion =
  | "habilitado"
  | "deshabilitado"
  | "sin_correo"
  | "correo_invalido"
  | "sin_autorizacion"
  | "correo_ambiguo"
  | "excluido"
  | "rebote"
  /** @deprecated Legacy; no forma parte del flujo manual. */
  | "correo_por_verificar";

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
  | "excluido"
  | "rebote"
  | "ya_enviado"
  | "ya_encolado"
  | "liga_pausada"
  | "ya_no_inscrito"
  | "es_saliente"
  | "origen_no_permitido"
  | "tipo_no_soportado"
  | "envios_reales_apagados"
  | "modo_manual";

export interface PreferenciaNotificacion {
  adminHabilitado: boolean;
  consentimientoEstado: ConsentimientoEstado;
  consentimientoOrigen: string | null;
  consentimientoRegistradoAt: string | null;
  /**
   * Solo true si hubo confirmación por enlace (capacidad opcional futura).
   * No es requisito para comunicaciones manuales.
   */
  correoVerificado: boolean;
  correoVerificacionOrigen: "enlace_de_confirmacion" | null;
}

export const PREFERENCIA_INICIAL: PreferenciaNotificacion = {
  adminHabilitado: false,
  consentimientoEstado: "sin_autorizacion",
  consentimientoOrigen: null,
  consentimientoRegistradoAt: null,
  correoVerificado: false,
  correoVerificacionOrigen: null,
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
  correoVerificacionOrigen?: string | null;
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

  // Titularidad por enlace: solo informativa. No acredita elegibilidad manual.
  const verificacion = row.correoVerificacionOrigen?.trim().toLowerCase() ?? "";
  const correoVerificado =
    row.correoVerificado === true && verificacion === "enlace_de_confirmacion";

  return {
    adminHabilitado: row.adminHabilitado === true,
    consentimientoEstado,
    consentimientoOrigen:
      consentimientoEstado === "sin_autorizacion" ? null : origen,
    consentimientoRegistradoAt:
      consentimientoEstado === "sin_autorizacion" ? null : registradoAt,
    correoVerificado,
    correoVerificacionOrigen: correoVerificado ? "enlace_de_confirmacion" : null,
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
  /** Legacy: correo acreditado por enlace. No bloquea el flujo manual. */
  emailVerificado?: string | null;
  /** Si el proveedor reportó rebote para este destinatario. */
  reboteProveedor?: boolean;
  sigueInscrito: boolean;
  esSalienteDeSustitucion: boolean;
  /**
   * La fecha de alta no es autorización. Se conserva solo para no romper
   * llamadas anteriores; el estado visual no la usa.
   */
  registroAutorizadoAt?: string | null;
}

/**
 * Estado operativo del destinatario.
 * Orden: contacto → exclusión/rebote → autorización → habilitación admin.
 * NO exige verificación por enlace.
 */
export function estadoVisual(
  destinatario: DestinatarioBienvenida
): EstadoVisualNotificacion {
  const correo = normalizarCorreo(destinatario.email);
  if (!correo) return "sin_correo";
  if (!correoEsValido(destinatario.email)) return "correo_invalido";
  if (destinatario.perfilesConMismoCorreo > 1) return "correo_ambiguo";
  if (destinatario.reboteProveedor) return "rebote";

  const preferencia = preferenciaEfectiva(destinatario.preferencia);
  if (preferencia.consentimientoEstado === "revocado") return "excluido";
  if (preferencia.consentimientoEstado !== "autorizado") {
    return "sin_autorizacion";
  }
  if (!preferencia.adminHabilitado) return "deshabilitado";
  return "habilitado";
}

/** Contacto usable (sin decidir aún consentimiento/admin). */
export function contactoDisponible(
  destinatario: Pick<
    DestinatarioBienvenida,
    "email" | "perfilesConMismoCorreo" | "reboteProveedor"
  >
): boolean {
  const correo = normalizarCorreo(destinatario.email);
  return Boolean(
    correo &&
      correoEsValido(destinatario.email) &&
      destinatario.perfilesConMismoCorreo <= 1 &&
      !destinatario.reboteProveedor
  );
}

export function origenPermiteCrearBienvenida(origen: string): boolean {
  return ORIGENES_DE_ESCRITURA.has(origen);
}

/**
 * El origen automático solo encola si la liga guardó modo_operacion=automatico
 * en Postgres. El flag de React no basta.
 */
export function origenAutomaticoPermitidoPorModo(
  origen: string,
  modoOperacion: string | null | undefined
): boolean {
  if (origen === "accion_admin") return true;
  if (origen !== "inscripcion_confirmada") return false;
  return (modoOperacion ?? "manual") === "automatico";
}

export function puedeEncolarBienvenida(input: {
  destinatario: DestinatarioBienvenida;
  ligaPausada: boolean;
  yaEnviado: boolean;
  yaEncolado?: boolean;
  origen: string;
  tipo?: string;
}): { encolar: boolean; motivo: MotivoBienvenida | null } {
  const tipo = input.tipo ?? TIPO_BIENVENIDA;
  if (
    ![
      "bienvenida",
      "aviso_general",
      "jornada",
      "cambio_horario",
      "felicitacion",
      "personalizado",
    ].includes(tipo)
  ) {
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
  if (visual === "correo_por_verificar") return "sin_autorizacion";
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
  habilitado: "Listo para enviar",
  deshabilitado: "Deshabilitado",
  sin_correo: "Sin correo",
  correo_invalido: "Correo inválido",
  sin_autorizacion: "Sin autorización",
  correo_ambiguo: "Correo ambiguo",
  excluido: "Contacto excluido",
  rebote: "Rebote",
  correo_por_verificar: "Sin autorización",
};
