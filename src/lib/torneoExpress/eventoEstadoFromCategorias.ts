import type {
  TorneoExpress,
  TorneoExpressEventoEstado,
} from "./types";

/** Categoría cerrada/finalizada (deportivamente). */
export function isCategoriaTorneoFinalizada(
  cat: Pick<TorneoExpress, "estado" | "fase_torneo">
): boolean {
  return cat.estado === "finalizado" || cat.fase_torneo === "cerrado";
}

/**
 * Estado efectivo del Evento según sus categorías (`torneo_express` con evento_id).
 * - draft / archived: no se auto-cambia.
 * - todas finalizadas → completed
 * - alguna abierta y estaba completed → published (reabre)
 * - sin categorías: se conserva el actual
 */
export function resolveEventoEstadoFromCategorias(
  current: TorneoExpressEventoEstado,
  categorias: Array<Pick<TorneoExpress, "estado" | "fase_torneo">>
): TorneoExpressEventoEstado {
  if (current === "draft" || current === "archived") return current;
  if (categorias.length === 0) return current;

  const allDone = categorias.every(isCategoriaTorneoFinalizada);
  if (allDone) return "completed";
  if (current === "completed") return "published";
  return current;
}
