import type { CareerEventContext, FinalizeCareerEventInput } from "./types";
import { CAREER_EVENT_KIND_TO_TIPO } from "./types";

export type CareerEventHandlerResult = {
  context: CareerEventContext;
  touchedJugadorIds: string[];
  syncError?: string;
};

/**
 * Ejecuta la sincronización de participaciones de la modalidad.
 * Delega en syncParticipaciones (única implementación de reglas por formato).
 */
export async function runCareerEventSync(
  input: FinalizeCareerEventInput
): Promise<CareerEventHandlerResult> {
  const {
    syncRetaParticipaciones,
    syncDuelo2v2Participaciones,
    syncAmericanoParticipaciones,
    syncTorneoExpressParticipaciones,
    syncLigaJornada,
    syncLigaFinalPodio,
    syncLigaInscripcionRanking,
    collectJugadorIdsForCareerEvent,
  } = await import("../syncParticipaciones");

  const kind = input.kind;
  const organizadorId = input.organizadorId;
  let eventoId = "";
  let touchedJugadorIds: string[] = [];
  let syncError: string | undefined;
  let participacionEventoId: string | undefined;

  try {
    switch (input.kind) {
      case "reta": {
        eventoId = input.tournament.id;
        const outcome = await syncRetaParticipaciones({
          organizadorId,
          tournament: input.tournament,
          pairs: input.pairs,
          matches: input.matches,
        });
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      case "duelo_2v2": {
        eventoId = input.duelo.id;
        const outcome = await syncDuelo2v2Participaciones({
          organizadorId,
          duelo: input.duelo,
        });
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      case "americano": {
        eventoId = input.sesionId;
        const outcome = await syncAmericanoParticipaciones(
          input.sesionId,
          input.nombre,
          input.roster,
          input.rounds,
          organizadorId
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      case "torneo_express": {
        eventoId = input.torneoId;
        const outcome = await syncTorneoExpressParticipaciones(
          input.torneoId,
          organizadorId
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      case "liga_jornada": {
        eventoId = input.ligaId;
        const outcome = await syncLigaJornada(
          input.ligaId,
          input.jornadaNumero,
          organizadorId
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        if (participacionEventoId) eventoId = participacionEventoId;
        break;
      }
      case "liga_podio": {
        eventoId = input.ligaId;
        const outcome = await syncLigaFinalPodio(input.ligaId, organizadorId);
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      case "liga_inscripcion": {
        eventoId = input.ligaId;
        const outcome = await syncLigaInscripcionRanking(
          input.ligaId,
          input.jugadorId,
          organizadorId
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        break;
      }
      default: {
        const _exhaustive: never = input;
        throw new Error(`Modalidad no soportada: ${(_exhaustive as { kind: string }).kind}`);
      }
    }
  } catch (e) {
    syncError =
      e && typeof e === "object" && "message" in e
        ? String((e as { message?: string }).message)
        : String(e);
    console.error("[career-event-pipeline:sync]", syncError, e);
  }

  if (touchedJugadorIds.length === 0 && eventoId) {
    const lookupId = participacionEventoId ?? eventoId;
    touchedJugadorIds = await collectJugadorIdsForCareerEvent(
      CAREER_EVENT_KIND_TO_TIPO[kind],
      lookupId
    );
  }

  const context: CareerEventContext = {
    kind,
    organizadorId,
    hostOrganizadorId: organizadorId,
    eventoId: participacionEventoId ?? eventoId,
    tipoEvento: CAREER_EVENT_KIND_TO_TIPO[kind],
  };

  return { context, touchedJugadorIds, syncError };
}
