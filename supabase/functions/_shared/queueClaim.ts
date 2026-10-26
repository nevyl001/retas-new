/**
 * Decisión de reclamo. Una fila ausente o que ya no está pendiente no se escribe.
 * La simulación de Nivel B usa esta función; no habla con producción.
 */
export type QueueSnapshot = { estado: string; attempts: number } | null;

export function decideQueueClaim(
  row: QueueSnapshot,
): { write: false } | { write: true; attempts: number } {
  if (!row || row.estado !== "pendiente") return { write: false };
  return { write: true, attempts: row.attempts + 1 };
}

export function settleQueueClaim(
  attempts: number,
  failed: boolean,
): { estado: "procesado" | "error"; attempts: number; error_detalle: string | null } {
  if (failed) {
    return { estado: "error", attempts, error_detalle: "error" };
  }
  return { estado: "procesado", attempts, error_detalle: null };
}
