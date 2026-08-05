/**
 * Normalización central de errores.
 *
 * Motivo (incidente 2026-08-05): al finalizar una reta el organizador veía
 * «... no tiene una identidad Riviera válida ([object Object])». La causa era
 * `String(e)` sobre un PostgrestError (objeto plano, no Error), que en JS
 * produce literalmente "[object Object]" y oculta el error real (code/hint).
 *
 * Regla: nunca usar `String(error)` ni `alert(error)` para mostrar un error.
 * Usar `errorMessage(error)` para UI y `normalizeError(error)` para logging.
 */

export type NormalizedError = {
  /** Mensaje legible. Nunca "[object Object]". */
  message: string;
  /** Código de Postgres/PostgREST (ej. PGRST202, 42501) si viene. */
  code?: string;
  details?: string;
  hint?: string;
  /** HTTP status si viene (fetch/PostgREST). */
  status?: number;
  /** Valor original, para logging estructurado. */
  raw: unknown;
};

const FALLBACK_MESSAGE = "Error desconocido";

function asText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/** true si el string no aporta información (resultado de coerción implícita). */
function isUselessMessage(message: string | undefined): boolean {
  if (!message) return true;
  return (
    message === "[object Object]" ||
    message === "{}" ||
    message === "undefined" ||
    message === "null"
  );
}

function stringifyUnknown(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json && json !== "{}" && json !== "null") return json;
  } catch {
    // referencias circulares → cae al fallback
  }
  return FALLBACK_MESSAGE;
}

/**
 * Convierte cualquier excepción en una forma estructurada y legible.
 * Soporta Error, PostgrestError/AuthError, respuestas `{ error: ... }`,
 * strings, arrays de errores y objetos arbitrarios.
 */
export function normalizeError(input: unknown): NormalizedError {
  if (input == null) {
    return { message: FALLBACK_MESSAGE, raw: input };
  }

  const directText = asText(input);
  if (directText !== undefined) {
    return { message: directText, raw: input };
  }

  if (input instanceof Error) {
    const record = input as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };
    const message = isUselessMessage(input.message)
      ? input.name || FALLBACK_MESSAGE
      : input.message;
    return {
      message,
      code: asText(record.code),
      details: asText(record.details),
      hint: asText(record.hint),
      status: typeof record.status === "number" ? record.status : undefined,
      raw: input,
    };
  }

  if (Array.isArray(input)) {
    const parts = input
      .map((item) => normalizeError(item).message)
      .filter((m) => m && m !== FALLBACK_MESSAGE);
    return {
      message: parts.length > 0 ? parts.join("; ") : FALLBACK_MESSAGE,
      raw: input,
    };
  }

  if (typeof input === "object") {
    const record = input as Record<string, unknown>;

    // Respuestas Supabase tipo { data, error } — desenvolver el error real.
    if (record.error != null && record.error !== input) {
      const inner = normalizeError(record.error);
      if (!isUselessMessage(inner.message) && inner.message !== FALLBACK_MESSAGE) {
        return { ...inner, raw: input };
      }
    }

    const code = asText(record.code);
    const details = asText(record.details);
    const hint = asText(record.hint);
    const status =
      typeof record.status === "number" ? record.status : undefined;

    const candidate =
      asText(record.message) ??
      asText(record.msg) ??
      asText(record.error_description) ??
      asText(record.description) ??
      asText(record.statusText);

    let message = candidate;
    if (isUselessMessage(message)) {
      // Sin mensaje utilizable: construir uno con lo que haya.
      message = details ?? hint ?? undefined;
    }
    if (isUselessMessage(message)) {
      message = code ? `Error ${code}` : stringifyUnknown(input);
    }

    return {
      message: message ?? FALLBACK_MESSAGE,
      code,
      details,
      hint,
      status,
      raw: input,
    };
  }

  return { message: stringifyUnknown(input), raw: input };
}

/** Mensaje legible listo para UI. Reemplaza `String(error)`. */
export function errorMessage(input: unknown): string {
  return normalizeError(input).message;
}

/**
 * Mensaje con código técnico entre corchetes cuando existe.
 * Útil para que el organizador pueda reportar el error con precisión.
 */
export function errorMessageWithCode(input: unknown): string {
  const { message, code } = normalizeError(input);
  return code ? `${message} [${code}]` : message;
}

/**
 * Error real (instancia de Error) preservando code/details/hint.
 * Usar al relanzar errores crudos de Supabase para que ningún consumidor
 * pueda degradarlos a "[object Object]".
 */
export function toError(input: unknown, context?: string): Error {
  const normalized = normalizeError(input);
  if (input instanceof Error && !context) return input;

  const message = context
    ? `${context}: ${normalized.message}`
    : normalized.message;
  const error = new Error(message) as Error & {
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
    cause?: unknown;
  };
  if (normalized.code) error.code = normalized.code;
  if (normalized.details) error.details = normalized.details;
  if (normalized.hint) error.hint = normalized.hint;
  if (normalized.status != null) error.status = normalized.status;
  error.cause = input;
  return error;
}

/** Payload plano para console.error / logging estructurado. */
export function errorLogPayload(input: unknown): Record<string, unknown> {
  const { message, code, details, hint, status } = normalizeError(input);
  return {
    message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
    ...(hint ? { hint } : {}),
    ...(status != null ? { status } : {}),
  };
}
