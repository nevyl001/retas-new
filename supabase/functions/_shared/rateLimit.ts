/**
 * Cliente de rate limiting persistente para Edge Functions (Fase B).
 * Envuelve la RPC `check_rate_limit` (supabase/migrations/0006_edge_rate_limit.sql).
 * Requiere un cliente Supabase con service_role (única identidad autorizada
 * a ejecutar la RPC — ver REVOKE/GRANT en la migración).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Si es true, una falla de la RPC bloquea la solicitud (allowed=false) por seguridad */
  failClosed?: boolean;
}

/**
 * Por defecto falla abierto (permite la request) si la RPC en sí falla — un error de
 * infraestructura del rate limiter no debe tumbar la función completa.
 * Para flujos de alta sensibilidad (p. ej. autenticación de alumnos), se puede especificar
 * options.failClosed = true para bloquear preventivamente en caso de degradación.
 */
export async function checkRateLimit(
  admin: SupabaseClient,
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error || !data) {
    console.warn(
      JSON.stringify({
        level: "warn",
        module: "rateLimit",
        message: options?.failClosed
          ? "check_rate_limit RPC failed, failing closed for security"
          : "check_rate_limit RPC failed, failing open",
        detail: error?.message,
      })
    );
    if (options?.failClosed) {
      return {
        allowed: false,
        count: maxRequests,
        limit: maxRequests,
        remaining: 0,
        resetAt: new Date(Date.now() + 60 * 1000).toISOString(),
        retryAfterSeconds: 60,
      };
    }
    return {
      allowed: true,
      count: 0,
      limit: maxRequests,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString(),
      retryAfterSeconds: 0,
    };
  }

  const result = data as {
    allowed: boolean;
    count: number;
    limit: number;
    remaining: number;
    reset_at: string;
    retry_after_seconds: number;
  };

  return {
    allowed: result.allowed,
    count: result.count,
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.reset_at,
    retryAfterSeconds: result.retry_after_seconds,
  };
}

/** Respuesta 429 estándar con Retry-After, para cuando allowed=false. */
export function rateLimitedResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
      retry_after_seconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds),
      },
    }
  );
}
