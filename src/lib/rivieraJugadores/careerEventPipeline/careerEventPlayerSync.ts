import { errorMessage } from "../../errors/normalizeError";
import {
  CareerIntegrityException,
  isCareerIntegrityException,
} from "../careerIntegrity";
import {
  resolveJugadorIdForParticipacion,
  type ResolveJugadorIdForParticipacionParams,
} from "../jugadorIdResolver";
import type { CareerEventAssertionFailure } from "./types";

function supabaseErrorFields(error: unknown): {
  code?: string;
  message?: string;
  details?: unknown;
  hint?: unknown;
} {
  if (!error || typeof error !== "object") return {};
  const e = error as {
    code?: string;
    message?: string;
    details?: unknown;
    hint?: unknown;
  };
  return {
    ...(e.code != null ? { code: String(e.code) } : {}),
    ...(e.message != null ? { message: String(e.message) } : {}),
    ...(e.details !== undefined ? { details: e.details } : {}),
    ...(e.hint !== undefined ? { hint: e.hint } : {}),
  };
}

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
  const pg = supabaseErrorFields(error);
  const baseMessage = pg.message ?? errorMessage(error);
  const who =
    ctx.nombre?.trim() ||
    (ctx.jugadorId ? `jugador ${ctx.jugadorId.slice(0, 8)}…` : null);
  return {
    code: "sync_failed",
    message: who
      ? `No se pudo sincronizar a ${who}: ${baseMessage}`
      : baseMessage,
    jugadorId: ctx.jugadorId,
    details: {
      ...(ctx.kind ? { kind: ctx.kind } : {}),
      ...(ctx.nombre ? { nombre: ctx.nombre } : {}),
      ...(ctx.legacyPlayerId ? { legacyPlayerId: ctx.legacyPlayerId } : {}),
      ...(pg.code ? { code: pg.code } : {}),
      ...(pg.message ? { message: pg.message } : {}),
      ...(pg.details !== undefined ? { details: pg.details } : {}),
      ...(pg.hint !== undefined ? { hint: pg.hint } : {}),
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

/** Límite de escritura concurrente al cerrar (idempotente por jugador/evento). */
const PLAYER_PARTICIPACION_SYNC_CONCURRENCY = 6;

async function mapSettledWithConcurrency(
  items: ParallelPlayerParticipacionItem[],
  concurrency: number
): Promise<PromiseSettledResult<PlayerParticipacionSyncResult>[]> {
  const results: PromiseSettledResult<PlayerParticipacionSyncResult>[] =
    new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      const { ctx, fn } = items[index];
      try {
        const value = await runPlayerParticipacionSyncIsolated(ctx, fn);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/** Ejecuta sync de jugadores en paralelo acotado; mergea failures al final. */
export async function runParallelPlayerParticipacionSync(
  items: ParallelPlayerParticipacionItem[]
): Promise<{
  touchedJugadorIds: string[];
  syncFailures: CareerEventAssertionFailure[];
}> {
  const outcomes = await mapSettledWithConcurrency(
    items,
    PLAYER_PARTICIPACION_SYNC_CONCURRENCY
  );

  const touchedJugadorIds: string[] = [];
  const syncFailures: CareerEventAssertionFailure[] = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === "rejected") {
      syncFailures.push(
        careerAssertionFailureFromError(outcome.reason, items[i]?.ctx)
      );
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
