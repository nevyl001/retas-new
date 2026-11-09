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

/** Lista vacía = nadie. Fail closed. */
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
  if (
    input.consentimientoEstado !== "autorizado" ||
    !origen ||
    origenBasura.includes(origen) ||
    !input.consentimientoRegistradoAt?.trim()
  ) {
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
