import { supabase } from "../supabaseClient";
import { errorMessage, toError } from "../errors/normalizeError";
import { isTransientError, retryTransient } from "../errors/retryTransient";
import {
  CareerIntegrityException,
  mapConfidenceToIntegrityCode,
  type ProfileLinkConfidence,
  type ProfileLinkResolution,
} from "./careerIntegrity";

const LOG_PREFIX = "[career-integrity:profile-link]";

function isMissingLinkRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("ensure_official_profile_link_for_participacion")
  );
}

function parseConfidence(raw: unknown): ProfileLinkConfidence {
  const value = String(raw ?? "").toUpperCase();
  if (value === "OK" || value === "HIGH" || value === "REVIEW" || value === "LOW") {
    return value;
  }
  return "LOW";
}

export function parseProfileLinkResolution(raw: unknown): ProfileLinkResolution {
  if (!raw || typeof raw !== "object") {
    return {
      linked: false,
      confidence: "LOW",
      reason: "invalid_response",
      actionSugerida: "INSUFFICIENT_EVIDENCE",
    };
  }
  const row = raw as Record<string, unknown>;
  const confidence = parseConfidence(row.confidence);
  return {
    linked: row.linked === true,
    alreadyLinked: row.already_linked === true,
    linkCreated: row.link_created === true,
    confidence,
    reason: typeof row.reason === "string" ? row.reason : "unknown",
    actionSugerida:
      typeof row.action_sugerida === "string" ? row.action_sugerida : undefined,
    jugadorId: typeof row.jugador_id === "string" ? row.jugador_id : undefined,
    jugadorNombre:
      typeof row.jugador_nombre === "string" ? row.jugador_nombre : undefined,
    officialPlayerKey:
      typeof row.official_player_key === "string"
        ? row.official_player_key
        : undefined,
    rivieraId: typeof row.riviera_id === "string" ? row.riviera_id : undefined,
    candidateCount:
      typeof row.candidate_count === "number"
        ? row.candidate_count
        : Number(row.candidate_count) || undefined,
    candidateRivieraId:
      typeof row.candidate_riviera_id === "string"
        ? row.candidate_riviera_id
        : undefined,
    details: {
      grant_to_canonical: row.grant_to_canonical,
      grant_to_identity: row.grant_to_identity,
      same_legacy: row.same_legacy,
      host_club_overlap: row.host_club_overlap,
      cross_club_profile: row.cross_club_profile,
    },
  };
}

/**
 * Intenta enlazar perfil (solo HIGH con evidencia fuerte). No lanza.
 */
export async function ensureOfficialProfileLinkForParticipacion(
  jugadorId: string,
  organizadorId: string
): Promise<ProfileLinkResolution> {
  const id = jugadorId?.trim();
  const org = organizadorId?.trim();
  if (!id) {
    return {
      linked: false,
      confidence: "LOW",
      reason: "missing_jugador_id",
      actionSugerida: "INSUFFICIENT_EVIDENCE",
    };
  }

  // Reintento acotado solo para fallos transitorios (ver retryTransient):
  // esta RPC corre por jugador al cerrar y un blip de red hacía fallar el
  // cierre entero con un mensaje engañoso de "identidad inválida".
  const { data, error } = await retryTransient(
    async () => {
      const response = await supabase.rpc(
        "ensure_official_profile_link_for_participacion",
        {
          p_jugador_id: id,
          p_organizador_id: org || null,
        }
      );
      if (response.error && isTransientError(response.error)) {
        throw toError(response.error, "ensure_official_profile_link");
      }
      return response;
    },
    { label: `ensure_official_profile_link(${id})` }
  ).catch((e) => ({ data: null, error: e as { message?: string } }));

  if (error) {
    if (isMissingLinkRpcError(error)) {
      return {
        linked: false,
        confidence: "LOW",
        reason: "rpc_not_deployed",
        actionSugerida: "INSUFFICIENT_EVIDENCE",
        jugadorId: id,
      };
    }
    console.warn(LOG_PREFIX, "rpc error:", error);
    return {
      linked: false,
      confidence: "LOW",
      reason: errorMessage(error),
      actionSugerida: "INSUFFICIENT_EVIDENCE",
      jugadorId: id,
    };
  }

  return parseProfileLinkResolution(data);
}

/**
 * Lanza si `result` no cumple el mínimo para escribir participación
 * (REVIEW/LOW → CareerIntegrityException). Extraído de
 * requireOfficialProfileLinkForParticipacion para reusarse cuando `result`
 * viene de un caché de identidad de un solo cierre (closeIdentityCache.ts,
 * incidente 2026-08-06) en vez de una llamada de red fresca -- misma lógica,
 * misma excepción, sin repetir la RPC.
 */
export function assertProfileLinkResolutionOk(
  result: ProfileLinkResolution,
  jugadorId: string,
  organizadorId: string
): void {
  if (result.linked && (result.alreadyLinked || result.linkCreated || result.confidence === "OK")) {
    return;
  }

  if (result.reason === "rpc_not_deployed") {
    throw new CareerIntegrityException({
      code: "rpc_not_deployed",
      message: "RPC ensure_official_profile_link_for_participacion no desplegado",
      confidence: "LOW",
      reason: result.reason,
      actionSugerida: result.actionSugerida,
      jugadorId,
      organizadorId,
      details: result.details,
    });
  }

  if (result.reason === "permission_denied") {
    throw new CareerIntegrityException({
      code: "permission_denied",
      message: `Sin permiso para enlazar perfil ${jugadorId}`,
      confidence: "LOW",
      reason: result.reason,
      actionSugerida: result.actionSugerida,
      jugadorId,
      organizadorId,
      details: result.details,
    });
  }

  const confidence = result.confidence;
  const code = mapConfidenceToIntegrityCode(confidence);

  console.error(LOG_PREFIX, "blocked", {
    ...result,
    jugadorId,
    organizadorId,
  });

  throw new CareerIntegrityException({
    code,
    message: `Perfil sin enlace oficial seguro (${confidence}): ${result.reason}`,
    confidence,
    reason: result.reason,
    actionSugerida: result.actionSugerida,
    jugadorId,
    organizadorId,
    details: {
      candidate_count: result.candidateCount,
      candidate_riviera_id: result.candidateRivieraId,
      ...result.details,
    },
  });
}

/**
 * Exige profile_link antes de escribir participación.
 * REVIEW/LOW → CareerIntegrityException (sin participación).
 */
export async function requireOfficialProfileLinkForParticipacion(
  jugadorId: string,
  organizadorId: string
): Promise<ProfileLinkResolution> {
  const result = await ensureOfficialProfileLinkForParticipacion(
    jugadorId,
    organizadorId
  );
  assertProfileLinkResolutionOk(result, jugadorId, organizadorId);
  return result;
}

export type { ProfileLinkResolution };
