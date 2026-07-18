import type { CareerEventPipelineResult } from "./types";

const KIND_LABELS: Record<CareerEventPipelineResult["context"]["kind"], string> = {
  reta: "Reta",
  duelo_2v2: "Duelo 2v2",
  americano: "Americano",
  torneo_express: "Torneo express",
  liga_jornada: "Jornada de liga",
  liga_podio: "Podio de liga",
  liga_inscripcion: "Inscripción de liga",
};

/**
 * Mensaje de éxito del pipeline canónico — confirma en la UI que la arquitectura
 * ejecutó registro, participaciones, rating, ranking y historial global sin pasos manuales.
 */
export function formatCareerPipelineSuccessMessage(
  result: CareerEventPipelineResult,
  eventName?: string
): string {
  const kindLabel = KIND_LABELS[result.context.kind] ?? "Evento";
  const title = eventName?.trim()
    ? `${kindLabel} «${eventName.trim()}» finalizada`
    : `${kindLabel} finalizada`;

  const playerCount = result.touchedJugadorIds.length;
  const playersLine =
    playerCount > 0
      ? `✓ Participaciones generadas (${playerCount} jugador${playerCount === 1 ? "" : "es"})`
      : "✓ Participaciones generadas";

  return [
    `${title} — pipeline de carrera completado`,
    "",
    "✓ Resultado registrado",
    playersLine,
    "✓ Rating Riviera actualizado",
    "✓ Ranking y estadísticas actualizados",
    "✓ Historial global sincronizado (Riviera ID)",
    "",
    "Verifica en la ficha de cada jugador que el evento aparece en Historial desde cualquier club vinculado al mismo Riviera ID.",
  ].join("\n");
}

/**
 * Mensaje cuando el pre-close u otras fallas críticas bloquean el cierre.
 * Prefiere failures[].message (accionables) sobre códigos técnicos.
 */
export function formatCareerPipelineFailureMessage(
  result: CareerEventPipelineResult,
  eventName?: string
): string {
  const kindLabel = KIND_LABELS[result.context.kind] ?? "Evento";
  const title = eventName?.trim()
    ? `No se pudo cerrar ${kindLabel.toLowerCase()} «${eventName.trim()}»`
    : `No se pudo cerrar ${kindLabel.toLowerCase()}`;

  const details =
    result.criticalFailures.length > 0
      ? result.criticalFailures
      : result.failures;

  const lines = details.map((f) => f.message).filter(Boolean);
  if (lines.length === 0) {
    return [
      title,
      "",
      "Revisa las identidades Riviera de los jugadores y vuelve a intentar.",
    ].join("\n");
  }

  return [title, "", ...lines].join("\n");
}
