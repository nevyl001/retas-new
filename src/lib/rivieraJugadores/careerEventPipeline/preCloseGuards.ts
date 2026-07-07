import { supabase } from "../../supabaseClient";
import { ensureRivieraIdentity } from "../careerIdentity";
import {
  CareerIntegrityException,
  isCareerIntegrityException,
} from "../careerIntegrity";
import { isValidRivieraId } from "../rivieraIdDisplay";
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import { careerAssertionFailureFromError } from "./careerEventPlayerSync";
import type { CareerEventAssertionFailure, FinalizeCareerEventInput } from "./types";

const LOG_PREFIX = "[career-event-pipeline:pre-close]";

export type PreCloseValidationResult = {
  /** true solo si el evento padre existe y el sync puede intentarse */
  ok: boolean;
  failures: CareerEventAssertionFailure[];
  /** Jugadores que no pasaron integridad — excluidos del sync de este evento */
  excludedJugadorIds: string[];
  /** Fallo a nivel evento (padre ausente) — bloquea sync para todos */
  eventBlocked: boolean;
};

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

function collectProspectiveJugadorRefs(
  input: FinalizeCareerEventInput
): Array<{ jugadorId?: string; nombre?: string; legacyPlayerId?: string }> {
  const refs: Array<{
    jugadorId?: string;
    nombre?: string;
    legacyPlayerId?: string;
  }> = [];

  const push = (r: {
    jugadorId?: string | null;
    nombre?: string | null;
    legacyPlayerId?: string | null;
  }) => {
    const jugadorId = r.jugadorId?.trim() || undefined;
    const nombre = r.nombre?.trim() || undefined;
    const legacyPlayerId = r.legacyPlayerId?.trim() || undefined;
    if (jugadorId || nombre || legacyPlayerId) {
      refs.push({ jugadorId, nombre, legacyPlayerId });
    }
  };

  switch (input.kind) {
    case "reta":
      for (const pair of input.pairs) {
        push({
          jugadorId: pair.player1_id,
          nombre: pair.player1_name,
          legacyPlayerId: pair.player1_id,
        });
        push({
          jugadorId: pair.player2_id,
          nombre: pair.player2_name,
          legacyPlayerId: pair.player2_id,
        });
      }
      break;
    case "duelo_2v2": {
      const d = input.duelo;
      push({ jugadorId: d.pareja_a_j1_id, nombre: d.pareja_a_j1_nombre });
      push({ jugadorId: d.pareja_a_j2_id, nombre: d.pareja_a_j2_nombre });
      push({ jugadorId: d.pareja_b_j1_id, nombre: d.pareja_b_j1_nombre });
      push({ jugadorId: d.pareja_b_j2_id, nombre: d.pareja_b_j2_nombre });
      break;
    }
    case "americano":
      for (const p of input.roster) {
        push({ nombre: p.name, legacyPlayerId: p.id });
      }
      break;
    case "liga_inscripcion":
      push({ jugadorId: input.jugadorId });
      break;
    default:
      break;
  }

  return refs;
}

async function assertJugadorCareerIntegrity(
  jugadorId: string,
  organizadorId: string
): Promise<CareerEventAssertionFailure | null> {
  try {
    await ensureRivieraIdentity(jugadorId);
    await requireOfficialProfileLinkForParticipacion(jugadorId, organizadorId);

    const { data: link } = await supabase
      .from("riviera_official_player_profile_link")
      .select("official_player_key")
      .eq("riviera_jugador_id", jugadorId)
      .maybeSingle();

    if (!link?.official_player_key) {
      return {
        code: "missing_player_identity",
        message: `Sin official_player_key tras enlace: ${jugadorId}`,
        jugadorId,
      };
    }

    const { data: identity } = await supabase
      .from("riviera_official_player_identity")
      .select("riviera_id, official_player_key")
      .eq("official_player_key", link.official_player_key)
      .maybeSingle();

    const rivieraId =
      typeof identity?.riviera_id === "string" ? identity.riviera_id : null;
    if (!rivieraId || !isValidRivieraId(rivieraId)) {
      return {
        code: "missing_riviera_id",
        message: `Sin Riviera ID válido para jugador ${jugadorId}`,
        jugadorId,
        details: { official_player_key: link.official_player_key },
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
        message: e.message,
        jugadorId,
        details: e.toStructuredLog(),
      };
    }
    return {
      code: "career_integrity_blocked",
      message: `Error de integridad para ${jugadorId}: ${String(e)}`,
      jugadorId,
    };
  }
}

/**
 * Validación pre-cierre: evento padre + integridad de carrera por jugador participante.
 * Debe ejecutarse ANTES de sync/rating/puntos.
 */
export async function validateCareerEventPreClose(
  input: FinalizeCareerEventInput,
  resolveParticipant: (
    ref: { jugadorId?: string; nombre?: string; legacyPlayerId?: string },
    organizadorId: string
  ) => Promise<string | null>
): Promise<PreCloseValidationResult> {
  const failures: CareerEventAssertionFailure[] = [];
  const excludedJugadorIds: string[] = [];
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
      excludedJugadorIds,
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
      failures.push(
        careerAssertionFailureFromError(error, {
          nombre: ref.nombre,
          legacyPlayerId: ref.legacyPlayerId,
          kind: input.kind,
        })
      );
      continue;
    }
    if (!resolvedId) continue;
    if (resolvedIds.has(resolvedId)) continue;
    resolvedIds.add(resolvedId);

    const playerFailure = await assertJugadorCareerIntegrity(resolvedId, org);
    if (playerFailure) {
      failures.push(playerFailure);
      excludedJugadorIds.push(resolvedId);
    }
  }

  if (failures.length > 0) {
    console.warn(LOG_PREFIX, "pre-close player exclusions", {
      kind: input.kind,
      excludedCount: excludedJugadorIds.length,
      failures,
    });
  }

  return {
    ok: true,
    failures,
    excludedJugadorIds,
    eventBlocked: false,
  };
}

export { CareerIntegrityException };
