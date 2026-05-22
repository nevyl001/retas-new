import type { TorneoExpressPartido } from "./types";

/** Felicitación pública solo cuando hay calendario y todos los juegos están jugados. */
export function isGrupoPartidosCompletos(
  partidos: TorneoExpressPartido[]
): boolean {
  return partidos.length > 0 && partidos.every((p) => p.estado === "jugado");
}
