import type { TorneoExpressEstado } from "./types";

export function torneoExpressEstadoLabel(
  estado: TorneoExpressEstado | string
): string {
  switch (estado) {
    case "en_curso":
      return "En curso";
    case "finalizado":
      return "Finalizado";
    case "pendiente":
      return "Pendiente";
    default:
      return "Pendiente";
  }
}
