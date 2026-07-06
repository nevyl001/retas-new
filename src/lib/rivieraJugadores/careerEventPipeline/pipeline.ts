import { clearOrganizerDisplayNameCache } from "../../organizer/organizerDisplayName";
import { isCareerIntegrityException } from "../careerIntegrity";
import { prepareParticipacionIdentityForOrganizer } from "../jugadorIdResolver";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import { rebuildJugadorStats } from "../rivieraJugadoresService";
import { assertCareerEventIntegrity } from "./assertions";
import { runCareerEventSync } from "./handlers";
import { validateCareerEventPreClose } from "./preCloseGuards";
import type {
  CareerEventAssertionFailure,
  CareerEventPipelineResult,
  FinalizeCareerEventInput,
} from "./types";
import { CAREER_EVENT_KIND_TO_TIPO } from "./types";

const LOG_PREFIX = "[career-event-pipeline]";

async function refreshJugadorStatsBatch(
  jugadorIds: Iterable<string>
): Promise<void> {
  const unique = Array.from(new Set(Array.from(jugadorIds).filter(Boolean)));
  await Promise.allSettled(unique.map((id) => rebuildJugadorStats(id)));
}

function defaultRatingPartidoRefs(
  input: FinalizeCareerEventInput
): string[] | undefined {
  if (input.kind === "duelo_2v2") {
    return [`duelo2v2:${input.duelo.id}`];
  }
  return undefined;
}

function defaultRequireRating(input: FinalizeCareerEventInput): boolean {
  return input.kind === "duelo_2v2" || input.kind === "reta";
}

function integrityFailureFromError(
  error: unknown,
  input: FinalizeCareerEventInput
): CareerEventAssertionFailure {
  if (isCareerIntegrityException(error)) {
    return {
      code:
        error.confidence === "REVIEW"
          ? "ambiguous_profile_link"
          : "career_integrity_blocked",
      message: error.message,
      jugadorId: error.jugadorId,
      details: {
        ...error.toStructuredLog(),
        kind: input.kind,
      },
    };
  }
  return {
    code: "career_integrity_blocked",
    message: error instanceof Error ? error.message : String(error),
    details: { kind: input.kind },
  };
}

/**
 * Pipeline canónico de carrera deportiva.
 * Toda modalidad finalizada debe pasar por aquí.
 */
export async function finalizeCareerEvent(
  input: FinalizeCareerEventInput
): Promise<CareerEventPipelineResult> {
  return processCareerEvent(input);
}

/** Alias público del pipeline canónico. */
export async function processCareerEvent(
  input: FinalizeCareerEventInput
): Promise<CareerEventPipelineResult> {
  const started = Date.now();
  const options = input.options ?? {};
  const failures: CareerEventAssertionFailure[] = [];

  console.info(LOG_PREFIX, "start", {
    kind: input.kind,
    organizadorId: input.organizadorId,
  });

  if (!options.skipIdentityEnsure) {
    try {
      await prepareParticipacionIdentityForOrganizer(input.organizadorId);
    } catch (e) {
      console.warn(LOG_PREFIX, "prepareParticipacionIdentityForOrganizer:", e);
    }
  }

  let syncResult: Awaited<ReturnType<typeof runCareerEventSync>> | null = null;
  let touchedJugadorIds: string[] = [];

  if (!options.skipAssertions) {
    const preClose = await validateCareerEventPreClose(
      input,
      async (ref, organizadorId) =>
        resolveJugadorIdForParticipacion({
          organizadorId,
          jugadorId: ref.jugadorId,
          nombre: ref.nombre,
          legacyPlayerId: ref.legacyPlayerId,
          tipoEvento: input.kind,
        })
    );
    if (!preClose.ok) {
      failures.push(...preClose.failures);
    }
  }

  if (failures.length === 0) {
    try {
      syncResult = await runCareerEventSync(input);
      if (syncResult.syncError) {
        failures.push({
          code: "sync_failed",
          message: syncResult.syncError,
          details: { kind: input.kind },
        });
      }
      touchedJugadorIds = syncResult.touchedJugadorIds;
    } catch (e) {
      failures.push(integrityFailureFromError(e, input));
      console.error(LOG_PREFIX, "sync blocked by integrity", e);
    }
  }

  if (touchedJugadorIds.length > 0) {
    await refreshJugadorStatsBatch(touchedJugadorIds);
  }

  if (!options.skipAssertions && syncResult && failures.length === 0) {
    const assertionFailures = await assertCareerEventIntegrity({
      context: syncResult.context,
      touchedJugadorIds,
      requireRating:
        options.requireRating ?? defaultRequireRating(input),
      ratingPartidoRefs:
        options.ratingPartidoRefs ?? defaultRatingPartidoRefs(input),
    });
    failures.push(...assertionFailures);
  }

  clearOrganizerDisplayNameCache();

  const ok = failures.length === 0;
  const durationMs = Date.now() - started;

  const result: CareerEventPipelineResult = {
    ok,
    processed: ok && Boolean(syncResult) && !syncResult?.syncError,
    context:
      syncResult?.context ?? {
        kind: input.kind,
        organizadorId: input.organizadorId,
        hostOrganizadorId: input.organizadorId,
        eventoId: "",
        tipoEvento: CAREER_EVENT_KIND_TO_TIPO[input.kind],
      },
    touchedJugadorIds,
    failures,
    durationMs,
  };

  if (!ok) {
    console.error(LOG_PREFIX, "incomplete", result);
  } else {
    console.info(LOG_PREFIX, "complete", {
      kind: input.kind,
      eventoId: syncResult?.context.eventoId,
      players: touchedJugadorIds.length,
      durationMs,
    });
  }

  return result;
}
