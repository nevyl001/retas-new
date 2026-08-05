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
 * Resumen claro para el organizador; detalle técnico en console / failures[].details.
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

  if (details.length === 0) {
    return [
      title,
      "",
      "Revisa las identidades Riviera de los jugadores y vuelve a intentar.",
    ].join("\n");
  }

  const byCode = new Map<string, number>();
  for (const f of details) {
    byCode.set(f.code, (byCode.get(f.code) ?? 0) + 1);
  }
  const summary = Array.from(byCode.entries())
    .map(([code, n]) => `${code} (${n})`)
    .join(", ");

  const maxLines = 5;
  const lines = details
    .map((f) => {
      const name =
        typeof f.details?.nombre === "string" ? f.details.nombre : null;
      const code =
        typeof f.details?.code === "string" ? f.details.code : f.code;
      const msg = f.message?.trim() || "Error de sincronización";
      if (name && !msg.includes(name)) {
        return `• ${name}: ${msg} [${code}]`;
      }
      return `• ${msg}`;
    })
    .filter(Boolean);

  const shown = lines.slice(0, maxLines);
  const extra = lines.length - shown.length;

  return [
    title,
    "",
    `${details.length} problema(s): ${summary}`,
    "",
    ...shown,
    ...(extra > 0 ? [`… y ${extra} más (detalle en consola).`] : []),
    "",
    "Los resultados del marcador no se revierten. Corrige el problema e intenta cerrar de nuevo.",
  ].join("\n");
}
