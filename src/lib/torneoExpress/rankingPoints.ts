/**
 * @deprecated Preferir `rivieraRankingPoints` (esquema riviera_open_v1).
 */
import { calcularPuntosEvento } from "../rivieraJugadores/rivieraRankingPoints";

export {
  PUNTOS_EXPRESS,
  calcularPuntosEvento,
} from "../rivieraJugadores/rivieraRankingPoints";

export type RivieraTePlacement = "campeon" | "subcampeon" | "otro";

/** @deprecated */
export function puntosRankingPorPlacement(placement: RivieraTePlacement): number {
  if (placement === "campeon") {
    return calcularPuntosEvento({ formato: "express", posicion_final: 1 });
  }
  if (placement === "subcampeon") {
    return calcularPuntosEvento({ formato: "express", posicion_final: 2 });
  }
  return calcularPuntosEvento({ formato: "express" });
}
