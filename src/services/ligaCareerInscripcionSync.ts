import type { LigaDetalle } from "../lib/liga/types";
import { isEquiposModalidad, parseLigaModalidad } from "../lib/liga/ligaModalidad";

/** IDs legacy (`liga_jugadores.id`) de todos los participantes, cualquier modalidad. */
export function collectLigaParticipantLegacyJugadorIds(
  detalle: Pick<LigaDetalle, "modalidad" | "inscripciones" | "equipos">
): string[] {
  const modalidad = parseLigaModalidad(detalle.modalidad);
  if (isEquiposModalidad(modalidad)) {
    const ids = new Set<string>();
    for (const eq of detalle.equipos ?? []) {
      if (eq.jugador1_id) ids.add(eq.jugador1_id);
      if (eq.jugador2_id) ids.add(eq.jugador2_id);
    }
    return Array.from(ids);
  }
  return (detalle.inscripciones ?? [])
    .map((i) => i.jugador_id)
    .filter((id): id is string => Boolean(id));
}

/** +100 ranking Riviera al inscribirse (idempotente por jugador/liga). */
export function fireLigaInscripcionRankingSync(
  ligaId: string,
  legacyLigaJugadorId: string,
  organizadorId: string
): void {
  void import("../lib/rivieraJugadores/careerEventPipeline")
    .then(({ finalizeCareerEvent }) =>
      finalizeCareerEvent({
        kind: "liga_inscripcion",
        organizadorId,
        ligaId,
        jugadorId: legacyLigaJugadorId,
        options: { telemetry: true, identityCache: true },
      })
    )
    .then((result) => {
      if (result && !result.ok) {
        console.error(
          "[riviera-jugadores] sync inscripción liga incompleto:",
          {
            ligaId,
            jugadorId: legacyLigaJugadorId,
            organizadorId,
            failures: result.failures,
          }
        );
      }
    })
    .catch((err) =>
      console.error("[riviera-jugadores] sync inscripción liga:", err)
    );
}

/** Repara inscripciones faltantes (p. ej. ligas por equipos ya iniciadas). */
export async function ensureLigaInscripcionRankingForLiga(
  ligaId: string,
  organizadorId: string,
  legacyJugadorIds: readonly string[]
): Promise<void> {
  const unique = Array.from(
    new Set(legacyJugadorIds.map((id) => id.trim()).filter(Boolean))
  );
  if (unique.length === 0) return;

  const { finalizeCareerEvent } = await import(
    "../lib/rivieraJugadores/careerEventPipeline"
  );

  await Promise.allSettled(
    unique.map((jugadorId) =>
      finalizeCareerEvent({
        kind: "liga_inscripcion",
        organizadorId,
        ligaId,
        jugadorId,
        options: { telemetry: true, identityCache: true },
      }).then((result) => {
        if (result && !result.ok) {
          console.error(
            "[riviera-jugadores] ensure inscripción liga incompleto:",
            { ligaId, jugadorId, organizadorId, failures: result.failures }
          );
        }
      })
    )
  );
}
