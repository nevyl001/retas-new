import { errorLogPayload, errorMessageWithCode } from "../../errors/normalizeError";
import type { CareerEventContext, FinalizeCareerEventInput } from "./types";
import { CAREER_EVENT_KIND_TO_TIPO } from "./types";
import { isCareerIntegrityException } from "../careerIntegrity";
import type { CloseIdentityCache } from "./closeIdentityCache";

export type CareerEventHandlerResult = {
  context: CareerEventContext;
  touchedJugadorIds: string[];
  syncError?: string;
  syncFailures?: import("./types").CareerEventAssertionFailure[];
};

export type CareerEventSyncRunOptions = {
  excludeJugadorIds?: string[];
  /**
   * Perf batch-1 (2026-08-08): se propaga a TODAS las modalidades (antes
   * solo a "reta"). Cada sync* decide internamente si lo usa; pasar el
   * mismo caché no cambia ninguna validación, solo evita repetir una
   * resolución de identidad ya hecha en este mismo cierre.
   */
  identityCache?: CloseIdentityCache;
};

/**
 * Ejecuta la sincronización de participaciones de la modalidad.
 * Delega en syncParticipaciones (única implementación de reglas por formato).
 */
export async function runCareerEventSync(
  input: FinalizeCareerEventInput,
  runOptions?: CareerEventSyncRunOptions
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
  const excludeJugadorIds = runOptions?.excludeJugadorIds;
  let eventoId = "";
  let touchedJugadorIds: string[] = [];
  let syncError: string | undefined;
  let syncFailures: import("./types").CareerEventAssertionFailure[] | undefined;
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
          excludeJugadorIds,
          identityCache: runOptions?.identityCache,
        });
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      case "duelo_2v2": {
        eventoId = input.duelo.id;
        const outcome = await syncDuelo2v2Participaciones({
          organizadorId,
          duelo: input.duelo,
          excludeJugadorIds,
          identityCache: runOptions?.identityCache,
        });
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      case "americano": {
        eventoId = input.sesionId;
        const outcome = await syncAmericanoParticipaciones(
          input.sesionId,
          input.nombre,
          input.roster,
          input.rounds,
          organizadorId,
          { excludeJugadorIds, identityCache: runOptions?.identityCache }
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      case "torneo_express": {
        eventoId = input.torneoId;
        const outcome = await syncTorneoExpressParticipaciones(
          input.torneoId,
          organizadorId,
          { excludeJugadorIds, identityCache: runOptions?.identityCache }
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      case "liga_jornada": {
        eventoId = input.ligaId;
        const outcome = await syncLigaJornada(
          input.ligaId,
          input.jornadaNumero,
          organizadorId,
          { excludeJugadorIds, identityCache: runOptions?.identityCache }
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        if (participacionEventoId) eventoId = participacionEventoId;
        break;
      }
      case "liga_podio": {
        eventoId = input.ligaId;
        const outcome = await syncLigaFinalPodio(input.ligaId, organizadorId, {
          excludeJugadorIds,
          identityCache: runOptions?.identityCache,
        });
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      case "liga_inscripcion": {
        eventoId = input.ligaId;
        const outcome = await syncLigaInscripcionRanking(
          input.ligaId,
          input.jugadorId,
          organizadorId,
          { excludeJugadorIds, identityCache: runOptions?.identityCache }
        );
        touchedJugadorIds = outcome.touchedJugadorIds;
        participacionEventoId = outcome.participacionEventoId;
        syncFailures = outcome.syncFailures;
        break;
      }
      default: {
        const _exhaustive: never = input;
        throw new Error(`Modalidad no soportada: ${(_exhaustive as { kind: string }).kind}`);
      }
    }
  } catch (e) {
    if (isCareerIntegrityException(e)) {
      throw e;
    }
    syncError = errorMessageWithCode(e);
    console.error("[career-event-pipeline:sync]", errorLogPayload(e), e);
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

  return { context, touchedJugadorIds, syncError, syncFailures };
}
