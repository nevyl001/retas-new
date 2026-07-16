import { clearOrganizerDisplayNameCache } from "../../organizer/organizerDisplayName";
import { isCareerIntegrityException } from "../careerIntegrity";
import { prepareParticipacionIdentityForOrganizer } from "../jugadorIdResolver";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import { rebuildJugadorStats } from "../rivieraJugadoresService";
import { invalidatePlayersPool } from "../playersPoolCache";
import { invalidateCareerIdentityCacheForPlayer } from "../careerIdentityCache";
import {
  assertCareerEventIntegrity,
  partitionAssertionFailures,
} from "./assertions";
import { runCareerEventSync } from "./handlers";
import { validateCareerEventPreClose } from "./preCloseGuards";
import type {
  CareerEventAssertionFailure,
  CareerEventPipelineResult,
  FinalizeCareerEventInput,
} from "./types";
import { CAREER_EVENT_KIND_TO_TIPO, getAssertionSeverity } from "./types";

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
    const code =
      error.confidence === "REVIEW"
        ? "ambiguous_profile_link"
        : "career_integrity_blocked";
    return {
      code,
      message: error.message,
      jugadorId: error.jugadorId,
      severity: getAssertionSeverity(code),
      details: {
        ...error.toStructuredLog(),
        kind: input.kind,
      },
    };
  }
  return {
    code: "career_integrity_blocked",
    message: error instanceof Error ? error.message : String(error),
    severity: "critical",
    details: { kind: input.kind },
  };
}

function normalizeFailures(
  failures: CareerEventAssertionFailure[]
): CareerEventAssertionFailure[] {
  return failures.map((f) => ({
    ...f,
    severity: f.severity ?? getAssertionSeverity(f.code),
  }));
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

  // Caso excepcional documentado: preCloseGuards.test.ts espía
  // específicamente console.info (busca call[1] === "complete"; contrato
  // de test existente, no se toca el test para esta limpieza de logs).
  // eslint-disable-next-line no-console -- ver preCloseGuards.test.ts:187,206 (spyOn console.info)
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
  let excludedFromPreClose: string[] = [];
  let eventBlocked = false;

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
    failures.push(...preClose.failures);
    excludedFromPreClose = preClose.excludedJugadorIds;
    eventBlocked = preClose.eventBlocked;
  }

  if (!eventBlocked) {
    try {
      syncResult = await runCareerEventSync(input, {
        excludeJugadorIds: excludedFromPreClose,
      });
      if (syncResult.syncFailures?.length) {
        failures.push(...syncResult.syncFailures);
      }
      if (syncResult.syncError) {
        failures.push({
          code: "sync_failed",
          message: syncResult.syncError,
          severity: "critical",
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
    // Cerrar el evento escribe nuevas jugador_participaciones para cada
    // jugador tocado: el historial cacheado en careerIdentityCache quedaría
    // incompleto (sin la participación recién creada) si no se invalida.
    invalidatePlayersPool(input.organizadorId);
    for (const id of touchedJugadorIds) {
      invalidateCareerIdentityCacheForPlayer(id);
    }
  }

  if (!options.skipAssertions && syncResult && touchedJugadorIds.length > 0) {
    const assertionFailures = await assertCareerEventIntegrity({
      context: syncResult.context,
      touchedJugadorIds,
      requireRating: options.requireRating ?? defaultRequireRating(input),
      ratingPartidoRefs:
        options.ratingPartidoRefs ?? defaultRatingPartidoRefs(input),
    });
    if (assertionFailures?.length) {
      failures.push(...assertionFailures);
    }
  }

  clearOrganizerDisplayNameCache();

  const normalized = normalizeFailures(failures);
  const { criticalFailures, warnings } = partitionAssertionFailures(normalized);
  const processed =
    Boolean(syncResult) &&
    !syncResult?.syncError &&
    touchedJugadorIds.length > 0;
  const ok = criticalFailures.length === 0 && !eventBlocked;
  const durationMs = Date.now() - started;

  const result: CareerEventPipelineResult = {
    ok,
    processed,
    resultSaved: !eventBlocked && Boolean(syncResult),
    careerSynced: ok && processed,
    context:
      syncResult?.context ?? {
        kind: input.kind,
        organizadorId: input.organizadorId,
        hostOrganizadorId: input.organizadorId,
        eventoId: "",
        tipoEvento: CAREER_EVENT_KIND_TO_TIPO[input.kind],
      },
    touchedJugadorIds,
    failures: normalized,
    criticalFailures,
    warnings,
    durationMs,
  };

  if (!ok) {
    console.error(LOG_PREFIX, "incomplete", {
      ...result,
      warningCount: warnings.length,
      criticalCount: criticalFailures.length,
    });
  } else if (warnings.length > 0) {
    console.warn(LOG_PREFIX, "complete_with_warnings", {
      kind: input.kind,
      eventoId: syncResult?.context.eventoId,
      players: touchedJugadorIds.length,
      warnings,
      durationMs,
    });
  } else {
    // eslint-disable-next-line no-console -- ver preCloseGuards.test.ts:187,206 (spyOn console.info)
    console.info(LOG_PREFIX, "complete", {
      kind: input.kind,
      eventoId: syncResult?.context.eventoId,
      players: touchedJugadorIds.length,
      durationMs,
    });
  }

  return result;
}
