/**
 * Decisiones puras del envío manual. El worker las replica antes de reclamar
 * una fila y antes de llamar a Resend. Sin red.
 */

const EMAIL =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmailAllowlist(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value || !EMAIL.test(value) || value.endsWith("@padel.local")) return null;
  return value;
}

/** Lista vacía, ausente o solo espacios = nadie. Fail closed. */
export function parseAllowlist(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const email = normalizarEmailAllowlist(part);
    if (email) set.add(email);
  }
  return set;
}

export function parseReplyTo(raw: string | null | undefined): string | null {
  return normalizarEmailAllowlist(raw);
}

/** Sin correos válidos no hay lote: cero lecturas de cola y cero Resend. */
export function allowlistActiva(raw: string | null | undefined): boolean {
  return parseAllowlist(raw).size > 0;
}

export type FilaSimulada = {
  id: string;
  email: string | null;
  adminHabilitado: boolean;
  consentimientoEstado: string | null;
  consentimientoOrigen: string | null;
  consentimientoRegistradoAt: string | null;
  registroAutorizadoAt?: string | null;
};

export type ResultadoSimulado = {
  procesados: number;
  enviados: number;
  escrituras: number;
  llamadasResend: number;
  fuera_allowlist: number;
  reclamadas: string[];
  excluidasSinEscritura: string[];
};

/**
 * Réplica sin red del worker. Allowlist inactiva: no escribe ni llama a Resend.
 * Fuera de la lista: la fila sigue pendiente, sin escritura ni intento.
 */
export function simularLoteManual(input: {
  enviosReales: string | null | undefined;
  allowlistRaw: string | null | undefined;
  filas: FilaSimulada[];
}): ResultadoSimulado {
  const quieto: ResultadoSimulado = {
    procesados: 0,
    enviados: 0,
    escrituras: 0,
    llamadasResend: 0,
    fuera_allowlist: 0,
    reclamadas: [],
    excluidasSinEscritura: [],
  };
  if (input.enviosReales !== "true" || !allowlistActiva(input.allowlistRaw)) {
    return quieto;
  }
  const allowlist = parseAllowlist(input.allowlistRaw);
  const reclamadas: string[] = [];
  const excluidasSinEscritura: string[] = [];
  let escrituras = 0;
  let enviados = 0;
  let fuera = 0;
  for (const fila of input.filas) {
    const decision = decidirReclamoEnvio({
      email: fila.email,
      allowlist,
      adminHabilitado: fila.adminHabilitado,
      consentimientoEstado: fila.consentimientoEstado,
      consentimientoOrigen: fila.consentimientoOrigen,
      consentimientoRegistradoAt: fila.consentimientoRegistradoAt,
      registroAutorizadoAt: fila.registroAutorizadoAt,
    });
    if (!decision.reclamar && decision.motivo === "fuera_de_allowlist") {
      fuera += 1;
      excluidasSinEscritura.push(fila.id);
      continue;
    }
    if (!decision.reclamar) {
      escrituras += 1;
      continue;
    }
    escrituras += 1;
    enviados += 1;
    reclamadas.push(fila.id);
  }
  return {
    procesados: input.filas.length,
    enviados,
    escrituras,
    llamadasResend: enviados,
    fuera_allowlist: fuera,
    reclamadas,
    excluidasSinEscritura,
  };
}

export type DecisionReclamo =
  | { reclamar: false; motivo: "fuera_de_allowlist" | "sin_correo" | "deshabilitado" | "sin_autorizacion" }
  | { reclamar: true; motivo: null };

/**
 * Allowlist primero. Si no pasa, no se reclama la fila.
 * Elegibilidad 0100/0106: admin + consentimiento documentado + correo válido.
 * No usa correo_verificado ni columnas de 0101.
 */
export function decidirReclamoEnvio(input: {
  email: string | null | undefined;
  allowlist: Set<string>;
  adminHabilitado: boolean;
  consentimientoEstado: string | null | undefined;
  consentimientoOrigen: string | null | undefined;
  consentimientoRegistradoAt: string | null | undefined;
  registroAutorizadoAt?: string | null;
}): DecisionReclamo {
  const email = normalizarEmailAllowlist(input.email);
  if (!email || !input.allowlist.has(email)) {
    return { reclamar: false, motivo: email ? "fuera_de_allowlist" : "sin_correo" };
  }
  if (!input.adminHabilitado) {
    return { reclamar: false, motivo: "deshabilitado" };
  }
  const origen = input.consentimientoOrigen?.trim().toLowerCase() ?? "";
  const origenBasura = ["inscripcion", "confirmacion_inscripcion", "tiene_correo", "email"];
  if (input.consentimientoEstado === "revocado") {
    return { reclamar: false, motivo: "sin_autorizacion" };
  }
  const consentimientoPosterior =
    input.consentimientoEstado === "autorizado" &&
    Boolean(origen) &&
    !origenBasura.includes(origen) &&
    Boolean(input.consentimientoRegistradoAt?.trim());
  if (!consentimientoPosterior) {
    return { reclamar: false, motivo: "sin_autorizacion" };
  }
  return { reclamar: true, motivo: null };
}

/** No documentar encima de una revocación ni de una autorización ya guardada. */
export function puedeDocumentarAutorizacionVerbal(
  estado: string | null | undefined
): boolean {
  return estado !== "revocado" && estado !== "autorizado";
}
