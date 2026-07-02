/** Error mínimo de PostgREST / Supabase para clasificar fallos en RPCs de rating. */
export type RatingRpcErrorLike = {
  code?: string;
  message?: string;
  status?: number;
} | null;

/**
 * PR2 rechaza callers no autorizados con 42501 o mensajes equivalentes.
 * En vistas públicas esto debe degradar a fallback RLS, no romper la UI.
 */
export function isRpcAuthorizationDeniedError(
  error: RatingRpcErrorLike
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    error.status === 401 ||
    error.status === 403 ||
    msg.includes("permission denied") ||
    msg.includes("no autorizado") ||
    msg.includes("unauthorized")
  );
}

/** RPC o función inexistente / no desplegada — degradar sin throw. */
export function isMissingRatingRpcInfrastructureError(
  error: RatingRpcErrorLike
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.status === 405 ||
    error.code === "25006" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("method not allowed") ||
    msg.includes("read-only transaction")
  );
}

export type RatingRpcFallbackOptions = {
  /** Vista pública o cross-club: ante denegación usar fallback RLS sin throw. */
  publicRpcContext?: boolean;
};

/**
 * Indica si el error de RPC debe resolverse con fallback (null / []) en lugar de throw.
 * En contexto privado del club, la denegación de autorización sigue siendo fatal.
 */
export function shouldFallbackRatingRpcError(
  error: RatingRpcErrorLike,
  options?: RatingRpcFallbackOptions
): boolean {
  if (!error) return false;
  if (isMissingRatingRpcInfrastructureError(error)) return true;
  if (options?.publicRpcContext && isRpcAuthorizationDeniedError(error)) {
    return true;
  }
  return false;
}
