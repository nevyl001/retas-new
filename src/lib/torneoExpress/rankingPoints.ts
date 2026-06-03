/**
 * Puntos de ranking Riviera Open para Torneo Express.
 *
 * Inspirado en Premier Pádel / FIP (puntos por ronda alcanzada, no por juegos del partido).
 * Escala local simplificada acordada para mini-torneos del club:
 *   - Campeón (ganador de la final): 100
 *   - Subcampeón (perdedor de la final): 50
 *   - Resto de participantes: 0
 *
 * La columna PTS de la tabla de grupos sigue siendo PG×2 (standings.ts); esto solo
 * aplica al registro global riviera_jugadores / jugador_stats.puntos_obtenidos.
 */

export const RIVIERA_TE_RANK_CAMPEON = 100;
export const RIVIERA_TE_RANK_SUBCAMPEON = 50;
export const RIVIERA_TE_RANK_OTROS = 0;

export type RivieraTePlacement = "campeon" | "subcampeon" | "otro";

export function puntosRankingPorPlacement(
  placement: RivieraTePlacement
): number {
  switch (placement) {
    case "campeon":
      return RIVIERA_TE_RANK_CAMPEON;
    case "subcampeon":
      return RIVIERA_TE_RANK_SUBCAMPEON;
    default:
      return RIVIERA_TE_RANK_OTROS;
  }
}
