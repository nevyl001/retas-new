import { clearOrganizerDisplayNameCache } from "../../organizer/organizerDisplayName";
import { ensureRivieraIdentity } from "../careerIdentity";
import { ensureOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { prepareParticipacionIdentityForOrganizer } from "../jugadorIdResolver";
import { rebuildJugadorStats } from "../rivieraJugadoresService";
import { assertCareerEventIntegrity } from "./assertions";
import { runCareerEventSync } from "./handlers";
import type {
  CareerEventAssertionFailure,
  CareerEventPipelineResult,
  FinalizeCareerEventInput,
} from "./types";

const LOG_PREFIX = "[career-event-pipeline]";

async function refreshJugadorStatsBatch(
  jugadorIds: Iterable<string>
): Promise<void> {
  const unique = Array.from(new Set(Array.from(jugadorIds).filter(Boolean)));
  await Promise.allSettled(unique.map((id) => rebuildJugadorStats(id)));
}

async function ensureIdentitiesForPlayers(
  jugadorIds: string[],
  organizadorId: string
): Promise<void> {
  await Promise.allSettled(
    jugadorIds.map(async (id) => {
      try {
        await ensureOfficialProfileLinkForParticipacion(id, organizadorId);
        await ensureRivieraIdentity(id);
      } catch (e) {
        console.warn(LOG_PREFIX, "ensureIdentitiesForPlayers:", id, e);
      }
    })
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

  const syncResult = await runCareerEventSync(input);

  if (syncResult.syncError) {
    failures.push({
      code: "sync_failed",
      message: syncResult.syncError,
      details: { kind: input.kind },
    });
  }

  const touchedJugadorIds = syncResult.touchedJugadorIds;

  if (!options.skipIdentityEnsure && touchedJugadorIds.length > 0) {
    await ensureIdentitiesForPlayers(touchedJugadorIds, input.organizadorId);
  }

  await refreshJugadorStatsBatch(touchedJugadorIds);

  if (!options.skipAssertions) {
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
    processed: !syncResult.syncError,
    context: syncResult.context,
    touchedJugadorIds,
    failures,
    durationMs,
  };

  if (!ok) {
    console.error(LOG_PREFIX, "incomplete", result);
  } else {
    console.info(LOG_PREFIX, "complete", {
      kind: input.kind,
      eventoId: syncResult.context.eventoId,
      players: touchedJugadorIds.length,
      durationMs,
    });
  }

  return result;
}
