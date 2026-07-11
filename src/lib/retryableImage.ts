/**
 * Máquina de estado pura para cargar imágenes con reintentos y fallback.
 * Se usa en avatares (JugadorAvatar, roster público) para que un fallo
 * transitorio de red no deje el avatar roto permanentemente: se reintenta
 * unas veces con cache-busting y, si sigue fallando, se muestra la inicial.
 */

export interface RetryImageState {
  /** 0 = intento original; 1..N = reintentos. */
  attempt: number;
  /** true cuando se agotaron los reintentos y debe mostrarse el fallback. */
  failed: boolean;
}

export const DEFAULT_MAX_IMAGE_RETRIES = 2;

export function initialRetryImageState(): RetryImageState {
  return { attempt: 0, failed: false };
}

/**
 * Avanza el estado tras un `onError`: reintenta hasta `maxRetries` y, una vez
 * agotados, marca `failed`. Es idempotente si ya está en `failed`.
 */
export function advanceRetryImageState(
  state: RetryImageState,
  maxRetries: number = DEFAULT_MAX_IMAGE_RETRIES
): RetryImageState {
  if (state.failed) return state;
  if (state.attempt >= maxRetries) {
    return { attempt: state.attempt, failed: true };
  }
  return { attempt: state.attempt + 1, failed: false };
}

/**
 * URL efectiva a renderizar. Devuelve `null` cuando no hay foto o cuando ya
 * se agotaron los reintentos (el consumidor muestra la inicial). A partir del
 * primer reintento agrega un parámetro para forzar una petición nueva y evitar
 * que el navegador reutilice una respuesta fallida cacheada.
 */
export function resolveRetryImageSrc(
  fotoUrl: string | null | undefined,
  state: RetryImageState
): string | null {
  const trimmed = typeof fotoUrl === "string" ? fotoUrl.trim() : "";
  if (!trimmed || state.failed) return null;
  if (state.attempt <= 0) return trimmed;
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${separator}_retry=${state.attempt}`;
}
