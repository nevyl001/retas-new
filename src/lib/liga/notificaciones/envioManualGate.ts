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

/** Solo el valor exacto "operativo" sale del modo prueba. Una allowlist vacía no lo activa. */
export function modoOperativoManual(raw: string | null | undefined): boolean {
  return raw === "operativo";
}

export const MAX_DESTINATARIOS_LOTE = 50;

/** Sin correos válidos no hay lote de prueba: cero lecturas de cola y cero Resend. */
export function allowlistActiva(raw: string | null | undefined): boolean {
  return parseAllowlist(raw).size > 0;
}

export type FilaSimulada = {
  id: string;
  loteId?: string | null;
  email: string | null;
  adminHabilitado: boolean;
  consentimientoEstado: string | null;
  consentimientoOrigen: string | null;
  consentimientoRegistradoAt: string | null;
  registroAutorizadoAt?: string | null;
  estado?: "pendiente" | "procesando" | "enviado" | "error" | "omitido" | "pausado";
  attempts?: number;
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
  modo?: string | null;
  loteId?: string | null;
  fallos?: string[];
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
  const operativo = modoOperativoManual(input.modo);
  if (input.enviosReales !== "true") return quieto;
  if (!operativo && !allowlistActiva(input.allowlistRaw)) return quieto;
  if (input.loteId === null || input.loteId === "") return quieto;
  const filas = (input.loteId
    ? input.filas.filter((fila) => fila.loteId === input.loteId)
    : input.filas
  ).slice(0, MAX_DESTINATARIOS_LOTE);
  const allowlist = parseAllowlist(input.allowlistRaw);
  const fallos = new Set(input.fallos ?? []);
  const reclamadas: string[] = [];
  const excluidasSinEscritura: string[] = [];
  let escrituras = 0;
  let enviados = 0;
  let fallidos = 0;
  let fuera = 0;
  for (const fila of filas) {
    if (fila.estado === "enviado" || fila.estado === "procesando") continue;
    if ((fila.attempts ?? 0) >= 3) continue;
    const decision = decidirReclamoEnvio({
      email: fila.email,
      allowlist,
      exigirAllowlist: !operativo,
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
    if (fallos.has(fila.id)) {
      fallidos += 1;
      continue;
    }
    enviados += 1;
    reclamadas.push(fila.id);
  }
  return {
    procesados: filas.length,
    enviados,
    escrituras,
    llamadasResend: enviados + fallidos,
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
  exigirAllowlist?: boolean;
  adminHabilitado: boolean;
  consentimientoEstado: string | null | undefined;
  consentimientoOrigen: string | null | undefined;
  consentimientoRegistradoAt: string | null | undefined;
  registroAutorizadoAt?: string | null;
}): DecisionReclamo {
  const email = normalizarEmailAllowlist(input.email);
  const exigirAllowlist = input.exigirAllowlist !== false;
  if (!email || (exigirAllowlist && !input.allowlist.has(email))) {
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

/** Una confirmación, un lote, una clave. Otra confirmación no reutiliza la anterior. */
export function claveIdempotenciaManual(input: {
  tipo: string;
  ligaId: string;
  loteId: string;
  jugadorId: string;
}): string {
  return `manual:${input.tipo}:${input.ligaId}:${input.loteId}:${input.jugadorId}`;
}

export type FilaEncolada = {
  clave: string;
  loteId: string;
  jugadorId: string;
  estado: "pendiente" | "procesando" | "enviado" | "error";
};

/**
 * Nueva confirmación inserta otra fila. La misma clave solo reintenta esa operación.
 * `permiteOtroEnviado` es falso mientras el índice único incluya las ya enviadas.
 */
export function decidirEncoladoManual(input: {
  filas: FilaEncolada[];
  tipo: string;
  ligaId: string;
  loteId: string;
  jugadorId: string;
  permiteOtroEnviado: boolean;
}): {
  motivo: "encolado" | "ya_encolado" | "ya_enviado" | "bloqueado_por_enviado";
  filas: FilaEncolada[];
} {
  const clave = claveIdempotenciaManual(input);
  const misma = input.filas.find((fila) => fila.clave === clave);
  if (misma?.estado === "enviado") {
    return { motivo: "ya_enviado", filas: input.filas };
  }
  if (misma && (misma.estado === "pendiente" || misma.estado === "procesando")) {
    return { motivo: "ya_encolado", filas: input.filas };
  }
  const enCurso = input.filas.some(
    (fila) =>
      fila.jugadorId === input.jugadorId &&
      (fila.estado === "pendiente" || fila.estado === "procesando")
  );
  if (enCurso) return { motivo: "ya_encolado", filas: input.filas };
  const yaAceptada = input.filas.some(
    (fila) => fila.jugadorId === input.jugadorId && fila.estado === "enviado"
  );
  if (yaAceptada && !input.permiteOtroEnviado) {
    return { motivo: "bloqueado_por_enviado", filas: input.filas };
  }
  return {
    motivo: "encolado",
    filas: [
      ...input.filas,
      {
        clave,
        loteId: input.loteId,
        jugadorId: input.jugadorId,
        estado: "pendiente",
      },
    ],
  };
}
