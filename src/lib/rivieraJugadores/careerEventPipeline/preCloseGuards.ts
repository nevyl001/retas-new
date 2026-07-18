import { supabase } from "../../supabaseClient";
import { ensureRivieraIdentity } from "../careerIdentity";
import {
  CareerIntegrityException,
  isCareerIntegrityException,
} from "../careerIntegrity";
import { isValidRivieraId } from "../rivieraIdDisplay";
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { careerAssertionFailureFromError } from "./careerEventPlayerSync";
import type {
  CareerEventAssertionFailure,
  CareerEventKind,
  FinalizeCareerEventInput,
} from "./types";

const LOG_PREFIX = "[career-event-pipeline:pre-close]";

/**
 * DEUDA_FASE_4_ID_TYPES — Branded types recomendados (no implementados en este ciclo):
 *   type RivieraJugadorId = string & { readonly __brand: "riviera_jugadores.id" }
 *   type LegacyPlayerId = string & { readonly __brand: "players.id" }
 *   type LegacyLigaJugadorId = string & { readonly __brand: "liga_jugadores.id" }
 * Evitarían pasar players.id / liga_jugadores.id en el campo jugadorId a nivel de tipo.
 */

/** Ref tipada para pre-close / resolve. Nombre = solo display/diagnóstico. */
export type ProspectiveJugadorRef = {
  /** Exclusivamente public.riviera_jugadores.id */
  jugadorId?: string;
  /** Exclusivamente public.players.id */
  legacyPlayerId?: string;
  /** Exclusivamente public.liga_jugadores.id */
  legacyLigaJugadorId?: string;
  /** Solo presentación / mensajes de error */
  nombre?: string;
};

export type PreCloseValidationResult = {
  /** true solo si no hay fallas y el sync puede intentarse */
  ok: boolean;
  failures: CareerEventAssertionFailure[];
  /** Reservado: con bloqueo total queda vacío (sync no corre). */
  excludedJugadorIds: string[];
  /** true → el pipeline NO debe ejecutar sync/rating/ledger de cierre */
  eventBlocked: boolean;
};

const KIND_CLOSE_LABEL: Record<CareerEventKind, string> = {
  reta: "la reta",
  duelo_2v2: "el duelo",
  americano: "el americano",
  torneo_express: "el torneo express",
  liga_jornada: "la jornada",
  liga_podio: "la liga",
  liga_inscripcion: "la inscripción",
};

export function formatIdentityPreCloseMessage(params: {
  kind: CareerEventKind | string;
  nombre?: string | null;
  reason?: string;
}): string {
  const mode =
    KIND_CLOSE_LABEL[params.kind as CareerEventKind] ?? "el evento";
  const who = params.nombre?.trim()
    ? `«${params.nombre.trim()}»`
    : "un jugador";
  return (
    `No se pudo cerrar ${mode} porque ${who} no tiene una identidad Riviera válida. ` +
    `Vuelve a seleccionarlo o vincula su Riviera ID y vuelve a intentar.` +
    (params.reason?.trim() ? ` (${params.reason.trim()})` : "")
  );
}

async function assertParentEventExists(
  input: FinalizeCareerEventInput
): Promise<CareerEventAssertionFailure | null> {
  const org = input.organizadorId.trim();

  try {
    switch (input.kind) {
      case "reta": {
        const { data, error } = await supabase
          .from("tournaments")
          .select("id")
          .eq("id", input.tournament.id)
          .maybeSingle();
        if (error || !data?.id) {
          return {
            code: "missing_parent_event",
            message: `Reta padre no encontrada: ${input.tournament.id}`,
            details: { kind: input.kind, eventoId: input.tournament.id, org },
          };
        }
        return null;
      }
      case "duelo_2v2": {
        const { data, error } = await supabase
          .from("duelos_2v2")
          .select("id, organizador_id")
          .eq("id", input.duelo.id)
          .maybeSingle();
        if (error || !data?.id) {
          return {
            code: "missing_parent_event",
            message: `Duelo 2v2 padre no encontrado: ${input.duelo.id}`,
            details: { kind: input.kind, eventoId: input.duelo.id },
          };
        }
        return null;
      }
      case "torneo_express": {
        const { data, error } = await supabase
          .from("torneo_express")
          .select("id")
          .eq("id", input.torneoId)
          .maybeSingle();
        if (error || !data?.id) {
          return {
            code: "missing_parent_event",
            message: `Torneo express padre no encontrado: ${input.torneoId}`,
            details: { kind: input.kind, eventoId: input.torneoId },
          };
        }
        return null;
      }
      case "americano": {
        const { data, error } = await supabase
          .from("tournaments")
          .select("id")
          .eq("id", input.sesionId)
          .maybeSingle();
        if (error || !data?.id) {
          return {
            code: "missing_parent_event",
            message: `Americano/sesión padre no encontrada: ${input.sesionId}`,
            details: { kind: input.kind, eventoId: input.sesionId },
          };
        }
        return null;
      }
      case "liga_jornada":
      case "liga_podio":
      case "liga_inscripcion": {
        const { data, error } = await supabase
          .from("ligas")
          .select("id")
          .eq("id", input.ligaId)
          .maybeSingle();
        if (error || !data?.id) {
          return {
            code: "missing_parent_event",
            message: `Liga padre no encontrada: ${input.ligaId}`,
            details: { kind: input.kind, eventoId: input.ligaId },
          };
        }
        return null;
      }
      default:
        return null;
    }
  } catch (e) {
    return {
      code: "missing_parent_event",
      message: `Error validando evento padre: ${String(e)}`,
      details: { kind: input.kind },
    };
  }
}

/**
 * Único productor de refs de pre-close.
 * Contrato de tipado:
 * - jugadorId → riviera_jugadores.id
 * - legacyPlayerId → players.id
 * - legacyLigaJugadorId → liga_jugadores.id
 */
export function collectProspectiveJugadorRefs(
  input: FinalizeCareerEventInput
): ProspectiveJugadorRef[] {
  const refs: ProspectiveJugadorRef[] = [];

  const push = (r: {
    jugadorId?: string | null;
    nombre?: string | null;
    legacyPlayerId?: string | null;
    legacyLigaJugadorId?: string | null;
  }) => {
    const jugadorId = r.jugadorId?.trim() || undefined;
    const nombre = r.nombre?.trim() || undefined;
    const legacyPlayerId = r.legacyPlayerId?.trim() || undefined;
    const legacyLigaJugadorId = r.legacyLigaJugadorId?.trim() || undefined;
    if (jugadorId || nombre || legacyPlayerId || legacyLigaJugadorId) {
      refs.push({ jugadorId, nombre, legacyPlayerId, legacyLigaJugadorId });
    }
  };

  switch (input.kind) {
    case "reta":
      for (const pair of input.pairs) {
        // players.id → solo legacyPlayerId (nunca jugadorId)
        push({
          nombre: pair.player1_name,
          legacyPlayerId: pair.player1_id,
        });
        push({
          nombre: pair.player2_name,
          legacyPlayerId: pair.player2_id,
        });
      }
      break;
    case "duelo_2v2": {
      const d = input.duelo;
      // pareja_*_j*_id = riviera_jugadores.id
      push({ jugadorId: d.pareja_a_j1_id, nombre: d.pareja_a_j1_nombre });
      push({ jugadorId: d.pareja_a_j2_id, nombre: d.pareja_a_j2_nombre });
      push({ jugadorId: d.pareja_b_j1_id, nombre: d.pareja_b_j1_nombre });
      push({ jugadorId: d.pareja_b_j2_id, nombre: d.pareja_b_j2_nombre });
      break;
    }
    case "americano":
      for (const p of input.roster) {
        // AmericanoPlayer.id = players.id
        push({ nombre: p.name, legacyPlayerId: p.id });
      }
      break;
    case "liga_inscripcion":
      // input.jugadorId en FinalizeCareerEventInput = liga_jugadores.id
      push({ legacyLigaJugadorId: input.jugadorId });
      break;
    default:
      break;
  }

  return refs;
}

async function assertJugadorCareerIntegrity(
  jugadorId: string,
  organizadorId: string,
  ctx: { kind: CareerEventKind; nombre?: string }
): Promise<CareerEventAssertionFailure | null> {
  try {
    await ensureRivieraIdentity(jugadorId);
    const linkResult = await requireOfficialProfileLinkForParticipacion(
      jugadorId,
      organizadorId
    );

    const officialPlayerKey = linkResult.officialPlayerKey;
    if (!officialPlayerKey) {
      return {
        code: "missing_player_identity",
        message: formatIdentityPreCloseMessage({
          kind: ctx.kind,
          nombre: ctx.nombre,
          reason: "sin official_player_key",
        }),
        jugadorId,
        details: { kind: ctx.kind, nombre: ctx.nombre },
      };
    }

    const rivieraId = linkResult.rivieraId ?? null;
    if (!rivieraId || !isValidRivieraId(rivieraId)) {
      return {
        code: "missing_riviera_id",
        message: formatIdentityPreCloseMessage({
          kind: ctx.kind,
          nombre: ctx.nombre,
          reason: "sin Riviera ID válido",
        }),
        jugadorId,
        details: {
          kind: ctx.kind,
          nombre: ctx.nombre,
          official_player_key: officialPlayerKey,
        },
      };
    }

    return null;
  } catch (e) {
    if (isCareerIntegrityException(e)) {
      console.error(LOG_PREFIX, e.toStructuredLog());
      return {
        code:
          e.confidence === "REVIEW"
            ? "ambiguous_profile_link"
            : "career_integrity_blocked",
        message: formatIdentityPreCloseMessage({
          kind: ctx.kind,
          nombre: ctx.nombre,
          reason: e.message,
        }),
        jugadorId,
        details: { ...e.toStructuredLog(), kind: ctx.kind, nombre: ctx.nombre },
      };
    }
    return {
      code: "career_integrity_blocked",
      message: formatIdentityPreCloseMessage({
        kind: ctx.kind,
        nombre: ctx.nombre,
        reason: String(e),
      }),
      jugadorId,
      details: { kind: ctx.kind, nombre: ctx.nombre },
    };
  }
}

/**
 * Validación pre-cierre: evento padre + integridad de carrera por jugador.
 * Si hay CUALQUIER falla → ok=false, eventBlocked=true (cero sync).
 */
export async function validateCareerEventPreClose(
  input: FinalizeCareerEventInput,
  resolveParticipant: (
    ref: ProspectiveJugadorRef,
    organizadorId: string
  ) => Promise<string | null>
): Promise<PreCloseValidationResult> {
  const failures: CareerEventAssertionFailure[] = [];
  const org = input.organizadorId.trim();

  const parentFailure = await assertParentEventExists(input);
  if (parentFailure) {
    failures.push(parentFailure);
    console.error(LOG_PREFIX, "pre-close event blocked", {
      kind: input.kind,
      failure: parentFailure,
    });
    return {
      ok: false,
      failures,
      excludedJugadorIds: [],
      eventBlocked: true,
    };
  }

  const refs = collectProspectiveJugadorRefs(input);
  const resolvedIds = new Set<string>();

  for (const ref of refs) {
    let resolvedId: string | null = null;
    try {
      resolvedId = await resolveParticipant(ref, org);
    } catch (error) {
      const base = careerAssertionFailureFromError(error, {
        nombre: ref.nombre,
        legacyPlayerId: ref.legacyPlayerId,
        kind: input.kind,
      });
      failures.push({
        ...base,
        message: formatIdentityPreCloseMessage({
          kind: input.kind,
          nombre: ref.nombre,
          reason: base.message,
        }),
        details: {
          ...base.details,
          legacyLigaJugadorId: ref.legacyLigaJugadorId,
          actionSugerida:
            "Vuelve a seleccionar al jugador o vincula su Riviera ID",
        },
      });
      continue;
    }

    if (!resolvedId) {
      failures.push({
        code: "missing_player_identity",
        message: formatIdentityPreCloseMessage({
          kind: input.kind,
          nombre: ref.nombre,
          reason: "identidad no resoluble con IDs fuertes",
        }),
        details: {
          kind: input.kind,
          nombre: ref.nombre,
          legacyPlayerId: ref.legacyPlayerId,
          legacyLigaJugadorId: ref.legacyLigaJugadorId,
          jugadorId: ref.jugadorId,
          actionSugerida:
            "Vuelve a seleccionar al jugador o vincula su Riviera ID",
        },
      });
      continue;
    }

    if (resolvedIds.has(resolvedId)) continue;
    resolvedIds.add(resolvedId);

    const playerFailure = await assertJugadorCareerIntegrity(
      resolvedId,
      org,
      { kind: input.kind, nombre: ref.nombre }
    );
    if (playerFailure) {
      failures.push(playerFailure);
    }
  }

  if (failures.length > 0) {
    console.warn(LOG_PREFIX, "pre-close blocked — sync will not run", {
      kind: input.kind,
      failureCount: failures.length,
      failures,
    });
    return {
      ok: false,
      failures,
      excludedJugadorIds: [],
      eventBlocked: true,
    };
  }

  return {
    ok: true,
    failures: [],
    excludedJugadorIds: [],
    eventBlocked: false,
  };
}

export { CareerIntegrityException };
