/**
 * Espejo puro de `_is_official_ranking_emitter` (ROMC-2 / 0021).
 * Política de producto: todo org activo en `users` emite, salvo fila
 * `riviera_official_ranking_emitters.is_active = false`.
 */
export function isOfficialRankingEmitterPure(input: {
  organizadorId: string | null | undefined;
  /** Existe fila en public.users */
  existsInUsers: boolean;
  /** Fila en riviera_official_ranking_emitters, si hay */
  emitterRow: { is_active: boolean } | null;
}): boolean {
  if (!input.organizadorId) return false;
  if (input.emitterRow && input.emitterRow.is_active === false) return false;
  return input.existsInUsers === true;
}
