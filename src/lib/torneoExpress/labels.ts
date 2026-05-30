import type { TorneoExpressEstado, TorneoExpressFaseTorneo } from "./types";

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

export function torneoExpressFaseLabel(
  fase: TorneoExpressFaseTorneo | string | null | undefined
): string | null {
  switch (fase) {
    case "eliminatoria":
      return "Eliminatoria";
    case "cerrado":
      return "Cerrado";
    case "grupos":
      return "Fase de grupos";
    default:
      return null;
  }
}
