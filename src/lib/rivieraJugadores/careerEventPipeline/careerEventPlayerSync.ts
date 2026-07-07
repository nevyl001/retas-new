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

/** Ejecuta escritura de un jugador; captura excepciones sin abortar el batch. */
export async function runPlayerParticipacionSync(
  failures: CareerEventAssertionFailure[],
  ctx: { jugadorId?: string; nombre?: string; legacyPlayerId?: string },
  fn: () => Promise<void>
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    if (error instanceof CareerIntegrityException) {
      console.error("[career-event-player-sync] write blocked", error.toStructuredLog());
    } else {
      console.error("[career-event-player-sync] write error", error);
    }
    failures.push(careerAssertionFailureFromError(error, ctx));
    return false;
  }
}

export function toExcludedJugadorIdSet(
  ids: Iterable<string> | undefined
): ReadonlySet<string> | undefined {
  if (!ids) return undefined;
  const set = new Set(Array.from(ids).filter(Boolean));
  return set.size > 0 ? set : undefined;
}
