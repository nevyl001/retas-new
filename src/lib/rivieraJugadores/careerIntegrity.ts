export type ProfileLinkConfidence = "OK" | "HIGH" | "REVIEW" | "LOW";

export type ProfileLinkResolution = {
  linked: boolean;
  alreadyLinked?: boolean;
  linkCreated?: boolean;
  confidence: ProfileLinkConfidence;
  reason: string;
  actionSugerida?: string;
  jugadorId?: string;
  jugadorNombre?: string;
  officialPlayerKey?: string;
  rivieraId?: string;
  candidateCount?: number;
  candidateRivieraId?: string;
  details?: Record<string, unknown>;
};

export type CareerIntegrityCode =
  | "missing_profile_link"
  | "ambiguous_profile_link"
  | "insufficient_link_evidence"
  | "missing_riviera_id"
  | "missing_official_player_key"
  | "missing_parent_event"
  | "permission_denied"
  | "rpc_not_deployed";

/** Error estructurado cuando la carrera no puede garantizarse antes de escribir datos. */
export class CareerIntegrityException extends Error {
  readonly code: CareerIntegrityCode;
  readonly confidence: ProfileLinkConfidence;
  readonly reason: string;
  readonly actionSugerida?: string;
  readonly jugadorId?: string;
  readonly organizadorId?: string;
  readonly details?: Record<string, unknown>;

  constructor(params: {
    code: CareerIntegrityCode;
    message: string;
    confidence: ProfileLinkConfidence;
    reason: string;
    actionSugerida?: string;
    jugadorId?: string;
    organizadorId?: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = "CareerIntegrityException";
    this.code = params.code;
    this.confidence = params.confidence;
    this.reason = params.reason;
    this.actionSugerida = params.actionSugerida;
    this.jugadorId = params.jugadorId;
    this.organizadorId = params.organizadorId;
    this.details = params.details;
  }

  toStructuredLog(): Record<string, unknown> {
    return {
      type: "career_integrity_failure",
      code: this.code,
      confidence: this.confidence,
      reason: this.reason,
      action_sugerida: this.actionSugerida,
      jugador_id: this.jugadorId,
      organizador_id: this.organizadorId,
      message: this.message,
      details: this.details,
    };
  }
}

export function isCareerIntegrityException(
  error: unknown
): error is CareerIntegrityException {
  return error instanceof CareerIntegrityException;
}

export function mapConfidenceToIntegrityCode(
  confidence: ProfileLinkConfidence
): CareerIntegrityCode {
  if (confidence === "REVIEW") return "ambiguous_profile_link";
  if (confidence === "LOW") return "insufficient_link_evidence";
  return "missing_profile_link";
}
