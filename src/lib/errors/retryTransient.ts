/**
 * Reintento acotado para fallos transitorios (red inestable, 5xx, deadlocks).
 *
 * Motivo (incidente 2026-08-05): el cierre de una reta hace decenas de
 * llamadas por jugador. En móvil/3G un único blip de red hacía fallar toda la
 * finalización y el organizador veía un error de "identidad inválida" sobre un
 * jugador que sí existía. Reintentar solo lo transitorio elimina ese ruido.
 *
 * NO reintenta errores deterministas (función ausente, RLS, unique violation,
 * validaciones de integridad): reintentarlos solo alarga el cierre.
 */

import { normalizeError } from "./normalizeError";

/** Códigos de Postgres/PostgREST que sí valen un reintento. */
const TRANSIENT_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "57014", // query_canceled (statement timeout)
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "53300", // too_many_connections
  "XX000", // internal_error (transitorio en pooler)
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "network error",
  "timeout",
  "timed out",
  "socket hang up",
  "econnreset",
  "load failed",
  "aborted",
  "temporarily unavailable",
  "service unavailable",
  "gateway",
];

/** true si el error merece un reintento. */
export function isTransientError(error: unknown): boolean {
  const { code, message, status } = normalizeError(error);

  if (status != null) {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    // 4xx (salvo 429) es determinista: no reintentar.
    if (status >= 400 && status < 500) return false;
  }

  if (code && TRANSIENT_PG_CODES.has(code)) return true;
  // PGRST2xx (schema cache / función ausente) nunca es transitorio.
  if (code && code.startsWith("PGRST")) return false;

  const lower = message.toLowerCase();
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => lower.includes(pattern));
}

export type RetryTransientOptions = {
  /** Intentos totales, incluyendo el primero. Default 3. */
  attempts?: number;
  /** Espera base en ms (backoff exponencial + jitter). Default 250. */
  baseDelayMs?: number;
  /** Etiqueta para logging. */
  label?: string;
  /** Predicado extra para no reintentar (ej. excepciones de integridad). */
  shouldRetry?: (error: unknown) => boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta `fn` reintentando solo fallos transitorios, con backoff + jitter.
 * Relanza el último error si se agotan los intentos.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  options: RetryTransientOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 250;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable =
        options.shouldRetry?.(error) ?? isTransientError(error);
      if (!retryable || attempt === attempts) {
        throw error;
      }

      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      console.warn(
        `[retry] ${options.label ?? "operación"} intento ${attempt}/${attempts} falló, reintentando`,
        normalizeError(error).message
      );
      await delay(backoff + jitter);
    }
  }

  throw lastError;
}
