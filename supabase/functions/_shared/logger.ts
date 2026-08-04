/**
 * Logging estructurado para Edge Functions (Fase B).
 *
 * Reglas duras (ver CLAUDE.md / auditoría de preproducción): nunca loguear
 * tokens, contraseñas, headers de Authorization, correos/teléfonos
 * completos, payloads completos de jugadores, ni secretos. Cada call site
 * decide explícitamente qué campos pasar — este helper no intenta "adivinar"
 * qué redactar de un objeto arbitrario (eso escondería fugas en vez de
 * prevenirlas). Los campos van planos y explícitos en `context`.
 */

const RELEASE_VERSION = Deno.env.get("RELEASE_VERSION") ?? "unknown";

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

interface BaseLogFields {
  correlationId: string;
  module: string;
}

function emit(
  level: "info" | "warn" | "error",
  fields: BaseLogFields & Record<string, unknown>
): void {
  const line = {
    level,
    release: RELEASE_VERSION,
    ts: new Date().toISOString(),
    ...fields,
  };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export function logInfo(fields: BaseLogFields & Record<string, unknown>): void {
  emit("info", fields);
}

export function logWarn(fields: BaseLogFields & Record<string, unknown>): void {
  emit("warn", fields);
}

export function logError(
  fields: BaseLogFields & { errorType: string; detail?: string } & Record<string, unknown>
): void {
  emit("error", fields);
}
