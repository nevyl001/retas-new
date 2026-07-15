/**
 * TEMPORAL — instrumentación de diagnóstico para el flujo Realtime de
 * Torneo Express. Solo desarrollo (no imprime nada en producción).
 *
 * Borrar este archivo y sus imports en torneoExpressService.ts / useTorneoExpress.ts
 * una vez validado el flujo end-to-end (canal → status → evento → refetch → conteo).
 */
export function teRealtimeDevLog(
  label: string,
  payload: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log(`[te-realtime] ${label}`, payload);
}
