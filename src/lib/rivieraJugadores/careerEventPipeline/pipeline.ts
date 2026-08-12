import { clearOrganizerDisplayNameCache } from "../../organizer/organizerDisplayName";
import { errorLogPayload, errorMessage } from "../../errors/normalizeError";
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
import { createCloseIdentityCache } from "./closeIdentityCache";
import {
  armPipelineTelemetry,
  disarmPipelineTelemetry,
  isPipelineTelemetryArmed,
  logPipelineTelemetryReport,
  withStage,
} from "./pipelineTelemetry";
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
  // Dedup por jugador ya existía (Set) -- refresh_jugador_stats corre como
  // máximo 1 vez por jugador por cierre. Perf batch-1: el resultado de
  // rebuildJugadorStats no se usa aquí, así que se salta el SELECT de
  // vuelta (skipRefetch) -- 1 round trip menos por jugador tocado.
  const unique = Array.from(new Set(Array.from(jugadorIds).filter(Boolean)));
  await Promise.allSettled(
    unique.map((id) => rebuildJugadorStats(id, { skipRefetch: true }))
  );
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
    message: errorMessage(error),
    severity: "critical",
    details: { kind: input.kind, ...errorLogPayload(error) },
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

/**
 * Alias público del pipeline canónico. Envoltura fina solo para garantizar
 * que, si se armó telemetry, se desarma SIEMPRE (éxito, falla de negocio, o
 * excepción no capturada) -- sin esto una excepción que escape del cuerpo
 * (ej. assertParentEventExists lanzando) deja pipelineTelemetry armada para
 * siempre y pierde el reporte de esa ejecución (bug real encontrado en la
 * primera medición en vivo, incidente 2026-08-06).
 */
export async function processCareerEvent(
  input: FinalizeCareerEventInput
): Promise<CareerEventPipelineResult> {
  const options = input.options ?? {};
  if (!options.telemetry) return processCareerEventInner(input);

  armPipelineTelemetry();
  try {
    return await processCareerEventInner(input);
  } finally {
    if (isPipelineTelemetryArmed()) {
      // El cuerpo no llegó a desarmar (excepción no capturada dentro) --
      // igual se cierra y se loguea lo que se alcanzó a medir.
      const report = disarmPipelineTelemetry(
        (input.kind === "reta" && input.tournament.id) || "",
        0
      );
      if (report) logPipelineTelemetryReport(report);
    }
  }
}

async function processCareerEventInner(
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

  // Incidente 2026-08-06 (reta) + batch-1 perf (2026-08-08, generalizado a
  // las demás modalidades): caché de identidad de UN cierre -- ver
  // closeIdentityCache.ts. Memoiza resolución de jugador +
  // ensure_riviera_identity + ensure_official_profile_link entre
  // pre-close/sync/assertions para no verificar la misma identidad 3-4 veces
  // por jugador. Antes solo se armaba para `kind === "reta"`; duelo_2v2,
  // americano, torneo_express y las variantes de liga sufrían exactamente el
  // mismo patrón sin mitigación. El caché sigue viviendo exclusivamente
  // dentro de esta ejecución de processCareerEvent (no persiste, no cruza
  // cierres, no se comparte entre eventos) -- solo se generalizó A QUÉ kinds
  // aplica, no se cambió su alcance ni su semántica.
  const identityCache = options.identityCache
    ? createCloseIdentityCache(input.organizadorId)
    : undefined;

  let syncResult: Awaited<ReturnType<typeof runCareerEventSync>> | null = null;
  let touchedJugadorIds: string[] = [];
  let excludedFromPreClose: string[] = [];
  let eventBlocked = false;

  if (!options.skipAssertions) {
    const preClose = await withStage("validateParticipantsMs", () =>
      validateCareerEventPreClose(
        input,
        async (ref, organizadorId) =>
          resolveJugadorIdForParticipacion(
            {
              organizadorId,
              jugadorId: ref.jugadorId,
              nombre: ref.nombre,
              legacyPlayerId: ref.legacyPlayerId,
              legacyLigaJugadorId: ref.legacyLigaJugadorId,
              tipoEvento: input.kind,
            },
            identityCache
          ),
        identityCache
      )
    );
    failures.push(...preClose.failures);
    // Opción B: pre-close fallido → cero sync / rating / ledger de cierre
    eventBlocked = preClose.eventBlocked || !preClose.ok;
    excludedFromPreClose = eventBlocked ? [] : preClose.excludedJugadorIds;
  }

  if (!eventBlocked) {
    try {
      syncResult = await runCareerEventSync(input, {
        excludeJugadorIds: excludedFromPreClose,
        identityCache,
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
    await withStage("statisticsMs", () =>
      refreshJugadorStatsBatch(touchedJugadorIds)
    );
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
      identityCache,
    });
    if (assertionFailures?.length) {
      failures.push(...assertionFailures);
    }
  }

  clearOrganizerDisplayNameCache();

  const normalized = normalizeFailures(failures);
  const { criticalFailures, warnings } = partitionAssertionFailures(normalized);
  // processed = persistencia real confirmada (touched), sin syncFailures.
  // No equivale a "se intentó el sync".
  const persisted =
    Boolean(syncResult) &&
    !syncResult?.syncError &&
    !(syncResult?.syncFailures?.length) &&
    touchedJugadorIds.length > 0;
  const processed = persisted;
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

  if (options.telemetry) {
    const report = disarmPipelineTelemetry(
      syncResult?.context.eventoId || "",
      touchedJugadorIds.length
    );
    if (report) logPipelineTelemetryReport(report);
  }

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
