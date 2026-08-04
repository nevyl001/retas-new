/**
 * Sanitización de errores para respuestas al cliente (Fase B).
 *
 * Antes: varias funciones devolvían `error.message` crudo de Postgres/fetch
 * directo al cliente (puede incluir nombres de tabla/columna, detalles de
 * DNS/TLS, etc.). Ahora: un mensaje genérico fijo al cliente + el detalle
 * real solo en el log del servidor (vía logger.ts), correlacionado por
 * `correlationId` para poder investigar sin exponer nada.
 */

/** Mensaje genérico seguro para el cliente; nunca incluye datos internos. */
export function safeClientMessage(correlationId: string): string {
  return `No se pudo completar la operación. Si el problema persiste, contacta soporte con este código: ${correlationId}`;
}

/**
 * Verdad interna del error, para logging únicamente — nunca se envía al cliente.
 * Trunca para evitar volcar payloads enormes al log.
 */
export function internalErrorDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}
