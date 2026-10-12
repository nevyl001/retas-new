/**
 * Modelo de autorización y reglas de seguridad multiclub para Riviera Rewards.
 * Complementa y refleja las restricciones de base de datos de la migración 0058.
 */

export interface SecurityActor {
  userId: string;
  isMasterAdmin: boolean;
}

export interface PlayerClubContext {
  jugadorId: string;
  homeOrganizadorId: string;
  viewingOrganizadorId: string;
  isConcedido: boolean;
  hasLocalActivity: boolean;
}

export interface LocalCampaignContext {
  campaignOrganizadorId: string;
  puntosDisponibles: number;
  costoPremio: number;
  ventanaCanjeAbierta: boolean;
}

export type AccessDecision = {
  allowed: boolean;
  reason?: "foreign_club_access_denied" | "unauthorized" | "ok";
};

export type RedemptionDecision = {
  allowed: boolean;
  reason?:
    | "foreign_club_access_denied"
    | "redemption_window_closed"
    | "insufficient_balance"
    | "ok";
};

/**
 * Valida si un actor tiene privilegios administrativos para operar sobre un club dado.
 */
export function assertClubAdminAccess(
  actor: SecurityActor,
  targetOrganizadorId: string
): AccessDecision {
  if (actor.isMasterAdmin) {
    return { allowed: true, reason: "ok" };
  }
  if (!actor.userId || actor.userId !== targetOrganizadorId) {
    return { allowed: false, reason: "foreign_club_access_denied" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Valida si se puede emitir una solicitud de canje considerando el actor, el jugador y la campaña.
 */
export function canRequestRedemption(
  actor: SecurityActor,
  playerCtx: PlayerClubContext,
  campaignCtx: LocalCampaignContext
): RedemptionDecision {
  // 1. Debe tener acceso sobre el club de la campaña
  const adminCheck = assertClubAdminAccess(actor, campaignCtx.campaignOrganizadorId);
  if (!adminCheck.allowed) {
    return { allowed: false, reason: "foreign_club_access_denied" };
  }

  // 2. La ventana de canje de la campaña debe estar abierta
  if (!campaignCtx.ventanaCanjeAbierta) {
    return { allowed: false, reason: "redemption_window_closed" };
  }

  // 3. El saldo local disponible en esta campaña debe ser suficiente
  if (campaignCtx.puntosDisponibles < campaignCtx.costoPremio) {
    return { allowed: false, reason: "insufficient_balance" };
  }

  return { allowed: true, reason: "ok" };
}

/**
 * Filtra únicamente las participaciones que pertenecen legítimamente al club activo.
 */
export function filterValidLocalCandidates<T extends { organizadorId: string }>(
  candidates: T[],
  activeOrganizadorId: string
): T[] {
  return candidates.filter((c) => c.organizadorId === activeOrganizadorId);
}
