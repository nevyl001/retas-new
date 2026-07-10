import {
  CareerIntegrityException,
  isCareerIntegrityException,
} from "../careerIntegrity";
import {
  resolveJugadorIdForParticipacion,
  type ResolveJugadorIdForParticipacionParams,
} from "../jugadorIdResolver";
import type { CareerEventAssertionFailure } from "./types";

export function careerAssertionFailureFromError(
  error: unknown,
  ctx: {
    jugadorId?: string;
    nombre?: string;
    legacyPlayerId?: string;
    kind?: string;
  } = {}
): CareerEventAssertionFailure {
  if (isCareerIntegrityException(error)) {
    return {
      code:
        error.confidence === "REVIEW"
          ? "ambiguous_profile_link"
          : "career_integrity_blocked",
      message: error.message,
      jugadorId: error.jugadorId ?? ctx.jugadorId,
      details: {
        ...error.toStructuredLog(),
        ...(ctx.kind ? { kind: ctx.kind } : {}),
        ...(ctx.nombre ? { nombre: ctx.nombre } : {}),
        ...(ctx.legacyPlayerId ? { legacyPlayerId: ctx.legacyPlayerId } : {}),
      },
    };
  }
  return {
    code: "career_integrity_blocked",
    message: error instanceof Error ? error.message : String(error),
    jugadorId: ctx.jugadorId,
    details: {
      ...(ctx.kind ? { kind: ctx.kind } : {}),
      ...(ctx.nombre ? { nombre: ctx.nombre } : {}),
      ...(ctx.legacyPlayerId ? { legacyPlayerId: ctx.legacyPlayerId } : {}),
    },
  };
}

export type ResolveJugadorForEventSyncResult = {
  jugadorId: string | null;
  failure?: CareerEventAssertionFailure;
};

/** Resuelve jugador para sync; nunca lanza — devuelve failure aislado. */
export async function resolveJugadorForEventSync(
  params: ResolveJugadorIdForParticipacionParams,
  excludedJugadorIds?: ReadonlySet<string>
): Promise<ResolveJugadorForEventSyncResult> {
  try {
    const jugadorId = await resolveJugadorIdForParticipacion(params);
    if (!jugadorId) {
      return { jugadorId: null };
    }
    if (excludedJugadorIds?.has(jugadorId)) {
      return { jugadorId: null };
    }
    return { jugadorId };
  } catch (error) {
    if (error instanceof CareerIntegrityException) {
      console.error("[career-event-player-sync] resolve blocked", error.toStructuredLog());
    }
    return {
      jugadorId: null,
      failure: careerAssertionFailureFromError(error, {
        jugadorId: params.jugadorId ?? undefined,
        nombre: params.nombre,
        legacyPlayerId: params.legacyPlayerId,
        kind: params.tipoEvento,
      }),
    };
  }
}

export type PlayerParticipacionSyncResult = {
  jugadorId?: string;
  failure?: CareerEventAssertionFailure;
};

export type ParallelPlayerParticipacionItem = {
  ctx: { jugadorId?: string; nombre?: string; legacyPlayerId?: string };
  fn: () => Promise<PlayerParticipacionSyncResult | void>;
};

/** Ejecuta escritura de un jugador; captura excepciones sin abortar el batch. */
export async function runPlayerParticipacionSync(
  failures: CareerEventAssertionFailure[],
  ctx: { jugadorId?: string; nombre?: string; legacyPlayerId?: string },
  fn: () => Promise<void>
): Promise<boolean> {
  const result = await runPlayerParticipacionSyncIsolated(ctx, async () => {
    await fn();
    return {};
  });
  if (result.failure) {
    failures.push(result.failure);
    return false;
  }
  return true;
}

/**
 * Variante sin mutación compartida: devuelve failure/jugadorId del jugador.
 * Usar con Promise.allSettled vía runParallelPlayerParticipacionSync.
 */
export async function runPlayerParticipacionSyncIsolated(
  ctx: { jugadorId?: string; nombre?: string; legacyPlayerId?: string },
  fn: () => Promise<PlayerParticipacionSyncResult | void>
): Promise<PlayerParticipacionSyncResult> {
  try {
    const result = await fn();
    if (result && typeof result === "object") {
      return result;
    }
    return {};
  } catch (error) {
    if (error instanceof CareerIntegrityException) {
      console.error("[career-event-player-sync] write blocked", error.toStructuredLog());
    } else {
      console.error("[career-event-player-sync] write error", error);
    }
    return { failure: careerAssertionFailureFromError(error, ctx) };
  }
}

/** Ejecuta sync de jugadores en paralelo; mergea failures al final sin mutación en map(). */
export async function runParallelPlayerParticipacionSync(
  items: ParallelPlayerParticipacionItem[]
): Promise<{
  touchedJugadorIds: string[];
  syncFailures: CareerEventAssertionFailure[];
}> {
  const outcomes = await Promise.allSettled(
    items.map(({ ctx, fn }) => runPlayerParticipacionSyncIsolated(ctx, fn))
  );

  const touchedJugadorIds: string[] = [];
  const syncFailures: CareerEventAssertionFailure[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      syncFailures.push({
        code: "career_integrity_blocked",
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason),
      });
      continue;
    }
    const result = outcome.value;
    if (result.failure) {
      syncFailures.push(result.failure);
    }
    if (result.jugadorId) {
      touchedJugadorIds.push(result.jugadorId);
    }
  }

  return { touchedJugadorIds, syncFailures };
}

export function toExcludedJugadorIdSet(
  ids: Iterable<string> | undefined
): ReadonlySet<string> | undefined {
  if (!ids) return undefined;
  const set = new Set(Array.from(ids).filter(Boolean));
  return set.size > 0 ? set : undefined;
}
